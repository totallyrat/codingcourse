import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, Hearts, Progress } from '@/ui/primitives';
import { Bit, type BitMood } from '@/mascot/Bit';
import { ExerciseElement, KIND_LABEL } from '@/components/exercises';
import { grade as gradeAnswer, type Grade, type Response } from '@/engine/grader';
import { recordAnswer } from '@/engine/progress';
import { tipsFor } from '@/engine/tips';
import { conceptLabel } from '@/content';
import type { Lesson, LessonSlot, Profile } from '@/engine/types';

const MAX_HEARTS = 5;

const PRAISE = ['Correct.', 'That is it.', 'Exactly right.', 'Yes.', 'Nicely done.', 'Spot on.'];
const NUDGE = ['Not quite.', 'Close.', 'Not this time.', 'Almost.'];

export interface LessonResult {
  lesson: Lesson;
  correct: number;
  total: number;
  seconds: number;
  perfect: boolean;
  missed: LessonSlot[];
  /** Items that came back from the re-check queue and were answered right. */
  rechecksCleared: number;
  outOfHearts: boolean;
}

/**
 * The lesson player.
 *
 * One exercise at a time, then a verdict that always explains itself. The
 * explanation is not optional decoration: being told *why* is the difference
 * between this and a quiz app, and it is shown whether the answer was right or
 * wrong, because a lucky guess is exactly when somebody most needs the reason.
 */
