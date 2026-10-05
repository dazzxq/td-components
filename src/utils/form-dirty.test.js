import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotOf, sameSnapshot } from './form-dirty.js';

// v0.44.0 (plan v0.44.0-confirm-dirty QĐ 19): the snapshot is an ORDERED list of [name, value]; strings compare verbatim,
// File-like objects by identity (two files with the same metadata are different).
class FakeFile { constructor(name, size) { this.name = name; this.size = size; this.type = 'image/png'; this.lastModified = 1; } }

describe('form-dirty snapshot (v0.44.0 QĐ 19)', () => {
  it('keeps order and repeated names; equal lists are the same', () => {
    const a = snapshotOf([['title', 'A'], ['tags[]', 'x'], ['tags[]', 'y']]);
    assert.deepEqual(a, [['title', 'A'], ['tags[]', 'x'], ['tags[]', 'y']]);
    assert.ok(sameSnapshot(a, snapshotOf([['title', 'A'], ['tags[]', 'x'], ['tags[]', 'y']])));
    assert.ok(!sameSnapshot(a, snapshotOf([['title', 'A'], ['tags[]', 'y'], ['tags[]', 'x']]))); // reorder = change
    assert.ok(!sameSnapshot(a, snapshotOf([['title', 'A'], ['tags[]', 'x']]))); // removed entry
    assert.ok(!sameSnapshot(a, snapshotOf([['title', 'A '], ['tags[]', 'x'], ['tags[]', 'y']]))); // no trim
  });

  it('files compare by identity, not metadata', () => {
    const f1 = new FakeFile('a.png', 10);
    const f2 = new FakeFile('a.png', 10); // same name / size / type / lastModified, different file
    assert.ok(sameSnapshot(snapshotOf([['img', f1]]), snapshotOf([['img', f1]])));
    assert.ok(!sameSnapshot(snapshotOf([['img', f1]]), snapshotOf([['img', f2]])));
    assert.ok(!sameSnapshot(snapshotOf([['img', f1]]), snapshotOf([['img', 'a.png']])));
  });

  it('ignore: array of names or a predicate', () => {
    const entries = [['_token', 'abc'], ['q', 'search'], ['title', 'A']];
    assert.deepEqual(snapshotOf(entries, ['_token', 'q']), [['title', 'A']]);
    assert.deepEqual(snapshotOf(entries, (n) => n.startsWith('_')), [['q', 'search'], ['title', 'A']]);
    assert.deepEqual(snapshotOf(entries, null), entries);
    // a throwing predicate never drops a field silently → the entry is kept
    assert.equal(snapshotOf(entries, () => { throw new Error('x'); }).length, 3);
  });

  it('accepts any iterable of entries (FormData-like) and tolerates bad input', () => {
    const map = new Map([['a', '1'], ['b', '2']]);
    assert.deepEqual(snapshotOf(map), [['a', '1'], ['b', '2']]);
    assert.deepEqual(snapshotOf(null), []);
    assert.ok(sameSnapshot([], []));
    assert.ok(!sameSnapshot([], null));
  });
});
