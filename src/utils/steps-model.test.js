// v0.45.0 (plan v0.45.0-steps-timeline QĐ S1–S5, M1) — pure model of <td-steps>: normalisation, the single state
// derivation rule (review R1-1), clickability, the compact summary (review R2-5). STATE_CASES / SUMMARY_CASES are the
// parity tables PHP td_steps is tested against (test/php/td-ssr-steps-timeline.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSteps, deriveStates, isClickable, summaryText, normalizeNavigation, STATE_CASES, SUMMARY_CASES, STEPS_LABELS,
  MAX_STEPS, STEP_LIMITS, STEP_STATES,
} from './steps-model.js';

const HTTPS = { baseURI: 'https://shop.example/import', origin: 'https://shop.example' };

describe('steps-model — normalizeSteps', () => {
  test('defaults: key = 1-based position, description "", disabled false; numbers cast; state / href only when valid', () => {
    const r = normalizeSteps([{ label: 'Tải tệp' }, { label: 2, key: 7, description: 1.5, state: 'done', disabled: true },
      { label: 'C', state: 'bogus', href: 'javascript:alert(1)' }, { label: 'D', href: '?step=4' }], HTTPS);
    assert.deepEqual(r.steps, [
      { key: '1', label: 'Tải tệp', description: '', disabled: false },
      { key: '7', label: '2', description: '1.5', disabled: false, state: 'done' },
      { key: '3', label: 'C', description: '', disabled: false },
      { key: '4', label: 'D', description: '', disabled: false, href: '?step=4' },
    ].map((s, i) => (i === 1 ? { ...s, disabled: true } : s)));
    assert.equal(r.dropped, 0);
  });

  test('dropped: no / blank / non-text label, non-object entries; invalid key / description types ignored', () => {
    const r = normalizeSteps([null, 'x', [1], {}, { label: '   ' }, { label: {} }, { label: true }, { label: 'ok', key: {}, description: [] }]);
    assert.equal(r.dropped, 7);
    assert.deepEqual(r.steps, [{ key: '1', label: 'ok', description: '', disabled: false }]);
    assert.deepEqual(normalizeSteps('nope').steps, []);
  });

  test('control characters removed; lengths cut in code points (key 100 / label 120 / description 300)', () => {
    const e = '😀'.repeat(500);
    const [s] = normalizeSteps([{ key: e, label: `a\u0000b\u0085${e}`, description: e }]).steps;
    assert.equal(Array.from(s.key).length, STEP_LIMITS.key);
    assert.equal(Array.from(s.label).length, STEP_LIMITS.label);
    assert.ok(s.label.startsWith('ab😀'));
    assert.equal(Array.from(s.description).length, STEP_LIMITS.description);
  });

  test('duplicate keys → -2, -3; a default key colliding with an explicit one is suffixed too', () => {
    const r = normalizeSteps([{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }, { key: 'a', label: 'C' }, { label: 'D' }, { key: '4', label: 'E' }]);
    assert.deepEqual(r.steps.map((s) => s.key), ['a', 'a-2', 'a-3', '4', '4-2']);
    assert.equal(r.renamed, 3);
  });

  test(`at most ${MAX_STEPS} steps (capped), ${MAX_STEPS * 4} entries inspected`, () => {
    const r = normalizeSteps(Array.from({ length: 30 }, (_, i) => ({ label: `S${i}` })));
    assert.equal(r.steps.length, MAX_STEPS);
    assert.equal(r.capped, true);
    const bad = normalizeSteps([...Array.from({ length: MAX_STEPS * 4 }, () => null), { label: 'late' }]);
    assert.equal(bad.steps.length, 0);
    assert.equal(bad.capped, true);
  });
});

describe('steps-model — deriveStates (QĐ S2, review R1-1)', () => {
  for (const c of STATE_CASES) {
    test(`STATE_CASES: ${c.name}`, () => {
      const r = deriveStates(c.steps, c.current, c.complete);
      assert.equal(r.anchor, c.anchor);
      assert.deepEqual(r.states, c.states);
      assert.deepEqual(r.warnings, c.warnings);
      for (const nav of ['back', 'all']) {
        const got = r.states.map((st, i) => (isClickable(st, i, r.anchor, c.complete, nav, false) ? i : -1)).filter((i) => i >= 0);
        assert.deepEqual(got, c[nav], `${nav}`);
      }
      assert.deepEqual(r.states.filter((_, i) => isClickable(r.states[i], i, r.anchor, c.complete, 'none', false)), []);
    });
  }

  test('fuzz: 4 steps × 5 state values × current ∈ {absent, each key, unknown} × complete → at most ONE anchor; shape rules', () => {
    const values = [undefined, ...STEP_STATES];
    let combos = 0;
    for (let m = 0; m < 5 ** 4; m++) {
      const steps = [0, 1, 2, 3].map((i) => {
        const st = values[Math.floor(m / 5 ** i) % 5];
        return st ? { key: String(i + 1), state: st } : { key: String(i + 1) };
      });
      for (const current of [null, '1', '2', '3', '4', 'zz']) {
        for (const complete of [false, true]) {
          combos++;
          const r = deriveStates(steps, current, complete);
          assert.ok(r.anchor >= -1 && r.anchor < 4);
          if (complete) assert.equal(r.anchor, -1);
          assert.ok(r.states.every((s) => STEP_STATES.includes(s)));
          // 'current' shape only on the anchor; never elsewhere
          r.states.forEach((s, i) => { if (s === 'current') assert.equal(i, r.anchor); });
          if (r.anchor >= 0) assert.ok(['current', 'error'].includes(r.states[r.anchor]));
          assert.ok(r.warnings.every((w, i, a) => a.indexOf(w) === i));
        }
      }
    }
    assert.equal(combos, 625 * 12);
  });

  test('isClickable: disabled never; unknown navigation = none', () => {
    assert.equal(isClickable('done', 0, 2, false, 'back', true), false);
    assert.equal(isClickable('done', 0, 2, false, 'nope', false), false);
    assert.equal(normalizeNavigation('ALL'), 'none');
    assert.equal(isClickable('upcoming', 3, 2, false, 'all', false), true);
  });
});

describe('steps-model — summaryText (QĐ S3, review R2-5)', () => {
  for (const c of SUMMARY_CASES) {
    test(`SUMMARY_CASES: ${c.name}`, () => {
      const steps = normalizeSteps(c.labels.map((label, i) => (c.states[i] ? { label, state: c.states[i] } : { label }))).steps;
      const r = deriveStates(steps, c.current, c.complete);
      assert.equal(summaryText(r.anchor, steps.length, c.complete, STEPS_LABELS, steps[r.anchor]?.label), c.text);
    });
  }
  test('site labels: placeholders filled, $& kept literal', () => {
    assert.equal(summaryText(0, 3, false, { summary: '{n} of {total} — {label}' }, '$&x'), '1 of 3 — $&x');
  });
});
