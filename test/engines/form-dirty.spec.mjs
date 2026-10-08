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
 *   floating   v0.58.0: td-input-field label-mode="floating" — a click on the label (focus via <label for>), blur and
 *              switching label-mode at run time are never dirty; typing then deleting back is clean, typing is dirty.
 *   v059       v0.59.0: `signed` / `clearable` / `allow-open-end` / `hide-single-page` switched from code after a click → not
 *              dirty; the clear button of td-datetime-picker → dirty (dialog); typing in a `signed` number then deleting back
 *              → clean; "Không hạn" + "Chọn" in td-datetime-range → dirty.
 *   repeater   v0.56.0 (plan v0.56.0-repeater-icons-date R5): td-repeater `value =` / `readonly` / `disabled` from code
 *              after a click → no dialog; the user typed, then `disabled` from code took the fields out → dialog.
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
  <td-input-field id="fl" name="fl" label="Họ tên" label-mode="floating"></td-input-field>
</form>
</body></html>`;

const V059_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="${ORIGIN}/td.css">
<script type="module">
  import { trackFormDirty } from '${ORIGIN}/src/utils/form-validation.js';
  import '${ORIGIN}/src/form/td-number-input.js';
  import '${ORIGIN}/src/form/td-datetime-picker.js';
  import '${ORIGIN}/src/form/td-datetime-range.js';
  import '${ORIGIN}/src/display/td-table.js';
  await Promise.all(['td-number-input', 'td-datetime-picker', 'td-datetime-range', 'td-table'].map((t) => customElements.whenDefined(t)));
  const t = document.getElementById('tb');
  t.columns = [{ key: 'a', label: 'A' }];
  t.data = [{ a: 1 }];
  window.tracker = trackFormDirty(document.getElementById('f'));
  window.__ready = true;
</script></head><body>
<form id="f" action="${ORIGIN}/other" method="get">
  <td-number-input id="sg" name="sg" label="Chênh" min="-100" value="5"></td-number-input>
  <td-datetime-picker id="dc" name="dc" mode="date" value="15/06/2026" label="Hạn"></td-datetime-picker>
  <td-datetime-range id="ro" name="ro" label="Hiệu lực" start="01/10/2026" end="05/10/2026"></td-datetime-range>
  <td-table id="tb"></td-table>
</form>
</body></html>`;

const REPEATER_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<script type="module">
  import { trackFormDirty } from '${ORIGIN}/src/utils/form-validation.js';
  import '${ORIGIN}/src/form/td-repeater.js';
  await customElements.whenDefined('td-repeater');
  window.tracker = trackFormDirty(document.getElementById('f'));
  window.__ready = true;
