// v0.30.0 (plan docs/internal/plans/v0.30.0-number-repeater.md M1) — every number rule of <td-number-input> (the
// component is only a DOM layer): canonical gate, format, edit (caret map), paste / autofill parsing, BigInt arithmetic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asciiDigit, parseCanonical, format, edit, parseLoose, compare, clamp, step, stepAligned, fromNumberString, MAX_DIGITS,
} from './number-format.js';

// td-otp-input.js defines a custom element at import: a two-line shim is enough to read its pure `otpDigits` export
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { get: () => true, define() {} };
const { otpDigits } = await import('../form/td-otp-input.js');

const VI = { group: '.', decimal: ',', decimals: 0, negative: false };
const vi = (o = {}) => ({ ...VI, ...o });

describe('number-format — asciiDigit', () => {
  it('ASCII, full-width, Arabic-Indic, extended Arabic-Indic → ASCII; others → null', () => {
    assert.equal(asciiDigit('7'), '7');
    assert.equal(asciiDigit('７'), '7');
    assert.equal(asciiDigit('٣'), '3');
    assert.equal(asciiDigit('۹'), '9');
    assert.equal(asciiDigit('a'), null);
    assert.equal(asciiDigit('.'), null);
    assert.equal(asciiDigit(''), null);
  });

  it('otpDigits keeps its behaviour (now built on asciiDigit)', () => {
    assert.equal(otpDigits('１２-3 ٤a۵'), '12345');
    assert.equal(otpDigits(null), '');
    assert.equal(otpDigits(123456), '123456');
  });
});

describe('number-format — parseCanonical (the one gate)', () => {
  it('accepts the canonical form only', () => {
    assert.equal(parseCanonical('0', 0), '0');
    assert.equal(parseCanonical('12990000', 0), '12990000');
    assert.equal(parseCanonical('-5', 0), '-5');
    assert.equal(parseCanonical('12.5', 2), '12.5');
    assert.equal(parseCanonical('12.50', 2), '12.50');
    for (const bad of ['', ' 1', '1 ', '01', '+1', '1.', '.5', '1,5', '1e5', '1.2.3', 'abc', '--1', '0x10', '١٢']) {
      assert.equal(parseCanonical(bad, 2), null, JSON.stringify(bad));
    }
  });

  it('-0 → 0 (also -0.00 → 0.00)', () => {
    assert.equal(parseCanonical('-0', 0), '0');
    assert.equal(parseCanonical('-0.00', 2), '0.00');
  });

  it('more fraction digits than `decimals` → null (no rounding, no cut)', () => {
    assert.equal(parseCanonical('1.5', 0), null);
    assert.equal(parseCanonical('1.234', 2), null);
    assert.equal(parseCanonical('1.23', 2), '1.23');
  });

  it('30 digits max (integer + fraction)', () => {
    const d30 = '1'.repeat(30);
    assert.equal(MAX_DIGITS, 30);
    assert.equal(parseCanonical(d30, 0), d30);
    assert.equal(parseCanonical(`${d30}1`, 0), null);
    assert.equal(parseCanonical(`${'1'.repeat(28)}.12`, 2), `${'1'.repeat(28)}.12`);
    assert.equal(parseCanonical(`${'1'.repeat(29)}.12`, 2), null);
  });

  it('non-strings → null; decimals out of range treated as 0..10', () => {
    assert.equal(parseCanonical(5, 0), null);
    assert.equal(parseCanonical(null, 0), null);
    assert.equal(parseCanonical('1.5', 'x'), null);
  });
});

describe('number-format — format', () => {
  it('groups the integer part by 3 with `group`, `decimal` for the fraction; no rounding / padding', () => {
    assert.equal(format('12990000', VI), '12.990.000');
    assert.equal(format('999', VI), '999');
    assert.equal(format('1000', VI), '1.000');
    assert.equal(format('-1234567', vi({ negative: true })), '-1.234.567');
    assert.equal(format('1234.5', vi({ decimals: 2 })), '1.234,5');
    assert.equal(format('1234.50', vi({ decimals: 2 })), '1.234,50');
    assert.equal(format('1234567.25', { group: ',', decimal: '.', decimals: 2 }), '1,234,567.25');
    assert.equal(format('1234567', { group: ' ', decimal: ',', decimals: 0 }), '1 234 567');
    assert.equal(format('1234567', { group: '', decimal: ',', decimals: 0 }), '1234567');
    assert.equal(format('', VI), '');
  });

  it('25 digits stay exact', () => {
    const v = '1234567890123456789012345';
    assert.equal(format(v, VI), '1.234.567.890.123.456.789.012.345');
  });
});

