/**
 * Justified rows (v0.33.0) — pure math, no DOM. Port of dwp `PhotosSurface::pack_rows()` + `rows_markup()`
 * (plan v0.33.0 decision 33). Used by `td-media-grid layout="justified"`; node-tested in justified.test.js.
 *
 * Model: every item has an aspect ratio `ar` (w / h, clamped to [0.2, 5]). Items are packed in order into rows whose
 * ratio sum Σ stays as close as possible to the target Σ (row height = (W − gaps) / Σ). Each cell gets
 *   width:        calc(P% − sub px)         P = ar / denom × 100, sub = P / ΣP × (n − 1) × gap
 *   aspect-ratio: P / k                      k = 100 / denom (one constant per row → equal heights by algebra)
 * with denom = Σ for a full row. A short LAST row (Σ < target) is never repacked (its items are exactly packRows()'s
 * last row; no item moves between rows — dwp GOTCHAS §17.2) and leaves the right empty. Its height:
 *   - FITS (Σ ≤ Σ_prev AND n ≤ n_prev, i.e. at the previous row's height it fits the container at EVERY width — the
 *     grid only rebuilds on a breakpoint change, so the choice cannot depend on W) → the previous row's EXACT height:
 *     P = ⌊ar / Σ_prev × 100⌋₃, sub = P / 100 × (n_prev − 1) × gap, k = 100 / Σ_prev — so
 *     row width = Σ/Σ_prev × (W − (n_prev − 1)·gap) + (n − 1)·gap ≤ W;
 *   - otherwise (first / only row, Σ > Σ_prev, or n > n_prev) → denom = target, as dwp rows_markup() does: row width =
 *     ΣP% × W ≤ W (P rounded DOWN), and the height may differ from the previous row's (lower when Σ > Σ_prev).
 * Contract (plan decision 33): equal height to the previous row only when it fits; never overflow; never repack.
 * Full rows: P rounded to 3 decimals, the remainder goes to the last cell (ΣP = 100.000 by addition) and the last cell
 * takes 0.5px MORE off (never less), so the row never exceeds the container and flex-wrap never breaks it early.
 */

export const AR_MIN = 0.2;
export const AR_MAX = 5;
/** extra px taken off the last cell of a full row (rounding / sub-pixel slack, invisible) */
export const ROW_SLACK_PX = 0.5;

const round = (x, d) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

/**
 * @param {number} ar
 * @returns {number} ar clamped to [0.2, 5] (non-finite / ≤ 0 → NaN, the caller falls back)
 */
export function clampAr(ar) {
  if (!Number.isFinite(ar) || ar <= 0) return NaN;
  return Math.min(AR_MAX, Math.max(AR_MIN, ar));
}

/**
 * Parse a `data-td-ar` value: "1.5", "3/2", "3:2" (spaces allowed). Invalid → NaN.
 * @param {string|null|undefined} text
 * @returns {number}
 */
export function parseAr(text) {
  const s = String(text ?? '').trim();
  if (!s) return NaN;
  const m = /^(\d+(?:\.\d+)?|\.\d+)\s*(?:[/:]\s*(\d+(?:\.\d+)?|\.\d+))?$/.exec(s);
  if (!m) return NaN;
  const a = Number(m[1]);
  const b = m[2] === undefined ? 1 : Number(m[2]);
  return a > 0 && b > 0 ? a / b : NaN;
}

/**
 * Pack ratios into rows. ONE closing rule: adding the next item would move Σ farther from the target than leaving
 * it out. No cap on items per row (dwp GOTCHAS §17.1) and no "move items to fix the last row" pass (§17.2).
 * @param {number[]} ars ratios in order (clamped here; invalid → 1)
 * @param {number} target Σ target (> 0)
 * @returns {number[][]} rows of clamped ratios, in order
 */
export function packRows(ars, target) {
  const rows = [];
  let row = [];
  let sum = 0;
  for (const raw of ars) {
    const c = clampAr(raw);
    const ar = Number.isNaN(c) ? 1 : c;
    if (row.length && Math.abs(sum + ar - target) > Math.abs(sum - target)) {
      rows.push(row);
      row = [];
      sum = 0;
    }
    row.push(ar);
    sum += ar;
  }
  if (row.length) rows.push(row);
  return rows;
}

/**
 * Cell styles per row.
 * @param {number[][]} rows from packRows()
 * @param {number} target the SAME Σ target packRows() used
 * @param {number} gapPx gap between cells (px)
 * @param {number} [containerWidth] when given, each row also gets the expected px widths
 * @returns {{ full: boolean, k: number, cells: { w: number, sub: number }[], widths?: number[], total?: number }[]}
 *   w = P (percent, 3 decimals), sub = px to subtract (4 decimals), k = row constant 100 / denom (4 decimals);
 *   widths = px width of each cell, total = Σ widths + (n − 1) × gap.
 */
export function rowStyles(rows, target, gapPx, containerWidth) {
  const gap = Number.isFinite(gapPx) && gapPx > 0 ? gapPx : 0;
  const last = rows.length - 1;
  const sums = rows.map((row) => row.reduce((a, b) => a + b, 0));
  return rows.map((row, ri) => {
    const n = row.length;
    const sum = sums[ri];
    const short = ri === last && sum < target;
    const prev = short && ri > 0 ? rows[ri - 1] : null;
    if (prev && sums[ri - 1] >= sum && prev.length >= n) {
      // match the previous full row's height exactly (see the header)
      const ps = sums[ri - 1];
      const k = round(100 / ps, 4);
      // P rounded DOWN: the row can only get narrower than the exact fit (≤ W even when Σ = Σ_prev, n = n_prev);
      // the height does not depend on P (it cancels out), so all cells keep the previous row's height
      const cells = row.map((ar) => {
        const w = Math.floor((ar / ps) * 100 * 1000) / 1000;
        return { w, sub: round((w / 100) * (prev.length - 1) * gap, 4) };
      });
      const out = { full: false, k, cells };
      if (Number.isFinite(containerWidth)) {
        out.widths = cells.map((c) => (c.w / 100) * containerWidth - c.sub);
        out.total = out.widths.reduce((a, b) => a + b, 0) + (n - 1) * gap;
      }
      return out;
    }
    const denom = short ? target : sum;
    const pcts = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      let p;
      if (!short && i === n - 1) {
        p = round(100 - acc, 3);
      } else if (short) {
        // rounded DOWN: ΣP ≤ Σ / target × 100 < 100, so the row never exceeds the container (half-up could, by n × 0.0005%)
        p = Math.floor((row[i] / denom) * 100 * 1000) / 1000;
      } else {
        p = round((row[i] / denom) * 100, 3);
        acc = round(acc + p, 3);
      }
      pcts.push(p);
    }
    const totalPct = short ? pcts.reduce((a, b) => a + b, 0) : 100;
    const k = round(100 / denom, 4);
    const cells = pcts.map((p, i) => {
      let sub = totalPct > 0 ? (p / totalPct) * (n - 1) * gap : 0;
      if (!short && i === n - 1) sub += ROW_SLACK_PX;
      return { w: p, sub: round(sub, 4) };
    });
    const out = { full: !short, k, cells };
    if (Number.isFinite(containerWidth)) {
      out.widths = cells.map((c) => (c.w / 100) * containerWidth - c.sub);
      out.total = out.widths.reduce((a, b) => a + b, 0) + (n - 1) * gap;
    }
    return out;
  });
}
