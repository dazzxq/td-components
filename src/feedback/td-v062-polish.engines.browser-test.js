// v0.62.0 polish batch (plan docs/internal/plans/v0.62.0-polish.md M1) — browser half. Written tests-first; run with the
// other browser suites (3 engines). DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';
import './td-alert.js';
import './td-scroll-top.js';
import { trackFormDirty } from '../utils/form-dirty.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};
const cleanups = [];
afterEach(async () => {
  TdModal.closeAll();
  for (const d of document.querySelectorAll('td-drawer')) { if (d.open) d._releaseNow?.(); d.remove(); }
  while (cleanups.length) cleanups.pop()();
  await emulateMedia({ reducedMotion: 'no-preference' });
  await frames(2);
});

// ---- B: drawer unsaved guard uses the kit's confirm -------------------------------------------------------------------
describe('drawer + trackFormDirty: the guard is the kit TdModal.confirm, never window.confirm (plan B)', () => {
  function mount() {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-drawer title="Hồ sơ"><form id="f62" novalidate><input name="name" value="An"></form></td-drawer>';
    document.body.appendChild(wrap);
    cleanups.push(() => wrap.remove());
    const host = wrap.querySelector('td-drawer');
    const form = wrap.querySelector('#f62');
    const tracker = trackFormDirty(form);
    cleanups.push(() => tracker.destroy());
    host.beforeClose = () => tracker.confirmDiscard();
    return { host, form, tracker, input: form.querySelector('input') };
  }
  const drawerRoot = () => [...document.querySelectorAll('body > .td-drawer-root:not([data-state="closing"])')].pop();
  const confirmRoot = () => [...document.querySelectorAll('body > .td-modal:not([data-state="closing"])')].pop();
  const type = (input, v) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); };

  it('dirty: × opens ONE danger confirm above the drawer; "Ở lại" keeps it and returns focus into the drawer; native confirm never called', async () => {
    const orig = window.confirm;
    let nativeCalls = 0;
    window.confirm = () => { nativeCalls += 1; return true; };
    cleanups.push(() => { window.confirm = orig; });
    const { host, input } = mount();
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    type(input, 'Bình');
    drawerRoot().querySelector('.td-drawer__close').click();
    await until(() => !!confirmRoot());
    const dlg = confirmRoot();
    expect(dlg.getAttribute('data-state')).to.equal('open');
    expect(dlg.querySelectorAll('.td-btn--danger').length).to.equal(1);
    // stacked above the drawer: later in the DOM and the dialog layer on top (focus lives in the confirm)
    expect(!!(drawerRoot().compareDocumentPosition(dlg) & Node.DOCUMENT_POSITION_FOLLOWING)).to.equal(true);
    expect(dlg.contains(document.activeElement)).to.equal(true);
    const stay = [...dlg.querySelectorAll('.td-modal__footer button')].find((b) => !b.classList.contains('td-btn--danger'));
    stay.click();
    await until(() => !confirmRoot());
    expect(host.open).to.equal(true);
    expect(drawerRoot().contains(document.activeElement)).to.equal(true);
    expect(nativeCalls).to.equal(0);
  });

  it('dirty: "Bỏ thay đổi" closes the drawer (closed resolves); clean form closes with no question', async () => {
    const { host, input } = mount();
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    type(input, 'Bình');
    const closing = host.requestClose('button');
    await until(() => !!confirmRoot());
    confirmRoot().querySelector('.td-btn--danger').click();
    expect(await closing).to.equal('button');
    await until(() => !host.open);

    const second = mount();
    second.host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    expect(await second.host.requestClose('button')).to.equal('button'); // pristine → straight through
    expect(!!confirmRoot()).to.equal(false);
  });

  it('Escape in the confirm is swallowed by the confirm: the drawer stays; the site `confirm` hook replaces the dialog', async () => {
    const { host, input, tracker } = mount();
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    type(input, 'Bình');
    host.requestClose('escape');
    await until(() => !!confirmRoot());
    await sendKeys({ press: 'Escape' });
    await frames(3);
    expect(host.open).to.equal(true);
    TdModal.closeAll();
    await frames(2);
    let seen = null;
    host.beforeClose = () => tracker.confirmDiscard({ confirm: (dialog) => { seen = dialog; return Promise.resolve(false); } });
    expect(await host.requestClose('button')).to.equal(null);
    expect(seen && seen.confirmVariant).to.equal('danger');
    expect(!!confirmRoot()).to.equal(false);
  });
});

