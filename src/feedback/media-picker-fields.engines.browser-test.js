import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { normalizeFields, normalizeFacets, normalizeError } from '../utils/media-picker-core.js';
import { assetFields } from '../../test/fixtures/media-adapter.js';
import { TdModal } from './td-modal.js';
import {
  createFieldControl, createFacetControl, FieldForm, FIELD_LABELS, _resetFieldWarnings,
} from './media-picker-fields.js';

// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, decisions 18, 21, 22; tests "Sửa" + "Scalar") — the
// descriptor → control factory, facet controls and the metadata form model of <td-media-picker>. Chromium, Firefox AND
// WebKit (web-test-runner group `engines`). DOM nodes are compared as booleans (a failing chai assertion carrying DOM
// nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const tick = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await frame(); await frame(); await frame(); };
const XSS = '<img src=x onerror="window.__tdXss=1">';
const SCALARS = [
  { value: 1, label: 'số 1' }, { value: '1', label: 'chuỗi 1' }, { value: true, label: 'đúng' },
  { value: null, label: 'rỗng' }, { value: false, label: 'sai' },
];
const silent = { warn() {} };

const mountField = (raw, o = {}) => {
  const [d] = normalizeFields([raw], silent);
  const c = createFieldControl(d, { idPrefix: 'tf', warn() {}, ...o });
  host.appendChild(c.el);
  return c;
};
const mountFacet = (raw, o = {}) => {
  const [f] = normalizeFacets([raw], silent);
  const c = createFacetControl(f, { idPrefix: 'tc', ...o });
  host.appendChild(c.el);
  return c;
};
const ddMenu = (dd) => document.getElementById(`${dd.id}-menu`);
async function ddOpen(dd) {
  if (ddMenu(dd)?.hidden !== false) dd.querySelector('.td-dropdown__trigger').click();
  await frame();
  return ddMenu(dd);
}
async function ddPick(dd, label) {
  const menu = await ddOpen(dd);
  const opt = [...menu.querySelectorAll('.td-dropdown__option')].find((o) => o.textContent.trim() === label);
  if (!opt) throw new Error(`no option ${label}`);
  opt.click();
  await tick();
}
async function ddClear(dd) {
  const menu = await ddOpen(dd);
  menu.querySelector('.td-dropdown__option--clear').click();
  await tick();
}
const ddText = (dd) => dd.querySelector('.td-dropdown__value').textContent.trim();
async function chipPick(ci, label) {
  ci.open();
  await tick();
  await tick();
  const menu = document.getElementById(`${ci.id}-menu`);
  const opt = [...menu.querySelectorAll('.td-chip-input__option')]
    .find((o) => o.querySelector('.td-chip-input__option-label')?.textContent.trim() === label);
  if (!opt) throw new Error(`no option ${label}`);
  opt.click();
  await tick();
}
const chipLabels = (ci) => [...ci.querySelectorAll('.td-chip-input__chip-label')].map((s) => s.textContent.trim());
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  _resetFieldWarnings();
  await tick();
});

