// v0.96.0 (plan v0.96.0-modal-wp §5) — opt-in frosted surface: TdModal.show({ surface: 'glass' }), <td-drawer
// surface="glass"> / TdDrawer.open({ surface }). Default stays solid; any other value = solid; the glass.css fallbacks
// (data-td-glass="off", forced colours, more contrast, no backdrop-filter) bring it back to solid. Chromium + Firefox +
// WebKit; emulateMedia branches only where the engine supports them.
import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function until(cond, n = 180) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}

/** alpha of a computed colour (rgb / rgba / color(srgb … / a)) */
function alpha(c) {
  const slash = /\/\s*([\d.]+%?)\s*\)$/.exec(c);
  if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
  const m = /^rgba\(([^)]+)\)$/.exec(c);
  if (m) return parseFloat(m[1].split(',')[3]);
  return 1;
}
const filterOf = (el) => {
  const cs = getComputedStyle(el);
  return cs.backdropFilter || cs.webkitBackdropFilter || cs.getPropertyValue('-webkit-backdrop-filter') || 'none';
};
const supportsBlur = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

async function openModal(opts = {}) {
  let shown = false;
  const id = TdModal.show({ title: 'Kính', body: '<p>Nội dung</p>', onShow: () => { shown = true; }, ...opts });
  await until(() => shown);
  return document.getElementById(id).querySelector('.td-modal__dialog');
}
async function openDrawer(opts = {}) {
  const d = TdDrawer.open({ label: 'Panel', bodyHtml: '<p>Nội dung</p>', ...opts });
  await until(() => !!document.querySelector('body > .td-drawer-root[data-state="open"]'));
  return { d, panel: document.querySelector('body > .td-drawer-root .td-drawer__panel') };
}

afterEach(async () => {
  const roots = [...document.querySelectorAll('body > .td-modal, body > .td-drawer-root')];
  TdModal.closeAll();
  for (const h of document.querySelectorAll('td-drawer')) if (h.open) h.close();
  await until(() => roots.every((r) => !r.isConnected));
  document.documentElement.removeAttribute('data-td-glass');
  document.documentElement.style.removeProperty('--td-modal-glass-bg');
  document.documentElement.style.removeProperty('--td-drawer-glass-bg');
  try { await emulateMedia({ forcedColors: 'none' }); } catch { /* engine without it */ }
});

describe('v0.96.0 TdModal surface="glass"', () => {
  it('default (no surface): solid, no blur (regression)', async () => {
    const dialog = await openModal();
    expect(dialog.closest('.td-modal').classList.contains('td-modal--glass')).to.equal(false);
    expect(filterOf(dialog)).to.equal('none');
    expect(alpha(getComputedStyle(dialog).backgroundColor)).to.equal(1);
  });

  it("surface: 'glass' → translucent + blur; an unknown value → solid", async () => {
    const dialog = await openModal({ surface: 'glass' });
    expect(dialog.closest('.td-modal').classList.contains('td-modal--glass')).to.equal(true);
    if (supportsBlur) {
      expect(filterOf(dialog)).to.contain('blur');
      expect(alpha(getComputedStyle(dialog).backgroundColor)).to.be.below(1);
    } else {
      expect(alpha(getComputedStyle(dialog).backgroundColor)).to.equal(1); // @supports fallback → solid
    }
    TdModal.closeAll();
    const bogus = await openModal({ surface: 'bogus' });
    expect(bogus.closest('.td-modal').classList.contains('td-modal--glass')).to.equal(false);
    expect(filterOf(bogus)).to.equal('none');
  });

  it('the fill is --td-modal-glass-bg (td-glass-surface--strong does not pull it back)', async function () {
    if (!supportsBlur) this.skip();
    document.documentElement.style.setProperty('--td-modal-glass-bg', 'rgb(255 0 0 / 50%)');
    const dialog = await openModal({ surface: 'glass' });
    const bg = getComputedStyle(dialog).backgroundColor;
    expect(alpha(bg)).to.be.closeTo(0.5, 0.01);
    expect(bg.replace(/\s/g, '')).to.match(/^rgba\(255,0,0,|^color\(srgb100/);
  });

  it('the Promise dialogs ignore surface (they stay solid)', async () => {
    TdModal.confirm({ title: 'Xoá?', message: 'x', surface: 'glass' });
    await until(() => !!document.querySelector('body > .td-modal[data-state="open"]'));
    const root = document.querySelector('body > .td-modal');
    expect(root.classList.contains('td-modal--glass')).to.equal(false);
  });

  it('data-td-glass="off" → solid, no blur', async () => {
    document.documentElement.setAttribute('data-td-glass', 'off');
    const dialog = await openModal({ surface: 'glass' });
    expect(filterOf(dialog)).to.equal('none');
    expect(alpha(getComputedStyle(dialog).backgroundColor)).to.equal(1);
  });

  it('forced colours → no blur (Chromium emulation; other engines skip)', async function () {
    try { await emulateMedia({ forcedColors: 'active' }); } catch { this.skip(); }
    if (!matchMedia('(forced-colors: active)').matches) this.skip();
    const dialog = await openModal({ surface: 'glass' });
    expect(filterOf(dialog)).to.equal('none');
  });
});

describe('v0.96.0 td-drawer surface="glass"', () => {
  it('default: solid, no blur (regression)', async () => {
    const { panel } = await openDrawer();
    expect(panel.closest('.td-drawer-root').classList.contains('td-drawer-root--glass')).to.equal(false);
    expect(filterOf(panel)).to.equal('none');
    expect(alpha(getComputedStyle(panel).backgroundColor)).to.equal(1);
  });

  it("TdDrawer.open({ surface: 'glass' }) → translucent + blur; the fill is --td-drawer-glass-bg", async function () {
    if (!supportsBlur) this.skip();
    document.documentElement.style.setProperty('--td-drawer-glass-bg', 'rgb(0 0 255 / 40%)');
    const { d, panel } = await openDrawer({ surface: 'glass' });
    expect(d.element.getAttribute('surface')).to.equal('glass');
    expect(filterOf(panel)).to.contain('blur');
    expect(alpha(getComputedStyle(panel).backgroundColor)).to.be.closeTo(0.4, 0.01);
  });

  it('declarative <td-drawer surface="glass">; an unknown value → solid; data-td-glass="off" → solid', async function () {
    if (!supportsBlur) this.skip();
    const host = document.createElement('td-drawer');
    host.setAttribute('label', 'Panel');
    host.setAttribute('surface', 'glass');
    host.innerHTML = '<p>x</p>';
    document.body.appendChild(host);
    host.show();
    await until(() => !!document.querySelector('body > .td-drawer-root[data-state="open"]'));
    let panel = document.querySelector('body > .td-drawer-root .td-drawer__panel');
    expect(filterOf(panel)).to.contain('blur');
    await host.close();
    host.setAttribute('surface', 'frosted');
    host.show();
    await until(() => !!document.querySelector('body > .td-drawer-root[data-state="open"]'));
    panel = document.querySelector('body > .td-drawer-root .td-drawer__panel');
    expect(filterOf(panel)).to.equal('none');
    await host.close();
    document.documentElement.setAttribute('data-td-glass', 'off');
    host.setAttribute('surface', 'glass');
    host.show();
    await until(() => !!document.querySelector('body > .td-drawer-root[data-state="open"]'));
    panel = document.querySelector('body > .td-drawer-root .td-drawer__panel');
    expect(filterOf(panel)).to.equal('none');
    expect(alpha(getComputedStyle(panel).backgroundColor)).to.equal(1);
    await host.close();
    host.remove();
  });
});
