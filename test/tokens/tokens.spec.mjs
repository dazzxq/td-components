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
 *   (B) surface recipes resolve from public tokens; a SUBTREE override of --td-glass-bg reaches the
 *       surface (private aliases are never declared on :root);
 *   (B2) v0.20.0 minimal surfaces, per selector of the plan's mapping table: opaque group (modal dialog, loading
 *       card, tooltip, scroll-top) and every button (incl. --custom) have no backdrop-filter and a solid fill; the
 *       small popups (menu, dropdown, chip-input suggestions, hovercard, toast) blur(12px) on 94 %; lightbox
 *       toolbar / counter blur(12px) on dark 88 %; no surface or button paints a background-image (sheen / wash);
 *       the -tint alias still colours its button; every fallback still forces them solid / unfiltered;
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
.alias-tint { --td-btn-danger-tint: rgb(10 20 30); }
.custom-colour { --td-btn-bg: rgb(200 10 10); --td-btn-fg: rgb(255 255 255); }
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
  <div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg" id="s-modal">m</div>
  <div class="td-loading__card td-glass-surface td-glass-surface--strong" id="s-loading">l</div>
  <div class="td-tooltip td-glass-surface td-glass-surface--strong" id="s-tooltip">t</div>
  <button class="td-scroll-top td-glass-surface td-glass-surface--strong" id="s-scrolltop" type="button">^</button>
  <div class="td-menu td-glass-surface td-glass-surface--strong" id="s-menu">m</div>
  <div class="td-dropdown__menu td-glass-surface td-glass-surface--strong" id="s-dropdown">d</div>
  <div class="td-chip-input__menu td-glass-surface td-glass-surface--strong" id="s-chip">c</div>
  <div class="td-hovercard td-glass-surface td-glass-surface--strong" id="s-hovercard">h</div>
  <div class="td-toast td-toast--success td-glass-surface td-glass-surface--strong" id="s-toast">t</div>
  <div class="td-lightbox__toolbar td-glass-surface td-glass-surface--clear" id="s-lbtoolbar">b</div>
  <div class="td-lightbox__counter td-glass-surface td-glass-surface--clear" id="s-lbcounter">1/2</div>
  <button class="td-btn td-btn--primary" id="b-primary" type="button">b</button>
  <button class="td-btn td-btn--secondary" id="b-secondary" type="button">b</button>
  <button class="td-btn td-btn--success" id="b-success" type="button">b</button>
  <button class="td-btn td-btn--danger" id="b-danger" type="button">b</button>
  <button class="td-btn td-btn--info" id="b-info" type="button">b</button>
  <button class="td-btn td-btn--warning" id="b-warning" type="button">b</button>
  <span class="custom-colour"><button class="td-btn td-btn--primary td-btn--custom" id="b-custom" type="button">b</button></span>
  <span class="alias-tint"><button class="td-btn td-btn--danger" id="b-alias" type="button">b</button></span>
</div>`;

const OPAQUE = ['s-modal', 's-loading', 's-tooltip', 's-scrolltop'];
const BLURRED = ['s-menu', 's-dropdown', 's-chip', 's-hovercard', 's-toast'];
const CLEAR = ['s-lbtoolbar', 's-lbcounter'];
const BUTTONS = ['b-primary', 'b-secondary', 'b-success', 'b-danger', 'b-info', 'b-warning', 'b-custom', 'b-alias'];
const SURFACES = [...OPAQUE, ...BLURRED, ...CLEAR];

const PROFILES = {
  self: { csp: "default-src 'self'; style-src 'self'; script-src 'self'", nonce: '' },
  nonce: { csp: "default-src 'self'; style-src 'nonce-td'; style-src-attr 'none'; script-src 'self'", nonce: 'td' },
};

const VIOLATION_INIT = `
  window.__v = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__v.push({ d: e.effectiveDirective || e.violatedDirective, uri: e.blockedURI, sample: e.sample || '' });
  });`;

function lightboxHtml(profile) {
  const n = PROFILES[profile].nonce ? ` nonce="${PROFILES[profile].nonce}"` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">` +
    `<link rel="stylesheet" href="${ORIGIN}/td.css"${n}>` +
    `<script type="module" src="${ORIGIN}/test/tokens/lightbox-page.js"${n}></script>` +
    `</head><body><p>page</p></body></html>`;
}

