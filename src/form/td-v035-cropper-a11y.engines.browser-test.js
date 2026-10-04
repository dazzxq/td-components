import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdCropper } from './td-cropper.js';

// v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md M2 + M3, decisions 5, 8, 15-19, 21, 33) — <td-cropper> keyboard,
// ARIA, live region, security, unknown sizes, ResizeObserver, and the shared crop dialog (TdCropper.openDialog), in
// Chromium, Firefox AND WebKit. Every wait is on a real signal (image-ready, events, a MutationObserver on the live
// region, animation frames, data-state="open") — no fixed sleeps. DOM nodes are compared as booleans.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const FIX = '/test/fixtures/crop-16x9.svg'; // 1600 × 900
// WebKit (like Safari's default) does not Tab to buttons; Option(Alt)+Tab reaches every control there.
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';
const NO_SIZE = '/test/fixtures/crop-no-size.svg'; // width="0" height="0" (an unsized SVG gets 300 × 150 everywhere)
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
  extra.splice(0).reverse().forEach((f) => f());
  await until(() => !document.querySelector('.td-crop-dialog'), 'crop dialog removed');
  await frame();
});

const crop = (x, y, w, h) => JSON.stringify({ v: 1, x, y, width: w, height: h });
const $ = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));

/**
 * Mount `[button "before"] <td-cropper> [button "after"]` (optionally RTL); wait for image-ready unless `wait` is false.
 * @param {Record<string, string>} attrs
 */
async function mount(attrs = {}, { width = 640, dir = '', wait = true, events = {} } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', `${width}px`], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  if (dir) wrap.setAttribute('dir', dir);
  const before = document.createElement('button');
  before.textContent = 'trước';
  const after = document.createElement('button');
  after.textContent = 'sau';
  const el = /** @type {TdCropper} */ (document.createElement('td-cropper'));
  for (const [k, v] of Object.entries({ src: FIX, alt: 'Ảnh thử', ...attrs })) el.setAttribute(k, v);
  for (const [k, fn] of Object.entries(events)) el.addEventListener(k, fn);
  const ready = new Promise((r) => el.addEventListener('image-ready', (e) => r(e.detail), { once: true }));
  wrap.append(before, el, after);
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const detail = wait ? await ready : null;
  if (wait) await frame();
  return { el, wrap, before, after, detail };
}
function record(el) {
  const rec = { change: [], focal: [] };
  el.addEventListener('crop-change', (e) => rec.change.push(JSON.parse(JSON.stringify(e.detail))));
  el.addEventListener('focal-change', (e) => rec.focal.push(JSON.parse(JSON.stringify(e.detail))));
  return rec;
}
/** a short name for the focused element */
function nameOf(node) {
  if (!(node instanceof HTMLElement)) return String(node);
  if (node.getAttribute('role') === 'radio') return `ratio:${node.textContent}`;
  for (const c of ['zoom-out', 'zoom-in', 'focal-toggle', 'reset', 'box', 'focal']) {
    if (node.classList.contains(`td-cropper__${c}`)) return c;
  }
  if (node.hasAttribute('data-handle')) return node.getAttribute('data-handle');
  return node.textContent || node.tagName;
}
async function tabOrder(start, n) {
  start.focus();
  const out = [];
  for (let i = 0; i < n; i += 1) {
    await sendKeys({ press: TAB });
    out.push(nameOf(document.activeElement));
  }
  return out;
}
/** resolves with the live region's text once it equals `text` (MutationObserver — no timer) */
function liveSays(el, text) {
  const live = $(el, '.td-cropper__live');
  return new Promise((resolve) => {
    if (live.textContent === text) { resolve(text); return; }
    const mo = new MutationObserver(() => {
      if (live.textContent === text) { mo.disconnect(); resolve(text); }
    });
    mo.observe(live, { childList: true, characterData: true, subtree: true });
  });
}
const px = (el) => el.crop.pixels;

