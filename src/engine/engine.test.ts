import { describe, expect, it } from 'vitest';
import { buildCourse, orderSyllabus, recommendTracks, slotsForBudget } from './courseBuilder';
import { activeSkill, composeLesson, indexLibrary, isSkillUnlocked, skillMastery } from './lessonComposer';
import { completeLesson, createProfile, recordAnswer, setCourse, streakState } from './progress';
import { clearMistake, decayedStrength, dueMistakes, queueMistake, reviewConcept, INITIAL_MEMORY } from './scheduler';
import { grade, splitTemplate } from './grader';
import { TRACKS, exercisesForTrack, allExercises, trackById } from '@/content';
import type { Exercise, Profile, WizardAnswers } from './types';

const answers = (over: Partial<WizardAnswers> = {}): WizardAnswers => ({
  trackId: 'python',
  goal: 'automation',
  experience: 'none',
  minutesPerDay: 10,
  interests: ['automation'],
  priorLanguages: [],
  hearts: true,
  ...over,
});

function freshProfile(trackId = 'python', over: Partial<WizardAnswers> = {}): Profile {
  const track = trackById(trackId)!;
  const course = buildCourse(track, answers({ trackId, ...over }));
  return setCourse(createProfile('test-profile'), course);
}

describe('scheduler: the wrong-answer contract', () => {
  it('schedules a missed concept for the very next lesson', () => {
    const after = reviewConcept({ ...INITIAL_MEMORY, streak: 4, strength: 0.9 }, false, 7);
    expect(after.interval).toBe(1);
    expect(after.dueLesson).toBe(8);
    expect(after.streak).toBe(0);
    expect(after.strength).toBeLessThan(0.5);
  });

  it('expands the interval as a concept is answered right repeatedly', () => {
    let memory = { ...INITIAL_MEMORY };
    const intervals: number[] = [];
    for (let lesson = 0; lesson < 6; lesson++) {
      memory = reviewConcept(memory, true, lesson);
      intervals.push(memory.interval);
    }
    expect(intervals[0]).toBeLessThan(intervals[intervals.length - 1]);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
  });

  it('queues the exact exercise that was missed, due next lesson', () => {
    const queue = queueMistake([], 'py.ex.1', 'py.variables', 3);
    expect(queue).toHaveLength(1);
    expect(queue[0].dueLesson).toBe(4);
    expect(dueMistakes(queue, 4)).toHaveLength(1);
    expect(dueMistakes(queue, 3)).toHaveLength(0);
  });

  it('makes a twice-missed item harder to shake off than a once-missed one', () => {
    let queue = queueMistake([], 'py.ex.1', 'py.variables', 1);
    queue = queueMistake(queue, 'py.ex.1', 'py.variables', 2);
    expect(queue[0].misses).toBe(2);
    // One correct answer does not clear a twice-missed item outright.
    queue = clearMistake(queue, 'py.ex.1', 3);
    expect(queue).toHaveLength(1);
    expect(queue[0].misses).toBe(1);
    queue = clearMistake(queue, 'py.ex.1', 4);
    expect(queue).toHaveLength(0);
  });

  it('lets mastery decay when a concept goes untouched', () => {
    const memory = { ...INITIAL_MEMORY, strength: 0.9, lastLesson: 0, seen: 3 };
    expect(decayedStrength(memory, 0)).toBeCloseTo(0.9, 5);
    expect(decayedStrength(memory, 40)).toBeLessThan(0.5);
  });
});

describe('course builder', () => {
  it('never puts a skill before its prerequisites', () => {
    for (const track of TRACKS) {
      const { order } = orderSyllabus(track, answers({ trackId: track.id }));
      const seen = new Set<string>();
      for (const id of order) {
        const skill = track.skills.find((s) => s.id === id)!;
        for (const req of skill.requires) {
          expect(seen.has(req), `${track.id}: ${id} came before its prerequisite ${req}`).toBe(true);
        }
        seen.add(id);
      }
      expect(order).toHaveLength(track.skills.length);
    }
  });

  it('orders the same track differently for different goals', () => {
    const track = trackById('python')!;
    const forData = orderSyllabus(track, answers({ goal: 'data', interests: ['data'] })).order;
    const forWeb = orderSyllabus(track, answers({ goal: 'web', interests: ['web'] })).order;
    expect(forData).not.toEqual(forWeb);
  });

  it('recommends game tracks to somebody who wants to make games', () => {
    const ranked = recommendTracks(TRACKS, {
      goal: 'games',
      experience: 'none',
      interests: ['games'],
      priorLanguages: [],
      minutesPerDay: 15,
    });
    expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
    expect(ranked.slice(0, 4).some((r) => r.track.goals.includes('games'))).toBe(true);
    expect(ranked[0].reasons.length).toBeGreaterThan(0);
  });

  it('pre-credits fundamentals for an experienced learner only', () => {
    const track = trackById('python')!;
    expect(buildCourse(track, answers({ experience: 'none' })).placed).toHaveLength(0);
    expect(buildCourse(track, answers({ experience: 'pro' })).placed.length).toBeGreaterThan(0);
  });

  it('scales lesson length to the daily time budget', () => {
    expect(slotsForBudget(5)).toBeLessThan(slotsForBudget(30));
    // Even a one-minute budget is still a lesson, and no budget makes it an exam.
    expect(slotsForBudget(1)).toBeGreaterThanOrEqual(6);
    expect(slotsForBudget(600)).toBeLessThanOrEqual(16);
  });
});

