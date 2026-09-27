import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-chip-input.js';
import './td-input-field.js';
import { TdMenu } from '../feedback/td-menu.js';
import { TdFormValidation } from '../utils/form-validation.js';

// v0.12.0 impl-review round 1 regressions. td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { TdMenu.close(); host.innerHTML = ''; });
const mount = (html) => { host.insertAdjacentHTML('beforeend', html); return host.lastElementChild; };

describe('chip-input (ISSUE-1, ISSUE-4)', () => {
  it('an async create() result is dropped after setValue()/reset while awaiting', async () => {
    const el = mount('<td-chip-input aria-label="Thẻ" allow-create></td-chip-input>');
    let resolve;
    el.create = (text) => new Promise((r) => { resolve = () => r({ value: text, label: text }); });
    const input = el.querySelector('.td-chip-input__input');
    input.focus();
    input.value = 'Mới';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sendKeys({ press: 'Enter' });
    el.setValue(['a']);
    resolve();
    await wait(10);
    expect(el.getValue().map((i) => i.value)).to.deep.equal(['a']);
  });

  it('typing during an async create() keeps the newer text', async () => {
    const el = mount('<td-chip-input aria-label="Thẻ" allow-create></td-chip-input>');
    let resolve;
    el.create = (text) => new Promise((r) => { resolve = () => r({ value: text, label: text }); });
    const input = el.querySelector('.td-chip-input__input');
    input.focus();
    input.value = 'Một';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sendKeys({ press: 'Enter' });
    input.value = 'Hai';
    resolve();
    await wait(10);
    expect(el.getValue().map((i) => i.value)).to.deep.equal(['Một']);
    expect(input.value).to.equal('Hai');
  });

  it('ArrowDown with typed text shorter than min-chars does not search', async () => {
    const el = mount('<td-chip-input aria-label="Thẻ" min-chars="3"></td-chip-input>');
    const queries = [];
    el.search = async (q) => { queries.push(q); return [{ value: 'x', label: 'x' }]; };
    const input = el.querySelector('.td-chip-input__input');
    input.focus();
    input.value = 'ab';
    await sendKeys({ press: 'ArrowDown' });
    await wait(400);
    expect(queries).to.deep.equal([]);
  });
});

describe('TdMenu (ISSUE-5, 8, 9)', () => {
  it('iconNode must be an SVGElement; other Nodes are ignored', () => {
    const a = mount('<button>a</button>');
    const div = document.createElement('div');
    div.className = 'not-svg';
    TdMenu.open(a, [{ label: 'X', iconNode: div, onSelect() {} }]);
    expect(document.querySelector('.td-menu .not-svg')).to.equal(null);
  });

  it('opening an empty menu on another anchor still closes the open one', () => {
    const a = mount('<button>a</button>');
    const b = mount('<button>b</button>');
    TdMenu.open(a, [{ label: 'X', onSelect() {} }]);
    expect(TdMenu.isOpen(a)).to.equal(true);
    expect(TdMenu.open(b, [])).to.equal(null);
    expect(TdMenu.isOpen()).to.equal(false);
  });

  it('unbind() restores the trigger ARIA it changed', () => {
    const t = mount('<button aria-expanded="true">t</button>');
    const unbind = TdMenu.bind(t, [{ label: 'X', onSelect() {} }]);
    expect(t.getAttribute('aria-haspopup')).to.equal('menu');
    unbind();
    expect(t.hasAttribute('aria-haspopup')).to.equal(false);
    expect(t.getAttribute('aria-expanded')).to.equal('true');
    expect(t.hasAttribute('id')).to.equal(false);
  });
});

