import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import '../form/td-input-field.js';
import '../form/td-checkbox.js';
import '../form/td-dropdown.js';
import '../form/td-datetime-picker.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdButton } from '../form/td-button.js';
import { TdFormValidation } from './form-validation.js';

// v0.12.0 item 1 — TdFormValidation (plan D15–D20, D22; inventory §3, §7.3, §8.3). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const same = (a, b) => a === b; // never hand DOM nodes to chai deep asserts
const ids = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type) => el.dispatchEvent(type === 'focusout'
  ? new FocusEvent('focusout', { bubbles: true })
  : new Event(type, { bubbles: true }));
const typeInto = (input, value) => { input.value = value; fire(input, 'input'); };

afterEach(async () => {
  for (const f of host.querySelectorAll('form, div')) TdFormValidation.clear(f);
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  TdModal.closeAll?.();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const c = /color\(srgb ([^)]+)\)/.exec(str); // color-mix() computes to color(srgb r g b) in 0–1
  if (c) { const n = c[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255 }; }
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2] };
}
const lum = (c) => TdButton._luminance(c);
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('TdFormValidation.validate — which controls, dispatch, messages', () => {
  function mixedForm() {
    return mount(`
      <form id="mf">
        <td-input-field id="f-name" name="name" label="Họ tên" required></td-input-field>
        <td-checkbox id="f-agree" name="agree" label="Đồng ý" required></td-checkbox>
        <td-dropdown id="f-cat" name="cat" label="Chuyên mục" required></td-dropdown>
        <td-datetime-picker id="f-at" name="at" label="Thời điểm" required></td-datetime-picker>
        <label for="n-email">Email</label><input id="n-email" name="email" type="email" value="không-phải-email" aria-describedby="page-hint">
        <span id="page-hint">Gợi ý của trang</span>
        <label>Mã <input name="code" pattern="[0-9]{3}" title="Ba chữ số" value="ab"></label>
        <div class="pair"><input name="p1" required><input name="p2" required></div>
        <input name="off" required disabled>
        <fieldset disabled><input name="fs" required></fieldset>
        <input type="hidden" name="h" value="">
        <button type="submit">Gửi</button>
      </form>`);
  }

  it('reads validity of td hosts + natives in document order; skips td inner natives, disabled, hidden, buttons', () => {
    const form = mixedForm();
    const r = TdFormValidation.validate(form, { focus: false, summary: false });
    expect(r.valid).to.equal(false);
    expect(r.errors.map((e) => e.name)).to.deep.equal(['name', 'agree', 'cat', 'at', 'email', 'code', 'p1', 'p2']);
    expect(same(r.invalid, r.errors)).to.equal(true);
  });

  it('td controls get setError (their own Vietnamese message); natives get aria + a td-field-error note', () => {
    const form = mixedForm();
    TdFormValidation.validate(form, { focus: false, summary: false });
    const name = form.querySelector('#f-name');
    expect(name.errorMessage.length > 0).to.equal(true);
    expect(name.querySelector('.td-field-error').textContent).to.equal(name.errorMessage);
    expect(form.querySelector('#f-cat').errorMessage).to.equal('Vui lòng chọn một tùy chọn');
    expect(form.querySelector('#f-agree').errorMessage).to.equal('Vui lòng chọn ô này.');
    // td hosts never get a helper-written note
    expect(name.querySelector('[data-td-fv]')).to.equal(null);

    const email = form.querySelector('#n-email');
    const note = email.nextElementSibling;
    expect(note.matches('span.td-field-error[data-td-fv]')).to.equal(true);
    expect(note.id).to.equal('n-email-error');
    expect(note.getAttribute('data-for')).to.equal('n-email');
    expect(note.textContent).to.equal('Email không hợp lệ');
    expect(email.getAttribute('aria-invalid')).to.equal('true');
    expect(email.getAttribute('aria-errormessage')).to.equal('n-email-error');
    expect(ids(email, 'aria-describedby')).to.deep.equal(['page-hint', 'n-email-error']);
    expect(note.hasAttribute('style')).to.equal(false);
    expect(email.hasAttribute('style')).to.equal(false);
  });

  it('pattern → title; note goes after the wrapping <label>; two id-less inputs in one parent get two notes', () => {
    const form = mixedForm();
    TdFormValidation.validate(form, { focus: false, summary: false });
    const code = form.querySelector('[name="code"]');
    const lbl = code.closest('label');
    expect(lbl.nextElementSibling.textContent).to.equal('Ba chữ số');
    expect(same(lbl.nextElementSibling.previousElementSibling, lbl)).to.equal(true);
    const [p1, p2] = form.querySelectorAll('.pair input');
    expect(p1.id !== '' && p2.id !== '' && p1.id !== p2.id).to.equal(true);
    const notes = form.querySelectorAll('.pair .td-field-error');
    expect(notes.length).to.equal(2);
    expect(same(p1.nextElementSibling, notes[0])).to.equal(true);
    expect(notes[0].textContent).to.equal('Trường này là bắt buộc');
    expect(ids(p2, 'aria-describedby')).to.deep.equal([notes[1].id]);
  });

  it('messages: static Vietnamese defaults with placeholders + per-field overrides (string | per flag)', () => {
    const form = mount(`<form>
      <input name="age" type="number" min="18" value="3">
      <input name="qty" type="number" max="5" value="9">
      <input name="nick" required>
      <input name="site" type="url" value="x">
    </form>`);
    TdFormValidation.validate(form, { focus: false, summary: false,
      messages: { nick: { valueMissing: 'Nhập biệt danh' }, site: 'Địa chỉ web sai' } });
    const msg = (n) => form.querySelector(`[name="${n}"]`).nextElementSibling.textContent;
    expect(msg('age')).to.equal('Giá trị tối thiểu là 18');
    expect(msg('qty')).to.equal('Giá trị tối đa là 5');
    expect(msg('nick')).to.equal('Nhập biệt danh');
    expect(msg('site')).to.equal('Địa chỉ web sai');
  });

  it('works on a non-form root (modal body div)', () => {
    const div = mount('<div><td-input-field name="t" label="Tiêu đề" required></td-input-field><input name="x" required></div>');
    const r = TdFormValidation.validate(div, { focus: false, summary: false });
    expect(r.errors.map((e) => e.name)).to.deep.equal(['t', 'x']);
  });

  it('native radio group counts once and marks every radio', () => {
    const form = mount(`<form>
      <label><input type="radio" name="g" value="a" required> A</label>
      <label><input type="radio" name="g" value="b"> B</label>
    </form>`);
    const r = TdFormValidation.validate(form, { focus: false, summary: false });
    expect(r.errors.length).to.equal(1);
    const radios = form.querySelectorAll('input');
    expect(radios[0].getAttribute('aria-invalid')).to.equal('true');
    expect(radios[1].getAttribute('aria-invalid')).to.equal('true');
    expect(form.querySelectorAll('.td-field-error').length).to.equal(1);
    expect(same(form.querySelector('.td-field-error').previousElementSibling, radios[1].closest('label'))).to.equal(true);
  });
});

