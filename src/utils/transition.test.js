import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { transitionTotalMs, transitionEndMs } = await import('./transition.js');

describe('transitionTotalMs', () => {
  it('takes the longest duration + delay, s and ms', () => {
    assert.equal(transitionTotalMs('0.18s, 0.18s', '0s'), 180);
    assert.equal(transitionTotalMs('0.6s, 200ms', '0s, 0.1s'), 600);
    assert.equal(transitionTotalMs('100ms, 200ms', '500ms'), 700); // delay list repeats
  });
  it('null when nothing parsable; zero stays zero', () => {
    assert.equal(transitionTotalMs('', ''), null);
    assert.equal(transitionTotalMs(undefined, undefined), null);
    assert.equal(transitionTotalMs('0s', '0s'), 0);
  });
});

describe('transitionEndMs', () => {
  it('null without readable elements', () => {
    assert.equal(transitionEndMs(null, undefined), null);
  });
});
