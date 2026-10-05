import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdScanInput } from './td-scan-input.js';

// v0.38.0 (plan v0.38.0-scan-input M2, QĐ 3–18) — <td-scan-input> in Chromium, Firefox AND WebKit (group `engines`).
// Real signals: `sendKeys` drives Playwright's keyboard (keydown / beforeinput / input / keyup per character). A scan
// is `type` in ONE command (machine rhythm, no delay); manual typing waits 150 ms between characters (wide margin:
// the threshold is 40 ms). DOM nodes are compared as booleans (a failing chai assertion carrying nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error('timed out waiting');
    await wait(10);
  }
}
const extra = [];
afterEach(() => {
  extra.splice(0).forEach((f) => f());
  TdScanInput.muted = false;
});

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const scanEl = (attrs = '') => mount(`<td-scan-input ${attrs}></td-scan-input>`).querySelector('td-scan-input');
const inputOf = (el) => el.querySelector('input.td-scan__input');
const rowsOf = (el) => [...el.querySelectorAll('li.td-scan__item')];
const rowValues = (el) => rowsOf(el).map((li) => li.querySelector('.td-scan__value').textContent);
function record(el, ...names) {
  const rec = [];
  for (const n of names) el.addEventListener(n, (e) => rec.push({ type: n, ...e.detail }));
  return rec;
}
/** A real scan: focus, the characters in one command (machine rhythm), then the terminator key. */
async function scan(el, text, key = 'Enter') {
  inputOf(el).focus();
  await sendKeys({ type: text });
  if (key) await sendKeys({ press: key });
}
/** Typed by hand: 150 ms between characters. */
async function typeSlow(el, text, key = 'Enter') {
  inputOf(el).focus();
  for (const ch of text) {
    await sendKeys({ type: ch });
    await wait(150);
  }
  if (key) await sendKeys({ press: key });
}
/** Validator whose calls resolve / reject when the test says so. */
function deferred() {
  const calls = [];
  const fn = (value, ctx) => new Promise((resolve, reject) => { calls.push({ value, ctx, resolve, reject }); });
  return { fn, calls };
}
const IMEI = '356938035643809';

describe('td-scan-input — markup + a11y (QĐ 8, 17, 18)', () => {
  it('one text input with the scanner-safe attributes, a real <label>, a status indicator in words', () => {
    const el = scanEl('label="IMEI" name="imei"');
    const input = inputOf(el);
    expect(el.querySelectorAll('input').length).to.equal(1);
    for (const [k, v] of [['type', 'text'], ['autocomplete', 'off'], ['autocapitalize', 'none'], ['autocorrect', 'off'],
      ['spellcheck', 'false'], ['enterkeyhint', 'done']]) expect(input.getAttribute(k), k).to.equal(v);
    expect(input.labels[0].textContent).to.equal('IMEI');
    const status = el.querySelector('.td-scan__status');
    expect(status.textContent).to.equal(TdScanInput.labels.idle);
    input.focus();
    expect(status.textContent).to.equal(TdScanInput.labels.ready);
    expect(el.querySelector('[role="status"]') !== null).to.equal(true);
    expect(el.querySelector('[aria-live="assertive"]') !== null).to.equal(true);
  });

  it('inputmode passes through (none: no virtual keyboard on scanner phones); clicking the indicator focuses the input', () => {
    const el = scanEl('inputmode="none"');
    expect(inputOf(el).getAttribute('inputmode')).to.equal('none');
    el.querySelector('.td-scan__status').click();
    expect(document.activeElement === inputOf(el)).to.equal(true);
  });

  it('no label → host aria-label, else labels.input names the input', () => {
    expect(inputOf(scanEl('aria-label="Mã đơn"')).getAttribute('aria-label')).to.equal('Mã đơn');
    expect(inputOf(scanEl()).getAttribute('aria-label')).to.equal(TdScanInput.labels.input);
  });
});

