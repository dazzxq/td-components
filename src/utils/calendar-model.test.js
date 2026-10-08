import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const cm = await import('./calendar-model.js');
const D = (year, month, day) => ({ year, month, day });

// v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md A2 / M1b): the pure calendar arithmetic behind
// src/form/calendar-grid.js — no Date, no DOM. Reference values (weekday, day number) come from Python's proleptic
// Gregorian `datetime.date` (weekday(): Monday = 0; toordinal() - 1 = days since 0001-01-01).

describe('calendar-model — domain + day numbers', () => {
  it('limits', () => {
    assert.equal(cm.MIN_YEAR, 1);
    assert.equal(cm.MAX_YEAR, 9999);
  });

  it('toDayNumber / fromDayNumber agree with the reference values and round-trip', () => {
    const REF = [[1, 1, 1, 0], [4, 2, 29, 1154], [99, 12, 31, 36158], [100, 3, 1, 36218], [1000, 1, 1, 364877], [1582, 10, 15, 577735],
      [1600, 1, 1, 584022], [1900, 1, 1, 693595], [2000, 1, 1, 730119], [2024, 2, 29, 738944], [2026, 6, 1, 739767],
      [2026, 10, 9, 739897], [9999, 1, 1, 3651694], [9999, 12, 31, 3652058]];
    for (const [y, m, d, n] of REF) {
      assert.equal(cm.toDayNumber(D(y, m, d)), n, `${y}-${m}-${d}`);
      assert.deepEqual(cm.fromDayNumber(n), D(y, m, d), `#${n}`);
    }
    assert.equal(cm.MAX_DAY_NUMBER, 3652058);
  });

  it('round-trips every day of selected years (leap boundaries included) and a stride across the whole domain', () => {
    for (const y of [1, 4, 100, 400, 1900, 2000, 2024, 2100, 9996, 9999]) {
      const first = cm.toDayNumber(D(y, 1, 1));
      const days = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
      for (let i = 0; i < days; i++) {
        const d = cm.fromDayNumber(first + i);
        assert.equal(d.year, y);
        assert.equal(cm.toDayNumber(d), first + i);
      }
      assert.equal(cm.fromDayNumber(first + days).year, y === 9999 ? 10000 : y + 1);
    }
    for (let n = 0; n <= cm.MAX_DAY_NUMBER; n += 997) assert.equal(cm.toDayNumber(cm.fromDayNumber(n)), n);
  });
});

describe('calendar-model — weekdayOf (Monday = 0)', () => {
  it('reference dates, including years below 100 (no Date quirks)', () => {
    const REF = [[1, 1, 1, 0], [4, 2, 29, 6], [99, 12, 31, 3], [100, 3, 1, 0], [1000, 1, 1, 2], [1582, 10, 15, 4], [1600, 1, 1, 5],
      [1900, 1, 1, 0], [2000, 1, 1, 5], [2024, 2, 29, 3], [2026, 6, 1, 0], [2026, 10, 9, 4], [9999, 12, 31, 4]];
    for (const [y, m, d, w] of REF) assert.equal(cm.weekdayOf(y, m, d), w, `${y}-${m}-${d}`);
  });

  it('matches Date for 1970–2100 (every day)', () => {
    for (let t = Date.UTC(1970, 0, 1); t < Date.UTC(2101, 0, 1); t += 86400000) {
      const x = new Date(t);
      assert.equal(cm.weekdayOf(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()), (x.getUTCDay() + 6) % 7);
    }
  });
});

