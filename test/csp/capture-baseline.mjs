/**
 * Task 0B — PARITY ORACLE baseline capture.
 *
 * Renders every affected component in every matrix state on a PERMISSIVE page
 * (no CSP), with the deterministic compiled Tailwind fixture in <head>, loads the
 * REAL `src/` ES modules from disk, snapshots getComputedStyle (only the props in
 * style-props.json) of the currently-inline/injected-styled elements, and writes
 * test/csp/baseline/<component>.<state>.json. Task 1 asserts post-refactor parity
 * against these files under a strict CSP.
 *
 * Module loading: a single page.route('**\/*') fulfills every request from disk
 * under a fake origin http://csp.local/ — so the components' RELATIVE imports
 * (../base/..., ../utils/...) resolve to the real source files. The Tailwind
 * fixture is served the same way. This loads the actual src modules unchanged.
 *
 * Determinism: pseudo-states (focus/open) are driven explicitly; portaled elements
 * (modal/toast/tooltip/dropdown-menu/loading-overlay) are read from document.body;
 * time/layout/random-dependent props are excluded per state (see matrix.json
 * excludeProps + MATRIX.md). Loading is captured under prefers-reduced-motion.
 *
 * Run: npm run capture:baseline
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURE_CSS = join(__dirname, 'fixture', 'tailwind.css');
const STYLE_PROPS = JSON.parse(await readFile(join(__dirname, 'style-props.json'), 'utf8'));
const SENTINELS = JSON.parse(await readFile(join(__dirname, 'fixture', 'sentinels.json'), 'utf8'));
const MATRIX = JSON.parse(await readFile(join(__dirname, 'matrix.json'), 'utf8'));
const BASELINE_DIR = join(__dirname, 'baseline');

const ORIGIN = 'http://csp.local';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };

/** Map an http://csp.local/<path> URL to a file on disk. */
function urlToFile(url) {
  const u = new URL(url);
  // /fixture/tailwind.css -> test/csp/fixture/tailwind.css ; /src/... -> repo/src/...
  if (u.pathname.startsWith('/fixture/')) return join(__dirname, u.pathname.slice(1));
  return join(REPO_ROOT, u.pathname.replace(/^\/+/, ''));
}

async function fulfillFromDisk(route, request) {
  const url = request.url();
  if (url === `${ORIGIN}/` || url === `${ORIGIN}/mount.html`) {
    const html = `<!doctype html><html><head><meta charset="utf-8">` +
      `<link rel="stylesheet" href="${ORIGIN}/fixture/tailwind.css">` +
      `</head><body><div id="__mount"></div></body></html>`;
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  }
  try {
    const file = urlToFile(url);
    const body = await readFile(file);
    return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body });
  } catch (e) {
    return route.fulfill({ status: 404, contentType: 'text/plain', body: `not found: ${url}\n${e.message}` });
  }
}

/** Read computed style of `selector` for the chosen props, searching mount first then document. */
const READ_FN = `(selector, props, fromBody) => {
  const scope = fromBody ? document : (document.getElementById('__mount') || document);
  const el = scope.querySelector(selector) || document.querySelector(selector);
  if (!el) return { __missing: true };
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of props) out[p] = cs.getPropertyValue(p).trim();
  return out;
}`;

/** Verify the fixture is live: the three sentinels must compute to expected values. */
async function assertSentinels(page) {
  const result = await page.evaluate(({ sentinels }) => {
    const mount = document.getElementById('__mount');
    const probe = document.createElement('div');
    mount.appendChild(probe);
    const out = [];
    for (const s of sentinels) {
      probe.className = s.class;
      const got = getComputedStyle(probe).getPropertyValue(s.prop).trim();
      out.push({ class: s.class, prop: s.prop, expected: s.expected, got, ok: got === s.expected });
    }
    probe.remove();
    return out;
  }, { sentinels: SENTINELS });
  const bad = result.filter(r => !r.ok);
  if (bad.length) {
    console.error('SENTINEL FAILURE — Tailwind fixture did not compile expected values:');
    for (const b of bad) console.error(`  .${b.class} { ${b.prop} } expected ${b.expected}, got "${b.got}"`);
    throw new Error('Sentinel check failed — fixture is vacuous; aborting baseline capture.');
  }
  return result;
}

