/**
 * v0.32.0 (plan v0.32.0-media-picker M1) — the pure core of `<td-media-picker>`: the adapter contract (JSDoc typedefs,
 * names / fields of the dsuite contract `17-codex-media-picker-r2.md` §2-3 — FINAL from v0.32), DTO normalisation,
 * error normalisation, capabilities, option resolution, list requests, latest-request-wins, selection, the initialIds
 * transaction, debounce, per-session caches and typed option tokens. No DOM, no globals.
 *
 * ADR 0013: the kit owns the reusable interaction shell; the APP owns endpoints, envelopes, auth, permissions, DTO
 * mapping, upload security and storage. The adapter is an object of callbacks — never an endpoint string.
 *
 * @module utils/media-picker-core
 */

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {Scalar|Scalar[]} FilterValue */

/**
 * @typedef {object} MediaListRequest
 * @property {string} query
 * @property {Record<string, FilterValue>} filters
 * @property {string|null} cursor opaque to the kit
 * @property {number} limit
 * @property {{ key: string, direction: 'asc'|'desc' }} [sort] never set by v0.32 (use a `sort` facet)
 * @property {unknown} [context] passed through, never interpreted
 * @property {Array<'image'|'video'|'file'>|null} [kinds] v0.32 addition: `selection.kinds` (adapters should filter)
 * @property {AbortSignal} signal
 */

/**
 * @typedef {object} MediaCapabilities
 * @property {boolean} search
 * @property {boolean} upload
 * @property {boolean} editMetadata
 * @property {boolean} delete
 * @property {boolean} downloadOriginal
 */

/**
 * @typedef {object} MediaAsset
 * @property {string} id
 * @property {string|number} [version]
 * @property {'image'|'video'|'file'} kind
 * @property {'pending'|'processing'|'ready'|'failed'|'archived'} status
 * @property {string} name
 * @property {string} mimeType
 * @property {number} byteSize
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [createdAt]
 * @property {string} [uploadedByLabel]
 * @property {{ thumbnail: string, preview: string }} urls adapter-provided, display only — NEVER identity
 * @property {string} [defaultAltText]
 * @property {Record<string, unknown>} metadata
 * @property {Array<{ key: string, label: string, tone?: 'neutral'|'info'|'success'|'warning'|'danger' }>} [badges]
 * @property {Partial<MediaCapabilities>} [capabilities] can only NARROW the top-level flags
 */

/**
 * @typedef {object} MediaPage
 * @property {MediaAsset[]} items
 * @property {string|null} nextCursor
 * @property {string|null} [previousCursor] not used by v0.32
 * @property {number} [total]
 */

/** @typedef {{ value: Scalar, label: string, count?: number, disabled?: boolean }} FacetOption */
/** @typedef {{ key: string, label: string, type: 'single'|'multiple'|'toggle', options: FacetOption[] }} FacetDescriptor */

/**
 * @typedef {object} FieldDescriptor
 * @property {string} key
 * @property {string} label
 * @property {'upload'|'asset'} [scope]
 * @property {'text'|'textarea'|'url'|'select'|'multiselect'|'date'|'readonly'} control
 * @property {boolean} [required]
 * @property {string} [helpText]
 * @property {FacetOption[]} [options]
 * @property {(query: string, o: { signal: AbortSignal }) => Promise<FacetOption[]>} [loadOptions]
 * @property {(label: string, o: { signal: AbortSignal }) => Promise<FacetOption>} [createOption]
 * @property {(values: Record<string, unknown>, asset?: MediaAsset) => boolean} [visibleWhen]
 */

/** @typedef {{ loaded: number, total?: number, percent?: number }} UploadProgress */
/**
 * @typedef {object} UploadResult
 * @property {MediaAsset} asset
 * @property {{ outcome: 'created' } | { outcome: 'exact-reused', matchedAssetId: string }} deduplication
 */
/** @typedef {{ id: string, label: string, kind?: string, href?: string }} UsageSummary */
/**
 * @typedef {{ status: 'deleted', id: string } | { status: 'blocked', reason: 'in-use', usageCount: number,
 *   usages: UsageSummary[], truncated?: boolean }} DeleteResult
 */
/** @typedef {{ url: string, filename: string, expiresAt?: string } | { blob: Blob, filename: string }} DownloadResult */

/**
 * @typedef {Error & { code: 'validation'|'unauthorized'|'forbidden'|'conflict'|'not-found'|'rate-limited'|'network'|'server',
 *   userMessage?: string, fieldErrors?: Record<string, string[]>, retryable?: boolean }} MediaAdapterError
 */

