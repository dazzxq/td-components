import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport } from '@web/test-runner-commands';
// NO static import of the component: SSR markup is measured BEFORE <td-otp-input> is defined (dynamic import below).

// v0.36.0 (plan docs/internal/plans/v0.36.0-polish.md QĐ 41–48) — <td-otp-input> length / charset / case, IME safety,
// input attributes per charset, SSR otp-input@1 additive agreement, and the cell SHAPE (aspect-ratio, never a pill) in
// Chromium, Firefox AND WebKit. Real input via sendKeys; DOM nodes compared as booleans (chai + DOM nodes hangs).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await setViewport({ width: 800, height: 600 });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html, parent = document.body) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  parent.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}

const cells6 = (n) => `<span class="td-otp__cells" aria-hidden="true">${'<span class="td-otp__cell"></span>'.repeat(n)}</span>`;
/** element-mode markup exactly as php/td.php td_otp_input() prints it */
function ssrHtml(id, { length = 6, charset = 'numeric', textCase = null, value = '', name = 'c' } = {}) {
  const pattern = { numeric: '[0-9]', alphanumeric: '[A-Za-z0-9]', alpha: '[A-Za-z]' }[charset];
  const text = charset !== 'numeric';
  const caseAttr = textCase ? ` case="${textCase}"` : '';
  const ac = text ? ` autocapitalize="${(textCase || 'upper') === 'upper' ? 'characters' : 'off'}" autocorrect="off" spellcheck="false"` : '';
  return `<td-otp-input data-td-ssr="otp-input@1" id="${id}" name="${name}"${value ? ` value="${value}"` : ''}`
    + `${length !== 6 ? ` length="${length}"` : ''}${charset !== 'numeric' ? ` charset="${charset}"` : ''}${caseAttr}>`
    + `<div class="td-otp"${length !== 6 ? ` data-length="${length}"` : ''}><div class="td-otp__box">`
    + `<input type="text" class="td-otp__input" id="${id}-input" inputmode="${text ? 'text' : 'numeric'}" autocomplete="one-time-code"${ac}`
    + ` name="${name}" maxlength="${length}" pattern="${pattern}{${length}}"${value ? ` value="${value}"` : ''} aria-label="Mã xác thực">`
    + `${cells6(length)}</div></div></td-otp-input>`;
}

// ---- before the module loads: SSR boxes (input visible over hidden, in-flow cells) ----
const pre = mount(`<div id="pre-col">${ssrHtml('pre-6')}${ssrHtml('pre-8', { length: 8 })}`
  + `${ssrHtml('pre-5', { length: 5, charset: 'alphanumeric' })}</div>`);
pre.querySelector('#pre-col').style.setProperty('width', '360px');
extra.length = 0; // keep the pre-upgrade hosts for the whole file
const boxBefore = {};
for (const id of ['pre-6', 'pre-8', 'pre-5']) boxBefore[id] = pre.querySelector(`#${id} .td-otp__box`).getBoundingClientRect();
const cellsVisBefore = getComputedStyle(pre.querySelector('#pre-6 .td-otp__cells')).visibility;
const inputColorBefore = getComputedStyle(pre.querySelector('#pre-6 input')).color;

// SSR mismatches of the additive v0.36 agreement (must render, never adopt)
const MM = {
  'mm-len-host': ssrHtml('mm-len-host', { length: 8 }).replace(' length="8"', ' length="7"'),
  'mm-len-data': ssrHtml('mm-len-data', { length: 8 }).replace(' data-length="8"', ''),
  'mm-cells': ssrHtml('mm-cells', { length: 8 }).replace('<span class="td-otp__cell"></span>', ''),
  'mm-inputmode': ssrHtml('mm-inputmode', { length: 5, charset: 'alphanumeric' }).replace('inputmode="text"', 'inputmode="numeric"'),
  'mm-pattern': ssrHtml('mm-pattern', { length: 5, charset: 'alphanumeric' }).replace('[A-Za-z0-9]{5}', '[0-9]{5}'),
  'mm-maxlength': ssrHtml('mm-maxlength', { length: 8 }).replace('maxlength="8"', 'maxlength="6"'),
  'mm-cell-text': ssrHtml('mm-cell-text', {}).replace('<span class="td-otp__cell"></span>', '<span class="td-otp__cell">A</span>'),
  'mm-data-6': ssrHtml('mm-data-6', {}).replace('<div class="td-otp">', '<div class="td-otp" data-length="6">'),
};
const mm = mount(Object.values(MM).join(''));
const adoptedInputs = {};
const ok = mount(ssrHtml('ok-8', { length: 8, value: '12345678' }) + ssrHtml('ok-5', { length: 5, charset: 'alphanumeric', value: 'WMX7Q' }));
for (const id of ['ok-8', 'ok-5']) adoptedInputs[id] = ok.querySelector(`#${id} input`);
extra.length = 0;

