// v0.45.0 (plan v0.45.0-steps-timeline QĐ T4, M1) — isTimeZone / zonedParts / dayKey in src/utils/datetime.js: calendar
// parts of an INSTANT in an explicit IANA zone (never the machine's zone: CI runs in UTC, dev machines in
// Asia/Ho_Chi_Minh — every case names its zone).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isTimeZone, zonedParts, dayKey } from './datetime.js';

describe('datetime — isTimeZone', () => {
  test('IANA names → true', () => {
    for (const n of ['Asia/Ho_Chi_Minh', 'UTC', 'Europe/Berlin', 'America/Argentina/Buenos_Aires', 'Etc/GMT+7']) {
      assert.equal(isTimeZone(n), true, n);
    }
  });
  test('offsets, abbreviations unknown to ICU, empty, non-strings, junk → false', () => {
    for (const n of ['+07:00', '-0500', 'ICT', '', ' ', 'Mars/Base', 'Asia/Ho Chi Minh', null, undefined, 7, ['UTC'], {}, 'x'.repeat(65)]) {
      assert.equal(isTimeZone(n), false, JSON.stringify(n));
    }
  });
});

describe('datetime — zonedParts / dayKey', () => {
  test('2026-10-04T17:30Z is 05/10 00:30 in Asia/Ho_Chi_Minh, 04/10 17:30 in UTC (the dcms2 UTC-grouping bug)', () => {
    const t = Date.parse('2026-10-04T17:30:00Z');
    assert.deepEqual(zonedParts(t, 'Asia/Ho_Chi_Minh'), { year: 2026, month: 10, day: 5, hour: 0, minute: 30, weekday: 1 });
    assert.deepEqual(zonedParts(new Date(t), 'UTC'), { year: 2026, month: 10, day: 4, hour: 17, minute: 30, weekday: 0 });
    assert.equal(dayKey(t, 'Asia/Ho_Chi_Minh'), '2026-10-05');
    assert.equal(dayKey(t, 'UTC'), '2026-10-04');
  });
  test('DST: Europe/Berlin 2026-03-29 (02:00 → 03:00) — day and hour right on both sides', () => {
    assert.equal(dayKey(Date.parse('2026-03-28T23:30:00Z'), 'Europe/Berlin'), '2026-03-29'); // 00:30 CET
    assert.equal(zonedParts(Date.parse('2026-03-29T00:59:00Z'), 'Europe/Berlin').hour, 1);
    assert.equal(zonedParts(Date.parse('2026-03-29T01:00:00Z'), 'Europe/Berlin').hour, 3); // CEST
    assert.equal(dayKey(Date.parse('2026-03-29T21:59:00Z'), 'Europe/Berlin'), '2026-03-29');
    assert.equal(dayKey(Date.parse('2026-03-29T22:00:00Z'), 'Europe/Berlin'), '2026-03-30');
  });
  test('midnight is hour 0 (never 24); year end; 29/02', () => {
    assert.equal(zonedParts(Date.parse('2026-10-04T17:00:00Z'), 'Asia/Ho_Chi_Minh').hour, 0);
    assert.equal(dayKey(Date.parse('2026-12-31T17:00:00Z'), 'Asia/Ho_Chi_Minh'), '2027-01-01');
    assert.equal(dayKey(Date.parse('2028-02-28T17:00:00Z'), 'Asia/Ho_Chi_Minh'), '2028-02-29');
  });
});
