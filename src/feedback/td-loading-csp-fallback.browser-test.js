/**
 * REGRESSION GUARD — codex ISSUE-1 (CSP-strict structural fallback for td-loading).
 *
 * The CSP parity gate (test/csp/csp.spec.mjs) runs in Chromium WITH
 * `adoptedStyleSheets` support, so it can never catch the case it was written to
 * protect: a browser where `adoptStyles()` returns `false` (SSR / pre-Chromium-73 /
 * pre-Safari-16.4 / pre-Firefox-101) and the adopted constructable sheet is therefore
 * ABSENT. The documented adopt-styles contract is that ONLY selector/keyframe
 * EMBELLISHMENTS degrade — the component must still render STRUCTURALLY (correct paint
 * + layout, visible).
 *
 * Previously td-loading's overlay shipped its LOAD-BEARING structure (SVG paint + card
 * /container layout) inside the adopted sheet, so without the sheet the spinner lost
 * its stroke and its 56px box. The fix moves all structure to SVG presentation
 * ATTRIBUTES (paint) + CSSOM `element.style.*` (layout), leaving ONLY `@keyframes`,
 * the `animation:` declarations, and the reduced-motion `@media` in the sheet.
 *
 * This test FORCES the fallback by clearing `document.adoptedStyleSheets = []` AFTER
 * the spinner is built, then asserts the spinner is STILL structurally rendered. It
 * does NOT assert animation liveness — losing the spin is the one acceptable
 * degradation; the gate already proves liveness under Chromium.
 */
import { expect } from '@esm-bundle/chai';
import { TdLoading, TdLoadingSpinner } from './td-loading.js';

/** Resolve after `n` animation frames so layout + adopted styles have settled. */
function raf(n = 2) {
    return new Promise((resolve) => {
        const tick = (left) =>
            left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1));
        tick(n);
    });
}

describe('td-loading — structural fallback without adoptedStyleSheets (codex ISSUE-1)', () => {
    afterEach(() => {
        TdLoading.hide();
        if (TdLoading.element) {
            TdLoading.element.remove();
            TdLoading.element = null;
        }
        // Drop the per-document adopt-styles registry so each test re-adopts cleanly.
        if (document.__tdAdopted) delete document.__tdAdopted;
        document.adoptedStyleSheets = [];
        document.querySelectorAll('.td-spinner').forEach((n) => n.remove());
    });

    it('overlay spinner stays structurally rendered after the adopted sheet is cleared', async () => {
        TdLoading.show('test');
        await raf();

        // Force the unsupported-browser path: remove the adopted constructable sheet.
        document.adoptedStyleSheets = [];
        expect(document.adoptedStyleSheets.length).to.equal(0);
        await raf();

        const overlay = TdLoading.element;
        expect(overlay, 'overlay element exists').to.not.equal(null);

        const card = overlay.querySelector('.td-loading-card');
        const container = overlay.querySelector('.td-circular-spinner');
        const track = overlay.querySelector('.td-spinner-track');
        const arc = overlay.querySelector('.td-spinner-arc');
        expect(card && container && track && arc, 'all spinner nodes present').to.be.ok;

        // (1) Card is laid out via CSSOM — display:flex survives without the sheet.
        expect(getComputedStyle(card).display).to.equal('flex');

        // (2) Spinner container has its 56px box via CSSOM — non-zero, ~56px.
        const cRect = container.getBoundingClientRect();
        expect(cRect.width).to.be.greaterThan(0);
        expect(cRect.height).to.be.greaterThan(0);
        expect(Math.round(cRect.width)).to.equal(56);
        expect(Math.round(cRect.height)).to.equal(56);

        // (3) Arc paint comes from SVG presentation attributes — visible stroke + width.
        const arcCs = getComputedStyle(arc);
        expect(arcCs.stroke).to.not.equal('none');
        expect(arcCs.stroke).to.not.equal('');
        expect(arcCs.stroke).to.equal('rgb(59, 130, 246)');
        expect(arcCs.strokeWidth).to.equal('4px');

        // Track paint also survives from attributes (translucent blue, not none).
        const trackCs = getComputedStyle(track);
        expect(trackCs.stroke).to.not.equal('none');
        expect(trackCs.strokeWidth).to.equal('4px');
    });

    it('inline spinner stays structurally rendered after the adopted sheet is cleared', async () => {
        const spinner = TdLoadingSpinner.create({ size: 'md' });
        document.body.appendChild(spinner);
        await raf();

        document.adoptedStyleSheets = [];
        expect(document.adoptedStyleSheets.length).to.equal(0);
        await raf();

        // (1) Container size from CSSOM cssText — md = 32px, non-zero.
        const rect = spinner.getBoundingClientRect();
        expect(rect.width).to.be.greaterThan(0);
        expect(rect.height).to.be.greaterThan(0);
        expect(Math.round(rect.width)).to.equal(32);
        expect(Math.round(rect.height)).to.equal(32);
        expect(getComputedStyle(spinner).display).to.equal('inline-block');

        // (2) Arc paint from SVG attributes — visible stroke, correct width.
        const arc = spinner.querySelector('svg circle:last-child');
        const arcCs = getComputedStyle(arc);
        expect(arcCs.stroke).to.not.equal('none');
        expect(arcCs.stroke).to.not.equal('');
        expect(arcCs.stroke).to.equal('rgb(59, 130, 246)');
        expect(arcCs.strokeWidth).to.equal('4px');

        spinner.remove();
    });

    it('inline spinner honours a caller color in the fallback (safeColor + SVG attr)', async () => {
        const spinner = TdLoadingSpinner.create({ size: 'lg', color: '#10b981' });
        document.body.appendChild(spinner);
        await raf();

        document.adoptedStyleSheets = [];
        await raf();

        const arc = spinner.querySelector('svg circle:last-child');
        expect(getComputedStyle(arc).stroke).to.equal('rgb(16, 185, 129)');

        spinner.remove();
    });
});