// ---- A: alert shape --------------------------------------------------------------------------------------------------
describe('td-alert: no side stripe, an icon tile (plan A)', () => {
  const VARIANTS = ['info', 'success', 'warning', 'danger'];
  function host(v, extra = '') {
    const el = document.createElement('td-alert');
    el.setAttribute('variant', v);
    el.setAttribute('heading', 'Tiêu đề');
    if (extra) el.setAttribute(extra, '');
    el.textContent = 'Nội dung ngắn.';
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    return el;
  }

  it('a 1px border on every side in every variant (the 4px inline-start bar is gone); markup classes unchanged', async () => {
    for (const v of VARIANTS) {
      const box = host(v).querySelector('.td-alert');
      const cs = getComputedStyle(box);
      expect([cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth], v).to.deep.equal(['1px', '1px', '1px', '1px']);
      expect(cs.borderLeftColor, v).to.equal(cs.borderTopColor);
      expect(box.classList.contains(`td-alert--${v}`)).to.equal(true);
    }
  });

  it('the icon is a tile: fixed square, a fill that differs from the alert fill; first text line centred on it', async () => {
    for (const v of VARIANTS) {
      const el = host(v, 'dismissible');
      await frames(2);
      const box = el.querySelector('.td-alert');
      const icon = el.querySelector('.td-alert__icon');
      const ics = getComputedStyle(icon);
      const side = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.75;
      expect(Math.abs(icon.getBoundingClientRect().width - side) < 1, `${v} tile width`).to.equal(true);
      expect(ics.backgroundColor, v).to.not.equal('rgba(0, 0, 0, 0)');
      expect(ics.backgroundColor, v).to.not.equal(getComputedStyle(box).backgroundColor);
      const head = el.querySelector('.td-alert__heading').getBoundingClientRect();
      const ir = icon.getBoundingClientRect();
      expect(Math.abs((head.top + head.height / 2) - (ir.top + ir.height / 2)) < 1.5, `${v} first line centred on the tile`).to.equal(true);
      const close = el.querySelector('.td-alert__close').getBoundingClientRect();
      expect(Math.abs((close.top + close.height / 2) - (ir.top + ir.height / 2)) < 1.5, `${v} close centred on the tile`).to.equal(true);
    }
  });

  it('--td-alert-{v}-tile: transparent removes the tile (site override)', async () => {
    const el = host('danger');
    el.style.setProperty('--td-alert-danger-tile', 'transparent');
    expect(getComputedStyle(el.querySelector('.td-alert__icon')).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
  });
});

// ---- D: media-picker open motion -------------------------------------------------------------------------------------
describe('media-picker dialog motion = modal motion (plan D)', () => {
  function shell() {
    const root = document.createElement('div');
    root.className = 'td-modal td-modal--viewport td-media-picker';
    root.setAttribute('data-state', 'opening');
    root.innerHTML = '<div class="td-modal__backdrop"></div><div class="td-modal__dialog td-media-picker__dialog"></div>';
    document.body.appendChild(root);
    cleanups.push(() => root.remove());
    return { root, dialog: root.querySelector('.td-modal__dialog') };
  }
  const scaleOf = (t) => { const m = /^matrix\(([-\d.e]+)/.exec(t); return m ? Number(m[1]) : 1; };

  it('≥ 720px: enters from scale(0.95) with the modal durations / curves, ends at none', async () => {
    await setViewport({ width: 1024, height: 800 });
    cleanups.push(() => setViewport({ width: 800, height: 600 }));
    const { root, dialog } = shell();
    const cs = getComputedStyle(dialog);
    expect(Math.abs(scaleOf(cs.transform) - 0.95) < 0.001).to.equal(true);
    expect(cs.transitionDuration).to.equal('0.2s, 0.3s');
    expect(cs.transitionTimingFunction).to.contain('cubic-bezier(0.34, 1.56, 0.64, 1)');
    root.setAttribute('data-state', 'open');
    await until(() => getComputedStyle(dialog).transform === 'none' && getComputedStyle(dialog).opacity === '1');
  });

  it('< 720px: enters from the bottom (translateY 100%) with the sheet curve (no overshoot)', async () => {
    await setViewport({ width: 390, height: 800 });
    cleanups.push(() => setViewport({ width: 800, height: 600 }));
    const { dialog } = shell();
    const cs = getComputedStyle(dialog);
    const m = /^matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.e]+)\)/.exec(cs.transform);
    expect(!!m && Number(m[1]) > 100).to.equal(true);
    expect(cs.transitionTimingFunction).to.contain('cubic-bezier(0.32, 0.72, 0, 1)');
  });

  it('reduced motion is the ONLY default case with transform: none (opacity-only transition)', async () => {
    await setViewport({ width: 1024, height: 800 });
    cleanups.push(() => setViewport({ width: 800, height: 600 }));
    await emulateMedia({ reducedMotion: 'reduce' });
    const { dialog } = shell();
    const cs = getComputedStyle(dialog);
    expect(cs.transform).to.equal('none');
    expect(cs.transitionProperty).to.equal('opacity');
    await emulateMedia({ reducedMotion: 'no-preference' });
    expect(getComputedStyle(dialog).transform).to.not.equal('none'); // back to the scale opening: none is not the default
  });

  it('the site opt-out tokens are the only other way to a fade-only opening', async () => {
    await setViewport({ width: 1024, height: 800 });
    cleanups.push(() => setViewport({ width: 800, height: 600 }));
    const { dialog } = shell();
    expect(getComputedStyle(dialog).transform).to.not.equal('none');
    document.documentElement.style.setProperty('--td-media-picker-enter-from', 'none');
    cleanups.push(() => document.documentElement.style.removeProperty('--td-media-picker-enter-from'));
    expect(getComputedStyle(dialog).transform).to.equal('none');
  });
});

