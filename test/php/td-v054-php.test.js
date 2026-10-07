// v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 3, 10–12, Codex plan-review r2 #13) — PHP side:
//   - `helper_text` on every td_* form helper: host `helper-text`, the note (`div.td-field__note#{host}-note`; media keep
//     their `-help` span), the control's aria-describedby — the note hidden + out of the description while an error shows;
//   - WITHOUT helper_text (and on_text / off_text) the markup is byte-identical to v0.53.1 (test/ssr/hint.baseline.json,
//     printed by the v0.53.1 php/td.php for the same calls);
//   - td_toggle on_text / off_text: forces element mode, the state wrapper in the label, the state ids NEVER wired into
//     aria-describedby (no-JS would leave a contradicting description), the tone default status dropped;
//   - td_checkbox / td_toggle helper_text force element mode;
//   - td_hint: text escaped, markup only through Td::html(), id {for}-hint, owned names reserved, empty for → '' + warning;
//   - test/ssr/fixtures/hint.html is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { HINT_FIXTURES, HINT_FIXTURE_FILE, SSR_DIR, renderHintFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Calls in ONE php process; each returns { html, warns } (td_ warnings captured). `['td_hint_trusted', [for, markup]]`. */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as [$fn, $a]) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_')) { $w[] = $msg; return true; } return false; });"
    + " $html = $fn === 'td_hint_trusted' ? td_hint($a[0], TdComponents\\Td::html($a[1]), $a[2] ?? []) : $fn(...$a);"
    + ' restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const noSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '');
const BASELINE = JSON.parse(readFileSync(join(SSR_DIR, 'hint.baseline.json'), 'utf8'));
const textOf = (c) => c.text ?? c.args[c.args.length - 1].helper_text;
const noteId = (c) => c.note ?? `${c.host}-note`;
/** every aria-describedby token list of the markup */
const describedLists = (html) => [...html.matchAll(/aria-describedby="([^"]*)"/g)].map((m) => m[1].split(' '));

