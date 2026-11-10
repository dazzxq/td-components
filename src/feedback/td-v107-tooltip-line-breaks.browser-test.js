import { expect } from '@esm-bundle/chai';
import { tdTooltip } from './td-tooltip.js';

// v0.107.0 (dsuite request): a line break in data-tooltip (`&#10;`) breaks the line; trimmed; multi-line aligns start.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const tip = () => tdTooltip.tooltip;
const content = () => tip().querySelector('.td-tooltip__content') || tip();
const lineH = () => parseFloat(getComputedStyle(tip()).lineHeight);
/** rendered line count of the chip text */
const lines = () => Math.round(content().getBoundingClientRect().height / lineH());
const show = (b) => { tdTooltip.show(b); return tip(); };

beforeEach(() => { tdTooltip.init(); });
afterEach(() => {
  tdTooltip.hide();
  host.innerHTML = '';
  document.documentElement.style.removeProperty('--td-tooltip-white-space');
});

describe('v0.107 tooltip line breaks', () => {
  it('&#10; in data-tooltip renders one line per segment, data-multiline set, aligned start', () => {
    const b = mount('<button type="button" data-tooltip="Dòng 1&#10;Dòng 2&#10;Dòng 3">x</button>');
    const t = show(b);
    expect(content().textContent).to.equal('Dòng 1\nDòng 2\nDòng 3');
    expect(lines()).to.equal(3);
    expect(t.hasAttribute('data-multiline')).to.equal(true);
    expect(getComputedStyle(t).textAlign).to.equal('start');
  });

  it('text without a line break: single line, no data-multiline, still centred (layout unchanged)', () => {
    const b = mount('<button type="button" data-tooltip="Gợi ý ngắn">x</button>');
    const t = show(b);
    expect(lines()).to.equal(1);
    expect(t.hasAttribute('data-multiline')).to.equal(false);
    expect(getComputedStyle(t).textAlign).to.equal('center');
    const w = t.getBoundingClientRect().width;
    document.documentElement.style.setProperty('--td-tooltip-white-space', 'normal');
    expect(t.getBoundingClientRect().width).to.equal(w);
  });

  it('long text without a line break still wraps at --td-tooltip-max-w', () => {
    const b = mount(`<button type="button" data-tooltip="${'chữ dài '.repeat(30)}">x</button>`);
    const t = show(b);
    expect(lines()).to.be.greaterThan(1);
    expect(t.hasAttribute('data-multiline')).to.equal(false);
  });

  it('leading/trailing line breaks from source formatting are trimmed', () => {
    const b = mount('<button type="button" data-tooltip="&#10;    Gợi ý&#10;  ">x</button>');
    const t = show(b);
    expect(content().textContent).to.equal('Gợi ý');
    expect(lines()).to.equal(1);
    expect(t.hasAttribute('data-multiline')).to.equal(false);
  });

  it('data-tooltip-align on the trigger beats the multi-line start alignment', () => {
    const b = mount('<button type="button" data-tooltip="A&#10;B" data-tooltip-align="center">x</button>');
    expect(getComputedStyle(show(b)).textAlign).to.equal('center');
  });

  it('--td-tooltip-white-space: normal restores the old behaviour (one line)', () => {
    document.documentElement.style.setProperty('--td-tooltip-white-space', 'normal');
    const b = mount('<button type="button" data-tooltip="A&#10;B">x</button>');
    show(b);
    expect(lines()).to.equal(1);
  });

  it('dwp alias data-dwp-tooltip honours line breaks too', () => {
    const b = mount('<button type="button" data-dwp-tooltip="A&#10;B">x</button>');
    show(b);
    expect(lines()).to.equal(2);
  });

  it('text only: markup in the attribute stays literal text', () => {
    const b = mount('<button type="button" data-tooltip="<b>x</b>&#10;y">x</button>');
    show(b);
    expect(content().querySelector('b')).to.equal(null);
    expect(content().textContent).to.equal('<b>x</b>\ny');
  });

  it('unnamed trigger: aria-label from the tooltip has no line break', () => {
    const b = mount('<button type="button" data-tooltip="Dòng 1&#10;Dòng 2"></button>');
    show(b);
    expect(b.getAttribute('aria-label')).to.equal('Dòng 1 Dòng 2');
  });
});
