import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdMenu } from './td-menu.js';
import { TdModal } from './td-modal.js';
import { deepActiveElement } from '../utils/layers.js';
import '../form/td-choice-group.js';
import '../form/td-dropdown.js';
import '../display/td-tabs.js';
import '../../test/fixtures/shadow-controls.js';

// v0.53.0 M3 (plan docs/internal/plans/v0.53.0-menu-custom-item.md QĐ 3, 4, 5, 5b, 9, 11; Codex plan-review r1 #1, #2):
// keyboard, focus and pointer behaviour of a TdMenu panel hosting custom rows — Chromium, Firefox, WebKit, real keys and
// a real mouse.

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const host = document.createElement('div');
document.body.appendChild(host);
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
/** Bounded wait for a condition (rAF ticks), no fixed sleeps. */
async function until(fn, max = 60) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await frames(1);
  }
  return fn();
}
const same = (a, b) => a === b;
const panel = () => document.querySelector('body > .td-menu');
const active = () => deepActiveElement();
const label = (n) => {
  if (!n) return '∅';
  if (n.localName === 'input' && n.type === 'radio') return `radio:${n.value}`;
  return n.dataset?.k || n.getAttribute?.('aria-label') || n.textContent.trim() || n.id || n.localName;
};
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const click = (n) => sendMouse({ type: 'click', position: center(n) });
const press = (key) => sendKeys({ press: key });
const THEMES = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];

function mountTrigger() {
  host.innerHTML = '<input id="before" aria-label="trước"><button type="button" id="trig">Tài khoản</button>'
    + '<input id="after" aria-label="sau">';
  return host.querySelector('#trig');
}

function segmented(value = 'light', log = []) {
  const g = document.createElement('td-choice-group');
  g.setAttribute('variant', 'segmented');
  g.setAttribute('size', 'sm');
  g.setAttribute('value', value);
  g.options = THEMES;
  g.addEventListener('change', (e) => log.push(e.detail.value));
  return g;
}
const radio = (v) => panel().querySelector(`.td-choice__input[value="${v}"]`);
const option = (v) => panel().querySelector(`.td-choice__option[data-td-value="${v}"]`);
const checkedValue = () => panel().querySelector('.td-choice__input:checked')?.value;

/** The account panel of the plan: [Hồ sơ, Cài đặt] · segmented "Giao diện" · static header · [Đăng xuất]. */
function openAccount(opts = {}, log = [], extra = {}) {
  const t = mountTrigger();
  t.focus();
  const reasons = [];
  const h = TdMenu.open(t, [
    { label: 'Hồ sơ' }, { label: 'Cài đặt' }, { separator: true },
    { type: 'custom', id: 'theme', label: 'Giao diện', render: (ctx) => { extra.ctx = ctx; return segmented('light', log); } },
    { type: 'custom', id: 'static', render: () => { const d = document.createElement('div'); d.textContent = 'Lan · lan@example.com'; return d; } },
    { separator: true }, { label: 'Đăng xuất', danger: true },
  ], { onClose: (r) => reasons.push(r), ...opts });
  return { t, h, reasons };
}

afterEach(async () => {
  TdMenu.close();
  TdModal.closeAll?.();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
  await resetMouse();
  await frames(1);
});

