import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.95.0 (plan docs/internal/plans/v0.95.0-media-picker-bulk.md) — files dropped into td-media-picker's grid upload in
// the BACKGROUND (one store per adapter object, 3 adapter.upload page-wide), in Chromium, Firefox AND WebKit (group
// `engines`): closing / removing the picker keeps them, reopening with the same adapter + context shows their cards; the
// failure strip (≥ 2 failed cards); "Đã có trong thư viện" (exact-reused) on the real card or a pinned one; caps;
// TdMediaPicker.uploads / cancelUploads(). Files are routed through the picker's @internal `_onFilesDropped(files)` (the
// drop handler's routing step; the DataTransfer path is covered by the v0.93.0 suite).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { TdToast } = await import('./td-toast.js');
const { createMockAdapter, assetFields } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const host = () => document.querySelector('td-media-picker');
const selIds = () => [...(host()?._s?.model?.ids || [])];
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const cards = () => [...(pickerRoot()?.querySelectorAll('.td-media-picker__card--upload') || [])];
const errorCards = () => cards().filter((c) => c.getAttribute('data-upload') === 'error');
const strip = () => q('.td-media-picker__upload-failed');
const stripShown = () => !!strip() && !strip().hidden;
const toastTexts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((t) => t.textContent);
const discardDialog = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')]
  .find((r) => r.getAttribute('data-state') !== 'closing' && r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
const MiB = 1024 * 1024;
const PENDING = Symbol('pending');
const L = (k, p = {}) => String(TdMediaPicker.labels[k]).replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m));

let pngBytes = null;
async function png(name) {
  if (!pngBytes) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    c.getContext('2d').fillRect(0, 0, 16, 16);
    pngBytes = await new Promise((r) => c.toBlob(r, 'image/png'));
  }
  return new File([pngBytes], name, { type: 'image/png' });
}
const txt = (name) => new File([new Uint8Array(8)], name, { type: 'text/plain' });

/** Hold every adapter.upload until the test settles it (see the v0.93.0 suite). */
function holdUploads(ad) {
  const real = ad.upload;
  const held = [];
  held.pending = () => held.filter((h) => !h.done).length;
  ad.upload = (file, opts) => new Promise((res, rej) => {
    const h = { file, opts, done: false };
    const finish = (fn) => (v) => { if (h.done) return; h.done = true; fn(v); };
    h.resolve = () => { if (!h.done) real(file, { ...opts, onProgress: undefined }).then(finish(res), finish(rej)); };
    h.reject = (err = { code: 'server' }) => finish(rej)(err);
    opts.signal?.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      finish(rej)(e);
    }, { once: true });
    held.push(h);
  });
  return held;
}

let said = [];
let obs = null;

async function openSettled(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const events = { asset: [], selection: [] };
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => [...pickerRoot().querySelectorAll('[data-td-media-item]:not(.td-media-picker__card--upload)')].length > 0
    || !q('.td-media-picker__empty').hidden, 4000, 'first page');
  const h = host();
  h.addEventListener('asset-change', (e) => events.asset.push(e.detail));
  h.addEventListener('selection-change', (e) => events.selection.push(e.detail));
  said = [];
  obs?.disconnect();
  obs = new MutationObserver(() => { const t = q('.td-media-picker__live')?.textContent; if (t) said.push(t); });
  obs.observe(q('.td-media-picker__live'), { childList: true, characterData: true, subtree: true });
  return { ad, promise, events };
}
const dropFiles = (files) => host()._onFilesDropped(files);
/** heard since openSettled, or still in the live region: the first page's message ("{n} kết quả" + the reopen note) is
 *  written before openSettled starts recording */
const heard = (text) => said.some((s) => s.includes(text)) || !!q('.td-media-picker__live')?.textContent.includes(text);

async function closePicker() {
  const h = host();
  if (h && h.isOpen) h.close('programmatic');
  await until(() => !pickerRoot(), 4000, 'closed');
  document.querySelectorAll('td-media-picker').forEach((el) => el.remove());
}

