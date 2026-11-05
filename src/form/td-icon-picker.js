/**
 * <td-icon-picker> (v0.94.0, plan docs/internal/plans/v0.94.0-icons-picker.md §8) — pick ONE registered icon (core or
 * site) for a form field. Trigger = a field-like button (icon + canonical name); popup = a body-portaled small dialog:
 * search box, "Gợi ý" grid (optional), the A–Z grid of every icon (or the `icons` set), caption + status footer.
 *
 *   <td-icon-picker name="menu_icon" label="Icon mục" value="trash" suggestions="home user settings"></td-icon-picker>
 *
 * Value = a registered icon name, stored CANONICAL (alias `x` → `close`); a well-formed name not (yet) registered is
 * kept (shown with data-state="unknown"); anything else → empty + one warning. The server must normalise the POSTed
 * value (php: td_icon_value()). Search metadata (VI label + EN / VI keywords) is loaded lazily on the first open
 * (`TdIconPicker.loadSearchData`, shared by every instance); until then (or when it fails) search runs on names +
 * aliases. Site icons get metadata through `registerIconSearchData()`.
 *
 * DOM: built with createElement / createElementNS + textContent only (no innerHTML anywhere: render() is empty and
 * afterRender() builds the tree) — the same tree php/td.php td_icon_picker() prints (contract icon-picker@1), adopted in
 * place on upgrade (the no-JS hidden input is removed after ElementInternals took the value).
 */
import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { tdIcon, listIcons, resolveIconName } from '../icons/td-icon.js';
import CORE_ICONS, { aliases as CORE_ALIASES } from '../icons/registry.js';
import { validateSearchEntry, validateIconGroups, isSearchText, ICON_SEARCH_LIMITS } from '../icons/icon-search-schema.js';
import { buildIconIndex, isIconIndexCurrent, searchIcons, normalizeIconQuery } from '../utils/icon-search-model.js';
import { placeFloating, isReferenceHidden, watchReference, viewportBox } from '../utils/floating.js';
import { LAYERS, register as registerLayer, bridgeTheme, focusablesIn } from '../utils/layers.js';
import { isCoarsePointer } from '../utils/breakpoints.js';

const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
/** v0.96.1: `none-value` (= php td_icon_picker none_value) */
const NONE_RE = /^[a-z][a-z0-9-]{0,47}$/;
/** v0.96.1: the caption key of the "Không icon" cell (never a valid icon name) */
const NONE_KEY = '\u0000none';
const NONE_CELL = 'td-icon-picker-panel__cell--none';
const FALSY = new Set(['false', '0', 'off']);
/** suggestions kept (= php Td::ICON_PICKER_SUGGESTIONS) */
const MAX_SUGGESTIONS = 24;
/** bytes of a `suggestions` / `icons` attribute string looked at (longer → ignored, = Td::ICON_PICKER_LIST_STRING) */
const MAX_LIST_STRING = 2048;
/** entries of a name list inspected (= Td::ICON_PICKER_LIST_CANDIDATES) */
const MAX_CANDIDATES = 2000;
/** status "{n} icon" after this much quiet typing (screen readers do not queue every keystroke) */
const STATUS_DELAY = 300;
/** extra attributes the server may print on the trigger (the error / description wiring, re-synced on bind) */
const TRIGGER_EXTRA = new Set(['aria-describedby', 'aria-invalid', 'aria-errormessage']);
const HIDDEN_ATTRS = new Set(['type', 'class', 'name', 'value', 'disabled']);

// --- module-level search state (shared by every instance) ---

/** @type {Map<string, object>} site metadata (registerIconSearchData), validated + frozen */
const siteSearch = new Map();
/** @type {Record<string, object>|null} the loaded (validated) metadata of `loadSearchData` */
let loadedSearch = null;
/** @type {Promise<void>|null} the load in flight / done (null after a failure → the next open retries) */
let searchPromise = null;
/** the loader the cache above belongs to (a site replacing the hook reloads) */
let searchLoader = null;
/**
 * The ONE merged metadata object handed to the search index — replaced (new identity) whenever the loaded or the site
 * metadata changes, so isIconIndexCurrent() (identity) sees the change.
 * @type {Readonly<Record<string, object>>|null}
 */
let mergedSearch = null;
/** @type {ReturnType<typeof buildIconIndex>|null} */
let searchIndex = null;

function remerge() {
  mergedSearch = loadedSearch || siteSearch.size
    ? Object.freeze({ ...(loadedSearch || {}), ...Object.fromEntries(siteSearch) })
    : null;
}

/** @returns {ReturnType<typeof buildIconIndex>} the index of the current names / aliases / metadata (rebuilt when stale) */
function currentIndex() {
  const input = { names: listIcons(), aliases: CORE_ALIASES, data: mergedSearch };
  if (!isIconIndexCurrent(searchIndex, input)) searchIndex = buildIconIndex(input);
  return searchIndex;
}

/**
 * Validate a loaded data object entry by entry: bad entries are dropped (one warning with the count), at most
 * ICON_SEARCH_LIMITS.entriesMax entries are looked at.
 * @param {unknown} data
 * @returns {Record<string, object>}
 */
function cleanSearchData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('td-icon-picker: loadSearchData() must resolve to an object');
  const out = {};
  let dropped = 0;
  let seen = 0;
  let over = false;
  // for…in + a counter: no own copy of a huge key list, and the walk stops at the first key over the limit
  for (const name in data) {
    if (!Object.hasOwn(data, name)) continue;
    if (++seen > ICON_SEARCH_LIMITS.entriesMax) { over = true; break; }
    try {
      out[name] = validateSearchEntry(name, data[name]);
    } catch {
      dropped++;
    }
  }
  if (dropped) console.warn(`td-icon-picker: ${dropped} search metadata entr${dropped === 1 ? 'y' : 'ies'} dropped (invalid)`);
  if (over) console.warn(`td-icon-picker: search metadata has more than ${ICON_SEARCH_LIMITS.entriesMax} entries; the rest is ignored`);
  return out;
}

/** @returns {Promise<void>} the loaded metadata (one load shared by every instance; a failed one is retried next time) */
function loadSearch() {
  const loader = TdIconPicker.loadSearchData;
  if (loader !== searchLoader) {
    searchLoader = loader;
    searchPromise = null;
    if (loadedSearch) { loadedSearch = null; remerge(); }
  }
  if (!searchPromise) {
    let p;
    try {
      p = Promise.resolve(typeof loader === 'function' ? loader() : null);
    } catch (err) {
      p = Promise.reject(err);
    }
    // success chain first, then ONE catch: a loader rejection AND a validation throw on the resolved value both clear
    // the cache, so "Thử lại" (and the next open) call the loader again
    const mine = p.then((data) => {
      if (searchLoader !== loader) return;
      loadedSearch = cleanSearchData(data);
      remerge();
    }).catch((err) => {
      if (searchPromise === mine) searchPromise = null;
      throw err;
    });
    searchPromise = mine;
  }
  return searchPromise;
}

/**
 * v0.94.0: search metadata for SITE icons (`{ name: { label, keywords: { en: [...], vi: [...] } } }`, rules of
 * src/icons/icon-search-schema.js). A core icon name or a name that already has site metadata throws; anything invalid
 * throws and NOTHING of the batch is registered; at most 2000 entries per call. Works before or after registerIcons();
 * open pickers see it at their next open.
 * @param {Record<string, {label: string, keywords: {en: string[], vi: string[]}}>} defs
 */
