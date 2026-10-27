#!/usr/bin/env node
/**
 * Visual gate — td-media-picker + td-media-grid justified (v0.33.0, plan docs/internal/plans/
 * v0.33.0-media-picker-dcms-parity.md "Ảnh chụp / so sánh trực quan").
 *
 * Chromium only. Screenshots the picker (driven through its PUBLIC API: TdMediaPicker.open + the mock adapter of
 * test/fixtures/media-adapter.js, no network) at 1440×900 and 390×844 in 6 states — open, selected, multiple, upload
 * dialog, URL error, delete blocked, v0.35 crop step — plus a justified td-media-grid at 1280 and 390 wide (14 images), and
 * (v0.35) an inline td-cropper + a croppable td-media-field with its crop preview at 1280, and compares each
 * with test/visual/baseline/linux-chromium/<name>.png: a pixel differs when any RGB channel differs by > 16; a shot
 * fails when > 0.5% of its pixels differ (or its size differs). Motion off: `reducedMotion: 'reduce'`, animations /
 * transitions disabled, `caret-color: transparent`.
 *
 * ONE reference platform: the official image mcr.microsoft.com/playwright:v<playwright-core version>-jammy (its fonts
 * + the Chromium build pinned by playwright-core) — CI job `visual` of .github/workflows/test.yml runs in it. Fonts
 * render differently on macOS, so anywhere else (other OS, other Chromium build) the script prints a skip message and
 * exits 0 (1 with TD_VISUAL_STRICT=1 or --update) — it never compares there. Not part of `npm test`.
 *
 *   npm run test:visual                    compare (CI: job `visual`, Playwright image)
 *   npm run test:visual -- --update        (re)write the baselines — Linux only: run the "update visual baselines"
 *                                          workflow (workflow_dispatch) and commit the artifact, or run inside
 *                                          mcr.microsoft.com/playwright:v<playwright-core version>-jammy
 *   TD_VISUAL_FORCE=1                      run even off the reference platform (debugging only; never commit those PNGs)
 *   TD_VISUAL_OUT=<dir>                    where actual PNGs of failing / unbaselined shots go (default: <tmp>/td-visual)
 *
 * A shot with no baseline fails the compare run (its actual PNG is saved to TD_VISUAL_OUT). TD_VISUAL_STRICT=1 (set in
 * CI) additionally turns a SKIP into a failure, so the gate can never silently pass off the reference platform; `--update`
 * always fails instead of skipping. The pinned build is matched on major.minor.build: Playwright's arm64 Linux builds
 * report the same build with patch 0 (e.g. 148.0.7778.0 vs browsers.json 148.0.7778.96); the revision itself is
 * enforced by chromium.executablePath() (revision-specific path) existing.
 * The v0.33.0 baselines were captured in the linux/arm64 variant of mcr.microsoft.com/playwright:v1.60.0-jammy (Apple
 * Silicon host: the amd64 image under QEMU crashes Chromium); CI runs the amd64 variant. If the `visual` job reports
 * diffs that are pure rasterisation noise, regenerate with the "update visual baselines" workflow (amd64) and commit.
 * No dependencies: PNGs are decoded with node:zlib (test/visual/png.mjs).
 */
import { ORIGIN, FREEZE_CSS, startGate, newPage, settle, check, failures, finish } from './lib.mjs';

// Guard / page routing / compare plumbing live in ./lib.mjs (shared with dropdown.visual.mjs since v0.84.0).
const { browser, version } = await startGate('test/visual/media-picker.visual.mjs');


const PICKER_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS}</style>
<script type="module">
  import { TdMediaPicker } from '${ORIGIN}/src/feedback/td-media-picker.js';
  import { createMockAdapter } from '${ORIGIN}/test/fixtures/media-adapter.js';
  window.TdMediaPicker = TdMediaPicker;
  window.createMockAdapter = createMockAdapter;
  window.__ready = true;
</script>
</head><body><main></main></body></html>`;

// Justified grid: 24 items with mixed aspect ratios declared up front (data-td-ar), so the first pack is final and
// nothing depends on the SVG fixtures' intrinsic sizes.
const RATIOS = ['3/2', '2/3', '1', '3/1', '4/3', '3/4', '16/9', '1', '2/3', '3/2', '5/4', '9/16',
  '3/2', '1', '2/1', '2/3', '4/3', '3/2', '1/2', '16/9', '1', '3/2', '2/3', '4/3'];
const GRID_ITEMS = RATIOS.map((ar, i) => `<div data-td-media-item data-id="g${i + 1}" data-td-ar="${ar}">`
  + `<button type="button" data-td-media-open aria-label="Ảnh ${i + 1}">`
  + `<img src="${ORIGIN}/test/fixtures/${(i % 4) + 1}.svg" alt=""></button></div>`).join('');
const GRID_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS} main { padding: 16px; }</style>
<script type="module">
  await import('${ORIGIN}/src/display/td-media-grid.js');
  window.__ready = true;
</script>
</head><body><main><td-media-grid layout="justified" label="Ảnh">${GRID_ITEMS}</td-media-grid></main></body></html>`;

