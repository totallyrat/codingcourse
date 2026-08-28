#!/usr/bin/env node
/**
 * Renders the app icon and the iOS launch screens.
 *
 * There is no image library in this project and there does not need to be:
 * the icon is an SVG and Chromium can already draw SVG. So it is rendered
 * headlessly at each size the platforms ask for, once, and the PNGs are
 * committed. Re-run it only when assets/icon.svg changes.
 *
 *   node scripts/build-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crop, decodePng, encodePng } from './lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'pwa');
const splashDir = join(outDir, 'splash');
const stage = join(root, '.icon-build');

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const roots = ['/opt/pw-browsers', join(process.env.HOME ?? '', '.cache/ms-playwright')];
  for (const dir of roots) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const candidate = join(dir, entry, 'chrome-linux', 'chrome');
      if (existsSync(candidate)) return candidate;
    }
  }
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No Chromium found. Set CHROME_PATH.');
}

const chrome = findChrome();
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(splashDir, { recursive: true });

const icon = readFileSync(join(root, 'assets', 'icon.svg'), 'utf8');
// The launch screen is already black; the icon's own ground would show up on
// it as a slightly lighter square, which is exactly the sort of detail that
// makes a splash look pasted together.
const mark = icon.replace(/<rect width="512" height="512" fill="url\(#ground\)" \/>/, '');
const serif = readFileSync(join(root, 'public', 'fonts', 'instrument-serif-400.woff2')).toString('base64');

/**
 * Headless Chromium screenshots are the size of the *window*, while the page
 * gets the window minus whatever chrome the platform adds — so asking for
 * 512x512 gives a 512x512 file with an 80-odd pixel band of nothing at the
 * bottom. Rather than hard-code that number, ask for a taller window than we
 * need and cut the picture down to size afterwards.
 */
const SLACK = 160;

function shoot(html, width, height, outFile) {
  const page = join(stage, `page-${width}x${height}-${Math.random().toString(36).slice(2, 8)}.html`);
  const shot = join(stage, `shot-${Math.random().toString(36).slice(2, 8)}.png`);
  writeFileSync(page, html);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height + SLACK}`,
      `--screenshot=${shot}`,
      `file://${page}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const image = decodePng(readFileSync(shot));
  if (image.width < width || image.height < height) {
    throw new Error(`screenshot came back ${image.width}x${image.height}, needed ${width}x${height}`);
  }
  writeFileSync(outFile, encodePng(crop(image, width, height)));
  rmSync(page, { force: true });
  rmSync(shot, { force: true });
}

const shell = (body, width, height, extraCss = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Instrument Serif'; src: url(data:font/woff2;base64,${serif}) format('woff2'); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #050506; overflow: hidden; }
  /* Pinned to the top-left at an exact size, because that is the region the
     screenshot is cropped back to. */
  .frame { position: fixed; top: 0; left: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
  ${extraCss}
</style></head><body><div class="frame">${body}</div></body></html>`;

/* ---------------------------------------------------------------- icons */
const iconSizes = [
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
];

for (const { size, file } of iconSizes) {
  shoot(
    shell(
      `<div class="i">${icon}</div>`,
      size,
      size,
      `.i { width: 100%; height: 100%; } .i svg { width: 100%; height: 100%; display: block; }`,
    ),
    size,
    size,
    join(outDir, file),
  );
  console.log(`icon ${size}px -> public/pwa/${file}`);
}

// Maskable: Android crops icons to whatever shape the launcher likes, so the
// artwork has to sit inside the middle 80% and the ground has to reach the
// edges.
shoot(
  shell(
    `<div class="i">${icon}</div>`,
    512,
    512,
    `.i { width: 100%; height: 100%; display: grid; place-items: center; background: #050506; }
     .i svg { width: 78%; height: 78%; display: block; }`,
  ),
  512,
  512,
  join(outDir, 'icon-maskable-512.png'),
);
console.log('icon maskable -> public/pwa/icon-maskable-512.png');

/* -------------------------------------------------------------- splashes */
// Every iPhone still in circulation, portrait. iOS matches these by exact
// media query and shows nothing at all when none matches.
const DEVICES = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
];

const links = [];
for (const [cssW, cssH, dpr] of DEVICES) {
  const w = cssW * dpr;
  const h = cssH * dpr;
  const file = `splash-${w}x${h}.png`;
  shoot(
    shell(
      `<div class="s"><div class="mark">${mark}</div><div class="word">Codeling</div></div>`,
      w,
      h,
      `.s { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: ${Math.round(w * 0.035)}px; background: #050506; }
       .mark { width: ${Math.round(w * 0.3)}px; height: ${Math.round(w * 0.3)}px; }
       .mark svg { width: 100%; height: 100%; display: block; }
       .word { font-family: 'Instrument Serif', serif; font-size: ${Math.round(w * 0.075)}px;
               color: #fff; letter-spacing: -0.02em; }`,
    ),
    w,
    h,
    join(splashDir, file),
  );
  links.push(
    `    <link rel="apple-touch-startup-image" href="./pwa/splash/${file}" media="(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  );
  console.log(`splash ${w}x${h} -> public/pwa/splash/${file}`);
}

/* ------------------------------------------------ write the <link> block */
const htmlPath = join(root, 'mobile', 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const start = '<!-- splash:start -->';
const end = '<!-- splash:end -->';
if (!html.includes(start)) {
  throw new Error(`mobile/index.html is missing the ${start} marker`);
}
const before = html.slice(0, html.indexOf(start) + start.length);
const after = html.slice(html.indexOf(end));
writeFileSync(htmlPath, `${before}\n${links.join('\n')}\n    ${after}`);
console.log(`wrote ${links.length} startup-image links into mobile/index.html`);

rmSync(stage, { recursive: true, force: true });
