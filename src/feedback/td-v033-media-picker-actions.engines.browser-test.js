import { expect } from '@esm-bundle/chai';

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 24-28, 31; "Test > Engines > Xoá / Tải về / Copy") — the
// detail actions and their security tests: confirm message as TEXT, server-decided `blocked` with usage links through
// safeLinkUrl, errors as curated toasts, abort on close; downloads through a temporary <a download> (never this page,
// never a blob in a tab), revoke; copy link only when allowed and safe.
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
const grid = () => q('td-media-grid');
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const ids = () => items().map((i) => i.getAttribute('data-id'));
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const detail = () => q('.td-media-picker__detail');
const detailName = () => q('.td-media-picker__detail-name')?.textContent || '';
const host = () => document.querySelector('td-media-picker');
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const deleteDialog = () => modalRoots().find((r) => r.textContent.includes('Xác nhận xoá')) || null;
const dlgButton = (d, text) => [...d.querySelectorAll('.td-modal__footer button')].find((b) => b.textContent.trim() === text);
const toastTexts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((t) => t.textContent);
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const assetName = (id) => `anh-${id.slice(1)}.jpg`;

async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  // v0.62.0: the dialog enters with scale(0.95) / translateY(100%) — measure only once that motion has finished
  await until(() => getComputedStyle(pickerRoot().querySelector('.td-media-picker__dialog')).transform === 'none', 4000, 'open motion');
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
async function view(id, name = assetName(id)) {
  click(opener(id));
  await until(() => detailName() === name && !detail().hasAttribute('data-loading'), 4000, `detail ${id}`);
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
const extra = [];
afterEach(async () => {
  await closeAll();
  extra.splice(0).forEach((f) => f());
});

describe('v0.33 td-media-picker — action row (decisions 18, 26)', () => {
  it('order Tải về · Copy · Xoá · Lưu, each only when offered (delete / downloadOriginal / copyLink are opt-in)', async () => {
    await openReady({ assetFields: [{ key: 'title', label: 'Tiêu đề', control: 'text' }] });
    await view('m60');
    const names = () => [...q('.td-media-picker__detail-actions').children].map((c) => [...c.classList].find((x) => x.startsWith('td-media-picker__')));
    expect(names()).to.deep.equal(['td-media-picker__save']);
    await closeAll();
    await openReady({ assetFields: [{ key: 'title', label: 'Tiêu đề', control: 'text' }],
      capabilities: { delete: true, downloadOriginal: true, copyLink: true } });
    await view('m60');
    // v0.36.0 (review ISSUE-3): the overflowed action is still in the row (shown ≥ 720, behind "Thêm" < 720) + the "Thêm" button
    expect(names()).to.deep.equal(['td-media-picker__download', 'td-media-picker__copy', 'td-media-picker__delete',
      'td-media-picker__detail-more', 'td-media-picker__save']);
    expect(q('.td-media-picker__delete').hasAttribute('data-overflow')).to.equal(true);
    const dl = q('.td-media-picker__download');
    expect([dl.getAttribute('variant'), dl.getAttribute('size'), dl.getAttribute('icon')]).to.deep.equal(['secondary', 'sm', 'download']);
    const del = q('.td-media-picker__delete');
    expect([del.getAttribute('variant'), del.getAttribute('size'), del.getAttribute('icon')]).to.deep.equal(['danger', 'sm', 'trash']);
    expect(q('.td-media-picker__copy').getAttribute('size')).to.equal('sm');
  });

  it('per-asset capabilities only narrow (delete: false on one asset hides its button)', async () => {
    const ad = createMockAdapter();
    ad.db.get('m60').capabilities = { delete: false };
    await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60');
    expect(q('.td-media-picker__delete') === null).to.equal(true);
    await view('m59');
    expect(q('.td-media-picker__delete') !== null).to.equal(true);
  });
});

describe('v0.33 td-media-picker — delete (decision 24)', () => {
  it('confirm: title / TEXT message (a <b>x</b> name shows literally) / Huỷ / Xoá danger; Huỷ → no call', async () => {
    const ad = createMockAdapter();
    ad.db.get('m60').name = '<b>x</b>';
    await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60', '<b>x</b>');
    q('.td-media-picker__delete').click();
    const d = await until(() => deleteDialog(), 4000, 'confirm');
    expect(d.querySelector('.td-modal__title').textContent).to.equal('Xác nhận xoá');
    expect(d.textContent.includes('Bạn có chắc muốn xoá "<b>x</b>"? Hành động này không thể hoàn tác.')).to.equal(true);
    expect(d.querySelector('.td-modal__body b') === null, 'no markup from the name').to.equal(true);
    expect(dlgButton(d, 'Xoá').className.includes('danger')).to.equal(true);
    dlgButton(d, 'Huỷ').click();
    await until(() => deleteDialog() === null, 4000, 'closed');
    expect(ad.calls.delete.length).to.equal(0);
  });

  it('deleted → gone from grid + selection, detail moves to the first selected asset (v0.36), no auto-select, current page reloaded, toast, asset-change / selection-change', async () => {
    const { ad, promise } = await openReady({ selection: { mode: 'multiple' }, capabilities: { delete: true } });
    click(tick('m60'));
    click(tick('m59'));
    await view('m60');
    const changes = [];
    const sel = [];
    host().addEventListener('asset-change', (e) => changes.push(e.detail));
    host().addEventListener('selection-change', (e) => sel.push(e.detail));
    const lists = ad.calls.list.length;
    q('.td-media-picker__delete').click();
    const d = await until(() => deleteDialog(), 4000, 'confirm');
    dlgButton(d, 'Xoá').click();
    await until(() => changes.length === 1, 4000, 'asset-change');
    expect(changes[0]).to.deep.equal({ operation: 'delete', id: 'm60' });
    const [id, o] = ad.calls.delete[0].args;
    expect(id).to.equal('m60');
    expect(o.signal instanceof AbortSignal).to.equal(true);
    expect(sel.at(-1).removedIds).to.deep.equal(['m60']);
    await until(() => ad.calls.list.length > lists && !item('m60'), 4000, 'reloaded');
    expect(ad.calls.list.at(-1).args[0].cursor).to.equal(null);
    // v0.36.0 (review ISSUE-2): the deleted asset leaves the detail; after the reload the auto preview shows the first
    // SELECTED asset still in the results (m59) — viewed, never auto-selected
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-59.jpg', 4000, 'preview of the first selected');
    expect(items().filter((i) => i.hasAttribute('data-viewing')).map((i) => i.getAttribute('data-id'))).to.deep.equal(['m59']);
    expect(grid().selectedIds).to.deep.equal(['m59']);
    await until(() => toastTexts().includes('Đã xoá anh-60.jpg'), 4000, 'toast');
    await until(() => deleteDialog() === null, 4000, 'confirm closed');
    q('.td-media-picker__confirm').click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m59']);
  });

  it('the last item of the last page deleted → the empty page steps back one page', async () => {
    const { ad } = await openReady({ pageSize: 20, capabilities: { delete: true } }, { count: 21 });
    q('.td-media-picker__next').click();
    await until(() => ids().join() === 'm1', 4000, 'page 2');
    await view('m1');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    await until(() => ids()[0] === 'm21' && ids().length === 20, 4000, 'back on page 1');
    expect(ad.calls.list.at(-1).args[0].cursor).to.equal(null);
    expect(q('.td-media-picker__pager').hidden, 'one page left').to.equal(true);
  });

  it('blocked → warning alert in the detail: count, usages (javascript: href = plain text, valid = target _blank + rel noopener noreferrer, HTML label literal); nothing removed; gone on asset change', async () => {
    const { ad } = await openReady({ capabilities: { delete: true } });
    const changes = [];
    host().addEventListener('asset-change', (e) => changes.push(e.detail));
    await view('m31'); // 31 % 7 = 3 → blocked
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    const al = await until(() => q('.td-media-picker__blocked'), 4000, 'alert');
    expect(al.localName).to.equal('td-alert');
    expect(al.getAttribute('variant')).to.equal('warning');
    expect(al.getAttribute('heading')).to.equal('Không xoá được');
    expect(al.textContent.includes('Media đang được dùng ở 3 nơi.')).to.equal(true);
    const rows = [...al.querySelectorAll('.td-media-picker__usages > li')];
    expect(rows.length).to.equal(3);
    const a = rows[0].querySelector('a');
    expect(a.getAttribute('href')).to.equal(new URL('/admin/posts/12', location.href).href);
    expect(a.target).to.equal('_blank');
    expect(a.rel).to.equal('noopener noreferrer');
    expect(rows[0].textContent).to.equal('Bài viết: Ra mắt sản phẩm mới (Bài viết)');
    expect(rows[1].querySelector('a') === null, 'javascript: href → plain text').to.equal(true);
    expect(rows[1].textContent.startsWith('Sản phẩm: Tai nghe X')).to.equal(true);
    expect(rows[2].querySelector('img') === null).to.equal(true);
    expect(rows[2].textContent.startsWith('<img src=x onerror=alert(1)> Banner trang chủ')).to.equal(true);
    expect(item('m31') !== null).to.equal(true);
    expect(changes.length).to.equal(0);
    await until(() => deleteDialog() === null, 4000, 'confirm closed');
    await view('m60');
    expect(q('.td-media-picker__blocked') === null, 'alert removed on asset change').to.equal(true);
    void ad;
  });

  it('blocked with many usages → 20 rows + "… và k nơi khác"', async () => {
    const ad = createMockAdapter();
    ad.delete = async () => ({ status: 'blocked', reason: 'in-use', usageCount: 30, truncated: true,
      usages: Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, label: `Nơi ${i}` })) });
    await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    const al = await until(() => q('.td-media-picker__blocked'), 4000, 'alert');
    const rows = [...al.querySelectorAll('.td-media-picker__usages > li')];
    expect(rows.length).to.equal(21);
    expect(rows[20].textContent).to.equal('… và 10 nơi khác');
  });

  it('focus returns to "Xoá" after the confirm closes, even when the detail re-rendered meanwhile (late get)', async () => {
    const ad = createMockAdapter();
    const realGet = ad.get.bind(ad);
    let release = () => {};
    const gate = new Promise((r) => { release = r; });
    ad.get = (...a) => gate.then(() => realGet(...a));
    await openReady({ adapter: ad, capabilities: { delete: true } });
    click(opener('m59')); // m59: the mock answers blocked
    const first = await until(() => q('.td-media-picker__delete'), 4000, 'delete button (cached render)');
    const inner = first.querySelector('button');
    inner.focus();
    click(inner);
    const dlg = await until(() => deleteDialog(), 4000, 'confirm');
    release(); // the fresh snapshot re-renders the panel: the confirm's opener node is gone
    await until(() => !first.isConnected, 4000, 'detail re-rendered');
    dlgButton(dlg, 'Xoá').click();
    await until(() => q('.td-media-picker__blocked'), 4000, 'blocked alert');
    await until(() => deleteDialog() === null, 4000, 'confirm closed');
    const now = q('.td-media-picker__delete');
    await until(() => now.contains(document.activeElement), 2000, 'focus on the new "Xoá"');
  });

  it('blocked with a count but NO summaries → the list still says "… và k nơi khác"', async () => {
    const ad = createMockAdapter();
    ad.delete = async () => ({ status: 'blocked', reason: 'in-use', usageCount: 4, usages: [] });
    await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    const al = await until(() => q('.td-media-picker__blocked'), 4000, 'alert');
    const rows = [...al.querySelectorAll('.td-media-picker__usages > li')];
    expect(rows.length).to.equal(1);
    expect(rows[0].textContent).to.equal('… và 4 nơi khác');
    expect(al.textContent.includes('4 nơi')).to.equal(true);
  });

  it('contract-inconsistent blocked result (usageCount < usages) → malformed path: server toast, no alert, item kept', async () => {
    const ad = createMockAdapter();
    ad.delete = async () => ({ status: 'blocked', reason: 'in-use', usageCount: 1,
      usages: [{ id: 'u1', label: 'A' }, { id: 'u2', label: 'B' }] });
    await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    await until(() => toastTexts().includes(TdMediaPicker.labels.error.server), 4000, 'server toast');
    expect(q('.td-media-picker__blocked') === null).to.equal(true);
    expect(item('m60') !== null).to.equal(true);
  });

  it('forbidden → toast with the userMessage only + operation-error; malformed result → server text', async () => {
    const ad = createMockAdapter();
    let n = 0;
    ad.delete = async () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error('raw /etc/secret'), { code: 'forbidden', userMessage: 'Bạn không được xoá media này.' });
      return { status: 'gone' };
    };
    const errs = [];
    const logged = [];
    const real = {};
    for (const k of ['warn', 'error', 'log']) { real[k] = console[k]; console[k] = (...a) => logged.push(a); }
    extra.push(() => { for (const k of Object.keys(real)) console[k] = real[k]; });
    await openReady({ adapter: ad, capabilities: { delete: true } });
    host().addEventListener('operation-error', (e) => errs.push(e.detail));
    await view('m60');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    await until(() => toastTexts().includes('Bạn không được xoá media này.'), 4000, 'toast');
    // review SEC-2 kept: no raw error object / message reaches the console (TdModal never sees a rejection either)
    for (const args of logged) for (const a of args) {
      expect(typeof a, String(a).slice(0, 60)).to.equal('string');
      expect(a.includes('/etc/secret')).to.equal(false);
    }
    expect(errs[0]).to.deep.equal({ operation: 'delete', code: 'forbidden', retryable: false });
    expect(document.body.textContent.includes('/etc/secret')).to.equal(false);
    await until(() => deleteDialog() === null, 4000, 'confirm closed');
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    await until(() => errs.length === 2, 4000, 'contract error');
    expect(errs[1].code).to.equal('server');
    await until(() => toastTexts().includes(TdMediaPicker.labels.error.server), 4000, 'server toast');
    expect(item('m60') !== null).to.equal(true);
  });

  it('closing the picker while deleting → the delete signal aborts; the confirm closes; nothing changes later', async () => {
    const ad = createMockAdapter();
    const { promise } = await openReady({ adapter: ad, capabilities: { delete: true } });
    await view('m60');
    ad.manual = true;
    const events = [];
    host().addEventListener('asset-change', (e) => events.push(e.detail));
    q('.td-media-picker__delete').click();
    dlgButton(await until(() => deleteDialog(), 4000, 'confirm'), 'Xoá').click();
    await until(() => ad.calls.delete.length === 1, 4000, 'delete called');
    host().close();
    await promise;
    expect(ad.calls.delete[0].signal.aborted).to.equal(true);
    await until(() => deleteDialog() === null, 4000, 'confirm closed');
    ad.ignoreSignal = true;
    ad.resolveAll();
    await wait(30);
    expect(events.length).to.equal(0);
  });
});

