import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, emulateMedia, setViewport } from '@web/test-runner-commands';
import { tdTooltip, TdTooltip } from './td-tooltip.js';
import { LAYERS, register } from '../utils/layers.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const same = (a, b) => a === b; // never hand DOM nodes to chai deep asserts
const tip = () => tdTooltip.tooltip;
const shown = () => !!tip() && !tip().hidden && tdTooltip.isVisible;
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const describedBy = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);

beforeEach(() => { tdTooltip.init(); });
afterEach(async () => {
  tdTooltip.hide();
  host.innerHTML = '';
  host.removeAttribute('class');
  document.documentElement.removeAttribute('data-td-theme');
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await setViewport({ width: 800, height: 600 });
});

/* WCAG contrast helpers (computed colours, alpha composited over the page) */
function rgba(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const lum = ({ r, g, b }) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function pageBg() {
  const probe = document.createElement('div');
  probe.style.setProperty('background-color', 'var(--td-color-bg)');
  host.appendChild(probe);
  const c = rgba(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return c;
}

describe('batch 3 — td-tooltip naming policy (D15)', () => {
  it('named by content: title removed, tooltip becomes a description while shown', () => {
    const b = mount('<button type="button" data-tooltip="Lưu tài liệu hiện tại" title="Lưu">Lưu</button>');
    tdTooltip.show(b);
    expect(b.hasAttribute('title')).to.equal(false);
    expect(b.hasAttribute('aria-label')).to.equal(false);
    expect(b.hasAttribute('data-td-tooltip-named')).to.equal(false);
    expect(describedBy(b)).to.deep.equal(['td-tooltip']);
    tdTooltip.hide();
    expect(b.hasAttribute('aria-describedby')).to.equal(false);
  });

  it('description skipped when the tooltip text equals the name', () => {
    const b = mount('<button type="button" data-tooltip="Lưu">  Lưu </button>');
    tdTooltip.show(b);
    expect(shown()).to.equal(true);
    expect(b.hasAttribute('aria-describedby')).to.equal(false);
  });

  it('name from a descendant img[alt] / svg[aria-label] counts (title removed)', () => {
    const a = mount('<button type="button" data-tooltip="x" title="t"><img alt="Xoá" src="data:,"></button>');
    const b = mount('<a href="#" data-tooltip="x" title="t"><svg aria-label="Sửa"></svg></a>');
    tdTooltip.show(a);
    tdTooltip.show(b);
    expect(a.hasAttribute('title') || b.hasAttribute('title')).to.equal(false);
    expect(a.hasAttribute('aria-label') || b.hasAttribute('aria-label')).to.equal(false);
  });

  it('generic focusable div is untouched (title kept, no aria-label) but still described', () => {
    const d = mount('<div tabindex="0" data-tooltip="Mô tả" title="Tiêu đề"></div>');
    tdTooltip.show(d);
    expect(d.getAttribute('title')).to.equal('Tiêu đề');
    expect(d.hasAttribute('aria-label')).to.equal(false);
    expect(shown()).to.equal(true);
    expect(describedBy(d)).to.deep.equal(['td-tooltip']);
  });

  it('input[type=button][value] is named by its value (title removed)', () => {
    const i = mount('<input type="button" value="Gửi" title="Gửi đi" data-tooltip="Gửi biểu mẫu">');
    tdTooltip.show(i);
    expect(i.hasAttribute('title')).to.equal(false);
    expect(i.hasAttribute('aria-label')).to.equal(false);
    expect(describedBy(i)).to.deep.equal(['td-tooltip']);
  });

  it('input[type=submit] without value is named by the UA default (title removed)', () => {
    const i = mount('<input type="submit" title="Gửi" data-tooltip="Gửi biểu mẫu">');
    tdTooltip.show(i);
    expect(i.hasAttribute('title')).to.equal(false);
    expect(i.hasAttribute('aria-label')).to.equal(false);
  });

  it('empty aria-label / unresolvable aria-labelledby are treated as absent (title → aria-label)', () => {
    const b = mount('<button type="button" aria-label=" " aria-labelledby="nope" title="Xoá mục" data-tooltip="Xoá mục đã chọn">'
      + '<svg aria-hidden="true"></svg></button>');
    tdTooltip.show(b);
    expect(b.getAttribute('aria-label')).to.equal('Xoá mục');
    expect(b.getAttribute('data-td-tooltip-named')).to.equal('title');
    expect(b.hasAttribute('title')).to.equal(false);
    expect(describedBy(b)).to.deep.equal(['td-tooltip']); // text differs from the name
  });

  it('resolvable aria-labelledby names the trigger (title removed)', () => {
    mount('<span id="lbl-x">Đóng</span>');
    const b = mount('<button type="button" aria-labelledby="lbl-x" title="t" data-tooltip="Đóng hộp thoại"></button>');
    tdTooltip.show(b);
    expect(b.hasAttribute('title')).to.equal(false);
    expect(b.hasAttribute('aria-label')).to.equal(false);
  });

  it('unnamed without title: data-tooltip becomes aria-label + console.warn; no self-description', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      const b = mount('<button type="button" data-tooltip="Tải xuống"><svg aria-hidden="true"></svg></button>');
      tdTooltip.show(b);
      expect(b.getAttribute('aria-label')).to.equal('Tải xuống');
      expect(b.getAttribute('data-td-tooltip-named')).to.equal('tooltip');
      expect(b.hasAttribute('aria-describedby')).to.equal(false); // equal to the name
      expect(warns.some((w) => w.includes('td-tooltip'))).to.equal(true);
    } finally {
      console.warn = orig;
    }
  });

  it('role override (<a href role="presentation">) is untouched', () => {
    const a = mount('<a href="#" role="presentation" title="Tiêu đề" data-tooltip="Mô tả">liên kết</a>');
    tdTooltip.show(a);
    expect(a.getAttribute('title')).to.equal('Tiêu đề');
    expect(a.hasAttribute('aria-label')).to.equal(false);
    expect(describedBy(a)).to.deep.equal(['td-tooltip']);
  });

  it('explicit role=button element is supported (name from content)', () => {
    const d = mount('<div role="button" tabindex="0" title="t" data-tooltip="Mở">Mở rộng</div>');
    tdTooltip.show(d);
    expect(d.hasAttribute('title')).to.equal(false);
    expect(d.hasAttribute('aria-label')).to.equal(false);
  });

  it('empty <button> named by an external <label for> → named (title removed, no aria-label)', () => {
    mount('<label for="tt-lbl-btn">Tìm kiếm</label>');
    const b = mount('<button type="button" id="tt-lbl-btn" title="Tìm" data-tooltip="Tìm trong trang"></button>');
    tdTooltip.show(b);
    expect(b.hasAttribute('title')).to.equal(false);
    expect(b.hasAttribute('aria-label')).to.equal(false);
    expect(describedBy(b)).to.deep.equal(['td-tooltip']);
  });

  it('input[type=image][value][title] without alt → unnamed: title moved to aria-label, value ignored', () => {
    const i = mount('<input type="image" src="data:," value="Giá trị" title="Tìm kiếm" data-tooltip="Tìm trong trang">');
    tdTooltip.show(i);
    expect(i.getAttribute('aria-label')).to.equal('Tìm kiếm');
    expect(i.getAttribute('data-td-tooltip-named')).to.equal('title');
    expect(i.hasAttribute('title')).to.equal(false);
  });

  it('policy is applied at init and to triggers added later (MutationObserver), before any show', async () => {
    const b = mount('<button type="button" title="Chia sẻ" data-tooltip="Chia sẻ liên kết"><svg aria-hidden="true"></svg></button>');
    await wait(0);
    expect(b.getAttribute('aria-label')).to.equal('Chia sẻ');
    expect(b.hasAttribute('title')).to.equal(false);
    const d = mount('<div data-tooltip="x" title="giữ nguyên"></div>');
    await wait(0);
    expect(d.getAttribute('title')).to.equal('giữ nguyên');
  });
});