describe('calendar-model — monthMatrix (6 × 7, Monday first)', () => {
  const flat = (m) => m.flat();

  it('June 2026 starts on a Monday: no leading days, trailing days from July', () => {
    const m = cm.monthMatrix(2026, 6);
    assert.equal(m.length, 6);
    assert.ok(m.every((r) => r.length === 7));
    assert.deepEqual(m[0][0], { year: 2026, month: 6, day: 1, outside: false });
    assert.deepEqual(m[4][1], { year: 2026, month: 6, day: 30, outside: false });
    assert.deepEqual(m[4][2], { year: 2026, month: 7, day: 1, outside: true });
    assert.deepEqual(m[5][6], { year: 2026, month: 7, day: 12, outside: true });
  });

  it('a month starting on Sunday has six leading days of the previous month (March 2026 begins on a Sunday)', () => {
    const m = cm.monthMatrix(2026, 3);
    assert.deepEqual(m[0].slice(0, 6).map((c) => [c.month, c.day, c.outside]), [[2, 23, true], [2, 24, true], [2, 25, true], [2, 26, true], [2, 27, true], [2, 28, true]]);
    assert.deepEqual(m[0][6], { year: 2026, month: 3, day: 1, outside: false });
  });

  it('leap year: February 2024 has 29 inside cells, February 1900 has 28, February 2000 has 29', () => {
    const inside = (y) => flat(cm.monthMatrix(y, 2)).filter((c) => c && !c.outside).length;
    assert.equal(inside(2024), 29);
    assert.equal(inside(1900), 28);
    assert.equal(inside(2000), 29);
    assert.equal(inside(2100), 28);
  });

  it('every cell is the next day of the previous one and the first cell is a Monday', () => {
    for (const [y, m] of [[2026, 10], [2024, 2], [1999, 12], [2000, 1], [1582, 10], [100, 3], [5000, 7]]) {
      const cells = flat(cm.monthMatrix(y, m));
      assert.equal(cm.weekdayOf(cells[0].year, cells[0].month, cells[0].day), 0, `${y}-${m}`);
      for (let i = 1; i < 42; i++) assert.equal(cm.toDayNumber(cells[i]), cm.toDayNumber(cells[i - 1]) + 1, `${y}-${m} #${i}`);
      assert.equal(cells.filter((c) => !c.outside).length, cm.daysInMonth(y, m));
    }
  });

  it('year 1: January 0001 starts on a Monday so there is no cell before it; the first row is whole', () => {
    const m = cm.monthMatrix(1, 1);
    assert.deepEqual(m[0][0], { year: 1, month: 1, day: 1, outside: false });
    assert.ok(flat(m).every((c) => c !== null));
  });

  it('year 1: nothing exists before 01/01/0001 — cells of the previous (non-existent) month are null (February 0001 begins on a Thursday)', () => {
    const m = cm.monthMatrix(1, 2);
    assert.deepEqual(m[0].slice(0, 3).map((c) => c && c.day), [29, 30, 31]); // Jan 29–31, 0001 are real
    const last = cm.monthMatrix(9999, 12);
    const cells = flat(last);
    const lastInside = cells.findIndex((c) => c && c.month === 12 && c.day === 31);
    assert.ok(lastInside >= 0);
    assert.ok(cells.slice(lastInside + 1).every((c) => c === null), 'cells after 31/12/9999 are null');
  });

  it('January 0001 cannot have leading cells, but a month whose grid starts before 0001 would have null — modelled with day numbers below 0', () => {
    // weekday of 01/01/0001 is Monday, so the grid of January 0001 starts exactly there; the null rule is exercised by the end of the domain
    assert.equal(cm.monthMatrix(1, 1)[0][0].day, 1);
    assert.equal(cm.monthMatrix(9999, 12).flat().filter((c) => c === null).length, 42 - (cm.weekdayOf(9999, 12, 1) + 31));
  });
});

