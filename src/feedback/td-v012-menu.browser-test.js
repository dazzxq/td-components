import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, emulateMedia } from '@web/test-runner-commands';
import { TdMenu, safeMenuHref } from './td-menu.js';
import { TdModal } from './td-modal.js';
import { LAYERS, hasActiveAbove } from '../utils/layers.js';

// v0.12.0 step 2 — TdMenu (plan docs/internal/plans/v0.12.0-new-components.md D1–D7). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const active = () => document.activeElement;
const menuEl = () => document.querySelector('body > .td-menu');
const items = () => [...(menuEl()?.querySelectorAll('.td-menu__item') || [])];
const labelOf = (n) => n?.querySelector('.td-menu__label')?.textContent;
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
async function click(n) {
  await sendMouse({ type: 'click', position: center(n) });
}

function btn(label = 'Mở', attrs = '') {
  host.insertAdjacentHTML('beforeend', `<button type="button" ${attrs}>${label}</button>`);
  return /** @type {HTMLButtonElement} */ (host.lastElementChild);
}

const basic = (log = []) => [
  { label: 'Sao chép liên kết', id: 'copy', onSelect: () => log.push('copy') },
  { label: 'Chia sẻ', id: 'share', icon: 'link', onSelect: () => log.push('share') },
  { separator: true },
  { label: 'Báo cáo', id: 'report', danger: true, onSelect: () => log.push('report') },
];

afterEach(async () => {
  TdMenu.close();
  TdModal.closeAll?.();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(0);
});

describe('v0.12 TdMenu — structure + ARIA', () => {
  it('portals a strong-glass role=menu labelled by the trigger; trigger gets haspopup/expanded/controls', async () => {
    const b = btn('Tùy chọn');
    const h = TdMenu.open(b, basic());
    const m = menuEl();
    expect(!!h && same(h.element, m)).to.equal(true);
    expect(m.parentElement === document.body).to.equal(true);
    expect([...m.classList]).to.include.members(['td-menu', 'td-glass-surface', 'td-glass-surface--strong']);
    expect(m.getAttribute('role')).to.equal('menu');
    expect(b.id).to.match(/^td-menu-trigger-\d+$/);
    expect(m.getAttribute('aria-labelledby')).to.equal(b.id);
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('true');
    expect(b.getAttribute('aria-controls')).to.equal(m.id);
    expect(m.getAttribute('data-state')).to.equal('open');
    expect(m.getAttribute('data-align')).to.equal('end');
    expect(['bottom', 'top']).to.include(m.getAttribute('data-placement'));
    const its = items();
    expect(its.map((n) => n.getAttribute('role'))).to.deep.equal(['menuitem', 'menuitem', 'menuitem']);
    expect(its.every((n) => n.getAttribute('tabindex') === '-1')).to.equal(true);
    expect(m.querySelectorAll('[role="separator"]').length).to.equal(1);
    expect(its[1].querySelector('.td-menu__icon svg[data-icon="link"]')).to.not.equal(null);
    expect(its[2].classList.contains('td-menu__item--danger')).to.equal(true);
    expect(its[0].getAttribute('data-item')).to.equal('copy');
    expect(same(active(), its[0])).to.equal(true);
    h.close();
    expect(menuEl()).to.equal(null);
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    expect(b.hasAttribute('aria-controls')).to.equal(false);
    expect(h.isOpen).to.equal(false);
  });

  it('opts.label → aria-label instead of aria-labelledby; align start/center; empty items → null', async () => {
    const b = btn();
    TdMenu.open(b, basic(), { label: 'Hành động', align: 'start' });
    expect(menuEl().getAttribute('aria-label')).to.equal('Hành động');
    expect(menuEl().hasAttribute('aria-labelledby')).to.equal(false);
    expect(menuEl().getAttribute('data-align')).to.equal('start');
    const r = b.getBoundingClientRect();
    expect(Math.abs(menuEl().getBoundingClientRect().left - r.left) <= 1).to.equal(true);
    TdMenu.close();
    expect(TdMenu.open(b, [])).to.equal(null);
    expect(TdMenu.open(b, [{ separator: true }, { label: '' }])).to.equal(null);
    expect(menuEl()).to.equal(null);
  });

  it('default align end: right edges line up (placeFloating D7)', async () => {
    const b = btn('Nút ở giữa trang cho phép căn phải');
    b.classList.add('td-btn');
    TdMenu.open(b, basic());
    const mr = menuEl().getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (br.right - mr.width >= 8) expect(Math.abs(mr.right - br.right) <= 1).to.equal(true);
  });

  it('hint on every item: description via aria-describedby, name = label only', async () => {
    const b = btn();
    TdMenu.open(b, [
      { label: 'Tải ảnh gốc', hint: 'JPEG, 4 MB' },
      { label: 'Tải bản nhỏ', hint: 'Không khả dụng', disabled: true },
    ]);
    const [a, d] = items();
    for (const n of [a, d]) {
      const hint = n.querySelector('.td-menu__hint');
      expect(n.getAttribute('aria-describedby')).to.equal(hint.id);
      expect(n.getAttribute('aria-labelledby')).to.equal(n.querySelector('.td-menu__label').id);
    }
    expect(a.querySelector('.td-menu__hint').textContent).to.equal('JPEG, 4 MB');
    expect(a.hasAttribute('title')).to.equal(false);
  });

  it('labels/hints are text; unknown icon ignored; iconNode cloned + aria-hidden', async () => {
    const b = btn();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-site', 'x');
    const x = '"><img src=x onerror=window.__pwned=1>';
    TdMenu.open(b, [
      { label: x, hint: x, icon: 'no-such-icon' },
      { label: 'Tuỳ chỉnh', iconNode: svg },
      { label: 'Chuỗi', iconNode: '<svg onload=alert(1)>' },
    ]);
    const [a, c, s] = items();
    expect(menuEl().querySelector('img')).to.equal(null);
    expect(labelOf(a)).to.equal(x);
    expect(a.querySelector('.td-menu__icon')).to.equal(null);
    const clone = c.querySelector('.td-menu__icon svg[data-site="x"]');
    expect(!!clone && clone !== svg).to.equal(true);
    expect(clone.getAttribute('aria-hidden')).to.equal('true');
    expect(s.querySelector('.td-menu__icon')).to.equal(null);
    await wait(10);
    expect(window.__pwned).to.equal(undefined);
  });
});

