import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-check-matrix.js';

// v0.47.0 (plan docs/internal/plans/v0.47.0-check-matrix.md M5, QĐ 26) — the narrow "one column at a time" mode of
// <td-check-matrix> in Chromium, Firefox AND WebKit: layout="column" | "grid" | "auto" (container < 720px), the column
// picker (a separate tab stop before the grid), hidden bulk cells can never be flipped by any path, arrows skip hidden
// columns. Waits are rAF-polled on real signals (ResizeObserver / container queries settle asynchronously).
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

const COLS = () => ['a', 'b', 'c', 'd'].map((k) => ({ key: k, label: `Vai trò ${k.toUpperCase()}` }));
const ROWS = () => [{ key: 'r0', label: 'R0' }, { key: 'g', label: 'G', rows: [{ key: 'r1', label: 'R1' }, { key: 'r2', label: 'R2' }] }];
const shown = (el) => !!el && el.getClientRects().length > 0;

/** host inside a box of `width` px (the host is an inline-size container) */
function mount(attrs, width) {
  const box = document.createElement('form');
  box.className = `cm-box-${width}`;
  box.innerHTML = `<input id="before" aria-label="trước"><td-check-matrix name="p" label="Quyền" ${attrs}></td-check-matrix>`;
  document.body.appendChild(box);
  extra.push(() => box.remove());
  const el = box.querySelector('td-check-matrix');
  // a width via CSSOM (CSP-safe), never a style attribute
  box.style.setProperty('width', `${width}px`);
  el.setData({ columns: COLS(), rows: ROWS(), value: { a: ['r0'], c: ['r1'] } });
  return { el, form: box };
}
const visibleCols = (el) => [...el.querySelectorAll('thead th[data-c]')].filter(shown).map((th) => Number(th.getAttribute('data-c')));
const fd = (form) => [...new FormData(form)].filter(([k]) => k.endsWith('[]'));

describe('v0.47.0 td-check-matrix — narrow mode (M5)', () => {
  it('layout="column": the bar + only the label column and the picked column; the select picks another column', async () => {
    const { el } = mount('layout="column"', 1000);
    const bar = el.querySelector('.td-check-matrix__bar');
    await waitFor(() => shown(bar), 'bar');
    expect(visibleCols(el)).to.deep.equal([0]);
    const select = bar.querySelector('select');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleCols(el)).to.deep.equal([2]);
    expect(bar.querySelector('input').getAttribute('aria-label')).to.equal('Chọn cả cột Vai trò C');
    for (const k of ['row', 'group', 'all']) {
      expect([...el.querySelectorAll(`.td-check-matrix__grid [data-kind="${k}"]`)].some(shown)).to.equal(false, `${k} bulk hidden`);
    }
  });

  it('hidden bulk cells never flip anything (click, Space) — the bar bulk acts on the picked column only', async () => {
    const { el, form } = mount('layout="column"', 1000);
    await waitFor(() => shown(el.querySelector('.td-check-matrix__bar')), 'bar');
    const ev = [];
    el.addEventListener('change', (e) => ev.push(e.detail));
    const before = fd(form);
    el.querySelector('[data-kind="all"] input').click();
    el.querySelector('tr[data-r="0"] [data-kind="row"] input').click();
    el.querySelector('tbody [data-kind="group"] input').click();
    expect(ev.length).to.equal(0);
    expect(fd(form)).to.deep.equal(before);
    expect(el.querySelector('[data-kind="all"] input').checked).to.equal(false, 'repainted');
    el.querySelector('.td-check-matrix__bar input').click(); // column a: r0 ✓ → tick r1, r2
    expect(ev.length).to.equal(1);
    expect(ev[0]).to.deep.equal({ added: [['r1', 'a'], ['r2', 'a']], removed: [], trigger: 'column' });
  });

  it('the select is its own tab stop before the grid; arrows never land on a hidden column', async () => {
    const { el } = mount('layout="column"', 1000);
    await waitFor(() => shown(el.querySelector('.td-check-matrix__bar')), 'bar');
    document.getElementById('before').focus();
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement === el.querySelector('.td-check-matrix__colpick')).to.equal(true);
    const cell = el.querySelector('tr[data-r="0"]').cells[2];
    cell.querySelector('input').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === cell.querySelector('input')).to.equal(true, 'no visible column to the right');
    await sendKeys({ press: 'ArrowLeft' });
    expect(document.activeElement === el.querySelector('tr[data-r="0"]').cells[1]).to.equal(true, 'the label cell');
    await sendKeys({ press: 'ArrowLeft' });
    expect(document.activeElement === el.querySelector('tr[data-r="0"]').cells[1]).to.equal(true, 'the hidden bulk column is skipped');
  });

  it('layout="auto": one column under a 720px container, the full grid from 720px; the active cell follows', async () => {
    const { el, form } = mount('', 500);
    await waitFor(() => visibleCols(el).length === 1, 'narrow');
    el.querySelector('tr[data-r="0"]').cells[2].querySelector('input').focus();
    form.style.setProperty('width', '900px');
    await waitFor(() => visibleCols(el).length === 4, 'wide');
    expect(shown(el.querySelector('.td-check-matrix__bar'))).to.equal(false);
    el.querySelector('tr[data-r="1"]').cells[5].querySelector('input').focus(); // column d
    form.style.setProperty('width', '500px');
    await waitFor(() => visibleCols(el).length === 1, 'narrow again');
    // the ResizeObserver moves the roving stop off the hidden column (the browser may have blurred it already)
    await waitFor(() => shown(el.querySelector('table [tabindex="0"]')), 'the tab stop is never a hidden cell');
    expect(el.querySelectorAll('table [tabindex="0"]').length).to.equal(1);
  });

  it('layout="grid": the full grid even in a narrow container (the box scrolls, the page does not)', async () => {
    const { el } = mount('layout="grid"', 320);
    await raf();
    expect(visibleCols(el)).to.deep.equal([0, 1, 2, 3]);
    const sc = el.querySelector('.td-check-matrix__scroll');
    expect(sc.scrollWidth > sc.clientWidth).to.equal(true);
    expect(sc.getBoundingClientRect().right <= 321 + el.getBoundingClientRect().left).to.equal(true);
  });

  it('max-height: valid values through CSSOM (never a style attribute), invalid ones ignored with one warning', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (m) => warns.push(String(m));
    extra.push(() => { console.warn = orig; });
    const { el } = mount('max-height="10rem"', 900);
    await raf();
    const sc = el.querySelector('.td-check-matrix__scroll');
    expect(getComputedStyle(sc).maxHeight).to.equal('160px');
    el.setAttribute('max-height', 'calc(1px + 1px)');
    expect(getComputedStyle(sc).maxHeight).to.not.equal('2px');
    el.setAttribute('max-height', 'url(x)');
    expect(warns.filter((w) => w.includes('max-height')).length).to.equal(1);
    expect(el.querySelector('[style]')).to.equal(null);
  });
});
