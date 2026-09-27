import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, emulateMedia, setViewport } from '@web/test-runner-commands';
import { tdTooltip } from './td-tooltip.js';

// v0.14.0 plan G8 — dwp tooltip port (look + behaviour) in glass, td a11y kept. td.css only.
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
/** Place a trigger at fixed viewport coordinates (CSSOM, CSP-safe). */
const at = (el, left, top) => {
  el.style.setProperty('position', 'fixed');
  el.style.setProperty('left', `${left}px`);
  el.style.setProperty('top', `${top}px`);
  return el;
};
/** Visual tip of the arrow (rotated square's outer corner) in viewport px, from its unrotated box. */
function arrowTip(side) {
  const t = tip();
  const cs = getComputedStyle(t, '::after');
  const size = parseFloat(cs.width);
  const r = t.getBoundingClientRect();
  const left = r.left + t.clientLeft + parseFloat(cs.left);
  const top = r.top + t.clientTop + parseFloat(cs.top);
  const cx = left + size / 2;
  const cy = top + size / 2;
  const d = (size * Math.SQRT2) / 2;
  return { top: [cx, cy + d], bottom: [cx, cy - d], left: [cx + d, cy], right: [cx - d, cy] }[side];
}

beforeEach(() => { tdTooltip.init(); });
afterEach(async () => {
  tdTooltip.hide();
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
  await setViewport({ width: 800, height: 600 });
  await wait(50); // let a late window `resize` (it hides the tooltip) land before the next test
});

describe('v0.14 tooltip — dwp attribute aliases', () => {
  it('data-dwp-tooltip + data-dwp-tooltip-pos work unchanged (dwp markup)', () => {
    const b = at(mount('<button type="button" data-dwp-tooltip="Chia sẻ" data-dwp-tooltip-pos="bottom">x</button>'), 300, 200);
    tdTooltip.show(b);
    expect(shown()).to.equal(true);
    expect(tip().textContent).to.equal('Chia sẻ');
    expect(tip().getAttribute('data-placement')).to.equal('bottom');
    expect(describedBy(b)).to.deep.equal(['td-tooltip']);
  });

  it('data-tooltip-pos alias; data-tooltip / data-tooltip-position win over the aliases', () => {
    const b = at(mount('<button type="button" data-tooltip="td" data-dwp-tooltip="dwp" '
      + 'data-tooltip-position="bottom" data-tooltip-pos="left" data-dwp-tooltip-pos="right">x</button>'), 300, 200);
    tdTooltip.show(b);
    expect(tip().textContent).to.equal('td');
    expect(tip().getAttribute('data-placement')).to.equal('bottom');
    b.removeAttribute('data-tooltip-position');
    tdTooltip.show(b);
    expect(tip().getAttribute('data-placement')).to.equal('left');
    b.removeAttribute('data-tooltip-pos');
    tdTooltip.show(b);
    expect(tip().getAttribute('data-placement')).to.equal('right');
  });

  it('a present but empty data-tooltip disables the dwp alias', () => {
    const b = mount('<button type="button" data-tooltip="" data-dwp-tooltip="dwp">x</button>');
    tdTooltip.show(b);
    expect(shown()).to.equal(false);
  });

  it('dwp triggers get the D15 naming policy (at init and when added later)', async () => {
    const b = mount('<button type="button" title="Tải xuống" data-dwp-tooltip="Tải tệp"><svg aria-hidden="true"></svg></button>');
    await wait(0);
    expect(b.getAttribute('aria-label')).to.equal('Tải xuống');
    expect(b.hasAttribute('title')).to.equal(false);
  });

  it('hover over a dwp trigger shows it; text follows data-dwp-tooltip changes', async () => {
    const b = at(mount('<button type="button" data-dwp-tooltip="Một">x</button>'), 300, 200);
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    b.setAttribute('data-dwp-tooltip', 'Hai');
    await wait(0);
    expect(tip().textContent).to.equal('Hai');
  });
});

