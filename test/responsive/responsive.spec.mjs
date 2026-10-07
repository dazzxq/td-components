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
 * v0.46.0: the td-diff section (inline under 480px of host / table above; view="table" scrolls inside its box; every
 *   row inside the section; <summary> ≥ 44 coarse / ≥ 24 mouse) — plus every generic check.
 * v0.39.0: the filter bar section (td-filter-chips one line per chip / one scrolling row < 480; the hidden column of a
 *   `column-menu` table out of the aria snapshot) — plus every generic check (overflow, 44px targets, overlaps).
 * v0.35.0: td-cropper inline (full width + 280 px column: no overflow, corners / focal / toolbar ≥ 44 coarse incl. corners on
 * the image edge), the crop dialog and the picker crop step (inside the viewport, confirm + back visible, stage ≥ 200 px).
 *
 * v0.36.1: td-table card density budgets (#rsp-table-density 5 short columns, #rsp-table 9 columns) at 360 / 393 / 768.
 *
 * v0.38.0: td-scan-input (single + multiple 30 rows + the 280 px column): no overflow, indicator never over the input
 * (below it under 480), list rows inside the host, speaker / Bỏ / Xoá tất cả ≥ 44 coarse (generic target probe).
 *
 * v0.40.0: td-datetime-range — dialog (sheet < 720: the "Từ | Đến" switch shows ONE side; ≥ 720 two sides side by
 * side; presets never wider than the dialog, one scrolling row < 480 / short), "Chọn" in the viewport (incl. 844×390);
 * the 160 px host never overflows and its cut trigger text carries a title.
 *
 * v0.47.0: td-check-matrix (12 roles × 40 permissions, max-height 24rem): no page overflow (the grid scrolls inside its
 * box), cells / bulk cells / group buttons / column picker ≥ 44 coarse; < 720 the one-column mode (generic checks).
 * v0.50.0: td-carousel + td-rating — the `carousel` section of the page (controls inside the section, no overlap, ratings
 *   on one line) and, on their own pages, the PHP markup of test/ssr/fixtures/carousel.html (3 / 8 / 12 / 13 pages,
 *   per-view attribute) BEFORE → AFTER the module loads (C21): CLS 0 (controls + host heights equal; Chromium:
 *   layout-shift entries), narrow (< 480) row 1 = [‹ k / P ›] with ≥ 44 coarse buttons, dot rows 1 / 2 / 2 / 0, every dot a
 *   ≥ 44 × 44 coarse hit area that never overlaps another dot / a button and selects its page; wide: ≤ 8 pages inline
 *   (no counter), 12 → 2 rows (8 + 4); a predicted ≠ measured case (per-view-md token) is recorded as a note.
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
  // v0.45.0: links INSIDE a line of text (timeline title / actor) — the WCAG 2.5.8 "inline" exception (pressed colour kept)
  'a.td-timeline__title, a.td-timeline__actor',
  '.td-color-panel__thumb', // v0.48.0: the focus point of the 2-D area — the whole area (≥ 112 px high) is the touch target
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
  { name: 'datetime-range', act: (p) => p.click('#g-dtr .td-dtr__trigger'), panel: '.td-modal__dialog', see: ['.td-modal__close', '.td-modal__footer .td-btn:last-child'] }, // v0.40.0
  { name: 'color-picker', act: (p) => p.click('#g-color .td-color__trigger'), panel: '.td-color-panel' }, // v0.48.0
  { name: 'tree-select', act: (p) => p.click('#g-ts .td-tree-select__trigger'), panel: '.td-tree-select__menu[data-state="open"]' },
  { name: 'multiselect', act: async (p) => { await p.click('#g-chips .td-chip-input__input'); await p.keyboard.press('ArrowDown'); }, panel: '.td-chip-input__menu[data-state="open"]' },
  { name: 'menu', act: (p) => p.click('#rsp-menu-btn button'), panel: '.td-menu' },
  // v0.53.0: the menu panel (static header, segmented theme row, td-input-field row)
  { name: 'menu-panel', act: (p) => p.click('#rsp-menu-panel button'), panel: '.td-menu--panel' },
  // v0.36.2 (ADR 0019): a tap never opens the tooltip — on touch configs it opens from KEYBOARD focus (a key press, then
  // focus), and `tooltip-tap` asserts a tap leaves it closed.
  { name: 'tooltip', act: async (p, c) => {
    if (!c.touch) return hoverIntent(p, '#rsp-tooltip', '.td-tooltip', notes);
    await p.keyboard.press('Shift');
    await p.locator('#rsp-tooltip').focus();
  }, panel: '.td-tooltip' },
  { name: 'tooltip-tap', touchOnly: true, act: (p) => p.tap('#rsp-tooltip'), absent: '.td-tooltip[data-state="open"]' },
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
  { name: 'media-picker-pages', act: (p) => p.evaluate(() => { window.__openers.picker(false, true); }), panel: '.td-media-picker .td-modal__dialog', ready: '.td-media-picker__card', picker: true, pages: true, see: ['.td-media-picker .td-modal__close'] },
  // v0.35.0: the crop dialog (overlay ⇒ @media: box from 720, full viewport below, short band) and the picker crop step
  { name: 'crop-dialog', act: (p) => p.evaluate(() => { window.__openers.cropDialog(); }), panel: '.td-crop-dialog .td-modal__dialog', ready: '.td-crop-dialog td-cropper[data-state="ready"]', crop: true, see: ['.td-crop-dialog__confirm', '.td-crop-dialog__cancel'] },
  { name: 'picker-crop', act: async (p) => { await p.evaluate(() => { window.__openers.pickerCrop(); }); await p.locator('.td-media-picker__card').first().click(); await p.click('.td-media-picker__confirm'); }, panel: '.td-crop-dialog .td-modal__dialog', ready: '.td-crop-dialog td-cropper[data-state="ready"]', crop: true, see: ['.td-crop-dialog__confirm', '.td-crop-dialog__cancel'] },
  { name: 'media-picker-upload', act: async (p) => { await p.evaluate(() => { window.__openers.picker(); }); await p.locator('.td-media-picker__card').first().waitFor(); await p.click('.td-media-picker__upload-btn'); }, panel: '.td-modal__dialog', see: ['.td-modal__dialog .td-modal__close'] },
  // v0.44.0: TdModal.confirm({ typeToConfirm }) with a long unbroken phrase — wraps inside the dialog
  { name: 'modal-type-confirm', act: (p) => p.evaluate(() => window.__openers.modalTypeConfirm()), panel: '.td-modal__dialog', see: ['.td-modal__confirm-field input', '.td-modal__footer .td-btn:last-child'] },
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
    const modes = await page.evaluate(() => ['rsp-table', 'rsp-table-density', 'rsp-table-scroll', 'rsp-table-narrow'].map((id) => {
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
    // v0.36.1 (plan QĐ 10): card density budgets — phone (360 / 393) and the 700 px card column at 768. Each card ≤ the
    // budget, the sort bar ONE row (same chip top) ≤ 52 coarse / 44 mouse, the `lead` ≥ 14 px coarse (12 px mouse).
    if ([360, 393, 768].includes(c.w)) {
      const dens = await page.evaluate(() => ['rsp-table-density', 'rsp-table'].map((id) => {
        const host = document.getElementById(id);
        const trs = [...host.querySelectorAll('.td-table__body > tr')];
        const head = host.querySelector('.td-table__head > tr');
        const lead = host.querySelector('.td-table__body > tr > [data-card="lead"]');
        return { id, width: host.clientWidth, card: !!trs[0] && getComputedStyle(trs[0]).display !== 'table-row',
          rows: trs.map((r) => r.getBoundingClientRect().height), head: head.getBoundingClientRect().height,
          chipTops: [...head.querySelectorAll('.td-table__th--sortable, .td-table__th--select-all')].map((ch) => Math.round(ch.getBoundingClientRect().top)),
          lead: lead ? parseFloat(getComputedStyle(lead).fontSize) : null };
      }));
      const coarse = c.touch && c.engine !== 'firefox';
      // 9-column phone budget 212 (plan: 176 provisional, "M0 records"): customer (≈ 207px) + phone (≈ 182px) pairs
      // cannot share a 250–283px line, so 4 pair lines + meta + a 44px action line is the floor (before: 294 / 306)
      // v0.37.0: #rsp-table-density is selectable (plan allowance 136); measured 115 at 360 coarse — the 44px control fits
      // the first line, so the v0.36.1 budget 120 stays
      const budget = { 'rsp-table-density': c.w < 720 ? 120 : 96, 'rsp-table': c.w < 720 ? 212 : 140 };
      const densErr = [];
      for (const d of dens) {
        if (!d.card) continue; // fallback 768: viewport ≥ 720 → table
        const max = Math.max(...d.rows);
        if (max > budget[d.id] + 0.5) densErr.push(`#${d.id} (host ${d.width}px): card ${max.toFixed(1)}px > ${budget[d.id]}`);
        if (d.head > (coarse ? 52 : 44) + 0.5) densErr.push(`#${d.id}: sort bar ${d.head.toFixed(1)}px > ${coarse ? 52 : 44}`);
        if (new Set(d.chipTops).size > 1) densErr.push(`#${d.id}: sort chips on ${new Set(d.chipTops).size} rows`);
        if (d.id === 'rsp-table-density') {
          if (d.lead === null) densErr.push(`#${d.id}: no lead cell (id column with an explicit primary elsewhere)`);
          else if (coarse ? d.lead < 14 : d.lead !== 12) densErr.push(`#${d.id}: lead ${d.lead}px (${coarse ? '≥ 14 coarse' : '12 mouse'})`);
        }
      }
      notes.push(`${tag} card heights: ${dens.filter((d) => d.card).map((d) => `${d.id} ${Math.round(Math.max(...d.rows))} / bar ${Math.round(d.head)}`).join(', ')}`);
      if (c.touch && c.engine !== 'firefox') {
        // ISSUE-3: real coarse pointer — a card row with TWO visible icon actions: each a ≥ 44 × 44 hit area (box +
        // elementFromPoint at the centre and 2px inside every edge hits that action), ≥ 8px apart
        const act = await page.evaluate(async () => {
          const wrap = document.createElement('div');
          wrap.style.setProperty('width', `${Math.min(360, document.documentElement.clientWidth)}px`);
          document.body.prepend(wrap);
          const t = document.createElement('td-table');
          wrap.appendChild(t);
          t.columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Tiêu đề', card: 'primary' }, { key: 'd', label: 'Ngày', card: 'meta' },
            { key: 'act', label: 'Thao tác', actions: [{ id: 'e', label: 'Sửa', icon: 'pencil' }, { id: 'x', label: 'Xoá', icon: 'trash', variant: 'danger' }] }];
          t.data = [{ id: 1, title: 'Bài viết', d: '01/10/2026' }];
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          window.scrollTo(0, 0);
          const btns = [...t.querySelectorAll('.td-table__action--icon')].filter((b) => b.getBoundingClientRect().width > 1);
          const res = btns.map((b) => {
            const r = b.getBoundingClientRect();
            const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2],
              [r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.bottom - 2]];
            const miss = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !h || !(h === b || b.contains(h)); }).length;
            return { l: r.left, r: r.right, w: r.width, h: r.height, miss };
          });
          wrap.remove();
          return res;
        });
        const actErr = [];
        if (act.length !== 2) actErr.push(`expected 2 visible icon actions, got ${act.length}`);
        act.forEach((x, i) => {
          if (x.w < 43.5 || x.h < 43.5) actErr.push(`action ${i} ${x.w}×${x.h} < 44 × 44`);
          if (x.miss) actErr.push(`action ${i}: ${x.miss} of 5 elementFromPoint probes miss it`);
        });
        if (act.length === 2 && Math.max(act[1].l - act[0].r, act[0].l - act[1].r) < 7.5) actErr.push(`actions ${(act[1].l - act[0].r).toFixed(1)}px apart (< 8)`);
        check(tag, 'td-table icon actions (coarse, v0.36.1)', actErr);
      }
      if (c.touch && c.engine !== 'firefox') {
        // v0.37.0 (plan QĐ 23): row selection controls of #rsp-table-density in card mode — a REAL 44 × 44 box (padding,
        // no ::before), the centre and 2px inside each edge hit the control (elementFromPoint), ≥ 8px from the next target
        const sel = await page.evaluate(() => {
          const host = document.getElementById('rsp-table-density');
          host.scrollIntoView({ block: 'start' });
          const out = [];
          for (const b of [...host.querySelectorAll('.td-table__select')].slice(0, 3)) {
            const r = b.getBoundingClientRect();
            if (r.top < 0 || r.bottom > innerHeight) continue;
            const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2],
              [r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.bottom - 2]];
            const miss = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !h || !(h === b || b.contains(h)); }).length;
            const others = [...host.querySelectorAll('button, a[href]')].filter((o) => o !== b && !b.contains(o) && o.getBoundingClientRect().width > 1);
            const gap = Math.min(...others.map((o) => {
              const q = o.getBoundingClientRect();
              return Math.max(q.left - r.right, r.left - q.right, q.top - r.bottom, r.top - q.bottom);
            }));
            out.push({ w: r.width, h: r.height, miss, gap, before: getComputedStyle(b, '::before').content });
          }
          return out;
        });
        const selErr = [];
        if (!sel.length) selErr.push('no visible selection control');
        sel.forEach((x, i) => {
          if (x.w < 43.5 || x.h < 43.5) selErr.push(`control ${i} ${x.w}×${x.h} < 44 × 44`);
          if (x.miss) selErr.push(`control ${i}: ${x.miss} of 5 elementFromPoint probes miss it`);
          if (x.gap < 7.5) selErr.push(`control ${i}: ${x.gap.toFixed(1)}px from the nearest target (< 8)`);
          if (x.before && x.before !== 'none' && x.before !== 'normal') selErr.push(`control ${i} has a ::before (${x.before})`);
        });
        check(tag, 'td-table selection controls (coarse, v0.37.0)', selErr);
      }
      check(tag, `td-table card density (v0.36.1)${c.shots ? ` (screenshot ${join(OUT, tag, 'page.png')})` : ''}`, densErr);
    }
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
    // v0.43.0 (plan QĐ 21-22): td-media-gallery — a fixed grid: 2 columns below 480 px of viewport, ≥ 4 from 768; every
    // tile inside its list; the tile buttons ≥ 44 × 44 on a coarse pointer (the handle too); 2 columns in a 280 px column
    const gal = await page.evaluate(() => ['rsp-gallery', 'rsp-gallery-narrow'].map((id) => {
      const g = document.getElementById(id);
      const ul = g.querySelector('.td-media-gallery__list').getBoundingClientRect();
      const tiles = [...g.querySelectorAll('.td-media-gallery__item')].map((li) => li.getBoundingClientRect());
      const cols = new Set(tiles.filter((t) => Math.abs(t.top - tiles[0].top) < 1).map((t) => Math.round(t.left))).size;
      const out = tiles.filter((t) => t.left < ul.left - 0.5 || t.right > ul.right + 0.5).length;
      const btns = [...g.querySelectorAll('.td-media-gallery__btn:not([hidden]), .td-media-gallery__handle')].map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
      // v0.51.0 (plan v0.51.0-gallery-caption M6): the alt / caption controls + counters stay inside their tile; their
      // text size (≥ 16 px on a coarse pointer: no iOS zoom)
      const texts = [...g.querySelectorAll('.td-media-gallery__alt, .td-media-gallery__caption, .td-media-gallery__counter:not([hidden])')].map((n) => {
        const r = n.getBoundingClientRect();
        const t = n.closest('.td-media-gallery__item').getBoundingClientRect();
        return { cls: n.className, out: r.left < t.left - 0.5 || r.right > t.right + 0.5, fs: parseFloat(getComputedStyle(n).fontSize), ctl: n.localName !== 'span' };
      });
      return { id, cols, out, btns, texts, captions: g.querySelectorAll('.td-media-gallery__caption').length };
    }));
    const galErr = [];
    for (const x of gal) {
      if (x.out) galErr.push(`#${x.id}: ${x.out} tile(s) outside the list`);
      if (c.touch && c.engine !== 'firefox') for (const [w, h] of x.btns) if (w < 43.5 || h < 43.5) galErr.push(`#${x.id}: a tile button ${w}×${h} < 44 (coarse)`);
      if (!x.captions) galErr.push(`#${x.id}: no caption control (v0.51.0)`);
      for (const t of x.texts) {
        if (t.out) galErr.push(`#${x.id}: ${t.cls} outside its tile`);
        if (c.touch && c.engine !== 'firefox' && t.ctl && t.fs < 16) galErr.push(`#${x.id}: ${t.cls} font-size ${t.fs} < 16 (coarse)`);
      }
    }
    if (c.w < 480 && gal[0].cols !== 2) galErr.push(`#rsp-gallery: ${gal[0].cols} columns at ${c.w}px (want 2)`);
    if (c.w >= 768 && gal[0].cols < 4) galErr.push(`#rsp-gallery: ${gal[0].cols} columns at ${c.w}px (want ≥ 4)`);
    if (gal[1].cols !== 2) galErr.push(`#rsp-gallery-narrow: ${gal[1].cols} columns in the 280px column (want 2)`);
    check(tag, 'td-media-gallery grid (v0.43.0)', galErr);
    check(tag, 'card-mode table semantics', ['- table', '- columnheader', '- row', '- cell'].filter((s) => !snap.includes(s)).map((s) => `aria snapshot lacks "${s}"`));
    // v0.37.0 (plan QĐ 5–8): selection keeps role=table — the header and every row control are checkboxes with names,
    // the selected one checked; no grid / radio / aria-selected
    const selSnap = await page.locator('#rsp-table-density table').ariaSnapshot();
    check(tag, 'td-table selection semantics (v0.37.0)', [
      ...['- table', '- columnheader "Chọn tất cả trên trang"', '- checkbox "Chọn tất cả trên trang" [checked=mixed]',
        '- checkbox "Chọn Tailwind CSS Tips & Tricks" [checked]', '- checkbox "Chọn Hướng dẫn Web Components"']
        .filter((s) => !selSnap.includes(s)).map((s) => `aria snapshot lacks "${s}"`),
      ...['- grid', '- radio', '[selected]'].filter((s) => selSnap.includes(s)).map((s) => `aria snapshot has "${s}"`),
    ]);
    // v0.39.0 (plan v0.39.0-filters-range M4): the filter bar. Hidden column (`hiddenColumns`) out of the accessibility
    // tree (no columnheader / cell); every chip on ONE line; under 480px of chips container ONE scrolling row with
    // "Xoá tất cả" fully inside the section; the "Cột" button visible.
    const fSnap = await page.locator('#rsp-table-filters table').ariaSnapshot();
    check(tag, 'td-table hidden column semantics (v0.39.0)', [
      ...['- columnheader "Mã đơn"', '- columnheader "Khách hàng"'].filter((s) => !fSnap.includes(s)).map((s) => `aria snapshot lacks "${s}"`),
      ...['Số điện thoại', '0912 345 6'].filter((s) => fSnap.includes(s)).map((s) => `aria snapshot has "${s}"`),
    ]);
    const chipErr = await page.evaluate(() => {
      const errs = [];
      const host = document.querySelector('#rsp-chips');
      const list = host.querySelector('.td-filter-chips__list');
      const sec = host.closest('.rsp-section').getBoundingClientRect();
      for (const li of list.children) {
        const h = li.getBoundingClientRect().height;
        if (h > 46) errs.push(`chip "${li.textContent}" ${h.toFixed(1)}px tall (not one line)`);
      }
      const narrow = host.getBoundingClientRect().width < 480;
      if (narrow !== (getComputedStyle(list).flexWrap === 'nowrap')) errs.push(`chips ${narrow ? 'wrap' : 'do not wrap'} at ${host.getBoundingClientRect().width}px`);
      const clear = host.querySelector('.td-filter-chips__clear').getBoundingClientRect();
      if (clear.left < sec.left - 0.5 || clear.right > sec.right + 0.5) errs.push('"Xoá tất cả" outside the section');
      const cols = document.querySelector('#rsp-table-filters .td-table__columns');
      if (!cols || !cols.getClientRects().length) errs.push('"Cột" button not shown');
      return errs;
    });
    check(tag, 'td-filter-chips + column menu (v0.39.0)', chipErr);
    // v0.54.0 (plan v0.54.0-hint gate "responsive"): long hints wrap inside the section (no horizontal overflow), the toggle /
    // checkbox notes start under the label text, the state text stays on the switch row in a narrow table cell
    const hintErr = await page.evaluate(() => {
      const errs = [];
      const sec = document.querySelector('[data-section="hints"]');
      const s = sec.getBoundingClientRect();
      for (const n of sec.querySelectorAll('.td-field__note:not([hidden]), td-hint')) {
        const r = n.getBoundingClientRect();
        if (r.left < s.left - 0.5 || r.right > s.right + 0.5) errs.push(`${n.closest('[id]')?.id || n.id}: hint outside the section`);
      }
      if (sec.scrollWidth > sec.clientWidth + 1) errs.push(`section overflows ${sec.scrollWidth} > ${sec.clientWidth}`);
      const tg = document.getElementById('rsp-hint-toggle');
      const lab = tg.querySelector('.td-switch__label').getBoundingClientRect();
      const note = tg.querySelector('.td-field__note').getBoundingClientRect();
      if (Math.abs(note.left - lab.left) > 0.6) errs.push(`toggle note ${note.left} not under the label ${lab.left}`);
      for (const t of document.querySelectorAll('#rsp-hint-table td-toggle')) {
        const tr = t.querySelector('.td-switch__track').getBoundingClientRect();
        const st = t.querySelector('.td-switch__state').getBoundingClientRect();
        if (Math.abs((st.top + st.bottom) / 2 - (tr.top + tr.bottom) / 2) > 4) errs.push('state text off the switch row');
      }
      return errs;
    });
    check(tag, 'hints + toggle state text (v0.54.0)', hintErr);
    // v0.46.0 (plan v0.46.0-diff M5): td-diff — layout by host width, the forced table scrolls INSIDE its box, rows and
    // values inside the section, summaries ≥ 44 (coarse) / ≥ 24 (mouse)
    const diffErr = await page.evaluate((coarse) => {
      const errs = [];
      const sec = document.querySelector('[data-section="diff"]').getBoundingClientRect();
      for (const id of ['rsp-diff', 'rsp-diff-table']) {
        const host = document.getElementById(id);
        const w = host.getBoundingClientRect().width;
        const table = host.querySelector('.td-diff__table');
        const inline = getComputedStyle(table).display === 'block';
        const want = id === 'rsp-diff' ? w < 480 : false;
        if (inline !== want) errs.push(`#${id} ${inline ? 'inline' : 'table'} at ${w.toFixed(0)}px`);
        const box = host.querySelector('.td-diff__scroll');
        const b = box.getBoundingClientRect();
        if (b.left < sec.left - 0.5 || b.right > sec.right + 0.5) errs.push(`#${id} box outside the section`);
        if (id === 'rsp-diff') {
          for (const r of host.querySelectorAll(':scope > .td-diff__scroll .td-diff__row')) {
            const rr = r.getBoundingClientRect();
            if (rr.right > b.right + 0.5) errs.push(`#${id} row "${r.querySelector('.td-diff__label').textContent}" wider than its box`);
          }
          if (box.scrollWidth > box.clientWidth + 1) errs.push(`#${id} scrolls sideways (${box.scrollWidth} > ${box.clientWidth})`);
        }
        for (const s of host.querySelectorAll('summary')) {
          const sr = s.getBoundingClientRect();
          if (!sr.height) continue;
          if (sr.height < (coarse ? 44 : 24) - 0.5) errs.push(`#${id} summary "${s.textContent}" ${sr.height.toFixed(1)}px tall`);
        }
      }
      return errs;
    }, c.touch && c.engine !== 'firefox');
    check(tag, 'td-diff layout + summaries (v0.46.0)', diffErr);
    // v0.50.0: the carousel section — controls inside the section, buttons / dots never overlap, ratings on one line
    const carErr = await page.evaluate(() => {
      const errs = [];
      for (const id of ['rsp-carousel', 'rsp-carousel-narrow']) {
        const host = document.getElementById(id);
        const sec = host.closest('.rsp-section').getBoundingClientRect();
        const ctl = [...host.querySelectorAll('.td-carousel__btn, .td-carousel__dot')].filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
        if (!ctl.length) errs.push(`#${id}: no controls`);
        ctl.forEach((a, i) => {
          const ra = a.getBoundingClientRect();
          if (ra.left < sec.left - 0.5 || ra.right > sec.right + 0.5) errs.push(`#${id}: control ${i} outside the section`);
          for (const b of ctl.slice(i + 1)) {
            const rb = b.getBoundingClientRect();
            if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 0.5 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 0.5) errs.push(`#${id}: controls overlap`);
          }
        });
        for (const r of host.querySelectorAll('td-rating')) {
          if (new Set([...r.querySelectorAll('.td-rating__star')].map((st) => Math.round(st.getBoundingClientRect().top))).size > 1) errs.push(`#${id}: rating stars wrap`);
        }
      }
      return errs;
    });
    check(tag, 'td-carousel section (v0.50.0)', carErr);
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
    // v0.38.0: td-scan-input — the indicator / speaker never overlap the input; under a 480 px host they sit below it;
    // every list row stays inside the host; the list scrolls inside its own box (max-block-size)
    const scanErr = await page.evaluate(() => {
      const errs = [];
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      for (const el of document.querySelectorAll('td-scan-input')) {
        const host = el.getBoundingClientRect();
        const input = el.querySelector('.td-scan__input').getBoundingClientRect();
        const name = `#${el.id} (${Math.round(host.width)}px)`;
        if (input.right > host.right + 0.5) errs.push(`${name}: input wider than the host`);
        for (const sel of ['.td-scan__status', '.td-scan__mute']) {
          const p = el.querySelector(sel);
          if (!p) continue;
          const r = p.getBoundingClientRect();
          if (hit(r, input)) errs.push(`${name}: ${sel} overlaps the input`);
          if (r.right > host.right + 0.5) errs.push(`${name}: ${sel} outside the host`);
          if (host.width < 480 && r.top < input.bottom - 0.5) errs.push(`${name}: ${sel} not below the input (< 480)`);
        }
        for (const li of el.querySelectorAll('.td-scan__item')) {
          const r = li.getBoundingClientRect();
          if (r.right > host.right + 0.5) { errs.push(`${name}: a row wider than the host`); break; }
        }
        const list = el.querySelector('.td-scan__list');
        if (list && list.children.length > 20 && list.scrollHeight <= list.clientHeight) errs.push(`${name}: 30-row list does not scroll in its own box`);
      }
      return errs;
    });
    check(tag, 'scan input layout (v0.38.0)', scanErr);
    // v0.40.0: td-datetime-range hosts never overflow; the 160 px host's cut trigger text has a title (value-title)
    await page.waitForFunction(() => { const v = document.querySelector('#rsp-dtr-160 .td-dtr__value'); return !v || v.scrollWidth <= v.clientWidth || v.hasAttribute('title'); }, null, { timeout: 2000 }).catch(() => {});
    const dtrErr = await page.evaluate(() => {
      const errs = [];
      for (const el of document.querySelectorAll('td-datetime-range')) {
        const host = el.getBoundingClientRect();
        const t = el.querySelector('.td-dtr__trigger').getBoundingClientRect();
        if (t.right > host.right + 0.5 || t.left < host.left - 0.5) errs.push(`#${el.id}: trigger outside the host`);
      }
      const v = document.querySelector('#rsp-dtr-160 .td-dtr__value');
      if (v && v.scrollWidth > v.clientWidth && v.getAttribute('title') !== v.textContent) errs.push('#rsp-dtr-160: cut text without title');
      return errs;
    });
    check(tag, 'datetime range host (v0.40.0)', dtrErr);
    // v0.49.0: td-choice-group options stay inside the host and never overlap (long labels wrap inside the button); the
    // 160 px stepper keeps its box inside the column with a usable field between the two buttons
    const v049Err = await page.evaluate(() => {
      const errs = [];
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      for (const el of document.querySelectorAll('td-choice-group')) {
        // v0.53.1: an overflowing segmented rail scrolls its segments inside itself (checked by SEG_CHECK below)
        if (el.querySelector('.td-choice__options[data-overflow]')) continue;
        const host = el.getBoundingClientRect();
        const faces = [...el.querySelectorAll('.td-choice__option')].map((o) => o.getBoundingClientRect());
        faces.forEach((r, i) => {
          if (r.right > host.right + 0.5 || r.left < host.left - 0.5) errs.push(`#${el.id}: option ${i} outside the host`);
          for (let j = i + 1; j < faces.length; j++) if (hit(r, faces[j])) errs.push(`#${el.id}: options ${i} / ${j} overlap`);
        });
      }
      const st = document.querySelector('#rsp-stepper-160');
      if (st) {
        const col = st.parentElement.getBoundingClientRect();
        const box = st.querySelector('.td-number__box').getBoundingClientRect();
        const ctl = st.querySelector('.td-number__control').getBoundingClientRect();
        if (box.right > col.right + 0.5) errs.push('#rsp-stepper-160: box wider than its 160 px column');
        if (ctl.width < 24) errs.push(`#rsp-stepper-160: field only ${ctl.width.toFixed(1)}px between the buttons`);
      }
      return errs;
    });
    check(tag, 'choice group + stepper (v0.49.0)', v049Err);
    // v0.52.0 → v0.53.1: segmented — ONE layout per rail (never mixed), equal segments when data-layout="equal", the rail
    // inside its host (overflow scrolls INSIDE the rail, exactly when minRail > room — the shared formula), labels never
    // cut; a toned / locked switch keeps its switch box inside the host
    const v052Err = await page.evaluate(SEG_CHECK, 'td-choice-group[variant="segmented"]');
    v052Err.push(...await page.evaluate(() => {
      const errs = [];
      for (const el of document.querySelectorAll('td-toggle[tone], td-toggle[locked]')) {
        const host = el.getBoundingClientRect();
        const tr = el.querySelector('.td-switch__track').getBoundingClientRect();
        if (tr.right > host.right + 0.5 || tr.left < host.left - 0.5) errs.push(`#${el.id}: switch outside the host`);
      }
      return errs;
    }));
    // v0.53.1: the dsuite sidebar (216 px, sm, stretch) is inline, filling its column
    v052Err.push(...await page.evaluate(() => {
      const el = document.querySelector('#rsp-seg-side');
      if (!el || el.getBoundingClientRect().width < 215) return []; // a viewport narrower than the column: covered by the generic check
      const r = el.querySelector('.td-choice__options');
      const errs = [];
      if (!['equal', 'fit'].includes(r.getAttribute('data-layout'))) errs.push(`#rsp-seg-side: ${r.getAttribute('data-layout')} (inline expected)`);
      if (Math.abs(r.getBoundingClientRect().width - el.getBoundingClientRect().width) > 1) errs.push('#rsp-seg-side: the rail does not fill 216 px');
      return errs;
    }));
    check(tag, 'segmented (v0.53.1 layout levels) + toned / locked switch (v0.52.0)', v052Err);
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

