#!/usr/bin/env node
/**
 * Rendered contrast gate (v0.14.0; v0.20.0 minimal surfaces). For every button variant × state (rest / disabled /
 * loading) and every toast type, in light + dark, over four backdrops (flat black, flat white, a fine checkerboard, a
 * saturated "photo"), in Chromium / Firefox / WebKit:
 *   1. render the element with its ink hidden (text/icons transparent) and screenshot it — the REAL background after
 *      blur and fill (v0.20.0: solid buttons; v0.21.0: solid pastel toasts);
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
 * v0.21.0: the black tooltip chip (default + start-aligned) over every backdrop; the field focus border (input-field,
 * open dropdown trigger) ≥ 3:1 against the field fill, the backdrop and --td-color-bg (computed colours, page only).
 * v0.22.0: the dropdown create row (accent label ≥ 4.7, plus icon ≥ 3.2) on the menu surface, rest + active, every backdrop.
 * v0.23.0: the td-media-grid tick (off / on) — edge ≥ 3:1 over a white and a black image, "on" glyph ≥ 3.2 on its fill
 * (computed-colour `pairs`; a pair may carry its own `min`). v0.27.0: td-otp-input cells, the td-copy icon button and the
 * skeleton block (pairs, page only). v0.28.0: td-chip-input multi-select rows on the menu surface, every backdrop — selected
 * row label ≥ 4.7 + ✓ ≥ 3.2 (rest + active), locked (aria-disabled) row label ≥ 2.2.
 * v0.24.0: the lightbox side-nav disc (fill vs a white photo / edge vs a black photo ≥ 3:1, chevron ≥ 3.2 on the disc)
 * and the current filmstrip thumb ring vs the strip (≥ 3:1).
 * v0.25.0: the PHP td_badge `icon` (decorative, currentColor) ≥ 3.2:1 on every soft badge fill, label ≥ 4.7 as before.
 * v0.33.0: td-media-picker (dcms2 parity) — card border tokens hover / viewing / checked ≥ 3:1 vs the card surface and the
 *   list background, `.td-media-picker__label` + card texts + page info / td-pagination "Hiển thị…" + upload dropzone texts and
 *   badges ≥ 4.7 (pairs, page only).
 * v0.41.0: the page-only screenshot cases (ghost buttons, alerts, badges) also over the theme's real --td-color-bg and
 *   --td-color-surface (theming plan M5; thresholds unchanged).
 * v0.36.2: pressed states (ADR 0019) — td-button variants + ghost, td-action-button tones, a popup option row carrying
 *   data-td-pressed: label / icon ≥ 4.7 on the pressed fill (pairs, page only).
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
import { decodePng } from '../visual/png.mjs';
import { parseColor as parseCss } from './color-parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://td-contrast.test';
const TD_CSS = await readFile(join(ROOT, 'td.css'), 'utf8');
const LABEL_MIN = 4.7;
const DISABLED_MIN = 2.2;
const ICON_MIN = 3.2;
const FOCUS_MIN = 3; // v0.21.0 P8: field focus border vs field fill / page (WCAG 1.4.11)
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

// PNG decode: test/visual/png.mjs (shared with the visual gate, v0.33.0)

// ---------- colour maths ----------
const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** v0.41.0 (M0): the shared parser (test/tokens/color-parse.js) — rgb()/rgba()/color(srgb …)/hex. */
function parseColor(str) {
  const c = parseCss(str);
  return c ? { rgb: [c.r, c.g, c.b], a: c.a } : null;
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
const focusWorst = new Map(); // v0.21.0: focus border ratios (report)

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
  const realPage = await page.evaluate(() => window.__contrastRealPage || []);
  for (const theme of THEMES) {
    for (const backdrop of [...BACKDROPS, 'theme-bg', 'theme-surface']) {
      for (let i = 0; i < count; i++) {
        if (backdrop.startsWith('theme-')) { if (!realPage[i]) continue; } // v0.41.0: the theme's real page / surface
        else if (pageOnly[i] && backdrop !== (theme === 'dark' ? 'black' : 'white')) continue;
        const info = await page.evaluate(([n, t, b]) => window.__contrastSetup(n, t, b, true), [i, theme, backdrop]);
        const tag = `${name} ${theme} ${backdrop} ${info.name}`;
        if (info.pairs) { // v0.21.0 P8: non-text contrast from computed colours (focus border ≥ 3:1)
          for (const pr of info.pairs) {
            checks++;
            const fg = parseColor(pr.fg); const bg = parseColor(pr.bg);
            const r = fg && bg ? ratio(composite(fg, bg.rgb), bg.rgb) : 0;
            focusWorst.set(`${theme} ${info.name} ${pr.what}`, Math.min(focusWorst.get(`${theme} ${info.name} ${pr.what}`) ?? Infinity, r));
            const min = typeof pr.min === 'number' ? pr.min : FOCUS_MIN;
            if (r < min) failures.push(`${tag}: ${pr.what} ${r.toFixed(2)}:1 < ${min} (${pr.fg} on ${pr.bg})`);
          }
          continue;
        }
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
console.log(`  lowest focus border ratios: ${[...focusWorst.entries()].filter(([k]) => k.includes('focus:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest lightbox disc / thumb ratios: ${[...focusWorst.entries()].filter(([k]) => k.includes('lb-')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  td-table selection ratios (v0.37.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('table-select:')).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest media-grid tick ratios: ${[...focusWorst.entries()].filter(([k]) => k.includes('media-tick:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  media-picker ratios (v0.33.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('media-picker:')).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest pressed-state ratios (v0.36.2): ${[...focusWorst.entries()].filter(([k]) => k.includes('v0362:')).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
// v0.46.0: td-diff pairs (cell tints, kind labels, summary) — fail when the case measured nothing
{
  const v046 = [...focusWorst.entries()].filter(([k]) => k.includes('v046:'));
  if (!v046.length) { console.log('  v046: no td-diff pair measured'); process.exitCode = 1; }
  console.log(`  lowest td-diff ratios (v0.46.0): ${v046.sort((a, b) => a[1] - b[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
}
console.log(`  lowest otp / copy / skeleton ratios (v0.27.0): ${[...focusWorst.entries()].filter(([k]) => /(otp|copy|skeleton):/.test(k)).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest chip-input multi-select label ratios (v0.28.0): ${[...worst.entries()].filter(([k]) => k.includes('chip-multi:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest tree label ratios (v0.29.0): ${[...worst.entries()].filter(([k]) => /tree(-popup)?:/.test(k)).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest datetime-range ratios (v0.40.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('dtr:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest tree check / focus ratios (v0.29.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('tree-pairs:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest repeater button ratios (v0.30.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('repeater:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest sortable / masked-value ratios (v0.31.0): ${[...focusWorst.entries()].filter(([k]) => /(sortable|masked):/.test(k)).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`  lowest number-input ratios (v0.30.0): ${[...focusWorst.entries()].filter(([k]) => k.includes('number:')).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
const hoverReport = [...worst.entries()].filter(([k]) => /:hover|custom/.test(k)).sort((a, b) => a[1] - b[1]).slice(0, 6)
  .map(([k, v]) => `${k} ${v.toFixed(2)}`);
console.log(`  lowest hover / custom label ratios: ${hoverReport.join(' · ')}`);
if (failures.length) {
  console.log(`Contrast gate: ${failures.length} failure(s) of ${checks} checks`);
  for (const f of failures.slice(0, 60)) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Contrast gate: all ${checks} checks passed (chromium, firefox, webkit × light/dark × 4 backdrops).`);