describe('media-picker-fields — descriptor → control (decision 22)', () => {
  it('the 7 controls render the right component with label / helper / required, no `name` anywhere', async () => {
    const form = new FieldForm(normalizeFields(assetFields(), silent), {
      asset: { id: 'a' }, values: { title: 'T', license: 'licensed', checksum: 'abc123' }, idPrefix: 'ff', warn() {},
    });
    host.appendChild(form.el);
    await tick();
    const c = (k) => form.controls.get(k);
    expect(form.el.classList.contains('td-media-picker__form')).to.equal(true);
    expect(c('title').control.localName).to.equal('td-input-field');
    expect(c('title').control.getAttribute('type')).to.equal('text');
    expect(c('title').control.getAttribute('label')).to.equal('Tiêu đề');
    expect(c('title').control.hasAttribute('required')).to.equal(true);
    expect(c('title').control.getAttribute('helper-text')).to.equal('Hiện trong thư viện.');
    expect(c('caption').control.getAttribute('type')).to.equal('textarea');
    expect(c('caption').control.hasAttribute('autoresize')).to.equal(true);
    expect(c('caption').control.hasAttribute('required')).to.equal(false);
    expect(c('source').control.getAttribute('type')).to.equal('url');
    expect(c('license').control.localName).to.equal('td-dropdown');
    expect(c('licenseExpiry').control.localName).to.equal('td-datetime-picker');
    expect(c('licenseExpiry').control.getAttribute('mode')).to.equal('date');
    expect(c('licenseExpiry').control.hasAttribute('form-value-format')).to.equal(false);
    expect(c('tags').control.localName).to.equal('td-chip-input');
    expect(c('tags').control.hasAttribute('selection-only')).to.equal(true);
    expect(c('checksum').control).to.equal(null);
    expect(c('checksum').el.querySelector('dl dt').textContent).to.equal('Mã kiểm');
    expect(c('checksum').el.querySelector('dl dd').textContent).to.equal('abc123');
    expect(c('checksum').get()).to.equal('abc123');
    for (const [key, f] of form.controls) {
      expect(f.el.classList.contains('td-media-picker__field')).to.equal(true);
      expect(f.el.getAttribute('data-key')).to.equal(key);
      expect(f.el.getAttribute('data-control')).to.equal(f.descriptor.control);
      if (f.control) expect(f.control.id.startsWith('ff-')).to.equal(true);
    }
    expect(form.el.querySelectorAll('[name]').length).to.equal(0);
    const errs = form.el.querySelector('ul.td-media-picker__form-errors');
    expect(!!errs && errs.hidden && errs.getAttribute('role') === 'alert').to.equal(true);
  });

  it('labels, help texts, option labels, readonly values and facet labels are text only (no element created)', async () => {
    let created = 0;
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches('img, script') || n.querySelector('img, script')) created += 1;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const opts = [{ value: 'x', label: XSS }, { value: 'y', label: `b${XSS}` }];
    const raw = ['text', 'textarea', 'url', 'select', 'multiselect', 'date', 'readonly']
      .map((control, i) => ({ key: `k${i}`, label: XSS, helpText: XSS, control, options: opts }));
    const form = new FieldForm(normalizeFields(raw, silent), { values: { k6: XSS, k3: 'x', k4: ['y'] }, idPrefix: 'xs', warn() {} });
    host.appendChild(form.el);
    const single = mountFacet({ key: 'a', label: XSS, type: 'single', options: [{ value: 1, label: XSS, count: 2 }] });
    const multi = mountFacet({ key: 'b', label: XSS, type: 'multiple', options: [{ value: 1, label: XSS }] });
    mountFacet({ key: 'c', label: XSS, type: 'toggle', options: [{ value: 1, label: XSS }] });
    await tick();
    await ddOpen(form.controls.get('k3').control);
    await ddOpen(single.el.querySelector('td-dropdown'));
    multi.el.querySelector('td-chip-input').open();
    form.applyErrors(normalizeError({ code: 'validation', fieldErrors: { k0: [XSS], nope: [XSS] } }, null, silent));
    await tick();
    await tick();
    mo.disconnect();
    expect(created).to.equal(0);
    expect(document.querySelectorAll('img[onerror]').length + host.querySelectorAll('script, img').length).to.equal(0);
    expect(window.__tdXss).to.equal(undefined);
    expect(form.el.textContent.includes('<img src=x')).to.equal(true);
    expect(form.controls.get('k6').el.querySelector('dd').textContent).to.equal(XSS);
  });
});

