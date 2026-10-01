import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, emulateMedia } from '@web/test-runner-commands';
import { TdToast } from './td-toast.js';
import { TdModal } from './td-modal.js';

// v0.21.0 — P4 dcms-style pastel toast + P5 modal ease-in-out (plan docs/internal/plans/v0.21.0-pastel-toast-modal.md).
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
const DEFAULT_TYPES = { ...TdToast.labels.types };

afterEach(async () => {
  TdToast.labels.types = { ...DEFAULT_TYPES };
  await sendMouse({ type: 'move', position: [0, 0] });
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  TdToast.clear();
  TdModal.closeAll();
  await wait(300);
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  document.documentElement.removeAttribute('data-td-theme');
  document.documentElement.style.removeProperty('--td-modal-enter-dur');
  await emulateMedia({ reducedMotion: 'no-preference' });
});

describe('v0.21.0 P4 — toast (dcms style)', () => {
  it('light pastel per type: fill / ink / border from the pastel tokens', async () => {
    const want = {
      success: ['rgb(220, 252, 231)', 'rgb(20, 83, 45)', 'rgb(187, 247, 208)'],
      error: ['rgb(254, 226, 226)', 'rgb(127, 29, 29)', 'rgb(254, 202, 202)'],
      warning: ['rgb(254, 243, 199)', 'rgb(120, 53, 15)', 'rgb(253, 230, 138)'],
      info: ['rgb(219, 234, 254)', 'rgb(30, 58, 138)', 'rgb(191, 219, 254)'],
    };
    for (const type of Object.keys(want)) TdToast._showSingle(type, type, 0);
    await frames(3);
    for (const t of toasts()) {
      const type = /td-toast--(\w+)/.exec(t.className)[1];
      const cs = getComputedStyle(t);
      expect([cs.backgroundColor, cs.color, cs.borderTopColor], type).to.deep.equal(want[type]);
      expect(cs.borderTopWidth).to.equal('1px');
      expect(cs.borderTopLeftRadius).to.equal('12px');
      expect([cs.paddingTop, cs.paddingLeft]).to.deep.equal(['12px', '16px']);
      expect(cs.fontSize).to.equal('14px');
      expect(cs.boxShadow).to.not.equal('none');
    }
  });

  it('no backdrop-filter and no icon node, in light and dark', async () => {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const t = TdToast._showSingle('x', 'warning', 0);
      await frames(2);
      const cs = getComputedStyle(t);
      expect(cs.backdropFilter, theme).to.equal('none');
      expect(cs.webkitBackdropFilter || 'none', theme).to.equal('none');
      expect(t.querySelector('.td-toast__icon, [data-icon]:not([data-icon="close"])')).to.equal(null);
      TdToast.clear();
      await wait(250);
    }
  });

  it('screen-reader type prefix (labels.types) set together with the message, visually hidden', async () => {
    const t = TdToast._showSingle('Đã lưu', 'success', 0);
    const prefix = t.querySelector('.td-toast__type');
    expect(prefix.classList.contains('td-sr-only')).to.equal(true);
    expect(same(prefix.nextElementSibling, t.querySelector('.td-toast__message'))).to.equal(true);
    expect(prefix.textContent).to.equal(''); // D12: empty on insertion
    await frame();
    expect(prefix.textContent).to.equal('Thành công: ');
    expect(t.textContent.startsWith('Thành công: Đã lưu')).to.equal(true);
    const r = prefix.getBoundingClientRect();
    expect(r.width <= 1 && r.height <= 1).to.equal(true);
    const e = TdToast._showSingle('Hỏng', 'error', 0);
    const w = TdToast._showSingle('Cẩn thận', 'warning', 0);
    const i = TdToast._showSingle('Biết', 'bogus', 0);
    await frame();
    expect([e, w, i].map((n) => n.querySelector('.td-toast__type').textContent))
      .to.deep.equal(['Lỗi: ', 'Cảnh báo: ', 'Thông tin: ']);
  });

  it('labels.types: site override per type, missing types fall back, "" disables the prefix', async () => {
    TdToast.labels.types = { success: 'Success:', error: '' };
    const s = TdToast._showSingle('ok', 'success', 0);
    const e = TdToast._showSingle('bad', 'error', 0);
    const i = TdToast._showSingle('fyi', 'info', 0);
    await frame();
    expect(s.querySelector('.td-toast__type').textContent).to.equal('Success: ');
    expect(e.querySelector('.td-toast__type').textContent).to.equal('');
    expect(i.querySelector('.td-toast__type').textContent).to.equal('Thông tin: ');
  });

  it('close button: hidden until keyboard focus (:focus-visible), Enter closes a sticky toast', async () => {
    const before = document.createElement('button');
    before.textContent = 'trước';
    try {
      const t = TdToast._showSingle('dính', 'info', 0);
      document.body.insertBefore(before, TdToast.container); // the next Tab stop is the toast's close button
      await frames(3);
      const close = t.querySelector('.td-toast__close');
      const hidden = close.getBoundingClientRect();
      expect(hidden.width <= 1 && hidden.height <= 1).to.equal(true);
      before.focus();
      await sendKeys({ press: 'Tab' });
      expect(same(document.activeElement, close)).to.equal(true);
      expect(close.matches(':focus-visible')).to.equal(true);
      const shown = close.getBoundingClientRect();
      expect(shown.width).to.be.at.least(24);
      expect(shown.height).to.be.at.least(24);
      await wait(1200);
      expect(t.getAttribute('data-state')).to.equal('open'); // sticky
      await sendKeys({ press: 'Enter' });
      expect(t.getAttribute('data-state')).to.equal('closing');
      await wait(250);
      expect(t.isConnected).to.equal(false);
    } finally {
      before.remove();
    }
  });

  it('click anywhere dismisses; enter slides from the inline end; exit 180 ms', async () => {
    const t = TdToast._showSingle('bấm', 'success', 0);
    expect(getComputedStyle(t).transform).to.equal('matrix(1, 0, 0, 1, 16, 0)'); // translateX(1rem)
    await frames(3);
    await wait(260);
    expect(getComputedStyle(t).transform).to.equal('none');
    t.click();
    expect(t.getAttribute('data-state')).to.equal('closing');
    expect(getComputedStyle(t).transitionDuration).to.equal('0.18s, 0.18s');
  });

  it('timed toasts auto-dismiss; pause on hover; max 5 (FIFO)', async () => {
    const made = [];
    for (let n = 0; n < 7; n++) made.push(TdToast._showSingle(`t${n}`, 'info', 0));
    expect(TdToast._activeToasts.length).to.equal(5);
    expect(made[0].getAttribute('data-state')).to.equal('closing');
    TdToast.clear();
    await wait(250);
    const t = TdToast._showSingle('di chuột', 'info', 400);
    await frames(3);
    const r = t.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + 20), Math.round(r.top + r.height / 2)] });
    await wait(600);
    expect(t.isConnected).to.equal(true);
    await sendMouse({ type: 'move', position: [0, 0] });
    await wait(700);
    expect(t.isConnected).to.equal(false);
  });

  it('a longer --td-toast-exit-dur (600 ms) keeps the closing toast connected for the whole exit', async () => {
    const style = document.createElement('style');
    style.textContent = ':root { --td-toast-exit-dur: 600ms; }';
    document.head.appendChild(style);
    try {
      const t = TdToast._showSingle('chậm', 'info', 0);
      await frames(3);
      t.click();
      expect(t.getAttribute('data-state')).to.equal('closing');
      expect(getComputedStyle(t).transitionDuration).to.equal('0.6s, 0.6s');
      await wait(400);
      expect(t.isConnected).to.equal(true); // the old fixed 200 ms removal would have cut the fade
      await wait(400);
      expect(t.isConnected).to.equal(false);
    } finally {
      style.remove();
    }
  });

  it('dark theme: text ≥ 4.7:1 on the solid fill', async () => {
    document.documentElement.setAttribute('data-td-theme', 'dark');
    for (const type of ['success', 'error', 'warning', 'info']) TdToast._showSingle(type, type, 0);
    await frames(3);
    const lum = (s) => {
      const [r, g, b] = s.match(/[\d.]+/g).map(Number);
      const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    for (const t of toasts()) {
      const cs = getComputedStyle(t);
      const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
      expect((a + 0.05) / (b + 0.05), t.className).to.be.at.least(4.7);
    }
  });
});