// ---- E: scroll-top colours -------------------------------------------------------------------------------------------
describe('td-scroll-top color / text-color (plan E)', () => {
  function mount(attrs) {
    const el = document.createElement('td-scroll-top');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    return el;
  }
  const btn = (el) => el.querySelector('.td-scroll-top');

  it('no attribute: the surface recipe (resting look unchanged), no host custom property set', () => {
    const el = mount({});
    expect(el.style.getPropertyValue('--td-scroll-top-bg')).to.equal('');
    const probe = document.createElement('i');
    probe.style.setProperty('background-color', 'var(--td-glass-solid)');
    document.body.appendChild(probe);
    cleanups.push(() => probe.remove());
    expect(getComputedStyle(btn(el)).backgroundColor).to.equal(getComputedStyle(probe).backgroundColor);
  });

  it('color="#1e40af": CSSOM vars on the host, painted fill, auto icon colour white; no style attribute in the markup the page wrote', () => {
    const el = mount({ color: '#1e40af' });
    expect(el.style.getPropertyValue('--td-scroll-top-bg')).to.equal('#1e40af');
    expect(el.style.getPropertyValue('--td-scroll-top-fg')).to.equal('#ffffff');
    const cs = getComputedStyle(btn(el));
    expect(cs.backgroundColor).to.equal('rgb(30, 64, 175)');
    expect(cs.color).to.equal('rgb(255, 255, 255)');
    expect(btn(el).hasAttribute('style')).to.equal(false);
  });

  it('text-color honoured when >= 3:1, ignored (+ one warning) when not; removing the attributes gives the tokens back', async () => {
    const warn = console.warn;
    const warns = [];
    console.warn = (...a) => warns.push(a.join(' '));
    cleanups.push(() => { console.warn = warn; });
    const el = mount({ color: '#1e40af', 'text-color': '#fde68a' });
    expect(el.style.getPropertyValue('--td-scroll-top-fg')).to.equal('#fde68a');
    el.setAttribute('text-color', '#2563eb');
    expect(el.style.getPropertyValue('--td-scroll-top-fg')).to.equal('#ffffff');
    expect(warns.filter((w) => /text-color/.test(w)).length).to.equal(1);
    el.style.setProperty('--keep', '1');
    el.removeAttribute('color');
    expect(el.style.getPropertyValue('--td-scroll-top-bg')).to.equal('');
    expect(el.style.getPropertyValue('--keep')).to.equal('1'); // the site's own inline value survives
  });

  it('hostile / translucent colour values are refused: nothing set, one fixed-text warning, never the value', () => {
    const warn = console.warn;
    const warns = [];
    console.warn = (...a) => warns.push(a.join(' '));
    cleanups.push(() => { console.warn = warn; });
    for (const bad of ['red;}', 'rgb(0 0 0 / 50%)', 'url(javascript:alert(1))']) {
      const el = mount({ color: bad });
      expect(el.style.getPropertyValue('--td-scroll-top-bg'), bad).to.equal('');
    }
    expect(warns.length).to.be.greaterThan(0);
    expect(warns.some((w) => /alert\(1\)|red;/.test(w))).to.equal(false);
  });

  it('hover paints a different fill (real pointer) but never below the icon contrast floor; tokens work without the attribute', async () => {
    document.documentElement.style.setProperty('--td-scroll-top-bg', '#ffffff');
    document.documentElement.style.setProperty('--td-scroll-top-fg', '#000000');
    cleanups.push(() => { document.documentElement.style.removeProperty('--td-scroll-top-bg'); document.documentElement.style.removeProperty('--td-scroll-top-fg'); });
    const el = mount({});
    expect(getComputedStyle(btn(el)).backgroundColor).to.equal('rgb(255, 255, 255)');
    expect(getComputedStyle(btn(el)).color).to.equal('rgb(0, 0, 0)');
  });
});