describe('lesson composer', () => {
  it('fills a full lesson from a cold start', () => {
    const profile = freshProfile();
    const track = trackById('python')!;
    const lesson = composeLesson({
      profile,
      course: profile.course!,
      track,
      library: exercisesForTrack('python'),
      slots: 12,
    });
    expect(lesson.slots).toHaveLength(12);
    expect(new Set(lesson.slots.map((s) => s.exercise.id)).size).toBe(12);
  });

  it('puts every wrong answer into the next lesson', () => {
    let profile = freshProfile();
    const track = trackById('python')!;
    const library = exercisesForTrack('python');

    const first = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    const missed = first.slots.slice(0, 3).map((s) => s.exercise);
    for (const ex of missed) {
      profile = recordAnswer(profile, ex, { correct: false, seconds: 10, usedHint: false });
    }
    for (const slot of first.slots.slice(3)) {
      profile = recordAnswer(profile, slot.exercise, { correct: true, seconds: 8, usedHint: false });
    }
    profile = completeLesson(profile, {
      correct: 9,
      total: 12,
      seconds: 300,
      perfect: false,
      skillId: first.skillId,
    }).profile;

    const second = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    const ids = second.slots.map((s) => s.exercise.id);
    for (const ex of missed) {
      expect(ids, `${ex.id} should be rechecked next lesson`).toContain(ex.id);
    }
    expect(second.mix.recheck).toBe(3);
  });

  it('caps rechecks so a bad lesson is not followed by an all-mistakes lesson', () => {
    let profile = freshProfile();
    const track = trackById('python')!;
    const library = exercisesForTrack('python');
    const first = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    for (const slot of first.slots) {
      profile = recordAnswer(profile, slot.exercise, { correct: false, seconds: 5, usedHint: false });
    }
    profile = completeLesson(profile, {
      correct: 0,
      total: 12,
      seconds: 200,
      perfect: false,
      skillId: first.skillId,
    }).profile;

    const second = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    expect(second.mix.recheck).toBeLessThanOrEqual(5);
    expect(second.slots).toHaveLength(12);
  });

  it('is deterministic for the same profile and lesson number', () => {
    const profile = freshProfile();
    const track = trackById('python')!;
    const library = exercisesForTrack('python');
    const a = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    const b = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
    expect(a.slots.map((s) => s.exercise.id)).toEqual(b.slots.map((s) => s.exercise.id));
  });

  it('never puts three identical element types in a row', () => {
    for (const track of TRACKS) {
      const profile = freshProfile(track.id);
      const library = exercisesForTrack(track.id);
      const lesson = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
      for (let i = 2; i < lesson.slots.length; i++) {
        const run = [lesson.slots[i - 2], lesson.slots[i - 1], lesson.slots[i]].map((s) => s.exercise.kind);
        expect(new Set(run).size, `${track.id} had three ${run[0]} in a row`).toBeGreaterThan(1);
      }
    }
  });

  it('never reaches far ahead of the learner to pad a lesson', () => {
    // A dictionary question in somebody's first lesson is the failure this
    // guards against. A short skill legitimately has to borrow to fill a long
    // lesson, but it must borrow from the next thing along, never skip ahead:
    // the skills a lesson touches have to form an unbroken run from the start
    // of the syllabus.
    for (const track of TRACKS) {
      const profile = freshProfile(track.id);
      const course = profile.course!;
      const lesson = composeLesson({
        profile,
        course,
        track,
        library: exercisesForTrack(track.id),
        slots: 16,
      });

      const skillOf = new Map<string, number>();
      course.syllabus.forEach((id, i) => {
        for (const concept of track.skills.find((s) => s.id === id)?.concepts ?? []) {
          if (!skillOf.has(concept)) skillOf.set(concept, i);
        }
      });

      const touched = new Set<number>();
      for (const slot of lesson.slots) {
        for (const concept of slot.exercise.concepts) {
          const at = skillOf.get(concept);
          if (at !== undefined) touched.add(at);
        }
      }
      const highest = Math.max(...touched);
      for (let i = 0; i <= highest; i++) {
        expect(touched.has(i), `${track.id}: lesson skipped past syllabus position ${i} to reach ${highest}`).toBe(
          true,
        );
      }
    }
  });

  it('leads a lesson with its own material, not with padding', () => {
    const profile = freshProfile();
    const track = trackById('python')!;
    const lesson = composeLesson({
      profile,
      course: profile.course!,
      track,
      library: exercisesForTrack('python'),
      slots: 16,
    });
    const skill = track.skills.find((s) => s.id === lesson.skillId)!;
    const firstThree = lesson.slots.slice(0, 3);
    expect(
      firstThree.every((s) => s.exercise.concepts.some((c) => skill.concepts.includes(c))),
    ).toBe(true);
  });

  it('advances through the syllabus as skills are mastered', () => {
    let profile = freshProfile();
    const track = trackById('python')!;
    const library = exercisesForTrack('python');
    const firstSkill = activeSkill(profile, profile.course!, track);

    // Answer everything correctly for several lessons.
    for (let i = 0; i < 8; i++) {
      const lesson = composeLesson({ profile, course: profile.course!, track, library, slots: 12 });
      for (const slot of lesson.slots) {
        profile = recordAnswer(profile, slot.exercise, { correct: true, seconds: 6, usedHint: false });
      }
      profile = completeLesson(profile, {
        correct: 12,
        total: 12,
        seconds: 240,
        perfect: true,
        skillId: lesson.skillId,
      }).profile;
    }

    expect(skillMastery(profile, firstSkill)).toBeGreaterThan(0.7);
    expect(activeSkill(profile, profile.course!, track).id).not.toBe(firstSkill.id);
  });

  it('keeps later skills locked until their prerequisites are done', () => {
    const profile = freshProfile();
    const track = trackById('python')!;
    const locked = track.skills.filter((s) => s.requires.length > 0);
    expect(locked.length).toBeGreaterThan(0);
    expect(isSkillUnlocked(profile, profile.course!, track, locked[locked.length - 1].id)).toBe(false);
  });
});

