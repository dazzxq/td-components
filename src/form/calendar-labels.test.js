import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshCalendarLabels, freshWeekdays, normalizeCalendarLabels } from './calendar-labels.js';

// v0.61.0 (plan F6 / Codex r1 #6): shared defaults hand out FRESH weekday arrays; merges copy them.
describe('calendar-labels', () => {
  it('every call returns new weekday arrays (mutating one never reaches another or the defaults)', () => {
    const a = freshCalendarLabels();
    const b = freshCalendarLabels();
    assert.notEqual(a.weekdaysShort, b.weekdaysShort);
    assert.notEqual(a.weekdaysLong, b.weekdaysLong);
    a.weekdaysShort[0] = 'X';
    a.weekdaysLong.length = 0;
    assert.equal(b.weekdaysShort[0], 'T2');
    assert.equal(freshWeekdays().weekdaysLong.length, 7);
    assert.deepEqual(Object.keys(a).slice(0, 4), ['prevMonth', 'nextMonth', 'prevYear', 'nextYear']);
  });

  it('normalizeCalendarLabels copies valid arrays and falls back (once per key) to fresh defaults', () => {
    const src = freshCalendarLabels();
    const out = normalizeCalendarLabels(src);
    assert.deepEqual(out.weekdaysShort, src.weekdaysShort);
    assert.notEqual(out.weekdaysShort, src.weekdaysShort);
    out.weekdaysShort[0] = 'Y';
    assert.equal(src.weekdaysShort[0], 'T2');
    const bad = [];
    const o2 = normalizeCalendarLabels({ ...src, weekdaysShort: ['a'], weekdaysLong: 'x' }, (k) => bad.push(k));
    assert.deepEqual(bad, ['weekdaysShort', 'weekdaysLong']);
    assert.equal(o2.weekdaysShort.length, 7);
    assert.notEqual(o2.weekdaysShort, freshWeekdays().weekdaysShort);
  });
});
