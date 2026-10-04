import { TdFormElement } from '../base/td-form-element.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';
import { LAYERS, register as registerLayer } from '../utils/layers.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { TreeModel } from '../utils/tree-model.js';
import { isCoarsePointer } from '../utils/breakpoints.js';
import './td-tree.js';

/** Instance properties a page may set before the element upgrades (re-applied through the class setters). */
const UPGRADE_PROPS = ['data', 'loadChildren'];
const FILTER_MS = 150;
const LIST_MAX = 320; // px: max height of the tree scroller in the popup
const PATH_SEP = ' › ';

/**
 * The text an edit inserted into `before` (review round 2 ISSUE-10): strip the longest common prefix, then the longest
 * common suffix that does not overlap it. A pure deletion → ''.
 * @param {string} before
 * @param {string} after
 * @returns {string}
 */
function editDelta(before, after) {
  // code points, not UTF-16 units: a boundary never splits a surrogate pair (review round 3 ISSUE-11)
  const b = Array.from(before);
  const a = Array.from(after);
  const max = Math.min(b.length, a.length);
  let p = 0;
  while (p < max && b[p] === a[p]) p++;
  let s = 0;
  while (s < max - p && b[b.length - 1 - s] === a[a.length - 1 - s]) s++;
  return a.slice(p, a.length - s).join('');
}

