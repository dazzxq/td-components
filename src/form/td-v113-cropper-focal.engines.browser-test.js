import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdCropper } from './td-cropper.js';
import { openCropDialog } from '../feedback/crop-dialog.js';

// v0.113.0 (plan docs/internal/plans/v0.113.0-focal-only-mode.md QĐ1 + QĐ2 + QĐ2a) — <td-cropper mode="focal">: a focal
// point only, no crop box. Hidden box / ratios / zoom / toggle, centre by default (no event), a press anywhere places
// the point and drags it on, arrows on the marker, "Đặt lại" to the starting value, `crop` ignored, getResult; then
// openCropDialog({ mode: 'focal' }). Pointer input is synthetic (PointerEvent on the stage — capture throws and is caught),
// so the file runs in the shared engines group. Every wait is a real signal (image-ready, frames, polled state).
// DOM nodes are compared as booleans (chai hangs on DOM diffs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const FIX = '/test/fixtures/crop-16x9.svg'; // 1600 × 900
const NAT = { 'natural-width': '1600', 'natural-height': '900' };
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
async function until(fn, what = 'condition', ms = 5000) {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => requestAnimationFrame(r));
  }
}
const extra = [];
const warns = [];
const realWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = realWarn;
  extra.splice(0).reverse().forEach((f) => f());
  for (const b of document.body.querySelectorAll(':scope > .td-crop-dialog .td-crop-dialog__cancel')) b.click();
  await until(() => !document.body.querySelector(':scope > .td-crop-dialog'), 'crop dialog gone').catch(() => {});
  await frame();
});

/** mount a focal cropper (640 px wide, top-left) and wait for image-ready (`rec` listens from before it) */
async function mount(attrs = {}, { prep = null } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', '640px'], ['background', '#fff']]) {
    wrap.style.setProperty(k, v); // test page only
  }
  const el = /** @type {TdCropper} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', mode: 'focal', ...NAT, ...attrs })) el.setAttribute(k, v);
  if (prep) prep(el);
  const rec = record(el);
  const ready = new Promise((r) => el.addEventListener('image-ready', (e) => r(e.detail), { once: true }));
  wrap.append(el);
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  await ready;
  await frame();
  return { el, rec };
}
function record(el) {
  const rec = { input: [], change: [], focal: [] };
  el.addEventListener('crop-input', (e) => rec.input.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('crop-change', (e) => rec.change.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('focal-change', (e) => rec.focal.push(JSON.parse(JSON.stringify(e.detail))));
  return rec;
}
const $ = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));
/** rendered (no box when it or an ancestor is display: none) */
const shown = (node) => !!node && node.getClientRects().length > 0;
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;
/** client point at (fx, fy) of the rendered image */
function at(el, fx, fy) {
  const r = $(el, '.td-cropper__img').getBoundingClientRect();
  return [r.x + r.width * fx, r.y + r.height * fy];
}
function pe(type, target, x, y, pointerType = 'mouse') {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, pointerType,
    isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
}

