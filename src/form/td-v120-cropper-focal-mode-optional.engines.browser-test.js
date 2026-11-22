import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-cropper.js';

// v0.120.0 (plan docs/internal/plans/v0.120.0-focal-mode-optional.md QĐ1 / QĐ6 / QĐ8) — <td-cropper mode="focal" focal-optional>:
// no auto-centre, null result, pointer place, keyboard from unset, clear (focus kept), reset, runtime toggle, and the
// unchanged auto-centre without the flag. Pointer input is synthetic (PointerEvent on the
// stage), so the file runs in the shared engines group. Every wait is a real signal (image-ready, frames).
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
  await frame();
});

/** mount a FOCAL cropper with focal-optional (null attr value removes one) (640 px wide, top-left) and wait for image-ready (`rec` listens from before it) */
async function mount(attrs = {}, { prep = null } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', '640px'], ['background', '#fff']]) {
    wrap.style.setProperty(k, v); // test page only
  }
  const el = /** @type {any} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', mode: 'focal', 'focal-optional': '', ...NAT, ...attrs })) if (v !== null) el.setAttribute(k, v);
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



const CLEAR = '.td-cropper__focal-clear';
const unset = (el) => $(el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset');

describe('<td-cropper mode="focal" focal-optional> (v0.120.0)', () => {
  it('no auto-centre: focalPoint null, unset marker in the centre, clear hidden, no crop, no events', async () => {
    const { el, rec } = await mount();
    expect(el.focalPoint).to.equal(null);
    expect(el.getResult()).to.deep.equal({ crop: null, focalPoint: null });
    expect(unset(el)).to.equal(true);
    expect(shown($(el, '.td-cropper__focal')), 'marker').to.equal(true);
    const m = $(el, '.td-cropper__focal').getBoundingClientRect();
    const [cx, cy] = at(el, 0.5, 0.5);
    expect(Math.abs(m.x + m.width / 2 - cx)).to.be.at.most(1);
    expect(Math.abs(m.y + m.height / 2 - cy)).to.be.at.most(1);
    expect(shown($(el, CLEAR)), 'clear').to.equal(false);
    expect(shown($(el, '.td-cropper__reset')), 'reset').to.equal(true);
    expect(rec.focal).to.deep.equal([]);
    expect(rec.change).to.deep.equal([]);
  });

  it('pointer places the point (no crop frame); the clear button shows next to Reset', async () => {
    const { el, rec } = await mount();
    const stage = $(el, '.td-cropper__stage');
    const [x, y] = at(el, 0.25, 0.75);
    pe('pointerdown', stage, x, y);
    pe('pointerup', stage, x, y);
    await frame();
    expect(el.focalPoint.x).to.be.closeTo(0.25, 0.01);
    expect(el.focalPoint.y).to.be.closeTo(0.75, 0.01);
    expect(rec.focal.length).to.equal(1);
    expect(rec.focal[0].source).to.equal('pointer');
    expect(el.getResult().crop).to.equal(null);
    expect(rec.change).to.deep.equal([]);
    expect(unset(el)).to.equal(false);
    expect(shown($(el, CLEAR))).to.equal(true);
    expect(shown($(el, '.td-cropper__box')), 'no frame').to.equal(false);
  });

  it('keyboard from unset starts at the centre (source keyboard)', async () => {
    const { el, rec } = await mount();
    $(el, '.td-cropper__focal').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(el.focalPoint.x).to.be.closeTo(0.51, 1e-9);
    expect(el.focalPoint.y).to.be.closeTo(0.5, 1e-9);
    expect(rec.focal.map((e) => e.source)).to.deep.equal(['keyboard']);
  });

  it('"Dùng giữa ảnh" by keyboard: null event source clear, hidden after, focus not lost to body', async () => {
    const { el, rec } = await mount({ focal: JSON.stringify({ v: 1, x: 0.2, y: 0.7 }) });
    const clear = $(el, CLEAR);
    expect(shown(clear)).to.equal(true);
    clear.focus();
    await sendKeys({ press: 'Enter' });
    expect(rec.focal).to.deep.equal([{ focalPoint: null, source: 'clear' }]);
    expect(el.focalPoint).to.equal(null);
    expect(clear.hidden).to.equal(true);
    expect(document.activeElement === document.body, 'focus on body').to.equal(false);
    expect(el.contains(document.activeElement), 'focus inside').to.equal(true);
    expect(document.activeElement === $(el, '.td-cropper__reset'), 'Reset has the focus').to.equal(true);
    expect(unset(el)).to.equal(true);
  });

  it('the clear button is a click target in focal mode (the other tools stay inert)', async () => {
    const { el, rec } = await mount({ focal: JSON.stringify({ v: 1, x: 0.3, y: 0.3 }) });
    $(el, CLEAR).click();
    expect(el.focalPoint).to.equal(null);
    expect(rec.focal.map((e) => e.source)).to.deep.equal(['clear']);
  });

  it('reset restores the initial focal; a null initial value goes back to null (not the centre)', async () => {
    const a = await mount({ focal: JSON.stringify({ v: 1, x: 0.2, y: 0.7 }) });
    expect(a.el.focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    $(a.el, CLEAR).click();
    $(a.el, '.td-cropper__reset').click();
    expect(a.el.focalPoint).to.deep.equal({ x: 0.2, y: 0.7 });
    const b = await mount();
    const [x, y] = at(b.el, 0.7, 0.4);
    pe('pointerdown', $(b.el, '.td-cropper__stage'), x, y);
    pe('pointerup', $(b.el, '.td-cropper__stage'), x, y);
    await frame();
    expect(b.el.focalPoint).to.not.equal(null);
    $(b.el, '.td-cropper__reset').click();
    expect(b.el.focalPoint).to.equal(null);
    expect(b.rec.focal.map((e) => e.source)).to.deep.equal(['pointer', 'reset']);
    expect(unset(b.el)).to.equal(true);
  });

  it('QĐ8 runtime toggle: adding drops only the auto-centre, removing brings it back; explicit points survive both', async () => {
    const { el, rec } = await mount({ 'focal-optional': null });
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 }); // auto-centre without the flag
    el.focalOptional = true;
    expect(el.focalPoint).to.equal(null);
    expect(unset(el)).to.equal(true);
    el.focalOptional = false;
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(unset(el)).to.equal(false);
    expect(rec.focal, 'silent').to.deep.equal([]);
    // explicit (user placed) point survives both toggles
    const [x, y] = at(el, 0.2, 0.3);
    pe('pointerdown', $(el, '.td-cropper__stage'), x, y);
    pe('pointerup', $(el, '.td-cropper__stage'), x, y);
    await frame();
    const p = { ...el.focalPoint };
    el.focalOptional = true;
    expect(el.focalPoint).to.deep.equal(p);
    el.focalOptional = false;
    expect(el.focalPoint).to.deep.equal(p);
    // a seeded point too
    const s = await mount({ 'focal-optional': null, focal: JSON.stringify({ v: 1, x: 0.4, y: 0.6 }) });
    s.el.focalOptional = true;
    expect(s.el.focalPoint).to.deep.equal({ x: 0.4, y: 0.6 });
    s.el.focalOptional = false;
    expect(s.el.focalPoint).to.deep.equal({ x: 0.4, y: 0.6 });
  });

  it('without the flag focal mode is unchanged: auto-centre, no unset class, no clear button', async () => {
    const { el, rec } = await mount({ 'focal-optional': null });
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(unset(el)).to.equal(false);
    expect(shown($(el, CLEAR))).to.equal(false);
    $(el, CLEAR).click(); // hidden + inert in focal mode
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    expect(rec.focal).to.deep.equal([]);
  });
});
