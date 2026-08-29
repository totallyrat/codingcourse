/**
 * A tap you can feel.
 *
 * Two paths, because the platforms give you nothing in common:
 *
 * - Android and desktop Chromium have the Vibration API, and that is that.
 * - Safari has no vibration API at all. What it does have, since iOS 17.4, is
 *   a real haptic when a `<input type="checkbox" switch>` flips. Clicking a
 *   hidden one borrows it. That only works from inside a user gesture, and
 *   only if the element is already in the document — which is why the switch
 *   is installed at start-up rather than the first time it is needed, and why
 *   `haptic()` has to be called straight from the handler rather than after an
 *   await.
 *
 * If a future iOS closes that door, nothing breaks; the app just stops
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
  if (on) haptic('win');
}

/** True when this device has something that can actually produce a tick. */
export function hapticsAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.vibrate === 'function') return true;
  // WebKit: the switch trick needs iOS 17.4 or later, which is also the first
  // version where `switch` is a known attribute at all.
  return typeof document !== 'undefined' && 'switch' in document.createElement('input');
}

/**
 * Puts the hidden switch in the page. Called once at start-up: creating it
 * lazily inside the first tap was too late, and the first tap never buzzed.
 */
export function installHaptics(): void {
  if (typeof document === 'undefined' || iosSwitch) return;
  const mount = () => {
    if (iosSwitch || !document.body) return;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.className = 'haptic-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    // `switch` is what WebKit reacts to; every other engine sees a checkbox
    // nobody can reach.
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = input;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}

function iosTick(): boolean {
  if (!iosSwitch) installHaptics();
  if (!iosSwitch) return false;
  // A real click, not a synthetic change event: the haptic comes from the
  // activation behaviour, and dispatching `change` skips exactly that.
  iosSwitch.click();
  return true;
}

export function haptic(kind: Haptic = 'tap'): void {
  if (!enabled || typeof window === 'undefined') return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (vibrate) {
    try {
      if (vibrate(PATTERNS[kind])) return;
    } catch {
      /* fall through to the WebKit path */
    }
  }
  try {
    iosTick();
  } catch {
    /* no haptics here, which is fine */
  }
}
