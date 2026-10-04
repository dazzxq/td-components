// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 13, ADR 0014 §5) — TdToast safe area in Chromium, Firefox
// AND WebKit: `top: max(--td-toast-top, safe-area-inset-top + 8px)` (a site `auto` stays auto — max(auto, …) is invalid
// at computed time), the symmetric bottom, and the horizontal safe-area inset at EVERY width on the anchored side.
// env() cannot be faked (it is 0 here) → the floors and the placement are measured, and the rule text is read from the
// stylesheet (cssRules) to prove env(safe-area-inset-left / -right) sit in the inline offsets outside any width query.
// Real signals only (MutationObserver, animations finished, rAF) — no fixed sleeps before geometry.
import { expect } from '@esm-bundle/chai';
import { setViewport, emulateMedia } from '@web/test-runner-commands';
import { TdToast } from './td-toast.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const root = document.documentElement;
const TOKENS = ['--td-toast-top', '--td-toast-bottom', '--td-toast-inline-start', '--td-toast-inline-end',
  '--td-toast-shift', '--td-toast-align'];
const stack = () => document.querySelector('.td-toasts');

/** show one toast and resolve once it is open with every transition finished */
async function showOne(msg = 'Đã lưu thay đổi của bạn') {
  TdToast.show(msg, 'success', 0);
  await new Promise((resolve) => {
    const done = () => document.querySelector('.td-toast[data-state="open"]');
    if (done()) { resolve(); return; }
    const mo = new MutationObserver(() => { if (done()) { mo.disconnect(); resolve(); } });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  });
  await raf();
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  await raf();
  return stack().getBoundingClientRect();
}

async function clearAll() {
  TdToast._activeToasts.slice().forEach((t) => t._removeToast());
  for (let i = 0; i < 120 && document.querySelector('.td-toast'); i++) await raf();
}

beforeEach(async () => { await emulateMedia({ reducedMotion: 'reduce' }); });
afterEach(async () => {
  await clearAll();
  for (const t of TOKENS) root.style.removeProperty(t);
  await emulateMedia({ reducedMotion: 'no-preference' });
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.34.0 TdToast — safe area (top / bottom floors)', () => {
  it('(a) default tokens: top = max(5rem, inset + 8px) = 80px', async () => {
    await setViewport({ width: 1280, height: 800 });
    const r = await showOne();
    expect(Math.abs(r.top - 80) < 0.5, `top ${r.top}`).to.equal(true);
  });

  it('(b) a site --td-toast-top: 0px still keeps the 8px floor', async () => {
    await setViewport({ width: 1280, height: 800 });
    root.style.setProperty('--td-toast-top', '0px');
    const r = await showOne();
    expect(Math.abs(r.top - 8) < 0.5, `top ${r.top}`).to.equal(true);
  });

  it('(c) --td-toast-top: auto + --td-toast-bottom: 1.5rem → bottom placement (top stays auto)', async () => {
    await setViewport({ width: 1280, height: 800 });
    root.style.setProperty('--td-toast-top', 'auto');
    root.style.setProperty('--td-toast-bottom', '1.5rem');
    const r = await showOne();
    expect(Math.abs(r.bottom - (800 - 24)) < 0.5, `bottom ${r.bottom}`).to.equal(true);
    expect(r.top > 400, `top ${r.top} (auto, not pinned at the top)`).to.equal(true);
  });

  it('(c2) --td-toast-bottom: 0px → the 8px floor at the bottom too', async () => {
    await setViewport({ width: 1280, height: 800 });
    root.style.setProperty('--td-toast-top', 'auto');
    root.style.setProperty('--td-toast-bottom', '0px');
    const r = await showOne();
    expect(Math.abs(r.bottom - (800 - 8)) < 0.5, `bottom ${r.bottom}`).to.equal(true);
  });
});

describe('v0.34.0 TdToast — placement inside the viewport', () => {
  const long = 'Đơn hàng #A-20481 đã được cập nhật trạng thái giao hàng thành công cho khách hàng';
  for (const w of [390, 1280]) {
    it(`${w}px: default (end) placement is fully inside the viewport`, async () => {
      await setViewport({ width: w, height: 800 });
      const r = await showOne(long);
      expect(r.left >= -0.5 && r.right <= w + 0.5 && r.top >= -0.5 && r.bottom <= 800.5, `stack ${r.left}–${r.right}`)
        .to.equal(true);
      if (w === 1280) expect(Math.abs(r.right - (1280 - 16)) < 0.5, `end offset ${r.right}`).to.equal(true);
    });

    it(`${w}px: centred placement (inline-start 50%, shift −50%) is fully inside and centred`, async () => {
      await setViewport({ width: w, height: 800 });
      root.style.setProperty('--td-toast-inline-end', 'auto');
      root.style.setProperty('--td-toast-inline-start', '50%');
      root.style.setProperty('--td-toast-shift', '-50%');
      root.style.setProperty('--td-toast-align', 'center');
      const r = await showOne(long);
      expect(r.left >= -0.5 && r.right <= w + 0.5, `stack ${r.left}–${r.right}`).to.equal(true);
      expect(Math.abs((r.left + r.right) / 2 - w / 2) < 1, `centre ${(r.left + r.right) / 2}`).to.equal(true);
    });
  }
});