describe('v0.21.0 P5 — modal ease-in-out', () => {
  it('enter: dialog 260 ms cubic-bezier(0.4, 0, 0.2, 1) from translateY(12px) scale(0.98); scrim 240 ms ease-in-out', async () => {
    const id = TdModal.show({ title: 'Chào', body: '<p>x</p>' });
    const root = document.getElementById(id);
    const dialog = root.querySelector('.td-modal__dialog');
    const scrim = root.querySelector('.td-modal__backdrop');
    expect(root.getAttribute('data-state')).to.equal('opening');
    const cs = getComputedStyle(dialog);
    expect(cs.transform).to.equal('matrix(0.98, 0, 0, 0.98, 0, 12)');
    expect(cs.transitionProperty).to.equal('opacity, transform');
    expect(cs.transitionDuration).to.equal('0.26s, 0.26s');
    expect(cs.transitionTimingFunction).to.equal('cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)');
    expect(getComputedStyle(scrim).transitionDuration).to.equal('0.24s');
    expect(getComputedStyle(scrim).transitionTimingFunction).to.equal('ease-in-out');
    await frames(3);
    await wait(320);
    expect(getComputedStyle(dialog).transform).to.equal('none');
    expect(getComputedStyle(dialog).opacity).to.equal('1');
  });

  it('exit: 180 ms ease-in back to the entry pose, then removed', async () => {
    const id = TdModal.show({ title: 'Chào', body: '<p>x</p>' });
    const root = document.getElementById(id);
    await frames(3);
    TdModal.closeById(id);
    expect(root.getAttribute('data-state')).to.equal('closing');
    const cs = getComputedStyle(root.querySelector('.td-modal__dialog'));
    expect(cs.transitionDuration).to.equal('0.18s, 0.18s');
    expect(cs.transitionTimingFunction).to.equal('cubic-bezier(0.4, 0, 1, 1), cubic-bezier(0.4, 0, 1, 1)');
    expect(getComputedStyle(root.querySelector('.td-modal__backdrop')).transitionDuration).to.equal('0.18s');
    await wait(300);
    expect(root.isConnected).to.equal(false);
  });

  it('timing tokens are site-overridable (--td-modal-enter-dur)', async () => {
    document.documentElement.style.setProperty('--td-modal-enter-dur', '400ms');
    const id = TdModal.show({ title: 'Chào', body: '<p>x</p>' });
    const dialog = document.getElementById(id).querySelector('.td-modal__dialog');
    expect(getComputedStyle(dialog).transitionDuration).to.equal('0.4s, 0.4s');
  });

  it('full-viewport modal only fades (no rise / scale)', async () => {
    const id = TdModal.show({ title: 'Full', body: '<p>x</p>', fullViewport: true });
    expect(getComputedStyle(document.getElementById(id).querySelector('.td-modal__dialog')).transform).to.equal('none');
  });

  it('reduced motion: opacity only, 120 ms, no transform (open and close)', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const id = TdModal.show({ title: 'Chào', body: '<p>x</p>' });
    const root = document.getElementById(id);
    const dialog = root.querySelector('.td-modal__dialog');
    let cs = getComputedStyle(dialog);
    expect(cs.transform).to.equal('none');
    expect(cs.transitionProperty).to.equal('opacity');
    expect(cs.transitionDuration).to.equal('0.12s');
    expect(getComputedStyle(root.querySelector('.td-modal__backdrop')).transitionDuration).to.equal('0.12s');
    await frames(3);
    TdModal.closeById(id);
    cs = getComputedStyle(dialog);
    expect(cs.transform).to.equal('none');
    expect(cs.transitionDuration).to.equal('0.12s');
  });

  it('reduced motion: the closing modal stays connected through the 120 ms fade, then is removed', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const id = TdModal.show({ title: 'Chào', body: '<p>x</p>' });
    const root = document.getElementById(id);
    await frames(3);
    await wait(200);
    TdModal.closeById(id);
    expect(root.getAttribute('data-state')).to.equal('closing');
    await wait(60);
    expect(root.isConnected).to.equal(true);
    expect(Number(getComputedStyle(root.querySelector('.td-modal__dialog')).opacity)).to.be.below(1);
    await wait(250);
    expect(root.isConnected).to.equal(false);
  });
});
