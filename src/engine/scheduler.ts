import type { ConceptId, ConceptMemory, ExerciseId, MistakeEntry, Profile } from './types';

/* ============================================================================
   The memory model.

   A modified SM-2. Two departures from the textbook algorithm, both
   deliberate:

   1. Intervals are counted in *lessons*, not days. This app has no idea when
      you will next open it, and scheduling a review for "3 days" that lands
      in the middle of a 40-minute binge session helps nobody.

   2. A wrong answer is always due again in the very next lesson — interval is
      forced to 1 and the exact item that was missed is pushed onto a mistake
      queue, not merely its concept. Getting it wrong twice pins it to the next
      lesson again and raises its priority. Only once you clear it does it fall
      back into the normal expanding schedule.
   ========================================================================== */

export const INITIAL_MEMORY: ConceptMemory = {
  strength: 0,
  ease: 2.3,
  interval: 0,
  dueLesson: 0,
  lapses: 0,
  seen: 0,
  correct: 0,
  lastLesson: -1,
  streak: 0,
};

/** Expanding ladder, in lessons. Ease scales the step, not the ladder. */
const LADDER = [1, 2, 3, 5, 8, 13, 21];

export function memoryFor(profile: Profile, concept: ConceptId): ConceptMemory {
  return profile.concepts[concept] ?? { ...INITIAL_MEMORY };
}

export function nextInterval(memory: ConceptMemory, correct: boolean): number {
  if (!correct) return 1;
  const step = Math.min(memory.streak, LADDER.length - 1);
  const base = LADDER[step];
  return Math.max(1, Math.round(base * (memory.ease / 2.3)));
}

/**
 * Folds one answer into the concept's memory. Pure: returns the next memory
 * rather than mutating, which keeps the reducer in profile.ts easy to reason
 * about and the tests trivial.
 */
export function reviewConcept(
  memory: ConceptMemory,
  correct: boolean,
  lessonIndex: number,
  opts: { usedHint?: boolean; seconds?: number } = {},
): ConceptMemory {
  const next: ConceptMemory = { ...memory };
  next.seen += 1;
  next.lastLesson = lessonIndex;

  if (correct) {
    next.correct += 1;
    next.streak += 1;
    // A hint means they got there with scaffolding: real, but worth less.
    const gain = opts.usedHint ? 0.22 : 0.45;
    // Slow answers earn slightly less credit than fluent ones.
    const fluency = opts.seconds !== undefined && opts.seconds > 45 ? 0.75 : 1;
    next.strength = next.strength + (1 - next.strength) * gain * fluency;
    next.ease = Math.min(2.9, next.ease + (opts.usedHint ? 0.02 : 0.07));
  } else {
    next.lapses += 1;
    next.streak = 0;
    // Knock it down hard but never to zero — you did see it once.
    next.strength = Math.max(0.05, next.strength * 0.42);
    next.ease = Math.max(1.3, next.ease - 0.22);
  }

  next.interval = nextInterval(next, correct);
  next.dueLesson = lessonIndex + next.interval;
  return next;
}

/**
 * Adds (or escalates) a missed exercise on the mistake queue. The contract the
 * whole app leans on: whatever you got wrong, you see again next lesson.
 */
export function queueMistake(
  queue: MistakeEntry[],
  exerciseId: ExerciseId,
  concept: ConceptId,
  lessonIndex: number,
): MistakeEntry[] {
  const existing = queue.find((m) => m.exerciseId === exerciseId);
  if (existing) {
    return queue.map((m) =>
      m.exerciseId === exerciseId
        ? { ...m, misses: m.misses + 1, dueLesson: lessonIndex + 1, addedLesson: lessonIndex }
        : m,
    );
  }
  return [...queue, { exerciseId, concept, dueLesson: lessonIndex + 1, misses: 1, addedLesson: lessonIndex }];
}

/**
 * Clears an item once it has been answered correctly. One clean answer retires
 * a single miss; an item missed repeatedly has to be earned back more than
 * once, so a lucky guess cannot flush a genuinely shaky item off the queue.
 */
export function clearMistake(queue: MistakeEntry[], exerciseId: ExerciseId, lessonIndex: number): MistakeEntry[] {
  const entry = queue.find((m) => m.exerciseId === exerciseId);
  if (!entry) return queue;
  if (entry.misses <= 1) return queue.filter((m) => m.exerciseId !== exerciseId);
  return queue.map((m) =>
    m.exerciseId === exerciseId
      ? { ...m, misses: m.misses - 1, dueLesson: lessonIndex + Math.min(3, m.misses) }
      : m,
  );
}

/** Mistakes that must appear in the lesson about to be built, hardest first. */
export function dueMistakes(queue: MistakeEntry[], lessonIndex: number): MistakeEntry[] {
  return queue
    .filter((m) => m.dueLesson <= lessonIndex)
    .sort((a, b) => b.misses - a.misses || a.dueLesson - b.dueLesson);
}

/** Concepts whose review window has come round, weakest and most overdue first. */
export function dueConcepts(profile: Profile, lessonIndex: number): ConceptId[] {
  return Object.entries(profile.concepts)
    .filter(([, m]) => m.seen > 0 && m.dueLesson <= lessonIndex)
    .sort((a, b) => {
      const overdueA = lessonIndex - a[1].dueLesson;
      const overdueB = lessonIndex - b[1].dueLesson;
      const priorityA = overdueA * 0.6 + (1 - a[1].strength) * 4;
      const priorityB = overdueB * 0.6 + (1 - b[1].strength) * 4;
      return priorityB - priorityA;
    })
    .map(([id]) => id);
}

/**
 * Mastery decays if a concept goes untouched for many lessons, so a skill you
 * crowned twenty lessons ago and never revisited stops claiming to be solid.
 */
export function decayedStrength(memory: ConceptMemory, lessonIndex: number): number {
  if (memory.lastLesson < 0) return 0;
  const idle = Math.max(0, lessonIndex - memory.lastLesson);
  const halfLife = 18 + memory.ease * 8;
  return memory.strength * Math.pow(0.5, idle / halfLife);
}