/** an image of the mock library that is NOT on the current page (dedup is by name → exact-reused) */
function offPageName() {
  const onPage = new Set(items().map((el) => el.getAttribute('data-id')));
  for (let i = 60; i >= 1; i--) {
    const image = i % 15 !== 11 && i % 10 !== 4;
    if (image && !onPage.has(`m${i}`)) return { id: `m${i}`, name: `anh-${i}.jpg` };
  }
  throw new Error('no off-page image');
}

afterEach(async () => {
  obs?.disconnect();
  obs = null;
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdMediaPicker.cancelUploads();
  TdModal.closeAll();
  TdToast.clear();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
  expect(TdMediaPicker.uploads).to.deep.equal({ running: 0, waiting: 0, failed: 0 });
});

describe('v0.95.0 td-media-picker — background uploads', () => {
  it('closing while grid files upload asks nothing; they go on; reopening (same adapter + context) shows their cards', async () => {
    const { ad } = await openSettled({ selection: { mode: 'multiple' }, context: 'post-1' });
    const held = holdUploads(ad);
    dropFiles([await png('nen-a.png'), await png('nen-b.png')]);
    await until(() => held.length === 2, 3000, '2 uploads');
    q('.td-modal__close').click();
    await until(() => !pickerRoot(), 4000, 'closed without a question');
    expect(discardDialog()).to.equal(null);
    expect(held.some((h) => h.opts.signal.aborted)).to.equal(false);
    expect(TdMediaPicker.uploads).to.deep.equal({ running: 2, waiting: 0, failed: 0 });
    document.querySelectorAll('td-media-picker').forEach((el) => el.remove());

    const { events } = await openSettled({ adapter: ad, selection: { mode: 'multiple' }, context: 'post-1' });
    await until(() => cards().length === 2, 3000, 'cards back');
    expect(cards().map((c) => c.querySelector('.td-media-picker__name').textContent)).to.deep.equal(['nen-a.png', 'nen-b.png']);
    expect(items()[0]).to.equal(cards()[0]);
    await until(() => heard(L('uploadsResumed', { n: 2, k: 0 })), 2000, 'uploadsResumed');
    // a file of an EARLIER open finishes quietly: no selection, no asset-change
    held[0].resolve();
    await until(() => cards().some((c) => c.getAttribute('data-upload') === 'done') || cards().length === 1, 3000, 'done');
    await wait(200);
    expect(events.asset.length).to.equal(0);
    expect(selIds().length).to.equal(0);
  });

  it('another context sees none of them; removing the host while open keeps them too', async () => {
    const { ad } = await openSettled({ context: 'a' });
    const held = holdUploads(ad);
    dropFiles([await png('ctx-a.png')]);
    await until(() => held.length === 1);
    host().remove(); // removed while open
    await until(() => !pickerRoot(), 4000, 'gone');
    expect(held[0].opts.signal.aborted).to.equal(false);
    await openSettled({ adapter: ad, context: 'b' });
    await wait(100);
    expect(cards().length).to.equal(0);
    await closePicker();
    await openSettled({ adapter: ad, context: 'a' });
    await until(() => cards().length === 1, 3000, 'context a card');
  });

  it('a batch that ends while no picker shows it → one toast (warning with failures, else success)', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dropFiles([await png('dong-a.png'), await png('dong-b.png')]);
    await until(() => held.length === 2);
    await closePicker();
    held[0].reject();
    held[1].resolve();
    await until(() => toastTexts().includes(L('uploadFailedClosed', { n: 1 })), 3000, 'warning toast');
    expect(TdMediaPicker.uploads.failed).to.equal(1);
    TdToast.clear();
    const { ad: ad2 } = await openSettled();
    const held2 = holdUploads(ad2);
    dropFiles([await png('dong-c.png')]);
    await until(() => held2.length === 1);
    await closePicker();
    held2[0].resolve();
    await until(() => toastTexts().some((t) => t.includes('1/1')), 3000, 'success toast');
  });

  it('the 3 slots are page-wide: adapter B waits for adapter A', async () => {
    const { ad: a } = await openSettled();
    const heldA = holdUploads(a);
    dropFiles([await png('a1.png'), await png('a2.png'), await png('a3.png')]);
    await until(() => heldA.length === 3);
    await closePicker();
    const { ad: b } = await openSettled();
    const heldB = holdUploads(b);
    dropFiles([await png('b1.png'), await png('b2.png')]);
    await until(() => cards().length === 2, 3000, 'b cards');
    await wait(100);
    expect(heldB.length).to.equal(0);
    expect(cards().every((c) => c.hasAttribute('data-waiting'))).to.equal(true);
    expect(TdMediaPicker.uploads).to.deep.equal({ running: 3, waiting: 2, failed: 0 });
    heldA[0].resolve();
    await until(() => heldB.length === 1, 3000, 'B starts');
  });

  it('cancelUploads(): every signal aborted, nothing left, returns the count, no toast', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dropFiles([await png('h1.png'), await png('h2.png'), await png('h3.png'), await png('h4.png')]);
    await until(() => held.length === 3);
    await closePicker();
    expect(TdMediaPicker.cancelUploads()).to.equal(4);
    expect(held.every((h) => h.opts.signal.aborted)).to.equal(true);
    await wait(100);
    expect(held.length).to.equal(3);
    expect(toastTexts().length).to.equal(0);
  });

  it(`more than 100 files → 100 cards, the rest rejected (count)`, async () => {
    const { ad } = await openSettled();
    holdUploads(ad);
    const files = Array.from({ length: 101 }, (_, i) => txt(`n-${i}.txt`));
    dropFiles(files);
    await until(() => cards().length === 100, 4000, '100 cards');
    await until(() => toastTexts().includes(L('dropRejected', { n: 1 })), 2000, 'rejected toast');
  });
});

