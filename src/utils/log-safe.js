/**
 * Console-safe text (CWE-117) — shared by td-repeater (v0.56.0, Codex security r1) and td-action-button (v0.59.0, Codex
 * security r1). A site / API supplied value repeated in a console warning is cut to `max` code points FIRST, then C0 /
 * DEL / C1 controls and U+2028 / U+2029 are escaped as \uXXXX and `\` / `"` are backslash-escaped — so a value can neither
 * forge log lines nor close the quotes the message puts around it.
 */

/** Longest value text a warning repeats. */
export const LOG_TEXT_MAX = 64;

/**
 * @param {*} v any value (String(v))
 * @param {number} [max] code points kept
 * @returns {string}
 */
export function logSafe(v, max = LOG_TEXT_MAX) {
  return [...String(v)].slice(0, max).join('')
    .replace(/[\\"]/g, (c) => `\\${c}`)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** @param {*} v @returns {number} the length of String(v) in code points (shown next to a cut value) */
export function logLength(v) {
  return [...String(v)].length;
}
