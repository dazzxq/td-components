import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.74.0 (plan docs/internal/plans/v0.74.0-media-picker-album-sections.md) — the two sections "Album" / "Ảnh" of the
// picker's outer level (headings + counts, contain covers, the stacked-photos card), in Chromium, Firefox AND WebKit
// (group `engines`). Mock adapter: test/fixtures/media-adapter.js with `collections`. Helpers copied from the v0.66.0
// suite. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
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


// --- v0.74.0 helpers ---
const collsHead = () => q('.td-media-picker__colls-heading');
const itemsHead = () => q('.td-media-picker__items-heading');
const countOf = (h) => h?.querySelector('.td-media-picker__section-count') || null;
const shown = (el) => !!el && el.getClientRects().length > 0;
const cs = (el, pseudo) => getComputedStyle(el, pseudo);
/** a token resolved to the computed colour (probe inside the picker, so its theme applies) */
function resolved(value, prop = 'color') {
  const probe = document.createElement('span');
  probe.style[prop] = value;
  pickerRoot().appendChild(probe);
  const v = getComputedStyle(probe)[prop];
  probe.remove();
  return v;
}
const pageBtn = (n) => [...(q('td-pagination')?.querySelectorAll('button') || [])].find((b) => b.textContent.trim() === String(n)) || null;
const coverOf = (b) => b.querySelector('.td-media-picker__coll-cover');

const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 1280, height: 800 });
  await emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' }).catch(() => {});
  await wait(50);
});

