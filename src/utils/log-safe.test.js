// v0.59.0 (Codex security r1 / r2: CWE-117, CWE-400) — src/utils/log-safe.js, the console-safe text of td-repeater and
// td-action-button warnings: escaping (controls, line / paragraph separators, bidi controls, quote, backslash), the cut to
// 64 code points, and a bounded, fast result for a huge value (the value is never copied whole).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logSafe, logLength, LOG_TEXT_MAX } from './log-safe.js';

describe('log-safe', () => {
  it('escapes C0 / DEL / C1, U+2028 / U+2029 as \\uXXXX; " and \\ with a backslash', () => {
    assert.equal(logSafe('a\nb\r\tc'), 'a\\u000ab\\u000d\\u0009c');
    assert.equal(logSafe('x\u007f\u0085\u009f'), 'x\\u007f\\u0085\\u009f');
    assert.equal(logSafe('p q r'), 'p\\u2028q\\u2029r');
    assert.equal(logSafe('say "hi" \\ bye'), 'say \\"hi\\" \\\\ bye');
  });

  it('escapes the bidi controls (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069)', () => {
    const bidi = ['؜', '‎', '‏', '‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'];
    for (const c of bidi) assert.equal(logSafe(`a${c}b`), `a\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}b`, c.charCodeAt(0).toString(16));
    assert.doesNotMatch(logSafe(bidi.join('')), /[؜‎‏‪-‮⁦-⁩]/);
  });

  it('keeps ordinary text (Vietnamese, emoji) and cuts to 64 code points (never a lone surrogate)', () => {
    assert.equal(logSafe('giá-đỏ'), 'giá-đỏ');
    assert.equal(logSafe('x'.repeat(100)), 'x'.repeat(LOG_TEXT_MAX));
    const emoji = '\u{1F600}'.repeat(70);
    assert.equal(logSafe(emoji), '\u{1F600}'.repeat(64));
    assert.equal(logSafe('ab', 1), 'a');
    assert.equal(logLength('x\u{1F600}'), 3); // UTF-16 code units
    assert.equal(logSafe(null), 'null');
  });

  it('a 5 MB value: bounded output, fast (the value is never copied whole)', () => {
    const huge = `${'‮'}${'y'.repeat(5 * 1024 * 1024)}`;
    const t0 = process.hrtime.bigint();
    const out = logSafe(huge);
    const len = logLength(huge);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(out, `\\u202e${'y'.repeat(63)}`);
    assert.equal(len, 5 * 1024 * 1024 + 1);
    assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
  });
});
