import { hashString, mulberry32 } from './rng';
import { weekKey } from './quests';
import type { Profile } from './types';

/* ============================================================================
   The weekly league.

   Everyone in it except you is generated: fifteen bots with a pace, a name and
   a face, seeded from the week and your profile id so the table is stable all
   week and completely different next Monday. Nothing is fetched, nothing is
   uploaded, and nobody else can see your XP because there is nowhere for it to
   go.

   The XP shown is the XP earned *this week*, which is why everybody starts
   Monday on zero. Your real total is untouched — the league is a window onto
   the last seven days, not a wipe.
   ========================================================================== */

export interface LeagueRow {
  id: string;
  name: string;
  xp: number;
  you: boolean;
  /** Seed for the row's face, so a bot keeps the same one all week. */
  face: number;
}

const NAMES = [
  'Marta', 'Kwame', 'Sora', 'Ines', 'Diego', 'Leah', 'Petra', 'Onur', 'Nadia', 'Bram',
  'Yuki', 'Tomas', 'Ada', 'Rufus', 'Mira', 'Kofi', 'Elin', 'Ravi', 'Juno', 'Otto',
  'Sana', 'Lars', 'Nina', 'Hugo', 'Zara',
];

export const LEAGUE_SIZE = 16;
export const PROMOTION_ZONE = 5;
export const RELEGATION_ZONE = 3;

/** Monday of this week, as a date. */
export function weekStart(now = new Date()): Date {
  const [y, m, d] = weekKey(now).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** XP earned since Monday. This is the number the league ranks on. */
export function weeklyXp(profile: Profile, now = new Date()): number {
  const start = weekStart(now);
  return profile.days
    .filter((day) => {
      const [y, m, d] = day.date.split('-').map(Number);
      return new Date(y, m - 1, d) >= start;
    })
    .reduce((sum, day) => sum + day.xp, 0);
}

/** How far through the week we are, 0 on Monday morning, 1 by Sunday night. */
function weekProgress(now: Date): number {
  const start = weekStart(now).getTime();
  return Math.max(0, Math.min(1, (now.getTime() - start) / (7 * 86400000)));
}

/**
 * The table, you included, sorted by weekly XP.
 *
 * Bots are paced rather than random: each has a daily rate, and their total is
 * that rate applied to however much of the week has gone. So the table moves
 * through the week the way a real one would, and refreshing the screen does
 * not reshuffle it.
 */
export function league(profile: Profile, now = new Date(), size = LEAGUE_SIZE): LeagueRow[] {
  const week = weekKey(now);
  const rand = mulberry32(hashString(`${profile.id}:${week}:league`));
  const progress = weekProgress(now);
  const mine = weeklyXp(profile, now);

  const rows: LeagueRow[] = [];
  for (let i = 0; i < size - 1; i++) {
    // A wide spread of paces: a couple of people who are clearly grinding, a
    // long middle, and a few who signed up and stopped.
    const pace = Math.round(20 + Math.pow(rand(), 2.2) * 620);
    const consistency = 0.55 + rand() * 0.45;
    const wobble = 0.85 + rand() * 0.3;
    const xp = Math.max(0, Math.round(pace * 7 * progress * consistency * wobble));
    rows.push({
      id: `bot-${i}`,
      name: NAMES[Math.floor(rand() * NAMES.length)],
      xp,
      you: false,
      face: Math.floor(rand() * 1000),
    });
  }

  rows.push({ id: profile.id, name: profile.name || 'You', xp: mine, you: true, face: hashString(profile.id) % 1000 });

  // Ties break in your favour, which costs nothing and feels better.
  return rows.sort((a, b) => b.xp - a.xp || (a.you ? -1 : b.you ? 1 : 0));
}

export type LeagueZone = 'promotion' | 'safe' | 'relegation';

export function zoneFor(index: number, size = LEAGUE_SIZE): LeagueZone {
  if (index < PROMOTION_ZONE) return 'promotion';
  if (index >= size - RELEGATION_ZONE) return 'relegation';
  return 'safe';
}

/** Days, hours or minutes until the table resets. */
export function timeToReset(now = new Date()): string {
  const start = weekStart(now).getTime();
  const end = start + 7 * 86400000;
  const left = Math.max(0, end - now.getTime());
  const days = Math.floor(left / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(left / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return `${Math.max(1, Math.floor(left / 60000))} minutes left`;
}
