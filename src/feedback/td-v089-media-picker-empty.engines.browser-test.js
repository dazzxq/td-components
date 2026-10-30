import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';

// v0.89.0 (plan docs/internal/plans/v0.89.0-media-picker-empty.md) — the grid / detail panes' empty states in Chromium,
// Firefox AND WebKit: (a) filtered (title, hint naming the filters, "Xoá bộ lọc" = ONE atomic reset), (b) library empty
// with / without upload ("Tải ảnh lên" opens the toolbar's upload dialog), (c) loading = skeleton only, the legacy
// `empty` / `emptyHint` overrides (messages + TdMediaPicker.labels), and the centring of both panes (wide + narrow).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

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
const empty = () => q('.td-media-picker__empty');
const emptyShown = () => !!empty() && !empty().hidden;
const actionBtns = () => [...(empty()?.querySelectorAll('.td-empty-state__actions button') || [])];
const actionsHidden = () => empty().querySelector('.td-empty-state__actions').hidden;
const searchInput = () => q('.td-media-picker__search input');
const facet = (key) => q(`.td-media-picker__facet[data-key="${key}"]`);
const uploadRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker-upload')].find((r) => r.getAttribute('data-state') !== 'closing') || null;

async function openSettled(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => getComputedStyle(pickerRoot().querySelector('.td-media-picker__dialog')).transform === 'none', 4000, 'open motion');
  const dialog = q('.td-media-picker__dialog');
  let done = false;
  Promise.all(dialog.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => { done = true; });
  await until(() => done, 4000, 'open transition finished');
  await until(() => items().length > 0 || emptyShown(), 4000, 'first page');
  return { ad, promise, root: pickerRoot() };
}

async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal, :scope > .td-media-picker-upload'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 1280, height: 800 });
});

/** Override TdMediaPicker.labels[k] for one test (restored afterwards). */
function setLabel(k, v) {
  const had = Object.prototype.hasOwnProperty.call(TdMediaPicker.labels, k);
  const old = TdMediaPicker.labels[k];
  TdMediaPicker.labels[k] = v;
  extra.push(() => { if (had) TdMediaPicker.labels[k] = old; else delete TdMediaPicker.labels[k]; });
}

/** The visible block of an empty state (icon tile → last visible row), as a rect. */
function blockRect(host) {
  const parts = [...host.querySelector('.td-empty-state').children].filter((el) => !el.hidden);
  const rs = parts.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rs.map((r) => r.top));
  const bottom = Math.max(...rs.map((r) => r.bottom));
  const left = Math.min(...rs.map((r) => r.left));
  const right = Math.max(...rs.map((r) => r.right));
  return { cx: (left + right) / 2, cy: (top + bottom) / 2 };
}
function expectCentred(host, pane, what) {
  const b = blockRect(host);
  const p = pane.getBoundingClientRect();
  const px = p.left + p.width / 2;
  const py = p.top + p.height / 2;
  expect(Math.abs(b.cx - px) <= 2, `${what}: x ${b.cx} vs pane ${px}`).to.equal(true);
  expect(Math.abs(b.cy - py) <= 2, `${what}: y ${b.cy} vs pane ${py}`).to.equal(true);
}

