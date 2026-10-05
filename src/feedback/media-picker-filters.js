/**
 * Media picker filter sheet (internal, v0.36.0 plan QĐ 49–50) — below 1024px the picker toolbar shows one "Bộ lọc"
 * button instead of the facets; this dialog holds every facet the adapter declares. Sheet-session model:
 *
 * - the picker's COMMITTED filters / descriptors / toolbar controls are never touched while the sheet is open;
 * - the sheet builds NEW controls (createFacetControl) bound to a DRAFT copy of the committed filters — their changes
 *   only edit the draft (no list request, no badge change);
 * - "Áp dụng" hands the draft to `onApply(draft)` ONCE (the picker commits atomically: one list request, or none when
 *   the draft equals the committed filters) and closes;
 * - "Xoá lọc" resets the draft only (the sheet stays open);
 * - × / Escape / destroy() drop the sheet controls and the draft — the committed state is untouched.
 *
 * Shell = the td-modal DOM of an ordinary modal (< 720 the kit's bottom sheet, ≥ 720 a small centred box) through
 * openDialogLayer, like media-picker-upload.js. Static markup only; every dynamic value goes through the DOM.
 * Not a public API.
 * @module feedback/media-picker-filters
 */
import { openDialogLayer } from './dialog-layer.js';
import { nearestScroller } from '../utils/keyboard-viewport.js';
import { LAYERS } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { createFacetControl } from './media-picker-fields.js';

/** Texts (merged into TdMediaPicker.labels). */
export const FILTER_LABELS = {
  filters: 'Bộ lọc',
  filtersActive: 'Bộ lọc, {n} đang áp dụng',
  filtersTitle: 'Bộ lọc',
  filtersApply: 'Áp dụng',
  filtersClear: 'Xoá lọc',
  filtersClose: 'Đóng bộ lọc',
};

/** @param {unknown} v a facet value is "set" (undefined / [] = no filter) */
const isSet = (v) => v !== undefined && !(Array.isArray(v) && !v.length);

/**
 * @param {object} o
 * @param {(key: string, params?: object) => string} o.t
 * @param {Array<object>} o.descriptors the committed (normalised) facet descriptors, in order
 * @param {Record<string, unknown>} o.committed the committed filters (copied, never mutated)
 * @param {string} o.idPrefix
 * @param {(draft: Record<string, unknown>) => void} o.onApply
 * @param {(applied: boolean) => void} [o.onClosing] at once when it starts closing: `applied` true for "Áp dụng" (then
 *   onApply follows), false for × / Escape (the draft is discarded); not called by destroy()
 * @returns {{ root: HTMLElement, close: () => void, destroy: () => void, draft: () => Record<string, unknown> }}
 */
export function openFilterSheet(o) {
  const t = (k, p) => {
    try { return String(o.t(k, p) ?? ''); } catch { return ''; }
  };
  const id = String(o.idPrefix || 'td-media-picker-filters');
  let closing = false;
  let destroyed = false;

  const root = document.createElement('div');
  root.className = 'td-modal td-modal--sm td-media-picker-filters';
  root.setAttribute('data-state', 'opening');
  root.innerHTML = '<div class="td-modal__backdrop" aria-hidden="true"></div>'
    + '<div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg td-media-picker-filters__dialog"'
    + ' role="dialog" aria-modal="true" tabindex="-1">'
    + '<div class="td-modal__header"><h2 class="td-modal__title"></h2>'
    + '<button type="button" class="td-modal__close"><span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
    + '<div class="td-modal__body td-media-picker-filters__body"></div>'
    + '<div class="td-modal__footer td-media-picker-filters__footer"></div>'
    + '</div>';
  const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const dialog = q('.td-media-picker-filters__dialog');
  const body = q('.td-media-picker-filters__body');
  const title = q('.td-modal__title');
  title.id = `${id}-title`;
  title.textContent = t('filtersTitle');
  dialog.setAttribute('aria-labelledby', title.id);
  const x = q('.td-modal__close');
  x.setAttribute('aria-label', t('filtersClose'));
  x.addEventListener('click', () => close());
  root.querySelector('.td-modal__backdrop').addEventListener('mousedown', (e) => e.preventDefault()); // ADR 0006
  fillIconSlots(root);

  // the draft = the sheet controls' values; they start from a COPY of the committed filters
  const committed = JSON.parse(JSON.stringify(o.committed || {}));
  /** @type {Map<string, any>} */
  const controls = new Map();
  for (const f of o.descriptors || []) {
    const c = createFacetControl(f, { idPrefix: `${id}-f` });
    if (isSet(committed[f.key])) c.set(committed[f.key]);
    c.el.classList.add('td-media-picker-filters__facet');
    body.appendChild(c.el);
    controls.set(f.key, c);
  }

  /** @returns {Record<string, unknown>} */
  const draft = () => {
    const out = {};
    for (const [k, c] of controls) {
      const v = c.get();
      if (isSet(v)) out[k] = v;
    }
    return out;
  };

  const mkButton = (label, variant, cls) => {
    const b = /** @type {any} */ (document.createElement('td-button'));
    b.setAttribute('variant', variant);
    b.setAttribute('label', label);
    b.className = cls;
    return b;
  };
  const clear = mkButton(t('filtersClear'), 'ghost', 'td-media-picker-filters__clear');
  clear.addEventListener('click', () => {
    if (closing) return;
    for (const c of controls.values()) c.set(undefined);
  });
  const apply = mkButton(t('filtersApply'), 'primary', 'td-media-picker-filters__apply');
  apply.addEventListener('click', () => {
    if (closing) return;
    const d = draft();
    close(true); // the picker is free again (onClosing(true)) — it reconciles + commits in onApply, once
    try { o.onApply(d); } catch (err) { console.error(err); }
  });
  q('.td-media-picker-filters__footer').append(clear, apply);

  const handle = openDialogLayer({
    root,
    dialog,
    viewport: { root, scroller: nearestScroller(root) }, // v0.36.2: above the keyboard
    layer: LAYERS.modal,
    backdrop: root.querySelector('.td-modal__backdrop'),
    onEscape: () => { close(); return true; },
    onOpened: () => {
      if (closing || destroyed) return;
      root.setAttribute('data-state', 'open');
      const active = document.activeElement;
      if (active && active !== dialog && root.contains(active)) return;
      if (!handle.layer.isTop()) return;
      const first = body.querySelector('input, button:not([disabled]), [tabindex="0"]');
      try { /** @type {HTMLElement} */ ((first || dialog)).focus({ preventScroll: true }); } catch { /* ignore */ }
    },
  });

  const dropControls = () => {
    for (const c of controls.values()) { try { c.destroy(); } catch { /* ignore */ } }
  };

  function close(applied = false) {
    if (closing || destroyed) return;
    closing = true;
    dropControls();
    try { if (typeof o.onClosing === 'function') o.onClosing(applied === true); } catch (err) { console.error(err); }
    void handle.close('close');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closing = true;
    dropControls();
    handle.release();
  }

  return { root, close, destroy, draft };
}
