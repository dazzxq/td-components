/**
 * v0.32.0 (plan v0.32.0-media-picker M1) — the pure core of `<td-media-picker>`: the adapter contract (JSDoc typedefs,
 * names / fields of the dsuite contract `17-codex-media-picker-r2.md` §2-3 — FINAL from v0.32), DTO normalisation,
 * error normalisation, capabilities, option resolution, list requests, latest-request-wins, selection, the initialIds
 * transaction, debounce, per-session caches and typed option tokens. No DOM, no globals.
 *
 * ADR 0013: the kit owns the reusable interaction shell; the APP owns endpoints, envelopes, auth, permissions, DTO
 * mapping, upload security and storage. The adapter is an object of callbacks — never an endpoint string.
 *
 * v0.33.0 (plan v0.33.0-media-picker-dcms-parity M1) — additive only (decision 3): `uploadFromUrl`, the
 * `uploadFromUrl` / `copyLink` capabilities, `pagination: 'cursor'|'pages'` + `MediaListRequest.page`, `upload.acceptLabel`,
 * page size 30; pure helpers for URL upload (`validateRemoteUrl`), delete / download results, filenames, default titles,
 * upload results and paging (`PageState`). v0.32 adapters keep working unchanged.
 *
 * @module utils/media-picker-core
 */

/** @typedef {string|number|boolean|null} Scalar */
/** @typedef {Scalar|Scalar[]} FilterValue */

/**
 * @typedef {object} MediaListRequest
 * @property {string} query
 * @property {Record<string, FilterValue>} filters
 * @property {string|null} cursor opaque to the kit (always null in `pagination: 'pages'` mode)
 * @property {number} [page] v0.33 addition: 1-based page number, sent ONLY in `pagination: 'pages'` mode (decision 13)
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
 * @property {boolean} uploadFromUrl v0.33: inferred `!!adapter.uploadFromUrl`; `false` hides the URL tab (decision 22)
 * @property {boolean} copyLink v0.33: default false (no method needed; copies the DISPLAY url `urls.preview`, decision 27)
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
 * @property {number} [total] integer ≥ 0; REQUIRED in `pagination: 'pages'` mode (missing → warned once, cursor UI)
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
 * @property {(url: string, o: { fields: Record<string, unknown>, context?: unknown, signal: AbortSignal,
 *   onProgress?(p: UploadProgress): void }) => Promise<UploadResult>} [uploadFromUrl] v0.33 (decision 22): `url` is the
 *   normalised `href` of `validateRemoteUrl` (UX only — the SERVER must block SSRF, decision 23)
 * @property {(id: string, o: { context?: unknown, signal: AbortSignal }) => Promise<DeleteResult>} [delete] the SERVER
 *   checks usage + permission; the kit never does (decision 24)
 * @property {(id: string, o: { rendition: 'original', context?: unknown, signal: AbortSignal })
 *   => Promise<DownloadResult>} [download] decision 25 (a blob is only ever downloaded, never opened)
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
 * @property {{ enabled: boolean, aspectRatio?: number, allowFocalPoint?: boolean }} [crop] v0.35: single mode + an image ⇒
 *   "Chèn" opens the crop step (`td-cropper`); `usage.crop` / `focalPoint` are then filled (`resolveOptions` → `cropResolved`)
 * @property {string} [initialQuery]
 * @property {Record<string, FilterValue>} [initialFilters]
 * @property {unknown} [context]
 * @property {string} [locale]
 * @property {Partial<Record<string, string|((params: unknown) => string)>>} [messages]
 * @property {string} [title] v0.32 addition (default: `defaultTitle(selection.kinds, labels)`, v0.33 decision 6)
 * @property {number} [pageSize] v0.32 addition: 1-100 (default 30 since v0.33, was 40) → `limit`
 * @property {'cursor'|'pages'} [pagination] v0.33 addition (default 'cursor'; also via configureDefaults, decision 13)
 * @property {{ accept?: string, maxSize?: string, multiple?: boolean, acceptLabel?: string }} [upload] v0.32 addition
 *   (→ td-dropzone); v0.33 `acceptLabel`: badge TEXT only, never a filter (decision 21)
 */

export const KINDS = Object.freeze(['image', 'video', 'file']);
export const STATUSES = Object.freeze(['pending', 'processing', 'ready', 'failed', 'archived']);
export const TONES = Object.freeze(['neutral', 'info', 'success', 'warning', 'danger']);
export const ERROR_CODES = Object.freeze(['validation', 'unauthorized', 'forbidden', 'conflict', 'not-found', 'rate-limited',
  'network', 'server']);
export const CONTROLS = Object.freeze(['text', 'textarea', 'url', 'select', 'multiselect', 'date', 'readonly']);
export const FACET_TYPES = Object.freeze(['single', 'multiple', 'toggle']);
const CAP_KEYS = ['search', 'upload', 'editMetadata', 'delete', 'downloadOriginal', 'uploadFromUrl', 'copyLink'];
const CAP_METHOD = { upload: 'upload', editMetadata: 'update', delete: 'delete', downloadOriginal: 'download',
  uploadFromUrl: 'uploadFromUrl' };
const RETRYABLE = new Set(['network', 'rate-limited', 'server']);
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TEXT_MAX = 200;
const ID_MAX = 512;
export const PAGE_SIZE_DEFAULT = 30; // v0.33 decision 13 (dcms2); was 40
export const PAGINATION_MODES = Object.freeze(['cursor', 'pages']);