describe('v0.89 td-media-picker — filtered empty state (a)', () => {
  it('title, hint naming the keyword + filters (labels from the facet descriptors), "Xoá bộ lọc"', async () => {
    await openSettled({ initialQuery: 'abc', initialFilters: { album: 2, scope: 'mine' } }, { count: 0 });
    expect(empty().getAttribute('data-variant')).to.equal('filtered');
    expect(empty().getAttribute('title')).to.equal('Không tìm thấy ảnh phù hợp');
    await until(() => empty().getAttribute('message') === 'Đang lọc: Từ khoá "abc" · Album: Tin tức · Chỉ của tôi', 4000,
      `hint (${empty().getAttribute('message')})`);
    expect(empty().querySelector('.td-empty-state__message').textContent).to.equal('Đang lọc: Từ khoá "abc" · Album: Tin tức · Chỉ của tôi');
    expect(actionBtns().map((b) => b.textContent)).to.deep.equal(['Xoá bộ lọc']);
  });

  it('more than 3 items → "và N bộ lọc khác"; a keyword over 40 chars is cut with "…"; text only', async () => {
    const long = `<b>${'x'.repeat(50)}`;
    await openSettled({ initialQuery: long, initialFilters: { album: 1, scope: 'mine', tags: ['hero', 'banner'] } }, { count: 0 });
    const want = `Đang lọc: Từ khoá "${long.slice(0, 40)}…" · Album: Sản phẩm · Chỉ của tôi và 1 bộ lọc khác`;
    await until(() => empty().getAttribute('message') === want, 4000, `hint (${empty().getAttribute('message')})`);
    expect(empty().querySelector('.td-empty-state__message b'), 'never parsed as HTML').to.equal(null);
  });

  it('a filter without a descriptor → its key; the hint follows descriptors that arrive later', async () => {
    const ad = createMockAdapter({ count: 0, manual: true });
    TdMediaPicker.open({ autoSelectFirst: false, adapter: ad, initialFilters: { album: 3 } });
    await until(() => ad.calls.list.length && ad.calls.facets.length, 4000, 'list + facets requested');
    ad.calls.list[0].resolve();
    await until(emptyShown, 4000, 'empty');
    expect(empty().getAttribute('message')).to.equal('Đang lọc: album');
    ad.calls.facets[0].resolve();
    await until(() => empty().getAttribute('message') === 'Đang lọc: Album: Thương hiệu', 4000, 'hint after descriptors');
  });

  it('"Xoá bộ lọc" → ONE list request (page 1, no query, no filters), input empty, controls reset, badge 0, focus on search', async () => {
    const { ad } = await openSettled({ initialFilters: { album: 2, scope: 'mine', tags: ['hero'] } }, { count: 0 });
    await until(() => facet('album') && facet('scope') && facet('tags'), 4000, 'facet controls');
    await until(() => actionBtns().length === 1, 4000, 'action');
    // a pending (debounced) search edit must not fire a second request afterwards
    const host = q('.td-media-picker__search');
    host.value = 'abc';
    host.dispatchEvent(new Event('input', { bubbles: true }));
    const lists = ad.calls.list.length;
    const facetsBefore = ad.calls.facets.length;
    actionBtns()[0].click();
    expect(document.activeElement === searchInput(), 'focus on the search input').to.equal(true);
    expect(searchInput().value).to.equal('');
    await until(() => ad.calls.list.length > lists, 4000, 'reload');
    await wait(400); // past the 250 ms search debounce
    expect(ad.calls.list.length - lists, 'exactly one list request').to.equal(1);
    expect(ad.calls.facets.length - facetsBefore, 'one facet reload').to.equal(1);
    const req = ad.calls.list[ad.calls.list.length - 1].args[0];
    expect(req.query || '').to.equal('');
    expect(Object.keys(req.filters || {})).to.deep.equal([]);
    expect(req.cursor ?? null).to.equal(null);
    // controls back to their defaults
    expect(facet('album').querySelector('td-dropdown').getValue()).to.equal('');
    expect(facet('scope').querySelector('td-toggle').hasAttribute('checked')).to.equal(false);
    expect(facet('tags').querySelector('td-chip-input').getValue().length).to.equal(0);
    expect(q('.td-media-picker__filter-count').hidden).to.equal(true);
    // the library is empty → variant (b) now
    await until(() => emptyShown() && empty().getAttribute('data-variant') === 'library', 4000, 'library variant');
    expect(empty().getAttribute('title')).to.equal('Chưa có ảnh nào');
  });
});

describe('v0.89 td-media-picker — library empty state (b)', () => {
  it('with upload: hint "Tải ảnh lên để bắt đầu", action "Tải ảnh lên" opens the toolbar\'s upload dialog', async () => {
    await openSettled({}, { count: 0 });
    expect(empty().getAttribute('data-variant')).to.equal('library');
    expect(empty().getAttribute('title')).to.equal('Chưa có ảnh nào');
    expect(empty().getAttribute('message')).to.equal('Tải ảnh lên để bắt đầu');
    expect(actionBtns().map((b) => b.textContent)).to.deep.equal(['Tải ảnh lên']);
    expect(actionBtns()[0].classList.contains('td-btn--primary')).to.equal(true);
    actionBtns()[0].click();
    await until(() => uploadRoot(), 4000, 'upload dialog');
    expect(document.body.querySelectorAll(':scope > .td-media-picker-upload').length).to.equal(1);
  });

  it('without upload: another hint, no action', async () => {
    await openSettled({}, { count: 0, upload: false, uploadFromUrl: false });
    expect(q('.td-media-picker__upload-btn')).to.equal(null);
    expect(empty().getAttribute('title')).to.equal('Chưa có ảnh nào');
    expect(empty().getAttribute('message')).to.equal('Ảnh tải lên sẽ hiện ở đây');
    expect(actionBtns().length).to.equal(0);
    expect(actionsHidden()).to.equal(true);
  });
});

