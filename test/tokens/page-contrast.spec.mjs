#!/usr/bin/env node
/**
 * Full-page theme gate (v0.41.0, plan M5). demo.html (served through page.route, no Vite) with each palette —
 * light (kit default), dark (data-td-theme="dark"), beige (test/tokens/palettes/beige.css: 135 recipe, white surfaces),
 * navy (navy.css: v0.42.0 the GENERATOR's file for bg #16233a + accent #3b82f6 — R1 had it by hand), beige-gen (generator,
 * 135 seeds + white surfaces) — at 1280 and 390, in Chromium / Firefox / WebKit,
 * at rest and with the overlays open (dropdown, menu, toast + tooltip, modal, datetime picker, focused field):
 *   1. TEXT: every element with its own text (and every text input's value / placeholder): computed ink composited on
 *      the effective background (own + ancestors' background colours down to the first opaque one; "page" is the real
 *      body / --td-color-* colour, not #fff / #000) ≥ 4.7 (large text 3.0, disabled 2.2);
 *   2. CONTROL BOUNDARY (QĐ7): every field / trigger / check box / switch / OTP cell is told apart from what is around
 *      it: its fill ≥ min vs the outer background, or its border ≥ min vs both the outer background and its own fill —
 *      dark-scheme palettes ≥ 3:1, light ones ≥ 1.3 (the owner's soft 1.5:1 border, guarded against regressions);
 *   3. ISLANDS: an opaque near-neutral fill lighter than its backdrop (> 1.12, dark-scheme > 1.6) that is not one of the
 *      theme's own surfaces (--td-color-bg / -surface / -surface-muted / -surface-raised, --td-control-bg,
 *      --td-glass-solid, --td-color-fill / -fill-strong) and not raised on purpose (buttons, popups, thumbs, media);
 *   3b. KEYBOARD FOCUS (v0.41.0, ISSUE-1): representative controls focused with the real keyboard (Tab / Shift+Tab, so
 *      :focus-visible applies); the RENDERED indicator (outermost box-shadow ring / opaque outline / focus border) composited
 *      over the background behind it ≥ 3:1 against BOTH neighbours — outside (page / surface) and inside (the ring's gap
 *      or the control's own fill);
 *   4. TOKEN PAIRS per palette (computed colours): text / muted on every surface it sits on ≥ 4.7; focus ≥ 3 vs the
 *      control fill and the page; dark-scheme: control borders (soft, hover, checkbox, switch edge) ≥ 3 vs control-bg,
 *      surface, surface-muted, raised and bg, hover > soft; the tooltip chip ≥ 1.4 vs bg and surface.
 * Images / gradients behind a text make it "unknown" (counted, not measured).
 *
 *   node test/tokens/page-contrast.spec.mjs        (npm run test:page-contrast)
 *   TD_PAGE_ENGINES=chromium TD_PAGE_PALETTES=navy TD_PAGE_WIDTHS=1280 TD_PAGE_STATES=page  → a subset (dev)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { contrast, over } from './color-parse.js';
import { renderedPairs } from './rendered-pairs.js';

/** impl review round 2: every rendered (foreground, composite) pair of the scheme-dependent component tokens. */
const RENDERED = renderedPairs();
const RENDERED_TOKENS = [...new Set(RENDERED.flatMap((p) => [p.fg, ...p.layers]))];
/** Generated palettes and (v0.42.1) the built-in dark must pass every rendered pair; built-in light and the hand-written
 *  beige recipe are reported (owner keeps the built-in light values). */
const GATED = new Set(['navy', 'beige-gen', 'navy-named', 'dark']);
const builtinNotes = new Set();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://td-page-contrast.test';
const DEMO = await readFile(join(ROOT, 'demo.html'), 'utf8');
const list = (env, all) => (process.env[env] ? process.env[env].split(',').map((s) => s.trim()) : all);