describe('media-picker-fields — scalar values (R1-6)', () => {
  it('select: every typed option value comes back exactly (Object.is); cleared → null; set() shows the option', async () => {
    let changes = 0;
    const f = mountField({ key: 's', label: 'S', control: 'select', options: SCALARS }, { onChange: () => { changes += 1; } });
    await tick();
    const dd = f.control;
    expect(dd.getAttribute('allow-clear')).to.not.equal('false');
    for (const o of SCALARS) {
      await ddPick(dd, o.label);
      expect(Object.is(f.get(), o.value)).to.equal(true);
    }
    expect(changes).to.equal(SCALARS.length);
    await ddClear(dd);
    expect(f.get()).to.equal(null);
    for (const o of SCALARS) {
      f.set(o.value);
      expect(Object.is(f.get(), o.value)).to.equal(true);
      expect(ddText(dd)).to.equal(o.label);
    }
    f.set(undefined);
    expect(f.get()).to.equal(null);
    expect(changes).to.equal(SCALARS.length + 1); // set() is silent
  });

  it('select required → no clear option (allow-clear="false"); unknown value from metadata is shown as itself', async () => {
    const f = mountField({ key: 's', label: 'S', control: 'select', required: true, options: [{ value: 1, label: 'A' }] });
    await tick();
    expect(f.control.getAttribute('allow-clear')).to.equal('false');
    f.set(42);
    expect(f.get()).to.equal(42);
    expect(ddText(f.control)).to.equal('42');
  });

  it('multiselect: 1 and "1" selectable at once, types kept; set() from metadata scalars', async () => {
    let changes = 0;
    const f = mountField({ key: 'm', label: 'M', control: 'multiselect', options: SCALARS }, { onChange: () => { changes += 1; } });
    await tick();
    await chipPick(f.control, 'số 1');
    await chipPick(f.control, 'chuỗi 1');
    expect(sameList(f.get(), [1, '1'])).to.equal(true);
    expect(changes).to.equal(2);
    f.set([true, null, false]);
    expect(sameList(f.get(), [true, null, false])).to.equal(true);
    expect(chipLabels(f.control)).to.deep.equal(['đúng', 'rỗng', 'sai']);
    f.set([]);
    expect(f.get()).to.deep.equal([]);
    expect(changes).to.equal(2);
  });

  it('createOption: select → `create-label` + create → { value: 2 } selected as the NUMBER 2', async () => {
    const calls = [];
    let changes = 0;
    const f = mountField({
      key: 's', label: 'S', control: 'select', options: [{ value: '2', label: 'chuỗi 2' }],
      createOption: (label, o) => { calls.push([label, o.signal]); return Promise.resolve({ value: 2, label: 'Hai' }); },
    }, { onChange: () => { changes += 1; } });
    await tick();
    expect(f.control.getAttribute('create-label')).to.equal(FIELD_LABELS.create);
    const menu = await ddOpen(f.control);
    const search = menu.querySelector('.td-dropdown__search');
    search.value = 'Hai';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    menu.querySelector('.td-dropdown__option--create').click();
    await tick();
    await tick();
    expect(calls.length).to.equal(1);
    expect(calls[0][0]).to.equal('Hai');
    expect(calls[0][1] instanceof AbortSignal).to.equal(true);
    expect(f.get()).to.equal(2);
    expect(ddText(f.control)).to.equal('Hai');
    expect(changes).to.equal(1);
  });

  it('createOption: multiselect → allow-create + create hook → numeric value added', async () => {
    const f = mountField({
      key: 'm', label: 'M', control: 'multiselect', options: [{ value: 'a', label: 'A' }],
      createOption: (label) => Promise.resolve({ value: 3, label: `${label}!` }),
    });
    await tick();
    expect(f.control.hasAttribute('allow-create')).to.equal(true);
    expect(f.control.hasAttribute('selection-only')).to.equal(false);
    const input = f.control.querySelector('.td-chip-input__input');
    input.focus();
    input.value = 'Ba';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    await tick();
    expect(sameList(f.get(), [3])).to.equal(true);
    expect(chipLabels(f.control)).to.deep.equal(['Ba!']);
  });

  it('createOption rejecting → userMessage on the control (never the raw message), nothing selected', async () => {
    const f = mountField({
      key: 's', label: 'S', control: 'select', options: [],
      createOption: () => Promise.reject(Object.assign(new Error('SQL raw'), { code: 'validation', userMessage: 'Tên trùng' })),
    });
    await tick();
    const menu = await ddOpen(f.control);
    const search = menu.querySelector('.td-dropdown__search');
    search.value = 'X';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    menu.querySelector('.td-dropdown__option--create').click();
    await tick();
    await tick();
    expect(f.get()).to.equal(null);
    expect(f.el.textContent.includes('Tên trùng')).to.equal(true);
    expect(f.el.textContent.includes('SQL raw')).to.equal(false);
  });

  it('loadOptions: called ONCE with "" when created, options appended as tokens; aborted on destroy', async () => {
    const calls = [];
    let resolve;
    const f = mountField({
      key: 's', label: 'S', control: 'select', options: [{ value: 1, label: 'Một' }],
      loadOptions: (q, o) => { calls.push([q, o.signal]); return new Promise((r) => { resolve = r; }); },
    });
    await tick();
    expect(calls.length).to.equal(1);
    expect(calls[0][0]).to.equal('');
    f.set(5); // metadata value not loaded yet → shown as itself, kept
    expect(f.get()).to.equal(5);
    resolve([{ value: 5, label: 'Năm' }, { value: '5', label: 'chuỗi năm' }]);
    await tick();
    expect(f.get()).to.equal(5);
    expect(ddText(f.control)).to.equal('Năm');
    await ddPick(f.control, 'chuỗi năm');
    expect(f.get()).to.equal('5');
    expect(calls.length).to.equal(1);
    expect(calls[0][1].aborted).to.equal(false);
    f.destroy();
    expect(calls[0][1].aborted).to.equal(true);
  });

  it('loadOptions in flight + the given signal aborts → aborted; createOption in flight aborted on destroy', async () => {
    const ac = new AbortController();
    let sig;
    mountField({ key: 's', label: 'S', control: 'select', loadOptions: (q, o) => { sig = o.signal; return new Promise(() => {}); } },
      { signal: ac.signal });
    ac.abort();
    expect(sig.aborted).to.equal(true);
    let csig;
    const f = mountField({
      key: 'm', label: 'M', control: 'multiselect',
      createOption: (l, o) => { csig = o.signal; return new Promise(() => {}); },
    });
    await tick();
    const input = f.control.querySelector('.td-chip-input__input');
    input.value = 'Zz';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(csig.aborted).to.equal(false);
    f.destroy();
    expect(csig.aborted).to.equal(true);
  });

  it('multiselect + loadOptions → search provider (typed values kept, same query signal chain)', async () => {
    const queries = [];
    const f = mountField({
      key: 'm', label: 'M', control: 'multiselect',
      loadOptions: (q) => { queries.push(q); return Promise.resolve([{ value: 7, label: 'Bảy' }, { value: '7', label: 'chuỗi bảy' }]); },
    });
    await tick();
    expect(typeof f.control.search).to.equal('function');
    await chipPick(f.control, 'Bảy');
    await chipPick(f.control, 'chuỗi bảy');
    expect(sameList(f.get(), [7, '7'])).to.equal(true);
    expect(queries.includes('')).to.equal(true);
  });
});