describe('td-scan-input — scanner vs manual (QĐ 3–6)', () => {
  it('a machine burst + Enter → exactly one scan, source scanner; the value stays selected (single)', async () => {
    const el = scanEl('name="code"');
    const rec = record(el, 'scan', 'change');
    await scan(el, IMEI);
    await until(() => rec.length >= 2);
    const s = rec.find((r) => r.type === 'scan');
    expect(s.value).to.equal(IMEI);
    expect(s.source).to.equal('scanner');
    expect(s.mixed).to.equal(false);
    expect(rec.filter((r) => r.type === 'scan').length).to.equal(1);
    expect(rec.find((r) => r.type === 'change').value).to.equal(IMEI);
    expect(el.value).to.equal(IMEI);
    const input = inputOf(el);
    expect(input.selectionStart).to.equal(0);
    expect(input.selectionEnd).to.equal(IMEI.length);
    expect(document.activeElement === input).to.equal(true);
  });

  it('typed by hand (150 ms apart) + Enter → source manual (allowed by default)', async () => {
    const el = scanEl();
    const rec = record(el, 'scan');
    await typeSlow(el, 'AB12');
    await until(() => rec.length === 1);
    expect(rec[0].source).to.equal('manual');
  });

  it('manual="reject": no scan, the error shows (aria-invalid, note, scan-invalid)', async () => {
    const el = scanEl('manual="reject" name="c"');
    const rec = record(el, 'scan', 'scan-invalid');
    await typeSlow(el, 'AB12');
    await until(() => rec.length === 1);
    expect(rec[0].type).to.equal('scan-invalid');
    expect(rec[0].message).to.equal(TdScanInput.messages.manualRejected);
    expect(inputOf(el).getAttribute('aria-invalid')).to.equal('true');
    expect(el.querySelector('.td-field-error').textContent).to.equal(TdScanInput.messages.manualRejected);
    expect(el.value).to.equal('');
  });

  it('shorter than min-length (fast) → manual; C0 controls stripped, trimmed; empty → ignored silently', async () => {
    const el = scanEl('min-length="6"');
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'ABC12');
    await until(() => rec.length === 1);
    expect(rec[0].source).to.equal('manual');
    await scan(el, '   ');
    await wait(80);
    expect(rec.length).to.equal(1);
  });

  it('maxlength cuts the value (code points)', async () => {
    const el = scanEl('maxlength="5"');
    const rec = record(el, 'scan');
    await scan(el, '1234567890');
    await until(() => rec.length === 1);
    expect(rec[0].value).to.equal('12345');
  });
});

describe('td-scan-input — terminators, no implicit submit (QĐ 4)', () => {
  it('Enter inside a <form> never submits it', async () => {
    const wrap = mount('<form><td-scan-input name="c"></td-scan-input><button>Gửi</button></form>');
    const form = wrap.querySelector('form');
    let submits = 0;
    form.addEventListener('submit', (e) => { submits++; e.preventDefault(); });
    const el = wrap.querySelector('td-scan-input');
    const rec = record(el, 'scan');
    await scan(el, IMEI);
    await until(() => rec.length === 1);
    await typeSlow(el, 'XY99');
    await until(() => rec.length === 2);
    await wait(50);
    expect(submits).to.equal(0);
  });

  it('terminator="tab": a fast Tab ends the scan and keeps the focus; a Tab after typing by hand leaves', async () => {
    const wrap = mount('<td-scan-input terminator="tab"></td-scan-input><button id="next">x</button>');
    const el = wrap.querySelector('td-scan-input');
    const rec = record(el, 'scan');
    await scan(el, IMEI, 'Tab');
    await until(() => rec.length === 1);
    expect(rec[0].source).to.equal('scanner');
    expect(document.activeElement === inputOf(el)).to.equal(true);
    inputOf(el).value = '';
    await typeSlow(el, 'AB', 'Tab');
    await wait(50);
    expect(document.activeElement === inputOf(el)).to.equal(false);
    expect(rec.length).to.equal(1);
  });

  it('terminator="none": a fast run then silence → one scan', async () => {
    const el = scanEl('terminator="none"');
    const rec = record(el, 'scan');
    await scan(el, IMEI, null);
    await until(() => rec.length === 1);
    await wait(200);
    expect(rec.length).to.equal(1);
    expect(rec[0].value).to.equal(IMEI);
    expect(rec[0].source).to.equal('scanner');
  });
});

describe('td-scan-input — dedupe (QĐ 11)', () => {
  it('same value within dedupe-window → scan-duplicate, validate not called; after the window → scan', async () => {
    const el = scanEl('multiple dedupe-window="1000"');
    let calls = 0;
    el.validate = () => { calls++; return true; };
    const rec = record(el, 'scan', 'scan-duplicate', 'scan-invalid');
    await scan(el, 'AAA111');
    await until(() => rec.length === 1);
    await scan(el, 'AAA111');
    await until(() => rec.length === 2);
    expect(rec[1].type).to.equal('scan-duplicate');
    expect(rec[1].value).to.equal('AAA111');
    expect(calls).to.equal(1);
    // multiple: after the window the value is already listed → refused by the kit (not a duplicate)
    await wait(1050);
    await scan(el, 'AAA111');
    await until(() => rec.length === 3);
    expect(rec[2].type).to.equal('scan-invalid');
    expect(rec[2].message).to.equal(TdScanInput.messages.alreadyListed);
    expect(calls).to.equal(1);
  });

  it('single mode: after the window the same value scans again', async () => {
    const el = scanEl('dedupe-window="1000"');
    const rec = record(el, 'scan', 'scan-duplicate');
    await scan(el, 'BBB222');
    await until(() => rec.length === 1);
    await scan(el, 'BBB222');
    await until(() => rec.length === 2);
    expect(rec[1].type).to.equal('scan-duplicate');
    await wait(1050);
    await scan(el, 'BBB222');
    await until(() => rec.length === 3);
    expect(rec[2].type).to.equal('scan');
  });
});

