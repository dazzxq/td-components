import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';

// v0.33.0 — .td-modal--viewport safe area (plan docs/internal/plans/v0.33.0-media-picker-dcms-parity.md, decisions 4 + 5).
// Test browsers have env(safe-area-inset-*) = 0, so the ADDED inset must leave exactly the base padding: proof that the
// header / footer never lose their padding to a bare env(). The body gets only the (zero) side insets.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Poll (per frame) until `fn()` is truthy; fails after `ms`. */
async function until(fn, ms = 3000, what = 'condition') {
  const end = performance.now() + ms;
  while (!fn()) {
    if (performance.now() > end) throw new Error(`timeout waiting for ${what}`);
    await frame();
  }
}

/** A token's resolved px value (e.g. --td-space-sm = 0.75rem → 12). */
function tokenPx(name) {
  const probe = document.createElement('div');
  probe.style.setProperty('width', `var(${name})`);
  probe.style.setProperty('position', 'absolute');
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return px;
}

/** Open a full-viewport modal with header + footer; resolves once onShow ran and the fade-in has finished. */
async function openViewport(extra = {}) {
  let shown = false;
  const id = TdModal.show({
    title: 'Full viewport',
    body: '<p>Nội dung</p>',
    fullViewport: true,
    actions: [{ label: 'Đóng', value: 'close' }],
    onShow: () => { shown = true; },
    ...extra,
  });
  const root = document.getElementById(id);
  await until(() => shown && root.getAttribute('data-state') === 'open', 3000, 'open state');
  const dialog = root.querySelector('.td-modal__dialog');
  await until(() => Number(getComputedStyle(dialog).opacity) === 1, 3000, 'fade-in end');
  return root;
}

afterEach(async () => {
  const roots = [...document.querySelectorAll('body > .td-modal')];
  TdModal.closeAll();
  await until(() => roots.every((r) => !r.isConnected), 3000, 'modals removed');
  await setViewport({ width: 800, height: 600 });
});

for (const [w, h] of [[390, 844], [1440, 900]]) {
  describe(`v0.33.0 .td-modal--viewport at ${w}×${h}`, () => {
    beforeEach(async () => {
      await setViewport({ width: w, height: h });
      await until(() => window.innerWidth === w && window.innerHeight === h, 3000, 'viewport size');
    });

    it('a nonzero --td-scroll-lock-gap (scroll lock padding fallback) never shrinks the viewport surface', async () => {
      const html = document.documentElement;
      html.style.setProperty('--td-scroll-lock-gap', '17px');
      try {
        const root = await openViewport();
        const vw = html.clientWidth;
        for (const el of [root, root.querySelector('.td-modal__dialog')]) {
          const r = el.getBoundingClientRect();
          expect(Math.abs(r.left), el.className).to.be.at.most(1);
          expect(Math.abs(r.right - vw), el.className).to.be.at.most(1);
        }
      } finally {
        html.style.removeProperty('--td-scroll-lock-gap');
      }
    });

    it('dialog fills the viewport (±1px), no radius, no bottom sheet', async () => {
      const root = await openViewport();
      expect(root.classList.contains('td-modal--viewport')).to.equal(true);
      const dialog = root.querySelector('.td-modal__dialog');
      const r = dialog.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      expect(Math.abs(r.left)).to.be.at.most(1);
      expect(Math.abs(r.top)).to.be.at.most(1);
      expect(Math.abs(r.width - vw)).to.be.at.most(1);
      expect(Math.abs(r.height - window.innerHeight)).to.be.at.most(1);
      const cs = getComputedStyle(dialog);
      expect(cs.borderTopLeftRadius).to.equal('0px');
      expect(cs.borderTopRightRadius).to.equal('0px');
      expect(cs.transform).to.equal('none');
    });

    it('safe area (inset 0): header / footer keep --td-space-sm + --td-modal-pad-x; body padding-inline 0', async () => {
      const root = await openViewport();
      const sm = `${tokenPx('--td-space-sm')}px`;
      const padX = `${tokenPx('--td-modal-pad-x')}px`;
      expect(sm).to.equal('12px');
      expect(padX).to.equal('24px');
      const header = getComputedStyle(root.querySelector('.td-modal__header'));
      const footer = getComputedStyle(root.querySelector('.td-modal__footer'));
      const body = getComputedStyle(root.querySelector('.td-modal__body'));
      expect(header.paddingTop).to.equal(sm);
      expect(header.paddingBottom).to.equal(sm);
      expect(header.paddingLeft).to.equal(padX);
      expect(header.paddingRight).to.equal(padX);
      expect(footer.paddingTop).to.equal(sm);
      expect(footer.paddingBottom).to.equal(sm);
      expect(footer.paddingLeft).to.equal(padX);
      expect(footer.paddingRight).to.equal(padX);
      expect(body.paddingLeft).to.equal('0px');
      expect(body.paddingRight).to.equal('0px');
      expect(body.paddingTop).to.equal('0px');
      expect(body.paddingBottom).to.equal('0px');
    });

    it('an explicit bodyPadding still wins over the body inset fallback', async () => {
      const root = await openViewport({ bodyPadding: '8px 10px' });
      const body = getComputedStyle(root.querySelector('.td-modal__body'));
      expect(body.paddingTop).to.equal('8px');
      expect(body.paddingLeft).to.equal('10px');
      expect(body.paddingRight).to.equal('10px');
    });
  });
}

describe('v0.33.0 safe area is scoped to --viewport', () => {
  it('a normal (non-viewport) modal keeps its v0.32 header / footer / body padding', async () => {
    let shown = false;
    const id = TdModal.show({ title: 'Thường', body: '<p>x</p>', actions: [{ label: 'OK' }], onShow: () => { shown = true; } });
    const root = document.getElementById(id);
    await until(() => shown && root.getAttribute('data-state') === 'open', 3000, 'open state');
    const header = getComputedStyle(root.querySelector('.td-modal__header'));
    const body = getComputedStyle(root.querySelector('.td-modal__body'));
    expect(header.paddingTop).to.equal(`${tokenPx('--td-space-sm')}px`);
    expect(header.paddingLeft).to.equal(`${tokenPx('--td-modal-pad-x')}px`);
    expect(body.paddingLeft).to.equal(`${tokenPx('--td-modal-pad-x')}px`);
    expect(body.paddingTop).to.equal(`${tokenPx('--td-modal-pad-y')}px`);
  });
});
