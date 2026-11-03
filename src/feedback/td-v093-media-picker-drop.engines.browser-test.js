import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.93.0 (plan docs/internal/plans/v0.93.0-media-picker-grid-drop.md) — OS files dropped on an open td-media-picker, in
// Chromium, Firefox AND WebKit (group `engines`). Site without uploadFields → placeholder cards first in the grid,
// uploaded in place (max 3 adapter.upload picker-wide, shared with the upload dialog); site with any uploadFields → the
// upload dialog with the files HELD until its button. Drops use a real DataTransfer on the picker dialog; an engine
// whose `new DragEvent(…, { dataTransfer })` comes out without the DataTransfer (seen in some WebKit builds) goes
// through the picker's @internal `_onFilesDropped(files)` (the drop handler's routing step) — `dispatchDrop` reports it.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { TdToast } = await import('./td-toast.js');
await import('../form/td-dropzone.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

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
const running = () => cards().filter((c) => c.getAttribute('data-upload') !== 'done');
const grid = () => q('.td-media-picker__grid');
const results = () => q('.td-media-picker__results');
const dialogEl = () => q('.td-media-picker__dialog');
const toastTexts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((t) => t.textContent);
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const discardDialog = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const clickDiscard = (yes) => {
  const btns = [...discardDialog().querySelectorAll('.td-modal__footer .td-btn')];
  btns.find((b) => b.textContent.includes(yes ? TdMediaPicker.labels.discard : TdMediaPicker.labels.keepEditing)).click();
};
const uploadRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker-upload')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const dropzone = () => uploadRoot()?.querySelector('td-dropzone') || null;
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const L = (k, p = {}) => String(TdMediaPicker.labels[k]).replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m));

// --- synthetic files ---
let pngBytes = null;
async function pngBlob() {
  if (pngBytes) return pngBytes;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(0, 0, 24, 16);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, 12, 16);
  pngBytes = await new Promise((r) => c.toBlob(r, 'image/png'));
  return pngBytes;
}
const png = async (name) => new File([await pngBlob()], name, { type: 'image/png' });
async function tinyPng(name) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  c.getContext('2d').fillRect(0, 0, 8, 8);
  return new File([await new Promise((r) => c.toBlob(r, 'image/png'))], name, { type: 'image/png' });
}
const txt = (name, size = 10) => new File([new Uint8Array(size)], name, { type: 'text/plain' });
const pdf = (name, size = 64) => {
  const b = new Uint8Array(size);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  return new File([b], name, { type: 'application/pdf' });
};

/**
 * Hold every adapter.upload until the test settles it. `resolve()` = the mock's default result (created / exact-reused
 * by name); `progress(pct)`; `reject(err)`. An abort rejects (AbortError) and marks `aborted`. `done` = the promise
 * settled (its upload slot is free). `max` = the most uploads ever pending at once.
 */
function holdUploads(ad) {
  const real = ad.upload;
  const held = [];
  held.max = 0;
  held.pending = () => held.filter((h) => !h.done).length;
  ad.upload = (file, opts) => new Promise((res, rej) => {
    const h = { file, opts, done: false, aborted: false };
    const finish = (fn) => (v) => { if (h.done) return; h.done = true; fn(v); };
    h.resolve = () => { if (!h.done) real(file, { ...opts, onProgress: undefined }).then(finish(res), finish(rej)); };
    h.reject = (err) => finish(rej)(err);
    h.progress = (pct) => opts.onProgress?.({ percent: pct });
    opts.signal?.addEventListener('abort', () => {
      if (h.done) return;
      h.aborted = true;
      const e = new Error('aborted');
      e.name = 'AbortError';
      finish(rej)(e);
    }, { once: true });
    held.push(h);
    held.max = Math.max(held.max, held.pending());
  });
  return held;
}

/** Hold adapter.list while `gate.on` (the held calls resolve with the mock's answer AT RELEASE TIME). */
function gateList(ad) {
  const real = ad.list;
  const gate = { on: false, held: [] };
  ad.list = (req) => {
    if (!gate.on) return real(req);
    return new Promise((res, rej) => { gate.held.push({ req, go: () => real(req).then(res, rej) }); });
  };
  gate.release = (i = 0) => { const h = gate.held.splice(i, 1)[0]; if (h) h.go(); };
  return gate;
}

/** every text the picker's live region showed (MutationObserver) */
let said = [];
let obs = null;

async function openSettled(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const events = { asset: [], errors: [], selection: [] };
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => getComputedStyle(dialogEl()).transform === 'none', 4000, 'open motion');
  let done = false;
  Promise.all(dialogEl().getAnimations().map((a) => a.finished.catch(() => {}))).then(() => { done = true; });
  await until(() => done, 4000, 'open transition finished');
  await until(() => items().length > 0 || !q('.td-media-picker__empty').hidden, 4000, 'first page');
  const h = host();
  h.addEventListener('asset-change', (e) => events.asset.push(e.detail));
  h.addEventListener('operation-error', (e) => events.errors.push(e.detail));
  h.addEventListener('selection-change', (e) => events.selection.push(e.detail));
  said = [];
  obs = new MutationObserver(() => { const t = q('.td-media-picker__live')?.textContent; if (t) said.push(t); });
  obs.observe(q('.td-media-picker__live'), { childList: true, characterData: true, subtree: true });
  return { ad, promise, root: pickerRoot(), events };
}

/** Drop files on `target` (default: the picker dialog) with a real DataTransfer. @returns {{ ev, via: 'event'|'internal' }} */
function dispatchDrop(files, target = q('.td-media-picker__grid')) {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
  if (!ev.dataTransfer) { // this engine drops the DataTransfer of a synthetic DragEvent: the routing step directly
    host()._onFilesDropped(files);
    return { ev, via: 'internal' };
  }
  target.dispatchEvent(ev);
  return { ev, via: 'event' };
}
const dtSupported = () => !!new DragEvent('drop', { dataTransfer: new DataTransfer() }).dataTransfer;