</script></head><body>
<form id="f" action="${ORIGIN}/other" method="get"><td-repeater label="Dòng"><template><div data-td-row><input data-td-field="a" name="items[]"></div></template>
<div data-td-row><input id="a0" data-td-field="a" name="items[]" value="a"></div></td-repeater><button id="go">Lưu</button></form>
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

    // v0.58.0 floating label: label click / blur / label-mode switch are not edits; typing is, reverting is clean
    ({ page, context } = await freshPage(browser, AFFIX_PAGE));
    await page.click('#fl .td-field__label');
    const flFocused = await page.evaluate(() => document.activeElement === document.querySelector('#fl .td-field__control'));
    await page.evaluate(() => {
      document.querySelector('#fl .td-field__control').blur();
      document.getElementById('fl').labelMode = 'top';
      document.getElementById('fl').labelMode = 'floating';
    });
    const flDirty = await page.evaluate(() => window.tracker.isDirty());
    r = await leave(page);
    check(`${name} floating: label click focuses, label / blur / mode switch → not dirty, no dialog`, flFocused && !flDirty && r.seen.length === 0 && r.left, JSON.stringify({ flFocused, flDirty, ...r }));
    await context.close();
    ({ page, context } = await freshPage(browser, AFFIX_PAGE));
    await page.click('#fl .td-field__label');
    await page.keyboard.type('Z');
    const flTyped = await page.evaluate(() => window.tracker.isDirty());
    await page.keyboard.press('Backspace');
    const flReverted = await page.evaluate(() => window.tracker.isDirty());
    check(`${name} floating: typing is dirty, deleting back is clean`, flTyped && !flReverted, JSON.stringify({ flTyped, flReverted }));
    await context.close();

    // v0.59.0: the new options from code are not edits; the clear button / "Không hạn" + "Chọn" are; signed revert is clean
    ({ page, context } = await freshPage(browser, V059_PAGE));
    await page.click('#sg .td-number__control');
    await page.evaluate(() => {
      document.getElementById('sg').signed = true;
      document.getElementById('dc').clearable = true;
      document.getElementById('ro').allowOpenEnd = true;
      document.getElementById('tb').hideSinglePage = true;
      document.getElementById('sg').signed = false;
      document.getElementById('dc').clearable = false;
      document.getElementById('ro').allowOpenEnd = false;
    });
    const optDirty = await page.evaluate(() => window.tracker.isDirty());
    r = await leave(page);
    check(`${name} v059: options switched from code → not dirty, no dialog`, !optDirty && r.seen.length === 0 && r.left, JSON.stringify({ optDirty, ...r }));
    await context.close();
    ({ page, context } = await freshPage(browser, V059_PAGE));
    await page.evaluate(() => { document.getElementById('dc').clearable = true; });
    await page.click('#dc .td-dtp__clear');
    const cleared = await page.evaluate(() => window.tracker.isDirty());
    check(`${name} v059: the date clear button is dirty`, cleared, String(cleared));
    r = await leave(page, { dismiss: true });
    soft(`${name} v059 clear dirty: dialog shown`, r.seen.includes('beforeunload'), JSON.stringify(r));
    await context.close();
    ({ page, context } = await freshPage(browser, V059_PAGE));
    await page.evaluate(() => { document.getElementById('sg').signed = true; });
    await page.click('#sg .td-number__control');
    await page.keyboard.press('End');
    await page.keyboard.type('1');
    const sgTyped = await page.evaluate(() => [window.tracker.isDirty(), document.querySelector('#sg .td-number__control').value]);
    await page.keyboard.press('Backspace');
    const sgReverted = await page.evaluate(() => window.tracker.isDirty());
    check(`${name} v059: signed typing is dirty, deleting back is clean`, sgTyped[0] && sgTyped[1] === '+51' && !sgReverted, JSON.stringify({ sgTyped, sgReverted }));
    await context.close();
    ({ page, context } = await freshPage(browser, V059_PAGE));
    await page.evaluate(() => { document.getElementById('ro').allowOpenEnd = true; });
    await page.click('#ro .td-dtr__trigger');
    await page.waitForSelector('.td-dtr-panel__open-end', { timeout: 4000 }).catch(() => {});
    await page.click('.td-dtr-panel__open-end').catch(() => {});
    await page.click('.td-modal__footer .td-btn--primary').catch(() => {});
    await page.waitForTimeout(200);
    const openEnd = await page.evaluate(() => [window.tracker.isDirty(), new FormData(document.getElementById('f')).get('ro[end]')]);
    check(`${name} v059: "Không hạn" + "Chọn" is dirty (end submitted empty)`, openEnd[0] === true && openEnd[1] === '', JSON.stringify(openEnd));
    await context.close();

    // v0.56.0 repeater: code changes never count; disabled after a user edit does (fields leave FormData)
    ({ page, context } = await freshPage(browser, REPEATER_PAGE));
    await page.click('#a0');
    await page.evaluate(() => {
      const rep = document.querySelector('td-repeater');
      rep.value = [{ a: 'x' }, { a: 'y' }];
      rep.readonly = true;
      rep.readonly = false;
      rep.disabled = true;
    });
    r = await leave(page);
    check(`${name} repeater value / readonly / disabled from code: no dialog`, r.seen.length === 0 && r.left, JSON.stringify(r));
    await context.close();

    ({ page, context } = await freshPage(browser, REPEATER_PAGE));
    await page.click('#a0');
    await page.keyboard.type('Z');
    await page.keyboard.press('Backspace');
    // the edit was undone (Z, Backspace): the tracker may already have computed "clean" and disarmed beforeunload in its
    // per-frame batch (Linux Firefox CI) — a change made by CODE re-arms only through check() (form-dirty contract), so
    // assert the fresh state first, then check() like an app does after locking
    const dirtyNow = await page.evaluate(() => {
      document.querySelector('td-repeater').disabled = true;
      return window.tracker.isDirty();
    });
    check(`${name} repeater disabled after a user edit: isDirty() (fields left FormData)`, dirtyNow === true, String(dirtyNow));
    await page.evaluate(() => window.tracker.check());
    r = await leave(page, { dismiss: true });
    soft(`${name} repeater disabled after a user edit: dialog (fields left FormData)`, r.seen.includes('beforeunload') && !r.left, JSON.stringify(r));
    await context.close();
  } finally {
    await browser.close();
  }
}

await runEngine('chromium', chromium);
await runEngine('firefox', firefox);
await runEngine('webkit', webkit);
report.finish();
