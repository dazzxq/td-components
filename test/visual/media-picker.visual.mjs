#!/usr/bin/env node
/**
 * Visual gate — td-media-picker + td-media-grid justified (v0.33.0, plan docs/internal/plans/
 * v0.33.0-media-picker-dcms-parity.md "Ảnh chụp / so sánh trực quan").
 *
 * Chromium only. Screenshots the picker (driven through its PUBLIC API: TdMediaPicker.open + the mock adapter of
 * test/fixtures/media-adapter.js, no network) at 1440×900 and 390×844 in 6 states — open, selected, multiple, upload
 * dialog, URL error, delete blocked — plus a justified td-media-grid at 1280 and 390 wide (14 images), and compares each
 * with test/visual/baseline/linux-chromium/<name>.png: a pixel differs when any RGB channel differs by > 16; a shot
 * fails when > 0.5% of its pixels differ (or its size differs). Motion off: `reducedMotion: 'reduce'`, animations /
 * transitions disabled, `caret-color: transparent`.
 *
 * ONE reference platform: the official image mcr.microsoft.com/playwright:v<playwright-core version>-jammy (its fonts
 * + the Chromium build pinned by playwright-core) — CI job `visual` of .github/workflows/test.yml runs in it. Fonts
 * render differently on macOS, so anywhere else (other OS, other Chromium build) the script prints a skip message and
 * exits 0 (1 with TD_VISUAL_STRICT=1 or --update) — it never compares there. Not part of `npm test`.
 *
 *   npm run test:visual                    compare (CI: job `visual`, Playwright image)
 *   npm run test:visual -- --update        (re)write the baselines — Linux only: run the "update visual baselines"
 *                                          workflow (workflow_dispatch) and commit the artifact, or run inside
 *                                          mcr.microsoft.com/playwright:v<playwright-core version>-jammy
 *   TD_VISUAL_FORCE=1                      run even off the reference platform (debugging only; never commit those PNGs)
 *   TD_VISUAL_OUT=<dir>                    where actual PNGs of failing / unbaselined shots go (default: <tmp>/td-visual)
 *
 * A shot with no baseline fails the compare run (its actual PNG is saved to TD_VISUAL_OUT). TD_VISUAL_STRICT=1 (set in
 * CI) additionally turns a SKIP into a failure, so the gate can never silently pass off the reference platform; `--update`
 * always fails instead of skipping. The pinned build is matched on major.minor.build: Playwright's arm64 Linux builds
 * report the same build with patch 0 (e.g. 148.0.7778.0 vs browsers.json 148.0.7778.96); the revision itself is
 * enforced by chromium.executablePath() (revision-specific path) existing.
 * The v0.33.0 baselines were captured in the linux/arm64 variant of mcr.microsoft.com/playwright:v1.60.0-jammy (Apple
 * Silicon host: the amd64 image under QEMU crashes Chromium); CI runs the amd64 variant. If the `visual` job reports
 * diffs that are pure rasterisation noise, regenerate with the "update visual baselines" workflow (amd64) and commit.
 * No dependencies: PNGs are decoded with node:zlib (test/visual/png.mjs).
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, comparePng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_DIR = join(ROOT, 'test', 'visual', 'baseline', 'linux-chromium');
const OUT_DIR = process.env.TD_VISUAL_OUT || join(tmpdir(), 'td-visual');
const ORIGIN = 'http://td-visual.test';
const UPDATE = process.argv.includes('--update');
const STRICT = process.env.TD_VISUAL_STRICT === '1';
const CHANNEL_DELTA = 16; // ΔRGB per channel above which a pixel counts as different
const MAX_DIFF_RATIO = 0.005; // ≤ 0.5% differing pixels per shot
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

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

function skip(reason) {
  const fatal = UPDATE || STRICT;
  (fatal ? console.error : console.log)(`Visual gate ${fatal ? 'FAILED (cannot run)' : 'SKIPPED'}: ${reason}`);
  console.log('Baselines are Linux + pinned Chromium only (mcr.microsoft.com/playwright:v<playwright-core>-jammy, CI job `visual`). See test/visual/media-picker.visual.mjs.');
  process.exit(fatal ? 1 : 0);
}
/** "148.0.7778.96" → "148.0.7778" */
const buildOf = (v) => String(v).split('.').slice(0, 3).join('.');

