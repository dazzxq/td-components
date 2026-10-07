import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-number-input.js';

// v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 9–11, M1) — <td-number-input>: `locale` (separators
// only — the value is still formatted by number-format.js, never by Intl), the virtual-keyboard decimal key (QĐ 10b),
// IME composition (QĐ 10a, synthetic sequence in every engine; the real Chromium IME is test/engines/number-ime.spec.mjs)
// and the "maximum decimals — no padding, no rounding" behaviour (QĐ 9) with real key presses, Chromium / Firefox /
// WebKit. DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const num = (attrs = '') => mount(`<td-number-input ${attrs}></td-number-input>`).querySelector('td-number-input');
const ctl = (el) => el.querySelector('input.td-number__control');
function inputs(el) {
  const rec = [];
  el.addEventListener('input', (e) => { if (e instanceof CustomEvent) rec.push(e.detail.value); });
  return rec;
}
async function focusAt(el, pos) {
  const c = ctl(el);
  c.focus();
  c.setSelectionRange(pos, pos);
  await wait();
  return c;
}

describe('v0.55.0 td-number-input — locale (QĐ 11)', () => {
  const V = 'value="1234567.5" decimals="2"';
  for (const [loc, shown] of [['vi', '1.234.567,5'], ['en', '1,234,567.5'], ['en-US', '1,234,567.5'], ['fr', '1 234 567,5'],
    ['de', '1.234.567,5'], ['de-AT', '1 234 567,5'], ['ru', '1 234 567,5']]) {
    it(`locale="${loc}" → ${shown} (value stays canonical)`, () => {
      const el = num(`locale="${loc}" ${V}`);
      expect(ctl(el).value).to.equal(shown);
      expect(el.value).to.equal('1234567.5');
    });
  }

  it('a tag outside the table goes through Intl (validated): pt-PT → space / comma, en-IN → groups of 3', () => {
    expect(ctl(num(`locale="pt-PT" ${V}`)).value).to.equal('1 234 567,5');
    expect(ctl(num(`locale="en-IN" ${V}`)).value).to.equal('1,234,567.5');
  });

  it('an unusable locale (de-CH apostrophe, unknown, malformed) → default separators + ONE warning each', () => {
    const warns = captureWarn();
    for (const loc of ['de-CH', 'xx', 'not a tag']) {
      const el = num(`locale="${loc}" ${V}`);
      expect(ctl(el).value, loc).to.equal('1.234.567,5');
      el.setAttribute('label', 'again');
    }
    expect(warns.filter((w) => /locale/.test(w)).length).to.equal(3);
  });

  it('explicit separators win, resolved pairwise (de + group "," → decimal "."; en + decimal "," → group ".")', () => {
    expect(ctl(num(`locale="de" group-separator="," ${V}`)).value).to.equal('1,234,567.5');
    expect(ctl(num(`locale="en" decimal-separator="," ${V}`)).value).to.equal('1.234.567,5');
    expect(ctl(num(`locale="en" group-separator="." ${V}`)).value).to.equal('1.234.567,5');
    expect(ctl(num(`locale="en" group-separator=" " ${V}`)).value).to.equal('1 234 567.5');
  });

  it('no locale: exactly the 0.54 separators (decimal-separator="." alone still warns and keeps ",")', () => {
    const warns = captureWarn();
    expect(ctl(num(V)).value).to.equal('1.234.567,5');
    expect(ctl(num(`decimal-separator="." ${V}`)).value).to.equal('1.234.567,5');
    expect(warns.length).to.equal(1);
  });

  it('changing locale at run time re-formats IN PLACE (same control, focus kept, no input event)', async () => {
    const el = num(`locale="en" ${V}`);
    const rec = inputs(el);
    const c = await focusAt(el, 3);
    el.locale = 'vi';
    await wait();
    expect(ctl(el) === c, 'same control').to.equal(true);
    expect(document.activeElement === c).to.equal(true);
    expect(c.value).to.equal('1.234.567,5');
    expect(el.getAttribute('locale')).to.equal('vi');
    expect(rec.length).to.equal(0);
  });

  it('typing and pasting follow the locale (en: "," groups, "." is the decimal)', async () => {
    const el = num('locale="en" decimals="2"');
    const c = await focusAt(el, 0);
    await sendKeys({ type: '1234.5' });
    expect(c.value).to.equal('1,234.5');
    expect(el.value).to.equal('1234.5');
    const ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    ev.clipboardData.setData('text/plain', '9,876.25');
    c.select();
    c.dispatchEvent(ev);
    expect(el.value).to.equal('9876.25');
    expect(c.value).to.equal('9,876.25');
  });
});

