import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keyId, KeySelection } from './key-selection.js';

// v0.37.0 (plan docs/internal/plans/v0.37.0-table-row-selection.md QĐ 3–4, 10–11, 13, 15): the pure selection model of
// td-table row selection. Two tiers: USER (userToggle / userRange / userPage — the `max` cap applies) and API
// (replace / add / remove / clear — never reads `max`).
const all = () => true;

describe('keyId — identity of a row key (QĐ 3)', () => {
  it('valid: non-empty string, finite number, bigint → String(key)', () => {
    assert.equal(keyId('a'), 'a');
    assert.equal(keyId(1), '1');
    assert.equal(keyId(0), '0');
    assert.equal(keyId(-0), '0');
    assert.equal(keyId(12345678901234567890n), '12345678901234567890');
    assert.equal(keyId(' x '), ' x ');
  });

  it('invalid → null (empty string, NaN, Infinity, null, undefined, object, boolean, symbol, function)', () => {
    for (const k of ['', NaN, Infinity, -Infinity, null, undefined, {}, [], true, Symbol('s'), () => 1]) {
      assert.equal(keyId(k), null, String(typeof k));
    }
  });
});

describe('KeySelection — identity + order', () => {
  it('1 and "1" are ONE row; the first-seen original is returned (type kept)', () => {
    const s = new KeySelection();
    s.add([1]);
    assert.equal(s.has('1'), true);
    assert.deepEqual(s.add(['1']), { added: [], removed: [] });
    assert.deepEqual(s.keys(), [1]);
    assert.equal(typeof s.keys()[0], 'number');
    s.add([7n]);
    assert.deepEqual(s.keys(), [1, 7n]);
    assert.equal(s.has(7), true);
  });

  it('invalid keys are dropped, duplicates collapse, insertion order kept', () => {
    const s = new KeySelection();
    const r = s.replace(['b', null, 'a', '', 'b', NaN, {}, 3]);
    assert.deepEqual(r, { added: ['b', 'a', 3], removed: [] });
    assert.deepEqual(s.keys(), ['b', 'a', 3]);
    assert.deepEqual(s.ids(), ['b', 'a', '3']);
    assert.equal(s.size, 3);
  });

  it('replace reports added and removed; remove / clear', () => {
    const s = new KeySelection();
    s.replace(['a', 'b', 'c']);
    assert.deepEqual(s.replace(['c', 'd']), { added: ['d'], removed: ['a', 'b'] });
    assert.deepEqual(s.remove(['c', 'zzz']), { added: [], removed: ['c'] });
    assert.deepEqual(s.clear(), { added: [], removed: ['d'] });
    assert.deepEqual(s.clear(), { added: [], removed: [] });
  });

  it('exclusive (single): replace / add keep only the LAST valid key', () => {
    const s = new KeySelection({ exclusive: true });
    s.replace(['a', 'b', null]);
    assert.deepEqual(s.keys(), ['b']);
    assert.deepEqual(s.add(['c', 'd']), { added: ['d'], removed: ['b'] });
    assert.deepEqual(s.keys(), ['d']);
    assert.deepEqual(s.add(['d']), { added: [], removed: [] });
  });

  it('setExclusive(true) keeps the last selected key', () => {
    const s = new KeySelection();
    s.replace(['a', 'b', 'c']);
    assert.deepEqual(s.setExclusive(true), { added: [], removed: ['a', 'b'] });
    assert.deepEqual(s.keys(), ['c']);
  });
});

describe('KeySelection — user tier: toggle (QĐ 10, 15)', () => {
  it('multiple: on / off, insertion order', () => {
    const s = new KeySelection();
    assert.deepEqual(s.userToggle('a'), { added: ['a'], removed: [], limited: false });
    s.userToggle('b');
    assert.deepEqual(s.userToggle('a'), { added: [], removed: ['a'], limited: false });
    assert.deepEqual(s.keys(), ['b']);
  });

  it('exclusive: selecting B drops A in the SAME change; toggling the selected one clears (0 rows)', () => {
    const s = new KeySelection({ exclusive: true, max: 1 });
    s.userToggle('a');
    assert.deepEqual(s.userToggle('b'), { added: ['b'], removed: ['a'], limited: false });
    assert.deepEqual(s.userToggle('b'), { added: [], removed: ['b'], limited: false });
    assert.equal(s.size, 0);
  });

  it('exclusive ignores max', () => {
    const s = new KeySelection({ exclusive: true, max: 0 });
    assert.deepEqual(s.userToggle('a').added, ['a']);
  });

  it('max: add past the cap → unchanged + limited; removing still works', () => {
    const s = new KeySelection({ max: 2 });
    s.userToggle('a');
    s.userToggle('b');
    assert.deepEqual(s.userToggle('c'), { added: [], removed: [], limited: true });
    assert.deepEqual(s.userToggle('a'), { added: [], removed: ['a'], limited: false });
    assert.deepEqual(s.userToggle('c').added, ['c']);
  });

  it('invalid key → no change', () => {
    const s = new KeySelection();
    assert.deepEqual(s.userToggle(null), { added: [], removed: [], limited: false });
  });
});

