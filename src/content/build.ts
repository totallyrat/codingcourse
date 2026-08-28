import type { Exercise, TrackId } from '@/engine/types';

/** Omit that distributes across a union, so the discriminant survives. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export type Draft = DistributiveOmit<Exercise, 'track'>;

/**
 * Stamps the track id onto a list of exercise drafts. Content files stay free
 * of a `track: 'python'` line repeated three hundred times, and it becomes
 * impossible to file an exercise under the wrong track by typo.
 */
export function forTrack(trackId: TrackId, drafts: Draft[]): Exercise[] {
  return drafts.map((draft) => ({ ...draft, track: trackId }) as Exercise);
}
