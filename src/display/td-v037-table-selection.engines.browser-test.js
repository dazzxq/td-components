import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-table.js';

// v0.37.0 (plan docs/internal/plans/v0.37.0-table-row-selection.md QĐ 1–25) — td-table row selection by `rowKey`:
// role=table kept, one `button[role=checkbox]` per row (both modes; never role=radio), a tri-state "select all on this
// page" header, Shift range in page order, selection kept across pages / sort / data, events only for user changes,
// opt-in form participation (`name` → FormData). REAL input (sendMouse + sendKeys) in Chromium, Firefox AND WebKit
// (POINTER_FILES: own browser instances). Waits on real signals (events, rAF) — no sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const tick = () => new Promise((r) => queueMicrotask(r));
// WebKit (like Safari's default) does not Tab to buttons; Option(Alt)+Tab reaches every control there.
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';
/** Poll per frame (the mark fades its fill over --td-dur-fast). */
async function until(fn, max = 120) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await raf();
  }
  return !!fn();
}

const warns = [];
const errors = [];
const origWarn = console.warn;
const origError = console.error;
beforeEach(() => {
  warns.length = 0;
  errors.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  console.error = origError;
  await resetMouse();
  root.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

const PEOPLE = [
  { id: 1, name: 'An', role: 'Admin' },
  { id: 2, name: 'Bình', role: 'Editor' },
  { id: 3, name: 'Chi', role: 'Viewer' },
  { id: 4, name: 'Dũng', role: 'Editor' },
  { id: 5, name: 'Em', role: 'Viewer' },
  { id: 6, name: 'Giang', role: 'Admin' },
  { id: 7, name: 'Hà', role: 'Viewer' },
];
const COLS = [{ key: 'name', label: 'Tên', sortable: true }, { key: 'role', label: 'Vai trò' }];

async function mk(attrs = 'selectable row-key="id"', { columns = COLS, data = PEOPLE, width = 900, setup, parent = root } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  parent.appendChild(wrap);
  const el = wrap.querySelector('td-table');
  if (setup) setup(el);
  el.columns = columns;
  el.data = data;
  await frames(2);
  return el;
}
const rowsOf = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];
const ctl = (el, i) => rowsOf(el)[i].querySelector('.td-table__select');
const head = (el) => el.querySelector('.td-table__select-all');
const checked = (el) => rowsOf(el).map((tr) => tr.querySelector('.td-table__select').getAttribute('aria-checked'));
const record = (el, name) => {
  const ev = [];
  el.addEventListener(name, (e) => ev.push(e.detail));
  return ev;
};
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
async function click(n, key) {
  n.scrollIntoView({ block: 'nearest' });
  await raf();
  if (key) await sendKeys({ down: key });
  try {
    await sendMouse({ type: 'click', position: center(n) });
  } finally {
    if (key) await sendKeys({ up: key });
  }
  await raf();
}
const status = (el) => el.querySelector('.td-table > [role="status"]').textContent;
async function statusSettled() { await tick(); await tick(); await raf(); }

describe('v0.37.0 td-table selection — on / off + semantics (QĐ 1–8)', () => {
  it('no selectable → no column, not a single checkbox (unchanged)', async () => {
    const el = await mk('');
    expect(el.querySelector('.td-table__select, .td-table__th--select, .td-table__cell--select')).to.equal(null);
  });

  it('selectable without rowKey → no column + one warning (fail closed)', async () => {
    const el = await mk('selectable');
    expect(el.querySelector('.td-table__select')).to.equal(null);
    expect(warns.filter((w) => /rowKey/.test(w)).length).to.equal(1);
    el.setAttribute('per-page', '3');
    await frames(1);
    expect(warns.filter((w) => /rowKey/.test(w)).length).to.equal(1);
  });

  it('multiple: header + per-row checkbox buttons with names; mark aria-hidden; no aria-selected / role=radio', async () => {
    const el = await mk();
    const th = el.querySelector('.td-table__head .td-table__th--select');
    expect(th.getAttribute('role')).to.equal('columnheader');
    expect(th.getAttribute('scope')).to.equal('col');
    expect(th.hasAttribute('data-col')).to.equal(false);
    const h = head(el);
    expect(h.getAttribute('role')).to.equal('checkbox');
    expect(h.getAttribute('type')).to.equal('button');
    expect(h.getAttribute('aria-checked')).to.equal('false');
    expect(h.textContent.trim()).to.equal('Chọn tất cả trên trang');
    const b = ctl(el, 0);
    expect(b.localName).to.equal('button');
    expect(b.getAttribute('role')).to.equal('checkbox');
    expect(b.getAttribute('aria-checked')).to.equal('false');
    expect(b.getAttribute('aria-label')).to.equal('Chọn An');
    expect(b.querySelector('.td-check').getAttribute('aria-hidden')).to.equal('true');
    expect(b.querySelector('svg'), 'icon slot filled').to.not.equal(null);
    expect(b.closest('td').getAttribute('role')).to.equal('cell');
    expect(b.closest('td').classList.contains('td-table__card-select')).to.equal(true);
    expect(el.querySelector('[aria-selected]')).to.equal(null);
    expect(el.querySelector('[role=radio],[role=radiogroup]')).to.equal(null);
    expect(el.querySelector('input')).to.equal(null);
    // data columns keep data-col 0..n-1
    expect([...el.querySelectorAll('.td-table__th[data-col]')].map((t) => t.getAttribute('data-col'))).to.deep.equal(['0', '1']);
    expect(el.querySelector('[style]:not(td-table, div, th, td)')).to.equal(null);
  });

  it('selectable → single: header has a text-only "Chọn", no select-all; keeps the LAST selected key', async () => {
    const el = await mk();
    el.selectedKeys = [1, 3, 2];
    el.setAttribute('selectable', 'single');
    await frames(1);
    expect(head(el)).to.equal(null);
    const th = el.querySelector('.td-table__th--select');
    expect(th.textContent.trim()).to.equal('Chọn');
    expect(el.selectedKeys).to.deep.equal([2]);
    expect(checked(el).slice(0, 3)).to.deep.equal(['false', 'true', 'false']);
    expect(el.querySelector('[role=radio],[role=radiogroup]')).to.equal(null);
    el.setAttribute('selectable', 'none');
    await frames(1);
    expect(el.querySelector('.td-table__select')).to.equal(null);
    expect(el.selectedKeys).to.deep.equal([]);
  });

  it('render cell → label from the cell text (no card label), trimmed to 80; no primary text → "dòng n"', async () => {
    const long = 'x'.repeat(100);
    const el = await mk('selectable row-key="id"', {
      columns: [{ key: 'name', label: 'Tên', render: (r) => { const s = document.createElement('strong'); s.textContent = `  ${r.name}  \n chức vụ `; return s; } }],
      data: [{ id: 'a', name: 'An' }, { id: 'b', name: long }],
    });
    expect(ctl(el, 0).getAttribute('aria-label')).to.equal('Chọn An chức vụ');
    expect(ctl(el, 1).getAttribute('aria-label')).to.equal(`Chọn ${'x'.repeat(80)}`);
    const el2 = await mk('selectable row-key="id"', { data: [{ id: 9, name: '', role: 'r' }] });
    expect(ctl(el2, 0).getAttribute('aria-label')).to.equal('Chọn dòng 1');
  });

  it('XSS: a primary value with markup becomes the aria-label TEXT, nothing executes', async () => {
    window.__tdSelXss = 0;
    const evil = '<img src=x onerror="window.__tdSelXss=1">$&$1';
    const el = await mk('selectable row-key="id"', { data: [{ id: 1, name: evil, role: 'r' }] });
    await frames(2);
    expect(ctl(el, 0).getAttribute('aria-label')).to.equal(`Chọn ${evil}`);
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__tdSelXss).to.equal(0);
    el.selectable = 'single';
    await frames(1);
    await click(ctl(el, 0));
    await statusSettled();
    expect(status(el)).to.equal(`Đã chọn ${evil}`);
  });

  it('invalid / duplicate keys and a throwing rowKey → control disabled + one warning per kind', async () => {
    const el = await mk('selectable row-key="id"', {
      data: [{ id: 1, name: 'An' }, { id: 1, name: 'Trùng' }, { id: null, name: 'Rỗng' }, { id: {}, name: 'Obj' }, { id: 2, name: 'Bình' }],
    });
    expect(rowsOf(el).map((tr) => tr.querySelector('.td-table__select').disabled)).to.deep.equal([false, true, true, true, false]);
    expect(warns.filter((w) => /duplicate/i.test(w)).length).to.equal(1);
    expect(warns.filter((w) => /valid key/i.test(w)).length).to.equal(1);
    const el2 = await mk('selectable', { setup: (t) => { t.rowKey = (r) => { if (r.id === 3) throw new Error('x'); return r.id; }; } });
    expect(ctl(el2, 2).disabled).to.equal(true);
    expect(ctl(el2, 1).disabled).to.equal(false);
    expect(warns.filter((w) => /rowKey threw/.test(w)).length).to.equal(1);
  });

  it('rowSelectable(row) false or throwing → locked; API can still select it (checked + disabled)', async () => {
    const el = await mk('selectable row-key="id"', { setup: (t) => { t.rowSelectable = (r) => { if (r.id === 4) throw new Error('boom'); return r.id !== 2; }; } });
    expect(ctl(el, 1).disabled).to.equal(true);
    expect(ctl(el, 3).disabled).to.equal(true);
    expect(errors.some((e) => /rowSelectable threw/.test(e))).to.equal(true);
    el.select([2]);
    expect(ctl(el, 1).getAttribute('aria-checked')).to.equal('true');
    expect(rowsOf(el)[1].hasAttribute('data-selected')).to.equal(true);
    expect(head(el).getAttribute('aria-checked'), 'locked selected rows do not count').to.equal('false');
    expect(getComputedStyle(ctl(el, 1).querySelector('.td-check')).opacity).to.equal('0.5');
  });
});

