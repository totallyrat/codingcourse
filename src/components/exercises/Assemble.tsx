import { useEffect, useMemo, useState } from 'react';
import { Code, Highlighted } from '@/ui/Code';
import type { AssembleExercise } from '@/engine/types';
import { stableShuffle, type ElementProps } from './shared';

/**
 * Build a line of code from tiles — the signature exercise of language apps,
 * borrowed here because it is genuinely the right shape for syntax: it teaches
 * order and structure without demanding recall of every character.
 *
 * Tapping is the primary interaction (fastest, and works on any input device);
 * tiles can also be dragged into place, and the whole thing is operable from
 * the keyboard.
 */
export function AssembleElement({ exercise, setResponse, grade }: ElementProps<AssembleExercise>) {
  const tray = useMemo(
    () => stableShuffle([...exercise.answer, ...(exercise.distractors ?? [])], exercise.id),
    [exercise],
  );

  const [placed, setPlaced] = useState<number[]>([]);
  const locked = grade !== null;

  useEffect(() => {
    setPlaced([]);
  }, [exercise.id]);

  useEffect(() => {
    setResponse(placed.length ? { kind: 'assemble', tiles: placed.map((i) => tray[i]) } : null);
  }, [placed, tray, setResponse]);

  const place = (index: number) => {
    if (locked || placed.includes(index)) return;
    setPlaced((p) => [...p, index]);
  };
  const remove = (position: number) => {
    if (locked) return;
    setPlaced((p) => p.filter((_, i) => i !== position));
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      {exercise.code ? <Code source={exercise.code} lang={exercise.lang} /> : null}

      <div
        className={`assemble__slot${placed.length ? ' has-tiles' : ''}${locked ? (grade?.correct ? ' is-right' : ' is-wrong') : ''}`}
        onPointerUp={() => {
          if (dragIndex !== null) {
            place(dragIndex);
            setDragIndex(null);
          }
        }}
        aria-label="Your answer"
      >
        {placed.length === 0 ? (
          <span className="assemble__placeholder">Tap the pieces below in order</span>
        ) : (
          placed.map((tileIndex, position) => (
            <button
              key={`${tileIndex}-${position}`}
              type="button"
              className="tile tile--placed"
              onClick={() => remove(position)}
              disabled={locked}
              aria-label={`Remove ${tray[tileIndex]}`}
            >
              <Highlighted source={tray[tileIndex]} lang={exercise.lang} />
            </button>
          ))
        )}
      </div>

      <div className="assemble__tray" aria-label="Available pieces">
        {tray.map((tile, i) => {
          const used = placed.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`tile${used ? ' is-used' : ''}${dragIndex === i ? ' is-dragging' : ''}`}
              onClick={() => place(i)}
              onPointerDown={() => !used && !locked && setDragIndex(i)}
              onPointerUp={() => setDragIndex(null)}
              disabled={used || locked}
              aria-hidden={used}
            >
              <Highlighted source={tile} lang={exercise.lang} />
            </button>
          );
        })}
      </div>

      {locked && grade && !grade.correct ? (
        <div className="reveal">
          <p className="eyebrow">The answer</p>
          <code className="reveal__line">
            <Highlighted source={exercise.answer.join(' ')} lang={exercise.lang} />
          </code>
        </div>
      ) : null}
    </div>
  );
}