/**
 * Bounds on adapter payloads before anything reaches the DOM (review SEC-3): extras are dropped (one warning per call,
 * counts only — never the raw data). `text` = code points of a display string (asset name / alt / labels / help text).
 */
export const LIMITS = Object.freeze({ pageItems: 100, text: 500, badges: 10, facets: 20, options: 200, fields: 50 });
/**
 * Review SEC-3 r2: how many raw entries are INSPECTED at most (4 × the cap) — scanning stops there whatever was accepted,
 * so a 1e6-entry array costs the same as a small one.
 */
const BUDGET = 4;

/**
 * Per-control size limits of a metadata value before it is assigned to a form control (review SEC-3 r2): string length
 * (text / textarea / url / select / date / readonly) or item count (multiselect). Over the limit → the field is locked in
 * the edit form with a kit message: never truncated, never assigned, never saved.
 */
export const VALUE_LIMITS = Object.freeze({ text: 10000, textarea: 100000, url: 2048, select: 10000, date: 64, readonly: 10000,
  multiselect: 200 });

/** First `max` code points (no trim). @param {string} s @param {number} [max] */
const capText = (s, max = LIMITS.text) => (s.length <= max ? s : [...s].slice(0, max).join(''));

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
export function normalizeAsset(raw, { safeUrl, metadataKeys = null }) {
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
      name: capText(str(o.name)),
      mimeType: capText(str(o.mimeType)),
      byteSize: typeof o.byteSize === 'number' && Number.isFinite(o.byteSize) && o.byteSize >= 0 ? o.byteSize : 0,
      urls: { thumbnail: safeUrl(urls.thumbnail), preview: safeUrl(urls.preview) },
      metadata: pickMetadata(o.metadata, metadataKeys),
    };
    if (typeof o.version === 'string' || (typeof o.version === 'number' && Number.isFinite(o.version))) a.version = o.version;
    const w = finitePos(o.width);
    const h = finitePos(o.height);
    if (w !== undefined) a.width = w;
    if (h !== undefined) a.height = h;
    if (typeof o.createdAt === 'string' && o.createdAt && o.createdAt.length <= 64) a.createdAt = o.createdAt;
    if (typeof o.uploadedByLabel === 'string' && o.uploadedByLabel) a.uploadedByLabel = capText(o.uploadedByLabel);
    if (typeof o.defaultAltText === 'string') a.defaultAltText = capText(o.defaultAltText);
    if (Array.isArray(o.badges)) {
      a.badges = o.badges.slice(0, LIMITS.badges * BUDGET).filter((b) => isObj(b) && typeof b.label === 'string' && b.label)
        .slice(0, LIMITS.badges)
        .map((b) => ({ key: capText(str(b.key)), label: capText(b.label), tone: TONES.includes(b.tone) ? b.tone : 'neutral' }));
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

/**
 * Review SEC-3 r2: copy ONLY the metadata keys of the normalised asset field descriptors (never the whole object; own
 * properties only, `__proto__` / `constructor` / `prototype` never).
 * @param {unknown} meta @param {Iterable<string>|null} keys @returns {Record<string, unknown>}
 */
function pickMetadata(meta, keys) {
  const out = {};
  if (!isObj(meta) || !keys) return out;
  let n = 0;
  for (const k of keys) {
    if (++n > LIMITS.fields) break;
    if (typeof k !== 'string' || BAD_KEYS.has(k) || !Object.prototype.hasOwnProperty.call(meta, k)) continue;
    out[k] = meta[k];
  }
  return out;
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
 * @param {{ safeUrl: (u: unknown) => string, kinds?: string[]|null, limit?: number, warn?: (...a: unknown[]) => void,
 *   metadataKeys?: Iterable<string>|null, pagination?: 'cursor'|'pages' }} opts
 *   `limit` = the request's limit: at most min(limit, LIMITS.pageItems) items are read (review SEC-3)
 * @returns {{ items: MediaAsset[], nextCursor: string|null, total: number|undefined, hidden: number,
 *   pagesFallback?: boolean }} `pagesFallback` (pages mode only): true when `total` is missing / invalid
 */
export function normalizePage(raw, { safeUrl, kinds = null, limit, metadataKeys = null, warn = console.warn, pagination = 'cursor' }) {
  if (!isObj(raw) || !Array.isArray(/** @type {any} */ (raw).items)) throw contractError('server');
  const o = /** @type {any} */ (raw);
  const seen = new Set();
  const items = [];
  let invalid = 0;
  let hidden = 0;
  const cap = Math.min(Number.isInteger(limit) && limit >= 1 ? limit : LIMITS.pageItems, LIMITS.pageItems);
  if (o.items.length > cap) warn(`td-media-picker: the adapter page has ${o.items.length} items — only the first ${cap} are used.`);
  for (const r of o.items.slice(0, cap)) {
    const a = normalizeAsset(r, { safeUrl, metadataKeys });
    if (!a) { invalid += 1; continue; }
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (kinds && kinds.length && !kinds.includes(a.kind)) { hidden += 1; continue; }
    items.push(a);
  }
  if (invalid) warn(`td-media-picker: ${invalid} invalid asset(s) dropped from the adapter page.`);
  const nextCursor = typeof o.nextCursor === 'string' && o.nextCursor ? o.nextCursor : null;
  const total = Number.isInteger(o.total) && o.total >= 0 ? o.total : undefined;
  // v0.33 decision 13: pages mode needs `total` — missing / invalid → the caller falls back to the cursor UI
  // (`PageState` warns once). The flag only exists in pages mode, so the v0.32 shape is unchanged.
  if (pagination === 'pages') return { items, nextCursor, total, hidden, pagesFallback: total === undefined };
  return { items, nextCursor, total, hidden };
}

/**
 * Raw options → valid `{ value, label, count?, disabled }`, at most LIMITS.options, labels capped (review SEC-3).
 * @param {unknown} list @param {{ dropped?: number }} [stat] counts the options cut by the cap
 * @returns {FacetOption[]}
 */
export function normalizeOptions(list, stat) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const budget = Math.min(list.length, LIMITS.options * BUDGET);
  for (let i = 0; i < budget && out.length < LIMITS.options; i++) {
    const op = list[i];
    if (!isObj(op) || !isScalar(op.value) || typeof op.label !== 'string') continue;
    const o = { value: op.value, label: capText(op.label) };
    if (Number.isInteger(op.count) && op.count >= 0) o.count = op.count;
    o.disabled = op.disabled === true;
    out.push(o);
  }
  if (stat && list.length > out.length && (out.length >= LIMITS.options || budget < list.length)) {
    stat.dropped = (stat.dropped || 0) + 1; // something past the cap / the inspection budget was ignored
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
  let over = 0;
  const stat = { dropped: 0 };
  const budget = Math.min(raw.length, LIMITS.facets * BUDGET);
  if (raw.length > budget) over += raw.length - budget;
  for (let i = 0; i < budget; i++) {
    const f = raw[i];
    if (!isObj(f) || typeof f.key !== 'string' || !f.key || f.key.length > 200 || keys.has(f.key) || typeof f.label !== 'string'
      || !FACET_TYPES.includes(f.type)) { dropped += 1; continue; }
    if (out.length >= LIMITS.facets) { over += budget - i; break; }
    keys.add(f.key);
    out.push({ key: f.key, label: capText(f.label), type: f.type, options: normalizeOptions(f.options, stat) });
  }
  if (dropped) warn(`td-media-picker: ${dropped} invalid / duplicate facet descriptor(s) ignored.`);
  if (over || stat.dropped) {
    warn(`td-media-picker: facets over the limits ignored (${over} facet(s) past ${LIMITS.facets} / the inspection budget, ${stat.dropped} facet(s) with options past ${LIMITS.options}).`);
  }
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
  let over = 0;
  const stat = { dropped: 0 };
  const budget = Math.min(raw.length, LIMITS.fields * BUDGET);
  if (raw.length > budget) over += raw.length - budget;
  for (let i = 0; i < budget; i++) {
    const f = raw[i];
    if (!isObj(f) || typeof f.key !== 'string' || !f.key || f.key.length > 200 || BAD_KEYS.has(f.key) || keys.has(f.key)
      || typeof f.label !== 'string' || !CONTROLS.includes(f.control)) { dropped += 1; continue; }
    if (out.length >= LIMITS.fields) { over += budget - i; break; }
    keys.add(f.key);
    /** @type {FieldDescriptor} */
    const d = { key: f.key, label: capText(f.label), control: f.control, required: f.required === true };
    if (f.scope === 'upload' || f.scope === 'asset') d.scope = f.scope;
    if (typeof f.helpText === 'string' && f.helpText) d.helpText = capText(f.helpText);
    d.options = normalizeOptions(f.options, stat);
    if (typeof f.loadOptions === 'function') d.loadOptions = f.loadOptions;
    if (typeof f.createOption === 'function') d.createOption = f.createOption;
    if (typeof f.visibleWhen === 'function') d.visibleWhen = f.visibleWhen;
    out.push(d);
  }
  if (dropped) warn(`td-media-picker: ${dropped} invalid / duplicate field descriptor(s) ignored.`);
  if (over || stat.dropped) {
    warn(`td-media-picker: field descriptors over the limits ignored (${over} field(s) past ${LIMITS.fields} / the inspection budget, ${stat.dropped} field(s) with options past ${LIMITS.options}).`);
  }
  return out;
}

/**
 * @typedef {{ code: string, userMessage: string, fieldErrors: Map<string, string[]>, retryable: boolean }} NormalizedError
 */

/**
 * Adapter rejection → what the UI may show (decision 8), or null for an abort (silent). The text shown is ONLY
 * `userMessage` (trimmed, 200 code points) — never `message` (raw exception / SQL). Unknown `code` → 'server'.
 * `fieldErrors`: own string keys (no `__proto__` / `constructor` / `prototype`), arrays of non-empty strings (≤ 5,
 * each ≤ 200). `warn` gets ONE string: the operation + the normalised code — never the raw error (review SEC-2).
 * @param {unknown} err
 * @param {AbortSignal|null|undefined} signal
 * @param {{ warn?: (...a: unknown[]) => void, operation?: string }} [opts]
 * @returns {NormalizedError|null}
 */
export function normalizeError(err, signal, { warn = console.warn, operation = 'adapter call' } = {}) {
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
  // review SEC-2: never the raw error (message / response / URL may carry tokens or server internals) — operation + code
  try { warn(`td-media-picker: ${String(operation).slice(0, 60)} failed (${code})`); } catch { /* ignore */ }
  return { code, userMessage, fieldErrors, retryable: retryable ?? RETRYABLE.has(code) };
}

/**
 * Effective capabilities (decisions 2, 5): a flag is on only when the method exists AND the flag is not false. Missing
 * flags are inferred: search true, upload = !!adapter.upload, editMetadata = !!adapter.update, uploadFromUrl =
 * !!adapter.uploadFromUrl (v0.33); delete / downloadOriginal stay false unless the site sets them true (destructive /
 * egress actions are an explicit opt-in — a v0.32 adapter that merely HAS the method shows nothing new); copyLink
 * (v0.33, no method) false unless set true. Only booleans count. Presentation hints only — the server still authorises
 * every call.
 * @param {MediaPickerAdapter} adapter
 * @param {Partial<MediaCapabilities>|null|undefined} caps
 * @returns {MediaCapabilities}
 */
export function resolveCapabilities(adapter, caps) {
  const c = isObj(caps) ? caps : {};
  const has = (m) => !!adapter && typeof adapter[m] === 'function';
  const inferred = { search: true, upload: has('upload'), editMetadata: has('update'), delete: false, downloadOriginal: false,
    uploadFromUrl: has('uploadFromUrl'), copyLink: false };
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

const CROP_RATIO_MIN = 0.01; // review R1 #5: public range [0.01, 100] (= media-field-model CROP_RATIO_MIN / MAX)
const CROP_RATIO_MAX = 100;
let warnedCropRatio = false;
let warnedCropMultiple = false;

/**
 * Resolve the options of one open (decision 6): `defaults`, then each layer in INCREASING priority (shallow merge per
 * key; an `undefined` value never overrides). `selection` never comes from `defaults`. Normalises `selection`,
 * `pageSize` (1-100, default 30), `pagination` ('cursor' | 'pages', invalid → warned + 'cursor'), `upload` (+ text
 * `acceptLabel`), `messages`, `crop` (v0.35 decision 23 → `cropResolved = { aspectRatio, allowFocalPoint } | null`: a bad
 * `aspectRatio` warns once ⇒ free; `selection.mode = 'multiple'` warns once ⇒ no crop; unknown keys ignored). No valid adapter → TypeError (a
 * programming error).
 * @param {object|null|undefined} defaults
 * @param {...(object|null|undefined)} layers last argument may be `{ warn }` only when it is the sole key
 * @returns {OpenMediaPickerOptions & { cropResolved: { aspectRatio: number|null, allowFocalPoint: boolean } | null,
 *   capabilitiesResolved: MediaCapabilities }}
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
  let cropResolved = null;
  if (isObj(merged.crop) && merged.crop.enabled === true) {
    if (mode === 'multiple') {
      if (!warnedCropMultiple) {
        warnedCropMultiple = true;
        try { warn("td-media-picker: crop needs selection.mode = 'single' — crop ignored for this multiple picker."); } catch { /* ignore */ }
      }
    } else {
      const ar = merged.crop.aspectRatio;
      let aspectRatio = null;
      if (ar !== undefined && ar !== null) {
        if (typeof ar === 'number' && Number.isFinite(ar) && ar >= CROP_RATIO_MIN && ar <= CROP_RATIO_MAX) aspectRatio = ar;
        else if (!warnedCropRatio) {
          warnedCropRatio = true;
          try { warn('td-media-picker: crop.aspectRatio must be a number in [0.01, 100] — rejected, the crop step is free.'); } catch { /* ignore */ }
        }
      }
      cropResolved = { aspectRatio, allowFocalPoint: merged.crop.allowFocalPoint === true };
    }
  }
  let pagination = 'cursor';
  if (merged.pagination !== undefined) {
    if (PAGINATION_MODES.includes(merged.pagination)) pagination = merged.pagination;
    else {
      try { warn("td-media-picker: options.pagination must be 'cursor' or 'pages' — using 'cursor'."); } catch { /* ignore */ }
    }
  }
  const filters = isObj(merged.initialFilters) ? { ...merged.initialFilters } : {};
  return {
    ...merged,
    selection: { mode, maxItems, initialIds: maxItems ? ids.slice(0, maxItems) : ids, kinds: kinds.length ? kinds : null },
    pageSize,
    pagination,
    upload: {
      accept: typeof up.accept === 'string' ? up.accept : '',
      maxSize: typeof up.maxSize === 'string' ? up.maxSize : '',
      multiple: up.multiple !== false,
      acceptLabel: typeof up.acceptLabel === 'string' ? cut(up.acceptLabel) : '',
    },
    messages: isObj(merged.messages) ? merged.messages : {},
    initialQuery: typeof merged.initialQuery === 'string' ? merged.initialQuery : '',
    initialFilters: filters,
    assetFields: Array.isArray(merged.assetFields) ? merged.assetFields : [],
    uploadFields: Array.isArray(merged.uploadFields) ? merged.uploadFields : [],
    title: typeof merged.title === 'string' ? merged.title : '',
    locale: typeof merged.locale === 'string' ? merged.locale : '',
    cropResolved,
    capabilitiesResolved: resolveCapabilities(merged.adapter, merged.capabilities),
  };
}