describe('td-scan-input — async validate (QĐ 9, 10, 13)', () => {
  it('3 scans, promises settle 3-1-2 → list + scan events in scan order 1-2-3; form invalid while pending', async () => {
    const wrap = mount('<form><td-scan-input multiple name="imei[]"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    const form = wrap.querySelector('form');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan');
    await scan(el, 'AAAA01');
    await scan(el, 'BBBB02');
    await scan(el, 'CCCC03');
    await until(() => v.calls.length === 3);
    expect(form.checkValidity()).to.equal(false);
    expect(el.validity.customError).to.equal(true);
    expect(el.validationMessage).to.equal(TdScanInput.messages.pending);
    expect(rowsOf(el).every((li) => li.getAttribute('data-state') === 'pending')).to.equal(true);
    v.calls[2].resolve(true);
    await wait(20);
    expect(rec.length).to.equal(0);
    v.calls[0].resolve(true);
    await until(() => rec.length === 1);
    v.calls[1].resolve(true);
    await until(() => rec.length === 3);
    expect(rec.map((r) => r.value)).to.deep.equal(['AAAA01', 'BBBB02', 'CCCC03']);
    expect(rec.map((r) => r.seq)).to.deep.equal([...rec.map((r) => r.seq)].sort((a, b) => a - b));
    expect(rowValues(el)).to.deep.equal(['CCCC03', 'BBBB02', 'AAAA01'], 'newest on top');
    expect(new FormData(form).getAll('imei[]')).to.deep.equal(['AAAA01', 'BBBB02', 'CCCC03']);
    expect(form.checkValidity()).to.equal(true);
  });

  it('validate gets { source, signal }; a string result is the error message (text); reject → validateFailed', async () => {
    const el = scanEl('name="c"');
    const seen = [];
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a);
    extra.push(() => { console.error = orig; });
    el.validate = (value, ctx) => {
      seen.push(ctx);
      if (value === 'BAD001') return 'Đã có trong danh sách';
      if (value === 'ERR001') return Promise.reject(new Error('net'));
      return true;
    };
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'BAD001');
    await until(() => rec.length === 1);
    expect(seen[0].source).to.equal('scanner');
    expect(seen[0].signal instanceof AbortSignal).to.equal(true);
    expect(rec[0].message).to.equal('Đã có trong danh sách');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Đã có trong danh sách');
    expect(el.validity.customError).to.equal(true, 'the last single scan error blocks submit');
    await scan(el, 'ERR001');
    await until(() => rec.length === 2);
    expect(rec[1].message).to.equal(TdScanInput.messages.validateFailed);
    expect(errs.length).to.equal(1);
    // SEC-4: a fixed message only — never the thrown / rejected value (may carry server text, tokens, PII)
    expect(errs[0].every((a) => typeof a === 'string')).to.equal(true);
    expect(errs[0].join(' ').includes('net')).to.equal(false);
    await scan(el, 'OK0001');
    await until(() => rec.length === 3);
    expect(rec[2].type).to.equal('scan');
    expect(el.validity.valid).to.equal(true);
    expect(inputOf(el).hasAttribute('aria-invalid')).to.equal(false);
  });

  it('validate-timeout → signal aborted + messages.timeout', async () => {
    const el = scanEl('validate-timeout="100"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan-invalid');
    await scan(el, IMEI);
    await until(() => rec.length === 1);
    expect(v.calls[0].ctx.signal.aborted).to.equal(true);
    expect(rec[0].message).to.equal(TdScanInput.messages.timeout);
  });

  it('single: an invalid scan keeps the previous valid form value', async () => {
    const wrap = mount('<form><td-scan-input name="c"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    el.validate = (v) => v !== 'NOPE01';
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'GOOD01');
    await until(() => rec.length === 1);
    await scan(el, 'NOPE01');
    await until(() => rec.length === 2);
    expect(el.value).to.equal('GOOD01');
    expect(new FormData(wrap.querySelector('form')).get('c')).to.equal('GOOD01');
    expect(inputOf(el).value).to.equal('NOPE01', 'the input keeps the invalid text');
    expect(rec[1].message).to.equal(TdScanInput.messages.invalid);
  });
});

