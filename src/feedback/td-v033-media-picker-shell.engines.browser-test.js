import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';

// v0.33.0 (plan docs/internal/plans/v0.33.0-media-picker-dcms-parity.md, "Test > Engines > td-media-picker") — the
// full-viewport shell, the toolbar and the shell geometry in Chromium, Firefox AND WebKit. Waits on real signals
// (data-state, finished animations, polled conditions) — never a fixed sleep before a geometry assertion.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
const { TdModal } = await import('./td-modal.js');
const { isScrollLocked } = await import('../utils/scroll-lock.js');
const { createMockAdapter, assetFields } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
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
const item = (id) => items().find((i) => i.getAttribute('data-id') === id) || null;
const opener = (id) => item(id)?.querySelector('[data-td-media-open]') || null;
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const px = (v) => parseFloat(v) || 0;
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = IS_WEBKIT ? 'Alt+Tab' : 'Tab';

/** A length token (e.g. `--td-space-sm`) resolved to px by the engine itself. */
function tokenPx(name, on = document.documentElement) {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.width = `var(${name})`;
  on.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return w;
}

async function openSettled(opts = {}, adOpts = {}) {
  const ad = opts.adapter || createMockAdapter(adOpts);
  const promise = TdMediaPicker.open({ ...opts, adapter: ad });
  await until(() => pickerRoot()?.getAttribute('data-state') === 'open', 4000, 'open');
  const dialog = q('.td-media-picker__dialog');
  let done = false;
  Promise.all(dialog.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => { done = true; });
  await until(() => done, 4000, 'open transition finished');
  await until(() => items().length > 0 || q('.td-media-picker__empty:not([hidden])'), 4000, 'first page');
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

describe('v0.33 td-media-picker — full viewport shell (decisions 4-6)', () => {
  for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
    it(`${w}×${h}: dialog = viewport ±1px, no radius, no horizontal scroll, safe-area padding = base padding (inset 0)`, async () => {
      await setViewport({ width: w, height: h });
      await openSettled({ selection: { mode: 'multiple' } });
      const root = pickerRoot();
      expect(root.classList.contains('td-modal--viewport')).to.equal(true);
      const dialog = q('.td-media-picker__dialog');
      const r = dialog.getBoundingClientRect();
      for (const [k, v, want] of [['left', r.left, 0], ['top', r.top, 0], ['width', r.width, w], ['height', r.height, h]]) {
        expect(Math.abs(v - want) <= 1, `${k} ${v} vs ${want}`).to.equal(true);
      }
      expect(px(getComputedStyle(dialog).borderTopLeftRadius)).to.equal(0);
      for (const sel of ['.td-media-picker__dialog', '.td-media-picker__toolbar', '.td-media-picker__results', '.td-modal__footer']) {
        const el = q(sel);
        expect(el.scrollWidth <= el.clientWidth + 1, `${sel} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`).to.equal(true);
      }
      expect(document.documentElement.scrollWidth <= w + 1, 'page').to.equal(true);
      // safe area ADDS to the base padding (test browsers have inset 0 → exactly the base values)
      const spaceSm = tokenPx('--td-space-sm');
      const padX = tokenPx('--td-modal-pad-x', dialog);
      const header = getComputedStyle(q('.td-modal__header'));
      const footer = getComputedStyle(q('.td-modal__footer'));
      const body = getComputedStyle(q('.td-modal__body'));
      expect(Math.abs(px(header.paddingTop) - spaceSm) < 0.5, `header top ${header.paddingTop} vs ${spaceSm}`).to.equal(true);
      expect(Math.abs(px(footer.paddingBottom) - spaceSm) < 0.5, `footer bottom ${footer.paddingBottom}`).to.equal(true);
      for (const cs of [header, footer]) {
        expect(Math.abs(px(cs.paddingLeft) - padX) < 0.5, `left ${cs.paddingLeft} vs ${padX}`).to.equal(true);
        expect(Math.abs(px(cs.paddingRight) - padX) < 0.5, `right ${cs.paddingRight} vs ${padX}`).to.equal(true);
      }
      expect(px(body.paddingLeft) + px(body.paddingRight)).to.equal(0);
      // footer visible inside the viewport
      const fr = q('.td-modal__footer').getBoundingClientRect();
      expect(fr.bottom <= h + 1 && fr.top >= 0).to.equal(true);
    });
  }

  it('Escape / inert / focus trap / scroll lock / focus back to the opener still hold', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'Mở';
    document.body.appendChild(btn);
    extra.push(() => btn.remove());
    btn.focus();
    const { promise } = await openSettled();
    expect(isScrollLocked()).to.equal(true);
    expect(btn.closest('[inert]') !== null || btn.inert === true, 'page behind is inert').to.equal(true);
    for (let i = 0; i < 12; i++) {
      await sendKeys({ press: TAB });
      expect(pickerRoot().contains(document.activeElement), `tab ${i}`).to.equal(true);
    }
    q('.td-media-picker__dialog').focus();
    await sendKeys({ press: 'Escape' });
    expect((await promise).reason).to.equal('escape');
    await until(() => document.activeElement === btn, 4000, 'focus restored');
  });

  it('default title from selection.kinds (Chọn ảnh / video / tài liệu / media); options.title wins', async () => {
    const cases = [[['image'], 'Chọn ảnh'], [['video'], 'Chọn video'], [['file'], 'Chọn tài liệu'], [['image', 'video'], 'Chọn media'], [null, 'Chọn media']];
    for (const [kinds, want] of cases) {
      await openSettled({ selection: { mode: 'single', ...(kinds ? { kinds } : {}) } });
      expect(q('.td-modal__title').textContent).to.equal(want);
      await closeAll();
    }
    await openSettled({ title: 'Ảnh đại diện', selection: { mode: 'single', kinds: ['image'] } });
    expect(q('.td-modal__title').textContent).to.equal('Ảnh đại diện');
  });
});

