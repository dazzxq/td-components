import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.110.0 (plan v0.110.0-media-picker-load-more QĐ1-5) — `loadMore` appends the next page (sentinel + "Tải thêm"),
// single-flight among appends with reset supersession, dedupe by id, re-check after an append, `maxItems`, an append
// error keeps the cards, delete / save without a list reload, the "n/total" count from the adapter's (filtered) total,
// `pageSize: 'auto'` + `maxPageSize` measured once per reset. The default (no loadMore, numeric pageSize) is unchanged.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { createMockAdapter, assetFields } = await import('../../test/fixtures/media-adapter.js');

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
const ids = () => items().map((i) => i.getAttribute('data-id'));
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const live = () => q('.td-media-picker__live')?.textContent || '';
const more = () => q('.td-media-picker__more');
const moreBtn = () => q('.td-media-picker__more-btn');
const moreShown = () => !!more() && !more().hidden;
const count = () => q('.td-media-picker__count');
const countText = () => count()?.querySelector('[aria-hidden="true"]')?.textContent || '';
const countSpoken = () => count()?.querySelector('.td-sr-only')?.textContent || '';
const results = () => q('.td-media-picker__results');
const lastReq = (ad) => ad.calls.list.at(-1).args[0];
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const detailName = () => q('.td-media-picker__detail-name')?.textContent || '';
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const deleteDialog = () => modalRoots().find((r) => r.textContent.includes('Xác nhận xoá')) || null;
const dlgButton = (d, text) => [...d.querySelectorAll('.td-modal__footer button')].find((b) => b.textContent.trim() === text);
/** the inner button when there is one (td-button / td-action-button), else the host */
const press = (el) => (el.querySelector('button') || el).click();
const ranges = (n, from) => Array.from({ length: n }, (_, i) => `m${from - i}`);
async function search(text) {
  const f = q('.td-media-picker__search');
  f.value = text;
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => getComputedStyle(pickerRoot().querySelector('.td-media-picker__dialog')).transform === 'none', 4000, 'open motion');
  await until(() => items().length > 0 || q('.td-media-picker__empty:not([hidden])'), 4000, 'first page');
  return { ad, promise };
}
/** open with a manual adapter; resolve the first list */
async function openManual(opts = {}, adOpts = {}) {
  const ad = createMockAdapter({ manual: true, ...adOpts });
  const promise = TdMediaPicker.open({ autoSelectFirst: false, ...opts, adapter: ad });
  await until(() => ad.calls.list.length === 1, 4000, 'first list');
  ad.calls.list[0].resolve();
  await until(() => items().length > 0, 4000, 'page 1');
  return { ad, promise };
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
before(async () => { await setViewport({ width: 1280, height: 800 }); });
afterEach(closeAll);

describe('v0.110 td-media-picker — default unchanged (loadMore off)', () => {
  it('no load-more DOM, the ‹ › pager as before, limit 30, a page replaces the grid', async () => {
    const { ad } = await openReady();
    expect(pickerRoot().hasAttribute('data-load-more')).to.equal(false);
    expect(more()).to.equal(null);
    expect(count()).to.equal(null);
    expect(lastReq(ad).limit).to.equal(30);
    expect(q('.td-media-picker__page-info').textContent).to.equal('Hiển thị 1-30 / 60 media');
    q('.td-media-picker__next').click();
    await until(() => ids()[0] === 'm30', 4000, 'page 2 replaced');
    expect(items().length).to.equal(30);
  });

  it('an unknown loadMore value → warned once, off', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (m) => warns.push(String(m));
    try {
      await openReady({ loadMore: 'yes' });
    } finally {
      console.warn = orig;
    }
    expect(more()).to.equal(null);
    expect(warns.some((w) => w.includes('options.loadMore'))).to.equal(true);
  });
});