describe('number-format — edit (normalise after each browser change; caret map)', () => {
  it('typing 12990000 → 12.990.000, caret at the end', () => {
    const r = edit('12990000', 8, VI);
    assert.deepEqual(r, { display: '12.990.000', caret: 10, value: '12990000', bad: false });
  });

  it('typing in the middle of a group: caret stays after the typed digit', () => {
    // "12.990.000", typed "5" after "12.9" → raw "12.9590.000", caret 5
    const r = edit('12.9590.000', 5, VI);
    assert.equal(r.display, '129.590.000');
    assert.equal(r.value, '129590000');
    assert.equal(r.display.slice(0, r.caret), '129.5');
  });

  it('Backspace landing after a group separator via the edit path: caret after the kept digits', () => {
    // "12.990" with the "9" after "." deleted → "12.90", caret 3
    const r = edit('12.90', 3, VI);
    assert.equal(r.display, '1.290');
    assert.equal(r.display.slice(0, r.caret).replace(/\./g, ''), '12');
  });

  it('leading zeros dropped (caret adjusted), one 0 kept before the decimal / when all zero', () => {
    assert.deepEqual(edit('0005', 4, VI), { display: '5', caret: 1, value: '5', bad: false });
    assert.equal(edit('000', 3, VI).display, '0');
    assert.equal(edit('000', 3, VI).value, '0');
    const r = edit('00,5', 4, vi({ decimals: 2 }));
    assert.equal(r.display, '0,5');
    assert.equal(r.value, '0.5');
    assert.equal(r.caret, 3);
  });

  it('"12," keeps the trailing decimal while typing; value 12', () => {
    assert.deepEqual(edit('12,', 3, vi({ decimals: 2 })), { display: '12,', caret: 3, value: '12', bad: false });
  });

  it('only "-" / only "," → empty value + bad', () => {
    assert.deepEqual(edit('-', 1, vi({ negative: true })), { display: '-', caret: 1, value: '', bad: true });
    assert.deepEqual(edit(',', 1, vi({ decimals: 2 })), { display: ',', caret: 1, value: '', bad: true });
  });

  it('a decimal typed first gets a 0 in front', () => {
    const r = edit(',5', 2, vi({ decimals: 2 }));
    assert.equal(r.display, '0,5');
    assert.equal(r.value, '0.5');
    assert.equal(r.caret, 3);
  });

  it('full-width digits are normalised; other characters dropped; group chars re-derived', () => {
    const r = edit('１２a3.4', 6, VI);
    assert.equal(r.display, '1.234');
    assert.equal(r.value, '1234');
    assert.equal(r.caret, 5);
  });

  it('second decimal, minus not at the start / not allowed are dropped', () => {
    assert.equal(edit('1,2,3', 5, vi({ decimals: 2 })).value, '1.23');
    assert.equal(edit('1-2', 3, vi({ negative: true })).value, '12');
    assert.equal(edit('-12', 3, VI).value, '12');
    assert.equal(edit('−12', 3, vi({ negative: true })).value, '-12');
  });

  it('decimals = 0: the decimal separator is dropped', () => {
    assert.equal(edit('12,5', 4, VI).value, '125');
  });

  it('fraction above `decimals` and more than 30 digits are cut (non-cancelable path only)', () => {
    assert.equal(edit('1,2345', 6, vi({ decimals: 2 })).value, '1.23');
    assert.equal(edit('1'.repeat(32), 32, VI).value, '1'.repeat(30));
  });

  it('empty → empty, not 0', () => {
    assert.deepEqual(edit('', 0, VI), { display: '', caret: 0, value: '', bad: false });
  });

  it('-0 → value 0 (display keeps the sign while typing)', () => {
    assert.equal(edit('-0', 2, vi({ negative: true })).value, '0');
  });

  it('group "," / decimal "." configuration', () => {
    const r = edit('1234567.5', 9, { group: ',', decimal: '.', decimals: 2, negative: false });
    assert.equal(r.display, '1,234,567.5');
    assert.equal(r.value, '1234567.5');
  });
});

