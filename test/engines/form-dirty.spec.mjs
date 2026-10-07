/**
 * trackFormDirty() — the REAL beforeunload prompt in Chromium, Firefox and WebKit (v0.44.0, plan v0.44.0-confirm-dirty
 * M4). The WTR engines test covers the semantics with synthetic `beforeunload` events; this spec checks that a browser
 * actually shows its leave-page dialog (Playwright `dialog` of type `beforeunload`):
 *
 *   clean      a form the user only clicked (sticky activation) → no dialog on navigation.
 *   dirty      the user typed → navigation shows the dialog; dismiss → stays; then accept → leaves.
 *   reverted   typed then deleted back → no dialog (handler recomputes; listener disarmed).
 *   saved      typed then markClean() → no dialog.
 *   submit     a native submit of the dirty form navigates without a dialog.
 *   affix      v0.55.0: td-input-field / td-number-input with prefix / suffix / icons / a [slot] button — pressing the slot
 *              button and changing affix attributes / locale at run time is never dirty (no dialog); typing is.
 *
 * WebKit: best-effort — when Playwright's WebKit does not raise the dialog for a dirty page, it is noted, not failed.
 * Run: npm run test:engines
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { ORIGIN, createReport, launchOptions, freshPage } from './v044-harness.mjs';

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<script type="module">
  import { trackFormDirty } from '${ORIGIN}/src/utils/form-validation.js';
  window.tracker = trackFormDirty(document.getElementById('f'));
  window.__ready = true;
</script></head><body>
<form id="f" action="${ORIGIN}/other" method="get"><input id="title" name="title" value="A"><button id="go">Lưu</button></form>
</body></html>`;

const AFFIX_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  import { trackFormDirty } from '${ORIGIN}/src/utils/form-validation.js';
  import '${ORIGIN}/src/form/td-input-field.js';
  import '${ORIGIN}/src/form/td-number-input.js';
  await Promise.all([customElements.whenDefined('td-input-field'), customElements.whenDefined('td-number-input')]);
  window.tracker = trackFormDirty(document.getElementById('f'));
  window.__ready = true;
</script></head><body>
<form id="f" action="${ORIGIN}/other" method="get">
  <td-input-field id="site" name="site" label="Website" prefix="https://" value="congty"><button type="button" slot="suffix" id="sb">x</button></td-input-field>
  <td-number-input id="price" name="price" label="Giá" suffix="₫" suffix-icon="lock" value="1000"></td-number-input>
</form>
</body></html>`;

const report = createReport('Form dirty beforeunload engines');
const { check, notes } = report;

/** navigate away; resolves with the dialogs seen (dismissed when `dismiss`, else accepted) */
async function leave(page, { dismiss = false } = {}) {
  const seen = [];
  const onDialog = (d) => {
    seen.push(d.type());
    (dismiss ? d.dismiss() : d.accept()).catch(() => {});
  };
  page.on('dialog', onDialog);
  try {
    await page.goto(`${ORIGIN}/other`, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(150);
  } finally { page.off('dialog', onDialog); }
  return { seen, left: page.url().endsWith('/other') };
}

async function runEngine(name, launcher) {
  let browser;
  try {
    browser = await launcher.launch(await launchOptions(name, launcher, notes));
  } catch (e) {
    report.fail(`${name}: cannot launch (${e.message.split('\n')[0]})`);
    return;
  }
  const best = name === 'webkit';
  const soft = (label, ok, detail) => {
    if (best && !ok) notes.push(`${name}: ${label} — not raised by Playwright WebKit (best-effort) ${detail || ''}`);
    else check(label, ok, detail);
  };
  try {
    // clean
    let { page, context } = await freshPage(browser, PAGE);
    await page.click('#title');
    let r = await leave(page);
    check(`${name} clean: no dialog`, r.seen.length === 0 && r.left, JSON.stringify(r));
    await context.close();

    // dirty: dismiss stays, accept leaves
    ({ page, context } = await freshPage(browser, PAGE));
    await page.click('#title');
    await page.keyboard.type('Z');
    r = await leave(page, { dismiss: true });
    soft(`${name} dirty: dialog shown, dismiss stays`, r.seen.includes('beforeunload') && !r.left, JSON.stringify(r));
    if (!r.left) {
      r = await leave(page);
      soft(`${name} dirty: accept leaves`, r.seen.includes('beforeunload') && r.left, JSON.stringify(r));
    }
    await context.close();

    // reverted
    ({ page, context } = await freshPage(browser, PAGE));
    await page.click('#title');
    await page.keyboard.press('End');
    await page.keyboard.type('Z');
    await page.keyboard.press('Backspace');
    r = await leave(page);
    check(`${name} reverted: no dialog`, r.seen.length === 0 && r.left, JSON.stringify(r));
    await context.close();

    // saved
    ({ page, context } = await freshPage(browser, PAGE));
    await page.click('#title');
    await page.keyboard.type('Z');
    await page.evaluate(() => window.tracker.markClean());
    r = await leave(page);
    check(`${name} saved (markClean): no dialog`, r.seen.length === 0 && r.left, JSON.stringify(r));
    await context.close();

    // native submit
    ({ page, context } = await freshPage(browser, PAGE));
    await page.click('#title');
    await page.keyboard.type('Z');
    const seen = [];
    page.on('dialog', (d) => { seen.push(d.type()); d.accept().catch(() => {}); });
    await Promise.all([page.waitForURL(/\/other\?title=/, { timeout: 4000 }).catch(() => {}), page.click('#go')]);
    check(`${name} native submit: navigates without a dialog`, seen.length === 0 && /\/other\?title=AZ|\/other\?title=ZA/.test(page.url()), `${page.url()} ${seen}`);
    await context.close();

    // v0.55.0 affix: slot button press + affix / locale changes are not edits; typing is
    ({ page, context } = await freshPage(browser, AFFIX_PAGE));
    await page.click('#sb');
    await page.click('#price .td-number__affix--suffix');
    await page.evaluate(() => {
      document.getElementById('site').setAttribute('suffix', '.vn');
      document.getElementById('site').setAttribute('prefix-icon', 'link');
      document.getElementById('price').setAttribute('locale', 'en');
    });
    const dirty = await page.evaluate(() => window.tracker.isDirty());
    r = await leave(page);
    check(`${name} affix: slot press + affix / locale changes → not dirty, no dialog`, !dirty && r.seen.length === 0 && r.left, JSON.stringify({ dirty, ...r }));
    await context.close();
    ({ page, context } = await freshPage(browser, AFFIX_PAGE));
    await page.click('#site .td-field__control');
    await page.keyboard.type('Z');
    const typed = await page.evaluate(() => window.tracker.isDirty());
    check(`${name} affix: typing in the boxed control is dirty`, typed, String(typed));
    r = await leave(page, { dismiss: true });
    soft(`${name} affix dirty: dialog shown`, r.seen.includes('beforeunload'), JSON.stringify(r));
    await context.close();
  } finally {
    await browser.close();
  }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
await runEngine('webkit', webkit);
report.finish();
