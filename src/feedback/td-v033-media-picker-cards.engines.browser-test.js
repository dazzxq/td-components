import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decisions 11-12, 15-17; "Test > Engines > Card / Chọn nhiều / Chọn
// đơn") — card geometry, state borders (= the tokens), checked-thumb fade, tick-mode multiple selection, the
// decision-16 single-mode Space order (incl. the declined consent: revision unchanged, no selection-change), footer.
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
const grid = () => q('td-media-grid');
const items = () => [...(pickerRoot()?.querySelectorAll('[data-td-media-item]') || [])];
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const tick = (id) => item(id)?.querySelector('.td-media-grid__tick') || null;
const confirmBtn = () => q('.td-media-picker__confirm');
const btnText = (b) => (b?.textContent || '').trim();
const host = () => document.querySelector('td-media-picker');
const detailName = () => q('.td-media-picker__detail-name')?.textContent || '';
const modalRoots = () => [...document.body.querySelectorAll(':scope > .td-modal:not(.td-media-picker)')].filter((r) => r.getAttribute('data-state') !== 'closing');
const discardDialog = () => modalRoots().find((r) => r.textContent.includes(TdMediaPicker.labels.discardTitle)) || null;
const clickDiscard = (yes) => {
  const btns = [...discardDialog().querySelectorAll('.td-modal__footer .td-btn')];
  btns.find((b) => b.textContent.includes(yes ? TdMediaPicker.labels.discard : TdMediaPicker.labels.keepEditing)).click();
};
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const assetName = (id) => `anh-${id.slice(1)}.jpg`;
const px = (v) => parseFloat(v) || 0;

