import { useMemo, useState } from 'react';
import { Button, Chip, Progress, Ring } from '@/ui/primitives';
import { Bit } from '@/mascot/Bit';
import { Sheet } from './Sheet';
import { tiltGaze } from './tilt';
import { haptic } from '@/lib/haptics';
import { conceptLabel, trackById } from '@/content';
import { activeSkill, isSkillUnlocked, skillMastery, weakestConcepts } from '@/engine/lessonComposer';
import { dueMistakes } from '@/engine/scheduler';
import { levelFromXp, streakState, xpToday } from '@/engine/progress';
import { slotsForBudget } from '@/engine/courseBuilder';
import type { Profile, Skill } from '@/engine/types';

/**
 * The phone home screen.
 *
 * Same information as the desktop one, arranged for a thumb: one decision at
 * the top, then the course as a path you scroll down rather than a grid you
 * scan across. Every node is tappable and says where it stands, because on a
 * small screen the map is the only place the shape of the course is visible.
 */
export function MobileHome({
  profile,
  onStart,
  onReview,
}: {
  profile: Profile;
  onStart: () => void;
  onReview: () => void;
}) {
  const course = profile.course!;
  const track = trackById(course.trackId)!;
  const skills = useMemo(() => new Map(track.skills.map((s) => [s.id, s])), [track]);
  const current = activeSkill(profile, course, track);
  const level = levelFromXp(profile.xp);
  const today = xpToday(profile);
  const streak = streakState(profile);
  const due = dueMistakes(profile.mistakes, profile.lessonIndex);
  const weak = weakestConcepts(profile, 4);
  const slots = slotsForBudget(course.answers.minutesPerDay);
  const [open, setOpen] = useState<Skill | null>(null);

  const done = course.syllabus.filter((id) => {
    const s = skills.get(id);
    return s ? skillMastery(profile, s) >= 0.75 : false;
  }).length;

  let nodeIndex = 0;

  return (
    <div className="mhome">
      <div className="mhome__greet">
        <p className="eyebrow">{track.name}</p>
        <h2>{greeting()}</h2>
      </div>

      <div className="mstrip" data-noswipe>
        <div className={`mstat${streak === 'at-risk' ? ' is-warn' : ''}`}>
          <span className="mstat__value">{profile.streak}</span>
          <span className="mstat__label">{streak === 'at-risk' ? 'streak at risk' : 'day streak'}</span>
        </div>
        <div className="mstat">
          <span className="mstat__value">{profile.xp.toLocaleString()}</span>
          <span className="mstat__label">XP · level {level.level}</span>
        </div>
        <div className="mstat mstat--ring">
          <Ring value={today / Math.max(1, profile.settings.dailyGoalXp)} size={40} stroke={4}>
            <span className="mstat__ringnum">{Math.min(999, today)}</span>
          </Ring>
          <span className="mstat__label">
            of {profile.settings.dailyGoalXp} XP
            <br />
            today
          </span>
        </div>
      </div>

      <div className="mcontinue">
        <div className="mcontinue__bit">
          <Bit
            mood={streak === 'at-risk' ? 'thinking' : profile.streak > 2 ? 'happy' : 'idle'}
            size={104}
            trackPointer={false}
            gazeSource={tiltGaze}
          />
        </div>
        <p className="eyebrow">
          Lesson {profile.lessonIndex + 1} · {slots} exercises · about {course.answers.minutesPerDay} min
        </p>
        <h3>{current.title}</h3>
        <p className="muted mcontinue__blurb">{current.blurb}</p>
        <div className="mcontinue__chips">
          {due.length ? <Chip tone="wrong">{due.length} to re-check</Chip> : null}
          <Chip>{Math.round(skillMastery(profile, current) * 100)}% known</Chip>
          <Chip>
            {done}/{course.syllabus.length} skills
          </Chip>
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          className="mbtn"
          onClick={() => {
            haptic('tap');
            onStart();
          }}
        >
          {profile.lessonIndex === 0 ? 'Start your first lesson' : 'Continue'}
        </Button>
        <button
          type="button"
          className="mcontinue__second"
          disabled={!profile.mistakes.length && !weak.length}
          onClick={() => {
            haptic('tap');
            onReview();
          }}
        >
          Practise weak spots
        </button>
      </div>

      {weak.length ? (
        <div className="mweak">
          <p className="eyebrow">Where you are shaky</p>
          <div className="mweak__row" data-noswipe>
            {weak.map((w) => (
              <div key={w.concept} className="mweak__card">
                <span className="mweak__name">{conceptLabel(w.concept)}</span>
                <Progress value={w.strength} slim />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="mpath">
        <div className="mpath__head">
          <h4>Your course</h4>
          <span className="muted">
            {done} of {course.syllabus.length} skills
          </span>
        </div>

        {course.units.map((unit, unitIndex) => (
          <div key={unit.id} className="mpath__unit">
            <div className="mpath__unithead">
              <span className="mpath__unitno">{String(unitIndex + 1).padStart(2, '0')}</span>
              <h5>{unit.title}</h5>
            </div>
            {unit.skillIds.map((id) => {
              const skill = skills.get(id);
              if (!skill) return null;
              const mastery = skillMastery(profile, skill);
              const unlocked = isSkillUnlocked(profile, course, track, id);
              const state = id === current.id ? 'current' : mastery >= 0.75 ? 'done' : unlocked ? 'open' : 'locked';
              nodeIndex += 1;
              return (
                <button
                  key={id}
                  type="button"
                  className={`mnode is-${state}`}
                  style={{ animationDelay: `${Math.min(nodeIndex * 24, 400)}ms` }}
                  onClick={() => {
                    haptic('tap');
                    setOpen(skill);
                  }}
                >
                  <span className="mnode__dot">
                    <Ring value={mastery} size={54} stroke={3}>
                      {state === 'done' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : state === 'locked' ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="4" y="10" width="16" height="11" rx="2" fill="currentColor" />
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      ) : (
                        <span className="mnode__pct">{Math.round(mastery * 100)}</span>
                      )}
                    </Ring>
                  </span>
                  <span className="mnode__text">
                    <span className="mnode__title">{skill.title}</span>
                    <span className="mnode__blurb">{skill.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </section>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open ? (
          <SkillDetail
            skill={open}
            profile={profile}
            isCurrent={open.id === current.id}
            unlocked={isSkillUnlocked(profile, course, track, open.id)}
            onStart={() => {
              setOpen(null);
              onStart();
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function SkillDetail({
  skill,
  profile,
  isCurrent,
  unlocked,
  onStart,
}: {
  skill: Skill;
  profile: Profile;
  isCurrent: boolean;
  unlocked: boolean;
  onStart: () => void;
}) {
  const mastery = skillMastery(profile, skill);
  return (
    <div className="skilldetail">
      <p className="muted">{skill.blurb}</p>
      <div className="skilldetail__bar">
        <Progress value={mastery} tone={mastery >= 0.75 ? 'right' : undefined} />
        <span className="skilldetail__pct">{Math.round(mastery * 100)}%</span>
      </div>
      <p className="eyebrow">What it covers</p>
      <div className="chiprow">
        {skill.concepts.map((c) => (
          <Chip key={c}>{conceptLabel(c)}</Chip>
        ))}
      </div>
      {isCurrent ? (
        <Button variant="primary" size="lg" block className="mbtn" onClick={onStart}>
          Start this lesson
        </Button>
      ) : (
        <p className="muted skilldetail__note">
          {mastery >= 0.75
            ? 'You have this one. It still comes back for review when the scheduler thinks it is fading.'
            : unlocked
              ? 'Unlocked. The course reaches it once the current skill is solid — or sooner, as a stretch item.'
              : 'Locked until the skills it depends on are solid. That order is not decoration; it is what the course is.'}
        </p>
      )}
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
