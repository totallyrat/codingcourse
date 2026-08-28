/**
 * Service worker registration.
 *
 * The worker is what turns a web page into something that opens on a plane.
 * It is generated at build time with the exact file list of the build it
 * belongs to (see scripts/build-mobile.mjs), so "installed" means every
 * lesson, the Python interpreter and the three typefaces are on the device —
 * not "the shell loads and the rest 404s".
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // A dev server has no generated worker to register.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` exists only when an older worker is already serving
            // this page, which is what makes this an update rather than a
            // first install.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('codeling:update'));
            }
          });
        });
      })
      .catch(() => {
        /* Offline support is a bonus; the app runs either way. */
      });
  });
}
