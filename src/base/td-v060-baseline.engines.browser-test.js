import { expect } from '@esm-bundle/chai';
import { CAPTURES, BASELINE, RANGE_YEAR_CASES, normalizeRangeYearBounds, rangeYearBounds } from './td-v060-baseline.fixture.js';

// v0.60.0 (plan v0.60.0-calendar-picker C1 / A4 / B4, acceptance 8) — Chromium, Firefox AND WebKit:
//   - the closed box of <td-datetime-picker> is character-identical to v0.59.0;
//   - the dialog of <td-datetime-range> is character-identical to v0.59.0, EXCEPT the allow-list: `min` / `max` of the
//     year field of each side when the range has no bounds (2000 → 1, 2099 → 9999 — the implicit window is gone).
// Strings are compared as booleans + a short diff hint (long strings in a failing chai diff are unreadable).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const firstDiff = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  return `@${i}: …${a.slice(Math.max(0, i - 40), i + 80)}… ≠ …${b.slice(Math.max(0, i - 40), i + 80)}…`;
};

describe('v0.60.0 — closed picker box + range dialog = the v0.59.0 markup', () => {
  for (const name of Object.keys(CAPTURES)) {
    const allow = RANGE_YEAR_CASES.includes(name);
    it(`${name}${allow ? ' (allow-list: year field min / max only)' : ' (verbatim)'}`, async () => {
      const now = await CAPTURES[name]();
      const a = allow ? normalizeRangeYearBounds(now) : now;
      const b = allow ? normalizeRangeYearBounds(BASELINE[name]) : BASELINE[name];
      const same = a === b;
      expect(same, same ? '' : firstDiff(a, b)).to.equal(true);
      if (allow) {
        // the allow-listed attributes carry EXACTLY the new values (not "anything")
        expect(rangeYearBounds(BASELINE[name])).to.deep.equal([['2000', '2099'], ['2000', '2099']]);
        expect(rangeYearBounds(now)).to.deep.equal([['1', '9999'], ['1', '9999']]);
      }
    });
  }

  it('the normaliser touches nothing but the two allow-listed attributes of the year fields', () => {
    const html = '<div class="td-dtp-panel"><input class="td-dtp-panel__input" data-part="day" min="1" max="31">'
      + '<input class="td-dtp-panel__input" data-part="year" min="2000" max="2099" type="number"><input class="other" data-part="year" min="5" max="6"></div>';
    expect(normalizeRangeYearBounds(html)).to.equal('<div class="td-dtp-panel"><input class="td-dtp-panel__input" data-part="day" min="1" max="31">'
      + '<input class="td-dtp-panel__input" data-part="year" min="*" max="*" type="number"><input class="other" data-part="year" min="5" max="6"></div>');
    // a difference anywhere else still fails the comparison
    expect(normalizeRangeYearBounds(html) === normalizeRangeYearBounds(html.replace('max="31"', 'max="30"'))).to.equal(false);
  });

  it('a range WITH bounds keeps the bound years on the year fields (no normalisation)', async () => {
    expect(rangeYearBounds(await CAPTURES['range-panel-bounds']())).to.deep.equal([['1990', '2030'], ['1990', '2030']]);
  });
});
