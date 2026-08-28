import { useEffect, useMemo, useState } from 'react';
import { Highlighted } from '@/ui/Code';
import type { MatchExercise } from '@/engine/types';
import { stableShuffle, type ElementProps } from './shared';

/**
 * Match two columns. Tap a term, tap its definition; a wrong pairing bounces
 * apart immediately rather than waiting for the Check button, because the
 * whole value of this element is fast recognition practice.
 */
export function MatchElement({ exercise, setResponse, grade }: ElementProps<MatchExercise>) {
  const left = useMemo(() => exercise.pairs.map(([l]) => l), [exercise]);
  const right = useMemo(
    () => stableShuffle(exercise.pairs.map(([, r]) => r), exercise.id),
    [exercise],
  );

  const [pairs, setPairs] = useState<Array<[string, string]>>([]);
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const locked = grade !== null;

  useEffect(() => {
    setPairs([]);
    setActiveLeft(null);
  }, [exercise.id]);

  useEffect(() => {
    setResponse(pairs.length ? { kind: 'match', pairs } : null);
  }, [pairs, setResponse]);

  const matchedLeft = new Set(pairs.map(([l]) => l));
  const matchedRight = new Set(pairs.map(([, r]) => r));
  const answerFor = new Map(exercise.pairs);

  const pickRight = (value: string) => {
    if (locked || !activeLeft || matchedRight.has(value)) return;
    if (answerFor.get(activeLeft) === value) {
      setPairs((p) => [...p, [activeLeft, value]]);
      setActiveLeft(null);
    } else {
      // Wrong pair: flash and reset, so the mistake is felt but not recorded
      // twice. The grader still sees an incomplete answer if they give up.
      setRejected(value);
      setTimeout(() => setRejected(null), 420);
      setActiveLeft(null);
    }
  };

  return (
    <div className="matchgrid">
      <div className="matchcol">
        {left.map((item) => {
          const done = matchedLeft.has(item);
          return (
            <button
              key={item}
              type="button"
              className={`matchcell${activeLeft === item ? ' is-active' : ''}${done ? ' is-done' : ''}`}
              onClick={() => !done && !locked && setActiveLeft(activeLeft === item ? null : item)}
              disabled={done || locked}
            >
              <Highlighted source={item} lang={exercise.lang} />
            </button>
          );
        })}
      </div>
      <div className="matchcol">
        {right.map((item) => {
          const done = matchedRight.has(item);
          return (
            <button
              key={item}
              type="button"
              className={`matchcell matchcell--right${done ? ' is-done' : ''}${rejected === item ? ' is-rejected' : ''}`}
              onClick={() => pickRight(item)}
              disabled={done || locked}
            >
              {item}
            </button>
          );
        })}
      </div>

      {locked && grade && !grade.correct ? (
        <div className="reveal reveal--wide">
          <p className="eyebrow">The pairs</p>
          <ul className="reveal__pairs">
            {exercise.pairs.map(([l, r]) => (
              <li key={l}>
                <code>
                  <Highlighted source={l} lang={exercise.lang} />
                </code>
                <span aria-hidden="true">—</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
