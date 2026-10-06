// v0.52.0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md M5) — PHP side:
//   - td_toggle tone / status_text / locked / locked_reason: FORCE element mode, the exact parts <td-toggle> renders
//     (clock / lock icon slots, description spans OUTSIDE the label, aria-readonly + aria-describedby on the input),
//     escaping, 200-code-point cut, unknown tone → ignored + a fixed warning, host attribute reservation;
//   - td_choice_group variant="segmented": size / icon_only / option icon (pattern + registry, else ignored + counted);
//   - test/ssr/fixtures/toggle.html is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { TOGGLE_FIXTURE_FILE, renderToggleFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ warnings captured, the harness forbids stderr). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + ' $html = $fn(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const noSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '');

describe('php/td.php — td_toggle tone / locked (v0.52.0, contract toggle@1)', opts, () => {
  test('the exact parts: clock + lock slots, description spans after the label, aria-readonly + describedby (site ids kept)', () => {
    const [r] = run([['td_toggle', ['tfa', true, 'Bắt buộc 2FA', { id: 'u7', tone: 'warning', status_text: 'Chờ quét QR', locked: true,
      locked_reason: 'Chính sách', input_attrs: { 'aria-describedby': 'page-note' } }]]]);
    assert.deepEqual(r.warns, []);
    assert.equal(noSvg(r.html), '<td-toggle data-td-ssr="toggle@1" id="u7-host" name="tfa" checked label="Bắt buộc 2FA" size="md" tone="warning"'
      + ' status-text="Chờ quét QR" locked locked-reason="Chính sách"><label class="td-switch td-switch--md"><input type="checkbox" role="switch"'
      + ' class="td-switch__input" id="u7" name="tfa" checked aria-readonly="true" aria-describedby="page-note u7-host-status u7-host-lock">'
      + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb"><span class="td-switch__icon td-switch__icon--off" data-td-icon="close"></span>'
      + '<span class="td-switch__icon td-switch__icon--on" data-td-icon="clock"></span><span class="td-switch__icon td-switch__icon--lock" data-td-icon="lock"></span>'
      + '</span></span><span class="td-switch__label">Bắt buộc 2FA</span></label><span class="td-switch__status td-sr-only" id="u7-host-status">Chờ quét QR</span>'
      + '<span class="td-switch__lock-reason td-sr-only" id="u7-host-lock">Không thể thay đổi: Chính sách</span></td-toggle>');
    assert.ok(r.html.includes('data-icon="clock"') && r.html.includes('data-icon="lock"'));
  });

  test('any of the four options forces element mode (also with element => false); none of them → native as before', () => {
    const out = run([
      ['td_toggle', ['a', false, 'A', { tone: 'success', element: false }]],
      ['td_toggle', ['b', false, 'B', { status_text: 'x' }]],
      ['td_toggle', ['c', false, 'C', { locked: true }]],
      ['td_toggle', ['d', false, 'D', { locked_reason: 'r' }]],
      ['td_toggle', ['e', false, 'E', { locked: false, tone: null }]],
      ['td_toggle', ['f', false, 'F', {}]],
    ]);
    out.slice(0, 4).forEach((r, i) => assert.ok(r.html.startsWith('<td-toggle data-td-ssr="toggle@1"'), `${i}: ${r.html.slice(0, 60)}`));
    assert.ok(out[4].html.startsWith('<label class="td-switch'), out[4].html.slice(0, 60));
    assert.ok(out[5].html.startsWith('<label class="td-switch'), out[5].html.slice(0, 60));
  });

  test('OFF with a tone: the status span exists, the input is not described by it; unknown tone → ignored + ONE fixed warning', () => {
    const [off, bad] = run([
      ['td_toggle', ['a', false, 'A', { id: 'a', tone: 'warning' }]],
      ['td_toggle', ['b', true, 'B', { id: 'b', tone: '<danger>' }]],
    ]);
    assert.ok(off.html.includes('<span class="td-switch__status td-sr-only" id="a-host-status">Đang chờ</span>'));
    assert.ok(!/aria-describedby/.test(off.html));
    assert.deepEqual(bad.warns, ['td_toggle: unknown tone ignored (expected success | warning)']);
    assert.ok(!bad.html.includes('tone=') && !bad.html.includes('danger') && !bad.html.includes('td-switch__status'));
  });

  test('escaping + 200-code-point cut of status_text / locked_reason; reserved host / input names never pass through', () => {
    const long = '😀'.repeat(250);
    const [x, cut, res] = run([
      ['td_toggle', ['x', true, 'X', { id: 'x', tone: 'success', status_text: '<img src=x onerror=alert(1)>', locked: true, locked_reason: '"><script>' }]],
      ['td_toggle', ['y', true, 'Y', { id: 'y', status_text: long, locked: true, locked_reason: long }]],
      ['td_toggle', ['z', false, 'Z', { id: 'z', locked: true, attrs: { tone: 'warning', locked: false, 'status-text': 'evil', 'LOCKED-REASON': 'evil', 'data-w': '4' },
        input_attrs: { 'aria-readonly': 'false', 'data-y': '2' } }]],
    ]);
    assert.ok(!/<img|<script/.test(x.html));
    assert.ok(x.html.includes('&lt;img src=x onerror=alert(1)&gt;') && x.html.includes('Không thể thay đổi: &quot;&gt;&lt;script&gt;'));
    const status = /id="y-host-status">([^<]*)</.exec(cut.html)[1];
    assert.equal([...status].length, 200);
    assert.equal(/status-text="([^"]*)"/.exec(cut.html)[1], status);
    assert.equal([.../id="y-host-lock">([^<]*)</.exec(cut.html)[1]].length, 'Không thể thay đổi: '.length + 200);
    assert.ok(!/evil|tone=|aria-readonly="false"/.test(res.html), res.html);
    assert.ok(res.html.includes('data-w="4"') && res.html.includes('data-y="2"') && res.html.includes('aria-readonly="true"'));
  });

  test('td_checkbox is unchanged by the toggle options (no parts, no forced element)', () => {
    const [r] = run([['td_checkbox', ['c', true, 'C', { tone: 'success', locked: true }]]]);
    assert.ok(r.html.startsWith('<label class="td-checkbox'), r.html.slice(0, 60));
    assert.ok(!/tone|locked|aria-readonly/.test(r.html));
  });

  test('test/ssr/fixtures/toggle.html is up to date (node test/ssr/build-toggle-fixture.mjs)', () => {
    assert.equal(readFileSync(TOGGLE_FIXTURE_FILE, 'utf8'), renderToggleFixture(), 'stale fixture: run `node test/ssr/build-toggle-fixture.mjs`');
  });
});

