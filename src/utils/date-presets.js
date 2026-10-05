/**
 * INTERNAL pure helpers of `<td-datetime-range>` (v0.40.0, plan v0.39.0-filters-range QĐ 18–23): range modes, the
 * `required` table, empty sides, preset resolution (local wall clock — never `toISOString()`, the dcms2 time-zone bug),
 * clamping into min / max, matching and the span in days. No DOM; node-tested (date-presets.test.js).
 */
import {
  partsFromDate, parseModeValue, invalidReason, toModeParts, compareModeParts, normalizeMinuteStep, snapMinuteDown,
} from './datetime.js';

/** @typedef {import('./datetime.js').DateTimeParts} DateTimeParts */
/** @typedef {'date'|'datetime'} RangeMode */
/** @typedef {'start'|'end'} RangeSide */

/** Modes of the range (month / year ranges are out of scope — plan QĐ 18). */
export const RANGE_MODES = ['date', 'datetime'];

/**
 * `mode` attribute → a range mode. Missing → `date` (the default); anything else (incl. `month` / `year`) → `date` +
 * `unknown: true` (the element warns once).
 * @param {unknown} v
 * @returns {{ mode: RangeMode, unknown: boolean }}
 */
export function normalizeRangeMode(v) {
  if (v == null || v === '') return { mode: 'date', unknown: false };
  return RANGE_MODES.includes(/** @type {string} */ (v)) ? { mode: /** @type {RangeMode} */ (v), unknown: false } : { mode: 'date', unknown: true };
}

/**
 * The `required` table (review R2-5) — ONE function for validity, render, PHP parity and the SSR gate:
 * no attribute → []; '' / 'required' / 'true' / 'both' → both sides; 'start' → [start]; 'end' → [end]; any other value →
 * both (the safer reading) + `unknown: true` (the element warns once). Compared trimmed and lower-cased.
 * @param {string|null|undefined} attr
 * @returns {{ parts: RangeSide[], unknown: boolean }}
 */
export function requiredParts(attr) {
  if (attr == null) return { parts: [], unknown: false };
  const v = String(attr).trim().toLowerCase();
  if (v === 'start') return { parts: ['start'], unknown: false };
  if (v === 'end') return { parts: ['end'], unknown: false };
  const known = v === '' || v === 'required' || v === 'true' || v === 'both';
  return { parts: ['start', 'end'], unknown: !known };
}

/** Last minute slot of a day for a minute step: step 1 → 59, step 15 → 45 (plan QĐ 22). @param {unknown} step */
export function lastMinute(step) {
  const s = normalizeMinuteStep(step);
  return 60 - s;
}

/**
 * Pending parts of an EMPTY side: no date components; the time a side gets when it is filled by hand — start 00:00,
 * end 23:59 (step 1) / the last step slot.
 * @param {RangeSide} side
 * @param {unknown} step
 * @returns {DateTimeParts}
 */
export function emptyParts(side, step) {
  return /** @type {DateTimeParts} */ ({
    day: NaN, month: NaN, year: NaN, hour: side === 'start' ? 0 : 23, minute: side === 'start' ? 0 : lastMinute(step),
  });
}

/** No date component is an integer (all three date fields empty) → the side is empty. @param {object|null} p */
export function isEmptyParts(p) {
  return !p || (!Number.isInteger(p.day) && !Number.isInteger(p.month) && !Number.isInteger(p.year));
}

/**
 * A preset end point → valid parts of `mode`: a valid `Date` (local wall clock; datetime: minute snapped DOWN to the
 * step) or a string in the mode's display / ISO format. Anything else / impossible → null.
 * @param {unknown} v
 * @param {RangeMode} mode
 * @param {unknown} step
 * @returns {DateTimeParts|null}
 */
export function toRangeParts(v, mode, step) {
  let p = null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    p = partsFromDate(v);
  } else if (typeof v === 'string') {
    p = parseModeValue(v, mode);
  }
  if (!p || invalidReason(p)) return null;
  const out = toModeParts(p, mode);
  if (mode === 'datetime') out.minute = snapMinuteDown(out.minute, step);
  return out;
}