describe('td-cropper keyboard + ARIA (v0.35.0)', () => {
  it('Tab order (decision 15): one ratio stop, −, +, Đặt lại, box, corners TL → TR → BR → BL, then out', async () => {
    const { el, before } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5) });
    expect(await tabOrder(before, 10)).to.deep.equal(['ratio:Tự do', 'zoom-out', 'zoom-in', 'reset', 'box', 'nw', 'ne', 'se', 'sw', 'sau']);
    // edge handles: pointer only
    for (const h of el.querySelectorAll('.td-cropper__handle--edge')) {
      expect(h.getAttribute('aria-hidden')).to.equal('true');
      expect(h.hasAttribute('tabindex')).to.equal(false);
    }
  });

  it('Tab order with the focal tool on and a focal point; locked ratio = no ratio group, 4 corners', async () => {
    const { before } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'focal-point': '', focal: JSON.stringify({ v: 1, x: 0.5, y: 0.5 }), 'aspect-ratio': '16/9' });
    expect(await tabOrder(before, 11)).to.deep.equal(['zoom-out', 'zoom-in', 'focal-toggle', 'reset', 'box', 'nw', 'ne', 'se', 'sw', 'focal', 'sau']);
  });

  it('focal tool on without a point: the toggle is a stop, the point is not', async () => {
    const { before } = await mount({ 'focal-point': '' });
    expect(await tabOrder(before, 10)).to.deep.equal(['ratio:Tự do', 'zoom-out', 'zoom-in', 'focal-toggle', 'reset', 'box', 'nw', 'ne', 'se', 'sw']);
  });

  it('box: arrows move 1 % of the image side, Shift × 10, + / = / − zoom around the centre; source keyboard', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    $(el, '.td-cropper__box').focus();
    const p0 = px(el);
    await sendKeys({ press: 'ArrowRight' });
    expect(px(el).x).to.equal(p0.x + 16);
    await sendKeys({ press: 'ArrowDown' });
    expect(px(el).y).to.equal(p0.y + 9);
    await sendKeys({ press: 'Shift+ArrowLeft' });
    expect(px(el).x).to.equal(p0.x + 16 - 160);
    await sendKeys({ press: 'ArrowUp' });
    expect(px(el).y).to.equal(p0.y);
    expect(rec.change.map((c) => c.source)).to.deep.equal(['keyboard', 'keyboard', 'keyboard', 'keyboard']);
    const w0 = px(el).width;
    await sendKeys({ press: '+' });
    expect(px(el).width).to.equal(Math.round(w0 * 0.9));
    await sendKeys({ press: '-' });
    expect(Math.abs(px(el).width - w0)).to.be.at.most(1);
    await sendKeys({ press: '=' });
    expect(px(el).width).to.be.below(w0);
    expect(rec.change.length).to.equal(7);
    expect(rec.change.every((c) => c.source === 'keyboard')).to.equal(true);
    // Ctrl / Meta combos are not swallowed (the page keeps its shortcuts)
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
    expect($(el, '.td-cropper__box').dispatchEvent(ev)).to.equal(true);
    expect(rec.change.length).to.equal(7);
  });

  it('corner: arrows resize from that corner; locked ⇒ the key axis decides, the ratio is kept', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    $(el, '[data-handle="se"]').focus();
    const p0 = px(el);
    await sendKeys({ press: 'ArrowRight' });
    expect(px(el)).to.deep.equal({ ...p0, width: p0.width + 16 });
    $(el, '[data-handle="nw"]').focus();
    await sendKeys({ press: 'ArrowUp' });
    expect(px(el).y).to.equal(p0.y - 9);
    expect(px(el).height).to.equal(p0.height + 9);
    el.setAttribute('aspect-ratio', '1:1');
    $(el, '[data-handle="se"]').focus();
    const q0 = px(el);
    expect(q0.width).to.equal(q0.height);
    await sendKeys({ press: 'Shift+ArrowLeft' });
    const q1 = px(el);
    expect(q1.width).to.equal(q0.width - 160);
    expect(q1.height).to.equal(q1.width);
    expect(el.crop.aspectRatio).to.equal(1);
  });

  it('focal point: arrows 1 %, Shift 10 %; zoom keys work anywhere in the stage', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'focal-point': '', focal: JSON.stringify({ v: 1, x: 0.34, y: 0.6 }) });
    const rec = record(el);
    $(el, '.td-cropper__focal').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(el.focalPoint).to.deep.equal({ x: 0.35, y: 0.6 });
    await sendKeys({ press: 'Shift+ArrowUp' });
    expect(el.focalPoint).to.deep.equal({ x: 0.35, y: 0.5 });
    expect(rec.focal.map((f) => f.source)).to.deep.equal(['keyboard', 'keyboard']);
    expect(rec.change.length).to.equal(0);
    const w0 = el.crop.normalized.width;
    await sendKeys({ press: '+' });
    expect(el.crop.normalized.width).to.be.below(w0);
    expect(rec.change.length).to.equal(1);
  });

  it('RTL: ArrowLeft still decreases x (physical); the ratio radiogroup follows the writing direction', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' }, { dir: 'rtl' });
    const rec = record(el);
    $(el, '.td-cropper__box').focus();
    const x0 = px(el).x;
    await sendKeys({ press: 'ArrowLeft' });
    expect(px(el).x).to.equal(x0 - 16);
    const radios = [...el.querySelectorAll('[role="radio"]')];
    radios[0].focus();
    await sendKeys({ press: 'ArrowLeft' }); // RTL: left = next
    expect(radios[1].getAttribute('aria-checked')).to.equal('true');
    expect(document.activeElement === radios[1]).to.equal(true);
    expect(rec.change[rec.change.length - 1].source).to.equal('preset');
  });

  it('ratio radiogroup: roving tabindex, arrows select + move focus, preset keeps the centre; live "Tỉ lệ 16:9"', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    const radios = [...el.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).to.deep.equal(['Tự do', '1:1', '4:3', '3:2', '16:9', '1.91:1']);
    expect(radios.map((r) => r.tabIndex)).to.deep.equal([0, -1, -1, -1, -1, -1]);
    expect($(el, '.td-cropper__ratios').getAttribute('role')).to.equal('radiogroup');
    radios[0].focus();
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'ArrowLeft' });
    expect(radios[4].getAttribute('aria-checked')).to.equal('true');
    expect(radios.map((r) => r.tabIndex)).to.deep.equal([-1, -1, -1, -1, 0, -1]);
    expect(document.activeElement === radios[4]).to.equal(true);
    expect(el.hasAttribute('data-locked')).to.equal(true);
    const c = el.crop;
    expect(c.aspectRatio).to.equal(1.7778);
    expect(c.pixels).to.deep.equal({ x: 0, y: 0, width: 1600, height: 900 });
    expect(rec.change.map((d) => d.source)).to.deep.equal(['preset', 'preset']);
    expect(await liveSays(el, 'Tỉ lệ 16:9')).to.equal('Tỉ lệ 16:9');
    await sendKeys({ press: 'Home' });
    expect(el.hasAttribute('data-locked')).to.equal(false);
    expect(el.crop.pixels).to.deep.equal({ x: 0, y: 0, width: 1600, height: 900 }); // free keeps the box
    expect(await liveSays(el, 'Tỉ lệ tự do')).to.equal('Tỉ lệ tự do');
  });

  it('live region: the exact sentence after the 400 ms debounce (pixels / % / focal / focal off)', async () => {
    const { el } = await mount({ crop: crop(0.065, 0.044444, 0.75, 0.75), 'natural-width': '1600', 'natural-height': '900', 'focal-point': '',
      focal: JSON.stringify({ v: 1, x: 0.34, y: 0.6 }) });
    const live = $(el, '.td-cropper__live');
    expect(live.getAttribute('role')).to.equal('status');
    expect(live.getAttribute('aria-live')).to.equal('polite');
    $(el, '.td-cropper__box').focus();
    const t0 = performance.now();
    await sendKeys({ press: 'ArrowRight' });
    const sentence = 'Vùng cắt 1200 × 675 px, cách trái 120 px, cách trên 40 px';
    expect(live.textContent === sentence).to.equal(false); // not yet: debounced
    await liveSays(el, sentence);
    expect(performance.now() - t0).to.be.at.least(390);
    // the box description carries the same value line
    const desc = document.getElementById($(el, '.td-cropper__box').getAttribute('aria-describedby'));
    expect(desc.textContent.startsWith(`${sentence}.`)).to.equal(true);
    $(el, '.td-cropper__focal').focus();
    await sendKeys({ press: 'ArrowRight' });
    await liveSays(el, 'Điểm trọng tâm 35 %, 60 %');
    $(el, '.td-cropper__focal-toggle').click();
    expect(el.focalPoint).to.equal(null);
    expect($(el, '.td-cropper__focal-toggle').getAttribute('aria-pressed')).to.equal('false');
    await liveSays(el, 'Đã bỏ điểm trọng tâm');
  });

  it('live region without the original size: percentages, no pixels', async () => {
    const { el, detail } = await mount({ crop: crop(0.1, 0.2, 0.5, 0.25) });
    expect(detail.pixelsKnown).to.equal(false);
    expect('pixels' in el.crop).to.equal(false);
    $(el, '.td-cropper__box').focus();
    await sendKeys({ press: 'ArrowRight' });
    await liveSays(el, 'Vùng cắt 50 % × 25 %, cách trái 11 %, cách trên 20 %');
  });

  it('ARIA: stage / box / corners / focal / toolbar', async () => {
    const { el } = await mount({ 'focal-point': '' });
    const stage = $(el, '.td-cropper__stage');
    expect(stage.getAttribute('role')).to.equal('group');
    expect(stage.getAttribute('aria-label')).to.equal('Cắt ảnh: Ảnh thử');
    const box = $(el, '.td-cropper__box');
    expect(box.getAttribute('role')).to.equal('group');
    expect(box.getAttribute('aria-roledescription')).to.equal('khung cắt');
    expect(box.getAttribute('aria-label')).to.equal('Vùng cắt');
    expect(!!document.getElementById(box.getAttribute('aria-describedby'))).to.equal(true);
    const labels = [...el.querySelectorAll('.td-cropper__handle--corner')].map((c) => [c.getAttribute('aria-label'), c.getAttribute('aria-roledescription'), c.getAttribute('role')]);
    expect(labels).to.deep.equal([['Góc trên trái', 'tay nắm', 'group'], ['Góc trên phải', 'tay nắm', 'group'], ['Góc dưới phải', 'tay nắm', 'group'], ['Góc dưới trái', 'tay nắm', 'group']]);
    const toggle = $(el, '.td-cropper__focal-toggle');
    expect(toggle.getAttribute('aria-pressed')).to.equal('false');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).to.equal('true');
    const point = $(el, '.td-cropper__focal');
    expect(point.hidden).to.equal(false);
    expect(point.getAttribute('aria-label')).to.equal('Điểm trọng tâm');
    expect(el.focalPoint).to.deep.equal({ x: 0.5, y: 0.5 });
    for (const b of el.querySelectorAll('.td-cropper__tool')) expect(!!b.getAttribute('aria-label'), b.className).to.equal(true);
    const img = $(el, 'img');
    expect(img.getAttribute('draggable')).to.equal('false');
    expect(img.getAttribute('referrerpolicy')).to.equal('no-referrer');
    expect(img.hasAttribute('crossorigin')).to.equal(false);
  });

  it('XSS: alt is text only; no style attribute anywhere except --_tdc-* custom properties on the host', async () => {
    window.__cropXss = 0;
    const payload = '"><img src=x data-xss onerror="window.__cropXss=1">';
    const { el } = await mount({ alt: payload, crop: crop(0.25, 0.25, 0.5, 0.5), 'focal-point': '', focal: JSON.stringify({ v: 1, x: 0.5, y: 0.5 }) });
    expect(el.querySelectorAll('img').length).to.equal(1);
    expect(el.querySelector('[data-xss]') === null).to.equal(true);
    expect($(el, '.td-cropper__stage').getAttribute('aria-label')).to.equal(`Cắt ảnh: ${payload}`);
    expect(el.querySelectorAll('[style]').length).to.equal(0);
    expect(el.style.length).to.be.greaterThan(0);
    for (let i = 0; i < el.style.length; i += 1) expect(el.style[i].startsWith('--_tdc-'), el.style[i]).to.equal(true);
    await frame();
    expect(window.__cropXss).to.equal(0);
    el.remove();
    expect(el.style.length).to.equal(0); // removed on disconnect
  });

  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', 'blob:https://example.com/0f0e']) {
    it(`src ${bad.slice(0, 11)}… ⇒ image-error { kind: src }, no <img src>`, async () => {
      const errors = [];
      const { el } = await mount({ src: bad }, { wait: false, events: { 'image-error': (e) => errors.push(e.detail) } });
      expect(errors).to.deep.equal([{ kind: 'src' }]);
      expect(el.getAttribute('data-state')).to.equal('error');
      expect(el.getAttribute('data-error')).to.equal('src');
      expect($(el, 'img').hasAttribute('src')).to.equal(false);
      expect(el.crop).to.equal(null);
      expect($(el, '.td-cropper__message').textContent).to.equal('Địa chỉ ảnh không hợp lệ');
      expect($(el, '.td-cropper__live').textContent).to.equal('Địa chỉ ảnh không hợp lệ');
    });
  }

  it('unknown sizes: a zero-size SVG ⇒ size; natural-* off by > 1 % ⇒ ratio; a missing file ⇒ load', async () => {
    for (const [attrs, kind] of [[{ src: NO_SIZE }, 'size'], [{ 'natural-width': '1000', 'natural-height': '1000' }, 'ratio'],
      [{ src: '/test/fixtures/does-not-exist.svg' }, 'load']]) {
      const got = await new Promise((resolve) => {
        mount(attrs, { wait: false, events: { 'image-error': (e) => resolve(e.detail.kind), 'image-ready': () => resolve('ready') } });
      });
      expect(got, JSON.stringify(attrs)).to.equal(kind);
    }
    // within 1 %: ready, pixels in the given (original) size
    const { el, detail } = await mount({ 'natural-width': '3200', 'natural-height': '1810' });
    expect(detail).to.deep.equal({ naturalWidth: 3200, naturalHeight: 1810, pixelsKnown: true });
    expect(el.crop.pixels).to.deep.equal({ x: 0, y: 0, width: 3200, height: 1810 });
  });

  it('loading: data-state="loading", controls disabled, no events until decoded', async () => {
    const { el } = await mount({}, { wait: false });
    expect(el.getAttribute('data-state')).to.equal('loading');
    expect(el.crop).to.equal(null);
    for (const b of el.querySelectorAll('.td-cropper__toolbar button')) expect(b.disabled).to.equal(true);
    expect($(el, '.td-cropper__box').tabIndex).to.equal(-1);
    await new Promise((r) => el.addEventListener('image-ready', r, { once: true }));
    expect($(el, '.td-cropper__zoom-in').disabled).to.equal(false);
    expect($(el, '.td-cropper__box').tabIndex).to.equal(0);
  });

  it('ResizeObserver: a host width change re-scales the display, the model coordinates stay', async () => {
    const { el, wrap } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const c0 = el.crop;
    const w0 = el.style.getPropertyValue('--_tdc-box-w');
    wrap.style.setProperty('width', '360px');
    await frame();
    expect(el.style.getPropertyValue('--_tdc-box-w') === w0).to.equal(false);
    expect(el.crop).to.deep.equal(c0);
    const box = $(el, '.td-cropper__box').getBoundingClientRect();
    const area = $(el, '.td-cropper__area').getBoundingClientRect();
    expect(Math.abs((box.x - area.x) / area.width - 0.25)).to.be.below(0.01);
    expect(Math.abs(box.width / area.width - 0.5)).to.be.below(0.01);
  });

  it('presets property + reset(): custom list, reset is silent, the "Đặt lại" button emits reset', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'natural-width': '1600', 'natural-height': '900' });
    const rec = record(el);
    el.presets = [{ label: 'Tự do', ratio: null }, { label: 'OG', ratio: 1.91 }, { label: '', ratio: 2 }, { label: 'x', ratio: -1 }];
    expect([...el.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).to.deep.equal(['Tự do', 'OG']);
    $(el, '.td-cropper__box').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(rec.change.length).to.equal(1);
    el.reset();
    expect(rec.change.length).to.equal(1);
    expect(px(el)).to.deep.equal({ x: 400, y: 225, width: 800, height: 450 });
    await sendKeys({ press: 'ArrowRight' });
    $(el, '.td-cropper__reset').click();
    expect(rec.change.length).to.equal(3);
    expect(rec.change[2].source).to.equal('reset');
    expect(px(el)).to.deep.equal({ x: 400, y: 225, width: 800, height: 450 });
    expect(el.getResult()).to.deep.equal({ crop: el.crop, focalPoint: null });
  });
});

