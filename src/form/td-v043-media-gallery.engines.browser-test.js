import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.43.0 (plan docs/internal/plans/v0.43.0-media-gallery.md M3, decisions 4-9, 14-18) — <td-media-gallery> core in
// Chromium, Firefox and WebKit (group `engines`): render from `items`, FormData (two shapes + empty), add through the
// picker (STUBBED: TdMediaPicker.open replaced by a controllable deferred), remove + focus, validity (required / min /
// max / overflow), disabled + fieldset, reset, restore, fail closed, events, `value =` / setSelection(), no adapter.
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
const sel = (id, altText) => ({ assetId: id, asset: asset(id), usage: { altText: altText ?? asset(id).defaultAltText, crop: null, focalPoint: null } });
const picked = (...ids) => ({ status: 'selected', selection: ids.map((id) => sel(id)) });
const tick = () => new Promise((r) => setTimeout(r, 0));
const CROP = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
const FOCAL = '{"v":1,"x":0.25,"y":0.75}';

const box = document.createElement('div');
box.style.width = '600px'; // test page only
document.body.appendChild(box);

/** items JSON for the attribute */
const J = (list) => JSON.stringify(list);
const three = J([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }, { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' },
  { id: 'm3', src: '/test/fixtures/3.svg', name: 'Ảnh 3' }]);

function mk(attrs = {}, { adapter = ad, html = '' } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-gallery');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.innerHTML = html;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el, c: counter(el) };
}
const q = (el, s) => el.querySelector(s);
const qa = (el, s) => [...el.querySelectorAll(s)];
const lis = (el) => qa(el, '.td-media-gallery__list > li');
const addBtn = (el) => q(el, 'button.td-media-gallery__add');
const removeBtn = (li) => li.querySelector('.td-media-gallery__remove');
const status = (el) => q(el, '.td-media-gallery__status').textContent;
function counter(el) {
  const c = { input: 0, change: 0, details: [] };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); });
  return c;
}
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

describe('td-media-gallery — render + FormData (decisions 3, 14, 23)', () => {
  it('renders the items in order: tiles, names with positions, count, handle / Gỡ labels, img alt=""', () => {
    const { el, form } = mk({ name: 'images', label: 'Ảnh', items: three, max: '6' });
    expect(lis(el).length).to.equal(3);
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(q(el, '.td-media-gallery__count').textContent).to.equal('3/6 ảnh');
    expect(lis(el)[1].querySelector('.td-media-gallery__handle').getAttribute('aria-label')).to.equal('Sắp xếp Ảnh 2 trên 3: Ảnh 2');
    expect(removeBtn(lis(el)[2]).getAttribute('aria-label')).to.equal('Gỡ Ảnh 3 trên 3: Ảnh 3');
    expect(lis(el)[0].querySelector('img').getAttribute('alt')).to.equal('');
    expect(lis(el)[0].querySelector('img').getAttribute('referrerpolicy')).to.equal('no-referrer');
    const ul = q(el, '.td-media-gallery__list');
    expect(ul.getAttribute('aria-labelledby')).to.equal(`${el.id}-label`);
    expect(ul.getAttribute('aria-describedby')).to.equal(`${el.id}-count`);
    expect(fd(form)).to.deep.equal([['images[]', 'm1'], ['images[]', 'm2'], ['images[]', 'm3']]);
    expect(el.hasAttribute('style')).to.equal(false);
    expect(qa(el, '[style]').length).to.equal(0);
  });

  it('usage: name[i][id] / [alt] / [crop] (+ [focal]); empty → exactly one name=', () => {
    const items = J([{ id: 'm1', alt: 'Một', crop: CROP, focal: FOCAL }, { id: 'm2' }]);
    const { el, form } = mk({ name: 'g', usage: true, 'focal-point': true, items });
    expect(fd(form)).to.deep.equal([
      ['g[0][id]', 'm1'], ['g[0][alt]', 'Một'], ['g[0][crop]', CROP], ['g[0][focal]', FOCAL],
      ['g[1][id]', 'm2'], ['g[1][alt]', ''], ['g[1][crop]', 'null'], ['g[1][focal]', 'null']]);
    expect(lis(el)[0].querySelector('.td-media-gallery__alt').value).to.equal('Một');
    expect(lis(el)[1].querySelector('.td-media-gallery__alt-field .td-sr-only').textContent).to.equal('Mô tả ảnh 2 (alt)');
    el.value = [];
    expect(fd(form)).to.deep.equal([['g', '']]);
    const r = mk({ name: 'r' });
    expect(fd(r.form)).to.deep.equal([['r', '']]);
    expect(addBtn(r.el).dataset.state).to.equal('empty');
    expect(q(r.el, '.td-media-gallery__prompt').textContent).to.equal('Chọn ảnh');
  });

  it('cover: badge on the first tile + ", ảnh bìa" in its names; follows the first position', () => {
    const { el } = mk({ name: 'c', cover: true, items: three });
    expect(qa(el, '.td-media-gallery__cover').length).to.equal(1);
    expect(!!lis(el)[0].querySelector('.td-media-gallery__cover')).to.equal(true);
    expect(removeBtn(lis(el)[0]).getAttribute('aria-label')).to.equal('Gỡ Ảnh 1 trên 3: Ảnh 1, ảnh bìa');
    el.value = ['m2', 'm1', 'm3'];
    expect(!!lis(el)[0].querySelector('.td-media-gallery__cover')).to.equal(true);
    expect(qa(el, '.td-media-gallery__cover').length).to.equal(1);
    expect(removeBtn(lis(el)[0]).getAttribute('aria-label')).to.equal('Gỡ Ảnh 1 trên 3: Ảnh 2, ảnh bìa');
  });
});

