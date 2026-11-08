// v0.105.0 (plan v0.105.0-avatar §QĐ5): PHP td_avatar() + Td::avatarInitial() (shared cases with JS avatarInitial()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, ROOT, PHP_BIN, runPhp } from './php.mjs';
import { AVATAR_INITIAL_CASES } from '../../src/display/avatar-cases.fixture.js';

const skip = !HAS_PHP && 'php >= 8.0 CLI not found';
const out = (calls) => runPhp(calls).map((r) => { if (r.error) throw new Error(r.message); return r.out; });

/** raw PHP; flags → private Td statics forced true through Reflection (noIntl). */
function php(body, flags = []) {
  const set = flags.map((f) => ` $rp = new ReflectionProperty(TdComponents\\Td::class, '${f}'); if (PHP_VERSION_ID < 80100) { $rp->setAccessible(true); } $rp->setValue(null, true);`).join('');
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))};${set}${body}`;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'error_reporting=E_ALL', '-r', code], { encoding: 'utf8', input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const initials = (names, flags) => php(` echo json_encode(array_map([TdComponents\\Td::class, 'avatarInitial'], json_decode(${JSON.stringify(JSON.stringify(names))}, true)), JSON_UNESCAPED_UNICODE);`, flags);

test('td_avatar: image markup per size, unknown size → m', { skip }, () => {
  const [m, xs, sm, lg, bad] = out([
    { fn: 'td_avatar', args: ['https://cdn.test/a.jpg', 'An'] },
    { fn: 'td_avatar', args: ['https://cdn.test/a.jpg', 'An', 'xs'] },
    { fn: 'td_avatar', args: ['/u/a.jpg', 'An', 'sm'] },
    { fn: 'td_avatar', args: ['https://cdn.test/a.jpg', 'An', 'lg'] },
    { fn: 'td_avatar', args: ['https://cdn.test/a.jpg', 'An', 'huge'] },
  ]);
  assert.equal(m, '<img class="td-avatar" src="https://cdn.test/a.jpg" alt="" width="40" height="40" loading="lazy" decoding="async">');
  assert.ok(xs.startsWith('<img class="td-avatar td-avatar--xs" ') && xs.includes('width="22" height="22"'), xs);
  assert.ok(sm.includes('class="td-avatar td-avatar--sm" src="/u/a.jpg"') && sm.includes('width="32"'), sm);
  assert.ok(lg.includes('td-avatar--lg') && lg.includes('height="96"'), lg);
  assert.equal(bad, m);
});

test('td_avatar: no / refused src → the initial span; text and src escaped', { skip }, () => {
  const [none, empty, js, data, mail, esc, src] = out([
    { fn: 'td_avatar', args: [null, 'đức', 'sm'] },
    { fn: 'td_avatar', args: ['', ''] },
    { fn: 'td_avatar', args: ['javascript:alert(1)', 'An'] },
    { fn: 'td_avatar', args: ['data:image/png;base64,AAAA', 'An'] },
    { fn: 'td_avatar', args: ['mailto:a@b.c', 'An'] },
    { fn: 'td_avatar', args: [null, '<script>'] },
    { fn: 'td_avatar', args: ['https://cdn.test/a".jpg?x=<b>', 'An'] },
  ]);
  assert.equal(none, '<span class="td-avatar td-avatar--sm td-avatar--empty" aria-hidden="true">Đ</span>');
  assert.equal(empty, '<span class="td-avatar td-avatar--empty" aria-hidden="true">?</span>');
  for (const s of [js, data, mail]) assert.equal(s, '<span class="td-avatar td-avatar--empty" aria-hidden="true">A</span>');
  assert.equal(esc, '<span class="td-avatar td-avatar--empty" aria-hidden="true">&lt;</span>');
  assert.ok(!src.includes('".jpg') && !src.includes('<b>'), src);
});

for (const flags of [[], ['noIntl']]) {
  test(`Td::avatarInitial(): shared JS cases (${flags.length ? 'WITHOUT intl: table path' : 'intl path'})`, { skip }, () => {
    assert.deepEqual(initials(AVATAR_INITIAL_CASES.map(([n]) => n), flags), AVATAR_INITIAL_CASES.map(([, e]) => e));
  });
}

test('Td::avatarInitial(): bare path (no intl) = ASCII + Vietnamese table by code point; others unchanged; bad UTF-8 → ?', { skip }, () => {
  assert.deepEqual(initials(['émile', 'ñu', 'ỷ', 'zed'], ['noIntl']), ['É', 'ñ', 'Ỷ', 'Z']);
  assert.equal(php(' echo json_encode(TdComponents\\Td::avatarInitial("\\xff\\xfe"));'), '?');
});