async function closeAll() {
  obs?.disconnect();
  obs = null;
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdMediaPicker.cancelUploads(); // v0.95.0: grid drops upload in the background — never leak into the next test's pool
  TdModal.closeAll();
  TdToast.clear();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal, :scope > .td-media-picker-upload'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

afterEach(async () => {
  await closeAll();
  await setViewport({ width: 1280, height: 800 });
});

describe('v0.93.0 td-media-picker — drop files into the grid', () => {
  it('2 images → placeholder cards first (busy, greyed canvas, progress), then done → selected, detail, reload, toast 2/2', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    const firstReal = items()[0];
    dispatchDrop([await png('moi-a.png'), await png('moi-b.png')]);
    await until(() => cards().length === 2 && cards().every((c) => c.querySelector('.td-media-grid__tick')), 3000, 'placeholders');
    expect(items()[0]).to.equal(cards()[0]);
    expect(items()[1]).to.equal(cards()[1]);
    expect(items()[2]).to.equal(firstReal);
    for (const c of cards()) {
      expect(c.getAttribute('aria-busy')).to.equal('true');
      expect(c.getAttribute('data-id')).to.match(/^td-up-/);
      const open = c.querySelector('[data-td-media-open]');
      expect(open.getAttribute('aria-disabled')).to.equal('true');
      expect(open.getAttribute('aria-label')).to.include(c.querySelector('.td-media-picker__name').textContent);
      expect(getComputedStyle(c.querySelector('.td-media-grid__tick')).display).to.equal('none');
    }
    expect(cards()[0].querySelector('.td-media-picker__name').textContent).to.equal('moi-a.png');
    expect(said.some((s) => s.includes(L('dropStarted', { n: 2 })))).to.equal(true);
    await until(() => cards().every((c) => c.querySelector('canvas.td-media-picker__upload-preview')), 3000, 'canvas previews');
    expect(getComputedStyle(cards()[0].querySelector('canvas')).filter).to.include('grayscale');
    await until(() => held.length === 2, 3000, 'uploads started');
    held[0].progress(40);
    await until(() => cards()[0].querySelector('td-progress').getAttribute('value') === '40', 2000, 'progress 40');
    expect(cards()[0].querySelector('.td-media-picker__meta').textContent).to.equal('Đang tải lên…');
    held[0].resolve();
    await until(() => events.asset.length === 1, 3000, 'asset-change 1');
    held[1].resolve();
    await until(() => events.asset.length === 2, 3000, 'asset-change 2');
    const ids = events.asset.map((e) => e.asset.id);
    expect(events.asset.every((e) => e.operation === 'upload')).to.equal(true);
    await until(() => toastTexts().includes(L('uploadDone', { ok: 2, total: 2 })), 3000, 'toast 2/2');
    // the reload of page 1 replaces the placeholders with the real cards (newest first)
    await until(() => cards().length === 0 && ids.every((id) => q(`[data-td-media-item][data-id="${id}"]`)), 4000, 'real cards');
    for (const id of ids) {
      expect(pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${id}"]`).length).to.equal(1);
      expect(q(`[data-td-media-item][data-id="${id}"]`).hasAttribute('data-selected')).to.equal(true);
    }
    expect(selIds().sort()).to.deep.equal([...ids].sort());
    expect(q('.td-media-picker__detail').getAttribute('data-state')).to.equal('ready');
    expect(toastTexts().filter((t) => t === L('uploadDone', { ok: 2, total: 2 })).length).to.equal(1);
  });

  it('single mode: the file that finishes last is selected', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'single' } });
    const held = holdUploads(ad);
    dispatchDrop([await png('s-1.png'), await png('s-2.png')]);
    await until(() => held.length === 2, 3000, 'uploads');
    held[1].resolve();
    await until(() => events.asset.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 2);
    const last = events.asset[1].asset.id;
    await until(() => selIds().length === 1 && selIds()[0] === last, 3000, 'last wins');
  });

  it('multiple + maxItems full → "limit" announced, nothing more selected', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple', maxItems: 1, initialIds: ['m60'] } });
    await until(() => selIds().length === 1, 3000, 'initial');
    const held = holdUploads(ad);
    dispatchDrop([await png('full.png')]);
    await until(() => held.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 1);
    await until(() => said.some((s) => s.includes(L('limit', { max: 1 }))), 3000, 'limit');
    expect(selIds()).to.deep.equal(['m60']);
  });

  it('wrong type / over maxSize (no policy) → no card, a dropRejected toast, the reasons in the live region', async () => {
    const { ad } = await openSettled({ upload: { accept: 'image/*', maxSize: '1KB' } });
    const held = holdUploads(ad);
    dispatchDrop([txt('ghi-chu.txt'), new File([new Uint8Array(4096)], 'lon.png', { type: 'image/png' })]);
    await until(() => toastTexts().includes(L('dropRejected', { n: 2 })), 3000, 'toast');
    expect(cards().length).to.equal(0);
    await wait(50);
    expect(held.length).to.equal(0);
    const all = said.join(' | ');
    expect(all).to.include('ghi-chu.txt');
    expect(all).to.include('lon.png');
  });

  it('imageResize → queued / optimizing, then uploading; the adapter gets `optimization`', async () => {
    const gates = [];
    const processor = (file, { signal }) => new Promise((resolve, reject) => {
      gates.push(async () => resolve(await tinyPng(file.name)));
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const { ad } = await openSettled({ upload: { imageResize: { maxPixels: 100, processor } } });
    const held = holdUploads(ad);
    dispatchDrop([await png('to.png')]);
    await until(() => cards().length === 1);
    await until(() => ['queued', 'optimizing'].includes(cards()[0].getAttribute('data-upload')), 2000, 'optimising state');
    await until(() => gates.length === 1, 3000, 'processor called');
    expect(held.length).to.equal(0);
    gates[0]();
    await until(() => held.length === 1, 3000, 'upload');
    expect(cards()[0].getAttribute('data-upload')).to.equal('uploading');
    expect(held[0].opts.optimization).to.be.an('object');
  });

  it('adapter error → card error + "Thử lại" → success; "Gỡ" removes; × while uploading aborts silently', async () => {
    const { ad, events } = await openSettled();
    const held = holdUploads(ad);
    dispatchDrop([await png('loi.png'), await png('go.png'), await png('huy.png')]);
    await until(() => held.length === 3);
    const byName = (n) => cards().find((c) => c.querySelector('.td-media-picker__name').textContent === n);
    held[0].reject(Object.assign(new Error('raw 500'), { code: 'server' }));
    await until(() => byName('loi.png').getAttribute('data-upload') === 'error');
    await until(() => said.some((s) => s.includes(L('dropFailed', { name: 'loi.png' }))), 2000, 'failure announced');
    held[1].reject(Object.assign(new Error('raw 500'), { code: 'server' }));
    await until(() => byName('go.png').getAttribute('data-upload') === 'error');
    expect(byName('loi.png').getAttribute('aria-busy')).to.equal('false');
    expect(events.errors.filter((e) => e.operation === 'upload').length).to.equal(2);
    // × of a running card: aborted, no operation-error, no toast
    const huy = byName('huy.png');
    click(huy.querySelector('.td-media-picker__upload-remove'));
    await until(() => !huy.isConnected, 2000, 'cancelled card gone');
    expect(held[2].aborted).to.equal(true);
    expect(events.errors.length).to.equal(2);
    // "Gỡ" of a failed card
    const go = byName('go.png');
    expect(go.querySelector('.td-media-picker__upload-remove').getAttribute('aria-label')).to.equal(L('dropRemove', { name: 'go.png' }));
    click(go.querySelector('.td-media-picker__upload-remove'));
    await until(() => !go.isConnected);
    // "Thử lại"
    const retry = byName('loi.png').querySelector('.td-media-picker__upload-retry');
    expect(retry.textContent).to.equal(L('dropRetry'));
    click(retry);
    await until(() => held.length === 4, 2000, 'retried');
    expect(held[3].file.name).to.equal('loi.png');
    held[3].resolve();
    await until(() => events.asset.length === 1, 3000, 'uploaded after retry');
    expect(toastTexts().filter((t) => t.startsWith('Đã tải lên ')).length).to.be.at.most(1);
  });

  it('exact-reused while the real card is on the page → the placeholder leaves at once, the real card is selected, "reused"', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    dispatchDrop([await png('anh-60.jpg')]);
    await until(() => held.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 1);
    expect(events.asset[0].deduplication.outcome).to.equal('exact-reused');
    await until(() => cards().length === 0, 2000, 'placeholder gone');
    expect(pickerRoot().querySelectorAll('[data-td-media-item][data-id="m60"]').length).to.equal(1);
    await until(() => q('[data-td-media-item][data-id="m60"]').hasAttribute('data-selected'));
    expect(said.some((s) => s.includes(L('reused', { name: 'anh-60.jpg' })))).to.equal(true);
  });

  it('done order: data-id = asset before the reload; one element per asset; the reload swaps in the real card', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    const gate = gateList(ad);
    dispatchDrop([await png('thu-tu.png')]);
    await until(() => held.length === 1);
    gate.on = true;
    held[0].resolve();
    await until(() => events.asset.length === 1);
    const id = events.asset[0].asset.id;
    await until(() => gate.held.length === 1, 2000, 'reload held');
    const card = cards()[0];
    expect(card.getAttribute('data-upload')).to.equal('done');
    expect(card.getAttribute('data-id')).to.equal(id);
    expect(card.getAttribute('aria-busy')).to.equal('false');
    await until(() => card.hasAttribute('data-selected'), 2000, 'done card selected');
    expect(card.querySelector('.td-media-grid__tick').getAttribute('aria-pressed')).to.equal('true');
    expect(pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${id}"]`).length).to.equal(1);
    const open = card.querySelector('[data-td-media-open]');
    expect(open.hasAttribute('aria-disabled')).to.equal(false);
    // activate = the regular card (view in multiple mode)
    host()._closeDetail?.();
    click(open);
    await until(() => q('.td-media-picker__detail').getAttribute('data-state') === 'ready', 2000, 'detail');
    gate.on = false;
    gate.release();
    await until(() => !card.isConnected, 3000, 'placeholder replaced');
    const real = pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${id}"]`);
    expect(real.length).to.equal(1);
    expect(real[0].classList.contains('td-media-picker__card--upload')).to.equal(false);
    expect(real[0].hasAttribute('data-selected')).to.equal(true);
    expect(said.some((s) => s.includes('không hiện vì bộ lọc'))).to.equal(false);
  });

  it('done order variant: a list response started BEFORE the upload finished never removes the done card', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const held = holdUploads(ad);
    const gate = gateList(ad);
    dispatchDrop([await png('truoc.png')]);
    await until(() => held.length === 1);
    gate.on = true;
    host()._loadPage('reload', { keepGrid: true }); // a request in flight before the upload finished
    await until(() => gate.held.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 1);
    await until(() => gate.held.length === 2, 2000, 'reload after done');
    const card = cards()[0];
    gate.on = false;
    gate.release(0); // the older one (superseded): never renders
    await wait(80);
    expect(card.isConnected).to.equal(true);
    expect(card.getAttribute('data-upload')).to.equal('done');
    gate.release(0);
    await until(() => !card.isConnected, 3000, 'replaced by the later reload');
  });

  it('teardown mix: grid (3 running, 2 waiting) + dialog files waiting → close, confirm → the dialog files never upload, the grid goes on', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    const files = [];
    for (let i = 0; i < 5; i++) files.push(await png(`t-${i}.png`));
    dispatchDrop(files);
    await until(() => held.length === 3, 3000, '3 running');
    await until(() => cards().filter((c) => c.hasAttribute('data-waiting')).length >= 2);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dropzone().addFiles([await png('d-1.png'), await png('d-2.png')]);
    await wait(50);
    expect(held.length).to.equal(3);
    // the dialog closes first (it asks: files in flight) — then the picker asks
    host()._requestFinish('cancel', 'close');
    await until(() => discardDialog(), 3000, 'discard confirm');
    clickDiscard(true);
    await until(() => !pickerRoot(), 4000, 'closed');
    await wait(150);
    // v0.95.0: the grid files upload in the background (3 running, never aborted); the dialog's never start
    expect(held.length).to.equal(3);
    expect(held.some((h) => h.done)).to.equal(false);
    held[0].resolve();
    await until(() => held.length === 4, 3000, 'a background waiter starts');
    expect(held.every((h) => /^t-/.test(h.file.name))).to.equal(true);
    expect(TdMediaPicker.cancelUploads()).to.equal(4);
    await wait(50);
    expect(held.length).to.equal(4);
    expect(held.slice(1).every((h) => h.opts.signal.aborted)).to.equal(true);
  });

  it('a filter the new asset does not match → card removed after the reload, uploadedHidden, still selected', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' }, initialFilters: { album: 2 } });
    const held = holdUploads(ad);
    dispatchDrop([await png('loc.png')]);
    await until(() => held.length === 1);
    held[0].resolve();
    await until(() => events.asset.length === 1);
    const id = events.asset[0].asset.id;
    await until(() => cards().length === 0, 4000, 'card removed');
    expect(q(`[data-td-media-item][data-id="${id}"]`)).to.equal(null);
    await until(() => said.some((s) => s.includes(L('uploadedHidden', { name: 'loc.png' }))), 2000, 'uploadedHidden');
    expect(selIds()).to.include(id);
  });

  it('drop on page 2 → page 1 at once with keepGrid (placeholders shown while it loads); a query change keeps the grid', async () => {
    const { ad } = await openSettled({ pagination: 'pages', initialQuery: 'anh' }, { pagination: 'pages' });
    host()._loadPage(2, { nav: true });
    await until(() => host()._s.pages.page === 2 && !results().getAttribute('aria-busy')?.includes('true'), 3000, 'page 2');
    const page2First = items()[0];
    const held = holdUploads(ad);
    const gate = gateList(ad);
    gate.on = true;
    dispatchDrop([await png('trang.png')]);
    await until(() => gate.held.length === 1, 2000, 'page 1 requested');
    expect(gate.held[0].req.query).to.equal('anh');
    expect(grid().hidden).to.equal(false);
    expect(q('.td-media-picker__skeleton').hidden).to.equal(true);
    const card = cards()[0];
    expect(card.getBoundingClientRect().height).to.be.greaterThan(0);
    expect(page2First.isConnected).to.equal(true);
    gate.release();
    await until(() => host()._s.pages.page === 1 && !page2First.isConnected, 3000, 'page 1');
    expect(items()[0]).to.equal(card);
    expect(host()._s.query).to.equal('anh');
    // a query change while a placeholder is there: the grid stays visible during the load
    host()._applyQuery('anh-5');
    await until(() => gate.held.length === 1, 2000, 'query load held');
    expect(grid().hidden).to.equal(false);
    expect(q('.td-media-picker__skeleton').hidden).to.equal(true);
    gate.on = false;
    gate.release();
    await until(() => results().getAttribute('aria-busy') === 'false');
    expect(card.isConnected).to.equal(true);
    expect(held.length).to.equal(1);
  });

  it('inside a collection → adapter.upload gets its collectionId', async () => {
    const { ad } = await openSettled({ initialCollection: { id: 'c2', label: 'Bộ sưu tập 2' } }, { collections: true });
    const held = holdUploads(ad);
    dispatchDrop([await png('album.png')]);
    await until(() => held.length === 1);
    expect(held[0].opts.collectionId).to.equal('c2');
  });

  it('at most 3 uploads in the grid: 5 files → 3 calls until one finishes; cards 4-5 wait', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    const files = [];
    for (let i = 0; i < 5; i++) files.push(await png(`gh-${i}.png`));
    dispatchDrop(files);
    await until(() => held.length === 3);
    for (const h of held) h.progress(10);
    await wait(50);
    expect(held.length).to.equal(3);
    const wait45 = cards().slice(3);
    expect(wait45.every((c) => c.hasAttribute('data-waiting'))).to.equal(true);
    expect(wait45.every((c) => c.querySelector('.td-media-picker__meta').textContent === 'Đang chờ…')).to.equal(true);
    held[0].resolve();
    await until(() => held.length === 4, 3000, 'fourth starts');
    expect(held.max).to.equal(3);
  });

  it('at most 3 in the upload dialog: 5 files → 3 calls, rows 4-5 wait; one done → the 4th starts', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    const files = [];
    for (let i = 0; i < 5; i++) files.push(await png(`dl-${i}.png`));
    dropzone().addFiles(files);
    await until(() => held.length === 3);
    for (const h of held) h.progress(10);
    await wait(50);
    expect(held.length).to.equal(3);
    const rows = [...dropzone().querySelectorAll('.td-dropzone__item')];
    expect(rows.slice(3).every((r) => r.hasAttribute('data-waiting'))).to.equal(true);
    expect(rows.slice(0, 3).some((r) => r.hasAttribute('data-waiting'))).to.equal(false);
    held[0].resolve();
    await until(() => held.length === 4, 3000, '4th');
    expect(held.max).to.equal(3);
  });

  it('grid + dialog share the 3 slots', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dispatchDrop([await png('g-1.png'), await png('g-2.png')]);
    await until(() => held.length === 2);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dropzone().addFiles([await png('d-1.png'), await png('d-2.png'), await png('d-3.png')]);
    await until(() => held.length === 3);
    await wait(50);
    expect(held.pending()).to.equal(3);
    expect(held[2].file.name).to.equal('d-1.png');
    held[0].resolve();
    await until(() => held.length === 4, 3000, 'next dialog file');
    expect(held[3].file.name).to.equal('d-2.png');
    expect(held.max).to.equal(3);
  });

  it('dialog batch with a policy: never > 3 uploads, one toast "4/5" after the last file, the dialog stays (error row)', async () => {
    const processor = (file) => Promise.resolve(file);
    const { ad } = await openSettled({ upload: { maxSize: '1KB', imageResize: { maxPixels: 1e6, processor } } });
    const held = holdUploads(ad);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    const files = [];
    for (let i = 0; i < 4; i++) files.push(await png(`p-${i}.png`));
    files.push(txt('qua-lon.txt', 4096)); // not an image over maxSize → error row (failed file of the batch)
    dropzone().addFiles(files);
    await until(() => held.length === 3, 3000, '3 uploads');
    await until(() => dropzone().querySelector('.td-dropzone__item[data-status="error"]'), 3000, 'error row');
    for (let k = 0; k < 4; k++) {
      await until(() => held.length > k, 3000, `upload ${k}`);
      held[k].resolve();
      await until(() => held[k].done, 3000);
      if (k < 3) expect(toastTexts().some((t) => t.startsWith('Đã tải lên 4/5'))).to.equal(false);
    }
    await until(() => toastTexts().includes(L('uploadDone', { ok: 4, total: 5 })), 3000, 'toast 4/5');
    await wait(100);
    expect(toastTexts().filter((t) => t === L('uploadDone', { ok: 4, total: 5 })).length).to.equal(1);
    expect(held.max).to.be.at.most(3);
    expect(uploadRoot()).to.not.equal(null);
  });

  it('a standalone td-dropzone with a hook is not limited: 5 files → 5 hook calls at once', async () => {
    const dz = document.createElement('td-dropzone');
    dz.setAttribute('multiple', '');
    document.body.appendChild(dz);
    const calls = [];
    dz.upload = (file) => new Promise(() => { calls.push(file); });
    dz.addFiles([txt('1.txt'), txt('2.txt'), txt('3.txt'), txt('4.txt'), txt('5.txt')]);
    await wait(20);
    expect(calls.length).to.equal(5);
    dz.clear();
    dz.remove();
  });

  it('v0.95.0: closing while grid files upload does not ask; the uploads go on; cancelUploads() aborts them', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dispatchDrop([await png('c-1.png'), await png('c-2.png')]);
    await until(() => held.length === 2);
    click(q('.td-modal__close'));
    await until(() => !pickerRoot(), 4000, 'closed without a question');
    expect(discardDialog()).to.equal(null);
    expect(held.some((h) => h.opts.signal.aborted)).to.equal(false);
    expect(TdMediaPicker.uploads.running).to.equal(2);
    expect(TdMediaPicker.cancelUploads()).to.equal(2);
    expect(held.every((h) => h.opts.signal.aborted)).to.equal(true);
  });

  it('drag state: dragenter → data-drop + hint; dragleave (depth) / drop / dragend clear it; text drags untouched', async function () {
    if (!dtSupported()) this.skip(); // the effect needs the DataTransfer on the event (routing is covered elsewhere)
    const { ad } = await openSettled();
    holdUploads(ad);
    expect(q('.td-media-picker__drop-hint')).to.equal(null); // created lazily
    const dt = new DataTransfer();
    dt.items.add(await png('k.png'));
    const fire = (type, el) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(ev);
      return ev;
    };
    const a = q('.td-media-picker__toolbar');
    const b = grid();
    expect(fire('dragenter', a).defaultPrevented).to.equal(true);
    fire('dragenter', b);
    expect(results().getAttribute('data-drop')).to.equal('over');
    expect(q('.td-media-picker__drop-hint').hidden).to.equal(false);
    expect(q('.td-media-picker__drop-hint').textContent).to.equal(L('dropHint'));
    fire('dragleave', a);
    expect(results().getAttribute('data-drop')).to.equal('over');
    fire('dragleave', b);
    expect(results().hasAttribute('data-drop')).to.equal(false);
    fire('dragenter', b);
    fire('drop', b);
    expect(results().hasAttribute('data-drop')).to.equal(false);
    fire('dragenter', b);
    fire('dragend', b);
    expect(results().hasAttribute('data-drop')).to.equal(false);
    // text drag: default kept, no state
    const tdt = new DataTransfer();
    tdt.setData('text/plain', 'xin chào');
    const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: tdt });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(false);
    expect(results().hasAttribute('data-drop')).to.equal(false);
  });

  it('a drag started inside the picker is ignored; no upload source → dropEffect none, no card, the drop is swallowed', async function () {
    if (!dtSupported()) this.skip();
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    const thumb = items()[0];
    thumb.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
    const r1 = dispatchDrop([await png('noi-bo.png')]);
    expect(r1.ev.defaultPrevented).to.equal(false);
    thumb.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    await wait(30);
    expect(cards().length).to.equal(0);
    expect(held.length).to.equal(0);
    await closeAll();
    await openSettled({}, { upload: false, uploadFromUrl: false });
    const dt = new DataTransfer();
    dt.items.add(await png('khong.png'));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    grid().dispatchEvent(over);
    expect(over.defaultPrevented).to.equal(true);
    expect(over.dataTransfer.dropEffect).to.equal('none');
    expect(results().hasAttribute('data-drop')).to.equal(false);
    const r2 = dispatchDrop([await png('khong.png')]);
    expect(r2.ev.defaultPrevented).to.equal(true);
    await wait(30);
    expect(cards().length).to.equal(0);
  });

  it('a layer over the picker (upload dialog, discard confirm) → a drop on the picker does nothing', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dispatchDrop([await png('duoi.png')], dialogEl());
    await wait(50);
    expect(cards().length).to.equal(0);
    expect(held.length).to.equal(0);
  });

  it('uploadFields with a required field → the dialog holds the files; submit locked until filled; fields sent', async () => {
    const { ad } = await openSettled({ uploadFields: [{ key: 'title', label: 'Tiêu đề', control: 'text', required: true }] });
    const held = holdUploads(ad);
    dispatchDrop([await png('h-1.png'), await png('h-2.png')]);
    await until(() => uploadRoot()?.querySelector('.td-media-picker-upload__held'), 3000, 'held block');
    expect(cards().length).to.equal(0);
    const block = uploadRoot().querySelector('.td-media-picker-upload__held');
    expect(block.querySelector('.td-media-picker-upload__held-title').textContent).to.equal(L('uploadHeld', { n: 2 }));
    expect([...block.querySelectorAll('.td-media-picker-upload__held-name')].map((n) => n.textContent)).to.deep.equal(['h-1.png', 'h-2.png']);
    const submit = block.querySelector('.td-media-picker-upload__held-submit');
    expect(submit.textContent).to.equal(L('uploadHeldSubmit', { n: 2 }));
    expect(submit.hasAttribute('disabled')).to.equal(true);
    await until(() => uploadRoot().getAttribute('data-state') === 'open');
    const input = uploadRoot().querySelector('.td-media-picker__field[data-key="title"] input');
    await until(() => document.activeElement === input, 2000, 'focus on the required field');
    await sendKeys({ type: 'Bìa' });
    await until(() => !submit.hasAttribute('disabled'), 2000, 'unlocked');
    expect(held.length).to.equal(0);
    click(submit);
    await until(() => held.length === 2, 3000, 'uploads');
    expect(held.map((h) => h.opts.fields.title)).to.deep.equal(['Bìa', 'Bìa']);
    expect(uploadRoot().querySelector('.td-media-picker-upload__held')).to.equal(null);
  });

  it('held files + close → no question, no upload', async () => {
    const { ad } = await openSettled({ uploadFields: [{ key: 'title', label: 'Tiêu đề', control: 'text', required: true }] });
    const held = holdUploads(ad);
    dispatchDrop([await png('bo.png')]);
    await until(() => uploadRoot()?.querySelector('.td-media-picker-upload__held'), 3000, 'held');
    await until(() => uploadRoot().getAttribute('data-state') === 'open');
    click(uploadRoot().querySelector('.td-modal__close'));
    await until(() => !uploadRoot(), 3000, 'closed without asking');
    expect(modalRoots().some((r) => r.textContent.includes(TdMediaPicker.labels.uploadCancelTitle))).to.equal(false);
    await wait(50);
    expect(held.length).to.equal(0);
  });

  it('only optional uploadFields → held, submit not locked, 0 uploads until the button; then fields = the typed value', async () => {
    const { ad } = await openSettled({ uploadFields: [{ key: 'title', label: 'Tiêu đề', control: 'text' }] });
    const held = holdUploads(ad);
    dispatchDrop([await png('o-1.png'), await png('o-2.png')]);
    await until(() => uploadRoot()?.querySelector('.td-media-picker-upload__held'), 3000, 'held');
    const submit = uploadRoot().querySelector('.td-media-picker-upload__held-submit');
    expect(submit.hasAttribute('disabled')).to.equal(false);
    await until(() => uploadRoot().getAttribute('data-state') === 'open');
    const input = uploadRoot().querySelector('.td-media-picker__field[data-key="title"] input');
    await until(() => document.activeElement === input, 2000, 'focus on the first field');
    await wait(100);
    expect(held.length).to.equal(0);
    await sendKeys({ type: 'Tuỳ chọn' });
    await wait(100);
    expect(held.length).to.equal(0);
    // "Bỏ" one held file, then submit the other... no: submit both
    click(submit);
    await until(() => held.length === 2, 3000, '2 uploads');
    expect(held.map((h) => h.opts.fields.title)).to.deep.equal(['Tuỳ chọn', 'Tuỳ chọn']);
  });

  it('a held file can be removed ("Bỏ {name}")', async () => {
    await openSettled({ uploadFields: [{ key: 'title', label: 'Tiêu đề', control: 'text' }] });
    dispatchDrop([await png('r-1.png'), await png('r-2.png')]);
    await until(() => uploadRoot()?.querySelector('.td-media-picker-upload__held'), 3000, 'held');
    const rm = uploadRoot().querySelector('.td-media-picker-upload__held-remove');
    expect(rm.getAttribute('aria-label')).to.equal(L('uploadHeldRemove', { name: 'r-1.png' }));
    click(rm);
    const block = uploadRoot().querySelector('.td-media-picker-upload__held');
    expect(block.querySelectorAll('.td-media-picker-upload__held-item').length).to.equal(1);
    expect(block.querySelector('.td-media-picker-upload__held-title').textContent).to.equal(L('uploadHeld', { n: 1 }));
    expect(block.querySelector('.td-media-picker-upload__held-submit').textContent).to.equal(L('uploadHeldSubmit', { n: 1 }));
  });

  it('a11y: an uploading card is not selectable by tick / Space / range, and says nothing ("chưa sẵn sàng" never)', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    holdUploads(ad);
    dispatchDrop([await png('a11y.png')]);
    await until(() => cards().length === 1 && cards()[0].querySelector('.td-media-grid__tick'));
    const card = cards()[0];
    const id = card.getAttribute('data-id');
    click(card.querySelector('.td-media-grid__tick'));
    const open = card.querySelector('[data-td-media-open]');
    open.focus();
    await sendKeys({ press: 'Space' });
    click(open, { shiftKey: true });
    const far = items()[3].querySelector('[data-td-media-open]');
    expect(far).to.not.equal(null);
    click(far, { shiftKey: true }); // range across the card
    click(open);
    await wait(80);
    expect(grid().selectedIds).to.not.include(id);
    expect(card.hasAttribute('data-selected')).to.equal(false);
    expect(selIds()).to.not.include(id);
    expect(said.some((s) => s.includes(L('notReady')))).to.equal(false);
    expect(events.selection.every((e) => !e.addedIds.includes(id))).to.equal(true);
  });

  it('a PDF gets the kind icon (no canvas, no object URL); file names render as text', async () => {
    const { ad } = await openSettled();
    holdUploads(ad);
    dispatchDrop([pdf('<img src=x onerror=alert(1)>.pdf')]);
    await until(() => cards().length === 1);
    const c = cards()[0];
    expect(c.querySelector('canvas')).to.equal(null);
    expect(c.querySelector('.td-media-picker__thumb-icon svg')).to.not.equal(null);
    expect(c.querySelector('img')).to.equal(null);
    expect(c.querySelector('.td-media-picker__name').textContent).to.equal('<img src=x onerror=alert(1)>.pdf');
    expect(pickerRoot().innerHTML).to.not.include('blob:');
  });
});