describe('v0.95.0 td-media-picker — failure strip', () => {
  it('one failed card → no strip; two → the strip; "Thử lại tất cả" retries them; "Gỡ tất cả lỗi" removes them', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dropFiles([await png('l1.png'), await png('l2.png'), await png('l3.png')]);
    await until(() => held.length === 3);
    held[0].reject();
    await until(() => errorCards().length === 1);
    expect(stripShown()).to.equal(false);
    held[1].reject();
    held[2].reject();
    await until(() => stripShown(), 3000, 'strip');
    expect(strip().classList.contains('td-alert--danger')).to.equal(true);
    expect(strip().nextElementSibling).to.equal(q('.td-media-picker__grid'));
    expect(q('.td-media-picker__upload-failed-text').textContent).to.equal(L('uploadFailedStrip', { n: 3 }));
    const retryAll = q('.td-media-picker__upload-retry-all');
    expect(retryAll.textContent).to.equal(L('retryAll'));
    retryAll.focus();
    retryAll.click();
    await until(() => held.length === 6, 3000, 'retried');
    // the live text lands in a microtask and the recorder (MutationObserver) in the next one: wait for it
    await until(() => said.some((s) => s.includes(L('retryAllStarted', { n: 3 }))), 2000, 'retryAllStarted');
    expect(stripShown()).to.equal(false);
    expect(strip().contains(document.activeElement)).to.equal(false);
    expect(document.activeElement).to.not.equal(document.body);
    held.slice(3).forEach((h) => h.reject());
    await until(() => stripShown() && errorCards().length === 3, 3000, 'strip again');
    const removeAll = q('.td-media-picker__upload-remove-all');
    removeAll.focus();
    removeAll.click();
    await until(() => cards().length === 0, 3000, 'removed');
    await until(() => said.some((s) => s.includes(L('removedFailed', { n: 3 }))), 2000, 'removedFailed');
    expect(stripShown()).to.equal(false);
    expect(document.activeElement).to.not.equal(document.body);
    expect(TdMediaPicker.uploads.failed).to.equal(0);
  });

  it('failed files of an earlier open come back with the strip', async () => {
    const { ad } = await openSettled({ context: 'x' });
    const held = holdUploads(ad);
    dropFiles([await png('f1.png'), await png('f2.png')]);
    await until(() => held.length === 2);
    await closePicker();
    held.forEach((h) => h.reject());
    await until(() => TdMediaPicker.uploads.failed === 2, 3000, 'failed in the background');
    TdToast.clear();
    await openSettled({ adapter: ad, context: 'x' });
    await until(() => errorCards().length === 2 && stripShown(), 3000, 'cards + strip');
    await until(() => heard(L('uploadsResumed', { n: 0, k: 2 })), 2000, 'resumed');
  });
});