export const PALETTES = {
  light: { theme: null, scheme: 'light' },
  dark: { theme: 'dark', scheme: 'dark' },
  beige: { theme: null, scheme: 'light' },
  navy: { theme: null, scheme: 'dark' },
  // v0.42.0: generator output (td-theme) — navy.css IS the generator's file now (R1 had it by hand); beige-gen = the 135
  // seeds with white surfaces. test/tokens/palette-fixtures.test.js keeps both byte-equal to the generator.
  'beige-gen': { theme: null, scheme: 'light' },
  // impl review ISSUE-1: the same navy seeds as a NAMED theme (<html data-td-theme="navy">): no kit dark rule applies,
  // every scheme-dependent component colour must come from the generated file (navy-named.css)
  'navy-named': { theme: 'navy', scheme: 'dark' },
};
const ENGINES = list('TD_PAGE_ENGINES', ['chromium', 'firefox', 'webkit']);
const PALETTE_NAMES = list('TD_PAGE_PALETTES', Object.keys(PALETTES));
const WIDTHS = list('TD_PAGE_WIDTHS', ['1280', '390']).map(Number);
const STATES = list('TD_PAGE_STATES', ['page', 'dropdown', 'menu', 'toast-tooltip', 'modal', 'dtp', 'focus', 'keyboard-focus']);

/** v0.41.0 (ISSUE-1): what gets keyboard focus → the element that draws its indicator. */
const FOCUS_CASES = [
  { name: 'input field', focus: 'td-input-field .td-field__control' },
  { name: 'button primary', focus: '.demo-section:not(:has(.demo-glass-stage)) .td-btn--primary:not(:disabled)' },
  { name: 'button secondary', focus: '.demo-section:not(:has(.demo-glass-stage)) .td-btn--secondary:not(:disabled)' },
  { name: 'button ghost', focus: '.td-btn--ghost:not(:disabled)' },
  { name: 'checkbox', focus: '.td-checkbox__input:not(:checked):not(:disabled)', ring: (el) => el.parentElement.querySelector('.td-checkbox__mark') },
  { name: 'checkbox checked', focus: '.td-checkbox__input:checked:not(:disabled)', ring: (el) => el.parentElement.querySelector('.td-checkbox__mark') },
  { name: 'toggle', focus: '.td-switch__input:not(:disabled)', ring: (el) => el.parentElement.querySelector('.td-switch__track') },
  { name: 'dropdown trigger', focus: '.td-dropdown__trigger' },
  { name: 'tab', focus: '.td-tabs__tab[aria-selected="true"]' },
  // the page buttons collapse into the compact status form below 720 px (td-pagination) — measured where shown
  { name: 'pagination current', focus: '.td-pagination__page[aria-current="page"]', optional: true },
  { name: 'pagination nav', focus: '.td-pagination__nav:not(:disabled)' },
  { name: 'table select', focus: '.td-table__select:not(:disabled)' },
];
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };

/** The theme's own surfaces (an opaque fill of one of these colours is never an island). --td-control-bg /
 *  --td-glass-solid are NOT here: they derive from --td-color-surface-raised, so a white control on a palette whose
 *  raised surface is not white is reported. */
const SURFACE_TOKENS = ['--td-color-bg', '--td-color-surface', '--td-color-surface-muted', '--td-color-surface-raised',
  '--td-color-fill', '--td-color-fill-strong', '--td-color-skeleton'];
