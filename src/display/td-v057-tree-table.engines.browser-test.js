import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdTable } from './td-table.js';
import '../form/td-toggle.js';
import { SNAP_SETUP, FLAT_SNAPSHOT } from './td-v057-flat-snapshot.fixture.js';

// v0.57.0 (plan docs/internal/plans/v0.57.0-tree-table.md M1) — `td-table tree`: treegrid ARIA (QĐ 6), row focus +
// roving tabindex (QĐ 7), the toggle button (QĐ 8), per-row table features (QĐ 9–12, 16), lazy children + status rows +
// announcements (QĐ 13), tree column (QĐ 14), cards (QĐ 15), moveRow integration (QĐ 17 / 17b / 18), the live card
// menu (QĐ 12) and the unchanged flat table (QĐ G). Chromium, Firefox AND WebKit; keyboard through sendKeys, focus
// moves through real focus() / Tab. DOM nodes are compared as booleans (a failing chai assertion carrying nodes hangs
// the runner). Waits on real signals (rAF / promises) — the 400 ms loading delay is waited for in real time.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const micro = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';
const SHIFT_TAB = IS_WEBKIT ? 'Alt+Shift+Tab' : 'Shift+Tab';
const press = (key) => sendKeys({ press: key });
async function until(fn, max = 120) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await raf();
  }
  return !!fn();
}
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

const root = document.createElement('div');
document.body.appendChild(root);
const warns = [];
const origWarn = console.warn;
const origError = console.error;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  console.error = () => {};
});
afterEach(() => {
  console.warn = origWarn;
  console.error = origError;
  root.innerHTML = '';
  document.dir = '';
});

// Áo › (Áo thun › Cổ tròn), Áo khoác ; Quần › Jeans ; Phụ kiện
const CATS = () => [
  { id: 'ao', name: 'Áo', code: 'C1', children: [
    { id: 'thun', name: 'Áo thun', code: 'C2', children: [{ id: 'tron', name: 'Cổ tròn', code: 'C3' }] },
    { id: 'khoac', name: 'Áo khoác', code: 'C4' },
  ] },
  { id: 'quan', name: 'Quần', code: 'C5', children: [{ id: 'jeans', name: 'Jeans', code: 'C6' }] },
  { id: 'pk', name: 'Phụ kiện', code: 'C7' },
];
const COLS = [{ key: 'name', label: 'Tên', sortable: true }, { key: 'code', label: 'Mã', sortable: true }];

async function mk(attrs = 'tree row-key="id"', { columns = COLS, data = CATS(), width = 900, setup, before = '', after = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `${before}<td-table ${attrs}></td-table>${after}`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-table');
  if (setup) setup(el);
  el.columns = columns;
  el.data = data;
  await frames(2);
  return el;
}
const trs = (el) => [...el.querySelectorAll('.td-table__body > tr')];
const dataTrs = (el) => trs(el).filter((tr) => tr.hasAttribute('data-row-idx'));
/** Text of the first column (the card label + the toggle / spacer excluded). */
const nameOf = (tr) => {
  const td = tr.querySelector('[data-col="0"]');
  if (!td) return undefined;
  let t = '';
  for (const n of td.childNodes) {
    if (n.nodeType === 1 && n.matches('.td-table__cell-label, .td-table__tree-toggle, .td-table__tree-spacer')) continue;
    t += n.textContent;
  }
  return t.replace(/\s+/g, ' ').trim();
};
const names = (el) => dataTrs(el).map(nameOf);
const row = (el, name) => dataTrs(el).find((tr) => nameOf(tr) === name);
const aria = (tr) => ['aria-level', 'aria-setsize', 'aria-posinset', 'aria-expanded'].map((a) => tr.getAttribute(a));
const toggleOf = (tr) => tr.querySelector('.td-table__tree-toggle');
const active = () => document.activeElement;
const record = (el, name) => {
  const ev = [];
  el.addEventListener(name, (e) => ev.push(e.detail));
  return ev;
};
const statusP = (el) => el.querySelector('.td-table > [role="status"]');
/** Every text written to the live region, in order (read from the mutation records, not the current text). */
function liveLog(el) {
  const log = [];
  const p = statusP(el);
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'characterData' && r.target.data) log.push(r.target.data);
      for (const n of r.addedNodes) if (n.nodeType === 3 && n.data) log.push(n.data);
    }
  });
  mo.observe(p, { childList: true, characterData: true, subtree: true });
  return log;
}
/** Focus the last tab stop BEFORE the body (top pagination / sort buttons, else #before) — Tab then enters the body. */
function focusBeforeBody(el) {
  const top = [...el.querySelectorAll('.td-table__header button, .td-table__header a[href], thead button')]
    .filter((b) => !b.disabled && b.tabIndex >= 0 && b.getClientRects().length);
  (top[top.length - 1] || document.getElementById('before')).focus();
}
/** Sequential tab stops inside the table body (tabIndex ≥ 0, not disabled). */
const bodyTabStops = (el) => [...el.querySelectorAll('.td-table__body, .td-table__body *')]
  .filter((n) => n.tabIndex >= 0 && !n.disabled && (n.matches('tr, button, input, a[href], [tabindex]')) && n.getClientRects().length);

