/**
 * <td-icon name="close" size="m|s|l|24" label="" variant="outline|filled"> — optional light-DOM façade over tdIcon().
 * Importing THIS module defines the element (the factory module stays side-effect free).
 * If SSR already rendered the canonical <svg class="td-icon" data-icon="…"> child, it is kept.
 */
import { hasIcon, tdIcon } from './td-icon.js';

export class TdIconElement extends HTMLElement {
  static get observedAttributes() { return ['name', 'size', 'label', 'variant']; }

  connectedCallback() { this._render(); }

  attributeChangedCallback(_n, oldVal, newVal) {
    if (oldVal !== newVal && this.isConnected) this._render(true);
  }

  _render(force = false) {
    const name = this.getAttribute('name') || '';
    const variant = this.getAttribute('variant') || 'outline';
    const rawSize = this.getAttribute('size') || 'm';
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : rawSize;
    const existing = this.querySelector(':scope > svg.td-icon');
    // SSR child kept when it already shows the icon this element resolves to (v0.104.0: after the variant)
    if (!force && existing) {
      const want = variant === 'filled' && hasIcon(`${name}-filled`) ? `${name}-filled` : name;
      if (existing.getAttribute('data-icon') === want) return;
    }
    const svg = tdIcon(name, { size, label: this.getAttribute('label') || '', variant });
    this.replaceChildren(...(svg ? [svg] : []));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('td-icon')) {
  customElements.define('td-icon', TdIconElement);
}
