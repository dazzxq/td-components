import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

// v0.112.0 (plan v0.112.0-media-field-gallery-thumb-loader) — td-media-field / td-media-gallery previews through the
// thumbnail loader by ADOPTION (render() / PHP markup unchanged: `src` + `loading="lazy"`): loaded cells, a failing URL
// never keeps a src, far tiles wait for the viewport, hidden ones (no layout box) never load, crop preview from the
// natural size, `thumbLoader` false / toggle / pre-definition, teardown restores render()'s markup (same node on
// re-connect), a `budgetKey` config drives the loader's broker, repaints release their loads.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

await import('./td-media-field.js');
await import('./td-media-gallery.js');
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
const J = (v) => JSON.stringify(v);
const box = document.createElement('div');
document.body.appendChild(box);
let n = 0;
const fresh = (p) => `/test/fixtures/${p}.svg?v112-${n++}`; // a new URL per test: no cache, no ledger carry-over

function field(attrs = {}, { before = null } = {}) {
  const el = document.createElement('td-media-field');
  for (const [k, v] of Object.entries({ name: 'f', ...attrs })) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (before) before(el);
  box.appendChild(el);
  return el;
}
function gallery(count, { spacer = 0, src = (i) => fresh(1 + (i % 3)) } = {}) {
  if (spacer) {
    const s = document.createElement('div');
    s.className = 'v112-spacer';
    s.setAttribute('aria-hidden', 'true');
    box.appendChild(s);
    s.style.height = `${spacer}px`;
  }
  const el = document.createElement('td-media-gallery');
  el.setAttribute('name', 'g');
  el.setAttribute('max', '100');
  el.setAttribute('items', J(Array.from({ length: count }, (_, i) => ({ id: `g${i}`, src: src(i), name: `Ảnh ${i}` }))));
  box.appendChild(el);
  return el;
}
const img = (el) => el.querySelector('img.td-media-field__img, img.td-media-gallery__img');
const cellOf = (i) => i.closest('[data-td-thumb-cell]');

afterEach(() => {
  box.replaceChildren();
  window.scrollTo(0, 0);
});