describe('v0.37.0 td-table selection — mouse (QĐ 10–11)', () => {
  it('click toggles: aria-checked, data-selected, mark filled with --td-checkbox-color; one event each', async () => {
    const el = await mk();
    const ev = record(el, 'select-change');
    await click(ctl(el, 1));
    expect(ctl(el, 1).getAttribute('aria-checked')).to.equal('true');
    expect(rowsOf(el)[1].hasAttribute('data-selected')).to.equal(true);
    expect(document.activeElement).to.equal(ctl(el, 1));
    const mark = getComputedStyle(ctl(el, 1).querySelector('.td-check'));
    const probe = document.createElement('span');
    probe.style.color = 'var(--td-checkbox-color)';
    el.appendChild(probe);
    const want = getComputedStyle(probe).color;
    expect(await until(() => mark.backgroundColor === want), `mark ${mark.backgroundColor} → ${want}`).to.equal(true);
    probe.remove();
    expect(ev).to.deep.equal([{ keys: [2], added: [2], removed: [], trigger: 'toggle' }]);
    await click(ctl(el, 1));
    expect(el.selectedKeys).to.deep.equal([]);
    expect(ev.length).to.equal(2);
    expect(ev[1]).to.deep.equal({ keys: [], added: [], removed: [2], trigger: 'toggle' });
    expect(rowsOf(el)[1].hasAttribute('data-selected')).to.equal(false);
  });

  it('a click elsewhere on the row does not select', async () => {
    const el = await mk();
    await click(rowsOf(el)[0].querySelector('[data-col="1"]'));
    expect(el.selectedKeys).to.deep.equal([]);
  });

  it('Shift+click selects the range, then Shift+click on a selected row deselects the range; no text selection', async () => {
    const el = await mk();
    const ev = record(el, 'select-change');
    await click(ctl(el, 1));
    await click(ctl(el, 4), 'Shift');
    expect(el.selectedKeys).to.deep.equal([2, 3, 4, 5]);
    expect(ev[1]).to.deep.equal({ keys: [2, 3, 4, 5], added: [3, 4, 5], removed: [], trigger: 'range' });
    expect(window.getSelection().isCollapsed || String(window.getSelection()) === '').to.equal(true);
    await click(ctl(el, 2), 'Shift');
    expect(el.selectedKeys).to.deep.equal([2]);
    expect(ev[2].removed).to.deep.equal([3, 4, 5]);
    expect(ev[2].trigger).to.equal('range');
    expect(ev.length).to.equal(3);
  });

  it('locked rows are skipped by the range', async () => {
    const el = await mk('selectable row-key="id"', { setup: (t) => { t.rowSelectable = (r) => r.id !== 3; } });
    await click(ctl(el, 0));
    await click(ctl(el, 4), 'Shift');
    expect(el.selectedKeys).to.deep.equal([1, 2, 4, 5]);
  });

  it('range follows the DISPLAYED order after a client sort', async () => {
    const el = await mk();
    await click(el.querySelector('.td-table__sort')); // asc
    await click(el.querySelector('.td-table__sort')); // desc: Hà Giang Em Dũng Chi Bình An
    expect(rowsOf(el).map((tr) => tr.querySelector('[data-col="0"]').lastChild.textContent)).to.deep.equal(['Hà', 'Giang', 'Em', 'Dũng', 'Chi', 'Bình', 'An']);
    await click(ctl(el, 1));
    await click(ctl(el, 3), 'Shift');
    expect(el.selectedKeys).to.deep.equal([6, 5, 4]);
  });

  it('anchor on another page → Shift+click toggles one (trigger toggle); selection survives paging', async () => {
    const el = await mk('selectable row-key="id" per-page="3"');
    const ev = record(el, 'select-change');
    await click(ctl(el, 0));
    el.setPage(2);
    await frames(1);
    await click(ctl(el, 2), 'Shift');
    expect(el.selectedKeys).to.deep.equal([1, 6]);
    expect(ev[1].trigger).to.equal('toggle');
    el.setPage(1);
    await frames(1);
    expect(checked(el)).to.deep.equal(['true', 'false', 'false']);
  });
});

