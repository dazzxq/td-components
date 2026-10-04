import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, Test section) — <td-media-picker> / TdMediaPicker.open in
// Chromium, Firefox AND WebKit (group `engines`). A controllable mock adapter (test/fixtures/media-adapter.js: deferred
// calls, call log, recorded signals) — no network. DOM nodes are compared as booleans (chai + DOM nodes hangs).
// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, "Test > Engines"): every v0.32 test kept; only the selectors / labels
// the plan changed are updated (full viewport shell, td-input-field search, td-button actions, "Chèn" / "Đóng", footer
// count instead of the thumb tray, inline always-open detail form whose Save needs a dirty form, tick-mode multiple
// selection where a click only views, the nested upload dialog, cursor pages instead of "Tải thêm"). New v0.33 cases
// live in td-v033-media-picker-*.engines.browser-test.js.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { TdModalStackManager } = await import('./td-modal-stack.js');
const { isScrollLocked } = await import('../utils/scroll-lock.js');
const { createMockAdapter, assetFields, uploadFields } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
async function until(fn, ms = 3000, what = 'condition') {
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
const peek = (p, ms = 30) => Promise.race([p, wait(ms).then(() => PENDING)]);
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const anyRoot = () => document.body.querySelector(':scope > .td-media-picker');
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const grid = () => q('td-media-grid');
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const ids = () => items().map((i) => i.getAttribute('data-id'));
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const live = () => q('.td-media-picker__live')?.textContent || '';
const confirmBtn = () => q('.td-media-picker__confirm');
const btnText = (b) => (b?.textContent || '').trim();
/** v0.33: the footer shows the count (data-count), the 40px thumb tray is gone */
const selCount = () => Number(q('.td-media-picker__selcount')?.getAttribute('data-count') || 0);
const searchHost = () => q('.td-media-picker__search');
const searchInput = () => q('.td-media-picker__search input');
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const discardDialog = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const clickDiscard = (yes) => {
  const d = discardDialog();
  const btns = [...d.querySelectorAll('.td-modal__footer .td-btn')];
  btns.find((b) => b.textContent.includes(yes ? TdMediaPicker.labels.discard : TdMediaPicker.labels.keepEditing)).click();
};
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const key = (el, k, init = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true, ...init }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true, composed: true, ...init }));
};
const file = (name = 'moi.png', type = 'image/png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type });
// v0.33: upload = a nested dialog (media-picker-upload.js) opened from the toolbar "Tải lên" button
const uploadRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker-upload')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const dropzone = () => uploadRoot()?.querySelector('td-dropzone') || null;
async function openUpload() {
  q('.td-media-picker__upload-btn').click();
  await until(() => dropzone(), 3000, 'upload dialog');
  await frames(2);
}
/** v0.33: the detail panel shows `id` and its get() settled (the inline form is the final one) */
async function detailReady(id, name = assetName(id)) {
  await until(() => q('.td-media-picker__detail-name')?.textContent === name
    && !q('.td-media-picker__detail').hasAttribute('data-loading'), 3000, `detail ${id}`);
  await tickTask();
}
const saveBtn = () => q('.td-media-picker__save');
/**
 * v0.33: every text written to the picker's OR the upload dialog's live region (the dialog announces per-file results
 * in its own region while it is open — the picker's is inert under it).
 */
function liveLog() {
  const log = [];
  const mo = new MutationObserver(() => {
    for (const el of document.querySelectorAll('.td-media-picker__live, .td-media-picker-upload__live')) {
      const t = el.textContent;
      if (t && log.at(-1) !== t) log.push(t);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  extra.push(() => mo.disconnect());
  return log;
}
const saveEnabled = () => !!saveBtn() && !saveBtn().hasAttribute('disabled') && !saveBtn().hasAttribute('loading');
const assetName = (id) => `anh-${id.slice(1)}.jpg`;
const tickTask = () => new Promise((r) => setTimeout(r, 0));
// WebKit (like Safari's default) does not Tab to buttons; Option(Alt)+Tab reaches every control there.
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';
async function ddPick(dd, label) {
  if (document.getElementById(`${dd.id}-menu`)?.hidden !== false) dd.querySelector('.td-dropdown__trigger').click();
  await frames(1);
  const menu = document.getElementById(`${dd.id}-menu`);
  const opt = [...menu.querySelectorAll('.td-dropdown__option')].find((o) => o.textContent.trim() === label);
  if (!opt) throw new Error(`no option ${label} in ${menu?.textContent}`);
  opt.click();
  await tickTask();
}
async function chipPick(ci, label) {
  ci.open();
  await tickTask();
  await tickTask();
  const menu = document.getElementById(`${ci.id}-menu`);
  const opt = [...menu.querySelectorAll('.td-chip-input__option')]
    .find((o) => o.querySelector('.td-chip-input__option-label')?.textContent.trim() === label);
  if (!opt) throw new Error(`no option ${label} in ${menu?.textContent}`);
  opt.click();
  await tickTask();
}

/** Open with a mock adapter; manual → resolve the first list (+ facets) on demand. */
async function open(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await frames(3);
  return { ad, promise, root: pickerRoot() };
}
/**
 * The open motion has really finished: the root goes `data-state="open"` on the 2nd animation frame after open (dialog
 * layer `onOpened`), which starts the dialog's transitions (sheet slide 300ms on phones); then every running animation
 * on the dialog has finished. Geometry measured before that is mid-slide — a fixed wait raced it on loaded CI WebKit.
 */
async function openSettled(root = pickerRoot()) {
  await until(() => root.getAttribute('data-state') === 'open', 3000, 'data-state="open"');
  const dialog = root.querySelector('.td-media-picker__dialog');
  let done = false;
  Promise.all(dialog.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => { done = true; });
  await until(() => done, 3000, 'dialog open transition finished');
}
async function openReady(opts = {}, adOpts = {}) {
  const r = await open(opts, adOpts);
  await until(() => items().length > 0 || q('.td-media-picker__empty:not([hidden])'), 3000, 'first page');
  return r;
}
async function search(text) {
  const input = searchHost();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  key(input, 'Enter');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-media-picker-upload, :scope > .td-modal'), 3000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 1280, height: 800 });
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(50);
});

describe('td-media-picker — shell (decisions 10-12)', () => {
  it('open → search focused, Tab trapped, × → cancelled close, focus back to the opener', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'Mở';
    document.body.appendChild(btn);
    extra.push(() => btn.remove());
    btn.focus();
    const { promise } = await openReady();
    expect(document.activeElement === searchInput(), 'search focused').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    for (let i = 0; i < 25; i++) {
      await sendKeys({ press: TAB });
      expect(pickerRoot().contains(document.activeElement), `tab ${i} inside`).to.equal(true);
    }
    q('.td-modal__close').click();
    const out = await promise;
    expect(out).to.deep.equal({ status: 'cancelled', reason: 'close', selection: [] });
    expect(document.activeElement === btn, 'focus restored').to.equal(true);
    await until(() => anyRoot() === null, 3000, 'root removed after the exit transition');
    expect(document.querySelector('td-media-picker') === null, 'JS host removed').to.equal(true);
  });

  it('"Huỷ" → cancelled close; Escape (clean) → cancelled escape', async () => {
    let r = await openReady();
    expect(btnText(q('.td-media-picker__cancel'))).to.equal('Đóng');
    q('.td-media-picker__cancel').click();
    expect((await r.promise).reason).to.equal('close');
    await until(() => anyRoot() === null, 3000, 'closed');
    r = await openReady();
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Escape' });
    expect(await r.promise).to.deep.equal({ status: 'cancelled', reason: 'escape', selection: [] });
  });

  it('Escape in a non-empty search clears it, picker stays open', async () => {
    const { promise, ad } = await openReady();
    const input = searchInput();
    input.focus();
    await sendKeys({ type: 'anh-1' });
    await sendKeys({ press: 'Escape' });
    expect(input.value).to.equal('');
    expect(await peek(promise)).to.equal(PENDING);
    expect(pickerRoot() !== null).to.equal(true);
    await until(() => ad.calls.list.at(-1).args[0].query === '');
  });

  it('open() while one is open → programmatic at once; close() by code', async () => {
    const { promise } = await openReady();
    const second = await peek(TdMediaPicker.open({ adapter: createMockAdapter() }), 50);
    expect(second).to.deep.equal({ status: 'cancelled', reason: 'programmatic', selection: [] });
    expect(document.querySelectorAll('td-media-picker').length).to.equal(1);
    document.querySelector('td-media-picker').close();
    expect((await promise).reason).to.equal('programmatic');
  });

  it('open() without a valid adapter → TypeError synchronously', () => {
    expect(() => TdMediaPicker.open({ adapter: { list() {} } })).to.throw(TypeError);
    expect(() => TdMediaPicker.open({})).to.throw(TypeError);
    expect(document.querySelector('td-media-picker') === null).to.equal(true);
  });

  it('configureDefaults: adapter from the defaults; replaced wholesale', async () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, pageSize: 7 });
    extra.push(() => TdMediaPicker.configureDefaults({}));
    const p = TdMediaPicker.open({ selection: { mode: 'single' } });
    await until(() => ad.calls.list.length > 0);
    expect(ad.calls.list[0].args[0].limit).to.equal(7);
    TdMediaPicker.configureDefaults({ adapter: ad });
    expect(TdMediaPicker.defaults.pageSize).to.equal(undefined);
    document.querySelector('td-media-picker').close();
    await p;
  });

  it('dirty (edit form typed) → × asks; "no" keeps it; "yes" aborts and cancels', async () => {
    const { promise, ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: ' sửa' });
    q('.td-modal__close').click();
    await until(() => discardDialog());
    clickDiscard(false);
    await wait(50);
    expect(await peek(promise)).to.equal(PENDING);
    expect(pickerRoot() !== null).to.equal(true);
    q('.td-modal__close').click();
    await until(() => discardDialog());
    clickDiscard(true);
    const out = await promise;
    expect(out.status).to.equal('cancelled');
    expect(out.reason).to.equal('close');
    expect(ad.calls.update.length).to.equal(0);
  });

  it('dirty (upload running) → Escape is layered: the nested upload dialog asks first; yes → upload aborted, picker stays; then Escape → cancelled escape', async () => {
    const { promise, ad } = await openReady({}, {});
    ad.manual = true; // the upload stays pending
    await openUpload();
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    uploadRoot().querySelector('.td-media-picker-upload__dialog').focus();
    await sendKeys({ press: 'Escape' });
    const busyConfirm = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.uploadCancelTitle)) || null;
    await until(() => busyConfirm(), 3000, 'upload busy confirm');
    expect(await peek(promise)).to.equal(PENDING);
    [...busyConfirm().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.includes(TdMediaPicker.labels.uploadCancelConfirm)).click();
    await until(() => ad.calls.upload[0].args[1].signal.aborted, 3000, 'upload aborted');
    await until(() => uploadRoot() === null, 3000, 'upload dialog closed');
    expect(await peek(promise)).to.equal(PENDING);
    await until(() => pickerRoot().contains(document.activeElement), 3000, 'focus back in the picker');
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Escape' });
    const out = await promise;
    expect(out.reason).to.equal('escape');
  });
});

