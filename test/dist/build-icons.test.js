// v0.94.0 (plan v0.94.0-icons-picker §5.3, §9.1): scripts/build-icons.mjs — origin rule (`lucide` xor `source: "td"`),
// search metadata keys == icon names, entries through the shared validator, `--check` names each stale file. Runs the
// real script on a tiny fixture package (--root) and the exported builder on in-memory sources.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIconOutputs } from '../../scripts/build-icons.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'build-icons.mjs');
const dirs = [];
process.on('exit', () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const NODES = [['path', { d: 'M5 12h14' }]];
const iconsJson = () => ({
  icons: {
    minus: { lucide: 'minus', viewBox: '0 0 24 24', paint: 'stroke', nodes: NODES },
    'align-none': { source: 'td', viewBox: '0 0 24 24', paint: 'fill', nodes: NODES },
  },
  aliases: { dash: 'minus' },
});
const entry = (label) => ({ label, keywords: { en: [label.toLowerCase()], vi: ['bớt'] } });
const searchJson = () => ({ $schema: 'td-icons-search/1', icons: { minus: entry('Minus'), 'align-none': entry('Khoi') } });

describe('buildIconOutputs', () => {
  test('valid sources → registry + search module (one line per icon, icons.json order, frozen)', () => {
    const s = searchJson();
    s.icons = { 'align-none': s.icons['align-none'], minus: s.icons.minus }; // source order does not matter
    const out = buildIconOutputs(iconsJson(), s);
    assert.equal(out.icons, 2);
    assert.equal(out.aliases, 1);
    assert.match(out.registry, /export const aliases = \{\n {2}"dash": "minus"\n\};/);
    const body = out.registry.slice(out.registry.indexOf('export default'));
    assert.ok(!body.includes('"source"') && !body.includes('"lucide"')); // origin fields stay in icons.json
    const lines = out.search.split('\n');
    assert.ok(lines.includes('export default Object.freeze({'));
    assert.ok(lines.indexOf(`  "minus": ${JSON.stringify(entry('Minus'))},`) < lines.indexOf(`  "align-none": ${JSON.stringify(entry('Khoi'))},`));
  });

  test('origin rule: exactly one of lucide / source "td"', () => {
    const none = iconsJson(); delete none.icons.minus.lucide;
    assert.throws(() => buildIconOutputs(none, searchJson()), /"minus" must have exactly one/);
    const both = iconsJson(); both.icons.minus.source = 'td';
    assert.throws(() => buildIconOutputs(both, searchJson()), /"minus" must have exactly one/);
    const other = iconsJson(); other.icons['align-none'].source = 'fontawesome';
    assert.throws(() => buildIconOutputs(other, searchJson()), /source "fontawesome"/);
    const empty = iconsJson(); empty.icons.minus.lucide = '';
    assert.throws(() => buildIconOutputs(empty, searchJson()), /exactly one|empty "lucide"/);
  });

  test('metadata keys: missing / extra / alias → error; bad entry → error naming the icon', () => {
    const missing = searchJson(); delete missing.icons.minus;
    assert.throws(() => buildIconOutputs(iconsJson(), missing), /missing entry for icon "minus"/);
    const extra = searchJson(); extra.icons.nope = entry('Nope');
    assert.throws(() => buildIconOutputs(iconsJson(), extra), /"nope" is not an icon/);
    const alias = searchJson(); alias.icons.dash = entry('Dash');
    assert.throws(() => buildIconOutputs(iconsJson(), alias), /"dash" is an alias/);
    const badEntry = searchJson(); badEntry.icons.minus.group = 'x';
    assert.throws(() => buildIconOutputs(iconsJson(), badEntry), /icons-search.json: icon search data "minus": unknown key "group"/);
    const dup = searchJson(); dup.icons.minus.keywords.vi = ['xoá', 'xóa'];
    assert.throws(() => buildIconOutputs(iconsJson(), dup), /duplicates/);
    const schema = searchJson(); schema.$schema = 'x';
    assert.throws(() => buildIconOutputs(iconsJson(), schema), /\$schema/);
  });
});

describe('build-icons script (--root fixture)', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'td-icons-'));
    dirs.push(root);
    mkdirSync(join(root, 'src', 'icons'), { recursive: true });
    writeFileSync(join(root, 'src', 'icons', 'icons.json'), JSON.stringify(iconsJson()));
    writeFileSync(join(root, 'src', 'icons', 'icons-search.json'), JSON.stringify(searchJson()));
    return root;
  }
  const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

  test('writes both files; --check passes, then names each stale file', () => {
    const root = fixture();
    let r = run(root, '--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /src\/icons\/registry\.js is stale/);
    assert.match(r.stderr, /src\/icons\/icons-search\.js is stale/);
    r = run(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(root, 'src', 'icons', 'icons-search.js'), 'utf8'), /"align-none"/);
    assert.equal(run(root, '--check').status, 0);
    // only the metadata source changes → only icons-search.js is stale
    const s = searchJson(); s.icons.minus.label = 'Bớt';
    writeFileSync(join(root, 'src', 'icons', 'icons-search.json'), JSON.stringify(s));
    r = run(root, '--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /icons-search\.js is stale/);
    assert.doesNotMatch(r.stderr, /registry\.js/);
  });

  test('an invalid source fails the build without writing', () => {
    const root = fixture();
    const s = searchJson(); delete s.icons.minus;
    writeFileSync(join(root, 'src', 'icons', 'icons-search.json'), JSON.stringify(s));
    const r = run(root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /missing entry for icon "minus"/);
    assert.throws(() => readFileSync(join(root, 'src', 'icons', 'registry.js')));
  });
});