describe('v0.110 td-media-picker — loadMore append (QĐ2)', () => {
  it('button: appends in order, "n/total" + long name, live "Đã tải thêm n", focus stays, hidden at the end', async () => {
    const { ad } = await openReady({ loadMore: { trigger: 'button' }, pageSize: 20 });
    expect(pickerRoot().getAttribute('data-load-more')).to.equal('button');
    expect(q('.td-media-picker__cursor').hidden).to.equal(true);
    expect(q('td-pagination').hidden).to.equal(true);
    expect(countText()).to.equal('20/60');
    expect(countSpoken()).to.equal('Đã tải 20 trên 60 media');
    expect(moreShown()).to.equal(true);
    expect(moreBtn().getAttribute('label')).to.equal('Tải thêm');
    expect([moreBtn().getAttribute('variant'), moreBtn().getAttribute('size')]).to.deep.equal(['ghost', 'sm']);
    expect(q('.td-media-picker__sentinel').getAttribute('aria-hidden')).to.equal('true');
    const btn = moreBtn().querySelector('button');
    btn.focus();
    btn.click();
    await until(() => items().length === 40, 4000, 'page 2 appended');
    expect(lastReq(ad).cursor).to.equal('20');
    expect(ids()).to.deep.equal(ranges(40, 60));
    expect(countText()).to.equal('40/60');
    expect(live()).to.equal('Đã tải thêm 20');
    expect(document.activeElement).to.equal(btn);
    expect(results().getAttribute('aria-busy')).to.equal('false');
    btn.click();
    await until(() => items().length === 60, 4000, 'page 3 appended');
    expect(moreShown(), 'no more → hidden, no "đã hết" text').to.equal(false);
    expect(countText()).to.equal('60/60');
  });

  it('pages transport: appends page 2 by number; count from total', async () => {
    const { ad } = await openReady({ loadMore: { trigger: 'button' }, pageSize: 25, pagination: 'pages' }, { pagination: 'pages' });
    press(moreBtn());
    await until(() => items().length === 50, 4000, 'page 2');
    expect(lastReq(ad).page).to.equal(2);
    expect(ids()).to.deep.equal(ranges(50, 60));
    expect(countText()).to.equal('50/60');
    press(moreBtn());
    await until(() => items().length === 60, 4000, 'page 3');
    expect(moreShown()).to.equal(false);
  });

  it('no total → "n media"', async () => {
    await openReady({ loadMore: { trigger: 'button' }, pageSize: 20 }, { total: false });
    expect(countText()).to.equal('20 media');
    expect(countSpoken()).to.equal('20 media');
  });

  it('single-flight: two quick clicks → ONE request (button loading); resolve → 40 (not 60)', async () => {
    const { ad } = await openManual({ loadMore: { trigger: 'button' }, pageSize: 20 });
    press(moreBtn());
    press(moreBtn());
    await wait(30);
    expect(ad.calls.list.length).to.equal(2);
    expect(moreBtn().hasAttribute('loading')).to.equal(true);
    expect(results().getAttribute('aria-busy')).to.equal('true');
    ad.calls.list[1].resolve();
    await until(() => items().length === 40, 4000, 'appended');
    await wait(30);
    expect(ad.calls.list.length).to.equal(2);
    expect(moreBtn().hasAttribute('loading')).to.equal(false);
  });

  it('a reset wins: a search aborts the append in flight; page 1 of the new query replaces the grid; the late append is dropped', async () => {
    const { ad } = await openManual({ loadMore: { trigger: 'button' }, pageSize: 20 });
    ad.ignoreSignal = true; // an adapter that never honours the signal: the kit still drops the result
    press(moreBtn());
    await until(() => ad.calls.list.length === 2, 4000, 'append started');
    const append = ad.calls.list[1];
    await search('anh-1');
    await until(() => ad.calls.list.length === 3, 4000, 'reset request');
    expect(append.signal.aborted).to.equal(true);
    expect(lastReq(ad).cursor).to.equal(null);
    expect(moreBtn().hasAttribute('loading'), 'the append state is cleared').to.equal(false);
    ad.calls.list[2].resolve();
    await until(() => items().length > 0 && items().length < 20, 4000, 'filtered page 1');
    const filtered = ids();
    append.resolve();
    await wait(50);
    expect(ids()).to.deep.equal(filtered);
    expect(countText(), 'the filtered total').to.equal(`${filtered.length}/${filtered.length}`);
    expect(results().scrollTop).to.equal(0);
  });

  it('dedupe by id: a page repeating shown cards adds only the new ones', async () => {
    const { ad } = await openManual({ loadMore: { trigger: 'button' }, pageSize: 4 });
    expect(ids()).to.deep.equal(['m60', 'm59', 'm58', 'm57']);
    press(moreBtn());
    await until(() => ad.calls.list.length === 2, 4000, 'append');
    const mk = (id) => ({ ...ad.db.get(id) });
    ad.calls.list[1].resolve({ items: ['m58', 'm57', 'm56', 'm55'].map(mk), nextCursor: '8', total: 60 });
    await until(() => items().length === 6, 4000, 'two new');
    expect(ids()).to.deep.equal(['m60', 'm59', 'm58', 'm57', 'm56', 'm55']);
    expect(live()).to.equal('Đã tải thêm 2');
  });

  it('append error: cards kept, "Không tải được" + "Thử lại" in place, operation-error; Thử lại appends', async () => {
    const { ad } = await openManual({ loadMore: { trigger: 'button' }, pageSize: 20 });
    const errs = [];
    document.querySelector('td-media-picker').addEventListener('operation-error', (e) => errs.push(e.detail));
    press(moreBtn());
    await until(() => ad.calls.list.length === 2, 4000, 'append');
    ad.calls.list[1].reject(Object.assign(new Error('offline'), { code: 'network' }));
    await until(() => !q('.td-media-picker__more-error').hidden, 4000, 'append error');
    expect(items().length).to.equal(20);
    expect(q('.td-media-picker__error').hidden, 'no full-grid error').to.equal(true);
    expect(q('.td-media-picker__more-error').textContent).to.equal('Không tải được');
    expect(moreBtn().getAttribute('label')).to.equal('Thử lại');
    expect(errs.at(-1)).to.deep.equal({ operation: 'list', code: 'network', retryable: true });
    expect(countText()).to.equal('20/60');
    press(moreBtn());
    await until(() => ad.calls.list.length === 3, 4000, 'retry');
    expect(lastReq(ad).cursor).to.equal('20');
    ad.calls.list[2].resolve();
    await until(() => items().length === 40, 4000, 'appended after retry');
    expect(q('.td-media-picker__more-error').hidden).to.equal(true);
    expect(moreBtn().getAttribute('label')).to.equal('Tải thêm');
  });
});

