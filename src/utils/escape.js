/**
 * Escape HTML entities to prevent XSS when interpolating user data in innerHTML.
 * @param {string} str - Raw string to escape
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