describe('TdFormValidation.validate — custom rules (setCustomValidity)', () => {
  const slugRule = { slug: (v) => (/^[a-z0-9-]*$/.test(v) ? '' : 'Chỉ chữ thường, số và dấu -') };

  it('rules go through setCustomValidity (native checkValidity() honours them); clear() resets them', () => {
    const form = mount('<form><input name="slug" value="Có Dấu"><td-input-field name="slug2" value="X Y"></td-input-field></form>');
    const r = TdFormValidation.validate(form, { focus: false,
      rules: { ...slugRule, slug2: (v, el, root) => (same(root, form) && same(el, form.querySelector('td-input-field')) && v === 'X Y' ? 'Sai' : '') } });
    expect(r.errors.map((e) => e.message)).to.deep.equal(['Chỉ chữ thường, số và dấu -', 'Sai']);
    expect(form.checkValidity()).to.equal(false);
    expect(form.querySelector('input[name="slug"]').validity.customError).to.equal(true);
    TdFormValidation.clear(form);
    expect(form.checkValidity()).to.equal(true);
    expect(form.querySelector('.td-field-error')).to.equal(null);
    expect(form.querySelector('td-input-field').errorMessage).to.equal('');
  });

  it('a rule that throws FAILS CLOSED (invalid, generic message, warned) and never breaks validate()', () => {
    const form = mount('<form><input name="a" value="1"></form>');
    const warn = console.warn; console.warn = () => {};
    try {
      const r = TdFormValidation.validate(form, { rules: { a: () => { throw new Error('x'); } }, summary: false, focus: false });
      expect(r.valid).to.equal(false);
      expect(r.errors[0].message).to.equal(TdFormValidation.messages.ruleError);
      expect(form.checkValidity()).to.equal(false);
    } finally { console.warn = warn; }
  });
});

