#!/usr/bin/env node
/**
 * Touch lane (v0.36.2, ADR 0019, plan M7 / G23). Deterministic, no pixel diff, no sleeps (CDP timestamps drive gesture
 * speed; waits are rAF / attribute / animation signals).
 *
 * (a) Chromium 390×844 hasTouch + isMobile — semantics: a tap acts once; hover never sticks after a tap; the pressed
 *     state (data-td-pressed + the pressed token) while a finger is down, cleared on release / cancel / moving past the
 *     slop; tooltip never opens on a tap; sortable slop (touch 8 px no lift, 14 px drag + click swallowed, mouse 5 px
 *     drag, a swipe on the item body scrolls the page); copy double tap = one state change; table / tabs swiped
 *     sideways scroll without sorting / switching. v0.47.0: td-check-matrix — a tap toggles one cell, a swipe on the grid
 *     scrolls its box without toggling, a tap on a locked cell shows its note, the pressed look of a cell.
 *     v0.49.0: a choice-group option selects on one tap (pressed while down, nothing stuck), a swipe starting on the
 *     options scrolls; five quick taps on the stepper + = +5, no zoom. v0.55.0: affix boxes ≥ 44 px / text ≥ 16 px, a tap on
 *     an affix focuses the control, a tap on a page [slot] button does not (it gets its click), number inputmode.
 *     v0.58.0: floating fields ≥ 44 px / value ≥ 16 px, a tap on the resting and on the raised label focuses the control,
 *     the raised label's hit box stays above the value line. v0.59.0: the date clear button ≥ 44 × 44, pressed while the
 *     finger is down, a tap clears (one change, focus on the trigger, no dialog); the "Không hạn" toggle of the range
 *     dialog ≥ 44 px tall and a tap empties the end. v0.59.1: label-position="start" — the label + control box ≥ 44 px, a
 *     tap on the label (now on the start side) flips the toggle / ticks the checkbox once, pressed while the finger is down.
 * (b) Chromium CDP Input.dispatchTouchEvent — continuous swipes and two-finger pinches: lightbox swipe-follow
 *     (commit / spring / flick / RTL / one item rubber band / edge / zoomed / cancel / reduced motion / settle races),
 *     cropper pinch + touchcancel.
 * (c) WebKit `devices['iPhone 13']` smoke — lightbox phone rail next / prev, dropdown inside the viewport, sheet modal
 *     body scroll does not chain to the page, close buttons reachable, hover not sticky, pressed state (synthetic
 *     touch pointer events: state machine only — WebKit Playwright is not Safari, QĐ 24).
 * v0.50.0 td-carousel (ADR 0024): a sideways swipe on the strip scrolls it (page still), a vertical swipe STARTING on the
 *   strip scrolls the PAGE (no pan-x trap), a tap on "next" moves exactly one page, buttons / dots show the pressed state,
 *   touch-action of the viewport stays auto; WebKit smoke: next / prev by tap.
 * v0.56.0: a disabled td-repeater's buttons show no pressed state (the readonly one has no button at all).
 * Firefox is not in this lane (no reliable touch emulation). Synthetic pointer events only test state machines.
 *
 *   node test/touch/touch.spec.mjs            (npm run test:touch; TOUCH_ONLY=<case substring> for a subset)
 */
import { chromium, webkit, devices } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { cdpFor, touchDown, touchMoveTo, touchUp, touchCancel, touchDrag, pinch, doubleTap } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://touch.local';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
const ONLY = process.env.TOUCH_ONLY || '';

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${ORIGIN}/td.css"><link rel="stylesheet" href="${ORIGIN}/test/fixtures/responsive-page.css">
<style>body{margin:0;background:var(--td-color-surface-muted)} #touch-extra{padding:16px;display:flex;gap:12px;flex-wrap:wrap}</style>
<script>
  // timer ledger (no sleeps in the race checks): every setTimeout gets a sequence number and a state
  // pending → fired | cleared; a check waits until every timer created after a mark has settled
  (() => {
    const st = window.setTimeout.bind(window); const ct = window.clearTimeout.bind(window);
    const led = new Map(); let seq = 0;
    window.__timers = led;
    window.__timerSeq = () => seq;
    window.setTimeout = (fn, ms, ...a) => {
      const rec = { seq: ++seq, state: 'pending' };
      const id = st(() => { rec.state = 'fired'; if (typeof fn === 'function') fn(...a); }, ms);
      led.set(id, rec);
      return id;
    };
    window.clearTimeout = (id) => { const rec = led.get(id); if (rec && rec.state === 'pending') rec.state = 'cleared'; ct(id); };
  })();
</script>
<script type="module">
  import { mountResponsiveFixture } from '${ORIGIN}/test/fixtures/responsive-page.js';
  const extra = document.getElementById('touch-extra');
  extra.innerHTML = '<button type="button" class="td-btn td-btn--primary" id="t-primary"><span class="td-btn__label">Lưu</span></button>'
    + '<button type="button" class="td-btn td-btn--ghost" id="t-ghost"><span class="td-btn__label">Bỏ qua</span></button>'
    + '<td-action-button id="t-action" action="edit"></td-action-button>';
  await import('${ORIGIN}/src/form/td-action-button.js');
  const { openers } = mountResponsiveFixture(document.getElementById('root'));
  window.__openers = openers;
  window.__ready = true;
