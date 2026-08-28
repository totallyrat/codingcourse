import { useEffect, useMemo, useState } from 'react';
import { Highlighted } from '@/ui/Code';
import { useDragOrder } from '@/ui/useDragOrder';
import type { OrderExercise } from '@/engine/types';
import { stableShuffle, type ElementProps } from './shared';

/**
 * Drag whole lines into the right order.
 *
 * The lines arrive in the correct order in the content file and are shuffled
 * here with a seed derived from the exercise id, so the same exercise always
 * presents the same starting jumble — a learner who sees it again is solving
 * the same puzzle, not a new one.
 */
export function OrderElement({ exercise, setResponse, grade }: ElementProps<OrderExercise>) {
  const initial = useMemo(() => {
    const all = [...exercise.lines, ...(exercise.decoys ?? [])];
    let shuffled = stableShuffle(all, exercise.id);
    // A shuffle that happens to produce the answer is not a puzzle.
    if (shuffled.join('\n') === exercise.lines.join('\n')) {
      shuffled = stableShuffle(all, `${exercise.id}!`);
    }
    return shuffled;
  }, [exercise]);

  const [lines, setLines] = useState<string[]>(initial);
  const locked = grade !== null;

  useEffect(() => {
    setLines(initial);
  }, [initial]);

  useEffect(() => {
    setResponse({ kind: 'order', lines });
    // Re-reporting on every reorder keeps the parent's response in sync
    // without the element needing to know when Check is pressed.
  }, [lines, setResponse]);

  const reorder = (from: number, to: number) => {
    setLines((current) => {
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const drag = useDragOrder(lines.length, reorder, locked);
  const correctIndex = (line: string, index: number) => exercise.lines[index] === line;

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <p className="eyebrow">Drag to reorder — or focus a line and use Space then the arrow keys</p>
      <ol className="orderlist" aria-label="Reorderable code lines">
        {lines.map((line, i) => {
          const isDragging = drag.dragging === i;
          const shift = drag.shiftFor(i);
          const state = locked ? (correctIndex(line, i) ? 'right' : 'wrong') : '';
          return (
            <li
              key={`${line}-${i}`}
              ref={drag.registerItem(i)}
              className={[
                'orderline',
                isDragging ? 'is-dragging' : '',
                drag.lifted === i ? 'is-lifted' : '',
                state ? `is-${state}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                transform: isDragging ? `translateY(${drag.offset}px)` : shift ? `translateY(${shift}px)` : undefined,
              }}
              tabIndex={locked ? -1 : 0}
              onPointerDown={drag.onPointerDown(i)}
              onKeyDown={drag.onKeyDown(i)}
              aria-grabbed={isDragging || drag.lifted === i}
            >
              <span className="orderline__grip" aria-hidden="true">
                <svg width="10" height="16" viewBox="0 0 10 16">
                  {[3, 8, 13].map((y) => (
                    <g key={y}>
                      <circle cx="2" cy={y} r="1.2" fill="currentColor" />
                      <circle cx="8" cy={y} r="1.2" fill="currentColor" />
                    </g>
                  ))}
                </svg>
              </span>
              <code className="orderline__code">
                <Highlighted source={line || ' '} lang={exercise.lang} />
              </code>
              <span className="orderline__no">{i + 1}</span>
            </li>
          );
        })}
      </ol>
      {locked && grade && !grade.correct ? (
        <div className="reveal">
          <p className="eyebrow">The right order</p>
          <ol className="reveal__list">
            {exercise.lines.map((line, i) => (
              <li key={i}>
                <code>
                  <Highlighted source={line || ' '} lang={exercise.lang} />
                </code>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