describe('v0.14 tooltip — behaviour (dwp)', () => {
  it('touch: shows on pointerenter and stays after the finger lifts; a tap elsewhere hides it', async () => {
    const b = at(mount('<button type="button" data-tooltip="Chạm">tap</button>'), 300, 200);
    const other = mount('<p>ngoài</p>');
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(shown()).to.equal(true);
    b.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));
    await wait(200);
    expect(shown()).to.equal(true);
    other.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(shown()).to.equal(false);
  });

  it('any focus shows it (also programmatic / non-:focus-visible focus); focusout hides', async () => {
    const b = at(mount('<button type="button" data-tooltip="Tiêu điểm">x</button>'), 300, 200);
    const other = mount('<button type="button">khác</button>');
    await sendMouse({ type: 'click', position: [790, 590] }); // pointer modality → programmatic focus is not :focus-visible
    b.focus();
    expect(shown()).to.equal(true);
    expect(same(tdTooltip.currentElement, b)).to.equal(true);
    other.focus();
    await wait(200);
    expect(shown()).to.equal(false);
  });

  it('keyboard focus keeps it when the mouse passes over and leaves (1.4.13)', async () => {
    const before = mount('<button type="button">trước</button>');
    const b = at(mount('<button type="button" data-tooltip="Giữ">x</button>'), 300, 200);
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, b)).to.equal(true);
    expect(shown()).to.equal(true);
    await sendMouse({ type: 'move', position: center(b) });
    await sendMouse({ type: 'move', position: [790, 590] });
    await wait(200);
    expect(shown()).to.equal(true);
  });

  it('any scroll hides it (capture: a nested scroller too)', async () => {
    const box = mount('<div class="sc"><div class="in"></div></div>');
    box.style.setProperty('height', '60px');
    box.style.setProperty('overflow', 'auto');
    box.firstElementChild.style.setProperty('height', '400px');
    const b = at(mount('<button type="button" data-tooltip="Cuộn">x</button>'), 300, 200);
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    box.scrollTop = 50;
    await new Promise((r) => box.addEventListener('scroll', r, { once: true }));
    expect(shown()).to.equal(false);
  });

  it('a scroll while the trigger holds keyboard focus repositions instead of hiding', async () => {
    const before = mount('<button type="button">trước</button>');
    const b = mount('<button type="button" data-tooltip="Theo nút">x</button>');
    b.style.setProperty('margin', '200px 0 0 300px');
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(shown()).to.equal(true);
    document.dispatchEvent(new Event('scroll'));
    await frames();
    expect(shown()).to.equal(true);
  });

  it('resize hides it', async () => {
    const b = at(mount('<button type="button" data-tooltip="Đổi cỡ">x</button>'), 300, 200);
    tdTooltip.show(b);
    await setViewport({ width: 700, height: 600 });
    await frames();
    expect(shown()).to.equal(false);
  });

  it('fades out: [hidden] after the 120ms opacity fade, not interactive meanwhile; re-show cancels', async () => {
    const b = at(mount('<button type="button" data-tooltip="Mờ dần">x</button>'), 300, 200);
    tdTooltip.show(b);
    await frames();
    expect(tip().getAttribute('data-state')).to.equal('open');
    tdTooltip.hide();
    expect(tdTooltip.isVisible).to.equal(false);
    expect(tip().hidden).to.equal(false);
    expect(getComputedStyle(tip()).pointerEvents).to.equal('none');
    expect(b.hasAttribute('aria-describedby')).to.equal(false);
    await wait(200);
    expect(tip().hidden).to.equal(true);
    tdTooltip.show(b);
    await frames();
    tdTooltip.hide();
    tdTooltip.show(b); // during the fade
    await wait(200);
    expect(shown()).to.equal(true);
  });

  it('reduced motion: hidden immediately', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const b = at(mount('<button type="button" data-tooltip="Ngay">x</button>'), 300, 200);
    tdTooltip.show(b);
    await frames();
    tdTooltip.hide();
    expect(tip().hidden).to.equal(true);
  });
});

