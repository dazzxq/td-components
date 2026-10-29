// v0.88.0 (plan v0.88.0-rich-text, lane B) — the server side of <td-rich-text>:
//   (a) PHP 8.0-safe part (no Symfony needed): RichTextPolicy::load() validation, symfonyConfig() argument checks, the
//       LogicException when symfony/html-sanitizer is absent. CI job `php80` runs it on PHP 8.0.
//   (b) Symfony fixture suite: test/fixtures/rich-text/{malicious,canonical}.json through symfony/html-sanitizer ^8.1
//       (test/php/symfony: `composer install` there, PHP >= 8.4.1). Runs when test/php/symfony/vendor exists; with
//       TD_REQUIRE_SYMFONY=1 a missing vendor FAILS (CI job `php84-symfony`), never skips.
// Server output is compared to (serverExpected ?? expected) SEMANTICALLY (normalize(): tag tokens, attributes as a set,
// entity-decoded text with whitespace runs collapsed). EVERY case also gets the security assertions, independent of
// the expectation: only allowed tags, no script / on* / style, every href passes isSafeUrl() of the client policy,
// rel forced, target = the field's linkTarget.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT, HERE } from './php.mjs';
import { RICH_TEXT_POLICY, isSafeUrl } from '../../src/form/rich-text/rich-text-policy.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const POLICY_PHP = join(ROOT, 'php', 'td-rich-text-policy.php');
const POLICY_JSON = join(ROOT, 'src', 'form', 'rich-text', 'rich-text-policy.json');
const SYMFONY_DIR = join(HERE, 'symfony');
const FIXTURES = join(ROOT, 'test', 'fixtures', 'rich-text');
const ALL = ['bold', 'italic', 'underline', 'strike', 'link'];

