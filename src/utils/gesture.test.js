// v0.36.2 (ADR 0019, plan QĐ 11): pure gesture maths shared by sortable / lightbox / press states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_SLOP, dragSlop, axisLock, releaseVelocity, swipeOutcome, rubberBand, RUBBER_RESISTANCE } from './gesture.js';

test('dragSlop: per pointer type, unknown = mouse', () => {
  assert.deepEqual(DRAG_SLOP, { mouse: 4, pen: 8, touch: 10 });
  assert.equal(dragSlop('mouse'), 4);
  assert.equal(dragSlop('pen'), 8);
  assert.equal(dragSlop('touch'), 10);
  assert.equal(dragSlop(''), 4);
  assert.equal(dragSlop(undefined), 4);
  assert.equal(dragSlop('kinect'), 4);
  assert.ok(Object.isFrozen(DRAG_SLOP));
});

test('axisLock: null under the slop, the dominant axis at / over it, the diagonal goes to y (never hijack a scroll)', () => {
  assert.equal(axisLock(0, 0, 10), null);
  assert.equal(axisLock(9.9, 0, 10), null);
  assert.equal(axisLock(6, 6, 10), null); // hypot 8.49
  assert.equal(axisLock(10, 0, 10), 'x');
  assert.equal(axisLock(-10, 0, 10), 'x');
  assert.equal(axisLock(0, -10, 10), 'y');
  assert.equal(axisLock(12, 5, 10), 'x');
  assert.equal(axisLock(5, -12, 10), 'y');
  assert.equal(axisLock(8, 8, 10), 'y'); // 45°
  assert.equal(axisLock(-8, -8, 10), 'y');
});

test('releaseVelocity: px/ms over the samples of the last window; 0 / 1 sample → 0; stale samples ignored', () => {
  assert.equal(releaseVelocity([], 1000), 0);
  assert.equal(releaseVelocity([{ x: 5, t: 990 }], 1000), 0);
  assert.equal(releaseVelocity([{ x: 0, t: 950 }, { x: 40, t: 1000 }], 1000), 0.8);
  assert.equal(releaseVelocity([{ x: 0, t: 920 }, { x: -20, t: 960 }, { x: -60, t: 1000 }], 1000), -0.75);
  // samples older than the window do not count: the finger stopped before lifting
  assert.equal(releaseVelocity([{ x: 0, t: 100 }, { x: 300, t: 200 }], 1000), 0);
  // only the in-window ones count
  assert.equal(releaseVelocity([{ x: 0, t: 0 }, { x: 100, t: 910 }, { x: 130, t: 1000 }], 1000), 30 / 90);
  assert.equal(releaseVelocity([{ x: 0, t: 0 }, { x: 100, t: 960 }, { x: 130, t: 1000 }], 1000, 50), 30 / 40);
  // same timestamp → 0 (no division by zero)
  assert.equal(releaseVelocity([{ x: 0, t: 1000 }, { x: 10, t: 1000 }], 1000), 0);
});

test('swipeOutcome: 25 % of the width commits; a fast flick commits when past the slop and in the same direction', () => {
  const width = 400; const slop = 10;
  assert.equal(swipeOutcome({ dx: -100, vx: 0, width, slop }), 'cancel'); // exactly 25 %
  assert.equal(swipeOutcome({ dx: -101, vx: 0, width, slop }), 'next');
  assert.equal(swipeOutcome({ dx: 101, vx: 0, width, slop }), 'prev');
  assert.equal(swipeOutcome({ dx: -60, vx: -0.05, width, slop }), 'cancel'); // 15 % slow
  assert.equal(swipeOutcome({ dx: -40, vx: -0.67, width, slop }), 'next'); // flick 40 px / 60 ms
  assert.equal(swipeOutcome({ dx: 40, vx: 0.67, width, slop }), 'prev');
  assert.equal(swipeOutcome({ dx: -8, vx: -1.2, width, slop }), 'cancel'); // fast but under the slop
  assert.equal(swipeOutcome({ dx: -40, vx: 0.9, width, slop }), 'cancel'); // flick against dx
  assert.equal(swipeOutcome({ dx: -40, vx: -0.3, width, slop }), 'cancel'); // not > 0.3
  assert.equal(swipeOutcome({ dx: 0, vx: 0, width: 0, slop }), 'cancel');
});

test('rubberBand: 0.35 resistance near 0, sign kept, never past the cap', () => {
  assert.equal(RUBBER_RESISTANCE, 0.35);
  assert.equal(rubberBand(0, 400), 0);
  assert.ok(Math.abs(rubberBand(4, 400) - 4 * 0.35) < 0.1);
  assert.ok(rubberBand(-50, 400) < 0);
  assert.ok(Math.abs(rubberBand(50, 400)) < 50 * 0.35 + 1e-9);
  const cap = 400 * 0.2;
  for (const dx of [100, 400, 2000, 1e6]) {
    assert.ok(rubberBand(dx, 400) < cap, `${dx}`);
    assert.ok(rubberBand(-dx, 400) > -cap, `-${dx}`);
  }
  assert.ok(rubberBand(200, 400) > rubberBand(100, 400)); // monotonic
  assert.ok(Number.isFinite(rubberBand(50, 0)));
});