const warnings = [];
const warn0 = console.warn;
console.warn = (...a) => { warnings.push(a.join(' ')); };
const { TdOtpInput } = await import('./td-otp-input.js');
console.warn = warn0;

const otp = (attrs = '') => mount(`<td-otp-input ${attrs}></td-otp-input>`).querySelector('td-otp-input');
const inputOf = (el) => el.querySelector('input.td-otp__input');
const cellsOf = (el) => [...el.querySelectorAll('.td-otp__cell')];
const shown = (el) => cellsOf(el).map((c) => c.textContent).join('');
function fill(el, raw, inputType = 'insertFromPaste') {
  const input = inputOf(el);
  input.value = raw;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
}
function completes(el) {
  const rec = [];
  el.addEventListener('complete', (e) => rec.push(e.detail.value));
  return rec;
}
function captureWarn(fn) {
  const got = [];
  const w = console.warn;
  console.warn = (...a) => { got.push(a.join(' ')); };
  try { fn(); } finally { console.warn = w; }
  return got;
}

describe('v0.36.0 td-otp-input — length', () => {
  for (const n of [1, 4, 8, 10]) {
    it(`length="${n}": ${n} cells, data-length only when ≠ 6, value capped at ${n}`, () => {
      const el = otp(`length="${n}"`);
      expect(cellsOf(el).length).to.equal(n);
      expect(el.length).to.equal(n);
      expect(el.querySelector('.td-otp').getAttribute('data-length')).to.equal(n === 6 ? null : String(n));
      fill(el, '12345678901');
      expect(el.value).to.equal('12345678901'.slice(0, n));
    });
  }

  for (const bad of ['0', '11', 'abc', '8.5']) {
    it(`length="${bad}" → 6 cells + exactly one warning for the host`, () => {
      let el;
      const got = captureWarn(() => {
        el = otp(`length="${bad}"`);
        el.setAttribute('label', 'Mã'); // a re-render does not warn again
      });
      expect(cellsOf(el).length).to.equal(6);
      expect(el.length).to.equal(6);
      expect(got.filter((w) => w.includes('length')).length).to.equal(1);
    });
  }

  it('changing length later re-renders, truncates the value, re-arms complete', () => {
    const el = otp('length="8"');
    const rec = completes(el);
    fill(el, '12345678');
    expect(rec).to.deep.equal(['12345678']);
    el.setAttribute('length', '4');
    expect(cellsOf(el).length).to.equal(4);
    expect(el.value).to.equal('1234');
    expect(shown(el)).to.equal('1234');
    fill(el, '1239');
    expect(rec).to.deep.equal(['12345678', '1239']);
  });

  it('TdOtpInput.LENGTH stays 6 (deprecated default)', () => {
    expect(TdOtpInput.LENGTH).to.equal(6);
  });
});

