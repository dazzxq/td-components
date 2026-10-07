/**
 * Pressed state for touch / pen (v0.36.2, ADR 0019, plan QĐ 7). Internal module (no package subpath).
 *
 * The kit CSS paints every interactive control's pressed look on `:is(:active, [data-td-pressed])`. WebKit on iOS only
 * applies `:active` when the page has a `touchstart` listener, so the look must not depend on that quirk:
 * `ensurePressStates()` attaches ONE passive listener set per document (lazily — first TdBaseElement connect,
 * openDialogLayer(), lightbox open, toast container; never at import) and, for `touch` / `pen` pointers, puts
 * `data-td-pressed` on the nearest control (`closest(PRESS_SELECTOR)`) while the finger is down. It is removed on
 * pointerup / pointercancel / lostpointercapture of the same pointer, when that pointer moves past `dragSlop()` (it
 * became a scroll or a drag), on window blur and on visibilitychange. One element holds it at a time. No
 * preventDefault, no scroll blocking. Mouse presses keep the native `:active` only.
 *
 * PRESS_TARGETS = the normalised bases of every pressed rule in the kit CSS (scripts/css-touch.mjs `pressedBases()`;
 * src/styles/css-touch.test.js keeps the two lists equal).
 */
import { dragSlop } from './gesture.js';

export const PRESS_TARGETS = Object.freeze([
  '.td-alert__close',
  '.td-btn',
  '.td-btn--action.td-btn--action-warning',
  '.td-btn--ghost',
  '.td-carousel__btn',
  '.td-carousel__dot',
  '.td-check-matrix__bulk',
  '.td-check-matrix__cell',
  '.td-check-matrix__group-toggle',
  '.td-checkbox',
  '.td-chip-input__option',
  '.td-chip-input__remove',
  '.td-choice__option',
  '.td-color-panel__eyedropper',
  '.td-color-panel__preset',
  '.td-color__clear',
  '.td-color__trigger',
  '.td-copy',
  '.td-cropper__ratio',
  '.td-diff__summary',
  '.td-drawer__close',
  '.td-dropdown__option',
  '.td-dropdown__trigger',
  '.td-dropzone .td-dropzone__zone',
  '.td-dropzone__remove',
  '.td-dtp-wheel__option',
  '.td-dtp__trigger',
  '.td-dtr-panel__preset',
  '.td-dtr-panel__tab',
  '.td-dtr__trigger',
  '.td-filter-chips__remove',
  '.td-form-summary__link',
  '.td-lightbox__back',
  '.td-lightbox__btn',
  '.td-lightbox__error-btn',
  '.td-lightbox__nav > .td-lightbox__btn',
  '.td-lightbox__thumb',
  '.td-masked__toggle',
  '.td-media-field__frame > .td-media-field__open',
  '.td-media-field__open',
  '.td-media-gallery__add',
  '.td-media-gallery__btn',
  '.td-media-gallery__media > .td-sortable__handle',
  '.td-media-grid__open',
  '.td-media-grid__tick',
  '.td-media-grid__tick--mark',
  '.td-media-picker__back',
  '.td-media-picker__card',
  '.td-menu-btn',
  '.td-menu__item',
  '.td-modal__close',
  '.td-number__step',
  '.td-pagination__nav',
  '.td-pagination__page',
  '.td-repeater__btn',
  '.td-scan__status',
  '.td-scroll-top',
  '.td-sortable__handle',
  '.td-switch',
  '.td-table__select',
  '.td-table__select-all',
  '.td-table__sort',
  '.td-table__tree-toggle',
  '.td-tabs__tab',
  '.td-toast',
  '.td-toast__close',
  '.td-timeline__summary',
  '.td-tree-select__clear',
  '.td-tree-select__menu .td-tree__row',
  '.td-tree__row',
  'a.td-steps__step',
  'a.td-timeline__actor',
  'a.td-timeline__title',
  'button.td-steps__step',
  'td-media-grid > td-sortable > [data-td-sort-item] > .td-sortable__handle',
]);

export const PRESS_SELECTOR = PRESS_TARGETS.join(', ');

const ATTR = 'data-td-pressed';
const DISABLED = ':disabled, [aria-disabled="true"]';
const docs = new WeakSet();

/**
 * Attach the press listeners to `doc` once. Returns true when it attached them now.
 * @param {Document | null} [doc]
 */
export function ensurePressStates(doc = globalThis.document) {
  if (!doc || typeof doc.addEventListener !== 'function' || docs.has(doc)) return false;
  docs.add(doc);
  /** @type {{ el: Element, id: number, x: number, y: number, slop: number } | null} */
  let held = null;
  const clear = () => {
    if (!held) return;
    held.el.removeAttribute(ATTR);
    held = null;
  };
  const opts = { passive: true, capture: true };
  doc.addEventListener('pointerdown', (e) => {
    clear();
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const t = e.target;
    const el = t && typeof t.closest === 'function' ? t.closest(PRESS_SELECTOR) : null;
    if (!el || el.matches(DISABLED)) return;
    el.setAttribute(ATTR, '');
    held = { el, id: e.pointerId, x: e.clientX, y: e.clientY, slop: dragSlop(e.pointerType) };
  }, opts);
  doc.addEventListener('pointermove', (e) => {
    if (held && e.pointerId === held.id && Math.hypot(e.clientX - held.x, e.clientY - held.y) > held.slop) clear();
  }, opts);
  const end = (e) => { if (held && e.pointerId === held.id) clear(); };
  doc.addEventListener('pointerup', end, opts);
  doc.addEventListener('pointercancel', end, opts);
  doc.addEventListener('lostpointercapture', end, opts);
  // iOS WebKit applies the native :active only when a touchstart listener exists (empty, passive: no scroll cost)
  doc.addEventListener('touchstart', () => {}, { passive: true });
  doc.addEventListener('visibilitychange', clear, { passive: true });
  doc.defaultView?.addEventListener('blur', clear, { passive: true });
  return true;
}
