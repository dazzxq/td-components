/**
 * <td-icon name="close" size="m|s|l|24" label=""> — optional light-DOM façade over tdIcon().
 * Importing THIS module defines the element (the factory module stays side-effect free).
 * If SSR already rendered the canonical <svg class="td-icon" data-icon="…"> child, it is kept.
 */
import { tdIcon } from './td-icon.js';

export class TdIconElement extends HTMLElement {
  static get observedAttributes() { return ['name', 'size', 'label']; }

  connectedCallback() { this._render(); }

  attributeChangedCallback(_n, oldVal, newVal) {
    if (oldVal !== newVal && this.isConnected) this._render(true);
  }

  _render(force = false) {
    const name = this.getAttribute('name') || '';
    const existing = this.querySelector(':scope > svg.td-icon');
    if (!force && existing && existing.getAttribute('data-icon') === name) return; // SSR child kept
    const rawSize = this.getAttribute('size') || 'm';
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : rawSize;
    const svg = tdIcon(name, { size, label: this.getAttribute('label') || '' });
    this.replaceChildren(...(svg ? [svg] : []));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('td-icon')) {
  customElements.define('td-icon', TdIconElement);
}