describe('v0.95.0 td-media-picker — "Đã có trong thư viện"', () => {
  it('exact-reused of an asset on the page → the real card gets the chip, selected, asset-change', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    const real = items()[0];
    const id = real.getAttribute('data-id');
    const name = real.querySelector('.td-media-picker__name').textContent;
    dropFiles([await png(name)]);
    await until(() => held.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 1, 3000, 'asset-change');
    expect(events.asset[0].deduplication.outcome).to.equal('exact-reused');
    await until(() => items().filter((el) => el.getAttribute('data-id') === id).length === 1
      && items().find((el) => el.getAttribute('data-id') === id).hasAttribute('data-reused'), 3000, 'chip');
    const el = items().find((x) => x.getAttribute('data-id') === id);
    expect(el.querySelector('.td-media-picker__reused').textContent).to.equal(L('reusedBadge'));
    expect(el.querySelector('[data-td-media-open]').getAttribute('aria-label').endsWith(', đã có trong thư viện')).to.equal(true);
    expect(selIds()).to.include(id);
  });

  it('exact-reused of an asset NOT on the page → a pinned card (chip) through the reload; a user query drops it, still selected', async () => {
    const { ad } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    const off = offPageName();
    dropFiles([await png(off.name)]);
    await until(() => held.length === 1);
    held[0].resolve();
    await until(() => cards().length === 1 && cards()[0].getAttribute('data-upload') === 'done', 3000, 'done');
    await wait(400); // the page-1 reload (source upload) rendered
    expect(cards().length).to.equal(1);
    expect(cards()[0].getAttribute('data-id')).to.equal(off.id);
    expect(cards()[0].hasAttribute('data-reused')).to.equal(true);
    expect(items()[0]).to.equal(cards()[0]);
    expect(selIds()).to.include(off.id);
    host()._applyQuery('anh');
    await until(() => !cards().some((c) => c.getAttribute('data-id') === off.id) || items().some((el) => el.getAttribute('data-id') === off.id && !el.classList.contains('td-media-picker__card--upload')), 3000, 'pinned card gone');
    expect(selIds()).to.include(off.id);
  });

  it('exact-reused that finished while closed → pinned with the chip on the next open', async () => {
    const { ad } = await openSettled({ context: 'r' });
    const held = holdUploads(ad);
    const off = offPageName();
    dropFiles([await png(off.name)]);
    await until(() => held.length === 1);
    await closePicker();
    held[0].resolve();
    await until(() => held[0].done, 3000, 'finished');
    await wait(50);
    TdToast.clear();
    await openSettled({ adapter: ad, context: 'r' });
    await until(() => cards().some((c) => c.getAttribute('data-id') === off.id && c.hasAttribute('data-reused')), 3000, 'pinned');
    expect(selIds().length).to.equal(0);
  });
});

