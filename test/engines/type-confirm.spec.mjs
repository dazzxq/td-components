/**
 * TdModal.confirm({ typeToConfirm }) with REAL input in Chromium, Firefox and WebKit (v0.44.0, plan
 * v0.44.0-confirm-dirty M2). The WTR engines test (src/feedback/td-v044-type-confirm.engines.browser-test.js) covers the
 * behaviour with sendKeys + a synthetic composition; this spec covers what only Playwright's page API produces:
 *
 *   type       keyboard.type('XOA') → unlocked; Enter → resolves true.
 *   insert     keyboard.insertText('XOA') (Firefox delivers it as an IME composition commit) → unlocked.
 *   ime        CHROMIUM ONLY: a real IME composition through CDP (`Input.imeSetComposition`) — the Enter pressed while
 *              composing confirms nothing; the committed text (`Input.insertText`) unlocks. Firefox / WebKit have no
 *              automated IME API: the synthetic composition contract runs in all three engines in the WTR test.
 *
 * Run: npm run test:engines
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { ORIGIN, createReport, launchOptions, freshPage } from './v044-harness.mjs';

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  import { TdModal } from '${ORIGIN}/src/feedback/td-modal.js';
  window.TdModal = TdModal;
  window.__ready = true;
</script></head><body><button type="button" id="opener">Mở</button></body></html>`;

const report = createReport('Type-to-confirm engines');
const { check, notes } = report;

/** Open a confirm with phrase XOA; resolves once the field has the focus. */
async function openConfirm(page) {
  await page.evaluate(() => {
    window.__result = undefined;
    window.TdModal.confirm({ title: 'Xoá?', message: 'Không thể hoàn tác.', typeToConfirm: 'XOA', confirmVariant: 'danger' })
      .then((v) => { window.__result = v; });
  });
  await page.waitForFunction(() => document.activeElement?.matches?.('.td-modal__confirm-field input'));
}
const locked = (page) => page.evaluate(() => [...document.querySelectorAll('.td-modal:not([data-state="closing"]) .td-modal__footer button')]
  .pop().getAttribute('aria-disabled') === 'true');

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher, notes));
  } catch (e) {
    report.fail(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  try {
    const { page, context } = await freshPage(browser, PAGE);

    // --- type + Enter ---
    await openConfirm(page);
    await page.keyboard.type('XO', { delay: 0 });
    check(`${name} type: partial phrase stays locked`, await locked(page));
    await page.keyboard.type('A', { delay: 0 });
    await page.waitForFunction(() => !document.querySelector('.td-modal:not([data-state="closing"]) .td-modal__footer button:last-child').hasAttribute('aria-disabled'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__result !== undefined);
    check(`${name} type: Enter on a match resolves true`, (await page.evaluate(() => window.__result)) === true);

    // --- insertText (paste / IME commit) ---
    await openConfirm(page);
    await page.keyboard.insertText('XOA');
    await page.waitForFunction(() => !document.querySelector('.td-modal:not([data-state="closing"]) .td-modal__footer button:last-child').hasAttribute('aria-disabled'));
    check(`${name} insertText: unlocked`, !(await locked(page)));
    await page.evaluate(() => window.TdModal.closeAll());

    // --- real IME (Chromium only) ---
    if (name === 'chromium') {
      await openConfirm(page);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: 'XOA', selectionStart: 3, selectionEnd: 3 });
      check(`${name} IME: composing text does not unlock`, await locked(page));
      await page.keyboard.press('Enter');
      await cdp.send('Input.insertText', { text: 'XOA' });
      await page.waitForFunction(() => !document.querySelector('.td-modal:not([data-state="closing"]) .td-modal__footer button:last-child').hasAttribute('aria-disabled'));
      const s = await page.evaluate(() => ({ result: window.__result, open: !!document.querySelector('.td-modal:not([data-state="closing"])') }));
      check(`${name} IME: Enter while composing confirms nothing; the commit unlocks`, s.result === undefined && s.open, JSON.stringify(s));
      await cdp.detach();
      await page.evaluate(() => window.TdModal.closeAll());
    } else {
      notes.push(`${name}: no automated IME API — composition covered by the synthetic contract (WTR)`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
await runEngine('webkit', webkit);
report.finish();
