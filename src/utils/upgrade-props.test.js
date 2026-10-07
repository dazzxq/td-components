// v0.54.1 (plan v0.54.1-preupgrade-props): pre-upgrade own properties are found by the class setters, in assignment
// order; internal (`_`), getter-only and accessor own properties are left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasClassSetter, takePreUpgradeProps, replayPreUpgradeProps } from './upgrade-props.js';

class Base {
  get columns() { return this._columns; }
  set columns(v) { this._columns = v; this.log.push(['columns', v]); }
  get order() { return 'asc'; } // getter only
}
class Sub extends Base {
  get data() { return this._data; }
  set data(v) { this._data = v; this.log.push(['data', v]); }
  get columns() { return super.columns; } // getter-only override hides the base setter
}

/** An instance with own data properties shadowing the accessors (what an un-upgraded element carries). */
function preUpgraded(C, props) {
  const el = Object.create(C.prototype);
  for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, writable: true, enumerable: true, configurable: true });
  el.log = [];
  return el;
}

test('hasClassSetter: nearest descriptor decides', () => {
  const el = Object.create(Sub.prototype);
  assert.equal(hasClassSetter(el, 'data'), true);
  assert.equal(hasClassSetter(el, 'columns'), false);
  assert.equal(hasClassSetter(el, 'order'), false);
  assert.equal(hasClassSetter(el, 'nope'), false);
  assert.equal(hasClassSetter(Object.create(Base.prototype), 'columns'), true);
});

test('replayPreUpgradeProps: setters run in assignment order, own data properties gone', () => {
  const el = preUpgraded(Base, { columns: [1], _private: 1, title: 'x', order: 'desc' });
  const names = replayPreUpgradeProps(el);
  assert.deepEqual(names, ['columns']);
  assert.deepEqual(el.log, [['columns', [1]]]);
  assert.equal(Object.hasOwn(el, 'columns'), false);
  assert.equal(el.columns[0], 1);
  // untouched: internal, no class setter, getter-only
  assert.equal(el._private, 1);
  assert.equal(el.title, 'x');
  assert.equal(Object.getOwnPropertyDescriptor(el, 'order').value, 'desc');
});

test('takePreUpgradeProps: extra names (attribute-backed) are taken too; accessors on the instance are skipped', () => {
  const el = preUpgraded(Sub, { data: 'd', label: 'L' });
  Object.defineProperty(el, 'size', { get: () => 'md', set() {}, enumerable: true, configurable: true });
  const early = takePreUpgradeProps(el, new Set(['label', 'size']));
  assert.deepEqual(early, [['data', 'd'], ['label', 'L']]);
  assert.equal(Object.hasOwn(el, 'data'), false);
  assert.equal(Object.hasOwn(el, 'label'), false);
  assert.equal(Object.hasOwn(el, 'size'), true);
});
