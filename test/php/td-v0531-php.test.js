// v0.53.1 (plan docs/internal/plans/v0.53.1-segmented-layout.md QĐ 3) — PHP td_choice_group 'stretch': the host attribute
// only (segmented + true); every other output byte-identical (the rest of the markup = render(), contract choice-group@1).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** td_choice_group calls in ONE php process → their HTML (warnings forbidden). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as $a) { $out[] = td_choice_group(...$a); }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'error_reporting=E_ALL', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const THEME = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];

describe('php/td.php — td_choice_group stretch (v0.53.1)', opts, () => {
  test('segmented + stretch → host attribute `stretch`, the inner markup unchanged', () => {
    const base = { id: 'th', label: 'Giao diện', variant: 'segmented', size: 'sm' };
    const [plain, on] = run([['theme', THEME, 'auto', base], ['theme', THEME, 'auto', { ...base, stretch: true }]]);
    assert.ok(on.startsWith('<td-choice-group data-td-ssr="choice-group@1" id="th" name="theme" value="auto" label="Giao diện" variant="segmented" size="sm" stretch>'), on.slice(0, 160));
    assert.equal(on.replace(' stretch>', '>'), plain);
  });

  test('no stretch, stretch false / falsy, or another variant → byte-identical to the call without the key', () => {
    const calls = [];
    for (const variant of ['segmented', 'button', 'swatch']) {
      const o = { id: `c-${variant}`, aria_label: 'X', variant };
      calls.push(['c', THEME, 'auto', o], ['c', THEME, 'auto', { ...o, stretch: false }], ['c', THEME, 'auto', { ...o, stretch: 0 }]);
      if (variant !== 'segmented') calls.push(['c', THEME, 'auto', { ...o, stretch: true }]);
    }
    const out = run(calls);
    let i = 0;
    for (const variant of ['segmented', 'button', 'swatch']) {
      const ref = out[i++];
      assert.ok(!ref.includes('stretch'), variant);
      assert.equal(out[i++], ref, `${variant} stretch false`);
      assert.equal(out[i++], ref, `${variant} stretch 0`);
      if (variant !== 'segmented') assert.equal(out[i++], ref, `${variant} stretch true (ignored)`);
    }
  });
});
