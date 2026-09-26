/**
 * Task 1 — NON-VACUOUS CSP PARITY GATE.
 *
 * Standalone Playwright harness (imports the EXPLICIT `playwright-core` devDep, NOT
 * web-test-runner). For EACH component × EACH matrix state from matrix.json it:
 *
 *   1. Serves the mount page AND all module/CSS requests from the SAME fake origin
 *      http://csp.local/ via page.route().fulfill() from disk — IDENTICAL to
 *      capture-baseline.mjs — with ONE difference: the HTML document response
 *      carries a strict CSP header:
 *          content-security-policy: default-src 'self'; style-src 'self'; script-src 'self'
 *      The external same-origin fixture tailwind.css is 'self' → allowed. Inline
 *      `style=` attributes and JS-injected <style> elements → BLOCKED (the point).
 *   2. Captures every CSP violation: a page-init script listens for the
 *      `securitypolicyviolation` DOM event and forwards it to node via an exposed
 *      binding (__cspViolation). console + pageerror are also recorded.
 *   3. Reaches the state with the SAME mechanics as capture (markup / setup JS,
 *      RAF settle, focus pseudo-driver).
 *   4. Asserts per state:
 *        (A) ZERO CSP violations.
 *        (B) Computed-style parity vs baseline/<component>.<state>.json — only the
 *            style-props.json props, minus the state's excludeProps. Numeric/px
 *            values: ±0.5px tolerance. Everything else: exact string match (both
 *            sides are getComputedStyle serialisations → already same format).
 *        (C) Render/behaves: every baseline selector is present; no thrown error;
 *            portaled elements (modal/toast/loading/dropdown) found on document.body.
 *   5. Sentinel pre-check on every fresh page BEFORE parity (the same 3 sentinels the
 *      baseline used). If a sentinel fails the WHOLE suite aborts — parity can never
 *      mean "both unstyled".
 *   6. Animation liveness (td-loading): in the inline + overlay spinner states sample
 *      transform/stroke-dashoffset at t0 and t+250ms and assert it CHANGED (animation
 *      running). A prefers-reduced-motion case asserts the OVERLAY arc does NOT animate.
 *
 * Clean-component proof: td-tooltip, td-modal-stack, td-base-element have NO blocking
 * construct and NO matrix states; we import + exercise each under the strict CSP and
 * assert ZERO violations — proving the gate PASSES for clean code (non-vacuous on both
 * sides).
 *
 * Exit non-zero on any failure.
 *
 * Run: npm run test:csp
 */
import { chromium } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
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
// Profiles (ADR 0008 mixed period):
//   legacy     — Tailwind fixture only (default; the original gate, unchanged)
//   legacy+td  — Tailwind fixture THEN the kit's td.css. Compared against the SAME legacy
//                baselines → proves td.css is reset-free for legacy components.
const PROFILE = process.env.CSP_PROFILE || 'legacy';
if (!['legacy', 'legacy+td'].includes(PROFILE)) throw new Error(`unknown CSP_PROFILE: ${PROFILE}`);
const EXTRA_CSS = PROFILE === 'legacy+td' ? `<link rel="stylesheet" href="${'http://csp.local'}/td.css">` : '';
const CSP_HEADER = "default-src 'self'; style-src 'self'; script-src 'self'";
const PX_TOLERANCE = 0.5;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };

/** Map an http://csp.local/<path> URL to a file on disk (identical to capture). */
function urlToFile(url) {
  const u = new URL(url);
  if (u.pathname.startsWith('/fixture/')) return join(__dirname, u.pathname.slice(1));
  return join(REPO_ROOT, u.pathname.replace(/^\/+/, ''));
}

/**
 * Fulfill every request from disk under the fake origin. The HTML document carries
 * the strict CSP header; everything else (modules, the external fixture stylesheet)
 * is served plainly — same-origin 'self', so the stylesheet is allowed.
 */
