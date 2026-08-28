import { useMemo } from 'react';
import { Card, Chip, Progress } from '@/ui/primitives';
import { conceptLabel, trackById } from '@/content';
import { decayedStrength, memoryFor } from '@/engine/scheduler';
import { accuracy, skillMastery } from '@/engine/lessonComposer';
import { levelFromXp, todayKey } from '@/engine/progress';
import type { Profile } from '@/engine/types';

/**
 * Progress, stated honestly.
 *
 * Mastery is shown *after* decay, so a skill you crowned a month ago and never
 * touched reads as faded rather than finished. A number that only ever goes up
 * is a flattering number, not a useful one.
 */
export function Stats({ profile }: { profile: Profile }) {
  const course = profile.course;
  const track = course ? trackById(course.trackId) : undefined;
  const level = levelFromXp(profile.xp);

  const totals = useMemo(() => {
    const lessons = profile.days.reduce((n, d) => n + d.lessons, 0);
    const answered = profile.days.reduce((n, d) => n + d.answered, 0);
    const seconds = profile.days.reduce((n, d) => n + d.seconds, 0);
    return { lessons, answered, seconds };
  }, [profile.days]);

  const days = useMemo(() => buildCalendar(profile), [profile]);
  const maxXp = Math.max(1, ...days.map((d) => d.xp));

  const skillRows = useMemo(() => {
    if (!course || !track) return [];
    const byId = new Map(track.skills.map((s) => [s.id, s]));
    return course.syllabus
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((skill) => ({
        skill,
        mastery: skillMastery(profile, skill),
        concepts: skill.concepts.map((c) => ({
          id: c,
          strength: decayedStrength(memoryFor(profile, c), profile.lessonIndex),
          seen: memoryFor(profile, c).seen,
          lapses: memoryFor(profile, c).lapses,
        })),
      }))
      .filter((row) => row.concepts.some((c) => c.seen > 0));
  }, [course, track, profile]);

  return (
    <div className="stats">
      <header className="stats__head">
        <div>
          <p className="eyebrow">{track?.name ?? 'Progress'}</p>
          <h2>Where you are</h2>
        </div>
      </header>

      <div className="stats__row">
        <Metric label="Total XP" value={profile.xp.toLocaleString()} sub={`level ${level.level}`} />
        <Metric label="Lessons" value={totals.lessons} sub={`${totals.answered} exercises answered`} />
        <Metric label="Accuracy" value={`${Math.round(accuracy(profile) * 100)}%`} sub="across everything seen" />
        <Metric
          label="Time"
          value={formatDuration(totals.seconds)}
          sub={`best streak ${profile.bestStreak} day${profile.bestStreak === 1 ? '' : 's'}`}
        />
      </div>

      <Card quiet className="stats__cal">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <p className="eyebrow">Last 16 weeks</p>
          <span className="muted" style={{ fontSize: 11 }}>
            {profile.freezes} streak freeze{profile.freezes === 1 ? '' : 's'} left
          </span>
        </div>
        <div className="cal">
          {days.map((day) => (
            <span
              key={day.date}
              className={`cal__cell${day.xp > 0 ? ' is-on' : ''}${day.date === todayKey() ? ' is-today' : ''}`}
              style={day.xp > 0 ? { opacity: 0.28 + 0.72 * (day.xp / maxXp) } : undefined}
              title={`${day.date}: ${day.xp} XP`}
            />
          ))}
        </div>
      </Card>

      <section className="stats__skills">
        <h4>Skill by skill</h4>
        {skillRows.length === 0 ? (
          <p className="muted">Finish a lesson and this fills in.</p>
        ) : (
          skillRows.map(({ skill, mastery, concepts }) => (
            <div key={skill.id} className="masteryrow">
              <div className="masteryrow__head">
                <span className="masteryrow__title">{skill.title}</span>
                <span className="masteryrow__pct">{Math.round(mastery * 100)}%</span>
              </div>
              <Progress value={mastery} slim tone={mastery >= 0.75 ? 'right' : undefined} />
              <div className="masteryrow__concepts">
                {concepts.map((c) => (
                  <span
                    key={c.id}
                    className={`conceptpip${c.seen === 0 ? ' is-unseen' : c.strength >= 0.75 ? ' is-strong' : c.strength >= 0.4 ? ' is-mid' : ' is-weak'}`}
                    title={`${conceptLabel(c.id)} — seen ${c.seen}×, ${c.lapses} slip${c.lapses === 1 ? '' : 's'}`}
                  >
                    {conceptLabel(c.id)}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {profile.mistakes.length ? (
        <Card quiet className="stats__queue">
          <p className="eyebrow">Re-check queue</p>
          <p className="muted" style={{ fontSize: 'var(--step--1)', marginBottom: 12 }}>
            {profile.mistakes.length} item{profile.mistakes.length === 1 ? '' : 's'} the scheduler is holding
            onto. Each one reappears in a lesson until you get it right.
          </p>
          <div className="chiprow">
            {profile.mistakes.slice(0, 18).map((m) => (
              <Chip key={m.exerciseId} tone={m.misses > 1 ? 'wrong' : 'default'}>
                {conceptLabel(m.concept)}
                {m.misses > 1 ? ` ×${m.misses}` : ''}
              </Chip>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card quiet className="metric">
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      {sub ? <span className="metric__sub">{sub}</span> : null}
    </Card>
  );
}

function buildCalendar(profile: Profile): Array<{ date: string; xp: number }> {
  const byDate = new Map(profile.days.map((d) => [d.date, d.xp]));
  const out: Array<{ date: string; xp: number }> = [];
  const today = new Date();
  // 16 weeks, ending today, laid out column by column.
  for (let i = 16 * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, xp: byDate.get(key) ?? 0 });
  }
  return out;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