describe('batch 3 — td-tooltip DOM, linking, singleton', () => {
  it('role=tooltip singleton with the content span; arrow is a pseudo-element (no child); strong glass classes', () => {
    const a = mount('<button type="button" data-tooltip="A">a</button>');
    const b = mount('<button type="button" data-tooltip="B">b</button>');
    tdTooltip.show(a);
    tdTooltip.show(b);
    expect(document.querySelectorAll('.td-tooltip').length).to.equal(1);
    expect(document.querySelectorAll('#td-tooltip').length).to.equal(1);
    const t = tip();
    expect(t.getAttribute('role')).to.equal('tooltip');
    expect([...t.classList].sort()).to.deep.equal(['td-glass-surface', 'td-glass-surface--strong', 'td-tooltip']);
    expect(t.querySelector('.td-tooltip-arrow, [class*="arrow"]')).to.equal(null); // no arrow element (v0.14: ::after)
    expect(getComputedStyle(t, '::after').content).to.equal('""');
    expect(t.querySelector('.td-tooltip__content').textContent).to.equal('B');
    expect(same(tdTooltip.currentElement, b)).to.equal(true);
    expect(a.hasAttribute('aria-describedby')).to.equal(false); // unlinked from the previous trigger
    expect(describedBy(b)).to.deep.equal(['td-tooltip']);
  });

  it('aria-describedby added/removed without clobbering page ids', () => {
    mount('<p id="hint-1">Gợi ý</p>');
    const b = mount('<button type="button" aria-describedby="hint-1" data-tooltip="Thêm">+ Mới</button>');
    tdTooltip.show(b);
    expect(describedBy(b)).to.deep.equal(['hint-1', 'td-tooltip']);
    tdTooltip.hide();
    expect(b.getAttribute('aria-describedby')).to.equal('hint-1');
  });

  it('text is set as text (never HTML) and follows data-tooltip changes while shown', async () => {
    const b = mount('<button type="button" data-tooltip="Một">x</button>');
    tdTooltip.show(b);
    b.setAttribute('data-tooltip', '<b>Hai</b>');
    await wait(0);
    expect(tip().querySelector('b')).to.equal(null);
    expect(tip().textContent).to.equal('<b>Hai</b>');
  });

  it('matches the golden contract test/contracts/tooltip.html', async () => {
    const html = await (await fetch('/test/contracts/tooltip.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tpl = doc.querySelector('template[data-component="td-tooltip"]');
    host.innerHTML = tpl.getAttribute('data-markup');
    const trigger = host.querySelector('[data-tooltip]');
    trigger.style.setProperty('margin', '200px');
    tdTooltip.show(trigger);
    await frames();
    const KEEP = ['id', 'role', 'hidden', 'data-state', 'data-placement', 'data-custom'];
    const shape = (el) => ({
      tag: el.localName,
      cls: [...el.classList].sort().join('.'),
      attrs: KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`),
      kids: [...el.children].map(shape),
    });
    expect(shape(tip())).to.deep.equal(shape(tpl.content.firstElementChild));
  });
});

describe('batch 3 — td-tooltip interaction (1.4.13)', () => {
  it('pointerenter (mouse) shows; pointerleave hides after the grace period', async () => {
    const b = mount('<button type="button" data-tooltip="Chuột">hover</button>');
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    await frames();
    expect(tip().getAttribute('data-state')).to.equal('open');
    await sendMouse({ type: 'move', position: [5, 590] });
    expect(shown()).to.equal(true); // grace
    await wait(200);
    expect(shown()).to.equal(false);
  });

  it('moving inside the trigger (icon ↔ text) keeps it shown', async () => {
    const b = mount('<button type="button" data-tooltip="Trong"><span class="i">★</span> <span class="t">Sao</span></button>');
    await sendMouse({ type: 'move', position: center(b.querySelector('.i')) });
    await sendMouse({ type: 'move', position: center(b.querySelector('.t')) });
    await wait(200);
    expect(shown()).to.equal(true);
  });

  it('touch does not show it, pen does (v0.36.2, ADR 0019; v0.14 showed both)', () => {
    const b = mount('<button type="button" data-tooltip="Chạm">tap</button>');
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch', bubbles: false }));
    expect(shown()).to.equal(false);
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'pen', bubbles: false }));
    expect(shown()).to.equal(true);
  });

  it('hoverable: the pointer can move onto the tooltip and it stays', async () => {
    const b = mount('<button type="button" data-tooltip="Có thể di chuột lên nội dung này">hover</button>');
    b.style.setProperty('margin', '120px 0 0 200px');
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    await frames();
    expect(getComputedStyle(tip()).pointerEvents).to.equal('auto');
    await sendMouse({ type: 'move', position: center(tip()) });
    await wait(250);
    expect(shown()).to.equal(true);
    await sendMouse({ type: 'move', position: [790, 590] });
    await wait(200);
    expect(shown()).to.equal(false);
  });

  it('keyboard focus (focusin) shows; focusout hides', async () => {
    const before = mount('<button type="button">trước</button>');
    const b = mount('<button type="button" data-tooltip="Bàn phím">phím</button>');
    mount('<button type="button">sau</button>');
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, b)).to.equal(true);
    expect(shown()).to.equal(true);
    expect(same(tdTooltip.currentElement, b)).to.equal(true);
    await sendKeys({ press: 'Tab' });
    await wait(200);
    expect(shown()).to.equal(false);
  });

  it('mouse click focus (not :focus-visible) does not keep it open after the pointer leaves', async () => {
    const b = mount('<button type="button" data-tooltip="Nhấp">click</button>');
    await sendMouse({ type: 'click', position: center(b) });
    expect(shown()).to.equal(true);
    await sendMouse({ type: 'move', position: [790, 590] });
    await wait(200);
    expect(shown()).to.equal(false);
  });

  it('Escape dismisses the tooltip (and only it) — also over a blocking modal registration', async () => {
    const dialog = mount('<div tabindex="-1"><button type="button" data-tooltip="Trong hộp thoại">x</button></div>');
    let modalEscapes = 0;
    const modal = register({ layer: LAYERS.modal, element: dialog, blocking: true, onEscape: () => { modalEscapes++; return true; } });
    try {
      const b = dialog.querySelector('button');
      b.focus();
      tdTooltip.show(b);
      expect(tip().hasAttribute('inert')).to.equal(false); // floating lease above the modal
      expect(getComputedStyle(tip()).zIndex).to.equal('510');
      await sendKeys({ press: 'Escape' });
      expect(shown()).to.equal(false);
      expect(modalEscapes).to.equal(0);
      await sendKeys({ press: 'Escape' }); // registration released on hide → now the modal gets it
      expect(modalEscapes).to.equal(1);
    } finally {
      modal.release();
    }
  });

  it('no auto-hide timer is scheduled on show (persistent)', async () => {
    const b = mount('<button type="button" data-tooltip="Bền">x</button>');
    const delays = [];
    const orig = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => { delays.push(ms || 0); return orig(fn, ms, ...rest); };
    try {
      tdTooltip.show(b);
      await frames();
    } finally {
      window.setTimeout = orig;
    }
    expect(delays.filter((d) => d >= 1000)).to.deep.equal([]);
    expect(shown()).to.equal(true);
  });

  it('hides on any scroll (v0.14) / when the trigger leaves the DOM; not shown for a hidden reference', async () => {
    const b = mount('<button type="button" data-tooltip="Cuộn">x</button>');
    tdTooltip.show(b);
    document.dispatchEvent(new Event('scroll'));
    expect(shown()).to.equal(false);
    b.style.setProperty('position', 'fixed');
    b.style.setProperty('top', '-200px');
    tdTooltip.show(b);
    expect(shown()).to.equal(false);
    b.style.removeProperty('position');
    b.style.removeProperty('top');
    tdTooltip.show(b);
    expect(shown()).to.equal(true);
    b.remove();
    await wait(0);
    expect(shown()).to.equal(false);
  });

  it('disconnect() removes every listener; init() restores them', async () => {
    const b = mount('<button type="button" data-tooltip="Tắt">x</button>');
    tdTooltip.disconnect();
    expect(document.getElementById('td-tooltip')).to.equal(null);
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    expect(tdTooltip.isVisible).to.equal(false);
    tdTooltip.init();
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    expect(shown()).to.equal(true);
  });
});

describe('batch 3 — td-tooltip placement + visuals', () => {
  it('placeFloating: centred above the trigger by default; flips below when there is no room', () => {
    const b = mount('<button type="button" data-tooltip="Trên">x</button>');
    b.style.setProperty('margin', '200px 0 0 300px');
    tdTooltip.show(b);
    const r = b.getBoundingClientRect();
    let t = tip().getBoundingClientRect();
    expect(tip().getAttribute('data-placement')).to.equal('top');
    expect(Math.abs(t.bottom + 8 - r.top)).to.be.below(1.5);
    expect(Math.abs((t.left + t.width / 2) - (r.left + r.width / 2))).to.be.below(1.5);
    tdTooltip.hide();
    b.style.setProperty('margin', '2px 0 0 300px');
    tdTooltip.show(b);
    t = tip().getBoundingClientRect();
    expect(tip().getAttribute('data-placement')).to.equal('bottom');
    expect(t.top).to.be.at.least(b.getBoundingClientRect().bottom);
  });

  it('data-tooltip-position bottom / left / right are honoured (with flip)', () => {
    const b = mount('<button type="button" data-tooltip="Vị trí" data-tooltip-position="bottom">x</button>');
    b.style.setProperty('margin', '200px 0 0 300px');
    tdTooltip.show(b);
    expect(tip().getAttribute('data-placement')).to.equal('bottom');
    b.setAttribute('data-tooltip-position', 'left');
    tdTooltip.show(b);
    const r = b.getBoundingClientRect();
    let t = tip().getBoundingClientRect();
    expect(tip().getAttribute('data-placement')).to.equal('left');
    expect(t.right).to.be.at.most(r.left);
    b.setAttribute('data-tooltip-position', 'right');
    tdTooltip.show(b);
    t = tip().getBoundingClientRect();
    expect(tip().getAttribute('data-placement')).to.equal('right');
    expect(t.left).to.be.at.least(r.right);
    b.style.setProperty('margin', '200px 0 0 2px');
    b.setAttribute('data-tooltip-position', 'left');
    tdTooltip.show(b);
    expect(tip().getAttribute('data-placement')).to.equal('right'); // flipped
  });

  it('long text wraps at max-width and never overflows a narrow viewport', async () => {
    const text = 'Đây là một đoạn chú thích rất dài để kiểm tra việc xuống dòng của tooltip khi nội dung vượt quá chiều rộng tối đa cho phép';
    const b = mount(`<button type="button" data-tooltip="${text}">x</button>`);
    b.style.setProperty('margin', '300px 0 0 300px');
    tdTooltip.show(b);
    let t = tip().getBoundingClientRect();
    expect(t.width).to.be.at.most(288.5); // 18rem
    expect(t.height).to.be.above(40); // wrapped onto several lines
    await setViewport({ width: 220, height: 600 });
    b.style.setProperty('margin', '300px 0 0 20px');
    tdTooltip.show(b);
    t = tip().getBoundingClientRect();
    expect(t.left).to.be.at.least(0);
    expect(t.right).to.be.at.most(220);
  });

  it('opaque chip (v0.20.0 minimal surfaces): no blur, solid fill, text ≥ 4.5:1 in light and dark', async () => {
    const b = mount('<button type="button" data-tooltip="Tương phản">x</button>');
    b.style.setProperty('margin', '200px 0 0 200px');
    for (const theme of [null, 'dark']) {
      if (theme) document.documentElement.setAttribute('data-td-theme', theme);
      tdTooltip.show(b);
      const cs = getComputedStyle(tip());
      expect(cs.backdropFilter).to.equal('none');
      expect(rgba(cs.backgroundColor).a).to.equal(1);
      expect(cs.backgroundImage).to.equal('none');
      const bg = over(rgba(cs.backgroundColor), pageBg());
      expect(ratio(rgba(cs.color), bg)).to.be.at.least(4.5);
      tdTooltip.hide();
    }
  });

  it('custom colour: solid chip (no blur) with auto-contrast text; explicit text colour honoured', () => {
    const b = mount('<button type="button" data-tooltip="Màu" data-tooltip-color="#fde047">x</button>');
    tdTooltip.show(b);
    let cs = getComputedStyle(tip());
    expect(tip().hasAttribute('data-custom')).to.equal(true);
    expect(cs.backgroundColor).to.equal('rgb(253, 224, 71)');
    expect(cs.backdropFilter).to.equal('none');
    expect(ratio(rgba(cs.color), rgba(cs.backgroundColor))).to.be.at.least(4.5);
    b.setAttribute('data-tooltip-color', '#1e3a8a');
    tdTooltip.show(b);
    cs = getComputedStyle(tip());
    expect(cs.color).to.equal('rgb(255, 255, 255)');
    b.setAttribute('data-tooltip-text-color', '#fde047');
    tdTooltip.show(b);
    expect(getComputedStyle(tip()).color).to.equal('rgb(253, 224, 71)');
  });

  it('custom colour CSS payload never reaches CSSOM (glass chip kept)', () => {
    const b = mount('<button type="button" data-tooltip="x">x</button>');
    b.setAttribute('data-tooltip-color', 'red;} html{display:none');
    tdTooltip.show(b);
    expect(tip().hasAttribute('data-custom')).to.equal(false);
    expect(tip().style.getPropertyValue('--td-tooltip-bg')).to.equal('');
    b.setAttribute('data-tooltip-color', 'url(https://evil.test/x)');
    tdTooltip.show(b);
    expect(tip().style.getPropertyValue('--td-tooltip-bg')).to.equal('');
  });

  it('keeps its opaque surface over an open modal (v0.20.0: no covered-surface override)', () => {
    const m = mount('<div class="td-modal" data-state="open"></div>');
    const b = mount('<button type="button" data-tooltip="Trên modal">x</button>');
    tdTooltip.show(b);
    expect(getComputedStyle(tip()).backdropFilter).to.equal('none');
    expect(rgba(getComputedStyle(tip()).backgroundColor).a).to.equal(1);
    m.remove();
  });

  it('opacity-only fade (no transform); reduced motion: no transition', async () => {
    const b = mount('<button type="button" data-tooltip="Giảm chuyển động">x</button>');
    tdTooltip.show(b);
    let cs = getComputedStyle(tip());
    expect(cs.transform).to.equal('none');
    expect(cs.transitionProperty).to.equal('opacity');
    await emulateMedia({ reducedMotion: 'reduce' });
    tdTooltip.show(b);
    cs = getComputedStyle(tip());
    expect(cs.transform).to.equal('none');
    expect(parseFloat(cs.transitionDuration)).to.equal(0);
  });

  it('TdTooltip class is exported and _getAccessibleTextColor uses WCAG contrast', () => {
    const t = new TdTooltip();
    expect(t._getAccessibleTextColor('#ffffff')).to.equal('#000000');
    expect(t._getAccessibleTextColor('#000000')).to.equal('#ffffff');
    expect(t._getAccessibleTextColor('#777777')).to.equal('#000000'); // simplified luma would pick white (4.48:1)
  });
});
