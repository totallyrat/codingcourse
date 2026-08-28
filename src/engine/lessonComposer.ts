import { hashString, mulberry32, shuffle } from './rng';
import { decayedStrength, dueConcepts, dueMistakes, memoryFor } from './scheduler';
import type {
  Course,
  Exercise,
  ExerciseId,
  ExerciseKind,
  Lesson,
  LessonSlot,
  LessonSlotSource,
  Profile,
  Skill,
  SkillId,
  Track,
} from './types';

/* ============================================================================
   Lesson composition — picking ~12 items out of a library of hundreds.

   The order of business, and the reasoning behind it:

   1. Rechecks first claim. Anything you got wrong last lesson is in this one,
      full stop. Capped at 40% of the lesson so a bad day cannot turn the next
      session into nothing but your own mistakes; the overflow keeps its place
      in the queue for the lesson after.
   2. Due reviews. Concepts whose spaced interval has elapsed, weakest first,
      tested with a *different* exercise where one exists.
   3. New material from the current skill, easiest first.
   4. One stretch item, only when you have earned it.

   Then the whole thing is arranged for pacing: a gentle warm-up first, no
   three identical element types in a row, and the hardest item never last.
   ========================================================================== */

export interface ComposeInput {
  profile: Profile;
  course: Course;
  track: Track;
  library: Exercise[];
  /** 'course' advances the syllabus; 'review' drills only weak material. */
  mode?: 'course' | 'review';
  slots?: number;
}

const RECHECK_SHARE = 0.4;

/** How well the learner knows a skill right now, 0..1. */
export function skillMastery(profile: Profile, skill: Skill): number {
  if (!skill.concepts.length) return 0;
  const total = skill.concepts.reduce(
    (sum, c) => sum + decayedStrength(memoryFor(profile, c), profile.lessonIndex),
    0,
  );
  return total / skill.concepts.length;
}

export function isSkillComplete(profile: Profile, skill: Skill): boolean {
  const mastery = skillMastery(profile, skill);
  const allSeen = skill.concepts.every((c) => memoryFor(profile, c).seen >= 2);
  return mastery >= 0.75 && allSeen;
}

/** Whether the learner may open a skill: every prerequisite must be complete. */
export function isSkillUnlocked(profile: Profile, course: Course, track: Track, skillId: SkillId): boolean {
  const skill = track.skills.find((s) => s.id === skillId);
  if (!skill) return false;
  if (course.placed.includes(skillId)) return true;
  return skill.requires.every((req) => {
    const prereq = track.skills.find((s) => s.id === req);
    if (!prereq) return true;
    if (course.placed.includes(req)) return true;
    return isSkillComplete(profile, prereq);
  });
}

/** The next skill the course should teach. */
export function activeSkill(profile: Profile, course: Course, track: Track): Skill {
  const byId = new Map(track.skills.map((s) => [s.id, s]));
  for (const id of course.syllabus) {
    const skill = byId.get(id);
    if (!skill) continue;
    // Placed-out skills are skipped unless the learner has actually shown
    // weakness in them, at which point the course quietly folds them back in.
    if (course.placed.includes(id)) {
      const shaky = skill.concepts.some((c) => {
        const m = memoryFor(profile, c);
        return m.seen > 0 && decayedStrength(m, profile.lessonIndex) < 0.45;
      });
      if (!shaky) continue;
    }
    if (!isSkillComplete(profile, skill)) return skill;
  }
  // Everything is mastered: keep the last skill as a home for review lessons.
  return byId.get(course.syllabus[course.syllabus.length - 1]) ?? track.skills[track.skills.length - 1];
}

interface Indexed {
  byId: Map<ExerciseId, Exercise>;
  byConcept: Map<string, Exercise[]>;
}

export function indexLibrary(library: Exercise[]): Indexed {
  const byId = new Map<ExerciseId, Exercise>();
  const byConcept = new Map<string, Exercise[]>();
  for (const ex of library) {
    byId.set(ex.id, ex);
    for (const concept of ex.concepts) {
      const list = byConcept.get(concept) ?? [];
      list.push(ex);
      byConcept.set(concept, list);
    }
  }
  for (const list of byConcept.values()) list.sort((a, b) => a.difficulty - b.difficulty);
  return { byId, byConcept };
}

/**
 * Picks the best exercise for a concept: not one seen in the last few lessons,
 * pitched just above what the learner has already demonstrated.
 */
