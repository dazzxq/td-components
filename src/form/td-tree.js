import { TdFormElement } from '../base/td-form-element.js';
import { createCheckMark } from '../utils/check-mark.js';
import { tdIcon } from '../icons/td-icon.js';
import { TreeModel } from '../utils/tree-model.js';

const TYPEAHEAD_MS = 500;
const FILTER_MS = 150;
const LOADING_MS = 400; // "Đang tải…" only for slow branches (no flash on fast ones)
/** Instance properties a page may set before the element upgrades (re-applied through the class setters). */
const UPGRADE_PROPS = ['data', 'loadChildren'];
const MODES = ['none', 'single', 'multiple'];

/** One clone source per icon name (cloned per row: no registry lookup per node). */
const ICONS = new Map();
function icon(name) {
  if (!ICONS.has(name)) ICONS.set(name, tdIcon(name, { size: 's' }));
  const svg = ICONS.get(name);
  return svg ? svg.cloneNode(true) : null;
}

/** `{key}` placeholders → values (function replacer: `$` in data is never special). */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * Tree view (WAI-ARIA tree) — new in v0.29.0 (plan docs/internal/plans/v0.29.0-tree.md M2–M6). Form-associated,
 * light DOM, token-native (`components/tree.css`, block `.td-tree`); state lives in `aria-*` / `data-*`.
 *
 * Rendered DOM (built with DOM APIs, every label / description through `textContent`; only EXPANDED branches exist):
 *   <td-tree id="{h}">
 *     <div class="td-tree" data-selection="none|single|multiple">
 *       [<label class="td-field__label" id="{h}-label">…</label>]  [<input type="search" class="td-tree__search" aria-controls="{h}-tree">]
 *       <ul role="tree" class="td-tree__list" id="{h}-tree" aria-labelledby|aria-label [aria-multiselectable="true"]>
 *         <li role="treeitem" class="td-tree__item" id="{h}-n{uid}" tabindex="0|-1" aria-level aria-setsize aria-posinset
 *             aria-labelledby="{h}-n{uid}-l" [aria-describedby="{h}-n{uid}-d"] [aria-expanded] [aria-selected | aria-checked]
 *             [aria-disabled="true"] [aria-busy="true"] [data-load="error"]>
 *           <div class="td-tree__row"><span class="td-tree__toggle" aria-hidden="true">svg</span>
 *             [<span class="td-check td-check--sm td-tree__check" aria-hidden="true"><svg …✓></span>]   (v0.36.0 shared mark)
 *             <span class="td-tree__label" id="…-l">…</span>[<span class="td-tree__desc" id="…-d">…</span>]</div>
 *           [<ul role="group" class="td-tree__group">…</ul>]
 *         </li>
 *       </ul>
 *       <p class="td-tree__empty" hidden>…</p>   <p class="td-sr-only" id="{h}-status" role="status"></p>
 *     </div>
 *     [<span class="td-field-error" …>]
 *   </td-tree>
 * Ids come from per-model counters (`uid`), never from data.
 *
 * Focus: roving tabindex (one tab stop). Keyboard (APG): ↓ / ↑ next / previous shown node (no wrap); → closed → open,
 * open → first child; ← open → close, else → parent (RTL swaps ← / →); Home / End; type-ahead (500 ms, diacritic-
 * insensitive); `*` opens every sibling; Enter / Space: `single` selects, `multiple` toggles, `none` fires `activate`.
 * Mouse: the arrow opens / closes, the row = Enter. Locked nodes (`disabled`, inherited by the branch) are reachable and
 * expandable but never selected; a locked selected value is still submitted.
 *
 * Selection: `selection="none|single|multiple"` (+ `cascade` = tri-state, value = checked leaves). Lazy branches:
 * `loadChildren(node, { signal })` (latest-request-wins per node). Filtering: `searchable` (search box) / `filter()`.
 *
 * Form: `name` verbatim (`perms[]`), one FormData entry per value (preorder; unresolved lazy values appended); state =
 * JSON array; `required` → valueMissing; reset → the initial value. Initial value: early `value` property > `value`
 * attribute (`single`: a string; `multiple`: a JSON array).
 *
 * @element td-tree
 * @attr {string} name
 * @attr {string} label - visible label (names the tree)
 * @attr {'none'|'single'|'multiple'} selection - default none
 * @attr {boolean} cascade - multiple: tri-state, value = leaves
 * @attr {boolean} searchable - search box (filters loaded nodes)
 * @attr {string} value - initial value (single: string; multiple: JSON array)
 * @attr {boolean} disabled
 * @attr {boolean} required
 * @attr {string} error-text
 * @fires change - user only: `{ value, added, removed }` (`single`: value is a string, '' when empty)
 * @fires activate - `selection="none"`: `{ value, node }`
 * @fires expanded-change - user open / close: `{ value, expanded }`
 * @fires load-error - `{ value, error }`
 * @property {Array} data
 * @property {Function} loadChildren - `(node, { signal }) => Promise<Array>`
 * @property {string|string[]} value
 */
