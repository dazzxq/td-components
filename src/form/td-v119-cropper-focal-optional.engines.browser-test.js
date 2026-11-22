import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-cropper.js';

// v0.119.0 (plan docs/internal/plans/v0.119.0-crop-output.md QĐ2) — <td-cropper focal-optional>: a dimmed centre marker
// while no point is set (focalPoint stays null), keyboard from unset, "Dùng giữa ảnh" clear, reset to the initial value,
// (focal mode: see the v120 file), and the unchanged toggle without it. Pointer input is synthetic (PointerEvent on the
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

/** mount a box cropper with the focal tool and focal-optional (null attr value removes one) (640 px wide, top-left) and wait for image-ready (`rec` listens from before it) */
async function mount(attrs = {}, { prep = null } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', '640px'], ['background', '#fff']]) {
    wrap.style.setProperty(k, v); // test page only
  }
  const el = /** @type {any} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', 'focal-point': '', 'focal-optional': '', ...NAT, ...attrs })) if (v !== null) el.setAttribute(k, v);
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


describe('<td-cropper focal-optional> (v0.119.0)', () => {
  it('unset: marker shown in the centre with the unset class, focalPoint stays null, toggle hidden, clear hidden', async () => {
    const { el, rec } = await mount();
    const m = $(el, '.td-cropper__focal');
    expect(shown(m), 'marker').to.equal(true);
    expect(m.classList.contains('td-cropper__focal--unset')).to.equal(true);
    expect(el.focalPoint).to.equal(null);
    expect(el.getResult().focalPoint).to.equal(null);
    expect(rec.focal).to.deep.equal([]);
    const r = m.getBoundingClientRect();
    const [cx, cy] = at(el, 0.5, 0.5);
    expect(Math.abs(r.x + r.width / 2 - cx)).to.be.at.most(1);
    expect(Math.abs(r.y + r.height / 2 - cy)).to.be.at.most(1);
    expect(shown($(el, '.td-cropper__focal-toggle')), 'toggle').to.equal(false);
    expect(shown($(el, '.td-cropper__focal-clear')), 'clear').to.equal(false);
    expect($(el, '.td-cropper__focal-clear').textContent).to.equal('Dùng giữa ảnh');
  });

  it('pointer placement works as today; the marker loses the unset class and the clear button shows', async () => {
    const { el, rec } = await mount();
    const stage = $(el, '.td-cropper__stage');
    const [x, y] = at(el, 0.25, 0.25);
    pe('pointerdown', stage, x, y);
    pe('pointerup', stage, x, y);
    await frame();
    expect(el.focalPoint.x).to.be.closeTo(0.25, 0.01);
    expect(el.focalPoint.y).to.be.closeTo(0.25, 0.01);
    expect(rec.focal.length).to.equal(1);
    expect(rec.focal[0].source).to.equal('pointer');
    expect($(el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset')).to.equal(false);
    expect(shown($(el, '.td-cropper__focal-clear'))).to.equal(true);
    expect(shown($(el, '.td-cropper__focal-toggle'))).to.equal(false);
  });

  it('keyboard from unset: centre plus one step, one event with source keyboard', async () => {
    const { el, rec } = await mount();
    $(el, '.td-cropper__focal').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(el.focalPoint.x).to.be.closeTo(0.51, 1e-9);
    expect(el.focalPoint.y).to.be.closeTo(0.5, 1e-9);
    expect(rec.focal.length).to.equal(1);
    expect(rec.focal[0].source).to.equal('keyboard');
    expect(rec.focal[0].focalPoint.x).to.be.closeTo(0.51, 1e-9);
    await sendKeys({ press: 'Shift+ArrowDown' });
    expect(el.focalPoint.y).to.be.closeTo(0.6, 1e-9);
    expect(rec.focal.length).to.equal(2);
  });

  it('"Dùng giữa ảnh" by keyboard: null event with source clear, button hidden, focus not on body', async () => {
    const { el, rec } = await mount({ focal: JSON.stringify({ v: 1, x: 0.2, y: 0.7 }) });
    const clear = $(el, '.td-cropper__focal-clear');
    expect(shown(clear)).to.equal(true);
    clear.focus();
    await sendKeys({ press: 'Enter' });
    expect(rec.focal).to.deep.equal([{ focalPoint: null, source: 'clear' }]);
    expect(el.focalPoint).to.equal(null);
    expect(clear.hidden).to.equal(true);
    expect(document.activeElement === document.body, 'focus on body').to.equal(false);
    expect(el.contains(document.activeElement), 'focus inside the cropper').to.equal(true);
    expect(document.activeElement === $(el, '.td-cropper__reset'), 'next toolbar control').to.equal(true);
    expect($(el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset')).to.equal(true);
  });

  it('reset restores the initial focal; a null initial value goes back to null', async () => {
    const { el } = await mount();
    el.focalPoint = null;
    el.focalPoint = { x: 0.3, y: 0.3 };
    el.reset();
    expect(el.focalPoint).to.deep.equal({ x: 0.3, y: 0.3 });
    const b = await mount();
    const stage = $(b.el, '.td-cropper__stage');
    const [x, y] = at(b.el, 0.7, 0.4);
    pe('pointerdown', stage, x, y);
    pe('pointerup', stage, x, y);
    await frame();
    expect(b.el.focalPoint).to.not.equal(null);
    $(b.el, '.td-cropper__reset').click();
    expect(b.el.focalPoint).to.equal(null);
    expect(b.rec.focal.map((e) => e.source)).to.deep.equal(['pointer', 'reset']);
    expect($(b.el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset')).to.equal(true);
  });

  it('focal mode honours the flag since v0.120.0 (no centre point, unset class; details in the v120 file)', async () => {
    const { el } = await mount({ mode: 'focal' });
    expect(el.focalPoint).to.equal(null);
    expect($(el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset')).to.equal(true);
    expect(shown($(el, '.td-cropper__focal-clear'))).to.equal(false);
  });

  it('without the flag: the toggle is rendered, no marker while unset, no clear button, keys do nothing', async () => {
    const { el, rec } = await mount({ 'focal-optional': null });
    expect(shown($(el, '.td-cropper__focal-toggle'))).to.equal(true);
    expect(shown($(el, '.td-cropper__focal'))).to.equal(false);
    expect(shown($(el, '.td-cropper__focal-clear'))).to.equal(false);
    el.focalPoint = { x: 0.4, y: 0.4 };
    expect(shown($(el, '.td-cropper__focal-clear'))).to.equal(false);
    expect($(el, '.td-cropper__focal').classList.contains('td-cropper__focal--unset')).to.equal(false);
    expect(rec.focal).to.deep.equal([]);
  });

  it('the property mirrors the attribute and switches the UI at run time', async () => {
    const { el } = await mount({ 'focal-optional': null });
    expect(el.focalOptional).to.equal(false);
    el.focalOptional = true;
    expect(el.hasAttribute('focal-optional')).to.equal(true);
    expect(shown($(el, '.td-cropper__focal'))).to.equal(true);
    expect(shown($(el, '.td-cropper__focal-toggle'))).to.equal(false);
    el.focalOptional = false;
    expect(shown($(el, '.td-cropper__focal'))).to.equal(false);
    expect(shown($(el, '.td-cropper__focal-toggle'))).to.equal(true);
  });
});
