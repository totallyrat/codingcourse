import { hashString, mulberry32, shuffle } from './rng';
import { buildLevelIndex } from './levels';
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

   All of it is filtered through the ten-level ladder: the lesson is drawn at
   the learner's level for this track, with a single item from the level above
   as the thing they are allowed to fail. That is what stops lesson three from
   being the hardest question in the library, and it is why the beginning is
   gentle without the end being empty.

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
  /** The learner's rung on the ten-level ladder for this track. */
  level?: number;
}

const RECHECK_SHARE = 0.4;
/**
 * Below this a concept counts as not learned yet, and the composer will reach
 * up to two levels for material that teaches it rather than leave it alone.
 */
const WEAK_ENOUGH_TO_REACH = 0.6;

/** Ordering preference when two items of the same type compete for a slot. */
const SOURCE_RANK: Record<LessonSlotSource, number> = {
  warmup: 0,
  recheck: 1,
  new: 2,
  review: 3,
  stretch: 4,
};

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
  opts: {
    targetDifficulty?: number;
    avoidKinds?: ExerciseKind[];
    kindCounts?: Map<ExerciseKind, number>;
    /** Concepts the learner has reached; an exercise is only served if this is
     *  what it is mainly *about*. */
    allowPrimary?: Set<string>;
    /** The ladder: where each exercise sits, and how high this pick may go. */
    levelOf?: (ex: Exercise) => number;
    maxLevel?: number;
    /** Allow reaching above the ceiling rather than returning nothing. */
    relax?: boolean;
  } = {},
): Exercise | null {
  const pool = (index.byConcept.get(concept) ?? []).filter((ex) => {
    if (used.has(ex.id)) return false;
    // An exercise is indexed under every concept it touches, which is what
    // lets a dictionary question also count as KeyError practice. But it must
    // not be *served* for KeyError before dictionaries have been taught, or
    // lesson one hands a beginner something from unit nine.
    if (opts.allowPrimary && !opts.allowPrimary.has(ex.concepts[0])) return false;
    return true;
  });
  if (!pool.length) return null;

  // The ladder is a hard ceiling. Only the last-resort pass sets `relax`, and
  // then only the gentlest thing available gets through — a short lesson is
  // worse than one slightly hard question, but it is the last thing tried.
  const levelOf = opts.levelOf;
  const ceiling = opts.maxLevel;
  let candidates = pool;
  if (levelOf && ceiling !== undefined) {
    const within = pool.filter((ex) => levelOf(ex) <= ceiling);
    if (within.length) candidates = within;
    else if (opts.relax) candidates = [pool.reduce((best, ex) => (levelOf(ex) < levelOf(best) ? ex : best), pool[0])];
    else return null;
  }

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
    // Sit on the learner's rung. Something well below it is revision and
    // still useful; something above it is the thing that made lesson three
    // feel like an exam, so it costs much more.
    if (levelOf && ceiling !== undefined) {
      const gap = levelOf(ex) - ceiling;
      score += gap > 0 ? -3.5 * gap : -0.45 * Math.min(3, -gap);
    }
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

  // Open with something gentle from the lesson's own material: the first item
  // decides whether this feels like a lesson or an exam, and it should be
  // about the thing the lesson is for.
  let warmKind: ExerciseKind | null = null;
  let warmIdx = -1;
  let warmRank = Infinity;
  for (const [kind, list] of buckets) {
    for (let i = 0; i < list.length; i++) {
      if (!isGentle(list[i])) continue;
      const rank = (list[i].own ? 0 : 100) + SOURCE_RANK[list[i].source] * 10 + list[i].exercise.difficulty;
      if (rank < warmRank) {
        warmRank = rank;
        warmKind = kind;
        warmIdx = i;
      }
    }
  }
  if (warmKind !== null) {
    const list = buckets.get(warmKind)!;
    out.push(...list.splice(warmIdx, 1));
    if (!list.length) buckets.delete(warmKind);
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
    // Within a type: the lesson's own material first, then by difficulty, so
    // padding drawn from elsewhere never leads the lesson.
    list.sort(
      (a, b) =>
        Number(!!b.own) - Number(!!a.own) ||
        SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
        a.exercise.difficulty - b.exercise.difficulty,
    );
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

/** One level index per track, kept because a lesson is composed on every open. */
const levelCache = new Map<string, Map<ExerciseId, number>>();

function levelIndexFor(track: Track, library: Exercise[]): Map<ExerciseId, number> {
  const key = `${track.id}:${library.length}`;
  let index = levelCache.get(key);
  if (!index) {
    index = buildLevelIndex(track, library);
    levelCache.set(key, index);
  }
  return index;
}

export function composeLesson(input: ComposeInput): Lesson {
  const { profile, course, track, library, mode = 'course' } = input;
  const index = indexLibrary(library);
  const levels = levelIndexFor(track, library);
  const levelOf = (ex: Exercise) => levels.get(ex.id) ?? 5;
  const learnerLevel = Math.max(1, Math.min(10, input.level ?? 1));
  const rand = mulberry32(hashString(`${profile.id}:${profile.lessonIndex}:${mode}`));
  const skill = activeSkill(profile, course, track);
  const slotCount = input.slots ?? 12;

  // Everything taught so far, plus the one skill immediately ahead. Exercises
  // are only served when this is what they are mainly about.
  const conceptsOf = (id: SkillId) => track.skills.find((s) => s.id === id)?.concepts ?? [];
  const position = course.syllabus.indexOf(skill.id);
  const reached = new Set<string>(
    course.syllabus.slice(0, position < 0 ? 1 : position + 2).flatMap(conceptsOf),
  );
  for (const c of skill.concepts) reached.add(c);
  // Anything already practised stays available for review even if the course
  // was switched and the syllabus no longer contains it.
  for (const c of Object.keys(profile.concepts)) {
    if (profile.concepts[c].seen > 0) reached.add(c);
  }

  const used = new Set<ExerciseId>();
  const chosen: LessonSlot[] = [];
  // Running tally of element types already in the lesson, so selection can
  // spread them out instead of leaving it all to the arranger.
  const kindCounts = new Map<ExerciseKind, number>();
  // Where each concept sits in the syllabus, so late padding can never leap
  // over a skill that contributed nothing.
  const positionOf = new Map<string, number>();
  course.syllabus.forEach((id, i) => {
    for (const concept of conceptsOf(id)) if (!positionOf.has(concept)) positionOf.set(concept, i);
  });
  const reaches = (ex: Exercise): boolean => {
    const pos = positionOf.get(ex.concepts[0]);
    if (pos === undefined) return true;
    const highest = chosen.reduce((max, slot) => {
      const at = positionOf.get(slot.exercise.concepts[0]);
      return at === undefined ? max : Math.max(max, at);
    }, position < 0 ? 0 : position);
    return pos <= highest + 1;
  };

  const ownConcepts = new Set(skill.concepts);
  const add = (exercise: Exercise, source: LessonSlotSource, misses?: number) => {
    if (used.has(exercise.id) || chosen.length >= slotCount) return false;
    used.add(exercise.id);
    chosen.push({ exercise, source, misses, own: ownConcepts.has(exercise.concepts[0]) });
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
    const ex = chooseForConcept(concept, index, profile, used, rand, {
      kindCounts,
      allowPrimary: reached,
      levelOf,
      maxLevel: learnerLevel,
    });
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
        // A concept the learner has not got yet is the whole point of the
        // lesson. If everything teaching it sits above their level, reach up
        // two rungs rather than skip it: skipping leaves the concept weak
        // forever, so its skill can never be mastered and the syllabus never
        // moves on. That is how a course quietly stalls halfway, with the
        // learner re-answering the two concepts they already know.
        const unmet = decayedStrength(memoryFor(profile, concept), profile.lessonIndex) < WEAK_ENOUGH_TO_REACH;
        const ex = chooseForConcept(concept, index, profile, used, rand, {
          targetDifficulty: Math.min(5, 1 + pass + Math.round(decayedStrength(memoryFor(profile, concept), profile.lessonIndex) * 2)),
          avoidKinds: seenKinds,
          kindCounts,
          allowPrimary: reached,
          levelOf,
          maxLevel: unmet ? learnerLevel + 2 : learnerLevel,
        });
        if (ex) add(ex, levelOf(ex) > learnerLevel ? 'stretch' : 'new');
      }
    }
  }

  // --- 3b. the skill's own material, one rung up --------------------------
  // A skill whose questions all sit above the learner's level would otherwise
  // produce a lesson made entirely of revision: one own item and eleven
  // easier ones from skills already finished. That is not a lesson about this
  // skill, and — because promotion needs items at your level — it also froze
  // the ladder, so the harder material never unlocked. Reaching up for the
  // skill's own gentlest unused questions fixes both: the lesson teaches what
  // it says it teaches, and the climb has something to measure.
  if (mode === 'course' && chosen.length < slotCount) {
    const ownSoFar = chosen.filter((slot) => slot.own).length;
    const ownFloor = Math.min(3, Math.max(1, Math.ceil(slotCount * 0.25)));
    if (ownSoFar < ownFloor) {
      const reachable: Exercise[] = [];
      const seenHere = new Set<ExerciseId>();
      for (const concept of skill.concepts) {
        for (const ex of index.byConcept.get(concept) ?? []) {
          if (used.has(ex.id) || seenHere.has(ex.id)) continue;
          if (!ownConcepts.has(ex.concepts[0])) continue;
          seenHere.add(ex.id);
          reachable.push(ex);
        }
      }
      reachable.sort((a, b) => levelOf(a) - levelOf(b) || a.difficulty - b.difficulty);
      let added = ownSoFar;
      for (const ex of reachable) {
        if (added >= ownFloor || chosen.length >= slotCount) break;
        // The same two-rung allowance the backfill uses. Past that the honest
        // answer is that this skill is not ready for this learner yet.
        if (levelOf(ex) > learnerLevel + 2) break;
        if (add(ex, levelOf(ex) > learnerLevel ? 'stretch' : 'new')) added++;
      }
    }
  }

  // --- 4. the proving item ------------------------------------------------
  // One item from the level above, and only one: this is the question the
  // ladder is watching. Getting it wrong costs nothing but a recheck; getting
  // it right, lesson after lesson, is what moves the learner up.
  const recentAccuracy = accuracy(profile);
  if (mode === 'course' && chosen.length < slotCount && recentAccuracy >= 0.7 && learnerLevel < 10) {
    const ahead = course.syllabus.indexOf(skill.id) + 1;
    const nextSkill = track.skills.find((s) => s.id === course.syllabus[ahead]);
    const reach = [...skill.concepts, ...(nextSkill?.concepts ?? [])];
    for (const concept of reach) {
      const ex = chooseForConcept(concept, index, profile, used, rand, {
        kindCounts,
        allowPrimary: reached,
        levelOf,
        maxLevel: learnerLevel + 1,
      });
      if (ex && levelOf(ex) > learnerLevel && add(ex, 'stretch')) break;
    }
  }

  // --- backfill -----------------------------------------------------------
  // A skill with few exercises cannot fill a long lesson on its own, and a
  // nearly-finished course runs out of due material; either way the lesson
  // still has to be a full lesson.
  //
  // The widening is deliberately bounded. Reaching forward into the whole
  // syllabus would put a dictionary question in somebody's first ever lesson,
  // which is exactly the kind of thing that makes a course feel like it is not
  // paying attention. So it draws only on ground already covered, plus the one
  // skill immediately ahead.
  if (chosen.length < slotCount) {
    const nearby = [...skill.concepts, ...reached];
    for (const concept of nearby) {
      if (chosen.length >= slotCount) break;
      const ex = chooseForConcept(concept, index, profile, used, rand, {
        kindCounts,
        allowPrimary: reached,
        levelOf,
        maxLevel: learnerLevel,
      });
      if (ex) add(ex, mode === 'review' ? 'review' : 'new');
    }
    // Still short: step forward one skill at a time, opening each up as we go,
    // so a learner near the end of a course never gets a truncated lesson and
    // one near the start never leaps ahead.
    for (const id of course.syllabus) {
      if (chosen.length >= slotCount) break;
      const conceptsHere = conceptsOf(id);
      for (const c of conceptsHere) reached.add(c);
      for (const concept of conceptsHere) {
        if (chosen.length >= slotCount) break;
        const ex = chooseForConcept(concept, index, profile, used, rand, {
          kindCounts,
          allowPrimary: reached,
          levelOf,
          maxLevel: learnerLevel,
        });
        if (ex && reaches(ex)) add(ex, mode === 'review' ? 'review' : 'new');
      }
    }

    // Everything in the library at this level is spent. Rather than hand back
    // a short lesson, reach up — but globally gentlest first, not concept by
    // concept. Going concept by concept here once put a level six question in
    // a first lesson while a level three sat unused two concepts along.
    if (chosen.length < slotCount) {
      const spare: Exercise[] = [];
      const seenHere = new Set<ExerciseId>();
      for (const concept of [...skill.concepts, ...reached]) {
        for (const ex of index.byConcept.get(concept) ?? []) {
          if (used.has(ex.id) || seenHere.has(ex.id)) continue;
          if (!reached.has(ex.concepts[0])) continue;
          seenHere.add(ex.id);
          spare.push(ex);
        }
      }
      spare.sort((a, b) => levelOf(a) - levelOf(b) || a.difficulty - b.difficulty);
      for (const ex of spare) {
        if (chosen.length >= slotCount) break;
        // Two rungs is the whole allowance. Past that a short lesson is the
        // better answer: nobody ever gave up on this app because a lesson had
        // nine questions instead of twelve, and plenty would over a level
        // eight question in their first week.
        if (levelOf(ex) > learnerLevel + 2) break;
        if (reaches(ex)) add(ex, mode === 'review' ? 'review' : 'new');
      }
    }
  }

  const arranged = arrange(chosen, rand);
  const mix: Record<LessonSlotSource, number> = { recheck: 0, review: 0, new: 0, stretch: 0, warmup: 0 };
  for (const slot of arranged) mix[slot.source]++;

  // Did the library still have something at this level to offer? If it did and
  // the lesson went easy anyway, that is an easy day and the ladder should say
  // so. If it did not, the lesson was starved, and the ladder is told so it
  // cannot lock a learner under a skill it has no level-appropriate material
  // for.
  const atLevelCount = arranged.filter((slot) => levelOf(slot.exercise) >= learnerLevel).length;
  const needAtLevel = Math.min(3, Math.ceil(arranged.length * 0.25));
  const spareAtLevel = library.some(
    (ex) =>
      !used.has(ex.id) &&
      reached.has(ex.concepts[0]) &&
      levelOf(ex) >= learnerLevel &&
      levelOf(ex) <= learnerLevel + 2,
  );

  return {
    id: `${course.trackId}-l${profile.lessonIndex + 1}-${mode}`,
    index: profile.lessonIndex + 1,
    skillId: skill.id,
    title: mode === 'review' ? 'Weak spots' : skill.title,
    level: learnerLevel,
    proving: arranged.filter((slot) => levelOf(slot.exercise) > learnerLevel).length,
    atLevel: atLevelCount,
    starved: mode === 'course' && atLevelCount < needAtLevel && !spareAtLevel,
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