describe('media-picker-fields — date (R2-10)', () => {
  it('set ISO → shows dd/mm/yyyy; user pick → exact YYYY-MM-DD; clear → null; malformed → empty + ONE warning', async () => {
    const warns = [];
    let changes = 0;
    const f = mountField({ key: 'd', label: 'Hết hạn', control: 'date' },
      { warn: (...a) => warns.push(a), onChange: () => { changes += 1; } });
    await tick();
    f.set('2027-03-31');
    expect(f.control.querySelector('.td-dtp__value').textContent.trim()).to.equal('31/03/2027');
    expect(f.get()).to.equal('2027-03-31');
    // user: open, type 15 / 04 / 2027, "Chọn"
    f.control.querySelector('.td-dtp__trigger').click();
    await settle();
    const modal = [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing');
    const put = (part, v) => {
      const inp = modal.querySelector(`.td-dtp-panel__input[data-part="${part}"]`);
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
    put('day', '15');
    put('month', '4');
    put('year', '2027');
    const ok = [...modal.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Chọn');
    ok.click();
    await settle();
    expect(f.get()).to.equal('2027-04-15');
    expect(changes).to.equal(1);
    f.control.setDBValue('2028-01-02');
    expect(f.get()).to.equal('2028-01-02');
    f.set(null);
    expect(f.get()).to.equal(null);
    f.set('2027-03-31');
    f.set('');
    expect(f.get()).to.equal(null);
    f.set('2027-03-31');
    f.set('31/03/2027');
    expect(f.get()).to.equal(null);
    expect(f.control.querySelector('.td-dtp__value').hasAttribute('data-placeholder')).to.equal(true);
    f.set('abc');
    f.set('2027-02-31');
    expect(f.get()).to.equal(null);
    expect(warns.length).to.equal(1);
    expect(changes).to.equal(1);
  });
});

describe('media-picker-fields — facets (decision 18)', () => {
  it('single: dropdown allow-clear, "Tất cả" placeholder, count in the label, typed values, clear → undefined', async () => {
    let changes = 0;
    const f = mountFacet({ key: 'album', label: 'Album', type: 'single', options: [...SCALARS, { value: 9, label: 'Album A', count: 12 }] },
      { onChange: () => { changes += 1; } });
    await tick();
    const dd = f.el.querySelector('td-dropdown');
    expect(f.key).to.equal('album');
    expect(dd.getAttribute('allow-clear')).to.not.equal('false');
    expect(dd.getAttribute('placeholder')).to.equal(FIELD_LABELS.all);
    expect(f.get()).to.equal(undefined);
    await ddPick(dd, 'Album A (12)');
    expect(f.get()).to.equal(9);
    for (const o of SCALARS) {
      await ddPick(dd, o.label);
      expect(Object.is(f.get(), o.value)).to.equal(true);
    }
    await ddClear(dd);
    expect(f.get()).to.equal(undefined);
    expect(changes).to.equal(SCALARS.length + 2);
    f.set('1');
    expect(f.get()).to.equal('1');
    f.set(undefined);
    expect(f.get()).to.equal(undefined);
    expect(changes).to.equal(SCALARS.length + 2);
  });

  it('multiple: chip-input selection-only, 1 and "1" both kept; none → undefined', async () => {
    const f = mountFacet({ key: 't', label: 'Thẻ', type: 'multiple', options: SCALARS });
    await tick();
    const ci = f.el.querySelector('td-chip-input');
    expect(ci.hasAttribute('selection-only')).to.equal(true);
    expect(f.get()).to.equal(undefined);
    await chipPick(ci, 'số 1');
    await chipPick(ci, 'chuỗi 1');
    expect(sameList(f.get(), [1, '1'])).to.equal(true);
    f.set([false, null]);
    expect(sameList(f.get(), [false, null])).to.equal(true);
    f.set(undefined);
    expect(f.get()).to.equal(undefined);
  });

  it('toggle: on = options[0].value ?? true, off = undefined', async () => {
    let changes = 0;
    const f = mountFacet({ key: 'scope', label: 'Chỉ của tôi', type: 'toggle', options: [{ value: 'mine', label: 'Của tôi' }] },
      { onChange: () => { changes += 1; } });
    await tick();
    const tg = f.el.querySelector('td-toggle');
    expect(f.get()).to.equal(undefined);
    tg.querySelector('input').click();
    await tick();
    expect(f.get()).to.equal('mine');
    tg.querySelector('input').click();
    await tick();
    expect(f.get()).to.equal(undefined);
    expect(changes).to.equal(2);
    f.set('mine');
    expect(f.get()).to.equal('mine');
    f.set(undefined);
    expect(f.get()).to.equal(undefined);
    const t2 = mountFacet({ key: 'x', label: 'X', type: 'toggle', options: [] });
    await tick();
    t2.set(true);
    expect(t2.get()).to.equal(true);
    expect(changes).to.equal(2);
  });

  it('setDescriptor reloads options (new counts) and KEEPS the value — even when the refresh omits it (impl review #7)', async () => {
    const f = mountFacet({ key: 'a', label: 'Album', type: 'single', options: [{ value: 1, label: 'A', count: 1 }, { value: 2, label: 'B', count: 3 }] });
    await tick();
    const dd = f.el.querySelector('td-dropdown');
    await ddPick(dd, 'B (3)');
    f.setDescriptor(normalizeFacets([{ key: 'a', label: 'Album', type: 'single', options: [{ value: 2, label: 'B', count: 5 }] }])[0]);
    expect(f.get()).to.equal(2);
    expect(ddText(dd)).to.equal('B (5)');
    f.setDescriptor(normalizeFacets([{ key: 'a', label: 'Album', type: 'single', options: [{ value: 1, label: 'A', count: 0 }] }])[0]);
    expect(f.get()).to.equal(2);

    const m = mountFacet({ key: 't', label: 'T', type: 'multiple', options: [{ value: 1, label: 'X' }, { value: '1', label: 'Y' }] });
    await tick();
    m.set([1, '1']);
    m.setDescriptor(normalizeFacets([{ key: 't', label: 'T', type: 'multiple', options: [{ value: '1', label: 'Y', count: 4 }] }])[0]);
    expect(sameList(m.get(), [1, '1'])).to.equal(true);
  });
});

describe('media-picker-fields — FieldForm (decision 21)', () => {
  const make = (values = {}, o = {}) => {
    const form = new FieldForm(normalizeFields(assetFields(), silent), {
      asset: { id: 'a1' }, values, idPrefix: 'fm', warn() {}, ...o,
    });
    host.appendChild(form.el);
    return form;
  };
  const typeInto = (field, text) => {
    const inp = field.control.querySelector('.td-field__control');
    inp.value = text;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('visibleWhen hides / shows (after each user change); values() = visible fields only', async () => {
    const seen = [];
    const fields = assetFields();
    fields[4].visibleWhen = (values, asset) => { seen.push(asset); return values.license === 'licensed'; };
    let changes = 0;
    const form = new FieldForm(normalizeFields(fields, silent), {
      asset: { id: 'a1' }, values: { title: 'T', license: 'owned', tags: ['hero'] }, idPrefix: 'fm', warn() {},
      onChange: () => { changes += 1; },
    });
    host.appendChild(form.el);
    await tick();
    const exp = form.controls.get('licenseExpiry');
    expect(exp.visible).to.equal(false);
    expect(exp.el.hidden).to.equal(true);
    expect(seen[0].id).to.equal('a1');
    let v = form.values();
    expect(Object.keys(v).sort()).to.deep.equal(['caption', 'license', 'source', 'tags', 'title']);
    expect(v.title).to.equal('T');
    expect(v.tags).to.deep.equal(['hero']);
    await ddPick(form.controls.get('license').control, 'Mua bản quyền');
    expect(changes).to.equal(1);
    expect(exp.visible).to.equal(true);
    v = form.values();
    expect('licenseExpiry' in v).to.equal(true);
    expect(v.licenseExpiry).to.equal(null);
    expect(v.license).to.equal('licensed');
  });

  it('dirty / snapshot / setValues (typed, arrays by content); set / setValues never call onChange', async () => {
    let changes = 0;
    const form = make({ title: 'T', tags: ['hero'], license: 'owned' }, { onChange: () => { changes += 1; } });
    await tick();
    expect(form.dirty).to.equal(false);
    typeInto(form.controls.get('title'), 'T2');
    expect(changes).to.equal(1);
    expect(form.dirty).to.equal(true);
    form.snapshot();
    expect(form.dirty).to.equal(false);
    form.setValues({ title: 'T2', tags: ['hero'], license: 'owned' });
    expect(form.dirty).to.equal(false);
    form.setValues({ title: 'T2', tags: ['hero', 'banner'], license: 'owned' });
    expect(form.dirty).to.equal(true);
    expect(form.values().tags).to.deep.equal(['hero', 'banner']);
    form.setValues({ title: 'T2', tags: ['hero'], license: 'owned' });
    expect(form.dirty).to.equal(false);
    form.setValues({ title: 'T2', tags: ['hero'], license: 'licensed', licenseExpiry: '2027-03-31' });
    expect(form.controls.get('licenseExpiry').visible).to.equal(true);
    expect(form.values().licenseExpiry).to.equal('2027-03-31');
    expect(changes).to.equal(1);
  });

  it('applyErrors: known visible key → aria-invalid + note; unknown / hidden → general list (text); focus first', async () => {
    const form = make({ title: 'T', license: 'owned' });
    await tick();
    const n = normalizeError({
      code: 'validation',
      fieldErrors: { license: ['Sai giấy phép', 'Hết hạn'], unknown: ['Lạ <b>x</b>'], licenseExpiry: ['Ẩn'], caption: ['Dài quá'] },
    }, null, silent);
    const first = form.applyErrors(n);
    await tick();
    expect(first === form.controls.get('caption')).to.equal(true); // descriptor order: caption before license
    const capInput = form.controls.get('caption').control.querySelector('.td-field__control');
    expect(document.activeElement === capInput).to.equal(true);
    expect(capInput.getAttribute('aria-invalid')).to.equal('true');
    const trig = form.controls.get('license').control.querySelector('.td-dropdown__trigger');
    expect(trig.getAttribute('aria-invalid')).to.equal('true');
    expect(form.controls.get('license').el.querySelector('.td-field-error').textContent).to.equal('Sai giấy phép Hết hạn');
    const list = form.el.querySelector('.td-media-picker__form-errors');
    expect(list.hidden).to.equal(false);
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).to.deep.equal(['Lạ <b>x</b>', 'Ẩn']);
    expect(list.querySelector('b')).to.equal(null);
    form.clearErrors();
    expect(trig.hasAttribute('aria-invalid')).to.equal(false);
    expect(list.hidden).to.equal(true);
    expect(list.children.length).to.equal(0);
    expect(form.applyErrors(normalizeError({ code: 'validation', fieldErrors: { zzz: ['x'] } }, null, silent))).to.equal(null);
  });

  it('missingRequired: visible required field with "" / null / [] → true; hidden required ignored', async () => {
    const raw = [
      { key: 'a', label: 'A', control: 'text', required: true },
      { key: 'b', label: 'B', control: 'multiselect', required: true, options: [{ value: 1, label: 'x' }], visibleWhen: (v) => v.a === 'show' },
    ];
    const form = new FieldForm(normalizeFields(raw, silent), { values: {}, idPrefix: 'mr', warn() {} });
    host.appendChild(form.el);
    await tick();
    expect(form.missingRequired()).to.equal(true);
    form.setValues({ a: 'x' });
    expect(form.missingRequired()).to.equal(false);
    form.setValues({ a: 'show' });
    expect(form.missingRequired()).to.equal(true);
    form.setValues({ a: 'show', b: [1] });
    expect(form.missingRequired()).to.equal(false);
  });

  it('setDisabled / setVisible / destroy', async () => {
    const form = make({ title: 'T' });
    await tick();
    form.setDisabled(true);
    expect(form.controls.get('title').control.hasAttribute('disabled')).to.equal(true);
    expect(form.controls.get('license').control.hasAttribute('disabled')).to.equal(true);
    form.setDisabled(false);
    expect(form.controls.get('title').control.hasAttribute('disabled')).to.equal(false);
    const t = form.controls.get('title');
    t.setVisible(false);
    expect(t.el.hidden).to.equal(true);
    expect('title' in form.values()).to.equal(false);
    form.destroy();
  });

  it('Ctrl+Enter inside any control reaches form.el (bubble) and does not open a menu / date dialog', async () => {
    const form = make({ title: 'T', license: 'licensed' });
    await tick();
    let hits = 0;
    form.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) hits += 1;
    });
    const dd = form.controls.get('license').control;
    const targets = [
      form.controls.get('title').control.querySelector('.td-field__control'),
      form.controls.get('caption').control.querySelector('.td-field__control'),
      dd.querySelector('.td-dropdown__trigger'),
      form.controls.get('licenseExpiry').control.querySelector('.td-dtp__trigger'),
      form.controls.get('tags').control.querySelector('.td-chip-input__input'),
    ];
    for (const t of targets) {
      t.focus();
      await sendKeys({ press: 'Control+Enter' });
      await settle();
    }
    expect(hits).to.equal(targets.length);
    expect(ddMenu(dd) ? ddMenu(dd).hidden : true).to.equal(true);
    expect([...document.querySelectorAll('.td-modal')].filter((m) => m.getAttribute('data-state') !== 'closing').length).to.equal(0);
    expect(form.controls.get('caption').get()).to.equal('');
  });
});

