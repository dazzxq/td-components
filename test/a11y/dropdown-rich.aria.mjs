#!/usr/bin/env node
/**
 * v0.84.0 (plan docs/internal/plans/v0.84.0-dropdown-rich.md, Step 4 (o)) — the accessibility TREE of a rich, grouped
 * td-dropdown in Chromium, read with Playwright's `locator.ariaSnapshot()` (the `a11ySnapshot` command of
 * @web/test-runner-commands needs `page.accessibility`, which playwright-core 1.60 removed — Codex plan r2 #5).
 *
 * Asserted: listbox > group "<header>" > option "<label only>" (the description / status / meta never fold into the
 * name), the trailing options outside any group, a disabled option marked, the selected option marked, the create row
 * last. ariaSnapshot does not expose descriptions: `aria-describedby` resolution is asserted in the WTR test
 * src/form/td-v084-dropdown-rich.engines.browser-test.js (b). Same server pattern as test/touch/touch.spec.mjs (routes
 * on a fake origin, files read from the repo, td.css from the root build).
 *
 *   node test/a11y/dropdown-rich.aria.mjs     (npm run test:a11y)
 */
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://a11y.local';
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  await import('${ORIGIN}/src/form/td-dropdown.js');
  const el = document.getElementById('dd');
  el.groups = [{ key: 'w', label: 'Kho hàng' }, { key: 's', label: 'Cửa hàng' }];
  el.options = [
    { value: 'a', label: 'Kho chính', icon: 'archive', iconTone: 'accent', description: 'Hà Nội', status: { tone: 'success', text: 'Đang mở' }, meta: '12 SP', group: 'w' },
    { value: 'b', label: 'Kho phụ', description: 'Sài Gòn', status: { tone: 'danger', text: 'Đóng' }, disabled: true, group: 'w' },
    { value: 'c', label: 'Cửa hàng Láng', icon: 'star', meta: '3', group: 's' },
    { value: 'd', label: 'Khác' },
  ];
  el.setValue('c');
  window.__ready = true;
</script></head><body><td-dropdown id="dd" label="Nơi nhận" create-label="Thêm nơi nhận" allow-clear="false"></td-dropdown></body></html>`;

// `option "<name>": <text>` — the quoted part is the accessible NAME (= the label only, via aria-labelledby); the text after
// the colon is the row's inner content that ariaSnapshot lists for every element with text children (not the name). The
// group header (role=presentation) is plain text inside its group, the group is named by it.
const EXPECTED = `- listbox "Nơi nhận":
  - group "Kho hàng":
    - text: Kho hàng
    - option "Kho chính": Kho chính Hà Nội Đang mở 12 SP
    - option "Kho phụ" [disabled]: Kho phụ Sài Gòn Đóng
  - group "Cửa hàng":
    - text: Cửa hàng
    - option "Cửa hàng Láng" [selected]: Cửa hàng Láng 3
  - option "Khác"
  - option "Thêm nơi nhận"`;

const tdCss = await readFile(join(ROOT, 'td.css'), 'utf8');
const failures = [];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 } });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (url.pathname === '/td.css') return route.fulfill({ status: 200, contentType: 'text/css', body: tdCss });
    if (/^\/src\//.test(url.pathname) && !url.pathname.includes('..')) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      try {
        return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: await readFile(join(ROOT, url.pathname)) });
      } catch { /* 404 below */ }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  await page.locator('#dd-trigger').click();
  await page.waitForFunction(() => !document.getElementById('dd-menu').hidden);
  const snap = (await page.locator('#dd-listbox').ariaSnapshot()).trim();
  if (snap !== EXPECTED) failures.push(`listbox tree differs:\n--- expected\n${EXPECTED}\n--- actual\n${snap}`);
  // the trigger: a combobox named by its label (the selected option's icon is aria-hidden, adds nothing)
  const trig = (await page.locator('#dd-trigger').ariaSnapshot()).trim();
  if (!/^- combobox "Nơi nhận"/.test(trig)) failures.push(`trigger: expected a combobox "Nơi nhận", got:\n${trig}`);
  if (!trig.includes('Cửa hàng Láng')) failures.push(`trigger: expected the value text "Cửa hàng Láng", got:\n${trig}`);
  if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`dropdown-rich aria: ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('dropdown-rich aria: OK (listbox > group > option names, disabled / selected, create row last; trigger name)');
