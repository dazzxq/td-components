// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 11) — td-dropdown, td-tree-select, td-datetime-picker in
// Chromium, Firefox AND WebKit: when the displayed value is cut (…), the element showing it carries `title` = the full
// NON-placeholder value; no title when it fits, when the placeholder shows or the value is empty. Re-checked on value
// change and on resize (ResizeObserver on the value element). Real signals only (own ResizeObserver callback after the
// component's, rAF) — no fixed sleeps. Booleans / strings in assertions (DOM nodes in a failing chai assertion hang).
import { expect } from '@esm-bundle/chai';
import './td-dropdown.js';
import './td-tree-select.js';
import './td-datetime-picker.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const LONG = 'Điện thoại thông minh màn hình gập cao cấp phiên bản giới hạn';
const SHORT = 'Áo';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; });

function mount(html, width = 160) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  wrap.insertAdjacentHTML('beforeend', html);
  return { wrap, el: wrap.firstElementChild };
}

/** resize the wrapper and resolve after a ResizeObserver delivery on `target` (the component's observer, created
 *  earlier, is notified first in the same delivery) + one frame */
async function resizeTo(wrap, target, width) {
  let notify;
  const ro = new ResizeObserver(() => notify());
  await new Promise((r) => { notify = r; ro.observe(target); }); // initial notification
  await raf(); // out of the RO delivery: resizing inside it would be an RO loop
  await new Promise((r) => { notify = r; wrap.style.setProperty('width', `${width}px`); });
  ro.disconnect();
  await raf();
}

const settle = async () => { await raf(); await raf(); };
const cut = (el) => el.scrollWidth > el.clientWidth;
/** the displayed value: span text, or the closed combobox input's value (searchable single tree-select) */
const shown = (el) => (el.localName === 'input' ? el.value : el.textContent);
const isPlaceholder = (el) => (el.localName === 'input' ? el.value === '' : el.hasAttribute('data-placeholder'));
const titleOf = (el) => (el.hasAttribute('title') ? el.getAttribute('title') : null);

const OPTS = [{ value: 'long', label: LONG }, { value: 'short', label: SHORT }];
const TREE = () => [{ value: 'long', label: LONG }, { value: 'short', label: SHORT }, { value: 'mid', label: 'Laptop văn phòng mỏng nhẹ' }];

const KINDS = {
  dropdown: {
    make: (value) => {
      const { wrap, el } = mount('<td-dropdown placeholder="Chọn một tuỳ chọn rất dài để bị cắt"></td-dropdown>');
      el.options = OPTS;
      if (value) el.value = value;
      return { wrap, el, valueEl: () => el.querySelector('.td-dropdown__value') };
    },
    set: (el, v) => { el.value = v; },
  },
  // single + searchable (default): the value shows in the combobox <input>
  'tree-select': {
    make: (value) => {
      const { wrap, el } = mount('<td-tree-select placeholder="Chọn danh mục sản phẩm rất dài để bị cắt"></td-tree-select>');
      el.data = TREE();
      if (value) el.value = value;
      return { wrap, el, valueEl: () => el.querySelector('.td-tree-select__input') };
    },
    set: (el, v) => { el.value = v; },
  },
  // single, searchable="false": the value shows in the trigger's span
  'tree-select (button)': {
    make: (value) => {
      const { wrap, el } = mount('<td-tree-select searchable="false" placeholder="Chọn danh mục sản phẩm rất dài để bị cắt"></td-tree-select>');
      el.data = TREE();
      if (value) el.value = value;
      return { wrap, el, valueEl: () => el.querySelector('.td-tree-select__value') };
    },
    set: (el, v) => { el.value = v; },
  },
  'datetime-picker': {
    // long = full date-time "dd/mm/yyyy - hh:mm" (cut at 160px), short = a date-mode value "dd/mm/yyyy" (fits)
    make: (value) => {
      const { wrap, el } = mount('<td-datetime-picker placeholder="Chọn ngày giờ giao hàng mong muốn"></td-datetime-picker>');
      if (value) KINDS['datetime-picker'].set(el, value);
      return { wrap, el, valueEl: () => el.querySelector('.td-dtp__value') };
    },
    set: (el, v) => {
      if (v === 'short') {
        el.setAttribute('mode', 'date');
        el.setAttribute('value', '2026-10-04');
      } else {
        el.removeAttribute('mode');
        el.setAttribute('value', '2026-10-04T14:30');
      }
    },
  },
};

