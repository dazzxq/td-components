/**
 * <td-media-picker> + TdMediaPicker.open() — v0.32.0 (plan v0.32.0-media-picker). SKELETON: the static API is final;
 * the element is being implemented (lane B / C).
 *
 * @module feedback/td-media-picker
 */
import { DefaultsRegistry, resolveOptions, cancelledOutcome } from '../utils/media-picker-core.js';

const registry = new DefaultsRegistry();

export class TdMediaPicker extends HTMLElement {
  /** Default texts (Vietnamese); override per site. */
  static labels = {};

  /**
   * Module-level defaults (replaces the whole object each call).
   * @param {object} defaults
   */
  static configureDefaults(defaults) { registry.configure(defaults); }

  /** @returns {object} a shallow copy of the configured defaults */
  static get defaults() { return registry.get(); }

  /**
   * @param {object} options
   * @returns {Promise<import('../utils/media-picker-core.js').PickerOutcome>}
   */
  static open(options) {
    resolveOptions(registry.get(), options);
    return Promise.resolve(cancelledOutcome('programmatic'));
  }
}

if (!customElements.get('td-media-picker')) customElements.define('td-media-picker', TdMediaPicker);