describe('v0.93.0 td-media-picker — grid drop, Codex impl r1 regressions', () => {
  it('#1 an adapter asset with id "td-up-1" is a normal card: opens + selects; a placeholder id met on a new page is re-keyed', async () => {
    const ad = createMockAdapter();
    const a = ad.db.get('m60');
    ad.db.delete('m60');
    a.id = 'td-up-1';
    ad.db.set('td-up-1', a); // newest → first card
    const { events } = await openSettled({ adapter: ad, selection: { mode: 'multiple' } });
    const real = () => q('[data-td-media-item][data-id="td-up-1"]');
    await until(() => real(), 3000, 'td-up-1 card');
    click(real().querySelector('[data-td-media-open]'));
    await until(() => host()._s.detailId === 'td-up-1', 3000, 'detail of td-up-1');
    click(real().querySelector('.td-media-grid__tick'));
    await until(() => selIds().includes('td-up-1'), 3000, 'td-up-1 selected');
    expect(events.selection.some((e) => e.addedIds.includes('td-up-1'))).to.equal(true);
    // a placeholder whose id a page later brings as a real asset: re-keyed, still pending, never two equal data-ids
    const held = holdUploads(ad);
    dispatchDrop([await png('re-key.png')]);
    await until(() => held.length === 1 && cards().length === 1, 3000, 'placeholder');
    const pid = cards()[0].getAttribute('data-id');
    expect(host()._s.drop.isPending(pid)).to.equal(true);
    expect(host()._s.drop.isPending('td-up-1')).to.equal(false);
    const twin = JSON.parse(JSON.stringify(ad.db.get('m59')));
    twin.id = pid;
    twin.name = 'twin.png';
    ad.db.set(pid, twin);
    host()._loadPage('reload', { reset: true, keepGrid: true });
    await until(() => host()._s.items.has(pid), 3000, 'page with the twin');
    expect(pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${CSS.escape(pid)}"]`).length).to.equal(1);
    expect(cards().length).to.equal(1);
    expect(cards()[0].getAttribute('data-id')).to.not.equal(pid);
    expect(host()._s.drop.isPending(cards()[0].getAttribute('data-id'))).to.equal(true);
    expect(host()._s.drop.isPending(pid)).to.equal(false);
    click(host()._s.items.get(pid).querySelector('.td-media-grid__tick'));
    await until(() => selIds().includes(pid), 3000, 'the real twin is selectable');
  });

  it('#2 Space / tick / Ctrl·Shift-click on a pending card never reach td-media-grid (no select-change, no range anchor)', async () => {
    const { ad } = await openSettled({ selection: { mode: 'multiple' } });
    holdUploads(ad);
    dispatchDrop([await png('anchor.png')]);
    await until(() => cards().length === 1 && cards()[0].querySelector('.td-media-grid__tick'));
    const gridChanges = [];
    grid().addEventListener('select-change', (e) => gridChanges.push(e.detail));
    const card = cards()[0];
    const open = card.querySelector('[data-td-media-open]');
    open.focus();
    await sendKeys({ press: 'Space' });
    click(card.querySelector('.td-media-grid__tick'));
    click(open, { ctrlKey: true });
    click(open, { metaKey: true });
    click(open, { shiftKey: true });
    await wait(50);
    expect(gridChanges.length, 'no grid select-change for a pending card').to.equal(0);
    expect(grid().selectedIds).to.deep.equal([]);
    // Shift+click on a real card: no anchor was set on the pending card → only that card flips (no range through it)
    const far = items()[3];
    click(far.querySelector('[data-td-media-open]'), { shiftKey: true });
    await until(() => gridChanges.length === 1, 2000, 'one grid change');
    expect(grid().selectedIds).to.deep.equal([far.getAttribute('data-id')]);
    expect(gridChanges[0].added).to.deep.equal([far.getAttribute('data-id')]);
  });

  it('#3 a malformed adapter.upload result → operation-error (upload, server) + error card / error row, grid and dialog', async () => {
    const { ad, events } = await openSettled();
    ad.upload = () => Promise.resolve({ asset: { secret: 'x' }, deduplication: {} });
    dispatchDrop([await png('hong.png')]);
    await until(() => cards().length === 1 && cards()[0].getAttribute('data-upload') === 'error', 3000, 'error card');
    await until(() => events.errors.length === 1, 2000, 'operation-error (grid)');
    expect(events.errors[0]).to.deep.include({ operation: 'upload', code: 'server' });
    expect(cards()[0].querySelector('.td-media-picker__meta').textContent).to.equal(L('uploadError'));
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dropzone().addFiles([await png('hong-2.png')]);
    await until(() => dropzone().querySelector('[data-status="error"]'), 3000, 'error row');
    await until(() => events.errors.length === 2, 2000, 'operation-error (dialog)');
    expect(events.errors[1]).to.deep.include({ operation: 'upload', code: 'server' });
  });

  it('#4 two drops deduplicated to the same asset → one done card, _onUploaded (asset-change) for each', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const gate = gateList(ad);
    const asset = JSON.parse(JSON.stringify(ad.db.get('m58')));
    asset.id = 'nx1';
    asset.name = 'nx.png';
    const settle = [];
    ad.upload = () => new Promise((res) => settle.push(res));
    dispatchDrop([await png('dup-a.png'), await png('dup-b.png')]);
    await until(() => settle.length === 2, 3000, 'uploads');
    gate.on = true; // the reload after each upload waits: the done cards stay
    settle[0]({ asset, deduplication: { outcome: 'created' } });
    await until(() => events.asset.length === 1, 3000, 'first');
    settle[1]({ asset, deduplication: { outcome: 'exact-reused', matchedAssetId: 'nx1' } });
    await until(() => events.asset.length === 2, 3000, 'second');
    await wait(30);
    expect(pickerRoot().querySelectorAll('[data-td-media-item][data-id="nx1"]').length).to.equal(1);
    expect(cards().length).to.equal(1);
    expect(host()._s.drop.doneIds()).to.deep.equal(['nx1']);
    expect(selIds()).to.include('nx1');
  });

  it('#5 upload.multiple false → single queue: extras rejected; a new drop replaces the running / failed card (slot freed)', async () => {
    const { ad, events } = await openSettled({ upload: { multiple: false } });
    const held = holdUploads(ad);
    dispatchDrop([await png('mot-1.png'), await png('mot-2.png')]);
    await until(() => held.length === 1 && cards().length === 1, 3000, 'one card');
    await until(() => toastTexts().includes(L('dropRejected', { n: 1 })), 3000, 'extra rejected');
    expect(cards()[0].querySelector('.td-media-picker__name').textContent).to.equal('mot-1.png');
    const first = cards()[0];
    dispatchDrop([await png('mot-3.png')]); // replaces the running one
    await until(() => held.length === 2 && !first.isConnected, 3000, 'replaced');
    expect(held[0].aborted).to.equal(true);
    expect(cards().length).to.equal(1);
    expect(cards()[0].querySelector('.td-media-picker__name').textContent).to.equal('mot-3.png');
    expect(host()._s.uploadSlots.active).to.equal(1);
    held[1].reject(Object.assign(new Error('x'), { code: 'server' }));
    await until(() => cards()[0].getAttribute('data-upload') === 'error', 3000, 'failed');
    const failed = cards()[0];
    dispatchDrop([await png('mot-4.png')]); // replaces the failed one
    await until(() => held.length === 3 && !failed.isConnected, 3000, 'failed replaced');
    expect(cards().length).to.equal(1);
    expect(host()._s.uploadSlots.active).to.equal(1);
    held[2].resolve();
    await until(() => events.asset.length === 1, 3000, 'done');
    expect(host()._s.uploadSlots.active).to.equal(0);
    expect(events.asset[0].asset.name).to.equal('mot-4.png');
  });

  it('#6 grid upload field errors (no field form) → their messages on the card', async () => {
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    dispatchDrop([await png('truong.png')]);
    await until(() => held.length === 1);
    held[0].reject(Object.assign(new Error('raw'), { code: 'validation', fieldErrors: { album: ['Chọn một album'], title: ['Tiêu đề quá dài'] } }));
    await until(() => cards()[0].getAttribute('data-upload') === 'error', 3000, 'error card');
    const text = cards()[0].querySelector('.td-media-picker__meta').textContent;
    expect(text).to.include('Chọn một album');
    expect(text).to.include('Tiêu đề quá dài');
  });

  it('#7 window blur after an internal drag (no dragend) → the next file drop is accepted', async function () {
    if (!dtSupported()) this.skip();
    const { ad } = await openSettled();
    const held = holdUploads(ad);
    items()[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event('blur'));
    const r = dispatchDrop([await png('sau-blur.png')]);
    expect(r.ev.defaultPrevented).to.equal(true);
    await until(() => cards().length === 1 && held.length === 1, 3000, 'accepted');
  });

  it('#8 uploadedHidden names the asset the server returned', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' }, initialFilters: { album: 2 } });
    const real = ad.upload;
    ad.upload = (f, o) => real(f, o).then((r) => ({ ...r, asset: { ...r.asset, name: 'ten-may-chu.png' } }));
    dispatchDrop([await png('ten-goc.png')]);
    await until(() => events.asset.length === 1, 4000, 'uploaded');
    await until(() => cards().length === 0, 4000, 'card removed');
    await until(() => said.some((s) => s.includes(L('uploadedHidden', { name: 'ten-may-chu.png' }))), 2000, 'uploadedHidden');
  });
});

