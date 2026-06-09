import { TdFormElement } from '../base/td-form-element.js';
import { applyStyles } from '../utils/css-safe.js';

/**
 * Dropdown component with searchable popup, keyboard navigation, auto-positioning.
 * Port of dcms-dropdown.js to a form-associated Web Component.
 *
 * **Form-associated (ElementInternals, 0.2.0):** submits the selected option's value
 * in any host `<form>`, supports `required` (→ `valueMissing` until something is
 * picked), reset (restores the initial `value`), `<fieldset disabled>`, and
 * state restore (bfcache/autofill re-selects by value).
 *
 * @element td-dropdown
 * @attr {string} placeholder - Placeholder text (default "Chọn một tùy chọn")
 * @attr {boolean} searchable - Enable search filtering (default on)
 * @attr {boolean} disabled - Disable the dropdown (also via ancestor <fieldset disabled>)
 * @attr {boolean} required - A value must be selected for the form to be valid
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {boolean} allow-clear - Show clear option when item selected (default on)
 * @attr {number} max-height - Max visible options count (default 5)
 * @attr {string} value-key - Key for option value (default "value")
 * @attr {string} label-key - Key for option label (default "label")
 * @attr {string} value - Initial selected value
 * @fires change - When selection changes, detail: { value, item }
 *
 * @property {Array<Object>} options - Array of option objects set via JS property
 * @property {Function} onChange - Callback receiving value only
 * @property {Function} onSelect - Callback receiving full item object
 */