describe('media-picker-fields — review SEC-3 bounds', () => {
  it('loadOptions results are capped at 200 options, labels at 500', async () => {
    const f = mountField({ key: 'big', label: 'Big', control: 'select',
      loadOptions: async () => Array.from({ length: 250 }, (_, i) => ({ value: i, label: `${'x'.repeat(600)}${i}` })) });
    for (let i = 0; i < 20; i++) await tick();
    const opts = f.control.options || [];
    expect(opts.length).to.equal(200);
    expect(opts.every((o) => [...o.label].length <= 500)).to.equal(true);
  });
});

describe('media-picker-fields — review SEC-3 r2: oversized values are never assigned or saved', () => {
  it('text > 10 000, url > 2 048, multiselect > 200 items → field locked with the kit message, not in values() / dirty', async () => {
    const descriptors = normalizeFields([
      { key: 'title', label: 'Tiêu đề', control: 'text' },
      { key: 'caption', label: 'Chú thích', control: 'textarea' },
      { key: 'source', label: 'Nguồn', control: 'url' },
      { key: 'tags', label: 'Thẻ', control: 'multiselect', options: [{ value: 'a', label: 'A' }] },
    ], silent);
    const big = 'x'.repeat(10001);
    const form = new FieldForm(descriptors, {
      values: { title: big, caption: 'ok', source: `https://x.test/${'a'.repeat(3000)}`, tags: Array.from({ length: 201 }, (_, i) => `t${i}`) },
      warn() {},
    });
    host.appendChild(form.el);
    await tick();
    expect(Object.keys(form.values())).to.deep.equal(['caption']);
    expect(form.dirty).to.equal(false);
    for (const k of ['title', 'source', 'tags']) {
      const c = form.controls.get(k);
      expect(c.control.hasAttribute('disabled'), `${k} locked`).to.equal(true);
      expect(c.el.textContent.includes(FIELD_LABELS.tooLarge), `${k} message`).to.equal(true);
    }
    const input = form.controls.get('title').control.querySelector('input');
    expect(input.value.length).to.equal(0);
    form.setDisabled(false); // a form-wide enable never unlocks a locked field
    expect(form.controls.get('title').control.hasAttribute('disabled')).to.equal(true);
    form.setValues({ title: 'ngắn', caption: 'ok', source: 'https://x.test/a', tags: ['a'] });
    expect(form.controls.get('title').control.hasAttribute('disabled')).to.equal(false);
    expect(Object.keys(form.values()).sort()).to.deep.equal(['caption', 'source', 'tags', 'title']);
  });
});

