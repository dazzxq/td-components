/**
 * `<td-cropper>` — v0.35.0 (plan docs/internal/plans/v0.35.0-cropper.md M2, decisions 4-22 + 33; ADR 0015).
 *
 * A crop box over an image that outputs COORDINATES ONLY (normalised 0..1 + integer pixels when the original size is
 * known + aspect ratio) and an optional focal point. It never creates pixels: no drawing surface, no blob, no network
 * request of its own, no `crossorigin` (guard test in src/utils/crop-geometry.test.js). The geometry is the pure
 * module utils/crop-geometry.js; this element turns pointer / key / wheel input into calls of it and renders with CSSOM
 * custom properties on the host only.
 *
 * Attributes (scalar): `src` (safeMediaUrl — never `blob:` / `data:`; refused ⇒ error `src`, the `<img>` gets no src),
 * `alt`, `natural-width` / `natural-height` (integers 1–100000; both or neither), `aspect-ratio` (`W/H` | `W:H` | number
 * ⇒ LOCKED, the ratio presets are hidden), `crop` (JSON v1 `{"v":1,"x","y","width","height"}`), `focal-point` (boolean:
 * the focal-point tool), `focal` (JSON v1 `{"v":1,"x","y"}`), `disabled`, `mode` (`box` default | `pan`), `shape` (`rect`
 * default | `circle`).
 *
 * v0.73.0 (plan docs/internal/plans/v0.73.0-cropper-pan-mode.md M1) — two ways to work on the SAME model rect:
 * `mode="box"` (default, unchanged): the image is contain-fitted and stands still, the box moves / resizes over it.
 * `mode="pan"`: the frame stands still in the middle of the stage (`--td-cropper-pan-inset` from its edges) and the user
 * drags / zooms the IMAGE under it (avatars). Only the way `_fit` is computed differs (`panFit`), so the same CSSOM
 * properties are written and no node is added to the shell. Pan always has a ratio (`aspect-ratio` → the selected
 * preset → 1; presets with `ratio: null` are not offered), no handles, no focal-point tool (an existing focal value is
 * kept and still returned), a zoom slider (`<td-slider class="td-cropper__zoom">`, created only in pan, between − and +)
 * and square integer pixels for a 1:1 crop. `shape="circle"` rounds the frame (display only — the output stays the
 * bounding square) while the mode is pan and the ratio in force is 1:1. Unknown values = the default, silently.
 * Properties: `crop` (get `CropValue | null`; set `{ normalized } | { x, y, width, height } | null` — silently),
 * `focalPoint` (`{ x, y } | null`, silently), `presets` (`{ label, ratio: number | null }[]`, default
 * `TdCropper.presets`), `reset()` (silent), `getResult()` → `{ crop, focalPoint }`.
 * Static: `TdCropper.labels`, `TdCropper.presets`, `TdCropper.openDialog(opts)` (= openCropDialog, see
 * src/feedback/crop-dialog.js).
 *
 * Events (never on programmatic sets): `crop-input { crop, source }` (during a drag / pinch, per frame) ·
 * `crop-change { crop, source }` (end of a gesture that changed something; each key / button / wheel step; preset;
 * reset) · `focal-change { focalPoint, source }` · `image-ready { naturalWidth, naturalHeight, pixelsKnown }` ·
 * `image-error { kind: 'src' | 'load' | 'size' | 'ratio' }`. `source ∈ pointer | pinch | wheel | keyboard | button |
 * preset | reset`.
 *
 * State: host `data-state="loading|ready|error"` (+ `data-error="<kind>"`), `data-locked` (a ratio is in force: 4 corner
 * handles only), `data-dragging` (rule-of-thirds grid), `data-small-box` (displayed box < 88 px: CSS hides the edge
 * handles on coarse pointers; never in pan), `data-mode="pan"` / `data-shape="circle"` (v0.73.0: constants set by JS
 * after the attribute matched the allowlist — absent in box mode / for a rectangle). CSSOM (display px, removed on disconnect): `--_tdc-img-x/y/w/h`, `--_tdc-box-x/y/w/h`,
 * `--_tdc-focal-x/y`.
 *
 * DOM (built once; every text through textContent / setAttribute):
 *   <div class="td-cropper__toolbar" role="group">
 *     <div class="td-cropper__ratios" role="radiogroup">button.td-cropper__ratio[role=radio]…</div>
 *     <div class="td-cropper__tools">button.td-cropper__zoom-out · [pan only: td-slider.td-cropper__zoom] ·
 *       .td-cropper__zoom-in · .td-cropper__focal-toggle [aria-pressed] · .td-cropper__reset</div>
 *   </div>
 *   <div class="td-cropper__stage" role="group" aria-label="Cắt ảnh: {alt}">
 *     <div class="td-cropper__area"><img class="td-cropper__img">
 *       <div class="td-cropper__box" role="group" aria-roledescription="khung cắt" tabindex="0">
 *         span.td-cropper__grid · span.td-cropper__handle--edge[data-handle=n|e|s|w] (aria-hidden, pointer only) ·
 *         span.td-cropper__handle--corner[data-handle=nw|ne|se|sw] (role=group, tabindex=0)
 *       </div>
 *       <span class="td-cropper__focal" role="group" tabindex="0" hidden></span>
 *     </div>
 *     <p class="td-cropper__message"></p>
 *   </div>
 *   span.td-sr-only ×3 (descriptions) · span.td-sr-only.td-cropper__live[role=status] (debounced 400 ms)
 *
 * @module form/td-cropper
 */
import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { safeMediaUrl } from '../utils/media-url.js';
import { parseAspectRatio, parseCrop, parseFocal, cropRatioInRange } from '../utils/media-field-model.js';

let warnedRatio = false;
import {
  ZOOM_STEP, moveBy, resizeFrom, scaleAround, applyPreset, normalizeInitial, stepFor, toOutput, clampFocal,
  ratioMismatch, containFit, wheelFactor, isTrackpadDelta, dampedWheelFactor, modelToDisplay, focalChanged,
  fitLargest, panFrame, panFit, panBy, panPinch, panZoom, panRatio, panMinWidth, panZoomToT, panTToWidth,
} from '../utils/crop-geometry.js';
import { openCropDialog } from '../feedback/crop-dialog.js';
import './td-slider.js'; // v0.73.0: the zoom slider of pan mode (created only there)

/** @typedef {import('../utils/crop-geometry.js').CropValue} CropValue */
/** @typedef {import('../utils/crop-geometry.js').Rect} Rect */

const OBSERVED = ['src', 'alt', 'natural-width', 'natural-height', 'aspect-ratio', 'crop', 'focal-point', 'focal', 'disabled',
  'mode', 'shape'];
const VARS = ['--_tdc-img-x', '--_tdc-img-y', '--_tdc-img-w', '--_tdc-img-h', '--_tdc-box-x', '--_tdc-box-y',
  '--_tdc-box-w', '--_tdc-box-h', '--_tdc-focal-x', '--_tdc-focal-y'];
/** Corner handles in Tab order (decision 15): top-left → top-right → bottom-right → bottom-left. */
const CORNERS = ['nw', 'ne', 'se', 'sw'];
const EDGES = ['n', 'e', 's', 'w'];
/** A pointer that moved at most this many px is a tap (decision 17). */
const TAP_PX = 4;
/** Live region debounce after the last change (decision 16). */
const LIVE_MS = 400;
/** Displayed box below 2 × 44 px ⇒ `data-small-box` (edge handles hidden on coarse pointers, decision 20). */
const SMALL_BOX = 88;
/** Zoom slider of pan mode: positions 0 … ZOOM_STEPS on a log scale (0 = the widest view). */
const ZOOM_STEPS = 100;
let uid = 0;

const fmt = (s, p) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(p, k) ? String(p[k]) : m));
const pct = (v) => Math.round(v * 100);
const px = (v) => `${Math.round(v * 100) / 100}px`;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
/** Scalar enum attribute: trimmed, lower-cased — only ever COMPARED with constants, never written anywhere. */
const word = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
/** Strict integer attribute 1–100000 (decision 33), else null. @param {string|null} v */
const intAttr = (v) => (typeof v === 'string' && /^[1-9][0-9]{0,5}$/.test(v) && Number(v) <= 100000 ? Number(v) : null);
const sameRect = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
  && Math.abs(a.w - b.w) < 1e-9 && Math.abs(a.h - b.h) < 1e-9;
