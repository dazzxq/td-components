// v0.50.0 (plan docs/internal/plans/v0.50.0-rating-carousel.md C5 / C21) — pure model of <td-carousel>: page / slide
// targets from MEASURED geometry (logical `pos` coordinates of C5a), nearest page, prev / next targets, the controls
// layout shared with PHP td_carousel (test/php/td-ssr-carousel.test.js runs the same table through PHP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pageTargets, slideTargets, nearestIndex, nextTarget, prevTarget, firstVisible, visibleRange, targetForSlide,
  controlsLayout, predictedPages, CAROUSEL_LABELS,
} from './carousel-model.js';

const { layout: LAYOUT_TABLE } = JSON.parse(readFileSync(new URL('../../test/ssr/carousel.fixtures.json', import.meta.url), 'utf8'));

/** n equal slides of width w with gap g, starting at `start` (logical content coordinates). */
const strip = (n, w, g = 0, start = 0) => Array.from({ length: n }, (_, i) => ({ start: start + i * (w + g), end: start + i * (w + g) + w }));
const maxOf = (edges, view, padEnd = 0) => Math.max(0, edges[edges.length - 1].end + padEnd - view);

test('page targets: every k-th slide (k = slides fully in view), last page clamped to the end', () => {
  const e = strip(8, 100, 10); // view 320 → k = 3 (3 slides + 2 gaps = 320 fits exactly), maxPos 550
  assert.deepEqual(pageTargets(e, { view: 320, maxPos: maxOf(e, 320) }), [0, 330, 550]);
  const e2 = strip(8, 100, 0); // view 200 → k = 2, 4 pages
  assert.deepEqual(pageTargets(e2, { view: 200, maxPos: 600 }), [0, 200, 400, 600]);
  const e3 = strip(7, 100, 0); // 7 slides k=2 → slides 0, 2, 4, 6 → 600 clamps to 500
  assert.deepEqual(pageTargets(e3, { view: 200, maxPos: 500 }), [0, 200, 400, 500]);
});

test('page targets with peek / uneven widths / slide-size; one page when everything fits; tolerance 1 px', () => {
  // peek: 2.5 slides visible → k = 2, the last page ends flush
  const e = strip(8, 100, 0);
  assert.deepEqual(pageTargets(e, { view: 250, maxPos: 550 }), [0, 200, 400, 550]);
  // uneven widths
  const u = [{ start: 0, end: 150 }, { start: 160, end: 220 }, { start: 230, end: 400 }, { start: 410, end: 500 }];
  assert.deepEqual(pageTargets(u, { view: 230, maxPos: 270 }), [0, 230, 270]);
  // everything fits
  assert.deepEqual(pageTargets(strip(3, 100), { view: 400, maxPos: 0 }), [0]);
  // sub-pixel widths: 3 × 133.33 in 400 → k = 3
  const s = strip(6, 400 / 3, 0);
  assert.deepEqual(pageTargets(s, { view: 400, maxPos: 400 }), [0, 400]);
  // a slide wider than the view → k = 1
  assert.deepEqual(pageTargets(strip(3, 500), { view: 300, maxPos: 1200 }), [0, 500, 1000, 1200]);
});

test('scroll padding: targets are slide starts minus the inline-start padding, clamped to [0, maxPos]', () => {
  const e = strip(6, 100, 10, 16); // gutter 16 before the first slide
  const t = pageTargets(e, { view: 242, pad: 16, padEnd: 16, maxPos: maxOf(e, 242, 16) });
  assert.deepEqual(t, [0, 220, 440]);
  assert.deepEqual(slideTargets(e, { pad: 16, maxPos: maxOf(e, 242, 16) }), [0, 110, 220, 330, 440]);
});

test('slide targets: one per slide, clamped, duplicates (≤ 1 px) dropped', () => {
  const e = strip(5, 100);
  assert.deepEqual(slideTargets(e, { maxPos: 300 }), [0, 100, 200, 300]);
  assert.deepEqual(slideTargets(strip(2, 100), { maxPos: 0 }), [0]);
});