describe('TdFormValidation — focus + summary (D19; §3.2.1–3.2.3, 3.2.6, 3.2.7)', () => {
  it('focuses the first invalid control in DOCUMENT order via focus() only (no scrollIntoView)', () => {
    const form = mount('<form><input name="a"><td-input-field name="b" label="B" required></td-input-field><input name="c" required></form>');
    const orig = Element.prototype.scrollIntoView;
    let scrolled = 0;
    Element.prototype.scrollIntoView = function () { scrolled += 1; };
    try {
      TdFormValidation.validate(form);
    } finally { Element.prototype.scrollIntoView = orig; }
    expect(same(document.activeElement, form.querySelector('td-input-field .td-field__control'))).to.equal(true);
    expect(scrolled).to.equal(0);
  });

  it("summary 'auto' shows for ≥ 2 errors only; true forces one; false never", () => {
    const one = mount('<form><input name="a" required><input name="b"></form>');
    TdFormValidation.validate(one, { focus: false });
    expect(one.querySelector('.td-form-summary')).to.equal(null);
    TdFormValidation.validate(one, { focus: false, summary: true });
    expect(one.querySelector('.td-form-summary') !== null).to.equal(true);
    const two = mount('<form><input name="a" required><input name="b" required></form>');
    TdFormValidation.validate(two, { focus: false, summary: false });
    expect(two.querySelector('.td-form-summary')).to.equal(null);
    TdFormValidation.validate(two, { focus: false });
    const sum = two.querySelector('.td-form-summary');
    expect(same(two.firstElementChild, sum)).to.equal(true); // prepended in the root
    expect(sum.getAttribute('role')).to.equal('alert');
    expect(sum.hasAttribute('aria-live')).to.equal(false);
    expect(sum.querySelector('.td-form-summary__title').textContent).to.equal('Vui lòng kiểm tra lại các trường sau:');
    expect(sum.querySelectorAll('button.td-form-summary__link[type="button"]').length).to.equal(2);
    expect(sum.querySelector('a')).to.equal(null);
  });

  it('summary buttons focus their field (label: message) and the list re-renders on the next run', () => {
    const form = mount(`<form>
      <label for="u">Tên đăng nhập</label><input id="u" name="u" required>
      <td-input-field name="pw" label="Mật khẩu" required></td-input-field>
    </form>`);
    TdFormValidation.validate(form, { focus: false });
    const btns = form.querySelectorAll('.td-form-summary__link');
    expect(btns[0].textContent).to.equal('Tên đăng nhập: Trường này là bắt buộc');
    expect(btns[1].textContent.startsWith('Mật khẩu: ')).to.equal(true);
    btns[1].click();
    expect(same(document.activeElement, form.querySelector('td-input-field .td-field__control'))).to.equal(true);
    btns[0].click();
    expect(same(document.activeElement, form.querySelector('#u'))).to.equal(true);
    TdFormValidation.validate(form, { focus: false });
    expect(form.querySelectorAll('.td-form-summary').length).to.equal(1);
  });

  it('summaryTarget: appended, the container content is preserved (never wiped)', () => {
    const target = mount('<div id="sumbox"><p class="keep">Nội dung của trang</p></div>');
    const form = mount('<form><input name="a" required><input name="b" required></form>');
    TdFormValidation.validate(form, { focus: false, summaryTarget: target });
    expect(target.querySelector('.keep') !== null).to.equal(true);
    expect(same(target.lastElementChild, target.querySelector('.td-form-summary'))).to.equal(true);
    expect(form.querySelector('.td-form-summary')).to.equal(null);
    TdFormValidation.clear(form);
    expect(target.querySelector('.td-form-summary')).to.equal(null);
    expect(target.querySelector('.keep') !== null).to.equal(true);
  });
});

