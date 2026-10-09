import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.36.0 (plan QĐ 49–52, 55, 69) — media picker below 1024: one-row toolbar + filter sheet (sheet-session model),
// pager under the grid below 720, one-row footer, auto preview ≥ 720 (never auto-select).
// Chromium + Firefox + WebKit; waits on real signals (rAF-polled state, adapter call counts), never fixed sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter, assetFields } = await import('../../test/fixtures/media-adapter.js');

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const sheet = () => [...document.body.querySelectorAll(':scope > .td-media-picker-filters')].find((r) => r.getAttribute('data-state') === 'open') || null;
const q = (sel) => pickerRoot()?.querySelector(sel) || null;
const grid = () => q('td-media-grid');
const item = (id) => pickerRoot()?.querySelector(`[data-td-media-item][data-id="${id}"]`) || null;
const host = () => document.querySelector('td-media-picker');
const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const detailName = () => q('.td-media-picker__detail-name')?.textContent || '';

async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  // v0.62.0: the dialog enters with scale(0.95) / translateY(100%) — measure only once that motion has finished
  await until(() => getComputedStyle(pickerRoot().querySelector('.td-media-picker__dialog')).transform === 'none', 4000, 'open motion');
  await until(() => grid() && grid().querySelector('[data-td-media-item]'), 4000, 'first page');
  await until(() => !q('.td-media-picker__facets').hidden || ad.calls.facets.length > 0, 4000, 'facets');
  await until(() => q('.td-media-picker__facet'), 4000, 'facet controls');
  return { ad, promise };
}
/** settle: every running animation finished (sheet enter, card fades) */
async function settle() {
  await raf();
  await until(() => document.getAnimations().every((a) => a.playState !== 'running'), 4000, 'animations');
}

afterEach(async () => {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
  await setViewport({ width: 1280, height: 800 });
});

