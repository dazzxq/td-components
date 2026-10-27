import { fold, nextTypeaheadIndex } from '../utils/typeahead.js';
import { ValueTitleWatcher, displayedValueText } from '../utils/value-title.js';
import { isCoarsePointer } from '../utils/breakpoints.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';
import { LAYERS, register as registerLayer, bridgeTheme } from '../utils/layers.js';
import { TdFormElement } from '../base/td-form-element.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';

const CLEAR = '__CLEAR__';
const OPTION_PX = 40; // --td-dropdown-option-h: `max-height` = visible options × 40 px
/** v0.86.0: more option rows than this in the scroller → `data-many` (CSS `content-visibility: auto` per row) */
const MANY_ROWS = 200;
const TYPEAHEAD_MS = 500;
// v0.82.0: the colourless dot; the colour is set only through circle.setAttribute('fill') (see _applySwatchFills)
const SWATCH_SVG = '<svg class="td-dropdown__swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="6"/></svg>';
/** Properties that may be set on the element before it upgrades (they would shadow the class accessors). */
const UPGRADE_PROPS = ['mode', 'keepOpen', 'triggerMeta', 'options', 'groups', 'onChange', 'onSelect', 'onCreate',
  'createLabel', 'onPick', 'load']; // v0.85.0: `mode` first, so a pre-upgrade action mode is in force before the <select> read
/** v0.84.0: tones of the icon tile / status dot (anything else → neutral). */
const TONES = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
/** v0.84.0: the fields `search-fields` may name (all three by default). */
const SEARCH_FIELDS = ['label', 'description', 'keywords'];
/** v0.84.0: unknown option icon names already warned about (once per name per page; capped — security review). */
const WARNED_ICONS = new Set();
const WARNED_ICONS_MAX = 100;
/** v0.84.0: the icon-name grammar of the registry (src/icons/td-icon.js NAME_RE — registerIcons enforces it). */
const ICON_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

/** @private a non-empty string / finite number, trimmed; anything else → '' */
function textOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return typeof v === 'string' ? v.trim() : '';
}

/** @private an allowed tone, else 'neutral' */
function toneOf(v) {
  return TONES.includes(v) ? v : 'neutral';
}

/**
 * @private v0.84.0: a registered icon name ('' for none). An unknown name warns once per name per page and gives ''
 * (its slot is never printed, so fillIconSlots never warns about it). Never SVG / HTML from the option.
 */
function iconOf(v) {
  if (typeof v !== 'string' || !v) return '';
  // malformed names (never registrable) share one fixed key: nothing long or odd is retained or logged
  const key = ICON_NAME_RE.test(v) ? v : '';
  if (key && hasIcon(key)) return key;
  if (!WARNED_ICONS.has(key) && WARNED_ICONS.size < WARNED_ICONS_MAX) {
    WARNED_ICONS.add(key);
    console.warn(key ? `td-dropdown: unknown icon "${key}"` : 'td-dropdown: invalid icon name');
  }
  return '';
}

