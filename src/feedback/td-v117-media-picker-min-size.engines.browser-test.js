import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.117.0 (plan docs/internal/plans/v0.117.0-dcms2-create-row-minsize.md QĐ3) — `selection.minSize` of
// <td-media-picker> in Chromium, Firefox AND WebKit: an image below the minimum (or without a needed dimension) stays
// visible and its detail opens, but it can never be selected (tick, click, Space, range, autoSelectFirst, initialIds);
// the reason is on the card and is the opener's description; the crop step keeps "Chèn" disabled below the minimum.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { _resetCoreWarnings } = await import('../utils/media-picker-core.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tickTask = () => new Promise((r) => setTimeout(r, 0));
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
const live = (sel) => [...document.body.querySelectorAll(`:scope > ${sel}`)].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const pickerRoot = () => live('.td-media-picker');
const cropRoot = () => live('.td-crop-dialog');
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const reason = (id) => item(id)?.querySelector('.td-media-picker__size-reason') || null;
const confirmBtn = () => q('.td-media-picker__confirm');
const cropper = () => q('td-cropper', cropRoot());
const cropConfirm = () => q('.td-crop-dialog__confirm', cropRoot());
const cropMessage = () => q('.td-crop-dialog__message', cropRoot());
const pickerLive = () => q('.td-media-picker__live')?.textContent || '';
const selected = (id) => item(id)?.hasAttribute('data-selected') || false;
const host = () => document.querySelector('td-media-picker');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const L = TdMediaPicker.labels;
const small = (w, h) => L.sizeTooSmall.replace('{w}', String(w)).replace('{h}', String(h));

