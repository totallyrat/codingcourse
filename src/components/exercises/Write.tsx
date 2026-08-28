import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/ui/primitives';
import { CodeEditor } from '@/ui/CodeEditor';
import { engineFor, runWriteExercise, type Engine, type RunOutcome } from '@/runtime';
import type { WriteExercise } from '@/engine/types';
import type { ElementProps } from './shared';

/**
 * Write code and run it.
 *
 * The run is real: a compiler or interpreter on this machine when one exists,
 * the bundled Python interpreter when it does not, and a plainly-labelled
 * structure check when neither is possible. The badge always says which,
 * because a learner who thinks their C++ compiled when it did not has been
 * taught something false.
 */
export function WriteElement({ exercise, setResponse, grade }: ElementProps<WriteExercise>) {
  const [source, setSource] = useState(exercise.starter);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [engine, setEngine] = useState<{ engine: Engine; label: string } | null>(null);
  const locked = grade !== null;

  useEffect(() => {
    setSource(exercise.starter);
    setOutcome(null);
    setResponse(null);
  }, [exercise.id, exercise.starter, setResponse]);

  useEffect(() => {
    let alive = true;
    void engineFor(exercise.runLang).then((e) => alive && setEngine(e));
    return () => {
      alive = false;
    };
  }, [exercise.runLang]);

  const run = useCallback(async () => {
    if (running || locked) return;
    setRunning(true);
    try {
      const result = await runWriteExercise(exercise, source);
      setOutcome(result);
      // Only a passing run counts as an answer — the Check button stays
      // disabled until the learner has actually made it work.
      setResponse(result.passed ? { kind: 'write', correct: true } : null);
    } finally {
      setRunning(false);
    }
  }, [exercise, source, running, locked, setResponse]);

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <CodeEditor
        value={source}
        onChange={(next) => {
          setSource(next);
          if (outcome) setOutcome(null);
          setResponse(null);
        }}
        lang={exercise.lang ?? exercise.runLang}
        readOnly={locked}
        onRun={run}
        minLines={Math.max(6, exercise.starter.split('\n').length + 2)}
        ariaLabel={`${exercise.runLang} editor`}
      />

      <div className="runbar">
        <Button size="sm" variant="outline" onClick={run} disabled={running || locked}>
          {running ? 'Running…' : 'Run'}
          <span className="kbd" style={{ marginLeft: 2 }}>
            Ctrl+↵
          </span>
        </Button>
        {engine ? (
          <span className={`runbadge runbadge--${engine.engine}`} title={engine.label}>
            {engine.engine === 'static' ? 'structure check only' : `runs on ${engine.label}`}
          </span>
        ) : null}
        <span className="spacer" />
        {outcome && !running ? (
          <span className={`runstatus${outcome.passed ? ' is-pass' : ''}`}>
            {outcome.passed
              ? 'All tests passed'
              : outcome.error
                ? 'Did not run'
                : `${outcome.tests.filter((t) => t.pass).length} of ${outcome.tests.length} tests passed`}
          </span>
        ) : null}
      </div>

      {outcome ? <RunPanel outcome={outcome} /> : null}

      {locked && grade && !grade.correct ? (
        <details className="reveal reveal--details">
          <summary>Show a working solution</summary>
          <CodeEditor value={exercise.solution} onChange={() => {}} lang={exercise.lang ?? exercise.runLang} readOnly />
        </details>
      ) : null}
    </div>
  );
}

function RunPanel({ outcome }: { outcome: RunOutcome }) {
  return (
    <div className="runpanel">
      {outcome.structural.length ? (
        <ul className="runpanel__rules">
          {outcome.structural.map((rule, i) => (
            <li key={i} className={rule.pass ? 'is-pass' : 'is-fail'}>
              <span aria-hidden="true">{rule.pass ? '✓' : '✕'}</span>
              {rule.required ? rule.label : `avoid: ${rule.label}`}
            </li>
          ))}
        </ul>
      ) : null}

      {outcome.error ? (
        <pre className="runpanel__error">{outcome.error}</pre>
      ) : null}

      {outcome.stdout ? (
        <div className="runpanel__section">
          <p className="eyebrow">Output</p>
          <pre className="runpanel__out">{outcome.stdout}</pre>
        </div>
      ) : null}

      {outcome.tests.length ? (
        <div className="runpanel__section">
          <p className="eyebrow">Tests</p>
          <table className="runtests">
            <tbody>
              {outcome.tests.map((test, i) => (
                <tr key={i} className={test.pass ? 'is-pass' : 'is-fail'}>
                  <td className="runtests__mark" aria-label={test.pass ? 'passed' : 'failed'}>
                    {test.pass ? '✓' : '✕'}
                  </td>
                  <td className="runtests__name">{test.name}</td>
                  <td className="runtests__detail">
                    {test.pass || test.hidden ? null : (
                      <>
                        <span className="muted">expected</span> <code>{oneLine(test.expected)}</code>{' '}
                        <span className="muted">got</span> <code>{oneLine(test.actual)}</code>
                      </>
                    )}
                    {!test.pass && test.hidden ? <span className="muted">hidden test</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function oneLine(text: string): string {
  const trimmed = text.replace(/\n+$/, '').replace(/\n/g, '⏎');
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || '(nothing)';
}
