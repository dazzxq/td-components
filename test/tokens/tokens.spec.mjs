/**
 * Token-native gate (ADR 0008) — td.css under strict CSP in Chromium, Firefox and WebKit.
 *
 * Profiles:
 *   self   — `default-src 'self'; style-src 'self'; script-src 'self'`
 *   nonce  — `default-src 'self'; style-src 'nonce-td'; style-src-attr 'none'; script-src 'self'`
 *            (every <link> carries nonce="td")
 *
 * Per engine × profile:
 *   (A) zero CSP violations;
 *   (B) glass recipes resolve from public tokens; a SUBTREE override of --td-glass-bg reaches the
 *       surface (private aliases are never declared on :root);
 *   (C) fallbacks: html[data-td-glass="off"] → opaque --td-glass-solid, no backdrop-filter, on
 *       Regular / Clear / tint / dim — even though the site overrides --td-glass-bg unlayered;
 *   (D) dark tokens only with data-td-theme="dark" (no flip under a dark OS preference);
 *   (E) emulated media where the engine supports it: forced-colors, prefers-contrast: more,
 *       prefers-reduced-motion.
 * Informational probe (printed, not gated): CSSOM style writes and constructable stylesheets
 * under the nonce-only policy — decides whether legacy adoptStyles components can claim nonce support.
 *
 * Run: npm run test:tokens
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://tokens.local';
const TD_CSS = await readFile(join(ROOT, 'td.css'), 'utf8');

// Unlayered SITE stylesheet: themes the kit the way a real site would.
const SITE_CSS = `
:root { --td-glass-bg: rgb(200 100 50 / 40%); --td-glass-solid: rgb(9 9 9); }
.site-theme { --td-glass-bg: rgb(1 2 3 / 50%); }
.ref-canvas { background: Canvas; color: CanvasText; }
.ref-button { background: ButtonFace; color: ButtonText; }
`;

const BODY = `
<div id="page">
  <div class="td-glass-surface" id="reg">Regular</div>
  <div class="td-glass-surface td-glass-surface--strong" id="strong">Strong</div>
  <div class="td-glass-surface td-glass-surface--clear" id="clear">Clear</div>
  <div class="td-glass-dim" id="dim"></div>
  <button class="td-glass-tint" id="tint" type="button">Lưu</button>
  <div class="site-theme"><div class="td-glass-surface" id="sub">Sub</div></div>
  <div class="ref-canvas" id="refCanvas">ref</div>
  <button class="ref-button" id="refButton" type="button">ref</button>
</div>`;

const PROFILES = {
  self: { csp: "default-src 'self'; style-src 'self'; script-src 'self'", nonce: '' },
  nonce: { csp: "default-src 'self'; style-src 'nonce-td'; style-src-attr 'none'; script-src 'self'", nonce: 'td' },
};

const VIOLATION_INIT = `
  window.__v = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__v.push({ d: e.effectiveDirective || e.violatedDirective, uri: e.blockedURI, sample: e.sample || '' });
  });`;

function html(profile) {
  const n = PROFILES[profile].nonce ? ` nonce="${PROFILES[profile].nonce}"` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">` +
    `<link rel="stylesheet" href="${ORIGIN}/td.css"${n}>` +
    `<link rel="stylesheet" href="${ORIGIN}/site.css"${n}>` +
    `</head><body>${BODY}</body></html>`;
}

async function freshPage(browser, profile, media = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(VIOLATION_INIT);
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' ) {
      return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': PROFILES[profile].csp }, body: html(profile) });
    }
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: TD_CSS });
    if (url.pathname === '/site.css') return route.fulfill({ status: 200, contentType: 'text/css', body: SITE_CSS });
    return route.fulfill({ status: 404, body: '' });
  });
  if (Object.keys(media).length) await page.emulateMedia(media);
  await page.goto(`${ORIGIN}/`);
  return { page, context };
}

/** computed style snapshot of the fixture elements */
async function read(page) {
  return page.evaluate(() => {
    const out = {};
    for (const id of ['reg', 'strong', 'clear', 'dim', 'tint', 'sub', 'refCanvas', 'refButton']) {
      const cs = getComputedStyle(document.getElementById(id));
      out[id] = {
        bg: cs.backgroundColor,
        bf: cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter'),
        shadow: cs.boxShadow,
        color: cs.color,
      };
    }
    const rs = getComputedStyle(document.documentElement);
    out.root = {
      press: rs.getPropertyValue('--_td-glass-press').trim(),
      knob: rs.getPropertyValue('--_td-glass-lift-knob').trim(),
      dur: rs.getPropertyValue('--_td-glass-dur').trim(),
      ease: rs.getPropertyValue('--_td-glass-ease-flex').trim(),
    };
    out.violations = window.__v;
    return out;
  });
}

