// v0.64.0 (ADR 0034, Codex impl + security r1): scripts/build-dist.mjs never writes, deletes or recurses through a symbolic
// link — a symlinked dist/ or src/ entry is refused, a nested link under dist/ is removed itself (its target untouched), a
// link cycle cannot hang the walk. Runs the real script on a tiny fixture package (--root).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'build-dist.mjs');
const dirs = [];
const temp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
process.on('exit', () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const root = temp('td-dist-');
  mkdirSync(join(root, 'src', 'x'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', files: ['src', 'index.js', 'td.css'] }));
  writeFileSync(join(root, 'index.js'), "export { A } from './src/x/a.js';\n");
  writeFileSync(join(root, 'src', 'x', 'a.js'), "/** doc */\nexport class A { hello() { return 'a'; } }\n");
  writeFileSync(join(root, 'td.css'), ':root {\n  --x: 1px;\n}\n');
  return root;
}
const build = (root) => spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
/** A directory outside the package holding a file the build must never touch. */
function outside() {
  const d = temp('td-dist-outside-');
  writeFileSync(join(d, 'keep.txt'), 'keep');
  writeFileSync(join(d, 'a.js'), 'precious');
  return d;
}

describe('build-dist and symbolic links', () => {
  test('a fixture builds: dist mirror + maps + graph', () => {
    const root = fixture();
    const r = build(root);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(join(root, 'dist', 'src', 'x', 'a.js'), 'utf8').includes('hello'));
    assert.ok(existsSync(join(root, 'dist', 'td.css.map')));
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'module-graph.json'), 'utf8')).modules,
      { 'index.js': ['src/x/a.js'], 'src/x/a.js': [] });
  });

  test('dist/ itself a symbolic link → refused, its target untouched', () => {
    const root = fixture();
    const out = outside();
    symlinkSync(out, join(root, 'dist'));
    const r = build(root);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /dist\/ is a symbolic link/);
    assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(readFileSync(join(out, 'a.js'), 'utf8'), 'precious');
  });

  test('a nested link under dist/ is removed itself; the build writes real files; the target is untouched', () => {
    const root = fixture();
    const out = outside();
    mkdirSync(join(root, 'dist'));
    symlinkSync(out, join(root, 'dist', 'src'));
    const r = build(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(lstatSync(join(root, 'dist', 'src')).isSymbolicLink(), false);
    assert.ok(readFileSync(join(root, 'dist', 'src', 'x', 'a.js'), 'utf8').includes('hello'));
    assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(readFileSync(join(out, 'a.js'), 'utf8'), 'precious');
  });

  test('a link cycle under dist/ does not hang and is removed', () => {
    const root = fixture();
    mkdirSync(join(root, 'dist', 'src'), { recursive: true });
    symlinkSync(join(root, 'dist'), join(root, 'dist', 'src', 'loop'));
    const r = build(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(root, 'dist', 'src', 'loop')), false);
  });

  test('module-graph.json as a symbolic link: replaced by the real file, its target untouched (Codex security r2)', () => {
    const root = fixture();
    const out = outside();
    symlinkSync(join(out, 'keep.txt'), join(root, 'module-graph.json'));
    const r = build(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(lstatSync(join(root, 'module-graph.json')).isSymbolicLink(), false);
    assert.equal(JSON.parse(readFileSync(join(root, 'module-graph.json'), 'utf8')).schema, 1);
    assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'keep');
  });

  test('src/ itself a symbolic link is refused before any traversal', () => {
    const root = fixture();
    const real = join(root, 'src-real');
    spawnSync('mv', [join(root, 'src'), real]);
    symlinkSync(real, join(root, 'src'));
    const r = build(root);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /src\/ is a symbolic link/);
  });

  test('a symbolic link under src/ is refused', () => {
    const root = fixture();
    symlinkSync(outside(), join(root, 'src', 'linked'));
    const r = build(root);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /symbolic links under src\/ are not supported/);
  });
});
