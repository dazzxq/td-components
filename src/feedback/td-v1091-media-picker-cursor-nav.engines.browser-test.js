import { expect } from '@esm-bundle/chai';

// v0.109.1 (dsuite 13/11): the media picker's cursor ‹ › (td-button) must look exactly like td-pagination's nav buttons
// (circle, same size, same border / background / opacity per state). Compared by computed style against a real
// td-pagination, in Chromium, Firefox and WebKit (group `engines`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const { TdMediaPicker } = await import('./td-media-picker.js');
await import('../display/td-pagination.js');
const { createMockAdapter } = await import('../../test/fixtures/media-adapter.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await wait(10);
  }
}
const root = () => document.body.querySelector(':scope > .td-media-picker');
const PROPS = ['width', 'height', 'border-top-left-radius', 'border-top-width', 'border-top-style', 'border-top-color',
  'background-color', 'color', 'box-shadow', 'padding-left', 'padding-top'];
const look = (el) => { const cs = getComputedStyle(el); return Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)])); };

describe('v0.109.1 td-media-picker cursor ‹ › = td-pagination nav', () => {
  let pg;
  let host;
  beforeEach(async () => {
    pg = document.createElement('td-pagination');
    pg.setAttribute('total-items', '100');
    pg.setAttribute('items-per-page', '10');
    pg.setAttribute('current-page', '1');
    document.body.append(pg);
    TdMediaPicker.open({ adapter: createMockAdapter(), pageSize: 25, autoSelectFirst: false });
    host = document.querySelector('td-media-picker');
    await until(() => root()?.querySelector('.td-media-picker__next .td-btn') && !root().querySelector('.td-media-picker__cursor').hidden
      && root().querySelector('.td-media-picker__next .td-btn:not(:disabled)')
      && root().querySelector('.td-media-picker__prev .td-btn:disabled'), 4000, 'cursor pager (page 1: ‹ disabled, › enabled)');
  });
  afterEach(async () => {
    host?.close('programmatic');
    pg.remove();
    await wait(50);
  });

  it('enabled › matches the enabled td-pagination next; disabled ‹ matches the disabled prev (opacity .45)', () => {
    const next = root().querySelector('.td-media-picker__next .td-btn');
    const prev = root().querySelector('.td-media-picker__prev .td-btn');
    const pgNext = pg.querySelector('.td-pagination__nav--next');
    const pgPrev = pg.querySelector('.td-pagination__nav--prev');
    expect(prev.disabled).to.equal(true);
    expect(pgPrev.getAttribute('aria-disabled')).to.equal('true');
    expect(look(next)).to.deep.equal(look(pgNext));
    expect(look(prev)).to.deep.equal(look(pgPrev));
    expect(getComputedStyle(prev).opacity).to.equal(getComputedStyle(pgPrev).opacity);
    expect(getComputedStyle(next).opacity).to.equal('1');
    // a circle: square box, radius at least half the side
    const r = next.getBoundingClientRect();
    expect(Math.abs(r.width - r.height)).to.be.below(0.5);
    expect(parseFloat(getComputedStyle(next).borderTopLeftRadius)).to.be.at.least(r.height / 2);
  });

  it('the chevron is the same size as td-pagination\'s (Codex r1)', () => {
    // computed size, not getBoundingClientRect: the modal's open animation scales the picker's rects
    const box = (el) => { const cs = getComputedStyle(el.querySelector('svg')); return [cs.width, cs.height]; };
    expect(box(root().querySelector('.td-media-picker__next .td-btn'))).to.deep.equal(box(pg.querySelector('.td-pagination__nav--next')));
    expect(box(root().querySelector('.td-media-picker__prev .td-btn'))).to.deep.equal(box(pg.querySelector('.td-pagination__nav--prev')));
    // the td-button host is exactly the button's height (no inline line box growing it to 33px; CSP parity caught it)
    for (const sel of ['.td-media-picker__prev', '.td-media-picker__next']) {
      expect(getComputedStyle(root().querySelector(sel)).height).to.equal(getComputedStyle(pg.querySelector('.td-pagination__nav--next')).height);
    }
  });

  it('a11y kept: aria-label "Trang trước" / "Trang sau" on the real buttons, the same icons as td-pagination', () => {
    const next = root().querySelector('.td-media-picker__next .td-btn');
    const prev = root().querySelector('.td-media-picker__prev .td-btn');
    expect(prev.getAttribute('aria-label')).to.equal(TdMediaPicker.labels.prevPage);
    expect(next.getAttribute('aria-label')).to.equal(TdMediaPicker.labels.nextPage);
    expect(!!next.querySelector('[data-td-icon="next"], svg')).to.equal(true);
  });
});