describe('td-scan-input — multiple (QĐ 12)', () => {
  it('FormData has only the valid codes; "Bỏ" removes one and refocuses the input; change events', async () => {
    const wrap = mount('<form><td-scan-input multiple name="imei[]"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    const form = wrap.querySelector('form');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'change');
    await scan(el, 'AAAA01');
    await scan(el, 'BBBB02');
    await scan(el, 'CCCC03');
    await until(() => v.calls.length === 3);
    expect(inputOf(el).value).to.equal('', 'the input is cleared after each scan');
    v.calls[0].resolve(true);
    v.calls[1].resolve('Sai mã');
    await wait(20);
    expect(new FormData(form).getAll('imei[]')).to.deep.equal(['AAAA01'], 'pending / invalid not submitted');
    v.calls[2].resolve(true);
    await until(() => rec.length === 2);
    expect(new FormData(form).getAll('imei[]')).to.deep.equal(['AAAA01', 'CCCC03']);
    const bad = rowsOf(el).find((li) => li.getAttribute('data-value') === 'BBBB02');
    expect(bad.getAttribute('data-state')).to.equal('invalid');
    expect(bad.textContent.includes('Sai mã')).to.equal(true);
    expect(el.querySelector('.td-scan__count').textContent).to.equal('Đã quét: 2');
    const rm = rowsOf(el).find((li) => li.getAttribute('data-value') === 'AAAA01').querySelector('button.td-scan__remove');
    expect(rm.getAttribute('aria-label')).to.equal('Bỏ AAAA01');
    rm.focus();
    rm.click();
    expect(new FormData(form).getAll('imei[]')).to.deep.equal(['CCCC03']);
    expect(document.activeElement === inputOf(el)).to.equal(true);
    expect(rec.at(-1).values).to.deep.equal(['CCCC03']);
    expect(el.values).to.deep.equal(['CCCC03']);
  });

  it('max: a scan over the limit is refused (messages.max)', async () => {
    const el = scanEl('multiple max="1" name="c[]"');
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA01');
    await until(() => rec.length === 1);
    await scan(el, 'BBBB02');
    await until(() => rec.length === 2);
    expect(rec[1].type).to.equal('scan-invalid');
    expect(rec[1].message).to.equal(TdScanInput.messages.max.replace('{max}', '1'));
    expect(el.values).to.deep.equal(['AAAA01']);
  });

  it('values is silent; form.reset() goes back to the default captured at connect', async () => {
    const wrap = mount('<form><td-scan-input multiple name="c[]"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    const rec = record(el, 'change', 'scan');
    el.values = ['X1', ' X2 ', 'X1', ''];
    expect(el.values).to.deep.equal(['X1', 'X2']);
    expect(rowValues(el)).to.deep.equal(['X2', 'X1']);
    expect(rec.length).to.equal(0);
    await scan(el, 'YYYY03');
    await until(() => rec.length === 2);
    wrap.querySelector('form').reset();
    expect(el.values).to.deep.equal([]);
    expect(rowsOf(el).length).to.equal(0);
  });

  it('"Xoá tất cả" clears (no confirm under 5) and fires change', async () => {
    const el = scanEl('multiple name="c[]"');
    el.values = ['A1', 'A2'];
    const rec = record(el, 'change');
    el.querySelector('button.td-scan__clear').click();
    await until(() => rec.length === 1);
    expect(el.values).to.deep.equal([]);
    expect(rec[0].values).to.deep.equal([]);
  });
});

describe('td-scan-input — composition (synthetic contract, all engines — QĐ 8)', () => {
  it('compositionstart → insertCompositionText → Enter isComposing → compositionend: no rhythm, no scan; the run is manual', async () => {
    const el = scanEl();
    const rec = record(el, 'scan');
    const input = inputOf(el);
    input.focus();
    // synthetic events (Firefox / WebKit have no automated IME — the real IME path is test/engines/scan-input.spec.mjs)
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: 'đ', isComposing: true }));
    input.value = 'đ';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'đ', isComposing: true }));
    const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', isComposing: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).to.equal(false, 'the composition Enter is the IME\'s');
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'đ' }));
    await wait(30);
    expect(rec.length).to.equal(0);
    await sendKeys({ type: 'D12345' });
    await sendKeys({ press: 'Enter' });
    await until(() => rec.length === 1);
    expect(rec[0].source).to.equal('manual');
  });
});

describe('td-scan-input — composition commit of several characters = a batch insert (QĐ 5a)', () => {
  it('compositionend with a 15-character commit + Enter → source paste (Android IME / Firefox insertText shape)', async () => {
    const el = scanEl();
    const rec = record(el, 'scan');
    const input = inputOf(el);
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: IMEI, isComposing: true }));
    input.value = IMEI;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: IMEI }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: IMEI }));
    await sendKeys({ press: 'Enter' });
    await until(() => rec.length === 1);
    expect(rec[0].source).to.equal('paste');
  });
});

