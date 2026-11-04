// v0.96.0 td_page_actions() (plan docs/internal/plans/v0.96.0-action-fold.md §6.7 / §10.5): marker contract
// page-actions@1, primary printed last, null skipped, > 1 primary → one warning, rejected href → button + warning,
// `_blank` rel, the site's `data-td-*` dropped, label escaped; kit markers on the DIRECT child — the <td-button> host in
// element mode (the control keeps no data-td-*), the <button> / <a> itself otherwise.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT, runPhp } from './php.mjs';

const BASE = { baseUrl: '/vendor/td/0.96.0' };
const ELEMENT = { ...BASE, options: { ssr_elements: true } };

function render(args, config = BASE) {
  const [res] = runPhp([{ fn: 'td_page_actions', args }], config);
  if (res.error) throw new Error(`${res.error}: ${res.message}`);
  return res.out;
}

/** td_page_actions with JSON args, capturing the warnings on stderr (the harness forbids stderr) */
function withWarnings(args) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $a = json_decode(${JSON.stringify(JSON.stringify(args))}, true); echo td_page_actions(...$a);`;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL',
    '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, warnings: (r.stderr.match(/Warning: +td_page_actions:/g) || []).length, stderr: r.stderr };
}

/** direct children (outer tags) of the host, in order */
function children(html) {
  const inner = html.replace(/^<td-page-actions[^>]*>/, '').replace(/<\/td-page-actions>$/, '');
  const out = [];
  let depth = 0;
  let m;
  const tok = /<(\/?)(td-button|button|a)\b[^>]*>/g;
  while ((m = tok.exec(inner))) {
    if (m[1]) { depth--; continue; }
    if (depth === 0) out.push(m[0]);
    depth++;
  }
  return out;
}

const SAMPLE = [
  { label: 'Nhập', href: '/photos/import' },
  { label: 'Sắp xếp', menu: 'photos-sort' },
  { label: 'Tải ảnh lên', primary: true, icon: 'upload' },
  null,
  { label: 'Xuất CSV', in_menu: true, attrs: { 'data-export': 'csv', 'data-td-tone': 'primary', 'DATA-TD-MENU': 'x' } },
  { label: 'Xoá album', tone: 'danger' },
];

describe('td_page_actions (v0.96.0)', { skip: !HAS_PHP && 'php >= 8.0 not on PATH' }, () => {
  test('host: marker page-actions@1, label, mirror, role=group; the site data-td-* dropped from host attrs', () => {
    const html = render([[{ label: 'A' }], { label: 'Thao tác trang', mirror: 'sticky', attrs: { class: 'x', 'data-td-ssr': 'evil', 'data-site': '1' } }]);
    const host = /^<td-page-actions[^>]*>/.exec(html)[0];
    assert.match(host, /data-td-ssr="page-actions@1"/);
    assert.match(host, / label="Thao tác trang"/);
    assert.match(host, / mirror="sticky"/);
    assert.match(host, / role="group" aria-label="Thao tác trang"/);
    assert.match(host, / data-site="1"/);
    assert.equal((host.match(/data-td-ssr/g) || []).length, 1);
    assert.ok(!host.includes('evil'));
  });

  test('normal mode: primary printed last, null skipped, markers on the <button>/<a>, site data-td-* dropped', () => {
    const html = render([SAMPLE]);
    const kids = children(html);
    assert.equal(kids.length, 5);
    assert.match(kids[0], /^<a /);
    assert.match(kids[0], /href="\/photos\/import"/);
    assert.match(kids[1], /data-td-menu="photos-sort"/);
    assert.match(kids[2], /data-td-in-menu/);
    assert.match(kids[2], /data-export="csv"/);
    assert.ok(!/data-td-tone|DATA-TD-MENU|data-td-menu/i.test(kids[2]), kids[2]);
    assert.match(kids[3], /class="td-btn td-btn--danger/);
    assert.match(kids[3], /data-td-tone="danger"/);
    assert.match(kids[4], /class="td-btn td-btn--primary/);
    assert.match(kids[4], /data-td-tone="primary"/);
    assert.ok(html.indexOf('Tải ảnh lên') > html.indexOf('Xoá album'));
  });

  test('element mode: markers on the <td-button> host, never on the control (hydrate keeps button@1)', () => {
    const html = render([SAMPLE], ELEMENT);
    const kids = children(html);
    assert.equal(kids.length, 5);
    for (const k of kids) assert.match(k, /^<td-button /);
    assert.match(kids[1], /data-td-menu="photos-sort"/);
    assert.match(kids[2], /data-td-in-menu/);
    assert.match(kids[4], /data-td-tone="primary"/);
    assert.match(kids[4], /variant="primary"/);
    const controls = html.match(/<(button|a) [^>]*class="td-btn[^"]*"[^>]*>/g) || [];
    assert.equal(controls.length, 5);
    for (const c of controls) assert.ok(!/data-td-/.test(c), c);
    assert.equal((html.match(/data-td-ssr="button@1"/g) || []).length, 5);
  });

  test('element per call (o.element) wins over the config', () => {
    const html = render([[{ label: 'A' }], { element: true }]);
    assert.match(children(html)[0], /^<td-button /);
  });

  test('> 1 primary → exactly one warning, the first stays primary (last), the others demoted', () => {
    const r = withWarnings([[{ label: 'P1', primary: true }, { label: 'S' }, { label: 'P2', primary: true }, { label: 'P3', tone: 'primary' }]]);
    assert.equal(r.warnings, 1, r.stderr);
    const kids = children(r.out);
    assert.match(kids[kids.length - 1], /td-btn--primary/);
    assert.ok(r.out.lastIndexOf('P1') > r.out.indexOf('P3'));
    assert.equal((r.out.match(/data-td-tone="primary"/g) || []).length, 1);
    assert.equal((r.out.match(/td-btn--primary/g) || []).length, 1);
  });

  test('rejected href → <button> + warning; _blank → rel; empty label → dropped + warning', () => {
    const r = withWarnings([[{ label: 'Bad', href: 'javascript:alert(1)' }, { label: 'Ext', href: 'https://a.example/', target: '_blank' }, { label: '  ' }]]);
    assert.equal(r.warnings, 2, r.stderr);
    const kids = children(r.out);
    assert.equal(kids.length, 2);
    assert.match(kids[0], /^<button /);
    assert.ok(!r.out.includes('javascript'));
    assert.match(kids[1], /target="_blank"/);
    assert.match(kids[1], /rel="noopener noreferrer"/);
  });

  test('label escaped; hidden / disabled / type; unknown tone ignored', () => {
    const html = render([[
      { label: '<script>x</script>', tone: 'weird' },
      { label: 'H', hidden: true },
      { label: 'D', disabled: true, type: 'submit' },
    ]]);
    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
    const kids = children(html);
    assert.ok(!/data-td-tone/.test(kids[0]));
    assert.match(kids[1], / hidden/);
    assert.match(kids[2], / disabled/);
    assert.match(kids[2], /type="submit"/);
  });

  test('element mode: hidden marker on the host', () => {
    const html = render([[{ label: 'H', hidden: true }]], ELEMENT);
    assert.match(children(html)[0], /^<td-button [^>]*\bhidden\b/);
  });

  test('td_button keeps its 3-argument behaviour (no markers)', () => {
    const [a, b] = runPhp([{ fn: 'td_button', args: ['X', { variant: 'primary' }] }, { fn: 'td_button', args: ['X', { attrs: { 'data-td-tone': 'primary' } }] }], BASE);
    assert.ok(!/data-td-tone/.test(a.out));
    assert.match(b.out, /data-td-tone="primary"/); // plain mode: attrs pass data-* as before (unchanged)
  });
});
