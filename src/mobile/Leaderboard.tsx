import { useMemo } from 'react';
import { Mascot } from '@/mascot/Mascot';
import { CAST_LIST } from '@/mascot/Mascot';
import { league, timeToReset, zoneFor, LEAGUE_SIZE, PROMOTION_ZONE } from '@/engine/leaderboard';
import type { Profile } from '@/engine/types';

/* ============================================================================
   The league.

   Fifteen bots and you, ranked on the XP earned since Monday. Everybody starts
   the week on zero — including you, which is why the number here is smaller
   than the one on your profile. Nothing leaves the device: the table is
   generated locally from the week and your profile id.
   ========================================================================== */

export function Leaderboard({ profile }: { profile: Profile }) {
  const rows = useMemo(() => league(profile), [profile]);
  const you = rows.findIndex((row) => row.you);

  return (
    <div className="league">
      <header className="league__head">
        <div>
          <p className="eyebrow">This week</p>
          <h2>League</h2>
        </div>
        <span className="league__timer">{timeToReset()}</span>
      </header>

      <p className="league__note">
        Ranked on XP earned since Monday. Everyone starts the week on zero — your real total is untouched.
        The other names are generated on this device; nothing is uploaded anywhere.
      </p>

      <div className="league__zone league__zone--up">Promotion · top {PROMOTION_ZONE}</div>

      <ol className="league__list">
        {rows.map((row, i) => {
          const zone = zoneFor(i, LEAGUE_SIZE);
          const face = CAST_LIST[row.face % CAST_LIST.length];
          return (
            <li key={row.id}>
              {i === PROMOTION_ZONE ? <span className="league__divider" aria-hidden="true" /> : null}
              {i === LEAGUE_SIZE - 3 ? (
                <span className="league__divider league__divider--down" aria-hidden="true" />
              ) : null}
              <div className={`leaguerow${row.you ? ' is-you' : ''} is-${zone}`}>
                <span className="leaguerow__rank">{i + 1}</span>
                <span className="leaguerow__face">
                  <Mascot
                    species={face.id}
                    custom={row.you ? profile.avatar : null}
                    mood={i < PROMOTION_ZONE ? 'happy' : 'idle'}
                    size={44}
                    trackPointer={false}
                  />
                </span>
                <span className="leaguerow__name">{row.you ? 'You' : row.name}</span>
                <span className="leaguerow__xp">{row.xp.toLocaleString()} XP</span>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="league__foot">
        {you < PROMOTION_ZONE
          ? 'In the promotion places. Keep it up until Monday.'
          : you >= LEAGUE_SIZE - 3
            ? 'In the drop zone — a couple of lessons would fix that.'
            : `${rows[Math.max(0, you - 1)].xp - rows[you].xp + 1} XP would take you up a place.`}
      </p>
    </div>
  );
}
