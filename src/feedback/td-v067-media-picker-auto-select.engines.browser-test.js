import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.67.0 (plan docs/internal/plans/v0.67.0-auto-select-first.md, "Test") — the opt-in `autoSelectFirst` of <td-media-picker>
// in Chromium, Firefox AND WebKit (group `engines`). Mock adapter: test/fixtures/media-adapter.js (newest first: m60, m59, …;
// m7 processing; videos i % 10 = 4; files i % 15 = 11; with `collections: true` asset m{i} lives in c{((i - 1) % n) + 1}).
// Helpers copied from td-media-picker.engines.browser-test.js / td-v066-media-picker-collections.engines.browser-test.js.
// DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner). "Chèn" resolves
// `{ status: 'selected', selection }` (PickerOutcome, see buildOutcome) — the plan/brief wording "confirmed" is the action,
// not the status. A test that must tell "first load only" from the `model.size` guard clears the selection as the USER
// first (the auto-selection is programmatic, so only that click emits `selection-change`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const extra = [];
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
const chip = () => q('.td-media-picker__clear');
/** the footer chip of `multiple` carries the count */
const selCount = () => Number(chip()?.getAttribute('data-count') || 0);
const searchHost = () => q('.td-media-picker__search');
const searchInput = () => q('.td-media-picker__search input');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const press = (tdBtn) => click(tdBtn.querySelector('button') || tdBtn);
const assetName = (id) => `anh-${id.slice(1)}.jpg`;
/** the cards ticked in the grid, in DOM order, as one string ('' = none) */
const ticked = () => (grid()?.selectedIds || []).join();
const disabled = () => confirmBtn().hasAttribute('disabled');
const nextBtn = () => q('.td-media-picker__next');
const prevBtn = () => q('.td-media-picker__prev');
const rejectGet = (call) => call.reject(Object.assign(new Error('raw'), { code: 'not-found' }));
const file = (name = 'moi.png', type = 'image/png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type });
const uploadRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker-upload')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const dropzone = () => uploadRoot()?.querySelector('td-dropzone') || null;
// collections (K8) — same selectors as td-v066-media-picker-collections.engines.browser-test.js
const strip = () => q('.td-media-picker__colls');
const stripShown = () => !!strip() && !strip().hidden;
const cards = () => [...(pickerRoot()?.querySelectorAll('.td-media-picker__coll') || [])];
const card = (id) => cards().find((b) => b.getAttribute('data-id') === id) || null;
const inColl = () => !!q('.td-media-picker__crumbs') && !q('.td-media-picker__crumbs').hidden;
const backBtn = () => q('.td-media-picker__coll-back');
const lastList = (ad) => ad.calls.list.at(-1).args[0];

/** the detail panel shows `id` and its get() settled (the preview is final) */
async function detailReady(id, name = assetName(id)) {
  await until(() => q('.td-media-picker__detail-name')?.textContent === name
    && !q('.td-media-picker__detail').hasAttribute('data-loading'), 3000, `detail ${id}`);
  await wait(0);
}
/** every text written to the picker's live region, in order */
function liveLog() {
  const log = [];
  const mo = new MutationObserver(() => {
    const t = document.querySelector('.td-media-picker__live')?.textContent;
    if (t && log.at(-1) !== t) log.push(t);
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  extra.push(() => mo.disconnect());
  return log;
}
/** `selection-change` details (USER changes only), listened on the document BEFORE the open */
function selEvents() {
  const log = [];
  const fn = (e) => log.push(e.detail);
  document.addEventListener('selection-change', fn);
  extra.push(() => document.removeEventListener('selection-change', fn));
  return log;
}
function opErrors() {
  const log = [];
  const fn = (e) => log.push(e.detail);
  document.addEventListener('operation-error', fn);
  extra.push(() => document.removeEventListener('operation-error', fn));
  return log;
}
/** console.warn captured (the initialIds transaction warns once per id it cannot load) */
function captureWarns() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a.join(' ')); };
  extra.push(() => { console.warn = orig; });
  return warns;
}

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
/** commit a query now (value + input + Enter, like the other picker suites) */
function search(text) {
  const input = searchHost();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
}
/** the grid shows the page of the last list request */
async function pageSettled(ad, what = 'page settled') {
  await until(() => ad.calls.list.length && ad.calls.list.every((c) => c.settled)
    && q('.td-media-picker__results')?.getAttribute('aria-busy') === 'false', 3000, what);
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-media-picker-upload, :scope > .td-modal'), 3000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

beforeEach(async () => {
  await setViewport({ width: 1280, height: 800 });
});
afterEach(async () => {
  TdMediaPicker.configureDefaults({});
  await closeAll();
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 1280, height: 800 });
  await wait(50);
});

