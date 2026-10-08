// v0.59.1 (plan docs/internal/plans/v0.59.1-label-position.md) — PHP side of `label-position`:
//   - WITHOUT label_position, with 'end' and with an invalid value the markup of td_toggle / td_checkbox is byte-identical
//     to v0.59.0 (test/ssr/label-position.baseline.json, printed by the v0.59.0 php/td.php for the same calls);
//   - label_position => 'start': element mode puts `label-position="start"` on the host (the CSS hook that applies before
//     the module arrives, ADR 0025) and NOTHING else changes; native mode adds the modifier class
//     `td-switch--label-start` / `td-checkbox--label-start` to the label and NOTHING else changes;
//   - the host attribute is owned: `attrs` cannot set or override it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const { cases: CASES } = JSON.parse(readFileSync(join(ROOT, 'test/ssr/label-position.cases.json'), 'utf8'));
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'test/ssr/label-position.baseline.json'), 'utf8'));

/** Calls in ONE php process; each returns { html, warns } (every warning / notice captured). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + ' $w[] = $msg; return true; });'
    + ' $html = $fn(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
/** the case call with `label_position` set to `v` */
const withPos = (c, v) => {
  const args = structuredClone(c.args);
  args[args.length - 1].label_position = v;
  return [c.fn, args];
};
const BLOCK = { td_toggle: 'td-switch', td_checkbox: 'td-checkbox' };

describe('php/td.php — td_toggle / td_checkbox label_position (v0.59.1)', opts, () => {
  test('without the option: byte-identical to v0.59.0 (label-position.baseline.json)', () => {
    const out = run(CASES.map((c) => [c.fn, c.args]));
    CASES.forEach((c, i) => {
      assert.deepEqual(out[i].warns, [], c.id);
      assert.equal(out[i].html, BASELINE[c.id], `${c.id}: byte-identical`);
    });
  });

  for (const [name, v] of [['end', 'end'], ['invalid string', 'left'], ['wrong case', 'START'], ['padded', ' start'], ['empty', ''],
    ['null', null], ['true', true], ['number', 1], ['array', ['start']], ['markup', '"><script>alert(1)</script>']]) {
    test(`label_position ${name}: the default layout — byte-identical to v0.59.0, no warning`, () => {
      const out = run(CASES.map((c) => withPos(c, v)));
      CASES.forEach((c, i) => {
        assert.deepEqual(out[i].warns, [], c.id);
        assert.equal(out[i].html, BASELINE[c.id], `${c.id}: byte-identical`);
      });
    });
  }

  test("label_position 'start', element mode: the host carries label-position=\"start\" — nothing else changes", () => {
    const cases = CASES.filter((c) => c.mode === 'element');
    assert.ok(cases.length >= 5);
    const out = run(cases.map((c) => withPos(c, 'start')));
    cases.forEach((c, i) => {
      const { html, warns } = out[i];
      assert.deepEqual(warns, [], c.id);
      assert.equal((html.match(/ label-position="start"/g) || []).length, 1, `${c.id}: one attribute\n${html}`);
      const tag = c.fn === 'td_toggle' ? 'td-toggle' : 'td-checkbox';
      assert.ok(new RegExp(`^<${tag} [^>]* label-position="start"`).test(html), `${c.id}: on the host\n${html}`);
      assert.equal(html.replace(' label-position="start"', ''), BASELINE[c.id], `${c.id}: the rest is byte-identical`);
      assert.ok(!html.includes('--label-start'), `${c.id}: no modifier class in element mode (render() has none)`);
    });
  });

  test("label_position 'start', native mode: the label carries the modifier class — nothing else changes", () => {
    const cases = CASES.filter((c) => c.mode === 'native');
    assert.ok(cases.length >= 5);
    const out = run(cases.map((c) => withPos(c, 'start')));
    cases.forEach((c, i) => {
      const { html, warns } = out[i];
      const b = BLOCK[c.fn];
      assert.deepEqual(warns, [], c.id);
      assert.ok(!html.includes('label-position'), `${c.id}: no attribute in native mode`);
      assert.ok(new RegExp(`^<label class="${b} ${b}--(sm|md|lg) ${b}--label-start[ "]`).test(html), `${c.id}: modifier after the size\n${html}`);
      assert.equal((html.match(/--label-start/g) || []).length, 1, `${c.id}: once`);
      assert.equal(html.replace(` ${b}--label-start`, ''), BASELINE[c.id], `${c.id}: the rest is byte-identical`);
    });
  });

  test('the host attribute is owned: attrs cannot set or override label-position (any case)', () => {
    const [a, b, c, d] = run([
      ['td_toggle', ['x', false, 'X', { id: 'o1', element: true, attrs: { 'label-position': 'start', 'data-k': '1' } }]],
      ['td_toggle', ['x', false, 'X', { id: 'o2', element: true, label_position: 'start', attrs: { 'LABEL-POSITION': 'end' } }]],
      ['td_checkbox', ['y', false, 'Y', { id: 'o3', element: true, attrs: { 'Label-Position': 'start' } }]],
      ['td_checkbox', ['y', false, 'Y', { id: 'o4', element: true, label_position: 'start', attrs: { 'label-position': 'x' } }]],
    ]);
    assert.ok(!/label-position/i.test(a.html) && a.html.includes('data-k="1"'), a.html);
    assert.equal((b.html.match(/label-position/gi) || []).length, 1, b.html);
    assert.ok(b.html.includes(' label-position="start"'), b.html);
    assert.ok(!/label-position/i.test(c.html), c.html);
    assert.equal((d.html.match(/label-position/gi) || []).length, 1, d.html);
    assert.ok(d.html.includes(' label-position="start"'), d.html);
  });

  test('the Td::configure ssr_elements default follows the same rule (element markup with the host attribute)', () => {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}, ['ssr_elements' => true]);`
      + " echo td_toggle('s', true, 'Hiển thị', ['id' => 'cfg', 'label_position' => 'start']);";
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'error_reporting=E_ALL', '-r', code], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.ok(/^<td-toggle [^>]* label-position="start"/.test(r.stdout), r.stdout);
    assert.ok(!r.stdout.includes('--label-start'), r.stdout);
  });
});
