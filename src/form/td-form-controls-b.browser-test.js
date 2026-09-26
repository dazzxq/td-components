import { expect } from '@esm-bundle/chai';
import './td-input-field.js';
import './td-dropdown.js';
import './td-datetime-picker.js';

// A real submit would navigate/reload and kill the mocha session.
document.addEventListener('submit', (e) => e.preventDefault(), true);

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => { container.innerHTML = ''; });

describe('td-input-field (form-associated)', () => {
  it('submits its value through the host', () => {
    const form = mount('<form><td-input-field name="title" value="hi"></td-input-field></form>');
    expect(new FormData(form).get('title')).to.equal('hi');
  });

  it('the inner control carries NO name and NO required (0.2.0 BREAKING)', () => {
    const form = mount('<form><td-input-field name="x" value="v" required></td-input-field></form>');
    const inner = form.querySelector('input');
    expect(inner.hasAttribute('name')).to.equal(false);
    expect(inner.hasAttribute('required')).to.equal(false);
  });

  it('required + empty fails validity and blocks submit', () => {
    const form = mount('<form><td-input-field name="x" required></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    form.requestSubmit();
    expect(submitted).to.equal(false);
    // Type something → becomes valid + submittable.
    const inner = el.querySelector('.td-field__control');
    inner.value = 'abc';
    inner.dispatchEvent(new Event('input'));
    expect(el.checkValidity()).to.equal(true);
    expect(new FormData(form).get('x')).to.equal('abc');
  });

  it('email type computes typeMismatch on the host (inner is rendered as text)', () => {
    const form = mount('<form><td-input-field name="e" type="email" value="bad"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.querySelector('.td-field__control').getAttribute('type')).to.equal('text');
    expect(el.validity.typeMismatch).to.equal(true);
    const inner = el.querySelector('.td-field__control');
    inner.value = 'a@b.com';
    inner.dispatchEvent(new Event('input'));
    expect(el.validity.typeMismatch).to.equal(false);
    expect(el.checkValidity()).to.equal(true);
  });

  it('number type computes range validity against min/max', () => {
    const form = mount('<form><td-input-field name="n" type="number" value="200" min="0" max="100"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(new FormData(form).get('n')).to.equal('200'); // still submits the raw string
  });

  it('number type rejects non-numeric text as badInput (ISSUE-1)', () => {
    const form = mount('<form><td-input-field name="n" type="number"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    const inner = el.querySelector('.td-field__control');
    inner.value = 'abc';
    inner.dispatchEvent(new Event('input'));
    expect(el.validity.badInput).to.equal(true);
    expect(el.checkValidity()).to.equal(false);
    inner.value = '42';
    inner.dispatchEvent(new Event('input'));
    expect(el.checkValidity()).to.equal(true);
  });

  it('reset restores the default value after typing', () => {
    const form = mount('<form><td-input-field name="x" value="hello"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    const inner = el.querySelector('.td-field__control');
    inner.value = 'world';
    inner.dispatchEvent(new Event('input'));
    expect(new FormData(form).get('x')).to.equal('world');
    form.reset();
    expect(new FormData(form).get('x')).to.equal('hello');
  });

  it('<fieldset disabled> omits it from submission', () => {
    const form = mount('<form><fieldset disabled><td-input-field name="x" value="v"></td-input-field></fieldset></form>');
    const el = form.querySelector('td-input-field');
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('x')).to.equal(null);
  });

  it('textarea variant submits + validates too', () => {
    const form = mount('<form><td-input-field name="bio" type="textarea" required></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.validity.valueMissing).to.equal(true);
    const inner = el.querySelector('textarea');
    expect(inner.hasAttribute('name')).to.equal(false);
    inner.value = 'some text';
    inner.dispatchEvent(new Event('input'));
    expect(new FormData(form).get('bio')).to.equal('some text');
  });

  // --- date type (new) ---

  it('type="date" renders a native date input (not text)', () => {
    const form = mount('<form><td-input-field name="d" type="date" value="2026-06-10"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    const inner = el.querySelector('.td-field__control');
    expect(inner.getAttribute('type')).to.equal('date');
    expect(inner.hasAttribute('name')).to.equal(false); // host owns submission
    expect(new FormData(form).get('d')).to.equal('2026-06-10');
  });

  it('type="date" forwards min/max to the inner control', () => {
    const form = mount('<form><td-input-field name="d" type="date" min="2026-01-01" max="2026-12-31"></td-input-field></form>');
    const inner = form.querySelector('.td-field__control');
    expect(inner.getAttribute('min')).to.equal('2026-01-01');
    expect(inner.getAttribute('max')).to.equal('2026-12-31');
  });

  it('type="date" computes range validity on the host', () => {
    const form = mount('<form><td-input-field name="d" type="date" value="2027-01-01" min="2026-01-01" max="2026-12-31"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(el.checkValidity()).to.equal(false);
    el.setAttribute('value', '2026-06-10');
    expect(el.checkValidity()).to.equal(true);
    expect(new FormData(form).get('d')).to.equal('2026-06-10');
  });

  it('type="date" required + empty blocks submit', () => {
    const form = mount('<form><td-input-field name="d" type="date" required></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.checkValidity()).to.equal(false);
  });
});

describe('td-dropdown (form-associated)', () => {
  function mountDropdown(attrs = '') {
    const form = mount(`<form><td-dropdown name="city" ${attrs}></td-dropdown></form>`);
    const el = form.querySelector('td-dropdown');
    el.options = [
      { value: 'hn', label: 'Hà Nội' },
      { value: 'sg', label: 'Sài Gòn' },
    ];
    return { form, el };
  }

  it('submits the resolved initial value', () => {
    const { form } = mountDropdown('value="sg"');
    expect(new FormData(form).get('city')).to.equal('sg');
  });

  it('nothing selected submits null', () => {
    const { form } = mountDropdown();
    expect(new FormData(form).get('city')).to.equal(null);
  });

  it('required + nothing selected blocks submit, selecting clears it', () => {
    const { form, el } = mountDropdown('required');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.valueMissing).to.equal(true);
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    form.requestSubmit();
    expect(submitted).to.equal(false);
    el.setValue('hn');
    expect(el.checkValidity()).to.equal(true);
    expect(new FormData(form).get('city')).to.equal('hn');
  });

  it('selecting an option via the menu updates FormData', () => {
    const { form, el } = mountDropdown();
    el.open();
    const opt = el._menuElement.querySelector('.td-dropdown-option[data-value="sg"]');
    opt.click();
    expect(new FormData(form).get('city')).to.equal('sg');
    expect(el.getValue()).to.equal('sg');
  });

  it('reset restores the default selection', () => {
    const { form, el } = mountDropdown('value="hn"');
    el.setValue('sg');
    expect(new FormData(form).get('city')).to.equal('sg');
    form.reset();
    expect(new FormData(form).get('city')).to.equal('hn');
  });

  it('<fieldset disabled> omits it from submission', () => {
    const form = mount('<form><fieldset disabled><td-dropdown name="city" value="hn"></td-dropdown></fieldset></form>');
    const el = form.querySelector('td-dropdown');
    el.options = [{ value: 'hn', label: 'Hà Nội' }];
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('city')).to.equal(null);
  });

  it('resolves a value set BEFORE options load (async, ISSUE-2)', () => {
    const form = mount('<form><td-dropdown name="city"></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    el.setValue('sg'); // options not loaded yet → pending
    expect(new FormData(form).get('city')).to.equal(null);
    el.options = [{ value: 'hn', label: 'Hà Nội' }, { value: 'sg', label: 'Sài Gòn' }];
    expect(el.getValue()).to.equal('sg');
    expect(new FormData(form).get('city')).to.equal('sg');
  });

  it('updateData() also resolves a pending value (ISSUE-6)', () => {
    const form = mount('<form><td-dropdown name="city"></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    el.setValue('sg'); // pending
    expect(new FormData(form).get('city')).to.equal(null);
    el.updateData([{ value: 'sg', label: 'Sài Gòn' }]);
    expect(el.getValue()).to.equal('sg');
    expect(new FormData(form).get('city')).to.equal('sg');
  });

  it('setting an unknown value drops a stale selection (ISSUE-4)', () => {
    const { form, el } = mountDropdown('value="hn"');
    expect(new FormData(form).get('city')).to.equal('hn');
    el.setValue('nope'); // not in options
    expect(el.getValue()).to.equal(null);
    expect(new FormData(form).get('city')).to.equal(null);
    // and it resolves once that option appears
    el.options = [{ value: 'nope', label: 'Later' }];
    expect(el.getValue()).to.equal('nope');
    expect(new FormData(form).get('city')).to.equal('nope');
  });

  // --- searchable / allow-clear toggle (bug fix: _isSearchable/_isAllowClear were always true) ---

  it('searchable defaults ON (search box rendered)', () => {
    const { el } = mountDropdown();
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-search')).to.not.equal(null);
  });

  it('searchable="false" disables the search box', () => {
    const { el } = mountDropdown('searchable="false"');
    expect(el._isSearchable()).to.equal(false);
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-search')).to.equal(null);
  });

  it('bare `searchable` attribute keeps it ON', () => {
    const { el } = mountDropdown('searchable');
    expect(el._isSearchable()).to.equal(true);
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-search')).to.not.equal(null);
  });

  it('allow-clear defaults ON (clear option shown when selected)', () => {
    const { el } = mountDropdown('value="hn"');
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-option-clear')).to.not.equal(null);
  });

  it('allow-clear="false" hides the clear option', () => {
    const { el } = mountDropdown('value="hn" allow-clear="false"');
    expect(el._isAllowClear()).to.equal(false);
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-option-clear')).to.equal(null);
  });

  // JS property API must be able to disable the default-ON flags (codex ISSUE-1).
  it('JS property `searchable = false` disables it; getter stays boolean', () => {
    const { el } = mountDropdown();
    expect(el.searchable).to.equal(true);              // default ON, boolean (not "")
    el.searchable = false;
    expect(el.searchable).to.equal(false);             // getter reflects the change
    expect(el.getAttribute('searchable')).to.equal('false');
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-search')).to.equal(null);
  });

  it('JS property `searchable = true` re-enables a disabled flag', () => {
    const { el } = mountDropdown('searchable="false"');
    expect(el.searchable).to.equal(false);
    el.searchable = true;
    expect(el.searchable).to.equal(true);
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-search')).to.not.equal(null);
  });

  it('JS property `allowClear = false` disables the clear option', () => {
    const { el } = mountDropdown('value="hn"');
    expect(el.allowClear).to.equal(true);
    el.allowClear = false;
    expect(el.allowClear).to.equal(false);
    el.open();
    expect(el._menuElement.querySelector('.td-dropdown-option-clear')).to.equal(null);
  });
});

describe('td-datetime-picker (form-associated)', () => {
  it('submits ISO 8601 by default', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    expect(new FormData(form).get('dt')).to.equal('2026-06-15T10:30:00');
  });

  it('form-value-format="display" submits the display string', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30" form-value-format="display"></td-datetime-picker></form>');
    expect(new FormData(form).get('dt')).to.equal('15/06/2026 - 10:30');
  });

  it('form-value-format="db" submits the DB string', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30" form-value-format="db"></td-datetime-picker></form>');
    expect(new FormData(form).get('dt')).to.equal('2026-06-15 10:30:00');
  });

  it('an invalid date sets badInput and blocks submit', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="31/02/2026 - 10:00"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.badInput).to.equal(true);
    let submitted = false;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    form.requestSubmit();
    expect(submitted).to.equal(false);
  });

  it('reset restores the default value', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    el.setValue('20/12/2027 - 08:15');
    expect(new FormData(form).get('dt')).to.equal('2027-12-20T08:15:00');
    form.reset();
    expect(new FormData(form).get('dt')).to.equal('2026-06-15T10:30:00');
  });

  it('<fieldset disabled> omits it from submission', () => {
    const form = mount('<form><fieldset disabled><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></fieldset></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(el._effectiveDisabled).to.equal(true);
    expect(new FormData(form).get('dt')).to.equal(null);
  });

  it('no value submits null; required + no value is valueMissing (ISSUE-3)', () => {
    const form = mount('<form><td-datetime-picker name="dt"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(new FormData(form).get('dt')).to.equal(null);
    expect(el.checkValidity()).to.equal(true); // not required → valid

    const form2 = mount('<form><td-datetime-picker name="dt2" required></td-datetime-picker></form>');
    const el2 = form2.querySelector('td-datetime-picker');
    expect(el2.validity.valueMissing).to.equal(true);
    expect(new FormData(form2).get('dt2')).to.equal(null);
  });

  it('clearing the value attribute removes it from submission (ISSUE-3)', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(new FormData(form).get('dt')).to.equal('2026-06-15T10:30:00');
    el.removeAttribute('value');
    expect(new FormData(form).get('dt')).to.equal(null);
  });

  it('a malformed value is badInput and never submits a stale date (ISSUE-5)', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(new FormData(form).get('dt')).to.equal('2026-06-15T10:30:00');
    el.setValue('garbage');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.badInput).to.equal(true);
    // The submitted value must NOT be the stale 2026-06-15 ISO date.
    expect(new FormData(form).get('dt')).to.not.equal('2026-06-15T10:30:00');
    expect(new FormData(form).get('dt')).to.equal('garbage');
  });
});
