/**
 * Type-ahead helpers shared by td-dropdown, TdMenu and td-chip-input (plan v0.12.0 step 0, D3). Pure functions.
 */

/**
 * Case- and diacritic-insensitive key ("Hà Nội" ~ "ha noi", "Đà" ~ "da").
 * @param {unknown} s
 * @returns {string}
 */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/đ/g, 'd');

/**
 * Next index matching a type-ahead buffer (APG): search starts after the active item for a repeated single character
 * ("aaa" cycles through the "a…" items) or a first keystroke, at the active item for a longer prefix; wraps around.
 * @param {Array<string|null|undefined>} labels item labels in navigation order; null/undefined = not matchable
 * @param {number} activeIndex current active index (-1 = none)
 * @param {string} buffer typed characters so far
 * @returns {number} matching index, or -1
 */
export function nextTypeaheadIndex(labels, activeIndex, buffer) {
  const buf = fold(buffer);
  const n = labels.length;
  if (!buf || !n) return -1;
  const same = [...buf].every((c) => c === buf[0]);
  const prefix = same ? buf[0] : buf;
  const start = activeIndex < 0 ? 0 : activeIndex + (same || buf.length === 1 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const label = labels[i];
    if (label != null && fold(label).startsWith(prefix)) return i;
  }
  return -1;
}
