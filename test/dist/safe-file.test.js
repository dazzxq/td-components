// v0.88.0 (Codex security r2, CWE-59): the generated-file helpers never follow a symbolic link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGenerated, writeGenerated } from '../../scripts/safe-file.mjs';

/** A fresh temp tree, removed after the test. @param {import('node:test').TestContext} t */
const setup = (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'td-safe-file-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo');
  const outside = join(base, 'outside.txt');
  mkdirSync(join(root, 'src', 'vendor'), { recursive: true });
  writeFileSync(outside, 'KEEP');
  return { root, outside, out: join(root, 'src', 'vendor', 'gen.js') };
};

test('writes and reads a regular generated file; missing file reads as empty', (t) => {
  const { root, out } = setup(t);
  assert.equal(readGenerated(root, out), '');
  writeGenerated(root, out, 'A');
  writeGenerated(root, out, 'B');
  assert.equal(readGenerated(root, out), 'B');
  assert.deepEqual(readdirSync(join(root, 'src', 'vendor')), ['gen.js']);
});

test('an output symlink is refused in write AND check mode; its target is untouched', (t) => {
  const { root, outside, out } = setup(t);
  symlinkSync(outside, out);
  assert.throws(() => writeGenerated(root, out, 'X'), /symbolic link/);
  assert.throws(() => readGenerated(root, out), /symbolic link/);
  assert.equal(readFileSync(outside, 'utf8'), 'KEEP');
});

test('a symlinked parent directory is refused', (t) => {
  const { root, out } = setup(t);
  const real = join(root, '..', 'elsewhere');
  mkdirSync(real);
  symlinkSync(real, join(root, 'lib'));
  assert.throws(() => writeGenerated(root, join(root, 'lib', 'gen.js'), 'X'), /symbolic link/);
  assert.ok(lstatSync(out.replace('gen.js', '')).isDirectory());
});

test('a path outside the root is refused', (t) => {
  const { root, outside } = setup(t);
  assert.throws(() => writeGenerated(root, outside, 'X'), /outside/);
  assert.equal(readFileSync(outside, 'utf8'), 'KEEP');
});
