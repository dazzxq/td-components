import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

// v0.106.0 (plan docs/internal/plans/v0.106.0-media-picker-grid-dedupe.md, QĐ4/QĐ5) — the toast of a multi-file batch
// tells exact-reused files apart: through the open picker's grid drop (view.onBatch) and through the upload dialog
// (finishBatch). The closed-view path (env.toast) and both finishing orders are in media-picker-uploads.test.js.
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


/** adapter.upload by name: `new-*` created; `same-*` reuses the asset of its `new-*` twin (after it); `old-*` reuses a seeded asset */
function dedupeAdapter() {
  const ad = createMockAdapter({ uploadStepMs: 1, uploadSteps: 1 });
  const real = ad.upload;
  const byName = new Map();
  ad.upload = (file, opts) => {
    const twin = file.name.replace(/^same-/, 'new-');
    if (file.name.startsWith('same-')) {
      return byName.get(twin).then((r) => ({
        asset: { ...r.asset }, deduplication: { outcome: 'exact-reused', matchedAssetId: r.asset.id },
      }));
    }
    const p = real(file, opts);
    byName.set(file.name, p);
    return p;
  };
  return ad;
}
const existingNames = async (ad, n) => (await ad.list({ limit: n })).items.map((a) => a.name);

describe('v0.106.0 media picker batch toast tells reused files apart', () => {
  it('grid drop: new + same-batch duplicate + existing asset (twice) → created / reused / in-batch + names', async () => {
    const ad = dedupeAdapter();
    const [old] = await existingNames(ad, 1);
    await openSettled({ adapter: ad, selection: { mode: 'multiple' } });
    dispatchDrop([await png('new-a.png'), await png('same-a.png'), await png(old), await png('new-b.png')]);
    const want = L('uploadDoneReused', { created: 2, reused: 2 });
    await until(() => toastTexts().some((t) => t.startsWith(want)), 5000, 'reused toast');
    const text = toastTexts().find((t) => t.startsWith(want));
    expect(text).to.include(L('uploadReusedInBatch', { n: 1 }));
    expect(text).to.include('same-a.png');
    expect(text).to.include(old);
    expect(toastTexts().some((t) => t === L('uploadDone', { ok: 4, total: 4 }))).to.equal(false);
  });

  it('grid drop: every file already in the library → uploadAllReused; a batch of new files keeps the old sentence', async () => {
    const ad = dedupeAdapter();
    const names = await existingNames(ad, 2);
    await openSettled({ adapter: ad, selection: { mode: 'multiple' } });
    dispatchDrop([await png(names[0]), await png(names[1])]);
    await until(() => toastTexts().some((t) => t.startsWith(L('uploadAllReused', { reused: 2 }))), 5000, 'all reused toast');
    TdToast.clear();
    dispatchDrop([await png('new-x.png'), await png('new-y.png')]);
    await until(() => toastTexts().includes(L('uploadDone', { ok: 2, total: 2 })), 5000, 'old sentence');
  });

  it('upload dialog: more than 5 reused → 5 names + "và N tệp khác"', async () => {
    const ad = dedupeAdapter();
    const names = await existingNames(ad, 7);
    expect(names.length).to.equal(7);
    await openSettled({ adapter: ad });
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dropzone().addFiles(await Promise.all(names.map((n) => png(n))));
    await until(() => toastTexts().some((t) => t.startsWith(L('uploadAllReused', { reused: 7 }))), 6000, 'dialog toast');
    const text = toastTexts().find((t) => t.startsWith(L('uploadAllReused', { reused: 7 })));
    expect(text).to.include(L('uploadReusedMore', { n: 2 }));
    expect(names.filter((n) => text.includes(n)).length).to.equal(5);
  });

  it('upload dialog: new + duplicate of an existing asset → uploadDoneReused', async () => {
    const ad = dedupeAdapter();
    const [old] = await existingNames(ad, 1);
    await openSettled({ adapter: ad });
    q('.td-media-picker__upload-btn').click();
    await until(() => dropzone(), 3000, 'dialog');
    dropzone().addFiles([await png('new-d.png'), await png(old)]);
    await until(() => toastTexts().some((t) => t.startsWith(L('uploadDoneReused', { created: 1, reused: 1 }))), 5000, 'dialog toast');
  });
});
