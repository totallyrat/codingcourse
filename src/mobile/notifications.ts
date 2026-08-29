/* ============================================================================
   Daily reminders.

   What a web app can honestly promise here is narrower than an app store app,
   and the settings screen says so rather than pretending:

   - **Android, installed**: a periodic background sync wakes the service
     worker roughly daily and it posts the reminder. Chrome decides how often,
     and only for an installed app you actually use.
   - **iPhone**: Safari will not schedule anything in the background without a
     push server, and there is no server here — that is the whole point of the
     app. So the reminder is set while the app is open and fires if it is still
     open at the time.
   - **Everywhere**: a notification is only shown if no lesson has been
     finished that day. Being nagged about a thing you already did is how
     people turn reminders off for good.
   ========================================================================== */

const PREF_KEY = 'codeling.reminder';

export interface ReminderPref {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER: ReminderPref = { enabled: false, hour: 19, minute: 0 };

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function readReminder(): ReminderPref {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_REMINDER, ...(JSON.parse(raw) as ReminderPref) } : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

export function writeReminder(pref: ReminderPref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* private mode */
  }
}

/** Milliseconds until the next time the clock reads hour:minute. */
export function msUntil(hour: number, minute: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function show(title: string, body: string): Promise<void> {
  if (permissionState() !== 'granted') return;
  const registration = await navigator.serviceWorker?.getRegistration?.();
  const options: NotificationOptions = {
    body,
    icon: './pwa/icon-192.png',
    badge: './pwa/icon-192.png',
    tag: 'codeling-reminder',
  };
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

let timer: number | null = null;

/**
 * Arms the in-page timer. `hasPractisedToday` is read at fire time rather than
 * now, so finishing a lesson between arming and firing cancels the nudge.
 */
export function scheduleReminder(pref: ReminderPref, hasPractisedToday: () => boolean): void {
  cancelReminder();
  if (!pref.enabled || permissionState() !== 'granted') return;
  const delay = msUntil(pref.hour, pref.minute);
  // setTimeout is clamped to about 24 days, and the longest wait here is a
  // day, so a single timer is enough.
  timer = window.setTimeout(() => {
    if (!hasPractisedToday()) {
      void show('Your streak is waiting', 'One short lesson keeps it alive.');
    }
    scheduleReminder(pref, hasPractisedToday);
  }, delay);
}

export function cancelReminder(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

export type ReminderResult = 'on' | 'denied' | 'unsupported';

/** Must be called from a user gesture, or iOS never shows the prompt. */
export async function requestReminders(): Promise<ReminderResult> {
  if (!notificationsSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  // Best effort, and only Chromium has it: ask to be woken daily even when the
  // app is closed. Everything else falls back to the in-page timer.
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    const sync = (registration as unknown as { periodicSync?: { register: (t: string, o: object) => Promise<void> } })
      ?.periodicSync;
    await sync?.register('codeling-reminder', { minInterval: 20 * 60 * 60 * 1000 });
  } catch {
    /* not available, or not an installed app — the timer still works */
  }
  return 'on';
}

export async function testNotification(): Promise<void> {
  await show('This is what a reminder looks like', 'Tap it to open Codeling.');
}

/** One line of truth about what reminders will actually do on this device. */
export function reminderCaveat(ios: boolean, installed: boolean): string {
  if (ios) {
    return installed
      ? 'On iPhone, a home-screen app cannot schedule notifications in the background without a server, and there is no server here. The reminder fires if Codeling is open at the time.'
      : 'On iPhone, add Codeling to your home screen first. Even then it can only remind you while it is open — Safari has no background scheduling without a push server.';
  }
  return installed
    ? 'Installed on Android, Chrome wakes the app roughly daily to post this. It is skipped on any day you have already practised.'
    : 'Install Codeling to your home screen and Chrome can post this even when it is closed. Until then it fires while the app is open.';
}
