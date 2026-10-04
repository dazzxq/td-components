import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md, decisions 23-26, "Engines … td-v035-media-picker-crop") — the
// crop step of <td-media-picker> in Chromium, Firefox AND WebKit: "Chèn" with `crop.enabled` (single mode, an image)
// opens the shared crop dialog (crop-dialog.js, nested) instead of finishing. Every wait is on a real signal (dialog
// `data-state="open"`, td-cropper `image-ready` / `data-state`, crop / focal events, focus) — no fixed sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { _resetCoreWarnings } = await import('../utils/media-picker-core.js');
const { isScrollLocked } = await import('../utils/scroll-lock.js');
const { createMockAdapter, assetFields } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tickTask = () => new Promise((r) => setTimeout(r, 0));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const PENDING = Symbol('pending');
/** the outcome promise has NOT settled: one macrotask after a settled promise would have resolved the race */
const peek = async (p) => Promise.race([p, tickTask().then(() => PENDING)]);
const live = (sel) => [...document.body.querySelectorAll(`:scope > ${sel}`)].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const pickerRoot = () => live('.td-media-picker');
const cropRoot = () => live('.td-crop-dialog');
const anyCropRoot = () => document.body.querySelector(':scope > .td-crop-dialog');
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const confirmBtn = () => q('.td-media-picker__confirm');
const cropper = () => q('td-cropper', cropRoot());
const cropConfirm = () => q('.td-crop-dialog__confirm', cropRoot());
const cropCancel = () => q('.td-crop-dialog__cancel', cropRoot());
const pickerLive = () => q('.td-media-picker__live')?.textContent || '';
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker):not(.td-crop-dialog)')]
  .filter((r) => r.getAttribute('data-state') !== 'closing');
const discardDialog = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const clickDiscard = (yes) => {
  const btns = [...discardDialog().querySelectorAll('.td-modal__footer .td-btn')];
  btns.find((b) => b.textContent.includes(yes ? TdMediaPicker.labels.discard : TdMediaPicker.labels.keepEditing)).click();
};
const focusInConfirm = () => !!confirmBtn() && confirmBtn().contains(document.activeElement);

/** Open with the mock adapter; `patch(db)` edits the raw assets first. Resolves once the first page is shown. */
async function openReady(opts = {}, patch = null) {
  const ad = createMockAdapter();
  if (patch) patch(ad.db);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
/** single mode: one click on the card opener selects it */
async function select(id) {
  click(opener(id));
  await until(() => !confirmBtn().hasAttribute('disabled'), 4000, `${id} selected`);
}
/** "Chèn" → the crop step open (`data-state="open"`) and its image decoded or failed (`ready` | `error`) */
async function openCropStep(state = 'ready') {
  confirmBtn().click();
  await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog data-state="open"');
  await until(() => cropper()?.getAttribute('data-state') === state, 4000, `td-cropper data-state="${state}"`);
}
/** resolves with the next `type` event on the open cropper */
const nextEvent = (type) => new Promise((r) => cropper().addEventListener(type, (e) => r(e.detail), { once: true }));

async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
  TdMediaPicker.configureDefaults({});
});

const CROP = { crop: { enabled: true } };

