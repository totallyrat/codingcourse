import { useEffect, useMemo, useRef, useState } from 'react';
import type { PinType, WireExercise, WireNode } from '@/engine/types';
import { pinOf, pinsCompatible } from '@/engine/wire';
import type { ElementProps } from './shared';

/**
 * A node-graph element, for the visual scripting an engine course has to
 * teach: Unreal Blueprints, Unity Visual Scripting, shader graphs.
 *
 * Drawn entirely in SVG so the whole graph scales to the panel without any
 * measurement, and so wires and nodes share one coordinate space. Drag from an
 * output pin to an input pin to connect; click a wire to remove it. Clicking
 * two pins in turn does the same thing without dragging, which keeps it usable
 * on a trackpad and from the keyboard.
 */

const NODE_W = 176;
const HEADER_H = 30;
const ROW_H = 22;
const PAD_TOP = 10;

interface Pin {
  /** Content-facing id, `nodeId:label`. A link is always out -> in, so this
   *  stays unambiguous in the exercise data even when a node has an input and
   *  an output of the same name (every exec pin, for instance). */
  id: string;
  /** Unique within the graph. The DOM and every lookup use this. */
  key: string;
  x: number;
  y: number;
  side: 'in' | 'out';
  label: string;
  type: PinType;
  nodeId: string;
}

/**
 * Unreal's pin colours, near enough that a screenshot of the real editor and
 * this exercise read as the same thing. Exec is white; the rest are the data
 * types you meet in the first month.
 */
const PIN_COLOUR: Record<PinType, string> = {
  exec: '#ffffff',
  bool: '#8f2a2a',
  float: '#7ef0b2',
  int: '#4fd6c0',
  string: '#ff7ad9',
  object: '#4aa3ff',
  vector: '#f6c66b',
  wildcard: '#9a9aa6',
};

