import { useEffect, useState } from 'react';
import { Mascot, speciesFor } from '@/mascot/Mascot';
import { Confetti } from './Confetti';
import { GemIcon } from './Shop';
import { haptic } from '@/lib/haptics';
import type { LevelChange } from '@/engine/levels';
import type { AvatarConfig } from '@/engine/types';

/* ============================================================================
   The end of a lesson.

   Three numbers, one animal, and a button. Everything else that used to be
   here — which items come back, the level curve, the day log — is still in the
   app, on the screens built to hold it. What somebody wants in the four
   seconds after finishing a lesson is to be told they did it.
   ========================================================================== */

export interface CelebrationProps {
  correct: number;
  total: number;
  seconds: number;
  xpEarned: number;
  gemsEarned: number;
  boosted: boolean;
  level: LevelChange;
  streak: number;
  seed: number;
  /** Quests this lesson finished — a chest each. */
  questsCompleted: number;
  /** Hard Mode, when it was earned: how many were played and how many won. */
  hardTotal: number;
  hardCorrect: number;
  /** The learner's own mascot, if they have made one. */
  avatar: AvatarConfig | null;
  onContinue: () => void;
  onAgain: () => void;
}

export function Celebration(props: CelebrationProps) {
  const { correct, total, seconds, xpEarned, gemsEarned, level, boosted, streak, seed, questsCompleted, avatar } = props;
  const { hardTotal, hardCorrect } = props;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const perfect = correct === total && total > 0;
  const species = speciesFor(seed);
  const [shownXp, setShownXp] = useState(0);

  useEffect(() => {
    haptic(perfect ? 'win' : 'right');
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 900);
      setShownXp(Math.round(xpEarned * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xpEarned, perfect]);

  const headline =
    level.moved === 'up'
      ? `Level ${level.state.level}`
      : hardTotal > 0 && hardCorrect === hardTotal
        ? 'Cleared it all'
        : perfect
          ? 'Perfect'
          : accuracy >= 70
            ? 'Lesson done'
            : 'That was a hard one';

  return (
    <div className="celebrate">
      <Confetti run={perfect || level.moved === 'up'} from={0.34} />

      <div className="celebrate__stage">
        {/* Your own creature turns up every other lesson, once you have made one. */}
        <Mascot
          species={species.id}
          custom={avatar && seed % 2 === 0 ? avatar : null}
          mood="celebrate"
          size={190}
          trackPointer={false}
        />
      </div>

      <h1 className="celebrate__title">{headline}</h1>
      {level.moved === 'up' ? (
        <p className="celebrate__sub">You proved it over several lessons. Harder material from here.</p>
      ) : level.moved === 'down' ? (
        <p className="celebrate__sub">Easing the level back a step. Nothing lost — build the run again.</p>
      ) : (
        <p className="celebrate__sub">
          {(avatar && seed % 2 === 0 ? avatar.name : species.name) || species.name} approves.
        </p>
      )}

      <div className="scoreboard">
        <div className="scoreboard__cell">
          <span className="scoreboard__value">
            {shownXp}
            {boosted ? <em>×2</em> : null}
          </span>
          <span className="scoreboard__label">XP</span>
        </div>
        <div className="scoreboard__cell">
          <span className="scoreboard__value">{accuracy}%</span>
          <span className="scoreboard__label">correct</span>
        </div>
        <div className="scoreboard__cell">
          <span className="scoreboard__value">
            <GemIcon />
            {gemsEarned}
          </span>
          <span className="scoreboard__label">gems</span>
        </div>
      </div>

      {hardTotal ? (
        <p className="celebrate__hard">
          <span>Hard Mode</span> {hardCorrect} of {hardTotal}
        </p>
      ) : null}

      {questsCompleted ? (
        <p className="celebrate__quests">
          {questsCompleted} quest{questsCompleted === 1 ? '' : 's'} complete ·{' '}
          {questsCompleted === 1 ? 'a chest' : `${questsCompleted} chests`} waiting in the shop
        </p>
      ) : null}

      <p className="celebrate__line">
        {correct} of {total} · {Math.max(1, Math.round(seconds / 60))} min · {streak} day streak
      </p>

      <div className="celebrate__actions">
        <button type="button" className="bigbtn" onClick={props.onContinue}>
          Continue
        </button>
        <button type="button" className="ghostbtn" onClick={props.onAgain}>
          One more lesson
        </button>
      </div>
    </div>
  );
}