</script></head><body><div id="touch-extra"></div><main id="root"></main></body></html>`;

const failures = [];
const notes = [];
let checks = 0;
let cases = 0;

async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

const tdCss = await readFile(join(ROOT, 'td.css'), 'utf8');

async function newPage(browser, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: tdCss });
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
  await frames(page, 2);
}

/** n animation frames in the page (a real rendering signal) */
const frames = (page, n = 2) => page.evaluate((k) => new Promise((r) => { const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : r()); f(k); }), n);

/** mark the timer ledger; `timersSettled(page, mark)` waits until every timer created after it fired or was cleared */
const markTimers = (page) => page.evaluate(() => window.__timerSeq());
const timersSettled = (page, mark) => page.waitForFunction(
  (m) => [...window.__timers.values()].every((r) => r.seq <= m || r.state !== 'pending'), mark, { polling: 'raf', timeout: 5000 });

/** run one case; a throw or a false check is a failure */
async function it(tag, name, fn) {
  if (ONLY && !`${tag} ${name}`.includes(ONLY)) return;
  cases += 1;
  try {
    await fn();
  } catch (e) {
    failures.push(`${tag} ${name}: ${String(e && e.message).split('\n')[0]}`);
  }
}
function expect(cond, msg) {
  checks += 1;
  if (!cond) throw new Error(msg);
}

/** centre of the first element matching `sel` (scrolled into view) */
async function centre(page, sel) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), bb: b };
}


/** a token resolved in the page (a probe element's computed colour) */
const tokenColour = (page, token) => page.evaluate((t) => {
  const p = document.createElement('span');
  p.style.setProperty('background-color', `var(${t})`);
  document.body.append(p);
  const c = getComputedStyle(p).backgroundColor;
  p.remove();
  return c;
}, token);

/* ------------------------------------------------------------------ the 8 control types (A3 / A4) */

const PRESS_TYPES = [
  { name: 'button', sel: '#t-primary', token: '--td-btn-primary-pressed' },
  { name: 'ghost', sel: '#t-ghost', token: '--td-btn-ghost-pressed' },
  { name: 'action', sel: '#t-action .td-btn--action', token: '--td-action-btn-standard-pressed-bg' },
  { name: 'tab', sel: '#rsp-tabs .td-tabs__tab[aria-selected="true"]', token: '--td-color-pressed' },
  { name: 'page', sel: 'td-pagination .td-pagination__nav:not([aria-disabled="true"])', token: '--td-color-pressed' },
  // v0.37.0 review ISSUE-5: td-table row selection — the row checkbox and the "select all on this page" chip (card mode at 390)
  { name: 'row select', sel: '#rsp-table-density .td-table__select', token: '--td-color-pressed' },
  { name: 'select all chip', sel: '#rsp-table-density .td-table__select-all', token: '--td-color-pressed' },
  { name: 'tree row', sel: '#g-tree .td-tree__row', token: '--td-option-pressed-bg' },
  // v0.57.0: td-table tree toggle (a tap opens / closes the branch — pressed only)
  { name: 'table tree toggle', sel: '#rsp-table-tree .td-table__tree-toggle', token: '--td-color-pressed', noTap: true },
  // v0.45.0: a clickable td-steps step (navigation="back") and a td-timeline details summary
  { name: 'step', sel: '#rsp-steps button.td-steps__step', token: '--td-color-pressed' },
  { name: 'timeline summary', sel: '#rsp-timeline .td-timeline__summary', token: '--td-color-pressed' },
  { name: 'option', sel: '.td-dropdown__menu[data-state="open"] .td-dropdown__option', token: '--td-option-pressed-bg',
    open: async (page) => { await page.tap('#g-dd .td-dropdown__trigger'); await page.locator('.td-dropdown__menu[data-state="open"] .td-dropdown__option').first().waitFor(); } },
  // the card's media opener is the innermost control under the finger: its ::after tints the image
  { name: 'picker card', sel: '.td-media-picker__card .td-media-grid__open', token: '--td-color-pressed', pseudo: '::after',
    open: async (page) => { await page.evaluate(() => { window.__openers.picker(); }); await page.locator('.td-media-picker__card').first().waitFor(); await settle(page, '.td-media-picker'); } },
  // v0.36.2 review ISSUE-1: tap-to-act surfaces (a tap opens the file picker / dismisses) — pressed only (noTap)
  // the zone's top padding (its centre holds the browse button, a control of its own)
  { name: 'dropzone', sel: 'td-dropzone .td-dropzone__zone', token: '--td-dropzone-bg-pressed', noTap: true, top: true },
  // v0.43.0: td-media-gallery tile button (Gỡ — pressed only: a tap removes the image)
  { name: 'gallery button', sel: '#rsp-gallery .td-media-gallery__remove', token: '--td-color-pressed', noTap: true },
  { name: 'toast', sel: '.td-toast--error', token: '--td-toast-error-pressed-bg', noTap: true,
    open: async (page) => { await page.evaluate(() => window.__openers.toast()); await page.locator('.td-toast--error[data-state="open"]').waitFor(); await settle(page, '.td-toast--error'); } },
  // v0.46.0: td-diff <summary> (native <details>: a tap toggles it — pressed only)
  { name: 'diff summary', sel: '#rsp-diff .td-diff__json > .td-diff__summary', token: '--td-color-pressed', noTap: true },
];

/**
 * The control-type matrix (A3 hover not sticky, A4 pressed) for one engine. `input` abstracts the finger: CDP touch in
 * Chromium, synthetic touch pointer events in WebKit (state machine only, QĐ 24 — accepted for the smoke engine).
 */
async function controlMatrix(tag, page, input) {
  // A3: hover never sticks — after a tap (once the pressed state is over) the fill equals the one after tapping a
  // neutral spot (same state, the finger elsewhere)
  for (const t of PRESS_TYPES.filter((x) => x.name !== 'option' && !x.noTap)) {
    await it(tag, `hover not sticky: ${t.name}`, async () => {
      await load(page);
      if (t.open) await t.open(page);
      const pt = await centre(page, t.sel);
      if (t.name === 'picker card') { await input.down(pt); await input.cancel(); } // a tap would open the detail
      else await input.tap(pt);
      await quiet(page, t.sel);
      const after = await bgOf(page, t.sel, t.pseudo);
      const h = await centre(page, t.name === 'picker card' ? '.td-media-picker .td-modal__title' : '#root h2');
      await input.tap(h);
      await quiet(page, t.sel);
      const away = await bgOf(page, t.sel, t.pseudo);
      expect(after === away, `${after} ≠ ${away} (a hover style stuck after the tap)`);
    });
  }
  await it(tag, 'hover not sticky: option (finger down + cancel leaves the resting fill)', async () => {
    await load(page);
    const t = PRESS_TYPES.find((x) => x.name === 'option');
    await t.open(page);
    await settle(page, '.td-dropdown__menu[data-state="open"]');
    const rest = await bgOf(page, t.sel);
    const pt = await centre(page, t.sel);
    await input.down(pt);
    await input.cancel();
    await quiet(page, t.sel);
    expect(await bgOf(page, t.sel) === rest, 'option fill differs from rest after the finger left');
  });

  // A4: pressed while the finger is down (data-td-pressed + the pressed token), back to rest after a cancel
  for (const t of PRESS_TYPES) {
    await it(tag, `pressed: ${t.name}`, async () => {
      await load(page);
      if (t.open) await t.open(page);
      const c = await centre(page, t.sel);
      const pt = t.top ? { x: c.x, y: Math.round(c.bb.y + 6) } : c;
      await quiet(page, t.sel);
      const rest = await bgOf(page, t.sel, t.pseudo);
      await input.down(pt);
      await frames(page, 2);
      const m = await pressedMatches(page, t);
      expect(m.ok, `pressed look missing: attr ${m.got.attr}, bg ${m.got.bg} (want ${m.want})`);
      await input.cancel();
      await quiet(page, t.sel);
      expect(await bgOf(page, t.sel, t.pseudo) === rest, 'not back to the resting fill');
    });
  }

  // ISSUE-1: no pressed fill on a disabled dropzone or during a drag over it
  for (const [what, setup] of [
    ['disabled', (h) => h.setAttribute('disabled', '')],
    ['dragover', (h) => h.querySelector('.td-dropzone').setAttribute('data-state', 'dragover')],
  ]) {
    await it(tag, `pressed: dropzone ${what} keeps its own fill`, async () => {
      await load(page);
      await page.evaluate((src) => { const h = document.querySelector('td-dropzone'); new Function('h', `(${src})(h)`)(h); }, setup.toString());
      const sel = 'td-dropzone .td-dropzone__zone';
      await quiet(page, sel);
      const rest = await bgOf(page, sel);
      const pt = await centre(page, sel);
      await input.down({ x: pt.x, y: pt.bb.y + 6 });
      await frames(page, 2);
      const now = await bgOf(page, sel);
      await input.cancel();
      expect(now === rest, `${what}: ${now} ≠ ${rest}`);
    });
  }

  // v0.56.0 (plan R7): a button of a `disabled` repeater has no pressed look (it is disabled like in a fieldset)
  await it(tag, 'pressed: disabled td-repeater button keeps its own fill', async () => {
    await load(page);
    const sel = '#rsp-rep-dis .td-repeater__btn--remove';
    await quiet(page, sel);
    const rest = await bgOf(page, sel);
    const pt = await centre(page, sel);
    await input.down(pt);
    await frames(page, 2);
    const now = await bgOf(page, sel);
    await input.cancel();
    expect(now === rest, `disabled repeater button: ${now} ≠ ${rest}`);
  });
}

/** CDP touch (Chromium) */
const cdpInput = (page, cdp) => ({
  down: (pt) => touchDown(cdp, pt),
  cancel: () => touchCancel(cdp),
  tap: (pt) => page.touchscreen.tap(pt.x, pt.y),
});

/** synthetic touch pointer events on the element under the point (WebKit; the tap itself is the real touchscreen) */
const syntheticInput = (page) => ({
  down: (pt) => page.evaluate(({ x, y }) => {
    const t = document.elementFromPoint(x, y);
    window.__synth = t;
    t.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 31, isPrimary: true, bubbles: true, composed: true, clientX: x, clientY: y }));
  }, pt),
  cancel: () => page.evaluate(() => {
    const t = window.__synth || document.body;
    t.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', pointerId: 31, isPrimary: true, bubbles: true, composed: true }));
  }),
  tap: (pt) => page.touchscreen.tap(pt.x, pt.y),
});

/** every animation / transition under `sel` (and the element itself) is over */
async function settle(page, sel) {
  await page.evaluate((s) => Promise.all([...document.querySelectorAll(s)].flatMap((el) => el.getAnimations({ subtree: true })).map((a) => a.finished.catch(() => {}))), sel);
  await frames(page, 2);
}

/** the control is at rest: not :active, no data-td-pressed, no transition running (signals, not a sleep) */
async function quiet(page, sel) {
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return !!el && !el.matches(':active') && !el.hasAttribute('data-td-pressed') && !el.getAnimations().length;
  }, sel, { polling: 'raf', timeout: 4000 });
  await frames(page, 2);
}

/** computed background (colour + image; or of a pseudo-element) */
const bgOf = (page, sel, pseudo = null) => page.evaluate(([s, ps]) => {
  const cs = getComputedStyle(document.querySelector(s), ps);
  return `${cs.backgroundColor} | ${cs.backgroundImage}`;
}, [sel, pseudo]);

async function pressedMatches(page, t) {
  const want = await tokenColour(page, t.token);
  const got = await page.evaluate(([s, ps]) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el, ps);
    return { attr: el.hasAttribute('data-td-pressed'), bg: cs.backgroundColor, img: cs.backgroundImage };
  }, [t.sel, t.pseudo || null]);
  return { want, got, ok: got.attr && got.bg === want };
}

/* ------------------------------------------------------------------ (a) Chromium semantics */

async function chromiumSemantics(browser) {
  const tag = 'chromium-390';
  const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const cdp = await cdpFor(page);
  const has = (sel) => page.evaluate((s) => document.querySelector(s).hasAttribute('data-td-pressed'), sel);
  try {
    await controlMatrix(tag, page, cdpInput(page, cdp));

    await it(tag, 'pressed: 6 px keeps it, 12 px clears it (touch slop 10); one holder at a time', async () => {
      await load(page);
      const pt = await centre(page, '#t-ghost');
      await touchDown(cdp, pt);
      await touchMoveTo(cdp, { x: pt.x + 6, y: pt.y });
      await frames(page, 2);
      expect(await has('#t-ghost'), 'cleared at 6 px');
      await touchMoveTo(cdp, { x: pt.x + 12, y: pt.y });
      await frames(page, 2);
      expect(!(await has('#t-ghost')), 'kept at 12 px');
      await touchUp(cdp);
      const p2 = await centre(page, '#t-primary');
      await touchDown(cdp, pt);
      await touchUp(cdp);
      await touchDown(cdp, p2);
      await frames(page, 1);
      const holders = await page.evaluate(() => [...document.querySelectorAll('[data-td-pressed]')].map((e) => e.id));
      expect(holders.length === 1 && holders[0] === 't-primary', `holders: ${holders.join(',')}`);
      await touchUp(cdp);
    });

    await it(tag, 'a mouse press does not set data-td-pressed (native :active only)', async () => {
      await load(page);
      const pt = await centre(page, '#t-primary');
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      const attr = await has('#t-primary');
      await page.mouse.up();
      expect(!attr, 'mouse press set the attribute');
    });

    await it(tag, 'a tap acts once: button click, tab change, page change, option pick', async () => {
      await load(page);
      await page.evaluate(() => {
        const c = { click: 0, tab: 0, page: 0, change: 0 };
        document.querySelector('#t-primary').addEventListener('click', () => { c.click += 1; });
        document.querySelector('#rsp-tabs').addEventListener('tab-change', () => { c.tab += 1; });
        document.querySelector('td-pagination').addEventListener('page-change', () => { c.page += 1; });
        document.querySelector('#g-dd').addEventListener('change', () => { c.change += 1; });
        window.__counts = c;
      });
      const tap = async (sel) => { const p = await centre(page, sel); await page.touchscreen.tap(p.x, p.y); await frames(page, 2); };
      await tap('#t-primary');
      await tap('#rsp-tabs .td-tabs__tab:not([aria-selected="true"])');
      await tap('td-pagination .td-pagination__nav:not([aria-disabled="true"])');
      await tap('#g-dd .td-dropdown__trigger');
      await page.locator('.td-dropdown__menu[data-state="open"] .td-dropdown__option').first().waitFor();
      await settle(page, '.td-dropdown__menu[data-state="open"]');
      await tap('.td-dropdown__menu[data-state="open"] .td-dropdown__option');
      const c = await page.evaluate(() => window.__counts);
      expect(c.click === 1 && c.tab === 1 && c.page === 1 && c.change === 1, `counts ${JSON.stringify(c)}`);
    });

    await it(tag, 'tooltip: a tap never opens it', async () => {
      await load(page);
      const pt = await centre(page, '#rsp-tooltip');
      await page.touchscreen.tap(pt.x, pt.y);
      await frames(page, 4);
      expect(await page.locator('.td-tooltip[data-state="open"]').count() === 0, 'tooltip opened on a tap');
    });

    // v0.48.0 td-color-picker: the 2-D area is touch-action: none (a drag picks, the page stays); the rest of the popup
    // (presets) keeps the normal vertical scroll
    const openColor = async () => {
      await load(page);
      const pt = await centre(page, '#g-color .td-color__trigger');
      await page.touchscreen.tap(pt.x, pt.y);
      await page.locator('body > .td-color-panel[data-state="open"]').waitFor();
      await page.evaluate(() => {
        window.__cp = { change: 0 };
        document.querySelector('#g-color').addEventListener('change', (e) => { if (e.detail) window.__cp.change += 1; });
      });
    };
    await it(tag, 'color picker: a touch drag on the 2-D area picks a colour, the page does not scroll, one change', async () => {
      await openColor();
      const b = await page.locator('.td-color-panel__area').boundingBox();
      const v0 = await page.evaluate(() => document.querySelector('#g-color').value);
      const y0 = await page.evaluate(() => window.scrollY);
      await touchDrag(cdp, [{ x: b.x + 10, y: b.y + 10 }, { x: b.x + b.width - 10, y: b.y + b.height - 10 }], { durationMs: 200 });
      await frames(page, 3);
      const st = await page.evaluate(() => ({ v: document.querySelector('#g-color').value, y: window.scrollY, c: window.__cp.change,
        open: !!document.querySelector('body > .td-color-panel') }));
      expect(st.v !== v0 && /^#[0-9a-f]{6}$/.test(st.v), `value ${v0} → ${st.v}`);
      expect(st.y === y0, `page scrolled ${y0} → ${st.y}`);
      expect(st.c === 1, `${st.c} change events`);
      expect(st.open, 'the popup closed on a drag');
    });
    await it(tag, 'color picker: a vertical swipe starting on the presets pans natively (the popup scrolls, nothing picked)', async () => {
      await openColor();
      // a short popup (forced through CSSOM) that has to scroll; its scroll is contained (overscroll-behavior), the page stays
      const top0 = await page.evaluate(() => {
        const p = document.querySelector('body > .td-color-panel');
        p.style.setProperty('max-block-size', '140px');
        p.scrollTop = document.querySelector('.td-color-panel__presets').offsetTop - 8;
        return p.scrollTop;
      });
      await frames(page, 2);
      const ta = await page.evaluate(() => getComputedStyle(document.querySelector('.td-color-panel__preset')).touchAction);
      const b = await page.locator('.td-color-panel__preset').first().boundingBox();
      const x = b.x + b.width / 2;
      await touchDrag(cdp, [{ x, y: b.y + 4 }, { x, y: b.y + 100 }], { durationMs: 200 });
      await frames(page, 4);
      const top1 = await page.evaluate(() => document.querySelector('body > .td-color-panel').scrollTop);
      expect(ta === 'auto', `preset touch-action ${ta}`);
      expect(top1 < top0, `the popup did not scroll (${top0} → ${top1})`);
      expect(await page.evaluate(() => window.__cp.change) === 0, 'a swipe picked a preset');
    });

    // A6: sortable slop
    const list = 'td-sortable[label="Thứ tự section"]';
    const handle = `${list} [data-td-sort-item] .td-sortable__handle`;
    const sortState = () => page.evaluate((s) => [...document.querySelectorAll(`${s} [data-td-sort-item]`)].map((i) => i.getAttribute('data-td-sort-state') || '-').join(','), list);
    await it(tag, 'sortable: touch 8 px does not lift; the tap still lifts (tap-to-move)', async () => {
      await load(page);
      const pt = await centre(page, handle);
      await touchDown(cdp, pt);
      await touchMoveTo(cdp, { x: pt.x, y: pt.y + 4 });
      await touchMoveTo(cdp, { x: pt.x, y: pt.y + 8 });
      await frames(page, 2);
      expect(!(await sortState()).includes('dragging'), 'dragging under the touch slop');
      await touchUp(cdp);
      await page.waitForFunction((s) => !!document.querySelector(`${s} [data-td-sort-state="lifted"]`), list, { timeout: 2000 }).catch(() => {});
      expect((await sortState()).includes('lifted'), `the tap did not lift (${await sortState()})`);
      await page.keyboard.press('Escape');
    });
    await it(tag, 'sortable: touch 14 px drags; the click after it is swallowed (no lift)', async () => {
      await load(page);
      const pt = await centre(page, handle);
      await touchDown(cdp, pt);
      await touchMoveTo(cdp, { x: pt.x, y: pt.y + 7 });
      await touchMoveTo(cdp, { x: pt.x, y: pt.y + 14 });
      await frames(page, 2);
      expect((await sortState()).includes('dragging'), `not dragging at 14 px (${await sortState()})`);
      await touchUp(cdp);
      await frames(page, 4);
      expect(!(await sortState()).includes('lifted'), 'the drag\'s click lifted the item');
    });
    await it(tag, 'sortable: mouse 5 px drags (mouse slop 4, unchanged)', async () => {
      await load(page);
      const pt = await centre(page, handle);
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      await page.mouse.move(pt.x, pt.y + 5);
      await frames(page, 2);
      const s = await sortState();
      await page.mouse.up();
      expect(s.includes('dragging'), `mouse 5 px did not drag (${s})`);
    });
    await it(tag, 'sortable: a vertical swipe on the item BODY scrolls the page, never lifts', async () => {
      await load(page);
      const item = `${list} [data-td-sort-item]`;
      await page.locator(item).first().scrollIntoViewIfNeeded();
      const b = await page.locator(item).first().boundingBox();
      const y0 = await page.evaluate(() => window.scrollY);
      const pt = { x: Math.round(b.x + b.width * 0.75), y: Math.round(b.y + b.height / 2) };
      await touchDrag(cdp, [pt, { x: pt.x, y: Math.min(pt.y + 260, 830) }], { durationMs: 300 }); // finger down → page up
      await page.waitForFunction((y) => window.scrollY < y - 50, y0, { timeout: 3000 }).catch(() => {});
      const y1 = await page.evaluate(() => window.scrollY);
      const s = await sortState();
      expect(y1 < y0 - 50, `page did not scroll (${y0} → ${y1})`);
      expect(!s.includes('dragging') && !s.includes('lifted'), `item state ${s}`);
    });

    // v0.43.0 (plan M7): td-media-gallery — a touch drag on the handle reorders (one change), tap-to-move, and a
    // vertical swipe on the tile body scrolls the page (touch-action only on the handle)
    const gal = '#rsp-gallery';
    const galIds = () => page.evaluate((s) => document.querySelector(s).value.join(','), gal);
    const galChanges = () => page.evaluate((s) => {
      const g = document.querySelector(s);
      window.__galChanges = [];
      g.addEventListener('change', (e) => window.__galChanges.push(e.detail.reason));
    }, gal);
    await it(tag, 'gallery: a touch drag on the handle (past the slop) reorders, ONE change on drop', async () => {
      await load(page);
      await page.locator(`${gal} .td-media-gallery__item`).first().scrollIntoViewIfNeeded();
      await galChanges();
      const from = await centre(page, `${gal} .td-media-gallery__item:nth-child(1) .td-media-gallery__handle`);
      const to = await centre(page, `${gal} .td-media-gallery__item:nth-child(2) .td-media-gallery__media`);
      await touchDrag(cdp, [from, { x: from.x + 12, y: from.y }, to], { durationMs: 400 });
      await frames(page, 4);
      const ids = await galIds();
      expect(ids.startsWith('m2,m1'), `order after the drag: ${ids}`);
      expect(JSON.stringify(await page.evaluate(() => window.__galChanges)) === '["reorder"]', 'not exactly one change (reorder)');
    });
    await it(tag, 'gallery: tap a handle, tap another handle → moved there (tap-to-move)', async () => {
      await load(page);
      await page.locator(`${gal} .td-media-gallery__item`).first().scrollIntoViewIfNeeded();
      const a = await centre(page, `${gal} .td-media-gallery__item:nth-child(3) .td-media-gallery__handle`);
      await page.touchscreen.tap(a.x, a.y);
      await frames(page, 2);
      const b = await centre(page, `${gal} .td-media-gallery__item:nth-child(1) .td-media-gallery__handle`);
      await page.touchscreen.tap(b.x, b.y);
      await frames(page, 2);
      expect((await galIds()).startsWith('m3,m1,m2'), `order: ${await galIds()}`);
    });
    await it(tag, 'gallery: a vertical swipe on the tile image scrolls the page, never lifts', async () => {
      await load(page);
      const media = `${gal} .td-media-gallery__item:nth-child(1) .td-media-gallery__media`;
      await page.locator(media).scrollIntoViewIfNeeded();
      const b = await page.locator(media).boundingBox();
      const y0 = await page.evaluate(() => window.scrollY);
      const pt = { x: Math.round(b.x + b.width * 0.3), y: Math.round(b.y + b.height * 0.6) };
      await touchDrag(cdp, [pt, { x: pt.x, y: Math.min(pt.y + 260, 830) }], { durationMs: 300 });
      await page.waitForFunction((y) => window.scrollY < y - 50, y0, { timeout: 3000 }).catch(() => {});
      const y1 = await page.evaluate(() => window.scrollY);
      const st = await page.evaluate((s) => [...document.querySelectorAll(`${s} [data-td-sort-state]`)].length, gal);
      expect(y1 < y0 - 50, `page did not scroll (${y0} → ${y1})`);
      expect(st === 0, 'a tile lifted / dragged');
    });

    // v0.49.0 td-choice-group + number stepper
    await it(tag, 'choice: a tap selects at once (one input + change), pressed while the finger is down, hover not sticky', async () => {
      await load(page);
      const sel = '#rsp-choice .td-choice__option[data-td-value="128"]';
      await page.evaluate(() => { window.__cg = []; const el = document.querySelector('#rsp-choice'); for (const t of ['input', 'change']) el.addEventListener(t, (e) => window.__cg.push(`${t}:${e.detail.value}`)); });
      const pt = await centre(page, sel);
      const face = `${sel} .td-choice__face`;
      const rest = await bgOf(page, face);
      await touchDown(cdp, pt);
      await frames(page, 2);
      const pressed = await page.evaluate(([s, f]) => ({ attr: document.querySelector(s).hasAttribute('data-td-pressed'), img: getComputedStyle(document.querySelector(f)).backgroundImage }), [sel, face]);
      const want = await tokenColour(page, '--td-color-pressed');
      expect(pressed.attr && pressed.img.includes(want), `pressed look missing: ${JSON.stringify(pressed)} (want ${want})`);
      await touchUp(cdp);
      await page.waitForFunction(() => document.querySelector('#rsp-choice').value === '128', null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({ value: document.querySelector('#rsp-choice').value, log: window.__cg.join(',') }));
      expect(st.value === '128' && st.log === 'input:128,change:128', `tap: ${JSON.stringify(st)}`);
      await quiet(page, sel);
      const h = await centre(page, '#root h2');
      await page.touchscreen.tap(h.x, h.y);
      await quiet(page, sel);
      const unchecked = '#rsp-choice .td-choice__option[data-td-value="512"] .td-choice__face';
      expect(rest.split(' | ')[1] === 'none' && (await bgOf(page, unchecked)).split(' | ')[1] === 'none', 'a pressed / hover layer stuck after the tap');
    });
    await it(tag, 'choice: a vertical swipe starting on the options scrolls the page, selects nothing', async () => {
      await load(page);
      const sel = '#rsp-choice-long .td-choice__option';
      const pt = await centre(page, sel);
      const y0 = await page.evaluate(() => window.scrollY);
      await touchDrag(cdp, [pt, { x: pt.x, y: Math.max(pt.y - 260, 10) }], { durationMs: 300 });
      await page.waitForFunction((y) => window.scrollY > y + 50, y0, { timeout: 3000 }).catch(() => {});
      const y1 = await page.evaluate(() => window.scrollY);
      expect(y1 > y0 + 50, `page did not scroll (${y0} → ${y1})`);
      expect(await page.evaluate(() => document.querySelector('#rsp-choice-long').value) === '', 'a swipe selected an option');
    });
    await it(tag, 'stepper: five quick taps on + = +5, no zoom (touch-action manipulation), the field never takes the focus', async () => {
      await load(page);
      await page.evaluate(() => {
        const el = document.querySelector('#rsp-stepper');
        el.setAttribute('max', '20');
        window.__st = 0;
        el.addEventListener('change', () => { window.__st += 1; });
      });
      const pt = await centre(page, '#rsp-stepper .td-number__step--up');
      const ta = await page.evaluate(() => getComputedStyle(document.querySelector('#rsp-stepper .td-number__step--up')).touchAction);
      expect(ta === 'manipulation', `touch-action ${ta}`);
      for (let i = 0; i < 5; i++) await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction(() => document.querySelector('#rsp-stepper').value === '6', null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({ value: document.querySelector('#rsp-stepper').value, changes: window.__st,
        scale: window.visualViewport ? window.visualViewport.scale : 1, focused: document.activeElement?.classList.contains('td-number__control') || false }));
      expect(st.value === '6' && st.changes === 5, `taps: ${JSON.stringify(st)}`);
      expect(Math.abs(st.scale - 1) < 0.01, `zoomed: scale ${st.scale}`);
      expect(!st.focused, 'a tap on + focused the field (virtual keyboard)');
    });

    // v0.55.0 affix boxes (td-input-field + td-number-input)
    await it(tag, 'affix: box ≥ 44 px + text ≥ 16 px; a tap on an affix focuses the control, a tap on a slot button does not; inputmode', async () => {
      await load(page);
      const m = await page.evaluate(() => {
        const px = (el) => parseFloat(getComputedStyle(el).fontSize);
        return ['#rsp-affix-site', '#rsp-affix-pw', '#rsp-affix-num'].map((id) => {
          const el = document.querySelector(id);
          const box = el.querySelector('.td-field__box, .td-number__box');
          const ctl = box.querySelector('input');
          const aff = box.querySelector(':scope > [class*="__affix--"]:not([class*="--slot"])');
          return { id, h: box.getBoundingClientRect().height, ctl: px(ctl), aff: aff ? px(aff) : 16, mode: ctl.getAttribute('inputmode') };
        });
      });
      for (const r of m) expect(r.h >= 44 - 0.5 && r.ctl >= 16 && r.aff >= 16, `affix box on touch: ${JSON.stringify(r)}`);
      expect(m[2].mode === 'decimal', `number inputmode ${m[2].mode}`);
      const pt = await centre(page, '#rsp-affix-site .td-field__affix--prefix');
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction(() => document.activeElement?.closest('#rsp-affix-site') != null, null, { timeout: 2000 }).catch(() => {});
      const f1 = await page.evaluate(() => document.activeElement === document.querySelector('#rsp-affix-site .td-field__control'));
      expect(f1, 'a tap on the prefix did not focus the control');
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.__slot = 0;
        document.querySelector('#rsp-affix-pw .rsp-affix-btn').addEventListener('click', () => { window.__slot += 1; });
      });
      const b = await centre(page, '#rsp-affix-pw .rsp-affix-btn');
      await page.touchscreen.tap(b.x, b.y);
      await page.waitForFunction(() => window.__slot === 1, null, { timeout: 2000 }).catch(() => {});
      const st = await page.evaluate(() => ({ clicks: window.__slot,
        control: document.activeElement === document.querySelector('#rsp-affix-pw .td-field__control') }));
      expect(st.clicks === 1 && !st.control, `slot button tap: ${JSON.stringify(st)}`);
    });

    // v0.58.0 floating labels (QĐ 6, 6b, 6c — Codex plan r1 #3, r2 #5)
    await it(tag, 'floating: field ≥ 44 px + value ≥ 16 px; a tap on the resting / raised label focuses the control; a tap on the value text hits the control', async () => {
      await load(page);
      const m = await page.evaluate(() => ['#rsp-fl-empty', '#rsp-fl-value', '#rsp-fl-date', '#rsp-fl-prefix'].map((id) => {
        const el = document.querySelector(id);
        const ctl = el.querySelector('.td-field__control');
        const field = el.querySelector('.td-field__box') || ctl;
        const label = el.querySelector('.td-field > .td-field__label');
        const cs = getComputedStyle(field);
        const f = field.getBoundingClientRect();
        return { id, h: f.height, fs: parseFloat(getComputedStyle(ctl).fontSize), labelBottom: label.getBoundingClientRect().bottom,
          valueTop: f.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), raised: getComputedStyle(label).transform !== 'none' };
      }));
      for (const r of m) {
        expect(r.h >= 44 - 0.5 && r.fs >= 16, `floating field on touch: ${JSON.stringify(r)}`);
        if (r.raised) expect(r.labelBottom <= r.valueTop - 0.5, `raised label over the value line on touch: ${JSON.stringify(r)}`);
      }
      for (const id of ['#rsp-fl-empty', '#rsp-fl-value']) {
        await page.evaluate(() => document.activeElement?.blur());
        await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), id);
        const pt = await centre(page, `${id} .td-field > .td-field__label`);
        await page.touchscreen.tap(pt.x, pt.y);
        await page.waitForFunction((s) => document.activeElement === document.querySelector(`${s} .td-field__control`), id, { timeout: 2000 }).catch(() => {});
        const ok = await page.evaluate((s) => document.activeElement === document.querySelector(`${s} .td-field__control`), id);
        expect(ok, `${id}: a tap on the label did not focus the control`);
      }
      const hit = await page.evaluate(() => {
        const el = document.querySelector('#rsp-fl-value');
        const ctl = el.querySelector('.td-field__control');
        const cs = getComputedStyle(ctl);
        const r = ctl.getBoundingClientRect();
        const y = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) + 2;
        return [0.2, 0.5, 0.8].every((fx) => document.elementFromPoint(r.left + r.width * fx, y) === ctl);
      });
      expect(hit, 'value-line points do not hit the control on touch');
    });

    // v0.59.0 the date clear button + the "Không hạn" toggle
    await it(tag, 'date clear: ≥ 44 × 44, pressed while down, a tap clears (one change, focus on the trigger, no dialog)', async () => {
      await load(page);
      const sel = '#rsp-dtp-clear .td-dtp__clear';
      await page.evaluate((s) => {
        document.querySelector(s).scrollIntoView({ block: 'center' });
        window.__dc = 0;
        document.querySelector('#rsp-dtp-clear').addEventListener('change', () => { window.__dc += 1; });
      }, sel);
      const size = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.width, r.height]; }, sel);
      expect(size[0] >= 43.5 && size[1] >= 43.5, `clear button ${size.join('×')}`);
      const pt = await centre(page, sel);
      await touchDown(cdp, pt);
      await frames(page, 2);
      const pressed = await has(sel);
      await touchUp(cdp);
      expect(pressed, 'no pressed state while the finger is down');
      await page.waitForFunction(() => window.__dc === 1, null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({ changes: window.__dc, value: document.querySelector('#rsp-dtp-clear').getValue(),
        focus: document.activeElement === document.querySelector('#rsp-dtp-clear .td-dtp__trigger'),
        dialog: !!document.querySelector('body > .td-modal:not([data-state="closing"])') }));
      expect(st.changes === 1 && st.value === '' && st.focus && !st.dialog, `clear tap: ${JSON.stringify(st)}`);
    });
    // v0.59.1 label-position="start": one hit box (label + control), a tap on the label changes it once
    await it(tag, 'label-position start: hit box ≥ 44 px, pressed while down on the label, a tap on the label = one change', async () => {
      await load(page);
      for (const [host, part, track] of [['#rsp-lp-head', '.td-switch__label', '.td-switch__track'], ['#rsp-lp-checkbox', '.td-checkbox__label', '.td-checkbox__mark']]) {
        const info = await page.evaluate(([h, p]) => {
          const el = document.querySelector(h);
          el.scrollIntoView({ block: 'center' });
          window.__lp = [];
          el.addEventListener('change', (e) => window.__lp.push(e.detail.checked));
          const box = el.querySelector('label').getBoundingClientRect();
          const l = el.querySelector(p).getBoundingClientRect();
          return { w: box.width, h: box.height, before: el.checked, labelLeft: l.left, boxLeft: box.left };
        }, [host, part]);
        expect(info.w >= 43.5 && info.h >= 43.5, `${host}: hit box ${info.w}×${info.h}`);
        expect(Math.abs(info.labelLeft - info.boxLeft) <= 0.6, `${host}: the label is not on the start edge of the hit box`);
        const pt = await centre(page, `${host} ${part}`);
        await touchDown(cdp, pt);
        await frames(page, 2);
        const pressed = await page.evaluate(([h, t]) => {
          const el = document.querySelector(h);
          return el.querySelector('label').matches(':active, [data-td-pressed]') && getComputedStyle(el.querySelector(t)).backgroundImage.includes('gradient');
        }, [host, track]);
        await touchUp(cdp);
        expect(pressed, `${host}: no pressed look on the control while the finger is on the label`);
        await page.waitForFunction(() => window.__lp.length === 1, null, { timeout: 3000 }).catch(() => {});
        const st = await page.evaluate((h) => ({ changes: window.__lp, checked: document.querySelector(h).checked }), host);
        expect(st.changes.length === 1 && st.checked === !info.before, `${host}: label tap ${JSON.stringify(st)} (was ${info.before})`);
      }
    });
    // v0.60.0 the calendar bottom sheet (< 720: this lane is 390 wide)
    await it(tag, 'calendar sheet: day cells ≥ 44 × 44, ‹ › press without zoom, a day tap commits ONE change and closes, focus back on the trigger', async () => {
      await load(page);
      await page.evaluate(() => {
        const host = document.querySelector('#rsp-dtp-date') || document.querySelector('[id$="-dtp-date"]');
        window.__calHost = host;
        host.scrollIntoView({ block: 'center' });
        window.__cc = [];
        host.addEventListener('change', (e) => window.__cc.push(e.detail));
      });
      const t = await centre(page, '[id$="-dtp-date"] .td-dtp__trigger');
      await page.touchscreen.tap(t.x, t.y);
      await page.waitForSelector('.td-modal[data-state="open"] .td-cal', { timeout: 4000 });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.td-modal[data-state="open"] .td-cal__day[data-date]')].slice(0, 14).map((c) => { const r = c.getBoundingClientRect(); return [r.width, r.height]; }));
      expect(sizes.every(([w, h]) => w >= 43.5 && h >= 43.5), `day cells ${JSON.stringify(sizes.slice(0, 3))}…`);
      const nav = await page.evaluate(() => { const n = document.querySelector('.td-modal[data-state="open"] .td-cal__nav'); const r = n.getBoundingClientRect(); return { w: r.width, h: r.height, ta: getComputedStyle(n).touchAction }; });
      expect(nav.w >= 43.5 && nav.h >= 43.5 && nav.ta === 'manipulation', `nav ${JSON.stringify(nav)}`);
      const next = await centre(page, '.td-modal[data-state="open"] .td-cal__nav[data-dir="next"]');
      await touchDown(cdp, next);
      await frames(page, 2);
      const pressed = await has('.td-modal[data-state="open"] .td-cal__nav[data-dir="next"]');
      await touchUp(cdp);
      expect(pressed, 'no pressed state on ‹ › while the finger is down');
      const day = await centre(page, '.td-modal[data-state="open"] .td-cal__day[data-date$="-20"]:not([data-outside])');
      await page.touchscreen.tap(day.x, day.y);
      await page.waitForFunction(() => !document.querySelector('.td-modal[data-state="open"]'), null, { timeout: 4000 }).catch(() => {});
      const st = await page.evaluate(() => ({ changes: window.__cc.length, focus: document.activeElement === window.__calHost.querySelector('.td-dtp__trigger'),
        dialog: !!document.querySelector('.td-modal[data-state="open"]') })); // (a sheet fading out still holds its tree)
      expect(st.changes === 1 && st.focus && !st.dialog, `day tap: ${JSON.stringify(st)}`);
    });
    await it(tag, 'datetime in two screens (v0.61.0): a day tap opens the TIME screen; a swipe on the hour wheel keeps momentum + snaps, never scrolls the page / chains, no input to focus; "Chọn" commits ONE change', async () => {
      await load(page);
      await page.evaluate(() => {
        const host = document.querySelector('#rsp-dtp-clear');
        host.scrollIntoView({ block: 'center' });
        window.__dtc = [];
        host.addEventListener('change', (e) => window.__dtc.push(e.detail));
      });
      const t = await centre(page, '#rsp-dtp-clear .td-dtp__trigger');
      await page.touchscreen.tap(t.x, t.y);
      await page.waitForSelector('.td-modal[data-state="open"] .td-cal', { timeout: 4000 });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
      const day = await centre(page, '.td-modal[data-state="open"] .td-cal__day[tabindex="0"]');
      await page.touchscreen.tap(day.x, day.y);
      await page.waitForSelector('.td-modal[data-state="open"] .td-time-step:not([hidden])', { timeout: 3000 });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
      const before = await page.evaluate(() => {
        const list = document.querySelector('.td-modal[data-state="open"] .td-dtp-wheel__list[data-part="hour"]');
        const opt = list.querySelector('[aria-selected="true"]');
        const back = document.querySelector('.td-modal[data-state="open"] [data-action="back"]').getBoundingClientRect();
        return { hour: Number(opt.dataset.value), optH: opt.getBoundingClientRect().height, ta: getComputedStyle(list).touchAction, oc: getComputedStyle(list).overscrollBehaviorY,
          back: [back.width, back.height], scrollY: window.scrollY, body: document.querySelector('.td-modal[data-state="open"] .td-modal__body').scrollTop, inputs: document.querySelectorAll('.td-modal[data-state="open"] input, .td-modal[data-state="open"] textarea').length };
      });
      expect(before.optH >= 43.5 && before.back[0] >= 43.5 && before.back[1] >= 43.5, `targets: option ${before.optH}, back ${before.back}`);
      expect(before.ta === 'pan-y' && before.oc === 'contain' && before.inputs === 0, `wheel touch-action ${before.ta}, overscroll ${before.oc}, inputs ${before.inputs}`);
      const w = await centre(page, '.td-modal[data-state="open"] .td-dtp-wheel__list[data-part="hour"]');
      await touchDrag(cdp, [{ x: w.x, y: w.y + 70 }, { x: w.x, y: w.y - 70 }], { durationMs: 160 }); // a quick upward flick → momentum
      await page.waitForFunction((h) => {
        const list = document.querySelector('.td-modal[data-state="open"] .td-dtp-wheel__list[data-part="hour"]');
        return Number(list.querySelector('[aria-selected="true"]').dataset.value) !== h;
      }, before.hour, { timeout: 4000 }).catch(() => {});
      await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
      const after = await page.evaluate(() => {
        const list = document.querySelector('.td-modal[data-state="open"] .td-dtp-wheel__list[data-part="hour"]');
        const o = list.querySelector('[aria-selected="true"]');
        return { hour: Number(o.dataset.value), off: Math.abs(o.offsetTop + o.offsetHeight / 2 - list.scrollTop - list.clientHeight / 2), scrollY: window.scrollY,
          body: document.querySelector('.td-modal[data-state="open"] .td-modal__body').scrollTop, changes: window.__dtc.length, input: ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) };
      });
      expect(after.hour !== before.hour && after.off < 2, `the hour moved ${before.hour} → ${after.hour}, snapped (off ${after.off})`);
      expect(after.scrollY === before.scrollY && after.body === before.body && after.changes === 0 && !after.input, `no chaining / no change / no keyboard: ${JSON.stringify(after)}`);
      const ok = await centre(page, '.td-modal[data-state="open"] .td-modal__footer [data-action="confirm"]');
      await page.touchscreen.tap(ok.x, ok.y);
      await page.waitForFunction(() => !document.querySelector('.td-modal[data-state="open"]'), null, { timeout: 4000 }).catch(() => {});
      const fin = await page.evaluate(() => ({ changes: window.__dtc.length, open: !!document.querySelector('.td-modal[data-state="open"]') }));
      expect(fin.changes === 1 && !fin.open, `"Chọn" ${JSON.stringify(fin)}`);
    });
    await it(tag, 'range calendar (v0.61.0): day cells ≥ 44 × 44, a tap on Từ then Đến paints the band, "Không hạn" ≥ 44 px tall and a tap empties the end (aria-pressed)', async () => {
      await load(page);
      await page.evaluate(() => document.querySelector('#rsp-dtr-open').setAttribute('end', '05/10/2026'));
      const t = await centre(page, '#rsp-dtr-open .td-dtr__trigger');
      await page.touchscreen.tap(t.x, t.y);
      await page.waitForSelector('.td-dtr-panel__open-end', { state: 'attached', timeout: 4000 });
      await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.td-modal[data-state="open"] .td-cal__day[data-date]')].slice(0, 14).map((c) => { const r = c.getBoundingClientRect(); return [r.width, r.height]; }));
      expect(sizes.every(([w, h]) => w >= 43.5 && h >= 43.5), `range day cells ${JSON.stringify(sizes.slice(0, 3))}…`);
      const a = await centre(page, '.td-modal[data-state="open"] .td-cal__day[data-date="2026-10-06"]');
      await page.touchscreen.tap(a.x, a.y);
      const z = await centre(page, '.td-modal[data-state="open"] .td-cal__day[data-date="2026-10-09"]');
      await page.touchscreen.tap(z.x, z.y);
      const band = await page.evaluate(() => ({
        roles: ['06', '07', '08', '09'].map((d) => document.querySelector(`.td-modal[data-state="open"] .td-cal__day[data-date="2026-10-${d}"]`).getAttribute('data-range')),
        preview: document.querySelectorAll('.td-modal[data-state="open"] .td-cal__day[data-preview]').length,
      }));
      expect(band.roles.join() === 'start,in,in,end' && band.preview === 0, `tap band ${JSON.stringify(band)}`);
      const sel = '.td-dtr-panel__open-end';
      const h = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().height, sel);
      expect(h >= 43.5, `"Không hạn" ${h} px tall`);
      const pt = await centre(page, sel);
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'true', sel, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate((s) => ({ pressed: document.querySelector(s).getAttribute('aria-pressed'),
        end: document.querySelector('.td-dtr-panel__tab[data-side="end"] .td-dtr-panel__tab-value').textContent }), sel);
      expect(st.pressed === 'true' && st.end === 'Không hạn', `"Không hạn" tap: ${JSON.stringify(st)}`);
      await page.evaluate(async () => { (await import('/src/feedback/td-modal.js')).TdModal.closeAll(); });
    });

    // v0.52.0 segmented (size sm, icon-only) + locked switch
    // v0.53.1: the sidebar rail (216 px, fit — inline) and the 140 px rail (stacked, overflowing on a coarse pointer)
    for (const [id, want] of [['#rsp-seg-side', 'light'], ['#rsp-seg-140', 'light']]) {
      await it(tag, `segmented ${id} (v0.53.1): every segment ≥ 44 × 44, a tap selects at once, the page does not move sideways`, async () => {
        await load(page);
        const st0 = await page.evaluate((s) => {
          const el = document.querySelector(s);
          el.scrollIntoView({ block: 'center' });
          return { sizes: [...el.querySelectorAll('.td-choice__face')].map((f) => { const r = f.getBoundingClientRect(); return [r.width, r.height]; }),
            layout: el.querySelector('.td-choice__options').getAttribute('data-layout'), sx: window.scrollX };
        }, id);
        expect(st0.sizes.every(([w, h]) => w >= 43.5 && h >= 43.5), `${id} segments ${JSON.stringify(st0.sizes)}`);
        expect(['equal', 'fit', 'stacked'].includes(st0.layout), `${id} data-layout ${st0.layout}`);
        const sel = `${id} .td-choice__option[data-td-value="${want}"]`;
        const pt = await centre(page, sel);
        await page.touchscreen.tap(pt.x, pt.y);
        await page.waitForFunction(([s, v]) => document.querySelector(s).value === v, [id, want], { timeout: 3000 }).catch(() => {});
        const st = await page.evaluate((s) => ({ value: document.querySelector(s).value, sx: window.scrollX,
          over: document.documentElement.scrollWidth > window.innerWidth }), id);
        expect(st.value === want && st.sx === st0.sx && !st.over, `${id} tap: ${JSON.stringify(st)}`);
      });
    }
    await it(tag, 'segmented sm icon-only: every segment ≥ 44 × 44, a tap selects at once (one input + change), nothing stuck', async () => {
      await load(page);
      const sizes = await page.evaluate(() => [...document.querySelectorAll('#rsp-seg-sm .td-choice__face')]
        .map((f) => { const r = f.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }));
      expect(sizes.length === 3 && sizes.every(([w, h]) => w >= 44 && h >= 44), `segments ${JSON.stringify(sizes)}`);
      await page.evaluate(() => { window.__sg = []; const el = document.querySelector('#rsp-seg-sm'); for (const t of ['input', 'change']) el.addEventListener(t, (e) => window.__sg.push(`${t}:${e.detail.value}`)); });
      const sel = '#rsp-seg-sm .td-choice__option[data-td-value="light"]';
      const pt = await centre(page, sel);
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction(() => document.querySelector('#rsp-seg-sm').value === 'light', null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({ value: document.querySelector('#rsp-seg-sm').value, log: window.__sg.join(',') }));
      expect(st.value === 'light' && st.log === 'input:light,change:light', `tap: ${JSON.stringify(st)}`);
      await quiet(page, sel);
      expect((await bgOf(page, `${sel} .td-choice__face`)).split(' | ')[1] === 'none', 'a pressed layer stuck after the tap');
    });
    await it(tag, 'locked switch: a tap does not flip it, no change, no pressed layer while the finger is down', async () => {
      await load(page);
      await page.evaluate(() => { window.__lk = 0; document.querySelector('#rsp-tfa-locked').addEventListener('change', () => { window.__lk += 1; }); });
      const sel = '#rsp-tfa-locked .td-switch__track';
      const pt = await centre(page, sel);
      await touchDown(cdp, pt);
      await frames(page, 2);
      const img = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundImage, sel);
      await touchUp(cdp);
      await frames(page, 4);
      const st = await page.evaluate(() => ({ on: document.querySelector('#rsp-tfa-locked').checked, changes: window.__lk }));
      expect(img === 'none', `pressed layer on a locked switch: ${img}`);
      expect(st.on === true && st.changes === 0, `locked tap: ${JSON.stringify(st)}`);
    });

    // v0.53.0 (plan v0.53.0-menu-custom-item M4): the account menu PANEL — segmented row in a TdMenu custom item
    await it(tag, 'menu panel: segmented segments ≥ 44 × 44, a tap selects, the panel stays open, no pressed fill on the row, a tap outside closes', async () => {
      await load(page);
      await page.evaluate(() => document.querySelector('#rsp-menu-panel').scrollIntoView({ block: 'start' }));
      const trig = await centre(page, '#rsp-menu-panel button');
      await page.touchscreen.tap(trig.x, trig.y);
      await page.waitForFunction(() => !!document.querySelector('body > .td-menu--panel td-choice-group .td-choice__face'), null, { timeout: 3000 });
      const sizes = await page.evaluate(() => [...document.querySelectorAll('body > .td-menu--panel .td-choice__face')]
        .map((f) => { const r = f.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }));
      expect(sizes.length === 3 && sizes.every(([w, h]) => w >= 44 && h >= 44), `segments ${JSON.stringify(sizes)}`);
      await page.evaluate(() => { window.__mp = []; document.querySelector('body > .td-menu--panel td-choice-group').addEventListener('change', (e) => window.__mp.push(e.detail.value)); });
      const sel = 'body > .td-menu--panel .td-choice__option[data-td-value="dark"]';
      const pt = await centre(page, sel);
      await touchDown(cdp, pt);
      await frames(page, 2);
      const rowBg = await page.evaluate(() => getComputedStyle(document.querySelector('body > .td-menu--panel .td-menu__custom[data-item="theme"]')).backgroundColor);
      await touchUp(cdp);
      await page.waitForFunction(() => window.__mp.length === 1, null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({ log: window.__mp.join(','), open: !!document.querySelector('body > .td-menu--panel') }));
      expect(st.log === 'dark' && st.open, `tap: ${JSON.stringify(st)}`);
      expect(rowBg === 'rgba(0, 0, 0, 0)', `custom row got a pressed / hover fill: ${rowBg}`);
      await quiet(page, sel);
      expect((await bgOf(page, `${sel} .td-choice__face`)).split(' | ')[1] === 'none', 'a pressed layer stuck after the tap');
      const box = await page.evaluate(() => { const r = document.querySelector('body > .td-menu--panel').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      const outsideY = box.top > 80 ? Math.round(box.top / 2) : Math.round((box.bottom + page.viewportSize().height) / 2);
      await page.touchscreen.tap(8, outsideY);
      await frames(page, 2);
      expect(!(await page.evaluate(() => !!document.querySelector('body > .td-menu--panel'))), 'a tap outside did not close the panel');
    });

    await it(tag, 'copy: two quick taps while the copy is pending = one state change', async () => {
      await load(page);
      await page.evaluate(() => {
        window.__copyStates = [];
        const btn = document.querySelector('td-copy .td-copy');
        new MutationObserver(() => {
          const s = btn.getAttribute('data-state') || 'idle';
          if (window.__copyStates[window.__copyStates.length - 1] !== s) window.__copyStates.push(s);
        }).observe(btn, { attributes: true, attributeFilter: ['data-state'] });
      });
      const pt = await centre(page, 'td-copy .td-copy');
      await page.touchscreen.tap(pt.x, pt.y);
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction(() => window.__copyStates.length > 0);
      await frames(page, 6);
      const states = await page.evaluate(() => window.__copyStates);
      expect(states.length === 1, `state changes: ${states.join(',')}`);
    });

    await it(tag, 'masked-value: rapid repeated taps while reveal() is pending = one reveal, one state change', async () => {
      await load(page);
      await page.evaluate(() => {
        const el = document.querySelector('td-masked-value');
        window.__reveals = 0; window.__revealedEvents = 0; window.__textStates = [];
        el.reveal = () => { window.__reveals += 1; return new Promise((r) => { window.__resolveReveal = () => r('0912 345 123'); }); };
        el.addEventListener('revealed', () => { window.__revealedEvents += 1; });
        new MutationObserver(() => {
          const st = el.querySelector('.td-masked__text')?.getAttribute('data-state') || 'masked';
          if (window.__textStates[window.__textStates.length - 1] !== st) window.__textStates.push(st);
        }).observe(el, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
      });
      const pt = await centre(page, 'td-masked-value .td-masked__toggle');
      for (let i = 0; i < 3; i++) await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForFunction(() => window.__reveals >= 1 && typeof window.__resolveReveal === 'function');
      await page.evaluate(() => window.__resolveReveal());
      await page.waitForFunction(() => document.querySelector('td-masked-value').revealed);
      await frames(page, 2);
      const r = await page.evaluate(() => [window.__reveals, window.__revealedEvents, window.__textStates.join(',')]);
      expect(r[0] === 1 && r[1] === 1 && r[2] === 'masked,revealed', `reveal() ×${r[0]}, revealed ×${r[1]}, text states ${r[2]}`); // masked → revealed once
    });

    /** wait until a value read in the page stops changing (6 frames) — a scroll / fling is over */
    const stable = (fn, arg) => page.evaluate(async ([src, a]) => {
      const f = new Function('a', `return (${src})(a)`);
      let last = f(a); let same = 0;
      for (let i = 0; i < 240 && same < 6; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const v = f(a);
        same = v === last ? same + 1 : 0;
        last = v;
      }
      return last;
    }, [fn.toString(), arg]);

    await it(tag, 'table: a sideways swipe starting on a sort header scrolls, never sorts', async () => {
      await load(page);
      const scroller = '#rsp-table-scroll .td-table__scroll';
      await page.locator(scroller).scrollIntoViewIfNeeded();
      await page.evaluate(() => { window.__sorts = 0; document.querySelector('#rsp-table-scroll').addEventListener('sort-change', () => { window.__sorts += 1; }); });
      const pt = await centre(page, '#rsp-table-scroll .td-table__sort');
      const x0 = await page.evaluate((s) => document.querySelector(s).scrollLeft, scroller);
      await touchDrag(cdp, [{ x: Math.min(pt.x + 150, 370), y: pt.y }, { x: 40, y: pt.y }], { durationMs: 300 });
      const x1 = await stable((s) => document.querySelector(s).scrollLeft, scroller);
      expect(x1 > x0 + 20, `table did not scroll (${x0} → ${x1})`);
      expect(await page.evaluate(() => window.__sorts) === 0, 'a swipe sorted the table');
    });

    await it(tag, 'table tree (v0.57.0): toggle is a real 44 × 44 target; a tap on the row body never opens / closes, a tap on the toggle does', async () => {
      await load(page);
      const host = '#rsp-table-tree';
      await page.locator(host).scrollIntoViewIfNeeded();
      const box = await page.evaluate((h) => {
        const r = document.querySelector(`${h} .td-table__tree-toggle`).getBoundingClientRect();
        return { w: r.width, h: r.height };
      }, host);
      expect(box.w >= 43.5 && box.h >= 43.5, `toggle ${box.w} × ${box.h}`);
      await page.evaluate((h) => { window.__exp = []; document.querySelector(h).addEventListener('expanded-change', (e) => window.__exp.push(e.detail.expanded)); }, host);
      const level = (sel) => page.evaluate((x) => document.querySelector(x).getAttribute('aria-expanded'), sel);
      const row1 = `${host} .td-table__body > tr[aria-level="1"]`;
      const cell = await centre(page, `${row1} [data-card="meta"]`);
      await page.touchscreen.tap(cell.x, cell.y);
      await frames(page, 3);
      expect(await level(row1) === 'true' && (await page.evaluate(() => window.__exp.length)) === 0, 'a tap on the row body changed the branch');
      const t = await centre(page, `${row1} .td-table__tree-toggle`);
      await page.touchscreen.tap(t.x, t.y);
      await frames(page, 3);
      expect(await level(row1) === 'false', 'a tap on the toggle did not close the branch');
      expect(JSON.stringify(await page.evaluate(() => window.__exp)) === '[false]', 'expanded-change not fired once');
    });

    await it(tag, 'tabs: a sideways swipe on the tab strip does not switch tabs', async () => {
      await load(page);
      await page.evaluate(() => { window.__tabs = 0; document.querySelector('#rsp-tabs').addEventListener('tab-change', () => { window.__tabs += 1; }); });
      const pt = await centre(page, '#rsp-tabs .td-tabs__tab:not([aria-selected="true"])');
      await touchDrag(cdp, [{ x: Math.min(pt.x + 120, 370), y: pt.y }, { x: Math.max(pt.x - 120, 20), y: pt.y }], { durationMs: 260 });
      await frames(page, 4);
      expect(await page.evaluate(() => window.__tabs) === 0, 'a swipe switched the tab');
    });

    // v0.47.0 td-check-matrix (plan M5): at 390 the grid is in its one-column mode inside a 24rem scroll box
    const matrixCell = '#rsp-matrix tr[data-r="1"] .td-check-matrix__cell[data-col-active]';
    const matrixChanges = (page) => page.evaluate(() => {
      window.__cm = [];
      document.querySelector('#rsp-matrix').addEventListener('change', (e) => { if (e instanceof CustomEvent) window.__cm.push(e.detail.trigger); });
    });
    await it(tag, 'check-matrix: a tap toggles exactly one cell (one change)', async () => {
      await load(page);
      await matrixChanges(page);
      const pt = await centre(page, matrixCell);
      const before = await page.evaluate((s) => document.querySelector(s).querySelector('input').checked, matrixCell);
      await page.touchscreen.tap(pt.x, pt.y);
      await frames(page, 2);
      expect(await page.evaluate(() => window.__cm.join(',')) === 'cell', `changes: ${await page.evaluate(() => window.__cm.join(','))}`);
      expect(await page.evaluate((s) => document.querySelector(s).querySelector('input').checked, matrixCell) === !before, 'not toggled');
    });
    await it(tag, 'check-matrix: a vertical swipe on the grid scrolls its box, never toggles a cell', async () => {
      await load(page);
      await matrixChanges(page);
      const box = '#rsp-matrix .td-check-matrix__scroll';
      const pt = await centre(page, '#rsp-matrix tr[data-r="3"] .td-check-matrix__cell[data-col-active]');
      const y0 = await page.evaluate((s) => document.querySelector(s).scrollTop, box);
      await touchDrag(cdp, [pt, { x: pt.x, y: Math.max(pt.y - 220, 20) }], { durationMs: 300 });
      const y1 = await stable((s) => document.querySelector(s).scrollTop, box);
      expect(y1 > y0 + 20, `grid did not scroll (${y0} → ${y1})`);
      expect(await page.evaluate(() => window.__cm.length) === 0, 'a swipe toggled a cell');
    });
    await it(tag, 'check-matrix: a tap on a locked cell shows its note, changes nothing', async () => {
      await load(page);
      await matrixChanges(page);
      const pt = await centre(page, '#rsp-matrix tr[data-r="0"] .td-check-matrix__cell[data-locked]');
      await page.touchscreen.tap(pt.x, pt.y);
      await frames(page, 2);
      expect(await page.evaluate(() => document.querySelector('#rsp-matrix .td-check-matrix__note').textContent) === 'Không tự sửa role của mình', 'note not shown');
      expect(await page.evaluate(() => window.__cm.length) === 0, 'a locked cell changed');
    });
    await it(tag, 'check-matrix: pressed — the cell holds data-td-pressed, its mark the pressed token', async () => {
      await load(page);
      const pt = await centre(page, matrixCell);
      const want = await tokenColour(page, '--td-color-pressed');
      await touchDown(cdp, pt);
      await frames(page, 2);
      const got = await page.evaluate((s) => {
        const cell = document.querySelector(s);
        return { attr: cell.hasAttribute('data-td-pressed'), img: getComputedStyle(cell.querySelector('.td-check')).backgroundImage };
      }, matrixCell);
      await touchCancel(cdp);
      expect(got.attr && got.img.includes(want), `pressed look missing: ${JSON.stringify(got)} (want ${want})`);
      await quiet(page, matrixCell);
      expect(await page.evaluate((s) => getComputedStyle(document.querySelector(s).querySelector('.td-check')).backgroundImage, matrixCell) === 'none', 'not back to rest');
    });

    // v0.50.0 td-carousel: native scrolling only (C12)
    const car = '#rsp-carousel';
    const carVp = `${car} .td-carousel__viewport`;
    await it(tag, 'carousel: a sideways swipe scrolls the strip, not the page; touch-action stays auto', async () => {
      await load(page);
      await page.locator(carVp).scrollIntoViewIfNeeded();
      const ta = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).touchAction, carVp);
      expect(ta === 'auto', `viewport touch-action ${ta}`);
      const pt = await centre(page, `${car} .td-carousel__slide`);
      const y0 = await page.evaluate(() => window.scrollY);
      const x0 = await page.evaluate((s) => document.querySelector(s).scrollLeft, carVp);
      await touchDrag(cdp, [{ x: 330, y: pt.y }, { x: 60, y: pt.y }], { durationMs: 300 });
      const x1 = await stable((s) => document.querySelector(s).scrollLeft, carVp);
      expect(x1 > x0 + 20, `strip did not scroll (${x0} → ${x1})`);
      expect(await page.evaluate(() => window.scrollY) === y0, 'the page scrolled vertically');
    });

    await it(tag, 'carousel: a vertical swipe STARTING on the strip scrolls the page (never trapped)', async () => {
      await load(page);
      await page.locator(carVp).scrollIntoViewIfNeeded();
      const pt = await centre(page, `${car} .td-carousel__slide`);
      const y0 = await page.evaluate(() => window.scrollY);
      const x0 = await page.evaluate((s) => document.querySelector(s).scrollLeft, carVp);
      // finger moves DOWN → the page scrolls up (the carousel section is near the end of the page)
      const start = Math.min(pt.y, 560);
      expect(await page.evaluate(([x, y, sel]) => !!document.elementFromPoint(x, y)?.closest(sel), [pt.x, start, carVp]), 'the swipe does not start on the strip');
      await touchDrag(cdp, [{ x: pt.x, y: start }, { x: pt.x, y: start + 240 }], { durationMs: 300 });
      const y1 = await stable(() => window.scrollY);
      expect(y1 < y0 - 40, `page did not scroll (${y0} → ${y1})`);
      expect(await page.evaluate((s) => document.querySelector(s).scrollLeft, carVp) === x0, 'the strip scrolled sideways');
    });

    await it(tag, 'carousel: a tap on "next" moves exactly one page; buttons and dots show the pressed state', async () => {
      await load(page);
      const nb = `${car} [data-td-carousel="next"]`;
      const pt = await centre(page, nb);
      await touchDown(cdp, pt);
      await frames(page, 2);
      expect(await has(nb), 'next: no pressed state while the finger is down');
      await touchUp(cdp);
      await stable((s) => document.querySelector(s).scrollLeft, carVp);
      const st = await page.evaluate((s) => { const h = document.querySelector(s); return [h.index, h.page]; }, car);
      expect(st[0] === 2 && st[1] === 1, `after one tap: index ${st[0]} page ${st[1]}`);
      const dot = `${car} .td-carousel__dot:nth-child(3)`;
      const dp = await centre(page, dot);
      await touchDown(cdp, dp);
      await frames(page, 2);
      expect(await has(dot), 'dot: no pressed state while the finger is down');
      await touchUp(cdp);
      await stable((s) => document.querySelector(s).scrollLeft, carVp);
      expect(await page.evaluate((s) => document.querySelector(s).page, car) === 2, 'dot 3 did not select page 3');
    });

    // cropper pinch (CDP, two real fingers) + touchcancel
    await it(tag, 'cropper: a two-finger pinch (fingers apart) shrinks the box (one crop-change, source pinch); touchcancel ends cleanly', async () => {
      await load(page);
      await page.locator('#rsp-cropper[data-state="ready"]').waitFor();
      await page.evaluate(() => {
        window.__crop = [];
        document.querySelector('#rsp-cropper').addEventListener('crop-change', (e) => window.__crop.push(e.detail.source));
      });
      const c0 = await centre(page, '#rsp-cropper .td-cropper__box');
      const bh = (await page.locator('#rsp-cropper .td-cropper__box').boundingBox()).height;
      const c = { x: c0.x, y: Math.round(c0.y + bh * 0.25) }; // below the focal point handle (the fixture's focal is at y 0.4)
      const before = await page.evaluate(() => document.querySelector('#rsp-cropper').crop.pixels.width);
      await pinch(cdp, c, 50, 130, { durationMs: 200 }); // fingers apart = zoom in = a smaller crop box

      await frames(page, 3);
      const after = await page.evaluate(() => document.querySelector('#rsp-cropper').crop.pixels.width);
      const srcs = await page.evaluate(() => window.__crop);
      expect(srcs.length === 1 && srcs[0] === 'pinch', `crop-change ${srcs.join(',')}`);
      expect(after < before - 5, `box did not shrink (${before} → ${after})`);
      await pinch(cdp, c, 50, 90, { durationMs: 120, end: false });
      await touchCancel(cdp);
      await frames(page, 3);
      const n = await page.evaluate(() => window.__crop.length);
      await touchDrag(cdp, [c, { x: c.x + 20, y: c.y }], { durationMs: 120 });
      await frames(page, 3);
      const last = await page.evaluate(() => window.__crop[window.__crop.length - 1]);
      expect(n <= 2 && last === 'pointer', `after the cancel: ${await page.evaluate(() => window.__crop.join(','))}`);
    });

    if (errors.length) failures.push(`${tag}: page errors — ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ (b) lightbox swipe (CDP) */