describe('v0.67.0 media picker autoSelectFirst — the option (cases 1, 2, 3, 12)', () => {
  it('1. option absent: nothing selected, "Chèn" disabled (QĐ 69 stays), the first asset is still previewed', async () => {
    const events = selEvents();
    const log = liveLog();
    const { ad } = await openReady();
    await detailReady('m60');
    expect(grid().selectedIds).to.deep.equal([]);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    expect(item('m60').hasAttribute('data-viewing'), 'm60 previewed').to.equal(true);
    expect(log, 'only the results count').to.deep.equal(['60 kết quả']);
    expect(events.length).to.equal(0);
    expect(ad.calls.list.length).to.equal(1);
  });

  it('2a. single: the first asset is selected, "Chèn" enabled, previewed, NO selection-change; "Chèn" resolves with exactly it', async () => {
    const events = selEvents();
    const { ad, promise } = await open({ autoSelectFirst: true });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    expect(item('m60').hasAttribute('data-selected'), 'card ticked').to.equal(true);
    expect(disabled(), 'Chèn enabled').to.equal(false);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    await detailReady('m60');
    expect(item('m60').hasAttribute('data-viewing'), 'm60 previewed').to.equal(true);
    expect(q('.td-media-picker__detail-name').textContent, 'the pane shows the selected asset').to.equal('anh-60.jpg');
    // a programmatic selection: no user-change event, no extra list request, the focus is not moved
    expect(events.length, 'no selection-change').to.equal(0);
    expect(ad.calls.list.length, 'one list request').to.equal(1);
    await until(() => document.activeElement === searchInput(), 3000, 'search focused');
    confirmBtn().click();
    const out = await promise;
    expect(out.status).to.equal('selected');
    expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
    expect(out.selection[0].asset.id).to.equal('m60');
    expect(out.selection[0].asset.name).to.equal('anh-60.jpg');
    expect(out.selection[0].usage).to.deep.equal({ altText: 'Ảnh mẫu 60', crop: null, focalPoint: null });
    expect(events.length, 'confirming is not a selection change either').to.equal(0);
  });

  it('2b. single: clicking another card afterwards REPLACES the selection and DOES emit selection-change', async () => {
    const events = selEvents();
    const { promise } = await open({ autoSelectFirst: true });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    await detailReady('m60');
    expect(events.length).to.equal(0);
    click(opener('m59'));
    await until(() => ticked() === 'm59', 3000, 'm59 replaces m60');
    expect(events.length, 'one user change').to.equal(1);
    expect(events[0].addedIds).to.deep.equal(['m59']);
    expect(events[0].removedIds).to.deep.equal(['m60']);
    expect(events[0].selection.map((s) => s.assetId)).to.deep.equal(['m59']);
    await detailReady('m59');
    expect(disabled()).to.equal(false);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m59']);
  });

  for (const mode of ['single', 'multiple']) {
    it(`2c. ${mode}: the footer is updated together with the grid — not later, when the preview request settles`, async () => {
      // manual mode: the preview's get() never settles, so nothing else re-renders the footer (_applyFreshAsset does)
      const ad = createMockAdapter({ manual: true });
      const promise = TdMediaPicker.open({ adapter: ad, autoSelectFirst: true, selection: { mode } });
      await until(() => ad.calls.list.length === 1, 3000, 'first list requested');
      expect(disabled(), 'nothing yet').to.equal(true);
      ad.calls.list[0].resolve();
      await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
      expect(ad.calls.get.length === 1 && !ad.calls.get[0].settled, 'the preview request is still pending').to.equal(true);
      expect(disabled(), 'Chèn enabled at once').to.equal(false);
      if (mode === 'multiple') {
        expect(selCount(), 'chip count').to.equal(1);
        expect(chip().hidden, 'chip shown').to.equal(false);
        expect(btnText(chip())).to.equal('1 đã chọn');
        expect(btnText(confirmBtn())).to.equal('Chèn (1)');
      }
      confirmBtn().click();
      const out = await promise;
      expect(out.selection.map((s) => s.assetId)).to.deep.equal(['m60']);
    });
  }

  it('3. multiple + maxItems: only the first asset is selected (chip 1/2), the user adds others up to maxItems', async () => {
    const events = selEvents();
    const { promise } = await open({ autoSelectFirst: true, selection: { mode: 'multiple', maxItems: 2 } });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    expect(selCount(), 'chip count').to.equal(1);
    expect(chip().hidden, 'chip shown').to.equal(false);
    expect(btnText(chip())).to.equal('1/2 đã chọn');
    expect(btnText(confirmBtn())).to.equal('Chèn (1)');
    expect(disabled(), 'Chèn enabled').to.equal(false);
    expect(events.length, 'no selection-change').to.equal(0);
    click(tick('m59'));
    await until(() => selCount() === 2, 3000, 'second pick');
    expect(ticked()).to.equal('m60,m59');
    expect(btnText(chip())).to.equal('2/2 đã chọn');
    expect(events.length, 'the user pick is an event').to.equal(1);
    expect(events[0].addedIds).to.deep.equal(['m59']);
    // the auto-selected asset counts against maxItems: the grid refuses the third pick (select-limit)
    let limited = 0;
    grid().addEventListener('select-limit', () => { limited += 1; });
    click(tick('m58'));
    await until(() => limited === 1, 3000, 'select-limit');
    expect(ticked()).to.equal('m60,m59');
    expect(selCount()).to.equal(2);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm59']);
  });

  for (const [way, reason, close] of [
    // the focus is left where the picker put it (the empty search box): Escape there closes, it does not clear anything
    ['Escape', 'escape', async () => {
      await until(() => document.activeElement === searchInput(), 3000, 'search focused');
      await sendKeys({ press: 'Escape' });
    }],
    ['×', 'close', async () => { q('.td-modal__close').click(); }],
    ['"Đóng"', 'close', async () => { q('.td-media-picker__cancel').click(); }],
  ]) {
    it(`12. ${way} after an auto-selection → cancelled / ${reason}, selection []`, async () => {
      const { promise } = await open({ autoSelectFirst: true });
      await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
      expect(disabled(), 'there was a selection to throw away').to.equal(false);
      await close();
      expect(await promise).to.deep.equal({ status: 'cancelled', reason, selection: [] });
    });
  }
});