describe('v0.33 td-media-picker — toolbar (decisions 7-10)', () => {
  it('DOM order upload · search · facets · pager; kit components; aria-labels; one row ≥ 768', async () => {
    await setViewport({ width: 1440, height: 900 });
    await openSettled({ pageSize: 20 });
    await until(() => q('.td-media-picker__facets td-dropdown') && q('.td-media-picker__facets td-chip-input'), 4000, 'facets');
    const tb = q('.td-media-picker__toolbar');
    const kids = [...tb.children];
    expect(kids[0].localName).to.equal('td-button');
    expect(kids[0].classList.contains('td-media-picker__upload-btn')).to.equal(true);
    expect(kids[0].getAttribute('variant')).to.equal('primary');
    expect(kids[0].getAttribute('icon')).to.equal('upload');
    expect(kids[0].querySelector('button').getAttribute('aria-label')).to.equal('Tải lên');
    expect(kids[1].localName).to.equal('td-input-field');
    expect(kids[1].getAttribute('type')).to.equal('search');
    expect(kids[1].getAttribute('size')).to.equal('md');
    const input = kids[1].querySelector('input');
    expect(input.getAttribute('placeholder')).to.equal('Tìm kiếm media…');
    expect(input.getAttribute('aria-label') || kids[1].getAttribute('aria-label')).to.equal('Tìm media');
    const filters = kids[2];
    expect(filters.classList.contains('td-media-picker__filters')).to.equal(true);
    const [facets, pager] = filters.children;
    expect(facets.classList.contains('td-media-picker__facets')).to.equal(true);
    expect(pager.classList.contains('td-media-picker__pager')).to.equal(true);
    const facetKinds = [...facets.children].map((f) => f.firstElementChild.localName);
    expect(facetKinds).to.deep.equal(['td-dropdown', 'td-toggle', 'td-chip-input']);
    const dd = facets.querySelector('td-dropdown');
    expect(dd.getAttribute('aria-label')).to.equal('Album');
    expect(dd.getAttribute('searchable')).to.equal('false');
    expect(dd.getAttribute('allow-clear')).to.equal('false');
    expect(facets.querySelector('td-toggle').getAttribute('size')).to.equal('sm');
    expect(facets.querySelector('td-chip-input').hasAttribute('selection-only')).to.equal(true);
    expect(q('.td-media-picker__filters-toggle') === null, 'no "Bộ lọc (n)" toggle').to.equal(true);
    // every toolbar button is a td-button
    for (const b of tb.querySelectorAll('button')) {
      expect(!!b.closest('td-button, td-dropdown, td-chip-input, td-toggle, td-input-field, td-pagination'), b.className).to.equal(true);
    }
    // one row: the search, the album dropdown and the pager share a line
    await until(() => !q('.td-media-picker__pager').hidden, 4000, 'pager');
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const row = mid(kids[1]);
    for (const el of [kids[0], dd, q('.td-media-picker__pager')]) expect(Math.abs(mid(el) - row) < 12, el.className).to.equal(true);
    // the cursor pager is ONE row: "Hiển thị 1-20 / 60 media" then ‹ ›, vertically centred together
    const info = q('.td-media-picker__page-info');
    expect(info.textContent).to.equal('Hiển thị 1-20 / 60 media');
    for (const b of [q('.td-media-picker__prev'), q('.td-media-picker__next')]) {
      expect(Math.abs(mid(b) - mid(info)) < 4, 'pager row').to.equal(true);
      expect(b.getBoundingClientRect().left >= info.getBoundingClientRect().right - 1, 'buttons after the text').to.equal(true);
    }
    // search width within [200, 600]
    const sw = kids[1].getBoundingClientRect().width;
    expect(sw >= 199 && sw <= 601, `search ${sw}`).to.equal(true);
    // pager pushed to the right edge of the toolbar content box
    const tr = tb.getBoundingClientRect();
    const pr = q('.td-media-picker__pager').getBoundingClientRect();
    expect(Math.abs(tr.right - px(getComputedStyle(tb).paddingRight) - pr.right) <= 1.5, `pager right ${pr.right}`).to.equal(true);
  });

  for (const [w, h] of [[768, 1024], [1024, 768]]) {
    it(`${w}px: ONE toolbar row (no wrap); facets that do not fit scroll inside the row; keyboard-reachable, focus ring unclipped`, async () => {
      await setViewport({ width: w, height: h });
      await until(() => window.innerWidth === w, 3000, 'viewport');
      await openSettled({ pageSize: 20 });
      await until(() => q('.td-media-picker__facets td-dropdown') && q('.td-media-picker__facets td-toggle')
        && q('.td-media-picker__facets td-chip-input'), 4000, 'all three facets');
      await until(() => !q('.td-media-picker__pager').hidden, 4000, 'pager');
      const tb = q('.td-media-picker__toolbar');
      const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      const items = [q('.td-media-picker__upload-btn'), q('.td-media-picker__search'), q('.td-media-picker__facets'),
        q('.td-media-picker__pager')];
      const row = mid(items[1]);
      for (const el of items) expect(Math.abs(mid(el) - row) < 12, `${el.className} on the row`).to.equal(true);
      // one row tall: toolbar content height = its tallest item (no second line)
      const cs = getComputedStyle(tb);
      const inner = tb.getBoundingClientRect().height - px(cs.paddingTop) - px(cs.paddingBottom);
      const tallest = Math.max(...items.map((el) => el.getBoundingClientRect().height));
      expect(inner <= tallest + 1.5, `toolbar inner ${inner} vs tallest ${tallest}`).to.equal(true);
      // no page / dialog / toolbar overflow
      for (const el of [document.documentElement, q('.td-media-picker__dialog'), tb]) {
        expect(el.scrollWidth <= el.clientWidth + 1, `${el.className || el.localName} overflow`).to.equal(true);
      }
      for (const el of items) {
        const r = el.getBoundingClientRect();
        expect(r.right <= w + 0.5 && r.left >= -0.5, `${el.className} ${r.left}-${r.right}`).to.equal(true);
      }
      // the facet group scrolls horizontally when it does not fit; every facet control is reachable by keyboard and,
      // once focused, sits inside the scroller with room for the focus ring (≥ 2px on every side)
      const facets = q('.td-media-picker__facets');
      expect(['auto', 'scroll'].includes(getComputedStyle(facets).overflowX)).to.equal(true);
      const chipInput = q('.td-media-picker__facets td-chip-input input, .td-media-picker__facets td-chip-input [tabindex="0"]');
      chipInput.focus();
      expect(document.activeElement === chipInput).to.equal(true);
      // the focused control was scrolled into the scroller's visible box (its leading edge visible)
      const visible = () => {
        const f = facets.getBoundingClientRect();
        const c = chipInput.getBoundingClientRect();
        return c.left >= f.left - 0.5 && c.left < f.right - 8;
      };
      if (facets.scrollWidth > facets.clientWidth + 1) {
        await until(visible, 3000, 'focused facet scrolled into view');
      }
      expect(visible()).to.equal(true);
      // room for the focus ring above / below the control inside the clip box
      const f = facets.getBoundingClientRect();
      const c = chipInput.closest('td-chip-input').getBoundingClientRect();
      expect(c.top - f.top >= 2 && f.bottom - c.bottom >= 2, `ring room top ${c.top - f.top} bottom ${f.bottom - c.bottom}`)
        .to.equal(true);
    });
  }

  it('< 768: two rows (upload icon-only + search, then facets + pager), no overflow', async () => {
    await setViewport({ width: 390, height: 844 });
    await openSettled({ pageSize: 20 });
    await until(() => q('.td-media-picker__facets td-dropdown'), 4000, 'facets');
    await until(() => !q('.td-media-picker__pager').hidden, 4000, 'pager');
    const up = q('.td-media-picker__upload-btn');
    const search = q('.td-media-picker__search');
    const ur = up.getBoundingClientRect();
    const sr = search.getBoundingClientRect();
    expect(Math.abs((ur.top + ur.height / 2) - (sr.top + sr.height / 2)) < 12, 'upload + search on row 1').to.equal(true);
    expect(ur.width < 64, `upload icon-only ${ur.width}`).to.equal(true);
    expect(up.querySelector('button').getAttribute('aria-label')).to.equal('Tải lên');
    const fr = q('.td-media-picker__filters').getBoundingClientRect();
    expect(fr.top >= sr.bottom - 1, 'facets on the next row').to.equal(true);
    const tb = q('.td-media-picker__toolbar');
    expect(tb.scrollWidth <= tb.clientWidth + 1).to.equal(true);
    for (const el of tb.querySelectorAll('td-button, td-input-field, td-dropdown, td-toggle, td-chip-input, .td-media-picker__pager')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      expect(r.right <= 390 + 1 && r.left >= -1, `${el.localName} ${r.left}-${r.right}`).to.equal(true);
    }
  });

  it('Escape in an open td-dropdown / td-chip-input menu closes only the menu', async () => {
    const { promise } = await openSettled();
    await until(() => q('.td-media-picker__facets td-dropdown') && q('.td-media-picker__facets td-chip-input'), 4000, 'facets');
    const dd = q('.td-media-picker__facets td-dropdown');
    dd.querySelector('.td-dropdown__trigger').click();
    const menu = await until(() => { const m = document.getElementById(`${dd.id}-menu`); return m && !m.hidden && m; }, 4000, 'dropdown menu');
    await sendKeys({ press: 'Escape' });
    await until(() => menu.hidden || !menu.isConnected, 4000, 'menu closed');
    expect(pickerRoot() !== null && document.querySelector('td-media-picker').isOpen, 'picker still open').to.equal(true);
    const ci = q('.td-media-picker__facets td-chip-input');
    ci.querySelector('input').focus();
    ci.open();
    const cmenu = await until(() => { const m = document.getElementById(`${ci.id}-menu`); return m && !m.hidden && m; }, 4000, 'chip menu');
    await sendKeys({ press: 'Escape' });
    await until(() => cmenu.hidden || !cmenu.isConnected, 4000, 'chip menu closed');
    expect(document.querySelector('td-media-picker').isOpen).to.equal(true);
    document.querySelector('td-media-picker').close();
    expect((await promise).reason).to.equal('programmatic');
  });

  it('Escape in the detail form\'s td-datetime-picker closes only the date picker', async () => {
    const ad = createMockAdapter();
    ad.db.get('m60').metadata.license = 'licensed';
    ad.db.get('m60').metadata.licenseExpiry = '2027-03-31';
    await openSettled({ adapter: ad, assetFields: assetFields() });
    click(opener('m60'));
    await until(() => q('.td-media-picker__detail-name')?.textContent === 'anh-60.jpg' && !q('.td-media-picker__detail').hasAttribute('data-loading'), 4000, 'detail');
    const dtp = await until(() => q('.td-media-picker__field[data-key="licenseExpiry"] td-datetime-picker'), 4000, 'dtp');
    const before = document.querySelectorAll('body > .td-modal:not(.td-media-picker)').length;
    dtp.querySelector('.td-dtp__trigger').click();
    await until(() => [...document.querySelectorAll('body > .td-modal:not(.td-media-picker)')].filter((m) => m.getAttribute('data-state') === 'open').length > before, 4000, 'date modal');
    await sendKeys({ press: 'Escape' });
    await until(() => [...document.querySelectorAll('body > .td-modal:not(.td-media-picker)')].filter((m) => m.getAttribute('data-state') !== 'closing').length === before, 4000, 'date modal closed');
    expect(document.querySelector('td-media-picker').isOpen, 'picker still open').to.equal(true);
  });
});

