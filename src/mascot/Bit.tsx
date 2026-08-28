import { useEffect, useRef } from 'react';

export type BitMood = 'idle' | 'happy' | 'wrong' | 'thinking' | 'celebrate' | 'sleep' | 'wave';

/**
 * "Bit" — the Codeling mascot.
 *
 * Everything below the React boundary is imperative on purpose: the creature
 * runs on a single requestAnimationFrame loop writing SVG attributes directly,
 * so it costs no React renders and stays smooth while the rest of the app is
 * busy grading an exercise.
 *
 * Three things do the heavy lifting for "alive":
 *   1. A critically-damped spring drives body position, so every mood change
 *      overshoots slightly and settles instead of snapping.
 *   2. The antenna is a 4-point Verlet chain constrained to fixed segment
 *      lengths. It is never animated directly — it only ever reacts to where
 *      the head has been, which is what makes it read as physical.
 *   3. Squash and stretch is derived from vertical velocity, the oldest trick
 *      in character animation and the reason a bouncing shape looks like it
 *      has mass.
 */

interface Vec {
  x: number;
  y: number;
}

interface ChainPoint {
  pos: Vec;
  prev: Vec;
}

interface MoodPose {
  /** 0 = eyes shut, 1 = wide open. */
  eyeOpen: number;
  /** -1 frown, 0 flat, 1 smile. */
  mouth: number;
  /** Radians the bracket "arms" rotate outward. */
  arms: number;
  /** Multiplier on idle bob amplitude. */
  liveliness: number;
  /** Where the creature looks when it is not tracking the pointer. */
  gaze: Vec | null;
}

const POSES: Record<BitMood, MoodPose> = {
  idle: { eyeOpen: 1, mouth: 0.45, arms: 0, liveliness: 1, gaze: null },
  happy: { eyeOpen: 0.15, mouth: 1, arms: 0.55, liveliness: 1.6, gaze: null },
  wrong: { eyeOpen: 0.55, mouth: -0.7, arms: -0.3, liveliness: 0.5, gaze: { x: 0, y: 0.5 } },
  thinking: { eyeOpen: 0.8, mouth: 0.05, arms: 0.12, liveliness: 0.7, gaze: { x: -0.6, y: -0.75 } },
  celebrate: { eyeOpen: 0.1, mouth: 1, arms: 1, liveliness: 2.2, gaze: null },
  sleep: { eyeOpen: 0.04, mouth: 0.2, arms: -0.15, liveliness: 0.35, gaze: { x: 0, y: 0.4 } },
  wave: { eyeOpen: 1, mouth: 0.8, arms: 0.8, liveliness: 1.3, gaze: null },
};

