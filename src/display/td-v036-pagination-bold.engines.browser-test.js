import { expect } from '@esm-bundle/chai';
import './td-pagination.js';

// v0.36.0 (plan QĐ 17, M4) — measured before the fix: the semibold current page widened its button by up to 2.3 px
// (2+ digit numbers outgrow the min-width) in Chromium / Firefox / WebKit, so the same mechanism as td-tabs applies:
// `.td-pagination__page::after { content: attr(data-page) }` (0 px tall, hidden, semibold) — CSS only, the button already
// carries data-page. Every page button is as wide whether current or not. Real signals only (fonts.ready, rAF).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;
const raf = () => new Promise((r) => requestAnimationFrame(r));

describe('v0.36.0 td-pagination — the bold current page does not change widths', () => {
  for (const pages of [10, 120, 1200, 120000]) {
    it(`${pages} pages: every page button width identical current / not current; neighbours do not move`, async () => {
      const el = document.createElement('td-pagination');
      el.setAttribute('total-items', String(pages * 10));
      el.setAttribute('items-per-page', '10');
      el.setAttribute('current-page', String(Math.max(1, pages - 2)));
      document.body.appendChild(el);
      await raf();
      const btns = [...el.querySelectorAll('.td-pagination__page')];
      const xs = () => btns.map((b) => b.getBoundingClientRect().left);
      const x0 = xs();
      for (const b of btns) {
        const cur = b.hasAttribute('aria-current');
        const w1 = b.getBoundingClientRect().width;
        if (cur) b.removeAttribute('aria-current'); else b.setAttribute('aria-current', 'page');
        const w2 = b.getBoundingClientRect().width;
        const x1 = xs();
        if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        expect(Math.abs(w1 - w2), `page ${b.dataset.page}: ${w1} vs ${w2}`).to.be.below(0.5);
        x1.forEach((x, i) => expect(Math.abs(x - x0[i]), `page ${b.dataset.page} → neighbour ${i}`).to.be.below(0.5));
        expect(b.innerText.trim()).to.equal(b.dataset.page);
      }
      el.remove();
    });
  }
});