async function fulfillFromDisk(route, request) {
  const url = request.url();
  const u = new URL(url);
  if (u.pathname === '/' || u.pathname === '/mount.html') {
    const p = u.searchParams.get('profile') || PROFILE;
    const TW = `<link rel="stylesheet" href="${ORIGIN}/fixture/tailwind.css">`;
    const TD = `<link rel="stylesheet" href="${ORIGIN}/td.css">`;
    const css = p === 'td' ? TD : p === 'legacy+td' ? TW + TD : TW;
    const html = `<!doctype html><html><head><meta charset="utf-8">` + css +
      `</head><body><div id="__mount"></div></body></html>`;
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'content-security-policy': CSP_HEADER },
      body: html,
    });
  }
  try {
    const file = urlToFile(url);
    const body = await readFile(file);
    return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body });
  } catch (e) {
    return route.fulfill({ status: 404, contentType: 'text/plain', body: `not found: ${url}\n${e.message}` });
  }
}

/** Page-init script: report every CSP violation to node + record on window. */
const VIOLATION_INIT = `
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    const v = {
      violatedDirective: e.violatedDirective,
      effectiveDirective: e.effectiveDirective,
      blockedURI: e.blockedURI,
      sample: e.sample || '',
      sourceFile: e.sourceFile || '',
      lineNumber: e.lineNumber || 0,
    };
    window.__cspViolations.push(v);
    if (window.__cspViolation) { try { window.__cspViolation(JSON.stringify(v)); } catch (_) {} }
  });
`;

/** Read computed style of `selector` for the chosen props (identical to capture). */
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
async function checkSentinels(page, pageProfile = PROFILE) {
  const tdSentinel = async () => {
    const got = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--td-glass-radius').trim());
    return { class: ':root (td.css)', prop: '--td-glass-radius', expected: '20px', got, ok: got === '20px' };
  };
  if (pageProfile === 'td') return [await tdSentinel()];
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
  if (pageProfile === 'legacy+td') {
    // td.css must really be applied (a 404 would make the combined run pass vacuously).
    result.push(await tdSentinel());
  }
  return result;
}

/**
 * Fresh page identical to capture's freshPage, plus: install the violation listener
 * BEFORE any document script runs (addInitScript), expose the __cspViolation binding,
 * and collect console / pageerror text that looks CSP-related.
 */
async function freshPage(browser, reducedMotion, pageProfile = PROFILE) {
  const ctx = await browser.newContext(reducedMotion ? { reducedMotion: 'reduce' } : {});
  const page = await ctx.newPage();
  const violations = [];
  const errors = [];
  const consoleCsp = [];

  await page.exposeBinding('__cspViolation', (_src, json) => {
    try { violations.push(JSON.parse(json)); } catch (_) { violations.push({ raw: json }); }
  });
  await page.addInitScript(VIOLATION_INIT);

  page.on('pageerror', (err) => { errors.push(String(err && err.message || err)); });
  page.on('console', (msg) => {
    const t = msg.text();
    if (/content security policy|refused to (apply|execute|load)|unsafe-inline|securitypolicyviolation/i.test(t)) {
      consoleCsp.push(t);
    }
  });

  await page.route('**/*', (route, request) => fulfillFromDisk(route, request));
  await page.goto(`${ORIGIN}/mount.html?profile=${encodeURIComponent(pageProfile)}`, { waitUntil: 'load' });
  await page.evaluate(() => { window.__mount = document.getElementById('__mount'); });
  return { ctx, page, violations, errors, consoleCsp };
}