describe('td-scan-input — generation (QĐ 10, review R1-2)', () => {
  for (const how of ['reset()', 'form.reset()', 'remove()']) {
    it(`a validator ignoring its signal resolves after ${how} → nothing changes (events, list, FormData, validity, live regions, beeps)`, async () => {
      const wrap = mount('<form><td-scan-input multiple beep name="c[]"></td-scan-input></form>');
      const el = wrap.querySelector('td-scan-input');
      const form = wrap.querySelector('form');
      let osc = 0;
      const proto = window.AudioContext && window.AudioContext.prototype;
      const orig = proto && proto.createOscillator;
      if (proto) {
        proto.createOscillator = function patched(...a) { osc++; return orig.apply(this, a); };
        extra.push(() => { proto.createOscillator = orig; });
      }
      const v = deferred();
      el.validate = v.fn;
      const rec = record(el, 'scan', 'scan-invalid', 'change', 'scan-duplicate');
      await scan(el, 'GEN001');
      await until(() => v.calls.length === 1);
      if (how === 'reset()') el.reset();
      else if (how === 'form.reset()') form.reset();
      else el.remove();
      const snap = () => JSON.stringify({
        rows: rowValues(el),
        fd: new FormData(form).getAll('c[]'),
        valid: el.validity.valid,
        live: [...el.querySelectorAll('[role="status"], [aria-live="assertive"]')].map((n) => n.textContent),
        osc,
      });
      const before = snap();
      const eventsBefore = rec.length;
      v.calls[0].resolve(true);
      await wait(60);
      expect(snap()).to.equal(before);
      expect(rec.length).to.equal(eventsBefore);
      expect(v.calls[0].ctx.signal.aborted).to.equal(true);
    });
  }
});

describe('td-scan-input — pending reservations (QĐ 11, review R1-3)', () => {
  it('A → B → A while A pending: the 2nd A is refused at once (alreadyPending); A invalid → A can be scanned again', async () => {
    const el = scanEl('multiple name="c[]" dedupe-window="0"');
    const calls = [];
    el.validate = (value) => new Promise((resolve) => {
      calls.push({ value, resolve });
    });
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA01');
    await scan(el, 'BBBB02');
    await scan(el, 'AAAA01');
    await until(() => rec.length === 1);
    expect(rec[0].type).to.equal('scan-invalid');
    expect(rec[0].message).to.equal(TdScanInput.messages.alreadyPending);
    expect(calls.length).to.equal(2);
    calls[1].resolve(true); // B first (out of order)
    calls[0].resolve(false); // A invalid → seat released
    await until(() => rec.length === 3);
    expect(rec.slice(1).map((r) => [r.type, r.value])).to.deep.equal([['scan-invalid', 'AAAA01'], ['scan', 'BBBB02']]);
    await scan(el, 'AAAA01');
    await until(() => calls.length === 3);
    calls[2].resolve(true);
    await until(() => rec.length === 4);
    expect(el.values).to.deep.equal(['BBBB02', 'AAAA01']);
  });

  it('final check: a validator returning a value already listed → the row is invalid alreadyListed, no 2nd FormData entry', async () => {
    const wrap = mount('<form><td-scan-input multiple name="c[]"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    el.values = ['CANON1'];
    el.validate = () => ({ valid: true, value: 'CANON1' });
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'alias-1');
    await until(() => rec.length === 1);
    expect(rec[0].type).to.equal('scan-invalid');
    expect(rec[0].message).to.equal(TdScanInput.messages.alreadyListed);
    expect(new FormData(wrap.querySelector('form')).getAll('c[]')).to.deep.equal(['CANON1']);
  });
});

describe('td-scan-input — max counts pending scans (QĐ 12, review R2-6)', () => {
  it('max=1, A pending → B refused at once (validate called once); A valid → one entry', async () => {
    const el = scanEl('multiple max="1" name="c[]"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA01');
    await scan(el, 'BBBB02');
    await until(() => rec.length === 1);
    expect(rec[0].message).to.equal('Đã đủ 1 mã');
    expect(v.calls.length).to.equal(1);
    v.calls[0].resolve(true);
    await until(() => rec.length === 2);
    expect(el.values).to.deep.equal(['AAAA01']);
  });

  it('max=1, A pending → A invalid returns the seat → C accepted', async () => {
    const el = scanEl('multiple max="1" name="c[]"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA01');
    await until(() => v.calls.length === 1);
    v.calls[0].resolve(false);
    await until(() => rec.length === 1);
    await scan(el, 'CCCC03');
    await until(() => v.calls.length === 2);
    v.calls[1].resolve(true);
    await until(() => rec.length === 2);
    expect(el.values).to.deep.equal(['CCCC03']);
  });

  it('re-check on apply: max=2, A + B pending, max lowered to 1 → A valid, B invalid messages.max', async () => {
    const wrap = mount('<form><td-scan-input multiple max="2" name="c[]"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA01');
    await scan(el, 'BBBB02');
    await until(() => v.calls.length === 2);
    el.setAttribute('max', '1');
    v.calls[0].resolve(true);
    v.calls[1].resolve(true);
    await until(() => rec.length === 2);
    expect(rec.map((r) => r.type)).to.deep.equal(['scan', 'scan-invalid']);
    expect(rec[1].message).to.equal('Đã đủ 1 mã');
    expect(new FormData(wrap.querySelector('form')).getAll('c[]')).to.deep.equal(['AAAA01']);
  });

  it('busy: more than 16 pending → messages.busy', async () => {
    const el = scanEl('multiple name="c[]"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan-invalid');
    for (let i = 0; i < 16; i++) await scan(el, `C${String(i).padStart(3, '0')}`);
    await until(() => v.calls.length === 16);
    await scan(el, 'ONEMORE1');
    await until(() => rec.length === 1);
    expect(rec[0].message).to.equal(TdScanInput.messages.busy);
  });
});

