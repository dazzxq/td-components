import { TdBaseElement } from '../td-base-element.js';

/**
 * Sample component demonstrating TdBaseElement features.
 * Shows attribute sync, event cleanup, emit(), and escapeHtml(). Token-native (`.td-sample` in td.css, button =
 * the `.td-btn` contract).
 *
 * @element td-sample
 * @attr {string} label - Display label text
 * @attr {number} count - Current count value
 * @attr {boolean} disabled - Disables the increment button
 * @fires count-change - When count is incremented, detail: { count: number }
 */
export class TdSample extends TdBaseElement {
  static get observedAttributes() { return ['label', 'count', 'disabled']; }
  static get booleanAttributes() { return ['disabled']; }

  render() {
    const label = this.escapeHtml(this.getAttribute('label') || 'Sample');
    const count = parseInt(this.getAttribute('count') || '0', 10);
    const isDisabled = this.hasAttribute('disabled');

    return `<div class="td-sample">`
      + `<h3 class="td-sample__title">${label}</h3>`
      + `<p class="td-sample__count">Count: ${count}</p>`
      + `<button type="button" class="td-btn td-btn--primary td-btn--sm"${isDisabled ? ' disabled' : ''}>`
      + '<span class="td-btn__label">Increment</span></button>'
      + '</div>';
  }

  afterRender() {
    const btn = this.querySelector('button');
    if (btn) {
      this.listen(btn, 'click', () => {
        if (this.hasAttribute('disabled')) return;
        const newCount = parseInt(this.getAttribute('count') || '0', 10) + 1;
        this.setAttribute('count', String(newCount));
        this.emit('count-change', { count: newCount });
      });
    }
  }
}

if (!customElements.get('td-sample')) {
  customElements.define('td-sample', TdSample);
}