describe('media-picker-fields — review SEC-3 r3: readonly accepts scalars only, never serialised', () => {
  it('objects / arrays / nested / inherited-enumerable values → locked with tooLarge, no JSON.stringify of adapter data, fast', async () => {
    const huge = { payload: 'x'.repeat(5e6) };
    const deep = {};
    let cur = deep;
    for (let i = 0; i < 5000; i++) { cur.n = {}; cur = cur.n; }
    const inherited = Object.create({ big: 'y'.repeat(1e6) });
    const values = {
      r1: huge,
      r2: Array.from({ length: 200 }, () => 'z'.repeat(10000)),
      r3: deep,
      r4: inherited,
      r5: 'w'.repeat(10001),
      r6: Number.NaN,
      ok1: 'ngắn', ok2: 42, ok3: true, ok4: null,
    };
    const descriptors = normalizeFields(Object.keys(values).map((key) => ({ key, label: key, control: 'readonly' })), silent);
    const realStringify = JSON.stringify;
    const seen = new Set([huge, values.r2, deep, inherited]);
    let leaked = 0;
    JSON.stringify = function (v, ...rest) {
      if (seen.has(v)) leaked += 1;
      return realStringify.call(this, v, ...rest);
    };
    let form;
    const t0 = performance.now();
    try {
      form = new FieldForm(descriptors, { values, warn() {} });
    } finally {
      JSON.stringify = realStringify;
    }
    const ms = performance.now() - t0;
    host.appendChild(form.el);
    expect(leaked, 'JSON.stringify on adapter values').to.equal(0);
    expect(ms < 500, `${ms} ms`).to.equal(true);
    const text = (k) => form.controls.get(k).el.querySelector('.td-media-picker__readonly-value').textContent;
    for (const k of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
      expect(text(k), k).to.equal('');
      expect(form.controls.get(k).el.textContent.includes(FIELD_LABELS.tooLarge), `${k} message`).to.equal(true);
    }
    expect(text('ok1')).to.equal('ngắn');
    expect(text('ok2')).to.equal('42');
    expect(text('ok3')).to.equal('true');
    expect(text('ok4')).to.equal('');
  });

  it('a readonly control set directly with a non-scalar shows nothing (no serialisation)', () => {
    const f = mountField({ key: 'r', label: 'R', control: 'readonly' });
    f.set({ a: 'x'.repeat(1000) });
    expect(f.el.querySelector('.td-media-picker__readonly-value').textContent).to.equal('');
    f.set(['a', 'b']);
    expect(f.el.querySelector('.td-media-picker__readonly-value').textContent).to.equal('');
    f.set('v');
    expect(f.el.querySelector('.td-media-picker__readonly-value').textContent).to.equal('v');
  });
});

