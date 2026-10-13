// v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md M1, decisions 2, 4-13) — pure crop geometry of <td-cropper>.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MIN_PX, q, round4, minSize, fitLargest, clampRect, moveBy, resizeFrom, scaleAround, applyPreset, normalizeInitial,
  stepFor, toOutput, isWholeImage, clampFocal, ratioMismatch, displayToModel, modelToDisplay, containFit, wheelFactor,
  isTrackpadDelta, dampedWheelFactor, WHEEL_FRAME_CAP,
  cropChanged, focalChanged,
  PAN_MAX_UPSCALE, panFrame, panFit, panBy, panPinch, panZoom, panRatio, panMinWidth, panZoomToT, panTToWidth,
} from './crop-geometry.js';
import { parseCrop, serializeCrop } from './media-field-model.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const inside = (r, W, H) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9;

/** Seeded PRNG (mulberry32) — no dependency. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fitLargest (decision 11)', () => {
  it('wide image, tall image, exact ratio — centred', () => {
    assert.deepEqual(fitLargest(2000, 1000, 1), { x: 500, y: 0, w: 1000, h: 1000 });
    assert.deepEqual(fitLargest(1000, 2000, 1), { x: 0, y: 500, w: 1000, h: 1000 });
    assert.deepEqual(fitLargest(1600, 900, 16 / 9), { x: 0, y: 0, w: 1600, h: 900 });
  });
  it('1.91 (OG) and 64:9', () => {
    const og = fitLargest(1200, 1200, 1.91);
    assert.ok(near(og.w, 1200) && near(og.h, 1200 / 1.91) && near(og.y, (1200 - 1200 / 1.91) / 2));
    const wide = fitLargest(1000, 1000, 64 / 9);
    assert.ok(near(wide.w / wide.h, 64 / 9) && near(wide.w, 1000));
  });
  it('no ratio ⇒ whole image; a centre is kept but clamped inside', () => {
    assert.deepEqual(fitLargest(300, 200, null), { x: 0, y: 0, w: 300, h: 200 });
    assert.deepEqual(fitLargest(2000, 1000, 1, { x: 100, y: 500 }), { x: 0, y: 0, w: 1000, h: 1000 });
    assert.deepEqual(fitLargest(2000, 1000, 1, { x: 1200, y: 500 }), { x: 700, y: 0, w: 1000, h: 1000 });
  });
  it('image smaller than MIN_PX still fits', () => {
    assert.deepEqual(fitLargest(10, 8, 1), { x: 1, y: 0, w: 8, h: 8 });
    assert.deepEqual(minSize(10, 8, 1), { w: 8, h: 8 });
    assert.deepEqual(minSize(10, 8, null), { w: 10, h: 8 });
    assert.deepEqual(minSize(1000, 1000, 2), { w: 32, h: 16 });
    assert.deepEqual(minSize(1000, 1000, 0.5), { w: 16, h: 32 });
    assert.equal(MIN_PX, 16);
  });
});

describe('moveBy / clampRect', () => {
  it('moves, clamps at the edges, keeps the size', () => {
    const r = { x: 100, y: 100, w: 200, h: 100 };
    assert.deepEqual(moveBy(r, 50, -20, 1000, 500), { x: 150, y: 80, w: 200, h: 100 });
    assert.deepEqual(moveBy(r, -500, 900, 1000, 500), { x: 0, y: 400, w: 200, h: 100 });
    assert.deepEqual(clampRect({ x: -5, y: 0, w: 2000, h: 10 }, 1000, 500), { x: 0, y: 0, w: 1000, h: 10 });
  });
});

describe('resizeFrom (decision 14)', () => {
  const W = 1000;
  const H = 800;
  const r = { x: 200, y: 200, w: 400, h: 300 };
  it('free: each corner and edge, anchor = opposite', () => {
    assert.deepEqual(resizeFrom('se', r, { dx: 50, dy: 20 }, { W, H }), { x: 200, y: 200, w: 450, h: 320 });
    assert.deepEqual(resizeFrom('nw', r, { dx: -50, dy: -20 }, { W, H }), { x: 150, y: 180, w: 450, h: 320 });
    assert.deepEqual(resizeFrom('ne', r, { dx: 10, dy: 10 }, { W, H }), { x: 200, y: 210, w: 410, h: 290 });
    assert.deepEqual(resizeFrom('sw', r, { dx: 10, dy: 10 }, { W, H }), { x: 210, y: 200, w: 390, h: 310 });
    assert.deepEqual(resizeFrom('e', r, { dx: 30, dy: 99 }, { W, H }), { x: 200, y: 200, w: 430, h: 300 });
    assert.deepEqual(resizeFrom('w', r, { dx: 30, dy: 99 }, { W, H }), { x: 230, y: 200, w: 370, h: 300 });
    assert.deepEqual(resizeFrom('n', r, { dx: 99, dy: 30 }, { W, H }), { x: 200, y: 230, w: 400, h: 270 });
    assert.deepEqual(resizeFrom('s', r, { dx: 99, dy: 30 }, { W, H }), { x: 200, y: 200, w: 400, h: 330 });
  });
  it('free: clamps at the image edge, never flips (stops at the minimum)', () => {
    assert.deepEqual(resizeFrom('se', r, { dx: 5000, dy: 5000 }, { W, H }), { x: 200, y: 200, w: 800, h: 600 });
    assert.deepEqual(resizeFrom('nw', r, { dx: -5000, dy: -5000 }, { W, H }), { x: 0, y: 0, w: 600, h: 500 });
    const flipped = resizeFrom('se', r, { dx: -5000, dy: -5000 }, { W, H });
    assert.deepEqual(flipped, { x: 200, y: 200, w: MIN_PX, h: MIN_PX });
    const flippedW = resizeFrom('w', r, { dx: 5000, dy: 0 }, { W, H });
    assert.deepEqual(flippedW, { x: 600 - MIN_PX, y: 200, w: MIN_PX, h: 300 });
  });
  it('locked: corners keep the ratio exactly; the dominant axis decides; axis forces one', () => {
    const lr = { x: 200, y: 200, w: 400, h: 200 };
    const a = resizeFrom('se', lr, { dx: 100, dy: 10 }, { W, H, ratio: 2 });
    assert.ok(near(a.w / a.h, 2) && near(a.w, 500) && a.x === 200 && a.y === 200);
    const b = resizeFrom('se', lr, { dx: 0, dy: 100 }, { W, H, ratio: 2 });
    assert.ok(near(b.w, 600) && near(b.h, 300));
    const c = resizeFrom('nw', lr, { dx: -100, dy: 0 }, { W, H, ratio: 2 });
    assert.ok(near(c.w, 500) && near(c.x + c.w, 600) && near(c.y + c.h, 400));
    const k = resizeFrom('se', lr, { dx: 0, dy: 10 }, { W, H, ratio: 2, axis: 'y' });
    assert.ok(near(k.h, 210) && near(k.w, 420));
    const kx = resizeFrom('se', lr, { dx: 10, dy: 0 }, { W, H, ratio: 2, axis: 'x' });
    assert.ok(near(kx.w, 410) && near(kx.h, 205));
  });
  it('locked: clamps at the image edge with the ratio, min on the short side', () => {
    const lr = { x: 200, y: 200, w: 400, h: 200 };
    const big = resizeFrom('se', lr, { dx: 5000, dy: 0 }, { W, H, ratio: 2 });
    assert.ok(near(big.w, 800) && near(big.h, 400) && inside(big, W, H));
    const small = resizeFrom('se', lr, { dx: -5000, dy: 0 }, { W, H, ratio: 2 });
    assert.ok(near(small.h, MIN_PX) && near(small.w, 2 * MIN_PX) && small.x === 200);
    const tall = resizeFrom('nw', { x: 0, y: 0, w: 400, h: 200 }, { dx: -100, dy: -100 }, { W, H, ratio: 2 });
    assert.ok(near(tall.w / tall.h, 2) && inside(tall, W, H));
  });
  it('locked edge handle (not in the UI) is still total and keeps the ratio', () => {
    const lr = { x: 200, y: 200, w: 400, h: 200 };
    const e = resizeFrom('e', lr, { dx: 100, dy: 0 }, { W, H, ratio: 2 });
    assert.ok(near(e.w / e.h, 2) && near(e.x, 200) && near(e.y + e.h / 2, 300));
    const s = resizeFrom('s', lr, { dx: 0, dy: 50 }, { W, H, ratio: 2 });
    assert.ok(near(s.w / s.h, 2) && near(s.y, 200) && near(s.x + s.w / 2, 400));
  });
});

describe('scaleAround (decision 13 — zoom = resize the box around an anchor)', () => {
  const W = 1000;
  const H = 1000;
  it('centre anchor: zoom in × 0.9 / out × 1/0.9', () => {
    const r = { x: 300, y: 300, w: 400, h: 400 };
    const zi = scaleAround(r, 0.9, { x: 500, y: 500 }, { W, H });
    assert.ok(near(zi.w, 360) && near(zi.x, 320));
    const zo = scaleAround(r, 1 / 0.9, { x: 500, y: 500 }, { W, H });
    assert.ok(near(zo.w, 400 / 0.9) && near(zo.x + zo.w / 2, 500));
  });
  it('corner / outside anchor, translated inside', () => {
    const r = { x: 0, y: 0, w: 400, h: 400 };
    const z = scaleAround(r, 2, { x: 0, y: 0 }, { W, H });
    assert.deepEqual(z, { x: 0, y: 0, w: 800, h: 800 });
    const out = scaleAround({ x: 600, y: 600, w: 400, h: 400 }, 2, { x: 2000, y: 2000 }, { W, H });
    assert.ok(inside(out, W, H) && near(out.w, 800));
  });
  it('clamped to [min, largest of the current ratio]', () => {
    const r = { x: 0, y: 0, w: 400, h: 200 };
    const max = scaleAround(r, 100, { x: 200, y: 100 }, { W, H, ratio: 2 });
    assert.ok(near(max.w, 1000) && near(max.h, 500));
    const min = scaleAround(r, 0.0001, { x: 200, y: 100 }, { W, H, ratio: 2 });
    assert.ok(near(min.h, MIN_PX) && near(min.w, 32));
    assert.deepEqual(scaleAround(r, NaN, { x: 0, y: 0 }, { W, H }), r);
  });
});

describe('applyPreset (decision 12) / normalizeInitial (decision 11)', () => {
  it('preset keeps the centre (clamped); free keeps the box', () => {
    const r = { x: 100, y: 100, w: 200, h: 200 };
    const p = applyPreset(r, 16 / 9, 1600, 1000);
    assert.ok(near(p.w, 1600) && near(p.h, 900) && near(p.y, 0));
    const p2 = applyPreset({ x: 1300, y: 0, w: 300, h: 1000 }, 1, 1600, 1000);
    assert.deepEqual(p2, { x: 600, y: 0, w: 1000, h: 1000 });
    assert.deepEqual(applyPreset(r, null, 1600, 1000), r);
  });
  it('null ⇒ largest of the ratio / whole image', () => {
    assert.deepEqual(normalizeInitial(null, { W: 2000, H: 1000, ratio: 1 }), { x: 500, y: 0, w: 1000, h: 1000 });
    assert.deepEqual(normalizeInitial(null, { W: 2000, H: 1000 }), { x: 0, y: 0, w: 2000, h: 1000 });
  });
  it('valid crop is used', () => {
    const r = normalizeInitial({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, { W: 1000, H: 1000 });
    assert.ok(near(r.x, 100) && near(r.y, 200) && near(r.w, 500) && near(r.h, 500));
  });
  it('locked + off ratio ⇒ the largest of the ratio INSIDE it, same centre', () => {
    const r = normalizeInitial({ x: 0, y: 0, width: 1, height: 1 }, { W: 1000, H: 1000, ratio: 2 });
    assert.ok(near(r.w, 1000) && near(r.h, 500) && near(r.y, 250));
    const t = normalizeInitial({ x: 0.2, y: 0, width: 0.2, height: 1 }, { W: 1000, H: 1000, ratio: 1 });
    assert.ok(near(t.w, 200) && near(t.h, 200) && near(t.y, 400) && near(t.x, 200));
  });
  it('too small ⇒ grown around the centre; min > image ⇒ the largest possible', () => {
    const r = normalizeInitial({ x: 0.5, y: 0.5, width: 0.001, height: 0.001 }, { W: 1000, H: 1000 });
    assert.ok(near(r.w, MIN_PX) && near(r.x + r.w / 2, 500.5));
    const edge = normalizeInitial({ x: 0.999, y: 0, width: 0.001, height: 0.001 }, { W: 1000, H: 1000 });
    assert.ok(inside(edge, 1000, 1000) && near(edge.w, MIN_PX));
    const tiny = normalizeInitial({ x: 0, y: 0, width: 0.5, height: 0.5 }, { W: 10, H: 8, ratio: 1 });
    assert.ok(near(tiny.w, 8) && near(tiny.h, 8) && inside(tiny, 10, 8));
  });
});

describe('stepFor (decision 15)', () => {
  it('1 % (≥ 1 px), × 10 with Shift', () => {
    assert.equal(stepFor(2000), 20);
    assert.equal(stepFor(2000, true), 200);
    assert.equal(stepFor(50), 1);
    assert.equal(stepFor(50, true), 10);
  });
});

describe('toOutput (decision 7)', () => {
  it('integer pixels, normalised from them, whole image = exactly 0 / 1', () => {
    const o = toOutput({ x: 0, y: 0, w: 1200, h: 630 }, { W: 1200, H: 630, pixelsKnown: true });
    assert.deepEqual(o, { normalized: { x: 0, y: 0, width: 1, height: 1 }, pixels: { x: 0, y: 0, width: 1200, height: 630 },
      aspectRatio: round4(1200 / 630) });
    assert.ok(isWholeImage(o));
  });
  it('rounding: w = min(w, W − x), ≥ 1; locked ratio rounded to 4 decimals', () => {
    const o = toOutput({ x: 999.6, y: 0.4, w: 0.7, h: 10.5 }, { W: 1000, H: 100, pixelsKnown: true, ratio: 1 / 3 });
    assert.deepEqual(o.pixels, { x: 999, y: 0, width: 1, height: 11 });
    assert.equal(o.aspectRatio, 0.3333);
    const p = toOutput({ x: 10.4, y: 10.4, w: 989.9, h: 10 }, { W: 1000, H: 100, pixelsKnown: true });
    assert.equal(p.pixels.x + p.pixels.width <= 1000, true);
  });
  it('pixelsKnown = false ⇒ no pixels key', () => {
    const o = toOutput({ x: 10, y: 10, w: 100, h: 50 }, { W: 400, H: 300 });
    assert.equal('pixels' in o, false);
    assert.deepEqual(o.normalized, { x: 0.025, y: q(10 / 300), width: 0.25, height: q(50 / 300) });
    assert.equal(o.aspectRatio, 2);
  });
  it('isWholeImage only for exactly 0,0,1,1', () => {
    assert.equal(isWholeImage({ normalized: { x: 0, y: 0, width: 1, height: 0.999999 } }), false);
    assert.equal(isWholeImage(null), false);
  });
  it('fuzz 10 000 seeded cases: every result passes parseCrop, stays inside, integers, locked ratio 4 decimals', () => {
    const rand = rng(0x35c0ffee);
    const presets = [null, 1, 4 / 3, 3 / 2, 16 / 9, 1.91, 64 / 9, 3, 2 / 3];
    for (let i = 0; i < 10000; i++) {
      const W = 1 + Math.floor(rand() * (rand() < 0.1 ? 40 : 8000));
      const H = 1 + Math.floor(rand() * (rand() < 0.1 ? 40 : 8000));
      const ratio = presets[Math.floor(rand() * presets.length)];
      let r = normalizeInitial(rand() < 0.3 ? null : {
        x: rand(), y: rand(), width: rand() * 1.2, height: rand() * 1.2,
      }, { W, H, ratio });
      const op = Math.floor(rand() * 4);
      if (op === 0) r = moveBy(r, (rand() - 0.5) * W * 2, (rand() - 0.5) * H * 2, W, H);
      else if (op === 1) {
        const hs = ratio ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        r = resizeFrom(/** @type {any} */ (hs[Math.floor(rand() * hs.length)]), r,
          { dx: (rand() - 0.5) * W * 3, dy: (rand() - 0.5) * H * 3 }, { W, H, ratio });
      } else if (op === 2) r = scaleAround(r, 0.05 + rand() * 4, { x: rand() * W, y: rand() * H }, { W, H, ratio });
      else if (ratio) r = applyPreset(r, ratio, W, H);
      assert.ok(inside(r, W, H), `inside #${i}`);
      const out = toOutput(r, { W, H, pixelsKnown: true, ratio });
      const n = out.normalized;
      const s = JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height });
      assert.ok(parseCrop(s), `parseCrop #${i} ${s}`);
      assert.ok(n.x + n.width <= 1 + 1e-9 && n.y + n.height <= 1 + 1e-9, `≤ 1 #${i}`);
      const p = out.pixels;
      assert.ok([p.x, p.y, p.width, p.height].every(Number.isInteger), `integers #${i}`);
      assert.ok(p.x >= 0 && p.y >= 0 && p.width >= 1 && p.height >= 1 && p.x + p.width <= W && p.y + p.height <= H, `px #${i}`);
      if (ratio) assert.equal(out.aspectRatio, round4(ratio));
      assert.equal(serializeCrop(n) !== null, true, `serializeCrop #${i}`);
    }
  });
});

