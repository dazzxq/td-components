/**
 * v0.51.1 SSR pre-upgrade parity (FOUC) — plan docs/internal/plans/v0.51.1-ssr-fouc.md, ADR 0025.
 *
 * Every PHP SSR case of test/ssr/fouc.fixtures.json (pre-rendered in test/ssr/fixtures/fouc.html) is measured with
 * td.css ONLY (no module: the state a page shows until its JS arrives), then the case modules are imported (the
 * package subpaths, not index.js) and the same nodes are measured again IN THE SAME RUN (no absolute baseline: Linux /
 * macOS font metrics differ). Chromium / Firefox / WebKit × viewport 390 / 1280.
 *
 *   main      kind parity: host height / width, the case box height (= what moves below), control box (select ↔
 *             trigger, natives ↔ trigger, select ↔ chip box, scan box, matrix scroll) and label within 1 px; the
 *             single selects show the kit chevron (appearance none + gradient) before the upgrade.
 *             kind wrap (chip-input exception): the shift equals the extra chip rows only — Δ host = Δ chip box,
 *             label / box top / width within 1 px. kind height (td_copy, Q3): host height only. kind record (narrow
 *             datetime-local, Q2): asserted at 1280 only, logged at 390. kind guard: hydrated-in-place helpers (net).
 *             kind arrange (v0.53.1 segmented `stacked`): boxes as parity, but the segments re-arrange INSIDE the rail
 *             by design (the layout level is decided after the upgrade) — no layout-shift assertion.
 *             Chromium: no layout-shift entry whose source sits in a parity / guard case.
 *   dark      data-td-theme="dark" (Chromium) — same geometry.
 *   forced    forcedColors "active" (Chromium): geometry; selects fall back to appearance auto, no gradient.
 *   touch     Chromium 390 hasTouch + isMobile (pointer: coarse): geometry; pre-upgrade selects ≥ 16 px (Q1).
 *   rtl       dir="rtl" (Chromium): the chevron sits on the inline end (left).
 *   legacy    Tailwind fixture before td.css (profile legacy+td, Chromium): geometry of dropdown / tree-select.
 *   focus     datetime-range natives box: :focus-within ring = trigger focus ring (border + box-shadow); forced colours:
 *             2px solid outline; disabled box = disabled trigger surface, inputs not focusable.
 *   defer     dropdown@1 select focused when the module arrives: host defined, select kept with the SAME look and box
 *             until blur, then the trigger in the same box.
 *   bare      a bare <select> put into an already defined <td-dropdown> / <td-tree-select> looks like v0.51.0 (the
 *             pre-upgrade rules never match a defined host).
 *   v0.56.0   dtp-* (td_datetime_picker / td_date): the native input styled like the trigger (kind (a), unconditional) —
 *             parity in every run, ≥ 16 px on touch, focus ring / disabled surface = the trigger's, no-JS submit.
 *   v0.59.1   lp-* (td_toggle / td_checkbox label_position=start): the label is before the control with td.css alone
 *             (after it in RTL), label / control / note / state text boxes do not move on upgrade; also touch + rtl runs.
 *   nojs      javaScriptEnabled false (scripting: none): multiple lists keep their rows, datetime keeps the two-row
 *             native block, no reserved strips (scan / check-matrix / copy), Tab focus ring, a real form submit and
 *             `required` blocking it.
 *
 * TD_FOUC_SHOTS=<dir> writes before / after screenshots of every case (main, dark, forced) for the visual review.
 * Run: node test/engines/ssr-fouc.spec.mjs   (also part of npm run test:engines)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://fouc.local';
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
const TOL = 1;
const SHOTS = process.env.TD_FOUC_SHOTS || '';
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
// v0.60.0 (plan v0.60.0-calendar-picker B6): fouc.html holds what php/td.php prints NOW (datetime-picker@2); the dtp-*
// sections of v0.59.0 (datetime-picker@1, implicit native min / max 2000–2099) are FROZEN in a second file as dtp1-* —
// a page rendered by an old td.php during a rolling upgrade must keep the same pre-upgrade parity.
const FIXTURE = `${readFileSync(join(ROOT, 'test/ssr/fixtures/fouc.html'), 'utf8').replace(/\n+$/, '')}\n${
  readFileSync(join(ROOT, 'test/ssr/fixtures/fouc-datetime-picker.v1.html'), 'utf8')}`;
const TAILWIND = join(ROOT, 'test/csp/fixture/tailwind.css');

/**
 * id → { id, kind, module, width, tag, html } (one section per fixture case). v0.58.0: a case may span several lines (a
 * textarea value starts with the newline the HTML parser drops) — split on the section starts, not on every line.
 */