describe('v0.37.0 td-table selection — keyboard (QĐ 12)', () => {
  it('Tab reaches the controls; Space toggles, Shift+Space = range, Enter does nothing', async () => {
    const el = await mk('selectable row-key="id" layout="table"', { columns: [{ key: 'name', label: 'Tên' }] });
    const ev = record(el, 'select-change');
    head(el).focus();
    await sendKeys({ press: TAB });
    expect(document.activeElement).to.equal(ctl(el, 0));
    await sendKeys({ press: 'Space' });
    expect(el.selectedKeys).to.deep.equal([1]);
    expect(ev.length).to.equal(1);
    ctl(el, 3).focus();
    await sendKeys({ press: 'Shift+Space' });
    expect(el.selectedKeys).to.deep.equal([1, 2, 3, 4]);
    expect(ev.at(-1).trigger).to.equal('range');
    await sendKeys({ press: 'Enter' });
    expect(el.selectedKeys).to.deep.equal([1, 2, 3, 4]);
    await sendKeys({ press: 'Space' });
    expect(el.selectedKeys).to.deep.equal([1, 2, 3]);
    expect(ev.length).to.equal(3);
  });

  it('arrow keys do not move focus or change the selection', async () => {
    const el = await mk('selectable="single" row-key="id"');
    ctl(el, 1).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement).to.equal(ctl(el, 1));
    expect(el.selectedKeys).to.deep.equal([]);
  });

  it('header keeps focus after Space; focus stays on pagination after a page change', async () => {
    const el = await mk('selectable row-key="id" per-page="3"');
    head(el).focus();
    await sendKeys({ press: 'Space' });
    expect(el.selectedKeys).to.deep.equal([1, 2, 3]);
    expect(document.activeElement).to.equal(head(el));
    const next = el.querySelector('.td-table__pagination--bottom td-pagination .td-pagination__page:not([aria-current])');
    next.focus();
    await sendKeys({ press: 'Enter' });
    await frames(2);
    expect(el.querySelector('.td-table__pagination--bottom td-pagination').contains(document.activeElement)).to.equal(true);
    expect(head(el).getAttribute('aria-checked')).to.equal('false');
  });
});

