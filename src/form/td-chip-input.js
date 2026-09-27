import { fold } from '../utils/typeahead.js';
import { placeFloating, isReferenceHidden } from '../utils/floating.js';
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
 * @fires change - User add/remove only: detail `{ value: items, items, added? , removed? }` (programmatic API is silent)
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
      'allow-create', 'show-on-focus', 'value-key', 'label-key', 'max-length', 'error-text', 'aria-label'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'allow-create', 'show-on-focus'];
  }

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
    super.connectedCallback();
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
      if (!this._itemsFromProp) this._items = this._normList(this._parseAttr(this.getAttribute('value')) || []);
    }
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

  /** @private `data-full` / `data-empty` on the root */
  _applyFull() {
    const root = this._root();
    if (!root) return;
    root.toggleAttribute('data-full', this._isFull());
    root.toggleAttribute('data-empty', this._items.length === 0);
    if (this._isFull() && this._isOpen) this.close();
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
    this.setValue(this._parseAttr(this._defaultValueAttr) || []);
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
      if (this.hasAttribute('show-on-focus') && !this._isDisabled() && !this._isFull()) {
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
      const i = [...option.parentNode.children].indexOf(option);
      const entry = this._nav[i];
      if (entry) this._commit(entry);
    });
    menu.addEventListener('mousemove', (e) => {
      const option = e.target instanceof Element ? e.target.closest('.td-chip-input__option') : null;
      if (!option) return;
      const i = [...option.parentNode.children].indexOf(option);
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
    if (this._isFull()) {
      this.close();
      const msg = this._t('max', { max: this._maxItems() });
      if (this._statusText() !== msg) this._announce(msg);
      return;
    }
    const q = this._currentQuery();
    if (q.length < this._minChars()) {
      this.close();
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

  /** @private `aria-selected="true"` on the active option + `aria-activedescendant` on the input */
  _syncActive(scroll = true) {
    const list = this._list();
    let activeEl = null;
    if (list) {
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

  /** @private step with wrap-around */
  _move(step) {
    const n = this._nav.length;
    if (!n) return;
    const cur = this._activeIndex;
    this._setActive(cur < 0 ? (step > 0 ? 0 : n - 1) : (cur + step + n) % n);
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
      this._applyResults(q, this._localFilter(q), activate);
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

  /** @private show a results list (or "no results") */
  _applyResults(q, raw, activate) {
    if (this._isDisabled() || this._isFull() || !this.isConnected) return;
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
    if (this._isOpen) this._updatePosition();
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

  /** @private commit a nav entry (pick or create) */
  _commit(entry) {
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

  /** @private user removal: only this `li` goes; focus → next chip, else previous, else the input */
  _removeUser(index) {
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
    if (hadFocus || !active || active === document.body) {
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
    if (this._isFull()) {
      this._announce(this._t('max', { max: this._maxItems() }));
      return;
    }
    const q = this._currentQuery();
    if (this._navQuery === q && this._nav.length) {
      this._show();
      this._setActive(activate === 'first' ? 0 : activate === 'last' ? this._nav.length - 1 : -1);
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
  }

  /** @private */
  _removeGlobalListeners() {
    document.removeEventListener('pointerdown', this._boundPointerOutside, true);
    window.removeEventListener('resize', this._boundOnResize);
    window.removeEventListener('scroll', this._boundOnScroll, true);
  }

  /** @private reposition; close once the field box is scrolled out of view / not rendered */
  _updatePosition() {
    if (!this._isOpen || !this._menuElement) return;
    const box = this.querySelector('.td-chip-input__box');
    if (!box) return;
    if (isReferenceHidden(box.getBoundingClientRect())) {
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
    this._items = this._normList(items);
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