/**
 * @typedef {object} MediaPickerAdapter
 * @property {(request: MediaListRequest) => Promise<MediaPage>} list
 * @property {(request: { query: string, filters: Record<string, FilterValue>, context?: unknown, signal: AbortSignal })
 *   => Promise<FacetDescriptor[]>} [facets]
 * @property {(id: string, o: { context?: unknown, signal: AbortSignal }) => Promise<MediaAsset>} get
 * @property {(file: File, o: { fields: Record<string, unknown>, context?: unknown, signal: AbortSignal,
 *   onProgress(p: UploadProgress): void }) => Promise<UploadResult>} [upload]
 * @property {(id: string, patch: { fields: Record<string, unknown>, version?: string|number },
 *   o: { context?: unknown, signal: AbortSignal }) => Promise<MediaAsset>} [update]
 * @property {(id: string, o: { context?: unknown, signal: AbortSignal }) => Promise<DeleteResult>} [delete] v0.32.1
 * @property {(id: string, o: { rendition: 'original', context?: unknown, signal: AbortSignal })
 *   => Promise<DownloadResult>} [download] v0.32.1
 */

/**
 * @typedef {object} UsageDraft
 * @property {string} altText
 * @property {string} [caption]
 * @property {{ normalized: { x: number, y: number, width: number, height: number },
 *   pixels?: { x: number, y: number, width: number, height: number }, aspectRatio?: number } | null} [crop]
 * @property {{ x: number, y: number } | null} [focalPoint]
 */
/** @typedef {{ assetId: string, asset: MediaAsset, usage: UsageDraft }} SelectedMedia */
/**
 * @typedef {{ status: 'selected', selection: SelectedMedia[] }
 *   | { status: 'cancelled', reason: 'close'|'escape'|'programmatic', selection: [] }} PickerOutcome
 */

/**
 * @typedef {object} OpenMediaPickerOptions
 * @property {MediaPickerAdapter} adapter
 * @property {Partial<MediaCapabilities>} [capabilities] missing → inferred from the adapter methods
 * @property {FieldDescriptor[]} [assetFields]
 * @property {FieldDescriptor[]} [uploadFields]
 * @property {{ mode: 'single'|'multiple', maxItems?: number, initialIds?: string[],
 *   kinds?: Array<'image'|'video'|'file'> }} selection
 * @property {{ enabled: boolean, aspectRatio?: number, allowFocalPoint?: boolean }} [crop] v0.33 (warned at v0.32)
 * @property {string} [initialQuery]
 * @property {Record<string, FilterValue>} [initialFilters]
 * @property {unknown} [context]
 * @property {string} [locale]
 * @property {Partial<Record<string, string|((params: unknown) => string)>>} [messages]
 * @property {string} [title] v0.32 addition (default labels.title)
 * @property {number} [pageSize] v0.32 addition: 1-100 (default 40) → `limit`
 * @property {{ accept?: string, maxSize?: string, multiple?: boolean }} [upload] v0.32 addition (→ td-dropzone)
 */

export const KINDS = Object.freeze(['image', 'video', 'file']);
export const STATUSES = Object.freeze(['pending', 'processing', 'ready', 'failed', 'archived']);
export const TONES = Object.freeze(['neutral', 'info', 'success', 'warning', 'danger']);
export const ERROR_CODES = Object.freeze(['validation', 'unauthorized', 'forbidden', 'conflict', 'not-found', 'rate-limited',
  'network', 'server']);
export const CONTROLS = Object.freeze(['text', 'textarea', 'url', 'select', 'multiselect', 'date', 'readonly']);
export const FACET_TYPES = Object.freeze(['single', 'multiple', 'toggle']);
const CAP_KEYS = ['search', 'upload', 'editMetadata', 'delete', 'downloadOriginal'];
const CAP_METHOD = { upload: 'upload', editMetadata: 'update', delete: 'delete', downloadOriginal: 'download' };
const RETRYABLE = new Set(['network', 'rate-limited', 'server']);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TEXT_MAX = 200;
const ID_MAX = 512;
export const PAGE_SIZE_DEFAULT = 40;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const isScalar = (v) => v === null || typeof v === 'string' || typeof v === 'boolean'
  || (typeof v === 'number' && Number.isFinite(v));
const finitePos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
/** First `max` code points of a trimmed string. */
export function cut(s, max = TEXT_MAX) {
  const t = String(s).trim();
  if (t.length <= max) return t;
  return [...t].slice(0, max).join('');
}

/**
 * Raw adapter asset → a normalised copy, or null (no usable id / unknown kind / unknown status / not an object / a
 * throwing getter). URLs go through `safeUrl` (refused → '').
 * @param {unknown} raw
 * @param {{ safeUrl: (u: unknown) => string }} opts
 * @returns {MediaAsset|null}
 */