describe('v0.14 tooltip — visuals', () => {
  it('dwp metrics: 14px text, line-height 1.4, padding .4rem .6rem, left-aligned, max 18rem, normal weight', () => {
    const b = at(mount('<button type="button" data-tooltip="Chữ">x</button>'), 300, 200);
    tdTooltip.show(b);
    const cs = getComputedStyle(tip());
    expect(cs.fontSize).to.equal('14px');
    expect(parseFloat(cs.lineHeight)).to.be.closeTo(19.6, 0.1);
    expect(cs.paddingTop).to.equal('6.4px');
    expect(cs.paddingLeft).to.equal('9.6px');
    expect(['start', 'left']).to.include(cs.textAlign);
    expect(cs.maxWidth).to.equal('288px');
    expect(cs.fontWeight).to.equal('400');
    expect(cs.overflowWrap).to.equal('break-word');
  });

  it('arrow: pseudo-element with the chip fill + edge, no own backdrop-filter', () => {
    const b = at(mount('<button type="button" data-tooltip="Mũi tên">x</button>'), 300, 200);
    tdTooltip.show(b);
    const cs = getComputedStyle(tip());
    const a = getComputedStyle(tip(), '::after');
    expect(a.content).to.equal('""');
    expect(a.backgroundColor).to.equal(cs.backgroundColor);
    expect(a.borderBottomColor).to.equal(cs.borderBottomColor);
    expect(a.backdropFilter).to.equal('none');
    expect(a.clipPath).to.not.equal('none');
  });

  it('custom colour: the arrow is the same solid colour', () => {
    const b = at(mount('<button type="button" data-tooltip="Màu" data-tooltip-color="#1e3a8a">x</button>'), 300, 200);
    tdTooltip.show(b);
    expect(getComputedStyle(tip(), '::after').backgroundColor).to.equal('rgb(30, 58, 138)');
  });

  for (const side of ['top', 'bottom', 'left', 'right']) {
    it(`arrow points at the trigger centre (${side})`, () => {
      const b = at(mount(`<button type="button" data-tooltip="Hướng ${side}" data-tooltip-position="${side}">x</button>`), 380, 280);
      tdTooltip.show(b);
      expect(tip().getAttribute('data-placement')).to.equal(side);
      const [cx, cy] = center(b);
      const [ax, ay] = arrowTip(side);
      const r = b.getBoundingClientRect();
      if (side === 'top' || side === 'bottom') {
        expect(Math.abs(ax - cx)).to.be.below(1.5);
        const edge = side === 'top' ? r.top : r.bottom;
        expect(Math.abs(ay - edge)).to.be.below(5); // tip sits in the gap, close to the trigger
      } else {
        expect(Math.abs(ay - cy)).to.be.below(1.5);
        const edge = side === 'left' ? r.left : r.right;
        expect(Math.abs(ax - edge)).to.be.below(5);
      }
    });
  }

  it('arrow-clamped: the chip clamps to the viewport edge, the arrow still points at the trigger', () => {
    const text = 'Một chú thích khá dài cho nút sát mép trái màn hình';
    const b = at(mount(`<button type="button" data-tooltip="${text}">x</button>`), 10, 200);
    tdTooltip.show(b);
    const t = tip().getBoundingClientRect();
    expect(Math.round(t.left)).to.equal(8); // clamped
    const [cx] = center(b);
    expect(Math.abs(arrowTip('top')[0] - cx)).to.be.below(1.5);
    expect(tip().style.getPropertyValue('--td-tooltip-arrow-x')).to.match(/^\d+(\.\d)?px$/);
    // right edge
    at(b, 750, 200);
    tdTooltip.show(b);
    const t2 = tip().getBoundingClientRect();
    expect(Math.round(800 - t2.right)).to.equal(8);
    expect(Math.abs(arrowTip('top')[0] - center(b)[0])).to.be.below(1.5);
  });

  it('arrow keeps clear of the rounded corners when the trigger centre is beyond them', () => {
    const b = at(mount('<button type="button" data-tooltip="Góc">x</button>'), 0, 200);
    b.style.setProperty('width', '4px');
    b.style.setProperty('padding', '0');
    tdTooltip.show(b);
    const t = tip().getBoundingClientRect();
    const [ax] = arrowTip('top');
    expect(ax - t.left).to.be.at.least(8); // ≥ radius
  });

  it('flip: preferred top without room → bottom (arrow on the top edge, pointing up)', () => {
    const b = at(mount('<button type="button" data-tooltip="Lật">x</button>'), 300, 2);
    tdTooltip.show(b);
    expect(tip().getAttribute('data-placement')).to.equal('bottom');
    expect(Math.abs(arrowTip('bottom')[0] - center(b)[0])).to.be.below(1.5);
  });
});
