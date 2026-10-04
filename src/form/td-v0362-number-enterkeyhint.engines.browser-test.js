// v0.36.2 (plan QĐ 18): td-number-input forwards `enterkeyhint` (enter|done|go|next|previous|search|send) to its
// control in place — unknown values are dropped, a change keeps the focus and the control node; an SSR control is
// adopted first and the hint applied after (it is a keyboard hint, not state, so it never blocks the adoption).
import { expect } from '@esm-bundle/chai';
import { TdNumberInput } from './td-number-input.js';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; });
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const control = (el) => el.querySelector('.td-number__control');

describe('v0.36.2 td-number-input enterkeyhint', () => {
  it('is in observedAttributes and reaches the control (lower-cased)', () => {
    expect(TdNumberInput.observedAttributes).to.include('enterkeyhint');
    const el = mount('<td-number-input label="Số lượng" enterkeyhint="Done"></td-number-input>');
    expect(control(el).getAttribute('enterkeyhint')).to.equal('done');
  });

  it('an unknown value is dropped; no attribute → none on the control', () => {
    const el = mount('<td-number-input label="Số lượng" enterkeyhint="launch"></td-number-input>');
    expect(control(el).hasAttribute('enterkeyhint')).to.equal(false);
    const plain = mount('<td-number-input label="Số lượng"></td-number-input>');
    expect(control(plain).hasAttribute('enterkeyhint')).to.equal(false);
  });

  it('changes in place: same control node, focus kept; removal clears it', () => {
    const el = mount('<td-number-input label="Số lượng" enterkeyhint="next"></td-number-input>');
    const c = control(el);
    c.focus();
    el.setAttribute('enterkeyhint', 'go');
    expect(control(el) === c).to.equal(true);
    expect(document.activeElement === c).to.equal(true);
    expect(c.getAttribute('enterkeyhint')).to.equal('go');
    el.setAttribute('enterkeyhint', 'nope');
    expect(c.hasAttribute('enterkeyhint')).to.equal(false);
    el.setAttribute('enterkeyhint', 'send');
    el.removeAttribute('enterkeyhint');
    expect(c.hasAttribute('enterkeyhint')).to.equal(false);
  });

  it('SSR (number-input@1): the server control is adopted, then the host hint is applied to it', async () => {
    const res = await fetch('/test/ssr/fixtures/number.html');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ssr = doc.querySelector('td-number-input[data-td-ssr]');
    expect(ssr, 'fixture has an SSR number input').to.not.equal(null);
    ssr.setAttribute('enterkeyhint', 'done');
    // a fresh registry would be needed to define late; the element is already defined here, so adopt on connect
    const el = /** @type {any} */ (document.importNode(ssr, true));
    const serverControl = el.querySelector('input');
    host.append(el);
    expect(el.querySelector('input') === serverControl, 'adopted in place (same node)').to.equal(true);
    expect(serverControl.getAttribute('enterkeyhint')).to.equal('done');
  });
});
