/**
 * Shared crop dialog — v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md M3, decisions 8, 21, 24, 28). INTERNAL:
 * not a custom element, not exported from the package entry (public door: `TdCropper.openDialog`). Used by
 * td-media-picker (crop step, `nested: true`) and td-media-field ("Cắt ảnh"); one function for every integration.
 *
 * Shell = `openDialogLayer` (LAYERS.modal; band promotion / DOM order put it above a picker) + the td-modal DOM / CSS
 * (`td-modal--lg` from 720 px, full viewport below 720 and when the viewport is short — cropper.css). Escape / × /
 * "Huỷ" = cancel; an Escape consumed by an in-progress drag never reaches the layer registry (td-cropper swallows it in
 * a window capture listener), so it never closes the dialog. Focus: into the dialog at once, then (onOpened, root
 * `data-state="open"`) onto the crop box once the image is ready; back to `opener` (or the generic restore) on close.
 *
 * Only ONE crop dialog at a time: a second call while one is open REJECTS with an Error (the caller keeps its own
 * double-open lock; the media field and the picker share this one).
 *
 * DOM:
 *   <div class="td-modal td-modal--lg td-crop-dialog" data-state="opening|open|closing">  (+ td-crop-dialog--nested)
 *     <div class="td-modal__backdrop" aria-hidden="true"></div>
 *     <div class="td-modal__dialog td-glass-surface … td-crop-dialog__dialog" role="dialog" aria-modal="true" aria-labelledby tabindex="-1">
 *       <div class="td-modal__header"><h2 class="td-modal__title">Cắt ảnh · 16:9</h2><button class="td-modal__close"></div>
 *       <div class="td-modal__body td-crop-dialog__body"><td-cropper class="td-crop-dialog__cropper"></div>
 *       <div class="td-modal__footer td-crop-dialog__footer">button.td-btn--secondary.td-crop-dialog__cancel ·
 *         button.td-btn--primary.td-crop-dialog__confirm [disabled while loading / error]</div>
 *     </div>
 *   </div>
 *
 * @module feedback/crop-dialog
 */
import { openDialogLayer } from './dialog-layer.js';
import { LAYERS } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { TdCropper } from '../form/td-cropper.js';
import { cropChanged, focalChanged, isWholeImage, clampFocal, round4 } from '../utils/crop-geometry.js';
import { cropRatioInRange } from '../utils/media-field-model.js';

let warnedRatio = false;
function warnRatioOnce() {
  if (warnedRatio) return;
  warnedRatio = true;
  console.warn('td-crop-dialog: aspectRatio must be a number in [0.01, 100] — rejected, the crop is free.');
}

/** @typedef {import('../utils/crop-geometry.js').CropValue} CropValue */
/**
 * @typedef {{ status: 'applied', crop: CropValue|null, focalPoint: {x:number,y:number}|null, changed: boolean }
 *   | { status: 'cancelled' }} CropDialogResult
 */

/** @type {{ root: HTMLElement }|null} the open dialog (one at a time) */
let current = null;
let seq = 0;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
/** natural size option → attribute string (integer 1–100000) or null */
const sizeAttr = (v) => (fin(v) && v >= 1 && v <= 100000 && Number.isInteger(v) ? String(v) : null);

/**
 * A ratio number as an exact small fraction when there is one (16/9 → { w: 16, h: 9 }), else null.
 * @param {number} r @returns {{ w: number, h: number }|null}
 */
function fraction(r) {
  for (let h = 1; h <= 100; h += 1) {
    const w = Math.round(r * h);
    if (w >= 1 && w <= 10000 && Math.abs(w / h - r) < 1e-9) return { w, h };
  }
  return null;
}

/**
 * `aspect-ratio` attribute for a locked ratio (parseAspectRatio accepts `W/H` or ≤ 4 decimals).
 * @param {number} r @returns {string}
 */
function ratioAttr(r) {
  const f = fraction(r);
  if (f) return `${f.w}/${f.h}`;
  // review R1 #5: lossless enough (≥ 7 significant digits) within parseAspectRatio's W:H form (each part ≤ 10000, ≤ 4
  // decimals): the side that is ≥ 1 becomes 10000, the other one is scaled — r ∈ [0.01, 100] ⇒ that part ∈ [100, 10000]
  return r <= 1 ? `${round4(r * 10000)}:10000` : `10000:${round4(10000 / r)}`;
}

/**
 * The title suffix of a locked ratio: a preset's label when it matches (1.91 → "1.91:1"), else "W:H" / 4 decimals.
 * @param {number} r @returns {string}
 */
export function ratioLabel(r) {
  const presets = Array.isArray(TdCropper.presets) ? TdCropper.presets : [];
  const hit = presets.find((p) => p && fin(p.ratio) && Math.abs(p.ratio - r) < 1e-4 && typeof p.label === 'string');
  if (hit) return hit.label;
  const f = fraction(r);
  return f ? `${f.w}:${f.h}` : String(round4(r));
}