describe('v0.12 TdMenu — keyboard (APG, D2)', () => {
  it('ArrowDown/ArrowUp wrap, Home/End; separators skipped', async () => {
    const b = btn();
    b.focus();
    TdMenu.open(b, basic());
    const its = items();
    expect(same(active(), its[0])).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(same(active(), its[1])).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(same(active(), its[2])).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(same(active(), its[0])).to.equal(true);
    await sendKeys({ press: 'ArrowUp' });
    expect(same(active(), its[2])).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(same(active(), its[0])).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(same(active(), its[2])).to.equal(true);
  });

  it('Enter and Space activate; the menu closes, focus returns to the trigger BEFORE onSelect', async () => {
    for (const key of ['Enter', ' ']) {
      const b = btn();
      const log = [];
      let focusAtSelect = null;
      TdMenu.bind(b, [
        { label: 'Một', onSelect: () => { focusAtSelect = active(); log.push(1); } },
        { label: 'Hai', onSelect: () => log.push(2) },
      ]);
      b.focus();
      await sendKeys({ press: 'Enter' }); // native click → open, focus first
      expect(TdMenu.isOpen(b)).to.equal(true);
      expect(same(active(), items()[0])).to.equal(true);
      await sendKeys({ press: key === ' ' ? 'Space' : key });
      expect(log).to.deep.equal([1]);
      expect(TdMenu.isOpen()).to.equal(false);
      expect(same(focusAtSelect, b)).to.equal(true);
      expect(same(active(), b)).to.equal(true);
      await wait(20);
      expect(TdMenu.isOpen()).to.equal(false); // the key's keyup/click did not reopen
      host.innerHTML = '';
    }
  });

  it('bound trigger: ArrowDown opens on the first item, ArrowUp on the last; click toggles', async () => {
    const b = btn();
    TdMenu.bind(b, basic());
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    b.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(same(active(), items()[0])).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(same(active(), b)).to.equal(true);
    await sendKeys({ press: 'ArrowUp' });
    expect(same(active(), items()[2])).to.equal(true);
    await click(b); // pointerdown on the trigger does not count as outside; the click toggles closed
    expect(TdMenu.isOpen()).to.equal(false);
    await click(b);
    expect(TdMenu.isOpen(b)).to.equal(true);
  });

  it('Escape closes, focuses the trigger and is consumed', async () => {
    const b = btn();
    let reason = '';
    let reached = false;
    const spy = () => { reached = true; };
    document.addEventListener('keydown', spy);
    TdMenu.open(b, basic(), { onClose: (r) => { reason = r; } });
    await sendKeys({ press: 'Escape' });
    document.removeEventListener('keydown', spy);
    expect(TdMenu.isOpen()).to.equal(false);
    expect(same(active(), b)).to.equal(true);
    expect(reason).to.equal('escape');
    expect(reached).to.equal(false);
  });

  it('type-ahead: ASCII, repeated letter cycles, Vietnamese diacritics (đ/Đ, ồ) fold', async () => {
    const b = btn();
    TdMenu.open(b, [
      { label: 'Sao chép' },
      { label: 'Đổi tên' },
      { label: 'Sửa' },
      { label: 'Dán' },
      { label: 'Ồ lạ' },
    ]);
    const its = items();
    await sendKeys({ press: 's' });
    expect(labelOf(active())).to.equal('Sửa'); // from "Sao chép" (active) → next "s…"
    await sendKeys({ press: 's' }); // repeated letter cycles
    expect(labelOf(active())).to.equal('Sao chép');
    await wait(600);
    const typeKey = (key) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    typeKey('đ');
    expect(labelOf(active())).to.equal('Đổi tên');
    typeKey('đ');
    expect(labelOf(active())).to.equal('Dán');
    await wait(600);
    typeKey('D');
    expect(labelOf(active())).to.equal('Đổi tên');
    await wait(600);
    typeKey('o');
    expect(same(active(), its[4])).to.equal(true);
    await wait(600);
    // multi-char prefix from the active item
    typeKey('s'); typeKey('ử');
    expect(labelOf(active())).to.equal('Sửa');
  });

  it('disabled items: focusable by arrows, not activatable (keyboard + mouse); menu stays open', async () => {
    const b = btn();
    const log = [];
    TdMenu.open(b, [
      { label: 'Khoá', disabled: true, onSelect: () => log.push('x') },
      { label: 'Mở', onSelect: () => log.push('ok') },
    ]);
    const [dis, en] = items();
    expect(dis.getAttribute('aria-disabled')).to.equal('true');
    expect(dis.disabled).to.equal(false);
    expect(same(active(), en)).to.equal(true); // initial focus = first ENABLED item
    await sendKeys({ press: 'ArrowUp' });
    expect(same(active(), dis)).to.equal(true);
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    await click(dis);
    expect(log).to.deep.equal([]);
    expect(TdMenu.isOpen(b)).to.equal(true);
  });
});

