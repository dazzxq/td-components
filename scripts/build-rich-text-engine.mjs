#!/usr/bin/env node
/**
 * v0.88.0 (plan v0.88.0-rich-text, lane A): bundle the pinned ProseMirror packages (+ their transitive deps) into ONE
 * ESM file the kit ships as source: src/vendor/td-rich-text-engine.js. td-rich-text imports it by relative path, so Vite
 * and the PHP import map need no extra entry. Not minified (readable diffs; dist/ minifies it like every module).
 *   node scripts/build-rich-text-engine.mjs          → write
 *   node scripts/build-rich-text-engine.mjs --check  → exit 1 if stale (bundled in memory, compared byte for byte)
 * Deterministic: exact devDependency versions + lockfile, pinned esbuild, no timestamps, LF.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';
import { readGenerated, writeGenerated } from './safe-file.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'vendor', 'td-rich-text-engine.js');
const CHECK = process.argv.includes('--check');
/** Bundled packages (direct + transitive): each must be MIT — the header carries the notice. */
const PACKAGES = ['prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'prosemirror-transform',
  'prosemirror-commands', 'prosemirror-keymap', 'prosemirror-history', 'orderedmap', 'rope-sequence', 'w3c-keyname'];

const versions = PACKAGES.map((name) => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
  if (pkg.license !== 'MIT') throw new Error(`build-rich-text-engine: ${name} is ${pkg.license}, not MIT`);
  return `${name}@${pkg.version}`;
});

const result = await esbuild.build({
  entryPoints: [join(ROOT, 'scripts', 'rich-text-engine-entry.mjs')],
  absWorkingDir: ROOT,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome102', 'firefox112', 'safari16.4'],
  minify: false,
  legalComments: 'inline',
  charset: 'utf8',
  write: false,
  logLevel: 'warning',
});
// esbuild prefixes each inlined module with a `// node_modules/<pkg>/dist/index.js` path comment: kept (it names the
// source of every block), it holds no machine-specific path.
const body = result.outputFiles[0].text;
if (/\/Users\/|\/home\/|[A-Z]:\\/.test(body)) throw new Error('build-rich-text-engine: absolute path leaked into the bundle');
const header = `/*!
 * GENERATED — do not edit. Rebuild: npm run build:rich-text-engine (scripts/build-rich-text-engine.mjs).
 * ProseMirror engine for <td-rich-text>: ${versions.join(', ')}.
 * MIT License — Copyright (C) 2015-2024 by Marijn Haverbeke <marijn@haverbeke.berlin> and others.
 * Full license text: THIRD_PARTY_NOTICES.md.
 */
`;
const out = (header + body).replace(/\r\n/g, '\n');

if (CHECK) {
  if (readGenerated(ROOT, OUT) !== out) {
    console.error('src/vendor/td-rich-text-engine.js is stale — run npm run build:rich-text-engine');
    process.exit(1);
  }
  console.log('rich-text engine up to date');
} else {
  writeGenerated(ROOT, OUT, out);
  const min = await esbuild.transform(out, { minify: true, format: 'esm', target: ['chrome102', 'firefox112', 'safari16.4'] });
  const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
  console.log(`wrote src/vendor/td-rich-text-engine.js: ${kib(out.length)} (gzip ${kib(gzipSync(out).length)}); `
    + `minified ${kib(min.code.length)} (gzip ${kib(gzipSync(min.code).length)})`);
}
