import { expect } from '@esm-bundle/chai';
import './td-input-field.js';
import './td-slider.js';
import './td-checkbox.js';
import './td-toggle.js';
import './td-dropdown.js';
import '../display/td-tabs.js';
import '../display/td-pagination.js';
import { svgStringToDefinition } from '../icons/td-icon.js';
import { sendKeys } from '@web/test-runner-commands';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (h) => { host.insertAdjacentHTML('beforeend', h.trim()); return host.lastElementChild; };
afterEach(() => { host.innerHTML = ''; });

describe('v0.8.0 impl-review fixes', () => {
  it('consumer aria-describedby ids survive structural re-renders', () => {
    const cases = [
      ['<td-input-field label="x"></td-input-field>', 'size', 'lg'],
      ['<td-slider aria-label="x"></td-slider>', 'size', 'lg'],
      ['<td-checkbox label="x"></td-checkbox>', 'size', 'lg'],
      ['<td-toggle label="x"></td-toggle>', 'size', 'lg'],
    ];
    for (const [markup, attr, val] of cases) {
      const el = mount(markup);
      el._focusTarget().setAttribute('aria-describedby', 'page-hint');
      el.setError('Lỗi');
      el.setAttribute(attr, val); // structural re-render replaces the control
      const ids = el._focusTarget().getAttribute('aria-describedby').split(' ');
      expect(ids, markup).to.include('page-hint');
      expect(ids, markup).to.include(`${el.id}-error`);
    }
  });

  it('manual tabs: roving tabindex follows focus without selecting', async () => {
    const el = mount('<td-tabs></td-tabs>');
    el.tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    tabs[0].focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === tabs[1]).to.equal(true);
    expect(tabs[1].tabIndex).to.equal(0);
    expect(tabs[0].tabIndex).to.equal(-1);
    expect(tabs[0].getAttribute('aria-selected')).to.equal('true');
  });

  it('clicking the still-selected tab after arrow navigation restores its tabindex', async () => {
    const el = mount('<td-tabs></td-tabs>');
    el.tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const [a, b] = [...el.querySelectorAll('[role="tab"]')];
    a.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(b.tabIndex).to.equal(0);
    a.click();
    expect(a.tabIndex).to.equal(0);
    expect(b.tabIndex).to.equal(-1);
  });

  it('pagination active colour is applied normalised (currentColor resolved)', () => {
    const el = mount('<td-pagination total-items="30" current-page="1" active-color="currentColor"></td-pagination>');
    const v = el.style.getPropertyValue('--td-pagination-active');
    expect(v === '' || /^rgba?\(/.test(v)).to.equal(true);
  });

  it('dropdown works again after being moved in the DOM', () => {
    const el = mount('<td-dropdown></td-dropdown>');
    el.options = [{ value: 'a', label: 'A' }];
    el.open();
    const other = mount('<div></div>');
    other.appendChild(el); // disconnect + connect
    expect(!!el._menuElement && document.body.contains(el._menuElement)).to.equal(true);
    el.open();
    expect(el._menuElement.classList.contains('hidden')).to.equal(false);
    el.close();
  });

  it('raw svg without a viewBox is rejected', () => {
    expect(svgStringToDefinition('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h4"/></svg>')).to.equal(null);
    expect(svgStringToDefinition('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h4"/></svg>')).to.not.equal(null);
  });

  it('slider marks cap uses the unfloored span', () => {
    const el = mount('<td-slider min="0" max="50.5" step="1" show-step-marks aria-label="x"></td-slider>');
    expect(el.querySelector('.td-slider__mark')).to.equal(null);
    const ok = mount('<td-slider min="0" max="50" step="1" show-step-marks aria-label="y"></td-slider>');
    expect(ok.querySelectorAll('.td-slider__mark').length).to.equal(51);
  });
});

describe('v0.8.0 security-review fixes', () => {
  it('renderIconDefinition validates its input', async () => {
    const { renderIconDefinition } = await import('../icons/td-icon.js');
    const bad = [
      { viewBox: '0 0 24 24', nodes: [['image', { href: 'bad://x', onerror: 'globalThis.pwned=1' }]] },
      { viewBox: '0 0 24 24', nodes: [['script', {}]] },
      { viewBox: '0 0 24 24', nodes: [['foreignObject', {}]] },
      { viewBox: '0 0 24 24', nodes: [['path', { d: 'M0 0', style: 'x' }]] },
      { viewBox: '0 0 24 24', nodes: [['rect', { x: 'url(#a)' }]] },
    ];
    for (const def of bad) expect(renderIconDefinition(def)).to.equal(null);
    expect(globalThis.pwned).to.equal(undefined);
    expect(renderIconDefinition({ viewBox: '0 0 24 24', nodes: [['path', { d: 'M1 1h4' }]] })).to.not.equal(null);
  });

  it('svg strings: size, DTD and shape-count limits', () => {
    const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
    expect(svgStringToDefinition(`<!DOCTYPE svg [<!ENTITY a "x">]>${head}<path d="M0 0"/></svg>`)).to.equal(null);
    expect(svgStringToDefinition(head + '<path d="M0 0h1"/>'.repeat(65) + '</svg>')).to.equal(null);
    expect(svgStringToDefinition(`${head}<path d="${'M0 0'.repeat(3000)}"/></svg>`)).to.equal(null);
    expect(svgStringToDefinition(head + 'x'.repeat(40000) + '</svg>')).to.equal(null);
  });

  it('pagination stays bounded above Number.MAX_SAFE_INTEGER', () => {
    const el = mount('<td-pagination total-items="100000000000000000000" items-per-page="1" current-page="10000000000000000000" max-pages="25"></td-pagination>');
    expect(el.querySelectorAll('.td-pagination__page').length).to.be.at.most(27);
  });

  it('pagination max-pages is clamped (bounded DOM)', () => {
    const el = mount('<td-pagination total-items="100000000" items-per-page="1" current-page="500" max-pages="100000"></td-pagination>');
    expect(el.querySelectorAll('.td-pagination__page').length).to.be.at.most(27);
  });
});
