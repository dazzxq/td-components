import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaField } from './td-media-field.js';

// v0.71.0 (plan docs/internal/plans/v0.71.0-field-frame-table-empty.md, K10 of dsuite) — --td-media-field-frame-w sizes the image
// FRAME alone: the label, the helper text and the error line keep the width of the HOST (a small square
// logo field no longer squeezes them into 120px). Without the token nothing changes. Chromium, Firefox AND WebKit.
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
const ERROR = 'Ảnh logo này chưa đạt yêu cầu: cần một ảnh vuông, nền trong suốt, tối thiểu 512 × 512 điểm ảnh.';
const HELP = 'PNG hoặc SVG, tối đa 2 MB.';
const FRAME_W = '--td-media-field-frame-w';

const box = document.createElement('div');
document.body.appendChild(box);
afterEach(() => { box.replaceChildren(); });

/**
 * A field in a wrapper of `hostW` px (CSSOM on the test page — the component never writes style). `tokens` (custom property →
 * value) are set on the host (`on: 'host'`) or on the wrapper (`on: 'parent'`, which reaches the field by inheritance).
 */
async function mk({ hostW = 400, tokens = {}, on = 'host', attrs = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${hostW}px`;
  const el = document.createElement('td-media-field');
  const all = { name: 'logo', label: 'Logo', 'preview-shape': 'ratio', 'aspect-ratio': '1/1', 'helper-text': HELP, 'error-text': ERROR, ...attrs };
  for (const [k, v] of Object.entries(all)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  for (const [k, v] of Object.entries(tokens)) (on === 'parent' ? wrap : el).style.setProperty(k, v);
  wrap.appendChild(el);
  box.appendChild(wrap);
  await frames(2);
  return { wrap, el };
}
const FILLED = { value: 'm1', 'preview-src': '/test/fixtures/1.svg', 'preview-alt': 'Logo' };
const w = (n) => n.getBoundingClientRect().width;
const h = (n) => n.getBoundingClientRect().height;
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
const q = (el, sel) => el.querySelector(sel);

describe('v0.71.0 td-media-field — --td-media-field-frame-w (K10)', () => {
  it('without the token the frame and label are as wide as the host (nothing changed)', async () => {
    const { el } = await mk({ attrs: FILLED });
    expect(near(w(el), 400), `host ${w(el)}`).to.equal(true);
    expect(near(w(q(el, '.td-media-field__frame')), 400), `frame ${w(q(el, '.td-media-field__frame'))}`).to.equal(true);
    expect(near(w(q(el, '.td-media-field__label')), 400)).to.equal(true);
    expect(q(el, '.td-media-field__actions'), 'v0.79.0: no actions row').to.equal(null);
  });

  it('a 7.5rem frame in a 400px host: the frame is a 120px square, the host keeps 400px', async () => {
    const { el } = await mk({ tokens: { [FRAME_W]: '7.5rem' } });
    const fr = q(el, '.td-media-field__frame');
    const want = 7.5 * ROOT_PX;
    expect(near(w(el), 400), `host ${w(el)}`).to.equal(true);
    expect(near(w(fr), want), `frame ${w(fr)} want ${want}`).to.equal(true);
    expect(near(h(fr), want, 1.5), `frame height ${h(fr)} (1/1 ratio)`).to.equal(true);
  });

  it('the label, the helper text and a long error line keep the HOST width (not squeezed into the frame)', async () => {
    const { el } = await mk({ tokens: { [FRAME_W]: '7.5rem' } });
    const frameW = w(q(el, '.td-media-field__frame'));
    const label = q(el, '.td-media-field__label');
    const help = q(el, '.td-media-field__help');
    const err = q(el, '.td-field-error');
    expect(label !== null && help !== null && err !== null, 'label / help / error rendered').to.equal(true);
    expect(near(w(label), 400), `label ${w(label)}`).to.equal(true);
    expect(near(w(help), 400), `help ${w(help)}`).to.equal(true);
    // the same sentence wrapped at the frame's 120px would be a column of short lines: its widest line must be wider than the frame
    expect(w(err) > frameW * 2, `error widest line ${w(err)} vs frame ${frameW}`).to.equal(true);
    expect(h(err) < 3 * parseFloat(getComputedStyle(err).lineHeight), `error height ${h(err)}`).to.equal(true);
  });

  it('a filled field: the X sits in the top-end corner of the small frame, the label keeps the host width', async () => {
    const { el } = await mk({ tokens: { [FRAME_W]: '7.5rem' }, attrs: FILLED });
    const fr = q(el, '.td-media-field__frame');
    const x = q(el, '.td-media-field__tools .td-media-field__remove').getBoundingClientRect();
    const f = fr.getBoundingClientRect();
    expect(near(w(fr), 7.5 * ROOT_PX), `frame ${w(fr)}`).to.equal(true);
    expect(near(w(q(el, '.td-media-field__label')), 400), 'label keeps the host width').to.equal(true);
    expect(x.left >= f.left - 0.5 && x.right <= f.right + 0.5 && x.top >= f.top - 0.5 && x.bottom <= f.bottom + 0.5, 'X inside the frame').to.equal(true);
    expect(near(x.right, f.right - 1 - 0.5 * ROOT_PX, 2), `X at the end edge ${x.right} vs ${f.right}`).to.equal(true);
  });

  it('the frame is capped at the host (a token wider than the host never overflows it)', async () => {
    const { el } = await mk({ hostW: 300, tokens: { [FRAME_W]: '900px' } });
    expect(near(w(q(el, '.td-media-field__frame')), 300), `frame ${w(q(el, '.td-media-field__frame'))}`).to.equal(true);
    expect(el.scrollWidth <= el.clientWidth + 1, 'no horizontal overflow').to.equal(true);
  });

  it('a percentage token is a share of the HOST width, also when it is inherited from a parent', async () => {
    const own = await mk({ tokens: { [FRAME_W]: '50%' } });
    expect(near(w(q(own.el, '.td-media-field__frame')), 200), `own ${w(q(own.el, '.td-media-field__frame'))}`).to.equal(true);
    const inherited = await mk({ hostW: 360, tokens: { [FRAME_W]: '25%' }, on: 'parent' });
    expect(near(w(q(inherited.el, '.td-media-field__frame')), 90), `inherited ${w(q(inherited.el, '.td-media-field__frame'))}`).to.equal(true);
  });

  it('a value that is neither a length nor a percentage (fit-content) is not usable: the frame stays as wide as the host', async () => {
    const { el } = await mk({ tokens: { [FRAME_W]: 'fit-content' } });
    expect(near(w(q(el, '.td-media-field__frame')), 400), `frame ${w(q(el, '.td-media-field__frame'))}`).to.equal(true);
  });

  it('a length token set on a parent reaches the field by inheritance', async () => {
    const { el } = await mk({ tokens: { [FRAME_W]: '6rem' }, on: 'parent' });
    expect(near(w(q(el, '.td-media-field__frame')), 6 * ROOT_PX), `frame ${w(q(el, '.td-media-field__frame'))}`).to.equal(true);
    expect(near(w(el), 400)).to.equal(true);
  });

  it('empty and filled frames both follow the token', async () => {
    const empty = await mk({ tokens: { [FRAME_W]: '8rem' } });
    const filled = await mk({ tokens: { [FRAME_W]: '8rem' }, attrs: FILLED });
    expect(near(w(q(empty.el, '.td-media-field__frame')), 8 * ROOT_PX), 'empty').to.equal(true);
    expect(near(w(q(filled.el, '.td-media-field__frame')), 8 * ROOT_PX), 'filled').to.equal(true);
  });

  it('both tokens together: --td-media-field-w sizes the host, --td-media-field-frame-w the frame inside it', async () => {
    const { el } = await mk({ hostW: 500, tokens: { '--td-media-field-w': '200px', [FRAME_W]: '7.5rem' } });
    expect(near(w(el), 200), `host ${w(el)}`).to.equal(true);
    expect(near(w(q(el, '.td-media-field__frame')), 7.5 * ROOT_PX), `frame ${w(q(el, '.td-media-field__frame'))}`).to.equal(true);
  });

  it('a filled croppable ratio field with a small frame: the cropped preview scales with the frame and is clipped inside it', async () => {
    const { el } = await mk({
      tokens: { [FRAME_W]: '7.5rem' },
      attrs: { usage: true, croppable: true, 'focal-point': true, 'aspect-ratio': '3/2', ...FILLED, crop: '{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}' },
    });
    const img = q(el, 'img');
    await until(() => img.complete && img.naturalWidth > 0, 4000, 'img decoded');
    await until(() => img.style.getPropertyValue('--_td-mf-crop-w') !== '', 4000, 'preview vars');
    await frames(2);
    const b = q(el, '.td-media-field__open').getBoundingClientRect();
    const r = img.getBoundingClientRect();
    const fr = q(el, '.td-media-field__frame');
    expect(near(w(fr), 7.5 * ROOT_PX), `frame ${w(fr)}`).to.equal(true);
    expect(near(b.width, fr.clientWidth), `the open button fills the small frame inside its 1px borders (${b.width} vs ${fr.clientWidth})`).to.equal(true);
    // crop x .25 w .5 on a frame of the same pixel ratio: the image is 2× the frame, shifted by half of it (percentages of the frame)
    expect(near(r.width, b.width * 2, 1) && near(r.height, b.height * 2, 1), `${r.width}×${r.height} vs ${b.width}×${b.height}`).to.equal(true);
    expect(near(r.left, b.left - b.width * 0.5, 1) && near(r.top, b.top - b.height * 0.5, 1), 'shifted by half the frame').to.equal(true);
    // the part outside the frame is clipped (overflow:hidden of the open button): a point right of the frame, inside the host column,
    // does not hit the image
    const hit = document.elementFromPoint(b.right + 8, b.top + b.height / 2);
    expect(hit === img, 'the image does not spill into the host column').to.equal(false);
  });

  it('a 300px host with a 6rem frame: the X stays inside the small frame', async () => {
    const { el } = await mk({ hostW: 300, tokens: { [FRAME_W]: '6rem' }, attrs: FILLED });
    const x = q(el, '.td-media-field__tools .td-media-field__remove').getBoundingClientRect();
    const f = q(el, '.td-media-field__frame').getBoundingClientRect();
    expect(x.right <= f.right + 0.5 && x.left >= f.left - 0.5, 'X inside the frame').to.equal(true);
  });

  it('the token is declared with a 100% default next to --td-media-field-w', async () => {
    const { el } = await mk({ hostW: 400 });
    const cs = getComputedStyle(el);
    expect(cs.getPropertyValue(FRAME_W).trim()).to.equal('100%');
    expect(cs.getPropertyValue('--td-media-field-w').trim()).to.equal('100%');
  });
});