const SEG = 13; // antenna segment length in viewBox units
const CHAIN = 4;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function Bit({
  mood = 'idle',
  size = 132,
  className = '',
  onPoke,
  trackPointer = true,
  gazeSource,
}: {
  mood?: BitMood;
  size?: number;
  className?: string;
  onPoke?: () => void;
  trackPointer?: boolean;
  /**
   * An outside answer to "where should it be looking", sampled every frame and
   * given in -1..1 on each axis. The phone build feeds it the device tilt, so
   * Bit watches the room rather than a pointer that is not there.
   */
  gazeSource?: () => { x: number; y: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const antennaRef = useRef<SVGPathElement>(null);
  const caretRef = useRef<SVGRectElement>(null);
  const eyeLRef = useRef<SVGGElement>(null);
  const eyeRRef = useRef<SVGGElement>(null);
  const pupilLRef = useRef<SVGGElement>(null);
  const pupilRRef = useRef<SVGGElement>(null);
  const lidLRef = useRef<SVGPathElement>(null);
  const lidRRef = useRef<SVGPathElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const armLRef = useRef<SVGPathElement>(null);
  const armRRef = useRef<SVGPathElement>(null);
  const shadowRef = useRef<SVGEllipseElement>(null);
  const sparkRef = useRef<SVGGElement>(null);
  const zzzRef = useRef<SVGGElement>(null);

  const moodRef = useRef<BitMood>(mood);
  const pokeRef = useRef(0);
  const gazeSourceRef = useRef(gazeSource);
  gazeSourceRef.current = gazeSource;

  useEffect(() => {
    // A mood change is an event, not just a state swap: give the body an
    // impulse so it visibly *reacts* rather than easing into the new pose.
    if (moodRef.current !== mood) {
      pokeRef.current =
        mood === 'celebrate' ? 3.6 : mood === 'happy' ? 2.1 : mood === 'wrong' ? -1.4 : 0.5;
      moodRef.current = mood;
    }
  }, [mood]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- state ------------------------------------------------------------
    const body = { x: 100, y: 118 };
    const vel: Vec = { x: 0, y: 0 };
    const chain: ChainPoint[] = Array.from({ length: CHAIN }, (_, i) => ({
      pos: { x: 100, y: 74 - i * SEG },
      prev: { x: 100, y: 74 - i * SEG },
    }));

    let eyeOpen = 1;
    let blinkUntil = 0;
    let nextBlink = 900 + Math.random() * 2600;
    let mouthAmt = 0.45;
    let armAmt = 0;
    const gaze: Vec = { x: 0, y: 0 };
    const gazeTarget: Vec = { x: 0, y: 0 };
    let saccadeAt = 1500;
    let idleGaze: Vec = { x: 0, y: 0 };

    let rect = svg.getBoundingClientRect();
    let rectAge = 0;
    const pointer: Vec = { x: rect.left + rect.width / 2, y: rect.top - 40 };
    let pointerSeen = false;

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointerSeen = true;
    };
    if (trackPointer) window.addEventListener('pointermove', onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    let clock = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dtMs = Math.min(now - last, 50);
      last = now;
      const dt = dtMs / 1000;
      clock += dtMs;

      rectAge += dtMs;
      if (rectAge > 400) {
        rect = svg.getBoundingClientRect();
        rectAge = 0;
      }

      const pose = POSES[moodRef.current];
      const external = gazeSourceRef.current?.() ?? null;

      // ---- body spring + idle float ---------------------------------------
      const bob = reduced ? 0 : Math.sin(clock / 1150) * 3.2 * pose.liveliness;
      const sway = reduced ? 0 : Math.sin(clock / 1730 + 1.2) * 2.1 * pose.liveliness;
      // A tilted phone makes it lean, which is most of why it reads as being
      // in the room with you rather than printed on the screen.
      const lean = external && !reduced ? external.x * 5 : 0;
      const targetY = 118 + bob;
      const targetX = 100 + sway + lean;

      if (pokeRef.current !== 0) {
        vel.y -= pokeRef.current * 62;
        vel.x += (Math.random() - 0.5) * 24;
        pokeRef.current = 0;
      }

      // Critically damped-ish spring: stiff enough to feel snappy, damped
      // enough that it never oscillates into looking broken.
      const stiffness = 130;
      const damping = 13;
      vel.x += (targetX - body.x) * stiffness * dt;
      vel.y += (targetY - body.y) * stiffness * dt;
      vel.x -= vel.x * damping * dt;
      vel.y -= vel.y * damping * dt;
      body.x += vel.x * dt;
      body.y += vel.y * dt;

      // Wrong answer: a short, sharp horizontal shudder on top of the spring.
      const shake =
        moodRef.current === 'wrong' && !reduced ? Math.sin(clock / 38) * Math.max(0, 6 - clock / 900) : 0;

      // ---- squash & stretch from vertical velocity ------------------------
      const stretch = Math.max(-0.22, Math.min(0.28, -vel.y / 900));
      const scaleY = 1 + stretch;
      const scaleX = 1 - stretch * 0.72;

      rootRef.current?.setAttribute('transform', `translate(${(body.x - 100 + shake).toFixed(2)} ${(body.y - 118).toFixed(2)})`);
      bodyRef.current?.setAttribute(
        'transform',
        `translate(100 152) scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)}) translate(-100 -152)`,
      );

      // Shadow shrinks and fades as the creature rises — the cheapest possible
      // depth cue and the thing that sells the hop.
      const lift = Math.max(0, 118 - body.y);
      shadowRef.current?.setAttribute('rx', String(30 - lift * 0.34));
      shadowRef.current?.setAttribute('opacity', String(Math.max(0.05, 0.3 - lift * 0.008)));

      // ---- antenna: Verlet chain hanging off the head ---------------------
      const anchor: Vec = { x: body.x + shake, y: body.y - 44 };
      chain[0].pos = { ...anchor };
      chain[0].prev = { ...anchor };
      for (let i = 1; i < chain.length; i++) {
        const p = chain[i];
        const vx = (p.pos.x - p.prev.x) * 0.94;
        const vy = (p.pos.y - p.prev.y) * 0.94;
        p.prev = { ...p.pos };
        p.pos.x += vx;
        // Negative gravity: the antenna wants to stand up, so "gravity" points
        // skyward and the chain trails behind lateral movement instead.
        p.pos.y += vy - 34 * dt;
        if (moodRef.current === 'thinking') p.pos.x -= 26 * dt;
        if (moodRef.current === 'sleep') p.pos.y += 62 * dt;
      }
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 1; i < chain.length; i++) {
          const a = chain[i - 1].pos;
          const b = chain[i].pos;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const diff = (dist - SEG) / dist;
          // Only the free end moves; the anchor is pinned to the head.
          b.x -= dx * diff * (i === 1 ? 1 : 0.5);
          b.y -= dy * diff * (i === 1 ? 1 : 0.5);
          if (i > 1) {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
          }
        }
      }
      const d = `M ${chain[0].pos.x.toFixed(1)} ${chain[0].pos.y.toFixed(1)} ` +
        chain
          .slice(1)
          .map((p, i) => {
            const prev = chain[i].pos;
            const cx = (prev.x + p.pos.x) / 2;
            const cy = (prev.y + p.pos.y) / 2;
            return `Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
          })
          .join(' ') +
        ` T ${chain[chain.length - 1].pos.x.toFixed(1)} ${chain[chain.length - 1].pos.y.toFixed(1)}`;
      antennaRef.current?.setAttribute('d', d);

      const tip = chain[chain.length - 1].pos;
      const tipPrev = chain[chain.length - 2].pos;
      const tipAngle = (Math.atan2(tip.y - tipPrev.y, tip.x - tipPrev.x) * 180) / Math.PI + 90;
      caretRef.current?.setAttribute(
        'transform',
        `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)}) rotate(${tipAngle.toFixed(1)})`,
      );
      // The antenna tip is a text caret, and it blinks on the same ~530ms
      // cadence a terminal cursor does.
      caretRef.current?.setAttribute(
        'opacity',
        moodRef.current === 'sleep' ? '0.25' : clock % 1060 < 530 ? '1' : '0.25',
      );

      // ---- eyes: blink, gaze, saccades ------------------------------------
      if (!reduced && clock > nextBlink && moodRef.current !== 'sleep') {
        blinkUntil = clock + 120;
        nextBlink = clock + 1400 + Math.random() * 3800;
      }
      const blinking = clock < blinkUntil;
      const targetOpen = blinking ? 0.04 : pose.eyeOpen;
      eyeOpen = lerp(eyeOpen, targetOpen, Math.min(1, dt * (blinking ? 34 : 14)));

      if (pose.gaze) {
        gazeTarget.x = pose.gaze.x;
        gazeTarget.y = pose.gaze.y;
      } else if (external) {
        gazeTarget.x = Math.max(-1, Math.min(1, external.x));
        gazeTarget.y = Math.max(-1, Math.min(1, external.y));
      } else if (trackPointer && pointerSeen && rect.width > 0) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * 0.55;
        const dx = (pointer.x - cx) / Math.max(240, rect.width * 2.4);
        const dy = (pointer.y - cy) / Math.max(200, rect.height * 2);
        gazeTarget.x = Math.max(-1, Math.min(1, dx));
        gazeTarget.y = Math.max(-1, Math.min(1, dy));
      } else {
        // With no pointer to follow it looks around on its own, otherwise a
        // static stare makes it read as a dead illustration.
        if (clock > saccadeAt) {
          idleGaze = { x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 0.9 };
          saccadeAt = clock + 1200 + Math.random() * 2600;
        }
        gazeTarget.x = idleGaze.x;
        gazeTarget.y = idleGaze.y;
      }
      gaze.x = lerp(gaze.x, gazeTarget.x, Math.min(1, dt * 9));
      gaze.y = lerp(gaze.y, gazeTarget.y, Math.min(1, dt * 9));

      const setEye = (
        group: SVGGElement | null,
        pupil: SVGGElement | null,
        lid: SVGPathElement | null,
        baseX: number,
      ) => {
        group?.setAttribute(
          'transform',
          `translate(${baseX} 146) scale(1 ${Math.max(0.04, eyeOpen).toFixed(3)}) translate(${-baseX} -146)`,
        );
        pupil?.setAttribute('transform', `translate(${(gaze.x * 4.6).toFixed(2)} ${(gaze.y * 3.4).toFixed(2)})`);
        // The lid arc only shows for the squinting poses; opacity keeps it
        // from ghosting over a wide-open eye.
        lid?.setAttribute('opacity', String(eyeOpen < 0.5 ? 1 : 0));
      };
      setEye(eyeLRef.current, pupilLRef.current, lidLRef.current, 84);
      setEye(eyeRRef.current, pupilRRef.current, lidRRef.current, 116);

      // ---- mouth ----------------------------------------------------------
      mouthAmt = lerp(mouthAmt, pose.mouth, Math.min(1, dt * 11));
      const m = mouthAmt;
      const width = 13 + Math.abs(m) * 5;
      const curve = m * 11;
      mouthRef.current?.setAttribute(
        'd',
        `M ${100 - width} 166 Q 100 ${166 + curve} ${100 + width} 166`,
      );

      // ---- bracket arms ---------------------------------------------------
      const flap =
        moodRef.current === 'wave' || moodRef.current === 'celebrate'
          ? Math.sin(clock / 110) * 0.42
          : 0;
      armAmt = lerp(armAmt, pose.arms, Math.min(1, dt * 8));
      const armDeg = (armAmt + flap) * 34;
      armLRef.current?.setAttribute('transform', `rotate(${(-armDeg).toFixed(1)} 56 152)`);
      armRRef.current?.setAttribute('transform', `rotate(${armDeg.toFixed(1)} 144 152)`);

      // ---- decorations ----------------------------------------------------
      const celebrating = moodRef.current === 'celebrate' || moodRef.current === 'happy';
      sparkRef.current?.setAttribute('opacity', celebrating ? '1' : '0');
      if (celebrating) {
        sparkRef.current?.setAttribute(
          'transform',
          `translate(0 ${(Math.sin(clock / 220) * 3).toFixed(1)}) rotate(${(Math.sin(clock / 700) * 8).toFixed(1)} 100 120)`,
        );
      }
      zzzRef.current?.setAttribute('opacity', moodRef.current === 'sleep' ? '1' : '0');
      if (moodRef.current === 'sleep') {
        zzzRef.current?.setAttribute('transform', `translate(${(Math.sin(clock / 900) * 4).toFixed(1)} ${(-((clock / 40) % 22)).toFixed(1)})`);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (trackPointer) window.removeEventListener('pointermove', onMove);
    };
  }, [trackPointer]);

  return (
    <svg
      ref={svgRef}
      className={`bit ${className}`}
      width={size}
      height={size * 1.1}
      viewBox="0 0 200 220"
      role="img"
      aria-label={`Bit the mascot, looking ${mood}`}
      onClick={() => {
        pokeRef.current = 2.4;
        onPoke?.();
      }}
      style={{ cursor: onPoke ? 'pointer' : 'default' }}
    >
      <ellipse ref={shadowRef} cx="100" cy="198" rx="30" ry="6" fill="#ffffff" opacity="0.16" />

      <g ref={rootRef}>
        {/* antenna sits behind the body so the base tucks under the head */}
        <path
          ref={antennaRef}
          d="M 100 74 L 100 40"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <rect ref={caretRef} x="-3" y="-9" width="6" height="16" rx="1.5" fill="#ffffff" />

        <g ref={sparkRef} opacity="0">
          <path d="M42 96 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 z" fill="#ffffff" opacity="0.85" />
          <path d="M158 112 l2.2 -6 l2.2 6 l6 2.2 l-6 2.2 l-2.2 6 l-2.2 -6 l-6 -2.2 z" fill="#ffffff" opacity="0.7" />
          <path d="M150 78 l1.6 -4.4 l1.6 4.4 l4.4 1.6 l-4.4 1.6 l-1.6 4.4 l-1.6 -4.4 l-4.4 -1.6 z" fill="#ffffff" opacity="0.55" />
        </g>

        <g ref={zzzRef} opacity="0">
          <text x="146" y="92" fontFamily="var(--font-mono)" fontSize="16" fill="#ffffff" opacity="0.75">z</text>
          <text x="158" y="76" fontFamily="var(--font-mono)" fontSize="12" fill="#ffffff" opacity="0.5">z</text>
        </g>

        <g ref={bodyRef}>
          {/* bracket arms — the coding motif, doubling as the creature's hands */}
          <path
            ref={armLRef}
            d="M62 134 L46 152 L62 170"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            ref={armRRef}
            d="M138 134 L154 152 L138 170"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          <rect x="66" y="112" width="68" height="76" rx="26" fill="#ffffff" />
          {/* a soft top-light keeps the flat white from looking like a sticker */}
          <rect x="66" y="112" width="68" height="76" rx="26" fill="url(#bit-sheen)" />

          <g ref={eyeLRef}>
            <g ref={pupilLRef}>
              <ellipse cx="84" cy="146" rx="7" ry="8.6" fill="#08080a" />
              <circle cx="86.4" cy="142.6" r="2.1" fill="#ffffff" opacity="0.9" />
            </g>
            <path ref={lidLRef} d="M75 145 Q84 138 93 145" stroke="#08080a" strokeWidth="3"
              strokeLinecap="round" fill="none" opacity="0" />
          </g>
          <g ref={eyeRRef}>
            <g ref={pupilRRef}>
              <ellipse cx="116" cy="146" rx="7" ry="8.6" fill="#08080a" />
              <circle cx="118.4" cy="142.6" r="2.1" fill="#ffffff" opacity="0.9" />
            </g>
            <path ref={lidRRef} d="M107 145 Q116 138 125 145" stroke="#08080a" strokeWidth="3"
              strokeLinecap="round" fill="none" opacity="0" />
          </g>

          <path ref={mouthRef} d="M87 166 Q100 171 113 166" stroke="#08080a" strokeWidth="3.4"
            strokeLinecap="round" fill="none" />
        </g>
      </g>

      <defs>
        <linearGradient id="bit-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#9a9aa6" stopOpacity="0.28" />
        </linearGradient>
      </defs>
    </svg>
  );
}