const CASES = new Map();
for (const line of FIXTURE.split(/\n(?=<section class="fouc-case")/).map((x) => x.replace(/\n+$/, ''))) {
  const m = line.match(/^<section class="fouc-case" data-case="([^"]+)" data-kind="([a-z]+)" data-module="([a-z-]+)" data-width="(\d+)" data-tag="([a-z-]+)">/);
  if (m) CASES.set(m[1], { id: m[1], kind: m[2], module: m[3], width: Number(m[4]), tag: m[5], html: line });
}
const ALL = [...CASES.keys()];
const AFFECTED = ALL.filter((id) => !CASES.get(id).kind.startsWith('guard'));
const SELECTS = ['dd-n', 'dd-n-ph', 'dd-n-nolabel', 'dd-n-req', 'dd-n-dis', 'dd-n-search', 'dd-n-long', 'dd-e', 'dd-e-ph', 'dd-e-dis', 'ts-n', 'ts-e'];
// v0.56.0: td_datetime_picker / td_date (the native input styled like the trigger, ADR 0025 kind (a))
const DTP2 = ['dtp-date', 'dtp-datetime', 'dtp-dis', 'dtp-empty', 'dtp-help', 'dtp-err', 'dtp-narrow',
  // v0.59.0 clearable (plan v0.59.0-dsuite-small QĐ E1d)
  'dtp-clear-filled', 'dtp-clear-empty', 'dtp-clear-required', 'dtp-clear-narrow'];
// v0.60.0: the same cases as datetime-picker@1 printed them (frozen), `dtp1-*`
const DTP = [...DTP2, ...DTP2.map((id) => id.replace(/^dtp-/, 'dtp1-'))];
for (const id of DTP) if (!CASES.has(id)) throw new Error(`ssr-fouc: fixture case ${id} is missing`);
for (const id of DTP) {
  const want = id.startsWith('dtp1-') ? 'datetime-picker@1' : 'datetime-picker@2';
  if (!CASES.get(id).html.includes(`data-td-ssr="${want}"`)) throw new Error(`ssr-fouc: ${id} is not ${want} markup`);
}
const FIELDS = [...SELECTS, 'ts-n-multi', 'ts-e-multi', 'dtr-date', 'dtr-dis', 'dtr-empty', 'dtr-open-end', ...DTP];

// v0.59.1: td_toggle / td_checkbox label_position=start (also run on touch and in RTL)
const LP = ALL.filter((id) => id.startsWith('lp-'));

const failures = [];
const notes = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= TOL;
const fmt = (n) => (n == null ? '—' : Math.round(n * 100) / 100);

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

