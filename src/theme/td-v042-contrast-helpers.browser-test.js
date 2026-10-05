/* v0.42.0 R2-1 (plan N1): characterization of the four legacy black/white pickers BEFORE they are folded into
 * src/theme/color.js. Expected values were recorded from the v0.41.0 implementations (this file is committed before the
 * refactor); the refactor must not change a single result — tie directions included (tooltip → white, pagination →
 * black, button → black, dom-utils → white). */
import { expect } from '@esm-bundle/chai';
import { TdButton } from '../form/td-button.js';
import { TdPagination } from '../display/td-pagination.js';
import { tdTooltip } from '../feedback/td-tooltip.js';
import { getAccessibleTextColor, contrastRatio } from '../utils/dom-utils.js';

const COLORS = ['#ffffff', '#000000', '#777777', '#767676', '#757575', '#808080', '#959595', '#949494', '#ece5d8',
  '#16233a', '#1e2d48', '#b3261e', '#2563eb', '#3b82f6', '#f59e0b', '#22c55e', '#15803d', '#dc2626', '#fbbf24',
  '#60a5fa', '#18181b', '#f4f4f5', '#a1a1aa', '#8a8a93', '#6b6b73', '#d4d4d8', '#fff', '#0f0', '#abc',
  'rgb(118, 118, 118)', 'rgb(117, 117, 117)', 'rgba(0, 0, 0, 0.5)', 'rgba(255, 255, 255, 0.5)', 'rgba(37, 99, 235, 0.35)'];

/** Float greys around the black / white tie (luminance ≈ 0.1791 ≈ sRGB 117.4) — pagination takes objects. */
const FLOATS = [117.3, 117.35, 117.38, 117.4, 117.42, 117.45, 117.5];

const RECORD = { button: [], tooltip: [], domUtils: [], pagination: [], paginationOver: [], luminance: [], ratio: [] };

function run() {
  for (const c of COLORS) {
    RECORD.button.push(TdButton._getContrastColor(c));
    RECORD.tooltip.push(tdTooltip._getAccessibleTextColor(c));
    RECORD.domUtils.push(getAccessibleTextColor(c));
    RECORD.ratio.push(Math.round(contrastRatio(c, '#ffffff') * 1e6) / 1e6);
  }
  for (const v of FLOATS) {
    RECORD.pagination.push(TdPagination._contrastFg({ r: v, g: v, b: v, a: 1 }, { r: 255, g: 255, b: 255 }));
    RECORD.luminance.push(TdButton._luminance({ r: v, g: v, b: v }));
  }
  // translucent colour over a non-white backdrop (the pagination path composites first)
  for (const [c, u] of [[{ r: 0, g: 0, b: 0, a: 0.4 }, { r: 236, g: 229, b: 216 }], [{ r: 255, g: 255, b: 255, a: 0.3 }, { r: 22, g: 35, b: 58 }],
    [{ r: 37, g: 99, b: 235, a: 0.5 }, { r: 255, g: 255, b: 255 }], [{ r: 200, g: 40, b: 40, a: 1 }, { r: 0, g: 0, b: 0 }]]) {
    RECORD.paginationOver.push(TdPagination._contrastFg(c, u));
  }
  return RECORD;
}

/** Recorded from v0.41.0 (Chromium), before the refactor. */
const EXPECTED = {"button":["#000000","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#ffffff","#ffffff","#ffffff","#ffffff","#000000","#000000","#000000","#ffffff","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#000000","#ffffff","#000000","#000000","#000000"],"tooltip":["#000000","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#ffffff","#ffffff","#ffffff","#ffffff","#000000","#000000","#000000","#ffffff","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#000000","#ffffff","#ffffff","#000000","#ffffff"],"domUtils":["#000000","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#ffffff","#ffffff","#ffffff","#ffffff","#000000","#000000","#000000","#ffffff","#ffffff","#000000","#000000","#ffffff","#000000","#000000","#000000","#ffffff","#000000","#000000","#000000","#000000","#000000","#ffffff","#ffffff","#000000","#ffffff"],"pagination":["#ffffff","#ffffff","#000000","#000000","#000000","#000000","#000000"],"paginationOver":["#000000","#ffffff","#000000","#ffffff"],"luminance":[0.1788675039555289,0.17903099012538465,0.17912912365022893,0.17919456342811482,0.1792600171493827,0.1793582238769824,0.1795219714852476],"ratio":[1,21,4.478089,4.542225,4.607518,3.94944,2.995346,3.03347,1.252544,15.722976,13.778314,6.536489,5.168556,3.677901,2.147663,2.278609,5.015597,4.829405,1.669364,2.542423,17.716765,1.099165,2.562908,3.421665,5.281957,1.478001,1,1.37219,1.964588,4.542225,4.607518,21,1,5.168556]};

describe('v0.42.0 R2-1 — legacy contrast helpers (characterization)', () => {
  it('records / matches', () => {
    const got = run();
    expect(got).to.deep.equal(EXPECTED);
  });
});
