import { useEffect, useRef, useState } from 'react';
import { Bit, type BitMood } from './Bit';

/**
 * Bit with a speech bubble. The line types itself in at a readable pace —
 * a full sentence appearing instantly reads as UI, one that types reads as
 * someone talking to you. Any change of line restarts the typing, and the
 * bubble reserves its final height so the layout never jumps mid-sentence.
 */
export function BitSays({
  mood = 'idle',
  line,
  size = 118,
  side = 'left',
  onPoke,
  instant = false,
}: {
  mood?: BitMood;
  line: string;
  size?: number;
  side?: 'left' | 'right';
  onPoke?: () => void;
  instant?: boolean;
}) {
  const [shown, setShown] = useState(instant ? line : '');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduced) {
      setShown(line);
      return;
    }
    setShown('');
    let i = 0;
    const step = () => {
      i += 1;
      setShown(line.slice(0, i));
      if (i < line.length) {
        // Punctuation gets a beat, which is most of what makes it sound like
        // speech rather than a teleprinter.
        const ch = line[i - 1];
        const delay = ch === '.' || ch === '!' || ch === '?' ? 190 : ch === ',' ? 90 : 15;
        timer.current = window.setTimeout(step, delay);
      }
    };
    timer.current = window.setTimeout(step, 140);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [line, instant]);

  return (
    <div className={`bitsays bitsays--${side}`}>
      <Bit mood={mood} size={size} onPoke={onPoke} />
      <div className="bitsays__bubble">
        <p className="bitsays__text">
          {shown}
          {shown.length < line.length ? <span className="bitsays__cursor" /> : null}
        </p>
      </div>
    </div>
  );
}