describe('v0.12 TdMenu — Tab (D4)', () => {
  it('standalone: Tab / Shift+Tab close and move to the element after / before the trigger', async () => {
    host.insertAdjacentHTML('beforeend', '<input id="m-before"><button type="button" id="m-trig">Mở</button><input id="m-after">');
    const b = document.getElementById('m-trig');
    let reason = '';
    TdMenu.open(b, basic(), { onClose: (r) => { reason = r; } });
    await sendKeys({ press: 'Tab' });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reason).to.equal('tab');
    expect(active().id).to.equal('m-after');
    TdMenu.open(b, basic());
    await sendKeys({ press: 'Shift+Tab' });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(active().id).to.equal('m-before');
  });

  it('inside a TdModal: the menu works over the modal and Tab stays inside the modal focus trap', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<input id="mm-a"><button type="button" id="mm-trig">Mở menu</button><input id="mm-b">';
    TdModal.show({ title: 'Hộp thoại', body, showFooter: false });
    await frames(3);
    const trig = document.getElementById('mm-trig');
    const dialog = trig.closest('.td-modal__dialog');
    trig.focus();
    TdMenu.bind(trig, basic());
    await sendKeys({ press: 'ArrowDown' });
    expect(menuEl().hasAttribute('inert')).to.equal(false);
    expect(same(active(), items()[0])).to.equal(true);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(active().id).to.equal('mm-b');
    trig.focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Shift+Tab' });
    expect(active().id).to.equal('mm-a');
    // at the trap edge: last field → Tab wraps inside the dialog, never escapes to the page
    document.getElementById('mm-b').focus();
    await sendKeys({ press: 'Tab' });
    expect(dialog.contains(active())).to.equal(true);
    // Escape closes only the menu (the modal stays open)
    trig.focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Escape' });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.querySelector('.td-modal')).to.not.equal(null);
    expect(same(active(), trig)).to.equal(true);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
  });
});

