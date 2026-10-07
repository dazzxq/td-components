/**
 * v0.57.0 (plan docs/internal/plans/v0.57.0-tree-table.md M0.1 / M1 "A11y", QĐ 6, QĐ 8): the accessibility tree of
 * `td-table tree` in Chromium, Firefox and WebKit, table AND card layout (card mode changes `display` only — the
 * explicit roles must keep the treegrid semantics).
 *
 *   Chromium  CDP Accessibility.getFullAXTree: one `treegrid` named by the title, data rows `row` with `level` and
 *             (parents only) `expanded`, cells `gridcell`, the toggle a `button` named "Mở {label}" / "Thu gọn {label}"
 *   Firefox / WebKit  DOM-level: role="treegrid" on the table, every body row role="row" + aria-level / aria-setsize /
 *             aria-posinset, aria-expanded only on parents, gridcell cells, the toggle a <button type="button"
 *             tabindex="-1"> with that aria-label and NO aria-expanded
 *
 * Run: npm run test:engines (or node test/engines/tree-table-a11y.spec.mjs)
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://engines.local';

const PAGE = (layout) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="/td.css"></head><body>
<main><div id="wrap"><td-table id="t" tree row-key="id" title="Danh mục" layout="${layout}"></td-table></div></main>
<script type="module">
  import '/src/display/td-table.js';
  await customElements.whenDefined('td-table');
  document.getElementById('wrap').style.width = '${layout === 'cards' ? 360 : 900}px';
  const t = document.getElementById('t');
  t.columns = [{ key: 'name', label: 'Tên' }, { key: 'code', label: 'Mã' }];
  t.data = [
    { id: 'ao', name: 'Áo', code: 'C1', children: [
      { id: 'thun', name: 'Áo thun', code: 'C2', children: [{ id: 'tron', name: 'Cổ tròn', code: 'C3' }] },
      { id: 'khoac', name: 'Áo khoác', code: 'C4' },
    ] },
    { id: 'quan', name: 'Quần', code: 'C5', children: [{ id: 'jeans', name: 'Jeans', code: 'C6' }] },
    { id: 'pk', name: 'Phụ kiện', code: 'C7' },
  ];
  t.expandedKeys = ['ao', 'thun'];
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = true;
</script>
</body></html>`;

// [name, level, setsize, posinset, expanded]
const WANT = [
  ['Áo', '1', '3', '1', 'true'],
  ['Áo thun', '2', '2', '1', 'true'],
  ['Cổ tròn', '3', '1', '1', null],
  ['Áo khoác', '2', '2', '2', null],
  ['Quần', '1', '3', '2', 'false'],
  ['Phụ kiện', '1', '3', '3', null],
];

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

async function freshPage(browser, layout) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE(layout) });
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

const domFacts = (page) => page.evaluate(() => {
  const t = document.getElementById('t');
  const table = t.querySelector('table');
  const rows = [...t.querySelectorAll('.td-table__body > tr')].map((tr) => {
    const toggle = tr.querySelector('.td-table__tree-toggle');
    return {
      role: tr.getAttribute('role'),
      name: tr.querySelector('[data-col="0"]').textContent.replace(/\s+/g, ' ').trim(),
      attrs: ['aria-level', 'aria-setsize', 'aria-posinset', 'aria-expanded'].map((a) => tr.getAttribute(a)),
      cells: [...tr.children].every((td) => td.getAttribute('role') === 'gridcell'),
      toggle: toggle ? { tag: toggle.tagName, type: toggle.getAttribute('type'), tabindex: toggle.getAttribute('tabindex'),
        label: toggle.getAttribute('aria-label'), expanded: toggle.hasAttribute('aria-expanded') } : null,
      display: getComputedStyle(tr).display,
    };
  });
  return { role: table.getAttribute('role'), rows };
});

async function evidence(engine, page, context, layout) {
  const f = await domFacts(page);
  const tag = `${engine} [${layout}]`;
  check(`${tag} table role=treegrid`, f.role === 'treegrid', f.role);
  check(`${tag} ${WANT.length} rows`, f.rows.length === WANT.length, String(f.rows.length));
  if (layout === 'cards') check(`${tag} card display (flex rows)`, f.rows.every((r) => r.display === 'flex'), f.rows.map((r) => r.display).join());
  WANT.forEach(([name, ...attrs], i) => {
    const r = f.rows[i];
    if (!r) return;
    check(`${tag} row ${i} name`, r.name === name, r.name);
    check(`${tag} ${name}: role=row`, r.role === 'row');
    check(`${tag} ${name}: level / setsize / posinset / expanded`, JSON.stringify(r.attrs) === JSON.stringify(attrs), JSON.stringify(r.attrs));
    check(`${tag} ${name}: gridcell cells`, r.cells);
    if (attrs[3] !== null) {
      const want = `${attrs[3] === 'true' ? 'Thu gọn' : 'Mở'} ${name}`;
      check(`${tag} ${name}: toggle button`, r.toggle && r.toggle.tag === 'BUTTON' && r.toggle.type === 'button'
        && r.toggle.tabindex === '-1' && r.toggle.label === want && !r.toggle.expanded, JSON.stringify(r.toggle));
    } else {
      check(`${tag} ${name}: no toggle on a leaf`, r.toggle === null);
    }
  });
  if (engine !== 'chromium') return;
  const cdp = await context.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const grids = nodes.filter((n) => n.role?.value === 'treegrid');
  check(`${tag} AX: one treegrid named "Danh mục"`, grids.length === 1 && grids[0].name?.value === 'Danh mục', JSON.stringify(grids.map((g) => g.name?.value)));
  const rows = nodes.filter((n) => n.role?.value === 'row' && n.properties?.some((p) => p.name === 'level'));
  const prop = (n, k) => n.properties?.find((p) => p.name === k)?.value?.value;
  check(`${tag} AX: ${WANT.length} rows with a level`, rows.length === WANT.length, String(rows.length));
  rows.forEach((n, i) => {
    const w = WANT[i];
    if (!w) return;
    check(`${tag} AX ${w[0]}: level`, String(prop(n, 'level')) === w[1], String(prop(n, 'level')));
    const ex = prop(n, 'expanded');
    check(`${tag} AX ${w[0]}: expanded`, w[4] === null ? ex === undefined : String(ex) === w[4], String(ex));
  });
  const cells = nodes.filter((n) => n.role?.value === 'gridcell');
  check(`${tag} AX: gridcells`, cells.length === WANT.length * 2, String(cells.length));
  const buttons = nodes.filter((n) => n.role?.value === 'button').map((n) => n.name?.value);
  for (const name of ['Thu gọn Áo', 'Thu gọn Áo thun', 'Mở Quần']) check(`${tag} AX: button "${name}"`, buttons.includes(name), buttons.join(' | '));
  notes.push(`${tag} AX rows: ${rows.map((n) => `"${n.name?.value}" L${prop(n, 'level')}`).join(', ')}`);
  await cdp.detach();
}

for (const [name, launcher] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher));
  } catch (err) {
    failures.push(`${name}: launch failed — ${err.message}`);
    continue;
  }
  for (const layout of ['table', 'cards']) {
    const { page, context } = await freshPage(browser, layout);
    await evidence(name, page, context, layout);
    await context.close();
  }
  await browser.close();
}

for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  console.log(`tree-table-a11y: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`tree-table-a11y: ${checks} checks passed (Chromium AX + DOM-level Firefox / WebKit, table + cards).`);
