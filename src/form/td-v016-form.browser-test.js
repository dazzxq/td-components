import { expect } from '@esm-bundle/chai';
import { TdInputField } from './td-input-field.js';
import { TdCheckbox } from './td-checkbox.js';
import { TdToggle } from './td-toggle.js';
import { TdSlider } from './td-slider.js';
import './td-button.js';

// v0.16.0 group A (A2–A7): input-field live `value`, pattern/minlength, translatable messages, checkable state
// restore, slider (no required, snap, default = min), site inline CSS vars kept across re-renders.

document.addEventListener('submit', (e) => e.preventDefault(), true);

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => { container.innerHTML = ''; });

/** Simulate a user edit of the inner control. */
function type(el, text) {
  const input = el.querySelector('.td-field__control');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return input;
}

/** Run `fn` with a static messages object temporarily overridden. */
function withMessages(Cls, over, fn) {
  const saved = { ...Cls.messages };
  Object.assign(Cls.messages, over);
  try { fn(); } finally {
    for (const k of Object.keys(Cls.messages)) delete Cls.messages[k];
    Object.assign(Cls.messages, saved);
  }
}

describe('A2 td-input-field.value is the live value', () => {
  it('typing updates .value (attribute keeps the initial value)', () => {
    const el = mount('<td-input-field value="đầu"></td-input-field>');
    expect(el.value).to.equal('đầu');
    type(el, 'mới gõ');
    expect(el.value).to.equal('mới gõ');
    expect(el.getValue()).to.equal('mới gõ');
    expect(el.getAttribute('value')).to.equal('đầu');
  });

  it('setting .value = setValue() (control updated, max-length truncation applies)', () => {
    const el = mount('<td-input-field max-length="3"></td-input-field>');
    el.value = 'abcdef';
    expect(el.querySelector('.td-field__control').value).to.equal('abc');
    expect(el.value).to.equal('abc');
  });

  it('before connect: .value reads/writes the attribute; an early value is kept', () => {
    const el = document.createElement('td-input-field');
    el.value = 'sớm';
    expect(el.value).to.equal('sớm');
    container.appendChild(el);
    expect(el.querySelector('.td-field__control').value).to.equal('sớm');
    expect(el.value).to.equal('sớm');
  });
});

describe('A3 td-input-field pattern / minlength', () => {
  it('pattern → patternMismatch on the whole value; empty is valid', () => {
    const el = mount('<td-input-field pattern="[0-9]{3}"></td-input-field>');
    expect(el.validity.valid).to.equal(true);
    type(el, '12a');
    expect(el.validity.patternMismatch).to.equal(true);
    expect(el.validationMessage).to.equal(TdInputField.messages.patternMismatch);
    type(el, '1234'); // whole-value match, like native
    expect(el.validity.patternMismatch).to.equal(true);
    type(el, '123');
    expect(el.validity.valid).to.equal(true);
    el.setAttribute('pattern', '[a-z]+');
    expect(el.validity.patternMismatch).to.equal(true);
    el.removeAttribute('pattern');
    expect(el.validity.valid).to.equal(true);
  });

  it('pattern is ignored for number (like native)', () => {
    const el = mount('<td-input-field type="number" pattern="x"></td-input-field>');
    type(el, '5');
    expect(el.validity.valid).to.equal(true);
  });

  it('minlength → tooShort only after a user edit; programmatic values never trip it', () => {
    const el = mount('<td-input-field minlength="4" value="ab"></td-input-field>');
    expect(el.validity.valid).to.equal(true); // initial attribute value: not user-edited
    el.setValue('abc');
    expect(el.validity.valid).to.equal(true);
    type(el, 'abc');
    expect(el.validity.tooShort).to.equal(true);
    expect(el.validationMessage).to.equal('Tối thiểu 4 ký tự');
    type(el, 'abcd');
    expect(el.validity.valid).to.equal(true);
    type(el, '');
    expect(el.validity.valid).to.equal(true); // empty is never tooShort
    type(el, 'a');
    expect(el.validity.tooShort).to.equal(true);
    el.value = 'a'; // programmatic → flag cleared
    expect(el.validity.valid).to.equal(true);
  });
});