describe('v0.112.0 td-media-field — preview through the thumb loader', () => {
  before(async () => { await setViewport({ width: 1280, height: 800 }); });

  it('adopts the rendered preview: same element, managed + cell marked, loads → is-thumb-loaded; markup otherwise render()\'s', async () => {
    const src = fresh(1);
    const el = field({ value: 'm1', 'preview-src': src });
    const i = img(el);
    expect(el.classList.contains('td-thumbs-js'), 'root class on the host').to.equal(true);
    expect(i.hasAttribute('data-td-managed-img')).to.equal(true);
    const cell = cellOf(i);
    expect(cell && cell.classList.contains('td-media-field__open'), 'the open button is the cell').to.equal(true);
    await until(() => cell.classList.contains('is-thumb-loaded'), 4000, 'loaded');
    expect(img(el)).to.equal(i);
    expect(i.getAttribute('src')).to.equal(src);
    expect(i.getAttribute('referrerpolicy')).to.equal('no-referrer');
  });

  it('a failing URL never keeps a src: retried, then is-thumb-failed (no broken image)', async () => {
    const el = field({ value: 'm1', 'preview-src': `/test/fixtures/__v112-missing-${n++}.svg` });
    const i = img(el);
    await until(() => cellOf(i)?.classList.contains('is-thumb-failed'), 12000, 'failed');
    expect(i.hasAttribute('src')).to.equal(false);
    expect(getComputedStyle(i).opacity).to.equal('0');
  });

  it('a repaint (value change) releases the old preview and adopts the new one; nothing left in flight', async () => {
    const el = field({ value: 'm1', 'preview-src': fresh(1) });
    const old = img(el);
    el.setAttribute('preview-src', fresh(2));
    const now = img(el);
    expect(now).to.not.equal(old);
    expect(now.hasAttribute('data-td-managed-img')).to.equal(true);
    await until(() => cellOf(now).classList.contains('is-thumb-loaded'), 4000, 'new loaded');
    await until(() => el._thumbs.loader.stats().inflight === 0, 2000, 'inflight 0');
  });

  it('a repaint into the same cell drops the old image\'s terminal state (no stale loaded)', async () => {
    const el = field({ value: 'm1', 'preview-src': fresh(1) });
    const cell = cellOf(img(el));
    await until(() => cell.classList.contains('is-thumb-loaded'), 4000, 'first loaded');
    el.setAttribute('preview-src', fresh(2));
    expect(cellOf(img(el)), 'same cell reused').to.equal(cell);
    expect(cell.classList.contains('is-thumb-loaded'), 'old loaded state gone').to.equal(false);
    await until(() => cell.classList.contains('is-thumb-loaded'), 4000, 'new loaded');
  });

  it('crop preview without a known size: computed from the natural size once the loader loaded a far image', async () => {
    const s = document.createElement('div');
    box.appendChild(s);
    s.style.height = '4000px';
    const el = field({
      usage: true, croppable: true, 'aspect-ratio': '3/2', value: 'm1', 'preview-src': fresh(1),
      crop: '{"v":1,"x":0.25,"y":0.25,"width":0.5,"height":0.5}',
    });
    const i = img(el);
    expect(i.hasAttribute('src'), 'far: deferred').to.equal(false);
    expect(i.hasAttribute('style'), 'no crop vars before load').to.equal(false);
    el.scrollIntoView();
    await until(() => cellOf(i).classList.contains('is-thumb-loaded'), 4000, 'loaded after scroll');
    await until(() => i.style.getPropertyValue('--_td-mf-crop-w') !== '', 2000, 'crop vars');
  });

  it('thumbLoader = false before definition: the pre-0.112 preview (src + loading=lazy, no marks)', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<td-media-field name="f" value="m1" preview-src="${fresh(1)}"></td-media-field>`;
    const el = /** @type {any} */ (tpl.content.firstElementChild);
    el.thumbLoader = false; // own property on a not yet upgraded element
    box.appendChild(el);
    await until(() => !!img(el), 2000, 'rendered');
    expect(el.thumbLoader).to.equal(false);
    const i = img(el);
    expect(i.hasAttribute('data-td-managed-img')).to.equal(false);
    expect(i.getAttribute('loading')).to.equal('lazy');
    expect(i.hasAttribute('src')).to.equal(true);
    expect(el.classList.contains('td-thumbs-js')).to.equal(false);
    expect(el.querySelector('[data-td-thumb-cell]')).to.equal(null);
  });

  it('toggle while connected: off (also mid-load) restores src + loading=lazy and drops every mark; on adopts again', async () => {
    const src = fresh(3);
    const el = field({ value: 'm1', 'preview-src': src });
    const i = img(el);
    el.thumbLoader = false; // right after adoption: the browser is still loading it
    expect(i.getAttribute('src')).to.equal(src);
    expect(i.getAttribute('loading')).to.equal('lazy');
    for (const a of ['data-td-managed-img', 'data-td-src']) expect(i.hasAttribute(a), a).to.equal(false);
    expect(el.querySelector('[data-td-thumb-cell], .is-thumb-loaded, .is-thumb-waiting, .is-thumb-failed')).to.equal(null);
    expect(el.classList.contains('td-thumbs-js')).to.equal(false);
    el.thumbLoader = true;
    expect(i.hasAttribute('data-td-managed-img')).to.equal(true);
    await until(() => cellOf(i)?.classList.contains('is-thumb-loaded'), 4000, 'loaded again');
  });

  it('disconnect restores render()\'s markup (a far, deferred preview gets its src back); re-connect keeps the node', async () => {
    const s = document.createElement('div');
    box.appendChild(s);
    s.style.height = '4000px';
    const src = fresh(2);
    const el = field({ value: 'm1', 'preview-src': src });
    const i = img(el);
    expect(i.hasAttribute('src'), 'far: deferred').to.equal(false);
    el.remove();
    expect(i.getAttribute('src')).to.equal(src);
    expect(i.getAttribute('loading')).to.equal('lazy');
    expect(i.hasAttribute('data-td-src')).to.equal(false);
    expect(i.closest('.td-media-field__open').hasAttribute('data-td-thumb-cell')).to.equal(false);
    box.prepend(el); // near the top now
    expect(img(el), 're-bound in place').to.equal(i);
    expect(i.hasAttribute('data-td-managed-img')).to.equal(true);
    await until(() => cellOf(i).classList.contains('is-thumb-loaded'), 4000, 'loaded after re-connect');
  });

  it('thumbLoader { budgetKey }: the preview goes through that broker', async () => {
    const el = field({ value: 'm1', 'preview-src': fresh(1) }, { before: (e) => { e.thumbLoader = { budgetKey: 'v112-key', limit: 500 }; } });
    await until(() => cellOf(img(el))?.classList.contains('is-thumb-loaded'), 4000, 'loaded');
    expect(getThumbBudget('v112-key').stats().windowCount).to.be.greaterThan(0);
  });
});

describe('v0.112.0 td-media-gallery — tiles through the thumb loader', () => {
  before(async () => { await setViewport({ width: 1280, height: 800 }); });

  it('far tiles wait (no src) until scrolled near; then they load', async () => {
    const el = gallery(40, { spacer: 4000 });
    const imgs = [...el.querySelectorAll('img.td-media-gallery__img')];
    expect(imgs.length).to.equal(40);
    for (const i of imgs) {
      expect(i.hasAttribute('data-td-managed-img')).to.equal(true);
      expect(cellOf(i)?.classList.contains('td-media-gallery__media')).to.equal(true);
    }
    await wait(150);
    expect(imgs.filter((i) => i.hasAttribute('src')).length, 'none loads far away').to.equal(0);
    el.scrollIntoView();
    await until(() => cellOf(imgs[0]).classList.contains('is-thumb-loaded'), 4000, 'first tile loaded');
  });

  it('a hidden gallery (display:none ancestor) never loads; showing it loads the tiles', async () => {
    const wrap = document.createElement('div');
    wrap.hidden = true;
    box.appendChild(wrap);
    const el = document.createElement('td-media-gallery');
    el.setAttribute('name', 'g');
    el.setAttribute('items', J([{ id: 'h1', src: fresh(1), name: 'A' }, { id: 'h2', src: fresh(2), name: 'B' }]));
    wrap.appendChild(el);
    const imgs = [...el.querySelectorAll('img.td-media-gallery__img')];
    await wait(200);
    expect(imgs.filter((i) => i.hasAttribute('src')).length, 'hidden: no load').to.equal(0);
    wrap.hidden = false;
    await until(() => imgs.every((i) => cellOf(i).classList.contains('is-thumb-loaded')), 4000, 'loaded once shown');
  });

  it('picker-added tiles (inserted before the Add cell) are adopted once connected', async () => {
    const el = gallery(2);
    const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');
    const a = JSON.parse(JSON.stringify(createMockAdapter().db.get('m5')));
    a.urls = { ...a.urls, thumbnail: fresh(3), preview: fresh(3) };
    el._onPicked({ status: 'selected', selection: [{ assetId: 'm5', asset: a, usage: { altText: '' } }] }, el._srcGen ?? 0);
    const added = [...el.querySelectorAll('img.td-media-gallery__img')];
    expect(added.length).to.equal(3);
    const last = added[2];
    expect(last.hasAttribute('data-td-managed-img')).to.equal(true);
    await until(() => cellOf(last).classList.contains('is-thumb-loaded'), 4000, 'added tile loaded');
  });

  it('remove / reorder / items change: no load left in flight; the same tile keeps its loaded state', async () => {
    const el = gallery(4);
    const imgs = [...el.querySelectorAll('img.td-media-gallery__img')];
    await until(() => imgs.every((i) => cellOf(i).classList.contains('is-thumb-loaded')), 4000, 'all loaded');
    el._move(0, 2);
    expect(cellOf(imgs[0]).classList.contains('is-thumb-loaded'), 'moved tile kept').to.equal(true);
    el._remove(imgs[1].closest('li'));
    el.setAttribute('items', J([{ id: 'z1', src: fresh(1), name: 'Z' }]));
    await until(() => cellOf(img(el))?.classList.contains('is-thumb-loaded'), 4000, 'new item loaded');
    await until(() => el._thumbs.loader.stats().inflight === 0, 2000, 'inflight 0');
    expect(el._thumbs.adopted.size).to.equal(1);
  });

  it('disconnect restores every tile to render()\'s markup; re-connect keeps the nodes', async () => {
    const el = gallery(3, { spacer: 4000 });
    const imgs = [...el.querySelectorAll('img.td-media-gallery__img')];
    el.remove();
    for (const i of imgs) {
      expect(i.hasAttribute('src')).to.equal(true);
      expect(i.getAttribute('loading')).to.equal('lazy');
      expect(i.hasAttribute('data-td-managed-img')).to.equal(false);
    }
    expect(el.querySelector('[data-td-thumb-cell]')).to.equal(null);
    box.prepend(el);
    expect([...el.querySelectorAll('img.td-media-gallery__img')]).to.deep.equal(imgs);
    await until(() => imgs.every((i) => cellOf(i)?.classList.contains('is-thumb-loaded')), 4000, 'loaded after re-connect');
  });
});