describe('v0.67.0 media picker autoSelectFirst — initialIds always win (cases 4, 4b)', () => {
  /** manual mode: open with `initialIds`; returns once list() and the initial get() are pending */
  async function openInitial(mode, initialIds) {
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad, autoSelectFirst: true, selection: { mode, initialIds } });
    await until(() => ad.calls.list.length === 1 && ad.calls.get.length === initialIds.length, 3000, 'list + initial get requested');
    expect(ad.calls.get[0].args[0]).to.equal(initialIds[0]);
    return { ad, promise };
  }

  for (const mode of ['single', 'multiple']) {
    it(`4. ${mode} + initialIds, the list lands BEFORE the initial get(): nothing is auto-selected on top; the outcome is the initial id`, async () => {
      const events = selEvents();
      const { ad, promise } = await openInitial(mode, ['m58']);
      ad.calls.list[0].resolve();
      await until(() => items().length, 3000, 'first page');
      expect(ticked(), 'the first asset is not auto-selected').to.equal('');
      expect(disabled(), 'Chèn waits for the initial ids').to.equal(true);
      expect(q('.td-media-picker__initial-loading').hidden, 'still loading the initial ids').to.equal(false);
      ad.calls.get[0].resolve();
      await until(() => ticked() === 'm58', 3000, 'the initial id applied');
      expect(q('.td-media-picker__initial-loading').hidden).to.equal(true);
      expect(disabled()).to.equal(false);
      if (mode === 'multiple') expect(selCount()).to.equal(1);
      expect(events.length, 'initial ids are not user changes').to.equal(0);
      confirmBtn().click();
      expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
    });
  }

  for (const mode of ['single', 'multiple']) {
    it(`4. ${mode} + initialIds, get() lands BEFORE the list: still only the initial id`, async () => {
      const { ad, promise } = await openInitial(mode, ['m58']);
      ad.calls.get[0].resolve();
      await until(() => !disabled() && q('.td-media-picker__initial-loading').hidden, 3000, 'initial id in the model');
      ad.calls.list[0].resolve();
      await until(() => ticked() === 'm58', 3000, 'm58 ticked on the page');
      if (mode === 'multiple') expect(selCount()).to.equal(1);
      confirmBtn().click();
      expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
    });
  }

  for (const [what, fail] of [
    ['rejects', (call) => rejectGet(call)],
    ['resolves no usable asset', (call) => call.resolve(null)],
  ]) {
    for (const listFirst of [true, false]) {
      it(`4b. initialIds whose get() ${what}, ${listFirst ? 'list first' : 'get first'}: the list is NOT auto-selected, "Chèn" stays disabled`, async () => {
        const warns = captureWarns();
        const events = selEvents();
        const log = liveLog();
        const { ad, promise } = await openInitial('single', ['m58']);
        if (listFirst) {
          ad.calls.list[0].resolve();
          await until(() => items().length, 3000, 'first page');
          fail(ad.calls.get[0]);
        } else {
          fail(ad.calls.get[0]);
          await until(() => q('.td-media-picker__initial-loading').hidden, 3000, 'initial transaction settled');
          ad.calls.list[0].resolve();
          await until(() => items().length, 3000, 'first page');
        }
        await until(() => q('.td-media-picker__initial-loading').hidden, 3000, 'initial transaction settled');
        expect(warns.filter((w) => /initial id could not be loaded/.test(w)).length, 'the failure was seen').to.equal(1);
        expect(ticked(), 'nothing selected').to.equal('');
        expect(disabled(), 'Chèn disabled').to.equal(true);
        expect(events.length).to.equal(0);
        expect(log.some((t) => t.includes('Đã chọn sẵn')), 'no auto-selected announcement').to.equal(false);
        expect(await peek(promise)).to.equal(PENDING);
      });
    }
  }
});