describe('KeySelection — API tier ignores max (QĐ 15, review R1-2)', () => {
  it('replace / add 5 keys with max 3 keep all 5, no `limited`; user adds are then blocked until under the cap', () => {
    const s = new KeySelection({ max: 3 });
    const r = s.replace([1, 2, 3, 4, 5]);
    assert.deepEqual(r, { added: [1, 2, 3, 4, 5], removed: [] });
    assert.equal('limited' in r, false);
    assert.equal(s.size, 5);
    assert.deepEqual(s.add([6]), { added: [6], removed: [] });
    assert.equal(s.size, 6);
    assert.deepEqual(s.userToggle(7), { added: [], removed: [], limited: true });
    s.userToggle(1); s.userToggle(2); s.userToggle(3); s.userToggle(4);
    assert.equal(s.size, 2);
    assert.deepEqual(s.userToggle(7), { added: [7], removed: [], limited: false });
    assert.deepEqual(s.userToggle(8), { added: [], removed: [], limited: true });
  });
});

describe('KeySelection — user tier: Shift range (QĐ 11)', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('target becomes selected → the whole range anchor..target is selected (page order), locked rows skipped', () => {
    const s = new KeySelection();
    s.userToggle('a');
    const locked = (k) => k !== 'c';
    assert.deepEqual(s.userRange(order, 'a', 'e', locked), { added: ['b', 'd', 'e'], removed: [], limited: false });
    assert.equal(s.has('c'), false);
  });

  it('backwards range uses page order between the two', () => {
    const s = new KeySelection();
    s.userToggle('d');
    assert.deepEqual(s.userRange(order, 'd', 'b', all).added, ['c', 'b']);
  });

  it('target is selected → its new state is OFF → the range is deselected (Gmail style)', () => {
    const s = new KeySelection();
    s.replace(['a', 'b', 'c', 'd']);
    assert.deepEqual(s.userRange(order, 'b', 'd', all), { added: [], removed: ['b', 'c', 'd'], limited: false });
    assert.deepEqual(s.keys(), ['a']);
  });

  it('anchor not on the page (or null) → a single toggle of the target', () => {
    const s = new KeySelection();
    assert.deepEqual(s.userRange(order, 'zz', 'c', all).added, ['c']);
    assert.deepEqual(s.userRange(order, null, 'd', all).added, ['d']);
  });

  it('max: stops at the cap, limited true', () => {
    const s = new KeySelection({ max: 3 });
    s.userToggle('a');
    assert.deepEqual(s.userRange(order, 'a', 'e', all), { added: ['b', 'c'], removed: [], limited: true });
  });

  it('already at / over the cap (API) → nothing added, limited', () => {
    const s = new KeySelection({ max: 2 });
    s.replace(['x', 'y', 'a']);
    assert.deepEqual(s.userRange(order, 'a', 'c', all), { added: [], removed: [], limited: true });
  });

  it('a locked target → no change', () => {
    const s = new KeySelection();
    s.userToggle('a');
    assert.deepEqual(s.userRange(order, 'a', 'c', (k) => k !== 'c'), { added: [], removed: [], limited: false });
  });
});

describe('KeySelection — header state + user page (QĐ 13–15)', () => {
  const page = ['a', 'b', 'c', null];
  it('headerState: disabled / none / some / all; locked and invalid rows do not count', () => {
    const s = new KeySelection();
    assert.equal(s.headerState([], all), 'disabled');
    assert.equal(s.headerState(['a', 'b'], () => false), 'disabled');
    assert.equal(s.headerState(page, all), 'none');
    s.userToggle('a');
    assert.equal(s.headerState(page, all), 'some');
    s.userToggle('b'); s.userToggle('c');
    assert.equal(s.headerState(page, all), 'all');
    const s2 = new KeySelection();
    s2.replace(['c']); // c is locked but selected (API)
    assert.equal(s2.headerState(page, (k) => k !== 'c'), 'none');
    s2.add(['a', 'b']);
    assert.equal(s2.headerState(page, (k) => k !== 'c'), 'all');
  });

  it('userPage: none/some → select every enabled row of the page (page order); keys of other pages untouched', () => {
    const s = new KeySelection();
    s.replace(['other', 'b']);
    assert.deepEqual(s.userPage(page, (k) => k !== 'c'), { added: ['a'], removed: [], limited: false });
    assert.deepEqual(s.keys(), ['other', 'b', 'a']);
  });

  it('userPage: all → deselect the enabled rows of the page only', () => {
    const s = new KeySelection();
    s.replace(['other', 'a', 'b', 'c']);
    assert.deepEqual(s.userPage(page, (k) => k !== 'c'), { added: [], removed: ['a', 'b'], limited: false });
    assert.deepEqual(s.keys(), ['other', 'c']);
  });

  it('userPage with max: stops at the cap', () => {
    const s = new KeySelection({ max: 3 });
    assert.deepEqual(s.userPage(['a', 'b', 'c', 'd', 'e'], all), { added: ['a', 'b', 'c'], removed: [], limited: true });
  });

  it('userPage on a disabled page → no change', () => {
    const s = new KeySelection();
    assert.deepEqual(s.userPage([], all), { added: [], removed: [], limited: false });
  });

  it('original of a key is the first one seen while selected', () => {
    const s = new KeySelection();
    s.userPage([1, 2], all);
    s.userToggle('2');
    s.userToggle('2');
    assert.deepEqual(s.keys(), [1, '2']);
  });
});
