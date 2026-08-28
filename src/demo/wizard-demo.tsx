import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Wizard } from '@/screens/Wizard';
import { Button, Card, Chip } from '@/ui/primitives';
import { BitSays } from '@/mascot/BitSays';
import { trackById } from '@/content';
import { GOAL_LABEL, slotsForBudget } from '@/engine/courseBuilder';
import type { Course } from '@/engine/types';

import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/mascot.css';
import '@/styles/exercises.css';
import '@/styles/screens.css';
import './demo.css';

/**
 * A standalone build of the setup wizard, for sharing as a web page.
 *
 * It is the real component running the real scoring functions - the fit
 * percentages and the syllabus below are computed in the browser, not
 * pre-baked. What it cannot do is start a lesson, so finishing lands on a
 * summary of the course it just built instead.
 */
function Demo() {
  const [course, setCourse] = useState<Course | null>(null);
  const [run, setRun] = useState(0);

  if (!course) {
    return (
      <div className="app">
        <div className="demobar">
          <span className="demobar__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
              <path
                d="M9 9.5L6.5 12L9 14.5M15 9.5L17.5 12L15 14.5"
                stroke="#050506"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
          <span className="demobar__title">Codeling</span>
          <span className="demobar__sep">/</span>
          <span className="demobar__note">setup wizard, running for real</span>
        </div>
        <main className="app__main app__main--full">
          <Wizard key={run} onFinish={setCourse} />
        </main>
        <div className="grain" aria-hidden="true" />
      </div>
    );
  }

  const track = trackById(course.trackId)!;
  const byId = new Map(track.skills.map((s) => [s.id, s]));

  return (
    <div className="app">
      <div className="demobar">
        <span className="demobar__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15">
            <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
            <path
              d="M9 9.5L6.5 12L9 14.5M15 9.5L17.5 12L15 14.5"
              stroke="#050506"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </span>
        <span className="demobar__title">Codeling</span>
        <span className="demobar__sep">/</span>
        <span className="demobar__note">your course</span>
      </div>

      <main className="app__main">
        <div className="done">
          <div className="done__head">
            <p className="eyebrow">Built in your browser, just now</p>
            <h1>{track.name}</h1>
            <p className="done__sub">
              {course.syllabus.length} skills across {course.units.length} units, ordered by
              prerequisite and then by how well each one serves{' '}
              {GOAL_LABEL[course.answers.goal].toLowerCase()}. About{' '}
              {slotsForBudget(course.answers.minutesPerDay)} exercises a lesson.
            </p>
            <div className="chiprow" style={{ marginTop: 'var(--sp-4)' }}>
              <Chip tone="solid">{GOAL_LABEL[course.answers.goal]}</Chip>
              <Chip>{course.answers.minutesPerDay} min a day</Chip>
              {course.placed.length ? (
                <Chip>
                  {course.placed.length} skill{course.placed.length === 1 ? '' : 's'} already covered
                </Chip>
              ) : null}
              {course.answers.interests.map((i) => (
                <Chip key={i}>{i}</Chip>
              ))}
            </div>
          </div>

          <Card quiet className="done__note">
            <p className="eyebrow">What happens next in the app</p>
            <p className="muted" style={{ fontSize: 'var(--step--1)', lineHeight: 1.6 }}>
              Each lesson is assembled from this syllabus one at a time: anything you got wrong last
              lesson first, then concepts whose review interval has elapsed, then new material from the
              skill you are on. Nothing here was fetched from a server — the ranking and the ordering
              are scoring functions running on this page.
            </p>
          </Card>

          <div className="done__units">
            {course.units.map((unit, i) => (
              <section key={unit.id} className="preview__unit">
                <header className="preview__unithead">
                  <span className="preview__unitno">{String(i + 1).padStart(2, '0')}</span>
                  <h4>{unit.title}</h4>
                </header>
                <ul className="preview__skills">
                  {unit.skillIds.map((id) => {
                    const skill = byId.get(id);
                    if (!skill) return null;
                    return (
                      <li key={id}>
                        <div className="preview__skill">
                          <span className="preview__skillname">{skill.title}</span>
                          {course.placed.includes(id) ? <Chip>already covered</Chip> : null}
                        </div>
                        <p className="preview__blurb">{skill.blurb}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="done__foot">
            <BitSays
              mood="happy"
              line="That is the whole setup. Change an answer and the order changes with it."
              size={100}
            />
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setCourse(null);
                setRun((r) => r + 1);
              }}
            >
              Try different answers
            </Button>
          </div>
        </div>
      </main>
      <div className="grain" aria-hidden="true" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
