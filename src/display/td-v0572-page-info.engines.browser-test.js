import { expect } from '@esm-bundle/chai';
import { TdTable } from './td-table.js';
import { TdPagination } from './td-pagination.js';

// v0.57.2 — the pagination info of a tree table (dsuite: "Hiển thị 1-3 / 3 mục" while 6 rows are on screen). Tree mode
// names the roots with a tree noun and adds the rows shown on the page (data rows only — never the loading / error
// status rows); it follows expand / collapse / lazy loads / moveRow / new data without a page change. Per-instance hooks:
// td-table `formatPageInfo(ctx)` and td-pagination `formatInfo(ctx)` — their result is TEXT; a non-string / a throw →
// the default text + one warning. A flat table's text is unchanged. Chromium, Firefox AND WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

const root = document.createElement('div');
document.body.appendChild(root);
const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  root.innerHTML = '';
});

// Áo › (Áo thun › Cổ tròn), Áo khoác ; Quần › Jeans ; Phụ kiện — 3 roots, 7 nodes
const CATS = () => [
  { id: 'ao', name: 'Áo', children: [
    { id: 'thun', name: 'Áo thun', children: [{ id: 'tron', name: 'Cổ tròn' }] },
    { id: 'khoac', name: 'Áo khoác' },
  ] },
  { id: 'quan', name: 'Quần', children: [{ id: 'jeans', name: 'Jeans' }] },
  { id: 'pk', name: 'Phụ kiện' },
];
const FLAT = () => [1, 2, 3, 4].map((i) => ({ id: i, name: `Hàng ${i}` }));
const COLS = [{ key: 'name', label: 'Tên', sortable: true }];

async function mk(attrs = 'tree row-key="id"', { data = CATS(), setup } = {}) {
  root.innerHTML = `<td-table ${attrs}></td-table>`;
  const el = root.querySelector('td-table');
  if (setup) setup(el);
  el.columns = COLS;
  el.data = data;
  await frames(2);
  return el;
}
const info = (el, where = 'bottom') => el.querySelector(where === 'top'
  ? '.td-table__header td-pagination .td-pagination__info' : '.td-table__footer td-pagination .td-pagination__info');
const text = (el) => {
  const top = info(el, 'top').textContent;
  const bottom = info(el).textContent;
  expect(top, 'top and bottom paginations agree').to.equal(bottom);
  return bottom;
};
const dataRows = (el) => el.querySelectorAll('.td-table__body > tr[data-row-idx]').length;