describe('focal / ratio / display helpers', () => {
  it('clampFocal: q + [0, 1]; non-finite ⇒ null', () => {
    assert.deepEqual(clampFocal({ x: 0.1234567, y: 1.5 }), { x: 0.123457, y: 1 });
    assert.deepEqual(clampFocal({ x: -1, y: 0.5 }), { x: 0, y: 0.5 });
    assert.equal(clampFocal({ x: NaN, y: 0 }), null);
    assert.equal(clampFocal(null), null);
  });
  it('ratioMismatch at 0.99 % / 1.01 %', () => {
    assert.equal(ratioMismatch(1000, 1000, 1009.9, 1000), false);
    assert.equal(ratioMismatch(1000, 1000, 1010.1, 1000), true);
    assert.equal(ratioMismatch(1000, 1000, 1000, 1010.1), true);
    assert.equal(ratioMismatch(0, 1, 1, 1), true);
  });
  it('display ↔ model, contain fit, wheel factor', () => {
    assert.deepEqual(displayToModel({ x: 50, y: 25 }, 0.5), { x: 100, y: 50 });
    assert.deepEqual(modelToDisplay({ x: 100, y: 50, w: 200, h: 100 }, 0.5), { x: 50, y: 25, w: 100, h: 50 });
    assert.deepEqual(containFit(2000, 1000, 500, 500), { scale: 0.25, x: 0, y: 125, w: 500, h: 250 });
    assert.equal(containFit(0, 1, 1, 1).scale, 0);
    assert.equal(wheelFactor(0), 1);
    assert.ok(wheelFactor(-100) < 1 && wheelFactor(100) > 1);
    assert.equal(wheelFactor(-10000), 0.8);
    assert.equal(wheelFactor(10000), 1.25);
    assert.ok(near(wheelFactor(3, 1), Math.exp(48 * 0.002)));
  });
});