describe('crop dialog (TdCropper.openDialog, v0.35.0)', () => {
  const dialogRoot = () => /** @type {HTMLElement} */ (document.querySelector('.td-crop-dialog'));
  const opened = () => until(() => dialogRoot() && dialogRoot().getAttribute('data-state') === 'open', 'dialog open');
  const cropperIn = () => /** @type {TdCropper} */ (dialogRoot().querySelector('td-cropper'));
  const readyIn = () => until(() => cropperIn() && cropperIn().getAttribute('data-state') === 'ready', 'cropper ready');

  it('opens (data-state="open"), title with the locked ratio, confirm disabled until ready, focus on the box; whole image ⇒ crop null', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'mở';
    document.body.appendChild(opener);
    extra.push(() => opener.remove());
    opener.focus();
    const p = TdCropper.openDialog({ src: FIX, naturalWidth: 1600, naturalHeight: 900, aspectRatio: 16 / 9, opener });
    const root = dialogRoot();
    expect(!!root).to.equal(true);
    const confirm = /** @type {HTMLButtonElement} */ (root.querySelector('.td-crop-dialog__confirm'));
    expect(confirm.disabled).to.equal(true);
    expect(root.querySelector('.td-modal__title').textContent).to.equal('Cắt ảnh · 16:9');
    expect(confirm.textContent).to.equal('Áp dụng');
    expect(root.querySelector('.td-crop-dialog__cancel').textContent).to.equal('Huỷ');
    await opened();
    await readyIn();
    expect(confirm.disabled).to.equal(false);
    await until(() => document.activeElement === cropperIn().querySelector('.td-cropper__box'), 'focus on the box');
    expect(cropperIn().getAttribute('aspect-ratio')).to.equal('16/9');
    confirm.click();
    const r = await p;
    expect(r).to.deep.equal({ status: 'applied', crop: null, focalPoint: null, changed: false });
    expect(document.activeElement === opener).to.equal(true);
  });

  it('apply untouched with a given crop ⇒ changed false; after a zoom key ⇒ changed true with the new CropValue', async () => {
    const start = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    let p = TdCropper.openDialog({ src: FIX, naturalWidth: 1600, naturalHeight: 900, crop: start, allowFocalPoint: true, focalPoint: { x: 0.3, y: 0.4 } });
    await opened();
    await readyIn();
    dialogRoot().querySelector('.td-crop-dialog__confirm').click();
    let r = await p;
    expect(r.status).to.equal('applied');
    expect(r.changed).to.equal(false);
    expect(r.crop.normalized).to.deep.equal(start);
    expect(r.crop.pixels).to.deep.equal({ x: 400, y: 225, width: 800, height: 450 });
    expect(r.focalPoint).to.deep.equal({ x: 0.3, y: 0.4 });
    await until(() => !dialogRoot(), 'first dialog removed');

    p = TdCropper.openDialog({ src: FIX, crop: start, title: 'Ảnh đại diện', confirmLabel: 'Chèn', cancelLabel: 'Quay lại', nested: true });
    await opened();
    await readyIn();
    expect(dialogRoot().classList.contains('td-crop-dialog--nested')).to.equal(true);
    expect(dialogRoot().querySelector('.td-modal__title').textContent).to.equal('Ảnh đại diện');
    expect(dialogRoot().querySelector('.td-crop-dialog__confirm').textContent).to.equal('Chèn');
    await until(() => document.activeElement === cropperIn().querySelector('.td-cropper__box'), 'focus on the box');
    await sendKeys({ press: '+' });
    dialogRoot().querySelector('.td-crop-dialog__confirm').click();
    r = await p;
    expect(r.changed).to.equal(true);
    expect('pixels' in r.crop).to.equal(false); // no natural size given
    expect(r.crop.normalized.width).to.be.below(0.5);
  });

  it('cancel button / Escape / × ⇒ { status: cancelled }; a second open while one is open rejects', async () => {
    for (const how of ['cancel', 'escape', 'close']) {
      const p = TdCropper.openDialog({ src: FIX });
      let rejected = null;
      await TdCropper.openDialog({ src: FIX }).catch((e) => { rejected = e; });
      expect(rejected instanceof Error).to.equal(true);
      await opened();
      await readyIn();
      if (how === 'cancel') dialogRoot().querySelector('.td-crop-dialog__cancel').click();
      else if (how === 'close') dialogRoot().querySelector('.td-modal__close').click();
      else await sendKeys({ press: 'Escape' });
      expect(await p).to.deep.equal({ status: 'cancelled' });
      await until(() => !dialogRoot(), 'dialog removed');
    }
  });

  it('AbortSignal ⇒ the dialog closes and resolves cancelled; an already aborted signal never opens one', async () => {
    const ctrl = new AbortController();
    const p = TdCropper.openDialog({ src: FIX, signal: ctrl.signal });
    await opened();
    ctrl.abort();
    expect(!!dialogRoot()).to.equal(false); // removed at once (owner teardown), no exit transition
    expect(await p).to.deep.equal({ status: 'cancelled' });
    const pre = new AbortController();
    pre.abort();
    expect(await TdCropper.openDialog({ src: FIX, signal: pre.signal })).to.deep.equal({ status: 'cancelled' });
    expect(!!dialogRoot()).to.equal(false);
  });

  it('error (ratio mismatch): confirm stays disabled, focus on cancel', async () => {
    const p = TdCropper.openDialog({ src: FIX, naturalWidth: 1000, naturalHeight: 1000 });
    await opened();
    await until(() => cropperIn().getAttribute('data-state') === 'error', 'cropper error');
    expect(cropperIn().getAttribute('data-error')).to.equal('ratio');
    expect(dialogRoot().querySelector('.td-crop-dialog__confirm').disabled).to.equal(true);
    await until(() => document.activeElement === dialogRoot().querySelector('.td-crop-dialog__cancel'), 'focus on cancel');
    await sendKeys({ press: 'Escape' });
    expect(await p).to.deep.equal({ status: 'cancelled' });
  });
});

