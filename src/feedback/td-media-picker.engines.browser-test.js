import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, Test section) — <td-media-picker> / TdMediaPicker.open in
// Chromium, Firefox AND WebKit (group `engines`). A controllable mock adapter (test/fixtures/media-adapter.js: deferred
// calls, call log, recorded signals) — no network. DOM nodes are compared as booleans (chai + DOM nodes hangs).
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
const trayIds = () => [...(pickerRoot()?.querySelectorAll('.td-media-picker__tray-item') || [])].map((b) => b.getAttribute('aria-label'));
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
const dropzone = () => q('td-dropzone');
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
async function openReady(opts = {}, adOpts = {}) {
  const r = await open(opts, adOpts);
  await until(() => items().length > 0 || q('.td-media-picker__empty:not([hidden])'), 3000, 'first page');
  return r;
}
async function search(text) {
  const input = q('.td-media-picker__search');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  key(input, 'Enter');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  TdModal.closeAll();
  await wait(300);
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
    expect(document.activeElement === q('.td-media-picker__search'), 'search focused').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    for (let i = 0; i < 25; i++) {
      await sendKeys({ press: TAB });
      expect(pickerRoot().contains(document.activeElement), `tab ${i} inside`).to.equal(true);
    }
    q('.td-modal__close').click();
    const out = await promise;
    expect(out).to.deep.equal({ status: 'cancelled', reason: 'close', selection: [] });
    expect(document.activeElement === btn, 'focus restored').to.equal(true);
    await wait(320);
    expect(anyRoot() === null, 'root removed').to.equal(true);
    expect(document.querySelector('td-media-picker') === null, 'JS host removed').to.equal(true);
  });

  it('"Huỷ" → cancelled close; Escape (clean) → cancelled escape', async () => {
    let r = await openReady();
    q('.td-media-picker__cancel').click();
    expect((await r.promise).reason).to.equal('close');
    await wait(320);
    r = await openReady();
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Escape' });
    expect(await r.promise).to.deep.equal({ status: 'cancelled', reason: 'escape', selection: [] });
  });

  it('Escape in a non-empty search clears it, picker stays open', async () => {
    const { promise, ad } = await openReady();
    const input = q('.td-media-picker__search');
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
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

  it('dirty (upload running) → Escape asks; yes → upload signal aborted + cancelled escape', async () => {
    const { promise, ad } = await openReady({}, {});
    ad.manual = true; // the upload stays pending
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Escape' });
    await until(() => discardDialog());
    clickDiscard(true);
    const out = await promise;
    expect(out.reason).to.equal('escape');
    expect(ad.calls.upload[0].args[1].signal.aborted).to.equal(true);
  });
});

