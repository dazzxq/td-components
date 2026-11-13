import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

// v0.111.0 (plan v0.111.0-media-picker-thumb-loader, QĐ2–QĐ4 + C12) — td-media-picker thumbnails through the page-wide
// thumbnail loader: no `src` before admission, loaded cells fade in, a failing URL never shows a broken image (src
// removed after each error, failed after 3 loads), reopening retries the failed ids, `thumbLoader: false` = the
// pre-0.111 markup, a repaint of a loading card never loads twice, the gate notice (toast / onThumbGate hook).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { TdToast } = await import('./td-toast.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');
const { getThumbBudget } = await import('../utils/thumb-loader.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const thumbOf = (id) => item(id)?.querySelector('.td-media-picker__thumb') || null;
const imgOf = (id) => thumbOf(id)?.querySelector('img') || null;
const host = () => document.querySelector('td-media-picker');
const toasts = () => [...document.querySelectorAll('.td-toast__message')].map((m) => m.textContent);

async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

afterEach(async () => {
  await closeAll();
  try { TdToast.clear(); } catch { /* ignore */ }
});

describe('v0.111.0 td-media-picker — thumbnails through the thumb loader', () => {
  before(async () => { await setViewport({ width: 1280, height: 800 }); });

  it('cards: data-td-src, no loading=lazy, no src outside the margin; near cells load (is-thumb-loaded), scrolling loads the rest', async () => {
    await openReady({ pageSize: 60 });
    const results = q('.td-media-picker__results');
    expect(results.classList.contains('td-thumbs-js'), 'root class').to.equal(true);
    const imgs = [...results.querySelectorAll('.td-media-picker__thumb img')];
    expect(imgs.length).to.be.greaterThan(20);
    for (const img of imgs) {
      expect(img.hasAttribute('data-td-src'), 'managed').to.equal(true);
      expect(img.hasAttribute('loading'), 'no loading=lazy').to.equal(false);
      expect(img.getAttribute('decoding')).to.equal('async');
      expect(img.getAttribute('referrerpolicy')).to.equal('no-referrer');
      const cell = img.closest('[data-td-thumb-cell]');
      expect(!!cell && cell.classList.contains('td-media-picker__thumb'), 'the thumb is the cell').to.equal(true);
      expect(cell.getAttribute('data-id')).to.equal(img.closest('[data-td-media-item]').getAttribute('data-id'));
    }
    const first = imgs[0];
    await until(() => first.closest('[data-td-thumb-cell]').classList.contains('is-thumb-loaded'), 4000, 'first loaded');
    expect(first.getAttribute('src')).to.equal(first.getAttribute('data-td-src'));
    await until(() => Number(getComputedStyle(first).opacity) > 0.5, 2000, 'faded in');
    // far below the scroller (beyond viewport + margin): never admitted, so no request and no src
    const rb = results.getBoundingClientRect().bottom;
    const far = imgs.filter((img) => img.getBoundingClientRect().top > rb + 700);
    expect(far.length, 'cells far below the fold').to.be.greaterThan(0);
    await wait(300);
    for (const img of far) {
      expect(img.hasAttribute('src'), 'no src before admission').to.equal(false);
      const cell = img.closest('[data-td-thumb-cell]');
      expect(cell.classList.contains('is-thumb-loaded')).to.equal(false);
      expect(getComputedStyle(img).opacity, 'hidden until loaded').to.equal('0');
      expect(getComputedStyle(cell, '::before').content, 'placeholder shimmer').to.not.equal('none');
    }
    results.scrollTop = results.scrollHeight;
    const last = far[far.length - 1];
    await until(() => last.closest('[data-td-thumb-cell]').classList.contains('is-thumb-loaded'), 5000, 'last loaded after scrolling');
  });

  it('a failing URL: src removed after each error (never a broken icon), failed after 3 loads; reopening retries it', async function () {
    this.timeout(30000);
    const ad = createMockAdapter();
    const bad = '/test/fixtures/__v111-missing-thumb.svg';
    ad.db.get('m60').urls.thumbnail = bad;
    await openReady({ adapter: ad });
    const cell = () => thumbOf('m60');
    expect(!!cell(), 'm60 on the first page').to.equal(true);
    // every src write / removal on the cell's image, in order (a 404 errors within a few ms: polling would miss it)
    const log = [];
    const mo = new MutationObserver((recs) => {
      for (const r of recs) log.push(r.target.hasAttribute('src') ? 'set' : 'removed');
    });
    mo.observe(imgOf('m60'), { attributes: true, attributeFilter: ['src'] });
    if (imgOf('m60').hasAttribute('src')) log.push('set');
    try {
      await until(() => cell().classList.contains('is-thumb-failed'), 12000, 'm60 failed');
    } finally {
      mo.disconnect();
    }
    // the first load may land before the observer is attached: the page broker's ledger has the exact count
    expect(getThumbBudget(location.host).errors('m60'), '3 loads counted').to.equal(3);
    expect(log.filter((x) => x === 'set').length, `retries seen (${log.join(' ')})`).to.be.at.least(2);
    expect(log[log.length - 1], 'ends without src').to.equal('removed');
    const img = imgOf('m60');
    expect(img.hasAttribute('src'), 'failed: no src').to.equal(false);
    expect(getComputedStyle(cell(), '::after').content, 'the faint frame').to.not.equal('none');
    expect(getComputedStyle(cell(), '::before').content, 'no shimmer once failed').to.equal('none');
    // the healthy neighbours are not held back
    expect(thumbOf('m59').classList.contains('is-thumb-loaded'), 'm59 loaded').to.equal(true);
    // reopening is a user scan: the failed id gets fresh attempts
    await closeAll();
    await openReady({ adapter: ad });
    await until(() => imgOf('m60')?.hasAttribute('src') || cell()?.classList.contains('is-thumb-waiting'), 3000, 'm60 retried');
    expect(cell().classList.contains('is-thumb-failed'), 'not failed right after reopening').to.equal(false);
  });

  it('thumbLoader: false → the pre-0.111 markup (src + loading=lazy), no loader classes', async () => {
    await openReady({ thumbLoader: false });
    const results = q('.td-media-picker__results');
    expect(results.classList.contains('td-thumbs-js')).to.equal(false);
    const img = imgOf('m60');
    expect(img.getAttribute('loading')).to.equal('lazy');
    expect(img.getAttribute('src').endsWith('.svg')).to.equal(true);
    expect(img.hasAttribute('data-td-src')).to.equal(false);
    expect(thumbOf('m60').hasAttribute('data-td-thumb-cell')).to.equal(false);
    expect(thumbOf('m60').hasAttribute('data-id')).to.equal(false);
    expect(host()._s.thumbs).to.equal(null);
    await until(() => img.complete && img.naturalWidth > 0, 4000, 'legacy img loads');
    expect(getComputedStyle(img).opacity).to.equal('1');
  });

  it('a repaint of a loading card never loads twice (release before, scan after); the same picture keeps its element', async () => {
    const ad = createMockAdapter({ manual: true });
    TdMediaPicker.open({ autoSelectFirst: false, adapter: ad });
    await until(() => ad.calls.list.length > 0, 4000, 'list call');
    ad.calls.list[0].resolve();
    for (let i = 0; i < 50 && !items().length; i++) await null; // microtasks only: the admitted images are still loading
    expect(items().length, 'rendered within microtasks').to.be.greaterThan(0);
    const L = host()._s.thumbs;
    const before = L.stats().inflight;
    expect(before, 'loads in flight').to.be.greaterThan(0);
    const id = items().find((el) => el.querySelector('.td-media-picker__thumb img[src]'))?.getAttribute('data-id');
    expect(!!id, 'a card loading now').to.equal(true);
    const el = item(id);
    const oldImg = imgOf(id);
    const asset = host()._s.cache.getAsset(id);
    // same picture: the element (and its load) is kept
    host()._paintItem(el, asset);
    expect(imgOf(id)).to.equal(oldImg);
    expect(L.stats().inflight).to.equal(before);
    // another picture: the old load is cancelled first, the new one takes its slot at most
    host()._paintItem(el, { ...asset, urls: { ...asset.urls, thumbnail: '/test/fixtures/2.svg?v111-repaint' } });
    expect(imgOf(id)).to.not.equal(oldImg);
    expect(oldImg.hasAttribute('src'), 'old load cancelled').to.equal(false);
    expect(L.stats().inflight).to.be.at.most(before);
    await until(() => thumbOf(id).classList.contains('is-thumb-loaded'), 4000, 'repainted card loaded');
    expect(imgOf(id).getAttribute('src').endsWith('/test/fixtures/2.svg?v111-repaint')).to.equal(true);
    ad.resolveAll();
  });

  it('detail preview + collection covers go through the loader too', async () => {
    const { ad } = await openReady({}, { collections: true });
    item('m60').querySelector('[data-td-media-open]').click();
    await until(() => q('.td-media-picker__preview img'), 4000, 'preview');
    expect(q('.td-media-picker__preview').hasAttribute('data-td-thumb-cell')).to.equal(true);
    expect(q('.td-media-picker__preview img').hasAttribute('loading')).to.equal(false);
    // the pane repaints when the asset's `get` lands: the same picture keeps its element and its loaded state
    await until(() => q('.td-media-picker__preview').classList.contains('is-thumb-loaded'), 4000, 'preview loaded');
    const pimg = q('.td-media-picker__preview img');
    expect(pimg.getAttribute('src')).to.equal(pimg.getAttribute('data-td-src'));
    expect(host()._s.thumbsDetail.stats().loaded, 'one preview load').to.equal(1);
    const search = q('.td-media-picker__search');
    search.value = 'anh';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await until(() => ad.calls.collections.length > 0, 4000, 'collections call');
    await until(() => q('.td-media-picker__coll-cover img'), 4000, 'a cover');
    const cover = q('.td-media-picker__coll-cover img');
    expect(cover.parentElement.classList.contains('td-media-picker__coll-thumb')).to.equal(true);
    await until(() => cover.parentElement.classList.contains('is-thumb-loaded'), 4000, 'cover loaded');
    expect(cover.getAttribute('src')).to.equal(cover.getAttribute('data-td-src'));
  });

  it('gate notice: one toast per gate (labels.thumbGate, ≥ 4 s); onThumbGate returning false keeps it off', async () => {
    await openReady();
    const s = host()._s;
    const until1 = Date.now() + 12000;
    const calls = [];
    const orig = TdToast.warning;
    TdToast.warning = function (msg, o) { calls.push(o && o.duration); return orig.call(this, msg, o); };
    try {
      host()._onThumbGate(s, { until: until1, remainingMs: 12000 });
      host()._onThumbGate(s, { until: until1, remainingMs: 12000 }); // the detail loader of the same open
      host()._onThumbGate(s, { until: until1 + 1, remainingMs: 1000 }); // a later gate, short: still 4 s at least
    } finally {
      TdToast.warning = orig;
    }
    expect(calls).to.deep.equal([12000, 4000]);
    await until(() => toasts().includes(TdMediaPicker.labels.thumbGate), 2000, 'toast');
    // WebKit (CI) mounts the second toast a frame later: wait for it instead of a fixed 100 ms
    await until(() => toasts().filter((t) => t === TdMediaPicker.labels.thumbGate).length === 2, 2000, 'two toasts');
    await closeAll();
    const seen = [];
    await openReady({ onThumbGate: (info) => { seen.push(info); return false; } });
    const shown = () => toasts().filter((t) => t === TdMediaPicker.labels.thumbGate).length;
    const n0 = shown();
    host()._onThumbGate(host()._s, { until: Date.now() + 5000, remainingMs: 5000 });
    await wait(150);
    expect(seen.length).to.equal(1);
    expect(seen[0].remainingMs).to.equal(5000);
    expect(shown(), 'no new toast').to.equal(n0);
  });
});
