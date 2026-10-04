import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, emulateMedia } from '@web/test-runner-commands';
import './td-tabs.js';

// v0.36.0 (plan QĐ 16–17, M4) — the bold active label never shifts text: every label reserves the width of its
// semibold rendering (`::after { content: attr(data-label) }`, 0 px tall, hidden), so switching the active tab changes
// neither the label box nor the neighbours — equal-slot mode and overflow mode (8 long tabs), Chromium / Firefox / WebKit.
// Real signals only (document.fonts.ready, rAF); a real mouse click for one switch.
// DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 4) { for (let i = 0; i < n; i++) await raf(); }
const host = document.createElement('div');
document.body.appendChild(host);
beforeEach(async () => { await emulateMedia({ reducedMotion: 'reduce' }); });
afterEach(async () => {
  host.innerHTML = '';
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
});

const SHORT5 = ['Tổng quan', 'Đơn hàng', 'Khách hàng', 'Sản phẩm', 'Báo cáo'].map((label, i) => ({ id: `s${i}`, label }));
const LONG8 = [
  'Thông tin chung của sản phẩm', 'Thuộc tính và biến thể', 'Hình ảnh minh hoạ', 'Giá bán và khuyến mãi',
  'Tồn kho theo chi nhánh', 'Vận chuyển và đóng gói', 'Tối ưu công cụ tìm kiếm', 'Lịch sử thay đổi',
].map((label, i) => ({ id: `l${i}`, label }));

async function mount(width, tabs) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  const el = document.createElement('td-tabs');
  el.tabs = tabs;
  wrap.appendChild(el);
  await settle();
  return el;
}
const btns = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const list = (el) => el.querySelector('.td-tabs');
/** label box + tab x of every tab, in list coordinates (independent of scroll) */
function boxes(el) {
  const l = list(el);
  const lx = l.getBoundingClientRect().left - l.scrollLeft;
  return btns(el).map((b) => {
    const lab = b.querySelector('.td-tabs__label').getBoundingClientRect();
    return { w: lab.width, x: lab.left - lx, tabX: b.getBoundingClientRect().left - lx, tabW: b.getBoundingClientRect().width };
  });
}
function same(a, b, ctx) {
  a.forEach((r, i) => {
    for (const k of ['w', 'x', 'tabX', 'tabW']) expect(Math.abs(r[k] - b[i][k]), `${ctx} tab ${i} ${k}: ${r[k]} vs ${b[i][k]}`).to.be.below(0.5);
  });
}

for (const [mode, width, tabs] of [['equal slots', 900, SHORT5], ['overflow', 420, LONG8]]) {
  describe(`v0.36.0 td-tabs bold label reservation — ${mode}`, () => {
    it('every tab: label width + x identical whether active or not; neighbours never move', async () => {
      const el = await mount(width, tabs);
      expect(list(el).hasAttribute('data-overflow'), 'mode').to.equal(mode === 'overflow');
      const ref = boxes(el);
      for (const t of tabs) {
        el.setAttribute('active-tab', t.id);
        await settle(2);
        same(boxes(el), ref, `${mode} active=${t.id}`);
      }
    });

    it('a real click switches without moving any label', async () => {
      const el = await mount(width, tabs);
      const ref = boxes(el);
      const b = btns(el)[1];
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      await settle(2);
      const before = boxes(el);
      const r = b.getBoundingClientRect();
      await sendMouse({ type: 'click', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
      await settle(2);
      expect(b.getAttribute('aria-selected')).to.equal('true');
      same(boxes(el), before, `${mode} click`);
      same(before, ref, `${mode} before click`);
    });

    it('the overflow measurement is the same with and without data-measuring', async () => {
      const el = await mount(width, tabs);
      const widths = () => btns(el).map((b) => b.getBoundingClientRect().width);
      const l = list(el);
      l.setAttribute('data-measuring', '');
      const measuring = Math.max(...widths());
      const natural = btns(el).map((b) => { b.style.setProperty('flex', '0 0 auto'); return b.getBoundingClientRect().width; });
      btns(el).forEach((b) => b.style.removeProperty('flex'));
      l.removeAttribute('data-measuring');
      expect(Math.abs(measuring - Math.max(...natural))).to.be.below(0.5);
    });

    it('a11y: name = label once; the reservation is not text (innerText), carries data-label, aria-hidden visuals', async () => {
      const el = await mount(width, tabs);
      btns(el).forEach((b, i) => {
        const lab = b.querySelector('.td-tabs__label');
        expect(lab.getAttribute('data-label')).to.equal(tabs[i].label);
        expect(b.innerText.trim()).to.equal(tabs[i].label);
        expect(b.textContent.trim()).to.equal(tabs[i].label);
        const after = getComputedStyle(lab, '::after');
        expect(after.visibility).to.equal('hidden');
        expect(parseFloat(after.height) || 0).to.equal(0);
      });
    });
  });
}

describe('v0.36.0 td-tabs — data-label escaping', () => {
  it('a label with quotes / markup is an attribute value, never markup', async () => {
    const el = await mount(600, [{ id: 'x', label: '"><img src=x onerror="window.__tabsPwned=1">' }, { id: 'y', label: 'B' }]);
    expect(el.querySelector('img')).to.equal(null);
    expect(el.querySelector('.td-tabs__label').getAttribute('data-label')).to.equal('"><img src=x onerror="window.__tabsPwned=1">');
    expect(window.__tabsPwned).to.equal(undefined);
  });
});