describe('media-picker-fields — impl review round 1', () => {
  it('#6 select: a valid "" option round-trips as "" (not null)', async () => {
    const f = mountField({ key: 's', label: 'S', control: 'select', options: [{ value: '', label: 'Trống' }, { value: 'a', label: 'A' }] });
    await tick();
    f.set('');
    expect(f.get()).to.equal('');
    f.set('a');
    await ddPick(f.control, 'Trống');
    expect(f.get()).to.equal('');
  });

  it('#7 facet refresh omitting the selected value keeps the typed value, token and label (single + multiple)', async () => {
    const single = mountFacet({ key: 'a', label: 'A', type: 'single', options: [{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }] });
    await tick();
    single.set(2);
    single.setDescriptor(normalizeFacets([{ key: 'a', label: 'A', type: 'single', options: [{ value: 1, label: 'Một' }] }], silent)[0]);
    await tick();
    expect(Object.is(single.get(), 2)).to.equal(true);
    expect(ddText(single.el.querySelector('td-dropdown'))).to.equal('Hai');
    const multi = mountFacet({ key: 'b', label: 'B', type: 'multiple', options: [{ value: 1, label: 'Một' }, { value: '2', label: 'Hai' }] });
    await tick();
    multi.set([1, '2']);
    multi.setDescriptor(normalizeFacets([{ key: 'b', label: 'B', type: 'multiple', options: [{ value: 1, label: 'Một' }] }], silent)[0]);
    await tick();
    expect(sameList(multi.get(), [1, '2'])).to.equal(true);
    expect(chipLabels(multi.el.querySelector('td-chip-input'))).to.deep.equal(['Một', 'Hai']);
  });

  it('#8 facet control exposes its type (the picker replaces a control whose type changed)', () => {
    const t = mountFacet({ key: 'c', label: 'C', type: 'toggle', options: [] });
    expect(t.type).to.equal('toggle');
  });
});
