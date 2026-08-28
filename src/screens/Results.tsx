import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Progress } from '@/ui/primitives';
import { BitSays } from '@/mascot/BitSays';
import { KIND_LABEL } from '@/components/exercises';
import { conceptLabel } from '@/content';
import { levelFromXp, xpToday } from '@/engine/progress';
import type { Profile } from '@/engine/types';
import type { LessonResult } from './Lesson';

/**
 * End of lesson.
 *
 * The important panel is the one listing what will come back next time. That
 * promise is the app's whole contract with the learner, so it is stated
 * explicitly rather than left to be discovered.
 */
export function Results({
  result,
  profile,
  xpEarned,
  onContinue,
  onAgain,
}: {
  result: LessonResult;
  profile: Profile;
  xpEarned: number;
  onContinue: () => void;
  onAgain: () => void;
}) {
  const accuracy = result.total ? result.correct / result.total : 0;
  const minutes = Math.max(1, Math.round(result.seconds / 60));
  const level = levelFromXp(profile.xp);
  const today = xpToday(profile);
  const goalMet = today >= profile.settings.dailyGoalXp;

  const [shown, setShown] = useState(0);
  useEffect(() => {
    // Count the XP up rather than snapping to it — the one place a little
    // theatre is worth the milliseconds.
    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(xpEarned * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xpEarned]);

  const line = useMemo(() => {
    if (result.outOfHearts) return 'Hearts gone. That happens — the ones you missed come back next time.';
    if (result.perfect) return 'A clean sweep. Nothing to re-check from this one.';
    if (accuracy >= 0.8) return 'Strong lesson. I have kept the few you missed for next time.';
    if (accuracy >= 0.5) return 'Solid work. The tricky ones are queued up for the next lesson.';
    return 'That was a hard one. Everything you missed comes straight back — that is the point.';
  }, [result, accuracy]);

  return (
    <div className="results">
      <div className="results__head">
        <p className="eyebrow">{result.lesson.title}</p>
        <h1>
          {result.outOfHearts ? 'Out of hearts' : result.perfect ? 'Perfect' : 'Lesson complete'}
        </h1>
      </div>

      <div className="results__grid">
        <Card className="results__score">
          <div className="scoreline">
            <span className="scoreline__big">{result.correct}</span>
            <span className="scoreline__of">/ {result.total}</span>
            <span className="scoreline__label">correct</span>
          </div>
          <Progress value={accuracy} tone={accuracy >= 0.8 ? 'right' : undefined} />
          <div className="results__pills">
            <Chip tone="streak">+{shown} XP</Chip>
            <Chip>{minutes} min</Chip>
            <Chip>
              {profile.streak} day streak
            </Chip>
            {goalMet ? <Chip tone="right">daily goal met</Chip> : null}
          </div>
          <div className="results__level">
            <span className="muted">Level {level.level}</span>
            <Progress value={level.into} max={level.needed} slim />
            <span className="muted">{level.needed - level.into} XP to level {level.level + 1}</span>
          </div>
        </Card>

        <Card quiet className="results__next">
          <p className="eyebrow">Coming back next lesson</p>
          {result.missed.length ? (
            <ul className="nextlist">
              {result.missed.map((slot) => (
                <li key={slot.exercise.id}>
                  <span className="nextlist__kind">{KIND_LABEL[slot.exercise.kind]}</span>
                  <span className="nextlist__concept">{conceptLabel(slot.exercise.concepts[0])}</span>
                  <span className="nextlist__prompt">{slot.exercise.prompt}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: 'var(--step--1)' }}>
              Nothing. You got everything right, so the next lesson is all new material plus whatever is due
              for review.
            </p>
          )}
        </Card>
      </div>

      <div className="results__foot">
        <BitSays
          mood={result.perfect ? 'celebrate' : accuracy >= 0.6 ? 'happy' : 'idle'}
          line={line}
          size={104}
        />
        <div className="row" style={{ gap: 10 }}>
          <Button variant="ghost" onClick={onAgain}>
            Another lesson
          </Button>
          <Button variant="primary" size="lg" onClick={onContinue}>
            Done for now
          </Button>
        </div>
      </div>
    </div>
  );
}