/** Compare a computed snapshot against the baseline for one state. Returns mismatches[]. */
function compareStyles(component, stateName, baselineStyles, snapshot, props) {
  const mismatches = [];
  for (const [sel, baseProps] of Object.entries(baselineStyles)) {
    const got = snapshot[sel];
    if (!got || got.__missing) {
      mismatches.push({ sel, prop: '*', expected: '(element present)', got: '(element MISSING)' });
      continue;
    }
    for (const p of props) {
      if (!(p in baseProps)) continue; // baseline excluded this prop for this state
      const exp = baseProps[p];
      const act = got[p];
      if (exp === act) continue;
      // px / numeric tolerance: compare token-by-token (handles "90px, 150px", "0px 1px 0px", etc.)
      if (numericClose(exp, act)) continue;
      mismatches.push({ sel, prop: p, expected: exp, got: act });
    }
  }
  return mismatches;
}

/**
 * Tolerant numeric compare for COMPUTED-STYLE strings. The tolerance (±PX_TOLERANCE) is
 * applied ONLY to pixel-bearing tokens (a number immediately followed by `px`) — those
 * are the sub-pixel layout values the spec allows to drift. Every OTHER numeric token
 * (opacity `0.5`, z-index `10`, font-weight `400`, unitless line-height, RGB/oklch color
 * channels, unitless SVG values) must match EXACTLY — so a `opacity 0` vs `0.4` or a color
 * regression is never masked. The non-numeric skeleton must also match exactly.
 *
 * Strategy: tokenise into a sequence of {kind:'px'|'num'|'lit', text}. Skeletons (px and
 * num collapsed to placeholders, literals kept) must be identical; px tokens compared with
 * tolerance; plain numeric tokens compared exactly (string-equal).
 */
function tokenizeStyle(s) {
  // Greedily match a px length (number + 'px'), else a bare number, else exactly ONE
  // literal character. Literal chars are compared exactly and en-masse via skeleton, so
  // single-char granularity is fine and avoids mis-splitting words like 'none'/'rgba'.
  const re = /(-?\d*\.?\d+(?:e[-+]?\d+)?)px\b|(-?\d*\.?\d+(?:e[-+]?\d+)?)|([\s\S])/gi;
  const toks = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) toks.push({ kind: 'px', num: parseFloat(m[1]) });
    else if (m[2] !== undefined) toks.push({ kind: 'num', text: m[2] });
    else toks.push({ kind: 'lit', text: m[3] });
  }
  return toks;
}

function numericClose(a, b) {
  if (a === b) return true;
  const ta = tokenizeStyle(a);
  const tb = tokenizeStyle(b);
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i++) {
    const x = ta[i], y = tb[i];
    if (x.kind !== y.kind) return false;
    if (x.kind === 'px') {
      if (Math.abs(x.num - y.num) > PX_TOLERANCE) return false;
    } else if (x.kind === 'num') {
      if (x.text !== y.text) return false;            // unitless numerics: EXACT
    } else {
      if (x.text !== y.text) return false;            // literal skeleton: EXACT
    }
  }
  return true;
}

