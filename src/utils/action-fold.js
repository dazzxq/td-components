/**
 * Shared page-action fold policy (plan docs/internal/plans/v0.96.0-action-fold.md §4) — used by `td-selection-bar`
 * (`fold="count"`) and `<td-page-actions>`. Pure: no DOM, no console, no imports (node-tested directly). Internal like
 * `fitActions` (not exported from index.js).
 *
 * Rule (owner 04/11/2026, dwp page-actions + dsuite D5): at most ONE primary (shown last, on the right) + the first 2
 * secondaries; the rest, and every item marked "in menu", go into "…"; a narrow container (< 480px) shows only the
 * primary + "…". Step 2 (measured width, §4.5) is the components' job (`fitActions` over the shown secondaries).
 */

/** px: the narrow threshold (owner Q4: fixed) */
export const NARROW_AT = 480;
/** px: hysteresis half-band around NARROW_AT (enter < 472, leave >= 488) */
export const NARROW_BAND = 8;
/** default count of visible secondaries */
export const VISIBLE_SECONDARIES = 2;

/**
 * @typedef {{ primary?: boolean, inMenu?: boolean, hidden?: boolean }} FoldItem
 */

/**
 * @param {FoldItem[]} items in DOM order
 * @param {{ narrow?: boolean, secondaries?: number, keep?: number }} [opts] `secondaries` default 2; `keep` = index of
 *   the primary that won the previous build (the component moved it to the end of the DOM, so DOM order changed) —
 *   kept while still valid (`primary && !inMenu && !hidden`); -1 / absent / invalid = choose by DOM order.
 * @returns {{ shown: number[], folded: number[], primary: number, demoted: number[] }}
 *   shown — indices shown: secondaries in DOM order, then the primary last · folded — indices in "…", DOM order ·
 *   primary — the winning primary (shown), -1 if none · demoted — extra primaries handled as secondaries
 */
export function planActions(items, opts) {
  const out = { shown: [], folded: [], primary: -1, demoted: [] };
  if (!Array.isArray(items) || !items.length) return out;
  const o = opts && typeof opts === 'object' ? opts : {};
  const narrow = !!o.narrow;
  let max = VISIBLE_SECONDARIES;
  if (o.secondaries !== undefined) {
    const s = Number(o.secondaries);
    if (!Number.isFinite(s)) max = VISIBLE_SECONDARIES;
    else max = s < 0 ? 0 : Math.floor(s);
  }
  const it = (i) => (items[i] && typeof items[i] === 'object' ? items[i] : {});
  const live = (i) => !it(i).hidden;
  const canWin = (i) => live(i) && !!it(i).primary && !it(i).inMenu;

  let winner = -1;
  const keep = o.keep;
  if (Number.isInteger(keep) && keep >= 0 && keep < items.length && canWin(keep)) winner = keep;
  else {
    for (let i = 0; i < items.length; i++) {
      if (canWin(i)) { winner = i; break; }
    }
  }
  out.primary = winner;

  let visible = 0;
  for (let i = 0; i < items.length; i++) {
    if (!live(i) || i === winner) continue;
    const x = it(i);
    if (x.primary && !x.inMenu) out.demoted.push(i);
    if (x.inMenu || narrow || visible >= max) {
      out.folded.push(i);
    } else {
      out.shown.push(i);
      visible++;
    }
  }
  if (winner >= 0) out.shown.push(winner);
  return out;
}

/**
 * Narrow-state hysteresis: enter narrow when width < at − band, leave when width >= at + band; in between, or for a
 * width of 0 / not finite (display:none, hidden tab), keep `wasNarrow`.
 * @param {number} width container width (px)
 * @param {boolean} wasNarrow previous state
 * @param {{ at?: number, band?: number }} [opts]
 * @returns {boolean}
 */
export function narrowState(width, wasNarrow, { at = NARROW_AT, band = NARROW_BAND } = {}) {
  const was = !!wasNarrow;
  if (!Number.isFinite(width) || width <= 0) return was;
  if (width < at - band) return true;
  if (width >= at + band) return false;
  return was;
}