describe('v0.57.0 td-table tree — ARIA (QĐ 6, QĐ 8)', () => {
  it('treegrid + gridcell; rows carry level / setsize / posinset; aria-expanded only on parents; the toggle is a named button', async () => {
    const el = await mk();
    const table = el.querySelector('table');
    expect(table.getAttribute('role')).to.equal('treegrid');
    expect(table.hasAttribute('aria-multiselectable')).to.equal(false);
    expect(el.querySelector('.td-table').classList.contains('td-table--tree')).to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Phụ kiện']);
    expect(dataTrs(el).map(aria)).to.deep.equal([['1', '3', '1', 'false'], ['1', '3', '2', 'false'], ['1', '3', '3', null]]);
    expect([...el.querySelectorAll('.td-table__body td')].every((td) => td.getAttribute('role') === 'gridcell')).to.equal(true);
    expect([...el.querySelectorAll('thead th')].every((th) => th.getAttribute('role') === 'columnheader')).to.equal(true);
    const t = toggleOf(row(el, 'Áo'));
    expect(t.tagName).to.equal('BUTTON');
    expect(t.getAttribute('type')).to.equal('button');
    expect(t.getAttribute('tabindex')).to.equal('-1');
    expect(t.getAttribute('aria-label')).to.equal('Mở Áo');
    expect(t.hasAttribute('aria-expanded')).to.equal(false);
    expect(!!row(el, 'Phụ kiện').querySelector('.td-table__tree-spacer')).to.equal(true);
    expect(!!toggleOf(row(el, 'Phụ kiện'))).to.equal(false);
    el.expand('ao');
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Áo khoác', 'Quần', 'Phụ kiện']);
    expect(aria(row(el, 'Áo'))).to.deep.equal(['1', '3', '1', 'true']);
    expect(aria(row(el, 'Áo thun'))).to.deep.equal(['2', '2', '1', 'false']);
    expect(aria(row(el, 'Áo khoác'))).to.deep.equal(['2', '2', '2', null]);
    expect(toggleOf(row(el, 'Áo')).getAttribute('aria-label')).to.equal('Thu gọn Áo');
    expect(row(el, 'Áo thun').style.getPropertyValue('--td-table-tree-level').trim()).to.equal('1');
    expect(row(el, 'Áo').style.getPropertyValue('--td-table-tree-level').trim()).to.equal('0');
    // indentation from the token: the tree cell of a level-2 row starts further in than its parent's
    const pad = (name) => parseFloat(getComputedStyle(row(el, name).querySelector('.td-table__cell--tree')).paddingInlineStart);
    expect(pad('Áo thun') - pad('Áo')).to.be.closeTo(20, 0.5);
  });

  it('page 2: posinset is global, setsize = all roots', async () => {
    const data = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ id: n, name: n, children: [{ id: `${n}1`, name: `${n}1` }] }));
    const el = await mk('tree row-key="id" per-page="2"', { data });
    el.setPage(2);
    await frames(1);
    expect(names(el)).to.deep.equal(['C', 'D']);
    expect(dataTrs(el).map(aria)).to.deep.equal([['1', '5', '3', 'false'], ['1', '5', '4', 'false']]);
    el.expand('C');
    await frames(1);
    expect(aria(row(el, 'C1'))).to.deep.equal(['2', '1', '1', null]);
    expect(el.getState().totalItems).to.equal(5);
  });

  it('without `tree` the table is byte-identical to v0.54 (snapshot) — no treegrid, level, row tabindex', async () => {
    const html = await SNAP_SETUP();
    expect(html === FLAT_SNAPSHOT, 'flat markup unchanged').to.equal(true);
    const el = await mk('row-key="id"');
    expect(el.querySelector('table').getAttribute('role')).to.equal('table');
    expect(trs(el).some((tr) => tr.hasAttribute('aria-level') || tr.hasAttribute('tabindex'))).to.equal(false);
    expect(!!el.querySelector('.td-table__tree-toggle, .td-table--tree')).to.equal(false);
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Phụ kiện']);
  });

  it('`tree` without rowKey: one warning, roots only as a plain table', async () => {
    const el = await mk('tree');
    expect(warns.some((w) => /tree.*rowKey|rowKey.*tree/.test(w))).to.equal(true);
    expect(el.querySelector('table').getAttribute('role')).to.equal('table');
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Phụ kiện']);
    expect(!!el.querySelector('.td-table__tree-toggle')).to.equal(false);
    const flat = await mk('tree parent-key="parentId"', { data: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parentId: 'a' }] });
    expect(names(flat)).to.deep.equal(['A']);
  });

  it('nested and parent-key data render the same tree', async () => {
    const flat = [
      { id: 'ao', name: 'Áo', parentId: null }, { id: 'thun', name: 'Áo thun', parentId: 'ao' },
      { id: 'quan', name: 'Quần' }, { id: 'tron', name: 'Cổ tròn', parentId: 'thun' },
      { id: 'khoac', name: 'Áo khoác', parentId: 'ao' }, { id: 'jeans', name: 'Jeans', parentId: 'quan' }, { id: 'pk', name: 'Phụ kiện' },
    ];
    const a = await mk('tree row-key="id"');
    const b = await mk('tree row-key="id" parent-key="parentId"', { data: flat });
    a.expandAll();
    b.expandAll();
    await frames(1);
    expect(names(b)).to.deep.equal(names(a));
    expect(dataTrs(b).map(aria)).to.deep.equal(dataTrs(a).map(aria));
    expect(JSON.stringify(b.getTree().map((t) => t.key))).to.equal('["ao","quan","pk"]');
  });
});

