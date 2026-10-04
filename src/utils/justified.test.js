// v0.33.0 (plan docs/internal/plans/v0.33.0-media-picker-dcms-parity.md, decision 33) — justified rows math, the port of
// dwp pack_rows() + rows_markup(). Width safety is checked HERE (before any browser test): every full row fits the
// container (≤ W) and fills it (≥ W − 1); a short last row never exceeds W.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { packRows, rowStyles, clampAr, parseAr, AR_MIN, AR_MAX } from './justified.js';

/** mulberry32 — fixed-seed PRNG, so the 200 random sets are the same on every run */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = prng(0x7d033);
const SETS = Array.from({ length: 200 }, () => {
  const n = 1 + Math.floor(rand() * 60);
  // mixed: portraits, squares, landscapes, panoramas, plus out-of-range ratios that get clamped
  return Array.from({ length: n }, () => {
    const r = rand();
    if (r < 0.05) return 0.05 + rand() * 0.15;
    if (r < 0.1) return 5 + rand() * 6;
    return 0.3 + rand() * 3.2;
  });
});
const WIDTHS = [320, 359.5, 768, 1023.7, 1280, 1440, 2560];
const GAPS = [4, 8];
const TARGETS = [5.5, 4, 2.5];
const sum = (a) => a.reduce((x, y) => x + y, 0);

describe('justified — parse / clamp', () => {
  it('parseAr: number, w/h, w:h (spaces allowed); garbage → NaN', () => {
    assert.equal(parseAr('1.5'), 1.5);
    assert.equal(parseAr('3/2'), 1.5);
    assert.equal(parseAr(' 16 : 9 '), 16 / 9);
    assert.equal(parseAr('.5'), 0.5);
    for (const bad of ['', null, undefined, '0', '3/0', '-1', 'abc', '1/2/3', '1e3', 'Infinity']) {
      assert.ok(Number.isNaN(parseAr(bad)), String(bad));
    }
  });

  it('clampAr: [0.2, 5]; non-finite / ≤ 0 → NaN', () => {
    assert.equal(clampAr(10), AR_MAX);
    assert.equal(clampAr(0.1), AR_MIN);
    assert.equal(clampAr(1.5), 1.5);
    assert.ok(Number.isNaN(clampAr(0)));
    assert.ok(Number.isNaN(clampAr(Infinity)));
  });
});

