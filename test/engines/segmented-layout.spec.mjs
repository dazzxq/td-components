/**
 * v0.53.1 (plan docs/internal/plans/v0.53.1-segmented-layout.md QĐ 1, QĐ 5; Codex plan-review r1 #1, r2, r3) — the
 * segmented rail on a COARSE pointer (Chromium hasTouch + isMobile: `pointer: coarse`, 44 px segments), PHP markup
 * (td_choice_group, rendered at run time through test/php/harness.php):
 *
 *   upgraded   minRail = Σ max(44, 2 × px + max(icon, label min-content)) + gaps + 2 × pad — 3 options at 140 px overflow,
 *              at 144 px they do not; a long unbreakable label overflows earlier; segments ≥ 44 × 44; the page never
 *              overflows; the expected flag comes from the SAME function (src/utils/segmented-layout.js) fed with the
 *              component's measurements.
 *   no JS      javaScriptEnabled false (`scripting: none`) and
 *   pre-upgrade (module never loaded, `scripting: enabled`): 3 and 5 options at 140 px, with / without stretch — the page
 *              never overflows, the rail scrolls itself, every label is fully visible once its option is scrolled into
 *              the rail, every segment ≥ 44 × 44, the focus outline of the checked radio stays inside the rail's
 *              padding box (Tab).
 *
 * Run: npm run test:engines (or node test/engines/segmented-layout.spec.mjs). Needs php ≥ 8.0 (CI has it).
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAS_PHP, runPhp } from '../php/php.mjs';
import { decideLayout } from '../../src/utils/segmented-layout.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://segmented.test';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const failures = [];
let checks = 0;
const check = (label, ok, detail = '') => { checks += 1; if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`); };

if (!HAS_PHP) {
  console.log('segmented-layout: php >= 8.0 CLI not found — FAIL (the PHP markup is the point of this spec)');
  process.exit(1);
}

const THEME = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];
const FIVE = [...THEME, { value: 'hc', label: 'Tương phản', icon: 'eye' }, { value: 'sys', label: 'Hệ thống', icon: 'columns' }];
const WORD = [{ value: 'a', label: 'Supercalifragilistic', icon: 'monitor' }, { value: 'b', label: 'Chốngphảnchiếu', icon: 'sun' },
  { value: 'c', label: 'Tối', icon: 'moon' }];

/** PHP markup of every case, one container each (test-only page — no CSP in this spec) */
function markup(cases) {
  const out = runPhp(cases.map((c) => ({ fn: 'td_choice_group', args: ['theme', c.options, c.options[0].value,
    { id: c.id, aria_label: 'Giao diện', variant: 'segmented', size: 'sm', ...(c.stretch ? { stretch: true } : {}) }] })), { baseUrl: '/' });
  return cases.map((c, i) => `<div class="box" data-case="${c.id}" style="width:${c.width}px;margin:8px 0">${out[i].out}</div>`).join('');
}
const page = (body, withModule) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/td.css"></head><body style="margin:8px"><input id="before" aria-label="trước">${body}
${withModule ? '<script type="module">import "/src/form/td-choice-group.js"; await customElements.whenDefined("td-choice-group"); requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));</script>' : ''}</body></html>`;

async function open(browser, html, { js = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true, javaScriptEnabled: js });
  const p = await context.newPage();
  await p.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body: await readFile(file) });
  });
  await p.goto(`${ORIGIN}/`);
  return { p, context };
}

/** in-page: geometry facts of one case (labels revealed one by one by scrolling ONLY the rail) */
function facts(id) {
  const box = document.querySelector(`.box[data-case="${id}"]`);
  const rail = box.querySelector('.td-choice__options');
  const visible = (el) => {
    const r = rail.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return b.left >= r.left + rail.clientLeft - 1 && b.right <= r.left + rail.clientLeft + rail.clientWidth + 1;
  };
  const labels = [];
  for (const face of rail.querySelectorAll('.td-choice__face')) {
    const t = face.querySelector('.td-choice__text:not(.td-sr-only)');
    const r = rail.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    rail.scrollLeft += f.left < r.left ? f.left - r.left - 3 : f.right > r.right ? f.right - r.right + 3 : 0;
    labels.push({ whole: t.scrollWidth <= t.clientWidth + 1, visible: visible(t), w: f.width, h: f.height });
  }
  rail.scrollLeft = 0;
  return {
    page: document.documentElement.scrollWidth <= window.innerWidth,
    scrolls: rail.scrollWidth > rail.clientWidth,
    labels,
    layout: rail.getAttribute('data-layout'),
    overflow: rail.hasAttribute('data-overflow'),
    coarse: matchMedia('(pointer: coarse)').matches,
    m: box.querySelector('td-choice-group')._segMeasure || null,
  };
}

async function focusOutlineInside(p, id) {
  await p.focus('#before');
  // Tab until the checked radio of this case has focus (Tab order: the cases in document order)
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Tab');
    const ok = await p.evaluate((cid) => document.activeElement?.closest?.(`.box[data-case="${cid}"]`) != null, id);
    if (ok) break;
  }
  return p.evaluate((cid) => {
    const box = document.querySelector(`.box[data-case="${cid}"]`);
    const rail = box.querySelector('.td-choice__options');
    const a = document.activeElement;
    if (!a || !box.contains(a)) return { ok: false, why: 'no focus' };
    const face = a.parentElement.querySelector('.td-choice__face');
    const cs = getComputedStyle(face);
    const m = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth || '2');
    const r = rail.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    const visL = r.left + rail.clientLeft;
    const visR = visL + rail.clientWidth;
    const visT = r.top + rail.clientTop;
    const visB = visT + rail.clientHeight;
    return { ok: f.left - m >= visL - 1 && f.right + m <= visR + 1 && f.top - m >= visT - 1 && f.bottom + m <= visB + 1, why: JSON.stringify({ f, visL, visR, visT, visB, m }) };
  }, id);
}

const browser = await chromium.launch();
try {
  // ---------------------------------------------------------------- upgraded, coarse ---------------------------------
  {
    const cases = [
      { id: 'u140', width: 140, options: THEME, stretch: true },
      { id: 'u144', width: 144, options: THEME, stretch: true },
      { id: 'uword216', width: 216, options: WORD, stretch: true },
      { id: 'u216', width: 216, options: THEME, stretch: true },
    ];
    const { p, context } = await open(browser, page(markup(cases), true));
    await p.waitForFunction(() => window.__ready === true);
    for (const c of cases) {
      const f = await p.evaluate(facts, c.id);
      const tag = `upgraded coarse ${c.id}`;
      check(`${tag}: pointer coarse`, f.coarse);
      check(`${tag}: page never overflows`, f.page);
      check(`${tag}: segments ≥ 44 × 44`, f.labels.every((l) => l.w >= 44 - 0.5 && l.h >= 44 - 0.5), JSON.stringify(f.labels));
      check(`${tag}: labels whole`, f.labels.every((l) => l.whole));
      const want = decideLayout({ avail: f.m.avail, inline: f.m.inline, min: f.m.min, gap: f.m.gap, pad: f.m.pad });
      check(`${tag}: data-overflow = the shared formula`, f.overflow === want.overflow && f.layout === want.layout,
        `${f.layout}/${f.overflow} vs ${want.layout}/${want.overflow} min ${f.m.min.map((x) => x.toFixed(1))}`);
      check(`${tag}: overflow ⇔ the rail scrolls`, f.overflow === f.scrolls);
    }
    check('upgraded coarse: 3 short options overflow at 140 (minRail 142)', (await p.evaluate(facts, 'u140')).overflow === true);
    check('upgraded coarse: 3 short options fit at 144', (await p.evaluate(facts, 'u144')).overflow === false);
    check('upgraded coarse: a long unbreakable label overflows at 216', (await p.evaluate(facts, 'uword216')).overflow === true);
    await context.close();
  }
  // ---------------------------------------------------------------- no JS + pre-upgrade, coarse, 140 px -------------
  const narrow = [
    { id: 'n3', width: 140, options: THEME, stretch: false },
    { id: 'n3s', width: 140, options: THEME, stretch: true },
    { id: 'n5', width: 140, options: FIVE, stretch: false },
    { id: 'n5s', width: 140, options: FIVE, stretch: true },
  ];
  for (const [mode, js] of [['no JS', false], ['pre-upgrade', true], ['upgraded', 'module']]) {
    const { p, context } = await open(browser, page(markup(narrow), js === 'module'), { js: js !== false });
    // Playwright's evaluate runs in its own world: it works with page scripts off (checked: scripting: none matches)
    if (js === 'module') await p.waitForFunction(() => window.__ready === true);
    else if (js === false) check('no JS: (scripting: none)', await p.evaluate(() => matchMedia('(scripting: none)').matches));
    else check(`${mode}: not upgraded`, await p.evaluate(() => document.querySelector('td-choice-group:not(:defined)') != null));
    for (const c of narrow) {
      const tag = `${mode} coarse ${c.id}`;
      const f = await p.evaluate(facts, c.id);
      check(`${tag}: page never overflows`, f.page);
      check(`${tag}: segments ≥ 44 × 44`, f.labels.every((l) => l.w >= 44 - 0.5 && l.h >= 44 - 0.5), JSON.stringify(f.labels));
      check(`${tag}: every label whole + fully visible once scrolled into the rail`, f.labels.every((l) => l.whole && l.visible), JSON.stringify(f.labels));
      const o = await focusOutlineInside(p, c.id);
      check(`${tag}: focus outline inside the rail padding box`, o.ok, o.why);
    }
    if (js === false) {
      // geometry without script: measured from the outside (Playwright bounding boxes + scroll sizes via the protocol)
      const pageW = await p.$eval('html', (h) => h.scrollWidth).catch(() => null);
      check('no JS: page never overflows (html scrollWidth ≤ 390)', pageW == null || pageW <= 390, String(pageW));
      for (const c of narrow) {
        const faces = await p.$$(`.box[data-case="${c.id}"] .td-choice__face`);
        for (const [i, f] of faces.entries()) {
          await f.scrollIntoViewIfNeeded();
          const b = await f.boundingBox();
          check(`no JS ${c.id} face ${i}: ≥ 44 × 44`, b && b.width >= 43.5 && b.height >= 43.5, JSON.stringify(b));
          const t = await p.$(`.box[data-case="${c.id}"] .td-choice__option:nth-child(${i + 1}) .td-choice__text`);
          const tb = await t.boundingBox();
          const rb = await (await p.$(`.box[data-case="${c.id}"] .td-choice__options`)).boundingBox();
          check(`no JS ${c.id} label ${i}: fully visible once scrolled into the rail`, tb && rb && tb.x >= rb.x - 1 && tb.x + tb.width <= rb.x + rb.width + 1, JSON.stringify({ tb, rb }));
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Segmented layout (coarse pointer, PHP markup, no JS / pre-upgrade / upgraded): all ${checks} checks passed (chromium).`);
