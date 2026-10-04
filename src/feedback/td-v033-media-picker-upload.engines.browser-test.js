import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, Test → "Dialog tải lên" + "URL") — the nested upload dialog module
// (media-picker-upload.js) driven directly, in Chromium, Firefox AND WebKit (group `engines`). Mock adapter
// (test/fixtures/media-adapter.js, manual mode: the test settles each call), stub callbacks; no network. Waits on real
// signals (events / polled conditions), never fixed sleeps before an assertion. DOM nodes compared as booleans.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { openUploadDialog, UPLOAD_LABELS } = await import('./media-picker-upload.js');
const { openDialogLayer } = await import('./dialog-layer.js');
const { TdToast } = await import('./td-toast.js');
const { LAYERS } = await import('../utils/layers.js');
const { formatLabel, normalizeFields } = await import('../utils/media-picker-core.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const LABELS = {
  ...UPLOAD_LABELS,
  error: { validation: 'Dữ liệu chưa hợp lệ.', server: 'Có lỗi xảy ra. Thử lại sau.', network: 'Không kết nối được.' },
};
const t = (k, p) => formatLabel(LABELS, {}, k, p);

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
const file = (name = 'moi.png', type = 'image/png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type });
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }));
/** the inner native button of a td-button (clicks on a disabled one do nothing, like a user's) */
const press = (tdBtn) => click(tdBtn.querySelector('button') || tdBtn);
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker-upload)')]
  .filter((r) => r.getAttribute('data-state') !== 'closing');
const confirmDialog = () => modalRoots().find((r) => r.textContent.includes(UPLOAD_LABELS.uploadCancelTitle)) || null;
const answerConfirm = (yes) => {
  const d = confirmDialog();
  const btns = [...d.querySelectorAll('.td-modal__footer .td-btn')];
  click(btns.find((b) => b.textContent.includes(yes ? UPLOAD_LABELS.uploadCancelConfirm : UPLOAD_LABELS.uploadCancelKeep)));
};
const toasts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((m) => m.textContent);

/** @type {Array<{ destroy(): void }>} */
let opened = [];
/** @type {Array<{ release(): void }>} */
let layers = [];

/**
 * Open the dialog with a stub picker side. @returns the handle + recorders
 * @param {object} [over]
 */
function open(over = {}) {
  const rec = { uploaded: [], errors: [], announced: [], closed: 0 };
  const ad = over.adapter || createMockAdapter({ manual: true });
  const h = openUploadDialog({
    t,
    adapter: ad,
    context: { site: 'test' },
    sources: over.sources || { file: true, url: true },
    upload: over.upload || { accept: 'image/*,.pdf', maxSize: '5MB', multiple: true },
    uploadFields: over.uploadFields || [],
    metaKeys: ['album', 'title'],
    idPrefix: `t${opened.length}-up`,
    onUploaded: (asset, dedup, op) => rec.uploaded.push({ asset, dedup, op }),
    onError: (e) => rec.errors.push(e),
    announce: (s) => rec.announced.push(s),
    onClosed: () => { rec.closed += 1; },
  });
  opened.push(h);
  const q = (sel) => h.root.querySelector(sel);
  return {
    h, ad, rec, q,
    dz: () => q('td-dropzone'),
    field: () => q('.td-media-picker-upload__url'),
    input: () => q('.td-media-picker-upload__url input'),
    submit: () => q('.td-media-picker-upload__submit'),
    abort: () => q('.td-media-picker-upload__abort'),
    error: () => q('.td-media-picker-upload__url')?.getAttribute('error-text') || '',
    shownError: () => q('.td-media-picker-upload__url .td-field-error')?.textContent || '',
    isOpen: () => h.root.isConnected && h.root.getAttribute('data-state') === 'open',
    gone: () => !h.root.isConnected,
  };
}

/** a picker-like underlying dialog layer */
function underlying() {
  const root = document.createElement('div');
  root.className = 'td-modal td-modal--lg';
  root.setAttribute('data-state', 'open');
  root.innerHTML = '<div class="td-modal__backdrop"></div><div class="td-modal__dialog" role="dialog" aria-modal="true" tabindex="-1">'
    + '<button type="button" class="opener">Tải lên</button></div>';
  const dialog = /** @type {HTMLElement} */ (root.querySelector('.td-modal__dialog'));
  const rec = { escapes: 0 };
  const handle = openDialogLayer({ root, dialog, layer: LAYERS.modal, onEscape: () => { rec.escapes += 1; return true; } });
  layers.push(handle);
  return { root, handle, rec, opener: /** @type {HTMLElement} */ (root.querySelector('.opener')) };
}

