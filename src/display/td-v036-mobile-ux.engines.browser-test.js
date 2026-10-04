import { expect } from '@esm-bundle/chai';
import './td-media-grid.js';
import '../form/td-repeater.js';
import '../form/td-input-field.js';
import '../form/td-number-input.js';
import { TdMenu } from '../feedback/td-menu.js';

// v0.36.0 mobile UX pass (plan QĐ 63–65) — measured in fixed-width wrappers (container behaviour), Chromium + Firefox +
// WebKit; waits on real signals (rAF-polled layout), never fixed sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
const root = document.createElement('div');
document.body.appendChild(root);
afterEach(() => { TdMenu.close(); root.innerHTML = ''; });

/** a fixed-width wrapper (CSSOM: the test page is not CSP-gated, but keep markup attribute-free) */
function box(width) {
  const d = document.createElement('div');
  d.style.width = `${width}px`;
  root.appendChild(d);
  return d;
}
const tile = (i) => `<div data-td-media-item data-id="m${i}"><button type="button" data-td-media-open aria-label="m${i}">`
  + '<img src="/test/fixtures/1.svg" alt="" width="120" height="80"></button></div>';

describe('v0.36.0 mobile UX', () => {
  for (const w of [294, 324]) {
    it(`QĐ 64: a ${w}px media grid shows 2 tiles a row (never one column on a phone)`, async () => {
      box(w).innerHTML = `<td-media-grid label="L">${[1, 2, 3, 4].map(tile).join('')}</td-media-grid>`;
      const g = root.querySelector('td-media-grid');
      await until(() => g.querySelectorAll('.td-media-grid__tick').length === 4, 3000, 'grid');
      await raf();
      const tops = [...g.querySelectorAll('[data-td-media-item]')].map((i) => Math.round(i.getBoundingClientRect().top));
      expect(tops[0]).to.equal(tops[1]);
      expect(tops[2]).to.be.above(tops[1]);
    });
  }

  it('QĐ 64: a wide grid keeps the 160px minimum (5 columns at 900px)', async () => {
    box(900).innerHTML = `<td-media-grid label="L">${[1, 2, 3, 4, 5, 6].map(tile).join('')}</td-media-grid>`;
    const g = root.querySelector('td-media-grid');
    await until(() => g.querySelectorAll('.td-media-grid__tick').length === 6, 3000, 'grid');
    const tops = [...g.querySelectorAll('[data-td-media-item]')].map((i) => Math.round(i.getBoundingClientRect().top));
    expect(new Set(tops.slice(0, 5)).size).to.equal(1);
  });

  it('QĐ 63: at 328px the tool cluster shares the quantity line — a row ≤ 120px', async () => {
    box(328).innerHTML = '<td-repeater label="Hộp" min-rows="1"><div data-td-row class="rep-row">'
      + '<td-input-field aria-label="Tên" value="Sạc 20W"></td-input-field>'
      + '<td-number-input aria-label="Số lượng" value="1"></td-number-input>'
      + '</div></td-repeater>';
    const row = root.querySelector('.rep-row');
    Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' });
    Object.assign(row.querySelector('td-input-field').style, { flex: '1 1 14rem', minWidth: '0' });
    Object.assign(row.querySelector('td-number-input').style, { flex: '0 1 8rem', minWidth: '0' });
    const rep = root.querySelector('td-repeater');
    await until(() => rep.querySelector('.td-repeater__actions') && rep.querySelector('td-number-input input'), 3000, 'repeater');
    await raf();
    const r = rep.querySelector('[data-td-row]');
    expect(r.getBoundingClientRect().height, 'row height').to.be.at.most(120);
    const qty = rep.querySelector('td-number-input').getBoundingClientRect();
    const tools = rep.querySelector('.td-repeater__actions').getBoundingClientRect();
    expect(Math.abs((qty.top + qty.height / 2) - (tools.top + tools.height / 2)), 'same line').to.be.below(16);
  });

  it('QĐ 65: a 1–3 character menu hint is marked as a keyboard hint (hidden on touch screens by CSS)', async () => {
    const b = document.createElement('button');
    b.textContent = 'M';
    root.appendChild(b);
    TdMenu.open(b, [{ label: 'Sửa', hint: 'E' }, { label: 'Xoá', hint: 'Không hoàn tác được' }]);
    await until(() => document.querySelector('.td-menu__hint'), 3000, 'menu');
    const hints = [...document.querySelectorAll('.td-menu__hint')];
    expect(hints[0].classList.contains('td-menu__hint--kbd')).to.equal(true);
    expect(hints[1].classList.contains('td-menu__hint--kbd')).to.equal(false);
  });
});
