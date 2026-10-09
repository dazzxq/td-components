import { toDayNumber, compareDates, isDateOutOfRange } from './calendar-model.js';

/**
 * INTERNAL (not exported from the package): the pure range-selection state machine of `<td-datetime-range>` (plan
 * v0.61.0 A1). No DOM, no `Date` (the calendar arithmetic of calendar-model.js). Dates are `{ year, month, day }`.
 *
 * State: `{ start: Date|null, end: Date|null, side: 'start'|'end' }` (`side` = the endpoint the next pick edits).
 *
 * mode "date" (one range-aware calendar, alternating picks):
 *   side=start                                  → start=d, end=null, side=end   (always a NEW range)
 *   side=end, no start (tab "Đến" chosen first) → end=d, side stays end
 *   side=end, d < start                         → start=d, end=null, side=end   ('restart', no error)
 *   side=end, maxDays != null && d > start+maxDays-1 → the same restart, `overLimit: true` (the cell is DIMMED, never disabled)
 *   side=end, d >= start (inside the limit)     → end=d, side=start             (a one-day range when d == start)
 * mode "datetime" (two independent endpoints): a pick only sets the date of the active endpoint; no restart, no side change.
 * min / max cells (`disabled`) are ignored.
 */

/** @typedef {{ year: number, month: number, day: number }} CalDate */
/** @typedef {{ start: CalDate|null, end: CalDate|null, side: 'start'|'end' }} RangeState */
/** @typedef {{ mode: 'date'|'datetime', maxDays?: number|null, min?: CalDate|null, max?: CalDate|null }} RangeCtx */

/** @returns {RangeState} */
export function emptyState() {
  return { start: null, end: null, side: 'start' };
}

/** Calendar days of a range, both ends included (29/09 → 05/10 = 7). */
export function rangeDays(a, b) {
  return toDayNumber(b) - toDayNumber(a) + 1;
}

/** Is `d` past `start + maxDays - 1` while the end of a date range is being chosen? (never without `maxDays`). */
export function isOverLimit(state, d, ctx) {
  if (ctx.mode !== 'date' || state.side !== 'end' || !state.start) return false;
  const n = ctx.maxDays;
  if (n == null) return false;
  return rangeDays(state.start, d) > n;
}

/**
 * Apply a pick on the day `d`.
 * @param {RangeState} state
 * @param {CalDate} d
 * @param {RangeCtx} ctx
 * @returns {{ state: RangeState, kind: 'start'|'end'|'restart'|'ignored', overLimit: boolean }}
 */
export function pickDay(state, d, ctx) {
  const copy = (x) => ({ year: x.year, month: x.month, day: x.day });
  if (isDateOutOfRange(d, ctx.min || null, ctx.max || null)) return { state, kind: 'ignored', overLimit: false };
  const day = copy(d);
  if (ctx.mode === 'datetime') {
    const next = { ...state, [state.side]: day };
    return { state: next, kind: state.side, overLimit: false };
  }
  if (state.side === 'start') {
    return { state: { start: day, end: null, side: 'end' }, kind: 'start', overLimit: false };
  }
  if (!state.start) return { state: { start: null, end: day, side: 'end' }, kind: 'end', overLimit: false };
  if (compareDates(d, state.start) < 0) return { state: { start: day, end: null, side: 'end' }, kind: 'restart', overLimit: false };
  if (isOverLimit(state, d, ctx)) return { state: { start: day, end: null, side: 'end' }, kind: 'restart', overLimit: true };
  return { state: { start: state.start, end: day, side: 'start' }, kind: 'end', overLimit: false };
}

/**
 * What a day cell shows.
 * @param {RangeState} state
 * @param {CalDate} d
 * @param {CalDate|null} hover the day under the mouse / the keyboard focus (preview source), or null
 * @param {RangeCtx} ctx
 * @returns {{ role: 'start'|'end'|'single'|'in'|null, preview: 'in'|'end'|null, disabled: boolean, dimmed: boolean }}
 */
export function cellFlags(state, d, hover, ctx) {
  const { start, end } = state;
  const min = ctx.min || null;
  const max = ctx.max || null;
  const disabled = isDateOutOfRange(d, min, max);
  let role = null;
  const isStart = !!start && compareDates(d, start) === 0;
  const isEnd = !!end && compareDates(d, end) === 0;
  if (isStart && isEnd) role = 'single';
  else if (isStart) role = 'start';
  else if (isEnd) role = 'end';
  else if (start && end && compareDates(start, end) <= 0 && compareDates(d, start) > 0 && compareDates(d, end) < 0) role = 'in';
  let preview = null;
  if (hover && state.side === 'end' && start && !isDateOutOfRange(hover, min, max)
      && compareDates(hover, start) >= 0 && !isOverLimit(state, hover, ctx)) {
    if (compareDates(d, hover) === 0 && compareDates(d, start) > 0) preview = 'end';
    else if (compareDates(d, start) > 0 && compareDates(d, hover) < 0) preview = 'in';
  }
  return { role, preview, disabled, dimmed: !disabled && isOverLimit(state, d, ctx) };
}
