/**
 * Device tilt, as a gaze direction for the mascot.
 *
 * On a phone there is no cursor for Bit to follow, and a mascot that only ever
 * looks at nothing goes back to being an illustration. Tilt is the pointer a
 * phone has. iOS requires an explicit permission grant from inside a user
 * gesture, so this is opt-in and remembers the answer.
 */

const PREF_KEY = 'codeling.tilt';

interface Vec {
  x: number;
  y: number;
}

let listening = false;
let seen = false;
const smoothed: Vec = { x: 0, y: 0 };

type PermissionFn = () => Promise<'granted' | 'denied'>;
const requestPermission = (): PermissionFn | null => {
  const ctor = typeof window !== 'undefined' ? (window.DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }) : undefined;
  return typeof ctor?.requestPermission === 'function' ? ctor.requestPermission.bind(ctor) : null;
};

function onOrientation(event: DeviceOrientationEvent): void {
  const gamma = event.gamma ?? 0; // left / right, degrees
  const beta = event.beta ?? 45; // front / back, degrees
  // A phone is normally held at about 45 degrees, so that is the neutral
  // point rather than flat on a table.
  const x = Math.max(-1, Math.min(1, gamma / 32));
  const y = Math.max(-1, Math.min(1, (beta - 45) / 38));
  // Accelerometer output is noisy enough to make the eyes jitter; a low-pass
  // filter costs one line and removes all of it.
  smoothed.x += (x - smoothed.x) * 0.18;
  smoothed.y += (y - smoothed.y) * 0.18;
  seen = true;
}

/** Sampled every frame by the mascot. Null means "nothing to follow". */
export function tiltGaze(): Vec | null {
  return listening && seen ? smoothed : null;
}

export function tiltSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

export function tiltEnabled(): boolean {
  return listening;
}

export function tiltRemembered(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on';
  } catch {
    return false;
  }
}

function attach(): void {
  if (listening) return;
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  listening = true;
}

export function disableTilt(): void {
  if (listening) window.removeEventListener('deviceorientation', onOrientation);
  listening = false;
  seen = false;
  smoothed.x = 0;
  smoothed.y = 0;
  try {
    localStorage.setItem(PREF_KEY, 'off');
  } catch {
    /* private mode */
  }
}

export type TiltResult = 'on' | 'denied' | 'unsupported';

/** Must be called from a user gesture on iOS, or the prompt never appears. */
export async function enableTilt(): Promise<TiltResult> {
  if (!tiltSupported()) return 'unsupported';
  const ask = requestPermission();
  if (ask) {
    try {
      const answer = await ask();
      if (answer !== 'granted') return 'denied';
    } catch {
      return 'denied';
    }
  }
  attach();
  try {
    localStorage.setItem(PREF_KEY, 'on');
  } catch {
    /* private mode */
  }
  return 'on';
}

/**
 * Re-attaches on launch when the answer was already yes. Silent: no permission
 * is requested here, because a prompt on cold start with no explanation is how
 * you teach somebody to press Deny.
 */
export function restoreTilt(): void {
  if (!tiltRemembered() || !tiltSupported()) return;
  if (requestPermission()) {
    // Permission was granted once; the listener simply works again, and if it
    // does not, `seen` stays false and the mascot falls back to looking around
    // on its own.
    attach();
  } else {
    attach();
  }
}