// v0.35.0: an inline td-cropper (free, presets) + a croppable td-media-field showing its crop preview (CSSOM vars).
const CROP_PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/td.css">
<style>${FREEZE_CSS} main { padding: 16px; display: grid; gap: 24px; max-width: 960px; }</style>
<script type="module">
  await import('${ORIGIN}/src/form/td-cropper.js');
  await import('${ORIGIN}/src/form/td-media-field.js');
  const c = document.querySelector('td-cropper');
  if (c.getAttribute('data-state') !== 'ready') await new Promise((r) => c.addEventListener('image-ready', r, { once: true }));
  window.__ready = true;
</script>
</head><body><main>
<td-cropper src="${ORIGIN}/test/fixtures/crop-16x9.svg" natural-width="1600" natural-height="900" alt="Ảnh mẫu"
  crop='{"v":1,"x":0.1,"y":0.15,"width":0.6,"height":0.7}'></td-cropper>
<td-media-field name="og" label="Ảnh chia sẻ" usage croppable aspect-ratio="3/2" value="m1"
  preview-src="${ORIGIN}/test/fixtures/1.svg" crop='{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}'></td-media-field>
</main></body></html>`;

// =====================================================================================================================
// STATE DRIVERS — the only block that knows the picker's UI. The picker UI is v0.33 work in progress: when a label or
// selector changes, adjust it HERE (public API + roles / accessible names + the stable markup contract of
// td-media-grid: [data-td-media-item] / [data-td-media-open] / .td-media-grid__tick).
// =====================================================================================================================
const PICKER = 'body > .td-media-picker:not([data-state="closing"])';
const LABEL = {
  remove: 'Xoá', // the confirm dialog's button
};
const SEL = {
  uploadBtn: '.td-media-picker__upload-btn', // toolbar "Tải lên" (icon-only + aria-label under 768px)
  uploadDialog: 'body > .td-media-picker-upload:not([data-state="closing"])',
  urlTab: '.td-media-picker-upload .td-tabs__tab[data-tab-id="url"]', // tabs only exist when both sources are available
  urlInput: '.td-media-picker-upload__url input',
  deleteBtn: '.td-media-picker__delete', // detail action row; only rendered with capabilities.delete (opt-in)
  blocked: '.td-media-picker__blocked',
};
// Mock adapter: newest first (page 1 = m60 … m31); delete(id) → blocked when the numeric id % 7 === 3. m59 is an image
// on page 1.
const BLOCKED_ID = 'm59';

async function openPicker(page, selection = { mode: 'single' }, capabilities = undefined) {
  await page.evaluate(({ sel, caps }) => {
    window.__adapter = window.createMockAdapter();
    // v0.68.0: `autoSelectFirst` is ON by default; the baselines are the pre-0.68 state (nothing selected on open)
    const opts = { adapter: window.__adapter, selection: sel, autoSelectFirst: false };
    if (caps) opts.capabilities = caps;
    window.__outcome = window.TdMediaPicker.open(opts);
  }, { sel: selection, caps: capabilities });
  await page.locator(`${PICKER} [data-td-media-item]`).first().waitFor({ state: 'visible' });
}
const card = (page, id) => page.locator(`${PICKER} [data-td-media-item][data-id="${id}"]`);
const nthCard = (page, n) => page.locator(`${PICKER} [data-td-media-item]`).nth(n);
const picker = (page) => page.locator(PICKER);

/** The topmost dialog other than the picker (upload dialog, confirm). */
const topDialog = (page) => page.locator('body > .td-modal:not(.td-media-picker):not([data-state="closing"])').last();

async function openUploadDialog(page) {
  await picker(page).locator(SEL.uploadBtn).first().click();
  await page.locator(SEL.uploadDialog).waitFor({ state: 'visible' });
}

const STATES = {
  async open(page) {
    await openPicker(page);
  },
  async selected(page) {
    await openPicker(page);
    await nthCard(page, 1).locator('[data-td-media-open]').click();
  },
  async multiple(page) {
    await openPicker(page, { mode: 'multiple', maxItems: 10 });
    for (const n of [0, 1, 5]) await nthCard(page, n).locator('.td-media-grid__tick').click();
    // view one of them — wide only: under 768px the detail pane slides over the list and would hide the ticks
    if ((page.viewportSize()?.width ?? 0) >= 768) await nthCard(page, 5).locator('[data-td-media-open]').click();
    else {
      // ticking the 6th card scrolled the list: back to the top so all three checked cards are in the shot
      await nthCard(page, 0).evaluate((el) => {
        for (let n = el.parentElement; n; n = n.parentElement) if (n.scrollTop) n.scrollTop = 0;
      });
    }
  },
  async upload(page) {
    await openPicker(page);
    await openUploadDialog(page);
  },
  async 'url-error'(page) {
    await openPicker(page);
    await openUploadDialog(page);
    const dlg = page.locator(SEL.uploadDialog);
    await page.locator(SEL.urlTab).click(); // page-level: the selectors already name the dialog's root class
    const input = page.locator(SEL.urlInput);
    await input.fill('anh-khong-co-giao-thuc.jpg'); // new URL() throws → 'invalid' (ftp: would be 'scheme')
    await input.blur(); // validation error shows on blur, not while typing
    await dlg.getByText('URL không hợp lệ').first().waitFor({ state: 'visible' });
  },
  // v0.35.0: the crop step after "Chèn" (locked 1.91:1, focal point tool switched on) — nested crop dialog over the picker
  async 'crop-step'(page) {
    await page.evaluate(() => {
      window.__adapter = window.createMockAdapter();
      window.__outcome = window.TdMediaPicker.open({ adapter: window.__adapter, selection: { mode: 'single' }, autoSelectFirst: false,
        crop: { enabled: true, aspectRatio: 1.91, allowFocalPoint: true } });
    });
    await page.locator(`${PICKER} [data-td-media-item]`).first().waitFor({ state: 'visible' });
    await nthCard(page, 1).locator('[data-td-media-open]').click();
    await picker(page).locator('.td-media-picker__confirm').click();
    await page.locator('.td-crop-dialog[data-state="open"] td-cropper[data-state="ready"]').waitFor({ state: 'visible' });
    await page.locator('.td-crop-dialog .td-cropper__focal-toggle').click();
    await page.locator('.td-crop-dialog .td-cropper__focal:not([hidden])').waitFor({ state: 'visible' });
  },
  async 'delete-blocked'(page) {
    await openPicker(page, { mode: 'single' }, { delete: true }); // delete is opt-in (default false)
    await card(page, BLOCKED_ID).locator('[data-td-media-open]').click();
    await picker(page).locator(SEL.deleteBtn).click();
    await topDialog(page).getByRole('button', { name: LABEL.remove, exact: true }).click();
    await picker(page).locator(SEL.blocked).waitFor({ state: 'visible' });
    // the confirm dialog fully gone (closing ones included) before the shot
    await page.waitForFunction(() => !document.querySelector('body > .td-modal:not(.td-media-picker)'));
    // the alert + its usage list sit below the fold of the detail pane: scroll it fully into view (instant, no motion)
    await picker(page).locator(SEL.blocked).evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
  },
};
// ============================================ end of state drivers ===================================================

const PICKER_VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const GRID_VIEWPORTS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];



try {
  for (const vp of PICKER_VIEWPORTS) {
    for (const [state, drive] of Object.entries(STATES)) {
      const name = `picker-${state}-${vp.width}x${vp.height}`;
      const { page, context } = await newPage(browser, vp, PICKER_PAGE);
      try {
        await drive(page);
        await settle(page);
        await check(name, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
      } catch (e) {
        failures.push(`${name}: could not drive the state — ${e.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  }
  for (const vp of GRID_VIEWPORTS) {
    const name = `grid-justified-${vp.width}`;
    const { page, context } = await newPage(browser, vp, GRID_PAGE);
    try {
      await page.locator('td-media-grid [data-td-media-item]').first().waitFor({ state: 'visible' });
      await settle(page);
      await check(name, await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
    } catch (e) {
      failures.push(`${name}: could not render — ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
  {
    const name = 'cropper-field-1280';
    const { page, context } = await newPage(browser, { width: 1280, height: 900 }, CROP_PAGE);
    try {
      await settle(page);
      await check(name, await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
    } catch (e) {
      failures.push(`${name}: could not render — ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}


finish(version);