describe('td-media-gallery — add through the picker (decision 5)', () => {
  it('opens multiple mode for the room left; initialIds []; crop off; title = label; themeRoot; one at a time', async () => {
    const { el } = mk({ name: 'g', label: 'Gallery', items: three, max: '5', 'accept-kind': 'image video' });
    addBtn(el).click();
    addBtn(el).click();
    expect(opens.length).to.equal(1);
    const o = opens[0].opts;
    expect(o.selection).to.deep.equal({ mode: 'multiple', initialIds: [], maxItems: 2, kinds: ['image', 'video'] });
    expect(o.crop).to.deep.equal({ enabled: false });
    expect(o.title).to.equal('Gallery');
    expect(o.themeRoot === el).to.equal(true);
    expect(o.adapter === ad).to.equal(true);
    opens[0].resolve({ status: 'cancelled', reason: 'close', selection: [] });
    await tick();
    addBtn(el).click();
    expect(opens.length).to.equal(2);
  });

  it('appends in pick order; input + change once each (reason add); alt from usage.altText; announce + count', async () => {
    const { el, form, c } = mk({ name: 'g', usage: true, items: J([{ id: 'm1' }]), max: '10' });
    addBtn(el).click();
    opens[0].resolve({ status: 'selected', selection: [sel('m5', 'Năm'), sel('m3')] });
    await tick();
    expect(el.value).to.deep.equal(['m1', 'm5', 'm3']);
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
    expect(c.details[1].reason).to.equal('add');
    expect(c.details[1].value).to.deep.equal(['m1', 'm5', 'm3']);
    expect(c.details[1].selection[1].usage.altText).to.equal('Năm');
    expect(lis(el)[1].querySelector('.td-media-gallery__alt').value).to.equal('Năm');
    expect(fd(form).filter(([k]) => k.endsWith('[id]'))).to.deep.equal([['g[0][id]', 'm1'], ['g[1][id]', 'm5'], ['g[2][id]', 'm3']]);
    expect(status(el)).to.equal('Đã thêm 2 ảnh. 3/10 ảnh.');
    expect(addBtn(el).dataset.state).to.equal('filled');
  });

  it('an id already in the gallery is skipped and announced; more than the room left → the rest dropped + announced', async () => {
    const { el, c } = mk({ name: 'g', items: J([{ id: 'm1' }, { id: 'm2' }]), max: '3' });
    addBtn(el).click();
    expect(opens[0].opts.selection.maxItems).to.equal(1);
    opens[0].resolve({ status: 'selected', selection: [sel('m2'), sel('m6'), sel('m8'), { assetId: '' }, { assetId: 'x'.repeat(513) }, { assetId: 7 }] });
    await tick();
    expect(el.value).to.deep.equal(['m1', 'm2', 'm6']);
    expect(status(el)).to.equal('Đã thêm 1 ảnh. Bỏ qua 1 ảnh đã có. Bỏ qua 1 ảnh vượt quá giới hạn. Đã đủ 3 ảnh.');
    expect(c.change).to.equal(1);
    // full → Add hidden, focus on the handle of the first new tile
    expect(addBtn(el).hidden).to.equal(true);
    expect(document.activeElement === lis(el)[2].querySelector('.td-media-gallery__handle')).to.equal(true);
  });

  it('only duplicates → nothing changes, no event, "Bỏ qua" announced', async () => {
    const { el, c } = mk({ name: 'g', items: J([{ id: 'm1' }]) });
    addBtn(el).click();
    opens[0].resolve(picked('m1'));
    await tick();
    expect(el.value).to.deep.equal(['m1']);
    expect(c.input + c.change).to.equal(0);
    expect(status(el)).to.equal('Bỏ qua 1 ảnh đã có. 1/100 ảnh.');
  });

  it('the gallery left the page while the picker was open → the result is dropped; no adapter → one warning', async () => {
    const { el, c } = mk({ name: 'g' });
    addBtn(el).click();
    el.remove();
    opens[0].resolve(picked('m4'));
    await tick();
    expect(el.value).to.deep.equal([]);
    expect(c.input + c.change).to.equal(0);
    const n = mk({ name: 'n' }, { adapter: null });
    addBtn(n.el).click();
    addBtn(n.el).click();
    expect(opens.length).to.equal(1);
    expect(warns.filter((w) => w.includes('no media adapter')).length).to.equal(1);
  });
});

