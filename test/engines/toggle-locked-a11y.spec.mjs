/**
 * v0.52.0 M0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md QĐ 7 / QĐ 8, Codex plan-review r1 #1 + #4): the
 * accessibility of a LOCKED switch in Chromium, Firefox and WebKit. Playwright has no accessibility snapshot API, so:
 *
 *   Chromium  CDP Accessibility.getFullAXTree: role switch, checked, name = the label text only, description =
 *             EXACTLY "Không thể thay đổi: {reason}" (+ the status text first when a tone is on). Chromium exposes NO
 *             readonly AX property for a checkbox / switch, native or ARIA (M0 finding) — noted, not asserted
 *   Firefox / WebKit  DOM-level semantics: role="switch" on a native checkbox, checked, aria-readonly="true", every
 *             aria-describedby id resolves and the joined text is exactly the description above, the name comes from the
 *             wrapping <label> and the description spans sit OUTSIDE every label of the input
 *
 * Plus (c) a locked switch never flips (mouse on the switch, Space, the wrapping label, an external <label for>) and
 * fires no change, and (d) a `data-tooltip` on the host shows on hover and on keyboard focus of the inner input.
 *
 * Two fixtures: `proto` = the M0 prototype markup (the design, hand-written), `real` = the shipped <td-toggle locked>
 * (src/form/td-toggle.js + td.css) — the same evidence for both. A manual VoiceOver / NVDA checklist completes the
 * evidence (plan, "Kết quả M0").
 *
 * Run: npm run test:engines (or node test/engines/toggle-locked-a11y.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';
const REASON = 'Chính sách công ty bắt buộc 2FA';
const LOCK_DESC = `Không thể thay đổi: ${REASON}`;

const PROTO_SCRIPT = `<script>
  for (const input of document.querySelectorAll('[data-proto] input')) {
    input.addEventListener('click', (e) => {
      e.preventDefault();
      setTimeout(() => { input.checked = input.hasAttribute('data-on'); }, 0);
    });
  }
</script>`;

const proto = (id, { on = true, status = '', desc }) => `<div data-proto id="${id}-host">`
  + `<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input" id="${id}"`
  + `${on ? ' checked data-on' : ''} aria-readonly="true" aria-describedby="${status ? `${id}-host-status ` : ''}${id}-host-lock">`
  + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb"></span></span>'
  + '<span class="td-switch__label">Bắt buộc 2FA</span></label>'
  + (status ? `<span class="td-switch__status td-sr-only" id="${id}-host-status">${status}</span>` : '')
  + `<span class="td-switch__lock-reason td-sr-only" id="${id}-host-lock">${desc}</span></div>`;

const PAGE = (real) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>
<main>
  <input id="before" aria-label="trước">
  ${real
    ? `<td-toggle id="p1-host" label="Bắt buộc 2FA" checked locked locked-reason="${REASON}" data-tooltip="Mẹo"></td-toggle>
  <td-toggle id="p2-host" label="Bắt buộc 2FA" checked locked></td-toggle>
  <td-toggle id="p3-host" label="Bắt buộc 2FA" checked locked tone="warning" status-text="Đang chờ" locked-reason="${REASON}"></td-toggle>`
    : `${proto('p1', { desc: LOCK_DESC })}${proto('p2', { desc: 'Không thể thay đổi' })}${proto('p3', { status: 'Đang chờ', desc: LOCK_DESC })}`}
  <label id="ext" for="p1">Nhãn ngoài</label>
  <input id="after" aria-label="sau">
</main>
${real ? `<script type="module">
  import '/src/form/td-toggle.js';
  import '/src/feedback/td-tooltip.js';
  await customElements.whenDefined('td-toggle');
  const t = document.getElementById('p1-host');
  t.querySelector('input').id = 'p1';
  for (const h of document.querySelectorAll('td-toggle')) h.querySelector('input').id = h.id.replace('-host', '');
  window.__changes = 0;
  document.addEventListener('change', () => { window.__changes += 1; });
  window.__ready = true;
</script>` : `${PROTO_SCRIPT}<script type="module">
  import '/src/feedback/td-tooltip.js';
  document.getElementById('p1-host').setAttribute('data-tooltip', 'Mẹo');
  window.__changes = 0;
  document.addEventListener('change', () => { window.__changes += 1; });
  window.__ready = true;
</script>`}
</body></html>`;

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const failures = [];
const notes = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

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

async function freshPage(browser, real) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE(real) });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/'))) return route.fulfill({ status: 404, body: '' });
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

/** DOM-level semantics of the switch `id` (every engine). */
const domFacts = (page, id) => page.evaluate((sid) => {
  const input = document.getElementById(sid);
  const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const targets = ids.map((x) => document.getElementById(x));
  const labels = [...input.labels];
  const inLabel = targets.some((t) => t && labels.some((l) => l.contains(t)));
  const wrap = input.closest('label');
  return {
    type: input.type,
    role: input.getAttribute('role'),
    checked: input.checked,
    readonly: input.getAttribute('aria-readonly'),
    resolved: targets.every(Boolean) && targets.length > 0,
    description: targets.map((t) => (t ? t.textContent.trim() : '')).join(' '),
    name: wrap ? wrap.textContent.trim() : '',
    inLabel,
  };
}, id);

