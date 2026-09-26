import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultIsAllowedUrl } from './td-lightbox.js';

function withLocation(href, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const prev = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: new URL(href), configurable: true, writable: true });
  try { fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'location', { value: prev, configurable: true, writable: true });
    else delete globalThis.location;
  }
}

test('HTTPS page: rejects cleartext http media (no downgrade), accepts https', () => {
  withLocation('https://site.example/gallery', () => {
    assert.equal(location.protocol, 'https:');
    assert.equal(defaultIsAllowedUrl('http://cdn.example/a.jpg'), false);
    assert.equal(defaultIsAllowedUrl('https://cdn.example/a.jpg'), true);
    assert.equal(defaultIsAllowedUrl('/relative.jpg'), true); // resolves to https: on this page
  });
});

test('HTTP page: allows same-scheme http', () => {
  withLocation('http://dev.local/', () => {
    assert.equal(defaultIsAllowedUrl('http://cdn.example/a.jpg'), true);
  });
});

test('never other schemes, even when the page itself uses one', () => {
  withLocation('file:///Users/x/index.html', () => {
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'data:image/png;base64,AA', 'blob:https://x/1', 'vbscript:x', '']) {
      assert.equal(defaultIsAllowedUrl(bad), false, bad);
    }
  });
});
