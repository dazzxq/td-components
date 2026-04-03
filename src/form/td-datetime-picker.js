import { TdBaseElement } from '../base/td-base-element.js';
import { TdModal } from '../feedback/td-modal.js';

/**
 * DateTimePicker Web Component
 * Custom datetime picker với wheel scroll cho giờ/phút và input number cho ngày/tháng/năm.
 * Mở trong TdModal khi click, emit change event khi confirm.
 *
 * Format: Display "dd/mm/yyyy - hh:mm" ↔ DB "yyyy-mm-dd hh:mm:ss"
 *
 * Ported from DCMS DateTimePicker.
 *
 * @element td-datetime-picker
 * @attr {string} value - Display format value (dd/mm/yyyy - hh:mm)
 * @attr {string} placeholder - Placeholder text (default: dd/mm/yyyy - hh:mm)
 * @attr {boolean} disabled - Disables interaction
 * @attr {string} label - Label text
 * @fires change - When date confirmed, detail: { value, dbValue }
 */
export class TdDatetimePicker extends TdBaseElement {
  static get observedAttributes() { return ['value', 'placeholder', 'disabled', 'label', 'minute-step']; }
  static get booleanAttributes() { return ['disabled']; }

  static _nextId = 0;

  constructor() {
    super();
    this._uid = TdDatetimePicker._nextId++;
    this._modalId = null;
    this._isOpen = false;

    // Selected values
    this._day = null;
    this._month = null;
    this._year = null;
    this._hour = null;
    this._minute = null;

    // Parse initial value or default to now
    this._initFromValue();
  }

  /** @private */
  _initFromValue() {
    const val = this.getAttribute('value');
    if (val) {
      this._parseDisplayValue(val);
    } else {
      const now = new Date();
      this._day = now.getDate();
      this._month = now.getMonth() + 1;
      this._year = now.getFullYear();
      this._hour = now.getHours();
      this._minute = now.getMinutes();
    }
  }

