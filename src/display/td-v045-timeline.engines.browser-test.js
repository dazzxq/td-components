import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-timeline.js';

// v0.45.0 (plan docs/internal/plans/v0.45.0-steps-timeline.md QĐ T1–T11, M3) — <td-timeline>: day groups in an explicit
// zone (dcms2 UTC bug), unknown-time group (review R2-4), native <details> + lazy details (abort / cache / retry),
// "Xem thêm" (review R1-2: cursor, placement, overlap, identity, one request, errors, focus), text-only fields, a11y.
// Deterministic: every case sets `time-zone` and `now`. Promises are resolved by the test (no timers to wait for).
// Chromium, Firefox and WebKit. DOM nodes are compared as booleans (`a === b`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Robust under load: the native `toggle` event is a queued task (no ordering promise against timers) — poll. */
async function waitFor(fn, ms = 3000) {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) return false;
    await tick();
  }
  return true;
}
const VN = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-10-05T03:00:00Z'); // 10:00 Monday 05/10/2026 in Vietnam

const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  root.innerHTML = '';
});

/** A promise the test settles by hand. */
function deferred() {
  let resolve;
  let reject;
  const p = new Promise((a, b) => { resolve = a; reject = b; });
  return { p, resolve, reject };
}

async function mk(items, attrs = `time-zone="${VN}"`, width = 720, props = {}) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-timeline ${attrs}></td-timeline>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-timeline');
  el.now = NOW;
  Object.assign(el, props);
  el.items = items;
  await raf();
  return el;
}
const groups = (el) => [...el.querySelectorAll('.td-timeline__day')].map((g) => [g.dataset.day,
  g.querySelector('.td-timeline__day-label')?.textContent ?? null, [...g.querySelectorAll('li')].map((li) => li.dataset.id)]);
const ids = (el) => [...el.querySelectorAll('li.td-timeline__item')].map((li) => li.dataset.id);