describe('td-media-picker — finish gate with "Chèn" (R1-3)', () => {
  it('dirty edit → "Chèn" asks; no → still open; yes → selected A (old snapshot), update never called', async () => {
    const { promise, ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'Z' });
    confirmBtn().click();
    await until(() => discardDialog());
    confirmBtn().click(); // a second click while the confirmation is open → still ONE dialog
    await wait(30);
    expect(modalRoots().length).to.equal(1);
    clickDiscard(false);
    await wait(50);
    expect(await peek(promise)).to.equal(PENDING);
    confirmBtn().click();
    await until(() => discardDialog());
    clickDiscard(true);
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
    expect(out.selection[0].asset.name).to.equal(assetName('m60'));
    expect(ad.calls.update.length).to.equal(0);
  });

  it('upload running + A selected → "Chèn" asks; yes → upload aborted, selected only A', async () => {
    const { promise, ad } = await openReady();
    click(opener('m60'));
    await until(() => !confirmBtn().hasAttribute('disabled'));
    ad.manual = true;
    await openUpload();
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    confirmBtn().click();
    await until(() => discardDialog());
    clickDiscard(true);
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
    expect(ad.calls.upload[0].args[1].signal.aborted).to.equal(true);
  });

  it('clean → "Chèn" resolves at once; nothing selected → disabled (+ announcement when clicked by code)', async () => {
    const { promise } = await openReady();
    expect(confirmBtn().hasAttribute('disabled')).to.equal(true);
    expect(confirmBtn().querySelector('button').disabled).to.equal(true);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    confirmBtn().click();
    await until(() => live() === TdMediaPicker.labels.selectFirst);
    expect(await peek(promise)).to.equal(PENDING);
    click(opener('m59'));
    await until(() => !confirmBtn().hasAttribute('disabled'));
    confirmBtn().click();
    expect(modalRoots().length).to.equal(0);
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection[0]).to.include({ assetId: 'm59' });
    expect(out.selection[0].usage).to.deep.equal({ altText: 'Ảnh mẫu 59', crop: null, focalPoint: null });
  });
});

describe('td-media-picker — host removed while open (R1-5, R2-5)', () => {
  it('declarative host removed with list / get / upload pending → settles once programmatic, everything aborted, root gone now', async () => {
    const ad = createMockAdapter({ manual: true });
    const host = document.createElement('td-media-picker');
    host.options = { adapter: ad, selection: { mode: 'single', initialIds: ['m3'] } };
    document.body.appendChild(host);
    const events = [];
    host.addEventListener('cancel', (e) => events.push(e.detail.reason));
    const promise = host.open();
    await until(() => ad.calls.list.length && ad.calls.get.length);
    ad.calls.list[0].resolve();
    await until(() => items().length);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'upload dialog');
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    host.remove();
    expect(uploadRoot() === null, 'upload dialog removed at once').to.equal(true);
    expect(anyRoot() === null, 'root removed at once').to.equal(true);
    expect(document.querySelector('[inert]') === null, 'no inert left').to.equal(true);
    expect(isScrollLocked()).to.equal(false);
    const out = await promise;
    expect(out).to.deep.equal({ status: 'cancelled', reason: 'programmatic', selection: [] });
    expect(events).to.deep.equal(['programmatic']);
    for (const kind of ['get', 'upload']) for (const c of ad.calls[kind]) expect(c.signal.aborted, kind).to.equal(true);
    // late settles: no DOM writes, no events
    const changes = [];
    const mo = new MutationObserver((r) => changes.push(...r));
    mo.observe(document.body, { childList: true, subtree: true });
    ad.ignoreSignal = true;
    ad.resolveAll();
    await wait(50);
    mo.disconnect();
    expect(changes.filter((c) => [...c.addedNodes].some((n) => n.nodeType === 1)).length).to.equal(0);
    expect(events.length).to.equal(1);
    // re-attached host opens normally
    ad.manual = false;
    ad.ignoreSignal = false;
    document.body.appendChild(host);
    extra.push(() => host.remove());
    const p2 = host.open();
    await until(() => items().length);
    host.close();
    expect((await p2).reason).to.equal('programmatic');
  });

  it('removed while the discard confirm is open → that confirm closes too', async () => {
    const ad = createMockAdapter();
    const host = document.createElement('td-media-picker');
    host.options = { adapter: ad, assetFields: assetFields() };
    document.body.appendChild(host);
    const promise = host.open();
    await until(() => items().length);
    click(opener('m60'));
    await detailReady('m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'x' });
    q('.td-modal__close').click();
    await until(() => discardDialog());
    host.remove();
    await until(() => discardDialog() === null, 3000, 'confirm closed');
    expect((await promise).reason).to.equal('programmatic');
  });

  it('opened from inside TdModal A: removing the picker closes only its confirm B; an app modal C above B stays', async () => {
    const aBtn = document.createElement('button');
    aBtn.textContent = 'trong A';
    const idA = TdModal.show({ title: 'Modal A', body: aBtn });
    await frames(3);
    aBtn.focus();
    const ad = createMockAdapter();
    const host = document.createElement('td-media-picker');
    host.options = { adapter: ad, assetFields: assetFields() };
    document.body.appendChild(host);
    const promise = host.open();
    await until(() => items().length);
    click(opener('m60'));
    await detailReady('m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'x' });
    q('.td-modal__close').click();
    await until(() => discardDialog());
    const idC = TdModal.show({ title: 'Modal C', body: 'app' });
    await frames(3);
    host.remove();
    expect((await promise).reason).to.equal('programmatic');
    await wait(300);
    expect(discardDialog() === null, 'B closed').to.equal(true);
    const stackIds = TdModalStackManager.stack.map((m) => m.id);
    expect(stackIds.includes(idA), 'A open').to.equal(true);
    expect(stackIds.includes(idC), 'C open').to.equal(true);
    TdModal.closeById(idC);
    await wait(300);
    expect(document.getElementById(idA)?.contains(document.activeElement) === true, 'A has focus').to.equal(true);
    TdModal.closeById(idA);
  });

  it('close() by code while the discard confirm is open → only it closes; cancelled', async () => {
    const { promise } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'x' });
    q('.td-media-picker__cancel').click();
    await until(() => discardDialog());
    document.querySelector('td-media-picker').close();
    expect((await promise).status).to.equal('cancelled');
    await until(() => discardDialog() === null, 3000, 'confirm closed');
  });
});