describe('v0.57.0 td-table tree — keyboard + roving focus (QĐ 7)', () => {
  it('one tab stop: Tab enters on the first row; ↓ ↑ Home End move the row focus (no wrap)', async () => {
    const el = await mk('tree row-key="id"', { before: '<input id="before" aria-label="trước">' });
    expect(dataTrs(el).map((tr) => tr.getAttribute('tabindex'))).to.deep.equal(['0', '-1', '-1']);
    focusBeforeBody(el);
    await press(TAB);
    expect(active() === row(el, 'Áo')).to.equal(true);
    await press('ArrowDown');
    expect(active() === row(el, 'Quần')).to.equal(true);
    expect(dataTrs(el).map((tr) => tr.getAttribute('tabindex'))).to.deep.equal(['-1', '0', '-1']);
    await press('End');
    expect(active() === row(el, 'Phụ kiện')).to.equal(true);
    await press('ArrowDown');
    expect(active() === row(el, 'Phụ kiện'), 'no wrap').to.equal(true);
    await press('Home');
    expect(active() === row(el, 'Áo')).to.equal(true);
    await press('ArrowUp');
    expect(active() === row(el, 'Áo')).to.equal(true);
  });

  it('→ opens a closed parent, → again goes to the first child; ← on a child → parent; ← on an open parent closes', async () => {
    const el = await mk();
    const ev = record(el, 'expanded-change');
    const ao = row(el, 'Áo');
    ao.focus();
    await press('ArrowRight');
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Áo khoác', 'Quần', 'Phụ kiện']);
    expect(active() === ao, 'focus stays on the parent').to.equal(true);
    expect(ev.length).to.equal(1);
    expect(ev[0].key).to.equal('ao');
    expect(ev[0].expanded).to.equal(true);
    expect(ev[0].row.name).to.equal('Áo');
    await press('ArrowRight');
    expect(active() === row(el, 'Áo thun')).to.equal(true);
    await press('ArrowDown');
    expect(active() === row(el, 'Áo khoác')).to.equal(true);
    await press('ArrowRight');
    expect(active() === row(el, 'Áo khoác'), '→ on a leaf: nothing').to.equal(true);
    await press('ArrowLeft');
    expect(active() === ao, '← on a child → its parent').to.equal(true);
    await press('ArrowLeft');
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Phụ kiện']);
    expect(ev.map((e) => e.expanded)).to.deep.equal([true, false]);
    expect(active() === ao).to.equal(true);
  });

  it('RTL swaps ← and →', async () => {
    const el = await mk();
    el.dir = 'rtl';
    row(el, 'Áo').focus();
    await press('ArrowLeft');
    expect(row(el, 'Áo').getAttribute('aria-expanded')).to.equal('true');
    await press('ArrowRight');
    expect(row(el, 'Áo').getAttribute('aria-expanded')).to.equal('false');
  });

  it('* opens every loaded sibling (one expanded-change each); Enter does nothing', async () => {
    const el = await mk();
    const ev = record(el, 'expanded-change');
    row(el, 'Phụ kiện').focus();
    await press('Enter');
    expect(ev.length).to.equal(0);
    await press('*');
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Áo khoác', 'Quần', 'Jeans', 'Phụ kiện']);
    expect(ev.map((e) => e.key)).to.deep.equal(['ao', 'quan']);
    expect(active() === row(el, 'Phụ kiện')).to.equal(true);
  });

  it('Space toggles the row selection, Shift+Space selects a range across levels (visible order)', async () => {
    const el = await mk('tree row-key="id" selectable');
    el.expand('ao');
    await frames(1);
    const ev = record(el, 'select-change');
    row(el, 'Áo thun').focus();
    await press('Space');
    expect(el.selectedKeys).to.deep.equal(['thun']);
    expect(active() === row(el, 'Áo thun'), 'focus stays on the row').to.equal(true);
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Shift+Space');
    expect(el.selectedKeys).to.deep.equal(['thun', 'khoac', 'quan']);
    expect(ev.map((e) => e.trigger)).to.deep.equal(['toggle', 'range']);
  });

  it('Tab from the active row walks ITS controls then leaves the table; Shift+Tab back; other rows\' controls are -1', async () => {
    const cols = [...COLS, { key: 'tools', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa' }, { id: 'del', label: 'Xoá' }] }];
    const el = await mk('tree row-key="id" selectable', { columns: cols, after: '<input id="after" aria-label="sau">' });
    const ao = row(el, 'Áo');
    const quan = row(el, 'Quần');
    expect([...quan.querySelectorAll('button')].every((b) => b.getAttribute('tabindex') === '-1')).to.equal(true);
    ao.focus();
    await press(TAB);
    expect(active() === ao.querySelector('.td-table__select')).to.equal(true);
    await press(TAB);
    expect(active().textContent.trim()).to.equal('Sửa');
    await press(TAB);
    expect(active().textContent.trim()).to.equal('Xoá');
    await press(TAB);
    expect(!!active().closest('.td-table__footer'), 'out of the body, on to the bottom pagination').to.equal(true);
    await press(SHIFT_TAB);
    expect(active().textContent.trim()).to.equal('Xoá');
    expect(active().closest('tr') === ao).to.equal(true);
    // one tab stop for the body + the active row's controls
    expect(bodyTabStops(el).length).to.equal(1 + 3);
    // the row focus moves → the controls follow (their own tabindex comes back)
    ao.focus();
    await press('ArrowDown');
    expect([...quan.querySelectorAll('button:not(.td-table__tree-toggle)')].every((b) => !b.hasAttribute('tabindex'))).to.equal(true);
    expect([...ao.querySelectorAll('button')].every((b) => b.getAttribute('tabindex') === '-1')).to.equal(true);
  });

  it('a control of another row taking focus (pointer / script) makes that row the active one', async () => {
    const cols = [...COLS, { key: 'tools', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa' }] }];
    const el = await mk('tree row-key="id"', { columns: cols });
    const btn = row(el, 'Phụ kiện').querySelector('.td-table__action');
    btn.focus();
    await micro();
    expect(row(el, 'Phụ kiện').getAttribute('tabindex')).to.equal('0');
    expect(row(el, 'Áo').getAttribute('tabindex')).to.equal('-1');
    expect(btn.hasAttribute('tabindex')).to.equal(false);
  });

  it('arrows typed inside a control of a row are not captured', async () => {
    const cols = [...COLS, { key: 'q', label: 'SL', render: () => { const i = document.createElement('input'); i.className = 'qty'; i.value = 'abc'; i.setAttribute('aria-label', 'SL'); return i; } }];
    const el = await mk('tree row-key="id"', { columns: cols });
    const input = row(el, 'Áo').querySelector('.qty');
    input.focus();
    input.setSelectionRange(3, 3);
    await press('ArrowLeft');
    expect(input.selectionStart).to.equal(2);
    await press('ArrowDown');
    expect(active() === input).to.equal(true);
    expect(row(el, 'Áo').getAttribute('aria-expanded')).to.equal('false');
  });

  it('open / close is incremental: the other row nodes are kept, focus stays; closing with focus in a grandchild → the parent', async () => {
    const el = await mk();
    const before = dataTrs(el);
    row(el, 'Áo').focus();
    await press('ArrowRight');
    const after = dataTrs(el);
    expect(after[0] === before[0] && after[3] === before[1] && after[4] === before[2]).to.equal(true);
    el.expand('thun');
    await frames(1);
    row(el, 'Cổ tròn').focus();
    toggleOf(row(el, 'Áo')).click();
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Phụ kiện']);
    expect(active() === row(el, 'Áo')).to.equal(true);
    expect(row(el, 'Áo').getAttribute('tabindex')).to.equal('0');
  });

  it('a full re-render (sort) with the focus in the body → the row with the same key keeps it', async () => {
    const el = await mk();
    row(el, 'Quần').focus();
    el.querySelector('.td-table__sort[data-sort-col="1"]').click();
    el.querySelector('.td-table__sort[data-sort-col="1"]').click(); // desc
    await frames(1);
    expect(names(el)).to.deep.equal(['Phụ kiện', 'Quần', 'Áo']);
    row(el, 'Quần').focus();
    el.setState({ sort: { key: 'code', direction: 'asc' } });
    await frames(1);
    expect(active() === row(el, 'Quần')).to.equal(true);
    expect(row(el, 'Quần').getAttribute('tabindex')).to.equal('0');
  });

  it('expanded-change only for the user: the API (expand / collapse / toggleExpanded / expandAll / expandedKeys) is silent', async () => {
    const el = await mk();
    const ev = record(el, 'expanded-change');
    el.expand('ao');
    el.toggleExpanded('quan');
    el.collapse('ao');
    el.expandAll();
    el.collapseAll();
    el.expandedKeys = ['ao'];
    await frames(1);
    expect(ev.length).to.equal(0);
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Áo khoác', 'Quần', 'Phụ kiện']);
    toggleOf(row(el, 'Quần')).click();
    expect(ev).to.have.length(1);
    expect(ev[0].key).to.equal('quan');
  });
});

describe('v0.57.0 td-table tree — table features on every row (QĐ 4, 9–12, 14, 16)', () => {
  it('expandedKeys live across sort / page / data / loading; getState / setState / update', async () => {
    const el = await mk();
    el.expandedKeys = ['ao', 'gone'];
    await frames(1);
    expect(el.expandedKeys).to.deep.equal(['ao', 'gone']);
    expect(el.getState().expandedKeys).to.deep.equal(['ao', 'gone']);
    el.querySelector('.td-table__sort[data-sort-col="0"]').click();
    el.setLoading(true);
    el.setLoading(false);
    el.data = CATS();
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Áo khoác', 'Áo thun', 'Phụ kiện', 'Quần']);
    expect(el.setState({ expandedKeys: ['quan'] })).to.equal(true);
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Phụ kiện', 'Quần', 'Jeans']);
    el.update({ expandedKeys: [] });
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Phụ kiện', 'Quần']);
  });

  it('render(row, rowIndex, ctx) — ctx = { level, parentKey, hasChildren, expanded }', async () => {
    const seen = [];
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'x', label: 'X', render: (r, ri, ctx) => { seen.push([r.id, ri, { ...ctx }]); return ''; } }];
    const el = await mk('tree row-key="id"', { columns: cols });
    el.expand('ao');
    await frames(1);
    expect(seen).to.deep.equal([
      ['ao', 0, { level: 1, parentKey: null, hasChildren: true, expanded: false }],
      ['quan', 1, { level: 1, parentKey: null, hasChildren: true, expanded: false }],
      ['pk', 2, { level: 1, parentKey: null, hasChildren: false, expanded: false }],
      ['thun', 1, { level: 2, parentKey: 'ao', hasChildren: true, expanded: false }],
      ['khoac', 2, { level: 2, parentKey: 'ao', hasChildren: false, expanded: false }],
    ]);
  });

  it('dsuite: actions + a td-toggle (render) on level 2 — Tab reaches the toggle, clicking it never opens / closes the row; a re-rendered toggle stays roving', async () => {
    const cols = [
      { key: 'name', label: 'Tên' },
      { key: 'on', label: 'Trạng thái', render: (r) => { const t = document.createElement('td-toggle'); t.setAttribute('label', `Bật ${r.name}`); return t; } },
      { key: 'tools', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa' }, { id: 'del', label: 'Xoá', variant: 'danger' }] },
    ];
    const el = await mk('tree row-key="id"', { columns: cols });
    el.expand('ao');
    await frames(2);
    const thun = row(el, 'Áo thun');
    thun.focus();
    await press(TAB);
    const input = thun.querySelector('td-toggle input');
    expect(active() === input).to.equal(true);
    input.click();
    await frames(1);
    expect(thun.isConnected && thun.getAttribute('aria-expanded') === 'false').to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Áo khoác', 'Quần', 'Phụ kiện']);
    // a td-toggle of an inactive row re-renders (checked attribute) → its new input is taken out of the tab order
    const other = row(el, 'Quần').querySelector('td-toggle');
    other.toggleAttribute('checked');
    await micro();
    expect(other.querySelector('input').getAttribute('tabindex')).to.equal('-1');
    expect(bodyTabStops(el).filter((n) => n.closest('tr') !== thun).length, 'other rows: no tab stop but the active row').to.equal(0);
  });

  it('selection: header = visible rows; closing keeps a child selected; selectedRows has the child row', async () => {
    const el = await mk('tree row-key="id" selectable');
    el.expand('ao');
    await frames(1);
    el.querySelector('.td-table__select-all').click();
    expect(el.selectedKeys).to.deep.equal(['ao', 'thun', 'khoac', 'quan', 'pk']);
    el.collapse('ao');
    await frames(1);
    expect(el.querySelector('.td-table__select-all').getAttribute('aria-checked')).to.equal('true');
    expect(el.selectedRows.map((r) => r.id)).to.deep.equal(['ao', 'thun', 'khoac', 'quan', 'pk']);
    el.clearSelection();
    el.expand('quan');
    await frames(1);
    row(el, 'Jeans').querySelector('.td-table__select').click();
    expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['Jeans']);
    expect(el.querySelector('.td-table__select-all').getAttribute('aria-checked')).to.equal('mixed');
  });

  for (const server of [false, true]) {
    it(`key lookup goes to the owning node (Codex r1 #4) — ${server ? 'server' : 'client'} mode`, async () => {
      const data = [{ id: 'A', name: 'A', children: [{ id: 'A1', name: 'A1' }] }, { id: 'B', name: 'B' }, { id: 'C', name: 'C', children: [{ id: 'A1', name: 'A1 trùng' }] }];
      const el = await mk(`tree row-key="id" selectable${server ? ' server-mode total-items="3"' : ''}`, { data });
      const ev = record(el, 'select-change');
      el.expandAll();
      await frames(1);
      row(el, 'A1').querySelector('.td-table__select').click();
      expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['A1']);
      expect(ev[0].keys).to.deep.equal(['A1']);
      expect(statusP(el).textContent || 'pending').to.not.include('B');
      expect(row(el, 'A1 trùng').querySelector('.td-table__select').disabled).to.equal(true);
      row(el, 'B').querySelector('.td-table__select').click();
      expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['A1', 'B']);
      el.selectedKeys = ['B'];
      expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['B']);
    });
  }

  it('sort within each sibling group (client); server mode does not sort on the client', async () => {
    const el = await mk();
    el.expandAll();
    el.querySelector('.td-table__sort[data-sort-col="0"]').click();
    el.querySelector('.td-table__sort[data-sort-col="0"]').click(); // desc
    await frames(1);
    expect(names(el)).to.deep.equal(['Quần', 'Jeans', 'Phụ kiện', 'Áo', 'Áo thun', 'Cổ tròn', 'Áo khoác']);
    expect(aria(row(el, 'Áo thun')).slice(0, 3)).to.deep.equal(['2', '2', '1']);
    const s = await mk('tree row-key="id" server-mode total-items="3"');
    s.expandAll();
    s.querySelector('.td-table__sort[data-sort-col="0"]').click();
    await frames(1);
    expect(names(s)).to.deep.equal(['Áo', 'Áo thun', 'Cổ tròn', 'Áo khoác', 'Quần', 'Jeans', 'Phụ kiện']);
  });

  it('paging by roots: an open branch never moves rows to another page; totals count roots', async () => {
    const data = ['A', 'B', 'C'].map((n) => ({ id: n, name: n, children: [1, 2, 3].map((i) => ({ id: `${n}${i}`, name: `${n}${i}` })) }));
    const el = await mk('tree row-key="id" per-page="2"', { data });
    const pag = el.querySelector('.td-table__footer td-pagination');
    expect(pag.getAttribute('total-items')).to.equal('3');
    el.expand('B');
    await frames(1);
    expect(names(el)).to.deep.equal(['A', 'B', 'B1', 'B2', 'B3']);
    expect(pag.getAttribute('total-items')).to.equal('3');
    el.setPage(2);
    await frames(1);
    expect(names(el)).to.deep.equal(['C']);
  });

  it('tree column: tree-column attribute; default = primary; never hideable (warning); actions cannot be it', async () => {
    const cols = [{ key: 'code', label: 'Mã', card: 'lead' }, { key: 'name', label: 'Tên', card: 'primary', hidden: true, hideable: true }];
    const el = await mk('tree row-key="id"', { columns: cols });
    const ao = dataTrs(el)[0];
    expect(ao.querySelector('.td-table__cell--tree').getAttribute('data-col')).to.equal('1');
    expect(ao.querySelector('[data-col="1"]').hidden).to.equal(false);
    expect(el.hiddenColumns).to.deep.equal([]);
    expect(warns.some((w) => /tree column/i.test(w))).to.equal(true);
    const b = await mk('tree row-key="id" tree-column="code"');
    expect(dataTrs(b)[0].querySelector('.td-table__cell--tree').getAttribute('data-col')).to.equal('1');
    const actionsCols = [{ key: 'tools', label: 'T', actions: [{ id: 'x', label: 'X' }] }, { key: 'name', label: 'Tên' }];
    warns.length = 0;
    const c = await mk('tree row-key="id" tree-column="tools"', { columns: actionsCols });
    expect(dataTrs(c)[0].querySelector('.td-table__cell--tree').getAttribute('data-col')).to.equal('1');
    expect(warns.some((w) => /actions/.test(w))).to.equal(true);
  });

  it('ellipsis on the tree column: the toggle + indent stay outside .td-table__truncate', async () => {
    const el = await mk('tree row-key="id"', { columns: [{ key: 'name', label: 'Tên', ellipsis: true }] });
    const cell = dataTrs(el)[0].querySelector('.td-table__cell--tree');
    expect(!!cell.querySelector(':scope > .td-table__tree-toggle')).to.equal(true);
    expect(!!cell.querySelector('.td-table__truncate .td-table__tree-toggle')).to.equal(false);
    expect(cell.querySelector('.td-table__truncate').textContent).to.equal('Áo');
  });

  it('controlled: setState({ expandedKeys }) applies with the answer', async () => {
    const el = await mk('tree row-key="id" server-mode controlled total-items="3"');
    el.addEventListener('request-change', (e) => {
      el.setState({ requestId: e.detail.requestId, data: CATS(), expandedKeys: ['quan'] });
    });
    el.querySelector('.td-table__sort[data-sort-col="0"]').click();
    await frames(1);
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Jeans', 'Phụ kiện']);
  });
});