export function normalizeAsset(raw, { safeUrl }) {
  try {
    if (!isObj(raw)) return null;
    const o = /** @type {Record<string, any>} */ (raw);
    const id = o.id;
    if (typeof id !== 'string' || !id || id.length > ID_MAX) return null;
    if (!KINDS.includes(o.kind) || !STATUSES.includes(o.status)) return null;
    const urls = isObj(o.urls) ? o.urls : {};
    /** @type {MediaAsset} */
    const a = {
      id,
      kind: o.kind,
      status: o.status,
      name: str(o.name),
      mimeType: str(o.mimeType),
      byteSize: typeof o.byteSize === 'number' && Number.isFinite(o.byteSize) && o.byteSize >= 0 ? o.byteSize : 0,
      urls: { thumbnail: safeUrl(urls.thumbnail), preview: safeUrl(urls.preview) },
      metadata: isObj(o.metadata) ? { ...o.metadata } : {},
    };
    if (typeof o.version === 'string' || (typeof o.version === 'number' && Number.isFinite(o.version))) a.version = o.version;
    const w = finitePos(o.width);
    const h = finitePos(o.height);
    if (w !== undefined) a.width = w;
    if (h !== undefined) a.height = h;
    if (typeof o.createdAt === 'string' && o.createdAt) a.createdAt = o.createdAt;
    if (typeof o.uploadedByLabel === 'string' && o.uploadedByLabel) a.uploadedByLabel = o.uploadedByLabel;
    if (typeof o.defaultAltText === 'string') a.defaultAltText = o.defaultAltText;
    if (Array.isArray(o.badges)) {
      a.badges = o.badges.filter((b) => isObj(b) && typeof b.label === 'string' && b.label)
        .map((b) => ({ key: str(b.key), label: b.label, tone: TONES.includes(b.tone) ? b.tone : 'neutral' }));
    }
    if (isObj(o.capabilities)) {
      const caps = {};
      for (const k of CAP_KEYS) if (typeof o.capabilities[k] === 'boolean') caps[k] = o.capabilities[k];
      a.capabilities = caps;
    }
    return a;
  } catch {
    return null;
  }
}

/** An Error carrying a normalised `code` (thrown for malformed adapter results). */
export function contractError(code = 'server', message = 'media picker: malformed adapter result') {
  return Object.assign(new Error(message), { code });
}

/**
 * Raw adapter page → `{ items, nextCursor, total, hidden }`. Duplicate ids in the page → the first; invalid items dropped
 * (one warning); `kinds` given → other kinds hidden (`hidden` = how many). Not an object / `items` not an array → throws
 * an error with `code: 'server'`.
 * @param {unknown} raw
 * @param {{ safeUrl: (u: unknown) => string, kinds?: string[]|null, warn?: (...a: unknown[]) => void }} opts
 * @returns {{ items: MediaAsset[], nextCursor: string|null, total: number|undefined, hidden: number }}
 */
export function normalizePage(raw, { safeUrl, kinds = null, warn = console.warn }) {
  if (!isObj(raw) || !Array.isArray(/** @type {any} */ (raw).items)) throw contractError('server');
  const o = /** @type {any} */ (raw);
  const seen = new Set();
  const items = [];
  let invalid = 0;
  let hidden = 0;
  for (const r of o.items) {
    const a = normalizeAsset(r, { safeUrl });
    if (!a) { invalid += 1; continue; }
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (kinds && kinds.length && !kinds.includes(a.kind)) { hidden += 1; continue; }
    items.push(a);
  }
  if (invalid) warn(`td-media-picker: ${invalid} invalid asset(s) dropped from the adapter page.`);
  const nextCursor = typeof o.nextCursor === 'string' && o.nextCursor ? o.nextCursor : null;
  const total = Number.isInteger(o.total) && o.total >= 0 ? o.total : undefined;
  return { items, nextCursor, total, hidden };
}

/** @param {unknown} list @returns {FacetOption[]} */
function normalizeOptions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const op of list) {
    if (!isObj(op) || !isScalar(op.value) || typeof op.label !== 'string') continue;
    const o = { value: op.value, label: op.label };
    if (Number.isInteger(op.count) && op.count >= 0) o.count = op.count;
    o.disabled = op.disabled === true;
    out.push(o);
  }
  return out;
}

/**
 * Raw facet descriptors → the valid ones (key / label / type / options); duplicate key → the first. One warning when
 * anything was dropped.
 * @param {unknown} raw
 * @param {{ warn?: (...a: unknown[]) => void }} [opts]
 * @returns {FacetDescriptor[]}
 */
export function normalizeFacets(raw, { warn = console.warn } = {}) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const keys = new Set();
  let dropped = 0;
  for (const f of raw) {
    if (!isObj(f) || typeof f.key !== 'string' || !f.key || keys.has(f.key) || typeof f.label !== 'string'
      || !FACET_TYPES.includes(f.type)) { dropped += 1; continue; }
    keys.add(f.key);
    out.push({ key: f.key, label: f.label, type: f.type, options: normalizeOptions(f.options) });
  }
  if (dropped) warn(`td-media-picker: ${dropped} invalid / duplicate facet descriptor(s) ignored.`);
  return out;
}

/**
 * Raw field descriptors → the valid ones; duplicate key → the first; HTML is never accepted (labels / help are text).
 * @param {unknown} raw
 * @param {{ warn?: (...a: unknown[]) => void }} [opts]
 * @returns {FieldDescriptor[]}
 */