describe('td-media-picker — initialIds transaction (R1-4, R2-4)', () => {
  const openInitial = async (ids, extraOpts = {}) => {
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad, selection: { mode: 'multiple', initialIds: ids }, ...extraOpts });
    await until(() => ad.calls.get.length === ids.length);
    ad.calls.list[0].resolve();
    await until(() => items().length);
    return { ad, promise };
  };
  const getCall = (ad, id) => ad.calls.get.find((c) => c.args[0] === id);

  it('resolved c, a, b → selection in initialIds order, applied once; "Đang tải lựa chọn…" while pending', async () => {
    const { ad, promise } = await openInitial(['m3', 'm1', 'm2']);
    const loadingNote = () => q('.td-media-picker__initial-loading');
    expect(loadingNote().textContent).to.equal(TdMediaPicker.labels.loadingInitial);
    expect(loadingNote().hidden).to.equal(false);
    const changes = [];
    document.querySelector('td-media-picker').addEventListener('selection-change', (e) => changes.push(e));
    getCall(ad, 'm2').resolve();
    getCall(ad, 'm3').resolve();
    await wait(20);
    expect(selCount()).to.equal(0);
    getCall(ad, 'm1').resolve();
    await until(() => selCount() === 3);
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 3');
    expect(btnText(confirmBtn())).to.equal('Chèn (3)');
    expect(loadingNote().hidden).to.equal(true);
    expect(changes.length, 'no selection-change for initial').to.equal(0);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m3', 'm1', 'm2']);
  });

  it('get(b) rejects → tray a, c', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2', 'm3']);
    getCall(ad, 'm1').resolve();
    getCall(ad, 'm2').reject(Object.assign(new Error('raw'), { code: 'not-found' }));
    getCall(ad, 'm3').resolve();
    await until(() => selCount() === 2);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m1', 'm3']);
  });

  it('adapter ignores the signal: a user pick cancels the transaction in the same task; late settles change nothing', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2']);
    ad.ignoreSignal = true;
    getCall(ad, 'm1').resolve();
    await wait(10);
    click(tick('m60')); // multiple (v0.33 tick mode): the tick selects, a click only views
    // same task: aborted + no "loading" note + X selected
    expect(getCall(ad, 'm2').signal.aborted).to.equal(true);
    expect(q('.td-media-picker__initial-loading').hidden).to.equal(true);
    expect(selCount()).to.equal(1);
    let unhandled = 0;
    const onUnhandled = () => { unhandled += 1; };
    window.addEventListener('unhandledrejection', onUnhandled);
    getCall(ad, 'm2').reject(new Error('late'));
    await wait(50);
    window.removeEventListener('unhandledrejection', onUnhandled);
    expect(unhandled).to.equal(0);
    expect(selCount()).to.equal(1);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });

  it('no user action: get(b) hangs → still waiting, "Chọn" works with the current model (initial absent)', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2']);
    getCall(ad, 'm1').resolve();
    await wait(30);
    expect(q('.td-media-picker__initial-loading').hidden).to.equal(false);
    click(tick('m59'));
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m59']);
  });

  it('confirm before the initial load finishes → outcome = current model (empty → announcement, then the user picks)', async () => {
    const { ad, promise } = await openInitial(['m1']);
    confirmBtn().click();
    await until(() => live() === TdMediaPicker.labels.selectFirst);
    expect(await peek(promise)).to.equal(PENDING);
    getCall(ad, 'm1').resolve();
    await until(() => selCount() === 1);
    confirmBtn().click();
    expect((await promise).selection[0].assetId).to.equal('m1');
  });
});

describe('td-media-picker — latest wins + abort (decision 9)', () => {
  it('typing a, ab, abc with pending lists resolved in reverse → only "abc" shows; older signals aborted', async () => {
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad });
    await until(() => ad.calls.list.length === 1);
    ad.calls.list[0].resolve();
    await until(() => items().length);
    ad.calls.list.length = 0;
    for (const t of ['anh-1', 'anh-11', 'anh-111']) await search(t);
    await until(() => ad.calls.list.length === 3);
    expect(ad.calls.list.map((c) => c.signal.aborted)).to.deep.equal([true, true, false]);
    ad.ignoreSignal = true;
    ad.calls.list[2].resolve({ items: [], nextCursor: null, total: 0 });
    ad.calls.list[1].resolve();
    ad.calls.list[0].resolve();
    await wait(50);
    expect(items().length).to.equal(0);
    expect(q('.td-media-picker__empty').hidden).to.equal(false);
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('search is debounced 250 ms (one request for a burst), Enter runs it now', async () => {
    const { ad } = await openReady();
    const n0 = ad.calls.list.length;
    const input = searchInput();
    input.focus();
    await sendKeys({ type: 'anh' });
    await wait(100);
    expect(ad.calls.list.length).to.equal(n0);
    await wait(300);
    expect(ad.calls.list.length).to.equal(n0 + 1);
    expect(ad.calls.list.at(-1).args[0].query).to.equal('anh');
    await sendKeys({ type: '-2' });
    await sendKeys({ press: 'Enter' });
    expect(ad.calls.list.length).to.equal(n0 + 2);
    expect(ad.calls.list.at(-1).args[0].query).to.equal('anh-2');
  });

  it('detail A then B quickly → B shown, get(A) aborted', async () => {
    const { ad } = await openReady();
    // v0.36.0 (QĐ 69): the open auto-previews m60 (one get, already settled) — view two OTHER assets quickly
    await until(() => ad.calls.get.length >= 1, 4000, 'auto preview get');
    const base = ad.calls.get.length;
    ad.manual = true;
    click(opener('m58'));
    click(opener('m59'));
    await until(() => ad.calls.get.length === base + 2);
    expect(ad.calls.get[base].signal.aborted).to.equal(true);
    ad.ignoreSignal = true;
    ad.calls.get[base + 1].resolve();
    ad.calls.get[base].resolve();
    await wait(30);
    expect(q('.td-media-picker__detail-name').textContent).to.equal(assetName('m59'));
  });

  it('close → pending list / facets / get / update all aborted; late resolves write nothing', async () => {
    const ad = createMockAdapter({ manual: true });
    const events = [];
    const promise = TdMediaPicker.open({ adapter: ad, assetFields: assetFields() });
    document.querySelector('td-media-picker').addEventListener('asset-change', (e) => events.push(e));
    await until(() => ad.calls.list.length && ad.calls.facets.length);
    ad.calls.list[0].resolve();
    await until(() => items().length);
    click(opener('m60'));
    await until(() => ad.calls.get.length);
    ad.calls.get[0].resolve();
    await detailReady('m60');
    const t1 = q('.td-media-picker__field[data-key="title"] input');
    t1.focus();
    await sendKeys({ type: 'x' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    saveBtn().click();
    await until(() => ad.calls.update.length);
    await search('x');
    await until(() => ad.calls.list.length === 2);
    document.querySelector('td-media-picker').close();
    await promise;
    for (const kind of ['list', 'facets', 'update']) {
      const pending = ad.calls[kind].filter((c) => !c.settled);
      expect(pending.every((c) => c.signal.aborted), kind).to.equal(true);
    }
    ad.ignoreSignal = true;
    ad.resolveAll();
    await wait(30);
    expect(events.length).to.equal(0);
  });
});

describe('td-media-picker — list states', () => {
  it('skeleton while loading → grid; aria-busy; nothing selected at open; count text', async () => {
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad, pageSize: 20 });
    await until(() => ad.calls.list.length);
    expect(q('.td-media-picker__skeleton').hidden).to.equal(false);
    expect(q('.td-media-picker__skeleton').querySelectorAll('.td-media-picker__skeleton-card').length).to.equal(30);
    expect(q('.td-media-picker__results').getAttribute('aria-busy')).to.equal('true');
    ad.calls.list[0].resolve();
    await until(() => items().length === 20);
    expect(q('.td-media-picker__skeleton').hidden).to.equal(true);
    expect(q('.td-media-picker__results').getAttribute('aria-busy')).to.equal('false');
    expect(grid().selectedIds.length).to.equal(0);
    expect(q('.td-media-picker__page-info').textContent).to.equal('Hiển thị 1-20 / 60 media');
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('empty with / without filter → the right empty text', async () => {
    const ad = createMockAdapter({ count: 0 });
    const { promise } = await openReady({ adapter: ad });
    expect(q('.td-media-picker__empty').getAttribute('title')).to.equal('Không có media nào');
    expect(q('.td-media-picker__empty').hasAttribute('message')).to.equal(false);
    await search('zzz');
    await until(() => q('.td-media-picker__empty').getAttribute('message') === 'Thử từ khoá khác');
    expect(q('.td-media-picker__empty').getAttribute('title')).to.equal('Không có media nào');
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('error → alert with the curated text (never the raw message) + "Thử lại" calls list again', async () => {
    const ad = createMockAdapter({ manual: true });
    const errs = [];
    const promise = TdMediaPicker.open({ adapter: ad });
    document.querySelector('td-media-picker').addEventListener('operation-error', (e) => errs.push(e.detail));
    await until(() => ad.calls.list.length);
    ad.calls.list[0].reject(Object.assign(new Error('SQLSTATE secret'), { code: 'network' }));
    await until(() => !q('.td-media-picker__error').hidden);
    expect(q('.td-media-picker__error').getAttribute('role')).to.equal('alert');
    expect(q('.td-media-picker__error-text').textContent).to.equal(TdMediaPicker.labels.error.network);
    expect(pickerRoot().textContent.includes('SQLSTATE')).to.equal(false);
    expect(errs).to.deep.equal([{ operation: 'list', code: 'network', retryable: true }]);
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 2);
    ad.calls.list[1].resolve();
    await until(() => items().length);
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('"›" (v0.33 replaces "Tải thêm") sends nextCursor and REPLACES the page; wrong kinds hidden', async () => {
    const { ad } = await openReady({ pageSize: 25, selection: { mode: 'single', kinds: ['image'] } });
    expect(ad.calls.list[0].args[0].kinds).to.deep.equal(['image']);
    const first = ids().join();
    expect(items().every((i) => i.getAttribute('data-kind') === 'image')).to.equal(true);
    q('.td-media-picker__next').click();
    await until(() => ids().length && ids().join() !== first);
    expect(ad.calls.list.at(-1).args[0].cursor).to.equal('25');
    expect(ids().some((id) => first.split(',').includes(id))).to.equal(false);
  });

  it('an adapter returning other kinds anyway → hidden + one warning', async () => {
    const ad = createMockAdapter();
    const list = ad.list;
    ad.list = (req) => list({ ...req, kinds: null });
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    extra.push(() => { console.warn = orig; });
    await openReady({ adapter: ad, selection: { mode: 'single', kinds: ['video'] } });
    expect(items().every((i) => i.getAttribute('data-kind') === 'video')).to.equal(true);
    expect(warns.filter((w) => /other kinds/.test(w)).length).to.equal(1);
  });
});

describe('td-media-picker — selection (decision 13)', () => {
  it('single: click A selects + detail; click B replaces; grid has no max', async () => {
    const { promise } = await openReady();
    expect(grid().hasAttribute('max')).to.equal(false);
    click(opener('m60'));
    await until(() => q('.td-media-picker__detail-name')?.textContent === assetName('m60'));
    expect(grid().selectedIds).to.deep.equal(['m60']);
    click(opener('m59'));
    expect(grid().selectedIds).to.deep.equal(['m59']);
    expect(grid().hasAttribute('max')).to.equal(false);
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m59']);
  });

  it('single: Space on B after A → B replaces A (keyboard)', async () => {
    await openReady();
    click(opener('m60'));
    opener('m58').focus();
    await sendKeys({ press: 'Space' });
    expect(grid().selectedIds).to.deep.equal(['m58']);
  });

  it('single + Shift (R2-2): select 5th, Shift+click 2nd → only the 2nd, never two at once, one selection-change, "Đã chọn 1"', async () => {
    await openReady();
    const [a, b, , , e] = ids();
    click(opener(e));
    const host = document.querySelector('td-media-picker');
    const changes = [];
    host.addEventListener('selection-change', (ev) => changes.push(ev.detail));
    let maxSeen = 0;
    const mo = new MutationObserver(() => {
      maxSeen = Math.max(maxSeen, grid().querySelectorAll('[data-td-media-item][data-selected]').length);
    });
    mo.observe(grid(), { attributes: true, subtree: true, attributeFilter: ['data-selected', 'aria-pressed'] });
    click(opener(b), { shiftKey: true });
    await wait(20);
    mo.disconnect();
    expect(grid().selectedIds).to.deep.equal([b]);
    expect(maxSeen <= 1, `max simultaneously selected ${maxSeen}`).to.equal(true);
    expect(changes.length).to.equal(1);
    expect(changes[0].addedIds).to.deep.equal([b]);
    expect(changes[0].removedIds).to.deep.equal([e]);
    expect(grid().querySelector('[aria-live]').textContent).to.equal('Đã chọn 1');
    // Shift+Space the same way
    opener(a).focus();
    await sendKeys({ press: 'Shift+Space' });
    expect(grid().selectedIds).to.deep.equal([a]);
    // tick of an unselected item → replace; v0.33 decision 16: a click = select + view, so clicking the selected one
    // keeps it (Space on it still deselects)
    click(tick(e));
    expect(grid().selectedIds).to.deep.equal([e]);
    click(opener(e));
    expect(grid().selectedIds).to.deep.equal([e]);
    opener(e).focus();
    await sendKeys({ press: 'Space' });
    expect(grid().selectedIds).to.deep.equal([]);
  });

  it('multiple maxItems=3: the 4th is blocked + announcement; retained across searches; selection order', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 3 } });
    click(tick('m60'));
    click(tick('m59'));
    await search('anh-1');
    await until(() => ids().every((id) => assetName(id).includes('anh-1')) && items().length);
    click(tick('m19'));
    expect(selCount()).to.equal(3);
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 3/3');
    click(tick('m18'));
    await wait(20);
    expect(grid().selectedIds.includes('m18')).to.equal(false);
    expect(selCount()).to.equal(3);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm59', 'm19']);
  });

  it('capacity used up by items outside the page (R1-2): no max="0", every flip vetoed, then one slot frees max=1', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 3 } });
    click(tick('m60'));
    click(tick('m59'));
    click(opener('m58'), { ctrlKey: true }); // tick mode: Ctrl/Cmd+click flips
    await search('anh-1');
    await until(() => items().length && ids().every((id) => assetName(id).includes('anh-1')));
    expect(grid().hasAttribute('max')).to.equal(false);
    click(tick('m19'));
    click(opener('m18'), { ctrlKey: true });
    opener('m17').focus();
    await sendKeys({ press: 'Space' });
    click(opener('m16'), { shiftKey: true });
    await wait(30);
    expect(grid().selectedIds).to.deep.equal([]);
    expect(items().every((i) => i.querySelector('.td-media-grid__tick')?.getAttribute('aria-pressed') !== 'true')).to.equal(true);
    expect(live()).to.equal('Tối đa 3 mục');
    // free one slot (v0.33: no tray — untick m60 on its page, then back to the query)
    await search('');
    await until(() => item('m60') && grid().selectedIds.includes('m60'), 3000, 'page 1 back');
    click(tick('m60'));
    await search('anh-1');
    await until(() => item('m19') && ids().every((id) => assetName(id).includes('anh-1')), 3000, 'anh-1 back');
    expect(grid().getAttribute('max')).to.equal('1');
    click(tick('m19'));
    expect(grid().selectedIds).to.deep.equal(['m19']);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m59', 'm58', 'm19']);
  });

  it('"Bỏ chọn tất cả" + deselect from the tray; processing item not selectable + announcement', async () => {
    await openReady({ selection: { mode: 'multiple' } });
    click(tick('m60'));
    click(tick('m59'));
    expect(btnText(q('.td-media-picker__clear'))).to.equal('Bỏ chọn tất cả');
    q('.td-media-picker__clear').click();
    expect(selCount()).to.equal(0);
    expect(grid().selectedIds).to.deep.equal([]);
    // m7 is processing
    await search('anh-7');
    await until(() => item('m7'));
    click(tick('m7'));
    await wait(20);
    expect(grid().selectedIds).to.deep.equal([]);
    expect(live()).to.equal(TdMediaPicker.labels.notReady);
  });

  it('keyboard only: Tab → search, type, Tab → grid, Space selects, Enter opens detail (no confirm), Tab → "Chọn", Enter resolves', async () => {
    const { promise } = await openReady();
    expect(document.activeElement === searchInput()).to.equal(true);
    await sendKeys({ type: 'anh-5' });
    await sendKeys({ press: 'Enter' }); // runs the search, never confirms
    await until(() => items().length && ids().every((id) => assetName(id).includes('anh-5')));
    expect(await peek(promise)).to.equal(PENDING);
    let guard = 0;
    while (!document.activeElement?.matches('[data-td-media-open]') && guard++ < 10) await sendKeys({ press: TAB });
    const focusedId = document.activeElement.closest('[data-td-media-item]').getAttribute('data-id');
    await sendKeys({ press: 'Space' });
    expect(grid().selectedIds).to.deep.equal([focusedId]);
    await sendKeys({ press: 'Enter' });
    await until(() => q('.td-media-picker__detail-name')?.textContent === assetName(focusedId));
    expect(await peek(promise)).to.equal(PENDING);
    guard = 0;
    while (document.activeElement !== confirmBtn().querySelector('button') && guard++ < 40) await sendKeys({ press: TAB });
    await sendKeys({ press: 'Enter' });
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([focusedId]);
  });
});