describe('v0.36.0 td-otp-input — charset + case', () => {
  it('numeric (default): inputmode numeric, no autocapitalize / autocorrect / spellcheck', () => {
    const input = inputOf(otp());
    expect(input.getAttribute('inputmode')).to.equal('numeric');
    expect(input.getAttribute('autocomplete')).to.equal('one-time-code');
    for (const a of ['autocapitalize', 'autocorrect', 'spellcheck']) expect(input.hasAttribute(a), a).to.equal(false);
  });

  it('alphanumeric: inputmode text + autocapitalize characters + autocorrect off + spellcheck false', () => {
    const input = inputOf(otp('charset="alphanumeric"'));
    expect(input.getAttribute('inputmode')).to.equal('text');
    expect(input.getAttribute('autocapitalize')).to.equal('characters');
    expect(input.getAttribute('autocorrect')).to.equal('off');
    expect(input.getAttribute('spellcheck')).to.equal('false');
    expect(inputOf(otp('charset="alpha" case="lower"')).getAttribute('autocapitalize')).to.equal('off');
  });

  it('typing (real keys): alphanumeric upper-cases, drops - and spaces', async () => {
    const el = otp('charset="alphanumeric" length="5"');
    inputOf(el).focus();
    await sendKeys({ type: 'w-m x7q' });
    expect(el.value).to.equal('WMX7Q');
    expect(inputOf(el).value).to.equal('WMX7Q');
    expect(shown(el)).to.equal('WMX7Q');
  });

  it('paste "ab-12 34" → AB1234; full-width Ａｂ１２ → AB12; â / emoji dropped', () => {
    const el = otp('charset="alphanumeric"');
    fill(el, 'ab-12 34');
    expect(el.value).to.equal('AB1234');
    fill(el, 'Ａｂ１２');
    expect(el.value).to.equal('AB12');
    fill(el, 'xâ😀y');
    expect(el.value).to.equal('XY');
  });

  it('alpha drops digits; case lower / preserve', () => {
    const a = otp('charset="alpha"');
    fill(a, 'ab12cd');
    expect(a.value).to.equal('ABCD');
    const l = otp('charset="alpha" case="lower"');
    fill(l, 'AbC');
    expect(l.value).to.equal('abc');
    const p = otp('charset="alphanumeric" case="preserve"');
    fill(p, 'aB-1');
    expect(p.value).to.equal('aB1');
    p.value = 'xY9';
    expect(p.value).to.equal('xY9');
  });

  it('numeric still ignores letters (v0.27 rule)', async () => {
    const el = otp();
    inputOf(el).focus();
    await sendKeys({ type: '1a2 3' });
    expect(el.value).to.equal('123');
  });

  it('complete fires once per generation at `length` characters', async () => {
    const el = otp('charset="alphanumeric" length="5"');
    const rec = completes(el);
    inputOf(el).focus();
    await sendKeys({ type: 'abcde' });
    expect(rec).to.deep.equal(['ABCDE']);
    await sendKeys({ type: 'f' });
    expect(rec.length).to.equal(1);
    await sendKeys({ press: 'Backspace' });
    await sendKeys({ type: 'z' });
    expect(rec).to.deep.equal(['ABCDE', 'ABCDZ']);
  });

  it('tooShort message: digits for numeric, characters (messages.tooShortChars) for letters', () => {
    const n = otp('length="8"');
    fill(n, '12');
    expect(n.validationMessage).to.equal('Mã gồm 8 chữ số.');
    const t = otp('charset="alphanumeric" length="5"');
    fill(t, 'AB');
    expect(t.validationMessage).to.equal('Mã gồm 5 ký tự.');
    expect(TdOtpInput.messages.tooShortChars).to.equal('Mã gồm {length} ký tự.');
  });
});

describe('v0.36.0 td-otp-input — IME composition', () => {
  it('no normalisation while composing; one normalisation after compositionend; caret at the end', () => {
    const el = otp('charset="alphanumeric"');
    const input = inputOf(el);
    const rec = [];
    el.addEventListener('input', () => rec.push(el.value));
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    input.value = 'aa';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: 'aa' }));
    expect(input.value, 'raw while composing').to.equal('aa');
    input.value = 'â';
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: 'â' }));
    expect(input.value).to.equal('â');
    input.value = 'âb';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'âb' }));
    expect(el.value).to.equal('B');
    expect(input.value).to.equal('B');
    expect(input.selectionStart).to.equal(1);
    // the input event some engines fire after compositionend changes nothing
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false, inputType: 'insertText', data: 'b' }));
    expect(el.value).to.equal('B');
  });
});