export function normalizeFields(raw, { warn = console.warn } = {}) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const keys = new Set();
  let dropped = 0;
  for (const f of raw) {
    if (!isObj(f) || typeof f.key !== 'string' || !f.key || BAD_KEYS.has(f.key) || keys.has(f.key)
      || typeof f.label !== 'string' || !CONTROLS.includes(f.control)) { dropped += 1; continue; }
    keys.add(f.key);
    /** @type {FieldDescriptor} */
    const d = { key: f.key, label: f.label, control: f.control, required: f.required === true };
    if (f.scope === 'upload' || f.scope === 'asset') d.scope = f.scope;
    if (typeof f.helpText === 'string' && f.helpText) d.helpText = f.helpText;
    d.options = normalizeOptions(f.options);
    if (typeof f.loadOptions === 'function') d.loadOptions = f.loadOptions;
    if (typeof f.createOption === 'function') d.createOption = f.createOption;
    if (typeof f.visibleWhen === 'function') d.visibleWhen = f.visibleWhen;
    out.push(d);
  }
  if (dropped) warn(`td-media-picker: ${dropped} invalid / duplicate field descriptor(s) ignored.`);
  return out;
}

/**
 * @typedef {{ code: string, userMessage: string, fieldErrors: Map<string, string[]>, retryable: boolean }} NormalizedError
 */

/**
 * Adapter rejection → what the UI may show (decision 8), or null for an abort (silent). The text shown is ONLY
 * `userMessage` (trimmed, 200 code points) — never `message` (raw exception / SQL). Unknown `code` → 'server'.
 * `fieldErrors`: own string keys (no `__proto__` / `constructor` / `prototype`), arrays of non-empty strings (≤ 5,
 * each ≤ 200). The original error is logged with `warn` (developer tool, never UI).
 * @param {unknown} err
 * @param {AbortSignal|null|undefined} signal
 * @param {{ warn?: (...a: unknown[]) => void }} [opts]
 * @returns {NormalizedError|null}
 */
export function normalizeError(err, signal, { warn = console.warn } = {}) {
  if (signal && signal.aborted) return null;
  let name = '';
  let code;
  let userMessage = '';
  let fieldErrors = new Map();
  let retryable;
  try {
    if (err && (typeof err === 'object' || typeof err === 'function')) {
      const e = /** @type {any} */ (err);
      name = typeof e.name === 'string' ? e.name : '';
      if (name === 'AbortError') return null;
      code = ERROR_CODES.includes(e.code) ? e.code : 'server';
      if (typeof e.userMessage === 'string') userMessage = cut(e.userMessage.slice(0, TEXT_MAX * 8));
      if (isObj(e.fieldErrors)) {
        let n = 0;
        for (const key of Object.keys(e.fieldErrors)) {
          if (BAD_KEYS.has(key) || n >= 50) continue;
          const v = e.fieldErrors[key];
          if (!Array.isArray(v)) continue;
          const msgs = v.filter((m) => typeof m === 'string' && m.trim()).slice(0, 5).map((m) => cut(m.slice(0, TEXT_MAX * 8)));
          if (!msgs.length) continue;
          fieldErrors.set(key, msgs);
          n += 1;
        }
      }
      if (typeof e.retryable === 'boolean') retryable = e.retryable;
    } else {
      code = 'server';
    }
  } catch {
    code = 'server';
    userMessage = '';
    fieldErrors = new Map();
  }
  try { warn('td-media-picker: adapter error', err); } catch { /* ignore */ }
  return { code, userMessage, fieldErrors, retryable: retryable ?? RETRYABLE.has(code) };
}

/**
 * Effective capabilities (decisions 2, 5): a flag is on only when the method exists AND the flag is not false. Missing
 * flags are inferred: search true, upload = !!adapter.upload, editMetadata = !!adapter.update, delete / downloadOriginal
 * false (v0.32 never shows them). Presentation hints only — the server still authorises every call.
 * @param {MediaPickerAdapter} adapter
 * @param {Partial<MediaCapabilities>|null|undefined} caps
 * @returns {MediaCapabilities}
 */
export function resolveCapabilities(adapter, caps) {
  const c = isObj(caps) ? caps : {};
  const has = (m) => !!adapter && typeof adapter[m] === 'function';
  const inferred = { search: true, upload: has('upload'), editMetadata: has('update'), delete: false, downloadOriginal: false };
  const out = /** @type {MediaCapabilities} */ ({});
  for (const k of CAP_KEYS) {
    const flag = typeof c[k] === 'boolean' ? c[k] : inferred[k];
    out[k] = flag && (!CAP_METHOD[k] || has(CAP_METHOD[k]));
  }
  return out;
}

/**
 * Can `action` be offered for `asset`? Method + top-level flag + the per-asset flag not narrowing it.
 * @param {keyof MediaCapabilities} action
 * @param {MediaPickerAdapter} adapter
 * @param {Partial<MediaCapabilities>|null|undefined} caps
 * @param {MediaAsset|null|undefined} asset
 * @returns {boolean}
 */
export function canDo(action, adapter, caps, asset) {
  if (!resolveCapabilities(adapter, caps)[action]) return false;
  return !(asset && isObj(asset.capabilities) && asset.capabilities[action] === false);
}

