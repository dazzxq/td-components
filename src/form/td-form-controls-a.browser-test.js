import { expect } from '@esm-bundle/chai';
import './td-checkbox.js';
import './td-toggle.js';
import './td-slider.js';
import './td-button.js';

// A submit in the runner would navigate/reload and kill the mocha session.
document.addEventListener('submit', (e) => e.preventDefault(), true);

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => { container.innerHTML = ''; });

describe('td-checkbox (form-associated)', () => {
  it('submits its value only when checked', () => {
    const form = mount('<form><td-checkbox name="agree"></td-checkbox></form>');
    const el = form.querySelector('td-checkbox');
    expect(new FormData(form).get('agree')).to.equal(null);
    el.querySelector('.td-checkbox-input').click();
    expect(el.hasAttribute('checked')).to.equal(true);
    expect(new FormData(form).get('agree')).to.equal('on');
  });

  it('honours a custom value attribute', () => {
    const form = mount('<form><td-checkbox name="plan" value="pro" checked></td-checkbox></form>');
    expect(new FormData(form).get('plan')).to.equal('pro');
  });

  it('required + unchecked fails validity and blocks submit', () => {
    const form = mount('<form><td-checkbox name="t" required></td-checkbox></form>');
    const el = form.querySelector('td-checkbox');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    form.requestSubmit();
    expect(submitted).to.equal(false);
    el.querySelector('.td-checkbox-input').click();
    expect(el.checkValidity()).to.equal(true);
  });

  it('reset restores the default checked state', () => {
    const form = mount('<form><td-checkbox name="t" checked></td-checkbox></form>');
    const el = form.querySelector('td-checkbox');
    el.querySelector('.td-checkbox-input').click(); // uncheck
    expect(new FormData(form).get('t')).to.equal(null);
    form.reset();
    expect(el.hasAttribute('checked')).to.equal(true);
    expect(new FormData(form).get('t')).to.equal('on');
  });

  it('<fieldset disabled> omits it from submission', () => {
    const form = mount('<form><fieldset disabled><td-checkbox name="t" checked></td-checkbox></fieldset></form>');
    const el = form.querySelector('td-checkbox');
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('t')).to.equal(null);
  });

  it('reset restores the default value attribute too (ISSUE-2)', () => {
    const form = mount('<form><td-checkbox name="c" value="yes" checked></td-checkbox></form>');
    const el = form.querySelector('td-checkbox');
    el.setAttribute('value', 'no');
    expect(new FormData(form).get('c')).to.equal('no');
    form.reset();
    expect(new FormData(form).get('c')).to.equal('yes');
  });
});

describe('td-toggle (form-associated, uncontrolled by default)', () => {
  it('uncontrolled: click self-toggles, emits change, and submits', () => {
    const form = mount('<form><td-toggle name="sw"></td-toggle></form>');
    const el = form.querySelector('td-toggle');
    let detail = null;
    el.addEventListener('change', (e) => { detail = e.detail; });
    expect(new FormData(form).get('sw')).to.equal(null);
    el.querySelector('label').click();
    expect(el.hasAttribute('checked')).to.equal(true); // self-toggled
    expect(detail).to.deep.equal({ checked: true });
    expect(new FormData(form).get('sw')).to.equal('on');
  });

  it('controlled: click emits change but does NOT self-toggle', () => {
    const form = mount('<form><td-toggle name="sw" controlled></td-toggle></form>');
    const el = form.querySelector('td-toggle');
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    el.querySelector('label').click();
    expect(fired).to.equal(true);
    expect(el.hasAttribute('checked')).to.equal(false); // NOT self-toggled
    expect(new FormData(form).get('sw')).to.equal(null);
  });

  it('required + off fails validity', () => {
    const form = mount('<form><td-toggle name="sw" required></td-toggle></form>');
    const el = form.querySelector('td-toggle');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    el.querySelector('label').click();
    expect(el.checkValidity()).to.equal(true);
  });

  it('reset restores the default state', () => {
    const form = mount('<form><td-toggle name="sw"></td-toggle></form>');
    const el = form.querySelector('td-toggle');
    el.querySelector('label').click();
    expect(new FormData(form).get('sw')).to.equal('on');
    form.reset();
    expect(el.hasAttribute('checked')).to.equal(false);
    expect(new FormData(form).get('sw')).to.equal(null);
  });
});

describe('td-slider (form-associated)', () => {
  it('submits its numeric value and updates on change', () => {
    const form = mount('<form><td-slider name="vol" value="30" min="0" max="100"></td-slider></form>');
    const el = form.querySelector('td-slider');
    expect(new FormData(form).get('vol')).to.equal('30');
    const input = el.querySelector('.td-slider-input');
    input.value = '70';
    input.dispatchEvent(new Event('input'));
    expect(new FormData(form).get('vol')).to.equal('70');
  });

  it('reset restores the default value after interaction', () => {
    const form = mount('<form><td-slider name="vol" value="30" min="0" max="100"></td-slider></form>');
    const el = form.querySelector('td-slider');
    const input = el.querySelector('.td-slider-input');
    input.value = '85';
    input.dispatchEvent(new Event('change'));
    expect(new FormData(form).get('vol')).to.equal('85');
    form.reset();
    expect(new FormData(form).get('vol')).to.equal('30');
  });

  it('<fieldset disabled> omits it from submission', () => {
    const form = mount('<form><fieldset disabled><td-slider name="vol" value="30"></td-slider></fieldset></form>');
    const el = form.querySelector('td-slider');
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('vol')).to.equal(null);
  });

  it('validates the component value, not the clamped native value (ISSUE-1)', () => {
    const form = mount('<form><td-slider name="vol" value="200" min="0" max="100"></td-slider></form>');
    const el = form.querySelector('td-slider');
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(new FormData(form).get('vol')).to.equal('200');
  });

  it('reset restores the absent-value default consistently with nonzero min (ISSUE-3)', () => {
    const form = mount('<form><td-slider name="s" min="10" max="100"></td-slider></form>');
    const initial = new FormData(form).get('s'); // resolves to the '0' default
    const input = form.querySelector('.td-slider-input');
    input.value = '50';
    input.dispatchEvent(new Event('change'));
    expect(new FormData(form).get('s')).to.equal('50');
    form.reset();
    expect(new FormData(form).get('s')).to.equal(initial); // back to the captured initial, not min
  });
});

describe('td-button (form submit/reset)', () => {
  it('type="submit" submits the enclosing form on click', () => {
    const form = mount('<form><td-button type="submit" label="Go"></td-button></form>');
    const btn = form.querySelector('td-button').querySelector('button');
    expect(btn.type).to.equal('submit');
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    btn.click();
    expect(submitted).to.equal(true);
  });

  it('default type="button" does NOT submit the form', () => {
    const form = mount('<form><td-button label="Nope"></td-button></form>');
    const btn = form.querySelector('td-button').querySelector('button');
    expect(btn.type).to.equal('button');
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    btn.click();
    expect(submitted).to.equal(false);
  });

  it('type="reset" resets the form on click', () => {
    const form = mount('<form><input name="x" value="orig"><td-button type="reset" label="Reset"></td-button></form>');
    const input = form.querySelector('input');
    input.value = 'changed';
    form.querySelector('td-button').querySelector('button').click();
    expect(input.value).to.equal('orig');
  });

  it('disabled type="submit" does not submit', () => {
    const form = mount('<form><td-button type="submit" disabled label="Go"></td-button></form>');
    const btn = form.querySelector('td-button').querySelector('button');
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    btn.click();
    expect(submitted).to.equal(false);
  });
});
