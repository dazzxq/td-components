// v0.79.0 (plan docs/internal/plans/v0.79.0-media-field-placeholder.md) — <td-media-field> as the dcms2 placeholder: no "Đổi ảnh" /
// "Gỡ" buttons, the whole frame chooses / changes the asset, a round red X (and a crop icon when croppable) in the top-end corner of
// the frame (fine pointer: shown on frame hover / focus-within), the ratio text below the frame, `hide-label` / `hide-hints`, and
// --td-media-field-frame-radius. Chromium + Firefox + WebKit, REAL mouse (sendMouse: real :hover, real hit testing); the picker is
// stubbed; waits on real signals (rAF loops), no fixed sleeps.
import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdMediaField } from './td-media-field.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

void TdMediaField; // defines <td-media-field>
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
/** @type {Array<{ opts: any, resolve: (o: any) => void }>} */
let opens = [];
const stubOpen = (opts) => new Promise((resolve) => { opens.push({ opts, resolve }); });
const ad = createMockAdapter();
const asset = (id) => JSON.parse(JSON.stringify(ad.db.get(id)));
const picked = (id) => ({
  status: 'selected',
  selection: [{ assetId: id, asset: asset(id), usage: { altText: asset(id).defaultAltText, crop: null, focalPoint: null } }],
});

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function until(cond, n = 240) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
const q = (el, sel) => el.querySelector(sel);
const rect = (n) => n.getBoundingClientRect();
const mid = (n) => { const r = rect(n); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const opacity = (n) => parseFloat(getComputedStyle(n).opacity);
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const ROOT_PX = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

const box = document.createElement('div');
box.style.width = '360px'; // test page only (the component never writes style)
document.body.appendChild(box);

/** One field from `attrs` (+ the mock adapter unless `adapter: null`), settled. */
async function mk(attrs = {}, { adapter = ad } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries({ name: 'hero', label: 'Ảnh đại diện', ...attrs })) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  await raf();
  await raf();
  const img = q(el, 'img.td-media-field__img');
  if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
  return { form, el };
}
const FILLED = { value: 'm1', 'preview-src': '/test/fixtures/1.svg', 'preview-alt': 'Ảnh 1' };
const openBtn = (el) => q(el, '.td-media-field__open');
const frameOf = (el) => q(el, '.td-media-field__frame');
const removeBtn = (el) => q(el, '.td-media-field__tools .td-media-field__remove');
const cropBtn = (el) => q(el, '.td-media-field__tools .td-media-field__crop-btn');
/** The accessible name the way aria-labelledby builds it: the referenced elements' text, in order. */
const nameOf = (el, btn) => btn.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id).textContent.trim()).join(' ');
async function hover(target) {
  await sendMouse({ type: 'move', position: mid(target) });
  await raf();
}
async function hoverAway() {
  await sendMouse({ type: 'move', position: [2, 2] });
  await raf();
}
async function click(target) {
  await hover(target);
  await sendMouse({ type: 'down' });
  await sendMouse({ type: 'up' });
  await raf();
}
const counter = (el) => {
  const c = { input: 0, change: 0 };
  el.addEventListener('input', () => { c.input++; });
  el.addEventListener('change', () => { c.change++; });
  return c;
};

beforeEach(() => {
  opens = [];
  TdMediaPicker.open = stubOpen;
});
afterEach(async () => {
  TdMediaPicker.open = realOpen;
  for (const r of document.body.querySelectorAll(':scope > .td-crop-dialog')) r.remove();
  box.replaceChildren();
  await resetMouse();
});

describe('v0.79.0 td-media-field placeholder — structure', () => {
  it('no __actions / __replace; the tools live inside the frame after the opener (empty: hidden)', async () => {
    const empty = (await mk({})).el;
    const filled = (await mk(FILLED)).el;
    for (const el of [empty, filled]) {
      expect(q(el, '.td-media-field__actions'), 'no actions row').to.equal(null);
      expect(q(el, '.td-media-field__replace'), 'no Đổi button').to.equal(null);
      expect(q(el, '.td-media-field__frame > .td-media-field__open + .td-media-field__tools') !== null, 'tools after the opener').to.equal(true);
      expect(removeBtn(el).textContent).to.equal('Gỡ');
      expect(removeBtn(el).title).to.equal('Gỡ');
    }
    expect(q(empty, '.td-media-field__tools').hidden).to.equal(true);
    expect(q(filled, '.td-media-field__tools').hidden).to.equal(false);
    expect(getComputedStyle(q(empty, '.td-media-field__tools')).display).to.equal('none');
  });

  it('the ratio text sits BELOW the frame, empty and filled', async () => {
    for (const attrs of [{ 'aspect-ratio': '3/2' }, { ...FILLED, 'aspect-ratio': '3/2' }]) {
      const { el } = await mk(attrs);
      const ratio = q(el, '.td-media-field__ratio');
      expect(ratio.textContent).to.equal('3:2');
      expect(ratio.previousElementSibling === frameOf(el), 'directly after the frame').to.equal(true);
      expect(ratio.parentElement === el, 'a child of the host, not of the opener').to.equal(true);
      expect(rect(ratio).top >= rect(frameOf(el)).bottom - 0.5, 'below the frame').to.equal(true);
      expect(getComputedStyle(ratio).display).to.equal('block');
    }
  });

  it('empty state: a grey circle with the kind icon + the prompt', async () => {
    const { el } = await mk({});
    const badge = q(el, '.td-media-field__badge-icon');
    const r = rect(badge);
    expect(near(r.width, 4 * ROOT_PX) && near(r.height, 4 * ROOT_PX), `${r.width}×${r.height}`).to.equal(true);
    expect(getComputedStyle(badge).borderTopLeftRadius).to.not.equal('0px');
    expect(q(badge, '.td-media-field__icon').getAttribute('data-td-icon')).to.equal('image');
    expect(q(el, '.td-media-field__prompt').textContent).to.equal('Chọn ảnh');
  });
});