describe('td-media-gallery — remove (decision 7)', () => {
  it('Gỡ → input + change (reason remove), announce, focus → next tile\'s Gỡ → previous → Add', () => {
    const { el, form, c } = mk({ name: 'g', items: three });
    removeBtn(lis(el)[1]).focus();
    removeBtn(lis(el)[1]).click();
    expect(el.value).to.deep.equal(['m1', 'm3']);
    expect(c.details.map((d) => d.reason)).to.deep.equal(['remove', 'remove']);
    expect(status(el)).to.equal('Đã gỡ Ảnh 2. Còn 2 ảnh.');
    expect(document.activeElement === removeBtn(lis(el)[1])).to.equal(true); // m3 took the place
    removeBtn(lis(el)[1]).click();
    expect(document.activeElement === removeBtn(lis(el)[0])).to.equal(true); // last → previous
    removeBtn(lis(el)[0]).click();
    expect(document.activeElement === addBtn(el)).to.equal(true);
    expect(fd(form)).to.deep.equal([['g', '']]);
    expect(addBtn(el).dataset.state).to.equal('empty');
    expect(q(el, '.td-media-gallery__list').children.length).to.equal(0);
  });
});

describe('td-media-gallery — validity (decision 8)', () => {
  it('required → valueMissing; min → rangeUnderflow; message names the kind; error contract on the Add button', () => {
    const { el } = mk({ name: 'g', required: true });
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal('Vui lòng chọn ảnh.');
    el.value = ['m1'];
    expect(el.checkValidity()).to.equal(true);
    el.setAttribute('min', '2');
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validationMessage).to.equal('Cần ít nhất 2 ảnh.');
    el.setError('Sai');
    expect(addBtn(el).getAttribute('aria-invalid')).to.equal('true');
    expect(addBtn(el).getAttribute('aria-errormessage')).to.equal(`${el.id}-error`);
  });

  it('overflow (server printed more than max): every item kept + shown, rangeOverflow, NO FormData; Gỡ back to max → FormData again', () => {
    const items = J(['m1', 'm2', 'm3', 'm4'].map((id) => ({ id })));
    const { el, form } = mk({ name: 'o', items, max: '2' });
    expect(lis(el).length).to.equal(4);
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(el.validationMessage).to.equal('Tối đa 2 ảnh.');
    expect(fd(form)).to.deep.equal([]);
    expect(addBtn(el).hidden).to.equal(true);
    expect(q(el, '.td-media-gallery__count').textContent).to.equal('Vượt giới hạn: 4/2 ảnh');
    removeBtn(lis(el)[0]).click();
    expect(fd(form)).to.deep.equal([]);
    removeBtn(lis(el)[0]).click();
    expect(fd(form)).to.deep.equal([['o[]', 'm3'], ['o[]', 'm4']]);
    expect(el.checkValidity()).to.equal(true);
  });

  it('lowering max at runtime → overflow (kept, nothing submitted); max is clamped to 100', () => {
    const { el, form } = mk({ name: 'o', items: three });
    el.setAttribute('max', '2');
    expect(fd(form)).to.deep.equal([]);
    expect(el.value.length).to.equal(3);
    el.setAttribute('max', '500');
    expect(q(el, '.td-media-gallery__count').textContent).to.equal('3/100 ảnh');
    expect(TdMediaGallery.MAX_ITEMS).to.equal(100);
  });
});

