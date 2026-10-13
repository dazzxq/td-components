import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, sendKeys } from '@web/test-runner-commands';
import { TdCropper } from './td-cropper.js';

// v0.73.0 (plan docs/internal/plans/v0.73.0-cropper-pan-mode.md M1) — <td-cropper mode="pan">: the frame stands still in the
// middle of the stage, the image moves / zooms under it. Real mouse drags (sendMouse + pointer capture), synthetic
// touch pinch, wheel, keyboard, the zoom slider, the Tab order. Runs in its own browser instances (POINTER_FILES of
// web-test-runner.config.js). Every wait is on a real signal (image-ready, events, animation frames) — never a fixed
// sleep. DOM nodes are compared as booleans (chai hangs on DOM diffs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const FIX = '/test/fixtures/crop-16x9.svg'; // 1600 × 900, explicit intrinsic size
const W = 1600;
const H = 900;
const NAT = { 'natural-width': String(W), 'natural-height': String(H) };
// WebKit (like Safari's default) does not Tab to buttons; Option(Alt)+Tab reaches every control there.
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
/** poll a condition once per frame (a real signal, bounded) */
async function until(fn, what = 'condition', ms = 5000) {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => requestAnimationFrame(r));
  }
}
const extra = [];
afterEach(async () => {
  await resetMouse();
  extra.splice(0).reverse().forEach((f) => f());
  await frame();
});

/**
 * Mount `[button "trước"] <td-cropper> [button "sau"]` (top-left of the viewport, `width` px); wait for image-ready
 * unless `wait` is false.
 * @param {Record<string, string>} attrs
 */
