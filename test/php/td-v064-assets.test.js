// v0.64.0 (ADR 0034) — PHP side of the minified build: Td::configure(..., ['assets' => 'source' | 'dist']) moves the kit
// import map + stylesheet + module preloads to {base}/dist; Td::modulePreloads() prints the static dependency closure
// from module-graph.json when the kit directory has one. Fixture kit directories are created in os.tmpdir() at runtime.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.64.0';
const NAME = '@dazzxq/td-components';
const PKG = { name: NAME, exports: { '.': './index.js', './a': './src/a.js', './b': './src/b.js', './c': './src/c.js' } };

const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

/** A fixture kit directory: package.json + (graph: object → module-graph.json, string → raw file, null → none). */
function fixtureKit(graph) {
  const dir = mkdtempSync(join(tmpdir(), 'td-v064-'));
  tmpDirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify(PKG));
  if (graph !== null) writeFileSync(join(dir, 'module-graph.json'), typeof graph === 'string' ? graph : JSON.stringify(graph));
  return dir;
}
const GRAPH = {
  schema: 1,
  modules: {
    'src/a.js': ['src/core.js', 'src/z.js', 'src/c.js'],
    'src/b.js': ['src/core.js', 'src/base.js', 'src/a.js'],
    'src/c.js': ['src/a.js'], // cycle: c <-> a
    'src/core.js': ['src/base.js'],
    'src/base.js': [],
    'src/z.js': [],
  },
};
const link = (href, nonce = '') => `<link rel="modulepreload" href="${href}"${nonce}>`;

describe('assets option (v0.64.0)', opts, () => {
  test('default and explicit "source": URLs are the 0.63 ones', () => {
    const calls = [
      { fn: 'Td::importMap', args: [{ site: '/app.js' }] },
      { fn: 'Td::stylesheetTag', args: [] },
      { fn: 'Td::assets', args: [] },
    ];
    const [d, s] = [runPhp(calls, { baseUrl: BASE }), runPhp(calls, { baseUrl: BASE, options: { assets: 'source' } })];
    assert.deepEqual(d, s);
    assert.equal(d[0].out[`${NAME}/button`], `${BASE}/src/form/td-button.js`);
    assert.equal(d[0].out[NAME], `${BASE}/index.js`);
    assert.equal(d[0].out.site, '/app.js');
    assert.equal(d[1].out, `<link rel="stylesheet" href="${BASE}/td.css">`);
    assert.equal(d[2].out, 'source');
  });

  test('"dist": kit URLs move to {base}/dist, the site\'s extra entries stay', () => {
    const [map, css, assets, tag] = runPhp([
      { fn: 'Td::importMap', args: [{ site: '/app.js', other: `${BASE}/x.js` }] },
      { fn: 'Td::stylesheetTag', args: ['n1'] },
      { fn: 'Td::assets', args: [] },
      { fn: 'Td::importMapTag', args: [] },
    ], { baseUrl: BASE, options: { assets: 'dist' } });
    assert.equal(map.out[`${NAME}/button`], `${BASE}/dist/src/form/td-button.js`);
    assert.equal(map.out[NAME], `${BASE}/dist/index.js`);
    assert.equal(map.out.site, '/app.js');
    assert.equal(map.out.other, `${BASE}/x.js`);
    for (const [spec, url] of Object.entries(map.out)) {
      if (spec.startsWith(NAME)) assert.ok(url.startsWith(`${BASE}/dist/`), `${spec} -> ${url}`);
    }
    assert.equal(css.out, `<link rel="stylesheet" href="${BASE}/dist/td.css" nonce="n1">`);
    assert.equal(assets.out, 'dist');
    assert.ok(tag.out.includes(`${BASE}/dist/index.js`));
  });

  test('anything else than "source" / "dist" throws InvalidArgumentException; unknown keys still throw', () => {
    const bad = ['min', true, 1, null, '', 'DIST', ['dist']];
    // Td::configure is called as a harness call so the exception is captured instead of killing the process
    const res = runPhp([
      ...bad.map((v) => ({ fn: 'Td::configure', args: [BASE, ROOT, { assets: v }] })),
      { fn: 'Td::configure', args: [BASE, ROOT, { assets: 'dist', typo: true }] },
    ], { baseUrl: BASE });
    for (const r of res) assert.equal(r.error, 'InvalidArgumentException', JSON.stringify(r));
    assert.match(res[0].message, /assets must be "source" or "dist"/);
    assert.match(res.at(-1).message, /unknown option "typo"/);
  });

  test('ssr_elements and assets work together; a later configure() resets both', () => {
    const res = runPhp([
      { fn: 'Td::assets', args: [] },
      { fn: 'Td::ssrElements', args: [] },
      { fn: 'Td::configure', args: [BASE, ROOT, {}] },
      { fn: 'Td::assets', args: [] },
      { fn: 'Td::ssrElements', args: [] },
      { fn: 'Td::stylesheetTag', args: [] },
    ], { baseUrl: BASE, options: { assets: 'dist', ssr_elements: true } });
    assert.deepEqual(res.slice(0, 2).map((r) => r.out), ['dist', true]);
    assert.deepEqual(res.slice(3, 5).map((r) => r.out), ['source', false]);
    assert.equal(res[5].out, `<link rel="stylesheet" href="${BASE}/td.css">`);
  });
});

