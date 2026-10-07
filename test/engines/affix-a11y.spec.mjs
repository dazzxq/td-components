/**
 * v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 4, M0.1 / M1): accessible name and description of the
 * prefix / suffix of <td-input-field> and <td-number-input> in Chromium, Firefox and WebKit. Playwright has no
 * accessibility snapshot API, so:
 *
 *   Chromium  CDP Accessibility.getFullAXTree: name = the label ONLY (never the affix text), description STARTS with the
 *             unit (unit-label → suffix → prefix), then the hint, the counter, the error (the unit stays with an error);
 *             no exposed text node carries the visible affix (aria-hidden — not read twice); a slot button keeps its
 *             own name (the kit never hides it)
 *   Firefox / WebKit  DOM-level: every aria-describedby id resolves, the joined text is exactly the expected one, the name
 *             from the label minus aria-hidden subtrees, every visible affix span aria-hidden
 *
 * Plus no JS (javaScriptEnabled: false): the PHP markup of test/ssr/fixtures/affix.html (native td_field / td_number_input
 * and element mode before any upgrade) — the description already starts with the unit.
 *
 * Run: npm run test:engines (or node test/engines/affix-a11y.spec.mjs)
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
  <td-input-field id="a1" label="Website" prefix="https://" suffix=".vn" helper-text="Tên miền công ty"></td-input-field>
  <td-input-field id="a2" label="Giá" suffix="đ" unit-label="đồng" helper-text="Đã gồm VAT" error-text="Giá không hợp lệ" max-length="9"></td-input-field>
  <td-number-input id="a3" label="Giá bán" suffix="₫" suffix-icon="lock" unit-label="đồng" helper-text="Đã gồm VAT"></td-number-input>
  <td-input-field id="a4" label="Tìm kiếm" type="search" prefix-icon="search"></td-input-field>
  <td-input-field id="a5" label="Mật khẩu" type="password" prefix="#"><button type="button" slot="suffix" id="a5b" aria-label="Hiện mật khẩu">👁</button></td-input-field>
  <td-number-input id="a6" label="Phí" prefix="$" error-text="Quá hạn mức"></td-number-input>
</main>
<script type="module">
  import '/src/form/td-input-field.js';
  import '/src/form/td-number-input.js';
  await Promise.all(['td-input-field', 'td-number-input'].map((t) => customElements.whenDefined(t)));
  await new Promise((r) => setTimeout(r, 50));
  window.__ready = true;
</script></body></html>`;

/** the expected { name, description } per control */
const WANT = [
  { sel: '#a1 input', name: 'Website', description: '.vn Tên miền công ty', affixes: ['https://', '.vn'] },
  { sel: '#a2 input', name: 'Giá', description: 'đồng 0/9 ký tự Giá không hợp lệ', affixes: ['đ'] },
  { sel: '#a3 input', name: 'Giá bán', description: 'đồng Đã gồm VAT', affixes: ['₫'] },
  { sel: '#a4 input', name: 'Tìm kiếm', description: '', affixes: [] },
  { sel: '#a5 input', name: 'Mật khẩu', description: '#', affixes: ['#'] },
  { sel: '#a6 input', name: 'Phí', description: '$ Quá hạn mức', affixes: ['$'] },
];

