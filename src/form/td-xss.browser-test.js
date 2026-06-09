import { expect } from '@esm-bundle/chai';
import './td-checkbox.js';
import './td-slider.js';
import './td-button.js';
import './td-input-field.js';
import './td-dropdown.js';
import '../display/td-table.js';
import { TdToast } from '../feedback/td-toast.js';
import { tdTooltip } from '../feedback/td-tooltip.js';
import { TdLoadingSpinner } from '../feedback/td-loading.js';

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => {
  container.innerHTML = '';
  if (TdToast.container) TdToast.container.innerHTML = '';
});

// A CSS payload that, if not contained, would break out of the rule / style attribute.
const CSS_PAYLOAD = 'red;} html{display:none} .x{color:';
const HTML_PAYLOAD = '<img src=x onerror="window.__xss=true">';

describe('CSS-injection containment (color attributes)', () => {
  it('td-checkbox: malicious color falls back; CSSOM custom property has no payload', () => {
    const el = mount(`<td-checkbox color="${CSS_PAYLOAD}"></td-checkbox>`);
    expect(el._getColor()).to.equal('#2196F3');
    // Checked color now flows via CSSOM into the host custom property (no injected <style>).
    // setProperty parses a single CSS value, so a `;}`-breakout payload is dropped entirely.
    const cssVar = el.style.getPropertyValue('--td-cb-color').trim();
    expect(cssVar).to.equal('#2196F3');
    expect(cssVar).to.not.include('display:none');
  });

  it('td-checkbox: a valid hex still works', () => {
    const el = mount('<td-checkbox color="#10b981"></td-checkbox>');
    expect(el._getColor()).to.equal('#10b981');
    expect(el.style.getPropertyValue('--td-cb-color').trim()).to.equal('#10b981');
  });

  it('td-slider: breakout payload cannot inject an element or escape the style attr', () => {
    window.__xss = false;
    const el = mount(`<td-slider value="50" color='"><img src=x onerror="window.__xss=true">'></td-slider>`);
    expect(el._getColor()).to.equal('#3b82f6');
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
    expect(el.querySelector('.td-slider-thumb').getAttribute('style')).to.not.include('onerror');
  });

  it('td-button: malicious color falls back to variant styling', () => {
    const el = mount(`<td-button label="Hi" color="${CSS_PAYLOAD}"></td-button>`);
    const btn = el.querySelector('button');
    expect((btn.getAttribute('style') || '')).to.not.include('display:none');
  });

  it('TdLoadingSpinner: caller color/trackColor are sanitized before SVG stroke', () => {
    window.__xss = false;
    const spinner = TdLoadingSpinner.create({ color: '"><img src=x onerror="window.__xss=true">', trackColor: 'blue;}html{x' });
    container.appendChild(spinner);
    expect(spinner.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
    expect(spinner.innerHTML).to.not.include('onerror');
  });
});

describe('HTML-injection containment (text/attribute contexts)', () => {
  it('td-input-field: malicious value is held as text, no script element', () => {
    const el = mount('<td-input-field value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></td-input-field>');
    expect(el.querySelector('script')).to.equal(null);
  });

  it('td-input-field: a raw quote/script in the value attribute does not break out', () => {
    const el = document.createElement('td-input-field');
    el.setAttribute('value', '"><script>alert(1)</script>');
    container.appendChild(el);
    expect(el.querySelector('script')).to.equal(null);
    expect(el.querySelector('.td-input').value).to.equal('"><script>alert(1)</script>');
  });

  it('td-dropdown: an option label with HTML is escaped in the menu', () => {
    window.__xss = false;
    const el = mount('<td-dropdown></td-dropdown>');
    el.options = [{ value: 'a', label: HTML_PAYLOAD }];
    el.open();
    expect(el._menuElement.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
  });

  it('td-table: a plain cell value with HTML is escaped', () => {
    window.__xss = false;
    const el = mount('<td-table></td-table>');
    el.columns = [{ key: 'name', label: 'Name' }];
    el.data = [{ name: HTML_PAYLOAD }];
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
  });

  it('td-table: a malicious column key cannot break out of the data-* attribute', () => {
    window.__xss = false;
    const el = mount('<td-table></td-table>');
    el.columns = [{ key: '"><img src=x onerror="window.__xss=true">', label: 'Name', sortable: true }];
    el.data = [{ x: 1 }];
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
  });

  it('td-input-field: a malicious max-length cannot break out of the attribute', () => {
    window.__xss = false;
    const el = document.createElement('td-input-field');
    el.setAttribute('max-length', '5"><img src=x onerror="window.__xss=true">');
    container.appendChild(el);
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
    // coerced to the leading integer; the payload is stripped, never interpolated raw
    expect(el.querySelector('.td-input').getAttribute('maxlength')).to.equal('5');
  });

  it('td-input-field: a non-numeric max-length is dropped entirely', () => {
    const el = mount('<td-input-field max-length="abc"><\/td-input-field>');
    expect(el.querySelector('.td-input').hasAttribute('maxlength')).to.equal(false);
    expect(el.querySelector('.td-input-counter')).to.equal(null);
  });

  it('td-input-field: a valid max-length still applies', () => {
    const el = mount('<td-input-field max-length="10"></td-input-field>');
    expect(el.querySelector('.td-input').getAttribute('maxlength')).to.equal('10');
    expect(el.querySelector('.td-input-counter')).to.not.equal(null);
  });

  it('td-toast: message is rendered as text, not HTML', () => {
    window.__xss = false;
    TdToast._showSingle(HTML_PAYLOAD, 'info', 0);
    expect(TdToast.container.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
    expect(TdToast.container.textContent).to.include('<img');
  });

  it('td-tooltip: content is set as text, not HTML', () => {
    window.__xss = false;
    tdTooltip.init();
    const target = mount('<span data-tooltip="&lt;img src=x onerror=&quot;window.__xss=true&quot;&gt;">hover</span>');
    target.setAttribute('data-tooltip', HTML_PAYLOAD); // raw, unescaped source
    tdTooltip.show(target);
    expect(tdTooltip.tooltip.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
    expect(tdTooltip.tooltip.textContent).to.include('<img');
    tdTooltip.hide();
  });
});
