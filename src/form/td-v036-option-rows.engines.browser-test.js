import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-dropdown.js';
import './td-chip-input.js';
import './td-tree-select.js';
import { TdMenu } from '../feedback/td-menu.js';

// v0.36.0 (owner addition, dcms2 option rows) — every popup list: full-bleed rows (the row spans the list's full width,
// radius 0), hover / selected / keyboard-active fills; single lists: selected = semibold + ✓ at the inline end; the active
// row carries an inline-start accent bar. Chromium + Firefox + WebKit; waits on real signals.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
async function settle() {
  await raf();
  await until(() => document.getAnimations().every((a) => a.playState !== 'running'), 3000, 'animations');
}
const root = document.createElement('div');
document.body.appendChild(root);
afterEach(async () => {
  TdMenu.close();
  document.activeElement?.blur?.();
  root.innerHTML = '';
  await raf();
});

/** the row's box spans the popup's inner width (popup border box minus its borders) ±1px */
function fullBleed(row, popup) {
  const r = row.getBoundingClientRect();
  const p = popup.getBoundingClientRect();
  const cs = getComputedStyle(popup);
  const left = p.left + parseFloat(cs.borderLeftWidth);
  const right = p.right - parseFloat(cs.borderRightWidth);
  return Math.abs(r.left - left) <= 1 && right - r.right <= 1 + (popup.offsetWidth - popup.clientWidth);
}
const radius0 = (el) => getComputedStyle(el).borderTopLeftRadius === '0px' && getComputedStyle(el).borderTopRightRadius === '0px';
const hasBar = (el) => /inset/.test(getComputedStyle(el).boxShadow) && getComputedStyle(el).boxShadow !== 'none';

describe('v0.36.0 popup option rows (dcms2)', () => {
  it('td-dropdown: full-bleed rows, radius 0; selected = semibold + ✓ at the end; active row = fill + accent bar', async () => {
    root.innerHTML = '<td-dropdown label="Thành phố"></td-dropdown>';
    const dd = root.querySelector('td-dropdown');
    dd.options = [{ value: 'hn', label: 'Hà Nội' }, { value: 'hcm', label: 'TP. Hồ Chí Minh' }, { value: 'dn', label: 'Đà Nẵng' }];
    dd.setValue('hcm');
    await until(() => dd.querySelector('.td-dropdown__trigger'), 3000, 'render');
    dd.querySelector('.td-dropdown__trigger').click();
    const menu = await until(() => { const m = document.getElementById(`${dd.id}-menu`); return m && !m.hidden && m; }, 3000, 'menu');
    await settle();
    const opts = [...menu.querySelectorAll('.td-dropdown__option')];
    for (const o of opts) {
      expect(fullBleed(o, menu), `full bleed ${o.textContent}`).to.equal(true);
      expect(radius0(o)).to.equal(true);
    }
    const sel = opts.find((o) => o.getAttribute('aria-selected') === 'true');
    expect(Number(getComputedStyle(sel).fontWeight)).to.be.at.least(600);
    const check = sel.querySelector('.td-dropdown__check');
    expect(check).to.not.equal(null);
    expect(check.getBoundingClientRect().right).to.be.closeTo(sel.getBoundingClientRect().right - 12, 2);
    await sendKeys({ press: 'ArrowDown' });
    const active = await until(() => menu.querySelector('.td-dropdown__option[data-active]'), 3000, 'active row');
    await settle();
    expect(hasBar(active), 'accent bar').to.equal(true);
    expect(getComputedStyle(active).backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
  });

  it('td-chip-input (multi): full-bleed rows keep the shared box at the start; active row has the bar', async () => {
    root.innerHTML = '<td-chip-input selection-only label="Vai trò"></td-chip-input>';
    const c = root.querySelector('td-chip-input');
    c.options = [{ value: 'a', label: 'An' }, { value: 'b', label: 'Bình' }];
    c.value = ['a'];
    await until(() => c.querySelector('input'), 3000, 'render');
    c.open();
    const menu = await until(() => document.querySelector('.td-chip-input__menu[data-state="open"]'), 3000, 'menu');
    await settle();
    const opts = [...menu.querySelectorAll('.td-chip-input__option')];
    for (const o of opts) {
      expect(fullBleed(o, menu), 'full bleed').to.equal(true);
      expect(radius0(o)).to.equal(true);
      const box = o.querySelector('.td-check').getBoundingClientRect();
      expect(box.left - o.getBoundingClientRect().left).to.be.closeTo(12, 1.5);
    }
    c.querySelector('input').focus();
    await sendKeys({ press: 'ArrowDown' });
    const active = await until(() => menu.querySelector('.td-chip-input__option[data-active]'), 3000, 'active');
    await settle();
    expect(hasBar(active)).to.equal(true);
  });

  it('td-tree-select: popup rows paint full-bleed (row background reaches the popup edge) and the selected row is semibold', async () => {
    root.innerHTML = '<td-tree-select label="Danh mục" searchable="false"></td-tree-select>';
    const s = root.querySelector('td-tree-select');
    s.data = [{ value: 'a', label: 'Điện thoại', children: [{ value: 'a1', label: 'iPhone' }] }, { value: 'b', label: 'Máy tính bảng' }];
    s.value = 'b';
    await until(() => s.querySelector('.td-tree-select__trigger'), 3000, 'render');
    s.querySelector('.td-tree-select__trigger').click();
    const menu = await until(() => document.querySelector('.td-tree-select__menu[data-state="open"]'), 3000, 'menu');
    await settle();
    const selRow = menu.querySelector('.td-tree__item[aria-selected="true"] > .td-tree__row');
    expect(Number(getComputedStyle(selRow).fontWeight)).to.be.at.least(600);
    expect(radius0(selRow)).to.equal(true);
    // the painted state (::before) starts left of the row (reaches the popup edge, clipped)
    const before = getComputedStyle(selRow, '::before');
    expect(before.backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
    expect(parseFloat(before.left) < 0 || before.insetInlineStart?.startsWith('-')).to.equal(true);
  });

  it('td-menu: full-bleed items, radius 0; keyboard focus = fill + accent bar', async () => {
    const b = document.createElement('button');
    b.textContent = 'Menu';
    root.appendChild(b);
    TdMenu.open(b, [{ label: 'Sửa' }, { label: 'Nhân bản' }], { focus: 'first' });
    const menu = await until(() => document.querySelector('.td-menu[data-state="open"]'), 3000, 'menu');
    await settle();
    for (const it of menu.querySelectorAll('.td-menu__item')) {
      expect(fullBleed(it, menu), 'full bleed').to.equal(true);
      expect(radius0(it)).to.equal(true);
    }
    await sendKeys({ press: 'ArrowDown' });
    await settle();
    const focused = document.activeElement;
    expect(focused.classList.contains('td-menu__item')).to.equal(true);
    if (focused.matches(':focus-visible')) expect(hasBar(focused)).to.equal(true);
  });
});