describe('v0.57.0 td-table tree — lazy children (QĐ 13)', () => {
  const LAZY = () => [{ id: 'l', name: 'Lười', hasChildren: true }, { id: 'z', name: 'Cuối' }];

  it('fast load (< 400 ms): no status row, no "loading" announcement; children inserted; aria-busy while loading', async () => {
    const d = deferred();
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = () => d.promise; } });
    const log = liveLog(el);
    const l = row(el, 'Lười');
    l.focus();
    await press('ArrowRight');
    expect(l.getAttribute('aria-busy')).to.equal('true');
    expect(l.getAttribute('aria-expanded')).to.equal('true');
    d.resolve([{ id: 'c1', name: 'Con 1' }]);
    await until(() => names(el).includes('Con 1'));
    await sleep(450);
    expect(names(el)).to.deep.equal(['Lười', 'Con 1', 'Cuối']);
    expect(l.hasAttribute('aria-busy')).to.equal(false);
    expect(el.querySelector('.td-table__row--tree-status')).to.equal(null);
    expect(log.some((t) => /Đang tải/.test(t))).to.equal(false);
    expect(active() === l).to.equal(true);
  });

  it('slow load: status row after 400 ms (level n+1, roving row), announced; then children + "Đã tải n dòng con"', async () => {
    const d = deferred();
    let signal;
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = (r, o) => { signal = o.signal; return d.promise; }; } });
    const log = liveLog(el);
    toggleOf(row(el, 'Lười')).click();
    expect(signal instanceof AbortSignal).to.equal(true);
    await sleep(120);
    expect(el.querySelector('.td-table__row--tree-status')).to.equal(null);
    await until(() => el.querySelector('.td-table__row--tree-status'), 60);
    const st = el.querySelector('.td-table__row--tree-status');
    expect([st.getAttribute('role'), st.getAttribute('aria-level'), st.getAttribute('aria-setsize'), st.getAttribute('aria-posinset'), st.getAttribute('tabindex')])
      .to.deep.equal(['row', '2', '1', '1', '-1']);
    expect(st.hasAttribute('data-row-idx')).to.equal(false);
    expect(st.textContent).to.include('Đang tải');
    await until(() => log.length > 0);
    expect(log).to.deep.equal(['Đang tải các dòng con của Lười…']);
    d.resolve([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    await until(() => names(el).includes('B'));
    await micro();
    expect(names(el)).to.deep.equal(['Lười', 'A', 'B', 'Cuối']);
    expect(el.querySelector('.td-table__row--tree-status')).to.equal(null);
    expect(log[log.length - 1]).to.equal('Đã tải 2 dòng con của Lười');
  });

  it('error: status row with "Thử lại", load-error, announced at once, aria-expanded stays true; [] → leaf', async () => {
    let calls = 0;
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('mạng')) : []; }; } });
    const errs = record(el, 'load-error');
    const log = liveLog(el);
    toggleOf(row(el, 'Lười')).click();
    await until(() => el.querySelector('.td-table__tree-retry'));
    expect(errs).to.have.length(1);
    expect(errs[0].key).to.equal('l');
    expect(errs[0].error.message).to.equal('mạng');
    expect(row(el, 'Lười').getAttribute('aria-expanded')).to.equal('true');
    await until(() => log.length > 0);
    expect(log[0]).to.equal('Không tải được các dòng con của Lười');
    expect(el.querySelector('.td-table__row--tree-status').textContent).to.include('Không tải được các dòng con');
    el.querySelector('.td-table__tree-retry').click();
    await until(() => !el.querySelector('.td-table__row--tree-status'));
    expect(calls).to.equal(2);
    expect(row(el, 'Lười').hasAttribute('aria-expanded')).to.equal(false);
    expect(!!toggleOf(row(el, 'Lười'))).to.equal(false);
    expect(log).to.include('Đang tải lại…');
  });

  it('keyboard only to "Thử lại" (Codex r2 #7): ↓ to the error row, Tab → Retry, Shift+Tab back, Enter / Space retry → focus on the parent', async () => {
    for (const key of ['Enter', 'Space']) {
      let calls = 0;
      root.innerHTML = '';
      const el = await mk('tree row-key="id"', { data: LAZY(), before: '<input id="before" aria-label="trước">',
        setup: (t) => { t.loadChildren = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('x')) : new Promise(() => {}); }; } });
      const log = liveLog(el);
      focusBeforeBody(el);
      await press(TAB);
      expect(active() === row(el, 'Lười')).to.equal(true);
      await press('ArrowRight');
      await until(() => el.querySelector('.td-table__tree-retry'));
      await press('ArrowDown');
      const st = el.querySelector('.td-table__row--tree-status');
      expect(active() === st, `${key}: ↓ → the error row`).to.equal(true);
      expect(st.getAttribute('aria-level')).to.equal('2');
      await press(TAB);
      expect(active().classList.contains('td-table__tree-retry')).to.equal(true);
      expect(bodyTabStops(el).length, 'still one tab stop + the active row control').to.equal(2);
      await press(SHIFT_TAB);
      expect(active() === st).to.equal(true);
      await press('ArrowLeft');
      expect(active() === row(el, 'Lười'), '← on the status row → parent').to.equal(true);
      await press('ArrowRight');
      expect(active() === st, '→ on an open parent → its status row').to.equal(true);
      await press(TAB);
      await press(key);
      await until(() => calls === 2);
      expect(active() === row(el, 'Lười')).to.equal(true);
      expect(row(el, 'Lười').getAttribute('tabindex')).to.equal('0');
      expect(!!el.querySelector('.td-table__tree-retry')).to.equal(false);
      await until(() => log.includes('Đang tải lại…'));
    }
  });

  it('a loadChildren result that cannot be read (a throwing row getter) → error row + load-error + announcement, no stale aria-busy; Retry works (Codex r2 #3)', async () => {
    let calls = 0;
    const bad = () => [new Proxy({ id: 'x', name: 'X' }, { get(t, k) { if (k === 'children') throw new Error('getter'); return t[k]; } })];
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = () => { calls += 1; return calls === 1 ? bad() : [{ id: 'ok', name: 'Được' }]; }; } });
    const errs = record(el, 'load-error');
    const log = liveLog(el);
    toggleOf(row(el, 'Lười')).click();
    await until(() => el.querySelector('.td-table__tree-retry'));
    expect(errs).to.have.length(1);
    expect(errs[0].error.message).to.equal('getter');
    expect(row(el, 'Lười').hasAttribute('aria-busy')).to.equal(false);
    await until(() => log.length > 0);
    expect(log[0]).to.equal('Không tải được các dòng con của Lười');
    el.querySelector('.td-table__tree-retry').click();
    await until(() => names(el).includes('Được'));
    expect(names(el)).to.deep.equal(['Lười', 'Được', 'Cuối']);
    expect(el.querySelector('.td-table__row--tree-status')).to.equal(null);
    expect(row(el, 'Lười').hasAttribute('aria-busy')).to.equal(false);
  });

  it('new data while loading: the request is aborted, the late result dropped, the open branch reloads; its timer never announces', async () => {
    const first = deferred();
    const second = deferred();
    const sigs = [];
    let n = 0;
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = (r, o) => { sigs.push(o.signal); n += 1; return n === 1 ? first.promise : second.promise; }; } });
    const log = liveLog(el);
    el.expand('l');
    await micro();
    expect(sigs).to.have.length(1);
    el.data = LAZY();
    await frames(1);
    expect(sigs[0].aborted).to.equal(true);
    expect(sigs).to.have.length(2);
    second.resolve([{ id: 'n', name: 'Mới' }]);
    await until(() => names(el).includes('Mới'));
    first.resolve([{ id: 'old', name: 'Cũ' }]);
    await sleep(450);
    expect(names(el)).to.deep.equal(['Lười', 'Mới', 'Cuối']);
    expect(log.some((t) => /Đang tải/.test(t)), 'no stale loading announcement').to.equal(false);
  });

  it('closing while loading does not cancel: the result is kept, opening again does not reload', async () => {
    const d = deferred();
    let calls = 0;
    const el = await mk('tree row-key="id"', { data: LAZY(), setup: (t) => { t.loadChildren = () => { calls += 1; return d.promise; }; } });
    el.expand('l');
    await micro();
    el.collapse('l');
    d.resolve([{ id: 'k', name: 'K' }]);
    await micro();
    await micro();
    expect(names(el)).to.deep.equal(['Lười', 'Cuối']);
    el.expand('l');
    await frames(1);
    expect(names(el)).to.deep.equal(['Lười', 'K', 'Cuối']);
    expect(calls).to.equal(1);
  });
});