/** @param {unknown} a @returns {boolean} */
export function isAdapter(a) {
  return !!a && typeof a === 'object' && typeof /** @type {any} */ (a).list === 'function'
    && typeof /** @type {any} */ (a).get === 'function';
}

let warnedCrop = false;

/**
 * Resolve the options of one open (decision 6): `defaults`, then each layer in INCREASING priority (shallow merge per
 * key; an `undefined` value never overrides). `selection` never comes from `defaults`. Normalises `selection`,
 * `pageSize` (1-100, default 40), `upload`, `messages`, `crop` (v0.32: warned once, `cropRequested`). No valid adapter
 * → TypeError (a programming error).
 * @param {object|null|undefined} defaults
 * @param {...(object|null|undefined)} layers last argument may be `{ warn }` only when it is the sole key
 * @returns {OpenMediaPickerOptions & { cropRequested: boolean, capabilitiesResolved: MediaCapabilities }}
 */
export function resolveOptions(defaults, ...layers) {
  let warn = console.warn;
  const last = layers[layers.length - 1];
  if (isObj(last) && Object.keys(last).length === 1 && typeof last.warn === 'function') {
    warn = last.warn;
    layers = layers.slice(0, -1);
  }
  const merged = {};
  const apply = (layer, isDefault) => {
    if (!isObj(layer)) return;
    for (const k of Object.keys(layer)) {
      if (BAD_KEYS.has(k) || (isDefault && k === 'selection') || layer[k] === undefined) continue;
      merged[k] = layer[k];
    }
  };
  apply(defaults, true);
  for (const l of layers) apply(l, false);
  if (!isAdapter(merged.adapter)) {
    throw new TypeError('td-media-picker: options.adapter must implement list() and get().');
  }
  const sel = isObj(merged.selection) ? merged.selection : {};
  const mode = sel.mode === 'multiple' ? 'multiple' : 'single';
  const maxRaw = Number(sel.maxItems);
  const maxItems = mode === 'single' ? 1 : (Number.isInteger(maxRaw) && maxRaw >= 1 ? maxRaw : undefined);
  const ids = [];
  for (const id of Array.isArray(sel.initialIds) ? sel.initialIds : []) {
    if (typeof id === 'string' && id && id.length <= ID_MAX && !ids.includes(id)) ids.push(id);
  }
  const kinds = Array.isArray(sel.kinds) ? [...new Set(sel.kinds.filter((k) => KINDS.includes(k)))] : [];
  const ps = Number(merged.pageSize);
  const pageSize = merged.pageSize === undefined || !Number.isFinite(ps) ? PAGE_SIZE_DEFAULT : Math.min(100, Math.max(1, Math.round(ps)));
  const up = isObj(merged.upload) ? merged.upload : {};
  const cropRequested = isObj(merged.crop) && merged.crop.enabled === true;
  if (cropRequested && !warnedCrop) {
    warnedCrop = true;
    try { warn('td-media-picker: crop UI ships in v0.33 — `crop.enabled` is ignored (usage.crop = null).'); } catch { /* ignore */ }
  }
  const filters = isObj(merged.initialFilters) ? { ...merged.initialFilters } : {};
  return {
    ...merged,
    selection: { mode, maxItems, initialIds: maxItems ? ids.slice(0, maxItems) : ids, kinds: kinds.length ? kinds : null },
    pageSize,
    upload: {
      accept: typeof up.accept === 'string' ? up.accept : '',
      maxSize: typeof up.maxSize === 'string' ? up.maxSize : '',
      multiple: up.multiple !== false,
    },
    messages: isObj(merged.messages) ? merged.messages : {},
    initialQuery: typeof merged.initialQuery === 'string' ? merged.initialQuery : '',
    initialFilters: filters,
    assetFields: Array.isArray(merged.assetFields) ? merged.assetFields : [],
    uploadFields: Array.isArray(merged.uploadFields) ? merged.uploadFields : [],
    title: typeof merged.title === 'string' ? merged.title : '',
    locale: typeof merged.locale === 'string' ? merged.locale : '',
    cropRequested,
    capabilitiesResolved: resolveCapabilities(merged.adapter, merged.capabilities),
  };
}

/** Test hook: forget the one-time crop warning. */
export function _resetCoreWarnings() { warnedCrop = false; }

/**
 * Module-level defaults (decision 6 — `TdMediaPicker.configureDefaults()`): each configure REPLACES the whole object
 * (one call in the site bootstrap; more predictable than a merge). An `adapter` without list() / get() → TypeError and
 * the previous defaults stay. `get()` returns a shallow copy.
 */
export class DefaultsRegistry {
  constructor() { this._d = {}; }

  /** @param {object|null|undefined} obj */
  configure(obj) {
    const next = isObj(obj) ? { ...obj } : {};
    for (const k of Object.keys(next)) if (BAD_KEYS.has(k)) delete next[k];
    if (next.adapter !== undefined && !isAdapter(next.adapter)) {
      throw new TypeError('TdMediaPicker.configureDefaults: adapter must implement list() and get().');
    }
    this._d = next;
  }