describe('TdFormValidation.apply — server errors (D17, D18; §3.2.1, 3.2.2, 3.2.8, 3.2.9)', () => {
  it('Laravel map: first message, dotted + array keys, never changes constraint validity', () => {
    const form = mount(`<form>
      <input name="title" value="ok">
      <input name="items[0][name]" value="ok">
      <select name="tags[]" multiple><option value="a" selected>a</option></select>
      <td-input-field name="slug" label="Slug" value="ok"></td-input-field>
    </form>`);
    const r = TdFormValidation.apply(form, {
      'items.0.name': ['Tên mục bị trùng', 'thứ hai'], title: 'Tiêu đề đã tồn tại', tags: ['Tối đa 5 thẻ'], slug: 'Slug đã dùng',
    }, { focus: false, summary: false });
    expect(r.applied.map((a) => a.field)).to.deep.equal(['title', 'items.0.name', 'tags', 'slug']); // document order
    expect(r.unmapped.length).to.equal(0);
    expect(form.querySelector('[name="items[0][name]"]').nextElementSibling.textContent).to.equal('Tên mục bị trùng');
    expect(form.querySelector('td-input-field').errorMessage).to.equal('Slug đã dùng');
    // D18: server errors are display only
    expect(form.checkValidity()).to.equal(true);
    for (const el of form.querySelectorAll('input, select')) expect(el.validity.customError).to.equal(false);
  });

  it('[data-field] wrapper → the REAL control (dispatch, note, focus) — dcms focus-on-wrapper bug fixed', () => {
    const form = mount(`<form>
      <div data-field="bio" class="wrap"><span>Giới thiệu</span><textarea name="about"></textarea></div>
      <div data-field="owner"><td-input-field name="o" label="Chủ sở hữu"></td-input-field></div>
    </form>`);
    const r = TdFormValidation.apply(form, { bio: 'Quá ngắn' });
    const ta = form.querySelector('textarea');
    expect(same(r.applied[0].element, ta)).to.equal(true);
    expect(same(document.activeElement, ta)).to.equal(true);
    expect(same(ta.nextElementSibling, form.querySelector('.td-field-error'))).to.equal(true);
    expect(form.querySelector('.wrap').hasAttribute('aria-invalid')).to.equal(false);
    const r2 = TdFormValidation.apply(form, { owner: 'Bắt buộc' });
    const td = form.querySelector('td-input-field');
    expect(same(r2.applied[0].element, td)).to.equal(true);
    expect(td.errorMessage).to.equal('Bắt buộc');
    expect(same(document.activeElement, td.querySelector('.td-field__control'))).to.equal(true);
  });

  it('focus = first in DOCUMENT order, not server key order', () => {
    const form = mount('<form><input name="first"><input name="second"></form>');
    TdFormValidation.apply(form, { second: 'Lỗi 2', first: 'Lỗi 1' }, { summary: true });
    expect(same(document.activeElement, form.querySelector('[name="first"]'))).to.equal(true);
    const links = [...form.querySelectorAll('.td-form-summary__link')].map((b) => b.textContent);
    expect(links).to.deep.equal(['Lỗi 1', 'Lỗi 2']); // no label → message alone
  });

  it('fieldMap: id and Element resolved INSIDE the root only (stale ids elsewhere are ignored)', () => {
    const outside = mount('<input id="seo-title">');
    const form = mount('<form><input id="in-form" name="x"><input id="seo-title-2"></form>');
    const r = TdFormValidation.apply(form, { 'meta.title': 'A', other: 'B', far: 'C' },
      { fieldMap: { 'meta.title': 'seo-title', other: form.querySelector('#in-form'), far: outside }, focus: false });
    expect(r.applied.map((a) => a.field)).to.deep.equal(['other']);
    expect(r.unmapped.map((u) => u.field)).to.deep.equal(['meta.title', 'far']);
    expect(outside.hasAttribute('aria-invalid')).to.equal(false);
    expect(same(r.unmatched, r.unmapped)).to.equal(true);
  });

  it('unknown keys → unmapped + listed as text in the summary; never throw', () => {
    const form = mount('<form><input name="a"></form>');
    const r = TdFormValidation.apply(form, { a: 'Lỗi A', general: 'Máy chủ bận' }, { focus: false });
    expect(r.unmapped).to.deep.equal([{ field: 'general', message: 'Máy chủ bận' }]);
    const items = form.querySelectorAll('.td-form-summary__item');
    expect(items.length).to.equal(2);
    expect(items[1].textContent).to.equal('Máy chủ bận');
    expect(items[1].querySelector('button')).to.equal(null);
    // a lone unmapped error still shows the summary under 'auto' (otherwise it would be invisible)
    const f2 = mount('<form><input name="a"></form>');
    TdFormValidation.apply(f2, { general: 'Chỉ một lỗi chung' }, { focus: false });
    expect(f2.querySelector('.td-form-summary') !== null).to.equal(true);
  });

  it('apply() twice replaces (fields no longer in the map are cleared)', () => {
    const form = mount('<form><input name="a"><input name="b"></form>');
    TdFormValidation.apply(form, { a: 'A1', b: 'B1' }, { focus: false });
    TdFormValidation.apply(form, { b: 'B2' }, { focus: false });
    const [a, b] = form.querySelectorAll('input');
    expect(a.hasAttribute('aria-invalid')).to.equal(false);
    expect(a.hasAttribute('aria-describedby')).to.equal(false);
    expect(b.nextElementSibling.textContent).to.equal('B2');
    expect(form.querySelectorAll('.td-field-error').length).to.equal(1);
    expect(form.querySelector('.td-form-summary')).to.equal(null);
  });

  it('clear() keeps page-owned aria-describedby ids', () => {
    const form = mount('<form><input name="a" aria-describedby="page-1"><span id="page-1">x</span></form>');
    TdFormValidation.apply(form, { a: 'Sai' }, { focus: false });
    const a = form.querySelector('input');
    expect(ids(a, 'aria-describedby').length).to.equal(2);
    TdFormValidation.clear(form);
    expect(ids(a, 'aria-describedby')).to.deep.equal(['page-1']);
    expect(a.hasAttribute('aria-errormessage')).to.equal(false);
  });

  it('duck-typed site element with setError gets setError', () => {
    if (!customElements.get('site-field')) {
      customElements.define('site-field', class extends HTMLElement {
        setError(m) { this.last = m; }
      });
    }
    const form = mount('<form><site-field name="s"><input></site-field></form>');
    TdFormValidation.apply(form, { s: 'Lỗi site' }, { focus: false });
    const s = form.querySelector('site-field');
    expect(s.last).to.equal('Lỗi site');
    expect(form.querySelector('.td-field-error')).to.equal(null);
    TdFormValidation.clear(form);
    expect(s.last).to.equal('');
  });

  it('XSS: messages, labels and hostile keys are text / escaped', () => {
    const form = mount('<form><label for="z">&lt;b&gt;Nhãn&lt;/b&gt;</label><input id="z" name="z"></form>');
    const payload = '<img src=x onerror="window.__fvx=1">';
    const r = TdFormValidation.apply(form, {
      z: payload, '"]': 'k1', '#x': 'k2', 'a"] , [name': 'k3', "x'][onclick": payload,
    }, { focus: false });
    expect(r.applied.length).to.equal(1);
    expect(r.unmapped.length).to.equal(4);
    expect(form.querySelector('img')).to.equal(null);
    expect(form.querySelector('.td-field-error').textContent).to.equal(payload);
    expect(form.querySelector('.td-form-summary__link').textContent).to.equal(`<b>Nhãn</b>: ${payload}`);
    expect(window.__fvx).to.equal(undefined);
  });
});

