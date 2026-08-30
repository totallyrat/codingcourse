import { useEffect, useRef } from 'react';

/**
 * Paper, for the moments that have earned it: a perfect lesson, or the day's
 * goal being met. One canvas, a few hundred rectangles under gravity with a
 * little drag and a tumbling angle, gone in under three seconds and then
 * unmounted. It never runs when the system asks for reduced motion.
 */
export function Confetti({
  run,
  from = 0.42,
  count = 140,
  life = 2.7,
  power = 1,
  runKey = 0,
}: {
  run: boolean;
  from?: number;
  /** Pieces of paper. A whole-lesson burst wants far more than one answer. */
  count?: number;
  /** Seconds before it has cleared the screen. */
  life?: number;
  /** Scales how hard it is thrown. */
  power?: number;
  /** Change this to fire again — one burst per correct answer, say. */
  runKey?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.documentElement.dataset.reduceMotion === 'true') return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // The app has three colours and no accent; confetti borrows exactly those.
    const colours = ['#ffffff', '#f6c66b', '#7ef0b2', '#8e8e9a'];
    const pieces = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = (260 + Math.random() * 460) * power;
      return {
        x: width * (0.5 + (Math.random() - 0.5) * 0.36),
        y: height * from,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 4 + Math.random() * 5,
        h: 7 + Math.random() * 8,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
        colour: colours[(Math.random() * colours.length) | 0],
      };
    });

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      ctx.clearRect(0, 0, width, height);

      for (const p of pieces) {
        p.vy += 1500 * dt; // gravity
        p.vx *= 1 - 1.1 * dt; // air
        p.vy *= 1 - 0.35 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / (life - 0.1));
        ctx.fillStyle = p.colour;
        // Scaling the height by the tumble is a cheap way to read as paper
        // rather than as squares falling.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.angle * 1.6)));
        ctx.restore();
      }

      if (elapsed < life) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, from, count, life, power, runKey]);

  if (!run) return null;
  return <canvas className="confetti" ref={canvasRef} aria-hidden="true" />;
}