export class TdDropdown extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'placeholder', 'searchable', 'allow-clear', 'max-height', 'value-key', 'label-key', 'value'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'searchable', 'allow-clear'];
  }

  /** @type {TdDropdown[]} Track all open dropdowns for closeAllExcept */
  static _openDropdowns = [];

  constructor() {
    super();
    this._options = [];
    this._selectedItem = null;
    /** @private A value set before its option existed; resolved when options arrive. */
    this._pendingValue = null;
    this._filteredData = [];
    this._highlightedIndex = -1;
    this._isOpen = false;
    this._menuElement = null;
    this._scrollRafId = null;

    // Callbacks set via JS property
    this._onChange = null;
    this._onSelect = null;

    // Bound handlers for global event management
    this._boundClickOutside = (e) => {
      if (!this.contains(e.target) && this._menuElement && !this._menuElement.contains(e.target)) {
        this.close();
      }
    };
    this._boundKeydown = (e) => {
      if (this._isOpen) this._handleKeydown(e);
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

  // --- Property accessors ---

  get options() { return this._options; }
  set options(data) {
    this._options = Array.isArray(data) ? data : [];
    this._filteredData = [...this._options];
    this._setInitialValue();
    // Resolve a value that was set (e.g. via setValue/state-restore) before options arrived.
    // A pending value is the most recent explicit selection, so it overrides any stale one.
    if (this._pendingValue != null) {
      this.setValue(this._pendingValue);
    }
    if (this._menuElement) {
      this._renderMenuOptions();
    }
  }

  get onChange() { return this._onChange; }
  set onChange(fn) { this._onChange = typeof fn === 'function' ? fn : null; }

  get onSelect() { return this._onSelect; }
  set onSelect(fn) { this._onSelect = typeof fn === 'function' ? fn : null; }

  // --- Attribute helpers ---

  _getPlaceholder() { return this.getAttribute('placeholder') || 'Chọn một tùy chọn'; }
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
  _getMaxHeight() { return parseInt(this.getAttribute('max-height') || '5', 10); }
  _getValueKey() { return this.getAttribute('value-key') || 'value'; }
  _getLabelKey() { return this.getAttribute('label-key') || 'label'; }
  _getInitialValue() { return this.getAttribute('value') || null; }

  // --- Rendering ---

  render() {
    const isDisabled = this._isDisabled();
    const placeholder = this._getPlaceholder();
    const disabledClass = isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';
    const displayText = this._selectedItem
      ? this.escapeHtml(String(this._selectedItem[this._getLabelKey()]))
      : this.escapeHtml(placeholder);

    return `
      <div class="td-dropdown-container">
        <button
          type="button"
          ${isDisabled ? 'disabled' : ''}
          aria-haspopup="listbox"
          aria-expanded="${this._isOpen}"
          class="td-dropdown-button w-full border rounded-xl text-left text-gray-900 focus-visible:outline-none transition-[background-color,opacity] duration-200 flex items-center justify-between text-sm ${disabledClass}">
          <span class="td-dropdown-selected truncate">${displayText}</span>
          <svg class="td-dropdown-arrow w-4 h-4 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      </div>
    `;
  }

  /**
   * @private CSP-safe scalar styling via CSSOM (replaces the removed declarative inline styles).
   * Auto-invoked by the base after `afterRender()` on the initial render AND on every
   * observed-attribute re-render. Sets the button's static box/visual scalars and the
   * arrow's open/closed rotation. `open()`/`close()` additionally mutate `arrow.style`
   * directly (no re-render fires there), so the chevron stays in sync with toggles.
   */
  _applyStyles() {
    const button = this.querySelector('.td-dropdown-button');
    applyStyles(button, {
      'background-color': 'rgba(255,255,255,0.72)',
      'border-color': 'rgba(0,0,0,0.1)',
      'padding': '8px 14px',
      'height': '40px',
      'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.9)',
    });
    // Closed → leave `transform` unset so it computes to `none` (parity with the original
    // empty inline value); open → rotate the chevron. `applyStyles` skips nullish values.
    const arrow = this.querySelector('.td-dropdown-arrow');
    applyStyles(arrow, { transform: this._isOpen ? 'rotate(180deg)' : null });
  }

  afterRender() {
    // Create menu element and append to body (for fixed positioning)
    if (!this._menuElement) {
      this._menuElement = document.createElement('div');
      this._menuElement.className = 'td-dropdown-menu fixed rounded-xl hidden z-[10010]';
      this._menuElement.style.cssText = `
        background: rgba(255,255,255,0.72);
        backdrop-filter: blur(16px) saturate(160%);
        -webkit-backdrop-filter: blur(16px) saturate(160%);
        border: 1px solid rgba(255,255,255,0.5);
        box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
        transition: none;
      `;
      document.body.appendChild(this._menuElement);
      this._cleanups.push(() => {
        if (this._menuElement && this._menuElement.parentNode) {
          this._menuElement.parentNode.removeChild(this._menuElement);
        }
      });
    }

    this._renderMenuContent();
    this._bindButtonEvents();

    // Register in open dropdowns list
    if (!TdDropdown._openDropdowns.includes(this)) {
      TdDropdown._openDropdowns.push(this);
      this._cleanups.push(() => {
        const idx = TdDropdown._openDropdowns.indexOf(this);
        if (idx > -1) TdDropdown._openDropdowns.splice(idx, 1);
      });
    }

    // Push the current selection + validity into the form on (re)render.
    this._syncForm();
  }

  // Prevent full re-render for value attribute changes
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'disabled') {
      // Keep effective-disabled in sync without forcing a full re-render path divergence.
      this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    }
    if (!this._initialized) return;

    if (name === 'value') {
      this.setValue(newVal);
      this._syncForm();
      return;
    }

    this._doRender();
  }

  // --- Form participation ---

  /** @private Push the selected value + validity to the form. */
  _syncForm() {
    const val = this.getValue();
    this._setFormValue(val == null || val === '' ? null : String(val));
    if (this.hasAttribute('required') && (val == null || val === '')) {
      this._setValidity({ valueMissing: true }, 'Vui lòng chọn một tùy chọn', this._focusTarget());
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
    const dv = this._defaultValueAttr;
    if (dv == null) this.removeAttribute('value');
    else this.setAttribute('value', dv);
    this.setValue(dv ?? null);
    this._syncForm();
  }

  _restoreState(state, _mode) {
    if (typeof state === 'string') {
      this.setValue(state);
      this._syncForm();
    }
  }

  _focusTarget() {
    return this.querySelector('.td-dropdown-button');
  }

  disconnectedCallback() {
    // Close if open
    if (this._isOpen) {
      this._removeGlobalListeners();
    }
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    super.disconnectedCallback();
  }

  // --- Menu rendering ---

  _renderMenuContent() {
    const isSearchable = this._isSearchable();
    const maxHeight = this._getMaxHeight();

    this._menuElement.innerHTML = `
      ${isSearchable ? `
        <div class="p-2 border-b border-black/[0.06]">
          <input
            type="text"
            class="td-dropdown-search w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500/50 text-gray-900 placeholder-gray-400"
            placeholder="Tìm kiếm...">
        </div>
      ` : ''}
      <div class="td-dropdown-options py-1 overflow-y-auto" role="listbox">
        ${this._renderOptions()}
      </div>
    `;

    // CSP-safe scalar styling for the portaled menu (replaces the removed declarative inline styles).
    // The menu lives on document.body, so it can't be styled by `_applyStyles()` (which
    // scopes to the host); apply here, right after its innerHTML is set.
    const searchInput = this._menuElement.querySelector('.td-dropdown-search');
    applyStyles(searchInput, {
      'border-color': 'rgba(0,0,0,0.08)',
      'background': 'rgba(255,255,255,0.5)',
    });
    const optionsContainer = this._menuElement.querySelector('.td-dropdown-options');
    applyStyles(optionsContainer, { 'max-height': `${maxHeight * 40}px` });

    this._bindMenuEvents();
  }

  _renderMenuOptions() {
    const optionsContainer = this._menuElement.querySelector('.td-dropdown-options');
    if (optionsContainer) {
      optionsContainer.innerHTML = this._renderOptions();
    }
  }

  _renderOptions() {
    const valueKey = this._getValueKey();
    const labelKey = this._getLabelKey();
    const allowClear = this._isAllowClear();

    // Clear option
    let clearHtml = '';
    if (allowClear && this._selectedItem) {
      clearHtml = `
        <button
          type="button"
          class="td-dropdown-option td-dropdown-option-clear w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-black/5 hover:text-gray-700 focus:outline-none focus:bg-black/5 transition-colors border-b border-black/[0.06]"
          data-value="__CLEAR__">
          <div class="flex items-center justify-between">
            <span class="truncate">&#10005; Không chọn</span>
          </div>
        </button>
      `;
    }

    if (this._filteredData.length === 0) {
      return clearHtml + `<div class="px-3 py-2 text-sm text-gray-500 italic">Không tìm thấy kết quả</div>`;
    }

    const optionsHtml = this._filteredData.map((item, index) => {
      const selected = this._isSelected(item);
      const highlighted = index === this._highlightedIndex;
      return `
        <button
          type="button"
          role="option"
          aria-selected="${selected}"
          class="td-dropdown-option w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-black/5 focus:outline-none focus:bg-black/5 transition-colors ${selected ? 'bg-black/[0.06] font-medium' : ''} ${highlighted && !selected ? 'bg-black/[0.04]' : ''}"
          data-value="${this.escapeHtml(String(item[valueKey]))}"
          data-index="${index}">
          <div class="flex items-center justify-between">
            <span class="truncate">${this.escapeHtml(String(item[labelKey]))}</span>
            ${selected ? `
              <svg class="w-4 h-4 text-gray-900 shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
            ` : ''}
          </div>
        </button>
      `;
    }).join('');

    return clearHtml + optionsHtml;
  }

  _isSelected(item) {
    if (!this._selectedItem) return false;
    const vk = this._getValueKey();
    return String(this._selectedItem[vk]) === String(item[vk]);
  }

  // --- Event binding ---

  _bindButtonEvents() {
    const button = this.querySelector('.td-dropdown-button');
    if (!button) return;

    this.listen(button, 'click', (e) => {
      if (this._isDisabled()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      this.toggle();
    });

    this.listen(button, 'focus', () => {
      if (!this._isDisabled()) {
        button.style.boxShadow = '0 0 0 3px rgba(59,130,246,.2), inset 0 1px 0 rgba(255,255,255,0.9)';
        button.style.borderColor = 'rgba(59,130,246,0.5)';
      }
    });

    this.listen(button, 'blur', () => {
      this.setTimeout(() => {
        if (!this._isOpen) {
          button.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.9)';
          button.style.borderColor = 'rgba(0,0,0,0.1)';
        }
      }, 100);
    });
  }

  _bindMenuEvents() {
    const searchInput = this._menuElement.querySelector('.td-dropdown-search');
    const optionsContainer = this._menuElement.querySelector('.td-dropdown-options');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._handleSearch(e.target.value);
      });
    }

    if (optionsContainer) {
      optionsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.td-dropdown-option');
        if (option) {
          const value = option.dataset.value;
          if (value === '__CLEAR__') {
            this._clearSelection();
          } else {
            this._selectAndFire(value);
          }
        }
      });

      optionsContainer.addEventListener('mousemove', (e) => {
        const option = e.target.closest('.td-dropdown-option[data-index]');
        if (option) {
          const idx = parseInt(option.dataset.index, 10);
          if (idx !== this._highlightedIndex) {
            this._highlightedIndex = idx;
            this._updateHighlight();
          }
        }
      });
    }
  }

  // --- Keyboard navigation ---

  _handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (this._highlightedIndex < this._filteredData.length - 1) {
          this._highlightedIndex++;
        } else {
          this._highlightedIndex = 0;
        }
        this._updateHighlight();
        this._scrollHighlightedIntoView();
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this._highlightedIndex > 0) {
          this._highlightedIndex--;
        } else {
          this._highlightedIndex = this._filteredData.length - 1;
        }
        this._updateHighlight();
        this._scrollHighlightedIntoView();
        break;

      case 'Enter':
        e.preventDefault();
        if (this._highlightedIndex >= 0 && this._highlightedIndex < this._filteredData.length) {
          const item = this._filteredData[this._highlightedIndex];
          this._selectAndFire(item[this._getValueKey()]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        const btn = this.querySelector('.td-dropdown-button');
        if (btn) btn.focus();
        break;
    }
  }

  _updateHighlight() {
    if (!this._menuElement) return;
    const options = this._menuElement.querySelectorAll('.td-dropdown-option[data-index]');
    options.forEach((el) => {
      const idx = parseInt(el.dataset.index, 10);
      const isHighlighted = idx === this._highlightedIndex;
      const isSelected = this._isSelected(this._filteredData[idx]);
      if (isHighlighted && !isSelected) {
        el.classList.add('bg-black/[0.04]');
      } else {
        el.classList.remove('bg-black/[0.04]');
      }
    });
  }

  _scrollHighlightedIntoView() {
    if (!this._menuElement) return;
    const el = this._menuElement.querySelector(`.td-dropdown-option[data-index="${this._highlightedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  // --- Search ---

  _handleSearch(query) {
    const lowerQuery = query.toLowerCase().trim();
    const labelKey = this._getLabelKey();
    this._filteredData = !lowerQuery
      ? [...this._options]
      : this._options.filter(item =>
          String(item[labelKey]).toLowerCase().includes(lowerQuery)
        );
    this._highlightedIndex = this._filteredData.length > 0 ? 0 : -1;
    this._renderMenuOptions();
  }

  // --- Selection ---

  _selectAndFire(value) {
    if (this._isDisabled()) return;

    const valueKey = this._getValueKey();
    const labelKey = this._getLabelKey();
    const item = this._options.find(i => String(i[valueKey]) === String(value));
    if (!item) return;

    this._selectedItem = item;
    const selectedSpan = this.querySelector('.td-dropdown-selected');
    if (selectedSpan) {
      selectedSpan.textContent = item[labelKey];
    }
    this._renderMenuOptions();
    this.close();

    // Form participation
    this._syncForm();

    // Fire callbacks
    this._fireCallback(item);
    this.emit('change', { value: item[valueKey], item });
  }

  _clearSelection() {
    if (this._isDisabled()) return;

    this._selectedItem = null;
    const selectedSpan = this.querySelector('.td-dropdown-selected');
    if (selectedSpan) {
      selectedSpan.textContent = this._getPlaceholder();
    }
    this._renderMenuOptions();
    this.close();

    // Form participation
    this._syncForm();

    this._fireCallback(null);
    this.emit('change', { value: null, item: null });
  }

  _fireCallback(item) {
    if (this._onChange) {
      this._onChange(item ? item[this._getValueKey()] : null);
    } else if (this._onSelect) {
      this._onSelect(item);
    }
  }

  _setInitialValue() {
    const initialValue = this._getInitialValue();
    if (!initialValue) return;

    const valueKey = this._getValueKey();
    const labelKey = this._getLabelKey();
    const item = this._options.find(i => String(i[valueKey]) === String(initialValue));
    if (item) {
      this._selectedItem = item;
      const selectedSpan = this.querySelector('.td-dropdown-selected');
      if (selectedSpan) {
        selectedSpan.textContent = item[labelKey];
      }
      // Reflect the resolved initial selection into the form.
      if (this._initialized) this._syncForm();
    }
  }

  // --- Open/Close ---

  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  open() {
    // Close all other dropdowns
    TdDropdown._openDropdowns.forEach(dd => {
      if (dd !== this && dd._isOpen) dd.close();
    });

    const button = this.querySelector('.td-dropdown-button');
    const arrow = this.querySelector('.td-dropdown-arrow');
    if (!button || !this._menuElement) return;

    const rect = button.getBoundingClientRect();
    const buttonWidth = rect.width;
    this._menuElement.style.width = `${buttonWidth}px`;
    this._menuElement.style.minWidth = `${buttonWidth}px`;
    this._menuElement.style.maxWidth = `${buttonWidth}px`;
    this._menuElement.style.left = `${rect.left}px`;
    this._menuElement.classList.remove('hidden');
    this._menuElement.style.visibility = 'hidden';

    // Auto-position: below or above
    const menuHeight = this._menuElement.offsetHeight;
    let top = rect.bottom + 8;
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 8;
    }
    if (top < 0) {
      top = 8;
    }
    this._menuElement.style.top = `${top}px`;
    this._menuElement.style.visibility = '';

    if (arrow) arrow.style.transform = 'rotate(180deg)';
    button.setAttribute('aria-expanded', 'true');
    this._isOpen = true;
    this._highlightedIndex = -1;

    // Focus search input
    const searchInput = this._menuElement.querySelector('.td-dropdown-search');
    if (searchInput && window.innerWidth >= 768) {
      window.setTimeout(() => searchInput.focus(), 100);
    }

    // Add global listeners
    this._addGlobalListeners();
  }

  close() {
    const button = this.querySelector('.td-dropdown-button');
    const arrow = this.querySelector('.td-dropdown-arrow');
    const searchInput = this._menuElement ? this._menuElement.querySelector('.td-dropdown-search') : null;

    if (this._menuElement) this._menuElement.classList.add('hidden');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.9)';
      button.style.borderColor = 'rgba(0,0,0,0.1)';
    }
    this._isOpen = false;
    this._highlightedIndex = -1;

    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }

    // Remove global listeners
    this._removeGlobalListeners();

    // Reset search
    if (searchInput) {
      searchInput.value = '';
      this._filteredData = [...this._options];
      this._renderMenuOptions();
    }
  }

  _addGlobalListeners() {
    document.addEventListener('click', this._boundClickOutside);
    document.addEventListener('keydown', this._boundKeydown);
    window.addEventListener('resize', this._boundOnResize);
    window.addEventListener('scroll', this._boundOnScroll, true);
  }

  _removeGlobalListeners() {
    document.removeEventListener('click', this._boundClickOutside);
    document.removeEventListener('keydown', this._boundKeydown);
    window.removeEventListener('resize', this._boundOnResize);
    window.removeEventListener('scroll', this._boundOnScroll, true);
  }

  // --- Position update (RAF-throttled) ---

  _updatePosition() {
    if (!this._isOpen || !this._menuElement) return;
    const button = this.querySelector('.td-dropdown-button');
    if (!button) return;

    const rect = button.getBoundingClientRect();

    // Close if button has scrolled fully out of viewport
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      this.close();
      return;
    }

    const buttonWidth = rect.width;
    this._menuElement.style.width = `${buttonWidth}px`;
    this._menuElement.style.minWidth = `${buttonWidth}px`;
    this._menuElement.style.maxWidth = `${buttonWidth}px`;
    this._menuElement.style.left = `${rect.left}px`;

    const menuHeight = this._menuElement.offsetHeight;
    let top = rect.bottom + 8;
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 8;
    }
    if (top < 0) {
      top = 8;
    }
    this._menuElement.style.top = `${top}px`;
  }

  // --- Public API ---

  getValue() {
    const vk = this._getValueKey();
    return this._selectedItem ? this._selectedItem[vk] : null;
  }

  setValue(value) {
    if (value === null || value === undefined || value === '') {
      this._selectedItem = null;
      this._pendingValue = null;
      const selectedSpan = this.querySelector('.td-dropdown-selected');
      if (selectedSpan) selectedSpan.textContent = this._getPlaceholder();
      this._renderMenuOptions();
      this._syncForm();
      return;
    }
    const vk = this._getValueKey();
    const lk = this._getLabelKey();
    const item = this._options.find(i => String(i[vk]) === String(value));
    if (item) {
      this._selectedItem = item;
      this._pendingValue = null;
      const selectedSpan = this.querySelector('.td-dropdown-selected');
      if (selectedSpan) selectedSpan.textContent = item[lk];
      this._renderMenuOptions();
      this._syncForm();
    } else {
      // Value not in the current options — drop any stale selection, remember the value,
      // and resolve it once matching options arrive.
      this._pendingValue = String(value);
      this._selectedItem = null;
      const selectedSpan = this.querySelector('.td-dropdown-selected');
      if (selectedSpan) selectedSpan.textContent = this._getPlaceholder();
      this._renderMenuOptions();
      this._syncForm();
    }
  }

  getSelectedItem() {
    return this._selectedItem;
  }

  updateData(newData) {
    this._options = Array.isArray(newData) ? newData : [];
    this._filteredData = [...this._options];
    // Resolve a value set before these options arrived (same as the `options` setter).
    if (this._pendingValue != null) {
      this.setValue(this._pendingValue);
    }
    this._renderMenuOptions();
    if (this._isOpen) this._updatePosition();
  }

  destroy() {
    this._removeGlobalListeners();
    if (this._scrollRafId) {
      cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = null;
    }
    const idx = TdDropdown._openDropdowns.indexOf(this);
    if (idx > -1) TdDropdown._openDropdowns.splice(idx, 1);
    if (this._menuElement && this._menuElement.parentNode) {
      this._menuElement.parentNode.removeChild(this._menuElement);
    }
    this._menuElement = null;
    this.innerHTML = '';
  }
}

if (!customElements.get('td-dropdown')) {
  customElements.define('td-dropdown', TdDropdown);
}