export function registerIconSearchData(defs) {
  if (!defs || typeof defs !== 'object' || Array.isArray(defs)) throw new TypeError('registerIconSearchData: expected an object');
  const names = [];
  for (const name in defs) { // stops at the first key over the limit (no full key list of a huge object)
    if (!Object.hasOwn(defs, name)) continue;
    if (names.length >= ICON_SEARCH_LIMITS.entriesMax) {
      throw new TypeError(`registerIconSearchData: at most ${ICON_SEARCH_LIMITS.entriesMax} entries per call`);
    }
    names.push(name);
  }
  const staged = [];
  for (const name of names) {
    if (Object.hasOwn(CORE_ICONS, name)) throw new Error(`registerIconSearchData: "${name}" is a core icon (its metadata is the kit's)`);
    if (siteSearch.has(name)) throw new Error(`registerIconSearchData: "${name}" already has search metadata`);
    staged.push([name, validateSearchEntry(name, defs[name])]);
  }
  for (const [name, entry] of staged) siteSearch.set(name, entry); // all-or-nothing
  remerge();
}

/** @returns {string} the VI label of `name` (metadata), else the name */
function labelOf(name) {
  const e = mergedSearch && Object.hasOwn(mergedSearch, name) ? mergedSearch[name] : null;
  return e && typeof e.label === 'string' && e.label ? e.label : name;
}

const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/**
 * @element td-icon-picker
 * @attr {string} name / value / label / placeholder / aria-label / helper-text / error-text
 * @attr {boolean} required / disabled / readonly
 * @attr {string} allow-clear — on by default; "false" / "0" / "off" turns it off
 * @attr {string} suggestions — icon names (space / comma), the "Gợi ý" row (max 24)
 * @attr {string} icons — icon names (space / comma): the set of the grid (empty = every registered icon)
 * @attr {string} trigger-text — v0.96.1: "name" (default) | "label": the trigger shows the VI label of the icon
 * @attr {string} value-label — v0.96.1: the label of the server-printed value (php prints it in label mode)
 * @attr {boolean} none-option — v0.96.1: a "Không icon" cell on top of the popup
 * @attr {string} none-value — v0.96.1: the value of that cell (default '' = no icon)
 * @prop {Array<{key: string, label: string, icons: string[]}>|null} groups — v0.96.1: themed groups + a filter row
 *   (wins over `TdIconPicker.groups`)
 * @fires input — `{ value }` on every user change
 * @fires change — `{ value }` on every user change
 */
export class TdIconPicker extends TdFormElement {
  /** v0.94.0: adopts php/td.php td_icon_picker() markup in place (`icon-picker@1`). */
  static hydratable = true;

  /** Texts (Vietnamese); override per site. `placeholder` / `clear` = php Td::ICON_PICKER_LABELS. */
  static labels = {
    placeholder: 'Chọn icon',
    clear: 'Xoá icon',
    panel: 'Chọn icon',
    search: 'Tìm icon',
    searchPlaceholder: 'Tìm icon…',
    suggested: 'Gợi ý',
    all: 'Tất cả icon',
    results: 'Kết quả',
    empty: 'Không tìm thấy icon phù hợp',
    count: '{n} icon',
    loading: 'Đang tải từ khoá tìm kiếm…',
    loadError: 'Không tải được từ khoá — đang tìm theo tên',
    retry: 'Thử lại',
    caption: '{label} · {name}',
    none: 'Không icon',
    noneGroup: 'Bỏ chọn icon',
    filter: 'Lọc theo nhóm',
    filterAll: 'Tất cả',
    ungrouped: 'Khác',
  };

  /**
   * v0.96.1: groups of the whole site — `[{ key, label, icons }]` (see the `groups` property, which wins). Read at every
   * open and after the load of the search data, so it may be assigned inside `loadSearchData`.
   * @type {Array<{key: string, label: string, icons: string[]}>|null}
   */
  static groups = null;

  /** Validation texts (Vietnamese); override per site. */
  static messages = {
    valueMissing: 'Vui lòng chọn icon',
  };