function chooseForConcept(
  concept: string,
  index: Indexed,
  profile: Profile,
  used: Set<ExerciseId>,
  rand: () => number,
  opts: { targetDifficulty?: number; avoidKinds?: ExerciseKind[]; kindCounts?: Map<ExerciseKind, number> } = {},
): Exercise | null {
  const candidates = (index.byConcept.get(concept) ?? []).filter((ex) => !used.has(ex.id));
  if (!candidates.length) return null;

  const strength = decayedStrength(memoryFor(profile, concept), profile.lessonIndex);
  const target = opts.targetDifficulty ?? Math.max(1, Math.min(5, Math.round(1 + strength * 3.6)));

  const scored = candidates.map((ex) => {
    const mem = profile.exercises[ex.id];
    const lessonsSince = mem ? profile.lessonIndex - mem.lastLesson : 99;
    let score = 0;
    // Closeness to the target difficulty dominates.
    score += 3 - Math.abs(ex.difficulty - target);
    // Strongly prefer something they have not just seen.
    score += Math.min(4, lessonsSince * 0.7);
    if (!mem) score += 1.2;
    // An item they have got wrong before is worth revisiting sooner.
    if (mem && mem.wrong > mem.right) score += 1.4;
    if (opts.avoidKinds?.includes(ex.kind)) score -= 2.2;
    // Push back against a lesson filling up with one element type. Some
    // tracks are naturally choice-heavy, and without this the variety has to
    // be rescued by the arranger, which can only do so much.
    score -= (opts.kindCounts?.get(ex.kind) ?? 0) * 0.85;
    // A little noise so two identical profiles do not walk identical paths.
    score += rand() * 0.7;
    return { ex, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.ex ?? null;
}

/**
 * Reorders a lesson for pacing without changing what is in it.
 *
 * The rule that matters: never three of the same element type in a row. Two
 * multiple-choice questions back to back is a lesson; three is a quiz, and
 * five is a form. A naive shuffle cannot guarantee that, so this places items
 * greedily, always taking whichever type has the most left to place among
 * those that would not make a run of three.
 */
function arrange(slots: LessonSlot[], rand: () => number): LessonSlot[] {
  if (slots.length <= 2) return slots;

  const buckets = new Map<ExerciseKind, LessonSlot[]>();
  for (const slot of shuffle(slots, rand)) {
    const list = buckets.get(slot.exercise.kind) ?? [];
    list.push(slot);
    buckets.set(slot.exercise.kind, list);
  }

  const out: LessonSlot[] = [];
  const isGentle = (s: LessonSlot) => s.exercise.kind !== 'write' && s.exercise.difficulty <= 3;

  // Open with something gentle: the first item decides whether this feels like
  // a lesson or an exam.
  for (const [kind, list] of buckets) {
    const idx = list.findIndex(isGentle);
    if (idx >= 0) {
      out.push(...list.splice(idx, 1));
      if (!list.length) buckets.delete(kind);
      break;
    }
  }

  while (out.length < slots.length) {
    const lastTwo = out.slice(-2).map((s) => s.exercise.kind);
    const wouldRun = lastTwo.length === 2 && lastTwo[0] === lastTwo[1] ? lastTwo[0] : null;

    let bestKind: ExerciseKind | null = null;
    let bestCount = -1;
    for (const [kind, list] of buckets) {
      if (!list.length || kind === wouldRun) continue;
      if (list.length > bestCount) {
        bestCount = list.length;
        bestKind = kind;
      }
    }
    // Only when a run is genuinely unavoidable (one type is most of the
    // lesson) do we allow it, rather than dropping an item.
    if (bestKind === null) {
      for (const [kind, list] of buckets) {
        if (list.length > bestCount) {
          bestCount = list.length;
          bestKind = kind;
        }
      }
    }
    if (bestKind === null) break;

    const list = buckets.get(bestKind)!;
    // Within a type, put the easier item first so difficulty ramps up.
    list.sort((a, b) => a.exercise.difficulty - b.exercise.difficulty);
    out.push(list.shift()!);
    if (!list.length) buckets.delete(bestKind);
  }

  // Never end on the hardest thing in the lesson if something calmer can go last.
  const lastIdx = out.length - 1;
  if (out.length > 4 && out[lastIdx].exercise.difficulty === 5) {
    const swapAt = out.findIndex((s, i) => i > 1 && i < lastIdx && s.exercise.difficulty <= 3);
    if (swapAt >= 0) {
      const tmp = out[lastIdx];
      out[lastIdx] = out[swapAt];
      out[swapAt] = tmp;
    }
  }

  return out;
}

export function composeLesson(input: ComposeInput): Lesson {
  const { profile, course, track, library, mode = 'course' } = input;
  const index = indexLibrary(library);
  const rand = mulberry32(hashString(`${profile.id}:${profile.lessonIndex}:${mode}`));
  const skill = activeSkill(profile, course, track);
  const slotCount = input.slots ?? 12;

  const used = new Set<ExerciseId>();
  const chosen: LessonSlot[] = [];
  // Running tally of element types already in the lesson, so selection can
  // spread them out instead of leaving it all to the arranger.
  const kindCounts = new Map<ExerciseKind, number>();
  const add = (exercise: Exercise, source: LessonSlotSource, misses?: number) => {
    if (used.has(exercise.id) || chosen.length >= slotCount) return false;
    used.add(exercise.id);
    chosen.push({ exercise, source, misses });
    kindCounts.set(exercise.kind, (kindCounts.get(exercise.kind) ?? 0) + 1);
    return true;
  };

  // --- 1. rechecks --------------------------------------------------------
  const recheckCap = mode === 'review' ? slotCount : Math.max(1, Math.floor(slotCount * RECHECK_SHARE));
  let rechecks = 0;
  for (const mistake of dueMistakes(profile.mistakes, profile.lessonIndex)) {
    if (rechecks >= recheckCap) break;
    const ex = index.byId.get(mistake.exerciseId);
    if (!ex) continue;
    if (add(ex, 'recheck', mistake.misses)) rechecks++;
  }

  // --- 2. due reviews -----------------------------------------------------
  const reviewCap = mode === 'review' ? slotCount : Math.ceil(slotCount * 0.3);
  let reviews = 0;
  for (const concept of dueConcepts(profile, profile.lessonIndex)) {
    if (reviews >= reviewCap || chosen.length >= slotCount) break;
    const ex = chooseForConcept(concept, index, profile, used, rand, { kindCounts });
    if (ex && add(ex, 'review')) reviews++;
  }

  // --- 3. new material ----------------------------------------------------
  if (mode === 'course') {
    const conceptOrder = skill.concepts.slice().sort((a, b) => {
      // Teach the least-known concept of the skill first.
      const sa = decayedStrength(memoryFor(profile, a), profile.lessonIndex);
      const sb = decayedStrength(memoryFor(profile, b), profile.lessonIndex);
      return sa - sb;
    });
    // Two passes so a skill with three concepts still fills a twelve-item
    // lesson rather than stopping after three.
    for (let pass = 0; pass < 4 && chosen.length < slotCount; pass++) {
      for (const concept of conceptOrder) {
        if (chosen.length >= slotCount) break;
        const seenKinds = chosen.slice(-2).map((s) => s.exercise.kind);
        const ex = chooseForConcept(concept, index, profile, used, rand, {
          targetDifficulty: Math.min(5, 1 + pass + Math.round(decayedStrength(memoryFor(profile, concept), profile.lessonIndex) * 2)),
          avoidKinds: seenKinds,
          kindCounts,
        });
        if (ex) add(ex, 'new');
      }
    }
  }

  // --- 4. stretch ---------------------------------------------------------
  const recentAccuracy = accuracy(profile);
  if (mode === 'course' && chosen.length < slotCount && recentAccuracy >= 0.8) {
    const ahead = course.syllabus.indexOf(skill.id) + 1;
    const nextSkill = track.skills.find((s) => s.id === course.syllabus[ahead]);
    for (const concept of nextSkill?.concepts ?? []) {
      const ex = chooseForConcept(concept, index, profile, used, rand, { targetDifficulty: 2, kindCounts });
      if (ex && add(ex, 'stretch')) break;
    }
  }

  // --- backfill -----------------------------------------------------------
  // A brand-new profile has no history to draw on, and a nearly-finished
  // course can run out of due material; either way the lesson still has to be
  // a full lesson. Widen to the whole track, nearest concepts first.
  if (chosen.length < slotCount) {
    const nearby = [
      ...skill.concepts,
      ...course.syllabus.flatMap((id) => track.skills.find((s) => s.id === id)?.concepts ?? []),
    ];
    for (const concept of nearby) {
      if (chosen.length >= slotCount) break;
      const ex = chooseForConcept(concept, index, profile, used, rand, { kindCounts });
      if (ex) add(ex, mode === 'review' ? 'review' : 'new');
    }
  }

  const arranged = arrange(chosen, rand);
  const mix: Record<LessonSlotSource, number> = { recheck: 0, review: 0, new: 0, stretch: 0, warmup: 0 };
  for (const slot of arranged) mix[slot.source]++;

  return {
    id: `${course.trackId}-l${profile.lessonIndex + 1}-${mode}`,
    index: profile.lessonIndex + 1,
    skillId: skill.id,
    title: mode === 'review' ? 'Weak spots' : skill.title,
    slots: arranged,
    mix,
  };
}

/** Rolling accuracy over the concepts touched recently. */
export function accuracy(profile: Profile): number {
  const entries = Object.values(profile.concepts).filter((m) => m.seen > 0);
  if (!entries.length) return 1;
  const seen = entries.reduce((s, m) => s + m.seen, 0);
  const right = entries.reduce((s, m) => s + m.correct, 0);
  return seen === 0 ? 1 : right / seen;
}

/** Concepts the learner is worst at, for the stats screen and review lessons. */
export function weakestConcepts(profile: Profile, limit = 8): Array<{ concept: string; strength: number; lapses: number }> {
  return Object.entries(profile.concepts)
    .filter(([, m]) => m.seen > 0)
    .map(([concept, m]) => ({
      concept,
      strength: decayedStrength(m, profile.lessonIndex),
      lapses: m.lapses,
    }))
    .sort((a, b) => a.strength - b.strength || b.lapses - a.lapses)
    .slice(0, limit);
}
