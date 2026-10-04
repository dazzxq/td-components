// v0.36.2 (ADR 0019, plan QĐ 9): td-tooltip never opens from a touch — neither on a touch pointerenter nor on the
// focus a tap gives the trigger (Chromium / Android focus a tapped <button>). Keyboard, programmatic and mouse focus,
// mouse hover and pen keep showing it; a tap elsewhere still hides a shown tooltip.
import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { tdTooltip } from './td-tooltip.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const shown = () => !!tdTooltip.tooltip && !tdTooltip.tooltip.hidden && tdTooltip.isVisible;
const describedBy = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const center = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const touchDown = (el, pointerType = 'touch') => el.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true, composed: true }));

let realNow;
beforeEach(() => { tdTooltip.init(); realNow = Date.now; });
afterEach(async () => {
  Date.now = realNow;
  tdTooltip.hide();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  host.innerHTML = '';
  await resetMouse();
});

describe('v0.36.2 td-tooltip on touch', () => {
  it('a touch pointerenter does not show it', () => {
    const b = mount('<button type="button" data-tooltip="Chạm">tap</button>');
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(shown()).to.equal(false);
    expect(describedBy(b)).to.not.include('td-tooltip');
  });

  it('the focus a tap gives the trigger (within 1 s) does not show it; a later focus does', () => {
    const b = mount('<button type="button" data-tooltip="Chạm">tap</button>');
    let now = 50_000;
    Date.now = () => now;
    touchDown(b);
    b.focus();
    expect(shown()).to.equal(false);
    b.blur();
    now += 1001; // past TOUCH_FOCUS_MS
    b.focus();
    expect(shown()).to.equal(true);
    expect(describedBy(b)).to.include('td-tooltip');
  });

  it('a tap on trigger A does not hide B\'s own focus tooltip (per trigger)', () => {
    const a = mount('<button type="button" data-tooltip="A">a</button>');
    const b = mount('<button type="button" data-tooltip="B">b</button>');
    touchDown(a);
    b.focus();
    expect(shown()).to.equal(true);
    expect(tdTooltip.currentElement === b).to.equal(true);
  });

  it('keyboard focus (Tab) shows it with aria-describedby', async () => {
    mount('<button type="button">trước</button>').focus();
    const b = mount('<button type="button" data-tooltip="Bàn phím">phím</button>');
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement === b).to.equal(true);
    expect(shown()).to.equal(true);
    expect(describedBy(b)).to.include('td-tooltip');
  });

  it('a mouse hover shows it as before; a pen pointerenter shows it (pens hover)', async () => {
    const b = mount('<button type="button" data-tooltip="Chuột">chuột</button>');
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    await resetMouse();
    tdTooltip.hide();
    b.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'pen' }));
    expect(shown()).to.equal(true);
  });

  it('a pen press then focus still shows it (pen is not a touch)', () => {
    const b = mount('<button type="button" data-tooltip="Bút">pen</button>');
    touchDown(b, 'pen');
    b.focus();
    expect(shown()).to.equal(true);
  });

  it('a mouse-shown tooltip hides on a tap elsewhere', async () => {
    const b = mount('<button type="button" data-tooltip="Chuột">chuột</button>');
    const other = mount('<button type="button">khác</button>');
    await sendMouse({ type: 'move', position: center(b) });
    expect(shown()).to.equal(true);
    other.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(shown()).to.equal(false);
  });
});
