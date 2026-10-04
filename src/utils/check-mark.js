/**
 * Shared tick mark markup (v0.36.0, ADR 0017) — the decorative `.td-check` (styles: src/styles/components/check.css)
 * that every "tick to select" uses so it looks exactly like td-checkbox. Internal (no subpath export).
 *
 *   <span class="td-check td-check--{sm|md|lg}[ td-check--on-media]" aria-hidden="true">
 *     <svg class="td-icon … td-check__svg" data-icon="check">…</svg>
 *   </span>
 *
 * Always aria-hidden: the container carries the semantics (aria-pressed / aria-checked / aria-selected). Never nest a
 * <td-checkbox> instead (nested interactive controls, form-associated → FormData leak, two sources of state).
 */
import { tdIcon } from '../icons/td-icon.js';

const SIZES = ['sm', 'md', 'lg'];

/** @param {unknown} size @returns {'sm'|'md'|'lg'} */
export function checkSize(size) {
  return SIZES.includes(/** @type {string} */ (size)) ? /** @type {'sm'|'md'|'lg'} */ (size) : 'md';
}

/**
 * Class list of a mark.
 * @param {'sm'|'md'|'lg'} [size]
 * @param {{ onMedia?: boolean }} [opts]
 */
function classes(size, opts) {
  return `td-check td-check--${checkSize(size)}${opts && opts.onMedia ? ' td-check--on-media' : ''}`;
}

/**
 * HTML string of a mark (for string renders; the icon slot is filled by fillIconSlots()).
 * @param {'sm'|'md'|'lg'} [size]
 * @param {{ onMedia?: boolean }} [opts]
 * @returns {string}
 */
export function checkMarkHTML(size, opts) {
  return `<span class="${classes(size, opts)}" aria-hidden="true">`
    + '<span class="td-check__icon" data-td-icon="check" data-td-icon-class="td-check__svg"></span></span>';
}

/**
 * DOM mark (for DOM-API renders).
 * @param {'sm'|'md'|'lg'} [size]
 * @param {{ onMedia?: boolean }} [opts]
 * @returns {HTMLSpanElement}
 */
export function createCheckMark(size, opts) {
  const mark = document.createElement('span');
  mark.className = classes(size, opts);
  mark.setAttribute('aria-hidden', 'true');
  const svg = tdIcon('check', { size: 's', class: 'td-check__svg' });
  if (svg) mark.appendChild(svg);
  return mark;
}
