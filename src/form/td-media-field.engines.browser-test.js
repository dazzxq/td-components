import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaField } from './td-media-field.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.32.0 (plan v0.32.0-media-picker decisions 23-28, M4, Test section) — <td-media-field> behaviour in Chromium,
// Firefox and WebKit (web-test-runner group `engines`). The picker is STUBBED (TdMediaPicker.open replaced by a
// controllable deferred): the field's contract with it is the options it passes + the outcome it applies.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
/** @type {Array<{ opts: any, resolve: (o: any) => void, reject: (e: any) => void }>} */
let opens = [];
const stubOpen = (opts) => new Promise((resolve, reject) => { opens.push({ opts, resolve, reject }); });

const warns = [];
const realWarn = console.warn;

const ad = createMockAdapter();
const asset = (id) => JSON.parse(JSON.stringify(ad.db.get(id)));
const picked = (id, altText) => ({
  status: 'selected',
  selection: [{ assetId: id, asset: asset(id), usage: { altText: altText ?? asset(id).defaultAltText, crop: null, focalPoint: null } }],
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const box = document.createElement('div');
box.style.width = '360px'; // test page only (the component never writes style)
document.body.appendChild(box);

/** A form with one field built from `attrs` (+ an adapter unless `adapter: null`). */
function mk(attrs = {}, { adapter = ad, html = '' } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.innerHTML = html;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el };
}
const q = (el, sel) => el.querySelector(sel);
const openBtn = (el) => q(el, '.td-media-field__open');
const counter = (el) => {
  const c = { input: 0, change: 0, details: [] };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); c.nativeInput = !(e instanceof CustomEvent) || e.target !== el; });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); c.nativeChange = !(e instanceof CustomEvent) || e.target !== el; });
  return c;
};
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);

beforeEach(() => {
  opens = [];
  warns.length = 0;
  TdMediaPicker.open = stubOpen;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  TdMediaPicker.open = realOpen;
  console.warn = realWarn;
  box.replaceChildren();
});