  /** Parse "dd/mm/yyyy - hh:mm" to internal values */
  _parseDisplayValue(str) {
    if (!str) return;
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{1,2})$/);
    if (m) {
      this._day = parseInt(m[1], 10);
      this._month = parseInt(m[2], 10);
      this._year = parseInt(m[3], 10);
      this._hour = parseInt(m[4], 10);
      this._minute = parseInt(m[5], 10);
    }
  }

  /** Format internal values to "dd/mm/yyyy - hh:mm" */
  _formatDisplay() {
    const d = String(this._day || 1).padStart(2, '0');
    const mo = String(this._month || 1).padStart(2, '0');
    const y = String(this._year || new Date().getFullYear());
    const h = String(this._hour ?? 0).padStart(2, '0');
    const mi = String(this._minute ?? 0).padStart(2, '0');
    return `${d}/${mo}/${y} - ${h}:${mi}`;
  }

  /** Convert display to DB format "yyyy-mm-dd hh:mm:ss" */
  _toDBFormat() {
    const d = String(this._day || 1).padStart(2, '0');
    const mo = String(this._month || 1).padStart(2, '0');
    const y = String(this._year || new Date().getFullYear());
    const h = String(this._hour ?? 0).padStart(2, '0');
    const mi = String(this._minute ?? 0).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:00`;
  }

  /** Get minute step from attribute (default 1) */
  _getMinuteStep() {
    const step = parseInt(this.getAttribute('minute-step'), 10);
    return (step > 0 && step <= 30 && 60 % step === 0) ? step : 1;
  }

  /** Snap minute to nearest step */
  _snapMinute(minute) {
    const step = this._getMinuteStep();
    return Math.round(minute / step) * step % 60;
  }

  /** Validate date */
  _validate() {
    if (!this._day || !this._month || !this._year) {
      return { valid: false, error: 'Vui lòng nhập đầy đủ ngày, tháng, năm' };
    }
    if (this._day < 1 || this._day > 31) return { valid: false, error: 'Ngày phải từ 1 đến 31' };
    if (this._month < 1 || this._month > 12) return { valid: false, error: 'Tháng phải từ 1 đến 12' };
    if (this._year < 2000 || this._year > 2099) return { valid: false, error: 'Năm phải từ 2000 đến 2099' };

    const date = new Date(this._year, this._month - 1, this._day);
    if (date.getDate() !== this._day || date.getMonth() !== this._month - 1) {
      return { valid: false, error: 'Ngày không hợp lệ' };
    }
    return { valid: true };
  }

  // ── Rendering ──

  render() {
    const value = this._formatDisplay();
    const placeholder = this.getAttribute('placeholder') || 'dd/mm/yyyy - hh:mm';
    const label = this.getAttribute('label') || '';
    const isDisabled = this.hasAttribute('disabled');
    const disabledClass = isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

    return `
      ${label ? `<label class="block text-sm font-medium text-gray-700 mb-1">${this.escapeHtml(label)}</label>` : ''}
      <div class="relative ${disabledClass}">
        <input
          type="text"
          class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer bg-white"
          placeholder="${this.escapeHtml(placeholder)}"
          readonly
          value="${this.escapeHtml(value)}"
          ${isDisabled ? 'disabled' : ''}
        />
        <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>
    `;
  }

  afterRender() {
    const input = this.querySelector('input');
    if (input && !this.hasAttribute('disabled')) {
      this.listen(input, 'click', () => this._open());
    }
  }

  // ── Modal picker ──

  _open() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._injectStyles();
    this._renderModal();
  }

  _close() {
    if (!this._isOpen) return;
    if (this._modalId) TdModal.closeById(this._modalId);
    this._modalId = null;
    this._isOpen = false;
  }

  _injectStyles() {
    if (document.getElementById('td-datetime-picker-styles')) return;
    const style = document.createElement('style');
    style.id = 'td-datetime-picker-styles';
    style.textContent = `
      .td-dtp-wheel-container {
        background: linear-gradient(to bottom,
          rgba(248,249,250,0.9) 0%, rgba(248,249,250,0.1) 30%,
          transparent 50%,
          rgba(248,249,250,0.1) 70%, rgba(248,249,250,0.9) 100%);
      }
      .td-dtp-wheel {
        scrollbar-width: none; -ms-overflow-style: none;
        scroll-snap-type: y mandatory;
      }
      .td-dtp-wheel::-webkit-scrollbar { display: none; }
      .td-dtp-wheel-option { scroll-snap-align: center; }
      .td-dtp-wheel-option:hover { color: #666; }
      .td-dtp-wheel-option.selected { font-size: 22px; font-weight: 600; color: #333; transform: scale(1.1); }
      .td-dtp-wheel-container::before {
        content: ''; position: absolute; top: 50%; left: 0; right: 0;
        height: 40px; transform: translateY(-50%);
        border-top: 1px solid #e9ecef; border-bottom: 1px solid #e9ecef;
        background: rgba(59, 130, 246, 0.05); pointer-events: none; z-index: 1;
      }
    `;
    document.head.appendChild(style);
  }

  _renderModal() {
    const uid = this._uid;

    // Date section
    const dateHtml = `
      <div class="mb-5">
        <h6 class="m-0 mb-3 text-sm font-semibold text-gray-600">Chọn ngày:</h6>
        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col">
            <label class="text-xs font-medium text-gray-500 mb-1">Ngày</label>
            <input type="number" id="td-dtp-${uid}-day" min="1" max="31" value="${this._day || 1}"
              class="px-2 py-2 border border-gray-300 rounded text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"/>
          </div>
          <div class="flex flex-col">
            <label class="text-xs font-medium text-gray-500 mb-1">Tháng</label>
            <input type="number" id="td-dtp-${uid}-month" min="1" max="12" value="${this._month || 1}"
              class="px-2 py-2 border border-gray-300 rounded text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"/>
          </div>
          <div class="flex flex-col">
            <label class="text-xs font-medium text-gray-500 mb-1">Năm</label>
            <input type="number" id="td-dtp-${uid}-year" min="2000" max="2099" value="${this._year || new Date().getFullYear()}"
              class="px-2 py-2 border border-gray-300 rounded text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"/>
          </div>
        </div>
        <div id="td-dtp-${uid}-error" class="mt-2 px-2 py-1.5 bg-red-100 border border-red-200 rounded text-xs text-red-800 hidden"></div>
      </div>
    `;

    // Hour wheel (0-23)
    const hourOpts = Array.from({ length: 24 }, (_, i) => {
      const sel = i === this._hour ? ' selected' : '';
      return `<div class="td-dtp-wheel-option flex items-center justify-center w-full h-10 text-lg text-gray-400 cursor-pointer transition-all select-none${sel}" data-value="${i}">${String(i).padStart(2, '0')}</div>`;
    }).join('');

    // Minute wheel with step
    const step = this._getMinuteStep();
    const minuteValues = [];
    for (let i = 0; i < 60; i += step) minuteValues.push(i);
    const snappedMinute = this._snapMinute(this._minute ?? 0);
    const minOpts = minuteValues.map(i => {
      const sel = i === snappedMinute ? ' selected' : '';
      return `<div class="td-dtp-wheel-option flex items-center justify-center w-full h-10 text-lg text-gray-400 cursor-pointer transition-all select-none${sel}" data-value="${i}">${String(i).padStart(2, '0')}</div>`;
    }).join('');

    const timeHtml = `
      <div class="mb-5">
        <h6 class="m-0 mb-3 text-sm font-semibold text-gray-600">Chọn giờ:</h6>
        <div class="flex items-center justify-center gap-5 py-5">
          <div class="td-dtp-wheel-container relative w-20 h-[200px] overflow-hidden rounded-lg">
            <div class="td-dtp-wheel flex flex-col items-center py-20 h-full overflow-y-auto scroll-smooth" id="td-dtp-${uid}-hour" data-type="hour">${hourOpts}</div>
          </div>
          <div class="text-2xl font-semibold text-gray-800 mx-2.5">:</div>
          <div class="td-dtp-wheel-container relative w-20 h-[200px] overflow-hidden rounded-lg">
            <div class="td-dtp-wheel flex flex-col items-center py-20 h-full overflow-y-auto scroll-smooth" id="td-dtp-${uid}-minute" data-type="minute">${minOpts}</div>
          </div>
        </div>
      </div>
    `;

    const previewHtml = `
      <div class="mt-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-center text-sm font-bold text-gray-600">
        <span id="td-dtp-${uid}-preview">${this._formatDisplay()}</span>
      </div>
    `;

    // Footer buttons
    const closeBtn = document.createElement('button');
    closeBtn.className = 'px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200';
    closeBtn.textContent = 'Đóng';
    closeBtn.onclick = () => this._close();

    const nowBtn = document.createElement('button');
    nowBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600';
    nowBtn.textContent = 'Bây giờ';
    nowBtn.onclick = () => this._setNow();

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900';
    confirmBtn.textContent = 'Chọn';
    confirmBtn.onclick = () => this._confirm();

    this._modalId = TdModal.show({
      title: 'Chọn ngày giờ',
      body: `<div class="p-4 max-w-md mx-auto">${dateHtml}${timeHtml}${previewHtml}</div>`,
      size: 'md',
      footer: [closeBtn, nowBtn, confirmBtn],
      showFooter: true,
      onClose: () => { this._isOpen = false; this._modalId = null; },
    });

    // Setup events after DOM ready
    setTimeout(() => this._setupModalEvents(), 100);
  }

  // ── Modal event handlers ──

  _setupModalEvents() {
    const uid = this._uid;
    const dayInput = document.getElementById(`td-dtp-${uid}-day`);
    const monthInput = document.getElementById(`td-dtp-${uid}-month`);
    const yearInput = document.getElementById(`td-dtp-${uid}-year`);

    const update = () => {
      if (dayInput) { dayInput.value = Math.max(1, Math.min(31, parseInt(dayInput.value) || 1)); this._day = parseInt(dayInput.value); }
      if (monthInput) { monthInput.value = Math.max(1, Math.min(12, parseInt(monthInput.value) || 1)); this._month = parseInt(monthInput.value); }
      if (yearInput) { yearInput.value = Math.max(2000, Math.min(2099, parseInt(yearInput.value) || new Date().getFullYear())); this._year = parseInt(yearInput.value); }
      this._updatePreview();
      this._validateAndShowError();
    };

    [dayInput, monthInput, yearInput].forEach(el => {
      if (el) el.addEventListener('input', update);
    });

    // Wheels
    this._initWheel(`td-dtp-${uid}-hour`, 'hour');
    this._initWheel(`td-dtp-${uid}-minute`, 'minute');
  }

  _initWheel(wheelId, type) {
    const wheel = document.getElementById(wheelId);
    if (!wheel) return;

    // Click to select
    wheel.addEventListener('click', (e) => {
      const opt = e.target.closest('.td-dtp-wheel-option');
      if (!opt) return;
      wheel.querySelectorAll('.td-dtp-wheel-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const val = parseInt(opt.dataset.value, 10);
      if (type === 'hour') this._hour = val;
      else this._minute = val;
      this._centerWheel(wheel, val, true);
      this._updatePreview();
    });

    // Scroll → detect closest option (CSS scroll-snap handles the snapping)
    let scrollTimer;
    wheel.addEventListener('scroll', () => {
      if (wheel._programmaticScroll) return; // ignore during programmatic scroll
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this._updateWheelFromScroll(wheel, type);
      }, 80);
    });

    // Center initial value
    const initVal = type === 'hour' ? this._hour : (this._snapMinute(this._minute ?? 0));
    if (initVal !== null) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => this._centerWheel(wheel, initVal));
    }
  }

  _centerWheel(wheel, value, smooth = false) {
    const opt = wheel.querySelector(`[data-value="${value}"]`);
    if (!opt) return;
    const container = wheel.parentElement;
    const scrollTop = opt.offsetTop - container.offsetHeight / 2 + opt.offsetHeight / 2;
    // Lock scroll listener during programmatic scroll to prevent fighting
    wheel._programmaticScroll = true;
    wheel.scrollTo({ top: scrollTop, behavior: smooth ? 'smooth' : 'instant' });
    // Unlock after animation completes
    setTimeout(() => { wheel._programmaticScroll = false; }, smooth ? 400 : 50);
  }

  _updateWheelFromScroll(wheel, type) {
    const container = wheel.parentElement;
    const centerY = wheel.scrollTop + container.offsetHeight / 2;
    let closest = null, closestDist = Infinity;

    wheel.querySelectorAll('.td-dtp-wheel-option').forEach(opt => {
      const dist = Math.abs(opt.offsetTop + opt.offsetHeight / 2 - centerY);
      if (dist < closestDist) { closestDist = dist; closest = opt; }
    });

    if (closest) {
      wheel.querySelectorAll('.td-dtp-wheel-option').forEach(o => o.classList.remove('selected'));
      closest.classList.add('selected');
      const val = parseInt(closest.dataset.value, 10);
      if (type === 'hour') this._hour = val;
      else this._minute = val;
      this._updatePreview();
    }
  }

  _updatePreview() {
    const el = document.getElementById(`td-dtp-${this._uid}-preview`);
    if (el) el.textContent = this._formatDisplay();
  }

  _validateAndShowError() {
    const v = this._validate();
    const errorEl = document.getElementById(`td-dtp-${this._uid}-error`);
    if (!errorEl) return v.valid;
    if (!v.valid) {
      errorEl.textContent = v.error;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.classList.add('hidden');
    }
    return v.valid;
  }

  _setNow() {
    const now = new Date();
    this._day = now.getDate();
    this._month = now.getMonth() + 1;
    this._year = now.getFullYear();
    this._hour = now.getHours();
    this._minute = this._snapMinute(now.getMinutes());

    const uid = this._uid;
    const dayInput = document.getElementById(`td-dtp-${uid}-day`);
    const monthInput = document.getElementById(`td-dtp-${uid}-month`);
    const yearInput = document.getElementById(`td-dtp-${uid}-year`);
    if (dayInput) dayInput.value = this._day;
    if (monthInput) monthInput.value = this._month;
    if (yearInput) yearInput.value = this._year;

    // Update wheels
    const hourWheel = document.getElementById(`td-dtp-${uid}-hour`);
    const minWheel = document.getElementById(`td-dtp-${uid}-minute`);
    if (hourWheel) {
      hourWheel.querySelectorAll('.td-dtp-wheel-option').forEach(o => o.classList.remove('selected'));
      const hOpt = hourWheel.querySelector(`[data-value="${this._hour}"]`);
      if (hOpt) { hOpt.classList.add('selected'); this._centerWheel(hourWheel, this._hour, true); }
    }
    if (minWheel) {
      minWheel.querySelectorAll('.td-dtp-wheel-option').forEach(o => o.classList.remove('selected'));
      const mOpt = minWheel.querySelector(`[data-value="${this._minute}"]`);
      if (mOpt) { mOpt.classList.add('selected'); this._centerWheel(minWheel, this._minute, true); }
    }

    this._updatePreview();
    const errorEl = document.getElementById(`td-dtp-${uid}-error`);
    if (errorEl) errorEl.classList.add('hidden');
  }

  _confirm() {
    if (!this._validateAndShowError()) return;

    const value = this._formatDisplay();
    const dbValue = this._toDBFormat();

    // Update input display
    const input = this.querySelector('input');
    if (input) input.value = value;

    // Update attribute
    this.setAttribute('value', value);

    // Emit change
    this.emit('change', { value, dbValue });

    this._close();
  }

  // ── Public API ──

  /** Get display format value */
  getValue() { return this._formatDisplay(); }

  /** Get DB format value */
  getDBValue() { return this._toDBFormat(); }

  /** Set value from display format */
  setValue(displayValue) {
    this._parseDisplayValue(displayValue);
    const input = this.querySelector('input');
    if (input) input.value = this._formatDisplay();
    this.setAttribute('value', this._formatDisplay());
  }

  /** Set value from DB format */
  setDBValue(dbValue) {
    if (!dbValue) return;
    try {
      const date = new Date(dbValue);
      this._day = date.getDate();
      this._month = date.getMonth() + 1;
      this._year = date.getFullYear();
      this._hour = date.getHours();
      this._minute = date.getMinutes();
      const input = this.querySelector('input');
      if (input) input.value = this._formatDisplay();
      this.setAttribute('value', this._formatDisplay());
    } catch { /* invalid date */ }
  }
}

if (!customElements.get('td-datetime-picker')) {
  customElements.define('td-datetime-picker', TdDatetimePicker);
}