describe('td-media-picker — crop step (v0.35 decisions 23-26)', () => {
  it('crop.enabled + single + image → "Chèn" opens the crop step (nested, labels, source, original size); the picker stays pending', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    const root = cropRoot();
    expect(root.classList.contains('td-crop-dialog--nested'), 'nested').to.equal(true);
    expect(q('.td-modal__title', root).textContent).to.equal(TdMediaPicker.labels.cropTitle);
    expect(cropCancel().textContent.trim()).to.equal('Quay lại');
    expect(cropConfirm().textContent.trim()).to.equal('Chèn');
    expect(cropConfirm().disabled).to.equal(false);
    const c = cropper();
    expect(new URL(c.getAttribute('src')).pathname).to.equal('/test/fixtures/4.svg');
    expect(c.getAttribute('natural-width')).to.equal('1200');
    expect(c.getAttribute('natural-height')).to.equal('800');
    expect(c.hasAttribute('aspect-ratio'), 'free').to.equal(false);
    expect(c.hasAttribute('focal-point'), 'no focal tool without allowFocalPoint').to.equal(false);
    expect(await peek(promise)).to.equal(PENDING);
    expect(pickerRoot() !== null, 'picker still open').to.equal(true);
    // no "Cắt" button in the details panel (decision 24: one entry point)
    expect(pickerRoot().querySelector('.td-media-picker__detail').textContent.includes('Cắt')).to.equal(false);
  });

  it('a second "Chèn" while the crop step is open does nothing (no double finish, one crop dialog)', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    confirmBtn().click();
    confirmBtn().querySelector('button')?.click();
    await tickTask();
    expect(document.body.querySelectorAll(':scope > .td-crop-dialog').length).to.equal(1);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('"Quay lại" → back to the picker, selection kept, focus on "Chèn"; Escape → the same', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    cropCancel().click();
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    await until(focusInConfirm, 4000, 'focus on "Chèn"');
    expect(await peek(promise)).to.equal(PENDING);
    expect(confirmBtn().hasAttribute('disabled'), 'selection kept').to.equal(false);
    await openCropStep();
    await until(() => cropRoot().contains(document.activeElement), 4000, 'focus in the crop dialog');
    await sendKeys({ press: 'Escape' });
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed (Escape)');
    await until(focusInConfirm, 4000, 'focus on "Chèn" (Escape)');
    expect(await peek(promise)).to.equal(PENDING);
    expect(pickerRoot() !== null, 'Escape closed only the crop step').to.equal(true);
    // the selection still finishes with the same asset
    await openCropStep();
    cropConfirm().click();
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });

  it('× of the crop dialog → back to the picker too', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    q('.td-modal__close', cropRoot()).click();
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    await until(focusInConfirm, 4000, 'focus on "Chèn"');
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('Chèn after a keyboard zoom + focal point → usage.crop { normalized, pixels, aspectRatio } + focalPoint', async () => {
    const { promise } = await openReady({ crop: { enabled: true, allowFocalPoint: true } });
    await select('m60');
    await openCropStep();
    expect(cropper().hasAttribute('focal-point')).to.equal(true);
    const box = q('.td-cropper__box', cropper());
    box.focus();
    const changed = nextEvent('crop-change');
    await sendKeys({ press: '+' });
    const ch = await changed;
    expect(ch.source).to.equal('keyboard');
    const focal = nextEvent('focal-change');
    q('.td-cropper__focal-toggle', cropper()).click();
    await focal;
    cropConfirm().click();
    const out = await promise;
    expect(out.status).to.equal('selected');
    const { usage } = out.selection[0];
    expect(usage.altText).to.equal('Ảnh mẫu 60');
    const { normalized: n, pixels: p, aspectRatio } = usage.crop;
    for (const v of [p.x, p.y, p.width, p.height]) expect(Number.isInteger(v), `pixel ${v} integer`).to.equal(true);
    expect(p.width).to.be.lessThan(1200);
    expect(p.height).to.be.lessThan(800);
    expect(p.x + p.width).to.be.at.most(1200);
    expect(p.y + p.height).to.be.at.most(800);
    expect(Math.abs(n.width - p.width / 1200)).to.be.below(1e-5);
    expect(Math.abs(n.x - p.x / 1200)).to.be.below(1e-5);
    expect(Math.abs(n.height - p.height / 800)).to.be.below(1e-5);
    expect(n.x + n.width).to.be.at.most(1);
    expect(aspectRatio).to.be.closeTo(p.width / p.height, 1e-3);
    expect(usage.focalPoint).to.be.an('object');
    expect(usage.focalPoint.x).to.be.within(0, 1);
    expect(usage.focalPoint.y).to.be.within(0, 1);
    await until(() => anyCropRoot() === null && document.body.querySelector(':scope > .td-media-picker') === null, 4000, 'both closed');
    expect(document.querySelector('[inert]') === null, 'no inert left').to.equal(true);
    expect(isScrollLocked()).to.equal(false);
  });

  it('untouched free crop (whole image) → usage.crop null, focalPoint null', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    cropConfirm().click();
    const out = await promise;
    expect(out.selection[0].usage).to.deep.equal({ altText: 'Ảnh mẫu 60', crop: null, focalPoint: null });
  });

  it('allowFocalPoint false → focalPoint null even if the cropper had one', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    cropper().focalPoint = { x: 0.2, y: 0.3 }; // set by code: the picker must still drop it
    cropConfirm().click();
    expect((await promise).selection[0].usage.focalPoint).to.equal(null);
  });

  it('locked ratio untouched → a non-null crop of that ratio; title "Cắt ảnh · 16:9"', async () => {
    const { promise } = await openReady({ crop: { enabled: true, aspectRatio: 16 / 9 } });
    await select('m60');
    await openCropStep();
    expect(q('.td-modal__title', cropRoot()).textContent).to.equal('Cắt ảnh · 16:9');
    expect(cropper().getAttribute('aspect-ratio')).to.equal('16/9');
    cropConfirm().click();
    const { crop } = (await promise).selection[0].usage;
    expect(crop).to.be.an('object');
    expect(crop.aspectRatio).to.be.closeTo(16 / 9, 1e-4);
    expect(crop.pixels).to.deep.equal({ x: 0, y: 63, width: 1200, height: 675 });
    expect(crop.normalized.width).to.equal(1);
  });

  it('an asset without width / height → crop without pixels', async () => {
    const { promise } = await openReady({ crop: { enabled: true, aspectRatio: 1 } }, (db) => {
      delete db.get('m60').width;
      delete db.get('m60').height;
    });
    await select('m60');
    await openCropStep();
    expect(cropper().hasAttribute('natural-width')).to.equal(false);
    cropConfirm().click();
    const { crop } = (await promise).selection[0].usage;
    expect(crop.normalized).to.be.an('object');
    expect('pixels' in crop).to.equal(false);
    expect(crop.aspectRatio).to.equal(1);
  });

  it('video / file → "Chèn" finishes at once, crop null, no crop step', async () => {
    for (const id of ['m54', 'm56']) {
      const { promise } = await openReady(CROP);
      await select(id);
      confirmBtn().click();
      expect(anyCropRoot() === null, `${id}: no crop dialog`).to.equal(true);
      const out = await promise;
      expect(out.selection[0].assetId).to.equal(id);
      expect(out.selection[0].usage.crop).to.equal(null);
      expect(out.selection[0].usage.focalPoint).to.equal(null);
      await closeAll();
    }
  });

  it('multiple mode + crop → no crop step and exactly one console warning', async () => {
    _resetCoreWarnings();
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    extra.push(() => { console.warn = orig; });
    const { promise } = await openReady({ ...CROP, selection: { mode: 'multiple' } });
    click(tick('m60'));
    click(tick('m59'));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'selected');
    confirmBtn().click();
    expect(anyCropRoot() === null, 'no crop dialog').to.equal(true);
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm59']);
    expect(out.selection.every((s) => s.usage.crop === null)).to.equal(true);
    expect(warns.filter((w) => /crop/.test(w)).length).to.equal(1);
  });

  it('close() while the crop step is open → both close, outcome cancelled / programmatic', async () => {
    const { promise } = await openReady(CROP);
    await select('m60');
    await openCropStep();
    document.querySelector('td-media-picker').close();
    expect(await promise).to.deep.equal({ status: 'cancelled', reason: 'programmatic', selection: [] });
    await until(() => anyCropRoot() === null && document.body.querySelector(':scope > .td-media-picker') === null, 4000, 'both removed');
    expect(document.querySelector('[inert]') === null, 'no inert left').to.equal(true);
    expect(isScrollLocked()).to.equal(false);
  });

  it('host removed while the crop step is open → programmatic, the crop dialog closes too', async () => {
    const ad = createMockAdapter();
    const host = document.createElement('td-media-picker');
    host.options = { adapter: ad, ...CROP };
    document.body.appendChild(host);
    const cancels = [];
    host.addEventListener('cancel', (e) => cancels.push(e.detail.reason));
    const promise = host.open();
    await until(() => items().length > 0, 4000, 'first page');
    await select('m60');
    await openCropStep();
    host.remove();
    expect(await promise).to.deep.equal({ status: 'cancelled', reason: 'programmatic', selection: [] });
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    expect(cancels).to.deep.equal(['programmatic']);
    expect(document.querySelector('[inert]') === null, 'no inert left').to.equal(true);
  });

  it('dirty metadata → the discard prompt first; "keep" → no crop step; "discard" → then the crop step', async () => {
    const { promise, ad } = await openReady({ ...CROP, assetFields: assetFields() });
    await select('m60');
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg'
      && !q('.td-media-picker__detail').hasAttribute('data-loading'), 4000, 'detail m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'Z' });
    confirmBtn().click();
    await until(() => discardDialog(), 4000, 'discard prompt');
    expect(anyCropRoot() === null, 'no crop step before the answer').to.equal(true);
    clickDiscard(false);
    await until(() => discardDialog() === null, 4000, 'prompt closed');
    expect(anyCropRoot() === null, 'keep editing → no crop step').to.equal(true);
    expect(await peek(promise)).to.equal(PENDING);
    confirmBtn().click();
    await until(() => discardDialog(), 4000, 'discard prompt again');
    clickDiscard(true);
    await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop step after the discard');
    await until(() => cropper().getAttribute('data-state') === 'ready', 4000, 'cropper ready');
    expect(await peek(promise)).to.equal(PENDING);
    cropConfirm().click();
    const out = await promise;
    expect(out.selection[0].assetId).to.equal('m60');
    expect(ad.calls.update.length).to.equal(0);
  });

  it('preview of another ratio than width / height → error "ratio", Chèn locked, only Quay lại', async () => {
    const { promise } = await openReady(CROP, (db) => {
      db.get('m60').urls.preview = '/test/fixtures/square.svg';
    });
    await select('m60');
    await openCropStep('error');
    expect(cropper().getAttribute('data-error')).to.equal('ratio');
    expect(cropConfirm().disabled).to.equal(true);
    cropConfirm().click();
    expect(await peek(promise)).to.equal(PENDING);
    expect(cropRoot() !== null, 'still open').to.equal(true);
    cropCancel().click();
    await until(() => anyCropRoot() === null, 4000, 'crop dialog removed');
    await until(focusInConfirm, 4000, 'focus on "Chèn"');
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('no safe preview URL → fail closed: no crop step, the picker stays open and announces it', async () => {
    const { promise } = await openReady(CROP, (db) => {
      db.get('m60').urls.preview = 'javascript:alert(1)';
    });
    await select('m60');
    confirmBtn().click();
    await until(() => pickerLive() === TdMediaPicker.labels.cropUnavailable, 4000, 'announced');
    expect(anyCropRoot() === null, 'no crop dialog').to.equal(true);
    expect(await peek(promise)).to.equal(PENDING);
    expect(confirmBtn().hasAttribute('disabled'), 'selection kept').to.equal(false);
  });

  it('crop disabled (default) → "Chèn" finishes at once even for an image (v0.34 behaviour)', async () => {
    const { promise } = await openReady({ crop: { enabled: false } });
    await select('m60');
    confirmBtn().click();
    expect(anyCropRoot() === null).to.equal(true);
    expect((await promise).selection[0].usage.crop).to.equal(null);
  });
});