describe('td-media-picker — upload (decisions 19-20; v0.33: nested dialog, decisions 20-22)', () => {
  it('"Tải lên" hidden without upload() AND uploadFromUrl() or with both capabilities false; shown with only one source', async () => {
    await openReady({}, { upload: false, uploadFromUrl: false });
    expect(q('.td-media-picker__upload-btn') === null).to.equal(true);
    await closeAll();
    await openReady({ capabilities: { upload: false, uploadFromUrl: false } });
    expect(q('.td-media-picker__upload-btn') === null).to.equal(true);
    await closeAll();
    await openReady({ capabilities: { upload: false } });
    expect(q('.td-media-picker__upload-btn') !== null, 'URL source only').to.equal(true);
    await closeAll();
    await openReady({}, { uploadFromUrl: false });
    expect(q('.td-media-picker__upload-btn') !== null, 'file source only').to.equal(true);
  });

  it('required upload field empty → dropzone disabled; fields captured at start; signal; progress; remove → aborted', async () => {
    const { ad } = await openReady({ uploadFields: uploadFields() });
    await openUpload();
    expect(dropzone().hasAttribute('disabled')).to.equal(true);
    expect(uploadRoot().querySelector('.td-media-picker-upload__hint').hidden).to.equal(false);
    await ddPick(uploadRoot().querySelector('.td-media-picker__field[data-key="album"] td-dropdown'), 'Tin tức');
    await until(() => !dropzone().hasAttribute('disabled'), 3000, 'dropzone enabled');
    ad.manual = true;
    dropzone().addFiles([file('a.png')]);
    await until(() => ad.calls.upload.length === 1);
    const [, opts] = ad.calls.upload[0].args;
    expect(opts.fields).to.deep.equal({ album: 2 });
    expect(opts.signal instanceof AbortSignal).to.equal(true);
    opts.onProgress({ loaded: 50, total: 100 });
    await until(() => dropzone().querySelector('td-progress')?.getAttribute('value') === '50');
    opts.onProgress({ loaded: 1, percent: 80 });
    await until(() => dropzone().querySelector('td-progress')?.getAttribute('value') === '80');
    dropzone().querySelector('.td-dropzone__remove').click();
    expect(opts.signal.aborted).to.equal(true);
    await wait(20);
    expect(dropzone().querySelector('[data-status="error"]') === null).to.equal(true);
  });

  it('created → first in the grid (page 1 reloaded), selected (single replaces A), detail, announcement, asset-change', async () => {
    const { ad, promise } = await openReady();
    click(opener('m60'));
    const host = document.querySelector('td-media-picker');
    const changes = [];
    host.addEventListener('asset-change', (e) => changes.push(e.detail));
    const said = liveLog();
    await openUpload();
    dropzone().addFiles([file('moi.png')]);
    await until(() => changes.length === 1, 4000);
    expect(changes[0].operation).to.equal('upload');
    expect(changes[0].deduplication).to.deep.equal({ outcome: 'created' });
    const newId = changes[0].asset.id;
    await until(() => ids()[0] === newId);
    expect(grid().selectedIds).to.deep.equal([newId]);
    await until(() => said.some((x) => x.includes('moi.png')), 3000, 'announced');
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'moi.png', 3000, 'detail of the upload');
    void ad;
    await until(() => uploadRoot() === null, 3000, 'dialog closed (no error)');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([newId]);
  });

  it('exact-reused → no duplicate, matched asset selected (replaces A), "dùng lại" announcement', async () => {
    const { promise } = await openReady();
    click(opener('m60'));
    const said = liveLog();
    await openUpload();
    const n = items().length;
    dropzone().addFiles([file(assetName('m58'), 'image/jpeg')]);
    await until(() => said.includes(TdMediaPicker.labels.reused.replace('{name}', assetName('m58'))), 4000, 'reused announced');
    await until(() => grid().selectedIds.join() === 'm58', 3000, 'm58 selected');
    expect(ids().filter((id) => id === 'm58').length).to.equal(1);
    expect(items().length).to.equal(n);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
  });

  it('rejection: only userMessage shows; none → labels.uploadError; fieldErrors → on the upload control', async () => {
    const { ad } = await openReady({ uploadFields: [{ key: 'note', label: 'Ghi chú', control: 'text' }] });
    await openUpload();
    ad.manual = true;
    dropzone().addFiles([file('x1.png')]);
    await until(() => ad.calls.upload.length === 1);
    ad.calls.upload[0].reject(Object.assign(new Error('raw /var/www trace'), { code: 'validation', userMessage: 'File quá lớn', fieldErrors: { note: ['Bắt buộc'] } }));
    await until(() => dropzone().querySelector('[data-status="error"]'));
    expect(dropzone().querySelector('.td-dropzone__status').textContent).to.equal('File quá lớn');
    expect(pickerRoot().textContent.includes('/var/www')).to.equal(false);
    expect(uploadRoot().textContent.includes('/var/www')).to.equal(false);
    await until(() => uploadRoot().querySelector('.td-media-picker__field[data-key="note"] [aria-invalid="true"]'));
    dropzone().addFiles([file('x2.png')]);
    await until(() => ad.calls.upload.length === 2);
    ad.calls.upload[1].reject(new Error('Internal Server Error <stack>'));
    await until(() => dropzone().querySelectorAll('[data-status="error"]').length === 2);
    const texts = [...dropzone().querySelectorAll('.td-dropzone__status')].map((x) => x.textContent);
    expect(texts.includes(TdMediaPicker.labels.error.server) || texts.includes(TdMediaPicker.labels.uploadError)).to.equal(true);
    expect(pickerRoot().textContent.includes('<stack>')).to.equal(false);
    expect(uploadRoot().textContent.includes('<stack>')).to.equal(false);
  });

  it('single + processing result → A kept, B unselected, notReady', async () => {
    const ad = createMockAdapter();
    const up = ad.upload;
    ad.upload = (f, o) => up(f, o).then((r) => ({ ...r, asset: { ...r.asset, status: 'processing' } }));
    await openReady({ adapter: ad });
    click(opener('m60'));
    await openUpload();
    dropzone().addFiles([file('cho.png')]);
    await until(() => live() === TdMediaPicker.labels.notReady, 4000);
    expect(grid().selectedIds).to.deep.equal(['m60']);
  });

  it('multiple maxItems=2 full → upload D not selected, "Tối đa 2 mục"', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 2 } });
    click(tick('m60'));
    click(tick('m59'));
    await openUpload();
    dropzone().addFiles([file('d.png')]);
    await until(() => live() === 'Tối đa 2 mục', 4000);
    await until(() => uploadRoot() === null, 3000, 'dialog closed');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm59']);
  });

  it('single + upload finishing while initialIds still pending → initial cancelled, B wins', async () => {
    const ad = createMockAdapter();
    const get = ad.get;
    let hang;
    ad.get = (id, o) => (id === 'm3' ? new Promise((r) => { hang = r; }) : get(id, o));
    const changes = [];
    const promise = TdMediaPicker.open({ adapter: ad, selection: { mode: 'single', initialIds: ['m3'] } });
    document.querySelector('td-media-picker').addEventListener('asset-change', (e) => changes.push(e.detail));
    await until(() => items().length);
    await openUpload();
    dropzone().addFiles([file('b.png')]);
    await until(() => changes.length, 4000);
    hang?.(ad.db.get('m3'));
    await until(() => uploadRoot() === null, 3000, 'dialog closed');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([changes[0].asset.id]);
  });
});

