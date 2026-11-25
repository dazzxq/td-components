import { test } from 'node:test';
import assert from 'node:assert/strict';

// v0.127.0: safeMenuHref without a page no longer needs a fake absolute base URL (it leaked into the bundle).
const { safeMenuHref } = await import('./td-menu.js');

test('safeMenuHref without a page keeps its old verdicts', () => {
  for (const ok of ['/a', 'a/b', '//x.com/p', 'https://x', '?q=1', '#h']) assert.equal(safeMenuHref(ok, null), ok, ok);
  for (const bad of ['http://x', 'javascript:alert(1)', 'java\tscript:alert(1)', 'mailto:a@b.c', 'data:text/html,x', 'https://', 'foo://[bad', '', '   ', null, 5]) {
    assert.equal(safeMenuHref(bad, null), null, String(bad));
  }
});

test('safeMenuHref with a page is unchanged', () => {
  const https = { href: 'https://a.test/dir/', protocol: 'https:' };
  const http = { href: 'http://a.test/dir/', protocol: 'http:' };
  assert.equal(safeMenuHref('x', https), 'x');
  assert.equal(safeMenuHref('http://b.test', https), null);
  assert.equal(safeMenuHref('http://b.test', http), 'http://b.test');
  assert.equal(safeMenuHref('javascript:alert(1)', http), null);
});