describe('php/td.php — helper_text on every form helper (v0.54.0)', opts, () => {
  test('without helper_text / hint / on_text / off_text: byte-identical to v0.53.1 (hint.baseline.json)', () => {
    const calls = HINT_FIXTURES.cases.map((c) => {
      const args = structuredClone(c.args);
      const o = args[args.length - 1];
      for (const k of ['helper_text', 'hint', 'on_text', 'off_text']) delete o[k];
      return [c.fn, args];
    });
    const out = run(calls);
    HINT_FIXTURES.cases.forEach((c, i) => assert.equal(out[i].html, BASELINE[c.id], `${c.id}: byte-identical`));
  });

  test('host helper-text + the note (text, escaped) + the description; hidden and out of the description with an error', () => {
    const cases = HINT_FIXTURES.cases.filter((c) => !c.noHelp);
    const out = run(cases.map((c) => [c.fn, c.args]));
    cases.forEach((c, i) => {
      const { html, warns } = out[i];
      assert.deepEqual(warns, [], c.id);
      const t = textOf(c);
      assert.ok(html.startsWith(`<${c.tag}`), `${c.id}: host tag`);
      assert.ok(new RegExp(`^<${c.tag}[^>]* helper-text="${t}"`).test(html), `${c.id}: host helper-text`);
      const media = !!c.note;
      const note = media
        ? new RegExp(`<span class="td-media-(field|gallery)__help" id="${noteId(c)}"${c.error ? ' hidden' : ''}>${t}</span>`)
        : new RegExp(`<div class="td-field__note" id="${noteId(c)}"${c.error ? ' hidden' : ''}>${t}</div>`);
      assert.ok(note.test(html), `${c.id}: the note\n${noSvg(html)}`);
      assert.equal((html.match(new RegExp(` id="${noteId(c)}"`, 'g')) || []).length, 1, `${c.id}: one note`);
      const lists = describedLists(html);
      if (c.error) {
        assert.ok(lists.every((l) => !l.includes(noteId(c))), `${c.id}: the note out of every description with an error`);
      } else if (c.tag !== 'td-check-matrix') { // check-matrix: the component puts the id on the live cell (QĐ 3b)
        assert.ok(lists.some((l) => l.includes(noteId(c))), `${c.id}: the note in the control's description`);
      }
    });
  });

  test('helper_text wins over the historical hint alias (td_field / td_number_input)', () => {
    const [a, b] = run([
      ['td_field', ['x', '', { element: true, id: 'al', helper_text: 'Mới', hint: 'Cũ' }]],
      ['td_number_input', ['y', null, { id: 'nb', helper_text: 'Mới', hint: 'Cũ' }]],
    ]);
    assert.ok(a.html.includes('>Mới</div>') && !a.html.includes('Cũ'), a.html);
    assert.ok(b.html.includes('>Mới</div>') && !b.html.includes('Cũ'), b.html);
  });

  test('helper_text is text: escaped everywhere (host attribute, note)', () => {
    const payload = '<img src=x onerror=alert(1)> & "q"';
    const out = run([
      ['td_dropdown', ['a', { 1: 'A' }, '', { id: 'x1', helper_text: payload }]],
      ['td_checkbox', ['b', false, 'B', { id: 'x2', helper_text: payload }]],
      ['td_check_matrix', ['c', [{ key: 'a', label: 'A' }], [{ key: 'r', label: 'R' }], [], { id: 'x3', helper_text: payload }]],
    ]);
    for (const { html } of out) {
      assert.ok(!/<img/i.test(html), html);
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'), html);
    }
  });

  test('td_toggle / td_checkbox: helper_text (and on_text / off_text) force element mode, even with element => false', () => {
    const out = run([
      ['td_toggle', ['a', false, 'A', { helper_text: 'h', element: false }]],
      ['td_toggle', ['b', false, 'B', { on_text: 'Bật' }]],
      ['td_toggle', ['c', false, 'C', { off_text: 'Tắt' }]],
      ['td_checkbox', ['d', false, 'D', { helper_text: 'h', element: false }]],
      ['td_checkbox', ['e', false, 'E', {}]],
    ]);
    assert.ok(out.slice(0, 4).every((r) => r.html.startsWith('<td-')), 'element mode');
    assert.ok(out[4].html.startsWith('<label class="td-checkbox'), 'native as before');
  });

  test('td_toggle on_text / off_text: the state wrapper closes the label, ids from the host, NEVER in aria-describedby (no-JS)', () => {
    const [r] = run([['td_toggle', ['arc', true, 'Lưu trữ', { id: 'ar', on_text: 'Đang dùng', off_text: 'Đã lưu trữ', helper_text: 'Ẩn khỏi danh sách' }]]]);
    const html = noSvg(r.html);
    assert.ok(html.includes('<span class="td-switch__label">Lưu trữ</span><span class="td-switch__state" aria-hidden="true">'
      + '<span class="td-switch__state-on" id="ar-host-on">Đang dùng</span><span class="td-switch__state-off" id="ar-host-off">Đã lưu trữ</span>'
      + '</span></label>'), html);
    assert.ok(html.includes(' on-text="Đang dùng" off-text="Đã lưu trữ" helper-text="Ẩn khỏi danh sách"'), html);
    const desc = describedLists(html).flat();
    assert.ok(!desc.includes('ar-host-on') && !desc.includes('ar-host-off'), `state ids never wired: ${desc}`);
    assert.ok(desc.includes('ar-host-note'), 'the helper note is');
    assert.ok(html.endsWith('<div class="td-field__note" id="ar-host-note">Ẩn khỏi danh sách</div></td-toggle>'), html);
  });

  test('td_toggle on_text drops the tone default status text; an explicit status_text stays; 200-code-point cut', () => {
    const [a, b, c] = run([
      ['td_toggle', ['a', true, 'A', { id: 'ta', tone: 'success', on_text: 'Bật' }]],
      ['td_toggle', ['b', true, 'B', { id: 'tb', tone: 'success', on_text: 'Bật', status_text: 'Đã xác minh' }]],
      ['td_toggle', ['c', true, 'C', { id: 'tc', on_text: 'x'.repeat(250) }]],
    ]);
    assert.ok(!a.html.includes('td-switch__status'), a.html);
    assert.ok(b.html.includes('<span class="td-switch__status td-sr-only" id="tb-host-status">Đã xác minh</span>'), b.html);
    assert.ok(c.html.includes(`id="tc-host-on">${'x'.repeat(200)}</span>`), c.html);
  });

  test('owned names reserved in attrs: helper-text / on-text / off-text never come from attrs', () => {
    const out = run([
      ['td_toggle', ['a', false, 'A', { id: 'r1', on_text: 'B', attrs: { 'helper-text': 'evil', 'ON-TEXT': 'evil', 'off-text': 'evil' } }]],
      ['td_dropdown', ['b', { 1: 'A' }, '', { id: 'r2', element: true, attrs: { 'helper-text': 'evil' } }]],
      ['td_check_matrix', ['c', [{ key: 'a', label: 'A' }], [{ key: 'r', label: 'R' }], [], { id: 'r3', attrs: { 'helper-text': 'evil' } }]],
    ]);
    for (const { html } of out) assert.ok(!html.includes('evil'), html);
  });
});

describe('php/td.php — td_hint (v0.54.0)', opts, () => {
  test('text escaped, id {for}-hint; Td::html() markup verbatim; id / class / attrs; reserved names', () => {
    const [a, b, c] = run([
      ['td_hint', ['tax', 'Xem <b>quy định</b> & "mẫu"']],
      ['td_hint_trusted', ['tax2', 'Xem <a href="/q">quy định</a>, mã <code>A-1</code>']],
      ['td_hint', ['tax3', 'Chữ', { id: 'own', class: 'a b', attrs: { 'data-x': '1', for: 'evil', ID: 'evil', 'data-td-y': 'evil', onclick: 'evil' } }]],
    ]);
    assert.equal(a.html, '<td-hint for="tax" id="tax-hint">Xem &lt;b&gt;quy định&lt;/b&gt; &amp; &quot;mẫu&quot;</td-hint>');
    assert.equal(b.html, '<td-hint for="tax2" id="tax2-hint">Xem <a href="/q">quy định</a>, mã <code>A-1</code></td-hint>');
    assert.equal(c.html, '<td-hint for="tax3" id="own" class="a b" data-x="1">Chữ</td-hint>');
  });

  test('an empty / whitespace for → nothing printed + one fixed warning', () => {
    const out = run([['td_hint', ['', 'x']], ['td_hint', ['a b', 'x']]]);
    for (const r of out) {
      assert.equal(r.html, '');
      assert.equal(r.warns.length, 1);
      assert.match(r.warns[0], /^td_hint: \$for must be/);
    }
  });

  test('test/ssr/fixtures/hint.html is up to date (node test/ssr/build-hint-fixture.mjs)', () => {
    assert.equal(readFileSync(HINT_FIXTURE_FILE, 'utf8'), renderHintFixture(), 'stale fixture: run `node test/ssr/build-hint-fixture.mjs`');
  });
});