/** `{ normalized }` / `{ x, y, width, height }` → a finite box, else null. */
function boxOf(v) {
  const n = v && typeof v === 'object' && v.normalized && typeof v.normalized === 'object' ? v.normalized : v;
  if (!n || typeof n !== 'object') return null;
  const b = { x: n.x, y: n.y, width: n.width, height: n.height };
  return [b.x, b.y, b.width, b.height].every(fin) && b.width > 0 && b.height > 0 ? b : null;
}
/** Valid preset list (labels ≤ 40 chars, ratio null or (0, 10000]); invalid entries dropped. */
function cleanPresets(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || typeof p.label !== 'string') continue;
    const label = p.label.trim().slice(0, 40);
    const ratio = p.ratio == null ? null : (fin(p.ratio) && p.ratio > 0 && p.ratio <= 10000 ? p.ratio : undefined);
    if (label && ratio !== undefined) out.push({ label, ratio });
  }
  return out;
}

// Constant markup only — no interpolation (texts / labels are set through the DOM in _syncLabels()).
const SHELL = '<div class="td-cropper__toolbar" role="group">'
  + '<div class="td-cropper__ratios" role="radiogroup"></div>'
  + '<div class="td-cropper__tools">'
  + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-cropper__tool td-cropper__zoom-out">'
  + '<span class="td-btn__icon" data-td-icon="zoom-out" aria-hidden="true"></span><span class="td-cropper__tool-text"></span></button>'
  + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-cropper__tool td-cropper__zoom-in">'
  + '<span class="td-btn__icon" data-td-icon="zoom-in" aria-hidden="true"></span><span class="td-cropper__tool-text"></span></button>'
  + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-cropper__tool td-cropper__focal-toggle" aria-pressed="false" hidden>'
  + '<span class="td-btn__icon" data-td-icon="crosshair" aria-hidden="true"></span><span class="td-cropper__tool-text"></span></button>'
  + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-cropper__tool td-cropper__reset">'
  + '<span class="td-btn__icon" data-td-icon="rotate-ccw" aria-hidden="true"></span><span class="td-cropper__tool-text"></span></button>'
  + '</div></div>'
  + '<div class="td-cropper__stage" role="group">'
  + '<div class="td-cropper__area">'
  + '<img class="td-cropper__img" alt="" draggable="false" referrerpolicy="no-referrer" decoding="async">'
  + '<div class="td-cropper__box" role="group" tabindex="0">'
  + '<span class="td-cropper__grid" aria-hidden="true"></span>'
  // edges first: the corners paint (and hit-test) above them where the enlarged hit areas overlap on a small box
  + EDGES.map((h) => `<span class="td-cropper__handle td-cropper__handle--edge" data-handle="${h}" aria-hidden="true"></span>`).join('')
  + CORNERS.map((h) => `<span class="td-cropper__handle td-cropper__handle--corner" data-handle="${h}" role="group" tabindex="0"></span>`).join('')
  + '</div>'
  + '<span class="td-cropper__focal" role="group" tabindex="0" hidden></span>'
  + '</div>'
  + '<p class="td-cropper__message" hidden></p>'
  + '</div>'
  + '<span class="td-sr-only td-cropper__desc"></span>'
  + '<span class="td-sr-only td-cropper__corner-desc"></span>'
  + '<span class="td-sr-only td-cropper__focal-desc"></span>'
  + '<span class="td-sr-only td-cropper__live" role="status" aria-live="polite" aria-atomic="true"></span>';

export class TdCropper extends TdBaseElement {
  /** Default texts (Vietnamese); override per site, e.g. `TdCropper.labels.reset = 'Reset'`. */
  static labels = {
    stage: 'Cắt ảnh: {alt}',
    stageNoAlt: 'Cắt ảnh',
    tools: 'Công cụ cắt ảnh',
    ratios: 'Tỉ lệ khung',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    focal: 'Điểm trọng tâm',
    reset: 'Đặt lại',
    box: 'Vùng cắt',
    boxRole: 'khung cắt',
    handleRole: 'tay nắm',
    nw: 'Góc trên trái',
    ne: 'Góc trên phải',
    se: 'Góc dưới phải',
    sw: 'Góc dưới trái',
    focalPoint: 'Điểm trọng tâm',
    boxHelp: 'Mũi tên: di chuyển khung, Shift + mũi tên: bước lớn, + / −: phóng to / thu nhỏ.',
    // pan mode (v0.73.0)
    zoom: 'Thu phóng ảnh',
    panHelp: 'Mũi tên: dịch ảnh dưới khung, Shift + mũi tên: bước lớn, + / −: phóng to / thu nhỏ ảnh.',
    cornerHelp: 'Mũi tên: đổi cỡ khung từ góc này, Shift + mũi tên: bước lớn.',
    focalHelp: 'Mũi tên: di chuyển điểm 1 %, Shift + mũi tên: 10 %.',
    valuePx: 'Vùng cắt {w} × {h} px, cách trái {x} px, cách trên {y} px',
    valuePct: 'Vùng cắt {w} % × {h} %, cách trái {x} %, cách trên {y} %',
    focalValue: 'Điểm trọng tâm {x} %, {y} %',
    focalOff: 'Đã bỏ điểm trọng tâm',
    ratio: 'Tỉ lệ {label}',
    ratioFree: 'Tỉ lệ tự do',
    loading: 'Đang tải ảnh…',
    errorSrc: 'Địa chỉ ảnh không hợp lệ',
    errorLoad: 'Không tải được ảnh',
    errorSize: 'Không xác định được kích thước ảnh',
    errorRatio: 'Ảnh xem trước không khớp tỉ lệ ảnh gốc',
    // crop dialog (src/feedback/crop-dialog.js)
    dialogTitle: 'Cắt ảnh',
    dialogApply: 'Áp dụng',
    dialogCancel: 'Huỷ',
    dialogClose: 'Đóng',
  };

  /** Default ratio presets (site-wide; per element: the `presets` property). `ratio: null` = free. */
  static presets = [
    { label: 'Tự do', ratio: null },
    { label: '1:1', ratio: 1 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '3:2', ratio: 3 / 2 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '1.91:1', ratio: 1.91 },
  ];

  static get observedAttributes() { return OBSERVED; }
  static get booleanAttributes() { return ['focal-point', 'disabled']; }

  /**
   * The shared crop dialog (same function as the media picker / media field use) — see openCropDialog in
   * src/feedback/crop-dialog.js for the options and the result (a whole-image crop comes back as `crop: null`).
   * @param {Parameters<typeof openCropDialog>[0]} opts
   * @returns {ReturnType<typeof openCropDialog>}
   */
  static openDialog(opts) { return openCropDialog(opts); }

  constructor() {
    super();
    /** @type {'loading'|'ready'|'error'} */
    this._state = 'loading';
    this._W = 0;
    this._H = 0;
    this._pixelsKnown = false;
    /** @type {Rect|null} current box, model px */
    this._rect = null;
    /** @type {{x:number,y:number,width:number,height:number}|null} initial / reset crop (attribute or property) */
    this._cropIn = null;
    this._cropSet = false;
    /** @type {{x:number,y:number}|null} */
    this._focal = null;
    /** @type {{x:number,y:number}|null} */
    this._focalIn = null;
    this._focalSet = false;
    /** @type {Array<{label:string,ratio:number|null}>|null} per-element presets (null ⇒ TdCropper.presets) */
    this._presetList = null;
    this._presetIdx = 0;
    /** @type {number|null} ratio of the `aspect-ratio` attribute (locked) */
    this._lock = null;
    /** @type {{scale:number,x:number,y:number,w:number,h:number}|null} image rect in the stage (display px) */
    this._fit = null;
    /** @type {{pl:number,pt:number,bw:number,bh:number}|null} content box of the stage (pan: the frame is derived from it) */
    this._box = null;
    /** @type {any} the zoom slider (pan mode only) */
    this._zoomEl = null;
    /** @type {{rect0:Rect,last:Rect,v0:number,wMin:number,wMax:number,busy:boolean}|null} one gesture on the zoom slider: its scale is frozen */
    this._zg = null;
    this._zv = 0;
    this._warnedShape = false;
    /** @type {any} the current gesture */
    this._g = null;
    /** @type {Map<number, {x:number,y:number}>} active touch pointers */
    this._touches = new Map();
    this._raf = 0;
    this._loadToken = 0;
    this._awaiting = false;
    this._liveTimer = 0;
    /** @type {string|null} */
    this._livePending = null;
    this._read = false;
    /** @type {any} */
    this._els = null;
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onEsc = null;
    this._uid = ++uid;
  }