describe('v0.89 td-media-picker — loading (c)', () => {
  it('skeleton while the list loads, never the empty state; empty once the (empty) page arrives', async () => {
    const ad = createMockAdapter({ count: 0, manual: true });
    TdMediaPicker.open({ autoSelectFirst: false, adapter: ad });
    await until(() => ad.calls.list.length, 4000, 'list requested');
    expect(q('.td-media-picker__skeleton').hidden).to.equal(false);
    expect(empty().hidden).to.equal(true);
    ad.calls.list[0].resolve();
    await until(emptyShown, 4000, 'empty');
    expect(q('.td-media-picker__skeleton').hidden).to.equal(true);
  });
});

describe('v0.89 td-media-picker — legacy `empty` / `emptyHint` overrides', () => {
  it('messages: `empty` → library title, `emptyHint` → filtered hint (verbatim)', async () => {
    await openSettled({ messages: { empty: 'Thư viện trống', emptyHint: 'Thử từ khác' } }, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('Thư viện trống');
    expect(empty().getAttribute('message')).to.equal('Tải ảnh lên để bắt đầu'); // (b) hint: new key only
    await closeAll();
    await openSettled({ initialQuery: 'abc', messages: { empty: 'Thư viện trống', emptyHint: 'Thử từ khác' } }, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('Không tìm thấy ảnh phù hợp'); // (a) title: new key only
    expect(empty().getAttribute('message')).to.equal('Thử từ khác');
  });

  it('messages: the new key wins over the old one; a new hint template gets {filters}', async () => {
    await openSettled({ initialQuery: 'abc', messages: { emptyHint: 'cũ', emptyFilteredHint: 'Lọc: {filters}' } }, { count: 0 });
    expect(empty().getAttribute('message')).to.equal('Lọc: Từ khoá "abc"');
    await closeAll();
    await openSettled({ messages: { empty: 'cũ', emptyLibrary: 'mới' } }, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('mới');
  });

  it('TdMediaPicker.labels: a changed `empty` / `emptyHint` still wins over the new defaults', async () => {
    setLabel('empty', 'Nhãn trống');
    setLabel('emptyHint', 'Nhãn gợi ý');
    await openSettled({}, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('Nhãn trống');
    await closeAll();
    await openSettled({ initialQuery: 'abc' }, { count: 0 });
    expect(empty().getAttribute('message')).to.equal('Nhãn gợi ý');
  });

  it('precedence: messages (old key) > labels (changed new key) > labels (changed old key)', async () => {
    setLabel('emptyLibrary', 'Nhãn mới');
    setLabel('empty', 'Nhãn cũ');
    await openSettled({}, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('Nhãn mới');
    await closeAll();
    await openSettled({ messages: { empty: 'Lần mở' } }, { count: 0 });
    expect(empty().getAttribute('title')).to.equal('Lần mở');
  });
});

describe('v0.89 td-media-picker — centred, no card', () => {
  it('1280×800: both panes centre their empty state (±2px), no dashed border, no fill, icon in a round tile', async () => {
    await setViewport({ width: 1280, height: 800 });
    await openSettled({}, { count: 0 });
    const results = q('.td-media-picker__results');
    const detail = q('.td-media-picker__detail');
    const dEmpty = q('.td-media-picker__detail-empty');
    expect(!!dEmpty, 'detail empty state').to.equal(true);
    expectCentred(empty(), results, 'grid pane');
    expectCentred(dEmpty, detail, 'detail pane');
    expect(Math.abs(blockRect(empty()).cy - blockRect(dEmpty).cy) <= 2, 'same horizontal line').to.equal(true);
    for (const host of [empty(), dEmpty]) {
      const card = getComputedStyle(host.querySelector('.td-empty-state'));
      expect(parseFloat(card.borderTopWidth)).to.equal(0);
      expect(card.backgroundColor === 'rgba(0, 0, 0, 0)' || card.backgroundColor === 'transparent', card.backgroundColor).to.equal(true);
      const icon = host.querySelector('.td-empty-state__icon');
      const r = icon.getBoundingClientRect();
      expect(Math.abs(r.width - r.height) < 0.5 && r.width >= 64, `tile ${r.width}×${r.height}`).to.equal(true);
      expect(getComputedStyle(icon).borderTopLeftRadius).to.equal('50%');
      expect(icon.querySelector('svg').getBoundingClientRect().width).to.equal(40);
    }
  });

  it('390×844 (detail pane off-canvas): the grid pane still centres its empty state (±2px)', async () => {
    await setViewport({ width: 390, height: 844 });
    await openSettled({ initialQuery: 'abc' }, { count: 0 });
    expectCentred(empty(), q('.td-media-picker__results'), 'grid pane (narrow)');
    const r = q('.td-media-picker__results');
    expect(r.scrollWidth <= r.clientWidth + 1, 'no horizontal scroll').to.equal(true);
  });
});