describe('v0.12 TdMenu — selection, checkable items, links', () => {
  it('mouse selection: closes, focus on the trigger; a TdModal opened from onSelect restores to the trigger', async () => {
    const b = btn();
    let reason = '';
    TdMenu.bind(b, [{ label: 'Mở hộp thoại', onSelect: () => TdModal.show({ title: 'X', body: 'y' }) }], {
      onClose: (r) => { reason = r; },
    });
    await click(b);
    await click(items()[0]);
    expect(reason).to.equal('select');
    await frames(3);
    const modal = document.querySelector('.td-modal');
    expect(modal).to.not.equal(null);
    TdModal.close();
    await wait(400);
    expect(same(active(), b)).to.equal(true);
  });

  it('onSelect errors/rejections are logged, not thrown; ctx = { item, anchor, checked }', async () => {
    const b = btn();
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a);
    let ctx = null;
    const item = { label: 'Ném lỗi', onClick: (c) => { ctx = c; throw new Error('boom'); } };
    try {
      TdMenu.open(b, [item, { label: 'Hứa', onSelect: () => Promise.reject(new Error('later')) }]);
      await sendKeys({ press: 'Enter' });
      TdMenu.open(b, [{ label: 'Hứa', onSelect: () => Promise.reject(new Error('later')) }]);
      await sendKeys({ press: 'Enter' });
      await wait(10);
    } finally {
      console.error = orig;
    }
    expect(errs.length).to.equal(2);
    expect(same(ctx.item, item) && same(ctx.anchor, b)).to.equal(true);
  });

  it('checkbox item toggles aria-checked in place, stays open; radio group selects one and closes', async () => {
    const b = btn();
    const log = [];
    const list = [
      { label: 'Chế độ tối', type: 'checkbox', checked: false, onSelect: (c) => log.push(['dark', c.checked]) },
      { separator: true },
      { label: 'Mới nhất', group: 'sort', checked: true, onSelect: (c) => log.push(['new', c.checked]) },
      { label: 'Cũ nhất', group: 'sort', checked: false, onSelect: (c) => log.push(['old', c.checked]) },
      { label: 'Kiểu khác', type: 'radio', group: 'view', checked: true },
    ];
    TdMenu.bind(b, list);
    b.focus();
    await sendKeys({ press: 'Enter' });
    let its = items();
    expect(its.map((n) => n.getAttribute('role'))).to.deep.equal(['menuitemcheckbox', 'menuitemradio', 'menuitemradio', 'menuitemradio']);
    expect(its.map((n) => n.getAttribute('aria-checked'))).to.deep.equal(['false', 'true', 'false', 'true']);
    expect(its.every((n) => !n.querySelector('input'))).to.equal(true); // plain buttons, no nested controls
    await sendKeys({ press: 'Space' });
    expect(TdMenu.isOpen(b)).to.equal(true);
    expect(its[0].getAttribute('aria-checked')).to.equal('true');
    expect(same(active(), its[0])).to.equal(true);
    expect(list[0].checked).to.equal(false); // caller items are never mutated (review ISSUE-6); state via ctx.checked
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' }); // "Cũ nhất"
    expect(TdMenu.isOpen()).to.equal(false);
    expect(same(active(), b)).to.equal(true);
    expect(log).to.deep.equal([['dark', true], ['old', true]]);
    expect([list[2].checked, list[3].checked, list[4].checked]).to.deep.equal([true, false, true]); // caller items untouched
    b.click(); // reopen renders the CALLER's model (unchanged — a caller persists ctx.checked itself)
    its = items();
    expect(its.map((n) => n.getAttribute('aria-checked'))).to.deep.equal(['false', 'true', 'false', 'true']);
    expect(getComputedStyle(its[0].querySelector('.td-menu__check')).visibility).to.equal('hidden');
    expect(getComputedStyle(its[1].querySelector('.td-menu__check')).visibility).to.equal('visible');
    TdMenu.close();
    const frozen = [Object.freeze({ label: 'Đóng băng', type: 'checkbox', checked: false })];
    TdMenu.open(b, frozen, { focus: 'first' });
    await sendKeys({ press: 'Space' }); // must not throw on a frozen item
    expect(items()[0].getAttribute('aria-checked')).to.equal('true');
  });

  it('href whitelist: http/https/relative → <a>; mailto:/tel:/javascript:/data:/garbage → disabled button + warn', async () => {
    expect(safeMenuHref('https://a.vn/x')).to.equal('https://a.vn/x');
    expect(safeMenuHref('/tin-tuc?id=1')).to.equal('/tin-tuc?id=1');
    expect(safeMenuHref('#top')).to.equal('#top');
    expect(safeMenuHref('mailto:a@b.vn')).to.equal(null); // http/https only (inventory §1.5)
    expect(safeMenuHref('tel:+8490')).to.equal(null);
    // security review: no cleartext downgrade from an HTTPS page; relative URLs judged by the resolved protocol
    const httpsPage = { href: 'https://site.vn/a/', protocol: 'https:' };
    expect(safeMenuHref('http://evil.vn/x', httpsPage)).to.equal(null);
    expect(safeMenuHref('https://a.vn/x', httpsPage)).to.equal('https://a.vn/x');
    expect(safeMenuHref('/tin-tuc', httpsPage)).to.equal('/tin-tuc');
    expect(safeMenuHref('//cdn.vn/f', httpsPage)).to.equal('//cdn.vn/f');
    const httpPage = { href: 'http://site.vn/', protocol: 'http:' };
    expect(safeMenuHref('http://a.vn/x', httpPage)).to.equal('http://a.vn/x');
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', '\u0001javascript:x',
      'data:text/html,x', 'vbscript:x', 'http://[', '', null, 42]) {
      expect(safeMenuHref(bad), String(bad)).to.equal(null);
    }
    const b = btn();
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      TdMenu.open(b, [
        { label: 'Trang chủ', href: '/', id: 'home' },
        { label: 'Tab mới', href: 'https://example.com/', newTab: true },
        { label: 'Xấu', href: 'javascript:alert(1)' },
      ]);
    } finally {
      console.warn = orig;
    }
    const [home, ext, bad] = items();
    expect(home.localName).to.equal('a');
    expect(home.getAttribute('href')).to.equal('/');
    expect(home.getAttribute('role')).to.equal('menuitem');
    expect(home.hasAttribute('target')).to.equal(false);
    expect(ext.getAttribute('target')).to.equal('_blank');
    expect(ext.getAttribute('rel')).to.equal('noopener noreferrer');
    expect(bad.localName).to.equal('button');
    expect(bad.hasAttribute('href')).to.equal(false);
    expect(bad.getAttribute('aria-disabled')).to.equal('true');
    expect(warns.length).to.equal(1);
  });

  it('link items: click navigates natively and closes the menu (with onSelect); Space follows the link', async () => {
    const b = btn();
    const log = [];
    TdMenu.open(b, [{ label: 'Neo', href: '#td-menu-anchor', onSelect: () => log.push('sel') }]);
    const a = items()[0];
    await click(a);
    await wait(20);
    expect(location.hash).to.equal('#td-menu-anchor');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(log).to.deep.equal(['sel']);
    expect(same(active(), b)).to.equal(true);
    history.replaceState(null, '', location.pathname + location.search);
    TdMenu.open(b, [{ label: 'Neo 2', href: '#td-menu-2' }]);
    await sendKeys({ press: 'Space' });
    await wait(20);
    expect(location.hash).to.equal('#td-menu-2');
    expect(TdMenu.isOpen()).to.equal(false);
    history.replaceState(null, '', location.pathname + location.search);
  });
});