describe('v0.79.0 td-media-field placeholder — behaviour (real mouse)', () => {
  it('a click on the filled frame opens the picker (initialIds = [value]) and a new asset replaces it', async () => {
    const { el } = await mk(FILLED);
    const c = counter(el);
    await click(openBtn(el)); // the centre of the frame: nothing of the tools is there
    expect(opens.length).to.equal(1);
    expect(opens[0].opts.selection.initialIds).to.deep.equal(['m1']);
    opens[0].resolve(picked('m2'));
    expect(await until(() => el.value === 'm2')).to.equal(true);
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
  });

  it('the X removes: value "", input + change once, no picker, focus back on the frame button, tools hidden', async () => {
    const { el } = await mk({ ...FILLED, usage: true, alt: 'mô tả' });
    const c = counter(el);
    await hover(frameOf(el));
    await click(removeBtn(el));
    expect(el.value).to.equal('');
    expect(c.input).to.equal(1);
    expect(c.change).to.equal(1);
    expect(opens.length, 'the X never opens the picker').to.equal(0);
    expect(document.activeElement === openBtn(el)).to.equal(true);
    expect(q(el, '.td-media-field__tools').hidden).to.equal(true);
    expect(frameOf(el).dataset.state).to.equal('empty');
  });

  it('croppable + a source: the crop icon sits before the X and opens the crop dialog', async () => {
    const { el } = await mk({ ...FILLED, 'preview-src': '/test/fixtures/crop-large.png', usage: true, croppable: true }, { adapter: null });
    const crop = cropBtn(el);
    expect(crop.hidden).to.equal(false);
    expect(crop.nextElementSibling === removeBtn(el), 'crop icon then X').to.equal(true);
    expect(crop.getAttribute('aria-haspopup')).to.equal('dialog');
    await hover(frameOf(el));
    await click(crop);
    expect(await until(() => !!document.body.querySelector(':scope > .td-crop-dialog[data-state="open"]'))).to.equal(true);
    expect(opens.length, 'the crop icon does not open the picker').to.equal(0);
  });

  it('not croppable: no crop button; croppable without a source: it is hidden', async () => {
    const plain = (await mk(FILLED)).el;
    expect(cropBtn(plain)).to.equal(null);
    const noSrc = (await mk({ value: 'm1', usage: true, croppable: true }, { adapter: null })).el;
    expect(cropBtn(noSrc).hidden).to.equal(true);
  });

  it('accessible names: "Gỡ {label}" / "Cắt ảnh {label}" (several fields on a page stay distinguishable)', async () => {
    const { el } = await mk({ ...FILLED, usage: true, croppable: true });
    expect(nameOf(el, removeBtn(el))).to.equal('Gỡ Ảnh đại diện');
    expect(nameOf(el, cropBtn(el))).to.equal('Cắt ảnh Ảnh đại diện');
    expect(nameOf(el, openBtn(el))).to.equal('Ảnh đại diện Đã chọn: Ảnh 1');
  });
});

