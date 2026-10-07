/**
 * v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 10a): <td-number-input> under a REAL input method editor
 * session — Chromium CDP `Input.imeSetComposition` (the composition string the IME shows) then `Input.insertText` (the
 * commit). Firefox / WebKit have no IME driver in Playwright: the synthetic compositionstart → input (isComposing) →
 * compositionend sequence runs in every engine in src/form/td-v055-number.engines.browser-test.js.
 *
 *   - while composing: the field is never re-formatted (the IME owns the text) and the host fires no `input`;
 *   - on commit: the value is normalised ONCE (full-width / Arabic-Indic digits → ASCII, grouped), the caret sits right
 *     after the composed digit, exactly one host `input` with the canonical value.
 *
 * Run: npm run test:engines (or node test/engines/number-ime.spec.mjs)
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>
  <td-number-input id="n1" label="Giá" value="1000"></td-number-input>
  <td-number-input id="n2" label="Tỉ lệ" decimals="2" value="12"></td-number-input>
<script type="module">
  import '/src/form/td-number-input.js';
  await customElements.whenDefined('td-number-input');
  window.__inputs = { n1: [], n2: [] };
  for (const id of ['n1', 'n2']) document.getElementById(id).addEventListener('input', (e) => { if (e instanceof CustomEvent) window.__inputs[id].push(e.detail.value); });
  window.__ready = true;
</script></body></html>`;

const failures = [];
let checks = 0;
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('..') || !(rel === 'td.css' || rel.startsWith('src/'))) return route.fulfill({ status: 404, body: '' });
    const file = join(ROOT, rel);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: rel.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  const cdp = await page.context().newCDPSession(page);
  const state = (id) => page.evaluate((i) => {
    const c = document.querySelector(`#${i} input`);
    return { value: c.value, caret: c.selectionStart, host: document.getElementById(i).value, inputs: window.__inputs[i] };
  }, id);

  // 1. a full-width digit composed in the middle of a group: 1|.000 → 12.000
  await page.evaluate(() => { const c = document.querySelector('#n1 input'); c.focus(); c.setSelectionRange(1, 1); });
  await cdp.send('Input.imeSetComposition', { text: '２', selectionStart: 1, selectionEnd: 1 });
  let s = await state('n1');
  check('composing: the IME text is left alone (no grouping / normalising mid-composition)', s.value === '1２.000', JSON.stringify(s));
  check('composing: no host input event', s.inputs.length === 0, JSON.stringify(s));
  await cdp.send('Input.insertText', { text: '２' });
  s = await state('n1');
  check('commit: normalised once, grouped', s.value === '12.000' && s.host === '12000', JSON.stringify(s));
  check('commit: caret right after the composed digit', s.caret === 2, JSON.stringify(s));
  check('commit: exactly one host input with the canonical value', JSON.stringify(s.inputs) === '["12000"]', JSON.stringify(s));

  // 2. a multi-step composition (two digits, the IME updates its string) at the end of a decimal field
  await page.evaluate(() => { const c = document.querySelector('#n2 input'); c.focus(); c.setSelectionRange(2, 2); });
  await cdp.send('Input.imeSetComposition', { text: '٣', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '٣٤', selectionStart: 2, selectionEnd: 2 });
  s = await state('n2');
  check('multi-step composing: untouched, no host input', s.value === '12٣٤' && s.inputs.length === 0, JSON.stringify(s));
  await cdp.send('Input.insertText', { text: '٣٤' });
  s = await state('n2');
  check('multi-step commit: ASCII digits, one input', s.value === '1.234' && s.host === '1234' && JSON.stringify(s.inputs) === '["1234"]', JSON.stringify(s));
  await cdp.detach();
} catch (e) {
  failures.push(`chromium: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`--- ${failures.length} FAILURE(S) ---`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`Number IME (Chromium CDP): all ${checks} checks passed.`);
