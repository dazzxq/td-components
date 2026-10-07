/**
 * v0.54.1 (plan v0.54.1-preupgrade-props): properties assigned while an element is NOT yet upgraded — a clone of
 * `<template>` content (inert document), `document.createElement` before `customElements.define`, a node of a DOMParser
 * document — are own data properties of a plain HTMLElement. After the upgrade they SHADOW the class accessors, so the
 * setter never runs. These helpers find them automatically (no per-component list to drift) and hand them back.
 */

/**
 * Does the element's class define a setter for `name` (prototype chain below HTMLElement — native setters already work
 * before the upgrade)? The nearest descriptor decides: a getter-only override means "no setter".
 * @param {object} el
 * @param {string} name
 * @returns {boolean}
 */
export function hasClassSetter(el, name) {
  const stop = typeof HTMLElement === 'undefined' ? Object.prototype : HTMLElement.prototype;
  for (let p = Object.getPrototypeOf(el); p && p !== stop && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d) return typeof d.set === 'function';
  }
  return false;
}

/**
 * Take the pre-upgrade properties: every own DATA property whose name has a class setter (or is listed in `extra`,
 * e.g. the attribute-backed names the base installs per instance). Names starting with `_` are internal and skipped.
 * The own properties are deleted; the result keeps the page's assignment order (own-property creation order).
 * @param {object} el
 * @param {{ has(name: string): boolean }|null} [extra]
 * @returns {Array<[string, unknown]>}
 */
export function takePreUpgradeProps(el, extra = null) {
  const out = [];
  for (const name of Object.keys(el)) {
    if (name.startsWith('_')) continue;
    const d = Object.getOwnPropertyDescriptor(el, name);
    if (!d || !('value' in d)) continue; // an accessor the base installed on this instance
    if (!(extra?.has(name) || hasClassSetter(el, name))) continue;
    out.push([name, d.value]);
    delete el[name];
  }
  return out;
}

/**
 * Re-assign the pre-upgrade properties through the class setters (for elements that do not extend TdBaseElement).
 * @param {object} el
 * @returns {string[]} the replayed names
 */
export function replayPreUpgradeProps(el) {
  const early = takePreUpgradeProps(el);
  for (const [name, value] of early) el[name] = value;
  return early.map(([name]) => name);
}
