// Loaded as a same-origin module by tokens.spec.mjs under strict / nonce-only CSP.
import { TdLightbox } from '/src/feedback/td-lightbox.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__lightboxRun = (async () => {
  const lb = TdLightbox.open([
    { src: '/test/fixtures/1.svg', caption: 'Một' },
    { src: '/test/fixtures/2.svg', caption: 'Hai' },
  ], { panel: true, toolbar: [{ id: 'star', label: 'Sao', icon: 'star', onClick() {} }] });
  await wait(300);
  lb.next();
  await wait(200);
  const img = document.querySelector('.td-lightbox__img');
  const r = img.getBoundingClientRect();
  const pe = (type) => new PointerEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', button: 0 });
  img.dispatchEvent(pe('pointerdown'));
  img.dispatchEvent(pe('pointerup'));
  await wait(400);
  const zoomed = document.querySelector('.td-lightbox').hasAttribute('data-zoomed');
  const visible = getComputedStyle(document.querySelector('.td-lightbox')).visibility;
  lb.close();
  await wait(300);
  return { zoomed, visible, closed: !TdLightbox.isOpen };
})();
