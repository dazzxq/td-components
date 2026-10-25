import { expect } from '@esm-bundle/chai';
import { TdDropdown } from './td-dropdown.js';
import { TdChipInput } from './td-chip-input.js';

// v0.82.0 (plan docs/internal/plans/v0.82.0-option-swatch.md) — `swatch` on td-dropdown / td-chip-input options: a colour
// dot (svg + circle[fill] set through setAttribute, gated by safeColor), data-swatch on <option>, no `style` attribute.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(() => { host.innerHTML = ''; });

const COLORS = [
  { value: 'r', label: 'Đỏ', swatch: '#ff0000' },
  { value: 'b', label: 'Xanh dương', swatch: 'rgb(0, 0, 255)' },
  { value: 'n', label: 'Không màu' },
];
const BAD = ['red;x', 'url(x)', '#12', 'x'.repeat(65)];
const fillOf = (svg) => svg.querySelector('circle').getAttribute('fill');
// the swatch code never writes a `style` attribute: no dot, label, row or list item has one (the menu / host geometry
// is the kit's own CSSOM write, out of scope here)
const noStyleAttr = (root) => expect(root.querySelectorAll('svg[style], circle[style], [role="option"][style], .td-chip-input__chip[style]').length, 'style attribute').to.equal(0);

function dd(attrs = '', options = COLORS) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
  el.options = options.map((o) => ({ ...o }));
  return el;
}
const rows = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const valueSpan = (el) => el.querySelector('.td-dropdown__value');

describe('td-dropdown swatch', () => {
  it('menu rows: svg before the label, circle fill set, aria-hidden; no swatch → no svg', () => {
    const el = dd('label="Màu"');
    el.open();
    const [r, b, n] = rows(el).filter((x) => x.hasAttribute('data-index'));
    for (const [row, c] of [[r, '#ff0000'], [b, 'rgb(0, 0, 255)']]) {
      const svg = row.querySelector(':scope > svg.td-dropdown__swatch');
      expect(svg).to.exist;
      expect(svg.getAttribute('aria-hidden')).to.equal('true');
      expect(svg.nextElementSibling.className).to.equal('td-dropdown__option-label');
      expect(fillOf(svg)).to.equal(c);
      const box = svg.getBoundingClientRect();
      expect(Math.round(box.width)).to.equal(12);
      expect(getComputedStyle(svg).borderRadius).to.not.equal('0px');
    }
    expect(n.querySelector('svg')).to.equal(null);
    expect(r.getAttribute('aria-label')).to.equal(null);
    expect(r.textContent.trim()).to.equal('Đỏ'); // accessible name = the label (svg has no text)
    noStyleAttr(el._menuElement);
    noStyleAttr(el);
  });

  it('invalid swatch values print no dot', () => {
    const el = dd('', BAD.map((s, i) => ({ value: `v${i}`, label: `L${i}`, swatch: s })));
    el.open();
    for (const row of rows(el)) expect(row.querySelector('svg')).to.equal(null);
    el.setValue('v0');
    expect(valueSpan(el).querySelector('svg')).to.equal(null);
  });

  it('trigger: dot + fill on the FIRST render when the initial value is a coloured option', async () => {
    const el = mount('<td-dropdown value="r"></td-dropdown>');
    el.options = COLORS.map((o) => ({ ...o }));
    await wait(30);
    const svg = valueSpan(el).querySelector('svg.td-dropdown__swatch');
    expect(svg).to.exist;
    expect(fillOf(svg)).to.equal('#ff0000');
    expect(valueSpan(el).textContent).to.equal('Đỏ');
    noStyleAttr(el);
  });

  it('trigger follows the selection: coloured → other colour → plain (no dot) → cleared placeholder (no dot)', () => {
    const el = dd('placeholder="Chọn màu"');
    expect(valueSpan(el).querySelector('svg')).to.equal(null);
    expect(valueSpan(el).hasAttribute('data-placeholder')).to.equal(true);
    el.setValue('r');
    expect(fillOf(valueSpan(el).querySelector('svg'))).to.equal('#ff0000');
    expect(valueSpan(el).textContent).to.equal('Đỏ');
    el.setValue('b');
    expect(valueSpan(el).querySelectorAll('svg').length).to.equal(1);
    expect(fillOf(valueSpan(el).querySelector('svg'))).to.equal('rgb(0, 0, 255)');
    el.setValue('n');
    expect(valueSpan(el).querySelector('svg')).to.equal(null);
    expect(valueSpan(el).textContent).to.equal('Không màu');
    el.setValue('r');
    el.setValue(null);
    expect(valueSpan(el).querySelector('svg')).to.equal(null);
    expect(valueSpan(el).textContent).to.equal('Chọn màu');
  });

  it('trigger accessible name / title stay the label', async () => {
    const el = dd('label="Màu" value="r"');
    await wait(30);
    const trig = el.querySelector('.td-dropdown__trigger');
    expect(trig.textContent.trim()).to.equal('Đỏ'); // the name is computed from content: the svg adds nothing
    expect(valueSpan(el).textContent).to.equal('Đỏ');
  });

  it('search filter keeps the dots (colour mapped by data-index of the filtered rows)', async () => {
    const opts = Array.from({ length: 10 }, (_, i) => ({ value: `c${i}`, label: i === 7 ? 'Tím' : `Màu ${i}`, swatch: i === 7 ? '#800080' : '#00000' + i }));
    const el = dd('searchable', opts);
    el.open();
    const search = el._menuElement.querySelector('.td-dropdown__search');
    search.value = 'Tím';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(30);
    const rs = rows(el);
    expect(rs.length).to.equal(1);
    expect(fillOf(rs[0].querySelector('svg'))).to.equal('#800080');
  });

  it('<select> with data-swatch (valid kept, invalid dropped)', () => {
    const el = mount(`<td-dropdown><select>
      <option value="r" data-swatch="#ff0000">Đỏ</option>
      <option value="x" data-swatch="url(x)">Xấu</option>
      <option value="n">Không màu</option></select></td-dropdown>`);
    expect(el.options[0].swatch).to.equal('#ff0000');
    expect('swatch' in el.options[1]).to.equal(false);
    expect('swatch' in el.options[2]).to.equal(false);
    el.open();
    expect(rows(el).filter((r) => r.hasAttribute('data-index')).map((r) => !!r.querySelector('svg'))).to.deep.equal([true, false, false]);
  });

  it('value-title (ellipsis title) still reads the label text', async () => {
    const long = { value: 'l', label: 'Màu rất dài '.repeat(12), swatch: '#123456' };
    const el = dd('value="l"', [long]);
    el.style.display = 'block'; // eslint-disable-line -- test-only sizing via CSSOM
    el.style.width = '140px';
    await wait(80);
    expect(valueSpan(el).querySelector('svg')).to.exist;
    expect(valueSpan(el).getAttribute('title')).to.equal(long.label);
  });
});

