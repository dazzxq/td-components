// v0.94.0 (plan v0.94.0-icons-picker §7, §9.3) — PHP side of the SSR contract `icon-picker@1`:
//   - td_icon_value(): the ONE server normalisation of a POSTed icon name (alias → canonical, '' / null → '', unknown /
//     malformed / non-string → null = the site answers 422);
//   - td_icon_picker(): ALWAYS the element + the tree <td-icon-picker> builds + a no-JS hidden input; escaping; suggestions
//     / icons filtered + canonical; the trigger text = the canonical name; aria_label-only → sr-only `{host}-name` span;
//     warnings in the right cases; it never reads src/icons/icons-search.json;
//   - Td::iconSearchData() (192 kit keys + site entries) / Td::registerIconSearchData() (refuses like the JS twin).
// Shared fixtures: test/ssr/icon-picker.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/icon-picker.html — this test fails when it is stale: `node test/ssr/build-icon-picker-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { ICON_PICKER_FIXTURES, ICON_PICKER_FIXTURE_FILE, renderIconPickerFixture } from '../ssr/ssr.mjs';
import { foldSearchText } from '../../src/icons/icon-search-schema.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/**
 * Calls in ONE php process (state kept between calls), each with its own warnings and thrown error message.
 * `fn` = a global function name or `Td::method`.
 * @param {Array<[string, any[]]>} calls
 * @param {string} [kitDir]
 * @returns {Array<{ out: any, warns: string[], error: string|null }>}
 */
function run(calls, kitDir = ROOT) {
  const conf = kitDir === ROOT ? '' : ", ['assets' => 'source']";
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(kitDir)}${conf});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $res = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + ' if ($no === E_USER_WARNING) { $w[] = $msg; return true; } return false; });'
    + " if (str_starts_with($fn, 'Td::')) { $fn = 'TdComponents\\\\' . $fn; }"
    + ' $err = null; $out = null; try { $out = $fn(...$a); } catch (\\Throwable $e) { $err = get_class($e) . \': \' . $e->getMessage(); }'
    + ' restore_error_handler(); $res[] = [\'out\' => $out, \'warns\' => $w, \'error\' => $err]; }'
    + ' echo json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (fn, ...args) => run([[fn, args]])[0];

const ENTRY = { label: 'Biểu tượng riêng', keywords: { en: ['custom'], vi: ['riêng'] } };

