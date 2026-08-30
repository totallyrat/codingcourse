import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { hashString, mulberry32 } from '@/engine/rng';
import { BOOST_LESSONS, INSTANT_XP, type ShopItemId } from '@/engine/progress';

/* ============================================================================
   Opening a chest.

   A chest that opens the instant you tap it is a message box with a picture on
   it. This one is stuck: it takes somewhere between five and fifteen hits, it
   shakes harder as the lid gives, the light behind it grows, and then it goes
   — the lid spins off, and whatever was inside is thrown out and lands.

   The number of hits is rolled per chest so it is never quite the same twice,
   and the item itself is rolled by the engine at the moment it bursts, so
   nothing here knows the answer any earlier than the person tapping does.
   ========================================================================== */

const MIN_HITS = 5;
const MAX_HITS = 15;

export const ITEM_ART: Record<ShopItemId, JSX.Element> = {
  streakSaver: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6c6 8 12 11 12 19a12 12 0 0 1-24 0c0-4 2-7 4-9 1 2 2 3 4 3 0-6 2-10 4-13z" fill="currentColor" />
    </svg>
  ),
  superBoost: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M26 4L12 26h9l-3 18 17-24h-10z" fill="currentColor" />
    </svg>
  ),
  instantXp: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  ),
  lessonSkip: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 10l16 14-16 14z" fill="currentColor" />
      <rect x="30" y="10" width="6" height="28" rx="2" fill="currentColor" />
    </svg>
  ),
  chest: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 20a16 8 0 0 1 32 0v4H8z" fill="currentColor" />
      <rect x="8" y="24" width="32" height="16" rx="3" fill="currentColor" opacity="0.75" />
    </svg>
  ),
};

export const ITEM_NAME: Record<ShopItemId, string> = {
  streakSaver: 'Streak Saver',
  superBoost: 'Super Boost',
  instantXp: `${INSTANT_XP} XP`,
  lessonSkip: 'Lesson Skip',
  chest: 'Another chest',
};

export const ITEM_BLURB: Record<ShopItemId, string> = {
  streakSaver: 'Miss a day and this is spent instead of your streak.',
  superBoost: `Double XP for your next ${BOOST_LESSONS} lessons.`,
  instantXp: 'Straight into today, and towards today’s goal.',
  lessonSkip: 'Credits a skill as passed. It still comes back for review.',
  chest: 'One more to break open.',
};

export function ChestOpener({
  open,
  seed,
  onRoll,
  onClose,
}: {
  open: boolean;
  /** Makes the number of hits differ from chest to chest, but stay put across a re-render. */
  seed: string;
  /** Called once, at the moment the lid goes. Returns what was inside. */
  onRoll: () => ShopItemId | null;
  onClose: () => void;
}) {
  const [hits, setHits] = useState(0);
  const [phase, setPhase] = useState<'shut' | 'burst' | 'done'>('shut');
  const [prize, setPrize] = useState<ShopItemId | null>(null);
  const [shake, setShake] = useState(0);
  const needed = useRef(MIN_HITS);

  useEffect(() => {
    if (!open) return;
    const rand = mulberry32(hashString(seed));
    needed.current = MIN_HITS + Math.floor(rand() * (MAX_HITS - MIN_HITS + 1));
    setHits(0);
    setPhase('shut');
    setPrize(null);
    setShake(0);
  }, [open, seed]);

  const hit = useCallback(() => {
    if (phase !== 'shut') return;
    const next = hits + 1;
    setHits(next);
    setShake((n) => n + 1);
    if (next < needed.current) {
      haptic('tap');
      return;
    }
    // It goes.
    haptic('win');
    setPrize(onRoll());
    setPhase('burst');
    window.setTimeout(() => setPhase('done'), 760);
  }, [hits, phase, onRoll]);

  if (!open) return null;

  const strain = Math.min(1, hits / Math.max(1, needed.current));

  return (
    <div className="chestbox">
      <p className="chestbox__lead">
        {phase === 'shut'
          ? hits === 0
            ? 'It is stuck. Hit it.'
            : strain > 0.66
              ? 'It is giving. Keep going.'
              : 'Again.'
          : 'Open.'}
      </p>

      <button
        type="button"
        className={`chest chest--${phase}`}
        onClick={hit}
        disabled={phase !== 'shut'}
        aria-label={phase === 'shut' ? 'Hit the chest to open it' : 'The chest is open'}
        style={{ ['--strain' as string]: strain.toFixed(3) }}
      >
        <span className="chest__glow" aria-hidden="true" />
        <span className="chest__rays" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} style={{ transform: `rotate(${i * 36}deg)` }} />
          ))}
        </span>

        {/* The prize, thrown out of the lid and landing in front. */}
        {prize ? (
          <span className="chest__prize" aria-hidden="true">
            {ITEM_ART[prize]}
          </span>
        ) : null}

        <svg className="chest__art" viewBox="0 0 120 96" key={shake} aria-hidden="true">
          {/* base */}
          <rect className="chest__body" x="14" y="40" width="92" height="46" rx="7" />
          {/* the inside, which only shows once the lid has gone */}
          <rect className="chest__mouth" x="19" y="40" width="82" height="12" rx="5" />
          <rect className="chest__band" x="52" y="40" width="16" height="46" />
          <rect className="chest__lock" x="54" y="54" width="12" height="14" rx="3" />
          {/* lid */}
          <g className="chest__lid">
            <path d="M14 44a46 22 0 0 1 92 0v3H14z" />
            <rect className="chest__band" x="52" y="22" width="16" height="25" />
          </g>
        </svg>

        <span className="chest__hits" aria-hidden="true">
          {phase === 'shut' ? Array.from({ length: hits }, (_, i) => <i key={i} />) : null}
        </span>
      </button>

      {phase === 'done' && prize ? (
        <div className="chestbox__prize">
          <h3>{ITEM_NAME[prize]}</h3>
          <p>{ITEM_BLURB[prize]}</p>
          <button type="button" className="bigbtn" onClick={onClose} autoFocus>
            Take it
          </button>
        </div>
      ) : (
        <p className="chestbox__hint">
          {phase === 'shut' ? 'Tap it as fast as you like.' : ' '}
        </p>
      )}
    </div>
  );
}
