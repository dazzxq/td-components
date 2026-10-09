import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spanDays } from './date-presets.js';

const rs = await import('./range-selection.js');
const D = (year, month, day) => ({ year, month, day });
const S = (start, end, side) => ({ start, end, side });

// v0.61.0 (plan docs/internal/plans/v0.61.0-range-calendar.md A1 / M1): the pure range-selection state machine behind the
// calendar of <td-datetime-range>. No DOM, no Date.

describe('range-selection — pickDay, mode "date" (table A1)', () => {
  const ctx = { mode: 'date', maxDays: null, min: null, max: null };

  it('side=start: always a new range (start=d, end cleared, side=end), also from a complete range', () => {
    const r = rs.pickDay(S(D(2026, 10, 1), D(2026, 10, 9), 'start'), D(2026, 10, 20), ctx);
    assert.deepEqual(r.state, S(D(2026, 10, 20), null, 'end'));
    assert.equal(r.kind, 'start');
    assert.equal(r.overLimit, false);
    assert.deepEqual(rs.pickDay(rs.emptyState(), D(2026, 10, 5), ctx).state, S(D(2026, 10, 5), null, 'end'));
  });

  it('side=end, d >= start: the end; side goes back to start (next click = a new range)', () => {
    const r = rs.pickDay(S(D(2026, 10, 5), null, 'end'), D(2026, 10, 9), ctx);
    assert.deepEqual(r.state, S(D(2026, 10, 5), D(2026, 10, 9), 'start'));
    assert.equal(r.kind, 'end');
  });

  it('the same day = a one-day range', () => {
    const r = rs.pickDay(S(D(2026, 10, 5), null, 'end'), D(2026, 10, 5), ctx);
    assert.deepEqual(r.state, S(D(2026, 10, 5), D(2026, 10, 5), 'start'));
    assert.equal(rs.cellFlags(r.state, D(2026, 10, 5), null, ctx).role, 'single');
  });

  it('side=end, d < start: a NEW range (start=d, no error), overLimit false', () => {
    const r = rs.pickDay(S(D(2026, 10, 5), null, 'end'), D(2026, 10, 2), ctx);
    assert.deepEqual(r.state, S(D(2026, 10, 2), null, 'end'));
    assert.equal(r.kind, 'restart');
    assert.equal(r.overLimit, false);
  });

  it('side=end without a start (tab "Đến" chosen first): end-only, side stays end', () => {
    const r = rs.pickDay(S(null, null, 'end'), D(2026, 10, 7), ctx);
    assert.deepEqual(r.state, S(null, D(2026, 10, 7), 'end'));
    assert.equal(r.kind, 'end');
  });

  it('unrestricted (maxDays == null): every d >= start is the end, overLimit false, nothing dimmed, however far', () => {
    const st = S(D(2026, 1, 1), null, 'end');
    const far = D(2030, 12, 31);
    const r = rs.pickDay(st, far, ctx);
    assert.equal(r.kind, 'end');
    assert.equal(r.overLimit, false);
    assert.deepEqual(r.state.end, far);
    assert.equal(rs.cellFlags(st, far, null, ctx).dimmed, false);
    assert.equal(rs.isOverLimit(st, far, ctx), false);
  });

  it('min / max cells are ignored (state untouched)', () => {
    const c = { ...ctx, min: D(2026, 10, 3), max: D(2026, 10, 20) };
    const st = S(D(2026, 10, 5), null, 'end');
    for (const d of [D(2026, 10, 2), D(2026, 10, 21)]) {
      const r = rs.pickDay(st, d, c);
      assert.equal(r.kind, 'ignored');
      assert.equal(r.state, st);
      assert.equal(rs.cellFlags(st, d, null, c).disabled, true);
    }
    assert.equal(rs.pickDay(st, D(2026, 10, 3), c).kind, 'restart');
  });
});

