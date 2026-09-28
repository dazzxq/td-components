import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-dropdown.js';

// v0.17.0 E2 (plan docs/internal/plans/v0.17.0-135-feedback.md): progressive enhancement of a child <select>,
// option-level disabled (incl. <optgroup disabled>), live `.value`, <label for> re-pointing, native reset default,
// <select multiple> left alone.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const optEls = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const activeLabel = (el) => el._menuElement.querySelector('[data-active]')?.textContent ?? null;
const plain = (items) => items.map((i) => ({ ...i }));

const CITY_SELECT = '<select name="city" required>'
  + '<option value="hn" selected>Hà Nội</option><option value="sg">  Sài Gòn  </option><option value="dn">Đà Nẵng</option>'
  + '</select>';

const origWarn = console.warn;
let warnings = [];
beforeEach(() => {
  warnings = [];
  console.warn = (...a) => { warnings.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  document.querySelectorAll('td-dropdown').forEach((d) => d.close && d.close());
  host.innerHTML = '';
});

describe('v0.17.0 E2 — <select> upgrade', () => {
  it('reads options / value / name / required, submits, removes the select', () => {
    const form = mount(`<form><td-dropdown>${CITY_SELECT}</td-dropdown></form>`);
    const el = form.querySelector('td-dropdown');
    expect(form.querySelector('select')).to.equal(null);
    expect(plain(el.options)).to.deep.equal([
      { value: 'hn', label: 'Hà Nội' }, { value: 'sg', label: 'Sài Gòn' }, { value: 'dn', label: 'Đà Nẵng' },
    ]);
    expect(el.getValue()).to.equal('hn');
    expect(el.value).to.equal('hn');
    expect(el.getAttribute('name')).to.equal('city');
    expect(el.hasAttribute('required')).to.equal(true);
    expect(trig(el).getAttribute('aria-required')).to.equal('true');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Hà Nội');
    expect([...new FormData(form).entries()]).to.deep.equal([['city', 'hn']]);
    expect(el.checkValidity()).to.equal(true);
    el.setValue(null);
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    expect([...new FormData(form).entries()]).to.deep.equal([]);
  });

  it('no option selected → first option (native), and reset returns to it', () => {
    const form = mount('<form><td-dropdown><select name="c"><option value="a">A</option><option value="b">B</option></select></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    expect(el.value).to.equal('a');
    el.value = 'b';
    form.reset();
    expect(el.value).to.equal('a');
    expect([...new FormData(form).entries()]).to.deep.equal([['c', 'a']]);
  });

  it('no option selected, first disabled → first ENABLED option (native), also on reset', () => {
    const form = mount('<form><td-dropdown><select name="c"><option value="x" disabled>X</option>'
      + '<option value="a">A</option><option value="b">B</option></select></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    expect(el.value).to.equal('a');
    el.value = 'b';
    form.reset();
    expect(el.value).to.equal('a');
  });

  it('a choice made before the upgrade (live select.value) is kept; reset → the `selected` default', () => {
    const form = document.createElement('form');
    const el = document.createElement('td-dropdown');
    el.innerHTML = CITY_SELECT;
    el.querySelector('select').value = 'sg'; // user change: selectedness, not the `selected` attribute
    form.appendChild(el);
    host.appendChild(form);
    expect(el.value).to.equal('sg');
    expect([...new FormData(form).entries()]).to.deep.equal([['city', 'sg']]);
    form.reset();
    expect(el.value).to.equal('hn');
    expect([...new FormData(form).entries()]).to.deep.equal([['city', 'hn']]);
  });

  it('the last `selected` option is the default (native parse rule)', () => {
    const el = mount('<td-dropdown><select><option value="a" selected>A</option><option value="b" selected>B</option></select></td-dropdown>');
    expect(el.value).to.equal('b');
  });

  it('host `value` attribute wins over the select selection', () => {
    const el = mount(`<td-dropdown value="dn">${CITY_SELECT}</td-dropdown>`);
    expect(el.value).to.equal('dn');
  });

  it('name / disabled / aria-label come from the select only when the host lacks them', () => {
    const a = mount('<td-dropdown><select name="s" disabled aria-label="Tỉnh"><option value="a">A</option></select></td-dropdown>');
    expect(a.getAttribute('name')).to.equal('s');
    expect(a.hasAttribute('disabled')).to.equal(true);
    expect(trig(a).disabled).to.equal(true);
    expect(trig(a).getAttribute('aria-label')).to.equal('Tỉnh');
    const b = mount('<td-dropdown name="host" aria-label="Host"><select name="s" aria-label="Tỉnh"><option value="a">A</option></select></td-dropdown>');
    expect(b.getAttribute('name')).to.equal('host');
    expect(trig(b).getAttribute('aria-label')).to.equal('Host');
  });

  it('<label for="{select id}"> is re-pointed at the component and still names/focuses it', () => {
    const form = mount('<form><label for="city-sel">Thành phố</label>'
      + '<td-dropdown><select id="city-sel" name="city"><option value="hn">Hà Nội</option></select></td-dropdown></form>');
    const label = form.querySelector('label');
    const el = form.querySelector('td-dropdown');
    expect(label.htmlFor).to.equal(el.id);
    expect(el.id).to.not.equal('');
    expect(el.labels.length).to.equal(1);
    expect(label.control === el).to.equal(true);
    expect((trig(el).getAttribute('aria-labelledby') || '').split(' ')).to.include(label.id);
    label.click();
    expect(document.activeElement === trig(el)).to.equal(true);
  });

  it('<optgroup> is flattened (group label dropped); a disabled option or optgroup disables its options', () => {
    const el = mount('<td-dropdown><select>'
      + '<optgroup label="Bắc"><option value="hn">Hà Nội</option><option value="hp">Hải Phòng</option></optgroup>'
      + '<optgroup label="Nam" disabled><option value="sg">Sài Gòn</option></optgroup>'
      + '<option value="dn" disabled>Đà Nẵng</option>'
      + '</select></td-dropdown>');
    expect(plain(el.options)).to.deep.equal([
      { value: 'hn', label: 'Hà Nội' },
      { value: 'hp', label: 'Hải Phòng' },
      { value: 'sg', label: 'Sài Gòn', disabled: true },
      { value: 'dn', label: 'Đà Nẵng', disabled: true },
    ]);
    const labels = optEls(el).map((o) => o.textContent);
    expect(labels).to.not.include('Bắc');
  });

  it('JS `options` assigned before connect win over the select (which is dropped, no double submit)', () => {
    const form = document.createElement('form');
    const el = document.createElement('td-dropdown');
    el.setAttribute('name', 'city');
    el.innerHTML = CITY_SELECT;
    el.options = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }];
    el.setAttribute('value', 'y');
    form.appendChild(el);
    host.appendChild(form);
    expect(plain(el.options)).to.deep.equal([{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]);
    expect(el.value).to.equal('y');
    expect(form.querySelector('select')).to.equal(null);
    expect([...new FormData(form).entries()]).to.deep.equal([['city', 'y']]);
  });

  it('<select multiple> is not upgraded: left native, still submits, console.warn', () => {
    const form = mount('<form><td-dropdown><select name="tags" multiple>'
      + '<option value="a" selected>A</option><option value="b" selected>B</option></select></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    expect(form.querySelector('select')).to.not.equal(null);
    expect(trig(el)).to.equal(null);
    expect(warnings.some((w) => w.includes('multiple'))).to.equal(true);
    expect([...new FormData(form).entries()]).to.deep.equal([['tags', 'a'], ['tags', 'b']]);
    form.reset();
    expect([...new FormData(form).entries()]).to.deep.equal([['tags', 'a'], ['tags', 'b']]);
    // a later re-connect does not upgrade it either
    host.appendChild(el);
    expect(el.querySelector('select')).to.not.equal(null);
    expect(trig(el)).to.equal(null);
  });

  it('reconnect (DOM move) does not re-read anything', () => {
    const el = mount(`<td-dropdown>${CITY_SELECT}</td-dropdown>`);
    el.value = 'dn';
    host.appendChild(el);
    expect(el.value).to.equal('dn');
    expect(el.options.length).to.equal(3);
  });
});

describe('v0.17.0 E2 — disabled options', () => {
  const JS_OPTS = () => [
    { value: 'hn', label: 'Hà Nội' },
    { value: 'sg', label: 'Sài Gòn', disabled: true },
    { value: 'dn', label: 'Đà Nẵng' },
    { value: 'hp', label: 'Hải Phòng', disabled: true },
  ];
  function dd(attrs = 'searchable="false" allow-clear="false"') {
    const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
    el.options = JS_OPTS();
    return el;
  }

  it('render aria-disabled="true" (JS options too), dimmed', () => {
    const el = dd();
    const [hn, sg, , hp] = optEls(el);
    expect(hn.hasAttribute('aria-disabled')).to.equal(false);
    expect(sg.getAttribute('aria-disabled')).to.equal('true');
    expect(hp.getAttribute('aria-disabled')).to.equal('true');
    expect(Number(getComputedStyle(sg).opacity)).to.be.below(1);
    expect(getComputedStyle(sg).cursor).to.equal('not-allowed');
  });

  it('a click on a disabled option does nothing (menu stays open, no change event)', () => {
    const el = dd();
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    el.open();
    optEls(el)[1].click();
    expect(el.value).to.equal(null);
    expect(changes).to.equal(0);
    expect(el._isOpen).to.equal(true);
    optEls(el)[2].click();
    expect(el.value).to.equal('dn');
    expect(changes).to.equal(1);
  });

  it('↑↓ (with wrap), Home/End skip disabled options; Enter never commits one', async () => {
    const el = dd();
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' }); // opens, active = first enabled
    expect(activeLabel(el)).to.equal('Hà Nội');
    await sendKeys({ press: 'ArrowDown' });
    expect(activeLabel(el)).to.equal('Đà Nẵng'); // Sài Gòn skipped
    await sendKeys({ press: 'ArrowDown' });
    expect(activeLabel(el)).to.equal('Hà Nội'); // Hải Phòng skipped, wrapped
    await sendKeys({ press: 'ArrowUp' });
    expect(activeLabel(el)).to.equal('Đà Nẵng');
    await sendKeys({ press: 'End' });
    expect(activeLabel(el)).to.equal('Đà Nẵng');
    await sendKeys({ press: 'Home' });
    expect(activeLabel(el)).to.equal('Hà Nội');
    await sendKeys({ press: 'PageDown' });
    expect(activeLabel(el)).to.equal('Đà Nẵng');
    await sendKeys({ press: 'PageUp' });
    expect(activeLabel(el)).to.equal('Hà Nội');
    await sendKeys({ press: 'Enter' });
    expect(el.value).to.equal('hn');
  });

  it('closed-trigger End opens on the last ENABLED option', async () => {
    const el = dd();
    trig(el).focus();
    await sendKeys({ press: 'End' });
    expect(activeLabel(el)).to.equal('Đà Nẵng');
  });

  it('type-ahead skips disabled options', async () => {
    const el = dd();
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 's' }); // only "Sài Gòn" starts with s — disabled → no match
    expect(activeLabel(el)).to.equal('Hà Nội');
    await new Promise((r) => setTimeout(r, 600));
    await sendKeys({ press: 'h' });
    expect(activeLabel(el)).to.equal('Hà Nội'); // Hải Phòng (disabled) skipped → wraps back
  });

  it('search: the first ENABLED match becomes active', () => {
    const el = dd('allow-clear="false"');
    el.open();
    const input = el._menuElement.querySelector('.td-dropdown__search');
    input.value = 'h';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // "h" matches Hà Nội, Hải Phòng (disabled)… — the active one is enabled
    expect(el._menuElement.querySelector('[data-active]').hasAttribute('aria-disabled')).to.equal(false);
  });

  it('upgraded <select>: disabled option / optgroup are skipped by the keyboard', async () => {
    const el = mount('<td-dropdown searchable="false"><select>'
      + '<option value="a">A</option><optgroup label="G" disabled><option value="b">B</option></optgroup>'
      + '<option value="c" disabled>C</option><option value="d">D</option></select></td-dropdown>');
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(activeLabel(el)).to.equal('A');
    await sendKeys({ press: 'ArrowDown' });
    expect(activeLabel(el)).to.equal('D');
    await sendKeys({ press: 'Enter' });
    expect(el.value).to.equal('d');
  });

  it('setValue() may still select a disabled option programmatically (native parity)', () => {
    const el = dd();
    el.setValue('sg');
    expect(el.value).to.equal('sg');
  });
});

describe('v0.17.0 E2 — live `.value` property', () => {
  const OPTS = () => [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];

  it('reads the current selection (user pick) and sets it without touching the `value` attribute', () => {
    const form = mount('<form><td-dropdown name="p" value="a"></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    el.options = OPTS();
    expect(el.value).to.equal('a');
    el.open();
    optEls(el).find((o) => o.textContent === 'B').click();
    expect(el.value).to.equal('b');
    expect(el.getAttribute('value')).to.equal('a');
    el.value = 'a';
    expect(el.getValue()).to.equal('a');
    el.value = null;
    expect(el.value).to.equal(null);
    el.value = 'b';
    form.reset();
    expect(el.value).to.equal('a'); // the attribute is the reset default
  });

  it('before connect: setting `.value` sets the initial `value` attribute', () => {
    const el = document.createElement('td-dropdown');
    el.value = 'b';
    expect(el.getAttribute('value')).to.equal('b');
    el.options = OPTS();
    host.appendChild(el);
    expect(el.value).to.equal('b');
  });
});