describe('v0.55.0 td-number-input — the virtual keyboard decimal key (QĐ 10b)', () => {
  for (const key of ['.', ',']) {
    it(`decimals > 0, no decimal yet: "${key}" inserts the FIELD's decimal (vi ",")`, async () => {
      const el = num('decimals="2" value="12"');
      const c = await focusAt(el, 2);
      await sendKeys({ type: `${key}5` });
      expect(c.value).to.equal('12,5');
      expect(el.value).to.equal('12.5');
      expect(c.selectionStart).to.equal(4);
    });
    it(`locale en: "${key}" inserts "."`, async () => {
      const el = num('locale="en" decimals="2" value="1234"');
      const c = await focusAt(el, 5);
      await sendKeys({ type: `${key}7` });
      expect(c.value).to.equal('1,234.7');
      expect(el.value).to.equal('1234.7');
    });
    it(`"${key}" is refused when decimals = 0 or the field already has its decimal`, async () => {
      const a = num('value="1234"');
      const rec = inputs(a);
      const ca = await focusAt(a, 5);
      await sendKeys({ type: key });
      expect(ca.value).to.equal('1.234');
      const b = num('decimals="2" value="12.5"');
      const cb = await focusAt(b, 4);
      await sendKeys({ type: key });
      expect(cb.value).to.equal('12,5');
      expect(rec.length).to.equal(0);
    });
  }

  it('the decimal key replacing a selection that holds the decimal is allowed (the field has no decimal after it)', async () => {
    const el = num('decimals="2" value="12.5"');
    const c = ctl(el);
    c.focus();
    c.setSelectionRange(2, 4); // ",5"
    await sendKeys({ type: '.' });
    expect(c.value).to.equal('12,');
    expect(el.value).to.equal('12');
  });
});

describe('v0.55.0 td-number-input — IME composition (QĐ 10a, synthetic sequence)', () => {
  it('no formatting while composing; compositionend normalises ONCE, caret after the last digit, ONE input event', async () => {
    const el = num('value="1000"');
    const rec = inputs(el);
    const c = await focusAt(el, 1); // 1|.000
    c.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    c.value = '1２.000';
    c.setSelectionRange(2, 2);
    c.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '２', isComposing: true }));
    expect(c.value, 'not formatted mid-composition').to.equal('1２.000');
    expect(rec.length).to.equal(0);
    c.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '２' }));
    expect(c.value).to.equal('12.000');
    expect(el.value).to.equal('12000');
    expect(c.selectionStart).to.equal(2);
    expect(rec).to.deep.equal(['12000']);
  });

  it('Arabic-Indic digits composed between groups → ASCII, value canonical', async () => {
    const el = num('value="1000"');
    const c = await focusAt(el, 5);
    c.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    c.value = '1.000٥';
    c.setSelectionRange(6, 6);
    c.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '٥', isComposing: true }));
    c.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '٥' }));
    expect(c.value).to.equal('10.005');
    expect(el.value).to.equal('10005');
    expect(c.selectionStart).to.equal(6);
  });
});

describe('v0.55.0 td-number-input — decimals is a maximum: no padding, no rounding (QĐ 9, real keys)', () => {
  it('typed 6,7 → 6,7 (6.7); typed 6,70 → 6,70 (6.70); value="6.7" → 6,7', async () => {
    const a = num('decimals="2"');
    const ca = await focusAt(a, 0);
    await sendKeys({ type: '6,7' });
    expect(ca.value).to.equal('6,7');
    expect(a.value).to.equal('6.7');
    await sendKeys({ type: '0' });
    expect(ca.value).to.equal('6,70');
    expect(a.value).to.equal('6.70');
    expect(ctl(num('decimals="2" value="6.7"')).value).to.equal('6,7');
  });

  it('a 3rd decimal digit is refused (6,78 stays); ↑ from 6,7 with step 0.1 → 6,8; blur on "6," → 6', async () => {
    const a = num('decimals="2" value="6.78"');
    const ca = await focusAt(a, 4);
    await sendKeys({ type: '9' });
    expect(ca.value).to.equal('6,78');
    const b = num('decimals="2" step="0.1" value="6.7"');
    const cb = await focusAt(b, 3);
    await sendKeys({ press: 'ArrowUp' });
    expect(cb.value).to.equal('6,8');
    const d = num('decimals="2"');
    const cd = await focusAt(d, 0);
    await sendKeys({ type: '6,' });
    expect(cd.value).to.equal('6,');
    cd.blur();
    expect(cd.value).to.equal('6');
    expect(d.value).to.equal('6');
  });
});