describe('php/td.php — td_choice_group variant="segmented" (v0.52.0, contract choice-group@1)', opts, () => {
  const THEME = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' }, { value: 'dark', label: 'Tối', icon: 'moon' }];

  test('the exact face: icon slot + label (data-label) ; sizes + icon-only classes; host attributes', () => {
    const [md, sm] = run([
      ['td_choice_group', ['theme', THEME, 'auto', { id: 'th', aria_label: 'Giao diện', variant: 'segmented' }]],
      ['td_choice_group', ['theme', THEME, 'auto', { id: 'ts', aria_label: 'Giao diện', variant: 'segmented', size: 'sm', icon_only: true }]],
    ]);
    assert.deepEqual(md.warns, []);
    assert.ok(md.html.startsWith('<td-choice-group data-td-ssr="choice-group@1" id="th" name="theme" value="auto" variant="segmented" aria-label="Giao diện">'));
    assert.ok(md.html.includes('<div class="td-field td-choice td-choice--segmented td-choice--md">'));
    assert.ok(noSvg(md.html).includes('<span class="td-choice__face"><span class="td-choice__icon" data-td-icon="monitor" aria-hidden="true"></span>'
      + '<span class="td-choice__text" id="th-o0-l" data-label="Tự động">Tự động</span></span>'));
    assert.ok(md.html.includes('data-icon="monitor"'));
    assert.ok(sm.html.includes(' variant="segmented" size="sm" icon-only aria-label='));
    assert.ok(sm.html.includes('td-choice--segmented td-choice--sm td-choice--icon-only'));
    assert.ok(sm.html.includes('<span class="td-choice__text td-sr-only" id="ts-o0-l">Tự động</span>'));
  });

  test('icon: pattern + registry; anything else ignored (counted, never named) — the option stays; no icon in other variants', () => {
    const [r, btn, big] = run([
      ['td_choice_group', ['m', [{ value: 'a', label: 'A', icon: 'no-such-icon' }, { value: 'b', label: 'B', icon: '"><img src=x>' },
        { value: 'c', label: 'C', icon: 7 }, { value: 'd', label: 'D', icon: 'sun' }], null, { variant: 'segmented', icon_only: true, aria_label: 'M' }]],
      ['td_choice_group', ['n', [{ value: 'a', label: 'A', icon: 'sun' }], null, { aria_label: 'N' }]],
      ['td_choice_group', ['o', [{ value: 'a', label: 'A', icon: 'x'.repeat(65) }], null, { variant: 'segmented', size: 'xl', aria_label: 'O' }]],
    ]);
    assert.equal(r.warns.length, 1);
    assert.ok(r.warns[0].includes('3 field(s) ignored') && !r.warns[0].includes('no-such') && !r.warns[0].includes('img'));
    assert.equal((r.html.match(/td-choice__icon"/g) || []).length, 1);
    assert.equal((r.html.match(/td-choice__text td-sr-only/g) || []).length, 1); // icon-only hides only the option WITH an icon
    assert.ok(!r.html.includes('<img'));
    assert.ok(!btn.html.includes('td-choice__icon'));
    assert.ok(big.html.includes('td-choice--md') && !big.html.includes('size='));
    assert.equal(big.warns.length, 1);
  });

  test('segmented ignores swatch / image (not printed) and shows the hint only as a description', () => {
    const [r] = run([['td_choice_group', ['s', [{ value: 'a', label: 'A', swatch: '#000', hint: 'Gợi ý' }, { value: 'b', label: 'B', image: '/x.png' }], 'a',
      { id: 's', variant: 'segmented', aria_label: 'S' }]]]);
    assert.ok(!r.html.includes('td-choice__swatch') && !r.html.includes('<img'));
    assert.ok(r.html.includes('<span class="td-choice__hint td-sr-only" id="s-o0-h">Gợi ý</span>'));
    assert.ok(r.html.includes('aria-describedby="s-o0-h"'));
  });
});