/**
 * v0.53.1 (plan v0.53.1-segmented-layout QĐ 1, QĐ 5): in-page check of every segmented rail under `sel` — one relation
 * icon ↔ label for every segment (never mixed) matching data-layout, equal widths in `equal`, the rail inside its host, the
 * page never overflowing horizontally, labels never cut, and data-overflow ⇔ the shared formula fed with the component's
 * own measurements (src/utils/segmented-layout.js, imported in the page).
 */
async function SEG_CHECK(sel) {
  const { decideLayout } = await import('/src/utils/segmented-layout.js');
  const errs = [];
  for (const el of document.querySelectorAll(sel)) {
    const host = el.getBoundingClientRect();
    if (!host.width) continue;
    const rail = el.querySelector('.td-choice__options');
    const layout = rail.getAttribute('data-layout');
    if (!['equal', 'fit', 'stacked'].includes(layout)) { errs.push(`#${el.id}: data-layout ${layout}`); continue; }
    const rel = [...el.querySelectorAll('.td-choice__face')].map((f) => {
      const i = f.querySelector('.td-choice__icon');
      const t = f.querySelector('.td-choice__text:not(.td-sr-only)');
      if (!i || !t) return null;
      const a = i.getBoundingClientRect();
      const b = t.getBoundingClientRect();
      if (a.bottom <= b.top + 1) return 'stacked';
      const ic = (a.top + a.bottom) / 2;
      return ic > b.top && ic < b.bottom ? 'inline' : 'other';
    }).filter(Boolean);
    if (new Set(rel).size > 1) errs.push(`#${el.id}: mixed ${rel.join(',')}`);
    if (rel.length && rel[0] !== (layout === 'stacked' ? 'stacked' : 'inline')) errs.push(`#${el.id}: ${rel[0]} in ${layout}`);
    if (layout === 'equal') {
      const ws = [...el.querySelectorAll('.td-choice__option')].map((o) => o.getBoundingClientRect().width);
      if (Math.max(...ws) - Math.min(...ws) > 1) errs.push(`#${el.id}: unequal segments ${ws.map((w) => w.toFixed(1)).join('/')}`);
    }
    const rb = rail.getBoundingClientRect();
    if (rb.right > host.right + 0.5 || rb.left < host.left - 0.5) errs.push(`#${el.id}: the rail outside its host`);
    for (const t of el.querySelectorAll('.td-choice__text:not(.td-sr-only)')) if (t.scrollWidth > t.clientWidth + 1) errs.push(`#${el.id}: a cut label`);
    const m = el._segMeasure;
    if (m) {
      const want = decideLayout({ avail: m.avail, inline: m.inline, min: m.min, gap: m.gap, pad: m.pad });
      if (want.overflow !== rail.hasAttribute('data-overflow')) errs.push(`#${el.id}: data-overflow ${rail.hasAttribute('data-overflow')} ≠ formula ${want.overflow}`);
    }
    if (rail.hasAttribute('data-overflow') !== (rail.scrollWidth > rail.clientWidth)) errs.push(`#${el.id}: data-overflow ≠ the rail scrolls`);
  }
  if (document.documentElement.scrollWidth > window.innerWidth) errs.push('the page overflows horizontally');
  return errs;
}