const PAIR_TOKENS = [...SURFACE_TOKENS, '--td-control-bg', '--td-color-text', '--td-color-text-muted', '--td-color-hover-strong',
  '--td-control-border-soft', '--td-control-border-hover', '--td-checkbox-border', '--td-switch-edge', '--td-focus',
  '--td-field-focus', '--td-tooltip-bg', '--td-tooltip-fg',
  // impl review ISSUE-1: hover / pressed / create / selected component states (all palettes; generated ones are static)
  '--td-glass-bg-strong', '--td-color-hover', '--td-color-text-muted',
  '--td-action-btn-warning-fg', '--td-action-btn-warning-hover-bg', '--td-action-btn-warning-pressed-bg', '--td-action-btn-warning-pressed-fg',
  '--td-action-btn-danger-fg', '--td-action-btn-danger-hover-bg', '--td-action-btn-danger-pressed-bg',
  '--td-btn-ghost-hover-fg', '--td-dropdown-create-fg', '--td-badge-accent-bg', '--td-badge-accent-fg', '--td-table-row-selected',
  '--td-table-zebra', '--td-tabs-pill', '--td-dropzone-bg-active', '--td-dropzone-bg-pressed', '--td-hovercard-link-fg',
  '--td-hovercard-error-fg', '--td-form-summary-bg'];

function html(palette) {
  const p = PALETTES[palette];
  let s = DEMO.replace('<html lang="vi">', p.theme ? `<html lang="vi" data-td-theme="${p.theme}">` : '<html lang="vi">');
  s = s.replace('<link rel="stylesheet" href="./demo.css">', '<link rel="stylesheet" href="./demo.css">\n  <link rel="stylesheet" href="./palette.css">');
  return s;
}

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
let skippedTotal = 0;
const fail = (tag, msg) => failures.push(`${tag}: ${msg}`);

async function open(browser, palette, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' || url.pathname === '/demo.html') return route.fulfill({ status: 200, contentType: 'text/html', body: html(palette) });
    if (url.pathname === '/palette.css') return route.fulfill({ status: 200, contentType: 'text/css', body: await readFile(join(ROOT, 'test', 'tokens', 'palettes', `${palette}.css`)) });
    if (/^\/(src|test|td\.css|demo\.css)/.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try { return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(join(ROOT, url.pathname)) }); } catch { /* 404 */ }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.mouse.move(0, 0);
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => [...document.querySelectorAll('*')].filter((e) => e.localName.startsWith('td-')).every((e) => customElements.get(e.localName)));
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return { context, page };
}

const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Open an overlay; returns the CSS selector of what to measure (portal roots are new <body> children). */
async function trigger(page, state) {
  await page.evaluate(() => { for (const c of document.body.children) c.setAttribute('data-td-gate-base', ''); });
  if (state === 'dropdown') {
    const t = page.locator('.td-dropdown__trigger').first();
    await t.scrollIntoViewIfNeeded(); await t.click();
    await page.locator('.td-dropdown__menu').first().waitFor({ state: 'visible' });
  } else if (state === 'menu') {
    const t = page.locator('#demo-glass-menu');
    await t.scrollIntoViewIfNeeded(); await t.click();
    await page.locator('.td-menu').first().waitFor({ state: 'visible' });
  } else if (state === 'toast-tooltip') {
    const t = page.locator('#demo-glass-toast');
    await t.scrollIntoViewIfNeeded(); await t.click();
    await page.locator('.td-toast').first().waitFor({ state: 'visible' });
    await page.locator('[data-tooltip]').first().hover();
    await page.locator('.td-tooltip[data-state="open"], .td-tooltip:not([hidden])').first().waitFor({ state: 'visible' });
  } else if (state === 'modal') {
    await page.evaluate(() => { window.testModalInfo(); }); // resolves on close: do not await it
    await page.locator('.td-modal__dialog').first().waitFor({ state: 'visible' });
  } else if (state === 'dtp') {
    const t = page.locator('.td-dtp__trigger').first();
    await t.scrollIntoViewIfNeeded(); await t.click();
    await page.locator('.td-dtp-pop').first().waitFor({ state: 'visible' }); // v0.60.0: the calendar popover
  } else if (state === 'keyboard-focus') {
    return; // measured case by case in focusCases()
  } else if (state === 'focus') {
    const t = page.locator('td-input-field .td-field__control').first();
    await t.scrollIntoViewIfNeeded(); await t.focus();
  }
  await raf2(page);
}

