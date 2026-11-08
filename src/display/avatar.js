/**
 * tdAvatar(src, name, size) — the JS twin of PHP td_avatar() (v0.105.0, plan v0.105.0-avatar). Returns a DOM element,
 * styled by td.css `.td-avatar` (src/styles/components/avatar.css); no custom element, no innerHTML.
 *   - src through safeMediaUrl (https; http only on an http page) → <img class="td-avatar…" alt="" width height
 *     loading="lazy" decoding="async">
 *   - no usable src → <span class="td-avatar… td-avatar--empty" aria-hidden="true"> + the upper-case first grapheme of
 *     the trimmed name, '?' when empty.
 *   - size 'xs' | 'sm' | 'm' | 'lg' (unknown → 'm').
 * Known difference from PHP: td__media_url accepts http: on any page, safeMediaUrl only on an http page.
 */
import { safeMediaUrl } from '../utils/media-url.js';

const PX = { xs: 22, sm: 32, m: 40, lg: 96 };

/** @internal Upper-case first grapheme of the trimmed name; '?' when empty. Mirrors PHP Td::avatarInitial(). */
export function avatarInitial(name) {
  // JS \s + U+0085 (NEL) = the PHP strip set (PCRE \s includes NEL; trimStart does not)
  const s = typeof name === 'string' ? name.replace(/^[\s\u0085]+/u, '') : '';
  if (!s) return '?';
  let g;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    g = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next().value?.segment;
  }
  return (g || Array.from(s)[0] || '?').toUpperCase();
}

/**
 * @param {string|null|undefined} src image URL (refused / empty → the initial)
 * @param {string} [name] display name (initial source)
 * @param {'xs'|'sm'|'m'|'lg'} [size]
 * @returns {HTMLImageElement|HTMLSpanElement}
 */
export function tdAvatar(src, name = '', size = 'm') {
  const sz = Object.prototype.hasOwnProperty.call(PX, size) ? size : 'm';
  const cls = sz === 'm' ? ['td-avatar'] : ['td-avatar', `td-avatar--${sz}`];
  const url = safeMediaUrl(src);
  if (url) {
    const img = document.createElement('img');
    img.classList.add(...cls);
    img.src = url;
    img.alt = '';
    img.width = PX[sz];
    img.height = PX[sz];
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  const span = document.createElement('span');
  span.classList.add(...cls, 'td-avatar--empty');
  span.setAttribute('aria-hidden', 'true');
  span.textContent = avatarInitial(name);
  return span;
}
