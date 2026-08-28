import { haptic } from '@/lib/haptics';

export type TabId = 'home' | 'stats' | 'library' | 'settings';

export const TABS: Array<{ id: TabId; label: string; icon: JSX.Element }> = [
  {
    id: 'home',
    label: 'Course',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Progress',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h5v16H5zM14 4h5v16h-5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'You',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.6" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

/**
 * The bottom bar. Everything here is thumb-sized and sits above the home
 * indicator; the travelling indicator is driven by `--pager-pos`, so it
 * follows a half-finished swipe rather than snapping after it.
 */
export function TabBar({ index, onSelect }: { index: number; onSelect: (i: number) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar__inner">
        <span className="tabbar__indicator" aria-hidden="true" />
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