const FORCE = process.env.TD_VISUAL_FORCE === '1';
if (process.platform !== 'linux' && !FORCE) skip(`platform is ${process.platform}, not linux`);
const pinned = await pinnedChromiumVersion();
if (!pinned && !FORCE) skip('cannot read the Chromium version pinned by playwright-core (node_modules/playwright-core/browsers.json)');
if (!existsSync(chromium.executablePath()) && !FORCE) skip(`pinned Chromium ${pinned} is not installed (npx playwright-core install chromium)`);
if (UPDATE && process.platform !== 'linux') {
  console.error('Refusing --update off Linux: baselines must come from the reference platform.');
  process.exit(1);
}

// ---------- pages ----------
const FREEZE_CSS = `*, *::before, *::after { animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important; }
html, body { margin: 0; }`;

const PICKER_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS}</style>
<script type="module">
  import { TdMediaPicker } from '${ORIGIN}/src/feedback/td-media-picker.js';
  import { createMockAdapter } from '${ORIGIN}/test/fixtures/media-adapter.js';
  window.TdMediaPicker = TdMediaPicker;
  window.createMockAdapter = createMockAdapter;
  window.__ready = true;
</script>
</head><body><main></main></body></html>`;

// Justified grid: 24 items with mixed aspect ratios declared up front (data-td-ar), so the first pack is final and
// nothing depends on the SVG fixtures' intrinsic sizes.
const RATIOS = ['3/2', '2/3', '1', '3/1', '4/3', '3/4', '16/9', '1', '2/3', '3/2', '5/4', '9/16',
  '3/2', '1', '2/1', '2/3', '4/3', '3/2', '1/2', '16/9', '1', '3/2', '2/3', '4/3'];
const GRID_ITEMS = RATIOS.map((ar, i) => `<div data-td-media-item data-id="g${i + 1}" data-td-ar="${ar}">`
  + `<button type="button" data-td-media-open aria-label="Ảnh ${i + 1}">`
  + `<img src="${ORIGIN}/test/fixtures/${(i % 4) + 1}.svg" alt=""></button></div>`).join('');
const GRID_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS} main { padding: 16px; }</style>
<script type="module">
  await import('${ORIGIN}/src/display/td-media-grid.js');
  window.__ready = true;
</script>
</head><body><main><td-media-grid layout="justified" label="Ảnh">${GRID_ITEMS}</td-media-grid></main></body></html>`;

// ---------- browser ----------
async function newPage(browser, viewport, html) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light',
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
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
 * Fonts loaded, every VISIBLE <img> settled (a loading="lazy" image off-screen never loads — waiting for it would
 * hang), two frames. Capped at 5 s so a stuck image shows up as a pixel diff instead of hanging the run.
 */
