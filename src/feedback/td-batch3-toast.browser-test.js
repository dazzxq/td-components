import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, emulateMedia } from '@web/test-runner-commands';
import { TdToast } from './td-toast.js';
import { LAYERS, register, trapContainers, trapTab } from '../utils/layers.js';

// v0.9.0 batch 3 — td-toast token-native (plan docs/internal/plans/v0.9.0-batch3.md item 2). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await frame(); };
const same = (a, b) => a === b;
const toasts = () => [...document.querySelectorAll('#td-toast-container .td-toast')];

async function clearAll() {
  TdToast._activeToasts.slice().forEach((t) => t._removeToast());
  await wait(260);
}

let cleanup = [];
afterEach(async () => {
  cleanup.forEach((f) => f());
  cleanup = [];
  await sendMouse({ type: 'move', position: [0, 0] });
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  await clearAll();
  document.documentElement.removeAttribute('data-td-theme');
  await emulateMedia({ reducedMotion: 'no-preference' });
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
});
function lum({ r, g, b }) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('batch 3 — td-toast DOM contract', () => {
  it('matches test/contracts/toast.html (container + one toast per type + sticky)', async () => {
    const KEEP = ['type', 'role', 'aria-hidden', 'aria-live', 'aria-label', 'data-state', 'data-icon', 'id'];
    const shape = (el) => ({
      tag: el.localName,
      cls: [...el.classList].sort().join('.'),
      attrs: KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`),
      kids: el.localName === 'svg' ? [] : [...el.children].map(shape),
    });
    const html = await (await fetch('/test/contracts/toast.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tpls = [...doc.querySelectorAll('template')];
    expect(tpls.length).to.equal(5);
    for (const t of tpls) {
      await clearAll();
      TdToast._showSingle('Nội dung', t.getAttribute('data-type'), Number(t.getAttribute('data-duration')));
      await frames(3);
      expect(JSON.stringify(shape(TdToast.container))).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
    }
  });

  it('no Tailwind/legacy classes, no inline style markup; z-index from --td-z-toast; top-right by tokens', async () => {
    TdToast._showSingle('Xin chào', 'info', 0);
    await frames(3);
    const c = TdToast.container;
    expect(c.id).to.equal('td-toast-container');
    expect(c.querySelector('[class*="toast-item"], [class*="bg-"], .fixed, .text-sm')).to.equal(null);
    expect(c.hasAttribute('style')).to.equal(false);
    expect(c.querySelector('[style]')).to.equal(null);
    const cs = getComputedStyle(c);
    expect(cs.position).to.equal('fixed');
    expect(cs.zIndex).to.equal('500');
    expect(TdToast.getToastZIndex()).to.equal(500);
    expect(cs.top).to.equal('80px'); // 5rem
    const r = toasts()[0].getBoundingClientRect();
    expect(Math.round(window.innerWidth - r.right)).to.equal(16); // 1rem from the inline end
  });

  it('strong glass, no saturated fill; registry status icon per type', async () => {
    for (const type of ['success', 'error', 'warning', 'info']) TdToast._showSingle(type, type, 0);
    await frames(3);
    for (const t of toasts()) {
      const type = /td-toast--(\w+)/.exec(t.className)[1];
      expect(t.classList.contains('td-glass-surface')).to.equal(true);
      expect(t.classList.contains('td-glass-surface--strong')).to.equal(true);
      const bg = rgb(getComputedStyle(t).backgroundColor);
      expect(Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b)).to.be.below(8); // neutral, not a status fill
      const svg = t.querySelector('.td-toast__icon svg');
      expect(svg.getAttribute('data-icon')).to.equal(type);
      expect(svg.getAttribute('aria-hidden')).to.equal('true');
    }
  });

  it('message is text (never HTML) and is set one frame after insertion (D12)', async () => {
    const t = TdToast._showSingle('<img src=x onerror=alert(1)>', 'success', 0);
    expect(t.isConnected).to.equal(true);
    expect(t.getAttribute('role')).to.equal('status');
    expect(t.querySelector('.td-toast__message').textContent).to.equal('');
    await frame();
    expect(t.querySelector('.td-toast__message').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(t.querySelector('img')).to.equal(null);
    await frame();
    expect(t.getAttribute('data-state')).to.equal('open');
  });

  it('roles: status + polite for non-errors, alert + assertive for errors (B6)', () => {
    const ok = TdToast._showSingle('ok', 'success', 0);
    const bad = TdToast._showSingle('bad', 'error', 0);
    const odd = TdToast._showSingle('x', 'bogus', 0);
    expect([ok.getAttribute('role'), ok.getAttribute('aria-live')]).to.deep.equal(['status', 'polite']);
    expect([bad.getAttribute('role'), bad.getAttribute('aria-live')]).to.deep.equal(['alert', 'assertive']);
    expect(odd.classList.contains('td-toast--info')).to.equal(true);
  });
});

describe('batch 3 — td-toast queue + lifecycle', () => {
  it('FIFO eviction beyond MAX_VISIBLE removes from the list synchronously (B1)', async () => {
    const made = [];
    for (let i = 0; i < TdToast.MAX_VISIBLE + 3; i++) made.push(TdToast._showSingle(`t${i}`, 'info', 0));
    expect(TdToast._activeToasts.length).to.equal(TdToast.MAX_VISIBLE);
    expect(same(TdToast._activeToasts[0], made[3])).to.equal(true);
    expect(made[0].getAttribute('data-state')).to.equal('closing');
    await wait(260);
    expect(made[0].isConnected).to.equal(false);
    expect(toasts().length).to.equal(TdToast.MAX_VISIBLE);
  });

  it('show() queues + staggers; auto-dismiss after duration', async () => {
    TdToast.show('một', 'info', 300);
    TdToast.show('hai', 'success', 300);
    expect(toasts().length).to.equal(0);
    await wait(200);
    expect(toasts().length).to.equal(2);
    await wait(500);
    expect(toasts().length).to.equal(0);
  });

  it('registers the container while a toast is visible and releases after the last removal', async () => {
    expect(trapContainers(LAYERS.modal).length).to.equal(0);
    const a = TdToast._showSingle('a', 'info', 0);
    const b = TdToast._showSingle('b', 'info', 0);
    const tc = trapContainers(LAYERS.modal);
    expect(tc.length).to.equal(1);
    expect(same(tc[0], TdToast.container)).to.equal(true);
    a._removeToast();
    await wait(260);
    expect(trapContainers(LAYERS.modal).length).to.equal(1);
    b._removeToast();
    expect(trapContainers(LAYERS.modal).length).to.equal(1); // still in the DOM (exit animation)
    await wait(260);
    expect(trapContainers(LAYERS.modal).length).to.equal(0);
    // a new toast registers again
    TdToast._showSingle('c', 'info', 0);
    expect(trapContainers(LAYERS.modal).length).to.equal(1);
  });

  it('container is not inert under a blocking modal lease', () => {
    const dialog = document.createElement('div');
    document.body.appendChild(dialog);
    const m = register({ layer: LAYERS.modal, element: dialog, blocking: true });
    cleanup.push(() => { m.release(); dialog.remove(); });
    TdToast._showSingle('trên modal', 'info', 0);
    expect(TdToast.container.hasAttribute('inert')).to.equal(false);
  });
});

describe('batch 3 — td-toast close button + pause', () => {
  it('every toast (sticky and timed) has a focusable close button named "Đóng"', async () => {
    const sticky = TdToast._showSingle('dính', 'warning', 0);
    const timed = TdToast._showSingle('tự tắt', 'info', 4000);
    for (const t of [sticky, timed]) {
      const btn = t.querySelector('button.td-toast__close');
      expect(btn.getAttribute('type')).to.equal('button');
      expect(btn.getAttribute('aria-label')).to.equal('Đóng');
      btn.focus();
      expect(same(document.activeElement, btn)).to.equal(true);
    }
  });

  it('keyboard: Enter on the close button dismisses; focus moves to the next toast close button', async () => {
    const a = TdToast._showSingle('a', 'info', 0);
    const b = TdToast._showSingle('b', 'info', 0);
    await frames(2);
    a.querySelector('.td-toast__close').focus();
    await sendKeys({ press: 'Enter' });
    expect(a.getAttribute('data-state')).to.equal('closing');
    expect(TdToast._activeToasts.includes(a)).to.equal(false);
    expect(same(document.activeElement, b.querySelector('.td-toast__close'))).to.equal(true);
  });

  it('closing the last toast returns focus to where it came from', async () => {
    const origin = document.createElement('button');
    origin.textContent = 'gốc';
    document.body.appendChild(origin);
    cleanup.push(() => origin.remove());
    const t = TdToast._showSingle('x', 'info', 0);
    origin.focus();
    t.querySelector('.td-toast__close').focus();
    await sendKeys({ press: 'Space' });
    expect(same(document.activeElement, origin)).to.equal(true);
  });

  it('pause on hover: the timer freezes while the pointer is over the stack, resumes on leave', async () => {
    const t = TdToast._showSingle('di chuột', 'info', 400);
    await frames(3);
    const r = t.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + 20), Math.round(r.top + r.height / 2)] });
    expect(t.hasAttribute('data-paused')).to.equal(true);
    await wait(700);
    expect(t.isConnected).to.equal(true);
    expect(t.getAttribute('data-state')).to.equal('open');
    await sendMouse({ type: 'move', position: [0, 0] });
    expect(t.hasAttribute('data-paused')).to.equal(false);
    await wait(700);
    expect(t.isConnected).to.equal(false);
  });

  it('pause on focus-within: the timer freezes while focus is inside, resumes on blur', async () => {
    const t = TdToast._showSingle('tiêu điểm', 'success', 400);
    const other = TdToast._showSingle('khác', 'info', 400);
    t.querySelector('.td-toast__close').focus();
    expect(t.hasAttribute('data-paused')).to.equal(true);
    expect(other.hasAttribute('data-paused')).to.equal(true);
    await wait(700);
    expect(t.isConnected && other.isConnected).to.equal(true);
    // a toast created while paused starts frozen
    const late = TdToast._showSingle('muộn', 'info', 200);
    expect(late.hasAttribute('data-paused')).to.equal(true);
    await wait(400);
    expect(late.isConnected).to.equal(true);
    document.activeElement.blur();
    expect(t.hasAttribute('data-paused')).to.equal(false);
    await wait(750);
    expect([t.isConnected, other.isConnected, late.isConnected]).to.deep.equal([false, false, false]);
  });

  it('close button is reachable by Tab while a blocking modal (trapTab) is active', async () => {
    const dialog = document.createElement('div');
    dialog.tabIndex = -1;
    dialog.innerHTML = '<button id="dlg-1">1</button><button id="dlg-2">2</button>';
    document.body.appendChild(dialog);
    const m = register({
      layer: LAYERS.modal, element: dialog, blocking: true, onTab: (e) => trapTab(e, dialog, LAYERS.modal),
    });
    cleanup.push(() => { m.release(); dialog.remove(); });
    const t = TdToast._showSingle('trên hộp thoại', 'error', 0);
    await frames(3);
    document.getElementById('dlg-2').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, t.querySelector('.td-toast__close'))).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement.id).to.equal('dlg-1');
    await sendKeys({ press: 'Shift+Tab' });
    expect(same(document.activeElement, t.querySelector('.td-toast__close'))).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(t.getAttribute('data-state')).to.equal('closing');
    await wait(260);
    expect(trapContainers(LAYERS.modal).length).to.equal(0);
    // focus returned to the dialog button it came from
    expect(document.activeElement.id).to.equal('dlg-1');
  });

  it('click anywhere on a toast still dismisses it', () => {
    const t = TdToast._showSingle('bấm', 'info', 0);
    t.querySelector('.td-toast__message').click();
    expect(t.getAttribute('data-state')).to.equal('closing');
  });
});

describe('batch 3 — td-toast visuals', () => {
  for (const theme of ['light', 'dark']) {
    it(`text ≥ 4.5:1 and icons ≥ 3:1 on the glass (${theme}, over white and black backdrops)`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      for (const type of ['success', 'error', 'warning', 'info']) TdToast._showSingle(`Nội dung ${type}`, type, 0);
      await frames(3);
      for (const t of toasts()) {
        const glass = rgb(getComputedStyle(t).backgroundColor);
        const text = rgb(getComputedStyle(t.querySelector('.td-toast__message')).color);
        const icon = rgb(getComputedStyle(t.querySelector('.td-toast__icon')).color);
        const close = rgb(getComputedStyle(t.querySelector('.td-toast__close')).color);
        for (const backdrop of [{ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }]) {
          const bg = over(glass, backdrop);
          expect(ratio(text, bg), `${theme} ${t.className} text`).to.be.at.least(4.5);
          expect(ratio(icon, bg), `${theme} ${t.className} icon`).to.be.at.least(3);
          expect(ratio(close, bg), `${theme} close`).to.be.at.least(3);
        }
      }
    });
  }

  it('reduced motion: opacity-only transition, no transform', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const t = TdToast._showSingle('chuyển động', 'info', 0);
    const cs = getComputedStyle(t);
    expect(cs.transitionProperty).to.equal('opacity');
    expect(cs.transform).to.equal('none');
    await frames(3);
    t._removeToast();
    expect(getComputedStyle(t).transform).to.equal('none');
  });

  it('solid (no blur) under data-td-glass="off"', async () => {
    document.documentElement.setAttribute('data-td-glass', 'off');
    cleanup.push(() => document.documentElement.removeAttribute('data-td-glass'));
    const t = TdToast._showSingle('đặc', 'info', 0);
    const cs = getComputedStyle(t);
    expect(cs.backdropFilter).to.equal('none');
    expect(rgb(cs.backgroundColor).a).to.equal(1);
  });

  it('solid over an open modal (R3 / D20)', async () => {
    const modal = document.createElement('div');
    modal.className = 'td-modal';
    modal.setAttribute('data-state', 'open');
    document.body.appendChild(modal);
    cleanup.push(() => modal.remove());
    const t = TdToast._showSingle('trên modal', 'info', 0);
    const cs = getComputedStyle(t);
    expect(cs.backdropFilter).to.equal('none');
    expect(rgb(cs.backgroundColor).a).to.equal(1);
  });

  it('coarse pointer: close button ≥ 44px', async () => {
    // emulateMedia cannot fake (pointer: coarse); assert the rule ships in td.css instead
    const css = await (await fetch('/td.css')).text();
    expect(/@media \(pointer: coarse\)\s*\{\s*\.td-toast__close\s*\{\s*width: var\(--td-touch-min\)/.test(css)).to.equal(true);
  });
});
