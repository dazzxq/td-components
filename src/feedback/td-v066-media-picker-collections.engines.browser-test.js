import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.66.0 (plan docs/internal/plans/v0.66.0-media-collections.md, M3) — collections (albums) in <td-media-picker>, in
// Chromium, Firefox AND WebKit (group `engines`). Mock adapter: test/fixtures/media-adapter.js with `collections`
// (asset m{i} belongs to c{((i - 1) % n) + 1}). Helpers copied from td-media-picker.engines.browser-test.js. DOM nodes
// are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

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
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const ids = () => items().map((i) => i.getAttribute('data-id'));
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const confirmBtn = () => q('.td-media-picker__confirm');
const selCount = () => Number(q('.td-media-picker__clear')?.getAttribute('data-count') || 0);
const searchHost = () => q('.td-media-picker__search');
const searchInput = () => q('.td-media-picker__search input');
const heading = () => q('.td-media-picker__results-heading');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const press = (tdBtn) => click(tdBtn.querySelector('button') || tdBtn);
const file = (name = 'moi.png', type = 'image/png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type });
const uploadRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker-upload')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const dropzone = () => uploadRoot()?.querySelector('td-dropzone') || null;
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';

// --- collections helpers ---
const strip = () => q('.td-media-picker__colls');
const stripShown = () => !!strip() && !strip().hidden;
const stripList = () => q('.td-media-picker__collections');
const cards = () => [...(pickerRoot()?.querySelectorAll('.td-media-picker__coll') || [])];
const cardIds = () => cards().map((b) => b.getAttribute('data-id'));
const card = (id) => cards().find((b) => b.getAttribute('data-id') === id) || null;
const crumbs = () => q('.td-media-picker__crumbs');
const inColl = () => !!crumbs() && !crumbs().hidden;
const crumbLabel = () => q('.td-media-picker__crumb-current')?.textContent || '';
const backBtn = () => q('.td-media-picker__coll-back');
const allBtn = () => q('.td-media-picker__crumb-all');
const lastList = (ad) => ad.calls.list.at(-1).args[0];
const lastFacets = (ad) => ad.calls.facets.at(-1).args[0];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** number of mock assets in collection `cid` (n collections) */
const inCollection = (n, cid) => (id) => `c${((Number(id.slice(1)) - 1) % n) + 1}` === cid;
const imagesNamed = (ad, text) => [...ad.db.values()].filter((a) => a.name.includes(text)).length;

/** every text written to the picker's live region */
function liveLog() {
  const log = [];
  const mo = new MutationObserver(() => {
    const el = document.querySelector('.td-media-picker__live');
    const t = el?.textContent;
    if (t && log.at(-1) !== t) log.push(t);
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  extra.push(() => mo.disconnect());
  return log;
}
/** collection-change details, listened on the document (the initial one is emitted in a microtask after open) */
function collEvents() {
  const log = [];
  const fn = (e) => log.push(e.detail);
  document.addEventListener('collection-change', fn);
  extra.push(() => document.removeEventListener('collection-change', fn));
  return log;
}
function opErrors() {
  const log = [];
  const fn = (e) => log.push(e.detail);
  document.addEventListener('operation-error', fn);
  extra.push(() => document.removeEventListener('operation-error', fn));
  return log;
}

// v0.68.0: `autoSelectFirst` is ON by default; this suite's premise is "nothing is selected on open" → off in every open
// (a call can still override it). The auto-select behaviour is covered by td-v067-*.
async function open(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
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
/** type into the search WITHOUT Enter (the 250 ms debounce runs) */
function typeOnly(text) {
  const input = searchHost();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
/** the grid shows the page of the last list request */
async function pageSettled(ad, what = 'page settled') {
  await until(() => ad.calls.list.length && ad.calls.list.every((c) => c.settled)
    && q('.td-media-picker__results')?.getAttribute('aria-busy') === 'false', 3000, what);
}
async function searchStrip(ad, text) {
  search(text);
  await until(() => stripShown() && cards().length > 0, 3000, `strip for ${text}`);
  await pageSettled(ad);
}
async function enter(ad, id) {
  click(card(id));
  await until(() => inColl() && lastList(ad).collectionId === id, 3000, `inside ${id}`);
  await pageSettled(ad, `page of ${id}`);
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) {
    if (h.isOpen) h.close('programmatic');
  }
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-media-picker-upload, :scope > .td-modal'), 3000, 'all closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
async function openUpload() {
  q('.td-media-picker__upload-btn').click();
  await until(() => dropzone(), 3000, 'upload dialog');
  await frames(2);
}
/** close the upload dialog when it is still open (a finished single upload may have closed it already) */
async function closeUpload() {
  const root = uploadRoot();
  if (root) press(root.querySelector('.td-media-picker-upload__close'));
  await until(() => !document.querySelector('.td-media-picker-upload'), 3000, 'upload dialog closed');
  await frames(2);
}
async function uploadUrl(href) {
  if (!uploadRoot()) await openUpload();
  const root = uploadRoot();
  click(root.querySelectorAll('td-tabs [role="tab"]')[1]);
  await until(() => !root.querySelector('[data-source="url"]').hidden, 3000, 'url tab');
  root.querySelector('.td-media-picker-upload__url input').focus();
  await sendKeys({ type: href });
  await until(() => !root.querySelector('.td-media-picker-upload__submit').hasAttribute('disabled'), 3000, 'submit enabled');
  await sendKeys({ press: 'Enter' });
}

const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 1280, height: 800 });
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(50);
});

describe('v0.66.0 media picker collections — legacy sessions untouched (cases 1, 6f)', () => {
  it('1. no adapter.collections, no initialCollection → v0.65 DOM (no strip / breadcrumb), no extra calls', async () => {
    const { ad } = await openReady();
    expect(!!strip() || !!crumbs() || cards().length > 0, 'no collection DOM').to.equal(false);
    const kids = [...q('.td-media-picker__results').children].map((el) => el.className);
    expect(kids).to.deep.equal(['td-sr-only td-media-picker__results-heading', 'td-media-picker__grid td-media-grid', 'td-media-picker__skeleton',
      'td-media-picker__empty', 'td-media-picker__error']);
    expect(has(ad, 'collections')).to.equal(false);
    expect(ad.calls.collections.length).to.equal(0);
    search('anh');
    await until(() => lastList(ad).query === 'anh');
    await pageSettled(ad);
    expect(!!strip()).to.equal(false);
  });

  it('6f. legacy session: list, facets, upload and uploadFromUrl requests have no collectionId key', async () => {
    const { ad } = await openReady();
    search('anh');
    await until(() => lastList(ad).query === 'anh' && lastFacets(ad).query === 'anh');
    expect(ad.calls.list.some((c) => has(c.args[0], 'collectionId')), 'list').to.equal(false);
    expect(ad.calls.facets.some((c) => has(c.args[0], 'collectionId')), 'facets').to.equal(false);
    await openUpload();
    dropzone().addFiles([file('moi-legacy.png')]);
    await until(() => ad.calls.upload.length === 1, 3000, 'upload called');
    expect(has(ad.calls.upload[0].args[1], 'collectionId'), 'upload').to.equal(false);
    await until(() => ad.calls.upload[0].settled, 3000, 'upload settled');
    await closeUpload();
    await uploadUrl('https://example.com/legacy.jpg');
    await until(() => ad.calls.uploadFromUrl.length === 1, 3000, 'uploadFromUrl called');
    expect(has(ad.calls.uploadFromUrl[0].args[1], 'collectionId'), 'uploadFromUrl').to.equal(false);
  });

  it('6g. capabilities.collections: false beats adapter.collections AND initialCollection → a legacy session', async () => {
    const events = collEvents();
    const { ad } = await openReady({ capabilities: { collections: false }, initialCollection: { id: 'c2', label: 'Album hai' } }, { collections: true });
    expect(has(ad.calls.list[0].args[0], 'collectionId'), 'first list').to.equal(false);
    expect(inColl(), 'no breadcrumb').to.equal(false);
    expect(!!crumbs(), 'no crumbs element').to.equal(false);
    search('anh');
    await until(() => lastList(ad).query === 'anh' && lastFacets(ad).query === 'anh');
    await pageSettled(ad);
    await wait(350); // past the strip debounce
    expect(!!strip(), 'no strip').to.equal(false);
    expect(ad.calls.collections.length, 'collections() never called').to.equal(0);
    expect(ad.calls.list.some((c) => has(c.args[0], 'collectionId')), 'list').to.equal(false);
    expect(ad.calls.facets.some((c) => has(c.args[0], 'collectionId')), 'facets').to.equal(false);
    await openUpload();
    dropzone().addFiles([file('moi-tat.png')]);
    await until(() => ad.calls.upload.length === 1, 3000, 'upload called');
    expect(has(ad.calls.upload[0].args[1], 'collectionId'), 'upload').to.equal(false);
    await until(() => ad.calls.upload[0].settled, 3000, 'upload settled');
    await closeUpload();
    await uploadUrl('https://example.com/tat.jpg');
    await until(() => ad.calls.uploadFromUrl.length === 1, 3000, 'uploadFromUrl called');
    expect(has(ad.calls.uploadFromUrl[0].args[1], 'collectionId'), 'uploadFromUrl').to.equal(false);
    expect(events.length, 'no collection-change').to.equal(0);
  });
});

describe('v0.66.0 media picker collections — the strip (cases 2, 3, 6c, 6d, 9, 11)', () => {
  it('2. typing → one collections() call after the debounce + the strip; empty query → hidden; showWithoutQuery → at open', async () => {
    let r = await openReady({}, { collections: true });
    const { ad } = r;
    expect(!!strip() && !!crumbs(), 'collection DOM built').to.equal(true);
    expect(stripShown(), 'nothing typed → hidden').to.equal(false);
    expect(crumbs().hidden).to.equal(true);
    expect(ad.calls.collections.length).to.equal(0);
    expect(lastList(ad).collectionId).to.equal(null);
    expect(lastFacets(ad).collectionId).to.equal(null);
    typeOnly('an');
    typeOnly('anh');
    await wait(100);
    expect(ad.calls.collections.length, 'debounced').to.equal(0);
    await until(() => ad.calls.collections.length === 1, 3000, 'collections called');
    await wait(300);
    expect(ad.calls.collections.length, 'once').to.equal(1);
    const req = ad.calls.collections[0].args[0];
    expect(req.query).to.equal('anh');
    expect(req.filters).to.deep.equal({});
    expect(req.signal instanceof AbortSignal).to.equal(true);
    await until(() => stripShown(), 3000, 'strip shown');
    expect(cardIds()).to.deep.equal(['c1', 'c2', 'c3', 'c4']);
    // v0.74.0: the heading is the text "Album" + a muted count span
    expect(q('.td-media-picker__colls-heading').firstChild.nodeValue).to.equal('Album');
    expect(q('.td-media-picker__colls-heading .td-media-picker__section-count').textContent).to.equal('4');
    expect(stripList().getAttribute('role')).to.equal('list');
    expect(cards().every((b) => b.parentElement.getAttribute('role') === 'listitem')).to.equal(true);
    expect(card('c1').getAttribute('aria-label')).to.equal('Bộ sưu tập 1, 15 ảnh');
    expect(card('c1').querySelector('.td-media-picker__coll-count').textContent).to.equal('15 ảnh');
    // the strip sits in the results section, before the grid
    const kids = [...q('.td-media-picker__results').children];
    expect(kids.indexOf(strip()) < kids.indexOf(q('td-media-grid'))).to.equal(true);
    search('');
    await until(() => !stripShown(), 3000, 'hidden on an empty query');
    expect(ad.calls.collections.length).to.equal(1);
    await closeAll();
    r = await openReady({ collections: { showWithoutQuery: true } }, { collections: true });
    await until(() => r.ad.calls.collections.length === 1 && stripShown(), 3000, 'strip at open');
    expect(r.ad.calls.collections[0].args[0].query).to.equal('');
  });

  it('3. latest wins: q1 settling after q2 is dropped; a click on a stale (detached) card is ignored, a fresh card enters', async () => {
    const ad = createMockAdapter({ manual: true, collections: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: false });
    await until(() => ad.calls.list.length === 1 && ad.calls.facets.length === 1);
    ad.resolveAll();
    await until(() => items().length);
    search('anh-1');
    search('anh-2');
    await until(() => ad.calls.collections.length === 2);
    expect(ad.calls.collections.map((c) => c.signal.aborted)).to.deep.equal([true, false]);
    ad.ignoreSignal = true;
    ad.calls.collections[1].resolve({ items: [{ id: 'q2', label: 'Q2' }] });
    ad.calls.collections[0].resolve({ items: [{ id: 'q1', label: 'Q1' }] });
    await until(() => stripShown());
    await wait(50);
    expect(cardIds()).to.deep.equal(['q2']);
    // a new eligible request hides the old cards at once; a click on a detached (stale) card does nothing
    const events = collEvents();
    const q2 = card('q2');
    search('anh-3');
    await until(() => ad.calls.collections.length === 3);
    expect(stripShown(), 'old cards hidden while the new request runs').to.equal(false);
    expect(q2.isConnected, 'q2 detached').to.equal(false);
    const listsBefore = ad.calls.list.length;
    click(q2);
    await wait(50);
    expect(inColl(), 'stale click ignored').to.equal(false);
    expect(ad.calls.collections[2].signal.aborted, 'pending collections() not aborted').to.equal(false);
    expect(ad.calls.list.slice(listsBefore).some((c) => has(c.args[0], 'collectionId') && c.args[0].collectionId !== null), 'no collectionId').to.equal(false);
    expect(events.length, 'no event').to.equal(0);
    // the current request resolves → a connected card of the new strip enters
    ad.calls.collections[2].resolve({ items: [{ id: 'fresh', label: 'Fresh' }] });
    await until(() => stripShown() && !!card('fresh'), 3000, 'new strip');
    click(card('fresh'));
    await until(() => inColl() && crumbLabel() === 'Fresh', 3000, 'entered fresh');
    ad.resolveAll();
    await until(() => lastList(ad).collectionId === 'fresh', 3000, 'list of fresh');
    expect(stripShown(), 'no strip inside a collection').to.equal(false);
    expect(events.map((e) => e.reason)).to.deep.equal(['enter']);
  });

  it('6c. a facet change at the top level reloads collections(); a filter change inside → Back reloads (old cards not reused)', async () => {
    const { ad } = await openReady({}, { collections: true });
    await until(() => q('.td-media-picker__facets td-toggle input'), 3000, 'facets');
    await searchStrip(ad, 'anh');
    expect(ad.calls.collections.length).to.equal(1);
    q('.td-media-picker__facets td-toggle input').click();
    await until(() => ad.calls.collections.length === 2, 3000, 'collections reloaded');
    expect(ad.calls.collections[1].args[0].filters).to.deep.equal({ scope: 'mine' });
    expect(ad.calls.collections[1].args[0].query).to.equal('anh');
    await until(() => stripShown());
    await pageSettled(ad);
    await enter(ad, 'c1');
    q('.td-media-picker__facets td-toggle input').click(); // scope off, inside the collection
    await until(() => lastList(ad).collectionId === 'c1' && !has(lastList(ad).filters, 'scope'), 3000, 'inner filter');
    expect(ad.calls.collections.length, 'no strip call inside').to.equal(2);
    await pageSettled(ad);
    press(backBtn());
    await until(() => ad.calls.collections.length === 3, 3000, 'reloaded on Back');
    expect(ad.calls.collections[2].args[0].filters).to.deep.equal({});
    expect(ad.calls.collections[2].args[0].query).to.equal('anh');
  });

  it('6d. a pending collections() + the search cleared → aborted, hidden, its late result dropped', async () => {
    const ad = createMockAdapter({ manual: true, collections: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: false });
    await until(() => ad.calls.list.length === 1 && ad.calls.facets.length === 1);
    ad.resolveAll();
    await until(() => items().length);
    search('anh');
    await until(() => ad.calls.collections.length === 1);
    search('');
    expect(ad.calls.collections[0].signal.aborted).to.equal(true);
    ad.ignoreSignal = true;
    ad.calls.collections[0].resolve();
    ad.resolveAll();
    await wait(50);
    expect(stripShown()).to.equal(false);
    expect(cards().length).to.equal(0);
    expect(ad.calls.collections.length).to.equal(1);
  });

  it('9. truncated → the hint; collections() rejects / malformed → hidden + operation-error, the grid still works', async () => {
    let r = await openReady({}, { collections: { count: 25 } });
    await searchStrip(r.ad, 'anh');
    expect(cards().length).to.equal(20);
    const hint = q('.td-media-picker__colls-hint');
    expect(hint.hidden).to.equal(false);
    expect(hint.textContent).to.equal('Gõ thêm để thu hẹp');
    expect(q('.td-media-picker__colls-heading .td-media-picker__section-count').textContent, 'truncated → n+').to.equal('20+');
    await closeAll();
    const errors = opErrors();
    const ad = createMockAdapter({ collections: true });
    let mode = 'reject';
    ad.collections = async () => {
      if (mode === 'reject') throw Object.assign(new Error('SQLSTATE raw'), { code: 'server' });
      return { items: 'nope' };
    };
    r = await openReady({ adapter: ad });
    search('anh');
    await until(() => errors.length === 1, 3000, 'operation-error');
    expect(errors[0]).to.deep.equal({ operation: 'collections', code: 'server', retryable: true });
    await pageSettled(ad);
    expect(stripShown()).to.equal(false);
    expect(items().length > 0 && q('td-media-grid').hidden === false, 'grid works').to.equal(true);
    mode = 'malformed';
    search('anh-1');
    await until(() => errors.length === 2, 3000, 'operation-error (malformed)');
    expect(errors[1].operation).to.equal('collections');
    expect(errors[1].code).to.equal('server');
    expect(stripShown()).to.equal(false);
  });

  it('11. XSS: label / description stay text, description only in title; javascript: / data: cover → icon', async () => {
    const ad = createMockAdapter({ manual: true, collections: true });
    TdMediaPicker.open({ adapter: ad, autoSelectFirst: false });
    await until(() => ad.calls.list.length === 1 && ad.calls.facets.length === 1);
    ad.resolveAll();
    await until(() => items().length);
    search('x');
    await until(() => ad.calls.collections.length === 1);
    const evil = '<img src=x onerror="window.__k8xss=1">Bad';
    const desc = '<b>bold</b> "quoted" & more';
    ad.calls.collections[0].resolve({
      items: [
        { id: 'x1', label: evil, description: desc, count: 3, coverUrl: 'javascript:alert(1)' },
        { id: 'x2', label: 'Data', coverUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
        { id: 'x3', label: 'OK', coverUrl: '/test/fixtures/1.svg' },
      ],
    });
    await until(() => stripShown());
    expect(cardIds()).to.deep.equal(['x1', 'x2', 'x3']);
    const x1 = card('x1');
    expect(x1.querySelector('.td-media-picker__coll-name').textContent).to.equal(evil);
    expect(x1.getAttribute('aria-label')).to.equal(`${evil}, 3 ảnh`);
    expect(x1.title).to.equal(desc);
    expect(!!strip().querySelector('img[src="x"], b'), 'no markup parsed').to.equal(false);
    expect(strip().textContent.includes('bold'), 'description not rendered as text').to.equal(false);
    expect(!!x1.querySelector('img'), 'x1 no img').to.equal(false);
    expect(!!x1.querySelector('.td-media-picker__coll-icon svg'), 'x1 icon').to.equal(true);
    const x2 = card('x2');
    expect(!!x2.querySelector('img'), 'x2 no img').to.equal(false);
    expect(x2.getAttribute('aria-label')).to.equal('Data');
    expect(x2.hasAttribute('title')).to.equal(false);
    expect(!!x2.querySelector('.td-media-picker__coll-count')).to.equal(false);
    const img = card('x3').querySelector('img');
    expect(!!img).to.equal(true);
    expect(img.getAttribute('src').endsWith('/test/fixtures/1.svg')).to.equal(true);
    expect(img.getAttribute('referrerpolicy')).to.equal('no-referrer');
    expect(img.getAttribute('loading')).to.equal('lazy');
    expect(img.getAttribute('alt')).to.equal('');
    await wait(50);
    expect(window.__k8xss).to.equal(undefined);
  });
});

describe('v0.66.0 media picker collections — enter / back (cases 4, 5, 6, 6b, 6e, 7, 12, 14)', () => {
  it('4 + 5 + 14. enter: list with collectionId + empty query, search cleared, breadcrumb, focus, live, event; search + facets inside', async () => {
    const events = collEvents();
    const log = liveLog();
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    const nColl = ad.calls.collections.length;
    click(card('c1'));
    expect(searchInput().value).to.equal('');
    expect(document.activeElement === heading(), 'focus on the results heading').to.equal(true);
    expect(stripShown()).to.equal(false);
    await until(() => lastList(ad).collectionId === 'c1');
    expect(lastList(ad).query).to.equal('');
    expect(lastFacets(ad).collectionId).to.equal('c1');
    expect(lastFacets(ad).query).to.equal('');
    await pageSettled(ad);
    expect(ids().length > 0 && ids().every(inCollection(4, 'c1')), 'only c1 assets').to.equal(true);
    const nav = crumbs();
    expect(nav.tagName).to.equal('NAV');
    expect(nav.hidden).to.equal(false);
    expect(nav.getAttribute('aria-label')).to.equal('Vị trí');
    expect(allBtn().textContent.trim()).to.equal('Tất cả');
    expect(q('.td-media-picker__crumb-sep').getAttribute('aria-hidden')).to.equal('true');
    expect(crumbLabel()).to.equal('Bộ sưu tập 1');
    expect(q('.td-media-picker__crumb-current').getAttribute('aria-current')).to.equal('page');
    expect(backBtn().textContent.trim()).to.equal('Quay lại');
    await until(() => log.includes('Bộ sưu tập 1: 15 kết quả'), 3000, 'live region');
    expect(events).to.deep.equal([{ collection: { id: 'c1', label: 'Bộ sưu tập 1' }, reason: 'enter' }]);
    // 5. searching inside the collection
    search('anh-1');
    await until(() => lastList(ad).query === 'anh-1');
    expect(lastList(ad).collectionId).to.equal('c1');
    await until(() => lastFacets(ad).query === 'anh-1');
    expect(lastFacets(ad).collectionId).to.equal('c1');
    await pageSettled(ad);
    expect(ids().every(inCollection(4, 'c1'))).to.equal(true);
    expect(ad.calls.collections.length, 'no strip call inside').to.equal(nColl);
    expect(stripShown()).to.equal(false);
  });

  it('6. Back by button, "Tất cả" and Escape: query + search restored, saved strip + scrollLeft back without a call, event back', async () => {
    const events = collEvents();
    const log = liveLog();
    const { ad, promise } = await openReady({}, { collections: { count: 12 } });
    await searchStrip(ad, 'anh');
    expect(cards().length).to.equal(12);
    const total = imagesNamed(ad, 'anh');
    const ways = [
      ['button', () => press(backBtn())],
      ['all', () => press(allBtn())],
      ['escape', () => sendKeys({ press: 'Escape' })],
    ];
    for (const [i, [way, back]] of ways.entries()) {
      const list = stripList();
      list.scrollLeft = 120 + 60 * i;
      const sl = list.scrollLeft;
      expect(sl > 0, `${way}: the strip scrolls`).to.equal(true);
      await enter(ad, `c${i + 2}`);
      log.length = 0;
      await back();
      await until(() => !inColl(), 3000, `${way}: back`);
      expect(searchInput().value, way).to.equal('anh');
      expect(document.activeElement === heading(), `${way}: focus`).to.equal(true);
      await until(() => lastList(ad).collectionId === null && lastList(ad).query === 'anh', 3000, `${way}: top-level list`);
      expect(stripShown(), `${way}: strip`).to.equal(true);
      expect(cards().length).to.equal(12);
      expect(Math.abs(stripList().scrollLeft - sl) <= 1, `${way}: scrollLeft ${stripList().scrollLeft} vs ${sl}`).to.equal(true);
      expect(ad.calls.collections.length, `${way}: no new call`).to.equal(1);
      await pageSettled(ad);
      await until(() => log.includes(`Tất cả: ${total} kết quả`), 3000, `${way}: live`);
      expect(events.at(-1)).to.deep.equal({ collection: null, reason: 'back' });
    }
    expect(events.map((e) => e.reason)).to.deep.equal(['enter', 'back', 'enter', 'back', 'enter', 'back']);
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('6b + 12. initialCollection: opens inside (event initial); Back → initialQuery, collections() only when the adapter has it', async () => {
    let events = collEvents();
    let r = await open({ initialCollection: { id: 'c2', label: 'Album hai' }, initialQuery: 'anh' }, { collections: true });
    await until(() => items().length);
    expect(r.ad.calls.list[0].args[0].collectionId).to.equal('c2');
    expect(r.ad.calls.list[0].args[0].query).to.equal('');
    expect(r.ad.calls.facets[0].args[0].collectionId).to.equal('c2');
    expect(searchInput().value).to.equal('');
    expect(inColl()).to.equal(true);
    expect(crumbLabel()).to.equal('Album hai');
    expect(stripShown()).to.equal(false);
    expect(r.ad.calls.collections.length).to.equal(0);
    await until(() => events.length === 1);
    expect(events[0]).to.deep.equal({ collection: { id: 'c2', label: 'Album hai' }, reason: 'initial' });
    await pageSettled(r.ad);
    press(backBtn());
    await until(() => !inColl());
    expect(searchInput().value).to.equal('anh');
    await until(() => lastList(r.ad).collectionId === null && lastList(r.ad).query === 'anh');
    await until(() => r.ad.calls.collections.length === 1 && stripShown(), 3000, 'collections() after Back');
    expect(r.ad.calls.collections[0].args[0].query).to.equal('anh');
    await closeAll();
    // the adapter has no collections(): Back restores query + grid, never calls anything, no strip
    events = collEvents();
    r = await open({ initialCollection: { id: 'c3', label: 'Ba' }, initialQuery: 'anh' });
    await until(() => items().length);
    expect(has(r.ad, 'collections')).to.equal(false);
    expect(lastList(r.ad).collectionId).to.equal('c3');
    await pageSettled(r.ad);
    await sendKeys({ press: 'Escape' }); // focus is in the (empty) search → Escape = Back
    await until(() => !inColl());
    expect(searchInput().value).to.equal('anh');
    await until(() => lastList(r.ad).collectionId === null && lastList(r.ad).query === 'anh');
    await pageSettled(r.ad);
    expect(items().length > 0).to.equal(true);
    expect(stripShown()).to.equal(false);
    expect(events.map((e) => e.reason)).to.deep.equal(['initial', 'back']);
    expect(await peek(r.promise)).to.equal(PENDING);
    // 12. a bad initialCollection → TypeError (sync), nothing opened
    await closeAll();
    const ad = createMockAdapter({ collections: true });
    for (const bad of [{ id: 5, label: 'x' }, { id: 'a' }, { id: '', label: 'x' }, { id: 'a', label: '  ' }, 'c1']) {
      expect(() => TdMediaPicker.open({ adapter: ad, initialCollection: bad }), JSON.stringify(bad)).to.throw(TypeError);
    }
    expect(document.querySelector('td-media-picker') === null).to.equal(true);
  });

  it('6e. a card clicked while new text is still debouncing: the canonical query is the live one; Back restores it and reloads', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh-1');
    expect(ad.calls.collections.length).to.equal(1);
    typeOnly('anh-2');
    click(card('c1'));
    await until(() => lastList(ad).collectionId === 'c1');
    await wait(350); // past the debounce: it was cancelled
    expect(ad.calls.list.some((c) => c.args[0].query === 'anh-2'), 'q2 never committed at the top level').to.equal(false);
    await pageSettled(ad);
    press(backBtn());
    expect(searchInput().value).to.equal('anh-2');
    await until(() => lastList(ad).query === 'anh-2' && lastList(ad).collectionId === null);
    await until(() => ad.calls.collections.length === 2, 3000, 'collections() for q2');
    expect(ad.calls.collections[1].args[0].query).to.equal('anh-2');
    expect(stripShown(), 'q1 cards are never shown under q2 while loading').to.equal(false);
    await until(() => stripShown(), 3000, 'q2 strip');
  });

  it('7. Escape inside a collection: 1st clears the search, 2nd goes back, 3rd closes cancelled / escape', async () => {
    const { ad, promise } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    await enter(ad, 'c1');
    searchInput().focus();
    await sendKeys({ type: 'x' });
    await until(() => lastList(ad).query === 'x', 3000, 'inner query');
    await sendKeys({ press: 'Escape' });
    expect(searchInput().value).to.equal('');
    expect(inColl()).to.equal(true);
    await until(() => lastList(ad).query === '' && lastList(ad).collectionId === 'c1');
    await sendKeys({ press: 'Escape' });
    expect(inColl()).to.equal(false);
    expect(await peek(promise)).to.equal(PENDING);
    expect(searchInput().value).to.equal('anh');
    await sendKeys({ press: 'Escape' });
    expect(await promise).to.deep.equal({ status: 'cancelled', reason: 'escape', selection: [] });
  });
});

describe('v0.66.0 media picker collections — selection, keyboard, upload (cases 8, 10, 13)', () => {
  it('8. the selection survives both levels (multiple + maxItems, single); footer follows', async () => {
    let r = await openReady({ selection: { mode: 'multiple', maxItems: 2 } }, { collections: true });
    await searchStrip(r.ad, 'anh');
    click(tick('m60'));
    await until(() => selCount() === 1);
    await enter(r.ad, 'c1');
    click(tick('m57'));
    await until(() => selCount() === 2);
    expect(confirmBtn().getAttribute('label')).to.equal('Chèn (2)');
    click(tick('m53')); // over maxItems → vetoed
    await wait(30);
    expect(selCount()).to.equal(2);
    press(backBtn());
    await until(() => lastList(r.ad).collectionId === null);
    await pageSettled(r.ad);
    expect(selCount()).to.equal(2);
    expect(item('m60').hasAttribute('data-selected') && item('m57').hasAttribute('data-selected'), 'ticks kept').to.equal(true);
    confirmBtn().click();
    expect((await r.promise).selection.map((x) => x.assetId)).to.deep.equal(['m60', 'm57']);
    // single
    r = await openReady({ selection: { mode: 'single' } }, { collections: true });
    await searchStrip(r.ad, 'anh');
    click(opener('m60'));
    await until(() => !confirmBtn().hasAttribute('disabled'));
    await enter(r.ad, 'c1');
    expect(confirmBtn().hasAttribute('disabled')).to.equal(false);
    click(opener('m57'));
    await until(() => item('m57')?.hasAttribute('data-selected'));
    press(allBtn());
    await until(() => lastList(r.ad).collectionId === null);
    await pageSettled(r.ad);
    expect(item('m57').hasAttribute('data-selected') && !item('m60').hasAttribute('data-selected'), 'single replaced').to.equal(true);
    confirmBtn().click();
    expect((await r.promise).selection.map((x) => x.assetId)).to.deep.equal(['m57']);
  });

  it('10. keyboard: Tab to a card, Enter enters; Tab to "Quay lại", Space goes back; Space on a card enters', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    heading().focus();
    await sendKeys({ press: TAB });
    expect(document.activeElement === card('c1'), 'Tab from the heading → first card').to.equal(true);
    await sendKeys({ press: 'Enter' });
    await until(() => inColl() && lastList(ad).collectionId === 'c1');
    expect(document.activeElement === heading()).to.equal(true);
    for (let i = 0; i < 4 && !backBtn().contains(document.activeElement); i++) await sendKeys({ press: TAB });
    expect(backBtn().contains(document.activeElement), 'Tab reaches Quay lại').to.equal(true);
    await sendKeys({ press: 'Space' });
    await until(() => !inColl());
    expect(document.activeElement === heading()).to.equal(true);
    await sendKeys({ press: TAB });
    await sendKeys({ press: TAB });
    expect(document.activeElement === card('c2'), 'second card').to.equal(true);
    await sendKeys({ press: 'Space' });
    await until(() => inColl() && lastList(ad).collectionId === 'c2');
  });

  it('13. upload inside a collection: upload and uploadFromUrl get collectionId (top level: null)', async () => {
    const { ad } = await openReady({}, { collections: true });
    await openUpload();
    dropzone().addFiles([file('ngoai.png')]);
    await until(() => ad.calls.upload.length === 1);
    expect(has(ad.calls.upload[0].args[1], 'collectionId') && ad.calls.upload[0].args[1].collectionId === null, 'top level null').to.equal(true);
    await until(() => ad.calls.upload[0].settled, 3000, 'upload settled');
    await closeUpload();
    await searchStrip(ad, 'anh');
    await enter(ad, 'c2');
    await openUpload();
    dropzone().addFiles([file('trong.png')]);
    await until(() => ad.calls.upload.length === 2);
    expect(ad.calls.upload[1].args[1].collectionId).to.equal('c2');
    await until(() => ad.calls.upload[1].settled, 3000, 'upload settled');
    await closeUpload();
    await uploadUrl('https://example.com/trong-album.jpg');
    await until(() => ad.calls.uploadFromUrl.length === 1, 3000, 'uploadFromUrl called');
    expect(ad.calls.uploadFromUrl[0].args[1].collectionId).to.equal('c2');
  });
});
