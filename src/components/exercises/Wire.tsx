import { useEffect, useMemo, useRef, useState } from 'react';
import type { WireExercise, WireNode } from '@/engine/types';
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
  nodeId: string;
}

function nodeHeight(node: WireNode): number {
  const rows = Math.max(node.inputs?.length ?? 0, node.outputs?.length ?? 0, 1);
  return HEADER_H + PAD_TOP * 2 + rows * ROW_H - 6;
}

function pinsOf(node: WireNode): Pin[] {
  const out: Pin[] = [];
  (node.inputs ?? []).forEach((label, i) => {
    out.push({
      id: `${node.id}:${label}`,
      key: `in:${node.id}:${label}`,
      nodeId: node.id,
      label,
      side: 'in',
      x: node.x,
      y: node.y + HEADER_H + PAD_TOP + i * ROW_H + 6,
    });
  });
  (node.outputs ?? []).forEach((label, i) => {
    out.push({
      id: `${node.id}:${label}`,
      key: `out:${node.id}:${label}`,
      nodeId: node.id,
      label,
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

function wirePath(from: Pin, to: Pin): string {
  const dx = Math.max(44, Math.abs(to.x - from.x) * 0.55);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export function WireElement({ exercise, setResponse, grade }: ElementProps<WireExercise>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [links, setLinks] = useState<Array<[string, string]>>([]);
  const [pending, setPending] = useState<Pin | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
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

  useEffect(() => {
    setLinks([]);
    setPending(null);
  }, [exercise.id]);

  useEffect(() => {
    setResponse(links.length ? { kind: 'wire', links } : null);
  }, [links, setResponse]);

  const toLocal = (e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * bounds.w,
      y: ((e.clientY - rect.top) / rect.height) * bounds.h,
    };
  };

  const connect = (a: Pin, b: Pin) => {
    const from = a.side === 'out' ? a : b;
    const to = a.side === 'out' ? b : a;
    // Only out-to-in, never two of the same side, and never a self-link.
    if (from.side !== 'out' || to.side !== 'in' || from.nodeId === to.nodeId) return;
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

  const wanted = useMemo(() => new Set(exercise.links.map(([f, t]) => `${f}>${t}`)), [exercise]);
  const drawn = new Set(links.map(([f, t]) => `${f}>${t}`));

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <p className="eyebrow">Drag from an output pin to an input pin — or click one, then the other</p>
      <div className={`wire${locked ? ' is-locked' : ''}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${bounds.w} ${bounds.h}`}
          className="wire__canvas"
          role="application"
          aria-label="Node graph"
          onPointerDown={() => {
            setPending(null);
            setCursor(null);
          }}
        >
          <defs>
            <pattern id="wire-grid" width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0H0V22" fill="none" stroke="#15151a" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={bounds.w} height={bounds.h} fill="url(#wire-grid)" />

          {/* the wires the learner has drawn */}
          {links.map(([fromId, toId], i) => {
            const from = pins.outputs.get(fromId);
            const to = pins.inputs.get(toId);
            if (!from || !to) return null;
            const state = locked ? (wanted.has(`${fromId}>${toId}`) ? 'right' : 'wrong') : '';
            return (
              <g key={`${fromId}-${toId}`} className={`wire__link${state ? ` is-${state}` : ''}`}>
                <path d={wirePath(from, to)} className="wire__hit" />
                <path d={wirePath(from, to)} className="wire__line" />
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
                      r="10"
                      fill="transparent"
                      data-pin={pin.key}
                      className="wire__pinhit"
                      onPointerDown={onPinDown(pin)}
                    />
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r="5"
                      className={`wire__pin${pending?.key === pin.key ? ' is-armed' : ''}`}
                      data-pin={pin.key}
                      pointerEvents="none"
                    />
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
      {links.length && !locked ? (
        <p className="muted" style={{ fontSize: 'var(--step--1)' }}>
          Click a wire to remove it.
        </p>
      ) : null}
    </div>
  );
}