describe('v0.36.0 picker toolbar < 1024 + filter sheet', () => {
  it('360: ONE toolbar row (≤ 56px): upload · search · Bộ lọc; facets hidden; pager under the grid; header ≤ 56; footer ≤ 64', async () => {
    await setViewport({ width: 360, height: 780 });
    await openReady({ selection: { mode: 'multiple' }, pageSize: 20 });
    await settle();
    const tb = q('.td-media-picker__toolbar');
    expect(tb.offsetHeight, 'toolbar height').to.be.at.most(56);
    expect(visible(q('.td-media-picker__filter-btn'))).to.equal(true);
    expect(visible(q('.td-media-picker__facets'))).to.equal(false);
    const pager = q('.td-media-picker__pager');
    expect(pager.parentElement).to.equal(q('.td-media-picker__results'));
    expect(q('.td-modal__header').offsetHeight).to.be.at.most(56);
    expect(q('.td-media-picker__footer').offsetHeight).to.be.at.most(64);
    const cards = [...pickerRoot().querySelectorAll('[data-td-media-item]')];
    const r = q('.td-media-picker__results').getBoundingClientRect();
    const full = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.top >= r.top - 1 && b.bottom <= r.bottom + 1; });
    expect(full.length, 'cards fully visible at 360×780').to.be.at.least(4);
  });

  for (const w of [720, 768, 1023]) {
    it(`${w}px: one row — upload · search · Bộ lọc · pager (facets behind the sheet trigger, none clipped)`, async () => {
      await setViewport({ width: w, height: 1024 });
      await openReady({ selection: { mode: 'multiple' }, pageSize: 20 });
      await until(() => !q('.td-media-picker__pager').hidden, 4000, 'pager');
      const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      const row = mid(q('.td-media-picker__search'));
      for (const sel of ['.td-media-picker__upload-btn', '.td-media-picker__filter', '.td-media-picker__pager']) {
        expect(Math.abs(mid(q(sel)) - row) < 12, `${sel} mid ${mid(q(sel))} vs ${row}`).to.equal(true);
      }
      expect(q('.td-media-picker__pager').parentElement).to.equal(q('.td-media-picker__filters'));
      expect(visible(q('.td-media-picker__facets'))).to.equal(false);
      const tb = q('.td-media-picker__toolbar');
      expect(tb.scrollWidth <= tb.clientWidth + 1, `toolbar ${tb.scrollWidth} > ${tb.clientWidth}`).to.equal(true);
    });
  }

  it('sheet session: edits only touch the draft; Áp dụng = one list request + toolbar controls + badge; equal draft = 0', async () => {
    await setViewport({ width: 768, height: 1024 });
    const { ad } = await openReady({ selection: { mode: 'multiple' } });
    q('.td-media-picker__filter-btn').click();
    await until(() => sheet(), 4000, 'sheet open');
    const lists = ad.calls.list.length;
    // the sheet's album control (a NEW td-dropdown) → pick the first real album
    const dd = sheet().querySelector('.td-media-picker__facet[data-type="single"] td-dropdown');
    const opt = dd.options[1];
    dd.setValue(opt.value);
    dd.dispatchEvent(new Event('change', { bubbles: true }));
    await raf();
    expect(ad.calls.list.length, 'draft only').to.equal(lists);
    expect(q('.td-media-picker__filter-count').hidden, 'badge = committed').to.equal(true);
    sheet().querySelector('.td-media-picker-filters__apply').click();
    await until(() => ad.calls.list.length === lists + 1, 4000, 'one list request');
    await until(() => !sheet(), 4000, 'sheet closed');
    expect(q('.td-media-picker__filter-count').hidden).to.equal(false);
    expect(q('.td-media-picker__filter-count').textContent).to.equal('1');
    expect(q('.td-media-picker__filter-btn').getAttribute('aria-label')).to.contain('1');
    // the toolbar control carries the committed value (visible ≥ 1024)
    const toolbarDd = q('.td-media-picker__facets .td-media-picker__facet[data-type="single"] td-dropdown');
    expect(String(toolbarDd.getValue())).to.equal(String(opt.value));
    await setViewport({ width: 1280, height: 800 });
    await until(() => visible(toolbarDd), 4000, 'toolbar facets ≥ 1024');
    // same draft → no request
    await setViewport({ width: 768, height: 1024 });
    await until(() => visible(q('.td-media-picker__filter-btn')), 4000, 'button again');
    q('.td-media-picker__filter-btn').click();
    await until(() => sheet(), 4000, 'sheet again');
    const before = ad.calls.list.length;
    sheet().querySelector('.td-media-picker-filters__apply').click();
    await until(() => !sheet(), 4000, 'closed');
    await raf();
    expect(ad.calls.list.length).to.equal(before);
  });

  it('ISSUE-1: descriptors queued while the sheet is open + Áp dụng → exactly 1 list + 1 facet request; a removed facet is not restored', async () => {
    await setViewport({ width: 768, height: 1024 });
    const { ad } = await openReady({ selection: { mode: 'multiple' } });
    q('.td-media-picker__filter-btn').click();
    await until(() => sheet(), 4000, 'sheet');
    // the draft picks an album …
    const dd = sheet().querySelector('.td-media-picker__facet[data-key="album"] td-dropdown');
    dd.setValue(dd.options[1].value);
    dd.dispatchEvent(new Event('change', { bubbles: true }));
    // … and "Chỉ của tôi"
    const tg = sheet().querySelector('.td-media-picker__facet[data-key="scope"] td-toggle');
    tg.setAttribute('checked', '');
    tg.dispatchEvent(new Event('change', { bubbles: true }));
    // … while new descriptors arrive WITHOUT the album facet (queued: the sheet is open)
    const original = ad.facets;
    ad.facets = (req) => original(req).then((list) => list.filter((f) => f.key !== 'album'));
    host()._loadFacets({ fresh: true }); // a descriptor reload, as after an upload / search
    await until(() => ad.calls.facets.length > 0 && host()._s.pendingFacets, 4000, 'descriptors queued');
    const lists = ad.calls.list.length;
    const facets = ad.calls.facets.length;
    sheet().querySelector('.td-media-picker-filters__apply').click();
    await until(() => !sheet(), 4000, 'closed');
    await until(() => ad.calls.list.length > lists, 4000, 'list');
    for (let i = 0; i < 30; i++) await raf(); // nothing else may follow
    expect(ad.calls.list.length - lists, 'list requests').to.equal(1);
    expect(ad.calls.facets.length - facets, 'facet requests').to.equal(1);
    const req = ad.calls.list.at(-1).args[0];
    expect(req.filters && 'album' in req.filters, 'removed facet not restored').to.equal(false);
    expect(req.filters && req.filters.scope).to.equal('mine');
    expect(q('.td-media-picker__filter-count').textContent).to.equal('1');
    expect(q('.td-media-picker__facet[data-key="album"]')).to.equal(null);
  });

  for (const [title, initialFilters, key, newType, want] of [
    ['compatible (album single → multiple): the draft value is normalised to [1]', { album: 1 }, 'album', 'multiple', [1]],
    ['incompatible (tags multiple → single): the old-type draft value is dropped', { tags: ['hero'] }, 'tags', 'single', undefined],
  ]) {
    it(`ISSUE-6: a queued descriptor changes a facet type — ${title}; still 1 facet + 1 list request`, async () => {
      await setViewport({ width: 768, height: 1024 });
      const ad0 = createMockAdapter();
      for (const a of ad0.db.values()) a.metadata.tags = ['hero']; // results exist under the tags filter
      const { ad } = await openReady({ selection: { mode: 'multiple' }, initialFilters, adapter: ad0 });
      q('.td-media-picker__filter-btn').click();
      await until(() => sheet(), 4000, 'sheet');
      const original = ad.facets;
      ad.facets = (req) => original(req).then((list) => list.map((f) => (f.key === key ? { ...f, type: newType } : f)));
      host()._loadFacets({ fresh: true });
      await until(() => host()._s.pendingFacets, 4000, 'descriptors queued');
      const lists = ad.calls.list.length;
      const facets = ad.calls.facets.length;
      sheet().querySelector('.td-media-picker-filters__apply').click();
      await until(() => !sheet(), 4000, 'closed');
      await until(() => ad.calls.list.length > lists, 4000, 'list');
      for (let i = 0; i < 30; i++) await raf();
      expect(ad.calls.list.length - lists, 'list requests').to.equal(1);
      expect(ad.calls.facets.length - facets, 'facet requests').to.equal(1);
      const filters = ad.calls.list.at(-1).args[0].filters || {};
      expect(filters[key]).to.deep.equal(want);
    });
  }

  it('ISSUE-7: the detail "Thêm" menu keeps the default dismissal — an outside click closes it AND passes through', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady({ selection: { mode: 'multiple' }, assetFields: assetFields(),
      capabilities: { delete: true, downloadOriginal: true, copyLink: true } });
    item('m60').querySelector('[data-td-media-open]').click();
    await until(() => pickerRoot().getAttribute('data-view') === 'detail' && q('.td-media-picker__detail-more'), 4000, 'pane');
    q('.td-media-picker__detail-more button').click();
    await until(() => document.querySelector('.td-menu[data-state="open"]'), 4000, 'menu');
    const target = q('.td-media-picker__detail-name');
    let reached = 0;
    const count = () => { reached++; };
    target.addEventListener('pointerdown', count);
    target.addEventListener('click', count);
    const r = target.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'mouse', isPrimary: true,
      button: 0, clientX: r.left + 4, clientY: r.top + 4 };
    target.dispatchEvent(new PointerEvent('pointerdown', o));
    target.dispatchEvent(new PointerEvent('pointerup', o));
    target.dispatchEvent(new MouseEvent('click', { ...o, detail: 1 }));
    await raf();
    expect(!!document.querySelector('.td-menu[data-state="open"]'), 'menu closed').to.equal(false);
    expect(reached, 'pointerdown + click reached the page').to.equal(2);
  });

  it('Xoá lọc changes only the draft; Escape discards it (committed untouched, no request, controls destroyed)', async () => {
    await setViewport({ width: 768, height: 1024 });
    const { ad } = await openReady({ selection: { mode: 'multiple' }, initialFilters: { album: 1 } });
    await until(() => q('.td-media-picker__filter-count') && !q('.td-media-picker__filter-count').hidden, 4000, 'badge 1');
    q('.td-media-picker__filter-btn').click();
    await until(() => sheet(), 4000, 'sheet');
    const lists = ad.calls.list.length;
    sheet().querySelector('.td-media-picker-filters__clear').click();
    await raf();
    expect(sheet(), 'sheet stays open').to.not.equal(null);
    expect(ad.calls.list.length).to.equal(lists);
    const sheetDd = sheet().querySelector('td-dropdown, td-toggle');
    await sendKeys({ press: 'Escape' });
    await until(() => !sheet(), 4000, 'closed');
    expect(ad.calls.list.length).to.equal(lists);
    expect(q('.td-media-picker__filter-count').textContent).to.equal('1');
    // the destroyed sheet control never reaches the picker
    if (sheetDd) sheetDd.dispatchEvent(new Event('change', { bubbles: true }));
    await raf();
    expect(ad.calls.list.length).to.equal(lists);
  });

  it('closing the picker while the sheet is open → the sheet goes too; committed state is not touched', async () => {
    await setViewport({ width: 768, height: 1024 });
    const { promise } = await openReady({ selection: { mode: 'multiple' } });
    q('.td-media-picker__filter-btn').click();
    await until(() => sheet(), 4000, 'sheet');
    host().close('programmatic');
    const out = await promise;
    expect(out.status).to.equal('cancelled');
    await until(() => !document.body.querySelector(':scope > .td-media-picker-filters'), 4000, 'sheet gone');
  });
});