/** no JS: the PHP markup (control id → expected description) */
const NOJS = [
  { id: 'af-n-control', description: 'https:// Không cần www' },
  { id: 'af-m-control', description: '@công-ty.vn Sai' },
  { id: 'an-n', description: '%' },
  { id: 'af-u', description: 'mi-li-am-pe giờ Theo nhà sản xuất 4/6 ký tự' },
  { id: 'af-e', description: 'đồng Giá không hợp lệ' },
  { id: 'an-i', description: 'đồng' },
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
  const labels = [...(el.labels || [])];
  const nameOf = (l) => {
    const c = l.cloneNode(true);
    for (const h of c.querySelectorAll('[aria-hidden="true"], .td-field__required')) h.remove();
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const box = el.parentElement;
  const visibleAffixes = [...box.children].filter((c) => /__affix(?!--slot)/.test(c.className) && !c.classList.contains('td-field__affix--slot')
    && !c.classList.contains('td-number__affix--slot') && !c.hidden);
  return {
    resolved: targets.every(Boolean),
    description: targets.map((t) => (t ? t.textContent.replace(/\s+/g, ' ').trim() : '')).join(' ').trim(),
    name: labels.map(nameOf).join(' ').trim(),
    affixHidden: visibleAffixes.every((a) => a.getAttribute('aria-hidden') === 'true'),
    affixCount: visibleAffixes.length,
  };
}, sel);

async function live(engine, browser) {
  const { page, context } = await open(browser, LIVE);
  for (const w of WANT) {
    const f = await domFacts(page, w.sel);
    const tag = `${engine} ${w.sel}`;
    check(`${tag} aria-describedby resolves`, f.resolved, JSON.stringify(f));
    check(`${tag} description (DOM) exact`, f.description === w.description, f.description);
    check(`${tag} name (DOM)`, f.name === w.name, f.name);
    check(`${tag} visible affixes aria-hidden`, f.affixHidden && f.affixCount >= (w.affixes.length ? 1 : 0), JSON.stringify(f));
  }
  const slotBtn = await page.evaluate(() => {
    const b = document.getElementById('a5b');
    let n = b;
    let hidden = false;
    while (n) { if (n.getAttribute?.('aria-hidden') === 'true') hidden = true; n = n.parentElement; }
    return { hidden, inBox: !!b.closest('.td-field__box') };
  });
  check(`${engine} slot button not hidden, inside the box`, !slotBtn.hidden && slotBtn.inBox, JSON.stringify(slotBtn));
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const nodeOf = async (sel) => {
      const { node } = await cdp.send('DOM.describeNode', { objectId: (await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` })).result.objectId });
      return nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
    };
    for (const w of WANT) {
      const ax = await nodeOf(w.sel);
      const tag = `chromium AX ${w.sel}`;
      if (!ax) { check(`${tag} present`, false); continue; }
      const name = ax.name?.value || '';
      check(`${tag} name = the label only`, name === w.name, name);
      check(`${tag} description exact`, (ax.description?.value || '') === w.description, ax.description?.value);
      notes.push(`${tag}: role=${ax.role?.value} name="${name}" description="${ax.description?.value}"`);
    }
    // not read twice: no exposed (non-ignored) text node carries a visible affix text
    const affixTexts = new Set(WANT.flatMap((w) => w.affixes));
    const exposed = nodes.filter((n) => !n.ignored && n.role?.value === 'StaticText' && affixTexts.has(n.name?.value));
    check('chromium affix text never exposed as its own text node', exposed.length === 0, exposed.map((n) => n.name?.value).join(','));
    const btn = await nodeOf('#a5b');
    check('chromium slot button keeps its own name', btn && !btn.ignored && btn.name?.value === 'Hiện mật khẩu', JSON.stringify(btn?.name));
    await cdp.detach();
  }
  await context.close();
}

/** no JS: the PHP markup (test/ssr/fixtures/affix.html) */
async function nojs(engine, browser) {
  const fixture = await readFile(join(ROOT, 'test/ssr/fixtures/affix.html'), 'utf8');
  const body = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>${fixture}</body></html>`;
  const { page, context } = await open(browser, body, false);
  for (const w of NOJS) {
    const f = await domFacts(page, `#${w.id}`);
    check(`${engine} no-JS #${w.id} description starts with the unit`, f.resolved && f.description === w.description, f.description);
    check(`${engine} no-JS #${w.id} affixes aria-hidden`, f.affixHidden, JSON.stringify(f));
  }
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
console.log(`Affix accessibility: all ${checks} checks passed (chromium, firefox, webkit; live + no-JS).`);
