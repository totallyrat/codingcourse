import { useEffect, useState } from 'react';
import { bridge, isElectron } from '@/lib/bridge';

/** Windows 11 caption glyphs, drawn at 10px like the real ones. */
const Glyph = {
  minimize: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
    </svg>
  ),
  maximize: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
  restore: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
  close: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  ),
};

export function TitleBar({ crumb }: { crumb?: string }) {
  const [maximized, setMaximized] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

  useEffect(() => {
    if (!isElectron) return;
    void bridge.window.isMaximized().then(setMaximized);
    return bridge.window.onMaximizedChange(setMaximized);
  }, []);

  return (
    <div className={`titlebar${isMac ? ' mac' : ''}`}>
      <div className="titlebar__brand">
        <svg className="titlebar__mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#fff" />
          <path d="M9 9.5L6.5 12L9 14.5M15 9.5L17.5 12L15 14.5" stroke="#050506" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <span className="titlebar__title">Codeling</span>
        {crumb ? (
          <>
            <span className="titlebar__crumb">/</span>
            <span className="titlebar__crumb">{crumb}</span>
          </>
        ) : null}
      </div>

      {isElectron && !isMac ? (
        <div className="titlebar__controls">
          <button
            type="button"
            className="caption-btn"
            aria-label="Minimize"
            onClick={() => bridge.window.minimize()}
          >
            {Glyph.minimize}
          </button>
          <button
            type="button"
            className="caption-btn"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => bridge.window.toggleMaximize()}
          >
            {maximized ? Glyph.restore : Glyph.maximize}
          </button>
          <button
            type="button"
            className="caption-btn caption-btn--close"
            aria-label="Close"
            onClick={() => bridge.window.close()}
          >
            {Glyph.close}
          </button>
        </div>
      ) : null}
    </div>
  );
}