describe('td-media-gallery — disabled, reset, restore (decisions 14, 16)', () => {
  it('disabled / <fieldset disabled> → nothing submitted, buttons + alt disabled, Add does nothing', () => {
    const { el, form } = mk({ name: 'd', usage: true, items: three, disabled: true });
    expect(fd(form)).to.deep.equal([]);
    expect(qa(el, 'button').every((b) => b.disabled)).to.equal(true);
    expect(qa(el, '.td-media-gallery__alt').every((i) => i.disabled)).to.equal(true);
    addBtn(el).click();
    expect(opens.length).to.equal(0);
    const fs = document.createElement('fieldset');
    const f2 = mk({ name: 'f', items: three });
    f2.form.appendChild(fs);
    fs.appendChild(f2.el);
    fs.disabled = true;
    expect(fd(f2.form)).to.deep.equal([]);
    fs.disabled = false;
    expect(fd(f2.form).length).to.equal(3);
  });

  it('form.reset() → back to the items attribute, no event', async () => {
    const { el, form, c } = mk({ name: 'g', items: three });
    removeBtn(lis(el)[0]).click();
    c.input = 0;
    c.change = 0;
    form.reset();
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(c.input + c.change).to.equal(0);
  });

  it('restore state: only id / alt / crop / focal (no URL); valid → applied, broken → dropped (state kept) + one warning', () => {
    const { el, form } = mk({ name: 'g', usage: true, items: three });
    el.formStateRestoreCallback(JSON.stringify({ v: 1, items: [{ id: 'm9', alt: 'chín', crop: CROP, focal: null }, { id: 'm1', alt: '', crop: null, focal: null }] }), 'restore');
    expect(el.value).to.deep.equal(['m9', 'm1']);
    expect(fd(form).slice(0, 3)).to.deep.equal([['g[0][id]', 'm9'], ['g[0][alt]', 'chín'], ['g[0][crop]', CROP]]);
    el.formStateRestoreCallback(JSON.stringify({ v: 1, items: [{ id: 'a' }, { id: 'a' }] }), 'restore');
    el.formStateRestoreCallback('{broken', 'restore');
    expect(el.value).to.deep.equal(['m9', 'm1']);
    expect(warns.filter((w) => w.includes('restored form state was dropped')).length).to.equal(1);
  });
});

describe('td-media-gallery — fail closed (decision 15)', () => {
  for (const [what, attrs] of [
    ['broken JSON', { items: '[{"id":"m1"' }],
    ['duplicate ids', { items: J([{ id: 'm1' }, { id: 'm1' }]) }],
    ['an id that is not a string', { items: '[{"id":7}]' }],
    ['more than 100 items', { items: J(Array.from({ length: 101 }, (_, i) => ({ id: `m${i}` }))) }],
    ['a name ending in []', { name: 'g[]', items: three }],
  ]) {
    it(`${what} → the broken state, no FormData, locked, one warning without values`, () => {
      const { el, form } = mk({ name: 'g', ...attrs });
      expect(q(el, '.td-media-gallery__broken').textContent).to.equal('Không đọc được danh sách ảnh');
      expect(fd(form)).to.deep.equal([]);
      expect(q(el, '.td-media-gallery__list')).to.equal(null);
      expect(addBtn(el)).to.equal(null);
      // bad items → nothing usable; a bad name keeps the (valid) list, only nothing is submitted
      expect(el.value).to.deep.equal(attrs.name ? ['m1', 'm2', 'm3'] : []);
      expect(warns.length).to.equal(1);
      expect(warns[0]).to.not.include('m1');
    });
  }

  it('a valid items attribute later → the gallery works again', () => {
    const { el, form } = mk({ name: 'g', items: '[' });
    el.setAttribute('items', three);
    expect(fd(form).length).to.equal(3);
    expect(q(el, '.td-media-gallery__broken')).to.equal(null);
  });

  it('an unsafe src is dropped (item kept, no image); a bad crop → null; a long alt cut to 500', () => {
    const { el, form } = mk({ name: 'g', usage: true, items: J([{ id: 'm1', src: 'javascript:alert(1)', alt: 'a'.repeat(600), crop: '{"v":1}' }]) });
    expect(lis(el)[0].querySelector('img')).to.equal(null);
    expect(lis(el)[0].querySelector('.td-media-gallery__name').textContent).to.equal('Không có ảnh xem trước');
    expect(fd(form)).to.deep.equal([['g[0][id]', 'm1'], ['g[0][alt]', 'a'.repeat(500)], ['g[0][crop]', 'null']]);
  });
});