describe('td-media-picker — edit metadata (decision 21-22; v0.33: always-open inline form, decision 18)', () => {
  const openEdit = async (id = 'm60', o = {}) => {
    const r = await openReady({ assetFields: assetFields(), ...o });
    click(opener(id));
    await detailReady(id);
    await until(() => saveBtn(), 3000, 'save button');
    return r;
  };
  /** type into the title field so the form is dirty (Save is enabled only then) */
  const dirtyTitle = async (text = 'x') => {
    const input = q('.td-media-picker__field[data-key="title"] input');
    input.focus();
    await sendKeys({ type: text });
    await until(() => saveEnabled(), 3000, 'save enabled');
  };

  it('no Save / readonly fields without update / editMetadata false / per-asset editMetadata false', async () => {
    await openReady({ assetFields: assetFields() }, { update: false });
    click(opener('m60'));
    await detailReady('m60');
    expect(saveBtn() === null).to.equal(true);
    expect(q('.td-media-picker__detail td-input-field') === null, 'readonly text only').to.equal(true);
    expect(q('.td-media-picker__field[data-key="title"] .td-media-picker__readonly-value').textContent).to.equal('Ảnh mẫu 60');
    await closeAll();
    await openReady({ assetFields: assetFields(), capabilities: { editMetadata: false } });
    click(opener('m60'));
    await detailReady('m60');
    expect(saveBtn() === null).to.equal(true);
    await closeAll();
    await openReady({ assetFields: assetFields() });
    await search('anh-5');
    await until(() => item('m5'));
    click(opener('m5')); // per-asset capabilities.editMetadata false
    await detailReady('m5', 'anh-5.jpg');
    expect(saveBtn() === null).to.equal(true);
  });

  it('7 descriptor controls; visibleWhen; save → update(id, { fields, version }) + asset replaced everywhere + event', async () => {
    const { ad } = await openEdit('m60', { selection: { mode: 'multiple' } });
    const field = (k) => q(`.td-media-picker__field[data-key="${k}"]`);
    for (const k of ['title', 'caption', 'source', 'license', 'tags', 'checksum']) expect(field(k) !== null, k).to.equal(true);
    expect(field('title').querySelector('td-input-field') !== null).to.equal(true);
    expect(field('license').querySelector('td-dropdown') !== null).to.equal(true);
    expect(field('tags').querySelector('td-chip-input') !== null).to.equal(true);
    expect(field('licenseExpiry') === null || field('licenseExpiry').hidden).to.equal(true);
    expect(saveBtn().hasAttribute('disabled'), 'clean form → Save disabled').to.equal(true);
    const host = document.querySelector('td-media-picker');
    const changes = [];
    host.addEventListener('asset-change', (e) => changes.push(e.detail));
    const input = field('title').querySelector('input');
    input.focus();
    input.select();
    await sendKeys({ type: 'Tên mới' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    saveBtn().click();
    await until(() => changes.length === 1);
    const [id, patch] = ad.calls.update[0].args;
    expect(id).to.equal('m60');
    expect(patch.version).to.equal(1);
    expect(patch.fields.title).to.equal('Tên mới');
    expect('licenseExpiry' in patch.fields).to.equal(false);
    expect(changes[0].operation).to.equal('update');
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'Tên mới');
    expect(item('m60').querySelector('.td-media-picker__name').textContent).to.equal('Tên mới');
    expect(live()).to.equal(TdMediaPicker.labels.saved);
  });

  it('server fieldErrors → control aria-invalid + general list; focus on the first; conflict → "Tải lại"', async () => {
    const { ad } = await openEdit();
    ad.manual = true;
    await dirtyTitle();
    saveBtn().click();
    await until(() => ad.calls.update.length === 1);
    ad.calls.update[0].reject(Object.assign(new Error('raw'), { code: 'validation', fieldErrors: { license: ['Chưa hợp lệ'], unknown: ['Lỗi chung <b>x</b>'] } }));
    await until(() => q('.td-media-picker__field[data-key="license"] [aria-invalid="true"]'));
    const general = q('.td-media-picker__form-errors');
    expect(general.hidden).to.equal(false);
    expect(general.textContent.includes('Lỗi chung <b>x</b>')).to.equal(true);
    expect(general.querySelector('b') === null).to.equal(true);
    expect(q('.td-media-picker__field[data-key="license"]').contains(document.activeElement)).to.equal(true);
    await until(() => saveEnabled(), 3000, 'save enabled again (still dirty)');
    saveBtn().click();
    await until(() => ad.calls.update.length === 2);
    ad.calls.update[1].reject(Object.assign(new Error('raw'), { code: 'conflict' }));
    await until(() => q('.td-media-picker__reload'));
    const input = q('.td-media-picker__field[data-key="title"] input');
    input.value = 'đang gõ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(30);
    expect(input.value).to.equal('đang gõ'); // never wiped without the user asking
    q('.td-media-picker__reload').click();
    await until(() => ad.calls.get.length >= 2);
    ad.calls.get.at(-1).resolve();
    await until(() => q('.td-media-picker__field[data-key="title"] input').value === 'Ảnh mẫu 60');
  });

  it('dirty + another item → confirm; no autosave on view; Ctrl/Cmd+Enter in the form = save', async () => {
    const { ad } = await openEdit('m60', { selection: { mode: 'multiple' } });
    const input = q('.td-media-picker__field[data-key="title"] input');
    input.focus();
    await sendKeys({ type: 'x' });
    // Enter always activates (opens the detail) → the detail switch is gated
    opener('m59').focus();
    await sendKeys({ press: 'Enter' });
    await until(() => discardDialog(), 3000, 'discard dialog');
    clickDiscard(false);
    await wait(50);
    expect(q('.td-media-picker__detail-name').textContent).to.equal(assetName('m60'));
    expect(saveBtn() !== null).to.equal(true);
    expect(ad.calls.update.length).to.equal(0);
    q('.td-media-picker__field[data-key="caption"] textarea').focus();
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    await sendKeys({ press: mac ? 'Meta+Enter' : 'Control+Enter' });
    await until(() => ad.calls.update.length === 1);
  });

  it('date (R2-10): metadata 2027-03-31 shows 31/03/2027; a new pick → exact YYYY-MM-DD; cleared → null; broken → empty + one warning', async () => {
    const ad = createMockAdapter();
    ad.db.get('m60').metadata.license = 'licensed';
    ad.db.get('m60').metadata.licenseExpiry = '2027-03-31';
    ad.db.get('m59').metadata.license = 'licensed';
    ad.db.get('m59').metadata.licenseExpiry = '31/03/2027';
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    extra.push(() => { console.warn = orig; });
    await openReady({ adapter: ad, assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const dtp = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd2');
    await until(() => dtp.querySelector('.td-dtp__value')?.textContent.trim() === '31/03/2027', 3000, 'date shown');
    dtp.setDBValue('2027-04-15');
    dtp.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => saveEnabled(), 3000, 'save enabled');
    saveBtn().click();
    await until(() => ad.calls.update.length === 1, 3000, 'd3');
    expect(ad.calls.update[0].args[1].fields.licenseExpiry).to.equal('2027-04-15');
    await until(() => saveBtn() && saveBtn().hasAttribute('disabled') && !saveBtn().hasAttribute('loading'), 3000, 'd4 saved');
    const dtp2 = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd5');
    dtp2.setDBValue('');
    dtp2.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => saveEnabled(), 3000, 'save enabled 2');
    saveBtn().click();
    await until(() => ad.calls.update.length === 2, 3000, 'd6');
    expect(ad.calls.update[1].args[1].fields.licenseExpiry).to.equal(null);
    await until(() => saveBtn() && saveBtn().hasAttribute('disabled') && !saveBtn().hasAttribute('loading'), 3000, 'saved'); // a running save is "dirty"
    // broken metadata
    click(tick('m60'));
    click(opener('m59'));
    await detailReady('m59');
    const dtp3 = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd9');
    expect(dtp3.getDBValue() || '').to.equal('');
    expect(warns.filter((w) => /date|ngày|YYYY/i.test(w)).length).to.equal(1);
  });
});

describe('td-media-picker — facets + typed scalars (decision 18, R1-6)', () => {
  it('3 facet types → filters in the next request; facets reloaded with the same query', async () => {
    const { ad } = await openReady();
    await until(() => q('.td-media-picker__facets td-dropdown'), 3000, 'facet dropdown');
    const dd = q('.td-media-picker__facets td-dropdown');
    await ddPick(dd, 'Sản phẩm (20)');
    await until(() => ad.calls.list.at(-1).args[0].filters.album === 1, 3000, 'album filter');
    await until(() => ad.calls.facets.at(-1).args[0].filters.album === 1, 3000, 'facets reloaded');
    q('.td-media-picker__facets td-toggle input').click();
    await until(() => ad.calls.list.at(-1).args[0].filters.scope === 'mine', 3000, 'scope filter');
    await until(() => ad.calls.facets.length >= 3 && ad.calls.facets.every((c) => c.settled), 3000, 'facets settled');
    await wait(30);
    await chipPick(q('.td-media-picker__facets td-chip-input'), 'Hero');
    await until(() => JSON.stringify(ad.calls.list.at(-1).args[0].filters.tags) === '["hero"]', 3000, 'tags filter');
    // v0.33: no "Bộ lọc (n)" toggle — the three filters are all in force, inline
    expect(Object.keys(ad.calls.list.at(-1).args[0].filters).sort()).to.deep.equal(['album', 'scope', 'tags']);
    expect(q('.td-media-picker__filters-toggle') === null).to.equal(true);
  });

  it('typed facet values: 1, "1", true, null are distinct; multiple keeps 1 and "1"', async () => {
    const ad = createMockAdapter();
    ad.facets = async () => [
      { key: 'k', label: 'K', type: 'single', options: [{ value: 1, label: 'số 1' }, { value: '1', label: 'chuỗi 1' }, { value: true, label: 'đúng' }, { value: null, label: 'rỗng' }] },
      { key: 'm', label: 'M', type: 'multiple', options: [{ value: 1, label: 'số 1' }, { value: '1', label: 'chuỗi 1' }] },
    ];
    const calls = [];
    const list = ad.list;
    ad.list = (req) => { calls.push(req); return list({ ...req, filters: {} }); };
    await openReady({ adapter: ad });
    await until(() => q('.td-media-picker__facets td-dropdown'));
    const dd = q('.td-media-picker__facets td-dropdown');
    const pick = async (label, want) => {
      await ddPick(dd, label);
      await until(() => calls.length && Object.is(calls.at(-1).filters.k, want), 2000, `k=${String(want)}`);
    };
    await pick('số 1', 1);
    await pick('chuỗi 1', '1');
    await pick('đúng', true);
    await pick('rỗng', null);
    const chips = q('.td-media-picker__facets td-chip-input');
    await chipPick(chips, 'số 1');
    await chipPick(chips, 'chuỗi 1');
    await until(() => Array.isArray(calls.at(-1).filters.m) && calls.at(-1).filters.m.length === 2, 2000, 'm filter');
    const m = calls.at(-1).filters.m;
    expect(m.some((v) => v === 1) && m.some((v) => v === '1')).to.equal(true);
  });
});

describe('td-media-picker — cache after a change (R1-7)', () => {
  it('rename A to "Z" → current list reloads, A still selected; back to the old query → list called again, tile says "Z"', async () => {
    const { ad } = await openReady({ assetFields: assetFields(), selection: { mode: 'multiple' } });
    click(tick('m60'));
    opener('m60').focus();
    await sendKeys({ press: 'Enter' });
    await detailReady('m60');
    const input = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    input.focus();
    input.select();
    await sendKeys({ type: 'Z' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    const before = ad.calls.list.length;
    const facetsBefore = ad.calls.facets.length;
    saveBtn().click();
    await until(() => ad.calls.list.length === before + 1);
    expect(ad.calls.facets.length > facetsBefore).to.equal(true);
    await until(() => grid().selectedIds.includes('m60') && item('m60').querySelector('.td-media-picker__name').textContent === 'Z', 3000, 'reloaded, still selected');
    await search('anh-59');
    await until(() => ids().join() === 'm59', 3000, 'search 59');
    const n = ad.calls.list.length;
    await search('');
    await until(() => ad.calls.list.length === n + 1, 3000, 'list called again');
    await until(() => item('m60')?.querySelector('.td-media-picker__name').textContent === 'Z', 3000, 'tile Z');
    expect(grid().selectedIds.includes('m60')).to.equal(true);
    expect(selCount()).to.equal(1);
  });

  it('upload created → back to the previous query shows the new item (cache dropped)', async () => {
    const { ad } = await openReady();
    await search('anh-1');
    await until(() => items().length && ids().every((id) => assetName(id).includes('anh-1')));
    await search('');
    await until(() => ids()[0] === 'm60');
    await openUpload();
    dropzone().addFiles([file('anh-1-moi.png')]);
    await until(() => ids()[0] !== 'm60', 4000);
    const n = ad.calls.list.length;
    await search('anh-1');
    await until(() => ad.calls.list.length > n);
    await until(() => items().some((i) => i.querySelector('.td-media-picker__name').textContent === 'anh-1-moi.png'));
  });
});

describe('td-media-picker — mobile, motion, forced colours', () => {
  it('375×740 (v0.33: full viewport, no sheet): detail pane slides over the list + "Quay lại" returns focus; v0.36: facets behind "Bộ lọc"; footer count only', async () => {
    await setViewport({ width: 375, height: 740 });
    await openReady({ selection: { mode: 'multiple', maxItems: 5 } });
    await openSettled();
    const dialog = q('.td-media-picker__dialog');
    const r = dialog.getBoundingClientRect();
    expect(Math.abs(r.bottom - 740) <= 1, `bottom ${r.bottom}`).to.equal(true);
    expect(Math.abs(r.top) <= 1, `top ${r.top}`).to.equal(true);
    expect(Math.abs(r.width - 375) <= 1, `width ${r.width}`).to.equal(true);
    await until(() => q('.td-media-picker__facets') && !q('.td-media-picker__facets').hidden, 3000, 'facets');
    // v0.36.0 (QĐ 49): < 1024 the facets leave the toolbar for the "Bộ lọc" sheet trigger
    expect(getComputedStyle(q('.td-media-picker__facets')).display).to.equal('none');
    expect(getComputedStyle(q('.td-media-picker__filter')).display).to.not.equal('none');
    click(tick('m60'));
    expect(q('.td-media-picker__tray-list') === null, 'no thumb tray').to.equal(true);
    expect(selCount()).to.equal(1);
    opener('m59').focus();
    await sendKeys({ press: 'Enter' });
    await until(() => pickerRoot().getAttribute('data-view') === 'detail', 3000, 'detail view');
    await until(() => document.activeElement === q('.td-media-picker__detail-name'), 3000, 'pane heading focused');
    q('.td-media-picker__back').click();
    await until(() => document.activeElement === opener('m59'), 3000, 'focus back on the item');
    expect(pickerRoot().getAttribute('data-view')).to.equal('grid');
  });

  it('reduced motion → no transform on the opening dialog', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const p = TdMediaPicker.open({ adapter: createMockAdapter() });
    const dialog = q('.td-media-picker__dialog', anyRoot());
    expect(getComputedStyle(dialog).transform === 'none' || getComputedStyle(dialog).transform === '').to.equal(true);
    document.querySelector('td-media-picker').close();
    await p;
  });

  it('forced colours → dialog, cards and buttons keep a visible border', async () => {
    await emulateMedia({ forcedColors: 'active' });
    extra.push(() => emulateMedia({ forcedColors: 'none' }));
    if (!matchMedia('(forced-colors: active)').matches) return; // engine cannot emulate
    await openReady();
    const bw = (el) => parseFloat(getComputedStyle(el).borderTopWidth);
    expect(bw(q('.td-media-picker__dialog')) > 0).to.equal(true);
    expect(bw(item('m60')) > 0).to.equal(true);
    expect(bw(q('.td-media-picker__cancel .td-btn')) > 0).to.equal(true);
  });
});

describe('td-media-picker — XSS / safety', () => {
  const PAY = '<img src=x onerror="window.__mpXss=1">';
  it('every adapter / descriptor / message string is text; unsafe URLs never reach src; no style / on* attributes; no new globals', async () => {
    window.__mpXss = 0;
    const globals = new Set(Object.keys(window));
    const ad = createMockAdapter({ count: 3 });
    for (const a of ad.db.values()) {
      a.name = PAY;
      a.badges = [{ key: 'x', label: PAY, tone: 'danger' }];
      a.uploadedByLabel = PAY;
    }
    ad.db.get('m1').urls = { thumbnail: 'javascript:alert(1)', preview: 'data:image/svg+xml,<svg onload=alert(1)>' };
    ad.db.get('m2').urls = { thumbnail: 'file:///etc/passwd', preview: 'file:///etc/passwd' };
    ad.facets = async () => [{ key: 'k', label: PAY, type: 'single', options: [{ value: 1, label: PAY, count: 1 }] }];
    const created = [];
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          for (const el of [n, ...n.querySelectorAll('*')]) {
            if (el.localName === 'script' || (el.localName === 'img' && el.hasAttribute('onerror'))) created.push(el.localName);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    await openReady({
      adapter: ad,
      assetFields: [{ key: 'title', label: PAY, control: 'text', helpText: PAY }],
      messages: { title: PAY, confirm: PAY, loadMore: () => PAY },
    });
    click(opener('m3'));
    await until(() => q('.td-media-picker__detail-name')?.textContent === PAY && !q('.td-media-picker__detail').hasAttribute('data-loading'));
    await until(() => saveBtn());
    q('.td-media-picker__field[data-key="title"] input').focus();
    await sendKeys({ type: 'x' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    ad.manual = true;
    saveBtn().click();
    await until(() => ad.calls.update.length);
    ad.calls.update[0].reject(Object.assign(new Error(PAY), { code: 'validation', userMessage: PAY, fieldErrors: { title: [PAY], other: [PAY] } }));
    await wait(80);
    mo.disconnect();
    expect(created).to.deep.equal([]);
    expect(window.__mpXss).to.equal(0);
    const root = pickerRoot();
    expect(root.textContent.includes(PAY)).to.equal(true); // shown as text
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      expect(/^(javascript|data|file):/i.test(src), src).to.equal(false);
    }
    // v0.33 (plan decision 37): td-media-grid owns the tile sizing through CSSOM (not blocked by CSP style-src-attr) —
    // the ONLY inline styles allowed are those kit-owned sizing properties on a grid item / opener / its first media;
    // nothing from the adapter can ever reach a style.
    const GRID_OWNED = new Set(['width', 'height', 'max-width', 'object-fit', 'aspect-ratio']);
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.hasAttribute('style')) {
        const inGrid = !!el.closest('td-media-grid [data-td-media-item]');
        const props = [...el.style];
        const ok = inGrid && props.length > 0 && props.every((p) => GRID_OWNED.has(p) || p.startsWith('--td-mg-'));
        expect(ok, `${el.localName}.${el.className} style="${el.getAttribute('style')}"`).to.equal(true);
      }
      for (const a of el.attributes) expect(/^on/i.test(a.name), `${el.localName} ${a.name}`).to.equal(false);
    }
    const added = Object.keys(window).filter((k) => !globals.has(k) && k !== '__mpXss');
    expect(added).to.deep.equal([]);
  });
});

describe('td-media-picker + td-media-field (integration, real picker)', () => {
  it('the field opens the real picker (title, kinds, initialIds = [value]); a pick sets value + one change; FormData', async () => {
    await import('../form/td-media-field.js');
    const ad = createMockAdapter();
    const form = document.createElement('form');
    form.innerHTML = '<td-media-field name="hero" label="Ảnh đại diện" aspect-ratio="3/2" value="m58" '
      + 'preview-src="/test/fixtures/2.svg" preview-alt="anh-58.jpg"></td-media-field>';
    document.body.appendChild(form);
    extra.push(() => form.remove());
    const field = form.querySelector('td-media-field');
    field.adapter = ad;
    const changes = [];
    field.addEventListener('change', (e) => changes.push(e.detail.value));
    const openBtn = field.querySelector('.td-media-field__open');
    openBtn.focus();
    openBtn.click();
    openBtn.click(); // double click → one picker
    await until(() => pickerRoot() && items().length, 3000, 'picker open');
    expect(document.querySelectorAll('td-media-picker').length).to.equal(1);
    expect(q('.td-modal__title').textContent).to.equal('Ảnh đại diện');
    expect(ad.calls.list[0].args[0].kinds).to.deep.equal(['image']);
    expect(ad.calls.get.some((c) => c.args[0] === 'm58')).to.equal(true);
    await until(() => grid().selectedIds.includes('m58'), 3000, 'initial selection');
    expect(ad.calls.get.filter((c) => c.args[0] === 'm58').length).to.equal(1); // SSR preview: no lazy get by the field
    click(opener('m59'));
    confirmBtn().click();
    await until(() => field.value === 'm59', 3000, 'value');
    expect(changes).to.deep.equal(['m59']);
    expect(new FormData(form).getAll('hero')).to.deep.equal(['m59']);
    await wait(350);
    expect(document.activeElement === openBtn || field.contains(document.activeElement), 'focus back in the field').to.equal(true);
  });
});

describe('td-media-picker — review SEC-2: raw adapter errors never reach the console', () => {
  it('list / facets / get / initial / upload / update rejections + a malformed upload result → only strings without the secret', async () => {
    const SECRET = 'tok_PICKER_SECRET_42';
    const bad = (what) => Object.assign(new Error(`${what} failed: ${SECRET}`), {
      code: 'server', response: { body: `<pre>${SECRET}</pre>` }, url: `https://api.test/media?token=${SECRET}`,
    });
    const logged = [];
    const real = {};
    for (const k of ['warn', 'error', 'log', 'info', 'debug']) {
      real[k] = console[k];
      console[k] = (...a) => logged.push(a);
    }
    extra.push(() => { for (const k of Object.keys(real)) console[k] = real[k]; });
    const ad = createMockAdapter();
    const list = ad.list;
    let listCalls = 0;
    ad.list = (req) => (++listCalls === 2 ? Promise.reject(bad('list')) : list(req));
    ad.facets = () => Promise.reject(bad('facets'));
    const get = ad.get;
    ad.get = (id, o) => (id === 'm60' || id === 'm2' ? Promise.reject(bad('get')) : get(id, o));
    let uploads = 0;
    ad.upload = () => (++uploads === 1 ? Promise.reject(bad('upload')) : Promise.resolve({ asset: { secret: SECRET }, deduplication: {} }));
    ad.update = () => Promise.reject(bad('update'));
    const promise = TdMediaPicker.open({ adapter: ad, assetFields: assetFields(), selection: { mode: 'multiple', initialIds: ['m2'] } });
    await until(() => items().length, 3000, 'list');
    click(opener('m59'));
    await detailReady('m59');
    await until(() => saveBtn(), 3000, 'save');
    q('.td-media-picker__field[data-key="title"] input').focus();
    await sendKeys({ type: 'x' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    saveBtn().click();
    await until(() => q('.td-media-picker__notice:not([hidden])'), 3000, 'update error');
    opener('m60').focus();
    await sendKeys({ press: 'Enter' }); // detail get(m60) rejects
    await until(() => discardDialog() || q('.td-media-picker__detail-name')?.textContent === assetName('m60'), 3000, 'detail');
    if (discardDialog()) clickDiscard(true);
    await until(() => discardDialog() === null, 3000, 'discard closed');
    await openUpload();
    dropzone().addFiles([file('a.png')]);
    await until(() => dropzone().querySelector('[data-status="error"]'), 3000, 'upload error');
    dropzone().addFiles([file('b.png')]);
    await until(() => dropzone().querySelectorAll('[data-status="error"]').length === 2, 3000, 'malformed upload');
    uploadRoot().querySelector('.td-modal__close').click(); // errors keep the dialog open — close it (nothing running)
    await until(() => uploadRoot() === null, 3000, 'upload dialog closed');
    await search('x'); // list #2 rejects
    await until(() => !q('.td-media-picker__error').hidden, 3000, 'list error');
    await wait(50);
    document.querySelector('td-media-picker').close();
    await promise;
    expect(logged.length > 0, 'something was logged (the gate is exercised)').to.equal(true);
    for (const args of logged) {
      for (const a of args) {
        expect(typeof a, `console arg ${String(a).slice(0, 60)}`).to.equal('string');
        expect(a.includes(SECRET), a).to.equal(false);
      }
    }
  });
});

describe('td-media-picker — impl review round 1', () => {
  const dirtyEdit = async (id = 'm60', o = {}) => {
    const r = await openReady({ assetFields: assetFields(), ...o });
    click(opener(id));
    await detailReady(id);
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'), 3000, 'title');
    title.focus();
    await sendKeys({ type: 'x' });
    return r;
  };

  it('#1 single + dirty form: activating another asset asks FIRST; selection + grid unchanged while asking; no → nothing changes; yes → switch', async () => {
    const { promise } = await dirtyEdit();
    const changes = [];
    document.querySelector('td-media-picker').addEventListener('selection-change', (e) => changes.push(e.detail));
    click(opener('m59'));
    await until(() => discardDialog(), 3000, 'discard dialog');
    expect(grid().selectedIds).to.deep.equal(['m60']);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    expect(confirmBtn().hasAttribute('disabled')).to.equal(false);
    expect(changes.length).to.equal(0);
    clickDiscard(false);
    await wait(80);
    expect(grid().selectedIds).to.deep.equal(['m60']);
    expect(changes.length).to.equal(0);
    expect(q('.td-media-picker__save') !== null, 'still editing').to.equal(true);
    click(opener('m59'));
    await until(() => discardDialog(), 3000, 'discard dialog 2');
    clickDiscard(true);
    await until(() => q('.td-media-picker__detail-name')?.textContent === assetName('m59'), 3000, 'switched');
    expect(grid().selectedIds).to.deep.equal(['m59']);
    expect(changes.length).to.equal(1);
    confirmBtn().click();
    expect((await promise).selection.map((x) => x.assetId)).to.deep.equal(['m59']);
  });

  it('#2 single: a rejected activation (not ready) leaves grid = model', async () => {
    const ad = createMockAdapter();
    ad.db.get('m59').status = 'processing';
    await openReady({ adapter: ad });
    click(opener('m60'));
    expect(grid().selectedIds).to.deep.equal(['m60']);
    click(opener('m59'));
    await wait(30);
    expect(live()).to.equal(TdMediaPicker.labels.notReady);
    expect(grid().selectedIds).to.deep.equal(['m60']);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    expect(confirmBtn().hasAttribute('disabled')).to.equal(false);
  });

  it('#3 conflict reload gives the NEW asset to visibleWhen', async () => {
    const ad = createMockAdapter();
    const fields = [...assetFields(), { key: 'note', label: 'Ghi chú v2', control: 'text', visibleWhen: (v, asset) => !!asset && asset.version >= 2 }];
    await openReady({ adapter: ad, assetFields: fields });
    click(opener('m60'));
    await detailReady('m60');
    await until(() => saveBtn(), 3000, 'save');
    expect(q('.td-media-picker__field[data-key="note"]').hidden).to.equal(true);
    ad.db.get('m60').version = 2; // changed elsewhere → the save conflicts
    q('.td-media-picker__field[data-key="title"] input').focus();
    await sendKeys({ type: 'x' });
    await until(() => saveEnabled(), 3000, 'save enabled');
    saveBtn().click();
    await until(() => q('.td-media-picker__reload'), 3000, 'reload button');
    q('.td-media-picker__reload').click();
    await until(() => !q('.td-media-picker__field[data-key="note"]').hidden, 3000, 'note visible for v2');
  });

  it('#4 upload result: exact-reused with a mismatching matchedAssetId / an unknown outcome = malformed (error row, no asset-change)', async () => {
    const ad = createMockAdapter();
    let n = 0;
    ad.upload = async () => {
      n += 1;
      const asset = JSON.parse(JSON.stringify(ad.db.get('m58')));
      return n === 1 ? { asset, deduplication: { outcome: 'exact-reused', matchedAssetId: 'm1' } }
        : n === 2 ? { asset, deduplication: { outcome: 'weird' } } : { asset, deduplication: null };
    };
    const changes = [];
    await openReady({ adapter: ad });
    document.querySelector('td-media-picker').addEventListener('asset-change', (e) => changes.push(e.detail));
    await openUpload();
    dropzone().addFiles([file('a.png')]);
    dropzone().addFiles([file('b.png')]);
    dropzone().addFiles([file('c.png')]);
    await until(() => dropzone().querySelectorAll('[data-status="error"]').length === 3, 3000, '3 error rows');
    expect(changes.length).to.equal(0);
    expect([...dropzone().querySelectorAll('.td-dropzone__status')].every((x) => x.textContent === TdMediaPicker.labels.uploadError)).to.equal(true);
  });

  it('#8 a facet whose type changes on reload gets a new control; the typed filter is re-applied when compatible, else cleared', async () => {
    const ad = createMockAdapter();
    let call = 0;
    ad.facets = async () => {
      call += 1;
      if (call === 1) return [{ key: 'k', label: 'K', type: 'single', options: [{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }] },
        { key: 'z', label: 'Z', type: 'single', options: [{ value: 'a', label: 'A' }] }];
      return [{ key: 'k', label: 'K', type: 'multiple', options: [{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }] },
        { key: 'z', label: 'Z', type: 'toggle', options: [{ value: 'mine', label: 'Của tôi' }] }];
    };
    const calls = [];
    const list = ad.list;
    ad.list = (req) => { calls.push(req); return list({ ...req, filters: {} }); };
    await openReady({ adapter: ad });
    await until(() => q('.td-media-picker__facet[data-key="k"] td-dropdown'), 3000, 'single facet');
    // set z first (no reload of types yet: call 2 happens on the first change)
    await ddPick(q('.td-media-picker__facet[data-key="z"] td-dropdown'), 'A');
    await until(() => q('.td-media-picker__facet[data-key="k"] td-chip-input'), 3000, 'k replaced by a chip input');
    expect(q('.td-media-picker__facet[data-key="k"] td-dropdown') === null).to.equal(true);
    expect(q('.td-media-picker__facet[data-key="z"] td-toggle') !== null).to.equal(true);
    // z = 'a' is not compatible with the toggle (on = 'mine') → cleared, and the list request follows
    await until(() => calls.length && !('z' in calls.at(-1).filters), 3000, 'z cleared in the request');
    expect(q('.td-media-picker__facet[data-key="z"] td-toggle').hasAttribute('checked')).to.equal(false);
  });

  it('#8 compatible: single value 2 → multiple [2] after the type change', async () => {
    const ad = createMockAdapter();
    let call = 0;
    ad.facets = async () => {
      call += 1;
      const type = call === 1 ? 'single' : 'multiple';
      return [{ key: 'k', label: 'K', type, options: [{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }] }];
    };
    const calls = [];
    const list = ad.list;
    ad.list = (req) => { calls.push(req); return list({ ...req, filters: {} }); };
    await openReady({ adapter: ad });
    await until(() => q('.td-media-picker__facet[data-key="k"] td-dropdown'), 3000, 'single facet');
    await ddPick(q('.td-media-picker__facet[data-key="k"] td-dropdown'), 'Hai');
    await until(() => q('.td-media-picker__facet[data-key="k"] td-chip-input'), 3000, 'chip input');
    await until(() => calls.length && JSON.stringify(calls.at(-1).filters.k) === '[2]', 3000, 'k = [2]');
    expect([...q('.td-media-picker__facet[data-key="k"] td-chip-input').querySelectorAll('.td-chip-input__chip-label')].map((x) => x.textContent.trim())).to.deep.equal(['Hai']);
  });
});

describe('td-media-picker — impl review round 2 (ISSUE-9)', () => {
  it('a removed facet with an active filter: filter gone, BOTH facets and list reloaded without it', async () => {
    const ad = createMockAdapter();
    const facetReqs = [];
    ad.facets = async (req) => {
      facetReqs.push(req);
      const k = { key: 'k', label: 'K', type: 'single', options: [{ value: 1, label: 'Một' }] };
      return facetReqs.length === 1 ? [k, { key: 'z', label: 'Z', type: 'single', options: [{ value: 'a', label: 'A' }] }] : [k];
    };
    const calls = [];
    const list = ad.list;
    ad.list = (req) => { calls.push(req); return list({ ...req, filters: {} }); };
    await openReady({ adapter: ad });
    await until(() => q('.td-media-picker__facet[data-key="z"] td-dropdown'), 3000, 'z facet');
    await ddPick(q('.td-media-picker__facet[data-key="z"] td-dropdown'), 'A');
    await until(() => facetReqs.length >= 3, 3000, 'facets reloaded after the removal');
    expect('z' in facetReqs.at(-1).filters).to.equal(false);
    await until(() => calls.length && !('z' in calls.at(-1).filters), 3000, 'list reloaded without z');
    expect(q('.td-media-picker__facet[data-key="z"]') === null).to.equal(true);
  });

  it('a type conversion that changes the typed filter reloads BOTH facets and list', async () => {
    const ad = createMockAdapter();
    const facetReqs = [];
    ad.facets = async (req) => {
      facetReqs.push(req);
      const type = facetReqs.length === 1 ? 'single' : 'multiple';
      return [{ key: 'k', label: 'K', type, options: [{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }] }];
    };
    await openReady({ adapter: ad });
    await until(() => q('.td-media-picker__facet[data-key="k"] td-dropdown'), 3000, 'single facet');
    await ddPick(q('.td-media-picker__facet[data-key="k"] td-dropdown'), 'Hai');
    await until(() => facetReqs.length >= 3 && JSON.stringify(facetReqs.at(-1).filters.k) === '[2]', 3000, 'facets reloaded with [2]');
    await until(() => JSON.stringify(ad.calls.list.at(-1).args[0].filters.k) === '[2]', 3000, 'list reloaded with [2]');
  });
});
