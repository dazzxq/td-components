// v0.53.1 (plan docs/internal/plans/v0.53.1-segmented-layout.md QĐ 1) — the ONE formula of the segmented layout levels,
// shared by <td-choice-group variant="segmented">, its browser tests and the responsive gate.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideLayout, minWidth, railNeeds, HYSTERESIS } from './segmented-layout.js';

const GAP = 2;
const PAD = 3;
const d = (avail, inline, min, prev) => decideLayout({ avail, inline, min, gap: GAP, pad: PAD, prev });

describe('segmented layout — levels (equal → fit → stacked → stacked + overflow)', () => {
  // dsuite (Chromium, sm): inline widths 80.2 / 61.8 / 49.5, mouse minimums 42 / 42 / 28
  const inline = [80.2, 61.8, 49.5];
  const min = [42, 42, 28];
  it('equal when n × max fits, fit when only the sum fits, stacked otherwise', () => {
    assert.deepEqual(railNeeds({ inline, min, gap: GAP, pad: PAD }), { equal: 3 * 80.2 + 10, fit: 191.5 + 10, minRail: 112 + 10 });
    assert.deepEqual(d(260, inline, min), { layout: 'equal', overflow: false });
    assert.deepEqual(d(216, inline, min), { layout: 'fit', overflow: false }); // the dsuite sidebar
    assert.deepEqual(d(180, inline, min), { layout: 'stacked', overflow: false });
    assert.deepEqual(d(121, inline, min), { layout: 'stacked', overflow: true });
  });

  it('coarse pointer: 3 × 44 + 2 × 2 + 2 × 3 = 142 → overflow at 140, not at 142 / 144', () => {
    const m = [0, 0, 0].map(() => minWidth({ touchMin: 44, px: 6, icon: 16, label: 28 }));
    assert.deepEqual(m, [44, 44, 44]);
    assert.equal(railNeeds({ inline: [90, 90, 90], min: m, gap: GAP, pad: PAD }).minRail, 142);
    assert.equal(d(140, [90, 90, 90], m).overflow, true);
    assert.equal(d(142, [90, 90, 90], m).overflow, false);
    assert.equal(d(144, [90, 90, 90], m).overflow, false);
  });

  it('min = max(touch minimum, 2 × px + max(icon, label min-content)) — a long unbreakable word wins in both pointer modes', () => {
    assert.equal(minWidth({ touchMin: 0, px: 6, icon: 16, label: 30 }), 42);
    assert.equal(minWidth({ touchMin: 44, px: 6, icon: 16, label: 30 }), 44);
    assert.equal(minWidth({ touchMin: 44, px: 6, icon: 16, label: 130 }), 142); // "Supercalifragilistic"
    assert.equal(minWidth({ touchMin: 0, px: 6, icon: 16, label: 130 }), 142);
    assert.equal(minWidth({ touchMin: 0, px: 6, icon: 16, label: 0 }), 28); // icon-only
  });

  it('hysteresis: moving to a MORE inline level needs ≥ 4 px slack; staying / moving down does not', () => {
    const inline3 = [60, 60, 60];
    const min3 = [40, 40, 40];
    const fitNeed = 180 + 10;
    assert.equal(HYSTERESIS, 4);
    assert.equal(d(fitNeed, inline3, min3).layout, 'equal'); // fresh: exact fit
    assert.equal(d(fitNeed + 3, inline3, min3, { layout: 'stacked', overflow: false }).layout, 'stacked');
    assert.equal(d(fitNeed + 4, inline3, min3, { layout: 'stacked', overflow: false }).layout, 'equal');
    assert.equal(d(fitNeed, inline3, min3, { layout: 'equal', overflow: false }).layout, 'equal');
    assert.equal(d(fitNeed - 1, inline3, min3, { layout: 'equal', overflow: false }).layout, 'stacked');
    // leaving the overflow needs the slack too
    assert.equal(d(130 + 2, inline3, min3, { layout: 'stacked', overflow: true }).overflow, true);
    assert.equal(d(130 + 4, inline3, min3, { layout: 'stacked', overflow: true }).overflow, false);
  });

  it('degenerate inputs: no option → equal; non-finite / negative widths count as 0', () => {
    assert.deepEqual(d(100, [], []), { layout: 'equal', overflow: false });
    assert.deepEqual(d(100, [NaN, -5], [NaN, -1]), { layout: 'equal', overflow: false });
  });
});
