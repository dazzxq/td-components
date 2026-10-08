// v0.58.0 (plan docs/internal/plans/v0.58.0-floating-label.md QĐ 2–5, 13 + M0 F1, M1 / M3) — PHP side of
// `label_mode => 'floating'` on td_field (native + element):
//   - WITHOUT label_mode (and with `top` / an unknown value / no label) every call is byte-identical to v0.57.1
//     (test/ssr/floating.baseline.json, printed by the v0.57.1 php/td.php for the same calls with label_mode removed);
//   - floating: root classes `td-field--floating` [+ `td-field--always-float` (date family / affix)] [+ `td-field--ph-label`
//     (no real placeholder — M0 F1)], the control (or the affix box) BEFORE the real <label for>, the control placeholder =
//     the real one, else the label text; element mode: host `label-mode="floating"`;
//   - the same affix matrix as JS (Codex plan r1 #2): the 7 affix types take a box; date family / textarea keep the v0.55
//     "dropped + one warning" behaviour;
//   - text is escaped (label, placeholder);
//   - test/ssr/fixtures/floating.html is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { FLOATING_FIXTURES, FLOATING_FIXTURE_FILE, SSR_DIR, renderFloatingFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ warnings captured). */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + ' $html = $fn(...$a);'
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const BASELINE = JSON.parse(readFileSync(join(SSR_DIR, 'floating.baseline.json'), 'utf8'));
const lastOpt = (c) => c.args[c.args.length - 1];
const without = (c, patch) => {
  const args = structuredClone(c.args);
  delete args[args.length - 1].label_mode;
  Object.assign(args[args.length - 1], patch);
  return [c.fn, args];
};
/** the root `div.td-field` class list + the order of its direct label / control / box children */
function shape(html) {
  const root = /<div class="(td-field td-field--[^"]*)"/.exec(html);
  const cls = root ? root[1].split(' ') : [];
  const body = html.slice(root ? root.index : 0);
  const iLabel = body.search(/<label class="td-field__label"/);
  const iControl = body.search(/<(input|textarea)[^>]* class="td-field__control"|<div class="td-field__box"/);
  return { cls, labelAfter: iLabel > iControl && iControl >= 0 };
}
const placeholderOf = (html, id) => {
  const m = new RegExp(`<(?:input|textarea)[^>]* id="${id}"[^>]*>`).exec(html);
  const p = m && /placeholder="([^"]*)"/.exec(m[0]);
  return p ? p[1] : null;
};