describe('v0.53 TdMenu panel — arrow roving (QĐ 3)', () => {
  it('↓ enters the segmented on its CHECKED radio, skips the static row, wraps; ↑ comes back', async () => {
    const { reasons } = openAccount();
    expect(label(active())).to.equal('Hồ sơ');
    await press('ArrowDown');
    expect(label(active())).to.equal('Cài đặt');
    await press('ArrowDown');
    expect(same(active(), radio('light'))).to.equal(true);
    await press('ArrowDown');
    expect(label(active())).to.equal('Đăng xuất');
    await press('ArrowDown');
    expect(label(active())).to.equal('Hồ sơ');
    await press('ArrowUp');
    expect(label(active())).to.equal('Đăng xuất');
    await press('ArrowUp');
    expect(same(active(), radio('light'))).to.equal(true);
    await press('ArrowUp');
    expect(label(active())).to.equal('Cài đặt');
    await press('End');
    expect(label(active())).to.equal('Đăng xuất');
    await press('Home');
    expect(label(active())).to.equal('Hồ sơ');
    expect(checkedValue()).to.equal('light');
    expect(reasons).to.deep.equal([]);
  });

  it('↑ / ↓ leave the segmented from its first, middle and last radio without changing the selection', async () => {
    for (const v of ['auto', 'light', 'dark']) {
      const log = [];
      const t = mountTrigger();
      TdMenu.open(t, [{ label: 'Trên' }, { type: 'custom', render: () => segmented(v, log) }, { label: 'Dưới' }]);
      for (const [key, want] of [['ArrowDown', 'Dưới'], ['ArrowUp', 'Trên']]) {
        radio(v).focus();
        await press(key);
        expect(label(active()), `${v} ${key}`).to.equal(want);
        expect(checkedValue(), `${v} ${key}`).to.equal(v);
      }
      expect(log, v).to.deep.equal([]);
      TdMenu.close();
    }
  });

  it("focus: 'last' with a custom last row lands on its last stop; a row of disabled content is skipped", async () => {
    const t = mountTrigger();
    const form = document.createElement('div');
    form.innerHTML = '<input aria-label="Tên" data-k="name"><button type="button" data-k="save">Lưu</button>';
    const dead = document.createElement('div');
    dead.innerHTML = '<button type="button" disabled>Khoá</button>';
    TdMenu.open(t, [{ label: 'A' }, { type: 'custom', render: () => dead }, { type: 'custom', render: () => form }], { focus: 'last' });
    expect(label(active())).to.equal('save');
    await press('ArrowUp');
    expect(label(active())).to.equal('A');
    await press('ArrowDown');
    expect(label(active())).to.equal('name');
  });
});

describe('v0.53 TdMenu panel — keys inside the content (QĐ 4)', () => {
  it('← → change the segmented (wrapping at the ends), Space / Enter never close the panel', async () => {
    const log = [];
    const { reasons } = openAccount({}, log);
    radio('light').focus();
    await press('ArrowRight');
    expect(checkedValue()).to.equal('dark');
    await press('ArrowRight');
    expect(checkedValue()).to.equal('auto');
    await press('ArrowLeft');
    expect(checkedValue()).to.equal('dark');
    await press('Space');
    await press('Enter');
    expect(log).to.deep.equal(['dark', 'auto', 'dark']);
    expect(TdMenu.isOpen()).to.equal(true);
    expect(reasons).to.deep.equal([]);
    expect(same(active(), radio('dark'))).to.equal(true);
  });

  it('controls that use ↑ / ↓ keep them (text, number, range, textarea, select, data-td-menu-keys); typing never type-aheads', async () => {
    const t = mountTrigger();
    const c = document.createElement('div');
    c.innerHTML = '<input aria-label="t" data-k="text" value="abc"><input type="number" aria-label="n" data-k="num" value="5">'
      + '<input type="range" aria-label="r" data-k="range" min="0" max="10" value="5"><textarea aria-label="ta" data-k="ta"></textarea>'
      + '<select aria-label="s" data-k="sel"><option>1</option><option>2</option></select>'
      + '<div data-td-menu-keys="content"><button type="button" data-k="own">Riêng</button></div>';
    TdMenu.open(t, [{ label: 'Đăng xuất' }, { type: 'custom', render: () => c }, { label: 'Dưới' }]);
    for (const k of ['text', 'num', 'range', 'ta', 'own']) {
      const el = c.querySelector(`[data-k="${k}"]`);
      el.focus();
      await press('ArrowDown');
      expect(label(active()), k).to.equal(k);
    }
    expect(c.querySelector('[data-k="num"]').value).to.equal('4');
    expect(c.querySelector('[data-k="range"]').value).to.equal('4');
    const text = c.querySelector('[data-k="text"]');
    text.focus();
    text.setSelectionRange(3, 3);
    await sendKeys({ type: 'đx' });
    expect(text.value).to.equal('abcđx');
    expect(label(active())).to.equal('text');
  });

  it('td-tabs keeps ← → Home End; ↑ ↓ belong to the menu', async () => {
    const t = mountTrigger();
    const tabs = document.createElement('td-tabs');
    tabs.setAttribute('aria-label', 'Chế độ');
    tabs.tabs = [{ id: 'a', label: 'Một' }, { id: 'b', label: 'Hai' }, { id: 'c', label: 'Ba' }];
    TdMenu.open(t, [{ label: 'Trên' }, { type: 'custom', render: () => tabs }, { label: 'Dưới' }]);
    await press('ArrowDown');
    expect(label(active())).to.equal('Một');
    await press('ArrowRight');
    expect(label(active())).to.equal('Hai');
    await press('End');
    expect(label(active())).to.equal('Ba');
    await press('Home');
    expect(label(active())).to.equal('Một');
    await press('ArrowDown');
    expect(label(active())).to.equal('Dưới');
  });

  it('type-ahead from an item skips custom rows (diacritic-insensitive: d → Đăng xuất)', async () => {
    openAccount();
    await press('d');
    expect(label(active())).to.equal('Đăng xuất');
    TdMenu.close();
    openAccount({ focus: 'last' });
    await press('c');
    expect(label(active())).to.equal('Cài đặt');
  });

  it('Escape from the segmented / an input closes, focus on the trigger, reason escape', async () => {
    const { t, reasons } = openAccount();
    radio('light').focus();
    await press('Escape');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(same(document.activeElement, t)).to.equal(true);
    expect(reasons).to.deep.equal(['escape']);
    const c = document.createElement('div');
    c.innerHTML = '<input aria-label="ô" data-k="i">';
    const rs = [];
    TdMenu.open(t, [{ type: 'custom', render: () => c }], { onClose: (r) => rs.push(r) });
    c.querySelector('input').focus();
    await press('Escape');
    expect(rs).to.deep.equal(['escape']);
    expect(same(document.activeElement, t)).to.equal(true);
  });
});

