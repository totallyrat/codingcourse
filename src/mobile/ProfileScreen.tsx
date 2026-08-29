import { useMemo } from 'react';
import { Mascot } from '@/mascot/Mascot';
import { GemIcon } from './Shop';
import { tiltGaze } from './tilt';
import { conceptLabel, trackById } from '@/content';
import { skillMastery, weakestConcepts } from '@/engine/lessonComposer';
import { levelFor, levelFromXp, todayKey, xpToday } from '@/engine/progress';
import { MAX_LEVEL, levelBlurb, runNeeded } from '@/engine/levels';
import type { Profile } from '@/engine/types';

/* ============================================================================
   Profile.

   Where Progress used to be, and deliberately mostly bars. A number with a
   bar behind it says "here is how far along you are" in one glance; the same
   number in a paragraph says nothing until you have read the paragraph.
   ========================================================================== */

export function ProfileScreen({ profile, onSettings }: { profile: Profile; onSettings: () => void }) {
  const course = profile.course;
  const track = course ? trackById(course.trackId) : undefined;
  const level = levelFromXp(profile.xp);
  const ladder = levelFor(profile, course?.trackId ?? '');
  const today = xpToday(profile);

  const skillBars = useMemo(() => {
    if (!course || !track) return [];
    const byId = new Map(track.skills.map((s) => [s.id, s]));
    return course.syllabus
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((skill) => ({ id: skill.id, title: skill.title, value: skillMastery(profile, skill) }))
      .filter((row) => row.value > 0.02)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [course, track, profile]);

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
  const done = course && track
    ? course.syllabus.filter((id) => {
        const skill = track.skills.find((s) => s.id === id);
        return skill ? skillMastery(profile, skill) >= 0.75 : false;
      }).length
    : 0;
  const weak = weakestConcepts(profile, 3);

  return (
    <div className="profile">
      <header className="profile__head">
        <span className="profile__avatar">
          <Mascot species="bit" mood={profile.streak > 2 ? 'happy' : 'idle'} size={92} trackPointer={false} gazeSource={tiltGaze} />
        </span>
        <div className="profile__id">
          <h2>{profile.name}</h2>
          <p className="muted">
            {track?.name ?? 'No course yet'} · joined {new Date(profile.createdAt).toLocaleDateString()}
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

      <Bar label="Today" value={today} max={profile.settings.dailyGoalXp} suffix="XP" tone="streak" />
      <Bar label={`Level ${level.level}`} value={level.into} max={level.needed} suffix="XP" />
      {course ? <Bar label="Course" value={done} max={course.syllabus.length} suffix="skills" tone="right" /> : null}
      {ladder.level < MAX_LEVEL ? (
        <Bar
          label={`Ladder · level ${ladder.level}`}
          value={ladder.run}
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
        <section className="profile__block">
          <h4>Strongest skills</h4>
          {skillBars.map((row) => (
            <Bar key={row.id} label={row.title} value={row.value} max={1} slim />
          ))}
        </section>
      ) : null}

      {weak.length ? (
        <section className="profile__block">
          <h4>Needs work</h4>
          {weak.map((row) => (
            <Bar key={row.concept} label={conceptLabel(row.concept)} value={row.strength} max={1} slim tone="wrong" />
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
  max,
  suffix,
  tone,
  slim,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: 'streak' | 'right' | 'wrong';
  slim?: boolean;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className={`bigbar${slim ? ' bigbar--slim' : ''}${tone ? ` bigbar--${tone}` : ''}`}>
      <div className="bigbar__row">
        <span className="bigbar__label">{label}</span>
        <span className="bigbar__value">
          {suffix ? `${Math.round(value)} / ${Math.round(max)}` : `${Math.round(pct * 100)}%`}
        </span>
      </div>
      <div className="bigbar__track">
        <span className="bigbar__fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
