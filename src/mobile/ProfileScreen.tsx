import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from '@/mascot/Mascot';
import { GemIcon } from './Shop';
import { tiltGaze } from './tilt';
import { conceptLabel, trackById } from '@/content';
import { skillMastery, weakestConcepts } from '@/engine/lessonComposer';
import { levelFor, levelFromXp, todayKey, xpToday } from '@/engine/progress';
import { MAX_LEVEL, levelBlurb, runNeeded } from '@/engine/levels';
import { weeklyXp } from '@/engine/leaderboard';
import type { Profile } from '@/engine/types';

/* ============================================================================
   Profile.

   Where Progress used to be, and deliberately mostly bars. A number with a bar
   behind it says "here is how far along you are" in one glance; the same
   number in a paragraph says nothing until you have read the paragraph.

   `replayFrom` is the post-lesson mode: every bar mounts holding the value it
   had *before* the lesson and is released a beat later, top of the screen
   first, so you watch the lesson you just finished move each one.
   ========================================================================== */

export function ProfileScreen({
  profile,
  replayFrom,
  onSettings,
  onEditAvatar,
}: {
  profile: Profile;
  replayFrom?: Profile | null;
  onSettings: () => void;
  onEditAvatar: () => void;
}) {
  const course = profile.course;
  const track = course ? trackById(course.trackId) : undefined;
  const level = levelFromXp(profile.xp);
  const ladder = levelFor(profile, course?.trackId ?? '');
  const today = xpToday(profile);
  const replayRef = useRef<HTMLDivElement>(null);

  const beforeLevel = replayFrom ? levelFromXp(replayFrom.xp) : null;
  const beforeLadder = replayFrom ? levelFor(replayFrom, course?.trackId ?? '') : null;

  const skillBars = useMemo(() => {
    if (!course || !track) return [];
    const byId = new Map(track.skills.map((s) => [s.id, s]));
    return course.syllabus
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((skill) => ({
        id: skill.id,
        title: skill.title,
        value: skillMastery(profile, skill),
        from: replayFrom ? skillMastery(replayFrom, skill) : undefined,
      }))
      .filter((row) => row.value > 0.02)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [course, track, profile, replayFrom]);

  const weak = useMemo(() => {
    const now = weakestConcepts(profile, 3);
    const before = replayFrom ? new Map(weakestConcepts(replayFrom, 12).map((w) => [w.concept, w.strength])) : null;
    return now.map((row) => ({ ...row, from: before?.get(row.concept) }));
  }, [profile, replayFrom]);

  const week = useMemo(() => {
    const out: Array<{ label: string; xp: number; today: boolean }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      out.push({
        label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.getDay()],
        xp: profile.days.find((d) => d.date === key)?.xp ?? 0,
        today: key === todayKey(now),
      });
    }
    return out;
  }, [profile.days]);

  const weekMax = Math.max(profile.settings.dailyGoalXp, ...week.map((d) => d.xp));
  const doneSkills = (p: Profile) =>
    course && track
      ? course.syllabus.filter((id) => {
          const skill = track.skills.find((s) => s.id === id);
          return skill ? skillMastery(p, skill) >= 0.75 : false;
        }).length
      : 0;
  const done = doneSkills(profile);

  const skillsRef = useRef<HTMLDivElement>(null);
  const weakRef = useRef<HTMLDivElement>(null);

  // The replay starts at the top and then walks down the page, arriving at
  // each group of bars just before it moves. Watching your skills change is
  // the point of coming here after a lesson; leaving it below the fold would
  // mean nobody ever saw it.
  useEffect(() => {
    if (!replayFrom) return;
    replayRef.current?.scrollIntoView({ block: 'start' });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return;
    const behavior: ScrollBehavior = 'smooth';
    const timers = [
      window.setTimeout(() => skillsRef.current?.scrollIntoView({ behavior, block: 'center' }), 1300),
      window.setTimeout(() => weakRef.current?.scrollIntoView({ behavior, block: 'center' }), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [replayFrom]);

  return (
    <div className="profile" ref={replayRef}>
      <header className="profile__head">
        <button type="button" className="profile__avatar" onClick={onEditAvatar} aria-label="Edit your mascot">
          <Mascot
            custom={profile.avatar}
            species="bit"
            mood={profile.streak > 2 ? 'happy' : 'idle'}
            size={92}
            trackPointer={false}
            gazeSource={tiltGaze}
          />
          <span className="profile__edit">Edit</span>
        </button>
        <div className="profile__id">
          <h2>{profile.avatar?.name || profile.name}</h2>
          <p className="muted">
            {track?.name ?? 'No course yet'} · {weeklyXp(profile)} XP this week
          </p>
        </div>
        <button type="button" className="iconbtn" aria-label="Settings" onClick={onSettings}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="tiles">
        <Tile value={profile.streak} label="day streak" tone="streak" />
        <Tile value={profile.xp.toLocaleString()} label="total XP" />
        <Tile value={<span className="tile__gems"><GemIcon />{profile.gems}</span>} label="gems" />
        <Tile value={`L${ladder.level}`} label="course level" tone="right" />
      </div>

      <Bar
        label="Today"
        value={today}
        from={replayFrom ? xpToday(replayFrom) : undefined}
        delay={200}
        max={profile.settings.dailyGoalXp}
        suffix="XP"
        tone="streak"
      />
      <Bar
        label={`Level ${level.level}`}
        value={level.into}
        from={beforeLevel && beforeLevel.level === level.level ? beforeLevel.into : undefined}
        delay={500}
        max={level.needed}
        suffix="XP"
      />
      {course ? (
        <Bar
          label="Course"
          value={done}
          from={replayFrom ? doneSkills(replayFrom) : undefined}
          delay={800}
          max={course.syllabus.length}
          suffix="skills"
          tone="right"
        />
      ) : null}
      {ladder.level < MAX_LEVEL ? (
        <Bar
          label={`Ladder · level ${ladder.level}`}
          value={ladder.run}
          from={beforeLadder && beforeLadder.level === ladder.level ? beforeLadder.run : undefined}
          delay={1100}
          max={runNeeded(ladder.level)}
          suffix="strong lessons"
        />
      ) : null}
      <p className="profile__note">{levelBlurb(ladder)}</p>

      <section className="profile__block">
        <h4>This week</h4>
        <div className="weekbars">
          {week.map((day, i) => (
            <div key={i} className={`weekbar${day.today ? ' is-today' : ''}`}>
              <span className="weekbar__fill" style={{ height: `${Math.max(4, (day.xp / weekMax) * 100)}%` }} />
              <span className="weekbar__label">{day.label}</span>
            </div>
          ))}
        </div>
      </section>

      {skillBars.length ? (
        <section className="profile__block" ref={skillsRef}>
          <h4>Strongest skills</h4>
          {skillBars.map((row, i) => (
            <Bar
              key={row.id}
              label={row.title}
              value={row.value}
              from={row.from}
              delay={1500 + i * 160}
              max={1}
              slim
            />
          ))}
        </section>
      ) : null}

      {weak.length ? (
        <section className="profile__block" ref={weakRef}>
          <h4>Needs work</h4>
          {weak.map((row, i) => (
            <Bar
              key={row.concept}
              label={conceptLabel(row.concept)}
              value={row.strength}
              from={row.from}
              delay={2300 + i * 160}
              max={1}
              slim
              tone="wrong"
            />
          ))}
        </section>
      ) : null}

    </div>
  );
}

function Tile({
  value,
  label,
  tone,
}: {
  value: React.ReactNode;
  label: string;
  tone?: 'streak' | 'right';
}) {
  return (
    <div className={`tile${tone ? ` tile--${tone}` : ''}`}>
      <span className="tile__value">{value}</span>
      <span className="tile__label">{label}</span>
    </div>
  );
}

function Bar({
  label,
  value,
  from,
  delay = 0,
  max,
  suffix,
  tone,
  slim,
}: {
  label: string;
  value: number;
  /** Where the bar was before the lesson. Given, the bar replays the change. */
  from?: number;
  delay?: number;
  max: number;
  suffix?: string;
  tone?: 'streak' | 'right' | 'wrong';
  slim?: boolean;
}) {
  const [shown, setShown] = useState(from ?? value);
  const released = useRef(false);

  useEffect(() => {
    if (from === undefined || released.current) {
      setShown(value);
      return;
    }
    released.current = true;
    const timer = setTimeout(() => setShown(value), delay);
    return () => clearTimeout(timer);
  }, [from, value, delay]);

  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, shown / max));
  const moved = from !== undefined && Math.abs(value - from) > 0.001;

  return (
    <div className={`bigbar${slim ? ' bigbar--slim' : ''}${tone ? ` bigbar--${tone}` : ''}${moved ? ' is-moving' : ''}`}>
      <div className="bigbar__row">
        <span className="bigbar__label">{label}</span>
        <span className="bigbar__value">
          {suffix ? `${Math.round(shown)} / ${Math.round(max)}` : `${Math.round(pct * 100)}%`}
        </span>
      </div>
      <div className="bigbar__track">
        <span className="bigbar__fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
