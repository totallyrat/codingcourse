#!/usr/bin/env node
/**
 * Vendors the three typefaces Codeling ships with so the app renders identically
 * offline (a desktop app should never depend on a CDN at paint time).
 *
 * Run with:  node scripts/fetch-fonts.mjs
 * The woff2 files land in public/fonts and are committed to the repo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'fonts');

// Google Fonts css2 endpoints, requested with a modern UA so we get woff2 back.
const FACES = [
  { file: 'instrument-serif-400.woff2', css: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0&display=swap' },
  { file: 'instrument-serif-400-italic.woff2', css: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap' },
  { file: 'inter-400.woff2', css: 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap' },
  { file: 'inter-500.woff2', css: 'https://fonts.googleapis.com/css2?family=Inter:wght@500&display=swap' },
  { file: 'inter-600.woff2', css: 'https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap' },
  { file: 'jetbrains-mono-400.woff2', css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap' },
  { file: 'jetbrains-mono-700.woff2', css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&display=swap' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const face of FACES) {
    try {
      const cssRes = await fetch(face.css, { headers: { 'User-Agent': UA } });
      const css = await cssRes.text();
      // Prefer the latin subset block; fall back to the first url() we can find.
      const blocks = css.split('/*').filter((b) => b.includes('url('));
      const latin = blocks.find((b) => b.trim().startsWith('latin ')) ?? blocks[blocks.length - 1];
      const url = /url\((https:[^)]+)\)/.exec(latin)?.[1];
      if (!url) throw new Error('no font url in css');
      const bin = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
      await writeFile(resolve(outDir, face.file), bin);
      console.log(`  ✓ ${face.file}  ${(bin.length / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.warn(`  ! ${face.file} — ${err.message}. The CSS fallback stack will be used.`);
    }
  }
}

main();