/** a colour token resolved by the engine (rgb() string) */
function colorOf(token, on) {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  (on || pickerRoot()).appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

async function openReady(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  await until(() => items().length > 0, 4000, 'first page');
  return { ad, promise };
}
async function detailReady(id, name = assetName(id)) {
  await until(() => detailName() === name && !q('.td-media-picker__detail').hasAttribute('data-loading'), 4000, `detail ${id}`);
}
async function closeAll() {
  for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
  TdModal.closeAll();
  await until(() => !document.body.querySelector(':scope > .td-media-picker, :scope > .td-modal'), 4000, 'closed').catch(() => {});
  document.querySelectorAll('td-media-picker').forEach((h) => h.remove());
}

afterEach(async () => {
  await closeAll();
  await resetMouse();
  await setViewport({ width: 1280, height: 800 });
});

describe('v0.33 td-media-picker — cards (decisions 11-12)', () => {
  it('card markup: opener holds thumb 3:2 (img contain, no-referrer / lazy / async) + name (title) + "size • DD/MM/YYYY HH:mm" + badges; tick after the opener', async () => {
    await setViewport({ width: 1440, height: 900 });
    await openReady({ selection: { mode: 'multiple' } });
    const card = item('m60');
    expect(card.classList.contains('td-media-picker__card')).to.equal(true);
    const open = card.querySelector(':scope > [data-td-media-open]');
    expect(open.localName).to.equal('button');
    expect(open.nextElementSibling.classList.contains('td-media-grid__tick'), 'tick right after the opener').to.equal(true);
    const thumb = open.querySelector(':scope > .td-media-picker__thumb');
    await until(() => thumb.getBoundingClientRect().width > 0, 4000, 'laid out');
    const tr = thumb.getBoundingClientRect();
    expect(Math.abs(tr.width / tr.height - 1.5) < 0.02, `thumb ratio ${tr.width / tr.height}`).to.equal(true);
    const img = thumb.querySelector('img');
    expect(getComputedStyle(img).objectFit).to.equal('contain');
    expect(Math.abs(img.getBoundingClientRect().width - tr.width) <= 0.5, 'img fills the thumb width').to.equal(true);
    for (const [a, v] of [['referrerpolicy', 'no-referrer'], ['loading', 'lazy'], ['decoding', 'async']]) expect(img.getAttribute(a)).to.equal(v);
    const name = open.querySelector('.td-media-picker__name');
    expect(name.textContent).to.equal('anh-60.jpg');
    expect(name.title).to.equal('anh-60.jpg');
    expect(getComputedStyle(name).textOverflow).to.equal('ellipsis');
    expect(getComputedStyle(name).whiteSpace).to.equal('nowrap');
    // m60: 120000 + 60 × 3171 = 310260 bytes → 302.99 KB; createdAt 2026-09-05T08:30:00Z in local time
    const d = new Date('2026-09-05T08:30:00Z');
    const p2 = (n) => String(n).padStart(2, '0');
    const when = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    expect(open.querySelector('.td-media-picker__meta').textContent).to.equal(`302.99 KB • ${when}`);
    // badges (m54 = 9 × 6 → "Mới")
    const badge = item('m54').querySelector('.td-media-picker__badges .td-badge');
    expect(badge.textContent).to.equal('Mới');
    expect(badge.classList.contains('td-badge--success')).to.equal(true);
    // card surface: 2px transparent border, radius token, text area with a top border
    const cs = getComputedStyle(card);
    expect(cs.borderTopWidth).to.equal('2px');
    expect(cs.borderTopColor).to.equal('rgba(0, 0, 0, 0)');
    expect(px(cs.borderTopLeftRadius) > 0).to.equal(true);
    const info = open.querySelector('.td-media-picker__info');
    expect(getComputedStyle(info).paddingTop).to.equal('12px');
    expect(getComputedStyle(info).borderTopWidth).to.equal('1px');
  });

  it('video: poster + video icon corner; file: 3rem kind icon, no img', async () => {
    await openReady({ pageSize: 30 });
    const v = items().find((i) => i.getAttribute('data-kind') === 'video');
    expect(v.querySelector('.td-media-picker__thumb img') !== null, 'poster').to.equal(true);
    expect(v.querySelector('.td-media-picker__kind svg') !== null, 'video icon').to.equal(true);
    const f = items().find((i) => i.getAttribute('data-kind') === 'file');
    expect(f.querySelector('.td-media-picker__thumb img') === null).to.equal(true);
    const svg = f.querySelector('.td-media-picker__thumb-icon svg');
    expect(Math.abs(svg.getBoundingClientRect().width - 48) <= 1, `file icon ${svg.getBoundingClientRect().width}`).to.equal(true);
  });

  it('borders = tokens: hover → card-hover, viewing → card-viewing, checked → card-checked (wins over viewing); thumb fades 0.7 and back on every change', async () => {
    await setViewport({ width: 1440, height: 900 });
    await openReady({ selection: { mode: 'multiple' } });
    const hover = colorOf('--td-media-picker-card-hover');
    const viewing = colorOf('--td-media-picker-card-viewing');
    const checked = colorOf('--td-media-picker-card-checked');
    expect(viewing).to.equal(colorOf('--td-accent'));
    expect(checked).to.equal(colorOf('--td-color-success'));
    expect(hover).to.equal(viewing);
    const border = (id) => getComputedStyle(item(id)).borderTopColor;
    const fade = (id) => getComputedStyle(item(id).querySelector('.td-media-picker__thumb')).opacity;
    // hover (real pointer)
    const r = item('m58').getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await until(() => border('m58') === hover, 4000, 'hover border');
    await resetMouse();
    // viewing
    click(opener('m60'));
    await until(() => item('m60').hasAttribute('data-viewing'), 4000, 'viewing');
    await until(() => border('m60') === viewing, 4000, 'viewing border');
    expect(fade('m60')).to.equal('1');
    // checked wins over viewing
    click(tick('m60'));
    await until(() => border('m60') === checked, 4000, 'checked border');
    await until(() => fade('m60') === '0.7', 4000, 'fade 0.7');
    click(tick('m60'));
    await until(() => border('m60') === viewing && fade('m60') === '1', 4000, 'unchecked → viewing, full opacity');
    click(tick('m59'));
    await until(() => fade('m59') === '0.7', 4000, 'm59 fade');
    q('.td-media-picker__clear').click();
    await until(() => fade('m59') === '1', 4000, 'cleared → full opacity');
  });

  it('single mode: no tick (hidden), the chosen card keeps full opacity', async () => {
    await openReady();
    click(opener('m60'));
    await until(() => item('m60').hasAttribute('data-selected'), 4000, 'selected');
    expect(getComputedStyle(tick('m60')).display).to.equal('none');
    expect(getComputedStyle(item('m60').querySelector('.td-media-picker__thumb')).opacity).to.equal('1');
  });
});

describe('v0.33 td-media-picker — multiple selection (decision 15)', () => {
  it('click / Enter = view only; tick / Space / Ctrl+click toggle; Shift+click = range; "Chèn (n)"; tick always visible top-right', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple' } });
    expect(getComputedStyle(tick('m60')).opacity).to.equal('1');
    const tr = tick('m60').getBoundingClientRect();
    const cr = item('m60').getBoundingClientRect();
    expect(cr.right - tr.right < 16 && tr.top - cr.top < 16, 'top-right corner').to.equal(true);
    expect(Math.abs(tr.width - 20) <= 1, `tick ${tr.width}px`).to.equal(true);
    const changes = [];
    host().addEventListener('selection-change', (e) => changes.push(e.detail));
    click(opener('m60'));
    await until(() => detailName() === 'anh-60.jpg', 4000, 'detail');
    expect(grid().selectedIds).to.deep.equal([]);
    expect(changes.length).to.equal(0);
    opener('m59').focus();
    await sendKeys({ press: 'Enter' });
    await until(() => detailName() === 'anh-59.jpg', 4000, 'detail via Enter');
    expect(grid().selectedIds).to.deep.equal([]);
    expect(confirmBtn().hasAttribute('disabled')).to.equal(true);
    click(tick('m60'));
    await sendKeys({ press: 'Space' }); // focus is on m59's opener
    click(opener('m58'), { ctrlKey: true });
    expect(grid().selectedIds).to.deep.equal(['m60', 'm59', 'm58']);
    expect(btnText(confirmBtn())).to.equal('Chèn (3)');
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 3');
    click(opener('m58'), { metaKey: true });
    expect(grid().selectedIds).to.deep.equal(['m60', 'm59']);
    click(opener('m55'), { shiftKey: true }); // range from the anchor (m58 flip) → m57..m55 added
    await until(() => grid().selectedIds.length > 2, 4000, 'range');
    expect(grid().selectedIds.includes('m55') && grid().selectedIds.includes('m56')).to.equal(true);
    expect(changes.every((c) => Array.isArray(c.addedIds))).to.equal(true);
    confirmBtn().click();
    const out = await promise;
    expect(out.selection.map((s) => s.assetId).slice(0, 2)).to.deep.equal(['m60', 'm59']);
  });

  it('select on page 1, go to page 2, select more → outcome has all, in selection order', async () => {
    const { promise } = await openReady({ selection: { mode: 'multiple' }, pageSize: 20 });
    click(tick('m60'));
    click(tick('m58'));
    q('.td-media-picker__next').click();
    await until(() => item('m40'), 4000, 'page 2');
    expect(btnText(confirmBtn())).to.equal('Chèn (2)');
    click(tick('m40'));
    click(tick('m39'));
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 4');
    q('.td-media-picker__prev').click();
    await until(() => item('m60') && grid().selectedIds.join() === 'm60,m58', 4000, 'page 1 again, re-selected');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m60', 'm58', 'm40', 'm39']);
  });

  it('footer: "Đã chọn n/max" + ghost "Bỏ chọn tất cả" on the left (multiple only); right "Đóng" + "Chèn"', async () => {
    await openReady({ selection: { mode: 'multiple', maxItems: 4 } });
    const sel = q('.td-media-picker__selbar');
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 0/4');
    expect(q('.td-media-picker__clear').hidden).to.equal(true);
    click(tick('m60'));
    expect(q('.td-media-picker__selcount').textContent).to.equal('Đã chọn 1/4');
    expect(q('.td-media-picker__clear').hidden).to.equal(false);
    expect(q('.td-media-picker__clear').getAttribute('variant')).to.equal('ghost');
    expect(q('.td-media-picker__clear').getAttribute('size')).to.equal('sm');
    expect(sel.getBoundingClientRect().left < q('.td-media-picker__cancel').getBoundingClientRect().left).to.equal(true);
    expect(q('.td-media-picker__tray-list') === null && q('.td-media-picker__tray-item') === null, 'no 40px tray').to.equal(true);
    await closeAll();
    await openReady();
    expect(q('.td-media-picker__selcount') === null, 'single: no count').to.equal(true);
  });
});

