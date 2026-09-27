import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-input-field.js';
import { TdInputField } from './td-input-field.js';
import { TdButton } from './td-button.js';

/** v0.14.1: resting control borders are soft (--td-control-border-soft, visible ≥ 1.3:1); the hover / strong border
 *  (--td-control-border-strong) keeps ≥ 3:1. Resolves a token to a computed colour. */
function tokenColor(name) {
  const p = document.createElement('span');
  p.style.setProperty('color', `var(${name})`);
  document.body.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
}

// v0.8.0 batch 2 — td-input-field token-native (plan docs/plans/v0.8.0-batch2.md step 2). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const ctl = (el) => el.querySelector('.td-field__control');
afterEach(() => {
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  document.body.style.removeProperty('background');
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const lum = (c) => TdButton._luminance(c);
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ids = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);

describe('batch 2 — td-input-field DOM contract', () => {
  it('renders the .td-field BEM block with no legacy/Tailwind classes and no inline styles', () => {
    const el = mount('<td-input-field id="f1" label="Họ tên" helper-text="Gợi ý" max-length="10" size="lg"></td-input-field>');
    expect(el.querySelector('.td-field.td-field--lg') !== null).to.equal(true);
    expect(el.querySelector('label.td-field__label') !== null).to.equal(true);
    expect(el.querySelector('input.td-field__control') !== null).to.equal(true);
    expect(el.querySelector('.td-field__footer .td-field__note').textContent).to.equal('Gợi ý');
    expect(el.querySelector('.td-field__footer .td-field__counter').textContent).to.equal('0/10 ký tự');
    expect(el.querySelector('[class*="td-input"], .w-full, .block, .text-sm')).to.equal(null);
    expect(el.querySelector('[style]')).to.equal(null);
  });

  it('methods live on the prototype (usable before the first connect)', () => {
    const el = document.createElement('td-input-field');
    for (const m of ['getValue', 'setValue', 'setError', 'setHelper', 'setDisabled', 'setReadOnly', 'clearError']) {
      expect(typeof el[m]).to.equal('function');
      expect(Object.prototype.hasOwnProperty.call(el, m)).to.equal(false);
    }
    el.setValue('trước khi gắn');
    host.appendChild(el);
    expect(el.getValue()).to.equal('trước khi gắn');
  });

  it('textarea and editable modifiers', () => {
    const t = mount('<td-input-field type="textarea" rows="3"></td-input-field>');
    expect(t.querySelector('.td-field--textarea textarea.td-field__control').getAttribute('rows')).to.equal('3');
    const e = mount('<td-input-field type="contenteditable" placeholder="Viết gì đó"></td-input-field>');
    const div = e.querySelector('.td-field--editable div.td-field__control');
    expect(div.getAttribute('role')).to.equal('textbox');
    expect(div.getAttribute('aria-multiline')).to.equal('true');
    expect(div.getAttribute('aria-placeholder')).to.equal('Viết gì đó');
    expect(div.getAttribute('contenteditable')).to.equal('true');
  });
});

describe('batch 2 — td-input-field accessible name', () => {
  it('internal label: for = {host}-control by default', () => {
    const el = mount('<td-input-field id="nm" label="Họ tên"></td-input-field>');
    const input = ctl(el);
    expect(input.id).to.equal('nm-control');
    expect(el.querySelector('label').getAttribute('for')).to.equal('nm-control');
    expect(input.labels[0].textContent).to.equal('Họ tên');
  });

  it('internal label: an explicit field-id is used verbatim', () => {
    const el = mount('<td-input-field id="nm2" field-id="my-custom-id" label="Email"></td-input-field>');
    expect(ctl(el).id).to.equal('my-custom-id');
    expect(el.querySelector('label').getAttribute('for')).to.equal('my-custom-id');
  });

  it('host aria-label is forwarded (and updated in place)', () => {
    const el = mount('<td-input-field aria-label="Tìm kiếm"></td-input-field>');
    const input = ctl(el);
    expect(input.getAttribute('aria-label')).to.equal('Tìm kiếm');
    el.setAttribute('aria-label', 'Tìm nhanh');
    expect(ctl(el) === input).to.equal(true);
    expect(input.getAttribute('aria-label')).to.equal('Tìm nhanh');
  });

  it('external <label for=host> → control aria-labelledby', () => {
    const wrap = mount('<div><label for="ext-f">Nhãn ngoài</label><td-input-field id="ext-f"></td-input-field></div>');
    const input = ctl(wrap.querySelector('td-input-field'));
    const ref = input.getAttribute('aria-labelledby');
    expect(!!ref).to.equal(true);
    expect(document.getElementById(ref).textContent).to.equal('Nhãn ngoài');
  });

  it('editable div is named by aria-labelledby (a label cannot target a div)', () => {
    const el = mount('<td-input-field id="ed" type="contenteditable" label="Nội dung"></td-input-field>');
    expect(ctl(el).getAttribute('aria-labelledby')).to.equal('ed-label');
    expect(document.getElementById('ed-label').textContent).to.equal('Nội dung');
  });
});

describe('batch 2 — td-input-field required + describedby', () => {
  it('aria-required on the control, asterisk aria-hidden; toggled in place', () => {
    const el = mount('<td-input-field label="Tên" required></td-input-field>');
    const input = ctl(el);
    expect(input.getAttribute('aria-required')).to.equal('true');
    expect(input.hasAttribute('required')).to.equal(false); // host owns validity
    expect(el.querySelector('.td-field__required').getAttribute('aria-hidden')).to.equal('true');
    input.focus();
    el.removeAttribute('required');
    expect(ctl(el) === input).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
    expect(input.hasAttribute('aria-required')).to.equal(false);
    expect(el.querySelector('.td-field__required')).to.equal(null);
  });

  it('aria-describedby merges note + counter + error, preserving consumer ids', () => {
    const el = mount('<td-input-field id="d1" helper-text="Gợi ý" max-length="5"></td-input-field>');
    const input = ctl(el);
    expect(ids(input, 'aria-describedby')).to.deep.equal(['d1-note', 'd1-counter']);
    input.setAttribute('aria-describedby', `extra-hint ${input.getAttribute('aria-describedby')}`);
    el.setError('Sai');
    expect(ids(input, 'aria-describedby')).to.have.members(['extra-hint', 'd1-note', 'd1-counter', 'd1-error']);
    expect(input.getAttribute('aria-errormessage')).to.equal('d1-error');
    el.setHelper('');
    expect(ids(input, 'aria-describedby')).to.have.members(['extra-hint', 'd1-counter', 'd1-error']);
    el.clearError();
    expect(ids(input, 'aria-describedby')).to.have.members(['extra-hint', 'd1-counter']);
    expect(input.hasAttribute('aria-errormessage')).to.equal(false);
  });
});

describe('batch 2 — td-input-field error contract', () => {
  it('API: setError / clearError / errorMessage', () => {
    const el = mount('<td-input-field id="e1"></td-input-field>');
    const input = ctl(el);
    el.setError('Sai định dạng');
    const note = el.querySelector('.td-field__footer > .td-field-error');
    expect(note.textContent).to.equal('Sai định dạng');
    expect(note.id).to.equal('e1-error');
    expect(el.errorMessage).to.equal('Sai định dạng');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    el.clearError();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(input.hasAttribute('aria-invalid')).to.equal(false);
    expect(el.querySelector('.td-field__footer').hidden).to.equal(true);
  });

  it('attribute: error-text shows, a new value wins over setError, removal clears', () => {
    const el = mount('<td-input-field error-text="Lỗi"></td-input-field>');
    expect(ctl(el).getAttribute('aria-invalid')).to.equal('true');
    el.setError('');
    el.setAttribute('error-text', 'Từ server');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
    el.removeAttribute('error-text');
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(ctl(el).hasAttribute('aria-invalid')).to.equal(false);
  });

  it('form reset clears a shown error (and restores the value)', () => {
    const form = mount('<form><td-input-field name="x" value="a"></td-input-field></form>');
    const el = form.querySelector('td-input-field');
    el.setValue('b');
    el.setError('Sai');
    form.reset();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(el.getValue()).to.equal('a');
  });

  it('survives a structural re-render (size/label change)', () => {
    const el = mount('<td-input-field label="A"></td-input-field>');
    el.setError('Vẫn còn');
    el.setAttribute('size', 'sm');
    el.setAttribute('label', 'B');
    expect(el.querySelector('.td-field--sm') !== null).to.equal(true);
    expect(el.querySelector('.td-field-error').textContent).to.equal('Vẫn còn');
    expect(ctl(el).getAttribute('aria-invalid')).to.equal('true');
  });

  it('helper and error coexist (error first, helper kept — D17)', () => {
    const el = mount('<td-input-field helper-text="Gợi ý" max-length="9"></td-input-field>');
    el.setError('Sai rồi');
    const footer = el.querySelector('.td-field__footer');
    const kids = [...footer.children].filter((c) => !c.hidden).map((c) => c.className);
    expect(kids).to.deep.equal(['td-field-error', 'td-field__note', 'td-field__counter']);
    expect(el.querySelector('.td-field__note').textContent).to.equal('Gợi ý');
    el.setError('');
    expect(el.querySelector('.td-field__note').textContent).to.equal('Gợi ý');
  });

  it('validate-on="blur" mirrors the constraint message into the error', () => {
    const el = mount('<td-input-field type="email" validate-on="blur"></td-input-field>');
    const input = ctl(el);
    input.focus();
    input.value = 'khong-phai-email';
    input.dispatchEvent(new Event('input'));
    input.blur();
    expect(el.querySelector('.td-field-error').textContent).to.equal('Email không hợp lệ');
  });
});

describe('batch 2 — td-input-field events + in-place updates', () => {
  it('exactly one input per keystroke, one change on blur only when changed', async () => {
    const el = mount('<td-input-field></td-input-field>');
    const input = ctl(el);
    const got = [];
    host.addEventListener('input', (e) => got.push(['input', e instanceof CustomEvent ? e.detail.value : 'native']));
    host.addEventListener('change', (e) => got.push(['change', e instanceof CustomEvent ? e.detail.value : 'native']));
    input.focus();
    await sendKeys({ type: 'ab' });
    input.blur();
    expect(got).to.deep.equal([['input', 'a'], ['input', 'ab'], ['change', 'ab']]);
    got.length = 0;
    input.focus();
    input.blur(); // unchanged → no change
    expect(got).to.deep.equal([]);
    input.focus();
    el.setValue('programmatic'); // not a user change
    input.blur();
    expect(got).to.deep.equal([]);
  });

  it('value / helper-text / error-text / placeholder / readonly attribute changes keep focus + caret', async () => {
    const el = mount('<td-input-field value="hello"></td-input-field>');
    const input = ctl(el);
    input.focus();
    input.setSelectionRange(2, 2);
    el.setAttribute('helper-text', 'Gợi ý mới');
    el.setAttribute('error-text', 'Lỗi mới');
    el.setAttribute('placeholder', 'p');
    el.setAttribute('value', 'hello'); // same as live → untouched
    expect(ctl(el) === input).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
    expect(input.selectionStart).to.equal(2);
    await sendKeys({ type: 'X' });
    expect(el.getValue()).to.equal('heXllo');
    el.setAttribute('value', 'mới');
    expect(ctl(el) === input).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
    expect(input.value).to.equal('mới');
    el.setAttribute('readonly', '');
    expect(input.readOnly).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
  });

  it('disabled toggles in place (and via <fieldset disabled>)', () => {
    const form = mount('<form><fieldset><td-input-field name="x" value="v"></td-input-field></fieldset></form>');
    const el = form.querySelector('td-input-field');
    const input = ctl(el);
    el.setDisabled(true);
    expect(ctl(el) === input && input.disabled).to.equal(true);
    el.setDisabled(false);
    expect(input.disabled).to.equal(false);
    form.querySelector('fieldset').disabled = true;
    expect(ctl(el) === input && input.disabled).to.equal(true);
  });

  it('word limit truncation keeps the caret after the pasted words (off-by-one fix)', () => {
    const el = mount('<td-input-field max-length="3" limit-type="word" value="one two three"></td-input-field>');
    const input = ctl(el);
    input.focus();
    // simulate a paste of "new " after "one " (caret ends at 8)
    input.value = 'one new two three';
    input.setSelectionRange(8, 8);
    input.dispatchEvent(new Event('input'));
    expect(input.value).to.equal('one new two');
    expect(input.selectionStart).to.equal(8);
    expect(TdInputField._caretAfterTruncate('a  b c', 3, 5)).to.equal(2); // "a  |b" → "a |b"
  });
});

describe('batch 2 — td-input-field styles (td.css)', () => {
  it('error border (computed) holds across focus/blur', () => {
    const el = mount('<td-input-field></td-input-field>');
    const input = ctl(el);
    input.style.transition = 'none'; // read end states, not mid-transition values
    const rest = getComputedStyle(input).borderTopColor;
    el.setError('Sai');
    const red = getComputedStyle(input).borderTopColor;
    expect(red).to.not.equal(rest);
    input.focus();
    expect(getComputedStyle(input).borderTopColor).to.equal(red);
    input.blur();
    expect(getComputedStyle(input).borderTopColor).to.equal(red);
  });

  it('counter data-state="limit" at count >= max, without a red border', () => {
    const el = mount('<td-input-field max-length="3" value="ab"></td-input-field>');
    const input = ctl(el);
    const counter = el.querySelector('.td-field__counter');
    const border = getComputedStyle(input).borderTopColor;
    const noteColor = getComputedStyle(counter).color;
    expect(counter.hasAttribute('data-state')).to.equal(false);
    el.setValue('abc');
    expect(counter.getAttribute('data-state')).to.equal('limit');
    expect(counter.textContent).to.equal('3/3 ký tự');
    expect(getComputedStyle(counter).color).to.not.equal(noteColor);
    expect(getComputedStyle(input).borderTopColor).to.equal(border);
    expect(input.hasAttribute('aria-invalid')).to.equal(false);
  });

  it('keyboard focus shows the focus ring', async () => {
    mount('<button id="before">x</button>');
    const el = mount('<td-input-field aria-label="x"></td-input-field>');
    document.getElementById('before').focus();
    await sendKeys({ press: 'Tab' });
    const input = ctl(el);
    expect(document.activeElement === input).to.equal(true);
    expect(getComputedStyle(input).boxShadow).to.not.equal('none');
  });

  it('editable placeholder is CSS only: type → clear → blur → refocus', async () => {
    const el = mount('<td-input-field type="contenteditable" placeholder="Nhập mô tả"></td-input-field>');
    const div = ctl(el);
    const before = () => getComputedStyle(div, '::before').content;
    expect(div.textContent).to.equal('');
    expect(el.getValue()).to.equal('');
    expect(before()).to.equal('"Nhập mô tả"');
    div.focus();
    await sendKeys({ type: 'abc' });
    expect(el.getValue()).to.equal('abc');
    expect(before()).to.equal('none');
    for (let i = 0; i < 3; i += 1) await sendKeys({ press: 'Backspace' }); // eslint-disable-line no-await-in-loop
    expect(el.getValue()).to.equal('');
    div.blur();
    expect(div.childNodes.length).to.equal(0); // :empty holds
    expect(before()).to.equal('"Nhập mô tả"');
    expect(el.getValue()).to.equal('');
    div.focus();
    expect(el.getValue()).to.equal('');
    expect(div.textContent).to.not.contain('Nhập mô tả');
  });

  for (const theme of ['light', 'dark']) {
    it(`AA contrast: border ≥ 3, placeholder/label/note ≥ 4.5 (${theme})`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      document.body.style.setProperty('background', 'var(--td-color-bg)');
      const el = mount('<td-input-field label="Tên" placeholder="Gợi ý nhập" helper-text="Ghi chú"></td-input-field>');
      const input = ctl(el);
      input.style.transition = 'none';
      const cs = getComputedStyle(input);
      const fieldBg = cs.backgroundColor;
      const pageBg = getComputedStyle(document.body).backgroundColor;
      // v0.14.1: soft border at rest (visible), the hover border keeps ≥ 3:1; focus shows the ring
      expect(ratio(cs.borderTopColor, fieldBg)).to.be.at.least(1.3);
      expect(ratio(cs.borderTopColor, pageBg)).to.be.at.least(1.3);
      expect(ratio(tokenColor('--td-field-border-hover'), fieldBg)).to.be.at.least(3);
      expect(ratio(tokenColor('--td-field-border-hover'), pageBg)).to.be.at.least(3);
      expect(ratio(getComputedStyle(input, '::placeholder').color, fieldBg)).to.be.at.least(4.5);
      expect(ratio(cs.color, fieldBg)).to.be.at.least(4.5);
      expect(ratio(getComputedStyle(el.querySelector('.td-field__label')).color, pageBg)).to.be.at.least(4.5);
      expect(ratio(getComputedStyle(el.querySelector('.td-field__note')).color, pageBg)).to.be.at.least(4.5);
      el.setError('Sai');
      expect(ratio(getComputedStyle(el.querySelector('.td-field-error')).color, pageBg)).to.be.at.least(4.5);
      expect(ratio(getComputedStyle(input).borderTopColor, fieldBg)).to.be.at.least(3);
    });
  }

  // Coarse-pointer 44 px targets (@media (pointer: coarse)) cannot be emulated in this runner
  // (web-test-runner has no emulateMedia for `pointer`); covered by the rule's presence in field.css.
  it.skip('coarse pointer: controls ≥ 44 px (needs pointer emulation)', () => {});
});
