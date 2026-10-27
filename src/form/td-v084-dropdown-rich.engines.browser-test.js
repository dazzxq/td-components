import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDropdown } from './td-dropdown.js';
import { TdModal } from '../feedback/td-modal.js';

// v0.84.0 (plan docs/internal/plans/v0.84.0-dropdown-rich.md, Step 4 a–n) — td-dropdown rich rows (icon tile, description,
// status, meta, keywords), groups (`groups` property + <optgroup>), search over description / keywords (`search-fields`),
// the screen-reader result count, the trigger icon and the measured max-height, in Chromium, Firefox AND WebKit. Plain
// options must stay the exact 0.83.0 row string. DOM nodes are compared as booleans / strings (a failing chai assertion
// carrying DOM nodes hangs the runner). Keys go to the trigger as dispatched keydown events (the component's own
// handler), except the modal Escape case, which needs the real layer dispatcher.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  await wait(10);
});

const trig = (el) => el.querySelector('.td-dropdown__trigger');
const menu = (el) => el._menuElement;
const scroller = (el) => menu(el).querySelector('.td-dropdown__scroller');
const listbox = (el) => menu(el).querySelector('[role="listbox"]');
const empty = (el) => menu(el).querySelector('.td-dropdown__empty');
/** data rows (no clear / create row), in DOM order */
const rows = (el) => [...scroller(el).querySelectorAll('.td-dropdown__option[data-index]')];
const values = (el) => rows(el).map((r) => r.getAttribute('data-value'));
const heads = (el) => [...scroller(el).querySelectorAll('.td-dropdown__group-label')].map((h) => h.textContent);
const activeId = (el) => trig(el).getAttribute('aria-activedescendant') || '';
const key = (el, k) => trig(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
function type(el, q) {
  const s = menu(el).querySelector('.td-dropdown__search');
  s.value = q;
  s.dispatchEvent(new Event('input', { bubbles: true }));
}
function dd(attrs = '', options = [], groups = null) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`);
  if (groups) el.groups = groups;
  el.options = options.map((o) => ({ ...o }));
  return el;
}
/** collect console.warn calls while `fn` runs */
async function warnsDuring(fn) {
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => { seen.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return seen;
}

const RICH = [
  { value: 'a', label: 'Kho chính', icon: 'archive', iconTone: 'accent', description: 'Hà Nội, Cầu Giấy', status: { tone: 'success', text: 'Đang mở' }, meta: '12 SP', keywords: ['warehouse', 'main'] },
  { value: 'b', label: 'Kho phụ', icon: 'inbox', description: 'Sài Gòn' },
  { value: 'c', label: 'Chỉ icon', icon: 'star', iconTone: 'bogus' },
  { value: 'd', label: 'Chỉ meta', meta: 3 },
  { value: 'e', label: 'Thường' },
  { value: 'f', label: 'Khoá', icon: 'lock', description: 'Tạm ngưng', status: { tone: 'danger', text: 'Đóng' }, disabled: true },
];

describe('v0.84.0 td-dropdown — plain rows unchanged (a)', () => {
  it('a plain row is the exact 0.83.0 string (swatch, selected ✓, disabled, escaping; new non-rich fields ignored)', async () => {
    const el = mount('<td-dropdown id="dd-a" value="r"></td-dropdown>');
    el.options = [
      { value: 'r', label: 'Đỏ', swatch: '#ff0000', keywords: ['red'], group: 'nope' },
      { value: 'n', label: 'Không <b>màu</b>', description: '   ', status: { text: '' }, meta: '' },
      { value: 'x', label: 'Tắt', disabled: true, icon: 42 },
    ];
    await settle(1);
    const clone = scroller(el).cloneNode(true);
    for (const slot of clone.querySelectorAll('.td-dropdown__check')) slot.replaceChildren(); // the shared ✓ icon
    expect(clone.innerHTML).to.equal(
      '<div class="td-dropdown__option td-dropdown__option--clear" role="option" id="dd-a-opt-clear" aria-selected="false" data-value="__CLEAR__" data-nav="0"><span class="td-dropdown__option-label">Không chọn</span></div>'
      + '<div class="td-dropdown__option" role="option" id="dd-a-opt-0" aria-selected="true" data-value="r" data-index="0" data-nav="1">'
      + '<svg class="td-dropdown__swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="6" fill="#ff0000"></circle></svg>'
      + '<span class="td-dropdown__option-label">Đỏ</span><span class="td-dropdown__check" data-td-icon="check" aria-hidden="true"></span></div>'
      + '<div class="td-dropdown__option" role="option" id="dd-a-opt-1" aria-selected="false" data-value="n" data-index="1" data-nav="2"><span class="td-dropdown__option-label">Không &lt;b&gt;màu&lt;/b&gt;</span></div>'
      + '<div class="td-dropdown__option" role="option" id="dd-a-opt-2" aria-selected="false" aria-disabled="true" data-value="x" data-index="2" data-nav="3"><span class="td-dropdown__option-label">Tắt</span></div>',
    );
    expect(el.querySelector('.td-dropdown__value').innerHTML).to.equal(
      '<svg class="td-dropdown__swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="6" fill="#ff0000"></circle></svg>Đỏ');
  });

  it('a plain list keeps max-height = N × 40px, no group wrapper, no count attribute', async () => {
    const el = dd('max-height="5"', Array.from({ length: 9 }, (_, i) => ({ value: `p${i}`, label: `Mục ${i}` })));
    el.open();
    await settle();
    expect(scroller(el).style.maxHeight).to.equal('200px');
    expect(scroller(el).querySelectorAll('.td-dropdown__group, .td-dropdown__option--rich').length).to.equal(0);
    type(el, 'mục');
    expect(empty(el).hasAttribute('data-count')).to.equal(true); // the count is a new region state, not a row change
    expect(scroller(el).style.maxHeight).to.equal('200px');
    el.close();
    expect(empty(el).hasAttribute('data-count')).to.equal(false);
    expect(empty(el).textContent).to.equal('');
  });
});

describe('v0.84.0 td-dropdown — rich rows (b, c, d)', () => {
  it('(b) DOM, ids, aria-labelledby / aria-describedby resolve, name = the label, tile filled with an svg', async () => {
    const el = dd('id="dd-b" label="Kho"', RICH);
    el.open();
    await settle();
    const [a, b, c, d, e, f] = rows(el);
    expect(a.classList.contains('td-dropdown__option--rich')).to.equal(true);
    const rid = 'dd-b-opt-0';
    expect(a.id).to.equal(rid);
    expect(a.getAttribute('aria-labelledby')).to.equal(`${rid}-label`);
    expect(a.getAttribute('aria-describedby')).to.equal(`${rid}-desc ${rid}-meta`);
    const label = document.getElementById(`${rid}-label`);
    expect(!!label && a.contains(label)).to.equal(true);
    expect(label.textContent).to.equal('Kho chính'); // the accessible name (aria-labelledby → label only)
    const desc = document.getElementById(`${rid}-desc`);
    expect(desc.textContent).to.equal('Hà Nội, Cầu GiấyĐang mở');
    expect(desc.querySelector('.td-dropdown__status').getAttribute('data-tone')).to.equal('success');
    expect(desc.querySelector('.td-dropdown__status-dot').getAttribute('aria-hidden')).to.equal('true');
    expect(document.getElementById(`${rid}-meta`).textContent).to.equal('12 SP');
    const tile = a.querySelector(':scope > .td-dropdown__icon');
    expect(tile.getAttribute('data-tone')).to.equal('accent');
    expect(tile.getAttribute('aria-hidden')).to.equal('true');
    expect(!!tile.querySelector('svg.td-icon')).to.equal(true);
    expect(Math.round(tile.getBoundingClientRect().width)).to.equal(28); // --td-dropdown-icon-size 1.75rem
    expect(Math.round(tile.querySelector('svg').getBoundingClientRect().width)).to.be.within(16, 17); // 60 %
    // b: description only → describedby = desc; default tone neutral
    expect(b.getAttribute('aria-describedby')).to.equal('dd-b-opt-1-desc');
    expect(b.querySelector('.td-dropdown__icon').getAttribute('data-tone')).to.equal('neutral');
    // c: icon only → no aria-labelledby / describedby (name from content = the label; the tile is aria-hidden)
    expect(c.classList.contains('td-dropdown__option--rich')).to.equal(true);
    expect(c.hasAttribute('aria-labelledby') || c.hasAttribute('aria-describedby')).to.equal(false);
    expect(c.textContent).to.equal('Chỉ icon');
    expect(c.querySelector('.td-dropdown__icon').getAttribute('data-tone')).to.equal('neutral'); // bogus → neutral
    // d: meta (a number) only → describedby = meta
    expect(d.getAttribute('aria-describedby')).to.equal('dd-b-opt-3-meta');
    expect(d.querySelector('.td-dropdown__meta').textContent).to.equal('3');
    // e: plain
    expect(e.classList.contains('td-dropdown__option--rich')).to.equal(false);
    expect(e.querySelector('.td-dropdown__text')).to.equal(null);
    // f: disabled rich row
    expect(f.getAttribute('aria-disabled')).to.equal('true');
    // every describedby id resolves inside its own row
    for (const r of rows(el)) {
      for (const id of (r.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)) {
        const t = document.getElementById(id);
        expect(!!t && r.contains(t), id).to.equal(true);
      }
    }
    // one line: label over description; the long description is cut, the status stays whole and inside the row
    const long = dd('', [{ value: 'l', label: 'Dài', description: 'Mô tả rất dài '.repeat(20), status: { tone: 'warning', text: 'Chờ duyệt' } }]);
    long.open();
    await settle();
    const lr = rows(long)[0];
    const dt = lr.querySelector('.td-dropdown__desc-text');
    const st = lr.querySelector('.td-dropdown__status');
    expect(dt.scrollWidth > dt.clientWidth).to.equal(true);
    expect(st.getBoundingClientRect().right <= lr.getBoundingClientRect().right + 0.5).to.equal(true);
    expect(st.scrollWidth <= st.clientWidth + 1).to.equal(true);
    expect(lr.querySelector('.td-dropdown__desc').getBoundingClientRect().height < 24).to.equal(true);
  });

  it('(c) an unknown icon → no tile, no slot, exactly one console.warn across renders, rows and the trigger', async () => {
    const name = 'nope-v084-c';
    const seen = await warnsDuring(async () => {
      const el = dd('', [
        { value: 'x', label: 'X', icon: name },
        { value: 'y', label: 'Y', icon: name, description: 'mô tả' },
        { value: 'z', label: 'Z', icon: 'star' },
      ]);
      el.open();
      await settle(1);
      el.options = el.options.map((o) => ({ ...o })); // a second render
      el.setValue('y'); // trigger + another render
      await settle(1);
      expect(menu(el).querySelectorAll(`[data-td-icon="${name}"]`).length + el.querySelectorAll(`[data-td-icon="${name}"]`).length).to.equal(0);
      const [x, y, z] = rows(el);
      expect(x.classList.contains('td-dropdown__option--rich')).to.equal(false); // nothing valid left → plain row
      expect(y.querySelector('.td-dropdown__icon')).to.equal(null);
      expect(y.classList.contains('td-dropdown__option--rich')).to.equal(true);
      expect(!!z.querySelector('.td-dropdown__icon svg')).to.equal(true);
      expect(el.querySelector('.td-dropdown__value-icon')).to.equal(null);
    });
    expect(seen.filter((m) => m.includes(name))).to.deep.equal([`td-dropdown: unknown icon "${name}"`]);
  });

  it('(d) markup in every text (label, description, status, meta, keywords, group label, tones) stays literal text', async () => {
    window.__xss084 = 0;
    const X = '<img src=x onerror="window.__xss084=1"><script>window.__xss084=1</script>';
    const Q = '" onmouseover="window.__xss084=1" x="';
    const el = dd('id="dd-d"', [
      { value: Q, label: X, description: X, status: { tone: Q, text: X }, meta: X, keywords: [X], iconTone: Q, icon: 'star', group: 'g' },
    ], [{ key: 'g', label: X }]);
    el.open();
    el.setValue(Q);
    await settle(2);
    const m = menu(el);
    expect(m.querySelectorAll('img, script').length + el.querySelectorAll('img, script').length).to.equal(0);
    expect(m.querySelectorAll('[onerror], [onmouseover]').length).to.equal(0);
    const r = rows(el)[0];
    expect(r.querySelector('.td-dropdown__option-label').textContent).to.equal(X);
    expect(r.querySelector('.td-dropdown__desc-text').textContent).to.equal(X);
    expect(r.querySelector('.td-dropdown__status').textContent).to.equal(X);
    expect(r.querySelector('.td-dropdown__status').getAttribute('data-tone')).to.equal('neutral');
    expect(r.querySelector('.td-dropdown__icon').getAttribute('data-tone')).to.equal('neutral');
    expect(r.querySelector('.td-dropdown__meta').textContent).to.equal(X);
    expect(r.getAttribute('data-value')).to.equal(Q);
    expect(heads(el)).to.deep.equal([X]);
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal(X);
    expect(scroller(el).querySelectorAll('[style]').length).to.equal(0);
    expect(el.querySelectorAll('.td-dropdown__value [style]').length).to.equal(0);
    type(el, 'img');
    await settle(1);
    expect(window.__xss084).to.equal(0);
  });
});

describe('v0.84.0 td-dropdown — trigger icon (e)', () => {
  it('shows the selected option icon (after the dot), trigger-icon="none" hides it, name / title stay the label', async () => {
    const opts = [{ value: 'a', label: 'Kho chính', icon: 'archive', swatch: '#ff0000' }, { value: 'p', label: 'Thường' }];
    const el = dd('label="Kho" value="a"', opts);
    await settle(2);
    const span = () => el.querySelector('.td-dropdown__value');
    const icon = () => span().querySelector(':scope > .td-dropdown__value-icon');
    expect(!!icon() && !!icon().querySelector('svg.td-icon')).to.equal(true);
    expect(icon().getAttribute('aria-hidden')).to.equal('true');
    expect(icon().previousElementSibling && icon().previousElementSibling.localName).to.equal('svg'); // the dot first
    expect(span().textContent).to.equal('Kho chính');
    expect(trig(el).textContent.trim()).to.equal('Kho chính');
    expect(getComputedStyle(icon()).marginInlineStart).to.equal('1px');
    // _updateValueText path (selection changes)
    el.setValue('p');
    expect(icon()).to.equal(null);
    el.setValue('a');
    expect(!!icon() && !!icon().querySelector('svg')).to.equal(true);
    for (const off of ['none', 'off', 'false']) {
      el.setAttribute('trigger-icon', off);
      expect(icon(), off).to.equal(null);
      expect(span().textContent).to.equal('Kho chính');
      el.removeAttribute('trigger-icon');
      expect(!!icon()).to.equal(true);
    }
    el.setAttribute('trigger-icon', 'plus'); // reserved for v0.85.0: ignored in select mode
    expect(icon().getAttribute('data-td-icon')).to.equal('archive');
    // the title of a cut value is the label only
    el.style.width = '120px'; // test-only sizing via CSSOM
    el.setValue('p');
    el.setValue('a');
    await wait(80);
    expect(span().getAttribute('title')).to.equal('Kho chính');
    // the first render with trigger-icon="none" prints no slot either
    const el2 = dd('trigger-icon="none" value="a"', opts);
    await settle(1);
    expect(el2.querySelector('.td-dropdown__value-icon')).to.equal(null);
  });
});

/** the 5-row window: the 5th row ends at the scroller's visible bottom, the 6th starts there (±1px) */
function expectFiveRows(el, what) {
  const sc = scroller(el);
  const all = [...sc.querySelectorAll('.td-dropdown__option')];
  const bottom = sc.getBoundingClientRect().top + sc.clientHeight;
  expect(sc.scrollTop, `${what} scrollTop`).to.equal(0);
  expect(Math.abs(all[4].getBoundingClientRect().bottom - bottom), `${what} 5th bottom`).to.be.at.most(1);
  expect(all[5].getBoundingClientRect().top, `${what} 6th top`).to.be.at.least(bottom - 1);
  expect(all[3].getBoundingClientRect().top < bottom).to.equal(true);
}

describe('v0.84.0 td-dropdown — measured height + PageDown (f, g)', () => {
  const MIXED = [
    { value: 'a', label: 'A rich', description: 'mô tả A', group: 'k' },
    { value: 'b', label: 'B plain', group: 'k' },
    { value: 'c', label: 'C rich', icon: 'star', meta: '7', group: 'k' },
    { value: 'd', label: 'D plain', group: 's' },
    { value: 'e', label: 'E rich', description: 'mô tả E', status: { tone: 'info', text: 'Mới' }, group: 's' },
    { value: 'f', label: 'F plain', group: 's' },
    { value: 'g', label: 'G plain' },
    { value: 'h', label: 'H rich', description: 'mô tả H' },
    { value: 'i', label: 'I plain' },
  ];
  const GROUPS = [{ key: 'k', label: 'Kho' }, { key: 's', label: 'Cửa hàng' }];

  it('(f) max-height="5" shows exactly 5 rows: rich only, mixed, mixed with groups; a search re-measures', async () => {
    const rich = dd('max-height="5" allow-clear="false"', MIXED.map((o) => ({ ...o, description: `mô tả ${o.value}`, group: undefined })));
    rich.open();
    await settle();
    expectFiveRows(rich, 'rich');
    rich.close();
    const mixed = dd('max-height="5" allow-clear="false"', MIXED.map((o) => ({ ...o, group: undefined })));
    mixed.open();
    await settle();
    expectFiveRows(mixed, 'mixed');
    mixed.close();
    const grouped = dd('max-height="5" allow-clear="false"', MIXED, GROUPS);
    grouped.open();
    await settle();
    expectFiveRows(grouped, 'grouped');
    // a search leaving ≤ 5 rows → natural height (no max-height), back to 5 rows with the full list
    type(grouped, 'rich');
    await settle(1);
    expect(rows(grouped).length).to.equal(4);
    expect(scroller(grouped).style.maxHeight).to.equal('');
    type(grouped, '');
    await settle(1);
    expectFiveRows(grouped, 'grouped after search');
    // the clear row counts as a row
    grouped.setValue('b');
    grouped.close();
    grouped.removeAttribute('allow-clear');
    await settle(1);
    grouped.open();
    await settle();
    expect(!!scroller(grouped).querySelector('.td-dropdown__option--clear')).to.equal(true);
    expectFiveRows(grouped, 'with clear row');
  });

  it('(g) PageDown from the first row lands on row 6 (one page = the 5 visible rows) in a mixed grouped list', async () => {
    const el = dd('max-height="5" allow-clear="false" searchable="false"', MIXED, [{ key: 'k', label: 'Kho' }, { key: 's', label: 'Cửa hàng' }]);
    key(el, 'Home'); // closed: opens on the first option
    await settle();
    const rs = rows(el);
    expect(activeId(el)).to.equal(rs[0].id);
    key(el, 'PageDown');
    await settle(1);
    expect(activeId(el)).to.equal(rs[5].id);
    const sc = scroller(el).getBoundingClientRect();
    const r6 = rs[5].getBoundingClientRect();
    expect(r6.top >= sc.top - 1 && r6.bottom <= sc.bottom + 1).to.equal(true); // scrolled into view
    key(el, 'PageUp');
    expect(activeId(el)).to.equal(rs[0].id);
  });
});

describe('v0.84.0 td-dropdown — groups (h, i, l, n)', () => {
  const OPTS = [
    { value: 'z1', label: 'Không nhóm 1' },
    { value: 's1', label: 'Sổ tay', group: 's', description: 'giấy' },
    { value: 'k1', label: 'Kéo', group: 'k' },
    { value: 'u1', label: 'Lạ', group: 'unknown' },
    { value: 'k2', label: 'Keo dán', group: 'k', disabled: true },
    { value: 's2', label: 'Sáp màu', group: 's' },
    { value: 'k3', label: 'Kẹp giấy', group: 'k' },
  ];
  const GROUPS = [{ key: 'k', label: 'Văn phòng phẩm' }, { key: 's', label: 'Sản phẩm' }, { key: 'e', label: 'Trống' }];

  it('(h) order by `groups`, unknown / missing trailing, emptied groups hidden, headers never active, role=group named', async () => {
    const el = dd('id="dd-h" searchable="false" allow-clear="false"', OPTS, GROUPS);
    el.open();
    await settle();
    expect(values(el)).to.deep.equal(['k1', 'k2', 'k3', 's1', 's2', 'z1', 'u1']);
    expect(heads(el)).to.deep.equal(['Văn phòng phẩm', 'Sản phẩm']); // the empty "Trống" group is not printed
    const groupsEls = [...scroller(el).querySelectorAll(':scope > .td-dropdown__group')];
    expect(groupsEls.length).to.equal(2);
    groupsEls.forEach((g, i) => {
      expect(g.getAttribute('role')).to.equal('group');
      const head = document.getElementById(g.getAttribute('aria-labelledby'));
      expect(!!head && g.firstElementChild === head).to.equal(true);
      expect(head.getAttribute('role')).to.equal('presentation');
      expect(head.id).to.equal(`dd-h-grp-${i}`);
      expect(head.hasAttribute('data-nav') || head.classList.contains('td-dropdown__option')).to.equal(false);
    });
    // trailing rows are direct children of the scroller (no wrapper)
    expect(rows(el).slice(5).every((r) => r.parentElement === scroller(el))).to.equal(true);
    // ↓ walk through the whole list (wraps): always an option, never a header, never the disabled k2
    const seen = new Set();
    for (let i = 0; i < 16; i++) {
      key(el, 'ArrowDown');
      const t = document.getElementById(activeId(el));
      expect(!!t && t.getAttribute('role') === 'option', `step ${i}`).to.equal(true);
      expect(t.getAttribute('data-value')).to.not.equal('k2');
      seen.add(t.getAttribute('data-value'));
    }
    expect(seen.size).to.equal(6);
    for (let i = 0; i < 8; i++) {
      key(el, 'ArrowUp');
      expect(document.getElementById(activeId(el)).getAttribute('role')).to.equal('option');
    }
    key(el, 'Home');
    expect(document.getElementById(activeId(el)).getAttribute('data-value')).to.equal('k1');
    key(el, 'End');
    expect(document.getElementById(activeId(el)).getAttribute('data-value')).to.equal('u1');
    // type-ahead "s" → an option starting with S (not the header "Sản phẩm")
    key(el, 's');
    expect(['s1', 's2']).to.include(document.getElementById(activeId(el)).getAttribute('data-value'));
    // the first row of a group scrolls its header into view too
    key(el, 'Home');
    await settle(1);
    const head0 = scroller(el).querySelector('.td-dropdown__group-label').getBoundingClientRect();
    expect(head0.top >= scroller(el).getBoundingClientRect().top - 1).to.equal(true);
    // a header click does nothing (menu open, nothing selected)
    scroller(el).querySelector('.td-dropdown__group-label').click();
    expect(el._isOpen).to.equal(true);
    expect(el.getValue()).to.equal(null);
    // a row click in a group selects
    rows(el)[3].click();
    expect(el.getValue()).to.equal('s1');
  });

  it('(h) filtering empties a group → its header is gone; groups re-assigned re-filter in place; empty label = unwrapped', async () => {
    const el = dd('allow-clear="false"', OPTS, GROUPS);
    el.open();
    await settle();
    type(el, 'giay'); // s1 (description) + k3 (label, no diacritics)
    await settle(1);
    expect(values(el)).to.deep.equal(['k3', 's1']);
    type(el, 'keo');
    expect(values(el)).to.deep.equal(['k1', 'k2']); // "Kéo", "Keo dán" (disabled, still listed)
    expect(heads(el)).to.deep.equal(['Văn phòng phẩm']);
    type(el, '');
    el.groups = [{ key: 's', label: 'Sản phẩm' }, { key: 'k', label: '' }];
    expect(el._isOpen).to.equal(true);
    expect(values(el)).to.deep.equal(['s1', 's2', 'k1', 'k2', 'k3', 'z1', 'u1']);
    expect(heads(el)).to.deep.equal(['Sản phẩm']);
    expect(rows(el)[2].parentElement === scroller(el)).to.equal(true); // "k" has no label → no wrapper
    el.groups = [];
    expect(values(el)).to.deep.equal(OPTS.map((o) => o.value)); // grouping off → array order
    expect(heads(el)).to.deep.equal([]);
  });

  it('(h) `groups` set before the element upgrades is applied', async () => {
    const raw = document.createElement('div');
    raw.innerHTML = '<td-dropdown></td-dropdown>';
    const d = raw.firstElementChild;
    // simulate a pre-upgrade own property (the accessor is shadowed until connect)
    Object.defineProperty(d, 'groups', { value: GROUPS, writable: true, configurable: true, enumerable: true });
    d.options = OPTS.map((o) => ({ ...o }));
    host.appendChild(d);
    d.open();
    await settle();
    expect(heads(d)).to.deep.equal(['Văn phòng phẩm', 'Sản phẩm']);
  });

  it('(i) <select> with <optgroup> and the new data-* upgrades to groups and fields', async () => {
    const el = mount(`<td-dropdown><select>
      <option value="">— Chọn —</option>
      <option value="z">Ngoài nhóm</option>
      <optgroup label=" Kho "><option value="a" data-icon="archive" data-icon-tone="accent" data-description="Hà Nội"
        data-status="Mở" data-status-tone="success" data-meta="12" data-keywords="main kho1">Kho A</option></optgroup>
      <optgroup label="Shop" disabled><option value="b" data-status="Đóng">Shop B</option></optgroup>
    </select></td-dropdown>`);
    expect(el.options.map((o) => ({ ...o }))).to.deep.equal([
      { value: 'z', label: 'Ngoài nhóm' },
      { value: 'a', label: 'Kho A', icon: 'archive', iconTone: 'accent', description: 'Hà Nội', status: { text: 'Mở', tone: 'success' }, meta: '12', keywords: 'main kho1', group: 'g0' },
      { value: 'b', label: 'Shop B', disabled: true, status: { text: 'Đóng' }, group: 'g1' },
    ]);
    expect(el.groups.map((g) => ({ ...g }))).to.deep.equal([{ key: 'g0', label: 'Kho' }, { key: 'g1', label: 'Shop' }]);
    el.open();
    await settle();
    expect(values(el)).to.deep.equal(['a', 'b', 'z']); // groups first, the direct option trails
    expect(heads(el)).to.deep.equal(['Kho', 'Shop']);
    const a = rows(el)[0];
    expect(a.classList.contains('td-dropdown__option--rich')).to.equal(true);
    expect(a.querySelector('.td-dropdown__status').getAttribute('data-tone')).to.equal('success');
    expect(rows(el)[1].querySelector('.td-dropdown__status').getAttribute('data-tone')).to.equal('neutral');
    type(el, 'kho1');
    expect(values(el)).to.deep.equal(['a']);
    // a plain select (no optgroup / data-*) adds no keys
    const plain = mount('<td-dropdown><select><option value="x">X</option></select></td-dropdown>');
    expect(plain.options.map((o) => ({ ...o }))).to.deep.equal([{ value: 'x', label: 'X' }]);
    expect(plain.groups).to.deep.equal([]);
  });

  it('(l) the create row stays last, outside the groups, and End reaches it', async () => {
    const el = dd('id="dd-l" create-label="Thêm mới" searchable="false"', OPTS, GROUPS);
    key(el, 'ArrowDown');
    await settle();
    const all = [...listbox(el).querySelectorAll('[role="option"]')];
    expect(all[all.length - 1].id).to.equal('dd-l-opt-create');
    expect(all[all.length - 1].closest('.td-dropdown__group')).to.equal(null);
    key(el, 'End');
    expect(activeId(el)).to.equal('dd-l-opt-create');
  });

  it('(n) reopening a grouped list after a search (reset on close) keeps the groups', async () => {
    const el = dd('allow-clear="false"', OPTS, GROUPS);
    el.open();
    await settle();
    type(el, 'sáp');
    expect(heads(el)).to.deep.equal(['Sản phẩm']);
    el.close();
    expect(values(el)).to.deep.equal(['k1', 'k2', 'k3', 's1', 's2', 'z1', 'u1']);
    el.open();
    await settle();
    expect(heads(el)).to.deep.equal(['Văn phòng phẩm', 'Sản phẩm']);
    expect(values(el)).to.deep.equal(['k1', 'k2', 'k3', 's1', 's2', 'z1', 'u1']);
  });
});

describe('v0.84.0 td-dropdown — search + result count (j, k)', () => {
  const CITIES = [
    { value: 'hcm', label: 'TP. HCM', description: 'Thành phố Hồ Chí Minh', keywords: ['saigon', 'SG'] },
    { value: 'hn', label: 'Hà Nội', keywords: 'thu do' },
    { value: 'dn', label: 'Đà Nẵng', meta: 'miền Trung' },
  ];

  it('(j) label + description + keywords by default (no diacritics, any case); search-fields restricts, live while open', async () => {
    const el = dd('allow-clear="false"', CITIES);
    el.open();
    await settle();
    type(el, 'ho chi');
    expect(values(el)).to.deep.equal(['hcm']);
    type(el, 'SAIGON');
    expect(values(el)).to.deep.equal(['hcm']);
    type(el, 'THU DO');
    expect(values(el)).to.deep.equal(['hn']);
    type(el, 'mien'); // meta is never searched
    expect(values(el)).to.deep.equal([]);
    type(el, 'saigon');
    el.setAttribute('search-fields', 'label');
    expect(el._isOpen).to.equal(true);
    expect(menu(el).hidden).to.equal(false);
    expect(menu(el).querySelector('.td-dropdown__search').value).to.equal('saigon');
    expect(values(el)).to.deep.equal([]); // the 0.83.0 behaviour
    el.setAttribute('search-fields', 'description, keywords');
    expect(values(el)).to.deep.equal(['hcm']);
    type(el, 'nội');
    expect(values(el)).to.deep.equal([]); // label not searched
    el.setAttribute('search-fields', 'foo bar'); // none valid → default
    expect(values(el)).to.deep.equal(['hn']);
    el.setAttribute('search-fields', '');
    expect(values(el)).to.deep.equal(['hn']);
  });

  it('(k) the count is in the status region with data-count (visually hidden) only with a query and ≥ 1 match', async () => {
    const el = dd('allow-clear="false" create-label="Thêm"', [...CITIES, { value: 'hp', label: 'Hải Phòng' }]);
    el.setValue('hn');
    el.open();
    await settle();
    const e = empty(el);
    expect(e.getAttribute('role')).to.equal('status');
    expect(e.textContent).to.equal('');
    expect(e.hasAttribute('data-count')).to.equal(false);
    type(el, 'h'); // TP. HCM, Hà Nội, Hải Phòng, Thành phố Hồ… (the clear / create rows are not counted)
    expect(e.textContent).to.equal('3 kết quả');
    expect(e.hasAttribute('data-count')).to.equal(true);
    const cs = getComputedStyle(e);
    expect(cs.position).to.equal('absolute');
    expect(Math.round(e.getBoundingClientRect().width)).to.be.at.most(1);
    type(el, '   ');
    expect(e.textContent).to.equal('');
    expect(e.hasAttribute('data-count')).to.equal(false);
    type(el, 'zzz');
    expect(e.textContent).to.equal('Không tìm thấy kết quả');
    expect(e.hasAttribute('data-count')).to.equal(false);
    expect(getComputedStyle(e).position).to.not.equal('absolute');
    const saved = TdDropdown.labels.resultCount;
    try {
      TdDropdown.labels.resultCount = '';
      type(el, 'h');
      expect(e.textContent).to.equal('');
      expect(e.hasAttribute('data-count')).to.equal(false);
      TdDropdown.labels.resultCount = 'Found {count} of {count}';
      type(el, 'hai');
      expect(e.textContent).to.equal('Found 1 of 1');
    } finally {
      TdDropdown.labels.resultCount = saved;
    }
  });
});

describe('v0.84.0 td-dropdown — in a modal (m)', () => {
  it('Escape closes the menu first (the modal stays open, focus back on the trigger)', async () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-dropdown aria-label="Kho" searchable="false"></td-dropdown>';
    const el = wrap.querySelector('td-dropdown');
    const id = TdModal.show({ title: 'Phiếu', body: wrap });
    el.groups = [{ key: 'k', label: 'Kho' }];
    el.options = RICH.map((o) => ({ ...o, group: 'k' }));
    await wait(400);
    trig(el).focus();
    trig(el).click();
    await settle();
    expect(el._isOpen).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await settle(1);
    expect(el._isOpen).to.equal(false);
    expect(menu(el).hidden).to.equal(true);
    expect(TdModal._isOpen(id)).to.equal(true);
    expect(document.activeElement === trig(el)).to.equal(true);
  });
});