describe('cropChanged / focalChanged (crop dialog `changed`)', () => {
  const whole = { x: 0, y: 0, width: 1, height: 1 };
  it('null ⇔ whole image; identical ⇒ unchanged', () => {
    assert.equal(cropChanged(null, null, 1000, 500), false);
    assert.equal(cropChanged(null, whole, 1000, 500), false);
    assert.equal(cropChanged(whole, null, 1000, 500), false);
    const c = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    assert.equal(cropChanged(c, { ...c }, 1000, 500), false);
    assert.equal(cropChanged(c, null, 1000, 500), true);
    assert.equal(cropChanged(null, c, 1000, 500), true);
  });
  it('one model pixel of tolerance per axis (x / width with W, y / height with H)', () => {
    const c = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    assert.equal(cropChanged(c, { ...c, x: 0.1 + 1 / 1000 }, 1000, 500), false);
    assert.equal(cropChanged(c, { ...c, x: 0.1 + 1.5 / 1000 }, 1000, 500), true);
    assert.equal(cropChanged(c, { ...c, height: 0.4 + 1 / 500 }, 1000, 500), false);
    assert.equal(cropChanged(c, { ...c, height: 0.4 + 1.5 / 500 }, 1000, 500), true);
    // the floor is 1e-6 (huge images) and an unknown size falls back to it
    assert.equal(cropChanged(c, { ...c, width: 0.5 + 2e-6 }, 1e7, 1e7), true);
    assert.equal(cropChanged(c, { ...c, width: 0.5 + 2e-6 }, NaN, 0), true);
    assert.equal(cropChanged(c, { ...c, width: 0.5 + 5e-7 }, NaN, 0), false);
  });
  it('accepts CropValue-like objects ({ normalized })', () => {
    const c = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    assert.equal(cropChanged({ normalized: c }, c, 100, 100), false);
    assert.equal(cropChanged({ normalized: whole }, null, 100, 100), false);
  });
  it('focalChanged: ε 1e-6, null vs point', () => {
    assert.equal(focalChanged(null, null), false);
    assert.equal(focalChanged(null, { x: 0.5, y: 0.5 }), true);
    assert.equal(focalChanged({ x: 0.5, y: 0.5 }, null), true);
    assert.equal(focalChanged({ x: 0.5, y: 0.5 }, { x: 0.5 + 5e-7, y: 0.5 }), false);
    assert.equal(focalChanged({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + 2e-6 }), true);
  });
});