describe('progress', () => {
  it('awards more XP for a perfect lesson', () => {
    const base = createProfile('p');
    const plain = completeLesson(base, { correct: 10, total: 12, seconds: 300, perfect: false, skillId: 's' });
    const perfect = completeLesson(base, { correct: 12, total: 12, seconds: 300, perfect: true, skillId: 's' });
    expect(perfect.xpEarned).toBeGreaterThan(plain.xpEarned);
  });

  it('extends a streak on consecutive days and resets after a gap', () => {
    let profile = createProfile('p');
    const day = (n: number) => new Date(2026, 0, n, 12);
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, day(1)).profile;
    expect(profile.streak).toBe(1);
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, day(2)).profile;
    expect(profile.streak).toBe(2);
    // A five-day gap is past any freeze.
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, day(8)).profile;
    expect(profile.streak).toBe(1);
    expect(profile.bestStreak).toBe(2);
  });

  it('spends a freeze to survive a single missed day', () => {
    let profile = createProfile('p');
    const day = (n: number) => new Date(2026, 0, n, 12);
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, day(1)).profile;
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, day(3)).profile;
    expect(profile.streak).toBe(2);
    expect(profile.freezes).toBe(1);
  });

  it('reports a streak as at risk on the day after practice', () => {
    let profile = createProfile('p');
    profile = completeLesson(profile, { correct: 5, total: 5, seconds: 60, perfect: true, skillId: 's' }, new Date(2026, 0, 1, 12)).profile;
    expect(streakState(profile, new Date(2026, 0, 1, 20))).toBe('active');
    expect(streakState(profile, new Date(2026, 0, 2, 9))).toBe('at-risk');
  });
});

