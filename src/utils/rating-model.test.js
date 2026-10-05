// v0.50.0 (plan docs/internal/plans/v0.50.0-rating-carousel.md R2 / R3 / R5 / R6) — pure model of <td-rating> and PHP
// td_rating(): value parsing, display rounding, star fills (data-fill 10 % steps + exact %), Vietnamese number format.
// The PHP parity of the same table lives in test/php/td-ssr-rating.test.js (test/ssr/rating.fixtures.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RATING_LABELS, parseValue, parseMax, parseCount, formatValueAttr, displayValue, starFills, formatDecimal,
  formatCount, fillTemplate, ratingModel,
} from './rating-model.js';

test('parseValue: decimal strings (≤ 16 chars) and finite numbers; anything else → null (no rating)', () => {
  assert.equal(parseValue('4.5'), 4.5);
  assert.equal(parseValue('4'), 4);
  assert.equal(parseValue('0'), 0);
  assert.equal(parseValue('012.50'), 12.5);
  for (const bad of ['', ' 4', '4 ', '4.5abc', '-1', '+1', '1e3', '.5', '5.', '4,5', 'NaN', 'Infinity', '12345678901234567', null, undefined, true, {}, NaN, Infinity, -Infinity]) {
    assert.equal(parseValue(bad), null, String(bad));
  }
  assert.equal(parseValue('1234567890123456'), 1234567890123456); // 16 chars: allowed
  assert.equal(parseValue(3.7), 3.7);
  assert.equal(parseValue(-2), 0, 'a negative NUMBER clamps to 0 (a string must be a plain decimal)');
});

test('formatValueAttr: the attribute JS / PHP print for a number (≤ 4 decimals, no trailing zeros, ≥ 0)', () => {
  assert.equal(formatValueAttr(4.5), '4.5');
  assert.equal(formatValueAttr(4), '4');
  assert.equal(formatValueAttr(4.123456), '4.1235');
  assert.equal(formatValueAttr(1e-7), '0');
  assert.equal(formatValueAttr(-3), '0');
  assert.equal(formatValueAttr(0.1 + 0.2), '0.3');
  assert.equal(formatValueAttr(NaN), null);
  assert.equal(parseValue(formatValueAttr(4.123456)), 4.1235);
});

test('parseMax: integer 1–10, default 5; invalid → 5 + invalid flag', () => {
  assert.deepEqual(parseMax(null), { max: 5, invalid: false });
  assert.deepEqual(parseMax(''), { max: 5, invalid: false });
  assert.deepEqual(parseMax('10'), { max: 10, invalid: false });
  assert.deepEqual(parseMax('1'), { max: 1, invalid: false });
  assert.deepEqual(parseMax(7), { max: 7, invalid: false });
  for (const bad of ['0', '11', '5.5', 'x', '-3', 0, 11, 2.5, ' 5']) assert.deepEqual(parseMax(bad), { max: 5, invalid: true }, String(bad));
});

test('parseCount: integer ≥ 0 (digits only, ≤ 15) or null', () => {
  assert.equal(parseCount('123'), '123');
  assert.equal(parseCount('0'), '0');
  assert.equal(parseCount('007'), '7');
  assert.equal(parseCount(1234), '1234');
  for (const bad of ['', '-1', '1.5', 'abc', '1234567890123456', -1, 1.5, NaN, null, undefined, true]) assert.equal(parseCount(bad), null, String(bad));
});

test('displayValue (R2): half rounds to the nearest half star (half up); exact keeps the value', () => {
  const half = (v) => displayValue(v, 'half');
  assert.equal(half(4.25), 4.5);
  assert.equal(half(4.24), 4);
  assert.equal(half(4.74), 4.5);
  assert.equal(half(4.75), 5);
  assert.equal(half(0), 0);
  assert.equal(displayValue(4.37, 'exact'), 4.37);
});