async function measureState(page, palette, state) {
  const p = PALETTES[palette];
  return page.evaluate(async ({ scheme, state: st, surfaceTokens }) => {
    const m = await import('/test/tokens/page-contrast-probe.js');
    const surf = Object.values(m.tokens(surfaceTokens));
    let roots;
    if (st === 'page') roots = [document.body];
    else if (st === 'focus') roots = [document.activeElement.closest('.td-field') || document.activeElement];
    else roots = [...document.body.children].filter((c) => !c.hasAttribute('data-td-gate-base'));
    return m.measure({ roots, scheme, themeSurfaces: surf });
  }, { scheme: p.scheme, state, surfaceTokens: SURFACE_TOKENS });
}

function report(tag, r) {
  checks += r.measured;
  skippedTotal += r.skipped;
  for (const t of r.texts) fail(tag, `text ${t.what} ${t.ratio} < ${t.min} — ${t.el} (${t.ink} on ${t.bg})`);
  for (const c of r.controls) fail(tag, `control boundary < ${c.min} — ${c.el} (border ${c.border}: ${c.vsOuter} vs outer ${c.outer}, ${c.vsFill} vs fill ${c.fill})`);
  for (const i of r.islands) fail(tag, `island ${i.ratio} — ${i.el} (${i.fill} on ${i.outer})`);
}

/** v0.41.0 (ISSUE-1): real keyboard focus (Tab then Shift+Tab back onto the control) → the rendered indicator. */
async function focusCases(page, tag) {
  for (const c of FOCUS_CASES) {
    const handle = await page.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden], [inert]');
    }) || null, c.focus);
    const el = handle.asElement();
    checks++;
    if (!el) { if (!c.optional) fail(tag, `keyboard focus: no visible ${c.name} (${c.focus})`); continue; }
    await el.scrollIntoViewIfNeeded();
    await el.evaluate((e) => e.focus());
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    // WebKit (no "full keyboard access") only Tabs to text fields: there the control is focused right after a keyboard
    // event, which the :focus-visible heuristic treats as keyboard focus — the check below still requires :focus-visible
    if (!(await el.evaluate((e) => document.activeElement === e))) {
      await page.keyboard.press('Shift');
      await el.evaluate((e) => e.focus());
    }
    const r = await el.evaluate(async (e, ringFn) => {
      const m = await import('/test/tokens/page-contrast-probe.js');
      if (document.activeElement !== e) return { ok: false, why: `Shift+Tab landed on ${document.activeElement?.className || document.activeElement?.tagName}` };
      if (!e.matches(':focus-visible')) return { ok: false, why: 'not :focus-visible after keyboard navigation' };
      // eslint-disable-next-line no-new-func
      const ringEl = ringFn ? new Function('el', `return (${ringFn})(el)`)(e) : e;
      return m.focusIndicator(ringEl, 3);
    }, c.ring ? c.ring.toString() : null);
    const best = (r.candidates || []).filter((k) => k.vsOuter >= 3 && k.vsInner >= 3)
      .sort((a, b) => Math.min(b.vsOuter, b.vsInner) - Math.min(a.vsOuter, a.vsInner))[0] || (r.candidates || [])[0];
    focusReport.set(`${tag.split(' ').slice(1, 3).join(' ')} ${c.name}`, best && { ...best, kind: best.kind });
    if (!r.ok) fail(tag, `keyboard focus indicator < 3:1 — ${c.name}: ${r.why || JSON.stringify(r.candidates)} (shadow ${r.shadow})`);
    await page.evaluate(() => document.activeElement?.blur());
  }
}
const focusReport = new Map();