describe('TdFormValidation.attach — submit + live revalidation (D20; §3.2.10)', () => {
  function submitCount(form) {
    const s = { n: 0, prevented: 0 };
    form.addEventListener('submit', (e) => { s.n += 1; if (e.defaultPrevented) s.prevented += 1; e.preventDefault(); });
    return s;
  }

  it('sets/restores novalidate, blocks an invalid submit, lets a valid one through', () => {
    const form = mount('<form><input name="a" required><button>Gửi</button></form>');
    const detach = TdFormValidation.attach(form);
    const s = submitCount(form); // after attach: sees the helper's preventDefault
    expect(form.noValidate).to.equal(true);
    form.requestSubmit();
    expect(s.n).to.equal(1);
    expect(s.prevented).to.equal(1);
    expect(same(document.activeElement, form.querySelector('input'))).to.equal(true);
    typeInto(form.querySelector('input'), 'có');
    form.requestSubmit();
    expect(s.prevented).to.equal(1); // valid → not prevented by the helper
    detach();
    expect(form.hasAttribute('novalidate')).to.equal(false);
    const f2 = mount('<form novalidate></form>');
    TdFormValidation.attach(f2)();
    expect(f2.hasAttribute('novalidate')).to.equal(true);
  });

  it('onValid: the submit is prevented and onValid(event, form) runs', () => {
    const form = mount('<form><input name="a" value="x"></form>');
    let got = null;
    TdFormValidation.attach(form, { onValid: (e, f) => { got = { e, f }; } });
    const s = submitCount(form);
    form.requestSubmit();
    expect(s.prevented).to.equal(1);
    expect(got !== null && same(got.f, form) && got.e.type === 'submit').to.equal(true);
  });

  it('no live errors before the first failed submit', () => {
    const form = mount('<form><input name="a" required></form>');
    TdFormValidation.attach(form);
    const a = form.querySelector('input');
    typeInto(a, ''); fire(a, 'change'); fire(a, 'focusout');
    expect(form.querySelector('.td-field-error')).to.equal(null);
  });

  it('custom rule on a NATIVE input: invalid → valid → invalid (setCustomValidity reset before reading validity)', () => {
    const form = mount('<form><input name="slug" value="Sai Rồi"></form>');
    const rules = { slug: (v) => (/^[a-z-]*$/.test(v) ? '' : 'Chỉ chữ thường') };
    TdFormValidation.attach(form, { rules, summary: false });
    const slug = form.querySelector('input');
    form.requestSubmit();
    expect(slug.nextElementSibling.textContent).to.equal('Chỉ chữ thường');
    typeInto(slug, 'dung-roi'); // input + valid → cleared at once (reward early)
    expect(slug.validity.valid).to.equal(true);
    expect(slug.hasAttribute('aria-invalid')).to.equal(false);
    expect(form.querySelector('.td-field-error')).to.equal(null);
    typeInto(slug, 'Sai Nữa'); // typing never creates an error (punish late)…
    expect(slug.validity.customError).to.equal(true);
    expect(form.querySelector('.td-field-error')).to.equal(null);
    fire(slug, 'focusout'); // …leaving the field shows it
    expect(slug.getAttribute('aria-invalid')).to.equal('true');
    expect(slug.nextElementSibling.textContent).to.equal('Chỉ chữ thường');
    typeInto(slug, 'lai-dung');
    expect(form.querySelector('.td-field-error')).to.equal(null);
    typeInto(slug, 'X'); fire(slug, 'change');
    expect(slug.nextElementSibling.textContent).to.equal('Chỉ chữ thường');
  });

  it('custom rule on a TdFormElement (td-input-field): invalid → valid → invalid', async () => {
    const form = mount('<form><td-input-field name="slug" label="Slug" value="Sai Rồi"></td-input-field></form>');
    const rules = { slug: (v) => (/^[a-z-]*$/.test(v) ? '' : 'Chỉ chữ thường') };
    TdFormValidation.attach(form, { rules, summary: false });
    const field = form.querySelector('td-input-field');
    const ctl = field.querySelector('.td-field__control');
    form.requestSubmit();
    expect(field.errorMessage).to.equal('Chỉ chữ thường');
    expect(same(document.activeElement, ctl)).to.equal(true);
    // trusted typing: select all + type a valid value
    ctl.select();
    await sendKeys({ type: 'dung' });
    expect(field.validity.valid).to.equal(true);
    expect(field.errorMessage).to.equal('');
    expect(ctl.hasAttribute('aria-invalid')).to.equal(false);
    await sendKeys({ type: ' SAI' });
    expect(field.validity.customError).to.equal(true);
    expect(field.errorMessage).to.equal(''); // not while typing
    await sendKeys({ press: 'Tab' }); // focusout → shown
    expect(field.errorMessage).to.equal('Chỉ chữ thường');
    expect(ctl.getAttribute('aria-invalid')).to.equal('true');
  });

  it('a constraint (non-rule) error on a td control clears on input once valid, reappears on change', async () => {
    const form = mount('<form><td-checkbox name="ok" label="Đồng ý" required></td-checkbox></form>');
    TdFormValidation.attach(form, { summary: false });
    const cb = form.querySelector('td-checkbox');
    form.requestSubmit();
    expect(cb.errorMessage).to.equal('Vui lòng chọn ô này.');
    cb.querySelector('input').click();
    await raf();
    expect(cb.errorMessage).to.equal('');
    cb.querySelector('input').click();
    await raf();
    expect(cb.errorMessage).to.equal('Vui lòng chọn ô này.');
  });

  it('a server error on a field is dropped at the first edit of that field only', () => {
    const form = mount('<form><input name="a" value="x"><input name="b" value="y"></form>');
    TdFormValidation.attach(form);
    TdFormValidation.apply(form, { a: 'Đã tồn tại', b: 'Cũng sai' }, { focus: false });
    const [a, b] = form.querySelectorAll('input');
    fire(a, 'focusout'); // not an edit
    expect(a.getAttribute('aria-invalid')).to.equal('true');
    typeInto(a, 'x2');
    expect(a.hasAttribute('aria-invalid')).to.equal(false);
    expect(b.getAttribute('aria-invalid')).to.equal('true');
    expect(form.querySelectorAll('.td-form-summary__link').length).to.equal(1); // its summary item went too
    typeInto(b, 'y2');
    expect(form.querySelector('.td-form-summary')).to.equal(null);
  });

  it('attach() requires a <form>', () => {
    expect(() => TdFormValidation.attach(document.createElement('div'))).to.throw(TypeError);
  });
});

