/**
 * Responsive gate (v0.34.0, ADR 0014, plan M6) — Chromium, WebKit, Firefox. Deterministic: geometry only, no pixel
 * diff (OS fonts differ). Screenshots of the 8 acceptance widths go to test/responsive/__out__/ (gitignored; CI
 * uploads them as an artifact) — they are for humans, never compared.
 *
 * Page: test/fixtures/responsive-page.js (+ .css) — every non-media component in the hard situations of the audit.
 * Per configuration:
 *   static   page has no horizontal scroll; nothing visible outside the viewport unless inside a kit scroll region;
 *            touch targets ≥ 44 (coarse) / ≥ 24 (mouse), measured with elementFromPoint probes; no overlapping text in
 *            tables / tabs / pagination; no truncated tab label; td-table mode matches its container (card < 720);
 *            card mode keeps table semantics (aria snapshot).
 *   overlays each popup / dialog fully inside the viewport with its close + main action visible; targets inside it.
 * Fallback  the same static checks with a td.css whose container queries never match and whose
 *            `@supports not (container-type)` fallbacks are forced on (simulates Chrome/Edge 102–104).
 *
 * M0 (after v0.33): media picker (always .td-modal--viewport: dialog = viewport at every size; inner layout switches
 * at 720 — toolbar wraps / detail is a sliding pane below it; short band keeps ≥ 1 row of cards visible), media grid
 * (default, sortable gallery, justified), dropzone, and the ordinary-modal sheet (< 720) vs centred (≥ 720) rule.
 *
 * Run: npm run test:responsive   (RSP_ENGINES=chromium,webkit RSP_ONLY=<config tag substring> for a subset)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { settle, analyze, panel, inViewport } from './probe.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'test', 'responsive', '__out__');
const ORIGIN = 'http://responsive.local';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };


/** Elements exempt from the touch-target rule (each with the reason). */
const ALLOW = [
  '.td-toast__close', // visually hidden until focused; the whole toast is the tap target (plan QĐ 5)
  '.td-sr-only, .td-sr-only *',
];

const W8 = [[360, 780], [393, 852], [430, 932], [768, 1024], [884, 1104], [1024, 768], [1280, 800], [1440, 900]];
const EXTRA = [[744, 1133], [700, 900], [600, 960], [844, 390], [932, 430]]; // 700: just under md (720)
const CONFIGS = [];
for (const [w, h] of W8) CONFIGS.push({ engine: 'chromium', w, h, touch: false, shots: true });
for (const [w, h] of W8.filter(([w]) => w <= 1024)) CONFIGS.push({ engine: 'chromium', w, h, touch: true, shots: true });
for (const [w, h] of EXTRA) CONFIGS.push({ engine: 'chromium', w, h, touch: true, shots: false });
for (const [w, h] of [[393, 852], [768, 1024], [884, 1104]]) CONFIGS.push({ engine: 'webkit', w, h, touch: true, shots: false });
CONFIGS.push({ engine: 'webkit', w: 1280, h: 800, touch: false, shots: false });
for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]]) CONFIGS.push({ engine: 'firefox', w, h, touch: false, shots: false });
for (const [w, h] of [[360, 780], [768, 1024], [1280, 800]]) CONFIGS.push({ engine: 'chromium', w, h, touch: false, shots: false, fallback: true });

const tagOf = (c) => `${c.engine}-${c.w}x${c.h}-${c.touch ? 'touch' : 'mouse'}${c.fallback ? '-fallback' : ''}`;

