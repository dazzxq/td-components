/**
 * General-purpose, framework-free utility toolbox.
 *
 * Ported (the architecture-free parts only) from dcms-utils.js. Every function here
 * is PURE — no DOM access, no network, no Laravel/CSRF coupling — so it runs in Node
 * and the browser alike and is unit-testable without a DOM. App-specific helpers
 * (`getCsrfToken`, `handleApiResponse`, `convertImageResizeUrl`, `copyToClipboard`)
 * are intentionally NOT ported here.
 *
 * This is a standalone toolbox: no component is forced to use it. Import what you need.
 *
 * @module utils/dom-utils
 */
import { luminance, contrast, pickPole } from '../theme/color.js';

/**
 * Convert a string to a URL-friendly slug, with first-class Vietnamese support
 * (đ → d, all tone/diacritic vowels → their base Latin letter).
 *
 * @param {string} text - Source text.
 * @returns {string} Lowercase, hyphen-separated, `[a-z0-9-]`-only slug ('' for non-strings).
 * @example
 * slugify('Chuyên mục Tin tức'); // 'chuyen-muc-tin-tuc'
 * slugify('Hello World 123');    // 'hello-world-123'
 */
export function slugify(text) {
  if (!text || typeof text !== 'string') return '';

  // Explicit Vietnamese map first: covers đ/Đ (which NFD does NOT decompose) and
  // guarantees correct folding regardless of the runtime's Unicode normalization.
  const vietnameseMap = {
    'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'đ': 'd',
    'À': 'a', 'Á': 'a', 'Ạ': 'a', 'Ả': 'a', 'Ã': 'a',
    'Â': 'a', 'Ầ': 'a', 'Ấ': 'a', 'Ậ': 'a', 'Ẩ': 'a', 'Ẫ': 'a',
    'Ă': 'a', 'Ằ': 'a', 'Ắ': 'a', 'Ặ': 'a', 'Ẳ': 'a', 'Ẵ': 'a',
    'È': 'e', 'É': 'e', 'Ẹ': 'e', 'Ẻ': 'e', 'Ẽ': 'e',
    'Ê': 'e', 'Ề': 'e', 'Ế': 'e', 'Ệ': 'e', 'Ể': 'e', 'Ễ': 'e',
    'Ì': 'i', 'Í': 'i', 'Ị': 'i', 'Ỉ': 'i', 'Ĩ': 'i',
    'Ò': 'o', 'Ó': 'o', 'Ọ': 'o', 'Ỏ': 'o', 'Õ': 'o',
    'Ô': 'o', 'Ồ': 'o', 'Ố': 'o', 'Ộ': 'o', 'Ổ': 'o', 'Ỗ': 'o',
    'Ơ': 'o', 'Ờ': 'o', 'Ớ': 'o', 'Ợ': 'o', 'Ở': 'o', 'Ỡ': 'o',
    'Ù': 'u', 'Ú': 'u', 'Ụ': 'u', 'Ủ': 'u', 'Ũ': 'u',
    'Ư': 'u', 'Ừ': 'u', 'Ứ': 'u', 'Ự': 'u', 'Ử': 'u', 'Ữ': 'u',
    'Ỳ': 'y', 'Ý': 'y', 'Ỵ': 'y', 'Ỷ': 'y', 'Ỹ': 'y',
    'Đ': 'd',
  };

  let result = text.trim();
  for (const [vi, latin] of Object.entries(vietnameseMap)) {
    result = result.split(vi).join(latin);
  }

  return result
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip any remaining combining diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Human-readable byte size.
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} e.g. '0 Bytes', '1.5 KB', '2.34 MB'.
 * @example formatFileSize(1536); // '1.5 KB'
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
  return parseFloat((n / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Compact number formatting: 1.2K / 3.4M; below 1000 uses vi-VN grouping.
 *
 * @param {number} num - Value to format.
 * @returns {string}
 * @example formatNumber(1500); // '1.5K'
 */
export function formatNumber(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return new Intl.NumberFormat('vi-VN').format(n);
}

/**
 * Trailing-edge debounce: defers `func` until `wait` ms have passed since the last call.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} func - Function to debounce.
 * @param {number} wait - Delay in milliseconds.
 * @returns {(...args: Parameters<F>) => void} Debounced wrapper.
 */
export function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Leading-edge throttle: invokes `func` at most once per `limit` ms.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} func - Function to throttle.
 * @param {number} limit - Minimum gap between calls in milliseconds.
 * @returns {(...args: Parameters<F>) => void} Throttled wrapper.
 */
export function throttle(func, limit) {
  let inThrottle = false;
  return function throttled(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * Parse a CSS color string to `{r,g,b}` (0–255). PURE — supports `#rgb`, `#rrggbb`,
 * and `rgb()/rgba()`. Returns `null` for anything it can't resolve without a DOM
 * (e.g. named colors like `tomato`).
 *
 * @param {string} color - Color string.
 * @returns {{r:number,g:number,b:number}|null}
 */
export function parseColorToRgb(color) {
  if (typeof color !== 'string') return null;
  const c = color.trim();

  const full = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  if (full) return { r: parseInt(full[1], 16), g: parseInt(full[2], 16), b: parseInt(full[3], 16) };

  const short = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(c);
  if (rgb) {
    const r = Math.min(255, parseInt(rgb[1], 10));
    const g = Math.min(255, parseInt(rgb[2], 10));
    const b = Math.min(255, parseInt(rgb[3], 10));
    return { r, g, b };
  }

  return null;
}

/**
 * WCAG relative luminance of an `{r,g,b}` color (0–1).
 * @param {{r:number,g:number,b:number}} rgb
 * @returns {number}
 */
export function relativeLuminance({ r, g, b }) {
  return luminance({ r: r / 255, g: g / 255, b: b / 255 }); // v0.42.0: one implementation (src/theme/color.js)
}

/**
 * WCAG contrast ratio (1–21) between two colors. Each color may be a CSS string
 * (`#rgb`/`#rrggbb`/`rgb()`) or an `{r,g,b}` object.
 *
 * @param {string|{r:number,g:number,b:number}} color1
 * @param {string|{r:number,g:number,b:number}} color2
 * @returns {number} Contrast ratio, or `1` if either color can't be parsed.
 */
export function contrastRatio(color1, color2) {
  const rgb1 = typeof color1 === 'string' ? parseColorToRgb(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? parseColorToRgb(color2) : color2;
  if (!rgb1 || !rgb2) return 1;
  const to01 = (c) => ({ r: c.r / 255, g: c.g / 255, b: c.b / 255 });
  return contrast(to01(rgb1), to01(rgb2));
}

/**
 * Pick the accessible foreground (`#ffffff` or `#000000`) for a given background,
 * choosing whichever yields the higher WCAG contrast ratio. PURE.
 *
 * @param {string|{r:number,g:number,b:number}} backgroundColor - `#rgb`/`#rrggbb`/`rgb()` or `{r,g,b}`.
 * @returns {'#ffffff'|'#000000'} Best-contrast text color (defaults to white if unparseable).
 */
export function getAccessibleTextColor(backgroundColor) {
  const rgb = typeof backgroundColor === 'string' ? parseColorToRgb(backgroundColor) : backgroundColor;
  if (!rgb) return '#ffffff';
  return pickPole({ r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 }, { tie: 'white' });
}
