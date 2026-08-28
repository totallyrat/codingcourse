import { useMemo, useState } from 'react';
import { Button, Chip, Progress } from '@/ui/primitives';
import { BitSays } from '@/mascot/BitSays';
import { LIBRARY_SIZE, TRACKS, trackById } from '@/content';
import { GOAL_LABEL, buildCourse, recommendTracks, slotsForBudget, type TrackScore } from '@/engine/courseBuilder';
import type { Course, Experience, Goal, Interest, TrackId, WizardAnswers } from '@/engine/types';

/**
 * First-run setup.
 *
 * Six short steps, each one question. The last two are the point of the whole
 * thing: the app shows *which* tracks fit and why, then shows the syllabus it
 * generated before the learner commits to it. Nothing is hidden behind a
 * "personalising your course…" spinner, because there is no service to wait
 * for — the ordering is computed here, in front of them.
 */

const GOALS: Array<{ id: Goal; title: string; blurb: string }> = [
  { id: 'games', title: 'Games', blurb: 'Engines, gameplay, graphics' },
  { id: 'web', title: 'Websites and apps for the web', blurb: 'Pages, interfaces, front ends' },
  { id: 'apps', title: 'Desktop and mobile apps', blurb: 'Tools people install and open' },
  { id: 'data', title: 'Data and analysis', blurb: 'Queries, charts, models' },
  { id: 'automation', title: 'Automating dull work', blurb: 'Scripts that save you an hour a week' },
  { id: 'systems', title: 'Low-level and systems', blurb: 'Performance, memory, the metal' },
  { id: 'interviews', title: 'Passing an interview', blurb: 'Fundamentals under time pressure' },
  { id: 'curious', title: 'Honestly, just curious', blurb: 'Show me what this is about' },
];

const EXPERIENCE: Array<{ id: Experience; title: string; blurb: string }> = [
  { id: 'none', title: 'Never written any code', blurb: 'We start from the first line' },
  { id: 'some', title: 'Dabbled a bit', blurb: 'A tutorial or two, nothing stuck' },
  { id: 'confident', title: 'Comfortable in one language', blurb: 'Skip the basics, go deeper' },
  { id: 'pro', title: 'I do this for a living', blurb: 'Straight to the advanced material' },
];

const INTERESTS: Array<{ id: Interest; label: string }> = [
  { id: 'games', label: 'Games' },
  { id: 'web', label: 'The web' },
  { id: 'apps', label: 'Apps' },
  { id: 'data', label: 'Data' },
  { id: 'automation', label: 'Automation' },
  { id: 'systems', label: 'Systems' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'interviews', label: 'Interviews' },
];

const MINUTES = [5, 10, 15, 20, 30];

const STEP_LINES = [
  'Hello. I am Bit. Two minutes of questions and you will have a course.',
  'Good to know. That decides which language is actually worth your time.',
  'No wrong answer here — it only changes where the course starts.',
  'Anything you already know makes the next language much faster.',
  'Short and daily beats long and occasional. Pick what you will really do.',
  'Here is what fits, and why. Have a look before you pick.',
  'This is your course. Every lesson is assembled from it, one at a time.',
];