for (const [name, k] of Object.entries(KINDS)) {
  describe(`v0.34.0 ${name} — title when the value is cut (160px)`, () => {
    it('long value → title = the full displayed value', async () => {
      const { valueEl } = k.make('long');
      await settle();
      const v = valueEl();
      expect(cut(v), `cut (${v.scrollWidth} > ${v.clientWidth})`).to.equal(true);
      if (name !== 'datetime-picker') expect(shown(v).includes(LONG), shown(v)).to.equal(true);
      expect(titleOf(v)).to.equal(shown(v));
    });

    it('short value → no title', async () => {
      const { valueEl } = k.make('short');
      await settle();
      const v = valueEl();
      expect(cut(v), `not cut (${v.scrollWidth} ≤ ${v.clientWidth})`).to.equal(false);
      expect(titleOf(v)).to.equal(null);
    });

    it('placeholder shown (even cut) → no title', async () => {
      const { valueEl } = k.make(null);
      await settle();
      const v = valueEl();
      expect(isPlaceholder(v), 'placeholder').to.equal(true);
      if (v.localName !== 'input') expect(cut(v), 'the long placeholder is cut').to.equal(true);
      expect(titleOf(v)).to.equal(null);
    });

    it('value change long → short removes the title', async () => {
      const { el, valueEl } = k.make('long');
      await settle();
      expect(titleOf(valueEl()) !== null, 'title while long').to.equal(true);
      k.set(el, 'short');
      await settle();
      expect(cut(valueEl()), 'not cut').to.equal(false);
      expect(titleOf(valueEl())).to.equal(null);
      k.set(el, 'long');
      await settle();
      expect(titleOf(valueEl())).to.equal(shown(valueEl()));
    });

    it('resize 160 → 600 with the long value removes the title (and back to 160 restores it)', async () => {
      const { wrap, valueEl } = k.make('long');
      await settle();
      expect(titleOf(valueEl()) !== null, 'title at 160').to.equal(true);
      await resizeTo(wrap, valueEl(), 600);
      expect(cut(valueEl()), 'not cut at 600').to.equal(false);
      expect(titleOf(valueEl())).to.equal(null);
      await resizeTo(wrap, valueEl(), 160);
      expect(titleOf(valueEl())).to.equal(shown(valueEl()));
    });
  });
}

describe('v0.34.0 tree-select multiple — the comma list counts as the value', () => {
  it('cut list → title = the displayed list; one short item → no title', async () => {
    const { el } = mount('<td-tree-select multiple placeholder="Chọn"></td-tree-select>');
    el.data = TREE();
    el.value = ['long', 'mid'];
    await settle();
    const v = el.querySelector('.td-tree-select__value');
    expect(v.textContent.includes(', '), v.textContent).to.equal(true);
    expect(cut(v), 'cut').to.equal(true);
    expect(titleOf(v)).to.equal(v.textContent);
    el.value = ['short'];
    await settle();
    expect(titleOf(v)).to.equal(null);
  });
});

describe('v0.34.0 value title — observer lifecycle', () => {
  it('a disconnected dropdown no longer reacts (observer released), a reconnected one does', async () => {
    const { wrap, el } = KINDS.dropdown.make('long');
    await settle();
    const v = () => el.querySelector('.td-dropdown__value');
    expect(titleOf(v()) !== null, 'title').to.equal(true);
    el.remove();
    expect(el._vtRO == null, 'observer released on disconnect').to.equal(true);
    wrap.appendChild(el);
    await settle();
    expect(titleOf(v())).to.equal(v().textContent);
  });
});
