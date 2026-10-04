import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, sendKeys } from '@web/test-runner-commands';
import { TdCropper } from './td-cropper.js';

// v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md M2, decisions 13-14, 17-18) — <td-cropper> POINTER input in
// Chromium, Firefox AND WebKit: real mouse drags (sendMouse + pointer capture), synthetic touch pinch, wheel. Runs in
// its own browser instances (POINTER_FILES of web-test-runner.config.js). Every wait is on a real signal: image-ready,
// the events, animation frames — never a fixed sleep. DOM nodes are compared as booleans (chai hangs on DOM diffs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const FIX = '/test/fixtures/crop-16x9.svg'; // 1600 × 900, explicit intrinsic size
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(async () => {
  await resetMouse();
  extra.splice(0).reverse().forEach((f) => f());
  await frame();
});

/**
 * Mount a cropper (top-left of the viewport, `width` px) and wait for image-ready.
 * @param {Record<string, string>} attrs
 */
async function mount(attrs = {}, { width = 640 } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', `${width}px`], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  const el = /** @type {TdCropper} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', ...attrs })) el.setAttribute(k, v);
  const ready = new Promise((r) => el.addEventListener('image-ready', (e) => r(e.detail), { once: true }));
  wrap.appendChild(el);
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const detail = await ready;
  await frame();
  return { el, detail };
}
const crop = (x, y, w, h) => JSON.stringify({ v: 1, x, y, width: w, height: h });
const $ = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));
const centerOf = (node) => { const r = node.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
function record(el) {
  const rec = { input: [], change: [], focal: [] };
  el.addEventListener('crop-input', (e) => rec.input.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('crop-change', (e) => rec.change.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('focal-change', (e) => rec.focal.push(JSON.parse(JSON.stringify(e.detail))));
  return rec;
}
async function mouseTo(from, to, steps = 6) {
  for (let i = 1; i <= steps; i += 1) {
    await sendMouse({ type: 'move', position: [Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps)] });
    await frame();
  }
}
async function drag(from, to, steps = 6) {
  await sendMouse({ type: 'move', position: from });
  await sendMouse({ type: 'down' });
  await mouseTo(from, to, steps);
  await sendMouse({ type: 'up' });
  await frame();
}
/** synthetic pointer event (touch) — Playwright has no multi-touch, so a pinch is two synthetic touch pointers */
function pe(type, target, id, x, y) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch',
    isPrimary: id === 1, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
}

describe('td-cropper pointer (v0.35.0)', () => {
  it('image-ready reports the model size; the CSSOM vars are the only inline style', async () => {
    const { el, detail } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5) });
    expect(detail).to.deep.equal({ naturalWidth: 1600, naturalHeight: 900, pixelsKnown: false });
    expect(el.getAttribute('data-state')).to.equal('ready');
    for (let i = 0; i < el.style.length; i += 1) expect(el.style[i].startsWith('--_tdc-'), el.style[i]).to.equal(true);
    expect(el.querySelectorAll('[style]').length).to.equal(0);
  });

  it('dragging the box body: several crop-input, then exactly one crop-change { source: pointer }; delta / scale ± 1 px', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const s = parseFloat(el.style.getPropertyValue('--_tdc-img-w')) / 1600;
    const before = el.crop.pixels;
    const from = centerOf($(el, '.td-cropper__box'));
    await drag(from, [from[0] + 40, from[1] + 20]);
    expect(rec.input.length).to.be.greaterThan(1);
    expect(rec.input.every((d) => d.source === 'pointer')).to.equal(true);
    expect(rec.change.length).to.equal(1);
    expect(rec.change[0].source).to.equal('pointer');
    const after = rec.change[0].crop.pixels;
    expect(Math.abs(after.x - (before.x + 40 / s))).to.be.at.most(1);
    expect(Math.abs(after.y - (before.y + 20 / s))).to.be.at.most(1);
    expect(after.width).to.equal(before.width);
    expect(after.height).to.equal(before.height);
    expect(el.hasAttribute('data-dragging')).to.equal(false);
    expect(el.crop).to.deep.equal(rec.change[0].crop);
  });

  it('dragging a corner of a LOCKED box keeps the exact ratio (opposite corner anchored)', async () => {
    const { el } = await mount({ 'aspect-ratio': '1:1', 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    expect(el.hasAttribute('data-locked')).to.equal(true);
    const before = el.crop.pixels;
    expect(before).to.deep.equal({ x: 350, y: 0, width: 900, height: 900 });
    const from = centerOf($(el, '[data-handle="se"]'));
    await drag(from, [from[0] - 60, from[1] - 25]);
    expect(rec.change.length).to.equal(1);
    const c = rec.change[0].crop;
    expect(c.aspectRatio).to.equal(1);
    expect(Math.abs(c.pixels.width - c.pixels.height)).to.be.at.most(1);
    expect(c.pixels.width).to.be.below(900);
    expect(c.pixels.x).to.equal(350);
    expect(c.pixels.y).to.equal(0);
    // locked: the edge handles are not rendered
    expect(getComputedStyle($(el, '[data-handle="e"]')).display).to.equal('none');
  });

  it('free: an edge handle changes one side only', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const before = el.crop.pixels;
    const from = centerOf($(el, '[data-handle="e"]'));
    await drag(from, [from[0] + 30, from[1] + 30]);
    const after = rec.change[0].crop.pixels;
    expect(after.width).to.be.above(before.width);
    expect(after.height).to.equal(before.height);
    expect(after.x).to.equal(before.x);
    expect(after.y).to.equal(before.y);
  });

  it('dragging past the image edge clamps the box inside the image', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const from = centerOf($(el, '.td-cropper__box'));
    await drag(from, [Math.min(790, from[0] + 400), Math.min(590, from[1] + 300)]);
    const p = rec.change[0].crop.pixels;
    expect(p.x + p.width).to.equal(1600);
    expect(p.y + p.height).to.equal(900);
    expect(p.width).to.equal(800);
    const n = rec.change[0].crop.normalized;
    expect(n.x + n.width).to.be.at.most(1);
    expect(n.y + n.height).to.be.at.most(1);
  });

  it('Escape mid-drag: original box, no event, swallowed (a surrounding keydown listener never sees it)', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5) });
    const before = el.crop;
    const rec = record(el);
    const seen = [];
    const onKey = (e) => seen.push(e.key);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey);
    extra.push(() => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keydown', onKey); });
    const from = centerOf($(el, '.td-cropper__box'));
    await sendMouse({ type: 'move', position: from });
    await sendMouse({ type: 'down' });
    await mouseTo(from, [from[0] + 50, from[1] + 30]);
    expect(rec.input.length).to.be.greaterThan(0);
    expect(el.hasAttribute('data-dragging')).to.equal(true);
    const inputs = rec.input.length;
    await sendKeys({ press: 'Escape' });
    await frame();
    expect(el.crop).to.deep.equal(before);
    expect(el.hasAttribute('data-dragging')).to.equal(false);
    expect(seen).to.deep.equal([]);
    await mouseTo([from[0] + 50, from[1] + 30], [from[0] + 80, from[1] + 40], 3);
    await sendMouse({ type: 'up' });
    await frame();
    expect(rec.change.length).to.equal(0);
    expect(rec.input.length).to.equal(inputs);
    expect(el.crop).to.deep.equal(before);
  });

  it('pinch (two synthetic touch pointers) shrinks the box around their midpoint, source pinch', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const before = el.crop.pixels;
    const box = $(el, '.td-cropper__box');
    const [cx, cy] = centerOf(box);
    pe('pointerdown', box, 1, cx - 20, cy);
    pe('pointerdown', box, 2, cx + 20, cy);
    pe('pointermove', box, 1, cx - 60, cy);
    pe('pointermove', box, 2, cx + 60, cy);
    await frame();
    expect(rec.input.length).to.be.greaterThan(0);
    expect(rec.input[rec.input.length - 1].source).to.equal('pinch');
    pe('pointerup', box, 1, cx - 60, cy);
    await frame();
    expect(rec.change.length).to.equal(1);
    expect(rec.change[0].source).to.equal('pinch');
    const p = rec.change[0].crop.pixels;
    expect(Math.abs(p.width - before.width / 3)).to.be.at.most(2);
    expect(Math.abs(p.height - before.height / 3)).to.be.at.most(2);
    // centre kept (the midpoint was the box centre) — within the display rounding of the centre point
    const s = parseFloat(el.style.getPropertyValue('--_tdc-img-w')) / 1600;
    expect(Math.abs((p.x + p.width / 2) - (before.x + before.width / 2))).to.be.at.most(1 / s + 1);
    expect(Math.abs((p.y + p.height / 2) - (before.y + before.height / 2))).to.be.at.most(1 / s + 1);
    // the remaining finger is ignored until it lifts
    pe('pointermove', box, 2, cx + 90, cy);
    pe('pointerup', box, 2, cx + 90, cy);
    await frame();
    expect(rec.change.length).to.equal(1);
  });

  it('wheel: deltaMode 0 / 1 and ctrlKey (trackpad pinch) zoom around the pointer, source wheel, default prevented', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const stage = $(el, '.td-cropper__stage');
    const [cx, cy] = centerOf($(el, '.td-cropper__box'));
    const wheel = (o) => stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, ...o }));
    const w0 = el.crop.pixels.width;
    expect(wheel({ deltaY: -100, deltaMode: 0 })).to.equal(false);
    expect(rec.change.length).to.equal(1);
    expect(rec.change[0].source).to.equal('wheel');
    const w1 = rec.change[0].crop.pixels.width;
    expect(Math.abs(w1 - w0 * Math.exp(-0.2))).to.be.at.most(1);
    expect(wheel({ deltaY: 3, deltaMode: 1 })).to.equal(false);
    expect(rec.change.length).to.equal(2);
    expect(rec.change[1].crop.pixels.width).to.be.above(w1);
    expect(wheel({ deltaY: -40, deltaMode: 0, ctrlKey: true })).to.equal(false);
    expect(rec.change.length).to.equal(3);
    expect(rec.change[2].source).to.equal('wheel');
    expect(rec.change[2].crop.pixels.width).to.be.below(rec.change[1].crop.pixels.width);
  });

  it('focal point: a click (≤ 4 px) on the image sets it, dragging it moves it — normalised to the whole image', async () => {
    const { el } = await mount({ crop: crop(0.5, 0.5, 0.25, 0.25), 'focal-point': '' });
    const rec = record(el);
    const area = $(el, '.td-cropper__area').getBoundingClientRect();
    // a point on the image OUTSIDE the box (top-left quarter)
    const at = [Math.round(area.x + area.width * 0.2), Math.round(area.y + area.height * 0.3)];
    await drag(at, [at[0] + 2, at[1] + 1], 1);
    expect(rec.focal.length).to.equal(1);
    expect(rec.focal[0].source).to.equal('pointer');
    const f = rec.focal[0].focalPoint;
    expect(Math.abs(f.x - 0.2)).to.be.below(0.01);
    expect(Math.abs(f.y - 0.3)).to.be.below(0.01);
    expect(rec.change.length).to.equal(0);
    const point = $(el, '.td-cropper__focal');
    expect(point.hidden).to.equal(false);
    await frame();
    const from = centerOf(point);
    await drag(from, [from[0] + 40, from[1] + 20]);
    expect(rec.focal.length).to.equal(2);
    expect(rec.focal[1].focalPoint.x).to.be.above(f.x + 0.05);
    expect(rec.change.length).to.equal(0);
    // a tap on the box (focal tool on) sets the point too, the box stays
    const before = el.crop;
    const bc = centerOf($(el, '.td-cropper__box'));
    await drag(bc, [bc[0] + 1, bc[1] + 1], 1);
    expect(rec.focal.length).to.equal(3);
    expect(Math.abs(rec.focal[2].focalPoint.x - 0.625)).to.be.below(0.01);
    expect(el.crop).to.deep.equal(before);
    expect(rec.change.length).to.equal(0);
  });

  it('a programmatic set is silent; disabled ignores the pointer', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5) });
    const rec = record(el);
    el.crop = { normalized: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } };
    el.focalPoint = { x: 0.4, y: 0.4 };
    el.setAttribute('crop', crop(0, 0, 0.5, 0.5));
    el.reset();
    el.setAttribute('disabled', '');
    const before = el.crop;
    const from = centerOf($(el, '.td-cropper__box'));
    await drag(from, [from[0] + 40, from[1] + 20]);
    expect(el.crop).to.deep.equal(before);
    expect(rec.input.length + rec.change.length + rec.focal.length).to.equal(0);
  });

  it('crop dialog: an Escape consumed by an in-progress drag does not close the dialog; the next Escape cancels', async () => {
    const p = TdCropper.openDialog({ src: FIX, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
    const root = () => document.querySelector('.td-crop-dialog');
    const cropper = () => root().querySelector('td-cropper');
    while (!(root().getAttribute('data-state') === 'open' && cropper().getAttribute('data-state') === 'ready')) await frame();
    const before = cropper().crop;
    const from = centerOf($(cropper(), '.td-cropper__box'));
    await sendMouse({ type: 'move', position: from });
    await sendMouse({ type: 'down' });
    await mouseTo(from, [from[0] + 40, from[1] + 20]);
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
    await frame();
    expect(root().getAttribute('data-state')).to.equal('open');
    expect(cropper().crop).to.deep.equal(before);
    await sendKeys({ press: 'Escape' });
    expect(await p).to.deep.equal({ status: 'cancelled' });
    while (document.querySelector('.td-crop-dialog')) await frame();
  });
});