  /**
   * Hook: load the search metadata (`{ name: { label, keywords } }`) — called on the FIRST open of any picker, once for
   * all of them. Replace it for another translation; every entry goes through the shared validator (bad ones dropped).
   * @type {() => Promise<object>}
   */
  static loadSearchData = () => import('../icons/icons-search.js').then((m) => m.default);

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'placeholder', 'readonly', 'allow-clear', 'suggestions', 'icons',
      'error-text', 'aria-label', 'trigger-text', 'value-label', 'none-option', 'none-value'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'readonly']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @private canonical name, a kept unknown name, or '' */
    this._value = '';
    this._valueSet = false;
    /** @private property lists (win over the attributes); null = the attribute */
    this._suggestionsProp = null;
    this._iconsProp = null;
    /** @private v0.96.1: the `groups` property (wins over the static); null = the static */
    this._groupsProp = null;
    /** @private v0.96.1: the filter row's choice ('' = all) */
    this._filterKey = '';
    this._warned = new Set();
    this._panel = null;
    this._layer = null;
    this._unbridge = null;
    this._unwatchRef = null;
    this._posRaf = 0;
    this._statusTimer = 0;
    /** @private open generation: a load finishing after close / reopen never touches the DOM */
    this._gen = 0;
    this._loadState = 'idle';
    this._onDocDown = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (this._panel && !this.contains(t) && !this._panel.contains(t)) this.close({ focus: false });
    };
    this._onReposition = () => {
      if (this._posRaf) return;
      this._posRaf = requestAnimationFrame(() => {
        this._posRaf = 0;
        this._updatePosition();
      });
    };
    this._onResize = () => {
      if (this._panel) this._layout();
      this._onReposition();
    };
  }

  connectedCallback() {
    if (!this._initialized && !this._valueSet) this._value = this._parse(this.getAttribute('value'), true);
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.close({ focus: false });
    super.disconnectedCallback();
  }

  // --- public API ---

  /** @returns {string} the icon name ('' = none) */
  get value() { return this._value; }

  /** Set the value silently (alias → canonical; bad name → '' + warning). */
  set value(v) {
    this._valueSet = true;
    this._value = this._parse(v, true);
    if (this._initialized) this._refresh();
  }

  getValue() { return this.value; }

  setValue(v) { this.value = v; }

  /** @returns {boolean} false when `allow-clear="false|0|off"` */
  get allowClear() { return !FALSY.has(String(this.getAttribute('allow-clear') ?? '').trim().toLowerCase()); }

  set allowClear(v) {
    if (v === false || FALSY.has(String(v).toLowerCase())) this.setAttribute('allow-clear', 'false');
    else this.removeAttribute('allow-clear');
  }

  /** @returns {string[]} the suggestions in use (canonical, registered, ≤ 24) */
  get suggestions() { return this._names('suggestions', MAX_SUGGESTIONS); }

  /** An array of names (wins over the attribute); a string sets the attribute; null → the attribute. */
  set suggestions(v) { this._setList('suggestions', v); }

  /** @returns {string[]} the grid's set (canonical, registered); [] = every icon */
  get icons() { return this._names('icons', MAX_CANDIDATES); }

  /** An array of names (wins over the attribute); a string sets the attribute; null → the attribute. */
  set icons(v) { this._setList('icons', v); }

  /** @returns {boolean} v0.96.1: the "Không icon" cell is on (attribute `none-option`) */
  get noneOption() { return this.hasAttribute('none-option'); }

  set noneOption(v) { this.toggleAttribute('none-option', !!v); }

  /** @returns {string} v0.96.1: the value of the "Không icon" cell ('' = no icon; a bad / registered name → '') */
  get noneValue() { return this._noneValue(); }

  set noneValue(v) {
    if (v == null || v === '') this.removeAttribute('none-value');
    else this.setAttribute('none-value', String(v));
  }

  /** @returns {Array<{key: string, label: string, icons: string[]}>|null} v0.96.1: the property (null = `TdIconPicker.groups`) */
  get groups() { return this._groupsProp; }

  /** An array of `{ key, label, icons }` (wins over the static); null → the static. A wrong structure is ignored (+ one warning). */
  set groups(v) {
    this._groupsProp = v == null ? null : v;
    if (this._panel) this._fill();
  }

  /** @private the effective "Không icon" value: `none-value` when well-formed and not a registered icon name, else '' */
  _noneValue() {
    const raw = this.getAttribute('none-value') || '';
    if (!raw) return '';
    if (!NONE_RE.test(raw)) {
      this._warn(`none:${raw.slice(0, 80)}`, `<td-icon-picker>: none-value "${raw.slice(0, 80)}" is not a valid name; ignored`);
      return '';
    }
    if (resolveIconName(raw)) {
      this._warn(`none:${raw}`, `<td-icon-picker>: none-value "${raw}" is a registered icon name; ignored`);
      return '';
    }
    return raw;
  }

  /** Open the popup (no-op when disabled / read-only / already open). */
  open() {
    if (this._panel || !this._initialized || !this.isConnected || this._locked()) return;
    const trigger = this._trigger();
    if (!trigger) return;
    this._gen++;
    this._paint(); // a site icon registered meanwhile: the trigger follows
    const panel = this._buildPanel();
    this._panel = panel;
    document.body.appendChild(panel);
    this._unbridge = bridgeTheme(panel, this);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', panel.id);
    this._loadMeta(); // first: a replaced loader drops the old metadata before the index is taken
    this._index = currentIndex();
    this._fill();
    panel.setAttribute('data-state', 'open');
    this._layer = registerLayer({
      layer: LAYERS.popover,
      element: panel,
      keyboard: 'boundary',
      onEscape: () => { this.close(); return true; },
      onTab: (e) => this._onTab(e),
      anchor: this,
      onCovered: () => this.close({ focus: false }),
    });
    document.addEventListener('pointerdown', this._onDocDown, true);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('scroll', this._onReposition, true);
    this._unwatchRef = watchReference(trigger, () => this._updatePosition());
    const input = this._p('input');
    if (isCoarsePointer()) {
      // touch: the selected icon (any visible grid) → else the first grid's roving cell → else the search box
      const grids = this._visibleGrids();
      let target = null;
      for (const g of grids) {
        target = g.querySelector('.td-icon-picker-panel__cell[aria-selected="true"]');
        if (target) break;
      }
      target = target || this._rovingCell(grids[0]) || input;
      if (target !== input) this._setRoving(target);
      target.focus({ preventScroll: true });
    } else input.focus({ preventScroll: true });
  }

  /**
   * Close the popup.
   * @param {{ focus?: boolean }} [o] focus = put the focus back on the trigger when it was inside the popup
   */
  close({ focus = true } = {}) {
    const panel = this._panel;
    if (!panel) return;
    this._gen++;
    const hadFocus = panel.contains(document.activeElement);
    this._panel = null;
    this._cells = null;
    this._secs = null;
    this._noneCell = null;
    if (this._layer) { this._layer.release(); this._layer = null; }
    if (this._unbridge) { this._unbridge(); this._unbridge = null; }
    if (this._unwatchRef) { this._unwatchRef(); this._unwatchRef = null; }
    if (this._posRaf) { cancelAnimationFrame(this._posRaf); this._posRaf = 0; }
    clearTimeout(this._statusTimer);
    document.removeEventListener('pointerdown', this._onDocDown, true);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onReposition, true);
    panel.remove();
    const trigger = this._trigger();
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      if (hadFocus && focus && !trigger.disabled && this.isConnected) trigger.focus({ preventScroll: true });
    }
  }

  // --- value ---

  /**
   * @private raw → stored value: '' | canonical registered name | a well-formed unknown name (kept); bad → '' (+ warn)
   * @param {unknown} raw @param {boolean} warn
   */
  _parse(raw, warn) {
    const s = raw == null ? '' : String(raw);
    if (!s) return '';
    const canon = resolveIconName(s);
    if (canon) return canon;
    if (NAME_RE.test(s)) return s;
    if (warn) this._warn(`value:${s.slice(0, 80)}`, `<td-icon-picker>: value "${s.slice(0, 80)}" is not an icon name; treated as empty`);
    return '';
  }

  /** @private state → trigger / clear / popup selection / form */
  _refresh() {
    this._paint();
    this._syncForm();
    if (this._panel) this._markSelected();
  }

  _syncForm() {
    const v = this._value;
    this._setFormValue(v);
    if (this.hasAttribute('required') && !v) this._setValidity({ valueMissing: true }, this._msg('valueMissing'), this._trigger() || undefined);
    else this._setValidity({});
  }

  _captureDefaults() {
    this._defaultValue = this._parse(this.getAttribute('value'), false);
  }

  _restoreDefaults() {
    this.value = this._defaultValue;
  }

  _restoreState(state) {
    if (typeof state === 'string') this.value = state;
  }

  /** @private a user change: set + `input` + `change` (only when it differs) */
  _commit(name) {
    if (name === this._value) return false;
    this._value = name;
    this._refresh();
    this.emit('input', { value: name });
    this.emit('change', { value: name });
    return true;
  }

  /** @private pick a cell: commit, close, focus the trigger */
  _pick(name) {
    if (this._locked()) return;
    this._commit(name);
    this.close({ focus: false });
    const trigger = this._trigger();
    if (trigger && !trigger.disabled) trigger.focus({ preventScroll: true });
  }

  _locked() {
    return this._effectiveDisabled || this.hasAttribute('readonly');
  }

  _warn(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  // --- name lists (suggestions / icons) ---

  /** @private */
  _setList(kind, v) {
    const prop = kind === 'icons' ? '_iconsProp' : '_suggestionsProp';
    if (typeof v === 'string') {
      this[prop] = null;
      this.setAttribute(kind, v);
      return;
    }
    // bounded copy: at most MAX_CANDIDATES entries, a sparse / huge array's length never walked
    this[prop] = v == null ? null : Array.isArray(v) ? v.slice(0, MAX_CANDIDATES) : [];
    if (this._panel) this._fill();
  }

  /**
   * @private canonical registered names of a list (property > attribute), deduped, ≤ `max`; unknown / bad names dropped
   * with one warning per name.
   */
  _names(kind, max, quiet = false) {
    const prop = kind === 'icons' ? this._iconsProp : this._suggestionsProp;
    let list = prop;
    if (list == null) {
      const attr = this.getAttribute(kind) || '';
      if (attr.length > MAX_LIST_STRING) {
        this._warn(`${kind}:long`, `<td-icon-picker>: the ${kind} attribute is longer than ${MAX_LIST_STRING} characters; ignored`);
        return [];
      }
      list = attr.split(/[\s,]+/).filter(Boolean).slice(0, MAX_CANDIDATES);
    }
    return this._canon(list, kind, max, quiet);
  }

  /**
   * @private canonical registered names of `list` (deduped, ≤ `max`); the others are dropped, with one warning per name
   * unless `quiet` (v0.96.1: while the search data loads — the loader may still register the site icons of the list).
   */
  _canon(list, kind, max, quiet) {
    const out = [];
    for (const n of list) {
      const canon = typeof n === 'string' && NAME_RE.test(n) ? resolveIconName(n) : null;
      if (!canon) {
        if (!quiet) this._warn(`${kind}:${String(n).slice(0, 80)}`, `<td-icon-picker>: ${kind} entry "${String(n).slice(0, 80)}" is not a registered icon; dropped`);
      } else if (!out.includes(canon) && out.length < max) {
        out.push(canon);
      }
    }
    return out;
  }

  // --- render (DOM built, never parsed) ---

  /** render() is empty: afterRender() builds the tree with createElement (no innerHTML with data). */
  render() { return ''; }

  /** @protected */
  _focusTarget() { return this._trigger(); }

  _trigger() { return this.querySelector(':scope > .td-icon-picker > .td-icon-picker__box > .td-icon-picker__trigger'); }

  _clear() { return this.querySelector(':scope > .td-icon-picker > .td-icon-picker__box > .td-icon-picker__clear'); }

  _root() { return this.querySelector(':scope > .td-icon-picker'); }

  /** @private the state of the trigger text: value (registered) | unknown | empty | none (= the none-value) */
  _state() {
    if (!this._value) return 'empty';
    if (this._value === this._noneValue()) return 'none';
    return resolveIconName(this._value) === this._value ? 'value' : 'unknown';
  }

  /**
   * @private v0.96.1: the text of the trigger for `state` (D1). Label mode (`trigger-text="label"`, state `value` only):
   * the server's `value-label` while the value is still the one the server printed, else the metadata label, else the name.
   */
  _triggerText(state) {
    if (state === 'empty') return this.getAttribute('placeholder') || TdIconPicker.labels.placeholder;
    if (state === 'none') return TdIconPicker.labels.none;
    if (state !== 'value' || this.getAttribute('trigger-text') !== 'label') return this._value;
    const printed = this.getAttribute('value-label');
    if (printed && isSearchText(printed) && this._value === this._parse(this.getAttribute('value'), false)) return printed;
    return labelOf(this._value);
  }

  /** @private clear button hidden: no value, required, locked or allow-clear off */
  _clearHidden() {
    return !this._value || this.hasAttribute('required') || this._locked() || !this.allowClear;
  }

  /** The tree php/td.php prints (without the no-JS hidden input), for the current state. @returns {HTMLDivElement} */
  _buildRoot() {
    const id = this.id;
    const label = this.getAttribute('label') || '';
    const aria = this.getAttribute('aria-label') || '';
    const root = el('div', 'td-icon-picker');
    if (label) {
      const l = el('label', 'td-icon-picker__label');
      l.id = `${id}-label`;
      l.htmlFor = `${id}-trigger`;
      l.textContent = label;
      root.appendChild(l);
    }
    const box = el('div', 'td-icon-picker__box');
    const trigger = el('button', 'td-icon-picker__trigger');
    trigger.type = 'button';
    trigger.id = `${id}-trigger`;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-labelledby', `${label ? `${id}-label` : aria ? `${id}-name` : ''} ${id}-text`.trim());
    if (this._locked()) trigger.disabled = true;
    const glyph = el('span', 'td-icon-picker__glyph');
    glyph.setAttribute('aria-hidden', 'true');
    const text = el('span', 'td-icon-picker__text');
    text.id = `${id}-text`;
    this._paintTrigger(glyph, text);
    trigger.append(glyph, text);
    const chevron = tdIcon('down', { size: 's', class: 'td-icon-picker__chevron' });
    if (chevron) trigger.appendChild(chevron);
    const clear = el('button', 'td-icon-picker__clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', TdIconPicker.labels.clear);
    clear.hidden = this._clearHidden();
    const x = tdIcon('close', { size: 's' });
    if (x) clear.appendChild(x);
    box.append(trigger, clear);
    root.appendChild(box);
    if (!label && aria) {
      const name = el('span', 'td-sr-only');
      name.id = `${id}-name`;
      name.textContent = aria;
      root.appendChild(name);
    }
    if (!label && !aria) this._warn('name', '<td-icon-picker>: give it a label or an aria-label (the trigger has no accessible name)');
    return root;
  }

  /** @private glyph + text + data-state of the trigger for the current value */
  _paintTrigger(glyph, text) {
    const state = this._state();
    const want = state === 'value' ? this._value : state === 'none' ? 'ban' : '';
    const svg = glyph.firstElementChild;
    if ((svg ? svg.getAttribute('data-icon') : '') !== want || glyph.childNodes.length > (svg ? 1 : 0)) {
      glyph.replaceChildren();
      const icon = want ? tdIcon(want, { size: 'm' }) : null;
      if (icon) glyph.appendChild(icon);
    }
    const t = this._triggerText(state);
    if (text.textContent !== t) text.textContent = t;
    if (text.getAttribute('data-state') !== state) text.setAttribute('data-state', state);
  }

  /** @private push the state onto the trigger / clear button (in place) */
  _paint() {
    const trigger = this._trigger();
    if (!trigger) return;
    const glyph = trigger.querySelector(':scope > .td-icon-picker__glyph');
    const text = trigger.querySelector(':scope > .td-icon-picker__text');
    if (glyph && text) this._paintTrigger(glyph, text);
    const locked = this._locked();
    if (trigger.disabled !== locked) trigger.disabled = locked; // read-only: the popup never opens
    const clear = this._clear();
    if (clear) clear.hidden = this._clearHidden();
    if (locked) this.close({ focus: false });
  }

  /** Re-render keeping the focus on the trigger (label / aria-label / disabled changes). */
  _doRender() {
    if (this._suppressRender) return;
    const had = !!this._trigger() && this._trigger() === this.ownerDocument.activeElement;
    this.close({ focus: false }); // the popup belongs to the trigger being replaced
    super._doRender();
    if (had) this._trigger()?.focus({ preventScroll: true });
  }

  afterRender() {
    if (!this._root()) this.prepend(this._buildRoot());
    const trigger = this._trigger();
    const clear = this._clear();
    this._paint();
    if (trigger) {
      this.listen(trigger, 'click', () => (this._panel ? this.close() : this.open()));
      this.listen(trigger, 'keydown', (e) => {
        const k = /** @type {KeyboardEvent} */ (e);
        if (k.key === 'ArrowDown' || (k.altKey && k.key === 'ArrowDown')) {
          e.preventDefault();
          this.open();
        }
      });
    }
    if (clear) {
      this.listen(clear, 'click', () => {
        if (this._clearHidden()) return;
        this._commit('');
        this._trigger()?.focus({ preventScroll: true });
      });
    }
    this._syncForm();
    this._applyErrorState();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return;
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'value': this.value = newVal ?? ''; return;
      case 'placeholder': case 'trigger-text': case 'value-label': this._paint(); return;
      case 'readonly': case 'allow-clear': this._paint(); return;
      case 'required':
        this._paint();
        this._syncForm();
        if (this._panel) this._fill(); // the "Không icon" cell hides on a required picker
        return;
      case 'none-option': if (this._panel) this._fill(); return;
      case 'none-value':
        this._paint();
        this._syncForm();
        if (this._panel) this._fill();
        return;
      case 'suggestions': case 'icons':
        if (name === 'suggestions') this._suggestionsProp = null; else this._iconsProp = null;
        if (this._panel) this._fill();
        return;
      case 'name': return; // ElementInternals submits under the host name
      default: super.attributeChangedCallback(name, oldVal, newVal); // disabled, label, aria-label (re-render), error-text
    }
  }

  // --- popup ---

  /** @private a part of the open popup */
  _p(part) { return this._panel ? this._panel.querySelector(`.td-icon-picker-panel__${part}`) : null; }

  _buildPanel() {
    const L = TdIconPicker.labels;
    const id = this.id;
    const panel = el('div', 'td-icon-picker-panel td-glass-surface td-glass-surface--strong');
    panel.id = `${id}-panel`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', L.panel);
    const search = el('div', 'td-icon-picker-panel__search');
    const input = el('input', 'td-icon-picker-panel__input');
    input.type = 'search';
    input.setAttribute('aria-label', L.search);
    input.placeholder = L.searchPlaceholder;
    input.maxLength = ICON_SEARCH_LIMITS.queryMax;
    for (const [k, v] of [['autocomplete', 'off'], ['autocapitalize', 'none'], ['spellcheck', 'false'], ['enterkeyhint', 'search']]) input.setAttribute(k, v);
    search.appendChild(input);
    const body = el('div', 'td-icon-picker-panel__body');
    this._filterKey = '';
    this._filterSig = '';
    this._secs = new Map();
    this._gseq = 0;
    for (const group of ['suggested', 'all']) {
      const section = el('section', 'td-icon-picker-panel__group');
      section.setAttribute('data-group', group);
      const heading = el('div', 'td-icon-picker-panel__heading');
      heading.setAttribute('role', 'heading');
      heading.setAttribute('aria-level', '3');
      heading.id = `${id}-${group === 'suggested' ? 'sg' : 'all'}`;
      heading.textContent = group === 'suggested' ? L.suggested : L.all;
      const grid = el('div', 'td-icon-picker-panel__grid');
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-labelledby', heading.id);
      section.append(heading, grid);
      body.appendChild(section);
      this._secs.set(group, { el: section, grid, heading });
    }
    const empty = el('p', 'td-icon-picker-panel__empty');
    empty.hidden = true;
    empty.textContent = L.empty;
    body.appendChild(empty);
    const footer = el('div', 'td-icon-picker-panel__footer');
    const caption = el('span', 'td-icon-picker-panel__caption');
    caption.setAttribute('aria-hidden', 'true');
    const status = el('span', 'td-icon-picker-panel__status');
    status.setAttribute('role', 'status');
    const retry = el('button', 'td-icon-picker-panel__retry');
    retry.type = 'button';
    retry.hidden = true;
    retry.textContent = L.retry;
    footer.append(caption, status, retry);
    panel.append(search, body, footer);
    this._bindPanel(panel, input, body, retry);
    return panel;
  }

  /** @private listeners of a fresh popup (they die with it) */
  _bindPanel(panel, input, body, retry) {
    // the search box's own events never reach the page as the host's
    input.addEventListener('input', (e) => { e.stopPropagation(); this._filter(); });
    input.addEventListener('change', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = normalizeIconQuery(input.value) ? this._visibleNames('all')[0] : undefined;
        if (first) this._pick(first);
      } else if (e.key === 'ArrowDown') {
        const cell = this._rovingCell(this._visibleGrids()[0]);
        if (cell) {
          e.preventDefault();
          this._focusCell(cell);
        }
      }
    });
    body.addEventListener('click', (e) => {
      const cell = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__cell');
      if (cell && body.contains(cell)) this._pick(cell.classList.contains(NONE_CELL) ? this._noneValue() : cell.getAttribute('data-icon'));
    });
    body.addEventListener('keydown', (e) => this._onGridKey(/** @type {KeyboardEvent} */ (e)));
    body.addEventListener('focusin', (e) => {
      const cell = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__cell');
      if (!cell) return;
      this._setRoving(cell);
      this._caption(this._key(cell));
    });
    body.addEventListener('focusout', () => this._caption(null));
    body.addEventListener('pointerover', (e) => {
      const pe = /** @type {PointerEvent} */ (e);
      if (pe.pointerType !== 'mouse' && pe.pointerType !== 'pen') return;
      const cell = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__cell');
      if (cell) this._caption(this._key(cell));
    });
    body.addEventListener('pointerleave', () => this._caption(null));
    // pointer leaves a cell for a non-cell (gap, heading, empty row space) → caption back to the focused / selected icon
    body.addEventListener('pointerout', (e) => {
      const pe = /** @type {PointerEvent} */ (e);
      if (pe.pointerType !== 'mouse' && pe.pointerType !== 'pen') return;
      const from = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__cell');
      if (!from) return;
      const to = /** @type {Element|null} */ (pe.relatedTarget);
      if (to && to.closest?.('.td-icon-picker-panel__cell')) return; // into the same cell's child or another cell
      this._caption(null);
    });
    retry.addEventListener('click', () => {
      this._loadMeta();
      input.focus({ preventScroll: true });
    });
    panel.addEventListener('input', (e) => e.stopPropagation());
    panel.addEventListener('change', (e) => e.stopPropagation());
  }

  /** @private (re)build the cells of every grid for the current lists, then filter + lay out */
  _fill() {
    if (!this._panel) return;
    this._cells = new Map();
    this._noneCell = null;
    this._reflow();
  }

  /** @private the lists, sections and filter row for the current data (cells that exist are kept), then filter + lay out */
  _reflow() {
    // a focused cell may leave the DOM here (e.g. groups arrive with the lazy load and the flat "all" section empties):
    // keep its icon and focus the same icon in the first shown section that has it
    const active = document.activeElement;
    const key = active && this._panel && this._panel.contains(active) && active.classList.contains('td-icon-picker-panel__cell')
      ? this._key(active) : null;
    this._lists();
    this._syncSections();
    this._syncFilters();
    this._filter({ layout: true });
    if (key !== null && !(active.isConnected && this._panel && this._panel.contains(active))) this._refocus(key);
  }

  /** @private focus the cell of `key` (icon name / NONE_KEY) in the first shown section that has it */
  _refocus(key) {
    if (!this._panel || !this._secs) return;
    for (const [sid, rec] of this._secs) {
      if (rec.el.hidden || !this._shown.get(sid)?.includes(key)) continue;
      const cell = key === NONE_KEY ? this._noneCell : this._cells.get(sid)?.get(key);
      if (cell && cell.isConnected) {
        this._setRoving(cell);
        cell.focus({ preventScroll: true });
        return;
      }
    }
  }

  /**
   * @private (v0.96.1, D9) the lists of the current attributes / properties / registry: suggestions, the icons set and the
   * groups. While the search data loads the "not registered" warnings wait (the loader may register the site icons); they
   * come once it is done or failed.
   */
  _lists() {
    const quiet = this._loadState === 'loading';
    this._suggested = this._names('suggestions', MAX_SUGGESTIONS, quiet);
    const set = this._names('icons', MAX_CANDIDATES, quiet);
    this._set = set.length ? new Set(set) : null;
    this._groupList = this._resolveGroups(quiet);
  }

  /**
   * @private v0.96.1 (D5 / D6): the groups to show — `[{ key, label, names }]` (key null = the "Khác" group) — or null
   * (flat grid). Structure refused by validateIconGroups → one warning + null. Names: canonical, registered, inside the
   * `icons` set; an empty group is dropped; every registered icon in no group goes to the group `other` (when the site
   * has one) else a final "Khác".
   */
  _resolveGroups(quiet) {
    const src = this._groupsProp ?? TdIconPicker.groups;
    if (src == null) return null;
    let valid;
    try {
      valid = validateIconGroups(src);
    } catch (err) {
      this._warn(`groups:${String(err.message).slice(0, 80)}`, `<td-icon-picker>: groups ignored (${err.message})`);
      return null;
    }
    const used = new Set();
    const out = [];
    for (const g of valid) {
      let names = this._canon(g.icons, 'groups', MAX_CANDIDATES, quiet);
      if (this._set) names = names.filter((n) => this._set.has(n));
      for (const n of names) used.add(n);
      out.push({ key: g.key, label: g.label, names });
    }
    const rest = this._index.names.filter((n) => !used.has(n) && (!this._set || this._set.has(n)));
    if (rest.length) {
      const other = out.find((g) => g.key === 'other');
      if (other) other.names = [...other.names, ...rest];
      else out.push({ key: null, label: TdIconPicker.labels.ungrouped, names: rest });
    }
    const shown = out.filter((g) => g.names.length);
    return shown.length ? shown : null;
  }

  /** @private the id of the section of a group (`g:key`, the "Khác" group `g~`) and the value of its filter button */
  _gid(g) { return g.key ? `g:${g.key}` : 'g~'; }

  _fkey(g) { return g.key || '~'; }

  /** @private (v0.96.1) make the body hold exactly: [none] suggested [one section per group] all (existing nodes stay put) */
  _syncSections() {
    const body = this._p('body');
    if (!body) return;
    const old = this._secs;
    const secs = new Map();
    const order = [];
    if (this.noneOption) {
      const rec = old.get('none') || this._noneSection();
      secs.set('none', rec);
      order.push(rec.el);
    }
    secs.set('suggested', old.get('suggested'));
    order.push(old.get('suggested').el);
    for (const g of this._groupList || []) {
      const sid = this._gid(g);
      const rec = old.get(sid) || this._groupSection(g);
      rec.heading.textContent = g.label;
      secs.set(sid, rec);
      order.push(rec.el);
    }
    secs.set('all', old.get('all'));
    order.push(old.get('all').el);
    for (const [sid, rec] of old) {
      if (!secs.has(sid)) {
        rec.el.remove();
        if (this._cells) this._cells.delete(sid);
      }
    }
    this._secs = secs;
    let ref = body.firstChild;
    for (const node of order) {
      if (ref === node) ref = ref.nextSibling;
      else body.insertBefore(node, ref);
    }
    if (!this.noneOption) this._noneCell = null;
  }

  /** @private the section of the "Không icon" cell: a grid of one cell, named by labels.noneGroup */
  _noneSection() {
    const section = el('section', 'td-icon-picker-panel__group');
    section.setAttribute('data-group', 'none');
    const grid = el('div', 'td-icon-picker-panel__grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', TdIconPicker.labels.noneGroup);
    section.appendChild(grid);
    return { el: section, grid, heading: null };
  }

  /** @private the section of a group: heading + grid (the id comes from a counter, never from the key) */
  _groupSection(g) {
    const section = el('section', 'td-icon-picker-panel__group');
    section.setAttribute('data-group', 'group');
    if (g.key) section.setAttribute('data-key', g.key);
    else section.setAttribute('data-ungrouped', '');
    const heading = el('div', 'td-icon-picker-panel__heading');
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '3');
    heading.id = `${this.id}-g${this._gseq++}`;
    const grid = el('div', 'td-icon-picker-panel__grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-labelledby', heading.id);
    section.append(heading, grid);
    return { el: section, grid, heading };
  }

  /** @private (v0.96.1, D8) the filter row: "Tất cả" + a button per group, only with 2+ groups */
  _syncFilters() {
    const panel = this._panel;
    if (!panel) return;
    let bar = panel.querySelector('.td-icon-picker-panel__filters');
    const groups = this._groupList;
    if (!groups || groups.length < 2) {
      if (bar) bar.remove();
      this._filterKey = '';
      this._filterSig = '';
      return;
    }
    if (this._filterKey && !groups.some((g) => this._fkey(g) === this._filterKey)) this._filterKey = '';
    const sig = JSON.stringify([TdIconPicker.labels.filterAll, TdIconPicker.labels.filter, groups.map((g) => [this._fkey(g), g.label])]);
    if (bar && sig === this._filterSig) {
      this._pressFilter();
      return;
    }
    if (bar) bar.remove();
    const L = TdIconPicker.labels;
    bar = el('div', 'td-icon-picker-panel__filters');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', L.filter);
    for (const [key, text] of [['', L.filterAll], ...groups.map((g) => [this._fkey(g), g.label])]) {
      const b = el('button', 'td-icon-picker-panel__filter');
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('data-filter', key);
      b.setAttribute('aria-pressed', 'false');
      b.textContent = text;
      bar.appendChild(b);
    }
    bar.addEventListener('click', (e) => {
      const b = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__filter');
      if (!b || !bar.contains(b)) return;
      this._filterKey = b.getAttribute('data-filter');
      this._pressFilter();
      this._filter({ layout: true });
    });
    bar.addEventListener('keydown', (e) => {
      const buttons = [...bar.children];
      const i = buttons.indexOf(/** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__filter'));
      if (i < 0) return;
      let to = -1;
      if (e.key === 'ArrowRight') to = Math.min(buttons.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = buttons.length - 1;
      if (to < 0) return;
      e.preventDefault();
      for (const b of buttons) b.tabIndex = -1;
      buttons[to].tabIndex = 0;
      buttons[to].focus({ preventScroll: true });
      // the row scrolls sideways when it overflows: bring the focused button into the row's view (the row only, never
      // the page — preventScroll above keeps the popup still)
      const r = buttons[to].getBoundingClientRect();
      const box = bar.getBoundingClientRect();
      if (r.left < box.left) bar.scrollLeft -= box.left - r.left;
      else if (r.right > box.right) bar.scrollLeft += r.right - box.right;
    });
    panel.insertBefore(bar, this._p('body'));
    this._filterSig = sig;
    this._pressFilter();
  }

  /** @private aria-pressed (+ the one tab stop) of the filter buttons for the current choice */
  _pressFilter() {
    const bar = this._panel && this._panel.querySelector('.td-icon-picker-panel__filters');
    if (!bar) return;
    for (const b of bar.children) {
      const on = b.getAttribute('data-filter') === this._filterKey;
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  /** @private the cell of `name` in section `sid` (created once per open, then only moved); NONE_KEY = the "Không icon" cell */
  _cell(sid, name) {
    if (name === NONE_KEY) return this._noneCellEl();
    let map = this._cells.get(sid);
    if (!map) this._cells.set(sid, map = new Map());
    let cell = map.get(name);
    if (!cell) {
      cell = el('button', 'td-icon-picker-panel__cell');
      cell.type = 'button';
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = -1;
      cell.setAttribute('data-icon', name);
      cell.setAttribute('aria-label', labelOf(name));
      cell.setAttribute('aria-selected', String(name === this._value));
      const svg = tdIcon(name, { size: 'm' });
      if (svg) cell.appendChild(svg);
      map.set(name, cell);
    }
    return cell;
  }

  /** @private names shown in a group for the current query */
  _visibleNames(group) {
    const input = this._p('input');
    const q = input ? input.value : '';
    if (group === 'suggested') return normalizeIconQuery(q) ? [] : this._suggested;
    const names = normalizeIconQuery(q) ? searchIcons(this._index, q) : this._index.names;
    return this._set ? names.filter((n) => this._set.has(n)) : [...names];
  }

  /** @private (v0.96.1, D4) the "Không icon" cell shows: on, no query, no group filter, and not a required picker whose none value is '' */
  _noneVisible(query, chosen) {
    return this.noneOption && !query && !chosen && !(this.hasAttribute('required') && this._noneValue() === '');
  }

  /** @private the "Không icon" cell (one per open): a wide button with the `ban` icon and the text */
  _noneCellEl() {
    if (!this._noneCell) {
      const L = TdIconPicker.labels;
      const cell = el('button', `td-icon-picker-panel__cell ${NONE_CELL}`);
      cell.type = 'button';
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = -1;
      cell.setAttribute('aria-label', L.none);
      cell.setAttribute('aria-selected', String(this._value === this._noneValue()));
      const svg = tdIcon('ban', { size: 'm' });
      if (svg) cell.appendChild(svg);
      const text = el('span', 'td-icon-picker-panel__cell-text');
      text.textContent = L.none;
      cell.appendChild(text);
      this._noneCell = cell;
    }
    return this._noneCell;
  }

  /** @private the caption key of a cell: its icon name, or NONE_KEY for the "Không icon" cell */
  _key(cell) {
    return cell.classList.contains(NONE_CELL) ? NONE_KEY : cell.getAttribute('data-icon');
  }

  /** @private the query changed (or the lists / data): rows, headings, empty note, status */
  _filter({ layout = false } = {}) {
    const panel = this._panel;
    if (!panel) return;
    const input = this._p('input');
    const query = !!normalizeIconQuery(input.value);
    if (query && this._filterKey) {
      this._filterKey = ''; // a query searches every group (D7)
      this._pressFilter();
    }
    const groups = this._groupList;
    const chosen = this._filterKey;
    const flat = !groups || query; // the one flat "all" / "Kết quả" section
    const shown = new Map();
    shown.set('none', this._noneVisible(query, chosen) ? [NONE_KEY] : []);
    shown.set('suggested', query || chosen ? [] : this._suggested);
    shown.set('all', flat ? this._visibleNames('all') : []);
    let count = flat ? shown.get('all').length : 0;
    for (const g of groups || []) {
      const names = !query && (!chosen || chosen === this._fkey(g)) ? g.names : [];
      shown.set(this._gid(g), names);
      if (!flat) count += names.length;
    }
    this._shown = shown;
    this._count = count;
    for (const [sid, rec] of this._secs) rec.el.hidden = !shown.get(sid).length;
    this._secs.get('all').heading.textContent = query ? TdIconPicker.labels.results : TdIconPicker.labels.all;
    this._p('empty').hidden = count > 0;
    if (layout || !this._cols) this._layout();
    else this._rows();
    clearTimeout(this._statusTimer);
    if (query) this._statusTimer = setTimeout(() => this._status(), STATUS_DELAY);
    else this._status();
  }

  /** @private columns for the viewport, panel width (CSSOM), then rows; position */
  _layout() {
    const panel = this._panel;
    if (!panel) return;
    const max = Math.max(1, parseInt(getComputedStyle(panel).getPropertyValue('--td-icon-picker-columns'), 10) || 8);
    this._cols = max;
    this._rows();
    const any = panel.querySelector(`.td-icon-picker-panel__cell:not(.${NONE_CELL})`); // the wide "Không icon" cell is no measure
    const row = panel.querySelector('.td-icon-picker-panel__row');
    if (any && row) {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const step = any.getBoundingClientRect().width + gap;
      const body = this._p('body');
      const ps = getComputedStyle(panel);
      const bs = getComputedStyle(body);
      const pad = (parseFloat(ps.paddingLeft) || 0) + (parseFloat(ps.paddingRight) || 0) + (parseFloat(ps.borderLeftWidth) || 0)
        + (parseFloat(ps.borderRightWidth) || 0) + (parseFloat(bs.paddingLeft) || 0) + (parseFloat(bs.paddingRight) || 0)
        + Math.max(0, body.offsetWidth - body.clientWidth);
      const box = viewportBox();
      const room = box.right - box.left - 16 - pad + gap;
      const cols = Math.min(max, Math.max(4, Math.floor(room / step)));
      panel.style.setProperty('width', `${Math.ceil(cols * step - gap + pad)}px`);
      if (cols !== this._cols) {
        this._cols = cols;
        this._rows();
      }
    }
    this._placePanel();
  }

  /** @private put the shown cells into rows of `_cols` (same cell nodes, moved; focus kept) */
  _rows() {
    const panel = this._panel;
    if (!panel) return;
    const active = document.activeElement;
    for (const [sid, { grid }] of this._secs) {
      const names = this._shown.get(sid);
      const rows = [];
      for (let i = 0; i < names.length; i += this._cols) {
        const row = el('div', 'td-icon-picker-panel__row');
        row.setAttribute('role', 'row');
        for (const n of names.slice(i, i + this._cols)) row.appendChild(this._cell(sid, n));
        rows.push(row);
      }
      grid.replaceChildren(...rows);
      const roving = grid.querySelector('.td-icon-picker-panel__cell[tabindex="0"]');
      this._setRoving(roving || grid.querySelector('.td-icon-picker-panel__cell[aria-selected="true"]')
        || grid.querySelector('.td-icon-picker-panel__cell'), grid);
    }
    if (active && active !== document.activeElement && active.isConnected && panel.contains(active)) {
      active.focus({ preventScroll: true });
    }
  }

  /** @private exactly one cell of a grid in the tab order */
  _setRoving(cell, grid = cell?.closest('.td-icon-picker-panel__grid')) {
    if (!grid) return;
    for (const c of grid.querySelectorAll('.td-icon-picker-panel__cell[tabindex="0"]')) if (c !== cell) c.tabIndex = -1;
    if (cell) cell.tabIndex = 0;
  }

  /** @private */
  _rovingCell(grid) { return grid ? grid.querySelector('.td-icon-picker-panel__cell[tabindex="0"]') : null; }

  /** @private the grids with at least one cell, in order */
  _visibleGrids() {
    if (!this._panel) return [];
    return [...this._panel.querySelectorAll('.td-icon-picker-panel__group:not([hidden]) > .td-icon-picker-panel__grid')]
      .filter((g) => g.firstElementChild);
  }

  /** @private aria-selected of every cell (value changed while open) */
  _markSelected() {
    if (!this._cells) return;
    for (const map of this._cells.values()) {
      for (const [name, cell] of map) cell.setAttribute('aria-selected', String(name === this._value));
    }
    if (this._noneCell) this._noneCell.setAttribute('aria-selected', String(this._value === this._noneValue()));
  }

  /** @private caption: the hovered / focused icon, else the selected one */
  _caption(name) {
    const caption = this._p('caption');
    if (!caption) return;
    let n = name;
    if (!n) {
      const focused = document.activeElement?.closest?.('.td-icon-picker-panel__cell');
      n = focused && this._panel.contains(focused) ? this._key(focused) : (this._state() === 'value' ? this._value : '');
    }
    if (n === NONE_KEY) {
      caption.textContent = TdIconPicker.labels.none;
      return;
    }
    const label = n ? labelOf(n) : '';
    caption.textContent = !n ? '' : label === n ? n : TdIconPicker.labels.caption.replace('{label}', label).replace('{name}', n);
  }

  /** @private status line: load error > loading > the result count (a query only) */
  _status() {
    const status = this._p('status');
    if (!status) return;
    const L = TdIconPicker.labels;
    const input = this._p('input');
    let text = '';
    if (this._loadState === 'error') text = L.loadError;
    else if (this._loadState === 'loading') text = L.loading;
    else if (normalizeIconQuery(input.value) || this._filterKey) text = L.count.replace('{n}', String(this._count ?? 0));
    if (status.textContent !== text) status.textContent = text;
    this._p('retry').hidden = this._loadState !== 'error';
  }

  /** @private start / reuse the metadata load; the result lands only in the popup of this open */
  _loadMeta() {
    const gen = this._gen;
    const p = loadSearch();
    if (mergedSearch && loadedSearch && searchLoader === TdIconPicker.loadSearchData && this._loadState !== 'error') {
      // already loaded: nothing to wait for (the promise still settles below — harmless)
      this._loadState = 'done';
    } else {
      this._loadState = 'loading';
    }
    this._status();
    p.then(() => {
      if (gen !== this._gen || !this._panel) return;
      this._loadState = 'done';
      this._onData();
    }, (err) => {
      if (gen !== this._gen || !this._panel) return;
      this._loadState = 'error';
      this._warn('load', `td-icon-picker: search metadata could not be loaded (${err && err.message ? err.message : err}); searching by name`);
      this._warned.delete('load');
      // the loader may have registered icons before it failed; the warnings held back while it ran come now
      this._index = currentIndex();
      this._paint(); // a value the loader registered before it failed gets its icon (as on success, D9)
      this._reflow();
      this._status();
    });
  }

  /**
   * @private metadata arrived (the loader may also have registered site icons / set TdIconPicker.groups): new index,
   * labels of the cells, lists + groups again WITHOUT rebuilding the cells that exist (focus kept), the trigger
   * (icon / label of a value the loader made known), same query again
   */
  _onData() {
    this._index = currentIndex();
    for (const map of this._cells ? this._cells.values() : []) {
      for (const [name, cell] of map) cell.setAttribute('aria-label', labelOf(name));
    }
    this._paint();
    this._reflow();
    this._caption(null);
  }

  /** @private keep the popup on the trigger; neither side has room → inside the viewport */
  _placePanel() {
    const trigger = this._trigger();
    const panel = this._panel;
    if (!panel || !trigger) return;
    const { side, top } = placeFloating(trigger, panel, { width: 'auto', align: 'start', list: this._p('body') });
    panel.setAttribute('data-placement', side);
    const box = viewportBox();
    const h = panel.offsetHeight;
    const clamped = Math.max(box.top + 8, Math.min(top, box.bottom - h - 8));
    if (clamped !== top) panel.style.setProperty('top', `${clamped}px`);
  }

  /** @private scroll / resize / reference change: close once the trigger is hidden, else follow it */
  _updatePosition() {
    if (!this._panel) return;
    const trigger = this._trigger();
    if (!trigger || !trigger.isConnected || isReferenceHidden(trigger.getBoundingClientRect(), trigger)) {
      this.close({ focus: false });
      return;
    }
    this._placePanel();
  }

  /** @private Tab / Shift+Tab cycle inside the popup */
  _onTab(e) {
    const panel = this._panel;
    if (!panel) return 'pass';
    if (!panel.contains(document.activeElement)) {
      this.close({ focus: false });
      return 'pass';
    }
    const nodes = focusablesIn(panel);
    e.preventDefault();
    if (!nodes.length) return 'handled';
    const i = nodes.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
    nodes[next].focus({ preventScroll: true });
    return 'handled';
  }

  /** @private focus a cell without the browser scrolling anything; the body scrolls just enough */
  _focusCell(cell) {
    if (!cell) return;
    this._setRoving(cell);
    cell.focus({ preventScroll: true });
    const body = this._p('body');
    if (!body) return;
    const b = body.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (c.top < b.top) body.scrollTop -= b.top - c.top + 4;
    else if (c.bottom > b.bottom) body.scrollTop += c.bottom - b.bottom + 4;
  }

  /** @private grid keys (D10 / §8.6) */
  _onGridKey(e) {
    const cell = /** @type {Element} */ (e.target).closest?.('.td-icon-picker-panel__cell');
    if (!cell) return;
    const row = cell.parentElement;
    const grid = row.parentElement;
    const rows = [...grid.children];
    const r = rows.indexOf(row);
    const c = [...row.children].indexOf(cell);
    const grids = this._visibleGrids();
    const gi = grids.indexOf(grid);
    const at = (rr, cc) => {
      const target = rows[rr];
      return target ? target.children[Math.min(cc, target.children.length - 1)] : null;
    };
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = row.children[c - 1] || cell; break;
      case 'ArrowRight': next = row.children[c + 1] || cell; break;
      case 'ArrowUp':
        if (r > 0) next = at(r - 1, c);
        else if (gi > 0) {
          const prevRows = [...grids[gi - 1].children];
          const last = prevRows[prevRows.length - 1];
          next = last.children[Math.min(c, last.children.length - 1)];
        } else {
          e.preventDefault();
          this._p('input')?.focus({ preventScroll: true });
          return;
        }
        break;
      case 'ArrowDown':
        if (r < rows.length - 1) next = at(r + 1, c);
        else if (gi >= 0 && gi < grids.length - 1) {
          const first = grids[gi + 1].firstElementChild;
          next = first.children[Math.min(c, first.children.length - 1)];
        } else next = cell;
        break;
      case 'Home': next = e.ctrlKey ? rows[0].firstElementChild : row.firstElementChild; break;
      case 'End': next = e.ctrlKey ? rows[rows.length - 1].lastElementChild : row.lastElementChild; break;
      case 'PageUp': case 'PageDown': {
        const body = this._p('body');
        const step = Math.max(1, Math.floor(body.clientHeight / Math.max(1, row.getBoundingClientRect().height)) - 1);
        const to = e.key === 'PageUp' ? Math.max(0, r - step) : Math.min(rows.length - 1, r + step);
        next = at(to, c);
        break;
      }
      default: return;
    }
    e.preventDefault();
    if (next) this._focusCell(next);
  }

  // --- SSR (ADR 0012, contract icon-picker@1) ---

  /**
   * Marker `icon-picker@1` + exactly the tree _buildRoot() makes for the host state (+ the no-JS hidden input agreeing
   * with name / value / disabled) → adopt in place. Anything else → safe render now (focus kept on the trigger).
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'icon-picker') return false;
    if (m.schema === 1 && this._ssrGate(true)) return true;
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = { refocus: !!active && active !== this && this.contains(active) };
    this._ssrFreshRender = true;
    return false;
  }

  /** Re-connect: re-bind in place while the markup is still the component's (else safe render). */
  canRebind() {
    if (this._ssrGate(false)) return true;
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = { refocus: !!active && active !== this && this.contains(active) };
    this._ssrFreshRender = true;
    return false;
  }

  hydrateExisting() {
    this._errorNote = [...this.children].find(ssrIsErrorNote) || null;
    this._syncForm(); // ElementInternals FIRST…
    for (const h of this._ssrHidden()) h.remove(); // …then the no-JS input: FormData has ONE entry
  }

  /** @protected after refused / tampered markup was replaced: the focus */
  _restoreSsrState(s) {
    if (s && s.refocus) this._trigger()?.focus({ preventScroll: true });
  }

  /** @private the no-JS hidden input (last child of the root) */
  _ssrHidden() {
    const root = this._root();
    return root ? [...root.children].filter((n) => n.localName === 'input') : [];
  }

  /**
   * @private The strict gate shared by adoption (`first`) and re-bind: host content = [root] [+ helper note] [+ error
   * note exactly when an error shows]; root = _buildRoot()'s parts compared attribute by attribute, text exactly (the
   * trigger may carry the error / description wiring on top); first only: the hidden input.
   * @param {boolean} first
   */
  _ssrGate(first) {
    const kids = this._ssrWithoutHelperNote(ssrContentNodes(this));
    if (!kids || !kids.length || kids.length > 2 || kids.some((n) => n.nodeType !== 1)) return false;
    if ((kids.length === 2) !== !!this.errorMessage || (kids[1] && !ssrIsErrorNote(kids[1]))) return false;
    const live = kids[0];
    const want = this._buildRoot();
    if (live.localName !== 'div' || !ssrSameAttrs(live, want)) return false;
    let parts = ssrContentNodes(live);
    if (parts.some((n) => n.nodeType !== 1)) return false;
    const hidden = parts.filter((n) => n.localName === 'input');
    if (first ? !this._ssrHiddenOk(hidden, parts) : hidden.length) return false;
    parts = parts.filter((n) => !hidden.includes(n));
    const need = [...want.children];
    if (parts.length !== need.length) return false;
    return need.every((w, i) => (w.classList.contains('td-icon-picker__box') ? this._ssrBoxOk(parts[i], w) : ssrSamePart(parts[i], w)));
  }

  /** @private name present → exactly one hidden input, LAST, name / value / disabled = the host's; no name → none */
  _ssrHiddenOk(hidden, parts) {
    const name = this.getAttribute('name') || '';
    if (!name) return hidden.length === 0;
    if (hidden.length !== 1 || parts[parts.length - 1] !== hidden[0]) return false;
    const h = hidden[0];
    return (h.getAttribute('type') || '').toLowerCase() === 'hidden' && ssrClassKey(h) === 'td-icon-picker__native'
      && [...h.attributes].every((a) => HIDDEN_ATTRS.has(a.name)) && h.getAttribute('name') === name
      && (h.getAttribute('value') ?? '') === this._value && h.hasAttribute('disabled') === this.hasAttribute('disabled')
      && h.children.length === 0;
  }

  /** @private the box: trigger (= want + only the error / description attributes) and the clear button exactly */
  _ssrBoxOk(box, want) {
    if (!box || box.localName !== 'div' || !ssrSameAttrs(box, want)) return false;
    const parts = ssrContentNodes(box);
    const [wt, wc] = [...want.children];
    if (parts.length !== 2 || parts.some((n) => n.nodeType !== 1)) return false;
    const t = parts[0];
    if (t.localName !== 'button') return false;
    for (const a of t.attributes) {
      if (wt.hasAttribute(a.name)) {
        if (a.name === 'class' ? ssrClassKey(t) !== ssrClassKey(wt) : a.value !== wt.getAttribute(a.name)) return false;
      } else if (!TRIGGER_EXTRA.has(a.name)) {
        return false;
      }
    }
    if ([...wt.attributes].some((a) => !t.hasAttribute(a.name))) return false;
    const a = ssrContentNodes(t);
    const b = [...wt.children];
    return a.length === b.length && a.every((n, i) => ssrSamePart(n, b[i])) && ssrSamePart(parts[1], wc);
  }
}

if (!customElements.get('td-icon-picker')) {
  customElements.define('td-icon-picker', TdIconPicker);
}