describe('v0.34.0 TdToast — horizontal safe area at every width (rule text)', () => {
  /** .td-toasts style rules NOT nested in a width @media (@layer / @supports are fine) */
  function stackRules() {
    const out = [];
    const walk = (rules, inWidthMedia) => {
      for (const rule of rules) {
        if (rule.cssRules && !(rule.selectorText)) {
          const isWidth = rule.media && /width/.test(rule.media.mediaText);
          walk(rule.cssRules, inWidthMedia || !!isWidth);
        } else if (rule.selectorText && /(^|,\s*)\.td-toasts(:dir\(ltr\))?\s*$/.test(rule.selectorText) && !inWidthMedia) {
          out.push(rule);
        }
      }
    };
    walk(link.sheet.cssRules, false);
    return out;
  }
  const decl = (rules, prop) => rules.map((r) => r.style.getPropertyValue(prop)).filter(Boolean);

  it('env(safe-area-inset-left / -right) are in the inline offsets outside any width media query', () => {
    const rules = stackRules();
    expect(rules.length > 0, 'top-level .td-toasts rules').to.equal(true);
    const start = decl(rules, 'inset-inline-start').join(' | ');
    const end = decl(rules, 'inset-inline-end').join(' | ');
    expect(/safe-area-inset-left/.test(start), `inset-inline-start: ${start}`).to.equal(true);
    expect(/safe-area-inset-right/.test(end), `inset-inline-end: ${end}`).to.equal(true);
    const top = decl(rules, 'top').join(' | ');
    const bottom = decl(rules, 'bottom').join(' | ');
    expect(/max\(/.test(top) && /safe-area-inset-top/.test(top), `top: ${top}`).to.equal(true);
    expect(/max\(/.test(bottom) && /safe-area-inset-bottom/.test(bottom), `bottom: ${bottom}`).to.equal(true);
  });
});

describe('v0.34.0 TdToast — RTL (dir="rtl" document): insets follow the physical side of each placement', () => {
  afterEach(() => { root.removeAttribute('dir'); });

  /** top-level `.td-toasts:dir(rtl)` rules (outside width queries) */
  function rtlRules() {
    const out = [];
    const walk = (rules, inWidthMedia) => {
      for (const rule of rules) {
        if (rule.cssRules && !rule.selectorText) {
          walk(rule.cssRules, inWidthMedia || !!(rule.media && /width/.test(rule.media.mediaText)));
        } else if (rule.selectorText && /^\.td-toasts:dir\(rtl\)$/.test(rule.selectorText.trim()) && !inWidthMedia) {
          out.push(rule);
        }
      }
    };
    walk(link.sheet.cssRules, false);
    return out;
  }

  it('the :dir(rtl) rule swaps the insets (inline-start ↔ right, inline-end ↔ left)', () => {
    const rules = rtlRules();
    expect(rules.length, 'one top-level .td-toasts:dir(rtl) rule').to.equal(1);
    const st = rules[0].style;
    const start = st.getPropertyValue('inset-inline-start');
    const end = st.getPropertyValue('inset-inline-end');
    expect(/safe-area-inset-right/.test(start), start).to.equal(true);
    expect(/safe-area-inset-left/.test(end), end).to.equal(true);
  });

  it('end placement (default) anchors to the physical LEFT in RTL; start placement to the physical RIGHT', async () => {
    await setViewport({ width: 1280, height: 800 });
    root.setAttribute('dir', 'rtl');
    let r = await showOne();
    expect(Math.abs(r.left - 16) < 0.5, `rtl end: left ${r.left}`).to.equal(true);
    await clearAll();
    root.style.setProperty('--td-toast-inline-start', '1rem');
    root.style.setProperty('--td-toast-inline-end', 'auto');
    root.style.setProperty('--td-toast-align', 'flex-start');
    r = await showOne();
    const vw = document.documentElement.clientWidth;
    expect(Math.abs(vw - r.right - 16) < 0.5, `rtl start: right gap ${vw - r.right}`).to.equal(true);
    expect(r.left >= 0).to.equal(true);
  });

  it('xs (390px) in RTL: still one full-width column inside the gutters', async () => {
    await setViewport({ width: 390, height: 844 });
    root.setAttribute('dir', 'rtl');
    const r = await showOne();
    const vw = document.documentElement.clientWidth;
    expect(Math.abs(r.left - 16) < 0.5 && Math.abs(vw - r.right - 16) < 0.5, `${r.left}..${r.right} / ${vw}`).to.equal(true);
  });
});
