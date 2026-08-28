#!/usr/bin/env node
/**
 * Bundles the setup wizard into one self-contained HTML file.
 *
 * The result is the real component running the real scoring functions, with
 * the JavaScript, the stylesheet and the three typefaces all inlined, so it
 * can be opened from a file:// URL or hosted anywhere with no assets beside
 * it. Used for sharing the wizard without shipping the whole desktop app.
 *
 *   node scripts/build-wizard-demo.mjs   ->   dist-demo/wizard.html
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(root, '.wizard-build');

rmSync(stage, { recursive: true, force: true });

execFileSync(
  'npx',
  [
    'vite',
    'build',
    '--config',
    'vite.demo.config.ts',
    '--outDir',
    '.wizard-build',
    '--emptyOutDir',
  ],
  { cwd: root, stdio: 'inherit' },
);

const assets = join(stage, 'assets');
const files = readdirSync(assets);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('build produced no js/css');

let styles = readFileSync(join(assets, css), 'utf8');
const script = readFileSync(join(assets, js), 'utf8');

// Fold the woff2 files into the stylesheet. A single file has nowhere to
// fetch them from, and a silent fallback to Georgia would lose the typography
// the whole design rests on.
let inlined = 0;
styles = styles.replace(/url\(([^)]*?\/?fonts\/[^)'"]+\.woff2)\)/g, (_m, url) => {
  const name = url.split('/').pop();
  const data = readFileSync(join(root, 'public', 'fonts', name)).toString('base64');
  inlined++;
  return `url(data:font/woff2;base64,${data}) format('woff2')`;
});
styles = styles.replace(/\s*format\('woff2'\)\s*format\('woff2'\)/g, " format('woff2')");

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Codeling Setup Wizard</title>
<style>
${styles}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${script}
</script>
</body>
</html>
`;

const out = join(root, 'dist-demo');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'wizard.html'), html, 'utf8');
rmSync(stage, { recursive: true, force: true });

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\n  dist-demo/wizard.html  ${kb(Buffer.byteLength(html))}  (${inlined} fonts inlined)\n`);
