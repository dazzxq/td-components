// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, decision 30) — safeMediaUrl: the ONE gate for every `src`
// the media picker / media field set. Resolved against a fake base (no DOM in Node).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeMediaUrl, safeLinkUrl } from './media-url.js';

const HTTPS = { baseURI: 'https://site.test/admin/page', protocol: 'https:' };
const HTTP = { baseURI: 'http://site.test/admin/page', protocol: 'http:' };

describe('safeMediaUrl — schemes', () => {
  it('https absolute → normalised href', () => {
    assert.equal(safeMediaUrl('https://cdn.test/a b.jpg', HTTPS), 'https://cdn.test/a%20b.jpg');
    assert.equal(safeMediaUrl('HTTPS://CDN.test/x.png', HTTPS), 'https://cdn.test/x.png');
  });

  it('http absolute only when the page itself is http:', () => {
    assert.equal(safeMediaUrl('http://cdn.test/x.png', HTTPS), '');
    assert.equal(safeMediaUrl('http://cdn.test/x.png', HTTP), 'http://cdn.test/x.png');
  });

  it('relative / root-relative resolve against the base (same origin)', () => {
    assert.equal(safeMediaUrl('/media/1.jpg', HTTPS), 'https://site.test/media/1.jpg');
    assert.equal(safeMediaUrl('thumb.jpg?s=1', HTTPS), 'https://site.test/admin/thumb.jpg?s=1');
    assert.equal(safeMediaUrl('../x.png', HTTP), 'http://site.test/x.png');
  });

  it('protocol-relative takes the page scheme (https page → https)', () => {
    assert.equal(safeMediaUrl('//cdn.test/x.png', HTTPS), 'https://cdn.test/x.png');
  });

  it('blob: only with allowBlob', () => {
    const b = 'blob:https://site.test/5f0c-11';
    assert.equal(safeMediaUrl(b, HTTPS), '');
    assert.equal(safeMediaUrl(b, { ...HTTPS, allowBlob: true }), b);
  });

  it('javascript:, data:, file:, vbscript:, mailto:, tel:, ftp: → ""', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
      'java\nscript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'data:image/png;base64,AAAA', 'file:///etc/passwd',
      'vbscript:x', 'mailto:a@b.c', 'tel:123', 'ftp://x.test/a.png', 'chrome://settings']) {
      assert.equal(safeMediaUrl(u, HTTPS), '', u);
      assert.equal(safeMediaUrl(u, { ...HTTPS, allowBlob: true }), '', u);
    }
  });

  it('not a string / empty / blank → ""', () => {
    for (const u of [null, undefined, 1, {}, [], '', '   ', '\t\n']) assert.equal(safeMediaUrl(u, HTTPS), '');
  });

  it('a toString() object is never coerced', () => {
    assert.equal(safeMediaUrl({ toString: () => 'https://x.test/a.png' }, HTTPS), '');
  });

  it('no base available → only absolute https survives', () => {
    assert.equal(safeMediaUrl('https://x.test/a.png', { baseURI: '', protocol: '' }), 'https://x.test/a.png');
    assert.equal(safeMediaUrl('/a.png', { baseURI: '', protocol: '' }), '');
  });

  it('over-long input → ""', () => {
    assert.equal(safeMediaUrl(`https://x.test/${'a'.repeat(9000)}`, HTTPS), '');
  });
});

// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decision 24 / invariant 31b) — safeLinkUrl: the gate for usage links
// of a blocked delete (`<a href target="_blank">`). Same allowlist as safeMediaUrl, and NEVER blob:.
describe('safeLinkUrl — usage links', () => {
  it('https / relative / root-relative → normalised href', () => {
    assert.equal(safeLinkUrl('https://cms.test/posts/1', HTTPS), 'https://cms.test/posts/1');
    assert.equal(safeLinkUrl('/admin/posts/12?edit=1', HTTPS), 'https://site.test/admin/posts/12?edit=1');
    assert.equal(safeLinkUrl('posts/12', HTTPS), 'https://site.test/admin/posts/12');
    assert.equal(safeLinkUrl('//cms.test/p', HTTPS), 'https://cms.test/p');
  });

  it('http only when the page is http:', () => {
    assert.equal(safeLinkUrl('http://cms.test/p', HTTPS), '');
    assert.equal(safeLinkUrl('http://cms.test/p', HTTP), 'http://cms.test/p');
  });

  it('javascript: / data: / blob: / file: / mailto: / unknown → "" (blob: even when asked)', () => {
    for (const u of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>',
      'blob:https://site.test/1-2', 'file:///etc/passwd', 'vbscript:x', 'mailto:a@b.c', 'ftp://x.test/', 'chrome://settings']) {
      assert.equal(safeLinkUrl(u, HTTPS), '', u);
      assert.equal(safeLinkUrl(u, { ...HTTPS, allowBlob: true }), '', u);
    }
  });

  it('non-strings / empty / over-long → ""', () => {
    for (const u of [null, undefined, 1, {}, [], '', '  ', { toString: () => 'https://x.test/' }]) assert.equal(safeLinkUrl(u, HTTPS), '');
    assert.equal(safeLinkUrl(`https://x.test/${'a'.repeat(9000)}`, HTTPS), '');
  });
});

it('v0.43.0 review: the 8192 limit counts UTF-8 bytes of the original input (PHP parity)', () => {
  const opts = { baseURI: 'https://site.example/', protocol: 'https:' };
  const at = (n) => `/p/${'a'.repeat(n - 3)}`;
  assert.notEqual(safeMediaUrl(at(8192), opts), '', 'exactly 8192 ASCII bytes allowed');
  assert.equal(safeMediaUrl(at(8193), opts), '', '8193 bytes refused');
  // 'ạ' = 3 bytes, 1 UTF-16 unit: 2731 × 3 + 3 = 8196 bytes but only 2734 units
  assert.equal(safeMediaUrl(`/p/${'ạ'.repeat(2731)}`, opts), '', 'multibyte over the byte limit refused');
  assert.notEqual(safeMediaUrl(`/p/${'ạ'.repeat(2729)}`, opts), '', '2729 × 3 + 3 = 8190 bytes allowed');
  // emoji = 4 bytes / 2 units
  assert.equal(safeMediaUrl(`/p/${'😀'.repeat(2048)}`, opts), '', '8195 bytes of emoji refused');
  // stripped controls still count: the limit applies to the ORIGINAL input, like PHP strlen before safeUrl
  assert.equal(safeMediaUrl(`/p/${'\t'.repeat(8190)}x`, opts), '', 'controls count before stripping');
});