describe('v0.95.0 td-media-picker — plan §Test cases (integration)', () => {
  it('an optimisation error + an upload error: "Thử lại tất cả" resends only the upload error; one failure left → no strip', async () => {
    // the processor refuses "opt-*" files (optimisation error, never uploaded) and returns its own clean PNG for every
    // other file. metadata 'none': a compliant 16×16 PNG still goes through the site processor (with 'keep' it is kept
    // as it is, image-resize.js — the processor would never run). The output must be a 'none' fixpoint (processor output
    // is untrusted): Firefox / WebKit canvas PNGs carry ancillary chunks, so a passthrough would be refused there — hand
    // back a 1×1 PNG of IHDR / IDAT / IEND only.
    const CLEAN = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    const processor = (file) => (file.name.startsWith('opt-') ? Promise.reject(Object.assign(new Error('x'), { code: 'decode-failed' }))
      : Promise.resolve(new File([CLEAN], file.name, { type: 'image/png' })));
    const { ad } = await openSettled({ upload: { maxSize: '1MB', imageResize: { maxPixels: 1e6, metadata: 'none', processor } } });
    const held = holdUploads(ad);
    dropFiles([await png('opt-a.png'), await png('up-b.png')]);
    await until(() => held.length === 1, 3000, 'one upload');
    expect(held[0].file.name).to.equal('up-b.png');
    held[0].reject();
    await until(() => errorCards().length === 2 && stripShown(), 3000, 'two failures → strip');
    expect(q('.td-media-picker__upload-retry-all').hidden).to.equal(false);
    q('.td-media-picker__upload-retry-all').click();
    await until(() => held.length === 2, 3000, 'retried');
    await wait(100);
    expect(held.length).to.equal(2);
    expect(held[1].file.name).to.equal('up-b.png');
    expect(errorCards().length).to.equal(1);
    expect(stripShown()).to.equal(false);
  });

  it('reopened failed cards retry ("Thử lại" and "Thử lại tất cả") with the drop-time collectionId / context', async () => {
    const coll = { initialCollection: { id: 'c2', label: 'Bộ sưu tập 2' }, context: 'k' };
    const { ad } = await openSettled(coll, { collections: true });
    const held = holdUploads(ad);
    dropFiles([await png('alb-1.png'), await png('alb-2.png')]);
    await until(() => held.length === 2, 3000, '2 uploads');
    expect(held.map((h) => h.opts.collectionId)).to.deep.equal(['c2', 'c2']);
    await closePicker();
    held.forEach((h) => h.reject());
    await until(() => TdMediaPicker.uploads.failed === 2, 3000, 'failed in the background');
    TdToast.clear();
    // reopened at the library root (another collection scope), same adapter + context
    await openSettled({ adapter: ad, context: 'k' });
    await until(() => errorCards().length === 2, 3000, 'failed cards back');
    errorCards()[0].querySelector('.td-media-picker__upload-retry').click();
    await until(() => held.length === 3, 3000, 'single retry');
    expect(held[2].opts.collectionId).to.equal('c2');
    expect(held[2].opts.context).to.equal('k');
    held[2].reject();
    await until(() => errorCards().length === 2 && stripShown(), 3000, 'strip');
    q('.td-media-picker__upload-retry-all').click();
    await until(() => held.length === 5, 3000, 'retry all');
    expect(held.slice(3).map((h) => h.opts.collectionId)).to.deep.equal(['c2', 'c2']);
    expect(held.slice(3).map((h) => h.opts.context)).to.deep.equal(['k', 'k']);
  });

  it('a dirty detail form + a grid upload: closing asks because of the form only; "Bỏ thay đổi" keeps the upload running', async () => {
    const { ad } = await openSettled({ assetFields: assetFields() });
    const held = holdUploads(ad);
    dropFiles([await png('form-up.png')]);
    await until(() => held.length === 1, 3000, 'upload');
    const real = items().find((el) => !el.classList.contains('td-media-picker__card--upload'));
    click(real.querySelector('[data-td-media-open]'));
    const title = await until(() => !q('.td-media-picker__detail')?.hasAttribute('data-loading')
      && q('.td-media-picker__field[data-key="title"] input'), 3000, 'detail form');
    title.focus();
    await sendKeys({ type: ' sửa' });
    q('.td-modal__close').click();
    await until(() => discardDialog(), 3000, 'discard confirm (form)');
    [...discardDialog().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.includes(TdMediaPicker.labels.discard)).click();
    await until(() => !pickerRoot(), 4000, 'closed');
    expect(held[0].opts.signal.aborted).to.equal(false);
    expect(TdMediaPicker.uploads.running).to.equal(1);
  });

  it('"Chèn" while a grid file uploads resolves at once with the current selection', async () => {
    const { ad, promise } = await openSettled();
    const held = holdUploads(ad);
    dropFiles([await png('chen.png')]);
    await until(() => held.length === 1, 3000, 'upload');
    const real = items().find((el) => !el.classList.contains('td-media-picker__card--upload'));
    const id = real.getAttribute('data-id');
    click(real.querySelector('[data-td-media-open]'));
    await until(() => !q('.td-media-picker__confirm').hasAttribute('disabled'), 3000, 'selected');
    q('.td-media-picker__confirm').click();
    const out = await Promise.race([promise, wait(1000).then(() => PENDING)]);
    expect(out).to.not.equal(PENDING);
    expect(out.status).to.equal('selected');
    expect(out.selection.map((x) => x.assetId)).to.deep.equal([id]);
    expect(discardDialog()).to.equal(null);
    expect(held[0].opts.signal.aborted).to.equal(false);
  });

  it('reopening with a DIFFERENT adapter shows none of the cards; the old adapter shows them again', async () => {
    const { ad } = await openSettled({ context: 'same' });
    const held = holdUploads(ad);
    dropFiles([await png('ad-a.png')]);
    await until(() => held.length === 1);
    await closePicker();
    await openSettled({ context: 'same' }); // a new mock adapter object
    await wait(150);
    expect(cards().length).to.equal(0);
    expect(stripShown()).to.equal(false);
    await closePicker();
    await openSettled({ adapter: ad, context: 'same' });
    await until(() => cards().length === 1, 3000, 'card back');
  });

  it('the 256 MiB estimated cap: a policy file that would pass it is rejected (count) with a dropRejected toast', async () => {
    const processor = () => new Promise(() => {}); // optimisation never ends: the estimate (file size) stays counted
    const { ad } = await openSettled({ upload: { imageResize: { maxPixels: 1e6, processor } } });
    holdUploads(ad);
    const big = async (name) => {
      const f = await png(name);
      Object.defineProperty(f, 'size', { value: 150 * MiB }); // a reported size only (no 150 MiB allocation)
      return f;
    };
    dropFiles([await big('lon-1.png'), await big('lon-2.png')]);
    await until(() => toastTexts().includes(L('dropRejected', { n: 1 })), 3000, 'rejected toast');
    expect(cards().map((c) => c.querySelector('.td-media-picker__name').textContent)).to.deep.equal(['lon-1.png']);
  });

  it('single (multiple: false): a background file of an earlier open keeps running when this open drops one', async () => {
    const { ad } = await openSettled({ upload: { multiple: false }, context: 's' });
    const held = holdUploads(ad);
    dropFiles([await png('nen-1.png')]);
    await until(() => held.length === 1);
    await closePicker();
    await openSettled({ adapter: ad, upload: { multiple: false }, context: 's' });
    await until(() => cards().length === 1, 3000, 'background card');
    dropFiles([await png('moi-1.png')]);
    await until(() => held.length === 2, 3000, 'second upload');
    await wait(100);
    expect(held[0].opts.signal.aborted).to.equal(false);
    expect(cards().map((c) => c.querySelector('.td-media-picker__name').textContent).sort()).to.deep.equal(['moi-1.png', 'nen-1.png']);
  });

  it('an error of an earlier open\'s file → no operation-error on picker B (same adapter); its card shows the error', async () => {
    const { ad } = await openSettled({ context: 'e' });
    const held = holdUploads(ad);
    dropFiles([await png('cu-loi.png')]);
    await until(() => held.length === 1);
    await closePicker();
    await openSettled({ adapter: ad, context: 'e' });
    const errors = [];
    host().addEventListener('operation-error', (e) => errors.push(e.detail));
    await until(() => cards().length === 1, 3000, 'card');
    held[0].reject();
    await until(() => errorCards().length === 1, 3000, 'error card');
    await wait(150);
    expect(errors).to.deep.equal([]);
  });
});