async function runState(browser, component, modulePath, state) {
  const reduced = !!state.reducedMotion;
  // Token-native components: td.css only in the default run; Tailwind + td.css in the combined run.
  const tokenNative = (MATRIX._meta.tokenNative || []).includes(component);
  const pageProfile = tokenNative ? (PROFILE === 'legacy' ? 'td' : 'legacy+td') : PROFILE;
  const { ctx, page, violations, errors, consoleCsp } = await freshPage(browser, reduced, pageProfile);
  const result = { component, state: state.state, pass: true, reasons: [] };
  try {
    // (5) Sentinel gate — fixture must be live under strict CSP, or the whole suite aborts.
    const sentinels = await checkSentinels(page, pageProfile);
    const badSentinels = sentinels.filter(s => !s.ok);
    if (badSentinels.length) {
      const detail = badSentinels.map(b => `.${b.class}{${b.prop}} expected ${b.expected} got "${b.got}"`).join('; ');
      throw new SentinelError(`SENTINEL FAILURE under CSP (fixture not live): ${detail}`);
    }

    // Import the real source module (identical to capture).
    let importError = null;
    try {
      await page.evaluate(async ({ origin, modulePath }) => {
        const m = await import(`${origin}${modulePath}`);
        for (const k of Object.keys(m)) window[k] = m[k];
      }, { origin: ORIGIN, modulePath });
    } catch (e) { importError = String(e && e.message || e); }

    // Reach the state.
    if (importError == null) {
      try {
        if (state.markup) {
          await page.evaluate((html) => { window.__mount.innerHTML = html; }, state.markup);
        } else if (state.setup) {
          await page.evaluate(`(async () => { ${state.setup} })()`);
        }
      } catch (e) { importError = String(e && e.message || e); }
    }

    // Settle (identical to capture).
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (state.settle) await page.waitForTimeout(state.settle);
    if (state.pseudo === 'focus' && state.focusSelector) {
      await page.evaluate((sel) => {
        const el = (window.__mount.querySelector(sel) || document.querySelector(sel));
        if (el) el.focus();
      }, state.focusSelector);
      await page.waitForTimeout(state.settle || 300);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    }

    // Load baseline.
    const baseFile = join(BASELINE_DIR, `${component}.${state.state}.json`);
    const baseline = JSON.parse(await readFile(baseFile, 'utf8'));
    const baselineStyles = baseline.styles;

    const exclude = new Set(state.excludeProps || []);
    const props = STYLE_PROPS.filter(p => !exclude.has(p));
    const portalSet = new Set(state.portal || []);

    // (C) render snapshot + presence.
    const snapshot = {};
    for (const sel of Object.keys(baselineStyles)) {
      const fromBody = portalSet.has(sel);
      const computed = await page.evaluate(({ fn, sel, props, fromBody }) => {
        return (new Function('return ' + fn))()(sel, props, fromBody);
      }, { fn: READ_FN, sel, props, fromBody });
      snapshot[sel] = computed;
    }

    // ---- Assertions ----
    // (C) render / no thrown error (synchronous import/setup throw OR async pageerror)
    if (importError) result.reasons.push({ kind: 'render', detail: `error during render/setup: ${importError}` });
    if (errors.length) result.reasons.push({ kind: 'pageerror', detail: `uncaught page error(s): ${errors.slice(0, 3).join(' | ')}` });

    // (A) zero CSP violations
    if (violations.length) {
      const sample = violations.slice(0, 4).map(v => `${v.violatedDirective || v.effectiveDirective || '?'}[${v.blockedURI || ''}]${v.sample ? ' «' + v.sample.slice(0, 40) + '»' : ''}`);
      result.reasons.push({ kind: 'csp-violation', detail: `${violations.length} violation(s): ${sample.join(', ')}` });
    } else if (consoleCsp.length) {
      result.reasons.push({ kind: 'csp-violation', detail: `console CSP error: ${consoleCsp[0].slice(0, 120)}` });
    }

    // (B) parity
    const mismatches = compareStyles(component, state.state, baselineStyles, snapshot, props);
    if (mismatches.length) {
      const sample = mismatches.slice(0, 5).map(m => `${m.sel}{${m.prop}} expected "${m.expected}" got "${m.got}"`);
      result.reasons.push({ kind: 'parity-mismatch', detail: `${mismatches.length} prop(s): ${sample.join(' | ')}` });
    }

    // (6) Animation liveness for td-loading
    if (component === 'td-loading') {
      const live = await assertLoadingLiveness(page, state, reduced);
      if (live) result.reasons.push({ kind: 'animation', detail: live });
    }

    result.pass = result.reasons.length === 0;
    return result;
  } catch (e) {
    if (e instanceof SentinelError) throw e;
    result.pass = false;
    result.reasons.push({ kind: 'render', detail: `harness exception: ${String(e && e.message || e)}` });
    return result;
  } finally {
    await ctx.close();
  }
}

class SentinelError extends Error {}

