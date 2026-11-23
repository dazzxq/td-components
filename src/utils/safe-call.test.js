import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeCall, defineCallbackProps, fireCallback } from './safe-call.js';

test('safeCall: runs fn, logs a throw without rethrowing', () => {
  let got; safeCall((v) => { got = v; }, 3, 'x');
  assert.equal(got, 3);
  const orig = console.error; const logs = [];
  console.error = (...a) => logs.push(a);
  try { safeCall(() => { throw new Error('boom'); }, 1, 'td-x: onChange'); } finally { console.error = orig; }
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'td-x: onChange threw');
});

test('defineCallbackProps: default null, non-function → null, function kept, per instance', () => {
  class K {} defineCallbackProps(K, ['onChange', 'onInput']);
  const a = new K(); const b = new K(); const fn = () => {};
  assert.equal(a.onChange, null);
  a.onChange = fn; assert.equal(a.onChange, fn); assert.equal(b.onChange, null);
  a.onChange = 'nope'; assert.equal(a.onChange, null);
  assert.equal(typeof Object.getOwnPropertyDescriptor(K.prototype, 'onInput').set, 'function');
});

test('fireCallback: calls with value, no-op when unset', () => {
  class K { get localName() { return 'td-k'; } } defineCallbackProps(K, ['onChange']);
  const k = new K(); fireCallback(k, 'onChange', 1);
  const seen = []; k.onChange = (v) => seen.push(v); fireCallback(k, 'onChange', 'v');
  assert.deepEqual(seen, ['v']);
});
