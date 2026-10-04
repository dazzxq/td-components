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
 * v0.35.0: td-cropper inline (full width + 280 px column: no overflow, corners / focal / toolbar ≥ 44 coarse incl. corners on
 * the image edge), the crop dialog and the picker crop step (inside the viewport, confirm + back visible, stage ≥ 200 px).
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
import { hoverIntent } from './hover-intent.mjs';

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
  { name: 'tooltip', act: (p, c) => (c.touch ? p.tap('#rsp-tooltip') : hoverIntent(p, '#rsp-tooltip', '.td-tooltip', notes)), panel: '.td-tooltip' },
  { name: 'hovercard', mouseOnly: true, act: (p) => hoverIntent(p, '#rsp-hovercard', '.td-hovercard[data-state="open"]', notes), panel: '.td-hovercard' },
  // v0.36.0 (ADR 0016): the stacks live in lanes (display: contents < 480) and the newest is first in a top stack; in a
  // short viewport only the two newest (globally) show — measure the displayed toasts, not stack children.
  { name: 'toast', act: (p) => p.evaluate(() => window.__openers.toast()), panel: '.td-toast:not([data-td-toast-older])', see: ['.td-toast:not([data-td-toast-older])'] },
  // v0.36.0: six placements — < 480 every top-* toast is in ONE full-width lane column (same left / right), ≥ 480 each
  // placement is its own stack; all inside the viewport. (Same module URL as the fixture's import → same TdToast.)
  { name: 'toast-lanes', act: (p) => p.evaluate(async () => {
    const { TdToast } = await import('/src/feedback/td-toast.js');
    for (const placement of ['top-start', 'top-center', 'top-end', 'bottom-start']) TdToast.info(`Thông báo ${placement}`, { placement, duration: 0 });
  }), panel: '.td-toast:not([data-td-toast-older])', toastLanes: true, see: ['.td-toast:not([data-td-toast-older])'] },
  { name: 'modal-confirm', act: (p) => p.evaluate(() => window.__openers.modalConfirm()), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] },
  { name: 'modal-long', act: (p) => p.evaluate(() => window.__openers.modalLong()), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] },
  { name: 'drawer', act: (p) => p.evaluate(() => window.__openers.drawer()), panel: '.td-drawer__panel', see: ['.td-drawer__close', '.td-drawer__footer .td-btn'] },
  { name: 'lightbox', act: (p) => p.evaluate(() => window.__openers.lightbox()), panel: '.td-lightbox', see: ['.td-lightbox__close'] },
  { name: 'lightbox-panel', act: (p) => p.evaluate(() => window.__openers.lightboxPanel()), panel: '.td-lightbox', see: ['.td-lightbox__close'] },
  { name: 'loading', act: (p) => p.evaluate(() => window.__openers.loading()), panel: '.td-loading__card' },
  { name: 'media-picker', act: (p) => p.evaluate(() => { window.__openers.picker(); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__confirm'] },
  { name: 'media-picker-multiple', act: (p) => p.evaluate(() => { window.__openers.picker(true); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__confirm'] },
  { name: 'media-picker-pages', act: (p) => p.evaluate(() => { window.__openers.picker(false, true); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, see: ['.td-media-picker .td-modal__close', '.td-media-picker__pager td-pagination'] },
  // v0.35.0: the crop dialog (overlay ⇒ @media: box from 720, full viewport below, short band) and the picker crop step
  { name: 'crop-dialog', act: (p) => p.evaluate(() => { window.__openers.cropDialog(); }), panel: '.td-crop-dialog .td-modal__dialog', ready: '.td-crop-dialog td-cropper[data-state="ready"]', crop: true, see: ['.td-crop-dialog__confirm', '.td-crop-dialog__cancel'] },
  { name: 'picker-crop', act: async (p) => { await p.evaluate(() => { window.__openers.pickerCrop(); }); await p.locator('.td-media-picker__card').first().click(); await p.click('.td-media-picker__confirm'); }, panel: '.td-crop-dialog .td-modal__dialog', ready: '.td-crop-dialog td-cropper[data-state="ready"]', crop: true, see: ['.td-crop-dialog__confirm', '.td-crop-dialog__cancel'] },
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
  // park the pointer at (0, 0): a pointer left over a card by the previous scenario (tooltip / hovercard hover) can
  // raise a hover tooltip over the targets being probed — same rule as the v0.33 visual gate
  await page.mouse.move(0, 0);
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
    // v0.36.0 (plan QĐ 13): td-action-button — coarse = a REAL 44 × 44 box (no ::before extension), mouse = 32 / 36 / 40;
    // inside .td-action-group no two targets overlap and (coarse) they are ≥ 8 px apart.
    const ab = await page.evaluate(() => [...document.querySelectorAll('#rsp-action-group .td-btn--action')].map((b) => {
      const r = b.getBoundingClientRect();
      const before = getComputedStyle(b, '::before').content;
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, before };
    }));
    const abErr = [];
    if (ab.length !== 6) abErr.push(`expected 6 action buttons, got ${ab.length}`);
    ab.forEach((x, i) => {
      if (c.touch && (x.w < 44 - 0.5 || x.h < 44 - 0.5)) abErr.push(`#${i} ${x.w}×${x.h} < 44 × 44 (coarse)`);
      if (!c.touch && (x.w < 32 - 0.5 || x.w > 40 + 0.5)) abErr.push(`#${i} ${x.w}px outside 32–40 (mouse)`);
      if (x.before && x.before !== 'none' && x.before !== 'normal') abErr.push(`#${i} has a ::before hit area (${x.before})`);
      for (const y of ab.slice(i + 1)) {
        const dx = Math.max(y.l - x.r, x.l - y.r);
        const dy = Math.max(y.t - x.b, x.t - y.b);
        if (dx < 0 && dy < 0) abErr.push(`#${i} overlaps another action button`);
        else if (c.touch && dy < 0 && dx < 8 - 0.5) abErr.push(`#${i} only ${dx.toFixed(1)}px from its neighbour (coarse ≥ 8)`);
      }
    });
    check(tag, 'td-action-button targets', abErr);
    check(tag, 'card-mode table semantics', ['- table', '- columnheader', '- row', '- cell'].filter((s) => !snap.includes(s)).map((s) => `aria snapshot lacks "${s}"`));
    // v0.36.0 (plan QĐ 41): td-otp-input cells keep their shape — in columns of 320 / 360 / 390 / 240 px (and the page
    // width when narrower), 6 / 8 / 10 digits and 5 alphanumerics: each cell width / height = 44 / 52 ± 4 % (except a
    // touch cell narrower than 37 px, which grows to the 44 px touch minimum), nothing wider than its column.
    const otpErr = await page.evaluate(async () => {
      const errs = [];
      const coarse = matchMedia('(pointer: coarse)').matches;
      const vw = document.documentElement.clientWidth;
      const host = document.createElement('div');
      document.body.appendChild(host);
      for (const w of [320, 360, 390, 240]) {
        const col = document.createElement('div');
        col.style.setProperty('width', `${Math.min(w, vw)}px`);
        col.innerHTML = ['', 'length="8"', 'length="10"', 'length="5" charset="alphanumeric"']
          .map((a) => `<td-otp-input label="Mã" ${a}></td-otp-input>`).join('');
        host.appendChild(col);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const col of host.children) {
        const cr = col.getBoundingClientRect();
        for (const el of col.querySelectorAll('td-otp-input')) {
          const tagName = `${Math.round(cr.width)}px ${el.getAttribute('length') || 6}${el.getAttribute('charset') ? ' alnum' : ''}`;
          const box = el.querySelector('.td-otp__box').getBoundingClientRect();
          if (box.right > cr.right + 0.5 || box.left < cr.left - 0.5) errs.push(`${tagName}: box ${Math.round(box.width)} wider than column`);
          for (const c of el.querySelectorAll('.td-otp__cell')) {
            const r = c.getBoundingClientRect();
            if (coarse && r.width < 37) { if (r.height < 43.5) errs.push(`${tagName}: touch cell ${r.height.toFixed(1)} < 44`); continue; }
            if (Math.abs((r.width / r.height) / (44 / 52) - 1) > 0.04) { errs.push(`${tagName}: cell ${r.width.toFixed(1)}×${r.height.toFixed(1)}`); break; }
          }
        }
      }
      host.remove();
      return errs;
    });
    check(tag, 'otp cell shape (v0.36.0)', otpErr);
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
        // v0.36.0 (plan QĐ 49–52, 55): the toolbar is ONE row at every width; below 720 the chrome has a height budget
        const chrome = await page.evaluate(() => {
          const h = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().height : 0; };
          return { wrap: getComputedStyle(document.querySelector('.td-media-picker__toolbar')).flexWrap,
            header: h('.td-media-picker .td-modal__header'), toolbar: h('.td-media-picker__toolbar'), footer: h('.td-media-picker__footer') };
        });
        if (chrome.wrap === 'wrap') err.push(`toolbar wraps at ${vp.w}px (one row since v0.36)`);
        if (vp.w < 720 && vp.h > 500) {
          if (chrome.header > 56.5) err.push(`header ${Math.round(chrome.header)}px > 56 (QĐ 60)`);
          if (chrome.toolbar > 56.5) err.push(`toolbar ${Math.round(chrome.toolbar)}px > 56 (QĐ 52)`);
          if (chrome.footer > 64.5) err.push(`footer ${Math.round(chrome.footer)}px > 64 (QĐ 55)`);
        }
        const gridH = await page.evaluate(() => {
          const g = document.querySelector('.td-media-picker__grid');
          const r = document.querySelector('.td-media-picker__results') || g;
          return Math.min(g.getBoundingClientRect().bottom, r.getBoundingClientRect().bottom, window.innerHeight)
            - Math.max(g.getBoundingClientRect().top, r.getBoundingClientRect().top, 0);
        });
        if (gridH < 112) err.push(`visible grid height ${Math.round(gridH)}px < 112 (one row of cards)`);
        check(tag, `${s.name}: viewport dialog + inner layout`, err);
      }
      if (s.crop) {
        // v0.35.0 (plan decision 21): the crop stage keeps ≥ 200 px of height, even in the short band (≤ 500 tall)
        const stageH = await page.evaluate(() => {
          const st = [...document.querySelectorAll('.td-crop-dialog .td-cropper__stage')].pop();
          return st ? st.getBoundingClientRect().height : 0;
        });
        check(tag, `${s.name}: crop stage height`, stageH >= 200 ? [] : [`stage ${Math.round(stageH)}px < 200`]);
      }
      if (s.toastLanes) {
        await page.waitForFunction(() => document.querySelectorAll('.td-toast[data-state="open"]').length === 4);
        await page.evaluate(settle);
        const lane = await page.evaluate(() => [...document.querySelectorAll('.td-toast-lane[data-edge="top"] .td-toast')]
          .filter((t) => getComputedStyle(t).display !== 'none').map((t) => { const r = t.getBoundingClientRect(); return [r.left, r.right]; }));
        const err = [];
        if (vp.w < 480) {
          const [l0, r0] = lane[0] || [0, 0];
          if (lane.some(([l, r]) => Math.abs(l - l0) > 1 || Math.abs(r - r0) > 1)) err.push(`top lane not one column: ${JSON.stringify(lane)}`);
          if (r0 - l0 < vp.w * 0.8) err.push(`top lane width ${Math.round(r0 - l0)} < 80 % of ${vp.w}`);
        }
        check(tag, `${s.name}: xs lane column`, err);
      }
      if (s.name === 'modal-confirm' || s.name === 'modal-long') {
        // ordinary TdModal: bottom sheet below 720 (full width, glued to the bottom), centred dialog from 720
        const sheet = Math.abs(m.bottom - vp.h) <= 1 && Math.abs(m.width - vp.w) <= 1;
        if ((vp.w < 720) !== sheet) check(tag, `${s.name}: sheet below 720 / centred from 720`, [`${sheet ? 'sheet' : 'centred'} at ${vp.w}px`]);
        else checks += 1;
      }
      if (s.name === 'modal-confirm' && vp.w < 720 && vp.h > 500) {
        // v0.36.0 (plan QĐ 60): compact chrome below 720 — header ≤ 56, footer ≤ 64
        const hf = await page.evaluate(() => {
          const d = [...document.querySelectorAll('.td-modal__dialog')].pop();
          return { h: d.querySelector('.td-modal__header')?.getBoundingClientRect().height || 0, f: d.querySelector('.td-modal__footer')?.getBoundingClientRect().height || 0 };
        });
        const err = [];
        if (hf.h > 56.5) err.push(`header ${Math.round(hf.h)} > 56`);
        if (hf.f > 64.5) err.push(`footer ${Math.round(hf.f)} > 64`);
        check(tag, `${s.name}: compact chrome budget`, err);
      }
      if (s.name === 'datetime' && vp.w < 720 && vp.h > 500) {
        // v0.36.0 (plan QĐ 61): the datetime sheet takes ≤ 70 % of the viewport height
        check(tag, `${s.name}: sheet height budget`, m.height <= vp.h * 0.7 + 0.5 ? [] : [`sheet ${Math.round(m.height)} > 70 % of ${vp.h}`]);
      }
      if (s.name === 'lightbox-panel') {
        // v0.36.0 (plan QĐ 59): the counter / back area never under the toolbar
        const hit = await page.evaluate(() => {
          const a = document.querySelector('.td-lightbox__lead');
          const b = document.querySelector('.td-lightbox__toolbar');
          if (!a || !b) return null;
          const r1 = a.getBoundingClientRect();
          const r2 = b.getBoundingClientRect();
          const x = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
          const y = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
          return x > 0.5 && y > 0.5 ? `${Math.round(x)}×${Math.round(y)}` : '';
        });
        check(tag, `${s.name}: lead and toolbar do not overlap`, hit ? [`overlap ${hit}`] : []);
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

/**
 * Self-test of the hover helper (CI run 37201806355 regression): inject the layout shift that cancels the hover
 * intent (content inserted above the trigger right after the hover). A plain hover must NOT open (proves the
 * reproduction); hoverIntent must still open it (it re-aims once after a displacement).
 */
async function hoverSelfTest(browser, engine) {
  const c = { engine, w: 360, h: 780, touch: false };
  const { context, page } = await newPage(browser, c);
  const shiftOnHover = () => page.evaluate(() => {
    // shift 50 ms into the 350 ms intent (as late content / a font swap would), by 120px
    document.getElementById('rsp-hovercard').addEventListener('pointerover', () => {
      setTimeout(() => {
        const d = document.createElement('div');
        d.style.setProperty('height', '120px');
        document.getElementById('root').prepend(d);
      }, 50);
    }, { once: true });
  });
  try {
    await load(page);
    await shiftOnHover();
    await page.hover('#rsp-hovercard');
    const plain = await page.locator('.td-hovercard[data-state="open"]').waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false);
    // whether the engine cancels a plain hover depends on when it dispatches its synthetic boundary events after a
    // layout change (Firefox / WebKit: yes at 50 ms; Chromium: on its own timer) — informational, not asserted
    notes.push(`${engine} hover self-test: plain hover with a layout shift during the intent ${plain ? 'still opened' : 'was cancelled (CI flake reproduced)'}`);
    await load(page);
    await shiftOnHover();
    const own = [];
    await hoverIntent(page, '#rsp-hovercard', '.td-hovercard[data-state="open"]', own);
    const ok = await page.locator('.td-hovercard[data-state="open"]').isVisible();
    check(`${engine} hover self-test`, 'hoverIntent re-aims after the shift and opens', ok ? [] : ['did not open']);
    if (!plain) check(`${engine} hover self-test`, 'hoverIntent noticed the displacement and re-aimed', own.length ? [] : ['no re-aim note']);
  } finally {
    await context.close();
  }
}

async function runEngine(name, launcher, configs) {
  if (!configs.length) return;
  const browser = await launcher.launch(await launchOptions(name, launcher));
  try {
    if (!only) await hoverSelfTest(browser, name);
    // Two pages at a time in Chromium / WebKit (separate contexts) roughly halves the wall time. Firefox runs its pages
    // ONE AT A TIME: its pointer is shared by every page of a browser instance (Juggler), so a mouse move / hover in a
    // second page sends pointerout to the first and cancels its hover intent — CI 37201806355 + 37205524647
    // (firefox-360 hovercard / tooltip "did not open"), reproduced 4/4 in mcr.microsoft.com/playwright:v1.60.0-jammy
    // with all three Firefox configs; same engine quirk as the per-file pointer groups of web-test-runner.config.js.
    const queue = [...configs];
    const worker = async () => { for (let c = queue.shift(); c; c = queue.shift()) await runConfig(browser, c); };
    await Promise.all(name === 'firefox' ? [worker()] : [worker(), worker()]);
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