/** Open with the mock adapter; `patch(db)` edits the raw assets first. Resolves once the first page is shown. */
async function openReady(opts = {}, patch = null) {
  const ad = createMockAdapter();
  if (patch) patch(ad.db);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
const resize = (db, id, width, height) => {
  const a = db.get(id);
  if (width === undefined) delete a.width; else a.width = width;
  if (height === undefined) delete a.height; else a.height = height;
};

async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  TdMediaPicker.cancelUploads();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-crop-dialog, :scope > .td-modal'), 4000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
afterEach(async () => {
  await closeAll();
  TdMediaPicker.configureDefaults({});
  _resetCoreWarnings();
});

const MIN = { width: 800, height: 600 };

describe('td-media-picker — selection.minSize (v0.117.0 QĐ3)', () => {
  it('a bad minSize → open() throws a TypeError', () => {
    const ad = createMockAdapter();
    for (const minSize of [{}, { width: 0 }, { height: 1.5 }, { width: 100001 }, 'x']) {
      expect(() => TdMediaPicker.open({ adapter: ad, selection: { mode: 'single', minSize } }), JSON.stringify(minSize)).to.throw(TypeError);
    }
    expect(pickerRoot()).to.equal(null);
  });

  it('without minSize: no locked card, no reason (the old DOM)', async () => {
    await openReady({}, (db) => resize(db, 'm60', 10, 10));
    expect(items().some((i) => i.hasAttribute('data-size-locked'))).to.equal(false);
    expect(pickerRoot().querySelector('.td-media-picker__size-reason')).to.equal(null);
    expect(opener('m60').hasAttribute('aria-describedby')).to.equal(false);
  });

  it('single: a small card stays visible with its reason (accessible description); click opens the detail, never selects', async () => {
    const { promise } = await openReady({ selection: { mode: 'single', minSize: MIN } }, (db) => resize(db, 'm60', 799, 600));
    const card = item('m60');
    expect(card.hasAttribute('data-size-locked')).to.equal(true);
    expect(reason('m60').textContent).to.equal(small(800, 600));
    expect(reason('m60').textContent).to.equal('Ảnh phải có kích thước tối thiểu 800 × 600 px');
    expect(opener('m60').getAttribute('aria-describedby')).to.equal(reason('m60').id);
    expect(getComputedStyle(reason('m60')).display).to.not.equal('none');
    expect(item('m59').hasAttribute('data-size-locked'), '1200 × 800 is eligible').to.equal(false);
    click(opener('m60'));
    await until(() => card.hasAttribute('data-viewing'), 4000, 'detail of m60');
    await until(() => pickerLive().includes(small(800, 600)), 4000, 'reason announced');
    expect(confirmBtn().hasAttribute('disabled'), 'nothing selected').to.equal(true);
    expect(selected('m60')).to.equal(false);
    // Enter on the opener: the same
    opener('m60').focus();
    await sendKeys({ press: 'Enter' });
    await tickTask();
    expect(confirmBtn().hasAttribute('disabled')).to.equal(true);
    // an eligible card is selected as before
    click(opener('m59'));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'm59 selected');
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((x) => x.assetId)).to.deep.equal(['m59']);
  });

  it('unknown size → its own reason; one axis only names that axis; videos / files untouched', async () => {
    await openReady({ selection: { mode: 'single', minSize: MIN } }, (db) => {
      resize(db, 'm60', undefined, 800);
      resize(db, 'm54', undefined, undefined); // a video without a size
    });
    expect(reason('m60').textContent).to.equal(L.sizeUnknown);
    expect(reason('m60').textContent).to.equal('Không xác định được kích thước ảnh để kiểm tra kích thước tối thiểu');
    expect(item('m54').getAttribute('data-kind')).to.equal('video');
    expect(item('m54').hasAttribute('data-size-locked')).to.equal(false);
    expect(item('m56').hasAttribute('data-size-locked'), 'a file').to.equal(false);
    await closeAll();
    await openReady({ selection: { mode: 'single', minSize: { width: 1000 } } }, (db) => {
      resize(db, 'm60', 999, 5000);
      resize(db, 'm59', 1000, undefined); // the height is not needed
    });
    expect(reason('m60').textContent).to.equal('Ảnh phải có chiều rộng tối thiểu 1000 px');
    expect(item('m59').hasAttribute('data-size-locked')).to.equal(false);
    await closeAll();
    await openReady({ selection: { mode: 'single', minSize: { height: 900 } } });
    expect(reason('m60').textContent).to.equal('Ảnh phải có chiều cao tối thiểu 900 px');
  });

  it('multiple: the tick is disabled; tick / Space / Shift range skip the card', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', minSize: MIN } }, (db) => resize(db, 'm58', 100, 100));
    await until(() => tick('m58')?.getAttribute('aria-disabled') === 'true', 4000, 'tick aria-disabled');
    expect(tick('m59').hasAttribute('aria-disabled')).to.equal(false);
    click(tick('m58'));
    await tickTask();
    expect(selected('m58'), 'tick').to.equal(false);
    expect(pickerLive()).to.include(small(800, 600));
    opener('m58').focus();
    await sendKeys({ press: ' ' });
    await tickTask();
    expect(selected('m58'), 'Space').to.equal(false);
    // Shift range m59 → m57 across the locked m58
    click(tick('m59'));
    await until(() => selected('m59'), 4000, 'm59');
    click(tick('m57'), { shiftKey: true });
    await until(() => selected('m57'), 4000, 'm57 (range)');
    expect(selected('m58'), 'range skipped it').to.equal(false);
    // the detail of the locked card still opens (multiple: click = view)
    click(opener('m58'));
    await until(() => item('m58').hasAttribute('data-viewing'), 4000, 'detail of m58');
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((x) => x.assetId).sort()).to.deep.equal(['m57', 'm59']);
  });

  it('autoSelectFirst skips an ineligible first asset', async () => {
    const { promise } = await openReady({ autoSelectFirst: true, selection: { mode: 'single', minSize: MIN } },
      (db) => resize(db, 'm60', 10, 10));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'auto-selected');
    expect(selected('m60')).to.equal(false);
    confirmBtn().click();
    const out = await promise;
    expect(out.selection[0].assetId).to.equal('m59');
  });

  it('initialIds skip an ineligible asset', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', initialIds: ['m60', 'm59'], minSize: MIN } },
      (db) => resize(db, 'm60', 10, 10));
    await until(() => selected('m59'), 4000, 'm59 initial');
    await tickTask();
    expect(selected('m60')).to.equal(false);
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((x) => x.assetId)).to.deep.equal(['m59']);
  });

  it('fixed ratio: the largest crop of that ratio must meet both minima; free crop: only the source', async () => {
    const min = { width: 1000, height: 700 }; // 1200 × 800 passes as a source; its 16:9 crop is 1200 × 675
    await openReady({ selection: { mode: 'single', minSize: min }, crop: { enabled: true, aspectRatio: 16 / 9 } });
    expect(item('m60').hasAttribute('data-size-locked'), '16:9 cannot hold 1000 × 700').to.equal(true);
    expect(reason('m60').textContent).to.equal(small(1000, 700));
    await closeAll();
    await openReady({ selection: { mode: 'single', minSize: min }, crop: { enabled: true } }, (db) => resize(db, 'm59', 900, 800));
    expect(item('m60').hasAttribute('data-size-locked'), 'free crop: the whole image is enough').to.equal(false);
    expect(item('m59').hasAttribute('data-size-locked'), 'free crop on a source smaller than minSize').to.equal(true);
    await closeAll();
    await openReady({ selection: { mode: 'single', minSize: min }, crop: { mode: 'focal' } }, (db) => resize(db, 'm59', 900, 800));
    expect(item('m60').hasAttribute('data-size-locked'), 'focal: no ratio').to.equal(false);
    expect(item('m59').hasAttribute('data-size-locked'), 'focal: the source still counts').to.equal(true);
  });

  it('crop step: "Chèn" is disabled with the reason while the crop is below the minimum', async () => {
    const { promise } = await openReady({ selection: { mode: 'single', minSize: { width: 1100, height: 700 } }, crop: { enabled: true } });
    click(opener('m60'));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'm60 selected');
    confirmBtn().click();
    await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog open');
    await until(() => cropper()?.getAttribute('data-state') === 'ready', 4000, 'cropper ready');
    expect(cropConfirm().disabled, 'the whole image meets it').to.equal(false);
    expect(cropMessage(), 'no message element until needed').to.equal(null);
    const box = q('.td-cropper__box', cropper());
    box.focus();
    for (let i = 0; i < 6 && !cropConfirm().disabled; i++) await sendKeys({ press: '+' });
    expect(cropConfirm().disabled, 'below the minimum').to.equal(true);
    expect(cropMessage().hidden).to.equal(false);
    expect(cropMessage().textContent).to.equal(small(1100, 700));
    expect(cropConfirm().getAttribute('aria-describedby')).to.equal(cropMessage().id);
    cropConfirm().click(); // disabled: nothing
    await tickTask();
    expect(cropRoot()).to.not.equal(null);
    box.focus();
    for (let i = 0; i < 10 && cropConfirm().disabled; i++) await sendKeys({ press: '-' });
    expect(cropConfirm().disabled, 'back above the minimum').to.equal(false);
    expect(cropMessage().hidden).to.equal(true);
    cropConfirm().click();
    const out = await promise;
    const px = out.selection[0].usage.crop?.pixels;
    if (px) {
      expect(px.width).to.be.at.least(1100);
      expect(px.height).to.be.at.least(700);
    }
  });

  it('an undersized upload stays in the library but is ineligible (reason announced, not selected)', async () => {
    const { ad } = await openReady({ selection: { mode: 'single', minSize: { width: 1000 } } });
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const said = [];
    const obs = new MutationObserver(() => { const t = pickerLive(); if (t) said.push(t); });
    obs.observe(q('.td-media-picker__live'), { childList: true, characterData: true, subtree: true });
    host()._onFilesDropped([new File([blob], 'nho.png', { type: 'image/png' })]); // the mock answers 800 × 600
    await until(() => ad.calls.upload?.length > 0, 4000, 'upload started');
    await until(() => item('m61')?.hasAttribute('data-size-locked'), 6000, 'm61 locked');
    await until(() => said.includes('Ảnh phải có chiều rộng tối thiểu 1000 px'), 4000, 'reason announced');
    obs.disconnect();
    expect(confirmBtn().hasAttribute('disabled'), 'not selected').to.equal(true);
    expect(ad.db.has('m61'), 'kept in the library').to.equal(true);
  });

  // impl review ISSUE-3: a fresh snapshot can make a SELECTED asset ineligible — it is deselected, never confirmed
  it('a selected asset refreshed by adapter.get() with smaller dimensions is deselected; confirm skips it', async () => {
    const { ad, promise } = await openReady({ selection: { mode: 'multiple', minSize: MIN } });
    const changes = [];
    host().addEventListener('selection-change', (e) => changes.push(e.detail));
    click(tick('m59'));
    click(tick('m57'));
    await until(() => selected('m59') && selected('m57'), 4000, 'm59 + m57 selected');
    resize(ad.db, 'm59', 100, 100);
    click(opener('m59')); // multiple: click = view → the detail calls adapter.get → the fresh (small) snapshot
    await until(() => !selected('m59'), 4000, 'm59 deselected');
    expect(item('m59').hasAttribute('data-size-locked')).to.equal(true);
    expect(selected('m57')).to.equal(true);
    expect(changes.at(-1).removedIds).to.deep.equal(['m59']);
    await until(() => pickerLive().includes(small(800, 600)), 4000, 'reason announced');
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((x) => x.assetId)).to.deep.equal(['m57']);
  });

  it('single: a fresh small snapshot deselects (confirm disabled); the final guard blocks a stale-but-small snapshot', async () => {
    let settled = false;
    const { promise } = await openReady({ selection: { mode: 'single', minSize: MIN } });
    promise.then(() => { settled = true; });
    click(opener('m60'));
    await until(() => selected('m60') && !confirmBtn().hasAttribute('disabled'), 4000, 'm60 selected');
    const a = host()._s.model.assets[0];
    host()._applyFreshAsset({ ...a, width: 100, height: 100 });
    await until(() => !selected('m60'), 4000, 'deselected');
    expect(confirmBtn().hasAttribute('disabled'), 'nothing to confirm').to.equal(true);
    // the final guard: a snapshot swapped in without a repaint (no refresh path may confirm it)
    click(opener('m59'));
    await until(() => selected('m59'), 4000, 'm59 selected');
    const b = host()._s.model.assets[0];
    host()._s.model.update({ ...b, width: 10, height: 10 });
    confirmBtn().click();
    await wait(50);
    expect(settled, 'stays open').to.equal(false);
    expect(pickerRoot()).to.not.equal(null);
    expect(host()._s.model.size, 'the ineligible asset dropped').to.equal(0);
    expect(pickerLive()).to.include(small(800, 600));
  });

  it('a refresh during the crop step that makes the asset ineligible closes the step; no finish', async () => {
    let settled = false;
    const { promise } = await openReady({ selection: { mode: 'single', minSize: MIN }, crop: { enabled: true } });
    promise.then(() => { settled = true; });
    click(opener('m60'));
    await until(() => !confirmBtn().hasAttribute('disabled'), 4000, 'm60 selected');
    confirmBtn().click();
    await until(() => cropRoot()?.getAttribute('data-state') === 'open', 4000, 'crop dialog open');
    const a = host()._s.model.assets[0];
    host()._applyFreshAsset({ ...a, width: 100, height: 100 });
    await until(() => !cropRoot(), 4000, 'crop step closed');
    await wait(50);
    expect(settled).to.equal(false);
    expect(selected('m60')).to.equal(false);
    expect(confirmBtn().hasAttribute('disabled')).to.equal(true);
  });
});