describe('v0.57.0 td-table tree — cards (QĐ 15) + the live card menu (QĐ 12)', () => {
  const DEEP = () => {
    let leaf = { id: 'L6', name: 'Cấp 6' };
    for (let i = 5; i >= 1; i--) leaf = { id: `L${i}`, name: `Cấp ${i}`, children: [leaf] };
    return [leaf];
  };

  it('cards: child cards indent by level, capped at 3 levels; the toggle sits on the primary line', async () => {
    const el = await mk('tree row-key="id" layout="cards"', { data: DEEP(), width: 360 });
    el.expandAll();
    await frames(2);
    const ml = dataTrs(el).map((tr) => Math.round(parseFloat(getComputedStyle(tr).marginInlineStart)));
    expect(ml).to.deep.equal([0, 12, 24, 36, 36, 36]);
    const t = toggleOf(dataTrs(el)[0]);
    const primary = dataTrs(el)[0].querySelector('[data-card="primary"]');
    expect(primary.contains(t)).to.equal(true);
    expect(el.querySelector('table').getAttribute('role')).to.equal('treegrid');
    expect(el.scrollWidth <= el.clientWidth + 1).to.equal(true);
  });

  it('card "Thao tác" menu reads the LIVE row: open a branch above, then open the menu → right row (hidden / disabled / row-action)', async () => {
    const called = [];
    const actions = [
      { id: 'a', label: 'Một', hidden: (r) => { called.push(r.name); return false; } },
      { id: 'b', label: 'Hai', disabled: (r) => r.id === 'nope' },
      { id: 'c', label: 'Ba' },
    ];
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'tools', label: 'T', actions }];
    const el = await mk('tree row-key="id" layout="cards"', { columns: cols, width: 360 });
    const ev = record(el, 'row-action');
    const pk = row(el, 'Phụ kiện');
    el.expand('ao');
    await frames(1);
    called.length = 0;
    pk.querySelector('.td-table__actions-menu').click();
    await until(() => document.querySelector('.td-menu [role="menuitem"]'));
    expect(called.every((n) => n === 'Phụ kiện') && called.length > 0).to.equal(true);
    const item = [...document.querySelectorAll('.td-menu [role="menuitem"]')].find((m) => m.textContent.includes('Ba'));
    item.click();
    await frames(1);
    expect(ev).to.have.length(1);
    expect(ev[0].row.name).to.equal('Phụ kiện');
    expect(ev[0].rowIndex).to.equal(4);
  });

  it('card menu open while a branch above closes: the item still acts on the right row', async () => {
    const actions = [{ id: 'a', label: 'Một' }, { id: 'b', label: 'Hai' }, { id: 'c', label: 'Ba' }];
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'tools', label: 'T', actions }];
    const el = await mk('tree row-key="id" layout="cards"', { columns: cols, width: 360 });
    el.expand('ao');
    await frames(1);
    const ev = record(el, 'row-action');
    row(el, 'Quần').querySelector('.td-table__actions-menu').click();
    await until(() => document.querySelector('.td-menu [role="menuitem"]'));
    el.collapse('ao');
    await frames(1);
    [...document.querySelectorAll('.td-menu [role="menuitem"]')].find((m) => m.textContent.includes('Hai')).click();
    await frames(1);
    expect(ev).to.have.length(1);
    expect(ev[0].row.name).to.equal('Quần');
    expect(ev[0].rowIndex).to.equal(1);
    // the row left the DOM while its menu was open → nothing
    el.expand('ao');
    await frames(1);
    row(el, 'Áo khoác').querySelector('.td-table__actions-menu').click();
    await until(() => document.querySelector('.td-menu [role="menuitem"]'));
    el.collapse('ao');
    await frames(1);
    const left = [...document.querySelectorAll('.td-menu [role="menuitem"]')].find((m) => m.textContent.includes('Một'));
    if (left) left.click();
    await frames(1);
    expect(ev).to.have.length(1);
  });
});