describe('td-timeline — day groups (QĐ T3, T4, T5, T9)', () => {
  it('17:30Z on 04/10 is in the 05/10 group in Asia/Ho_Chi_Minh (dcms2 UTC bug); Hôm nay / Hôm qua / Thứ, dd/mm/yyyy', async () => {
    const el = await mk([
      { id: 'a', time: '2026-10-04T17:30:00Z', title: 'Tạo đơn' },
      { id: 'b', time: '2026-10-04T16:59:00Z', title: 'Báo giá' },
      { id: 'c', time: '2026-10-02T03:00:00Z', title: 'Liên hệ' },
    ]);
    expect(groups(el)).to.deep.equal([
      ['2026-10-05', 'Hôm nay', ['a']], ['2026-10-04', 'Hôm qua', ['b']], ['2026-10-02', 'Thứ Sáu, 02/10/2026', ['c']],
    ]);
    const t = el.querySelector('li[data-id="a"] time.td-timeline__time');
    expect(t.textContent).to.equal('00:30');
    expect(t.getAttribute('datetime')).to.equal('2026-10-04T17:30:00.000Z');
    expect(el.querySelector('.td-timeline__day-title').localName).to.equal('h3');
    expect(el.querySelector('time.td-timeline__day-label').getAttribute('datetime')).to.equal('2026-10-05');
    el.setAttribute('time-zone', 'UTC');
    expect(groups(el).map((g) => g[0])).to.deep.equal(['2026-10-04', '2026-10-02']);
    expect(warns).to.deep.equal([]);
  });

  it('6-digit fractions (dsuite DATETIME(6)) truncated to ms; order="asc"; group="none" (dd/mm/yyyy HH:mm, no heading)', async () => {
    const el = await mk([
      { id: 'x', time: '2026-10-05T01:15:22.123456Z', title: 'X' },
      { id: 'y', time: '2026-10-04T01:00:00.999999999Z', title: 'Y' },
    ], `time-zone="${VN}" order="asc" group="none"`);
    expect(ids(el)).to.deep.equal(['y', 'x']);
    const g = el.querySelector('.td-timeline__day');
    expect(g.dataset.day).to.equal('all');
    expect(g.querySelector('h3, h2, h4, .td-timeline__day-title')).to.equal(null);
    expect(el.querySelector('li[data-id="x"] time').textContent).to.equal('05/10/2026 08:15');
    expect(el.querySelector('li[data-id="x"] time').getAttribute('datetime')).to.equal('2026-10-05T01:15:22.123Z');
    expect(el.items.map((i) => i.time)).to.deep.equal(['2026-10-04T01:00:00.999Z', '2026-10-05T01:15:22.123Z']);
  });

  for (const group of ['day', 'none']) {
    it(`group="${group}": zone-less strings → ONE warning + the last group "Không rõ thời gian" (span label, no <time>)`, async () => {
      const el = await mk([
        { id: 'u1', time: '2026-10-05 14:00', title: 'Không múi giờ' },
        { id: 'k', time: '2026-10-05T01:00:00Z', title: 'Có múi giờ' },
        { id: 'u2', time: '2026-10-05', title: 'Chỉ ngày' },
      ], `time-zone="${VN}" group="${group}"`);
      expect(warns.length).to.equal(1);
      expect(warns[0]).to.contain('2 item(s)');
      const days = [...el.querySelectorAll('.td-timeline__day')];
      const last = days[days.length - 1];
      expect(last.dataset.day).to.equal('unknown');
      expect(days.filter((d) => d.dataset.day === 'unknown').length).to.equal(1);
      const label = last.querySelector(':scope > .td-timeline__day-title > .td-timeline__day-label');
      expect(label.localName).to.equal('span');
      expect(label.textContent).to.equal('Không rõ thời gian');
      expect(label.getAttributeNames().sort()).to.deep.equal(['class']);
      expect(last.querySelectorAll('time').length).to.equal(0);
      expect([...last.querySelectorAll('li')].map((li) => li.dataset.id)).to.deep.equal(['u1', 'u2']);
    });
  }

  it('heading-level="4" → h4; markers aria-hidden; `loading` without items → skeleton + aria-busy', async () => {
    const el = await mk([{ time: '2026-10-05T01:00:00Z', title: 'A', icon: 'pencil', tone: 'success' }], `time-zone="${VN}" heading-level="4"`);
    expect(el.querySelector('.td-timeline__day-title').localName).to.equal('h4');
    expect(el.querySelector('.td-timeline__marker').getAttribute('aria-hidden')).to.equal('true');
    expect(el.querySelector('.td-timeline__marker svg[data-icon="pencil"]')).to.not.equal(null);
    expect(el.querySelector('li').dataset.tone).to.equal('success');
    const l = await mk([], `time-zone="${VN}" loading`);
    expect(l.getAttribute('aria-busy')).to.equal('true');
    expect(l.querySelectorAll('.td-timeline__skeleton-row').length).to.equal(3);
    l.removeAttribute('loading');
    expect(l.hasAttribute('aria-busy')).to.equal(false);
    expect(l.querySelector('.td-timeline__empty').textContent).to.equal('Chưa có hoạt động nào');
    l.setAttribute('empty-text', 'Đơn chưa có lịch sử');
    expect(l.querySelector('.td-timeline__empty').textContent).to.equal('Đơn chưa có lịch sử');
  });

  it('unknown icon → plain dot (empty slot) + ONE warning per name; no icon → dot', async () => {
    const el = await mk([
      { time: '2026-10-05T01:00:00Z', title: 'A', icon: 'site-truck' },
      { time: '2026-10-05T02:00:00Z', title: 'B', icon: 'site-truck' },
      { time: '2026-10-05T03:00:00Z', title: 'C' },
      { time: '2026-10-05T04:00:00Z', title: 'D', icon: 'site-other' },
    ]);
    // SEC-03: a fixed string (never the caller's value), once per distinct name
    expect(warns.filter((w) => w.includes('unknown icon')).length).to.equal(2);
    expect(warns.some((w) => w.includes('site-truck') || w.includes('site-other'))).to.equal(false);
    const slot = el.querySelector('.td-timeline__icon');
    expect(slot.children.length).to.equal(0);
    expect(getComputedStyle(slot, '::before').content).to.not.equal('none');
  });
});