describe('A4 translatable validation messages', () => {
  it('TdInputField.messages defaults keep the current Vietnamese texts', () => {
    const el = mount('<td-input-field required></td-input-field>');
    expect(el.validationMessage).to.equal('Trường này là bắt buộc');
    expect(TdInputField.messages.tooLong).to.equal('Vượt quá giới hạn {maxLength} {unit}');
    const email = mount('<td-input-field type="email"></td-input-field>');
    type(email, 'x');
    expect(email.validationMessage).to.equal('Email không hợp lệ');
    const num = mount('<td-input-field type="number" min="5"></td-input-field>');
    type(num, '1');
    expect(num.validationMessage).to.equal('Giá trị tối thiểu là 5');
  });

  it('overriding TdInputField.messages changes validity + counter texts', () => {
    withMessages(TdInputField, {
      valueMissing: 'Required', rangeOverflow: 'Max {max}', unitChar: 'chars', tooLong: 'Over {maxLength} {unit}',
    }, () => {
      expect(mount('<td-input-field required></td-input-field>').validationMessage).to.equal('Required');
      const num = mount('<td-input-field type="number" max="3"></td-input-field>');
      type(num, '9');
      expect(num.validationMessage).to.equal('Max 3');
      const lim = mount('<td-input-field max-length="5"></td-input-field>');
      expect(lim.querySelector('.td-field__counter').textContent).to.equal('0/5 chars');
      lim.querySelector('.td-field__control').removeAttribute('maxlength');
      type(lim, 'abcdefg');
      expect(lim.validationMessage).to.equal('Over 5 chars');
    });
  });

  it('TdCheckbox / TdToggle / TdSlider messages', () => {
    const cb = mount('<td-checkbox required></td-checkbox>');
    expect(cb.validationMessage).to.equal('Vui lòng chọn ô này.');
    const tg = mount('<td-toggle required></td-toggle>');
    expect(tg.validationMessage).to.equal('Vui lòng bật tùy chọn này.');
    const sl = mount('<td-slider min="10" max="20" value="30"></td-slider>');
    expect(sl.validationMessage).to.equal('Giá trị tối đa là 20.');
    withMessages(TdCheckbox, { valueMissing: 'Tick it' }, () => {
      expect(mount('<td-checkbox required></td-checkbox>').validationMessage).to.equal('Tick it');
    });
    withMessages(TdToggle, { valueMissing: 'Turn it on' }, () => {
      expect(mount('<td-toggle required></td-toggle>').validationMessage).to.equal('Turn it on');
    });
    withMessages(TdSlider, { rangeUnderflow: 'Min {min}', stepMismatch: 'Step {step}' }, () => {
      expect(mount('<td-slider min="10" value="2"></td-slider>').validationMessage).to.equal('Min 10');
      expect(mount('<td-slider step="5" value="3"></td-slider>').validationMessage).to.equal('Step 5');
    });
  });
});

describe('A5 checkbox/toggle restore `checked` from form state', () => {
  for (const tag of ['td-checkbox', 'td-toggle']) {
    it(`${tag}: restore 'on' → checked, null → unchecked; value attribute untouched`, () => {
      const form = mount(`<form><${tag} name="x" value="yes"></${tag}></form>`);
      const el = form.querySelector(tag);
      el.formStateRestoreCallback('yes', 'restore');
      expect(el.hasAttribute('checked')).to.equal(true);
      expect(el.querySelector('input').checked).to.equal(true);
      expect(el.getAttribute('value')).to.equal('yes');
      expect(new FormData(form).get('x')).to.equal('yes');
      el.formStateRestoreCallback(null, 'restore');
      expect(el.hasAttribute('checked')).to.equal(false);
      expect(el.getAttribute('value')).to.equal('yes');
      expect(new FormData(form).get('x')).to.equal(null);
    });

    it(`${tag}: no value attribute → restoring 'on' does not add one`, () => {
      const el = mount(`<${tag}></${tag}>`);
      el.formStateRestoreCallback('on', 'restore');
      expect(el.hasAttribute('checked')).to.equal(true);
      expect(el.hasAttribute('value')).to.equal(false);
    });
  }
});