describe('grader', () => {
  const base = { id: 'x', track: 't', concepts: ['c'], difficulty: 1 as const, prompt: 'p' };

  it('accepts cosmetic differences in assembled code', () => {
    const ex: Exercise = { ...base, kind: 'assemble', answer: ['print', '(', '"hi"', ')'] };
    expect(grade(ex, { kind: 'assemble', tiles: ['print', '(', "'hi'", ')'] }).correct).toBe(true);
  });

  it('distinguishes wrong pieces from wrong order', () => {
    const ex: Exercise = { ...base, kind: 'assemble', answer: ['a', 'b'] };
    expect(grade(ex, { kind: 'assemble', tiles: ['b', 'a'] }).detail).toMatch(/wrong order/i);
  });

  it('reports partial credit for multi-part answers', () => {
    const ex: Exercise = {
      ...base,
      kind: 'match',
      pairs: [
        ['a', '1'],
        ['b', '2'],
      ],
    };
    const g = grade(ex, { kind: 'match', pairs: [['a', '1'], ['b', '9']] });
    expect(g.correct).toBe(false);
    expect(g.partial).toBeCloseTo(0.5);
  });

  it('penalises extra wires that should not be there', () => {
    const ex: Exercise = {
      ...base,
      kind: 'wire',
      nodes: [],
      links: [['a:out', 'b:in']],
    };
    expect(grade(ex, { kind: 'wire', links: [['a:out', 'b:in']] }).correct).toBe(true);
    expect(
      grade(ex, { kind: 'wire', links: [['a:out', 'b:in'], ['a:out', 'c:in']] }).correct,
    ).toBe(false);
  });

  it('splits blank templates into text and markers', () => {
    expect(splitTemplate('for {{0}} in {{1}}:')).toEqual([
      { text: 'for ' },
      { blank: 0 },
      { text: ' in ' },
      { blank: 1 },
      { text: ':' },
    ]);
  });
});

describe('content library', () => {
  it('has hundreds of exercises across every track', () => {
    expect(allExercises().length).toBeGreaterThan(300);
    for (const track of TRACKS) {
      expect(exercisesForTrack(track.id).length, `${track.id} is thin`).toBeGreaterThan(15);
    }
  });

  it('uses every one of the ten element types', () => {
    const kinds = new Set(allExercises().map((e) => e.kind));
    expect([...kinds].sort()).toEqual(
      ['assemble', 'blank', 'bug', 'choice', 'match', 'order', 'predict', 'terminal', 'wire', 'write'].sort(),
    );
  });

  it('has no duplicate exercise ids', () => {
    const ids = allExercises().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references concepts that a skill in its track teaches', () => {
    for (const track of TRACKS) {
      const known = new Set(track.skills.flatMap((s) => s.concepts));
      for (const ex of exercisesForTrack(track.id)) {
        for (const concept of ex.concepts) {
          expect(known.has(concept), `${ex.id} tests unknown concept ${concept}`).toBe(true);
        }
      }
    }
  });

  it('gives every skill in every track something to test it with', () => {
    for (const track of TRACKS) {
      const index = indexLibrary(exercisesForTrack(track.id));
      for (const skill of track.skills) {
        const count = skill.concepts.reduce((n, c) => n + (index.byConcept.get(c)?.length ?? 0), 0);
        expect(count, `${track.id}/${skill.id} has too few exercises`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps every answer index inside its option list', () => {
    for (const ex of allExercises()) {
      if (ex.kind === 'choice') {
        expect(ex.answer.length).toBeGreaterThan(0);
        for (const a of ex.answer) expect(ex.options[a]).toBeDefined();
      }
      if (ex.kind === 'predict') expect(ex.options[ex.answer]).toBeDefined();
      if (ex.kind === 'bug') {
        expect(ex.buggyLine).toBeGreaterThan(0);
        expect(ex.buggyLine).toBeLessThanOrEqual(ex.code.split('\n').length);
        if (ex.why) expect(ex.why.options[ex.why.answer]).toBeDefined();
      }
      if (ex.kind === 'blank') {
        const markers = splitTemplate(ex.template).filter((p) => 'blank' in p).length;
        expect(markers, `${ex.id} blank count mismatch`).toBe(ex.blanks.length);
      }
      if (ex.kind === 'wire') {
        const pins = new Set<string>();
        for (const n of ex.nodes) {
          for (const o of n.outputs ?? []) pins.add(`${n.id}:${o}`);
          for (const i of n.inputs ?? []) pins.add(`${n.id}:${i}`);
        }
        for (const [from, to] of ex.links) {
          expect(pins.has(from), `${ex.id} links from unknown pin ${from}`).toBe(true);
          expect(pins.has(to), `${ex.id} links to unknown pin ${to}`).toBe(true);
        }
      }
    }
  });

  it('gives every exercise an explanation to learn from', () => {
    const missing = allExercises().filter((e) => !e.explain || e.explain.length < 12);
    expect(missing.map((e) => e.id)).toEqual([]);
  });
});
