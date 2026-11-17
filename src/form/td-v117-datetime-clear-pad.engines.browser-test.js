import { expect } from '@esm-bundle/chai';
import { TdDatetimePicker } from './td-datetime-picker.js';

// v0.117.0 (plan v0.117.0-dcms2-create-row-minsize QĐ2) — a clearable, non-editable picker gives the reserved
// clear-button width back (14px inline-end) while the button is hidden. Chromium, Firefox AND WebKit.
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
afterEach(() => { host.innerHTML = ''; });
function mount(attrs) {
  host.innerHTML = `<form><td-datetime-picker name="d" mode="date" label="Ngày" ${attrs}></td-datetime-picker></form>`;
  return host.querySelector('td-datetime-picker');
}
const trigger = (el) => el.querySelector('.td-dtp__trigger');
const clear = (el) => el.querySelector('.td-dtp__clear');
const padEnd = (el) => parseFloat(getComputedStyle(trigger(el)).paddingInlineEnd);
const reserved = () => parseFloat(getComputedStyle(host.querySelector('.td-dtp')).getPropertyValue('--_td-dtp-clear-w')) * 16 + 1;

describe('v0.117.0 td-datetime-picker clearable padding', () => {
  it('has :has() support in this engine (the rule under test needs it)', () => {
    expect(CSS.supports('selector(:has(a))')).to.equal(true);
    expect(TdDatetimePicker).to.be.a('function');
  });

  it('non-editable clearable: 14px while the clear button is hidden, reserved width while it shows', async () => {
    const el = mount('clearable');
    await frames();
    expect(clear(el).hidden).to.equal(true);
    expect(padEnd(el)).to.equal(14);
    el.setValue('15/06/2026');
    await frames();
    expect(clear(el).hidden).to.equal(false);
    expect(padEnd(el)).to.equal(reserved());
  });

  it('value -> clear -> reset transitions', async () => {
    const el = mount('clearable value="15/06/2026"');
    await frames();
    expect(padEnd(el)).to.equal(reserved());
    clear(el).click();
    await frames();
    expect(clear(el).hidden).to.equal(true);
    expect(padEnd(el)).to.equal(14);
    el.closest('form').reset();
    await frames();
    expect(clear(el).hidden).to.equal(false);
    expect(padEnd(el)).to.equal(reserved());
  });

  it('required / disabled keep the button hidden, so 14px', async () => {
    const a = mount('clearable required value="15/06/2026"');
    await frames();
    expect(clear(a).hidden).to.equal(true);
    expect(padEnd(a)).to.equal(14);
    const b = mount('clearable disabled value="15/06/2026"');
    await frames();
    expect(clear(b).hidden).to.equal(true);
    expect(padEnd(b)).to.equal(14);
  });

  it('non-clearable and editable clearable stay as before (14px hidden, editable shows the button)', async () => {
    const plain = mount('value="15/06/2026"');
    await frames();
    expect(padEnd(plain)).to.equal(14);
    const ed = mount('editable clearable');
    await frames();
    expect(clear(ed).hidden).to.equal(true);
    expect(padEnd(ed)).to.equal(14);
    ed.setValue('15/06/2026');
    await frames();
    expect(clear(ed).hidden).to.equal(false);
  });
});
