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

/**
 * @param {unknown} url
 * @param {{ allowBlob?: boolean, baseURI?: string, protocol?: string }} [opts] `baseURI` / `protocol` default to the
 *   page's (`document.baseURI`, `location.protocol`) — injectable for tests.
 * @returns {string} the normalised href, or '' when refused
 */
export function safeMediaUrl(url, opts = {}) {
  if (typeof url !== 'string') return '';
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
