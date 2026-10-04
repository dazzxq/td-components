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
