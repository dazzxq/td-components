import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import '../form/td-button.js';
import '../feedback/td-alert.js';

// v0.36.0 (plan QĐ 18–26, M5) — rendered solid semantic colours in Chromium, Firefox AND WebKit: semantic buttons (rest +
// real hover), badges (solid fill + 1px edge + soft shadow; outline / stamp = page ink, no shadow), alerts (light body,
// 4px solid inline-start bar, solid icon). Real signals only (rAF; transitions off through reduced motion).
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
      await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
      // a loaded Firefox runner can apply :hover a few frames after the move (CI flake): wait for the real signal, bounded
      for (let i = 0; i < 60 && !b.matches(':hover'); i++) await raf();
      await raf();
      cs = getComputedStyle(b);
      expect(b.matches(':hover')).to.equal(true);
      expect(cs.backgroundColor).to.equal(rgb(hover));
    });
  }
});

describe('v0.36.0 badges (QĐ 21–22)', () => {
  const BORDER = { neutral: '#ababac', accent: '#99a4b2', success: '#0f5a2b', danger: '#9a1b1b', warning: '#ac6f08', info: '#1a45a5' };
  const INK = { success: '#15803d', danger: '#b91c1c', warning: '#b45309', info: '#2563eb' };
  for (const [v, border] of Object.entries(BORDER)) {
    it(`${v}: 1px edge ${border} + soft shadow; outline / stamp: no shadow, page ink`, () => {
      host.insertAdjacentHTML('beforeend', `<span class="td-badge td-badge--${v}">Đã duyệt</span>`
        + `<span class="td-badge td-badge--${v} td-badge--outline">A</span><span class="td-badge td-badge--${v} td-badge--stamp">B</span>`);
      const [soft, outline, stamp] = host.querySelectorAll('.td-badge');
      const cs = getComputedStyle(soft);
      expect(cs.borderTopWidth).to.equal('1px');
      expect(cs.borderTopStyle).to.equal('solid');
      expect(cs.borderTopColor).to.equal(rgb(border));
      expect(cs.boxShadow).to.match(/rgba\(0, 0, 0, 0\.12\) 0px 1px 2px/);
      if (SOLID[v]) {
        expect(cs.backgroundColor).to.equal(rgb(SOLID[v][0]));
        expect(cs.color).to.equal(rgb(SOLID[v][1]));
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

  it('a badge on a fill of its own colour still shows an edge (border ≠ fill)', () => {
    host.insertAdjacentHTML('beforeend', '<div class="probe"><span class="td-badge td-badge--success">Xong</span></div>');
    const probe = host.querySelector('.probe');
    probe.style.setProperty('background', '#15803d');
    const cs = getComputedStyle(host.querySelector('.td-badge'));
    expect(cs.borderTopColor).to.not.equal(getComputedStyle(probe).backgroundColor);
  });
});

describe('v0.36.0 alerts (QĐ 26)', () => {
  const ACCENT = { info: '#2563eb', success: '#15803d', warning: '#d97706', danger: '#dc2626' };
  const ICON = { info: '#2563eb', success: '#15803d', warning: '#b45309', danger: '#dc2626' };
  const BORDER = { info: '#93c5fd', success: '#86efac', warning: '#fcd34d', danger: '#fca5a5' };
  const BG = { info: '#eff6ff', success: '#f0fdf4', warning: '#fffbeb', danger: '#fef2f2' };
  for (const v of Object.keys(ACCENT)) {
    it(`${v}: light body, 4px solid inline-start bar, solid icon, ~300 border`, async () => {
      host.insertAdjacentHTML('beforeend', `<td-alert variant="${v}" heading="Tiêu đề">Nội dung</td-alert>`);
      await raf();
      const a = host.querySelector('.td-alert');
      const cs = getComputedStyle(a);
      expect(cs.backgroundColor).to.equal(rgb(BG[v]));
      expect(cs.borderLeftWidth).to.equal('4px');
      expect(cs.borderLeftColor).to.equal(rgb(ACCENT[v]));
      expect(cs.borderTopWidth).to.equal('1px');
      expect(cs.borderTopColor).to.equal(rgb(BORDER[v]));
      expect(getComputedStyle(a.querySelector('.td-alert__icon')).color).to.equal(rgb(ICON[v]));
    });
  }

  it('RTL: the bar follows inline-start (right edge)', async () => {
    host.insertAdjacentHTML('beforeend', '<div dir="rtl"><td-alert variant="danger">Lỗi</td-alert></div>');
    await raf();
    const cs = getComputedStyle(host.querySelector('.td-alert'));
    expect(cs.borderRightWidth).to.equal('4px');
    expect(cs.borderLeftWidth).to.equal('1px');
  });
});