describe('td-scan-input — XSS, CSP (QĐ 9)', () => {
  it('a scanned "<b>" and a validator message "<img onerror>" are text only; no style attribute anywhere', async () => {
    const el = scanEl('multiple name="c[]"');
    window.__pwned = undefined;
    el.validate = (v) => (v.includes('<b>') ? '<img src=x onerror="window.__pwned=1">' : true);
    const rec = record(el, 'scan-invalid');
    await scan(el, '<b>x</b>');
    await until(() => rec.length === 1);
    await wait(30);
    expect(el.querySelector('img, b') === null).to.equal(true);
    expect(el.querySelector('[style]') === null).to.equal(true);
    expect(window.__pwned).to.equal(undefined);
    expect(rowsOf(el)[0].querySelector('.td-scan__value').textContent).to.equal('<b>x</b>');
  });
});

describe('td-scan-input — misc', () => {
  it('disabled: the input is disabled and nothing scans', async () => {
    const el = scanEl('disabled');
    expect(inputOf(el).disabled).to.equal(true);
  });

  it('required: single → valueMissing until a valid scan', async () => {
    const el = scanEl('required name="c"');
    expect(el.validity.valueMissing).to.equal(true);
    const rec = record(el, 'scan');
    await scan(el, IMEI);
    await until(() => rec.length === 1);
    expect(el.validity.valid).to.equal(true);
  });

  it('value property is silent and selected-on-scan semantics hold', () => {
    const el = scanEl('name="c"');
    const rec = record(el, 'change', 'scan');
    el.value = '  ABC ';
    expect(el.value).to.equal('ABC');
    expect(inputOf(el).value).to.equal('ABC');
    expect(rec.length).to.equal(0);
  });

  it('beep: a speaker button toggles mute (aria-pressed, mute-change); no button without beep', () => {
    expect(scanEl().querySelector('.td-scan__mute') === null).to.equal(true);
    const el = scanEl('beep');
    const btn = el.querySelector('button.td-scan__mute');
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    expect(btn.getAttribute('aria-label')).to.equal(TdScanInput.labels.mute);
    const rec = record(el, 'mute-change');
    btn.click();
    expect(el.muted).to.equal(true);
    expect(el.hasAttribute('muted')).to.equal(true);
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.getAttribute('aria-label')).to.equal(TdScanInput.labels.unmute);
    expect(rec).to.deep.equal([{ type: 'mute-change', muted: true }]);
  });
});