describe('number-format — parseLoose (paste / autofill: whole value, exact, refuse rather than guess)', () => {
  const T = [
    // [pasted, decimals=0, decimals=2]
    ['1.234.567', '1234567', '1234567'],
    ['1,234,567', '1234567', '1234567'],
    ['1.234,5', null, '1234.5'],
    ['1,234.50', null, '1234.50'],
    ['12 990 000 ₫', '12990000', '12990000'],
    ['1.234', '1234', '1234'],
    ['1,234', '1234', '1234'],
    ['1,5', null, '1.5'],
    ['1.5', null, '1.5'],
    ['1.23.456', null, null],
    ['12abc', null, null],
    ['1e5', null, null],
    ['-1.000', null, null],
    ['１２３', '123', '123'],
  ];
  for (const [text, d0, d2] of T) {
    it(`${JSON.stringify(text)} → d0 ${d0} / d2 ${d2}`, () => {
      assert.equal(parseLoose(text, vi({ decimals: 0 })), d0);
      assert.equal(parseLoose(text, vi({ decimals: 2 })), d2);
    });
  }

  it('decimals = 3: one separator + exactly 3 digits follows the component convention', () => {
    assert.equal(parseLoose('1,234', vi({ decimals: 3 })), '1.234', 'vi: "," is the decimal');
    assert.equal(parseLoose('1.234', vi({ decimals: 3 })), '1234', 'vi: "." is the group');
    const en = { group: ',', decimal: '.', decimals: 3, negative: false };
    assert.equal(parseLoose('1,234', en), '1234');
    assert.equal(parseLoose('1.234', en), '1.234');
  });

  it('group "," / decimal "." component: the same table', () => {
    const en = (d) => ({ group: ',', decimal: '.', decimals: d, negative: false });
    assert.equal(parseLoose('1,234,567', en(0)), '1234567');
    assert.equal(parseLoose('1.234.567', en(0)), '1234567');
    assert.equal(parseLoose('1,234.50', en(2)), '1234.50');
    assert.equal(parseLoose('1.234,5', en(2)), '1234.5');
    assert.equal(parseLoose('1,5', en(2)), '1.5');
    assert.equal(parseLoose('1.234', en(2)), '1234');
  });

  it('units (prefix / suffix, case-insensitive) + the component affixes; NBSP / thin spaces / tabs', () => {
    assert.equal(parseLoose('12.000 VND', VI), '12000');
    assert.equal(parseLoose('12.000vnđ', VI), '12000');
    assert.equal(parseLoose('12.000 đ', VI), '12000');
    assert.equal(parseLoose('$1,200', VI), '1200');
    assert.equal(parseLoose('15 %', VI), '15');
    assert.equal(parseLoose('€ 9', VI), '9');
    assert.equal(parseLoose('12 990 000 ₫\t', VI), '12990000');
    assert.equal(parseLoose('5 kg', vi({ suffix: 'kg' })), '5');
    assert.equal(parseLoose('USD 5', vi({ prefix: 'USD' })), '5');
    assert.equal(parseLoose('5 kg', VI), null);
    assert.equal(parseLoose('₫₫5', VI), null, 'one unit only');
  });

  it('negatives (U+2212 too) only when allowed', () => {
    assert.equal(parseLoose('-1.000', vi({ negative: true })), '-1000');
    assert.equal(parseLoose('−1.000', vi({ negative: true })), '-1000');
    assert.equal(parseLoose('-0', vi({ negative: true })), '0');
  });

  it('invalid grouping / two decimals / too many digits / empty → null', () => {
    assert.equal(parseLoose('1.2345', VI), null);
    assert.equal(parseLoose('12.34.567', VI), null);
    assert.equal(parseLoose('1,234,56', VI), null);
    assert.equal(parseLoose('1.234,5,6', vi({ decimals: 2 })), null);
    assert.equal(parseLoose('1'.repeat(31), VI), null);
    assert.equal(parseLoose('1'.repeat(30), VI), '1'.repeat(30));
    assert.equal(parseLoose('', VI), null);
    assert.equal(parseLoose('₫', VI), null);
    assert.equal(parseLoose('-', vi({ negative: true })), null);
  });

  it('leading zeros are canonicalised', () => {
    assert.equal(parseLoose('007', VI), '7');
    assert.equal(parseLoose('0,50', vi({ decimals: 2 })), '0.50');
  });
});

