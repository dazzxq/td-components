import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, nextTypeaheadIndex } from './typeahead.js';

test('fold removes case and Vietnamese diacritics (incl. đ)', () => {
  assert.equal(fold('Hà Nội'), 'ha noi');
  assert.equal(fold('Đà Nẵng'), 'da nang');
  assert.equal(fold(null), '');
});

test('nextTypeaheadIndex: prefix, repeated char cycling, wrap, non-matchable entries', () => {
  const labels = [null, 'Hà Nội', 'Hải Phòng', 'Huế', 'Cần Thơ'];
  assert.equal(nextTypeaheadIndex(labels, -1, 'h'), 1);
  assert.equal(nextTypeaheadIndex(labels, 1, 'h'), 2);          // first keystroke moves past the active item
  assert.equal(nextTypeaheadIndex(labels, 2, 'hh'), 3);         // repeated char cycles
  assert.equal(nextTypeaheadIndex(labels, 3, 'hhh'), 1);        // wraps, skips null
  assert.equal(nextTypeaheadIndex(labels, 1, 'hai'), 2);        // longer prefix starts AT the active item
  assert.equal(nextTypeaheadIndex(labels, 2, 'hai'), 2);
  assert.equal(nextTypeaheadIndex(labels, 0, 'can'), 4);
  assert.equal(nextTypeaheadIndex(labels, 0, 'x'), -1);
  assert.equal(nextTypeaheadIndex([], -1, 'a'), -1);
  assert.equal(nextTypeaheadIndex(labels, -1, ''), -1);
});
