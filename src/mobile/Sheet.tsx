import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '@/lib/haptics';

/**
 * A bottom sheet you can throw away with your thumb.
 *
 * Dragging follows the finger exactly, past halfway or a quick flick
 * dismisses, anything less springs back — the behaviour every iOS sheet has,
 * and the reason a modal on a phone does not need a close button to feel
 * closable. It keeps mounting for the length of the closing animation so the
 * sheet is never seen to vanish.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), 280);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    // `mounted` is in the dependency list on purpose: the panel does not exist
    // on the render that opens the sheet, only on the one after it, and
    // without this the drag listeners are attached to nothing.
    if (!panel || !open || !mounted) return;

    let pointerId = -1;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;

    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // Only the grip and the sheet's own chrome drag it; a scrollable body
      // inside keeps its own gesture.
      if (!target?.closest('.sheet__grip, .sheet__head')) return;
      pointerId = e.pointerId;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      dragging = true;
      panel.style.transition = 'none';
    };
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dy = Math.max(0, e.clientY - startY);
      velocity = (e.clientY - lastY) / (e.timeStamp - lastT || 16);
      lastY = e.clientY;
      lastT = e.timeStamp;
      panel.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
    };
    const up = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = -1;
      panel.style.transition = '';
      const dy = e.clientY - startY;
      if (dy > panel.getBoundingClientRect().height * 0.34 || velocity > 0.7) {
        panel.style.transform = '';
        haptic('tap');
        onClose();
      } else {
        panel.style.transform = '';
      }
    };

    panel.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      panel.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [open, mounted, onClose]);

  if (!mounted) return null;

  // Into the body, for the same reason the modal is: the pager track is
  // transformed, and a fixed sheet inside it would open off the side of the
  // screen from every tab but the first.
  return createPortal(
    <div className={`sheetwrap${closing ? ' is-closing' : ''}`}>
      <div className="sheet__scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        <span className="sheet__grip" aria-hidden="true" />
        {title ? (
          <div className="sheet__head">
            <h4>{title}</h4>
          </div>
        ) : null}
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