async function evidence(engine, page, context, which) {
  const want = {
    p1: { name: 'Bắt buộc 2FA', description: LOCK_DESC },
    p2: { name: 'Bắt buộc 2FA', description: 'Không thể thay đổi' },
    p3: { name: 'Bắt buộc 2FA', description: `Đang chờ ${LOCK_DESC}` },
  };
  for (const id of Object.keys(want)) {
    const f = await domFacts(page, id);
    const tag = `${engine} [${which}] ${id}`;
    check(`${tag} native checkbox role=switch, checked`, f.type === 'checkbox' && f.role === 'switch' && f.checked, JSON.stringify(f));
    check(`${tag} aria-readonly="true"`, f.readonly === 'true', String(f.readonly));
    check(`${tag} aria-describedby resolves`, f.resolved, JSON.stringify(f));
    check(`${tag} description text exact`, f.description === want[id].description, f.description);
    check(`${tag} name from the wrapping label = label text only`, f.name === want[id].name, f.name);
    check(`${tag} description spans outside every label`, !f.inLabel);
  }
  if (engine !== 'chromium') return;
  const cdp = await context.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const switches = nodes.filter((n) => n.role?.value === 'switch');
  for (const [i, id] of Object.keys(want).entries()) {
    const n = switches[i];
    const tag = `chromium [${which}] AX ${id}`;
    if (!n) { check(`${tag} present`, false, `${switches.length} switch node(s)`); continue; }
    const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value;
    check(`${tag} role switch, checked`, prop('checked') === 'true' || prop('checked') === true, JSON.stringify(prop('checked')));
    // M0 finding: Chromium maps aria-readonly to NO AX property on a checkbox / switch (native or ARIA) — the reason
    // the lock state is carried by the description (QĐ 7). Recorded, not asserted; DOM-level aria-readonly is asserted.
    if (prop('readonly') !== undefined) notes.push(`${tag}: readonly now exposed = ${prop('readonly')}`);
    // p1 also has the external <label for> (its text joins the name); the description text never does
    const name = n.name?.value || '';
    check(`${tag} name = label text(s) only`, name.startsWith(want[id].name) && !name.includes('Không thể thay đổi')
      && !name.includes('Đang chờ'), name);
    check(`${tag} description exact`, n.description?.value === want[id].description, n.description?.value);
    notes.push(`${tag}: name="${n.name?.value}" description="${n.description?.value}" readonly=${prop('readonly')}`);
  }
  await cdp.detach();
}

async function interactions(engine, page, which) {
  const TAB = engine === 'webkit' ? 'Alt+Tab' : 'Tab';
  const state = () => page.evaluate(() => ({ on: document.getElementById('p1').checked, changes: window.__changes }));
  const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
  const tag = `${engine} [${which}]`;
  // keyboard: Tab reaches it (focusable), Space does not flip
  await page.focus('#before');
  await page.keyboard.press(TAB);
  check(`${tag} (c) Tab reaches the locked switch`, await page.evaluate(() => document.activeElement?.id) === 'p1',
    await page.evaluate(() => document.activeElement?.id));
  await page.keyboard.press('Space');
  await settle();
  let s = await state();
  check(`${tag} (c) Space does not flip`, s.on === true && s.changes === 0, JSON.stringify(s));
  // (d) the host tooltip shows on keyboard focus of the inner input
  const tipFocus = await page.evaluate(() => {
    const tip = document.querySelector('.td-tooltip, [role="tooltip"]');
    return !!tip && tip.textContent.includes('Mẹo') && getComputedStyle(tip).visibility !== 'hidden' && !tip.hidden;
  });
  notes.push(`${tag} (d) host data-tooltip on keyboard focus of the inner input → ${tipFocus ? 'shown' : 'NOT shown'}`);
  // pointer on the switch, the wrapping label text, an external <label for>
  await page.click('#p1-host .td-switch__track');
  await settle();
  s = await state();
  check(`${tag} (c) click on the switch does not flip`, s.on === true && s.changes === 0, JSON.stringify(s));
  await page.click('#p1-host .td-switch__label');
  await settle();
  s = await state();
  check(`${tag} (c) click on the wrapping label does not flip`, s.on === true && s.changes === 0, JSON.stringify(s));
  await page.click('#ext');
  await settle();
  s = await state();
  check(`${tag} (c) external <label for> does not flip`, s.on === true && s.changes === 0, JSON.stringify(s));
  await page.mouse.move(0, 0);
  await page.hover('#p1-host .td-switch__track');
  await page.waitForTimeout(400);
  const tipHover = await page.evaluate(() => {
    const tip = document.querySelector('.td-tooltip, [role="tooltip"]');
    return !!tip && tip.textContent.includes('Mẹo') && getComputedStyle(tip).visibility !== 'hidden' && !tip.hidden;
  });
  notes.push(`${tag} (d) host data-tooltip on hover → ${tipHover ? 'shown' : 'NOT shown'}`);
}

async function runEngine(name, launcher, which) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (e) {
    failures.push(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    const { page, context } = await freshPage(browser, which === 'real');
    await evidence(name, page, context, which);
    await interactions(name, page, which);
    await context.close();
  } catch (e) {
    failures.push(`${name} [${which}]: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

const FIXTURES = (process.env.TD_LOCKED_FIXTURES || 'proto').split(',');
for (const which of FIXTURES) {
  await runEngine('chromium', chromium, which);
  await runEngine('firefox', firefox, which);
  await runEngine('webkit', webkit, which);
}

console.log('--- notes ---');
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Locked switch accessibility: all ${checks} checks passed (chromium, firefox, webkit; ${FIXTURES.join(' + ')}).`);
