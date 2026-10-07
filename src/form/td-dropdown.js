import { fold, nextTypeaheadIndex } from '../utils/typeahead.js';
import { ValueTitleWatcher, displayedValueText } from '../utils/value-title.js';
import { isCoarsePointer } from '../utils/breakpoints.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';
import { LAYERS, register as registerLayer, bridgeTheme } from '../utils/layers.js';
import { TdFormElement } from '../base/td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

const CLEAR = '__CLEAR__';
const OPTION_PX = 40; // --td-dropdown-option-h: `max-height` = visible options × 40 px
const TYPEAHEAD_MS = 500;
/** Properties that may be set on the element before it upgrades (they would shadow the class accessors). */
const UPGRADE_PROPS = ['options', 'onChange', 'onSelect', 'onCreate', 'createLabel'];

/** @private Run a site callback; a throw is logged and never breaks the component flow. */
function safeCall(fn, arg, what) {
  try {
    fn(arg);
  } catch (err) {
    console.error(`td-dropdown: ${what} threw`, err);
  }
}


/**
 * Dropdown (select-only combobox) with a searchable popup, keyboard navigation and auto-positioning.
 * Token-native since 0.9.0 (plan v0.9.0-batch3 step 4, D17–D19): styles come from td.css
 * (`components/dropdown.css`, block `.td-dropdown`); state lives in `aria-*`, `[hidden]`, `data-state`,
 * `data-active`, `data-placement` — no Tailwind classes, only menu geometry is written through CSSOM.
 *
 * Rendered DOM:
 *   <td-dropdown id="{host}">
 *     <div class="td-dropdown" data-state="closed|open">
 *       [<label class="td-field__label" id="{host}-label" for="{host}-trigger">{label}[<span class="td-field__required"> *</span>]</label>]
 *       <button type="button" class="td-dropdown__trigger" id="{host}-trigger" role="combobox" aria-haspopup="listbox"
 *               aria-expanded aria-controls="{host}-listbox" [aria-activedescendant] [aria-required] [aria-invalid] …>
 *         <span class="td-dropdown__value" [data-placeholder]>…</span>
 *         <span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span>
 *       </button>
 *     </div>
 *     [<span class="td-field-error" id="{host}-error" data-for="{host}">…</span>]
 *   </td-dropdown>
 *   <body> portal (persistent while connected):
 *   <div class="td-dropdown__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden data-state data-placement>
 *     [<div class="td-dropdown__search-wrap"><input class="td-dropdown__search" aria-label="{labels.search}" aria-autocomplete="list"
 *        aria-controls="{host}-listbox" [aria-activedescendant]></div>]
 *     <p class="td-dropdown__empty" role="status">[{labels.noResults}]</p>
 *     <div class="td-dropdown__options" role="listbox" id="{host}-listbox">          (not scrolling — v0.22.0)
 *       <div class="td-dropdown__scroller" role="presentation">                       (the scroll area, gets max-height)
 *         [<div class="td-dropdown__option td-dropdown__option--clear" role="option" id="{host}-opt-clear" data-value="__CLEAR__" data-nav>…]
 *         <div class="td-dropdown__option" role="option" id="{host}-opt-{i}" aria-selected data-value data-index data-nav [data-active]>…
 *       </div>
 *       [<div class="td-dropdown__option td-dropdown__option--create" role="option" id="{host}-opt-create" aria-selected="false" data-nav>
 *          <span class="td-dropdown__create-icon" data-td-icon="plus" aria-hidden="true"></span><span class="td-dropdown__option-label">…</span></div>]
 *     </div>
 *   </div>
 * Every row carries `data-nav` = its index in the navigation model (`_nav`); rows are found by it, never by position.
 *
 * Keyboard (APG select-only combobox): options are never focusable; the focused control (trigger, or the search input
 * when it has focus) carries `aria-activedescendant`. Closed trigger: ArrowDown/ArrowUp/Enter/Space open (active =
 * selected or first), Home/End open on the first/last option, printable keys open + type-ahead. Open: ArrowUp/Down
 * (wrap, the clear option is part of the model), Home/End (trigger only — in the search box they move the caret),
 * PageUp/PageDown (± `max-height`), Enter selects the active option (also from the search box), Alt+ArrowUp selects,
 * Space on the trigger selects (or closes), printable keys on the trigger = type-ahead. Escape and Tab go through the
 * shared layer dispatcher (src/utils/layers.js): Escape closes and focuses the trigger (consumed, a lower layer never
 * sees it); Tab from the search input returns focus to the trigger (D19), Tab on the trigger closes and passes the key
 * on (a lower modal trap still wraps). The open menu is a floating registration at LAYERS.popover (usable in a modal).
 *
 * **Form-associated (ElementInternals, 0.2.0):** submits the selected option's value in any host `<form>`, supports
 * `required` (→ `valueMissing` until something is picked), reset (restores the initial `value`), `<fieldset disabled>`,
 * and state restore (bfcache/autofill re-selects by value). Error contract: `error-text`, `setError()`, `clearError()`.
 *
 * **Progressive enhancement from a native `<select>` (0.17.0 E2):** on the FIRST connect, a direct child `<select>` (and
 * no `options` assigned from JS) is read into `options` — `<optgroup>` flattened (group labels dropped), an option is
 * disabled when it or its `<optgroup>` is. Selection: the host `value` attribute if present, else the select's LIVE
 * `value` (a choice the user made before JS ran, or the first option when none is `selected`). Reset returns to the
 * native default (last `selected` option, else the first enabled one). `name` / `required` / `disabled` / `aria-label`
 * are taken from the select when the host lacks them; `<label for="{select id}">` is re-pointed at the host. The select
 * is then removed (the component submits instead). A `<select multiple>` is NOT upgraded (single choice only): it is
 * left in place, working natively, with a `console.warn`.
 *
 * **SSR shell (v0.26.0, ADR 0012, contract `data-td-ssr="dropdown@1"` — PHP td_dropdown element mode):** the same
 * select markup with `class="td-dropdown__native"`; td.css gives the select the exact trigger BOX (native arrow kept), so
 * the upgrade above moves nothing. If that select is FOCUSED at the first connect, nothing happens (no upgrade, no
 * render, no bind) until it blurs — then the normal path runs once with the choice made meanwhile. The marker is removed
 * on upgrade. No / another marker → the 0.17 path at once.
 *
 * **Disabled options (0.17.0 E2):** an option with `disabled: true` renders `aria-disabled="true"`, stays visible
 * (dimmed), cannot be picked with the mouse or keyboard and is skipped by ↑↓ / Home / End / PageUp / PageDown /
 * type-ahead. `setValue()` may still select it programmatically (as a native select).
 *
 * @element td-dropdown
 * @attr {string} label - Visible label (names the combobox; 0.9.0)
 * @attr {string} placeholder - Placeholder text (default "Chọn một tùy chọn")
 * @attr {boolean} searchable - Enable search filtering (default on)
 * @attr {boolean} disabled - Disable the dropdown (also via ancestor <fieldset disabled>)
 * @attr {boolean} required - A value must be selected for the form to be valid
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {boolean} allow-clear - Show clear option when item selected (default on)
 * @attr {number} max-height - Max visible options count (default 5)
 * @attr {string} value-key - Key for option value (default "value")
 * @attr {string} label-key - Key for option label (default "label")
 * @attr {string} value - Initial selected value (the attribute is NOT live — read/write the `value` property)
 * @attr {string} error-text - Error message (aria-invalid + note; 0.9.0)
 * @attr {string} create-label - Shows a fixed "add new" action row at the bottom of the menu (v0.22.0; empty = off)
 * @fires change - When selection changes, detail: { value, item }
 * @fires create - The create row was activated, detail: { query } (search text trimmed, '' without one). Never a value:
 *   no selection change, no `change`, nothing submitted. Order: query snapshot → menu closed + focus on the trigger →
 *   `onCreate(query)` → `create`.
 *
 * Texts: `TdDropdown.labels` (`search`, `none`, `noResults`, `required`, `createWithQuery`) — override per site.
 *
 * @property {Array<Object>} options - Array of option objects set via JS property (may be set before the element is
 *   defined). Re-assigning keeps the current selection when its value is still listed (else it is dropped); the
 *   `value` attribute only picks the initial selection.
 * @property {string|null} value - The selected value, live (= `getValue()`; set = `setValue()`) — 0.17.0; before that
 *   it returned the `value` attribute. Before the first connect, setting it sets the initial `value` attribute.
 * @property {Function} onChange - Callback receiving the value (or null) on a user selection
 * @property {Function} onSelect - Callback receiving the full item (or null) on a user selection; runs before
 *   `onChange` (both run when both are set). A throwing callback is logged (`console.error`); `change` still fires.
 * @property {string} createLabel - Mirrors `create-label` (v0.22.0)
 * @property {Function} onCreate - Callback receiving the query when the create row is activated; runs before the
 *   `create` event (a throw is logged, the event still fires) — v0.22.0
 */
