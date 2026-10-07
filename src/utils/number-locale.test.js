// v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 11, Codex plan r1 #1 / #2) — the separators of
// <td-number-input locale>: the fixed table (case-insensitive on the WHOLE tag, no silent regional → language fallback),
// the JS-only out-of-table path through Intl (validated, NBSP / NNBSP → ' '), the pairwise resolution with explicit
// group-separator / decimal-separator, and the number rules (format / edit / parseLoose) with every table pair. The cases
// are shared with the PHP resolver (test/php/td-v055-php.test.js): test/ssr/number-locale.cases.json.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NUMBER_LOCALES, tableSeparators, localeSeparators, resolveSeparators } from './number-locale.js';
import { format, edit, parseLoose } from './number-format.js';

const CASES = JSON.parse(readFileSync(new URL('../../test/ssr/number-locale.cases.json', import.meta.url), 'utf8'));
const norm = (s) => s.replace(/[  ]/g, ' ');

describe('number-locale — lookup (shared cases)', () => {
  for (const c of CASES.lookup) {
    it(`${c.locale} → table ${JSON.stringify(c.pair)}, JS ${JSON.stringify(c.pair ?? c.intl)}`, () => {
      assert.deepEqual(tableSeparators(c.locale), c.pair);
      assert.deepEqual(localeSeparators(c.locale), c.pair ?? c.intl);
    });
  }

  it('every table key is a lower-case BCP 47 tag listed in the shared cases (one table for JS and PHP)', () => {
    const listed = new Set(CASES.lookup.filter((c) => c.pair).map((c) => c.locale.toLowerCase()));
    for (const k of Object.keys(NUMBER_LOCALES)) {
      assert.equal(k, k.toLowerCase());
      assert.ok(listed.has(k), `${k} has a shared case`);
    }
  });

  it('drift guard: Node Intl agrees with every table entry (NBSP / NNBSP read as a space)', () => {
    for (const [tag, [g, d]] of Object.entries(NUMBER_LOCALES)) {
      const parts = new Intl.NumberFormat(tag).formatToParts(1234567.5);
      const group = norm(parts.find((p) => p.type === 'group')?.value ?? '');
      const decimal = parts.find((p) => p.type === 'decimal')?.value;
      assert.deepEqual([group, decimal], [g, d], tag);
    }
  });

  it('non-string / empty locale → null (no locale)', () => {
    for (const v of [null, undefined, '', '   ', 42]) {
      assert.equal(tableSeparators(v), null);
      assert.equal(localeSeparators(v), null);
    }
  });
});

describe('number-locale — pairwise resolution (shared cases)', () => {
  for (const c of CASES.resolve) {
    it(`locale ${c.locale} + group ${JSON.stringify(c.group)} + decimal ${JSON.stringify(c.decimal)} → ${JSON.stringify(c.want)}`, () => {
      const pair = c.locale ? tableSeparators(c.locale) : null;
      const r = resolveSeparators(pair, c.group, c.decimal);
      assert.deepEqual([r.group, r.decimal], c.want);
      assert.equal(r.invalid.length > 0, !!c.warn, `warn ${JSON.stringify(r.invalid)}`);
    });
  }
});

describe('number-locale — the number rules with every table pair (format never rounds / pads; paste follows the locale)', () => {
  for (const [tag, [group, decimal]] of Object.entries(NUMBER_LOCALES)) {
    it(tag, () => {
      const o = { group, decimal, decimals: 2, negative: false };
      const want = `1${group}234${group}567${decimal}5`;
      assert.equal(format('1234567.5', o), want);
      assert.equal(format('6.70', o), `6${decimal}70`);
      assert.equal(format('6.7', o), `6${decimal}7`);
      const typed = edit(`1234567${decimal}5`, 9, o);
      assert.equal(typed.display, want);
      assert.equal(typed.value, '1234567.5');
      assert.equal(parseLoose(want, o), '1234567.5');
      assert.equal(parseLoose(`12${decimal}5`, o), '12.5');
    });
  }
});