describe('td-media-picker — finish gate with "Chọn" (R1-3)', () => {
  it('dirty edit → "Chọn (1)" asks; no → still open; yes → selected A (old snapshot), update never called', async () => {
    const { promise, ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
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

  it('upload running + A selected → "Chọn" asks; yes → upload aborted, selected only A', async () => {
    const { promise, ad } = await openReady();
    click(opener('m60'));
    await until(() => confirmBtn().textContent.includes('1'));
    ad.manual = true;
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    confirmBtn().click();
    await until(() => discardDialog());
    clickDiscard(true);
    const out = await promise;
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
    expect(ad.calls.upload[0].args[1].signal.aborted).to.equal(true);
  });

  it('clean → "Chọn" resolves at once; nothing selected → aria-disabled + announcement', async () => {
    const { promise } = await openReady();
    expect(confirmBtn().getAttribute('aria-disabled')).to.equal('true');
    confirmBtn().click();
    await until(() => live() === TdMediaPicker.labels.selectFirst);
    expect(await peek(promise)).to.equal(PENDING);
    click(opener('m59'));
    await until(() => confirmBtn().getAttribute('aria-disabled') === null);
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
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file()]);
    await until(() => ad.calls.upload.length === 1);
    host.remove();
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'x' });
    q('.td-modal__close').click();
    await until(() => discardDialog());
    host.remove();
    await wait(300);
    expect(discardDialog() === null).to.equal(true);
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    const title = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    title.focus();
    await sendKeys({ type: 'x' });
    q('.td-media-picker__cancel').click();
    await until(() => discardDialog());
    document.querySelector('td-media-picker').close();
    expect((await promise).status).to.equal('cancelled');
    await wait(300);
    expect(discardDialog() === null).to.equal(true);
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

  it('resolved c, a, b → tray in initialIds order, applied once; "Đang tải lựa chọn…" while pending', async () => {
    const { ad, promise } = await openInitial(['m3', 'm1', 'm2']);
    expect(q('.td-media-picker__tray-loading')?.textContent).to.equal(TdMediaPicker.labels.loadingInitial);
    const changes = [];
    document.querySelector('td-media-picker').addEventListener('selection-change', (e) => changes.push(e));
    getCall(ad, 'm2').resolve();
    getCall(ad, 'm3').resolve();
    await wait(20);
    expect(trayIds().length).to.equal(0);
    getCall(ad, 'm1').resolve();
    await until(() => trayIds().length === 3);
    expect(trayIds()).to.deep.equal(['m3', 'm1', 'm2'].map((id) => TdMediaPicker.labels.deselect.replace('{name}', assetName(id))));
    expect(q('.td-media-picker__tray-loading') === null).to.equal(true);
    expect(changes.length, 'no selection-change for initial').to.equal(0);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m3', 'm1', 'm2']);
  });

  it('get(b) rejects → tray a, c', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2', 'm3']);
    getCall(ad, 'm1').resolve();
    getCall(ad, 'm2').reject(Object.assign(new Error('raw'), { code: 'not-found' }));
    getCall(ad, 'm3').resolve();
    await until(() => trayIds().length === 2);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m1', 'm3']);
  });

  it('adapter ignores the signal: a user pick cancels the transaction in the same task; late settles change nothing', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2']);
    ad.ignoreSignal = true;
    getCall(ad, 'm1').resolve();
    await wait(10);
    click(opener('m60'));
    // same task: aborted + no "loading" note + X selected
    expect(getCall(ad, 'm2').signal.aborted).to.equal(true);
    expect(q('.td-media-picker__tray-loading') === null).to.equal(true);
    expect(trayIds().length).to.equal(1);
    let unhandled = 0;
    const onUnhandled = () => { unhandled += 1; };
    window.addEventListener('unhandledrejection', onUnhandled);
    getCall(ad, 'm2').reject(new Error('late'));
    await wait(50);
    window.removeEventListener('unhandledrejection', onUnhandled);
    expect(unhandled).to.equal(0);
    expect(trayIds().length).to.equal(1);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });

  it('no user action: get(b) hangs → still waiting, "Chọn" works with the current model (initial absent)', async () => {
    const { ad, promise } = await openInitial(['m1', 'm2']);
    getCall(ad, 'm1').resolve();
    await wait(30);
    expect(q('.td-media-picker__tray-loading') !== null).to.equal(true);
    click(opener('m59'));
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
    await until(() => trayIds().length === 1);
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
    const input = q('.td-media-picker__search');
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
    ad.manual = true;
    click(opener('m60'));
    click(tick('m60')); // deselect so the next click activates again
    click(opener('m59'));
    await until(() => ad.calls.get.length === 2);
    expect(ad.calls.get[0].signal.aborted).to.equal(true);
    ad.ignoreSignal = true;
    ad.calls.get[1].resolve();
    ad.calls.get[0].resolve();
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    await until(() => q('.td-media-picker__save'));
    q('.td-media-picker__save').click();
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
    expect(q('.td-media-picker__results').getAttribute('aria-busy')).to.equal('true');
    ad.calls.list[0].resolve();
    await until(() => items().length === 20);
    expect(q('.td-media-picker__skeleton').hidden).to.equal(true);
    expect(q('.td-media-picker__results').getAttribute('aria-busy')).to.equal('false');
    expect(grid().selectedIds.length).to.equal(0);
    expect(q('.td-media-picker__count').textContent).to.equal('Hiển thị 20 / 60');
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('empty with / without filter → the right empty text', async () => {
    const ad = createMockAdapter({ count: 0 });
    const { promise } = await openReady({ adapter: ad });
    expect(q('.td-media-picker__empty').getAttribute('title')).to.equal(TdMediaPicker.labels.empty);
    await search('zzz');
    await until(() => q('.td-media-picker__empty').getAttribute('title') === TdMediaPicker.labels.emptyFiltered);
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

  it('"Tải thêm" sends nextCursor and appends; wrong kinds hidden', async () => {
    const { ad } = await openReady({ pageSize: 25, selection: { mode: 'single', kinds: ['image'] } });
    expect(ad.calls.list[0].args[0].kinds).to.deep.equal(['image']);
    ad.list = ((orig) => (req) => orig(req))(ad.list);
    const n = items().length;
    expect(items().every((i) => i.getAttribute('data-kind') === 'image')).to.equal(true);
    q('.td-media-picker__more').click();
    await until(() => items().length > n);
    expect(ad.calls.list.at(-1).args[0].cursor).to.equal('25');
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
    // tick of an unselected item → replace; click on the selected → deselect
    click(tick(e));
    expect(grid().selectedIds).to.deep.equal([e]);
    click(opener(e));
    expect(grid().selectedIds).to.deep.equal([]);
  });

  it('multiple maxItems=3: the 4th is blocked + announcement; retained across searches; tray order', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 3 } });
    click(tick('m60'));
    click(opener('m59'));
    await search('anh-1');
    await until(() => ids().every((id) => assetName(id).includes('anh-1')) && items().length);
    click(tick('m19'));
    expect(trayIds().length).to.equal(3);
    click(tick('m18'));
    await wait(20);
    expect(grid().selectedIds.includes('m18')).to.equal(false);
    expect(trayIds().length).to.equal(3);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm59', 'm19']);
  });

  it('capacity used up by items outside the page (R1-2): no max="0", every flip vetoed, then one slot frees max=1', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 3 } });
    click(tick('m60'));
    click(opener('m59'));
    click(opener('m58'));
    await search('anh-1');
    await until(() => items().length && ids().every((id) => assetName(id).includes('anh-1')));
    expect(grid().hasAttribute('max')).to.equal(false);
    click(tick('m19'));
    click(opener('m18'));
    opener('m17').focus();
    await sendKeys({ press: 'Space' });
    click(opener('m16'), { shiftKey: true });
    await wait(30);
    expect(grid().selectedIds).to.deep.equal([]);
    expect(items().every((i) => i.querySelector('.td-media-grid__tick')?.getAttribute('aria-pressed') !== 'true')).to.equal(true);
    expect(live()).to.equal('Tối đa 3 mục');
    // free one slot from the tray
    pickerRoot().querySelector('.td-media-picker__tray-item').click();
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
    q('.td-media-picker__tray-clear').click();
    expect(trayIds().length).to.equal(0);
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
    expect(document.activeElement === q('.td-media-picker__search')).to.equal(true);
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
    while (document.activeElement !== confirmBtn() && guard++ < 40) await sendKeys({ press: TAB });
    await sendKeys({ press: 'Enter' });
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([focusedId]);
  });
});