/** @private v0.84.0: `keywords` (a string, or an array of strings / numbers) flattened with ' '; else '' */
function keywordsOf(v) {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v.filter((k) => typeof k === 'string' || (typeof k === 'number' && Number.isFinite(k))).join(' ');
}

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
 *         <span class="td-dropdown__value" [data-placeholder | data-action]>[swatch svg][<span class="td-dropdown__value-icon" data-td-icon aria-hidden="true">]…</span>
 *         [<span class="td-dropdown__trigger-meta" id="{host}-trigger-meta">…</span>]   (v0.85.0 `trigger-meta`, in aria-describedby)
 *         <span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span>
 *       </button>
 *     </div>
 *     [<span class="td-sr-only td-dropdown__live" aria-live="polite" aria-atomic="true"></span>]   (v0.85.0 action mode only)
 *     [<span class="td-field-error" id="{host}-error" data-for="{host}">…</span>]
 *   </td-dropdown>
 *   <body> portal (persistent while connected):
 *   <div class="td-dropdown__menu td-glass-surface td-glass-surface--strong" id="{host}-menu" hidden data-state data-placement>
 *     [<div class="td-dropdown__search-wrap"><input class="td-dropdown__search" aria-label="{labels.search}" aria-autocomplete="list"
 *        aria-controls="{host}-listbox" [aria-activedescendant]></div>]
 *     <p class="td-dropdown__empty" role="status" [data-count]>[{labels.noResults} | {labels.resultCount} (visually hidden)]</p>
 *     <div class="td-dropdown__options" role="listbox" id="{host}-listbox">          (not scrolling — v0.22.0)
 *       <div class="td-dropdown__scroller" role="presentation">                       (the scroll area, gets max-height)
 *         [<div class="td-dropdown__option td-dropdown__option--clear" role="option" id="{host}-opt-clear" data-value="__CLEAR__" data-nav>…]
 *         <div class="td-dropdown__option" role="option" id="{host}-opt-{i}" aria-selected data-value data-index data-nav [data-cv] [data-active]>…
 *         v0.84.0 rich row (icon / description / status / meta), r = {host}-opt-{i}:
 *         <div class="td-dropdown__option td-dropdown__option--rich" role="option" id="r" aria-selected [aria-disabled]
 *              [aria-labelledby="r-label" aria-describedby="[r-desc] [r-meta]"] data-value data-index data-nav>
 *           [swatch svg][<span class="td-dropdown__icon" data-tone data-td-icon aria-hidden="true">]
 *           <span class="td-dropdown__text"><span class="td-dropdown__option-label" id="r-label">…</span>
 *             [<span class="td-dropdown__desc" id="r-desc">[<span class="td-dropdown__desc-text">…</span>]
 *               [<span class="td-dropdown__status" data-tone><span class="td-dropdown__status-dot" aria-hidden="true"></span>…</span>]</span>]</span>
 *           [<span class="td-dropdown__meta" id="r-meta">…</span>][<span class="td-dropdown__check" …>]</div>
 *         v0.84.0 groups (`groups` set): [<div class="td-dropdown__group" role="group" aria-labelledby="{host}-grp-{n}">
 *           <div class="td-dropdown__group-label" role="presentation" id="{host}-grp-{n}">…</div> rows…</div>]
 *         then the rows of no / an unknown group (no header, no wrapper)
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
 * no `options` assigned from JS) is read into `options` — since v0.84.0 `<optgroup>`s are kept: `groups` =
 * `[{ key: 'g{n}', label }]` and their options get `group: 'g{n}'` (options outside any optgroup form the trailing
 * section, so an option placed between optgroups moves to the end); `data-icon` / `data-icon-tone` / `data-description` /
 * `data-status` + `data-status-tone` / `data-meta` / `data-keywords` become the v0.84.0 fields (absent = no key). An
 * option is disabled when it or its `<optgroup>` is. Selection: the host `value` attribute if present, else the select's LIVE
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
 * @attr {string} search-fields - v0.84.0: what the search matches, a space / comma separated subset of
 *   `label description keywords` (default all three; unknown tokens ignored). Changing it re-filters in place.
 * @attr {string} trigger-icon - v0.84.0: `none` / `off` / `false` = the trigger shows no option icon (text only). Any
 *   other value is ignored in select mode. v0.85.0 action mode: absent / empty = `plus`, `none` / `off` / `false` = no
 *   icon, any other value = that registered icon name (an unknown / malformed name → no icon + one bounded warn).
 * @attr {string} mode - v0.85.0: `action` (trimmed, any case) = "pick to add": picking fires `pick` and never holds a
 *   value — `getValue()` is null; `value` / `setValue()` / reset / state restore are ignored; no `change`, no form value
 *   (no `name` key in FormData), `required` has no effect (no `aria-required`, no asterisk); no clear row, no check
 *   mark. The trigger shows the `placeholder` text (`data-action`, normal text colour) and an icon (see `trigger-icon`).
 *   A polite live region says `labels.picked` after a pick. Anything else / absent = select mode (0.84.0). Changing it
 *   re-renders (an open menu closes); entering action mode drops the selection and any pending value. A child `<select>`
 *   is still read (options, groups, name, aria-label, disabled) but selects nothing.
 * @attr {boolean} keep-open - v0.85.0, action mode only: the menu stays open after a pick (the search text kept, the
 *   active row moves to the next enabled row, else the previous one); `false` / `0` / `off` = off. Read at pick time
 *   (not observed: toggling it never re-renders or closes the menu). The create row still closes the menu.
 * @attr {string} trigger-meta - v0.85.0, both modes: muted text at the trigger's inline end (e.g. "4/10"), escaped,
 *   in the trigger's `aria-describedby`; updated in place (no re-render). Empty / absent = none.
 * @fires change - When selection changes, detail: { value, item }
 * @fires pick - v0.85.0 action mode: an option was picked, detail: { value, item }. Order without `keep-open`: menu
 *   closed → focus on the trigger → `onPick(item)` → `pick` → announcement; with `keep-open` the menu stays open (focus
 *   kept). Exactly one per activation (click, Enter, Space on the trigger, Alt+ArrowUp); disabled options never fire it.
 * @fires create - The create row was activated, detail: { query } (search text trimmed, '' without one). Never a value:
 *   no selection change, no `change`, nothing submitted. Order: query snapshot → menu closed + focus on the trigger →
 *   `onCreate(query)` → `create`.
 *
 * Texts: `TdDropdown.labels` (`search`, `none`, `noResults`, `required`, `createWithQuery`, `resultCount`, `picked`) —
 * override per site.
 *
 * @property {Array<Object>} options - Array of option objects set via JS property (may be set before the element is
 *   defined). Re-assigning keeps the current selection when its value is still listed (else it is dropped); the
 *   `value` attribute only picks the initial selection. v0.84.0 optional fields (fixed names, not `value-key` /
 *   `label-key`): `icon` (registered icon name, in a toned tile; also shown on the trigger), `iconTone`, `description`
 *   (second line), `status` ({ tone, text }: dot + text), `meta` (muted, inline end), `keywords` (string | array, search
 *   only), `group` (a `groups` key). Tones: neutral / accent / success / warning / danger / info (else neutral). An
 *   option with none of icon / description / status / meta renders the plain 0.83.0 row.
 * @property {Array<{key: string, label: string}>} groups - v0.84.0: ordered group headers (may be set before the
 *   element is defined). Non-empty → options are shown group by group (`group` = a key), then the options of no / an
 *   unknown group as a trailing section without a header. Empty / not an array → `group` is ignored.
 * @property {string|null} value - The selected value, live (= `getValue()`; set = `setValue()`) — 0.17.0; before that
 *   it returned the `value` attribute. Before the first connect, setting it sets the initial `value` attribute.
 * @property {Function} onChange - Callback receiving the value (or null) on a user selection
 * @property {Function} onSelect - Callback receiving the full item (or null) on a user selection; runs before
 *   `onChange` (both run when both are set). A throwing callback is logged (`console.error`); `change` still fires.
 * @property {string} createLabel - Mirrors `create-label` (v0.22.0)
 * @property {Function} onCreate - Callback receiving the query when the create row is activated; runs before the
 *   `create` event (a throw is logged, the event still fires) — v0.22.0
 * @property {'select'|'action'} mode - v0.85.0: mirrors `mode` (setting anything but `'action'` removes the attribute)
 * @property {boolean} keepOpen - v0.85.0: mirrors `keep-open`
 * @property {string} triggerMeta - v0.85.0: mirrors `trigger-meta` ('' / null = removed)
 * @property {Function} onPick - v0.85.0 action mode: callback receiving the picked item; runs before the `pick` event (a
 *   throw is logged, the event still fires). Options re-assigned (`options` / `updateData()`) while an action menu is
 *   OPEN keep the typed search text (re-filtered), the active row (by value, else the nearest enabled row) and the
 *   scroll position — e.g. a site disabling the picked item inside its `pick` handler.
 */