/** Floating layer (v0.20.0 minimal surfaces): popups blurred, modal opaque, the toast keeps its surface over a modal
 *  (no "covered" solid override any more), everything opaque with glass off. */
function floatingChecks(tag, r, mode) {
  const opaque = (bg) => (rgba(bg) || [0, 0, 0, 0])[3] === 1;
  for (const [k, v] of [['light', r.sticky], ['dark', r.stickyDark]]) {
    check(`${tag} ${mode} table sticky header (${k}) sticky + opaque`, v.position === 'sticky' && opaque(v.bg), JSON.stringify(v));
  }
  for (const [k, g, off] of [['menu', r.menuGlass, r.menuOff], ['chip suggestions', r.sugGlass, r.sugOff]]) {
    check(`${tag} ${mode} ${k} popover is glass (control)`, !noFilter(g.bf), JSON.stringify(g));
    check(`${tag} ${mode} glass off → ${k} opaque, no filter`, noFilter(off.bf) && opaque(off.bg), JSON.stringify(off));
  }
  check(`${tag} ${mode} modal dialog is opaque, no blur`, noFilter(r.modalGlass.bf) && opaque(r.modalGlass.bg), JSON.stringify(r.modalGlass));
  check(`${tag} ${mode} toast is blurred (control)`, !noFilter(r.toastAlone.bf), r.toastAlone.bf);
  check(`${tag} ${mode} toast over modal keeps its surface`, r.toastOverModal.bf === r.toastAlone.bf && r.toastOverModal.bg === r.toastAlone.bg, JSON.stringify(r.toastOverModal));
  check(`${tag} ${mode} glass off → modal opaque, no filter`, noFilter(r.modalOff.bf) && opaque(r.modalOff.bg), JSON.stringify(r.modalOff));
  check(`${tag} ${mode} glass off → toast opaque, no filter`, noFilter(r.toastOff.bf) && opaque(r.toastOff.bg), JSON.stringify(r.toastOff));
}

function componentsHtml(profile) {
  const n = PROFILES[profile].nonce ? ` nonce="${PROFILES[profile].nonce}"` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">` +
    `<link rel="stylesheet" href="${ORIGIN}/td.css"${n}>` +
    `<script type="module" src="${ORIGIN}/test/tokens/components-page.js"${n}></script>` +
    `</head><body><div id="root"></div></body></html>`;
}

const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };

function html(profile) {
  const n = PROFILES[profile].nonce ? ` nonce="${PROFILES[profile].nonce}"` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">` +
    `<link rel="stylesheet" href="${ORIGIN}/td.css"${n}>` +
    `<link rel="stylesheet" href="${ORIGIN}/site.css"${n}>` +
    `</head><body>${BODY}</body></html>`;
}