describe('v0.53 TdMenu panel — Tab (QĐ 4, RL Q5)', () => {
  function openForm(t) {
    const c = document.createElement('form');
    c.innerHTML = '<input aria-label="Tên" data-k="name"><input aria-label="Email" data-k="mail"><button type="button" data-k="save">Lưu</button>';
    return TdMenu.open(t, [{ label: 'Hồ sơ' }, { type: 'custom', label: 'Ghi chú', render: () => c },
      { type: 'custom', render: () => segmented('dark') }, { label: 'Đăng xuất' }]);
  }

  it('Tab walks items + every stop of each custom row; past the end → close, focus after the trigger', async () => {
    const t = mountTrigger();
    openForm(t);
    const seen = [label(active())];
    for (let i = 0; i < 5; i++) { await press('Tab'); seen.push(label(active())); }
    expect(seen).to.deep.equal(['Hồ sơ', 'name', 'mail', 'save', 'radio:dark', 'Đăng xuất']);
    await press('Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.activeElement.id).to.equal('after');
  });

  it('Shift+Tab walks back; before the first stop → close, focus before the trigger', async () => {
    const t = mountTrigger();
    openForm(t);
    await press('End');
    const seen = [label(active())];
    for (let i = 0; i < 5; i++) { await press('Shift+Tab'); seen.push(label(active())); }
    expect(seen).to.deep.equal(['Đăng xuất', 'radio:dark', 'save', 'mail', 'name', 'Hồ sơ']);
    await press('Shift+Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.activeElement.id).to.equal('before');
  });

  it('from the panel itself (after a click on its caption) Tab starts at the first stop', async () => {
    const t = mountTrigger();
    openForm(t);
    await click(panel().querySelector('.td-menu__custom-label'));
    expect(same(document.activeElement, panel())).to.equal(true);
    await press('Tab');
    expect(label(active())).to.equal('Hồ sơ');
  });

  it('a trigger inside a TdModal: past the edge the modal trap continues, the modal stays open', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<input id="mm-a" aria-label="a"><button type="button" id="mm-trig">Mở</button><input id="mm-b" aria-label="b">';
    TdModal.show({ title: 'Hộp thoại', body, showFooter: false });
    await until(() => document.querySelector('.td-modal')?.getAttribute('data-state') === 'open');
    const t = document.getElementById('mm-trig');
    t.focus();
    TdMenu.open(t, [{ label: 'Một' }, { type: 'custom', render: () => segmented() }]);
    await press('Tab');
    expect(same(active(), radio('light'))).to.equal(true);
    await press('Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.activeElement.id).to.equal('mm-b');
    expect(!!document.querySelector('.td-modal[data-state="open"]')).to.equal(true);
  });

  it('regression: a menu without custom rows still closes on the first Tab (D4)', async () => {
    const t = mountTrigger();
    t.focus();
    TdMenu.open(t, [{ label: 'Một' }, { label: 'Hai' }]);
    await press('Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.activeElement.id).to.equal('after');
  });
});

describe('v0.53 TdMenu panel — pointer (QĐ 5b, QĐ 9; codex r1 #1)', () => {
  it('click on a segmented option: selected, panel open, focus on that radio in every engine; ← then works', async () => {
    const log = [];
    openAccount({}, log);
    const r = radio('dark');
    let calls = 0;
    r.focus = function focus(...a) { calls += 1; return HTMLElement.prototype.focus.apply(this, a); };
    await click(option('dark'));
    delete r.focus;
    expect(log).to.deep.equal(['dark']);
    expect(TdMenu.isOpen()).to.equal(true);
    expect(same(active(), r)).to.equal(true);
    if (!WEBKIT) expect(calls, 'the rule must not touch a control that took focus itself').to.equal(0);
    expect(r.matches(':focus-visible'), 'no focus ring after a mouse click').to.equal(false);
    await press('ArrowLeft');
    expect(checkedValue()).to.equal('light');
    await press('ArrowDown');
    expect(label(active())).to.equal('Đăng xuất');
  });

  it('button / text input / disabled control / caption / static row / shadow control', async () => {
    const t = mountTrigger();
    const c = document.createElement('div');
    c.innerHTML = '<button type="button" data-k="btn">Nút</button><input aria-label="ô" data-k="txt" value="xin chào">'
      + '<button type="button" data-k="dis" disabled>Khoá</button><p data-k="para">Chữ tĩnh</p>'
      + '<td-test-shadow-plain data-k="sh"></td-test-shadow-plain>';
    TdMenu.open(t, [{ label: 'Hồ sơ' }, { type: 'custom', label: 'Nhóm', render: () => c }]);
    await click(c.querySelector('[data-k="btn"]'));
    expect(label(active())).to.equal('btn');
    const txt = c.querySelector('[data-k="txt"]');
    let calls = 0;
    txt.focus = function focus(...a) { calls += 1; return HTMLElement.prototype.focus.apply(this, a); };
    await click(txt);
    delete txt.focus;
    expect(label(active())).to.equal('txt');
    expect(calls).to.equal(0);
    for (const k of ['dis', 'para']) {
      await click(c.querySelector(`[data-k="${k}"]`));
      expect(same(document.activeElement, panel()), k).to.equal(true);
    }
    await click(panel().querySelector('.td-menu__custom-label'));
    expect(same(document.activeElement, panel())).to.equal(true);
    await press('ArrowDown');
    expect(label(active())).to.equal('Hồ sơ');
    const inner = c.querySelector('td-test-shadow-plain').shadowRoot.querySelector('[data-k="p1"]');
    await click(inner);
    expect(same(active(), inner)).to.equal(true);
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('a click handler calling ctx.close(): closed, focus on the trigger, onClose(select)', async () => {
    const extra = {};
    const { t, reasons } = openAccount({}, [], extra);
    panel().querySelector('td-choice-group').addEventListener('change', () => extra.ctx.close(), { signal: extra.ctx.signal });
    await click(option('auto'));
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['select']);
    expect(same(document.activeElement, t)).to.equal(true);
  });

  it('a click outside closes (outside); a click inside a nested td-dropdown list does not', async () => {
    const t = mountTrigger();
    const dd = document.createElement('td-dropdown');
    dd.setAttribute('aria-label', 'Ngôn ngữ');
    dd.options = [{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }];
    const rs = [];
    TdMenu.open(t, [{ label: 'Hồ sơ' }, { type: 'custom', render: () => dd }], { onClose: (r) => rs.push(r) });
    await until(() => !!dd.querySelector('.td-dropdown__trigger'));
    await click(dd.querySelector('.td-dropdown__trigger'));
    const list = () => document.querySelector('.td-dropdown__menu[data-state="open"]');
    expect(await until(() => !!list())).to.equal(true);
    await click([...list().querySelectorAll('.td-dropdown__option')][1]);
    expect(TdMenu.isOpen()).to.equal(true);
    expect(dd.value).to.equal('en');
    await click(dd.querySelector('.td-dropdown__trigger'));
    expect(await until(() => !!list())).to.equal(true);
    await press('Escape');
    expect(await until(() => !list())).to.equal(true);
    expect(TdMenu.isOpen(), 'the first Escape closes only the dropdown').to.equal(true);
    await click(dd.querySelector('.td-dropdown__trigger'));
    expect(await until(() => !!list())).to.equal(true);
    TdMenu.close();
    expect(await until(() => !list()), 'the panel takes its child popup along').to.equal(true);
    TdMenu.open(t, [{ type: 'custom', render: () => segmented() }], { onClose: (r) => rs.push(r) });
    await sendMouse({ type: 'click', position: [5, window.innerHeight - 5] });
    expect(rs).to.deep.equal(['api', 'outside']);
  });
});

describe('v0.53 TdMenu panel — content resizing (QĐ 11)', () => {
  for (const side of ['bottom', 'top']) {
    it(`content growth re-places the panel (side ${side})`, async () => {
      const t = mountTrigger();
      if (side === 'top') {
        host.style.setProperty('position', 'fixed');
        host.style.setProperty('bottom', '8px');
      }
      const grow = document.createElement('div');
      grow.textContent = 'x';
      TdMenu.open(t, [{ label: 'A' }, { type: 'custom', render: () => grow }], { side });
      await frames(2);
      const placement = panel().getAttribute('data-placement');
      for (let i = 0; i < 6; i++) grow.appendChild(document.createElement('p')).textContent = `Dòng ${i}`;
      const tr = t.getBoundingClientRect();
      const ok = await until(() => {
        const r = panel().getBoundingClientRect();
        return placement === 'top' ? Math.abs(r.bottom - tr.top) <= 12 : Math.abs(r.top - tr.bottom) <= 12;
      });
      host.style.removeProperty('position');
      host.style.removeProperty('bottom');
      expect(ok, `placement ${placement}`).to.equal(true);
      const r = panel().getBoundingClientRect();
      expect(r.top >= -1 && r.bottom <= window.innerHeight + 1).to.equal(true);
    });
  }
});

describe('v0.53 TdMenu panel — popup of a component inside an open shadow root (Codex impl r1 #4)', () => {
  it('a td-dropdown in a site shadow root: picking in its list keeps the panel open; the panel takes it along', async () => {
    if (!customElements.get('td-test-shadow-dd')) {
      customElements.define('td-test-shadow-dd', class extends HTMLElement {
        constructor() {
          super();
          const root = this.attachShadow({ mode: 'open' });
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = '/td.css';
          const dd = document.createElement('td-dropdown');
          dd.setAttribute('aria-label', 'Ngôn ngữ');
          dd.options = [{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }];
          root.append(l, dd);
        }
      });
    }
    const t = mountTrigger();
    const site = document.createElement('td-test-shadow-dd');
    const rs = [];
    TdMenu.open(t, [{ label: 'Hồ sơ' }, { type: 'custom', render: () => site }], { onClose: (r) => rs.push(r) });
    const dd = site.shadowRoot.querySelector('td-dropdown');
    expect(await until(() => !!dd.querySelector('.td-dropdown__trigger') && dd.querySelector('.td-dropdown__trigger').getClientRects().length > 0)).to.equal(true);
    const list = () => document.querySelector('.td-dropdown__menu[data-state="open"]');
    await click(dd.querySelector('.td-dropdown__trigger'));
    expect(await until(() => !!list())).to.equal(true);
    await click([...list().querySelectorAll('.td-dropdown__option')][1]);
    expect(dd.value).to.equal('en');
    expect(TdMenu.isOpen(), 'a press in the shadow-anchored popup is inside the panel').to.equal(true);
    expect(rs).to.deep.equal([]);
    await click(dd.querySelector('.td-dropdown__trigger'));
    expect(await until(() => !!list())).to.equal(true);
    TdMenu.close();
    expect(await until(() => !list()), 'the panel takes the shadow-anchored popup along').to.equal(true);
  });
});

