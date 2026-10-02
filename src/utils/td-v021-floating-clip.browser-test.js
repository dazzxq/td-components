import { expect } from '@esm-bundle/chai';
import '../form/td-dropdown.js';
import { TdModal } from '../feedback/td-modal.js';
import { isReferenceHidden } from './floating.js';

// v0.21.1: a floating panel (portaled to <body>, position: fixed) must not stay over the chrome of the scroll container
// its trigger lives in — e.g. a dropdown in a modal whose BODY is scrolled: once the trigger scrolls under the modal
// header / footer (still inside the viewport) the panel closes instead of painting over them.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  .clip-box { height: 120px; overflow: auto; margin-top: 200px; }
  .clip-pad { height: 600px; }
  .clip-hidden { overflow: hidden; height: 40px; }
  .clip-short { height: 60px; }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

const host = document.createElement('div');
document.body.appendChild(host);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await frame(); await frame(); await frame(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OPTS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];

afterEach(async () => {
  document.querySelectorAll('td-dropdown').forEach((d) => d.close && d.close());
  TdModal.closeAll();
  host.innerHTML = '';
  await wait(0);
});

describe('v0.21.1 floating panels respect the trigger’s clipping ancestors', () => {
  it('isReferenceHidden(rect, el): visible inside its scroll box → false; scrolled out of the box (still in the viewport) → true', async () => {
    host.innerHTML = '<div class="clip-box"><button id="t" type="button">t</button><div class="clip-pad"></div></div>';
    const box = host.firstElementChild;
    const t = host.querySelector('#t');
    expect(isReferenceHidden(t.getBoundingClientRect(), t)).to.equal(false);
    box.scrollTop = 200; // the button is now above the box's visible area, but its rect is still inside the viewport
    const r = t.getBoundingClientRect();
    expect(r.bottom > 0, 'still inside the viewport').to.equal(true);
    expect(isReferenceHidden(r, t)).to.equal(true);
    expect(isReferenceHidden(r), 'without the element only the viewport is checked (unchanged)').to.equal(false);
  });

  it('a trigger whose centre is clipped by an overflow:hidden ancestor counts as hidden', () => {
    host.innerHTML = '<div class="clip-hidden"><div class="clip-short"></div><button id="t" type="button">t</button></div>';
    const t = host.querySelector('#t');
    expect(isReferenceHidden(t.getBoundingClientRect()), 'inside the viewport').to.equal(false);
    expect(isReferenceHidden(t.getBoundingClientRect(), t)).to.equal(true);
  });

  it('td-dropdown in a scroll box closes when its trigger scrolls out of the box', async () => {
    host.innerHTML = '<div class="clip-box"><td-dropdown id="d"></td-dropdown><div class="clip-pad"></div></div>';
    const box = host.firstElementChild;
    const d = host.querySelector('#d');
    d.options = OPTS;
    await settle();
    d.open();
    await settle();
    expect(d._isOpen).to.equal(true);
    box.scrollTop = 4; // a small scroll keeps the trigger visible → stays open
    box.dispatchEvent(new Event('scroll'));
    await settle();
    expect(d._isOpen, 'small scroll keeps it open').to.equal(true);
    box.scrollTop = 200;
    box.dispatchEvent(new Event('scroll'));
    await settle();
    expect(d._isOpen, 'trigger scrolled under the box edge → closed').to.equal(false);
  });

  it('td-dropdown inside a modal body closes once the trigger scrolls under the header', async () => {
    const body = document.createElement('div');
    const d = document.createElement('td-dropdown');
    const pad = document.createElement('div');
    pad.className = 'clip-pad';
    body.append(d, pad, document.createElement('div'));
    d.options = OPTS;
    TdModal.show({ title: 'T', body, size: 'sm', actions: [{ label: 'OK', value: 'ok' }] });
    for (let i = 0; i < 60 && !document.querySelector('.td-modal[data-state="open"]'); i++) await wait(10);
    await wait(350); // past the entry transition
    d.open();
    await settle();
    expect(d._isOpen).to.equal(true);
    const scroller = d.closest('.td-modal__body');
    expect(scroller.scrollHeight > scroller.clientHeight, 'modal body scrolls').to.equal(true);
    // scroll just enough for the trigger to pass under the header: still inside the viewport
    const trig = d.querySelector('.td-dropdown__trigger');
    scroller.scrollTop = trig.offsetHeight + 24;
    scroller.dispatchEvent(new Event('scroll'));
    await settle();
    const r = trig.getBoundingClientRect();
    expect(r.top > 0 && r.bottom < window.innerHeight, `trigger still in the viewport (${r.top})`).to.equal(true);
    expect(d._isOpen, 'menu must not float over the modal header').to.equal(false);
  });
});
