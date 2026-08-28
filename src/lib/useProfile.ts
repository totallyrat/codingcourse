import { useCallback, useEffect, useRef, useState } from 'react';
import { bridge } from './bridge';
import { createProfile, reconcileStreak } from '@/engine/progress';
import type { Profile } from '@/engine/types';

/**
 * The single source of truth for learner state.
 *
 * One profile object lives here; every screen reads it and mutates it through
 * `update`, which takes a pure function. Writes are debounced and go through
 * the Electron main process, which persists them atomically — so the app can
 * be closed mid-lesson without losing the streak.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<Profile | null>(null);

  useEffect(() => {
    let alive = true;
    void bridge.profile
      .load()
      .then((stored) => {
        if (!alive) return;
        const loaded = isProfile(stored) ? migrate(stored) : createProfile(newId());
        setProfile(reconcileStreak(loaded));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(createProfile(newId()));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A profile replaced from the File menu (import) must land in React state.
  useEffect(
    () =>
      bridge.profile.onReplaced((data) => {
        const payload = (data as { data?: unknown })?.data ?? data;
        if (isProfile(payload)) setProfile(reconcileStreak(migrate(payload)));
      }),
    [],
  );

  const persist = useCallback((next: Profile) => {
    latest.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (latest.current) void bridge.profile.save(latest.current);
    }, 220);
  }, []);

  const update = useCallback(
    (fn: (current: Profile) => Profile) => {
      setProfile((current) => {
        if (!current) return current;
        const next = fn(current);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // Flush on the way out, so the last few seconds are never lost.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current && latest.current) {
        window.clearTimeout(saveTimer.current);
        void bridge.profile.save(latest.current);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  return { profile, loading, update };
}

function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isProfile(value: unknown): value is Profile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'concepts' in value &&
    'lessonIndex' in value
  );
}

/**
 * Fills in anything a profile written by an older build is missing. There is
 * only one version so far, but the shape has to survive being read by a newer
 * app than the one that wrote it.
 */
function migrate(stored: Profile): Profile {
  const base = createProfile(stored.id || newId(), stored.name);
  return {
    ...base,
    ...stored,
    settings: { ...base.settings, ...(stored.settings ?? {}) },
    concepts: stored.concepts ?? {},
    exercises: stored.exercises ?? {},
    mistakes: stored.mistakes ?? [],
    days: stored.days ?? [],
    archived: stored.archived ?? [],
    crowned: stored.crowned ?? [],
    skillProgress: stored.skillProgress ?? {},
  };
}
