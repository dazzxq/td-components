import { expect } from '@esm-bundle/chai';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';

// v0.126.0 (dsuite): .td-modal__body / .td-drawer__body keep the classic scrollbar's space (scrollbar-gutter: stable), so
// content does not shift sideways when the body grows enough to scroll. Headless Chromium hides native scrollbars; the
// test page forces a classic 15 px one on the two bodies (like scroll-lock.scrollbar.browser-test.js does on html).

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const sheet = document.createElement('style');
sheet.textContent = '.td-modal__body::-webkit-scrollbar,.td-drawer__body::-webkit-scrollbar{width:15px;background:#ddd}'
  + '.td-modal__body::-webkit-scrollbar-thumb,.td-drawer__body::-webkit-scrollbar-thumb{background:#888}'
  + '.gt-tall{height:3000px}';
document.head.appendChild(sheet);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const content = () => { const d = document.createElement('div'); d.innerHTML = '<p class="gt-line">x</p>'; return d; };

/** Opens, measures body clientWidth + a child's right edge short, then tall. */
async function measure(open, bodySel) {
  const wrap = content();
  const h = open(wrap);
  await wait(400);
  const body = wrap.closest(bodySel); // the body of THIS instance (an earlier one may still be closing)
  const p = wrap.querySelector('.gt-line');
  const short = { cw: body.clientWidth, right: p.getBoundingClientRect().right, gutter: getComputedStyle(body).scrollbarGutter };
  const tall = document.createElement('div');
  tall.className = 'gt-tall';
  wrap.appendChild(tall);
  await frame();
  const long = { cw: body.clientWidth, right: p.getBoundingClientRect().right, scrolls: body.scrollHeight > body.clientHeight };
  return { short, long, close: () => h.close?.() };
}

const closeAll = async () => { TdModal.closeAll?.(); TdDrawer.closeAll?.(); document.querySelectorAll('.td-modal,.td-drawer').forEach((n) => n.remove()); await wait(350); };

describe('v0.126.0 body scrollbar-gutter (classic scrollbar)', function () {
  before(function () {
    // overlay scrollbars (macOS default, some CI images) take no space: nothing to measure → skip with a log
    const probe = document.createElement('div');
    probe.className = 'td-drawer__body';
    probe.style.cssText = 'position:absolute;width:100px;height:50px;overflow:scroll';
    document.body.appendChild(probe);
    const w = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    console.log(`[v126 gutter] classic scrollbar ${w}px`);
    if (w < 1) { console.log('[v126 gutter] overlay scrollbars: skipped'); this.skip(); }
  });
  afterEach(async () => { document.documentElement.style.removeProperty('--td-modal-body-gutter'); document.documentElement.style.removeProperty('--td-drawer-body-gutter'); await closeAll(); });

  it('modal: content does not shift when the body starts scrolling', async () => {
    const m = await measure((b) => TdModal.show({ title: 'G', body: b }), '.td-modal__body');
    expect(m.short.gutter).to.equal('stable');
    expect(m.long.scrolls).to.equal(true);
    expect(Math.abs(m.long.cw - m.short.cw)).to.be.below(0.5);
    expect(Math.abs(m.long.right - m.short.right)).to.be.below(0.5);
  });

  it('drawer: content does not shift when the body starts scrolling', async () => {
    const m = await measure((b) => TdDrawer.open({ title: 'G', body: b }), '.td-drawer__body');
    expect(m.short.gutter).to.equal('stable');
    expect(m.long.scrolls).to.equal(true);
    expect(Math.abs(m.long.cw - m.short.cw)).to.be.below(0.5);
    expect(Math.abs(m.long.right - m.short.right)).to.be.below(0.5);
  });

  it('variable = auto restores the old behaviour (body narrows by the scrollbar width)', async () => {
    document.documentElement.style.setProperty('--td-modal-body-gutter', 'auto');
    const m = await measure((b) => TdModal.show({ title: 'G', body: b }), '.td-modal__body');
    expect(m.short.gutter).to.equal('auto');
    expect(m.short.cw - m.long.cw).to.be.within(14, 16);
  });

  it('drawer variable = auto restores the old behaviour', async () => {
    document.documentElement.style.setProperty('--td-drawer-body-gutter', 'auto');
    const m = await measure((b) => TdDrawer.open({ title: 'G', body: b }), '.td-drawer__body');
    expect(m.short.cw - m.long.cw).to.be.within(14, 16);
  });

  it('bodyOverflow hidden: no gutter (the body does not scroll)', async () => {
    TdModal.show({ title: 'H', body: content(), bodyOverflow: 'hidden' });
    await wait(400);
    const bodies = document.querySelectorAll('.td-modal__body');
    expect(getComputedStyle(bodies[bodies.length - 1]).scrollbarGutter).to.equal('auto');
  });

  it('viewport modal body: no gutter (overflow hidden, no empty strip)', async () => {
    TdModal.show({ title: 'V', body: content(), fullViewport: true });
    await wait(400);
    const body = document.querySelector('.td-modal--viewport .td-modal__body');
    expect(body, 'viewport modal rendered').to.not.equal(null);
    expect(getComputedStyle(body).scrollbarGutter).to.equal('auto');
  });
});
