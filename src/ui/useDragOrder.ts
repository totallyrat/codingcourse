import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pointer-driven reordering for a vertical list.
 *
 * Built on pointer events rather than HTML5 drag-and-drop: the native API has
 * no touch support, cannot be styled, and fires a ghost image you cannot
 * control. This gives a real dragged element that follows the cursor, live
 * gap-opening as it passes each neighbour, and — importantly — a keyboard
 * path (Space to lift, arrows to move, Space to drop) so the exercise is not
 * mouse-only.
 */
export interface DragOrderResult {
  /** Index currently being dragged, or null. */
  dragging: number | null;
  /** Pixels the dragged element has moved. */
  offset: number;
  /** Index the dragged element would land on. */
  target: number | null;
  /** Index lifted by keyboard, awaiting arrow keys. */
  lifted: number | null;
  registerItem: (index: number) => (el: HTMLElement | null) => void;
  onPointerDown: (index: number) => (e: React.PointerEvent) => void;
  onKeyDown: (index: number) => (e: React.KeyboardEvent) => void;
  /** Vertical shift to apply to a non-dragged item so a gap opens. */
  shiftFor: (index: number) => number;
}

export function useDragOrder(
  count: number,
  onReorder: (from: number, to: number) => void,
  disabled = false,
): DragOrderResult {
  const items = useRef<Array<HTMLElement | null>>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);
  const startY = useRef(0);
  const rects = useRef<DOMRect[]>([]);

  const registerItem = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      items.current[index] = el;
    },
    [],
  );

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      rects.current = items.current.slice(0, count).map((el) => el!.getBoundingClientRect());
      startY.current = e.clientY;
      setDragging(index);
      setOffset(0);
      setTarget(index);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [count, disabled],
  );

  useEffect(() => {
    if (dragging === null) return;

    const move = (e: PointerEvent) => {
      const delta = e.clientY - startY.current;
      setOffset(delta);
      const centre = rects.current[dragging].top + rects.current[dragging].height / 2 + delta;
      let next = dragging;
      for (let i = 0; i < rects.current.length; i++) {
        const r = rects.current[i];
        const mid = r.top + r.height / 2;
        if (i < dragging && centre < mid) {
          next = i;
          break;
        }
        if (i > dragging && centre > mid) next = i;
      }
      setTarget(next);
    };

    const up = () => {
      setDragging((current) => {
        setTarget((t) => {
          if (current !== null && t !== null && t !== current) onReorder(current, t);
          return null;
        });
        return null;
      });
      setOffset(0);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, onReorder]);

  const onKeyDown = useCallback(
    (index: number) => (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setLifted((current) => (current === index ? null : index));
        return;
      }
      if (lifted !== index) return;
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        onReorder(index, index - 1);
        setLifted(index - 1);
        requestAnimationFrame(() => items.current[index - 1]?.focus());
      }
      if (e.key === 'ArrowDown' && index < count - 1) {
        e.preventDefault();
        onReorder(index, index + 1);
        setLifted(index + 1);
        requestAnimationFrame(() => items.current[index + 1]?.focus());
      }
      if (e.key === 'Escape') setLifted(null);
    },
    [count, disabled, lifted, onReorder],
  );

  const shiftFor = useCallback(
    (index: number) => {
      if (dragging === null || target === null || index === dragging) return 0;
      const height = rects.current[dragging]?.height ?? 0;
      const gap = 8;
      if (dragging < target && index > dragging && index <= target) return -(height + gap);
      if (dragging > target && index < dragging && index >= target) return height + gap;
      return 0;
    },
    [dragging, target],
  );

  return { dragging, offset, target, lifted, registerItem, onPointerDown, onKeyDown, shiftFor };
}
