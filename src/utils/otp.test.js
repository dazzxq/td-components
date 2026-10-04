// v0.36.0 (plan v0.36.0-polish QĐ 42–47) — OTP rules (pure). The same tables run against php/td.php in
// test/php/td-ssr-otp.test.js (parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  otpLength, otpCharset, otpCase, otpChar, otpFilter, otpNormalize, otpPattern, otpCellOk, otpInputAttrs, OTP_CASES,
  OTP_LENGTH_CASES, OTP_CHARSETS, OTP_TEXT_CASES,
} from './otp.js';

test('OTP_CASES: otpNormalize per charset × case (full-width, Arabic-Indic, spaces, -, â, emoji, longer than N)', () => {
  for (const [raw, o, want] of OTP_CASES) assert.equal(otpNormalize(raw, o), want, `${raw} ${JSON.stringify(o)}`);
});

test('length: integer 1…10, anything else → 6 + invalid (never clamped)', () => {
  for (const [raw, len, valid] of OTP_LENGTH_CASES) assert.deepEqual(otpLength(raw), { length: len, valid }, String(raw));
  assert.deepEqual(otpLength(undefined), { length: 6, valid: true });
  assert.deepEqual(otpLength(3.5), { length: 6, valid: false });
});

test('charset / case: listed values, default numeric / upper; an unknown or empty value is invalid', () => {
  assert.deepEqual(OTP_CHARSETS, ['numeric', 'alphanumeric', 'alpha']);
  assert.deepEqual(OTP_TEXT_CASES, ['upper', 'lower', 'preserve']);
  assert.deepEqual(otpCharset(null), { charset: 'numeric', valid: true });
  assert.deepEqual(otpCharset('alpha'), { charset: 'alpha', valid: true });
  assert.deepEqual(otpCharset('hex'), { charset: 'numeric', valid: false });
  assert.deepEqual(otpCharset(''), { charset: 'numeric', valid: false });
  assert.deepEqual(otpCase(undefined), { textCase: 'upper', valid: true });
  assert.deepEqual(otpCase('lower'), { textCase: 'lower', valid: true });
  assert.deepEqual(otpCase('UPPER'), { textCase: 'upper', valid: false });
});

test('otpChar: NFKC only folds single letters; ligatures / accents / symbols dropped', () => {
  assert.equal(otpChar('Ｑ', 'alpha', 'upper'), 'Q');
  assert.equal(otpChar('ﬁ', 'alpha', 'upper'), ''); // NFKC → "fi" (two letters) → dropped
  assert.equal(otpChar('é', 'alphanumeric', 'upper'), '');
  assert.equal(otpChar('ß', 'alpha', 'upper'), '');
  assert.equal(otpChar('7', 'alpha', 'upper'), '');
  assert.equal(otpChar('a', 'numeric', 'upper'), '');
  assert.equal(otpChar('٧', 'numeric', 'upper'), '7');
  // decomposed "â" = a + U+0302: the base letter is kept, the combining mark dropped
  assert.equal(otpFilter('âb', { charset: 'alpha' }), 'AB');
});

test('otpFilter does not truncate; otpNormalize does', () => {
  assert.equal(otpFilter('1234567', {}), '1234567');
  assert.equal(otpNormalize('1234567', {}), '123456');
  assert.equal(otpNormalize('1234567', { length: 4 }), '1234');
});

test('numeric filter = the v0.27 otpDigits rule (not truncated)', () => {
  assert.equal(otpFilter('１２3-45６789', { charset: 'numeric' }), '123456789');
  assert.equal(otpFilter(null, { charset: 'numeric' }), '');
});

test('pattern / cell text / input attributes per charset', () => {
  assert.equal(otpPattern('numeric', 6), '[0-9]{6}');
  assert.equal(otpPattern('alphanumeric', 5), '[A-Za-z0-9]{5}');
  assert.equal(otpPattern('alpha', 10), '[A-Za-z]{10}');
  assert.equal(otpCellOk('', 'numeric'), true);
  assert.equal(otpCellOk('7', 'numeric'), true);
  assert.equal(otpCellOk('A', 'numeric'), false);
  assert.equal(otpCellOk('A', 'alphanumeric'), true);
  assert.equal(otpCellOk('7', 'alpha'), false);
  assert.equal(otpCellOk('AB', 'alpha'), false);
  assert.deepEqual(otpInputAttrs('numeric', 'upper'), [['inputmode', 'numeric'], ['autocomplete', 'one-time-code']]);
  assert.deepEqual(otpInputAttrs('alphanumeric', 'upper'), [['inputmode', 'text'], ['autocomplete', 'one-time-code'],
    ['autocapitalize', 'characters'], ['autocorrect', 'off'], ['spellcheck', 'false']]);
  assert.equal(otpInputAttrs('alpha', 'lower')[2][1], 'none');
});