const SCENARIOS = [
  { name: 'dropdown', act: (p) => p.click('#g-dd .td-dropdown__trigger'), panel: '.td-dropdown__menu[data-state="open"]' },
  { name: 'datetime', act: (p) => p.click('#g-dtp .td-dtp__trigger'), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] },
  { name: 'tree-select', act: (p) => p.click('#g-ts .td-tree-select__trigger'), panel: '.td-tree-select__menu[data-state="open"]' },
  { name: 'multiselect', act: async (p) => { await p.click('#g-chips .td-chip-input__input'); await p.keyboard.press('ArrowDown'); }, panel: '.td-chip-input__menu[data-state="open"]' },
  { name: 'menu', act: (p) => p.click('#rsp-menu-btn button'), panel: '.td-menu' },
  { name: 'tooltip', act: (p, c) => (c.touch ? p.tap('#rsp-tooltip') : p.hover('#rsp-tooltip')), panel: '.td-tooltip' },
  { name: 'hovercard', mouseOnly: true, act: (p) => p.hover('#rsp-hovercard'), panel: '.td-hovercard' },
  { name: 'toast', act: (p) => p.evaluate(() => window.__openers.toast()), panel: '.td-toasts', see: ['.td-toast:last-child', '.td-toast:nth-last-child(2)'] },
  { name: 'modal-confirm', act: (p) => p.evaluate(() => window.__openers.modalConfirm()), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] },
  { name: 'modal-long', act: (p) => p.evaluate(() => window.__openers.modalLong()), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] },
  { name: 'drawer', act: (p) => p.evaluate(() => window.__openers.drawer()), panel: '.td-drawer__panel', see: ['.td-drawer__close', '.td-drawer__footer .td-btn'] },
  { name: 'lightbox', act: (p) => p.evaluate(() => window.__openers.lightbox()), panel: '.td-lightbox', see: ['.td-lightbox__close'] },
  { name: 'lightbox-panel', act: (p) => p.evaluate(() => window.__openers.lightboxPanel()), panel: '.td-lightbox', see: ['.td-lightbox__close'] },
  { name: 'loading', act: (p) => p.evaluate(() => window.__openers.loading()), panel: '.td-loading__card' },
  { name: 'media-picker', act: (p) => p.evaluate(() => { window.__openers.picker(); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__confirm'] },
  { name: 'media-picker-multiple', act: (p) => p.evaluate(() => { window.__openers.picker(true); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__confirm'] },
  { name: 'media-picker-pages', act: (p) => p.evaluate(() => { window.__openers.picker(false, true); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__pager td-pagination'] },
  { name: 'media-picker-upload', act: async (p) => { await p.evaluate(() => { window.__openers.picker(); }); await p.locator('.td-media-picker__card').first().waitFor(); await p.click('.td-media-picker__upload-btn'); }, panel: '.td-modal__dialog', see: ['.td-modal__dialog .td-modal__close'] },
];

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${ORIGIN}/td.css"><link rel="stylesheet" href="${ORIGIN}/test/fixtures/responsive-page.css">
<style>body{margin:0;background:var(--td-color-surface-muted)}</style>
<script type="module">
  import { mountResponsiveFixture } from '${ORIGIN}/test/fixtures/responsive-page.js';
  const { openers } = mountResponsiveFixture(document.getElementById('root'));
  window.__openers = openers;
  window.__ready = true;
</script></head><body><main id="root"></main></body></html>`;

const failures = [];
const notes = [];
let checks = 0;
const check = (tag, label, list) => {
  checks += 1;
  if (list.length) failures.push(`${tag} ${label}:\n    ${list.slice(0, 12).join('\n    ')}${list.length > 12 ? `\n    … +${list.length - 12}` : ''}`);
};

async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh', chromium: null }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

let tdCss = null;
let fallbackCss = null;
async function css(fallback) {
  if (!tdCss) {
    tdCss = await readFile(join(ROOT, 'td.css'), 'utf8');
    fallbackCss = tdCss
      .replace(/@container td-[a-z0-9-]+ \(width (?:<|>=) \d+px\)/g, '@container td-never-match (width < 0px)')
      .replace(/@supports not \(container-type: inline-size\)/g, '@supports (display: block)');
  }
  return fallback ? fallbackCss : tdCss;
}

async function newPage(browser, c) {
  const opts = { viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' };
  if (c.touch) { opts.hasTouch = true; if (c.engine !== 'firefox') opts.isMobile = true; }
  const context = await browser.newContext(opts);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: await css(c.fallback) });
    if (/^\/(src|test\/fixtures)\//.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try {
        return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(join(ROOT, url.pathname)) });
      } catch { /* 404 below */ }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  return { context, page, errors };
}

async function load(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(settle);
}

async function runConfig(browser, c) {
  const tag = tagOf(c);
  const { context, page, errors } = await newPage(browser, c);
  const shot = async (name) => {
    if (!c.shots) return '';
    const file = join(OUT, tag, `${name}.png`);
    await mkdir(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: name === 'page', animations: 'disabled' });
    return file;
  };
  try {
    await load(page);
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (c.touch && c.engine !== 'firefox' && !coarse) failures.push(`${tag}: touch emulation did not give pointer: coarse`);
    const st = await page.evaluate(analyze, { targets: true, coarse: c.touch, allow: ALLOW, overlaps: true });
    // The full-page screenshot is taken LAST: in Chromium it resets the device emulation (pointer: coarse is lost).
    const pageShot = c.shots ? join(OUT, tag, 'page.png') : '';
    const where = pageShot ? ` (screenshot ${pageShot})` : '';
    check(tag, `page horizontal scroll ${st.scrollWidth} > ${st.vw}${where}`, st.pageOverflow ? [`scrollWidth ${st.scrollWidth}`] : []);
    check(tag, `outside the viewport${where}`, st.outside);
    check(tag, `touch targets${where}`, st.targets);
    check(tag, `overlapping text${where}`, st.overlaps);
    check(tag, `truncated tab labels${where}`, st.truncatedTabs);
    // td-table: card when its container is < 720 (default card-below md); layout="table" never; card mode keeps roles
    const modes = await page.evaluate(() => ['rsp-table', 'rsp-table-scroll', 'rsp-table-narrow'].map((id) => {
      const host = document.getElementById(id);
      const tr = host.querySelector('tbody tr');
      return { id, width: host.clientWidth, layout: host.getAttribute('layout') || 'auto', display: tr ? getComputedStyle(tr).display : '' };
    }));
    const modeErr = [];
    for (const m of modes) {
      const wantCard = m.layout === 'cards' || (m.layout === 'auto' && (c.fallback ? c.w < 720 : m.width < 720));
      const isCard = m.display !== 'table-row';
      if (wantCard !== isCard) modeErr.push(`${m.id} (${m.layout}, host ${m.width}px): ${isCard ? 'card' : 'table'}, want ${wantCard ? 'card' : 'table'}`);
    }
    check(tag, 'td-table mode', modeErr);
    const snap = await page.locator('#rsp-table-narrow table').ariaSnapshot();
    check(tag, 'card-mode table semantics', ['- table', '- columnheader', '- row', '- cell'].filter((s) => !snap.includes(s)).map((s) => `aria snapshot lacks "${s}"`));
    if (errors.length) check(tag, 'page errors', errors);

    if (!c.fallback) await runOverlays(page, c, tag, shot);
    if (c.shots) {
      await load(page);
      await shot('page');
    }
  } finally {
    await context.close();
  }
}

async function runOverlays(page, c, tag, shot) {
  {
    for (const s of SCENARIOS) {
      if (s.mouseOnly && c.touch) continue;
      await load(page);
      try {
        await s.act(page, c);
      } catch (e) {
        check(tag, `${s.name}: could not open`, [String(e.message).split('\n')[0]]);
        continue;
      }
      try {
        await page.locator(s.panel).last().waitFor({ state: 'visible' });
      } catch {
        check(tag, `${s.name}: did not open`, [s.panel]);
        continue;
      }
      if (s.ready) await page.locator(s.ready).first().waitFor({ state: 'visible' });
      await page.evaluate(settle);
      const m = await page.evaluate(panel, s.panel);
      const vp = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
      if (s.picker) {
        // always full viewport (v0.33 decision 4); inner layout: toolbar wraps < 720 (ADR 0014), one row ≥ 720
        const near = (a, b) => Math.abs(a - b) <= 1;
        const err = [];
        if (!(near(m.left, 0) && near(m.top, 0) && near(m.width, vp.w) && near(m.height, vp.h))) err.push(`dialog ${Math.round(m.left)},${Math.round(m.top)} ${Math.round(m.width)}×${Math.round(m.height)} ≠ viewport ${vp.w}×${vp.h}`);
        const wrap = await page.evaluate(() => getComputedStyle(document.querySelector('.td-media-picker__toolbar')).flexWrap);
        if ((vp.w < 720) !== (wrap === 'wrap')) err.push(`toolbar flex-wrap ${wrap} at ${vp.w}px (wrap below 720)`);
        const gridH = await page.evaluate(() => {
          const g = document.querySelector('.td-media-picker__grid');
          const r = document.querySelector('.td-media-picker__results') || g;
          return Math.min(g.getBoundingClientRect().bottom, r.getBoundingClientRect().bottom, window.innerHeight)
            - Math.max(g.getBoundingClientRect().top, r.getBoundingClientRect().top, 0);
        });
        if (gridH < 112) err.push(`visible grid height ${Math.round(gridH)}px < 112 (one row of cards)`);
        check(tag, `${s.name}: viewport dialog + inner layout`, err);
      }
      if (s.name === 'modal-confirm' || s.name === 'modal-long') {
        // ordinary TdModal: bottom sheet below 720 (full width, glued to the bottom), centred dialog from 720
        const sheet = Math.abs(m.bottom - vp.h) <= 1 && Math.abs(m.width - vp.w) <= 1;
        if ((vp.w < 720) !== sheet) check(tag, `${s.name}: sheet below 720 / centred from 720`, [`${sheet ? 'sheet' : 'centred'} at ${vp.w}px`]);
        else checks += 1;
      }
      const f = await shot(`ov-${s.name}`);
      const w = f ? ` (screenshot ${f})` : '';
      check(tag, `${s.name}: inside the viewport${w}`, await page.evaluate(inViewport, [s.panel, ...(s.see || [])]));
      check(tag, `${s.name}: page horizontal scroll${w}`, (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) ? ['scrollWidth > clientWidth'] : []);
      let a = await page.evaluate(analyze, { root: s.panel, targets: true, coarse: c.touch, allow: ALLOW });
      if (a.targets.length) {
        // a late layout change (image decode, list re-render under load) can land between settle and the probes:
        // settle again on real signals and measure once more — a real defect fails both times
        await page.evaluate(settle);
        a = await page.evaluate(analyze, { root: s.panel, targets: true, coarse: c.touch, allow: ALLOW });
      }
      check(tag, `${s.name}: touch targets${w}`, a.targets);
      if (!m.found) check(tag, `${s.name}: panel`, ['not found']);
    }
  }
}

async function runEngine(name, launcher, configs) {
  if (!configs.length) return;
  const browser = await launcher.launch(await launchOptions(name, launcher));
  try {
    // two pages at a time per engine: deterministic (separate contexts), roughly halves the wall time
    const queue = [...configs];
    const worker = async () => { for (let c = queue.shift(); c; c = queue.shift()) await runConfig(browser, c); };
    await Promise.all([worker(), worker()]);
  } finally {
    await browser.close();
  }
}

const only = process.env.RSP_ONLY;
const engines = (process.env.RSP_ENGINES || 'chromium,webkit,firefox').split(',');
const selected = CONFIGS.filter((c) => engines.includes(c.engine) && (!only || tagOf(c).includes(only)));
await rm(OUT, { recursive: true, force: true });
const t0 = Date.now();
await Promise.all([
  runEngine('chromium', chromium, selected.filter((c) => c.engine === 'chromium')),
  runEngine('webkit', webkit, selected.filter((c) => c.engine === 'webkit')),
  runEngine('firefox', firefox, selected.filter((c) => c.engine === 'firefox')),
]);
for (const n of notes) console.log(`note: ${n}`);
console.log(`responsive gate: ${selected.length} configurations, ${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('responsive gate: OK');
