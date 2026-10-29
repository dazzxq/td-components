import { expect } from '@esm-bundle/chai';
import './td-dropdown.js';

// v0.87.0 (plan docs/internal/plans/v0.87.0-p3-tiles-chip-create-render-option.md C) — td-dropdown `renderOption`, in
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans / strings (a failing chai assertion carrying DOM
// nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 2) { for (let i = 0; i < n; i++) await raf(); }
afterEach(() => {
  for (const d of host.querySelectorAll('td-dropdown')) if (d._isOpen) d.close();
  host.innerHTML = '';
});
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const labelOf = (row) => row.querySelector('.td-dropdown__option-label');
const search = (el) => menu(el).querySelector('.td-dropdown__search');
function type(el, q) {
  const s = search(el);
  s.value = q;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
const FRUITS = [
  { value: 'a', label: 'Táo' },
  { value: 'b', label: 'Chuối', icon: 'star', description: 'Ngọt', meta: '12' },
  { value: 'c', label: 'Cam' },
];
function dd(attrs = 'aria-label="Chọn" searchable', options = FRUITS) {
  host.insertAdjacentHTML('beforeend', `<td-dropdown ${attrs}></td-dropdown>`);
  const el = host.lastElementChild;
  el.options = options.map((o) => ({ ...o }));
  return el;
}

describe('v0.87.0 td-dropdown renderOption', () => {
  it('a Node replaces the label content of plain and rich rows; the rich parts stay; ctx = { query, selected }', async () => {
    const el = dd('aria-label="Chọn" value="b"');
    const calls = [];
    el.renderOption = (item, ctx) => {
      calls.push([item.value, ctx.query, ctx.selected]);
      const b = document.createElement('b');
      b.className = 'site-label';
      b.textContent = `#${item.label}`;
      return b;
    };
    el.open();
    await settle();
    const r = rows(el);
    expect(r.map((x) => labelOf(x).querySelector('b.site-label')?.textContent)).to.deep.equal(['#Táo', '#Chuối', '#Cam']);
    expect(!!r[1].querySelector('.td-dropdown__icon')).to.equal(true);
    expect(r[1].querySelector('.td-dropdown__desc-text').textContent).to.equal('Ngọt');
    expect(r[1].querySelector('.td-dropdown__meta').textContent).to.equal('12');
    expect(calls.some((c) => c[0] === 'b' && c[2] === true)).to.equal(true);
    expect(calls.some((c) => c[0] === 'a' && c[2] === false)).to.equal(true);
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Chuối');
    expect(el._measured).to.equal(true);
  });

  it('a string is text (never HTML); null / "" / a throw keep the label text (a throw is logged)', async () => {
    const el = dd();
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a.map(String).join(' '));
    try {
      el.renderOption = (item) => {
        if (item.value === 'a') return '<img src=x onerror=alert(1)>';
        if (item.value === 'b') return null;
        throw new Error('boom');
      };
      el.open();
      await settle();
      const r = rows(el);
      expect(labelOf(r[0]).textContent).to.equal('<img src=x onerror=alert(1)>');
      expect(labelOf(r[0]).querySelector('img')).to.equal(null);
      expect(labelOf(r[1]).textContent).to.equal('Chuối');
      expect(labelOf(r[2]).textContent).to.equal('Cam');
      expect(errs.some((m) => m.includes('renderOption failed'))).to.equal(true);
    } finally { console.error = orig; }
  });

  it('search still matches the label; the query reaches the hook; clear / create rows are never rendered by it', async () => {
    const el = dd('aria-label="Chọn" searchable allow-clear create-label="Thêm" value="a"');
    const seen = [];
    el.renderOption = (item, { query }) => { seen.push(query); return `[${item.label}]`; };
    el.open();
    await settle();
    type(el, 'cam');
    await settle();
    expect(rows(el).map((x) => labelOf(x).textContent)).to.deep.equal(['[Cam]']);
    expect(seen[seen.length - 1]).to.equal('cam');
    const create = menu(el).querySelector('.td-dropdown__option--create .td-dropdown__option-label');
    expect(create.textContent.includes('[')).to.equal(false);
    const clear = menu(el).querySelector('.td-dropdown__option--clear');
    if (clear) expect(clear.textContent.includes('[')).to.equal(false);
  });

  it('a replaced label keeps the option name = the item label (aria-label; rich rows drop aria-labelledby, keep describedby)', async () => {
    const el = dd('aria-label="Chọn"');
    el.renderOption = (item) => (item.value === 'c' ? null : `* ${item.label} *`);
    el.open();
    await settle();
    const [a, b, c] = rows(el);
    expect(a.getAttribute('aria-label')).to.equal('Táo');
    expect(b.getAttribute('aria-label')).to.equal('Chuối');
    expect(b.hasAttribute('aria-labelledby')).to.equal(false);
    expect((b.getAttribute('aria-describedby') || '').length > 0).to.equal(true);
    expect(c.hasAttribute('aria-label')).to.equal(false);
  });

  it('assigning it on an open menu keeps the active row and re-measures the list height', async () => {
    const el = dd('aria-label="Chọn" searchable="false" max-height="2"', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]);
    el.open();
    await settle();
    el._setActive(1);
    const h0 = scroller(el).getBoundingClientRect().height;
    el.renderOption = (item) => {
      const d = document.createElement('div');
      d.className = 'tall';
      d.textContent = item.label;
      d.appendChild(document.createElement('br'));
      d.appendChild(document.createTextNode('dòng 2'));
      return d;
    };
    await settle();
    expect(menu(el).querySelector('[data-active]')?.getAttribute('data-value')).to.equal('b');
    expect(scroller(el).getBoundingClientRect().height > h0 + 4).to.equal(true);
  });

  it('assigning / clearing renderOption re-renders; a non-function is null', async () => {
    const el = dd();
    el.open();
    await settle();
    el.renderOption = (item) => `*${item.label}`;
    expect(labelOf(rows(el)[0]).textContent).to.equal('*Táo');
    el.renderOption = 'nope';
    expect(el.renderOption).to.equal(null);
    expect(labelOf(rows(el)[0]).textContent).to.equal('Táo');
  });
});