describe('v0.74.0 media picker — Album / Ảnh sections', () => {
  it('1. covers are object-fit: contain, the img sits inside the cover box, the cover keeps the muted fill', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    const b = card('c1');
    const cover = coverOf(b);
    const img = cover.querySelector('img');
    expect(!!img, 'cover image').to.equal(true);
    expect(cs(img).objectFit).to.equal('contain');
    const cr = cover.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    expect(ir.left >= cr.left - 0.5 && ir.right <= cr.right + 0.5 && ir.top >= cr.top - 0.5 && ir.bottom <= cr.bottom + 0.5, 'img ⊂ cover').to.equal(true);
    expect(cs(cover).backgroundColor).to.equal(resolved('var(--td-color-surface-muted)', 'backgroundColor'));
  });

  it('2. two headings in one style, muted regular counts, the grid heading right before the grid with a 1px hairline', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    const a = collsHead();
    const g = itemsHead();
    expect(shown(a) && shown(g), 'both shown').to.equal(true);
    for (const k of ['fontSize', 'fontWeight', 'color']) expect(cs(g)[k], k).to.equal(cs(a)[k]);
    expect(cs(a).color).to.equal(resolved('var(--td-color-text)'));
    expect(cs(a).fontWeight).to.equal(resolved('var(--td-fw-medium)', 'fontWeight'));
    for (const h of [a, g]) {
      const c = countOf(h);
      expect(cs(c).color).to.equal(resolved('var(--td-color-text-muted)'));
      expect(cs(c).fontWeight).to.equal('400');
    }
    expect(g.tagName).to.equal('H4');
    expect(g.nextElementSibling === q('td-media-grid'), 'right before the grid').to.equal(true);
    expect(g.id.endsWith('-ih')).to.equal(true);
    expect(cs(g).borderTopWidth).to.equal('1px');
    expect(cs(g).borderTopColor).to.equal(resolved('var(--td-color-border)'));
    expect(g.getBoundingClientRect().top - stripList().getBoundingClientRect().bottom > 0, 'space between strip and hairline').to.equal(true);
    expect(cs(a).borderTopWidth, 'the album heading has no hairline').to.equal('0px');
  });

  it('3. counts: Album = cards (n+ when truncated); Ảnh = total, nothing when unknown, the shown items on one page; pages do not change it', async () => {
    let r = await openReady({}, { collections: true });
    await searchStrip(r.ad, 'anh');
    expect(countOf(collsHead()).textContent).to.equal('4');
    expect(collsHead().textContent.trim()).to.equal('Album 4');
    const total = lastList(r.ad) && Number(countOf(itemsHead()).textContent);
    expect(total > 0 && shown(countOf(itemsHead())), 'total shown').to.equal(true);
    expect(total, 'the total is not the page size').to.be.greaterThan(items().length);
    expect(itemsHead().textContent.trim()).to.equal(`Ảnh ${total}`);
    await closeAll();

    r = await openReady({}, { collections: { count: 25 } });
    await searchStrip(r.ad, 'anh');
    expect(countOf(collsHead()).textContent).to.equal('20+');
    await closeAll();

    // no total + more pages → heading, no number
    r = await openReady({}, { collections: true, total: false });
    await searchStrip(r.ad, 'anh');
    expect(shown(itemsHead()), 'heading kept').to.equal(true);
    expect(shown(countOf(itemsHead())), 'no number').to.equal(false);
    expect(itemsHead().textContent.trim()).to.equal('Ảnh');
    await closeAll();

    // no total + a single page → the items shown
    r = await openReady({}, { collections: true, total: false, count: 12 });
    await searchStrip(r.ad, 'anh');
    expect(countOf(itemsHead()).textContent).to.equal(String(items().length));
    await closeAll();

    // pages mode: the number is the total, whatever the page
    r = await openReady({ pagination: 'pages' }, { collections: true, pagination: 'pages' });
    await searchStrip(r.ad, 'anh');
    const t1 = countOf(itemsHead()).textContent;
    const pg = q('td-pagination');
    const before = ids()[0];
    await until(() => pg && !pg.hidden && pageBtn(2), 4000, 'pagination');
    pageBtn(2).click();
    await until(() => ids()[0] !== before, 3000, 'page 2');
    await pageSettled(r.ad);
    expect(countOf(itemsHead()).textContent, 'same number on page 2').to.equal(t1);
  });

  it('4. show / hide: only with the strip; empty grid → "Ảnh 0"; loading → no number; list error → heading without number', async () => {
    let r = await openReady({}, { collections: true });
    expect(shown(collsHead()) || shown(itemsHead()), 'nothing typed').to.equal(false);
    await searchStrip(r.ad, 'anh');
    const total = countOf(itemsHead()).textContent;
    // into an album → both hidden; back → both again, with the right numbers
    await enter(r.ad, 'c1');
    expect(shown(collsHead()) || shown(itemsHead()), 'inside an album').to.equal(false);
    click(backBtn());
    await until(() => stripShown(), 3000, 'strip back');
    await pageSettled(r.ad);
    expect(shown(collsHead()) && shown(itemsHead())).to.equal(true);
    expect(countOf(collsHead()).textContent).to.equal('4');
    expect(countOf(itemsHead()).textContent).to.equal(total);
    search('');
    await until(() => !stripShown(), 3000, 'hidden on an empty query');
    expect(shown(itemsHead()), 'strip hidden → no "Ảnh"').to.equal(false);
    await closeAll();

    // an empty grid next to a matching album
    r = await openReady({}, { collections: true });
    search('Bộ sưu tập');
    await until(() => stripShown() && cards().length, 3000, 'strip');
    await pageSettled(r.ad);
    expect(items().length).to.equal(0);
    expect(itemsHead().textContent.trim()).to.equal('Ảnh 0');
    await closeAll();

    // collections() empty / rejecting → neither heading
    const bad = createMockAdapter({ collections: true });
    bad.collections = async () => { throw Object.assign(new Error('x'), { code: 'server' }); };
    r = await openReady({ adapter: bad });
    search('anh');
    await pageSettled(bad);
    await wait(100);
    expect(shown(collsHead()) || shown(itemsHead())).to.equal(false);
    await closeAll();
    const none = createMockAdapter({ collections: true });
    none.collections = async () => ({ items: [], truncated: false });
    r = await openReady({ adapter: none });
    search('anh');
    await pageSettled(none);
    await wait(100);
    expect(shown(collsHead()) || shown(itemsHead())).to.equal(false);
    await closeAll();

    // loading: the strip is up, the list is pending → no number
    const man = createMockAdapter({ manual: true, collections: true });
    TdMediaPicker.open({ adapter: man, autoSelectFirst: false });
    await until(() => man.calls.list.length === 1 && man.calls.facets.length === 1);
    man.resolveAll();
    await until(() => items().length);
    search('anh');
    await until(() => man.calls.collections.length === 1 && man.calls.list.length === 2);
    man.calls.collections[0].resolve();
    await until(() => stripShown(), 3000, 'strip while loading');
    expect(shown(itemsHead()), 'heading while loading').to.equal(true);
    expect(shown(countOf(itemsHead())), 'no number while loading').to.equal(false);
    man.calls.list[1].resolve();
    await until(() => shown(countOf(itemsHead())), 3000, 'number after load');
    await closeAll();

    // a list error
    const bl = createMockAdapter({ collections: true });
    const realList = bl.list;
    let failList = false;
    bl.list = (req) => (failList ? Promise.reject(Object.assign(new Error('x'), { code: 'server' })) : realList(req));
    r = await openReady({ adapter: bl });
    failList = true;
    search('Bộ sưu tập');
    await until(() => stripShown() && !q('.td-media-picker__error').hidden, 3000, 'strip + error');
    expect(shown(itemsHead())).to.equal(true);
    expect(shown(countOf(itemsHead())), 'no number on an error').to.equal(false);
  });

  it('4b. the grid heading text follows selection.kinds: video / file → Video / File, everything else → Ảnh; labels override', async () => {
    for (const [kinds, text] of [[['video'], 'Video'], [['file'], 'File'], [['image'], 'Ảnh'], [['image', 'video'], 'Ảnh'], [undefined, 'Ảnh']]) {
      const r = await openReady({ selection: kinds ? { kinds } : {} }, { collections: true });
      search('a');
      await until(() => stripShown(), 3000, 'strip');
      await pageSettled(r.ad);
      expect(itemsHead().firstChild.nodeValue, JSON.stringify(kinds)).to.equal(text);
      await closeAll();
    }
    const r = await openReady({ messages: { itemsHeading: 'Media', collectionsMore: '{n} +' } }, { collections: { count: 25 } });
    await searchStrip(r.ad, 'anh');
    expect(itemsHead().firstChild.nodeValue).to.equal('Media');
    expect(countOf(collsHead()).textContent).to.equal('20 +');
  });

  it('5. a session without collections has none of the new DOM', async () => {
    const { ad } = await openReady();
    search('anh');
    await pageSettled(ad);
    expect(!!q('.td-media-picker__items-heading') || !!q('.td-media-picker__section-count') || !!q('.td-media-picker__colls')).to.equal(false);
    const kids = [...q('.td-media-picker__results').children].map((el) => el.className);
    expect(kids).to.deep.equal(['td-sr-only td-media-picker__results-heading', 'td-media-picker__grid td-media-grid', 'td-media-picker__skeleton',
      'td-media-picker__empty', 'td-media-picker__error']);
  });

  it('6. the offset layer is not clipped by the scrolling strip (first card, and after scrolling to the last)', async () => {
    const { ad } = await openReady({}, { collections: { count: 8 } });
    await searchStrip(ad, 'anh');
    const list = stripList();
    expect(list.scrollWidth, 'the strip overflows').to.be.greaterThan(list.clientWidth);
    const b = card('c1');
    const cover = coverOf(b);
    const pseudo = cs(cover, '::before');
    expect(pseudo.content).to.not.equal('none');
    expect(pseudo.borderTopColor).to.equal(resolved('var(--td-color-border-strong)'));
    expect(cs(b).isolation).to.equal('isolate');
    const topOk = (c) => c.getBoundingClientRect().top - 6 >= list.getBoundingClientRect().top;
    expect(topOk(cover), 'layer inside the strip').to.equal(true);
    expect(list.scrollTop, 'no vertical scroll').to.equal(0);
    list.scrollLeft = list.scrollWidth;
    await frames(2);
    const lastCover = coverOf(card('c8'));
    expect(topOk(lastCover), 'last card too').to.equal(true);
    expect(list.scrollTop).to.equal(0);
    expect(cards().every((x) => !x.hasAttribute('style') && !coverOf(x).hasAttribute('style')), 'no inline style (CSP)').to.equal(true);
  });

  it('7. the card button has no chrome of its own; the cover has the 1px border', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    const b = card('c1');
    expect(cs(b).boxShadow).to.equal('none');
    expect(cs(b).overflow).to.equal('visible');
    expect(cs(b).borderTopWidth).to.equal('0px');
    expect(cs(coverOf(b)).borderTopWidth).to.equal('1px');
    expect(cs(coverOf(b)).borderTopColor).to.equal(resolved('var(--td-color-border)'));
  });

  it('8. forced-colors: the layer and the cover use system colours; the focus ring is an outline (Chromium)', async function () {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    await emulateMedia({ forcedColors: 'active' }).catch(() => {});
    await frames(2);
    if (IS_WEBKIT || !/Chrome\//.test(navigator.userAgent) || !matchMedia('(forced-colors: active)').matches) { this.skip(); return; }
    const b = card('c1');
    const ct = resolved('CanvasText');
    expect(cs(coverOf(b), '::before').borderTopColor).to.equal(ct);
    expect(cs(coverOf(b)).borderTopColor).to.equal(ct);
    b.focus();
    b.matches(':focus-visible') || await sendKeys({ press: TAB });
    await frames(2);
    expect(cs(b).outlineStyle).to.not.equal('none');
  });

  it('10. pressed: the cover border turns accent and the tint exists only while pressed', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    const b = card('c1');
    const cover = coverOf(b);
    expect(cs(cover, '::after').content, 'no pseudo at rest').to.not.equal('""');
    b.setAttribute('data-td-pressed', '');
    await frames(2);
    expect(cs(cover).borderTopColor).to.equal(resolved('var(--td-media-picker-card-hover)'));
    expect(cs(cover, '::after').content).to.equal('""');
    expect(cs(cover, '::after').backgroundColor).to.equal(resolved('var(--td-color-pressed)', 'backgroundColor'));
    b.removeAttribute('data-td-pressed');
    await frames(2);
    expect(cs(cover, '::after').content).to.not.equal('""');
  });

  it('11. 360px: the cards are 120px, the strip scrolls, the headings and the page do not overflow', async () => {
    await setViewport({ width: 360, height: 740 });
    const { ad } = await openReady({}, { collections: { count: 8 } });
    await searchStrip(ad, 'anh');
    expect(Math.round(card('c1').getBoundingClientRect().width)).to.equal(120);
    expect(stripList().scrollWidth).to.be.greaterThan(stripList().clientWidth);
    for (const h of [collsHead(), itemsHead()]) expect(h.scrollWidth <= h.clientWidth + 1, 'heading fits').to.equal(true);
    const res = q('.td-media-picker__results');
    expect(res.scrollWidth <= res.clientWidth + 1, 'results do not scroll sideways').to.equal(true);
    expect(document.documentElement.scrollWidth <= window.innerWidth + 1).to.equal(true);
  });

  it('12. a11y: the list is named by the Album heading ("Album 4"), the cards keep their label, Enter enters', async () => {
    const { ad } = await openReady({}, { collections: true });
    await searchStrip(ad, 'anh');
    expect(stripList().getAttribute('aria-labelledby')).to.equal(collsHead().id);
    expect(collsHead().textContent.trim()).to.equal('Album 4');
    expect(card('c1').getAttribute('aria-label')).to.equal('Bộ sưu tập 1, 15 ảnh');
    card('c1').focus();
    await sendKeys({ press: 'Enter' });
    await until(() => inColl() && lastList(ad).collectionId === 'c1', 3000, 'inside c1');
  });
});
