/**
 * v0.97.0 `<td-dropdown>` option `font`: a usable CSS `font-family` value, or ''. The value is only ever written
 * through CSSOM (`el.style.fontFamily = …`), which can set nothing but that one property; this gate only rejects what
 * makes no sense as a per-option preview: non-strings, empty / over 200 chars, control characters, the CSS-wide
 * keywords (inherit / initial / unset / revert / revert-layer — they would not name a font), and anything the browser's
 * own `font-family` parser refuses (read back empty from a detached element). Results are cached per input string.
 */
const MAX = 200;
const WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const cache = new Map();
let probe = null;

/** @param {unknown} v @returns {string} the normalised family list, or '' */
export function fontFamilyOf(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s || s.length > MAX) return '';
  if (cache.has(s)) return cache.get(s);
  let out = '';
  // eslint-disable-next-line no-control-regex
  if (!/[\u0000-\u001f\u007f]/.test(s) && !WIDE.has(s.toLowerCase())) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        probe = probe || document.createElement('span');
        const st = probe.style;
        if (st && 'fontFamily' in st) {
          st.fontFamily = '';
          st.fontFamily = s;
          out = String(st.fontFamily || '');
          st.fontFamily = '';
          if (WIDE.has(out.toLowerCase())) out = '';
        }
      } catch {
        out = '';
      }
    }
  }
  if (cache.size > 500) cache.clear();
  cache.set(s, out);
  return out;
}
