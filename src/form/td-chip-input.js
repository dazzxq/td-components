import { fold } from '../utils/typeahead.js';
import { createCheckMark } from '../utils/check-mark.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';
import { LAYERS, register as registerLayer } from '../utils/layers.js';
import { TdFormElement } from '../base/td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

const OPTION_PX = 40; // --td-dropdown-option-h: the list shows up to MAX_VISIBLE options before it scrolls
const MAX_VISIBLE = 8;
const LOADING_MS = 400; // "Đang tìm…" only for slow responses (no flash on fast ones)
const RESULTS_MS = 500; // "{n} gợi ý" is announced once typing settles
/** Instance properties a page may set before the element upgrades (re-applied through the class setters). */
const UPGRADE_PROPS = ['value', 'options', 'search', 'create', 'renderOption', 'renderChip', 'messages'];

/** `{key}` placeholders → values (function replacer: `$` in data is never special). */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
/** Typed text → chip text: collapse whitespace, trim, cap the length. */
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Parse the `value` attribute: a JSON array of strings/numbers or objects. Anything else → null (caller warns).
 * @param {string|null} str
 * @returns {Array|null}
 */
export function parseChipItems(str) {
  if (str == null || str === '') return [];
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Chip input — editable combobox (APG "Combobox", list autocomplete) that collects several items as removable chips.
 * New in 0.12.0 (plan v0.12.0 step 3, D8–D14; inventory §2 + §7.2), token-native: styles come from td.css
 * (`components/chip-input.css`, block `.td-chip-input`); state lives in `aria-*`, `[hidden]`, `data-state`,
 * `data-full`, `data-empty`, `data-kind`, `data-placement` — only popup geometry is written through CSSOM.
 *
 * Rendered DOM:
 *   <td-chip-input id="{host}">
 *     <div class="td-chip-input" data-state="closed|open" [data-full] [data-empty]>
 *       [<label class="td-field__label" id="{host}-label" for="{host}-input">{label}[<span class="td-field__required"> *</span>]</label>]
 *       <div class="td-chip-input__box">
 *         <ul class="td-chip-input__chips" aria-labelledby="{host}-label" | aria-label="Đã chọn" [hidden]>
 *           <li class="td-chip-input__chip" data-index="{i}">
 *             <span class="td-chip-input__chip-label">{label | renderChip(item)}</span>
 *             <button type="button" class="td-chip-input__remove" tabindex="-1" aria-label="Xóa {label}">×</button></li>
 *         </ul>
 *         <input type="text" class="td-chip-input__input" id="{host}-input" role="combobox" aria-autocomplete="list"
 *                aria-expanded aria-controls="{host}-listbox" [aria-activedescendant] autocomplete="off" spellcheck="false" maxlength>
 *       </div>
 *       <p class="td-sr-only" id="{host}-status" role="status"></p>          ← the ONE live region (text swapped)
 *     </div>
 *     [<span class="td-field-error" id="{host}-error" data-for="{host}">…</span>]
 *   </td-chip-input>
 *   <body> portal (persistent while connected, re-created after a DOM move):
 *   <div class="td-chip-input__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden data-state data-placement>
 *     <div class="td-chip-input__options" role="listbox" id="{host}-listbox" aria-labelledby | aria-label>
 *       <div class="td-chip-input__option" role="option" id="{host}-opt-{i}" aria-selected="true|false" data-index="{i}">
 *         <span class="td-chip-input__option-label">{label | renderOption(item, { query })}</span>
 *         [<span class="td-chip-input__option-desc">{item.description}</span>]</div>
 *       [<div class="td-chip-input__option td-chip-input__option--create" role="option" id="{host}-opt-create">Thêm “{text}”</div>]
 *     </div>
 *     <p class="td-chip-input__empty" [data-kind="none|loading|error"]>…</p>
 *   </div>
 *
 * Keyboard (D11): ONE tab stop (the input). In the input: ArrowDown opens (runs a search / shows the cached results)
 * and moves (wraps), Alt+ArrowDown opens without moving, ArrowUp moves, Enter picks the active option — else picks an
 * exact match, else creates (`allow-create`); Escape (layer) closes the popup, Escape with the popup closed clears the
 * text; Tab closes and moves on; Backspace/ArrowLeft at caret 0 → the last chip's remove button (never deletes).
 * On a remove button: ArrowLeft/ArrowRight/Home/End move, Delete/Backspace/Enter/Space remove and focus the next chip
 * (else the previous, else the input), ArrowRight past the last / Escape → the input. The active option is
 * `aria-selected="true"` + `aria-activedescendant` on the input; DOM focus never leaves the input while picking.
 *
 * Search (D9): `search(query, { signal })` provider (async), else local filtering of `options` (diacritic-insensitive
 * substring). Debounce `search-delay` (default 250 ms), `min-chars` (default 1) for typed text; `show-on-focus` runs a
 * search with the EMPTY query when focus enters from outside (even when `min-chars` > 0). Every request gets its own
 * AbortController and sequence number: a stale response (or one arriving after a pick / close / blur) is dropped even
 * when the provider ignores `signal`. Loading (after 400 ms), no results and errors are shown in the popup and
 * announced; a rejection fires `search-error`.
 *
 * Form (D8): one FormData entry per item under the host `name` (use `name="tags[]"` for PHP arrays); state = JSON
 * `[{value,label}]` for restore; `required` → `valueMissing`; reset restores the `value` attribute items.
 *
 * Multi-select (v0.28.0, plan v0.28.0-multiselect): `selection-only` → items come ONLY from `options` / `search()`
 * (typed text filters, never becomes a chip; `allow-create` is ignored with one warning). The listbox is
 * `aria-multiselectable="true"`; selected rows stay listed with a ticked box (v0.36.0: the shared `.td-check` mark, `span.td-chip-input__check`): `aria-selected` =
 * membership (true|false on every row), the keyboard highlight = `data-active` + `aria-activedescendant`. Enter / click
 * TOGGLE the active row (Space types a space — the input is editable), the popup stays open (`close-on-select` closes
 * it). Locked rows (`disabled` item, item of a `disabled` group, or unselected while `max-items` is reached) are
 * `aria-disabled="true"`: never selected by click, Enter, arrows (skipped) or select-all; a SELECTED row is always
 * deselectable. Groups `{ label, disabled?, options: [leaf…] }` (one level) render as `div[role=group]` labelled by a
 * `role="presentation"` header; filtering applies to leaves (empty groups hidden). `select-all` adds a first row
 * `.td-chip-input__option--all` "Chọn tất cả (N)" / "Bỏ chọn tất cả (N)" (N = shown enabled leaves): it adds every shown
 * unselected leaf (stops at `max-items`) or removes the shown selected ones — ONE `change` with `addedItems` /
 * `removedItems`. A direct child `<select multiple>` is adopted on the first connect (options, `<optgroup>` → groups,
 * `data-description`, live selection incl. selected locked options; `name` / `required` / `disabled` / `aria-label` when the host lacks them;
 * `<label for>` → host; `selection-only` set; select removed). Initial value: early `value` property > host `value`
 * attribute > the select's live selection; reset → the options' `defaultSelected`. A FOCUSED select (with or without
 * the PHP td_multiselect shell, SSR contract `chip-input@1`) defers the whole first connect to its blur.
 *
 * Security (D14): labels, descriptions, typed text, remote results and `labels.*` are rendered with `textContent` /
 * `setAttribute` only. `renderOption(item, { query })` / `renderChip(item)` return a Node (built by the page with DOM
 * APIs) or a string rendered AS TEXT — there is no HTML-string hatch. Ids come from indices, never from data.
 *
 * @element td-chip-input
 * @attr {string} name - Form field name: every item value is submitted under it
 * @attr {string} label - Visible label (names the combobox, the listbox and the chip list)
 * @attr {string} placeholder - Placeholder of the text input (never used as the name)
 * @attr {string} value - JSON array of strings or `{value,label}` objects: initial items + form-reset default
 * @attr {boolean} disabled - Disable (also via an ancestor `<fieldset disabled>`)
 * @attr {boolean} required - At least one item is required
 * @attr {string} error-text - Error message (aria-invalid + note)
 * @attr {number} max-items - Maximum number of items (adding more is blocked and announced; the input stays focusable)
 * @attr {number} min-chars - Minimum typed characters before a search (default 1)
 * @attr {number} search-delay - Debounce for provider searches in ms (default 250)
 * @attr {boolean} allow-create - Typed text can become an item (create row + Enter)
 * @attr {boolean} show-on-focus - Show suggestions (empty-query search) when focus enters
 * @attr {string} value-key - Item value key (default "value")
 * @attr {string} label-key - Item label key (default "label")
 * @attr {number} max-length - Max typed/created text length (default 200)
 * @attr {boolean} selection-only - v0.28.0: pick only from options / results (multi-select, rows toggle, ✓ shown)
 * @attr {boolean} select-all - v0.28.0 (with selection-only): "select all shown" first row
 * @attr {boolean} close-on-select - v0.28.0 (with selection-only): close the popup after each toggle
 * @fires change - User add/remove only: detail `{ value: items, items, added? , removed? }` (programmatic API is silent);
 *   select-all: `{ value, items, addedItems | removedItems }`
 * @fires search-error - The provider rejected: detail `{ query, error }`
 *
 * @property {Array} value - Current items (setter is silent)
 * @property {Array} options - Static suggestions (used when no `search` provider is set)
 * @property {(query: string, ctx: { signal: AbortSignal }) => Promise<Array>|Array} search - Async provider
 * @property {(text: string) => (Object|null|Promise<Object|null>)} create - Build an item from typed text (null = none)
 * @property {(item: Object, ctx: { query: string }) => Node|string} renderOption - Option content (Node or text)
 * @property {(item: Object) => Node|string} renderChip - Chip content (Node or text)
 * @property {Object} messages - Per-instance overrides of `TdChipInput.labels` (`labels` is the native form-control
 *   property: the associated `<label>` elements)
 * @property {Array} lastResults - Normalised items of the last completed search (read-only)
 */
export class TdChipInput extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'placeholder', 'value', 'max-items', 'min-chars', 'search-delay',
      'allow-create', 'show-on-focus', 'value-key', 'label-key', 'max-length', 'error-text', 'aria-label',
      'selection-only', 'select-all', 'close-on-select'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'allow-create', 'show-on-focus', 'selection-only', 'select-all', 'close-on-select'];
  }

  /**
   * v0.28.0: version of the SSR shell contract `data-td-ssr="chip-input@1"` (PHP td_multiselect element mode: the native
   * `<select multiple>` styled `.td-chip-input__native`). Only the focused-select deferral reads it; the shell itself
   * is upgraded by the `<select multiple>` path.
   */
  static SSR_SCHEMA = 1;

  static get errorContract() { return true; }

  /** Default texts (Vietnamese); override per site: `TdChipInput.labels.remove = 'Remove {label}'`. */
  static labels = {
    remove: 'Xóa {label}',
    create: 'Thêm “{text}”',
    chips: 'Đã chọn',
    added: 'Đã thêm {label}',
    removed: 'Đã xóa {label}',
    duplicate: 'Đã có {label}',
    results: '{n} gợi ý',
    noResults: 'Không có gợi ý',
    loading: 'Đang tìm…',
    error: 'Không tải được gợi ý',
    max: 'Đã đạt tối đa {max} mục',
    required: 'Vui lòng thêm ít nhất một mục',
    /** v0.28.0 select-all row (`{n}` = shown enabled items) + its announcements */
    selectAll: 'Chọn tất cả ({n})',
    deselectAll: 'Bỏ chọn tất cả ({n})',
    addedMany: 'Đã thêm {n} mục',
    removedMany: 'Đã bỏ chọn {n} mục',
  };

  constructor() {
    super();
    /** @private @type {Object[]} */
    this._items = [];
    /** @private items came from the property before the first render (the attribute is then only the default) */
    this._itemsFromProp = false;
    this._itemsInit = false;
    this._options = [];
    this._search = null;
    this._create = null;
    this._renderOption = null;
    this._renderChip = null;
    this._messages = null;
    this._lastResults = [];
    /** @private navigation model of the rendered listbox: [{ item } | { create: text }] */
    this._nav = [];
    /** @private query the current `_nav` was built for (null = stale) */
    this._navQuery = null;
    this._activeIndex = -1;
    this._isOpen = false;
    this._menuElement = null;
    this._layer = null;
    /** @private search bookkeeping (D9) */
    this._seq = 0;
    this._ctrl = null;
    this._debounceTimer = 0;
    this._loadingTimer = 0;
    this._resultsTimer = 0;
    this._creating = false;
    /** @private bumped by setValue/reset/disconnect: an in-flight create() result is dropped */
    this._createGen = 0;
    this._scrollRafId = null;
    this._warnedValue = false;
    /** @private rendered rows aligned with `_nav` (v0.28.0: rows may sit inside group containers) */
    this._rowEls = [];
    /** @private v0.28.0: `options` assigned before the first connect (beats a child <select>) */
    this._optionsSet = false;
    /** @private v0.28.0: reset default of an adopted <select multiple> (its `defaultSelected` items), else null */
    this._selectDefaults = null;
    this._warnedCreate = false;

    this._boundPointerOutside = (e) => {
      const t = e.target;
      if (!this.contains(t) && this._menuElement && !this._menuElement.contains(t)) this.close();
    };
    this._boundOnScroll = () => {
      if (this._scrollRafId) return;
      this._scrollRafId = requestAnimationFrame(() => {
        this._scrollRafId = null;
        this._updatePosition();
      });
    };
    this._boundOnResize = () => this._updatePosition();
  }

  connectedCallback() {
    // Properties set on the element before it upgraded shadow the class accessors: re-apply them.
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
    // v0.28.0 M3: first connect → adopt a direct child <select multiple> (JS-assigned `options` / `value` win).
    if (!this._initialized && !this._selectChecked) {
      const select = [...this.children].find((c) => c.localName === 'select' && c.multiple);
      // A FOCUSED select (the user is choosing) is left alone — no upgrade, no render, no bind — until it blurs; then
      // this path runs exactly once with the live choice. Any direct-child select, with or without the chip-input@1
      // shell (PHP td_multiselect element mode); only the shell marker removal depends on the shell.
      const shell = this._ssrMatches('chip-input', TdChipInput.SSR_SCHEMA);
      if (select && !this._ssrNoDefer && select.ownerDocument.activeElement === select) {
        this._deferUntilBlur(select);
        return;
      }
      this._selectChecked = true;
      if (shell) this.removeAttribute('data-td-ssr'); // consumed (the shell styling ends with the upgrade)
      if (select) this._upgradeSelect(select);
    }
    super.connectedCallback();
  }

  /**
   * @private v0.28.0: wait for the focused child select to blur — ONE capture listener (same mechanism as
   * td-dropdown v0.26). Disconnecting meanwhile cancels it (re-evaluated on reconnect).
   * @param {HTMLSelectElement} select
   */
  _deferUntilBlur(select) {
    if (this._ssrDefer) return;
    const onBlur = () => {
      this._cancelSsrDefer();
      // after the blur dispatch: removing the host can blur its select while still connected — the microtask then
      // sees it disconnected and leaves the decision to the next connect
      queueMicrotask(() => {
        if (!this.isConnected || this._initialized || this._selectChecked || this._ssrDefer) return;
        this._ssrNoDefer = true;
        try {
          this.connectedCallback();
        } finally {
          this._ssrNoDefer = false;
        }
      });
    };
    select.addEventListener('blur', onBlur, { capture: true });
    this._ssrDefer = { select, onBlur };
  }

  /** @private Drop a pending focused-select deferral (listener removed). */
  _cancelSsrDefer() {
    const d = this._ssrDefer;
    if (!d) return;
    this._ssrDefer = null;
    d.select.removeEventListener('blur', d.onBlur, { capture: true });
  }

  /**
   * @private v0.28.0 M3: read a child `<select multiple>` into options (`<optgroup>` → groups), the initial selection
   * (only when neither an early `value` property nor the host `value` attribute set one), the reset default
   * (`defaultSelected`), host attributes; re-point its `<label for>` at the host, then remove it.
   * @param {HTMLSelectElement} select
   */
  _upgradeSelect(select) {
    this._ensureId();
    const vk = this._vk();
    const lk = this._lk();
    const byOpt = new Map();
    const leaf = (opt) => {
      const item = { [vk]: opt.value, [lk]: opt.label.trim() || opt.value };
      if (opt.disabled) item.disabled = true;
      const d = opt.getAttribute('data-description');
      if (d) item.description = d;
      byOpt.set(opt, item);
      return item;
    };
    const tree = [];
    for (const child of select.children) {
      if (child.localName === 'optgroup') {
        const group = { label: child.label, options: [] };
        if (child.disabled) group.disabled = true;
        for (const o of child.children) if (o.localName === 'option') group.options.push(leaf(o));
        tree.push(group);
      } else if (child.localName === 'option') {
        tree.push(leaf(child));
      }
    }
    // EVERY selected option is kept, locked ones too (disabled itself or in a disabled optgroup): it stays selected with
    // its disabled metadata — locked for adding, deselectable like any selected locked row (plan M3)
    const pick = (list) => list.map((o) => byOpt.get(o)).filter(Boolean);
    const live = pick([...(select.selectedOptions || [])]);
    this._selectDefaults = pick([...select.options].filter((o) => o.defaultSelected));
    for (const attr of ['name', 'aria-label']) {
      const v = select.getAttribute(attr);
      if (v != null && !this.hasAttribute(attr)) this.setAttribute(attr, v);
    }
    for (const attr of ['required', 'disabled']) {
      if (select.hasAttribute(attr) && !this.hasAttribute(attr)) this.setAttribute(attr, '');
    }
    if (!this.hasAttribute('selection-only')) this.setAttribute('selection-only', '');
    if (select.id) {
      for (const label of [...(select.labels || [])]) {
        if (label.htmlFor === select.id) label.htmlFor = this.id;
      }
    }
    select.remove();
    if (!this._optionsSet) this.options = tree;
    // selection-only is on and the final options are known: items replayed before the upgrade (early `value` with early
    // `options`) take their option labels now — the `options` replay ran before selection-only and skipped it
    this._relabel();
    // precedence: early `value` property (already applied) > host `value` attribute (afterRender) > live selection
    if (!this._itemsFromProp && !this.hasAttribute('value')) this.setValue(live);
  }

  // --- Properties ---

  get value() { return this.getValue(); }
  set value(v) {
    let list = v;
    if (typeof v === 'string') list = parseChipItems(v);
    if (list == null) list = [];
    if (!Array.isArray(list)) return;
    this.setValue(list);
  }

  get options() { return this._options; }
  set options(data) {
    this._options = Array.isArray(data) ? data : [];
    if (!this._initialized) this._optionsSet = true;
    this._relabel();
    if (this._isOpen && !this._search) this._runSearch(this._currentQuery());
  }

  get search() { return this._search; }
  set search(fn) { this._search = typeof fn === 'function' ? fn : null; }

  get create() { return this._create; }
  set create(fn) { this._create = typeof fn === 'function' ? fn : null; }

  get renderOption() { return this._renderOption; }
  set renderOption(fn) { this._renderOption = typeof fn === 'function' ? fn : null; }

  get renderChip() { return this._renderChip; }
  set renderChip(fn) {
    this._renderChip = typeof fn === 'function' ? fn : null;
    if (this._initialized && this.isConnected) this._renderChips();
  }

  get messages() { return this._messages; }
  set messages(obj) { this._messages = obj && typeof obj === 'object' ? { ...obj } : null; }

  /** @returns {Object[]} normalised items of the last completed search (copy) */
  get lastResults() { return [...this._lastResults]; }

  // --- Attribute helpers ---

  /** @private */
  _int(attr, def, min = 0) {
    const n = parseInt(this.getAttribute(attr) ?? '', 10);
    return Number.isFinite(n) && n >= min ? n : def;
  }
  _vk() { return this.getAttribute('value-key') || 'value'; }
  _lk() { return this.getAttribute('label-key') || 'label'; }
  _maxItems() { return this._int('max-items', 0, 1); }
  _minChars() { return this._int('min-chars', 1, 0); }
  _searchDelay() { return this._int('search-delay', 250, 0); }
  _maxLength() { return this._int('max-length', 200, 1); }
  _isDisabled() { return this._effectiveDisabled; }
  _isFull() {
    const max = this._maxItems();
    return max > 0 && this._items.length >= max;
  }
  /** @private v0.28.0 multi-select mode */
  _selOnly() { return this.hasAttribute('selection-only'); }
  /** @private the RENDERED listbox is the multi-select one (rows in `_rowEls`, highlight = data-active) */
  _rendSel() { return this._list()?.getAttribute('aria-multiselectable') === 'true'; }

  /** @private text from `messages` → `TdChipInput.labels`, placeholders filled */
  _t(key, vars) {
    const own = this._messages && this._messages[key] != null ? this._messages[key] : null;
    return format(own ?? TdChipInput.labels[key] ?? '', vars);
  }

  // --- Items ---

  /** @private any item shape → an object with a non-empty value, or null */
  _norm(x) {
    const vk = this._vk();
    const lk = this._lk();
    if (typeof x === 'string' || typeof x === 'number') {
      const s = String(x);
      return s ? { [vk]: s, [lk]: s } : null;
    }
    if (x && typeof x === 'object') {
      const v = x[vk];
      if (v == null || typeof v === 'object' || String(v) === '') return null;
      return x;
    }
    return null;
  }

  /** @private */
  _val(item) { return String(item[this._vk()]); }

  /** @private */
  _lab(item) {
    const l = item[this._lk()];
    return l != null && typeof l !== 'object' && String(l) !== '' ? String(l) : this._val(item);
  }

  /** @private */
  _has(value) {
    const v = String(value);
    return this._items.some((i) => this._val(i) === v);
  }

  /** @private folded compare (created text vs existing values/labels) */
  _hasFolded(text) {
    const f = fold(text);
    return this._items.some((i) => fold(this._val(i)) === f || fold(this._lab(i)) === f);
  }

  /** @private v0.28.0: a group `{ label, disabled?, options: [] }` (an object without a usable value + an options array) */
  _isGroup(x) {
    return !!x && typeof x === 'object' && Array.isArray(x.options) && this._norm(x) === null;
  }

  /** @private v0.28.0: every leaf of `options` (groups flattened, one level), normalised */
  _leaves() {
    const out = [];
    for (const x of this._options) {
      if (this._isGroup(x)) {
        for (const y of x.options) if (!this._isGroup(y)) out.push(this._norm(y));
      } else out.push(this._norm(x));
    }
    return out.filter(Boolean);
  }

  /** @private v0.28.0 selection-only: a value-only item (label = value) takes the label of the matching option leaf */
  _resolveLeaf(item) {
    if (this._lab(item) !== this._val(item)) return item;
    const v = this._val(item);
    return this._leaves().find((l) => this._val(l) === v) || item;
  }

  /** @private items for the selection: normalise + dedupe (+ option labels in selection-only) */
  _normItems(list) {
    const out = this._normList(list);
    return this._selOnly() ? out.map((i) => this._resolveLeaf(i)) : out;
  }

  /** @private v0.28.0: options arrived after the items → value-only items get their option labels */
  _relabel() {
    if (!this._selOnly() || !this._items.length) return;
    let changed = false;
    const next = this._items.map((i) => {
      const r = this._resolveLeaf(i);
      if (r !== i) changed = true;
      return r;
    });
    if (!changed) return;
    this._items = next;
    if (this._initialized && this._chipsEl()) {
      this._renderChips();
      this._syncForm();
    }
  }

  /** @private normalise + dedupe a list */
  _normList(list) {
    const out = [];
    const seen = new Set();
    for (const x of Array.isArray(list) ? list : []) {
      const item = this._norm(x);
      if (!item) continue;
      const v = this._val(item);
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(item);
    }
    return out;
  }

  // --- Rendering ---

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const ph = this.getAttribute('placeholder') || '';
    const labelHtml = label
      ? `<label class="td-field__label" id="${id}-label" for="${id}-input">${esc(label)}</label>`
      : '';
    return `<div class="td-chip-input" data-state="closed">${labelHtml}`
      + '<div class="td-chip-input__box"><ul class="td-chip-input__chips" hidden></ul>'
      + `<input type="text" class="td-chip-input__input" id="${id}-input" role="combobox" aria-autocomplete="list"`
      + ` aria-expanded="false" aria-controls="${id}-listbox" autocomplete="off" spellcheck="false"`
      + ` maxlength="${this._maxLength()}"${ph ? ` placeholder="${esc(ph)}"` : ''}${this._isDisabled() ? ' disabled' : ''}>`
      + `</div><p class="td-sr-only" id="${id}-status" role="status"></p></div>`;
  }

  afterRender() {
    if (!this._itemsInit) {
      this._itemsInit = true;
      if (!this._itemsFromProp) this._items = this._normItems(this._parseAttr(this.getAttribute('value')) || []);
    }
    this._warnCreate();
    // Persistent body portal (fixed positioning escapes overflow/transform clipping, D13).
    if (!this._menuElement) {
      const menu = document.createElement('div');
      menu.className = 'td-chip-input__menu td-glass-surface td-glass-surface--strong';
      menu.hidden = true;
      menu.setAttribute('data-state', 'closed');
      const list = document.createElement('div');
      list.className = 'td-chip-input__options';
      list.setAttribute('role', 'listbox');
      const empty = document.createElement('p');
      empty.className = 'td-chip-input__empty';
      menu.append(list, empty);
      this._bindMenuEvents(menu);
      document.body.appendChild(menu);
      this._menuElement = menu;
      this._nav = [];
      this._navQuery = null;
      this._cleanups.push(() => {
        menu.remove();
        // Detached on disconnect → forget it so a reconnect (DOM move) recreates the portal.
        if (this._menuElement === menu) this._menuElement = null;
      });
    }
    this._menuElement.id = `${this.id}-menu`;
    this._list().id = `${this.id}-listbox`;

    // The live region is persistent: a structural re-render (label) keeps the same node.
    const status = this.querySelector('.td-chip-input > [role="status"]');
    if (this._statusEl && status && status !== this._statusEl) status.replaceWith(this._statusEl);
    else if (status) this._statusEl = status;

    this._renderChips();
    this._bindHostEvents();
    this._applyName();
    this._applyRequired();
    this._applyFull();
    if (this._isOpen && this._isDisabled()) this.close();
    this._syncForm();
    this._applyErrorState();
  }

  /** In place (focus/caret kept): everything but `label` (structure) and value/label keys (chip content). */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    const input = this._input();
    switch (name) {
      case 'value': {
        const list = this._parseAttr(newVal);
        if (list) this.setValue(list);
        return;
      }
      case 'placeholder':
        if (input) {
          if (newVal) input.setAttribute('placeholder', newVal);
          else input.removeAttribute('placeholder');
        }
        return;
      case 'disabled':
        this._applyDisabled();
        return;
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'name':
        this._syncForm();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal); // base error contract, no re-render
        return;
      case 'max-items':
        this._applyFull();
        return;
      case 'selection-only':
      case 'select-all':
        // v0.28.0: the rows are built per mode → rebuilt on the next open
        this._warnCreate();
        this._navQuery = null;
        this.close();
        return;
      case 'allow-create':
        this._warnCreate(); // read when used (as before)
        return;
      case 'max-length':
        if (input) input.maxLength = this._maxLength();
        return;
      case 'value-key':
      case 'label-key':
        this._items = this._normList(this._items);
        this._renderChips();
        this._syncForm();
        return;
      case 'label': {
        // Structure change: re-render, keeping the typed text and the focused part.
        const text = input ? input.value : '';
        const active = document.activeElement;
        const focusInput = !!input && active === input;
        const chipIndex = active instanceof Element && this.contains(active) && active.closest('.td-chip-input__chip')
          ? Number(active.closest('.td-chip-input__chip').getAttribute('data-index')) : -1;
        this.close();
        this._doRender();
        const next = this._input();
        if (next) next.value = text;
        if (focusInput && next) next.focus({ preventScroll: true });
        else if (chipIndex >= 0) this._focusChip(chipIndex);
        return;
      }
      default:
        // min-chars, search-delay, allow-create, show-on-focus: read when used.
    }
  }

  /** @protected <fieldset disabled> toggles in place (no re-render → focus kept). */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (this._initialized) this._applyDisabled();
  }

  /** @private */
  _applyDisabled() {
    const dis = this._isDisabled();
    const input = this._input();
    if (input) input.disabled = dis;
    this.querySelectorAll('.td-chip-input__remove').forEach((b) => { b.disabled = dis; });
    if (dis) this.close();
  }

  /** @private `aria-required` on the combobox + decorative asterisk in the label. */
  _applyRequired() {
    const input = this._input();
    const required = this.hasAttribute('required');
    if (input) {
      if (required) input.setAttribute('aria-required', 'true');
      else input.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-chip-input > .td-field__label');
    if (!label) return;
    let star = label.querySelector('.td-field__required');
    if (required && !star) {
      star = document.createElement('span');
      star.className = 'td-field__required';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = ' *';
      label.appendChild(star);
    } else if (!required && star) star.remove();
  }

  /** @private Naming precedence (TdFormElement helper); the listbox and the chip list follow the label. */
  _applyName() {
    const input = this._input();
    const hasLabel = !!this.getAttribute('label');
    this._applyAccessibleName(input, hasLabel);
    const labelId = `${this.id}-label`;
    const list = this._list();
    if (list) {
      list.removeAttribute('aria-label');
      list.removeAttribute('aria-labelledby');
      if (hasLabel) list.setAttribute('aria-labelledby', labelId);
      else if (input && input.hasAttribute('aria-label')) list.setAttribute('aria-label', input.getAttribute('aria-label'));
      else if (input && input.hasAttribute('aria-labelledby')) list.setAttribute('aria-labelledby', input.getAttribute('aria-labelledby'));
    }
    const chips = this._chipsEl();
    if (chips) {
      chips.removeAttribute('aria-label');
      chips.removeAttribute('aria-labelledby');
      if (hasLabel) chips.setAttribute('aria-labelledby', labelId);
      else chips.setAttribute('aria-label', this._t('chips'));
    }
  }

  /** @private v0.28.0: `allow-create` has no effect with `selection-only` — one warning per element */
  _warnCreate() {
    if (this._warnedCreate || !this._selOnly() || !this.hasAttribute('allow-create')) return;
    this._warnedCreate = true;
    console.warn('td-chip-input: allow-create is ignored with selection-only (items come only from the options).', this);
  }

  /** @private `data-full` / `data-empty` on the root */
  _applyFull() {
    const root = this._root();
    if (!root) return;
    root.toggleAttribute('data-full', this._isFull());
    root.toggleAttribute('data-empty', this._items.length === 0);
    // v0.28.0 selection-only: a full list stays open (selected rows stay deselectable) — the other rows lock instead
    if (this._isOpen && this._rendSel()) this._refreshRows();
    else if (this._isFull() && this._isOpen) this.close();
  }

  /** @private hook result → Node or text; falls back to `fallback` on null/throw */
  _hookContent(fn, args, fallback) {
    if (fn) {
      try {
        const out = fn(...args);
        if (out instanceof Node) return out;
        if (out != null && out !== '') return document.createTextNode(String(out));
      } catch (err) {
        console.error(err);
      }
    }
    return document.createTextNode(fallback);
  }

  /** @private one chip `li` (DOM APIs only; labels as text) */
  _buildChip(item, index) {
    const li = document.createElement('li');
    li.className = 'td-chip-input__chip';
    li.setAttribute('data-index', String(index));
    const label = document.createElement('span');
    label.className = 'td-chip-input__chip-label';
    label.appendChild(this._hookContent(this._renderChip, [item], this._lab(item)));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-chip-input__remove';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', this._t('remove', { label: this._lab(item) }));
    if (this._isDisabled()) btn.disabled = true;
    const icon = document.createElement('span');
    icon.setAttribute('data-td-icon', 'close');
    icon.setAttribute('data-td-icon-size', 's');
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
    li.append(label, btn);
    fillIconSlots(li);
    return li;
  }

  /** @private rebuild every chip (initial render, setValue, key change) */
  _renderChips() {
    const ul = this._chipsEl();
    if (!ul) return;
    ul.replaceChildren(...this._items.map((item, i) => this._buildChip(item, i)));
    ul.hidden = this._items.length === 0;
    this._applyFull();
  }

  /** @private */
  _renumberChips() {
    const ul = this._chipsEl();
    if (!ul) return;
    [...ul.children].forEach((li, i) => li.setAttribute('data-index', String(i)));
    ul.hidden = ul.children.length === 0;
  }

  // --- Element lookups ---

  /** @private */
  _root() { return this.querySelector('.td-chip-input'); }
  /** @private */
  _input() { return this.querySelector('.td-chip-input__input'); }
  /** @private */
  _chipsEl() { return this.querySelector('.td-chip-input__chips'); }
  /** @private */
  _list() { return this._menuElement ? this._menuElement.querySelector('.td-chip-input__options') : null; }
  /** @private */
  _emptyEl() { return this._menuElement ? this._menuElement.querySelector('.td-chip-input__empty') : null; }
  /** @private */
  _removeButtons() { return [...this.querySelectorAll('.td-chip-input__remove')]; }

  _focusTarget() {
    return this.querySelector('.td-chip-input__input');
  }

  // --- Form participation (D8) ---

  /** @private Push the items + validity to the form. */
  _syncForm() {
    const name = this.getAttribute('name');
    let fd = null;
    if (name && this._items.length) {
      fd = new FormData();
      for (const item of this._items) fd.append(name, this._val(item));
    }
    const state = JSON.stringify(this._items.map((i) => ({ value: this._val(i), label: this._lab(i) })));
    this._setFormValue(fd, state);
    if (this.hasAttribute('required') && !this._items.length) {
      this._setValidity({ valueMissing: true }, this._t('required'), this._focusTarget() || undefined);
    } else {
      this._setValidity({});
    }
  }

  /** @private `value` attribute → list (invalid → null + one warning) */
  _parseAttr(str) {
    const list = parseChipItems(str);
    if (list == null && !this._warnedValue) {
      this._warnedValue = true;
      console.warn('td-chip-input: the value attribute must be a JSON array — ignored.');
    }
    return list;
  }

  _captureDefaults() {
    super._captureDefaults();
    /** @private initial `value` attribute (reset default) */
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    const input = this._input();
    if (input) input.value = '';
    this.close();
    // v0.28.0: adopted from a <select multiple> → the native default (`selected` options), like the select it replaced
    this.setValue(this._selectDefaults ? [...this._selectDefaults] : (this._parseAttr(this._defaultValueAttr) || []));
  }

  _restoreState(state) {
    if (typeof state !== 'string') return;
    const list = parseChipItems(state);
    if (!list) return;
    const vk = this._vk();
    const lk = this._lk();
    this.setValue(list.map((x) => (x && typeof x === 'object' ? { [vk]: x.value, [lk]: x.label } : x)));
  }

  disconnectedCallback() {
    this._cancelSsrDefer(); // v0.28.0: a focused shell still waiting for its blur — re-evaluated on reconnect
    this._createGen += 1;
    this._cancelSearch();
    this._clearResultsTimer();
    if (this._isOpen) {
      this._removeGlobalListeners();
      this._releaseLayer();
      this._isOpen = false; // the portaled menu is removed by the cleanup below
      this._activeIndex = -1;
    }
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    super.disconnectedCallback();
  }

  // --- Events ---

  /** @private host-side listeners (bound per render: the nodes are new) */
  _bindHostEvents() {
    const input = this._input();
    const ul = this._chipsEl();
    const box = this.querySelector('.td-chip-input__box');
    if (!input || !ul || !box) return;
    this.listen(input, 'input', () => this._onInput());
    this.listen(input, 'keydown', (e) => this._onInputKeydown(e));
    // The inner text input's native `change` must not escape as the host's `change` (that one carries detail).
    this.listen(input, 'change', (e) => e.stopPropagation());
    this.listen(input, 'focus', (e) => {
      const from = e.relatedTarget;
      if (from instanceof Node && this.contains(from)) return; // back from a chip: no new search
      if (this.hasAttribute('show-on-focus') && !this._isDisabled() && (this._selOnly() || !this._isFull())) {
        const q = this._currentQuery();
        this._runSearch(q.length >= this._minChars() ? q : '');
      }
    });
    if (!this._hostBound) {
      // Once per connection (the host survives re-renders; disconnect runs the cleanups).
      this._hostBound = true;
      this._cleanups.push(() => { this._hostBound = false; });
      this.listen(this, 'focusout', (e) => {
        const to = e.relatedTarget;
        if (to instanceof Node && (this.contains(to) || (this._menuElement && this._menuElement.contains(to)))) return;
        this.close(); // also drops a pending/in-flight search (no late reopen after blur)
      });
    }
    this.listen(ul, 'click', (e) => {
      const btn = e.target instanceof Element ? e.target.closest('.td-chip-input__remove') : null;
      if (!btn || !ul.contains(btn)) return;
      const li = btn.closest('.td-chip-input__chip');
      this._removeUser(Number(li.getAttribute('data-index')));
    });
    this.listen(ul, 'keydown', (e) => this._onChipKeydown(e));
    // Pointer on the empty box area → the input (chips and the input handle their own presses).
    this.listen(box, 'mousedown', (e) => {
      const t = e.target;
      if (t === box || t === ul) {
        e.preventDefault();
        if (!this._isDisabled()) input.focus();
      }
    });
  }

  /** @private Bound once per portal element (the menu is recreated after a reconnect). */
  _bindMenuEvents(menu) {
    // Options are never focusable: keep DOM focus in the input while pressing inside the popup (dcms bug 2.2.2).
    menu.addEventListener('mousedown', (e) => e.preventDefault());
    menu.addEventListener('click', (e) => {
      const option = e.target instanceof Element ? e.target.closest('.td-chip-input__option') : null;
      if (!option || !menu.contains(option)) return;
      const i = this._rowEls.indexOf(option);
      const entry = this._nav[i];
      if (entry) this._commit(entry);
    });
    menu.addEventListener('mousemove', (e) => {
      const option = e.target instanceof Element ? e.target.closest('.td-chip-input__option') : null;
      if (!option) return;
      const i = this._rowEls.indexOf(option);
      if (i < 0 || (this._rendSel() && this._locked(i))) return; // a locked row is never highlighted
      if (i !== this._activeIndex) {
        this._activeIndex = i;
        this._syncActive(false);
      }
    });
  }

  /** @private */
  _currentQuery() {
    const input = this._input();
    return input ? input.value.trim() : '';
  }

  /** @private typing → debounce + search (D9) */
  _onInput() {
    if (this._isDisabled()) return;
    this._activeIndex = -1;
    this._syncActive(false);
    if (this._isFull() && !this._selOnly()) {
      this.close();
      const msg = this._t('max', { max: this._maxItems() });
      if (this._statusText() !== msg) this._announce(msg);
      return;
    }
    const q = this._currentQuery();
    if (q.length < this._minChars()) {
      // v0.28.0 selection-only: clearing the filter of an open list shows every option again
      if (this._selOnly() && q === '' && this._isOpen) this._runSearch('');
      else this.close();
      return;
    }
    if (!this._search) {
      this._runSearch(q);
      return;
    }
    this._cancelSearch(); // abort the in-flight request + bump seq: its response can never land
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = 0;
      this._runSearch(q);
    }, this._searchDelay());
  }

  /**
   * @private
   * @param {KeyboardEvent} e
   */
  _onInputKeydown(e) {
    if (this._isDisabled() || e.defaultPrevented) return;
    if (e.isComposing || e.keyCode === 229) return; // IME: Enter commits the composition, not an option
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const { key } = e;
    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this._isOpen) this._openFromKey(e.altKey ? null : 'first');
        else if (!e.altKey) this._move(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!this._isOpen) this._openFromKey(e.altKey ? null : 'last');
        else if (!e.altKey) this._move(-1);
        return;
      case 'Enter':
        this._onEnter(e);
        return;
      case 'Escape':
        // Popup open → the layer dispatcher closed it before we got here. Closed → clear the text (APG).
        if (!this._isOpen && input.value) {
          e.preventDefault();
          input.value = '';
          this.close();
        }
        return;
      case 'Backspace':
      case 'ArrowLeft':
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        if (input.selectionStart === 0 && input.selectionEnd === 0 && this._items.length) {
          e.preventDefault();
          this.close();
          this._focusChip(this._items.length - 1); // never deletes directly (D11)
        }
        return;
      default:
    }
  }

  /** @private Enter: active option → pick; else exact match → pick; else create (allow-create). */
  _onEnter(e) {
    if (this._selOnly()) {
      // v0.28.0: only the active row toggles; typed text is a filter (never a chip, never submits the form)
      const entry = this._isOpen && this._activeIndex >= 0 ? this._nav[this._activeIndex] : null;
      if (entry) {
        e.preventDefault();
        this._commit(entry);
      } else e.preventDefault(); // even with an empty input: no implicit form submission, no mutation
      return;
    }
    if (this._isOpen && this._activeIndex >= 0 && this._nav[this._activeIndex]) {
      e.preventDefault();
      this._commit(this._nav[this._activeIndex]);
      return;
    }
    const text = cleanText(this._input()?.value, this._maxLength());
    if (!text) return; // empty input: implicit form submission stays native
    e.preventDefault();
    if (this._isFull()) {
      this._announce(this._t('max', { max: this._maxItems() }));
      return;
    }
    const f = fold(text);
    const pool = [...this._nav.filter((n) => n.item).map((n) => n.item),
      ...(this._search ? [] : this._normList(this._options))];
    const exact = pool.find((i) => fold(this._lab(i)) === f || fold(this._val(i)) === f);
    if (exact) this._addUser(exact);
    else if (this.hasAttribute('allow-create')) this._createFrom(text);
  }

  /**
   * @private keys on a chip remove button (roving focus, D11)
   * @param {KeyboardEvent} e
   */
  _onChipKeydown(e) {
    const btn = e.target instanceof Element ? e.target.closest('.td-chip-input__remove') : null;
    if (!btn || this._isDisabled()) return;
    const i = Number(btn.closest('.td-chip-input__chip').getAttribute('data-index'));
    const last = this._items.length - 1;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._focusChip(Math.max(0, i - 1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        if (i >= last) this._focusInput();
        else this._focusChip(i + 1);
        return;
      case 'Home':
        e.preventDefault();
        this._focusChip(0);
        return;
      case 'End':
        e.preventDefault();
        this._focusChip(last);
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this._removeUser(i);
        return;
      case 'Escape':
        e.preventDefault();
        this._focusInput();
        return;
      default:
        // Enter/Space: the button's native activation click removes it (ul click handler).
    }
  }

  /** @private */
  _focusChip(i) {
    const btns = this._removeButtons();
    const b = btns[Math.max(0, Math.min(i, btns.length - 1))];
    if (b) b.focus();
    else this._focusInput();
  }

  /** @private focus the input with the caret at the start (coming from the chips on the left) */
  _focusInput() {
    const input = this._input();
    if (!input) return;
    input.focus();
    try { input.setSelectionRange(0, 0); } catch { /* not a text input */ }
  }

  // --- Active option (aria-activedescendant) ---

  /**
   * @private `aria-selected="true"` on the active option + `aria-activedescendant` on the input. v0.28.0 multi-select
   * list: `aria-selected` is the membership — the highlight is `data-active` instead.
   */
  _syncActive(scroll = true) {
    const list = this._list();
    let activeEl = null;
    if (list && this._rendSel()) {
      this._rowEls.forEach((el, i) => {
        const on = i === this._activeIndex && this._isOpen;
        el.toggleAttribute('data-active', on);
        if (on) activeEl = el;
      });
    } else if (list) {
      [...list.children].forEach((el, i) => {
        const on = i === this._activeIndex && this._isOpen;
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) activeEl = el;
      });
    }
    const input = this._input();
    if (input) {
      if (activeEl) input.setAttribute('aria-activedescendant', activeEl.id);
      else input.removeAttribute('aria-activedescendant');
    }
    if (activeEl && scroll && typeof activeEl.scrollIntoView === 'function') activeEl.scrollIntoView({ block: 'nearest' });
  }

  /** @private */
  _setActive(i) {
    const n = this._nav.length;
    this._activeIndex = n ? Math.max(-1, Math.min(i, n - 1)) : -1;
    this._syncActive();
  }

  /** @private step with wrap-around (v0.28.0 multi-select: locked rows are skipped) */
  _move(step) {
    const n = this._nav.length;
    if (!n) return;
    if (this._rendSel()) {
      let i = this._activeIndex;
      for (let k = 0; k < n; k++) {
        i = i < 0 ? (step > 0 ? 0 : n - 1) : (i + step + n) % n;
        if (!this._locked(i)) {
          this._setActive(i);
          return;
        }
      }
      return;
    }
    const cur = this._activeIndex;
    this._setActive(cur < 0 ? (step > 0 ? 0 : n - 1) : (cur + step + n) % n);
  }

  /** @private first (dir 1) / last (dir -1) row the keyboard may reach; -1 = none */
  _edge(dir) {
    const n = this._nav.length;
    if (!this._rendSel()) return n ? (dir > 0 ? 0 : n - 1) : -1;
    for (let k = 0; k < n; k++) {
      const i = dir > 0 ? k : n - 1 - k;
      if (!this._locked(i)) return i;
    }
    return -1;
  }

  // --- Search (D9) ---

  /** @private drop the pending debounce + in-flight request; any later response is stale */
  _cancelSearch() {
    this._seq++;
    if (this._debounceTimer) {
      window.clearTimeout(this._debounceTimer);
      this._debounceTimer = 0;
    }
    if (this._loadingTimer) {
      window.clearTimeout(this._loadingTimer);
      this._loadingTimer = 0;
    }
    if (this._ctrl) {
      this._ctrl.abort();
      this._ctrl = null;
    }
  }

  /** @private local suggestions: diacritic-insensitive substring of the label */
  _localFilter(q) {
    const items = this._normList(this._options);
    if (!q) return items;
    const f = fold(q);
    return items.filter((i) => fold(this._lab(i)).includes(f));
  }

  /**
   * @private run one search; only the latest one may render
   * @param {string} q
   * @param {'first'|'last'|null} [activate]
   */
  async _runSearch(q, activate = null) {
    this._cancelSearch();
    const seq = this._seq;
    if (!this._search) {
      this._applyResults(q, this._selOnly() ? this._localTree(q) : this._localFilter(q), activate);
      return;
    }
    const ctrl = new AbortController();
    this._ctrl = ctrl;
    this._loadingTimer = window.setTimeout(() => {
      this._loadingTimer = 0;
      if (seq === this._seq) this._showState('loading');
    }, LOADING_MS);
    let res;
    try {
      res = await this._search(q, { signal: ctrl.signal });
    } catch (error) {
      if (seq !== this._seq || ctrl.signal.aborted || (error && error.name === 'AbortError')) return;
      this._endRequest();
      this._showState('error');
      this.emit('search-error', { query: q, error });
      return;
    }
    if (seq !== this._seq || ctrl.signal.aborted) return; // stale (provider ignored the signal) → dropped
    this._endRequest();
    this._applyResults(q, res, activate);
  }

  /** @private */
  _endRequest() {
    if (this._loadingTimer) {
      window.clearTimeout(this._loadingTimer);
      this._loadingTimer = 0;
    }
    this._ctrl = null;
  }

  /**
   * @private v0.28.0 selection-only local filter: the raw options with groups kept, filtered on the LEAF labels
   * (a group label never matches); emptied groups dropped.
   */
  _localTree(q) {
    const f = q ? fold(q) : '';
    const match = (x) => {
      const item = this._norm(x);
      return !!item && (!f || fold(this._lab(item)).includes(f));
    };
    const out = [];
    for (const x of this._options) {
      if (this._isGroup(x)) {
        const kept = x.options.filter((y) => !this._isGroup(y) && match(y));
        if (kept.length) out.push({ label: x.label, disabled: x.disabled, options: kept });
      } else if (match(x)) out.push(x);
    }
    return out;
  }

  /**
   * @private v0.28.0: raw options / results → navigation model of the multi-select list (deduped by value):
   * `[{ all: true }?, { item, off, group? }…]`; `off` = disabled item or item of a disabled group.
   * @returns {Array<Object>} the leaf entries (the select-all row is added by the caller)
   */
  _selEntries(raw) {
    const seen = new Set();
    const out = [];
    const leaf = (x, group) => {
      const item = this._norm(x);
      if (!item) return;
      const v = this._val(item);
      if (seen.has(v)) return;
      seen.add(v);
      out.push({ item, off: item.disabled === true || (!!group && group.off), group });
    };
    for (const x of Array.isArray(raw) ? raw : []) {
      if (this._isGroup(x)) {
        const label = x.label;
        const group = { label: label != null && typeof label !== 'object' ? String(label) : '', off: x.disabled === true };
        for (const y of x.options) if (!this._isGroup(y)) leaf(y, group);
      } else leaf(x, null);
    }
    return out;
  }

  /** @private v0.28.0 selection-only results: every leaf listed (selected ones with ✓), the list stays open when full */
  _applySelResults(q, raw, activate) {
    const leaves = this._selEntries(raw);
    this._lastResults = leaves.map((e) => e.item);
    const nav = this.hasAttribute('select-all') && leaves.length ? [{ all: true }, ...leaves] : leaves;
    this._nav = nav;
    this._navQuery = q;
    this._renderOptions(q);
    if (!leaves.length && !q) {
      this._hide();
      return;
    }
    this._setEmpty(leaves.length ? '' : 'none');
    this._show();
    this._activeIndex = -1;
    this._setActive(activate === 'first' ? this._edge(1) : activate === 'last' ? this._edge(-1) : -1);
    this._clearResultsTimer();
    const n = leaves.length;
    this._resultsTimer = window.setTimeout(() => {
      this._resultsTimer = 0;
      if (this._isOpen) this._announce(n ? this._t('results', { n }) : this._t('noResults'));
    }, RESULTS_MS);
  }

  /** @private show a results list (or "no results") */
  _applyResults(q, raw, activate) {
    if (this._isDisabled() || !this.isConnected) return;
    if (this._selOnly()) {
      this._applySelResults(q, raw, activate);
      return;
    }
    if (this._isFull()) return;
    const items = this._normList(raw);
    this._lastResults = items;
    const shown = items.filter((i) => !this._has(this._val(i)));
    const nav = shown.map((item) => ({ item }));
    const text = cleanText(q, this._maxLength());
    if (this.hasAttribute('allow-create') && text && !this._hasFolded(text)) {
      const f = fold(text);
      if (!items.some((i) => fold(this._lab(i)) === f || fold(this._val(i)) === f)) nav.push({ create: text });
    }
    this._nav = nav;
    this._navQuery = q;
    this._renderOptions(q);
    if (!nav.length && !q) {
      this._hide();
      return;
    }
    this._setEmpty(nav.length ? '' : 'none');
    this._show();
    this._activeIndex = -1;
    this._setActive(activate === 'first' ? 0 : activate === 'last' ? nav.length - 1 : -1);
    this._clearResultsTimer();
    const n = shown.length;
    this._resultsTimer = window.setTimeout(() => {
      this._resultsTimer = 0;
      if (this._isOpen) this._announce(n ? this._t('results', { n }) : this._t('noResults'));
    }, RESULTS_MS);
  }

  /** @private loading / error: popup with only the state row */
  _showState(kind) {
    if (this._isDisabled() || !this.isConnected) return;
    this._nav = [];
    this._navQuery = null;
    this._renderOptions('');
    this._setEmpty(kind);
    this._show();
    this._activeIndex = -1;
    this._syncActive(false);
    this._announce(this._t(kind === 'loading' ? 'loading' : 'error'));
  }

  /** @private */
  _setEmpty(kind) {
    const empty = this._emptyEl();
    if (!empty) return;
    const text = kind === 'none' ? this._t('noResults') : kind === 'loading' ? this._t('loading')
      : kind === 'error' ? this._t('error') : '';
    if (kind) empty.setAttribute('data-kind', kind);
    else empty.removeAttribute('data-kind');
    if (empty.textContent !== text) empty.textContent = text;
  }

  /** @private options via DOM APIs (data never reaches innerHTML; ids from indices) */
  _renderOptions(query) {
    const list = this._list();
    if (!list) return;
    if (this._selOnly()) {
      this._renderSelRows(query);
      return;
    }
    list.removeAttribute('aria-multiselectable');
    const nodes = this._nav.map((entry, i) => {
      const el = document.createElement('div');
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', 'false');
      if (entry.item) {
        el.className = 'td-chip-input__option';
        el.id = `${this.id}-opt-${i}`;
        el.setAttribute('data-index', String(i));
        const label = document.createElement('span');
        label.className = 'td-chip-input__option-label';
        label.appendChild(this._hookContent(this._renderOption, [entry.item, { query }], this._lab(entry.item)));
        el.appendChild(label);
        const desc = entry.item.description;
        if (!this._renderOption && desc != null && typeof desc !== 'object' && String(desc) !== '') {
          const d = document.createElement('span');
          d.className = 'td-chip-input__option-desc';
          d.textContent = String(desc);
          el.appendChild(d);
        }
      } else {
        el.className = 'td-chip-input__option td-chip-input__option--create';
        el.id = `${this.id}-opt-create`;
        el.textContent = this._t('create', { text: entry.create });
      }
      return el;
    });
    list.replaceChildren(...nodes);
    this._rowEls = nodes;
    if (this._isOpen) this._updatePosition();
  }

  /**
   * @private v0.28.0 multi-select rows (DOM APIs only; ids from indices): `[select-all row] + rows`, a group's rows
   * inside `div.td-chip-input__group[role=group][aria-labelledby]` after its `role="presentation"` header. Every row
   * carries the ✓ slot; states (aria-selected / aria-disabled / select-all text) come from `_refreshRows()`.
   */
  _renderSelRows(query) {
    const list = this._list();
    list.setAttribute('aria-multiselectable', 'true');
    const rows = [];
    const nodes = [];
    let group = null;
    let groupEl = null;
    let gi = 0;
    this._nav.forEach((entry, i) => {
      const el = document.createElement('div');
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', 'false');
      // v0.36.0 (ADR 0017): the shared td-checkbox mark, always visible (empty box = not selected)
      const check = createCheckMark('sm');
      check.classList.add('td-chip-input__check');
      const label = document.createElement('span');
      label.className = 'td-chip-input__option-label';
      el.append(check, label);
      if (entry.all) {
        el.className = 'td-chip-input__option td-chip-input__option--all';
        el.id = `${this.id}-opt-all`;
      } else {
        el.className = 'td-chip-input__option';
        el.id = `${this.id}-opt-${i}`;
        el.setAttribute('data-index', String(i));
        el.setAttribute('data-value', this._val(entry.item));
        label.appendChild(this._hookContent(this._renderOption, [entry.item, { query }], this._lab(entry.item)));
        const desc = entry.item.description;
        if (!this._renderOption && desc != null && typeof desc !== 'object' && String(desc) !== '') {
          const d = document.createElement('span');
          d.className = 'td-chip-input__option-desc';
          d.textContent = String(desc);
          el.appendChild(d);
        }
      }
      rows.push(el);
      if (entry.group) {
        if (entry.group !== group) {
          group = entry.group;
          groupEl = document.createElement('div');
          groupEl.className = 'td-chip-input__group';
          groupEl.setAttribute('role', 'group');
          const head = document.createElement('div');
          head.className = 'td-chip-input__group-label';
          head.setAttribute('role', 'presentation');
          head.id = `${this.id}-grp-${gi++}`;
          head.textContent = group.label;
          groupEl.setAttribute('aria-labelledby', head.id);
          groupEl.appendChild(head);
          nodes.push(groupEl);
        }
        groupEl.appendChild(el);
      } else {
        group = null;
        nodes.push(el);
      }
    });
    list.replaceChildren(...nodes);
    fillIconSlots(list);
    this._rowEls = rows;
    this._refreshRows();
    if (this._isOpen) this._updatePosition();
  }

  /** @private v0.28.0 select-all state over the SHOWN leaves: mode add | remove | none, N = shown enabled leaves */
  _allState() {
    const shown = this._nav.filter((e) => e.item);
    const enabled = shown.filter((e) => !e.off);
    const addable = enabled.filter((e) => !this._has(this._val(e.item)));
    // Only enabled rows: bulk deselect never drops a locked (disabled / disabled-group) selection.
    const selected = enabled.filter((e) => this._has(this._val(e.item)));
    const mode = addable.length && !this._isFull() ? 'add' : selected.length ? 'remove' : 'none';
    return { mode, n: enabled.length, addable, selected };
  }

  /** @private v0.28.0: may row `i` NOT be activated / toggled on? (a selected row is always deselectable) */
  _locked(i) {
    const entry = this._nav[i];
    if (!entry) return true;
    if (entry.all) return this._allState().mode === 'none';
    return !this._has(this._val(entry.item)) && (entry.off || this._isFull());
  }

  /** @private v0.28.0: membership (aria-selected), locks (aria-disabled) and the select-all text, in place */
  _refreshRows() {
    if (!this._rendSel()) return;
    this._nav.forEach((entry, i) => {
      const el = this._rowEls[i];
      if (!el) return;
      if (entry.all) {
        const st = this._allState();
        el.setAttribute('aria-selected', st.mode === 'remove' ? 'true' : 'false');
        // v0.36.0: some (not all) shown enabled leaves selected → the select-all mark shows the mixed bar
        el.toggleAttribute('data-td-check-mixed', st.mode === 'add' && st.selected.length > 0);
        const text = this._t(st.mode === 'remove' ? 'deselectAll' : 'selectAll', { n: st.n });
        const label = el.querySelector('.td-chip-input__option-label');
        if (label && label.textContent !== text) label.textContent = text;
      } else {
        el.setAttribute('aria-selected', this._has(this._val(entry.item)) ? 'true' : 'false');
      }
      if (this._locked(i)) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    });
  }

  // --- Announcements (D12) ---

  /** @private */
  _clearResultsTimer() {
    if (this._resultsTimer) {
      window.clearTimeout(this._resultsTimer);
      this._resultsTimer = 0;
    }
  }

  /** @private */
  _statusText() {
    return this._statusEl ? this._statusEl.textContent.replace(/ $/, '') : '';
  }

  /** @private swap the text of the ONE status region (a repeat toggles a trailing NBSP so it is re-announced) */
  _announce(msg) {
    this._clearResultsTimer();
    const el = this._statusEl;
    if (!el) return;
    el.textContent = el.textContent === msg ? `${msg} ` : msg;
  }

  // --- Mutations ---

  /** @private commit a nav entry (pick or create; v0.28.0 multi-select list: toggle / select-all) */
  _commit(entry) {
    if (this._rendSel()) {
      if (entry.all) this._toggleAll();
      else if (entry.item) this._toggle(entry);
      return;
    }
    if (entry.item) this._addUser(entry.item);
    else if ('create' in entry) this._createFrom(entry.create);
  }

  /**
   * @private user add: dedupe, max-items, clear text, close, announce, form, ONE `change`
   * @returns {boolean}
   */
  _addUser(raw, opts) {
    if (this._isDisabled()) return false;
    const item = this._norm(raw);
    if (!item) return false;
    if (this._has(this._val(item))) {
      this._announce(this._t('duplicate', { label: this._lab(item) }));
      return false;
    }
    if (this._isFull()) {
      this._announce(this._t('max', { max: this._maxItems() }));
      return false;
    }
    this._items.push(item);
    const ul = this._chipsEl();
    if (ul) ul.appendChild(this._buildChip(item, this._items.length - 1));
    this._renumberChips();
    const input = this._input();
    if (input && !(opts && opts.keepInput)) input.value = '';
    this._navQuery = null;
    this.close();
    this._applyFull();
    const added = this._t('added', { label: this._lab(item) });
    this._announce(this._isFull() ? `${added}. ${this._t('max', { max: this._maxItems() })}` : added);
    this._syncForm();
    this.emit('change', { value: this.getValue(), items: this.getValue(), added: item });
    return true;
  }

  /**
   * @private v0.28.0 selection-only toggle of one row: selected → removed (always allowed); else added unless locked
   * (disabled / full). The text and the popup stay (close-on-select: both cleared / closed). ONE `change`.
   */
  _toggle(entry) {
    if (this._isDisabled()) return;
    const v = this._val(entry.item);
    const index = this._items.findIndex((i) => this._val(i) === v);
    if (index >= 0) {
      this._removeUser(index, false);
    } else {
      if (entry.off) return;
      if (this._isFull()) {
        this._announce(this._t('max', { max: this._maxItems() }));
        return;
      }
      const item = entry.item;
      this._items.push(item);
      const ul = this._chipsEl();
      if (ul) ul.appendChild(this._buildChip(item, this._items.length - 1));
      this._renumberChips();
      this._applyFull();
      const added = this._t('added', { label: this._lab(item) });
      this._announce(this._isFull() ? `${added}. ${this._t('max', { max: this._maxItems() })}` : added);
      this._syncForm();
      this.emit('change', { value: this.getValue(), items: this.getValue(), added: item });
    }
    this._afterToggle();
  }

  /**
   * @private v0.28.0 select-all row: add every SHOWN unselected enabled leaf (stops at `max-items`) or remove the shown
   * selected ones. ONE `change` with `addedItems` / `removedItems`.
   */
  _toggleAll() {
    if (this._isDisabled()) return;
    const st = this._allState();
    if (st.mode === 'add') {
      const added = [];
      for (const e of st.addable) {
        if (this._isFull()) break;
        this._items.push(e.item);
        added.push(e.item);
      }
      this._renderChips();
      const msg = this._t('addedMany', { n: added.length });
      this._announce(this._isFull() ? `${msg}. ${this._t('max', { max: this._maxItems() })}` : msg);
      this._syncForm();
      this.emit('change', { value: this.getValue(), items: this.getValue(), addedItems: added });
    } else if (st.mode === 'remove') {
      const drop = new Set(st.selected.map((e) => this._val(e.item)));
      const removed = this._items.filter((i) => drop.has(this._val(i)));
      this._items = this._items.filter((i) => !drop.has(this._val(i)));
      this._renderChips();
      this._announce(this._t('removedMany', { n: removed.length }));
      this._syncForm();
      this.emit('change', { value: this.getValue(), items: this.getValue(), removedItems: removed });
    } else {
      return;
    }
    this._afterToggle();
  }

  /** @private after a multi-select toggle: refresh the rows, or close (`close-on-select`, text cleared) */
  _afterToggle() {
    if (this.hasAttribute('close-on-select')) {
      const input = this._input();
      if (input) input.value = '';
      this._navQuery = null;
      this.close();
    } else {
      this._refreshRows();
      // A just-deselected locked row (disabled / disabled group) can't stay active: move on, or clear.
      const a = this._activeIndex;
      if (a >= 0 && this._locked(a)) {
        this._move(1);
        if (this._activeIndex === a) this._setActive(-1);
      }
    }
  }

  /** @private typed text → item (default `{value: text, label: text}` or the `create` hook) */
  async _createFrom(rawText) {
    const text = cleanText(rawText, this._maxLength());
    if (!text || this._creating || this._isDisabled()) return;
    if (this._isFull()) {
      this._announce(this._t('max', { max: this._maxItems() }));
      return;
    }
    if (this._hasFolded(text)) {
      this._announce(this._t('duplicate', { label: text }));
      return;
    }
    let item;
    const inputEl = this._input();
    const typed = inputEl ? inputEl.value : '';
    if (this._create) {
      this._creating = true;
      const gen = this._createGen; // reset / setValue / disconnect while awaiting invalidate this result
      try {
        item = await this._create(text);
      } catch (err) {
        console.error(err);
        item = null;
      } finally {
        this._creating = false;
      }
      if (!this.isConnected || gen !== this._createGen) return;
    } else {
      item = { [this._vk()]: text, [this._lk()]: text };
    }
    if (item == null) return; // the hook declined (it may call setError)
    const now = this._input();
    // the user kept typing while create() ran: add the item but never wipe the newer text
    this._addUser(item, { keepInput: !!now && now.value !== typed });
  }

  /**
   * @private user removal: only this `li` goes; focus → next chip, else previous, else the input (`moveFocus` false:
   * v0.28.0 deselect from the list — the focus stays where it is)
   */
  _removeUser(index, moveFocus = true) {
    if (this._isDisabled()) return;
    const item = this._items[index];
    if (!item) return;
    const ul = this._chipsEl();
    const li = ul ? ul.children[index] : null;
    const active = document.activeElement;
    const hadFocus = !!li && li.contains(active);
    this._items.splice(index, 1);
    if (li) li.remove();
    this._renumberChips();
    this._applyFull();
    if (moveFocus && (hadFocus || !active || active === document.body)) {
      const btns = this._removeButtons();
      const next = btns[index] || btns[index - 1];
      if (next) next.focus();
      else this._focusInput();
    }
    this._announce(this._t('removed', { label: this._lab(item) }));
    this._syncForm();
    this.emit('change', { value: this.getValue(), items: this.getValue(), removed: item });
  }

  // --- Open / close ---

  /** @private ArrowDown/ArrowUp on a closed popup: cached results or a new search */
  _openFromKey(activate) {
    if (this._isDisabled()) return;
    if (this._isFull() && !this._selOnly()) {
      this._announce(this._t('max', { max: this._maxItems() }));
      return;
    }
    const q = this._currentQuery();
    if (this._navQuery === q && this._nav.length) {
      this._show();
      this._refreshRows();
      this._setActive(activate === 'first' ? this._edge(1) : activate === 'last' ? this._edge(-1) : -1);
      return;
    }
    if (q && q.length < this._minChars()) return; // typed text too short: no search (only an EMPTY input may search '')
    this._runSearch(q, activate);
  }

  /** Show the suggestions for the current text (runs a search when needed). */
  open() {
    if (this._isOpen) {
      this._updatePosition();
      return;
    }
    this._openFromKey(null);
  }

  /** Close the suggestions popup; drops any pending or in-flight search. */
  close() {
    this._cancelSearch();
    this._clearResultsTimer();
    this._hide();
  }

  /** @private */
  _show() {
    const menu = this._menuElement;
    const input = this._input();
    if (!menu || !input) return;
    if (this._isOpen) {
      this._updatePosition();
      return;
    }
    this._isOpen = true;
    menu.hidden = false;
    menu.setAttribute('data-state', 'open');
    this._root()?.setAttribute('data-state', 'open');
    input.setAttribute('aria-expanded', 'true');
    this._placeMenu();
    // Floating registration at LAYERS.popover: usable over a modal, owns Escape/Tab while open.
    this._layer = registerLayer({
      layer: LAYERS.popover,
      element: menu,
      keyboard: 'boundary',
      onEscape: () => {
        this.close();
        return true; // consumed: a lower modal/lightbox never sees it
      },
      onTab: () => {
        this.close();
        return 'pass'; // focus never lives in the popup: the native Tab (or a lower trap) moves on
      },
      // v0.21.1: a newer modal / lightbox (or the closing dialog this field lives in) covers it → close
      anchor: this,
      onCovered: () => this.close(),
    });
    this._addGlobalListeners();
  }

  /** @private */
  _hide() {
    const wasOpen = this._isOpen;
    this._isOpen = false;
    this._activeIndex = -1;
    const menu = this._menuElement;
    if (menu) {
      menu.hidden = true;
      menu.setAttribute('data-state', 'closed');
    }
    this._root()?.setAttribute('data-state', 'closed');
    const input = this._input();
    if (input) input.setAttribute('aria-expanded', 'false');
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    this._removeGlobalListeners();
    this._releaseLayer();
    if (wasOpen) this._syncActive(false);
  }

  /** @private */
  _releaseLayer() {
    if (this._layer) {
      this._layer.release();
      this._layer = null;
    }
  }

  /** @private */
  _addGlobalListeners() {
    document.addEventListener('pointerdown', this._boundPointerOutside, true);
    window.addEventListener('resize', this._boundOnResize);
    window.addEventListener('scroll', this._boundOnScroll, true);
    // v0.21.1: field hidden without a scroll (tab switch), removed, or moved by an entry transition
    const box = this.querySelector('.td-chip-input__box');
    if (this._unwatchRef) this._unwatchRef();
    this._unwatchRef = box ? watchReference(box, () => this._updatePosition()) : null;
  }

  /** @private */
  _removeGlobalListeners() {
    document.removeEventListener('pointerdown', this._boundPointerOutside, true);
    window.removeEventListener('resize', this._boundOnResize);
    window.removeEventListener('scroll', this._boundOnScroll, true);
    if (this._unwatchRef) {
      this._unwatchRef();
      this._unwatchRef = null;
    }
  }

  /** @private reposition; close once the field box is scrolled out of view / not rendered */
  _updatePosition() {
    if (!this._isOpen || !this._menuElement) return;
    const box = this.querySelector('.td-chip-input__box');
    if (!box) return;
    if (isReferenceHidden(box.getBoundingClientRect(), box)) {
      this.close();
      return;
    }
    this._placeMenu();
  }

  /** @private same width as the field box, below preferred, flips; geometry via CSSOM only */
  _placeMenu() {
    const menu = this._menuElement;
    const box = this.querySelector('.td-chip-input__box');
    if (!menu || !box) return;
    const { side } = placeFloating(box, menu, { width: 'match', list: this._list(), listMax: MAX_VISIBLE * OPTION_PX });
    menu.setAttribute('data-placement', side);
  }

  // --- Public API (programmatic mutations are silent: no `change`, no announcement) ---

  /** @returns {Object[]} current items (copy) */
  getValue() {
    return [...this._items];
  }

  /**
   * Replace the items (silent). Strings/numbers become `{value, label}`; invalid entries and duplicates are dropped.
   * @param {Array} items
   */
  setValue(items) {
    this._createGen += 1;
    this._itemsFromProp = true;
    this._items = this._normItems(items);
    this._navQuery = null;
    if (!this._initialized || !this._chipsEl()) return;
    if (this._isOpen) this.close();
    this._renderChips();
    this._syncForm();
  }

  /**
   * Add one item (silent). Rejected when invalid, a duplicate (by value) or `max-items` is reached.
   * @param {Object|string} item
   * @returns {boolean}
   */
  addItem(item) {
    const n = this._norm(item);
    if (!n || this._has(this._val(n)) || this._isFull()) return false;
    this.setValue([...this._items, n]);
    return true;
  }

  /**
   * Remove the item with this value (silent).
   * @param {string|number} value
   * @returns {boolean}
   */
  removeItem(value) {
    const v = String(value);
    const i = this._items.findIndex((it) => this._val(it) === v);
    if (i < 0) return false;
    const next = [...this._items];
    next.splice(i, 1);
    this.setValue(next);
    return true;
  }

  /** Remove every item (silent). */
  clear() {
    this.setValue([]);
  }
}

if (!customElements.get('td-chip-input')) {
  customElements.define('td-chip-input', TdChipInput);
}
