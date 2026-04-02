import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Slider component with glass styling, step marks, touch support.
 * Port of dcms-slider.js to Web Component extending TdBaseElement.
 *
 * @element td-slider
 * @attr {number} min - Minimum value (default 0)
 * @attr {number} max - Maximum value (default 100)
 * @attr {number} value - Current value (default 0)
 * @attr {number} step - Step increment (default 1)
 * @attr {string} size - Size preset: sm, md, lg (default md)
 * @attr {string} color - Thumb/active track color (default #3b82f6)
 * @attr {string} track-color - Inactive track color (default #e5e7eb)
 * @attr {string} label - Optional main label text
 * @attr {boolean} show-label - Show current value label (default false)
 * @attr {string} label-position - Value label position: top, bottom (default top)
 * @attr {boolean} show-step-labels - Show min/max labels
 * @attr {boolean} show-step-marks - Show step marks on track
 * @attr {boolean} disabled - Disable the slider
 * @fires input - During drag, detail: { value: number }
 * @fires change - After release, detail: { value: number }
 */
export class TdSlider extends TdBaseElement {
  static get observedAttributes() {
    return ['min', 'max', 'value', 'step', 'size', 'color', 'track-color', 'label', 'show-label', 'label-position', 'show-step-labels', 'show-step-marks', 'disabled'];
  }

  static get booleanAttributes() {
    return ['show-label', 'show-step-labels', 'show-step-marks', 'disabled'];
  }

  constructor() {
    super();
    this.isDragging = false;
    this._input = null;
    this._thumb = null;
    this._trackActive = null;
    this._valueLabel = null;
  }

  // --- Helpers ---

  _getMin() { return parseFloat(this.getAttribute('min') || '0'); }
  _getMax() { return parseFloat(this.getAttribute('max') || '100'); }
  _getValue() { return parseFloat(this.getAttribute('value') || '0'); }
  _getStep() { return parseFloat(this.getAttribute('step') || '1'); }
  _getSize() { return this.getAttribute('size') || 'md'; }
  _getColor() { return this.getAttribute('color') || '#3b82f6'; }
  _getTrackColor() { return this.getAttribute('track-color') || '#e5e7eb'; }
  _getLabel() { return this.getAttribute('label') || ''; }
  _getLabelPosition() { return this.getAttribute('label-position') || 'top'; }

  _getSizePreset() {
    const presets = {
      sm: { width: '200px', trackH: 4, thumb: 14 },
      md: { width: '300px', trackH: 6, thumb: 18 },
      lg: { width: '400px', trackH: 8, thumb: 22 },
    };
    return presets[this._getSize()] || presets.md;
  }

  _getPercentage(val) {
    const min = this._getMin();
    const max = this._getMax();
    const v = val !== undefined ? val : this._getValue();
    if (max === min) return 0;
    return ((v - min) / (max - min)) * 100;
  }

  // --- Rendering ---

  render() {
    const min = this._getMin();
    const max = this._getMax();
    const value = this._getValue();
    const step = this._getStep();
    const color = this._getColor();
    const label = this._getLabel();
    const showLabel = this.hasAttribute('show-label');
    const labelPosition = this._getLabelPosition();
    const showStepLabels = this.hasAttribute('show-step-labels');
    const showStepMarks = this.hasAttribute('show-step-marks');
    const isDisabled = this.hasAttribute('disabled');
    const preset = this._getSizePreset();
    const thumbSize = preset.thumb;
    const trackHeight = preset.trackH;
    const percentage = this._getPercentage(value);

    // Escaped label
    const escapedLabel = label ? this.escapeHtml(label) : '';

    // Main label
    const mainLabelHtml = escapedLabel
      ? `<div class="td-slider-main-label text-sm font-medium text-gray-700 mb-2">${escapedLabel}</div>`
      : '';

    // Value label
    const valueLabelHtml = showLabel
      ? `<div class="td-slider-value-label text-center text-sm font-semibold mb-2" style="color: ${color};">${value}</div>`
      : '';

    // Step marks
    let stepMarksHtml = '';
    if (showStepMarks) {
      const stepCount = Math.floor((max - min) / step) + 1;
      let marks = '';
      for (let i = 0; i < stepCount; i++) {
        const stepValue = min + (i * step);
        if (stepValue > max + 0.0001) break;
        const pct = ((stepValue - min) / (max - min)) * 100;
        marks += `
          <div class="td-slider-step-mark absolute" style="left: ${pct}%; top: 50%; transform: translate(-50%, -50%); width: 2px; height: ${Math.max(8, trackHeight + 2)}px; background-color: rgba(0,0,0,0.15); border-radius: 1px; z-index: 1;" title="${stepValue}">
            <div class="td-slider-step-mark-label absolute top-full mt-1 left-1/2 -translate-x-1/2 text-gray-500 whitespace-nowrap" style="font-size: 10px; line-height: 1; font-weight: 500;">${stepValue}</div>
          </div>`;
      }
      stepMarksHtml = `<div class="td-slider-step-marks absolute inset-0 pointer-events-none">${marks}</div>`;
    }

    // Step labels (min/max) — only when show-step-labels and NOT show-step-marks
    let stepLabelsHtml = '';
    if (showStepLabels && !showStepMarks) {
      stepLabelsHtml = `
        <div class="td-slider-step-labels flex justify-between text-xs text-gray-500 mt-1">
          <span>${min}</span>
          <span>${max}</span>
        </div>`;
    }

    const paddingBottom = showStepMarks ? (thumbSize / 2 + 24) : (thumbSize / 2);

    return `
      <div class="td-slider-container" style="width: ${preset.width};">
        ${mainLabelHtml}
        ${showLabel && labelPosition === 'top' ? valueLabelHtml : ''}
        <div class="td-slider-wrap relative" style="padding-top: ${thumbSize / 2}px; padding-bottom: ${paddingBottom}px;${showStepMarks ? ' margin-bottom: 32px;' : ''}">
          <div class="td-slider-track-container relative" style="height: ${trackHeight}px;">
            <div class="td-slider-track-bg absolute inset-0 rounded-full" style="background-color: rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);"></div>
            <div class="td-slider-track-active absolute left-0 top-0 bottom-0 rounded-full" style="background: linear-gradient(180deg, ${color}f2 0%, ${color} 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.25); width: ${percentage}%;"></div>
            ${stepMarksHtml}
            <div class="td-slider-thumb absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none" style="width: ${thumbSize}px; height: ${thumbSize}px; background: linear-gradient(180deg, ${color}f2 0%, ${color} 100%); left: calc(${percentage}% - ${thumbSize / 2}px); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 4px 12px ${color}40, inset 0 1px 0 rgba(255,255,255,0.3); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94); z-index: 10;${isDisabled ? ' opacity: 0.5;' : ''}"></div>
            <input type="range" class="td-slider-input absolute inset-0 w-full opacity-0 cursor-pointer" min="${min}" max="${max}" step="${step}" value="${value}" ${isDisabled ? 'disabled style="cursor: not-allowed;"' : ''} role="slider" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}"${escapedLabel ? ` aria-label="${escapedLabel}"` : ''}>
          </div>
        </div>
        ${showLabel && labelPosition === 'bottom' ? valueLabelHtml : ''}
        ${stepLabelsHtml}
      </div>
    `;
  }

  afterRender() {
    this._input = this.querySelector('.td-slider-input');
    this._thumb = this.querySelector('.td-slider-thumb');
    this._trackActive = this.querySelector('.td-slider-track-active');
    this._valueLabel = this.querySelector('.td-slider-value-label');

    if (!this._input) return;

    // Input event (during drag) — instant response
    this.listen(this._input, 'input', (e) => {
      const value = parseFloat(e.target.value);
      this._updateUI(true);
      this.emit('input', { value });
    });

    // Change event (after release)
    this.listen(this._input, 'change', (e) => {
      const value = parseFloat(e.target.value);
      this._updateUI(false);
      this.emit('change', { value });
    });

    // Mousedown — start dragging
    this.listen(this._input, 'mousedown', () => {
      if (!this.hasAttribute('disabled')) {
        this.isDragging = true;
        this._thumb.style.transition = 'none';
        this._trackActive.style.transition = 'none';
        const color = this._getColor();
        this._thumb.style.boxShadow = `0 2px 8px rgba(0,0,0,0.15), 0 0 0 4px ${color}30, 0 4px 16px ${color}40, inset 0 1px 0 rgba(255,255,255,0.3)`;
      }
    });

    // Mouseup — stop dragging
    this.listen(this._input, 'mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this._thumb.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this._trackActive.style.transition = '';
        const color = this._getColor();
        this._thumb.style.boxShadow = `0 2px 8px rgba(0,0,0,0.15), 0 4px 12px ${color}40, inset 0 1px 0 rgba(255,255,255,0.3)`;
      }
    });

    // Touch events
    this.listen(this._input, 'touchstart', () => {
      if (!this.hasAttribute('disabled')) {
        this.isDragging = true;
        this._thumb.style.transition = 'none';
        this._trackActive.style.transition = 'none';
        const color = this._getColor();
        this._thumb.style.boxShadow = `0 2px 8px rgba(0,0,0,0.15), 0 0 0 4px ${color}30, 0 4px 16px ${color}40, inset 0 1px 0 rgba(255,255,255,0.3)`;
      }
    });

    this.listen(this._input, 'touchend', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this._thumb.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        this._trackActive.style.transition = '';
        const color = this._getColor();
        this._thumb.style.boxShadow = `0 2px 8px rgba(0,0,0,0.15), 0 4px 12px ${color}40, inset 0 1px 0 rgba(255,255,255,0.3)`;
      }
    });

    // Hover effects (not during drag)
    this.listen(this._input, 'mouseenter', () => {
      if (!this.hasAttribute('disabled') && !this.isDragging) {
        this._thumb.style.transform = 'translateY(-50%) scale(1.15)';
      }
    });

    this.listen(this._input, 'mouseleave', () => {
      if (!this.isDragging) {
        this._thumb.style.transform = 'translateY(-50%) scale(1)';
      }
    });
  }

  // Override attributeChangedCallback to avoid full re-render during drag
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;

    // For value changes during interaction, just update UI
    if (name === 'value' && this._input) {
      this._input.value = newVal;
      this._updateUI(this.isDragging);
      return;
    }

    // For other attribute changes, full re-render
    this._doRender();
  }

  _updateUI(isDragging = false) {
    if (!this._input || !this._thumb || !this._trackActive) return;

    const value = parseFloat(this._input.value);
    const percentage = this._getPercentage(value);
    const thumbSize = this._thumb.offsetWidth || this._getSizePreset().thumb;

    if (isDragging) {
      this._trackActive.style.transition = 'none';
      this._thumb.style.transition = 'none';
    }

    this._trackActive.style.width = percentage + '%';
    this._thumb.style.left = `calc(${percentage}% - ${thumbSize / 2}px)`;
    this._input.setAttribute('aria-valuenow', String(value));

    if (this._valueLabel) {
      this._valueLabel.textContent = value;
    }
  }

  // --- Public API ---

  getValue() {
    return this._input ? parseFloat(this._input.value) : this._getValue();
  }

  setValue(val) {
    const min = this._getMin();
    const max = this._getMax();
    const clamped = Math.max(min, Math.min(max, val));
    if (this._input) {
      this._input.value = clamped;
      this._updateUI(false);
    }
    // Update attribute silently
    this.setAttribute('value', String(clamped));
  }

  setDisabled(bool) {
    if (bool) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }
}

if (!customElements.get('td-slider')) {
  customElements.define('td-slider', TdSlider);
}