/** Run a PHP snippet that has the policy class loaded; the snippet echoes json_encode(...). */
function php(code) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', `require ${JSON.stringify(POLICY_PHP)};\n${code}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`php exited ${r.status}: ${r.stderr || r.stdout}`);
  if (r.stderr) throw new Error(`php wrote to stderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

describe('php RichTextPolicy::load (no Symfony)', opts, () => {
  test('loads the generated JSON (same as RICH_TEXT_POLICY)', () => {
    const out = php(`echo json_encode(TdComponents\\RichTextPolicy::load(${JSON.stringify(POLICY_JSON)}));`);
    assert.deepEqual(out, JSON.parse(JSON.stringify(RICH_TEXT_POLICY)));
  });

  const tmp = (content) => `(function () { $f = tempnam(sys_get_temp_dir(), 'tdrt'); file_put_contents($f, ${JSON.stringify(content)}); return $f; })()`;
  const failure = (path) => php(`try { TdComponents\\RichTextPolicy::load(${path}); echo json_encode(['ok' => true]); } catch (Throwable $e) { echo json_encode([get_class($e), $e->getMessage()]); }`);

  test('missing file, bad JSON, wrong version, wrong shape → InvalidArgumentException', () => {
    assert.equal(failure(JSON.stringify(join(ROOT, 'no-such-policy.json')))[0], 'InvalidArgumentException');
    for (const bad of ['{not json', '[]', '"x"', '{"version":2,"blocks":{},"features":{},"link":{}}', '{"version":"1","blocks":{},"features":{},"link":{}}',
      '{"version":1,"features":{},"link":{}}', '{"version":1,"blocks":{},"features":[],"link":5}']) {
      assert.equal(failure(tmp(bad))[0], 'InvalidArgumentException', bad);
    }
  });
});

describe('php RichTextPolicy::symfonyConfig arguments (no Symfony needed)', opts, () => {
  const call = (args) => php(`$p = TdComponents\\RichTextPolicy::load(${JSON.stringify(POLICY_JSON)});
    try { TdComponents\\RichTextPolicy::symfonyConfig($p, ${args}); echo json_encode(['ok' => true]); }
    catch (Throwable $e) { echo json_encode([get_class($e), $e->getMessage()]); }`);

  test('unknown feature → InvalidArgumentException', () => {
    assert.equal(call("['bold', 'blink']")[0], 'InvalidArgumentException');
    assert.equal(call('[1]')[0], 'InvalidArgumentException');
  });

  test('linkTarget outside none | _self | _blank → InvalidArgumentException', () => {
    for (const t of ['_top', '_parent', '', 'BLANK', '_BLANK', 'javascript:x']) {
      assert.equal(call(`['link'], false, ${JSON.stringify(t)}`)[0], 'InvalidArgumentException', t);
    }
  });

  test('malformed policy array → InvalidArgumentException', () => {
    const out = php(`try { TdComponents\\RichTextPolicy::symfonyConfig(['version' => 1], ['bold']); echo json_encode(['ok' => true]); } catch (Throwable $e) { echo json_encode([get_class($e)]); }`);
    assert.equal(out[0], 'InvalidArgumentException');
  });

  test('valid arguments without symfony/html-sanitizer → LogicException naming the package', () => {
    // run from a clean process: no composer autoloader, so the Symfony class cannot exist
    const out = call("['bold', 'link'], true, '_blank'");
    assert.equal(out[0], 'LogicException');
    assert.match(out[1], /symfony\/html-sanitizer/);
  });
});

// ---------- Symfony fixture suite ----------
const HAS_SYMFONY = existsSync(join(SYMFONY_DIR, 'vendor', 'autoload.php'));
if (!HAS_SYMFONY && process.env.TD_REQUIRE_SYMFONY) {
  throw new Error('TD_REQUIRE_SYMFONY=1 but test/php/symfony/vendor is missing — run: composer install --working-dir test/php/symfony');
}

/** Tokenize sanitizer OUTPUT (well-formed: both serializers escape text and quote attributes). */
function tokenize(html) {
  const tokens = [];
  const re = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[6] !== undefined) throw new Error(`stray "<" in output: ${html}`);
    if (m[5] !== undefined) { tokens.push({ text: decode(m[5]) }); continue; }
    const attrs = {};
    const are = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = are.exec(m[3]))) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    tokens.push({ tag: m[2].toLowerCase(), close: m[1] === '/', attrs });
  }
  return tokens;
}

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : all;
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()] ?? all;
  });
}

/** Canonical form for comparison: attributes as a sorted set, text whitespace runs collapsed, adjacent text merged. */
function normalize(html) {
  const out = [];
  for (const t of tokenize(html)) {
    if (t.text !== undefined) {
      const s = t.text.replace(/[ \t\n\r\f]+/g, ' ');
      if (!s) continue;
      if (out.length && out[out.length - 1].startsWith('T:')) out[out.length - 1] += s;
      else out.push(`T:${s}`);
    } else if (t.close) out.push(`</${t.tag}>`);
    else out.push(`<${t.tag}${Object.keys(t.attrs).sort().map((k) => ` ${k}=${JSON.stringify(t.attrs[k])}`).join('')}>`);
  }
  return out;
}

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'a']);

/** The security bar, applied to every server output whatever the expectation says. */
function assertSecure(c, html) {
  const label = `${c.name}: ${html}`;
  const target = c.linkTarget ?? 'none';
  const features = c.features ?? ALL;
  for (const t of tokenize(html)) {
    if (t.text !== undefined) continue;
    assert.ok(ALLOWED_TAGS.has(t.tag), `tag <${t.tag}> not allowed — ${label}`);
    assert.notEqual(t.tag, 'script', label);
    for (const [k, v] of Object.entries(t.attrs)) {
      assert.ok(!/^on/i.test(k), `on* attribute ${k} — ${label}`);
      assert.notEqual(k, 'style', label);
      if (t.tag !== 'a') assert.fail(`attribute ${k} on <${t.tag}> — ${label}`);
      assert.ok(['href', 'rel', 'target'].includes(k), `attribute ${k} on <a> — ${label}`);
      if (k === 'href') {
        assert.ok(!/^[\u0000- ]*(?:javascript|data|vbscript)\s*:/i.test(v.replace(/[\t\n\r]/g, '')), `dangerous href ${v} — ${label}`);
        assert.notEqual(isSafeUrl(v, { allowHttp: c.allowHttp === true }), null, `href ${JSON.stringify(v)} fails the client policy — ${label}`);
      }
      if (k === 'rel') assert.equal(v, RICH_TEXT_POLICY.link.rel, label);
      if (k === 'target') assert.equal(v, target, label);
    }
    if (t.tag === 'a' && !t.close) {
      assert.ok(features.includes('link'), `<a> although link is disabled — ${label}`);
      assert.equal(t.attrs.rel, RICH_TEXT_POLICY.link.rel, `rel not forced — ${label}`);
      if (target !== 'none') assert.equal(t.attrs.target, target, `target not forced — ${label}`);
      else assert.equal('target' in t.attrs, false, label);
    }
    if (t.tag !== 'p' && t.tag !== 'br' && t.tag !== 'a') {
      const feature = { strong: 'bold', em: 'italic', u: 'underline', s: 'strike' }[t.tag];
      assert.ok(features.includes(feature), `<${t.tag}> although ${feature} is disabled — ${label}`);
    }
  }
}

const symfonyOpts = { skip: (!HAS_PHP && 'php >= 8.0 CLI not found') || (!HAS_SYMFONY && 'test/php/symfony/vendor missing (composer install --working-dir test/php/symfony)') };

describe('symfony/html-sanitizer fixture suite', symfonyOpts, () => {
  const files = ['malicious.json', 'canonical.json'];
  const cases = Object.fromEntries(files.map((f) => [f, JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'))]));
  let results = {};
  const r = HAS_SYMFONY && HAS_PHP
    ? spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(SYMFONY_DIR, 'run-fixtures.php'), ...files.map((f) => join(FIXTURES, f))], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    : null;
  if (r) {
    if (r.status !== 0 || r.stderr) throw new Error(`run-fixtures.php failed (${r.status}): ${r.stderr || r.stdout}`);
    results = JSON.parse(r.stdout);
  }

  test('fixture files meet the minimum coverage', () => {
    assert.ok(cases['malicious.json'].length >= 25);
    assert.ok(cases['canonical.json'].length >= 10);
    for (const f of files) {
      assert.equal(new Set(cases[f].map((c) => c.name)).size, cases[f].length, `${f}: duplicate case names`);
      for (const c of cases[f]) {
        assert.equal(typeof c.input, 'string', c.name);
        assert.equal(typeof c.expected, 'string', c.name);
        if (c.serverExpected !== undefined) assert.ok(c.note, `${c.name}: serverExpected needs a note`);
      }
    }
  });

  for (const f of files) {
    describe(f, () => {
      cases[f].forEach((c, i) => {
        test(c.name, () => {
          const row = results[f][i];
          assert.equal(row.name, c.name);
          assertSecure(c, row.output);
          assert.deepEqual(normalize(row.output), normalize(c.serverExpected ?? c.expected), `server output: ${row.output}`);
          // the client expectation itself must satisfy the security bar (catches a bad fixture)
          assertSecure(c, c.expected);
        });
      });
    });
  }
});