describe('td-timeline — text only (QĐ T6)', () => {
  it('every field holding markup stays text; javascript: / other-origin links → plain text; no style attribute', async () => {
    const x = '<img src=x onerror=window.__pwned=1>"><svg onload=window.__pwned=1>';
    const el = await mk([{ id: x, time: '2026-10-05T01:00:00Z', title: x, actor: { name: x, href: 'javascript:alert(1)' }, meta: x, details: x, href: 'https://evil.example/' },
      { time: '2026-10-05T02:00:00Z', title: 'ok', actor: x, href: 'java\tscript:alert(1)' }]);
    await raf();
    expect(window.__pwned).to.equal(undefined);
    expect(el.querySelectorAll('img, svg[onload], a').length).to.equal(0);
    const li = el.querySelector('li[data-id]:last-child');
    expect(li.querySelector('.td-timeline__title').textContent).to.equal(x);
    expect(li.querySelector('.td-timeline__actor').textContent).to.equal(x);
    expect(li.querySelector('.td-timeline__meta').textContent).to.equal(x);
    expect(li.querySelector('.td-timeline__detail').textContent).to.equal(x);
    expect(el.querySelectorAll('[style]').length).to.equal(0);
  });

  it('safe links: title / actor become links; details keep line breaks (pre-line)', async () => {
    const el = await mk([{ time: '2026-10-05T01:00:00Z', title: 'Đơn #12', href: '/don/12', actor: { name: 'An', href: '?u=1' }, details: 'Dòng 1\nDòng 2' }]);
    expect(el.querySelector('a.td-timeline__title').getAttribute('href')).to.equal('/don/12');
    expect(el.querySelector('a.td-timeline__actor').getAttribute('href')).to.equal('?u=1');
    const d = el.querySelector('.td-timeline__detail');
    expect(getComputedStyle(d).whiteSpace).to.equal('pre-line');
    expect(d.textContent).to.equal('Dòng 1\nDòng 2');
  });
});