describe('td-media-picker — upload (decisions 19-20)', () => {
  it('upload toggle hidden without adapter.upload or with capabilities.upload false', async () => {
    let r = await openReady({}, { upload: false });
    expect(q('.td-media-picker__upload-toggle') === null).to.equal(true);
    await closeAll();
    r = await openReady({ capabilities: { upload: false } });
    expect(q('.td-media-picker__upload-toggle') === null).to.equal(true);
    void r;
  });

  it('required upload field empty → dropzone disabled; fields captured at start; signal; progress; remove → aborted', async () => {
    const { ad } = await openReady({ uploadFields: uploadFields() });
    q('.td-media-picker__upload-toggle').click();
    expect(dropzone().hasAttribute('disabled')).to.equal(true);
    expect(q('.td-media-picker__upload-hint').hidden).to.equal(false);
    await ddPick(q('.td-media-picker__field[data-key="album"] td-dropdown'), 'Tin tức');
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

  it('created → first in the grid, selected (single replaces A), announcement, asset-change', async () => {
    const { ad, promise } = await openReady();
    click(opener('m60'));
    const host = document.querySelector('td-media-picker');
    const changes = [];
    host.addEventListener('asset-change', (e) => changes.push(e.detail));
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file('moi.png')]);
    await until(() => changes.length === 1, 4000);
    expect(changes[0].operation).to.equal('upload');
    expect(changes[0].deduplication).to.deep.equal({ outcome: 'created' });
    const newId = changes[0].asset.id;
    await until(() => ids()[0] === newId);
    expect(grid().selectedIds).to.deep.equal([newId]);
    expect(live().includes('moi.png')).to.equal(true);
    void ad;
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([newId]);
  });

  it('exact-reused → no duplicate, matched asset selected (replaces A), "dùng lại" note', async () => {
    const { promise } = await openReady();
    click(opener('m60'));
    q('.td-media-picker__upload-toggle').click();
    const n = items().length;
    dropzone().addFiles([file(assetName('m58'), 'image/jpeg')]);
    await until(() => q('.td-media-picker__upload-note'), 4000);
    expect(q('.td-media-picker__upload-note').textContent).to.equal(TdMediaPicker.labels.reused.replace('{name}', assetName('m58')));
    await wait(50);
    expect(ids().filter((id) => id === 'm58').length).to.equal(1);
    expect(items().length).to.equal(n);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
  });

  it('rejection: only userMessage shows; none → labels.uploadError; fieldErrors → on the upload control', async () => {
    const { ad } = await openReady({ uploadFields: [{ key: 'note', label: 'Ghi chú', control: 'text' }] });
    q('.td-media-picker__upload-toggle').click();
    ad.manual = true;
    dropzone().addFiles([file('x1.png')]);
    await until(() => ad.calls.upload.length === 1);
    ad.calls.upload[0].reject(Object.assign(new Error('raw /var/www trace'), { code: 'validation', userMessage: 'File quá lớn', fieldErrors: { note: ['Bắt buộc'] } }));
    await until(() => dropzone().querySelector('[data-status="error"]'));
    expect(dropzone().querySelector('.td-dropzone__status').textContent).to.equal('File quá lớn');
    expect(pickerRoot().textContent.includes('/var/www')).to.equal(false);
    await until(() => q('.td-media-picker__field[data-key="note"] [aria-invalid="true"]'));
    dropzone().addFiles([file('x2.png')]);
    await until(() => ad.calls.upload.length === 2);
    ad.calls.upload[1].reject(new Error('Internal Server Error <stack>'));
    await until(() => dropzone().querySelectorAll('[data-status="error"]').length === 2);
    const texts = [...dropzone().querySelectorAll('.td-dropzone__status')].map((s) => s.textContent);
    expect(texts.includes(TdMediaPicker.labels.error.server) || texts.includes(TdMediaPicker.labels.uploadError)).to.equal(true);
    expect(pickerRoot().textContent.includes('<stack>')).to.equal(false);
  });

  it('single + processing result → A kept, B inserted unselected, notReady', async () => {
    const ad = createMockAdapter();
    const up = ad.upload;
    ad.upload = (f, o) => up(f, o).then((r) => ({ ...r, asset: { ...r.asset, status: 'processing' } }));
    await openReady({ adapter: ad });
    click(opener('m60'));
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file('cho.png')]);
    await until(() => live() === TdMediaPicker.labels.notReady, 4000);
    expect(grid().selectedIds).to.deep.equal(['m60']);
  });

  it('multiple maxItems=2 full → upload D inserted, not selected, "Tối đa 2 mục"', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple', maxItems: 2 } });
    click(tick('m60'));
    click(tick('m59'));
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file('d.png')]);
    await until(() => live() === 'Tối đa 2 mục', 4000);
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
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file('b.png')]);
    await until(() => changes.length, 4000);
    hang?.(ad.db.get('m3'));
    await wait(30);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([changes[0].asset.id]);
  });
});