describe('static guard (decision 2): coordinates only — no pixels, no network', () => {
  const files = ['./crop-geometry.js', '../form/td-cropper.js', '../feedback/crop-dialog.js'];
  const banned = [/canvas/i, /toBlob/, /toDataURL/, /getImageData/, /\bfetch\s*\(/, /createObjectURL/, /crossorigin/i,
    /XMLHttpRequest/, /sendBeacon/];
  for (const f of files) {
    it(f, () => {
      const path = fileURLToPath(new URL(f, import.meta.url));
      assert.ok(existsSync(path), `${f} must exist (v0.35 lane B shipped it)`);
      // Comments may name the banned APIs (to say they are never used); the code may not.
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const re of banned) assert.equal(re.test(code), false, `${f} must not use ${re}`);
    });
  }
});

it('v0.36.0 trackpad damping: isTrackpadDelta + dampedWheelFactor (capped per frame)', () => {
  assert.equal(isTrackpadDelta(3, 0), true);
  assert.equal(isTrackpadDelta(-49, 0), true);
  assert.equal(isTrackpadDelta(100, 0), false);
  assert.equal(isTrackpadDelta(3, 1), false);
  assert.equal(isTrackpadDelta(Number.NaN, 0), false);
  assert.equal(dampedWheelFactor(0), 1);
  assert.ok(Math.abs(dampedWheelFactor(10) - Math.exp(0.02)) < 1e-12);
  assert.equal(dampedWheelFactor(1000), WHEEL_FRAME_CAP);
  assert.equal(dampedWheelFactor(-1000), 1 / WHEEL_FRAME_CAP);
  assert.equal(dampedWheelFactor(Number.POSITIVE_INFINITY), 1);
});