/**
 * (6) Animation liveness. For td-loading spinner states: sample an animatable prop at
 * t0 and t+250ms; the prop MUST change while the animation runs. The arc selector is
 * the inner <circle>; for the overlay state it's `.td-spinner-arc`, for inline states
 * the second <circle>. Under reduced motion (overlay) the arc must NOT animate.
 * Returns an error string if the liveness expectation is violated, else null.
 */
async function assertLoadingLiveness(page, state, reduced) {
  const isOverlay = state.state === 'overlay';
  const arcSel = isOverlay ? '.td-loading__spinner .td-spinner__arc' : '.td-spinner__arc';
  const rotSel = isOverlay ? '.td-loading__spinner .td-spinner__svg' : '.td-spinner__svg';
  const fromBody = isOverlay; // overlay is portaled to body

  const sample = async () => page.evaluate(({ arcSel, rotSel, fromBody }) => {
    const scope = fromBody ? document : document.getElementById('__mount');
    const arc = (scope && scope.querySelector(arcSel)) || document.querySelector(arcSel);
    const rot = (scope && scope.querySelector(rotSel)) || document.querySelector(rotSel);
    const arcCs = arc ? getComputedStyle(arc) : null;
    const rotCs = rot ? getComputedStyle(rot) : null;
    return {
      hasArc: !!arc,
      hasRot: !!rot,
      dashoffset: arcCs ? arcCs.getPropertyValue('stroke-dashoffset').trim() : '',
      arcTransform: arcCs ? arcCs.getPropertyValue('transform').trim() : '',
      rotTransform: rotCs ? rotCs.getPropertyValue('transform').trim() : '',
    };
  }, { arcSel, rotSel, fromBody });

  const t0 = await sample();
  if (!t0.hasArc || !t0.hasRot) return `liveness: spinner element(s) missing (arc=${t0.hasArc} rot=${t0.hasRot})`;
  await page.waitForTimeout(250);
  const t1 = await sample();

  // The rotation container's transform (rotate) is the clearest live signal; the arc's
  // stroke-dashoffset is the second. Either changing = animation running.
  const rotChanged = t0.rotTransform !== t1.rotTransform;
  const dashChanged = t0.dashoffset !== t1.dashoffset;
  const arcMoved = t0.arcTransform !== t1.arcTransform;
  const moving = rotChanged || dashChanged || arcMoved;

  if (reduced) {
    // Overlay under reduced-motion: arc animation is `none`; the ARC must be fully frozen
    // — neither its stroke-dashoffset NOR its transform may tick. (The container still
    // rotates slowly per the reduced-motion rule; we assert only the ARC, matching the
    // source's `@media reduce { .td-spinner-arc { animation:none } }`.)
    if (dashChanged || arcMoved) {
      return `reduced-motion: arc changed but should be frozen — dashoffset "${t0.dashoffset}"->"${t1.dashoffset}", arcTransform "${t0.arcTransform}"->"${t1.arcTransform}"`;
    }
    return null;
  }
  // Live state: SOMETHING must move. Pre-refactor under CSP the injected <style>+keyframes
  // are DEAD, so nothing moves → this correctly FAILS (expected pre-refactor).
  if (!moving) {
    return `liveness: animation DEAD under CSP — rotTransform "${t0.rotTransform}"=="${t1.rotTransform}", dashoffset "${t0.dashoffset}"=="${t1.dashoffset}" (keyframes injected via <style> are blocked)`;
  }
  return null;
}

/**
 * Clean-component proof: import + exercise each CSP-CLEAN module under the strict CSP
 * and assert ZERO violations. These have no matrix states / no blocking construct, so
 * "the gate passes for clean code" is proven here rather than via parity.
 */