/** Exec never joins data, and a typed pin only joins its own type. */
function compatible(from: Pin, to: Pin): boolean {
  return pinsCompatible(from.type, to.type);
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tightest the graph can be zoomed to, as a fraction of the whole. */
const MIN_VIEW = 0.3;

/**
 * CSS pixels per graph unit below which pin labels stop being readable. Node
 * titles are drawn at 11.5 units, so 0.85 keeps them just under 10px.
 */
const READABLE_SCALE = 0.85;

/** Keeps the visible window over the graph, so it can never be lost. */
function clampView(v: ViewBox, fit: ViewBox, bounds: { w: number; h: number }): ViewBox {
  const w = Math.min(v.w, fit.w);
  const h = Math.min(v.h, fit.h);
  const left = Math.min(0, fit.x);
  const top = Math.min(0, fit.y);
  const right = Math.max(bounds.w, fit.x + fit.w);
  const bottom = Math.max(bounds.h, fit.y + fit.h);
  return {
    w,
    h,
    x: Math.min(Math.max(v.x, left), right - w),
    y: Math.min(Math.max(v.y, top), bottom - h),
  };
}

function nodeHeight(node: WireNode): number {
  const rows = Math.max(node.inputs?.length ?? 0, node.outputs?.length ?? 0, 1);
  return HEADER_H + PAD_TOP * 2 + rows * ROW_H - 6;
}

function pinsOf(node: WireNode): Pin[] {
  const out: Pin[] = [];
  (node.inputs ?? []).forEach((spec, i) => {
    const { name, type } = pinOf(spec);
    out.push({
      id: `${node.id}:${name}`,
      key: `in:${node.id}:${name}`,
      nodeId: node.id,
      label: name,
      type,
      side: 'in',
      x: node.x,
      y: node.y + HEADER_H + PAD_TOP + i * ROW_H + 6,
    });
  });
  (node.outputs ?? []).forEach((spec, i) => {
    const { name, type } = pinOf(spec);
    out.push({
      id: `${node.id}:${name}`,
      key: `out:${node.id}:${name}`,
      nodeId: node.id,
      label: name,
      type,
      side: 'out',
      x: node.x + NODE_W,
      y: node.y + HEADER_H + PAD_TOP + i * ROW_H + 6,
    });
  });
  return out;
}

const TONE_FILL: Record<NonNullable<WireNode['tone']>, string> = {
  event: '#3a2f1c',
  flow: '#1e2430',
  data: '#1c2a24',
  action: '#252530',
};
const TONE_LINE: Record<NonNullable<WireNode['tone']>, string> = {
  event: '#7a6236',
  flow: '#3d4a5f',
  data: '#33604c',
  action: '#43435a',
};

function labelFor(type: PinType): string {
  return type === 'exec' ? 'an execution pin' : `a ${type} pin`;
}

/** Sentence case, since these read as a sentence and not as a label. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wirePath(from: Pin, to: Pin): string {
  const dx = Math.max(44, Math.abs(to.x - from.x) * 0.55);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export function WireElement({ exercise, setResponse, grade }: ElementProps<WireExercise>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [links, setLinks] = useState<Array<[string, string]>>([]);
  const [pending, setPending] = useState<Pin | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // The visible window on the graph. null means "the whole thing", which is
  // where every graph starts. Panning and zooming work the way they do in the
  // editor, because on a phone a three-node graph fitted to a 390px screen is
  // otherwise a row of unreadable grey boxes.
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const gesture = useRef<{ pointers: Map<number, { x: number; y: number }>; start: null | { view: ViewBox; dist: number; cx: number; cy: number } }>({
    pointers: new Map(),
    start: null,
  });
  const locked = grade !== null;

  const pins = useMemo(() => {
    // Keyed by side, because a node's input and output pins routinely share a
    // name; keying by `nodeId:label` alone silently loses one of them.
    const byKey = new Map<string, Pin>();
    const outputs = new Map<string, Pin>();
    const inputs = new Map<string, Pin>();
    for (const node of exercise.nodes) {
      for (const pin of pinsOf(node)) {
        byKey.set(pin.key, pin);
        (pin.side === 'out' ? outputs : inputs).set(pin.id, pin);
      }
    }
    return { byKey, outputs, inputs };
  }, [exercise]);

  const bounds = useMemo(() => {
    const maxX = Math.max(...exercise.nodes.map((n) => n.x + NODE_W), 320);
    const maxY = Math.max(...exercise.nodes.map((n) => n.y + nodeHeight(n)), 160);
    return { w: maxX + 24, h: maxY + 20 };
  }, [exercise]);

  // The canvas has a fixed height in CSS, so the window on the graph has to
  // match the box's shape or the picture would be squashed.
  const [size, setSize] = useState({ w: 360, h: 260 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The window that shows the whole graph, in the box's own proportions. */
  const fit = useMemo<ViewBox>(() => {
    const aspect = size.h / size.w;
    const w = Math.max(bounds.w, bounds.h / aspect);
    const h = w * aspect;
    return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
  }, [bounds, size]);

  /**
   * Where a graph opens. Fitting a wide graph into a phone shrinks it to a row
   * of unreadable grey slabs, so when fitting would put the drawing below the
   * size things stop being legible at, it opens at a readable scale on the
   * left-hand end — where the event node is — and the learner pans, exactly as
   * they would in the editor.
   */
  const opening = useMemo<ViewBox>(() => {
    const readableW = size.w / READABLE_SCALE;
    if (readableW >= fit.w) return fit;
    const h = readableW * (size.h / size.w);
    return clampView({ x: -12, y: (bounds.h - h) / 2, w: readableW, h }, fit, bounds);
  }, [fit, size, bounds]);

  const box = view ?? opening;
  const zoomed = Math.abs(box.w - fit.w) > 1;

  useEffect(() => {
    setLinks([]);
    setPending(null);
    setView(null);
  }, [exercise.id]);

  useEffect(() => {
    setResponse(links.length ? { kind: 'wire', links } : null);
  }, [links, setResponse]);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: box.x + ((e.clientX - rect.left) / rect.width) * box.w,
      y: box.y + ((e.clientY - rect.top) / rect.height) * box.h,
    };
  };

  /** Zoom about a point in graph coordinates, clamped to the graph. */
  const zoomAt = (factor: number, at: { x: number; y: number }) => {
    setView((current) => {
      const from = current ?? opening;
      const scale = Math.min(1, Math.max(MIN_VIEW, (from.w * factor) / fit.w));
      const w = fit.w * scale;
      const h = fit.h * scale;
      // Keep the point under the fingers where it was.
      const tx = (at.x - from.x) / from.w;
      const ty = (at.y - from.y) / from.h;
      return clampView({ x: at.x - tx * w, y: at.y - ty * h, w, h }, fit, bounds);
    });
  };

  const connect = (a: Pin, b: Pin) => {
    const from = a.side === 'out' ? a : b;
    const to = a.side === 'out' ? b : a;
    // Only out-to-in, never two of the same side, and never a self-link.
    if (from.side !== 'out' || to.side !== 'in' || from.nodeId === to.nodeId) return;
    // And never across types: the editor refuses this too, rather than making
    // a wire that cannot compile.
    if (!compatible(from, to)) {
      setRefused(`${sentence(labelFor(from.type))} does not connect to ${labelFor(to.type)}.`);
      window.setTimeout(() => setRefused(null), 1800);
      return;
    }
    setLinks((current) =>
      current.some(([f, t]) => f === from.id && t === to.id)
        ? current
        : [...current, [from.id, to.id]],
    );
  };

  const onPinDown = (pin: Pin) => (e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    if (pending && pending.key !== pin.key) {
      connect(pending, pin);
      setPending(null);
      setCursor(null);
      return;
    }
    setPending(pin);
    setCursor({ x: pin.x, y: pin.y });
  };

  useEffect(() => {
    if (!pending) return;
    const move = (e: PointerEvent) => setCursor(toLocal(e));
    const up = (e: PointerEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const key = target?.getAttribute('data-pin');
      const dropped = key ? pins.byKey.get(key) : undefined;
      if (dropped && dropped.key !== pending.key) {
        connect(pending, dropped);
        setPending(null);
        setCursor(null);
      }
      // Otherwise stay armed, so click-then-click also works.
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pins]);

  // Panning and pinching. One finger on empty canvas drags the graph, two
  // fingers pinch — the same gestures the editor's viewport uses, and they
  // never collide with wiring because a pin swallows its own pointer events.
  const zoomable = bounds.w > 320 || bounds.h > 200;

  const onCanvasDown = (e: React.PointerEvent) => {
    setPending(null);
    setCursor(null);
    if (!zoomable) return;
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const pts = [...g.pointers.values()];
    g.start = {
      view: box,
      dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      cx: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      cy: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) || !g.start) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pts = [...g.pointers.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const start = g.start;

    let next: ViewBox = {
      ...start.view,
      x: start.view.x - ((cx - start.cx) / rect.width) * start.view.w,
      y: start.view.y - ((cy - start.cy) / rect.height) * start.view.h,
    };
    if (pts.length > 1 && start.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = Math.min(1, Math.max(MIN_VIEW, (start.view.w / fit.w) * (start.dist / dist)));
      const w = fit.w * scale;
      const h = fit.h * scale;
      const anchorX = start.view.x + ((start.cx - rect.left) / rect.width) * start.view.w;
      const anchorY = start.view.y + ((start.cy - rect.top) / rect.height) * start.view.h;
      next = {
        w,
        h,
        x: anchorX - ((cx - rect.left) / rect.width) * w,
        y: anchorY - ((cy - rect.top) / rect.height) * h,
      };
    }
    setView(clampView(next, fit, bounds));
  };

  const onCanvasUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (!g.pointers.size) g.start = null;
    else {
      const pts = [...g.pointers.values()];
      g.start = {
        view: box,
        dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
        cx: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        cy: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
    }
  };

  const wanted = useMemo(() => new Set(exercise.links.map(([f, t]) => `${f}>${t}`)), [exercise]);
  const drawn = new Set(links.map(([f, t]) => `${f}>${t}`));

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <p className="eyebrow">Drag from an output pin to an input pin — or click one, then the other</p>
      <div className={`wire${locked ? ' is-locked' : ''}`}>
        {zoomable ? (
          <div className="wire__zoom">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoomAt(1 / 1.5, { x: box.x + box.w / 2, y: box.y + box.h / 2 })}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoomAt(1.5, { x: box.x + box.w / 2, y: box.y + box.h / 2 })}
            >
              −
            </button>
            {zoomed ? (
              <button type="button" className="wire__fit" onClick={() => setView(fit)}>
                Fit
              </button>
            ) : null}
          </div>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className="wire__canvas"
          role="application"
          aria-label="Node graph"
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasUp}
          onDoubleClick={() => setView(fit)}
          onWheel={(e) => {
            if (!zoomable) return;
            e.preventDefault();
            zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, toLocal(e));
          }}
        >
          <defs>
            <pattern id="wire-grid" width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0H0V22" fill="none" stroke="#15151a" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#wire-grid)" />

          {/* the wires the learner has drawn */}
          {links.map(([fromId, toId], i) => {
            const from = pins.outputs.get(fromId);
            const to = pins.inputs.get(toId);
            if (!from || !to) return null;
            const state = locked ? (wanted.has(`${fromId}>${toId}`) ? 'right' : 'wrong') : '';
            return (
              <g key={`${fromId}-${toId}`} className={`wire__link${state ? ` is-${state}` : ''}`}>
                <path d={wirePath(from, to)} className="wire__hit" />
                <path
                  d={wirePath(from, to)}
                  className="wire__line"
                  style={state ? undefined : { stroke: PIN_COLOUR[from.type] }}
                />
                {!locked ? (
                  <path
                    d={wirePath(from, to)}
                    className="wire__hit"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setLinks((l) => l.filter((_, idx) => idx !== i));
                    }}
                  />
                ) : null}
              </g>
            );
          })}

          {/* wires that were required but missing */}
          {locked
            ? exercise.links
                .filter(([f, t]) => !drawn.has(`${f}>${t}`))
                .map(([fromId, toId]) => {
                  const from = pins.outputs.get(fromId);
                  const to = pins.inputs.get(toId);
                  if (!from || !to) return null;
                  return (
                    <path
                      key={`missing-${fromId}-${toId}`}
                      d={wirePath(from, to)}
                      className="wire__line wire__line--missing"
                    />
                  );
                })
            : null}

          {/* the wire being dragged */}
          {pending && cursor ? (
            <path
              d={wirePath(pending, { ...pending, x: cursor.x, y: cursor.y })}
              className="wire__line wire__line--pending"
            />
          ) : null}

          {exercise.nodes.map((node) => {
            const h = nodeHeight(node);
            const tone = node.tone ?? 'flow';
            return (
              <g key={node.id} className="wire__node">
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={h}
                  rx="8"
                  fill="#0e0e12"
                  stroke={TONE_LINE[tone]}
                  strokeWidth="1"
                />
                <path
                  d={`M ${node.x} ${node.y + 8} a 8 8 0 0 1 8 -8 h ${NODE_W - 16} a 8 8 0 0 1 8 8 v ${HEADER_H - 8} h ${-NODE_W} z`}
                  fill={TONE_FILL[tone]}
                />
                <text x={node.x + 12} y={node.y + 19} className="wire__title">
                  {node.title}
                </text>
                {node.subtitle ? (
                  <text x={node.x + 12} y={node.y + HEADER_H + 14} className="wire__subtitle">
                    {node.subtitle}
                  </text>
                ) : null}

                {pinsOf(node).map((pin) => (
                  <g key={pin.key}>
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r="15"
                      fill="transparent"
                      data-pin={pin.key}
                      className="wire__pinhit"
                      onPointerDown={onPinDown(pin)}
                    />
                    {pin.type === 'exec' ? (
                      // Exec pins are arrows in the editor, and arrows here.
                      <path
                        d={`M ${pin.x - 5} ${pin.y - 6} L ${pin.x + 5} ${pin.y} L ${pin.x - 5} ${pin.y + 6} z`}
                        className={`wire__pin${pending?.key === pin.key ? ' is-armed' : ''}${
                          pending && pending.side !== pin.side && compatible(
                            pending.side === 'out' ? pending : pin,
                            pending.side === 'out' ? pin : pending,
                          )
                            ? ' is-open'
                            : ''
                        }`}
                        style={{ fill: PIN_COLOUR[pin.type], stroke: PIN_COLOUR[pin.type] }}
                        data-pin={pin.key}
                        pointerEvents="none"
                      />
                    ) : (
                      <circle
                        cx={pin.x}
                        cy={pin.y}
                        r="5"
                        className={`wire__pin${pending?.key === pin.key ? ' is-armed' : ''}${
                          pending && pending.side !== pin.side && compatible(
                            pending.side === 'out' ? pending : pin,
                            pending.side === 'out' ? pin : pending,
                          )
                            ? ' is-open'
                            : ''
                        }`}
                        style={{ fill: PIN_COLOUR[pin.type], stroke: PIN_COLOUR[pin.type] }}
                        data-pin={pin.key}
                        pointerEvents="none"
                      />
                    )}
                    <text
                      x={pin.side === 'in' ? pin.x + 12 : pin.x - 12}
                      y={pin.y + 4}
                      textAnchor={pin.side === 'in' ? 'start' : 'end'}
                      className="wire__pinlabel"
                    >
                      {pin.label === 'exec' ? '' : pin.label}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {refused ? <p className="wire__refused">{refused}</p> : null}
      {!locked ? (
        <p className="muted" style={{ fontSize: 'var(--step--1)' }}>
          {links.length ? 'Click a wire to remove it. ' : ''}
          {zoomable ? 'Drag the background to move the graph, pinch or use + to zoom.' : ''}
        </p>
      ) : null}
    </div>
  );
}