describe('td-media-gallery — value / setSelection (decisions 15b, 18)', () => {
  it('value = ids: silent; kept ids keep alt / crop and their tile; new ids start empty', () => {
    const { el, form, c } = mk({ name: 'g', usage: true, items: J([{ id: 'm1', alt: 'Một', crop: CROP, src: '/test/fixtures/1.svg' }, { id: 'm2' }]) }, { adapter: null });
    const li1 = lis(el)[0];
    el.value = ['m3', 'm1'];
    expect(c.input + c.change).to.equal(0);
    expect(el.value).to.deep.equal(['m3', 'm1']);
    expect(lis(el)[1] === li1).to.equal(true);
    expect(fd(form)).to.deep.equal([['g[0][id]', 'm3'], ['g[0][alt]', ''], ['g[0][crop]', 'null'],
      ['g[1][id]', 'm1'], ['g[1][alt]', 'Một'], ['g[1][crop]', CROP]]);
  });

  it('value = invalid (duplicates, non-strings, over max, not an array) → refused, unchanged, one warning each, no value printed', () => {
    const { el, c } = mk({ name: 'g', items: three, max: '3' });
    el.value = ['m1', 'm1'];
    el.value = ['m1', 7];
    el.value = ['m1', 'm2', 'm3', 'm4'];
    el.value = 'm1';
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(c.input + c.change).to.equal(0);
    expect(warns.length).to.equal(4);
    for (const w of warns) expect(w).to.match(/td-media-gallery: value refused \((duplicate|id|max|type)\)/);
  });

  it('setSelection(SelectedMedia[]): silent, order, alt / crop / focal; invalid → refused; null → empty', () => {
    const { el, form } = mk({ name: 'g', usage: true, 'focal-point': true }, { adapter: null });
    el.setSelection([
      { assetId: 'm2', asset: asset('m2'), usage: { altText: 'Hai', crop: { normalized: { x: 0, y: 0, width: 1, height: 0.5 } }, focalPoint: { x: 0.5, y: 0.5 } } },
      { assetId: 'm1', asset: asset('m1') },
    ]);
    expect(el.value).to.deep.equal(['m2', 'm1']);
    expect(el.selection[0].usage).to.deep.equal({ altText: 'Hai', crop: { normalized: { x: 0, y: 0, width: 1, height: 0.5 } }, focalPoint: { x: 0.5, y: 0.5 } });
    expect(el.selection[1].usage.altText).to.equal(asset('m1').defaultAltText);
    expect(fd(form)[2]).to.deep.equal(['g[0][crop]', '{"v":1,"x":0,"y":0,"width":1,"height":0.5}']);
    el.setSelection([{ assetId: 'm1' }, { assetId: 'm1' }]);
    expect(el.value).to.deep.equal(['m2', 'm1']);
    el.setSelection(null);
    expect(el.value).to.deep.equal([]);
  });

  it('value assigned before define / connect wins over the attribute', async () => {
    const el = document.createElement('td-media-gallery');
    el.setAttribute('items', three);
    el.setAttribute('name', 'e');
    el.value = ['m2'];
    const form = document.createElement('form');
    form.appendChild(el);
    box.appendChild(form);
    expect(el.value).to.deep.equal(['m2']);
    expect(fd(form)).to.deep.equal([['e[]', 'm2']]);
  });
});

describe('td-media-gallery — alt (decision 11)', () => {
  it('typing → host input (reason alt) without the native one; blur → change; names follow the alt', () => {
    const { el, form, c } = mk({ name: 'g', usage: true, items: J([{ id: 'm1' }]) }, { adapter: null });
    let native = 0;
    form.addEventListener('input', (e) => { if (!(e instanceof CustomEvent)) native++; });
    const alt = q(el, '.td-media-gallery__alt');
    alt.focus();
    alt.value = 'Áo';
    alt.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(c.input).to.equal(1);
    expect(native).to.equal(0);
    expect(c.details[0].reason).to.equal('alt');
    expect(fd(form)[1]).to.deep.equal(['g[0][alt]', 'Áo']);
    expect(removeBtn(lis(el)[0]).getAttribute('aria-label')).to.equal('Gỡ Ảnh 1 trên 1: Áo');
    alt.dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.change).to.equal(1);
    expect(alt.getAttribute('placeholder')).to.equal('Mô tả (alt)');
    expect(alt.getAttribute('maxlength')).to.equal('500');
  });
});