describe('A6 td-slider', () => {
  it('`required` is not observed (no property, no valueMissing)', () => {
    expect(TdSlider.observedAttributes).to.not.include('required');
    const el = mount('<td-slider required></td-slider>');
    expect(el.validity.valueMissing).to.equal(false);
    expect(el.validity.valid).to.equal(true);
  });

  it('no value → min (no false rangeUnderflow), submitted as min', () => {
    const form = mount('<form><td-slider name="s" min="10" max="50"></td-slider></form>');
    const el = form.querySelector('td-slider');
    expect(el.validity.valid).to.equal(true);
    expect(el.getValue()).to.equal(10);
    expect(new FormData(form).get('s')).to.equal('10');
    form.reset();
    expect(el.validity.valid).to.equal(true);
    expect(new FormData(form).get('s')).to.equal('10');
  });

  it('setValue() clamps and snaps to step (like native)', () => {
    const el = mount('<td-slider min="0" max="10" step="3"></td-slider>');
    el.setValue(4);
    expect(el.getAttribute('value')).to.equal('3');
    el.setValue(5);
    expect(el.getAttribute('value')).to.equal('6');
    el.setValue(10); // nearest step 9 (12 is past max)
    expect(el.getAttribute('value')).to.equal('9');
    el.setValue(-4);
    expect(el.getAttribute('value')).to.equal('0');
    expect(el.validity.valid).to.equal(true);
    const dec = mount('<td-slider min="0" max="1" step="0.1"></td-slider>');
    dec.setValue(0.34);
    expect(dec.getAttribute('value')).to.equal('0.3');
  });
});

describe('A7 site inline CSS vars survive re-renders', () => {
  const cases = [
    ['td-button', '--td-btn-bg', 'variant', 'secondary', 'Nút'],
    ['td-checkbox', '--td-checkbox-color', 'size', 'lg', ''],
    ['td-toggle', '--td-switch-on', 'size', 'lg', ''],
    ['td-slider', '--td-slider-color', 'size', 'lg', ''],
    ['td-slider', '--td-slider-track', 'label', 'Âm lượng', ''],
  ];
  for (const [tag, prop, attr, val, text] of cases) {
    it(`${tag}: ${prop} set by the site before and after the first render is kept`, () => {
      const pre = document.createElement(tag);
      pre.textContent = text;
      pre.style.setProperty(prop, 'rgb(1, 2, 3)');
      container.appendChild(pre);
      pre.setAttribute(attr, val);
      expect(pre.style.getPropertyValue(prop)).to.equal('rgb(1, 2, 3)');

      const post = mount(`<${tag}>${text}</${tag}>`);
      post.style.setProperty(prop, 'rgb(4, 5, 6)');
      post.setAttribute(attr, val);
      post.setAttribute('color', 'not a colour'); // invalid → token default, still not the site's var
      expect(post.style.getPropertyValue(prop)).to.equal('rgb(4, 5, 6)');
    });
  }

  it('a colour the component set is still removed when the attribute goes', () => {
    const el = mount('<td-checkbox color="#ff0000"></td-checkbox>');
    expect(el.style.getPropertyValue('--td-checkbox-color')).to.not.equal('');
    el.removeAttribute('color');
    expect(el.style.getPropertyValue('--td-checkbox-color')).to.equal('');
    const btn = mount('<td-button color="#00aa00">Lưu</td-button>');
    expect(btn.style.getPropertyValue('--td-btn-bg')).to.not.equal('');
    btn.removeAttribute('color');
    expect(btn.style.getPropertyValue('--td-btn-bg')).to.equal('');
    expect(btn.style.getPropertyValue('--td-btn-fg')).to.equal('');
  });
});
