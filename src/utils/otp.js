/**
 * One-time-code rules shared by <td-otp-input> (src/form/td-otp-input.js) and php/td.php `td_otp_input()` /
 * `td__otp_value()` (v0.36.0, plan v0.36.0-polish QĐ 42–47). Pure — node-tested (src/utils/otp.test.js) and checked for
 * PHP parity through OTP_CASES (test/php/td-ssr-otp.test.js).
 *
 * - length: integer 1…10, default 6. Anything else → 6 (never clamped: clamping 12 → 10 would make a wrong code
 *   silently); the caller warns.
 * - charset: `numeric` (default) | `alphanumeric` | `alpha`. case: `upper` (default) | `lower` | `preserve` (letters only).
 * - Per character: a digit (ASCII, full-width, Arabic-Indic, extended Arabic-Indic — `asciiDigit()`) → ASCII when the
 *   charset takes digits; a letter: NFKC of that one character (full-width Ａ → A) must be exactly one [A-Za-z], then the
 *   case is applied; everything else (spaces, `-`, Vietnamese `â`, emoji…) is dropped.
 */
import { asciiDigit } from './number-format.js';

export const OTP_DEFAULT_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;
export const OTP_CHARSETS = Object.freeze(['numeric', 'alphanumeric', 'alpha']);
export const OTP_TEXT_CASES = Object.freeze(['upper', 'lower', 'preserve']);

/**
 * @param {unknown} raw attribute / option value (null / undefined = not set)
 * @returns {{ length: number, valid: boolean }} valid = false when a value was given and rejected (→ 6)
 */
export function otpLength(raw) {
  if (raw == null) return { length: OTP_DEFAULT_LENGTH, valid: true };
  const s = typeof raw === 'number' ? raw : String(raw).trim();
  const n = typeof s === 'number' ? s : (/^[0-9]+$/.test(s) ? Number(s) : NaN);
  if (Number.isInteger(n) && n >= 1 && n <= OTP_MAX_LENGTH) return { length: n, valid: true };
  return { length: OTP_DEFAULT_LENGTH, valid: false };
}

/**
 * @param {unknown} raw
 * @returns {{ charset: string, valid: boolean }}
 */
export function otpCharset(raw) {
  if (raw == null || raw === '') return { charset: 'numeric', valid: raw == null };
  return OTP_CHARSETS.includes(/** @type {string} */ (raw)) ? { charset: String(raw), valid: true } : { charset: 'numeric', valid: false };
}

/**
 * @param {unknown} raw
 * @returns {{ textCase: string, valid: boolean }}
 */
export function otpCase(raw) {
  if (raw == null || raw === '') return { textCase: 'upper', valid: raw == null };
  return OTP_TEXT_CASES.includes(/** @type {string} */ (raw)) ? { textCase: String(raw), valid: true } : { textCase: 'upper', valid: false };
}

/**
 * One character as the field keeps it ('' = dropped).
 * @param {string} ch one code point
 * @param {string} charset
 * @param {string} textCase
 * @returns {string}
 */
export function otpChar(ch, charset, textCase) {
  const d = asciiDigit(ch);
  if (d !== null) return charset === 'alpha' ? '' : d;
  if (charset === 'numeric') return '';
  const n = ch.normalize('NFKC');
  if (!/^[A-Za-z]$/.test(n)) return '';
  if (textCase === 'lower') return n.toLowerCase();
  if (textCase === 'preserve') return n;
  return n.toUpperCase();
}

/**
 * Every kept character of `raw` (NOT truncated — the caller decides; typing inside a full code overwrites).
 * @param {unknown} raw
 * @param {{ charset?: string, case?: string }} [o]
 * @returns {string}
 */
/** SEC-01 (v0.36.0 review): input longer than this many UTF-8 bytes is rejected (treated as empty) — same as PHP. */
export const OTP_MAX_INPUT_BYTES = 256;

/** @param {string} s @returns {boolean} more than OTP_MAX_INPUT_BYTES UTF-8 bytes (cheap: no encoding of long strings) */
function tooLong(s) {
  if (s.length > OTP_MAX_INPUT_BYTES) return true; // ≥ 1 byte per UTF-16 unit
  let bytes = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes > OTP_MAX_INPUT_BYTES) return true;
  }
  return false;
}

export function otpFilter(raw, o = {}) {
  const charset = o.charset || 'numeric';
  const textCase = o.case || 'upper';
  const str = String(raw ?? '');
  if (tooLong(str)) return ''; // SEC-01: never walk a huge paste
  let out = '';
  for (const ch of str) out += otpChar(ch, charset, textCase);
  return out;
}