describe('php/td.php — v0.58.0 label_mode floating', opts, () => {
  test('without label_mode: byte-identical to v0.57.1 (floating.baseline.json)', () => {
    const out = run(FLOATING_FIXTURES.cases.map((c) => without(c, {})));
    FLOATING_FIXTURES.cases.forEach((c, i) => {
      assert.deepEqual(out[i].warns, [], c.id);
      assert.equal(out[i].html, BASELINE[c.id], `${c.id}: byte-identical`);
    });
  });

  test('label_mode top / unknown / non-string, or no label: byte-identical to v0.57.1', () => {
    const cases = FLOATING_FIXTURES.cases;
    for (const mode of ['top', 'outlined', 'FLOATING', '', true, 1, null]) {
      const out = run(cases.map((c) => without(c, { label_mode: mode })));
      cases.forEach((c, i) => assert.equal(out[i].html, BASELINE[c.id], `${c.id} label_mode=${JSON.stringify(mode)}`));
    }
    const nolabel = cases.map((c) => { const a = structuredClone(c.args); delete a[a.length - 1].label; return [c.fn, a]; });
    const base = run(cases.map((c) => { const a = structuredClone(c.args); delete a[a.length - 1].label; delete a[a.length - 1].label_mode; return [c.fn, a]; }));
    run(nolabel).forEach((o, i) => assert.equal(o.html, base[i].html, `${cases[i].id}: no label → top`));
  });

  test('floating cases: classes, control / box BEFORE the label, placeholder (F1), host label-mode', () => {
    const out = run(FLOATING_FIXTURES.cases.map((c) => [c.fn, c.args]));
    FLOATING_FIXTURES.cases.forEach((c, i) => {
      const { html, warns } = out[i];
      assert.deepEqual(warns, [], c.id);
      const s = shape(html);
      assert.ok(s.cls.includes('td-field--floating'), `${c.id}: ${s.cls}`);
      assert.equal(s.cls.includes('td-field--always-float'), c.always, `${c.id}: always-float`);
      const real = lastOpt(c).placeholder;
      assert.equal(s.cls.includes('td-field--ph-label'), !real, `${c.id}: ph-label`);
      // floating classes come LAST in the root (after size / textarea / affix) and before the site's class tokens
      const fi = s.cls.indexOf('td-field--floating');
      assert.ok(s.cls.slice(fi).every((k) => ['td-field--floating', 'td-field--always-float', 'td-field--ph-label'].includes(k)), `${c.id}: order ${s.cls}`);
      assert.ok(s.labelAfter, `${c.id}: label after the control / box`);
      assert.equal(placeholderOf(html, c.control), c.ph, `${c.id}: placeholder`);
      if (c.tag) {
        assert.match(html, /^<td-input-field [^>]*label-mode="floating"/, `${c.id}: host attribute`);
        // the host carries only the REAL placeholder (the component derives F1 itself)
        const host = /^<td-input-field [^>]*>/.exec(html)[0];
        assert.equal(/ placeholder="/.test(host), !!real, `${c.id}: host placeholder`);
      } else {
        assert.ok(!html.includes('label-mode'), `${c.id}: native has no host`);
      }
    });
  });

  test('affix matrix (Codex plan r1 #2): the 7 affix types take the box + always-float; date family / textarea keep the v0.55 warning', () => {
    const types = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
    for (const element of [false, true]) {
      const out = run(types.map((type) => ['td_field', ['x', '', { element, id: `a-${type}`, type, label: 'L', label_mode: 'floating', suffix: 'đ' }]]));
      out.forEach(({ html, warns }, i) => {
        assert.deepEqual(warns, [], types[i]);
        const s = shape(html);
        assert.ok(s.cls.includes('td-field--affix') && s.cls.includes('td-field--always-float') && s.labelAfter, `${types[i]}: ${s.cls}`);
        assert.ok(/<div class="td-field__box">[\s\S]*<\/div><label class="td-field__label"/.test(html), `${types[i]}: label right after the box`);
      });
    }
    const bad = ['date', 'month', 'datetime-local', 'time', 'textarea'];
    for (const element of [false, true]) {
      const out = run(bad.flatMap((type) => [
        ['td_field', ['x', '', { element, id: `b-${type}`, type, label: 'L', label_mode: 'floating', prefix: 'SECRET' }]],
        ['td_field', ['x', '', { element, id: `b-${type}`, type, label: 'L', label_mode: 'floating' }]],
      ]));
      for (let i = 0; i < out.length; i += 2) {
        const type = bad[i / 2];
        assert.equal(out[i].html, out[i + 1].html, `${type}: same markup as without the affix`);
        assert.equal(out[i].warns.length, 1, type);
        assert.match(out[i].warns[0], /^td_field: prefix/);
        const s = shape(out[i].html);
        assert.ok(!s.cls.includes('td-field--affix'), type);
        assert.equal(s.cls.includes('td-field--always-float'), type !== 'textarea', `${type}: always-float`);
      }
    }
  });

  test('escaping: label and placeholder are text (F1 placeholder = the escaped label)', () => {
    const evil = '<img src=x onerror=alert(1)> & "q"';
    const [f, e] = run([
      ['td_field', ['x', '', { id: 'ev', label: evil, label_mode: 'floating' }]],
      ['td_field', ['x', '', { element: true, id: 'ev2', label: evil, label_mode: 'floating', placeholder: evil }]],
    ]);
    for (const { html } of [f, e]) {
      assert.ok(!/<img/i.test(html), html);
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'), html);
    }
    assert.equal(placeholderOf(f.html, 'ev-control'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
  });

  test('site class tokens stay after the floating classes (native)', () => {
    const [{ html }] = run([['td_field', ['x', '', { id: 'c1', label: 'L', label_mode: 'floating', class: 'my-field' }]]]);
    assert.match(html, /<div class="td-field td-field--md td-field--floating td-field--ph-label my-field" id="c1">/);
  });

  test('test/ssr/fixtures/floating.html is fresh (node test/ssr/build-floating-fixture.mjs)', () => {
    assert.equal(readFileSync(FLOATING_FIXTURE_FILE, 'utf8'), renderFloatingFixture());
  });
});