async function openLightbox(page, n = 3, opts = {}) {
  await page.evaluate(async ([count, o]) => {
    const { TdLightbox } = await import('/src/feedback/td-lightbox.js');
    window.__changes = 0;
    document.addEventListener('td-lightbox-change', () => { window.__changes += 1; });
    window.__lb = TdLightbox.open([1, 2, 3, 4].slice(0, count).map((k) => ({ src: `/test/fixtures/${k}.svg`, caption: `Ảnh ${k}` })), o);
  }, [n, opts]);
  await page.locator('.td-lightbox[data-state="open"] .td-lightbox__img:not([data-loading])[src]').waitFor();
  await page.evaluate(() => Promise.all(document.querySelector('.td-lightbox').getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
  await frames(page, 2);
  await page.evaluate(() => { window.__changes = 0; });
}
const lbIndex = (page) => page.evaluate(() => window.__lb.index);
const swipeVar = (page) => page.evaluate(() => document.querySelector('.td-lightbox').style.getPropertyValue('--td-lb-swipe-x'));
const swipeAttr = (page) => page.evaluate(() => document.querySelector('.td-lightbox').getAttribute('data-swiping'));
/** the settle (slide out / spring back) is over: no data-swiping */
const settled = (page) => page.waitForFunction(() => !document.querySelector('.td-lightbox').hasAttribute('data-swiping'), null, { timeout: 3000 });
const stageY = async (page) => { const b = await page.locator('.td-lightbox__col').boundingBox(); return Math.round(b.y + b.height / 2); };

async function lightboxSuite(browser) {
  const tag = 'chromium-390 lightbox';
  const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const cdp = await cdpFor(page);
  const W = 390;
  try {
    await it(tag, '30 % to the left → next; the frame follows the finger while dragging', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 260, y }, { x: 260 - 0.3 * W, y }], { durationMs: 480, end: false });
      await frames(page, 2);
      const v = parseFloat(await swipeVar(page));
      expect(await swipeAttr(page) !== null && v < -60, `not following (data-swiping ${await swipeAttr(page)}, x ${v})`);
      await touchUp(cdp);
      await settled(page);
      expect(await lbIndex(page) === 1, `index ${await lbIndex(page)}`);
      expect(await page.evaluate(() => window.__changes) === 1, 'not exactly one change');
      expect(await swipeVar(page) === '', 'swipe variable left behind');
    });
    await it(tag, '15 % slowly → springs back, index kept, variable removed after the settle', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 220, y }, { x: 220 - 0.15 * W, y }], { durationMs: 900 });
      expect(await swipeAttr(page) === 'back', `settle state ${await swipeAttr(page)}`);
      await settled(page);
      expect(await lbIndex(page) === 0 && await swipeVar(page) === '', `index ${await lbIndex(page)} var ${await swipeVar(page)}`);
    });
    await it(tag, 'a 40 px flick in 60 ms → next', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 220, y }, { x: 180, y }], { durationMs: 60 });
      await settled(page);
      expect(await lbIndex(page) === 1, `index ${await lbIndex(page)}`);
    });
    await it(tag, 'RTL: a swipe to the right → next', async () => {
      await load(page);
      await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
      await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 120, y }, { x: 120 + 0.35 * W, y }], { durationMs: 400 });
      await settled(page);
      expect(await lbIndex(page) === 1, `index ${await lbIndex(page)}`);
    });
    await it(tag, 'one item: rubber band (follows less than the finger), never changes', async () => {
      await load(page); await openLightbox(page, 1);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 100, y }, { x: 300, y }], { durationMs: 300, end: false });
      await frames(page, 2);
      const v = parseFloat(await swipeVar(page));
      expect(await swipeAttr(page) !== null && v > 0 && v < 200 * 0.5, `rubber band x ${v}`);
      await touchUp(cdp);
      await settled(page);
      expect(await lbIndex(page) === 0 && await page.evaluate(() => window.__changes) === 0, 'one item changed');
    });
    await it(tag, 'a gesture starting in the 24 px edge band does not follow (browser back swipe)', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 10, y }, { x: 200, y }], { durationMs: 300, end: false });
      await frames(page, 2);
      expect(await swipeAttr(page) === null, 'edge gesture followed');
      await touchUp(cdp);
      await frames(page, 3);
      expect(await lbIndex(page) === 0, 'edge gesture navigated');
    });
    await it(tag, 'zoomed 2× (double tap): a horizontal drag pans, never follows / changes', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await doubleTap(cdp, { x: 195, y });
      await page.locator('.td-lightbox[data-zoomed]').waitFor();
      await touchDrag(cdp, [{ x: 250, y }, { x: 100, y }], { durationMs: 300, end: false });
      await frames(page, 2);
      expect(await swipeAttr(page) === null, 'zoomed drag followed');
      await touchUp(cdp);
      await frames(page, 3);
      expect(await lbIndex(page) === 0, 'zoomed drag navigated');
    });
    await it(tag, 'touchcancel mid-swipe → springs back to 0, index kept', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 260, y }, { x: 120, y }], { durationMs: 300, cancel: true });
      await settled(page);
      expect(await lbIndex(page) === 0 && await swipeVar(page) === '', `index ${await lbIndex(page)}`);
    });
    await it(tag, 'reduced motion: no follow while dragging, the change is immediate', async () => {
      await load(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openLightbox(page);
      const y = await stageY(page);
      await touchDrag(cdp, [{ x: 260, y }, { x: 260 - 0.35 * W, y }], { durationMs: 400, end: false });
      await frames(page, 2);
      expect(await swipeVar(page) === '' && await swipeAttr(page) === null, 'followed under reduced motion');
      await touchUp(cdp);
      await frames(page, 2);
      expect(await lbIndex(page) === 1, `index ${await lbIndex(page)}`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    });
    // QĐ 19b settle races
    await it(tag, 'race: closing during the commit slide → no change, nothing left on the overlay', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      const mark = await markTimers(page);
      await touchDrag(cdp, [{ x: 260, y }, { x: 260 - 0.4 * W, y }], { durationMs: 300 });
      const mid = await swipeAttr(page);
      await page.evaluate(() => window.__lb.close());
      await page.waitForFunction(() => !document.querySelector('.td-lightbox[data-state="open"]'));
      await timersSettled(page, mark); // the settle timer fired or was cleared (a leaked one would have navigated)
      const left = await page.evaluate(() => { const o = document.querySelector('.td-lightbox'); return [o.getAttribute('data-swiping'), o.style.getPropertyValue('--td-lb-swipe-x')]; });
      expect(mid === 'out', `not mid-commit (${mid})`);
      expect(await page.evaluate(() => window.__changes) === 0, 'navigated after close');
      expect(left[0] === null && left[1] === '', `left: ${left.join(' / ')}`);
    });
    await it(tag, 'race: next() during the commit slide → exactly one step', async () => {
      await load(page); await openLightbox(page, 4);
      const y = await stageY(page);
      const mark = await markTimers(page);
      await touchDrag(cdp, [{ x: 260, y }, { x: 260 - 0.4 * W, y }], { durationMs: 300 });
      await page.evaluate(() => window.__lb.next());
      await timersSettled(page, mark);
      await settled(page);
      expect(await lbIndex(page) === 1 && await page.evaluate(() => window.__changes) === 1, `index ${await lbIndex(page)} changes ${await page.evaluate(() => window.__changes)}`);
    });
    await it(tag, 'race: a new session during the spring back → clean overlay, index 0', async () => {
      await load(page); await openLightbox(page);
      const y = await stageY(page);
      const mark = await markTimers(page);
      await touchDrag(cdp, [{ x: 220, y }, { x: 180, y }], { durationMs: 900 });
      const mid = await swipeAttr(page);
      await openLightbox(page, 2);
      await timersSettled(page, mark);
      expect(mid === 'back', `not mid-spring (${mid})`);
      expect(await swipeAttr(page) === null && await swipeVar(page) === '' && await lbIndex(page) === 0, 'dirty overlay');
    });
    if (errors.length) failures.push(`${tag}: page errors — ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ (c) WebKit iPhone smoke */

async function webkitSmoke(browser) {
  const tag = 'webkit-iphone13';
  const { context, page, errors } = await newPage(browser, { ...devices['iPhone 13'] });
  const tap = async (sel) => { const p = await centre(page, sel); await page.touchscreen.tap(p.x, p.y); await frames(page, 2); };
  const reachable = (sel) => page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].pop();
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
  try {
    await it(tag, 'lightbox phone rail: next / prev by tap', async () => {
      await load(page);
      await openLightbox(page);
      await tap('.td-lightbox__rail .td-lightbox__btn--next, .td-lightbox__rail [data-td-lb="next"], .td-lightbox__rail > .td-lightbox__btn:last-child');
      await page.waitForFunction(() => window.__lb.index === 1);
      await tap('.td-lightbox__rail > .td-lightbox__btn:first-child');
      await page.waitForFunction(() => window.__lb.index === 0);
      expect(true, '');
    });
    await it(tag, 'dropdown opens inside the viewport', async () => {
      await load(page);
      await tap('#g-dd .td-dropdown__trigger');
      const m = page.locator('.td-dropdown__menu[data-state="open"]');
      await m.waitFor();
      const b = await m.boundingBox();
      const vp = page.viewportSize();
      expect(b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1, `menu ${JSON.stringify(b)}`);
    });
    await it(tag, 'color picker: opens inside the viewport; a preset tap picks it and closes', async () => {
      await load(page);
      await tap('#g-color .td-color__trigger');
      const m = page.locator('body > .td-color-panel[data-state="open"]');
      await m.waitFor();
      const b = await m.boundingBox();
      const vp = page.viewportSize();
      expect(b.x >= -1 && b.y >= -1 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1, `popup ${JSON.stringify(b)}`);
      await tap('.td-color-panel__preset[data-value="#ef4444"]');
      const st = await page.evaluate(() => ({ v: document.querySelector('#g-color').value, open: !!document.querySelector('body > .td-color-panel') }));
      expect(st.v === '#ef4444' && !st.open, JSON.stringify(st));
    });
    await it(tag, 'sheet modal: its body contains overscroll, the page does not scroll under it; close + action reachable', async () => {
      await load(page);
      await page.evaluate(() => window.scrollTo(0, 300));
      const y0 = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.__openers.modalLong());
      await page.locator('.td-modal[data-state="open"] .td-modal__body').waitFor();
      await settle(page, '.td-modal');
      // mobile WebKit has no wheel / touch-drag input in Playwright: the chain is cut by CSS (overscroll-behavior) and
      // the page scroll lease — scrolling the body to its end must leave the page where it was
      const ob = await page.evaluate(() => getComputedStyle(document.querySelector('.td-modal__body')).overscrollBehaviorY);
      await page.evaluate(() => { const b = document.querySelector('.td-modal__body'); b.scrollTop = b.scrollHeight; });
      await frames(page, 4);
      expect(ob === 'contain' || ob === 'none', `modal body overscroll-behavior-y ${ob}`);
      expect(await page.evaluate(() => window.scrollY) === y0, 'page scrolled under the sheet');
      expect(await reachable('.td-modal__close'), 'modal close not reachable');
      expect(await reachable('.td-modal__footer .td-btn:last-child'), 'main action not reachable');
    });
    await it(tag, 'drawer + picker close buttons reachable', async () => {
      await load(page);
      await page.evaluate(() => window.__openers.drawer());
      await page.locator('.td-drawer-root[data-state="open"]').waitFor();
      await page.evaluate(() => Promise.all(document.querySelector('.td-drawer-root').getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
      expect(await reachable('.td-drawer__close'), 'drawer close not reachable');
      await load(page);
      await page.evaluate(() => { window.__openers.picker(); });
      await page.locator('.td-media-picker[data-state="open"]').waitFor();
      await page.evaluate(() => Promise.all(document.querySelector('.td-media-picker').getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
      expect(await reachable('.td-media-picker .td-modal__close'), 'picker close not reachable');
    });
    await it(tag, 'hover not sticky: button and option after a tap', async () => {
      await load(page);
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches) === false, 'iPhone matches the hover gate');
      await tap('#t-ghost');
      await quiet(page, '#t-ghost');
      const after = await bgOf(page, '#t-ghost');
      await tap('#root h2');
      await quiet(page, '#t-ghost');
      expect(after === await bgOf(page, '#t-ghost'), 'ghost hover stuck');
      // option rows: tap one (it is picked, the menu closes), reopen — the next row has the resting fill of an unpicked row
      await tap('#g-dd .td-dropdown__trigger');
      const opt = '.td-dropdown__menu[data-state="open"] .td-dropdown__option';
      await page.locator(opt).first().waitFor();
      await settle(page, '.td-dropdown__menu[data-state="open"]');
      const rest = await bgOf(page, '#g-dd-opt-2');
      await tap('#g-dd-opt-1');
      await tap('#g-dd .td-dropdown__trigger');
      await page.locator(opt).first().waitFor();
      await settle(page, '.td-dropdown__menu[data-state="open"]');
      expect(rest === await bgOf(page, '#g-dd-opt-2'), 'an unpicked option row changed after taps');
    });

    // v0.44.0: type-to-confirm on a phone — tap the field: it takes the focus, ≥ 44 px tall, ≥ 16 px text (no iOS zoom);
    // field + confirm button reachable, the phrase wraps inside the sheet
    await it(tag, 'type-to-confirm field: tap focuses, ≥ 44 px, ≥ 16 px, field + confirm reachable', async () => {
      await load(page);
      await page.evaluate(() => window.__openers.modalTypeConfirm());
      await page.locator('.td-modal[data-state="open"] .td-modal__confirm-field input').waitFor();
      await settle(page, '.td-modal');
      await tap('.td-modal__confirm-field input');
      const m = await page.evaluate(() => {
        const i = document.querySelector('.td-modal__confirm-field input');
        const d = document.querySelector('.td-modal__dialog').getBoundingClientRect();
        const ph = document.querySelector('.td-modal__phrase').getBoundingClientRect();
        return { focused: document.activeElement === i, h: i.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(i).fontSize),
          wraps: ph.right <= d.right + 1 && ph.left >= d.left - 1, vw: innerWidth, sw: document.documentElement.scrollWidth };
      });
      expect(m.focused, 'tap did not focus the field');
      expect(m.h >= 44, `field height ${m.h}`);
      expect(m.fs >= 16, `field font-size ${m.fs}`);
      expect(m.wraps, 'phrase outside the dialog');
      expect(m.sw <= m.vw, `horizontal overflow ${m.sw} > ${m.vw}`);
      expect(await reachable('.td-modal__confirm-field input'), 'field not reachable');
      expect(await reachable('.td-modal__footer .td-btn:last-child'), 'confirm button not reachable');
    });

    // v0.51.0 (plan v0.51.0-gallery-caption QĐ 21, M6): the caption textarea / alt input on a phone — a tap focuses, ≥ 44 px
    // tall, ≥ 16 px text (no iOS zoom); the counter / error ≥ 14 px; a typed caption reaches FormData
    await it(tag, 'gallery caption: tap focuses, ≥ 44 px, ≥ 16 px; counter ≥ 14 px; typing reaches the value', async () => {
      await load(page);
      const ta = '#rsp-gallery .td-media-gallery__item:nth-child(2) .td-media-gallery__caption';
      await page.locator(ta).scrollIntoViewIfNeeded();
      await tap(ta);
      await page.keyboard.type('Chú thích');
      const m = await page.evaluate((s) => {
        const t = document.querySelector(s);
        const a = document.querySelector('#rsp-gallery .td-media-gallery__alt');
        const c = document.querySelector('#rsp-gallery .td-media-gallery__counter:not([hidden])');
        return { focused: document.activeElement === t, tag: t.localName, h: t.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(t).fontSize),
          altFs: parseFloat(getComputedStyle(a).fontSize), counterFs: c ? parseFloat(getComputedStyle(c).fontSize) : 0,
          cap: document.querySelector('#rsp-gallery').selection[1].usage.caption, vw: innerWidth, sw: document.documentElement.scrollWidth };
      }, ta);
      expect(m.focused && m.tag === 'textarea', `tap did not focus the caption (${m.tag})`);
      expect(m.h >= 44, `caption height ${m.h}`);
      expect(m.fs >= 16 && m.altFs >= 16, `font-size caption ${m.fs} / alt ${m.altFs}`);
      expect(m.counterFs >= 14, `counter font-size ${m.counterFs}`);
      expect(m.cap === 'Chú thích', `caption state ${JSON.stringify(m.cap)}`);
      expect(m.sw <= m.vw, `horizontal overflow ${m.sw} > ${m.vw}`);
    });

    // v0.54.0 (plan v0.54.0-hint gate "touch"): every hint ≥ 14 px on a coarse pointer (footer note, host note, <td-hint>);
    // a tap on the toggle's state text flips it (it sits in the label); a tap on a link inside a <td-hint> child of a
    // checkbox does NOT tick it (the hint is outside the label)
    await it(tag, 'hints ≥ 14 px; tap on the state text flips the toggle; a link in a checkbox hint does not tick it', async () => {
      await load(page);
      await page.locator('#rsp-hint-table').scrollIntoViewIfNeeded();
      const fs = await page.evaluate(() => [...document.querySelectorAll('[data-section="hints"] :is(.td-field__note:not([hidden]), td-hint)')]
        .map((n) => [n.closest('[id]')?.id || n.localName, parseFloat(getComputedStyle(n).fontSize)]));
      for (const [id, f] of fs) expect(f >= 14, `${id} hint font-size ${f}`);
      expect(fs.length >= 5, `hints found: ${fs.length}`);
      const off = '#rsp-hint-table tr:nth-child(2) td-toggle';
      await tap(`${off} .td-switch__state`);
      await page.waitForTimeout(50);
      const on = await page.evaluate((s) => document.querySelector(s).checked, off);
      expect(on, 'tap on the state text did not flip the toggle');
      await page.evaluate(() => { const a = document.querySelector('#rsp-hint-checkbox td-hint a'); a.addEventListener('click', (e) => e.preventDefault()); });
      await page.locator('#rsp-hint-checkbox td-hint a').scrollIntoViewIfNeeded();
      await tap('#rsp-hint-checkbox td-hint a');
      await page.waitForTimeout(50);
      expect(!(await page.evaluate(() => document.getElementById('rsp-hint-checkbox').checked)), 'the hint link ticked the checkbox');
    });

    // v0.59.1: a tap on the start-side label flips the toggle (WebKit)
    await it(tag, 'label-position start: a tap on the label flips the toggle, the box is ≥ 44 px', async () => {
      await load(page);
      await page.locator('#rsp-lp-head').scrollIntoViewIfNeeded();
      const m = await page.evaluate(() => {
        const el = document.getElementById('rsp-lp-head');
        const box = el.querySelector('label').getBoundingClientRect();
        const l = el.querySelector('.td-switch__label').getBoundingClientRect();
        const c = el.querySelector('.td-switch__track').getBoundingClientRect();
        return { w: box.width, h: box.height, first: l.right <= c.left + 0.5, before: el.checked };
      });
      expect(m.w >= 43.5 && m.h >= 43.5, `hit box ${m.w}×${m.h}`);
      expect(m.first, 'label not before the track');
      await tap('#rsp-lp-head .td-switch__label');
      await page.waitForTimeout(50);
      expect((await page.evaluate(() => document.getElementById('rsp-lp-head').checked)) === !m.before, 'tap on the label did not flip the toggle');
    });

    await it(tag, 'carousel: next / prev by tap (v0.50.0)', async () => {
      await load(page);
      await tap('#rsp-carousel [data-td-carousel="next"]');
      await page.waitForFunction(() => document.querySelector('#rsp-carousel').index === 2, null, { timeout: 5000 });
      await tap('#rsp-carousel [data-td-carousel="prev"]');
      await page.waitForFunction(() => document.querySelector('#rsp-carousel').index === 0, null, { timeout: 5000 });
      expect(true, '');
    });

    await controlMatrix(tag, page, syntheticInput(page));
    if (errors.length) failures.push(`${tag}: page errors — ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await context.close();
  }
}

const t0 = Date.now();
const cb = await chromium.launch();
const wb = await webkit.launch(await launchOptions('webkit', webkit)).catch((e) => { failures.push(`webkit: could not launch — ${e.message.split('\n')[0]}`); return null; });
try {
  await Promise.all([
    (async () => { await chromiumSemantics(cb); await lightboxSuite(cb); })(),
    wb ? webkitSmoke(wb) : Promise.resolve(),
  ]);
} finally {
  await cb.close();
  if (wb) await wb.close();
}
for (const n of notes) console.log(`note: ${n}`);
console.log(`touch lane: ${cases} cases, ${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('touch lane: OK');