describe('td-media-picker — edit metadata (decision 21-22)', () => {
  const openEdit = async (id = 'm60', o = {}) => {
    const r = await openReady({ assetFields: assetFields(), ...o });
    click(opener(id));
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    await until(() => q('.td-media-picker__save'));
    return r;
  };

  it('edit button hidden without update / editMetadata false / per-asset editMetadata false', async () => {
    await openReady({ assetFields: assetFields() }, { update: false });
    click(opener('m60'));
    await until(() => q('.td-media-picker__detail-name'));
    expect(q('.td-media-picker__edit') === null).to.equal(true);
    await closeAll();
    await openReady({ assetFields: assetFields(), capabilities: { editMetadata: false } });
    click(opener('m60'));
    await until(() => q('.td-media-picker__detail-name'));
    expect(q('.td-media-picker__edit') === null).to.equal(true);
    await closeAll();
    await openReady({ assetFields: assetFields() });
    await search('anh-5');
    await until(() => item('m5'));
    click(opener('m5')); // per-asset capabilities.editMetadata false
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-5.jpg');
    await wait(30);
    expect(q('.td-media-picker__edit') === null).to.equal(true);
  });

  it('7 descriptor controls; visibleWhen; save → update(id, { fields, version }) + asset replaced everywhere + event', async () => {
    const { ad } = await openEdit('m60', { selection: { mode: 'multiple' } });
    const field = (k) => q(`.td-media-picker__field[data-key="${k}"]`);
    for (const k of ['title', 'caption', 'source', 'license', 'tags', 'checksum']) expect(field(k) !== null, k).to.equal(true);
    expect(field('title').querySelector('td-input-field') !== null).to.equal(true);
    expect(field('license').querySelector('td-dropdown') !== null).to.equal(true);
    expect(field('tags').querySelector('td-chip-input') !== null).to.equal(true);
    expect(field('licenseExpiry') === null || field('licenseExpiry').hidden).to.equal(true);
    const host = document.querySelector('td-media-picker');
    const changes = [];
    host.addEventListener('asset-change', (e) => changes.push(e.detail));
    const input = field('title').querySelector('input');
    input.focus();
    input.select();
    await sendKeys({ type: 'Tên mới' });
    q('.td-media-picker__save').click();
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
    q('.td-media-picker__save').click();
    await until(() => ad.calls.update.length === 1);
    ad.calls.update[0].reject(Object.assign(new Error('raw'), { code: 'validation', fieldErrors: { license: ['Chưa hợp lệ'], unknown: ['Lỗi chung <b>x</b>'] } }));
    await until(() => q('.td-media-picker__field[data-key="license"] [aria-invalid="true"]'));
    const general = q('.td-media-picker__form-errors');
    expect(general.hidden).to.equal(false);
    expect(general.textContent.includes('Lỗi chung <b>x</b>')).to.equal(true);
    expect(general.querySelector('b') === null).to.equal(true);
    expect(q('.td-media-picker__field[data-key="license"]').contains(document.activeElement)).to.equal(true);
    q('.td-media-picker__save').click();
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
    expect(q('.td-media-picker__save') !== null).to.equal(true);
    expect(ad.calls.update.length).to.equal(0);
    q('.td-media-picker__field[data-key="title"] input').focus();
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
    await until(() => q('.td-media-picker__edit'), 3000, 'd1')
    q('.td-media-picker__edit').click();
    const dtp = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd2')
    await until(() => dtp.querySelector('.td-dtp__value')?.textContent.trim() === '31/03/2027', 3000, 'date shown');
    dtp.setDBValue('2027-04-15');
    dtp.dispatchEvent(new Event('change', { bubbles: true }));
    q('.td-media-picker__save').click();
    await until(() => ad.calls.update.length === 1, 3000, 'd3')
    expect(ad.calls.update[0].args[1].fields.licenseExpiry).to.equal('2027-04-15');
    await until(() => q('.td-media-picker__edit'), 3000, 'd4')
    q('.td-media-picker__edit').click();
    const dtp2 = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd5')
    dtp2.setDBValue('');
    dtp2.dispatchEvent(new Event('change', { bubbles: true }));
    q('.td-media-picker__save').click();
    await until(() => ad.calls.update.length === 2, 3000, 'd6')
    expect(ad.calls.update[1].args[1].fields.licenseExpiry).to.equal(null);
    await until(() => q('.td-media-picker__edit'), 3000, 'saved'); // the save finished (a running save is "dirty")
    // broken metadata
    click(tick('m60'));
    click(opener('m59'));
    await until(() => q('.td-media-picker__detail-name')?.textContent === assetName('m59'), 3000, 'd7')
    await until(() => q('.td-media-picker__edit'), 3000, 'd8')
    q('.td-media-picker__edit').click();
    const dtp3 = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 3000, 'd9')
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
    expect(q('.td-media-picker__filters-toggle').textContent.includes('3')).to.equal(true);
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    const input = await until(() => q('.td-media-picker__field[data-key="title"] input'));
    input.focus();
    input.select();
    await sendKeys({ type: 'Z' });
    const before = ad.calls.list.length;
    const facetsBefore = ad.calls.facets.length;
    q('.td-media-picker__save').click();
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
    expect(trayIds().length).to.equal(1);
  });

  it('upload created → back to the previous query shows the new item (cache dropped)', async () => {
    const { ad } = await openReady();
    await search('anh-1');
    await until(() => items().length && ids().every((id) => assetName(id).includes('anh-1')));
    await search('');
    await until(() => ids()[0] === 'm60');
    q('.td-media-picker__upload-toggle').click();
    dropzone().addFiles([file('anh-1-moi.png')]);
    await until(() => ids()[0] !== 'm60', 4000);
    const n = ad.calls.list.length;
    await search('anh-1');
    await until(() => ad.calls.list.length > n);
    await until(() => items().some((i) => i.querySelector('.td-media-picker__name').textContent === 'anh-1-moi.png'));
  });
});