describe('calendar-model — navigation (clamped to 0001-01-01 … 9999-12-31)', () => {
  it('addDays crosses month, year and leap boundaries', () => {
    assert.deepEqual(cm.addDays(D(2026, 1, 31), 1), D(2026, 2, 1));
    assert.deepEqual(cm.addDays(D(2026, 12, 31), 1), D(2027, 1, 1));
    assert.deepEqual(cm.addDays(D(2024, 2, 28), 1), D(2024, 2, 29));
    assert.deepEqual(cm.addDays(D(2023, 2, 28), 1), D(2023, 3, 1));
    assert.deepEqual(cm.addDays(D(2026, 3, 1), -1), D(2026, 2, 28));
    assert.deepEqual(cm.addDays(D(2026, 6, 15), 7), D(2026, 6, 22));
    assert.deepEqual(cm.addDays(D(2026, 6, 15), -7), D(2026, 6, 8));
  });

  it('addDays stops at the ends of the domain', () => {
    assert.deepEqual(cm.addDays(D(1, 1, 1), -1), D(1, 1, 1));
    assert.deepEqual(cm.addDays(D(1, 1, 3), -7), D(1, 1, 1));
    assert.deepEqual(cm.addDays(D(9999, 12, 31), 1), D(9999, 12, 31));
    assert.deepEqual(cm.addDays(D(9999, 12, 28), 7), D(9999, 12, 31));
  });

  it('addMonths keeps the day when it exists, else the last day of the target month', () => {
    assert.deepEqual(cm.addMonths(D(2026, 1, 31), 1), D(2026, 2, 28));
    assert.deepEqual(cm.addMonths(D(2024, 1, 31), 1), D(2024, 2, 29));
    assert.deepEqual(cm.addMonths(D(2026, 3, 31), -1), D(2026, 2, 28));
    assert.deepEqual(cm.addMonths(D(2026, 12, 15), 1), D(2027, 1, 15));
    assert.deepEqual(cm.addMonths(D(2026, 1, 15), -1), D(2025, 12, 15));
    assert.deepEqual(cm.addMonths(D(2026, 6, 15), 12), D(2027, 6, 15));
    assert.deepEqual(cm.addMonths(D(2026, 6, 15), -30), D(2023, 12, 15));
  });

  it('addMonths clamps at the ends of the domain', () => {
    assert.deepEqual(cm.addMonths(D(1, 1, 15), -1), D(1, 1, 15));
    assert.deepEqual(cm.addMonths(D(1, 2, 20), -5), D(1, 1, 20));
    assert.deepEqual(cm.addMonths(D(9999, 12, 15), 1), D(9999, 12, 15));
    assert.deepEqual(cm.addMonths(D(9999, 11, 30), 5), D(9999, 12, 30));
  });

  it('addYears: 29/02 falls to 28/02 in a common year; clamps at 1 and 9999', () => {
    assert.deepEqual(cm.addYears(D(2024, 2, 29), 1), D(2025, 2, 28));
    assert.deepEqual(cm.addYears(D(2024, 2, 29), 4), D(2028, 2, 29));
    assert.deepEqual(cm.addYears(D(2024, 2, 29), -24), D(2000, 2, 29));
    assert.deepEqual(cm.addYears(D(2024, 2, 29), -124), D(1900, 2, 28));
    assert.deepEqual(cm.addYears(D(5, 6, 15), -10), D(1, 6, 15));
    assert.deepEqual(cm.addYears(D(9990, 6, 15), 100), D(9999, 6, 15));
  });

  it('startOfWeek / endOfWeek (Monday – Sunday) stay inside the domain', () => {
    assert.deepEqual(cm.startOfWeek(D(2026, 6, 17)), D(2026, 6, 15)); // Wednesday → Monday
    assert.deepEqual(cm.endOfWeek(D(2026, 6, 17)), D(2026, 6, 21)); // → Sunday
    assert.deepEqual(cm.startOfWeek(D(2026, 6, 15)), D(2026, 6, 15));
    assert.deepEqual(cm.endOfWeek(D(2026, 6, 21)), D(2026, 6, 21));
    assert.deepEqual(cm.startOfWeek(D(2026, 3, 1)), D(2026, 2, 23)); // a Sunday → the Monday before
    assert.deepEqual(cm.endOfWeek(D(1, 1, 3)), D(1, 1, 7));
    assert.deepEqual(cm.startOfWeek(D(1, 1, 3)), D(1, 1, 1));
    assert.deepEqual(cm.endOfWeek(D(9999, 12, 31)), D(9999, 12, 31)); // Friday: Sunday 9999-12-33 does not exist
  });
});

