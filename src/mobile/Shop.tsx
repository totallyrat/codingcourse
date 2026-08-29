import { useState } from 'react';
import { Mascot } from '@/mascot/Mascot';
import { Sheet } from './Sheet';
import { haptic } from '@/lib/haptics';
import { BOOST_LESSONS, INSTANT_XP, SHOP, buyItem, openQuestChest, type ShopItemId } from '@/engine/progress';
import type { Profile } from '@/engine/types';

/* ============================================================================
   The shop.

   Five things, one currency, and no way to buy your way past the learning:
   the most a purchase can do is protect a streak, double some XP or skip a
   single lesson. The chest is the only item that hides what it is, and it
   resolves in the engine on purchase so nothing here can peek first.
   ========================================================================== */

const ICONS: Record<ShopItemId, JSX.Element> = {
  streakSaver: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6c6 8 12 11 12 19a12 12 0 0 1-24 0c0-4 2-7 4-9 1 2 2 3 4 3 0-6 2-10 4-13z" fill="currentColor" />
    </svg>
  ),
  superBoost: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M26 4L12 26h9l-3 18 17-24h-10z" fill="currentColor" />
    </svg>
  ),
  instantXp: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  ),
  lessonSkip: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 10l16 14-16 14z" fill="currentColor" />
      <rect x="30" y="10" width="6" height="28" rx="2" fill="currentColor" />
    </svg>
  ),
  chest: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 20a16 8 0 0 1 32 0v4H8z" fill="currentColor" />
      <rect x="8" y="24" width="32" height="16" rx="3" fill="currentColor" opacity="0.75" />
      <rect x="21" y="18" width="6" height="12" rx="2" fill="#050506" />
    </svg>
  ),
};

const GRANT_TEXT: Record<ShopItemId, string> = {
  streakSaver: 'A Streak Saver. Miss a day and it is spent instead of your streak.',
  superBoost: `A Super Boost. Double XP for your next ${BOOST_LESSONS} lessons.`,
  instantXp: `${INSTANT_XP} XP, straight into today.`,
  lessonSkip: 'A Lesson Skip. Use it from any lesson card on the path.',
  chest: 'A chest.',
};

export function Shop({
  profile,
  onUpdate,
  onToast,
}: {
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  onToast: (text: string, icon?: string) => void;
}) {
  const [reveal, setReveal] = useState<ShopItemId | null>(null);

  const buy = (id: ShopItemId) => {
    const preview = buyItem(profile, id);
    if (!preview.ok) {
      haptic('wrong');
      onToast(preview.reason ?? 'Not enough gems.', '·');
      return;
    }
    haptic('win');
    // The engine rolls the chest; the UI only shows what came out.
    let granted: ShopItemId | null = null;
    onUpdate((p) => {
      const result = buyItem(p, id);
      granted = result.granted;
      return result.ok ? result.profile : p;
    });
    if (id === 'chest') setReveal(granted);
    else onToast(GRANT_TEXT[id], '✓');
  };

  const openQuest = () => {
    const preview = openQuestChest(profile);
    if (!preview.ok) return;
    haptic('win');
    let granted: ShopItemId | null = null;
    onUpdate((p) => {
      const result = openQuestChest(p);
      granted = result.granted;
      return result.ok ? result.profile : p;
    });
    setReveal(granted);
  };

  return (
    <div className="shop">
      <header className="shop__head">
        <div>
          <p className="eyebrow">Shop</p>
          <h2>Spend your gems</h2>
        </div>
        <span className="gemcount gemcount--big">
          <GemIcon />
          {profile.gems}
        </span>
      </header>

      {profile.inventory.chest > 0 ? (
        <button type="button" className="questchest" onClick={openQuest}>
          <span className="questchest__icon">{ICONS.chest}</span>
          <span className="questchest__text">
            <strong>
              {profile.inventory.chest} quest chest{profile.inventory.chest === 1 ? '' : 's'}
            </strong>
            <span>Won from quests. Tap to open one.</span>
          </span>
        </button>
      ) : null}

      <div className="held">
        <Held label="Streak Savers" value={profile.freezes} />
        <Held label="Boosted lessons" value={profile.boostLessons} />
        <Held label="Lesson Skips" value={profile.inventory.lessonSkip} />
      </div>

      <div className="shopgrid">
        {SHOP.map((item) => {
          const affordable = profile.gems >= item.price;
          return (
            <article key={item.id} className={`shopcard${item.id === 'chest' ? ' shopcard--chest' : ''}`}>
              <span className="shopcard__icon">{ICONS[item.id]}</span>
              <h4>{item.name}</h4>
              <p>{item.blurb}</p>
              <button
                type="button"
                className={`buybtn${affordable ? '' : ' is-poor'}`}
                onClick={() => buy(item.id)}
              >
                <GemIcon />
                {item.price}
              </button>
            </article>
          );
        })}
      </div>

      <p className="shop__note">
        Gems come from finishing lessons — twelve a lesson, twenty for a perfect one. Nothing here can be
        bought with money, because there is nothing to buy.
      </p>

      <Sheet open={reveal !== null} onClose={() => setReveal(null)} title="The chest was…">
        {reveal ? (
          <div className="reveal">
            <Mascot species="byte" mood="celebrate" size={124} trackPointer={false} />
            <p className="reveal__what">{GRANT_TEXT[reveal]}</p>
            <button type="button" className="bigbtn" onClick={() => setReveal(null)}>
              Nice
            </button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function Held({ label, value }: { label: string; value: number }) {
  return (
    <div className="held__item">
      <span className="held__value">{value}</span>
      <span className="held__label">{label}</span>
    </div>
  );
}

export function GemIcon() {
  return (
    <svg className="gem" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l7 6-7 14L5 8z" fill="currentColor" />
      <path d="M5 8h14" stroke="#050506" strokeWidth="1.4" opacity="0.35" />
    </svg>
  );
}
