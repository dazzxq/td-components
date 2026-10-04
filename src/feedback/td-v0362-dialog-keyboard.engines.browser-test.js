// v0.36.2 (ADR 0019, plan QĐ 15–17, A7): full-screen dialogs follow the on-screen keyboard. window.visualViewport is
// replaced by a fake (EventTarget) whose `resize` simulates the keyboard: the overlay root shrinks to the visual
// viewport (--td-vv-top / --td-vv-height), the focused field (label + error) and the footer stay visible, nothing is
// focused or window-scrolled by the kit, pinch zoom is left alone, and closing removes everything. Every engine.
import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';
import '../form/td-input-field.js';
import { TdMediaPicker } from './td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 3000) => { const t0 = performance.now(); while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); } };

class FakeVV extends EventTarget {
  constructor() { super(); this.reset(); }
  reset() { Object.assign(this, { offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, width: innerWidth, height: innerHeight, scale: 1 }); }
  keyboard(height, o = {}) { Object.assign(this, { height, ...o }); this.dispatchEvent(new Event('resize')); }
}
const realVV = Object.getOwnPropertyDescriptor(window, 'visualViewport');
let vv;

beforeEach(async () => {
  await setViewport({ width: 390, height: 844 });
  vv = new FakeVV();
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
});
afterEach(async () => {
  TdModal.closeAll();
  for (const d of document.querySelectorAll('td-drawer')) d.remove();
  if (realVV) Object.defineProperty(window, 'visualViewport', realVV); else delete window.visualViewport;
  await frames(4);
});

function longForm() {
  const form = document.createElement('div');
  for (let i = 1; i <= 8; i++) {
    const f = document.createElement('td-input-field');
    f.setAttribute('label', `Trường ${i}`);
    f.setAttribute('name', `f${i}`);
    form.append(f);
  }
  return form;
}

async function openSheet() {
  const body = longForm();
  TdModal.show({ title: 'Biểu mẫu', body, actions: [{ label: 'Huỷ', value: false }, { label: 'Lưu', variant: 'primary', value: true }] });
  const root = /** @type {HTMLElement} */ ([...document.querySelectorAll('.td-modal')].pop());
  await until(() => root.getAttribute('data-state') === 'open');
  const last = /** @type {any} */ (body.lastElementChild);
  last.setError('Không được bỏ trống');
  await settled(root);
  await frames();
  return { root, last };
}

/** the entrance transitions (sheet slide, fade) are over: geometry is final */
const settled = (el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
const inside = (r, top, bottom) => r.top >= top - 1 && r.bottom <= bottom + 1;

describe('v0.36.2 dialogs above the on-screen keyboard', () => {
  it('sheet modal: root = visual viewport, last field + error + footer visible, no focus / window scroll by the kit', async () => {
    const { root, last } = await openSheet();
    const control = last.querySelector('input');
    control.focus({ preventScroll: true });
    const scrollY0 = window.scrollY;
    vv.keyboard(480);
    await frames(3);
    await settled(root);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('480px');
    expect(root.style.getPropertyValue('--td-vv-top')).to.equal('0px');
    expect(Math.round(root.getBoundingClientRect().height)).to.equal(480);
    const field = last.querySelector('.td-field');
    const err = last.querySelector('.td-field-error');
    expect(err, 'error note rendered').to.not.equal(null);
    expect(inside(field.getBoundingClientRect(), 0, 480), 'field').to.equal(true);
    expect(inside(err.getBoundingClientRect(), 0, 480), 'error').to.equal(true);
    expect(inside(root.querySelector('.td-modal__footer').getBoundingClientRect(), 0, 480), 'footer').to.equal(true);
    expect(document.activeElement === control).to.equal(true);
    expect(window.scrollY).to.equal(scrollY0);
  });

  it('iOS-like offsetTop: the root follows the visual viewport top', async () => {
    const { root } = await openSheet();
    vv.keyboard(480, { offsetTop: 120 });
    await frames(3);
    expect(root.style.getPropertyValue('--td-vv-top')).to.equal('120px');
    const r = root.getBoundingClientRect();
    expect(Math.round(r.top)).to.equal(120);
    expect(Math.round(r.height)).to.equal(480);
  });

  it('pinch zoom (scale 1.6) writes nothing', async () => {
    const { root } = await openSheet();
    vv.keyboard(300, { scale: 1.6, width: 240 });
    await frames(3);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
    expect(root.style.getPropertyValue('--td-vv-top')).to.equal('');
  });

  it('keyboard closes → variables removed; dialog closed → listeners gone (a later resize writes nothing, no throw)', async () => {
    const { root } = await openSheet();
    vv.keyboard(480);
    await frames(3);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('480px');
    vv.keyboard(844);
    await frames(3);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
    vv.keyboard(480);
    await frames(3);
    TdModal.closeAll();
    await frames(2);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
    vv.keyboard(400);
    await frames(3);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
  });

  it('drawer: the root follows the keyboard, the focused field is revealed in the body', async () => {
    const d = TdDrawer.open({ title: 'Ngăn kéo', body: longForm() });
    const root = /** @type {HTMLElement} */ (document.querySelector('.td-drawer-root'));
    await until(() => root.getAttribute('data-state') === 'open');
    await settled(root);
    const fields = root.querySelectorAll('td-input-field');
    const last = fields[fields.length - 1];
    last.querySelector('input').focus({ preventScroll: true });
    vv.keyboard(420);
    await frames(3);
    await settled(root);
    expect(Math.round(root.getBoundingClientRect().height)).to.equal(420);
    expect(inside(last.querySelector('.td-field').getBoundingClientRect(), 0, 420)).to.equal(true);
    d.close();
    await frames(2);
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
  });

  it('media picker: the full-viewport root follows the keyboard, the search field and the footer stay visible', async () => {
    const promise = TdMediaPicker.open({ adapter: createMockAdapter() });
    const root = /** @type {HTMLElement} */ (await (async () => { let r; await until(() => (r = document.querySelector('.td-media-picker[data-state="open"]'))); return r; })());
    await settled(root);
    const input = root.querySelector('.td-media-picker__search input');
    input.focus({ preventScroll: true });
    vv.keyboard(400);
    await frames(3);
    await settled(root);
    expect(Math.round(root.getBoundingClientRect().height)).to.equal(400);
    expect(Math.round(root.querySelector('.td-media-picker__dialog').getBoundingClientRect().height)).to.equal(400);
    expect(inside(input.getBoundingClientRect(), 0, 400), 'search').to.equal(true);
    const footer = root.querySelector('.td-media-picker__footer');
    if (footer && footer.getBoundingClientRect().height) expect(inside(footer.getBoundingClientRect(), 0, 400), 'footer').to.equal(true);
    expect(document.activeElement === input).to.equal(true);
    for (const h of document.querySelectorAll('td-media-picker')) if (h.isOpen) h.close('programmatic');
    root.querySelector('.td-modal__close')?.click();
    await promise.catch(() => {});
    expect(root.style.getPropertyValue('--td-vv-height')).to.equal('');
  });
});
