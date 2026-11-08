import { expect } from '@esm-bundle/chai';
import { emulateMedia, setViewport } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';

// v0.102.0 (dcms2 request): a fullViewport modal moves like every other modal (from 720px: scale(0.95) + fade; below:
// the sheet slide, as the media picker since v0.62.0) instead of fading only; show({ motion: 'fade' }) opts one modal
// back into fade-only at every width. Reduced motion keeps opacity only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n) => { for (let i = 0; i < n; i += 1) await frame(); };

/** The dialog's computed transform right after show(), before the open state applies (the enter-from pose). */
function enterPose(opts) {
  const id = TdModal.show({ title: 'Motion', body: '<p>x</p>', ...opts });
  const root = document.getElementById(id);
  const dialog = root.querySelector('.td-modal__dialog');
  return { root, dialog, transform: getComputedStyle(dialog).transform };
}

/** matrix(a, b, c, d, tx, ty) → { scale: a, ty } */
function parse(tf) {
  const m = /^matrix\(([^)]+)\)$/.exec(tf);
  if (!m) return null;
  const v = m[1].split(',').map(Number);
  return { scale: v[0], ty: v[5] };
}

afterEach(async () => {
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  document.documentElement.style.removeProperty('--td-modal-enter-from');
  await emulateMedia({ reducedMotion: 'no-preference' });
  await setViewport({ width: 1024, height: 768 });
  await frames(2);
});

describe('v0.102.0 fullViewport modal motion', () => {
  it('≥ 720px: a fullViewport modal starts at scale(0.95), like a standard one', async () => {
    await setViewport({ width: 1024, height: 768 });
    const std = parse(enterPose({}).transform);
    const vp = parse(enterPose({ fullViewport: true }).transform);
    expect(std.scale).to.be.closeTo(0.95, 0.001);
    expect(vp.scale).to.be.closeTo(0.95, 0.001);
  });

  it('≥ 720px: the fullViewport dialog springs past 1 then settles at none (same timing tokens)', async () => {
    await setViewport({ width: 1024, height: 768 });
    const { dialog } = enterPose({ fullViewport: true });
    expect(getComputedStyle(dialog).transitionDuration).to.equal('0.2s, 0.3s');
    await frames(2);
    let max = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 380) {
      const p = parse(getComputedStyle(dialog).transform);
      if (p) max = Math.max(max, p.scale);
      await frame();
    }
    expect(max).to.be.above(1);
    expect(getComputedStyle(dialog).transform).to.equal('none');
  });

  it('< 720px: a fullViewport modal slides up from the bottom (no scale)', async () => {
    await setViewport({ width: 390, height: 700 });
    await frames(2);
    const { dialog, transform } = enterPose({ fullViewport: true });
    const p = parse(transform);
    expect(p.scale).to.equal(1);
    expect(p.ty).to.be.closeTo(dialog.getBoundingClientRect().height / 1, 2);
  });

  it("motion: 'fade' → fade only, fullViewport and standard, desktop and phone", async () => {
    for (const vp of [{ width: 1024, height: 768 }, { width: 390, height: 700 }]) {
      await setViewport(vp);
      await frames(2);
      for (const fullViewport of [true, false]) {
        const { root, transform } = enterPose({ fullViewport, motion: 'fade' });
        expect(root.classList.contains('td-modal--fade')).to.equal(true);
        expect(transform, `${vp.width} fullViewport=${fullViewport}`).to.equal('none');
        root.remove();
      }
    }
  });

  it("an unknown motion value keeps the default motion (no class)", async () => {
    await setViewport({ width: 1024, height: 768 });
    const { root, transform } = enterPose({ fullViewport: true, motion: 'zoom' });
    expect(root.classList.contains('td-modal--fade')).to.equal(false);
    expect(parse(transform).scale).to.be.closeTo(0.95, 0.001);
  });

  it('a site :root --td-modal-enter-from: none also makes fullViewport fade-only from 720px', async () => {
    await setViewport({ width: 1024, height: 768 });
    document.documentElement.style.setProperty('--td-modal-enter-from', 'none');
    expect(enterPose({ fullViewport: true }).transform).to.equal('none');
  });

  it('prefers-reduced-motion: fullViewport stays transform none at both widths', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    for (const vp of [{ width: 1024, height: 768 }, { width: 390, height: 700 }]) {
      await setViewport(vp);
      await frames(2);
      const { root, transform } = enterPose({ fullViewport: true });
      expect(transform, `${vp.width}`).to.equal('none');
      root.remove();
    }
  });
});