test('nearest / next / prev (1 px tolerance) and both ends', () => {
  const t = [0, 200, 400, 550];
  assert.equal(nearestIndex(t, 0), 0);
  assert.equal(nearestIndex(t, 99), 0);
  assert.equal(nearestIndex(t, 101), 1);
  assert.equal(nearestIndex(t, 549.4), 3);
  assert.equal(nextTarget(t, 0), 200);
  assert.equal(nextTarget(t, 199.5), 400, 'within 1 px counts as being there');
  assert.equal(nextTarget(t, 550), null);
  assert.equal(nextTarget(t, 549.2), null);
  assert.equal(prevTarget(t, 0), null);
  assert.equal(prevTarget(t, 0.8), null);
  assert.equal(prevTarget(t, 400), 200);
  assert.equal(prevTarget(t, 450), 400);
  assert.equal(nextTarget([], 0), null);
});

test('firstVisible / visibleRange / targetForSlide', () => {
  const e = strip(8, 100);
  assert.equal(firstVisible(e, 0), 0);
  assert.equal(firstVisible(e, 200), 2);
  assert.equal(firstVisible(e, 199.5), 2);
  assert.equal(firstVisible(e, 250), 3);
  assert.deepEqual(visibleRange(e, 200, { view: 250 }), [2, 3]);
  assert.deepEqual(visibleRange(e, 550, { view: 250 }), [6, 7]);
  assert.deepEqual(visibleRange(strip(3, 500), 0, { view: 300 }), [0, 0], 'a slide wider than the view still counts as the one shown');
  const pages = [0, 200, 400, 550];
  assert.equal(targetForSlide(pages, e, 3), 200);
  assert.equal(targetForSlide(pages, e, 7), 550);
  assert.equal(targetForSlide(pages, e, 0), 0);
});

test('controlsLayout (C21): the full table — narrow 6 / row, wide inline ≤ 8 else 8 / row, auto ≤ 2 rows', () => {
  for (const [P, dots, narrow, wide] of LAYOUT_TABLE) {
    assert.deepEqual(controlsLayout(P, dots), { hidden: P <= 1, narrow, wide }, `${P} ${dots}`);
  }
  // the plan's examples
  assert.deepEqual(controlsLayout(3, 'auto'), { hidden: false, narrow: 1, wide: 'inline' });
  assert.deepEqual(controlsLayout(8, 'auto'), { hidden: false, narrow: 2, wide: 'inline' });
  assert.deepEqual(controlsLayout(12, 'auto'), { hidden: false, narrow: 2, wide: 2 });
  assert.deepEqual(controlsLayout(13, 'auto'), { hidden: false, narrow: 0, wide: 2 });
  assert.deepEqual(controlsLayout(17, 'auto'), { hidden: false, narrow: 0, wide: 0 });
  assert.deepEqual(controlsLayout(30, 'on'), { hidden: false, narrow: 5, wide: 4 });
  assert.deepEqual(controlsLayout(5, 'off'), { hidden: false, narrow: 0, wide: 0 });
  assert.deepEqual(controlsLayout(1, 'on'), { hidden: true, narrow: 0, wide: 0 });
  assert.deepEqual(controlsLayout(0, 'auto'), { hidden: true, narrow: 0, wide: 0 });
  assert.deepEqual(controlsLayout(4, 'bogus'), controlsLayout(4, 'auto'));
});

test('predictedPages (PHP): max(1, ceil(n / per_view))', () => {
  assert.equal(predictedPages(8, 2), 4);
  assert.equal(predictedPages(7, 2), 4);
  assert.equal(predictedPages(0, 3), 1);
  assert.equal(predictedPages(3, 6), 1);
  assert.equal(predictedPages(5, 1), 5);
});

test('labels: Vietnamese defaults (D7)', () => {
  assert.equal(CAROUSEL_LABELS.roleCarousel, 'băng chuyền');
  assert.equal(CAROUSEL_LABELS.roleSlide, 'mục');
  assert.equal(CAROUSEL_LABELS.slide, '{n} / {total}');
  assert.equal(CAROUSEL_LABELS.prev, 'Mục trước');
  assert.equal(CAROUSEL_LABELS.next, 'Mục tiếp theo');
});