export class TdDropdown extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'placeholder', 'searchable', 'allow-clear', 'max-height', 'value-key',
      'label-key', 'value', 'label', 'error-text', 'aria-label', 'create-label'];
  }

  static get errorContract() { return true; }

  /**
   * v0.26.0 (ADR 0012): version of the SSR shell contract `data-td-ssr="dropdown@1"` (PHP td_dropdown element mode: the
   * native markup + `select.td-dropdown__native` styled to the trigger box). Only the focused-select deferral reads it;
   * the shell itself is upgraded by the 0.17 select path.
   */
  static SSR_SCHEMA = 1;

  // NOTE: `searchable`/`allow-clear` are intentionally NOT booleanAttributes. They are
  // default-ON tri-state flags (absent → ON; `="false"`/`"0"`/`"off"` → OFF), which the base
  // naive boolean property mapping (absent === false) cannot express. They have their own
  // prototype accessors (`searchable` / `allowClear`) so `el.searchable = false` actually disables them.
  static get booleanAttributes() {
    return [...super.booleanAttributes];
  }

  /** Default texts (Vietnamese); override per site: `TdDropdown.labels.noResults = 'No results'`. */
  static labels = {
    search: 'Tìm kiếm',
    none: 'Không chọn',
    noResults: 'Không tìm thấy kết quả',
    required: 'Vui lòng chọn một tùy chọn',
    /** v0.22.0: the create row while a search text is typed (`{query}` = the trimmed text); else `create-label`. */
    createWithQuery: 'Thêm “{query}”',
  };

  /** @type {TdDropdown[]} Track all open dropdowns for closeAllExcept */
  static _openDropdowns = [];

  constructor() {
    super();
    this._options = [];
    this._selectedItem = null;
    /** @private A value set before its option existed; resolved when options arrive. */
    this._pendingValue = null;
    /** @private the first `options` assignment applies the `value` attribute; later ones keep the selection */
    this._optionsInit = false;
    this._filteredData = [];
    /** @private navigation model of the rendered listbox: [{ clear: true } | { item } | { create: true }] */
    this._nav = [];
    /** @private index into `_nav` of the active (visually focused) option; -1 = none */
    this._activeIndex = -1;
    this._isOpen = false;
    this._menuElement = null;
    this._scrollRafId = null;
    /** @private layer registration while open (src/utils/layers.js) */
    this._layer = null;
    this._typeBuffer = '';
    this._typeTimer = null;
    /** @private timestamp of an Enter/Space handled on keydown (its activation click is ignored) */
    this._suppressClick = 0;

    // Callbacks set via JS property
    this._onChange = null;
    this._onSelect = null;
    this._onCreate = null;

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
    // 0.17.0 E2: first connect → progressive enhancement of a child <select> (JS-assigned `options` win).
    if (!this._initialized && !this._selectChecked) {
      const select = [...this.children].find((c) => c.localName === 'select');
      // v0.26.0 (ADR 0012, contract dropdown@1): the PHP element-mode shell whose <select> is FOCUSED right now (the user
      // is choosing) is left alone — no upgrade, no render, no bind — until that select blurs; then the normal path runs
      // exactly once, reading the live choice at that moment. Checked before ANY DOM change.
      const shell = this._ssrMatches('dropdown', TdDropdown.SSR_SCHEMA);
      if (shell && select && !this._ssrNoDefer && select.ownerDocument.activeElement === select) {
        this._deferUntilBlur(select);
        return;
      }
      this._selectChecked = true;
      if (shell) this.removeAttribute('data-td-ssr'); // consumed (the shell styling ends with the upgrade below)
      if (select && !this._optionsInit) {
        if (select.multiple) {
          console.warn('td-dropdown: <select multiple> is not upgraded (td-dropdown picks one value); it stays native.', this);
          this._passthrough = true;
        } else {
          this._upgradeSelect(select);
        }
      }
    }
    // A kept native <select multiple>: never render over it, never submit anything (the select does).
    if (this._passthrough) return;
    super.connectedCallback();
  }

  /**
   * @private v0.26.0 (dropdown@1): wait for the focused shell select to blur — ONE capture listener; on blur it is
   * removed and the first connect runs normally (once). Disconnecting meanwhile cancels it (re-evaluated on reconnect).
   * @param {HTMLSelectElement} select
   */
  _deferUntilBlur(select) {
    if (this._ssrDefer) return;
    const onBlur = () => {
      this._cancelSsrDefer();
      // Run after the blur dispatch: removing the host can blur its select while it is still connected (Chromium /
      // Firefox) — the microtask then sees it disconnected and leaves the decision to the next connect.
      queueMicrotask(() => {
        if (!this.isConnected || this._initialized || this._selectChecked || this._ssrDefer) return;
        this._ssrNoDefer = true; // the select has left focus: the normal path runs now, exactly once
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
   * @private Read a child `<select>` into options / selection / reset default / attributes, re-point its
   * `<label for>` at the host, then remove it (0.17.0 E2).
   * @param {HTMLSelectElement} select
   */
  _upgradeSelect(select) {
    this._ensureId();
    const vk = this._getValueKey();
    const lk = this._getLabelKey();
    const isOff = (opt) => opt.disabled || !!(opt.parentElement && opt.parentElement.localName === 'optgroup'
      && opt.parentElement.disabled);
    const all = [...select.options]; // tree order, optgroup children included
    // A leading value="" option is the native PLACEHOLDER ("— Chọn —"): it becomes the host placeholder (and "no value"),
    // not a selectable option (0.17.0 — matches the PHP adapter's td_dropdown placeholder).
    const ph = all[0] && all[0].value === '' ? all[0] : null;
    if (ph && !this.hasAttribute('placeholder') && ph.label.trim()) this.setAttribute('placeholder', ph.label.trim());
    const opts = ph ? all.slice(1) : all;
    const items = opts.map((opt) => {
      const item = { [vk]: opt.value, [lk]: opt.label.trim() };
      if (isOff(opt)) item.disabled = true;
      return item;
    });
    // Native reset rule: the last `selected` option, else the first enabled one.
    let def = null;
    for (const opt of all) if (opt.defaultSelected) def = opt;
    if (!def) def = all.find((opt) => !isOff(opt)) || null;
    this._resetValue = def && def !== ph ? def.value : null; // placeholder default → reset to "no value"
    this._upgraded = true;
    // the EXACT selected option (select.value can't tell the leading placeholder from a later value="" option)
    const selOpt = select.selectedOptions ? select.selectedOptions[0] || null : null;

    for (const attr of ['name', 'aria-label']) {
      const v = select.getAttribute(attr);
      if (v != null && !this.hasAttribute(attr)) this.setAttribute(attr, v);
    }
    for (const attr of ['required', 'disabled']) {
      if (select.hasAttribute(attr) && !this.hasAttribute(attr)) this.setAttribute(attr, '');
    }
    if (select.id) {
      for (const label of [...(select.labels || [])]) {
        if (label.htmlFor === select.id) label.htmlFor = this.id;
      }
    }
    select.remove();

    this.options = items;
    // (1) the host `value` attribute resolves through the deferred initial selection; (2) else the live select value.
    // map the exact selected <option> to its item (a selected leading placeholder = no selection)
    if (!this.hasAttribute('value')) {
      const idx = selOpt && selOpt !== ph ? opts.indexOf(selOpt) : -1;
      this._selectedItem = idx >= 0 ? items[idx] : null;
    }
  }

  /**
   * Base property setup (early-property replay), then resolve a deferred initial selection.
   * @private
   */
  _setupProperties() {
    // `searchable` / `allowClear` are PROTOTYPE accessors (below), so the base keeps them and replays early values
    // (incl. `false`) through them (review v0.16.0 ISSUE-11).
    super._setupProperties();
    // `options` assigned before the first connect deferred the initial selection until early `value` / `valueKey` /
    // `labelKey` properties are replayed (review v0.16.0 ISSUE-5/6): resolve it now with the FINAL attributes —
    // unless an explicit setValue() (select or clear) already superseded it.
    if (this._initialDeferred) {
      this._initialDeferred = false;
      this._setInitialValue();
    }
  }

  // --- Property accessors ---

  /** Default-ON flag: `false` → `searchable="false"` (OFF); anything else → attribute removed (back to ON). */
  get searchable() { return this._isSearchable(); }
  set searchable(v) { v === false ? this.setAttribute('searchable', 'false') : this.removeAttribute('searchable'); }

  /** Default-ON flag: `false` → `allow-clear="false"` (OFF); anything else → attribute removed (back to ON). */
  get allowClear() { return this._isAllowClear(); }
  set allowClear(v) { v === false ? this.setAttribute('allow-clear', 'false') : this.removeAttribute('allow-clear'); }

  /**
   * The LIVE selected value (= `getValue()`; set = `setValue()`) — 0.17.0 E2; before that it returned the `value`
   * attribute. Before the first connect, setting it sets the initial `value` attribute (resolved with the options).
   * @type {*}
   */
  get value() { return this.getValue(); }
  set value(v) {
    if (!this._initialized) {
      if (v == null) this.removeAttribute('value');
      else this.setAttribute('value', String(v));
      return;
    }
    this.setValue(v);
  }

  get options() { return this._options; }
  set options(data) {
    this._options = Array.isArray(data) ? data : [];
    this._filteredData = [...this._options];
    if (!this._optionsInit) {
      this._optionsInit = true;
      // Before the first connect, early properties (value, value-key…) may still be replayed: defer (see _setupProperties).
      if (this._initialSuperseded) { /* an explicit setValue() came first: the value attribute no longer applies */ }
      else if (this._initialized) this._setInitialValue();
      else this._initialDeferred = true;
    } else {
      this._reconcileSelection();
    }
    // Resolve a value that was set (e.g. via setValue/state-restore) before options arrived.
    // A pending value is the most recent explicit selection, so it overrides any stale one.
    if (this._pendingValue != null) {
      this.setValue(this._pendingValue);
    }
    this._renderMenuOptions();
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  get onSelect() { return this._onSelect; }
  set onSelect(fn) { this._onSelect = typeof fn === 'function' ? fn : null; }

  /** v0.22.0: called with the query when the create row is activated (before the `create` event). */
  get onCreate() { return this._onCreate; }
  set onCreate(fn) { this._onCreate = typeof fn === 'function' ? fn : null; }

  /** v0.22.0: mirrors `create-label` ('' = no create row). */
  get createLabel() { return this._getCreateLabel(); }
  set createLabel(v) {
    if (v == null || v === false || String(v) === '') this.removeAttribute('create-label');
    else this.setAttribute('create-label', String(v));
  }

  // --- Attribute helpers ---

  _getPlaceholder() { return this.getAttribute('placeholder') || 'Chọn một tùy chọn'; }
  _getLabel() { return this.getAttribute('label') || ''; }
  /**
   * Default ON. Off only when explicitly disabled via `searchable="false"`/`"0"`/`"off"`.
   * (Mirrors dcms's `searchable !== false` default; an absent attribute or a bare
   * presence — `searchable`, `searchable=""` — keeps it enabled.)
   * @private
   */
  _isSearchable() { return !this._isDisabledFlag('searchable'); }
  _isDisabled() { return this._effectiveDisabled; }
  /** Default ON; off only when explicitly `allow-clear="false"`/`"0"`/`"off"`. @private */
  _isAllowClear() { return !this._isDisabledFlag('allow-clear'); }

  /**
   * True when a default-on boolean-ish attribute is explicitly turned OFF.
   * Off = `attr="false" | "0" | "off"` (case-insensitive). Absent or any other
   * presence (including `attr=""`) stays ON. @private
   */
  _isDisabledFlag(name) {
    if (!this.hasAttribute(name)) return false;
    const v = (this.getAttribute(name) || '').trim().toLowerCase();
    return v === 'false' || v === '0' || v === 'off';
  }
  _getMaxHeight() {
    const n = parseInt(this.getAttribute('max-height') || '5', 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 5;
  }
  _getValueKey() { return this.getAttribute('value-key') || 'value'; }
  _getLabelKey() { return this.getAttribute('label-key') || 'label'; }
  _getCreateLabel() { return this.getAttribute('create-label') || ''; }
  /** `null` = no `value` attribute; `''` is an explicit value (a real empty-valued option — review v0.17.0 ISSUE-5). */
  _getInitialValue() { return this.hasAttribute('value') ? this.getAttribute('value') : null; }

  // --- Rendering ---

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this._getLabel();
    const placeholder = !this._selectedItem;
    const text = placeholder ? this._getPlaceholder() : this._selectedItem[this._getLabelKey()];
    const labelHtml = label
      ? `<label class="td-field__label" id="${id}-label" for="${id}-trigger">${esc(label)}</label>`
      : '';
    return `<div class="td-dropdown" data-state="${this._isOpen ? 'open' : 'closed'}">${labelHtml}`
      + `<button type="button" class="td-dropdown__trigger" id="${id}-trigger" role="combobox" aria-haspopup="listbox"`
      + ` aria-expanded="${this._isOpen}" aria-controls="${id}-listbox"${this._isDisabled() ? ' disabled' : ''}>`
      + `<span class="td-dropdown__value"${placeholder ? ' data-placeholder' : ''}>${esc(text)}</span>`
      + '<span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span>'
      + '</button></div>';
  }

  afterRender() {
    // Persistent body portal (fixed positioning escapes overflow/transform clipping).
    if (!this._menuElement) {
      const menu = document.createElement('div');
      menu.className = 'td-dropdown__menu td-glass-surface td-glass-surface--strong';
      menu.hidden = true;
      menu.setAttribute('data-state', 'closed');
      this._bindMenuEvents(menu);
      document.body.appendChild(menu);
      this._menuElement = menu;
      this._cleanups.push(() => {
        menu.remove();
        // Detached on disconnect → forget it so a reconnect (DOM move) recreates the portal.
        if (this._menuElement === menu) this._menuElement = null;
      });
    }
    this._menuElement.id = `${this.id}-menu`;

    this._renderMenuContent();
    fillIconSlots(this);
    this._bindTriggerEvents();

    // Register in open dropdowns list
    if (!TdDropdown._openDropdowns.includes(this)) {
      TdDropdown._openDropdowns.push(this);
      this._cleanups.push(() => {
        const idx = TdDropdown._openDropdowns.indexOf(this);
        if (idx > -1) TdDropdown._openDropdowns.splice(idx, 1);
      });
    }

    this._applyName();
    this._applyRequired();
    this._watchValueTitle();
    if (this._isOpen && this._isDisabled()) this.close();
    // Push the current selection + validity into the form on (re)render.
    this._syncForm();
    this._applyErrorState();
  }

  /** In place: `value`, `placeholder`, `disabled`, `required`, `name`, `aria-label`, `error-text`. */
  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'value':
        this.setValue(newVal);
        this._syncForm();
        return;
      case 'placeholder':
        this._updateValueText();
        return;
      case 'disabled':
        this._applyDisabled();
        return;
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'name':
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal); // base error contract, no re-render
        return;
      case 'create-label':
        // in place: only the create row changes (an open menu stays open, re-measured)
        this._renderMenuOptions();
        if (this._isOpen) this._updatePosition();
        return;
      default:
        // label, searchable, allow-clear, max-height, value-key, label-key → structure changes.
        if (this._isOpen) this.close();
        this._doRender();
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
    const trigger = this._trigger();
    if (trigger) trigger.disabled = this._isDisabled();
    if (this._isDisabled() && this._isOpen) this.close();
  }

  /** @private `aria-required` on the combobox + decorative asterisk in the label. */
  _applyRequired() {
    const trigger = this._trigger();
    const required = this.hasAttribute('required');
    if (trigger) {
      if (required) trigger.setAttribute('aria-required', 'true');
      else trigger.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-field__label');
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

  /** @private Naming precedence (TdFormElement helper) + the listbox mirrors the combobox name. */
  _applyName() {
    const trigger = this._trigger();
    const hasLabel = !!this._getLabel();
    this._applyAccessibleName(trigger, hasLabel);
    const list = this._list();
    if (!list) return;
    list.removeAttribute('aria-label');
    list.removeAttribute('aria-labelledby');
    if (hasLabel) list.setAttribute('aria-labelledby', `${this.id}-label`);
    else if (trigger && trigger.hasAttribute('aria-label')) list.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    else if (trigger && trigger.hasAttribute('aria-labelledby')) list.setAttribute('aria-labelledby', trigger.getAttribute('aria-labelledby'));
  }

  /** @private Trigger text: selected label or placeholder (`data-placeholder` styles it). */
  _updateValueText() {
    const span = this.querySelector('.td-dropdown__value');
    if (!span) return;
    if (this._selectedItem) {
      span.textContent = String(this._selectedItem[this._getLabelKey()]);
      span.removeAttribute('data-placeholder');
    } else {
      span.textContent = this._getPlaceholder();
      span.setAttribute('data-placeholder', '');
    }
    this._scheduleValueTitle();
  }

  /**
   * @private v0.34.0 (plan QĐ 11): the value span gets `title` = the full value while its text is cut (…). One
   * ResizeObserver on the span (re-checks on resize, no polling), released on disconnect by the cleanups.
   */
  _watchValueTitle() {
    const el = this.querySelector('.td-dropdown__value');
    if (!this._vt) {
      this._vt = new ValueTitleWatcher((node) => this._valueTitleText(node));
      this._cleanups.push(() => {
        if (this._vt) this._vt.destroy();
        this._vt = null;
      });
    }
    this._vt.watch(el);
  }

  /** @private value text changed: re-check next frame (src/utils/value-title.js) */
  _scheduleValueTitle() {
    if (this._vt) this._vt.schedule();
  }

  /** @private title only for a cut NON-placeholder value; removed when it fits / placeholder / empty */
  _syncValueTitle() {
    if (this._vt) this._vt.sync();
  }

  /** @private the displayed value text (placeholder → '') */
  _valueTitleText(el) {
    return displayedValueText(el);
  }

  // --- Form participation ---

  /** @private Push the selected value + validity to the form. */
  _syncForm() {
    if (this._passthrough) return; // the kept native <select multiple> submits itself
    // `null` = no selection. A selected option whose value is '' (not the placeholder — that one is never an option)
    // submits '' and satisfies `required`, like a native <select> (review v0.17.0 ISSUE-1).
    const val = this._selectedItem ? this.getValue() : null;
    this._setFormValue(val == null ? null : String(val));
    if (this.hasAttribute('required') && val == null) {
      this._setValidity({ valueMissing: true }, TdDropdown.labels.required, this._focusTarget());
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    /** @private null = no initial `value` attr; a string = explicit initial value. */
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    if (this._passthrough) return;
    const dv = this._defaultValueAttr;
    if (dv == null) this.removeAttribute('value');
    else this.setAttribute('value', dv);
    // Upgraded from a <select>: reset follows the native rule (captured at upgrade), like the select it replaced.
    this.setValue(this._upgraded ? this._resetValue : (dv ?? null));
    this._syncForm();
  }

  _restoreState(state, _mode) {
    if (this._passthrough) return;
    if (typeof state === 'string') {
      this.setValue(state);
      this._syncForm();
    }
  }

  _focusTarget() {
    return this.querySelector('.td-dropdown__trigger');
  }

  /** @private */
  _trigger() { return this.querySelector('.td-dropdown__trigger'); }
  /** @private */
  _list() { return this._menuElement ? this._menuElement.querySelector('.td-dropdown__options') : null; }
  /** @private the scroll area inside the listbox (v0.22.0): data rows + clear row; the create row stays outside */
  _scroller() { return this._menuElement ? this._menuElement.querySelector('.td-dropdown__scroller') : null; }
  /** @private the rendered row of `_nav[i]` (by `data-nav`, never by position) */
  _rowAt(i) {
    const list = this._list();
    return list && i >= 0 ? list.querySelector(`[data-nav="${Number(i)}"]`) : null;
  }
  /** @private `_nav` index of a rendered row (-1 = not a row) */
  _navIndexOf(row) {
    const v = row && row.getAttribute('data-nav');
    return v != null && /^\d+$/.test(v) ? Number(v) : -1;
  }
  /** @private */
  _search() { return this._menuElement ? this._menuElement.querySelector('.td-dropdown__search') : null; }

  disconnectedCallback() {
    this._cancelSsrDefer(); // v0.26.0: a focused shell still waiting for its blur — re-evaluated on reconnect
    this._clearSearchFocusTimer();
    this._clearTypeahead();
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

  // --- Menu rendering ---

  _renderMenuContent() {
    const menu = this._menuElement;
    if (!menu) return;
    const id = this.escapeHtml(this.id);
    const searchLabel = this.escapeHtml(String(TdDropdown.labels.search ?? ''));
    const search = this._isSearchable()
      ? `<div class="td-dropdown__search-wrap"><input type="text" class="td-dropdown__search" aria-label="${searchLabel}"`
        + ` placeholder="${searchLabel}..." autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="${id}-listbox"></div>`
      : '';
    // v0.22.0: the status sits BEFORE the listbox (the create row is always the last row of the menu); the listbox
    // does not scroll — its inner scroller does (and gets max-height), the create row is pinned below it.
    menu.innerHTML = `${search}<p class="td-dropdown__empty" role="status"></p>`
      + `<div class="td-dropdown__options" role="listbox" id="${id}-listbox">`
      + '<div class="td-dropdown__scroller" role="presentation"></div></div>';
    this._renderMenuOptions();
  }

  /** Re-render the options (in place; the listbox, scroller, search box and empty-status region are kept). */
  _renderMenuOptions() {
    const list = this._list();
    const scroller = this._scroller();
    if (!list || !scroller) return;
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const valueKey = this._getValueKey();
    const labelKey = this._getLabelKey();
    const nav = [];
    let html = '';
    if (this._isAllowClear() && this._selectedItem) {
      nav.push({ clear: true });
      html += `<div class="td-dropdown__option td-dropdown__option--clear" role="option" id="${id}-opt-clear"`
        + ` aria-selected="false" data-value="${CLEAR}" data-nav="${nav.length - 1}"><span class="td-dropdown__option-label">${esc(TdDropdown.labels.none ?? '')}</span></div>`;
    }
    this._filteredData.forEach((item, index) => {
      const selected = this._isSelected(item);
      nav.push({ item });
      html += `<div class="td-dropdown__option" role="option" id="${id}-opt-${index}" aria-selected="${selected}"`
        + `${this._isItemDisabled(item) ? ' aria-disabled="true"' : ''}`
        + ` data-value="${esc(item[valueKey])}" data-index="${index}" data-nav="${nav.length - 1}">`
        + `<span class="td-dropdown__option-label">${esc(item[labelKey])}</span>`
        + (selected ? '<span class="td-dropdown__check" data-td-icon="check" aria-hidden="true"></span>' : '')
        + '</div>';
    });
    scroller.innerHTML = html;
    // v0.22.0: the create row — last direct child of the listbox, outside the scroller, never filtered, never a value.
    for (const old of list.querySelectorAll(':scope > .td-dropdown__option--create')) old.remove();
    const createLabel = this._getCreateLabel();
    if (createLabel) {
      nav.push({ create: true });
      list.insertAdjacentHTML('beforeend', '<div class="td-dropdown__option td-dropdown__option--create" role="option"'
        + ` id="${id}-opt-create" aria-selected="false" data-nav="${nav.length - 1}">`
        + '<span class="td-dropdown__create-icon" data-td-icon="plus" aria-hidden="true"></span>'
        + `<span class="td-dropdown__option-label">${esc(this._createText(createLabel))}</span></div>`);
    }
    fillIconSlots(list);
    this._nav = nav;
    const empty = this._menuElement.querySelector('.td-dropdown__empty');
    if (empty) {
      const msg = this._filteredData.length ? '' : String(TdDropdown.labels.noResults ?? '');
      if (empty.textContent !== msg) empty.textContent = msg;
    }
    if (this._activeIndex >= nav.length) this._activeIndex = -1;
    this._syncActive(false);
  }

  /**
   * @private Create row text: `labels.createWithQuery` with the trimmed search text, else `create-label`. Plain string
   * substitution (no `$&` patterns); the caller escapes it.
   */
  _createText(createLabel) {
    const search = this._search();
    const q = search ? String(search.value).trim() : '';
    if (!q) return createLabel;
    return String(TdDropdown.labels.createWithQuery ?? '{query}').split('{query}').join(q);
  }

  _isSelected(item) {
    if (!this._selectedItem) return false;
    const vk = this._getValueKey();
    return String(this._selectedItem[vk]) === String(item[vk]);
  }

  /** @private An option with `disabled: true` is shown but never picked by the user (0.17.0 E2). */
  _isItemDisabled(item) {
    return !!item && item.disabled === true;
  }

  /** @private Can `_nav[i]` become active / be committed? (the clear option always can) */
  _isNavEnabled(i) {
    const entry = this._nav[i];
    return !!entry && !(entry.item && this._isItemDisabled(entry.item));
  }

  /**
   * @private First enabled `_nav` index from `from` (clamped) walking in `dir` (no wrap); -1 = none.
   * @param {number} from
   * @param {1|-1} dir
   */
  _enabledFrom(from, dir) {
    const n = this._nav.length;
    for (let i = Math.max(0, Math.min(from, n - 1)); n && i >= 0 && i < n; i += dir) {
      if (this._isNavEnabled(i)) return i;
    }
    return -1;
  }

  /** @private index in `_nav` of the selected item (-1 = none) */
  _selectedNavIndex() {
    return this._nav.findIndex((n) => n.item && this._isSelected(n.item));
  }

  // --- Active option (aria-activedescendant) ---

  /** @private `data-active` on the active option + `aria-activedescendant` on the focused control. */
  _syncActive(scroll = true) {
    const list = this._list();
    const activeEl = this._isOpen ? this._rowAt(this._activeIndex) : null;
    if (list) {
      for (const el of list.querySelectorAll('[data-active]')) if (el !== activeEl) el.removeAttribute('data-active');
    }
    if (activeEl) activeEl.setAttribute('data-active', '');
    this._syncActiveDescendant(activeEl);
    // only rows inside the scroller scroll into view (the pinned create row is always visible)
    const scroller = this._scroller();
    if (activeEl && scroll && scroller && scroller.contains(activeEl) && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  /** @private The attribute lives ONLY on the control that has DOM focus (search input, else the trigger). */
  _syncActiveDescendant(activeEl = this._list()?.querySelector('[data-active]')) {
    const trigger = this._trigger();
    const search = this._search();
    const owner = search && document.activeElement === search ? search : trigger;
    for (const el of [trigger, search]) {
      if (!el) continue;
      if (el === owner && activeEl && this._isOpen) el.setAttribute('aria-activedescendant', activeEl.id);
      else el.removeAttribute('aria-activedescendant');
    }
  }

  /** @private */
  _setActive(i) {
    const n = this._nav.length;
    this._activeIndex = n ? Math.max(-1, Math.min(i, n - 1)) : -1;
    this._syncActive();
  }

  /** @private step through the model with wrap-around (as 0.4.x) */
  _move(step) {
    const n = this._nav.length;
    if (!n) return;
    // Wrap-around, skipping disabled options (0.17.0 E2); nothing enabled → stay.
    let i = this._activeIndex < 0 ? (step > 0 ? n - 1 : 0) : this._activeIndex;
    for (let k = 0; k < n; k++) {
      i = (i + step + n) % n;
      if (this._isNavEnabled(i)) {
        this._setActive(i);
        return;
      }
    }
  }

  /** @private commit the active option (clear, item or the create row) */
  _commitActive() {
    const entry = this._nav[this._activeIndex];
    if (!entry || !this._isNavEnabled(this._activeIndex)) return false;
    if (entry.create) this._activateCreate();
    else if (entry.clear) this._clearSelection();
    else this._selectItem(entry.item);
    return true;
  }

  /**
   * @private The create row (v0.22.0), in this order: (1) snapshot the query (search text, trimmed only — case and
   * diacritics kept); (2) close the menu (its layer registration is released) + focus the trigger; (3) `onCreate(query)`
   * then `create` { query }. Never touches the selection, the form value or validity.
   */
  _activateCreate() {
    if (this._isDisabled()) return;
    const search = this._search();
    const query = search ? String(search.value).trim() : '';
    const trigger = this._trigger();
    this.close();
    if (trigger && document.activeElement !== trigger) trigger.focus({ preventScroll: true });
    if (this._onCreate) safeCall(this._onCreate, query, 'onCreate');
    this.emit('create', { query });
  }

  // --- Event binding ---

  _bindTriggerEvents() {
    const trigger = this._trigger();
    if (!trigger) return;
    this.listen(trigger, 'click', (e) => {
      e.stopPropagation();
      if (this._isDisabled()) {
        e.preventDefault();
        return;
      }
      // The keyboard activation click of an Enter/Space already handled on keydown (mouse clicks have detail ≥ 1).
      const suppressed = e.detail === 0 && this._suppressClick && performance.now() - this._suppressClick < 1000;
      this._suppressClick = 0;
      if (suppressed) return;
      this.toggle();
    });
    this.listen(trigger, 'keydown', (e) => this._onKeydown(e, 'trigger'));
    // Engines that still fire the activation click on keyup do so in the keyup default action → clear after it.
    this.listen(trigger, 'keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') window.setTimeout(() => { this._suppressClick = 0; }, 0);
    });
    this.listen(trigger, 'focus', () => this._syncActiveDescendant());
  }

  /** @private Bound once per portal element (the menu is recreated after a reconnect). */
  _bindMenuEvents(menu) {
    // Options are not focusable: keep DOM focus on the trigger / search input while pressing inside the menu.
    menu.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.td-dropdown__search')) e.preventDefault();
    });
    menu.addEventListener('click', (e) => {
      const option = e.target instanceof Element ? e.target.closest('.td-dropdown__option') : null;
      if (!option || !menu.contains(option)) return;
      if (option.getAttribute('aria-disabled') === 'true') return; // not selectable; the menu stays open
      const i = this._navIndexOf(option);
      if (i < 0) return;
      this._activeIndex = i;
      this._commitActive();
    });
    menu.addEventListener('mousemove', (e) => {
      const option = e.target instanceof Element ? e.target.closest('.td-dropdown__option') : null;
      if (!option || option.getAttribute('aria-disabled') === 'true') return;
      const i = this._navIndexOf(option);
      if (i >= 0 && i !== this._activeIndex) {
        this._activeIndex = i;
        this._syncActive(false);
      }
    });
    menu.addEventListener('input', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.classList.contains('td-dropdown__search')) {
        this._handleSearch(e.target.value);
      }
    });
    menu.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.classList.contains('td-dropdown__search')) this._onKeydown(e, 'search');
    });
    menu.addEventListener('focusin', () => this._syncActiveDescendant());
  }

  // --- Keyboard (Escape/Tab are handled by the layer registration, see open()) ---

  /**
   * @private
   * @param {KeyboardEvent} e
   * @param {'trigger'|'search'} source
   */
  _onKeydown(e, source) {
    if (this._isDisabled() || e.defaultPrevented) return;
    if (e.isComposing || e.keyCode === 229) return; // IME composition keys (Enter commits text, not an option)
    const { key } = e;
    const printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!this._isOpen) {
      if (source !== 'trigger') return;
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (key === 'Enter' || key === ' ') this._suppressClick = performance.now();
        this.open({ active: 'selected-or-first' });
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault();
        this.open({ active: key === 'Home' ? 'first' : 'last' });
      } else if (printable) {
        e.preventDefault();
        this.open({ active: 'selected', focusSearch: false });
        this._typeahead(key);
      }
      return;
    }
    const page = this._getMaxHeight();
    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!e.altKey) this._move(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) {
          if (!this._commitActive()) this.close();
        } else this._move(-1);
        return;
      case 'Home':
      case 'End':
        if (source !== 'trigger') return; // search box: caret movement
        e.preventDefault();
        this._setActive(key === 'Home' ? this._enabledFrom(0, 1) : this._enabledFrom(this._nav.length - 1, -1));
        return;
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        // ± one page (max-height), landing on the nearest enabled option (towards the move first).
        const dir = key === 'PageDown' ? 1 : -1;
        const t = key === 'PageDown'
          ? (this._activeIndex < 0 ? page - 1 : this._activeIndex + page)
          : Math.max(0, this._activeIndex - page);
        const i = this._enabledFrom(t, dir) >= 0 ? this._enabledFrom(t, dir) : this._enabledFrom(t, -dir);
        if (i >= 0) this._setActive(i);
        return;
      }
      case 'Enter':
        e.preventDefault();
        if (source === 'trigger') this._suppressClick = performance.now();
        if (!this._commitActive() && source === 'trigger') this.close();
        return;
      case ' ':
        if (source !== 'trigger') return; // typing a space in the search box
        e.preventDefault();
        this._suppressClick = performance.now();
        if (this._typeBuffer) this._typeahead(key);
        else if (!this._commitActive()) this.close();
        return;
      default:
        if (printable && source === 'trigger') {
          e.preventDefault();
          this._typeahead(key);
        }
    }
  }

  /** @private APG type-ahead on the trigger: cycles through options starting with the typed prefix. */
  _typeahead(char) {
    this._clearTypeahead();
    this._typeBuffer += char;
    this._typeTimer = window.setTimeout(() => { this._typeTimer = null; this._typeBuffer = ''; }, TYPEAHEAD_MS);
    const labelKey = this._getLabelKey();
    // Disabled options are not matchable (skipped).
    const labels = this._nav.map((entry) => (entry.item && !this._isItemDisabled(entry.item) ? entry.item[labelKey] : null));
    const i = nextTypeaheadIndex(labels, this._activeIndex, this._typeBuffer);
    if (i >= 0) this._setActive(i);
  }

  /** @private */
  _clearTypeahead() {
    if (this._typeTimer) {
      window.clearTimeout(this._typeTimer);
      this._typeTimer = null;
    }
    if (!this._isOpen) this._typeBuffer = '';
  }

  /** @private Layer Escape: close + focus the trigger; always consumed. */
  _onLayerEscape() {
    const trigger = this._trigger();
    this.close();
    if (trigger) trigger.focus({ preventScroll: true });
    return true;
  }

  /**
   * @private Layer Tab (D19): focus in the portaled search input → back to the trigger ('handled'); anything else →
   * close and 'pass' so the natural order (or a lower modal trap) moves focus. Never selects.
   * @param {KeyboardEvent} e
   * @returns {'handled'|'pass'}
   */
  _onLayerTab(e) {
    const menu = this._menuElement;
    const trigger = this._trigger();
    if (menu && menu.contains(document.activeElement)) {
      e.preventDefault();
      this.close(); // hands focus back to the trigger
      if (trigger && document.activeElement !== trigger) trigger.focus({ preventScroll: true });
      return 'handled';
    }
    this.close();
    return 'pass';
  }

  // --- Search ---

  _handleSearch(query) {
    // Case- and diacritic-insensitive ("ha noi" finds "Hà Nội"), like the type-ahead.
    const q = fold(query).trim();
    const labelKey = this._getLabelKey();
    this._filteredData = !q
      ? [...this._options]
      : this._options.filter((item) => fold(item[labelKey]).includes(q));
    this._renderMenuOptions();
    // Active = first matching option (the clear option is skipped).
    const first = this._nav.findIndex((n) => n.item && !this._isItemDisabled(n.item));
    this._setActive(first);
  }

  // --- Selection ---

  _selectAndFire(value) {
    const item = this._options.find((i) => String(i[this._getValueKey()]) === String(value));
    if (item) this._selectItem(item);
  }

  /** @private user selection: exactly ONE `change` event (+ onChange/onSelect). */
  _selectItem(item) {
    if (this._isDisabled() || !item || this._isItemDisabled(item)) return;
    this._selectedItem = item;
    this._pendingValue = null;
    this._updateValueText();
    this.close();
    this._renderMenuOptions();
    this._syncForm();
    this._fireCallback(item);
    this.emit('change', { value: item[this._getValueKey()], item });
  }

  _clearSelection() {
    if (this._isDisabled()) return;
    this._selectedItem = null;
    this._updateValueText();
    this.close();
    this._renderMenuOptions();
    this._syncForm();
    this._fireCallback(null);
    this.emit('change', { value: null, item: null });
  }

  /** @private onSelect(item) first, then onChange(value); each guarded (a throw is logged, the flow goes on). */
  _fireCallback(item) {
    if (this._onSelect) safeCall(this._onSelect, item, 'onSelect');
    if (this._onChange) safeCall(this._onChange, item ? item[this._getValueKey()] : null, 'onChange');
  }

  /** @private First `options` assignment: select the `value` attribute (resolved later if not listed yet). */
  _setInitialValue() {
    const initialValue = this._getInitialValue();
    if (initialValue == null || this._selectedItem || this._pendingValue != null) return;
    const item = this._options.find((i) => String(i[this._getValueKey()]) === String(initialValue));
    if (!item && initialValue === '') return; // value="" with no empty-valued option = "no selection", nothing pending
    if (item) {
      this._selectedItem = item;
      this._updateValueText();
      // Reflect the resolved initial selection into the form.
      if (this._initialized) this._syncForm();
    } else {
      // e.g. an empty "loading" list first: resolve the initial value when the real options arrive.
      this._pendingValue = String(initialValue);
    }
  }

  /**
   * @private New option list: keep the current selection (re-pointed at the new item object) when its value is still
   * listed, otherwise drop it — the form never submits a value the list no longer has.
   */
  _reconcileSelection() {
    if (!this._selectedItem) return;
    const vk = this._getValueKey();
    const cur = String(this._selectedItem[vk]);
    const item = this._options.find((i) => String(i[vk]) === cur) || null;
    this._selectedItem = item;
    this._updateValueText(); // a kept value may come with a new label in the new list
    if (!item && this._initialized) this._syncForm();
  }

  // --- Open/Close ---

  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  /**
   * Open the menu.
   * @param {{ active?: 'selected'|'selected-or-first'|'first'|'last', focusSearch?: boolean }} [opts] internal
   */
  open(opts = {}) {
    if (this._isOpen) {
      this._updatePosition();
      return;
    }
    const trigger = this._trigger();
    const menu = this._menuElement;
    if (!trigger || !menu || this._isDisabled()) return;

    // Close all other dropdowns
    TdDropdown._openDropdowns.forEach((dd) => {
      if (dd !== this && dd._isOpen) dd.close();
    });

    this._isOpen = true;
    // v0.42.0 (ADR 0020): the portaled popup renders in the host's theme scope (undone when the layer is released)
    if (!this._unbridge) this._unbridge = bridgeTheme(menu, this);
    menu.hidden = false;
    menu.setAttribute('data-state', 'open');
    this.querySelector('.td-dropdown')?.setAttribute('data-state', 'open');
    trigger.setAttribute('aria-expanded', 'true');
    this._placeMenu(trigger.getBoundingClientRect());

    // Floating registration: exempt from a lower modal's inert lease; owns Escape/Tab while open.
    this._layer = registerLayer({
      layer: LAYERS.popover,
      element: menu,
      keyboard: 'boundary',
      onEscape: () => this._onLayerEscape(),
      onTab: (e) => this._onLayerTab(e),
      // v0.21.1: a newer modal / lightbox (or the closing dialog this dropdown lives in) covers it → close, no focus
      anchor: this,
      onCovered: () => this._closeCovered(),
    });

    const mode = opts.active || 'selected';
    let sel = this._selectedNavIndex();
    if (sel >= 0 && !this._isNavEnabled(sel)) sel = -1; // a (programmatically) selected disabled option is never active
    let active = sel;
    if (mode === 'first') active = this._enabledFrom(0, 1);
    else if (mode === 'last') active = this._enabledFrom(this._nav.length - 1, -1);
    else if (mode === 'selected-or-first' && sel < 0) active = this._enabledFrom(0, 1);
    this._activeIndex = -1;
    this._setActive(active);

    // Focus the search input — not on touch-first devices (any width: the on-screen keyboard would cover the list).
    const searchInput = this._search();
    if (searchInput && opts.focusSearch !== false && !isCoarsePointer()) {
      this._clearSearchFocusTimer();
      this._searchFocusTimer = window.setTimeout(() => {
        this._searchFocusTimer = null;
        if (this._isOpen) searchInput.focus();
      }, 100);
    }

    this._addGlobalListeners();
  }

  /** @private covered by a newer blocking layer: close without handing focus to the (inert / leaving) trigger */
  _closeCovered() {
    this._noFocusReturn = true;
    try { this.close(); } finally { this._noFocusReturn = false; }
  }

  close() {
    const trigger = this._trigger();
    const menu = this._menuElement;
    const searchInput = this._search();

    this._clearSearchFocusTimer();
    const wasOpen = this._isOpen;
    this._isOpen = false;
    this._activeIndex = -1;
    this._clearTypeahead();

    // Never leave focus stranded inside a hidden menu: hand it back to the trigger.
    const menuHadFocus = !!(menu && menu.contains(document.activeElement));
    if (menu) {
      menu.hidden = true;
      menu.setAttribute('data-state', 'closed');
    }
    if (menuHadFocus && trigger && !this._noFocusReturn) trigger.focus({ preventScroll: true });
    this.querySelector('.td-dropdown')?.setAttribute('data-state', 'closed');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    this._removeGlobalListeners();
    this._releaseLayer();

    // Reset search
    if (searchInput && (searchInput.value || this._filteredData.length !== this._options.length)) {
      searchInput.value = '';
      this._filteredData = [...this._options];
      this._renderMenuOptions();
    } else if (wasOpen) {
      this._syncActive(false);
    }
  }

  /** @private */
  _releaseLayer() {
    if (this._layer) {
      this._layer.release();
      this._layer = null;
    }
    if (this._unbridge) {
      this._unbridge();
      this._unbridge = null;
    }
  }

  _addGlobalListeners() {
    document.addEventListener('pointerdown', this._boundPointerOutside, true);
    window.addEventListener('resize', this._boundOnResize);
    window.addEventListener('scroll', this._boundOnScroll, true);
    // v0.21.1: trigger hidden without a scroll (tab switch), removed, or moved by an entry transition
    const trigger = this._trigger();
    if (this._unwatchRef) this._unwatchRef();
    this._unwatchRef = trigger ? watchReference(trigger, () => this._updatePosition()) : null;
  }

  _removeGlobalListeners() {
    document.removeEventListener('pointerdown', this._boundPointerOutside, true);
    window.removeEventListener('resize', this._boundOnResize);
    window.removeEventListener('scroll', this._boundOnScroll, true);
    if (this._unwatchRef) {
      this._unwatchRef();
      this._unwatchRef = null;
    }
  }

  // --- Position update (RAF-throttled) ---

  _updatePosition() {
    if (!this._isOpen || !this._menuElement) return;
    const trigger = this._trigger();
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Close once the trigger is effectively hidden (scrolled out of the viewport, or
    // no longer rendered) — a menu floating over unrelated content is worse than closing.
    if (isReferenceHidden(rect, trigger)) {
      this.close();
      return;
    }
    this._placeMenu(rect);
  }

  /**
   * Size + position the portaled menu against the trigger rect (shared placeFloating, 0.4.1 B5 rules): same width as
   * the trigger (viewport-capped), below preferred, flips to the side with room, caps the SCROLLER height instead of
   * clamping `top` (v0.22.0: the scroller inside the listbox; the pinned create row counts as chrome). Geometry only
   * via CSSOM; the side is exposed as `data-placement` (transform origin).
   * @private
   * @param {DOMRect} rect trigger rect
   */
  _placeMenu(rect) {
    const menu = this._menuElement;
    if (!menu) return;
    const { side } = placeFloating(rect, menu, {
      width: 'match',
      list: this._scroller(),
      listMax: this._getMaxHeight() * OPTION_PX,
    });
    menu.setAttribute('data-placement', side);
  }

  /** @private */
  _clearSearchFocusTimer() {
    if (this._searchFocusTimer) {
      window.clearTimeout(this._searchFocusTimer);
      this._searchFocusTimer = null;
    }
  }

  // --- Public API ---

  getValue() {
    const vk = this._getValueKey();
    return this._selectedItem ? this._selectedItem[vk] : null;
  }

  setValue(value) {
    // an explicit selection / clear supersedes the initial `value` attribute — for good (review v0.16.0 ISSUE-6/7)
    this._initialDeferred = false;
    this._initialSuperseded = true;
    const vkEmpty = this._getValueKey();
    const emptyItem = value === '' ? this._options.find((i) => String(i[vkEmpty] ?? '') === '' && i[vkEmpty] != null) : null;
    if (value === null || value === undefined || (value === '' && !emptyItem)) {
      this._selectedItem = null;
      this._pendingValue = null;
    } else if (emptyItem) {
      this._selectedItem = emptyItem; // a real option whose value is '' (review v0.17.0 ISSUE-1)
      this._pendingValue = null;
    } else {
      const vk = this._getValueKey();
      const item = this._options.find((i) => String(i[vk]) === String(value));
      if (item) {
        this._selectedItem = item;
        this._pendingValue = null;
      } else {
        // Value not in the current options — drop any stale selection, remember the value,
        // and resolve it once matching options arrive.
        this._pendingValue = String(value);
        this._selectedItem = null;
      }
    }
    this._updateValueText();
    this._renderMenuOptions();
    this._syncForm();
  }

  getSelectedItem() {
    return this._selectedItem;
  }

  /**
   * Replace the option list (an open menu is repositioned). A selection whose value is no longer listed is dropped.
   * @param {Array<Object>} newData
   */
  updateData(newData) {
    this._options = Array.isArray(newData) ? newData : [];
    this._filteredData = [...this._options];
    this._optionsInit = true;
    this._reconcileSelection();
    // Resolve a value set before these options arrived (same as the `options` setter).
    if (this._pendingValue != null) {
      this.setValue(this._pendingValue);
    }
    this._renderMenuOptions();
    if (this._isOpen) this._updatePosition();
  }

  destroy() {
    this._clearSearchFocusTimer();
    this._clearTypeahead();
    this._removeGlobalListeners();
    this._releaseLayer();
    this._isOpen = false;
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    const idx = TdDropdown._openDropdowns.indexOf(this);
    if (idx > -1) TdDropdown._openDropdowns.splice(idx, 1);
    if (this._menuElement) this._menuElement.remove();
    this._menuElement = null;
    this.innerHTML = '';
  }
}

if (!customElements.get('td-dropdown')) {
  customElements.define('td-dropdown', TdDropdown);
}
