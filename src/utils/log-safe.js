/**
 * Console-safe text (CWE-117 / CWE-400) — shared by td-repeater (v0.56.0, Codex security r1) and td-action-button (v0.59.0,
 * Codex security r1 / r2). A site / API supplied value repeated in a console warning is cut to `max` code points FIRST
 * (lazy iteration — a huge value is never copied whole), then C0 / DEL / C1 controls, U+2028 / U+2029 and the bidi controls
 * (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) are escaped as \uXXXX and `\` / `"` are backslash-escaped — so a
 * value can neither forge log lines, reorder the text a reader sees, nor close the quotes the message puts around it.
 */

/** Longest value text a warning repeats. */
export const LOG_TEXT_MAX = 64;

const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g;

/**
 * @param {*} v any value (String(v))
 * @param {number} [max] code points kept
 * @returns {string}
 */
export function logSafe(v, max = LOG_TEXT_MAX) {
  let out = '';
  let n = 0;
  for (const ch of String(v)) { // the string iterator walks code points lazily: stops after `max`
    if (n >= max) break;
    out += ch;
    n += 1;
  }
  return out.replace(/[\\"]/g, (c) => `\\${c}`)
    .replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** @param {*} v @returns {number} the length of String(v) in UTF-16 code units (O(1); shown next to a cut value) */
export function logLength(v) {
  return String(v).length;
}
