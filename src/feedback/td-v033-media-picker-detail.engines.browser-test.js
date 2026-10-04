import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 18-19, 20, 28-29; "Test > Engines > Chi tiết") — the
// inline detail panel (always-open form, Save only when dirty, Enter / Ctrl+Enter, no global Enter = insert), the
// mobile pane (slide in, "Quay lại", footer visible), the upload dialog opened from the toolbar.
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
const PENDING = Symbol('pending');
const peek = (p, ms = 40) => Promise.race([p, wait(ms).then(() => PENDING)]);
const pickerRoot = () => [...document.body.querySelectorAll(':scope > .td-media-picker')].find((r) => r.getAttribute('data-state') !== 'closing') || null;
const q = (sel, root = pickerRoot()) => root?.querySelector(sel) || null;
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const live = () => q('.td-media-picker__live')?.textContent || '';
const detail = () => q('.td-media-picker__detail');
const detailName = () => q('.td-media-picker__detail-name')?.textContent || '';
const saveBtn = () => q('.td-media-picker__save');
const saveEnabled = () => !!saveBtn() && !saveBtn().hasAttribute('disabled') && !saveBtn().hasAttribute('loading');
const field = (k) => q(`.td-media-picker__field[data-key="${k}"]`);
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const discardDialog = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const clickDiscard = (yes) => {
  const btns = [...discardDialog().querySelectorAll('.td-modal__footer .td-btn')];
  btns.find((b) => b.textContent.includes(yes ? TdMediaPicker.labels.discard : TdMediaPicker.labels.keepEditing)).click();
};
const toastTexts = () => [...document.querySelectorAll('.td-toast .td-toast__message')].map((t) => t.textContent);
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const assetName = (id) => `anh-${id.slice(1)}.jpg`;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
async function detailReady(id, name = assetName(id)) {
  await until(() => detailName() === name && !detail().hasAttribute('data-loading'), 4000, `detail ${id}`);
}
/** every running animation / transition of `el` finished (real signal, no fixed sleep) */
async function settled(el) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  let done = false;
  Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => { done = true; });
  await until(() => done, 4000, 'animations finished');
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal, :scope > .td-media-picker-upload'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}
afterEach(async () => {
  await closeAll();
  await setViewport({ width: 1280, height: 800 });
  await emulateMedia({ reducedMotion: 'no-preference' });
});

