import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { RATING_LABELS, ratingModel, parseValue, parseMax, parseCount, formatValueAttr } from '../utils/rating-model.js';

const SSR_NAME = 'rating';
const SSR_SCHEMA = 1;
const FILL_VAR = '--_td-rating-fill';

/** @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs] @param {string} [text] */
function el(tag, cls, attrs, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Read-only star rating — v0.50.0 (plan v0.50.0-rating-carousel R1–R13). Token-native: td.css (`components/rating.css`).
 * Light DOM, built with DOM APIs (every text is TEXT — no innerHTML).
 *
 * Markup (= PHP `td_rating()`, SSR contract `rating@1`, adopted IN PLACE when it is exactly what this element builds):
 * [`span.td-rating__value[aria-hidden]` "4,5" when `show-value`] + `span.td-rating__stars[aria-hidden]` > `max` ×
 * `span.td-rating__star[data-fill=0|10|…|100]` > `svg.td-icon.td-rating__off` + `svg.td-icon.td-rating__on` (registry
 * `star`; the "on" layer is clipped to the fill) + `span.td-sr-only` "4,5 trên 5 sao" (the accessible name is real text:
 * read inside a product-card link, copied, translated) + [`span.td-rating__count` "(1.234 đánh giá)"]. No rating
 * (`value` missing / not a plain decimal) → `data-empty` on the host + `span.td-rating__none` "Chưa có đánh giá" — no
 * stars (five empty stars read as "0 stars"). `value="0"` is a real 0.
 *
 * Fill: `data-fill` (10 % steps, the no-JS path) sets `--_td-rating-fill` in CSS; `precision="exact"` refines a partly
 * filled star with CSSOM (`style.setProperty`, never `style="…"`). The label shows the REAL value rounded to one
 * decimal ("4,3 trên 5 sao" while the stars show 4.5). Static, site-wide texts: `TdRating.labels` (R13 — no
 * per-instance labels; markup printed with other texts is re-rendered with these). Never focusable, no events.
 *
 * @element td-rating
 * @attr {string} value - average rating, a plain decimal (`4.5`); clamped to [0, max]; missing / invalid → no rating
 * @attr {number} max - number of stars, integer 1–10 (default 5; invalid → 5 + one warning)
 * @attr {'half'|'exact'} precision - star drawing: nearest half star (default) or the exact fraction
 * @attr {number} count - number of reviews, integer ≥ 0 → "(1.234 đánh giá)"
 * @attr {boolean} show-value - "4,5" before the stars
 * @attr {'s'|'m'|'l'} size - star size (`--td-icon-s/m/l`; default m)
 */
export class TdRating extends TdBaseElement {
  /** Site-wide texts (`{value}` / `{max}` / `{count}` placeholders). Assign before the elements upgrade. */
  static labels = { ...RATING_LABELS };

  static hydratable = true;

  static get observedAttributes() { return ['value', 'max', 'precision', 'count', 'show-value', 'size']; }

  static get booleanAttributes() { return ['show-value']; }

  /** @returns {number|null} the clamped value, or null when there is no rating */
  get value() {
    const v = parseValue(this.getAttribute('value'));
    return v === null ? null : Math.min(v, this.max);
  }

  set value(v) {
    if (v == null || v === '') this.removeAttribute('value');
    else if (typeof v === 'number') {
      const s = formatValueAttr(v);
      if (s === null) this.removeAttribute('value');
      else this.setAttribute('value', s);
    } else this.setAttribute('value', String(v));
  }

  /** @returns {number} */
  get max() { return parseMax(this.getAttribute('max')).max; }

  set max(v) {
    if (v == null || v === '') this.removeAttribute('max');
    else this.setAttribute('max', String(v));
  }

  /** @returns {number|null} */
  get count() {
    const c = parseCount(this.getAttribute('count'));
    return c === null ? null : Number(c);
  }

  set count(v) {
    if (v == null || v === '') this.removeAttribute('count');
    else this.setAttribute('count', String(v));
  }

  /** @private */
  _model() {
    const L = { ...RATING_LABELS, ...TdRating.labels };
    return ratingModel({
      value: this.getAttribute('value'),
      max: this.getAttribute('max'),
      precision: this.getAttribute('precision'),
      count: this.getAttribute('count'),
    }, { value: String(L.value), count: String(L.count), none: String(L.none) });
  }

  /** @private The children for a model (the contract — PHP prints exactly this). */
  _build(m) {
    if (m.empty) return [el('span', 'td-rating__none', null, m.noneText)];
    const out = [];
    if (this.hasAttribute('show-value')) out.push(el('span', 'td-rating__value', { 'aria-hidden': 'true' }, m.valueText));
    const stars = el('span', 'td-rating__stars', { 'aria-hidden': 'true' });
    for (const s of m.stars) {
      const star = el('span', 'td-rating__star', { 'data-fill': String(s.step) });
      const off = tdIcon('star', { size: 'm', class: 'td-rating__off' });
      const on = tdIcon('star', { size: 'm', class: 'td-rating__on' });
      if (off && on) star.append(off, on);
      stars.appendChild(star);
    }
    out.push(stars, el('span', 'td-sr-only', null, m.label));
    if (m.countText) out.push(el('span', 'td-rating__count', null, m.countText));
    return out;
  }

  /** @private The current children are exactly what `_build(m)` makes (no stray text / element / attribute). */
  _matches(m) {
    const want = this._build(m);
    const have = this.childNodes;
    if (have.length !== want.length) return false;
    return want.every((n, i) => n.isEqualNode(have[i]));
  }

  /** @private */
  _syncHost(m) {
    if (this.hasAttribute('data-empty') !== m.empty) this.toggleAttribute('data-empty', m.empty);
    if (m.maxInvalid && !this._warnedMax) {
      this._warnedMax = true;
      console.warn('td-rating: max must be an integer 1–10 — 5 used.');
    }
  }

  _doRender() {
    if (this._suppressRender) return;
    const m = this._model();
    this.replaceChildren(...this._build(m));
    this._syncHost(m);
    this._bindStep();
  }

  /** R5: `precision="exact"` refines each partly filled star through CSSOM; any other star uses its data-fill rule. */
  _applyStyles() {
    const m = this._model();
    const stars = this.querySelectorAll(':scope > .td-rating__stars > .td-rating__star');
    stars.forEach((star, i) => {
      const exact = m.stars[i]?.exact;
      if (exact) star.style.setProperty(FILL_VAR, exact);
      else if (star.style.getPropertyValue(FILL_VAR)) star.style.removeProperty(FILL_VAR);
    });
  }

  // --- SSR (ADR 0012, contract rating@1, plan R12) ---

  /** Marker `rating@1` + children equal to what this element builds from its attributes (labels included) → adopt. */
  canHydrate() {
    return this._ssrMatches(SSR_NAME, SSR_SCHEMA) && this._matches(this._model());
  }

  hydrateExisting() {
    this._syncHost(this._model());
  }

  /** Re-connect: keep the nodes while they still match; anything else renders again (no state). */
  canRebind() { return this._matches(this._model()); }
}

if (!customElements.get('td-rating')) {
  customElements.define('td-rating', TdRating);
}
