import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { TdMediaPicker, onDefaultsChange } from '../feedback/td-media-picker.js';
import { openCropDialog } from '../feedback/crop-dialog.js';
import { isAdapter, normalizeAsset, normalizeError, LatestRequest } from '../utils/media-picker-core.js';
import { safeMediaUrl } from '../utils/media-url.js';
import {
  KINDS, parseAspectRatio, parseCrop, parseFocal, parseKinds, parseCropRatio, serializeCrop, serializeFocal, cropRatioInRange,
  cropPreviewVars, fieldEntries, encodeState, decodeState,
} from '../utils/media-field-model.js';

const ALT_MAX = 500;
/** Attributes the no-JS hidden inputs of php/td.php td_media_field() may carry. */
const HIDDEN_ATTRS = ['type', 'class', 'name', 'value', 'disabled'];
/** v0.35: the no-JS hidden inputs, in FormData order (usage: id, crop, focal — alt is the visible input). */
const HIDDEN_CLASSES = ['td-media-field__value', 'td-media-field__crop', 'td-media-field__focal'];
const ROLES = {
  open: 'td-media-field__open', replace: 'td-media-field__replace', crop: 'td-media-field__crop-btn', remove: 'td-media-field__remove', alt: 'td-media-field__alt',
};
/** v0.35 (decision 30): the unitless CSSOM custom properties of the crop preview on the `<img>`. */
const CROP_VARS = ['--_td-mf-crop-x', '--_td-mf-crop-y', '--_td-mf-crop-w', '--_td-mf-crop-h'];
const EPS = 1e-6;
const posInt = (n) => (Number.isInteger(n) && n > 0 && n <= 100000 ? n : undefined);
/** Same numbers (± 1e-6) of two `{…}` objects over `keys`, or both null. */
const sameNums = (a, b, keys) => (!a || !b ? !a && !b : keys.every((k) => Math.abs(a[k] - b[k]) <= EPS));
const CROP_KEYS = ['x', 'y', 'width', 'height'];
/** review R1 #3: for COMPARISON only, a whole-image crop (± 1e-6) is "no crop" (null) — the stored raw is never rewritten. */
const cropForCompare = (c) => (c && [c.x, c.y].every((v) => Math.abs(v) <= EPS)
  && [c.width, c.height].every((v) => Math.abs(v - 1) <= EPS) ? null : c);
/** @type {WeakSet<HTMLImageElement>} preview images already waiting for `load` (crop preview) */
const LOAD_BOUND = new WeakSet();

const cap = (s) => [...String(s ?? '')].slice(0, ALT_MAX).join('');
const safeSrc = (u) => (typeof u === 'string' && u && safeMediaUrl(u) ? u : '');
const fill = (t, params) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));

/**
 * <td-media-field> — ONE media asset as a form value (v0.32.0, plan v0.32.0-media-picker decisions 23-31, M4).
 * Token-native: needs td.css (src/styles/components/media-field.css). Form-associated (TdFormElement).
 *
 * - The value is the opaque `assetId` (`''` = empty); `preview-src` / `preview-alt` / `kind` only DISPLAY the asset
 *   (never submitted, never identity). The `value` attribute (+ the preview attributes, `alt`, `crop`) is the default /
 *   reset state; a later attribute change sets the live state too.
 * - Choosing: the frame's open button (or "Đổi ảnh") opens `TdMediaPicker.open()` once at a time (double-open lock),
 *   options resolved open params > `pickerOptions` > `adapter` > `TdMediaPicker.configureDefaults()`; single selection,
 *   `initialIds = [value]`, `kinds` from `accept-kind`, `title` = `label`. A new id → value, preview, alt
 *   (`usage.altText`), crop `null`, then `input` + `change` (detail `{ value, selection }`); the same id refreshes the
 *   preview only (no event); cancel changes nothing. "Gỡ" → `''`, `input` + `change`, focus to the open button.
 *   No adapter anywhere → one console warning, nothing opens.
 * - `.value = id` without a preview + an adapter → a lazy `adapter.get(id)` (latest wins, aborted by the next change).
 * - Form shape (decision 24): reference `name=assetId`; `usage` → `name[id]`, `name[alt]`, `name[crop]` (`crop` = the
 *   validated attribute string, kept byte-identical, `null` once the asset changes). A usage `name` ending in `[]` is
 *   not submitted (one warning). Restore state: JSON v1 (`encodeState`), the preview URL re-validated on restore.
 * - SSR (ADR 0012, contract `media-field@1`): php/td.php td_media_field() prints exactly render()'s tree + the no-JS
 *   hidden inputs / alt `name` — adopted IN PLACE (internals first, then the no-JS parts removed); anything else →
 *   safe render keeping the alt being typed + the focus. Re-connect re-binds in place while the markup still matches.
 * - v0.35 (plan v0.35.0-cropper decisions 27-31, `usage` mode only — else one warning, ignored): `croppable` adds the
 *   "Cắt ảnh" button (an un-cropped source: `adapter.get(value)` → `urls.preview` + `width/height` when an adapter
 *   resolves, else `preview-src`, no pixels) and makes the picker run its crop step (`crop` is ALWAYS passed to
 *   `open()`: `{ enabled: false }` when not croppable); `crop-ratio` (`W/H` | `W:H` | number | `free`; absent → the
 *   `aspect-ratio`, then free); `focal-point` submits a fourth entry `name[focal]` (JSON v1 `{"v":1,"x","y"}` or `null`)
 *   + edits it in the crop dialog; `focal` = its default. State machine: plan table 28b (state first, then events).
 *   Croppable + a frame ratio: the `<img>` shows the cropped area (CSSOM `--_td-mf-crop-x/y/w/h`, unitless) when the
 *   crop's pixel ratio is within 2 % of the frame's; else `object-fit: cover`.
 *
 * DOM contract (JS render() = PHP):
 *   <td-media-field class="td-media-field" name label [aspect-ratio] [preview-fit] [accept-kind] [usage] [required]
 *                   [disabled] [value] [preview-src] [preview-alt] [kind] [alt] [crop] [prompt] [helper-text] [error-text]>
 *     <span class="td-media-field__label" id="{id}-label">label[<span class="td-field__required" aria-hidden="true"> *</span>]</span>
 *     <div class="td-media-field__frame" data-state="empty|filled" data-kind="image|video|file">
 *       [<svg class="td-media-field__sizer" viewBox="0 0 W H" aria-hidden="true" focusable="false"></svg>]
 *       <button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="{id}-label {id}-state"
 *               [aria-describedby="{id}-help {id}-error"] [aria-invalid aria-errormessage] [disabled]>
 *         empty:  <span class="td-media-field__empty"><span class="td-media-field__icon" data-td-icon="{kind}" aria-hidden="true">
 *                 </span><span class="td-media-field__prompt">…</span>[<span class="td-media-field__ratio">3:2</span>]</span>
 *         image / video poster: <img class="td-media-field__img" src alt="" loading="lazy" decoding="async"
 *                 referrerpolicy="no-referrer">[<span class="td-media-field__badge">Video</span>]
 *         file / no preview: <span class="td-media-field__file"><span class="td-media-field__icon" data-td-icon="{kind}"
 *                 aria-hidden="true"></span><span class="td-media-field__name">{preview-alt | noPreview}</span></span>
 *         <span class="td-sr-only" id="{id}-state">Chưa chọn | Đã chọn: …</span>
 *       </button>
 *     </div>
 *     <div class="td-media-field__actions" [hidden]>
 *       <button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog">Đổi ảnh</button>
 *       [croppable + usage: <button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__crop-btn"
 *               aria-haspopup="dialog" [hidden]>Cắt ảnh</button>]
 *       <button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button>
 *     </div>
 *     [croppable + usage: <span class="td-media-field__status" role="status">{crop source error}</span>]
 *     [<div class="td-field td-media-field__usage"><label class="td-field__label" for="{id}-alt">Mô tả ảnh (alt)</label>
 *       <input type="text" class="td-field__control td-media-field__alt" id="{id}-alt" maxlength="500"></div>]
 *     [<span class="td-media-field__help" id="{id}-help">…</span>]
 *     [<span class="td-field-error" id="{id}-error" data-for="{id}">…</span>]
 *   </td-media-field>
 *
 * @element td-media-field
 * @attr {string} name
 * @attr {string} label
 * @attr {string} value - default assetId
 * @attr {string} aspect-ratio - `W/H`, `W:H` or one number (1.91 → 1.91:1); absent / invalid → the natural ratio
 * @attr {string} preview-fit - cover (default) | contain
 * @attr {string} accept-kind - image | video | file list (default image)
 * @attr {boolean} usage - submit `name[id]`, `name[alt]`, `name[crop]` + show the alt input
 * @attr {string} preview-src @attr {string} preview-alt @attr {string} kind
 * @attr {string} alt @attr {string} crop - JSON v1 (kept as is)
 * @attr {boolean} croppable - v0.35 (usage only): "Cắt ảnh" button + the picker's crop step
 * @attr {string} crop-ratio - v0.35: `W/H` | `W:H` | number | `free` (absent → aspect-ratio, then free)
 * @attr {boolean} focal-point - v0.35 (usage only): submit `name[focal]` (+ edited in the crop dialog when croppable)
 * @attr {string} focal - v0.35: JSON v1 `{"v":1,"x","y"}` (kept as is)
 * @attr {string} prompt @attr {string} helper-text @attr {string} error-text
 * @attr {boolean} required @attr {boolean} disabled
 * @fires input - detail: { value, selection } (also on each alt keystroke)
 * @fires change - detail: { value, selection } (alt: on blur after an edit)
 */
