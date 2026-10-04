// Hover-intent helper of the responsive gate (test/responsive/responsive.spec.mjs).
/**
 * Hover with intent, on real signals (CI run 37201806355: firefox-360 hovercard "did not open").
 * A hover-intent popup (hovercard 350 ms, tooltip) opens only if the pointer is STILL on the trigger when the delay
 * ends. Any layout shift during that window moves the trigger from under a resting pointer → the engine dispatches a
 * synthetic pointerout → the intent is cancelled (correct product behaviour, all 3 engines). Under CI load the page
 * can still be settling (settle() gives up after 4 s), so:
 *   1. scroll the trigger into view, then wait (rAF polling) until its rect is unchanged for 5 frames AND it is the
 *      element under its own centre (not covered);
 *   2. hover, then wait for the popup's open signal; if the trigger fired pointerout without the pointer having left
 *      (the layout moved it), re-stabilise and hover once more — a real user re-aims the same way;
 *   3. a popup that still does not open with a stable, uncovered trigger under the pointer is a real failure.
 */
export async function hoverIntent(page, sel, openSel, notes = []) {
  const trigger = page.locator(sel);
  for (let attempt = 1; attempt <= 2; attempt++) {
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForFunction((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const key = `${r.left},${r.top},${r.width},${r.height}`;
      const st = (window.__tdHoverStable ||= { key: '', n: 0 });
      st.n = st.key === key ? st.n + 1 : 0;
      st.key = key;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return st.n >= 5 && !!hit && (hit === el || el.contains(hit));
    }, sel, { polling: 'raf', timeout: 8000 });
    await page.evaluate((s) => {
      window.__tdHoverStable = null;
      window.__tdHoverOut = false;
      document.querySelector(s).addEventListener('pointerout', (e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) window.__tdHoverOut = true;
      }, { once: false });
    }, sel);
    await trigger.hover();
    const opened = await page.locator(openSel).last().waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
    if (opened) return;
    const displaced = await page.evaluate(() => window.__tdHoverOut === true);
    if (!displaced || attempt === 2) return; // the caller's waitFor reports "did not open"
    notes.push(`${sel}: layout moved the trigger from under the pointer during the hover intent — re-hovered once`);
    await page.mouse.move(0, 0);
  }
}