describe('v0.37.0 td-table selection — header (QĐ 13)', () => {
  it('none → all (this page only) → mixed → all → none; other pages untouched', async () => {
    const el = await mk('selectable row-key="id" per-page="3"');
    el.selectedKeys = [7];
    const ev = record(el, 'select-change');
    await click(head(el));
    expect(head(el).getAttribute('aria-checked')).to.equal('true');
    expect(el.selectedKeys).to.deep.equal([7, 1, 2, 3]);
    expect(ev[0]).to.deep.equal({ keys: [7, 1, 2, 3], added: [1, 2, 3], removed: [], trigger: 'page' });
    await click(ctl(el, 1));
    expect(head(el).getAttribute('aria-checked')).to.equal('mixed');
    const mark = head(el).querySelector('.td-check');
    expect(await until(() => getComputedStyle(mark, '::after').opacity === '1'), 'mixed bar').to.equal(true);
    await click(head(el));
    expect(el.selectedKeys).to.deep.equal([7, 1, 3, 2]);
    await click(head(el));
    expect(el.selectedKeys).to.deep.equal([7]);
    expect(head(el).getAttribute('aria-checked')).to.equal('false');
  });

  it('max-selected=3 on a 5-row page → 3 selected + ONE select-limit + "Tối đa 3 dòng"', async () => {
    const el = await mk('selectable row-key="id" per-page="5" max-selected="3"');
    const lim = record(el, 'select-limit');
    const ev = record(el, 'select-change');
    await click(head(el));
    expect(el.selectedKeys).to.deep.equal([1, 2, 3]);
    expect(lim).to.deep.equal([{ max: 3 }]);
    expect(ev.length).to.equal(1);
    await statusSettled();
    expect(status(el)).to.equal('Tối đa 3 dòng');
  });

  it('disabled while loading and on an empty page', async () => {
    const el = await mk();
    el.setLoading(true);
    await frames(1);
    expect(head(el).disabled).to.equal(true);
    expect(el.querySelector('.td-table__row--skeleton > .td-table__cell--select')).to.not.equal(null);
    el.setLoading(false);
    await frames(1);
    expect(head(el).disabled).to.equal(false);
    el.data = [];
    await frames(1);
    expect(head(el).disabled).to.equal(true);
    expect(el.querySelector('.td-table__empty').getAttribute('colspan')).to.equal('3');
  });
});