describe('v0.33 td-media-picker — detail panel (decision 18)', () => {
  it('layout top → bottom: 1:1 contain preview, "TÊN FILE" + name, inline form (no "Sửa thông tin"), divider, facts "Nhãn: giá trị", divider, right-aligned actions', async () => {
    await setViewport({ width: 1440, height: 900 });
    await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const d = detail();
    expect(d.getAttribute('data-state')).to.equal('ready');
    const order = [...d.children].map((c) => c.className.split(' ').find((x) => x.startsWith('td-media-picker__')) || c.localName);
    const want = ['td-media-picker__back', 'td-media-picker__preview', 'td-media-picker__field-group', 'td-media-picker__form',
      'td-media-picker__notice', 'td-media-picker__divider', 'td-media-picker__facts', 'td-media-picker__divider', 'td-media-picker__detail-actions'];
    expect(order).to.deep.equal(want);
    const pr = q('.td-media-picker__preview').getBoundingClientRect();
    expect(Math.abs(pr.width - pr.height) <= 1, 'square preview').to.equal(true);
    expect(getComputedStyle(q('.td-media-picker__preview img')).objectFit).to.equal('contain');
    const lbl = q('.td-media-picker__label');
    expect(lbl.textContent).to.equal('Tên file');
    expect(getComputedStyle(lbl).textTransform).to.equal('uppercase');
    expect(q('.td-media-picker__edit') === null, 'no "Sửa thông tin" button').to.equal(true);
    expect(field('title').querySelector('td-input-field') !== null, 'form open at once').to.equal(true);
    const facts = [...q('.td-media-picker__facts').children].map((r) => r.textContent);
    expect(facts[0]).to.equal('Kích thước:302.99 KB');
    expect(facts[1]).to.equal('Độ phân giải:1200 × 800px');
    expect(facts[2]).to.equal('Loại:Ảnh / image/jpeg');
    expect(facts[3].startsWith('Tải lên:')).to.equal(true);
    expect(facts[4]).to.equal('Bởi:Biên tập viên B');
    expect(getComputedStyle(q('.td-media-picker__facts')).fontSize).to.equal('12px');
    const actions = q('.td-media-picker__detail-actions');
    expect(getComputedStyle(actions).justifyContent).to.equal('flex-end');
    const save = saveBtn();
    expect([save.getAttribute('variant'), save.getAttribute('size'), save.getAttribute('icon')]).to.deep.equal(['success', 'sm', 'check']);
    expect(save.hasAttribute('disabled')).to.equal(true);
  });

  it('Save only when dirty (back to the saved value → disabled again); Enter in a single-line field = save; toast + live region', async () => {
    const { ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const input = field('title').querySelector('input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    await sendKeys({ type: 'Z' });
    await until(() => saveEnabled(), 4000, 'enabled');
    await sendKeys({ press: 'Backspace' });
    await until(() => saveBtn().hasAttribute('disabled'), 4000, 'clean again → disabled');
    await sendKeys({ type: '!' });
    await until(() => saveEnabled(), 4000, 'enabled again');
    await sendKeys({ press: 'Enter' });
    await until(() => ad.calls.update.length === 1, 4000, 'saved by Enter');
    expect(ad.calls.update[0].args[1].fields.title).to.equal('Ảnh mẫu 60!');
    await until(() => toastTexts().includes('Đã lưu thay đổi'), 4000, 'toast');
    await until(() => live() === 'Đã lưu thay đổi', 4000, 'announced');
    await until(() => saveBtn() && saveBtn().hasAttribute('disabled'), 4000, 'clean after save');
    expect(field('title').contains(document.activeElement), 'focus stays in the field after the re-render').to.equal(true);
  });

  it('Enter in a textarea inserts a line (no save); Ctrl/Cmd+Enter there = save; never autosave on view', async () => {
    const { ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    click(opener('m59'));
    await detailReady('m59');
    expect(ad.calls.update.length, 'viewing never saves').to.equal(0);
    const ta = field('caption').querySelector('textarea');
    ta.focus();
    await sendKeys({ type: 'dòng 1' });
    await sendKeys({ press: 'Enter' });
    await sendKeys({ type: 'dòng 2' });
    await wait(30);
    expect(ad.calls.update.length).to.equal(0);
    expect(ta.value.includes('\n')).to.equal(true);
    await sendKeys({ press: isMac ? 'Meta+Enter' : 'Control+Enter' });
    await until(() => ad.calls.update.length === 1, 4000, 'saved by Ctrl/Cmd+Enter');
    expect(ad.calls.update[0].args[1].fields.caption).to.equal('dòng 1\ndòng 2');
  });

  it('no global Enter = "Chèn": Enter on the dialog / detail heading / a card never confirms', async () => {
    const { promise } = await openReady();
    click(opener('m60'));
    await detailReady('m60');
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Enter' });
    q('.td-media-picker__detail-name').focus();
    await sendKeys({ press: 'Enter' });
    opener('m60').focus();
    await sendKeys({ press: 'Enter' });
    expect(await peek(promise)).to.equal(PENDING);
  });

  it('dirty + another card (single click) → asks first; keep → nothing changes', async () => {
    const { ad } = await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    field('title').querySelector('input').focus();
    await sendKeys({ type: 'q' });
    click(opener('m59'));
    await until(() => discardDialog(), 4000, 'asked');
    clickDiscard(false);
    await until(() => discardDialog() === null, 4000, 'closed');
    expect(detailName()).to.equal('anh-60.jpg');
    expect(ad.calls.update.length).to.equal(0);
  });

  it('loading: data-loading while get() runs; get error keeps the cached snapshot (operation-error)', async () => {
    const ad = createMockAdapter();
    const errs = [];
    await openReady({ adapter: ad });
    document.querySelector('td-media-picker').addEventListener('operation-error', (e) => errs.push(e.detail));
    ad.manual = true;
    click(opener('m60'));
    await until(() => ad.calls.get.length === 1);
    expect(detail().hasAttribute('data-loading')).to.equal(true);
    expect(detailName()).to.equal('anh-60.jpg');
    ad.calls.get[0].reject(Object.assign(new Error('raw'), { code: 'server' }));
    await until(() => !detail().hasAttribute('data-loading'), 4000, 'settled');
    expect(errs).to.deep.equal([{ operation: 'get', code: 'server', retryable: true }]);
    expect(detailName()).to.equal('anh-60.jpg');
  });
});

describe('v0.33 td-media-picker — mobile detail pane (decision 19)', () => {
  it('390×844: pane slides in from the right over the list, heading focused, "Quay lại" (ghost, back icon) → focus on the card; footer visible', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady({ assetFields: assetFields() });
    const pane = detail();
    expect(getComputedStyle(pane).visibility).to.equal('hidden');
    click(opener('m60'));
    await until(() => pickerRoot().getAttribute('data-view') === 'detail', 4000, 'view');
    await settled(pane);
    await detailReady('m60');
    const r = pane.getBoundingClientRect();
    const br = q('.td-media-picker__body').getBoundingClientRect();
    expect(Math.abs(r.left - br.left) <= 1 && Math.abs(r.width - br.width) <= 1 && br.width >= 386, `pane ${r.left} / ${r.width} vs body ${br.left} / ${br.width}`).to.equal(true);
    expect(Math.abs(r.top - br.top) <= 1 && Math.abs(r.bottom - br.bottom) <= 1, 'covers toolbar + list (header / footer stay)').to.equal(true);
    expect(getComputedStyle(pane).visibility).to.equal('visible');
    await until(() => document.activeElement === q('.td-media-picker__detail-name'), 4000, 'heading focused');
    const footer = q('.td-modal__footer').getBoundingClientRect();
    expect(footer.bottom <= 844 + 1 && footer.top >= r.bottom - 1, 'footer below the pane, visible').to.equal(true);
    expect(q('.td-media-picker__confirm').getBoundingClientRect().height > 0).to.equal(true);
    const back = q('.td-media-picker__back');
    expect([back.getAttribute('variant'), back.getAttribute('icon')]).to.deep.equal(['ghost', 'back']);
    expect(back.textContent.trim()).to.equal('Quay lại');
    back.click();
    await until(() => document.activeElement === opener('m60'), 4000, 'focus back on the card');
    expect(pickerRoot().getAttribute('data-view')).to.equal('grid');
    await settled(pane);
    expect(getComputedStyle(pane).visibility).to.equal('hidden');
  });

  it('dirty form + "Quay lại" → asks first', async () => {
    await setViewport({ width: 390, height: 844 });
    await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    field('title').querySelector('input').focus();
    await sendKeys({ type: 'k' });
    q('.td-media-picker__back').click();
    await until(() => discardDialog(), 4000, 'asked');
    clickDiscard(false);
    await until(() => discardDialog() === null, 4000, 'closed');
    expect(pickerRoot().getAttribute('data-view')).to.equal('detail');
  });

  it('reduced motion: the pane fades (no transform)', async () => {
    await setViewport({ width: 390, height: 844 });
    await emulateMedia({ reducedMotion: 'reduce' });
    await openReady();
    const pane = detail();
    expect(getComputedStyle(pane).transform === 'none' || getComputedStyle(pane).transform === '').to.equal(true);
    click(opener('m60'));
    await until(() => pickerRoot().getAttribute('data-view') === 'detail', 4000, 'view');
    await settled(pane);
    expect(getComputedStyle(pane).opacity).to.equal('1');
    expect(getComputedStyle(pane).transform === 'none' || getComputedStyle(pane).transform === '').to.equal(true);
  });
});

describe('v0.33 td-media-picker — upload dialog from the toolbar (decision 20, integration)', () => {
  it('"Tải lên" opens the nested dialog ABOVE the picker; Escape closes only it; focus back on "Tải lên"', async () => {
    const { promise } = await openReady();
    const btn = q('.td-media-picker__upload-btn');
    btn.querySelector('button').focus();
    btn.click();
    const up = await until(() => document.body.querySelector(':scope > .td-media-picker-upload[data-state="open"]'), 4000, 'dialog open');
    // painted above the picker: the topmost element at the dialog centre belongs to the upload dialog
    const dr = up.querySelector('.td-media-picker-upload__dialog').getBoundingClientRect();
    const hit = document.elementFromPoint(dr.left + dr.width / 2, dr.top + dr.height / 2);
    expect(!!hit && up.contains(hit), 'upload dialog on top').to.equal(true);
    expect(pickerRoot().querySelector('.td-media-picker__dialog').closest('[inert]') !== null
      || pickerRoot().querySelector('.td-media-picker__dialog').inert === true, 'picker inert under it').to.equal(true);
    expect(up.querySelector('td-tabs') !== null, 'both sources (upload + uploadFromUrl) → tabs').to.equal(true);
    expect(up.contains(document.activeElement), 'focus inside the dialog').to.equal(true);
    await sendKeys({ press: 'Escape' });
    await until(() => !document.body.querySelector(':scope > .td-media-picker-upload'), 4000, 'dialog closed');
    expect(await peek(promise)).to.equal(PENDING);
    await until(() => document.activeElement === btn.querySelector('button'), 4000, 'focus back on Tải lên');
  });

  it('URL upload → asset-change { operation: "upload-url" }, page 1 reloaded, selected + detail', async () => {
    const { ad, promise } = await openReady();
    const changes = [];
    document.querySelector('td-media-picker').addEventListener('asset-change', (e) => changes.push(e.detail));
    q('.td-media-picker__upload-btn').click();
    const up = await until(() => document.body.querySelector(':scope > .td-media-picker-upload[data-state="open"]'), 4000, 'dialog');
    const tabs = up.querySelector('td-tabs');
    tabs.querySelector('[role="tab"]:nth-of-type(2), .td-tabs__tab:nth-child(2)')?.click();
    const urlField = await until(() => up.querySelector('.td-media-picker-upload__url'), 4000, 'url field');
    urlField.value = 'https://example.com/hinh-moi.jpg';
    urlField.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = up.querySelector('.td-media-picker-upload__submit');
    await until(() => !submit.hasAttribute('disabled'), 4000, 'submit enabled');
    submit.click();
    await until(() => changes.length === 1, 4000, 'asset-change');
    expect(changes[0].operation).to.equal('upload-url');
    expect(ad.calls.uploadFromUrl[0].args[0]).to.equal('https://example.com/hinh-moi.jpg');
    const id = changes[0].asset.id;
    await until(() => items()[0]?.getAttribute('data-id') === id, 4000, 'page 1 reloaded with the new asset first');
    await until(() => detailName() === 'hinh-moi.jpg', 4000, 'detail');
    await until(() => !document.body.querySelector(':scope > .td-media-picker-upload'), 4000, 'dialog closed');
    q('.td-media-picker__confirm').click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal([id]);
  });
});