describe('v0.67.0 media picker autoSelectFirst — the first SELECTABLE asset (case 5)', () => {
  it('5a. the first asset is not ready → the next ready one is selected and previewed', async () => {
    const ad = createMockAdapter();
    ad.db.get('m60').status = 'processing';
    const { promise } = await open({ adapter: ad, autoSelectFirst: true });
    await until(() => ticked() === 'm59', 3000, 'm59 auto-selected');
    expect(item('m60').hasAttribute('data-selected'), 'm60 not selected').to.equal(false);
    expect(disabled(), 'Chèn enabled').to.equal(false);
    await detailReady('m59'); // the pane follows the selection, not the first card
    expect(item('m59').hasAttribute('data-viewing')).to.equal(true);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m59']);
  });

  it('5b. pending / processing / failed / archived are all skipped (m56 is the first ready one: a file, no kinds filter)', async () => {
    const ad = createMockAdapter();
    for (const [id, status] of [['m60', 'processing'], ['m59', 'pending'], ['m58', 'failed'], ['m57', 'archived']]) ad.db.get(id).status = status;
    const { promise } = await open({ adapter: ad, autoSelectFirst: true });
    await until(() => ticked() === 'm56', 3000, 'm56 auto-selected');
    expect(item('m56').getAttribute('data-kind')).to.equal('file');
    expect(item('m56').hasAttribute('data-viewing'), 'm56 previewed').to.equal(true);
    expect(disabled()).to.equal(false);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m56']);
  });

  it('5c. selection.kinds: the first READY asset of an allowed kind (m54 is the first video, processing → m44)', async () => {
    const ad = createMockAdapter();
    ad.db.get('m54').status = 'processing';
    const { promise } = await open({ adapter: ad, autoSelectFirst: true, selection: { mode: 'single', kinds: ['video'] } });
    expect(ad.calls.list[0].args[0].kinds).to.deep.equal(['video']);
    await until(() => ticked() === 'm44', 3000, 'm44 auto-selected');
    expect(items().every((i) => i.getAttribute('data-kind') === 'video')).to.equal(true);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m44']);
  });

  it('5d. no asset is selectable → nothing selected, no error, "Chèn" disabled, the first asset is still previewed', async () => {
    const events = selEvents();
    const errors = opErrors();
    const log = liveLog();
    const ad = createMockAdapter({ count: 3 });
    for (const [id, status] of [['m1', 'processing'], ['m2', 'pending'], ['m3', 'failed']]) ad.db.get(id).status = status;
    await openReady({ adapter: ad, autoSelectFirst: true });
    await detailReady('m3');
    expect(ids()).to.deep.equal(['m3', 'm2', 'm1']);
    expect(ticked()).to.equal('');
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(q('.td-media-picker__error').hidden, 'no error shown').to.equal(true);
    expect(errors.length, 'no operation-error').to.equal(0);
    expect(events.length).to.equal(0);
    expect(log).to.deep.equal(['3 kết quả']);
  });
});

