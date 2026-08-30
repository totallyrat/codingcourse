import { useState } from 'react';
import { Sheet } from './Sheet';
import { ChestOpener } from './ChestOpener';
import { Quests } from './Quests';
import { haptic } from '@/lib/haptics';
import { openQuestChest, type ShopItemId } from '@/engine/progress';
import { questsDone } from '@/engine/quests';
import { timeToReset } from '@/engine/leaderboard';
import type { Profile } from '@/engine/types';

/* ============================================================================
   Quests, on their own screen.

   Ten a week, and the chests they pay out, in the one place. It is mostly
   bars: what you have to do, and how much of it is done. Everything else — the
   week, the count, the time left — is one line at the top.
   ========================================================================== */

export function QuestsScreen({
  profile,
  onUpdate,
  animateFrom,
}: {
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  /** Quest id -> progress before the last lesson, for the post-lesson replay. */
  animateFrom?: Record<string, number>;
}) {
  const [chest, setChest] = useState<string | null>(null);
  const chests = profile.inventory.chest;
  const done = profile.quests ? questsDone(profile.quests) : 0;
  const total = profile.quests?.quests.length ?? 0;

  const openChest = () => {
    if (chests <= 0) return;
    haptic('tap');
    setChest(`${profile.id}:quest:${chests}`);
  };

  const roll = (): ShopItemId | null => {
    let granted: ShopItemId | null = null;
    onUpdate((p) => {
      const result = openQuestChest(p);
      granted = result.granted;
      return result.ok ? result.profile : p;
    });
    return granted;
  };

  return (
    <div className="questpage">
      <header className="questpage__head">
        <div>
          <p className="eyebrow">This week</p>
          <h2>Quests</h2>
        </div>
        <div className="questpage__meta">
          <span className="questpage__count">
            {done}
            <em>/{total}</em>
          </span>
          <span className="questpage__timer">{timeToReset()}</span>
        </div>
      </header>

      {chests > 0 ? (
        <button type="button" className="chestbanner" onClick={openChest}>
          <span className="chestbanner__art" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M8 20a16 8 0 0 1 32 0v4H8z" fill="currentColor" />
              <rect x="8" y="24" width="32" height="16" rx="3" fill="currentColor" opacity="0.7" />
              <rect x="21" y="18" width="6" height="12" rx="2" fill="#050506" />
            </svg>
          </span>
          <span className="chestbanner__text">
            <strong>
              {chests} chest{chests === 1 ? '' : 's'} to open
            </strong>
            <span>Won from quests. They do not open easily.</span>
          </span>
          <span className="chestbanner__go" aria-hidden="true">
            Open
          </span>
        </button>
      ) : (
        <p className="questpage__note">
          Finish a quest and it pays a chest. Chests are stubborn — you have to break them open.
        </p>
      )}

      <Quests state={profile.quests} animateFrom={animateFrom} />

      <p className="questpage__foot">
        Ten new quests every Monday, drawn for you and nobody else. Anything unfinished goes with the
        old week; nothing carries over except the chests you have already won.
      </p>

      <Sheet open={chest !== null} onClose={() => setChest(null)} title="A chest">
        <ChestOpener open={chest !== null} seed={chest ?? ''} onRoll={roll} onClose={() => setChest(null)} />
      </Sheet>
    </div>
  );
}