describe('php/td.php — td_icon_value / td_icon_picker / icon search data (v0.94.0, contract icon-picker@1)', opts, () => {
  test('the SSR fixture HTML is current (node test/ssr/build-icon-picker-fixture.mjs)', () => {
    assert.equal(readFileSync(ICON_PICKER_FIXTURE_FILE, 'utf8'), renderIconPickerFixture());
  });

  test('td_icon_value: alias → canonical, empty, unknown, malformed, non-string', () => {
    const cases = [
      ['trash', 'trash'], ['x', 'close'], ['chevron-down', 'down'], ['', ''], [null, ''],
      ['site-not-registered', null], ['Trash', null], ['trash ', null], ['<b>', null], ['a'.repeat(65), null],
      [['trash'], null], [5, null], [true, null], [{ v: 'trash' }, null],
    ];
    const out = run(cases.map(([v]) => ['td_icon_value', [v]]));
    cases.forEach(([v, want], i) => assert.equal(out[i].out, want, `td_icon_value(${JSON.stringify(v)})`));
  });

  test('every fixture case: element + marker + the hidden input; expected state printed', () => {
    const out = run(ICON_PICKER_FIXTURES.cases.map((c) => ['td_icon_picker', c.args]));
    ICON_PICKER_FIXTURES.cases.forEach((c, i) => {
      const html = out[i].out;
      assert.match(html, /^<td-icon-picker data-td-ssr="icon-picker@1" /, c.id);
      assert.equal(out[i].warns.length > 0, !!c.warns, `${c.id}: ${out[i].warns.join(' | ')}`);
      assert.ok(html.includes(`data-state="${c.expect.state}"`), c.id);
      const name = c.args[0];
      if (name) {
        const hidden = `<input type="hidden" class="td-icon-picker__native" name="${name}"${c.expect.value ? ` value="${c.expect.value}"` : ''}${c.expect.disabled ? ' disabled' : ''}>`;
        assert.ok(html.includes(hidden), `${c.id}: ${hidden}`);
      } else {
        assert.ok(!html.includes('td-icon-picker__native'), c.id);
      }
      assert.equal(/class="td-icon-picker__clear" aria-label="Xoá icon" hidden>/.test(html), !c.expect.clear, `${c.id} clear`);
      if (c.expect.value) assert.ok(html.includes(` value="${c.expect.value}"`), c.id);
    });
  });

  test('the trigger text is the canonical name (never the search metadata); glyph only for a known icon', () => {
    const { out } = one('td_icon_picker', 'i', { label: 'Icon', value: 'x' });
    assert.ok(out.includes('data-state="value">close</span>'));
    assert.ok(out.includes('<span class="td-icon-picker__glyph" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="close"'));
    assert.ok(!out.includes('Đóng'), 'no VI label');
    const unk = one('td_icon_picker', 'i', { label: 'Icon', value: 'site-later' });
    assert.ok(unk.out.includes('<span class="td-icon-picker__glyph" aria-hidden="true"></span>'));
    assert.ok(unk.out.includes('data-state="unknown">site-later</span>'));
    assert.equal(unk.warns.length, 1);
    assert.match(unk.warns[0], /^td_icon_picker: value is not an icon registered in PHP/);
  });

  test('a malformed value prints empty + one warning (never the value)', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', value: '"><script>' });
    assert.ok(r.out.includes('data-state="empty">Chọn icon</span>'));
    assert.ok(!r.out.includes('script'));
    assert.deepEqual(r.warns, ['td_icon_picker: value is not a valid icon name; printed empty']);
  });

  test('escaping: label / placeholder / aria_label / helper / error / id are text, never markup', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const r = one('td_icon_picker', 'i', { label: evil, placeholder: evil, helper_text: evil, error: evil, id: 'h"x' });
    assert.ok(!r.out.includes('<img'), r.out);
    assert.ok(r.out.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#039;&amp;'));
    assert.ok(r.out.includes('id="h&quot;x"'));
    const a = one('td_icon_picker', 'i', { aria_label: evil });
    assert.ok(!a.out.includes('<img'));
  });

  test('suggestions / icons: canonical, registered only, deduped, suggestions ≤ 24, one warning per option', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', suggestions: ['home', 'x', 'close', 'nope', 'Home', 7], icons: 'trash, x  home bogus' });
    assert.ok(r.out.includes(' suggestions="home close"'), r.out);
    assert.ok(r.out.includes(' icons="trash close home"'));
    assert.deepEqual(r.warns, [
      'td_icon_picker: some suggestions entries were dropped (not a registered icon name)',
      'td_icon_picker: some icons entries were dropped (not a registered icon name)',
    ]);
    const many = Object.keys(JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8')).icons).slice(0, 30);
    const cap = one('td_icon_picker', 'i', { label: 'Icon', suggestions: many });
    const m = cap.out.match(/ suggestions="([^"]*)"/);
    assert.ok(m);
    assert.equal(m[1].split(' ').length, 24);
    const long = one('td_icon_picker', 'i', { label: 'Icon', icons: `home ${'a'.repeat(2048)}` });
    assert.ok(!long.out.includes(' icons='));
    assert.deepEqual(long.warns, ['td_icon_picker: icons is longer than 2048 bytes; ignored']);
    const none = one('td_icon_picker', 'i', { label: 'Icon', suggestions: [], icons: '' });
    assert.ok(!none.out.includes(' suggestions=') && !none.out.includes(' icons='));
    assert.deepEqual(none.warns, []);
  });

  test('accessible name: label → aria-labelledby label + text; aria_label only → sr-only {host}-name span; neither → warn', () => {
    const l = one('td_icon_picker', 'i', { label: 'Icon mục', id: 'h' });
    assert.ok(l.out.includes('<label class="td-icon-picker__label" id="h-label" for="h-trigger">Icon mục</label>'));
    assert.ok(l.out.includes('aria-labelledby="h-label h-text"'));
    assert.ok(!l.out.includes('h-name'));
    const a = one('td_icon_picker', 'i', { aria_label: 'Icon của nút', id: 'h' });
    assert.ok(a.out.includes('aria-labelledby="h-name h-text"'));
    assert.ok(a.out.includes('<span class="td-sr-only" id="h-name">Icon của nút</span>'));
    assert.ok(a.out.includes(' aria-label="Icon của nút"'));
    assert.ok(!a.out.includes('<label'));
    assert.deepEqual(a.warns, []);
    const n = one('td_icon_picker', 'i', { id: 'h' });
    assert.ok(n.out.includes('aria-labelledby="h-text"'));
    assert.deepEqual(n.warns, ['td_icon_picker: give a label or an aria_label (the field has no accessible name)']);
  });

  test('error / helper wiring on the trigger; disabled / readonly lock the trigger, only disabled disables the input', () => {
    const e = one('td_icon_picker', 'i', { label: 'Icon', id: 'h', error: 'Sai', helper_text: 'Gợi ý' });
    assert.ok(e.out.includes('aria-invalid="true" aria-errormessage="h-error" aria-describedby="h-error"'), e.out);
    assert.ok(e.out.includes('<span class="td-field-error" id="h-error" data-for="h">Sai</span>'));
    const h = one('td_icon_picker', 'i', { label: 'Icon', id: 'h', helper_text: 'Gợi ý' });
    assert.ok(h.out.includes('aria-describedby="h-note"'));
    const d = one('td_icon_picker', 'i', { label: 'Icon', id: 'h', value: 'home', disabled: true });
    assert.ok(/aria-labelledby="h-label h-text" disabled>/.test(d.out));
    assert.ok(d.out.includes('name="i" value="home" disabled>'));
    const ro = one('td_icon_picker', 'i', { label: 'Icon', id: 'h', value: 'home', readonly: true });
    assert.ok(/aria-labelledby="h-label h-text" disabled>/.test(ro.out));
    assert.ok(ro.out.includes('name="i" value="home">'));
    assert.ok(ro.out.includes(' readonly>') || ro.out.includes(' readonly '));
    const nc = one('td_icon_picker', 'i', { label: 'Icon', value: 'home', allow_clear: false });
    assert.ok(nc.out.includes(' allow-clear="false"'));
  });

  test('ICON_PICKER_LABELS == the JS static labels (placeholder / clear / none)', () => {
    const php = run([['constant', ['TdComponents\\Td::ICON_PICKER_LABELS']]])[0].out;
    const src = readFileSync(join(ROOT, 'src/form/td-icon-picker.js'), 'utf8');
    const block = src.match(/static labels = \{([\s\S]*?)\n {2}\};/)[1];
    const js = Object.fromEntries([...block.matchAll(/^\s*(\w+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(php, { placeholder: js.placeholder, clear: js.clear, none: js.none });
  });

  // --- v0.96.1: trigger_text / value_label / none_option / none_value (plan v0.96.0-icon-picker §5, §10) ---

  test('v0.96.1 defaults: no new option → no new attribute (markup of 0.94.0)', () => {
    const { out, warns } = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash' });
    for (const a of ['trigger-text', 'value-label', 'none-option', 'none-value']) assert.ok(!out.includes(` ${a}`), a);
    assert.ok(out.includes('data-state="value">trash</span>'));
    assert.deepEqual(warns, []);
    // an unknown trigger_text is the name mode
    const odd = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', trigger_text: 'Label' });
    assert.ok(!odd.out.includes('trigger-text') && odd.out.includes('data-state="value">trash</span>'));
  });

  test('trigger_text=label: the kit label in the trigger AND as value-label; an alias prints the label of the canonical icon', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', trigger_text: 'label' });
    assert.ok(r.out.includes(' trigger-text="label"') && r.out.includes(' value-label="Thùng rác"'), r.out);
    assert.ok(r.out.includes('data-state="value">Thùng rác</span>'));
    assert.deepEqual(r.warns, []);
    const alias = one('td_icon_picker', 'i', { label: 'Icon', value: 'x', trigger_text: 'label' });
    assert.ok(alias.out.includes(' value="close"') && alias.out.includes('data-state="value">Đóng</span>'), alias.out);
    // empty / unknown states are not touched
    const empty = one('td_icon_picker', 'i', { label: 'Icon', trigger_text: 'label' });
    assert.ok(empty.out.includes('data-state="empty">Chọn icon</span>') && !empty.out.includes('value-label'));
    const unk = one('td_icon_picker', 'i', { label: 'Icon', value: 'site-later', trigger_text: 'label' });
    assert.ok(unk.out.includes('data-state="unknown">site-later</span>') && !unk.out.includes('value-label'));
  });

  test('trigger_text=label: value_label wins; an invalid one is dropped with a warning; the site metadata is used; no label → the name', () => {
    const win = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', trigger_text: 'label', value_label: 'Xoá hẳn' });
    assert.ok(win.out.includes(' value-label="Xoá hẳn"') && win.out.includes('data-state="value">Xoá hẳn</span>'));
    for (const bad of ['', ' x', 'x ', 'a'.repeat(49), "a\nb", 7, ['x']]) {
      const r = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', trigger_text: 'label', value_label: bad });
      assert.ok(r.out.includes('data-state="value">Thùng rác</span>'), JSON.stringify(bad));
      assert.equal(r.warns.length, 1, JSON.stringify(bad));
      assert.match(r.warns[0], /^td_icon_picker: value_label is not a valid text/);
    }
    const [reg, site, noLabel] = run([
      ['Td::registerIcons', [{ 'site-lbl': { nodes: [['path', { d: 'M1 1h2' }]] }, 'site-nolbl': { nodes: [['path', { d: 'M1 1h2' }]] } }]],
      ['Td::registerIconSearchData', [{ 'site-lbl': ENTRY }]],
      ['td_icon_picker', ['i', { label: 'Icon', value: 'site-nolbl', trigger_text: 'label' }]],
    ]);
    assert.equal(reg.error, null, reg.error);
    assert.equal(site.error, null, site.error);
    assert.ok(noLabel.out.includes('data-state="value">site-nolbl</span>') && !noLabel.out.includes('value-label'));
    const [r1, r2, r3] = run([
      ['Td::registerIcons', [{ 'site-lbl': { nodes: [['path', { d: 'M1 1h2' }]] } }]],
      ['Td::registerIconSearchData', [{ 'site-lbl': ENTRY }]],
      ['td_icon_picker', ['i', { label: 'Icon', value: 'site-lbl', trigger_text: 'label' }]],
    ]);
    assert.equal(r1.error, null);
    assert.equal(r2.error, null);
    assert.ok(r3.out.includes(' value-label="Biểu tượng riêng"') && r3.out.includes('data-state="value">Biểu tượng riêng</span>'), r3.out);
  });

  test('trigger_text=label: the label is text, never markup', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', trigger_text: 'label', value_label: '<img src=x onerror=alert(1)>' });
    assert.ok(!r.out.includes('<img'), r.out);
    assert.ok(r.out.includes(' value-label="&lt;img src=x onerror=alert(1)&gt;"'));
    assert.ok(r.out.includes('data-state="value">&lt;img src=x onerror=alert(1)&gt;</span>'));
  });

  test('none_option prints the attribute only; the kit metadata is not read without trigger_text=label', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', none_option: true });
    assert.ok(r.out.includes(' none-option>'), r.out);
    assert.ok(!r.out.includes('none-value'));
    const off = one('td_icon_picker', 'i', { label: 'Icon', none_option: false });
    assert.ok(!off.out.includes('none-option'));
    const dir = mkdtempSync(join(tmpdir(), 'td-nometa-'));
    try {
      // a kit dir WITHOUT icons-search.json: label mode warns about it, name mode never touches it
      mkdirSync(join(dir, 'src/icons'), { recursive: true });
      copyFileSync(join(ROOT, 'src/icons/icons.json'), join(dir, 'src/icons/icons.json'));
      const plain = run([['td_icon_picker', ['i', { label: 'Icon', value: 'trash' }]]], dir)[0];
      assert.deepEqual(plain.warns, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('none_value: a valid word → attribute + state none (icon ban + "Không icon"); value ≠ it → normal state', () => {
    const r = one('td_icon_picker', 'i', { label: 'Icon', value: 'none', none_option: true, none_value: 'none' });
    assert.deepEqual(r.warns, []);
    assert.ok(r.out.includes(' none-option none-value="none"'), r.out);
    assert.ok(r.out.includes(' value="none"'));
    assert.ok(r.out.includes('<span class="td-icon-picker__glyph" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="ban"'));
    assert.ok(r.out.includes('data-state="none">Không icon</span>'));
    assert.ok(r.out.includes('name="i" value="none">'));
    assert.ok(!/class="td-icon-picker__clear"[^>]* hidden>/.test(r.out), 'the clear button shows on a none value');
    const other = one('td_icon_picker', 'i', { label: 'Icon', value: 'trash', none_value: 'none' });
    assert.ok(other.out.includes('data-state="value">trash</span>') && other.out.includes(' none-value="none"'));
    const empty = one('td_icon_picker', 'i', { label: 'Icon', none_value: 'none' });
    assert.ok(empty.out.includes('data-state="empty">Chọn icon</span>'));
    // required: the clear button stays hidden
    const req = one('td_icon_picker', 'i', { label: 'Icon', value: 'none', none_value: 'none', required: true });
    assert.ok(/class="td-icon-picker__clear"[^>]* hidden>/.test(req.out));
  });

  test('none_value: a bad / registered name is dropped with one warning (behaves as the empty none value)', () => {
    for (const nv of ['Bad!', 'trash', 'x', '1abc', 'a'.repeat(49), 5, ['none']]) {
      const r = one('td_icon_picker', 'i', { label: 'Icon', value: 'none', none_value: nv });
      assert.ok(!r.out.includes('none-value'), JSON.stringify(nv));
      assert.equal(r.warns.length, 2, `${JSON.stringify(nv)}: ${r.warns.join(' | ')}`); // none_value, then value "none" unknown
      assert.match(r.warns[0], /^td_icon_picker: none_value is /);
      assert.ok(r.out.includes('data-state="unknown">none</span>'));
    }
    assert.ok(one('td_icon_picker', 'i', { label: 'Icon', none_value: 'a'.repeat(48) }).out.includes(` none-value="${'a'.repeat(48)}"`));
    assert.deepEqual(one('td_icon_picker', 'i', { label: 'Icon', none_value: '' }).warns, []);
    assert.deepEqual(one('td_icon_picker', 'i', { label: 'Icon', none_value: null }).warns, []);
  });

  test('td_icon_value with none_value: the word is valid only with the option; the rest is as before', () => {
    const calls = [
      ['td_icon_value', ['none', { none_value: 'none' }]],
      ['td_icon_value', ['none']],
      ['td_icon_value', ['none', { none_value: 'other' }]],
      ['td_icon_value', ['trash', { none_value: 'none' }]],
      ['td_icon_value', ['x', { none_value: 'none' }]],
      ['td_icon_value', ['', { none_value: 'none' }]],
      ['td_icon_value', [null, { none_value: 'none' }]],
      ['td_icon_value', ['none', { none_value: 'trash' }]], // a registered name is no none value
      ['td_icon_value', ['none', { none_value: 'Bad!' }]],
      ['td_icon_value', [['none'], { none_value: 'none' }]],
      ['td_icon_value', ['None', { none_value: 'none' }]],
    ];
    const out = run(calls);
    assert.deepEqual(out.map((r) => r.out), ['none', null, null, 'trash', 'close', '', '', null, null, null, null]);
    assert.deepEqual(out[0].warns, []);
    assert.equal(out[7].warns.length, 1);
    assert.match(out[7].warns[0], /^td_icon_value: none_value is a registered icon name/);
    assert.equal(out[8].warns.length, 1);
  });

  test('Td::iconSearchData(): 192 kit keys = icons.json; site entries merged after registerIconSearchData()', () => {
    const icons = Object.keys(JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8')).icons);
    const [kit, reg, merged] = run([
      ['Td::iconSearchData', []],
      ['Td::registerIconSearchData', [{ 'site-custom': ENTRY }]],
      ['Td::iconSearchData', []],
    ]);
    assert.equal(Object.keys(kit.out).length, 192);
    assert.deepEqual(Object.keys(kit.out).sort(), [...icons].sort());
    assert.equal(reg.error, null);
    assert.deepEqual(merged.out['site-custom'], ENTRY);
    assert.equal(Object.keys(merged.out).length, 193);
  });

  test('Td::registerIconSearchData() refuses like the JS twin, all or nothing', () => {
    const bad = [
      [{ trash: ENTRY }, /is a core icon/],
      [{ 'Bad Name': ENTRY }, /invalid icon name/],
      [{ 'site-a': { ...ENTRY, extra: 1 } }, /unknown key "extra"/],
      [{ 'site-a': { label: 'x' } }, /missing "keywords"/],
      [{ 'site-a': { ...ENTRY, label: '' } }, /./],
      [{ 'site-a': { ...ENTRY, label: ' x' } }, /./],
      [{ 'site-a': { ...ENTRY, label: 'a'.repeat(49) } }, /./],
      [{ 'site-a': { ...ENTRY, label: 'a\u0007' } }, /./],
      [{ 'site-a': { ...ENTRY, keywords: { en: [], vi: ['x'] } } }, /./],
      [{ 'site-a': { ...ENTRY, keywords: { en: Array.from({ length: 13 }, (_, i) => `k${i}`), vi: ['x'] } } }, /./],
      [{ 'site-a': { ...ENTRY, keywords: { en: ['Xoá', 'xoa'], vi: ['x'] } } }, /./],
      [{ 'site-a': { ...ENTRY, keywords: { en: [5], vi: ['x'] } } }, /./],
    ];
    const out = run(bad.map(([defs]) => ['Td::registerIconSearchData', [defs]]));
    bad.forEach(([defs, re], i) => {
      assert.ok(out[i].error && out[i].error.startsWith('InvalidArgumentException: '), `${JSON.stringify(defs)} → ${out[i].error}`);
      assert.match(out[i].error, re);
    });
    // duplicates + all or nothing
    const [first, again, batch, data] = run([
      ['Td::registerIconSearchData', [{ 'site-a': ENTRY }]],
      ['Td::registerIconSearchData', [{ 'site-a': ENTRY }]],
      ['Td::registerIconSearchData', [{ 'site-b': ENTRY, trash: ENTRY }]],
      ['Td::iconSearchData', []],
    ]);
    assert.equal(first.error, null);
    assert.match(again.error, /already has search metadata/);
    assert.match(batch.error, /is a core icon/);
    assert.ok(!('site-b' in data.out), 'nothing of a refused batch is kept');
    // built in PHP: 2001 entries as one -r argument exceed Linux's 128 KiB per-argument limit (spawn E2BIG on CI)
    const [manyErr] = php(" $e = ['label' => 'A', 'keywords' => ['en' => ['a'], 'vi' => ['b']]]; $m = [];"
      + " for ($i = 0; $i < 2001; $i++) { $m['site-' . $i] = $e; }"
      + " try { TdComponents\\Td::registerIconSearchData($m); $r = null; } catch (\\InvalidArgumentException $x) { $r = $x->getMessage(); } echo json_encode([$r]);");
    assert.match(manyErr, /at most 2000 entries/);
  });

  test('Td::icon() and td_icon_picker() never read icons-search.json (kit copy without it: no warning; iconSearchData warns)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'td-icon-kit-'));
    try {
      mkdirSync(join(dir, 'src/icons'), { recursive: true });
      copyFileSync(join(ROOT, 'src/icons/icons.json'), join(dir, 'src/icons/icons.json'));
      copyFileSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
      const [icon, picker, data] = run([
        ['Td::icon', ['align-none']],
        ['td_icon_picker', ['i', { label: 'Icon', value: 'trash', suggestions: 'home x' }]],
        ['Td::iconSearchData', []],
      ], dir);
      assert.match(icon.out, /data-icon="align-none"/);
      assert.match(icon.out, /fill="currentColor"/);
      assert.deepEqual(icon.warns, []);
      assert.deepEqual(picker.warns, []);
      assert.ok(picker.out.includes(' suggestions="home close"'));
      assert.deepEqual(data.out, []);
      assert.equal(data.warns.length, 1);
      assert.match(data.warns[0], /^Td::iconSearchData: src\/icons\/icons-search\.json could not be read/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // --- Codex impl review (v0.94.0) ---

  /** a kit copy (icons.json + package.json) with `search` written as src/icons/icons-search.json */
  function kitWith(search) {
    const dir = mkdtempSync(join(tmpdir(), 'td-icon-kit-'));
    mkdirSync(join(dir, 'src/icons'), { recursive: true });
    copyFileSync(join(ROOT, 'src/icons/icons.json'), join(dir, 'src/icons/icons.json'));
    copyFileSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
    writeFileSync(join(dir, 'src/icons/icons-search.json'), typeof search === 'string' ? search : JSON.stringify(search));
    return dir;
  }

  test('Td::iconSearchData(): the whole kit file is validated — any broken / partial file → [] + ONE warning (nothing partial kept)', () => {
    const good = JSON.parse(readFileSync(join(ROOT, 'src/icons/icons-search.json'), 'utf8'));
    const names = Object.keys(good.icons);
    const without = (n) => Object.fromEntries(Object.entries(good.icons).filter(([k]) => k !== n));
    const variants = [
      ['wrong $schema', { ...good, $schema: 'td-icons-search/2' }, /"\$schema" must be/],
      ['no $schema', { icons: good.icons }, /"\$schema" must be/],
      ['icons a list', { ...good, icons: ['trash'] }, /no "icons" object/],
      ['one icon missing', { ...good, icons: without(names[0]) }, /exactly the 192 kit icons, got 191/],
      ['an extra icon', { ...good, icons: { ...good.icons, 'site-extra': good.icons[names[0]] } }, /exactly the 192 kit icons, got 193/],
      ['a non-kit name instead of a kit one', { ...good, icons: { ...without(names[0]), 'site-extra': good.icons[names[0]] } }, /"site-extra" is not a kit icon/],
      ['the LAST entry invalid', { ...good, icons: { ...good.icons, [names.at(-1)]: { label: '', keywords: { en: ['a'], vi: ['b'] } } } }, /1–48 characters/],
      ['an entry with an extra key', { ...good, icons: { ...good.icons, [names[1]]: { ...good.icons[names[1]], extra: 1 } } }, /unknown key "extra"/],
      ['not JSON', '{"$schema": ', /Syntax|syntax/],
    ];
    for (const [what, search, re] of variants) {
      const dir = kitWith(search);
      try {
        const [first, second] = run([['Td::iconSearchData', []], ['Td::iconSearchData', []]], dir);
        assert.deepEqual(first.out, [], what);
        assert.equal(first.warns.length, 1, what);
        assert.match(first.warns[0], /^Td::iconSearchData: src\/icons\/icons-search\.json could not be read/, what);
        assert.match(first.warns[0], re, what);
        assert.deepEqual(second.out, [], `${what}: cached`);
        assert.deepEqual(second.warns, [], `${what}: warned once`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    // the untouched copy passes (control)
    const dir = kitWith(good);
    try {
      const [ok] = run([['Td::iconSearchData', []]], dir);
      assert.deepEqual(ok.warns, []);
      assert.equal(Object.keys(ok.out).length, 192);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** raw PHP after configure(); `noIntl` → the ext-intl fallbacks forced on (private flag through Reflection) */
  function php(body, { noIntl = false } = {}) {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
      + (noIntl ? " $rp = new ReflectionProperty(TdComponents\\Td::class, 'noIntl'); if (PHP_VERSION_ID < 80100) { $rp->setAccessible(true); } $rp->setValue(null, true);" : '')
      + body;
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8', input: '' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '', r.stderr);
    return JSON.parse(r.stdout);
  }

  const VI_STRINGS = [
    'Thùng rác', 'ĐĂNG NHẬP', 'Đăng_nhập', 'Hà Nội', 'Người dùng', 'Cài đặt', 'Tải lên', 'Xoá', 'Xóa', 'Ảnh', 'Ổ cứng',
    'Thư mục', 'Bộ lọc', 'Mũi tên-trái', 'Ỹ ỳ ý ỷ ỵ', 'ƯỚC LƯỢNG', 'Quỹ tiền', 'Biểu đồ', 'Ghi chú', 'Lịch',
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ',
    '  Thùng-rác__Đỏ  ', 'abc DEF-ghi', 'Xoá', // the last one decomposed (marks dropped on both sides)
  ];

  for (const noIntl of [false, true]) {
    test(`Td::foldSearchText() = JS foldSearchText() for Vietnamese + ASCII (${noIntl ? 'WITHOUT intl: VI_FOLD fallback' : 'intl path'})`, () => {
      const out = php(` echo json_encode(array_map([TdComponents\\Td::class, 'foldSearchText'], json_decode(${JSON.stringify(JSON.stringify(VI_STRINGS))}, true)), JSON_UNESCAPED_UNICODE);`, { noIntl });
      VI_STRINGS.forEach((v, i) => assert.equal(out[i], foldSearchText(v), JSON.stringify(v)));
    });
  }

  test('NFC rule without intl: any combining mark refused (precomposed Vietnamese accepted); with intl: Normalizer', () => {
    const texts = ['Thùng rác', 'Xoá', 'x́'];
    const body = ` $r = []; foreach (json_decode(${JSON.stringify(JSON.stringify(texts))}, true) as $i => $t) {`
      + " try { TdComponents\\Td::registerIconSearchData(['site-n' . $i => ['label' => $t, 'keywords' => ['en' => ['a'], 'vi' => ['b']]]]); $r[] = null; }"
      + ' catch (\\InvalidArgumentException $e) { $r[] = $e->getMessage(); } } echo json_encode($r, JSON_UNESCAPED_UNICODE);';
    const fallback = php(body, { noIntl: true });
    assert.equal(fallback[0], null);
    assert.match(fallback[1], /must be NFC/);
    assert.match(fallback[2], /must be NFC/); // stricter than JS (NFC there): documented limitation
    const intl = php(body);
    assert.equal(intl[0], null);
    assert.match(intl[1], /must be NFC/);
    if (intl[2] === null) assert.notEqual(fallback[2], intl[2], 'the noIntl flag really switched the path');
  });

  test('security: nested entry / keywords arrays with 200k extra (string or numeric) keys are refused early', () => {
    const [a, b, c] = php(" $m = []; $str = []; for ($i = 0; $i < 200000; $i++) { $str['x' . $i] = 1; } $num = range(0, 199999);"
      + " foreach ([$str + ['label' => 'A', 'keywords' => ['en' => ['a'], 'vi' => ['b']]], ['label' => 'A', 'keywords' => $str + ['en' => ['a'], 'vi' => ['b']]], ['label' => 'A', 'keywords' => $num]] as $e) {"
      + " try { TdComponents\\Td::registerIconSearchData(['site-nest' => $e]); $m[] = null; } catch (\\InvalidArgumentException $x) { $m[] = $x->getMessage(); } }"
      + ' echo json_encode($m);');
    assert.match(a, /unknown key "x0"/);
    assert.match(b, /unknown key "x0"/);
    assert.match(c, /must be an object/);
  });

  test('security: a multi-MB label / keyword is refused by the byte guard before any regex, fast', () => {
    const [ms, label, kw] = php(" $big = str_repeat('ả', 2 * 1024 * 1024); $t = hrtime(true); $m = [];"
      + " foreach ([['label' => $big, 'keywords' => ['en' => ['a'], 'vi' => ['b']]], ['label' => 'A', 'keywords' => ['en' => [$big], 'vi' => ['b']]]] as $e) {"
      + " try { TdComponents\\Td::registerIconSearchData(['site-big' => $e]); $m[] = null; } catch (\\InvalidArgumentException $x) { $m[] = $x->getMessage(); } }"
      + ' echo json_encode([(hrtime(true) - $t) / 1e6, $m[0], $m[1]]);');
    assert.match(label, /label must be 1–48 characters/);
    assert.match(kw, /keywords\.en\[0\] must be 1–48 characters/);
    assert.ok(ms < 200, `${ms} ms`);
    // 48 four-byte code points (192 bytes) still pass the guard
    const [okMsg] = php(" $m = []; try { TdComponents\\Td::registerIconSearchData(['site-emoji' => ['label' => str_repeat('😀', 48), 'keywords' => ['en' => ['a'], 'vi' => ['b']]]]); $m[] = null; } catch (\\InvalidArgumentException $x) { $m[] = $x->getMessage(); } echo json_encode($m);");
    assert.equal(okMsg, null);
  });
});