describe('number-format — arithmetic (BigInt)', () => {
  it('compare', () => {
    assert.equal(compare('1', '2'), -1);
    assert.equal(compare('2', '2.0'), 0);
    assert.equal(compare('-1.5', '-1.25'), -1);
    assert.equal(compare('100000000000000000000000000001', '100000000000000000000000000000'), 1);
  });

  it('clamp (min / max optional)', () => {
    assert.equal(clamp('5', '1000', null), '1000');
    assert.equal(clamp('5000', null, '1000'), '1000');
    assert.equal(clamp('500', '0', '1000'), '500');
    assert.equal(clamp('500', null, null), '500');
  });

  it('stepAligned (base = min or 0)', () => {
    assert.equal(stepAligned('1500', '500', '0'), true);
    assert.equal(stepAligned('1501', '500', '0'), false);
    assert.equal(stepAligned('1.25', '0.25', '0'), true);
    assert.equal(stepAligned('7', '5', '2'), true);
    assert.equal(stepAligned('8', '5', '2'), false);
  });

  it('step: ±n steps, misaligned → snaps to the next aligned value (like native stepUp), clamped, empty → clamp(0)', () => {
    assert.equal(step('10', 1, { step: '1' }), '11');
    assert.equal(step('10', -1, { step: '1' }), '9');
    assert.equal(step('10', 10, { step: '1' }), '20');
    assert.equal(step('1501', 1, { step: '500', base: '0' }), '2000');
    assert.equal(step('1501', -1, { step: '500', base: '0' }), '1500');
    assert.equal(step('8', 1, { step: '5', base: '2', min: '2' }), '12');
    assert.equal(step('8', -1, { step: '5', base: '2', min: '2' }), '7');
    assert.equal(step('995', 1, { step: '10', max: '1000' }), '1000');
    assert.equal(step('1000', 1, { step: '1', max: '1000' }), '1000');
    assert.equal(step('0', -1, { step: '1', min: '0' }), '0');
    assert.equal(step('', 1, { step: '1', min: '1000' }), '1000');
    assert.equal(step('', -1, { step: '1' }), '0');
    assert.equal(step('1.25', 1, { step: '0.25' }), '1.5');
    assert.equal(step('-0.5', 1, { step: '1' }), '0');
  });

  it('exact above 2^53', () => {
    assert.equal(step('9007199254740993', 1, { step: '1' }), '9007199254740994');
    assert.equal(step('123456789012345678901234567890', -1, { step: '1' }), '123456789012345678901234567889');
  });
});

describe('number-format — fromNumberString (native type=number value → canonical, SSR adoption)', () => {
  it('valid floating-point numbers, exact', () => {
    assert.equal(fromNumberString('12990000'), '12990000');
    assert.equal(fromNumberString('1.50'), '1.50');
    assert.equal(fromNumberString('.5'), '0.5');
    assert.equal(fromNumberString('-0'), '0');
    assert.equal(fromNumberString('1e3'), '1000');
    assert.equal(fromNumberString('1.5E-2'), '0.015');
    assert.equal(fromNumberString('007'), '7');
    assert.equal(fromNumberString('123456789012345678901234567890'), '123456789012345678901234567890');
  });

  it('anything else / too many digits → null', () => {
    for (const bad of ['', 'abc', '1.2.3', '-', '.', 'e5', '1,5', '1'.repeat(31)]) assert.equal(fromNumberString(bad), null, bad);
  });
});
