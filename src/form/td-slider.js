import { TdFormElement } from '../base/td-form-element.js';

/** Max number of step marks rendered (D12): more would flood the DOM and overlap. */
const MAX_MARKS = 50;

/** @returns {number} decimals of a numeric string/number ("0.25" → 2, "1e-3" → 3) */
function decimalsOf(n) {
  const s = String(n);
  const exp = /e-(\d+)$/i.exec(s);
  if (exp) return Number(exp[1]) + ((s.split('e')[0].split('.')[1] || '').length);
  return (s.split('.')[1] || '').length;
}

/**
 * Slider (token-native, 0.8.0 — plan docs/internal/plans/v0.8.0-batch2.md D11/D12/D14/D16). Needs td.css.
 *
 * Structure: a native `<input type="range">` (opacity 0) covers the whole ≥ 24 px `.td-slider__control`, so
 * keyboard, pointer, disabled and form semantics are native; its thumb width equals `--td-slider-thumb` so the
 * pointer ↔ value mapping matches the decorative `.td-slider__track/__fill/__thumb` siblings. The value is
 * drawn from the host custom property `--td-slider-pct` (0…1), updated in place (focus kept).
 *
 * - Exactly ONE `input` and ONE `change` CustomEvent `{ value }` per native event (native ones stopped at the host).
 * - `[data-dragging]` on `.td-slider` while a pointer is down (a styling hook; v0.20.0: the knob keeps its solid look).
 * - Name: `label` (→ `aria-labelledby`) → host `aria-label` → external `<label for="host-id">`.
 *   `aria-valuetext` = the value formatted to the step's decimals.
 * - Error contract (setError / clearError / `error-text`), note appended inside `.td-slider`.
 * - Form-associated (ElementInternals): submits the numeric value, reset, range/step validity, `<fieldset disabled>`.
 *   No `required` (a range always has a value — native `<input type=range>` has no valueMissing either).
 *
 * @element td-slider
 * @attr {number} min - Minimum value (default 0)
 * @attr {number} max - Maximum value (default 100)
 * @attr {number} value - Current value (default: `min`, like the thumb shows)
 * @attr {number} step - Step increment (default 1)
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {string} size - Size preset: sm, md, lg (default md) — width token --td-slider-w (200/300/400 px, max 100%)
 * @attr {string} color - Thumb ring / fill colour, any safe CSS colour (default: --td-slider-color = accent)
 * @attr {string} track-color - Inactive track colour (default: --td-slider-track)
 * @attr {string} label - Optional visible label (names the slider)
 * @attr {boolean} show-label - Show the current value
 * @attr {string} label-position - Value position: top, bottom (default top)
 * @attr {boolean} show-step-labels - Show min/max under the track (ignored with show-step-marks)
 * @attr {boolean} show-step-marks - One mark + label per step (only when ≤ 50 steps)
 * @attr {string} error-text - Error message (error contract)
 * @attr {boolean} disabled - Disable the slider (also via ancestor <fieldset disabled>)
 * @fires input - While the value changes (drag / key), detail: { value: number }
 * @fires change - When the value is committed (release / key), detail: { value: number }
 */
export class TdSlider extends TdFormElement {
  /**
   * Validation texts (Vietnamese); override per site: `TdSlider.messages.rangeUnderflow = 'Minimum is {min}.'`.
   * Placeholders: `{min}` `{max}` `{step}`.
   */
  static messages = {
    rangeUnderflow: 'Giá trị tối thiểu là {min}.',
    rangeOverflow: 'Giá trị tối đa là {max}.',
    stepMismatch: 'Giá trị phải là bội số của {step}.',
  };

