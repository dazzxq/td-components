import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDropdown } from './td-dropdown.js';

// v0.85.0 (plan docs/internal/plans/v0.85.0-dropdown-action.md, Step 3) — td-dropdown `mode="action"` ("chọn để thêm"):
// `pick` { value, item } + onPick, never a selection / `change` / form value, `keep-open`, `trigger-icon` in action
// mode, `trigger-meta` (both modes), the polite "Đã chọn {label}" announcement, the open-menu options refresh (action
// mode only) — in Chromium, Firefox AND WebKit. Select mode stays the 0.84.0 contract. DOM nodes are compared as
// booleans / strings (a failing chai assertion carrying DOM nodes hangs the runner). Keys go to the trigger as
// dispatched keydown events (the component's own handler), except the cases marked "real key" (sendKeys), which prove
// the activation click of a real Enter / Space never adds a second activation.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
const PICKED = TdDropdown.labels.picked;
afterEach(async () => {
  TdDropdown.labels.picked = PICKED;
  for (const d of host.querySelectorAll('td-dropdown')) if (d._isOpen) d.close();
  host.innerHTML = '';
  await wait(10);
});

const same = (a, b) => a === b;
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const search = (el) => menu(el).querySelector('.td-dropdown__search');
const valueSpan = (el) => el.querySelector('.td-dropdown__value');
const metaSpan = (el) => trig(el).querySelector(':scope > .td-dropdown__trigger-meta');
const live = (el) => el.querySelector(':scope > .td-dropdown__live');
/** data rows (no clear / create row), in DOM order */
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const values = (el) => rows(el).map((r) => r.getAttribute('data-value'));
const activeValue = (el) => {
  const a = menu(el).querySelector('[data-active]');
  return a ? a.getAttribute('data-value') : null;
};
const describedBy = (el) => (trig(el).getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const key = (el, k, init = {}) => trig(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const searchKey = (el, k) => search(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
function type(el, q) {
  const s = search(el);
  s.value = q;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
function dd(attrs = '', options = FRUITS, parent = host) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`, parent);
  el.options = options.map((o) => ({ ...o }));
  return el;
}
/** every pick / onPick / change of `el`, in order */
function track(el) {
  const log = [];
  el.onPick = (item) => log.push(['onPick', item.value]);
  el.addEventListener('pick', (e) => log.push(['pick', e.detail.value, e.detail.item && e.detail.item.value]));
  el.addEventListener('change', () => log.push(['change']));
  el.onChange = () => log.push(['onChange']);
  el.onSelect = () => log.push(['onSelect']);
  return log;
}
/** collect console.warn calls while `fn` runs */
async function warnsDuring(fn) {
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => { seen.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return seen;
}

const FRUITS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Durian' },
  { value: 'e', label: 'Elderberry' },
];
const ACT = 'mode="action" aria-label="Thêm trái cây" placeholder="Thêm trái cây"';

describe('v0.85.0 td-dropdown action — pick paths (dsuite §4 item 5)', () => {
  it('click a row → exactly one onPick + pick { value, item }, no change; menu closed, focus on the trigger', async () => {
    const el = dd(ACT);
    const log = track(el);
    trig(el).focus();
    el.open();
    await settle();
    rows(el)[1].click();
    expect(log).to.deep.equal([['onPick', 'b'], ['pick', 'b', 'b']]);
    expect(el._isOpen).to.equal(false);
    expect(menu(el).hidden).to.equal(true);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(valueSpan(el).textContent).to.equal('Thêm trái cây');
    expect(el.getValue()).to.equal(null);
    expect(el.value).to.equal(null);
    expect(el.getSelectedItem()).to.equal(null);
  });

  it('Enter on the trigger, Enter in the search box, Space on the trigger, Alt+ArrowUp → one pick each', async () => {
    const el = dd(ACT);
    const log = track(el);
    trig(el).focus();
    // Enter on the trigger (opens on the first row, then picks it)
    key(el, 'Enter');
    expect(el._isOpen).to.equal(true);
    key(el, 'Enter');
    // Enter in the search box
    key(el, 'ArrowDown');
    key(el, 'ArrowDown'); // a → b
    searchKey(el, 'Enter');
    // Space on the trigger
    key(el, 'ArrowDown');
    key(el, 'End');
    key(el, ' ');
    // Alt+ArrowUp
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown'); // a → b → c
    key(el, 'ArrowUp', { altKey: true });
    expect(log).to.deep.equal([
      ['onPick', 'a'], ['pick', 'a', 'a'],
      ['onPick', 'b'], ['pick', 'b', 'b'],
      ['onPick', 'e'], ['pick', 'e', 'e'],
      ['onPick', 'c'], ['pick', 'c', 'c'],
    ]);
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(el.getValue()).to.equal(null);
  });

  it('real key: Enter / Space on the focused trigger pick once (the activation click is swallowed), with and without keep-open', async () => {
    for (const keep of [false, true]) {
      const el = dd(`${ACT} searchable="false"${keep ? ' keep-open' : ''}`);
      const log = track(el);
      trig(el).focus();
      await sendKeys({ press: 'ArrowDown' }); // open, active = first
      await settle(1);
      await sendKeys({ press: 'Enter' });
      await wait(30);
      expect(log.filter((l) => l[0] === 'pick'), `${keep} Enter`).to.deep.equal([['pick', 'a', 'a']]);
      expect(el._isOpen, `${keep} after Enter`).to.equal(keep);
      if (!keep) await sendKeys({ press: 'ArrowDown' });
      await settle(1);
      await sendKeys({ press: ' ' });
      await wait(30);
      expect(log.filter((l) => l[0] === 'pick').map((l) => l[1]), `${keep} Space`).to.deep.equal(keep ? ['a', 'b'] : ['a', 'a']);
      expect(el._isOpen, `${keep} after Space`).to.equal(keep);
      expect(log.some((l) => l[0] === 'change'), `${keep} change`).to.equal(false);
      el.close();
    }
  });

  it('a disabled option is never picked (click, keyboard); the create row still fires create only', async () => {
    const opts = [{ value: 'a', label: 'Apple', disabled: true }, { value: 'b', label: 'Banana' }];
    const el = dd(`${ACT} create-label="Thêm mới" keep-open`, opts);
    const log = track(el);
    const creates = [];
    el.addEventListener('create', (e) => creates.push(e.detail.query));
    el.open();
    await settle();
    rows(el)[0].click();
    expect(log).to.deep.equal([]);
    expect(el._isOpen).to.equal(true);
    key(el, 'Home'); // the first ENABLED row
    expect(activeValue(el)).to.equal('b');
    type(el, 'zz');
    menu(el).querySelector('.td-dropdown__option--create').click();
    expect(creates).to.deep.equal(['zz']);
    expect(log).to.deep.equal([]);
    expect(el._isOpen).to.equal(false); // the create row closes even with keep-open
    expect(same(document.activeElement, trig(el))).to.equal(true);
  });

  it('a disabled host does not open; onPick throwing is logged and pick still fires', async () => {
    const el = dd(`${ACT} disabled`);
    el.open();
    trig(el).click();
    expect(el._isOpen).to.equal(false);
    const el2 = dd(ACT);
    const picks = [];
    el2.onPick = () => { throw new Error('site bug'); };
    el2.addEventListener('pick', (e) => picks.push(e.detail.value));
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(String(a[0]));
    try {
      el2.open();
      rows(el2)[2].click();
    } finally { console.error = orig; }
    expect(picks).to.deep.equal(['c']);
    expect(errs.some((m) => m.includes('onPick threw'))).to.equal(true);
  });
});

describe('v0.85.0 td-dropdown action — no value, no form (decision 2, 3)', () => {
  it('FormData has no key, required stays valid (no aria-required, no asterisk), value / setValue / reset ignored', async () => {
    const form = mount('<form></form>');
    const el = dd(`${ACT} name="fruit" required label="Trái cây" value="b" allow-clear`, FRUITS, form);
    await settle(1);
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).has('fruit')).to.equal(false);
    expect(form.checkValidity()).to.equal(true);
    expect(el.checkValidity()).to.equal(true);
    expect(trig(el).hasAttribute('aria-required')).to.equal(false);
    expect(el.querySelector('.td-field__required')).to.equal(null);
    el.setValue('a');
    el.value = 'c';
    el.setAttribute('value', 'd');
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).has('fruit')).to.equal(false);
    el.removeAttribute('required');
    el.setAttribute('required', '');
    expect(trig(el).hasAttribute('aria-required')).to.equal(false);
    expect(form.checkValidity()).to.equal(true);
    el.open();
    rows(el)[0].click();
    expect(new FormData(form).has('fruit')).to.equal(false);
    form.reset();
    await settle(1);
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).has('fruit')).to.equal(false);
    el._restoreState('b'); // bfcache / autofill restore
    expect(el.getValue()).to.equal(null);
    // rows: no clear row, nothing selected, no check mark
    el.open();
    await settle(1);
    expect(menu(el).querySelector('.td-dropdown__option--clear')).to.equal(null);
    expect(menu(el).querySelector('.td-dropdown__check')).to.equal(null);
    expect(rows(el).every((r) => r.getAttribute('aria-selected') === 'false')).to.equal(true);
  });

  it('rows keep the 0.84.0 strings (plain + rich), aria-selected="false"', async () => {
    const el = dd(`id="dd-r" ${ACT}`, [{ value: 'p', label: 'Plain <b>x</b>' }, { value: 'r', label: 'Rich', meta: '3' }]);
    el.open();
    await settle(1);
    expect(scroller(el).innerHTML).to.equal(
      '<div class="td-dropdown__option" role="option" id="dd-r-opt-0" aria-selected="false" data-value="p" data-index="0" data-nav="0"><span class="td-dropdown__option-label">Plain &lt;b&gt;x&lt;/b&gt;</span></div>'
      + '<div class="td-dropdown__option td-dropdown__option--rich" role="option" id="dd-r-opt-1" aria-selected="false" aria-labelledby="dd-r-opt-1-label" aria-describedby="dd-r-opt-1-meta" data-value="r" data-index="1" data-nav="1">'
      + '<span class="td-dropdown__text"><span class="td-dropdown__option-label" id="dd-r-opt-1-label">Rich</span></span><span class="td-dropdown__meta" id="dd-r-opt-1-meta">3</span></div>',
    );
  });
});

describe('v0.85.0 td-dropdown action — trigger (decision 6, 7)', () => {
  it('placeholder text with data-action; trigger-icon default plus / none / off / false / a registered name / unknown', async () => {
    const el = dd(ACT);
    await settle(1);
    const icon = () => valueSpan(el).querySelector(':scope > .td-dropdown__value-icon');
    expect(valueSpan(el).hasAttribute('data-action')).to.equal(true);
    expect(valueSpan(el).hasAttribute('data-placeholder')).to.equal(false);
    expect(valueSpan(el).textContent).to.equal('Thêm trái cây');
    expect(icon().getAttribute('data-td-icon')).to.equal('plus');
    expect(!!icon().querySelector('svg')).to.equal(true);
    expect(icon().getAttribute('aria-hidden')).to.equal('true');
    // the action text is the normal field colour, not the placeholder grey
    const probe = dd('aria-label="x"');
    await settle(1);
    const ph = getComputedStyle(valueSpan(probe)).color;
    expect(getComputedStyle(valueSpan(el)).color).to.equal(getComputedStyle(trig(el)).color);
    expect(getComputedStyle(valueSpan(el)).color === ph).to.equal(false);
    for (const off of ['none', 'off', 'FALSE']) {
      el.setAttribute('trigger-icon', off);
      expect(icon(), off).to.equal(null);
      expect(valueSpan(el).textContent).to.equal('Thêm trái cây');
    }
    el.setAttribute('trigger-icon', ' star ');
    expect(icon().getAttribute('data-td-icon')).to.equal('star');
    expect(!!icon().querySelector('svg')).to.equal(true);
    el.setAttribute('trigger-icon', '');
    expect(icon().getAttribute('data-td-icon')).to.equal('plus');
    const warns = await warnsDuring(async () => {
      el.setAttribute('trigger-icon', 'v085-no-such-icon');
      expect(icon()).to.equal(null);
      el.setAttribute('placeholder', 'Khác'); // re-renders the span: still no icon, no second warn
      expect(icon()).to.equal(null);
      expect(valueSpan(el).textContent).to.equal('Khác');
      el.setAttribute('trigger-icon', '<svg onload=x>');
      expect(icon()).to.equal(null);
    });
    expect(warns.filter((w) => w.includes('v085-no-such-icon')).length).to.equal(1);
    expect(valueSpan(el).innerHTML.includes('<svg onload')).to.equal(false);
    // the first render with a custom icon / none
    const el2 = dd(`${ACT} trigger-icon="archive"`);
    const el3 = dd(`${ACT} trigger-icon="none"`);
    await settle(1);
    expect(el2.querySelector('.td-dropdown__value-icon').getAttribute('data-td-icon')).to.equal('archive');
    expect(el3.querySelector('.td-dropdown__value-icon')).to.equal(null);
  });

  it('trigger-meta: span before the arrow, in aria-describedby (page + helper ids kept), updated in place, both modes', async () => {
    const el = dd(`id="dd-m" ${ACT} trigger-meta=" 4/10 " helper-text="Tối đa 10"`);
    await settle(1);
    const t = trig(el);
    expect(metaSpan(el).id).to.equal('dd-m-trigger-meta');
    expect(metaSpan(el).textContent).to.equal('4/10');
    expect(metaSpan(el).nextElementSibling.classList.contains('td-dropdown__arrow')).to.equal(true);
    expect(metaSpan(el).previousElementSibling.classList.contains('td-dropdown__value')).to.equal(true);
    expect(describedBy(el)[0]).to.equal('dd-m-trigger-meta');
    expect(describedBy(el).length).to.equal(2); // + the helper note
    expect(describedBy(el).every((id) => !!document.getElementById(id))).to.equal(true);
    expect(getComputedStyle(metaSpan(el)).fontVariantNumeric).to.equal('tabular-nums');
    expect(getComputedStyle(metaSpan(el)).flexShrink).to.equal('0');
    t.setAttribute('aria-describedby', `page-desc ${t.getAttribute('aria-describedby')}`);
    t.focus();
    el.setAttribute('trigger-meta', '5/10 <b>');
    expect(same(trig(el), t)).to.equal(true); // no re-render
    expect(same(document.activeElement, t)).to.equal(true);
    expect(metaSpan(el).textContent).to.equal('5/10 <b>');
    expect(metaSpan(el).children.length).to.equal(0);
    el.triggerMeta = '';
    expect(metaSpan(el)).to.equal(null);
    expect(el.hasAttribute('trigger-meta')).to.equal(false);
    expect(describedBy(el).includes('dd-m-trigger-meta')).to.equal(false);
    expect(describedBy(el).includes('page-desc')).to.equal(true);
    el.triggerMeta = '6/10';
    expect(metaSpan(el).textContent).to.equal('6/10');
    expect(describedBy(el).includes('dd-m-trigger-meta')).to.equal(true);
    expect(describedBy(el).includes('page-desc')).to.equal(true);
    expect(same(document.activeElement, t)).to.equal(true);
    // select mode too (a count next to a value), the open menu stays open
    const sel = dd('id="dd-ms" aria-label="Chọn" value="a"');
    sel.open();
    sel.setAttribute('trigger-meta', '1/5');
    expect(sel._isOpen).to.equal(true);
    expect(metaSpan(sel).textContent).to.equal('1/5');
    expect(describedBy(sel)).to.deep.equal(['dd-ms-trigger-meta']);
    expect(valueSpan(sel).textContent).to.equal('Apple');
    // an error keeps the meta id
    el.setError('Lỗi');
    expect(describedBy(el).includes('dd-m-trigger-meta') && describedBy(el).includes('dd-m-error')).to.equal(true);
  });

  it('select mode without trigger-meta: the host DOM is the 0.84.0 string (no meta, no live region, no data-action)', async () => {
    const strip = (el) => {
      const c = el.cloneNode(true);
      for (const s of c.querySelectorAll('[data-td-icon]')) s.replaceChildren();
      return c.innerHTML;
    };
    const el = dd('id="dd-s" label="Kho" value="a"');
    const ph = dd('id="dd-p" aria-label="Kho"');
    await settle(1);
    expect(strip(el)).to.equal('<div class="td-dropdown" data-state="closed"><label class="td-field__label" id="dd-s-label" for="dd-s-trigger">Kho</label>'
      + '<button type="button" class="td-dropdown__trigger" id="dd-s-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="dd-s-listbox">'
      + '<span class="td-dropdown__value">Apple</span><span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span></button></div>');
    expect(strip(ph)).to.equal('<div class="td-dropdown" data-state="closed">'
      + '<button type="button" class="td-dropdown__trigger" id="dd-p-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="dd-p-listbox" aria-label="Kho">'
      + '<span class="td-dropdown__value" data-placeholder="">Chọn một tùy chọn</span><span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span></button></div>');
    expect(el.mode).to.equal('select');
    expect(el.keepOpen).to.equal(false);
    expect(el.triggerMeta).to.equal('');
  });
});

describe('v0.85.0 td-dropdown action — keep-open (dsuite §4 item 6)', () => {
  const LIST = [
    { value: 'k1', label: 'Kho 1' },
    { value: 'x', label: 'Khác' },
    { value: 'k2', label: 'Kho 2' },
    { value: 'k3', label: 'Kho 3', disabled: true },
    { value: 'k4', label: 'Kho 4' },
    { value: 'k5', label: 'Kho 5' },
  ];

  it('three picks in a row: the menu stays open, the query stays, active moves to the next enabled row, focus stays', async () => {
    const el = dd(`${ACT} keep-open`, LIST);
    const log = track(el);
    trig(el).focus();
    el.open();
    await wait(150); // the search input takes focus
    expect(same(document.activeElement, search(el))).to.equal(true);
    type(el, 'kho');
    expect(values(el)).to.deep.equal(['k1', 'k2', 'k3', 'k4', 'k5']);
    expect(activeValue(el)).to.equal('k1');
    searchKey(el, 'Enter');
    expect(activeValue(el)).to.equal('k2');
    searchKey(el, 'Enter');
    expect(activeValue(el)).to.equal('k4'); // k3 is disabled: skipped
    searchKey(el, 'Enter');
    expect(activeValue(el)).to.equal('k5');
    expect(log.filter((l) => l[0] === 'pick').map((l) => l[1])).to.deep.equal(['k1', 'k2', 'k4']);
    expect(el._isOpen).to.equal(true);
    expect(search(el).value).to.equal('kho');
    expect(values(el)).to.deep.equal(['k1', 'k2', 'k3', 'k4', 'k5']);
    expect(same(document.activeElement, search(el))).to.equal(true);
    expect(search(el).getAttribute('aria-activedescendant')).to.equal(menu(el).querySelector('[data-active]').id);
    // the last row → the previous enabled row (no wrap)
    searchKey(el, 'Enter');
    expect(activeValue(el)).to.equal('k4');
    // a single enabled row → no active row afterwards
    type(el, 'kho 5');
    searchKey(el, 'Enter');
    expect(activeValue(el)).to.equal(null);
    expect(log.filter((l) => l[0] === 'pick').map((l) => l[1])).to.deep.equal(['k1', 'k2', 'k4', 'k5', 'k5']);
    expect(log.some((l) => l[0] === 'change' || l[0] === 'onChange' || l[0] === 'onSelect')).to.equal(false);
    // keep-open="false" is off
    el.setAttribute('keep-open', 'false');
    expect(el.keepOpen).to.equal(false);
    type(el, ''); // active = the first enabled row
    searchKey(el, 'Enter');
    expect(el._isOpen).to.equal(false);
    expect(log.filter((l) => l[0] === 'pick').length).to.equal(6);
  });

  it('the site re-assigns options inside pick (picked item disabled): query, active row and scroll are kept', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ value: `v${i}`, label: `Kho ${i}` }));
    for (const via of ['options', 'updateData']) {
      const el = dd(`${ACT} keep-open max-height="5"`, many);
      el.addEventListener('pick', (e) => {
        const next = el.options.map((o) => (o.value === e.detail.value ? { ...o, disabled: true, meta: 'Đã thêm' } : o));
        if (via === 'options') el.options = next;
        else el.updateData(next);
        el.triggerMeta = `${next.filter((o) => o.disabled).length}/10`;
      });
      el.open();
      await settle();
      type(el, 'kho 1'); // Kho 1, Kho 10..13
      expect(values(el), via).to.deep.equal(['v1', 'v10', 'v11', 'v12', 'v13']);
      searchKey(el, 'Enter');
      expect(search(el).value, via).to.equal('kho 1');
      expect(values(el), via).to.deep.equal(['v1', 'v10', 'v11', 'v12', 'v13']);
      expect(rows(el)[0].getAttribute('aria-disabled'), via).to.equal('true');
      expect(activeValue(el), via).to.equal('v10');
      searchKey(el, 'Enter');
      expect(activeValue(el), via).to.equal('v11');
      expect(rows(el)[1].getAttribute('aria-disabled'), via).to.equal('true');
      expect(metaSpan(el).textContent, via).to.equal('2/10');
      expect(el._isOpen, via).to.equal(true);
      // scroll position kept (no active row, the full list)
      type(el, '');
      el._setActive(-1);
      scroller(el).scrollTop = 120;
      const top = scroller(el).scrollTop;
      const same14 = el.options.map((o) => ({ ...o }));
      if (via === 'options') el.options = same14;
      else el.updateData(same14);
      await settle(1);
      expect(scroller(el).scrollTop, via).to.equal(top);
      expect(activeValue(el), via).to.equal(null);
      el.close();
    }
  });

  it('re-assigned while open: an active row that is gone / disabled moves to the nearest enabled row, forward first', async () => {
    const el = dd(ACT);
    el.open();
    key(el, 'Home');
    key(el, 'ArrowDown');
    key(el, 'ArrowDown');
    expect(activeValue(el)).to.equal('c');
    el.options = FRUITS.filter((o) => o.value !== 'c'); // gone → index 2 = d
    expect(activeValue(el)).to.equal('d');
    el.options = FRUITS.map((o) => (o.value === 'd' ? { ...o, disabled: true } : o)); // disabled → e
    expect(activeValue(el)).to.equal('e');
    el.options = [{ value: 'a', label: 'Apple' }, { value: 'e', label: 'Elder', disabled: true }]; // → back to a
    expect(activeValue(el)).to.equal('a');
    el.options = [];
    expect(activeValue(el)).to.equal(null);
    expect(el._isOpen).to.equal(true);
  });

  it('toggling keep-open on an open action menu keeps it open with its query (not observed); select mode ignores it', async () => {
    const el = dd(ACT);
    el.open();
    const t = trig(el);
    type(el, 'an');
    el.setAttribute('keep-open', '');
    el.removeAttribute('keep-open');
    el.keepOpen = true;
    expect(el._isOpen).to.equal(true);
    expect(same(trig(el), t)).to.equal(true);
    expect(search(el).value).to.equal('an');
    expect(values(el)).to.deep.equal(['b', 'd']);
    key(el, 'Enter');
    expect(el._isOpen).to.equal(true); // keep-open read at pick time
    // select mode: keep-open does nothing, a choice closes and fires change
    const sel = dd('aria-label="Chọn" keep-open');
    const log = track(sel);
    sel.open();
    rows(sel)[1].click();
    expect(sel._isOpen).to.equal(false);
    expect(sel.getValue()).to.equal('b');
    expect(log.map((l) => l[0])).to.deep.equal(['onSelect', 'onChange', 'change']);
  });
  it('picking the last option with a create row: active goes back to an option, never onto the create row', async () => {
    const el = dd(`${ACT} keep-open create-label="Thêm mới"`);
    el.open();
    key(el, 'End'); // the create row
    key(el, 'ArrowUp'); // the last option (e)
    expect(activeValue(el)).to.equal('e');
    key(el, 'Enter');
    expect(el._isOpen).to.equal(true);
    expect(activeValue(el)).to.equal('d');
    expect(menu(el).querySelector('.td-dropdown__option--create').hasAttribute('data-active')).to.equal(false);
  });
});

describe('v0.85.0 td-dropdown action — live announcement (decision 8)', () => {
  it('"Đã chọn X" in the host live region (not the portal), re-announced on a repeat, labels.picked = "" → silent', async () => {
    const el = dd(`${ACT} keep-open`, [{ value: 'a', label: 'Táo <b>đỏ</b>' }, { value: 'b', label: 'Chuối' }]);
    const region = live(el);
    expect(!!region).to.equal(true);
    expect(region.className).to.equal('td-sr-only td-dropdown__live');
    expect(region.getAttribute('aria-live')).to.equal('polite');
    expect(region.getAttribute('aria-atomic')).to.equal('true');
    expect(same(region.previousElementSibling, el.querySelector('.td-dropdown'))).to.equal(true);
    expect(menu(el).querySelector('.td-dropdown__live')).to.equal(null);
    expect(region.textContent).to.equal('');
    el.open();
    rows(el)[0].click();
    expect(region.textContent).to.equal('Đã chọn Táo <b>đỏ</b>');
    expect(region.children.length).to.equal(0);
    const mo = new MutationObserver(() => {});
    mo.observe(region, { childList: true, characterData: true, subtree: true });
    rows(el)[0].click(); // the same label again: cleared, then set (announced again)
    const recs = mo.takeRecords();
    mo.disconnect();
    expect(recs.length >= 2).to.equal(true);
    expect(region.textContent).to.equal('Đã chọn Táo <b>đỏ</b>');
    TdDropdown.labels.picked = '{label} — đã thêm ($&)';
    rows(el)[1].click();
    expect(region.textContent).to.equal('Chuối — đã thêm ($&)');
    TdDropdown.labels.picked = '';
    rows(el)[1].click();
    expect(region.textContent).to.equal('');
    // select mode has no live region
    const sel = dd('aria-label="Chọn"');
    expect(live(sel)).to.equal(null);
  });
});

describe('v0.85.0 td-dropdown action — mode switch + <select> upgrade (decision 1)', () => {
  it('select → action drops the selection and the form value; action → select starts empty; the mode property', async () => {
    const form = mount('<form></form>');
    const el = dd('aria-label="Chọn" name="f" value="b"', FRUITS, form);
    await settle(1);
    expect(new FormData(form).get('f')).to.equal('b');
    el.open();
    el.mode = ' Action ';
    expect(el.getAttribute('mode')).to.equal('action');
    expect(el.mode).to.equal('action');
    expect(el._isOpen).to.equal(false); // structure path: closed + re-rendered
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).has('f')).to.equal(false);
    expect(valueSpan(el).hasAttribute('data-action')).to.equal(true);
    expect(!!live(el)).to.equal(true);
    el.mode = 'select';
    expect(el.hasAttribute('mode')).to.equal(false);
    expect(el.getValue()).to.equal(null);
    expect(valueSpan(el).hasAttribute('data-placeholder')).to.equal(true);
    expect(live(el)).to.equal(null);
    el.setValue('c');
    expect(new FormData(form).get('f')).to.equal('c');
    el.setAttribute('mode', 'ACTION');
    expect(el.mode).to.equal('action');
    expect(el.getValue()).to.equal(null);
    el.setAttribute('mode', 'actions');
    expect(el.mode).to.equal('select');
    // a pending value (options not listed yet) is dropped too
    const p = dd('aria-label="P"', []);
    p.setValue('zz');
    p.mode = 'action';
    p.mode = 'select';
    p.options = [{ value: 'zz', label: 'ZZ' }];
    expect(p.getValue()).to.equal(null);
  });

  it('a child <select> (selected option) under mode="action": options read, no selection, FormData has no key', async () => {
    const form = mount('<form></form>');
    const el = mount(`<td-dropdown mode="action" aria-label="Thêm"><select name="s" disabled>
      <option value="">— Thêm —</option><option value="a">A</option><option value="b" selected>B</option></select></td-dropdown>`, form);
    await settle(1);
    expect(el.options.map((o) => o.value)).to.deep.equal(['a', 'b']);
    expect(el.getAttribute('name')).to.equal('s');
    expect(el.hasAttribute('disabled')).to.equal(true);
    expect(el.getValue()).to.equal(null);
    expect(valueSpan(el).textContent).to.equal('— Thêm —');
    expect(new FormData(form).has('s')).to.equal(false);
    form.reset();
    expect(el.getValue()).to.equal(null);
  });

  it('a pre-upgrade el.mode = "action" property is in force when the child <select> is read', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-dropdown aria-label="Thêm"><select name="s"><option value="a">A</option><option value="b" selected>B</option></select></td-dropdown>';
    const d = tpl.content.firstElementChild;
    expect(d instanceof TdDropdown).to.equal(false); // not upgraded yet (inert template document)
    d.mode = 'action';
    d.keepOpen = true;
    d.triggerMeta = '0/3';
    const picks = [];
    d.onPick = (item) => picks.push(item.value);
    const form = mount('<form></form>');
    form.appendChild(d);
    await settle(1);
    expect(d instanceof TdDropdown).to.equal(true);
    expect(d.mode).to.equal('action');
    expect(d.keepOpen).to.equal(true);
    expect(metaSpan(d).textContent).to.equal('0/3');
    expect(d.options.map((o) => o.value)).to.deep.equal(['a', 'b']);
    expect(d.getValue()).to.equal(null);
    expect(new FormData(form).has('s')).to.equal(false);
    d.open();
    rows(d)[0].click();
    expect(picks).to.deep.equal(['a']);
    expect(d._isOpen).to.equal(true);
  });
});

describe('v0.85.0 td-dropdown — select mode open re-assign (0.86.0: filtered by the kept search text)', () => {
  it('options / updateData while open: the search text stays in the input, the list stays filtered by it (0.86.0)', async () => {
    for (const via of ['options', 'updateData']) {
      const el = dd('aria-label="Chọn"');
      el.open();
      await settle(1);
      type(el, 'an');
      expect(values(el), via).to.deep.equal(['b', 'd']);
      const next = [...FRUITS, { value: 'f', label: 'Fig' }];
      if (via === 'options') el.options = next;
      else el.updateData(next);
      expect(search(el).value, via).to.equal('an');
      expect(values(el), via).to.deep.equal(['b', 'd']); // 0.86.0: filtered (0.85.0 showed the full list)
      el.close();
    }
  });
});
