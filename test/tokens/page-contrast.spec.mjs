#!/usr/bin/env node
/**
 * Full-page theme gate (v0.41.0, plan M5). demo.html (served through page.route, no Vite) with each palette —
 * light (kit default), dark (data-td-theme="dark"), beige (test/tokens/palettes/beige.css: 135 recipe, white surfaces),
 * navy (navy.css: the full theme contract by hand, no dark attribute) — at 1280 and 390, in Chromium / Firefox / WebKit,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://td-page-contrast.test';
const DEMO = await readFile(join(ROOT, 'demo.html'), 'utf8');
const list = (env, all) => (process.env[env] ? process.env[env].split(',').map((s) => s.trim()) : all);

export const PALETTES = {
  light: { theme: null, scheme: 'light' },
  dark: { theme: 'dark', scheme: 'dark' },
  beige: { theme: null, scheme: 'light' },
  navy: { theme: null, scheme: 'dark' },
};
const ENGINES = list('TD_PAGE_ENGINES', ['chromium', 'firefox', 'webkit']);
const PALETTE_NAMES = list('TD_PAGE_PALETTES', Object.keys(PALETTES));
const WIDTHS = list('TD_PAGE_WIDTHS', ['1280', '390']).map(Number);
const STATES = list('TD_PAGE_STATES', ['page', 'dropdown', 'menu', 'toast-tooltip', 'modal', 'dtp', 'focus']);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };

/** The theme's own surfaces (an opaque fill of one of these colours is never an island). --td-control-bg /
 *  --td-glass-solid are NOT here: they derive from --td-color-surface-raised, so a white control on a palette whose
 *  raised surface is not white is reported. */
const SURFACE_TOKENS = ['--td-color-bg', '--td-color-surface', '--td-color-surface-muted', '--td-color-surface-raised',
  '--td-color-fill', '--td-color-fill-strong', '--td-color-skeleton'];
const PAIR_TOKENS = [...SURFACE_TOKENS, '--td-control-bg', '--td-color-text', '--td-color-text-muted', '--td-color-hover-strong',
  '--td-control-border-soft', '--td-control-border-hover', '--td-checkbox-border', '--td-switch-edge', '--td-focus',
  '--td-field-focus', '--td-tooltip-bg', '--td-tooltip-fg'];

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
    await page.locator('.td-dtp-panel').first().waitFor({ state: 'visible' });
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

/**
 * KNOWN (owner decision pending, reported — not a silent pass): the td-table row-selection mark keeps its v0.37 light
 * edge (--td-table-check-border = --td-color-border, 1.27:1 on white) because R1 is pixel-identical in light. Dark sets
 * it to the control edge (≥ 3:1, measured here). Palettes WITHOUT data-td-theme inherit the light default, so this one
 * mark is listed instead of failed there. Fix = --td-table-check-border: var(--td-checkbox-border) (a light pixel change).
 */
const known = new Map();
function report(tag, r, palette) {
  checks += r.measured;
  skippedTotal += r.skipped;
  for (const t of r.texts) fail(tag, `text ${t.what} ${t.ratio} < ${t.min} — ${t.el} (${t.ink} on ${t.bg})`);
  for (const c of r.controls.filter((x) => x.tableCheck && !PALETTES[palette].theme)) {
    const k = `${palette}: td-table selection mark edge ${c.border} — ${c.vsOuter} vs outer, ${c.vsFill} vs fill`;
    known.set(k, (known.get(k) || 0) + 1);
  }
  for (const c of r.controls.filter((x) => !(x.tableCheck && !PALETTES[palette].theme))) fail(tag, `control boundary < ${c.min} — ${c.el} (border ${c.border}: ${c.vsOuter} vs outer ${c.outer}, ${c.vsFill} vs fill ${c.fill})`);
  for (const i of r.islands) fail(tag, `island ${i.ratio} — ${i.el} (${i.fill} on ${i.outer})`);
}

async function tokenPairs(page, palette, tag) {
  const t = await page.evaluate(async (names) => (await import('/test/tokens/page-contrast-probe.js')).tokens(names), PAIR_TOKENS);
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
              if (state !== 'page') await trigger(page, state);
              report(tag, await measureState(page, palette, state), palette);
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
if (known.size) {
  console.log(`  KNOWN (light default kept pixel-identical, owner decision — see the spec header): ${known.size} distinct`);
  for (const [k, n] of [...known].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8)) console.log(`    · ${k} (×${n})`);
}
const secs = Math.round((Date.now() - t0) / 1000);
if (failures.length) {
  const uniq = [...new Set(failures)];
  console.log(`Page theme gate: ${uniq.length} failure(s) (${checks} measurements, ${skippedTotal} unknown backgrounds, ${secs}s)`);
  for (const f of uniq.slice(0, Number(process.env.TD_PAGE_MAX || 120))) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Page theme gate: all ${checks} measurements passed (${ENGINES.join(', ')} × ${PALETTE_NAMES.join('/')} × ${WIDTHS.join('/')} × ${STATES.length} states; ${skippedTotal} unknown backgrounds skipped; ${secs}s).`);
