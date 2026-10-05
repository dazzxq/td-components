// v0.40.0 (plan v0.39.0-filters-range QĐ 18–23, M2) — pure helpers of <td-datetime-range>.
// Runs in Vietnam time (UTC+7, no DST): the dcms2 bug was `toISOString()` turning 00:00–07:00 local into "yesterday".
process.env.TZ = 'Asia/Ho_Chi_Minh';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRangeMode, requiredParts, lastMinute, emptyParts, isEmptyParts, toRangeParts, defaultPresets, resolvePreset,
  sameRange, spanDays,
} from './date-presets.js';
import { parseBound } from './datetime.js';

const P = (day, month, year, hour = 0, minute = 0) => ({ day, month, year, hour, minute });
const preset = (id) => defaultPresets().find((p) => p.id === id);
const run = (id, now, ctx = {}) => resolvePreset(preset(id), now, { mode: 'date', minuteStep: 1, ...ctx });

describe('normalizeRangeMode', () => {
  it('date (default) | datetime; month / year / junk → date + unknown', () => {
    assert.deepEqual(normalizeRangeMode(null), { mode: 'date', unknown: false });
    assert.deepEqual(normalizeRangeMode(''), { mode: 'date', unknown: false });
    assert.deepEqual(normalizeRangeMode('date'), { mode: 'date', unknown: false });
    assert.deepEqual(normalizeRangeMode('datetime'), { mode: 'datetime', unknown: false });
    for (const v of ['month', 'year', 'DATE', 'x']) assert.deepEqual(normalizeRangeMode(v), { mode: 'date', unknown: true }, v);
  });
});

describe('requiredParts (review R2-5 table)', () => {
  const T = [
    [null, [], false], [undefined, [], false],
    ['', ['start', 'end'], false], ['required', ['start', 'end'], false], ['true', ['start', 'end'], false],
    ['both', ['start', 'end'], false], [' Both ', ['start', 'end'], false],
    ['start', ['start'], false], ['END', ['end'], false],
    ['false', ['start', 'end'], true], ['startend', ['start', 'end'], true], ['0', ['start', 'end'], true],
  ];
  for (const [attr, parts, unknown] of T) {
    it(`${JSON.stringify(attr)} → ${JSON.stringify(parts)}${unknown ? ' + warning' : ''}`, () => {
      assert.deepEqual(requiredParts(attr), { parts, unknown });
    });
  }
});

describe('empty sides', () => {
  it('lastMinute: step 1 → 59, 15 → 45, 30 → 30, invalid → 59', () => {
    assert.equal(lastMinute(1), 59);
    assert.equal(lastMinute(15), 45);
    assert.equal(lastMinute('30'), 30);
    assert.equal(lastMinute(7), 59);
  });
  it('emptyParts: start 00:00, end 23:59 / last step; isEmptyParts', () => {
    const s = emptyParts('start', 1);
    const e = emptyParts('end', 15);
    assert.equal(s.hour, 0); assert.equal(s.minute, 0);
    assert.equal(e.hour, 23); assert.equal(e.minute, 45);
    assert.ok(isEmptyParts(s) && isEmptyParts(e) && isEmptyParts(null));
    assert.ok(!isEmptyParts({ ...s, day: 3 }));
  });
});

describe('toRangeParts', () => {
  it('Date → local parts (date drops the time; datetime snaps the minute down)', () => {
    const d = new Date(2026, 9, 5, 23, 59);
    assert.deepEqual(toRangeParts(d, 'date', 1), P(5, 10, 2026));
    assert.deepEqual(toRangeParts(d, 'datetime', 15), P(5, 10, 2026, 23, 45));
  });
  it('strings in the display / ISO format of the mode; impossible / junk / invalid Date → null', () => {
    assert.deepEqual(toRangeParts('29/02/2028', 'date', 1), P(29, 2, 2028));
    assert.deepEqual(toRangeParts('2026-10-05', 'date', 1), P(5, 10, 2026));
    assert.deepEqual(toRangeParts('2026-10-05T08:07', 'datetime', 5), P(5, 10, 2026, 8, 5));
    assert.equal(toRangeParts('29/02/2026', 'date', 1), null);
    assert.equal(toRangeParts('hôm nay', 'date', 1), null);
    assert.equal(toRangeParts(new Date('x'), 'date', 1), null);
    assert.equal(toRangeParts(12345, 'date', 1), null);
  });
});

