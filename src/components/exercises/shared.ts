import type { Grade, Response } from '@/engine/grader';
import type { Exercise } from '@/engine/types';

/**
 * Every element type takes the same props, which is what lets the lesson
 * player treat them interchangeably and the composer mix them freely.
 *
 * The parent owns `response` so the Check button can read it; the element owns
 * the interaction. Once `grade` is set the element is read-only and shows the
 * correct answer alongside what the learner did.
 */
export interface ElementProps<E extends Exercise = Exercise> {
  exercise: E;
  response: Response | null;
  setResponse: (response: Response | null) => void;
  /** null until the answer has been checked. */
  grade: Grade | null;
  /** Ask the player to check the current answer (used for Enter-to-submit). */
  submit: () => void;
}

/** Seeded shuffle so options do not jump around between renders. */
export function stableShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