describe('justified — packRows', () => {
  it('closes a row only when the next item moves Σ farther from the target', () => {
    const rows = packRows([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 5.5);
    // 1.5·3 = 4.5 (|−1|), +1.5 = 6 (|0.5|) → keep; +1.5 = 7.5 (|2|) → close at 4
    assert.deepEqual(rows.map((r) => r.length), [4, 2]);
  });

  it('dwp: 24 portraits 2:3 → 3 rows of 8 (no per-row cap — GOTCHAS §17.1)', () => {
    const rows = packRows(Array(24).fill(2 / 3), 5.5);
    assert.deepEqual(rows.map((r) => r.length), [8, 8, 8]);
  });

  it('dwp: 25 portraits 2:3 → 8, 8, 8, 1 (no "move items to fix the last row" — §17.2); every row has the same k', () => {
    const rows = packRows(Array(25).fill(2 / 3), 5.5);
    assert.deepEqual(rows.map((r) => r.length), [8, 8, 8, 1]);
    const st = rowStyles(rows, 5.5, 4, 1200);
    assert.equal(st[0].k, st[1].k);
    assert.equal(st[1].k, st[2].k);
    // short last row after a full row: the previous row's k and its exact height, gaps included
    // (dwp's denominator = target gave 220, 220, 220, 218 px at W = 1200; this gives 4 × the same height)
    assert.equal(st[3].full, false);
    assert.equal(st[3].k, st[2].k);
    const h = (r) => r.widths[0] / ((r.cells[0].w) / r.k);
    const hFull = h(st[0]);
    assert.ok(Math.abs(h(st[1]) - hFull) < 1e-6);
    assert.ok(Math.abs(h(st[3]) - hFull) < 1e-3, `${h(st[3])} vs ${hFull}`);
    assert.ok(st[3].total < 1200);
  });

  it('clamps 10:1 and 1:10', () => {
    const rows = packRows([10, 0.1, 1], 5.5);
    assert.deepEqual(rows.flat(), [5, 0.2, 1]);
  });

  it('no cap: 40 portraits 1:5 (clamped 0.2) still close by Σ → 27 + 13', () => {
    const rows = packRows(Array(40).fill(1 / 5), 5.5);
    for (const r of rows.slice(0, -1)) assert.ok(Math.abs(sum(r) - 5.5) <= 0.1 + 1e-9, String(sum(r)));
    assert.ok(rows[0].length > 20, `row of ${rows[0].length}`);
    assert.equal(sum(rows.map((r) => r.length)), 40);
  });

  it('invalid ratios count as 1; empty input → no rows', () => {
    assert.deepEqual(packRows([NaN, -2, 0], 5.5).flat(), [1, 1, 1]);
    assert.deepEqual(packRows([], 5.5), []);
  });

  it('a closed row was closer to the target than with the next item added (the one closing rule)', () => {
    for (const set of SETS) {
      for (const t of TARGETS) {
        const rows = packRows(set, t);
        for (let i = 0; i < rows.length - 1; i++) {
          const s0 = sum(rows[i]);
          assert.ok(Math.abs(s0 + rows[i + 1][0] - t) > Math.abs(s0 - t), `${s0} + ${rows[i + 1][0]} t=${t}`);
        }
      }
    }
  });
});

describe('justified — rowStyles', () => {
  it('a full row sums to 100.000%; the last cell takes 0.5px more off; k = 100 / Σ', () => {
    const rows = packRows([1.5, 0.6667, 1, 2.2, 0.8], 5.5);
    const [r] = rowStyles(rows, 5.5, 4);
    assert.equal(r.full, true);
    assert.equal(Math.round(sum(r.cells.map((c) => c.w)) * 1000), 100000);
    const n = r.cells.length;
    const subs = sum(r.cells.map((c) => c.sub));
    assert.ok(Math.abs(subs - ((n - 1) * 4 + 0.5)) < 0.001, String(subs));
    assert.equal(r.k, Math.round((100 / sum(rows[0])) * 1e4) / 1e4);
    for (const c of r.cells) assert.equal(c.w, Math.round(c.w * 1000) / 1000, '3 decimals');
  });

  it('short last row after a full row: ΣP < 100, the previous k, sub = P / 100 × (n_prev − 1) × gap (+ slack)', () => {
    const rows = packRows([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 5.5);
    const st = rowStyles(rows, 5.5, 8, 1000);
    const s = st[1];
    assert.equal(s.full, false);
    assert.ok(sum(s.cells.map((c) => c.w)) < 100);
    assert.equal(s.k, st[0].k);
    assert.equal(s.cells[0].sub, 0.25 * 3 * 8);
    assert.equal(s.cells[1].sub, 0.25 * 3 * 8);
    const h = (r, i) => r.widths[i] * r.k / r.cells[i].w;
    assert.ok(Math.abs(h(s, 0) - h(st[0], 0)) < 1e-6);
  });

  it('short ONLY row, or a short row that could not fit the previous height: denominator = target (dwp)', () => {
    const [only] = rowStyles([[1, 1]], 5.5, 8, 1000);
    assert.equal(only.full, false);
    assert.equal(only.k, Math.round((100 / 5.5) * 1e4) / 1e4);
    assert.ok(Math.abs(sum(only.cells.map((c) => c.sub)) - 8) < 0.001, 'all gaps subtracted, no slack');
    // previous row has fewer items than the short one → no exact match possible for every W → target
    const st = rowStyles([[5, 0.6], [0.5, 0.5, 0.5, 0.5]], 5.5, 8, 1000);
    assert.equal(st[1].k, Math.round((100 / 5.5) * 1e4) / 1e4);
    assert.ok(st[1].total <= 1000);
  });

  it('single item / single full row: no gap, only the slack', () => {
    const [r] = rowStyles([[5.5]], 5.5, 8, 1000);
    assert.equal(r.full, true);
    assert.equal(r.cells[0].w, 100);
    assert.equal(r.cells[0].sub, 0.5);
    assert.equal(r.total, 999.5);
  });

  it(`width safety: ${WIDTHS.length} widths × ${GAPS.length} gaps × ${TARGETS.length} targets × 200 seeded sets`, () => {
    let fullRows = 0;
    let shortRows = 0;
    for (const set of SETS) {
      for (const t of TARGETS) {
        const rows = packRows(set, t);
        for (const g of GAPS) {
          for (const W of WIDTHS) {
            for (const r of rowStyles(rows, t, g, W)) {
              if (r.full) {
                fullRows++;
                assert.ok(r.total <= W, `full row ${r.total} > ${W}`);
                assert.ok(r.total >= W - 1, `full row ${r.total} < ${W} − 1`);
              } else {
                shortRows++;
                assert.ok(r.total <= W, `short row ${r.total} > ${W}`);
              }
            }
          }
        }
      }
    }
    assert.ok(fullRows > 10000 && shortRows > 1000, `${fullRows} / ${shortRows}`);
  });

  it('heights in a row are equal by algebra; the last cell of a full row is at most the slack shorter, never taller', () => {
    // (in the browser the flex line stretches every cell to the line height, so the slack only crops ≤ 0.5px of width)
    for (const set of SETS.slice(0, 50)) {
      const st = rowStyles(packRows(set, 5.5), 5.5, 4, 1280);
      for (const r of st) {
        const hs = r.cells.map((c, i) => r.widths[i] * r.k / c.w);
        const n = hs.length;
        for (let i = 1; i < (r.full ? n - 1 : n); i++) assert.ok(Math.abs(hs[i] - hs[0]) < 1e-3, `${hs[i]} vs ${hs[0]}`);
        if (r.full && n > 1) assert.ok(hs[n - 1] <= hs[0] + 1e-3, 'last cell never taller');
      }
    }
  });

  it('box ratio = item ratio within 1% (P / k vs ar)', () => {
    for (const set of SETS.slice(0, 50)) {
      const rows = packRows(set, 5.5);
      rowStyles(rows, 5.5, 4).forEach((r, ri) => {
        r.cells.forEach((c, i) => {
          const ar = rows[ri][i];
          assert.ok(Math.abs(c.w / r.k - ar) / ar < 0.01, `${c.w / r.k} vs ${ar}`);
        });
      });
    }
  });
});
