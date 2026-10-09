import { maskTypedValue, maskCaret, padTypedSegment, parseTypedValue, invalidReason, formatModeDisplay, toModeParts } from '../utils/datetime.js';

/**
 * v0.63.1 (owner: "chỉ allow digits"): typing anything but a digit into an `editable` date input is refused before it lands
 * (the separators come from the mask). A separator key (`/ . - :` or a space) at the end of the text zero-pads a one-digit day /
 * month / hour / minute instead (`1` + "/" → `01`, so `1/3/1994` gives `01/03/1994`). Paste / drop / autocomplete are cleaned
 * up afterwards by maskOnInput.
 * @param {InputEvent} e the `beforeinput` event of the field
 * @param {HTMLInputElement} input
 * @param {string} mode
 */
export function refuseNonDigits(e, input, mode) {
  if (e.isComposing) return; // an IME composition: cleaned up on compositionend
  if ((e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') || typeof e.data !== 'string' || !/\D/.test(e.data)) return;
  e.preventDefault();
  const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
  if (!atEnd || !/^[/.\-: ]$/.test(e.data)) return;
  const next = padTypedSegment(input.value, mode);
  if (next === null) return;
  input.value = next;
  setCaret(input, next.length);
}

/**
 * v0.63.1: re-mask an `editable` date input after the user INSERTED text (typing, paste, drop). Deletions are never re-masked
 * (Backspace over a separator must not bring it back); during an IME composition nothing is rewritten — the mask runs once on
 * `compositionend` instead (maskAfterComposition). A paste / drop of a whole date in any format the field reads (`15/03/1994`,
 * `1994-03-15`…) becomes the display format; anything else keeps its digits only. The caret stays after the same digit.
 * @param {InputEvent} e the `input` event of the field
 * @param {HTMLInputElement} input
 * @param {string} mode
 */
export function maskOnInput(e, input, mode) {
  if (e.isComposing || !String(e.inputType || '').startsWith('insert')) return;
  if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') {
    const p = parseTypedValue(input.value, mode);
    if (p && !invalidReason(p)) {
      const text = formatModeDisplay(toModeParts(p, mode), mode);
      input.value = text;
      setCaret(input, text.length);
      return;
    }
  }
  applyMask(input, mode);
}

/** @type {WeakMap<HTMLInputElement, string>} the value when the current composition started */
const composing = new WeakMap();

/**
 * v0.63.1: remember the value a composition starts from (maskAfterComposition masks only what it changed).
 * @param {HTMLInputElement} input
 */
export function compositionStarted(input) {
  composing.set(input, input.value);
}

/**
 * v0.63.1 (Codex impl r1 / r2): the text an IME composition COMMITTED is masked (digits only) when the composition ends; a
 * cancelled one (the value is what it was at compositionstart — e.g. an intentionally unmasked deletion) is left alone.
 * @param {HTMLInputElement} input
 * @param {string} mode
 */
export function maskAfterComposition(input, mode) {
  const before = composing.get(input);
  composing.delete(input);
  if (before === undefined || before === input.value) return;
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
  setCaret(input, pos >= v.length ? next.length : maskCaret(next, digits));
}

/** @param {HTMLInputElement} input @param {number} at */
function setCaret(input, at) {
  try {
    input.setSelectionRange(at, at);
  } catch { /* not focused / unsupported: the value is what matters */ }
}