  // --- life cycle ---

  connectedCallback() {
    // review R1 #4: properties assigned before the element was defined live in own data properties that shadow the
    // accessors — capture, delete, re-assign (presets first: crop / focalPoint are read against the preset list)
    for (const k of ['presets', 'crop', 'focalPoint']) {
      if (!Object.prototype.hasOwnProperty.call(this, k)) continue;
      const v = /** @type {any} */ (this)[k];
      delete /** @type {any} */ (this)[k];
      /** @type {any} */ (this)[k] = v;
    }
    // Moved in the DOM: keep the nodes (and the loaded image), re-bind listeners, re-measure.
    if (this._initialized && this._needsRebind && this._els && this.contains(this._els.stage)) {
      this._needsRebind = false;
      this._cleanups.forEach((fn) => fn());
      this._cleanups = [];
      this._bind();
      this._measure();
      return;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    if (this._g) this._finish(false);
    this._endZoom(false);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._dropWheel();
    if (this._liveTimer) clearTimeout(this._liveTimer);
    this._liveTimer = 0;
    this._touches.clear();
    this._clearVars();
    this.removeAttribute('data-dragging');
    super.disconnectedCallback();
  }

  render() { return SHELL; }

  afterRender() {
    this._build();
    this._bind();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._els) return; // before the first render: _build() reads every attribute
    switch (name) {
      case 'src':
      case 'natural-width':
      case 'natural-height':
        this._load();
        break;
      case 'alt':
        this._syncLabels();
        break;
      case 'aspect-ratio': {
        const was = this._ratio();
        this._readLock();
        this._syncPresetUi();
        if (this._ready()) {
          this._reratio(this._ratio(), was);
          this._renderVars();
          this._syncDesc();
        }
        this._syncLocked();
        break;
      }
      case 'mode':
        this._syncMode();
        break;
      case 'shape':
        this._syncShape();
        break;
      case 'crop':
        this._cropIn = boxOf(parseCrop(newVal)?.crop ?? null);
        this._cropSet = true;
        this._applyCropIn();
        break;
      case 'focal':
        this._focal = parseFocal(newVal)?.focal ?? null;
        this._focalIn = this._focal ? { ...this._focal } : null;
        this._focalSet = true;
        this._renderVars();
        this._syncFocalUi();
        this._syncDesc();
        break;
      case 'focal-point':
        this._syncFocalUi();
        break;
      case 'disabled':
        if (newVal !== null && this._g) this._finish(false);
        if (newVal !== null) { this._endZoom(false); this._dropWheel(); }
        this._syncDisabled();
        break;
      default:
    }
  }

  // --- public API ---

  /**
   * The current crop (`null` until the image is ready). Setting `{ normalized }` / `{ x, y, width, height }` / `null`
   * (default box) is silent and also becomes the "Đặt lại" target.
   * @type {CropValue|null}
   */
  get crop() {
    if (!this._ready()) return null;
    const o = { W: this._W, H: this._H, pixelsKnown: this._pixelsKnown, ratio: this._ratio() };
    if (o.ratio === 1 && this._pan()) /** @type {any} */ (o).square = true; // pan 1:1: integer pixels exactly square
    return toOutput(/** @type {Rect} */ (this._rect), o);
  }

  set crop(v) {
    this._cropIn = boxOf(v);
    this._cropSet = true;
    this._applyCropIn();
  }

  /** Focal point normalised to the WHOLE image (`{ x, y }` in [0, 1]) or null. Setting is silent. */
  get focalPoint() { return this._focal ? { ...this._focal } : null; }

  set focalPoint(v) {
    this._focal = clampFocal(v);
    this._focalIn = this._focal ? { ...this._focal } : null;
    this._focalSet = true;
    this._renderVars();
    this._syncFocalUi();
    this._syncDesc();
  }

  /** Ratio presets of this element (`{ label, ratio: number | null }[]`); `null` / invalid ⇒ `TdCropper.presets`. */
  get presets() { return this._presets().map((p) => ({ ...p })); }

  set presets(v) {
    const was = this._ratio();
    const list = cleanPresets(v);
    this._presetList = list.length ? list : null;
    this._presetIdx = this._defaultPresetIdx();
    if (!this._els) return;
    this._renderPresets();
    if (this._ready()) {
      this._reratio(this._ratio(), was);
      this._renderVars();
      this._syncDesc();
    }
    this._syncLocked();
  }

  /** Back to the initial box (crop attribute / property, else the default) + initial focal point. Silent. */
  reset() { this._reset(false); }

  /** @returns {{ crop: CropValue|null, focalPoint: {x:number,y:number}|null }} */
  getResult() { return { crop: this.crop, focalPoint: this.focalPoint }; }

  // --- build / bind ---

  /** @private one-time node lookup + initial state from the attributes */
  _build() {
    const $ = (s) => /** @type {HTMLElement} */ (this.querySelector(s));
    const els = {
      toolbar: $('.td-cropper__toolbar'),
      ratios: $('.td-cropper__ratios'),
      zoomOut: $('.td-cropper__zoom-out'),
      zoomIn: $('.td-cropper__zoom-in'),
      focalBtn: $('.td-cropper__focal-toggle'),
      reset: $('.td-cropper__reset'),
      stage: $('.td-cropper__stage'),
      area: $('.td-cropper__area'),
      img: /** @type {HTMLImageElement} */ ($('.td-cropper__img')),
      box: $('.td-cropper__box'),
      corners: /** @type {HTMLElement[]} */ ([...this.querySelectorAll('.td-cropper__handle--corner')]),
      focal: $('.td-cropper__focal'),
      msg: $('.td-cropper__message'),
      desc: $('.td-cropper__desc'),
      cornerDesc: $('.td-cropper__corner-desc'),
      focalDesc: $('.td-cropper__focal-desc'),
      live: $('.td-cropper__live'),
    };
    this._els = els;
    const id = `td-cropper-${this._uid}`;
    els.desc.id = `${id}-desc`;
    els.cornerDesc.id = `${id}-corner-desc`;
    els.focalDesc.id = `${id}-focal-desc`;
    els.box.setAttribute('aria-describedby', els.desc.id);
    for (const c of els.corners) c.setAttribute('aria-describedby', els.cornerDesc.id);
    els.focal.setAttribute('aria-describedby', els.focalDesc.id);
    fillIconSlots(els.toolbar);
    // Image events: bound once for the life of the node (not part of _cleanups — a move in the DOM keeps loading).
    els.img.addEventListener('load', () => {
      if (!this._awaiting) return;
      const token = this._loadToken;
      const done = () => { if (token === this._loadToken && this._awaiting) { this._awaiting = false; this._onDecoded(); } };
      try { els.img.decode().then(done, done); } catch { done(); }
    });
    els.img.addEventListener('error', () => {
      if (!this._awaiting) return;
      this._awaiting = false;
      this._fail('load');
    });

    if (!this._read) {
      this._read = true;
      this._readLock();
      if (!this._cropSet) this._cropIn = boxOf(parseCrop(this.getAttribute('crop'))?.crop ?? null);
      if (!this._focalSet) {
        this._focal = parseFocal(this.getAttribute('focal'))?.focal ?? null;
        this._focalIn = this._focal ? { ...this._focal } : null;
      }
      this._presetIdx = this._defaultPresetIdx();
    }
    this._syncMode(true);
    this._syncLabels();
    this._renderPresets();
    this._syncFocalUi();
    this._load();
  }

