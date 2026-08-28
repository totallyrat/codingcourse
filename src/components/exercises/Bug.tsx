import { useEffect, useState } from 'react';
import { Code } from '@/ui/Code';
import type { BugExercise } from '@/engine/types';
import type { ElementProps } from './shared';

/**
 * Click the line that is wrong, then say why.
 *
 * Reading broken code is a separate skill from writing working code, and it is
 * the one most self-taught programmers never practise deliberately. The second
 * half — naming the cause — is what turns a lucky click into understanding.
 */
export function BugElement({ exercise, setResponse, grade }: ElementProps<BugExercise>) {
  const [line, setLine] = useState<number | null>(null);
  const [why, setWhy] = useState<number | null>(null);
  const locked = grade !== null;

  useEffect(() => {
    setLine(null);
    setWhy(null);
  }, [exercise.id]);

  useEffect(() => {
    if (line === null) {
      setResponse(null);
      return;
    }
    if (exercise.why && why === null) {
      setResponse(null);
      return;
    }
    setResponse({ kind: 'bug', line, why: why ?? undefined });
  }, [line, why, exercise.why, setResponse]);

  const marked = locked
    ? line !== null && line !== exercise.buggyLine
      ? [line, exercise.buggyLine]
      : [exercise.buggyLine]
    : line !== null
      ? [line]
      : [];

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      <p className="eyebrow">Click the line with the problem</p>
      <div className={`bugcode${locked ? ' is-locked' : ''}`} data-answer={exercise.buggyLine}>
        <Code
          source={exercise.code}
          lang={exercise.lang}
          highlightLines={marked}
          onLineClick={locked ? undefined : setLine}
        />
      </div>

      {exercise.why && (line !== null || locked) ? (
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          <p className="eyebrow">Why?</p>
          <div className="options">
            {exercise.why.options.map((option, i) => {
              const picked = why === i;
              const isAnswer = i === exercise.why!.answer;
              const state = !locked
                ? picked
                  ? 'picked'
                  : ''
                : picked && isAnswer
                  ? 'right'
                  : picked
                    ? 'wrong'
                    : isAnswer
                      ? 'missed'
                      : '';
              return (
                <button
                  key={i}
                  type="button"
                  className={`option${state ? ` is-${state}` : ''}`}
                  onClick={() => !locked && setWhy(i)}
                  disabled={locked}
                >
                  <span className="option__key">{i + 1}</span>
                  <span className="option__label">{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
