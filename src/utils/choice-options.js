/**
 * v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md QĐ 8, 9, 12) — the ONE gate for the options of
 * `<td-choice-group>`: the `options` property AND the data read back from server markup on hydrate go through
 * `normalizeOptions()`, so a colour reaching the SVG `fill` sink and a URL reaching `<img src>` are always re-checked.
 * Pure (no DOM): the colour / URL gates are passed in. Internal module (no package subpath).
 *
 * @module utils/choice-options
 */

/**
 * @typedef {Object} ChoiceOption
 * @property {string} value - unique in the group (a finite number is turned into its String())
 * @property {string} label - accessible name (text)
 * @property {string} hint - secondary line ('' = none)
 * @property {string} swatch - a safe colour ('' = none)
 * @property {string} image - a safe, normalised image URL ('' = none); wins over `swatch` when set
 * @property {boolean} disabled - not selectable (a combination that does not exist)
 * @property {boolean} unavailable - selectable, struck through + a note (out of stock)
 * @property {string} unavailableLabel - the note ('' = the component's default message)
 * @property {number} index - position in the normalised list
 */

const describe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * @param {unknown} raw the caller's list
 * @param {{ safeColor: (v: unknown, fallback?: string) => string, safeMediaUrl: (v: unknown) => string }} gates
 * @returns {{ options: ReadonlyArray<Readonly<ChoiceOption>>, warnings: string[] }} warnings name the position, the key
 *   and the type — never the raw value
 */
export function normalizeOptions(raw, gates) {
  if (!gates || typeof gates.safeColor !== 'function' || typeof gates.safeMediaUrl !== 'function') {
    throw new TypeError('normalizeOptions: the safeColor / safeMediaUrl gates are required');
  }
  /** @type {string[]} */
  const warnings = [];
  /** @type {Readonly<ChoiceOption>[]} */
  const options = [];
  if (raw == null) return { options: Object.freeze(options), warnings };
  if (!Array.isArray(raw)) {
    warnings.push(`options must be an array (got ${describe(raw)}) — no option is shown.`);
    return { options: Object.freeze(options), warnings };
  }
  const seen = new Set();
  raw.forEach((o, i) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      warnings.push(`option #${i} is not an object (${describe(o)}) — dropped.`);
      return;
    }
    let value = null;
    if (typeof o.value === 'string' && o.value !== '') value = o.value;
    else if (typeof o.value === 'number' && Number.isFinite(o.value)) value = String(o.value);
    if (value == null) {
      warnings.push(`option #${i}: value must be a non-empty string or a finite number (got ${describe(o.value)}) — dropped.`);
      return;
    }
    if (typeof o.label !== 'string' || !o.label.trim()) {
      warnings.push(`option #${i}: label must be a non-empty string (got ${describe(o.label)}) — dropped.`);
      return;
    }
    if (seen.has(value)) {
      warnings.push(`option #${i}: duplicate value (${value.length} chars) — dropped.`);
      return;
    }
    seen.add(value);
    const text = (key) => {
      const v = o[key];
      if (v == null || v === '') return '';
      if (typeof v === 'string') return v;
      warnings.push(`option #${i}: ${key} must be a string (got ${describe(v)}) — ignored.`);
      return '';
    };
    let swatch = '';
    if (o.swatch != null && o.swatch !== '') {
      swatch = gates.safeColor(o.swatch, '');
      if (!swatch) warnings.push(`option #${i}: swatch is not a safe colour (${describe(o.swatch)}) — no colour.`);
    }
    let image = '';
    if (o.image != null && o.image !== '') {
      image = gates.safeMediaUrl(o.image);
      if (!image) warnings.push(`option #${i}: image URL refused (${describe(o.image)}; https:, http: on an http: page, relative) — not shown.`);
    }
    options.push(Object.freeze({
      value,
      label: o.label,
      hint: text('hint'),
      swatch,
      image,
      disabled: o.disabled === true,
      unavailable: o.unavailable === true,
      unavailableLabel: text('unavailableLabel'),
      index: options.length,
    }));
  });
  return { options: Object.freeze(options), warnings };
}

/**
 * Same `value` list in the same order? (→ the component patches the rendered options in place.)
 * @param {ReadonlyArray<{ value: string }>} a
 * @param {ReadonlyArray<{ value: string }>} b
 */
export function sameValueList(a, b) {
  return a.length === b.length && a.every((o, i) => o.value === b[i].value);
}