export class TdTree extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'selection', 'cascade', 'searchable', 'value', 'error-text', 'aria-label'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'cascade', 'searchable'];
  }

  static get errorContract() { return true; }

  /** Default texts (Vietnamese); override per site: `TdTree.labels.noResults = 'No results'`. */
  static labels = {
    search: 'Tìm trong cây',
    empty: 'Không có mục nào',
    noResults: 'Không tìm thấy kết quả',
    loading: 'Đang tải…',
    loadError: 'Không tải được nhánh này',
    results: '{n} kết quả',
    required: 'Vui lòng chọn ít nhất một mục',
  };

  constructor() {
    super();
    /** @type {TreeModel} */
    this._model = new TreeModel();
    /** @private embedded in a td-tree-select (shared model, no form value) */
    this._attached = false;
    /** @private options of an embedded tree */
    this._opts = {};
    this._data = null;
    /** @private uid → rendered li */
    this._items = new Map();
    this._activeUid = 0;
    this._typeBuf = '';
    this._typeTimer = 0;
    this._filterTimer = 0;
    this._loadingTimer = 0;
    this._unsub = null;
    this._revealed = false;
    // a click on an external <label for="{host}"> focuses the tab stop (the tree has no single native control)
    this._labelForwarder = (e) => {
      if (e.target !== this || this._effectiveDisabled) return;
      this.focus();
    };
    this.addEventListener('click', this._labelForwarder);
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
  }

  connectedCallback() {
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    this._clearTimers();
    // in-flight lazy requests are dropped (a late result never touches the DOM); model + value are kept
    this._model.abortAll();
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    super.disconnectedCallback();
  }

  /** @private */
  _clearTimers() {
    for (const t of ['_typeTimer', '_filterTimer', '_loadingTimer']) {
      if (this[t]) window.clearTimeout(this[t]);
      this[t] = 0;
    }
    this._typeBuf = '';
  }

  // --- embedding (td-tree-select) -------------------------------------------------------------------------------

  /**
   * @internal td-tree-select: render the HOST's model (no copy, no two-way sync) — call before connecting.
   * @param {TreeModel} model
   * @param {{ selection: string, cascade?: boolean, virtualFocus?: boolean, listId?: string,
   *   onCommit?: (node: Object, diff: Object|null) => void, onActive?: (li: HTMLElement|null) => void }} opts
   */
  _attachModel(model, opts = {}) {
    this._model = model;
    this._attached = true;
    this._opts = { ...opts };
  }

  // --- properties -----------------------------------------------------------------------------------------------

  get data() { return this._data; }
  set data(v) {
    this._data = Array.isArray(v) ? v : [];
    if (this._attached) return;
    this._model.setData(this._data);
    if (this._initialized && this.isConnected) this._syncForm();
  }

  get loadChildren() { return this._model.loader; }
  set loadChildren(fn) {
    if (this._attached) return;
    this._model.setLoader(fn);
  }

  /** `single`: the value string ('' = none); `multiple`: the array of values (preorder). */
  get value() { return this.getValue(); }
  set value(v) { this.setValue(v); }

  /** @returns {string|string[]} */
  getValue() {
    const vals = this._model.values;
    return this._mode() === 'multiple' ? vals : (vals[0] ?? '');
  }

  /**
   * Programmatic value (silent). `single`: a value; `multiple`: an array (a JSON string is parsed).
   * @param {string|number|Array|null} v
   */
  setValue(v) {
    if (!this._attached && !this._initialized) this._syncMode();
    this._model.setValues(this._coerce(v));
    if (this._initialized && this.isConnected) {
      this._syncAllItems();
      this._syncForm();
    }
  }

  /** @private any value shape → a list */
  _coerce(v) {
    if (Array.isArray(v)) return v;
    if (v == null || v === '') return [];
    if (typeof v === 'string' && this._mode() === 'multiple' && v.trim().startsWith('[')) return this._parseJson(v);
    return [v];
  }

  /** @private JSON array or [] + one warning */
  _parseJson(str) {
    try {
      const v = JSON.parse(str);
      if (Array.isArray(v)) return v;
    } catch { /* fall through */ }
    if (!this._warnedValue) {
      this._warnedValue = true;
      console.warn(`${this.localName}: the value of a multiple tree must be a JSON array — ignored.`);
    }
    return [];
  }

  /** The app object of a (loaded) value, or null. @param {string|number} value */
  getNode(value) { return this._model.getNode(value); }

  /** Open a loaded node (no event). @param {string|number} value */
  expand(value) { this._setOpen(value, true); }

  /** Close a loaded node (no event). @param {string|number} value */
  collapse(value) { this._setOpen(value, false); }

  /** @private */
  _setOpen(value, on) {
    const node = this._model.node(value);
    if (node) this._toggle(node, on, false);
  }

  /** Open every loaded node (no lazy request). */
  expandAll() {
    this._model.expandAll();
    this._rerender();
  }

  /** Close every loaded node. */
  collapseAll() {
    this._model.collapseAll();
    this._rerender();
  }

  /**
   * Filter the loaded nodes by label (diacritic-insensitive); '' clears.
   * @param {string} query
   */
  filter(query) {
    this._model.setFilter(String(query ?? ''));
    this._rerender();
    const m = this._model;
    if (m.filterActive) this._announce(m.matchCount ? format(this._t('results'), { n: m.matchCount }) : this._t('noResults'));
  }

  // --- attributes -----------------------------------------------------------------------------------------------

  /** @private */
  _mode() {
    if (this._attached) return this._opts.selection === 'multiple' ? 'multiple' : 'single';
    const m = (this.getAttribute('selection') || '').toLowerCase();
    return MODES.includes(m) ? m : 'none';
  }

  /** @private push the selection mode into the own model */
  _syncMode() {
    if (this._attached) return;
    this._model.setMode(this._mode(), this.hasAttribute('cascade'));
  }

  /** @private */
  _t(key) { return this.constructor.labels[key] ?? TdTree.labels[key] ?? ''; }

  _setupProperties() {
    this._syncMode();
    super._setupProperties();
    // initial value: an early `value` property (replayed above) wins over the attribute
    if (!this._attached && !this._earlyProps.has('value') && this.hasAttribute('value')) {
      this._model.setValues(this._coerce(this.getAttribute('value')));
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'value':
        this.setValue(newVal);
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
      default: // label, selection, cascade, searchable → structure
        this._syncMode();
        this._rerenderStructure();
    }
  }

  /**
   * @private Review round 1 (ISSUE-5, same class of bug as td-tree-select): a structural re-render while DETACHED is
   * left to the reconnect (which renders anyway); a connected one first runs and clears the previous render's cleanups
   * (listeners on the replaced nodes, the model subscription) so nothing accumulates.
   */
  _rerenderStructure() {
    if (!this.isConnected) return;
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
    this._doRender();
  }

  /** @protected <fieldset disabled> toggles in place (no re-render → focus kept). */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (this._initialized) this._applyDisabled();
  }

  // --- render ---------------------------------------------------------------------------------------------------

  /** @private id base of the rows (`{h}-n{uid}`) */
  _base() { return this._attached && this._opts.listId ? this._opts.listId : this.id; }

  /** @private */
  _listId() { return this._attached && this._opts.listId ? this._opts.listId : `${this.id}-tree`; }

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this._attached ? '' : this.getAttribute('label') || '';
    const search = !this._attached && this.hasAttribute('searchable');
    const t = esc(this._t('search'));
    return `<div class="td-tree" data-selection="${esc(this._mode())}">`
      + (label ? `<label class="td-field__label" id="${id}-label">${esc(label)}</label>` : '')
      + (search ? `<input type="search" class="td-tree__search" aria-label="${t}" placeholder="${t}" autocomplete="off"`
        + ` spellcheck="false" aria-controls="${esc(this._listId())}">` : '')
      + `<ul class="td-tree__list" role="tree" id="${esc(this._listId())}"></ul>`
      + '<p class="td-tree__empty" hidden></p>'
      + `<p class="td-sr-only" id="${id}-status" role="status"></p></div>`;
  }

  afterRender() {
    this._list = this.querySelector('.td-tree__list');
    this._search = this.querySelector('.td-tree__search');
    this._empty = this.querySelector('.td-tree__empty');
    this._statusEl = this.querySelector('.td-tree > [role="status"]');
    if (!this._unsub) {
      this._unsub = this._model.subscribe((e) => this._onModel(e));
      this._cleanups.push(() => {
        if (this._unsub) this._unsub();
        this._unsub = null;
      });
    }
    if (!this._revealed) {
      this._revealed = true;
      if (this._mode() === 'single') this._model.revealSelected();
    }
    if (this._mode() === 'multiple') this._list.setAttribute('aria-multiselectable', 'true');
    this._bindEvents();
    this._renderTree();
    this._applyName();
    this._applyRequired();
    this._applyDisabled();
    this._syncForm();
    this._applyErrorState();
  }

  /** @private full rebuild of the shown nodes (data / filter / mode changes) */
  _rerender() {
    if (this._initialized && this.isConnected && this._list) this._renderTree();
  }

  /** @private */
  _renderTree() {
    const list = this._list;
    if (!list) return;
    const hadFocus = list.contains(document.activeElement);
    this._items.clear();
    const frag = document.createDocumentFragment();
    this._appendLevel(frag, null);
    list.replaceChildren(frag);
    this._ensureActive(hadFocus);
    this._updateEmpty();
  }

  /** @private rows of the shown children of `parent` (roots for null), recursively into expanded branches (≤ 16) */
  _appendLevel(container, parent) {
    const m = this._model;
    const kids = m.shownChildren(parent);
    kids.forEach((node, i) => {
      const li = this._buildItem(node, i + 1, kids.length);
      container.appendChild(li);
      if (m.isExpanded(node)) li.appendChild(this._buildGroup(node));
    });
  }

  /** @private */
  _buildGroup(node) {
    const ul = document.createElement('ul');
    ul.className = 'td-tree__group';
    ul.setAttribute('role', 'group');
    this._appendLevel(ul, node);
    return ul;
  }

  /** @private one treeitem (text only) */
  _buildItem(node, pos, size) {
    const base = this._base();
    const li = document.createElement('li');
    li.className = 'td-tree__item';
    li.setAttribute('role', 'treeitem');
    li.id = `${base}-n${node.uid}`;
    li.setAttribute('data-uid', String(node.uid));
    li.setAttribute('aria-level', String(node.depth + 1));
    li.setAttribute('aria-setsize', String(size));
    li.setAttribute('aria-posinset', String(pos));
    li.setAttribute('aria-labelledby', `${li.id}-l`);
    const row = document.createElement('div');
    row.className = 'td-tree__row';
    const toggle = document.createElement('span');
    toggle.className = 'td-tree__toggle';
    toggle.setAttribute('aria-hidden', 'true');
    const arrow = icon('next');
    if (arrow) toggle.appendChild(arrow);
    row.appendChild(toggle);
    if (this._mode() === 'multiple') {
      // v0.36.0 (ADR 0017): the shared td-checkbox mark; on / mixed come from the item's aria-checked (check.css)
      const check = createCheckMark('sm');
      check.classList.add('td-tree__check');
      row.appendChild(check);
    }
    const label = document.createElement('span');
    label.className = 'td-tree__label';
    label.id = `${li.id}-l`;
    label.textContent = node.label;
    row.appendChild(label);
    if (node.description) {
      const desc = document.createElement('span');
      desc.className = 'td-tree__desc';
      desc.id = `${li.id}-d`;
      desc.textContent = node.description;
      row.appendChild(desc);
      li.setAttribute('aria-describedby', desc.id);
    }
    li.appendChild(row);
    if (!this._opts.virtualFocus) li.setAttribute('tabindex', node.uid === this._activeUid && !this._effectiveDisabled ? '0' : '-1');
    else if (node.uid === this._activeUid) li.setAttribute('data-active', '');
    this._items.set(node.uid, li);
    this._syncItem(li, node);
    return li;
  }

  /** @private state attributes of one row */
  _syncItem(li, node) {
    const m = this._model;
    const mode = this._mode();
    if (m.expandable(node)) {
      li.setAttribute('aria-expanded', String(node.loading ? m.wantsOpen(node) : m.isExpanded(node)));
    } else {
      li.removeAttribute('aria-expanded');
    }
    if (node.loading) li.setAttribute('aria-busy', 'true');
    else li.removeAttribute('aria-busy');
    if (node.loadError) li.setAttribute('data-load', 'error');
    else li.removeAttribute('data-load');
    if (mode === 'single') li.setAttribute('aria-selected', String(m.isSelected(node)));
    else if (mode === 'multiple') li.setAttribute('aria-checked', m.checkState(node));
    const off = mode === 'none' ? node.locked : !m.canSelect(node);
    if (off) li.setAttribute('aria-disabled', 'true');
    else li.removeAttribute('aria-disabled');
  }

  /** @private */
  _syncAllItems() {
    for (const [uid, li] of this._items) {
      const node = this._model.nodeByUid(uid);
      if (node) this._syncItem(li, node);
    }
  }

  /** @private a node's row + its group presence after open / close / load */
  _refreshNode(node) {
    const li = this._items.get(node.uid);
    if (!li) return;
    this._syncItem(li, node);
    const group = li.querySelector(':scope > .td-tree__group');
    const want = this._model.isExpanded(node);
    if (want && !group) {
      li.appendChild(this._buildGroup(node));
    } else if (!want && group) {
      const active = this._activeUid && this._items.get(this._activeUid);
      const focusInside = group.contains(document.activeElement);
      const activeInside = !!active && group.contains(active);
      for (const sub of group.querySelectorAll('.td-tree__item')) this._items.delete(Number(sub.getAttribute('data-uid')));
      group.remove();
      if (activeInside) this._setActive(node, { focus: focusInside, scroll: false });
    }
  }

  /** @private no shown node → the empty / no-results note */
  _updateEmpty() {
    if (!this._empty) return;
    const none = this._model.visible().length === 0;
    this._empty.hidden = !none;
    this._empty.textContent = none ? this._t(this._model.filterActive ? 'noResults' : 'empty') : '';
  }

  // --- active node (roving tabindex / virtual focus) ------------------------------------------------------------

  /** @private */
  _activeNode() {
    const node = this._activeUid ? this._model.nodeByUid(this._activeUid) : null;
    return node && this._items.has(node.uid) ? node : null;
  }

  /** @private keep a valid tab stop: the active node, else the selected one (single), else the first shown */
  _ensureActive(focus = false) {
    let node = this._activeNode();
    if (!node) {
      const sel = this._model.values.map((v) => this._model.node(v)).find((n) => n && this._items.has(n.uid));
      node = (this._mode() === 'single' && sel) || this._model.first();
    }
    if (node) this._setActive(node, { focus, scroll: false });
    else this._activeUid = 0;
  }

  /**
   * @private Move the active node: roving → tabindex 0 (+ DOM focus); virtual → data-active + onActive (the
   * combobox's aria-activedescendant).
   */
  _setActive(node, { focus = true, scroll = true } = {}) {
    const prev = this._activeUid ? this._items.get(this._activeUid) : null;
    const li = node ? this._items.get(node.uid) : null;
    this._activeUid = li ? node.uid : 0;
    if (this._opts.virtualFocus) {
      if (prev && prev !== li) prev.removeAttribute('data-active');
      if (li) li.setAttribute('data-active', '');
      if (this._opts.onActive) this._opts.onActive(li);
      if (li && scroll && typeof li.scrollIntoView === 'function') li.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (prev && prev !== li) prev.setAttribute('tabindex', '-1');
    if (li) {
      li.setAttribute('tabindex', this._effectiveDisabled ? '-1' : '0');
      if (focus) li.focus();
      else if (scroll && typeof li.scrollIntoView === 'function') li.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Focus the tab stop (label click, `el.focus()`). */
  focus(options) {
    if (this._effectiveDisabled) return;
    const li = this._activeUid ? this._items.get(this._activeUid) : null;
    if (li && !this._opts.virtualFocus) li.focus(options);
    else if (this._search) this._search.focus(options);
  }

  /** @internal td-tree-select (multiple): focus the first shown node */
  _focusFirst() {
    const node = this._activeNode() || this._model.first();
    if (node) this._setActive(node, { focus: true });
  }

  /** @internal the active node (td-tree-select) */
  _active() { return this._activeNode(); }

  /** @internal td-tree-select: make `node` (or the selected / first one) active without focusing */
  _activate(node) {
    this._ensureActive(false);
    if (node && this._items.has(node.uid)) this._setActive(node, { focus: false });
  }

  // --- events ---------------------------------------------------------------------------------------------------

  /** @private */
  _bindEvents() {
    const list = this._list;
    this.listen(list, 'click', (e) => this._onClick(e));
    if (this._opts.virtualFocus) {
      // rows are never focused: keep DOM focus on the combobox
      this.listen(list, 'mousedown', (e) => e.preventDefault());
    } else {
      this.listen(list, 'keydown', (e) => {
        if (e.target instanceof Element && e.target.closest('.td-tree__item') && this._key(e)) e.preventDefault();
      });
      this.listen(list, 'focusin', (e) => {
        const li = e.target instanceof Element ? e.target.closest('.td-tree__item') : null;
        const node = li ? this._nodeOf(li) : null;
        if (node && node.uid !== this._activeUid) this._setActive(node, { focus: false, scroll: false });
      });
    }
    if (this._search) {
      this.listen(this._search, 'input', () => {
        if (this._filterTimer) window.clearTimeout(this._filterTimer);
        this._filterTimer = window.setTimeout(() => {
          this._filterTimer = 0;
          this.filter(this._search ? this._search.value : '');
        }, FILTER_MS);
      });
      this.listen(this._search, 'keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._focusFirst();
        } else if (e.key === 'Enter') {
          e.preventDefault(); // never submits the form from the filter box
        }
      });
    }
  }

  /** @private */
  _nodeOf(li) {
    const uid = Number(li.getAttribute('data-uid'));
    return Number.isFinite(uid) ? this._model.nodeByUid(uid) : null;
  }

  /** @private arrow = open / close, row = commit */
  _onClick(e) {
    if (this._effectiveDisabled) return;
    const t = e.target instanceof Element ? e.target : null;
    // review round 1 (ISSUE-2): only a node's OWN row acts — a click in a nested group's whitespace (its padding /
    // indent) resolves to the ancestor li and must do nothing
    const row = t ? t.closest('.td-tree__row') : null;
    const li = row ? row.parentElement : null;
    if (!li || !li.classList.contains('td-tree__item') || !this._list.contains(li)) return;
    const node = this._nodeOf(li);
    if (!node) return;
    if (t.closest('.td-tree__toggle')) {
      if (this._model.expandable(node)) this._toggle(node, !this._model.wantsOpen(node), true);
      this._setActive(node, { focus: !this._opts.virtualFocus, scroll: false });
      return;
    }
    this._setActive(node, { focus: !this._opts.virtualFocus, scroll: false });
    this._commit(node);
  }

  /** @private RTL (computed direction) swaps ← / → */
  _isRtl() {
    try {
      return this.matches(':dir(rtl)');
    } catch {
      return getComputedStyle(this).direction === 'rtl';
    }
  }

  /**
   * @internal The APG tree keys on the active node (roving: from the list; virtual: forwarded by td-tree-select).
   * @param {KeyboardEvent} e
   * @returns {boolean} handled (the caller prevents the default)
   */
  _key(e) {
    if (this._effectiveDisabled || e.defaultPrevented) return false;
    if (e.isComposing || e.keyCode === 229) return false;
    const m = this._model;
    let node = this._activeNode();
    if (!node) {
      this._ensureActive(false);
      node = this._activeNode();
    }
    if (!node) return false;
    const rtl = this._isRtl();
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const go = (n) => { if (n) this._setActive(n, { focus: !this._opts.virtualFocus }); };
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    switch (e.key) {
      case 'ArrowDown': go(m.next(node)); return true;
      case 'ArrowUp': go(m.prev(node)); return true;
      case 'Home': go(m.first()); return true;
      case 'End': go(m.last()); return true;
      case fwd:
        if (m.expandable(node) && !m.wantsOpen(node)) this._toggle(node, true, true);
        else go(m.firstChild(node));
        return true;
      case back:
        if (m.expandable(node) && m.wantsOpen(node)) this._toggle(node, false, true);
        else go(m.parentOf(node));
        return true;
      case '*': {
        // review round 1 (S-02): only siblings whose children are LOADED — never a burst of loadChildren requests
        for (const sib of m.shownChildren(node.parent)) {
          if (sib.children && sib.children.length && !m.wantsOpen(sib)) this._toggle(sib, true, true);
        }
        return true;
      }
      case 'Enter':
      case ' ':
        this._commit(node);
        return true;
      default:
        if (e.key.length === 1) {
          this._typeahead(e.key);
          return true;
        }
        return false;
    }
  }

  /** @private */
  _typeahead(ch) {
    if (this._typeTimer) window.clearTimeout(this._typeTimer);
    this._typeBuf += ch;
    this._typeTimer = window.setTimeout(() => {
      this._typeTimer = 0;
      this._typeBuf = '';
    }, TYPEAHEAD_MS);
    const hit = this._model.typeahead(this._activeNode(), this._typeBuf);
    if (hit) this._setActive(hit, { focus: !this._opts.virtualFocus });
  }

  /** @private open / close (user → `expanded-change`) */
  _toggle(node, on, user) {
    const m = this._model;
    if (!m.expandable(node) || m.wantsOpen(node) === on) return;
    m.setExpanded(node, on);
    this._refreshNode(node);
    if (user) this.emit('expanded-change', { value: node.value, expanded: on });
  }

  /** @private Enter / Space / row click */
  _commit(node) {
    if (this._effectiveDisabled) return;
    const m = this._model;
    const mode = this._mode();
    if (mode === 'none') {
      if (!node.locked && !node.dup) this.emit('activate', { value: node.value, node: node.src });
      return;
    }
    const diff = m.activate(node);
    if (diff) {
      if (mode === 'single' || m.cascade) this._syncAllItems();
      else this._refreshNode(node);
      this._syncForm();
    }
    if (this._opts.onCommit) this._opts.onCommit(node, diff);
    if (diff) this.emit('change', { value: this.getValue(), added: diff.added, removed: diff.removed });
  }

  /** @private model notifications */
  _onModel(e) {
    if (!this._list) return;
    const m = this._model;
    switch (e.type) {
      case 'data':
        // new data: the selected node of a single tree is revealed (its ancestors opened) like on the first render
        if (this._mode() === 'single') m.revealSelected();
        this._renderTree();
        this._syncForm();
        return;
      case 'loading':
        if (this._items.has(e.node.uid)) this._syncItem(this._items.get(e.node.uid), e.node);
        if (!this._loadingTimer) {
          this._loadingTimer = window.setTimeout(() => {
            this._loadingTimer = 0;
            if (m._loading.size) this._announce(this._t('loading'));
          }, LOADING_MS);
        }
        return;
      case 'load':
        this._loadSettled();
        if (m.filterActive) this._renderTree();
        else this._refreshNode(e.node);
        this._syncAllItems();
        this._updateEmpty();
        this._syncForm();
        return;
      case 'load-error':
        this._loadSettled();
        this._refreshNode(e.node);
        this._announce(this._t('loadError'));
        this.emit('load-error', { value: e.node.value, error: e.error });
        return;
      case 'values':
        this._syncAllItems();
        this._syncForm();
        return;
      default:
    }
  }

  /** @private */
  _loadSettled() {
    if (this._loadingTimer && !this._model._loading.size) {
      window.clearTimeout(this._loadingTimer);
      this._loadingTimer = 0;
    }
  }

  /** @private swap the text of the ONE status region (a repeat toggles a trailing NBSP so it is re-announced) */
  _announce(msg) {
    const el = this._statusEl;
    if (!el) return;
    el.textContent = el.textContent === msg ? `${msg} ` : msg;
  }

  // --- name / required / disabled -------------------------------------------------------------------------------

  /** @private label attribute > host aria-label > external <label for> */
  _applyName() {
    const list = this._list;
    if (!list || this._attached) return;
    list.removeAttribute('aria-label');
    list.removeAttribute('aria-labelledby');
    if (this.getAttribute('label')) {
      list.setAttribute('aria-labelledby', `${this.id}-label`);
      return;
    }
    const aria = this.getAttribute('aria-label');
    if (aria) {
      list.setAttribute('aria-label', aria);
      return;
    }
    const labels = this._internals && this._internals.labels ? [...this._internals.labels] : [];
    const ids = labels.map((l) => {
      if (!l.id) l.id = `${this.id}-ext-label-${labels.indexOf(l)}`;
      return l.id;
    });
    if (ids.length) list.setAttribute('aria-labelledby', ids.join(' '));
  }

  /** @private decorative asterisk + aria-required on the tree */
  _applyRequired() {
    const required = this.hasAttribute('required') && !this._attached;
    if (this._list) {
      if (required) this._list.setAttribute('aria-required', 'true');
      else this._list.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-tree > .td-field__label');
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
    if (this._list) {
      if (off) this._list.setAttribute('aria-disabled', 'true');
      else this._list.removeAttribute('aria-disabled');
    }
    if (this._search) this._search.disabled = off;
    if (!this._opts.virtualFocus) {
      for (const [uid, li] of this._items) li.setAttribute('tabindex', !off && uid === this._activeUid ? '0' : '-1');
    }
  }

  // --- form -----------------------------------------------------------------------------------------------------

  /** @protected the tree element (aria-invalid / aria-describedby / validity anchor) */
  _focusTarget() {
    return this._list || null;
  }

  /** @private */
  _syncForm() {
    if (this._attached || !this._initialized) return;
    const name = this.getAttribute('name');
    const vals = this._model.values;
    let fd = null;
    if (name && vals.length) {
      fd = new FormData();
      for (const v of vals) fd.append(name, v);
    }
    this._setFormValue(fd, JSON.stringify(vals));
    if (this.hasAttribute('required') && this._model.isEmpty()) {
      this._setValidity({ valueMissing: true }, this._t('required'), this._activeItemOrList());
    } else {
      this._setValidity({});
    }
  }

  /** @private validity bubble anchor */
  _activeItemOrList() {
    return (this._activeUid && this._items.get(this._activeUid)) || this._list || undefined;
  }

  _captureDefaults() {
    super._captureDefaults();
    /** @private reset target */
    this._defaultValues = this._model.values.slice();
  }

  _restoreDefaults() {
    this._model.setValues(this._defaultValues || []);
    this._syncAllItems();
    this._syncForm();
  }

  _restoreState(state) {
    if (typeof state !== 'string') return;
    let list;
    try {
      list = JSON.parse(state);
    } catch {
      return;
    }
    if (!Array.isArray(list)) return;
    this._model.setValues(list);
    this._syncAllItems();
    this._syncForm();
  }
}

if (!customElements.get('td-tree')) customElements.define('td-tree', TdTree);
