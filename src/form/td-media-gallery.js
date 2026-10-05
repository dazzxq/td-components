import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrIsErrorNote, SSR_CONTROL_ATTRS, SSR_ARIA_DATA,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { TdMediaPicker, onDefaultsChange } from '../feedback/td-media-picker.js';
import { openCropDialog } from '../feedback/crop-dialog.js';
import { isAdapter, normalizeAsset, normalizeError } from '../utils/media-picker-core.js';
import { safeMediaUrl } from '../utils/media-url.js';
import { SortableController, SORTABLE_LABELS } from '../utils/sortable-controller.js';
import { OrderedCollectionModel } from '../utils/ordered-collection.js';
import {
  parseAspectRatio, parseCrop, parseFocal, parseKinds, parseCropRatio, serializeCrop, serializeFocal,
  cropRatioInRange, cropPreviewVars, galleryEntries, validateItems, parseItems, encodeGalleryState, decodeGalleryState,
  GALLERY_MAX_ITEMS,
} from '../utils/media-field-model.js';

const ALT_MAX = 500;
const LIST = ':scope > ul.td-media-gallery__list';
/** v0.43.0 decision 13: the unitless CSSOM custom properties of a tile's crop preview (on its `<img>`). */
const CROP_VARS = ['--_td-mg-crop-x', '--_td-mg-crop-y', '--_td-mg-crop-w', '--_td-mg-crop-h'];
/** Attributes the no-JS hidden inputs of php/td.php td_media_gallery() may carry. */
const HIDDEN_ATTRS = ['type', 'class', 'name', 'value', 'disabled'];
/** Host attributes an adopted server gallery may carry (owned names + the PHP `attrs` allowlist + aria-* / data-*). */
const HOST_ATTRS = new Set(['data-td-ssr', 'name', 'label', 'items', 'usage', 'croppable', 'crop-ratio', 'focal-point', 'cover',
  'aspect-ratio', 'preview-fit', 'accept-kind', 'min', 'max', 'required', 'disabled', 'prompt', 'helper-text', 'error-text']);
const ROLES = {
  handle: 'td-media-gallery__handle', crop: 'td-media-gallery__crop-btn', remove: 'td-media-gallery__remove',
  alt: 'td-media-gallery__alt', add: 'td-media-gallery__add',
};
const posInt = (n) => (Number.isInteger(n) && n > 0 && n <= 100000 ? n : undefined);
const cap = (s) => [...String(s ?? '')].slice(0, ALT_MAX).join('');
/** The attribute string when it passes the URL gate (kept as given — PHP prints the same string), else ''. */
const safeSrc = (u) => (typeof u === 'string' && u && safeMediaUrl(u) ? u : '');
const okUrl = (u) => !!safeMediaUrl(u);
const fill = (t, params) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
const isHiddenInput = (n) => n.nodeType === 1 && n.localName === 'input' && (n.getAttribute('type') || '').toLowerCase() === 'hidden';
/** @type {WeakSet<HTMLImageElement>} preview images already waiting for `load` (crop preview) */
const LOAD_BOUND = new WeakSet();

/**
 * @typedef {{ id: string, src: string, previewAlt: string, kind: 'image'|'video'|'file', alt: string,
 *   cropRaw: string|null, focalRaw: string|null, asset: object|null, fromAdapter: boolean, assetGen?: number,
 *   explicit: { src: string, previewAlt: string, kind: string }|null, lazyFailed?: boolean, resolved?: boolean }} GalleryItem
 */

/**
 * <td-media-gallery> — an ORDERED LIST of media assets as one form value (v0.43.0, plan
 * docs/internal/plans/v0.43.0-media-gallery.md, ADR 0021). Token-native: needs td.css
 * (src/styles/components/media-gallery.css). Form-associated (TdFormElement), hydratable (contract media-gallery@1).
 *
 * - The value is the ordered list of opaque `assetId`s; `src` / `name` / `kind` of an item only DISPLAY it. The `items`
 *   attribute (JSON `[{"id","src"?,"name"?,"kind"?,"alt"?,"crop"?,"focal"?}]`) is the default / reset state; a later
 *   change sets the live state too.
 * - Add: the Add button opens `TdMediaPicker.open()` in MULTIPLE mode (`initialIds: []`, `maxItems` = the room left,
 *   `crop: { enabled: false }`, `title` = label, `themeRoot` = the gallery), one at a time; the picked assets are
 *   APPENDED in pick order (an id already there is skipped and announced). Gỡ per tile (focus → next tile's Gỡ →
 *   previous → Add). Reorder: the shared SortableController (drag on the handle, tap-to-move, keyboard). Alt / crop /
 *   focal per item (`usage`; crop / focal with `croppable` / `focal-point`, coordinates only).
 * - Form shape (decision 14): reference `name[]=<id>` per item; `usage` → `name[i][id]`, `name[i][alt]`, `name[i][crop]`
 *   (+ `name[i][focal]`); empty → ONE `name=`. Nothing at all when disabled, broken (fail closed, decision 15) or over
 *   `max` (decision 8) — a server then keeps what it has.
 * - Every way into the state goes through validateItems() (decision 15b): the attribute fails closed, a restore that does
 *   not validate is dropped, `value =` / `setSelection()` that do not validate are refused (state unchanged).
 * - SSR (ADR 0012): php/td.php td_media_gallery() prints exactly render()'s tree + the no-JS inputs — adopted IN PLACE;
 *   anything else → safe render keeping the alts being typed + the focus.
 *
 * DOM contract (JS render() = PHP; see php/td.php td_media_gallery() for the full tree):
 *   <td-media-gallery class="td-media-gallery" name label [items] [usage] [croppable] [crop-ratio] [focal-point] [cover]
 *     [aspect-ratio] [preview-fit] [accept-kind] [min] [max] [required] [disabled] [prompt] [helper-text] [error-text]>
 *     div.td-media-gallery__head > span.td-media-gallery__label#{id}-label + span.td-media-gallery__count#{id}-count
 *     ul.td-media-gallery__list[role=list] > li.td-media-gallery__item[data-kind] >
 *       div.td-media-gallery__media (svg sizer, img | span.__file, [badge], [cover], button.td-sortable__handle.__handle)
 *       div.td-media-gallery__bar ([button.__btn.__crop-btn], button.__btn.__remove)
 *       [label.td-media-gallery__alt-field > span.td-sr-only + input.td-field__control.td-media-gallery__alt]
 *     button.td-media-gallery__add[data-state=empty|filled] · span.__status[role=status] · span.__sort-status[role=status]
 *     span.__sort-help#{id}-sort-help[hidden] · [span.__help#{id}-help] · [span.td-field-error#{id}-error]
 *
 * @element td-media-gallery
 * @attr {string} name @attr {string} label @attr {string} items - JSON (default / reset)
 * @attr {boolean} usage @attr {boolean} croppable @attr {string} crop-ratio @attr {boolean} focal-point
 * @attr {boolean} cover - the first item is the cover (badge + name suffix)
 * @attr {string} aspect-ratio - the tile ratio (default 1:1) @attr {string} preview-fit - cover | contain
 * @attr {string} accept-kind @attr {number} min @attr {number} max - 1…100 (default 100)
 * @attr {boolean} required @attr {boolean} disabled @attr {string} prompt @attr {string} helper-text
 * @attr {string} error-text
 * @fires input - detail: { value, selection, reason: 'add'|'remove'|'reorder'|'alt'|'crop' }
 * @fires change - same detail (alt: on blur after an edit; reorder: once, on drop)
 */
export class TdMediaGallery extends TdFormElement {
  /** v0.43.0: adopts php/td.php td_media_gallery() markup in place (contract media-gallery@1). */
  static hydratable = true;

  /** Hard ceiling (decision 6, owner O2): also the default `max`. */
  static MAX_ITEMS = GALLERY_MAX_ITEMS;

  /** Previews fetched with `adapter.get()` at the same time (decision 18). */
  static LAZY_CONCURRENCY = 4;