describe('v0.57.0 td-table tree — moveRow (QĐ 17 / 17b / 18)', () => {
  const SIB = () => [{ id: 'P', name: 'P', children: ['a', 'b', 'c', 'd'].map((k) => ({ id: k, name: k })) }, { id: 'Q', name: 'Q' }];

  it('index semantics: forward, backward; same place = no-op (no DOM mutation, no render, no canDrop)', async () => {
    let renders = 0;
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'r', label: 'R', render: () => { renders += 1; return 'x'; } }];
    let drops = 0;
    const el = await mk('tree row-key="id"', { columns: cols, data: SIB(), setup: (t) => { t.canDrop = () => { drops += 1; return true; }; } });
    el.expand('P');
    await frames(1);
    expect(el.moveRow('a', 'P', 2)).to.equal(true);
    expect(names(el)).to.deep.equal(['P', 'b', 'c', 'a', 'd', 'Q']);
    expect(el.moveRow('d', 'P', 1)).to.equal(true);
    expect(names(el)).to.deep.equal(['P', 'b', 'd', 'c', 'a', 'Q']);
    expect(dataTrs(el).slice(1, 5).map((tr) => tr.getAttribute('aria-posinset'))).to.deep.equal(['1', '2', '3', '4']);
    const old = row(el, 'd');
    const recs = [];
    const mo = new MutationObserver((r) => recs.push(...r));
    mo.observe(el, { subtree: true, childList: true, attributes: true });
    renders = 0;
    drops = 0;
    expect(el.moveRow('d', 'P', 1)).to.equal(true);
    await micro();
    mo.disconnect();
    expect(recs.length).to.equal(0);
    expect(row(el, 'd') === old).to.equal(true);
    expect([renders, drops]).to.deep.equal([0, 0]);
    for (const bad of [-1, 1.5, NaN, Infinity]) expect(el.moveRow('a', 'P', bad), String(bad)).to.equal(false);
    expect(el.moveRow('b', 'P', 99)).to.equal(true);
    expect(names(el)).to.deep.equal(['P', 'd', 'c', 'a', 'b', 'Q']);
  });

  it('re-parent: into an open parent (rows re-rendered at the new level), into a closed parent / a leaf, child → root; ARIA of both groups', async () => {
    let renders = [];
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'r', label: 'R', render: (r, ri, ctx) => { renders.push([r.id, ctx.level]); return ''; } }];
    const el = await mk('tree row-key="id"', { columns: cols });
    el.expandAll();
    await frames(1);
    renders = [];
    expect(el.moveRow('thun', 'quan', 1)).to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Áo khoác', 'Quần', 'Jeans', 'Áo thun', 'Cổ tròn', 'Phụ kiện']);
    expect(renders, 'only the moved row (its parentKey changed; its branch keeps level + parent)').to.deep.equal([['thun', 2]]);
    expect(aria(row(el, 'Áo khoác'))).to.deep.equal(['2', '1', '1', null]);
    expect(aria(row(el, 'Jeans'))).to.deep.equal(['2', '2', '1', null]);
    expect(aria(row(el, 'Áo thun'))).to.deep.equal(['2', '2', '2', 'true']);
    // into a leaf: it becomes a parent (closed); the old parent loses aria-expanded when empty
    expect(el.moveRow('khoac', 'pk', 0)).to.equal(true);
    expect(aria(row(el, 'Áo'))).to.deep.equal(['1', '3', '1', null]);
    expect(aria(row(el, 'Phụ kiện'))).to.deep.equal(['1', '3', '3', 'false']);
    expect(!!toggleOf(row(el, 'Phụ kiện'))).to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Quần', 'Jeans', 'Áo thun', 'Cổ tròn', 'Phụ kiện']);
    // child → root (client mode: the page is re-cut)
    expect(el.moveRow('jeans', null, 0)).to.equal(true);
    expect(names(el)[0]).to.equal('Jeans');
    expect(aria(row(el, 'Jeans'))).to.deep.equal(['1', '4', '1', null]);
    expect(el.querySelector('.td-table__footer td-pagination').getAttribute('total-items')).to.equal('4');
    expect(JSON.stringify(el.getTree().map((t) => t.key))).to.equal('["jeans","ao","quan","pk"]');
  });

  it('refused (canDrop false / throws, max-depth, into itself / its branch, unknown key / parent): false, DOM + model + ARIA unchanged, app data untouched', async () => {
    const data = CATS();
    const freeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(freeze); } return o; };
    freeze(data);
    const before = JSON.stringify(data);
    let mode = 'ok';
    const el = await mk('tree row-key="id" max-depth="3"', { data, setup: (t) => { t.canDrop = () => { if (mode === 'throw') throw new Error('x'); return mode !== 'no'; }; } });
    el.expandAll();
    await frames(1);
    const snap = () => dataTrs(el).map((tr) => `${nameOf(tr)}:${aria(tr).join(',')}`).join('|');
    const s0 = snap();
    const t0 = JSON.stringify(el.getTree().map((t) => t.key));
    mode = 'no';
    expect(el.moveRow('pk', 'ao', 0)).to.equal(false);
    mode = 'throw';
    expect(el.moveRow('pk', 'ao', 0)).to.equal(false);
    mode = 'ok';
    expect(el.moveRow('quan', 'thun', 0), 'max-depth: jeans would be level 4').to.equal(false);
    expect(el.moveRow('ao', 'tron', 0)).to.equal(false);
    expect(el.moveRow('ao', 'ao', 0)).to.equal(false);
    expect(el.moveRow('nope', 'ao', 0)).to.equal(false);
    expect(el.moveRow('pk', 'nope', 0)).to.equal(false);
    expect(snap()).to.equal(s0);
    expect(JSON.stringify(el.getTree().map((t) => t.key))).to.equal(t0);
    expect(el.moveRow('pk', 'ao', 0)).to.equal(true);
    expect(JSON.stringify(data)).to.equal(before);
    expect(el.data === data).to.equal(true);
  });

  it('focus: the focused row moving into a CLOSED branch → the new parent gets the focus (roving); a visible move keeps it on the row', async () => {
    const el = await mk();
    el.expand('ao');
    await frames(1);
    row(el, 'Áo khoác').focus();
    expect(el.moveRow('khoac', 'quan', 0)).to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Quần', 'Phụ kiện']);
    expect(active() === row(el, 'Quần')).to.equal(true);
    expect(row(el, 'Quần').getAttribute('tabindex')).to.equal('0');
    el.expand('quan');
    await frames(1);
    row(el, 'Jeans').focus();
    expect(el.moveRow('jeans', 'quan', 0)).to.equal(true);
    expect(names(el)).to.deep.equal(['Áo', 'Áo thun', 'Quần', 'Jeans', 'Áo khoác', 'Phụ kiện']);
    expect(active() === row(el, 'Jeans')).to.equal(true);
    // focus outside the moved block is left alone
    row(el, 'Áo thun').focus();
    el.moveRow('khoac', 'quan', 0);
    expect(active() === row(el, 'Áo thun')).to.equal(true);
  });

  it('selection kept + header recomputed; row-action after a move hits the right row', async () => {
    const cols = [{ key: 'name', label: 'Tên' }, { key: 'tools', label: 'T', actions: [{ id: 'del', label: 'Xoá' }] }];
    const el = await mk('tree row-key="id" selectable', { columns: cols });
    el.expand('ao');
    await frames(1);
    el.selectedKeys = ['khoac'];
    const sel = record(el, 'select-change');
    const ev = record(el, 'row-action');
    el.moveRow('khoac', null, 0);
    expect(sel).to.have.length(0);
    expect(row(el, 'Áo khoác').querySelector('.td-table__select').getAttribute('aria-checked')).to.equal('true');
    expect(el.querySelector('.td-table__select-all').getAttribute('aria-checked')).to.equal('mixed');
    row(el, 'Phụ kiện').querySelector('.td-table__action').click();
    expect(ev[0].row.name).to.equal('Phụ kiện');
    expect(ev[0].rowIndex).to.equal(dataTrs(el).indexOf(row(el, 'Phụ kiện')));
  });

  describe('server mode root count after moveRow (Codex r2 #8)', () => {
    const page2 = () => [{ id: 'R3', name: 'R3' }, { id: 'R4', name: 'R4', children: [{ id: 'C', name: 'C' }] }];
    const pages = (el) => el.querySelector('.td-table__footer td-pagination');

    it('(a) child → root: effective 5, 3 pages, page 2 shows 3 roots, setsize 5, no page / request events; (c) setState resets', async () => {
      const el = await mk('tree row-key="id" server-mode per-page="2" total-items="4"', { data: page2() });
      el.setPage(2);
      el.expand('R4');
      await frames(1);
      const evs = [...record(el, 'page-change'), ...record(el, 'request-change')];
      expect(el.moveRow('C', null, 2)).to.equal(true);
      expect(names(el)).to.deep.equal(['R3', 'R4', 'C']);
      expect(dataTrs(el).map((tr) => tr.getAttribute('aria-posinset'))).to.deep.equal(['3', '4', '5']);
      expect(dataTrs(el).map((tr) => tr.getAttribute('aria-setsize'))).to.deep.equal(['5', '5', '5']);
      const p = pages(el);
      expect(Math.ceil(Number(p.getAttribute('total-items')) / Number(p.getAttribute('items-per-page')))).to.equal(3);
      expect(p.getAttribute('current-page')).to.equal('2');
      expect(evs).to.have.length(0);
      el.setState({ data: [{ id: 'R3', name: 'R3' }, { id: 'R4', name: 'R4' }], totalItems: 5 });
      await frames(1);
      expect(pages(el).getAttribute('total-items')).to.equal('5');
      expect(dataTrs(el).map((tr) => tr.getAttribute('aria-setsize'))).to.deep.equal(['5', '5']);
    });

    it('(b) root → child: effective 4, 2 pages, setsize 4, level 2; (d) total-items attribute resets', async () => {
      const el = await mk('tree row-key="id" server-mode per-page="2" total-items="5"', { data: [{ id: 'R3', name: 'R3' }, { id: 'R4', name: 'R4' }] });
      el.setPage(2);
      await frames(1);
      expect(el.moveRow('R4', 'R3', 0)).to.equal(true);
      el.expand('R3');
      await frames(1);
      expect(row(el, 'R4').getAttribute('aria-level')).to.equal('2');
      expect(row(el, 'R3').getAttribute('aria-setsize')).to.equal('4');
      expect(pages(el).getAttribute('total-items')).to.equal('4');
      el.setAttribute('total-items', '7');
      await frames(1);
      expect(pages(el).getAttribute('total-items')).to.equal('7');
      expect(row(el, 'R3').getAttribute('aria-setsize')).to.equal('7');
    });

    it('(e) last page while the effective count drops below it: the current page stays, pages ≥ current', async () => {
      const el = await mk('tree row-key="id" server-mode per-page="2" total-items="3"', { data: [{ id: 'R3', name: 'R3', children: [] }] });
      el.setPage(2);
      await frames(1);
      expect(el.querySelector('.td-table__footer td-pagination').getAttribute('current-page')).to.equal('2');
      el.data = [{ id: 'R3', name: 'R3', children: [{ id: 'k', name: 'k' }] }, { id: 'R5', name: 'R5' }];
      await frames(1);
      el.moveRow('R5', 'R3', 0);
      el.moveRow('k', 'R5', 0);
      await frames(1);
      const p = pages(el);
      expect(p.getAttribute('current-page')).to.equal('2');
      expect(Math.ceil(Number(p.getAttribute('total-items')) / 2)).to.be.at.least(2);
      expect(row(el, 'R3').getAttribute('aria-setsize')).to.equal('2');
    });
  });
});