async function runCleanComponent(browser, name, modulePath, exercise) {
  const { ctx, page, violations, errors, consoleCsp } = await freshPage(browser, false);
  const result = { component: name, state: 'clean-smoke', pass: true, reasons: [] };
  try {
    const sentinels = await checkSentinels(page);
    if (sentinels.some(s => !s.ok)) throw new SentinelError(`SENTINEL FAILURE (clean ${name})`);

    let err = null;
    try {
      // Import the module EXACTLY like the affected path (page.evaluate with a function
      // arg — runs in Playwright's isolated world, CSP-exempt — so the import itself is
      // not what we're testing; the component's own DOM writes ARE under page CSP).
      await page.evaluate(async ({ origin, modulePath }) => {
        const m = await import(`${origin}${modulePath}`);
        for (const k of Object.keys(m)) window[k] = m[k];
      }, { origin: ORIGIN, modulePath });
      // Run the exercise via page.evaluate(string) — IDENTICAL mechanism to the affected
      // `setup` strings (no `new Function`, so no spurious script-src eval violation).
      await page.evaluate(`(async () => { ${exercise} })()`);
    } catch (e) { err = String(e && e.message || e); }

    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(50);

    if (err) result.reasons.push({ kind: 'render', detail: `error: ${err}` });
    if (errors.length) result.reasons.push({ kind: 'pageerror', detail: `uncaught page error(s): ${errors.slice(0, 3).join(' | ')}` });
    if (violations.length) {
      const sample = violations.slice(0, 4).map(v => `${v.violatedDirective || v.effectiveDirective}[${v.blockedURI || ''}]`);
      result.reasons.push({ kind: 'csp-violation', detail: `${violations.length}: ${sample.join(', ')}` });
    } else if (consoleCsp.length) {
      result.reasons.push({ kind: 'csp-violation', detail: `console: ${consoleCsp[0].slice(0, 100)}` });
    }
    result.pass = result.reasons.length === 0;
    return result;
  } catch (e) {
    if (e instanceof SentinelError) throw e;
    result.pass = false;
    result.reasons.push({ kind: 'render', detail: String(e && e.message || e) });
    return result;
  } finally {
    await ctx.close();
  }
}

// Clean components (no matrix states; proven CSP-clean in INVENTORY.md). Each exercise
// drives the module's real code path so any inline-style/`<style>` it WOULD emit fires.
const CLEAN = [
  {
    name: 'td-tooltip',
    module: '/src/feedback/td-tooltip.js',
    // Importing auto-inits the singleton (creates the tooltip el via CSSOM). Force a show.
    exercise: `
      const btn = document.createElement('button');
      btn.setAttribute('data-tooltip', 'Hi there');
      btn.textContent = 'hover me';
      window.__mount.appendChild(btn);
      const t = (window.tdTooltip || window.TdTooltip);
      if (window.TdTooltip && !window.tdTooltip) { /* singleton auto-created on import */ }
      // Trigger via the singleton if exposed, else dispatch a mouseenter the auto-init listens for.
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: r.left, clientY: r.top }));
      await new Promise(res => setTimeout(res, 60));
    `,
  },
  {
    name: 'td-modal-stack',
    module: '/src/feedback/td-modal-stack.js',
    exercise: `
      const Mgr = window.TdModalStackManager;
      if (Mgr) {
        const mgr = new Mgr();
        const el = document.createElement('div');
        document.body.appendChild(el);
        if (typeof mgr.register === 'function') mgr.register(el);
        if (typeof mgr.push === 'function') mgr.push(el);
      }
    `,
  },
  {
    name: 'td-base-element',
    module: '/src/base/td-base-element.js',
    exercise: `
      const Base = window.TdBaseElement;
      if (Base && !customElements.get('td-csp-probe')) {
        class Probe extends Base {
          render() { return '<div class="rounded-xl px-2">probe</div>'; }
        }
        customElements.define('td-csp-probe', Probe);
      }
      const el = document.createElement('td-csp-probe');
      window.__mount.appendChild(el);
    `,
  },
];

function fmt(result) {
  const tag = result.pass ? 'PASS' : 'FAIL';
  if (result.pass) return `  ${tag}  ${result.component}.${result.state}`;
  const why = result.reasons.map(r => `[${r.kind}] ${r.detail}`).join('\n           ');
  return `  ${tag}  ${result.component}.${result.state}\n           ${why}`;
}