describe('td-media-picker — mobile, motion, forced colours', () => {
  it('375×740: bottom sheet; detail replaces the grid + "Quay lại" returns focus; facets behind "Bộ lọc"; tray count only', async () => {
    await setViewport({ width: 375, height: 740 });
    await openReady({ selection: { mode: 'multiple', maxItems: 5 } });
    await wait(400);
    const dialog = q('.td-media-picker__dialog');
    const r = dialog.getBoundingClientRect();
    expect(Math.abs(r.bottom - 740) <= 1, `bottom ${r.bottom}`).to.equal(true);
    expect(Math.abs(r.width - 375) <= 1, `width ${r.width}`).to.equal(true);
    await until(() => q('.td-media-picker__filters-toggle') && !q('.td-media-picker__filters-toggle').hidden, 3000, 'filters toggle');
    expect(getComputedStyle(q('.td-media-picker__facets')).display).to.equal('none');
    q('.td-media-picker__filters-toggle').click();
    expect(q('.td-media-picker__filters-toggle').getAttribute('aria-expanded')).to.equal('true');
    expect(getComputedStyle(q('.td-media-picker__facets')).display).to.not.equal('none');
    click(tick('m60'));
    expect(getComputedStyle(q('.td-media-picker__tray-list')).display).to.equal('none');
    opener('m59').focus();
    await sendKeys({ press: 'Enter' });
    await until(() => pickerRoot().getAttribute('data-view') === 'detail', 3000, 'detail view');
    expect(getComputedStyle(q('.td-media-picker__results')).display).to.equal('none');
    await until(() => document.activeElement?.classList.contains('td-media-picker__back'), 3000, 'back focused');
    document.activeElement.click();
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

  it('forced colours → dialog, tiles and buttons keep a visible border', async () => {
    await emulateMedia({ forcedColors: 'active' });
    extra.push(() => emulateMedia({ forcedColors: 'none' }));
    if (!matchMedia('(forced-colors: active)').matches) return; // engine cannot emulate
    await openReady();
    const bw = (el) => parseFloat(getComputedStyle(el).borderTopWidth);
    expect(bw(q('.td-media-picker__dialog')) > 0).to.equal(true);
    expect(bw(opener('m60')) > 0).to.equal(true);
    expect(bw(confirmBtn()) > 0).to.equal(true);
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
    await until(() => q('.td-media-picker__edit'));
    q('.td-media-picker__edit').click();
    await until(() => q('.td-media-picker__save'));
    ad.manual = true;
    q('.td-media-picker__save').click();
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
    for (const el of [root, ...root.querySelectorAll('*')]) {
      expect(el.hasAttribute('style') && el.closest('.td-media-picker__grid') !== null && el.getAttribute('style') !== '', `${el.localName} style`).to.equal(false);
      for (const a of el.attributes) expect(/^on/i.test(a.name), `${el.localName} ${a.name}`).to.equal(false);
    }
    const added = Object.keys(window).filter((k) => !globals.has(k) && k !== '__mpXss');
    expect(added).to.deep.equal([]);
  });
});
