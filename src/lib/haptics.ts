/**
 * A tap you can feel.
 *
 * Android and desktop Chromium have the Vibration API. Safari does not, and
 * on an iPhone that is the whole audience — so there is a second, best-effort
 * path: iOS 17.4 gives `<input type="checkbox" switch>` a real haptic when it
 * flips, and flipping a hidden one inside the same user gesture borrows it.
 * If a future iOS stops doing that, nothing breaks; the app just stops
 * buzzing. Nothing here is load-bearing.
 */

export type Haptic = 'tap' | 'select' | 'right' | 'wrong' | 'win';

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  select: 12,
  right: [14, 40, 22],
  wrong: [26, 44, 26],
  win: [16, 40, 16, 40, 48],
};

const PREF_KEY = 'codeling.haptics';
let enabled = read();
let iosSwitch: HTMLInputElement | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function hapticsEnabled(): boolean {
  return enabled;
}

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  if (on) haptic('tap');
}

function iosTick(): void {
  if (typeof document === 'undefined') return;
  if (!iosSwitch) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    // `switch` is the attribute WebKit reacts to; every other engine sees a
    // plain checkbox nobody can reach.
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:fixed;left:-40px;bottom:0;width:24px;height:16px;opacity:0.001;pointer-events:none;';
    document.body.appendChild(input);
    iosSwitch = input;
  }
  iosSwitch.checked = !iosSwitch.checked;
  iosSwitch.dispatchEvent(new Event('change', { bubbles: true }));
}

export function haptic(kind: Haptic = 'tap'): void {
  if (!enabled || typeof window === 'undefined') return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (vibrate) {
    try {
      vibrate(PATTERNS[kind]);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    iosTick();
  } catch {
    /* no haptics here, which is fine */
  }
}