  /** @returns {object} */
  get() { return { ...this._d }; }
}

/**
 * The adapter list request for the current query / filters (filters copied one level deep — arrays included — so the
 * adapter can never mutate the picker's state, and the picker never mutates the caller's object). No `sort` in v0.32.
 * @param {{ query?: string, filters?: Record<string, FilterValue>, pageSize: number, context?: unknown, kinds?: string[]|null }} state
 * @param {{ cursor?: string|null, signal?: AbortSignal }} [o]
 * @returns {MediaListRequest}
 */
export function buildListRequest(state, { cursor = null, signal } = {}) {
  const filters = {};
  for (const [k, v] of Object.entries(state.filters || {})) filters[k] = Array.isArray(v) ? v.slice() : v;
  const req = {
    query: typeof state.query === 'string' ? state.query.trim() : '',
    filters,
    cursor: typeof cursor === 'string' && cursor ? cursor : null,
    limit: state.pageSize,
    kinds: state.kinds && state.kinds.length ? state.kinds.slice() : null,
    signal: /** @type {AbortSignal} */ (signal),
  };
  if (state.context !== undefined) req.context = state.context;
  return req;
}

/** Typed, order-insensitive JSON of a filter map (1 and "1" stay distinct). */
function filtersKey(filters) {
  const enc = (v) => (v === null ? 'n' : `${typeof v}:${String(v)}`);
  return Object.keys(filters || {}).sort().map((k) => {
    const v = filters[k];
    return [k, Array.isArray(v) ? v.map(enc) : enc(v)];
  });
}

/**
 * Cache key of a list (or facet) request: query + typed filters + cursor + limit + kinds.
 * @param {{ query?: string, filters?: object, pageSize?: number, kinds?: string[]|null }} state
 * @param {string|null} [cursor]
 * @returns {string}
 */
export function requestKey(state, cursor = null) {
  return JSON.stringify([typeof state.query === 'string' ? state.query.trim() : '', filtersKey(state.filters), cursor || null,
    state.pageSize ?? null, state.kinds || null]);
}

/**
 * One "slot" of requests where only the latest may win (decision 9): `run()` aborts the previous controller and bumps
 * the generation; a result whose generation is old or whose signal is aborted comes back `{ stale: true }` — even when
 * the adapter ignored the signal. The returned Promise never rejects: `{ stale: false, value }` or `{ stale: false, error }`.
 */
export class LatestRequest {
  constructor() {
    this._gen = 0;
    /** @type {AbortController|null} */
    this._ctrl = null;
    this._pending = false;
  }

  /** @returns {boolean} a request of the current generation is running */
  get pending() { return this._pending; }

  /**
   * @template T
   * @param {(signal: AbortSignal) => (T|PromiseLike<T>)} fn
   * @returns {Promise<{ stale: boolean, value?: T, error?: unknown }>}
   */
  run(fn) {
    if (this._ctrl) this._ctrl.abort();
    const gen = ++this._gen;
    const ctrl = new AbortController();
    this._ctrl = ctrl;
    this._pending = true;
    let p;
    try { p = Promise.resolve(fn(ctrl.signal)); } catch (err) { p = Promise.reject(err); }
    const fresh = () => gen === this._gen && !ctrl.signal.aborted;
    const done = () => { if (gen === this._gen) { this._pending = false; this._ctrl = null; } };
    return p.then(
      (value) => { if (!fresh()) return { stale: true }; done(); return { stale: false, value }; },
      (error) => { if (!fresh()) return { stale: true }; done(); return { stale: false, error }; },
    );
  }

  /** Abort the running request; every later settle is stale. */
  abort() {
    this._gen += 1;
    if (this._ctrl) this._ctrl.abort();
    this._ctrl = null;
    this._pending = false;
  }
}

/**
 * The picker's selection (source of truth; the grid only mirrors it): Map id → asset snapshot in SELECTION order.
 * `revision` bumps on every user change (add / remove / toggle / replace / clear that changes something); `update()`
 * (fresh snapshot after upload / update) and `applyInitial()` do not bump it.
 */
export class SelectionModel {
  /** @param {{ mode?: 'single'|'multiple', max?: number }} [o] */
  constructor({ mode = 'single', max } = {}) {
    this.mode = mode === 'multiple' ? 'multiple' : 'single';
    this.max = this.mode === 'single' ? 1 : (Number.isInteger(max) && max >= 1 ? max : Infinity);
    /** @type {Map<string, MediaAsset>} */
    this._map = new Map();
    this.revision = 0;
  }

  get size() { return this._map.size; }
  /** @returns {string[]} */
  get ids() { return [...this._map.keys()]; }
  /** @returns {MediaAsset[]} */
  get assets() { return [...this._map.values()]; }
  /** @param {string} id */
  has(id) { return this._map.has(id); }
  /** @param {string} id */
  get(id) { return this._map.get(id); }
  /** @returns {number} free slots (Infinity when unlimited) */
  get remaining() { return this.max - this._map.size; }