test('starFills (R2 / R5): data-fill in 10 % steps (half → 0 / 50 / 100) + the exact percentage', () => {
  assert.deepEqual(starFills(4.5, 5, 'half').map((s) => s.step), [100, 100, 100, 100, 50]);
  assert.deepEqual(starFills(4.25, 5, 'half').map((s) => s.step), [100, 100, 100, 100, 50]);
  assert.deepEqual(starFills(4.74, 5, 'half').map((s) => s.step), [100, 100, 100, 100, 50]);
  assert.deepEqual(starFills(4.75, 5, 'half').map((s) => s.step), [100, 100, 100, 100, 100]);
  assert.deepEqual(starFills(0, 5, 'half').map((s) => s.step), [0, 0, 0, 0, 0]);
  assert.deepEqual(starFills(5, 5, 'half').map((s) => s.step), [100, 100, 100, 100, 100]);
  const ex = starFills(3.37, 5, 'exact');
  assert.deepEqual(ex.map((s) => s.step), [100, 100, 100, 40, 0]);
  assert.equal(ex[3].exact, '37%');
  assert.equal(ex[0].exact, null, 'a full / empty star has no CSSOM refinement');
  assert.equal(ex[4].exact, null);
  assert.deepEqual(starFills(4.3, 5, 'exact').map((s) => s.step), [100, 100, 100, 100, 30]);
  assert.equal(starFills(4.3, 5, 'exact')[4].exact, '30%');
  assert.deepEqual(starFills(2.04, 3, 'exact').map((s) => s.step), [100, 100, 0]);
  assert.equal(starFills(2.04, 3, 'exact')[2].exact, '4%');
});

test('formatDecimal (R3): one decimal, comma, no ",0"', () => {
  assert.equal(formatDecimal(4), '4');
  assert.equal(formatDecimal(4.26), '4,3');
  assert.equal(formatDecimal(4.25), '4,3');
  assert.equal(formatDecimal(4.04), '4');
  assert.equal(formatDecimal(4.96), '5');
  assert.equal(formatDecimal(0.05), '0,1');
  assert.equal(formatDecimal(0), '0');
  assert.equal(formatDecimal(10), '10');
});

test('formatCount (R3): dot thousands separator from the digit string', () => {
  assert.equal(formatCount('1'), '1');
  assert.equal(formatCount('999'), '999');
  assert.equal(formatCount('1234'), '1.234');
  assert.equal(formatCount('1234567'), '1.234.567');
  assert.equal(formatCount('100000'), '100.000');
});

test('fillTemplate: single pass, unknown placeholders kept, special characters left for the render layer', () => {
  assert.equal(fillTemplate('{value} trên {max} sao', { value: '4,5', max: '5' }), '4,5 trên 5 sao');
  assert.equal(fillTemplate('{value} {x}', { value: '{max}', max: '5' }), '{max} {x}', 'a value is never re-expanded');
  assert.equal(fillTemplate('<b>{value}</b>', { value: '"&' }), '<b>"&</b>');
});

test('ratingModel: label text exact while the stars approximate; none when no value; count only with a value', () => {
  const m = ratingModel({ value: '4.3', max: '5', count: '1234' });
  assert.equal(m.empty, false);
  assert.equal(m.label, '4,3 trên 5 sao');
  assert.equal(m.valueText, '4,3');
  assert.equal(m.countText, '(1.234 đánh giá)');
  assert.deepEqual(m.stars.map((s) => s.step), [100, 100, 100, 100, 50]);
  const none = ratingModel({ value: 'x', count: '3' });
  assert.equal(none.empty, true);
  assert.equal(none.noneText, RATING_LABELS.none);
  assert.equal(none.countText, null);
  const clamp = ratingModel({ value: '9', max: '5' });
  assert.equal(clamp.label, '5 trên 5 sao');
  assert.equal(ratingModel({ value: '0' }).label, '0 trên 5 sao');
  assert.equal(ratingModel({ value: '4', max: '11' }).maxInvalid, true);
  const custom = ratingModel({ value: '4' }, { ...RATING_LABELS, value: '{value}/{max}' });
  assert.equal(custom.label, '4/5');
});
