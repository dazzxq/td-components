// v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 3, 7, 8, 11, 13, M1 / M4) — PHP side:
//   - WITHOUT the new options every call is byte-identical to v0.54.0 (test/ssr/affix.baseline.json, printed by the v0.54.0
//     php/td.php for the same calls with the new options removed);
//   - td_field prefix / suffix / prefix_icon / suffix_icon / unit_label: native + element print the box render() prints
//     (`td-field--affix`, `div.td-field__box`, affix spans aria-hidden, icon slot with the inline SVG, hidden unit span),
//     the unit FIRST in aria-describedby, host attributes in element mode; unsupported types → dropped + one warning that
//     names the option (never the value);
//   - td_number_input prefix_icon / suffix_icon (inside the affix span) and `locale` (the shared table, pairwise with the
//     explicit separators; printed as group-separator / decimal-separator, never `locale`; unknown → default + warning);
//   - text is escaped everywhere (affix text, unit, icon names);
//   - the PHP locale table / resolver = the JS one (test/ssr/number-locale.cases.json);
//   - test/ssr/fixtures/affix.html is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { AFFIX_FIXTURES, AFFIX_FIXTURE_FILE, SSR_DIR, renderAffixFixture } from '../ssr/ssr.mjs';
import { NUMBER_LOCALES } from '../../src/utils/number-locale.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ warnings captured). `['@table', []]` = Td::NUMBER_LOCALES. */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + " $html = $fn === '@table' ? TdComponents\\Td::NUMBER_LOCALES : $fn(...$a);"
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const noSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '');
const BASELINE = JSON.parse(readFileSync(join(SSR_DIR, 'affix.baseline.json'), 'utf8'));
const LOCALE_CASES = JSON.parse(readFileSync(join(SSR_DIR, 'number-locale.cases.json'), 'utf8'));
const lastOpt = (c) => c.args[c.args.length - 1];
const descOf = (html, controlId) => {
  const m = new RegExp(`<input[^>]* id="${controlId}"[^>]*>`).exec(html);
  const d = m && /aria-describedby="([^"]*)"/.exec(m[0]);
  return d ? d[1].split(' ') : [];
};

