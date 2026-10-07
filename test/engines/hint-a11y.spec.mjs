/**
 * v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 3, 5, 10, M0 / M1; Codex plan-review r2 #13): the accessible name
 * and description of the helper text in Chromium, Firefox and WebKit. Playwright has no accessibility snapshot API, so:
 *
 *   Chromium  CDP Accessibility.getFullAXTree: name / description of the real controls — a hint is in the description,
 *             an error REPLACES it (the hidden note is not read: an element hidden but referenced directly would be),
 *             the toggle's state text is in the description (current state only) and NEVER in the name (it sits in the
 *             label, aria-hidden)
 *   Firefox / WebKit  DOM-level: every aria-describedby id resolves, the joined text is exactly the expected one, the
 *             name from the wrapping label minus aria-hidden subtrees
 *
 * Plus the no-JS toggle (javaScriptEnabled: false, the PHP markup of test/ssr/fixtures/hint.html): a click flips the
 * native switch, CSS shows the other state text, and aria-describedby never carries a (stale) state id.
 *
 * Run: npm run test:engines (or node test/engines/hint-a11y.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';

const LIVE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body><main>
  <td-input-field id="f1" label="Mã số thuế" helper-text="10 hoặc 13 chữ số"></td-input-field>
  <td-input-field id="f2" label="Email" helper-text="Email công ty" error-text="Email không hợp lệ"></td-input-field>
  <td-toggle id="t1" label="Lưu trữ" on-text="Đang dùng" off-text="Đã lưu trữ" helper-text="Ẩn khỏi danh sách"></td-toggle>
  <td-toggle id="t2" label="Thông báo" checked on-text="Đang bật" off-text="Đang tắt" helper-text="Mỗi tuần" error-text="Không lưu được"></td-toggle>
  <label for="n1">Ghi chú</label><input id="n1"><td-hint for="n1" id="n1-hint">Không ghi <b>số điện thoại</b></td-hint>
  <td-dropdown id="d1" label="Thành phố"><td-hint>Xem <a href="#">bảng phí</a></td-hint></td-dropdown>
</main>
<script type="module">
  import '/src/form/td-input-field.js';
  import '/src/form/td-toggle.js';
  import '/src/form/td-dropdown.js';
  import '/src/form/td-hint.js';
  await Promise.all(['td-input-field', 'td-toggle', 'td-dropdown', 'td-hint'].map((t) => customElements.whenDefined(t)));
  await new Promise((r) => setTimeout(r, 50));
  window.__ready = true;
</script></body></html>`;

/** the expected { name, description } per control (selector of the described element) */
const WANT = [
  { sel: '#f1 .td-field__control', role: 'textbox', name: 'Mã số thuế', description: '10 hoặc 13 chữ số' },
  { sel: '#f2 .td-field__control', role: 'textbox', name: 'Email', description: 'Email không hợp lệ' },
  { sel: '#t1 input', role: 'switch', name: 'Lưu trữ', description: 'Đã lưu trữ Ẩn khỏi danh sách' },
  { sel: '#t2 input', role: 'switch', name: 'Thông báo', description: 'Đang bật Không lưu được' },
  { sel: '#n1', role: 'textbox', name: 'Ghi chú', description: 'Không ghi số điện thoại' },
  { sel: '#d1 .td-dropdown__trigger', role: 'combobox', name: 'Thành phố', description: 'Xem bảng phí', nameStarts: true },
];

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
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

async function open(browser, body, js = true) {
  const context = await browser.newContext({ javaScriptEnabled: js });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/'))) return route.fulfill({ status: 404, body: '' });
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[rel.slice(rel.lastIndexOf('.'))] || 'text/plain', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  if (js) await page.waitForFunction(() => window.__ready === true);
  return { page, context };
}

/** DOM-level semantics (every engine): description = joined text of the aria-describedby ids; name = the label text */
const domFacts = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const targets = ids.map((x) => document.getElementById(x));
  const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((x) => document.getElementById(x));
  const labels = labelled.length ? labelled : [...(el.labels || [])];
  const nameOf = (l) => {
    const c = l.cloneNode(true);
    for (const h of c.querySelectorAll('[aria-hidden="true"], .td-field__required')) h.remove();
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  return {
    resolved: targets.every(Boolean),
    description: targets.map((t) => (t ? t.textContent.replace(/\s+/g, ' ').trim() : '')).join(' '),
    name: labels.map(nameOf).join(' ').trim(),
  };
}, sel);