describe('range-selection — max-days (Q1: dims, never disables)', () => {
  const ctx = { mode: 'date', maxDays: 7, min: null, max: null };
  const st = S(D(2026, 10, 1), null, 'end');

  it('inside the limit: both ends included (1 + 6 = day 7 is allowed, day 8 is over)', () => {
    assert.equal(rs.pickDay(st, D(2026, 10, 7), ctx).kind, 'end');
    const r = rs.pickDay(st, D(2026, 10, 8), ctx);
    assert.equal(r.kind, 'restart');
    assert.equal(r.overLimit, true);
    assert.deepEqual(r.state, S(D(2026, 10, 8), null, 'end'));
  });

  it('the over-limit cell is dimmed but NOT disabled; the cell before start is neither', () => {
    const over = rs.cellFlags(st, D(2026, 10, 8), null, ctx);
    assert.equal(over.dimmed, true);
    assert.equal(over.disabled, false);
    assert.equal(rs.cellFlags(st, D(2026, 10, 7), null, ctx).dimmed, false);
    assert.equal(rs.cellFlags(st, D(2026, 9, 30), null, ctx).dimmed, false);
    assert.equal(rs.pickDay(st, D(2026, 9, 30), ctx).overLimit, false);
  });

  it('dimming only while choosing the end of a date range with a start', () => {
    assert.equal(rs.cellFlags(S(D(2026, 10, 1), null, 'start'), D(2026, 10, 20), null, ctx).dimmed, false);
    assert.equal(rs.cellFlags(S(null, null, 'end'), D(2026, 10, 20), null, ctx).dimmed, false);
    assert.equal(rs.cellFlags(st, D(2026, 10, 20), null, { ...ctx, mode: 'datetime' }).dimmed, false);
  });

  it('counts across months, leap days and years; max-days=1 = only the same cell', () => {
    const feb = S(D(2024, 2, 27), null, 'end');
    const c = { ...ctx, maxDays: 4 };
    assert.equal(rs.pickDay(feb, D(2024, 3, 1), c).kind, 'end'); // 27, 28, 29, 1 = 4
    assert.equal(rs.pickDay(feb, D(2024, 3, 2), c).overLimit, true);
    assert.equal(rs.pickDay(S(D(2025, 12, 30), null, 'end'), D(2026, 1, 2), c).kind, 'end');
    const one = { ...ctx, maxDays: 1 };
    assert.equal(rs.pickDay(st, D(2026, 10, 1), one).kind, 'end');
    assert.equal(rs.pickDay(st, D(2026, 10, 2), one).overLimit, true);
  });

  it('rangeDays agrees with date-presets spanDays', () => {
    const pairs = [[D(2026, 9, 29), D(2026, 10, 5)], [D(1999, 12, 29), D(2000, 1, 2)], [D(2024, 2, 28), D(2024, 3, 1)], [D(1, 1, 1), D(9999, 12, 31)], [D(2026, 10, 5), D(2026, 10, 5)]];
    for (const [a, b] of pairs) assert.equal(rs.rangeDays(a, b), spanDays(a, b), JSON.stringify([a, b]));
  });
});

describe('range-selection — mode "datetime" (two independent endpoints)', () => {
  const ctx = { mode: 'datetime', maxDays: 3, min: null, max: null };

  it('a pick only sets the date of the active endpoint; no restart, no side change, no max-days dimming', () => {
    const a = rs.pickDay(S(D(2026, 10, 5), D(2026, 10, 9), 'start'), D(2026, 10, 12), ctx);
    assert.deepEqual(a.state, S(D(2026, 10, 12), D(2026, 10, 9), 'start'));
    assert.equal(a.overLimit, false);
    const b = rs.pickDay(S(D(2026, 10, 5), null, 'end'), D(2026, 10, 1), ctx);
    assert.deepEqual(b.state, S(D(2026, 10, 5), D(2026, 10, 1), 'end'));
    assert.equal(rs.cellFlags(b.state, D(2026, 10, 9), null, ctx).dimmed, false);
  });

  it('a reversed pair draws no band (only the endpoints)', () => {
    const st = S(D(2026, 10, 12), D(2026, 10, 9), 'start');
    assert.equal(rs.cellFlags(st, D(2026, 10, 10), null, ctx).role, null);
    assert.equal(rs.cellFlags(st, D(2026, 10, 12), null, ctx).role, 'start');
    assert.equal(rs.cellFlags(st, D(2026, 10, 9), null, ctx).role, 'end');
  });
});

describe('range-selection — cellFlags roles and preview', () => {
  const ctx = { mode: 'date', maxDays: 5, min: null, max: null };
  const full = S(D(2026, 10, 3), D(2026, 10, 6), 'start');

  it('start / in / end / none', () => {
    const roles = [2, 3, 4, 5, 6, 7].map((n) => rs.cellFlags(full, D(2026, 10, n), null, ctx).role);
    assert.deepEqual(roles, [null, 'start', 'in', 'in', 'end', null]);
  });

  it('only a start / only an end', () => {
    assert.equal(rs.cellFlags(S(D(2026, 10, 3), null, 'end'), D(2026, 10, 3), null, ctx).role, 'start');
    assert.equal(rs.cellFlags(S(null, D(2026, 10, 3), 'end'), D(2026, 10, 3), null, ctx).role, 'end');
    assert.equal(rs.cellFlags(S(D(2026, 10, 3), null, 'end'), D(2026, 10, 4), null, ctx).role, null);
  });

  it('preview: start..d for an enabled d >= start inside the limit (what activation would produce)', () => {
    const st = S(D(2026, 10, 3), null, 'end');
    const f = (n, hover) => rs.cellFlags(st, D(2026, 10, n), hover ? D(2026, 10, hover) : null, ctx).preview;
    assert.deepEqual([3, 4, 5, 6, 7].map((n) => f(n, 6)), [null, 'in', 'in', 'end', null]);
    assert.equal(f(4, null), null);
  });

  it('preview excludes over-limit and earlier cells (activation restarts there)', () => {
    const st = S(D(2026, 10, 3), null, 'end');
    for (const hover of [D(2026, 10, 9), D(2026, 10, 1)]) {
      for (let n = 1; n <= 12; n++) assert.equal(rs.cellFlags(st, D(2026, 10, n), hover, ctx).preview, null, `${JSON.stringify(hover)} ${n}`);
    }
    const dis = { ...ctx, max: D(2026, 10, 5) };
    assert.equal(rs.cellFlags(st, D(2026, 10, 4), D(2026, 10, 7), dis).preview, null);
  });

  it('preview only while choosing the end', () => {
    const st = S(D(2026, 10, 3), null, 'start');
    assert.equal(rs.cellFlags(st, D(2026, 10, 4), D(2026, 10, 6), ctx).preview, null);
  });
});