describe('<td-cropper mode="focal"> — no box, a focal point only (v0.113.0)', () => {
  it('host data-mode="focal"; box, handles, ratio group, zoom buttons and focal toggle hidden; "Đặt lại" kept', async () => {
    const { el } = await mount({ 'aspect-ratio': '16/9', shape: 'circle' });
    expect(el.getAttribute('data-mode')).to.equal('focal');
    expect(shown($(el, '.td-cropper__box')), 'box').to.equal(false);
    expect([...el.querySelectorAll('.td-cropper__handle')].some(shown), 'handles').to.equal(false);
    expect(shown($(el, '.td-cropper__ratios')), 'ratios').to.equal(false);
    expect(shown($(el, '.td-cropper__zoom-in')), 'zoom in').to.equal(false);
    expect(shown($(el, '.td-cropper__zoom-out')), 'zoom out').to.equal(false);
    expect(shown($(el, '.td-cropper__focal-toggle')), 'focal toggle').to.equal(false);
    expect(el.querySelector('td-slider') === null, 'no zoom slider').to.equal(true);
    expect(shown($(el, '.td-cropper__reset')), 'reset').to.equal(true);
    expect(shown($(el, '.td-cropper__focal')), 'focal marker').to.equal(true);
    // aspect-ratio / shape ignored silently
    expect(el.hasAttribute('data-locked'), 'data-locked').to.equal(false);
    expect(el.hasAttribute('data-shape'), 'data-shape').to.equal(false);
    expect(el.hasAttribute('data-small-box'), 'data-small-box').to.equal(false);
    expect(warns, 'no warning').to.deep.equal([]);
    // only the focal point is in the Tab order of the stage
    expect($(el, '.td-cropper__box').tabIndex).to.equal(-1);
    expect([...el.querySelectorAll('.td-cropper__handle--corner')].every((c) => c.tabIndex === -1)).to.equal(true);
    expect($(el, '.td-cropper__focal').tabIndex).to.equal(0);
  });

  it('an invalid aspect-ratio / a stray shape do not warn either', async () => {
    await mount({ 'aspect-ratio': 'abc', shape: 'circle' });
    expect(warns).to.deep.equal([]);
  });

  it('no value ⇒ the centre once ready, without focal-change; the marker sits in the middle of the image', async () => {
    const { el, rec } = await mount();
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(rec.focal).to.deep.equal([]);
    const m = $(el, '.td-cropper__focal').getBoundingClientRect();
    const [cx, cy] = at(el, 0.5, 0.5);
    expect(Math.abs(m.x + m.width / 2 - cx)).to.be.at.most(1);
    expect(Math.abs(m.y + m.height / 2 - cy)).to.be.at.most(1);
  });

  it('a given value is kept (attribute or property)', async () => {
    const { el } = await mount({ focal: JSON.stringify({ v: 1, x: 0.2, y: 0.7 }) });
    expect(el.focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    el.focalPoint = { x: 0.9, y: 0.1 };
    expect(el.focalPoint).to.deep.equal({ x: 0.9, y: 0.1 });
    el.focalPoint = null; // ready: never null in focal mode
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
  });

  it('a press anywhere on the image places the point there and drags it on in the same gesture (one focal-change)', async () => {
    const { el, rec } = await mount();
    const stage = $(el, '.td-cropper__stage');
    const [x0, y0] = at(el, 0.25, 0.25);
    pe('pointerdown', stage, x0, y0);
    // placed at once (shown), the event waits for the end of the gesture
    expect(near(el.focalPoint.x, 0.25) && near(el.focalPoint.y, 0.25), JSON.stringify(el.focalPoint)).to.equal(true);
    expect(rec.focal.length).to.equal(0);
    expect(document.activeElement === $(el, '.td-cropper__focal'), 'marker focused').to.equal(true);
    const [x1, y1] = at(el, 0.4, 0.6);
    pe('pointermove', stage, x1, y1);
    await frame();
    expect(near(el.focalPoint.x, 0.4) && near(el.focalPoint.y, 0.6), JSON.stringify(el.focalPoint)).to.equal(true);
    pe('pointerup', stage, x1, y1);
    await frame();
    expect(rec.focal.length).to.equal(1);
    expect(rec.focal[0].source).to.equal('pointer');
    expect(near(rec.focal[0].focalPoint.x, 0.4) && near(rec.focal[0].focalPoint.y, 0.6)).to.equal(true);
    expect(rec.input.length + rec.change.length, 'never a crop event').to.equal(0);
    expect(el.crop).to.equal(null);
  });

  it('a tap (touch, no move) places the point; off the image it is clamped to the edge', async () => {
    const { el, rec } = await mount();
    const stage = $(el, '.td-cropper__stage');
    const [x, y] = at(el, 0.8, 0.3);
    pe('pointerdown', stage, x, y, 'touch');
    pe('pointerup', stage, x, y, 'touch');
    await frame();
    expect(near(el.focalPoint.x, 0.8) && near(el.focalPoint.y, 0.3), JSON.stringify(el.focalPoint)).to.equal(true);
    expect(rec.focal.length).to.equal(1);
    const s = stage.getBoundingClientRect();
    pe('pointerdown', stage, s.x + 2, s.y + 2); // stage padding, above-left of the image
    pe('pointerup', stage, s.x + 2, s.y + 2);
    await frame();
    expect(el.focalPoint).to.deep.equal({ x: 0, y: 0 });
    expect(rec.focal.length).to.equal(2);
  });

  it('Escape during the gesture puts the old point back, no event', async () => {
    const { el, rec } = await mount();
    const stage = $(el, '.td-cropper__stage');
    const [x, y] = at(el, 0.1, 0.9);
    pe('pointerdown', stage, x, y);
    expect(near(el.focalPoint.x, 0.1)).to.equal(true);
    await sendKeys({ press: 'Escape' });
    pe('pointerup', stage, x, y);
    await frame();
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(rec.focal.length).to.equal(0);
  });

  it('arrows on the marker move it (1 %, Shift 10 %); + / − and the wheel zoom nothing (the page may scroll)', async () => {
    const { el, rec } = await mount();
    const marker = $(el, '.td-cropper__focal');
    marker.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(el.focalPoint).to.deep.equal({ x: 0.51, y: 0.5 });
    await sendKeys({ press: 'Shift+ArrowDown' });
    expect(el.focalPoint).to.deep.equal({ x: 0.51, y: 0.6 });
    expect(rec.focal.map((f) => f.source)).to.deep.equal(['keyboard', 'keyboard']);
    await sendKeys({ press: '+' });
    await sendKeys({ press: '-' });
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 100, clientY: 100 });
    $(el, '.td-cropper__stage').dispatchEvent(wheel);
    await frame();
    expect(wheel.defaultPrevented, 'wheel left to the page').to.equal(false);
    expect(rec.input.length + rec.change.length).to.equal(0);
    expect(el.focalPoint).to.deep.equal({ x: 0.51, y: 0.6 });
  });

  it('"Đặt lại" goes back to the starting value (focal-change source reset), else to the centre', async () => {
    const { el, rec } = await mount({ focal: JSON.stringify({ v: 1, x: 0.2, y: 0.3 }) });
    const stage = $(el, '.td-cropper__stage');
    const [x, y] = at(el, 0.7, 0.7);
    pe('pointerdown', stage, x, y);
    pe('pointerup', stage, x, y);
    await frame();
    $(el, '.td-cropper__reset').click();
    expect(el.focalPoint).to.deep.equal({ x: 0.2, y: 0.3 });
    expect(rec.focal.at(-1).source).to.equal('reset');
    expect(rec.change.length, 'never crop-change').to.equal(0);

    const b = await mount();
    const [x2, y2] = at(b.el, 0.1, 0.1);
    pe('pointerdown', $(b.el, '.td-cropper__stage'), x2, y2);
    pe('pointerup', $(b.el, '.td-cropper__stage'), x2, y2);
    await frame();
    $(b.el, '.td-cropper__reset').click();
    expect(b.el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(b.rec.focal.at(-1).source).to.equal('reset');
  });

  it('crop (attribute / property) is ignored: crop and getResult().crop are always null', async () => {
    const c = JSON.stringify({ v: 1, x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    const { el, rec } = await mount({ crop: c });
    expect(el.crop).to.equal(null);
    expect(el.getResult()).to.deep.equal({ crop: null, focalPoint: { x: 0.5, y: 0.5 } });
    el.crop = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    el.setAttribute('crop', JSON.stringify({ v: 1, x: 0.3, y: 0.3, width: 0.2, height: 0.2 }));
    expect(el.crop).to.equal(null);
    expect(el.getResult().crop).to.equal(null);
    expect(rec.input.length + rec.change.length).to.equal(0);
  });

  it('switching mode at run time: to box the kept crop comes back and the unasked centre is dropped; back to focal', async () => {
    const c = JSON.stringify({ v: 1, x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
    const { el } = await mount({ crop: c });
    el.setAttribute('mode', 'box');
    await frame();
    expect(el.hasAttribute('data-mode')).to.equal(false);
    const n = el.crop.normalized;
    expect(near(n.x, 0.1, 1e-3) && near(n.y, 0.2, 1e-3) && near(n.width, 0.5, 1e-3) && near(n.height, 0.4, 1e-3), JSON.stringify(n)).to.equal(true);
    expect(el.focalPoint, 'no value nobody gave').to.equal(null);
    expect(shown($(el, '.td-cropper__box'))).to.equal(true);
    el.setAttribute('mode', 'focal');
    await frame();
    expect(el.getAttribute('data-mode')).to.equal('focal');
    expect(el.getResult()).to.deep.equal({ crop: null, focalPoint: { x: 0.5, y: 0.5 } });
    // a point the user placed survives the switch
    const [x, y] = at(el, 0.3, 0.4);
    pe('pointerdown', $(el, '.td-cropper__stage'), x, y);
    pe('pointerup', $(el, '.td-cropper__stage'), x, y);
    await frame();
    el.setAttribute('mode', 'pan');
    await frame();
    expect(el.getAttribute('data-mode')).to.equal('pan');
    expect(near(el.focalPoint.x, 0.3) && near(el.focalPoint.y, 0.4)).to.equal(true);
    expect(el.crop !== null).to.equal(true);
  });

  it('mode grammar: trimmed and case-insensitive (" FOCAL ")', async () => {
    const { el } = await mount({ mode: ' FOCAL\n' });
    expect(el.getAttribute('data-mode')).to.equal('focal');
  });
});

describe('openCropDialog({ mode: "focal" }) (v0.113.0 QĐ2 / QĐ2a)', () => {
  const SRC = { src: FIX, naturalWidth: 1600, naturalHeight: 900 };
  const root = () => /** @type {HTMLElement|null} */ (document.body.querySelector(':scope > .td-crop-dialog'));
  async function ready() {
    const d = await until(() => root(), 'crop dialog');
    const cr = d.querySelector('td-cropper');
    await until(() => cr.getAttribute('data-state') === 'ready', 'cropper ready');
    return { d, cr, confirm: /** @type {HTMLButtonElement} */ (d.querySelector('.td-crop-dialog__confirm')) };
  }

  it('cropper mode="focal" seeded with focalPoint, title focalTitle, ratio / shape / crop ignored; Apply unchanged ⇒ changed false', async () => {
    const p = openCropDialog({
      ...SRC, mode: 'focal', focalPoint: { x: 0.2, y: 0.3 }, aspectRatio: 1, shape: 'circle', allowFocalPoint: false,
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    });
    const { d, cr, confirm } = await ready();
    expect(cr.getAttribute('mode')).to.equal('focal');
    expect(cr.hasAttribute('aspect-ratio') || cr.hasAttribute('shape') || cr.hasAttribute('focal-point')).to.equal(false);
    expect(d.querySelector('.td-modal__title').textContent).to.equal(TdCropper.labels.focalTitle);
    expect(TdCropper.labels.focalTitle).to.equal('Chọn điểm trọng tâm');
    expect(cr.focalPoint).to.deep.equal({ x: 0.2, y: 0.3 });
    await until(() => !confirm.disabled, 'Apply enabled');
    await until(() => document.activeElement === cr.querySelector('.td-cropper__focal'), 'focus on the focal point');
    confirm.click();
    expect(await p).to.deep.equal({ status: 'applied', crop: null, focalPoint: { x: 0.2, y: 0.3 }, changed: false });
  });

  it('a moved point ⇒ changed true; "Đặt lại" in the dialog returns to the seed', async () => {
    const p = openCropDialog({ ...SRC, mode: 'focal', focalPoint: { x: 0.2, y: 0.3 } });
    const { cr, confirm } = await ready();
    const marker = /** @type {HTMLElement} */ (cr.querySelector('.td-cropper__focal'));
    marker.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(cr.focalPoint).to.deep.equal({ x: 0.21, y: 0.3 });
    /** @type {HTMLElement} */ (cr.querySelector('.td-cropper__reset')).click();
    expect(cr.focalPoint).to.deep.equal({ x: 0.2, y: 0.3 });
    marker.focus();
    await sendKeys({ press: 'ArrowLeft' });
    confirm.click();
    expect(await p).to.deep.equal({ status: 'applied', crop: null, focalPoint: { x: 0.19, y: 0.3 }, changed: true });
  });

  it('no focalPoint ⇒ the centre; Apply needs no crop (result crop null, changed true: a new value to store)', async () => {
    const p = openCropDialog({ ...SRC, mode: 'focal' });
    const { cr, confirm } = await ready();
    expect(cr.getResult()).to.deep.equal({ crop: null, focalPoint: { x: 0.5, y: 0.5 } });
    await until(() => !confirm.disabled, 'Apply enabled');
    confirm.click();
    expect(await p).to.deep.equal({ status: 'applied', crop: null, focalPoint: { x: 0.5, y: 0.5 }, changed: true });
  });

  it('box stays the default: no mode ⇒ no attribute, the crop title', async () => {
    const p = openCropDialog({ ...SRC });
    const { d, cr } = await ready();
    expect(cr.hasAttribute('mode')).to.equal(false);
    expect(d.querySelector('.td-modal__title').textContent).to.equal(TdCropper.labels.dialogTitle);
    /** @type {HTMLElement} */ (d.querySelector('.td-crop-dialog__cancel')).click();
    expect((await p).status).to.equal('cancelled');
  });
});