describe('td-timeline — <details> (QĐ T8)', () => {
  it('click / Enter on the summary → item-toggle { id, open }; expanded → open (no event for the initial state)', async () => {
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: 'x' }, { id: 'b', time: '2026-10-05T02:00:00Z', title: 'B', details: 'y', expanded: true }]);
    const got = [];
    el.addEventListener('item-toggle', (e) => got.push(e.detail));
    await tick();
    expect(el.querySelector('li[data-id="b"] details').open).to.equal(true);
    el.querySelector('li[data-id="a"] summary').click();
    await waitFor(() => got.length === 1);
    el.querySelector('li[data-id="a"] summary').focus();
    await sendKeys({ press: 'Enter' });
    await waitFor(() => got.length === 2);
    await tick();
    expect(got).to.deep.equal([{ id: 'a', open: true }, { id: 'a', open: false }]);
    const chevron = el.querySelector('li[data-id="b"] .td-timeline__chevron');
    expect(chevron.getAttribute('aria-hidden')).to.equal('true');
    expect(chevron.querySelector('svg')).to.not.equal(null);
  });

  it('lazy: renderDetails called ONCE across open / close / open; a Node is attached; a string is text', async () => {
    let calls = 0;
    const node = document.createElement('table');
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: true }, { id: 'b', time: '2026-10-05T02:00:00Z', title: 'B', details: true }], undefined, 720, {
      renderDetails: async (it) => { calls++; return it.id === 'a' ? node : '<img src=x onerror=window.__pwned=1>'; },
    });
    const toggles = [];
    el.addEventListener('item-toggle', (e) => toggles.push(e.detail.open));
    const da = el.querySelector('li[data-id="a"] details');
    da.open = true;
    await waitFor(() => da.querySelector('.td-timeline__detail').firstChild === node);
    expect(da.querySelector('.td-timeline__detail').firstChild === node).to.equal(true);
    da.open = false;
    await waitFor(() => toggles.length === 2);
    da.open = true;
    await waitFor(() => toggles.length === 3);
    expect(calls).to.equal(1);
    const db = el.querySelector('li[data-id="b"] details');
    db.open = true;
    await waitFor(() => db.querySelector('.td-timeline__detail').textContent.includes('img'));
    expect(db.querySelector('.td-timeline__detail').textContent).to.equal('<img src=x onerror=window.__pwned=1>');
    expect(db.querySelector('img')).to.equal(null);
  });

  it('lazy: "Đang tải…" while pending; closing aborts the signal; reject → error + "Thử lại" calls again; new items drop a late result', async () => {
    const calls = [];
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: true }], undefined, 720, {
      renderDetails: (it, { signal }) => { const d = deferred(); calls.push({ d, signal }); return d.p; },
    });
    const d = el.querySelector('details');
    d.open = true;
    await waitFor(() => calls.length === 1);
    expect(calls.length).to.equal(1);
    expect(d.querySelector('.td-timeline__loading').getAttribute('role')).to.equal('status');
    d.open = false;
    await waitFor(() => calls[0].signal.aborted);
    expect(calls[0].signal.aborted).to.equal(true);
    d.open = true;
    await waitFor(() => calls.length === 2);
    expect(calls.length).to.equal(2);
    calls[1].d.reject(new Error('500'));
    await waitFor(() => d.querySelector('.td-timeline__detail-error'));
    expect(d.querySelector('.td-timeline__detail-error').textContent).to.equal('Không tải được chi tiết.');
    d.querySelector('.td-timeline__retry').click();
    await tick();
    expect(calls.length).to.equal(3);
    el.items = [{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A2', details: true }];
    calls[2].d.resolve('cũ');
    await tick();
    expect(el.textContent.includes('cũ')).to.equal(false);
  });
});