  /** @private */
  _bump() { this.revision += 1; }

  /**
   * Add (single: replace). @param {MediaAsset} asset @returns {boolean} changed
   */
  add(asset) {
    if (!asset || this._map.has(asset.id)) return false;
    if (this.mode === 'single') {
      this._map.clear();
    } else if (this._map.size >= this.max) {
      return false;
    }
    this._map.set(asset.id, asset);
    this._bump();
    return true;
  }

  /** @param {string} id @returns {boolean} changed */
  remove(id) {
    if (!this._map.delete(id)) return false;
    this._bump();
    return true;
  }

  /** @param {MediaAsset} asset @returns {'added'|'removed'|false} */
  toggle(asset) {
    if (this._map.has(asset.id)) return this.remove(asset.id) ? 'removed' : false;
    return this.add(asset) ? 'added' : false;
  }

  /** The selection becomes exactly `asset`. @param {MediaAsset} asset @returns {boolean} changed */
  replace(asset) {
    if (this._map.size === 1 && this._map.has(asset.id)) return false;
    this._map.clear();
    this._map.set(asset.id, asset);
    this._bump();
    return true;
  }

  /** @returns {boolean} changed */
  clear() {
    if (!this._map.size) return false;
    this._map.clear();
    this._bump();
    return true;
  }

  /** Swap the snapshot of a selected asset (no revision change). @param {MediaAsset} asset */
  update(asset) {
    if (asset && this._map.has(asset.id)) this._map.set(asset.id, asset);
  }

  /**
   * Grid cap for the items in view (decision 13): single / unlimited → null; else `cap = max − selected outside the
   * view`; cap ≥ 1 → that, else null (the picker vetoes). Never 0, never 1-for-single.
   * @param {string[]} viewIds
   * @returns {{ gridMax: number|null, remaining: number }}
   */
  capacity(viewIds) {
    const remaining = this.remaining;
    if (this.mode === 'single' || this.max === Infinity) return { gridMax: null, remaining };
    const view = new Set(viewIds);
    let outside = 0;
    for (const id of this._map.keys()) if (!view.has(id)) outside += 1;
    const cap = this.max - outside;
    return { gridMax: cap >= 1 ? cap : null, remaining };
  }

  /**
   * Apply the initialIds result once (decision 15): refused when the revision moved since `rev0`; the assets keep the
   * given order, up to `max`; no revision change.
   * @param {MediaAsset[]} assets
   * @param {number} rev0
   * @returns {boolean}
   */
  applyInitial(assets, rev0) {
    if (this.revision !== rev0) return false;
    for (const a of assets) {
      if (!a || this._map.has(a.id)) continue;
      if (this._map.size >= this.max) break;
      this._map.set(a.id, a);
    }
    return true;
  }
}

/**
 * The initialIds transaction (decision 15): ONE AbortController + generation, `rev0` captured at start; `get()` per id
 * in parallel. When the LAST call settles and the transaction is still valid (generation + revision unchanged), the
 * successful assets are applied ONCE in the original order (failures skipped + warned). `invalidate()` is synchronous
 * (abort + detach; never awaits the adapter): every later settle is observed (no unhandled rejection) and ignored.
 */
export class InitialLoad {
  /**
   * @param {{ ids: string[], model: SelectionModel, get: (id: string, signal: AbortSignal) => Promise<MediaAsset|null>,
   *   onApply?: (assets: MediaAsset[]) => void, onSettle?: () => void, warn?: (...a: unknown[]) => void }} o
   */
  constructor(o) {
    this._ids = o.ids.slice();
    this._model = o.model;
    this._get = o.get;
    this._onApply = o.onApply || (() => {});
    this._onSettle = o.onSettle || (() => {});
    this._warn = o.warn || console.warn;
    this._gen = 0;
    this._ctrl = null;
    this._pending = false;
  }

  /** @returns {boolean} */
  get pending() { return this._pending; }

  start() {
    if (!this._ids.length) return;
    const gen = ++this._gen;
    const ctrl = new AbortController();
    this._ctrl = ctrl;
    this._pending = true;
    const rev0 = this._model.revision;
    const results = new Array(this._ids.length).fill(null);
    let left = this._ids.length;
    const live = () => gen === this._gen && !ctrl.signal.aborted;
    const settle = () => {
      left -= 1;
      if (left > 0 || !live()) return;
      this._pending = false;
      this._ctrl = null;
      const assets = results.filter(Boolean);
      if (this._model.applyInitial(assets, rev0)) this._onApply(assets);
      this._onSettle();
    };
    this._ids.forEach((id, i) => {
      let p;
      try { p = Promise.resolve(this._get(id, ctrl.signal)); } catch (err) { p = Promise.reject(err); }
      p.then((asset) => {
        if (!live()) return;
        if (asset && asset.id === id) results[i] = asset;
        else this._warn(`td-media-picker: initial id "${id}" could not be loaded.`);
        settle();
      }, (err) => {
        if (!live()) return;
        this._warn(`td-media-picker: initial id "${id}" could not be loaded.`, err);
        settle();
      });
    });
  }

