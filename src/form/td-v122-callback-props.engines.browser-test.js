import { expect } from '@esm-bundle/chai';
import './td-slider.js';
import './td-choice-group.js';
import './td-input-field.js';
import './td-toggle.js';
import './td-checkbox.js';

// v0.122.0 (plan docs/internal/plans/v0.122.0-callback-props.md) — callback properties called right BEFORE the kit's
// CustomEvent: a capture listener on `document` that stops ONLY the kit CustomEvent (instanceof CustomEvent, target =
// host, type) cannot stop the callback. The user action is driven by the native event the component listens to (not
// blocked: blocking native events is the documented QĐ4 limit). Also: order (callback before host listener), a throw
// is logged and the event still fires, re-entrancy (callback mutates value → event keeps the user value), non-function
// → null, programmatic changes call nothing.
const cleanup = [];
let errors = [];
const origError = console.error;
beforeEach(() => { errors = []; console.error = (...a) => { errors.push(a.map(String).join(' ')); }; });
afterEach(() => { console.error = origError; for (const f of cleanup.splice(0).reverse()) f(); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap.firstElementChild;
}
/** Stop the kit CustomEvent `type` from `host` at document capture; returns the host-listener log. */
function block(host, type) {
  const stop = (e) => { if (e instanceof CustomEvent && e.target === host && e.type === type) e.stopImmediatePropagation(); };
  document.addEventListener(type, stop, true);
  cleanup.push(() => document.removeEventListener(type, stop, true));
  const got = [];
  host.addEventListener(type, (e) => got.push(e.detail));
  return got;
}
const nativeInput = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
const nativeChange = (el) => el.dispatchEvent(new Event('change', { bubbles: true }));

// --- actions per component: perform a user change, return the expected value ---
const slider = () => mount('<td-slider aria-label="x" min="0" max="100" step="1" value="10"></td-slider>');
const sliderInput = (el) => el.querySelector('input[type="range"]');
const OPTS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
function group() {
  const el = document.createElement('td-choice-group');
  el.setAttribute('label', 'Nhóm');
  el.options = OPTS;
  document.body.appendChild(el);
  cleanup.push(() => el.remove());
  return el;
}
const pick = (el, i) => el.querySelectorAll('input.td-choice__input')[i].click();
const field = (type = 'text') => mount(`<td-input-field label="Tên" type="${type}" value="x"></td-input-field>`);
const fieldEl = (el) => el.querySelector('input, textarea');

describe('v0.122.0 callback props: default null, non-function → null', () => {
  it('every new property', () => {
    const cases = [[slider(), ['onInput', 'onChange']], [group(), ['onChange']], [field(), ['onInput', 'onChange']],
      [mount('<td-toggle label="T"></td-toggle>'), ['onChange']], [mount('<td-checkbox label="C"></td-checkbox>'), ['onChange']]];
    for (const [el, names] of cases) {
      for (const n of names) {
        expect(el[n], `${el.localName}.${n}`).to.equal(null);
        const fn = () => {};
        el[n] = fn; expect(el[n] === fn).to.equal(true);
        el[n] = 'x'; expect(el[n]).to.equal(null);
      }
    }
  });
});

describe('v0.122.0 td-slider', () => {
  for (const kind of ['input', 'change']) {
    const prop = kind === 'input' ? 'onInput' : 'onChange';
    it(`${prop} runs although document capture stops the kit "${kind}"`, () => {
      const el = slider(); const seen = []; el[prop] = (v) => seen.push(v);
      const got = block(el, kind);
      const r = sliderInput(el); r.value = '42';
      r.dispatchEvent(new Event(kind, { bubbles: true }));
      expect(seen).to.deep.equal([42]);
      expect(got.length).to.equal(0);
    });
  }
  it('order, throw, re-entrancy, programmatic', () => {
    const el = slider(); const log = [];
    el.onChange = (v) => { log.push(['cb', v]); el.value = 77; };
    el.addEventListener('change', (e) => log.push(['ev', e.detail.value]));
    const r = sliderInput(el); r.value = '30'; nativeChange(r);
    expect(log).to.deep.equal([['cb', 30], ['ev', 30]]);
    el.onChange = () => { throw new Error('boom'); };
    r.value = '31'; nativeChange(r);
    expect(log.at(-1)).to.deep.equal(['ev', 31]);
    expect(errors.some((m) => m.includes('td-slider: onChange threw'))).to.equal(true);
    const calls = []; el.onChange = (v) => calls.push(v); el.onInput = (v) => calls.push(v);
    el.value = 50; el.setAttribute('value', '55');
    expect(calls).to.deep.equal([]);
  });
});

describe('v0.122.0 td-choice-group', () => {
  it('onChange runs although document capture stops the kit input + change', () => {
    const el = group(); const seen = []; el.onChange = (v) => seen.push(v);
    const gi = block(el, 'input'); const gc = block(el, 'change');
    pick(el, 1);
    expect(seen).to.deep.equal(['b']);
    expect(gi.length + gc.length).to.equal(0);
  });
  it('called once, before input; separate detail + option objects; re-entrancy; throw; programmatic', () => {
    const el = group(); const log = []; const details = [];
    el.onChange = (v) => { log.push(['cb', v]); el.value = 'c'; };
    el.addEventListener('input', (e) => { log.push(['input', e.detail.value]); details.push(e.detail); });
    el.addEventListener('change', (e) => { log.push(['change', e.detail.value]); details.push(e.detail); });
    pick(el, 1);
    expect(log).to.deep.equal([['cb', 'b'], ['input', 'b'], ['change', 'b']]);
    expect(details[0] !== details[1]).to.equal(true);
    expect(details[0].option !== details[1].option).to.equal(true);
    el.onChange = () => { throw new Error('boom'); };
    pick(el, 0);
    expect(log.at(-1)).to.deep.equal(['change', 'a']);
    expect(errors.some((m) => m.includes('td-choice-group: onChange threw'))).to.equal(true);
    const calls = []; el.onChange = (v) => calls.push(v);
    el.value = 'b'; el.setValue('c');
    expect(calls).to.deep.equal([]);
  });
});

describe('v0.122.0 td-input-field', () => {
  for (const type of ['text', 'textarea', 'number', 'password']) {
    it(`${type}: onInput + onChange run although document capture stops the kit events`, () => {
      const el = field(type); const seen = [];
      el.onInput = (v) => seen.push(['in', v]); el.onChange = (v) => seen.push(['ch', v]);
      const gi = block(el, 'input'); const gc = block(el, 'change');
      const f = fieldEl(el); f.focus(); nativeInput(f, '12'); f.blur();
      expect(seen).to.deep.equal([['in', '12'], ['ch', '12']]);
      expect(gi.length + gc.length).to.equal(0);
    });
  }
  it('order, re-entrancy, throw, no change without edit, programmatic', () => {
    const el = field(); const log = [];
    el.onInput = (v) => log.push(['cbIn', v]);
    el.onChange = (v) => { log.push(['cbCh', v]); el.value = 'other'; };
    el.addEventListener('input', (e) => log.push(['in', e.detail.value]));
    el.addEventListener('change', (e) => log.push(['ch', e.detail.value]));
    const f = fieldEl(el); f.focus(); nativeInput(f, 'ab'); f.blur();
    expect(log).to.deep.equal([['cbIn', 'ab'], ['in', 'ab'], ['cbCh', 'ab'], ['ch', 'ab']]);
    log.length = 0;
    f.focus(); f.blur();
    expect(log).to.deep.equal([]);
    el.onInput = () => { throw new Error('boom'); };
    f.focus(); nativeInput(f, 'zz');
    expect(log.at(-1)).to.deep.equal(['in', 'zz']);
    expect(errors.some((m) => m.includes('td-input-field: onInput threw'))).to.equal(true);
    f.blur();
    const calls = []; el.onInput = (v) => calls.push(v); el.onChange = (v) => calls.push(v);
    el.value = 'p'; el.setValue('q');
    expect(calls).to.deep.equal([]);
  });
});

describe('v0.122.0 td-toggle / td-checkbox', () => {
  for (const tag of ['td-toggle', 'td-checkbox']) {
    it(`${tag}: onChange runs although document capture stops the kit change`, () => {
      const el = mount(`<${tag} label="T"></${tag}>`); const seen = []; el.onChange = (v) => seen.push(v);
      const got = block(el, 'change');
      el.querySelector('input').click();
      expect(seen).to.deep.equal([true]);
      expect(got.length).to.equal(0);
      expect(el.hasAttribute('checked')).to.equal(true);
    });
  }
  it('td-toggle controlled: onChange gets the requested state, blocked event', () => {
    const el = mount('<td-toggle label="T" controlled></td-toggle>'); const seen = []; el.onChange = (v) => seen.push(v);
    const got = block(el, 'change');
    el.querySelector('input').click();
    expect(seen).to.deep.equal([true]);
    expect(got.length).to.equal(0);
    expect(el.hasAttribute('checked')).to.equal(false);
  });
  it('order, re-entrancy, throw, programmatic', () => {
    const el = mount('<td-toggle label="T"></td-toggle>'); const log = [];
    el.onChange = (v) => { log.push(['cb', v]); el.checked = !v; };
    el.addEventListener('change', (e) => log.push(['ev', e.detail.checked]));
    el.querySelector('input').click();
    expect(log).to.deep.equal([['cb', true], ['ev', true]]);
    el.onChange = () => { throw new Error('boom'); };
    el.querySelector('input').click();
    expect(log.at(-1)[0]).to.equal('ev');
    expect(errors.some((m) => m.includes('td-toggle: onChange threw'))).to.equal(true);
    const calls = []; el.onChange = (v) => calls.push(v);
    el.checked = true; el.checked = false;
    expect(calls).to.deep.equal([]);
  });
});
