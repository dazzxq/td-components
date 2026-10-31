import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDropzone } from './td-dropzone.js';
import { buildJpeg, segment } from '../../test/fixtures/image-builders.js';

// v0.90.0 (plan docs/internal/plans/v0.90.0-image-resize.md, step 3) — td-dropzone `imageResize` + the media picker
// upload dialog, in Chromium, Firefox AND WebKit (group `engines`). Deterministic jobs use a site `processor` (the
// public hook that replaces the engine on the "over the caps" branch, held open by a gate); two tests run the REAL
// canvas engine end to end. Synthetic images only. Waits on real signals (polled conditions), never fixed sleeps
// before an assertion.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { openUploadDialog, UPLOAD_LABELS } = await import('../feedback/media-picker-upload.js');
const { TdMediaPicker } = await import('../feedback/td-media-picker.js');
const { TdToast } = await import('../feedback/td-toast.js');
const { formatLabel, normalizeFields } = await import('../utils/media-picker-core.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.innerHTML = html.trim(); return host.firstElementChild; };

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
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));

/** Pick files through the real inner <input type=file> (user action → `files-change`). */
function pick(dz, files) {
  const input = dz.querySelector('input[type="file"]');
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// --- synthetic files ---
const jpegBytes = (w, h, pad = 0) => buildJpeg({ width: w, height: h, segments: pad ? [segment(0xfe, new Uint8Array(pad))] : [] });
/** 4000×3000 (12 MP) JPEG header — over a 1 MP cap, so the processor runs; `pad` = COM bytes (file size) */
const bigJpeg = (name = 'anh.jpg', { pad = 0, type = 'image/jpeg' } = {}) => new File([jpegBytes(4000, 3000, pad)], name, { type });
/** what the test processor returns: 1000×750 (≤ 1 MP) */
const SMALL = jpegBytes(1000, 750);
const pdf = (name, size) => {
  const b = new Uint8Array(size);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  return new File([b], name, { type: 'application/pdf' });
};

/**
 * A site processor that counts its calls and holds each one until the test releases it (`auto` → resolves at once).
 * An abort rejects the call (so the module-global queue slot is freed).
 */
function makeProcessor({ auto = false } = {}) {
  const p = { calls: [] };
  p.fn = (file, { signal }) => new Promise((resolve, reject) => {
    const call = { file, signal, release: (bytes = SMALL) => resolve(new Blob([bytes], { type: 'image/jpeg' })), fail: reject };
    p.calls.push(call);
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    if (auto) call.release();
  });
  return p;
}
const policyWith = (p, extra = {}) => ({ maxPixels: 1_000_000, processor: p.fn, ...extra });

const rows = (dz) => [...dz.querySelectorAll('.td-dropzone__item')];
const statuses = (dz) => rows(dz).map((r) => r.getAttribute('data-status'));
const statusText = (row) => row.querySelector('.td-dropzone__status').textContent;

/** an upload hook that records every call and settles on demand */
function makeHook() {
  const h = { calls: [] };
  h.fn = (file, opts) => new Promise((resolve, reject) => {
    h.calls.push({ file, opts, resolve, reject });
  });
  return h;
}

let mounted = [];
const track = (dz) => { mounted.push(dz); return dz; };

afterEach(async () => {
  for (const dz of mounted) { try { dz.clear(); } catch { /* ignore */ } } // aborts every job (queue slot freed)
  mounted = [];
  host.innerHTML = '';
});

// ---------------------------------------------------------------------------------------------------------------------

describe('v0.90.0 td-dropzone — no policy = v0.89 behaviour', () => {
  it('imageResize defaults to null; the hook runs at once with the v0.89 options; max-size rejects at add; files-change gains `added`', () => {
    const dz = track(mount('<td-dropzone multiple max-size="1KB"></td-dropzone>'));
    expect(dz.imageResize).to.equal(null);
    const hook = makeHook();
    dz.upload = hook.fn;
    const events = [];
    dz.addEventListener('files-change', (e) => events.push(e.detail));
    const ok = new File([new Uint8Array(10)], 'a.txt', { type: 'text/plain' });
    const big = new File([new Uint8Array(2000)], 'b.txt', { type: 'text/plain' });
    pick(dz, [ok, big]);
    expect(hook.calls.length).to.equal(1); // synchronous, before the event
    expect(Object.keys(hook.calls[0].opts).sort()).to.deep.equal(['onProgress', 'signal']);
    expect(hook.calls[0].file).to.equal(ok);
    expect(statuses(dz)).to.deep.equal(['uploading']);
    expect(dz.querySelector('.td-dropzone__reject').getAttribute('data-reason')).to.equal('size');
    expect(events[0].added).to.deep.equal([ok]);
    expect(events[0].files).to.deep.equal([ok]);
    expect(dz.querySelector('.td-dropzone__retry')).to.equal(null);
  });

  it('an upload error row has no "Thử lại" without a policy', async () => {
    const dz = track(mount('<td-dropzone></td-dropzone>'));
    const hook = makeHook();
    dz.upload = hook.fn;
    dz.addFiles([new File([new Uint8Array(4)], 'a.txt')]);
    hook.calls[0].reject(new Error('Máy chủ bận'));
    await until(() => statuses(dz)[0] === 'error');
    expect(dz.querySelector('.td-dropzone__retry')).to.equal(null);
  });
});

describe('v0.90.0 td-dropzone — imageResize policy', () => {
  it('the setter normalises + freezes; an invalid policy throws a TypeError and keeps the previous one', () => {
    const dz = track(mount('<td-dropzone></td-dropzone>'));
    dz.imageResize = { maxPixels: 12_000_000, maxBytes: 5 * 1024 * 1024 };
    const p = dz.imageResize;
    expect(Object.isFrozen(p)).to.equal(true);
    expect(p.quality).to.equal(0.9);
    expect(() => { dz.imageResize = { maxBytes: '5MB' }; }).to.throw(TypeError);
    expect(dz.imageResize).to.equal(p);
    dz.imageResize = null;
    expect(dz.imageResize).to.equal(null);
  });

  it('row states queued → optimizing → uploading → done; the hook gets the optimised file + optimization + originalFile', async () => {
    const dz = track(mount('<td-dropzone multiple></td-dropzone>'));
    const proc = makeProcessor();
    dz.imageResize = policyWith(proc);
    const hook = makeHook();
    dz.upload = hook.fn;
    const a = bigJpeg('a.jpg');
    const b = bigJpeg('b.jpg');
    pick(dz, [a, b]);
    await until(() => proc.calls.length === 1, 3000, 'first job running');
    expect(statuses(dz)).to.deep.equal(['optimizing', 'queued']);
    expect(statusText(rows(dz)[0])).to.equal('Đang tối ưu ảnh…');
    expect(statusText(rows(dz)[1])).to.equal('Đang chờ tối ưu…');
    // indeterminate bar while queued / optimising
    for (const r of rows(dz)) {
      const bar = r.querySelector('.td-dropzone__progress');
      expect(bar.hidden).to.equal(false);
      expect(bar.hasAttribute('value')).to.equal(false);
    }
    expect(dz.uploading).to.equal(true);
    expect(dz.files).to.deep.equal([]);
    expect(hook.calls.length).to.equal(0);
    proc.calls[0].release();
    await until(() => hook.calls.length === 1, 3000, 'hook called');
    const call = hook.calls[0];
    expect(call.file).to.not.equal(a);
    expect(call.file.name).to.equal('a.jpg');
    expect(call.file.type).to.equal('image/jpeg');
    expect(call.file.size).to.equal(SMALL.length);
    expect(call.opts.originalFile).to.equal(a);
    expect(call.opts.optimization.changed).to.equal(true);
    expect(call.opts.optimization.original).to.include({ name: 'a.jpg', width: 4000, height: 3000 });
    expect(call.opts.optimization.output).to.include({ width: 1000, height: 750, size: SMALL.length });
    expect(statuses(dz)[0]).to.equal('uploading');
    await until(() => proc.calls.length === 2, 3000, 'second job running');
    expect(statuses(dz)[1]).to.equal('optimizing');
    call.resolve({ id: 1 });
    await until(() => statuses(dz)[0] === 'done');
    expect(statusText(rows(dz)[0])).to.equal('Đã tải lên');
    proc.calls[1].release();
    await until(() => hook.calls.length === 2);
    hook.calls[1].resolve({ id: 2 });
    await until(() => statuses(dz).join() === 'done,done');
    expect(dz.uploading).to.equal(false);
  });

  it('two dropzones share the one queue slot (module-global FIFO)', async () => {
    host.innerHTML = '<td-dropzone id="q1"></td-dropzone><td-dropzone id="q2"></td-dropzone>';
    const d1 = track(host.querySelector('#q1'));
    const d2 = track(host.querySelector('#q2'));
    const proc = makeProcessor();
    d1.imageResize = policyWith(proc);
    d2.imageResize = policyWith(proc);
    d1.addFiles([bigJpeg('one.jpg')]);
    d2.addFiles([bigJpeg('two.jpg')]);
    await until(() => proc.calls.length === 1);
    expect(statuses(d1)).to.deep.equal(['optimizing']);
    expect(statuses(d2)).to.deep.equal(['queued']);
    await wait(50);
    expect(proc.calls.length, 'the second job waits for the slot').to.equal(1);
    proc.calls[0].release();
    await until(() => proc.calls.length === 2);
    expect(statuses(d1)).to.deep.equal(['selected']); // no hook: ready to submit
    expect(statuses(d2)).to.deep.equal(['optimizing']);
    proc.calls[1].release();
    await until(() => statuses(d2)[0] === 'selected');
  });

  it('removing a row while it optimises aborts the job; its upload never starts; the next row runs', async () => {
    const dz = track(mount('<td-dropzone multiple></td-dropzone>'));
    const proc = makeProcessor();
    dz.imageResize = policyWith(proc);
    const hook = makeHook();
    dz.upload = hook.fn;
    const changes = [];
    dz.addEventListener('files-change', (e) => changes.push(e.detail));
    pick(dz, [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    click(rows(dz)[0].querySelector('.td-dropzone__remove'));
    expect(proc.calls[0].signal.aborted).to.equal(true);
    expect(changes.at(-1).added).to.deep.equal([]);
    await until(() => proc.calls.length === 2, 3000, 'next job');
    proc.calls[0].release(); // a late result is dropped
    proc.calls[1].release();
    await until(() => hook.calls.length === 1);
    await wait(30);
    expect(hook.calls.length).to.equal(1);
    expect(hook.calls[0].file.name).to.equal('b.jpg');
    expect(rows(dz).length).to.equal(1);
  });

  it('"Thử lại" on an upload error re-sends the SAME optimised file — no new optimisation', async () => {
    const dz = track(mount('<td-dropzone></td-dropzone>'));
    const proc = makeProcessor({ auto: true });
    dz.imageResize = policyWith(proc);
    const hook = makeHook();
    dz.upload = hook.fn;
    const a = bigJpeg('ảnh <b>1</b>.jpg');
    dz.addFiles([a]);
    await until(() => hook.calls.length === 1);
    hook.calls[0].reject(new Error('Máy chủ bận'));
    await until(() => statuses(dz)[0] === 'error');
    const retry = dz.querySelector('.td-dropzone__retry');
    expect(retry, 'retry button').to.not.equal(null);
    expect(retry.textContent).to.equal('Thử lại');
    expect(retry.getAttribute('aria-label')).to.equal('Thử lại ảnh <b>1</b>.jpg');
    expect(retry.querySelector('b')).to.equal(null); // text only
    expect(statusText(rows(dz)[0])).to.equal('Máy chủ bận');
    retry.focus();
    click(retry);
    expect(hook.calls.length).to.equal(2);
    expect(hook.calls[1].file).to.equal(hook.calls[0].file);
    expect(hook.calls[1].opts.originalFile).to.equal(a);
    expect(hook.calls[1].opts.optimization).to.equal(hook.calls[0].opts.optimization);
    expect(proc.calls.length, 'processor ran once').to.equal(1);
    expect(dz.querySelector('.td-dropzone__retry')).to.equal(null);
    expect(document.activeElement).to.equal(rows(dz)[0].querySelector('.td-dropzone__remove'));
    hook.calls[1].resolve({});
    await until(() => statuses(dz)[0] === 'done');
  });

  it('no "Thử lại" after an optimisation error', async () => {
    const dz = track(mount('<td-dropzone></td-dropzone>'));
    const proc = makeProcessor();
    dz.imageResize = policyWith(proc);
    dz.upload = makeHook().fn;
    dz.addFiles([bigJpeg('x.jpg')]);
    await until(() => proc.calls.length === 1);
    proc.calls[0].fail(new Error('boom'));
    await until(() => statuses(dz)[0] === 'error');
    expect(statusText(rows(dz)[0])).to.equal('Tối ưu thất bại'); // processor-failed
    expect(dz.querySelector('.td-dropzone__retry')).to.equal(null);
    expect(rows(dz)[0].querySelector('.td-dropzone__progress').hidden).to.equal(true);
  });

  it('form without a hook: optimising → customError + nothing submitted; done → the optimised file is in the FormData', async () => {
    host.innerHTML = '<form><td-dropzone name="files[]" multiple></td-dropzone></form>';
    const form = host.querySelector('form');
    const dz = track(form.querySelector('td-dropzone'));
    const proc = makeProcessor();
    dz.imageResize = policyWith(proc);
    dz.addFiles([bigJpeg('a.jpg')]);
    await until(() => proc.calls.length === 1);
    expect(form.checkValidity()).to.equal(false);
    expect(dz.validity.customError).to.equal(true);
    expect(dz.validationMessage).to.equal('Đang tối ưu ảnh, vui lòng chờ');
    expect(new FormData(form).getAll('files[]')).to.deep.equal([]);
    proc.calls[0].release();
    await until(() => statuses(dz)[0] === 'selected');
    expect(form.checkValidity()).to.equal(true);
    const sent = new FormData(form).getAll('files[]');
    expect(sent.length).to.equal(1);
    expect(sent[0].name).to.equal('a.jpg');
    expect(sent[0].size).to.equal(SMALL.length);
    expect(dz.files[0].size).to.equal(SMALL.length);
  });

  it('a row that fails optimisation is never submitted; the form stays invalid until it is removed', async () => {
    host.innerHTML = '<form><td-dropzone name="f[]" multiple></td-dropzone></form>';
    const form = host.querySelector('form');
    const dz = track(form.querySelector('td-dropzone'));
    const proc = makeProcessor();
    dz.imageResize = policyWith(proc);
    const okPdf = pdf('hop-dong.pdf', 64);
    dz.addFiles([okPdf, bigJpeg('hong.jpg')]);
    await until(() => proc.calls.length === 1);
    proc.calls[0].release(jpegBytes(4000, 3000)); // still over the cap → processor-invalid-result
    await until(() => statuses(dz).join() === 'selected,error');
    expect(statusText(rows(dz)[1])).to.equal('Tối ưu thất bại');
    expect(form.checkValidity()).to.equal(false);
    expect(dz.validationMessage).to.equal('Có tệp không xử lý được, hãy gỡ ra');
    expect(new FormData(form).getAll('f[]').map((f) => f.name)).to.deep.equal(['hop-dong.pdf']);
    expect(dz.files).to.deep.equal([okPdf]);
    click(rows(dz)[1].querySelector('.td-dropzone__remove'));
    expect(form.checkValidity()).to.equal(true);
    expect(new FormData(form).getAll('f[]').map((f) => f.name)).to.deep.equal(['hop-dong.pdf']);
  });

  it('non-image + max-size with a policy: accepted at add, checked on the original in the job (rejectSize on the row)', async () => {
    const dz = track(mount('<td-dropzone name="f" multiple max-size="1KB"></td-dropzone>'));
    const proc = makeProcessor({ auto: true });
    dz.imageResize = policyWith(proc);
    const hook = makeHook();
    dz.upload = hook.fn;
    const big = pdf('lon.pdf', 4096);
    const small = pdf('nho.pdf', 100);
    const res = dz.addFiles([big, small]);
    expect(res.accepted).to.deep.equal([big, small]);
    expect(res.rejected).to.deep.equal([]);
    await until(() => statuses(dz)[0] === 'error' && hook.calls.length === 1);
    expect(statusText(rows(dz)[0])).to.equal('lon.pdf: lớn hơn 1 KB');
    expect(hook.calls[0].file).to.equal(small); // sent as it is
    expect(hook.calls[0].opts.optimization).to.equal(null);
    expect(hook.calls[0].opts.originalFile).to.equal(small);
    expect(proc.calls.length).to.equal(0);
  });

  it('formats are sniffed: JPEG bytes with an empty MIME or a .pdf name / MIME still go through the policy', async () => {
    const dz = track(mount('<td-dropzone multiple></td-dropzone>'));
    const proc = makeProcessor({ auto: true });
    dz.imageResize = policyWith(proc);
    dz.addFiles([bigJpeg('no-type', { type: '' }), bigJpeg('sai.pdf', { type: 'application/pdf' })]);
    await until(() => statuses(dz).join() === 'selected,selected');
    expect(proc.calls.length).to.equal(2);
    expect(dz.files.map((f) => [f.name, f.type, f.size])).to.deep.equal([
      ['no-type', 'image/jpeg', SMALL.length], ['sai.pdf', 'image/jpeg', SMALL.length]]);
  });

  it('max-size does not block an oversized INPUT image under a policy (the output fits it)', async () => {
    const dz = track(mount('<td-dropzone max-size="1KB"></td-dropzone>'));
    const proc = makeProcessor({ auto: true });
    dz.imageResize = policyWith(proc);
    const input = bigJpeg('to.jpg', { pad: 8000 });
    expect(input.size > 1024).to.equal(true);
    const res = dz.addFiles([input]);
    expect(res.accepted).to.deep.equal([input]);
    await until(() => statuses(dz)[0] === 'selected');
    expect(dz.files[0].size <= 1024).to.equal(true);
    expect(rows(dz)[0].querySelector('.td-dropzone__size').textContent).to.match(/^[\d.]+ KB → \d+ Bytes$/);
  });

  it('max-size caps the OUTPUT (real canvas engine): an image that cannot get under it → "Không giảm được xuống trần"', async () => {
    // random noise does not compress: one encode allowed, far over 20 KB
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(600, 400);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) >>> 24 ^ (i & 0xff);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    c.width = 0;
    const input = new File([blob], 'nhieu.jpg', { type: 'image/jpeg' });
    expect(input.size > 20 * 1024, `input ${input.size}`).to.equal(true);
    const dz = track(mount('<td-dropzone max-size="20KB"></td-dropzone>'));
    dz.imageResize = { maxEncodes: 1 };
    const hook = makeHook();
    dz.upload = hook.fn;
    expect(dz.addFiles([input]).accepted).to.deep.equal([input]);
    await until(() => statuses(dz)[0] === 'error', 15000, 'error row');
    expect(statusText(rows(dz)[0])).to.equal('Không giảm được xuống trần');
    expect(hook.calls.length).to.equal(0);
  });

  it('removeFile(original) removes the row after optimisation replaced its file (the optimised copy works too)', async () => {
    const dz = track(mount('<td-dropzone multiple></td-dropzone>'));
    dz.imageResize = policyWith(makeProcessor({ auto: true }));
    const a = bigJpeg('a.jpg');
    const b = bigJpeg('b.jpg');
    dz.addFiles([a, b]);
    await until(() => statuses(dz).every((s) => s === 'selected'), 3000, 'both optimised');
    const [optA, optB] = dz.files;
    expect(optA).to.not.equal(a);
    dz.removeFile(a);
    expect(rows(dz).length).to.equal(1);
    expect(dz.files).to.deep.equal([optB]);
    dz.removeFile(optB);
    expect(rows(dz).length).to.equal(0);
  });

  it('a GIF over max-size (passes through the policy, cannot be re-encoded) → "Không giảm được xuống trần"', async () => {
    const dz = track(mount('<td-dropzone multiple max-size="1KB"></td-dropzone>'));
    dz.imageResize = { maxPixels: 1_000_000 };
    const gifBytes = new Uint8Array(3000);
    gifBytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 10, 0]); // GIF89a 10×10
    dz.addFiles([new File([gifBytes], 'a.gif', { type: 'image/gif' })]);
    await until(() => statuses(dz)[0] === 'error', 3000, 'error row');
    expect(statusText(rows(dz)[0])).to.equal('Không giảm được xuống trần');
    // under max-size the same GIF is compliant and passes through untouched
    const small = new File([gifBytes.slice(0, 500)], 'b.gif', { type: 'image/gif' });
    dz.addFiles([small]);
    await until(() => statuses(dz)[1] === 'selected', 3000, 'small gif ready');
    expect(dz.files).to.deep.equal([small]);
  });

  it('real canvas engine end to end: 2000×1500 JPEG → ≤ 0.75 MP, size line "from → to", announced once', async () => {
    const c = document.createElement('canvas');
    c.width = 2000;
    c.height = 1500;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 2000, 1500);
    g.addColorStop(0, '#c00');
    g.addColorStop(0.5, '#0a0');
    g.addColorStop(1, '#00c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2000, 1500);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgb(${(i * 37) % 256},${(i * 91) % 256},${(i * 53) % 256})`;
      ctx.fillRect((i * 97) % 1960, (i * 61) % 1460, 40, 40);
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    c.width = 0;
    const input = new File([blob], 'canh.jpg', { type: 'image/jpeg' });
    const dz = track(mount('<td-dropzone></td-dropzone>'));
    dz.imageResize = { maxPixels: 750_000, maxBytes: 300_000 };
    const hook = makeHook();
    dz.upload = hook.fn;
    dz.addFiles([input]);
    await until(() => hook.calls.length === 1, 20000, 'optimised + hook');
    const { file, opts } = hook.calls[0];
    const o = opts.optimization;
    expect(file.type).to.equal('image/jpeg');
    expect(file.name).to.equal('canh.jpg');
    expect(file.size <= 300_000).to.equal(true);
    expect(o.changed).to.equal(true);
    expect(o.reasons).to.include('pixels');
    expect(o.output.width * o.output.height <= 750_000).to.equal(true);
    expect(o.output.size).to.equal(file.size);
    const bmp = await createImageBitmap(file);
    expect([bmp.width, bmp.height]).to.deep.equal([o.output.width, o.output.height]);
    bmp.close();
    const size = rows(dz)[0].querySelector('.td-dropzone__size').textContent;
    expect(size).to.contain(' → ');
    if (o.output.size < o.original.size) {
      expect(dz.querySelector('.td-dropzone__live').textContent).to.match(/^Đã giảm canh\.jpg từ .+ xuống .+$/);
    }
    hook.calls[0].resolve({});
    await until(() => statuses(dz)[0] === 'done');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// media picker upload dialog

const LABELS = { ...UPLOAD_LABELS, error: { server: 'Có lỗi xảy ra. Thử lại sau.' } };
const t = (k, p) => formatLabel(LABELS, {}, k, p);
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker-upload)')]
  .filter((r) => r.getAttribute('data-state') !== 'closing');
const confirmDialog = () => modalRoots().find((r) => r.textContent.includes(UPLOAD_LABELS.uploadCancelTitle)) || null;
const answerConfirm = (yes) => {
  const btns = [...confirmDialog().querySelectorAll('.td-modal__footer .td-btn')];
  click(btns.find((b) => b.textContent.includes(yes ? UPLOAD_LABELS.uploadCancelConfirm : UPLOAD_LABELS.uploadCancelKeep)));
};
const toasts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((m) => m.textContent);

let dialogs = [];
function openDialog(over = {}) {
  const rec = { closed: 0, uploaded: [] };
  const ad = createMockAdapter({ manual: true });
  const h = openUploadDialog({
    t,
    adapter: ad,
    context: { site: 'test' },
    sources: over.sources || { file: true, url: false },
    upload: { accept: 'image/*,.pdf', maxSize: '', multiple: true, ...over.upload },
    uploadFields: over.uploadFields || [],
    metaKeys: [],
    idPrefix: `v090-${dialogs.length}-up`,
    onUploaded: (asset) => rec.uploaded.push(asset),
    onError: () => {},
    announce: () => {},
    onClosed: () => { rec.closed += 1; },
  });
  dialogs.push(h);
  const q = (sel) => h.root.querySelector(sel);
  return { h, ad, rec, q, dz: () => q('td-dropzone'), gone: () => !h.root.isConnected };
}

describe('v0.90.0 media picker upload dialog — imageResize', () => {
  afterEach(async () => {
    for (const h of dialogs) { try { h.destroy(); } catch { /* ignore */ } }
    dialogs = [];
    for (const r of modalRoots()) r.remove();
    try { TdToast.clear(); } catch { /* ignore */ }
    await until(() => !document.querySelector('.td-media-picker-upload'), 3000, 'roots removed');
  });

  it('does not auto-close when file 1 is uploaded while file 2 still optimises; closes (toast 2/2) when both are done', async () => {
    const proc = makeProcessor();
    const o = openDialog({ upload: { imageResize: policyWith(proc) } });
    expect(o.dz().imageResize.maxPixels).to.equal(1_000_000);
    pick(o.dz(), [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    proc.calls[0].release();
    await until(() => o.ad.calls.upload.length === 1, 3000, 'file 1 upload');
    await until(() => proc.calls.length === 2, 3000, 'file 2 optimising');
    o.ad.calls.upload[0].resolve();
    await until(() => statuses(o.dz())[0] === 'done');
    await wait(80);
    expect(o.gone(), 'still open while file 2 optimises').to.equal(false);
    expect(o.h.busy()).to.equal(true);
    expect(toasts()).to.not.include('Đã tải lên 1/1 tệp');
    proc.calls[1].release();
    await until(() => o.ad.calls.upload.length === 2, 3000, 'file 2 upload');
    o.ad.calls.upload[1].resolve();
    await until(() => toasts().includes('Đã tải lên 2/2 tệp'), 3000, 'toast 2/2');
    await until(() => o.rec.closed === 1, 3000, 'closed');
  });

  it('an optimisation failure counts as a failed file: toast 1/2, the dialog stays open', async () => {
    const proc = makeProcessor();
    const o = openDialog({ upload: { imageResize: policyWith(proc) } });
    pick(o.dz(), [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    proc.calls[0].release();
    await until(() => o.ad.calls.upload.length === 1);
    o.ad.calls.upload[0].resolve();
    await until(() => proc.calls.length === 2);
    proc.calls[1].fail(new Error('boom'));
    await until(() => toasts().includes('Đã tải lên 1/2 tệp'), 3000, 'toast 1/2');
    await wait(80);
    expect(o.gone()).to.equal(false);
    expect(o.h.busy()).to.equal(false);
  });

  it('closing while rows are queued / optimising asks first; keep → nothing aborted; confirm → jobs aborted, nothing uploaded', async () => {
    const proc = makeProcessor();
    const o = openDialog({ upload: { imageResize: policyWith(proc) } });
    pick(o.dz(), [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    expect(o.h.busy()).to.equal(true);
    let closing = o.h.close();
    await until(() => confirmDialog(), 3000, 'confirmation');
    answerConfirm(false);
    expect(await closing).to.equal(false);
    expect(proc.calls[0].signal.aborted).to.equal(false);
    await until(() => !confirmDialog());
    closing = o.h.close();
    await until(() => confirmDialog(), 3000, 'confirmation again');
    answerConfirm(true);
    expect(await closing).to.equal(true);
    expect(proc.calls[0].signal.aborted).to.equal(true);
    await wait(50);
    expect(proc.calls.length, 'the queued job never started').to.equal(1);
    expect(o.ad.calls.upload.length).to.equal(0);
  });

  it('upload fields are captured when a file is ADDED and reused on "Thử lại"; the adapter gets `optimization`', async () => {
    const proc = makeProcessor();
    const uploadFields = normalizeFields([{ key: 'title', label: 'Tiêu đề', control: 'text' }]);
    const o = openDialog({ upload: { imageResize: policyWith(proc) }, uploadFields });
    const ctl = /** @type {HTMLInputElement} */ (o.q('.td-media-picker-upload__fields input'));
    ctl.focus();
    await sendKeys({ type: 'Bìa' });
    pick(o.dz(), [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    ctl.focus();
    await sendKeys({ type: ' mới' }); // changed while file 2 waits in the queue
    proc.calls[0].release();
    await until(() => proc.calls.length === 2);
    proc.calls[1].release();
    await until(() => o.ad.calls.upload.length === 2, 3000, 'both uploads');
    const [f1, opts1] = o.ad.calls.upload[0].args;
    const [, opts2] = o.ad.calls.upload[1].args;
    expect(opts1.fields.title).to.equal('Bìa');
    expect(opts2.fields.title, 'file 2: the value when it was added').to.equal('Bìa');
    expect(f1.size).to.equal(SMALL.length);
    expect(opts1.optimization.changed).to.equal(true);
    expect(opts1.optimization.output).to.include({ width: 1000, height: 750 });
    expect(opts1.originalFile, 'the adapter gets only `optimization`').to.equal(undefined);
    // a failed upload → "Thử lại" → same file, same snapshot
    o.ad.calls.upload[1].reject(Object.assign(new Error('raw'), { code: 'server' }));
    await until(() => o.dz().querySelector('.td-dropzone__retry'), 3000, 'retry button');
    click(o.dz().querySelector('.td-dropzone__retry'));
    await until(() => o.ad.calls.upload.length === 3);
    const [f3, opts3] = o.ad.calls.upload[2].args;
    expect(f3).to.equal(o.ad.calls.upload[1].args[0]);
    expect(opts3.fields.title).to.equal('Bìa');
    expect(proc.calls.length).to.equal(2);
  });

  it('"Thử lại" replaces the failed outcome of the same file: A fails, its retry succeeds while B optimises → toast 2/2, closes', async () => {
    const proc = makeProcessor();
    const o = openDialog({ upload: { imageResize: policyWith(proc) } });
    pick(o.dz(), [bigJpeg('a.jpg'), bigJpeg('b.jpg')]);
    await until(() => proc.calls.length === 1);
    proc.calls[0].release();
    await until(() => o.ad.calls.upload.length === 1, 3000, 'A uploads');
    await until(() => proc.calls.length === 2, 3000, 'B optimising');
    o.ad.calls.upload[0].reject(Object.assign(new Error('raw'), { code: 'server' }));
    await until(() => o.dz().querySelector('.td-dropzone__retry'), 3000, 'retry button');
    click(o.dz().querySelector('.td-dropzone__retry'));
    await until(() => o.ad.calls.upload.length === 2, 3000, 'A retried');
    o.ad.calls.upload[1].resolve();
    await until(() => statuses(o.dz())[0] === 'done');
    await wait(80);
    expect(o.gone(), 'B still optimises').to.equal(false);
    proc.calls[1].release();
    await until(() => o.ad.calls.upload.length === 3, 3000, 'B uploads');
    o.ad.calls.upload[2].resolve();
    await until(() => o.rec.closed === 1, 3000, 'closed');
    expect(toasts()).to.include('Đã tải lên 2/2 tệp');
    expect(toasts().some((m) => /\/3 tệp/.test(m))).to.equal(false);
  });

  it('an error row left from an earlier batch blocks the auto-close of a later successful file batch', async () => {
    const o = openDialog();
    const png = (n) => new File([new Uint8Array([137, 80, 78, 71])], n, { type: 'image/png' });
    o.dz().addFiles([png('a.png')]);
    o.ad.calls.upload[0].reject(Object.assign(new Error('raw'), { code: 'server' }));
    await until(() => statuses(o.dz())[0] === 'error');
    await wait(50); // batch 1 summarised (no toast: nothing succeeded)
    o.dz().addFiles([png('b.png')]);
    o.ad.calls.upload[1].resolve();
    await until(() => toasts().includes('Đã tải lên 1/1 tệp'), 3000, 'toast 1/1');
    await wait(80);
    expect(o.gone(), 'stays open over the error row').to.equal(false);
    o.dz().removeFile(0); // the error row gone → a later success may close again
    o.dz().addFiles([png('c.png')]);
    o.ad.calls.upload[2].resolve();
    await until(() => o.rec.closed === 1, 3000, 'closed');
  });

  it('an error row in the file tab blocks the auto-close after a successful URL upload', async () => {
    const o = openDialog({ sources: { file: true, url: true } });
    o.dz().addFiles([new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })]);
    o.ad.calls.upload[0].reject(Object.assign(new Error('raw'), { code: 'server' }));
    await until(() => statuses(o.dz())[0] === 'error');
    const field = o.q('.td-media-picker-upload__url');
    field.value = 'https://example.com/a.jpg';
    field.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { value: field.value } }));
    await until(() => !o.q('.td-media-picker-upload__submit').hasAttribute('disabled'), 3000, 'submit enabled');
    click(o.q('.td-media-picker-upload__submit'));
    await until(() => o.ad.calls.uploadFromUrl.length === 1, 3000, 'url upload');
    o.ad.calls.uploadFromUrl[0].resolve();
    await until(() => o.rec.uploaded.length === 1, 3000, 'url uploaded');
    await wait(80);
    expect(o.gone(), 'stays open over the error row').to.equal(false);
  });

  it('no policy: the adapter options keep the v0.89 shape (no `optimization` key)', async () => {
    const o = openDialog();
    expect(o.dz().imageResize).to.equal(null);
    o.dz().addFiles([new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' })]);
    expect(o.ad.calls.upload.length).to.equal(1);
    expect('optimization' in o.ad.calls.upload[0].args[1]).to.equal(false);
  });
});

describe('v0.90.0 TdMediaPicker — upload.imageResize', () => {
  afterEach(async () => {
    TdMediaPicker.configureDefaults({});
    const el = document.querySelector('td-media-picker');
    if (el && el.isOpen) el.close();
    await until(() => !document.querySelector('.td-media-picker-upload'), 3000, 'upload dialog gone');
  });

  it('configureDefaults / open validate the policy synchronously (TypeError, previous defaults kept)', () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, upload: { imageResize: { maxPixels: 12_000_000 } } });
    const before = TdMediaPicker.defaults;
    expect(Object.isFrozen(before.upload.imageResize)).to.equal(true);
    expect(() => TdMediaPicker.configureDefaults({ adapter: ad, upload: { imageResize: { quality: 2 } } })).to.throw(TypeError);
    expect(TdMediaPicker.defaults.upload.imageResize).to.equal(before.upload.imageResize);
    expect(() => TdMediaPicker.open({ upload: { imageResize: { metadata: 'all' } } })).to.throw(TypeError);
  });

  it('the open option wins over the defaults; the dialog dropzone gets the normalised policy', async () => {
    const ad = createMockAdapter();
    TdMediaPicker.configureDefaults({ adapter: ad, upload: { imageResize: { maxPixels: 12_000_000 } } });
    const promise = TdMediaPicker.open({ autoSelectFirst: false, upload: { imageResize: { maxPixels: 2_000_000, metadata: 'none' } } });
    const btn = await until(() => document.querySelector('.td-media-picker__upload-btn'), 3000, 'upload button');
    await wait(50);
    btn.click();
    const dz = await until(() => document.querySelector('.td-media-picker-upload td-dropzone'), 3000, 'upload dialog');
    expect(dz.imageResize.maxPixels).to.equal(2_000_000);
    expect(dz.imageResize.metadata).to.equal('none');
    expect(Object.isFrozen(dz.imageResize)).to.equal(true);
    document.querySelector('td-media-picker').close();
    await promise;
  });
});
