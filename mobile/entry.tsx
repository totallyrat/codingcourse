/**
 * The dev server's root is this folder, so the HTML has to point at a script
 * inside it. Everything real lives in src/mobile; this file exists only so
 * that `npm run dev:mobile` serves a page rather than a 404.
 */
import '../src/mobile/main';