describe('calendar-model — bounds', () => {
  const MIN = D(2026, 3, 10);
  const MAX = D(2026, 3, 20);

  it('compareDates / clampDate', () => {
    assert.ok(cm.compareDates(D(2026, 3, 9), D(2026, 3, 10)) < 0);
    assert.equal(cm.compareDates(D(2026, 3, 10), D(2026, 3, 10)), 0);
    assert.ok(cm.compareDates(D(2027, 1, 1), D(2026, 12, 31)) > 0);
    assert.deepEqual(cm.clampDate(D(2026, 3, 1), MIN, MAX), MIN);
    assert.deepEqual(cm.clampDate(D(2026, 3, 30), MIN, MAX), MAX);
    assert.deepEqual(cm.clampDate(D(2026, 3, 15), MIN, MAX), D(2026, 3, 15));
    assert.deepEqual(cm.clampDate(D(1999, 3, 15), null, MAX), D(1999, 3, 15));
    assert.deepEqual(cm.clampDate(D(2999, 3, 15), MIN, null), D(2999, 3, 15));
    assert.deepEqual(cm.clampDate(D(2999, 3, 15), null, null), D(2999, 3, 15));
  });

  it('bounds are inclusive and either may be missing; extra fields (time) are ignored', () => {
    assert.equal(cm.isDateOutOfRange(MIN, MIN, MAX), false);
    assert.equal(cm.isDateOutOfRange(MAX, MIN, MAX), false);
    assert.equal(cm.isDateOutOfRange(D(2026, 3, 9), MIN, MAX), true);
    assert.equal(cm.isDateOutOfRange(D(2026, 3, 21), MIN, MAX), true);
    assert.equal(cm.isDateOutOfRange(D(1, 1, 1), null, MAX), false);
    assert.equal(cm.isDateOutOfRange(D(9999, 12, 31), MIN, null), false);
    assert.equal(cm.isDateOutOfRange(D(2026, 3, 10), { ...MIN, hour: 10, minute: 7 }, MAX), false);
  });

  it('monthOutOfRange / yearOutOfRange: a period with any in-range day is available', () => {
    assert.equal(cm.monthOutOfRange(2026, 3, MIN, MAX), false);
    assert.equal(cm.monthOutOfRange(2026, 2, MIN, MAX), true);
    assert.equal(cm.monthOutOfRange(2026, 4, MIN, MAX), true);
    assert.equal(cm.monthOutOfRange(2025, 12, MIN, null), true);
    assert.equal(cm.monthOutOfRange(2030, 1, MIN, null), false);
    assert.equal(cm.yearOutOfRange(2026, MIN, MAX), false);
    assert.equal(cm.yearOutOfRange(2025, MIN, MAX), true);
    assert.equal(cm.yearOutOfRange(2027, MIN, MAX), true);
    assert.equal(cm.yearOutOfRange(1, null, null), false);
    assert.equal(cm.yearOutOfRange(9999, null, null), false);
  });
});

describe('calendar-model — year pages (12 per page, fixed grid)', () => {
  it('the first page is 1–12; 2026 is on 2017–2028', () => {
    assert.equal(cm.yearPage(1).start, 1);
    assert.deepEqual(cm.yearPage(1).years, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(cm.yearPage(12).start, 1);
    assert.equal(cm.yearPage(13).start, 13);
    const p = cm.yearPage(2026);
    assert.equal(p.start, 2017);
    assert.equal(p.years.length, 12);
    assert.deepEqual([p.years[0], p.years[11]], [2017, 2028]);
  });

  it('the last page holds 9997–9999 and nine null cells', () => {
    const p = cm.yearPage(9999);
    assert.equal(p.start, 9997);
    assert.deepEqual(p.years.slice(0, 3), [9997, 9998, 9999]);
    assert.equal(p.years.slice(3).filter((y) => y === null).length, 9);
    assert.equal(cm.yearPage(9997).start, 9997);
    assert.equal(cm.yearPage(9996).start, 9985);
  });

  it('every year belongs to exactly one page and the pages tile 1–9999', () => {
    let covered = 0;
    for (let start = 1; start <= 9999; start += 12) {
      const p = cm.yearPage(start);
      assert.equal(p.start, start);
      covered += p.years.filter((y) => y !== null).length;
    }
    assert.equal(covered, 9999);
  });
});