export function Lesson({
  lesson,
  profile,
  onUpdate,
  onFinish,
  onQuit,
}: {
  lesson: Lesson;
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  onFinish: (result: LessonResult) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<Response | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [breaking, setBreaking] = useState(false);
  // How many of the escalating tips are on screen. The question stays open
  // and answerable at every step; only "show the answer" gives up.
  const [tipsShown, setTipsShown] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [rechecksCleared, setRechecksCleared] = useState(0);
  const [missed, setMissed] = useState<LessonSlot[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const startedAt = useRef(Date.now());
  const itemStartedAt = useRef(Date.now());
  const slot = lesson.slots[index];
  const useHearts = profile.settings.hearts;

  const mood: BitMood = grade ? (grade.correct ? 'happy' : 'wrong') : tipsShown > 0 ? 'thinking' : 'idle';
  const tips = useMemo(() => (slot ? tipsFor(slot.exercise) : []), [slot]);

  useEffect(() => {
    itemStartedAt.current = Date.now();
    setResponse(null);
    setGrade(null);
    setTipsShown(0);
  }, [index]);

  const check = useCallback(
    (forceWrong = false) => {
      if (grade || !slot) return;
      const answer: Response = forceWrong
        ? ({ kind: slot.exercise.kind, ...emptyResponse(slot.exercise.kind) } as Response)
        : response!;
      if (!forceWrong && !response) return;

      const result = forceWrong ? { correct: false, detail: undefined } : gradeAnswer(slot.exercise, answer);
      const seconds = (Date.now() - itemStartedAt.current) / 1000;

      setGrade(result);
      onUpdate((p) =>
        recordAnswer(p, slot.exercise, { correct: result.correct, seconds, usedHint: tipsShown > 0 }),
      );

      if (result.correct) {
        setCorrect((c) => c + 1);
        if (slot.source === 'recheck') setRechecksCleared((n) => n + 1);
      } else {
        setMissed((m) => [...m, slot]);
        if (useHearts) {
          setBreaking(true);
          setHearts((h) => Math.max(0, h - 1));
          setTimeout(() => setBreaking(false), 560);
        }
      }
    },
    [grade, slot, response, tipsShown, onUpdate, useHearts],
  );

  const advance = useCallback(() => {
    const isLast = index === lesson.slots.length - 1;
    const dead = useHearts && hearts === 0;
    if (isLast || dead) {
      onFinish({
        lesson,
        correct,
        total: lesson.slots.length,
        seconds: (Date.now() - startedAt.current) / 1000,
        perfect: correct === lesson.slots.length,
        missed,
        rechecksCleared,
        outOfHearts: dead,
      });
      return;
    }
    setIndex((i) => i + 1);
  }, [index, lesson, correct, missed, rechecksCleared, hearts, useHearts, onFinish]);

  // Enter drives the whole lesson: check, then continue.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      const inEditor = target?.tagName === 'TEXTAREA';
      if (inEditor && !e.ctrlKey && !e.metaKey) return;
      if (target?.tagName === 'INPUT' && !grade) return;
      e.preventDefault();
      if (grade) advance();
      else if (response) check();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [grade, response, check, advance]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmQuit(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const feedbackLine = useMemo(() => {
    if (!grade) return '';
    const pool = grade.correct ? PRAISE : NUDGE;
    return pool[index % pool.length];
  }, [grade, index]);

  if (!slot) return null;

  return (
    <div className="lesson">
      <header className="lesson__bar">
        <button type="button" className="lesson__quit" onClick={() => setConfirmQuit(true)} aria-label="Leave lesson">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="lesson__progress">
          <Progress value={index + (grade ? 1 : 0)} max={lesson.slots.length} label="Lesson progress" />
        </div>
        {useHearts ? <Hearts left={hearts} total={MAX_HEARTS} breaking={breaking} /> : <Chip>practice</Chip>}
      </header>

      <div className="lesson__body">
        <div className="lesson__main" key={slot.exercise.id}>
          <div className="lesson__meta">
            <Chip>{KIND_LABEL[slot.exercise.kind]}</Chip>
            {slot.source === 'recheck' ? (
              <Chip tone="wrong">
                back again{slot.misses && slot.misses > 1 ? ` · missed ${slot.misses}×` : ''}
              </Chip>
            ) : slot.source === 'review' ? (
              <Chip>review</Chip>
            ) : slot.source === 'stretch' ? (
              <Chip tone="streak">a look ahead</Chip>
            ) : null}
            <span className="spacer" />
            <span className="lesson__concept">{conceptLabel(slot.exercise.concepts[0])}</span>
          </div>

          <h3 className="lesson__prompt">{slot.exercise.prompt}</h3>

          <ExerciseElement
            exercise={slot.exercise}
            response={response}
            setResponse={setResponse}
            grade={grade}
            submit={() => check()}
          />

          {tipsShown > 0 && !grade ? (
            <div className="tips">
              {tips.slice(0, tipsShown).map((tip, i) => (
                <div className="hintbox" key={tip.label}>
                  <strong>{tip.label}</strong>
                  <span>{tip.body}</span>
                  {i === tipsShown - 1 && tipsShown < tips.length ? null : null}
                </div>
              ))}
              {tipsShown >= tips.length ? (
                <p className="tips__last">
                  Still stuck? Showing the answer counts this one wrong — and puts it back in the next
                  lesson, which is the point.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <footer className={`lesson__foot${grade ? (grade.correct ? ' is-right' : ' is-wrong') : ''}`}>
        <div className="lesson__footinner">
          {grade ? (
            <div className="verdict">
              <div className="verdict__mascot">
                <Bit mood={mood} size={78} trackPointer={false} />
              </div>
              <div className="verdict__text">
                <p className="verdict__line">
                  {feedbackLine}
                  {grade.detail ? <span className="verdict__detail"> {grade.detail}</span> : null}
                </p>
                {slot.exercise.explain ? <p className="verdict__explain">{slot.exercise.explain}</p> : null}
              </div>
              <Button variant={grade.correct ? 'right' : 'wrong'} size="lg" onClick={advance} autoFocus>
                {index === lesson.slots.length - 1 || (useHearts && hearts === 0) ? 'Finish' : 'Continue'}
              </Button>
            </div>
          ) : (
            <div className="lesson__controls">
              {tipsShown < tips.length ? (
                <Button variant="ghost" onClick={() => setTipsShown((n) => n + 1)}>
                  {tipsShown === 0 ? 'I am stuck' : 'Another tip'}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => check(true)}>
                  Show the answer
                </Button>
              )}
              <span className="spacer" />
              <Button variant="primary" size="lg" disabled={!response} onClick={() => check()}>
                Check
              </Button>
            </div>
          )}
        </div>
      </footer>

      {confirmQuit ? (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setConfirmQuit(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h3>Leave this lesson?</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              The {index} answer{index === 1 ? '' : 's'} you have given are already saved — including anything to
              re-check. You will start a fresh lesson next time.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setConfirmQuit(false)}>
                Keep going
              </Button>
              <Button onClick={onQuit}>Leave</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A deliberately empty answer, used by the "I am stuck" path. */
function emptyResponse(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'choice':
      return { picked: [] };
    case 'predict':
      return { picked: -1 };
    case 'assemble':
      return { tiles: [] };
    case 'order':
      return { lines: [] };
    case 'blank':
      return { values: [] };
    case 'match':
      return { pairs: [] };
    case 'bug':
      return { line: -1 };
    case 'wire':
      return { links: [] };
    case 'terminal':
      return { command: '' };
    default:
      return { correct: false };
  }
}
