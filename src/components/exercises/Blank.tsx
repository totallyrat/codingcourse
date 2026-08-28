import { useEffect, useMemo, useRef, useState } from 'react';
import { Highlighted } from '@/ui/Code';
import { splitTemplate } from '@/engine/grader';
import type { BlankExercise } from '@/engine/types';
import type { ElementProps } from './shared';

/**
 * Fill the gaps in a snippet.
 *
 * The inputs sit inline in the code, sized to the answer they expect, so the
 * shape of the line still reads correctly while you are filling it in. Enter
 * moves to the next blank and submits from the last one, which makes the whole
 * exercise doable without touching the mouse.
 */
export function BlankElement({ exercise, setResponse, grade, submit }: ElementProps<BlankExercise>) {
  const parts = useMemo(() => splitTemplate(exercise.template), [exercise.template]);
  const [values, setValues] = useState<string[]>(() => exercise.blanks.map(() => ''));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const locked = grade !== null;

  useEffect(() => {
    setValues(exercise.blanks.map(() => ''));
    requestAnimationFrame(() => inputs.current[0]?.focus());
  }, [exercise.id, exercise.blanks]);

  useEffect(() => {
    setResponse(values.some((v) => v.trim()) ? { kind: 'blank', values } : null);
  }, [values, setResponse]);

  const isRight = (index: number) =>
    exercise.blanks[index].accept.some(
      (a) => a.replace(/\s+/g, '') === (values[index] ?? '').replace(/\s+/g, ''),
    );

  // Text runs are highlighted as a block so colouring stays consistent across
  // the gaps, then split back out around each blank.
  const rendered: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if ('text' in part) {
      rendered.push(
        <span key={`t${i}`}>
          <Highlighted source={part.text} lang={exercise.lang} />
        </span>,
      );
      return;
    }
    const index = part.blank;
    const blank = exercise.blanks[index];
    const width = blank.width ?? Math.max(4, blank.accept[0].length + 1);
    const state = locked ? (isRight(index) ? 'right' : 'wrong') : '';
    rendered.push(
      <span key={`b${i}`} className="blankwrap">
        <input
          ref={(el) => {
            inputs.current[index] = el;
          }}
          className={`blank${state ? ` is-${state}` : ''}`}
          style={{ width: `${width}ch` }}
          value={values[index] ?? ''}
          onChange={(e) => {
            const next = values.slice();
            next[index] = e.target.value;
            setValues(next);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const nextInput = inputs.current[index + 1];
            if (nextInput) nextInput.focus();
            else submit();
          }}
          readOnly={locked}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={`Blank ${index + 1} of ${exercise.blanks.length}`}
          placeholder={blank.placeholder ?? ''}
        />
        {locked && !isRight(index) ? <span className="blank__fix">{blank.accept[0]}</span> : null}
      </span>,
    );
  });

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <pre className="code blanks">{rendered}</pre>
    </div>
  );
}
