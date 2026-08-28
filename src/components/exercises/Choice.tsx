import { useEffect } from 'react';
import { Code } from '@/ui/Code';
import type { ChoiceExercise, PredictExercise } from '@/engine/types';
import type { ElementProps } from './shared';

/**
 * Multiple choice, and its close relative "predict the output".
 *
 * Options are numbered so they can be answered from the keyboard, which is how
 * anyone doing this for twenty minutes an evening will actually want to work.
 */
export function ChoiceElement({ exercise, response, setResponse, grade }: ElementProps<ChoiceExercise>) {
  const multi = exercise.answer.length > 1;
  const picked = response?.kind === 'choice' ? response.picked : [];
  const locked = grade !== null;

  const toggle = (index: number) => {
    if (locked) return;
    if (multi) {
      const next = picked.includes(index) ? picked.filter((p) => p !== index) : [...picked, index];
      setResponse(next.length ? { kind: 'choice', picked: next } : null);
    } else {
      setResponse({ kind: 'choice', picked: [index] });
    }
  };

  useNumberKeys(exercise.options.length, toggle, locked);

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      {exercise.code ? <Code source={exercise.code} lang={exercise.lang} /> : null}
      {multi ? <p className="eyebrow">Select all that apply</p> : null}
      <OptionList
        options={exercise.options}
        picked={picked}
        answer={exercise.answer}
        locked={locked}
        onPick={toggle}
        mono={exercise.options.every((o) => /[(){};=<>[\]]|^\w+\.\w+/.test(o))}
      />
    </div>
  );
}

export function PredictElement({ exercise, response, setResponse, grade }: ElementProps<PredictExercise>) {
  const picked = response?.kind === 'predict' ? [response.picked] : [];
  const locked = grade !== null;
  const pick = (index: number) => {
    if (!locked) setResponse({ kind: 'predict', picked: index });
  };
  useNumberKeys(exercise.options.length, pick, locked);

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      <Code source={exercise.code} lang={exercise.lang} />
      <OptionList
        options={exercise.options}
        picked={picked}
        answer={[exercise.answer]}
        locked={locked}
        onPick={pick}
        mono
      />
    </div>
  );
}

function OptionList({
  options,
  picked,
  answer,
  locked,
  onPick,
  mono,
}: {
  options: string[];
  picked: number[];
  answer: number[];
  locked: boolean;
  onPick: (index: number) => void;
  mono?: boolean;
}) {
  return (
    <div className="options" role="listbox" aria-multiselectable={answer.length > 1}>
      {options.map((option, i) => {
        const isPicked = picked.includes(i);
        const isAnswer = answer.includes(i);
        // After checking: mark what they chose, and reveal a right answer they
        // missed. Never mark an option they did not touch as "wrong".
        const state = !locked
          ? isPicked
            ? 'picked'
            : ''
          : isPicked && isAnswer
            ? 'right'
            : isPicked
              ? 'wrong'
              : isAnswer
                ? 'missed'
                : '';
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={isPicked}
            className={`option${state ? ` is-${state}` : ''}`}
            onClick={() => onPick(i)}
            disabled={locked}
          >
            <span className="option__key">{i + 1}</span>
            <span className={`option__label${mono ? ' mono' : ''}`}>{option}</span>
            {locked && isAnswer ? <span className="option__mark">correct</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function useNumberKeys(count: number, onPick: (index: number) => void, locked: boolean) {
  useEffect(() => {
    if (locked) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault();
        onPick(n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [count, onPick, locked]);
}