/** Test hook: forget the one-time crop warnings. */
export function _resetCoreWarnings() { warnedCropRatio = false; warnedCropMultiple = false; }

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
 * @param {{ cursor?: string|null, page?: number, signal?: AbortSignal }} [o] `page` (v0.33, pages mode): an integer ≥ 1 →
 *   `request.page` and `cursor: null`; anything else → no `page` key (cursor mode, the v0.32 shape)
 * @returns {MediaListRequest}
 */
export function buildListRequest(state, { cursor = null, page, signal } = {}) {
  const pages = Number.isInteger(page) && page >= 1;
  const filters = {};
  for (const [k, v] of Object.entries(state.filters || {})) filters[k] = Array.isArray(v) ? v.slice() : v;
  const req = {
    query: typeof state.query === 'string' ? state.query.trim() : '',
    filters,
    cursor: !pages && typeof cursor === 'string' && cursor ? cursor : null,
    limit: state.pageSize,
    kinds: state.kinds && state.kinds.length ? state.kinds.slice() : null,
    signal: /** @type {AbortSignal} */ (signal),
  };
  if (pages) req.page = page;
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
 * Cache key of a list (or facet) request: query + typed filters + cursor + limit + kinds + page (v0.33, pages mode).
 * @param {{ query?: string, filters?: object, pageSize?: number, kinds?: string[]|null }} state
 * @param {string|null} [cursor]
 * @param {number|null} [page]
 * @returns {string}
 */
export function requestKey(state, cursor = null, page = null) {
  return JSON.stringify([typeof state.query === 'string' ? state.query.trim() : '', filtersKey(state.filters), cursor || null,
    state.pageSize ?? null, state.kinds || null, Number.isInteger(page) && page >= 1 ? page : null]);
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
        else this._warn(`td-media-picker: an initial id could not be loaded (${i + 1} of ${this._ids.length}).`);
        settle();
      }, (err) => {
        if (!live()) return;
        void err; // review SEC-2: never logged raw
        this._warn(`td-media-picker: an initial id could not be loaded (${i + 1} of ${this._ids.length}).`);
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
 * focalPoint: null }`. v0.35 (decision 25): `usageById` (a Map id → `{ crop?, focalPoint? }`, from the crop step) fills
 * `crop` / `focalPoint` of that asset (missing ⇒ null).
 * @param {SelectionModel} model
 * @param {Map<string, { crop?: UsageDraft['crop'], focalPoint?: UsageDraft['focalPoint'] }>} [usageById]
 * @returns {PickerOutcome}
 */
export function buildOutcome(model, usageById) {
  return {
    status: 'selected',
    selection: model.assets.map((asset) => {
      const u = usageById instanceof Map ? usageById.get(asset.id) : undefined;
      return {
        assetId: asset.id,
        asset,
        usage: {
          altText: typeof asset.defaultAltText === 'string' ? asset.defaultAltText : '',
          crop: u?.crop ?? null,
          focalPoint: u?.focalPoint ?? null,
        },
      };
    }),
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

// ---------------------------------------------------------------------------------------------------------------------
// v0.33.0 (plan v0.33.0-media-picker-dcms-parity, M1)

/** Longest remote URL accepted by the URL upload tab (decision 22, invariant 31d). */
export const REMOTE_URL_MAX = 2048;

/**
 * Client-side check of the URL typed in the "Tải từ URL" tab (decision 22). **UX only, not security**: private hosts /
 * loopback / metadata IPs are NOT blocked here (DNS rebinding + redirects defeat a client check) — the SERVER must block
 * SSRF (decision 23). Steps, in this order:
 * 1. trim (non-string → '');
 * 2. empty → `'empty'` (the submit button stays disabled; show NO error);
 * 3. > 2048 characters → `'too-long'` ("URL quá dài");
 * 4. `new URL()` throws → `'invalid'` ("URL không hợp lệ");
 * 5. scheme not `http:` / `https:` → `'scheme'` ("Chỉ nhận http hoặc https");
 * 6. `username` or `password` → `'credentials'` ("URL không được chứa thông tin đăng nhập");
 * 7. empty hostname → `'invalid'`.
 * The rules run AFTER WHATWG normalisation: `http:///x` → `http://x/`, `https://@h/` → `https://h/` are valid; an IDN
 * becomes punycode. Send `href` (the normalised form), never the raw input.
 * @param {unknown} s
 * @returns {{ ok: true, href: string } | { ok: false, code: 'empty'|'too-long'|'invalid'|'scheme'|'credentials' }}
 */
export function validateRemoteUrl(s) {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return { ok: false, code: 'empty' };
  if (t.length > REMOTE_URL_MAX) return { ok: false, code: 'too-long' };
  let u;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, code: 'invalid' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, code: 'scheme' };
  if (u.username || u.password) return { ok: false, code: 'credentials' };
  if (!u.hostname) return { ok: false, code: 'invalid' };
  if (u.href.length > REMOTE_URL_MAX) return { ok: false, code: 'too-long' }; // punycode / percent-encoding grew it
  return { ok: true, href: u.href };
}

