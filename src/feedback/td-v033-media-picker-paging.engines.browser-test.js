import { expect } from '@esm-bundle/chai';

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 13-14; "Test > Engines > Phân trang") — cursor pages
// (stored cursor stack, single-flight, error keeps the page), pages mode (td-pagination synced through its attribute,
// latest-wins), reset on a query change, focus + announcement, hidden on one page, the pages → cursor fallback.
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
const ids = () => items().map((i) => i.getAttribute('data-id'));
const live = () => q('.td-media-picker__live')?.textContent || '';
const info = () => q('.td-media-picker__page-info')?.textContent || '';
const prev = () => q('.td-media-picker__prev');
const next = () => q('.td-media-picker__next');
const lastReq = (ad) => ad.calls.list.at(-1).args[0];
async function search(text) {
  const f = q('.td-media-picker__search');
  f.value = text;
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => items().length > 0 || q('.td-media-picker__empty:not([hidden])'), 4000, 'first page');
  return { ad, promise };
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
afterEach(closeAll);

describe('v0.33 td-media-picker — cursor pages (decision 13, default)', () => {
  it('default pageSize 30; › then ‹ reuse the stored cursors; "Hiển thị a-b / n media"; aria-labels; ‹ disabled on page 1', async () => {
    const { ad } = await openReady();
    expect(lastReq(ad).limit).to.equal(30);
    expect(lastReq(ad).cursor).to.equal(null);
    expect('page' in lastReq(ad)).to.equal(false);
    expect(info()).to.equal('Hiển thị 1-30 / 60 media');
    expect(prev().querySelector('button').getAttribute('aria-label')).to.equal('Trang trước');
    expect(next().querySelector('button').getAttribute('aria-label')).to.equal('Trang sau');
    expect(prev().getAttribute('variant')).to.equal('secondary');
    expect(prev().getAttribute('size')).to.equal('sm');
    expect(prev().hasAttribute('disabled')).to.equal(true);
    next().click();
    await until(() => info() === 'Hiển thị 31-60 / 60 media', 4000, 'page 2');
    expect(lastReq(ad).cursor).to.equal('30');
    expect(ids()[0]).to.equal('m30');
    expect(next().hasAttribute('disabled')).to.equal(true);
    prev().click();
    await until(() => info() === 'Hiển thị 1-30 / 60 media', 4000, 'page 1');
    expect(lastReq(ad).cursor).to.equal(null);
    expect(ids()[0]).to.equal('m60');
  });

  it('no total → "Trang n"', async () => {
    await openReady({ pageSize: 20 }, { total: false });
    expect(info()).to.equal('Trang 1');
    next().click();
    await until(() => info() === 'Trang 2', 4000, 'Trang 2');
  });

  it('single-flight: two quick › → ONE request; while pending ‹ › disabled + loading on the clicked one; resolve → page 2 (not 3)', async () => {
    const ad = createMockAdapter({ manual: true });
    const promise = TdMediaPicker.open({ adapter: ad, pageSize: 20 });
    await until(() => ad.calls.list.length === 1, 4000, 'first list');
    ad.calls.list[0].resolve();
    await until(() => items().length === 20, 4000, 'page 1');
    next().click();
    next().click();
    await wait(30);
    expect(ad.calls.list.length).to.equal(2);
    expect(next().hasAttribute('loading')).to.equal(true);
    expect(prev().hasAttribute('disabled')).to.equal(true);
    prev().click();
    await wait(20);
    expect(ad.calls.list.length).to.equal(2);
    ad.calls.list[1].resolve();
    await until(() => info() === 'Hiển thị 21-40 / 60 media', 4000, 'page 2');
    expect(next().hasAttribute('loading')).to.equal(false);
    expect(next().hasAttribute('disabled')).to.equal(false);
    expect(prev().hasAttribute('disabled')).to.equal(false);
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('error → still page 1, cursor stack unchanged; › again sends the same cursor; "Thử lại" retries the navigation', async () => {
    const ad = createMockAdapter({ manual: true });
    const errs = [];
    const promise = TdMediaPicker.open({ adapter: ad, pageSize: 20 });
    document.querySelector('td-media-picker').addEventListener('operation-error', (e) => errs.push(e.detail));
    await until(() => ad.calls.list.length === 1);
    ad.calls.list[0].resolve();
    await until(() => items().length === 20);
    next().click();
    await until(() => ad.calls.list.length === 2);
    ad.calls.list[1].reject(Object.assign(new Error('raw SQL'), { code: 'network' }));
    await until(() => !q('.td-media-picker__error').hidden, 4000, 'error shown');
    expect(errs.at(-1)).to.deep.equal({ operation: 'list', code: 'network', retryable: true });
    expect(info()).to.equal('Hiển thị 1-20 / 60 media');
    expect(next().hasAttribute('disabled')).to.equal(false);
    expect(next().hasAttribute('loading')).to.equal(false);
    expect(pickerRoot().textContent.includes('raw SQL')).to.equal(false);
    next().click();
    await until(() => ad.calls.list.length === 3);
    expect(lastReq(ad).cursor).to.equal('20');
    ad.calls.list[2].reject(Object.assign(new Error('x'), { code: 'network' }));
    await until(() => !q('.td-media-picker__error').hidden);
    q('.td-media-picker__retry').click();
    await until(() => ad.calls.list.length === 4);
    expect(lastReq(ad).cursor).to.equal('20');
    ad.calls.list[3].resolve();
    await until(() => info() === 'Hiển thị 21-40 / 60 media', 4000, 'page 2 after retry');
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('a query / filter change aborts the pending page and resets to page 1', async () => {
    const { ad } = await openReady({ pageSize: 20 });
    next().click();
    await until(() => info() === 'Hiển thị 21-40 / 60 media');
    ad.manual = true;
    next().click();
    await until(() => ad.calls.list.length >= 3 && !ad.calls.list.at(-1).settled);
    const pending = ad.calls.list.at(-1);
    await search('anh');
    await until(() => pending.signal.aborted, 4000, 'aborted');
    await until(() => lastReq(ad).query === 'anh', 4000, 'search request');
    expect(lastReq(ad).cursor).to.equal(null);
    lastReq(ad) && ad.calls.list.at(-1).resolve();
    await until(() => /^Hiển thị 1-20 \//.test(info()), 4000, 'page 1');
  });

  it('a new page: list scrolled to the top, focus on the results heading, "Trang n" announced', async () => {
    await openReady({ pageSize: 30 });
    const results = q('.td-media-picker__results');
    results.scrollTop = results.scrollHeight;
    await until(() => results.scrollTop > 0 || results.scrollHeight <= results.clientHeight, 4000, 'scrolled');
    next().click();
    await until(() => info() === 'Hiển thị 31-60 / 60 media');
    expect(results.scrollTop).to.equal(0);
    expect(document.activeElement === q('.td-media-picker__results-heading')).to.equal(true);
    await until(() => live() === 'Trang 2', 4000, 'announced');
  });

  it('one page only → pager hidden', async () => {
    await openReady({}, { count: 12 });
    expect(q('.td-media-picker__pager').hidden).to.equal(true);
  });
});

describe('v0.33 td-media-picker — pages mode (decision 13)', () => {
  const pg = () => q('td-pagination');
  const pageBtn = (n) => pg().querySelector(`.td-pagination__page[data-page="${n}"]`);

  it('td-pagination (total-items / items-per-page / current-page / item-label); page 3 → request page: 3, cursor null; synced through the attribute', async () => {
    const { ad } = await openReady({ pagination: 'pages', pageSize: 20 }, { pagination: 'pages' });
    expect(lastReq(ad).page).to.equal(1);
    expect(lastReq(ad).cursor).to.equal(null);
    await until(() => pg() && !pg().hidden && pageBtn(3), 4000, 'pagination');
    expect(q('.td-media-picker__cursor').hidden).to.equal(true);
    expect(pg().getAttribute('total-items')).to.equal('60');
    expect(pg().getAttribute('items-per-page')).to.equal('20');
    expect(pg().getAttribute('current-page')).to.equal('1');
    expect(pg().getAttribute('item-label')).to.equal('media');
    pageBtn(3).click();
    await until(() => ids()[0] === 'm20', 4000, 'page 3');
    expect(lastReq(ad).page).to.equal(3);
    expect(lastReq(ad).cursor).to.equal(null);
    expect(pg().getAttribute('current-page')).to.equal('3');
    await until(() => document.activeElement === q('.td-media-picker__results-heading') && live() === 'Trang 3', 4000, 'focus + announce');
    // query change → page 1
    await search('anh');
    await until(() => lastReq(ad).query === 'anh', 4000, 'search');
    expect(lastReq(ad).page).to.equal(1);
    await until(() => pg().getAttribute('current-page') === '1' || q('.td-media-picker__pager').hidden, 4000, 'page 1');
  });

  it('latest wins: page 2 then page 3 quickly → page 2 aborted; only page 3 renders, even when page 2 resolves later', async () => {
    const ad = createMockAdapter({ manual: true, pagination: 'pages' });
    const promise = TdMediaPicker.open({ adapter: ad, pagination: 'pages', pageSize: 20 });
    await until(() => ad.calls.list.length === 1);
    ad.calls.list[0].resolve();
    await until(() => items().length === 20 && pageBtn(3), 4000, 'page 1');
    pageBtn(2).click();
    await until(() => ad.calls.list.length === 2);
    await until(() => pageBtn(3), 4000, 'pagination re-rendered');
    pageBtn(3).click();
    await until(() => ad.calls.list.length === 3);
    expect(ad.calls.list[1].signal.aborted).to.equal(true);
    ad.ignoreSignal = true;
    ad.calls.list[2].resolve();
    await until(() => ids()[0] === 'm20', 4000, 'page 3');
    ad.calls.list[1].resolve();
    await wait(50);
    expect(ids()[0]).to.equal('m20');
    expect(pg().getAttribute('current-page')).to.equal('3');
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('a page error → td-pagination back on the committed page (silent attribute sync)', async () => {
    const ad = createMockAdapter({ manual: true, pagination: 'pages' });
    const promise = TdMediaPicker.open({ adapter: ad, pagination: 'pages', pageSize: 20 });
    await until(() => ad.calls.list.length === 1);
    ad.calls.list[0].resolve();
    await until(() => pageBtn(2), 4000, 'pagination');
    const changes = [];
    pg().addEventListener('page-change', (e) => changes.push(e.detail.page));
    pageBtn(2).click();
    await until(() => ad.calls.list.length === 2);
    ad.calls.list[1].reject(Object.assign(new Error('x'), { code: 'server' }));
    await until(() => !q('.td-media-picker__error').hidden, 4000, 'error');
    expect(pg().getAttribute('current-page')).to.equal('1');
    expect(changes).to.deep.equal([2]); // only the user's click — never an event from the sync
    document.querySelector('td-media-picker').close();
    await promise;
  });

  it('pages without total → warn once + the cursor pager', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    try {
      await openReady({ pagination: 'pages', pageSize: 20 }, { pagination: 'pages', total: false });
      expect(q('.td-media-picker__cursor').hidden).to.equal(false);
      expect(pg().hidden).to.equal(true);
      expect(info()).to.equal('Trang 1');
      next().click();
      await until(() => info() === 'Trang 2', 4000, 'page 2');
      expect(warns.filter((w) => /pages/.test(w) && /total/.test(w)).length).to.equal(1);
    } finally {
      console.warn = orig;
    }
  });
});