describe('v0.57.0 td-table tree — labels + misc', () => {
  it('labels are site-overridable (TdTable.labels)', async () => {
    const keep = { ...TdTable.labels };
    TdTable.labels.expandRow = 'Open {label}';
    try {
      const el = await mk();
      expect(toggleOf(row(el, 'Áo')).getAttribute('aria-label')).to.equal('Open Áo');
    } finally {
      Object.assign(TdTable.labels, keep);
    }
  });

  it('no drag-and-drop names in 0.57 (QĐ 19–22 reserved for v0.58)', async () => {
    const el = await mk('tree row-key="id"');
    expect(TdTable.observedAttributes.includes('reorderable')).to.equal(false);
    expect('rowDraggable' in el).to.equal(false);
    expect(Object.keys(TdTable.labels).some((k) => /^drag|^drop/.test(k))).to.equal(false);
    expect(!!el.querySelector('.td-table__drag, .td-table__cell--drag, .td-table__drop-line')).to.equal(false);
  });

  it('getTree after a move; `data` stays the array the app set', async () => {
    const data = CATS();
    const el = await mk('tree row-key="id"', { data });
    el.moveRow('pk', null, 0);
    expect(el.data === data).to.equal(true);
    expect(el.getTree().map((t) => t.key)).to.deep.equal(['pk', 'ao', 'quan']);
    expect(el.getTree()[1].children.map((t) => t.key)).to.deep.equal(['thun', 'khoac']);
  });
});