const DAY = (now, offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 0, 0, 0, 0);
const END = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0);

/**
 * The default presets (plan QĐ 22, "có tính hôm nay" like dcms2): Hôm nay · 7 ngày qua (today − 6 … today) · 30 ngày
 * qua (− 29 … today) · Tháng này (day 1 … today). Start 00:00, end 23:59 (snapped to the minute step by
 * toRangeParts → 23:45 for step 15). A fresh array each call (sites copy / extend it).
 * @returns {Array<{ id: string, label: string, resolve: (now: Date) => { start: Date, end: Date } }>}
 */
export function defaultPresets() {
  return [
    { id: 'today', label: 'Hôm nay', resolve: (now) => ({ start: DAY(now, 0), end: END(now) }) },
    { id: 'last7', label: '7 ngày qua', resolve: (now) => ({ start: DAY(now, -6), end: END(now) }) },
    { id: 'last30', label: '30 ngày qua', resolve: (now) => ({ start: DAY(now, -29), end: END(now) }) },
    { id: 'thisMonth', label: 'Tháng này', resolve: (now) => ({ start: DAY(now, 1 - now.getDate()), end: END(now) }) },
  ];
}

/**
 * Resolve one preset at `now`: call `resolve(now, { mode })`, convert both ends (toRangeParts), clamp into min / max at
 * the mode's granularity. `ok: false` → the preset is disabled: `threw` (resolve threw), `invalid` (an end is not a
 * valid Date / string, or start > end), `empty` (nothing of the range is inside min–max).
 * @param {{ resolve?: Function }} preset
 * @param {Date} now
 * @param {{ mode: RangeMode, minuteStep?: unknown, min?: DateTimeParts|null, max?: DateTimeParts|null }} ctx
 * @returns {{ ok: true, start: DateTimeParts, end: DateTimeParts } | { ok: false, reason: 'threw'|'invalid'|'empty', error?: unknown }}
 */
export function resolvePreset(preset, now, ctx) {
  const { mode, minuteStep, min = null, max = null } = ctx;
  let r;
  try {
    if (!preset || typeof preset.resolve !== 'function') return { ok: false, reason: 'invalid' };
    r = preset.resolve(new Date(now.getTime()), { mode });
  } catch (error) {
    return { ok: false, reason: 'threw', error };
  }
  let start = r && typeof r === 'object' ? toRangeParts(r.start, mode, minuteStep) : null;
  let end = r && typeof r === 'object' ? toRangeParts(r.end, mode, minuteStep) : null;
  if (!start || !end || compareModeParts(start, end, mode) > 0) return { ok: false, reason: 'invalid' };
  if (min && compareModeParts(start, min, mode) < 0) start = toModeParts(min, mode);
  if (max && compareModeParts(end, max, mode) > 0) end = toModeParts(max, mode);
  if (compareModeParts(start, end, mode) > 0) return { ok: false, reason: 'empty' };
  return { ok: true, start, end };
}

/**
 * Do two ranges hold the same moments at the mode's granularity? Both ends must be valid parts.
 * @param {{ start: object|null, end: object|null }} a
 * @param {{ start: object|null, end: object|null }} b
 * @param {RangeMode} mode
 */
export function sameRange(a, b, mode) {
  const ok = (p) => p && !isEmptyParts(p) && !invalidReason(p);
  if (!ok(a.start) || !ok(a.end) || !ok(b.start) || !ok(b.end)) return false;
  return compareModeParts(a.start, b.start, mode) === 0 && compareModeParts(a.end, b.end, mode) === 0;
}

/**
 * Calendar days covered by a range, both ends included (time of day ignored): 29/09 → 05/10 = 7.
 * @param {DateTimeParts} start
 * @param {DateTimeParts} end
 */
export function spanDays(start, end) {
  const utc = (p) => { // setUTCFullYear: years 0–99 stay literal

    const t = new Date(Date.UTC(2000, 0, 1));
    t.setUTCFullYear(p.year, p.month - 1, p.day);
    return t.getTime();
  };
  return Math.round((utc(end) - utc(start)) / 86400000) + 1;
}