describe('td-scan-input — review round 1 (ISSUE-1…8, SEC-1…4)', () => {
  it('ISSUE-1 / SEC-1: older pending scan VALID, newer scan refused → the newer error stays, form invalid until a newer scan succeeds', async () => {
    const wrap = mount('<form><td-scan-input name="c" manual="reject"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    const form = wrap.querySelector('form');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA0001');
    await until(() => v.calls.length === 1);
    await typeSlow(el, 'BB12');
    await until(() => rec.length === 1);
    expect(rec[0].message).to.equal(TdScanInput.messages.manualRejected);
    v.calls[0].resolve(true);
    await until(() => rec.length === 2);
    expect(rec[1].type).to.equal('scan');
    expect(el.validity.customError).to.equal(true, 'B (newer) still refused');
    expect(form.checkValidity()).to.equal(false);
    expect(el.querySelector('.td-field-error').textContent).to.equal(TdScanInput.messages.manualRejected);
    expect(inputOf(el).getAttribute('aria-invalid')).to.equal('true');
    v.calls.length = 0;
    await scan(el, 'CCCC0003');
    await until(() => v.calls.length === 1);
    v.calls[0].resolve(true);
    await until(() => rec.length === 3);
    expect(el.validity.valid).to.equal(true, 'a NEWER success clears it');
  });

  it('ISSUE-1 / SEC-1: TWO older pending scans both valid after a newer refusal → still invalid', async () => {
    const el = scanEl('name="c" manual="reject"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan', 'scan-invalid');
    await scan(el, 'AAAA0001');
    await scan(el, 'AAAA0002');
    await until(() => v.calls.length === 2);
    await typeSlow(el, 'BB12');
    await until(() => rec.length === 1);
    v.calls[0].resolve(true);
    v.calls[1].resolve(true);
    await until(() => rec.length === 3);
    expect(el.validity.customError).to.equal(true);
    expect(el.validationMessage).to.equal(TdScanInput.messages.manualRejected);
  });

  it('ISSUE-1 / SEC-1: older pending scan INVALID, newer scan refused → the newer error is not replaced', async () => {
    const el = scanEl('name="c" manual="reject"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan-invalid');
    await scan(el, 'AAAA0001');
    await until(() => v.calls.length === 1);
    await typeSlow(el, 'BB12');
    await until(() => rec.length === 1);
    v.calls[0].resolve('Lỗi của A');
    await until(() => rec.length === 2);
    expect(el.querySelector('.td-field-error').textContent).to.equal(TdScanInput.messages.manualRejected);
    expect(el.validationMessage).to.equal(TdScanInput.messages.manualRejected);
  });

  it('SEC-2: live scans stop at the hard ceiling 1000 even without max (and max above it is capped)', async () => {
    for (const attrs of ['multiple name="c[]"', 'multiple name="c[]" max="5000"']) {
      const el = scanEl(attrs);
      el.values = Array.from({ length: 1000 }, (_, i) => `V${String(i).padStart(5, '0')}`);
      expect(el.values.length).to.equal(1000);
      const rec = record(el, 'scan', 'scan-invalid');
      await scan(el, 'ONEMORE1');
      await until(() => rec.length === 1);
      expect(rec[0].type).to.equal('scan-invalid', attrs);
      expect(rec[0].message).to.equal('Đã đủ 1000 mã');
      expect(el.values.length).to.equal(1000);
    }
  });

  it('ISSUE-2: value set on a disconnected multiple element = values [value]', () => {
    const el = document.createElement('td-scan-input');
    el.setAttribute('multiple', '');
    el.setAttribute('name', 'c[]');
    el.value = '  A0001 ';
    const wrap = mount('<form></form>');
    wrap.firstElementChild.appendChild(el);
    expect(el.values).to.deep.equal(['A0001']);
    expect(new FormData(wrap.firstElementChild).getAll('c[]')).to.deep.equal(['A0001']);
  });

  it('ISSUE-2: value assigned before the upgrade (multiple) = values [value]', () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-scan-input multiple name="c[]"></td-scan-input>';
    const el = tpl.content.firstElementChild;
    expect(el instanceof TdScanInput).to.equal(false, 'not upgraded yet');
    el.value = 'B0002';
    const wrap = mount('<form></form>');
    wrap.firstElementChild.appendChild(document.adoptNode(el));
    expect(el instanceof TdScanInput).to.equal(true);
    expect(el.values).to.deep.equal(['B0002']);
    expect(new FormData(wrap.firstElementChild).getAll('c[]')).to.deep.equal(['B0002']);
  });

  it('ISSUE-3: clear() and reset() (multiple) also empty the scanner textbox', async () => {
    const el = scanEl('multiple name="c[]"');
    inputOf(el).focus();
    await sendKeys({ type: 'PART' });
    el.clear();
    expect(inputOf(el).value).to.equal('');
    await sendKeys({ type: 'PART2' });
    el.reset();
    expect(inputOf(el).value).to.equal('');
  });

  it('ISSUE-4: readonly multiple → "Bỏ" and "Xoá tất cả" disabled + guarded; the speaker stays usable', async () => {
    const el = scanEl('multiple readonly beep name="c[]"');
    el.values = ['A0001', 'A0002'];
    const rm = el.querySelector('.td-scan__remove');
    const clr = el.querySelector('.td-scan__clear');
    expect(rm.disabled).to.equal(true);
    expect(clr.disabled).to.equal(true);
    expect(el.querySelector('.td-scan__mute').disabled).to.equal(false);
    rm.disabled = false; // even if a script re-enables it, the click is guarded
    rm.click();
    clr.disabled = false;
    clr.click();
    await wait(30);
    expect(el.values).to.deep.equal(['A0001', 'A0002']);
    el.removeAttribute('readonly');
    expect(el.querySelector('.td-scan__remove').disabled).to.equal(false);
    expect(el.querySelector('.td-scan__clear').disabled).to.equal(false);
  });

  it('ISSUE-5: Web Audio is prepared (resume) during the scan keystroke, before validate resolves', async () => {
    const proto = window.AudioContext && window.AudioContext.prototype;
    if (!proto) return;
    let resumes = 0;
    const orig = proto.resume;
    proto.resume = function patched(...a) { resumes++; return orig.apply(this, a); };
    extra.push(() => { proto.resume = orig; });
    const el = scanEl('beep');
    const v = deferred();
    el.validate = v.fn;
    await scan(el, 'AUDIO001');
    await until(() => v.calls.length === 1);
    expect(resumes > 0).to.equal(true);
  });

  it('ISSUE-6: removing a pending row frees its value for an immediate rescan (no stale dedupe)', async () => {
    const el = scanEl('multiple name="c[]"');
    const v = deferred();
    el.validate = v.fn;
    const rec = record(el, 'scan-duplicate', 'scan-invalid');
    await scan(el, 'AAAA0001');
    await until(() => v.calls.length === 1);
    el.querySelector('.td-scan__remove').click();
    expect(v.calls[0].ctx.signal.aborted).to.equal(true);
    await scan(el, 'AAAA0001');
    await until(() => v.calls.length === 2);
    expect(rec.length).to.equal(0);
  });

  it('ISSUE-8: compositionstart cancels the terminator="none" silence timer', async () => {
    const el = scanEl('terminator="none" key-interval="200"');
    const rec = record(el, 'scan');
    await scan(el, IMEI, null);
    inputOf(el).dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    await wait(800);
    expect(rec.length).to.equal(0);
  });
});

