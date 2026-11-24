import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// v0.123.0 (plan docs/internal/plans/v0.123.0-table-sticky-column.md QĐ 1–2): td-table column `sticky: 'end'` — the
// markup only (class names, root modifier). Layout / colours / scroll behaviour: td-v123-table-sticky-col.engines.browser-test.js.
class MockHTMLElement {
  constructor() { this._a = new Map(); }
  addEventListener() {}
  getAttribute(n) { return this._a.get(n) ?? null; }
  hasAttribute(n) { return this._a.has(n); }
  setAttribute(n, v) { this._a.set(n, String(v)); }
}
globalThis.HTMLElement = MockHTMLElement;
globalThis.customElements = { define() {}, get() {} };
globalThis.document = { createElement: () => ({}), head: {}, addEventListener() {} };
globalThis.window = globalThis;
const { TdTable } = await import('./td-table.js');

const CLS = 'td-table__sticky-end';
const COLS = (last = {}) => [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C', ...last }];

/** Everything a column set puts into the markup: header, skeleton rows, one data row. */
function markup(columns) {
  const el = new TdTable();
  el._columns = columns;
  const head = el.render();
  const P = { esc: (s) => s, pad: '', cols: columns, roles: el._cardRoles(), labels: columns.map(() => ''), cellRole: 'cell', selCell: '', treeCi: -1 };
  return { el, head, skeleton: el._skeletonHtml(), row: el._rowHtml({ a: 1, b: 2, c: 3 }, 0, P, null) };
}

describe('td-table sticky: \'end\' (v0.123.0) markup', () => {
  let warns;
  const origWarn = console.warn;
  beforeEach(() => { warns = []; console.warn = (...a) => { warns.push(a.join(' ')); }; });
  afterEach(() => { console.warn = origWarn; });

  it('off: markup is byte-identical to the same columns without the option, no class, no warning', () => {
    const plain = markup(COLS());
    for (const off of [{ sticky: undefined }, { sticky: null }, { sticky: false }]) {
      const m = markup(COLS(off));
      assert.equal(m.head, plain.head);
      assert.equal(m.skeleton, plain.skeleton);
      assert.equal(m.row, plain.row);
    }
    assert.ok(!plain.head.includes(CLS) && !plain.head.includes('td-table--sticky-end'));
    assert.ok(!plain.skeleton.includes(CLS) && !plain.row.includes(CLS));
    assert.equal(plain.el._stickyCi, -1);
    assert.deepEqual(warns, []);
  });

  it('on (last column): root modifier + the class on th, body td and skeleton td of that column only', () => {
    const m = markup(COLS({ sticky: 'end' }));
    assert.ok(m.head.startsWith('<div class="td-table td-table--zebra td-table--sticky-end"') || /class="td-table[^"]* td-table--sticky-end/.test(m.head));
    assert.equal((m.head.match(new RegExp(CLS, 'g')) || []).length, 1);
    assert.match(m.head, /<th class="td-table__th td-table__sticky-end"[^>]*data-col="2"/);
    assert.match(m.row, /<td class="td-table__cell td-table__sticky-end"[^>]*data-col="2"/);
    assert.equal((m.row.match(new RegExp(CLS, 'g')) || []).length, 1);
    assert.equal((m.skeleton.match(new RegExp(CLS, 'g')) || []).length, m.skeleton.split('</tr>').length - 1);
    assert.match(m.skeleton, /<td class="td-table__cell td-table__sticky-end"[^>]*data-col="2"/);
    assert.equal(m.el._stickyCi, 2);
    assert.deepEqual(warns, []);
  });

  it('on: removing the option from a later render turns the class and the modifier off again', () => {
    const el = new TdTable();
    el._columns = COLS({ sticky: 'end' });
    assert.ok(el.render().includes('td-table--sticky-end'));
    el._columns = COLS();
    const off = el.render();
    assert.ok(!off.includes('sticky-end'));
    assert.equal(el._stickyCi, -1);
  });

  it("'start': ignored (no class) + exactly one warning, however many renders", () => {
    const columns = [{ key: 'a', label: 'A', sticky: 'start' }, { key: 'b', label: 'B', sticky: 'start' }, { key: 'c', label: 'C' }];
    const m = markup(columns);
    m.el.render();
    assert.ok(!m.head.includes('sticky-end') && !m.row.includes('sticky-end'));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /sticky: 'start'/);
  });

  it("'end' on a column that is not the last: ignored + one warning (a later last-column 'end' still counts)", () => {
    const m = markup([{ key: 'a', label: 'A', sticky: 'end' }, { key: 'b', label: 'B', sticky: 'end' }, { key: 'c', label: 'C' }]);
    assert.ok(!m.head.includes('sticky-end') && !m.row.includes('sticky-end'));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /LAST column/);
    warns.length = 0;
    const m2 = markup([{ key: 'a', label: 'A', sticky: 'end' }, { key: 'c', label: 'C', sticky: 'end' }]);
    assert.equal(m2.el._stickyCi, 1);
    assert.match(m2.head, /<th class="td-table__th td-table__sticky-end"[^>]*data-col="1"/);
    assert.ok(!/<th class="td-table__th td-table__sticky-end"[^>]*data-col="0"/.test(m2.head));
    assert.equal(warns.length, 1);
  });

  it('an unknown value: ignored + one warning (a different message than the other kinds)', () => {
    const m = markup([{ key: 'a', label: 'A', sticky: 'center' }, { key: 'b', label: 'B', sticky: 1 }, { key: 'c', label: 'C', sticky: 'END' }]);
    assert.ok(!m.head.includes('sticky-end') && !m.row.includes('sticky-end'));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /invalid column `sticky` value/);
  });

  it('all three kinds together warn once each', () => {
    markup([{ key: 'a', sticky: 'start' }, { key: 'b', sticky: 'end' }, { key: 'c', sticky: 'x' }, { key: 'd', sticky: 'end' }]);
    assert.equal(warns.length, 3);
  });

  it('a hole (null / non-object) in columns is tolerated', () => {
    const m = markup([null, { key: 'b', label: 'B', sticky: 'end' }]);
    assert.equal(m.el._stickyCi, 1);
  });
});

describe('td-table column stickyMax (v0.125.0)', () => {
  let warns;
  const origWarn = console.warn;
  beforeEach(() => { warns = []; console.warn = (...a) => { warns.push(a.join(' ')); }; });
  afterEach(() => { console.warn = origWarn; });
  const maxOf = (last) => { const { el } = markup(COLS(last)); el._computeSticky(); return el._stickyMax; };

  it('default 0.5; valid values (0.3, 1) are used, no warning', () => {
    assert.equal(maxOf({ sticky: 'end' }), 0.5);
    assert.equal(maxOf({ sticky: 'end', stickyMax: 0.3 }), 0.3);
    assert.equal(maxOf({ sticky: 'end', stickyMax: 1 }), 1);
    assert.deepEqual(warns, []);
  });

  for (const bad of ['a', 0, -1, 1.5, NaN, Infinity, '0.4', null]) {
    it(`invalid ${String(bad)} → 0.5 + one warning`, () => {
      assert.equal(maxOf({ sticky: 'end', stickyMax: bad }), 0.5);
      assert.equal(warns.length, 1);
      assert.match(warns[0], /stickyMax/);
    });
  }

  it('on a column that is not pinned: ignored, no warning', () => {
    assert.equal(maxOf({ stickyMax: 'nonsense' }), 0.5);
    assert.deepEqual(warns, []);
  });
});