export function Wizard({ onFinish }: { onFinish: (course: Course) => void }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [prior, setPrior] = useState<TrackId[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [hearts, setHearts] = useState(true);
  const [trackId, setTrackId] = useState<TrackId | null>(null);
  const [showAll, setShowAll] = useState(false);

  const ranked = useMemo<TrackScore[]>(() => {
    if (!goal || !experience) return [];
    return recommendTracks(TRACKS, { goal, experience, interests, priorLanguages: prior, minutesPerDay: minutes });
  }, [goal, experience, interests, prior, minutes]);

  const answers: WizardAnswers | null =
    goal && experience && trackId
      ? { trackId, goal, experience, minutesPerDay: minutes, interests, priorLanguages: prior, hearts }
      : null;

  const course = useMemo(() => {
    if (!answers) return null;
    const track = trackById(answers.trackId);
    return track ? buildCourse(track, answers) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers?.trackId, answers?.goal, answers?.experience, answers?.minutesPerDay, JSON.stringify(interests)]);

  const canContinue = [
    true,
    goal !== null,
    experience !== null,
    true,
    true,
    trackId !== null,
    course !== null,
  ][step];

  const next = () => setStep((s) => Math.min(6, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="wizard">
      <div className="wizard__progress">
        <Progress value={step} max={6} slim label="Setup progress" />
      </div>

      <div className="wizard__stage" key={step}>
        {step === 0 ? (
          <Welcome />
        ) : step === 1 ? (
          <Step title="What do you want to make?" sub="This is the biggest single factor in what you should learn.">
            <div className="cardgrid">
              {GOALS.map((g) => (
                <PickCard
                  key={g.id}
                  title={g.title}
                  blurb={g.blurb}
                  selected={goal === g.id}
                  onClick={() => {
                    setGoal(g.id);
                    setTrackId(null);
                  }}
                />
              ))}
            </div>
          </Step>
        ) : step === 2 ? (
          <Step title="How much have you done before?" sub="Be honest — overshooting here is the usual reason people give up.">
            <div className="cardgrid cardgrid--two">
              {EXPERIENCE.map((e) => (
                <PickCard
                  key={e.id}
                  title={e.title}
                  blurb={e.blurb}
                  selected={experience === e.id}
                  onClick={() => {
                    setExperience(e.id);
                    setTrackId(null);
                  }}
                />
              ))}
            </div>
          </Step>
        ) : step === 3 ? (
          <Step title="Anything you already know?" sub="Optional. Related languages let the course skip ahead and move faster.">
            <div className="chiprow">
              {TRACKS.filter((t) => t.kind === 'language').map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pill${prior.includes(t.id) ? ' is-on' : ''}`}
                  onClick={() => toggle(prior, t.id, setPrior)}
                  aria-pressed={prior.includes(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </Step>
        ) : step === 4 ? (
          <Step title="How you want to work" sub="Lesson length follows your daily budget. Both are changeable later.">
            <div className="stack" style={{ gap: 'var(--sp-6)' }}>
              <div className="stack" style={{ gap: 'var(--sp-3)' }}>
                <p className="eyebrow">Minutes a day</p>
                <div className="chiprow">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`pill${minutes === m ? ' is-on' : ''}`}
                      onClick={() => setMinutes(m)}
                      aria-pressed={minutes === m}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 'var(--step--1)' }}>
                  About {slotsForBudget(minutes)} exercises per lesson.
                </p>
              </div>

              <div className="stack" style={{ gap: 'var(--sp-3)' }}>
                <p className="eyebrow">Topics you care about</p>
                <div className="chiprow">
                  {INTERESTS.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className={`pill${interests.includes(i.id) ? ' is-on' : ''}`}
                      onClick={() => toggle(interests, i.id, setInterests)}
                      aria-pressed={interests.includes(i.id)}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="switchrow">
                <input type="checkbox" checked={hearts} onChange={(e) => setHearts(e.target.checked)} />
                <span>
                  <strong>Use hearts</strong>
                  <span className="muted"> — five mistakes ends a lesson. Turn it off for pure practice.</span>
                </span>
              </label>
            </div>
          </Step>
        ) : step === 5 ? (
          <Step
            title="What fits you"
            sub={`Scored against your answers across ${TRACKS.length} tracks. Nothing here is a guess about you personally — it is a weighted match.`}
          >
            <div className="stack" style={{ gap: 'var(--sp-2)' }}>
              {(showAll ? ranked : ranked.slice(0, 4)).map((r) => (
                <TrackRow
                  key={r.track.id}
                  score={r}
                  selected={trackId === r.track.id}
                  onClick={() => setTrackId(r.track.id)}
                />
              ))}
              {!showAll && ranked.length > 4 ? (
                <button type="button" className="linkbtn" onClick={() => setShowAll(true)}>
                  Show the other {ranked.length - 4} tracks
                </button>
              ) : null}
            </div>
          </Step>
        ) : (
          <CoursePreview course={course} minutes={minutes} />
        )}
      </div>

      <div className="wizard__foot">
        <div className="wizard__mascot">
          <BitSays
            mood={step === 0 ? 'wave' : step === 6 ? 'celebrate' : 'idle'}
            line={STEP_LINES[step]}
            size={96}
          />
        </div>
        <div className="wizard__actions">
          {step > 0 ? (
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            disabled={!canContinue}
            onClick={() => {
              if (step === 6 && course) onFinish(course);
              else next();
            }}
          >
            {step === 0 ? 'Get started' : step === 6 ? 'Start learning' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="welcome">
      <p className="eyebrow">Codeling</p>
      <h1>
        Learn to code
        <br />
        the way you learn
        <br />
        <em>a language.</em>
      </h1>
      <p className="welcome__body">
        Short daily lessons, assembled from a library of {LIBRARY_SIZE} exercises by an algorithm that
        watches what you get wrong. No account, no subscription, no AI service — everything runs on this
        machine, and it works with the network unplugged.
      </p>
      <div className="welcome__facts">
        <div>
          <strong>{TRACKS.length}</strong>
          <span>tracks, languages and engines</span>
        </div>
        <div>
          <strong>10</strong>
          <span>kinds of exercise</span>
        </div>
        <div>
          <strong>{LIBRARY_SIZE}</strong>
          <span>exercises in the library</span>
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <div className="step__head">
        <h2>{title}</h2>
        {sub ? <p className="step__sub">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

function PickCard({
  title,
  blurb,
  selected,
  onClick,
}: {
  title: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`pickcard${selected ? ' is-on' : ''}`} onClick={onClick} aria-pressed={selected}>
      <span className="pickcard__title">{title}</span>
      <span className="pickcard__blurb">{blurb}</span>
    </button>
  );
}

function TrackRow({ score, selected, onClick }: { score: TrackScore; selected: boolean; onClick: () => void }) {
  const { track, reasons, caution } = score;
  const pct = Math.round(score.score * 100);
  return (
    <button type="button" className={`trackrow${selected ? ' is-on' : ''}`} onClick={onClick} aria-pressed={selected}>
      <span className="trackrow__mark">{track.mark}</span>
      <span className="trackrow__body">
        <span className="trackrow__head">
          <span className="trackrow__name">{track.name}</span>
          <span className="trackrow__tag">{track.tagline}</span>
        </span>
        <span className="trackrow__reasons">
          {reasons.length ? reasons.join(' · ') : 'A solid general choice'}
        </span>
        {caution ? <span className="trackrow__caution">{caution}</span> : null}
      </span>
      <span className="trackrow__fit">
        <span className="trackrow__pct">{pct}%</span>
        <span className="trackrow__fitlabel">fit</span>
      </span>
    </button>
  );
}

function CoursePreview({ course, minutes }: { course: Course | null; minutes: number }) {
  if (!course) return null;
  const track = trackById(course.trackId)!;
  const byId = new Map(track.skills.map((s) => [s.id, s]));
  const placed = new Set(course.placed);
  const rationale = new Map(course.rationale.map((r) => [r.skillId, r]));

  return (
    <div className="step">
      <div className="step__head">
        <h2>Your {track.name} course</h2>
        <p className="step__sub">
          {course.syllabus.length} skills across {course.units.length} units, ordered by prerequisite and then by
          how well each one serves {GOAL_LABEL[course.answers.goal].toLowerCase()}. About {minutes} minutes a day.
        </p>
      </div>

      <div className="preview">
        {course.units.map((unit, unitIndex) => (
          <section key={unit.id} className="preview__unit">
            <header className="preview__unithead">
              <span className="preview__unitno">{String(unitIndex + 1).padStart(2, '0')}</span>
              <h4>{unit.title}</h4>
            </header>
            <ul className="preview__skills">
              {unit.skillIds.map((id) => {
                const skill = byId.get(id);
                if (!skill) return null;
                const why = rationale.get(id);
                return (
                  <li key={id}>
                    <div className="preview__skill">
                      <span className="preview__skillname">{skill.title}</span>
                      {placed.has(id) ? <Chip>already covered</Chip> : null}
                      {why?.reasons.length ? <span className="preview__why">{why.reasons[0]}</span> : null}
                    </div>
                    <p className="preview__blurb">{skill.blurb}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
