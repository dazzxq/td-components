import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhrase, phraseMatches, preparePhrase, PHRASE_MAX } from './confirm-phrase.js';

// v0.44.0 (plan v0.44.0-confirm-dirty QĐ 1 / 4): the type-to-confirm phrase rules — pure, node-tested.
describe('confirm-phrase (v0.44.0 QĐ 4)', () => {
  it('NFD and NFC spellings of the same word match', () => {
    const nfd = 'XÓA'; // O + combining acute (macOS / some IMEs)
    const nfc = 'XÓA';
    assert.notEqual(nfd, nfc);
    assert.equal(normalizePhrase(nfd), nfc);
    assert.ok(phraseMatches(nfd, nfc));
  });

  it('trims and collapses any Unicode whitespace run (incl. NBSP) to one space', () => {
    assert.ok(phraseMatches(' XOA ', 'XOA'));
    assert.ok(phraseMatches(' XOA\t\n', 'XOA'));
    assert.ok(phraseMatches('XOA  TAT CA', 'XOA TAT CA'));
    assert.equal(normalizePhrase('a    b'), 'a b');
    assert.ok(!phraseMatches('X OA', 'XOA')); // an inner space is not ignored
    assert.ok(phraseMatches('X  OA', 'X OA'));
  });

  it('is case-sensitive and accent-sensitive', () => {
    assert.ok(!phraseMatches('xoa', 'XOA'));
    assert.ok(!phraseMatches('Xoa', 'XOA'));
    assert.ok(!phraseMatches('XOA', 'XÓA'));
    assert.ok(!phraseMatches('XÓA', 'XOA'));
  });

  it('empty / non-string input normalises to "" and never matches', () => {
    assert.equal(normalizePhrase(''), '');
    assert.equal(normalizePhrase('   '), '');
    assert.equal(normalizePhrase(null), '');
    assert.equal(normalizePhrase(undefined), '');
    assert.equal(normalizePhrase(42), '');
    assert.equal(normalizePhrase({ toString: () => 'XOA' }), '');
    assert.ok(!phraseMatches('', ''));
    assert.ok(!phraseMatches('XOA', ''));
    assert.ok(!phraseMatches(null, 'XOA'));
  });

  it('preparePhrase: invalid → null; > 100 code points → cut on a code point boundary + truncated flag', () => {
    assert.equal(PHRASE_MAX, 100);
    assert.equal(preparePhrase(' '), null);
    assert.equal(preparePhrase(7), null);
    assert.deepEqual(preparePhrase(' XOA '), { phrase: 'XOA', truncated: false });
    const long = 'A'.repeat(99) + '😀😀';
    const r = preparePhrase(long);
    assert.equal(r.truncated, true);
    assert.equal([...r.phrase].length, 100);
    assert.ok(r.phrase.endsWith('😀'));
    assert.ok(!/[\ud800-\udbff]$/.test(r.phrase)); // no lone high surrogate
    assert.deepEqual(preparePhrase('B'.repeat(100)), { phrase: 'B'.repeat(100), truncated: false });
  });
});