/** The module file of a package subpath (`dropdown` → src/form/td-dropdown.js). */
const modulePath = (key) => PKG.exports[`./${key}`].replace(/^\.\//, '/');

function pageHtml(ids, { dir = 'ltr', theme = '', legacy = false, form = false } = {}) {
  const body = ids.map((id) => CASES.get(id).html).join('\n');
  return `<!doctype html><html lang="vi" dir="${dir}"${theme ? ` data-td-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${legacy ? `<link rel="stylesheet" href="${ORIGIN}/test/csp/fixture/tailwind.css">` : ''}
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>
  body { margin: 0; padding: 16px; background: var(--td-color-bg, #fff); }
  .fouc-case { display: flow-root; margin: 0 0 24px; }
  .fouc-case[data-width="360"] { width: min(100%, 360px); }
  .fouc-case[data-width="480"] { width: min(100%, 480px); }
  .fouc-case[data-width="800"] { width: min(100%, 800px); }
</style></head><body>
${form ? `<form id="f" action="${ORIGIN}/__submit" method="post">${body}<button type="submit" id="submit">Gửi</button></form>` : body}
<button type="button" id="elsewhere">Nơi khác</button>
</body></html>`;
}

async function openPage(browser, html, ctxOpts = {}) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts });
  const page = await context.newPage();
  const posts = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/__submit') {
      posts.push(req.postData() || '');
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<p id="done">ok</p>' });
    }
    const file = join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const ext = file.slice(file.lastIndexOf('.'));
    return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  // no JS (Firefox): a promise in the page never settles — only synchronous evaluate there
  if (ctxOpts.javaScriptEnabled !== false) await page.evaluate(() => document.fonts.ready);
  else await page.waitForTimeout(300);
  return { page, context, posts };
}

/** Control (before ↔ after) per host tag: the first VISIBLE match of the list. */
const CONTROL = {
  'td-dropdown': ':scope > select, .td-dropdown__trigger',
  'td-tree-select': ':scope > .td-tree-select__native, .td-tree-select__control',
  'td-chip-input': ':scope > .td-chip-input__native, .td-chip-input__box',
  'td-datetime-range': '.td-dtr__trigger, .td-dtr__natives',
  'td-datetime-picker': '.td-dtp__trigger, .td-dtp__native',
  'td-scan-input': '.td-scan__box',
  'td-check-matrix': '.td-check-matrix__scroll',
};

function measureAll(control) {
  const out = {};
  for (const s of document.querySelectorAll('section.fouc-case')) {
    const host = s.firstElementChild;
    const sr = s.getBoundingClientRect();
    const rel = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (!b.width && !b.height) return null;
      return { x: b.x - sr.x, y: b.y - sr.y, w: b.width, h: b.height };
    };
    let ctl = null;
    if (control[host.localName]) {
      for (const el of host.querySelectorAll(control[host.localName])) {
        const b = el.getBoundingClientRect();
        if (b.width && b.height && getComputedStyle(el).visibility !== 'hidden') { ctl = el; break; }
      }
    }
    const label = [...host.querySelectorAll('.td-field__label, .td-dtr__label, .td-scan__label')]
      .find((el) => el.getBoundingClientRect().height > 0);
    // v0.59.1: td-toggle / td-checkbox — the label text, the control (track / mark) and the first shown note
    const lpPart = (sel) => rel(host.querySelector(sel));
    const lp = host.localName === 'td-toggle' || host.localName === 'td-checkbox'
      ? { label: lpPart('.td-switch__label, .td-checkbox__label'), ctl: lpPart('.td-switch__track, .td-checkbox__mark'),
        note: lpPart(':scope > .td-field__note:not([hidden])'), state: lpPart('.td-switch__state'), rtl: getComputedStyle(host).direction === 'rtl' }
      : null;
    const dtp = host.querySelector('.td-dtp__native');
    const chev = host.querySelector(':scope > select, :scope > .td-tree-select__native');
    const cs = chev ? getComputedStyle(chev) : null;
    out[s.dataset.case] = {
      box: s.getBoundingClientRect().height, host: rel(host), ctl: rel(ctl), ctlTag: ctl ? `${ctl.localName}.${ctl.classList[0] || ''}` : null,
      label: rel(label), chips: host.querySelectorAll('.td-chip-input__chip').length,
      dtpFont: dtp ? parseFloat(getComputedStyle(dtp).fontSize) : null,
      lp,
      select: cs ? { appearance: cs.appearance || cs.webkitAppearance, bg: cs.backgroundImage, fontSize: parseFloat(cs.fontSize), posX: cs.backgroundPositionX } : null,
    };
  }
  return out;
}

async function upgrade(page, ids) {
  const mods = [...new Set(ids.map((id) => CASES.get(id).module))].map(modulePath);
  await page.evaluate(async ({ origin, mods }) => {
    await Promise.all(mods.map((m) => import(origin + m)));
    const tags = [...new Set([...document.querySelectorAll('section.fouc-case > *')].map((e) => e.localName))];
    await Promise.all(tags.map((t) => customElements.whenDefined(t)));
    for (let i = 0; i < 3; i += 1) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 150)); // ResizeObserver-driven layouts (check-matrix narrow mode)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, { origin: ORIGIN, mods });
}

async function shots(page, ids, tag, phase) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  for (const id of ids) {
    await page.locator(`section[data-case="${id}"]`).screenshot({ path: join(SHOTS, `${tag}-${id}-${phase}.png`) }).catch(() => {});
  }
}

/** Parity assertions of one run (before / after maps). */
function assertParity(run, ids, before, after, { width, chevron = true } = {}) {
  for (const id of ids) {
    const c = CASES.get(id);
    const b = before[id];
    const a = after[id];
    const L = `${run} ${id}`;
    const d = (k) => (b[k] && a[k] ? `${fmt(b[k].y)}/${fmt(b[k].h)} → ${fmt(a[k].y)}/${fmt(a[k].h)}` : `${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
    if (c.kind === 'record' && width < 1280) {
      notes.push(`${L} (record, Q2): box ${fmt(b.box)} → ${fmt(a.box)} (Δ ${fmt(a.box - b.box)})`);
      continue;
    }
    if (c.kind === 'height') {
      check(`${L}: case height`, near(b.box, a.box), `${fmt(b.box)} → ${fmt(a.box)}`);
      continue;
    }
    if (c.kind === 'wrap') {
      const dHost = a.host.h - b.host.h;
      const dCtl = a.ctl && b.ctl ? a.ctl.h - b.ctl.h : NaN;
      check(`${L}: chips wrap (fixture sanity)`, a.ctl && b.ctl && a.ctl.h > b.ctl.h + 10, d('ctl'));
      check(`${L}: Δ host = Δ chip box (extra rows only)`, Math.abs(dHost - dCtl) <= TOL, `Δhost ${fmt(dHost)} Δbox ${fmt(dCtl)}`);
      check(`${L}: Δ case = Δ host`, Math.abs((a.box - b.box) - dHost) <= TOL, `Δcase ${fmt(a.box - b.box)}`);
      check(`${L}: chip box top / width`, b.ctl && a.ctl && near(b.ctl.y, a.ctl.y) && near(b.ctl.w, a.ctl.w), d('ctl'));
      check(`${L}: label`, near(b.label?.y, a.label?.y) && near(b.label?.h, a.label?.h), d('label'));
      continue;
    }
    check(`${L}: case height (content below does not move)`, near(b.box, a.box), `${fmt(b.box)} → ${fmt(a.box)}`);
    check(`${L}: host box`, near(b.host.h, a.host.h) && near(b.host.w, a.host.w), d('host'));
    if (id.startsWith('lp-')) {
      // v0.59.1 label_position=start: the label is before the control with td.css alone, and no part moves on upgrade
      const p = b.lp;
      const q = a.lp;
      const first = (m) => !!m && !!m.label && !!m.ctl && (m.rtl ? m.label.x >= m.ctl.x + m.ctl.w - 0.5 : m.label.x + m.label.w <= m.ctl.x + 0.5);
      check(`${L}: label before the control pre-upgrade`, first(p), JSON.stringify(p));
      check(`${L}: label before the control after the upgrade`, first(q), JSON.stringify(q));
      for (const k of ['label', 'ctl', 'note', 'state']) {
        const same = (!p?.[k] && !q?.[k]) || (p?.[k] && q?.[k] && near(p[k].x, q[k].x) && near(p[k].y, q[k].y) && near(p[k].w, q[k].w) && near(p[k].h, q[k].h));
        check(`${L}: ${k} box does not move`, !!same, `${JSON.stringify(p?.[k])} → ${JSON.stringify(q?.[k])}`);
      }
      if (p?.note) check(`${L}: note on the label's start edge`, p.rtl ? near(p.note.x + p.note.w, p.label.x + p.label.w) : near(p.note.x, p.label.x), `${JSON.stringify(p.note)} / ${JSON.stringify(p.label)}`);
    }
    if (c.kind === 'guard') continue;
    if (CONTROL[c.tag]) {
      // check-matrix: the narrow mode hides the other columns (the grid changes width by design) — vertical only
      const horiz = c.tag === 'td-check-matrix' || (b.ctl && a.ctl && near(b.ctl.x, a.ctl.x) && near(b.ctl.w, a.ctl.w));
      check(`${L}: control box ${b.ctlTag} → ${a.ctlTag}`, b.ctl && a.ctl && horiz && near(b.ctl.y, a.ctl.y) && near(b.ctl.h, a.ctl.h), d('ctl'));
    }
    if (b.label || a.label) check(`${L}: label`, near(b.label?.y, a.label?.y) && near(b.label?.h, a.label?.h), d('label'));
    if (chevron && SELECTS.includes(id)) {
      check(`${L}: pre-upgrade select has the kit chevron`, b.select && b.select.appearance === 'none' && /linear-gradient/.test(b.select.bg),
        JSON.stringify(b.select));
    }
  }
}

async function runMain(browser, engine, width, { theme = '', forced = false, touch = false, dir = 'ltr', legacy = false, ids = ALL, tag } = {}) {
  const ctxOpts = { viewport: { width, height: 900 } };
  if (forced) ctxOpts.forcedColors = 'active';
  if (touch) Object.assign(ctxOpts, { hasTouch: true, isMobile: true });
  const { page, context } = await openPage(browser, pageHtml(ids, { theme, dir, legacy }), ctxOpts);
  const run = tag || `${engine}@${width}${theme ? ` ${theme}` : ''}${forced ? ' forced' : ''}${touch ? ' touch' : ''}${dir === 'rtl' ? ' rtl' : ''}${legacy ? ' legacy+td' : ''}`;
  try {
    if (engine === 'chromium') {
      await page.evaluate(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            for (const s of e.sources || []) {
              const sec = s.node && (s.node.closest ? s.node : s.node.parentElement)?.closest?.('section.fouc-case');
              window.__shifts.push({ value: e.value, kase: sec ? sec.dataset.case : null, kind: sec ? sec.dataset.kind : null });
            }
          }
        }).observe({ type: 'layout-shift' });
      });
    }
    const before = await page.evaluate(measureAll, CONTROL);
    await shots(page, ids, run.replace(/[^a-z0-9@-]+/gi, '_'), '1before');
    await upgrade(page, ids);
    const after = await page.evaluate(measureAll, CONTROL);
    await shots(page, ids, run.replace(/[^a-z0-9@-]+/gi, '_'), '2after');
    assertParity(run, ids, before, after, { width, chevron: !forced });
    if (process.env.FOUC_VERBOSE) console.log(`  ${run} done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (forced) {
      for (const id of ids.filter((i) => SELECTS.includes(i))) {
        const s = before[id].select;
        check(`${run} ${id}: forced colours → native arrow (appearance auto, no gradient)`, s && s.appearance !== 'none' && !/gradient/.test(s.bg), JSON.stringify(s));
      }
    }
    if (touch) {
      for (const id of ids.filter((i) => SELECTS.includes(i))) {
        check(`${run} ${id}: pre-upgrade select ≥ 16px on touch (Q1, ADR 0019)`, before[id].select?.fontSize >= 16, String(before[id].select?.fontSize));
      }
      for (const id of ids.filter((i) => DTP.includes(i))) {
        check(`${run} ${id}: pre-upgrade native date input ≥ 16px on touch (v0.56.0 D7)`, before[id].dtpFont >= 16, String(before[id].dtpFont));
      }
    }
    if (dir === 'rtl') {
      for (const id of ids.filter((i) => SELECTS.includes(i))) {
        const x = before[id].select?.posX || '';
        // Chromium serialises `left 18px` as `18px`: the LTR value names `right`, the RTL one never does
        check(`${run} ${id}: chevron on the inline end (left)`, x !== '' && x !== '0%' && !/right/.test(x), x);
      }
    }
    if (engine === 'chromium') {
      const shifts = await page.evaluate(() => window.__shifts);
      const bad = shifts.filter((s) => s.kind === 'parity' || s.kind === 'guard');
      check(`${run}: no layout-shift source in a parity / guard case`, bad.length === 0, JSON.stringify(bad.slice(0, 5)));
    }
    return { before, after };
  } finally {
    await context.close();
  }
}

/** datetime-range box focus / disabled (pre-upgrade, no module). */
async function runFocus(browser, engine, { forced = false } = {}) {
  const run = `${engine} focus${forced ? ' forced' : ''}`;
  const { page, context } = await openPage(browser, pageHtml(['dtr-date', 'dtr-dis', 'dd-n', 'dtp-date', 'dtp-dis']), {
    viewport: { width: 1280, height: 900 }, ...(forced ? { forcedColors: 'active' } : {}),
  });
  try {
    await page.focus('#dtr-date-start');
    const r = await page.evaluate(() => {
      const box = document.querySelector('#dtr-date .td-dtr__natives');
      const cs = getComputedStyle(box);
      const probe = document.createElement('i');
      probe.className = 'td-dtr__trigger';
      document.body.append(probe);
      probe.style.setProperty('border-color', 'var(--td-field-focus)');
      probe.style.setProperty('box-shadow', 'var(--td-field-focus-ring)');
      const want = { border: getComputedStyle(probe).borderTopColor, shadow: getComputedStyle(probe).boxShadow };
      probe.remove();
      const inner = getComputedStyle(document.querySelector('#dtr-date-start'));
      return { border: cs.borderTopColor, shadow: cs.boxShadow, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, want,
        innerOutline: inner.outlineStyle, innerShadow: inner.boxShadow };
    });
    if (forced) {
      check(`${run}: natives :focus-within → 2px solid outline`, r.outlineStyle === 'solid' && r.outlineWidth === '2px', JSON.stringify(r));
    } else {
      check(`${run}: natives :focus-within ring = trigger focus ring`, r.border === r.want.border && r.shadow === r.want.shadow && r.shadow !== 'none', JSON.stringify(r));
      check(`${run}: one focus indicator (inner input has no ring of its own)`, r.innerOutline === 'none' && r.innerShadow === 'none', JSON.stringify(r));
    }
    // disabled: same surface as the disabled trigger, inputs not focusable
    const dis = await page.evaluate(() => {
      const box = getComputedStyle(document.querySelector('#dtr-dis .td-dtr__natives'));
      // the (hidden) disabled trigger still has its computed disabled surface
      const tc = getComputedStyle(document.querySelector('#dtr-dis .td-dtr__trigger'));
      return { bg: box.backgroundColor, color: box.color, border: box.borderTopColor, tbg: tc.backgroundColor, tcolor: tc.color, tborder: tc.borderTopColor };
    });
    // forced colours: system colours (GrayText text + border on Canvas) — the trigger keeps a CanvasText border there
    check(`${run}: disabled natives box = disabled trigger surface`, dis.bg === dis.tbg && dis.color === dis.tcolor && (forced || dis.border === dis.tborder), JSON.stringify(dis));
    await page.focus('#dtr-dis-start', { timeout: 2000 }).catch(() => {});
    const active = await page.evaluate(() => document.activeElement?.id || '');
    check(`${run}: disabled natives not focusable`, active !== 'dtr-dis-start', active);
    // v0.56.0: td_date native input — focus ring = the trigger's; disabled = the disabled trigger surface
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab'); // keyboard focus → :focus-visible in every engine
    await page.focus('#dtp-date-native');
    const d = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#dtp-date-native'));
      const probe = document.createElement('i');
      probe.className = 'td-dtp__trigger';
      document.body.append(probe);
      probe.style.setProperty('border-color', 'var(--td-field-focus)');
      probe.style.setProperty('box-shadow', 'var(--td-field-focus-ring)');
      const want = { border: getComputedStyle(probe).borderTopColor, shadow: getComputedStyle(probe).boxShadow };
      probe.remove();
      const dis = getComputedStyle(document.querySelector('#dtp-dis-native'));
      const tdis = getComputedStyle(document.querySelector('#dtp-dis .td-dtp__trigger'));
      return { focusVisible: document.querySelector('#dtp-date-native').matches(':focus-visible'), border: cs.borderTopColor, shadow: cs.boxShadow,
        outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, want, dbg: dis.backgroundColor, dcolor: dis.color, tbg: tdis.backgroundColor, tcolor: tdis.color };
    });
    if (d.focusVisible) {
      if (forced) check(`${run}: dtp native :focus-visible → 2px solid outline`, d.outlineStyle === 'solid' && d.outlineWidth === '2px', JSON.stringify(d));
      else check(`${run}: dtp native :focus-visible ring = trigger focus ring`, d.border === d.want.border && d.shadow === d.want.shadow && d.shadow !== 'none', JSON.stringify(d));
    } else notes.push(`${run}: dtp native not :focus-visible after a scripted focus (engine heuristic) — ring not compared`);
    check(`${run}: dtp disabled native = disabled trigger surface`, d.dbg === d.tbg && d.dcolor === d.tcolor, JSON.stringify(d));
  } finally {
    await context.close();
  }
}

/** dropdown@1 focused select: deferred to blur, same look meanwhile. */
async function runDefer(browser, engine) {
  const run = `${engine} defer`;
  const { page, context } = await openPage(browser, pageHtml(['dd-e', 'dd-n']), { viewport: { width: 1280, height: 900 } });
  try {
    await page.focus('#dd-e-select');
    const before = await page.evaluate(measureAll, CONTROL);
    await upgrade(page, ['dd-e']);
    const mid = await page.evaluate(measureAll, CONTROL);
    const state = await page.evaluate(() => ({ defined: !!customElements.get('td-dropdown') && document.querySelector('#dd-e').matches(':defined'),
      select: !!document.querySelector('#dd-e > select'), active: document.activeElement?.id }));
    check(`${run}: host defined, select kept while focused`, state.defined && state.select && state.active === 'dd-e-select', JSON.stringify(state));
    const b = before['dd-e'];
    const m = mid['dd-e'];
    check(`${run}: same box + look while deferred`, near(b.ctl.y, m.ctl.y) && near(b.ctl.h, m.ctl.h) && near(b.ctl.w, m.ctl.w)
      && m.select && m.select.appearance === b.select.appearance && m.select.bg === b.select.bg, `${JSON.stringify(b.select)} → ${JSON.stringify(m.select)}`);
    await page.focus('#elsewhere');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const after = await page.evaluate(measureAll, CONTROL);
    const a = after['dd-e'];
    check(`${run}: trigger after blur in the same box`, a.ctlTag?.startsWith('button') && near(b.ctl.y, a.ctl.y) && near(b.ctl.h, a.ctl.h) && near(b.box, a.box),
      `${b.ctlTag} ${fmt(b.ctl.h)} → ${a.ctlTag} ${fmt(a.ctl?.h)}`);
  } finally {
    await context.close();
  }
}

/** A bare <select> inside an already defined host keeps the v0.51.0 look (= a select outside any td host). */
async function runBare(browser, engine) {
  const run = `${engine} bare`;
  const { page, context } = await openPage(browser, pageHtml(['dd-n', 'ts-n']), { viewport: { width: 1280, height: 900 } });
  try {
    await upgrade(page, ['dd-n', 'ts-n']);
    const r = await page.evaluate(() => {
      const props = ['appearance', 'height', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'paddingLeft', 'paddingRight', 'fontSize', 'fontFamily', 'backgroundImage', 'backgroundColor'];
      const make = () => { const s = document.createElement('select'); s.innerHTML = '<option>Một</option><option>Hai</option>'; return s; };
      const pick = (el) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]]));
      const refHost = document.createElement('div');
      document.body.append(refHost);
      const ref = make();
      refHost.append(ref);
      const out = {};
      for (const id of ['dd-n', 'ts-n']) {
        const host = document.getElementById(id);
        const s = make();
        host.append(s);
        out[id] = { defined: host.matches(':defined'), got: pick(s), want: pick(ref) };
        s.remove();
      }
      return out;
    });
    for (const [id, v] of Object.entries(r)) {
      const diff = Object.keys(v.want).filter((k) => v.got[k] !== v.want[k] && !(k === 'fontFamily' || k === 'fontSize' || k === 'height'));
      check(`${run} ${id}: defined host, bare select unstyled by the pre-upgrade rules`, v.defined && diff.length === 0,
        diff.map((k) => `${k}: ${v.got[k]} ≠ ${v.want[k]}`).join('; '));
      check(`${run} ${id}: no chevron / no appearance none`, v.got.appearance !== 'none' && !/gradient/.test(v.got.backgroundImage), JSON.stringify(v.got));
    }
  } finally {
    await context.close();
  }
}

/** No JS (scripting: none): the v0.51.0 native fallbacks stay usable; no reserved strips. */
async function runNoJs(browser, engine) {
  const run = `${engine} nojs`;
  const ids = ['dd-n', 'dd-n-req', 'ts-n-multi', 'ci-2', 'dtr-date', 'scan-narrow', 'cm-narrow', 'copy-md', 'dtp-date'];
  const { page, context, posts } = await openPage(browser, pageHtml(ids, { form: true }), { viewport: { width: 390, height: 900 }, javaScriptEnabled: false });
  try {
    const r = await page.evaluate(() => {
      const h = (sel) => document.querySelector(sel)?.getBoundingClientRect().height ?? -1;
      const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
      const field = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--td-field-h-md')) * 16 || 40;
      return {
        scripting: matchMedia('(scripting: none)').matches, field,
        tsMulti: h('#ts-n-multi .td-tree-select__native'), ciMulti: h('#ci-2 > select'),
        dtrRows: top('#dtr-date-end') - top('#dtr-date-start'), dtrLabel: h('#dtr-date .td-dtr__native-label'),
        scanBox: h('#scan-narrow .td-scan__box'), scanInput: h('#scan-narrow .td-scan__input'),
        cmTop: top('#cm-narrow .td-check-matrix__scroll') - top('#cm-narrow'), copy: h('section[data-case="copy-md"] td-copy'),
      };
    });
    check(`${run}: scripting none`, r.scripting, JSON.stringify(r));
    check(`${run}: tree-select multiple keeps its rows`, r.tsMulti > 80, String(r.tsMulti));
    check(`${run}: chip-input select keeps its rows`, r.ciMulti > 60, String(r.ciMulti));
    check(`${run}: datetime natives stay on two rows with visible labels`, r.dtrRows > 20 && r.dtrLabel > 10, JSON.stringify(r));
    check(`${run}: no reserved scan status row`, near(r.scanBox, r.scanInput), JSON.stringify(r));
    check(`${run}: no reserved check-matrix bar`, r.cmTop < 4, String(r.cmTop));
    check(`${run}: no reserved copy height`, r.copy < 30, String(r.copy));
    // Tab focus ring on the styled select
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.id === 'dd-n-select')) break;
    }
    const ring = await page.evaluate(() => ({ id: document.activeElement?.id, shadow: getComputedStyle(document.activeElement).boxShadow }));
    check(`${run}: Tab focus ring on the select`, ring.id === 'dd-n-select' && ring.shadow !== 'none', JSON.stringify(ring));
    // required blocks the submit; then a real submit carries name=value
    await page.click('#submit');
    await page.waitForTimeout(300);
    check(`${run}: required select blocks the submit`, posts.length === 0, `${posts.length} post(s)`);
    await page.selectOption('#dd-n-req-select', 'b');
    await page.selectOption('#dd-n-select', 'dn');
    await Promise.all([page.waitForURL(`${ORIGIN}/__submit`).catch(() => {}), page.click('#submit')]);
    const body = posts[0] || '';
    check(`${run}: submit carries the native values`, /(^|&)city=dn(&|$)/.test(body) && /(^|&)req=b(&|$)/.test(body), body.slice(0, 200));
    check(`${run}: td_date native input submits yyyy-mm-dd (v0.56.0)`, /(^|&)ngay=2026-06-15(&|$)/.test(body), body.slice(0, 300));
  } finally {
    await context.close();
  }
}

const ENGINES = (process.env.FOUC_ENGINES || 'chromium,firefox,webkit').split(',');
const LAUNCHERS = { chromium, firefox, webkit };
const t0 = Date.now();
for (const name of ENGINES) {
  const launcher = LAUNCHERS[name];
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: launch failed — ${e.message.split('\n')[0]}`);
    continue;
  }
  try {
    for (const width of [390, 1280]) await runMain(browser, name, width);
    if (name === 'chromium') {
      for (const width of [390, 1280]) await runMain(browser, name, width, { theme: 'dark', ids: AFFECTED });
      for (const width of [390, 1280]) await runMain(browser, name, width, { forced: true, ids: FIELDS });
      await runMain(browser, name, 390, { touch: true, ids: [...FIELDS, ...LP] });
      await runMain(browser, name, 1280, { dir: 'rtl', ids: [...SELECTS, ...LP] });
      if (existsSync(TAILWIND)) await runMain(browser, name, 1280, { legacy: true, ids: FIELDS });
      else notes.push('legacy+td: test/csp/fixture/tailwind.css missing — skipped');
      await runFocus(browser, name, { forced: true });
    }
    await runFocus(browser, name);
    if (process.env.FOUC_VERBOSE) console.log(`  ${name} runFocus done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await runDefer(browser, name);
    if (process.env.FOUC_VERBOSE) console.log(`  ${name} runDefer done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await runBare(browser, name);
    if (process.env.FOUC_VERBOSE) console.log(`  ${name} runBare done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await runNoJs(browser, name);
    if (process.env.FOUC_VERBOSE) console.log(`  ${name} runNoJs done (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failures.push(`${name}: ${e.stack || e.message}`);
  } finally {
    await browser.close();
  }
}

for (const n of notes) console.log(`  note: ${n}`);
console.log(`ssr-fouc: ${checks} checks, ${failures.length} failure(s), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