describe('Td::modulePreloads with module-graph.json (v0.64.0)', opts, () => {
  test('roots first (call order), then the other modules sorted, no duplicates; a cycle terminates', () => {
    const kitDir = fixtureKit(GRAPH);
    const [r] = runPhp([{ fn: 'Td::modulePreloads', args: [['b', `${NAME}/a`, 'b']] }], { baseUrl: BASE, kitDir });
    // roots: b, a. discovered: core, base, c, z -> sorted: base, c, core, z
    assert.equal(r.out, ['src/b.js', 'src/a.js', 'src/base.js', 'src/c.js', 'src/core.js', 'src/z.js']
      .map((p) => link(`${BASE}/${p}`)).join(''));
    const [one] = runPhp([{ fn: 'Td::modulePreloads', args: [['c']] }], { baseUrl: BASE, kitDir });
    assert.equal(one.out, ['src/c.js', 'src/a.js', 'src/base.js', 'src/core.js', 'src/z.js']
      .map((p) => link(`${BASE}/${p}`)).join(''));
  });

  test('a dist base gives the dist URLs; the nonce is escaped', () => {
    const kitDir = fixtureKit(GRAPH);
    const [r] = runPhp([{ fn: 'Td::modulePreloads', args: [['a'], 'n"<1'] }],
      { baseUrl: BASE, kitDir, options: { assets: 'dist' } });
    const nonce = ' nonce="n&quot;&lt;1"';
    assert.equal(r.out, ['src/a.js', 'src/base.js', 'src/c.js', 'src/core.js', 'src/z.js']
      .map((p) => link(`${BASE}/dist/${p}`, nonce)).join(''));
  });

  test('no graph file: only the named modules (as before); empty list prints nothing', () => {
    const kitDir = fixtureKit(null);
    const [r, e] = runPhp([
      { fn: 'Td::modulePreloads', args: [['a', 'b', 'a']] },
      { fn: 'Td::modulePreloads', args: [[]] },
    ], { baseUrl: BASE, kitDir });
    assert.equal(r.out, link(`${BASE}/src/a.js`) + link(`${BASE}/src/b.js`));
    assert.equal(e.out, '');
  });

  test('input validation is unchanged with a graph present', () => {
    const kitDir = fixtureKit(GRAPH);
    const res = runPhp([
      { fn: 'Td::modulePreloads', args: [['no-such']] },
      { fn: 'Td::modulePreloads', args: [[1]] },
    ], { baseUrl: BASE, kitDir });
    for (const r of res) assert.equal(r.error, 'InvalidArgumentException', JSON.stringify(r));
  });

  const BAD = {
    'invalid JSON': '{"schema":1,"modules":',
    'schema 2': { schema: 2, modules: {} },
    'schema as a string': { schema: '1', modules: {} },
    'schema missing': { modules: {} },
    'top level is a list': [],
    'modules is a string': { schema: 1, modules: 'x' },
    'modules is a list': { schema: 1, modules: [] },
    'deps is not a list': { schema: 1, modules: { 'src/a.js': 'src/b.js' } },
    'a dep is not a string': { schema: 1, modules: { 'src/a.js': [1] } },
    'a dep with ..': { schema: 1, modules: { 'src/a.js': ['src/../../etc/passwd'] } },
    'a key with ..': { schema: 1, modules: { '../a.js': [] } },
    'a dep starting with /': { schema: 1, modules: { 'src/a.js': ['/src/b.js'] } },
    'a key starting with /': { schema: 1, modules: { '/src/a.js': [] } },
    'a dep with :': { schema: 1, modules: { 'src/a.js': ['https://evil.example/x.js'] } },
    'a dep with a backslash': { schema: 1, modules: { 'src/a.js': ['src\\b.js'] } },
    // Codex security r1: canonical module paths only (allowlist) and every dependency is a module of the graph
    'a dep that is not a module': { schema: 1, modules: { 'src/a.js': ['src/b.js'] } },
    'a dep %2e%2e': { schema: 1, modules: { 'src/a.js': ['src/%2e%2e/x.js'], 'src/%2e%2e/x.js': [] } },
    'a key .%2e': { schema: 1, modules: { 'src/.%2e/x.js': [] } },
    'a key %2E.': { schema: 1, modules: { 'src/%2E./x.js': [] } },
    'a key with ?': { schema: 1, modules: { 'src/a.js?x=1': [] } },
    'a key with #': { schema: 1, modules: { 'src/a.js#x': [] } },
    'a key with a control character': { schema: 1, modules: { 'src/a\n.js': [] } },
    'a key with an empty segment': { schema: 1, modules: { 'src//a.js': [] } },
    'a key with a . segment': { schema: 1, modules: { 'src/./a.js': [] } },
    'a key that is not .js': { schema: 1, modules: { 'src/a.css': [] } },
    'a key outside src/': { schema: 1, modules: { 'php/td.js': [] } },
  };
  for (const [label, graph] of Object.entries(BAD)) {
    test(`malformed graph (${label}) throws RuntimeException`, () => {
      const kitDir = fixtureKit(graph);
      const [r] = runPhp([{ fn: 'Td::modulePreloads', args: [['a']] }], { baseUrl: BASE, kitDir });
      assert.equal(r.error, 'RuntimeException', JSON.stringify(r));
    });
  }

  test('a valid graph that does not list a named module throws (Codex impl r2: incomplete, not "no dependencies")', () => {
    const kitDir = fixtureKit({ schema: 1, modules: { 'src/b.js': [] } });
    const [r, ok] = runPhp([
      { fn: 'Td::modulePreloads', args: [['a']] },
      { fn: 'Td::modulePreloads', args: [['b']] },
    ], { baseUrl: BASE, kitDir });
    assert.equal(r.error, 'RuntimeException');
    assert.match(r.message, /does not list src\/a\.js/);
    assert.equal(ok.out, link(`${BASE}/src/b.js`));
  });

  test('an invalid JSON error is a RuntimeException that names the file', () => {
    const kitDir = fixtureKit('{nope');
    const [r] = runPhp([{ fn: 'Td::modulePreloads', args: [['a']] }], { baseUrl: BASE, kitDir });
    assert.equal(r.error, 'RuntimeException');
    assert.match(r.message, /module-graph\.json/);
  });
});
