import type { Exercise, ExerciseId, Lesson, Track } from './types';

/* ============================================================================
   The ten-level ladder.

   Every exercise sits on a level from 1 to 10, and the learner sits on one
   too — per course, because being level 7 at Python says nothing about Rust.
   A lesson is drawn at your level, with one item from the level above as a
   question you are allowed to fail.

   Moving up is deliberately not a single good lesson. One lesson is noise:
   you can guess four multiple-choice questions in a row, or happen to get the
   three concepts you already knew. A *run* of strong lessons at the current
   level is evidence, and that is what the ladder asks for. One weak lesson
   does not knock you back down either — it only resets the run, which is the
   honest reading of it: you have not shown you are ready yet.
   ========================================================================== */

export const MAX_LEVEL = 10;

/** Accuracy a lesson needs to count towards promotion. */
export const PROMOTE_AT = 0.85;
/** Below this, a lesson counts against you. */
export const STRUGGLE_AT = 0.5;
/** Consecutive weak lessons before the ladder eases off. */
export const DEMOTE_RUN = 2;

/**
 * How many strong lessons in a row a promotion costs. It gets stricter as you
 * climb: level 2 should arrive quickly enough to feel like the app noticed,
 * level 9 should feel earned.
 */
export function runNeeded(level: number): number {
  if (level <= 2) return 2;
  if (level <= 5) return 3;
  return 4;
}

/** A lesson only proves something if enough of it was actually at your level. */
export function provingItems(lesson: Lesson, levelOf: (ex: Exercise) => number, level: number): number {
  return lesson.slots.filter((slot) => levelOf(slot.exercise) >= level).length;
}

export interface LevelState {
  level: number;
  /** Strong lessons in a row at this level. */
  run: number;
  /** Weak lessons in a row. */
  slips: number;
  /** Last few lesson scores, newest last, for the "how close am I" bar. */
  recent: number[];
}

export function freshLevel(): LevelState {
  return { level: 1, run: 0, slips: 0, recent: [] };
}

export interface LessonVerdict {
  /** 0..1 accuracy for the lesson just finished. */
  score: number;
  /** Items in that lesson that were at or above the current level. */
  atLevel: number;
  /** Items in the lesson in total. */
  total: number;
  /**
   * The composer had no at-level material left to serve — the lesson was thin
   * because the library is, not because the learner took an easy one.
   */
  starved?: boolean;
}

export interface LevelChange {
  state: LevelState;
  moved: 'up' | 'down' | null;
  /** Strong lessons still needed at this level, after this one. */
  remaining: number;
}

/**
 * Applies one finished lesson to the ladder.
 *
 * A lesson that was mostly revision of easier material cannot promote you —
 * that is the difference between "you are ready for level 6" and "you had an
 * easy day". It can still count against you, because getting easy questions
 * wrong is information too.
 */
export function applyLesson(state: LevelState, verdict: LessonVerdict): LevelChange {
  const recent = [...state.recent, Math.round(verdict.score * 100)].slice(-8);
  // A quarter of the lesson, or three items, whichever is smaller — short
  // lessons on a five-item budget should still be able to promote.
  const need = Math.min(3, Math.ceil(verdict.total * 0.25));
  // ...unless the composer reports it had nothing at this level left to give.
  // A skill whose material all sits above the current rung would otherwise
  // freeze the ladder for good: no at-level items, so no promotion, so the
  // harder material never unlocks. That escape asks for a flawless lesson,
  // which is stronger evidence than the 85% the normal path takes, so it
  // cannot be used to buy an easy climb.
  const starved = verdict.starved === true && verdict.score >= 0.999;
  const enoughAtLevel = verdict.atLevel >= need || starved;

  if (verdict.score >= PROMOTE_AT && enoughAtLevel) {
    const run = state.run + 1;
    if (run >= runNeeded(state.level) && state.level < MAX_LEVEL) {
      return {
        state: { level: state.level + 1, run: 0, slips: 0, recent },
        moved: 'up',
        remaining: runNeeded(state.level + 1),
      };
    }
    return {
      state: { ...state, run, slips: 0, recent },
      moved: null,
      remaining: Math.max(0, runNeeded(state.level) - run),
    };
  }

  if (verdict.score < STRUGGLE_AT) {
    const slips = state.slips + 1;
    if (slips >= DEMOTE_RUN && state.level > 1) {
      // Down a level, and the run at the new level starts part-filled: the
      // point is to make the next lesson land properly, not to punish.
      return {
        state: { level: state.level - 1, run: 0, slips: 0, recent },
        moved: 'down',
        remaining: runNeeded(state.level - 1),
      };
    }
    return {
      state: { ...state, run: 0, slips, recent },
      moved: null,
      remaining: runNeeded(state.level),
    };
  }

  // In between: no progress, no punishment. The run resets, because the
  // evidence has to be consecutive to mean anything.
  return {
    state: { ...state, run: 0, slips: 0, recent },
    moved: null,
    remaining: runNeeded(state.level),
  };
}

/* ------------------------------------------------------- exercise levels */

/**
 * Where an exercise sits on the ladder.
 *
 * Authored `level` always wins. Everything else is derived from two things
 * that are already true of the content: how far into the track the skill it
 * belongs to sits, and how hard the exercise is within that skill. So the
 * first questions of the first skill are level 1, and the hardest question of
 * the last skill is level 10, without anybody having to number 900 exercises
 * by hand.
 */
export function buildLevelIndex(track: Track, library: Exercise[]): Map<ExerciseId, number> {
  const tierOf = new Map<string, number>();
  const span = Math.max(1, track.skills.length - 1);
  track.skills.forEach((skill, i) => {
    for (const concept of skill.concepts) {
      // A concept can appear in more than one skill; the earliest wins, since
      // that is where it is taught.
      const tier = i / span;
      if (!tierOf.has(concept) || tier < tierOf.get(concept)!) tierOf.set(concept, tier);
    }
  });

  const out = new Map<ExerciseId, number>();
  for (const ex of library) {
    if (ex.level) {
      out.set(ex.id, clampLevel(ex.level));
      continue;
    }
    // Difficulty leads, position follows. How hard the question is decides
    // most of the rung; where it sits in the track shifts it. The other way
    // round and the first skill's hardest question would be level one, which
    // is exactly the lesson-three ambush this ladder exists to stop.
    const tier = tierOf.get(ex.concepts[0]) ?? 0.5;
    out.set(ex.id, clampLevel(ex.difficulty * 1.35 + tier * 3.6 - 0.6));
  }
  return out;
}

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
}

/** One line of plain English about where the learner stands. */
export function levelBlurb(state: LevelState): string {
  const need = runNeeded(state.level);
  if (state.level >= MAX_LEVEL) return 'Top level. Everything this course has is on the table.';
  if (state.slips > 0) return 'Steadying up. Get a strong lesson in and the climb starts again.';
  if (state.run === 0) return `${need} strong lessons in a row moves you to level ${state.level + 1}.`;
  const left = Math.max(1, need - state.run);
  return left === 1
    ? `One more strong lesson and you are level ${state.level + 1}.`
    : `${left} more strong lessons and you are level ${state.level + 1}.`;
}
