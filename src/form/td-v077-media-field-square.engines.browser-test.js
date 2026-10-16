import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaField } from './td-media-field.js';

// v0.77.0 (plan docs/internal/plans/v0.77.0-media-field-square.md, owner via dsuite) — the td-media-field preview is a 1:1 SQUARE
// by default (any aspect-ratio, any image), the image object-fit: contain; `preview-shape="ratio"` keeps the pre-0.77 frame.
// Chromium, Firefox AND WebKit.
void TdMediaField; // defines <td-media-field>
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
const ROOT_PX = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const q = (el, sel) => el.querySelector(sel);
const rect = (n) => n.getBoundingClientRect();
const LAND = '/test/fixtures/1.svg'; // 1200 × 800
const PORT = '/test/fixtures/portrait.svg'; // 800 × 1200
const CROP = '{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}'; // a 3:2 crop of the 3:2 image

const box = document.createElement('div');
document.body.appendChild(box);
afterEach(() => { box.replaceChildren(); });

/** A field in a wrapper of `hostW` px (CSSOM on the test page — the component never writes style). */
async function mk({ hostW = 400, tokens = {}, attrs = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${hostW}px`;
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries({ name: 'logo', label: 'Logo', ...attrs })) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  for (const [k, v] of Object.entries(tokens)) el.style.setProperty(k, v);
  wrap.appendChild(el);
  box.appendChild(wrap);
  await frames(2);
  return { wrap, el };
}
const filled = (src, extra = {}) => ({ value: 'm1', 'preview-src': src, 'preview-alt': 'Ảnh', ...extra });
const CROPPABLE = { usage: true, croppable: true };
async function ready(el) {
  const img = q(el, 'img');
  await until(() => img.complete && img.naturalWidth > 0, 4000, 'img decoded');
  await frames(2);
  return img;
}
const isSquare = (el) => {
  const r = rect(q(el, '.td-media-field__frame'));
  return near(r.width, r.height) && r.width > 0;
};

describe('td-media-field v0.77.0 — square preview (default)', () => {
  it('empty: a square frame with the prompt (and the ratio label) centred inside it', async () => {
    const { el } = await mk({ attrs: { 'aspect-ratio': '16/7' } });
    expect(isSquare(el), `${rect(q(el, '.td-media-field__frame')).width}×${rect(q(el, '.td-media-field__frame')).height}`).to.equal(true);
    expect(q(el, '.td-media-field__ratio').textContent).to.equal('16:7');
    expect(!!q(el, 'svg.td-media-field__sizer'), 'the sizer is still rendered').to.equal(true);
    expect(getComputedStyle(q(el, '.td-media-field__sizer')).display).to.equal('none');
    const f = rect(q(el, '.td-media-field__frame'));
    const e = rect(q(el, '.td-media-field__empty'));
    expect(near(e.left + e.width / 2, f.left + f.width / 2, 2) && near(e.top + e.height / 2, f.top + f.height / 2, 2), 'centred').to.equal(true);
  });

  it('a landscape (3:2) and a portrait (2:3) image: the frame stays square, the image is contained and centred in it', async () => {
    for (const src of [LAND, PORT]) {
      const { el } = await mk({ attrs: filled(src) });
      const img = await ready(el);
      expect(isSquare(el), src).to.equal(true);
      const cs = getComputedStyle(img);
      expect(cs.objectFit).to.equal('contain');
      expect(cs.position).to.equal('absolute');
      const open = rect(q(el, '.td-media-field__open'));
      const i = rect(img);
      expect(near(i.width, open.width) && near(i.height, open.height), 'the <img> box fills the opener; contain letterboxes inside').to.equal(true);
      expect(near(open.width, open.height), 'the opener is square too').to.equal(true);
    }
  });

  it('aspect-ratio="16/7" with an image: still square (the ratio only labels / crops)', async () => {
    const { el } = await mk({ attrs: filled(LAND, { 'aspect-ratio': '16/7' }) });
    await ready(el);
    expect(isSquare(el)).to.equal(true);
  });

  it('the side is min(frame-w, host, --td-media-field-max-h): capped by max-h in a 1000px host, by frame-w when smaller', async () => {
    const wide = await mk({ hostW: 1000 });
    expect(near(rect(q(wide.el, '.td-media-field__frame')).width, 24 * ROOT_PX), `default ${rect(q(wide.el, '.td-media-field__frame')).width}`).to.equal(true);
    expect(isSquare(wide.el)).to.equal(true);
    const tall = await mk({ hostW: 1000, tokens: { '--td-media-field-max-h': '30rem' } });
    expect(near(rect(q(tall.el, '.td-media-field__frame')).width, 30 * ROOT_PX)).to.equal(true);
    const small = await mk({ hostW: 1000, tokens: { '--td-media-field-frame-w': '8rem' } });
    expect(near(rect(q(small.el, '.td-media-field__frame')).width, 8 * ROOT_PX)).to.equal(true);
    expect(isSquare(small.el)).to.equal(true);
    const narrow = await mk({ hostW: 200 });
    expect(near(rect(q(narrow.el, '.td-media-field__frame')).width, 200), 'capped by the host').to.equal(true);
    expect(isSquare(narrow.el)).to.equal(true);
  });

  it('croppable + a crop: span.td-media-field__view with numeric vars, the visible area is the crop; clearing the crop removes the wrapper', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'aspect-ratio': '3/2', crop: CROP }) });
    const img = await ready(el);
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'view wrapper');
    const view = q(el, '.td-media-field__view');
    expect(img.parentElement === view).to.equal(true);
    expect(view.parentElement === q(el, '.td-media-field__open')).to.equal(true);
    expect(view.style.getPropertyValue('--_td-mf-view-w')).to.equal('1');
    expect(parseFloat(view.style.getPropertyValue('--_td-mf-view-h'))).to.be.closeTo(2 / 3, 1e-9);
    expect(img.style.getPropertyValue('--_td-mf-crop-w')).to.equal('0.5');
    expect(getComputedStyle(img).position).to.equal('absolute');
    expect(getComputedStyle(view).overflow).to.equal('hidden');
    await frames(2);
    const open = rect(q(el, '.td-media-field__open'));
    const v = rect(view);
    // 3:2 crop contained in a square: full width, 2/3 of the height, centred
    expect(near(v.width, open.width, 1) && near(v.height, open.height * 2 / 3, 1), `${v.width}×${v.height} in ${open.width}×${open.height}`).to.equal(true);
    expect(near(v.top - open.top, (open.height - v.height) / 2, 1), 'centred').to.equal(true);
    const r = rect(img);
    // crop x .25 w .5 y .25 h .5: the image is 2× the view, shifted by half of it
    expect(near(r.width, v.width * 2, 1) && near(r.height, v.height * 2, 1), `${r.width}×${r.height} vs ${v.width}×${v.height}`).to.equal(true);
    expect(near(r.left, v.left - v.width * 0.5, 1) && near(r.top, v.top - v.height * 0.5, 1), 'shifted by half the view').to.equal(true);
    // remove the crop → wrapper and vars gone
    el.removeAttribute('crop');
    await frames(2);
    expect(!!q(el, '.td-media-field__view')).to.equal(false);
    expect(img.parentElement === q(el, '.td-media-field__open')).to.equal(true);
    expect(img.hasAttribute('style'), 'no style attribute left').to.equal(false);
  });

  it('a free crop (no aspect-ratio) is shown too; a portrait crop fits by height', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'crop-ratio': 'free', crop: '{"v":1,"x":0.1,"y":0,"width":0.2,"height":1}' }) });
    const img = await ready(el);
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'view wrapper');
    const view = q(el, '.td-media-field__view');
    // pixel ratio = (0.2 × 1200) / (1 × 800) = 0.3
    expect(parseFloat(view.style.getPropertyValue('--_td-mf-view-w'))).to.be.closeTo(0.3, 1e-9);
    expect(view.style.getPropertyValue('--_td-mf-view-h')).to.equal('1');
    await frames(1);
    const open = rect(q(el, '.td-media-field__open'));
    const v = rect(view);
    expect(near(v.height, open.height) && near(v.width, open.width * 0.3, 1), `${v.width}×${v.height}`).to.equal(true);
    expect(near(rect(img).width, v.width / 0.2, 1)).to.equal(true);
  });

  it('a crop without croppable shows the plain contained image (no wrapper)', async () => {
    const { el } = await mk({ attrs: filled(LAND, { usage: true, crop: CROP }) });
    await ready(el);
    expect(!!q(el, '.td-media-field__view')).to.equal(false);
  });

  it('SSR-shaped markup is square before the module upgrades it (no layout shift)', async () => {
    const wrap = document.createElement('div');
    wrap.style.width = '400px';
    // markup of td_media_field() without JS: the element is already defined here, so compare the frame at connect and after two frames
    wrap.innerHTML = '<td-media-field name="s" label="S" aspect-ratio="16/7" value="m1" preview-src="' + LAND + '">'
      + '<span class="td-media-field__label">S</span><div class="td-media-field__frame" data-state="filled" data-kind="image">'
      + '<svg class="td-media-field__sizer" viewBox="0 0 16 7" aria-hidden="true" focusable="false"></svg>'
      + '<button type="button" class="td-media-field__open"><img class="td-media-field__img" src="' + LAND + '" alt=""></button></div></td-media-field>';
    box.appendChild(wrap);
    const el = wrap.firstChild;
    const before = rect(q(el, '.td-media-field__frame'));
    await frames(3);
    const after = rect(q(el, '.td-media-field__frame'));
    expect(near(before.width, before.height) && near(after.width, after.height), `${before.width}×${before.height} → ${after.width}×${after.height}`).to.equal(true);
    expect(near(before.width, after.width) && near(before.height, after.height)).to.equal(true);
  });
});

describe('td-media-field v0.77.0 — preview-shape="ratio" keeps the pre-0.77 behaviour', () => {
  it('16/7 is not square; ratio is case-insensitive', async () => {
    for (const v of ['ratio', 'RATIO', 'Ratio']) {
      const { el } = await mk({ attrs: { 'aspect-ratio': '16/7', 'preview-shape': v } });
      const f = rect(q(el, '.td-media-field__frame'));
      expect(near(f.width / f.height, 16 / 7, 0.05), `${v}: ${f.width}×${f.height}`).to.equal(true);
      expect(getComputedStyle(q(el, '.td-media-field__sizer')).display).to.equal('block');
    }
  });

  it('free mode follows the image ratio; the ratio frame covers (preview-fit contain still contains)', async () => {
    const free = await mk({ attrs: filled(LAND, { 'preview-shape': 'ratio' }) });
    await ready(free.el);
    const f = rect(q(free.el, '.td-media-field__frame'));
    expect(near(f.width / f.height, 1.5, 0.05), `${f.width}×${f.height}`).to.equal(true);
    const cover = await mk({ attrs: filled(LAND, { 'preview-shape': 'ratio', 'aspect-ratio': '1/1' }) });
    await ready(cover.el);
    expect(getComputedStyle(q(cover.el, 'img')).objectFit).to.equal('cover');
    const contain = await mk({ attrs: filled(LAND, { 'preview-shape': 'ratio', 'aspect-ratio': '1/1', 'preview-fit': 'contain' }) });
    await ready(contain.el);
    expect(getComputedStyle(q(contain.el, 'img')).objectFit).to.equal('contain');
  });

  it('the 2 % crop preview is unchanged: the img itself is offset in the opener, no wrapper', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'preview-shape': 'ratio', 'aspect-ratio': '3/2', crop: CROP }) });
    const img = await ready(el);
    await until(() => img.style.getPropertyValue('--_td-mf-crop-w') !== '', 4000, 'preview vars');
    await frames(2);
    expect(!!q(el, '.td-media-field__view')).to.equal(false);
    const b = rect(q(el, '.td-media-field__open'));
    const r = rect(img);
    expect(near(r.width, b.width * 2, 1) && near(r.left, b.left - b.width * 0.5, 1), `${r.left},${r.width} vs ${b.left},${b.width}`).to.equal(true);
  });
});

describe('td-media-field v0.77.0 — the attribute mapping (CSS and JS agree)', () => {
  it('" ratio " (with spaces) is NOT the opt-out: square in CSS and the JS crop view', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'aspect-ratio': '3/2', crop: CROP, 'preview-shape': ' ratio ' }) });
    const img = await ready(el);
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'view wrapper');
    expect(isSquare(el)).to.equal(true);
    expect(el._square()).to.equal(true);
    expect(getComputedStyle(img).position).to.equal('absolute');
  });

  it('any other value (circle, empty) = square', async () => {
    for (const v of ['circle', '']) {
      const { el } = await mk({ attrs: { 'aspect-ratio': '16/7', 'preview-shape': v } });
      expect(isSquare(el), JSON.stringify(v)).to.equal(true);
    }
  });

  it('changing preview-shape at runtime switches the mode and neither leaks the wrapper nor the vars', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'aspect-ratio': '3/2', crop: CROP }) });
    const img = await ready(el);
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'view wrapper');
    expect(isSquare(el)).to.equal(true);
    el.setAttribute('preview-shape', 'ratio');
    await until(() => !q(el, '.td-media-field__view'), 4000, 'wrapper removed');
    await until(() => img.style.getPropertyValue('--_td-mf-crop-w') !== '', 4000, 'ratio vars');
    await frames(2);
    expect(img.parentElement === q(el, '.td-media-field__open'), 'img back in the opener').to.equal(true);
    const f = rect(q(el, '.td-media-field__frame'));
    expect(near(f.width / f.height, 1.5, 0.05), `ratio: ${f.width}×${f.height}`).to.equal(true);
    expect(q(el, '.td-media-field__open').querySelectorAll('.td-media-field__view').length).to.equal(0);
    el.removeAttribute('preview-shape');
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'wrapper back');
    await frames(2);
    expect(isSquare(el)).to.equal(true);
    expect(q(el, '.td-media-field__open').querySelectorAll('.td-media-field__view').length).to.equal(1);
    expect(img.isConnected).to.equal(true);
  });

  it('the documented parts still resolve: open button, img (also inside the view)', async () => {
    const { el } = await mk({ attrs: filled(LAND, { ...CROPPABLE, 'aspect-ratio': '3/2', crop: CROP }) });
    const img = await ready(el);
    await until(() => !!q(el, '.td-media-field__view'), 4000, 'view wrapper');
    expect(el._part('img') === img).to.equal(true);
    expect(el._part('open') === q(el, 'button.td-media-field__open')).to.equal(true);
    expect(el._part('view') === q(el, '.td-media-field__view')).to.equal(true);
  });
});
