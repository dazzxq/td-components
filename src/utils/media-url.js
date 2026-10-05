/**
 * v0.32.0 (plan v0.32.0-media-picker, decision 30) — the ONE URL gate for every `src` the media picker and the media
 * field set (thumbnails, previews, posters, the field's `preview-src`). Adapter URLs are display-only: never identity,
 * never a form value.
 *
 * Accepted (after resolving against `document.baseURI`, like the lightbox SEC-02 rule):
 * - `https:`;
 * - `http:` only when the page itself is `http:` (no HTTPS → HTTP downgrade);
 * - relative / root-relative / protocol-relative input that resolves to http(s) (the same rule as above);
 * - `blob:` only with `allowBlob` (local previews).
 * Everything else (`javascript:`, `data:`, `file:`, `mailto:`, unknown schemes, non-strings, > 8 KiB) → ''.
 *
 * @module utils/media-url
 */

const MAX_LEN = 8192;

/** UTF-8 byte length (a lone surrogate counts as 3, like the U+FFFD TextEncoder writes). */
function utf8Bytes(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * @param {unknown} url
 * @param {{ allowBlob?: boolean, baseURI?: string, protocol?: string }} [opts] `baseURI` / `protocol` default to the
 *   page's (`document.baseURI`, `location.protocol`) — injectable for tests.
 * @returns {string} the normalised href, or '' when refused
 */
export function safeMediaUrl(url, opts = {}) {
  if (typeof url !== 'string') return '';
  // ≤ MAX_LEN UTF-8 BYTES of the original input, like PHP td__media_url (strlen before normalising). UTF-8 bytes ≥ UTF-16
  // units, so the cheap length check rejects most oversized input before encoding.
  if (url.length > MAX_LEN || utf8Bytes(url) > MAX_LEN) return '';
  // Like the URL parser: tab / CR / LF removed anywhere, C0 controls + space trimmed at both ends.
  // eslint-disable-next-line no-control-regex
  const raw = url.replace(/[\t\r\n]+/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (!raw || raw.length > MAX_LEN) return '';
  const base = typeof opts.baseURI === 'string' ? opts.baseURI
    : (typeof document !== 'undefined' && document.baseURI) || '';
  const pageProtocol = typeof opts.protocol === 'string' ? opts.protocol
    : (typeof location !== 'undefined' && location.protocol) || '';
  let u;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return '';
  }
  const p = u.protocol;
  if (p === 'https:') return u.href;
  if (p === 'http:') return pageProtocol === 'http:' ? u.href : '';
  if (p === 'blob:') return opts.allowBlob === true ? u.href : '';
  return '';
}

/**
 * v0.33.0 (plan v0.33.0-media-picker-dcms-parity, decision 24 / invariant 31b) — the gate for the usage links of a
 * blocked delete (`<a href target="_blank" rel="noopener noreferrer">`). Same allowlist as `safeMediaUrl` — `https:`,
 * `http:` only on an `http:` page, relative input resolving to those — and NEVER `blob:` (`allowBlob` is ignored).
 * Refused → '' (render the label as plain text, without a link).
 * @param {unknown} url
 * @param {{ baseURI?: string, protocol?: string }} [opts] injectable for tests (like `safeMediaUrl`)
 * @returns {string}
 */
export function safeLinkUrl(url, opts = {}) {
  return safeMediaUrl(url, { baseURI: opts.baseURI, protocol: opts.protocol });
}
