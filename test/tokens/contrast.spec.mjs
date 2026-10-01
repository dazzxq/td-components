#!/usr/bin/env node
/**
 * Rendered contrast gate (v0.14.0; v0.20.0 minimal surfaces). For every button variant × state (rest / disabled /
 * loading) and every toast type, in light + dark, over four backdrops (flat black, flat white, a fine checkerboard, a
 * saturated "photo"), in Chromium / Firefox / WebKit:
 *   1. render the element with its ink hidden (text/icons transparent) and screenshot it — the REAL background after
 *      blur and fill (v0.20.0: solid buttons, neutral 94 % toasts);
 *   2. sample the interior (inset away from the rims/radius) and take the MINIMUM contrast against the declared ink
 *      (computed colour; alpha composited over each sampled pixel);
 *   3. require ≥ 4.7:1 for labels, ≥ 3.2:1 for icons / close glyphs / the loading spinner; a DISABLED button's label
 *      and icon need ≥ 2.2:1 (greyed out on purpose — WCAG 1.4.3 / 1.4.11 exempt inactive controls, v0.14.3);
 *   4. assert opacity 1 on the element and its ancestors (a faded element cannot hide a failure).
 * v0.20.0: every filled variant and two `.td-btn--custom` colours (dark + white text, light + dark text) are also
 * measured in the REAL hover state (the pointer is moved onto the button; the fill is the computed darker solid).
 * Ghost buttons (v0.17.0) have no fill of their own and sit on the page background, so they are measured only over
 * the theme's page colour: white (light) / black (dark). Same for the content-layer alerts (message + heading ≥ 4.7,
 * icon / close ≥ 3.2 on the variant fill) and badges (soft fill, outline, stamp) of v0.18.0 F5.
 * No dependencies: PNGs are decoded with node:zlib.
 *
 *   node test/tokens/contrast.spec.mjs            (npm run test:contrast)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://td-contrast.test';
const TD_CSS = await readFile(join(ROOT, 'td.css'), 'utf8');
const LABEL_MIN = 4.7;
const DISABLED_MIN = 2.2;
const ICON_MIN = 3.2;
const THEMES = ['light', 'dark'];
const BACKDROPS = ['black', 'white', 'checker', 'photo'];

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>
  html, body { margin: 0; }
  #backdrop { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
  #backdrop .photo { width: 100%; height: 100%; object-fit: cover; display: block; }
  #stage { position: fixed; top: 96px; left: 48px; z-index: 1; }
  .td-contrast-probe-noink, .td-contrast-probe-noink * { color: transparent !important; }
  .td-contrast-probe-noink svg { visibility: hidden !important; }
</style>
<script type="module" src="${ORIGIN}/test/tokens/contrast-page.js"></script>
</head><body><div id="backdrop"></div><div id="stage"></div></body></html>`;

// ---------- PNG decode (8-bit RGB/RGBA, non-interlaced — what Playwright emits) ----------
function decodePng(buf) {
  let p = 8;
  let width = 0; let height = 0; let colorType = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}

// ---------- colour maths ----------
const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function parseColor(str) {
  const m = String(str).match(/-?[\d.]+/g);
  if (!m) return null;
  const n = m.map(Number);
  const k = String(str).startsWith('color(') ? 255 : 1;
  return { rgb: [n[0] * k, n[1] * k, n[2] * k], a: n.length > 3 ? n[3] : 1 };
}
const composite = (ink, bg) => ink.rgb.map((v, i) => v * ink.a + bg[i] * (1 - ink.a));

// ---------- browsers ----------
const notes = [];
async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

const failures = [];
let checks = 0;
const worst = new Map(); // name → lowest label ratio seen (report)

async function runEngine(name, launcher) {
  const browser = await launcher.launch(await launchOptions(name, launcher));
  const context = await browser.newContext({ viewport: { width: 900, height: 480 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: TD_CSS });
    if (/^\/(src|test)\//.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      const type = { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css' }[ext] || 'application/octet-stream';
      try { return route.fulfill({ status: 200, contentType: type, body: await readFile(join(ROOT, url.pathname)) }); } catch { return route.fulfill({ status: 404, body: '' }); }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.__contrastSetup === 'function');
  const count = await page.evaluate(() => window.__contrastCount);
  const pageOnly = await page.evaluate(() => window.__contrastPageOnly || []);
  for (const theme of THEMES) {
    for (const backdrop of BACKDROPS) {
      for (let i = 0; i < count; i++) {
        if (pageOnly[i] && backdrop !== (theme === 'dark' ? 'black' : 'white')) continue;
        const info = await page.evaluate(([n, t, b]) => window.__contrastSetup(n, t, b, true), [i, theme, backdrop]);
        const tag = `${name} ${theme} ${backdrop} ${info.name}`;
        checks++;
        if (info.opacity !== 1) failures.push(`${tag}: opacity ${info.opacity} (faded elements are not allowed to hide contrast)`);
        const { x, y, width, height } = info.rect;
        if (info.hover) {
          // real :hover — move the pointer onto the button, let the background-color transition settle
          await page.mouse.move(Math.round(x + width / 2), Math.round(y + height / 2));
          await page.waitForTimeout(300);
          const hovered = await page.evaluate(() => !!document.querySelector('#stage .td-btn:hover'));
          if (!hovered) failures.push(`${tag}: pointer is not over the button (hover case not measured)`);
        }
        const png = decodePng(await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(width), height: Math.ceil(height) } }));
        // interior: inset away from the rim / rounded corners
        const ix = Math.max(3, Math.round(png.width * 0.12)); const iy = Math.max(3, Math.round(png.height * 0.22));
        if (info.hover) await page.mouse.move(1, 1); // leave: the next case starts without hover
        const samples = [];
        for (let yy = iy; yy < png.height - iy; yy += 2) for (let xx = ix; xx < png.width - ix; xx += 2) samples.push(png.px(xx, yy));
        const minFor = (inkStr) => {
          const ink = parseColor(inkStr);
          if (!ink) return Infinity;
          let m = Infinity;
          for (const bg of samples) m = Math.min(m, ratio(composite(ink, bg), bg));
          return m;
        };
        const lbl = info.name.includes(':loading') ? null : minFor(info.ink.label);
        if (lbl !== null) {
          checks++;
          // v0.14.3: a DISABLED label is greyed out on purpose (WCAG 1.4.3 exempts disabled controls) — it must stay
          // legible (≥ DISABLED_MIN), not reach the AA text threshold
          const min = info.name.includes(':disabled') ? DISABLED_MIN : LABEL_MIN;
          if (min === LABEL_MIN) worst.set(`${theme} ${info.name}`, Math.min(worst.get(`${theme} ${info.name}`) ?? Infinity, lbl));
          if (lbl < min) failures.push(`${tag}: label ${lbl.toFixed(2)}:1 < ${min}`);
        }
        if (info.ink.heading) { // v0.18.0 F5: the alert heading is text too
          checks++;
          const h = minFor(info.ink.heading);
          worst.set(`${theme} ${info.name} heading`, Math.min(worst.get(`${theme} ${info.name} heading`) ?? Infinity, h));
          if (h < LABEL_MIN) failures.push(`${tag}: heading ${h.toFixed(2)}:1 < ${LABEL_MIN}`);
        }
        for (const key of ['icon', 'close', 'spinner']) {
          if (!info.ink[key]) continue;
          checks++;
          const r = minFor(info.ink[key]);
          const imin = info.name.includes(':disabled') ? DISABLED_MIN : ICON_MIN; // disabled icons greyed out like labels
          if (r < imin) failures.push(`${tag}: ${key} ${r.toFixed(2)}:1 < ${imin}`);
        }
      }
    }
  }
  await browser.close();
}

for (const [name, launcher] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  try { await runEngine(name, launcher); } catch (e) { failures.push(`${name}: could not run — ${e.message.split('\n')[0]}`); }
}
for (const n of notes) console.log(`  ${n}`);
const report = [...worst.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(2)}`);
console.log(`  lowest label ratios: ${report.join(' · ')}`);
const hoverReport = [...worst.entries()].filter(([k]) => /:hover|custom/.test(k)).sort((a, b) => a[1] - b[1]).slice(0, 6)
  .map(([k, v]) => `${k} ${v.toFixed(2)}`);
console.log(`  lowest hover / custom label ratios: ${hoverReport.join(' · ')}`);
if (failures.length) {
  console.log(`Contrast gate: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures.slice(0, 60)) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Contrast gate: all ${checks} checks passed (chromium, firefox, webkit × light/dark × 4 backdrops).`);
