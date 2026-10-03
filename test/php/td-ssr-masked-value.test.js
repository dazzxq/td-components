// v0.31.0 (ADR 0012, plan docs/internal/plans/v0.31.0-sortable-masked.md M6) — PHP side of the SSR contract
// `masked-value@1`: td_masked_value() always prints the element + the masked text + the toggle + the live region, exactly
// as <td-masked-value> renders them. Its signature has NO parameter for the real value (it can never leak it): the real
// value only ever comes from the app's permission-checked endpoint through `reveal()`.
// Shared fixtures: test/ssr/masked-value.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/masked-value.html — this test fails when it is stale: `node test/ssr/build-masked-value-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, runPhp, PHP_BIN, ROOT } from './php.mjs';
import { MASKED_VALUE_FIXTURES, MASKED_VALUE_FIXTURE_FILE, renderMaskedValueFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.31.0';

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function one(fn, args) {
  const [r] = runPhp([{ fn, args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

describe('php/td.php — td_masked_value (v0.31.0, contract masked-value@1)', opts, () => {
  const svg = () => one('Td::icon', ['eye']);
  const tree = (masked, name, disabled = false) => `<span class="td-masked__text" translate="no">${esc(masked)}</span>`
    + `<button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="${esc(name)}" data-tooltip="${esc(name)}"${disabled ? ' aria-disabled="true"' : ''}>`
    + `<span class="td-masked__icon" data-td-icon="eye" aria-hidden="true">${svg()}</span></button>`
    + '<span class="td-sr-only" role="status"></span></td-masked-value>';

  test('always the element: masked text + toggle + live region; options on the host', () => {
    assert.equal(one('td_masked_value', ['09xx xxx 123', { label: 'SĐT khách' }]),
      '<td-masked-value data-td-ssr="masked-value@1" class="td-masked" masked="09xx xxx 123" label="SĐT khách">'
      + tree('09xx xxx 123', 'Hiện SĐT khách'));
    assert.equal(one('td_masked_value', ['x', {}]),
      `<td-masked-value data-td-ssr="masked-value@1" class="td-masked" masked="x">${tree('x', 'Hiện giá trị')}`);
    assert.equal(one('td_masked_value', ['x', { id: 'mv', class: 'a b', duration: 45, copyable: true, disabled: true, label: 'IMEI' }]),
      '<td-masked-value data-td-ssr="masked-value@1" id="mv" class="td-masked a b" masked="x" label="IMEI" duration="45" copyable disabled>'
      + tree('x', 'Hiện IMEI', true));
  });

  test('duration: cast to int and clamped to [2, 600] like the component; invalid → absent (default 30)', () => {
    const cases = [[1, '2'], ['9999', '600'], ['12.7', '12'], [30, '30'], ['abc', null], ['', null], [null, null], [true, null]];
    const out = runPhp(cases.map(([d]) => ({ fn: 'td_masked_value', args: ['x', { duration: d }] })), { baseUrl: BASE });
    cases.forEach(([d, want], i) => {
      const m = / duration="([^"]*)"/.exec(out[i].out);
      assert.equal(m ? m[1] : null, want, String(d));
    });
  });

  test('attrs: allowlist + data-* (data-id reaches the host for the hook); owned names, data-td-*, handlers, style dropped', () => {
    const c = MASKED_VALUE_FIXTURES.cases.find((x) => x.id === 'm-attrs');
    const out = one('td_masked_value', c.args);
    const host = /^<td-masked-value[^>]*>/.exec(out)[0];
    assert.equal(host, '<td-masked-value data-td-ssr="masked-value@1" class="td-masked" masked="09xx" data-id="c-9" title="Gợi ý">');
    for (const bad of ['onclick', 'evil', 'data-td-z', 'style']) assert.ok(!out.includes(bad), bad);
  });

  test('escaping: masked and label are escaped (XSS case)', () => {
    const c = MASKED_VALUE_FIXTURES.cases.find((x) => x.id === 'm-xss');
    const out = one('td_masked_value', c.args);
    assert.ok(out.includes(`<span class="td-masked__text" translate="no">${esc(c.args[0])}</span>`), out);
    assert.ok(out.includes(`aria-label="${esc(`Hiện ${c.args[1].label}`)}"`), out);
    assert.ok(!/<script|<img/i.test(out), out);
  });

  test('the signature takes NO real value: (string $masked, array $o = []); value-like options are never printed', () => {
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r',
      `require ${JSON.stringify(join(ROOT, 'php', 'td.php'))}; $f = new ReflectionFunction('td_masked_value');`
      + ' echo json_encode(array_map(fn($p) => [$p->getName(), (string) $p->getType()], $f->getParameters()));'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [['masked', 'string'], ['o', 'array']]);
    const out = one('td_masked_value', ['09xx', { value: '0912345123', real: '0912345123', revealed: '0912345123' }]);
    assert.ok(!out.includes('0912345123'), out);
  });

  test('test/ssr/fixtures/masked-value.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(MASKED_VALUE_FIXTURE_FILE, 'utf8'), renderMaskedValueFixture(),
      'stale fixture: run `node test/ssr/build-masked-value-fixture.mjs`');
  });
});
