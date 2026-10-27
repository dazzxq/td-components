/**
 * Shared plumbing of the visual gates (test/visual/*.visual.mjs): reference-platform guard (SKIP / STRICT / FORCE /
 * --update semantics), the routed page (td.css + src/ + test/ served from the repo, no network), settle, and the
 * baseline compare / write. See the header of media-picker.visual.mjs for the full contract; extracted in v0.84.0 so
 * dropdown.visual.mjs behaves identically. Each script is its own process: the state below is per script.
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, comparePng } from './png.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_DIR = join(ROOT, 'test', 'visual', 'baseline', 'linux-chromium');
const OUT_DIR = process.env.TD_VISUAL_OUT || join(tmpdir(), 'td-visual');
export const ORIGIN = 'http://td-visual.test';
export const UPDATE = process.argv.includes('--update');
const STRICT = process.env.TD_VISUAL_STRICT === '1';
export const FORCE = process.env.TD_VISUAL_FORCE === '1';
const CHANNEL_DELTA = 16; // ΔRGB per channel above which a pixel counts as different
const MAX_DIFF_RATIO = 0.005; // ≤ 0.5% differing pixels per shot
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

export const failures = [];
export const notes = [];
const missing = [];
let compared = 0;
let written = 0;

// ---------- reference platform guard ----------
async function pinnedChromiumVersion() {
  const candidates = [join(ROOT, 'node_modules', 'playwright-core', 'browsers.json')];
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    const json = JSON.parse(await readFile(f, 'utf8'));
    const entry = (json.browsers || []).find((b) => b.name === 'chromium');
    if (entry?.browserVersion) return entry.browserVersion;
  }
  return null;
}

let scriptName = 'test/visual/media-picker.visual.mjs';
function skip(reason) {
  const fatal = UPDATE || STRICT;
  (fatal ? console.error : console.log)(`Visual gate ${fatal ? 'FAILED (cannot run)' : 'SKIPPED'}: ${reason}`);
  console.log(`Baselines are Linux + pinned Chromium only (mcr.microsoft.com/playwright:v<playwright-core>-jammy, CI job \`visual\`). See ${scriptName}.`);
  process.exit(fatal ? 1 : 0);
}
/** "148.0.7778.96" → "148.0.7778" */
const buildOf = (v) => String(v).split('.').slice(0, 3).join('.');

/** Platform / install guards, then launches Chromium and checks its build. Returns { browser, version }. */
export async function startGate(name) {
  scriptName = name;
  if (process.platform !== 'linux' && !FORCE) skip(`platform is ${process.platform}, not linux`);
  const pinned = await pinnedChromiumVersion();
  if (!pinned && !FORCE) skip('cannot read the Chromium version pinned by playwright-core (node_modules/playwright-core/browsers.json)');
  if (!existsSync(chromium.executablePath()) && !FORCE) skip(`pinned Chromium ${pinned} is not installed (npx playwright-core install chromium)`);
  if (UPDATE && process.platform !== 'linux') {
    console.error('Refusing --update off Linux: baselines must come from the reference platform.');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const version = browser.version();
  if (pinned && buildOf(version) !== buildOf(pinned) && !FORCE) {
    await browser.close();
    skip(`Chromium ${version} is not the pinned build ${pinned}`);
  }
  return { browser, version };
}

export const FREEZE_CSS = `*, *::before, *::after { animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important; }
html, body { margin: 0; }`;

// ---------- browser ----------
/** `contextOptions` (e.g. hasTouch / isMobile / colorScheme) override the defaults. */
export async function newPage(browser, viewport, html, contextOptions = {}) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light',
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', ...contextOptions,
  });
  context.setDefaultTimeout(10_000); // a state that cannot be driven fails fast instead of hanging 30 s per step
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if ((url.pathname === '/td.css' || /^\/(src|test)\//.test(url.pathname)) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try {
        return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(join(ROOT, url.pathname)) });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    }
    return route.fulfill({ status: 404, body: '' }); // never reach the network
  });
  page.on('pageerror', (e) => notes.push(`page error (${viewport.width}): ${e.message.split('\n')[0]}`));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

/**
 * Pointer parked at (0, 0), fonts loaded, every VISIBLE <img> settled (a loading="lazy" image off-screen never loads — waiting for it would
 * hang), two frames. Capped at 5 s so a stuck image shows up as a pixel diff instead of hanging the run.
 */
export async function settle(page) {
  // park the pointer: no hover state from the last scripted click may be baked into a shot. (0, 0) is the dialog's
  // top-left padding corner — nothing hoverable there at any viewport.
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    const inView = (img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const images = Promise.all([...document.images].filter((img) => !img.complete && inView(img)).map((img) =>
      new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); })));
    await Promise.race([Promise.all([document.fonts.ready, images]), new Promise((r) => setTimeout(r, 5000))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(100);
}

export async function check(name, png) {
  const file = join(BASELINE_DIR, `${name}.png`);
  if (UPDATE) {
    await mkdir(BASELINE_DIR, { recursive: true });
    await writeFile(file, png);
    written++;
    return;
  }
  const saveActual = async () => {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, `${name}.png`), png);
  };
  if (!existsSync(file)) {
    missing.push(name);
    await saveActual();
    return;
  }
  compared++;
  const r = comparePng(decodePng(await readFile(file)), decodePng(png), CHANNEL_DELTA);
  if (r.sizeMismatch || r.ratio > MAX_DIFF_RATIO) {
    failures.push(`${name}: ${r.sizeMismatch ? 'size differs from baseline' : `${(r.ratio * 100).toFixed(2)}% pixels differ (${r.diff}/${r.total}) > ${MAX_DIFF_RATIO * 100}%`}`);
    await saveActual();
  }
}

/** Prints the result and exits (0 / 1) exactly as the pre-0.84 media-picker script did. */
export function finish(version) {
  for (const n of notes) console.log(`note: ${n}`);
  if (UPDATE) {
    if (failures.length) {
      console.error(`Visual baselines: ${written} written, ${failures.length} FAILED:\n  ${failures.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`Visual baselines: ${written} written to ${BASELINE_DIR} (Chromium ${version}).`);
    process.exit(0);
  }
  if (missing.length) {
    const msg = `${missing.length} shot(s) have no baseline (actual PNGs in ${OUT_DIR}): ${missing.join(', ')}`;
    failures.push(`${msg} — run the "update visual baselines" workflow (or --update in the Playwright image) and commit the PNGs`);
  }
  if (failures.length) {
    console.error(`Visual gate FAILED (${failures.length}); actual PNGs in ${OUT_DIR}:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Visual gate: ${compared} shot(s) match the baselines (Chromium ${version}, ΔRGB > ${CHANNEL_DELTA}, ≤ ${MAX_DIFF_RATIO * 100}% pixels).`);
}