async function main() {
  if (!existsSync(FIXTURE_CSS)) {
    throw new Error(`Missing Tailwind fixture ${FIXTURE_CSS} — run npm run build:csp-fixture first.`);
  }

  // Optional component filter (orchestration aid): `node csp.spec.mjs td-checkbox td-toggle`
  // runs ONLY those components in isolation. No args = full suite (unchanged behavior).
  const FILTER = process.argv.slice(2).filter(Boolean);
  const inFilter = (name) => FILTER.length === 0 || FILTER.includes(name);

  const browser = await chromium.launch();
  const results = [];
  const cleanResults = [];
  try {
    console.log(`\nCSP GATE — strict header: content-security-policy: ${CSP_HEADER}`);
    console.log(`Origin: ${ORIGIN}  | px tolerance: ±${PX_TOLERANCE}px`);
    if (FILTER.length) console.log(`Filter: ${FILTER.join(', ')}`);
    console.log('');

    console.log('=== AFFECTED components (must FAIL pre-refactor) ===');
    for (const [component, states] of Object.entries(MATRIX)) {
      if (component.startsWith('_')) continue;
      if (!inFilter(component)) continue;
      const modulePath = MATRIX._meta.modules[component];
      if (!modulePath) throw new Error(`No module path for ${component} in matrix _meta.modules`);
      for (const state of states) {
        const r = await runState(browser, component, modulePath, state);
        results.push(r);
        console.log(fmt(r));
      }
    }

    console.log('\n=== CLEAN components (must PASS pre-refactor) ===');
    for (const c of CLEAN) {
      if (!inFilter(c.name)) continue;
      const r = await runCleanComponent(browser, c.name, c.module, c.exercise);
      cleanResults.push(r);
      console.log(fmt(r));
    }
  } finally {
    await browser.close();
  }

  // ---- Summary ----
  const all = [...results, ...cleanResults];
  const failed = all.filter(r => !r.pass);
  const passed = all.filter(r => r.pass);

  // Per-component roll-up (a component is "failing" if any of its states fails).
  const affectedComponents = new Set(results.map(r => r.component));
  const affectedFailing = new Set(results.filter(r => !r.pass).map(r => r.component));
  const affectedAllPass = [...affectedComponents].filter(c => !affectedFailing.has(c));
  const cleanPassing = cleanResults.filter(r => r.pass).map(r => r.component);
  const cleanFailing = cleanResults.filter(r => !r.pass).map(r => r.component);

  console.log('\n========================= SUMMARY =========================');
  console.log(`Profile: ${PROFILE}`);
  console.log(`States: ${passed.length} PASS / ${failed.length} FAIL (of ${all.length})`);
  console.log(`Affected components FAILING (≥1 failing state): ${affectedFailing.size}/${affectedComponents.size}`);
  console.log(`  ${[...affectedFailing].sort().join(', ') || '(none)'}`);
  if (affectedAllPass.length) {
    console.log(`Affected components with ALL states passing: ${affectedAllPass.length}`);
    console.log(`  ${affectedAllPass.sort().join(', ')}`);
  }
  console.log(`Clean components PASSING: ${cleanPassing.length}/${cleanResults.length}  [${cleanPassing.join(', ')}]`);
  if (cleanFailing.length) console.log(`Clean components FAILING: ${cleanFailing.join(', ')}`);
  console.log('===========================================================\n');

  // ---- Gate exit policy ----
  // The gate's correctness contract: it is the parity gate the refactors must satisfy.
  // It FAILS (non-zero) whenever ANY state or clean smoke fails. Pre-refactor that means
  // the affected components fail (expected) AND clean ones pass; post-refactor everything
  // must pass for the gate to go green. We exit non-zero if anything failed.
  if (failed.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error('\nFATAL:', e && e.stack || e); process.exit(1); });