describe('TdFormValidation + TdModal async action (D22 recipe)', () => {
  it('rejected save → errors applied, dialog open, button not busy, focus on the field', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<td-input-field name="title" label="Tiêu đề"></td-input-field><input name="slug" aria-label="Slug">';
    let saveBtn = null;
    const id = TdModal.show({
      title: 'Sửa bài',
      body,
      actions: [
        { label: 'Hủy', value: false },
        {
          label: 'Lưu', variant: 'primary', value: true,
          onClick: async ({ button }) => {
            saveBtn = button;
            if (!TdFormValidation.validate(body).valid) return false;
            try {
              await Promise.reject(Object.assign(new Error('422'), { errors: { slug: ['Slug đã tồn tại'] } }));
            } catch (e) {
              TdFormValidation.apply(body, e.errors);
              return false;
            }
            return true;
          },
        },
      ],
    });
    await raf(); await raf();
    const root = document.getElementById(id);
    const btn = [...root.querySelectorAll('.td-modal__footer button')].find((b) => b.textContent.includes('Lưu'));
    btn.click();
    await tick(20);
    expect(document.getElementById(id) !== null).to.equal(true);
    expect(same(btn, saveBtn)).to.equal(true);
    expect(btn.hasAttribute('aria-busy')).to.equal(false);
    const slug = body.querySelector('[name="slug"]');
    expect(slug.getAttribute('aria-invalid')).to.equal('true');
    expect(same(document.activeElement, slug)).to.equal(true);
    TdModal.closeById(id);
    await tick(260);
  });
});