async function runOverlays(page, c, tag, shot) {
  {
    for (const s of SCENARIOS) {
      if (s.mouseOnly && c.touch) continue;
      if (s.touchOnly && !c.touch) continue;
      await load(page);
      try {
        await s.act(page, c);
      } catch (e) {
        check(tag, `${s.name}: could not open`, [String(e.message).split('\n')[0]]);
        continue;
      }
      if (s.absent) { // v0.36.2: the action must NOT open this
        await page.evaluate(settle);
        const n = await page.locator(s.absent).count();
        check(tag, `${s.name}: stays closed`, n ? [`${s.absent} ×${n}`] : []);
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
      // v0.53.1: the segmented theme row of the menu panel (recipe: sm + stretch) — the same layout invariants
      if (s.name === 'menu-panel') check(tag, 'menu-panel: segmented layout (v0.53.1)', await page.evaluate(SEG_CHECK, '.td-menu--panel td-choice-group'));
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
        if (s.pages) {
          // v0.36.0 (QĐ 51): < 720 the pager is the last row of the results scroller; ≥ 720 it sits in the toolbar row
          const pg = await page.evaluate(() => {
            const p = document.querySelector('.td-media-picker__pager');
            const tb = document.querySelector('.td-media-picker__toolbar').getBoundingClientRect();
            const r = p.querySelector('td-pagination').getBoundingClientRect();
            return { inResults: !!p.closest('.td-media-picker__results'), right: r.right, tbRight: tb.right };
          });
          if (vp.w < 720 && !pg.inResults) err.push('pager not under the grid below 720');
          if (vp.w >= 720 && (pg.inResults || pg.right > pg.tbRight + 1)) err.push(`pager outside the toolbar row (${Math.round(pg.right)} > ${Math.round(pg.tbRight)})`);
        }
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
      if (s.name === 'datetime-range') {
        // v0.40.0 (plan QĐ 24): < 720 the switch + one side; ≥ 720 both sides on one row; presets inside the dialog
        // (one scrolling row < 480 / short); the side shown fits the dialog width
        const dr = await page.evaluate(() => {
          const p = [...document.querySelectorAll('.td-dtr-panel')].pop();
          const d = p.closest('.td-modal__dialog').getBoundingClientRect();
          const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
          const sides = [...p.querySelectorAll('.td-dtr-panel__side')].filter(vis).map((x) => x.getBoundingClientRect());
          const row = p.querySelector('.td-dtr-panel__presets');
          const rr = row.getBoundingClientRect();
          return { sw: vis(p.querySelector('.td-dtr-panel__switch')), n: sides.length, sameRow: sides.length === 2 && Math.abs(sides[0].top - sides[1].top) < 2,
            sideOut: sides.some((x) => x.left < d.left - 0.5 || x.right > d.right + 0.5), rowOut: rr.left < d.left - 0.5 || rr.right > d.right + 0.5,
            wrap: getComputedStyle(row).flexWrap };
        });
        const err = [];
        if (vp.w < 720 && !(dr.sw && dr.n === 1)) err.push(`< 720: switch ${dr.sw}, sides shown ${dr.n} (switch + one side expected)`);
        if (vp.w >= 720 && !(dr.n === 2 && dr.sameRow && !dr.sw)) err.push(`≥ 720: sides ${dr.n}, same row ${dr.sameRow}, switch ${dr.sw}`);
        if (dr.sideOut) err.push('a side wider than the dialog');
        if (dr.rowOut) err.push('presets row wider than the dialog');
        if ((vp.w < 480 || vp.h <= 500) && dr.wrap !== 'nowrap') err.push(`presets wrap (${dr.wrap}) < 480 / short`);
        check(tag, `${s.name}: layout`, err);
      }
      if (s.name === 'lightbox' || s.name === 'lightbox-panel') {
        // v0.36.0 (plan QĐ 59 revised): < 480 the bottom rail holds ‹ counter › (inside the viewport, ≥ 44 px, not over the
        // grabber); a coarse pointer from 480 / the short band → 48 px side discs; nav is never hidden on touch
        const nv = await page.evaluate(() => {
          const o = document.querySelector('.td-lightbox');
          const rail = o.querySelector('.td-lightbox__rail');
          const r = rail.getBoundingClientRect();
          const btns = [...o.querySelectorAll('[data-action="prev"], [data-action="next"]')].map((b) => {
            const q = b.getBoundingClientRect();
            return { w: q.width, h: q.height, shown: getComputedStyle(b).display !== 'none' && getComputedStyle(b).visibility !== 'hidden' };
          });
          const g = o.querySelector('.td-lightbox__grab');
          const gr = g && o.hasAttribute('data-panel') ? g.getBoundingClientRect() : null;
          const hit = gr && r.width && r.left < gr.right && gr.left < r.right && r.top < gr.bottom && gr.top < r.bottom;
          return { mode: o.getAttribute('data-nav'), rail: rail.hidden ? null : { l: r.left, r: r.right, t: r.top, b: r.bottom }, btns, hit };
        });
        const err = [];
        if (vp.w < 480) {
          if (nv.mode !== 'rail' || !nv.rail) err.push(`no rail below 480 (data-nav=${nv.mode})`);
          else if (nv.rail.l < -1 || nv.rail.r > vp.w + 1 || nv.rail.t < 0 || nv.rail.b > vp.h + 1) err.push('rail outside the viewport');
          if (nv.hit) err.push('rail over the sheet grabber');
        } else if (c.touch || vp.h <= 500) {
          if (nv.mode !== 'side-compact') err.push(`coarse / short: data-nav=${nv.mode} (side discs expected)`);
        }
        if (c.touch && nv.btns.some((b) => !b.shown || b.w < 43.5 || b.h < 43.5)) err.push(`nav buttons ${JSON.stringify(nv.btns)}`);
        check(tag, `${s.name}: persistent navigation`, err);
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

/** v0.50.0 (plan C13 / C21): PHP carousel markup → module → same box, right rows, every control a real target. */
async function runCarouselPhp(browser, c) {
  const tag = `carousel-${tagOf(c)}`;
  const opts = { viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' };
  if (c.touch) { opts.hasTouch = true; if (c.engine !== 'firefox') opts.isMobile = true; }
  const context = await browser.newContext(opts);
  const body = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${ORIGIN}/td.css"><link rel="stylesheet" href="${ORIGIN}/test/fixtures/carousel-page.css">
<style>body{margin:0;padding:16px;font:14px system-ui} #mis{--td-carousel-per-view-md:4}</style></head><body>
${['c-3', 'c-8', 'c-12', 'c-13'].map(carCase).join('\n')}<div id="mis">${carCase('c-8').replace('data-case="c-8"', 'data-case="mis"')}</div></body></html>`;
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body });
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: await css(false) });
    if (/^\/(src|test\/fixtures)\//.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try { return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(join(ROOT, url.pathname)) }); } catch { /* 404 */ }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(settle);
    const coarse = c.touch && c.engine !== 'firefox';
    const r = await page.evaluate(async (coarseWant) => {
      const raf = () => new Promise((res) => requestAnimationFrame(() => res()));
      const ids = ['c-3', 'c-8', 'c-12', 'c-13', 'mis'];
      const host = (id) => document.querySelector(`section[data-case="${id}"] > td-carousel`);
      const box = (id) => ({ ctl: host(id).querySelector('.td-carousel__controls').getBoundingClientRect().height, host: host(id).getBoundingClientRect().height });
      const before = Object.fromEntries(ids.map((id) => [id, box(id)]));
      const shifts = [];
      let obs = null;
      if (PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
        obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) shifts.push(e); });
        obs.observe({ type: 'layout-shift' });
      }
      await import('/src/display/td-carousel.js');
      await raf(); await raf(); await raf();
      if (obs) { for (const e of obs.takeRecords()) shifts.push(e); obs.disconnect(); }
      const after = Object.fromEntries(ids.map((id) => [id, box(id)]));
      const errs = [];
      const notesIn = [];
      const coarse = matchMedia('(pointer: coarse)').matches;
      if (coarse !== coarseWant) errs.push(`pointer: coarse ${coarse}, want ${coarseWant}`);
      for (const id of ids) {
        const d = Math.abs(after[id].ctl - before[id].ctl) + Math.abs(after[id].host - before[id].host);
        if (id === 'mis') notesIn.push(`predicted ≠ measured (per-view-md token): pages ${host(id).getAttribute('data-td-pages')}, shift ${d.toFixed(1)}px`);
        else if (d > 0.5) errs.push(`${id}: controls ${before[id].ctl}→${after[id].ctl}, host ${before[id].host}→${after[id].host} (CLS)`);
      }
      const ours = shifts.filter((e) => (e.sources || []).some((s) => s.node && s.node.closest && !s.node.closest('#mis') && s.node.closest('section')));
      if (ours.length) errs.push(`layout-shift entries: ${ours.map((e) => e.value.toFixed(4)).join(', ')}`);
      const min = coarse ? 44 : 24;
      const hitOk = (el) => {
        const b = el.getBoundingClientRect();
        if (b.width < min - 0.5 || b.height < min - 0.5) return `${b.width.toFixed(1)}×${b.height.toFixed(1)}`;
        for (const [x, y] of [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 2, b.top + b.height / 2], [b.right - 2, b.top + b.height / 2], [b.left + b.width / 2, b.top + 2], [b.left + b.width / 2, b.bottom - 2]]) {
          const h = document.elementFromPoint(x, y);
          if (!h || !(h === el || el.contains(h))) return `point ${Math.round(x)},${Math.round(y)} hits ${h?.className || h?.tagName}`;
        }
        return '';
      };
      const want = { 'c-3': [3, 1, 'inline'], 'c-8': [8, 2, 'inline'], 'c-12': [12, 2, 2], 'c-13': [13, 0, 2] };
      for (const [id, [P, narrowRows, wideRows]] of Object.entries(want)) {
        const h = host(id);
        h.scrollIntoView({ block: 'center', behavior: 'instant' });
        await raf();
        const wide = h.clientWidth >= 480;
        const rows = wide ? wideRows : narrowRows;
        const prev = h.querySelector('[data-td-carousel="prev"]');
        const next = h.querySelector('[data-td-carousel="next"]');
        const counter = h.querySelector('.td-carousel__counter');
        const dots = [...h.querySelectorAll('.td-carousel__dot')];
        const hr = h.getBoundingClientRect();
        for (const [n, b] of [['prev', prev], ['next', next]]) {
          const e = hitOk(b);
          if (e) errs.push(`${id} ${n}: ${e}`);
          const r = b.getBoundingClientRect();
          if (r.left < hr.left - 0.5 || r.right > hr.right + 0.5) errs.push(`${id} ${n} outside the host`);
        }
        const cs = getComputedStyle(counter);
        if (rows === 'inline') {
          if (cs.display !== 'none') errs.push(`${id}: counter shown in the inline layout`);
          const tops = new Set([prev, next, ...dots].map((n) => Math.round(n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2)));
          if (tops.size > 1) errs.push(`${id}: inline layout on ${tops.size} lines`);
        } else {
          const cr = counter.getBoundingClientRect();
          if (cs.display === 'none' || counter.textContent !== `1 / ${P}`) errs.push(`${id}: counter "${counter.textContent}" (${cs.display})`);
          if (Math.abs((cr.top + cr.bottom) / 2 - (prev.getBoundingClientRect().top + prev.getBoundingClientRect().bottom) / 2) > 1) errs.push(`${id}: counter not on the button row`);
          if (cr.left < prev.getBoundingClientRect().right - 0.5 || cr.right > next.getBoundingClientRect().left + 0.5) errs.push(`${id}: counter overlaps a button`);
          const shown = dots.filter((d) => d.getClientRects().length);
          const dotRows = new Set(shown.map((d) => Math.round(d.getBoundingClientRect().top))).size;
          if (dotRows !== rows) errs.push(`${id}: ${dotRows} dot row(s), want ${rows} (${wide ? 'wide' : 'narrow'})`);
          if (rows && shown.length && Math.min(...shown.map((d) => d.getBoundingClientRect().top)) < prev.getBoundingClientRect().bottom - 0.5) errs.push(`${id}: dots overlap the button row`);
        }
        // every visible dot: a real target, no overlap, selects its page
        const shown = dots.filter((d) => d.getClientRects().length);
        for (let i = 0; i < shown.length; i++) {
          const e = hitOk(shown[i]);
          if (e) { errs.push(`${id} dot ${i + 1}: ${e}`); break; }
        }
        for (let i = 0; i < shown.length; i++) {
          shown[i].click();
          await raf(); await raf();
          if (shown[i].getAttribute('aria-current') !== 'true') { errs.push(`${id}: dot ${i + 1} did not select its page`); break; }
        }
        if (shown.length) shown[0].click();
        await raf();
      }
      return { errs, notes: notesIn };
    }, coarse);
    check(tag, 'carousel PHP markup → module (v0.50.0)', r.errs);
    for (const n of r.notes) notes.push(`${tag}: ${n}`);
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
// v0.50.0: carousel PHP markup before / after the module (CLS + C21 layout)
const CAROUSEL_CONFIGS = [
  { engine: 'chromium', w: 360, h: 780, touch: true }, { engine: 'chromium', w: 390, h: 844, touch: true },
  { engine: 'chromium', w: 480, h: 900, touch: true }, { engine: 'chromium', w: 768, h: 1024, touch: true },
  { engine: 'chromium', w: 1280, h: 800, touch: false }, { engine: 'webkit', w: 390, h: 844, touch: true },
  { engine: 'firefox', w: 360, h: 780, touch: false },
].filter((c) => engines.includes(c.engine) && (!only || `carousel-${tagOf(c)}`.includes(only)));
const carouselFixture = await readFile(join(ROOT, 'test', 'ssr', 'fixtures', 'carousel.html'), 'utf8');
const carCase = (id) => carouselFixture.split('\n').find((l) => l.includes(`data-case="${id}"`));
for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]]) {
  const list = CAROUSEL_CONFIGS.filter((c) => c.engine === name);
  if (!list.length) continue;
  const browser = await launcher.launch(await launchOptions(name, launcher));
  try {
    for (const c of list) await runCarouselPhp(browser, c);
  } finally {
    await browser.close();
  }
}

for (const n of notes) console.log(`note: ${n}`);
console.log(`responsive gate: ${selected.length} configurations, ${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('responsive gate: OK');