describe('php/td.php — v0.55.0 affix + number locale', opts, () => {
  test('without the new options: byte-identical to v0.54.0 (affix.baseline.json)', () => {
    const calls = AFFIX_FIXTURES.cases.map((c) => {
      const args = structuredClone(c.args);
      for (const k of c.new) delete args[args.length - 1][k];
      return [c.fn, args];
    });
    const out = run(calls);
    AFFIX_FIXTURES.cases.forEach((c, i) => {
      assert.deepEqual(out[i].warns, [], c.id);
      assert.equal(out[i].html, BASELINE[c.id], `${c.id}: byte-identical`);
    });
  });

  test('with the options: the box, the affix spans, the icon slots, the unit (first in the description), host attributes', () => {
    const out = run(AFFIX_FIXTURES.cases.map((c) => [c.fn, c.args]));
    AFFIX_FIXTURES.cases.forEach((c, i) => {
      const { html, warns } = out[i];
      const o = lastOpt(c);
      assert.deepEqual(warns, [], c.id);
      const field = c.fn === 'td_field';
      const block = field ? 'td-field' : 'td-number';
      const plain = noSvg(html);
      if (field) {
        assert.match(html, /<div class="td-field td-field--(sm|md|lg) td-field--affix"/, `${c.id}: root modifier`);
        assert.match(plain, new RegExp(`<div class="td-field__box">(<span class="td-field__affix td-field__affix--prefix"[^]*?)?<input[^>]* id="${c.control}"`), `${c.id}: box > control`);
      }
      for (const side of ['prefix', 'suffix']) {
        const text = o[side] ?? '';
        const icon = o[`${side}_icon`] ?? '';
        if (!text && !icon) {
          assert.ok(!html.includes(`${block}__affix--${side}`), `${c.id}: no ${side}`);
          continue;
        }
        const slot = icon ? `<span class="${block}__affix-icon" data-td-icon="${icon}" data-td-icon-class="${block}__affix-svg"></span>` : '';
        const inner = side === 'prefix' ? slot + text : text + slot;
        assert.ok(plain.includes(`<span class="${block}__affix ${block}__affix--${side}" aria-hidden="true">${inner}</span>`), `${c.id}: ${side}\n${plain}`);
        if (icon) assert.match(html, new RegExp(`data-td-icon="${icon}" data-td-icon-class="${block}__affix-svg"><svg class="td-icon td-icon--m ${block}__affix-svg" data-icon="${icon}"`), `${c.id}: inline SVG`);
      }
      const unitId = `${c.host}-unit`;
      if (c.unit) assert.ok(html.includes(`<span id="${unitId}" hidden>${c.unit}</span>`), `${c.id}: unit span`);
      else assert.ok(!html.includes('-unit"'), `${c.id}: no unit`);
      if (c.fn === 'td_field' || !c.tag) assert.deepEqual(descOf(html, c.control), c.desc, `${c.id}: description as printed`);
      if (c.tag) {
        const host = /^<[a-z-]+[^>]*>/.exec(html)[0];
        for (const [opt, attr] of [['prefix', 'prefix'], ['suffix', 'suffix'], ['prefix_icon', 'prefix-icon'], ['suffix_icon', 'suffix-icon'], ['unit_label', 'unit-label']]) {
          if (o[opt] != null) assert.ok(host.includes(` ${attr}="${o[opt]}"`), `${c.id}: host ${attr}`);
          else assert.ok(!host.includes(` ${attr}=`), `${c.id}: no host ${attr}`);
        }
        assert.ok(!host.includes(' locale='), `${c.id}: locale is never printed`);
      }
    });
  });

  test('td_number_input locale → explicit separators on the host (the shared table, pairwise); native mode unchanged', () => {
    const [en, fr, pair, plain, nat] = run([
      ['td_number_input', ['a', '1', { element: true, id: 'l1', locale: 'en-US', decimals: 2 }]],
      ['td_number_input', ['a', '1', { element: true, id: 'l2', locale: 'FR' }]],
      ['td_number_input', ['a', '1', { element: true, id: 'l3', locale: 'de', group_separator: ',' }]],
      ['td_number_input', ['a', '1', { element: true, id: 'l4' }]],
      ['td_number_input', ['a', '1', { id: 'l5', locale: 'en' }]],
    ]);
    assert.ok(en.html.includes(' group-separator="," decimal-separator="."'), en.html);
    assert.ok(fr.html.includes(' group-separator=" " decimal-separator=","'), fr.html);
    assert.ok(pair.html.includes(' group-separator="," decimal-separator="."'), pair.html);
    assert.ok(!/separator=/.test(plain.html), 'no locale: nothing new');
    assert.ok(!/separator=|locale/.test(nat.html), 'native: no host, no separators');
    for (const r of [en, fr, pair, plain, nat]) assert.deepEqual(r.warns, []);
  });

  test('unknown / regional-not-in-table / non-string locale → default separators + ONE warning (option named, never the value)', () => {
    const out = run([
      ['td_number_input', ['a', '1', { element: true, id: 'u1', locale: 'de-CH' }]],
      ['td_number_input', ['a', '1', { element: true, id: 'u2', locale: 'pt-PT' }]],
      ['td_number_input', ['a', '1', { element: true, id: 'u3', locale: '<script>' }]],
      ['td_number_input', ['a', '1', { element: true, id: 'u4', locale: ['en'] }]],
      ['td_number_input', ['a', '1', { element: true, id: 'u5', locale: '' }]],
    ]);
    out.slice(0, 4).forEach((r, i) => {
      assert.equal(r.warns.length, 1, `case ${i}`);
      assert.match(r.warns[0], /^td_number_input: locale/);
      assert.ok(!/de-CH|pt-PT|script|\ben\b/.test(r.warns[0]), r.warns[0]);
      assert.ok(!/separator=/.test(r.html), 'default = nothing printed');
    });
    assert.deepEqual(out[4].warns, [], 'empty = no locale');
  });

  test('the PHP table and resolver = the JS ones (test/ssr/number-locale.cases.json)', () => {
    const [table] = run([['@table', []]]);
    assert.deepEqual(table.html, NUMBER_LOCALES);
    const look = run(LOCALE_CASES.lookup.map((c) => ['td__number_locale', [c.locale]]));
    LOCALE_CASES.lookup.forEach((c, i) => assert.deepEqual(look[i].html, c.pair, `lookup ${c.locale}`));
    const res = run(LOCALE_CASES.resolve.map((c) => ['td__number_separators', [c.locale ? NUMBER_LOCALES[c.locale] : null, c.group, c.decimal]]));
    LOCALE_CASES.resolve.forEach((c, i) => assert.deepEqual(res[i].html, c.want, `resolve ${JSON.stringify(c)}`));
  });

  test('escaping: affix text / unit / icon names are text (no markup, no attribute break-out); unknown icon → empty slot', () => {
    const p = '<img src=x onerror=alert(1)> & "q"';
    const [f, n] = run([
      ['td_field', ['x', '', { element: true, id: 'e1', prefix: p, suffix: p, unit_label: p, prefix_icon: '"><img src=x>', suffix_icon: 'no-such-icon' }]],
      ['td_number_input', ['y', null, { element: true, id: 'e2', prefix: p, suffix_icon: '"><b>', unit_label: p }]],
    ]);
    for (const { html } of [f, n]) {
      assert.ok(!/<img|<b>/i.test(html), html);
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'), html);
    }
    assert.ok(f.html.includes('data-td-icon="&quot;&gt;&lt;img src=x&gt;" data-td-icon-class="td-field__affix-svg"></span>'), 'unknown icon: empty slot');
    assert.ok(f.html.includes('data-td-icon="no-such-icon" data-td-icon-class="td-field__affix-svg"></span>'), f.html);
  });

  test('empty unit_label falls back to suffix then prefix; whitespace-only icon = none', () => {
    const [a, b] = run([
      ['td_field', ['x', '', { id: 'w1', prefix: 'A', suffix: 'B', unit_label: '' }]],
      ['td_field', ['x', '', { id: 'w2', prefix: 'A', suffix_icon: '   ' }]],
    ]);
    assert.ok(a.html.includes('<span id="w1-unit" hidden>B</span>'), a.html);
    assert.ok(!b.html.includes('td-field__affix--suffix'), b.html);
    assert.ok(b.html.includes('<span id="w2-unit" hidden>A</span>'), b.html);
  });

  test('unsupported td_field types (textarea, date, month, datetime-local, time): affix dropped, ONE warning naming the options', () => {
    const types = ['textarea', 'date', 'month', 'datetime-local', 'time'];
    const out = run(types.flatMap((type) => [
      ['td_field', ['x', '', { id: `t-${type}`, type, prefix: 'SECRET', suffix_icon: 'search', unit_label: 'u' }]],
      ['td_field', ['x', '', { id: `t-${type}`, type }]],
      ['td_field', ['x', '', { element: true, id: `t-${type}`, type, prefix: 'SECRET' }]],
      ['td_field', ['x', '', { element: true, id: `t-${type}`, type }]],
    ]));
    for (let i = 0; i < out.length; i += 2) {
      assert.equal(out[i].html, out[i + 1].html, 'same markup as without the options');
      assert.equal(out[i].warns.length, 1);
      assert.match(out[i].warns[0], /^td_field: prefix/);
      assert.ok(!out[i].warns[0].includes('SECRET'));
    }
  });

  test('test/ssr/fixtures/affix.html is fresh (node test/ssr/build-affix-fixture.mjs)', () => {
    assert.equal(readFileSync(AFFIX_FIXTURE_FILE, 'utf8'), renderAffixFixture());
  });
});