describe('v0.12 TdMenu — dismissal, lifecycle, layers', () => {
  it('outside pointerdown closes (reason outside) and the press continues (D5)', async () => {
    const b = btn();
    const other = btn('Khác');
    let clicked = false;
    other.addEventListener('click', () => { clicked = true; });
    let reason = '';
    TdMenu.open(b, basic(), { onClose: (r) => { reason = r; } });
    await click(other);
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reason).to.equal('outside');
    expect(clicked).to.equal(true);
    // a press inside the menu does not close it
    TdMenu.open(b, basic());
    await click(menuEl().querySelector('.td-menu__separator'));
    expect(TdMenu.isOpen(b)).to.equal(true);
  });

  it('reopen idempotency: toggle on the same anchor, one menu at a time, one layer registration', async () => {
    const a = btn('A');
    const b = btn('B');
    expect(TdMenu.open(a, basic())).to.not.equal(null);
    expect(TdMenu.open(a, basic())).to.equal(null); // toggle
    expect(document.querySelectorAll('.td-menu').length).to.equal(0);
    for (let i = 0; i < 5; i++) {
      TdMenu.open(a, basic());
      TdMenu.open(b, basic()); // closes A's menu
    }
    expect(document.querySelectorAll('.td-menu').length).to.equal(1);
    expect(TdMenu.isOpen(b)).to.equal(true);
    expect(TdMenu.isOpen(a)).to.equal(false);
    expect(a.getAttribute('aria-expanded')).to.equal('false');
    const first = TdMenu.open(a, basic());
    const stale = first.close;
    TdMenu.close();
    const again = TdMenu.open(a, basic());
    stale(); // a closed handle never closes a newer menu
    expect(again.isOpen).to.equal(true);
    TdMenu.close();
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
    // Escape after close reaches the page again (layer released)
    let esc = false;
    const spy = (e) => { if (e.key === 'Escape') esc = true; };
    document.addEventListener('keydown', spy);
    a.focus();
    await sendKeys({ press: 'Escape' });
    document.removeEventListener('keydown', spy);
    expect(esc).to.equal(true);
  });

  it('lazy items function runs at open; bind twice replaces; unbind closes and detaches', async () => {
    const b = btn();
    let calls = 0;
    TdMenu.bind(b, () => { calls++; return basic(); });
    const unbind = TdMenu.bind(b, () => { calls += 10; return basic(); });
    b.click();
    expect(calls).to.equal(10);
    expect(TdMenu.isOpen(b)).to.equal(true);
    unbind();
    expect(TdMenu.isOpen()).to.equal(false);
    b.click();
    expect(TdMenu.isOpen()).to.equal(false);
  });

  it('anchor removed or scrolled out of view → closes (reason hidden); scrolling inside a long menu does not', async () => {
    const long = Array.from({ length: 60 }, (_, i) => ({ label: `Mục ${i + 1}` }));
    const b = btn();
    let reason = '';
    TdMenu.open(b, long, { onClose: (r) => { reason = r; } });
    const m = menuEl();
    expect(m.scrollHeight > m.clientHeight).to.equal(true); // capped, scrolls
    m.scrollTop = 200;
    m.dispatchEvent(new Event('scroll'));
    await frames(2);
    expect(TdMenu.isOpen(b)).to.equal(true);
    b.remove();
    window.dispatchEvent(new Event('scroll'));
    await frames(2);
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reason).to.equal('hidden');

    const b2 = btn('Cuộn');
    const pad = document.createElement('div');
    host.append(pad);
    // make the page scrollable without inline style markup: CSSOM only
    pad.style.setProperty('height', '3000px');
    TdMenu.open(b2, basic());
    window.scrollTo(0, 1500);
    await frames(3);
    expect(TdMenu.isOpen()).to.equal(false);
    window.scrollTo(0, 0);
  });

  it('TdMenu.button(): bound .td-menu-btn with the "more" icon and a Vietnamese default name', async () => {
    const b = TdMenu.button({ items: basic() });
    host.append(b);
    expect(b.className).to.equal('td-menu-btn');
    expect(b.type).to.equal('button');
    expect(b.getAttribute('aria-label')).to.equal('Tùy chọn');
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    expect(b.querySelector('.td-menu-btn__icon svg[data-icon="more"]')).to.not.equal(null);
    b.click();
    expect(TdMenu.isOpen(b)).to.equal(true);
    TdMenu.close();
    const withLabel = TdMenu.button({ label: '<b>Thêm</b>', getItems: basic, align: 'start' });
    host.append(withLabel);
    expect(withLabel.hasAttribute('aria-label')).to.equal(false);
    expect(withLabel.querySelector('.td-menu-btn__label').textContent).to.equal('<b>Thêm</b>');
    withLabel.click();
    expect(menuEl().getAttribute('data-align')).to.equal('start');
    TdMenu.close();
    const prev = TdMenu.labels.trigger;
    TdMenu.labels.trigger = 'Options';
    try {
      expect(TdMenu.button({ items: basic() }).getAttribute('aria-label')).to.equal('Options');
    } finally {
      TdMenu.labels.trigger = prev;
    }
    // ≥ 44 px targets under a coarse pointer are CSS-only; the fine-pointer size is the token
    expect(Math.round(b.getBoundingClientRect().height)).to.be.at.least(32);
  });
});