describe('v0.93.0 td-media-picker — grid drop, Codex impl r2 regressions', () => {
  it('#10 a finished upload whose asset id is another pending placeholder\'s id → that placeholder is re-keyed; one element per id; it still finishes', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple' } });
    const gate = gateList(ad);
    const real = ad.upload;
    const calls = [];
    ad.upload = (file, opts) => new Promise((res, rej) => calls.push({ file, opts, res, rej }));
    dispatchDrop([await png('khoa-a.png'), await png('khoa-b.png')]);
    await until(() => calls.length === 2 && cards().length === 2, 3000, 'two placeholders');
    const firstCard = cards()[0];
    expect(firstCard.querySelector('.td-media-picker__name').textContent).to.equal('khoa-a.png');
    const pid = firstCard.getAttribute('data-id');
    expect(host()._s.drop.isPending(pid)).to.equal(true);
    gate.on = true; // the reloads wait: the done cards stay on the page
    const asset = JSON.parse(JSON.stringify(ad.db.get('m58')));
    asset.id = pid; // the server's id for khoa-b = the id of the still pending khoa-a placeholder
    asset.name = 'khoa-b.png';
    calls[1].res({ asset, deduplication: { outcome: 'created' } });
    await until(() => events.asset.length === 1, 3000, 'khoa-b done');
    const same = [...pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${CSS.escape(pid)}"]`)];
    expect(same.length, 'one element per id').to.equal(1);
    expect(same[0]).to.not.equal(firstCard);
    expect(same[0].getAttribute('data-upload')).to.equal('done');
    expect(firstCard.isConnected).to.equal(true);
    const rekeyed = firstCard.getAttribute('data-id');
    expect(rekeyed).to.not.equal(pid);
    expect(host()._s.drop.isPending(rekeyed)).to.equal(true);
    expect(host()._s.drop.isPending(pid)).to.equal(false);
    expect(firstCard.hasAttribute('data-td-media-pending')).to.equal(true);
    // the re-keyed placeholder still uploads and finishes normally
    real(calls[0].file, { ...calls[0].opts, onProgress: undefined }).then(calls[0].res, calls[0].rej);
    await until(() => events.asset.length === 2, 3000, 'khoa-a done');
    const idA = events.asset[1].asset.id;
    expect(idA).to.not.equal(pid);
    expect(firstCard.getAttribute('data-upload')).to.equal('done');
    expect(firstCard.getAttribute('data-id')).to.equal(idA);
    expect(host()._s.drop.doneIds().sort()).to.deep.equal([pid, idA].sort());
    for (const id of [pid, idA]) {
      expect(pickerRoot().querySelectorAll(`[data-td-media-item][data-id="${CSS.escape(id)}"]`).length).to.equal(1);
    }
    expect(selIds()).to.include.members([pid, idA]);
    gate.on = false;
    while (gate.held.length) gate.release();
  });

  it('#11 adapter.upload rejects with a Proxy whose traps throw → normal error card + operation-error, no unhandled rejection', async () => {
    const { ad, events } = await openSettled();
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(1); e.preventDefault(); };
    window.addEventListener('unhandledrejection', onUnhandled);
    const trap = () => { throw new Error('trap'); };
    ad.upload = () => Promise.reject(new Proxy({}, { get: trap, has: trap, getPrototypeOf: trap, ownKeys: trap }));
    try {
      dispatchDrop([await png('bay.png')]);
      await until(() => cards().length === 1 && cards()[0].getAttribute('data-upload') === 'error', 3000, 'error card');
      await until(() => events.errors.length === 1, 2000, 'operation-error');
      expect(events.errors[0]).to.deep.include({ operation: 'upload', code: 'server' });
      const proxyText = cards()[0].querySelector('.td-media-picker__meta').textContent;
      // the same text as an ordinary server failure (a plain Error)
      ad.upload = () => Promise.reject(new Error('thuong'));
      dispatchDrop([await png('thuong.png')]);
      await until(() => cards().length === 2 && cards()[0].getAttribute('data-upload') === 'error', 3000, 'plain error card');
      expect(proxyText).to.not.equal('');
      expect(proxyText).to.equal(cards()[0].querySelector('.td-media-picker__meta').textContent);
      await wait(100);
      expect(unhandled.length, 'no unhandled rejection').to.equal(0);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('#12 a pending card between two real cards takes no maxItems slot in a Shift range', async () => {
    const { ad, events } = await openSettled({ selection: { mode: 'multiple', maxItems: 2 } });
    const gate = gateList(ad);
    const held = holdUploads(ad);
    dispatchDrop([await png('xong.png'), await png('cho.png')]);
    await until(() => held.length === 2 && cards().length === 2, 3000, 'two placeholders');
    gate.on = true; // keep the done card (no reload)
    held[0].resolve();
    await until(() => events.asset.length === 1, 3000, 'first done');
    const done = cards()[0];
    const pending = cards()[1];
    const doneId = done.getAttribute('data-id');
    expect(done.getAttribute('data-upload')).to.equal('done');
    expect(pending.hasAttribute('data-td-media-pending')).to.equal(true);
    const realCard = items()[2];
    expect(items()[1]).to.equal(pending);
    expect(realCard.classList.contains('td-media-picker__card--upload')).to.equal(false);
    // start from an empty selection, anchor on the real card
    if (selIds().includes(doneId)) {
      click(done.querySelector('.td-media-grid__tick'));
      await until(() => selIds().length === 0, 2000, 'done card unselected');
    }
    expect(selIds()).to.deep.equal([]);
    const realId = realCard.getAttribute('data-id');
    click(realCard.querySelector('.td-media-grid__tick'));
    await until(() => selIds().length === 1, 2000, 'real card selected');
    const limits = [];
    grid().addEventListener('select-limit', () => limits.push(1));
    said = [];
    click(done.querySelector('[data-td-media-open]'), { shiftKey: true }); // range real → (pending) → done
    await until(() => selIds().length === 2, 2000, 'range of two');
    await wait(50);
    expect(selIds().sort()).to.deep.equal([doneId, realId].sort());
    expect(limits.length, 'no select-limit').to.equal(0);
    expect(said.some((s) => s.includes(L('limit', { max: 2 })))).to.equal(false);
    expect(pending.hasAttribute('data-selected')).to.equal(false);
    gate.on = false;
    while (gate.held.length) gate.release();
  });

  it('preview: ONE createImageBitmap(file, { resizeWidth, resizeHeight ≤ 320 }) per image; the canvas is 320×320', async () => {
    const orig = window.createImageBitmap;
    const calls = [];
    window.createImageBitmap = function (...args) { calls.push(args); return orig.apply(this, args); };
    try {
      const { ad } = await openSettled();
      holdUploads(ad);
      dispatchDrop([await png('xem-truoc.png')]);
      await until(() => cards().length === 1 && cards()[0].querySelector('canvas.td-media-picker__upload-preview'), 3000, 'canvas');
      expect(calls.length).to.equal(1);
      for (const [, opts] of calls) {
        expect(opts && opts.resizeWidth, 'resizeWidth').to.be.a('number').and.at.most(320);
        expect(opts.resizeHeight, 'resizeHeight').to.be.a('number').and.at.most(320);
      }
      const canvas = cards()[0].querySelector('canvas');
      expect([canvas.width, canvas.height]).to.deep.equal([320, 320]);
    } finally {
      window.createImageBitmap = orig;
    }
  });

  it('preview: createImageBitmap throws TypeError → no canvas, the kind icon stays, no second decode', async () => {
    const orig = window.createImageBitmap;
    const calls = [];
    window.createImageBitmap = function (...args) { calls.push(args); return Promise.reject(new TypeError('resize unsupported')); };
    try {
      const { ad } = await openSettled();
      holdUploads(ad);
      dispatchDrop([await png('khong-xem.png')]);
      await until(() => cards().length === 1 && calls.length === 1, 3000, 'decode tried');
      await wait(150);
      const c = cards()[0];
      expect(c.querySelector('canvas')).to.equal(null);
      expect(c.querySelector('.td-media-picker__thumb-icon svg')).to.not.equal(null);
      expect(calls.length, 'no fallback decode').to.equal(1);
    } finally {
      window.createImageBitmap = orig;
    }
  });

  // --- v0.93.1: cover preview (plan v0.93.1-preview-cover) ---

  /** w×h image in three bands along its long side: red | green | blue (the centred square is all green) */
  async function bands(w, h, type = 'image/png') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const long = Math.max(w, h);
    ['#ff0000', '#00ff00', '#0000ff'].forEach((col, i) => {
      ctx.fillStyle = col;
      if (w >= h) ctx.fillRect((i * long) / 3, 0, long / 3 + 1, h);
      else ctx.fillRect(0, (i * long) / 3, w, long / 3 + 1);
    });
    return new Uint8Array(await (await new Promise((r) => c.toBlob(r, type, 0.95))).arrayBuffer());
  }
  /** insert `extra` bytes right after the first `at` bytes */
  const splice = (b, at, extra) => new Uint8Array([...b.slice(0, at), ...extra, ...b.slice(at)]);
  const exifApp1 = (o) => {
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
    return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  };
  /** PNG chunk with a zero CRC (decoders ignore ancillary CRC errors; the kit never decodes it anyway) */
  const pngChunk = (type, data) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];

  async function previewOf(file, expectDecode = true) {
    const orig = window.createImageBitmap;
    const calls = [];
    window.createImageBitmap = function (...args) { calls.push(args); return orig.apply(this, args); };
    // the head read is the first step of every preview: wait for it, then for the decode it leads to (or not)
    let head = null;
    file.slice = (...args) => {
      const blob = File.prototype.slice.apply(file, args);
      const ab = blob.arrayBuffer();
      head = ab;
      blob.arrayBuffer = () => ab;
      return blob;
    };
    try {
      const { ad } = await openSettled();
      holdUploads(ad);
      dispatchDrop([file]);
      await until(() => cards().length === 1 && head, 3000, 'card + head read');
      await head;
      if (expectDecode) await until(() => cards()[0].querySelector('canvas.td-media-picker__upload-preview'), 3000, 'canvas');
      else await wait(100); // the size parse is synchronous after the head read: nothing may follow
      const canvas = cards()[0].querySelector('canvas.td-media-picker__upload-preview');
      return { calls: calls.map((a) => ({ w: a[1] && a[1].resizeWidth, h: a[1] && a[1].resizeHeight })), canvas, card: cards()[0] };
    } finally {
      window.createImageBitmap = orig;
    }
  }
  /** colour name of the dominant channel of a canvas pixel */
  const px = (canvas, x, y) => {
    const [r, g, b, a] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    if (a < 200) return 'transparent';
    if (g > 150 && g > r + 80 && g > b + 80) return 'green';
    if (r > 150 && r > g + 80 && r > b + 80) return 'red';
    if (b > 150 && b > r + 80 && b > g + 80) return 'blue';
    return 'unknown';
  };
  const corners = (canvas) => [[2, 2], [317, 2], [2, 317], [317, 317], [160, 160]].map(([x, y]) => px(canvas, x, y));

  it('cover: PNG 300×100 → one decode at 300×100 (no upscaling); the tile shows the centred square', async () => {
    const r = await previewOf(new File([await bands(300, 100)], 'ngang.png', { type: 'image/png' }));
    expect(r.calls).to.deep.equal([{ w: 300, h: 100 }]);
    expect([r.canvas.width, r.canvas.height]).to.deep.equal([320, 320]);
    expect(corners(r.canvas)).to.deep.equal(Array(5).fill('green'));
  });

  it('cover: PNG 3000×300 (10:1) → 320×32, aspect kept, centred square', async () => {
    const r = await previewOf(new File([await bands(3000, 300)], 'toan-canh.png', { type: 'image/png' }));
    expect(r.calls).to.deep.equal([{ w: 320, h: 32 }]);
    expect(corners(r.canvas)).to.deep.equal(Array(5).fill('green'));
  });

  it('cover: JPEG 300×100 with EXIF orientation 6 → decoded as 100×300 (rotated), centred square', async () => {
    const jpg = await bands(300, 100, 'image/jpeg');
    const r = await previewOf(new File([splice(jpg, 2, exifApp1(6))], 'dien-thoai.jpg', { type: 'image/jpeg' }));
    expect(r.calls).to.deep.equal([{ w: 100, h: 300 }]);
    expect(corners(r.canvas)).to.deep.equal(Array(5).fill('green'));
  });

  it('cover: every decode has both dimensions ≤ 320 (portrait, square, small)', async () => {
    for (const [w, h, want] of [[100, 900, { w: 36, h: 320 }], [640, 640, { w: 320, h: 320 }], [20, 10, { w: 20, h: 10 }]]) {
      const r = await previewOf(new File([await bands(w, h)], `a-${w}.png`, { type: 'image/png' }));
      expect(r.calls).to.deep.equal([want]);
      await closeAll();
    }
  });

  it('cover: size unknown (PNG eXIf orientation 6, unreadable header) → no decode, the kind icon stays', async () => {
    const withExif = splice(await bands(300, 100), 33, pngChunk('eXIf', [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]));
    for (const f of [new File([withExif], 'exif.png', { type: 'image/png' }),
      new File([new Uint8Array(64).fill(7)], 'hong.png', { type: 'image/png' })]) {
      const r = await previewOf(f, false);
      expect(r.calls, f.name).to.deep.equal([]);
      expect(r.canvas).to.equal(null);
      expect(r.card.querySelector('.td-media-picker__thumb-icon svg')).to.not.equal(null);
      await closeAll();
    }
  });
});