describe('v0.79.0 td-media-field placeholder — fine pointer reveal, geometry, disabled', () => {
  it('the X is opacity 0 without hover, 1 on frame hover, 1 again via focus-within with the mouse away', async () => {
    const { el } = await mk(FILLED);
    await hoverAway();
    expect(await until(() => opacity(removeBtn(el)) === 0)).to.equal(true);
    await hover(frameOf(el));
    expect(await until(() => opacity(removeBtn(el)) === 1)).to.equal(true);
    await hoverAway();
    expect(await until(() => opacity(removeBtn(el)) === 0)).to.equal(true);
    openBtn(el).focus();
    expect(await until(() => opacity(removeBtn(el)) === 1)).to.equal(true);
  });

  it('the X is in the top-end corner of the frame (inset --td-space-xs), the frame never resizes, the X is on top of the image', async () => {
    const { el } = await mk({ ...FILLED, usage: true, croppable: true }, { adapter: null });
    const f = frameOf(el);
    await hoverAway();
    const before = rect(f);
    await hover(f);
    const after = rect(f);
    expect(near(before.width, after.width, 0.1) && near(before.height, after.height, 0.1), 'frame size stable').to.equal(true);
    const x = rect(removeBtn(el));
    const inset = 1 + 0.5 * ROOT_PX; // border + --td-space-xs (0.5rem)
    expect(near(x.right, after.right - inset, 1.5), `right ${x.right} vs ${after.right - inset}`).to.equal(true);
    expect(near(x.top, after.top + inset, 1.5), `top ${x.top} vs ${after.top + inset}`).to.equal(true);
    expect(near(x.width, 1.75 * ROOT_PX, 1) && near(x.height, 1.75 * ROOT_PX, 1), `size ${x.width}×${x.height}`).to.equal(true);
    expect(removeBtn(el).contains(document.elementFromPoint(...mid(removeBtn(el)))), 'X is the hit target over the image').to.equal(true);
    expect(cropBtn(el).contains(document.elementFromPoint(...mid(cropBtn(el)))), 'crop is the hit target').to.equal(true);
    const gapX = Math.round((rect(cropBtn(el)).right + x.left) / 2);
    expect(openBtn(el).contains(document.elementFromPoint(gapX, Math.round(x.top + x.height / 2))), 'the gap between the tools hits the opener').to.equal(true);
  });

  it('disabled: the tools are not shown and a click on the frame does nothing', async () => {
    const { el } = await mk({ ...FILLED, disabled: true });
    expect(getComputedStyle(q(el, '.td-media-field__tools')).display).to.equal('none');
    expect(removeBtn(el).disabled).to.equal(true);
    await click(openBtn(el));
    expect(opens.length).to.equal(0);
    expect(el.value).to.equal('m1');
  });

  it('a <fieldset disabled> hides the tools too', async () => {
    const fs = document.createElement('fieldset');
    fs.disabled = true;
    box.appendChild(fs);
    const el = document.createElement('td-media-field');
    for (const [k, v] of Object.entries({ name: 'hero', label: 'Ảnh', ...FILLED })) el.setAttribute(k, v);
    fs.appendChild(el);
    await raf();
    await raf();
    expect(getComputedStyle(q(el, '.td-media-field__tools')).display).to.equal('none');
  });
});

describe('v0.79.0 td-media-field placeholder — hide-label / hide-hints / frame radius', () => {
  it('hide-label: the label is 1×1 clipped, the opener keeps its name from it', async () => {
    const { el } = await mk({ 'hide-label': true });
    const label = q(el, '.td-media-field__label');
    const r = rect(label);
    expect(r.width <= 1.01 && r.height <= 1.01, `${r.width}×${r.height}`).to.equal(true);
    expect(nameOf(el, openBtn(el))).to.equal('Ảnh đại diện Chưa chọn');
    const shown = (await mk({})).el;
    expect(rect(q(shown, '.td-media-field__label')).height > 5, 'without the attribute the label is visible').to.equal(true);
    // an empty label stays display:none as before
    const none = (await mk({ label: false, 'hide-label': true })).el;
    expect(getComputedStyle(q(none, '.td-media-field__label')).display).to.equal('none');
  });

  it('hide-hints: the prompt and the ratio text are display:none (not in the accessible name either way)', async () => {
    const { el } = await mk({ 'hide-hints': true, 'aspect-ratio': '3/2' });
    expect(getComputedStyle(q(el, '.td-media-field__prompt')).display).to.equal('none');
    expect(getComputedStyle(q(el, '.td-media-field__ratio')).display).to.equal('none');
    const filled = (await mk({ ...FILLED, 'hide-hints': true, 'aspect-ratio': '3/2' })).el;
    expect(getComputedStyle(q(filled, '.td-media-field__ratio')).display).to.equal('none');
    const shown = (await mk({ 'aspect-ratio': '3/2' })).el;
    expect(getComputedStyle(q(shown, '.td-media-field__prompt')).display).to.not.equal('none');
  });

  it('--td-media-field-frame-radius: default = the md radius (opener 1px less); 0 → frame and opener square', async () => {
    const { el } = await mk(FILLED);
    const md = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--td-radius-md')); // 8px
    expect(near(parseFloat(getComputedStyle(frameOf(el)).borderTopLeftRadius), md, 0.6), 'frame default').to.equal(true);
    expect(near(parseFloat(getComputedStyle(openBtn(el)).borderTopLeftRadius), md - 1, 0.6), 'opener default').to.equal(true);
    el.style.setProperty('--td-media-field-frame-radius', '0px');
    await raf();
    expect(getComputedStyle(frameOf(el)).borderTopLeftRadius).to.equal('0px');
    expect(getComputedStyle(openBtn(el)).borderTopLeftRadius).to.equal('0px');
  });
});
