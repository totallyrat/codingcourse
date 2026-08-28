import { useEffect, useRef, useState } from 'react';
import type { TerminalExercise } from '@/engine/types';
import type { ElementProps } from './shared';

/**
 * A simulated shell.
 *
 * Nothing here touches the real machine — it is a prompt, a history and a
 * scripted response, which is exactly right for teaching commands whose real
 * versions delete files. The learner types the command, sees the output the
 * real one would print, and the answer is graded on the command itself.
 */
export function TerminalElement({ exercise, setResponse, grade, submit }: ElementProps<TerminalExercise>) {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = grade !== null;

  useEffect(() => {
    setCommand('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [exercise.id]);

  useEffect(() => {
    setResponse(command.trim() ? { kind: 'terminal', command } : null);
  }, [command, setResponse]);

  const shownOutput = locked && grade?.correct ? (exercise.output ?? []) : [];

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <div
        className={`term${locked ? (grade?.correct ? ' is-right' : ' is-wrong') : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="term__bar">
          <span className="term__dot" />
          <span className="term__dot" />
          <span className="term__dot" />
          <span className="term__path">{exercise.cwd ?? '~'}</span>
        </div>
        <div className="term__body">
          {exercise.intro?.map((line, i) => (
            <div key={`intro-${i}`} className="term__line term__line--muted">
              {line}
            </div>
          ))}
          <div className="term__prompt">
            <span className="term__sigil">{exercise.cwd ?? '~'} $</span>
            <input
              ref={inputRef}
              className="term__input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              readOnly={locked}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Terminal command"
              placeholder={locked ? '' : 'type a command and press Enter'}
            />
          </div>
          {shownOutput.map((line, i) => (
            <div key={`out-${i}`} className="term__line">
              {line}
            </div>
          ))}
          {locked && !grade?.correct ? (
            <div className="term__line term__line--hint">
              {exercise.accept[0]}
              <span className="term__hintnote">  &lt;- one command that works</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