  static get observedAttributes() {
    // `required` is meaningless for a range (always has a value) → not observed, no `required` property.
    return [...super.observedAttributes.filter((a) => a !== 'required'), 'min', 'max', 'value', 'step', 'size', 'color', 'track-color', 'label',
      'show-label', 'label-position', 'show-step-labels', 'show-step-marks', 'aria-label', 'error-text'];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes.filter((a) => a !== 'required'), 'show-label', 'show-step-labels', 'show-step-marks'];
  }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @type {boolean} true while a pointer is down on the control */
    this.isDragging = false;
    this._input = null;
    this._root = null;
    this._valueOut = null;
    this._endDrag = this._endDrag.bind(this);
  }

  // --- Helpers ---

  _num(attr, fallback) {
    const n = parseFloat(this.getAttribute(attr));
    return Number.isFinite(n) ? n : fallback;
  }

  _getMin() { return this._num('min', 0); }
  _getMax() { return this._num('max', 100); }
  /** @returns {number} the `value` attribute; none (or not a number) → `min` (the thumb's position) */
  _getValue() { return this._num('value', this._getMin()); }
  _getStep() { const s = this._num('step', 1); return s > 0 ? s : 1; }
  _getSize() { const s = this.getAttribute('size'); return s === 'sm' || s === 'lg' ? s : 'md'; }
  /** @returns {string} the sanitized `color` ('' = token default) */
  _getColor() { return this.safeColor(this.getAttribute('color'), ''); }
  /** @returns {string} the sanitized `track-color` ('' = token default) */
  _getTrackColor() { return this.safeColor(this.getAttribute('track-color'), ''); }
  _getLabel() { return this.getAttribute('label') || ''; }
  _getLabelPosition() { return this.getAttribute('label-position') === 'bottom' ? 'bottom' : 'top'; }

  /** @returns {number} decimals used to format values (step and min decide the grid) */
  _decimals() {
    return Math.min(20, Math.max(decimalsOf(this.getAttribute('step') ?? 1), decimalsOf(this._getMin())));
  }

  /** Format a value to the step's decimals (no `0.30000000000000004`). */
  _format(v) {
    return String(Number(Number(v).toFixed(this._decimals())));
  }

  /** @returns {number} 0…1 position of `v` in [min, max] */
  _fraction(v) {
    const min = this._getMin();
    const max = this._getMax();
    if (!(max > min)) return 0;
    return Math.min(1, Math.max(0, (v - min) / (max - min)));
  }

  /** @returns {number} the value shown (the native, clamped + snapped one once rendered) */
  _shownValue() {
    return this._input ? parseFloat(this._input.value) : this._getValue();
  }

  // --- Rendering ---

  _marksHtml(min, max, step) {
    if (!this.hasAttribute('show-step-marks') || !(max > min)) return '';
    const span = (max - min) / step;
    if (span > MAX_MARKS + 1e-9) {
      console.warn(`[td-slider] show-step-marks ignored: ${span} steps > ${MAX_MARKS}.`);
      return '';
    }
    const count = Math.floor(span + 1e-9);
    let marks = '';
    for (let i = 0; i <= count; i++) {
      const v = min + i * step;
      marks += `<span class="td-slider__mark"><span class="td-slider__mark-label">${this.escapeHtml(this._format(v))}</span></span>`;
    }
    return `<span class="td-slider__marks" aria-hidden="true">${marks}</span>`;
  }

  render() {
    const id = this.id;
    const min = this._getMin();
    const max = this._getMax();
    const step = this._getStep();
    const value = this._getValue();
    const label = this._getLabel();
    const marks = this._marksHtml(min, max, step);
    const e = (s) => this.escapeHtml(s);

    const labelHtml = label
      ? `<span class="td-slider__label" id="${e(id)}-label">${e(label)}</span>`
      : '';
    const valueHtml = this.hasAttribute('show-label')
      ? `<output class="td-slider__value" for="${e(id)}-control" aria-hidden="true">${e(this._format(value))}</output>`
      : '';
    const rangeHtml = this.hasAttribute('show-step-labels') && !marks
      ? `<div class="td-slider__range" aria-hidden="true"><span>${e(this._format(min))}</span><span>${e(this._format(max))}</span></div>`
      : '';
    const top = this._getLabelPosition() === 'top';

    return `<div class="td-slider td-slider--${this._getSize()}">${labelHtml}${top ? valueHtml : ''}<div class="td-slider__control"><input type="range" class="td-slider__input" id="${e(id)}-control" min="${min}" max="${max}" step="${step}" value="${value}"${label ? ` aria-labelledby="${e(id)}-label"` : ''}${this._effectiveDisabled ? ' disabled' : ''}><span class="td-slider__track" aria-hidden="true"><span class="td-slider__fill"></span></span>${marks}<span class="td-slider__thumb" aria-hidden="true"></span></div>${top ? '' : valueHtml}${rangeHtml}</div>`;
  }

  afterRender() {
    this._root = this.querySelector('.td-slider');
    this._input = this.querySelector('.td-slider__input');
    this._valueOut = this.querySelector('.td-slider__value');
    this.isDragging = false;

    const input = this._input;
    if (input) {
      input.disabled = this._effectiveDisabled;
      this.listen(input, 'input', (ev) => this._onNative(ev, 'input'));
      this.listen(input, 'change', (ev) => this._onNative(ev, 'change'));
      this.listen(input, 'pointerdown', () => this._startDrag());
    }

    // Per-mark position (0…1) as a CSSOM custom property — no inline style markup.
    const min = this._getMin();
    const step = this._getStep();
    this.querySelectorAll('.td-slider__mark').forEach((mark, i) => {
      mark.style.setProperty('--td-slider-mark', String(this._fraction(min + i * step)));
    });

    this._applyColors();
    this._applyName();
    this._updateUI();
    this._syncForm();
    this._applyErrorState();
  }

  disconnectedCallback() {
    this._endDrag();
    super.disconnectedCallback();
  }

  /** Native input/change from the range → ONE CustomEvent of the same kind (native stopped here). */
  _onNative(ev, kind) {
    ev.stopPropagation();
    const value = parseFloat(this._input.value);
    this.setAttribute('value', String(value)); // in place (attributeChangedCallback) + form value
    this.emit(kind, { value });
  }

  _startDrag() {
    if (this._effectiveDisabled || !this._root) return;
    this.isDragging = true;
    this._root.setAttribute('data-dragging', '');
    // pointerup can land outside the input (drag past the end) → listen on the document until it ends.
    document.addEventListener('pointerup', this._endDrag, true);
    document.addEventListener('pointercancel', this._endDrag, true);
  }

  _endDrag() {
    document.removeEventListener('pointerup', this._endDrag, true);
    document.removeEventListener('pointercancel', this._endDrag, true);
    this.isDragging = false;
    if (this._root) this._root.removeAttribute('data-dragging');
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'value':
        if (this._input) this._input.value = String(this._getValue());
        this._updateUI();
        this._syncForm();
        return;
      case 'color':
      case 'track-color':
        this._applyColors();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'name':
        this._syncForm();
        return;
      default:
        // error-text (no re-render) and disabled (effective-disabled + re-render) go through the base.
        super.attributeChangedCallback(name, oldVal, newVal);
    }
  }

  /** Value → host `--td-slider-pct`, the value text and `aria-valuetext` (in place, focus kept). */
  _updateUI() {
    const value = this._shownValue();
    const text = this._format(value);
    this._setOwnedStyle('--td-slider-pct', String(this._fraction(value)));
    if (this._valueOut) this._valueOut.textContent = text;
    if (this._input) this._input.setAttribute('aria-valuetext', text);
  }

  /** Per-instance colours as host CSSOM custom properties (safeColor; invalid → token default). */
  _applyColors() {
    // Owned: an invalid/absent colour removes only a value WE set (a site's own inline var survives).
    this._setOwnedStyle('--td-slider-color', this._getColor());
    this._setOwnedStyle('--td-slider-track', this._getTrackColor());
  }

  _applyName() {
    this._applyAccessibleName(this._input, !!this._getLabel());
  }

  /** @private Push the current value into form submission + range/step validation. */
  _syncForm() {
    // Validate/submit the COMPONENT value (host attribute), not the native range input's
    // value — the native <input type=range> clamps/snaps invalid values, which would hide
    // rangeOverflow/Underflow/stepMismatch and submit a sanitized value (ISSUE-1).
    const value = this._getValue();
    this._setFormValue(String(value));

    const min = this._getMin();
    const max = this._getMax();
    const step = this._getStep();
    if (value < min) {
      this._setValidity({ rangeUnderflow: true }, this._msg('rangeUnderflow', { min, max, step }), this._focusTarget());
    } else if (value > max) {
      this._setValidity({ rangeOverflow: true }, this._msg('rangeOverflow', { min, max, step }), this._focusTarget());
    } else if (step > 0 && Math.abs(((value - min) / step) - Math.round((value - min) / step)) > 1e-9) {
      this._setValidity({ stepMismatch: true }, this._msg('stepMismatch', { min, max, step }), this._focusTarget());
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    // Presence-aware: null = no initial `value` attr → reset removes it again and _getValue() resolves to `min`.
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    if (this._input) {
      this._input.value = String(this._getValue());
      this._updateUI();
    }
    this._syncForm();
  }

  /** @protected The error note lives inside the block (D16). */
  _errorHost() {
    return this._root || this.querySelector('.td-slider') || this;
  }

  _focusTarget() {
    return this.querySelector('.td-slider__input');
  }

  // --- Public API ---

  /** @returns {number} the current (native, clamped) value */
  getValue() {
    return this._shownValue();
  }

  /**
   * Set the value, clamped to [min, max] and snapped to the nearest `step` from `min` (like a native range);
   * no event is fired.
   * @param {number} val
   */
  setValue(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    const min = this._getMin();
    const max = Math.max(min, this._getMax());
    const step = this._getStep();
    let v = min + Math.round((Math.max(min, Math.min(max, n)) - min) / step) * step;
    if (v > max + 1e-9) v -= step; // snapping up past max → the last step inside the range
    this.setAttribute('value', this._format(Math.max(min, v)));
  }

  /** @param {boolean} bool */
  setDisabled(bool) {
    if (bool) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }
}

if (!customElements.get('td-slider')) {
  customElements.define('td-slider', TdSlider);
}