async function tokenPairs(page, palette, tag) {
  const t = await page.evaluate(async (names) => (await import('/test/tokens/page-contrast-probe.js')).tokens(names), [...new Set([...PAIR_TOKENS, ...RENDERED_TOKENS])]);
  for (const p of RENDERED) {
    let bg = t[p.layers[p.layers.length - 1]];
    for (let i = p.layers.length - 2; i >= 0; i--) bg = over(t[p.layers[i]], bg);
    const r = contrast(t[p.fg], bg);
    if (GATED.has(palette) || (palette === 'light' && p.gateLight)) { // v0.52.0 r2: gateLight pairs on the kit light page
      checks++;
      if (!(r >= p.min)) fail(tag, `rendered pair ${p.id} ${r.toFixed(2)} < ${p.min} (${t[p.fg]} on ${bg})`);
    } else if (!(r >= p.min)) builtinNotes.add(`${palette}: ${p.id} ${r.toFixed(2)} < ${p.min}`);
  }
  const pair = (what, fg, bg, min) => {
    checks++;
    const r = contrast(fg, bg);
    if (!(r >= min)) fail(tag, `token pair ${what} ${r.toFixed(2)} < ${min} (${fg} on ${bg})`);
    return r;
  };
  const surfaces = { 'control-bg': t['--td-control-bg'], surface: t['--td-color-surface'], 'surface-muted': t['--td-color-surface-muted'],
    raised: t['--td-color-surface-raised'], bg: t['--td-color-bg'] };
  for (const [k, s] of Object.entries(surfaces)) {
    pair(`text on ${k}`, t['--td-color-text'], s, 4.7);
    pair(`text-muted on ${k}`, t['--td-color-text-muted'], s, 4.7);
    // M3: dark muted ink also on the hover composites it sits on (light keeps its v0.40 values: muted on gray-50 + the
    // 5 % hover is 4.43 — light is pixel-identical in R1)
    if (PALETTES[palette].scheme === 'dark') pair(`text-muted on ${k} + hover-strong`, t['--td-color-text-muted'], over(t['--td-color-hover-strong'], s), 4.7);
    pair(`--td-field-focus vs ${k}`, t['--td-field-focus'], s, 3);
    pair(`--td-focus vs ${k}`, t['--td-focus'], s, 3);
  }
  pair('tooltip text on the chip', t['--td-tooltip-fg'], t['--td-tooltip-bg'], 4.7);
  // impl review ISSUE-1: component states (translucent fills composited over the surface they sit on)
  const surf = t['--td-color-surface'];
  const popup = over(t['--td-glass-bg-strong'], surf);
  pair('action warning icon on hover', t['--td-action-btn-warning-fg'], over(t['--td-action-btn-warning-hover-bg'], surf), 4.7);
  pair('action warning icon pressed', t['--td-action-btn-warning-pressed-fg'], over(t['--td-action-btn-warning-pressed-bg'], surf), 4.7);
  pair('action danger icon on hover', t['--td-action-btn-danger-fg'], over(t['--td-action-btn-danger-hover-bg'], surf), 4.7);
  pair('action danger icon pressed', t['--td-action-btn-danger-fg'], over(t['--td-action-btn-danger-pressed-bg'], surf), 4.7);
  pair('ghost label on hover (page)', t['--td-btn-ghost-hover-fg'], over(t['--td-color-hover'], t['--td-color-bg']), 4.5);
  pair('ghost label on hover (surface)', t['--td-btn-ghost-hover-fg'], over(t['--td-color-hover'], surf), 4.5);
  pair('dropdown create option in the popup', t['--td-dropdown-create-fg'], popup, 4.5);
  pair('accent badge', t['--td-badge-accent-fg'], t['--td-badge-accent-bg'], 4.5);
  pair('text on a selected row', t['--td-color-text'], over(t['--td-table-row-selected'], surf), 4.7);
  pair('text on a zebra row', t['--td-color-text'], over(t['--td-table-zebra'], surf), 4.7);
  pair('text on the tab pill', t['--td-color-text'], over(t['--td-tabs-pill'], t['--td-color-surface-muted']), 4.7);
  pair('muted on the dropzone (active)', t['--td-color-text-muted'], t['--td-dropzone-bg-active'], 4.7);
  pair('muted on the dropzone (pressed)', t['--td-color-text-muted'], t['--td-dropzone-bg-pressed'], 4.7);
  pair('hovercard link', t['--td-hovercard-link-fg'], popup, 4.5);
  pair('hovercard error', t['--td-hovercard-error-fg'], popup, 4.5);
  pair('text on the form summary', t['--td-color-text'], t['--td-form-summary-bg'], 4.7);
  if (PALETTES[palette].scheme === 'dark') {
    for (const b of ['--td-control-border-soft', '--td-control-border-hover', '--td-checkbox-border', '--td-switch-edge']) {
      for (const [k, s] of Object.entries(surfaces)) pair(`${b} vs ${k} (QĐ7)`, t[b], s, 3);
    }
    checks++;
    if (!(contrast(t['--td-control-border-hover'], t['--td-color-surface']) > contrast(t['--td-control-border-soft'], t['--td-color-surface']))) {
      fail(tag, 'token pair: control-border-hover must step past control-border-soft');
    }
    pair('tooltip chip vs bg', t['--td-tooltip-bg'], t['--td-color-bg'], 1.4);
    pair('tooltip chip vs surface', t['--td-tooltip-bg'], t['--td-color-surface'], 1.4);
  }
}