  /** @private listeners (removed on disconnect, re-bound on re-connect) */
  _bind() {
    const { stage, toolbar, ratios } = this._els;
    this.listen(stage, 'pointerdown', (e) => this._onDown(e));
    this.listen(stage, 'pointermove', (e) => this._onMove(e));
    this.listen(stage, 'pointerup', (e) => this._onUp(e));
    this.listen(stage, 'pointercancel', (e) => this._onUp(e));
    this.listen(stage, 'lostpointercapture', (e) => this._onLost(e));
    this.listen(stage, 'wheel', (e) => this._onWheel(e), { passive: false });
    this.listen(stage, 'keydown', (e) => this._onKey(e));
    this.listen(stage, 'dragstart', (e) => e.preventDefault());
    this.listen(toolbar, 'click', (e) => this._onToolClick(e));
    this.listen(toolbar, 'input', (e) => this._onZoomSlide(e, false));
    this.listen(toolbar, 'change', (e) => this._onZoomSlide(e, true));
    // a pointer the browser takes back never sends `change`: commit what the slider did, like a cancelled pointer on the stage
    this.listen(toolbar, 'pointercancel', (e) => { if (this._zoomEl && this._zoomEl.contains(/** @type {Node} */ (e.target))) this._endZoom(true); });
    this.listen(ratios, 'keydown', (e) => this._onRatioKey(e));
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this._measure());
      ro.observe(stage);
      this._cleanups.push(() => ro.disconnect());
    }
  }

  // --- image ---

  /** @private (re)load from `src` / `natural-*` */
  _load() {
    const { img } = this._els;
    this._loadToken += 1;
    this._awaiting = false;
    if (this._g) this._finish(false);
    this._W = 0;
    this._H = 0;
    this._rect = null;
    this._fit = null;
    this._clearVars();
    const nw = intAttr(this.getAttribute('natural-width'));
    const nh = intAttr(this.getAttribute('natural-height'));
    this._nat = nw && nh ? { w: nw, h: nh } : null;
    const raw = this.getAttribute('src');
    if (raw === null || raw.trim() === '') {
      img.removeAttribute('src');
      this._setState('loading');
      return;
    }
    const url = safeMediaUrl(raw); // https (http on an http page); never blob: / data: / javascript:
    if (!url) {
      img.removeAttribute('src');
      this._fail('src');
      return;
    }
    this._setState('loading');
    this._announceNow(TdCropper.labels.loading);
    this._awaiting = true;
    if (img.getAttribute('src') === url) img.removeAttribute('src'); // same URL (natural-* changed): load again
    img.src = url;
  }

  /** @private decoded: size checks (decision 5), then ready */
  _onDecoded() {
    const { img } = this._els;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!(iw > 0 && ih > 0)) { this._fail('size'); return; }
    if (this._nat && ratioMismatch(iw, ih, this._nat.w, this._nat.h)) { this._fail('ratio'); return; }
    this._W = this._nat ? this._nat.w : iw;
    this._H = this._nat ? this._nat.h : ih;
    this._pixelsKnown = !!this._nat;
    this._rect = normalizeInitial(this._cropIn, { W: this._W, H: this._H, ratio: this._ratio() });
    this._setState('ready');
    this._announceNow('');
    this._measure();
    this._syncDesc();
    this.emit('image-ready', { naturalWidth: this._W, naturalHeight: this._H, pixelsKnown: this._pixelsKnown });
  }

  /** @private @param {'src'|'load'|'size'|'ratio'} kind */
  _fail(kind) {
    this._W = 0;
    this._H = 0;
    this._rect = null;
    this._fit = null;
    this._clearVars();
    this._setState('error', kind);
    const L = TdCropper.labels;
    this._announceNow({ src: L.errorSrc, load: L.errorLoad, size: L.errorSize, ratio: L.errorRatio }[kind]);
    this.emit('image-error', { kind });
  }

  /** @private */
  _setState(state, kind) {
    this._state = state;
    this.setAttribute('data-state', state);
    if (state === 'error' && kind) this.setAttribute('data-error', kind);
    else this.removeAttribute('data-error');
    const L = TdCropper.labels;
    const { msg } = this._els;
    const text = state === 'error'
      ? ({ src: L.errorSrc, load: L.errorLoad, size: L.errorSize, ratio: L.errorRatio }[kind] || L.errorLoad)
      : state === 'loading' && this.getAttribute('src') ? L.loading : '';
    msg.textContent = text;
    msg.hidden = !text;
    this._syncDisabled();
    this._syncLocked();
    this._syncFocalUi();
  }

  // --- geometry helpers ---

  /** @private */
  _ready() { return this._state === 'ready' && !!this._rect && this._W > 0; }

  /** @private */
  _interactive() { return this._ready() && !this.hasAttribute('disabled'); }

  /** @private v0.73.0: is the mode `pan` (the frame stands still, the image moves)? Anything else = `box`. */
  _pan() { return word(this.getAttribute('mode')) === 'pan'; }

  /** @private pan has no focal-point tool (the frame is the subject); an existing focal value is kept as it is */
  _focalTool() { return this.hasAttribute('focal-point') && !this._pan(); }

  /** @private */
  _presets() { return this._presetList || cleanPresets(TdCropper.presets); }

  /** @private the presets OFFERED (`_presetIdx` indexes this list): pan always has a ratio, so no free entry there */
  _choices(pan = this._pan()) {
    const list = this._presets();
    return pan ? list.filter((p) => p.ratio != null) : list;
  }

  /** @private index of the free preset (or 0); pan: of the 1:1 preset (or 0) */
  _defaultPresetIdx() {
    const i = this._pan() ? this._choices().findIndex((p) => Math.abs(/** @type {number} */ (p.ratio) - 1) < 1e-4)
      : this._presets().findIndex((p) => p.ratio == null);
    return i < 0 ? 0 : i;
  }

  /** @private the ratio in force: the `aspect-ratio` lock, else the selected preset's (null = free; pan: 1) */
  _ratio() {
    if (this._lock) return this._lock;
    const pan = this._pan();
    const p = this._choices(pan)[this._presetIdx];
    if (p && p.ratio) return p.ratio;
    return pan ? 1 : null;
  }

  /**
   * @private a ratio was applied. Box: `ratio` (null = free: unchanged) ⇒ the largest rect of it around the centre.
   * Pan: the ratio in force (`was` = before the change) ⇒ same centre AND same relative zoom; the frame changes shape.
   * @param {number|null} ratio @param {number|null} was
   */
  _reratio(ratio, was) {
    const rect = /** @type {Rect} */ (this._rect);
    if (!this._pan()) {
      if (ratio) this._rect = applyPreset(rect, ratio, this._W, this._H);
      return;
    }
    const r = /** @type {number} */ (this._ratio());
    if (r !== was) this._rect = was ? panRatio(rect, was, r, this._W, this._H) : applyPreset(rect, r, this._W, this._H);
  }

  /** @private pan: width of the frame on screen (display px; 0 before the first measure) */
  _frameW() {
    const b = this._box;
    return b ? panFrame(b.bw, b.bh, /** @type {number} */ (this._ratio())).w : 0;
  }

  /** @private zoom `r` by `k` around `anchor` (model px): pan adds the display ceiling */
  _scale(r, k, anchor) {
    const o = { ratio: this._ratio(), W: this._W, H: this._H };
    return this._pan() ? panZoom(r, k, anchor, { ...o, frameW: this._frameW() }) : scaleAround(r, k, anchor, o);
  }

  /** @private */
  _readLock() {
    const raw = this.getAttribute('aspect-ratio');
    const a = parseAspectRatio(raw);
    const r = a ? a.w / a.h : null;
    this._lock = r !== null && cropRatioInRange(r) ? r : null;
    if (raw !== null && raw.trim() !== '' && this._lock === null && !warnedRatio) {
      warnedRatio = true; // review R1 #5: rejected (free), never silently; bounded (the value is not echoed)
      console.warn('td-cropper: aspect-ratio must be W/H, W:H or a number with a ratio in [0.01, 100] — rejected, the crop is free.');
    }
  }

  /** @private crop attribute / property → the box (silent) */
  _applyCropIn() {
    if (!this._ready() || this._g) return;
    this._rect = normalizeInitial(this._cropIn, { W: this._W, H: this._H, ratio: this._ratio() });
    this._renderVars();
    this._syncDesc();
  }

  /** @private client px → model px (relative to the image) */
  _clientToModel(cx, cy) {
    const r = this._els.area.getBoundingClientRect();
    const s = this._fit && this._fit.scale ? this._fit.scale : 1;
    return { x: (cx - r.left) / s, y: (cy - r.top) / s };
  }

  // --- rendering (CSSOM custom properties on the host only) ---

  /** @private stage size → contain fit → vars */
  _measure() {
    if (!this._els || !this._ready()) return;
    const st = this._els.stage;
    const cs = getComputedStyle(st);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const bw = st.clientWidth - pl - (parseFloat(cs.paddingRight) || 0);
    const bh = st.clientHeight - pt - (parseFloat(cs.paddingBottom) || 0);
    this._box = { pl, pt, bw, bh };
    if (!this._pan()) {
      const f = containFit(this._W, this._H, bw, bh);
      this._fit = f.scale ? { scale: f.scale, x: f.x + pl, y: f.y + pt, w: f.w, h: f.h } : null;
    }
    this._renderVars();
  }

  /**
   * @private pan: the image rect that puts the crop under the frame. Computed on EVERY render — the frame follows the
   * ratio in force, and the ratio paths (preset, `aspect-ratio`, `presets`, reset) only call _renderVars().
   */
  _panFit() {
    const b = this._box;
    if (!b || !this._ready()) return null;
    const f = panFit(/** @type {Rect} */ (this._rect), panFrame(b.bw, b.bh, /** @type {number} */ (this._ratio())), this._W, this._H);
    return f.scale ? { scale: f.scale, x: f.x + b.pl, y: f.y + b.pt, w: f.w, h: f.h } : null;
  }

  /** @private */
  _renderVars() {
    const pan = this._pan();
    if (pan) {
      this._fit = this._panFit();
      this._syncZoom();
    }
    const f = this._fit;
    if (!this._els || !f || !this._ready()) return;
    const set = (k, v) => this.style.setProperty(k, px(v));
    set('--_tdc-img-x', f.x);
    set('--_tdc-img-y', f.y);
    set('--_tdc-img-w', f.w);
    set('--_tdc-img-h', f.h);
    const d = modelToDisplay(/** @type {Rect} */ (this._rect), f.scale);
    set('--_tdc-box-x', d.x);
    set('--_tdc-box-y', d.y);
    set('--_tdc-box-w', d.w);
    set('--_tdc-box-h', d.h);
    this.toggleAttribute('data-small-box', !pan && (d.w < SMALL_BOX || d.h < SMALL_BOX)); // pan: no handles to hide
    if (this._focal) {
      set('--_tdc-focal-x', this._focal.x * f.w);
      set('--_tdc-focal-y', this._focal.y * f.h);
    } else {
      this.style.removeProperty('--_tdc-focal-x');
      this.style.removeProperty('--_tdc-focal-y');
    }
  }

  /** @private */
  _clearVars() {
    if (!this.style) return;
    for (const v of VARS) this.style.removeProperty(v);
    this.removeAttribute('data-small-box');
  }

  // --- UI sync ---

  /** @private */
  _syncLabels() {
    const L = TdCropper.labels;
    const e = this._els;
    const alt = (this.getAttribute('alt') || '').trim();
    e.stage.setAttribute('aria-label', alt ? fmt(L.stage, { alt }) : L.stageNoAlt);
    e.toolbar.setAttribute('aria-label', L.tools);
    e.ratios.setAttribute('aria-label', L.ratios);
    for (const [btn, text] of [[e.zoomOut, L.zoomOut], [e.zoomIn, L.zoomIn], [e.focalBtn, L.focal], [e.reset, L.reset]]) {
      btn.querySelector('.td-cropper__tool-text').textContent = text;
      btn.setAttribute('aria-label', text);
    }
    e.box.setAttribute('aria-label', L.box);
    e.box.setAttribute('aria-roledescription', L.boxRole);
    for (const c of e.corners) {
      c.setAttribute('aria-label', L[c.getAttribute('data-handle')] || '');
      c.setAttribute('aria-roledescription', L.handleRole);
    }
    e.focal.setAttribute('aria-label', L.focalPoint);
    if (this._zoomEl) this._zoomEl.setAttribute('aria-label', L.zoom);
    e.cornerDesc.textContent = L.cornerHelp;
    this._syncDesc();
  }

  /** @private one radio per preset (roving tabindex) */
  _renderPresets() {
    const { ratios } = this._els;
    const list = this._choices();
    if (this._presetIdx >= list.length) this._presetIdx = this._defaultPresetIdx();
    ratios.replaceChildren(...list.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-cropper__ratio';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-index', String(i));
      b.textContent = p.label;
      return b;
    }));
    this._syncPresetUi();
  }

  /** @private */
  _syncPresetUi() {
    const { ratios } = this._els;
    ratios.hidden = !!this._lock || (this._pan() && !this._choices().length);
    const on = this._interactive();
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (ratios.querySelectorAll('.td-cropper__ratio'))) {
      const sel = Number(b.getAttribute('data-index')) === this._presetIdx;
      b.setAttribute('aria-checked', sel ? 'true' : 'false');
      b.tabIndex = sel ? 0 : -1;
      b.disabled = !on;
    }
  }

  /** @private */
  _syncLocked() {
    this.toggleAttribute('data-locked', this._ratio() != null);
    this._syncShape();
  }

  /**
   * @private v0.73.0 `mode` → host `data-mode="pan"` (a constant; box mode has no such attribute) + the zoom slider.
   * A change at run time is silent like every attribute: the gesture in progress is cancelled, the selected ratio is
   * kept when the new preset list still has it, and the box is fitted again.
   * @param {boolean} [init] first sync (from _build): the presets / box are set up by the normal first-load path
   */
  _syncMode(init) {
    if (!this._els) return;
    const pan = this._pan();
    const flip = pan !== this.hasAttribute('data-mode');
    if (flip && !init) { // nothing of the mode we leave may land in the new one
      if (this._g) this._finish(false);
      this._endZoom(false);
      this._dropWheel();
    }
    if (flip && pan) this.setAttribute('data-mode', 'pan');
    else if (flip) this.removeAttribute('data-mode');
    this._syncZoomEl();
    // pan has no handle and no focal point: their help texts must not be read either (box: no `hidden`, as before)
    this._els.cornerDesc.hidden = this._els.focalDesc.hidden = pan;
    if (init || !flip) return;
    const prev = this._choices(!pan)[this._presetIdx]; // `_presetIdx` still indexes the list of the mode we leave
    const was = this._lock || (prev && prev.ratio) || (pan ? null : 1);
    const keep = prev ? this._choices(pan).findIndex((p) => p.ratio === prev.ratio) : -1;
    this._presetIdx = keep < 0 ? this._defaultPresetIdx() : keep;
    this._renderPresets();
    if (this._ready()) {
      // into pan from another ratio (or a free box): the largest rect of the new one — there is no zoom level to keep
      const r = this._ratio();
      if (pan && r && r !== was) this._rect = applyPreset(/** @type {Rect} */ (this._rect), r, this._W, this._H);
      this._measure(); // the stage padding differs (--td-cropper-pan-inset); pan also drops data-small-box
    }
    this._syncDisabled();
    this._syncFocalUi();
    this._syncLocked();
  }

  /**
   * @private v0.73.0 `shape` → host `data-shape="circle"` only while the mode is pan AND the ratio in force is 1:1
   * (display only: the output stays the bounding square). A static misconfiguration (not pan, or an `aspect-ratio` lock
   * that is not 1:1) warns once per element; a user picking another preset is silent.
   */
  _syncShape() {
    const want = word(this.getAttribute('shape')) === 'circle';
    const pan = this._pan();
    const r = this._ratio();
    // exactly 1, the same test as the square pixels of the output (`crop`): a near-square frame is not drawn round
    if (want && pan && r === 1) this.setAttribute('data-shape', 'circle');
    else this.removeAttribute('data-shape');
    if (want && !this._warnedShape && (!pan || (!!this._lock && this._lock !== 1))) {
      this._warnedShape = true; // bounded: the attribute values are not echoed
      console.warn('td-cropper: shape="circle" needs mode="pan" and a 1:1 ratio — ignored, the frame is a rectangle.');
    }
  }

  /** @private v0.73.0 the zoom slider exists only in pan (the shell and the DOM of box mode are unchanged) */
  _syncZoomEl() {
    const { zoomIn } = this._els;
    if (!this._pan()) {
      if (this._zoomEl) this._zoomEl.remove();
      this._zoomEl = null;
      return;
    }
    if (this._zoomEl) return;
    const z = document.createElement('td-slider');
    z.className = 'td-cropper__zoom';
    for (const [k, v] of [['size', 'sm'], ['min', '0'], ['max', String(ZOOM_STEPS)], ['step', '1'], ['value', '0'],
      ['aria-label', TdCropper.labels.zoom], ['disabled', '']]) z.setAttribute(k, v); // no `name`: never in FormData
    this._zoomEl = z;
    zoomIn.before(z);
  }

  /**
   * @private the widths the zoom slider spans (model px). A rect already narrower than the zoom-in limit (an initial
   * crop, a stage that grew) becomes the lower end itself: the slider then stands at the end and maps back to that rect.
   */
  _zoomRange() {
    const r = /** @type {Rect} */ (this._rect);
    const o = { ratio: this._ratio(), W: this._W, H: this._H, frameW: this._frameW() };
    return { wMin: Math.min(panMinWidth(o), r.w), wMax: fitLargest(o.W, o.H, o.ratio).w };
  }

  /**
   * @private rect → slider, WITHOUT an event (every change that does not come from the slider: wheel, pinch, buttons,
   * keys, preset, reset, resize, programmatic). A slider gesture in progress keeps its frozen scale through a render that
   * does not change the rect (its own, a stage resize); any other change of the rect ends it.
   */
  _syncZoom() {
    const z = this._zoomEl;
    const g = this._zg;
    if (!z || (g && (g.busy || sameRect(this._rect, g.last)))) return;
    this._zg = null;
    const range = this._ready() ? this._zoomRange() : null;
    const span = !!range && range.wMin < range.wMax;
    const off = !(span && this._interactive());
    if (z.hasAttribute('disabled') !== off) z.toggleAttribute('disabled', off);
    const v = String(span ? Math.round(panZoomToT(/** @type {Rect} */ (this._rect).w, range.wMin, range.wMax) * ZOOM_STEPS) : 0);
    this._zv = Number(v); // where a slider gesture starts from
    if (z.getAttribute('value') !== v) z.setAttribute('value', v);
  }

  /**
   * @private `input` / `change` of the zoom slider (td-slider CustomEvents, stopped here) → `crop-input` / `crop-change`
   * with source `button`. One gesture (first `input` … `change`) zooms absolutely from its first rect on a frozen scale,
   * so a value always means the same width inside it and coming back to the start gives the start rect back.
   * @param {Event} e @param {boolean} commit
   */
  _onZoomSlide(e, commit) {
    const z = this._zoomEl;
    if (!z || e.target !== z) return;
    e.stopPropagation();
    if (!this._interactive() || this._g) { this._syncZoom(); return; }
    const rect = /** @type {Rect} */ (this._rect);
    const g = this._zg || (this._zg = { rect0: { ...rect }, last: rect, v0: this._zv, ...this._zoomRange(), busy: false });
    const r0 = g.rect0;
    const v = z.getValue();
    const w = panTToWidth(v / ZOOM_STEPS, g.wMin, g.wMax);
    // the position the gesture started at is its first rect itself (a slider step is coarser than the rect)
    const next = v === g.v0 ? r0 : this._scale(r0, w / r0.w, { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 });
    if (!sameRect(next, rect)) {
      this._rect = g.last = next;
      g.busy = true; // our own render: the slider keeps the value the user gave it
      this._renderVars();
      g.busy = false;
      this.emit('crop-input', { crop: this.crop, source: 'button' });
    }
    if (commit) this._endZoom(true);
  }

  /**
   * @private v0.73.0 ends the slider gesture in progress, if any: commit (`crop-change` when the rect moved) or cancel
   * (back to its first rect without an event, like a cancelled drag — a mode change, `disabled`, a disconnect).
   * @param {boolean} commit
   */
  _endZoom(commit) {
    const g = this._zg;
    if (!g) return;
    this._zg = null;
    const moved = !sameRect(this._rect, g.rect0);
    if (moved && commit) this._changed('button');
    else if (moved) {
      this._rect = g.rect0;
      this._renderVars(); // also puts the slider back
      return;
    }
    this._syncZoom(); // the scale is computed again from the rect in force
  }

  /** @private drops a trackpad step that is waiting for its frame */
  _dropWheel() {
    if (this._wheelRaf) cancelAnimationFrame(this._wheelRaf);
    this._wheelRaf = 0;
    this._wheelAcc = 0;
  }

  /** @private */
  _syncDisabled() {
    if (!this._els) return;
    const e = this._els;
    const on = this._interactive();
    for (const b of [e.zoomOut, e.zoomIn, e.focalBtn, e.reset]) b.disabled = !on;
    const ti = on ? 0 : -1;
    e.box.tabIndex = ti;
    const cti = this._pan() ? -1 : ti; // pan: no handles (hidden by CSS too)
    for (const c of e.corners) c.tabIndex = cti;
    e.focal.tabIndex = ti;
    if (on) e.box.removeAttribute('aria-disabled');
    else e.box.setAttribute('aria-disabled', 'true');
    this._syncPresetUi();
    this._syncZoom();
  }

  /** @private */
  _syncFocalUi() {
    if (!this._els) return;
    const tool = this._focalTool();
    const { focalBtn, focal } = this._els;
    focalBtn.hidden = !tool;
    focalBtn.setAttribute('aria-pressed', this._focal ? 'true' : 'false');
    focal.hidden = !(tool && this._focal && this._ready());
    this._syncDesc();
  }

  /** @private descriptions (aria-describedby): current value + key help */
  _syncDesc() {
    if (!this._els) return;
    const L = TdCropper.labels;
    const s = this._cropSentence();
    const help = this._pan() ? L.panHelp : L.boxHelp;
    this._els.desc.textContent = s ? `${s}. ${help}` : help;
    this._els.focalDesc.textContent = `${this._focalSentence()}. ${L.focalHelp}`;
  }

  /** @private */
  _cropSentence() {
    const c = this.crop;
    if (!c) return '';
    const L = TdCropper.labels;
    if (c.pixels) {
      const p = c.pixels;
      return fmt(L.valuePx, { w: p.width, h: p.height, x: p.x, y: p.y });
    }
    const n = c.normalized;
    return fmt(L.valuePct, { w: pct(n.width), h: pct(n.height), x: pct(n.x), y: pct(n.y) });
  }

  /** @private */
  _focalSentence() {
    const L = TdCropper.labels;
    return this._focal ? fmt(L.focalValue, { x: pct(this._focal.x), y: pct(this._focal.y) }) : L.focalOff;
  }

  /** @private live region: state messages at once */
  _announceNow(text) {
    if (!this._els) return;
    if (this._liveTimer) clearTimeout(this._liveTimer);
    this._liveTimer = 0;
    this._livePending = null;
    this._els.live.textContent = text || '';
  }

  /**
   * @private live region: 400 ms after the LAST change (decision 16). `text` null ⇒ the crop sentence at flush time.
   * @param {string|null} text
   */
  _queueLive(text) {
    this._livePending = text;
    if (this._liveTimer) clearTimeout(this._liveTimer);
    this._liveTimer = window.setTimeout(() => {
      this._liveTimer = 0;
      const t = this._livePending ?? this._cropSentence();
      this._livePending = null;
      if (t && this._els) this._els.live.textContent = t;
    }, LIVE_MS);
  }

  // --- changes (user) ---

  /** @private a user change of the box is done: description, event, live region */
  _changed(source) {
    this._syncDesc();
    this.emit('crop-change', { crop: this.crop, source });
    this._queueLive(null);
  }

  /** @private @returns {boolean} */
  _apply(next, source) {
    if (!next || sameRect(next, this._rect)) return false;
    this._rect = next;
    this._renderVars();
    this._changed(source);
    return true;
  }

  /** @private zoom around the box centre (decision 13) */
  _zoom(k, source) {
    const r = /** @type {Rect} */ (this._rect);
    return this._apply(this._scale(r, k, { x: r.x + r.w / 2, y: r.y + r.h / 2 }), source);
  }

  /** @private */
  _setFocal(f, source) {
    if (!focalChanged(this._focal, f)) return false;
    this._focal = f;
    this._renderVars();
    this._syncFocalUi();
    this.emit('focal-change', { focalPoint: this.focalPoint, source });
    this._queueLive(this._focalSentence());
    return true;
  }

  /** @private */
  _toggleFocal() {
    if (this._focal) {
      this._setFocal(null, 'button');
      return;
    }
    const r = /** @type {Rect} */ (this._rect);
    this._setFocal(clampFocal({ x: (r.x + r.w / 2) / this._W, y: (r.y + r.h / 2) / this._H }), 'button');
  }

  /** @private @param {number} i @param {boolean} user */
  _selectPreset(i, user) {
    const list = this._choices();
    if (!(i >= 0 && i < list.length) || i === this._presetIdx) return;
    const was = this._ratio();
    this._presetIdx = i;
    this._syncPresetUi();
    this._syncLocked();
    if (!this._ready()) return;
    const r = list[i].ratio;
    this._reratio(r, was);
    this._renderVars();
    this._syncDesc();
    if (!user) return;
    this.emit('crop-change', { crop: this.crop, source: 'preset' });
    const L = TdCropper.labels;
    this._queueLive(r ? fmt(L.ratio, { label: list[i].label }) : L.ratioFree);
  }

  /** @private */
  _reset(user) {
    if (this._g) this._finish(false);
    const prevRect = this._rect ? { ...this._rect } : null;
    const prevIdx = this._presetIdx;
    const prevFocal = this._focal;
    if (!this._lock) this._presetIdx = this._defaultPresetIdx();
    if (this._els) this._syncPresetUi();
    if (this._ready()) this._rect = normalizeInitial(this._cropIn, { W: this._W, H: this._H, ratio: this._ratio() });
    this._focal = this._focalIn ? { ...this._focalIn } : null;
    this._renderVars();
    this._syncLocked();
    this._syncFocalUi();
    if (!user || !this._ready()) return;
    const boxChanged = !sameRect(prevRect, this._rect) || prevIdx !== this._presetIdx;
    if (boxChanged) this._changed('reset');
    if (focalChanged(prevFocal, this._focal)) {
      this.emit('focal-change', { focalPoint: this.focalPoint, source: 'reset' });
      // review R1 #7: the focal sentence is announced too (same 400 ms debounce; after the box sentence when both moved)
      this._queueLive(boxChanged ? `${this._cropSentence()}. ${this._focalSentence()}` : this._focalSentence());
    }
  }

  // --- toolbar ---

  /** @private */
  _onToolClick(e) {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!b || b.disabled || !this._interactive()) return;
    if (b.classList.contains('td-cropper__ratio')) this._selectPreset(Number(b.getAttribute('data-index')), true);
    else if (b === this._els.zoomOut) this._zoom(1 / ZOOM_STEP, 'button');
    else if (b === this._els.zoomIn) this._zoom(ZOOM_STEP, 'button');
    else if (b === this._els.focalBtn) this._toggleFocal();
    else if (b === this._els.reset) this._reset(true);
  }

  /** @private radiogroup: arrows follow the writing direction (the toolbar is RTL-aware), Home / End */
  _onRatioKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !this._interactive()) return;
    const n = this._choices().length;
    const rtl = getComputedStyle(this).direction === 'rtl';
    let i = this._presetIdx;
    if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) i = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) i = (i - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    this._selectPreset(i, true);
    const btn = /** @type {HTMLElement|null} */ (this._els.ratios.querySelector(`[data-index="${i}"]`));
    if (btn) btn.focus();
  }

  // --- keyboard on the stage (decision 15: PHYSICAL arrows, also under RTL) ---

  /** @private */
  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !this._interactive() || this._g) return;
    const { box, focal } = this._els;
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault();
      this._zoom(ZOOM_STEP, 'keyboard');
      return;
    }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      this._zoom(1 / ZOOM_STEP, 'keyboard');
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    const t = /** @type {Element} */ (e.target);
    const [ux, uy] = dir;
    const big = e.shiftKey;
    const r = /** @type {Rect} */ (this._rect);
    if (t === focal) {
      e.preventDefault();
      if (!this._focal) return;
      const s = big ? 0.1 : 0.01;
      this._setFocal(clampFocal({ x: this._focal.x + ux * s, y: this._focal.y + uy * s }), 'keyboard');
      return;
    }
    if (this._pan()) {
      // pan: the arrow moves the IMAGE that way (the rect goes the other way), 1 % of the FRAME side in model px
      if (t !== box) return;
      e.preventDefault();
      this._apply(moveBy(r, -stepFor(r.w, big) * ux, -stepFor(r.h, big) * uy, this._W, this._H), 'keyboard');
      return;
    }
    const sx = stepFor(this._W, big) * ux;
    const sy = stepFor(this._H, big) * uy;
    const handle = t instanceof Element && t.classList.contains('td-cropper__handle--corner') ? t.getAttribute('data-handle') : null;
    if (handle) {
      e.preventDefault();
      this._apply(resizeFrom(/** @type {any} */ (handle), r, { dx: sx, dy: sy },
        { ratio: this._ratio(), W: this._W, H: this._H, axis: ux ? 'x' : 'y' }), 'keyboard');
    } else if (t === box) {
      e.preventDefault();
      this._apply(moveBy(r, sx, sy, this._W, this._H), 'keyboard');
    }
  }

  // --- wheel (decision 14): zoom around the pointer; ctrlKey (trackpad pinch) takes the same path ---

  /** @private */
  _onWheel(e) {
    if (!this._interactive()) return; // not ready: let the page scroll
    e.preventDefault(); // only over the stage (the listener is on the stage): the page scrolls everywhere else
    if (this._g) return;
    if (isTrackpadDelta(e.deltaY, e.deltaMode)) {
      // v0.36.0 (plan QĐ 70): trackpads send many tiny deltas — accumulate them and apply ONE capped step per frame
      this._wheelAcc = (this._wheelAcc || 0) + e.deltaY;
      this._wheelAt = { x: e.clientX, y: e.clientY };
      if (!this._wheelRaf) {
        this._wheelRaf = requestAnimationFrame(() => {
          this._wheelRaf = 0;
          const acc = this._wheelAcc || 0;
          this._wheelAcc = 0;
          const k = dampedWheelFactor(acc);
          if (k === 1 || !this._interactive() || this._g) return;
          const at = this._wheelAt;
          const anchor = this._clientToModel(at.x, at.y);
          this._apply(this._scale(/** @type {Rect} */ (this._rect), k, anchor), 'wheel');
        });
      }
      return;
    }
    const k = wheelFactor(e.deltaY, e.deltaMode);
    if (k === 1) return;
    const anchor = this._clientToModel(e.clientX, e.clientY);
    this._apply(this._scale(/** @type {Rect} */ (this._rect), k, anchor), 'wheel');
  }

  // --- pointer (decision 14): Pointer Events + capture, one update per animation frame ---

  /** @private review R1 #6: is a client point on the RENDERED image (not the stage padding / letterbox)? */
  _onImage(cx, cy) {
    if (!this._fit || !this._ready()) return false;
    const p = this._clientToModel(cx, cy);
    return p.x >= 0 && p.y >= 0 && p.x <= this._W && p.y <= this._H;
  }

  /** @private */
  _onDown(e) {
    if (!this._interactive()) return;
    const touch = e.pointerType === 'touch';
    if (!touch && e.button !== 0) return;
    if (touch) this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this._g;
    if (g) {
      // a second finger turns a one-finger touch gesture into a pinch (Playwright has no multi-touch: tests synthesise)
      if (touch && g.touch && g.kind !== 'pinch' && this._touches.size === 2 && this._touches.has(g.id)) this._startPinch(e);
      e.preventDefault();
      return;
    }
    const t = e.target instanceof Element ? e.target : null;
    const { box, focal } = this._els;
    const h = t ? t.closest('[data-handle]') : null;
    let kind;
    // pan: anywhere in the stage drags the image; no tap action there, so no drag threshold (the image follows at once)
    if (this._pan()) kind = 'pan';
    else if (h && box.contains(h)) kind = 'resize';
    else if (t && !focal.hidden && focal.contains(t)) kind = 'focal';
    else if (t && box.contains(t)) kind = 'move';
    else if (this._focalTool() && this._onImage(e.clientX, e.clientY)) kind = 'tap'; // review R1 #6: never the letterbox / padding
    else return; // drawing a new box outside the box is a non-goal
    e.preventDefault();
    const handle = kind === 'resize' ? /** @type {Element} */ (h).getAttribute('data-handle') : null;
    const target = kind === 'resize' ? (CORNERS.includes(/** @type {string} */ (handle)) ? h : box)
      : kind === 'focal' ? focal : kind === 'move' || kind === 'pan' ? box : null;
    if (target instanceof HTMLElement) {
      try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    const rect = { .../** @type {Rect} */ (this._rect) };
    this._g = {
      kind,
      handle,
      id: e.pointerId,
      touch,
      source: 'pointer',
      start: { x: e.clientX, y: e.clientY },
      last: { x: e.clientX, y: e.clientY },
      rect0: rect,
      origin: rect,
      focal0: this._focal ? { ...this._focal } : null,
      // a tap (≤ 4 px) sets the focal point: on the image, or on the box while the focal tool is on
      threshold: kind === 'tap' || (kind === 'move' && this._focalTool()),
      moved: false,
    };
    try { this._els.stage.setPointerCapture(e.pointerId); } catch { /* synthetic / already gone */ }
    // Escape during a drag: restore, swallow (window capture runs before the layer registry's document listener, so
    // a surrounding dialog never sees it), no event.
    this._onEsc = (ev) => {
      if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this._finish(false);
    };
    window.addEventListener('keydown', this._onEsc, true);
  }

  /** @private two touch pointers ⇒ pinch around their midpoint (decision 13) */
  _startPinch(e) {
    const g = this._g;
    const ids = [...this._touches.keys()].slice(0, 2);
    const [a, b] = ids.map((id) => /** @type {{x:number,y:number}} */ (this._touches.get(id)));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this._g = {
      kind: 'pinch',
      ids,
      touch: true,
      source: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid0: mid,
      anchor: this._clientToModel(mid.x, mid.y),
      rect0: { .../** @type {Rect} */ (this._rect) },
      origin: g.origin,
      focal0: g.focal0,
      threshold: false,
      moved: true,
    };
    try { this._els.stage.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    this.setAttribute('data-dragging', '');
  }

  /** @private */
  _onMove(e) {
    if (this._touches.has(e.pointerId)) this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this._g;
    if (!g || !(g.kind === 'pinch' ? g.ids.includes(e.pointerId) : e.pointerId === g.id)) return;
    if (g.kind !== 'pinch') g.last = { x: e.clientX, y: e.clientY };
    if (!this._raf) {
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._step();
      });
    }
  }

  /** @private */
  _onUp(e) {
    const g = this._g;
    if (g && (g.kind === 'pinch' ? g.ids.includes(e.pointerId) : e.pointerId === g.id)) {
      if (g.kind !== 'pinch' && e.type === 'pointerup') g.last = { x: e.clientX, y: e.clientY };
      this._finish(true); // one finger lifted ends a pinch (the other one is ignored until it lifts)
    }
    this._touches.delete(e.pointerId);
  }

  /** @private */
  _onLost(e) {
    const g = this._g;
    if (g && (g.kind === 'pinch' ? g.ids.includes(e.pointerId) : e.pointerId === g.id)) this._finish(true);
  }

  /** @private one frame of the gesture (absolute from the start: no drift) */
  _step() {
    const g = this._g;
    if (!g || !this._fit || !this._ready()) return;
    const s = this._fit.scale;
    const W = this._W;
    const H = this._H;
    let next;
    if (g.kind === 'pinch') {
      const [a, b] = g.ids.map((id) => this._touches.get(id));
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const o = { ratio: this._ratio(), W, H };
      if (this._pan()) { // pan: the image also follows the midpoint of the two fingers
        const dMid = { x: (a.x + b.x) / 2 - g.mid0.x, y: (a.y + b.y) / 2 - g.mid0.y };
        next = panPinch(g.rect0, g.d0 / d, g.anchor, dMid, this._frameW(), o);
      } else next = scaleAround(g.rect0, g.d0 / d, g.anchor, o);
    } else {
      const dxp = g.last.x - g.start.x;
      const dyp = g.last.y - g.start.y;
      if (!g.moved) {
        if (dxp === 0 && dyp === 0) return;
        if (g.threshold && Math.hypot(dxp, dyp) <= TAP_PX) return;
        g.moved = true;
        if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'pan') this.setAttribute('data-dragging', '');
      }
      const dx = dxp / s;
      const dy = dyp / s;
      if (g.kind === 'pan') next = panBy(g.rect0, dxp, dyp, s, W, H);
      else if (g.kind === 'move') next = moveBy(g.rect0, dx, dy, W, H);
      else if (g.kind === 'resize') next = resizeFrom(g.handle, g.rect0, { dx, dy }, { ratio: this._ratio(), W, H });
      else if (g.kind === 'focal' && g.focal0) {
        this._focal = clampFocal({ x: g.focal0.x + dx / W, y: g.focal0.y + dy / H });
        this._renderVars();
        return;
      } else return; // a tap that moved: nothing
    }
    if (!next || sameRect(next, this._rect)) return;
    this._rect = next;
    this._renderVars();
    this.emit('crop-input', { crop: this.crop, source: g.source });
  }

  /**
   * @private end the gesture: `commit` ⇒ final frame + crop-change / focal-change when something changed; else
   * (Escape, disconnect, disabled) ⇒ back to the start, no event.
   */
  _finish(commit) {
    const g = this._g;
    if (!g) return;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (commit) this._step();
    this._g = null;
    if (this._onEsc) window.removeEventListener('keydown', this._onEsc, true);
    this._onEsc = null;
    this.removeAttribute('data-dragging');
    const stage = this._els && this._els.stage;
    for (const id of g.kind === 'pinch' ? g.ids : [g.id]) {
      try { if (stage && stage.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch { /* ignore */ }
    }
    if (!commit) {
      this._rect = g.origin;
      this._focal = g.focal0;
      this._renderVars();
      this._syncFocalUi();
      return;
    }
    if (g.threshold && !g.moved && this._fit) { // a tap: set the focal point there (normalised to the whole image)
      const p = this._clientToModel(g.start.x, g.start.y);
      this._setFocal(clampFocal({ x: p.x / this._W, y: p.y / this._H }), 'pointer');
      return;
    }
    if (!sameRect(this._rect, g.origin)) this._changed(g.source);
    if (focalChanged(g.focal0, this._focal)) {
      this._syncFocalUi();
      this.emit('focal-change', { focalPoint: this.focalPoint, source: 'pointer' });
      this._queueLive(this._focalSentence());
    }
  }
}

if (!customElements.get('td-cropper')) customElements.define('td-cropper', TdCropper);