describe('v0.110 td-media-picker — loadMore auto trigger', () => {
  it('the sentinel loads by itself (no click) and re-checks after an append while it is still in view', async () => {
    const { ad } = await openReady({ loadMore: true, pageSize: 4 }, { count: 30 });
    expect(pickerRoot().getAttribute('data-load-more')).to.equal('auto');
    await until(() => items().length >= 12, 4000, 'auto appends');
    expect(ad.calls.list.length).to.be.at.least(3);
    expect(moreBtn() !== null, 'the button stays (keyboard / no IO)').to.equal(true);
  });

  it('scrolling to the end loads the next page', async () => {
    const { ad } = await openReady({ loadMore: true, pageSize: 30 }, { count: 200 });
    await wait(100);
    const before = ad.calls.list.length;
    const n = items().length;
    results().scrollTop = results().scrollHeight;
    await until(() => items().length > n, 4000, 'scroll loads');
    expect(ad.calls.list.length).to.be.greaterThan(before);
  });

  it('maxItems: no auto load past it; the button still loads', async () => {
    const { ad } = await openReady({ loadMore: { maxItems: 60 }, pageSize: 30 }, { count: 200 });
    for (let i = 0; i < 6; i += 1) {
      results().scrollTop = results().scrollHeight;
      await wait(120);
    }
    await until(() => items().length === 60, 4000, 'capped at 60');
    const calls = ad.calls.list.length;
    results().scrollTop = results().scrollHeight;
    await wait(200);
    expect(ad.calls.list.length).to.equal(calls);
    expect(moreShown()).to.equal(true);
    press(moreBtn());
    await until(() => items().length === 90, 4000, 'button past maxItems');
  });

  it('3 appends in a row with no new card → auto loading stops (bad adapter)', async () => {
    const base = createMockAdapter({ count: 8 });
    const page = [...base.db.values()].reverse().slice(0, 4);
    const calls = [];
    const ad = { ...base, list: (req) => { calls.push(req); return Promise.resolve({ items: page.map((a) => ({ ...a })), nextCursor: 'x', total: 99 }); } };
    await openReady({ adapter: ad, loadMore: true, pageSize: 4 });
    await wait(400);
    expect(calls.length).to.equal(4, 'page 1 + 3 dry appends');
    expect(items().length).to.equal(4);
    expect(moreShown(), 'the button remains').to.equal(true);
  });
});