describe('TdFormValidation — td.css (form-validation.css)', () => {
  function summary() {
    const form = mount('<form><input name="a" required><input name="b" required></form>');
    TdFormValidation.validate(form, { focus: false });
    return form.querySelector('.td-form-summary');
  }

  for (const theme of ['light', 'dark']) {
    it(`summary is a solid, AA block in ${theme}`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const page = getComputedStyle(document.documentElement).getPropertyValue('--td-color-surface').trim();
      const probe = mount('<div class="td-form-summary__probe"></div>');
      probe.style.setProperty('background-color', page);
      const pageBg = getComputedStyle(probe).backgroundColor;
      const sum = summary();
      const cs = getComputedStyle(sum);
      expect(cs.backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
      expect(cs.backdropFilter === 'none' || cs.backdropFilter === '').to.equal(true);
      expect(ratio(cs.color, cs.backgroundColor)).to.be.greaterThan(4.5);
      expect(ratio(cs.borderTopColor, pageBg)).to.be.greaterThan(3);
      const btn = sum.querySelector('.td-form-summary__link');
      expect(ratio(getComputedStyle(btn).color, cs.backgroundColor)).to.be.greaterThan(4.5);
      expect(cs.fontFamily.length > 0).to.equal(true);
      const note = host.querySelector('.td-field-error[data-td-fv]');
      expect(getComputedStyle(note).display).to.equal('block');
    });
  }

  it('link buttons: visible focus ring, inherit the summary colour', async () => {
    const sum = summary();
    const btn = sum.querySelector('.td-form-summary__link');
    btn.focus();
    await sendKeys({ press: 'Shift+Tab' });
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, btn)).to.equal(true);
    expect(getComputedStyle(btn).boxShadow).to.not.equal('none');
    expect(getComputedStyle(btn).color).to.equal(getComputedStyle(sum).color);
  });
});

