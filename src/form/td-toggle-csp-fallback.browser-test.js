import { expect } from '@esm-bundle/chai';
import './td-toggle.js';

/**
 * Forced-fallback regression guard for codex-impl-review ISSUE-1.
 *
 * The CSP gate runs in Chromium WITH `adoptedStyleSheets`, so it can never catch a
 * structural rule that lives ONLY in the adopted constructable sheet. This suite upgrades
 * a `<td-toggle>`, then RIPS the adopted sheet out (`document.adoptedStyleSheets = []`) to
 * emulate a browser without constructable-stylesheet support. The component MUST still be
 * structurally usable AND still convey its on/off state from CSSOM/Tailwind alone — only
 * the `transition` smoothing (the sole thing left in the sheet) may degrade.
 */

const container = document.createElement('div');
document.body.appendChild(container);

function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}

// Strip every adopted sheet from the document — simulates a browser where
// `adoptStyles()` returned false and adopted nothing. Returns nothing once it asserts.
function clearAdoptedSheets() {
  document.adoptedStyleSheets = [];
  expect(document.adoptedStyleSheets.length).to.equal(0);
}

afterEach(() => {
  container.innerHTML = '';
  // Restore a clean slate so a stripped run can't leak into the next test.
  document.adoptedStyleSheets = [];
  if (document.__tdAdopted) document.__tdAdopted.delete('td-toggle');
});

describe('td-toggle structural fallback without adoptedStyleSheets (ISSUE-1)', () => {
  it('checked: track + thumb stay structural and the ON state shows from CSSOM', () => {
    const el = mount('<td-toggle checked color="#10b981"></td-toggle>');
    // Element upgraded synchronously on insertion; confirm it rendered.
    expect(el.querySelector('.td-toggle-track')).to.not.equal(null);

    // Emulate the unsupported-browser path: drop the adopted enhancement sheet entirely.
    clearAdoptedSheets();

    const track = el.querySelector('.td-toggle-track');
    const thumb = el.querySelector('.td-toggle-thumb');

    const trackCS = getComputedStyle(track);
    const thumbCS = getComputedStyle(thumb);

    // --- Track is the positioning context and lays out inline (NOT default static/block).
    expect(trackCS.position).to.equal('relative');
    expect(trackCS.display).to.equal('inline-block');
    // Sized, not collapsed.
    expect(parseFloat(trackCS.width)).to.be.greaterThan(0);
    expect(parseFloat(trackCS.height)).to.be.greaterThan(0);

    // --- Thumb is absolutely positioned + flex-centered (NOT default static).
    expect(thumbCS.position).to.equal('absolute');
    expect(thumbCS.display).to.equal('flex');
    expect(parseFloat(thumbCS.width)).to.be.greaterThan(0);

    // --- CHECKED state #1: thumb translated to the "on" position (non-identity transform).
    const t = thumbCS.transform;
    expect(t).to.be.a('string');
    expect(t).to.not.equal('none');
    // A real translate produces a non-identity matrix with a non-zero X translation.
    const m = t.match(/^matrix\(([^)]+)\)$/);
    expect(m, `expected a matrix() transform, got "${t}"`).to.not.equal(null);
    const tx = parseFloat(m[1].split(',')[4]);
    expect(Math.abs(tx)).to.be.greaterThan(1);

    // --- CHECKED state #2: track shows the custom green, not the default off tint.
    // The active background is a green linear-gradient → reported on background-image.
    const bgImage = trackCS.backgroundImage;
    expect(bgImage).to.contain('gradient');
    // The off state is a flat translucent black with NO gradient; assert green is present.
    // #10b981 → rgb(16, 185, 129). Match the dominant green channel to avoid brittleness.
    expect(bgImage).to.match(/rgba?\(\s*1[0-9],\s*18[0-9],\s*1[0-9][0-9]/);
  });

  it('unchecked: thumb sits at the OFF position with no translate after the sheet is cleared', () => {
    const el = mount('<td-toggle color="#10b981"></td-toggle>');
    expect(el.querySelector('.td-toggle-thumb')).to.not.equal(null);

    clearAdoptedSheets();

    const thumb = el.querySelector('.td-toggle-thumb');
    const thumbCS = getComputedStyle(thumb);

    // Still structural.
    expect(thumbCS.position).to.equal('absolute');
    expect(thumbCS.display).to.equal('flex');

    // OFF position: transform is the identity ("none" → no matrix, or a zero translate).
    const t = thumbCS.transform;
    if (t !== 'none') {
      const m = t.match(/^matrix\(([^)]+)\)$/);
      const tx = m ? parseFloat(m[1].split(',')[4]) : 0;
      expect(Math.abs(tx)).to.be.lessThan(0.5);
    }

    // Track shows the OFF tint, not the green gradient.
    const track = el.querySelector('.td-toggle-track');
    const bgImage = getComputedStyle(track).backgroundImage;
    expect(bgImage).to.equal('none');
  });

  it('toggling AFTER the sheet is cleared still moves the thumb via CSSOM', () => {
    const el = mount('<td-toggle color="#10b981"></td-toggle>');
    clearAdoptedSheets();

    const thumb = el.querySelector('.td-toggle-thumb');
    // Off first.
    const before = getComputedStyle(thumb).transform;
    const txBefore = before === 'none' ? 0 : parseFloat(before.match(/matrix\(([^)]+)\)/)[1].split(',')[4]);
    expect(Math.abs(txBefore)).to.be.lessThan(0.5);

    // Flip via the lightweight _updateToggleState() path (checked attr change).
    el.setAttribute('checked', '');
    const after = getComputedStyle(thumb).transform;
    expect(after).to.not.equal('none');
    const txAfter = parseFloat(after.match(/matrix\(([^)]+)\)/)[1].split(',')[4]);
    expect(Math.abs(txAfter)).to.be.greaterThan(1);
  });
});