  /** Texts (Vietnamese); override per site (an SSR page whose texts differ is safely re-rendered). = Td::MEDIA_GALLERY_LABELS */
  static labels = {
    prompt: { image: 'Chọn ảnh', video: 'Chọn video', file: 'Chọn file' },
    add: { image: 'Thêm ảnh', video: 'Thêm video', file: 'Thêm file' },
    kinds: { image: 'ảnh', video: 'video', file: 'file' },
    countMax: '{count}/{max} {kind}',
    full: 'Đã đủ {max} {kind}',
    over: 'Vượt giới hạn: {count}/{max} {kind}',
    item: 'Ảnh {n} trên {count}: {name}',
    coverSuffix: ', ảnh bìa',
    cover: 'Ảnh bìa',
    handle: 'Sắp xếp {name}',
    remove: 'Gỡ {name}',
    crop: 'Cắt {name}',
    alt: 'Mô tả ảnh {n} (alt)',
    altPlaceholder: 'Mô tả (alt)',
    noPreview: 'Không có ảnh xem trước',
    video: 'Video',
    broken: 'Không đọc được danh sách ảnh',
    sortHelp: SORTABLE_LABELS.help,
    // JS only (live region, validity, dialog)
    added: 'Đã thêm {n} {kind}.',
    skipped: 'Bỏ qua {n} {kind} đã có.',
    tooMany: 'Bỏ qua {n} {kind} vượt quá giới hạn.',
    removed: 'Đã gỡ {name}. Còn {count} {kind}.',
    required: 'Vui lòng chọn {kind}.',
    min: 'Cần ít nhất {min} {kind}.',
    max: 'Tối đa {max} {kind}.',
    cropTitle: 'Cắt ảnh',
    cropError: 'Không tải được ảnh để cắt.',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'items', 'usage', 'croppable', 'crop-ratio', 'focal-point', 'cover',
      'aspect-ratio', 'preview-fit', 'accept-kind', 'min', 'max', 'prompt', 'helper-text', 'error-text'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'usage', 'croppable', 'focal-point', 'cover']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @type {GalleryItem[]} the live list, in order */
    this._items = [];
    /** @type {WeakMap<HTMLElement, GalleryItem>} */
    this._itemOf = new WeakMap();
    /** @type {WeakMap<GalleryItem, HTMLElement>} */
    this._liOf = new WeakMap();
    /** items attribute failed validation (decision 15) */
    this._broken = false;
    this._liveReady = false;
    /** the double-open lock shared by the picker and the crop flow */
    this._busy = false;
    this._pickGen = 0;
    this._pickerHost = null;
    /** @type {{ ctrl: AbortController, itemEl: HTMLElement, id: string, gen: number }|null} decision 12b */
    this._crop = null;
    /** source generation: adapter / pickerOptions / defaults change → +1 (decisions 12b, 18) */
    this._srcGen = 0;
    /** @type {Map<GalleryItem, AbortController>} running lazy gets */
    this._gets = new Map();
    this._adapterProp = null;
    this._pickerOptions = null;
    /** @type {{ role: string, id: string|null }|null} the focused control (kept across a move) */
    this._focusMark = null;
    this._warned = new Set();
    this._ctl = null;
    this._mo = null;
  }

  connectedCallback() {
    const reconnect = this._initialized;
    if (!this._initialized) {
      // properties assigned before define live in own data properties that shadow the accessors below
      for (const p of ['adapter', 'pickerOptions', 'value']) {
        if (Object.prototype.hasOwnProperty.call(this, p)) {
          const v = this[p];
          delete this[p];
          this[p] = v;
        }
      }
      if (!this.classList.contains('td-media-gallery')) this.classList.add('td-media-gallery');
    }
    super.connectedCallback();
    if (reconnect) this._refocusAfterMove();
    if (this._unsubDefaults) this._unsubDefaults();
    this._unsubDefaults = onDefaultsChange(() => this._sourceChanged());
    this._startSort();
    this._lazyPump();
  }

  disconnectedCallback() {
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
    super.disconnectedCallback();
    this._abortCrop();
    this._cancelPicker(); // a picker result arriving after the gallery left is dropped AND the picker closes
    this._abortGets();
    for (const it of this._items) this._clearCropPreview(this._liOf.get(it)); // re-bind compares the markup
  }

  // --- Public API ---

  /** @returns {string[]} the ids in order (a copy) */
  get value() {
    this._initLive();
    return this._items.map((it) => it.id);
  }

  /**
   * Replace the list by ids (silent). Kept ids keep their alt / crop / focal / preview; new ids start empty (preview by a
   * lazy `adapter.get`). Must be an array of unique non-empty strings within `max` (decision 15b) — else refused, the
   * gallery unchanged, one console warning (no value printed). null → [].
   * @param {string[]|null} v
   */
  set value(v) {
    this._initLive();
    const list = v == null ? [] : v;
    if (!Array.isArray(list)) { this._refuse('value', 'type'); return; }
    const old = new Map(this._items.map((it) => [it.id, it]));
    const raw = list.map((id) => {
      const o = typeof id === 'string' ? old.get(id) : undefined;
      return o ? this._rawOf(o) : { id, kind: this._kinds()[0] };
    });
    const r = validateItems(raw, { max: this._max(), safeUrl: okUrl });
    if (!r.ok) { this._refuse('value', r.reason); return; }
    this._commit(r.items.map((n) => {
      const o = old.get(n.id);
      return o ? { ...o } : this._newItem(n);
    }));
  }

  /** @returns {object|null} the gallery's own adapter (lower priority than `pickerOptions.adapter`) */
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
   *   focalPoint: { x: number, y: number }|null } }>} in order (the field's SelectedMedia shape)
   */
  get selection() {
    this._initLive();
    const focalOn = this._focalOn();
    return this._items.map((it) => {
      const c = it.cropRaw ? parseCrop(it.cropRaw) : null;
      const f = focalOn && it.focalRaw ? parseFocal(it.focalRaw) : null;
      return {
        assetId: it.id,
        asset: it.asset,
        usage: { altText: it.alt, crop: c ? { normalized: { ...c.crop } } : null, focalPoint: f ? { ...f.focal } : null },
      };
    });
  }

  /**
   * Set the whole list from code (silent): SelectedMedia[] (the picker / field shape), null / [] → empty. Refused (state
   * unchanged, one warning) when it does not validate (decision 15b).
   * @param {object[]|null} sel
   */
  setSelection(sel) {
    this._initLive();
    const list = sel == null ? [] : sel;
    if (!Array.isArray(list)) { this._refuse('setSelection', 'type'); return; }
    const assets = [];
    const raw = list.map((s, i) => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
      const asset = normalizeAsset(s.asset, { safeUrl: (u) => safeMediaUrl(u) });
      assets[i] = asset;
      const n = s.usage?.crop?.normalized;
      // the field's v0.34 path (decision 29): the raw numbers, never re-rounded
      const crop = n && typeof n === 'object'
        ? parseCrop(JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height }))?.raw ?? null : null;
      const fp = s.usage?.focalPoint;
      const focal = fp && typeof fp === 'object' ? parseFocal(JSON.stringify({ v: 1, x: fp.x, y: fp.y }))?.raw ?? null : null;
      const alt = typeof s.usage?.altText === 'string' ? s.usage.altText : (asset?.defaultAltText ?? '');
      return {
        id: s.assetId, src: asset ? safeSrc(asset.urls?.preview) : '', name: asset?.name || '', kind: asset?.kind ?? this._kinds()[0],
        alt, crop, focal,
      };
    });
    const r = validateItems(raw, { max: this._max(), safeUrl: okUrl });
    if (!r.ok) { this._refuse('setSelection', r.reason); return; }
    this._commit(r.items.map((n, i) => ({ ...this._newItem(n), asset: assets[i] ?? null, resolved: !!assets[i] })));
  }

  // --- Configuration ---

  /** @private accepted kinds (accept-kind) */
  _kinds() { return parseKinds(this.getAttribute('accept-kind') ?? ''); }

  /** @private `max`: an integer 1…100 (clamped), absent / invalid → 100 */
  _max() { return this._maxAttr() ?? TdMediaGallery.MAX_ITEMS; }

  /** @private the valid `max` attribute (clamped to 100), or null */
  _maxAttr() {
    const raw = (this.getAttribute('max') ?? '').trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 ? Math.min(n, TdMediaGallery.MAX_ITEMS) : null;
  }

  /** @private `min` (clamped to max); `required` ≡ min ≥ 1 */
  _min() {
    const raw = (this.getAttribute('min') ?? '').trim();
    let n = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (this.hasAttribute('required')) n = Math.max(n, 1);
    return Math.min(n, this._max());
  }

  /** @private the tile ratio (aspect-ratio, invalid → warned once; default 1:1) */
  _ratio() {
    const raw = this.getAttribute('aspect-ratio');
    if (raw == null || raw.trim() === '') return null;
    const r = parseAspectRatio(raw);
    if (!r) this._warnOnce(`ratio:${raw}`, 'td-media-gallery: aspect-ratio is not W/H, W:H or a positive number — ignored.');
    return r;
  }

  /** @private croppable / crop-ratio / focal-point need usage (warned once, ignored) */
  _usageOn() {
    const usage = this.hasAttribute('usage');
    if (!usage && ['croppable', 'crop-ratio', 'focal-point'].some((a) => this.hasAttribute(a))) {
      this._warnOnce('usage', 'td-media-gallery: croppable / crop-ratio / focal-point need the usage attribute — ignored.');
    }
    return usage;
  }

  /** @private */
  _croppable() { return this.hasAttribute('croppable') && this._usageOn(); }

  /** @private */
  _focalOn() { return this.hasAttribute('focal-point') && this._usageOn(); }

  /** @private decision 12: crop-ratio (`free` → null) → else the tile's aspect-ratio → else free */
  _cropRatio() {
    const raw = this.getAttribute('crop-ratio');
    if (raw != null && raw.trim() !== '') {
      const r = parseCropRatio(raw);
      if (r === 'free') return null;
      if (typeof r === 'number') return r;
      this._warnOnce('crop-ratio', 'td-media-gallery: crop-ratio must be free or W/H, W:H, a number with a ratio in [0.01, 100] — ignored.');
    }
    const f = this._ratio();
    return f && cropRatioInRange(f.w / f.h) ? f.w / f.h : null;
  }

  /** @private name ending in [] → fail closed (decision 15; the gallery appends [] / [i] itself) */
  _nameBroken() {
    const name = this.getAttribute('name');
    if (!name || !name.endsWith('[]')) return false;
    this._warnOnce('name[]', 'td-media-gallery: a name ending in [] would mis-group the entries (the gallery appends [] / [i]) — fail closed, nothing submitted.');
    return true;
  }

  /** @private decision 15: nothing usable, nothing submitted */
  _isBroken() { return this._broken || this._nameBroken(); }

  /** @private decision 8 */
  _isOverflow() { return !this._isBroken() && this._items.length > this._max(); }

  // --- State ---

  /** @private a fresh live item from a validateItems() item */
  _newItem(n) {
    return {
      id: n.id, src: n.src, previewAlt: n.previewAlt, kind: n.kind, alt: n.alt, cropRaw: n.cropRaw, focalRaw: n.focalRaw,
      asset: null, fromAdapter: false, explicit: { src: n.src, previewAlt: n.previewAlt, kind: n.kind },
    };
  }

  /** @private a live item back to the validateItems() input shape */
  _rawOf(it) {
    return { id: it.id, src: it.src, name: it.previewAlt, kind: it.kind, alt: it.alt, crop: it.cropRaw, focal: it.focalRaw };
  }

  /** @private API refusal (decision 15b): one warning per reason, never a value */
  _refuse(api, reason) {
    this._warnOnce(`api:${api}:${reason}`, `td-media-gallery: ${api} refused (${reason}) — the gallery is unchanged.`);
  }

  /** @private the `items` attribute → { items, broken } (decision 15: a structural error fails closed) */
  _fromAttr() {
    const r = parseItems(this.getAttribute('items'), { max: this._max(), safeUrl: okUrl });
    if (!r.ok && r.reason !== 'max') {
      this._warnOnce(`items:${r.reason}`, `td-media-gallery: the items attribute was rejected (${r.reason}) — fail closed, nothing submitted.`);
      return { items: [], broken: true };
    }
    return { items: r.items.map((n) => this._newItem(n)), broken: false };
  }

  /** @private the live state on first use: the attribute */
  _initLive() {
    if (this._liveReady) return;
    this._liveReady = true;
    const s = this._fromAttr();
    this._items = s.items;
    this._broken = s.broken;
  }

  /** @private the attribute again (reset, attribute change) */
  _applyAttr() {
    const s = this._fromAttr();
    this._commit(s.items, { broken: s.broken });
  }

  /**
   * @private set the whole list (silent): kept ids keep their tile (`li` identity, focus, a running crop flow),
   * everything else is rebuilt; aborts what no longer applies (decision 12b); repaints, syncs the form.
   * @param {GalleryItem[]} next
   * @param {{ broken?: boolean }} [o]
   */
  _commit(next, { broken = false } = {}) {
    this._liveReady = true;
    const wasBroken = this._isBroken();
    this._broken = broken;
    // ISSUE-1: only broken ITEMS empty the list; a bad `name` blocks rendering / submitting but keeps the valid state
    const items = broken ? [] : next;
    const prev = this._items;
    this._items = items;
    for (const it of prev) if (!items.includes(it)) this._abortGet(it);
    const ul = this._ul();
    if (!this._initialized || !ul || wasBroken !== this._isBroken()) {
      if (this._initialized) this._doRender();
      this._checkCrop();
      return;
    }
    const focus = this._focusInfo();
    // keyed by id: the same id with the same preview keeps its tile (the new object takes it over)
    const oldById = new Map(prev.map((it) => [it.id, it]));
    const lis = items.map((it) => {
      const o = oldById.get(it.id);
      const li = o && this._liOf.get(o);
      if (li && li.parentNode === ul && o.src === it.src && o.previewAlt === it.previewAlt && o.kind === it.kind) {
        this._itemOf.set(li, it);
        this._liOf.set(it, li);
        const alt = this._part('alt', li);
        if (alt && alt.value !== it.alt) alt.value = it.alt;
        return li;
      }
      return this._createLi(it);
    });
    this._own(() => ul.replaceChildren(...lis));
    this._checkCrop();
    this._afterListChange();
    if (focus && !this.contains(this.ownerDocument.activeElement)) this._restoreFocus(focus);
    this._lazyPump();
  }

  /** @private a new tile for `it` (not yet in the DOM): markup of render(), icons, listeners */
  _createLi(it) {
    const tpl = document.createElement('template');
    tpl.innerHTML = this._itemHtml(it, this._items.indexOf(it), this._items.length);
    const li = /** @type {HTMLElement} */ (tpl.content.firstElementChild);
    fillIconSlots(li);
    this._itemOf.set(li, it);
    this._liOf.set(it, li);
    this._bindLi(li);
    return li;
  }

  /** @private everything that depends on the list: names, cover, count, Add, crop buttons / previews, form */
  _afterListChange() {
    this._relabel();
    this._syncForm();
  }

  /** @private DOM changes of the gallery itself never count as outside changes of the list */
  _own(fn) {
    try { fn(); } finally { this._mo?.takeRecords(); }
  }

  // --- Source (adapter / context) ---

  /** @private pickerOptions.adapter > gallery.adapter > TdMediaPicker defaults */
  _resolveAdapter() {
    if (isAdapter(this._pickerOptions?.adapter)) return this._pickerOptions.adapter;
    if (isAdapter(this._adapterProp)) return this._adapterProp;
    const d = TdMediaPicker.defaults?.adapter;
    return isAdapter(d) ? d : null;
  }

  /** @private */
  _resolveContext() {
    return this._pickerOptions?.context ?? TdMediaPicker.defaults?.context;
  }

  /**
   * @private The adapter / context changed: new source generation FIRST (every pending get / crop source / picker of the
   * old source is dropped), adapter-made previews go (the explicit ones come back), then fetch again.
   */
  _sourceChanged() {
    this._srcGen += 1;
    this._abortGets();
    this._abortCrop();
    if (this._busy) this._cancelPicker();
    let repaint = false;
    for (const it of this._items) {
      it.lazyFailed = false;
      it.resolved = false;
      if (!it.fromAdapter) continue;
      const ex = it.explicit;
      Object.assign(it, {
        src: ex ? ex.src : '', previewAlt: ex ? ex.previewAlt : '', kind: ex ? ex.kind : it.kind, asset: null, fromAdapter: false,
      });
      repaint = true;
      if (this._initialized) this._paintPreview(it);
    }
    if (!this._initialized) return;
    if (repaint) this._relabel();
    else this._syncCropBtns();
    this._lazyPump();
  }

  // --- Lazy get (decision 18) ---

  /**
   * @private an id without a preview URL, not fetched under this source yet (ISSUE-4: a display name alone is not a
   * preview — a name-only item is fetched once; resolved without a URL / failed → never again until the source changes)
   */
  _needsPreview(it) {
    return !it.src && !it.resolved && !it.lazyFailed;
  }

  /** @private start gets for items without a preview, at most LAZY_CONCURRENCY at once */
  _lazyPump() {
    if (!this._initialized || !this.isConnected) return;
    const adapter = this._resolveAdapter();
    if (!adapter) return;
    for (const it of this._items) {
      if (this._gets.size >= TdMediaGallery.LAZY_CONCURRENCY) break;
      if (!this._gets.has(it) && this._needsPreview(it)) this._lazyGet(it, adapter);
    }
  }

  /** @private one get: applied only while the source generation, adapter, context, item and id all still match */
  _lazyGet(it, adapter) {
    const ctrl = new AbortController();
    this._gets.set(it, ctrl);
    const id = it.id;
    const gen = this._srcGen;
    const context = this._resolveContext();
    let p;
    try { p = Promise.resolve(adapter.get(id, { context, signal: ctrl.signal })); } catch (err) { p = Promise.reject(err); }
    p.then((v) => ({ v }), (e) => ({ e })).then((r) => {
      if (this._gets.get(it) === ctrl) this._gets.delete(it);
      const live = !ctrl.signal.aborted && gen === this._srcGen && adapter === this._resolveAdapter()
        && Object.is(context, this._resolveContext()) && this._items.includes(it) && it.id === id;
      if (!live) { this._lazyPump(); return; }
      if ('e' in r) {
        // operation + code only in the console (never the raw error); ISSUE-6: the safe text is announced
        const err = normalizeError(r.e, null, { operation: 'td-media-gallery get' });
        it.lazyFailed = true;
        this._announce(err?.userMessage || this._label('noPreview'));
      } else {
        const asset = normalizeAsset(r.v, { safeUrl: (u) => safeMediaUrl(u) });
        if (!asset || asset.id !== id) {
          it.lazyFailed = true;
          this._announce(this._label('noPreview'));
        } else {
          Object.assign(it, {
            src: safeSrc(asset.urls?.preview), previewAlt: asset.name || '', kind: asset.kind, asset, fromAdapter: true, assetGen: gen,
            resolved: true,
          });
          this._paintPreview(it);
          this._relabel();
        }
      }
      this._lazyPump();
    });
  }

  /** @private */
  _abortGet(it) {
    const c = this._gets.get(it);
    if (!c) return;
    this._gets.delete(it);
    c.abort();
  }

  /** @private */
  _abortGets() {
    for (const c of this._gets.values()) c.abort();
    this._gets.clear();
  }

  // --- Render ---

  /** @private */
  _label(key, params = {}) {
    let v = TdMediaGallery.labels;
    for (const part of key.split('.')) v = v && typeof v === 'object' ? v[part] : undefined;
    return typeof v === 'string' ? fill(v, params) : '';
  }

  /** @private the kind word of the count / messages */
  _kindWord() {
    const k = this._kinds()[0];
    return this._label(`kinds.${k}`) || k;
  }

  /** @private the display name: preview name → alt → id */
  _baseName(it) {
    return it.previewAlt || it.alt || it.id;
  }

  /** @private "Ảnh {n} trên {count}: {name}[, ảnh bìa]" */
  _fullName(it, i, count) {
    return this._label('item', { n: i + 1, count, name: this._baseName(it) })
      + (this.hasAttribute('cover') && i === 0 ? this._label('coverSuffix') : '');
  }

  /** @private the visible count line */
  _countText() {
    const count = this._items.length;
    const max = this._max(); // ISSUE-7: the effective max (100 when the attribute is absent)
    const kind = this._kindWord();
    if (count > max) return this._label('over', { count, max, kind });
    return this._label(count === max ? 'full' : 'countMax', { count, max, kind });
  }

  /** @private decision 12: "Cắt" usable = an image + an un-cropped source (an adapter, or an explicit src) */
  _cropBtnShown(it) {
    if (it.kind !== 'image') return false;
    const adapter = !!this._resolveAdapter();
    return (!!it.src && (adapter || !it.fromAdapter)) || (!this._ssrRender && adapter);
  }

  /** @private the preview part of a tile (img | file name, video badge) */
  _previewHtml(it) {
    const e = (s) => this.escapeHtml(String(s ?? ''));
    const img = !!it.src && it.kind !== 'file';
    return (img
      ? `<img class="td-media-gallery__img" src="${e(it.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : `<span class="td-media-gallery__file"><span class="td-media-gallery__icon" data-td-icon="${it.kind}" aria-hidden="true"></span>`
        + `<span class="td-media-gallery__name">${e(it.previewAlt || this._label('noPreview'))}</span></span>`)
      + (img && it.kind === 'video' ? `<span class="td-media-gallery__badge">${e(this._label('video'))}</span>` : '');
  }

  /** @private one tile (= php/td.php td_media_gallery() without the no-JS inputs) */
  _itemHtml(it, i, count) {
    const e = (s) => this.escapeHtml(String(s ?? ''));
    const id = this.id;
    const dis = this._effectiveDisabled ? ' disabled' : '';
    const r = this._ratio();
    const full = this._fullName(it, i, count);
    const icon = (n) => `<span class="td-media-gallery__icon" data-td-icon="${n}" aria-hidden="true"></span>`;
    return `<li class="td-media-gallery__item" data-kind="${it.kind}"><div class="td-media-gallery__media">`
      + `<svg class="td-media-gallery__sizer" viewBox="0 0 ${r ? `${r.w} ${r.h}` : '1 1'}" aria-hidden="true" focusable="false"></svg>`
      + this._previewHtml(it)
      + (this.hasAttribute('cover') && i === 0 ? `<span class="td-media-gallery__cover">${e(this._label('cover'))}</span>` : '')
      + `<button type="button" class="td-sortable__handle td-media-gallery__handle" aria-label="${e(this._label('handle', { name: full }))}"`
      + ` aria-describedby="${e(id)}-sort-help"${dis}>${icon('grip')}</button></div>`
      + '<div class="td-media-gallery__bar">'
      + (this._croppable()
        ? `<button type="button" class="td-media-gallery__btn td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="${e(this._label('crop', { name: full }))}"`
          + `${this._cropBtnShown(it) ? '' : ' hidden'}${dis}>${icon('crop')}</button>`
        : '')
      + `<button type="button" class="td-media-gallery__btn td-media-gallery__remove" aria-label="${e(this._label('remove', { name: full }))}"${dis}>${icon('trash')}</button></div>`
      + (this.hasAttribute('usage')
        ? `<label class="td-media-gallery__alt-field"><span class="td-sr-only">${e(this._label('alt', { n: i + 1 }))}</span>`
          + `<input type="text" class="td-field__control td-media-gallery__alt" maxlength="${ALT_MAX}" placeholder="${e(this._label('altPlaceholder'))}"${dis}></label>`
        : '')
      + '</li>';
  }

  /** @private the Add button's content */
  _addInner() {
    const e = (s) => this.escapeHtml(String(s ?? ''));
    const kind = this._kinds()[0];
    if (this._items.length) {
      return '<span class="td-media-gallery__icon" data-td-icon="plus" aria-hidden="true"></span>'
        + `<span class="td-media-gallery__prompt">${e(this._label(`add.${kind}`))}</span>`;
    }
    const r = this._ratio();
    return `<span class="td-media-gallery__icon" data-td-icon="${kind}" aria-hidden="true"></span>`
      + `<span class="td-media-gallery__prompt">${e(this.getAttribute('prompt') || this._label(`prompt.${kind}`))}</span>`
      + (r ? `<span class="td-media-gallery__ratio">${e(r.text)}</span>` : '');
  }

  render() {
    this._initLive();
    const e = (s) => this.escapeHtml(String(s ?? ''));
    const id = this.id;
    const dis = this._effectiveDisabled ? ' disabled' : '';
    const label = this.getAttribute('label') || '';
    const help = this.getAttribute('helper-text') || '';
    const err = this.errorMessage;
    const described = [help ? `${id}-help` : '', err ? `${id}-error` : ''].filter(Boolean).join(' ');
    this._usageOn(); // warns once when croppable / crop-ratio / focal-point lack usage
    const head = `<div class="td-media-gallery__head"><span class="td-media-gallery__label" id="${e(id)}-label">${e(label)}`
      + (this.hasAttribute('required') ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') + '</span>';
    const notes = (help ? `<span class="td-media-gallery__help" id="${e(id)}-help">${e(help)}</span>` : '')
      + (err ? `<span class="td-field-error" id="${e(id)}-error" data-for="${e(id)}">${e(err)}</span>` : '');
    if (this._isBroken()) {
      return `${head}</div><span class="td-media-gallery__broken">${e(this._label('broken'))}</span>${notes}`;
    }
    const count = this._items.length;
    return `${head}<span class="td-media-gallery__count" id="${e(id)}-count"${count > this._max() ? ' data-state="over"' : ''}>${e(this._countText())}</span></div>`
      + `<ul class="td-media-gallery__list" role="list" aria-labelledby="${e(id)}-label" aria-describedby="${e(id)}-count">`
      + this._items.map((it, i) => this._itemHtml(it, i, count)).join('') + '</ul>'
      + `<button type="button" class="td-media-gallery__add" data-state="${count ? 'filled' : 'empty'}" aria-haspopup="dialog"`
      + (described ? ` aria-describedby="${e(described)}"` : '')
      + (err ? ` aria-invalid="true" aria-errormessage="${e(id)}-error"` : '')
      + `${count >= this._max() ? ' hidden' : ''}${dis}>${this._addInner()}</button>`
      + '<span class="td-sr-only td-media-gallery__status" role="status"></span>'
      + '<span class="td-sr-only td-media-gallery__sort-status" role="status"></span>'
      + `<span class="td-media-gallery__sort-help" id="${e(id)}-sort-help" hidden>${e(this._label('sortHelp'))}</span>`
      + notes;
  }

  /** @private keep the focused control focused across a full re-render; a disabled / broken gallery stops its flows */
  _doRender() {
    if (this._suppressRender) return;
    this._initLive();
    const focus = this._initialized ? this._focusInfo() : null;
    // ISSUE-2: a full render replaces every tile — the crop flow's captured tile goes, so the flow is aborted first
    // (dialog closed through its signal, lock released); a picker survives (its result is appended to the new list)
    this._abortCrop();
    if ((this._effectiveDisabled || this._isBroken()) && this._busy) this._cancelPicker();
    this._stopSort();
    super._doRender();
    if (focus && !this.contains(this.ownerDocument.activeElement)) this._restoreFocus(focus);
  }

  afterRender() {
    fillIconSlots(this);
    const add = this._part('add');
    this._describedByTarget = add;
    this._foreignDescribedBy = [];
    this._ownDescribedBy = new Set([`${this.id}-help`, `${this.id}-error`]);
    this._errorNote = [...this.children].find(ssrIsErrorNote) || null;
    if (add) this.listen(add, 'click', () => this._openPicker());
    const ul = this._ul();
    if (ul) {
      [...ul.children].forEach((li, i) => {
        const it = this._items[i];
        if (!it) return;
        this._itemOf.set(/** @type {HTMLElement} */ (li), it);
        this._liOf.set(it, /** @type {HTMLElement} */ (li));
        this._bindLi(/** @type {HTMLElement} */ (li));
      });
    }
    if (!this._hostBound) { // host listeners: once per connection (afterRender also runs after each re-render)
      this._hostBound = true;
      this.listen(this, 'focusin', (ev) => { this._focusMark = this._focusInfo(/** @type {Element} */ (ev.target)); });
      this.listen(this, 'focusout', (ev) => {
        if (this.contains(/** @type {Node} */ (ev.relatedTarget))) return;
        queueMicrotask(() => {
          if (this.isConnected && !this.contains(this.ownerDocument.activeElement)) this._focusMark = null;
        });
      });
      this._cleanups.push(() => { this._hostBound = false; });
    }
    this._startSort();
    this._relabel();
    this._syncForm();
    this._applyErrorState();
    this._lazyPump();
  }

  /** @private listeners of one tile (Gỡ, Cắt, alt) */
  _bindLi(li) {
    const remove = this._part('remove', li);
    if (remove) this.listen(remove, 'click', () => this._remove(li));
    const crop = this._part('crop', li);
    if (crop) this.listen(crop, 'click', () => this._openCrop(li));
    const alt = this._part('alt', li);
    if (alt) {
      const it = this._itemOf.get(li);
      if (it && alt.value !== it.alt) alt.value = it.alt;
      this.listen(alt, 'input', (ev) => {
        ev.stopPropagation(); // the host fires its own event (no duplicate native one)
        const cur = this._itemOf.get(li);
        if (!cur || !this._items.includes(cur)) return;
        cur.alt = cap(alt.value);
        this._relabel();
        this._syncForm();
        this._emit('input', 'alt');
      });
      this.listen(alt, 'change', (ev) => {
        ev.stopPropagation();
        if (this._items.includes(this._itemOf.get(li))) this._emit('change', 'alt');
      });
    }
  }

  /** @protected helper note in the Add button's description */
  _describedByIds() {
    return this.getAttribute('helper-text') ? [`${this.id}-help`] : [];
  }

  /** @protected the error contract lives on the Add button (render() writes it, PHP too) */
  _focusTarget() { return this._part('add'); }

  /** @protected the validity bubble: the Add button, or the first handle while it is hidden */
  _validationAnchor() {
    const add = this._part('add');
    if (add && !add.hidden) return add;
    return this._ul()?.querySelector('.td-media-gallery__handle') || add || undefined;
  }

  /** Focus the Add button (or the first handle while Add is hidden). */
  focus(options) {
    const t = this._validationAnchor();
    if (t && typeof t.focus === 'function') t.focus(options);
    else super.focus(options);
  }

  /** @private */
  _ul() { return /** @type {HTMLElement|null} */ (this.querySelector(LIST)); }

  /** @private a part of the host (`li` null) or of one tile */
  _part(role, li = null) {
    if (li) {
      const sel = {
        handle: ':scope > .td-media-gallery__media > button.td-media-gallery__handle',
        media: ':scope > div.td-media-gallery__media',
        img: ':scope > .td-media-gallery__media > img.td-media-gallery__img',
        crop: ':scope > .td-media-gallery__bar > button.td-media-gallery__crop-btn',
        remove: ':scope > .td-media-gallery__bar > button.td-media-gallery__remove',
        alt: ':scope > .td-media-gallery__alt-field > input.td-media-gallery__alt',
        altLabel: ':scope > .td-media-gallery__alt-field > span.td-sr-only',
        cover: ':scope > .td-media-gallery__media > span.td-media-gallery__cover',
      }[role];
      return sel ? /** @type {HTMLElement|null} */ (li.querySelector(sel)) : null;
    }
    const sel = {
      add: ':scope > button.td-media-gallery__add',
      count: ':scope > .td-media-gallery__head > span.td-media-gallery__count',
      status: ':scope > span.td-media-gallery__status',
      sortStatus: ':scope > span.td-media-gallery__sort-status',
    }[role];
    return sel ? /** @type {HTMLElement|null} */ (this.querySelector(sel)) : null;
  }

  /** @private `{ role, id }` of a control (item id null for Add); the focused one by default */
  _focusInfo(el = this.ownerDocument?.activeElement) {
    if (!el || el === this || !this.contains(el) || !el.classList) return null;
    const role = Object.keys(ROLES).find((r) => el.classList.contains(ROLES[r]));
    if (!role) return null;
    const li = el.closest('li.td-media-gallery__item');
    return { role, id: li ? (this._itemOf.get(/** @type {HTMLElement} */ (li))?.id ?? null) : null };
  }

  /** @private focus the same control (by item id + role) */
  _restoreFocus(f) {
    if (!f) return;
    if (f.role === 'add' || f.id == null) { this._part('add')?.focus({ preventScroll: true }); return; }
    const it = this._items.find((x) => x.id === f.id);
    const li = it && this._liOf.get(it);
    if (li) this._part(f.role, li)?.focus({ preventScroll: true });
  }

  /** @private a move (remove + insert) drops the focus: put it back */
  _refocusAfterMove() {
    const f = this._focusMark;
    const active = this.ownerDocument.activeElement;
    if (!f || (active && active !== this.ownerDocument.body && active !== this.ownerDocument.documentElement)) return;
    this._restoreFocus(f);
  }

  /** @private repaint the preview of one tile in place (lazy get / source change) */
  _paintPreview(it) {
    const li = this._liOf.get(it);
    const media = li && this._part('media', li);
    if (!media) return;
    li.setAttribute('data-kind', it.kind);
    for (const n of media.querySelectorAll(':scope > .td-media-gallery__img, :scope > .td-media-gallery__file, :scope > .td-media-gallery__badge')) n.remove();
    const tpl = document.createElement('template');
    tpl.innerHTML = this._previewHtml(it);
    fillIconSlots(tpl.content);
    media.querySelector(':scope > .td-media-gallery__sizer')?.after(tpl.content);
  }

  /**
   * @private names with positions (every tile: cheap, ≤ 100), the cover badge on the first tile, alt labels, crop
   * buttons / previews, the count line and the Add button.
   */
  _relabel() {
    const ul = this._ul();
    if (!ul) return;
    const n = this._items.length;
    const cover = this.hasAttribute('cover');
    const set = (el, a, v) => { if (el && el.getAttribute(a) !== v) el.setAttribute(a, v); };
    this._items.forEach((it, i) => {
      const li = this._liOf.get(it);
      if (!li) return;
      const full = this._fullName(it, i, n);
      set(this._part('handle', li), 'aria-label', this._label('handle', { name: full }));
      set(this._part('remove', li), 'aria-label', this._label('remove', { name: full }));
      set(this._part('crop', li), 'aria-label', this._label('crop', { name: full }));
      const al = this._part('altLabel', li);
      const at = this._label('alt', { n: i + 1 });
      if (al && al.textContent !== at) al.textContent = at;
      const badge = this._part('cover', li);
      if (cover && i === 0 && !badge) {
        const b = document.createElement('span');
        b.className = 'td-media-gallery__cover';
        b.textContent = this._label('cover');
        this._part('handle', li)?.before(b);
      } else if (badge && !(cover && i === 0)) {
        badge.remove();
      }
      this._syncCropPreview(li, it);
    });
    this._syncCropBtns();
    const count = this._part('count');
    const ct = this._countText();
    if (count && count.textContent !== ct) count.textContent = ct;
    if (count && n > this._max()) count.setAttribute('data-state', 'over');
    else count?.removeAttribute('data-state');
    const add = this._part('add');
    if (add) {
      const state = n ? 'filled' : 'empty';
      if (add.getAttribute('data-state') !== state) {
        add.setAttribute('data-state', state);
        add.innerHTML = this._addInner();
        fillIconSlots(add);
      }
      const hide = n >= this._max();
      if (add.hidden !== hide) add.hidden = hide;
    }
  }

  /** @private "Cắt" buttons follow the source (adapter appeared / removed) */
  _syncCropBtns() {
    for (const it of this._items) {
      const btn = this._part('crop', this._liOf.get(it) || null);
      if (!btn) continue;
      const hide = !this._cropBtnShown(it);
      if (btn.hidden !== hide) btn.hidden = hide;
    }
  }

  /** @private */
  _clearCropPreview(li) {
    const img = li && this._part('img', li);
    if (!img || !img.hasAttribute('style')) return;
    for (const v of CROP_VARS) img.style.removeProperty(v);
    if (!img.getAttribute('style')) img.removeAttribute('style');
  }

  /**
   * @private decision 13 (the field's rule): croppable + a crop whose PIXEL ratio is within 2 % of the tile's → the
   * `<img>` shows exactly the cropped area (CSSOM, unitless); else plain `object-fit` (vars removed).
   */
  _syncCropPreview(li, it) {
    const img = this._part('img', li);
    if (!img) return;
    const r = this._ratio() || { w: 1, h: 1 };
    const crop = this._croppable() && it.kind === 'image' && it.cropRaw ? parseCrop(it.cropRaw)?.crop : null;
    let vars = null;
    if (crop) {
      const a = it.asset;
      const known = !!(a && posInt(a.width) && posInt(a.height));
      const W = known ? a.width : img.naturalWidth;
      const H = known ? a.height : img.naturalHeight;
      vars = cropPreviewVars(crop, { W, H, frameRatio: r.w / r.h });
      if (!known && !(W > 0 && H > 0) && !LOAD_BOUND.has(img)) {
        LOAD_BOUND.add(img);
        img.addEventListener('load', () => {
          const cur = this._itemOf.get(li);
          if (cur && this._part('img', li) === img) this._syncCropPreview(li, cur);
        }, { once: true });
      }
    }
    if (!vars) { this._clearCropPreview(li); return; }
    const vals = [vars.x, vars.y, vars.w, vars.h];
    CROP_VARS.forEach((v, i) => img.style.setProperty(v, String(vals[i])));
  }

  // --- Form ---

  /** @private the FormData entries (decision 14), null when nothing is submitted */
  _entries() {
    if (this._isBroken() || this._isOverflow()) return null;
    return galleryEntries(this.getAttribute('name'), this._items, { usage: this.hasAttribute('usage'), focal: this._focalOn() });
  }

  /** @private FormData by hand + the restore state + validity (decision 8) */
  _syncForm() {
    if (this._isBroken()) {
      // decision 15: nothing submitted AND nothing to restore (a restored empty list would submit `name=`)
      this._setFormValue(null);
      this._setValidity({});
      return;
    }
    const entries = this._entries();
    let fd = null;
    if (entries) {
      fd = new FormData();
      for (const [k, v] of entries) fd.append(k, v);
    }
    this._setFormValue(fd, encodeGalleryState(this._items));
    const n = this._items.length;
    const max = this._max();
    const min = this._min();
    const kind = this._kindWord();
    const anchor = this._validationAnchor();
    if (n > max) this._setValidity({ rangeOverflow: true }, this._label('max', { max, kind }), anchor);
    else if (n === 0 && min >= 1) this._setValidity({ valueMissing: true }, this._label('required', { kind }), anchor);
    else if (n < min) this._setValidity({ rangeUnderflow: true }, this._label('min', { min, kind }), anchor);
    else this._setValidity({});
  }

  _captureDefaults() {}

  /** form.reset() → the `items` attribute (no event) */
  _restoreDefaults() {
    this._applyAttr();
  }

  /**
   * @protected formStateRestoreCallback (decision 15b / 16): a v1 state of id / alt / crop / focal through
   * validateItems(); structural error → dropped (the current state is valid, kept) + one warning; over max → kept
   * (decision 8). Previews come back through adapter.get().
   */
  _restoreState(state) {
    if (typeof state !== 'string') return;
    const raw = decodeGalleryState(state);
    const r = raw ? validateItems(raw.map((x) => (x && typeof x === 'object' ? { ...x, kind: this._kinds()[0] } : x)), { max: this._max(), safeUrl: okUrl }) : null;
    if (!r || (!r.ok && r.reason !== 'max')) {
      this._warnOnce('restore', `td-media-gallery: a restored form state was dropped (${r ? r.reason : 'state'}) — the gallery is unchanged.`);
      return;
    }
    this._commit(r.items.map((n) => this._newItem(n)));
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'items':
        this._applyAttr();
        return;
      case 'name':
        if ((oldVal ?? '').endsWith('[]') !== (newVal ?? '').endsWith('[]')) this._doRender();
        else this._syncForm();
        return;
      case 'crop-ratio':
      case 'preview-fit':
        return; // read when the dialog opens / CSS only
      default:
        super.attributeChangedCallback(name, oldVal, newVal);
    }
  }

  // --- Behaviour ---

  /** @private */
  _emit(type, reason) {
    this.emit(type, { value: this.value, selection: this.selection, reason });
  }

  /** @private gallery live region (add / remove / skipped / errors): cleared first so a repeat is read again */
  _announce(text) {
    const s = this._part('status');
    if (!s) return;
    s.textContent = '';
    s.textContent = text;
  }

  /** @private decision 5: the picker in multiple mode for the room left; one at a time */
  _openPicker() {
    if (this._busy || this._effectiveDisabled || this._isBroken()) return;
    const remaining = this._max() - this._items.length;
    if (remaining <= 0) return;
    const adapter = this._resolveAdapter();
    if (!adapter) {
      this._warnOnce('adapter', 'td-media-gallery: no media adapter (gallery.adapter, gallery.pickerOptions.adapter or '
        + 'TdMediaPicker.configureDefaults({ adapter })) — the picker was not opened.');
      return;
    }
    const opts = {
      ...(isAdapter(this._adapterProp) ? { adapter: this._adapterProp } : {}),
      ...(this._pickerOptions || {}),
      selection: { mode: 'multiple', initialIds: [], maxItems: remaining, kinds: this._kinds() },
      crop: { enabled: false }, // the picker crops in single mode only: a gallery crops per tile afterwards
    };
    const label = this.getAttribute('label');
    if (label) opts.title = label;
    opts.themeRoot = this; // ADR 0020: the picker follows the gallery's theme scope
    this._busy = true;
    const gen = ++this._pickGen;
    const src = this._srcGen;
    let p;
    const hosts = () => [...document.body.children].filter((n) => n.localName === 'td-media-picker');
    const before = new Set(hosts());
    try {
      p = Promise.resolve(TdMediaPicker.open(opts));
      const host = hosts().find((n) => !before.has(n)) || null;
      if (gen === this._pickGen && src === this._srcGen && this.isConnected) this._pickerHost = host;
      else {
        // app code run inside open() (adapter list() → configureDefaults, removal) already invalidated this picker
        try { if (host && host.isConnected) host.close('programmatic'); } catch { /* ignore */ }
        if (gen === this._pickGen) { this._pickGen += 1; this._busy = false; }
      }
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then((outcome) => {
      if (gen !== this._pickGen) return;
      this._busy = false;
      this._pickerHost = null;
      if (src !== this._srcGen || !this.isConnected || this._effectiveDisabled || this._isBroken()) return;
      this._onPicked(outcome, src);
    }, (err) => {
      if (gen !== this._pickGen) return;
      this._busy = false;
      this._pickerHost = null;
      console.warn(`td-media-gallery: the media picker failed (${err && typeof err.name === 'string' ? err.name : 'error'})`);
    });
  }

  /** @private drop the picker: its outcome ignored, the lock released, the host closed */
  _cancelPicker() {
    this._pickGen += 1;
    this._busy = false;
    const host = this._pickerHost;
    this._pickerHost = null;
    try { if (host && host.isConnected && typeof host.close === 'function') host.close('programmatic'); } catch { /* ignore */ }
  }

  /** @private decision 5 / 15b: append the picked assets (pick order), skipping duplicates / invalid / overflow */
  _onPicked(outcome, srcGen) {
    if (!outcome || outcome.status !== 'selected' || !Array.isArray(outcome.selection)) return;
    const remaining = this._max() - this._items.length;
    const have = new Set(this._items.map((it) => it.id));
    const kind0 = this._kinds()[0];
    let dup = 0;
    let over = 0;
    /** @type {GalleryItem[]} */
    const added = [];
    for (const sel of outcome.selection) {
      const id = sel && sel.assetId;
      if (!validateItems([{ id }]).ok) continue; // an invalid id is dropped
      if (have.has(id)) { dup += 1; continue; }
      if (added.length >= remaining) { over += 1; continue; }
      have.add(id);
      const asset = normalizeAsset(sel.asset, { safeUrl: (u) => safeMediaUrl(u) });
      const alt = typeof sel.usage?.altText === 'string' ? sel.usage.altText : (asset?.defaultAltText ?? '');
      added.push({
        id, src: asset ? safeSrc(asset.urls?.preview) : '', previewAlt: asset?.name || '', kind: asset?.kind ?? kind0,
        alt: cap(alt), cropRaw: null, focalRaw: null, asset, fromAdapter: !!asset, assetGen: srcGen, explicit: null,
        resolved: !!asset,
      });
    }
    const kind = this._kindWord();
    const msgs = [];
    if (added.length) {
      const first = added[0];
      this._items = [...this._items, ...added];
      const ul = this._ul();
      const lis = added.map((it) => this._createLi(it));
      this._own(() => ul?.append(...lis));
      this._afterListChange();
      this._emit('input', 'add');
      this._emit('change', 'add');
      msgs.push(this._label('added', { n: added.length, kind }));
      const add = this._part('add');
      if (add && add.hidden) {
        const li = this._liOf.get(first);
        if (li) this._part('handle', li)?.focus({ preventScroll: true });
      }
      this._lazyPump();
    }
    if (dup) msgs.push(this._label('skipped', { n: dup, kind }));
    if (over) msgs.push(this._label('tooMany', { n: over, kind }));
    if (msgs.length) this._announce(`${msgs.join(' ')} ${this._countText()}.`);
  }

  /** @private decision 7: Gỡ → input + change, announce, focus → next tile's Gỡ → previous → Add */
  _remove(li) {
    if (this._effectiveDisabled || this._isBroken()) return;
    const it = this._itemOf.get(li);
    const index = it ? this._items.indexOf(it) : -1;
    if (index < 0) return;
    this._ctl?.cancel('external');
    this._abortGet(it);
    if (this._crop && this._crop.itemEl === li) this._abortCrop();
    this._items = this._items.filter((x) => x !== it);
    this._own(() => li.remove());
    this._afterListChange();
    this._lazyPump(); // ISSUE-5: the aborted get freed a slot — the queue goes on
    this._emit('input', 'remove');
    this._emit('change', 'remove');
    this._announce(this._label('removed', { name: this._baseName(it), count: this._items.length, kind: this._kindWord() }));
    const k = OrderedCollectionModel.focusAfterRemove(index, this._items.length);
    const next = k >= 0 ? this._liOf.get(this._items[k]) : null;
    if (next) this._part('remove', next)?.focus();
    else this._part('add')?.focus();
  }

  // --- Reorder (decision 10) ---

  /** @private the SortableController on the list (its items must be direct children of its host) */
  _startSort() {
    const ul = this._ul();
    if (this._ctl && this._ctl.host !== ul) this._stopSort();
    if (!ul || !this.isConnected || this._ctl) return;
    this._ctl = new SortableController(ul, {
      items: () => this._items.map((it) => this._liOf.get(it)).filter(Boolean),
      handleOf: (li) => this._part('handle', li),
      move: (from, to) => this._move(from, to),
      commit: () => {
        this._emit('input', 'reorder');
        this._emit('change', 'reorder');
      },
      // short name: the controller's own texts already say "vị trí {n} trên {count}"
      nameOf: (li) => { const it = this._itemOf.get(li); return it ? this._baseName(it) : ''; },
      live: this._part('sortStatus'),
      enabled: () => !this._effectiveDisabled && !this._isBroken(),
      labels: SORTABLE_LABELS,
      reconcile: () => this._reconcile(),
    });
    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver((records) => {
        const own = (n) => !!this._ctl && this._ctl.isOwnNode(n);
        if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every(own))) return;
        this._outsideChange();
      });
      this._mo.observe(ul, { childList: true });
    }
    this._cleanups.push(() => this._stopSort());
  }

  /** @private */
  _stopSort() {
    this._ctl?.destroy();
    this._ctl = null;
    this._mo?.disconnect();
    this._mo = null;
  }

  /** @private pending outside changes first (the controller calls it right before a drop) */
  _reconcile() {
    const recs = this._mo?.takeRecords() || [];
    const own = (n) => !!this._ctl && this._ctl.isOwnNode(n);
    if (recs.length && !recs.every((r) => [...r.addedNodes, ...r.removedNodes].every(own))) this._outsideChange();
  }

  /** @private someone else changed the list's children: cancel a gesture, put the gallery's tiles back */
  _outsideChange() {
    const ul = this._ul();
    if (!ul) return;
    const lis = this._items.map((it) => this._liOf.get(it));
    const kids = [...ul.children].filter((n) => !(this._ctl && this._ctl.isOwnNode(n)));
    if (kids.length === lis.length && kids.every((n, i) => n === lis[i])) return;
    this._ctl?.cancel('external');
    this._own(() => ul.replaceChildren(...lis));
  }

  /** @private the controller's adapter: neighbours move around the item (it stays attached, focus kept) */
  _move(from, to) {
    const n = this._items.length;
    if (!(from >= 0 && to >= 0 && from < n && to < n) || from === to) return;
    const lis = this._items.map((it) => this._liOf.get(it));
    const li = lis[from];
    this._own(() => {
      if (from < to) for (let k = from + 1; k <= to; k += 1) li.before(lis[k]);
      else for (let k = from - 1; k >= to; k -= 1) li.after(lis[k]);
    });
    const [it] = this._items.splice(from, 1);
    this._items.splice(to, 0, it);
    this._afterListChange();
  }

  // --- Crop (decisions 12, 12b) ---

  /** @private abort the running crop flow (source get / dialog) and release the lock — exactly once */
  _abortCrop() {
    const c = this._crop;
    if (!c) return;
    this._crop = null;
    c.ctrl.abort();
    this._busy = false;
    this._pickGen += 1;
    this._part('crop', c.itemEl)?.removeAttribute('aria-busy');
  }

  /** @private ISSUE-2 (defensive): a flow found stale that is still the current one is aborted (lock + dialog released) */
  _dropCrop(c) {
    if (this._crop === c) this._abortCrop();
  }

  /** @private decision 12b: the flow `c` may still act (not aborted, same source, same tile, same id) */
  _cropAlive(c) {
    const ul = this._ul();
    return this._crop === c && !c.ctrl.signal.aborted && c.gen === this._srcGen && c.itemEl.isConnected
      && !!ul && c.itemEl.parentNode === ul && this._itemOf.get(c.itemEl)?.id === c.id
      && this._items.includes(this._itemOf.get(c.itemEl));
  }

  /** @private after a list change: a crop flow whose tile went (or whose id changed) is aborted */
  _checkCrop() {
    const c = this._crop;
    if (!c) return;
    const ul = this._ul();
    const it = this._itemOf.get(c.itemEl);
    if (!ul || c.itemEl.parentNode !== ul || !it || it.id !== c.id || !this._items.includes(it)) this._abortCrop();
  }

  /** @private status text (the gallery live region) */
  _cropFail(text) {
    this._announce(text || this._label('cropError'));
  }

  /**
   * @private decision 12: "Cắt" → the crop dialog for ONE tile. Source (the field's fail-closed order): an adapter →
   * the cached asset of THIS source generation with a size, else `adapter.get(id)` (`aria-busy`) → `urls.preview` +
   * `width/height`; no adapter → the tile's explicit `src` only. Every await is followed by the decision 12b check;
   * the result is applied to the CAPTURED tile (never by index).
   */
  async _openCrop(li) {
    const it0 = this._itemOf.get(li);
    if (this._busy || this._effectiveDisabled || this._isBroken() || !this._croppable() || !it0 || !this._cropBtnShown(it0)) return;
    this._busy = true;
    const c = { ctrl: new AbortController(), itemEl: li, id: it0.id, gen: this._srcGen };
    this._crop = c;
    const release = () => {
      if (this._crop !== c) return false;
      this._crop = null;
      this._busy = false;
      return true;
    };
    const btn = this._part('crop', li);
    const adapter = this._resolveAdapter();
    let source = null;
    if (!adapter) {
      source = it0.src && !it0.fromAdapter ? { src: it0.src } : null;
    } else {
      let asset = it0.asset;
      if (!(asset && asset.id === c.id && posInt(asset.width) && posInt(asset.height) && it0.assetGen === this._srcGen)) {
        btn?.setAttribute('aria-busy', 'true');
        const context = this._resolveContext();
        let r;
        try { r = { v: await adapter.get(c.id, { context, signal: c.ctrl.signal }) }; } catch (e) { r = { e }; }
        if (!this._cropAlive(c)) { this._dropCrop(c); return; } // aborted / stale: never left holding the lock
        btn?.removeAttribute('aria-busy');
        if ('e' in r) {
          const err = normalizeError(r.e, c.ctrl.signal, { operation: 'td-media-gallery crop get' }); // operation + code only
          release();
          if (err) this._cropFail(err.userMessage);
          return;
        }
        asset = normalizeAsset(r.v, { safeUrl: (u) => safeMediaUrl(u) });
        if (!asset || asset.id !== c.id) { release(); this._cropFail(); return; }
        const it = this._itemOf.get(li);
        Object.assign(it, {
          src: safeSrc(asset.urls?.preview), previewAlt: asset.name || '', kind: asset.kind, asset, fromAdapter: true, assetGen: c.gen,
        });
        this._paintPreview(it);
        this._relabel();
        if (asset.kind !== 'image') { release(); return; }
      }
      const src = safeSrc(asset.urls?.preview);
      const nw = posInt(asset.width);
      const nh = posInt(asset.height);
      source = src ? (nw && nh ? { src, naturalWidth: nw, naturalHeight: nh } : { src }) : null;
    }
    if (!source) { release(); this._cropFail(); return; }
    const it = this._itemOf.get(li);
    const focalOn = this._focalOn();
    const crop = it.cropRaw ? parseCrop(it.cropRaw)?.crop ?? null : null;
    const focal = focalOn && it.focalRaw ? parseFocal(it.focalRaw)?.focal ?? null : null;
    let res;
    try {
      res = await openCropDialog({
        ...source,
        themeRoot: this,
        alt: it.alt || it.previewAlt,
        aspectRatio: this._cropRatio(),
        crop: crop ? { ...crop } : null,
        focalPoint: focal ? { ...focal } : null,
        allowFocalPoint: focalOn,
        title: this._label('cropTitle'),
        nested: false,
        signal: c.ctrl.signal,
        opener: btn || undefined,
      });
    } catch (err) {
      if (release()) console.warn(`td-media-gallery: the crop dialog failed (${err && typeof err.name === 'string' ? err.name : 'error'})`);
      return;
    }
    if (!this._cropAlive(c)) { this._dropCrop(c); return; } // decision 12b: removed / id changed / new source / gone → nothing applied
    release();
    if (!res || res.status !== 'applied' || !res.changed) return;
    const cur = this._itemOf.get(li);
    cur.cropRaw = res.crop ? serializeCrop(res.crop.normalized) : null;
    if (focalOn) cur.focalRaw = res.focalPoint ? serializeFocal(res.focalPoint) : null;
    this._syncCropPreview(li, cur);
    this._syncForm();
    this._emit('input', 'crop');
    this._emit('change', 'crop');
    this._part('crop', li)?.focus({ preventScroll: true });
  }

  /** @private */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  // --- SSR (ADR 0012, contract media-gallery@1) ---

  /**
   * Marker `media-gallery@1` + exactly render()'s tree (+ the no-JS inputs agreeing with the state) → adopt in place.
   * Anything else → safe render now, keeping the alts being typed + the focused control (by item id + role).
   * @returns {boolean}
   */
  canHydrate() {
    this._initLive();
    const m = ssrMarker(this);
    if (!m || m.name !== 'media-gallery') return false;
    if (m.schema === 1 && this._ssrGate(true)) return true;
    const ul = this.querySelector(LIST);
    const lis = ul ? [...ul.children].filter((n) => n.localName === 'li') : [];
    const idOf = (li, i) => {
      const h = [...li.children].find((n) => isHiddenInput(n) && n.classList.contains('td-media-gallery__value'));
      if (h) return h.getAttribute('value');
      return lis.length === this._items.length ? this._items[i]?.id ?? null : null;
    };
    const alts = new Map();
    lis.forEach((li, i) => {
      const input = li.querySelector(':scope > .td-media-gallery__alt-field > input.td-media-gallery__alt');
      const id = idOf(li, i);
      if (input && id != null) alts.set(id, cap(input.value));
    });
    const active = this.ownerDocument.activeElement;
    let focus = null;
    if (active && active !== this && this.contains(active)) {
      const role = Object.keys(ROLES).find((r) => active.classList?.contains(ROLES[r]));
      const li = active.closest('li');
      focus = role ? { role, id: li ? idOf(li, lis.indexOf(li)) : null } : null;
    }
    this._ssrRestore = { alts: this.hasAttribute('usage') ? alts : null, focus };
    this._ssrFreshRender = true;
    return false;
  }

  /** Re-connect: re-bind in place while the markup is still render()'s of the live state (else safe render). */
  canRebind() {
    if (this._ssrGate(false)) return true;
    this._ssrRestore = { alts: null, focus: this._focusMark };
    this._ssrFreshRender = true;
    return false;
  }

  hydrateExisting() {
    const ul = this._ul();
    const lis = ul ? [...ul.children] : [];
    lis.forEach((li, i) => {
      const alt = li.querySelector(':scope > .td-media-gallery__alt-field > input.td-media-gallery__alt');
      const it = this._items[i];
      if (!alt || !it) return;
      it.alt = cap(alt.value); // the live native state (typed before define) > the attribute
      alt.value = it.alt; // dirty: removing the value attribute below changes nothing
    });
    this._errorNote = [...this.children].find(ssrIsErrorNote) || null;
    this._syncForm(); // ElementInternals FIRST…
    for (const h of this._ssrHidden()) h.remove(); // …then the no-JS parts: FormData has ONE set of entries
    for (const li of lis) {
      const alt = li.querySelector(':scope > .td-media-gallery__alt-field > input.td-media-gallery__alt');
      alt?.removeAttribute('name');
      alt?.removeAttribute('value');
    }
  }

  /** @protected after refused / tampered markup was replaced: the alts being typed + the focus */
  _restoreSsrState(s) {
    if (s.alts && s.alts.size) {
      for (const it of this._items) {
        if (!s.alts.has(it.id)) continue;
        it.alt = s.alts.get(it.id);
        const li = this._liOf.get(it);
        const alt = li && this._part('alt', li);
        if (alt) alt.value = it.alt;
      }
      this._relabel();
      this._syncForm();
    }
    if (s.focus) this._restoreFocus(s.focus);
  }

  /** @private the no-JS hidden inputs: children of the host (empty list) or of a tile */
  _ssrHidden() {
    return [...this.querySelectorAll('input')].filter(isHiddenInput); // tree order (= FormData order)
  }

  /**
   * @private The strict gate shared by adoption (`first`) and re-bind: host children = render()'s, part by part
   * (attributes exactly, text exactly, icon slots by their attributes), plus — first only — the host attribute
   * allowlist, the no-JS hidden inputs and the alt `name` / `value` matching the form shape of the state.
   * @param {boolean} first
   */
  _ssrGate(first) {
    if (first && ![...this.attributes].every((a) => HOST_ATTRS.has(a.name) || SSR_CONTROL_ATTRS.has(a.name) || SSR_ARIA_DATA.test(a.name))) {
      return false;
    }
    const nodes = ssrContentNodes(this);
    if (nodes.some((n) => n.nodeType !== 1)) return false;
    const rest = first ? nodes.filter((n) => !isHiddenInput(n)) : nodes;
    const tpl = document.createElement('template');
    // first: render() as PHP prints it ("Cắt" shown from src only — the adapter is applied after adoption)
    this._ssrRender = first;
    try {
      tpl.innerHTML = this.render();
    } finally {
      this._ssrRender = false;
    }
    const want = [...tpl.content.children];
    if (rest.length !== want.length) return false;
    if (!want.every((w, i) => this._ssrSame(rest[i], w, first))) return false;
    return !first || this._ssrFormOk();
  }

  /** @private one node of render() (recursive); `li` may hold the no-JS hidden inputs, the alt its name / value */
  _ssrSame(live, want, first) {
    if (live.nodeType !== 1 || live.localName !== want.localName || live.namespaceURI !== want.namespaceURI) return false;
    if (want.hasAttribute('data-td-icon')) return ssrSameAttrs(live, want);
    if (want.classList.contains('td-media-gallery__alt')) {
      for (const a of live.attributes) {
        if (want.hasAttribute(a.name)) {
          if (a.name === 'class' ? ssrClassKey(live) !== ssrClassKey(want) : a.value !== want.getAttribute(a.name)) return false;
        } else if (!(first && (a.name === 'name' || a.name === 'value'))) {
          return false;
        }
      }
      return [...want.attributes].every((a) => live.hasAttribute(a.name)) && live.childNodes.length === 0;
    }
    if (!ssrSameAttrs(live, want)) return false;
    let a = ssrContentNodes(live);
    if (first && want.localName === 'li') a = a.filter((n) => !isHiddenInput(n));
    const b = ssrContentNodes(want);
    if (a.length !== b.length) return false;
    return a.every((n, i) => (n.nodeType === 3 || b[i].nodeType === 3
      ? n.nodeType === b[i].nodeType && n.data === b[i].data
      : this._ssrSame(n, b[i], first)));
  }

  /** @private the no-JS inputs = the FormData of the state (order, classes, names, values, disabled) */
  _ssrFormOk() {
    const name = this.getAttribute('name');
    const usage = this.hasAttribute('usage');
    const focal = this._focalOn();
    const printed = name && !this._isBroken() && !this._isOverflow()
      ? galleryEntries(name, this._items, { usage, focal }) || [] : [];
    const expect = printed.filter(([k]) => !(usage && k.endsWith('[alt]')));
    const hidden = this._ssrHidden();
    if (hidden.length !== expect.length) return false;
    const classOf = (k) => (k.endsWith('[crop]') ? 'td-media-gallery__crop' : k.endsWith('[focal]') ? 'td-media-gallery__focal' : 'td-media-gallery__value');
    const dis = this.hasAttribute('disabled');
    const ok = hidden.every((h, i) => ssrClassKey(h) === classOf(expect[i][0])
      && [...h.attributes].every((a) => HIDDEN_ATTRS.includes(a.name))
      && h.getAttribute('name') === expect[i][0] && (h.getAttribute('value') ?? '') === expect[i][1]
      && h.hasAttribute('disabled') === dis);
    if (!ok) return false;
    // every hidden input sits where PHP prints it (a tile: before its alt; the empty list: after the list)
    const ul = this._ul();
    if (!hidden.every((h) => h.parentNode === this || (h.parentNode?.parentNode === ul))) return false;
    if (this._items.length === 0 && hidden.length && hidden[0].previousElementSibling !== ul) return false;
    const lis = ul ? [...ul.children] : [];
    return lis.every((li, i) => {
      const alt = li.querySelector(':scope > .td-media-gallery__alt-field > input.td-media-gallery__alt');
      if (!alt) return true;
      const altName = printed.find(([k]) => k === `${name}[${i}][alt]`)?.[0];
      const it = this._items[i];
      const nameOk = altName ? alt.getAttribute('name') === altName : !alt.hasAttribute('name');
      const valueOk = it.alt ? alt.getAttribute('value') === it.alt : !alt.hasAttribute('value');
      // a tile's hidden inputs: value before the alt, crop / focal after it
      const kids = [...li.children];
      const hs = kids.filter(isHiddenInput);
      const at = kids.indexOf(alt.parentElement);
      const orderOk = hs.every((h) => (h.classList.contains('td-media-gallery__value') ? kids.indexOf(h) < at : kids.indexOf(h) > at));
      return nameOk && valueOk && orderOk;
    });
  }
}

if (!customElements.get('td-media-gallery')) {
  customElements.define('td-media-gallery', TdMediaGallery);
}