/** a normalised box option → `{ x, y, width, height }` or null */
function boxOpt(v) {
  const n = v && typeof v === 'object' && v.normalized && typeof v.normalized === 'object' ? v.normalized : v;
  if (!n || typeof n !== 'object') return null;
  const b = { x: n.x, y: n.y, width: n.width, height: n.height };
  return [b.x, b.y, b.width, b.height].every(fin) && b.width > 0 && b.height > 0 ? b : null;
}

/**
 * Open the crop dialog.
 *
 * Result `crop`: the cropper's `CropValue`, EXCEPT a whole-image result (`isWholeImage`) ⇒ `null` (decision 8: "no crop
 * — use the whole image"; done ONCE here for every integration). `changed`: false when nothing effective changed — the
 * input crop (`null` ⇒ whole image) vs the result (`null` ⇒ whole image) within one model pixel per axis (`cropChanged`),
 * and the focal point within 1e-6 (`focalChanged`). A locked-ratio dialog opened with `crop: null` starts from the
 * largest box of that ratio (not the whole image) ⇒ `changed: true` on "Áp dụng" — correct, the caller must store it.
 *
 * @param {object} [opts]
 * @param {string} opts.src image URL (safeMediaUrl inside td-cropper; refused ⇒ error state, confirm stays disabled)
 * @param {string} [opts.alt='']
 * @param {number} [opts.naturalWidth] original size (integers 1–100000, both or neither; omit ⇒ no `pixels`)
 * @param {number} [opts.naturalHeight]
 * @param {number|null} [opts.aspectRatio=null] a number ⇒ locked (title "Cắt ảnh · 16:9"); null ⇒ free + presets
 * @param {{x:number,y:number,width:number,height:number}|null} [opts.crop=null] normalised start crop
 * @param {{x:number,y:number}|null} [opts.focalPoint=null]
 * @param {boolean} [opts.allowFocalPoint=false] show the focal-point tool
 * @param {string} [opts.title] default `TdCropper.labels.dialogTitle` ('Cắt ảnh')
 * @param {string} [opts.confirmLabel] default 'Áp dụng'
 * @param {string} [opts.cancelLabel] default 'Huỷ'
 * @param {boolean} [opts.nested=false] opened over another dialog (picker): no scroll lease of its own, class
 *   `td-crop-dialog--nested`
 * @param {AbortSignal} [opts.signal] abort ⇒ the dialog closes AND its root is removed at once (no exit transition —
 *   owner teardown), resolves `{ status: 'cancelled' }`
 * @param {HTMLElement|null} [opts.opener] focus restore target (default: the focused element at open)
 * @returns {Promise<CropDialogResult>} rejects only when another crop dialog is open
 */