describe('v0.33 td-media-picker — single selection (decision 16)', () => {
  it('open → nothing selected, "Chèn" disabled, detail empty state (no auto-select of the first item)', async () => {
    await openReady();
    await wait(50);
    expect(grid().selectedIds).to.deep.equal([]);
    expect(confirmBtn().hasAttribute('disabled')).to.equal(true);
    const det = q('.td-media-picker__detail');
    expect(det.getAttribute('data-state')).to.equal('empty');
    const es = det.querySelector('td-empty-state');
    expect(es.getAttribute('title')).to.equal('Chọn một ảnh để xem chi tiết');
    expect(es.getAttribute('message')).to.equal('Bấm vào ảnh trong danh sách bên trái');
    expect(items().some((i) => i.hasAttribute('data-viewing'))).to.equal(false);
  });

  it('Space on B (A selected) → selection [B], detail B, B viewing, A not', async () => {
    await openReady();
    click(opener('m60'));
    await detailReady('m60');
    expect(item('m60').hasAttribute('data-viewing')).to.equal(true);
    opener('m59').focus();
    await sendKeys({ press: 'Space' });
    expect(grid().selectedIds).to.deep.equal(['m59']);
    await until(() => detailName() === 'anh-59.jpg', 4000, 'detail B');
    expect(item('m59').hasAttribute('data-viewing')).to.equal(true);
    expect(item('m60').hasAttribute('data-viewing')).to.equal(false);
  });

  it('Space on B while A\'s form is dirty: grid shows [A] while asking; "no" → A kept, revision unchanged, no selection-change; "yes" → [B] + detail B', async () => {
    await openReady({ assetFields: assetFields() });
    click(opener('m60'));
    await detailReady('m60');
    const input = q('.td-media-picker__field[data-key="title"] input');
    input.focus();
    await sendKeys({ type: 'x' });
    const model = host()._s.model;
    const rev = model.revision;
    const changes = [];
    host().addEventListener('selection-change', (e) => changes.push(e.detail));
    opener('m59').focus();
    await sendKeys({ press: 'Space' });
    await until(() => discardDialog(), 4000, 'consent asked');
    expect(grid().selectedIds).to.deep.equal(['m60']);
    clickDiscard(false);
    await until(() => discardDialog() === null, 4000, 'closed');
    await wait(30);
    expect(grid().selectedIds).to.deep.equal(['m60']);
    expect(model.revision).to.equal(rev);
    expect(changes.length).to.equal(0);
    expect(detailName()).to.equal('anh-60.jpg');
    expect(q('.td-media-picker__field[data-key="title"] input').value).to.not.equal('Ảnh mẫu 60'); // the typed text is kept
    expect(item('m60').hasAttribute('data-viewing')).to.equal(true);
    opener('m59').focus();
    await sendKeys({ press: 'Space' });
    await until(() => discardDialog(), 4000, 'asked again');
    clickDiscard(true);
    await until(() => grid().selectedIds.join() === 'm59' && detailName() === 'anh-59.jpg', 4000, 'switched');
    expect(changes.length).to.equal(1);
    expect(changes[0].addedIds).to.deep.equal(['m59']);
    expect(item('m59').hasAttribute('data-viewing')).to.equal(true);
  });

  it('initialIds still preselect in single mode (detail stays empty until a click)', async () => {
    const { promise } = await openReady({ selection: { mode: 'single', initialIds: ['m58'] } });
    await until(() => grid().selectedIds.join() === 'm58', 4000, 'initial');
    expect(confirmBtn().hasAttribute('disabled')).to.equal(false);
    expect(btnText(confirmBtn())).to.equal('Chèn');
    confirmBtn().click();
    expect((await promise).selection.map((s) => s.assetId)).to.deep.equal(['m58']);
  });
});
