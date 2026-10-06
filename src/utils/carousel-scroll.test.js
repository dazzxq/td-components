// v0.50.0 (plan docs/internal/plans/v0.50.0-rating-carousel.md C5a) — the ONE place that converts between the carousel's
// logical scroll coordinate `pos` and the DOM (`scrollLeft`, client rects): LTR, RTL standard (negative scrollLeft) and
// the legacy "positive RTL" branch picked by a probe — tested with fake viewports (no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPos, toScrollLeft, slideEdges, maxPosOf, contentBox, scrollMode } from './carousel-scroll.js';

/** A fake viewport: scrollWidth / clientWidth / scrollLeft / clientLeft + a rect. */
const vp = (o) => ({ scrollWidth: 1000, clientWidth: 300, scrollLeft: 0, clientLeft: 0, ...o });

test('maxPosOf: scrollWidth − clientWidth, never negative', () => {
  assert.equal(maxPosOf(vp()), 700);
  assert.equal(maxPosOf(vp({ scrollWidth: 200 })), 0);
});

test('readPos / toScrollLeft — LTR', () => {
  assert.equal(readPos(vp({ scrollLeft: 250 }), 'ltr'), 250);
  assert.equal(toScrollLeft(250, 700, 'ltr'), 250);
});

test('readPos / toScrollLeft — RTL standard (scrollLeft 0 → negative)', () => {
  assert.equal(readPos(vp({ scrollLeft: -250 }), 'rtl'), 250);
  assert.equal(readPos(vp({ scrollLeft: 0 }), 'rtl'), 0);
  assert.equal(toScrollLeft(250, 700, 'rtl'), -250);
  assert.equal(toScrollLeft(0, 700, 'rtl'), 0);
});

test('readPos / toScrollLeft — legacy positive RTL (probe said positive): maxPos − scrollLeft', () => {
  assert.equal(readPos(vp({ scrollLeft: 700 }), 'rtl-positive'), 0);
  assert.equal(readPos(vp({ scrollLeft: 450 }), 'rtl-positive'), 250);
  assert.equal(toScrollLeft(250, 700, 'rtl-positive'), 450);
  assert.equal(toScrollLeft(0, 700, 'rtl-positive'), 700);
});

test('readPos clamps to [0, maxPos] (overscroll / rubber band)', () => {
  assert.equal(readPos(vp({ scrollLeft: -5 }), 'ltr'), 0);
  assert.equal(readPos(vp({ scrollLeft: 760 }), 'ltr'), 700);
  assert.equal(readPos(vp({ scrollLeft: 4 }), 'rtl'), 0);
});

test('contentBox: the border-box rect minus the borders (clientLeft / clientWidth)', () => {
  const v = vp({ clientLeft: 2, clientWidth: 296 });
  assert.deepEqual(contentBox(v, { left: 10, right: 310 }), { left: 12, right: 308 });
});

test('slideEdges — LTR: offsets from the content-box left edge, plus pos', () => {
  const v = { left: 12, right: 308 };
  assert.deepEqual(slideEdges({ left: 12, right: 112 }, v, 0, 'ltr'), { start: 0, end: 100 });
  assert.deepEqual(slideEdges({ left: -88, right: 12 }, v, 200, 'ltr'), { start: 100, end: 200 });
});

test('slideEdges — RTL (both sign conventions): offsets from the content-box RIGHT edge', () => {
  const v = { left: 12, right: 308 };
  for (const mode of ['rtl', 'rtl-positive']) {
    assert.deepEqual(slideEdges({ left: 208, right: 308 }, v, 0, mode), { start: 0, end: 100 }, mode);
    assert.deepEqual(slideEdges({ left: 308, right: 408 }, v, 200, mode), { start: 100, end: 200 }, mode);
  }
});

test('scrollMode: ltr; rtl + probe negative → rtl; positive → rtl-positive', () => {
  assert.equal(scrollMode('ltr', () => true), 'ltr');
  assert.equal(scrollMode('rtl', () => true), 'rtl');
  assert.equal(scrollMode('rtl', () => false), 'rtl-positive');
});