describe('td-timeline — "Xem thêm" (QĐ T10, review R1-2)', () => {
  for (const order of ['desc', 'asc']) {
    it(`${order}: cursor = last valid item (not the unknown one); known items before the unknown group; unknown appended last`, async () => {
      const pages = [];
      const el = await mk([
        { id: 'a', time: '2026-10-05T02:00:00Z', title: 'A' }, { id: 'b', time: '2026-10-05T01:00:00Z', title: 'B' },
        { id: 'u1', time: 'hôm qua', title: 'U1' },
      ], `time-zone="${VN}" order="${order}" has-more`, 720, {
        loadMore: (opts) => { const d = deferred(); pages.push({ d, opts }); return d.p; },
      });
      warns.length = 0;
      const btn = el.querySelector('button.td-timeline__more');
      expect(btn).to.not.equal(null);
      btn.click();
      expect(pages.length).to.equal(1);
      expect(pages[0].opts.last.id).to.equal(order === 'desc' ? 'b' : 'a');
      expect(btn.getAttribute('aria-busy')).to.equal('true');
      btn.click(); // a second click while busy: no second request
      expect(pages.length).to.equal(1);
      const before = [...el.querySelectorAll('li')];
      pages[0].d.resolve({ items: [
        { id: 'c', time: '2026-10-04T03:00:00Z', title: 'C' }, { id: 'u2', time: 'x', title: 'U2' },
        { id: 'b', time: '2026-10-05T01:00:00Z', title: 'B (trùng)' }, { id: 'd', time: '2026-10-05T00:30:00Z', title: 'D' },
      ] });
      await tick();
      expect(before.every((li) => li.isConnected)).to.equal(true);
      const all = ids(el);
      expect(all.filter((i) => i === 'b').length).to.equal(1);
      expect(all.slice(-2)).to.deep.equal(['u1', 'u2']);
      expect(all.slice(0, -2)).to.deep.equal(order === 'desc' ? ['a', 'b', 'd', 'c'] : ['c', 'd', 'b', 'a']);
      const unknown = el.querySelector('.td-timeline__day[data-day="unknown"]');
      const known = el.querySelector('li[data-id="c"]');
      expect(!!(known.compareDocumentPosition(unknown) & Node.DOCUMENT_POSITION_FOLLOWING)).to.equal(true);
      const keys = groups(el).map((g) => g[0]);
      expect(new Set(keys).size).to.equal(keys.length); // no second heading for the same day
      expect(btn.hasAttribute('aria-busy')).to.equal(false);
      await tick();
      expect(el.querySelector('[role="status"]').textContent).to.equal('Đã tải thêm 3 mục');
    });
  }

  it('only unknown items shown → last = null; hasMore: false → the button goes and focus moves to the first new item', async () => {
    let seen;
    const el = await mk([{ id: 'u', time: null, title: 'U' }], `time-zone="${VN}" has-more`, 720, {
      loadMore: async (opts) => { seen = opts.last; return { items: [{ id: 'n1', time: '2026-10-05T01:00:00Z', title: 'N1' }, { id: 'n2', time: '2026-10-05T02:00:00Z', title: 'N2' }], hasMore: false }; },
    });
    const btn = el.querySelector('.td-timeline__more');
    btn.focus();
    btn.click();
    await tick();
    expect(seen).to.equal(null);
    expect(el.querySelector('.td-timeline__more')).to.equal(null);
    expect(el.hasAttribute('has-more')).to.equal(false);
    expect(document.activeElement === el.querySelector('li[data-id="n2"]')).to.equal(true); // desc: n2 first
  });

  it('error → button text "Không tải được, thử lại" + announcement + load-more-error; retry works', async () => {
    let n = 0;
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A' }], `time-zone="${VN}" has-more`, 720, {
      loadMore: async () => { n++; if (n === 1) throw new Error('503'); return { items: [{ id: 'b', time: '2026-10-04T01:00:00Z', title: 'B' }] }; },
    });
    const errs = [];
    el.addEventListener('load-more-error', (e) => errs.push(e.detail));
    const btn = el.querySelector('.td-timeline__more');
    btn.click();
    await tick();
    expect(btn.textContent).to.equal('Không tải được, thử lại');
    expect(errs).to.deep.equal([{ kind: 'rejected' }]); // SEC-03: never the raw error
    await tick();
    expect(el.querySelector('[role="status"]').textContent).to.equal('Không tải được, thử lại');
    btn.click();
    await tick();
    expect(ids(el)).to.deep.equal(['a', 'b']);
    expect(btn.textContent).to.equal('Xem thêm');
  });

  it('more-href without loadMore → a real link (native); with loadMore the link click loads in place', async () => {
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A' }], `time-zone="${VN}" has-more more-href="?page=2"`);
    const a = el.querySelector('a.td-timeline__more');
    expect(a.getAttribute('href')).to.equal('?page=2');
    let native = null;
    el.addEventListener('click', (e) => { native = !e.defaultPrevented; e.preventDefault(); });
    a.click();
    expect(native).to.equal(true);
    let called = 0;
    el.loadMore = async () => { called++; return { items: [] }; };
    a.click();
    expect(native).to.equal(false);
    expect(called).to.equal(1);
    const bad = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A' }], `time-zone="${VN}" has-more more-href="javascript:alert(1)"`);
    expect(bad.querySelector('.td-timeline__more')).to.equal(null);
    await tick();
    expect(warns.some((w) => w.includes('has-more needs'))).to.equal(true);
  });

  it('el.remove() while loading → aborted, nothing inserted; append(): same rules, existing nodes kept for 500 new items', async () => {
    let sig;
    const d = deferred();
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A' }], `time-zone="${VN}" has-more`, 720, {
      loadMore: ({ signal }) => { sig = signal; return d.p; },
    });
    el.querySelector('.td-timeline__more').click();
    el.parentElement.remove();
    expect(sig.aborted).to.equal(true);
    d.resolve({ items: [{ id: 'z', time: '2026-10-04T01:00:00Z', title: 'Z' }] });
    await tick();
    expect(el.querySelector('li[data-id="z"]')).to.equal(null);

    const big = await mk([{ id: 'first', time: '2026-10-05T09:00:00Z', title: 'First' }]);
    const keep = big.querySelector('li');
    const n = big.append(Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, time: Date.UTC(2026, 8, 1) + i * 3600e3, title: `P${i}` })));
    expect(n).to.equal(500);
    expect(big.querySelector('li') === keep).to.equal(true);
    expect(big.querySelectorAll('li').length).to.equal(501);
    expect(big.append([{ id: 'first', time: '2026-10-05T09:00:00Z', title: 'dup' }])).to.equal(0);
  });
});