describe('v0.33 td-media-picker — download (decision 25)', () => {
  /** capture (and stop) every temporary download-link click; spies on object URLs / window.open */
  function spies() {
    const clicked = [];
    const onClick = (e) => {
      const a = e.target instanceof Element ? e.target.closest('a') : null;
      if (!a || !a.classList.contains('td-media-picker__download-link')) return;
      e.preventDefault(); // never navigate / download for real in the test
      clicked.push({ href: a.getAttribute('href'), download: a.getAttribute('download'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), connected: a.isConnected });
    };
    document.addEventListener('click', onClick, true);
    const created = [];
    const revoked = [];
    const opened = [];
    const { createObjectURL, revokeObjectURL } = URL;
    const open = window.open;
    URL.createObjectURL = (b) => { const u = createObjectURL.call(URL, b); created.push(u); return u; };
    URL.revokeObjectURL = (u) => { revoked.push(u); return revokeObjectURL.call(URL, u); };
    window.open = (...a) => { opened.push(a); return null; };
    extra.push(() => {
      document.removeEventListener('click', onClick, true);
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      window.open = open;
    });
    return { clicked, created, revoked, opened };
  }

  it('url (same origin) → <a download="{filename}" rel="noopener noreferrer"> clicked once, removed, no target; then blob → object URL, revoked; never window.open', async () => {
    const sp = spies();
    const { ad } = await openReady({ capabilities: { downloadOriginal: true } });
    await view('m60');
    const href0 = location.href;
    const btn = q('.td-media-picker__download');
    btn.click();
    await until(() => sp.clicked.length === 1, 4000, 'url download');
    expect(ad.calls.download[0].args[0]).to.equal('m60');
    expect(ad.calls.download[0].args[1].rendition).to.equal('original');
    const c = sp.clicked[0];
    expect(c.href).to.equal(new URL(ad.db.get('m60').urls.preview, location.href).href);
    expect(c.download).to.equal('anh-60.jpg');
    expect(c.rel).to.equal('noopener noreferrer');
    expect(c.target).to.equal(null);
    expect(c.connected).to.equal(true);
    expect(document.querySelector('.td-media-picker__download-link') === null, 'removed').to.equal(true);
    await until(() => !btn.hasAttribute('loading'), 4000, 'button idle');
    btn.click();
    await until(() => sp.clicked.length === 2, 4000, 'blob download');
    expect(sp.created.length).to.equal(1);
    expect(sp.clicked[1].href).to.equal(sp.created[0]);
    expect(sp.clicked[1].href.startsWith('blob:')).to.equal(true);
    expect(sp.clicked[1].target).to.equal(null);
    await until(() => sp.revoked.includes(sp.created[0]), 4000, 'revoked');
    expect(sp.opened.length).to.equal(0);
    expect(location.href).to.equal(href0);
  });

  it('cross-origin url → target="_blank" (never this page)', async () => {
    const sp = spies();
    const ad = createMockAdapter();
    ad.download = async () => ({ url: 'https://cdn.example.com/goc/anh-60.jpg', filename: 'anh-60.jpg' });
    await openReady({ adapter: ad, capabilities: { downloadOriginal: true } });
    await view('m60');
    q('.td-media-picker__download').click();
    await until(() => sp.clicked.length === 1, 4000, 'download');
    expect(sp.clicked[0].href).to.equal('https://cdn.example.com/goc/anh-60.jpg');
    expect(sp.clicked[0].target).to.equal('_blank');
    expect(sp.clicked[0].rel).to.equal('noopener noreferrer');
  });

  it('javascript: url → error toast, nothing clicked, no navigation; expired → "Liên kết tải đã hết hạn"; loading while pending', async () => {
    const sp = spies();
    const ad = createMockAdapter({ unsafeDownloadId: 'm60' });
    const errs = [];
    await openReady({ adapter: ad, capabilities: { downloadOriginal: true } });
    host().addEventListener('operation-error', (e) => errs.push(e.detail));
    await view('m60');
    const href0 = location.href;
    q('.td-media-picker__download').click();
    await until(() => errs.length === 1, 4000, 'error');
    expect(errs[0]).to.deep.equal({ operation: 'download', code: 'server', retryable: true });
    await until(() => toastTexts().includes(TdMediaPicker.labels.error.server), 4000, 'toast');
    expect(sp.clicked.length).to.equal(0);
    expect(location.href).to.equal(href0);
    // expired
    ad.download = async () => ({ url: '/x.jpg', filename: 'x.jpg', expiresAt: new Date(Date.now() - 60000).toISOString() });
    q('.td-media-picker__download').click();
    await until(() => toastTexts().includes('Liên kết tải đã hết hạn'), 4000, 'expired toast');
    expect(sp.clicked.length).to.equal(0);
    // loading while pending
    let release;
    ad.download = () => new Promise((r) => { release = r; });
    const btn = q('.td-media-picker__download');
    btn.click();
    await until(() => btn.hasAttribute('loading'), 4000, 'loading');
    release({ url: '/y.jpg', filename: 'y.jpg' });
    await until(() => !btn.hasAttribute('loading') && sp.clicked.length === 1, 4000, 'done');
  });

  it('closing the picker revokes leftover object URLs and aborts a pending download', async () => {
    const sp = spies();
    const ad = createMockAdapter();
    const { promise } = await openReady({ adapter: ad, capabilities: { downloadOriginal: true } });
    await view('m60');
    ad.manual = true;
    q('.td-media-picker__download').click();
    await until(() => ad.calls.download.length === 1, 4000, 'called');
    host().close();
    await promise;
    expect(ad.calls.download[0].signal.aborted).to.equal(true);
    expect(sp.clicked.length).to.equal(0);
  });
});

describe('v0.33 td-media-picker — copy link (decision 27)', () => {
  it('copyLink default false → no td-copy; true → td-copy size sm with the ABSOLUTE safe preview URL; an unsafe URL → no button', async () => {
    const ad = createMockAdapter();
    ad.db.get('m59').urls = { thumbnail: 'javascript:alert(1)', preview: 'javascript:alert(1)' };
    await openReady({ adapter: ad });
    await view('m60');
    expect(q('td-copy') === null).to.equal(true);
    await closeAll();
    await openReady({ adapter: ad, capabilities: { copyLink: true } });
    await view('m60');
    const cp = q('.td-media-picker__copy');
    expect(cp.localName).to.equal('td-copy');
    expect(cp.getAttribute('size')).to.equal('sm');
    expect(cp.getAttribute('value')).to.equal(new URL(ad.db.get('m60').urls.preview, location.href).href);
    expect(/^https?:\/\//.test(cp.getAttribute('value'))).to.equal(true);
    await view('m59');
    expect(q('.td-media-picker__copy') === null).to.equal(true);
  });
});