/** Parse "rgb(a, b, c)" / "rgba(a, b, c, d)" / "rgb(a b c / d)" → [r,g,b,a]. */
function rgba(str) {
  const m = String(str).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
}
function sameColor(got, want, tol = 0.02) {
  const a = rgba(got);
  if (!a) return false;
  return a.slice(0, 3).every((v, i) => Math.abs(v - want[i]) <= 1) && Math.abs(a[3] - want[3]) <= tol;
}
const noFilter = (v) => !v || v === 'none';

const failures = [];
const notes = [];
function check(label, ok, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Launch options: the bundled revision if installed, else the newest cached build of that engine
 * (Playwright's cache often holds a newer Firefox/WebKit than this playwright-core pins).
 * Override with TD_FIREFOX_PATH / TD_WEBKIT_PATH.
 */
async function launchOptions(name, launcher) {
  if (existsSync(launcher.executablePath())) return {};
  const env = { firefox: process.env.TD_FIREFOX_PATH, webkit: process.env.TD_WEBKIT_PATH }[name];
  if (env) return { executablePath: env };
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const rel = { firefox: 'firefox/Nightly.app/Contents/MacOS/firefox', webkit: 'pw_run.sh' }[name];
  if (!rel || !existsSync(cache)) return {};
  const dirs = (await readdir(cache)).filter((d) => d.startsWith(`${name}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = join(cache, d, rel);
    if (existsSync(exe)) { notes.push(`${name}: using cached build ${d}`); return { executablePath: exe }; }
  }
  return {};
}

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    for (const profile of Object.keys(PROFILES)) {
      const tag = `${name}/${profile}`;

      // (A)(B) normal state
      {
        const { page, context } = await freshPage(browser, profile);
        const s = await read(page);
        check(`${tag} zero CSP violations`, s.violations.length === 0, JSON.stringify(s.violations));
        check(`${tag} regular bg = site :root override`, sameColor(s.reg.bg, [200, 100, 50, 0.4]), s.reg.bg);
        check(`${tag} regular has backdrop blur`, /blur\(18px\)/.test(s.reg.bf), s.reg.bf);
        check(`${tag} strong bg = --td-glass-bg-strong`, sameColor(s.strong.bg, [250, 250, 251, 0.86]), s.strong.bg);
        check(`${tag} clear bg = --td-glass-clear-bg`, sameColor(s.clear.bg, [255, 255, 255, 0.08]), s.clear.bg);
        check(`${tag} dim bg = 35%`, sameColor(s.dim.bg, [0, 0, 0, 0.35]), s.dim.bg);
        check(`${tag} subtree override reaches surface`, sameColor(s.sub.bg, [1, 2, 3, 0.5]), s.sub.bg);

        // (C) glass off — beats the site's unlayered --td-glass-bg override
        await page.evaluate(() => document.documentElement.setAttribute('data-td-glass', 'off'));
        const o = await read(page);
        for (const id of ['reg', 'strong', 'sub']) {
          check(`${tag} glass-off ${id} opaque site solid`, sameColor(o[id].bg, [9, 9, 9, 1]), o[id].bg);
          check(`${tag} glass-off ${id} no backdrop-filter`, noFilter(o[id].bf), o[id].bf);
        }
        check(`${tag} glass-off clear opaque`, sameColor(o.clear.bg, [20, 20, 22, 0.92]), o.clear.bg);
        check(`${tag} glass-off clear no filter`, noFilter(o.clear.bf), o.clear.bf);
        check(`${tag} glass-off tint opaque accent`, sameColor(o.tint.bg, [37, 99, 235, 1]), o.tint.bg);
        check(`${tag} glass-off tint no filter`, noFilter(o.tint.bf), o.tint.bf);
        check(`${tag} glass-off dim transparent`, sameColor(o.dim.bg, [0, 0, 0, 0]), o.dim.bg);
        check(`${tag} glass-off zero violations`, o.violations.length === 0, JSON.stringify(o.violations));
        await page.evaluate(() => document.documentElement.removeAttribute('data-td-glass'));

        // (D) dark opt-in
        await page.evaluate(() => document.documentElement.setAttribute('data-td-theme', 'dark'));
        const d = await read(page);
        check(`${tag} dark strong bg`, sameColor(d.strong.bg, [30, 30, 32, 0.84]), d.strong.bg);
        await context.close();
      }

      // (D) dark OS preference alone must NOT flip
      {
        const { page, context } = await freshPage(browser, profile, { colorScheme: 'dark' });
        const s = await read(page);
        check(`${tag} no auto dark flip`, sameColor(s.strong.bg, [250, 250, 251, 0.86]), s.strong.bg);
        await context.close();
      }

      // (E) reduced motion
      {
        const { page, context } = await freshPage(browser, profile, { reducedMotion: 'reduce' });
        const s = await read(page);
        check(`${tag} reduced-motion press = 1`, s.root.press === '1', s.root.press);
        check(`${tag} reduced-motion knob lift = 1`, s.root.knob === '1', s.root.knob);
        check(`${tag} reduced-motion dur = 120ms`, s.root.dur === '120ms', s.root.dur);
        check(`${tag} reduced-motion ease = linear`, s.root.ease === 'linear', s.root.ease);
        // The shadow token must stay a real shadow (regression: it was once overwritten with `1`).
        check(`${tag} reduced-motion surface keeps its shadow`, /rgb/.test(s.reg.shadow), s.reg.shadow);
        await context.close();
      }

      // (E) forced colors (emulation is Chromium-only in Playwright)
      if (name === 'chromium') {
        const { page, context } = await freshPage(browser, profile, { forcedColors: 'active' });
        const s = await read(page);
        for (const id of ['reg', 'clear', 'tint', 'dim']) {
          check(`${tag} forced-colors ${id} no filter`, noFilter(s[id].bf), s[id].bf);
          check(`${tag} forced-colors ${id} no shadow`, s[id].shadow === 'none', s[id].shadow);
        }
        for (const id of ['reg', 'strong', 'clear']) {
          check(`${tag} forced-colors ${id} bg = Canvas`, s[id].bg === s.refCanvas.bg, `${s[id].bg} vs ${s.refCanvas.bg}`);
          check(`${tag} forced-colors ${id} fg = CanvasText`, s[id].color === s.refCanvas.color, `${s[id].color} vs ${s.refCanvas.color}`);
        }
        check(`${tag} forced-colors tint bg = ButtonFace`, s.tint.bg === s.refButton.bg, `${s.tint.bg} vs ${s.refButton.bg}`);
        check(`${tag} forced-colors tint fg = ButtonText`, s.tint.color === s.refButton.color, `${s.tint.color} vs ${s.refButton.color}`);
        check(`${tag} forced-colors dim transparent`, (rgba(s.dim.bg) || [0, 0, 0, 1])[3] === 0, s.dim.bg);
        await context.close();
      }

      // (E) increased contrast — only where the engine supports the emulation
      {
        let emu;
        try {
          emu = await freshPage(browser, profile, { contrast: 'more' });
        } catch (e) {
          notes.push(`${tag}: prefers-contrast emulation unavailable (${e.message.split('\n')[0]})`);
        }
        if (emu) {
          const matches = await emu.page.evaluate(() => matchMedia('(prefers-contrast: more)').matches);
          if (matches) {
            const s = await read(emu.page);
            check(`${tag} contrast-more regular opaque surface`, sameColor(s.reg.bg, [255, 255, 255, 1]), s.reg.bg);
            check(`${tag} contrast-more regular no filter`, noFilter(s.reg.bf), s.reg.bf);
          } else {
            notes.push(`${tag}: prefers-contrast emulation not honoured by engine`);
          }
          await emu.context.close();
        }
      }

      // Informational probe: CSSOM + constructable sheets under this profile
      {
        const { page, context } = await freshPage(browser, profile);
        const probe = await page.evaluate(() => {
          const a = document.createElement('div');
          document.body.appendChild(a);
          a.style.setProperty('color', 'rgb(1, 2, 3)');
          const cssom = getComputedStyle(a).color === 'rgb(1, 2, 3)';
          let adopted = 'unsupported';
          try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync('.__probe { color: rgb(4, 5, 6); }');
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
            const b = document.createElement('div');
            b.className = '__probe';
            document.body.appendChild(b);
            adopted = getComputedStyle(b).color === 'rgb(4, 5, 6)' ? 'applied' : 'blocked';
          } catch (e) {
            adopted = `error: ${e.message}`;
          }
          return { cssom, adopted, violations: window.__v.length };
        });
        notes.push(`${tag}: probe CSSOM style writes ${probe.cssom ? 'applied' : 'BLOCKED'}; adoptedStyleSheets ${probe.adopted}; violations ${probe.violations}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
await runEngine('webkit', webkit);

console.log('--- notes ---');
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log('Token gate: all checks passed (chromium, firefox, webkit × self, nonce).');