describe('v0.110 td-media-picker — loadMore delete / save without reload', () => {
  it('delete → the card leaves in place, total −1, no list request, scroll kept', async () => {
    const { ad } = await openReady({ loadMore: { trigger: 'button' }, pageSize: 30, capabilities: { delete: true } }, { count: 90 });
    press(moreBtn());
    await until(() => items().length === 60, 4000, 'page 2');
    results().scrollTop = 400;
    const top = results().scrollTop;
    click(item('m46').querySelector('[data-td-media-open]'));
    await until(() => detailName() === 'anh-46.jpg', 4000, 'detail m46');
    const lists = ad.calls.list.length;
    press(q('.td-media-picker__delete'));
    const d = await until(() => deleteDialog(), 4000, 'confirm');
    dlgButton(d, 'Xoá').click();
    await until(() => !item('m46'), 4000, 'removed');
    await wait(100);
    expect(ad.calls.list.length, 'no reload').to.equal(lists);
    expect(items().length).to.equal(59);
    expect(countText()).to.equal('59/89');
    // not reset to the top (scroll anchoring may nudge it a few px as the row reflows)
    expect(Math.abs(results().scrollTop - top)).to.be.below(40);
  });

  it('Codex impl r1: pages transport, a delete crossing a page boundary → no more pages (PageState.total −1)', async () => {
    const { ad } = await openReady({ loadMore: { trigger: 'button' }, pageSize: 25, pagination: 'pages', capabilities: { delete: true } },
      { pagination: 'pages', count: 51 });
    press(moreBtn());
    await until(() => items().length === 50, 4000, 'page 2');
    expect(moreShown(), 'page 3 left').to.equal(true);
    click(items()[0].querySelector('[data-td-media-open]'));
    await until(() => q('.td-media-picker__delete'), 4000, 'detail');
    const lists = ad.calls.list.length;
    press(q('.td-media-picker__delete'));
    const d = await until(() => deleteDialog(), 4000, 'confirm');
    dlgButton(d, 'Xoá').click();
    await until(() => items().length === 49, 4000, 'removed');
    await wait(100);
    expect(ad.calls.list.length, 'no reload').to.equal(lists);
    expect(countText()).to.equal('49/50');
    expect(moreShown(), '50 items = 2 pages, all loaded').to.equal(false);
  });

  it('save → the card repaints in place, no list request', async () => {
    const { ad } = await openReady({ loadMore: { trigger: 'button' }, pageSize: 20, assetFields: assetFields() });
    press(moreBtn());
    await until(() => items().length === 40, 4000, 'page 2');
    click(item('m30').querySelector('[data-td-media-open]'));
    await until(() => detailName() === 'anh-30.jpg' && q('.td-media-picker__field[data-key="title"] input'), 4000, 'detail m30');
    const lists = ad.calls.list.length;
    const input = q('.td-media-picker__field[data-key="title"] input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    await sendKeys({ type: '!' });
    await wait(50);
    await sendKeys({ press: 'Enter' });
    await until(() => ad.calls.update.length === 1, 4000, 'saved');
    await until(() => live() === 'Đã lưu thay đổi', 4000, 'announced');
    await wait(100);
    expect(ad.calls.list.length).to.equal(lists);
    expect(items().length).to.equal(40);
  });
});

describe('v0.110 td-media-picker — pageSize auto + maxPageSize (QĐ4)', () => {
  const tracks = () => getComputedStyle(q('td-media-grid')).gridTemplateColumns.trim().split(/\s+/).length;

  it("'auto': a multiple of the columns, at least one row more than the visible rows, ≤ 72", async () => {
    const { ad } = await openReady({ pageSize: 'auto' }, { count: 200 });
    const limit = lastReq(ad).limit;
    const cols = tracks();
    expect(limit % cols).to.equal(0);
    expect(limit).to.be.at.most(72);
    expect(limit).to.be.at.least(cols * 2);
    expect(items().length).to.equal(limit);
    // the frame is full: the last card ends below the visible results box (one row more than fits)
    expect(items().at(-1).getBoundingClientRect().bottom).to.be.greaterThan(results().getBoundingClientRect().bottom);
  });

  it('maxPageSize always wins (min(n, 5), rounded down to the columns only when ≥ cols); pages UI items-per-page follows', async () => {
    const { ad } = await openReady({ pageSize: 'auto', maxPageSize: 5, pagination: 'pages' }, { pagination: 'pages' });
    const cols = tracks();
    const want = cols > 5 ? 5 : Math.floor(5 / cols) * cols;
    expect(lastReq(ad).limit).to.equal(want);
    expect(lastReq(ad).limit).to.be.at.most(5);
    expect(q('td-pagination').getAttribute('items-per-page')).to.equal(String(want));
  });

  it('lane review: deleting the last card (reset, grid kept, nothing to measure) keeps the measured size, not 30', async () => {
    const { ad } = await openReady({ pageSize: 'auto', maxPageSize: 100, loadMore: { trigger: 'button' }, capabilities: { delete: true } }, { count: 1 });
    const first = lastReq(ad).limit;
    click(items()[0].querySelector('[data-td-media-open]'));
    await until(() => q('.td-media-picker__delete'), 4000, 'detail');
    const lists = ad.calls.list.length;
    press(q('.td-media-picker__delete'));
    const d = await until(() => deleteDialog(), 4000, 'confirm');
    dlgButton(d, 'Xoá').click();
    await until(() => ad.calls.list.length > lists, 4000, 'page 1 reload');
    expect(lastReq(ad).limit).to.equal(first);
  });

  it('maxPageSize below the columns → exactly maxPageSize (an odd row)', async () => {
    const { ad } = await openReady({ pageSize: 'auto', maxPageSize: 2 });
    expect(tracks()).to.be.above(2);
    expect(lastReq(ad).limit).to.equal(2);
  });

  it('measured once per reset: a resize alone never changes the limit; a search re-measures', async () => {
    const { ad } = await openReady({ pageSize: 'auto', loadMore: { trigger: 'button' } }, { count: 200 });
    const first = lastReq(ad).limit;
    await setViewport({ width: 1280, height: 500 });
    await wait(100);
    press(moreBtn());
    await until(() => ad.calls.list.length === 2, 4000, 'append');
    expect(lastReq(ad).limit, 'an append keeps the reset page size').to.equal(first);
    await search('anh');
    await until(() => ad.calls.list.length === 3, 4000, 'reset');
    expect(lastReq(ad).limit).to.be.at.most(first);
    await setViewport({ width: 1280, height: 800 });
  });
});
