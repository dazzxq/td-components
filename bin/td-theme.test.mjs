/* v0.42.0 R2-5 (plan N3 / QĐ13): the td-theme CLI — exit codes 0 / 1 / 2 / 3 (spawned for 0 / 1 / 2, in-process with
 * an injected failure for 3), stdout = the CSS only (empty on 2 / 3), --allow-aa-failure, --diagnostics=json, and the
 * CLI bytes = toCss(generatePalette(...)) (differential with the module). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from './td-theme.mjs';
import { generatePalette, presetPalette } from '../src/theme/palette.js';
import { toCss, toJson } from '../src/theme/serialize.js';

const BIN = fileURLToPath(new URL('./td-theme.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
const BEIGE = ['--bg', '#ece5d8', '--accent', '#b3261e', '--surface', '#fff'];

test('exit 0: CSS on stdout = toCss(generatePalette()) byte for byte; diagnostics on stderr', () => {
  const r = cli(...BEIGE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, toCss(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' })));
  assert.match(r.stderr, /^td-theme: info TD_THEME_APCA/m);
  assert.ok(!r.stdout.includes('td-theme: info'));
  const d = cli('--bg', '#111113', '--accent', '#3b82f6', '--mode', 'dark', '--name', 'night');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.stdout, toCss(generatePalette({ bg: '#111113', accent: '#3b82f6' }, { mode: 'dark', name: 'night' })));
  const p = cli('--preset', 'dark', '--name', 'night');
  assert.equal(p.status, 0, p.stderr);
  assert.equal(p.stdout, toCss(presetPalette('dark', { name: 'night' })));
});

test('exit 1: a mandatory AA failure still prints the CSS (warning first line); --allow-aa-failure → 0 + "accepted"', () => {
  const r = cli('--bg', '#777', '--accent', '#b3261e');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^\/\* td-theme: WARNING — mandatory WCAG AA failures \(NOT accepted, td-theme exited 1\): TD_THEME_CONTRAST_UNSATISFIABLE /);
  assert.match(r.stderr, /error-AA TD_THEME_CONTRAST_UNSATISFIABLE --td-color-text on /);
  assert.match(r.stderr, /exit 1/);
  const a = cli('--bg', '#777', '--accent', '#b3261e', '--allow-aa-failure');
  assert.equal(a.status, 0);
  assert.match(a.stdout, /^\/\* td-theme: WARNING — mandatory WCAG AA failures accepted: TD_THEME_CONTRAST_UNSATISFIABLE --td-/);
  assert.equal(a.stdout, toCss(generatePalette({ bg: '#777', accent: '#b3261e' }), { acceptAaFailure: true }));
});

test('exit 2: bad input / usage — no CSS, the raw input is never echoed', () => {
  const evil = '\u001b]0;pwned\u0007#fff';
  const cases = [
    [],
    ['--accent', '#000'],
    ['--bg', '#fff'],
    ['--bg', 'red;}body{x:y}', '--accent', '#000'],
    ['--bg', evil, '--accent', '#000'],
    ['--bg', '#ffffff80', '--accent', '#000'],
    ['--bg', '#fff', '--accent', '#000', '--mode', 'auto'],
    ['--bg', '#fff', '--accent', '#000', '--name', 'dark'],
    ['--bg', '#fff', '--accent', '#000', '--name', 'x"]{}'],
    ['--bg', '#fff', '--accent', '#000', '--diagnostics=xml'],
    ['--bg', '#fff', '--accent', '#000', '--evil'],
    ['--bg', '#fff', '--accent', '#000', 'positional'],
    ['--bg', '#fff', '--bg', '#000', '--accent', '#000'],
    ['--bg', `#${'f'.repeat(80)}`, '--accent', '#000'],
    ['--preset', 'dark', '--bg', '#fff'],
    ['--preset', 'sepia'],
    ['--bg'],
    [`--${evil}`],
  ];
  for (const args of cases) {
    const r = cli(...args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}: ${r.stderr}`);
    assert.equal(r.stdout, '', JSON.stringify(args));
    assert.ok(r.stderr.startsWith('td-theme: '), r.stderr);
    assert.ok(!r.stderr.includes('\u001b') && !r.stderr.includes('pwned') && !r.stderr.includes('body{'), JSON.stringify(r.stderr));
  }
});

test('exit 3: an internal error prints no CSS (in-process, injected failure)', () => {
  const out = [];
  const err = [];
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
  const code = run(['--bg', '#fff', '--accent', '#000'], io, { generatePalette: () => { throw new RangeError('boom'); } });
  assert.equal(code, 3);
  assert.deepEqual(out, []);
  assert.match(err.join(''), /^td-theme: internal error \(RangeError\)/);
  const jerr = [];
  const code2 = run(['--bg', '#fff', '--accent', '#000', '--diagnostics=json'],
    { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => jerr.push(s) } },
    { generatePalette: () => ({ tokens: null, diagnostics: null }) });
  assert.equal(code2, 3);
  assert.deepEqual(out, []);
  assert.equal(JSON.parse(jerr.join('')).error.code, 'TD_THEME_INTERNAL');
});

test('--diagnostics=json: one JSON document on stderr (= toJson + exitCode); input errors too', () => {
  const r = cli(...BEIGE, '--diagnostics=json');
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stderr);
  assert.deepEqual(j, { ...toJson(generatePalette({ bg: '#ece5d8', accent: '#b3261e', surface: '#fff' })), exitCode: 0 });
  const f = cli('--bg', '#777', '--accent', '#b3261e', '--diagnostics', 'json');
  assert.equal(f.status, 1);
  assert.equal(JSON.parse(f.stderr).exitCode, 1);
  const e = cli('--bg', 'nope', '--accent', '#000', '--diagnostics=json');
  assert.equal(e.status, 2);
  assert.deepEqual(JSON.parse(e.stderr).error, { code: 'TD_THEME_INPUT', field: 'bg', message: '--bg: not a colour (use #rgb, #rrggbb or rgb(r g b))' });
});

test('--help / --version', () => {
  const h = cli('--help');
  assert.equal(h.status, 0);
  assert.match(h.stdout, /^td-theme — generate a td-components theme/);
  const v = cli('--version');
  assert.equal(v.status, 0);
  assert.match(v.stdout, /^td-theme \d+\.\d+\.\d+ \(palette algorithm 2, THEME_TOKENS v1\)\n$/);
});
