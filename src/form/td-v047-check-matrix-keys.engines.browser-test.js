import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-check-matrix.js';

// v0.47.0 (plan docs/internal/plans/v0.47.0-check-matrix.md M4) — keyboard (APG grid, QĐ 18) + a11y tree (QĐ 15–17) of
// <td-check-matrix> in Chromium, Firefox AND WebKit: ONE tab stop even with group buttons, arrows / Home / End /
// Ctrl+Home / Ctrl+End / PageUp / PageDown (collapsed rows + hidden columns skipped), RTL, the group button as a roving
// destination, focus on locked / n/a cells, the grid's name (four cases), unique aria-controls, scroll reveal under the
// sticky parts. Real key presses (sendKeys); waits are rAF-polled (robust under load). Nodes compared as booleans.
// Neighbours are text inputs: WebKit's Tab skips buttons by default (macOS keyboard setting).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function waitFor(cond, what = 'condition', timeout = 5000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

const COLS = () => [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];
const ROWS = () => [
  { key: 'r0', label: 'R0' },
  { key: 'g1', label: 'G1', rows: [{ key: 'r1', label: 'R1' }, { key: 'r2', label: 'R2' }] },
  { key: 'g2', label: 'G2', collapsed: true, rows: [{ key: 'r3', label: 'R3' }] },
  { key: 'g3', label: 'G3', rows: [{ key: 'r4', label: 'R4' }] },
];
const CELLS = () => ({ r1: { b: { locked: true, note: 'khoá' } }, r2: { c: { na: true } } });

function mount(attrs = 'name="p" label="Quyền"', data = { columns: COLS(), rows: ROWS(), cells: CELLS() }, wrapAttrs = '') {
  const box = document.createElement('div');
  box.innerHTML = `<div ${wrapAttrs}><input id="before" aria-label="trước"><td-check-matrix ${attrs}></td-check-matrix><input id="after" aria-label="sau"></div>`;
  document.body.appendChild(box);
  extra.push(() => box.remove());
  const el = box.querySelector('td-check-matrix');
  if (data) el.setData(data);
  return el;
}
const act = () => document.activeElement;
const cellOf = (el, r, c) => el.querySelector(`tr[data-r="${r}"]`).cells[2 + c];
const inputOf = (el, r, c) => cellOf(el, r, c).querySelector('input');
const groupBtn = (el, g) => el.querySelector(`tbody[data-g="${g}"] .td-check-matrix__group-toggle`);
async function press(key) {
  await sendKeys({ press: key });
  await raf();
}
/** exactly one tabindex=0 inside the table, and every focusable element carries a roving tabindex */
function oneStop(el) {
  const table = el.querySelector('table');
  const zero = table.querySelectorAll('[tabindex="0"]');
  const focusable = [...table.querySelectorAll('input:not([disabled]), button:not([disabled]), [tabindex]')];
  return zero.length === 1 && focusable.every((x) => x.getAttribute('tabindex') === '-1' || x.getAttribute('tabindex') === '0');
}

