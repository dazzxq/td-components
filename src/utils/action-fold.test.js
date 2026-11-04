// v0.96.0 (plan docs/internal/plans/v0.96.0-action-fold.md §4 / §10.1) — the shared fold policy of td-selection-bar
// (fold="count") and td-page-actions: planActions (1 primary last + 2 secondaries, rest in "…", narrow → primary only)
// and narrowState (480px threshold with an 8px hysteresis band). Pure, no DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planActions, narrowState, NARROW_AT, NARROW_BAND, VISIBLE_SECONDARIES } from './action-fold.js';

const S = () => ({});
const P = () => ({ primary: true });
const M = () => ({ inMenu: true });
const H = () => ({ hidden: true });

describe('planActions', () => {
  it('defaults: 2 secondaries shown, the rest folded, the primary last', () => {
    const r = planActions([S(), S(), S(), S(), P()]);
    assert.deepEqual(r, { shown: [0, 1, 4], folded: [2, 3], primary: 4, demoted: [] });
    assert.equal(VISIBLE_SECONDARIES, 2);
  });

  it('a primary first in the DOM is still shown LAST', () => {
    const r = planActions([P(), S(), S(), S()]);
    assert.deepEqual(r.shown, [1, 2, 0]);
    assert.deepEqual(r.folded, [3]);
    assert.equal(r.primary, 0);
  });

  it('0 primary: primary = -1; 2 secondaries shown, rest folded', () => {
    const r = planActions([S(), S(), S()]);
    assert.deepEqual(r, { shown: [0, 1], folded: [2], primary: -1, demoted: [] });
  });

  it('0 primary + narrow: nothing shown, everything in "…"', () => {
    const r = planActions([S(), S(), S()], { narrow: true });
    assert.deepEqual(r, { shown: [], folded: [0, 1, 2], primary: -1, demoted: [] });
  });

  it('narrow: only the primary shown, every secondary folded (DOM order)', () => {
    const r = planActions([S(), P(), S(), M()], { narrow: true });
    assert.deepEqual(r, { shown: [1], folded: [0, 2, 3], primary: 1, demoted: [] });
  });

  it('> 1 primary: the first wins, the others are demoted and laid out as secondaries', () => {
    const r = planActions([S(), P(), P(), S(), P()]);
    assert.equal(r.primary, 1);
    assert.deepEqual(r.demoted, [2, 4]);
    assert.deepEqual(r.shown, [0, 2, 1]);
    assert.deepEqual(r.folded, [3, 4]);
  });

  it('keep: the previous winner (moved to the end of the DOM) keeps winning while valid', () => {
    // build 1: A (index 0) won and was moved last → build 2 sees [B, s, A]
    const r = planActions([P(), S(), P()], { keep: 2 });
    assert.equal(r.primary, 2);
    assert.deepEqual(r.demoted, [0]);
    assert.deepEqual(r.shown, [0, 1, 2]);
  });

  it('keep no longer valid (hidden / not primary / inMenu / out of range / not an integer) → choose by DOM', () => {
    assert.equal(planActions([P(), S(), { primary: true, hidden: true }], { keep: 2 }).primary, 0);
    assert.equal(planActions([P(), S(), S()], { keep: 2 }).primary, 0);
    assert.equal(planActions([P(), S(), { primary: true, inMenu: true }], { keep: 2 }).primary, 0);
    assert.equal(planActions([P(), S()], { keep: 9 }).primary, 0);
    assert.equal(planActions([P(), S()], { keep: -1 }).primary, 0);
    assert.equal(planActions([S(), P()], { keep: 0.5 }).primary, 1);
  });

  it('inMenu items always fold (even with room); inMenu does not count against the 2 visible', () => {
    const r = planActions([M(), S(), M(), S(), P()]);
    assert.deepEqual(r.shown, [1, 3, 4]);
    assert.deepEqual(r.folded, [0, 2]);
  });

  it('inMenu on the primary: folded, no primary shown, no other primary picked instead', () => {
    const r = planActions([S(), { primary: true, inMenu: true }]);
    assert.deepEqual(r, { shown: [0], folded: [1], primary: -1, demoted: [] });
  });

  it('hidden items are ignored everywhere (not shown, not folded)', () => {
    const r = planActions([H(), S(), H(), S(), S(), { primary: true, hidden: true }, P()]);
    assert.deepEqual(r.shown, [1, 3, 6]);
    assert.deepEqual(r.folded, [4]);
    assert.equal(r.primary, 6);
  });

  it('all hidden → nothing shown, nothing folded (no "…")', () => {
    assert.deepEqual(planActions([H(), H()]), { shown: [], folded: [], primary: -1, demoted: [] });
  });

  it('a single folded item still folds (owner Q3: keep "…" with one item)', () => {
    assert.deepEqual(planActions([S(), S(), S()]).folded, [2]);
  });

  it('secondaries option: negative → 0, not finite → 2, fractional → floor', () => {
    assert.deepEqual(planActions([S(), S(), P()], { secondaries: -3 }).shown, [2]);
    assert.deepEqual(planActions([S(), S(), S(), P()], { secondaries: NaN }).shown, [0, 1, 3]);
    assert.deepEqual(planActions([S(), S(), S(), P()], { secondaries: Infinity }).shown, [0, 1, 3]);
    assert.deepEqual(planActions([S(), S(), S()], { secondaries: 1.9 }).shown, [0]);
    assert.deepEqual(planActions([S(), S(), S()], { secondaries: 3 }).shown, [0, 1, 2]);
  });

  it('empty / not an array / junk entries', () => {
    const empty = { shown: [], folded: [], primary: -1, demoted: [] };
    assert.deepEqual(planActions([]), empty);
    assert.deepEqual(planActions(null), empty);
    assert.deepEqual(planActions('abc'), empty);
    assert.deepEqual(planActions([null, 3, P()]), { shown: [0, 1, 2], folded: [], primary: 2, demoted: [] });
  });
});

describe('narrowState', () => {
  it('threshold 480 with an 8px band: enter < 472, leave >= 488', () => {
    assert.equal(NARROW_AT, 480);
    assert.equal(NARROW_BAND, 8);
    assert.equal(narrowState(471, false), true);
    assert.equal(narrowState(472, false), false);
    assert.equal(narrowState(487, true), true);
    assert.equal(narrowState(488, true), false);
  });

  it('inside the band keeps the previous state', () => {
    for (const w of [472, 476, 480, 484, 487]) {
      assert.equal(narrowState(w, true), true, `${w} stays narrow`);
      assert.equal(narrowState(w, false), false, `${w} stays wide`);
    }
  });

  it('width 0 / NaN / Infinity / negative keeps the previous state', () => {
    for (const w of [0, NaN, Infinity, -5, undefined]) {
      assert.equal(narrowState(w, true), true);
      assert.equal(narrowState(w, false), false);
    }
  });

  it('dragging around the threshold does not flip-flop', () => {
    let n = false;
    const seq = [];
    for (const w of [600, 479, 473, 471, 478, 486, 487, 488, 475, 471]) {
      n = narrowState(w, n);
      seq.push(n);
    }
    assert.deepEqual(seq, [false, false, false, true, true, true, true, false, false, true]);
  });

  it('custom at / band', () => {
    assert.equal(narrowState(95, false, { at: 100, band: 4 }), true);
    assert.equal(narrowState(104, true, { at: 100, band: 4 }), false);
  });
});