describe('v0.57.2 tree table — default info text', () => {
  it('names the roots ("nhóm") and adds the rows on the page; expand / collapse refresh it (both paginations, one live region)', async () => {
    const el = await mk();
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 3 dòng');
    el.expand('ao');
    await frames(1);
    expect(dataRows(el)).to.equal(5);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 5 dòng');
    el.expand('thun');
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 6 dòng');
    // the user's click on a toggle
    el.querySelector('.td-table__body > tr[aria-expanded="false"] .td-table__tree-toggle').click(); // Quần
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 7 dòng');
    el.collapse('ao');
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 4 dòng');
    expect(info(el).getAttribute('aria-live')).to.equal('polite');
    expect(info(el, 'top').hasAttribute('aria-live')).to.equal(false);
    expect(warns).to.deep.equal([]);
  });

  it('paging by roots: page 2 of 2 counts its own rows', async () => {
    const el = await mk('tree row-key="id" per-page="2"');
    el.expandAll();
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-2 / 3 nhóm · 6 dòng');
    el.setPage(2);
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 3-3 / 3 nhóm · 1 dòng');
  });

  it('lazy children: the status row is not counted; the loaded children are', async () => {
    const d = deferred();
    const el = await mk('tree row-key="id"', {
      data: [{ id: 'l', name: 'Lười', hasChildren: true }, { id: 'z', name: 'Cuối' }],
      setup: (t) => { t.loadChildren = () => d.promise; },
    });
    expect(text(el)).to.equal('Hiển thị 1-2 / 2 nhóm · 2 dòng');
    el.expand('l');
    await sleep(500);
    await frames(1);
    expect(el.querySelector('.td-table__row--tree-status') !== null, 'status row shown').to.equal(true);
    expect(text(el)).to.equal('Hiển thị 1-2 / 2 nhóm · 2 dòng');
    d.resolve([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    await d.promise;
    await frames(2);
    expect(dataRows(el)).to.equal(4);
    expect(text(el)).to.equal('Hiển thị 1-2 / 2 nhóm · 4 dòng');
  });

  it('moveRow (child → root) and new data refresh the text', async () => {
    const el = await mk();
    el.expand('quan');
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 4 dòng');
    expect(el.moveRow('jeans', null, 3)).to.equal(true);
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-4 / 4 nhóm · 4 dòng');
    el.data = [{ id: 'x', name: 'X', children: [{ id: 'y', name: 'Y' }] }];
    el.expand('x');
    await frames(2);
    expect(text(el)).to.equal('Hiển thị 1-1 / 1 nhóm · 2 dòng');
  });

  it('labels are site-overridable: TdTable.labels.treeItemLabel / treePageInfo ({info}, {rows})', async () => {
    const saved = { ...TdTable.labels };
    try {
      TdTable.labels.treeItemLabel = 'danh mục';
      TdTable.labels.treePageInfo = '{info} ({rows} hàng)';
      const el = await mk();
      expect(text(el)).to.equal('Hiển thị 1-3 / 3 danh mục (3 hàng)');
    } finally {
      Object.assign(TdTable.labels, saved);
    }
  });

  it('`tree` without rowKey (roots only, plain table) keeps the flat text', async () => {
    const el = await mk('tree parent-key="parentId"', { data: [{ id: 1, name: 'A' }, { id: 2, name: 'B', parentId: 1 }] });
    expect(text(el)).to.equal('Hiển thị 1-1 / 1 mục');
  });
});

describe('v0.57.2 flat table — unchanged', () => {
  it('default text as before; no tree words', async () => {
    const el = await mk('row-key="id" per-page="3"', { data: FLAT() });
    expect(text(el)).to.equal('Hiển thị 1-3 / 4 mục');
    el.setPage(2);
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 4-4 / 4 mục');
    expect(el.querySelector('td-pagination').formatInfo).to.equal(null);
  });
});

describe('v0.57.2 td-table formatPageInfo', () => {
  it('ctx = { from, to, total, item, rows, totalRows, tree, page, perPage, text } — client tree', async () => {
    const seen = [];
    const el = await mk('tree row-key="id" per-page="2"', {
      setup: (t) => { t.formatPageInfo = (c) => { seen.push(c); return `${c.total} nhóm · ${c.rows} dòng`; }; },
    });
    expect(text(el)).to.equal('3 nhóm · 2 dòng');
    const c = seen[seen.length - 1];
    expect({ ...c }).to.deep.equal({ from: 1, to: 2, total: 3, item: 'nhóm', rows: 2, totalRows: 7, tree: true, page: 1,
      perPage: 2, text: 'Hiển thị 1-2 / 3 nhóm · 2 dòng' });
    el.expand('ao');
    await frames(1);
    expect(text(el)).to.equal('3 nhóm · 4 dòng');
    el.formatPageInfo = null;
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-2 / 3 nhóm · 4 dòng');
  });

  it('works on a flat table (generic): tree false, totalRows = data length', async () => {
    let last = null;
    const el = await mk('row-key="id" per-page="3"', { data: FLAT() });
    el.formatPageInfo = (c) => { last = c; return `Trang ${c.page}: ${c.rows}/${c.totalRows}`; };
    await frames(1);
    expect(text(el)).to.equal('Trang 1: 3/4');
    expect({ ...last }).to.deep.equal({ from: 1, to: 3, total: 4, item: 'mục', rows: 3, totalRows: 4, tree: false, page: 1,
      perPage: 3, text: 'Hiển thị 1-3 / 4 mục' });
  });

  it('the result is text, never HTML', async () => {
    const el = await mk();
    el.formatPageInfo = () => '<img src=x onerror="window.__pwned=1">';
    await frames(1);
    expect(text(el)).to.equal('<img src=x onerror="window.__pwned=1">');
    expect(el.querySelector('.td-pagination__info img')).to.equal(null);
  });

  for (const [what, hook] of [['throws', () => { throw new Error('boom'); }], ['returns a non-string', () => 42]]) {
    it(`a hook that ${what} → the default text + exactly one warning`, async () => {
      const el = await mk('tree row-key="id"', { setup: (t) => { t.formatPageInfo = hook; } });
      expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 3 dòng');
      el.expand('ao');
      el.setPage(1);
      await frames(1);
      expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 5 dòng');
      expect(warns.filter((w) => w.includes('formatPageInfo'))).to.have.length(1);
      expect(warns.filter((w) => w.includes('formatInfo') && !w.includes('formatPageInfo'))).to.have.length(0);
    });
  }
});

describe('v0.57.2 formatPageInfo evaluated once per sync (Codex impl r1)', () => {
  it('a stateful formatter (counter): both bars show the identical text after each sync', async () => {
    let n = 0;
    const el = await mk('tree row-key="id"', { setup: (t) => { t.formatPageInfo = (c) => `#${++n} · ${c.rows} dòng`; } });
    const t0 = text(el); // asserts top === bottom
    expect(t0.endsWith('· 3 dòng')).to.equal(true);
    el.expand('ao');
    await frames(1);
    expect(text(el).endsWith('· 5 dòng')).to.equal(true);
    el.expand('thun');
    await frames(1);
    expect(text(el).endsWith('· 6 dòng')).to.equal(true);
    el.formatPageInfo = (c) => `@${++n} · ${c.rows}`;
    await frames(1);
    expect(text(el).startsWith('@')).to.equal(true);
    el.data = CATS();
    await frames(2);
    text(el);
  });

  it('a formatter throwing a different error on each call → exactly one warning per table', async () => {
    let n = 0;
    const el = await mk('tree row-key="id"', { setup: (t) => { t.formatPageInfo = () => { throw new Error(`lỗi ${++n}`); }; } });
    el.expand('ao');
    await frames(1);
    el.collapse('ao');
    await frames(1);
    el.formatPageInfo = () => { throw new Error(`khác ${++n}`); };
    await frames(1);
    expect(n).to.be.at.least(3);
    expect(text(el)).to.equal('Hiển thị 1-3 / 3 nhóm · 3 dòng');
    expect(warns.filter((w) => w.includes('formatPageInfo'))).to.have.length(1);
  });
});

describe('v0.57.2 server mode', () => {
  const page = () => [{ id: 'R1', name: 'R1', children: [{ id: 'c1', name: 'c1' }, { id: 'c2', name: 'c2' }] }, { id: 'R2', name: 'R2' }];

  it('default: total-items = roots; rows of the page; total-rows → ctx.totalRows (null without it); changes refresh', async () => {
    let last = null;
    const el = await mk('tree row-key="id" server-mode per-page="2" total-items="5"', { data: page() });
    expect(text(el)).to.equal('Hiển thị 1-2 / 5 nhóm · 2 dòng');
    el.expand('R1');
    await frames(1);
    expect(text(el)).to.equal('Hiển thị 1-2 / 5 nhóm · 4 dòng');
    el.formatPageInfo = (c) => { last = c; return `${c.total} nhóm · ${c.totalRows ?? '?'} dòng`; };
    await frames(1);
    expect(text(el)).to.equal('5 nhóm · ? dòng');
    expect(last.totalRows).to.equal(null);
    el.setAttribute('total-rows', '12');
    await frames(1);
    expect(text(el)).to.equal('5 nhóm · 12 dòng');
    expect(last.totalRows).to.equal(12);
    expect(el.totalRows).to.equal('12');
    el.setAttribute('total-rows', 'abc');
    await frames(1);
    expect(last.totalRows).to.equal(null);
  });
});

describe('v0.57.2 td-pagination formatInfo', () => {
  async function pag(attrs = 'total-items="23" items-per-page="10" current-page="2"') {
    root.innerHTML = `<td-pagination ${attrs}></td-pagination>`;
    const p = root.querySelector('td-pagination');
    await frames(1);
    return p;
  }
  const ptext = (p) => p.querySelector('.td-pagination__info').textContent;

  it('ctx = { from, to, total, item, page, perPage, totalPages, text }; setting it refreshes the text only (controls kept)', async () => {
    const p = await pag();
    const btn = p.querySelector('.td-pagination__page[data-page="1"]');
    let last = null;
    p.formatInfo = (c) => { last = c; return `${c.from}–${c.to} trong ${c.total}`; };
    expect(ptext(p)).to.equal('11–20 trong 23');
    expect({ ...last }).to.deep.equal({ from: 11, to: 20, total: 23, item: 'mục', page: 2, perPage: 10, totalPages: 3,
      text: 'Hiển thị 11-20 / 23 mục' });
    expect(p.querySelector('.td-pagination__page[data-page="1"]') === btn, 'controls not rebuilt').to.equal(true);
    p.setAttribute('current-page', '3');
    await frames(1);
    expect(ptext(p)).to.equal('21–23 trong 23');
    p.formatInfo = null;
    expect(p.formatInfo).to.equal(null);
    expect(ptext(p)).to.equal('Hiển thị 21-23 / 23 mục');
    expect(warns).to.deep.equal([]);
  });

  it('a throw / a non-string → the default text + one warning per instance', async () => {
    const p = await pag();
    p.formatInfo = () => { throw new Error('x'); };
    expect(ptext(p)).to.equal('Hiển thị 11-20 / 23 mục');
    p.setAttribute('current-page', '1');
    await frames(1);
    p.formatInfo = () => null;
    expect(ptext(p)).to.equal('Hiển thị 1-10 / 23 mục');
    expect(warns.filter((w) => w.includes('td-pagination: formatInfo'))).to.have.length(1);
  });

  it('a non-function is ignored (null)', async () => {
    const p = await pag();
    p.formatInfo = 'x';
    expect(p.formatInfo).to.equal(null);
    expect(ptext(p)).to.equal('Hiển thị 11-20 / 23 mục');
    expect(TdPagination.labels.info).to.equal('Hiển thị {from}-{to} / {total} {item}');
  });
});