async function typeUrl(o, text) {
  o.input().focus();
  await sendKeys({ type: text });
}

describe('v0.33.0 media picker upload dialog (engines)', () => {
  afterEach(async () => {
    for (const h of opened) { try { h.destroy(); } catch { /* ignore */ } }
    opened = [];
    for (const l of layers) { try { l.release(); } catch { /* ignore */ } }
    layers = [];
    for (const r of modalRoots()) r.remove();
    try { TdToast.clear(); } catch { /* ignore */ }
    await until(() => !document.querySelector('.td-media-picker-upload'), 2000, 'roots removed');
  });

  describe('dialog', () => {
    it('stacks above an underlying dialog layer; Escape closes only the upload dialog; focus goes back to the opener', async () => {
      const base = underlying();
      base.opener.focus();
      const o = open();
      await until(o.isOpen, 3000, 'upload dialog open');
      const zUp = Number(getComputedStyle(o.h.root).zIndex);
      const zBase = Number(getComputedStyle(base.root).zIndex);
      expect(zUp >= zBase, `z ${zUp} >= ${zBase}`).to.equal(true);
      // paint order: the centre of the viewport hits the upload dialog, not the layer below
      const r = o.q('.td-modal__dialog').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
      expect(!!hit && o.h.root.contains(hit)).to.equal(true);
      expect(base.root.hasAttribute('inert') || !!base.root.closest('[inert]')).to.equal(true);
      expect(o.h.root.contains(document.activeElement)).to.equal(true);
      expect(o.q('.td-modal__title').textContent).to.equal('Tải lên media');
      await sendKeys({ press: 'Escape' });
      await until(o.gone, 3000, 'upload dialog removed');
      expect(o.rec.closed).to.equal(1);
      expect(base.rec.escapes).to.equal(0);
      expect(base.root.isConnected).to.equal(true);
      expect(document.activeElement === base.opener).to.equal(true);
    });

    it('md width on desktop; full viewport below 768px (not the bottom sheet)', async () => {
      await setViewport({ width: 1280, height: 800 });
      try {
        const o = open();
        await until(o.isOpen);
        const dlg = o.q('.td-modal__dialog');
        await until(() => Math.abs(dlg.getBoundingClientRect().width - 512) < 2, 2000, 'md width');
        o.h.destroy();
        await setViewport({ width: 390, height: 844 });
        const p = open();
        await until(p.isOpen);
        const d2 = p.q('.td-modal__dialog');
        await until(() => {
          const r = d2.getBoundingClientRect();
          return Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 && Math.abs(r.top) < 1;
        }, 3000, 'full viewport');
        expect(getComputedStyle(d2).borderTopLeftRadius).to.equal('0px');
      } finally {
        await setViewport({ width: 1280, height: 800 });
      }
    });

    it('× and "Đóng" close it (not busy → no confirmation)', async () => {
      const o = open();
      await until(o.isOpen);
      expect(await o.h.close()).to.equal(true);
      await until(o.gone);
      expect(confirmDialog() === null).to.equal(true);
      const p = open();
      await until(p.isOpen);
      press(p.q('.td-media-picker-upload__close'));
      await until(p.gone);
      expect(p.rec.closed).to.equal(1);
    });

    it('tabs only with both sources; sources.url false → no URL tab; url only → no tabs', async () => {
      const both = open();
      const tabs = both.q('td-tabs');
      expect(!!tabs).to.equal(true);
      expect(tabs.getAttribute('size')).to.equal('sm');
      await until(() => tabs.querySelectorAll('[role="tab"]').length === 2);
      expect([...tabs.querySelectorAll('.td-tabs__label')].map((l) => l.textContent)).to.deep.equal(['Tải file', 'Tải từ URL']);
      // the URL panel is hidden until its tab is selected
      const urlPanel = both.q('[data-source="url"]');
      expect(urlPanel.hidden).to.equal(true);
      click(tabs.querySelectorAll('[role="tab"]')[1]);
      await until(() => !urlPanel.hidden);
      expect(both.q('[data-source="file"]').hidden).to.equal(true);

      const fileOnly = open({ sources: { file: true, url: false } });
      expect(!!fileOnly.q('td-tabs')).to.equal(false);
      expect(!!fileOnly.dz()).to.equal(true);
      expect(!!fileOnly.field()).to.equal(false);

      const urlOnly = open({ sources: { file: false, url: true } });
      expect(!!urlOnly.q('td-tabs')).to.equal(false);
      expect(!!urlOnly.dz()).to.equal(false);
      expect(!!urlOnly.field()).to.equal(true);
      expect(urlOnly.q('[data-source="url"]').hidden).to.equal(false);
    });

    it('dropzone: stacked prompt + badges, accept-label derived from accept (or upload.acceptLabel)', async () => {
      const o = open({ sources: { file: true, url: false } });
      const dz = o.dz();
      expect(dz.hasAttribute('multiple')).to.equal(true);
      expect(dz.getAttribute('prompt-title')).to.equal('Kéo thả file vào đây');
      expect(dz.getAttribute('prompt-text')).to.equal('hoặc bấm để chọn file');
      expect(dz.getAttribute('hint-style')).to.equal('badges');
      expect(dz.getAttribute('accept-label')).to.equal('image/*, PDF');
      expect(dz.getAttribute('max-size')).to.equal('5MB');
      const p = open({ sources: { file: true, url: true }, upload: { accept: 'image/*', acceptLabel: 'JPG, PNG' } });
      expect(p.dz().getAttribute('accept-label')).to.equal('JPG, PNG');
      expect(p.q('.td-media-picker-upload__desc').textContent).to.equal('Nhập URL ảnh để tải trực tiếp. Hỗ trợ: JPG, PNG');
    });

    it('a required upload field locks BOTH sources (+ hint) until it has a value', async () => {
      const uploadFields = normalizeFields([{ key: 'title', label: 'Tiêu đề', control: 'text', required: true }]);
      const o = open({ uploadFields });
      await until(o.isOpen);
      const hint = o.q('.td-media-picker-upload__hint');
      expect(hint.hidden).to.equal(false);
      expect(o.dz().hasAttribute('disabled')).to.equal(true);
      o.field().value = 'https://example.com/a.jpg';
      o.field().dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { value: o.field().value } }));
      expect(o.submit().hasAttribute('disabled')).to.equal(true);
      const ctl = /** @type {HTMLInputElement} */ (o.q('.td-media-picker-upload__fields input'));
      ctl.focus();
      await sendKeys({ type: 'Ảnh bìa' });
      await until(() => hint.hidden, 2000, 'unlocked');
      expect(o.dz().hasAttribute('disabled')).to.equal(false);
      expect(o.submit().hasAttribute('disabled')).to.equal(false);
    });
  });

  describe('file tab', () => {
    it('captured fields + progress; all succeed → onUploaded per file, toast {ok}/{total}, dialog closes', async () => {
      const ad = createMockAdapter({ uploadStepMs: 5 }); // auto mode: fake progress, then created
      const o = open({ adapter: ad, sources: { file: true, url: false } });
      await until(o.isOpen);
      o.dz().addFiles([file('a.png'), file('b.png')]);
      expect(o.h.busy()).to.equal(true);
      expect(ad.calls.upload.length).to.equal(2);
      expect(ad.calls.upload[0].args[1].context).to.deep.equal({ site: 'test' });
      await until(o.gone, 4000, 'dialog closed after success');
      expect(o.rec.uploaded.map((u) => [u.asset.name, u.dedup.outcome, u.op])).to.deep.equal([
        ['a.png', 'created', 'upload'], ['b.png', 'created', 'upload']]);
      await until(() => toasts().includes('Đã tải lên 2/2 tệp'), 2000, 'toast');
      expect(o.rec.closed).to.equal(1);
    });

    it('an error keeps the dialog open (error row, userMessage only); exact-reused note shown', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad, sources: { file: true, url: false } });
      await until(o.isOpen);
      o.dz().addFiles([file('anh-1.jpg'), file('x.png')]); // anh-1.jpg exists → exact-reused (default result)
      ad.calls.upload[0].resolve();
      ad.calls.upload[1].reject(Object.assign(new Error('<img src=x onerror=alert(1)> SQLSTATE[42000]'), {
        code: 'validation', userMessage: 'Ảnh quá lớn.' }));
      await until(() => o.q('.td-dropzone__item[data-status="error"]'), 3000, 'error row');
      const row = o.q('.td-dropzone__item[data-status="error"]');
      expect(row.textContent.includes('Ảnh quá lớn.')).to.equal(true);
      expect(row.textContent.includes('SQLSTATE')).to.equal(false);
      expect(!!o.h.root.querySelector('img[src="x"]')).to.equal(false);
      await until(() => toasts().includes('Đã tải lên 1/2 tệp'), 2000, 'toast 1/2');
      expect(o.isOpen()).to.equal(true);
      expect(o.rec.uploaded.length).to.equal(1);
      expect(o.rec.uploaded[0].dedup).to.deep.equal({ outcome: 'exact-reused', matchedAssetId: 'm1' });
      expect(o.q('.td-media-picker-upload__note').textContent).to.equal('anh-1.jpg đã có trong thư viện — dùng lại ảnh cũ');
      expect(o.rec.errors).to.deep.equal([{ operation: 'upload', code: 'validation', retryable: false }]);
    });

    it('closing while uploading asks "Huỷ các tệp đang tải?": no → keeps going; yes → aborts (signal.aborted) and closes', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad, sources: { file: true, url: false } });
      await until(o.isOpen);
      o.dz().addFiles([file('a.png')]);
      const signal = ad.calls.upload[0].signal;
      let closing = o.h.close();
      await until(confirmDialog, 2000, 'confirm');
      answerConfirm(false);
      expect(await closing).to.equal(false);
      expect(signal.aborted).to.equal(false);
      expect(o.isOpen()).to.equal(true);
      closing = o.h.close();
      await until(() => confirmDialog() && confirmDialog().getAttribute('data-state') === 'open', 2000, 'confirm 2');
      answerConfirm(true);
      expect(await closing).to.equal(true);
      expect(signal.aborted).to.equal(true);
      await until(o.gone);
      expect(o.rec.uploaded.length).to.equal(0);
      expect(o.rec.errors.length).to.equal(0);
    });

    it('destroy() aborts at once without a confirmation and never calls onClosed', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad });
      await until(o.isOpen);
      o.dz().addFiles([file('a.png')]);
      const signal = ad.calls.upload[0].signal;
      o.h.destroy();
      expect(signal.aborted).to.equal(true);
      expect(o.gone()).to.equal(true);
      expect(confirmDialog() === null).to.equal(true);
      expect(o.rec.closed).to.equal(0);
    });

    it('a destroy() while the busy confirmation is open closes that confirmation too', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad });
      await until(o.isOpen);
      o.dz().addFiles([file('a.png')]);
      const closing = o.h.close();
      await until(confirmDialog, 2000, 'confirm');
      o.h.destroy();
      expect(await closing).to.equal(false);
      await until(() => confirmDialog() === null, 2000, 'confirm closed');
    });
  });

  describe('URL tab', () => {
    it('submit disabled while invalid; the error shows on blur, never while typing; empty → no error', async () => {
      const o = open({ sources: { file: false, url: true } });
      await until(o.isOpen);
      expect(o.submit().hasAttribute('disabled')).to.equal(true);
      await typeUrl(o, 'ftp://example.com/a.jpg');
      expect(o.error()).to.equal('');
      expect(o.submit().hasAttribute('disabled')).to.equal(true);
      o.input().blur();
      await until(() => o.error() === 'Chỉ nhận http hoặc https', 2000, 'scheme error on blur');
      await until(() => o.shownError() === 'Chỉ nhận http hoặc https', 2000, 'rendered error');
      // typing again clears it (never shown while typing)
      o.input().focus();
      await sendKeys({ press: 'Backspace' });
      expect(o.error()).to.equal('');
      o.field().value = 'https://user:pw@example.com/a.jpg';
      o.input().blur();
      o.field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(o.error()).to.equal('URL không được chứa thông tin đăng nhập');
      o.field().value = 'not a url';
      o.field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(o.error()).to.equal('URL không hợp lệ');
      o.field().value = `https://example.com/${'a'.repeat(2100)}`;
      o.field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(o.error()).to.equal('URL quá dài');
      o.field().value = '   ';
      o.field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(o.error()).to.equal('');
      expect(o.submit().hasAttribute('disabled')).to.equal(true);
    });

    it('Enter submits: the adapter gets the NORMALISED href + the captured fields; success → toast + close', async () => {
      const ad = createMockAdapter({ manual: true });
      const uploadFields = normalizeFields([{ key: 'title', label: 'Tiêu đề', control: 'text' }]);
      const o = open({ adapter: ad, uploadFields, sources: { file: true, url: true } });
      await until(o.isOpen);
      const ctl = /** @type {HTMLInputElement} */ (o.q('.td-media-picker-upload__fields input'));
      ctl.focus();
      await sendKeys({ type: 'Bìa' });
      click(o.q('td-tabs [role="tab"]:nth-of-type(2)') || o.q('td-tabs').querySelectorAll('[role="tab"]')[1]);
      await until(() => !o.q('[data-source="url"]').hidden);
      await typeUrl(o, '  HTTPS://Example.COM/a b.jpg  ');
      await until(() => !o.submit().hasAttribute('disabled'), 2000, 'submit enabled');
      await sendKeys({ press: 'Enter' });
      await until(() => ad.calls.uploadFromUrl.length === 1, 2000, 'uploadFromUrl called');
      const [href, opts] = ad.calls.uploadFromUrl[0].args;
      expect(href).to.equal('https://example.com/a%20b.jpg');
      expect(opts.fields).to.deep.equal({ title: 'Bìa' });
      expect(opts.context).to.deep.equal({ site: 'test' });
      // running: loading + Huỷ + progress; single-flight
      expect(o.submit().hasAttribute('loading')).to.equal(true);
      expect(o.abort().hidden).to.equal(false);
      expect(o.q('.td-media-picker-upload__progress').hidden).to.equal(false);
      expect(o.h.busy()).to.equal(true);
      await sendKeys({ press: 'Enter' });
      press(o.submit());
      expect(ad.calls.uploadFromUrl.length).to.equal(1);
      opts.onProgress({ loaded: 1, total: 4 });
      expect(o.q('.td-media-picker-upload__progress').getAttribute('value')).to.equal('25');
      ad.calls.uploadFromUrl[0].resolve();
      await until(o.gone, 3000, 'closed after success');
      expect(o.rec.uploaded.map((u) => [u.asset.name, u.dedup.outcome, u.op])).to.deep.equal([['a b.jpg', 'created', 'upload-url']]);
      await until(() => toasts().includes('Đã tải lên từ URL'), 2000, 'toast');
    });

    it('the button submits too; "Huỷ" aborts silently (signal.aborted, no error, stays open)', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad, sources: { file: false, url: true } });
      await until(o.isOpen);
      await typeUrl(o, 'https://example.com/b.jpg');
      await until(() => !o.submit().hasAttribute('disabled'));
      press(o.submit());
      await until(() => ad.calls.uploadFromUrl.length === 1);
      const { signal } = ad.calls.uploadFromUrl[0];
      press(o.abort());
      expect(signal.aborted).to.equal(true);
      await until(() => o.abort().hidden, 2000, 'Huỷ hidden');
      expect(o.submit().hasAttribute('loading')).to.equal(false);
      expect(o.h.busy()).to.equal(false);
      expect(o.error()).to.equal('');
      expect(o.rec.errors.length).to.equal(0);
      expect(o.isOpen()).to.equal(true);
    });

    it('exact-reused with a wrong matchedAssetId → contract error, no onUploaded, stays open', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad, sources: { file: false, url: true } });
      await until(o.isOpen);
      await typeUrl(o, 'https://example.com/c.jpg');
      await until(() => !o.submit().hasAttribute('disabled'));
      press(o.submit());
      await until(() => ad.calls.uploadFromUrl.length === 1);
      const asset = ad.db.get('m1');
      ad.calls.uploadFromUrl[0].resolve({ asset: JSON.parse(JSON.stringify(asset)), deduplication: { outcome: 'exact-reused', matchedAssetId: 'm2' } });
      await until(() => o.error() === UPLOAD_LABELS.uploadError, 2000, 'contract error');
      expect(o.rec.uploaded.length).to.equal(0);
      expect(o.isOpen()).to.equal(true);
    });

    it('error { message: <img onerror>SQL…, userMessage } → only userMessage, as literal text', async () => {
      const ad = createMockAdapter({ manual: true });
      const o = open({ adapter: ad, sources: { file: false, url: true } });
      await until(o.isOpen);
      await typeUrl(o, 'https://example.com/d.jpg');
      await until(() => !o.submit().hasAttribute('disabled'));
      press(o.submit());
      await until(() => ad.calls.uploadFromUrl.length === 1);
      ad.calls.uploadFromUrl[0].reject(Object.assign(new Error('<img src=x onerror=alert(1)>SQLSTATE[HY000] select * from media'), {
        code: 'server', userMessage: '<b>Máy chủ</b> không tải được ảnh' }));
      await until(() => o.shownError() === '<b>Máy chủ</b> không tải được ảnh', 2000, 'userMessage shown');
      expect(o.h.root.textContent.includes('SQLSTATE')).to.equal(false);
      expect(!!o.h.root.querySelector('.td-field-error b, img[src="x"]')).to.equal(false);
      expect(o.rec.errors).to.deep.equal([{ operation: 'upload-url', code: 'server', retryable: true }]);
      // no userMessage → the label of the code
      await typeUrl(o, 'x');
      press(o.submit());
      await until(() => ad.calls.uploadFromUrl.length === 2);
      ad.calls.uploadFromUrl[1].reject(Object.assign(new Error('raw upstream'), { code: 'network' }));
      await until(() => o.error() === 'Không kết nối được.', 2000, 'code label');
    });

    it('fieldErrors.url → on the URL field; other keys → the upload fields', async () => {
      const ad = createMockAdapter({ manual: true });
      const uploadFields = normalizeFields([{ key: 'title', label: 'Tiêu đề', control: 'text' }]);
      const o = open({ adapter: ad, uploadFields, sources: { file: false, url: true } });
      await until(o.isOpen);
      await typeUrl(o, 'https://example.com/e.jpg?fail=1');
      await until(() => !o.submit().hasAttribute('disabled'));
      press(o.submit());
      await until(() => ad.calls.uploadFromUrl.length === 1);
      ad.calls.uploadFromUrl[0].reject(Object.assign(new Error('raw'), {
        code: 'validation', userMessage: 'Không tải được.', fieldErrors: { url: ['URL không trỏ tới ảnh.'], title: ['Tiêu đề trùng.'] } }));
      await until(() => o.error() === 'URL không trỏ tới ảnh.', 2000, 'url field error');
      await until(() => o.q('.td-media-picker-upload__fields').textContent.includes('Tiêu đề trùng.'), 2000, 'title error');
    });

    it('fixture ?fail= → the validation userMessage / fieldErrors.url, never the raw message', async () => {
      const ad = createMockAdapter({ uploadStepMs: 5 });
      const o = open({ adapter: ad, sources: { file: false, url: true } });
      await until(o.isOpen);
      await typeUrl(o, 'https://example.com/z.jpg?fail=1');
      await until(() => !o.submit().hasAttribute('disabled'));
      press(o.submit());
      await until(() => o.error(), 3000, 'error');
      expect(o.error()).to.equal('URL không trỏ tới một ảnh hợp lệ.');
      expect(o.h.root.textContent.includes('(raw)')).to.equal(false);
    });

    it('no request ever goes to the typed URL (no client preview)', async () => {
      const host = `td-no-preview-${Date.now()}.example`;
      const seen = [];
      const origFetch = window.fetch;
      window.fetch = (...a) => { seen.push(String(a[0])); return origFetch(...a); };
      const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) seen.push(e.name); });
      po.observe({ type: 'resource', buffered: false });
      try {
        const ad = createMockAdapter({ uploadStepMs: 5 });
        const o = open({ adapter: ad, sources: { file: true, url: true } });
        await until(o.isOpen);
        click(o.q('td-tabs').querySelectorAll('[role="tab"]')[1]);
        await typeUrl(o, `https://${host}/photo.jpg`);
        o.input().blur();
        await until(() => !o.submit().hasAttribute('disabled'));
        press(o.submit());
        await until(o.gone, 3000, 'closed');
        expect(o.rec.uploaded.length).to.equal(1);
        // let any (wrong) image / prefetch request surface in resource timing
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const e of performance.getEntriesByType('resource')) seen.push(e.name);
        expect(seen.filter((u) => u.includes(host))).to.deep.equal([]);
        expect(!!document.querySelector(`img[src*="${host}"], link[href*="${host}"]`)).to.equal(false);
      } finally {
        window.fetch = origFetch;
        po.disconnect();
      }
    });
  });
});
