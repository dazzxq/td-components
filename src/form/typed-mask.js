import { maskTypedValue, maskCaret } from '../utils/datetime.js';

/**
 * v0.63.1: re-mask an `editable` date input after the user INSERTED text (typing, paste, drop). Deletions are never re-masked
 * (Backspace over a separator must not bring it back); during an IME composition nothing is rewritten — the mask runs once on
 * `compositionend` instead (maskAfterComposition). The caret stays right after the same digit it followed (end stays end).
 * @param {InputEvent} e the `input` event of the field
 * @param {HTMLInputElement} input
 * @param {string} mode
 */
export function maskOnInput(e, input, mode) {
  if (e.isComposing || !String(e.inputType || '').startsWith('insert')) return;
  applyMask(input, mode);
}

/**
 * v0.63.1 (Codex impl r1): the text an IME composition committed is masked when the composition ends.
 * @param {HTMLInputElement} input
 * @param {string} mode
 */
export function maskAfterComposition(input, mode) {
  applyMask(input, mode);
}

/** @param {HTMLInputElement} input @param {string} mode */
function applyMask(input, mode) {
  const v = input.value;
  const next = maskTypedValue(v, mode);
  if (next === v) return;
  const pos = typeof input.selectionStart === 'number' ? input.selectionStart : v.length;
  const digits = (v.slice(0, pos).match(/\d/g) || []).length;
  input.value = next;
  const caret = pos >= v.length ? next.length : maskCaret(next, digits);
  try {
    input.setSelectionRange(caret, caret);
  } catch { /* not focused / unsupported: the value is what matters */ }
}
