import { haptic } from '@/lib/haptics';

export type TabId = 'course' | 'league' | 'quests' | 'shop' | 'profile';

export const TABS: Array<{ id: TabId; label: string; icon: JSX.Element }> = [
  {
    id: 'course',
    label: 'Course',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 20V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14l-7-3z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'league',
    label: 'League',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M10 14h4v3h-4zM8 20h8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'quests',
    label: 'Quests',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4.5h14v15l-7-3.6-7 3.6z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 9.4l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'shop',
    label: 'Shop',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h16l-1.4 11a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    ),
  },
];

/**
 * Five tabs, thumb-sized, with an indicator driven by `--pager-pos` so it
 * travels with a half-finished swipe rather than snapping when it ends.
 */
export function TabBar({ index, onSelect }: { index: number; onSelect: (i: number) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar__inner" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
        <span className="tabbar__indicator" style={{ width: `${100 / TABS.length}%` }} aria-hidden="true" />
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            className={`tabbar__item${i === index ? ' is-on' : ''}`}
            aria-current={i === index ? 'page' : undefined}
            onClick={() => {
              if (i !== index) haptic('select');
              onSelect(i);
            }}
          >
            <span className="tabbar__icon">{tab.icon}</span>
            <span className="tabbar__label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