async function settle(page) {
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

// =====================================================================================================================
// STATE DRIVERS — the only block that knows the picker's UI. The picker UI is v0.33 work in progress: when a label or
// selector changes, adjust it HERE (public API + roles / accessible names + the stable markup contract of
// td-media-grid: [data-td-media-item] / [data-td-media-open] / .td-media-grid__tick).
// =====================================================================================================================
const PICKER = 'body > .td-media-picker:not([data-state="closing"])';
const LABEL = {
  remove: 'Xoá', // the confirm dialog's button
};
const SEL = {
  uploadBtn: '.td-media-picker__upload-btn', // toolbar "Tải lên" (icon-only + aria-label under 768px)
  uploadDialog: 'body > .td-media-picker-upload:not([data-state="closing"])',
  urlTab: '.td-media-picker-upload .td-tabs__tab[data-tab-id="url"]', // tabs only exist when both sources are available
  urlInput: '.td-media-picker-upload__url input',
  deleteBtn: '.td-media-picker__delete', // detail action row; only rendered with capabilities.delete (opt-in)
  blocked: '.td-media-picker__blocked',
};
// Mock adapter: newest first (page 1 = m60 … m31); delete(id) → blocked when the numeric id % 7 === 3. m59 is an image
// on page 1.
const BLOCKED_ID = 'm59';

async function openPicker(page, selection = { mode: 'single' }, capabilities = undefined) {
  await page.evaluate(({ sel, caps }) => {
    window.__adapter = window.createMockAdapter();
    const opts = { adapter: window.__adapter, selection: sel };
    if (caps) opts.capabilities = caps;
    window.__outcome = window.TdMediaPicker.open(opts);
  }, { sel: selection, caps: capabilities });
  await page.locator(`${PICKER} [data-td-media-item]`).first().waitFor({ state: 'visible' });
}
const card = (page, id) => page.locator(`${PICKER} [data-td-media-item][data-id="${id}"]`);
const nthCard = (page, n) => page.locator(`${PICKER} [data-td-media-item]`).nth(n);
const picker = (page) => page.locator(PICKER);

/** The topmost dialog other than the picker (upload dialog, confirm). */
const topDialog = (page) => page.locator('body > .td-modal:not(.td-media-picker):not([data-state="closing"])').last();

async function openUploadDialog(page) {
  await picker(page).locator(SEL.uploadBtn).first().click();
  await page.locator(SEL.uploadDialog).waitFor({ state: 'visible' });
}

const STATES = {
  async open(page) {
    await openPicker(page);
  },
  async selected(page) {
    await openPicker(page);
    await nthCard(page, 1).locator('[data-td-media-open]').click();
  },
  async multiple(page) {
    await openPicker(page, { mode: 'multiple', maxItems: 10 });
    for (const n of [0, 1, 5]) await nthCard(page, n).locator('.td-media-grid__tick').click();
    // view one of them — wide only: under 768px the detail pane slides over the list and would hide the ticks
    if ((page.viewportSize()?.width ?? 0) >= 768) await nthCard(page, 5).locator('[data-td-media-open]').click();
    else {
      // ticking the 6th card scrolled the list: back to the top so all three checked cards are in the shot
      await nthCard(page, 0).evaluate((el) => {
        for (let n = el.parentElement; n; n = n.parentElement) if (n.scrollTop) n.scrollTop = 0;
      });
    }
  },
  async upload(page) {
    await openPicker(page);
    await openUploadDialog(page);
  },
  async 'url-error'(page) {
    await openPicker(page);
    await openUploadDialog(page);
    const dlg = page.locator(SEL.uploadDialog);
    await page.locator(SEL.urlTab).click(); // page-level: the selectors already name the dialog's root class
    const input = page.locator(SEL.urlInput);
    await input.fill('anh-khong-co-giao-thuc.jpg'); // new URL() throws → 'invalid' (ftp: would be 'scheme')
    await input.blur(); // validation error shows on blur, not while typing
    await dlg.getByText('URL không hợp lệ').first().waitFor({ state: 'visible' });
  },
  async 'delete-blocked'(page) {
    await openPicker(page, { mode: 'single' }, { delete: true }); // delete is opt-in (default false)
    await card(page, BLOCKED_ID).locator('[data-td-media-open]').click();
    await picker(page).locator(SEL.deleteBtn).click();
    await topDialog(page).getByRole('button', { name: LABEL.remove, exact: true }).click();
    await picker(page).locator(SEL.blocked).waitFor({ state: 'visible' });
    // the confirm dialog fully gone (closing ones included) before the shot
    await page.waitForFunction(() => !document.querySelector('body > .td-modal:not(.td-media-picker)'));
    // the alert + its usage list sit below the fold of the detail pane: scroll it fully into view (instant, no motion)
    await picker(page).locator(SEL.blocked).evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
  },
};
// ============================================ end of state drivers ===================================================

const PICKER_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const GRID_VIEWPORTS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];

const failures = [];
const notes = [];
const missing = [];
let compared = 0;
let written = 0;

async function check(name, png) {
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

const browser = await chromium.launch();
const version = browser.version();
if (pinned && buildOf(version) !== buildOf(pinned) && !FORCE) {
  await browser.close();
  skip(`Chromium ${version} is not the pinned build ${pinned}`);
}
try {
  for (const vp of PICKER_VIEWPORTS) {
    for (const [state, drive] of Object.entries(STATES)) {
      const name = `picker-${state}-${vp.width}x${vp.height}`;
      const { page, context } = await newPage(browser, vp, PICKER_PAGE);
      try {
        await drive(page);
        await settle(page);
        await check(name, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
      } catch (e) {
        failures.push(`${name}: could not drive the state — ${e.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  }
  for (const vp of GRID_VIEWPORTS) {
    const name = `grid-justified-${vp.width}`;
    const { page, context } = await newPage(browser, vp, GRID_PAGE);
    try {
      await page.locator('td-media-grid [data-td-media-item]').first().waitFor({ state: 'visible' });
      await settle(page);
      await check(name, await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
    } catch (e) {
      failures.push(`${name}: could not render — ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

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
