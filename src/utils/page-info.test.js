import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageRange, hookText } from './page-info.js';

// v0.57.2: the pure parts of the pagination info text — the shown range and the per-instance text hook
// (td-pagination `formatInfo`, td-table `formatPageInfo`): its result is TEXT; a non-string or a throw → null (= the
// caller's default text) + one warning through `warn`.
describe('pageRange — the 1-based range of a page', () => {
  it('first / middle / last page; an empty list is 0-0', () => {
    assert.deepEqual(pageRange(23, 10, 1), { from: 1, to: 10 });
    assert.deepEqual(pageRange(23, 10, 2), { from: 11, to: 20 });
    assert.deepEqual(pageRange(23, 10, 3), { from: 21, to: 23 });
    assert.deepEqual(pageRange(0, 10, 1), { from: 0, to: 0 });
  });
});

describe('hookText — the text of a per-instance hook', () => {
  const warns = [];
  const warn = (m) => warns.push(m);
  it('a string is returned as it is (also empty, also markup-looking — the caller writes it as text)', () => {
    warns.length = 0;
    assert.equal(hookText(() => '3 nhóm · 6 dòng', {}, warn, 'x'), '3 nhóm · 6 dòng');
    assert.equal(hookText(() => '', {}, warn, 'x'), '');
    assert.equal(hookText(() => '<b>x</b>', {}, warn, 'x'), '<b>x</b>');
    assert.equal(warns.length, 0);
  });
  it('the hook receives the context', () => {
    let got = null;
    hookText((c) => { got = c; return 'a'; }, { rows: 6 }, warn, 'x');
    assert.deepEqual(got, { rows: 6 });
  });
  it('a non-string (number, null, undefined, object) → null + a warning naming the hook', () => {
    for (const v of [6, null, undefined, { toString: () => 'x' }]) {
      warns.length = 0;
      assert.equal(hookText(() => v, {}, warn, 'td-table: formatPageInfo'), null);
      assert.equal(warns.length, 1);
      assert.match(warns[0], /td-table: formatPageInfo/);
    }
  });
  it('a throw → null + a warning (never rethrown)', () => {
    warns.length = 0;
    assert.equal(hookText(() => { throw new Error('boom'); }, {}, warn, 'td-pagination: formatInfo'), null);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /td-pagination: formatInfo/);
  });
  it('no hook → null, no warning', () => {
    warns.length = 0;
    assert.equal(hookText(null, {}, warn, 'x'), null);
    assert.equal(warns.length, 0);
  });
});