describe('TdFormValidation — golden contract (test/contracts/form-summary.html)', () => {
  const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'id', 'for', 'data-for', 'data-td-fv', 'aria-invalid',
    'aria-errormessage', 'aria-describedby', 'aria-live'];
  function shape(el) {
    const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    return { tag: el.localName, cls: [...el.classList].sort().join('.'), attrs, kids: [...el.children].map(shape) };
  }
  it('rendered markup equals the fixture', async () => {
    const html = await (await fetch('/test/contracts/form-summary.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const temps = [...doc.querySelectorAll('template')];
    expect(temps.length).to.equal(2);
    for (const t of temps) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      new Function('el', 'TdFormValidation', t.getAttribute('data-setup'))(el, TdFormValidation);
      expect(shape(el)).to.deep.equal(shape(t.content.firstElementChild));
      TdFormValidation.clear(el);
    }
  });
});

describe('v0.16.0 C5 — attach(): form reset + onValid guard', () => {
  it('form reset clears summary, notes and aria-invalid, and turns live revalidation off again', () => {
    const form = mount('<form><input name="a" required><input name="b" required></form>');
    TdFormValidation.attach(form, { summary: true });
    const [a, b] = form.querySelectorAll('input');
    form.requestSubmit();
    expect(form.querySelector('.td-form-summary')).to.not.equal(null);
    expect(form.querySelectorAll('.td-field-error').length).to.equal(2);
    expect(a.getAttribute('aria-invalid')).to.equal('true');
    form.reset();
    expect(form.querySelector('.td-form-summary')).to.equal(null);
    expect(form.querySelector('.td-field-error')).to.equal(null);
    expect(a.hasAttribute('aria-invalid')).to.equal(false);
    expect(b.hasAttribute('aria-invalid')).to.equal(false);
    expect(ids(a, 'aria-describedby').length).to.equal(0);
    // live re-check is off again: change/focusout on an empty required field shows nothing until the next submit
    fire(a, 'change'); fire(a, 'focusout');
    expect(form.querySelector('.td-field-error')).to.equal(null);
    form.requestSubmit();
    expect(form.querySelectorAll('.td-field-error').length).to.equal(2);
  });

  it('form reset also resets the custom validity pushed by rules', () => {
    const form = mount('<form><input name="slug" value="A B"></form>');
    TdFormValidation.attach(form, { rules: { slug: (v) => (/^[a-z]+$/.test(v) ? '' : 'Sai') } });
    const input = form.querySelector('input');
    form.requestSubmit();
    expect(input.validity.customError).to.equal(true);
    form.reset();
    expect(input.validity.customError).to.equal(false);
  });

  it('detach() removes the reset listener', () => {
    const form = mount('<form><input name="a" required></form>');
    const detach = TdFormValidation.attach(form);
    form.requestSubmit();
    detach();
    form.reset();
    expect(form.querySelector('.td-field-error')).to.not.equal(null);
  });

  it('a throwing onValid is caught (console.error) and the submit stays prevented', () => {
    const form = mount('<form><input name="a" value="x"></form>');
    TdFormValidation.attach(form, { onValid: () => { throw new Error('boom'); } });
    let prevented = null;
    form.addEventListener('submit', (e) => { prevented = e.defaultPrevented; e.preventDefault(); });
    const orig = console.error;
    const logged = [];
    console.error = (...args) => { logged.push(args); };
    try {
      form.requestSubmit();
    } finally {
      console.error = orig;
    }
    expect(prevented).to.equal(true);
    expect(logged.length).to.equal(1);
  });
});