describe('v0.37.0 td-table selection — kept across pages / data (QĐ 17–19)', () => {
  it('client: page 1 → 2 → 1 keeps; data = filtered keeps hidden keys; selectedRows = known rows', async () => {
    const el = await mk('selectable row-key="id" per-page="3"');
    await click(ctl(el, 0));
    el.setPage(2);
    await frames(1);
    await click(ctl(el, 0));
    el.setPage(1);
    await frames(1);
    expect(checked(el)[0]).to.equal('true');
    el.data = PEOPLE.filter((p) => p.id !== 1);
    await frames(1);
    expect(el.selectedKeys).to.deep.equal([1, 4]);
    expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['An', 'Dũng']);
  });

  it('server mode: keys of the old page stay; selectedRows has the rows seen; no event on data change', async () => {
    const el = await mk('selectable row-key="id" server-mode total-items="7" per-page="3"', { data: PEOPLE.slice(0, 3) });
    el.onPageChange = (p) => { el.data = PEOPLE.slice((p - 1) * 3, p * 3); };
    const ev = record(el, 'select-change');
    await click(ctl(el, 1));
    await click(el.querySelector('.td-table__pagination--bottom td-pagination .td-pagination__page:not([aria-current])'));
    await frames(2);
    expect(rowsOf(el)[0].querySelector('[data-col="0"]').lastChild.textContent).to.equal('Dũng');
    await click(ctl(el, 0));
    expect(el.selectedKeys).to.deep.equal([2, 4]);
    expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['Bình', 'Dũng']);
    expect(ev.length).to.equal(2);
    el.select([99]);
    expect(el.selectedRows.length, 'never-seen key skipped').to.equal(2);
  });

  it('rowKey change clears the selection (no event)', async () => {
    const el = await mk();
    const ev = record(el, 'select-change');
    el.selectedKeys = [1, 2];
    el.rowKey = (r) => `p-${r.id}`;
    await frames(1);
    expect(el.selectedKeys).to.deep.equal([]);
    expect(ctl(el, 0)).to.not.equal(null);
    expect(ev.length).to.equal(0);
  });

  it('getState().selection + update({ rowKey, rowSelectable, selectedKeys })', async () => {
    const el = await mk('selectable row-key="id"');
    el.update({ rowKey: 'name', rowSelectable: (r) => r.id !== 1, selectedKeys: ['Bình', 'Chi'] });
    await frames(1);
    expect(el.getState().selection).to.deep.equal({ mode: 'multiple', keys: ['Bình', 'Chi'] });
    expect(ctl(el, 0).disabled).to.equal(true);
    expect(el.isSelected('Chi')).to.equal(true);
  });
});

describe('v0.37.0 td-table selection — events + API (QĐ 15, 20–21)', () => {
  it('API never emits by default; { emit: true } → one event trigger api, hook before the event (a throw is logged)', async () => {
    const el = await mk();
    const ev = record(el, 'select-change');
    const order = [];
    el.addEventListener('select-change', () => order.push('event'));
    el.selectedKeys = [1];
    el.select([2]);
    el.deselect([1]);
    el.toggle(3);
    el.clearSelection();
    el.data = PEOPLE.slice();
    await frames(1);
    expect(ev.length).to.equal(0);
    el.onSelectChange = (keys) => { order.push(`hook:${keys.join()}`); throw new Error('hook'); };
    el.select([5, '5', 6], { emit: true });
    expect(ev).to.deep.equal([{ keys: [5, 6], added: [5, 6], removed: [], trigger: 'api' }]);
    expect(order).to.deep.equal(['hook:5,6', 'event']);
    expect(errors.some((e) => /onSelectChange threw/.test(e))).to.equal(true);
    el.toggle(5, { emit: true });
    el.clearSelection({ emit: true });
    expect(ev.map((d) => d.trigger)).to.deep.equal(['api', 'api', 'api']);
    expect(ev[2].removed).to.deep.equal([6]);
  });

  it('identity: 1 and "1" are one row; the original type comes back', async () => {
    const el = await mk();
    el.selectedKeys = ['1', 2n, 'x', null, ''];
    expect(el.selectedKeys).to.deep.equal(['1', 2n, 'x']);
    expect(ctl(el, 0).getAttribute('aria-checked')).to.equal('true');
    expect(ctl(el, 1).getAttribute('aria-checked')).to.equal('true');
    expect(el.isSelected(1)).to.equal(true);
  });

  it('max-selected: API over the cap is kept, never select-limit; user adds blocked (one limit each), removes allowed', async () => {
    const el = await mk('selectable row-key="id" max-selected="3"');
    const lim = record(el, 'select-limit');
    const ev = record(el, 'select-change');
    el.selectedKeys = [1, 2, 3, 4, 5];
    expect(el.selectedKeys.length).to.equal(5);
    el.select([6], { emit: true });
    expect(el.selectedKeys.length).to.equal(6);
    expect(ev.length).to.equal(1);
    expect(lim.length).to.equal(0);
    await click(ctl(el, 6));
    expect(el.selectedKeys.length).to.equal(6);
    expect(lim.length).to.equal(1);
    await statusSettled();
    expect(status(el)).to.equal('Tối đa 3 dòng');
    await click(ctl(el, 4));
    await click(ctl(el, 6), 'Shift');
    expect(lim.length, 'range at the cap').to.equal(2);
    await click(head(el));
    expect(lim.length, 'header at the cap').to.equal(3);
    await click(ctl(el, 0));
    expect(el.isSelected(1)).to.equal(false);
  });

  it('invalid max-selected is ignored with a warning', async () => {
    const el = await mk('selectable row-key="id" max-selected="0"');
    await click(head(el));
    expect(el.selectedKeys.length).to.equal(7);
    expect(warns.some((w) => /max-selected/.test(w))).to.equal(true);
  });

  it('live region: "Đã chọn {n} dòng" once per action', async () => {
    const el = await mk();
    await click(ctl(el, 0));
    await statusSettled();
    expect(status(el)).to.equal('Đã chọn 1 dòng');
    await click(head(el));
    await statusSettled();
    expect(status(el)).to.equal('Đã chọn 7 dòng');
  });
});