export class TdMediaField extends TdFormElement {
  /** v0.32.0: adopts php/td.php td_media_field() markup in place (contract media-field@1). */
  static hydratable = true;

  /** Texts (Vietnamese); override per site (an SSR page whose texts differ is safely re-rendered). */
  static labels = {
    prompt: { image: 'Chọn ảnh', video: 'Chọn video', file: 'Chọn file' },
    replace: { image: 'Đổi ảnh', video: 'Đổi video', file: 'Đổi file' },
    remove: 'Gỡ',
    alt: 'Mô tả ảnh (alt)',
    empty: 'Chưa chọn',
    selected: 'Đã chọn: {name}',
    noPreview: 'Đã chọn (không có ảnh xem trước)',
    video: 'Video',
    required: 'Vui lòng chọn {kind}.',
    kinds: { image: 'ảnh', video: 'video', file: 'file' },
    /** v0.35 */
    crop: 'Cắt ảnh',
    cropError: 'Không tải được ảnh để cắt.',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'aspect-ratio', 'preview-fit', 'accept-kind', 'usage',
      'preview-src', 'preview-alt', 'kind', 'alt', 'crop', 'prompt', 'helper-text', 'error-text',
      'croppable', 'crop-ratio', 'focal-point', 'focal'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'usage', 'croppable', 'focal-point']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    this._value = '';
    this._previewSrc = '';
    this._previewAlt = '';
    this._kind = 'image';
    this._alt = '';
    /** @type {string|null} validated crop JSON, submitted as is */
    this._cropRaw = null;
    /** @type {string|null} v0.35: validated focal JSON, submitted as is (with `focal-point`) */
    this._focalRaw = null;
    /** @type {string} v0.35: the crop source error shown in the status region (text only) */
    this._cropStatus = '';
    this._cropReq = new LatestRequest();
    /** @type {AbortController|null} v0.35: the running "Cắt ảnh" flow (source get + dialog) */
    this._cropCtrl = null;
    /** @type {import('../utils/media-picker-core.js').MediaAsset|null} */
    this._asset = null;
    this._valueSet = false;
    this._liveReady = false;
    this._picking = false;
    this._pickGen = 0;
    this._getReq = new LatestRequest();
    this._adapterProp = null;
    this._pickerOptions = null;
    /** @type {string|null} role of the control that had the focus (kept across a move) */
    this._focusRole = null;
    this._warned = new Set();
  }

  connectedCallback() {
    const reconnect = this._initialized;
    if (!this._initialized) {
      // properties assigned before define live in own data properties that shadow the accessors below
      for (const p of ['adapter', 'pickerOptions']) {
        if (Object.prototype.hasOwnProperty.call(this, p)) {
          const v = this[p];
          delete this[p];
          this[p] = v;
        }
      }
      if (!this.classList.contains('td-media-field')) this.classList.add('td-media-field');
    }
    super.connectedCallback();
    if (reconnect) this._refocusAfterMove();
    // review SEC-1: an id without a preview (restored state, `.value =`) waits for an adapter — configureDefaults() later
    if (this._unsubDefaults) this._unsubDefaults();
    this._unsubDefaults = onDefaultsChange(() => this._sourceChanged());
    if (this._needsPreview()) this._lazyGet();
  }

  disconnectedCallback() {
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
    super.disconnectedCallback();
    this._cancelPicker(); // review R3 #1: a picker result arriving after the field left is dropped AND the picker closes
    this._getReq.abort();
    this._abortCrop();
    this._clearCropPreview(); // CSSOM vars off while detached: a re-connect re-binds the markup unchanged
  }

  // --- Public API ---

  /** @returns {string} the selected assetId ('' = empty) */
  get value() { return this._value; }

  /** Select an asset by id (silent; no preview → lazy `adapter.get(id)`); '' / null clears. */
  set value(v) {
    const id = v == null ? '' : String(v);
    if (!this._liveReady) { // before the first connect: merged with the attributes by _initLive()
      this._value = id;
      this._valueSet = true;
      return;
    }
    if (id === this._value) return;
    this._applyLive({ id, src: '', previewAlt: '', kind: this._kinds()[0], alt: this._alt, cropRaw: null, focalRaw: null, asset: null },
      { lazy: this._initialized && this.isConnected });
  }

  /** @returns {object|null} the field's own adapter (lower priority than `pickerOptions.adapter`) */
  get adapter() { return this._adapterProp; }

  set adapter(a) {
    this._adapterProp = a ?? null;
    this._sourceChanged();
  }

  /** @returns {object|null} options merged over TdMediaPicker defaults when the picker opens */
  get pickerOptions() { return this._pickerOptions; }

  set pickerOptions(o) {
    this._pickerOptions = o && typeof o === 'object' ? o : null;
    this._sourceChanged();
  }

  /**
   * @returns {Array<{ assetId: string, asset: object|null, usage: { altText: string, crop: object|null,
   *   focalPoint: { x: number, y: number }|null } }>} `[]` when empty; `asset` is null when only server / restored data
   *   is known; `focalPoint` (v0.35) is the field's focal with `focal-point` (+ `usage`), else null
   */
  get selection() {
    if (!this._value) return [];
    const c = this._cropRaw ? parseCrop(this._cropRaw) : null;
    const f = this._focalOn() && this._focalRaw ? parseFocal(this._focalRaw) : null;
    return [{
      assetId: this._value,
      asset: this._asset,
      usage: { altText: this._alt, crop: c ? { normalized: { ...c.crop } } : null, focalPoint: f ? { ...f.focal } : null },
    }];
  }

  /**
   * Set the selection from code (silent): a SelectedMedia (or a one-item array), or null / [] to clear.
   * @param {object|object[]|null} sel
   */
  setSelection(sel) {
    const s = Array.isArray(sel) ? sel[0] : sel;
    if (!s || typeof s !== 'object' || typeof s.assetId !== 'string' || !s.assetId) {
      this._valueSet = true;
      this._applyLive({ id: '', src: '', previewAlt: '', kind: this._kinds()[0], alt: '', cropRaw: null, focalRaw: null, asset: null });
      return;
    }
    const asset = normalizeAsset(s.asset, { safeUrl: (u) => safeMediaUrl(u) });
    const n = s.usage?.crop?.normalized;
    let cropRaw = null;
    if (n && typeof n === 'object') {
      // v0.34 path kept as is (decision 29): the raw numbers, never re-rounded (NOT serializeCrop)
      cropRaw = parseCrop(JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height }))?.raw ?? null;
    }
    const fp = s.usage?.focalPoint;
    let focalRaw = null;
    if (fp && typeof fp === 'object') {
      focalRaw = parseFocal(JSON.stringify({ v: 1, x: fp.x, y: fp.y }))?.raw ?? null; // same rule as the crop (table 28b)
    }
    const altText = typeof s.usage?.altText === 'string' ? s.usage.altText : (asset?.defaultAltText ?? '');
    this._valueSet = true;
    this._applyLive({ id: s.assetId, ...this._previewOf(asset), alt: cap(altText), cropRaw, focalRaw, asset });
  }

  // --- State ---

  /** @private accepted kinds (accept-kind) */
  _kinds() { return parseKinds(this.getAttribute('accept-kind') ?? ''); }

  /** @private the valid aspect ratio (invalid → warned once per value, treated as absent) */
  _ratio() {
    const raw = this.getAttribute('aspect-ratio');
    if (raw == null || raw.trim() === '') return null;
    const r = parseAspectRatio(raw);
    if (!r) this._warnOnce(`ratio:${raw}`, `td-media-field: aspect-ratio "${raw}" is not W/H, W:H or a positive number — ignored.`);
    return r;
  }

  /** @private */
  _cropFromAttr() {
    const raw = this.getAttribute('crop');
    if (raw == null || raw === '' || raw === 'null') return null;
    const c = parseCrop(raw);
    if (!c) this._warnOnce(`crop:${raw}`, 'td-media-field: crop is not a JSON v1 crop ({"v":1,"x","y","width","height"} in 0..1) — ignored.');
    return c ? c.raw : null;
  }

  /** @private v0.35: the `focal` attribute → validated raw string (invalid → one warning, null) */
  _focalFromAttr() {
    const raw = this.getAttribute('focal');
    if (raw == null || raw === '' || raw === 'null') return null;
    const f = parseFocal(raw);
    if (!f) this._warnOnce(`focal:${raw}`, 'td-media-field: focal is not a JSON v1 focal ({"v":1,"x","y"} in 0..1) — ignored.');
    return f ? f.raw : null;
  }

  /**
   * @private v0.35 (decision 27): `croppable` / `crop-ratio` / `focal-point` / `focal` need `usage` (the reference form
   * shape has no crop entry) — without it: one warning, ignored (fail closed).
   * @returns {boolean} usage mode
   */
  _usageFor35() {
    const usage = this.hasAttribute('usage');
    if (!usage && ['croppable', 'crop-ratio', 'focal-point', 'focal'].some((a) => this.hasAttribute(a))) {
      this._warnOnce('v035-usage', 'td-media-field: croppable / crop-ratio / focal-point / focal need the usage attribute — ignored.');
    }
    return usage;
  }

  /** @private v0.35: the crop UI is on (`croppable` + `usage`) */
  _croppable() { return this.hasAttribute('croppable') && this._usageFor35(); }

  /** @private v0.35: `name[focal]` is submitted (`focal-point` + `usage`) */
  _focalOn() { return this.hasAttribute('focal-point') && this._usageFor35(); }

  /**
   * @private v0.35 (decision 27): the locked crop ratio (w / h) or null (free): `crop-ratio` (`free` → null; invalid →
   * one warning, then the fallback), else the frame's `aspect-ratio`, else free.
   * @returns {number|null}
   */
  _cropRatio() {
    const raw = this.getAttribute('crop-ratio');
    if (raw != null && raw.trim() !== '') {
      const r = parseCropRatio(raw);
      if (r === 'free') return null;
      if (typeof r === 'number') return r;
      this._warnOnce('crop-ratio', 'td-media-field: crop-ratio must be free or W/H, W:H, a number with a ratio in [0.01, 100] — ignored.');
    }
    const f = this._ratio();
    if (!f) return null;
    if (cropRatioInRange(f.w / f.h)) return f.w / f.h;
    // review R1 #5: the frame's aspect-ratio is valid up to 10000:1, the crop ratio only in [0.01, 100]
    this._warnOnce('crop-ratio-frame', 'td-media-field: aspect-ratio is outside the crop ratio range [0.01, 100] — the crop is free.');
    return null;
  }

  /** @private */
  _stateFromAttrs() {
    const k = this.getAttribute('kind');
    return {
      id: this.getAttribute('value') ?? '',
      src: safeSrc(this.getAttribute('preview-src')),
      previewAlt: this.getAttribute('preview-alt') ?? '',
      kind: KINDS.includes(k) ? k : 'image',
      alt: cap(this.getAttribute('alt') ?? ''),
      cropRaw: this._cropFromAttr(),
      focalRaw: this._focalFromAttr(),
      asset: null,
    };
  }

  /** @private the live state on first connect: attributes, an early `.value` winning over the attribute */
  _initLive() {
    if (this._liveReady) return;
    const s = this._stateFromAttrs();
    if (this._valueSet && s.id !== this._value) {
      Object.assign(s, { id: this._value, src: '', previewAlt: '', kind: this._kinds()[0], cropRaw: null, focalRaw: null });
    }
    this._valueSet = false;
    this._set(s);
    this._liveReady = true;
  }

  /** @private */
  _set(s) {
    this._value = s.id;
    this._previewSrc = s.src;
    this._previewAlt = s.previewAlt;
    this._kind = KINDS.includes(s.kind) ? s.kind : 'image';
    this._alt = cap(s.alt);
    this._cropRaw = s.cropRaw;
    this._focalRaw = s.focalRaw ?? null;
    this._asset = s.asset ?? null;
    // review R1 #2 (TOCTOU): where the asset came from — reused as the crop source only on an EXACT match
    this._assetProv = this._asset ? (s.assetProv ?? null) : null;
    // review R2 path 1: a preview produced by an adapter (picker outcome) carries that source; an attribute /
    // programmatic preview (null) is the only one trusted as the no-adapter crop source, and is kept apart to come back
    // when an adapter-derived preview is invalidated
    this._previewProv = s.previewProv ?? null;
    if (!this._previewProv) this._explicitPreview = { id: this._value, src: this._previewSrc, previewAlt: this._previewAlt, kind: this._kind };
  }

  /** @private the current source provenance: adapter + context + source generation */
  _prov() {
    return { adapter: this._resolveAdapter(), context: this._resolveContext(), gen: this._srcGen || 0 };
  }

  /** @private review R1 #2: `p` is exactly the current adapter / context / source generation */
  _provMatches(p) {
    if (!p) return false;
    const now = this._prov();
    return !!now.adapter && p.adapter === now.adapter && Object.is(p.context, now.context) && p.gen === now.gen;
  }

  /** @private set the whole live state (silent), repaint in place, sync the form; `lazy` → fetch a missing preview */
  _applyLive(s, { lazy = false } = {}) {
    this._getReq.abort();
    // decision 28a: a value change aborts a pending crop source / open crop dialog; ISSUE-9 (impl review R3): so does ANY
    // change of the effective crop image (preview src / kind) on any path — the dialog never crops a stale image
    const imageChanged = (s.src ?? '') !== (this._previewSrc ?? '') || (s.kind ?? this._kind) !== this._kind;
    if (s.id !== this._value || (this._cropCtrl && imageChanged)) {
      this._abortCrop();
      this._cropStatus = '';
    }
    this._set(s);
    this._liveReady = true;
    if (this._initialized) this._update();
    if (lazy && this._needsPreview()) this._lazyGet();
  }

  /** @private preview fields of an asset (video → its poster = urls.preview) */
  _previewOf(asset) {
    if (!asset) return { src: '', previewAlt: '', kind: this._kinds()[0] };
    return { src: safeSrc(asset.urls?.preview), previewAlt: asset.name || '', kind: asset.kind };
  }

  /** @private an id without anything to show, nothing fetched yet */
  _needsPreview() {
    return !!this._value && !this._previewSrc && !this._previewAlt && !this._asset;
  }

  /** @private pickerOptions.adapter > field.adapter > TdMediaPicker defaults (decision 6) */
  _resolveAdapter() {
    if (isAdapter(this._pickerOptions?.adapter)) return this._pickerOptions.adapter;
    if (isAdapter(this._adapterProp)) return this._adapterProp;
    const d = TdMediaPicker.defaults?.adapter;
    return isAdapter(d) ? d : null;
  }

  /** @private the effective adapter / context */
  _resolveContext() {
    return this._pickerOptions?.context ?? TdMediaPicker.defaults?.context;
  }

  /**
   * @private review SEC-1 r2 (TOCTOU): the adapter / context changed (configureDefaults, `adapter`, `pickerOptions`, incl.
   * removal) → FIRST invalidate the pending get (abort + new source generation), THEN refetch when an adapter resolves.
   */
  _sourceChanged() {
    this._srcGen = (this._srcGen || 0) + 1;
    this._getReq.abort();
    // v0.35 review R1 #2: a pending crop source AND an open crop dialog of the old adapter / context are aborted
    if (this._cropCtrl) this._abortCrop();
    this._assetProv = null; // a cached asset of the old source is never the crop source again
    // review R2 path 2: a picker opened under the old source never commits (invalidate + close it)
    if (this._picking) this._cancelPicker();
    // review R2 path 1: an adapter-derived preview of the old source goes; the explicit preview-src (same value) comes back
    if (this._previewProv) {
      const ex = this._explicitPreview;
      const keep = !!ex && ex.id === this._value;
      this._previewSrc = keep ? ex.src : '';
      this._previewAlt = keep ? ex.previewAlt : '';
      if (keep) this._kind = ex.kind;
      this._asset = null;
      this._previewProv = null;
      if (this._initialized) this._update();
    }
    if (this._initialized && this.isConnected && this._needsPreview()) this._lazyGet();
    if (this._initialized) this._syncCropBtn(); // the "Cắt ảnh" source (28a) may have appeared / gone
  }

  /**
   * @private decision 27: fetch the preview of an id set by code (latest wins; a later change aborts it). A result is
   * applied only when the request generation (LatestRequest), the source generation, the adapter and the id all still
   * match — an old adapter that ignores its AbortSignal can never populate the preview.
   */
  _lazyGet() {
    this._getReq.abort(); // even when no adapter resolves: an older request never survives
    const adapter = this._resolveAdapter();
    if (!adapter) return;
    const id = this._value;
    const context = this._resolveContext();
    const gen = this._srcGen || 0;
    this._getReq.run((signal) => adapter.get(id, { context, signal })).then((r) => {
      if (r.stale || id !== this._value || gen !== (this._srcGen || 0) || adapter !== this._resolveAdapter()
        || !Object.is(context, this._resolveContext())) return;
      if (r.error) {
        normalizeError(r.error, null, { operation: 'td-media-field get' }); // logs operation + code only (review SEC-2)
        return;
      }
      const asset = normalizeAsset(r.value, { safeUrl: (u) => safeMediaUrl(u) });
      if (!asset || asset.id !== id) return;
      const p = this._previewOf(asset);
      this._previewSrc = p.src;
      this._previewAlt = p.previewAlt;
      this._kind = p.kind;
      this._asset = asset;
      this._assetProv = { adapter, context, gen };
      this._previewProv = { adapter, context, gen }; // review R2 path 1
      if (this._initialized) this._update();
    });
  }

  // --- Render ---

  /** @private */
  _label(key, params = {}) {
    let v = TdMediaField.labels;
    for (const part of key.split('.')) v = v && typeof v === 'object' ? v[part] : undefined;
    return typeof v === 'string' ? fill(v, params) : '';
  }

  render() {
    const e = (s) => this.escapeHtml(String(s ?? ''));
    const id = this.id;
    const kinds = this._kinds();
    const ratio = this._ratio();
    const filled = this._value !== '';
    const kind = filled ? this._kind : kinds[0];
    const dis = this._effectiveDisabled ? ' disabled' : '';
    const label = this.getAttribute('label') || '';
    const help = this.getAttribute('helper-text') || '';
    const err = this.errorMessage;
    const described = [help ? `${id}-help` : '', err ? `${id}-error` : ''].filter(Boolean).join(' ');
    const croppable = this._croppable();
    this._focalOn(); // warns once when focal-point / focal lack usage
    let inner;
    if (!filled) {
      const prompt = this.getAttribute('prompt') || this._label(`prompt.${kind}`);
      inner = `<span class="td-media-field__empty"><span class="td-media-field__icon" data-td-icon="${kind}" aria-hidden="true"></span>`
        + `<span class="td-media-field__prompt">${e(prompt)}</span>`
        + (ratio ? `<span class="td-media-field__ratio">${e(ratio.text)}</span>` : '') + '</span>';
    } else if (this._previewSrc && kind !== 'file') {
      inner = `<img class="td-media-field__img" src="${e(this._previewSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        + (kind === 'video' ? `<span class="td-media-field__badge">${e(this._label('video'))}</span>` : '');
    } else {
      inner = `<span class="td-media-field__file"><span class="td-media-field__icon" data-td-icon="${kind}" aria-hidden="true"></span>`
        + `<span class="td-media-field__name">${e(this._previewAlt || this._label('noPreview'))}</span></span>`;
    }
    const name = this._previewAlt || (this._previewSrc ? this._value : '');
    const state = !filled ? this._label('empty') : (name ? this._label('selected', { name }) : this._label('noPreview'));
    return `<span class="td-media-field__label" id="${e(id)}-label">${e(label)}`
      + (this.hasAttribute('required') ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') + '</span>'
      + `<div class="td-media-field__frame" data-state="${filled ? 'filled' : 'empty'}" data-kind="${kind}">`
      + (ratio ? `<svg class="td-media-field__sizer" viewBox="0 0 ${ratio.w} ${ratio.h}" aria-hidden="true" focusable="false"></svg>` : '')
      + `<button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="${e(id)}-label ${e(id)}-state"`
      + (described ? ` aria-describedby="${e(described)}"` : '')
      + (err ? ` aria-invalid="true" aria-errormessage="${e(id)}-error"` : '') + `${dis}>`
      + inner + `<span class="td-sr-only" id="${e(id)}-state">${e(state)}</span></button></div>`
      + `<div class="td-media-field__actions"${filled ? '' : ' hidden'}>`
      + `<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog"${dis}>${e(this._label(`replace.${kind}`))}</button>`
      + (croppable
        ? `<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__crop-btn" aria-haspopup="dialog"${this._cropBtnShown() ? '' : ' hidden'}${dis}>${e(this._label('crop'))}</button>`
        : '')
      + `<button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove"${dis}>${e(this._label('remove'))}</button></div>`
      + (croppable ? `<span class="td-media-field__status" role="status">${e(this._ssrRender ? '' : this._cropStatus)}</span>` : '')
      + (this.hasAttribute('usage')
        ? `<div class="td-field td-media-field__usage"><label class="td-field__label" for="${e(id)}-alt">${e(this._label('alt'))}</label>`
          + `<input type="text" class="td-field__control td-media-field__alt" id="${e(id)}-alt" maxlength="${ALT_MAX}"${dis}></div>`
        : '')
      + (help ? `<span class="td-media-field__help" id="${e(id)}-help">${e(help)}</span>` : '')
      + (err ? `<span class="td-field-error" id="${e(id)}-error" data-for="${e(id)}">${e(err)}</span>` : '');
  }

  /** @private keep the focused control focused across an attribute re-render */
  _doRender() {
    const active = this.ownerDocument?.activeElement;
    const role = this._initialized && active && active !== this && this.contains(active) ? this._roleOf(active) : null;
    super._doRender();
    if (role) this._part(role)?.focus({ preventScroll: true });
  }

  afterRender() {
    const open = this._part('open');
    if (!open) return;
    fillIconSlots(this);
    // render() writes the description / error ids itself: both are the component's own
    this._describedByTarget = open;
    this._foreignDescribedBy = [];
    this._ownDescribedBy = new Set([`${this.id}-help`, `${this.id}-error`]);
    this._errorNote = [...this.children].find(ssrIsErrorNote) || null;
    this.listen(open, 'click', () => this._openPicker(open));
    const replace = this._part('replace');
    if (replace) this.listen(replace, 'click', () => this._openPicker(replace));
    const crop = this._part('crop');
    if (crop) this.listen(crop, 'click', () => this._openCrop(crop));
    const remove = this._part('remove');
    if (remove) this.listen(remove, 'click', () => this._remove());
    const alt = this._part('alt');
    if (alt) {
      if (alt.value !== this._alt) alt.value = this._alt;
      this.listen(alt, 'input', (ev) => {
        ev.stopPropagation(); // the host fires its own event (no duplicate native one)
        this._alt = cap(alt.value);
        this._syncForm();
        this._emit('input');
      });
      this.listen(alt, 'change', (ev) => {
        ev.stopPropagation();
        this._emit('change');
      });
    }
    if (!this._hostBound) { // host listeners: once per connection (afterRender also runs after each re-render)
      this._hostBound = true;
      this.listen(this, 'focusin', (ev) => { this._focusRole = this._roleOf(ev.target); });
      this.listen(this, 'focusout', (ev) => {
        if (this.contains(/** @type {Node} */ (ev.relatedTarget))) return;
        // Chromium blurs a removed control BEFORE the removal (still connected): decide after it — a field still on the
        // page without the focus forgets the role; a removed (or already re-inserted + refocused) one keeps it
        queueMicrotask(() => {
          if (this.isConnected && !this.contains(this.ownerDocument.activeElement)) this._focusRole = null;
        });
      });
      this._cleanups.push(() => { this._hostBound = false; });
    }
    this._syncCropBtn();
    this._syncCropPreview();
    this._syncForm();
    this._applyErrorState();
  }

  /** @protected helper note in the open button's description */
  _describedByIds() {
    return this.getAttribute('helper-text') ? [`${this.id}-help`] : [];
  }

  /** @protected label clicks / validity bubble → the open button */
  _focusTarget() { return this._part('open'); }

  /** @private */
  _part(role) {
    const sel = {
      open: ':scope > .td-media-field__frame > button.td-media-field__open',
      replace: ':scope > .td-media-field__actions > button.td-media-field__replace',
      crop: ':scope > .td-media-field__actions > button.td-media-field__crop-btn',
      status: ':scope > span.td-media-field__status',
      img: ':scope > .td-media-field__frame > button.td-media-field__open > img.td-media-field__img',
      remove: ':scope > .td-media-field__actions > button.td-media-field__remove',
      alt: ':scope > .td-media-field__usage > input.td-media-field__alt',
      frame: ':scope > div.td-media-field__frame',
      actions: ':scope > div.td-media-field__actions',
    }[role];
    return sel ? this.querySelector(sel) : null;
  }

  /** @private */
  _roleOf(el) {
    if (!el || !el.classList) return null;
    for (const [role, cls] of Object.entries(ROLES)) if (el.classList.contains(cls)) return role;
    return null;
  }

  /** @private a move (remove + insert) drops the focus: put it back on the same control */
  _refocusAfterMove() {
    const role = this._focusRole;
    const active = this.ownerDocument.activeElement;
    if (!role || (active && active !== this.ownerDocument.body && active !== this.ownerDocument.documentElement)) return;
    this._part(role)?.focus({ preventScroll: true });
  }

  /** @private repaint the value-dependent parts IN PLACE (open button content, frame state, actions, alt) */
  _update() {
    const frame = this._part('frame');
    const open = this._part('open');
    const actions = this._part('actions');
    if (!frame || !open || !actions) { this._doRender(); return; }
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const top = [...tpl.content.children];
    const wFrame = top.find((n) => n.classList.contains('td-media-field__frame'));
    const wOpen = wFrame.querySelector('.td-media-field__open');
    const wActions = top.find((n) => n.classList.contains('td-media-field__actions'));
    for (const a of ['data-state', 'data-kind']) frame.setAttribute(a, wFrame.getAttribute(a));
    open.replaceChildren(...wOpen.childNodes);
    fillIconSlots(open);
    actions.hidden = wActions.hidden;
    const btns = [...actions.querySelectorAll(':scope > button')];
    [...wActions.children].forEach((w, i) => {
      if (!btns[i]) return;
      if (btns[i].textContent !== w.textContent) btns[i].textContent = w.textContent;
      if (btns[i].hidden !== w.hidden) btns[i].hidden = w.hidden;
    });
    const status = this._part('status');
    if (status && status.textContent !== this._cropStatus) status.textContent = this._cropStatus;
    const alt = this._part('alt');
    if (alt && alt.value !== this._alt) alt.value = this._alt;
    this._syncCropPreview();
    this._syncForm();
  }

  // --- v0.35 crop: button, preview ---

  /**
   * @private decision 28 / 28a: "Cắt ảnh" usable = a value of kind image + an un-cropped source: an adapter (→ get) or
   * `preview-src`. The SSR gate compares with `preview-src` only (PHP cannot know the adapter): `_syncCropBtn()` then
   * shows the button once an adapter resolves.
   */
  _cropBtnShown() {
    if (!this._value || this._kind !== 'image') return false;
    const adapter = !!this._resolveAdapter();
    // review R2 path 1: without an adapter only an explicit (attribute / programmatic) preview is a crop source
    return (!!this._previewSrc && (adapter || !this._previewProv)) || (!this._ssrRender && adapter);
  }

  /** @private the crop button's `hidden` follows the source (adapter appeared / removed) */
  _syncCropBtn() {
    const btn = this._part('crop');
    if (!btn) return;
    const hide = !this._cropBtnShown();
    if (btn.hidden !== hide) btn.hidden = hide;
  }

  /** @private */
  _clearCropPreview() {
    const img = this._part('img');
    if (!img || !img.hasAttribute('style')) return;
    for (const v of CROP_VARS) img.style.removeProperty(v);
    if (!img.getAttribute('style')) img.removeAttribute('style');
  }

  /**
   * @private decision 30: croppable + a frame ratio + a crop whose pixel ratio is within 2 % of it → the `<img>` shows
   * exactly the cropped area (CSSOM custom properties, unitless); else plain `object-fit: cover` (vars removed). The
   * natural size = `asset.width/height`, else the decoded preview's (`load` → recomputed).
   */
  _syncCropPreview() {
    const img = this._part('img');
    if (!img) return;
    const frameRatio = this._croppable() && this._kind === 'image' ? this._ratio() : null;
    const crop = frameRatio && this._cropRaw ? parseCrop(this._cropRaw)?.crop : null;
    let vars = null;
    if (crop) {
      const a = this._asset;
      const known = !!(a && posInt(a.width) && posInt(a.height));
      const W = known ? a.width : img.naturalWidth;
      const H = known ? a.height : img.naturalHeight;
      vars = cropPreviewVars(crop, { W, H, frameRatio: frameRatio.w / frameRatio.h });
      if (!known && !(W > 0 && H > 0) && !LOAD_BOUND.has(img)) {
        LOAD_BOUND.add(img); // once per <img>: recompute when it has decoded
        img.addEventListener('load', () => { if (this._part('img') === img) this._syncCropPreview(); }, { once: true });
      }
    }
    if (!vars) { this._clearCropPreview(); return; }
    const vals = [vars.x, vars.y, vars.w, vars.h];
    CROP_VARS.forEach((v, i) => img.style.setProperty(v, String(vals[i])));
  }

  // --- Form ---

  /** @private FormData by hand (decision 24) + the restore state + validity */
  _syncForm() {
    const name = this.getAttribute('name');
    const usage = this.hasAttribute('usage');
    const entries = this._entries();
    if (!entries && usage && name && name.endsWith('[]')) {
      this._warnOnce('name[]', `td-media-field: usage + name "${name}" ending in [] would mis-group name[id] / name[alt] / name[crop] — not submitted.`);
    }
    let fd = null;
    if (entries) {
      fd = new FormData();
      for (const [k, v] of entries) fd.append(k, v);
    }
    // review SEC-1: the restore state carries no preview URL / server label (re-fetched with adapter.get on restore)
    this._setFormValue(fd, encodeState({ id: this._value, alt: this._alt, cropRaw: this._cropRaw, focalRaw: this._focalRaw }));
    if (this.hasAttribute('required') && !this._value) {
      const kind = this._kinds()[0];
      this._setValidity({ valueMissing: true },
        this._label('required', { kind: this._label(`kinds.${kind}`) || kind }), this._part('open') || undefined);
    } else {
      this._setValidity({});
    }
  }

  /** @private the FormData entries (decision 24; v0.35 decision 29: + `name[focal]` with `focal-point`) */
  _entries() {
    return fieldEntries(this.getAttribute('name'), { id: this._value, alt: this._alt, cropRaw: this._cropRaw, focalRaw: this._focalRaw },
      this.hasAttribute('usage'), { focal: this._focalOn() });
  }

  _captureDefaults() {
    this._defaults = this._stateFromAttrs();
  }

  _restoreDefaults() {
    this._applyLive({ ...(this._defaults || this._stateFromAttrs()), asset: null }, { lazy: this.isConnected });
  }

  /**
   * @protected formStateRestoreCallback (review SEC-1): only a v1 state of id / alt / crop; the preview starts empty and
   * is fetched with adapter.get(id) under the current session (latest wins). No adapter yet → fetched once one appears
   * (field.adapter / pickerOptions / TdMediaPicker.configureDefaults).
   */
  _restoreState(state) {
    if (typeof state !== 'string') return;
    const s = decodeState(state);
    if (!s) return;
    this._applyLive({
      id: s.id, src: '', previewAlt: '', kind: this._kinds()[0], alt: s.alt, cropRaw: s.cropRaw, focalRaw: s.focalRaw, asset: null,
    }, { lazy: true });
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'name':
        this._syncForm();
        return;
      case 'value': {
        const s = this._stateFromAttrs();
        if (s.id === this._value) return;
        this._applyLive({ ...s, alt: this._alt }, { lazy: true });
        return;
      }
      case 'preview-src':
      case 'preview-alt':
      case 'kind': {
        const s = this._stateFromAttrs();
        this._applyLive({
          id: this._value, src: s.src, previewAlt: s.previewAlt, kind: s.kind, alt: this._alt, cropRaw: this._cropRaw, focalRaw: this._focalRaw, asset: null,
        });
        return;
      }
      case 'alt': {
        this._alt = cap(newVal ?? '');
        const alt = this._part('alt');
        if (alt && alt.value !== this._alt) alt.value = this._alt;
        this._syncForm();
        return;
      }
      case 'crop':
        this._cropRaw = this._cropFromAttr();
        this._syncCropPreview();
        this._syncForm();
        return;
      case 'focal':
        this._focalRaw = this._focalFromAttr();
        this._syncForm();
        return;
      case 'crop-ratio':
        return; // read when the picker / crop dialog opens
      case 'preview-fit':
        return; // CSS only
      default:
        super.attributeChangedCallback(name, oldVal, newVal);
    }
  }

  // --- Behaviour ---

  /** @private */
  _emit(type) {
    this.emit(type, { value: this._value, selection: this.selection });
  }

  /** @private decision 26: one picker at a time, result applied only while the field is still on the page */
  _openPicker(trigger) {
    if (this._picking || this._effectiveDisabled) return;
    const adapter = this._resolveAdapter();
    if (!adapter) {
      this._warnOnce('adapter', 'td-media-field: no media adapter (field.adapter, field.pickerOptions.adapter or '
        + 'TdMediaPicker.configureDefaults({ adapter })) — the picker was not opened.');
      return;
    }
    const opts = {
      ...(isAdapter(this._adapterProp) ? { adapter: this._adapterProp } : {}),
      ...(this._pickerOptions || {}),
      selection: { mode: 'single', initialIds: this._value ? [this._value] : [], kinds: this._kinds() },
      // v0.35 decision 28 (review R2 #7): ALWAYS the highest priority — a site's pickerOptions.crop / configureDefaults
      // ({ crop }) never opens the crop step for a field that is not croppable
      crop: this._croppable()
        ? { enabled: true, aspectRatio: this._cropRatio(), allowFocalPoint: this._focalOn() }
        : { enabled: false },
    };
    const label = this.getAttribute('label');
    if (label) opts.title = label;
    this._picking = true;
    const gen = ++this._pickGen;
    const prov = this._prov(); // review R1 #2: the asset of the outcome comes from THIS source
    let p;
    const hosts = () => [...document.body.children].filter((n) => n.localName === 'td-media-picker');
    const before = new Set(hosts());
    try {
      p = Promise.resolve(TdMediaPicker.open(opts));
      // review R2 path 2: the picker host this open() mounted (so a source change can close it)
      const host = hosts().find((n) => !before.has(n)) || null;
      if (gen === this._pickGen && this._provMatches(prov) && this.isConnected) this._pickerHost = host;
      else {
        // review R3 #2: app code run synchronously inside open() (adapter list() / get() → configureDefaults, an
        // adapter swap, removal) already invalidated this picker before its host was known: close it now
        try { if (host && host.isConnected) host.close('programmatic'); } catch { /* ignore */ }
        if (gen === this._pickGen) { this._pickGen += 1; this._picking = false; }
      }
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then((outcome) => {
      if (gen !== this._pickGen) return;
      this._picking = false;
      this._pickerHost = null;
      if (!this._provMatches(prov)) return; // review R2 path 2: a stale source never commits
      if (this.isConnected) this._onOutcome(outcome, trigger, prov);
    }, (err) => {
      if (gen !== this._pickGen) return;
      this._picking = false;
      // review SEC-2: never the raw error object (it may carry adapter data); the name only
      console.warn(`td-media-field: the media picker failed (${err && typeof err.name === 'string' ? err.name : 'error'})`);
    });
  }

  /**
   * @private review R3 #1: the one way to drop the field's picker — bump the generation (its outcome is ignored), release
   * the double-open lock, close the host programmatically (no interactive picker of an old source / a removed field).
   */
  _cancelPicker() {
    this._pickGen += 1;
    this._picking = false;
    const host = this._pickerHost;
    this._pickerHost = null;
    try { if (host && host.isConnected && typeof host.close === 'function') host.close('programmatic'); } catch { /* ignore */ }
  }

  /** @private */
  _onOutcome(outcome, trigger, prov = null) {
    if (!outcome || outcome.status !== 'selected' || !Array.isArray(outcome.selection)) return;
    const sel = outcome.selection[0];
    if (!sel || typeof sel.assetId !== 'string' || !sel.assetId) return;
    const asset = normalizeAsset(sel.asset, { safeUrl: (u) => safeMediaUrl(u) });
    const preview = this._previewOf(asset);
    if (!asset) preview.kind = this._kind;
    const croppable = this._croppable();
    const focalOn = this._focalOn();
    // table 28b: the crop step's result (croppable only); the UI path → serializeCrop / serializeFocal
    const cropRaw = croppable ? serializeCrop(sel.usage?.crop?.normalized) : null;
    const focalRaw = croppable && focalOn ? serializeFocal(sel.usage?.focalPoint) : null;
    if (sel.assetId === this._value) {
      if (!croppable) {
        // v0.34: same asset → refresh what is shown, nothing changed for the form → no event
        this._applyLive({ id: this._value, ...preview, alt: this._alt, cropRaw: this._cropRaw, focalRaw: this._focalRaw, asset, assetProv: prov, previewProv: prov });
        return;
      }
      // croppable: refresh the asset / preview AND apply the crop step's crop + focal; numbers equal (± 1e-6) → the
      // original strings are kept byte-identical, no event
      const cropSame = sameNums(cropForCompare(this._cropRaw ? parseCrop(this._cropRaw)?.crop : null),
        cropForCompare(cropRaw ? parseCrop(cropRaw).crop : null), CROP_KEYS);
      const focalSame = !focalOn
        || sameNums(this._focalRaw ? parseFocal(this._focalRaw)?.focal : null, focalRaw ? parseFocal(focalRaw).focal : null, ['x', 'y']);
      this._applyLive({
        id: this._value, ...preview, alt: this._alt,
        cropRaw: cropSame ? this._cropRaw : cropRaw,
        focalRaw: focalSame ? this._focalRaw : focalRaw,
        asset,
        assetProv: prov,
        previewProv: prov,
      });
      if (cropSame && focalSame) return;
      this._emit('input');
      this._emit('change');
      return;
    }
    const altText = typeof sel.usage?.altText === 'string' ? sel.usage.altText : (asset?.defaultAltText ?? '');
    this._applyLive({ id: sel.assetId, ...preview, alt: cap(altText), cropRaw, focalRaw, asset, assetProv: prov, previewProv: prov });
    this._emit('input');
    this._emit('change');
    if (trigger && (!trigger.isConnected || trigger.closest('[hidden]')) && this.contains(this.ownerDocument.activeElement) === false) {
      this._part('open')?.focus({ preventScroll: true });
    }
  }

  /** @private "Gỡ": empty value, alt and crop; focus back to the open button */
  _remove() {
    if (this._effectiveDisabled || !this._value) return;
    this._applyLive({ id: '', src: '', previewAlt: '', kind: this._kinds()[0], alt: '', cropRaw: null, focalRaw: null, asset: null });
    this._emit('input');
    this._emit('change');
    this._part('open')?.focus();
  }

  /** @private abort the running "Cắt ảnh" flow (source get / dialog) and release the double-open lock */
  _abortCrop() {
    if (!this._cropCtrl) return;
    const ctrl = this._cropCtrl;
    this._cropCtrl = null;
    this._cropReq.abort();
    ctrl.abort();
    this._pickGen += 1;
    this._picking = false;
    this._part('crop')?.removeAttribute('aria-busy');
  }

  /** @private the crop source error (text only: the adapter's `userMessage` or the label) in the status region */
  _setCropStatus(text) {
    this._cropStatus = text;
    const status = this._part('status');
    if (status && status.textContent !== text) status.textContent = text;
  }

  /**
   * @private decision 28a: the un-cropped source of the crop dialog. Adapter → `this._asset` with `width/height`, else
   * `adapter.get(value)` (latest wins, aborted by a value / source change or disconnect; `aria-busy` on the button) →
   * `urls.preview` + `width/height` (never `preview-src`); a failed get → no dialog, the error as text. No adapter →
   * `preview-src`, no natural size (no `pixels`).
   * @param {HTMLElement} btn
   * @param {number} gen
   * @returns {Promise<{ src: string, naturalWidth?: number, naturalHeight?: number } | null>} null → no dialog
   */
  async _cropSource(btn, gen) {
    const adapter = this._resolveAdapter();
    // review R2 path 1: no adapter → ONLY an attribute / programmatic preview-src, never one an adapter produced
    if (!adapter) return this._previewSrc && !this._previewProv ? { src: this._previewSrc } : null;
    const id = this._value;
    let asset = this._asset;
    if (!(asset && asset.id === id && posInt(asset.width) && posInt(asset.height) && this._provMatches(this._assetProv))) {
      const context = this._resolveContext();
      const srcGen = this._srcGen || 0;
      btn.setAttribute('aria-busy', 'true');
      const r = await this._cropReq.run((signal) => adapter.get(id, { context, signal }));
      if (gen !== this._pickGen) return null; // aborted (value / source change, disconnect): the lock is already released
      this._part('crop')?.removeAttribute('aria-busy');
      if (r.stale || id !== this._value || srcGen !== (this._srcGen || 0) || adapter !== this._resolveAdapter()
        || !Object.is(context, this._resolveContext())) return null;
      if (r.error) {
        const err = normalizeError(r.error, null, { operation: 'td-media-field crop get' }); // operation + code only
        if (err) this._setCropStatus(err.userMessage || this._label('cropError'));
        return null;
      }
      asset = normalizeAsset(r.value, { safeUrl: (u) => safeMediaUrl(u) });
      if (!asset || asset.id !== id) {
        this._setCropStatus(this._label('cropError'));
        return null;
      }
      const p = this._previewOf(asset); // the fresh asset is the field's too (preview, name)
      Object.assign(this, { _previewSrc: p.src, _previewAlt: p.previewAlt, _kind: p.kind, _asset: asset,
        _assetProv: { adapter, context, gen: srcGen }, _previewProv: { adapter, context, gen: srcGen } });
      this._update();
      if (asset.kind !== 'image') return null;
    }
    const src = safeSrc(asset.urls?.preview);
    if (!src) {
      this._setCropStatus(this._label('cropError'));
      return null;
    }
    const nw = posInt(asset.width);
    const nh = posInt(asset.height);
    return nw && nh ? { src, naturalWidth: nw, naturalHeight: nh } : { src };
  }

  /**
   * @private decision 28: "Cắt ảnh" → the crop dialog from the current crop / focal (shares the picker's double-open
   * lock). "Áp dụng" + changed → state FIRST (serializeCrop / serializeFocal; whole image → null), then input + change,
   * focus back to the button; unchanged / "Huỷ" → nothing (the original strings kept byte-identical).
   * @param {HTMLElement} btn
   */
  async _openCrop(btn) {
    if (this._picking || this._effectiveDisabled || !this._croppable() || !this._cropBtnShown()) return;
    this._picking = true;
    const gen = ++this._pickGen;
    const ctrl = new AbortController();
    this._cropCtrl = ctrl;
    this._setCropStatus('');
    const release = () => {
      if (gen !== this._pickGen) return false;
      this._picking = false;
      this._cropCtrl = null;
      return true;
    };
    let source;
    try {
      source = await this._cropSource(btn, gen);
    } catch {
      source = null;
    }
    if (gen !== this._pickGen) return;
    if (!source) { release(); return; }
    const focalOn = this._focalOn();
    const ratio = this._cropRatio();
    const crop = this._cropRaw ? parseCrop(this._cropRaw)?.crop ?? null : null;
    const focal = focalOn && this._focalRaw ? parseFocal(this._focalRaw)?.focal ?? null : null;
    const opener = this._part('crop') || btn;
    let res;
    try {
      res = await openCropDialog({
        ...source,
        alt: this._alt || this._previewAlt,
        aspectRatio: ratio,
        crop: crop ? { ...crop } : null,
        focalPoint: focal ? { ...focal } : null,
        allowFocalPoint: focalOn,
        title: this._label('crop'), // the dialog appends " · {ratio}" itself when the ratio is locked
        nested: false,
        signal: ctrl.signal,
        opener,
      });
    } catch (err) {
      if (release()) console.warn(`td-media-field: the crop dialog failed (${err && typeof err.name === 'string' ? err.name : 'error'})`);
      return;
    }
    if (!release() || !this.isConnected) return;
    if (!res || res.status !== 'applied' || !res.changed) return;
    const cropRaw = res.crop ? serializeCrop(res.crop.normalized) : null;
    const focalRaw = focalOn ? (res.focalPoint ? serializeFocal(res.focalPoint) : null) : this._focalRaw;
    this._cropRaw = cropRaw;
    this._focalRaw = focalRaw;
    this._syncCropPreview();
    this._syncForm();
    this._emit('input');
    this._emit('change');
    this._part('crop')?.focus({ preventScroll: true });
  }

  /** @private */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  // --- SSR (ADR 0012, contract media-field@1) ---

  /**
   * Marker `media-field@1` + exactly render()'s tree (+ the no-JS hidden inputs / alt name agreeing with the state) →
   * adopt in place. Anything else → safe render now, keeping the alt being typed + the focused control.
   * @returns {boolean}
   */
  canHydrate() {
    this._initLive();
    const m = ssrMarker(this);
    if (!m || m.name !== 'media-field') return false;
    if (m.schema === 1 && this._ssrGate(true)) return true;
    const slots = this.querySelectorAll(':scope > div.td-media-field__usage > input.td-media-field__alt');
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = {
      alt: slots.length === 1 && this.hasAttribute('usage') && !this._earlyProps?.has('alt') ? cap(slots[0].value) : null,
      role: active && active !== this && this.contains(active) ? this._roleOf(active) : null,
    };
    this._ssrFreshRender = true;
    return false;
  }

  /** Re-connect: re-bind in place while the markup is still render()'s of the live state (else safe render + restore). */
  canRebind() {
    if (this._ssrGate(false)) return true;
    this._ssrRestore = { alt: null, role: this._focusRole };
    this._ssrFreshRender = true;
    return false;
  }

  hydrateExisting() {
    const alt = this._part('alt');
    if (alt) {
      if (!this._earlyProps?.has('alt')) this._alt = cap(alt.value); // live native state > attribute
      alt.value = this._alt; // dirty: removing the value attribute below changes nothing
    }
    this._errorNote = [...this.children].find(ssrIsErrorNote) || null;
    this._syncForm(); // ElementInternals FIRST…
    for (const h of this._ssrHidden()) h.remove(); // …then the no-JS parts: FormData has ONE set of entries
    if (alt) {
      alt.removeAttribute('name');
      alt.removeAttribute('value');
    }
  }

  /** @protected after a refused / tampered markup was replaced: the alt being typed + the focus */
  _restoreSsrState(s) {
    if (s.alt != null) {
      this._alt = s.alt;
      const alt = this._part('alt');
      if (alt) alt.value = s.alt;
      this._syncForm();
    }
    if (s.role) this._part(s.role)?.focus({ preventScroll: true });
  }

  /** @private the no-JS hidden inputs (direct children) */
  _ssrHidden() {
    return [...this.children].filter((n) => n.localName === 'input' && (n.getAttribute('type') || '').toLowerCase() === 'hidden');
  }

  /**
   * @private The strict gate shared by adoption (`first`) and re-bind: host children = render()'s (each part compared
   * attribute by attribute, text exactly; icon slots by their attributes), plus — first only — the no-JS hidden inputs
   * and the alt `name` / `value` matching the form shape of the state.
   * @param {boolean} first
   */
  _ssrGate(first) {
    const nodes = ssrContentNodes(this);
    if (nodes.some((n) => n.nodeType !== 1)) return false;
    const hidden = first ? this._ssrHidden() : [];
    const rest = nodes.filter((n) => !hidden.includes(n));
    const entries = this._entries();
    if (first && !this._ssrHiddenOk(hidden, entries)) return false;
    const tpl = document.createElement('template');
    // first: render() as PHP prints it ("Cắt ảnh" shown from preview-src only — the adapter is applied after adoption)
    this._ssrRender = first;
    try {
      tpl.innerHTML = this.render();
    } finally {
      this._ssrRender = false;
    }
    const want = [...tpl.content.children];
    if (rest.length !== want.length) return false;
    return want.every((w, i) => {
      const live = rest[i];
      if (live.localName !== w.localName || live.namespaceURI !== w.namespaceURI) return false;
      if (w.classList.contains('td-media-field__usage')) return this._ssrUsageOk(live, w, first, entries);
      return ssrSamePart(live, w);
    });
  }

  /**
   * @private reference: one value input; usage: value (`name[id]`) + crop (`name[crop]`) + v0.35 focal (`name[focal]`,
   * with `focal-point`); none when not submitted
   */
  _ssrHiddenOk(hidden, entries) {
    const expect = (entries || []).filter(([k]) => !(this.hasAttribute('usage') && k.endsWith('[alt]')));
    if (hidden.length !== expect.length) return false;
    return hidden.every((h, i) => ssrClassKey(h) === HIDDEN_CLASSES[i]
      && [...h.attributes].every((a) => HIDDEN_ATTRS.includes(a.name))
      && h.getAttribute('name') === expect[i][0] && (h.getAttribute('value') ?? '') === expect[i][1]
      && h.hasAttribute('disabled') === this.hasAttribute('disabled'));
  }

  /** @private the alt block: label exact, the input = render()'s attributes (+ first: the no-JS name / value) */
  _ssrUsageOk(live, want, first, entries) {
    if (!ssrSameAttrs(live, want)) return false;
    const have = ssrContentNodes(live);
    const need = [...want.children];
    if (have.length !== 2 || have.some((n) => n.nodeType !== 1) || !ssrSamePart(have[0], need[0])) return false;
    const input = have[1];
    const w = need[1];
    if (input.localName !== 'input') return false;
    for (const a of input.attributes) {
      if (w.hasAttribute(a.name)) {
        if (a.name === 'class' ? ssrClassKey(input) !== ssrClassKey(w) : a.value !== w.getAttribute(a.name)) return false;
      } else if (!(first && (a.name === 'name' || a.name === 'value'))) {
        return false;
      }
    }
    if ([...w.attributes].some((a) => !input.hasAttribute(a.name))) return false;
    if (!first) return true;
    const altName = entries ? entries.find(([k]) => k.endsWith('[alt]'))?.[0] : undefined;
    return altName ? input.getAttribute('name') === altName : !input.hasAttribute('name');
  }
}

if (!customElements.get('td-media-field')) {
  customElements.define('td-media-field', TdMediaField);
}