describe('TdFormValidation (ISSUE-2, ISSUE-7)', () => {
  it('a disabled first radio does not hide an invalid enabled group', () => {
    const f = mount(`<form><input type="radio" name="g" value="0" disabled>
      <input type="radio" name="g" value="1" required><input type="radio" name="g" value="2"></form>`);
    const r = TdFormValidation.validate(f, { summary: false, focus: false });
    expect(r.valid).to.equal(false);
    const [r0, r1, r2] = f.querySelectorAll('input');
    expect(r0.hasAttribute('aria-invalid')).to.equal(false);
    expect(r1.getAttribute('aria-invalid')).to.equal('true');
    expect(r2.getAttribute('aria-invalid')).to.equal('true');
  });

  it('live revalidation keeps an active summary in sync (update text, re-insert in document order)', async () => {
    const f = mount(`<form><label for="a">A</label><input id="a" name="a" required>
      <label for="b">B</label><input id="b" name="b" required>
      <label for="c">C</label><input id="c" name="c" required pattern="[0-9]+"><button>go</button></form>`);
    const detach = TdFormValidation.attach(f, { summary: true });
    f.requestSubmit();
    const texts = () => [...f.querySelectorAll('.td-form-summary__link')].map((x) => x.textContent.split(':')[0]);
    expect(texts()).to.deep.equal(['A', 'B', 'C']);
    const a = f.querySelector('#a');
    a.value = 'ok';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    expect(texts()).to.deep.equal(['B', 'C']);
    a.value = '';
    a.dispatchEvent(new Event('change', { bubbles: true }));
    expect(texts()).to.deep.equal(['A', 'B', 'C']);
    const c = f.querySelector('#c');
    c.value = 'x';
    c.dispatchEvent(new Event('change', { bubbles: true }));
    const cLink = [...f.querySelectorAll('.td-form-summary__link')].find((x) => x.textContent.startsWith('C'));
    const note = f.querySelector('#c-error').textContent;
    expect(note.length > 0).to.equal(true);
    expect(cLink.textContent).to.equal(`C: ${note}`); // summary text updated to the new (pattern) message
    detach();
  });
});

describe('TdFormValidation round 2 (ISSUE-10, ISSUE-11)', () => {
  it('radio groups respect the form owner: same name in two forms under one root never merge', () => {
    const wrap = mount(`<div><form id="f1"><input type="radio" name="g" value="a" required></form>
      <form id="f2"><input type="radio" name="g" value="b" required checked></form></div>`);
    const r = TdFormValidation.validate(wrap, { summary: false, focus: false });
    const [a, b] = wrap.querySelectorAll('input');
    expect(r.valid).to.equal(false);
    expect(a.getAttribute('aria-invalid')).to.equal('true');
    expect(b.hasAttribute('aria-invalid')).to.equal(false); // f2's group is satisfied
  });

  it('a radio associated with form="…" outside the form joins its group', () => {
    const wrap = mount(`<div><form id="fx"><input type="radio" name="h" value="1" required></form>
      <input type="radio" name="h" value="2" form="fx"></div>`);
    const form = wrap.querySelector('form');
    const r = TdFormValidation.validate(form, { summary: false, focus: false });
    expect(r.valid).to.equal(false);
    const [in1, out2] = wrap.querySelectorAll('input');
    expect(in1.getAttribute('aria-invalid')).to.equal('true');
    expect(out2.getAttribute('aria-invalid')).to.equal('true');
    TdFormValidation.clear(form);
    expect(out2.hasAttribute('aria-invalid')).to.equal(false);
  });

  it('clear() restores page-owned aria-invalid / aria-errormessage', () => {
    const f = mount('<form><span id="own">x</span><input name="n" required aria-invalid="false" aria-errormessage="own" aria-describedby="own"></form>');
    const input = f.querySelector('input');
    TdFormValidation.validate(f, { summary: false, focus: false });
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    TdFormValidation.clear(f);
    expect(input.getAttribute('aria-invalid')).to.equal('false');
    expect(input.getAttribute('aria-errormessage')).to.equal('own');
    expect(input.getAttribute('aria-describedby')).to.equal('own');
  });
});

describe('TdFormValidation security round 2: throwing rules fail closed whatever messages say', () => {
  for (const [label, setup] of [
    ['ruleError missing', (saved) => { const { ruleError, ...rest } = saved; TdFormValidation.messages = rest; }],
    ['ruleError empty', (saved) => { TdFormValidation.messages = { ...saved, ruleError: '' }; }],
    ['messages null', () => { TdFormValidation.messages = null; }],
  ]) {
    it(`${label}: invalid, and attach() blocks submit + onValid`, () => {
      const saved = TdFormValidation.messages;
      const warn = console.warn; const error = console.error;
      console.warn = () => {}; console.error = () => {};
      try {
        setup(saved);
        const f = mount('<form><input name="a" value="1"><button>go</button></form>');
        const rules = { a: () => { throw new Error('boom'); } };
        const r = TdFormValidation.validate(f, { rules, summary: false, focus: false });
        expect(r.valid).to.equal(false);
        expect(f.checkValidity()).to.equal(false);
        let submitted = 0; let valid = 0;
        const detach = TdFormValidation.attach(f, { rules, summary: false, onValid: () => { valid++; } });
        // registered AFTER attach(): sees whether attach() prevented the submit (then stops a real navigation)
        f.addEventListener('submit', (e) => { if (!e.defaultPrevented) submitted++; e.preventDefault(); });
        f.requestSubmit();
        expect(valid).to.equal(0);
        expect(submitted).to.equal(0);
        detach();
      } finally {
        TdFormValidation.messages = saved;
        console.warn = warn; console.error = error;
      }
    });
  }
});