describe('v0.37.0 td-table selection — single (QĐ 7, 10, review R1-1)', () => {
  it('exclusive checkbox: B drops A in one event; Space again clears; Shift+click = click; status names the row', async () => {
    const el = await mk('selectable="single" row-key="id" max-selected="1"');
    const ev = record(el, 'select-change');
    expect(el.querySelector('[role=radio],[role=radiogroup]')).to.equal(null);
    expect(ctl(el, 1).getAttribute('aria-label')).to.equal('Chọn Bình');
    await click(ctl(el, 0));
    await click(ctl(el, 1), 'Shift');
    expect(ctl(el, 0).getAttribute('aria-checked')).to.equal('false');
    expect(ev[1]).to.deep.equal({ keys: [2], added: [2], removed: [1], trigger: 'toggle' });
    await statusSettled();
    expect(status(el)).to.equal('Đã chọn Bình');
    ctl(el, 1).focus();
    await sendKeys({ press: 'Space' });
    expect(el.selectedKeys).to.deep.equal([]);
    await statusSettled();
    expect(status(el)).to.equal('Đã bỏ chọn');
    expect(ev.length).to.equal(3);
  });

  it('API in single keeps the last key; max-selected ignored', async () => {
    const el = await mk('selectable="single" row-key="id" max-selected="1"');
    el.select([3, 4]);
    expect(el.selectedKeys).to.deep.equal([4]);
    const lim = record(el, 'select-limit');
    await click(ctl(el, 0));
    expect(el.selectedKeys).to.deep.equal([1]);
    expect(lim.length).to.equal(0);
  });
});

describe('v0.37.0 td-table selection — form (QĐ 22)', () => {
  async function inForm(attrs, opts) {
    const form = document.createElement('form');
    root.appendChild(form);
    const el = await mk(attrs, { ...opts, parent: form });
    return { form, el };
  }

  it('name="ids[]" → one FormData entry per key (string, selection order, other pages included)', async () => {
    const { form, el } = await inForm('selectable row-key="id" name="ids[]" per-page="3"');
    await click(ctl(el, 2));
    el.setPage(3);
    await frames(1);
    await click(ctl(el, 0));
    expect(new FormData(form).getAll('ids[]')).to.deep.equal(['3', '7']);
    expect([...form.elements].filter((n) => n.localName === 'input')).to.deep.equal([]);
    el.setAttribute('name', 'pick');
    expect(new FormData(form).getAll('pick')).to.deep.equal(['3', '7']);
    expect(new FormData(form).getAll('ids[]')).to.deep.equal([]);
  });

  it('no name → no entry; selectable off → no entry', async () => {
    const { form, el } = await inForm('selectable row-key="id"');
    el.selectedKeys = [1];
    expect([...new FormData(form).keys()]).to.deep.equal([]);
    el.setAttribute('name', 'ids');
    expect(new FormData(form).getAll('ids')).to.deep.equal(['1']);
    el.removeAttribute('selectable');
    await frames(1);
    expect([...new FormData(form).keys()]).to.deep.equal([]);
  });

  it('form.reset() clears + ONE select-change trigger reset', async () => {
    const { form, el } = await inForm('selectable row-key="id" name="ids"');
    el.selectedKeys = [1, 2];
    const ev = record(el, 'select-change');
    form.reset();
    expect(el.selectedKeys).to.deep.equal([]);
    expect(ev).to.deep.equal([{ keys: [], added: [], removed: [1, 2], trigger: 'reset' }]);
    expect(new FormData(form).getAll('ids')).to.deep.equal([]);
  });

  it('<fieldset disabled> and host disabled → controls disabled, selection kept, nothing submitted', async () => {
    const { form, el } = await inForm('selectable row-key="id" name="ids"');
    el.selectedKeys = [1];
    const fs = document.createElement('fieldset');
    form.appendChild(fs);
    fs.appendChild(el.parentElement);
    fs.disabled = true;
    await frames(1);
    expect(ctl(el, 0).disabled).to.equal(true);
    expect(head(el).disabled).to.equal(true);
    expect(new FormData(form).getAll('ids')).to.deep.equal([]);
    fs.disabled = false;
    await frames(1);
    expect(ctl(el, 0).disabled).to.equal(false);
    expect(new FormData(form).getAll('ids')).to.deep.equal(['1']);
    el.setAttribute('disabled', '');
    await frames(1);
    expect(ctl(el, 1).disabled).to.equal(true);
    expect(el.selectedKeys).to.deep.equal([1]);
    expect(new FormData(form).getAll('ids')).to.deep.equal([]);
  });
});