/** `{key}` placeholders → values (function replacer: `$` in data is never special). */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * Tree select — a form control picking one / several nodes of a tree in a popup (v0.29.0, plan
 * docs/internal/plans/v0.29.0-tree.md M7). Form-associated, light DOM, token-native (`components/tree-select.css`).
 *
 * ONE model (src/utils/tree-model.js) lives on the host: value, lazy state, locks. The popup holds a `<td-tree>` created
 * on every connect (same portal lifetime), WITHOUT a name, rendering the host model through an internal hook — no copy,
 * no two-way sync. Its events never bubble out of the portal: the host fires `change` / `expanded-change` /
 * `load-error` itself.
 *
 * Two ARIA patterns, one controlling element each:
 * - single = APG combobox with a `tree` popup: ONE `role="combobox"` element — the input (`searchable`, default: typing
 *   filters in place; closed it shows the selected label) or the button (`searchable="false"`) — with aria-expanded /
 *   aria-controls / aria-activedescendant; DOM focus never leaves it (the tree runs virtual focus). ↑↓ (closed → open),
 *   Home / End (button; caret keys in the input), ← → and `*` (button; input only when EMPTY), Enter = pick + close
 *   (focus kept), Space on the button = pick + close (its keyboard activation click is suppressed), Escape / Tab close.
 * - multiple = disclosure: a button (aria-expanded + aria-controls the popup); open → focus in the popup search box
 *   (≥ 768px, else the tree) — the tree uses roving tabindex, Space / Enter toggle a check, the popup stays open;
 *   Escape / Tab out close and focus the trigger.
 *
 * Rendered DOM:
 *   <td-tree-select id="{h}">
 *     <div class="td-tree-select" data-state="closed|open" [data-multiple]>
 *       [<label class="td-field__label" id="{h}-label" for="{h}-input|{h}-trigger">…</label>]
 *       <div class="td-tree-select__control">
 *         <input class="td-tree-select__input" id="{h}-input" role="combobox" …>  |  <button class="td-tree-select__trigger" id="{h}-trigger" …>
 *           <span class="td-tree-select__value" id="{h}-value" [data-placeholder]>…</span></button>
 *         [<button type="button" class="td-tree-select__clear" aria-label="{labels.clear}" hidden>×</button>]
 *         <span class="td-tree-select__arrow" data-td-icon="down" aria-hidden="true"></span>
 *       </div>
 *     </div>
 *   </td-tree-select>
 *   <body> portal (per connect): <div class="td-tree-select__menu td-glass-surface td-glass-surface--strong" id="{h}-menu" hidden>
 *     [<div class="td-tree-select__search-wrap"><input type="search" class="td-tree-select__search" …></div>]  (multiple)
 *     <div class="td-tree-select__scroller"><td-tree id="{h}-tt"> … <ul role="tree" id="{h}-tree"> …</td-tree></div></div>
 *
 * Progressive enhancement: a direct child `<select>` (PHP td_tree_select, or hand-written) is read on the first connect —
 * options in preorder, `data-level` (a jump > +1 is clamped), `data-label`, `data-description`; `data-locked` (or
 * `disabled` without `data-native-only`) = locked node; `value=""` options skipped (the first one's text = placeholder);
 * `<optgroup>` flattened; `<input type="hidden" class="td-tree-select__locked">` children = locked selected values. A
 * focused select is upgraded on its blur. SSR shell contract `data-td-ssr="tree-select@1"` (removed on upgrade).
 * Initial value: early `value` property > `value` attribute > the select's live state. Reset: the select's native
 * defaults (else the initial value).
 *
 * Locks (M3): a locked selected value stays submitted (once) and the user cannot remove / replace it; a single locked
 * selection blocks every other pick and the clear button; clear (multiple) removes only the unlocked values.
 *
 * @element td-tree-select
 * @attr {string} name
 * @attr {string} label
 * @attr {string} placeholder
 * @attr {boolean} multiple
 * @attr {boolean} cascade - multiple only
 * @attr {boolean} searchable - default ON (`searchable="false"` turns it off)
 * @attr {boolean} allow-clear
 * @attr {'label'|'path'} display - single: the selected node's label, or its path "A › B › C"
 * @attr {string} value - single: a value; multiple: a JSON array
 * @attr {string} value-label - single: label shown for a value not loaded yet
 * @attr {string} value-labels - multiple: JSON object `{"value": "label"}` for values not loaded yet
 * @attr {boolean} disabled
 * @attr {boolean} required
 * @attr {string} error-text
 * @fires change - user only: `{ value, added, removed }`
 * @fires expanded-change - `{ value, expanded }`
 * @fires load-error - `{ value, error }`
 * @property {Array} data
 * @property {Function} loadChildren
 * @property {string|string[]} value
 */
export class TdTreeSelect extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'placeholder', 'multiple', 'cascade', 'searchable', 'allow-clear',
      'display', 'value', 'value-label', 'value-labels', 'error-text', 'aria-label'];
  }

  // `searchable` is a default-ON flag with its own prototype accessor (like td-dropdown).
  static get booleanAttributes() {
    return [...super.booleanAttributes, 'multiple', 'cascade', 'allow-clear'];
  }

  static get errorContract() { return true; }

  /** SSR shell contract `data-td-ssr="tree-select@1"` (PHP td_tree_select element mode). */
  static SSR_SCHEMA = 1;

  /** Default texts (Vietnamese); override per site. */
  static labels = {
    search: 'Tìm kiếm',
    /** fallback accessible name when there is no label / external label / aria-label */
    tree: 'Chọn mục',
    clear: 'Xoá lựa chọn',
    /** the "+n" tail of the multiple summary ("Apple, Samsung +3") */
    selectedCount: '+{n}',
    required: 'Vui lòng chọn một mục',
  };

  constructor() {
    super();
    this._model = new TreeModel({ warn: (msg) => console.warn(String(msg).replace(/^td-tree:/, 'td-tree-select:')) });
    this._data = null;
    this._isOpen = false;
    this._menuElement = null;
    this._tree = null;
    this._layer = null;
    this._suppressClick = 0;
    this._filterTimer = 0;
    this._scrollRafId = 0;
    this._unsub = null;
    this._boundPointerOutside = (e) => {
      const t = e.target;
      if (!this.contains(t) && this._menuElement && !this._menuElement.contains(t)) this.close();
    };
    this._boundOnScroll = () => {
      if (this._scrollRafId) return;
      this._scrollRafId = requestAnimationFrame(() => {
        this._scrollRafId = 0;
        this._updatePosition();
      });
    };
    this._boundOnResize = () => this._updatePosition();
    this._replayUpgradeProps();
  }

  /** @private own properties set before the upgrade shadow the class accessors: re-apply them */
  _replayUpgradeProps() {
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
  }

  connectedCallback() {
    this._replayUpgradeProps();
    if (!this._initialized && !this._selectChecked) {
      const select = [...this.children].find((c) => c.localName === 'select');
      // the user is choosing in the native select right now: nothing happens until it blurs (then once)
      if (select && !this._ssrNoDefer && select.ownerDocument.activeElement === select) {
        this._deferUntilBlur(select);
        return;
      }
      this._selectChecked = true;
      if (this._ssrMatches('tree-select', TdTreeSelect.SSR_SCHEMA)) this.removeAttribute('data-td-ssr');
      if (select) this._upgradeSelect(select);
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    this._cancelDefer();
    if (this._isOpen) {
      this._removeGlobalListeners();
      this._releaseLayer();
      this._isOpen = false;
    }
    if (this._filterTimer) window.clearTimeout(this._filterTimer);
    this._filterTimer = 0;
    if (this._scrollRafId) cancelAnimationFrame(this._scrollRafId);
    this._scrollRafId = 0;
    this._suppressClick = 0;
    this._model.abortAll();
    super.disconnectedCallback(); // cleanups remove the portal (the popup tree disconnects with it)
  }

  /** @private wait for the focused select to blur — ONE capture listener (td-dropdown v0.26 mechanism) */
  _deferUntilBlur(select) {
    if (this._ssrDefer) return;
    const onBlur = () => {
      this._cancelDefer();
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

  /** @private */
  _cancelDefer() {
    const d = this._ssrDefer;
    if (!d) return;
    this._ssrDefer = null;
    d.select.removeEventListener('blur', d.onBlur, { capture: true });
  }

  /**
   * @private Read a child `<select>` (+ hidden locked inputs) into data / live value / reset default / host attributes,
   * re-point its `<label for>` at the host, then remove it.
   * @param {HTMLSelectElement} select
   */
  _upgradeSelect(select) {
    this._ensureId();
    const opts = [...select.options];
    const roots = [];
    const stack = [];
    let prev = -1;
    let warned = false;
    let phText = null;
    const live = [];
    const isOff = (o) => o.disabled || !!(o.parentElement && o.parentElement.localName === 'optgroup' && o.parentElement.disabled);
    for (const opt of opts) {
      if (opt.value === '') {
        if (phText === null) phText = (opt.getAttribute('data-label') ?? opt.textContent).replace(/^[\s ]+/, '').trim();
        continue;
      }
      let level = parseInt(opt.getAttribute('data-level') || '0', 10);
      if (!Number.isFinite(level) || level < 0) level = 0;
      if (level > prev + 1) {
        level = prev + 1;
        if (!warned) {
          warned = true;
          console.warn('td-tree-select: an <option> data-level jumps more than one level — clamped.');
        }
      }
      const node = {
        value: opt.value,
        label: opt.hasAttribute('data-label') ? opt.getAttribute('data-label') : opt.textContent.replace(/^[\s ]+/, '').trim(),
        children: [],
      };
      const desc = opt.getAttribute('data-description');
      if (desc) node.description = desc;
      // the locked marker: data-locked, or a disabled option that is not a no-JS-only constraint (hand-written select)
      if (opt.hasAttribute('data-locked') || (isOff(opt) && !opt.hasAttribute('data-native-only'))) node.disabled = true;
      (level ? stack[level - 1].children : roots).push(node);
      stack[level] = node;
      stack.length = level + 1;
      prev = level;
      if (opt.selected) live.push(opt.value);
    }
    let defaults;
    if (select.multiple) {
      defaults = opts.filter((o) => o.defaultSelected && o.value !== '').map((o) => o.value);
    } else {
      let def = null;
      for (const o of opts) if (o.defaultSelected) def = o;
      if (!def) def = opts.find((o) => !isOff(o)) || null;
      defaults = def && def.value !== '' ? [def.value] : [];
    }
    for (const input of [...this.children]) {
      if (input.localName !== 'input' || input.type !== 'hidden' || !input.classList.contains('td-tree-select__locked')) continue;
      if (input.value !== '') {
        live.push(input.value);
        defaults.push(input.value);
      }
      input.remove();
    }
    for (const attr of ['name', 'aria-label']) {
      const v = select.getAttribute(attr);
      if (v != null && !this.hasAttribute(attr)) this.setAttribute(attr, v);
    }
    for (const attr of ['required', 'disabled', 'multiple']) {
      if (select.hasAttribute(attr) && !this.hasAttribute(attr)) this.setAttribute(attr, '');
    }
    if (phText && !this.hasAttribute('placeholder')) this.setAttribute('placeholder', phText);
    if (select.id) {
      for (const label of [...(select.labels || [])]) {
        if (label.htmlFor === select.id) label.htmlFor = this.id;
      }
    }
    select.remove();
    if (!this._dataEarly) this.data = roots;
    this._upgradeLive = live;
    this._resetValues = defaults;
    this._upgraded = true;
  }

  // --- properties -----------------------------------------------------------------------------------------------

  get data() { return this._data; }
  set data(v) {
    this._data = Array.isArray(v) ? v : [];
    if (!this._initialized) this._dataEarly = true;
    this._model.setData(this._data);
  }

  get loadChildren() { return this._model.loader; }
  set loadChildren(fn) { this._model.setLoader(fn); }

  /** Default-ON flag: `false` → `searchable="false"`; anything else → attribute removed (back to ON). */
  get searchable() { return this._searchable(); }
  set searchable(v) { v === false ? this.setAttribute('searchable', 'false') : this.removeAttribute('searchable'); }

  /** single: the value string ('' = none); multiple: the array of values. */
  get value() { return this.getValue(); }
  set value(v) { this.setValue(v); }

  /** @returns {string|string[]} */
  getValue() {
    const vals = this._model.values;
    return this._multiple() ? vals : (vals[0] ?? '');
  }

  /**
   * Programmatic value (silent; may select locked nodes). single: a value; multiple: an array (or a JSON string).
   * @param {string|number|Array|null} v
   */
  setValue(v) {
    if (!this._initialized) this._syncMode();
    this._model.setValues(this._coerce(v));
    if (this._initialized && this.isConnected) {
      if (this._tree) this._tree._syncAllItems();
      this._updateDisplay();
      this._syncForm();
    }
  }

  /** @private */
  _coerce(v) {
    if (Array.isArray(v)) return v;
    if (v == null || v === '') return [];
    if (typeof v === 'string' && this._multiple()) return this._parseJsonArray(v);
    return [v];
  }

  /** @private */
  _parseJsonArray(str) {
    try {
      const v = JSON.parse(str);
      if (Array.isArray(v)) return v;
    } catch { /* fall through */ }
    if (!this._warnedValue) {
      this._warnedValue = true;
      console.warn('td-tree-select: the value of a multiple tree-select must be a JSON array — ignored.');
    }
    return [];
  }

  // --- attribute helpers ----------------------------------------------------------------------------------------

  _multiple() { return this.hasAttribute('multiple'); }

  /** @private default ON; off only for `"false"` / `"0"` / `"off"` */
  _searchable() {
    if (!this.hasAttribute('searchable')) return true;
    const v = (this.getAttribute('searchable') || '').trim().toLowerCase();
    return !(v === 'false' || v === '0' || v === 'off');
  }

  _placeholder() { return this.getAttribute('placeholder') || ''; }

  /** @private */
  _syncMode() {
    this._model.setMode(this._multiple() ? 'multiple' : 'single', this.hasAttribute('cascade'));
  }

  _setupProperties() {
    this._syncMode();
    super._setupProperties();
    // precedence: early `value` property (replayed above) > `value` attribute > the select's live state
    if (!this._earlyProps.has('value')) {
      if (this.hasAttribute('value')) this._model.setValues(this._coerce(this.getAttribute('value')));
      else if (this._upgradeLive) this._model.setValues(this._upgradeLive);
    }
    this._upgradeLive = null;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'value':
        this.setValue(newVal);
        return;
      case 'value-label':
      case 'value-labels':
      case 'display':
      case 'placeholder':
        this._updateDisplay();
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
        super.attributeChangedCallback(name, oldVal, newVal);
        return;
      default: // label, multiple, cascade, searchable, allow-clear → structure (the popup is rebuilt)
        if (this._isOpen) this.close();
        this._syncMode();
        this._rerenderStructure();
    }
  }

  /**
   * @private Review round 1 (ISSUE-5). Detached: nothing is rendered (no portal may be put into <body> by an element
   * that is not on the page) — the reconnect renders. Connected: the previous render's cleanups run first (the old
   * portal + its tree, listeners on the replaced nodes, the model subscription) and are cleared, so re-renders never
   * accumulate closures or portals.
   */
  _rerenderStructure() {
    if (!this.isConnected) {
      this._destroyMenu();
      return;
    }
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
    this._destroyMenu();
    this._doRender();
  }

  /** @protected <fieldset disabled> toggles in place. */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (this._initialized) this._applyDisabled();
  }

  // --- render ---------------------------------------------------------------------------------------------------

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const multiple = this._multiple();
    const input = !multiple && this._searchable();
    const label = this.getAttribute('label') || '';
    const dis = this._effectiveDisabled ? ' disabled' : '';
    const control = input
      ? `<input type="text" class="td-tree-select__input" id="${id}-input" role="combobox" aria-haspopup="tree"`
        + ` aria-expanded="false" aria-controls="${id}-tree" aria-autocomplete="list" autocomplete="off" spellcheck="false"${dis}>`
      : `<button type="button" class="td-tree-select__trigger" id="${id}-trigger"`
        + (multiple ? ` aria-controls="${id}-menu"` : ` role="combobox" aria-haspopup="tree" aria-controls="${id}-tree"`)
        + ` aria-expanded="false"${dis}><span class="td-tree-select__value" id="${id}-value"></span></button>`;
    const clear = this.hasAttribute('allow-clear')
      ? `<button type="button" class="td-tree-select__clear" aria-label="${esc(TdTreeSelect.labels.clear ?? '')}" hidden>`
        + '<span data-td-icon="close" data-td-icon-size="s" aria-hidden="true"></span></button>'
      : '';
    return `<div class="td-tree-select" data-state="closed"${multiple ? ' data-multiple' : ''}>`
      + (label ? `<label class="td-field__label" id="${id}-label" for="${id}-${input ? 'input' : 'trigger'}">${esc(label)}</label>` : '')
      + `<div class="td-tree-select__control">${control}${clear}`
      + '<span class="td-tree-select__arrow" data-td-icon="down" aria-hidden="true"></span></div></div>';
  }

  afterRender() {
    this._control = this.querySelector('.td-tree-select__control');
    this._combo = this.querySelector('.td-tree-select__input, .td-tree-select__trigger');
    this._clearBtn = this.querySelector('.td-tree-select__clear');
    this._valueEl = this.querySelector('.td-tree-select__value');
    if (!this._menuElement) this._buildMenu();
    if (!this._unsub) {
      this._unsub = this._model.subscribe((e) => this._onModel(e));
      this._cleanups.push(() => {
        if (this._unsub) this._unsub();
        this._unsub = null;
      });
    }
    this._bindEvents();
    fillIconSlots(this);
    this._applyName();
    this._applyRequired();
    this._applyDisabled();
    this._updateDisplay();
    this._syncForm();
    this._applyErrorState();
  }

  /** @private the body portal + its popup tree (rendering THIS model) */
  _buildMenu() {
    const id = this.id;
    const multiple = this._multiple();
    const menu = document.createElement('div');
    menu.className = 'td-tree-select__menu td-glass-surface td-glass-surface--strong';
    menu.id = `${id}-menu`;
    menu.hidden = true;
    menu.setAttribute('data-state', 'closed');
    let search = null;
    if (multiple && this._searchable()) {
      const wrap = document.createElement('div');
      wrap.className = 'td-tree-select__search-wrap';
      search = document.createElement('input');
      search.type = 'search';
      search.className = 'td-tree-select__search';
      search.setAttribute('aria-label', String(TdTreeSelect.labels.search ?? ''));
      search.setAttribute('aria-controls', `${id}-tree`);
      search.placeholder = String(TdTreeSelect.labels.search ?? '');
      search.autocomplete = 'off';
      search.spellcheck = false;
      wrap.appendChild(search);
      menu.appendChild(wrap);
      search.addEventListener('input', () => this._scheduleFilter(search.value));
      search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this._tree) this._tree._focusFirst();
        } else if (e.key === 'Enter') {
          e.preventDefault();
        }
      });
    }
    const scroller = document.createElement('div');
    scroller.className = 'td-tree-select__scroller';
    const tree = document.createElement('td-tree');
    tree.id = `${id}-tt`;
    tree.className = 'td-tree-select__tree';
    tree._attachModel(this._model, {
      selection: multiple ? 'multiple' : 'single',
      virtualFocus: !multiple,
      listId: `${id}-tree`,
      onCommit: (node, diff) => this._onTreeCommit(node, diff),
      onActive: (li) => this._onTreeActive(li),
    });
    // the popup tree's events stay in the portal: the host fires its own
    for (const type of ['change', 'expanded-change', 'load-error']) {
      tree.addEventListener(type, (e) => {
        if (!(e instanceof CustomEvent) || e.target !== tree) return;
        e.stopPropagation();
        this.emit(type, e.detail);
      });
    }
    scroller.appendChild(tree);
    menu.appendChild(scroller);
    document.body.appendChild(menu);
    this._menuElement = menu;
    this._tree = tree;
    this._search = search;
    this._scroller = scroller;
    this._cleanups.push(() => {
      menu.remove();
      if (this._menuElement === menu) {
        this._menuElement = null;
        this._tree = null;
        this._search = null;
      }
    });
  }

  /** @private structure change: the popup is rebuilt by the next render */
  _destroyMenu() {
    if (!this._menuElement) return;
    this._menuElement.remove();
    this._menuElement = null;
    this._tree = null;
    this._search = null;
  }

  /** @private */
  _bindEvents() {
    const control = this._control;
    const combo = this._combo;
    if (!control || !combo) return;
    this.listen(control, 'click', (e) => this._onControlClick(e));
    this.listen(combo, 'keydown', (e) => this._onKeydown(e));
    // engines firing the keyboard activation click on keyup do it in the keyup default action → clear after it
    this.listen(combo, 'keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') window.setTimeout(() => { this._suppressClick = 0; }, 0);
    });
    if (combo.localName === 'input') {
      // review round 1 (ISSUE-3): the closed input shows the selected LABEL — the first edit (typing, paste, drop)
      // starts a fresh query instead of editing that label. Chromium / Firefox: the whole label is selected right before
      // the edit, so the browser's own insertion replaces it. WebKit fixes the edit range before `beforeinput` (and
      // clearing the value there loses the keystroke): on `input` only the inserted part is kept (editDelta — caret at
      // the start, middle or end, typing or paste; review round 2 ISSUE-10).
      this.listen(combo, 'beforeinput', (e) => {
        if (this._isOpen || this._effectiveDisabled || !combo.value) return;
        this._labelBefore = combo.value;
        // the edit's own text (typing / paste / drop): when the value ends up exactly this, the label was replaced
        const dt = e.dataTransfer;
        this._editText = typeof e.data === 'string' ? e.data : (dt ? dt.getData('text/plain') : null);
        combo.setSelectionRange(0, combo.value.length);
      });
      this.listen(combo, 'input', () => {
        const before = this._labelBefore;
        const text = this._editText;
        this._labelBefore = '';
        this._editText = null;
        // the edit's own text IS the fresh query (typing / paste / drop, every engine); no text (a deletion) → keep only
        // what the edit left inserted (editDelta, code points)
        if (!this._isOpen && before) {
          const has = typeof text === 'string' && text !== '';
          // with the edit's text: always that (even when WebKit's result equals the label — same char over itself)
          const q = has ? text : combo.value !== before ? editDelta(before, combo.value) : combo.value;
          if (combo.value !== q) combo.value = q;
        }
        if (!this._isOpen) this.open({ typing: true });
        this._scheduleFilter(combo.value);
      });
    }
    if (this._clearBtn) this.listen(this._clearBtn, 'click', (e) => { e.stopPropagation(); this._clearUser(); });
  }

  /** @private */
  _scheduleFilter(q) {
    if (this._filterTimer) window.clearTimeout(this._filterTimer);
    this._filterTimer = window.setTimeout(() => {
      this._filterTimer = 0;
      if (!this._tree || !this._isOpen) return;
      this._tree.filter(q);
      if (!this._multiple()) this._tree._activate(null);
      this._updatePosition();
    }, FILTER_MS);
  }

  /** @private mouse / keyboard activation on the control box */
  _onControlClick(e) {
    if (this._effectiveDisabled) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest('.td-tree-select__clear')) return;
    // the keyboard activation click of an Enter / Space already handled on keydown (mouse clicks have detail ≥ 1)
    const suppressed = e.detail === 0 && this._suppressClick && performance.now() - this._suppressClick < 1000;
    this._suppressClick = 0;
    if (suppressed) return;
    const combo = this._combo;
    if (combo.localName === 'input') {
      if (!this._isOpen) this.open();
      if (document.activeElement !== combo) combo.focus();
      return;
    }
    if (document.activeElement !== combo) combo.focus();
    this.toggle();
  }

  /** @private */
  _onKeydown(e) {
    if (this._effectiveDisabled || e.defaultPrevented) return;
    if (e.isComposing || e.keyCode === 229) return;
    const k = e.key;
    const open = this._isOpen;
    if (this._multiple()) {
      if (!open && (k === 'ArrowDown' || k === 'ArrowUp')) {
        e.preventDefault();
        this.open();
      }
      return; // Space / Enter = the native button click
    }
    const tree = this._tree;
    const isInput = this._combo.localName === 'input';
    const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        this.open();
      } else if (!isInput && (k === 'Enter' || k === ' ')) {
        e.preventDefault();
        this._suppressClick = performance.now();
        this.open();
      } else if (!isInput && (k === 'Home' || k === 'End' || printable)) {
        this.open();
        if (tree) tree._key(e); // reads defaultPrevented: prevent after
        e.preventDefault();
      }
      return;
    }
    if (e.altKey && k === 'ArrowUp') {
      e.preventDefault();
      this._commitActive();
      return;
    }
    const empty = !isInput || this._combo.value === '';
    switch (k) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (tree) tree._key(e);
        e.preventDefault();
        return;
      case 'Home':
      case 'End':
        if (isInput) return; // caret movement
        if (tree) tree._key(e);
        e.preventDefault();
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
      case '*':
        if (!empty) return; // decision 4: in a non-empty box these edit the text
        if (tree) tree._key(e);
        e.preventDefault();
        return;
      case 'Enter':
        e.preventDefault();
        if (!isInput) this._suppressClick = performance.now();
        this._commitActive();
        return;
      case ' ':
        if (isInput) return; // typing a space
        e.preventDefault();
        this._suppressClick = performance.now();
        this._commitActive();
        return;
      default:
        if (!isInput && printable && tree) {
          tree._key(e);
          e.preventDefault();
        }
    }
  }

  /** @private single: pick the active node (if allowed) and close */
  _commitActive() {
    const node = this._tree ? this._tree._active() : null;
    if (node) this._tree._commit(node);
    if (this._isOpen) this.close();
  }

  /** @private popup tree commit (user): host display / form; single closes when the node is (now) selected */
  _onTreeCommit(node, diff) {
    if (diff) {
      this._updateDisplay();
      this._syncForm();
    }
    if (!this._multiple() && this._isOpen && (diff || this._model.isSelected(node))) this.close({ focus: true });
  }

  /** @private virtual focus (single): the combobox's aria-activedescendant */
  _onTreeActive(li) {
    const combo = this._combo;
    if (!combo || this._multiple()) return;
    if (li && this._isOpen) combo.setAttribute('aria-activedescendant', li.id);
    else combo.removeAttribute('aria-activedescendant');
  }

  /** @private model notifications (data / lazy branch loaded / values reconciled) */
  _onModel(e) {
    if (!this._initialized || !this.isConnected) return;
    if (e.type === 'data' || e.type === 'load' || e.type === 'values') {
      this._updateDisplay();
      this._syncForm();
      if (this._isOpen) this._updatePosition();
    }
  }

  /** @private user clear: only the unlocked values (M3) */
  _clearUser() {
    if (this._effectiveDisabled) return;
    const diff = this._model.clear();
    if (!diff) return;
    if (this._tree) this._tree._syncAllItems();
    this._updateDisplay();
    this._syncForm();
    if (this._combo) this._combo.focus();
    this.emit('change', { value: this.getValue(), added: diff.added, removed: diff.removed });
  }

  // --- display --------------------------------------------------------------------------------------------------

  /** @private value-labels JSON (cached per attribute string; invalid → {} + one warning) */
  _valueLabels() {
    const raw = this.getAttribute('value-labels');
    if (raw === this._vlRaw) return this._vl;
    this._vlRaw = raw;
    // review round 1 (ISSUE-6): a null-prototype copy of the OWN string / number entries — a value such as
    // "toString" / "constructor" / "__proto__" never reads through Object.prototype
    this._vl = Object.create(null);
    if (raw) {
      try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('not an object');
        for (const k of Object.keys(v)) {
          if (typeof v[k] === 'string' || typeof v[k] === 'number') this._vl[k] = String(v[k]);
        }
      } catch {
        if (!this._warnedLabels) {
          this._warnedLabels = true;
          console.warn('td-tree-select: value-labels must be a JSON object {"value": "label"} — ignored.');
        }
      }
    }
    return this._vl;
  }

  /** @private label of a value: the node (path when display="path", single), else value-label(s), else the value */
  _labelFor(v, single) {
    const node = this._model.node(v);
    if (node) {
      return single && this.getAttribute('display') === 'path' ? this._model.pathOf(node).join(PATH_SEP) : node.label;
    }
    if (single) return this.getAttribute('value-label') || v;
    const vl = this._valueLabels();
    const l = Object.prototype.hasOwnProperty.call(vl, v) ? vl[v] : '';
    return l === '' ? v : l;
  }

  /** @private the text of the closed control */
  _displayText() {
    const vals = this._model.values;
    if (!vals.length) return '';
    if (!this._multiple()) return this._labelFor(vals[0], true);
    const labels = vals.map((v) => this._labelFor(v, false));
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} ${format(TdTreeSelect.labels.selectedCount, { n: labels.length - 2 })}`;
  }

  /** @private trigger / input text + placeholder + clear button */
  _updateDisplay() {
    const text = this._displayText();
    const ph = this._placeholder();
    const combo = this._combo;
    if (combo && combo.localName === 'input') {
      if (!this._isOpen) {
        combo.value = text;
        combo.placeholder = ph;
      } else {
        combo.placeholder = text || ph;
      }
    } else if (this._valueEl) {
      this._valueEl.textContent = text || ph;
      if (text) this._valueEl.removeAttribute('data-placeholder');
      else this._valueEl.setAttribute('data-placeholder', '');
    }
    if (this._clearBtn) this._clearBtn.hidden = this._effectiveDisabled || !this._model.hasClearable();
  }

  // --- name / required / disabled -------------------------------------------------------------------------------

  /** @private host name → the control AND the popup tree: label attr > external <label for> > aria-label > labels.tree */
  _applyName() {
    const control = this._combo;
    const ul = this._tree ? this._tree.querySelector('[role="tree"]') : null;
    let ids = null;
    let aria = null;
    if (this.getAttribute('label')) {
      ids = `${this.id}-label`;
    } else {
      const labels = this._internals && this._internals.labels ? [...this._internals.labels] : [];
      if (labels.length) {
        ids = labels.map((l, i) => {
          if (!l.id) l.id = `${this.id}-lbl-${i}`;
          return l.id;
        }).join(' ');
      } else {
        aria = this.getAttribute('aria-label') || String(TdTreeSelect.labels.tree ?? '');
      }
    }
    for (const el of [control, ul]) {
      if (!el) continue;
      el.removeAttribute('aria-label');
      el.removeAttribute('aria-labelledby');
      if (ids) el.setAttribute('aria-labelledby', ids);
      else el.setAttribute('aria-label', aria);
    }
    // the disclosure button is named by the label only: its summary is its description
    if (control && this._multiple()) control.setAttribute('aria-describedby', `${this.id}-value`);
  }

  /** @private */
  _applyRequired() {
    const required = this.hasAttribute('required');
    const combo = this._combo;
    if (combo && !this._multiple()) {
      if (required) combo.setAttribute('aria-required', 'true');
      else combo.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-tree-select > .td-field__label');
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

  /** @private */
  _applyDisabled() {
    const off = this._effectiveDisabled;
    if (this._combo) this._combo.disabled = off;
    if (this._control) {
      if (off) this._control.setAttribute('data-disabled', '');
      else this._control.removeAttribute('data-disabled');
    }
    if (off && this._isOpen) this.close();
    this._updateDisplay();
  }

  // --- open / close ---------------------------------------------------------------------------------------------

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  /**
   * Open the popup.
   * @param {{ typing?: boolean }} [opts] internal: typing in the input keeps its text
   */
  open(opts = {}) {
    if (this._isOpen || this._effectiveDisabled || !this._menuElement || !this._tree) return;
    const menu = this._menuElement;
    const tree = this._tree;
    const combo = this._combo;
    const single = !this._multiple();
    this._isOpen = true;
    // review round 1 (ISSUE-4): the portal lives in <body> — carry the host's computed direction over (a `dir`
    // attribute, not a style: CSP) so the popup and its tree (← / → swap) follow an RTL host on an LTR page
    menu.dir = getComputedStyle(this).direction === 'rtl' ? 'rtl' : 'ltr';
    if (single) {
      this._model.revealSelected();
      tree._rerender();
    }
    menu.hidden = false;
    menu.setAttribute('data-state', 'open');
    this.querySelector('.td-tree-select')?.setAttribute('data-state', 'open');
    combo.setAttribute('aria-expanded', 'true');
    if (single && combo.localName === 'input') {
      combo.placeholder = this._displayText() || this._placeholder();
      if (!opts.typing) combo.value = '';
    }
    this._place(this._control.getBoundingClientRect());
    this._layer = registerLayer({
      layer: LAYERS.popover,
      element: menu,
      keyboard: 'boundary',
      onEscape: () => this._onLayerEscape(),
      onTab: (e) => this._onLayerTab(e),
      anchor: this,
      onCovered: () => this._closeCovered(),
    });
    this._addGlobalListeners();
    if (single) {
      const sel = this._model.values.map((v) => this._model.node(v)).find(Boolean) || null;
      tree._activate(sel);
    } else if (this._search && !isCoarsePointer()) { // touch: no on-screen keyboard over the tree
      this._search.focus();
    } else {
      tree._focusFirst();
    }
  }

  /**
   * Close the popup (the filter is cleared, the input shows the selected label again).
   * @param {{ focus?: boolean }} [opts] focus the control afterwards
   */
  close(opts = {}) {
    if (!this._isOpen) return;
    const menu = this._menuElement;
    const combo = this._combo;
    this._isOpen = false;
    const menuHadFocus = !!(menu && menu.contains(document.activeElement));
    if (menu) {
      menu.hidden = true;
      menu.setAttribute('data-state', 'closed');
    }
    this.querySelector('.td-tree-select')?.setAttribute('data-state', 'closed');
    if (combo) {
      combo.setAttribute('aria-expanded', 'false');
      combo.removeAttribute('aria-activedescendant');
    }
    if (this._filterTimer) window.clearTimeout(this._filterTimer);
    this._filterTimer = 0;
    if (this._scrollRafId) cancelAnimationFrame(this._scrollRafId);
    this._scrollRafId = 0;
    this._removeGlobalListeners();
    this._releaseLayer();
    if (this._search) this._search.value = '';
    if (this._tree && this._model.filterActive) this._tree.filter('');
    this._updateDisplay();
    if (combo && !this._noFocusReturn && (opts.focus || menuHadFocus) && document.activeElement !== combo) {
      combo.focus({ preventScroll: true });
    }
  }

  /** @private covered by a newer blocking layer: close without focusing the (inert) control */
  _closeCovered() {
    this._noFocusReturn = true;
    try {
      this.close();
    } finally {
      this._noFocusReturn = false;
    }
  }

  /** @private */
  _releaseLayer() {
    if (this._layer) {
      this._layer.release();
      this._layer = null;
    }
  }

  /** @private Escape: close + focus the control; consumed. */
  _onLayerEscape() {
    this.close({ focus: true });
    return true;
  }

  /**
   * @private Tab: focus inside the popup (multiple) → close + back to the trigger ('handled'); focus on the control →
   * close and 'pass' (the natural order / a lower modal trap moves on).
   */
  _onLayerTab(e) {
    const menu = this._menuElement;
    if (menu && menu.contains(document.activeElement)) {
      e.preventDefault();
      this.close({ focus: true });
      return 'handled';
    }
    this.close();
    return 'pass';
  }

  /** @private */
  _addGlobalListeners() {
    document.addEventListener('pointerdown', this._boundPointerOutside, true);
    window.addEventListener('resize', this._boundOnResize);
    window.addEventListener('scroll', this._boundOnScroll, true);
    if (this._unwatchRef) this._unwatchRef();
    this._unwatchRef = this._control ? watchReference(this._control, () => this._updatePosition()) : null;
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

  /** @private */
  _updatePosition() {
    if (!this._isOpen || !this._control) return;
    const rect = this._control.getBoundingClientRect();
    if (isReferenceHidden(rect, this._control)) {
      this.close();
      return;
    }
    this._place(rect);
  }

  /** @private same width as the control, below preferred, the scroller capped (shared placeFloating) */
  _place(rect) {
    const menu = this._menuElement;
    if (!menu) return;
    const { side } = placeFloating(rect, menu, { width: 'match', list: this._scroller, listMax: LIST_MAX });
    menu.setAttribute('data-placement', side);
  }

  // --- form -----------------------------------------------------------------------------------------------------

  _focusTarget() {
    return this.querySelector('.td-tree-select__input, .td-tree-select__trigger');
  }

  /** @private */
  _syncForm() {
    if (!this._initialized) return;
    const name = this.getAttribute('name');
    const vals = this._model.values;
    let fd = null;
    if (name && vals.length) {
      fd = new FormData();
      for (const v of vals) fd.append(name, v);
    }
    this._setFormValue(fd, JSON.stringify(vals));
    if (this.hasAttribute('required') && this._model.isEmpty()) {
      this._setValidity({ valueMissing: true }, String(TdTreeSelect.labels.required ?? ''), this._focusTarget() || undefined);
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    /** @private reset target: the select's native defaults when upgraded, else the initial value */
    this._defaultValues = this._upgraded ? [...this._resetValues] : this._model.values.slice();
  }

  _restoreDefaults() {
    if (this._isOpen) this.close();
    this.setValue(this._defaultValues || []);
  }

  _restoreState(state) {
    if (typeof state !== 'string') return;
    let list;
    try {
      list = JSON.parse(state);
    } catch {
      return;
    }
    if (Array.isArray(list)) this.setValue(list);
  }
}

if (!customElements.get('td-tree-select')) customElements.define('td-tree-select', TdTreeSelect);
