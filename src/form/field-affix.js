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
 * Codex security r1 SEC-01: NOT on a host carrying `data-td-ssr` — server markup never has slot children (PHP has no rich
 * affix, Q4), so on an SSR host they stay where they are and take part in the hydration gate like any unexpected node
 * (mismatch → safe clean render, which drops them: an injected `<input type=hidden>` / `<button formaction>` never reaches
 * the form). Slots stay supported on hosts without the marker (JS / hand-written markup).
 * @param {HTMLElement} host
 * @returns {{ prefix: Element[], suffix: Element[] }}
 */
export function takeAffixSlots(host) {
  const out = { prefix: [], suffix: [] };
  if (host.hasAttribute('data-td-ssr')) {
    if ([...host.children].some((c) => AFFIX_SIDES.includes(c.getAttribute('slot')))) {
      host._lateSlotWarned = true; // this message replaces the "added later" one of the first render
      console.warn(`<${host.localName}>: [slot="prefix"|"suffix"] children are not supported on a server-rendered host (data-td-ssr) — dropped`);
    }
    return out;
  }
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
    // Codex security r1 SEC-01 (b): a wrapper that is no longer exactly the kit's (an attribute added / changed, a foreign
    // node inside) is dropped; a fresh one gets only the page nodes taken at the first render
    let stale = null;
    if (w && !wrapIntact(w, block, side, nodes)) {
      stale = w;
      w.remove();
      w = null;
    }
    if (!w) {
      w = document.createElement('span');
      w.className = wrapClass(block, side);
      host._affixWrap[side] = w;
    }
    for (const n of nodes) if (!n.parentNode || n.parentNode === stale) w.appendChild(n);
    if (side === 'prefix' ? control.previousSibling !== w : control.nextSibling !== w) {
      if (side === 'prefix') control.before(w);
      else control.after(w);
    }
  }
}

/** @param {string} block @param {string} side @returns {string} the slot wrapper's only attribute (class) */
const wrapClass = (block, side) => `${block}__affix ${block}__affix--${side} ${block}__affix--slot`;

/**
 * Is `w` still exactly the wrapper the kit created: one attribute (its class, unchanged) and only the page's own slot
 * nodes inside?
 * @param {Element} w @param {string} block @param {string} side @param {Node[]} nodes
 */
function wrapIntact(w, block, side, nodes) {
  return w.attributes.length === 1 && w.getAttribute('class') === wrapClass(block, side)
    && [...w.childNodes].every((n) => nodes.includes(n));
}

/**
 * Take the kit's own slot wrappers out of the DOM before the re-connect revalidation (page content, never part of the
 * component's SSR markup); the next bind mounts them again. Codex security r1 SEC-01 (b): only the exact node the kit
 * created, still intact — a mutated / foreign wrapper stays visible to the revalidation (→ safe re-render).
 * @param {HTMLElement & { _affixWrap?: object, _affixSlots?: object }} host
 * @param {'td-field'|'td-number'} block
 */
export function detachAffixSlots(host, block) {
  for (const side of AFFIX_SIDES) {
    const w = host._affixWrap?.[side];
    if (w && wrapIntact(w, block, side, host._affixSlots?.[side] || [])) w.remove();
  }
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
 * Run a full render (`render`) keeping the focus of page content inside a slot (a focused "show password" button whose
 * field re-renders for a label / size change gets its focus back once the wrapper is mounted again).
 * @param {HTMLElement & { _affixWrap?: object }} host
 * @param {() => void} render
 */
export function renderKeepingSlotFocus(host, render) {
  const active = host.ownerDocument.activeElement;
  const inSlot = !!active && Object.values(host._affixWrap || {}).some((w) => w.contains(active));
  render();
  if (inSlot && active.isConnected && host.ownerDocument.activeElement !== active) active.focus({ preventScroll: true });
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
