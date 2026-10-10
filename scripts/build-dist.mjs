#!/usr/bin/env node
/**
 * v0.64.0 (ADR 0034, plan v0.64.0-dist M1): the minified mirror of the package root + the static module graph.
 *   node scripts/build-dist.mjs          → write dist/ (index.js, src/**\/*.js, td.css, each + .map) and module-graph.json
 *   node scripts/build-dist.mjs --check  → exit 1 when dist/ or module-graph.json is stale, incomplete or has extra files;
 *                                          also checks the maps, the graph, the export parity and the packed file set
 *   --root <dir>                          → build another package root (test/dist/build-dist.test.js fixtures)
 * One file in → one file out (esbuild, bundle:false): module identity and relative imports are the source's, so an import
 * map only swaps its base. Deterministic: pinned esbuild, sorted entries, no timestamps, relative paths, LF.
 */
import { readFileSync, readdirSync, lstatSync, existsSync, writeFileSync, mkdirSync, rmSync, rmdirSync, realpathSync, unlinkSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';
import * as esbuild from 'esbuild';

const rootArg = process.argv.indexOf('--root');
// canonical (macOS tmpdir is /var → /private/var: esbuild reports real paths)
const ROOT = realpathSync(rootArg > 0 ? resolve(process.argv[rootArg + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..'));
const DIST = join(ROOT, 'dist');
const GRAPH = 'module-graph.json';
const CHECK = process.argv.includes('--check');
/** The documented browser floor (docs/getting-started/requirements.md): the minifier never emits newer syntax. */
const TARGET = ['chrome102', 'firefox112', 'safari16.4'];

const toPosix = (p) => p.split(sep).join('/');
/** true when `p` exists as a symbolic link (never followed). */
const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };

/** A module the package ships (package.json `files`): index.js and src/**\/*.js without tests / stories / specs. */
function isShippedModule(rel) {
  if (rel === 'index.js') return true;
  return rel.startsWith('src/') && rel.endsWith('.js') && !/\.(test|browser-test|stories)\.js$/.test(rel)
    && !/\.spec\./.test(rel);
}

/**
 * Files under `dir` (package-relative, sorted). Never follows a symbolic link (Codex impl r1 #1): a link is returned in
 * `links` instead — refused under src/, removed itself (not its target) under dist/.
 * @returns {{ files: string[], links: string[] }}
 */
function walk(dir, out = { files: [], links: [] }) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.links.push(toPosix(relative(ROOT, p)));
    else if (st.isDirectory()) walk(p, out);
    else out.files.push(toPosix(relative(ROOT, p)));
  }
  return out;
}

// Codex security r2: src/ itself is checked before any traversal (a linked src/ would be read from outside the package)
if (lstatSync(join(ROOT, 'src')).isSymbolicLink()) throw new Error('build-dist: src/ is a symbolic link — refusing to read through it');
const srcTree = walk(join(ROOT, 'src'));
if (srcTree.links.length) throw new Error(`build-dist: symbolic links under src/ are not supported: ${srcTree.links.join(', ')}`);
if (existsSync(DIST) && lstatSync(DIST).isSymbolicLink()) throw new Error('build-dist: dist/ is a symbolic link — refusing to write through it');

const entries = ['index.js', ...srcTree.files].filter(isShippedModule).sort();

const css = readFileSync(join(ROOT, 'td.css'), 'utf8');
if (/\burl\(|@import\b/i.test(css)) { // CSS keywords are case-insensitive (Codex impl r1 #4)
  // dist/td.css sits one directory deeper: a relative url() / @import would point elsewhere
  throw new Error('build-dist: td.css has url() or @import — dist/td.css would resolve it from dist/; handle it first');
}

const common = {
  absWorkingDir: ROOT,
  outbase: ROOT,
  outdir: DIST,
  bundle: false,
  platform: 'browser',
  charset: 'utf8',
  target: TARGET,
  metafile: true,
  write: false,
  logLevel: 'silent',
};
const min = { minify: true, sourcemap: 'linked', sourcesContent: false, legalComments: 'inline' };

const [js, plain, cssOut] = await Promise.all([
  esbuild.build({ ...common, ...min, entryPoints: entries, format: 'esm', keepNames: true }),
  esbuild.build({ ...common, entryPoints: entries, format: 'esm' }), // export parity only (never written)
  esbuild.build({ ...common, ...min, entryPoints: ['td.css'] }),
]);
const warnings = [...js.warnings, ...plain.warnings, ...cssOut.warnings];
if (warnings.length) {
  const text = await esbuild.formatMessages(warnings, { kind: 'warning' });
  console.error(`build-dist: esbuild warnings (treated as errors):\n${text.join('\n')}`);
  process.exit(1);
}

const errors = [];

/** @type {Map<string, Buffer>} package-relative path → bytes */
const expected = new Map();
for (const f of [...js.outputFiles, ...cssOut.outputFiles]) {
  let bytes = Buffer.from(f.contents);
  if (bytes[bytes.length - 1] !== 0x0a) bytes = Buffer.concat([bytes, Buffer.from('\n')]);
  expected.set(toPosix(relative(ROOT, f.path)), bytes);
}

// every entry (and td.css) has exactly its file + map
for (const rel of [...entries, 'td.css']) {
  for (const out of [`dist/${rel}`, `dist/${rel}.map`]) if (!expected.has(out)) errors.push(`missing output ${out}`);
}
if (expected.size !== (entries.length + 1) * 2) errors.push(`unexpected output count ${expected.size}`);

// maps: relative sources that resolve to a shipped file
for (const [rel, bytes] of expected) {
  if (!rel.endsWith('.map')) continue;
  const map = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(map.sources) || map.sources.length !== 1) errors.push(`${rel}: expected one source`);
  for (const s of map.sources || []) {
    const target = posix.normalize(posix.join(posix.dirname(rel), s));
    if (s.startsWith('/') || /^[a-z]+:/i.test(s) || target.startsWith('../') || !existsSync(join(ROOT, target))) {
      errors.push(`${rel}: source ${s} does not resolve to a package file`);
    }
  }
  if ('sourcesContent' in map && map.sourcesContent?.some((c) => c != null)) errors.push(`${rel}: sourcesContent present`);
}

// graph: direct static imports per module (dynamic import() stays lazy)
const entrySet = new Set(entries);
/** @type {Record<string, string[]>} */
const modules = {};
const exportsOf = (meta) => {
  const m = new Map();
  for (const o of Object.values(meta.outputs)) if (o.entryPoint && entrySet.has(o.entryPoint)) m.set(o.entryPoint, [...o.exports].sort());
  return m;
};
for (const o of Object.values(js.metafile.outputs)) {
  if (!o.entryPoint || !entrySet.has(o.entryPoint)) continue;
  const deps = new Set();
  for (const imp of o.imports) {
    if (imp.kind === 'dynamic-import') continue;
    if (imp.kind !== 'import-statement') {
      errors.push(`${o.entryPoint}: unexpected import kind ${imp.kind} (${imp.path})`);
      continue;
    }
    if (!imp.path.startsWith('./') && !imp.path.startsWith('../')) {
      errors.push(`${o.entryPoint}: non-relative import "${imp.path}" (no bare or URL imports in the kit)`);
      continue;
    }
    const target = posix.normalize(posix.join(posix.dirname(o.entryPoint), imp.path));
    if (target.startsWith('../') || !entrySet.has(target)) {
      errors.push(`${o.entryPoint}: import "${imp.path}" → ${target} is not a shipped module`);
      continue;
    }
    deps.add(target);
  }
  modules[o.entryPoint] = [...deps].sort();
}
for (const e of entries) if (!modules[e]) errors.push(`graph: no output for ${e}`);
const sorted = Object.fromEntries(Object.keys(modules).sort().map((k) => [k, modules[k]]));
expected.set(GRAPH, Buffer.from(`${JSON.stringify({ schema: 1, modules: sorted }, null, 2)}\n`));

// export parity: minification never renames an export
const minExports = exportsOf(js.metafile);
const srcExports = exportsOf(plain.metafile);
for (const e of entries) {
  const a = JSON.stringify(srcExports.get(e));
  const b = JSON.stringify(minExports.get(e));
  if (a !== b) errors.push(`${e}: exports differ (source ${a}, dist ${b})`);
}

/** Files and symbolic links under dist/ now (package-relative; links never followed). */
const distTree = existsSync(DIST) ? walk(DIST) : { files: [], links: [] };
const onDisk = distTree.files;

if (CHECK) {
  // the packed source set = the entry set (npm pack resolves package.json `files`)
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' }))[0]
    .files.map((f) => f.path).filter((p) => p === 'index.js' || (p.startsWith('src/') && p.endsWith('.js'))).sort();
  if (JSON.stringify(packed) !== JSON.stringify(entries)) {
    const a = new Set(packed);
    errors.push(`packed source modules ≠ build entries: only packed [${packed.filter((p) => !entrySet.has(p))}], `
      + `only built [${entries.filter((p) => !a.has(p))}]`);
  }
  for (const [rel, bytes] of expected) {
    const file = join(ROOT, rel);
    if (isLink(file)) errors.push(`${rel} is a symbolic link — run npm run build:dist`);
    else if (!existsSync(file)) errors.push(`${rel} is missing — run npm run build:dist`);
    else if (!readFileSync(file).equals(bytes)) errors.push(`${rel} is stale — run npm run build:dist`);
  }
  for (const rel of onDisk) if (!expected.has(rel)) errors.push(`${rel} is not a build output — remove it (npm run build:dist)`);
  for (const rel of distTree.links) errors.push(`${rel} is a symbolic link — remove it (npm run build:dist)`);
  if (errors.length) {
    console.error(`dist check failed:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`dist check OK: ${entries.length} modules + td.css, module-graph.json`);
} else {
  if (errors.length) {
    console.error(`build-dist failed:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  // symbolic links under dist/ go first (the link itself, never its target), so no write can pass through one
  for (const rel of distTree.links) {
    if (!rel.startsWith('dist/')) throw new Error(`refusing to remove ${rel} (outside dist/)`);
    unlinkSync(join(ROOT, rel)); // removes the link entry only (rmSync would refuse a link to a directory)
  }
  mkdirSync(DIST, { recursive: true });
  const realDist = realpathSync(DIST);
  /** Codex security r1: the directory a write / delete lands in really is dist/ or below it (canonical path). */
  const inside = (file) => {
    const real = realpathSync(dirname(file));
    if (real !== realDist && !real.startsWith(realDist + sep)) throw new Error(`refusing to touch ${file} (resolves outside dist/)`);
  };
  let written = 0;
  for (const [rel, bytes] of expected) {
    const file = join(ROOT, rel);
    const link = isLink(file);
    if (!link && existsSync(file) && readFileSync(file).equals(bytes)) continue;
    mkdirSync(dirname(file), { recursive: true });
    if (rel.startsWith('dist/')) inside(file);
    else if (dirname(file) !== ROOT) throw new Error(`refusing to write ${rel} (only dist/** and root files)`);
    // Codex security r2: write a fresh file and rename it over the destination — a rename replaces a symbolic link
    // entry (module-graph.json → elsewhere) instead of writing through it
    const tmp = `${file}.tmp-build-dist`;
    if (isLink(tmp)) unlinkSync(tmp);
    writeFileSync(tmp, bytes, { flag: 'w' });
    renameSync(tmp, file);
    written += 1;
  }
  let removed = 0;
  for (const rel of onDisk) {
    if (expected.has(rel)) continue;
    if (!rel.startsWith('dist/')) throw new Error(`refusing to remove ${rel} (outside dist/)`);
    inside(join(ROOT, rel));
    rmSync(join(ROOT, rel));
    removed += 1;
  }
  // empty directories left by removed modules
  const prune = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (lstatSync(p).isDirectory()) prune(p);
    }
    if (dir !== DIST && readdirSync(dir).length === 0) rmdirSync(dir);
  };
  if (existsSync(DIST)) prune(DIST);
  let raw = 0;
  for (const [rel, bytes] of expected) if (rel.endsWith('.js')) raw += bytes.length;
  console.log(`dist: ${entries.length} modules + td.css (${written} written, ${removed} removed), JS ${raw} bytes; ${GRAPH}`);
}