async function live(engine, browser) {
  const { page, context } = await open(browser, LIVE);
  for (const w of WANT) {
    const f = await domFacts(page, w.sel);
    const tag = `${engine} ${w.sel}`;
    check(`${tag} aria-describedby resolves`, f.resolved, JSON.stringify(f));
    check(`${tag} description (DOM) exact`, f.description === w.description, f.description);
    check(`${tag} name (DOM)`, w.nameStarts ? f.name.startsWith(w.name) : f.name === w.name, f.name);
  }
  // a click on the toggle → the description follows the CURRENT state
  await page.click('#t1 .td-switch__track');
  await page.waitForTimeout(30);
  const after = await domFacts(page, '#t1 input');
  check(`${engine} toggle flipped → description of the new state`, after.description === 'Đang dùng Ẩn khỏi danh sách', after.description);
  const vis = await page.evaluate(() => ['on', 'off'].map((k) => getComputedStyle(document.querySelector(`#t1 .td-switch__state-${k}`)).visibility));
  check(`${engine} toggle flipped → the on text shown`, vis[0] === 'visible' && vis[1] === 'hidden', vis.join());
  await page.click('#t1 .td-switch__track');
  await page.waitForTimeout(30);
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    for (const w of WANT) {
      const { node } = await cdp.send('DOM.describeNode', { objectId: (await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(w.sel)})` })).result.objectId });
      const ax = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
      const tag = `chromium AX ${w.sel}`;
      if (!ax) { check(`${tag} present`, false); continue; }
      const name = ax.name?.value || '';
      check(`${tag} name`, w.nameStarts ? name.startsWith(w.name) : name === w.name, name);
      check(`${tag} name never contains the state text`, !/Đang dùng|Đã lưu trữ|Đang bật|Đang tắt/.test(name), name);
      check(`${tag} description exact`, (ax.description?.value || '') === w.description, ax.description?.value);
      notes.push(`${tag}: role=${ax.role?.value} name="${name}" description="${ax.description?.value}"`);
    }
    await cdp.detach();
  }
  await context.close();
}

/** no JS: the PHP markup (test/ssr/fixtures/hint.html, case tg) */
async function nojs(engine, browser) {
  const fixture = await readFile(join(ROOT, 'test/ssr/fixtures/hint.html'), 'utf8');
  const tg = fixture.split('\n').find((l) => l.includes('data-case="tg"'));
  const body = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>${tg}</body></html>`;
  const { page, context } = await open(browser, body, false);
  const state = () => page.evaluate(() => {
    const i = document.getElementById('h-tg');
    return { checked: i.checked, desc: i.getAttribute('aria-describedby') || '',
      on: getComputedStyle(document.getElementById('h-tg-host-on')).visibility,
      off: getComputedStyle(document.getElementById('h-tg-host-off')).visibility };
  });
  let s = await state();
  check(`${engine} no-JS: off → off text shown, no state id`, !s.checked && s.off === 'visible' && s.on === 'hidden' && !/-(on|off)\b/.test(s.desc), JSON.stringify(s));
  await page.click('#h-tg-host .td-switch__track');
  s = await state();
  check(`${engine} no-JS: clicked → on text shown, still no (stale) state id`, s.checked && s.on === 'visible' && s.off === 'hidden' && !/-(on|off)\b/.test(s.desc), JSON.stringify(s));
  const f = await domFacts(page, '#h-tg');
  check(`${engine} no-JS: description = the helper note only`, f.description === 'Email mỗi tuần', f.description);
  check(`${engine} no-JS: name = the label only`, f.name === 'Thông báo', f.name);
  await context.close();
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
    await live(name, browser);
    await nojs(name, browser);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
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
console.log(`Helper text accessibility: all ${checks} checks passed (chromium, firefox, webkit; live + no-JS).`);
