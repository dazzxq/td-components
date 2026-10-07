/**
 * v0.58.0 (plan docs/internal/plans/v0.58.0-floating-label.md QĐ 10, 10b + M0 → F1, M1): the floating label does not change
 * what assistive technology gets — the control's accessibility node is IDENTICAL to the same field in `top` mode, in
 * Chromium, Firefox and WebKit, with JS (upgraded component) and without JS (PHP markup of test/ssr/fixtures/floating.html):
 *
 *   all engines  Playwright's ARIA model (`locator.ariaSnapshot()` of the control): role + name = the label, and a placeholder
 *                only when the site gave a real one (F1: the label-text placeholder of an empty field is never exposed as a
 *                separate placeholder — it equals the name). Floating vs top: the same snapshot.
 *   Chromium     CDP Accessibility.getPartialAXTree: name, description and properties equal to the top-mode field.
 *
 * Run: npm run test:engines (or node test/engines/floating-a11y.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';

/** pairs: the same field in top mode (t*) and floating mode (f*) */
const PAIRS = [
  ['plain', 'label="Họ tên"'],
  ['value', 'label="Email" type="email" value="a@b.vn" required helper-text="Email công ty"'],
  ['placeholder', 'label="Điện thoại" type="tel" placeholder="vd: 0901 234 567"'],
  ['error', 'label="Mã số thuế" helper-text="10 hoặc 13 chữ số" error-text="Sai định dạng"'],
  ['textarea', 'label="Ghi chú" type="textarea" max-length="200"'],
  ['date', 'label="Ngày sinh" type="date"'],
  ['affix', 'label="Website" prefix="https://" suffix=".vn"'],
];
const LIVE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body><main>
${PAIRS.map(([id, a]) => `<td-input-field id="t-${id}" ${a}></td-input-field><td-input-field id="f-${id}" ${a} label-mode="floating"></td-input-field>`).join('\n')}
</main>
<script type="module">
  import '/src/form/td-input-field.js';
  await customElements.whenDefined('td-input-field');
  await new Promise((r) => setTimeout(r, 50));
  window.__ready = true;
</script></body></html>`;

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

const snap = (page, sel) => page.locator(sel).ariaSnapshot();

async function live(engine, browser) {
  const { page, context } = await open(browser, LIVE);
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const axOf = async (sel) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false });
    const n = nodes[0];
    return JSON.stringify({ role: n.role?.value, name: n.name?.value, description: n.description?.value ?? '',
      props: (n.properties || []).map((p) => `${p.name}=${JSON.stringify(p.value?.value)}`).sort() });
  };
  for (const [id] of PAIRS) {
    const t = `#t-${id} .td-field__control`;
    const f = `#f-${id} .td-field__control`;
    const floating = await page.evaluate((s) => document.querySelector(s).closest('.td-field').classList.contains('td-field--floating'), f);
    check(`${engine} ${id}: floating rendered`, floating);
    const [st, sf] = [await snap(page, t), await snap(page, f)];
    check(`${engine} ${id}: ARIA snapshot of the control = top mode`, st === sf, `top ${JSON.stringify(st)} floating ${JSON.stringify(sf)}`);
    // the description is the same id list (component-owned ids differ by host id only)
    const desc = await page.evaluate(([a, b]) => [a, b].map((s) => {
      const el = document.querySelector(s);
      return (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
        .map((x) => document.getElementById(x)?.textContent.trim() || `?${x}`).join(' | ');
    }), [t, f]);
    check(`${engine} ${id}: description text = top mode`, desc[0] === desc[1], JSON.stringify(desc));
    if (cdp) {
      const [at, af] = [await axOf(t), await axOf(f)];
      check(`chromium AX ${id}: node = top mode`, at === af, `top ${at} floating ${af}`);
    }
  }
  if (cdp) await cdp.detach();
  await context.close();
}

/** no JS: the PHP markup (test/ssr/fixtures/floating.html) — name = the label, placeholder only when real */
async function nojs(engine, browser) {
  const fixture = await readFile(join(ROOT, 'test/ssr/fixtures/floating.html'), 'utf8');
  const spec = JSON.parse(await readFile(join(ROOT, 'test/ssr/floating.fixtures.json'), 'utf8'));
  const body = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>${fixture}</body></html>`;
  const { page, context } = await open(browser, body, false);
  for (const c of spec.cases) {
    const o = c.args[c.args.length - 1];
    const role = o.type === 'date' ? null : 'textbox';
    const s = await snap(page, `#${c.control}`);
    if (role) check(`${engine} no-JS ${c.id}: role + name = the label`, s.split('\n')[0].startsWith(`- ${role} "${o.label}"`), s);
    else check(`${engine} no-JS ${c.id}: name = the label`, s.includes(`"${o.label}"`), s);
    check(`${engine} no-JS ${c.id}: placeholder exposed only when real`, s.includes('/placeholder:') === !!o.placeholder, s);
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
  console.log(`\nfloating-a11y: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nfloating-a11y: ${checks} checks passed (Chromium / Firefox / WebKit).`);