async function freshPage(browser, profile, media = {}, page0 = 'glass') {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(VIOLATION_INIT);
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' ) {
      const body = page0 === 'lightbox' ? lightboxHtml(profile) : page0 === 'components' ? componentsHtml(profile) : html(profile);
      return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': PROFILES[profile].csp }, body });
    }
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: TD_CSS });
    if (url.pathname === '/site.css') return route.fulfill({ status: 200, contentType: 'text/css', body: SITE_CSS });
    if (/^\/(src|test)\//.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      return readFile(join(ROOT, url.pathname))
        .then((body) => route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body }))
        .catch(() => route.fulfill({ status: 404, body: '' }));
    }
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
    const ids = [...document.querySelectorAll('#page [id]')].map((n) => n.id);
    for (const id of ids) {
      const cs = getComputedStyle(document.getElementById(id));
      out[id] = {
        bg: cs.backgroundColor,
        bf: cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter'),
        shadow: cs.boxShadow,
        color: cs.color,
        image: cs.backgroundImage,
      };
    }
    const rs = getComputedStyle(document.documentElement);
    out.root = {
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
const opaqueBg = (bg) => (rgba(bg) || [0, 0, 0, 0])[3] === 1;
/** 'none', or only fully transparent shadows (the fallbacks write `0 0 0 0 transparent`) */
const noShadow = (v) => v === 'none' || String(v).split(/,(?![^(]*\))/).every((p) => /rgba\(0, 0, 0, 0\)|transparent/.test(p));
const BLUR12 = /^blur\(12px\)$/;
const COLOR_FN = /rgba?\(/g;

/** v0.20.0 per-selector material checks (normal state, light theme; the site solid is rgb(9 9 9)). */
function materialChecks(tag, s) {
  for (const id of OPAQUE) {
    check(`${tag} ${id} opaque = --td-glass-solid`, sameColor(s[id].bg, [9, 9, 9, 1]), s[id].bg);
    check(`${tag} ${id} no backdrop-filter`, noFilter(s[id].bf), s[id].bf);
  }
  for (const id of BLURRED) {
    check(`${tag} ${id} blur(12px)`, BLUR12.test(s[id].bf), s[id].bf);
    check(`${tag} ${id} bg 94 %`, sameColor(s[id].bg, [255, 255, 255, 0.94]), s[id].bg);
  }
  for (const id of CLEAR) {
    check(`${tag} ${id} blur(12px)`, BLUR12.test(s[id].bf), s[id].bf);
    check(`${tag} ${id} dark 88 %`, sameColor(s[id].bg, [20, 20, 22, 0.88]), s[id].bg);
  }
  for (const id of [...SURFACES, ...BUTTONS]) {
    check(`${tag} ${id} no background-image (sheen / wash)`, s[id].image === 'none', s[id].image);
    check(`${tag} ${id} no inset rim`, !/inset/.test(s[id].shadow), s[id].shadow);
  }
  for (const id of SURFACES) {
    check(`${tag} ${id} one soft shadow`, (s[id].shadow.match(COLOR_FN) || []).length === 1, s[id].shadow);
  }
  for (const id of BUTTONS) {
    check(`${tag} ${id} solid fill`, opaqueBg(s[id].bg), s[id].bg);
    check(`${tag} ${id} no backdrop-filter`, noFilter(s[id].bf), s[id].bf);
    check(`${tag} ${id} --td-btn-lift shadow`, (s[id].shadow.match(COLOR_FN) || []).length === 2, s[id].shadow);
  }
  check(`${tag} primary button = accent fill`, sameColor(s['b-primary'].bg, [37, 99, 235, 1]), s['b-primary'].bg);
  check(`${tag} danger button = --td-btn-danger-bg`, sameColor(s['b-danger'].bg, [185, 28, 28, 1]), s['b-danger'].bg);
  check(`${tag} -tint alias colours the button`, sameColor(s['b-alias'].bg, [10, 20, 30, 1]), s['b-alias'].bg);
  check(`${tag} custom colour button solid`, sameColor(s['b-custom'].bg, [200, 10, 10, 1]), s['b-custom'].bg);
}

const failures = [];
const notes = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
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
        check(`${tag} regular has backdrop blur(12px)`, BLUR12.test(s.reg.bf), s.reg.bf); // v0.20.0
        check(`${tag} strong bg = --td-glass-bg-strong`, sameColor(s.strong.bg, [255, 255, 255, 0.94]), s.strong.bg);
        check(`${tag} clear bg = --td-glass-clear-bg`, sameColor(s.clear.bg, [20, 20, 22, 0.88]), s.clear.bg);
        check(`${tag} dim deprecated (no fill)`, sameColor(s.dim.bg, [0, 0, 0, 0]), s.dim.bg);
        check(`${tag} subtree override reaches surface`, sameColor(s.sub.bg, [1, 2, 3, 0.5]), s.sub.bg);
        materialChecks(tag, s);

        // (C) glass off — beats the site's unlayered --td-glass-bg override
        await page.evaluate(() => document.documentElement.setAttribute('data-td-glass', 'off'));
        const o = await read(page);
        for (const id of ['reg', 'strong', 'sub']) {
          check(`${tag} glass-off ${id} opaque site solid`, sameColor(o[id].bg, [9, 9, 9, 1]), o[id].bg);
          check(`${tag} glass-off ${id} no backdrop-filter`, noFilter(o[id].bf), o[id].bf);
        }
        check(`${tag} glass-off clear opaque`, sameColor(o.clear.bg, [20, 20, 22, 1]), o.clear.bg);
        for (const id of [...SURFACES, ...BUTTONS]) {
          check(`${tag} glass-off ${id} opaque`, opaqueBg(o[id].bg), o[id].bg);
          check(`${tag} glass-off ${id} no backdrop-filter`, noFilter(o[id].bf), o[id].bf);
        }
        check(`${tag} glass-off clear no filter`, noFilter(o.clear.bf), o.clear.bf);
        check(`${tag} glass-off tint opaque accent`, sameColor(o.tint.bg, [37, 99, 235, 1]), o.tint.bg);
        check(`${tag} glass-off tint no filter`, noFilter(o.tint.bf), o.tint.bf);
        check(`${tag} glass-off dim transparent`, sameColor(o.dim.bg, [0, 0, 0, 0]), o.dim.bg);
        check(`${tag} glass-off zero violations`, o.violations.length === 0, JSON.stringify(o.violations));
        await page.evaluate(() => document.documentElement.removeAttribute('data-td-glass'));

        // (D) dark opt-in
        await page.evaluate(() => document.documentElement.setAttribute('data-td-theme', 'dark'));
        const d = await read(page);
        check(`${tag} dark strong bg`, sameColor(d.strong.bg, [28, 28, 30, 0.94]), d.strong.bg);
        check(`${tag} dark toast bg`, sameColor(d['s-toast'].bg, [28, 28, 30, 0.94]), d['s-toast'].bg);
        check(`${tag} dark opaque surfaces keep the site solid`, sameColor(d['s-modal'].bg, [9, 9, 9, 1]), d['s-modal'].bg);
        await context.close();
      }

      // (D) dark OS preference alone must NOT flip
      {
        const { page, context } = await freshPage(browser, profile, { colorScheme: 'dark' });
        const s = await read(page);
        check(`${tag} no auto dark flip`, sameColor(s.strong.bg, [255, 255, 255, 0.94]), s.strong.bg);
        await context.close();
      }

      // (E) reduced motion
      {
        const { page, context } = await freshPage(browser, profile, { reducedMotion: 'reduce' });
        const s = await read(page);
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
        for (const id of ['reg', 'clear', 'tint', 'dim', ...SURFACES, ...BUTTONS]) {
          check(`${tag} forced-colors ${id} no filter`, noFilter(s[id].bf), s[id].bf);
          check(`${tag} forced-colors ${id} no shadow`, s[id].shadow === 'none', s[id].shadow);
        }
        for (const id of [...OPAQUE, ...BLURRED]) {
          check(`${tag} forced-colors ${id} bg = Canvas`, s[id].bg === s.refCanvas.bg, `${s[id].bg} vs ${s.refCanvas.bg}`);
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
            for (const id of SURFACES) {
              check(`${tag} contrast-more ${id} opaque`, opaqueBg(s[id].bg), s[id].bg);
              check(`${tag} contrast-more ${id} no filter`, noFilter(s[id].bf), s[id].bf);
              check(`${tag} contrast-more ${id} no shadow`, noShadow(s[id].shadow), s[id].shadow);
            }
            for (const id of BUTTONS) check(`${tag} contrast-more ${id} no shadow`, noShadow(s[id].shadow), s[id].shadow);
          } else {
            notes.push(`${tag}: prefers-contrast emulation not honoured by engine`);
          }
          await emu.context.close();
        }
      }

      // td-lightbox (first token-native component): open → navigate → zoom → close, zero violations
      {
        const { page, context } = await freshPage(browser, profile, {}, 'lightbox');
        const res = await page.evaluate(() => window.__lightboxRun);
        const v = await page.evaluate(() => window.__v);
        check(`${tag} lightbox zero CSP violations`, v.length === 0, JSON.stringify(v));
        check(`${tag} lightbox visible while open`, res.visible === 'visible', res.visible);
        check(`${tag} lightbox click-zoom`, res.zoomed === true, String(res.zoomed));
        check(`${tag} lightbox closed`, res.closed === true);
        await context.close();
      }

      // Token-native components under emulated media (plan v0.8.0 review ISSUE-9)
      {
        const { page, context } = await freshPage(browser, profile, { reducedMotion: 'reduce' }, 'components');
        const r = await page.evaluate(() => window.__componentsRun);
        const v = await page.evaluate(() => window.__v);
        check(`${tag} components zero CSP violations`, v.length === 0, JSON.stringify(v));
        // translateY(-50%) scale(1) → matrix(1, 0, 0, 1, 0, ty): no knob lift under reduced motion
        check(`${tag} reduced-motion slider knob not scaled`, /^matrix\(1, 0, 0, 1,/.test(r.thumbTransform), r.thumbTransform);
        check(`${tag} reduced-motion tabs indicator no transition`, /^0s(, 0s)*$/.test(r.indicatorTransition), r.indicatorTransition);
        check(`${tag} reduced-motion spinner frozen`, r.spinnerFrozen === true);
        floatingChecks(tag, r, 'reduced-motion');
        check(`${tag} reduced-motion picker wheel moves instantly`, r.wheelSelected === '11' && r.wheelJumped === true, JSON.stringify([r.wheelSelected, r.wheelJumped]));
        await context.close();
      }
      {
        // v0.20.0: the dragged knob never scales (no decorative lift), with or without reduced motion.
        const { page, context } = await freshPage(browser, profile, {}, 'components');
        const r = await page.evaluate(() => window.__componentsRun);
        check(`${tag} dragging knob not scaled (no lift)`, /^matrix\(1, 0, 0, 1,/.test(r.thumbTransform), r.thumbTransform);
        check(`${tag} spinner animates (control)`, r.spinnerFrozen === false);
        floatingChecks(tag, r, 'default');
        check(`${tag} picker wheel selection follows the key (control)`, r.wheelSelected === '11', r.wheelSelected);
        if (name === 'chromium') {
          // smooth scrolling is observable in Chromium: without reduced motion the wheel has not jumped yet
          check(`${tag} picker wheel animates without reduced motion (control)`, r.wheelJumped === false, String(r.wheelJumped));
        }
        await context.close();
      }
      if (name === 'chromium') {
        const { page, context } = await freshPage(browser, profile, { forcedColors: 'active' }, 'components');
        const r = await page.evaluate(() => window.__componentsRun);
        check(`${tag} forced-colors tabs selected border = Highlight`, r.selectedBorder === r.highlight, `${r.selectedBorder} vs ${r.highlight}`);
        check(`${tag} forced-colors pagination current = Highlight`, r.currentPageBg === r.highlight, `${r.currentPageBg} vs ${r.highlight}`);
        check(`${tag} forced-colors slider fill = Highlight`, r.sliderFillBg === r.highlight, `${r.sliderFillBg} vs ${r.highlight}`);
        check(`${tag} forced-colors modal no filter`, noFilter(r.modalGlass.bf), r.modalGlass.bf);
        check(`${tag} forced-colors toast no filter`, noFilter(r.toastAlone.bf), r.toastAlone.bf);
        check(`${tag} forced-colors menu no filter`, noFilter(r.menuGlass.bf), r.menuGlass.bf);
        check(`${tag} forced-colors chip suggestions no filter`, noFilter(r.sugGlass.bf), r.sugGlass.bf);
        await context.close();
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
console.log(`Token gate: all ${checks} checks passed (chromium, firefox, webkit × self, nonce).`);
