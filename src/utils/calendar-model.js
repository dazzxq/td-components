/**
 * INTERNAL (not exported from the package): the pure calendar arithmetic behind src/form/calendar-grid.js (plan
 * v0.60.0-calendar-picker A2). No DOM and — on purpose — no `Date`: `new Date(y, m, d)` / `Date.UTC(y, …)` map the years
 * 0–99 to 1900–1999, and the picker's domain is every proleptic-Gregorian date from 0001-01-01 to 9999-12-31. Days are
 * counted from 0001-01-01 (day 0, a Monday), so the weekday is `n % 7` with Monday = 0.
 *
 * A "date" is `{ year, month, day }` (month 1–12). Bounds (`min` / `max`) may carry more fields (hour, minute — the
 * DateTimeParts of src/utils/datetime.js); only the date part is read, and a missing bound is `null`.
 */
import { daysInMonth } from './datetime.js';

export { daysInMonth };

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

const CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // days before the 1st of each month (common year)

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** days from 0001-01-01 to January 1st of `y` */
const daysBeforeYear = (y) => {
  const p = y - 1;
  return p * 365 + Math.floor(p / 4) - Math.floor(p / 100) + Math.floor(p / 400);
};

/**
 * Days since 0001-01-01 (day 0).
 * @param {{ year: number, month: number, day: number }} d
 */
export function toDayNumber(d) {
  return daysBeforeYear(d.year) + CUMULATIVE[d.month - 1] + (d.month > 2 && isLeap(d.year) ? 1 : 0) + d.day - 1;
}

/** The last representable day (9999-12-31). */
export const MAX_DAY_NUMBER = toDayNumber({ year: MAX_YEAR, month: 12, day: 31 });

/**
 * Inverse of toDayNumber. Not clamped: numbers past MAX_DAY_NUMBER give year 10000+ (callers clamp or test it).
 * @param {number} n
 * @returns {{ year: number, month: number, day: number }}
 */
export function fromDayNumber(n) {
  let year = Math.floor(n / 365.2425) + 1;
  while (daysBeforeYear(year) > n) year -= 1;
  while (daysBeforeYear(year + 1) <= n) year += 1;
  let rest = n - daysBeforeYear(year);
  let month = 12;
  while (month > 1 && rest < CUMULATIVE[month - 1] + (month > 2 && isLeap(year) ? 1 : 0)) month -= 1;
  rest -= CUMULATIVE[month - 1] + (month > 2 && isLeap(year) ? 1 : 0);
  return { year, month, day: rest + 1 };
}

/** Weekday, Monday = 0 … Sunday = 6. */
export function weekdayOf(year, month, day) {
  return toDayNumber({ year, month, day }) % 7;
}

/**
 * The 6 × 7 grid of a month (Monday first). A cell is `{ year, month, day, outside }`; a cell that would fall before
 * 0001-01-01 or after 9999-12-31 does not exist → `null`.
 * @returns {Array<Array<{ year: number, month: number, day: number, outside: boolean }|null>>}
 */
export function monthMatrix(year, month) {
  const first = toDayNumber({ year, month, day: 1 });
  const start = first - (first % 7);
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const row = [];
    for (let c = 0; c < 7; c++) {
      const n = start + r * 7 + c;
      if (n < 0 || n > MAX_DAY_NUMBER) {
        row.push(null);
      } else {
        const d = fromDayNumber(n);
        row.push({ ...d, outside: d.month !== month || d.year !== year });
      }
    }
    rows.push(row);
  }
  return rows;
}

const clampN = (n) => Math.min(MAX_DAY_NUMBER, Math.max(0, n));

/** `d` + n days, kept inside 0001-01-01 … 9999-12-31. */
export function addDays(d, n) {
  return fromDayNumber(clampN(toDayNumber(d) + n));
}

/** `d` + n months; the day is kept when it exists, else the last day of the target month (31/01 + 1 → 28/02). */
export function addMonths(d, n) {
  const total = d.year * 12 + (d.month - 1) + n;
  let year = Math.floor(total / 12);
  let month = total - year * 12 + 1;
  if (year < MIN_YEAR) { year = MIN_YEAR; month = 1; }
  if (year > MAX_YEAR) { year = MAX_YEAR; month = 12; }
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

/** `d` + n years; 29/02 falls to 28/02 in a common year. */
export function addYears(d, n) {
  const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, d.year + n));
  return { year, month: d.month, day: Math.min(d.day, daysInMonth(year, d.month)) };
}

/** Monday of the week of `d` (not before 0001-01-01). */
export function startOfWeek(d) {
  const n = toDayNumber(d);
  return fromDayNumber(n - (n % 7));
}

/** Sunday of the week of `d` (not after 9999-12-31). */
export function endOfWeek(d) {
  const n = toDayNumber(d);
  return fromDayNumber(clampN(n - (n % 7) + 6));
}

/** Order two dates (year, month, day): negative when `a` is earlier. */
export function compareDates(a, b) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** True when `d` is before `min` or after `max` (inclusive bounds, either may be null). */
export function isDateOutOfRange(d, min, max) {
  return (!!min && compareDates(d, min) < 0) || (!!max && compareDates(d, max) > 0);
}

/** `d` moved to the nearest bound when outside (`min` wins if the bounds cross). */
export function clampDate(d, min, max) {
  if (max && compareDates(d, max) > 0) d = { year: max.year, month: max.month, day: max.day };
  if (min && compareDates(d, min) < 0) d = { year: min.year, month: min.month, day: min.day };
  return d;
}

/** True when NO day of the month is inside the bounds. */
export function monthOutOfRange(year, month, min, max) {
  return (!!min && (year < min.year || (year === min.year && month < min.month)))
    || (!!max && (year > max.year || (year === max.year && month > max.month)));
}

/** True when NO day of the year is inside the bounds. */
export function yearOutOfRange(year, min, max) {
  return (!!min && year < min.year) || (!!max && year > max.year);
}

/**
 * The page of 12 years that holds `year` (fixed pages: 1–12, 13–24 … 2017–2028 … 9997–10008). Years above 9999 are `null`.
 * @returns {{ start: number, years: Array<number|null> }}
 */
export function yearPage(year) {
  const start = Math.floor((year - 1) / 12) * 12 + 1;
  return { start, years: Array.from({ length: 12 }, (_, i) => (start + i <= MAX_YEAR ? start + i : null)) };
}