export function openCropDialog(opts = /** @type {any} */ ({})) {
  if (current) return Promise.reject(new Error('td-crop-dialog: a crop dialog is already open'));
  const o = opts && typeof opts === 'object' ? opts : /** @type {any} */ ({});
  const signal = o.signal;
  if (signal && signal.aborted) return Promise.resolve({ status: 'cancelled' });
  const L = TdCropper.labels;
  const str = (v, d) => (typeof v === 'string' && v.trim() ? v : d);
  let lock = null;
  if (o.aspectRatio != null) {
    if (cropRatioInRange(o.aspectRatio)) lock = o.aspectRatio;
    else warnRatioOnce(); // review R1 #5: rejected (free crop), never silently
  }
  const cropIn = boxOpt(o.crop);
  const focalIn = clampFocal(o.focalPoint);
  const id = `td-crop-dialog-${++seq}`;

  /** @type {(r: CropDialogResult) => void} */
  let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  let done = false;
  let size = { W: 0, H: 0 };
  /** @type {ReturnType<typeof openDialogLayer>|null} (td-cropper may report an error synchronously while mounting) */
  let handle = null;
  const onTop = () => !!handle && root.getAttribute('data-state') === 'open' && handle.layer.isTop();

  // --- shell (static markup; every dynamic value through the DOM) ---
  const root = document.createElement('div');
  root.className = 'td-modal td-modal--lg td-crop-dialog';
  if (o.nested) root.classList.add('td-crop-dialog--nested');
  root.setAttribute('data-state', 'opening');
  root.innerHTML = '<div class="td-modal__backdrop" aria-hidden="true"></div>'
    + '<div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg td-crop-dialog__dialog"'
    + ' role="dialog" aria-modal="true" tabindex="-1">'
    + '<div class="td-modal__header"><h2 class="td-modal__title"></h2>'
    + '<button type="button" class="td-modal__close"><span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"></span></button></div>'
    + '<div class="td-modal__body td-crop-dialog__body"></div>'
    + '<div class="td-modal__footer td-crop-dialog__footer">'
    + '<button type="button" class="td-btn td-btn--secondary td-crop-dialog__cancel"><span class="td-btn__label"></span></button>'
    + '<button type="button" class="td-btn td-btn--primary td-crop-dialog__confirm" disabled><span class="td-btn__label"></span></button>'
    + '</div></div>';
  const q = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const dialog = q('.td-crop-dialog__dialog');
  const title = q('.td-modal__title');
  title.id = `${id}-title`;
  const head = str(o.title, L.dialogTitle);
  title.textContent = lock ? `${head} · ${ratioLabel(lock)}` : head;
  dialog.setAttribute('aria-labelledby', title.id);
  const x = q('.td-modal__close');
  x.setAttribute('aria-label', str(o.cancelLabel, L.dialogCancel));
  root.querySelector('.td-modal__backdrop').addEventListener('mousedown', (e) => e.preventDefault());
  fillIconSlots(root);
  const cancelBtn = /** @type {HTMLButtonElement} */ (q('.td-crop-dialog__cancel'));
  cancelBtn.querySelector('.td-btn__label').textContent = str(o.cancelLabel, L.dialogCancel);
  const confirmBtn = /** @type {HTMLButtonElement} */ (q('.td-crop-dialog__confirm'));
  confirmBtn.querySelector('.td-btn__label').textContent = str(o.confirmLabel, L.dialogApply);

  const cropper = /** @type {TdCropper} */ (document.createElement('td-cropper'));
  cropper.className = 'td-crop-dialog__cropper';
  if (lock) cropper.setAttribute('aspect-ratio', ratioAttr(lock));
  const nw = sizeAttr(o.naturalWidth);
  const nh = sizeAttr(o.naturalHeight);
  if (nw && nh) {
    cropper.setAttribute('natural-width', nw);
    cropper.setAttribute('natural-height', nh);
  }
  if (typeof o.alt === 'string' && o.alt) cropper.setAttribute('alt', o.alt);
  if (o.allowFocalPoint) cropper.setAttribute('focal-point', '');
  cropper.crop = cropIn;
  cropper.focalPoint = focalIn;
  cropper.setAttribute('src', typeof o.src === 'string' ? o.src : '');
  q('.td-crop-dialog__body').appendChild(cropper);

  const focusBox = () => {
    const box = /** @type {HTMLElement|null} */ (cropper.querySelector('.td-cropper__box'));
    if (box) { try { box.focus({ preventScroll: true }); } catch { /* ignore */ } }
  };
  /** focus is still "nowhere in particular" (the dialog itself, or nothing inside the root) */
  const idle = () => {
    const a = document.activeElement;
    return !a || a === dialog || a === document.body || !root.contains(a);
  };

  cropper.addEventListener('image-ready', (e) => {
    size = { W: e.detail.naturalWidth, H: e.detail.naturalHeight };
    confirmBtn.disabled = false;
    if (onTop() && idle()) focusBox();
  });
  cropper.addEventListener('image-error', () => {
    confirmBtn.disabled = true;
    if (onTop() && idle()) {
      try { cancelBtn.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  });

  /**
   * @param {CropDialogResult} result
   * @param {boolean} [immediate] abort (owner teardown): close + remove the root NOW (no exit transition)
   */
  const finish = (result, immediate = false) => {
    if (done) return;
    done = true;
    if (current && current.root === root) current = null;
    if (signal) signal.removeEventListener('abort', onAbort);
    if (handle) {
      handle.close(result.status);
      if (immediate) handle.release();
    }
    resolve(result);
  };
  const cancel = () => finish({ status: 'cancelled' });
  const apply = () => {
    if (done || confirmBtn.disabled) return;
    const r = cropper.getResult();
    if (!r.crop) return; // not ready (the button is disabled then anyway)
    const crop = isWholeImage(r.crop) ? null : r.crop;
    const changed = cropChanged(cropIn, crop ? crop.normalized : null, size.W, size.H)
      || focalChanged(focalIn, r.focalPoint);
    finish({ status: 'applied', crop, focalPoint: r.focalPoint, changed });
  };
  const onAbort = () => finish({ status: 'cancelled' }, true);

  x.addEventListener('click', cancel);
  cancelBtn.addEventListener('click', cancel);
  confirmBtn.addEventListener('click', apply);

  // v0.36.2 (ADR 0019): no `viewport` on purpose — the crop dialog has no text control (preset buttons + the crop box
  // only), so the on-screen keyboard never opens over it.
  handle = openDialogLayer({
    root,
    dialog,
    layer: LAYERS.modal,
    scrollLock: !o.nested,
    opener: o.opener instanceof HTMLElement ? o.opener : undefined,
    backdrop: root.querySelector('.td-modal__backdrop'),
    onEscape: () => {
      if (cropper.hasAttribute('data-dragging')) return true; // (td-cropper normally swallows it first)
      cancel();
      return true;
    },
    onOpened: () => {
      if (done) return;
      root.setAttribute('data-state', 'open');
      if (!onTop() || !idle()) return;
      if (cropper.getAttribute('data-state') === 'ready') focusBox();
      else if (cropper.getAttribute('data-state') === 'error') {
        try { cancelBtn.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    },
  });
  current = { root };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  return promise;
}
