import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.59.0 (plan v0.59.0-dsuite-small §E, QĐ E1) — <td-datetime-picker clearable>: a clear button (a SIBLING of the
// trigger) shown while there is a value and the field is neither required nor disabled; mouse / touch / Enter / Space
// clear the value: FormData '', ONE `change` { value: '', dbValue: '' }, no `input`, the focus on the trigger, no dialog.
// Name per mode ("Xoá ngày" / "Xoá tháng" / "Xoá năm"). Chromium, Firefox AND WebKit. Booleans in assertions.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const host = document.createElement('div');
host.style.width = '480px';
document.body.appendChild(host);
afterEach(async () => {
  TdModal.closeAll();
  await frames(2);
  host.innerHTML = '';
});
function mount(attrs, wrap = (h) => `<form>${h}</form>`) {
  host.innerHTML = wrap(`<td-datetime-picker name="d" ${attrs}></td-datetime-picker>`);
  return host.querySelector('td-datetime-picker');
}
const clearBtn = (el) => el.querySelector('.td-dtp__clear');
const trigger = (el) => el.querySelector('.td-dtp__trigger');
const fd = (el) => new FormData(el.closest('form')).get('d');
function events(el) {
  const rec = { input: 0, change: [] };
  el.addEventListener('input', () => { rec.input += 1; });
  el.addEventListener('change', (e) => rec.change.push(e.detail));
  return rec;
}
const modalOpen = () => !!document.querySelector('body > .td-modal:not([data-state="closing"])');

describe('v0.59.0 td-datetime-picker clearable — visibility', () => {
  it('DOM: .td-dtp--clearable, the button after the trigger (not inside it), named per mode, icon slot', async () => {
    const el = mount('clearable mode="date" value="15/06/2026" label="Ngày giao"');
    await frames();
    const b = clearBtn(el);
    expect(!!b && b.previousElementSibling === trigger(el) && !trigger(el).contains(b)).to.equal(true);
    expect(el.querySelector('.td-dtp').classList.contains('td-dtp--clearable')).to.equal(true);
    expect(b.getAttribute('type')).to.equal('button');
    expect(b.getAttribute('aria-label')).to.equal('Xoá ngày');
    expect(b.hidden).to.equal(false);
    expect(b.querySelector('svg[data-icon="close"]') !== null).to.equal(true);
    expect(el.clearable).to.equal(true);
  });

  for (const [mode, value, name] of [['datetime', '15/06/2026 - 09:30', 'Xoá ngày'], ['month', '06/2026', 'Xoá tháng'], ['year', '2026', 'Xoá năm']]) {
    it(`mode ${mode}: name "${name}"`, async () => {
      const el = mount(`clearable mode="${mode}" value="${value}"`);
      await frames();
      expect(clearBtn(el).getAttribute('aria-label')).to.equal(name);
    });
  }

  it('hidden when empty / required / disabled / in a disabled fieldset; shown for a malformed value', async () => {
    const cases = [
      ['clearable', true], ['clearable required value="15/06/2026 - 09:30"', true], ['clearable disabled value="15/06/2026 - 09:30"', true],
      ['clearable value="31/02/2026 - 09:30"', false], ['clearable value="15/06/2026 - 09:30"', false],
    ];
    for (const [attrs, hidden] of cases) {
      const el = mount(attrs);
      await frames();
      expect(clearBtn(el).hidden, attrs).to.equal(hidden);
    }
    const el = mount('clearable value="15/06/2026 - 09:30"', (h) => `<form><fieldset disabled>${h}</fieldset></form>`);
    await frames();
    expect(clearBtn(el).hidden).to.equal(true);
    el.closest('fieldset').disabled = false;
    await frames();
    expect(clearBtn(el).hidden).to.equal(false);
  });

  it('runtime: value / required / disabled / mode update the button in place (same node)', async () => {
    const el = mount('clearable');
    await frames();
    const b = clearBtn(el);
    el.setValue('15/06/2026 - 09:30');
    expect(b.hidden).to.equal(false);
    el.setAttribute('required', '');
    expect(b.hidden).to.equal(true);
    el.removeAttribute('required');
    el.setAttribute('disabled', '');
    expect(b.hidden).to.equal(true);
    el.removeAttribute('disabled');
    expect(b.hidden).to.equal(false);
    el.setAttribute('mode', 'month');
    expect(clearBtn(el) === b && b.getAttribute('aria-label') === 'Xoá tháng').to.equal(true);
  });

  it('without `clearable`: no button, no class; toggling it at run time adds / removes the button', async () => {
    const el = mount('value="15/06/2026 - 09:30"');
    await frames();
    expect(clearBtn(el) === null && !el.querySelector('.td-dtp--clearable')).to.equal(true);
    el.clearable = true;
    await frames();
    expect(clearBtn(el) !== null && clearBtn(el).hidden === false).to.equal(true);
    el.clearable = false;
    await frames();
    expect(clearBtn(el) === null).to.equal(true);
  });
});

describe('v0.59.0 td-datetime-picker clearable — clearing', () => {
  it('click: value + FormData empty, ONE change {value:"", dbValue:""}, no input, focus on the trigger, no dialog', async () => {
    const el = mount('clearable mode="date" value="15/06/2026"');
    await frames();
    const rec = events(el);
    expect(fd(el)).to.equal('2026-06-15');
    clearBtn(el).click();
    await frames();
    expect(el.getValue()).to.equal('');
    expect(fd(el)).to.equal('');
    expect(rec.change).to.deep.equal([{ value: '', dbValue: '' }]);
    expect(rec.input).to.equal(0);
    expect(document.activeElement === trigger(el)).to.equal(true);
    expect(clearBtn(el).hidden).to.equal(true);
    expect(trigger(el).querySelector('.td-dtp__value').hasAttribute('data-placeholder')).to.equal(true);
    expect(modalOpen()).to.equal(false);
  });

  for (const key of ['Enter', ' ']) {
    it(`keyboard: Tab from the trigger reaches the button; ${key === ' ' ? 'Space' : key} clears`, async () => {
      const el = mount('clearable mode="date" value="15/06/2026"');
      await frames();
      const rec = events(el);
      trigger(el).focus();
      await sendKeys({ press: 'Tab' });
      expect(document.activeElement === clearBtn(el)).to.equal(true);
      await sendKeys({ press: key === ' ' ? 'Space' : key });
      await frames();
      expect(rec.change.length).to.equal(1);
      expect(document.activeElement === trigger(el)).to.equal(true);
      expect(modalOpen()).to.equal(false);
    });
  }

  it('a malformed value is cleared too; an error message shown before is re-evaluated', async () => {
    const el = mount('clearable value="31/02/2026 - 09:30"');
    await frames();
    expect(el.validity.badInput).to.equal(true);
    clearBtn(el).click();
    await frames();
    expect(el.validity.valid).to.equal(true);
  });

  it('form reset after a clear brings the default value (and the button) back', async () => {
    const el = mount('clearable mode="date" value="15/06/2026"');
    await frames();
    clearBtn(el).click();
    el.closest('form').reset();
    await frames();
    expect(el.getValue()).to.equal('15/06/2026');
    expect(clearBtn(el).hidden).to.equal(false);
  });

  it('the trigger click still opens the dialog (the button does not cover it)', async () => {
    const el = mount('clearable mode="date" value="15/06/2026"');
    await frames();
    const t = trigger(el).getBoundingClientRect();
    const b = clearBtn(el).getBoundingClientRect();
    expect(b.right <= t.right + 0.5 && b.left > t.left + t.width / 2).to.equal(true);
    const hit = document.elementFromPoint(t.left + 20, t.top + t.height / 2);
    expect(trigger(el).contains(hit)).to.equal(true);
    expect(clearBtn(el).contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))).to.equal(true);
  });

  it('labels are site-editable (TdDatetimePicker.labels.clear*)', async () => {
    const saved = TdDatetimePicker.labels.clearDate;
    TdDatetimePicker.labels.clearDate = 'Bỏ ngày';
    try {
      const el = mount('clearable mode="date" value="15/06/2026"');
      await frames();
      expect(clearBtn(el).getAttribute('aria-label')).to.equal('Bỏ ngày');
    } finally { TdDatetimePicker.labels.clearDate = saved; }
  });
});
