import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RICH_TEXT_POLICY, RICH_TEXT_FEATURES, resolveFeatures, isSafeUrl, policyFor, normalizeLinkTarget } from './rich-text-policy.js';

test('resolveFeatures: preset comment is the default; unknown preset falls back to it', () => {
  const all = ['bold', 'italic', 'underline', 'strike', 'link'];
  assert.deepEqual(resolveFeatures(), { features: all, unknown: [] });
  assert.deepEqual(resolveFeatures({ preset: 'comment' }), { features: all, unknown: [] });
  assert.deepEqual(resolveFeatures({ preset: 'nope' }), { features: all, unknown: [] });
  assert.deepEqual(resolveFeatures({ preset: 'toString' }), { features: all, unknown: [] });
});

test('resolveFeatures: features override the preset, fixed order, dedupe, unknown reported', () => {
  assert.deepEqual(resolveFeatures({ preset: 'comment', features: 'link, Bold bold  heading' }),
    { features: ['bold', 'link'], unknown: ['heading'] });
  assert.deepEqual(resolveFeatures({ features: '   ' }).features, RICH_TEXT_FEATURES);
});

test('isSafeUrl: allowed schemes, relative and fragment', () => {
  for (const ok of ['https://a.example/x?y#z', 'HTTPS://A.example', 'mailto:a@b.example', 'tel:+84123', '/path', 'a/b',
    '?q=1', './x', '#top', 'page.html#x']) assert.equal(isSafeUrl(ok), ok, ok);
  assert.equal(isSafeUrl('  https://a.example  '), 'https://a.example');
});

test('isSafeUrl: http only with allowHttp', () => {
  assert.equal(isSafeUrl('http://a.example'), null);
  assert.equal(isSafeUrl('http://a.example', { allowHttp: true }), 'http://a.example');
});

test('isSafeUrl: rejects dangerous and odd forms', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:x',
    '\u0001javascript:x', ' \u0000javascript:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'ftp://a',
    '//evil.example', '\\\\evil.example', '/\\evil.example', '\\/evil.example', 'https:evil', 'https:/evil', 'https://',
    'a\u0007b', '', '   ', null, undefined, 42, {}, 'x:y', 'foo:bar/baz'])
    assert.equal(isSafeUrl(/** @type {any} */ (bad)), null, JSON.stringify(bad));
});

test('isSafeUrl: tab/newline inside a safe URL are removed (as the URL parser would)', () => {
  assert.equal(isSafeUrl('https://a.exa\nmple/'), 'https://a.example/');
});

test('policyFor: tags per feature, link rules, target normalized', () => {
  const p = policyFor(['bold', 'link'], { allowHttp: true, linkTarget: '_blank' });
  assert.deepEqual(p.tags, { p: [], br: [], strong: [], a: ['href'] });
  assert.deepEqual(p.link, { schemes: ['https', 'mailto', 'tel', 'http'], relative: true, fragment: true,
    rel: 'nofollow noopener', target: '_blank' });
  assert.equal(policyFor(['italic']).link, null);
  assert.equal(policyFor(['link'], { linkTarget: '_top' }).link.target, 'none');
  assert.equal(normalizeLinkTarget('_self'), '_self');
  assert.equal(normalizeLinkTarget('_BLANK'), 'none');
});

test('RICH_TEXT_POLICY is frozen (shared, never mutated by a caller)', () => {
  assert.ok(Object.isFrozen(RICH_TEXT_POLICY) && Object.isFrozen(RICH_TEXT_POLICY.features.link.attrs.a));
  assert.equal(RICH_TEXT_POLICY.version, 1);
});