  /** Cancel now (synchronous): abort, detach, nothing will be applied. */
  invalidate() {
    if (!this._pending) return;
    this._gen += 1;
    if (this._ctrl) this._ctrl.abort();
    this._ctrl = null;
    this._pending = false;
    this._onSettle();
  }
}

/** Trailing debounce with an injectable clock. */
export class Debouncer {
  /** @param {number} ms @param {{ setTimeout?: Function, clearTimeout?: Function }} [clock] */
  constructor(ms, clock = {}) {
    this.ms = ms;
    this._set = clock.setTimeout || ((fn, t) => setTimeout(fn, t));
    this._clear = clock.clearTimeout || ((id) => clearTimeout(id));
    this._id = null;
    this._fn = null;
  }

  get pending() { return this._fn !== null; }

  /** @param {() => void} fn */
  schedule(fn) {
    this.cancel();
    this._fn = fn;
    this._id = this._set(() => this.flush(), this.ms);
  }

  /** Run the pending call now (nothing pending → nothing). */
  flush() {
    const fn = this._fn;
    this.cancel();
    if (fn) fn();
  }

  cancel() {
    if (this._id !== null) this._clear(this._id);
    this._id = null;
    this._fn = null;
  }
}

/**
 * Per-open caches (decision 9): list pages + facet descriptors by request key, assets by id. Discarded on close; never
 * persisted. After an upload / update: the asset is replaced by id and EVERY list + facet entry is dropped.
 */
export class SessionCache {
  constructor() {
    this._lists = new Map();
    this._facets = new Map();
    this._assets = new Map();
  }

  getList(k) { return this._lists.get(k); }
  setList(k, v) { this._lists.set(k, v); }
  getFacets(k) { return this._facets.get(k); }
  setFacets(k, v) { this._facets.set(k, v); }
  getAsset(id) { return this._assets.get(id); }
  /** @param {MediaAsset} a */
  putAsset(a) { if (a) this._assets.set(a.id, a); }
  invalidateLists() { this._lists.clear(); this._facets.clear(); }
  clear() { this.invalidateLists(); this._assets.clear(); }
}

/**
 * Typed option values ↔ positional string tokens (decision 22): string-based controls (td-dropdown / td-chip-input)
 * compare values as strings (`1` and `"1"` collide); they get `o0`, `o1`… and the scalar is mapped back exactly
 * (`Object.is`).
 */
export class ScalarTokens {
  /** @param {Array<{ value: Scalar }>} [options] */
  constructor(options = []) {
    /** @type {Map<string, Scalar>} */
    this._map = new Map();
    this._n = 0;
    for (const o of options) this.add(o.value);
  }

  /** @returns {string[]} */
  get tokens() { return [...this._map.keys()]; }

  /** @param {Scalar} value @returns {string} its token (existing or new) */
  add(value) {
    const t = this.tokenOf(value);
    if (t !== null) return t;
    const tok = `o${this._n++}`;
    this._map.set(tok, value);
    return tok;
  }

  /** @param {unknown} value @returns {string|null} */
  tokenOf(value) {
    for (const [t, v] of this._map) if (Object.is(v, value)) return t;
    return null;
  }

  /** @param {string} token @returns {Scalar|undefined} */
  valueOf(token) { return this._map.get(token); }

  /** @param {string} token */
  has(token) { return this._map.has(token); }
}

/**
 * `{ status: 'selected', selection }` in selection order; usage v0.32 = `{ altText: defaultAltText ?? '', crop: null,
 * focalPoint: null }`.
 * @param {SelectionModel} model
 * @returns {PickerOutcome}
 */
export function buildOutcome(model) {
  return {
    status: 'selected',
    selection: model.assets.map((asset) => ({
      assetId: asset.id,
      asset,
      usage: { altText: typeof asset.defaultAltText === 'string' ? asset.defaultAltText : '', crop: null, focalPoint: null },
    })),
  };
}

/** @param {'close'|'escape'|'programmatic'} reason @returns {PickerOutcome} */
export function cancelledOutcome(reason) {
  return { status: 'cancelled', reason, selection: [] };
}

/**
 * A UI text: `messages[key]` (string, or a function of `params` — a throw / non-string falls back) over `labels`
 * (dotted keys read nested objects: `error.network`), `{name}` placeholders filled from `params`. Always plain text
 * (the caller uses textContent).
 * @param {object} labels
 * @param {object} messages
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function formatLabel(labels, messages, key, params = {}) {
  const fill = (t) => String(t).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
  const m = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
  if (typeof m === 'string') return fill(m);
  if (typeof m === 'function') {
    try {
      const out = m(params);
      if (typeof out === 'string') return out;
    } catch { /* fall back */ }
  }
  let v = labels;
  for (const part of key.split('.')) v = v && typeof v === 'object' ? v[part] : undefined;
  return typeof v === 'string' ? fill(v) : '';
}
