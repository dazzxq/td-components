// v0.63.0 (plan docs/internal/plans/v0.63.0-typed-dates.md § A, M0) — PHP side of `editable`: td_datetime_picker() / td_date() /
// td_datetime_range() print the host attribute `editable` for `['editable' => true]` and NOTHING else changes — the SSR markup
// (native input(s) + trigger) is byte-identical to the same call without the option; the element does not adopt it (another
// markup) and takes its existing safe-render path. A falsy option prints nothing; `attrs` cannot smuggle a second `editable`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (every warning captured — none is expected). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool { $w[] = $msg; return true; });'
    + ' $html = $fn(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const hostTag = (h, el) => (new RegExp(`^<${el}[^>]*>`).exec(h) || [''])[0];

const CASES = [
  ['td_date', ['d', '1994-03-15', { id: 'x', label: 'Chụp từ' }], 'td-datetime-picker'],
  ['td_datetime_picker', ['d', '15/03/1994 - 09:05', { id: 'x', required: true, clearable: true, min: '1990-01-01' }], 'td-datetime-picker'],
  ['td_datetime_picker', ['d', null, { id: 'x', mode: 'date', disabled: true, error: 'Sai', helper_text: 'Gợi ý' }], 'td-datetime-picker'],
  ['td_datetime_range', ['r', '1994-03-20', null, { id: 'x', label: 'Chụp', max_days: 31 }], 'td-datetime-range'],
  ['td_datetime_range', ['r', null, null, { id: 'x', mode: 'datetime', required: true, allow_open_end: true }], 'td-datetime-range'],
];

describe('php/td.php — v0.63.0 `editable`', opts, () => {
  test('editable → the host gets `editable` (bare); the rest of the markup is byte-identical to the call without it', () => {
    const calls = [];
    for (const [fn, args] of CASES) {
      calls.push([fn, args]);
      calls.push([fn, [...args.slice(0, -1), { ...args[args.length - 1], editable: true }]]);
    }
    const out = run(calls);
    CASES.forEach(([fn, , el], i) => {
      const plain = out[2 * i];
      const ed = out[2 * i + 1];
      assert.deepEqual(plain.warns, [], fn);
      assert.deepEqual(ed.warns, [], fn);
      const h = hostTag(ed.html, el);
      assert.match(h, / editable[ >]/, `${fn}: host carries editable`);
      assert.ok(!/ editable=/.test(h), `${fn}: a bare boolean attribute`);
      assert.ok(!plain.html.includes(' editable'), `${fn}: no attribute without the option`);
      // the ONLY difference is the attribute on the host
      assert.equal(ed.html.replace(' editable', ''), plain.html, `${fn}: SSR markup unchanged`);
      assert.equal(ed.html.split(' editable').length - 1, 1, `${fn}: printed once`);
      assert.ok(ed.html.includes('data-td-ssr="datetime-'), `${fn}: still the SSR contract markup`);
    });
  });

  test('a falsy option prints nothing; attrs cannot add a second / valued `editable`', () => {
    const out = run([
      ['td_date', ['d', null, { id: 'x', editable: false }]],
      ['td_date', ['d', null, { id: 'x', editable: 0 }]],
      ['td_date', ['d', null, { id: 'x', editable: true, attrs: { editable: 'no' } }]],
      ['td_datetime_range', ['r', null, null, { id: 'x', editable: true, attrs: { editable: 'x', 'data-x': '1' } }]],
      ['td_date', ['d', null, { id: 'x', attrs: { editable: '' } }]],
    ]);
    assert.ok(!out[0].html.includes(' editable'));
    assert.ok(!out[1].html.includes(' editable'));
    assert.equal(hostTag(out[2].html, 'td-datetime-picker').split(' editable').length - 1, 1);
    assert.ok(!out[2].html.includes('editable="'));
    const r = hostTag(out[3].html, 'td-datetime-range');
    assert.equal(r.split(' editable').length - 1, 1);
    assert.ok(!r.includes('editable="'));
    assert.ok(r.includes(' data-x="1"'));
    // a reserved name in attrs never reaches the host (only the option prints it)
    assert.ok(!out[4].html.includes(' editable'));
  });
});