describe('v0.67.0 media picker autoSelectFirst — the FIRST load only (cases 6, 7, 8)', () => {
  it('6a. paging (cursor) and searching keep exactly the one auto-selected asset (multiple); it comes back ticked on its page', async () => {
    const events = selEvents();
    const { ad, promise } = await open({ autoSelectFirst: true, pageSize: 10, selection: { mode: 'multiple' } });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    expect(selCount()).to.equal(1);
    nextBtn().click();
    await until(() => ids()[0] === 'm50', 3000, 'page 2');
    expect(ad.calls.list.at(-1).args[0].cursor, 'cursor request').to.equal('10');
    expect(ticked(), 'nothing new ticked on page 2').to.equal('');
    expect(selCount(), 'still exactly one').to.equal(1);
    expect(btnText(confirmBtn())).to.equal('Chèn (1)');
    prevBtn().click();
    await until(() => ids()[0] === 'm60', 3000, 'page 1 back');
    expect(ticked(), 'the asset is ticked on its page again').to.equal('m60');
    expect(selCount()).to.equal(1);
    search('anh-1');
    await until(() => ad.calls.list.at(-1).args[0].query === 'anh-1', 3000, 'query request');
    await pageSettled(ad);
    await until(() => ids().length && ids().every((id) => assetName(id).includes('anh-1')), 3000, 'filtered grid');
    expect(ticked(), 'no result of the search is auto-selected').to.equal('');
    expect(selCount(), 'still exactly one').to.equal(1);
    expect(events.length, 'no selection-change at all').to.equal(0);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });

  it('6b. the first page has nothing selectable → a later page and a search are NOT auto-selected either', async () => {
    const events = selEvents();
    const ad = createMockAdapter({ count: 30 });
    for (const id of ['m30', 'm29', 'm28', 'm27', 'm26']) ad.db.get(id).status = 'processing'; // all of page 1 (pageSize 5)
    await open({ adapter: ad, autoSelectFirst: true, pageSize: 5 });
    await until(() => ids().join() === 'm30,m29,m28,m27,m26', 3000, 'page 1');
    expect(ticked()).to.equal('');
    expect(disabled()).to.equal(true);
    nextBtn().click();
    await until(() => ids()[0] === 'm25', 3000, 'page 2');
    expect(ticked(), 'ready assets on page 2 stay unselected').to.equal('');
    expect(disabled(), 'Chèn still disabled').to.equal(true);
    search('anh-2');
    await until(() => ad.calls.list.at(-1).args[0].query === 'anh-2', 3000, 'query request');
    await pageSettled(ad);
    await until(() => ids().length && ids().every((id) => assetName(id).includes('anh-2')), 3000, 'filtered grid');
    expect(ids().some((id) => ad.db.get(id).status === 'ready'), 'the result holds ready assets').to.equal(true);
    expect(ticked(), 'ready results of the search stay unselected').to.equal('');
    expect(disabled(), 'Chèn still disabled').to.equal(true);
    expect(events.length).to.equal(0);
  });

  it('6c. the user clears the auto-selection → the next page, the previous page and a search do not select again', async () => {
    const events = selEvents();
    const { ad } = await open({ autoSelectFirst: true, pageSize: 10, selection: { mode: 'multiple' } });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    click(tick('m60'));
    await until(() => selCount() === 0, 3000, 'cleared by the user');
    expect(events.length, 'the user change is an event').to.equal(1);
    expect(events[0].removedIds).to.deep.equal(['m60']);
    nextBtn().click();
    await until(() => ids()[0] === 'm50', 3000, 'page 2');
    expect(ticked()).to.equal('');
    expect(selCount()).to.equal(0);
    prevBtn().click();
    await until(() => ids()[0] === 'm60', 3000, 'page 1 back');
    expect(ticked(), 'm60 is not re-selected').to.equal('');
    expect(selCount()).to.equal(0);
    search('anh-1');
    await until(() => ad.calls.list.at(-1).args[0].query === 'anh-1', 3000, 'query request');
    await pageSettled(ad);
    await until(() => ids().length && ids().every((id) => assetName(id).includes('anh-1')), 3000, 'filtered grid');
    expect(ticked()).to.equal('');
    expect(selCount()).to.equal(0);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(events.length, 'only the user clear').to.equal(1);
  });

  it('6d. the user clears the auto-selection → a filter change reloads without selecting again', async () => {
    const events = selEvents();
    const { ad } = await open({ autoSelectFirst: true, selection: { mode: 'multiple' } });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    click(tick('m60'));
    await until(() => selCount() === 0, 3000, 'cleared by the user');
    await until(() => q('.td-media-picker__facets td-toggle input'), 3000, 'facets');
    q('.td-media-picker__facets td-toggle input').click(); // "Của tôi": odd ids only
    await until(() => lastList(ad).filters.scope === 'mine', 3000, 'filtered request');
    await pageSettled(ad);
    await until(() => ids().length && ids().every((id) => Number(id.slice(1)) % 2 === 1), 3000, 'filtered grid');
    expect(ticked(), 'no result of the filter is auto-selected').to.equal('');
    expect(selCount()).to.equal(0);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(events.length, 'only the user clear').to.equal(1);
  });

  it('6e. top level, the user clears the auto-selection → a search, entering a collection and Back never select again', async () => {
    const events = selEvents();
    const { ad } = await open({ autoSelectFirst: true, selection: { mode: 'multiple' } }, { collections: true });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    click(tick('m60'));
    await until(() => selCount() === 0, 3000, 'cleared by the user');
    search('anh');
    await until(() => stripShown() && cards().length > 0, 3000, 'collection strip');
    await pageSettled(ad);
    expect(ticked(), 'the search result is not auto-selected').to.equal('');
    click(card('c1'));
    await until(() => inColl() && lastList(ad).collectionId === 'c1', 3000, 'inside c1');
    await pageSettled(ad);
    expect(ids().length > 0, 'c1 has assets').to.equal(true);
    expect(ticked(), 'entering a collection does not select').to.equal('');
    press(backBtn());
    await until(() => !inColl() && lastList(ad).collectionId === null, 3000, 'back at the top level');
    await pageSettled(ad);
    expect(ticked(), 'going back does not select').to.equal('');
    expect(selCount()).to.equal(0);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(events.length, 'only the user clear').to.equal(1);
  });

  it('6f. an upload finishing while the first page is pending supersedes it: the uploaded asset is the whole selection', async () => {
    const events = selEvents();
    const log = liveLog();
    const ad = createMockAdapter({ manual: true });
    ad.ignoreSignal = true; // the stale first page may still settle later
    const promise = TdMediaPicker.open({ adapter: ad, autoSelectFirst: true, selection: { mode: 'multiple' } });
    await until(() => ad.calls.list.length === 1 && q('.td-media-picker__upload-btn'), 3000, 'first list requested');
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'upload dialog');
    await frames(2);
    dropzone().addFiles([file('moi-som.png')]);
    await until(() => ad.calls.upload.length === 1, 3000, 'upload called');
    ad.calls.upload[0].resolve();
    await until(() => ad.calls.list.length === 2, 3000, 'reload after the upload');
    expect(ad.calls.list[0].signal.aborted, 'the first request is superseded').to.equal(true);
    expect(events.map((e) => e.addedIds)).to.deep.equal([['m61']]);
    if (uploadRoot()) press(q('.td-media-picker-upload__close', uploadRoot())); // a finished single upload may have closed it already
    await until(() => !uploadRoot(), 3000, 'upload dialog closed');
    ad.calls.list[1].resolve();
    await until(() => ids()[0] === 'm61', 3000, 'reloaded page rendered');
    ad.calls.list[0].resolve(); // the stale first page arrives late
    await ad.calls.list[0].promise;
    await frames(3);
    expect(ticked(), 'only the uploaded asset').to.equal('m61');
    expect(selCount()).to.equal(1);
    expect(log.some((t) => t.includes('Đã chọn sẵn')), 'no auto-selected announcement').to.equal(false);
    expect(events.length, 'only the upload selection').to.equal(1);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m61']);
  });

  for (const order of ['the query result first, then the stale first page', 'the stale first page first, then the query result']) {
    it(`7. a query typed while the first page is pending supersedes it: ${order} → nothing is auto-selected`, async () => {
      const events = selEvents();
      const log = liveLog();
      const ad = createMockAdapter({ manual: true });
      ad.ignoreSignal = true; // an adapter that does not honour abort: the stale first page can still settle
      const promise = TdMediaPicker.open({ adapter: ad, autoSelectFirst: true });
      await until(() => ad.calls.list.length === 1 && searchHost(), 3000, 'first list requested');
      search('anh-1');
      await until(() => ad.calls.list.length === 2, 3000, 'query list requested');
      expect(ad.calls.list[0].signal.aborted, 'first request superseded').to.equal(true);
      expect(ad.calls.list[1].args[0].query).to.equal('anh-1');
      const filtered = () => ids().length > 0 && ids().every((id) => assetName(id).includes('anh-1'));
      if (order.startsWith('the query')) {
        ad.calls.list[1].resolve();
        await until(filtered, 3000, 'query result rendered');
        ad.calls.list[0].resolve(); // the stale first page arrives late
        await ad.calls.list[0].promise;
        await frames(3);
        expect(filtered(), 'the stale page was not rendered over the query result').to.equal(true);
      } else {
        ad.calls.list[0].resolve(); // the stale first page arrives first
        await ad.calls.list[0].promise;
        await frames(3);
        expect(items().length, 'the stale page was not rendered').to.equal(0);
        ad.calls.list[1].resolve();
        await until(filtered, 3000, 'query result rendered');
      }
      expect(ticked(), 'nothing selected').to.equal('');
      expect(disabled(), 'Chèn disabled').to.equal(true);
      expect(events.length).to.equal(0);
      expect(log.some((t) => t.includes('Đã chọn sẵn')), 'no auto-selected announcement').to.equal(false);
      expect(await peek(promise)).to.equal(PENDING);
    });
  }

  it('8a. an empty first page → nothing selected, no error', async () => {
    const events = selEvents();
    const errors = opErrors();
    const log = liveLog();
    await openReady({ autoSelectFirst: true }, { count: 0 });
    expect(items().length).to.equal(0);
    expect(q('.td-media-picker__empty').hidden, 'empty state shown').to.equal(false);
    expect(q('.td-media-picker__error').hidden, 'no error').to.equal(true);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(errors.length).to.equal(0);
    expect(events.length).to.equal(0);
    await until(() => log.length, 3000, 'results announced');
    expect(log).to.deep.equal(['0 kết quả']);
  });

  const failNetwork = (call) => call.reject(Object.assign(new Error('SQLSTATE secret'), { code: 'network' }));
  const errorShown = () => q('.td-media-picker__error') && !q('.td-media-picker__error').hidden;

  it('8b. a failed first load then "Thử lại" → the retry is still the opening load: the first asset is auto-selected', async () => {
    const events = selEvents();
    const errors = opErrors();
    const log = liveLog();
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad, autoSelectFirst: true });
    await until(() => ad.calls.list.length === 1, 3000, 'first list requested');
    failNetwork(ad.calls.list[0]);
    await until(errorShown, 3000, 'error shown');
    expect(errors).to.deep.equal([{ operation: 'list', code: 'network', retryable: true }]);
    expect(disabled(), 'nothing selected while the list is an error').to.equal(true);
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 2, 3000, 'retry requested');
    ad.calls.list[1].resolve();
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected by the retry');
    expect(disabled(), 'Chèn enabled').to.equal(false);
    await until(() => log.includes('60 kết quả. Đã chọn sẵn: anh-60.jpg'), 3000, 'one merged announcement');
    expect(events.length, 'no selection-change').to.equal(0);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('8c. a retry that fails again stays the opening load: the third request still auto-selects', async () => {
    const ad = createMockAdapter({ manual: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: true });
    await until(() => ad.calls.list.length === 1, 3000, 'first list requested');
    failNetwork(ad.calls.list[0]);
    await until(errorShown, 3000, 'first error');
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 2, 3000, 'retry 1 requested');
    failNetwork(ad.calls.list[1]);
    await until(() => ad.calls.list[1].settled && errorShown(), 3000, 'second error');
    expect(ticked()).to.equal('');
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 3, 3000, 'retry 2 requested');
    ad.calls.list[2].resolve();
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected by the second retry');
    expect(disabled()).to.equal(false);
  });

  it('8d. a failed first load, then the user types a query instead of retrying: that search is NOT auto-selected', async () => {
    const ad = createMockAdapter({ manual: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: true });
    await until(() => ad.calls.list.length === 1, 3000, 'first list requested');
    failNetwork(ad.calls.list[0]);
    await until(errorShown, 3000, 'error shown');
    search('anh-1');
    await until(() => ad.calls.list.length === 2 && ad.calls.list[1].args[0].query === 'anh-1', 3000, 'search requested');
    ad.calls.list[1].resolve();
    await until(() => items().length > 0, 3000, 'search rendered');
    expect(ticked(), 'a typed search is not "opening"').to.equal('');
    expect(disabled()).to.equal(true);
    // and a later Retry-style reload does not resurrect the opening load either (the window is closed)
    expect(ad.calls.list.length).to.equal(2);
  });

  it('8e. "Thử lại" of a failed LATER load (a search) does not auto-select: only the opening load carries it', async () => {
    const ad = createMockAdapter({ manual: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: true, selection: { mode: 'multiple' } });
    await until(() => ad.calls.list.length === 1, 3000, 'first list requested');
    ad.calls.list[0].resolve();
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    press(chip()); // the user empties the selection ("Bỏ chọn")
    await until(() => ticked() === '' && disabled(), 3000, 'selection emptied');
    search('anh-1');
    await until(() => ad.calls.list.length === 2, 3000, 'search requested');
    failNetwork(ad.calls.list[1]);
    await until(errorShown, 3000, 'search error shown');
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 3, 3000, 'retry of the search requested');
    expect(ad.calls.list[2].args[0].query).to.equal('anh-1');
    ad.calls.list[2].resolve();
    await until(() => items().length > 0, 3000, 'retry rendered');
    expect(ticked(), 'the retried SEARCH is not auto-selected').to.equal('');
    expect(disabled()).to.equal(true);
  });
});