const USAGES_MAX = 50;
const HREF_MAX = 8192;
const isPlain = (v) => isObj(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const hasBadOwnKey = (o) => Object.getOwnPropertyNames(o).some((k) => BAD_KEYS.has(k));

/**
 * Raw `adapter.delete()` result → a normalised `DeleteResult` (decision 24), or THROWS `contractError('server')` for
 * any other shape (the picker then shows the generic error; never the raw value).
 * - `{ status: 'deleted', id }` — `id` must equal the requested id (strict string) → `{ status: 'deleted', id }`.
 * - `{ status: 'blocked', reason: 'in-use', usageCount, usages, truncated? }` → `usageCount` an integer ≥ 0; `usages` a
 *   real array — only the first 50 are inspected / kept (`truncated: true` when more were sent); each item a plain
 *   object without own `__proto__` / `constructor` / `prototype`, with `id` (non-empty string, or an integer →
 *   string) and a non-empty `label` (trimmed, 200 code points); optional `kind` (string, 200 code points) and `href`
 *   (string). A bad item rejects the WHOLE result. `truncated` kept only when boolean. Consistency: `usageCount` ≥ the
 *   number of summaries sent; `truncated: true` needs `usageCount` > that number, `truncated: false` needs it equal —
 *   otherwise the whole result is malformed. A count with no summaries (`usages: []`) is valid.
 * - `href`: by default passed through RAW (≤ 8 KiB) — the renderer MUST gate it with `safeLinkUrl` (invariant 31b).
 *   With `opts.safeLink` (e.g. `safeLinkUrl`) it is gated here instead: refused (`''`) → the key is dropped.
 * The kit never checks usage itself: the server decides and answers `blocked`.
 * @param {unknown} raw
 * @param {string} id the id that was deleted
 * @param {{ safeLink?: (u: string) => string }} [opts]
 * @returns {DeleteResult}
 */
export function normalizeDeleteResult(raw, id, { safeLink } = {}) {
  const bad = () => contractError('server', 'media picker: malformed delete result');
  if (!isObj(raw)) throw bad();
  const o = /** @type {Record<string, any>} */ (raw);
  if (o.status === 'deleted') {
    if (typeof id !== 'string' || !id || o.id !== id) throw bad();
    return { status: 'deleted', id };
  }
  if (o.status !== 'blocked' || o.reason !== 'in-use') throw bad();
  if (!Number.isInteger(o.usageCount) || o.usageCount < 0) throw bad();
  if (!Array.isArray(o.usages)) throw bad();
  // contract consistency (impl review #5): the count covers every listed summary; `truncated` must agree with it
  if (o.usageCount < o.usages.length) throw bad();
  if (o.truncated === true && o.usageCount <= o.usages.length) throw bad();
  if (o.truncated === false && o.usageCount > o.usages.length) throw bad();
  const usages = [];
  for (const u of o.usages.slice(0, USAGES_MAX)) {
    if (!isPlain(u) || hasBadOwnKey(u)) throw bad();
    const uid = typeof u.id === 'string' ? u.id : (Number.isInteger(u.id) ? String(u.id) : '');
    if (!uid || uid.length > ID_MAX || typeof u.label !== 'string') throw bad();
    const label = cut(u.label.slice(0, TEXT_MAX * 8));
    if (!label) throw bad();
    /** @type {UsageSummary} */
    const item = { id: uid, label };
    if (typeof u.kind === 'string' && u.kind.trim()) item.kind = cut(u.kind.slice(0, TEXT_MAX * 8));
    if (typeof u.href === 'string' && u.href && u.href.length <= HREF_MAX) {
      const href = typeof safeLink === 'function' ? safeLink(u.href) : u.href;
      if (typeof href === 'string' && href) item.href = href;
    }
    usages.push(item);
  }
  /** @type {DeleteResult} */
  const out = { status: 'blocked', reason: 'in-use', usageCount: o.usageCount, usages };
  if (o.usages.length > USAGES_MAX) out.truncated = true;
  else if (typeof o.truncated === 'boolean') out.truncated = o.truncated;
  return out;
}

// eslint-disable-next-line no-control-regex
const FILENAME_STRIP = /[/\\:\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * A download filename (decision 25): `/ \ :`, C0 / C1 control characters and bidi controls removed, leading dots
 * dropped, trimmed, 200 code points. Empty → the cleaned `fallback` (e.g. `asset.name`) → `'download'`.
 * @param {unknown} s
 * @param {unknown} [fallback]
 * @returns {string}
 */
export function safeFilename(s, fallback = '') {
  const clean = (v) => (typeof v === 'string' ? cut(v.slice(0, TEXT_MAX * 8).replace(FILENAME_STRIP, '').replace(/^[\s.]+/, '')) : '');
  return clean(s) || clean(fallback) || 'download';
}

/**
 * Raw `adapter.download()` result → what the picker may do with it (decision 25), or THROWS:
 * - `{ url, filename, expiresAt? }` → `{ kind: 'url', url, filename }`: `url` through `safeUrl` (pass `safeMediaUrl`
 *   WITHOUT `allowBlob`) and must come back `http(s):` — `blob:` / `data:` / `javascript:` / refused → `code: 'server'`;
 *   `expiresAt` (ISO string) already past (≤ `now`) → `code: 'expired'` (label "Liên kết tải đã hết hạn"),
 *   unparseable / not a string → `'server'`.
 * - `{ blob, filename }` → `{ kind: 'blob', blob, filename }`: `blob instanceof Blob` required. The picker only ever
 *   DOWNLOADS it (same-origin `<a download>` + revoke), never opens it in a tab.
 * - both / neither / not an object → `'server'`.
 * `filename` → `safeFilename(filename, fallbackName)`. Thrown errors come from `contractError` (`err.code`).
 * @param {unknown} raw
 * @param {{ safeUrl: (u: unknown) => string, fallbackName?: string, now?: number }} opts
 * @returns {{ kind: 'url', url: string, filename: string } | { kind: 'blob', blob: Blob, filename: string }}
 */
export function normalizeDownloadResult(raw, { safeUrl, fallbackName = '', now = Date.now() }) {
  const bad = () => contractError('server', 'media picker: malformed download result');
  if (!isObj(raw)) throw bad();
  const o = /** @type {Record<string, any>} */ (raw);
  const hasUrl = o.url !== undefined;
  const hasBlob = o.blob !== undefined;
  if (hasUrl === hasBlob) throw bad();
  const filename = safeFilename(o.filename, fallbackName);
  if (hasBlob) {
    if (typeof Blob === 'undefined' || !(o.blob instanceof Blob)) throw bad();
    return { kind: 'blob', blob: o.blob, filename };
  }
  const url = typeof o.url === 'string' ? safeUrl(o.url) : '';
  if (typeof url !== 'string' || !/^https?:/i.test(url)) throw bad();
  if (o.expiresAt !== undefined) {
    const t = typeof o.expiresAt === 'string' ? Date.parse(o.expiresAt) : NaN;
    if (!Number.isFinite(t)) throw bad();
    if (t <= now) throw contractError('expired', 'media picker: download link expired');
  }
  return { kind: 'url', url, filename };
}

/** Built-in default titles (decision 6); `labels` / `messages` override them per key. */
export const DEFAULT_TITLES = Object.freeze({ title: 'Chọn media', titleImage: 'Chọn ảnh', titleVideo: 'Chọn video',
  titleFile: 'Chọn tài liệu' });
const TITLE_KEY = { image: 'titleImage', video: 'titleVideo', file: 'titleFile' };

/**
 * The picker title (decision 6): a non-empty `title` (the `open()` option) wins; else by `selection.kinds` — exactly
 * one kind → `titleImage` / `titleVideo` / `titleFile`, anything else → `title` — read from `labels` (non-empty
 * string), falling back to `DEFAULT_TITLES` ("Chọn ảnh" / "Chọn video" / "Chọn tài liệu" / "Chọn media").
 * @param {string[]|null|undefined} kinds
 * @param {Partial<Record<'title'|'titleImage'|'titleVideo'|'titleFile', unknown>>} [labels]
 * @param {unknown} [title]
 * @returns {string}
 */
export function defaultTitle(kinds, labels = {}, title = '') {
  if (typeof title === 'string' && title.trim()) return title;
  const key = Array.isArray(kinds) && kinds.length === 1 && TITLE_KEY[kinds[0]] ? TITLE_KEY[kinds[0]] : 'title';
  const l = isObj(labels) ? labels[key] : undefined;
  if (typeof l === 'string' && l) return l;
  return DEFAULT_TITLES[key];
}

/**
 * Raw `adapter.upload()` / `adapter.uploadFromUrl()` result → `{ asset, deduplication }`, or null when malformed (v0.32
 * #20, impl review #4): the asset must normalise, and `deduplication` must be exactly `{ outcome: 'created' }` or
 * `{ outcome: 'exact-reused', matchedAssetId }` with `matchedAssetId === asset.id`. Extra keys are dropped. The caller
 * warns (never with the raw result) and shows its upload error on null.
 * @param {unknown} raw
 * @param {{ safeUrl: (u: unknown) => string, metadataKeys?: Iterable<string>|null }} opts
 * @returns {UploadResult|null}
 */
export function normalizeUploadResult(raw, { safeUrl, metadataKeys = null }) {
  if (!isObj(raw)) return null;
  const o = /** @type {Record<string, any>} */ (raw);
  const asset = normalizeAsset(o.asset, { safeUrl, metadataKeys });
  const d = isObj(o.deduplication) ? o.deduplication : null;
  if (!asset || !d) return null;
  if (d.outcome === 'created') return { asset, deduplication: { outcome: 'created' } };
  if (d.outcome === 'exact-reused' && d.matchedAssetId === asset.id) {
    return { asset, deduplication: { outcome: 'exact-reused', matchedAssetId: asset.id } };
  }
  return null;
}

/**
 * Paging state of one picker session (decision 13). Pure: it never calls the adapter — it says WHAT to request and is
 * told what came back. Lane B usage:
 *
 * ```js
 * const ps = new PageState({ mode: opts.pagination, pageSize: opts.pageSize });
 * const r = ps.begin('next');                    // 'next' | 'prev' | 'reload' | a page number (pages mode)
 * if (!r) return;                                // refused: cursor mode busy (single-flight) / no such page
 * const req = buildListRequest(state, { cursor: r.cursor, page: r.page, signal });
 * // success: ps.commit(r.token, normalizedPage) → true (false = stale: superseded / reset — ignore the result)
 * // failure / abort: ps.rollback(r.token)       → page + cursor stack unchanged
 * // query / filter change: ps.reset() then ps.begin('reload') (page 1)
 * // after a delete: ps.begin('reload'); commit; then `const back = ps.stepBackIfEmpty(); if (back) load(back);`
 * ```
 *
 * Modes:
 * - `'cursor'` (default): the kit keeps the stack of cursors of visited pages (no `previousCursor` needed); `r.page` is
 *   undefined (never sent). **Single-flight**: while a request is pending, `begin('next' | 'prev')` returns null;
 *   `begin('reload')` supersedes it. The page / stack only move on `commit()`.
 * - `'pages'`: `r.page` = the 1-based page, `r.cursor` = null; **latest-wins** (every `begin()` supersedes the previous
 *   token). Needs a valid `total`; when a committed page has none (or an invalid one) → `ui` becomes `'cursor'` and
 *   ONE warning is logged per PageState; requests keep sending `page`, and `hasNext` = a full page or a `nextCursor`.
 *
 * Read-outs (after a commit): `page`, `total` (integer ≥ 0 or undefined), `from` / `to` (1-based range of the shown
 * items, undefined without total or on an empty page), `pageCount` (pages UI), `hasPrev`, `hasNext`, `visible` (false
 * when everything fits one page → hide the pager), `ui` ('cursor' | 'pages' — which pager to render), `pending`.
 */
export class PageState {
  /**
   * @param {{ mode?: 'cursor'|'pages', pageSize?: number, warn?: (...a: unknown[]) => void }} [o]
   */
  constructor({ mode = 'cursor', pageSize = PAGE_SIZE_DEFAULT, warn = console.warn } = {}) {
    /** @type {'cursor'|'pages'} */
    this.mode = mode === 'pages' ? 'pages' : 'cursor';
    this.pageSize = Number.isInteger(pageSize) && pageSize >= 1 ? pageSize : PAGE_SIZE_DEFAULT;
    this._warn = warn;
    this._warned = false;
    this._token = 0;
    /** @type {{ token: number, target: number, cursor: string|null }|null} */
    this._req = null;
    this.reset();
  }

  /** Back to page 1 (query / filter change): stack + total cleared; a pending request becomes stale. */
  reset() {
    this.page = 1;
    /** @type {Array<string|null>} cursor that fetched page i + 1 */
    this._cursors = [null];
    /** @type {number[]} item count of page i + 1 */
    this._counts = [];
    this._next = null;
    /** @type {number|undefined} */
    this.total = undefined;
    this._count = 0;
    this._fallback = false;
    this._token += 1;
    this._req = null;
  }

  /** @returns {boolean} a request is in flight */
  get pending() { return this._req !== null; }

  /** @returns {'cursor'|'pages'} the pager to render */
  get ui() { return this.mode === 'pages' && !this._fallback ? 'pages' : 'cursor'; }

  /** @returns {number|undefined} */
  get pageCount() {
    return this.total === undefined ? undefined : Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get hasPrev() { return this.page > 1; }

  get hasNext() {
    if (this.mode === 'cursor') return this._next !== null;
    if (this.ui === 'pages') return this.page < /** @type {number} */ (this.pageCount);
    return this._count >= this.pageSize || this._next !== null;
  }

  /** @returns {boolean} false → hide the pager (one page only) */
  get visible() { return this.hasPrev || this.hasNext; }

  /** @returns {number|undefined} */
  get from() {
    if (this.total === undefined || !this._count) return undefined;
    const before = this.mode === 'pages' ? (this.page - 1) * this.pageSize
      : this._counts.slice(0, this.page - 1).reduce((n, c) => n + c, 0);
    return before + 1;
  }

  /** @returns {number|undefined} */
  get to() {
    const f = this.from;
    return f === undefined ? undefined : f + this._count - 1;
  }

  /**
   * Start a page request. Returns null when refused (see the class doc), else `{ token, target, cursor, page }`:
   * `target` = the page that `commit()` will show; `cursor` / `page` go into `buildListRequest()`.
   * @param {'next'|'prev'|'reload'|number} what
   * @returns {{ token: number, target: number, cursor: string|null, page: number|undefined }|null}
   */
  begin(what) {
    let target;
    if (what === 'reload') target = this.page;
    else if (what === 'next') target = this.hasNext ? this.page + 1 : 0;
    else if (what === 'prev') target = this.page > 1 ? this.page - 1 : 0;
    else if (Number.isInteger(what) && what >= 1) {
      if (this.mode === 'cursor' && what !== this.page) return null; // cursors cannot jump
      target = what;
    } else return null;
    if (!target) return null;
    if (this.mode === 'cursor' && this._req && what !== 'reload' && what !== this.page) return null; // single-flight
    let cursor = null;
    if (this.mode === 'cursor') {
      cursor = target === this.page + 1 ? this._next : (this._cursors[target - 1] ?? null);
    }
    const token = ++this._token;
    this._req = { token, target, cursor };
    return { token, target, cursor, page: this.mode === 'pages' ? target : undefined };
  }

  /**
   * The request of `token` succeeded: move to its page. Stale token → false (nothing changes).
   * @param {number} token
   * @param {{ items?: unknown[], count?: number, nextCursor?: string|null, total?: unknown }} result a `normalizePage()`
   *   result (or `{ count }`)
   * @returns {boolean}
   */
  commit(token, result) {
    const req = this._req;
    if (!req || req.token !== token) return false;
    this._req = null;
    const r = isObj(result) ? result : {};
    const count = Array.isArray(r.items) ? r.items.length : (Number.isInteger(r.count) && r.count >= 0 ? r.count : 0);
    this.page = req.target;
    this._count = count;
    this._next = typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : null;
    this.total = Number.isInteger(r.total) && r.total >= 0 ? r.total : undefined;
    if (this.mode === 'cursor') {
      this._cursors.length = req.target;
      this._cursors[req.target - 1] = req.cursor;
      this._counts.length = req.target;
      this._counts[req.target - 1] = count;
    } else {
      this._fallback = this.total === undefined;
      if (this._fallback && !this._warned) {
        this._warned = true;
        try {
          this._warn("td-media-picker: pagination 'pages' needs an integer `total` ≥ 0 from adapter.list() — showing the cursor pager.");
        } catch { /* ignore */ }
      }
    }
    return true;
  }

  /** The request of `token` failed / was aborted: the page and the stack stay. @param {number} token */
  rollback(token) {
    if (this._req && this._req.token === token) this._req = null;
  }

  /**
   * After a delete reload (decision 24): the committed page is empty and is not page 1 → `begin('prev')`; else null.
   * @returns {ReturnType<PageState['begin']>}
   */
  stepBackIfEmpty() {
    if (this._count > 0 || this.page <= 1 || this._req) return null;
    return this.begin('prev');
  }
}
