/**
 * What phone is this, and how does an app get onto its home screen?
 *
 * All of it is a pure function of the user-agent string and two display
 * checks, so it can be tested without a device — and so the install sheet
 * never guesses. Telling an Android user to press Safari's share button is
 * worse than saying nothing.
 */

export type InstallRoute =
  | 'installed' // already launched from the home screen
  | 'ios-safari' // Share -> Add to Home Screen
  | 'ios-other' // Chrome/Firefox on iOS: still WebKit, but no A2HS from here
  | 'prompt' // Android/desktop Chromium: the browser offers it itself
  | 'desktop'; // nothing to do

export interface Platform {
  ios: boolean;
  android: boolean;
  /** Real Safari, not Chrome/Firefox/Edge wearing a WebKit engine. */
  safari: boolean;
  standalone: boolean;
  touch: boolean;
  route: InstallRoute;
}

export interface PlatformInput {
  userAgent: string;
  /** `navigator.standalone` on iOS, or a display-mode: standalone match. */
  standalone: boolean;
  maxTouchPoints?: number;
  platform?: string;
}

export function readPlatform(input: PlatformInput): Platform {
  const ua = input.userAgent || '';
  const touchPoints = input.maxTouchPoints ?? 0;

  // An iPad on iPadOS 13+ reports itself as a Mac. The touch points give it
  // away: no Mac has five of them.
  const iPadOS = /Macintosh/.test(ua) && touchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS;
  const android = /Android/.test(ua);

  // Every browser on iOS says "Safari" somewhere. The ones that are not
  // Safari say something else as well.
  const pretender = /(CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android)/.test(ua);
  const safari = /Safari/.test(ua) && !pretender;

  const standalone = !!input.standalone;
  const touch = touchPoints > 0 || ios || android;

  const route: InstallRoute = standalone
    ? 'installed'
    : ios
      ? safari
        ? 'ios-safari'
        : 'ios-other'
      : android
        ? 'prompt'
        : 'desktop';

  return { ios, android, safari, standalone, touch, route };
}

/** Reads the live environment. Safe to call during render. */
export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { ios: false, android: false, safari: false, standalone: false, touch: false, route: 'desktop' };
  }
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches);
  return readPlatform({
    userAgent: navigator.userAgent,
    standalone: iosStandalone || displayStandalone,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

export interface InstallAdvice {
  title: string;
  lead: string;
  steps: string[];
  /** True when the browser itself can raise the install dialogue. */
  canPrompt: boolean;
}

export function installAdvice(route: InstallRoute): InstallAdvice {
  switch (route) {
    case 'installed':
      return {
        title: 'Installed',
        lead: 'You are running Codeling from your home screen. It works with the network off.',
        steps: [],
        canPrompt: false,
      };
    case 'ios-safari':
      return {
        title: 'Add to your home screen',
        lead: 'Two taps, no App Store, no account. It then opens full screen and works offline.',
        steps: [
          'Tap the Share button in Safari — the square with the arrow.',
          'Scroll down and tap "Add to Home Screen".',
          'Tap "Add". Codeling appears on your home screen like any other app.',
        ],
        canPrompt: false,
      };
    case 'ios-other':
      return {
        title: 'Open this in Safari first',
        lead: 'Only Safari can put a web app on an iPhone home screen — every other iOS browser hands it back to Safari.',
        steps: [
          'Tap the address bar and choose "Open in Safari".',
          'In Safari, tap Share, then "Add to Home Screen".',
        ],
        canPrompt: false,
      };
    case 'prompt':
      return {
        title: 'Install Codeling',
        lead: 'It installs from here — no store, no account — and works offline afterwards.',
        steps: [
          'Tap Install below, or use the browser menu and choose "Install app".',
          'Codeling gets its own icon and opens without browser chrome.',
        ],
        canPrompt: true,
      };
    default:
      return {
        title: 'Install Codeling',
        lead: 'This is the phone build. On a computer, the desktop app is the better fit.',
        steps: ['Use your browser menu and choose "Install Codeling" to keep it in its own window.'],
        canPrompt: true,
      };
  }
}