async function runEngine(name, launcher) {
  let browser;
  try { browser = await launcher.launch(await launchOptions(name, launcher)); } catch (e) { failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`); return; }
  try {
    for (const palette of PALETTE_NAMES) {
      for (const width of WIDTHS) {
        const tag0 = `${name} ${palette} ${width}`;
        let { context, page } = await open(browser, palette, width);
        try {
          await tokenPairs(page, palette, tag0);
          for (const state of STATES) {
            const tag = `${tag0} ${state}`;
            try {
              if (state === 'keyboard-focus') { await focusCases(page, tag); continue; }
              if (state !== 'page') await trigger(page, state);
              report(tag, await measureState(page, palette, state));
            } catch (e) {
              fail(tag, `could not measure (${e.message.split('\n')[0]})`);
            }
            if (state !== 'page') { // fresh page for the next overlay (no leftover popup / focus)
              await context.close();
              ({ context, page } = await open(browser, palette, width));
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

const launchers = { chromium, firefox, webkit };
const t0 = Date.now();
for (const e of ENGINES) await runEngine(e, launchers[e]);
for (const n of notes) console.log(`  ${n}`);
if (builtinNotes.size) console.log(`  built-in light / beige recipe below the rendered-pair gate (reported, not gated — owner keeps built-in light values):\n    ${[...builtinNotes].join('\n    ')}`);
if (focusReport.size) {
  const lows = [...focusReport].filter(([, v]) => v).map(([k, v]) => [k, Math.min(v.vsOuter, v.vsInner), v]).sort((a, b) => a[1] - b[1]).slice(0, Number(process.env.TD_PAGE_FOCUS_REPORT || 8));
  console.log(`  lowest keyboard focus rings: ${lows.map(([k, m, v]) => `${k} ${m} (${v.kind} ${v.color} vs out ${v.outer} / in ${v.inner})`).join(' · ')}`);
}
const secs = Math.round((Date.now() - t0) / 1000);
if (failures.length) {
  const uniq = [...new Set(failures)];
  console.log(`Page theme gate: ${uniq.length} failure(s) (${checks} measurements, ${skippedTotal} unknown backgrounds, ${secs}s)`);
  for (const f of uniq.slice(0, Number(process.env.TD_PAGE_MAX || 120))) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Page theme gate: all ${checks} measurements passed (${ENGINES.join(', ')} × ${PALETTE_NAMES.join('/')} × ${WIDTHS.join('/')} × ${STATES.length} states; ${skippedTotal} unknown backgrounds skipped; ${secs}s).`);