describe('v0.36.0 picker auto preview (QĐ 69)', () => {
  it('≥ 720: open → the first asset is previewed (viewing ring) but NOT selected; Chèn disabled', async () => {
    await openReady({ selection: { mode: 'single' } });
    await until(() => detailName() === 'anh-60.jpg', 4000, 'auto preview');
    expect(item('m60').hasAttribute('data-viewing')).to.equal(true);
    expect(grid().selectedIds).to.deep.equal([]);
    expect(q('.td-media-picker__confirm').hasAttribute('disabled')).to.equal(true);
    expect(pickerRoot().getAttribute('data-view')).to.equal('grid');
  });

  it('search: a viewed asset still in the results is kept; otherwise the first new asset is previewed', async () => {
    await openReady({ selection: { mode: 'multiple' } });
    await until(() => detailName() === 'anh-60.jpg', 4000, 'auto preview');
    item('m58').querySelector('[data-td-media-open]').click();
    await until(() => detailName() === 'anh-58.jpg', 4000, 'user view');
    const input = q('.td-media-picker__search input');
    input.focus();
    await sendKeys({ type: 'anh-5' });
    await sendKeys({ press: 'Enter' });
    await until(() => !item('m60') && item('m58'), 4000, 'filtered results');
    await raf();
    expect(detailName(), 'm58 still listed → kept').to.equal('anh-58.jpg');
    input.select();
    await sendKeys({ type: 'anh-3' });
    await sendKeys({ press: 'Enter' });
    await until(() => !item('m58') && item('m39'), 4000, 'new results');
    await until(() => detailName() === 'anh-39.jpg', 4000, 'first of the new results');
    expect(grid().selectedIds).to.deep.equal([]);
  });

  it('ISSUE-2: viewed asset gone → the first SELECTED asset still in the results is previewed (selection untouched)', async () => {
    await openReady({ selection: { mode: 'multiple' } });
    await until(() => detailName() === 'anh-60.jpg', 4000, 'auto preview');
    item('m35').querySelector('.td-media-grid__tick').click(); // select m35 (not viewed)
    await until(() => grid().selectedIds.includes('m35'), 4000, 'selected');
    item('m59').querySelector('[data-td-media-open]').click();
    await until(() => detailName() === 'anh-59.jpg', 4000, 'view m59');
    const input = q('.td-media-picker__search input');
    input.focus();
    await sendKeys({ type: 'anh-3' }); // m59 leaves the results, m35 stays (first result is m39)
    await sendKeys({ press: 'Enter' });
    await until(() => !item('m59') && item('m35'), 4000, 'filtered');
    await until(() => detailName() === 'anh-35.jpg', 4000, 'first selected previewed');
    expect(grid().selectedIds).to.deep.equal(['m35']);
  });

  it('ISSUE-2: an empty result clears the detail (empty state, nothing viewed)', async () => {
    await openReady({ selection: { mode: 'multiple' } });
    await until(() => detailName() === 'anh-60.jpg', 4000, 'auto preview');
    const input = q('.td-media-picker__search input');
    input.focus();
    await sendKeys({ type: 'khong-co-gi' });
    await sendKeys({ press: 'Enter' });
    await until(() => q('.td-media-picker__detail').getAttribute('data-state') === 'empty', 4000, 'detail emptied');
    expect(pickerRoot().querySelectorAll('[data-viewing]').length).to.equal(0);
    expect(pickerRoot().hasAttribute('data-detail-empty')).to.equal(true);
  });

  it('ISSUE-4: 768 — the detail column is collapsed while nothing is viewed and comes back with a preview', async () => {
    await setViewport({ width: 768, height: 1024 });
    await openReady({ selection: { mode: 'multiple' } });
    const det = q('.td-media-picker__detail');
    await until(() => detailName() === 'anh-60.jpg', 4000, 'auto preview');
    expect(getComputedStyle(det).display).to.not.equal('none');
    const input = q('.td-media-picker__search input');
    input.focus();
    await sendKeys({ type: 'khong-co-gi' });
    await sendKeys({ press: 'Enter' });
    await until(() => getComputedStyle(det).display === 'none', 4000, 'collapsed on an empty result');
    input.select();
    await sendKeys({ type: 'anh-4' });
    await sendKeys({ press: 'Enter' });
    await until(() => detailName() === 'anh-49.jpg' && getComputedStyle(det).display !== 'none', 4000, 'back with a preview');
  });

  it('ISSUE-3: < 720 the back arrow sits in the dialog header only while the pane is open; ≤ 3 actions inline, the rest in "Thêm"', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady({ selection: { mode: 'multiple' }, assetFields: assetFields(),
      capabilities: { delete: true, downloadOriginal: true, copyLink: true } });
    const back = q('.td-modal__header .td-media-picker__back');
    expect(visible(back), 'hidden on the grid').to.equal(false);
    item('m60').querySelector('[data-td-media-open]').click();
    await until(() => pickerRoot().getAttribute('data-view') === 'detail' && detailName() === 'anh-60.jpg', 4000, 'pane');
    await until(() => visible(back), 4000, 'back shown');
    const actions = q('.td-media-picker__detail-actions');
    const shownKids = [...actions.children].filter(visible);
    expect(shownKids.length, 'at most 3 inline + "Thêm"').to.be.at.most(4);
    const more = q('.td-media-picker__detail-more');
    expect(visible(more), '"Thêm" shown').to.equal(true);
    more.querySelector('button').click();
    await until(() => document.querySelector('.td-menu[data-state="open"]'), 4000, 'menu');
    const items = [...document.querySelectorAll('.td-menu[data-state="open"] .td-menu__item')].map((n) => n.textContent.trim());
    expect(items.length).to.be.at.least(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    back.click();
    await until(() => pickerRoot().getAttribute('data-view') === 'grid', 4000, 'grid');
  });

  it('ISSUE-5: footer chip "n đã chọn ×" — one button; label + accessible name follow every selection change', async () => {
    await openReady({ selection: { mode: 'multiple', maxItems: 5 } });
    const chip = q('.td-media-picker__clear');
    expect(chip.hidden, 'no chip at 0').to.equal(true);
    item('m60').querySelector('.td-media-grid__tick').click();
    await until(() => !chip.hidden, 4000, 'chip');
    expect(chip.textContent.trim()).to.equal('1/5 đã chọn');
    expect(chip.querySelector('button').getAttribute('aria-label')).to.equal('Bỏ chọn tất cả (1/5 đã chọn)');
    item('m59').querySelector('.td-media-grid__tick').click();
    await until(() => chip.textContent.trim() === '2/5 đã chọn', 4000, 'label updated');
    expect(chip.querySelector('button').getAttribute('aria-label')).to.equal('Bỏ chọn tất cả (2/5 đã chọn)');
    expect(pickerRoot().querySelectorAll('.td-media-picker__selbar > *:not([hidden])').length, 'one control').to.equal(1);
    chip.querySelector('button').click();
    await until(() => grid().selectedIds.length === 0 && chip.hidden, 4000, 'cleared');
  });

  it('< 720: no auto-open (the grid comes first)', async () => {
    await setViewport({ width: 390, height: 844 });
    const { ad } = await openReady({ selection: { mode: 'single' } });
    await raf();
    await raf();
    expect(pickerRoot().getAttribute('data-view')).to.equal('grid');
    expect(ad.calls.get.length).to.equal(0);
    expect(q('.td-media-picker__detail').getAttribute('data-state')).to.equal('empty');
  });
});
