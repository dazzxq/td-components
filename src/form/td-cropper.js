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
 * the focal-point tool), `focal` (JSON v1 `{"v":1,"x","y"}`), `disabled`.
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
 * handles on coarse pointers). CSSOM (display px, removed on disconnect): `--_tdc-img-x/y/w/h`, `--_tdc-box-x/y/w/h`,
 * `--_tdc-focal-x/y`.
 *
 * DOM (built once; every text through textContent / setAttribute):
 *   <div class="td-cropper__toolbar" role="group">
 *     <div class="td-cropper__ratios" role="radiogroup">button.td-cropper__ratio[role=radio]…</div>
 *     <div class="td-cropper__tools">button.td-cropper__zoom-out · .td-cropper__zoom-in · .td-cropper__focal-toggle
 *       [aria-pressed] · .td-cropper__reset</div>
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
} from '../utils/crop-geometry.js';
import { openCropDialog } from '../feedback/crop-dialog.js';

/** @typedef {import('../utils/crop-geometry.js').CropValue} CropValue */
/** @typedef {import('../utils/crop-geometry.js').Rect} Rect */

const OBSERVED = ['src', 'alt', 'natural-width', 'natural-height', 'aspect-ratio', 'crop', 'focal-point', 'focal', 'disabled'];
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
let uid = 0;

const fmt = (s, p) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(p, k) ? String(p[k]) : m));
const pct = (v) => Math.round(v * 100);
const px = (v) => `${Math.round(v * 100) / 100}px`;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
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
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._wheelRaf) cancelAnimationFrame(this._wheelRaf);
    this._wheelRaf = 0;
    this._wheelAcc = 0;
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
      case 'aspect-ratio':
        this._readLock();
        this._syncPresetUi();
        if (this._ready()) {
          const r = this._ratio();
          if (r) this._rect = applyPreset(/** @type {Rect} */ (this._rect), r, this._W, this._H);
          this._renderVars();
          this._syncDesc();
        }
        this._syncLocked();
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
    return toOutput(/** @type {Rect} */ (this._rect), { W: this._W, H: this._H, pixelsKnown: this._pixelsKnown, ratio: this._ratio() });
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
    const list = cleanPresets(v);
    this._presetList = list.length ? list : null;
    this._presetIdx = this._defaultPresetIdx();
    if (!this._els) return;
    this._renderPresets();
    if (this._ready()) {
      const r = this._ratio();
      if (r) this._rect = applyPreset(/** @type {Rect} */ (this._rect), r, this._W, this._H);
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

  /** @private */
  _focalTool() { return this.hasAttribute('focal-point'); }

  /** @private */
  _presets() { return this._presetList || cleanPresets(TdCropper.presets); }

  /** @private index of the free preset (or 0) */
  _defaultPresetIdx() {
    const i = this._presets().findIndex((p) => p.ratio == null);
    return i < 0 ? 0 : i;
  }

  /** @private the ratio in force: the `aspect-ratio` lock, else the selected preset's (null = free) */
  _ratio() {
    if (this._lock) return this._lock;
    const p = this._presets()[this._presetIdx];
    return p && p.ratio ? p.ratio : null;
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
    const f = containFit(this._W, this._H, bw, bh);
    this._fit = f.scale ? { scale: f.scale, x: f.x + pl, y: f.y + pt, w: f.w, h: f.h } : null;
    this._renderVars();
  }

  /** @private */
  _renderVars() {
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
    this.toggleAttribute('data-small-box', d.w < SMALL_BOX || d.h < SMALL_BOX);
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
    e.cornerDesc.textContent = L.cornerHelp;
    this._syncDesc();
  }

  /** @private one radio per preset (roving tabindex) */
  _renderPresets() {
    const { ratios } = this._els;
    const list = this._presets();
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
    ratios.hidden = !!this._lock;
    const on = this._interactive();
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (ratios.querySelectorAll('.td-cropper__ratio'))) {
      const sel = Number(b.getAttribute('data-index')) === this._presetIdx;
      b.setAttribute('aria-checked', sel ? 'true' : 'false');
      b.tabIndex = sel ? 0 : -1;
      b.disabled = !on;
    }
  }

  /** @private */
  _syncLocked() { this.toggleAttribute('data-locked', this._ratio() != null); }

  /** @private */
  _syncDisabled() {
    if (!this._els) return;
    const e = this._els;
    const on = this._interactive();
    for (const b of [e.zoomOut, e.zoomIn, e.focalBtn, e.reset]) b.disabled = !on;
    const ti = on ? 0 : -1;
    e.box.tabIndex = ti;
    for (const c of e.corners) c.tabIndex = ti;
    e.focal.tabIndex = ti;
    if (on) e.box.removeAttribute('aria-disabled');
    else e.box.setAttribute('aria-disabled', 'true');
    this._syncPresetUi();
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
    this._els.desc.textContent = s ? `${s}. ${L.boxHelp}` : L.boxHelp;
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
    return this._apply(scaleAround(r, k, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, { ratio: this._ratio(), W: this._W, H: this._H }), source);
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
    const list = this._presets();
    if (!(i >= 0 && i < list.length) || i === this._presetIdx) return;
    this._presetIdx = i;
    this._syncPresetUi();
    this._syncLocked();
    if (!this._ready()) return;
    const r = list[i].ratio;
    if (r) this._rect = applyPreset(/** @type {Rect} */ (this._rect), r, this._W, this._H);
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
    const n = this._presets().length;
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
          this._apply(scaleAround(/** @type {Rect} */ (this._rect), k, anchor, { ratio: this._ratio(), W: this._W, H: this._H }), 'wheel');
        });
      }
      return;
    }
    const k = wheelFactor(e.deltaY, e.deltaMode);
    if (k === 1) return;
    const anchor = this._clientToModel(e.clientX, e.clientY);
    this._apply(scaleAround(/** @type {Rect} */ (this._rect), k, anchor, { ratio: this._ratio(), W: this._W, H: this._H }), 'wheel');
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
    if (h && box.contains(h)) kind = 'resize';
    else if (t && !focal.hidden && focal.contains(t)) kind = 'focal';
    else if (t && box.contains(t)) kind = 'move';
    else if (this._focalTool() && this._onImage(e.clientX, e.clientY)) kind = 'tap'; // review R1 #6: never the letterbox / padding
    else return; // drawing a new box outside the box is a non-goal
    e.preventDefault();
    const handle = kind === 'resize' ? /** @type {Element} */ (h).getAttribute('data-handle') : null;
    const target = kind === 'resize' ? (CORNERS.includes(/** @type {string} */ (handle)) ? h : box)
      : kind === 'focal' ? focal : kind === 'move' ? box : null;
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
      next = scaleAround(g.rect0, g.d0 / d, g.anchor, { ratio: this._ratio(), W, H });
    } else {
      const dxp = g.last.x - g.start.x;
      const dyp = g.last.y - g.start.y;
      if (!g.moved) {
        if (dxp === 0 && dyp === 0) return;
        if (g.threshold && Math.hypot(dxp, dyp) <= TAP_PX) return;
        g.moved = true;
        if (g.kind === 'move' || g.kind === 'resize') this.setAttribute('data-dragging', '');
      }
      const dx = dxp / s;
      const dy = dyp / s;
      if (g.kind === 'move') next = moveBy(g.rect0, dx, dy, W, H);
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