describe('td-timeline — review round 1 (SEC-01, SEC-02, ISSUE-2)', () => {
  it('SEC-01: loadMore replaced while a page is pending → the old page never appears; the new hook is used next', async () => {
    const d = deferred();
    let oldSig;
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A' }], `time-zone="${VN}" has-more`, 720, {
      loadMore: ({ signal }) => { oldSig = signal; return d.p; },
    });
    el.querySelector('.td-timeline__more').click();
    el.loadMore = async () => ({ items: [{ id: 'new', time: '2026-10-04T01:00:00Z', title: 'Mới' }] });
    expect(oldSig.aborted).to.equal(true);
    d.resolve({ items: [{ id: 'old', time: '2026-10-04T02:00:00Z', title: 'Cũ' }] });
    await tick();
    expect(el.querySelector('li[data-id="old"]')).to.equal(null);
    const btn = el.querySelector('.td-timeline__more');
    expect(btn.hasAttribute('aria-busy')).to.equal(false);
    btn.click();
    await tick();
    expect(ids(el)).to.deep.equal(['a', 'new']);
  });

  it('SEC-01: renderDetails replaced while pending → old result dropped, the open detail reloads with the new renderer', async () => {
    const d = deferred();
    let oldSig;
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: true, expanded: true }], undefined, 720, {
      renderDetails: (it, { signal }) => { oldSig = signal; return d.p; },
    });
    await waitFor(() => !!oldSig);
    el.renderDetails = async () => 'mới';
    expect(oldSig.aborted).to.equal(true);
    d.resolve('cũ');
    const box = el.querySelector('.td-timeline__detail');
    await waitFor(() => box.textContent === 'mới');
    expect(box.textContent).to.equal('mới');
  });

  it('SEC-01: a cached detail is not shown after renderDetails is replaced (closed → reloads on the next open)', async () => {
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: true }], undefined, 720, {
      renderDetails: async () => 'cũ',
    });
    const det = el.querySelector('details');
    det.open = true;
    await waitFor(() => det.querySelector('.td-timeline__detail').textContent === 'cũ');
    det.open = false;
    await waitFor(() => !det.open);
    await tick();
    let calls = 0;
    el.renderDetails = async () => { calls++; return 'mới'; };
    const d2 = el.querySelector('details');
    expect(d2.querySelector('.td-timeline__detail').textContent).to.not.equal('cũ');
    d2.open = true;
    await waitFor(() => d2.querySelector('.td-timeline__detail').textContent === 'mới');
    expect(d2.querySelector('.td-timeline__detail').textContent).to.equal('mới');
    expect(calls).to.equal(1);
  });

  it('ISSUE-2: a structural re-render while a lazy detail is pending → the new node loads (not stuck on "Đang tải…")', async () => {
    const calls = [];
    const el = await mk([{ id: 'a', time: '2026-10-05T01:00:00Z', title: 'A', details: true, expanded: true }], undefined, 720, {
      renderDetails: (it, { signal }) => { const d = deferred(); calls.push({ d, signal }); return d.p; },
    });
    await waitFor(() => calls.length === 1);
    el.setAttribute('heading-level', '4'); // groups rebuilt
    expect(calls[0].signal.aborted).to.equal(true);
    await waitFor(() => calls.length === 2);
    calls[1].d.resolve('xong');
    calls[0].d.resolve('cũ');
    const box = el.querySelector('.td-timeline__detail');
    await waitFor(() => box.textContent === 'xong');
    expect(box.textContent).to.equal('xong');
    expect(el.querySelector('.td-timeline__loading')).to.equal(null);
  });

  it('SEC-02: at most MAX_TOTAL items in all (append / loadMore); the rest dropped, ONE warning, "Xem thêm" gone', async () => {
    const { MAX_TOTAL } = await import('../utils/timeline-model.js');
    const page = (p) => Array.from({ length: 1000 }, (_, i) => ({ id: `p${p}-${i}`, time: Date.UTC(2026, 0, 1) - (p * 1000 + i) * 60e3, title: 'x' }));
    const el = await mk(page(0), `time-zone="${VN}" has-more`, 720, { loadMore: async () => ({ items: page(9) }) });
    for (let p = 1; p < MAX_TOTAL / 1000; p++) el.append(page(p));
    expect(el.items.length).to.equal(MAX_TOTAL);
    expect(el.append(page(7))).to.equal(0);
    expect(el.items.length).to.equal(MAX_TOTAL);
    expect(el.querySelectorAll('li').length).to.equal(MAX_TOTAL);
    expect(el.querySelector('.td-timeline__more')).to.equal(null);
    expect(warns.filter((w) => w.includes('at most') && w.includes('in all')).length).to.equal(1);
  });
});