export class TdDropdown extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'placeholder', 'searchable', 'allow-clear', 'max-height', 'value-key',
      'label-key', 'value', 'label', 'error-text', 'aria-label', 'create-label', 'search-fields', 'trigger-icon',
      'mode', 'trigger-meta']; // v0.85.0: `keep-open` is read at pick time, not observed
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
    /**
     * v0.84.0: screen-reader-only result count while a search text is typed and something matches (`{count}` = the
     * matching options; the clear / create rows are not counted). '' = off.
     */
    resultCount: '{count} kết quả',
    /** v0.85.0 action mode: the polite announcement after a pick (`{label}` = the option's label text). '' = off. */
    picked: 'Đã chọn {label}',
    /** v0.86.0 `load`: the menu status while the loader runs / after it failed, and the retry button. */
    loading: 'Đang tải…',
    loadError: 'Không tải được',
    retry: 'Thử lại',
  };

  /** @type {TdDropdown[]} Track all open dropdowns for closeAllExcept */
  static _openDropdowns = [];

  constructor() {
    super();
    this._options = [];
    /** @private v0.84.0: the `groups` property as assigned (raw) */
    this._groups = [];
    /** @private v0.84.0: the rendered list has a rich row or a group header → measured listMax (see _placeMenu) */
    this._measured = false;
    /** @private v0.86.0: first nav index that gets [data-cv] (long lists only; Infinity = none) */
    this._cvFrom = Infinity;
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
    this._onPick = null;

    /** @private v0.86.0: the async options loader (`load` property) */
    this._load = null;
    /** @private v0.86.0: 'idle' (not run yet) | 'loading' | 'error' | 'done' */
    this._loadState = 'idle';
    /** @private v0.86.0: bumped by every run, every `load` assignment and destroy(); only the latest run applies */
    this._loadToken = 0;
    /** @private v0.86.0: the `active` mode of the last open() (re-applied when a load lands with no active row) */
    this._openActive = 'selected';

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
    // v0.84.0: <optgroup>s are kept → `groups` [{ key: 'g{n}', label }] + `group` on their options
    const optgroups = [...select.children].filter((c) => c.localName === 'optgroup');
    const groupOf = new Map(optgroups.map((g, n) => [g, `g${n}`]));
    const items = opts.map((opt) => {
      const item = { [vk]: opt.value, [lk]: opt.label.trim() };
      if (isOff(opt)) item.disabled = true;
      const sw = this.safeColor(opt.dataset.swatch); // v0.82.0: <option data-swatch="#f00"> → item.swatch
      if (sw) item.swatch = sw;
      // v0.84.0 data-* → the rich fields (gated at render); an absent / empty attribute adds no key
      const d = opt.dataset;
      if (d.icon) item.icon = d.icon;
      if (d.iconTone) item.iconTone = d.iconTone;
      if (d.description) item.description = d.description;
      if (d.status) item.status = d.statusTone ? { text: d.status, tone: d.statusTone } : { text: d.status };
      if (d.meta) item.meta = d.meta;
      if (d.keywords) item.keywords = d.keywords;
      const g = opt.parentElement && groupOf.get(opt.parentElement);
      if (g) item.group = g;
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

    if (optgroups.length) this.groups = optgroups.map((g, n) => ({ key: `g${n}`, label: g.label.trim() }));
    this.options = items;
    // (1) the host `value` attribute resolves through the deferred initial selection; (2) else the live select value.
    // map the exact selected <option> to its item (a selected leading placeholder = no selection)
    // v0.85.0: action mode never holds a selection (the select's live value and its reset default are ignored)
    if (!this.hasAttribute('value') && !this._isAction()) {
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
    if (this._isAction()) return; // v0.85.0: no value in action mode (nothing stored)
    if (!this._initialized) {
      if (v == null) this.removeAttribute('value');
      else this.setAttribute('value', String(v));
      return;
    }
    this.setValue(v);
  }

  get options() { return this._options; }
  set options(data) {
    const snap = this._openSnapshot(); // v0.86.0: before setValue() below re-renders the rows
    this._options = Array.isArray(data) ? data : [];
    this._filteredData = this._ordered(this._options);
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
    // v0.85.0 (action) / v0.86.0 (select too): an OPEN menu keeps its query / active row / scroll
    if (this._isOpen) this._refreshOpen(snap);
    else this._renderMenuOptions();
  }

  /** v0.84.0: ordered group headers [{ key, label }]; re-assigning re-filters in place (as `options`). */
  get groups() { return this._groups; }
  set groups(v) {
    this._groups = Array.isArray(v) ? v : [];
    this._handleSearch(this._query());
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  get onSelect() { return this._onSelect; }
  set onSelect(fn) { this._onSelect = typeof fn === 'function' ? fn : null; }

  /** v0.22.0: called with the query when the create row is activated (before the `create` event). */
  get onCreate() { return this._onCreate; }
  set onCreate(fn) { this._onCreate = typeof fn === 'function' ? fn : null; }

  /** v0.85.0: action mode → called with the picked item (before the `pick` event). */
  get onPick() { return this._onPick; }
  set onPick(fn) { this._onPick = typeof fn === 'function' ? fn : null; }

  /** v0.85.0: `'action'` | `'select'`; mirrors `mode` (anything but `'action'` removes the attribute). */
  /**
   * v0.86.0: `() => Promise<options[]>`. Runs once, at the first open(); again only through reload(), the retry
   * button (Enter while failed) or a new assignment. Assigning (also `null`) drops a pending run.
   */
  get load() { return this._load; }
  set load(fn) {
    this._load = typeof fn === 'function' ? fn : null;
    this._loadToken++;
    this._loadState = 'idle';
    this._renderMenuOptions();
    if (this._isOpen && this._load) this._runLoad();
  }

  /** v0.86.0: run the loader now (open or closed). Resolves true once the options are assigned; never rejects. */
  reload() { return this._runLoad(); }

  /** @private */
  async _runLoad() {
    const fn = this._load;
    if (!fn) return false;
    const token = ++this._loadToken;
    this._loadState = 'loading';
    this._renderMenuOptions();
    let data;
    let failed = false;
    try {
      data = await fn.call(this);
      if (!Array.isArray(data) || !data.every((o) => o !== null && typeof o === 'object')) {
        throw new TypeError('load() did not resolve to an array of option objects');
      }
    } catch (err) {
      failed = true;
      if (token === this._loadToken) console.warn('td-dropdown: load failed', err);
    }
    if (token !== this._loadToken) return false; // superseded (a newer run, a new loader, destroy())
    this._loadState = failed ? 'error' : 'done';
    if (failed) {
      this._renderMenuOptions();
      return false;
    }
    const hadActive = this._activeIndex >= 0;
    // transactional: a list the renderer cannot take (a field getter throws) restores everything it touched
    const before = {
      options: this._options, filtered: this._filteredData, selected: this._selectedItem,
      pending: this._pendingValue, init: this._optionsInit, deferred: this._initialDeferred,
      superseded: this._initialSuperseded, snap: this._openSnapshot(),
    };
    try {
      this.options = data;
    } catch (err) {
      console.warn('td-dropdown: load failed', err); // reload() never rejects
      this._loadState = 'error';
      this._options = before.options;
      this._filteredData = before.filtered;
      this._selectedItem = before.selected;
      this._pendingValue = before.pending;
      this._optionsInit = before.init;
      this._initialDeferred = before.deferred;
      this._initialSuperseded = before.superseded;
      try {
        this._updateValueText();
        if (this._initialized) this._syncForm();
        if (this._isOpen) this._refreshOpen(before.snap);
        else this._renderMenuOptions();
      } catch { /* the previous list rendered before; nothing more to restore */ }
      return false;
    }
    if (this._isOpen && !hadActive && this._activeIndex < 0) this._setActive(this._openActiveIndex(this._openActive));
    return true;
  }

  get mode() { return this._isAction() ? 'action' : 'select'; }
  set mode(v) {
    if (String(v ?? '').trim().toLowerCase() === 'action') this.setAttribute('mode', 'action');
    else this.removeAttribute('mode');
  }

  /** v0.85.0: mirrors `keep-open` (true → present, false → removed). */
  get keepOpen() { return this._keepOpen(); }
  set keepOpen(v) { v ? this.setAttribute('keep-open', '') : this.removeAttribute('keep-open'); }

  /** v0.85.0: mirrors `trigger-meta` ('' / null / false = removed). */
  get triggerMeta() { return this.getAttribute('trigger-meta') ?? ''; }
  set triggerMeta(v) {
    if (v == null || v === false || String(v) === '') this.removeAttribute('trigger-meta');
    else this.setAttribute('trigger-meta', String(v));
  }

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
  /** @private the current search text (raw; '' without a search box) */
  _query() {
    const search = this._search();
    return search ? String(search.value) : '';
  }
  /** @private v0.84.0: `search-fields` tokens that are known; none valid / empty → all three */
  _searchFields() {
    const tokens = String(this.getAttribute('search-fields') || '').toLowerCase().split(/[\s,]+/)
      .filter((t) => SEARCH_FIELDS.includes(t));
    return new Set(tokens.length ? tokens : SEARCH_FIELDS);
  }
  /** @private v0.84.0: `trigger-icon="none" | "off" | "false"` → the trigger shows no option icon */
  _triggerIconOff() {
    const v = (this.getAttribute('trigger-icon') || '').trim().toLowerCase();
    return v === 'none' || v === 'off' || v === 'false';
  }
  /**
   * @private v0.84.0: the selected option's icon for the trigger ('' = none / off). v0.85.0 action mode: the fixed
   * trigger icon instead — `trigger-icon` absent / empty → `plus`, off → '', else a registered name (iconOf gate).
   */
  _triggerIconOf(item) {
    if (this._isAction()) {
      const name = (this.getAttribute('trigger-icon') || '').trim();
      if (!name) return 'plus';
      return this._triggerIconOff() ? '' : iconOf(name);
    }
    return item && !this._triggerIconOff() ? iconOf(item.icon) : '';
  }
  /** @private v0.85.0: `mode="action"` (trimmed, any case) */
  _isAction() { return (this.getAttribute('mode') || '').trim().toLowerCase() === 'action'; }
  /** @private v0.85.0: `keep-open` present and not `false` / `0` / `off` (read at pick time) */
  _keepOpen() { return this.hasAttribute('keep-open') && !this._isDisabledFlag('keep-open'); }
  /** @private v0.85.0: the trimmed `trigger-meta` text ('' = none) */
  _triggerMetaText() { return (this.getAttribute('trigger-meta') || '').trim(); }

  /**
   * @private v0.84.0: `groups` key → its index in `groups` (null = grouping off: `groups` empty / not an array).
   * Entries that are not objects with a string / number key are skipped (their index is kept for the others).
   * @returns {Map<string, number>|null}
   */
  _groupIndex() {
    const groups = this._groups;
    if (!Array.isArray(groups) || !groups.length) return null;
    const map = new Map();
    groups.forEach((g, n) => {
      const key = g && typeof g === 'object' ? textOf(g.key) : '';
      if (key && !map.has(key)) map.set(key, n);
    });
    return map;
  }

  /** @private v0.84.0: the group index of an item (-1 = no / an unknown group, the trailing section) */
  _groupOf(item, index) {
    if (!index || !item || typeof item !== 'object') return -1;
    const key = textOf(item.group);
    return key && index.has(key) ? index.get(key) : -1;
  }

  /**
   * @private v0.84.0: `list` in DISPLAY order — each declared group in `groups` order (array order inside it), then the
   * no / unknown group options. Without groups: a plain copy. `_filteredData` is always this flat display-ordered list
   * (data-index, row ids and _applySwatchFills index into it); `_options` stays the site's raw array.
   * @param {Array<Object>} list
   */
  _ordered(list) {
    const index = this._groupIndex();
    if (!index) return [...list];
    const buckets = this._groups.map(() => []);
    const rest = [];
    for (const item of list) {
      const n = this._groupOf(item, index);
      (n < 0 ? rest : buckets[n]).push(item);
    }
    return [...buckets.flat(), ...rest];
  }

  /**
   * @private v0.84.0: the gated rich parts of an option, or null for a plain (0.83.0) row. Rich = a registered `icon`,
   * a non-empty `description`, a `status` with a non-empty `text` or a non-empty `meta`.
   * @returns {{ icon: string, tone: string, desc: string, status: {tone: string, text: string}|null, meta: string }|null}
   */
  _richOf(item) {
    if (!item || typeof item !== 'object') return null;
    const icon = iconOf(item.icon);
    const desc = textOf(item.description);
    const st = item.status && typeof item.status === 'object' ? item.status : null;
    const stText = st ? textOf(st.text) : '';
    const status = stText ? { tone: toneOf(st.tone), text: stText } : null;
    const meta = textOf(item.meta);
    if (!icon && !desc && !status && !meta) return null;
    return { icon, tone: toneOf(item.iconTone), desc, status, meta };
  }

  /** @private v0.84.0: does `item` match the folded query `q` in the `search-fields`? */
  _matches(item, q, fields, labelKey) {
    if (fields.has('label') && fold(item[labelKey]).includes(q)) return true;
    if (!item || typeof item !== 'object') return false;
    if (fields.has('description')) {
      const d = textOf(item.description);
      if (d && fold(d).includes(q)) return true;
    }
    if (fields.has('keywords')) {
      const k = keywordsOf(item.keywords);
      if (k && fold(k).includes(q)) return true;
    }
    return false;
  }

  // --- Rendering ---

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this._getLabel();
    const action = this._isAction(); // v0.85.0: never a selection → placeholder text, `data-action`, fixed icon
    const placeholder = !this._selectedItem;
    const text = placeholder ? this._getPlaceholder() : this._selectedItem[this._getLabelKey()];
    // v0.82.0: a valid swatch prints a colourless dot; _applySwatchFills() sets its `fill` after render
    const dot = !placeholder && this._swatchOf(this._selectedItem) ? SWATCH_SVG : '';
    // v0.84.0: the option icon (filled by fillIconSlots in afterRender), after the dot
    const icon = placeholder && !action ? '' : this._triggerIconHtml(this._selectedItem);
    const valueAttr = action ? ' data-action' : placeholder ? ' data-placeholder' : '';
    // v0.85.0: `trigger-meta` (absent → '' : the 0.84.0 string); the live region of action mode, outside the portal
    const meta = this._triggerMetaText();
    const metaHtml = meta ? `<span class="td-dropdown__trigger-meta" id="${id}-trigger-meta">${esc(meta)}</span>` : '';
    const live = action ? '<span class="td-sr-only td-dropdown__live" aria-live="polite" aria-atomic="true"></span>' : '';
    const labelHtml = label
      ? `<label class="td-field__label" id="${id}-label" for="${id}-trigger">${esc(label)}</label>`
      : '';
    return `<div class="td-dropdown" data-state="${this._isOpen ? 'open' : 'closed'}">${labelHtml}`
      + `<button type="button" class="td-dropdown__trigger" id="${id}-trigger" role="combobox" aria-haspopup="listbox"`
      + ` aria-expanded="${this._isOpen}" aria-controls="${id}-listbox"${this._isDisabled() ? ' disabled' : ''}>`
      + `<span class="td-dropdown__value"${valueAttr}>${dot}${icon}${esc(text)}</span>${metaHtml}`
      + '<span class="td-dropdown__arrow" data-td-icon="down" aria-hidden="true"></span>'
      + `</button></div>${live}`;
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
    this._applySwatchFills();
    if (this._isOpen && this._isDisabled()) this.close();
    // Push the current selection + validity into the form on (re)render.
    this._syncForm();
    this._applyErrorState();
  }

  /**
   * In place: `value`, `placeholder`, `disabled`, `required`, `name`, `aria-label`, `error-text`, `create-label`,
   * `search-fields`, `trigger-icon`, `trigger-meta` (v0.85.0). `mode` (v0.85.0) re-renders.
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (name === 'mode' && this._isAction()) {
      // v0.85.0: entering action mode drops any selection and any pending value (also before the first render)
      this._selectedItem = null;
      this._pendingValue = null;
    }
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
      case 'search-fields':
        // v0.84.0: re-filter in place with the current search text (an open menu stays open)
        this._handleSearch(this._query());
        return;
      case 'trigger-icon':
        this._updateValueText(); // v0.84.0: only the trigger's value span changes
        return;
      case 'trigger-meta':
        this._updateTriggerMeta(); // v0.85.0: in place (focus kept)
        return;
      default:
        // label, searchable, allow-clear, max-height, value-key, label-key, mode (v0.85.0) → structure changes.
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

  /** @private `aria-required` on the combobox + decorative asterisk in the label (never in action mode — v0.85.0). */
  _applyRequired() {
    const trigger = this._trigger();
    const required = this.hasAttribute('required') && !this._isAction();
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
    if (this._isAction()) {
      // v0.85.0: the placeholder is the button's label (`data-action`), led by the fixed trigger icon
      span.textContent = this._getPlaceholder();
      span.removeAttribute('data-placeholder');
      span.setAttribute('data-action', '');
      const icon = this._triggerIconHtml(null);
      if (icon) {
        span.insertAdjacentHTML('afterbegin', icon);
        fillIconSlots(span, '.td-dropdown__value-icon');
      }
    } else if (this._selectedItem) {
      span.textContent = String(this._selectedItem[this._getLabelKey()]);
      span.removeAttribute('data-placeholder');
      // dot, then the v0.84.0 icon slot (re-created: textContent above wiped it), filled here
      const icon = this._triggerIconHtml(this._selectedItem);
      const lead = (this._swatchOf(this._selectedItem) ? SWATCH_SVG : '') + icon;
      if (lead) span.insertAdjacentHTML('afterbegin', lead);
      if (icon) fillIconSlots(span, '.td-dropdown__value-icon');
    } else {
      span.textContent = this._getPlaceholder();
      span.setAttribute('data-placeholder', '');
    }
    this._applySwatchFills();
    this._scheduleValueTitle();
  }

  /**
   * @private v0.84.0: the trigger's icon slot for `item` ('' = none): plain currentColor, aria-hidden (the name and
   * `title` stay the label text — the svg has no text).
   */
  _triggerIconHtml(item) {
    const name = this._triggerIconOf(item);
    return name
      ? `<span class="td-dropdown__value-icon" data-td-icon="${this.escapeHtml(name)}" aria-hidden="true"></span>`
      : '';
  }

  /**
   * @private v0.85.0: `trigger-meta` in place — the span is added (before the arrow) / re-texted / removed, then the
   * trigger's `aria-describedby` is re-merged. No re-render (focus and an open menu are kept).
   */
  _updateTriggerMeta() {
    const trigger = this._trigger();
    if (!trigger) return;
    const text = this._triggerMetaText();
    let span = trigger.querySelector(':scope > .td-dropdown__trigger-meta');
    if (text) {
      if (!span) {
        span = document.createElement('span');
        span.className = 'td-dropdown__trigger-meta';
        span.id = `${this.id}-trigger-meta`;
        trigger.insertBefore(span, trigger.querySelector(':scope > .td-dropdown__arrow'));
      }
      if (span.textContent !== text) span.textContent = text;
    } else if (span) {
      span.remove();
    }
    this._syncDescribedBy();
  }

  /** @protected v0.85.0: the `trigger-meta` id (while shown), then the helper ids; the base adds the error id. */
  _describedByIds() {
    const trigger = this._trigger();
    const meta = trigger && trigger.querySelector(':scope > .td-dropdown__trigger-meta');
    return [...(meta ? [meta.id] : []), ...super._describedByIds()];
  }

  /** @private v0.82.0: the option's colour when it passes the safeColor gate (same as td-choice-group), else ''. */
  _swatchOf(item) {
    return item && typeof item.swatch === 'string' ? this.safeColor(item.swatch) : '';
  }

  /**
   * @private v0.82.0: colour the dots (trigger + menu rows) through the SVG `fill` presentation attribute — never an
   * HTML string, `style` attribute or `<style>` (CSP). Idempotent; runs after every host render / value-text update.
   */
  _applySwatchFills() {
    const fill = (svg, c) => {
      const circle = svg && svg.querySelector('circle');
      if (circle) circle.setAttribute('fill', c);
    };
    const span = this.querySelector('.td-dropdown__value');
    if (span && this._selectedItem) fill(span.querySelector(':scope > svg.td-dropdown__swatch'), this._swatchOf(this._selectedItem));
    const scroller = this._scroller();
    if (!scroller) return;
    for (const row of scroller.querySelectorAll('.td-dropdown__option[data-index]')) {
      const c = this._swatchOf(this._filteredData[Number(row.dataset.index)]);
      if (c) fill(row.querySelector(':scope > svg.td-dropdown__swatch'), c);
    }
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
    if (this._isAction()) {
      // v0.85.0: action mode writes nothing into the form and `required` never blocks it
      this._setFormValue(null);
      this._setValidity({});
      return;
    }
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
    if (this._passthrough || this._isAction()) return; // v0.85.0: no value to reset in action mode
    const dv = this._defaultValueAttr;
    if (dv == null) this.removeAttribute('value');
    else this.setAttribute('value', dv);
    // Upgraded from a <select>: reset follows the native rule (captured at upgrade), like the select it replaced.
    this.setValue(this._upgraded ? this._resetValue : (dv ?? null));
    this._syncForm();
  }

  _restoreState(state, _mode) {
    if (this._passthrough || this._isAction()) return; // v0.85.0: nothing to restore in action mode
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
    if (this._isAllowClear() && this._selectedItem && !this._isAction()) { // v0.85.0: no clear row in action mode
      nav.push({ clear: true });
      html += `<div class="td-dropdown__option td-dropdown__option--clear" role="option" id="${id}-opt-clear"`
        + ` aria-selected="false" data-value="${CLEAR}" data-nav="${nav.length - 1}"><span class="td-dropdown__option-label">${esc(TdDropdown.labels.none ?? '')}</span></div>`;
    }
    // v0.84.0: group wrappers (only while `groups` is set); `_filteredData` is already in display order
    const groupIndex = this._groupIndex();
    let openGroup = -1; // index of the group whose wrapper is open (-1 = none)
    let measured = false; // a rich row or a group header is rendered → measured listMax
    const wasMeasured = this._measured;
    // v0.86.0: a long list skips off-screen rows (content-visibility, [data-cv]) — never the first max-height + 1 rows,
    // which _placeMenu measures (a skipped row has only its estimated height)
    this._cvFrom = this._filteredData.length > MANY_ROWS ? this._getMaxHeight() + 2 : Infinity;
    this._filteredData.forEach((item, index) => {
      if (groupIndex) {
        const n = this._groupOf(item, groupIndex);
        if (n !== openGroup) {
          if (openGroup >= 0) html += '</div>';
          openGroup = -1;
          const label = n >= 0 ? textOf(this._groups[n].label) : '';
          if (label) {
            // a declared group with an empty label prints its rows unwrapped (like the trailing section)
            openGroup = n;
            measured = true;
            html += `<div class="td-dropdown__group" role="group" aria-labelledby="${id}-grp-${n}">`
              + `<div class="td-dropdown__group-label" role="presentation" id="${id}-grp-${n}">${esc(label)}</div>`;
          }
        }
      }
      const selected = this._isSelected(item);
      nav.push({ item });
      const rich = this._richOf(item);
      if (!rich) {
        // the plain row: exactly the 0.83.0 string (hard compatibility rule)
        html += `<div class="td-dropdown__option" role="option" id="${id}-opt-${index}" aria-selected="${selected}"`
          + `${this._isItemDisabled(item) ? ' aria-disabled="true"' : ''}`
          + ` data-value="${esc(item[valueKey])}" data-index="${index}" data-nav="${nav.length - 1}"`
          + `${nav.length - 1 >= this._cvFrom ? ' data-cv' : ''}>`
          + (this._swatchOf(item) ? SWATCH_SVG : '')
          + `<span class="td-dropdown__option-label">${esc(item[labelKey])}</span>`
          + (selected ? '<span class="td-dropdown__check" data-td-icon="check" aria-hidden="true"></span>' : '')
          + '</div>';
        return;
      }
      measured = true;
      html += this._richRowHtml(item, rich, `${id}-opt-${index}`, index, nav.length - 1, selected);
    });
    if (openGroup >= 0) html += '</div>';
    this._measured = measured;
    scroller.innerHTML = html;
    const many = this._cvFrom !== Infinity;
    if (many !== scroller.hasAttribute('data-many')) scroller.toggleAttribute('data-many', many);
    this._applySwatchFills();
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
    this._syncLoadUi(list, empty);
    const loadMsg = this._loadState === 'loading' ? TdDropdown.labels.loading
      : this._loadState === 'error' ? TdDropdown.labels.loadError : null;
    if (empty && loadMsg != null) {
      // v0.86.0: loading / failed wins over "no results" and the result count
      if (empty.hasAttribute('data-count')) empty.removeAttribute('data-count');
      const msg = String(loadMsg ?? '');
      if (empty.textContent !== msg) empty.textContent = msg;
    } else if (empty) {
      let msg = this._filteredData.length ? '' : String(TdDropdown.labels.noResults ?? '');
      // v0.84.0: the result count (visually hidden via [data-count]) only with a typed query and ≥ 1 match
      let count = false;
      if (this._filteredData.length && this._query().trim()) {
        const tpl = String(TdDropdown.labels.resultCount ?? '');
        if (tpl) {
          msg = tpl.split('{count}').join(String(this._filteredData.length));
          count = true;
        }
      }
      if (count !== empty.hasAttribute('data-count')) empty.toggleAttribute('data-count', count);
      if (empty.textContent !== msg) empty.textContent = msg;
    }
    if (this._activeIndex >= nav.length) this._activeIndex = -1;
    this._syncActive(false);
    // v0.84.0: rows of mixed heights → re-measure the scroller while open (also when leaving the measured layout)
    if (this._isOpen && (measured || wasMeasured)) this._updatePosition();
  }

  /**
   * @private v0.86.0: the load state on the menu (`data-load`), the listbox (`aria-busy`) and the retry button right
   * after the status line (only while failed; never focusable — the menu keeps focus on the trigger / search box).
   */
  _syncLoadUi(list, empty) {
    const menu = this._menuElement;
    const state = this._loadState === 'loading' || this._loadState === 'error' ? this._loadState : '';
    if (menu && (menu.getAttribute('data-load') || '') !== state) {
      if (state) menu.setAttribute('data-load', state);
      else menu.removeAttribute('data-load');
    }
    if (list) {
      if (state === 'loading') list.setAttribute('aria-busy', 'true');
      else list.removeAttribute('aria-busy');
    }
    let retry = menu ? menu.querySelector('.td-dropdown__retry') : null;
    if (state !== 'error') {
      if (retry) retry.remove();
      return;
    }
    if (!retry && empty) {
      retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'td-dropdown__retry';
      retry.tabIndex = -1;
      empty.after(retry);
    }
    if (retry) {
      const text = String(TdDropdown.labels.retry ?? '');
      if (retry.textContent !== text) retry.textContent = text;
    }
  }

  /**
   * @private v0.84.0: one rich row (see the DOM sketch). Name = the label (`aria-labelledby` when there is a
   * description / meta part); description, status and meta = the accessible description. Every text is escaped; the
   * icon is a registered name only (filled by fillIconSlots); tones come from the allowlist.
   */
  _richRowHtml(item, rich, rid, index, navIndex, selected) {
    const esc = (s) => this.escapeHtml(String(s));
    const hasDesc = !!(rich.desc || rich.status);
    const described = [hasDesc ? `${rid}-desc` : '', rich.meta ? `${rid}-meta` : ''].filter(Boolean);
    const aria = described.length ? ` aria-labelledby="${rid}-label" aria-describedby="${described.join(' ')}"` : '';
    const desc = hasDesc
      ? `<span class="td-dropdown__desc" id="${rid}-desc">`
        + (rich.desc ? `<span class="td-dropdown__desc-text">${esc(rich.desc)}</span>` : '')
        + (rich.status
          ? `<span class="td-dropdown__status" data-tone="${rich.status.tone}"><span class="td-dropdown__status-dot" aria-hidden="true"></span>${esc(rich.status.text)}</span>`
          : '')
        + '</span>'
      : '';
    return `<div class="td-dropdown__option td-dropdown__option--rich" role="option" id="${rid}" aria-selected="${selected}"`
      + `${this._isItemDisabled(item) ? ' aria-disabled="true"' : ''}${aria}`
      + ` data-value="${esc(item[this._getValueKey()])}" data-index="${index}" data-nav="${navIndex}"`
      + `${navIndex >= this._cvFrom ? ' data-cv' : ''}>`
      + (this._swatchOf(item) ? SWATCH_SVG : '')
      + (rich.icon ? `<span class="td-dropdown__icon" data-tone="${rich.tone}" data-td-icon="${esc(rich.icon)}" aria-hidden="true"></span>` : '')
      + `<span class="td-dropdown__text"><span class="td-dropdown__option-label" id="${rid}-label">${esc(item[this._getLabelKey()])}</span>${desc}</span>`
      + (rich.meta ? `<span class="td-dropdown__meta" id="${rid}-meta">${esc(rich.meta)}</span>` : '')
      + (selected ? '<span class="td-dropdown__check" data-td-icon="check" aria-hidden="true"></span>' : '')
      + '</div>';
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
      // v0.84.0: the first row of a group also brings its header into view (moving up into a group shows its title)
      const head = activeEl.previousElementSibling;
      if (head && head.classList.contains('td-dropdown__group-label') && typeof head.scrollIntoView === 'function') {
        head.scrollIntoView({ block: 'nearest' });
      }
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

  /** @private commit the active option (clear, item or the create row; v0.85.0 action mode: pick the item) */
  _commitActive() {
    const entry = this._nav[this._activeIndex];
    if (!entry || !this._isNavEnabled(this._activeIndex)) return false;
    if (entry.create) this._activateCreate();
    else if (entry.clear) this._clearSelection();
    else if (this._isAction()) this._pickItem(entry.item);
    else this._selectItem(entry.item);
    return true;
  }

  /**
   * @private v0.85.0 action mode: one pick. Without `keep-open` (the create-row order): close the menu + focus the
   * trigger, then `onPick(item)` → `pick` { value, item } → announcement. With `keep-open`: the menu stays open (search
   * text kept), the active row moves to the next enabled row after the picked one (no wrap), else the previous enabled
   * one, else none; focus stays; then `onPick` → `pick` → announcement. Never a selection, `change` or form value.
   */
  _pickItem(item) {
    if (this._isDisabled() || !item || this._isItemDisabled(item)) return;
    if (this._keepOpen() && this._isOpen) {
      // the next pickable OPTION row (never the create row: Enter there would leave the menu), else the previous one
      const from = this._activeIndex;
      const pickable = (i) => !!this._nav[i].item && this._isNavEnabled(i);
      let next = -1;
      for (let i = from + 1; i < this._nav.length && next < 0; i++) if (pickable(i)) next = i;
      for (let i = from - 1; i >= 0 && next < 0; i--) if (pickable(i)) next = i;
      this._setActive(next);
    } else {
      const trigger = this._trigger();
      this.close();
      if (trigger && document.activeElement !== trigger) trigger.focus({ preventScroll: true });
    }
    if (this._onPick) safeCall(this._onPick, item, 'onPick');
    this.emit('pick', { value: item[this._getValueKey()], item });
    this._announcePicked(item);
  }

  /**
   * @private v0.85.0: the polite live region (in the host, not the hidden portal) — cleared, then `labels.picked` with
   * `{label}` = the label text (split/join: no `$` patterns; textContent, never HTML). '' = no announcement.
   */
  _announcePicked(item) {
    const live = this.querySelector(':scope > .td-dropdown__live');
    if (!live) return;
    live.textContent = '';
    const tpl = String(TdDropdown.labels.picked ?? '');
    if (!tpl) return;
    const label = item[this._getLabelKey()];
    live.textContent = tpl.split('{label}').join(label == null ? '' : String(label));
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
      if (e.target instanceof Element && e.target.closest('.td-dropdown__retry')) {
        if (this._loadState === 'error') this._runLoad();
        return;
      }
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
        if (this._commitActive()) return;
        if (this._loadState === 'error' && this._load) this._runLoad(); // v0.86.0: Enter = "Thử lại", stays open
        else if (source === 'trigger') this.close();
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

  /**
   * @private The options matching `query`, in display (group) order. Case- and diacritic-insensitive ("ha noi" finds
   * "Hà Nội"), like the type-ahead. v0.84.0: label, description and keywords by default (`search-fields` restricts it).
   */
  _filtered(query) {
    const q = fold(query).trim();
    const labelKey = this._getLabelKey();
    const fields = this._searchFields();
    return this._ordered(!q
      ? this._options
      : this._options.filter((item) => this._matches(item, q, fields, labelKey)));
  }

  _handleSearch(query) {
    this._filteredData = this._filtered(query);
    this._renderMenuOptions();
    // Active = first matching option (the clear option is skipped). Closed (a `groups` / `search-fields` change): open()
    // picks the active option.
    if (!this._isOpen) return;
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
    if (this._isAction()) return; // v0.85.0: the `value` attribute is ignored in action mode
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
    if (!this._selectedItem || this._isAction()) return; // v0.85.0: action mode never holds one
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
    this._openActive = mode;
    this._activeIndex = -1;
    this._setActive(this._openActiveIndex(mode));

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
    if (this._load && this._loadState === 'idle') this._runLoad(); // v0.86.0: the loader's one automatic run
  }

  /** @private the active row open() starts on for an `active` mode */
  _openActiveIndex(mode) {
    let sel = this._selectedNavIndex();
    if (sel >= 0 && !this._isNavEnabled(sel)) sel = -1; // a (programmatically) selected disabled option is never active
    if (mode === 'first') return this._enabledFrom(0, 1);
    if (mode === 'last') return this._enabledFrom(this._nav.length - 1, -1);
    if (mode === 'selected-or-first' && sel < 0) return this._enabledFrom(0, 1);
    return sel;
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
      this._filteredData = this._ordered(this._options);
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
    const scroller = this._scroller();
    let listMax = this._getMaxHeight() * OPTION_PX;
    let scrollTop = null;
    if (this._measured && scroller) {
      // v0.84.0 measured layout (rich rows / group headers: mixed heights): the scroller shows exactly N option rows
      // (N = max-height; the clear row counts, group headers add their height but are not rows); fewer than N + 1 rows
      // → natural height (placeFloating still caps it to the viewport).
      scrollTop = scroller.scrollTop;
      scroller.style.removeProperty('max-height');
      const n = this._getMaxHeight();
      const rows = scroller.querySelectorAll('.td-dropdown__option');
      listMax = rows.length > n
        ? rows[n - 1].getBoundingClientRect().bottom - scroller.getBoundingClientRect().top
        : 0;
    }
    const { side } = placeFloating(rect, menu, {
      width: 'match',
      list: scroller,
      listMax,
    });
    if (scrollTop != null) scroller.scrollTop = scrollTop;
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
    if (this._isAction()) return; // v0.85.0: no value in action mode (ignored, nothing stored)
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
    const snap = this._openSnapshot();
    this._options = Array.isArray(newData) ? newData : [];
    this._filteredData = this._ordered(this._options);
    this._optionsInit = true;
    this._reconcileSelection();
    // Resolve a value set before these options arrived (same as the `options` setter).
    if (this._pendingValue != null) {
      this.setValue(this._pendingValue);
    }
    // v0.85.0 / v0.86.0: an OPEN menu keeps its query / active row / scroll (see the `options` setter)
    if (this._isOpen) this._refreshOpen(snap);
    else this._renderMenuOptions();
  }

  /**
   * @private v0.85.0 (v0.86.0: both modes; menu open): the options were re-assigned — re-apply the current search text, keep
   * the active row by value (gone / disabled → that index, moved to the nearest enabled row, forward first), keep the
   * scroller's scrollTop, reposition. Shared by the `options` setter and `updateData()` (v0.86.0 reuses it).
   */
  _refreshOpen(snap = this._openSnapshot()) {
    const { prevIndex, prev, top } = snap || { prevIndex: -1, prev: undefined, top: 0 };
    const vk = this._getValueKey();
    const scroller = this._scroller();
    this._filteredData = this._filtered(this._query());
    this._renderMenuOptions();
    let i = -1;
    if (prev && prev.item) {
      const v = String(prev.item[vk]);
      i = this._nav.findIndex((n) => n.item && String(n.item[vk]) === v);
    } else if (prev && prev.create) {
      i = this._nav.findIndex((n) => n.create);
    } else if (prev && prev.clear) {
      i = this._nav.findIndex((n) => n.clear);
    }
    if (prevIndex >= 0 && (i < 0 || !this._isNavEnabled(i))) {
      const at = i >= 0 ? i : prevIndex;
      i = this._enabledFrom(at, 1) >= 0 ? this._enabledFrom(at, 1) : this._enabledFrom(at, -1);
    }
    this._activeIndex = prevIndex >= 0 ? i : -1;
    this._syncActive(false);
    this._updatePosition();
    if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
  }

  /** @private v0.86.0: what _refreshOpen() keeps (taken before anything re-renders the rows); null while closed */
  _openSnapshot() {
    if (!this._isOpen) return null;
    const scroller = this._scroller();
    return { prevIndex: this._activeIndex, prev: this._nav[this._activeIndex], top: scroller ? scroller.scrollTop : 0 };
  }

  destroy() {
    this._loadToken++; // v0.86.0: a pending load never lands on a destroyed dropdown
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
