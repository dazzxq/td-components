// v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, decision 30) — safeMediaUrl: the ONE gate for every `src`
// the media picker / media field set. Resolved against a fake base (no DOM in Node).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeMediaUrl } from './media-url.js';

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