describe('v0.33 td-media-picker — shell geometry (plan "Hình học")', () => {
  const colCount = (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
  for (const [w, h, min] of [[1440, 900, 220], [1024, 768, 200], [390, 844, 150]]) {
    it(`${w}px: grid column minimum ${min}px, gap 16px; detail ${w >= 768 ? '400px' : 'off-canvas'}`, async () => {
      await setViewport({ width: w, height: h });
      await openSettled({ selection: { mode: 'multiple' } });
      const g = q('td-media-grid');
      await until(() => items()[0].getBoundingClientRect().width > 0, 4000, 'laid out');
      const gw = g.getBoundingClientRect().width;
      const gap = px(getComputedStyle(g).columnGap);
      expect(gap).to.equal(16);
      const n = colCount(g);
      const cw = items()[0].getBoundingClientRect().width;
      expect(cw >= min - 1, `col ${cw} ≥ ${min}`).to.equal(true);
      expect((n + 1) * min + n * gap > gw, `${n + 1} columns of ${min} would fit in ${gw}`).to.equal(true);
      const detail = q('.td-media-picker__detail');
      if (w >= 768) {
        expect(Math.abs(detail.getBoundingClientRect().width - 400) <= 1, `detail ${detail.getBoundingClientRect().width}`).to.equal(true);
        const lr = q('.td-media-picker__results').getBoundingClientRect();
        const dr = detail.getBoundingClientRect();
        expect(Math.abs(dr.left - lr.right - 16) <= 1, 'gap 1rem').to.equal(true);
      } else {
        expect(getComputedStyle(detail).visibility).to.equal('hidden');
      }
    });
  }

  it('header and footer align: title left = footer content left; × right = "Chèn" right (±1px)', async () => {
    await setViewport({ width: 1440, height: 900 });
    await openSettled({ selection: { mode: 'multiple' } });
    const header = q('.td-modal__header');
    const footer = q('.td-modal__footer');
    const hcs = getComputedStyle(header);
    const fcs = getComputedStyle(footer);
    const hr = header.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    expect(Math.abs((hr.left + px(hcs.paddingLeft)) - (fr.left + px(fcs.paddingLeft))) <= 1).to.equal(true);
    const title = q('.td-modal__title').getBoundingClientRect();
    const selbar = q('.td-media-picker__selbar').getBoundingClientRect();
    expect(Math.abs(title.left - selbar.left) <= 1, `title ${title.left} / selbar ${selbar.left}`).to.equal(true);
    const xr = q('.td-modal__close').getBoundingClientRect();
    const cr = q('.td-media-picker__confirm').getBoundingClientRect();
    // the × keeps td-modal's optical negative margin (−space-xs); compare the content edges
    const xMargin = -px(getComputedStyle(q('.td-modal__close')).marginRight);
    expect(Math.abs((xr.right - xMargin) - cr.right) <= 1, `× ${xr.right} / Chèn ${cr.right}`).to.equal(true);
    expect(q('.td-media-picker__confirm').getAttribute('variant')).to.equal('primary');
    expect(q('.td-media-picker__cancel').getAttribute('variant')).to.equal('secondary');
    expect(q('.td-media-picker__confirm').previousElementSibling === q('.td-media-picker__cancel'), '"Đóng" then "Chèn"').to.equal(true);
  });
});
