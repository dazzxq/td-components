import { expect } from '@esm-bundle/chai';
import { TdDropdown } from './td-dropdown.js';

// v0.16.0 group B (plan docs/internal/plans/v0.16.0-backlog.md): B1 folded search, B2 options re-assignment keeps the
// selection / updateData drops ghosts, B3 onSelect + onChange, B4 TdDropdown.labels, B5 options before define,
// B6 guarded callbacks.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const CITIES = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'sg', label: 'Sài Gòn' },
  { value: 'dn', label: 'Đà Nẵng' },
  { value: 'hp', label: 'Hải Phòng' },
];
const cities = () => CITIES.map((c) => ({ ...c }));
function dd(attrs = '') {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
  el.options = cities();
  return el;
}
const optionLabels = (el) => [...el._menuElement.querySelectorAll('[role="option"]')].map((o) => o.textContent);
const search = (el, q) => {
  const input = el._menuElement.querySelector('.td-dropdown__search');
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const DEFAULT_LABELS = { ...TdDropdown.labels };
const origError = console.error;
let errors = [];

beforeEach(() => {
  errors = [];
  console.error = (...args) => { errors.push(args); };
});
afterEach(() => {
  console.error = origError;
  Object.assign(TdDropdown.labels, DEFAULT_LABELS);
  host.innerHTML = '';
});

describe('B1 search is case- and diacritic-insensitive', () => {
  it('"ha noi" matches "Hà Nội", "da" matches "Đà Nẵng"', () => {
    const el = dd();
    el.open();
    search(el, 'ha noi');
    expect(optionLabels(el)).to.deep.equal(['Hà Nội']);
    search(el, 'DA');
    expect(optionLabels(el)).to.deep.equal(['Đà Nẵng']);
    search(el, 'hải');
    expect(optionLabels(el)).to.deep.equal(['Hải Phòng']);
    search(el, '');
    expect(optionLabels(el)).to.have.length(4);
  });
});

describe('B2 options re-assignment / updateData', () => {
  it('re-assigning options keeps the current selection instead of returning to the value attribute', () => {
    const el = dd('value="hn" name="city"');
    expect(el.getValue()).to.equal('hn');
    el.setValue('sg');
    el.options = cities();
    expect(el.getValue()).to.equal('sg');
    expect(el.getSelectedItem().label).to.equal('Sài Gòn');
    // re-pointed at the NEW item object
    expect(el.getSelectedItem() === el.options[1]).to.equal(true);
  });

  it('re-assigning options without the selected value drops the selection', () => {
    const el = dd('value="hn"');
    el.options = cities().filter((c) => c.value !== 'hn');
    expect(el.getValue()).to.equal(null);
    expect(el.querySelector('.td-dropdown__value').hasAttribute('data-placeholder')).to.equal(true);
  });

  it('the value attribute still resolves when the first list is empty (loading) and real options come later', () => {
    const el = mount('<td-dropdown value="dn"></td-dropdown>');
    el.options = [];
    expect(el.getValue()).to.equal(null);
    el.options = cities();
    expect(el.getValue()).to.equal('dn');
  });

  it('updateData drops a selection that is no longer listed (no ghost value submitted)', () => {
    const form = document.createElement('form');
    host.appendChild(form);
    form.insertAdjacentHTML('beforeend', '<td-dropdown name="city" value="hn"></td-dropdown>');
    const el = form.lastElementChild;
    el.options = cities();
    expect(new FormData(form).get('city')).to.equal('hn');
    el.updateData(cities().filter((c) => c.value !== 'hn'));
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).get('city')).to.equal(null);
  });

  it('updateData keeps a selection that is still listed', () => {
    const el = dd('value="sg"');
    el.updateData(cities().reverse());
    expect(el.getValue()).to.equal('sg');
  });
});

describe('B3 + B6 callbacks', () => {
  it('onSelect runs before onChange, both run, then change fires', () => {
    const el = dd();
    const calls = [];
    el.onSelect = (item) => calls.push(['select', item && item.value]);
    el.onChange = (v) => calls.push(['change', v]);
    el.addEventListener('change', (e) => calls.push(['event', e.detail.value]));
    el._selectAndFire('dn');
    expect(calls).to.deep.equal([['select', 'dn'], ['change', 'dn'], ['event', 'dn']]);
    calls.length = 0;
    el._clearSelection();
    expect(calls).to.deep.equal([['select', null], ['change', null], ['event', null]]);
  });

  it('a throwing onSelect/onChange is logged; the other callback and the change event still run', () => {
    const el = dd();
    const calls = [];
    el.onSelect = () => { throw new Error('select boom'); };
    el.onChange = (v) => { calls.push(v); throw new Error('change boom'); };
    el.addEventListener('change', (e) => calls.push(`event:${e.detail.value}`));
    el._selectAndFire('hp');
    expect(calls).to.deep.equal(['hp', 'event:hp']);
    expect(errors).to.have.length(2);
    expect(String(errors[0][0])).to.contain('onSelect');
    expect(String(errors[1][0])).to.contain('onChange');
    expect(el.getValue()).to.equal('hp');
  });
});

describe('B4 TdDropdown.labels', () => {
  it('defaults keep the previous Vietnamese texts', () => {
    expect(TdDropdown.labels).to.deep.equal({
      search: 'Tìm kiếm',
      none: 'Không chọn',
      noResults: 'Không tìm thấy kết quả',
      required: 'Vui lòng chọn một tùy chọn',
    });
    const el = dd('value="hn" required');
    const input = el._menuElement.querySelector('.td-dropdown__search');
    expect(input.getAttribute('aria-label')).to.equal('Tìm kiếm');
    expect(input.getAttribute('placeholder')).to.equal('Tìm kiếm...');
    expect(el._menuElement.querySelector('.td-dropdown__option--clear').textContent).to.equal('Không chọn');
  });

  it('overrides apply (search, none, noResults, required) and are escaped', () => {
    Object.assign(TdDropdown.labels, {
      search: 'Search <b>', none: 'None', noResults: 'Nothing found', required: 'Pick one',
    });
    const el = dd('value="hn" required');
    const input = el._menuElement.querySelector('.td-dropdown__search');
    expect(input.getAttribute('aria-label')).to.equal('Search <b>');
    expect(input.getAttribute('placeholder')).to.equal('Search <b>...');
    expect(el._menuElement.querySelector('b')).to.equal(null);
    expect(el._menuElement.querySelector('.td-dropdown__option--clear').textContent).to.equal('None');
    el.open();
    search(el, 'zzz');
    expect(el._menuElement.querySelector('.td-dropdown__empty').textContent).to.equal('Nothing found');
    el.close();
    el.setValue(null);
    expect(el.validationMessage).to.equal('Pick one');
  });
});

describe('B5 properties set before the element is defined', () => {
  it('options / onChange / onSelect set before define are picked up at upgrade', () => {
    class LateDropdown extends TdDropdown {}
    const el = mount('<td-late-dropdown value="sg"></td-late-dropdown>');
    const calls = [];
    el.options = cities();
    el.onChange = (v) => calls.push(`change:${v}`);
    el.onSelect = (item) => calls.push(`select:${item.value}`);
    customElements.define('td-late-dropdown', LateDropdown);
    expect(el instanceof TdDropdown).to.equal(true);
    expect(el.options).to.have.length(4);
    expect(el.getValue()).to.equal('sg');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Sài Gòn');
    el._selectAndFire('hn');
    expect(calls).to.deep.equal(['select:hn', 'change:hn']);
  });
});
