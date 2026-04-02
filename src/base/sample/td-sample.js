import { TdBaseElement } from '../td-base-element.js';

/**
 * Sample component demonstrating TdBaseElement features.
 * Shows attribute sync, event cleanup, emit(), and escapeHtml().
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

    return `
      <div class="p-4 border rounded-lg shadow-sm">
        <h3 class="text-lg font-bold">${label}</h3>
        <p class="mt-1 text-gray-600">Count: ${count}</p>
        <button
          class="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          ${isDisabled ? 'disabled' : ''}
        >Increment</button>
      </div>
    `;
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
