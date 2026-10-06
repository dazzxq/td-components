/**
 * v0.53.1 (plan docs/internal/plans/v0.53.1-segmented-layout.md QĐ 1) — the layout levels of
 * `<td-choice-group variant="segmented">`: ONE decision for the whole rail (never a mix of inline and stacked segments).
 * Pure (no DOM): the component measures, this decides; the browser tests and the responsive gate use the same function.
 *
 *   frame   = (n − 1) × gap + 2 × pad
 *   equal   : n × max(inlineᵢ) + frame ≤ avail      (equal segments, icon + label side by side)
 *   fit     : Σ inlineᵢ        + frame ≤ avail      (side by side, content + an equal share of the rest)
 *   minRail = Σ minᵢ           + frame              stacked when ≤ avail, else stacked + overflow (the rail scrolls itself)
 *   minᵢ    = max(touchMin, 2 × px + max(icon, label min-content))
 *
 * Moving to a MORE inline level (or out of the overflow) needs `hysteresis` px of slack, so a width hovering around a
 * threshold never flips.
 *
 * @module utils/segmented-layout
 */

export const HYSTERESIS = 4;

const LEVELS = ['equal', 'fit', 'stacked'];
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const sum = (a) => a.reduce((s, v) => s + num(v), 0);

/**
 * The minimum width of one segment (the CSS `min-width: var(--td-touch-min)` covers the whole border-box segment).
 * @param {{ touchMin?: number, px: number, icon: number, label: number }} o px = ONE side's inline padding
 */
export function minWidth({ touchMin = 0, px, icon, label }) {
  return Math.max(num(touchMin), 2 * num(px) + Math.max(num(icon), num(label)));
}

/** @param {{ inline: number[], min: number[], gap: number, pad: number }} o */
export function railNeeds({ inline, min, gap, pad }) {
  const n = inline.length;
  const frame = Math.max(0, n - 1) * num(gap) + 2 * num(pad);
  return {
    equal: n * Math.max(0, ...inline.map(num)) + frame,
    fit: sum(inline) + frame,
    minRail: sum(min) + frame,
  };
}

/**
 * @param {{ avail: number, inline: number[], min: number[], gap: number, pad: number,
 *   prev?: { layout: string, overflow: boolean } | null, hysteresis?: number }} o
 * @returns {{ layout: 'equal' | 'fit' | 'stacked', overflow: boolean }}
 */
export function decideLayout({ avail, inline, min, gap, pad, prev = null, hysteresis = HYSTERESIS }) {
  if (!inline.length) return { layout: 'equal', overflow: false };
  const need = railNeeds({ inline, min, gap, pad });
  const room = num(avail);
  const prevRank = prev ? LEVELS.indexOf(prev.layout) : -1;
  const fits = (level, w) => (prevRank >= 0 && LEVELS.indexOf(level) < prevRank ? w + hysteresis <= room : w <= room);
  let layout = 'stacked';
  if (fits('equal', need.equal)) layout = 'equal';
  else if (fits('fit', need.fit)) layout = 'fit';
  const overflow = layout === 'stacked' && (prev && prev.overflow ? need.minRail + hysteresis > room : need.minRail > room);
  return { layout, overflow };
}
