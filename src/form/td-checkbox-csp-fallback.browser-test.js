import { expect } from '@esm-bundle/chai';
import './td-checkbox.js';

/**
 * REGRESSION GUARD for codex-impl-review ISSUE-1.
 *
 * The CSP gate (test/csp/csp.spec.mjs) runs in Chromium WHERE `adoptedStyleSheets` IS
 * supported, so it cannot catch a component whose STRUCTURE/STATE lives only in the
 * adopted constructable stylesheet. On an ancient browser without that support,
 * `adoptStyles()` returns false and adopts NOTHING — the documented contract says only
 * selector/keyframe EMBELLISHMENTS may degrade; the component must still render
 * structurally and convey its checked state.
 *
 * This suite SIMULATES the unsupported-browser fallback by clearing
 * `document.adoptedStyleSheets = []` AFTER upgrade, then proves the checkbox is STILL
 * fully usable purely from CSSOM (`_applyStyles`) — input hidden, checkmark positioned,
 * and the checked SIGNAL (green box + visible icon) present. If anyone moves the
 * structural/state rules back into the adopted sheet, these assertions fail.
 */

const container = document.createElement('div');
document.body.appendChild(container);

function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}

/** Drop EVERY adopted constructable stylesheet — emulate a browser without support. */
function clearAdoptedSheets() {
  document.adoptedStyleSheets = [];
  // The component caches "already adopted" per-document; clear it so a later connect in
  // another test re-adopts cleanly and this test's clearing is authoritative.
  if (document.__tdAdopted) document.__tdAdopted.clear();
}

afterEach(() => {
  container.innerHTML = '';
  clearAdoptedSheets();
});

describe('td-checkbox structural fallback WITHOUT adoptedStyleSheets (codex ISSUE-1)', () => {
  it('checked: structure + checked STATE survive after clearing adoptedStyleSheets', () => {
    const el = mount('<td-checkbox checked color="#10b981" size="md"></td-checkbox>');

    // Emulate the unsupported browser: remove the adopted sheet entirely.
    clearAdoptedSheets();
    expect(document.adoptedStyleSheets.length, 'adoptedStyleSheets must be empty').to.equal(0);

    const input = el.querySelector('.td-checkbox-input');
    const checkmark = el.querySelector('.td-checkmark');
    const icon = el.querySelector('.td-checkmark-icon');

    // 1) Native input is VISUALLY HIDDEN purely from CSSOM (not the adopted sheet).
    const inputCs = getComputedStyle(input);
    expect(inputCs.opacity, 'native input opacity (hidden)').to.equal('0');
    expect(inputCs.width, 'native input width collapsed').to.equal('0px');
    expect(inputCs.height, 'native input height collapsed').to.equal('0px');
    expect(inputCs.position, 'native input taken out of flow').to.equal('absolute');

    // 2) Checkmark is POSITIONED + laid out from CSSOM.
    const cmCs = getComputedStyle(checkmark);
    expect(cmCs.position, 'checkmark positioned').to.equal('absolute');
    expect(cmCs.display, 'checkmark is a flex box').to.equal('flex');

    // 3) The CHECKED SIGNAL is visible WITHOUT the sheet:
    //    green box + fully opaque icon. This is the core "is it checked" function.
    expect(cmCs.backgroundColor, 'checked checkmark is the green color').to.equal('rgb(16, 185, 129)');
    expect(getComputedStyle(icon).opacity, 'checked icon fully visible').to.equal('1');
  });

  it('unchecked: icon is hidden (opacity 0) after clearing adoptedStyleSheets', () => {
    const el = mount('<td-checkbox label="Accept" size="md"></td-checkbox>');

    clearAdoptedSheets();
    expect(document.adoptedStyleSheets.length, 'adoptedStyleSheets must be empty').to.equal(0);

    const checkmark = el.querySelector('.td-checkmark');
    const icon = el.querySelector('.td-checkmark-icon');

    // Structure still present (positioned box), but the checked SIGNAL is absent:
    expect(getComputedStyle(checkmark).position, 'checkmark positioned').to.equal('absolute');
    expect(getComputedStyle(checkmark).backgroundColor, 'unchecked = default subtle bg, NOT green')
      .to.equal('rgba(0, 0, 0, 0.04)');
    expect(getComputedStyle(icon).opacity, 'unchecked icon hidden').to.equal('0');
  });

  it('toggling re-runs CSSOM so the checked signal flips even with the sheet cleared', () => {
    const el = mount('<td-checkbox color="#10b981" size="md"></td-checkbox>');
    clearAdoptedSheets();

    // Starts unchecked.
    expect(getComputedStyle(el.querySelector('.td-checkmark-icon')).opacity).to.equal('0');

    // Click the native input → component re-renders (`checked` is observed) → `_applyStyles`
    // re-runs and expresses the new state, no adopted sheet required. (Re-render replaces the
    // child nodes, so re-query the LIVE checkmark/icon afterwards.)
    el.querySelector('.td-checkbox-input').click();
    expect(el.hasAttribute('checked')).to.equal(true);

    const checkmark = el.querySelector('.td-checkmark');
    const icon = el.querySelector('.td-checkmark-icon');
    expect(getComputedStyle(checkmark).backgroundColor, 'checked → green from CSSOM').to.equal('rgb(16, 185, 129)');
    expect(getComputedStyle(icon).opacity, 'checked → icon visible').to.equal('1');
  });
});
