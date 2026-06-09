import { expect } from '@esm-bundle/chai';
import { TdFormElement } from './td-form-element.js';

/**
 * A minimal concrete control built on TdFormElement, used to prove the base
 * contract in a REAL browser (FormData, constraint validation, reset,
 * <fieldset disabled>, label association).
 */
class TdTestInput extends TdFormElement {
  static get observedAttributes() { return [...super.observedAttributes, 'value', 'label']; }

  render() {
    const v = this.getAttribute('value') ?? '';
    const label = this.getAttribute('label') ?? '';
    const dis = this._effectiveDisabled ? 'disabled' : '';
    const labelHtml = label ? `<label for="${this.id}">${this.escapeHtml(label)}</label>` : '';
    return `${labelHtml}<input type="text" value="${this.escapeHtml(v)}" ${dis}>`;
  }

  afterRender() {
    const input = this.querySelector('input');
    if (!input) return;
    this.listen(input, 'input', () => this._sync(input.value));
    this._sync(input.value);
  }

  /** @private */
  _sync(v) {
    this._setFormValue(v === '' ? null : v);
    if (this.hasAttribute('required') && v === '') {
      this._setValidity({ valueMissing: true }, 'This field is required');
    } else {
      this._setValidity({});
    }
  }

  _restoreDefaults() {
    const input = this.querySelector('input');
    if (input) input.value = this._defaultValue;
    this._sync(this._defaultValue);
  }
}
if (!customElements.get('td-test-input')) customElements.define('td-test-input', TdTestInput);

// A real form submit in the runner would NAVIGATE/reload the page and destroy the
// mocha session; block all navigation defensively.
document.addEventListener('submit', (e) => e.preventDefault(), true);

// Mount fixtures inside a dedicated container that is fully emptied between tests.
const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}

describe('TdFormElement (real browser)', () => {
  afterEach(() => { container.innerHTML = ''; });

  it('is a form-associated custom element', () => {
    expect(TdTestInput.formAssociated).to.equal(true);
    const el = mount('<td-test-input name="f"></td-test-input>');
    expect(typeof el._internals).to.equal('object');
    expect(typeof el._internals.setFormValue).to.equal('function');
  });

  it('submits its value via FormData', () => {
    const form = mount('<form><td-test-input name="field" value="hello"></td-test-input></form>');
    expect(new FormData(form).get('field')).to.equal('hello');
  });

  it('omits an empty value from FormData', () => {
    const form = mount('<form><td-test-input name="field"></td-test-input></form>');
    expect(new FormData(form).get('field')).to.equal(null);
  });

  it('required + empty fails checkValidity and blocks submit', () => {
    const form = mount('<form><td-test-input name="f" required></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);

    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    form.requestSubmit();
    expect(submitted).to.equal(false); // invalid → submit never fires
  });

  it('passes validity once required is satisfied', () => {
    const form = mount('<form><td-test-input name="f" required></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    const input = el.querySelector('input');
    input.value = 'filled';
    input.dispatchEvent(new Event('input'));
    expect(el.checkValidity()).to.equal(true);
    expect(new FormData(form).get('f')).to.equal('filled');
  });

  it('reset restores the default value AFTER user interaction', () => {
    const form = mount('<form><td-test-input name="f" value="orig"></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    const input = el.querySelector('input');

    input.value = 'changed';
    input.dispatchEvent(new Event('input'));
    expect(new FormData(form).get('f')).to.equal('changed');

    form.reset();
    expect(input.value).to.equal('orig');
    expect(new FormData(form).get('f')).to.equal('orig');
  });

  it('<fieldset disabled> removes the control from submission', () => {
    const form = mount('<form><fieldset disabled><td-test-input name="f" value="x"></td-test-input></fieldset></form>');
    const el = form.querySelector('td-test-input');
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('f')).to.equal(null);
  });

  it('fieldset-disabled does NOT reflect onto the disabled attribute', () => {
    const form = mount('<form><fieldset disabled><td-test-input name="f" value="x"></td-test-input></fieldset></form>');
    const el = form.querySelector('td-test-input');
    expect(el.hasAttribute('disabled')).to.equal(false);
  });

  it('associates an external <label for> and exposes it via el.labels', () => {
    const form = mount('<form><label for="lbl-host">Name</label><td-test-input id="lbl-host" name="f"></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    expect(el.labels.length).to.equal(1);
    expect(el.labels[0].textContent).to.equal('Name');
  });

  it('focus() delegates to the inner control (label click → inner input)', () => {
    const form = mount('<form><label for="lbl-host2">Name</label><td-test-input id="lbl-host2" name="f"></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    const input = el.querySelector('input');
    el.focus();
    expect(document.activeElement).to.equal(input);
  });

  it('auto-assigns a host id when none is given, and the inner control has no id', () => {
    const el = mount('<td-test-input name="f"></td-test-input>');
    expect(el.id).to.be.a('string').that.is.not.empty;
    expect(el.querySelector('input').id).to.equal('');
  });

  it('setCustomValidity("") clears the custom error WITHOUT wiping base constraints', () => {
    const form = mount('<form><td-test-input name="f" required></td-test-input></form>');
    const el = form.querySelector('td-test-input');
    expect(el.validity.valueMissing).to.equal(true); // base flag from required + empty

    el.setCustomValidity('Custom problem');
    expect(el.validity.customError).to.equal(true);
    expect(el.validity.valueMissing).to.equal(true); // base flag still present

    el.setCustomValidity(''); // clear ONLY the custom error
    expect(el.validity.customError).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true); // base constraint survives (ISSUE-2)
  });
});