describe('v0.47.0 td-check-matrix — keyboard + a11y (M4)', () => {
  it('ONE tab stop with groups / locked / n/a: Tab enters on the first data cell, Tab again leaves (never a group button)', async () => {
    const el = mount();
    expect(oneStop(el)).to.equal(true);
    document.getElementById('before').focus();
    await press('Tab');
    expect(act() === inputOf(el, 0, 0)).to.equal(true);
    await press('Tab');
    expect(act().id).to.equal('after');
    await press('Shift+Tab');
    expect(act() === inputOf(el, 0, 0)).to.equal(true);
  });

  it('arrows move by cell (no wrap); ↓ skips the rows of a collapsed group; the group button is a destination', async () => {
    const el = mount();
    inputOf(el, 0, 0).focus();
    await press('ArrowLeft');
    expect(act() === cellOf(el, 0, 0).parentElement.cells[1]).to.equal(true, 'row header th');
    await press('ArrowLeft');
    expect(act() === el.querySelector('tr[data-r="0"] [data-kind="row"] input')).to.equal(true, 'row bulk');
    await press('ArrowLeft');
    expect(act() === el.querySelector('tr[data-r="0"] [data-kind="row"] input')).to.equal(true, 'no wrap');
    await press('ArrowRight');
    await press('ArrowDown');
    expect(act() === groupBtn(el, 0)).to.equal(true, 'label cell of a group row = its button');
    expect(oneStop(el)).to.equal(true);
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    expect(act() === groupBtn(el, 1)).to.equal(true);
    await press('ArrowDown');
    expect(act() === groupBtn(el, 2)).to.equal(true, 'the collapsed group rows are skipped');
    await press('ArrowUp');
    await press('ArrowRight');
    expect(act() === el.querySelector('tbody[data-g="1"] [data-kind="group-column"][data-c="0"] input')).to.equal(true);
    await press('ArrowLeft');
    expect(act() === groupBtn(el, 1)).to.equal(true, 'from the right');
  });

  it('Enter / Space on a group button toggle it, focus stays on the same node, one expanded-change each; Tab still one stop', async () => {
    const el = mount();
    const ev = [];
    el.addEventListener('expanded-change', (e) => ev.push(e.detail));
    const btn = groupBtn(el, 1);
    inputOf(el, 2, 0).focus();
    await press('ArrowDown'); // → G2 group-column? no: same column x=2 of the group row
    await press('ArrowLeft');
    expect(act() === btn).to.equal(true);
    await press('Enter');
    expect(btn.getAttribute('aria-expanded')).to.equal('true');
    expect(act() === btn).to.equal(true);
    await press('Space');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
    expect(act() === btn).to.equal(true);
    expect(ev).to.deep.equal([{ group: 'g2', expanded: true }, { group: 'g2', expanded: false }]);
    expect(oneStop(el)).to.equal(true);
    await press('Tab');
    expect(act().id).to.equal('after');
  });

  it('Home / End (row), Ctrl+Home / Ctrl+End (grid), PageDown / PageUp (10 shown rows)', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ key: `r${i}`, label: `R${i}` }));
    const el = mount('name="p" label="L"', { columns: COLS(), rows });
    inputOf(el, 3, 1).focus();
    await press('End');
    expect(act() === inputOf(el, 3, 2)).to.equal(true);
    await press('Home');
    expect(act() === el.querySelector('tr[data-r="3"] [data-kind="row"] input')).to.equal(true);
    await press('ArrowRight');
    await press('ArrowRight');
    await press('PageDown');
    expect(act() === inputOf(el, 13, 0)).to.equal(true);
    await press('PageUp');
    expect(act() === inputOf(el, 3, 0)).to.equal(true);
    await press('Control+End');
    expect(act() === inputOf(el, 29, 2)).to.equal(true);
    await press('Control+Home');
    expect(act() === el.querySelector('.td-check-matrix__corner')).to.equal(true, 'the empty corner cell is focusable itself');
  });

  it('locked / n/a cells are reachable (the td), Space does nothing there, the note line explains', async () => {
    const el = mount();
    const ev = [];
    el.addEventListener('change', (e) => ev.push(e.detail));
    inputOf(el, 1, 0).focus();
    await press('ArrowRight');
    expect(act() === cellOf(el, 1, 1)).to.equal(true);
    expect(el.querySelector('.td-check-matrix__note').textContent).to.equal('khoá');
    await press('Space');
    expect(ev.length).to.equal(0);
    expect(inputOf(el, 1, 1).disabled).to.equal(true);
    await press('ArrowDown');
    await press('ArrowRight');
    expect(act() === cellOf(el, 2, 2)).to.equal(true, 'n/a cell');
  });

  it('collapsing the group that holds the focus → the same column of its group row; new data keeps the active cell by key', async () => {
    const el = mount();
    inputOf(el, 2, 1).focus();
    el.collapse('g1');
    await waitFor(() => act() === el.querySelector('tbody[data-g="0"] [data-kind="group-column"][data-c="1"] input'), 'focus to the group row');
    el.expand('g1');
    inputOf(el, 2, 1).focus();
    el.setData({ columns: [{ key: 'z', label: 'Z' }, ...COLS()], rows: ROWS() });
    await waitFor(() => act() === inputOf(el, 2, 2), 'same key after new data');
    expect(oneStop(el)).to.equal(true);
  });

  it('crosshair: the focused column header gets data-active; RTL swaps ← →', async () => {
    const el = mount('name="p" label="L" dir="rtl"');
    inputOf(el, 0, 0).focus();
    await raf();
    expect(el.querySelector(`#${el.id}-c0`).hasAttribute('data-active')).to.equal(true);
    await press('ArrowLeft'); // RTL: ← moves to the NEXT column
    expect(act() === inputOf(el, 0, 1)).to.equal(true);
    expect(el.querySelector(`#${el.id}-c1`).hasAttribute('data-active')).to.equal(true);
    await press('ArrowRight');
    expect(act() === inputOf(el, 0, 0)).to.equal(true);
  });

  it('the grid always has a name: label > <label for> > host aria-label (kept in sync) > fallback + one warning', async () => {
    const name = (el) => {
      const ids = el.querySelector('table').getAttribute('aria-labelledby').split(' ');
      return ids.map((id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1 && document.getElementById(id).textContent).join(' ');
    };
    const a = mount('name="p" label="Quyền theo vai trò"');
    expect(name(a)).to.equal('Quyền theo vai trò');
    const b = mount('name="p" id="cm-ext"');
    const lab = document.createElement('label');
    lab.htmlFor = 'cm-ext';
    lab.textContent = 'Nhãn ngoài';
    b.before(lab);
    extra.push(() => lab.remove());
    b.setData({ columns: COLS(), rows: ROWS() });
    expect(name(b)).to.equal('Nhãn ngoài');
    const c = mount('name="p" aria-label="Quyền khoá"');
    expect(name(c)).to.equal('Quyền khoá');
    c.setAttribute('aria-label', 'Đổi tên');
    expect(name(c)).to.equal('Đổi tên');
    const warns = [];
    const orig = console.warn;
    console.warn = (m) => warns.push(String(m));
    extra.push(() => { console.warn = orig; });
    const d = mount('name="p"');
    expect(name(d)).to.equal('Ma trận chọn');
    expect(warns.filter((w) => w.includes('label')).length).to.equal(1);
  });

  it('aria: row/column headers, cell names = row + column ids, descriptions / notes described, unique aria-controls (two matrices)', () => {
    const one = mount('name="p" label="Một"', { columns: [{ key: 'a', label: 'A', description: 'mô tả A' }], rows: ROWS(), cells: { r1: { a: { note: 'n1' } } } });
    const two = mount('name="q" label="Hai"', { columns: COLS(), rows: ROWS() });
    for (const el of [one, two]) {
      for (const ctl of el.querySelectorAll('[aria-controls]')) {
        const id = ctl.getAttribute('aria-controls');
        const hits = document.querySelectorAll(`#${CSS.escape(id)}`);
        expect(hits.length).to.equal(1);
        expect(hits[0].localName).to.equal('tbody');
        expect(el.contains(hits[0])).to.equal(true);
      }
      for (const ctl of el.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
        for (const id of `${ctl.getAttribute('aria-labelledby') || ''} ${ctl.getAttribute('aria-describedby') || ''}`.trim().split(/\s+/)) {
          expect(document.querySelectorAll(`#${CSS.escape(id)}`).length, id).to.equal(1);
        }
      }
    }
    expect(one.querySelector('thead th[scope="col"][data-c="0"]') !== null).to.equal(true);
    expect(one.querySelectorAll('tbody th[scope="row"]').length).to.equal(one.querySelectorAll('tbody tr').length);
    expect(one.querySelector('[data-kind="column"] input').getAttribute('aria-describedby')).to.equal(`${one.id}-c0d`);
    expect(inputOf(one, 1, 0).getAttribute('aria-describedby')).to.equal(`${one.id}-n0`);
    expect([...one.querySelectorAll('[id]')].every((n) => n.id.startsWith(one.id))).to.equal(true, 'ids from the host id, never data');
  });

  it('keyboard focus is never left under the sticky header / first columns (reveal)', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ key: `r${i}`, label: `Quyền ${i}` }));
    const columns = Array.from({ length: 14 }, (_, i) => ({ key: `c${i}`, label: `Vai trò ${i}` }));
    const el = mount('name="p" label="L" max-height="16rem" layout="grid"', { columns, rows }, 'style-free');
    inputOf(el, 0, 0).focus();
    for (let i = 0; i < 3; i++) await press('PageDown');
    for (let i = 0; i < 12; i++) await press('ArrowRight');
    await press('ArrowUp');
    await press('ArrowUp');
    for (let i = 0; i < 10; i++) await press('ArrowLeft');
    const target = act().closest('td');
    const r = target.getBoundingClientRect();
    const head = el.querySelector('thead').getBoundingClientRect();
    const sticky = target.parentElement.cells[1].getBoundingClientRect();
    expect(r.top >= head.bottom - 1).to.equal(true, `top ${r.top} under header ${head.bottom}`);
    expect(r.left >= sticky.right - 1).to.equal(true, `left ${r.left} under sticky ${sticky.right}`);
  });
});