describe('td-timeline — review round 2 (SEC-04: bounded lazy details)', () => {
  const lazy = (n, expanded = true) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, time: Date.UTC(2026, 9, 5, 1) - i * 60e3, title: `D${i}`, details: true, expanded }));

  it('50 expanded lazy items → at most DETAIL_CONCURRENCY calls in flight, FIFO in display order, all load', async () => {
    const { DETAIL_CONCURRENCY } = await import('./td-timeline.js');
    let inFlight = 0;
    let peak = 0;
    const order = [];
    const pending = [];
    const el = await mk(lazy(50), undefined, 720, {
      renderDetails: (it) => {
        order.push(it.id);
        inFlight++;
        peak = Math.max(peak, inFlight);
        const d = deferred();
        pending.push(() => { inFlight--; d.resolve(`ok ${it.id}`); });
        return d.p;
      },
    });
    expect(DETAIL_CONCURRENCY).to.equal(6);
    while (pending.length) {
      pending.shift()();
      await tick();
    }
    await waitFor(() => [...el.querySelectorAll('.td-timeline__detail')].every((b) => b.textContent.startsWith('ok ')));
    expect(peak).to.equal(6);
    expect(order).to.deep.equal(lazy(50).map((i) => i.id));
    expect([...el.querySelectorAll('.td-timeline__detail')].every((b) => b.textContent === `ok ${b.closest('li').dataset.id}`)).to.equal(true);
  });

  it('closing a queued panel → its hook is never called', async () => {
    const called = [];
    const pending = [];
    const el = await mk(lazy(8), undefined, 720, {
      renderDetails: (it) => { called.push(it.id); const d = deferred(); pending.push(d); return d.p; },
    });
    expect(called.length).to.equal(6);
    const queued = el.querySelector('li[data-id="d7"] details');
    queued.open = false;
    await waitFor(() => !queued.open);
    await tick();
    await tick();
    for (const d of pending.splice(0)) d.resolve('x');
    await waitFor(() => called.includes('d6'));
    for (const d of pending.splice(0)) d.resolve('x');
    await tick();
    expect(called.includes('d7')).to.equal(false);
  });

  it('hook replacement mid-queue → the old queue is dropped (old hook never called again), the new hook is bounded too', async () => {
    const oldCalls = [];
    const newCalls = [];
    let inFlight = 0;
    let peak = 0;
    const oldPending = [];
    const el = await mk(lazy(20), undefined, 720, {
      renderDetails: (it) => { oldCalls.push(it.id); const d = deferred(); oldPending.push(d); return d.p; },
    });
    expect(oldCalls.length).to.equal(6);
    const pending = [];
    el.renderDetails = (it) => {
      newCalls.push(it.id);
      inFlight++;
      peak = Math.max(peak, inFlight);
      const d = deferred();
      pending.push(() => { inFlight--; d.resolve('mới'); });
      return d.p;
    };
    expect(newCalls.length).to.equal(0); // round 3: the aborted old calls hold their slots until they settle
    for (const d of oldPending) d.reject(new Error('aborted'));
    await waitFor(() => newCalls.length === 6);
    expect(newCalls.length).to.equal(6);
    while (pending.length) {
      pending.shift()();
      await tick();
    }
    await waitFor(() => newCalls.length === 20);
    expect(oldCalls.length).to.equal(6);
    expect(peak).to.equal(6);
  });

  it('assigning items / removing the element flushes the queue', async () => {
    const called = [];
    const el = await mk(lazy(10), undefined, 720, { renderDetails: (it) => { called.push(it.id); return deferred().p; } });
    expect(called.length).to.equal(6);
    el.items = [];
    await tick();
    expect(called.length).to.equal(6);
    const el2 = await mk(lazy(10), undefined, 720, { renderDetails: (it) => { called.push(`b-${it.id}`); return deferred().p; } });
    el2.parentElement.remove();
    await tick();
    expect(called.filter((c) => c.startsWith('b-')).length).to.equal(6);
  });
});

