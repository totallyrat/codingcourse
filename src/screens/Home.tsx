import { useMemo } from 'react';
import { Button, Card, Chip, Progress, Ring } from '@/ui/primitives';
import { Bit } from '@/mascot/Bit';
import { conceptLabel, exercisesForTrack, trackById } from '@/content';
import { activeSkill, isSkillUnlocked, skillMastery, weakestConcepts } from '@/engine/lessonComposer';
import { dueMistakes } from '@/engine/scheduler';
import { levelFromXp, streakState, xpToday } from '@/engine/progress';
import { slotsForBudget } from '@/engine/courseBuilder';
import type { Profile, Skill } from '@/engine/types';

/**
 * The course map.
 *
 * One clear next action at the top — because on most days the only decision a
 * learner should have to make is whether to start — and the whole syllabus
 * below it, so the shape of the journey is always visible rather than being
 * revealed one node at a time.
 */
export function Home({
  profile,
  onStart,
  onReview,
  onOpenStats,
}: {
  profile: Profile;
  onStart: () => void;
  onReview: () => void;
  onOpenStats: () => void;
}) {
  const course = profile.course!;
  const track = trackById(course.trackId)!;
  const skills = useMemo(() => new Map(track.skills.map((s) => [s.id, s])), [track]);
  const current = activeSkill(profile, course, track);
  const level = levelFromXp(profile.xp);
  const today = xpToday(profile);
  const streak = streakState(profile);
  const due = dueMistakes(profile.mistakes, profile.lessonIndex);
  const weak = weakestConcepts(profile, 3);
  const slots = slotsForBudget(course.answers.minutesPerDay);
  const libraryCount = exercisesForTrack(track.id).length;

  const done = course.syllabus.filter((id) => {
    const s = skills.get(id);
    return s ? skillMastery(profile, s) >= 0.75 : false;
  }).length;

  return (
    <div className="home">
      <header className="home__top">
        <div>
          <p className="eyebrow">{track.name}</p>
          <h2>{greeting()}</h2>
        </div>
        <div className="home__stats">
          <Stat
            label={streak === 'at-risk' ? 'streak at risk' : 'day streak'}
            value={profile.streak}
            tone={streak === 'at-risk' ? 'streak' : undefined}
          />
          <Stat label={`level ${level.level}`} value={profile.xp} suffix="XP" />
          <div className="home__goal">
            <Ring value={today / Math.max(1, profile.settings.dailyGoalXp)} size={46} stroke={4}>
              <span className="home__goalnum">{Math.min(999, today)}</span>
            </Ring>
            <span className="home__goallabel">
              of {profile.settings.dailyGoalXp} XP
              <br />
              today
            </span>
          </div>
        </div>
      </header>

      <div className="home__hero">
        <Card className="home__continue">
          <div className="home__continuebody">
            <p className="eyebrow">
              Lesson {profile.lessonIndex + 1} · {slots} exercises · about {course.answers.minutesPerDay} min
            </p>
            <h3>{current.title}</h3>
            <p className="muted">{current.blurb}</p>
            <div className="home__mix">
              {due.length ? <Chip tone="wrong">{due.length} to re-check</Chip> : null}
              <Chip>{Math.round(skillMastery(profile, current) * 100)}% known</Chip>
              <Chip>
                {done}/{course.syllabus.length} skills
              </Chip>
            </div>
            <div className="home__cta">
              <Button variant="primary" size="lg" onClick={onStart}>
                {profile.lessonIndex === 0 ? 'Start your first lesson' : 'Continue'}
              </Button>
              <Button variant="ghost" onClick={onReview} disabled={!profile.mistakes.length && !weak.length}>
                Practise weak spots
              </Button>
            </div>
          </div>
          <div className="home__mascot">
            <Bit mood={streak === 'at-risk' ? 'thinking' : profile.streak > 2 ? 'happy' : 'idle'} size={124} />
          </div>
        </Card>

        <div className="home__side">
          <Card quiet className="home__weak">
            <p className="eyebrow">Where you are shaky</p>
            {weak.length ? (
              <ul className="weaklist">
                {weak.map((w) => (
                  <li key={w.concept}>
                    <span>{conceptLabel(w.concept)}</span>
                    <span className="weaklist__bar">
                      <Progress value={w.strength} slim />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ fontSize: 'var(--step--1)' }}>
                Nothing yet. Finish a lesson and this fills in.
              </p>
            )}
            <button type="button" className="linkbtn" onClick={onOpenStats}>
              See all progress
            </button>
          </Card>

          <Card quiet className="home__note">
            <p className="eyebrow">How this course was built</p>
            <p className="muted" style={{ fontSize: 'var(--step--1)', lineHeight: 1.6 }}>
              {course.syllabus.length} skills were sorted by prerequisite, then ranked against your answers.
              Each lesson is drawn from {libraryCount} {track.name} exercises, with anything you got wrong
              scheduled for the very next one.
            </p>
          </Card>
        </div>
      </div>

      <section className="home__map">
        <div className="home__maphead">
          <h4>Your course</h4>
          <span className="muted">
            {done} of {course.syllabus.length} skills
          </span>
        </div>

        {course.units.map((unit, unitIndex) => (
          <div key={unit.id} className="unit">
            <div className="unit__head">
              <span className="unit__no">{String(unitIndex + 1).padStart(2, '0')}</span>
              <h5>{unit.title}</h5>
              <span className="unit__rule" />
            </div>
            <div className="unit__skills">
              {unit.skillIds.map((id) => {
                const skill = skills.get(id);
                if (!skill) return null;
                return (
                  <SkillNode
                    key={id}
                    skill={skill}
                    mastery={skillMastery(profile, skill)}
                    unlocked={isSkillUnlocked(profile, course, track, id)}
                    current={id === current.id}
                    placed={course.placed.includes(id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function SkillNode({
  skill,
  mastery,
  unlocked,
  current,
  placed,
}: {
  skill: Skill;
  mastery: number;
  unlocked: boolean;
  current: boolean;
  placed: boolean;
}) {
  const state = current ? 'current' : mastery >= 0.75 ? 'done' : unlocked ? 'open' : 'locked';
  return (
    <div className={`skillnode is-${state}`}>
      <div className="skillnode__ring">
        <Ring value={mastery} size={44} stroke={3}>
          {state === 'done' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : state === 'locked' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2" fill="currentColor" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : (
            <span className="skillnode__pct">{Math.round(mastery * 100)}</span>
          )}
        </Ring>
      </div>
      <div className="skillnode__text">
        <span className="skillnode__title">
          {skill.title}
          {placed ? <Chip>skipped ahead</Chip> : null}
          {current ? <Chip tone="solid">next</Chip> : null}
        </span>
        <span className="skillnode__blurb">{skill.blurb}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: 'streak';
}) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__value">
        {value.toLocaleString()}
        {suffix ? <span className="stat__suffix">{suffix}</span> : null}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}