function ci(attrs = '', options = COLORS) {
  const el = mount(`<td-chip-input ${attrs}></td-chip-input>`);
  el.options = options.map((o) => ({ ...o }));
  return el;
}
const cRows = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];

describe('td-chip-input swatch', () => {
  it('option rows + chips carry the dot (DOM API), fill set', () => {
    const el = ci('');
    el.setValue([{ value: 'r', label: 'Đỏ', swatch: '#ff0000' }, { value: 'n', label: 'Không màu' }]);
    const chips = [...el.querySelectorAll('.td-chip-input__chip')];
    const svg = chips[0].querySelector('.td-chip-input__chip-label > svg.td-chip-input__swatch');
    expect(svg).to.exist;
    expect(fillOf(svg)).to.equal('#ff0000');
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    expect(svg.namespaceURI).to.equal('http://www.w3.org/2000/svg');
    expect(chips[1].querySelector('svg:not(.td-icon)')).to.equal(null);
    expect(chips[0].querySelector('.td-chip-input__remove').getAttribute('aria-label')).to.contain('Đỏ');
    el.open();
    const rs = cRows(el); // the selected Đỏ / Không màu are not offered again: only Xanh dương is left
    expect(rs.length).to.equal(1);
    expect(fillOf(rs[0].querySelector('.td-chip-input__option-label > svg.td-chip-input__swatch'))).to.equal('rgb(0, 0, 255)');
    expect(rs[0].textContent.trim()).to.equal('Xanh dương');
    expect(Math.round(rs[0].querySelector('svg').getBoundingClientRect().width)).to.equal(12);
    noStyleAttr(el);
    noStyleAttr(el._menuElement);
  });

  it('invalid values print no dot', () => {
    const el = ci('', BAD.map((s, i) => ({ value: `v${i}`, label: `L${i}`, swatch: s })));
    el.setValue([{ value: 'v0', label: 'L0', swatch: BAD[0] }]);
    el.open();
    expect(el.querySelector('.td-chip-input__chip svg:not(.td-icon)')).to.equal(null);
    for (const row of cRows(el)) expect(row.querySelector('svg')).to.equal(null);
  });

  it('renderChip / renderOption hooks suppress the built-in dot', () => {
    const el = ci('');
    el.renderChip = (item) => item.label;
    el.renderOption = (item) => item.label;
    el.setValue([{ value: 'r', label: 'Đỏ', swatch: '#ff0000' }]);
    el.open();
    expect(el.querySelector('.td-chip-input__swatch')).to.equal(null);
    expect(el._menuElement.querySelector('.td-chip-input__swatch')).to.equal(null);
  });

  it('<select> with data-swatch (single list)', () => {
    const el = mount(`<td-chip-input><select multiple>
      <option value="r" data-swatch="#ff0000" selected>Đỏ</option>
      <option value="x" data-swatch="url(x)">Xấu</option></select></td-chip-input>`);
    const leaves = el.options;
    expect(leaves[0].swatch).to.equal('#ff0000');
    expect('swatch' in leaves[1]).to.equal(false);
  });

  it('multiselect (selection-only) rows keep the check, then the dot, then the label', () => {
    const el = ci('selection-only');
    el.open();
    const rs = cRows(el).filter((r) => r.getAttribute('data-index') != null);
    const row = rs[0];
    expect(row.firstElementChild.classList.contains('td-chip-input__check')).to.equal(true);
    const label = row.querySelector('.td-chip-input__option-label');
    expect(label.firstElementChild.classList.contains('td-chip-input__swatch')).to.equal(true);
    expect(fillOf(label.firstElementChild)).to.equal('#ff0000');
    expect(rs[2].querySelector('svg.td-chip-input__swatch')).to.equal(null);
    noStyleAttr(el._menuElement);
  });

  it('multiselect <select multiple> + groups with data-swatch', () => {
    const el = mount(`<td-chip-input selection-only><select multiple>
      <optgroup label="Nhóm"><option value="r" data-swatch="#ff0000">Đỏ</option></optgroup></select></td-chip-input>`);
    el.open();
    const row = cRows(el).find((r) => r.getAttribute('data-index') != null);
    expect(fillOf(row.querySelector('svg.td-chip-input__swatch'))).to.equal('#ff0000');
  });
});

void TdDropdown; void TdChipInput;
