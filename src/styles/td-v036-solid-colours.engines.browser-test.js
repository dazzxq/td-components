import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import '../form/td-button.js';
import '../feedback/td-alert.js';

// v0.36.0 (plan QĐ 18–26, M5) — rendered solid semantic colours in Chromium, Firefox AND WebKit: semantic buttons (rest +
// real hover), badges (solid fill + 1px edge + soft shadow; outline / stamp = page ink, no shadow), alerts (light body, solid
// icon; v0.62.0 supersedes the 4px inline-start bar of QĐ 26 with a 1px hairline on four sides + an icon tile, ADR 0033). Real signals only (rAF; transitions off through reduced motion).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const raf = () => new Promise((r) => requestAnimationFrame(r));
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(async () => { host.innerHTML = ''; await resetMouse(); });
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const SOLID = {
  success: ['#15803d', '#ffffff', '#166534'],
  danger: ['#dc2626', '#ffffff', '#b91c1c'],
  warning: ['#f59e0b', '#18181b', '#d97706'],
  info: ['#2563eb', '#ffffff', '#1d4ed8'],
};

describe('v0.36.0 solid semantic buttons (QĐ 19, 24)', () => {
  for (const [v, [bg, fg, hover]] of Object.entries(SOLID)) {
    it(`${v}: solid fill + ${fg === '#18181b' ? 'dark' : 'white'} label; real hover → the darker solid step`, async () => {
      host.insertAdjacentHTML('beforeend', `<td-button variant="${v}" label="Lưu"></td-button>`);
      const b = host.querySelector('.td-btn');
      b.style.setProperty('transition', 'none');
      let cs = getComputedStyle(b);
      expect(cs.backgroundColor).to.equal(rgb(bg));
      expect(cs.color).to.equal(rgb(fg));
      expect(cs.borderTopColor).to.equal(rgb(hover));
      const r = b.getBoundingClientRect();
      // two moves (edge → centre): a move onto the exact point the pointer already rests on fires no mouseover in Firefox
      await sendMouse({ type: 'move', position: [Math.round(r.x + 2), Math.round(r.y + 2)] });
      await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
      for (let i = 0; i < 30 && !b.matches(':hover'); i++) await raf();
      await raf();
      cs = getComputedStyle(b);
      expect(b.matches(':hover')).to.equal(true);
      expect(cs.backgroundColor).to.equal(rgb(hover));
    });
  }
});

describe('v0.76.0 badges (tinted; supersedes the v0.36.0 solid badges, QĐ 21–22)', () => {
  const TINT = { neutral: ['#e4e4e7', '#3f3f46'], accent: ['#cfe0fd', '#1e3f8f'], success: ['#bbf7d0', '#166534'], danger: ['#fecaca', '#991b1b'], warning: ['#fed7aa', '#9a3412'], info: ['#bfdbfe', '#1e40af'] };
  const INK = { success: '#15803d', danger: '#b91c1c', warning: '#b45309', info: '#2563eb' };
  for (const [v, [bg, fg]] of Object.entries(TINT)) {
    it(`${v}: tinted fill + label, transparent 1px edge + soft shadow; outline / stamp: no shadow, page ink`, () => {
      host.insertAdjacentHTML('beforeend', `<span class="td-badge td-badge--${v}">Đã duyệt</span>`
        + `<span class="td-badge td-badge--${v} td-badge--outline">A</span><span class="td-badge td-badge--${v} td-badge--stamp">B</span>`);
      const [soft, outline, stamp] = host.querySelectorAll('.td-badge');
      const cs = getComputedStyle(soft);
      expect(cs.borderTopWidth).to.equal('1px');
      expect(cs.borderTopStyle).to.equal('solid');
      expect(cs.borderTopColor).to.equal('rgba(0, 0, 0, 0)');
      expect(cs.boxShadow).to.match(/rgba\(0, 0, 0, 0\.1\) 0px 1px 2px/);
      expect(cs.boxShadow).to.match(/0px 2px 6px -1px/);
      if (v === 'accent') {
        // follows the site accent through color-mix() (the static #cfe0fd / #1e3f8f only where color-mix is missing)
        const probe = document.createElement('span');
        host.appendChild(probe);
        probe.style.setProperty('background-color', 'var(--td-badge-accent-bg)');
        probe.style.setProperty('color', 'var(--td-badge-accent-fg)');
        expect(cs.backgroundColor).to.equal(getComputedStyle(probe).backgroundColor);
        expect(cs.color).to.equal(getComputedStyle(probe).color);
      } else {
        expect(cs.backgroundColor).to.equal(rgb(bg));
        expect(cs.color).to.equal(rgb(fg));
      }
      for (const b of [outline, stamp]) {
        const s = getComputedStyle(b);
        expect(s.boxShadow).to.equal('none');
        expect(s.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
        if (INK[v]) expect(s.color).to.equal(rgb(INK[v]));
        expect(s.borderTopColor).to.equal(s.color); // currentColor edge
      }
    });
  }
});

describe('v0.36.0 alerts (QĐ 26) — v0.62.0: no side stripe (ADR 0033)', () => {
  const ICON = { info: '#2563eb', success: '#15803d', warning: '#b45309', danger: '#dc2626' };
  const BORDER = { info: '#93c5fd', success: '#86efac', warning: '#fcd34d', danger: '#fca5a5' };
  const BG = { info: '#eff6ff', success: '#f0fdf4', warning: '#fffbeb', danger: '#fef2f2' };
  for (const v of Object.keys(ICON)) {
    it(`${v}: light body, 1px ~300 hairline on all four sides (no stripe), solid icon on a tinted tile`, async () => {
      host.insertAdjacentHTML('beforeend', `<td-alert variant="${v}" heading="Tiêu đề">Nội dung</td-alert>`);
      await raf();
      const a = host.querySelector('.td-alert');
      const cs = getComputedStyle(a);
      expect(cs.backgroundColor).to.equal(rgb(BG[v]));
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        expect(cs[`border${side}Width`], `${v} ${side} width`).to.equal('1px');
        expect(cs[`border${side}Color`], `${v} ${side} colour`).to.equal(rgb(BORDER[v]));
      }
      const icon = getComputedStyle(a.querySelector('.td-alert__icon'));
      expect(icon.color).to.equal(rgb(ICON[v]));
      expect(icon.backgroundColor).to.not.equal(cs.backgroundColor); // the tile (icon colour mixed 12 % into the fill)
      expect(icon.backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
    });
  }
});
