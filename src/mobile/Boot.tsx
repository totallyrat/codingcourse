import { useEffect, useState } from 'react';
import { Mascot } from '@/mascot/Mascot';

/* ============================================================================
   The opening.

   Every time the app is opened, before anything else: a ring drawing itself,
   the mascot landing inside it, the name arriving a letter at a time, and then
   the whole thing lifting away. It runs over the top of the app while the
   profile loads off disk, so the wait it covers is a wait that was happening
   anyway.

   It is deliberately short. An animation you cannot skip is a tax on every
   session, so this one is paid off in under two seconds — and in a tenth of
   that when the system asks for less motion.
   ========================================================================== */

const WORD = 'CODELING';
/** How long the whole thing is on screen before it starts leaving. */
const HOLD = 1500;
const FADE = 420;

export function Boot({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in');

  useEffect(() => {
    const reduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reduceMotion === 'true';
    const hold = reduced ? 260 : HOLD;
    const fade = reduced ? 120 : FADE;
    const a = window.setTimeout(() => setPhase('out'), hold);
    const b = window.setTimeout(() => {
      setPhase('gone');
      onDone?.();
    }, hold + fade);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [onDone]);

  if (phase === 'gone') return null;

  return (
    <div className={`boot${phase === 'out' ? ' is-out' : ''}`} aria-hidden="true">
      <div className="boot__stage">
        <svg className="boot__ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" />
        </svg>
        <div className="boot__mascot">
          <Mascot mood="happy" size={128} trackPointer={false} />
        </div>
      </div>
      <h1 className="boot__word">
        {WORD.split('').map((letter, i) => (
          <span key={i} style={{ animationDelay: `${420 + i * 46}ms` }}>
            {letter}
          </span>
        ))}
      </h1>
      <span className="boot__rule" />
    </div>
  );
}