describe('td-scan-input — review round 2 (SEC-1 / ISSUE-5 / ISSUE-9)', () => {
  /** count started oscillators + resume() calls on the real AudioContext prototype */
  function spyAudio() {
    const s = { osc: 0, resume: 0 };
    const proto = window.AudioContext && window.AudioContext.prototype;
    if (!proto) return s;
    const o = proto.createOscillator;
    const r = proto.resume;
    proto.createOscillator = function patched(...a) { s.osc++; return o.apply(this, a); };
    proto.resume = function patched(...a) { s.resume++; return r.apply(this, a); };
    extra.push(() => { proto.createOscillator = o; proto.resume = r; });
    return s;
  }
  const regions = (el) => [...el.querySelectorAll('[role="status"], [aria-live="assertive"]')].map((n) => n.textContent);

  for (const outcome of ['valid', 'invalid']) {
    it(`SEC-1: an OLDER ${outcome} result after a newer refusal → live regions unchanged, no tone (app event still fires)`, async () => {
      const el = scanEl('name="c" manual="reject" beep');
      const audio = spyAudio();
      const v = deferred();
      el.validate = v.fn;
      const rec = record(el, 'scan', 'scan-invalid');
      await scan(el, 'AAAA0001');
      await until(() => v.calls.length === 1);
      await typeSlow(el, 'BB12');
      await until(() => rec.length === 1);
      await wait(400); // polite debounce of anything earlier
      const before = JSON.stringify({ r: regions(el), osc: audio.osc });
      v.calls[0].resolve(outcome === 'valid' ? true : 'Lỗi của A');
      await until(() => rec.length === 2);
      expect(rec[1].type).to.equal(outcome === 'valid' ? 'scan' : 'scan-invalid', 'the app event still fires');
      await wait(450);
      expect(JSON.stringify({ r: regions(el), osc: audio.osc })).to.equal(before);
    });
  }

  it('ISSUE-5: terminator="none" + beep → Web Audio is prepared in the keystrokes, before the silence timer', async () => {
    const audio = spyAudio();
    if (!window.AudioContext) return;
    const el = scanEl('terminator="none" key-interval="200" beep');
    const rec = record(el, 'scan');
    await scan(el, IMEI, null);
    expect(rec.length).to.equal(0, 'the silence timer has not fired yet');
    expect(audio.resume > 0).to.equal(true);
    await until(() => rec.length === 1);
  });

  it('ISSUE-9: adding `multiple` keeps the single value → values [v] + FormData', () => {
    const wrap = mount('<form><td-scan-input name="c" value="A0001"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    inputOf(el).value = 'A0001';
    el.setAttribute('multiple', '');
    expect(el.values).to.deep.equal(['A0001']);
    expect(inputOf(el).value).to.equal('', 'multiple: the scanner textbox starts empty');
    expect(new FormData(wrap.firstElementChild).getAll('c')).to.deep.equal(['A0001']);
  });

  it('ISSUE-9: removing `multiple` keeps the newest valid value + FormData', () => {
    const wrap = mount('<form><td-scan-input multiple name="c"></td-scan-input></form>');
    const el = wrap.querySelector('td-scan-input');
    el.values = ['A0001', 'B0002'];
    inputOf(el).value = 'TYPED';
    el.removeAttribute('multiple');
    expect(el.value).to.equal('B0002');
    expect(inputOf(el).value).to.equal('B0002', 'single: the textbox shows the kept value');
    expect(new FormData(wrap.firstElementChild).getAll('c')).to.deep.equal(['B0002']);
  });
});
