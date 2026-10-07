import { escapeHtml } from '../utils/escape.js';

/**
 * Prefix / suffix of a text field (v0.55.0, plan docs/internal/plans/v0.55.0-affix-number.md QĐ 2–5, ADR 0028) — shared by
 * <td-input-field> (`td-field` block) and <td-number-input> (`td-number` block). Plain DOM functions, no class (two
 * controls use it — not a TdFormElement concern).
 *
 * - Text (`prefix` / `suffix`) and icon (`prefix-icon` / `suffix-icon`, a registry name) are DECORATIVE: one
 *   `span.{block}__affix.{block}__affix--{side}[aria-hidden="true"]` per side, `[icon][text]` in a prefix and `[text][icon]`
 *   in a suffix (the icon on the outer edge). The unit is read through `aria-describedby` (`{host}-unit`), never twice.
 * - Page Elements: the host's direct `[slot="prefix"]` / `[slot="suffix"]` children are taken out BEFORE the first render
 *   (render replaces innerHTML) and MOVED (same nodes, never cloned, never re-parsed) into
 *   `span.{block}__affix.{block}__affix--{side}.{block}__affix--slot` next to the control after every bind. The kit never
 *   changes their semantics (no aria-hidden). Read on the first render only (Q6): a later [slot] child is not adopted.
 */

export const AFFIX_SIDES = ['prefix', 'suffix'];

/**
 * Take every direct `[slot="prefix"|"suffix"]` child out of `host` (document order kept per side).
 * @param {HTMLElement} host
 * @returns {{ prefix: Element[], suffix: Element[] }}
 */
export function takeAffixSlots(host) {
  const out = { prefix: [], suffix: [] };
  for (const c of [...host.children]) {
    const side = c.getAttribute('slot');
    if (side !== 'prefix' && side !== 'suffix') continue;
    c.remove();
    out[side].push(c);
  }
  return out;
}

/**
 * The trimmed icon name of `{side}-icon` ('' = none). Validity is the registry's business: an unknown name leaves the
 * slot empty (like Td::icon() returning '').
 * @param {Element} host
 * @param {'prefix'|'suffix'} side
 * @returns {string}
 */
export function affixIcon(host, side) {
  return (host.getAttribute(`${side}-icon`) || '').trim();
}

/**
 * Markup of one side's decorative span (escaped; '' when it has neither text nor icon). `hidden` = the side has a slot.
 * @param {'prefix'|'suffix'} side
 * @param {{ text: string, icon: string, slot?: boolean }} part
 * @param {'td-field'|'td-number'} block
 * @returns {string}
 */
export function affixMarkup(side, part, block) {
  const { text, icon, slot } = part;
  if (!text && !icon) return '';
  const svg = icon
    ? `<span class="${block}__affix-icon" data-td-icon="${escapeHtml(icon)}" data-td-icon-class="${block}__affix-svg"></span>`
    : '';
  const inner = side === 'prefix' ? svg + escapeHtml(text) : escapeHtml(text) + svg;
  return `<span class="${block}__affix ${block}__affix--${side}" aria-hidden="true"${slot ? ' hidden' : ''}>${inner}</span>`;
}

/**
 * After every bind: put the slot wrappers (created once, kept on the host) right before (prefix) / after (suffix) the
 * control — the same page nodes. A node the page moved elsewhere meanwhile is left where the page put it.
 * @param {HTMLElement & { _affixSlots?: object, _affixWrap?: object }} host
 * @param {HTMLElement} control
 * @param {'td-field'|'td-number'} block
 */
export function mountAffixSlots(host, control, block) {
  const slots = host._affixSlots;
  if (!slots || !control) return;
  host._affixWrap ||= {};
  for (const side of AFFIX_SIDES) {
    const nodes = slots[side] || [];
    if (!nodes.length) continue;
    let w = host._affixWrap[side];
    if (!w) {
      w = document.createElement('span');
      w.className = `${block}__affix ${block}__affix--${side} ${block}__affix--slot`;
      host._affixWrap[side] = w;
    }
    for (const n of nodes) if (!n.parentNode) w.appendChild(n);
    if (side === 'prefix' ? control.previousSibling !== w : control.nextSibling !== w) {
      if (side === 'prefix') control.before(w);
      else control.after(w);
    }
  }
}

/**
 * Take the slot wrappers out of the DOM (they are page content, never part of the component's SSR markup) — before the
 * re-connect revalidation; the next bind mounts them again.
 * @param {HTMLElement & { _affixWrap?: object }} host
 */
export function detachAffixSlots(host) {
  for (const w of Object.values(host._affixWrap || {})) w.remove();
}

/**
 * Does a press on `target` land on interactive page content of a slot (a button, a link, a field…)? Such a press keeps
 * its default (focus / click) — the box press never steals it for the control.
 * @param {EventTarget|null} target
 * @param {Element} box
 * @param {'td-field'|'td-number'} block
 * @returns {boolean}
 */
export function slotInteractive(target, box, block) {
  const el = /** @type {Element} */ (target);
  const w = el?.closest?.(`.${block}__affix--slot`);
  if (!w || w.parentElement !== box) return false;
  const hit = el.closest('button, a[href], input, select, textarea, label, summary, [tabindex], [contenteditable]:not([contenteditable="false"])');
  return !!hit && w.contains(hit);
}

/**
 * Q6: [slot] children are read on the first render only — warn ONCE when the page added one later (it is not adopted;
 * a render replaces it).
 * @param {HTMLElement & { _lateSlotWarned?: boolean }} host
 */
export function warnLateSlots(host) {
  if (host._lateSlotWarned) return;
  if (![...host.children].some((c) => AFFIX_SIDES.includes(c.getAttribute('slot')))) return;
  host._lateSlotWarned = true;
  console.warn(`<${host.localName}>: [slot="prefix"] / [slot="suffix"] children are read on the first render only — a child added later is not adopted`);
}