describe('default presets (local time, today included)', () => {
  it('ids + Vietnamese labels, a fresh array each call', () => {
    assert.deepEqual(defaultPresets().map((p) => [p.id, p.label]),
      [['today', 'Hôm nay'], ['last7', '7 ngày qua'], ['last30', '30 ngày qua'], ['thisMonth', 'Tháng này']]);
    assert.notEqual(defaultPresets(), defaultPresets());
  });
  it('00:30 in Vietnam is still today (never yesterday — the dcms2 toISOString bug)', () => {
    const now = new Date(2026, 9, 5, 0, 30);
    assert.deepEqual(run('today', now), { ok: true, start: P(5, 10, 2026), end: P(5, 10, 2026) });
    assert.deepEqual(run('last7', now), { ok: true, start: P(29, 9, 2026), end: P(5, 10, 2026) });
  });
  it('30 ngày qua crosses a month; Tháng này on 31/12 = 01/12 … 31/12; on the 1st = that day', () => {
    assert.deepEqual(run('last30', new Date(2026, 9, 5, 12)), { ok: true, start: P(6, 9, 2026), end: P(5, 10, 2026) });
    assert.deepEqual(run('thisMonth', new Date(2026, 11, 31, 18)), { ok: true, start: P(1, 12, 2026), end: P(31, 12, 2026) });
    assert.deepEqual(run('thisMonth', new Date(2026, 0, 1, 9)), { ok: true, start: P(1, 1, 2026), end: P(1, 1, 2026) });
  });
  it('29/02 of a leap year; 7 ngày qua from 01/03 → 24/02 (leap) / 23/02 (common)', () => {
    assert.deepEqual(run('today', new Date(2028, 1, 29, 10)), { ok: true, start: P(29, 2, 2028), end: P(29, 2, 2028) });
    assert.deepEqual(run('last7', new Date(2028, 2, 1)).start, P(24, 2, 2028));
    assert.deepEqual(run('last7', new Date(2026, 2, 1)).start, P(23, 2, 2026));
  });
  it('datetime: start 00:00, end 23:59 (step 1) / the last step slot (step 15 → 23:45)', () => {
    const now = new Date(2026, 9, 5, 14, 3);
    assert.deepEqual(run('today', now, { mode: 'datetime' }), { ok: true, start: P(5, 10, 2026, 0, 0), end: P(5, 10, 2026, 23, 59) });
    assert.deepEqual(run('today', now, { mode: 'datetime', minuteStep: 15 }).end, P(5, 10, 2026, 23, 45));
  });
});

describe('resolvePreset — clamp, invalid, throw', () => {
  const now = new Date(2026, 9, 5, 9);
  it('outside min / max → clamped at the mode granularity', () => {
    const min = parseBound('01/10/2026', 'min');
    const max = parseBound('04/10/2026', 'max');
    assert.deepEqual(run('last7', now, { min, max }), { ok: true, start: P(1, 10, 2026), end: P(4, 10, 2026) });
    // datetime: a date-only max means 23:59 → the 23:59 end is kept
    const dt = run('today', now, { mode: 'datetime', max: parseBound('05/10/2026', 'max') });
    assert.deepEqual(dt.end, P(5, 10, 2026, 23, 59));
  });
  it('nothing inside min–max → empty (the preset is disabled)', () => {
    assert.deepEqual(run('today', now, { max: parseBound('01/01/2026', 'max') }), { ok: false, reason: 'empty' });
  });
  it('resolve throws → threw; junk / reversed → invalid; strings accepted', () => {
    const r = resolvePreset({ resolve() { throw new Error('boom'); } }, now, { mode: 'date' });
    assert.equal(r.ok, false); assert.equal(r.reason, 'threw');
    assert.deepEqual(resolvePreset({ resolve: () => ({ start: 'x', end: now }) }, now, { mode: 'date' }), { ok: false, reason: 'invalid' });
    assert.deepEqual(resolvePreset({ resolve: () => ({ start: now, end: new Date(2026, 0, 1) }) }, now, { mode: 'date' }), { ok: false, reason: 'invalid' });
    assert.deepEqual(resolvePreset({ resolve: () => null }, now, { mode: 'date' }), { ok: false, reason: 'invalid' });
    assert.deepEqual(resolvePreset({}, now, { mode: 'date' }), { ok: false, reason: 'invalid' });
    assert.deepEqual(resolvePreset({ resolve: () => ({ start: '2026-01-01', end: '31/01/2026' }) }, now, { mode: 'date' }),
      { ok: true, start: P(1, 1, 2026), end: P(31, 1, 2026) });
  });
  it('resolve gets a copy of now + { mode } (mutating it changes nothing)', () => {
    let seen = null;
    const r = resolvePreset({ resolve: (d, ctx) => { seen = ctx; d.setFullYear(1999); return { start: d, end: d }; } }, now, { mode: 'datetime' });
    assert.deepEqual(seen, { mode: 'datetime' });
    assert.equal(now.getFullYear(), 2026);
    assert.equal(r.start.year, 1999);
  });
});

describe('sameRange / spanDays', () => {
  it('compares at the mode granularity; empty / invalid ends never match', () => {
    const a = { start: P(1, 10, 2026, 0, 0), end: P(5, 10, 2026, 23, 59) };
    const b = { start: P(1, 10, 2026, 8, 0), end: P(5, 10, 2026, 0, 0) };
    assert.equal(sameRange(a, b, 'date'), true);
    assert.equal(sameRange(a, b, 'datetime'), false);
    assert.equal(sameRange(a, { start: emptyParts('start', 1), end: a.end }, 'date'), false);
    assert.equal(sameRange(a, { start: P(31, 2, 2026), end: a.end }, 'date'), false);
  });
  it('days inclusive across months / leap years', () => {
    assert.equal(spanDays(P(29, 9, 2026), P(5, 10, 2026)), 7);
    assert.equal(spanDays(P(5, 10, 2026, 23, 0), P(5, 10, 2026, 1, 0)), 1);
    assert.equal(spanDays(P(1, 1, 2028), P(31, 12, 2028)), 366);
    assert.equal(spanDays(P(28, 2, 2026), P(1, 3, 2026)), 2);
  });
});