// Codex review v0.35 round 1: #4 (properties assigned before the element is defined) and #7 (a focal-only reset is
// announced).
describe('td-cropper review R1', () => {
  it('#4 crop / focalPoint / presets assigned BEFORE definition are upgraded (not shadowed by own data properties)', async () => {
    const tag = `td-cropper-pre-${Math.random().toString(36).slice(2, 8)}`;
    const el = document.createElement(tag);
    el.setAttribute('src', FIX);
    el.setAttribute('natural-width', '1600');
    el.setAttribute('natural-height', '900');
    el.setAttribute('focal-point', '');
    /** @type {any} */ (el).presets = [{ label: 'Vuông', ratio: 1 }, { label: 'Tự do', ratio: null }];
    /** @type {any} */ (el).crop = { normalized: { x: 0.25, y: 0, width: 0.5, height: 1 } };
    /** @type {any} */ (el).focalPoint = { x: 0.3, y: 0.6 };
    const wrap = document.createElement('div');
    wrap.style.setProperty('width', '640px');
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    extra.push(() => wrap.remove());
    const ready = new Promise((r) => el.addEventListener('image-ready', r, { once: true }));
    customElements.define(tag, class extends TdCropper {});
    await ready;
    await frame();
    for (const k of ['crop', 'focalPoint', 'presets']) {
      expect(Object.prototype.hasOwnProperty.call(el, k), `${k} is not an own data property`).to.equal(false);
    }
    const c = /** @type {any} */ (el).crop;
    expect(c.pixels).to.deep.equal({ x: 400, y: 0, width: 800, height: 900 });
    expect(/** @type {any} */ (el).focalPoint).to.deep.equal({ x: 0.3, y: 0.6 });
    expect([...el.querySelectorAll('.td-cropper__ratio')].map((b) => b.textContent)).to.deep.equal(['Vuông', 'Tự do']);
  });

  it('#7 "Đặt lại" changing ONLY the focal point announces the focal sentence (400 ms debounce)', async () => {
    const { el } = await mount({ crop: crop(0.25, 0.25, 0.5, 0.5), 'focal-point': '', focal: JSON.stringify({ v: 1, x: 0.34, y: 0.6 }) });
    $(el, '.td-cropper__focal').focus();
    await sendKeys({ press: 'ArrowRight' });
    await liveSays(el, 'Điểm trọng tâm 35 %, 60 %');
    const rec = record(el);
    const t0 = performance.now();
    $(el, '.td-cropper__reset').click();
    expect(rec.change.length, 'the box did not change').to.equal(0);
    expect(rec.focal.length).to.equal(1);
    await liveSays(el, 'Điểm trọng tâm 34 %, 60 %');
    expect(performance.now() - t0).to.be.at.least(390);
  });
});