describe('v0.67.0 media picker autoSelectFirst — defaults, announcement, collections (cases 9, 10, 11)', () => {
  it('9a. configureDefaults({ autoSelectFirst: true }) turns it on for an open() that sets nothing', async () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, autoSelectFirst: true });
    const promise = TdMediaPicker.open({ selection: { mode: 'single' } });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected from the defaults');
    expect(disabled()).to.equal(false);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });

  it('9b. open({ autoSelectFirst: false }) turns it off for that open only; the next open follows the defaults again', async () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, autoSelectFirst: true });
    const first = TdMediaPicker.open({ autoSelectFirst: false });
    await until(() => items().length > 0, 3000, 'first page');
    await detailReady('m60');
    expect(ticked(), 'off for this open').to.equal('');
    expect(disabled()).to.equal(true);
    document.querySelector('td-media-picker').close();
    await first;
    await closeAll();
    const second = TdMediaPicker.open();
    await until(() => ticked() === 'm60', 3000, 'on again');
    document.querySelector('td-media-picker').close();
    await second;
  });

  it('9c. only `=== true` turns it on: "true", "yes", 1 (open) and "yes" (defaults) stay off', async () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, autoSelectFirst: 'yes' });
    for (const value of [undefined, 'true', 1]) {
      const promise = TdMediaPicker.open(value === undefined ? {} : { autoSelectFirst: value });
      await until(() => items().length > 0, 3000, 'first page');
      await detailReady('m60');
      expect(ticked(), `${JSON.stringify(value)} is not true`).to.equal('');
      expect(disabled()).to.equal(true);
      document.querySelector('td-media-picker').close();
      await promise;
      await closeAll();
    }
  });

  it('10. ONE live message after the first list: the results count and "Đã chọn sẵn: {name}" together', async () => {
    const log = liveLog();
    await open({ autoSelectFirst: true });
    await until(() => log.length, 3000, 'live message');
    await detailReady('m60');
    expect(log, 'one message, merged').to.deep.equal(['60 kết quả. Đã chọn sẵn: anh-60.jpg']);
    expect(live()).to.equal('60 kết quả. Đã chọn sẵn: anh-60.jpg');
    expect(grid().querySelector('[aria-live]').textContent, 'the grid\'s own live region stays silent (no double announcement)').to.equal('');
  });

  it('10b. the name falls back to the id; the label can be overridden through options.messages', async () => {
    let log = liveLog();
    const ad = createMockAdapter();
    ad.db.get('m60').name = '';
    await open({ adapter: ad, autoSelectFirst: true });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    await until(() => log.length, 3000, 'live message');
    expect(log).to.deep.equal(['60 kết quả. Đã chọn sẵn: m60']);
    await closeAll();
    log = liveLog();
    await open({ autoSelectFirst: true, messages: { autoSelected: (p) => `Chọn sẵn ${p.name}` } });
    await until(() => log.length, 3000, 'live message');
    expect(log).to.deep.equal(['60 kết quả. Chọn sẵn anh-60.jpg']);
  });

  it('11a. initialCollection: the first selectable asset OF THAT COLLECTION is selected; the list carried its id; one merged message', async () => {
    const events = selEvents();
    const log = liveLog();
    const { ad, promise } = await open({ autoSelectFirst: true, initialCollection: { id: 'c2', label: 'Album hai' } }, { collections: true });
    await until(() => ticked() === 'm58', 3000, 'm58 auto-selected'); // c2 holds m2, m6, …, m58
    expect(ad.calls.list[0].args[0].collectionId).to.equal('c2');
    expect(ids().every((id) => (Number(id.slice(1)) - 1) % 4 === 1), 'only c2 assets').to.equal(true);
    expect(disabled()).to.equal(false);
    expect(events.length).to.equal(0);
    await detailReady('m58');
    await until(() => log.length, 3000, 'live message');
    expect(log).to.deep.equal(['Album hai: 15 kết quả. Đã chọn sẵn: anh-58.jpg']);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
  });

  it('11b. initialCollection: skipping a not-ready first asset (m58 processing → m54, a video)', async () => {
    const ad = createMockAdapter({ collections: true });
    ad.db.get('m58').status = 'processing';
    const { promise } = await open({ adapter: ad, autoSelectFirst: true, initialCollection: { id: 'c2', label: 'Album hai' } });
    await until(() => ticked() === 'm54', 3000, 'm54 auto-selected');
    expect(item('m54').getAttribute('data-kind')).to.equal('video');
    expect(ad.calls.list[0].args[0].collectionId).to.equal('c2');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m54']);
  });

  it('11c. leaving the collection (Back) never auto-selects: the user cleared it, the top-level list stays unselected', async () => {
    const events = selEvents();
    const { ad } = await open({ autoSelectFirst: true, selection: { mode: 'multiple' }, initialCollection: { id: 'c2', label: 'Album hai' } },
      { collections: true });
    await until(() => ticked() === 'm58', 3000, 'm58 auto-selected');
    click(tick('m58'));
    await until(() => selCount() === 0, 3000, 'cleared by the user');
    press(backBtn());
    await until(() => ad.calls.list.length === 2 && ad.calls.list[1].args[0].collectionId === null, 3000, 'top-level list');
    await pageSettled(ad);
    await until(() => ids()[0] === 'm60', 3000, 'top-level grid');
    expect(ticked()).to.equal('');
    expect(selCount()).to.equal(0);
    expect(disabled(), 'Chèn disabled').to.equal(true);
    expect(events.length, 'only the user clear').to.equal(1);
  });
});

describe('v0.67.0 media picker autoSelectFirst — beyond the plan (initialQuery, phone width)', () => {
  it('initialQuery: the first list is already filtered, it is still the session\'s first load → its first selectable asset is selected', async () => {
    const { ad, promise } = await open({ autoSelectFirst: true, initialQuery: 'anh-1' });
    await until(() => ticked() === 'm19', 3000, 'm19 auto-selected'); // newest image whose name holds "anh-1"
    expect(ad.calls.list[0].args[0].query).to.equal('anh-1');
    expect(ad.calls.list.length, 'one list request').to.equal(1);
    expect(disabled()).to.equal(false);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m19']);
  });

  it('phone width (< 720): the selection is made too, the grid stays in front (no detail pane opened, no preview request)', async () => {
    await setViewport({ width: 600, height: 900 });
    const events = selEvents();
    const { ad, promise } = await open({ autoSelectFirst: true });
    await until(() => ticked() === 'm60', 3000, 'm60 auto-selected');
    expect(disabled(), 'Chèn enabled').to.equal(false);
    expect(pickerRoot().getAttribute('data-view')).to.equal('grid');
    expect(ad.calls.get.length, 'no auto preview below 720').to.equal(0);
    expect(events.length).to.equal(0);
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60']);
  });
});
