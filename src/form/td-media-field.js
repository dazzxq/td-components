import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { TdMediaPicker, onDefaultsChange } from '../feedback/td-media-picker.js';
import { isAdapter, normalizeAsset, normalizeError, LatestRequest } from '../utils/media-picker-core.js';
import { safeMediaUrl } from '../utils/media-url.js';
import {
  KINDS, parseAspectRatio, parseCrop, parseKinds, fieldEntries, encodeState, decodeState,
} from '../utils/media-field-model.js';

const ALT_MAX = 500;
/** Attributes the no-JS hidden inputs of php/td.php td_media_field() may carry. */
const HIDDEN_ATTRS = ['type', 'class', 'name', 'value', 'disabled'];
const ROLES = { open: 'td-media-field__open', replace: 'td-media-field__replace', remove: 'td-media-field__remove', alt: 'td-media-field__alt' };

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
 *       <button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button>
 *     </div>
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
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'aspect-ratio', 'preview-fit', 'accept-kind', 'usage',
      'preview-src', 'preview-alt', 'kind', 'alt', 'crop', 'prompt', 'helper-text', 'error-text'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'usage']; }

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
    this._unsubDefaults = onDefaultsChange(() => {
      if (this.isConnected && this._needsPreview() && !this._getReq.pending) this._lazyGet();
    });
    if (this._needsPreview()) this._lazyGet();
  }

  disconnectedCallback() {
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
    super.disconnectedCallback();
    this._pickGen += 1; // a picker result arriving after the field left the page is dropped
    this._picking = false;
    this._getReq.abort();
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
    this._applyLive({ id, src: '', previewAlt: '', kind: this._kinds()[0], alt: this._alt, cropRaw: null, asset: null },
      { lazy: this._initialized && this.isConnected });
  }

  /** @returns {object|null} the field's own adapter (lower priority than `pickerOptions.adapter`) */
  get adapter() { return this._adapterProp; }

  set adapter(a) {
    this._adapterProp = a ?? null;
    if (this._initialized && this.isConnected && this._needsPreview()) this._lazyGet();
  }

  /** @returns {object|null} options merged over TdMediaPicker defaults when the picker opens */
  get pickerOptions() { return this._pickerOptions; }

  set pickerOptions(o) {
    this._pickerOptions = o && typeof o === 'object' ? o : null;
    if (this._initialized && this.isConnected && this._needsPreview()) this._lazyGet();
  }

  /**
   * @returns {Array<{ assetId: string, asset: object|null, usage: { altText: string, crop: object|null, focalPoint: null } }>}
   *   `[]` when empty; `asset` is null when only server / restored data is known
   */
  get selection() {
    if (!this._value) return [];
    const c = this._cropRaw ? parseCrop(this._cropRaw) : null;
    return [{
      assetId: this._value,
      asset: this._asset,
      usage: { altText: this._alt, crop: c ? { normalized: { ...c.crop } } : null, focalPoint: null },
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
      this._applyLive({ id: '', src: '', previewAlt: '', kind: this._kinds()[0], alt: '', cropRaw: null, asset: null });
      return;
    }
    const asset = normalizeAsset(s.asset, { safeUrl: (u) => safeMediaUrl(u) });
    const n = s.usage?.crop?.normalized;
    let cropRaw = null;
    if (n && typeof n === 'object') {
      cropRaw = parseCrop(JSON.stringify({ v: 1, x: n.x, y: n.y, width: n.width, height: n.height }))?.raw ?? null;
    }
    const altText = typeof s.usage?.altText === 'string' ? s.usage.altText : (asset?.defaultAltText ?? '');
    this._valueSet = true;
    this._applyLive({ id: s.assetId, ...this._previewOf(asset), alt: cap(altText), cropRaw, asset });
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
      asset: null,
    };
  }

  /** @private the live state on first connect: attributes, an early `.value` winning over the attribute */
  _initLive() {
    if (this._liveReady) return;
    const s = this._stateFromAttrs();
    if (this._valueSet && s.id !== this._value) {
      Object.assign(s, { id: this._value, src: '', previewAlt: '', kind: this._kinds()[0], cropRaw: null });
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
    this._asset = s.asset ?? null;
  }

  /** @private set the whole live state (silent), repaint in place, sync the form; `lazy` → fetch a missing preview */
  _applyLive(s, { lazy = false } = {}) {
    this._getReq.abort();
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

  /** @private decision 27: fetch the preview of an id set by code (latest wins; a later change aborts it) */
  _lazyGet() {
    const adapter = this._resolveAdapter();
    if (!adapter) return;
    const id = this._value;
    const context = this._pickerOptions?.context ?? TdMediaPicker.defaults?.context;
    this._getReq.run((signal) => adapter.get(id, { context, signal })).then((r) => {
      if (r.stale || id !== this._value) return;
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
      + `<button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove"${dis}>${e(this._label('remove'))}</button></div>`
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
    [...wActions.children].forEach((w, i) => { if (btns[i] && btns[i].textContent !== w.textContent) btns[i].textContent = w.textContent; });
    const alt = this._part('alt');
    if (alt && alt.value !== this._alt) alt.value = this._alt;
    this._syncForm();
  }

  // --- Form ---

  /** @private FormData by hand (decision 24) + the restore state + validity */
  _syncForm() {
    const name = this.getAttribute('name');
    const usage = this.hasAttribute('usage');
    const entries = fieldEntries(name, { id: this._value, alt: this._alt, cropRaw: this._cropRaw }, usage);
    if (!entries && usage && name && name.endsWith('[]')) {
      this._warnOnce('name[]', `td-media-field: usage + name "${name}" ending in [] would mis-group name[id] / name[alt] / name[crop] — not submitted.`);
    }
    let fd = null;
    if (entries) {
      fd = new FormData();
      for (const [k, v] of entries) fd.append(k, v);
    }
    // review SEC-1: the restore state carries no preview URL / server label (re-fetched with adapter.get on restore)
    this._setFormValue(fd, encodeState({ id: this._value, alt: this._alt, cropRaw: this._cropRaw }));
    if (this.hasAttribute('required') && !this._value) {
      const kind = this._kinds()[0];
      this._setValidity({ valueMissing: true },
        this._label('required', { kind: this._label(`kinds.${kind}`) || kind }), this._part('open') || undefined);
    } else {
      this._setValidity({});
    }
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
    this._applyLive({ id: s.id, src: '', previewAlt: '', kind: this._kinds()[0], alt: s.alt, cropRaw: s.cropRaw, asset: null },
      { lazy: true });
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
        this._applyLive({ id: this._value, src: s.src, previewAlt: s.previewAlt, kind: s.kind, alt: this._alt, cropRaw: this._cropRaw, asset: null });
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
        this._syncForm();
        return;
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
    };
    const label = this.getAttribute('label');
    if (label) opts.title = label;
    this._picking = true;
    const gen = ++this._pickGen;
    let p;
    try {
      p = Promise.resolve(TdMediaPicker.open(opts));
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then((outcome) => {
      if (gen !== this._pickGen) return;
      this._picking = false;
      if (this.isConnected) this._onOutcome(outcome, trigger);
    }, (err) => {
      if (gen !== this._pickGen) return;
      this._picking = false;
      // review SEC-2: never the raw error object (it may carry adapter data); the name only
      console.warn(`td-media-field: the media picker failed (${err && typeof err.name === 'string' ? err.name : 'error'})`);
    });
  }

  /** @private */
  _onOutcome(outcome, trigger) {
    if (!outcome || outcome.status !== 'selected' || !Array.isArray(outcome.selection)) return;
    const sel = outcome.selection[0];
    if (!sel || typeof sel.assetId !== 'string' || !sel.assetId) return;
    const asset = normalizeAsset(sel.asset, { safeUrl: (u) => safeMediaUrl(u) });
    const preview = this._previewOf(asset);
    if (!asset) preview.kind = this._kind;
    if (sel.assetId === this._value) {
      // same asset: refresh what is shown, nothing changed for the form → no event
      this._applyLive({ id: this._value, ...preview, alt: this._alt, cropRaw: this._cropRaw, asset });
      return;
    }
    const altText = typeof sel.usage?.altText === 'string' ? sel.usage.altText : (asset?.defaultAltText ?? '');
    this._applyLive({ id: sel.assetId, ...preview, alt: cap(altText), cropRaw: null, asset });
    this._emit('input');
    this._emit('change');
    if (trigger && (!trigger.isConnected || trigger.closest('[hidden]')) && this.contains(this.ownerDocument.activeElement) === false) {
      this._part('open')?.focus({ preventScroll: true });
    }
  }

  /** @private "Gỡ": empty value, alt and crop; focus back to the open button */
  _remove() {
    if (this._effectiveDisabled || !this._value) return;
    this._applyLive({ id: '', src: '', previewAlt: '', kind: this._kinds()[0], alt: '', cropRaw: null, asset: null });
    this._emit('input');
    this._emit('change');
    this._part('open')?.focus();
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
    const entries = fieldEntries(this.getAttribute('name'), { id: this._value, alt: this._alt, cropRaw: this._cropRaw }, this.hasAttribute('usage'));
    if (first && !this._ssrHiddenOk(hidden, entries)) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = [...tpl.content.children];
    if (rest.length !== want.length) return false;
    return want.every((w, i) => {
      const live = rest[i];
      if (live.localName !== w.localName || live.namespaceURI !== w.namespaceURI) return false;
      if (w.classList.contains('td-media-field__usage')) return this._ssrUsageOk(live, w, first, entries);
      return ssrSamePart(live, w);
    });
  }

  /** @private reference: one value input; usage: value (`name[id]`) + crop (`name[crop]`); none when not submitted */
  _ssrHiddenOk(hidden, entries) {
    const expect = (entries || []).filter(([k]) => !(this.hasAttribute('usage') && k.endsWith('[alt]')));
    if (hidden.length !== expect.length) return false;
    return hidden.every((h, i) => ssrClassKey(h) === (i === 0 ? 'td-media-field__value' : 'td-media-field__crop')
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