// v0.73.0 (plan docs/internal/plans/v0.73.0-cropper-pan-mode.md M1) — pan mode: the frame stands still, the image moves under it.
describe('pan mode geometry (v0.73.0)', () => {
  const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  /** screen position (frame space) of a model point under a fit */
  const screen = (p, f) => ({ x: f.x + p.x * f.scale, y: f.y + p.y * f.scale });

  it('panFrame: centred, the exact ratio, whole-pixel width / position, inside the content box; invalid ⇒ zero rect', () => {
    assert.deepEqual(panFrame(600, 400, 1), { x: 100, y: 0, w: 400, h: 400 });
    assert.deepEqual(panFrame(400, 600, 1), { x: 0, y: 100, w: 400, h: 400 });
    assert.deepEqual(panFrame(640, 400, 16 / 9), { x: 0, y: 20, w: 640, h: 360 });
    for (const [bw, bh, ratio] of [[592.5, 432.25, 1], [333.3, 211.7, 16 / 9], [280, 500, 4 / 3], [501, 300.4, 1.91], [77.7, 33.3, 0.5]]) {
      const f = panFrame(bw, bh, ratio);
      assert.ok(Number.isInteger(f.w) && Number.isInteger(f.x) && Number.isInteger(f.y), `integers ${bw}×${bh}`);
      assert.ok(near(f.w / f.h, ratio, 1e-12), 'ratio');
      assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= bw + 1e-9 && f.y + f.h <= bh + 1e-9, `inside ${bw}×${bh}`);
      assert.ok(Math.abs(f.x - (bw - f.w) / 2) <= 0.5 && Math.abs(f.y - (bh - f.h) / 2) <= 0.5, 'centred');
      assert.ok(bw - f.w <= 1 || bh - f.h <= 1 + 1 / ratio, 'the largest that fits (≤ 1 px of rounding)');
    }
    const zero = { x: 0, y: 0, w: 0, h: 0 };
    for (const bad of [[0, 100, 1], [100, 0, 1], [-5, 100, 1], [100, 100, 0], [100, 100, null], [100, 100, NaN], [0.5, 0.5, 1]]) {
      assert.deepEqual(panFrame(.../** @type {[number, number, number]} */ (bad)), zero);
    }
  });

  it('panFit: the frame stands still — the rect lies exactly under the frame, the image covers it', () => {
    const W = 4000;
    const H = 3000;
    const frame = panFrame(592, 432, 1);
    for (const rect of [fitLargest(W, H, 1), { x: 0, y: 0, w: 500, h: 500 }, { x: 3500, y: 2500, w: 500, h: 500 }, { x: 1234.5, y: 77.25, w: 321.5, h: 321.5 }]) {
      const f = panFit(rect, frame, W, H);
      assert.ok(near(f.scale, frame.w / rect.w));
      assert.ok(near(f.x + rect.x * f.scale, frame.x) && near(f.y + rect.y * f.scale, frame.y), 'top-left under the frame');
      assert.ok(near(rect.w * f.scale, frame.w) && near(rect.h * f.scale, frame.h), 'same size as the frame');
      assert.ok(near(f.w, W * f.scale) && near(f.h, H * f.scale));
      assert.ok(f.x <= frame.x + 1e-9 && f.y <= frame.y + 1e-9 && f.x + f.w >= frame.x + frame.w - 1e-9
        && f.y + f.h >= frame.y + frame.h - 1e-9, 'the image covers the frame');
    }
    assert.equal(panFit({ x: 0, y: 0, w: 0, h: 0 }, frame, W, H).scale, 0);
    assert.equal(panFit({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 0 }, W, H).scale, 0);
  });

  it('panBy: the finger goes right ⇒ rect.x decreases; clamped at the image edges; size unchanged', () => {
    const r = { x: 400, y: 300, w: 200, h: 200 };
    assert.deepEqual(panBy(r, 50, 0, 2, 1000, 800), { x: 375, y: 300, w: 200, h: 200 });
    assert.deepEqual(panBy(r, -50, 20, 2, 1000, 800), { x: 425, y: 290, w: 200, h: 200 });
    assert.deepEqual(panBy(r, 5000, -5000, 2, 1000, 800), { x: 0, y: 600, w: 200, h: 200 });
    assert.deepEqual(panBy(r, -5000, 5000, 2, 1000, 800), { x: 800, y: 0, w: 200, h: 200 });
    assert.deepEqual(panBy(r, 50, 50, 0, 1000, 800), r);
    assert.deepEqual(panBy(r, NaN, undefined, 2, 1000, 800), r);
  });

  it('zoom around the pointer: the model point under it keeps its screen position (away from the edges)', () => {
    const W = 4000;
    const H = 3000;
    const frame = panFrame(600, 400, 1);
    const r = { x: 1500, y: 1000, w: 800, h: 800 };
    for (const [k, at] of [[0.8, { x: 1700, y: 1650 }], [1.25, { x: 2200, y: 1100 }], [0.5, { x: 1400, y: 900 }]]) {
      const before = screen(at, panFit(r, frame, W, H));
      const z = panZoom(r, k, at, { ratio: 1, W, H, frameW: frame.w });
      assert.ok(near(z.w, r.w * k), `k ${k}`);
      const after = screen(at, panFit(z, frame, W, H));
      assert.ok(near(before.x, after.x, 1e-6) && near(before.y, after.y, 1e-6), `pointer fixed at k ${k}`);
    }
  });

  it('panPinch: pinch only = scaleAround; midpoint only = panBy; both ⇒ inside the image, same ratio', () => {
    const W = 2000;
    const H = 1500;
    const o = { ratio: 1, W, H };
    const r = { x: 600, y: 400, w: 600, h: 600 };
    const a = { x: 900, y: 700 };
    assert.deepEqual(panPinch(r, 0.5, a, { x: 0, y: 0 }, 400, o), scaleAround(r, 0.5, a, o));
    assert.deepEqual(panPinch(r, 1, a, { x: 30, y: -12 }, 400, o), panBy(r, 30, -12, 400 / 600, W, H));
    const both = panPinch(r, 0.5, a, { x: 40, y: 20 }, 400, o);
    assert.ok(near(both.w, 300) && near(both.h, 300) && inside(both, W, H));
    // the midpoint moved 40 px right at the scale AFTER the zoom (400 / 300): the rect went 30 model px left
    const z = scaleAround(r, 0.5, a, o);
    assert.ok(near(both.x, z.x - 30) && near(both.y, z.y - 15));
    const far = panPinch(r, 3, a, { x: -9000, y: 9000 }, 400, o);
    assert.ok(inside(far, W, H) && !ratioMismatch(far.w, far.h, 1, 1));
  });

  it('limits: all the way out = fitLargest; all the way in = max(minSize, frameW / PAN_MAX_UPSCALE); tiny image ⇒ no-op', () => {
    assert.equal(PAN_MAX_UPSCALE, 8);
    const W = 4000;
    const H = 3000;
    const r = { x: 1500, y: 1000, w: 800, h: 800 };
    const c = centre(r);
    const out = panZoom(r, 1e6, c, { ratio: 1, W, H, frameW: 400 });
    assert.ok(near(out.w, fitLargest(W, H, 1).w) && near(out.h, H) && inside(out, W, H), 'the largest rect of the ratio');
    assert.ok(near(panZoom(r, 1e-6, c, { ratio: 1, W, H, frameW: 400 }).w, 50)); // 400 / 8 > 16
    assert.ok(near(panZoom(r, 1e-6, c, { ratio: 1, W, H, frameW: 80 }).w, MIN_PX)); // 80 / 8 = 10 < 16
    assert.ok(near(panZoom(r, 1e-6, c, { ratio: 2, W, H, frameW: 80 }).w, 2 * MIN_PX));
    assert.ok(near(panZoom(r, 1e-6, c, { ratio: 1, W, H }).w, MIN_PX)); // no frame known ⇒ only minSize
    assert.equal(panMinWidth({ ratio: 1, W, H, frameW: 400 }), 50);
    assert.equal(panMinWidth({ ratio: 1, W, H, frameW: 80 }), MIN_PX);
    assert.equal(panMinWidth({ ratio: 1, W: 30, H: 20, frameW: 400 }), 20); // never above the largest rect
    // an image smaller than MIN_PX: the only rect is the largest one — zoom is a no-op both ways
    const tiny = fitLargest(10, 8, 1);
    for (const k of [0.5, 0.9, 1.5, 4]) assert.deepEqual(panZoom(tiny, k, centre(tiny), { ratio: 1, W: 10, H: 8, frameW: 400 }), tiny);
    assert.deepEqual(panZoom(r, NaN, c, { ratio: 1, W, H, frameW: 400 }), r);
    assert.deepEqual(panZoom(r, 0, c, { ratio: 1, W, H, frameW: 400 }), r);
  });

  for (const W of [4000, 100000]) {
    it(`display ceiling (geometry, not timing), W = ${W}: the image is never drawn wider than W · max(8, cover-fit scale)`, () => {
      const H = W * 0.75;
      const rand = rng(0x73c0ffee + W);
      for (const frameW of [152, 400, 592]) {
        const frame = { x: 0, y: 0, w: frameW, h: frameW };
        const o = { ratio: 1, W, H, frameW };
        const cover = frameW / fitLargest(W, H, 1).w;
        const bound = W * Math.max(PAN_MAX_UPSCALE, cover) * (1 + 1e-12);
        let r = fitLargest(W, H, 1);
        for (let i = 0; i < 400; i++) {
          r = panZoom(r, 0.5 + rand() * 0.6, { x: rand() * W, y: rand() * H }, o); // mostly zooming in
          assert.ok(panFit(r, frame, W, H).w <= bound, `#${i} ${panFit(r, frame, W, H).w} > ${bound}`);
          assert.ok(inside(r, W, H) && !ratioMismatch(r.w, r.h, 1, 1));
        }
        for (let i = 0; i < 60; i++) r = panZoom(r, 0.5, centre(r), o);
        assert.ok(near(r.w, frameW / PAN_MAX_UPSCALE, 1e-6), `ends ON the ceiling (${r.w})`);
        assert.ok(near(panFit(r, frame, W, H).w, W * PAN_MAX_UPSCALE, W * 1e-9));
      }
    });
  }

  it('display ceiling only stops zooming IN: a rect already below it is kept, never shrinks, and may still zoom out', () => {
    const W = 4000;
    const H = 3000;
    const small = { x: 1000, y: 1000, w: 20, h: 20 }; // frameW 400 ⇒ ceiling 50
    const o = { ratio: 1, W, H, frameW: 400 };
    const c = centre(small);
    for (const k of [0.99, 0.9, 0.5, 1e-6]) {
      const z = panZoom(small, k, c, o);
      assert.ok(near(z.x, small.x) && near(z.y, small.y) && near(z.w, 20) && near(z.h, 20), `kept at k ${k}`);
    }
    assert.ok(near(panZoom(small, 1, c, o).w, 20));
    assert.ok(near(panZoom(small, 2, c, o).w, 40), 'zooming out is free');
    assert.ok(near(panZoom(panZoom(small, 4, c, o), 0.1, c, o).w, 50), 'back in: stops at the ceiling, not at the old rect');
    // a stage resize (another frameW) never changes the rect by itself: nothing in the geometry reads frameW until a zoom
    for (const frameW of [100, 400, 1600]) {
      assert.ok(near(panZoom(small, 1, c, { ...o, frameW }).w, 20));
      assert.ok(near(panFit(small, { x: 0, y: 0, w: frameW, h: frameW }, W, H).scale, frameW / 20));
    }
    // an image so small that cover-fit is already beyond 8 ×: no zoom in at all
    const big = fitLargest(40, 30, 1);
    assert.deepEqual(panZoom(big, 0.5, centre(big), { ratio: 1, W: 40, H: 30, frameW: 400 }), big);
  });

  it('panRatio: 1:1 → 16:9 → 1:1 keeps the centre and the relative zoom; always the new ratio, inside the image', () => {
    const W = 4000;
    const H = 3000;
    const r = { x: 1700, y: 1200, w: 600, h: 600 }; // zoom 3000 / 600 = 5 ×
    const wide = panRatio(r, 1, 16 / 9, W, H);
    assert.ok(near(wide.w, 4000 / 5) && near(wide.w / wide.h, 16 / 9), 'relative zoom 5 × of the 16:9 largest');
    assert.deepEqual(centre(wide), centre(r));
    const back = panRatio(wide, 16 / 9, 1, W, H);
    assert.ok(near(back.x, r.x) && near(back.y, r.y) && near(back.w, r.w) && near(back.h, r.h), 'round trip');
    // NOT applyPreset (which falls back to the widest view)
    assert.ok(near(applyPreset(r, 16 / 9, W, H).w, 4000) && wide.w < 1000);
    // the widest view stays the widest view
    assert.deepEqual(panRatio(fitLargest(W, H, 1), 1, 16 / 9, W, H), fitLargest(W, H, 16 / 9));
    // near an edge: clamped inside, ratio kept; never below minSize
    const edge = panRatio({ x: 3900, y: 0, w: 100, h: 100 }, 1, 16 / 9, W, H);
    assert.ok(inside(edge, W, H) && near(edge.w / edge.h, 16 / 9));
    const min = panRatio({ x: 100, y: 100, w: 16, h: 16 }, 1, 2, W, H);
    assert.ok(near(min.h, MIN_PX) && near(min.w, 2 * MIN_PX));
    const r0 = { x: 1, y: 2, w: 3, h: 3 };
    assert.deepEqual(panRatio(r0, null, 1, W, H), r0);
    assert.deepEqual(panRatio(r0, 1, 0, W, H), r0);
  });

  it('toOutput square (pan 1:1 only): integer pixels exactly square; WITHOUT the flag the output is the old one', () => {
    const edge = { x: 50.5, y: 10.2, w: 50.5, h: 50.5 };
    const o = { W: 101, H: 100, pixelsKnown: true, ratio: 1 };
    assert.deepEqual(toOutput(edge, o).pixels, { x: 51, y: 10, width: 50, height: 51 }); // box mode: unchanged (50 × 51)
    assert.deepEqual(toOutput(edge, { ...o, square: false }).pixels, { x: 51, y: 10, width: 50, height: 51 });
    const sq = toOutput(edge, { ...o, square: true });
    assert.deepEqual(sq.pixels, { x: 51, y: 10, width: 50, height: 50 });
    assert.equal(sq.aspectRatio, 1);
    assert.ok(parseCrop(JSON.stringify({ v: 1, ...sq.normalized })));
    assert.deepEqual(sq.normalized, { x: q(51 / 101), y: 0.1, width: q(50 / 101), height: 0.5 });
    // the four corners of an odd image and `.5` positions
    for (const [W, H] of [[101, 100], [100, 101], [333, 77], [77, 333]]) {
      const s = Math.min(W, H) / 2 + 0.5;
      for (const r of [{ x: 0, y: 0 }, { x: W - s, y: 0 }, { x: 0, y: H - s }, { x: W - s, y: H - s }, { x: (W - s) / 2, y: (H - s) / 2 }]) {
        const out = toOutput({ ...r, w: s, h: s }, { W, H, pixelsKnown: true, ratio: 1, square: true });
        assert.equal(out.pixels.width, out.pixels.height, `${W}×${H} @ ${r.x},${r.y}`);
        assert.ok(out.pixels.x + out.pixels.width <= W && out.pixels.y + out.pixels.height <= H);
      }
    }
    // a square that already rounds square is untouched by the flag
    const plain = { x: 10, y: 20, w: 300, h: 300 };
    assert.deepEqual(toOutput(plain, { W: 1000, H: 800, pixelsKnown: true, ratio: 1, square: true }),
      toOutput(plain, { W: 1000, H: 800, pixelsKnown: true, ratio: 1 }));
  });

  it('zoom slider scale: LOG, exact ends, round trip — also for a width below the ceiling', () => {
    const wMax = 3000;
    const wMin = 50;
    assert.equal(panZoomToT(wMax, wMin, wMax), 0);
    assert.equal(panZoomToT(wMin, wMin, wMax), 1);
    assert.equal(panTToWidth(0, wMin, wMax), wMax);
    assert.equal(panTToWidth(1, wMin, wMax), wMin);
    // log, not linear: half way is the GEOMETRIC mean (each step is the same zoom factor)
    assert.ok(near(panTToWidth(0.5, wMin, wMax), Math.sqrt(wMin * wMax), 1e-9));
    assert.ok(near(panZoomToT(Math.sqrt(wMin * wMax), wMin, wMax), 0.5, 1e-12));
    assert.ok(near(panTToWidth(0.25, wMin, wMax) / panTToWidth(0.5, wMin, wMax), panTToWidth(0.5, wMin, wMax) / panTToWidth(0.75, wMin, wMax), 1e-9));
    for (const w of [3000, 2999.5, 1234.56, 400, 77.7, 50.001, 50]) {
      assert.ok(near(panTToWidth(panZoomToT(w, wMin, wMax), wMin, wMax), w, 1e-9), `round trip ${w}`);
    }
    // a rect narrower than the ceiling becomes the lower end itself (wMinEff = min(wMin, w)): t = 1 maps back EXACTLY
    for (const w of [49.999, 20, 16.5, 7.123456789]) {
      const eff = Math.min(wMin, w);
      assert.equal(panZoomToT(w, eff, wMax), 1);
      assert.equal(panTToWidth(panZoomToT(w, eff, wMax), eff, wMax), w);
    }
    // out of range / degenerate
    assert.equal(panZoomToT(5000, wMin, wMax), 0);
    assert.equal(panZoomToT(10, wMin, wMax), 1);
    assert.equal(panZoomToT(100, 100, 100), 0);
    assert.equal(panTToWidth(0.5, 100, 100), 100);
    assert.equal(panTToWidth(-1, wMin, wMax), wMax);
    assert.equal(panTToWidth(2, wMin, wMax), wMin);
    assert.equal(panTToWidth(NaN, wMin, wMax), wMax);
  });

  it('unknown original size + an initial crop off the frame ratio: the frame still stands still, no pixels in the output', () => {
    const W = 800; // the size of the preview only (no natural-*)
    const H = 450;
    const rect = normalizeInitial({ x: 0.1, y: 0.2, width: 0.5, height: 0.25 }, { W, H, ratio: 1 });
    assert.ok(!ratioMismatch(rect.w, rect.h, 1, 1) && inside(rect, W, H));
    const frame = panFrame(592, 432, 1);
    const f = panFit(rect, frame, W, H);
    assert.ok(near(f.x + rect.x * f.scale, frame.x) && near(f.y + rect.y * f.scale, frame.y) && near(rect.w * f.scale, frame.w));
    const out = toOutput(rect, { W, H, ratio: 1, square: true });
    assert.equal('pixels' in out, false);
    assert.ok(parseCrop(JSON.stringify({ v: 1, ...out.normalized })));
  });

  it('fuzz 10 000 seeded steps of pan / zoom / pinch / ratio change: inside the image, the ratio in force, parseCrop', () => {
    const rand = rng(0x0073a11e);
    const ratios = [1, 4 / 3, 3 / 2, 16 / 9, 1.91, 2 / 3, 0.5];
    let steps = 0;
    for (let img = 0; img < 250; img++) {
      const W = 1 + Math.floor(rand() * (rand() < 0.1 ? 40 : 8000));
      const H = 1 + Math.floor(rand() * (rand() < 0.1 ? 40 : 8000));
      let ratio = ratios[Math.floor(rand() * ratios.length)];
      const bw = 100 + rand() * 900;
      const bh = 100 + rand() * 700;
      let r = normalizeInitial(rand() < 0.3 ? null : { x: rand(), y: rand(), width: rand() * 1.2, height: rand() * 1.2 }, { W, H, ratio });
      for (let i = 0; i < 40; i++, steps++) {
        const frame = panFrame(bw, bh, ratio);
        const o = { ratio, W, H, frameW: frame.w };
        const scale = frame.w / r.w;
        const op = Math.floor(rand() * 4);
        if (op === 0) r = panBy(r, (rand() - 0.5) * bw * 3, (rand() - 0.5) * bh * 3, scale, W, H);
        else if (op === 1) r = panZoom(r, 0.05 + rand() * 4, { x: rand() * W, y: rand() * H }, o);
        else if (op === 2) r = panPinch(r, 0.2 + rand() * 3, { x: rand() * W, y: rand() * H }, { x: (rand() - 0.5) * bw, y: (rand() - 0.5) * bh }, frame.w, o);
        else {
          const next = ratios[Math.floor(rand() * ratios.length)];
          r = panRatio(r, ratio, next, W, H);
          ratio = next;
        }
        const tag = `#${img}.${i} op ${op} ${W}×${H} ${JSON.stringify(r)}`;
        assert.ok(inside(r, W, H), `inside ${tag}`);
        assert.ok(r.w > 0 && r.h > 0 && !ratioMismatch(r.w, r.h, ratio, 1, 1e-9), `ratio ${tag}`);
        const f = panFit(r, panFrame(bw, bh, ratio), W, H);
        assert.ok(f.scale > 0 && Number.isFinite(f.x) && Number.isFinite(f.w), `fit ${tag}`);
        const out = toOutput(r, { W, H, pixelsKnown: true, ratio, square: ratio === 1 });
        const n = out.normalized;
        assert.ok(parseCrop(JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height })), `parseCrop ${tag}`);
        assert.ok(n.x + n.width <= 1 + 1e-9 && n.y + n.height <= 1 + 1e-9, `≤ 1 ${tag}`);
        const p = out.pixels;
        assert.ok(p.x >= 0 && p.y >= 0 && p.width >= 1 && p.height >= 1 && p.x + p.width <= W && p.y + p.height <= H, `px ${tag}`);
        if (ratio === 1) assert.equal(p.width, p.height, `square ${tag}`);
      }
    }
    assert.equal(steps, 10000);
  });
});