describe('v0.36.0 td-otp-input — SSR otp-input@1 (additive)', () => {
  it('8 digits and 5 alphanumerics are adopted in place (same input node, value kept)', () => {
    for (const [id, want, n] of [['ok-8', '12345678', 8], ['ok-5', 'WMX7Q', 5]]) {
      const host = document.getElementById(id);
      expect(host.hasAttribute('data-td-ssr'), id).to.equal(false);
      expect(host.querySelector('input') === adoptedInputs[id], `${id} same input`).to.equal(true);
      expect(host.value).to.equal(want);
      expect(cellsOf(host).length).to.equal(n);
      expect(shown(host)).to.equal(want);
      expect(host.querySelector('input').hasAttribute('maxlength')).to.equal(false);
    }
  });

  for (const id of Object.keys(MM)) {
    it(`${id}: agreement broken → safe render (new input)`, () => {
      const host = mm.querySelector(`#${id}`);
      expect(host.hasAttribute('data-td-ssr')).to.equal(false);
      const input = host.querySelector('input');
      expect(input.hasAttribute('maxlength')).to.equal(false);
      expect(cellsOf(host).length).to.equal(host.length);
      // re-rendered: the cell text from the server is gone
      expect(shown(host)).to.equal(host.value);
    });
  }
});

describe('v0.36.0 td-otp-input — cell shape (QĐ 41)', () => {
  /** every cell's width / height within ±4 % of 44 / 52 (unless coarse and the cell < 37 px) */
  function shapeErrors(host) {
    const errs = [];
    const coarse = matchMedia('(pointer: coarse)').matches;
    for (const c of cellsOf(host)) {
      const r = c.getBoundingClientRect();
      const ratio = r.width / r.height;
      if (coarse && r.width < 37) continue;
      if (Math.abs(ratio / (44 / 52) - 1) > 0.04) errs.push(`${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
    }
    const hr = host.getBoundingClientRect();
    const br = host.querySelector('.td-otp__box').getBoundingClientRect();
    if (br.right > hr.right + 0.5 || br.left < hr.left - 0.5) errs.push(`box ${br.left}–${br.right} outside host ${hr.left}–${hr.right}`);
    return errs;
  }

  for (const w of [320, 360, 390, 240]) {
    for (const attrs of ['', 'length="8"', 'length="10"', 'charset="alphanumeric" length="5"']) {
      it(`${w}px column, ${attrs || '6 digits'}: cells keep 44 / 52 ± 4 %, nothing overflows`, async () => {
        const wrap = mount(`<td-otp-input ${attrs}></td-otp-input>`);
        wrap.style.setProperty('width', `${w}px`);
        await raf();
        const host = wrap.querySelector('td-otp-input');
        expect(shapeErrors(host)).to.deep.equal([]);
        const box = host.querySelector('.td-otp__box').getBoundingClientRect();
        const input = inputOf(host).getBoundingClientRect();
        expect(Math.abs(box.height - cellsOf(host)[0].getBoundingClientRect().height) < 0.5, 'box height = cell height').to.equal(true);
        expect(Math.abs(input.height - box.height) < 0.5 && Math.abs(input.width - box.width) < 0.5, 'input covers the box').to.equal(true);
      });
    }
  }

  it('SSR element mode: the box has the same size before and after :defined (no shift); cells hidden before', async () => {
    expect(cellsVisBefore).to.equal('hidden');
    expect(inputColorBefore).to.not.equal('rgba(0, 0, 0, 0)');
    await raf();
    for (const id of ['pre-6', 'pre-8', 'pre-5']) {
      const r = document.querySelector(`#${id} .td-otp__box`).getBoundingClientRect();
      const b = boxBefore[id];
      expect(Math.abs(r.width - b.width) <= 0.5 && Math.abs(r.height - b.height) <= 0.5, `${id}: ${b.width}×${b.height} → ${r.width}×${r.height}`).to.equal(true);
      expect(document.querySelector(`#${id}`).hasAttribute('data-td-ssr')).to.equal(false);
    }
  });

  it('no warning for valid SSR markup at upgrade', () => {
    expect(warnings).to.deep.equal([]);
  });
});