describe('td-timeline — review round 3 (SEC-04 slots held until settled, display order)', () => {
  const lazy = (n, expanded = true, p = 'd') => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, time: Date.UTC(2026, 9, 5, 1) - i * 60e3, title: `${p}${i}`, details: true, expanded }));

  it('aborted calls keep their slot until they settle: hook replacement, items assignment, re-render never exceed 6 unsettled calls', async () => {
    let unsettled = 0;
    let peak = 0;
    const pending = [];
    const hook = (tag) => (it) => {
      unsettled++;
      peak = Math.max(peak, unsettled);
      const d = deferred();
      pending.push({ tag, id: it.id, settle: () => { unsettled--; d.resolve(`${tag} ${it.id}`); } });
      return d.p;
    };
    const el = await mk(lazy(20), undefined, 720, { renderDetails: hook('a') });
    expect(unsettled).to.equal(6);
    el.renderDetails = hook('b'); // the 6 old calls never settled: no new call may start
    expect(unsettled).to.equal(6);
    expect(pending.filter((p) => p.tag === 'b').length).to.equal(0);
    el.setAttribute('heading-level', '4'); // structural re-render
    el.items = lazy(20, true, 'e'); // new items
    expect(unsettled).to.equal(6);
    pending.shift().settle(); // an old call settles → exactly one new call starts
    await tick();
    expect(unsettled).to.equal(6);
    expect(pending.filter((p) => p.tag === 'b').length).to.equal(1);
    while (pending.length) {
      pending.shift().settle();
      await tick();
    }
    await waitFor(() => [...el.querySelectorAll('.td-timeline__detail')].every((b) => b.textContent.startsWith('b ')));
    expect(peak).to.equal(6);
    expect(el.querySelectorAll('.td-timeline__detail').length).to.equal(20);
  });

  it('the queue follows display order, not open order', async () => {
    const called = [];
    const pending = [];
    const el = await mk(lazy(9, false), undefined, 720, {
      renderDetails: (it) => { called.push(it.id); const d = deferred(); pending.push(d); return d.p; },
    });
    const det = (id) => el.querySelector(`li[data-id="${id}"] details`);
    for (let i = 0; i < 6; i++) det(`d${i}`).open = true;
    await waitFor(() => called.length === 6);
    det('d8').open = true; // lower in the list, opened first
    await waitFor(() => el.querySelector('li[data-id="d8"] .td-timeline__loading'));
    det('d7').open = true; // higher, opened second
    await waitFor(() => el.querySelector('li[data-id="d7"] .td-timeline__loading'));
    pending.shift().resolve('x');
    await waitFor(() => called.length === 7);
    expect(called[6]).to.equal('d7');
  });
});