/**
 * The value as the field keeps it: filtered + at most `length` characters.
 * @param {unknown} raw
 * @param {{ length?: number, charset?: string, case?: string }} [o]
 * @returns {string}
 */
export function otpNormalize(raw, o = {}) {
  return otpFilter(raw, o).slice(0, o.length || OTP_DEFAULT_LENGTH);
}

/**
 * Native `pattern` of the no-JS field (the native pattern accepts lower case too — the server normalises the case).
 * @param {string} charset
 * @param {number} length
 * @returns {string}
 */
export function otpPattern(charset, length) {
  const cls = charset === 'alphanumeric' ? '[A-Za-z0-9]' : charset === 'alpha' ? '[A-Za-z]' : '[0-9]';
  return `${cls}{${length}}`;
}

/** Character class test of one cell's text (SSR agreement). */
export function otpCellOk(text, charset) {
  if (text === '') return true;
  if (charset === 'alphanumeric') return /^[A-Za-z0-9]$/.test(text);
  if (charset === 'alpha') return /^[A-Za-z]$/.test(text);
  return /^[0-9]$/.test(text);
}

/**
 * Input attributes per charset, in markup order (after type / class / id): numeric → inputmode numeric; letters →
 * inputmode text, autocapitalize (characters for upper, none otherwise — not 'off': Linux Firefox reports the canonical 'none'), autocorrect off, spellcheck false; always
 * autocomplete one-time-code. Same order in php/td.php.
 * @param {string} charset
 * @param {string} textCase
 * @returns {Array<[string, string]>}
 */
export function otpInputAttrs(charset, textCase) {
  if (charset === 'numeric') return [['inputmode', 'numeric'], ['autocomplete', 'one-time-code']];
  return [['inputmode', 'text'], ['autocomplete', 'one-time-code'], ['autocapitalize', textCase === 'upper' ? 'characters' : 'none'],
    ['autocorrect', 'off'], ['spellcheck', 'false']];
}

/**
 * PHP parity table: [raw, { charset, case, length }, expected otpNormalize()]. Only characters whose NFKC folding php
 * `Normalizer` (intl) and its no-intl fallback agree on (ASCII, full-width, Arabic-Indic, dropped symbols).
 */
export const OTP_CASES = Object.freeze([
  ['123456', { charset: 'numeric' }, '123456'],
  ['１２3-45６789', { charset: 'numeric' }, '123456'],
  ['٤٥٦ ۷۸', { charset: 'numeric' }, '45678'],
  ['12 34', { charset: 'numeric' }, '1234'],
  ['abc', { charset: 'numeric' }, ''],
  ['0000000', { charset: 'numeric' }, '000000'],
  ['12345678901', { charset: 'numeric', length: 10 }, '1234567890'],
  ['1', { charset: 'numeric', length: 1 }, '1'],
  ['ab-12 34', { charset: 'alphanumeric' }, 'AB1234'],
  ['ab-12 34', { charset: 'alphanumeric', case: 'lower' }, 'ab1234'],
  ['aB-12 34', { charset: 'alphanumeric', case: 'preserve' }, 'aB1234'],
  ['Ａｂ１２', { charset: 'alphanumeric' }, 'AB12'],
  ['Ａｂ１２', { charset: 'alphanumeric', case: 'preserve' }, 'Ab12'],
  ['xâyđz', { charset: 'alphanumeric' }, 'XYZ'],
  ['a😀b🙂c', { charset: 'alphanumeric' }, 'ABC'],
  ['wm-x7q', { charset: 'alphanumeric', length: 5 }, 'WMX7Q'],
  ['٣ab', { charset: 'alphanumeric' }, '3AB'],
  ['ab12cd', { charset: 'alpha' }, 'ABCD'],
  ['ｑｗｅ', { charset: 'alpha', case: 'lower' }, 'qwe'],
  ['ABCDEFGHIJKL', { charset: 'alpha', length: 8 }, 'ABCDEFGH'],
  ['  ', { charset: 'alpha' }, ''],
  ['<script>', { charset: 'alpha' }, 'SCRIPT'],
]);

/** Length parity: [raw, expected length, valid]. */
export const OTP_LENGTH_CASES = Object.freeze([
  [null, 6, true], ['6', 6, true], ['8', 8, true], [' 4 ', 4, true], ['1', 1, true], ['10', 10, true], [8, 8, true],
  ['0', 6, false], ['11', 6, false], ['abc', 6, false], ['8.5', 6, false], ['-3', 6, false], ['', 6, false], ['1e1', 6, false],
]);