describe('v0.37.0 td-table selection — host disabled (QĐ 16, ADR 0018)', () => {
  it('controls locked, selection kept; the browser treats the host as a disabled form control (mouse clicks inside blocked)', async () => {
    const el = await mk('selectable row-key="id" disabled per-page="3"', {
      columns: [...COLS, { key: 'act', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa' }] }],
    });
    el.selectedKeys = [2];
    expect(el.matches(':disabled')).to.equal(true);
    expect(rowsOf(el).every((tr) => tr.querySelector('.td-table__select').disabled)).to.equal(true);
    expect(head(el).disabled).to.equal(true);
    expect(el.selectedKeys).to.deep.equal([2]);
    // measured in Chromium, Firefox and WebKit (documented in table.md + breaking-changes 0.37.0): a mouse click inside a
    // disabled form-associated host is not dispatched (keyboard activation differs per engine — not asserted)
    await click(el.querySelector('.td-table__sort'));
    expect(el.getState().sort.direction).to.equal(null);
    el.removeAttribute('disabled');
    await frames(1);
    await click(ctl(el, 0));
    expect(el.selectedKeys.length).to.equal(2);
  });
});

describe('v0.37.0 td-table selection — cards (QĐ 24)', () => {
  it('360: control on the primary line before it, select-all chip first in the sort bar with visible text, accent border', async () => {
    const el = await mk('selectable row-key="id"', { width: 360, columns: [{ key: 'id', label: 'ID' }, ...COLS.map((c) => (c.key === 'name' ? { ...c, card: 'primary' } : c))] });
    const tr = rowsOf(el)[0];
    expect(getComputedStyle(tr).display).to.not.equal('table-row');
    const sel = tr.querySelector('.td-table__cell--select').getBoundingClientRect();
    const prim = tr.querySelector('[data-card="primary"]').getBoundingClientRect();
    const lead = tr.querySelector('[data-card="lead"]').getBoundingClientRect();
    expect(Math.min(sel.bottom, prim.bottom) - Math.max(sel.top, prim.top) > 2, 'same line').to.equal(true);
    expect(sel.right <= lead.left + 1 && lead.right <= prim.left + 1, '[select][lead][primary]').to.equal(true);
    const chip = el.querySelector('.td-table__th--select');
    const sortChip = el.querySelector('.td-table__th--sortable');
    expect(chip.getBoundingClientRect().width > 40).to.equal(true);
    expect(chip.getBoundingClientRect().right <= sortChip.getBoundingClientRect().left + 1, 'first chip').to.equal(true);
    const label = el.querySelector('.td-table__select-all-label').getBoundingClientRect();
    expect(label.width > 20 && label.height > 8, 'label visible').to.equal(true);
    await click(ctl(el, 0));
    const cs = getComputedStyle(tr);
    const probe = document.createElement('span');
    probe.style.color = 'var(--td-table-card-selected-border)';
    el.appendChild(probe);
    expect(cs.borderTopColor).to.equal(getComputedStyle(probe).color);
    probe.remove();
    // resize 360 ↔ 900: same nodes + state
    const node = ctl(el, 0);
    el.parentElement.style.width = '900px';
    await frames(2);
    expect(getComputedStyle(tr).display).to.equal('table-row');
    expect(ctl(el, 0)).to.equal(node);
    expect(node.getAttribute('aria-checked')).to.equal('true');
    expect(el.querySelector('.td-table__select-all-label').getBoundingClientRect().width <= 1, 'sr-only in table mode').to.equal(true);
  });

  it('single at 360: no chip (header visually hidden)', async () => {
    const el = await mk('selectable="single" row-key="id"', { width: 360 });
    expect(el.querySelector('.td-table__th--select').getBoundingClientRect().width <= 1).to.equal(true);
  });
});

describe('v0.37.0 td-table selection — table geometry', () => {
  it('select column is narrow, control ≥ 24 × 24 with a mouse, selected row tinted', async () => {
    const el = await mk('selectable row-key="id" layout="table"');
    const td = rowsOf(el)[0].querySelector('.td-table__cell--select');
    expect(td.getBoundingClientRect().width <= 56).to.equal(true);
    const r = ctl(el, 0).getBoundingClientRect();
    expect(r.width >= 24 && r.height >= 24).to.equal(true);
    const before = getComputedStyle(rowsOf(el)[2]).backgroundColor;
    el.select([3]);
    expect(getComputedStyle(rowsOf(el)[2]).backgroundColor).to.not.equal(before);
  });
});

describe('v0.37.0 td-table selection — review round 1 (SEC-1, SEC-2, ISSUE-3)', () => {
  it('SEC-1: an inherited Object.prototype key never makes a keyless row selectable', async () => {
    try {
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Object.prototype, 'id', { value: 'victim-id', configurable: true, writable: true });
      const el = await mk('selectable row-key="id"', { data: [{ name: 'Không khoá' }, { id: 2, name: 'Bình' }] });
      expect(ctl(el, 0).disabled).to.equal(true);
      expect(ctl(el, 1).disabled).to.equal(false);
      el.select(['victim-id']);
      expect(el.selectedRows).to.deep.equal([]);
    } finally {
      delete Object.prototype.id;
    }
  });

  it('SEC-1: a throwing getter fails closed (row not selectable, render completes); class-instance getters work', async () => {
    class Post {
      constructor(n, name) { this._n = n; this.name = name; }
      get id() { return this._n; }
    }
    const bad = { name: 'Lỗi' };
    Object.defineProperty(bad, 'id', { get() { throw new Error('boom'); } });
    const el = await mk('selectable row-key="id"', { data: [new Post(1, 'An'), bad, new Post(3, 'Chi')] });
    expect(rowsOf(el).length).to.equal(3);
    expect([ctl(el, 0).disabled, ctl(el, 1).disabled, ctl(el, 2).disabled]).to.deep.equal([false, true, false]);
    await click(ctl(el, 2));
    expect(el.selectedKeys).to.deep.equal([3]);
    expect(el.selectedRows[0]).to.be.instanceOf(Post);
  });

  it('SEC-2: client mode — the same normalised key on another page (1 vs "1") is not selectable; selectedRows = the selectable row', async () => {
    const data = [{ id: 1, name: 'An' }, { id: 2, name: 'Bình' }, { id: '1', name: 'Giả An' }, { id: 4, name: 'Dũng' }];
    const el = await mk('selectable row-key="id" per-page="2"', { data });
    await click(ctl(el, 0));
    el.setPage(2);
    await frames(1);
    expect(ctl(el, 0).disabled, 'cross-page duplicate locked').to.equal(true);
    expect(ctl(el, 0).getAttribute('aria-checked')).to.equal('false');
    expect(ctl(el, 1).disabled).to.equal(false);
    expect(el.selectedRows.map((r) => r.name)).to.deep.equal(['An']);
    expect(warns.filter((w) => /duplicate/i.test(w)).length).to.equal(1);
    // sorted so that the duplicate comes first on page 1: still the FIRST row in data order owns the key
    el.setPage(1);
    await click(el.querySelector('.td-table__sort'));
    await click(el.querySelector('.td-table__sort')); // desc: Giả An, Dũng, Bình, An
    expect(rowsOf(el)[0].querySelector('[data-col="0"]').lastChild.textContent).to.equal('Giả An');
    expect(ctl(el, 0).disabled).to.equal(true);
  });

  it('ISSUE-3: turning selection off / switching to single prunes the row cache (server mode)', async () => {
    const el = await mk('selectable row-key="id" server-mode total-items="6" per-page="3"', { data: PEOPLE.slice(0, 3) });
    await click(ctl(el, 0));
    await click(ctl(el, 1));
    el.setAttribute('selectable', 'single'); // keeps 2, drops 1
    await frames(1);
    expect(el.selectedKeys).to.deep.equal([2]);
    expect(el._rowCache.has('1')).to.equal(false);
    el.setAttribute('selectable', 'none');
    await frames(1);
    expect(el._rowCache.size).to.equal(0);
    el.setAttribute('selectable', '');
    el.data = PEOPLE.slice(3, 6);
    await frames(1);
    el.select([1, 2]);
    expect(el.selectedRows, 'no stale rows from before the mode change').to.deep.equal([]);
  });
});