describe('v0.12 TdMenu — styles', () => {
  it('glass by default; over an open modal the MENU keeps glass and the covered dialog goes solid (v0.14.0 frontmost glass); focus ring on items', async () => {
    const b = btn();
    TdMenu.open(b, basic());
    await frames(2);
    const cs = getComputedStyle(menuEl());
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    expect(bf).to.not.equal('none');
    expect(cs.position).to.equal('fixed');
    expect(cs.zIndex).to.equal('450');
    await sendKeys({ press: 'ArrowDown' });
    expect(getComputedStyle(active()).boxShadow).to.match(/inset/);
    TdMenu.close();

    const body = document.createElement('div');
    body.innerHTML = '<button type="button" id="mo-trig">Mở</button>';
    TdModal.show({ title: 'M', body, showFooter: false });
    await frames(3);
    TdMenu.open(document.getElementById('mo-trig'), basic());
    const cs2 = getComputedStyle(menuEl());
    expect(cs2.backdropFilter || cs2.webkitBackdropFilter).to.not.equal('none'); // frontmost glass wins
    const dlg = getComputedStyle(document.querySelector('.td-modal[data-state="open"] .td-modal__dialog'));
    expect(dlg.backdropFilter || dlg.webkitBackdropFilter).to.equal('none'); // covered dialog → solid
    expect(dlg.backgroundColor).to.match(/^rgb\(/);
  });

  it('hint/danger text contrast ≥ 4.5:1 on the solid surface (light + dark)', async () => {
    const lum = (s) => {
      const [r, g, bb] = /rgba?\(([^)]+)\)/.exec(s)[1].split(/[\s,/]+/).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
    };
    const ratio = (a, c) => {
      const [x, y] = [lum(a), lum(c)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      document.documentElement.setAttribute('data-td-glass', 'off');
      try {
        const b = btn();
        TdMenu.open(b, [{ label: 'Xoá', danger: true, hint: 'Không thể hoàn tác' }, { label: 'Thường' }]);
        await frames(2);
        const bg = getComputedStyle(menuEl()).backgroundColor;
        const [d, n] = items();
        expect(ratio(getComputedStyle(d).color, bg), `${theme} danger`).to.be.at.least(4.5);
        expect(ratio(getComputedStyle(d.querySelector('.td-menu__hint')).color, bg), `${theme} hint`).to.be.at.least(4.5);
        expect(ratio(getComputedStyle(n).color, bg), `${theme} text`).to.be.at.least(4.5);
        TdMenu.close();
      } finally {
        document.documentElement.removeAttribute('data-td-theme');
        document.documentElement.removeAttribute('data-td-glass');
      }
    }
  });
});

describe('v0.12 TdMenu — golden contract', () => {
  const KEEP = ['type', 'role', 'id', 'tabindex', 'aria-hidden', 'aria-label', 'aria-labelledby', 'aria-describedby',
    'aria-checked', 'aria-disabled', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'data-state', 'data-placement',
    'data-align', 'data-item', 'data-td-icon', 'data-icon', 'href', 'rel', 'target'];
  function shape(el) {
    const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    const cls = [...el.classList].sort().join('.');
    const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
    return { tag: el.localName, cls, attrs, kids };
  }

  it('matches test/contracts/menu.html (trigger buttons + open portal menu)', async () => {
    const html = await (await fetch('/test/contracts/menu.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(3);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      new Function('el', 'TdMenu', t.getAttribute('data-setup'))(el, TdMenu);
      const got = t.hasAttribute('data-portal') ? menuEl() : el.firstElementChild;
      // `{m}` in the fixture = the generated menu id (counter based)
      const gotJson = JSON.stringify(shape(got)).split(menuEl()?.id || '\u0000').join('{m}');
      expect(gotJson).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      TdMenu.close();
    }
  });
});