describe('td-media-field — picker flow', () => {
  it('double click / click while waiting → open() exactly once; open again after it settles', async () => {
    const { el } = mk({ name: 'hero', label: 'Ảnh đại diện', 'aspect-ratio': '3/2' });
    openBtn(el).click();
    openBtn(el).click();
    q(el, '.td-media-field__replace').click();
    expect(opens.length).to.equal(1);
    opens[0].resolve({ status: 'cancelled', reason: 'close', selection: [] });
    await tick();
    openBtn(el).click();
    expect(opens.length).to.equal(2);
  });

  it('passes single selection, initialIds, kinds, title = label, the field adapter; pickerOptions win over the adapter', async () => {
    const other = createMockAdapter();
    const { el } = mk({ name: 'hero', label: 'Ảnh <b>bìa</b>', 'accept-kind': 'image, video' });
    el.pickerOptions = { adapter: other, pageSize: 12, title: 'ignored', selection: { mode: 'multiple' } };
    openBtn(el).click();
    const o = opens[0].opts;
    expect(o.adapter === other).to.equal(true);
    expect(o.pageSize).to.equal(12);
    expect(o.title).to.equal('Ảnh <b>bìa</b>');
    expect(o.selection).to.deep.equal({ mode: 'single', initialIds: [], kinds: ['image', 'video'] });
    opens[0].resolve(picked('m3'));
    await tick();
    el.pickerOptions = null;
    q(el, '.td-media-field__replace').click();
    expect(opens[1].opts.adapter === ad).to.equal(true);
    expect(opens[1].opts.selection.initialIds).to.deep.equal(['m3']);
  });

  it('selected → value, preview, alt; input + change exactly once each (detail { value, selection })', async () => {
    const { el, form } = mk({ name: 'hero', usage: true, 'aspect-ratio': '3/2' });
    const c = counter(el);
    openBtn(el).click();
    opens[0].resolve(picked('m2', 'Một con mèo'));
    await tick();
    expect(el.value).to.equal('m2');
    const img = q(el, 'img.td-media-field__img');
    expect(!!img).to.equal(true);
    expect(img.getAttribute('src')).to.equal(new URL(asset('m2').urls.preview, document.baseURI).href);
    expect(img.getAttribute('alt')).to.equal('');
    expect(img.getAttribute('referrerpolicy')).to.equal('no-referrer');
    expect(q(el, '.td-media-field__frame').dataset.state).to.equal('filled');
    expect(q(el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m2').name}`);
    expect(q(el, '.td-media-field__actions').hidden).to.equal(false);
    expect(q(el, '.td-media-field__alt').value).to.equal('Một con mèo');
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
    expect(c.details[1].value).to.equal('m2');
    expect(c.details[1].selection[0].assetId).to.equal('m2');
    expect(c.details[1].selection[0].usage.altText).to.equal('Một con mèo');
    expect(fd(form)).to.deep.equal([['hero[id]', 'm2'], ['hero[alt]', 'Một con mèo'], ['hero[crop]', 'null']]);
  });

  it('cancelled → nothing changes, no event', async () => {
    const { el, form } = mk({ name: 'hero', value: 'm1', 'preview-src': '/test/fixtures/1.svg', 'preview-alt': 'Ảnh 1' });
    const c = counter(el);
    openBtn(el).click();
    expect(opens[0].opts.selection.initialIds).to.deep.equal(['m1']);
    opens[0].resolve({ status: 'cancelled', reason: 'escape', selection: [] });
    await tick();
    expect(el.value).to.equal('m1');
    expect(c.input + c.change).to.equal(0);
    expect(fd(form)).to.deep.equal([['hero', 'm1']]);
  });

  it('the same id → preview refreshed, no event', async () => {
    const { el } = mk({ name: 'hero', value: 'm1', 'preview-alt': 'cũ' });
    const c = counter(el);
    q(el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m1'));
    await tick();
    expect(c.input + c.change).to.equal(0);
    expect(q(el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m1').name}`);
    expect(!!q(el, 'img.td-media-field__img')).to.equal(true);
  });

  it('"Gỡ" → value "", alt "", crop null, input + change, focus on the open button', async () => {
    const crop = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
    const { el, form } = mk({ name: 'hero', usage: true, value: 'm1', alt: 'mô tả', crop, 'preview-src': '/test/fixtures/1.svg' });
    const c = counter(el);
    q(el, '.td-media-field__remove').focus();
    q(el, '.td-media-field__remove').click();
    expect(el.value).to.equal('');
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
    expect(document.activeElement === openBtn(el)).to.equal(true);
    expect(q(el, '.td-media-field__actions').hidden).to.equal(true);
    expect(q(el, '.td-media-field__frame').dataset.state).to.equal('empty');
    expect(fd(form)).to.deep.equal([['hero[id]', ''], ['hero[alt]', ''], ['hero[crop]', 'null']]);
  });

  it('the field left the page while the picker was open → the result is dropped', async () => {
    const { el } = mk({ name: 'hero' });
    const c = counter(el);
    openBtn(el).click();
    el.remove();
    opens[0].resolve(picked('m4'));
    await tick();
    expect(el.value).to.equal('');
    expect(c.input + c.change).to.equal(0);
  });

  it('no adapter anywhere → one warning, the picker does not open', () => {
    const { el } = mk({ name: 'hero' }, { adapter: null });
    openBtn(el).click();
    openBtn(el).click();
    expect(opens.length).to.equal(0);
    expect(warns.filter((w) => w.includes('no media adapter')).length).to.equal(1);
  });

  it('TdMediaPicker.configureDefaults({ adapter }) is enough (adapter resolved at open)', async () => {
    const before = TdMediaPicker.defaults;
    TdMediaPicker.configureDefaults({ adapter: ad });
    try {
      const { el } = mk({ name: 'hero' }, { adapter: null });
      openBtn(el).click();
      expect(opens.length).to.equal(1);
      expect('adapter' in opens[0].opts).to.equal(false); // open() merges the defaults underneath
    } finally {
      TdMediaPicker.configureDefaults(before);
    }
  });
});

describe('td-media-field — form value', () => {
  it('reference: name=assetId, empty → name=""', async () => {
    const { el, form } = mk({ name: 'hero' });
    expect(fd(form)).to.deep.equal([['hero', '']]);
    el.value = 'm7';
    expect(fd(form)).to.deep.equal([['hero', 'm7']]);
  });

  it('usage: three entries, crop byte-identical to the attribute; a new asset → crop null', async () => {
    const crop = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
    const { el, form } = mk({ name: 'hero', usage: true, value: 'm1', alt: 'A', crop, 'preview-src': '/test/fixtures/1.svg' });
    expect(fd(form)).to.deep.equal([['hero[id]', 'm1'], ['hero[alt]', 'A'], ['hero[crop]', crop]]);
    expect(el.selection[0].usage.crop).to.deep.equal({ normalized: { x: 0.1, y: 0, width: 0.5, height: 1 } });
    q(el, '.td-media-field__replace').click();
    opens[0].resolve(picked('m2', 'B'));
    await tick();
    expect(fd(form)).to.deep.equal([['hero[id]', 'm2'], ['hero[alt]', 'B'], ['hero[crop]', 'null']]);
  });

  it('invalid crop attribute → null + one warning', () => {
    const { form } = mk({ name: 'h', usage: true, value: 'm1', crop: '{"v":1,"x":0.6,"y":0,"width":0.5,"height":0.5}' });
    expect(fd(form)).to.deep.equal([['h[id]', 'm1'], ['h[alt]', ''], ['h[crop]', 'null']]);
    expect(warns.filter((w) => w.includes('crop')).length).to.equal(1);
  });

  it('usage + name="x[]" → nothing submitted + one warning (fail closed)', () => {
    const { el, form } = mk({ name: 'x[]', usage: true, value: 'm1' });
    expect(fd(form)).to.deep.equal([]);
    el.setAttribute('alt', 'b');
    expect(warns.filter((w) => w.includes('x[]')).length).to.equal(1);
    const ref = mk({ name: 'y[]', value: 'm1' });
    expect(fd(ref.form)).to.deep.equal([['y[]', 'm1']]); // reference mode is fine with []
  });

  it('form reset → the defaults captured from the attributes, no event', async () => {
    const { el, form } = mk({ name: 'hero', usage: true, value: 'm1', alt: 'gốc', 'preview-src': '/test/fixtures/1.svg', 'preview-alt': 'Ảnh 1' });
    openBtn(el).click();
    opens[0].resolve(picked('m3', 'mới'));
    await tick();
    const c = counter(el);
    form.reset();
    expect(el.value).to.equal('m1');
    expect(q(el, '.td-media-field__alt').value).to.equal('gốc');
    expect(q(el, 'img').getAttribute('src')).to.equal('/test/fixtures/1.svg');
    expect(q(el, '.td-sr-only').textContent).to.equal('Đã chọn: Ảnh 1');
    expect(c.input + c.change).to.equal(0);
    expect(fd(form)).to.deep.equal([['hero[id]', 'm1'], ['hero[alt]', 'gốc'], ['hero[crop]', 'null']]);
  });

  it('review SEC-1: the restore state holds only v / id / alt / crop — no preview URL, no server label', async () => {
    const states = [];
    const real = ElementInternals.prototype.setFormValue;
    ElementInternals.prototype.setFormValue = function (v, st) { states.push(st); return real.call(this, v, st); };
    try {
      const { el } = mk({ name: 'hero', usage: true, value: 'm1', 'preview-src': '/test/fixtures/1.svg?token=SECRET', 'preview-alt': 'Tên server SECRET' });
      openBtn(el).click();
      opens[0].resolve(picked('m3'));
      await tick();
    } finally {
      ElementInternals.prototype.setFormValue = real;
    }
    const strings = states.filter((x) => typeof x === 'string');
    expect(strings.length > 0).to.equal(true);
    for (const st of strings) {
      expect(Object.keys(JSON.parse(st)).sort()).to.deep.equal(['alt', 'crop', 'id', 'v']);
      expect(st.includes('SECRET') || st.includes('fixtures') || st.includes('anh-3')).to.equal(false);
    }
  });

  it('review SEC-1: restore → preview empty, then adapter.get(id) (latest wins); v:2 / garbage ignored', async () => {
    const a = createMockAdapter();
    const { el, form } = mk({ name: 'hero', usage: true }, { adapter: a });
    const state = (o) => JSON.stringify({ v: 1, id: 'm9', alt: 'khôi phục', crop: null, ...o });
    el.formStateRestoreCallback(state({ preview: { src: '/test/fixtures/2.svg', alt: 'giả', kind: 'image' } }), 'restore');
    expect(el.value).to.equal('m9');
    expect(!!q(el, 'img'), 'no preview from the state').to.equal(false);
    expect(fd(form)).to.deep.equal([['hero[id]', 'm9'], ['hero[alt]', 'khôi phục'], ['hero[crop]', 'null']]);
    el.formStateRestoreCallback(state({ id: 'm10' }), 'restore');
    expect(a.calls.get.map((c) => c.args[0])).to.deep.equal(['m9', 'm10']);
    expect(a.calls.get[0].signal.aborted).to.equal(true);
    for (let i = 0; i < 50 && !q(el, 'img'); i++) await tick();
    expect(q(el, 'img').getAttribute('src')).to.equal(new URL(a.db.get('m10').urls.preview, document.baseURI).href);
    el.formStateRestoreCallback(state({ v: 2, id: 'zz' }), 'restore');
    el.formStateRestoreCallback('{oops', 'restore');
    expect(el.value).to.equal('m10');
  });

  it('review SEC-1: restore without any adapter → no crash, preview empty; resolved once configureDefaults provides one', async () => {
    const a = createMockAdapter();
    const { el } = mk({ name: 'hero' }, { adapter: null });
    el.formStateRestoreCallback(JSON.stringify({ v: 1, id: 'm12', alt: '', crop: null }), 'restore');
    expect(el.value).to.equal('m12');
    expect(!!q(el, 'img')).to.equal(false);
    TdMediaPicker.configureDefaults({ adapter: a });
    try {
      expect(a.calls.get.map((c) => c.args[0])).to.deep.equal(['m12']);
      for (let i = 0; i < 50 && !q(el, 'img'); i++) await tick();
      expect(!!q(el, 'img')).to.equal(true);
    } finally {
      TdMediaPicker.configureDefaults({});
    }
  });

  it('review SEC-1 r2: a pending default adapter A is invalidated by configureDefaults({ adapter: B, context }) — B wins, A (ignoring its signal) never applies', async () => {
    const A = createMockAdapter({ manual: true, base: '/a/' });
    A.ignoreSignal = true;
    const B = createMockAdapter({ manual: true, base: '/b/' });
    TdMediaPicker.configureDefaults({ adapter: A, context: 'A' });
    try {
      const { el } = mk({ name: 'hero' }, { adapter: null });
      el.value = 'm1';
      expect(A.calls.get.length).to.equal(1);
      TdMediaPicker.configureDefaults({ adapter: B, context: 'B' });
      expect(A.calls.get[0].signal.aborted, 'A aborted').to.equal(true);
      expect(B.calls.get.length).to.equal(1);
      expect(B.calls.get[0].args[1].context).to.equal('B');
      A.calls.get[0].resolve();
      for (let i = 0; i < 10; i++) await tick();
      expect(!!q(el, 'img'), 'A never populates').to.equal(false);
      B.calls.get[0].resolve();
      for (let i = 0; i < 50 && !q(el, 'img'); i++) await tick();
      expect(q(el, 'img').getAttribute('src').includes('/b/')).to.equal(true);
    } finally {
      TdMediaPicker.configureDefaults({});
    }
  });

  it('review SEC-1 r2: pending explicit adapter removed with no fallback → aborted, its late result ignored (also for pickerOptions)', async () => {
    const A = createMockAdapter({ manual: true });
    A.ignoreSignal = true;
    const { el } = mk({ name: 'hero' }, { adapter: A });
    el.value = 'm1';
    expect(A.calls.get.length).to.equal(1);
    el.adapter = null;
    expect(A.calls.get[0].signal.aborted).to.equal(true);
    A.calls.get[0].resolve();
    for (let i = 0; i < 10; i++) await tick();
    expect(!!q(el, 'img')).to.equal(false);
    const P = createMockAdapter({ manual: true });
    P.ignoreSignal = true;
    el.pickerOptions = { adapter: P, context: 'p' };
    expect(P.calls.get.length).to.equal(1);
    expect(P.calls.get[0].args[1].context).to.equal('p');
    el.pickerOptions = null;
    expect(P.calls.get[0].signal.aborted).to.equal(true);
    P.calls.get[0].resolve();
    for (let i = 0; i < 10; i++) await tick();
    expect(!!q(el, 'img')).to.equal(false);
  });

  it('review SEC-2: a failing lazy get never logs the raw error', async () => {
    const SECRET = 'tok_FIELD_SECRET';
    const a = createMockAdapter();
    a.get = () => Promise.reject(Object.assign(new Error(`get ${SECRET}`), { code: 'server', url: `https://x/?t=${SECRET}` }));
    const errs = [];
    const realErr = console.error;
    console.error = (...x) => errs.push(x.map(String).join(' '));
    try {
      const { el } = mk({ name: 'hero' }, { adapter: a });
      el.value = 'm1';
      for (let i = 0; i < 10; i++) await tick();
    } finally {
      console.error = realErr;
    }
    expect([...warns, ...errs].some((w) => w.includes(SECRET))).to.equal(false);
  });

  it('required → valueMissing + message; error contract on the open button', () => {
    const { el } = mk({ name: 'hero', required: true, label: 'Ảnh' });
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal('Vui lòng chọn ảnh.');
    expect(q(el, '.td-field__required').textContent).to.equal(' *');
    el.setError('Thiếu ảnh');
    expect(openBtn(el).getAttribute('aria-invalid')).to.equal('true');
    expect(q(el, '.td-field-error').textContent).to.equal('Thiếu ảnh');
    expect(openBtn(el).getAttribute('aria-describedby')).to.equal(`${el.id}-error`);
    el.value = 'm1';
    expect(el.checkValidity()).to.equal(true);
    el.clearError();
    expect(openBtn(el).hasAttribute('aria-invalid')).to.equal(false);
    expect(!!q(el, '.td-field-error')).to.equal(false);
  });

  it('error-text + helper-text: describedby "help error", note after the help', () => {
    const { el } = mk({ name: 'hero', 'helper-text': 'JPG, PNG', 'error-text': 'Sai' });
    expect(openBtn(el).getAttribute('aria-describedby')).to.equal(`${el.id}-help ${el.id}-error`);
    expect(el.lastElementChild.className).to.equal('td-field-error');
    el.removeAttribute('error-text');
    expect(openBtn(el).getAttribute('aria-describedby')).to.equal(`${el.id}-help`);
  });

  it('disabled and <fieldset disabled> → buttons + alt disabled, nothing submitted, no open', async () => {
    const { el, form } = mk({ name: 'hero', usage: true, value: 'm1', disabled: true });
    expect([...el.querySelectorAll('button, input')].every((c) => c.disabled)).to.equal(true);
    expect(fd(form)).to.deep.equal([]);
    openBtn(el).click();
    expect(opens.length).to.equal(0);
    el.removeAttribute('disabled');
    expect(fd(form).length).to.equal(3);
    const fs = document.createElement('fieldset');
    form.appendChild(fs);
    fs.appendChild(el);
    fs.disabled = true;
    await tick();
    expect([...el.querySelectorAll('button, input')].every((c) => c.disabled)).to.equal(true);
    expect(el.hasAttribute('disabled')).to.equal(false);
    expect(fd(form)).to.deep.equal([]);
  });

  it('external <label for> → focus on the open button', () => {
    const { el } = mk({ name: 'hero', id: 'hero-field' }, { html: '<label for="hero-field">Ảnh bìa</label>' });
    el.closest('form').querySelector('label').click();
    expect(document.activeElement === openBtn(el)).to.equal(true);
  });

  it('alt edits → FormData + host input / change; the native events of the alt input do not leak', () => {
    const { el, form } = mk({ name: 'hero', usage: true, value: 'm1' });
    const c = counter(el);
    const alt = q(el, '.td-media-field__alt');
    alt.focus();
    alt.value = 'Chú mèo';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    alt.dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
    expect(c.nativeInput).to.equal(false);
    expect(c.nativeChange).to.equal(false);
    expect(c.details[0].selection[0].usage.altText).to.equal('Chú mèo');
    expect(fd(form)).to.deep.equal([['hero[id]', 'm1'], ['hero[alt]', 'Chú mèo'], ['hero[crop]', 'null']]);
  });
});

describe('td-media-field — frame, preview, kinds', () => {
  it('3/2: frame height = width × 2/3 (± 1px), empty and filled; ratio text "3:2"', async () => {
    const { el } = mk({ name: 'h', 'aspect-ratio': '3/2' });
    let r = q(el, '.td-media-field__frame').getBoundingClientRect();
    expect(Math.abs(r.height - (r.width - 2) * 2 / 3 - 2) <= 1, `${r.width}×${r.height}`).to.equal(true);
    expect(q(el, '.td-media-field__ratio').textContent).to.equal('3:2');
    el.value = 'm1';
    el.setAttribute('preview-src', '/test/fixtures/1.svg');
    r = q(el, '.td-media-field__frame').getBoundingClientRect();
    expect(Math.abs(r.height - (r.width - 2) * 2 / 3 - 2) <= 1, `${r.width}×${r.height}`).to.equal(true);
    expect(getComputedStyle(q(el, 'img')).objectFit).to.equal('cover');
  });

  it('1.91 → "1.91:1"; invalid ratio → warning + free frame; contain → object-fit contain', () => {
    const og = mk({ name: 'h', 'aspect-ratio': '1.91' }).el;
    expect(q(og, '.td-media-field__ratio').textContent).to.equal('1.91:1');
    expect(q(og, 'svg.td-media-field__sizer').getAttribute('viewBox')).to.equal('0 0 1.91 1');
    const bad = mk({ name: 'h', 'aspect-ratio': '1e9' }).el;
    expect(!!q(bad, '.td-media-field__sizer')).to.equal(false);
    expect(warns.some((w) => w.includes('aspect-ratio'))).to.equal(true);
    const c = mk({ name: 'h', 'aspect-ratio': '1/1', 'preview-fit': 'contain', value: 'm1', 'preview-src': '/test/fixtures/1.svg' }).el;
    expect(getComputedStyle(q(c, 'img')).objectFit).to.equal('contain');
  });

  it('no ratio: empty = --td-media-field-empty-h; filled = the image\'s natural ratio', async () => {
    const { el } = mk({ name: 'h' });
    const empty = q(el, '.td-media-field__frame').getBoundingClientRect();
    expect(Math.abs(empty.height - 2 - parseFloat(getComputedStyle(document.documentElement).fontSize) * 10) <= 1).to.equal(true);
    el.value = 'm1';
    el.setAttribute('preview-src', '/test/fixtures/1.svg'); // 1200×800
    const img = q(el, 'img');
    if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; });
    await frame();
    const r = img.getBoundingClientRect();
    expect(Math.abs(r.height - r.width * 800 / 1200) <= 1, `${r.width}×${r.height}`).to.equal(true);
  });

  it('video → poster + "Video" badge, never <video> / <iframe>; file → icon + name', () => {
    const v = mk({ name: 'h', 'aspect-ratio': '16/9', value: 'm10', kind: 'video', 'preview-src': '/test/fixtures/2.svg', 'preview-alt': 'clip.mp4' }).el;
    expect(q(v, '.td-media-field__badge').textContent).to.equal('Video');
    expect(!!q(v, 'video, iframe, object, embed')).to.equal(false);
    expect(q(v, '.td-media-field__replace').textContent).to.equal('Đổi video');
    const f = mk({ name: 'h', value: 'm15', kind: 'file', 'preview-alt': 'tai-lieu.pdf', 'accept-kind': 'file' }).el;
    expect(q(f, '.td-media-field__name').textContent).to.equal('tai-lieu.pdf');
    expect(q(f, '.td-media-field__icon').getAttribute('data-td-icon')).to.equal('file');
    expect(!!q(f, 'svg[data-icon="file"]')).to.equal(true);
    const empty = mk({ name: 'h', 'accept-kind': 'video' }).el;
    expect(q(empty, '.td-media-field__prompt').textContent).to.equal('Chọn video');
  });

  it('preview-src javascript: / data: → no img (selected without preview)', () => {
    for (const src of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', ' java\tscript:alert(1)']) {
      const el = mk({ name: 'h', value: 'm1', 'preview-src': src }, { adapter: null }).el;
      expect(!!q(el, 'img')).to.equal(false);
      expect(q(el, '.td-media-field__name').textContent).to.equal('Đã chọn (không có ảnh xem trước)');
    }
  });

  it('XSS: label / preview-alt / prompt / helper-text stay text; no style, no on* anywhere', () => {
    const P = '"><img src=x onerror="window.__mfXss=1">';
    const a = mk({ name: 'h', label: P, prompt: P, 'helper-text': P, 'error-text': P }).el;
    const b = mk({ name: 'h', value: 'm1', 'preview-alt': P, usage: true }).el;
    for (const el of [a, b]) {
      expect(!!q(el, 'img[onerror], [onerror], script')).to.equal(false);
      expect([...el.querySelectorAll('*')].some((n) => n.hasAttribute('style'))).to.equal(false);
    }
    expect(q(a, '.td-media-field__label').textContent).to.equal(P);
    expect(q(a, '.td-media-field__prompt').textContent).to.equal(P);
    expect(q(b, '.td-media-field__name').textContent).to.equal(P);
    expect(window.__mfXss).to.equal(undefined);
  });
});

describe('td-media-field — lazy preview + selection API', () => {
  it('.value = id without preview → adapter.get(id) once; the next change aborts it; latest wins', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'h' }, { adapter: man });
    el.value = 'm3';
    expect(man.calls.get.length).to.equal(1);
    expect(man.calls.get[0].args[0]).to.equal('m3');
    el.value = 'm4';
    expect(man.calls.get[0].signal.aborted).to.equal(true);
    man.calls.get[0].resolve();
    man.calls.get[1].resolve();
    await tick();
    await tick();
    expect(q(el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m4').name}`);
    expect(!!q(el, 'img')).to.equal(true);
    expect(el.selection[0].asset.id).to.equal('m4');
  });

  it('server-rendered preview → the adapter is never called on load', async () => {
    const man = createMockAdapter({ manual: true });
    mk({ name: 'h', value: 'm1', 'preview-src': '/test/fixtures/1.svg' }, { adapter: man });
    await tick();
    expect(man.callCount).to.equal(0);
  });

  it('setSelection() is silent; selection getter shape; null clears', () => {
    const { el, form } = mk({ name: 'h', usage: true });
    const c = counter(el);
    el.setSelection({ assetId: 'm2', asset: asset('m2'), usage: { altText: 'X', crop: { normalized: { x: 0, y: 0, width: 1, height: 1 } } } });
    expect(c.input + c.change).to.equal(0);
    expect(el.value).to.equal('m2');
    expect(fd(form)).to.deep.equal([['h[id]', 'm2'], ['h[alt]', 'X'], ['h[crop]', '{"v":1,"x":0,"y":0,"width":1,"height":1}']]);
    const s = el.selection;
    expect(s.length).to.equal(1);
    expect(s[0].asset.name).to.equal(asset('m2').name);
    expect(s[0].usage).to.deep.equal({ altText: 'X', crop: { normalized: { x: 0, y: 0, width: 1, height: 1 } }, focalPoint: null });
    el.setSelection(null);
    expect(el.value).to.equal('');
    expect(el.selection).to.deep.equal([]);
  });

  it('properties assigned before define / connect are kept (adapter, pickerOptions, value)', async () => {
    const el = document.createElement('td-media-field');
    el.setAttribute('name', 'h');
    el.adapter = ad;
    el.value = 'm5';
    box.appendChild(el);
    expect(el.value).to.equal('m5');
    await tick();
    await tick();
    expect(q(el, '.td-sr-only').textContent).to.equal(`Đã chọn: ${asset('m5').name}`);
    expect(el instanceof TdMediaField).to.equal(true);
  });
});
