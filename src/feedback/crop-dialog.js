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
 *         (v0.117.0: + p.td-crop-dialog__message first in the footer, created only when `minSize` / `onApply` needs it)
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
import { cropRatioInRange, parseCropMode, parseCropShape } from '../utils/media-field-model.js';
import { setButtonBusy } from '../form/button-busy.js';

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
 * @param {'box'|'pan'|'focal'} [opts.mode='box'] v0.75.0: `pan` ⇒ `<td-cropper mode="pan">` (frame still, image moves —
 *   avatars); v0.113.0: `focal` ⇒ `<td-cropper mode="focal">` (a focal point only: title `TdCropper.labels.focalTitle`,
 *   `aspectRatio` / `shape` / `crop` / `allowFocalPoint` ignored, "Áp dụng" as soon as the image is ready, result
 *   `crop: null` + the focal point, `changed` = the focal point moved from `focalPoint`). Same grammar as the attribute
 *   (trimmed, case-insensitive; anything else = `box`, no attribute set)
 * @param {'rect'|'circle'} [opts.shape='rect'] v0.75.0: `circle` ⇒ `shape="circle"` (the cropper ignores it unless pan + 1:1)
 * @param {{x:number,y:number,width:number,height:number}|null} [opts.crop=null] normalised start crop
 * @param {{x:number,y:number}|null} [opts.focalPoint=null]
 * @param {boolean} [opts.allowFocalPoint=false] show the focal-point tool
 * @param {boolean} [opts.focalPointOptional=false] v0.119.0 (QĐ2): with `allowFocalPoint` in box / pan ⇒ the cropper's
 *   `focal-optional` attribute (a null focal point stays null until the user places one); ignored in focal mode
 * @param {Array<{ label: string, ratio: number|null }>} [opts.presets] v0.119.0 (QĐ3): the cropper's `presets` for this
 *   dialog (validated by td-cropper: invalid entries dropped, empty ⇒ `TdCropper.presets`); ignored in focal mode
 * @param {string} [opts.ratioLabel] v0.119.0 (QĐ3): the title suffix of a locked ratio (default: `ratioLabel(r)`)
 * @param {string} [opts.busyMessage] v0.119.0 (QĐ4, INTERNAL): footer status text while the `onApply` gate runs
 * @param {string} [opts.title] default `TdCropper.labels.dialogTitle` ('Cắt ảnh')
 * @param {string} [opts.confirmLabel] default 'Áp dụng'
 * @param {string} [opts.cancelLabel] default 'Huỷ'
 * @param {boolean} [opts.nested=false] opened over another dialog (picker): no scroll lease of its own, class
 *   `td-crop-dialog--nested`
 * @param {AbortSignal} [opts.signal] abort ⇒ the dialog closes AND its root is removed at once (no exit transition —
 *   owner teardown), resolves `{ status: 'cancelled' }`
 * @param {HTMLElement|null} [opts.opener] focus restore target (default: the focused element at open)
 * @param {Element|null} [opts.themeRoot] v0.42.0 (ADR 0020): render in this element's theme scope (`[data-td-theme]`)
 * @param {{ width?: number, height?: number }|null} [opts.minSize] v0.117.0 (QĐ3, INTERNAL — the picker's
 *   `selection.minSize`): while the crop (natural pixels: `pixels`, else `normalized × naturalWidth / Height`, else × the
 *   loaded image size) is below a given axis, "Áp dụng" is disabled and `minSizeMessage` is shown in the footer.
 *   td-cropper has no minimum of its own, so this is a check on the crop as it changes, not a drag limit.
 * @param {string} [opts.minSizeMessage]
 * @param {(result: CropDialogResult, ctx: { signal: AbortSignal }) => Promise<{ ok: boolean, message?: string }>} [opts.onApply]
 *   v0.117.0 (QĐ4, INTERNAL — the picker's `beforeApply`): awaited on "Áp dụng" before the dialog resolves. While it
 *   runs: "Áp dụng" busy (`setButtonBusy`), the cropper `disabled`, the dialog `aria-busy="true"`; × / "Huỷ" / Escape /
 *   `signal` still close (and abort its signal). `{ ok: true }` ⇒ resolves `applied`; else the dialog stays open, the
 *   crop kept for a retry, `message` (when given) shown in the footer.
 * @returns {Promise<CropDialogResult>} rejects only when another crop dialog is open
 */
export function openCropDialog(opts = /** @type {any} */ ({})) {
  if (current) return Promise.reject(new Error('td-crop-dialog: a crop dialog is already open'));
  const o = opts && typeof opts === 'object' ? opts : /** @type {any} */ ({});
  const signal = o.signal;
  if (signal && signal.aborted) return Promise.resolve({ status: 'cancelled' });
  const L = TdCropper.labels;
  const str = (v, d) => (typeof v === 'string' && v.trim() ? v : d);
  const focal = parseCropMode(o.mode) === 'focal'; // v0.113.0
  let lock = null;
  if (o.aspectRatio != null && !focal) { // focal: no box ⇒ no ratio, silently
    if (cropRatioInRange(o.aspectRatio)) lock = o.aspectRatio;
    else warnRatioOnce(); // review R1 #5: rejected (free crop), never silently
  }
  const cropIn = focal ? null : boxOpt(o.crop);
  const focalIn = clampFocal(o.focalPoint);
  const id = `td-crop-dialog-${++seq}`;

  /** @type {(r: CropDialogResult) => void} */
  let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  let done = false;
  let size = { W: 0, H: 0 };
  /** @type {ReturnType<typeof openDialogLayer>|null} (td-cropper may report an error synchronously while mounting) */
  let handle = null;
  let busy = false; // v0.117.0: an `onApply` gate is running
  /** @type {AbortController|null} */
  let gateCtrl = null;
  const minSize = o.minSize && typeof o.minSize === 'object' && !focal ? o.minSize : null;
  const onApply = typeof o.onApply === 'function' ? o.onApply : null;
  let tooSmall = false;
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
  const head = str(o.title, focal ? L.focalTitle : L.dialogTitle);
  // v0.119.0 (QĐ3): a per-call `ratioLabel` replaces the computed suffix
  title.textContent = lock ? `${head} · ${typeof o.ratioLabel === 'string' && o.ratioLabel.trim() ? o.ratioLabel.trim() : ratioLabel(lock)}` : head;
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
  // v0.75.0: only the allowlisted constants are ever set (absent option ⇒ no attribute, the 0.74 DOM)
  if (focal) cropper.setAttribute('mode', 'focal');
  else if (parseCropMode(o.mode) === 'pan') cropper.setAttribute('mode', 'pan');
  if (!focal && parseCropShape(o.shape) === 'circle') cropper.setAttribute('shape', 'circle');
  const nw = sizeAttr(o.naturalWidth);
  const nh = sizeAttr(o.naturalHeight);
  if (nw && nh) {
    cropper.setAttribute('natural-width', nw);
    cropper.setAttribute('natural-height', nh);
  }
  if (typeof o.alt === 'string' && o.alt) cropper.setAttribute('alt', o.alt);
  if (o.allowFocalPoint && !focal) cropper.setAttribute('focal-point', ''); // focal: the tool is always on
  // v0.119.0 (QĐ2): an optional focal point (box / pan with the tool only)
  if (o.focalPointOptional === true && o.allowFocalPoint && !focal) cropper.setAttribute('focal-optional', '');
  // v0.119.0 (QĐ3): per-call presets (td-cropper validates them; set before `crop`, which is read against the list)
  if (Array.isArray(o.presets) && !focal) cropper.presets = o.presets;
  cropper.crop = cropIn;
  cropper.focalPoint = focalIn;
  cropper.setAttribute('src', typeof o.src === 'string' ? o.src : '');
  q('.td-crop-dialog__body').appendChild(cropper);

  // v0.117.0: the footer message (min size / a rejected `onApply`), created on first use only (the default DOM is unchanged)
  /** @type {HTMLElement|null} */
  let msgEl = null;
  const say = (text) => {
    if (!text && !msgEl) return;
    if (!msgEl) {
      msgEl = document.createElement('p');
      msgEl.className = 'td-crop-dialog__message';
      msgEl.id = `${id}-message`;
      msgEl.setAttribute('role', 'status');
      q('.td-crop-dialog__footer').prepend(msgEl);
    }
    msgEl.textContent = text || '';
    msgEl.hidden = !text;
    if (text) confirmBtn.setAttribute('aria-describedby', msgEl.id);
    else confirmBtn.removeAttribute('aria-describedby');
  };
  /** v0.117.0 (QĐ3): the crop's natural size meets `minSize` (no crop yet / no minimum ⇒ true) */
  const meetsMin = (crop) => {
    if (!minSize || !crop) return true;
    const n = crop.normalized;
    const W = nw && nh ? Number(nw) : size.W;
    const H = nw && nh ? Number(nh) : size.H;
    const w = crop.pixels ? crop.pixels.width : Math.round(n.width * W);
    const h = crop.pixels ? crop.pixels.height : Math.round(n.height * H);
    if (minSize.width !== undefined && !(w >= minSize.width)) return false;
    if (minSize.height !== undefined && !(h >= minSize.height)) return false;
    return true;
  };
  const checkMin = () => {
    if (!minSize || done || cropper.getAttribute('data-state') !== 'ready') return;
    const small = !meetsMin(cropper.crop);
    if (small === tooSmall && confirmBtn.disabled === small) return;
    tooSmall = small;
    confirmBtn.disabled = small;
    say(small ? str(o.minSizeMessage, '') : '');
  };
  if (minSize) {
    cropper.addEventListener('crop-input', checkMin);
    cropper.addEventListener('crop-change', checkMin);
  }

  const focusBox = () => { // focal mode: the focal point (there is no box)
    const box = /** @type {HTMLElement|null} */ (cropper.querySelector(focal ? '.td-cropper__focal' : '.td-cropper__box'));
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
    checkMin();
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
    if (gateCtrl) { gateCtrl.abort(); gateCtrl = null; } // v0.117.0: closing during an `onApply` gate aborts it
    if (current && current.root === root) current = null;
    if (signal) signal.removeEventListener('abort', onAbort);
    if (handle) {
      handle.close(result.status);
      if (immediate) handle.release();
    }
    resolve(result);
  };
  const cancel = () => finish({ status: 'cancelled' });
  /** v0.117.0 (QĐ4): run the `onApply` gate; only `{ ok: true }` resolves the dialog */
  const gate = (result) => {
    const ctrl = new AbortController();
    gateCtrl = ctrl;
    busy = true;
    say(typeof o.busyMessage === 'string' ? o.busyMessage : ''); // v0.119.0 (QĐ4): e.g. "Đang tạo ảnh đã cắt…"
    setButtonBusy(confirmBtn, true);
    const lockCropper = !cropper.hasAttribute('disabled');
    if (lockCropper) cropper.setAttribute('disabled', '');
    dialog.setAttribute('aria-busy', 'true');
    let p;
    try { p = Promise.resolve(onApply(result, { signal: ctrl.signal })); } catch (e) { p = Promise.reject(e); }
    p.then((v) => v, () => ({ ok: false })).then((v) => {
      if (done || gateCtrl !== ctrl || ctrl.signal.aborted) return; // closed meanwhile / a late result
      gateCtrl = null;
      if (v && v.ok === true) { finish(result); return; }
      busy = false;
      setButtonBusy(confirmBtn, false);
      if (lockCropper) cropper.removeAttribute('disabled');
      dialog.removeAttribute('aria-busy');
      say(v && typeof v.message === 'string' ? v.message : '');
    });
  };
  const apply = () => {
    if (done || busy || confirmBtn.disabled) return;
    const r = cropper.getResult();
    /** @type {CropDialogResult} */
    let result;
    if (focal) { // QĐ2a: only a ready image is needed (focalPoint is never null then); the crop is always null
      if (!r.focalPoint) return;
      result = { status: 'applied', crop: null, focalPoint: r.focalPoint, changed: focalChanged(focalIn, r.focalPoint) };
    } else {
      if (!r.crop) return; // not ready (the button is disabled then anyway)
      if (!meetsMin(r.crop)) { checkMin(); return; } // v0.117.0 (QĐ3): never applied below the minimum
      const crop = isWholeImage(r.crop) ? null : r.crop;
      const changed = cropChanged(cropIn, crop ? crop.normalized : null, size.W, size.H)
        || focalChanged(focalIn, r.focalPoint);
      result = { status: 'applied', crop, focalPoint: r.focalPoint, changed };
    }
    if (onApply) gate(result);
    else finish(result);
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
    themeFrom: typeof Element !== 'undefined' && o.themeRoot instanceof Element ? o.themeRoot : null,
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