async function mount(attrs = {}, { width = 640, wait = true, pan = true, before: prep = null } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', `${width}px`], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  const before = document.createElement('button');
  before.textContent = 'trước';
  const after = document.createElement('button');
  after.textContent = 'sau';
  const el = /** @type {TdCropper} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', ...(pan ? { mode: 'pan' } : {}), ...attrs })) el.setAttribute(k, v);
  if (prep) prep(el);
  const ready = new Promise((r) => el.addEventListener('image-ready', (e) => r(e.detail), { once: true }));
  wrap.append(before, el, after);
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  if (wait) { await ready; await frame(); }
  return { el, wrap, before, after, ready };
}
const crop = (x, y, w, h) => JSON.stringify({ v: 1, x, y, width: w, height: h });
const $ = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));
const rectOf = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
const frameOf = (el) => rectOf($(el, '.td-cropper__box'));
const imgOf = (el) => rectOf($(el, '.td-cropper__img'));
const centerOf = (node) => { const r = node.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
const sameBox = (a, b, tol = 0.5) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= tol);
/** the content box of the stage (the area the frame is centred in) */
function contentBox(el) {
  const stage = $(el, '.td-cropper__stage');
  const r = stage.getBoundingClientRect();
  const cs = getComputedStyle(stage);
  const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
  const x = r.x + n('border-left-width') + n('padding-left');
  const y = r.y + n('border-top-width') + n('padding-top');
  return {
    x, y,
    w: r.right - n('border-right-width') - n('padding-right') - x,
    h: r.bottom - n('border-bottom-width') - n('padding-bottom') - y,
  };
}
/** the frame is centred in the content box (± 1 px of rounding) and inside it */
function expectCentred(el, what = '') {
  const f = frameOf(el);
  const c = contentBox(el);
  expect(Math.abs((f.x + f.w / 2) - (c.x + c.w / 2)), `centred x ${what}`).to.be.at.most(1);
  expect(Math.abs((f.y + f.h / 2) - (c.y + c.h / 2)), `centred y ${what}`).to.be.at.most(1);
  expect(f.x >= c.x - 0.5 && f.y >= c.y - 0.5 && f.x + f.w <= c.x + c.w + 0.5 && f.y + f.h <= c.y + c.h + 0.5, `inside ${what}`).to.equal(true);
}
function record(el) {
  const rec = { input: [], change: [], focal: [], native: [] };
  el.addEventListener('crop-input', (e) => rec.input.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('crop-change', (e) => rec.change.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('focal-change', (e) => rec.focal.push(JSON.parse(JSON.stringify(e.detail))));
  // the slider's own `input` / `change` must never leave the cropper
  for (const t of ['input', 'change']) el.addEventListener(t, (e) => rec.native.push(e.type));
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
/** a short name for the focused element */
function nameOf(node) {
  if (!(node instanceof HTMLElement)) return String(node);
  if (node.getAttribute('role') === 'radio') return `ratio:${node.textContent}`;
  if (node.classList.contains('td-slider__input')) return 'slider';
  for (const c of ['zoom-out', 'zoom-in', 'focal-toggle', 'reset', 'box', 'focal']) {
    if (node.classList.contains(`td-cropper__${c}`)) return c;
  }
  if (node.hasAttribute('data-handle')) return node.getAttribute('data-handle');
  return node.textContent || node.tagName;
}
const radios = (el) => [...el.querySelectorAll('.td-cropper__ratios [role="radio"]')];
const pickRatio = (el, label) => /** @type {HTMLElement} */ (radios(el).find((b) => b.textContent === label)).click();
const slider = (el) => /** @type {HTMLElement & { getValue(): number }} */ ($(el, 'td-slider.td-cropper__zoom'));
const sliderInput = (el) => /** @type {HTMLInputElement} */ ($(el, '.td-cropper__zoom .td-slider__input'));
/** what the user does on the native range: `input` at every position, `change` when the gesture ends */
function slide(el, value, commit = false) {
  const input = sliderInput(el);
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
}
const centreOfCrop = (p) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 });
// 360 × 360 in the middle of the image: room to move and to zoom both ways
const MID = crop(0.3875, 0.3, 0.225, 0.4);
const MID_PX = { x: 620, y: 270, width: 360, height: 360 };

describe('td-cropper mode="pan" (v0.73.0)', () => {
  describe('structure and defaults', () => {
    it('no ratio given ⇒ 1:1 selected, no "Tự do" entry, a centred square frame, the widest view, no handles, the slider between − and +', async () => {
      const { el } = await mount(NAT);
      expect(el.getAttribute('data-mode')).to.equal('pan');
      expect(el.getAttribute('data-state')).to.equal('ready');
      const names = radios(el).map((b) => b.textContent);
      expect(names).to.deep.equal(['1:1', '4:3', '3:2', '16:9', '1.91:1']);
      expect(radios(el).filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)).to.deep.equal(['1:1']);
      expect(el.crop.aspectRatio).to.equal(1);
      expect(el.crop.pixels).to.deep.equal({ x: 350, y: 0, width: 900, height: 900 });
      const f = frameOf(el);
      expect(Math.abs(f.w - f.h)).to.be.at.most(1);
      expect(f.w).to.be.above(100);
      expectCentred(el);
      // the image covers the frame and is drawn under it at the frame's scale
      const img = imgOf(el);
      expect(Math.abs(img.h - f.h)).to.be.at.most(1);
      expect(Math.abs(img.w - f.w * (W / H))).to.be.at.most(1);
      for (const h of el.querySelectorAll('.td-cropper__handle')) expect(getComputedStyle(h).display).to.equal('none');
      const z = slider(el);
      expect(!!z).to.equal(true);
      expect(z.previousElementSibling === $(el, '.td-cropper__zoom-out')).to.equal(true);
      expect(z.nextElementSibling === $(el, '.td-cropper__zoom-in')).to.equal(true);
      expect(z.hasAttribute('name')).to.equal(false);
      expect(z.getAttribute('aria-label')).to.equal(TdCropper.labels.zoom);
      expect(z.getAttribute('value')).to.equal('0');
      expect(z.hasAttribute('disabled')).to.equal(false);
      // CSP: the CSSOM vars of the host are the only inline style of the cropper's own nodes
      for (let i = 0; i < el.style.length; i += 1) expect(el.style[i].startsWith('--_tdc-'), el.style[i]).to.equal(true);
    });

    it('presets with only a free entry ⇒ no ratio row, the ratio in force is 1:1', async () => {
      const { el } = await mount(NAT, { before: (c) => { c.presets = [{ label: 'Tự do', ratio: null }]; } });
      expect(radios(el).length).to.equal(0);
      expect($(el, '.td-cropper__ratios').hidden).to.equal(true);
      expect(el.crop.aspectRatio).to.equal(1);
      expect(el.crop.pixels).to.deep.equal({ x: 350, y: 0, width: 900, height: 900 });
      const f = frameOf(el);
      expect(Math.abs(f.w - f.h)).to.be.at.most(1);
    });

    it('an unknown `mode` value = box: no data-mode, no slider, the free entry and the handles are there', async () => {
      for (const mode of ['foo', 'PAN ', 'box', '']) {
        const { el, wrap } = await mount({ ...NAT, mode: mode === 'PAN ' ? 'pane' : mode }, { pan: false });
        expect(el.hasAttribute('data-mode'), mode).to.equal(false);
        expect(!!slider(el), mode).to.equal(false);
        expect(radios(el)[0].textContent, mode).to.equal('Tự do');
        expect(getComputedStyle($(el, '[data-handle="se"]')).display, mode).to.not.equal('none');
        expect(el.crop.pixels, mode).to.deep.equal({ x: 0, y: 0, width: W, height: H }); // the free box: the whole image
        wrap.remove();
      }
    });

    it('the stage shows the grab cursor only when ready and enabled', async () => {
      const { el } = await mount(NAT);
      const stage = $(el, '.td-cropper__stage');
      expect(getComputedStyle(stage).cursor).to.equal('grab');
      expect(getComputedStyle($(el, '.td-cropper__box')).cursor).to.equal('grab');
      el.setAttribute('disabled', '');
      await frame();
      expect(getComputedStyle(stage).cursor).to.not.equal('grab');
    });

    it('--td-cropper-pan-inset is the padding of the stage (a public token)', async () => {
      const { el } = await mount(NAT);
      expect(getComputedStyle($(el, '.td-cropper__stage')).paddingLeft).to.equal('24px');
      el.style.setProperty('--td-cropper-pan-inset', '40px');
      await frame();
      expect(getComputedStyle($(el, '.td-cropper__stage')).paddingLeft).to.equal('40px');
      expectCentred(el, 'inset 40');
    });
  });

  describe('pointer', () => {
    it('a real drag that starts in the dim area: the frame stands still (≤ 0.5 px), the image follows, one crop-change { source: pointer }', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      const f0 = frameOf(el);
      const img0 = imgOf(el);
      const s = f0.w / 360;
      const c = contentBox(el);
      // left of the frame, inside the stage: the dim area
      const from = [Math.round(c.x + (f0.x - c.x) / 2), Math.round(f0.y + f0.h / 2)];
      expect(from[0]).to.be.below(f0.x - 4);
      const frames = [];
      el.addEventListener('crop-input', () => frames.push(frameOf(el)));
      await sendMouse({ type: 'move', position: from });
      await sendMouse({ type: 'down' });
      await mouseTo(from, [from[0] + 20, from[1] + 10], 3);
      expect(el.hasAttribute('data-dragging')).to.equal(true);
      expect(getComputedStyle($(el, '.td-cropper__stage')).cursor).to.equal('grabbing');
      await mouseTo([from[0] + 20, from[1] + 10], [from[0] + 60, from[1] + 30], 4);
      await sendMouse({ type: 'up' });
      await frame();
      expect(rec.input.length).to.be.greaterThan(1);
      expect(rec.input.every((d) => d.source === 'pointer')).to.equal(true);
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('pointer');
      expect(frames.length).to.be.greaterThan(1);
      for (const f of frames) expect(sameBox(f, f0), JSON.stringify(f)).to.equal(true);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
      // the image went with the pointer …
      const img1 = imgOf(el);
      expect(Math.abs((img1.x - img0.x) - 60)).to.be.at.most(1);
      expect(Math.abs((img1.y - img0.y) - 30)).to.be.at.most(1);
      expect(Math.abs(img1.w - img0.w)).to.be.at.most(0.5);
      // … so the crop went the other way (the finger goes right ⇒ x decreases)
      const p = rec.change[0].crop.pixels;
      expect(Math.abs(p.x - (MID_PX.x - 60 / s))).to.be.at.most(1);
      expect(Math.abs(p.y - (MID_PX.y - 30 / s))).to.be.at.most(1);
      expect(p.width).to.equal(360);
      expect(p.height).to.equal(360);
      expect(el.hasAttribute('data-dragging')).to.equal(false);
      expect(el.crop).to.deep.equal(rec.change[0].crop);
    });

    it('dragging far: the image stops at its edge (the frame never shows the outside), the frame stands still', async () => {
      const { el } = await mount({ ...NAT, crop: crop(0.05, 0.1, 0.225, 0.4) }); // 360 × 360 at (80, 90)
      const rec = record(el);
      const f0 = frameOf(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await drag(from, [from[0] + 300, from[1] + 250]);
      const p = rec.change[0].crop.pixels;
      expect(p).to.deep.equal({ x: 0, y: 0, width: 360, height: 360 });
      const img = imgOf(el);
      expect(Math.abs(img.x - f0.x)).to.be.at.most(0.5);
      expect(Math.abs(img.y - f0.y)).to.be.at.most(0.5);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
    });

    it('Escape during a drag: back to the start, no event', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const img0 = imgOf(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await sendMouse({ type: 'move', position: from });
      await sendMouse({ type: 'down' });
      await mouseTo(from, [from[0] + 50, from[1] + 20], 3);
      expect(rec.input.length).to.be.greaterThan(0);
      const n = rec.input.length;
      await sendKeys({ press: 'Escape' });
      await frame();
      expect(sameBox(imgOf(el), img0)).to.equal(true);
      await mouseTo([from[0] + 50, from[1] + 20], [from[0] + 80, from[1] + 20], 2);
      await sendMouse({ type: 'up' });
      await frame();
      expect(rec.change.length).to.equal(0);
      expect(rec.input.length).to.equal(n);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
    });

    it('wheel zooms around the pointer: the image point under it stays put (≤ 1 px), source wheel; a trackpad burst = one step per frame', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const stage = $(el, '.td-cropper__stage');
      const f0 = frameOf(el);
      const px = f0.x + f0.w * 0.7;
      const py = f0.y + f0.h * 0.35;
      const wheel = (o) => stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: px, clientY: py, ...o }));
      /** model point under the pointer */
      const under = () => { const i = imgOf(el); return { x: ((px - i.x) / i.w) * W, y: ((py - i.y) / i.h) * H }; };
      const m0 = under();
      expect(wheel({ deltaY: -100, deltaMode: 0 })).to.equal(false);
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('wheel');
      const w1 = rec.change[0].crop.pixels.width;
      expect(Math.abs(w1 - 360 * Math.exp(-0.2))).to.be.at.most(1);
      const s1 = f0.w / w1;
      const m1 = under();
      expect(Math.abs(m1.x - m0.x) * s1).to.be.at.most(1);
      expect(Math.abs(m1.y - m0.y) * s1).to.be.at.most(1);
      expect(imgOf(el).w).to.be.above(f0.w * (W / 360)); // the image is drawn larger
      expect(sameBox(frameOf(el), f0)).to.equal(true);
      // zoom out
      expect(wheel({ deltaY: 3, deltaMode: 1 })).to.equal(false);
      expect(rec.change.length).to.equal(2);
      expect(rec.change[1].crop.pixels.width).to.be.above(w1);
      // trackpad: 12 small deltas in one frame ⇒ one change
      for (let i = 0; i < 12; i += 1) wheel({ deltaY: -3, deltaMode: 0 });
      expect(rec.change.length).to.equal(2);
      await frame();
      await frame();
      expect(rec.change.length).to.equal(3);
      expect(rec.change[2].source).to.equal('wheel');
      expect(rec.change[2].crop.pixels.width).to.be.below(rec.change[1].crop.pixels.width);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
    });

    it('pinch (two synthetic touch pointers): spreading makes the crop smaller around the midpoint, source pinch', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const f0 = frameOf(el);
      const stage = $(el, '.td-cropper__stage');
      const [cx, cy] = centerOf($(el, '.td-cropper__box'));
      pe('pointerdown', stage, 1, cx - 20, cy);
      pe('pointerdown', stage, 2, cx + 20, cy);
      pe('pointermove', stage, 1, cx - 40, cy);
      pe('pointermove', stage, 2, cx + 40, cy);
      await frame();
      expect(rec.input.length).to.be.greaterThan(0);
      expect(rec.input[rec.input.length - 1].source).to.equal('pinch');
      pe('pointerup', stage, 1, cx - 40, cy);
      await frame();
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('pinch');
      const p = rec.change[0].crop.pixels;
      expect(Math.abs(p.width - 180)).to.be.at.most(2);
      expect(Math.abs(p.height - 180)).to.be.at.most(2);
      expect(Math.abs(centreOfCrop(p).x - 800)).to.be.at.most(2);
      expect(Math.abs(centreOfCrop(p).y - 450)).to.be.at.most(2);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
      pe('pointermove', stage, 2, cx + 90, cy);
      pe('pointerup', stage, 2, cx + 90, cy);
      await frame();
      expect(rec.change.length).to.equal(1);
    });

    it('pinch + moving both fingers: the image follows the midpoint', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const f0 = frameOf(el);
      const stage = $(el, '.td-cropper__stage');
      const [cx, cy] = centerOf($(el, '.td-cropper__box'));
      pe('pointerdown', stage, 1, cx - 30, cy);
      pe('pointerdown', stage, 2, cx + 30, cy);
      // same distance (no zoom), both fingers 40 px right and 20 px down
      pe('pointermove', stage, 1, cx - 30 + 40, cy + 20);
      pe('pointermove', stage, 2, cx + 30 + 40, cy + 20);
      await frame();
      pe('pointerup', stage, 1, cx + 10, cy + 20);
      pe('pointerup', stage, 2, cx + 70, cy + 20);
      await frame();
      expect(rec.change.length).to.equal(1);
      const p = rec.change[0].crop.pixels;
      const s = f0.w / 360;
      expect(p.width).to.equal(360);
      expect(Math.abs(p.x - (MID_PX.x - 40 / s))).to.be.at.most(1.5);
      expect(Math.abs(p.y - (MID_PX.y - 20 / s))).to.be.at.most(1.5);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
    });
  });

  describe('keyboard and buttons', () => {
    it('arrows move the IMAGE (the crop goes the other way) by 1 % of the frame side, Shift × 10; + / − zoom around the centre', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const box = $(el, '.td-cropper__box');
      const f0 = frameOf(el);
      box.focus();
      const img0 = imgOf(el);
      await sendKeys({ press: 'ArrowRight' });
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('keyboard');
      expect(imgOf(el).x).to.be.above(img0.x); // the image went right
      expect(Math.abs(el.crop.pixels.x - (620 - 3.6))).to.be.at.most(1);
      expect(el.crop.pixels.y).to.equal(270);
      await sendKeys({ press: 'ArrowDown' });
      expect(imgOf(el).y).to.be.above(img0.y);
      expect(Math.abs(el.crop.pixels.y - (270 - 3.6))).to.be.at.most(1);
      await sendKeys({ press: 'Shift+ArrowLeft' });
      expect(Math.abs(el.crop.pixels.x - (620 - 3.6 + 36))).to.be.at.most(1);
      await sendKeys({ press: 'Shift+ArrowUp' });
      expect(Math.abs(el.crop.pixels.y - (270 - 3.6 + 36))).to.be.at.most(1);
      expect(el.crop.pixels.width).to.equal(360);
      expect(rec.change.every((d) => d.source === 'keyboard')).to.equal(true);
      const c0 = centreOfCrop(el.crop.pixels);
      await sendKeys({ press: '+' });
      const wIn = el.crop.pixels.width;
      expect(wIn).to.be.below(360);
      expect(Math.abs(centreOfCrop(el.crop.pixels).x - c0.x)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(el.crop.pixels).y - c0.y)).to.be.at.most(1);
      await sendKeys({ press: '-' });
      expect(el.crop.pixels.width).to.be.above(wIn);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
      expect(document.activeElement === box).to.equal(true);
    });

    it('the − / + buttons zoom (source button); "Đặt lại" goes back to the initial crop (source reset)', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      $(el, '.td-cropper__zoom-in').click();
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('button');
      const w1 = el.crop.pixels.width;
      expect(w1).to.be.below(360);
      $(el, '.td-cropper__zoom-out').click();
      $(el, '.td-cropper__zoom-out').click();
      expect(el.crop.pixels.width).to.be.above(360);
      const n = rec.change.length;
      $(el, '.td-cropper__reset').click();
      await frame();
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      expect(rec.change.slice(n).map((d) => d.source)).to.deep.equal(['reset']);
      // without an initial crop: back to the widest view of the default ratio
      const b = await mount(NAT);
      $(b.el, '.td-cropper__zoom-in').click();
      expect(b.el.crop.pixels.width).to.be.below(900);
      $(b.el, '.td-cropper__reset').click();
      await frame();
      expect(b.el.crop.pixels).to.deep.equal({ x: 350, y: 0, width: 900, height: 900 });
    });

    it('the widest view cannot zoom out further; the display ceiling stops zooming in at frame / 8', async () => {
      const { el } = await mount(NAT);
      const rec = record(el);
      $(el, '.td-cropper__zoom-out').click();
      expect(rec.change.length).to.equal(0);
      expect(el.crop.pixels.width).to.equal(900);
      const fw = frameOf(el).w;
      for (let i = 0; i < 60; i += 1) $(el, '.td-cropper__zoom-in').click();
      expect(Math.abs(el.crop.pixels.width - fw / 8)).to.be.at.most(1);
      expect(imgOf(el).w).to.be.at.most(W * 8 + 1);
      const n = rec.change.length;
      $(el, '.td-cropper__zoom-in').click();
      expect(rec.change.length).to.equal(n);
      expect(slider(el).getAttribute('value')).to.equal('100');
    });
  });

  describe('ratio', () => {
    it('picking a preset: the frame changes shape at once (± 1 px) and stays centred; the crop keeps its centre and relative zoom', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const f0 = frameOf(el);
      pickRatio(el, '16:9');
      const f1 = frameOf(el); // no frame waited: the same task
      expect(Math.abs(f1.w - f1.h * (16 / 9))).to.be.at.most(1);
      expect(f1.w).to.be.above(f0.w + 10);
      expectCentred(el, '16:9');
      expect(el.crop.aspectRatio).to.equal(1.7778);
      const p = el.crop.pixels;
      // 1:1 at zoom 900 / 360 = 2.5 × ⇒ 16:9 at 2.5 ×: 640 × 360, same centre (800, 450)
      expect(Math.abs(p.width - 640)).to.be.at.most(1);
      expect(Math.abs(p.height - 360)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(p).x - 800)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(p).y - 450)).to.be.at.most(1);
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('preset');
      // the image is drawn at the new frame's scale
      expect(Math.abs(imgOf(el).w - (f1.w / p.width) * W)).to.be.at.most(2);
      pickRatio(el, '1:1');
      const f2 = frameOf(el);
      expect(sameBox(f2, f0, 1)).to.equal(true);
      expect(Math.abs(el.crop.pixels.width - 360)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(el.crop.pixels).x - 800)).to.be.at.most(1);
      // a tall ratio
      pickRatio(el, '4:3');
      const f3 = frameOf(el);
      expect(Math.abs(f3.w - f3.h * (4 / 3))).to.be.at.most(1);
      expectCentred(el, '4:3');
    });

    it('`aspect-ratio` and `presets` changed at run time: silent, the frame follows, the centre and the relative zoom are kept', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      el.setAttribute('aspect-ratio', '16/9');
      await frame();
      let f = frameOf(el);
      expect(Math.abs(f.w - f.h * (16 / 9))).to.be.at.most(1);
      expectCentred(el, 'aspect-ratio 16/9');
      expect($(el, '.td-cropper__ratios').hidden).to.equal(true);
      expect(Math.abs(el.crop.pixels.width - 640)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(el.crop.pixels).x - 800)).to.be.at.most(1);
      el.removeAttribute('aspect-ratio');
      await frame();
      f = frameOf(el);
      expect(Math.abs(f.w - f.h)).to.be.at.most(1);
      expect(Math.abs(el.crop.pixels.width - 360)).to.be.at.most(1);
      el.presets = [{ label: 'Tự do', ratio: null }, { label: 'Ngang', ratio: 2 }, { label: 'Dọc', ratio: 0.5 }];
      await frame();
      expect(radios(el).map((b) => b.textContent)).to.deep.equal(['Ngang', 'Dọc']);
      f = frameOf(el);
      expect(Math.abs(f.w - f.h * 2)).to.be.at.most(1);
      expectCentred(el, 'presets 2:1');
      expect(el.crop.aspectRatio).to.equal(2);
      expect(rec.change.length).to.equal(0);
      expect(rec.input.length).to.equal(0);
    });

    it('1:1 gives integer pixels that are exactly square, also at an odd position', async () => {
      const { el } = await mount({ src: FIX, 'natural-width': '1601', 'natural-height': '901', 'aspect-ratio': '1:1' });
      expect(el.getAttribute('data-state')).to.equal('ready');
      const rec = record(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await drag(from, [from[0] - 37, from[1]]);
      for (let i = 0; i < 3; i += 1) {
        $(el, '.td-cropper__zoom-in').click();
        const p = el.crop.pixels;
        expect(p.width, JSON.stringify(p)).to.equal(p.height);
        expect(el.crop.aspectRatio).to.equal(1);
      }
      expect(rec.change.length).to.be.greaterThan(1);
      for (const d of rec.change) expect(d.crop.pixels.width).to.equal(d.crop.pixels.height);
    });
  });

  describe('focal point', () => {
    it('focal-point + pan: the tool and the point are hidden, focalPoint keeps the given value, no focal-change', async () => {
      const focal = JSON.stringify({ v: 1, x: 0.35, y: 0.6 });
      const { el } = await mount({ ...NAT, 'focal-point': '', focal, crop: MID });
      const rec = record(el);
      expect($(el, '.td-cropper__focal-toggle').hidden).to.equal(true);
      expect($(el, '.td-cropper__focal').hidden).to.equal(true);
      expect(el.focalPoint).to.deep.equal({ x: 0.35, y: 0.6 });
      const from = centerOf($(el, '.td-cropper__box'));
      await drag(from, [from[0] + 30, from[1] + 10]);
      $(el, '.td-cropper__zoom-in').click();
      expect(rec.change.length).to.equal(2);
      expect(rec.focal.length).to.equal(0);
      expect(el.focalPoint).to.deep.equal({ x: 0.35, y: 0.6 });
      // back in box mode the tool is there again with the same value
      el.setAttribute('mode', 'box');
      await frame();
      expect($(el, '.td-cropper__focal-toggle').hidden).to.equal(false);
      expect(el.focalPoint).to.deep.equal({ x: 0.35, y: 0.6 });
      expect(rec.focal.length).to.equal(0);
    });
  });

  describe('disabled / loading / error', () => {
    it('disabled: no gesture, no event, default cursor, the buttons and the slider are locked', async () => {
      const { el } = await mount({ ...NAT, crop: MID, disabled: '' });
      const rec = record(el);
      const stage = $(el, '.td-cropper__stage');
      expect(getComputedStyle(stage).cursor).to.not.equal('grab');
      expect($(el, '.td-cropper__zoom-in').disabled).to.equal(true);
      expect($(el, '.td-cropper__zoom-out').disabled).to.equal(true);
      expect(slider(el).hasAttribute('disabled')).to.equal(true);
      expect(sliderInput(el).disabled).to.equal(true);
      const img0 = imgOf(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await drag(from, [from[0] + 40, from[1] + 20]);
      stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], deltaY: -100 }));
      $(el, '.td-cropper__box').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      slide(el, 60, true);
      await frame();
      expect(rec.input.length + rec.change.length + rec.native.length).to.equal(0);
      expect(sameBox(imgOf(el), img0)).to.equal(true);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      // enabled again: everything works
      el.removeAttribute('disabled');
      await frame();
      expect(slider(el).hasAttribute('disabled')).to.equal(false);
      expect(getComputedStyle(stage).cursor).to.equal('grab');
      await drag(from, [from[0] + 40, from[1] + 20]);
      expect(rec.change.length).to.equal(1);
    });

    it('loading and error: the slider and the buttons are locked, no grab cursor, no event', async () => {
      const { el, ready } = await mount({ ...NAT, crop: MID }, { wait: false });
      expect(el.getAttribute('data-state')).to.equal('loading');
      expect(el.getAttribute('data-mode')).to.equal('pan');
      expect(slider(el).hasAttribute('disabled')).to.equal(true);
      expect($(el, '.td-cropper__zoom-in').disabled).to.equal(true);
      expect(getComputedStyle($(el, '.td-cropper__stage')).cursor).to.not.equal('grab');
      await ready;
      await frame();
      expect(slider(el).hasAttribute('disabled')).to.equal(false);
      const rec = record(el);
      const failed = new Promise((r) => el.addEventListener('image-error', r, { once: true }));
      el.setAttribute('src', '/test/fixtures/does-not-exist-073.svg');
      await failed;
      await frame();
      expect(el.getAttribute('data-state')).to.equal('error');
      expect(slider(el).hasAttribute('disabled')).to.equal(true);
      expect($(el, '.td-cropper__zoom-out').disabled).to.equal(true);
      const stage = $(el, '.td-cropper__stage');
      expect(getComputedStyle(stage).cursor).to.not.equal('grab');
      const [x, y] = centerOf(stage);
      await drag([x, y], [x + 40, y + 10]);
      slide(el, 40, true);
      expect(rec.input.length + rec.change.length + rec.native.length).to.equal(0);
      expect(el.crop).to.equal(null);
    });
  });

  describe('`mode` at run time', () => {
    it('box → pan → box: silent, valid output, data-mode / handles / slider / presets follow', async () => {
      const { el } = await mount({ ...NAT, crop: crop(0.25, 0.25, 0.5, 0.5) }, { pan: false });
      const rec = record(el);
      expect(el.hasAttribute('data-mode')).to.equal(false);
      expect(el.crop.pixels).to.deep.equal({ x: 400, y: 225, width: 800, height: 450 });
      el.setAttribute('mode', 'pan');
      await frame();
      expect(el.getAttribute('data-mode')).to.equal('pan');
      expect(!!slider(el)).to.equal(true);
      expect(radios(el).map((b) => b.textContent)).to.deep.equal(['1:1', '4:3', '3:2', '16:9', '1.91:1']);
      expect(radios(el).find((b) => b.getAttribute('aria-checked') === 'true').textContent).to.equal('1:1');
      expect(getComputedStyle($(el, '[data-handle="se"]')).display).to.equal('none');
      expect($(el, '[data-handle="se"]').tabIndex).to.equal(-1);
      const p = el.crop.pixels;
      expect(p.width).to.equal(p.height);
      expect(el.crop.aspectRatio).to.equal(1);
      expect(p.x >= 0 && p.y >= 0 && p.x + p.width <= W && p.y + p.height <= H).to.equal(true);
      const f = frameOf(el);
      expect(Math.abs(f.w - f.h)).to.be.at.most(1);
      expectCentred(el, 'box → pan');
      // … and back
      el.setAttribute('mode', 'box');
      await frame();
      expect(el.hasAttribute('data-mode')).to.equal(false);
      expect(!!slider(el)).to.equal(false);
      expect(el.querySelectorAll('td-slider').length).to.equal(0);
      expect(radios(el)[0].textContent).to.equal('Tự do');
      expect(radios(el).find((b) => b.getAttribute('aria-checked') === 'true').textContent).to.equal('1:1'); // the ratio is kept
      expect(getComputedStyle($(el, '[data-handle="se"]')).display).to.not.equal('none');
      expect($(el, '[data-handle="se"]').tabIndex).to.equal(0);
      expect(el.crop.pixels).to.deep.equal(p);
      // the box is drawn inside the whole image again (contain fit)
      const img = imgOf(el);
      const c = contentBox(el);
      expect(img.x >= c.x - 0.5 && img.x + img.w <= c.x + c.w + 0.5 && img.y >= c.y - 0.5 && img.y + img.h <= c.y + c.h + 0.5).to.equal(true);
      expect(rec.input.length + rec.change.length + rec.focal.length).to.equal(0);
      // the box still works the old way: the box moves, the image does not
      const img0 = imgOf(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await drag(from, [from[0] + 30, from[1]]);
      expect(sameBox(imgOf(el), img0)).to.equal(true);
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].crop.pixels.x).to.be.above(p.x);
    });

    it('box → pan removes data-small-box', async () => {
      const { el } = await mount({ ...NAT, crop: crop(0.4, 0.4, 0.05, 0.08) }, { pan: false });
      expect(el.hasAttribute('data-small-box')).to.equal(true);
      el.setAttribute('mode', 'pan');
      await frame();
      expect(el.hasAttribute('data-small-box')).to.equal(false);
      $(el, '.td-cropper__zoom-out').click();
      await frame();
      expect(el.hasAttribute('data-small-box')).to.equal(false);
      // a pan cropper never gets it, however small the stage
      const narrow = await mount({ ...NAT, crop: MID }, { width: 150 });
      expect(narrow.el.hasAttribute('data-small-box')).to.equal(false);
    });

    it('changing `mode` during a drag cancels the gesture first: no event', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const from = centerOf($(el, '.td-cropper__box'));
      await sendMouse({ type: 'move', position: from });
      await sendMouse({ type: 'down' });
      await mouseTo(from, [from[0] + 40, from[1] + 10], 3);
      const n = rec.input.length;
      expect(n).to.be.greaterThan(0);
      el.setAttribute('mode', 'box');
      await frame();
      expect(el.hasAttribute('data-dragging')).to.equal(false);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      await mouseTo([from[0] + 40, from[1] + 10], [from[0] + 70, from[1] + 10], 2);
      await sendMouse({ type: 'up' });
      await frame();
      expect(rec.change.length).to.equal(0);
      expect(rec.input.length).to.equal(n);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
    });
  });

  describe('shape', () => {
    it('shape="circle": data-shape only in pan + 1:1 — gone at 16:9, back at 1:1; the frame is drawn round; no warning', async () => {
      const warns = [];
      const orig = console.warn;
      console.warn = (...a) => { warns.push(a.join(' ')); };
      extra.push(() => { console.warn = orig; });
      const { el } = await mount({ ...NAT, shape: 'circle' });
      expect(el.getAttribute('data-shape')).to.equal('circle');
      expect(getComputedStyle($(el, '.td-cropper__box')).borderTopLeftRadius).to.equal('50%');
      pickRatio(el, '16:9');
      expect(el.hasAttribute('data-shape')).to.equal(false);
      expect(getComputedStyle($(el, '.td-cropper__box')).borderTopLeftRadius).to.not.equal('50%');
      pickRatio(el, '1:1');
      expect(el.getAttribute('data-shape')).to.equal('circle');
      // the output is still the bounding square
      expect(el.crop.pixels.width).to.equal(el.crop.pixels.height);
      el.setAttribute('shape', 'rect');
      expect(el.hasAttribute('data-shape')).to.equal(false);
      el.setAttribute('shape', 'CIRCLE');
      expect(el.getAttribute('data-shape')).to.equal('circle');
      el.setAttribute('shape', 'circle" onload="x');
      expect(el.hasAttribute('data-shape')).to.equal(false);
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(0);
    });

    it('shape="circle" in box mode, or with a lock that is not 1:1: never round, exactly one warning per element', async () => {
      const warns = [];
      const orig = console.warn;
      console.warn = (...a) => { warns.push(a.join(' ')); };
      extra.push(() => { console.warn = orig; });
      const a = await mount({ ...NAT, shape: 'circle', 'aspect-ratio': '1:1' }, { pan: false });
      expect(a.el.hasAttribute('data-shape')).to.equal(false);
      expect(getComputedStyle($(a.el, '.td-cropper__box')).borderTopLeftRadius).to.not.equal('50%');
      a.el.setAttribute('aspect-ratio', '16/9');
      a.el.setAttribute('aspect-ratio', '1:1');
      a.el.setAttribute('shape', 'rect');
      a.el.setAttribute('shape', 'circle');
      await frame();
      expect(a.el.hasAttribute('data-shape')).to.equal(false);
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(1);
      const b = await mount({ ...NAT, shape: 'circle', 'aspect-ratio': '16/9' });
      expect(b.el.hasAttribute('data-shape')).to.equal(false);
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(2);
      b.el.setAttribute('aspect-ratio', '1:1');
      await frame();
      expect(b.el.getAttribute('data-shape')).to.equal('circle');
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(2);
      // the warning never echoes an attribute value
      for (const w of warns) expect(/16|circle" /.test(w.replace('shape="circle"', ''))).to.equal(false);
    });

    it('a ratio that is only NEAR 1 is not round (review R1): a 1.005 / 1.0002 lock warns once, a 1.00005 preset is silent', async () => {
      const warns = [];
      const orig = console.warn;
      console.warn = (...a) => { warns.push(a.join(' ')); };
      extra.push(() => { console.warn = orig; });
      for (const lock of ['1.005', '1.0002']) {
        const { el } = await mount({ ...NAT, shape: 'circle', 'aspect-ratio': lock });
        expect(el.hasAttribute('data-shape'), lock).to.equal(false);
        expect(getComputedStyle($(el, '.td-cropper__box')).borderTopLeftRadius).to.not.equal('50%');
      }
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(2);
      const { el } = await mount({ ...NAT, shape: 'circle' }, {
        before: (c) => { c.presets = [{ label: 'gần vuông', ratio: 1.00005 }, { label: '1:1', ratio: 1 }]; },
      });
      expect(el.hasAttribute('data-shape')).to.equal(false);
      pickRatio(el, '1:1');
      expect(el.getAttribute('data-shape')).to.equal('circle');
      pickRatio(el, 'gần vuông');
      expect(el.hasAttribute('data-shape')).to.equal(false);
      expect(warns.filter((w) => w.includes('td-cropper')).length).to.equal(2);
    });
  });

  describe('resize', () => {
    it('the stage changes size (ResizeObserver): the crop does not change, the frame is centred again, no event', async () => {
      const { el, wrap } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const f0 = frameOf(el);
      const before = el.crop;
      wrap.style.setProperty('width', '250px');
      await until(() => Math.abs(frameOf(el).w - f0.w) > 20, 'frame resized');
      await frame();
      const f1 = frameOf(el);
      expect(f1.w).to.be.below(f0.w);
      expect(Math.abs(f1.w - f1.h)).to.be.at.most(1);
      expectCentred(el, '250');
      expect(el.crop).to.deep.equal(before);
      expect(Math.abs(imgOf(el).w - (f1.w / 360) * W)).to.be.at.most(2);
      wrap.style.setProperty('width', '640px');
      await until(() => sameBox(frameOf(el), f0, 1), 'frame back');
      expectCentred(el, '640');
      expect(el.crop).to.deep.equal(before);
      expect(rec.input.length + rec.change.length).to.equal(0);
    });
  });

  describe('zoom slider', () => {
    it('arrow keys on the slider: crop-input + crop-change { source: button }, a LOG scale, the slider events never leave the cropper', async () => {
      const { el } = await mount(NAT);
      const rec = record(el);
      const fw = frameOf(el).w;
      const wMax = 900;
      const wMin = fw / 8;
      sliderInput(el).focus();
      await sendKeys({ press: 'ArrowRight' });
      expect(slider(el).getValue()).to.equal(1);
      expect(rec.input.length).to.equal(1);
      expect(rec.change.length).to.equal(1);
      expect(rec.input[0].source).to.equal('button');
      expect(rec.change[0].source).to.equal('button');
      expect(Math.abs(el.crop.pixels.width - wMax * (wMin / wMax) ** 0.01)).to.be.at.most(1);
      expect(Math.abs(centreOfCrop(el.crop.pixels).x - 800)).to.be.at.most(1);
      await sendKeys({ press: 'ArrowLeft' });
      expect(el.crop.pixels).to.deep.equal({ x: 350, y: 0, width: 900, height: 900 });
      expect(rec.change.length).to.equal(2);
      // half way = the geometric mean of the two ends (each step is the same zoom factor), not the arithmetic one
      slide(el, 50, true);
      const mid = el.crop.pixels.width;
      expect(Math.abs(mid - Math.sqrt(wMin * wMax))).to.be.at.most(1.5);
      expect(mid).to.be.below((wMin + wMax) / 2 - 100);
      expect(slider(el).getAttribute('value')).to.equal('50');
      slide(el, 100, true);
      expect(Math.abs(el.crop.pixels.width - wMin)).to.be.at.most(1);
      slide(el, 0, true);
      expect(el.crop.pixels.width).to.equal(900);
      expect(rec.native.length).to.equal(0);
      expect(rec.input.every((d) => d.source === 'button') && rec.change.every((d) => d.source === 'button')).to.equal(true);
    });

    it('a real mouse drag on the slider zooms in: several crop-input, one crop-change, the frame stands still', async () => {
      const { el } = await mount(NAT);
      const rec = record(el);
      const f0 = frameOf(el);
      const r = sliderInput(el).getBoundingClientRect();
      const y = Math.round(r.y + r.height / 2);
      await drag([Math.round(r.x + 6), y], [Math.round(r.x + r.width * 0.7), y], 5);
      expect(rec.input.length).to.be.greaterThan(1);
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('button');
      expect(el.crop.pixels.width).to.be.below(600);
      expect(slider(el).getValue()).to.be.above(40);
      expect(sameBox(frameOf(el), f0)).to.equal(true);
      expect(rec.native.length).to.equal(0);
      expect(el.hasAttribute('data-dragging')).to.equal(false);
    });

    it('back-sync: wheel, buttons, keys, preset, reset and the crop property move the slider — without any slider event', async () => {
      const { el } = await mount(NAT);
      const rec = record(el);
      const z = slider(el);
      const val = () => Number(z.getAttribute('value'));
      expect(val()).to.equal(0);
      const [x, y] = centerOf($(el, '.td-cropper__box'));
      $(el, '.td-cropper__stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: -100 }));
      const v1 = val();
      expect(v1).to.be.above(0);
      expect(sliderInput(el).value).to.equal(String(v1));
      $(el, '.td-cropper__zoom-in').click();
      const v2 = val();
      expect(v2).to.be.above(v1);
      $(el, '.td-cropper__box').focus();
      await sendKeys({ press: '-' });
      expect(val()).to.be.below(v2);
      pickRatio(el, '16:9'); // the relative zoom is kept ⇒ about the same position on the new scale
      expect(val()).to.be.above(0);
      $(el, '.td-cropper__reset').click();
      await frame();
      expect(val()).to.equal(0);
      el.crop = { x: 0.4, y: 0.4, width: 0.1125, height: 0.2 }; // 180 × 180
      await frame();
      const fw = frameOf(el).w;
      expect(Math.abs(val() - Math.round((Math.log(180 / 900) / Math.log((fw / 8) / 900)) * 100))).to.be.at.most(1);
      expect(sliderInput(el).value).to.equal(String(val()));
      expect(rec.native.length).to.equal(0);
      // every crop-change so far came from the real source, none from the slider being moved by the code
      expect(rec.change.map((d) => d.source)).to.deep.equal(['wheel', 'button', 'keyboard', 'preset', 'reset']);
    });

    it('an initial crop below the zoom-in limit: kept, the slider at the end; two gestures out and in stop at the limit', async () => {
      const { el } = await mount({ ...NAT, crop: crop(0.4, 0.4, 0.02, 0.02 * (W / H)) }); // 32 × 32, the limit is ≈ frame / 8
      const rec = record(el);
      const fw = frameOf(el).w;
      const limit = fw / 8;
      expect(limit).to.be.above(36);
      expect(el.crop.pixels).to.deep.equal({ x: 640, y: 360, width: 32, height: 32 });
      expect(slider(el).getAttribute('value')).to.equal('100');
      // nothing zooms in further, and nothing moved the rect
      $(el, '.td-cropper__zoom-in').click();
      expect(rec.change.length).to.equal(0);
      expect(el.crop.pixels.width).to.equal(32);
      // gesture 1: down to 50, released
      slide(el, 80);
      slide(el, 50, true);
      expect(rec.change.length).to.equal(1);
      const wOut = el.crop.pixels.width;
      expect(wOut).to.be.above(limit);
      // gesture 2 (a NEW scale, from the committed rect): up to 100 ⇒ the limit, not the old 32 px rect
      slide(el, 100, true);
      expect(rec.change.length).to.equal(2);
      expect(Math.abs(el.crop.pixels.width - limit)).to.be.at.most(1);
      expect(el.crop.pixels.width).to.be.above(36);
      expect(slider(el).getAttribute('value')).to.equal('100');
      expect(rec.native.length).to.equal(0);
    });

    it('ONE gesture 100 → 50 → 100 without releasing gives the start rect back (frozen scale), and commits nothing', async () => {
      const { el } = await mount({ ...NAT, crop: crop(0.4, 0.4, 0.02, 0.02 * (W / H)) });
      const rec = record(el);
      const start = el.crop;
      slide(el, 75);
      slide(el, 50);
      expect(el.crop.pixels.width).to.be.above(60);
      expect(rec.input.length).to.equal(2);
      slide(el, 100);
      expect(el.crop).to.deep.equal(start);
      slide(el, 100, true);
      expect(el.crop).to.deep.equal(start);
      expect(rec.change.length).to.equal(0);
      expect(rec.input.every((d) => d.source === 'button')).to.equal(true);
      expect(slider(el).getAttribute('value')).to.equal('100');
    });
  });

  describe('a gesture that is cut short (review R1)', () => {
    /** a slider position away from the current one */
    const away = (el) => (Number(slider(el).getAttribute('value')) > 50 ? 20 : 80);

    it('the slider is being dragged and `mode` changes: back to the start rect, no crop-change, nothing left over', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      slide(el, away(el));
      expect(rec.input.length).to.equal(1);
      expect(el.crop.pixels).to.not.deep.equal(MID_PX);
      el.setAttribute('mode', 'box');
      await frame();
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      el.setAttribute('mode', 'pan');
      await frame();
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      const v = slider(el).getAttribute('value');
      slide(el, Number(v), true); // a fresh gesture at the same position changes nothing
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      expect(rec.change.length).to.equal(0);
      expect(rec.input.length).to.equal(1);
    });

    it('the slider is being dragged and the cropper is disabled: back to the start rect and position, no crop-change', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const v0 = slider(el).getAttribute('value');
      slide(el, away(el));
      expect(el.crop.pixels).to.not.deep.equal(MID_PX);
      el.setAttribute('disabled', '');
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      expect(slider(el).getAttribute('value')).to.equal(v0);
      expect(slider(el).hasAttribute('disabled')).to.equal(true);
      el.removeAttribute('disabled');
      expect(slider(el).hasAttribute('disabled')).to.equal(false);
      slide(el, Number(v0), true);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
      expect(rec.change.length).to.equal(0);
    });

    it('the slider is being dragged and the cropper leaves the document: no event, no gesture left', async () => {
      const { el, wrap } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      slide(el, away(el));
      const n = rec.input.length;
      el.remove();
      expect(/** @type {any} */ (el)._zg).to.equal(null);
      expect(rec.change.length).to.equal(0);
      expect(rec.input.length).to.equal(n);
      wrap.append(el);
    });

    it('a stage resize in the middle of ONE slider gesture keeps its frozen scale: 100 → 50 → resize → 100 gives the start rect back', async () => {
      const { el, wrap } = await mount({ ...NAT, crop: crop(0.4, 0.4, 0.02, 0.02 * (W / H)) });
      const rec = record(el);
      const start = el.crop;
      const f0 = frameOf(el);
      slide(el, 50);
      const mid = el.crop;
      expect(mid.pixels.width).to.be.above(60);
      wrap.style.setProperty('width', '250px');
      await until(() => Math.abs(frameOf(el).w - f0.w) > 20, 'frame resized');
      await frame();
      expect(el.crop).to.deep.equal(mid);
      expect(slider(el).getValue()).to.equal(50); // the slider is not moved under the finger
      slide(el, 100);
      expect(el.crop).to.deep.equal(start);
      slide(el, 100, true);
      expect(el.crop).to.deep.equal(start);
      expect(rec.change.length).to.equal(0);
    });

    it('pointercancel on the slider commits what it did: one crop-change { source: button }, a late `change` adds nothing', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      slide(el, away(el));
      const now = el.crop;
      sliderInput(el).dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'touch' }));
      expect(rec.change.length).to.equal(1);
      expect(rec.change[0].source).to.equal('button');
      expect(el.crop).to.deep.equal(now);
      sliderInput(el).dispatchEvent(new Event('change', { bubbles: true }));
      expect(rec.change.length).to.equal(1);
      expect(el.crop).to.deep.equal(now);
    });

    it('a trackpad step waiting for its frame is dropped when `mode` changes', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const stage = $(el, '.td-cropper__stage');
      const [cx, cy] = centerOf($(el, '.td-cropper__box'));
      for (let i = 0; i < 6; i += 1) stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: -3, deltaMode: 0 }));
      el.setAttribute('mode', 'box');
      await frame();
      await frame();
      expect(rec.input.length + rec.change.length).to.equal(0);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
    });
  });

  describe('a queued trackpad step and `disabled` (review R2)', () => {
    it('disabled then enabled again before the frame: the waiting step is dropped, no event, the crop stays', async () => {
      const { el } = await mount({ ...NAT, crop: MID });
      const rec = record(el);
      const stage = $(el, '.td-cropper__stage');
      const [cx, cy] = centerOf($(el, '.td-cropper__box'));
      for (let i = 0; i < 6; i += 1) stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: -3, deltaMode: 0 }));
      el.setAttribute('disabled', '');
      el.removeAttribute('disabled');
      await frame();
      await frame();
      expect(rec.input.length + rec.change.length).to.equal(0);
      expect(el.crop.pixels).to.deep.equal(MID_PX);
    });
  });

  describe('a large raster (4000 × 3000)', () => {
    it('loads, starts at the largest square, and the display ceiling bounds the drawn image', async () => {
      const { el } = await mount({ src: '/test/fixtures/crop-large.png', 'natural-width': '4000', 'natural-height': '3000' });
      expect(el.crop.pixels).to.deep.equal({ x: 500, y: 0, width: 3000, height: 3000 });
      const fw = frameOf(el).w;
      for (let i = 0; i < 80; i += 1) $(el, '.td-cropper__zoom-in').click();
      expect(Math.abs(el.crop.pixels.width - fw / 8)).to.be.at.most(1);
      expect(imgOf(el).w).to.be.at.most(4000 * 8 + 1);
      expect(el.crop.pixels.width).to.equal(el.crop.pixels.height);
    });
  });

  describe('accessibility', () => {
    it('Tab order: ratios → − → slider → + → reset → frame → out; no handle is a stop or in the accessibility tree', async () => {
      const { el, before } = await mount({ ...NAT, crop: MID });
      before.focus();
      const order = [];
      for (let i = 0; i < 7; i += 1) {
        await sendKeys({ press: TAB });
        order.push(nameOf(document.activeElement));
      }
      expect(order).to.deep.equal(['ratio:1:1', 'zoom-out', 'slider', 'zoom-in', 'reset', 'box', 'sau']);
      for (const h of el.querySelectorAll('.td-cropper__handle')) {
        expect(getComputedStyle(h).display).to.equal('none'); // display: none ⇒ not rendered, not in the tree
        expect(/** @type {HTMLElement} */ (h).tabIndex).to.equal(-1);
      }
      expect(getComputedStyle($(el, '.td-cropper__focal')).display).to.equal('none');
      // the help texts of the handles and of the focal point are not exposed either; box mode keeps them
      for (const s of ['.td-cropper__corner-desc', '.td-cropper__focal-desc']) expect($(el, s).hidden, s).to.equal(true);
      el.setAttribute('mode', 'box');
      for (const s of ['.td-cropper__corner-desc', '.td-cropper__focal-desc']) expect($(el, s).hasAttribute('hidden'), s).to.equal(false);
    });

    it('the frame has a name and the pan description; the slider has its label; locked ratio ⇒ no ratio stop', async () => {
      const { el, before } = await mount({ ...NAT, 'aspect-ratio': '1:1', 'focal-point': '' });
      const box = $(el, '.td-cropper__box');
      expect((box.getAttribute('aria-label') || '').length).to.be.greaterThan(0);
      const desc = (box.getAttribute('aria-describedby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
      expect(desc).to.include(TdCropper.labels.panHelp);
      expect(sliderInput(el).getAttribute('aria-label')).to.equal(TdCropper.labels.zoom);
      before.focus();
      const order = [];
      for (let i = 0; i < 6; i += 1) {
        await sendKeys({ press: TAB });
        order.push(nameOf(document.activeElement));
      }
      expect(order).to.deep.equal(['zoom-out', 'slider', 'zoom-in', 'reset', 'box', 'sau']);
    });
  });
});