async function freshPage(browser, reducedMotion) {
  const ctx = await browser.newContext(reducedMotion ? { reducedMotion: 'reduce' } : {});
  const page = await ctx.newPage();
  await page.route('**/*', (route, request) => fulfillFromDisk(route, request));
  await page.goto(`${ORIGIN}/mount.html`, { waitUntil: 'load' });
  await page.evaluate(() => { window.__mount = document.getElementById('__mount'); });
  return { ctx, page };
}

async function captureState(browser, component, modulePath, state) {
  const reduced = !!state.reducedMotion;
  const { ctx, page } = await freshPage(browser, reduced);
  try {
    // Sentinel gate per fresh page — proves the fixture is live, not vacuous.
    await assertSentinels(page);

    // Import the real source module (also defines static classes like TdModal/TdToast/TdLoading).
    await page.evaluate(async ({ origin, modulePath }) => {
      const m = await import(`${origin}${modulePath}`);
      // Expose named statics so `setup` strings can call them.
      for (const k of Object.keys(m)) window[k] = m[k];
    }, { origin: ORIGIN, modulePath });

    // Reach the state: declarative markup OR a setup script.
    if (state.markup) {
      await page.evaluate((html) => { window.__mount.innerHTML = html; }, state.markup);
    } else if (state.setup) {
      await page.evaluate(`(async () => { ${state.setup} })()`);
    }

    // Custom elements upgrade + first render synchronously on connect; give RAF-based
    // positioning (tabs indicator, dropdown/modal portals) time to settle.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (state.settle) await page.waitForTimeout(state.settle);

    // Pseudo-state driver (focus). Hover would use page.hover() — none of the blocking
    // constructs is hover-driven, so only focus is exercised here.
    if (state.pseudo === 'focus' && state.focusSelector) {
      await page.evaluate((sel) => {
        const el = (window.__mount.querySelector(sel) || document.querySelector(sel));
        if (el) el.focus();
      }, state.focusSelector);
      // The focus ring/border/bg animate over a CSS transition (Tailwind focus: classes).
      // Wait past the transition so we snapshot the STABLE focused end-state, not a
      // mid-interpolation frame (which would be non-deterministic run-to-run).
      await page.waitForTimeout(state.settle || 300);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    }

    const exclude = new Set(state.excludeProps || []);
    const props = STYLE_PROPS.filter(p => !exclude.has(p));
    const portalSet = new Set(state.portal || []);

    const snapshot = {};
    for (const sel of state.selectors) {
      const fromBody = portalSet.has(sel);
      const computed = await page.evaluate(({ fn, sel, props, fromBody }) => {
        return (new Function('return ' + fn))()(sel, props, fromBody);
      }, { fn: READ_FN, sel, props, fromBody });
      if (computed.__missing) {
        throw new Error(`[${component}.${state.state}] selector not found: ${sel}`);
      }
      snapshot[sel] = computed;
    }

    // Record the sentinel proof + metadata alongside the snapshot.
    const sentinelProof = await assertSentinels(page);
    const out = {
      _component: component,
      _state: state.state,
      _reducedMotion: reduced,
      _excludedProps: [...exclude],
      _sentinels: sentinelProof.map(s => ({ class: s.class, prop: s.prop, value: s.got })),
      styles: snapshot,
    };
    const file = join(BASELINE_DIR, `${component}.${state.state}.json`);
    await writeFile(file, JSON.stringify(out, null, 2) + '\n');
    return file;
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (!existsSync(FIXTURE_CSS)) {
    throw new Error(`Missing Tailwind fixture ${FIXTURE_CSS} — run npm run build:csp-fixture first.`);
  }
  await mkdir(BASELINE_DIR, { recursive: true });

  const browser = await chromium.launch();
  const written = [];
  try {
    for (const [component, states] of Object.entries(MATRIX)) {
      if (component.startsWith('_')) continue;
      const modulePath = MATRIX._meta.modules[component];
      if (!modulePath) throw new Error(`No module path for ${component} in matrix _meta.modules`);
      for (const state of states) {
        const file = await captureState(browser, component, modulePath, state);
        written.push(file);
        console.log(`  ✓ ${component}.${state.state}`);
      }
    }
  } finally {
    await browser.close();
  }

  const files = (await readdir(BASELINE_DIR)).filter(f => f.endsWith('.json'));
  console.log(`\nBaseline capture complete: ${written.length} states → ${files.length} JSON files in test/csp/baseline/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
