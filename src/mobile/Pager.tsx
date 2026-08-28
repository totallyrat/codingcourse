import { useEffect, useRef, type ReactNode } from 'react';
import { haptic } from '@/lib/haptics';

/**
 * The four tabs, side by side, dragged with a thumb.
 *
 * The drag is written straight to the DOM rather than through React state:
 * a re-render per pointermove would drop frames on the exact gesture that has
 * to feel native. React only hears about it when the page actually changes.
 *
 * It also publishes its position as `--pager-pos` so the tab bar's indicator
 * can travel *with* the drag instead of jumping when it ends — the small
 * difference between a phone app and a website with four pages.
 */
export function Pager({
  index,
  onIndex,
  onPanelScroll,
  children,
}: {
  index: number;
  onIndex: (next: number) => void;
  onPanelScroll?: (index: number, scrollTop: number) => void;
  children: ReactNode[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Array<HTMLElement | null>>([]);
  const indexRef = useRef(index);
  indexRef.current = index;

  const publish = (pos: number) => {
    document.documentElement.style.setProperty('--pager-pos', pos.toFixed(4));
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)';
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
    publish(index);
    // Off-screen panels keep their scroll position but stop taking focus or
    // being read out, which is what `inert` is for.
    panelsRef.current.forEach((panel, i) => panel?.toggleAttribute('inert', i !== index));
  }, [index]);

  useEffect(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    if (!frame || !track) return;

    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let axis: 'none' | 'x' | 'y' = 'none';

    const width = () => frame.getBoundingClientRect().width || 1;

    const down = (e: PointerEvent) => {
      if (pointerId !== -1 || e.pointerType === 'mouse') return;
      // Anything that scrolls sideways, or drags for its own reasons, keeps
      // its gestures. A code editor should not change tabs.
      if ((e.target as HTMLElement | null)?.closest('[data-noswipe]')) return;
      pointerId = e.pointerId;
      startX = lastX = e.clientX;
      startY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      axis = 'none';
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (axis === 'none') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // Vertical wins ties: the panels scroll, and a page that hops sideways
        // while you are trying to read it is the worst possible outcome.
        axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
        if (axis === 'y') {
          pointerId = -1;
          return;
        }
        track.style.transition = 'none';
      }

      const dt = e.timeStamp - lastT || 16;
      velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = e.timeStamp;

      const w = width();
      const at = indexRef.current;
      const last = children.length - 1;
      // Rubber band at both ends, so the edges feel like edges.
      const resisted = (at === 0 && dx > 0) || (at === last && dx < 0) ? dx * 0.32 : dx;
      track.style.transform = `translate3d(calc(${-at * 100}% + ${resisted.toFixed(1)}px), 0, 0)`;
      publish(at - resisted / w);
      e.preventDefault();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      if (axis !== 'x') return;
      const w = width();
      const dx = e.clientX - startX;
      const flick = Math.abs(velocity) > 0.45;
      const far = Math.abs(dx) > w * 0.28;
      let next = indexRef.current;
      if (flick || far) next += dx < 0 ? 1 : -1;
      next = Math.max(0, Math.min(children.length - 1, next));

      track.style.transition = 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)';
      track.style.transform = `translate3d(${-next * 100}%, 0, 0)`;
      publish(next);
      if (next !== indexRef.current) {
        haptic('select');
        onIndex(next);
      }
    };

    frame.addEventListener('pointerdown', down, { passive: true });
    // Non-passive: a horizontal drag has to be able to stop the page scrolling.
    frame.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [children.length, onIndex]);

  return (
    <div className="pager" ref={frameRef}>
      <div className="pager__track" ref={trackRef}>
        {children.map((child, i) => (
          <section
            key={i}
            className="pager__panel"
            ref={(el) => {
              panelsRef.current[i] = el;
            }}
            onScroll={(e) => onPanelScroll?.(i, e.currentTarget.scrollTop)}
          >
            {child}
          </section>
        ))}
      </div>
    </div>
  );
}
