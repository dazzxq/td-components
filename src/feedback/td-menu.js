/**
 * TdMenu — action menu (WAI-ARIA APG "Menu Button" + "Menu"). Static helper, no custom element (plan v0.12.0 D1).
 * Token-native: needs td.css (src/styles/components/menu.css). No side effects on import.
 *
 *   import { TdMenu } from '@dazzxq/td-components/menu';
 *   const handle = TdMenu.open(anchor, items | () => items, { align: 'end', side: 'bottom', label, focus, onClose });
 *   TdMenu.close();  TdMenu.isOpen(anchor?);
 *   const unbind = TdMenu.bind(button, items | () => items, opts);   // aria + click toggle + ArrowDown/ArrowUp open
 *   const btn = TdMenu.button({ icon: 'more', label: '', ariaLabel, items | getItems, ...opts }); // bound .td-menu-btn
 *   TdMenu.labels.trigger = 'Options';                                  // site override (Vietnamese defaults)
 *
 * Option registry (v0.14.0 G9 — core + hooks: modules/sites add options without editing core):
 *   const undefine = TdMenu.define('post-actions', items | (ctx) => items);  // base list (redefine replaces it)
 *   const unregister = TdMenu.register('post-actions', item | item[], { order, group }); // add options (before or
 *                                                                        // after define)
 *   TdMenu.open(anchor, 'post-actions', { ctx: { postId: 7 } });          // a string resolves the registry
 *   const unbindAll = TdMenu.bindAll(root = document);                  // declarative <button data-td-menu="post-actions"
 *                                                                        //   data-td-menu-post-id="7"> (delegation)
 *   - `order` (number): base items default to index × 10, registered items to opts.order ?? 1000 (appended); ties
 *     keep definition/registration order. `when(ctx) → boolean` hides an item when false (a throwing `when` hides it
 *     + console.warn) — honoured for any item list. A registration `group` puts a separator between groups (base
 *     items and group-less registrations share the default group); separators are then collapsed as usual.
 *   - ctx = { ...opts.ctx, ...data-td-menu-* of the anchor (camelCased, strings; `data-td-menu` itself is the name),
 *     anchor, name } — handed to `(ctx) => items`, `when(ctx)` and onSelect({ ...ctx, item, checked }).
 *   - Unknown name (nothing defined or registered) → console.warn + open() returns null.
 *
 * Items (D6): { label, onSelect (alias onClick), href, newTab, icon (registry name), iconNode (trusted SVGElement, cloned),
 *   hint (any item), danger, disabled, type: 'item'|'radio'|'checkbox', checked, group (radio group key), id }
 *   | { separator: true }. `checked` without `type` → radio (dwp compat). Labels/hints are TEXT (textContent only).
 *   `href`: http/https or relative; anything else (mailto:, tel:, javascript:, data:, unparsable) → the item is
 *   rendered as a disabled button + console.warn (use onSelect for mail/phone actions). v0.17.0 E5a: `download:
 *   true | 'file-name'` on an href item → `<a download>` (the name is sanitised: / \ : * ? " < > | and control
 *   characters dropped, length capped; true or an empty result → bare `download`, the browser names the file).
 *   open/bind option `isAllowedUrl(url) → boolean` REPLACES the default href filter for that menu (the caller owns
 *   the policy — e.g. the lightbox passes its own so a site-allowed `blob:` works); a throwing policy blocks the
 *   URL, and `javascript:` is always blocked. Checkable items are plain
 *   buttons with role menuitemcheckbox/menuitemradio + aria-checked; caller items are NEVER mutated — the new state
 *   arrives as onSelect(ctx) → ctx.checked (update your model to persist it across opens).
 *
 * DOM contract (created on open, removed on close — one menu at a time; {m} = td-menu-{n}):
 *   <div class="td-menu td-glass-surface td-glass-surface--strong" id="{m}" role="menu"
 *        aria-labelledby="{trigger id}" | aria-label="{opts.label}" data-state="open"
 *        data-placement="bottom|top" data-align="start|center|end">
 *     <button type="button" class="td-menu__item[ td-menu__item--danger]" role="menuitem|menuitemradio|menuitemcheckbox"
 *             tabindex="-1" [aria-checked] [aria-disabled="true"] [aria-labelledby="{m}-label-{i}"
 *             aria-describedby="{m}-hint-{i}"] [data-item="{id}"]>
 *       <span class="td-menu__label" [id="{m}-label-{i}"]>{label}</span>
 *       [<span class="td-menu__icon" [data-td-icon="{icon}"] aria-hidden="true">…</span>]
 *       [<span class="td-menu__check" data-td-icon="check" aria-hidden="true">…</span>]   (checkable items)
 *       [<span class="td-menu__hint" id="{m}-hint-{i}">{hint}</span>]
 *     </button>
 *     <a class="td-menu__item" role="menuitem" tabindex="-1" href="…" [target="_blank" rel="noopener noreferrer"]
 *        [download="{file name}"]>…</a>
 *     <div class="td-menu__separator" role="separator"></div>
 *   </div>
 *
 * Behaviour:
 * - Trigger: aria-haspopup="menu" (set when missing), aria-expanded, aria-controls (while open); an id is assigned
 *   (td-menu-trigger-{n}) when missing so the menu can be aria-labelledby it.
 * - Layer: floating keyboard boundary at LAYERS.popover (usable over a TdModal / the lightbox). Escape → close +
 *   focus the trigger (consumed). Tab / Shift+Tab (D4) → close and PASS: the trigger becomes the starting point of the
 *   native Tab (or of a lower modal's focus trap), so focus lands on the element after / before the trigger — never
 *   back on the trigger itself.
 * - Keys in the menu (D2, roving real focus): ArrowDown/ArrowUp (wrap), Home/End, type-ahead (diacritic-insensitive,
 *   utils/typeahead.js), Enter/Space activate. aria-disabled items are focusable but inert (APG).
 * - Selection: item/radio → close, focus the trigger, then onSelect(ctx) (errors logged; a promise is not awaited);
 *   checkbox → toggles in place, the menu stays open. Links navigate natively and close the menu. v0.39.0: a
 *   checkbox item's onSelect ctx also has `setDisabled(id, disabled, hint?)` — lock / unlock another item (by `id`)
 *   while the menu is open (`hint`: a TEXT hint for it, '' removes it).
 * - Dismiss: outside pointerdown closes (the press continues — D5); the trigger scrolled out of view / removed closes
 *   (isReferenceHidden); scroll/resize reposition (placeFloating, D7: width auto, align end, side bottom, flips).
 * - onClose(reason): 'select' | 'escape' | 'tab' | 'outside' | 'hidden' | 'api' | 'covered' (v0.21.1: a newer modal /
 *   lightbox opened over it, or the dialog / hovercard holding its anchor closed). The anchor hidden without a scroll
 *   (tab switch, display:none) or removed from the DOM closes it too ('hidden', watchReference).
 */
import {
  LAYERS, register as registerLayer, restoreFocus, swallowPointerPress, bridgeTheme, tabSequence, deepActiveElement,
  composedContains, composedClosest, floatingContains, coverFloatingIn,
} from '../utils/layers.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';
import { nextTypeaheadIndex } from '../utils/typeahead.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';
import { createCheckMark } from '../utils/check-mark.js';

const TYPEAHEAD_MS = 500;
const LIST_MAX = 448; // px, 28rem at 16px: the menu itself scrolls beyond this (or the room on the chosen side)
const ALIGNS = ['start', 'center', 'end'];

let menuSeq = 0;
let triggerSeq = 0;
/** @type {object|null} the open menu session */
let current = null;
/** @type {WeakMap<HTMLElement, () => void>} bound triggers → unbind */
const bound = new WeakMap();
/** @type {Map<string, { base: object|null, adds: Array<object> }>} named menus (G9) */
const registry = new Map();
/** @type {Map<object, () => void>} bindAll roots → unbind (idempotent per root) */
const boundRoots = new Map();
/** @type {WeakSet<Event>} events already handled by a bindAll root (nested roots never double-toggle) */
const handledEvents = new WeakSet();
const DEFAULT_ADD_ORDER = 1000;
const RESERVED_CTX = new Set(['__proto__', 'constructor', 'prototype', 'anchor', 'name', 'item', 'checked']);

/**
 * Validate a link target (security.md: URL whitelist). Relative URLs resolve against the page; an explicit scheme
 * must be https (or http on an http page). The string is normalised the way the URL parser does before the check.
 * @param {unknown} href
 * @param {{ href: string, protocol: string }|null} [page=location] the page URL (injectable for tests)
 * @returns {string|null} the href to use, or null when unsafe
 */
export function safeMenuHref(href, page = typeof location !== 'undefined' ? location : null) {
  if (typeof href !== 'string') return null;
  // URL parsing strips leading/trailing C0 controls + spaces and removes tab/newline anywhere ("java\tscript:").
  const norm = href.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (!norm) return null;
  let url;
  try { url = new URL(norm, page ? page.href : 'https://localhost/'); } catch { return null; }
  // Judge the RESOLVED protocol (relative URLs inherit the page's): https always; http only when the page itself is
  // http (no cleartext downgrade from an HTTPS page — same fail-closed policy as td-lightbox defaultIsAllowedUrl).
  if (url.protocol === 'https:') return norm;
  if (url.protocol === 'http:' && page && page.protocol === 'http:') return norm;
  return null;
}

const DOWNLOAD_NAME_MAX = 200;

/**
 * Sanitise a download file name (v0.17.0 E5a): drops path separators / reserved characters (/ \ : * ? " < > |)
 * and control characters, trims spaces/dots at the ends, caps the length. '' when nothing usable remains.
 * @param {unknown} name
 * @returns {string}
 */
export function sanitizeDownloadName(name) {
  if (typeof name !== 'string') return '';
  const clean = name.replace(/[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/g, '').replace(/^[\s.]+|[\s.]+$/g, '');
  return Array.from(clean).slice(0, DOWNLOAD_NAME_MAX).join('').trim();
}

/**
 * Caller URL policy (E5a): the policy decides; a throw blocks; `javascript:` is always blocked (hard floor — it can
 * never be a navigation target or a download).
 * @param {unknown} href
 * @param {(url: string) => boolean} policy
 * @returns {string|null}
 */
function policyHref(href, policy) {
  if (typeof href !== 'string') return null;
  const norm = href.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (!norm || /^javascript:/i.test(norm)) return null;
  try { return policy(norm) ? norm : null; } catch { return null; }
}

const isFn = (f) => typeof f === 'function';
const validName = (n) => typeof n === 'string' && n.trim() !== '';
const finiteOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Build the menu context: opts.ctx, then the anchor's data-td-menu-* attributes (strings), then anchor + name.
 * @param {HTMLElement} anchor
 * @param {string} name
 * @param {unknown} extra opts.ctx
 */
function buildCtx(anchor, name, extra) {
  const ctx = {};
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) if (!RESERVED_CTX.has(k)) ctx[k] = extra[k];
  }
  const ds = anchor.dataset || {};
  for (const k of Object.keys(ds)) {
    if (!k.startsWith('tdMenu') || k.length <= 6) continue; // `data-td-menu` itself is the name
    const key = k.charAt(6).toLowerCase() + k.slice(7);
    if (!key || RESERVED_CTX.has(key)) continue;
    ctx[key] = String(ds[k]);
  }
  ctx.anchor = anchor;
  ctx.name = name;
  return ctx;
}

/** `when(ctx)`: false / throwing → hidden. Separators and items without `when` pass. */
function visible(it, ctx) {
  if (!it || typeof it !== 'object' || !isFn(it.when)) return true;
  try {
    return !!it.when(ctx);
  } catch (err) {
    console.warn(`TdMenu: when() threw on "${it.label}" — item hidden`, err);
    return false;
  }
}

/** Call a lazy item builder; errors → null (logged). */
function callItems(fn, ctx) {
  try { return fn(ctx); } catch (err) { console.error('TdMenu items', err); return null; }
}

/**
 * Resolve a named menu into a flat item list (order, when, group separators). Returns null when the name is unknown.
 * @param {string} name
 * @param {object} ctx
 */
function resolveNamed(name, ctx) {
  const rec = registry.get(name);
  if (!rec || (!rec.base && !rec.adds.length)) return null;
  const rows = [];
  let seq = 0;
  if (rec.base) {
    const list = isFn(rec.base.items) ? callItems(rec.base.items, ctx) : rec.base.items;
    if (Array.isArray(list)) {
      list.forEach((it, i) => {
        if (it && typeof it === 'object') rows.push({ it, order: finiteOr(it.order, i * 10), group: null, seq: seq++ });
      });
    }
  }
  for (const add of rec.adds) {
    for (const it of add.items) {
      if (it && typeof it === 'object') {
        rows.push({ it, order: finiteOr(it.order, add.order), group: add.group, seq: seq++ });
      }
    }
  }
  const kept = rows.filter((r) => r.it.separator || visible(r.it, ctx));
  kept.sort((a, b) => a.order - b.order || a.seq - b.seq);
  const out = [];
  let lastGroup;
  let seen = false;
  for (const r of kept) {
    if (r.it.separator) { out.push(r.it); continue; }
    if (seen && r.group !== lastGroup) out.push({ separator: true });
    seen = true;
    lastGroup = r.group;
    out.push(r.it);
  }
  return out;
}

/**
 * @param {unknown} list
 * @returns {Array<object>} normalised entries; separators collapsed (no leading/trailing/double)
 */
function normalise(list, isAllowedUrl) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    if (it.separator) {
      if (out.length && !out[out.length - 1].separator) out.push({ separator: true });
      continue;
    }
    if (it.type === 'custom') { // v0.53.0 (plan v0.53.0-menu-custom-item QĐ 6): render(ctx) → Element, called at open
      if (!isFn(it.render)) {
        console.warn('TdMenu: custom item needs a render(ctx) function — row omitted');
        continue;
      }
      out.push({
        custom: true, src: it, render: it.render, node: null, ac: null,
        label: it.label == null ? '' : String(it.label), id: it.id == null ? '' : String(it.id),
      });
      continue;
    }
    const label = it.label == null ? '' : String(it.label);
    if (!label) continue;
    let type = it.type === 'radio' || it.type === 'checkbox' ? it.type : 'item';
    if (it.type == null && typeof it.checked === 'boolean') type = 'radio'; // dwp compat
    const entry = {
      src: it,
      label,
      type,
      checked: !!it.checked,
      group: it.group == null ? '' : String(it.group),
      hint: it.hint == null ? '' : String(it.hint),
      danger: !!it.danger,
      disabled: !!it.disabled,
      onSelect: isFn(it.onSelect) ? it.onSelect : isFn(it.onClick) ? it.onClick : null,
      href: null,
      newTab: !!it.newTab,
      icon: typeof it.icon === 'string' ? it.icon : '',
      iconNode: typeof SVGElement !== 'undefined' && it.iconNode instanceof SVGElement ? it.iconNode : null, // trusted SVG only
      id: it.id == null ? '' : String(it.id),
      download: null,
    };
    if (it.href != null && type === 'item') {
      const safe = isFn(isAllowedUrl) ? policyHref(it.href, isAllowedUrl) : safeMenuHref(it.href);
      if (safe == null) {
        console.warn(`TdMenu: unsafe or invalid href on "${label}" — item rendered disabled`);
        entry.disabled = true;
      } else {
        entry.href = safe;
        if (it.download === true) entry.download = '';
        else if (typeof it.download === 'string') entry.download = sanitizeDownloadName(it.download);
      }
    }
    out.push(entry);
  }
  while (out.length && out[out.length - 1].separator) out.pop();
  return out;
}

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

function separatorEl() {
  const sep = el('div', 'td-menu__separator');
  sep.setAttribute('role', 'separator');
  return sep;
}

/** Build the menu DOM (DOM APIs only: labels/hints are textContent). */
function build(entries, menuId) {
  if (entries.some((e) => e.custom)) return buildPanel(entries, menuId);
  const menu = el('div', 'td-menu td-glass-surface td-glass-surface--strong');
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('data-state', 'open');
  const items = [];
  entries.forEach((e, i) => {
    if (e.separator) {
      menu.appendChild(separatorEl());
      return;
    }
    const node = buildItem(e, i, menuId);
    menu.appendChild(node);
    items.push({ node, entry: e });
  });
  fillIconSlots(menu);
  return { menu, items, rows: items.map((rec) => ({ rec })), panel: false };
}

/**
 * v0.53.0 (plan v0.53.0-menu-custom-item QĐ 1, ADR 0026): a menu hosting custom rows is a non-modal DIALOG ("menu
 * panel"): runs of plain items live in unnamed role="menu" sections (item markup unchanged), a separator next to a
 * custom row sits at panel level, a custom row is role="group" named by its caption (or a plain div without a
 * label) and holds the caller's Element as is. Icons are filled per section — never inside the caller's content.
 */
function buildPanel(entries, menuId) {
  const menu = el('div', 'td-menu td-menu--panel td-glass-surface td-glass-surface--strong');
  menu.id = menuId;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('tabindex', '-1');
  menu.setAttribute('data-state', 'open');
  const items = [];
  const rows = [];
  let section = null;
  entries.forEach((e, i) => {
    if (e.separator) {
      const next = entries[i + 1];
      if (section && next && !next.separator && !next.custom) section.appendChild(separatorEl());
      else { section = null; menu.appendChild(separatorEl()); }
      return;
    }
    if (e.custom) {
      section = null;
      const row = el('div', 'td-menu__custom');
      if (e.id) row.setAttribute('data-item', e.id);
      if (e.label) {
        const cap = el('div', 'td-menu__custom-label');
        cap.id = `${menuId}-c${i}-label`;
        cap.textContent = e.label;
        row.setAttribute('role', 'group');
        row.setAttribute('aria-labelledby', cap.id);
        row.appendChild(cap);
      }
      row.appendChild(e.node);
      menu.appendChild(row);
      rows.push({ row, entry: e });
      return;
    }
    if (!section) {
      section = el('div', 'td-menu__section');
      section.setAttribute('role', 'menu');
      menu.appendChild(section);
    }
    const node = buildItem(e, i, menuId);
    section.appendChild(node);
    fillIconSlots(node);
    const rec = { node, entry: e };
    items.push(rec);
    rows.push({ rec });
  });
  return { menu, items, rows, panel: true };
}

/** One plain / checkable / link item (markup unchanged since v0.36). */
function buildItem(e, i, menuId) {
  const link = !!e.href && !e.disabled;
  const node = el(link ? 'a' : 'button', `td-menu__item${e.danger ? ' td-menu__item--danger' : ''}`);
  if (link) {
    node.setAttribute('href', e.href);
    if (e.newTab) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (e.download != null) node.setAttribute('download', e.download);
  } else {
    node.setAttribute('type', 'button');
  }
  node.setAttribute('role', e.type === 'radio' ? 'menuitemradio' : e.type === 'checkbox' ? 'menuitemcheckbox' : 'menuitem');
  node.setAttribute('tabindex', '-1');
  if (e.type !== 'item') node.setAttribute('aria-checked', String(e.checked));
  if (e.disabled) node.setAttribute('aria-disabled', 'true');
  if (e.id) node.setAttribute('data-item', e.id);

  const label = el('span', 'td-menu__label');
  label.textContent = e.label;
  node.appendChild(label);

  if (e.icon && hasIcon(e.icon)) {
    const ic = el('span', 'td-menu__icon');
    ic.setAttribute('data-td-icon', e.icon);
    ic.setAttribute('aria-hidden', 'true');
    node.appendChild(ic);
  } else if (e.iconNode) {
    const ic = el('span', 'td-menu__icon');
    ic.setAttribute('aria-hidden', 'true');
    const clone = e.iconNode.cloneNode(true);
    if (clone instanceof Element) {
      clone.setAttribute('aria-hidden', 'true');
      if (clone.localName === 'svg') clone.setAttribute('focusable', 'false');
    }
    ic.appendChild(clone);
    node.appendChild(ic);
  }
  if (e.type === 'checkbox') {
    // v0.36.0 (ADR 0017): checkbox items show the shared td-checkbox mark (always visible); radio items keep the ✓
    const check = createCheckMark('sm');
    check.classList.add('td-menu__check');
    node.appendChild(check);
  } else if (e.type !== 'item') {
    const check = el('span', 'td-menu__check');
    check.setAttribute('data-td-icon', 'check');
    check.setAttribute('aria-hidden', 'true');
    node.appendChild(check);
  }
  if (e.hint) {
    // Name = label only; the hint is the description (not a duplicated name, not a `title`).
    label.id = `${menuId}-label-${i}`;
    const hint = el('span', 'td-menu__hint');
    hint.id = `${menuId}-hint-${i}`;
    hint.textContent = e.hint;
    // v0.36.0 (plan QĐ 65): a 1–3 character hint is a keyboard shortcut → hidden on touch screens (CSS)
    if (/^\S{1,3}$/.test(String(e.hint).trim())) hint.classList.add('td-menu__hint--kbd');
    node.appendChild(hint);
    node.setAttribute('aria-labelledby', label.id);
    node.setAttribute('aria-describedby', hint.id);
  }
  return node;
}

function focusEl(node) {
  if (!(node instanceof HTMLElement) || !node.isConnected) return false;
  try { node.focus({ preventScroll: true }); } catch { return false; }
  return document.activeElement === node;
}

function usableAnchor(a) {
  return a instanceof HTMLElement && a.isConnected && !a.closest('[inert]') && a.getClientRects().length > 0;
}

function safeCall(fn, ctx) {
  if (!isFn(fn)) return;
  try {
    const r = fn(ctx);
    if (r && typeof r.then === 'function') r.then(undefined, (err) => console.error('TdMenu onSelect', err));
  } catch (err) {
    console.error('TdMenu onSelect', err);
  }
}

/** Close the open session. */
function closeSession(s, reason) {
  if (!s || s.closed) return;
  s.closed = true;
  if (current === s) current = null;
  const { anchor, menu } = s;
  // v0.53.0: focus inside a custom row's shadow tree / a popup opened from a custom row counts as "in the menu"
  const hadFocus = menu.contains(document.activeElement)
    || (s.panel && (composedContains(menu, deepActiveElement()) || floatingContains(menu, deepActiveElement())));
  clearTimeout(s.typeTimer);
  if (s.raf) cancelAnimationFrame(s.raf);
  document.removeEventListener('pointerdown', s.onPointerDown, true);
  window.removeEventListener('scroll', s.onScroll, true);
  window.removeEventListener('resize', s.onResize);
  if (s.unwatch) s.unwatch();
  if (s.layer) s.layer.release();
  if (s.ro) s.ro.disconnect();
  if (s.panel) coverFloatingIn(menu); // v0.53.0 QĐ 9: popups opened from a custom row close first
  if (anchor instanceof HTMLElement) {
    anchor.setAttribute('aria-expanded', 'false');
    if (anchor.getAttribute('aria-controls') === menu.id) anchor.removeAttribute('aria-controls');
  }
  // Focus goes back to the trigger for select / escape (and api/hidden when the menu held focus so it is never
  // stranded on <body>); 'tab' (menu held focus) focuses it only as the starting point of the native Tab, which then
  // moves on (D4); 'outside' leaves focus to the press; 'covered' (a newer modal / lightbox, or the closing dialog
  // the anchor lives in) leaves it to that layer. An anchor that is gone / hidden / inert is never focused (v0.21.1):
  // focus follows the hand-off of the layer that closed under it, else the top dialog.
  const back = reason === 'select' || reason === 'escape' || (reason === 'tab' && hadFocus)
    || (hadFocus && (reason === 'api' || reason === 'hidden'));
  if (back && usableAnchor(anchor)) focusEl(anchor);
  else if (back && hadFocus) restoreFocus(anchor);
  // v0.53.0 QĐ 10: custom rows' signals abort while their elements are still in the DOM, before onClose
  for (const e of s.customs || []) abortRow(e);
  menu.remove();
  if (s.unbridge) s.unbridge();
  const { onClose } = s;
  releaseSession(s);
  if (isFn(onClose)) {
    try { onClose(reason); } catch (err) { console.error('TdMenu onClose', err); }
  }
}

/**
 * v0.53.0 (Codex impl r1 #1): a closed session drops every DOM-bearing reference — a closed handle kept by the caller
 * (its `element` is the detached menu) must not keep the caller's custom content reachable: custom rows leave the
 * detached menu, their entries forget their node / controller, and the session fields are cleared.
 */
function releaseSession(s) {
  for (const e of s.customs || []) {
    if (e.node) {
      const row = e.node.parentNode;
      if (row) row.remove(); // the .td-menu__custom row leaves the detached menu
      e.node.remove(); // the caller's node leaves the row: nothing of the closed menu points at it
    }
    e.node = null;
    e.ac = null;
  }
  for (const k of ['menu', 'rows', 'items', 'customs', 'ctx', 'layer', 'ro', 'unwatch', 'unbridge', 'onPointerDown',
    'onScroll', 'onResize', 'onClose', 'anchor']) s[k] = null;
}

function place(s) {
  const { anchor, menu } = s;
  const listMax = Math.max(0, Math.min(window.innerHeight - 16, LIST_MAX));
  const { side } = placeFloating(anchor, menu, { width: 'auto', align: s.align, side: s.side, list: menu, listMax });
  menu.setAttribute('data-placement', side);
}

function reposition(s) {
  if (s.closed) return;
  if (!s.anchor.isConnected || isReferenceHidden(s.anchor.getBoundingClientRect(), s.anchor)) {
    closeSession(s, 'hidden');
    return;
  }
  place(s);
}

function activate(s, idx) {
  const rec = s.items[idx];
  if (!rec) return;
  const { entry, node } = rec;
  if (entry.disabled) return;
  const ctx = { ...s.ctx, item: entry.src, anchor: s.anchor, checked: entry.checked };
  if (entry.type === 'checkbox') {
    entry.checked = !entry.checked; // session state only — caller items are never mutated (they may be frozen)
    node.setAttribute('aria-checked', String(entry.checked));
    ctx.checked = entry.checked;
    ctx.setDisabled = (id, disabled, hint) => setItemDisabled(s, id, disabled, hint); // v0.39.0 (menu stays open)
    safeCall(entry.onSelect, ctx);
    return;
  }
  if (entry.type === 'radio') {
    for (const r of s.items) {
      if (r.entry.type !== 'radio' || r.entry.group !== entry.group) continue;
      const on = r === rec;
      r.entry.checked = on;
      r.node.setAttribute('aria-checked', String(on));
    }
    ctx.checked = true;
  }
  closeSession(s, 'select');
  safeCall(entry.onSelect, ctx);
}

/**
 * v0.39.0 (plan v0.39.0-filters-range QĐ 10): lock / unlock the item with `id` (its `data-item`) while the menu is
 * open — `aria-disabled` + the session entry (inert like any disabled item). `hint` (optional): a string replaces the
 * item's hint (TEXT; '' removes it), anything else leaves it. Unknown id / closed menu → nothing.
 */
function setItemDisabled(s, id, disabled, hint) {
  if (s.closed || id == null) return;
  const rec = s.items.find((r) => r.entry.id !== '' && r.entry.id === String(id));
  if (!rec) return;
  const { entry, node } = rec;
  entry.disabled = !!disabled;
  if (entry.disabled) node.setAttribute('aria-disabled', 'true');
  else node.removeAttribute('aria-disabled');
  if (typeof hint !== 'string') return;
  let el = node.querySelector(':scope > .td-menu__hint');
  if (!hint) {
    if (el) el.remove();
    node.removeAttribute('aria-describedby');
    node.removeAttribute('aria-labelledby');
    return;
  }
  const label = node.querySelector(':scope > .td-menu__label');
  const base = `${s.menu.id}-x${s.items.indexOf(rec)}`;
  if (label && !label.id) label.id = `${base}-label`;
  if (!el) {
    el = document.createElement('span');
    el.className = 'td-menu__hint';
    el.id = `${base}-hint`;
    node.appendChild(el);
  }
  el.textContent = hint;
  if (label) node.setAttribute('aria-labelledby', label.id);
  node.setAttribute('aria-describedby', el.id);
}

function indexOfNode(s, node) {
  return s.items.findIndex((r) => r.node === node || r.node.contains(node));
}

/** v0.53.0: index of the row (item or custom row) holding `node` (composed tree), -1 when none. */
function rowIndexOf(s, node) {
  if (!node) return -1;
  return s.rows.findIndex((r) => (r.rec ? r.rec.node === node || r.rec.node.contains(node) : composedContains(r.row, node)));
}

/** v0.53.0 QĐ 3: the focus stops of a custom row (computed now: the content may change while open). */
const rowStops = (r) => tabSequence(r.row);

/** Focus `node` (also inside an open shadow root); true when it took focus. */
function focusDeep(node) {
  if (!(node instanceof HTMLElement) || !node.isConnected) return false;
  try { node.focus({ preventScroll: true }); } catch { return false; }
  const a = deepActiveElement();
  return a === node || (a !== null && a.shadowRoot === null && node.contains(a)) || document.activeElement === node;
}

/**
 * Move to the row `i` (wrapping), going in `dir` past custom rows with no focus stop (a static header, all-disabled
 * content). `last`: enter a custom row on its last stop (ArrowUp / End). Menus without custom rows: exactly the v0.52
 * item roving (every row is an item).
 * @returns {boolean} whether something took focus
 */
function focusRow(s, i, dir, last) {
  const n = s.rows.length;
  for (let k = 0; k < n; k++) {
    const r = s.rows[(((i + k * dir) % n) + n) % n];
    if (r.rec) return focusEl(r.rec.node) || true;
    const stops = rowStops(r);
    if (stops.length) return focusDeep(last ? stops[stops.length - 1] : stops[0]) || true;
  }
  return false;
}

function onMenuKeydown(s, e) {
  if (s.closed || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
  const n = s.rows.length;
  const cur = rowIndexOf(s, deepActiveElement());
  // v0.53.0 QĐ 4: inside a custom row every key belongs to the content (↑ / ↓ are taken in the capture phase,
  // onPanelKeyCapture; Escape / Tab by the layer registry)
  if (cur >= 0 && !s.rows[cur].rec) return;
  const go = (i, dir, last = false) => { e.preventDefault(); focusRow(s, i, dir, last); };
  switch (e.key) {
    case 'ArrowDown': go(cur < 0 ? 0 : cur + 1, 1); return;
    case 'ArrowUp': go(cur < 0 ? n - 1 : cur - 1, -1, true); return;
    case 'Home': case 'PageUp': go(0, 1); return;
    case 'End': case 'PageDown': go(n - 1, -1, true); return;
    case 'Enter':
    case ' ': {
      if (cur < 0) return;
      const idx = s.items.indexOf(s.rows[cur].rec);
      const rec = s.items[idx];
      if (rec.node.localName === 'a') {
        if (e.key === ' ') { e.preventDefault(); rec.node.click(); } // Enter follows the link natively
        return;
      }
      e.preventDefault(); // no synthetic click: activation happens once, here
      activate(s, idx);
      return;
    }
    default: break;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
    e.preventDefault();
    s.typeBuffer += e.key;
    clearTimeout(s.typeTimer);
    s.typeTimer = setTimeout(() => { s.typeBuffer = ''; }, TYPEAHEAD_MS);
    // custom rows are never matched (null label — utils/typeahead.js)
    const i = nextTypeaheadIndex(s.rows.map((r) => (r.rec ? r.rec.entry.label : null)), cur, s.typeBuffer);
    if (i >= 0) focusEl(s.rows[i].rec.node);
  }
}

/** Controls that use ↑ / ↓ themselves (QĐ 4): the menu leaves those keys to them. */
const OWN_ARROW_ROLES = '[role="slider"], [role="spinbutton"], [role="listbox"], [role="combobox"], [role="textbox"], '
  + '[role="tree"], [role="treegrid"], [role="grid"], [data-td-menu-keys="content"]';
const NO_ARROW_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color']);

function ownsArrows(t, row) {
  if (!(t instanceof Element)) return false;
  if (t.localName === 'textarea' || t.localName === 'select') return true;
  if (t.localName === 'input' && !NO_ARROW_INPUTS.has(/** @type {HTMLInputElement} */ (t).type)) return true;
  if (t instanceof HTMLElement && t.isContentEditable) return true;
  return !!composedClosest(t, OWN_ARROW_ROLES, row);
}

/**
 * v0.53.0 QĐ 4 (panel only, CAPTURE on the panel): ↑ / ↓ from inside a custom row move to the previous / next row
 * before the content sees them — unless the real target (composedPath()[0], through shadow roots) uses vertical
 * arrows itself. Capture, not bubble: td-choice-group prevents the default only at the ends of its group, so a
 * bubble handler would behave differently by position.
 */
function onPanelKeyCapture(s, e) {
  if (s.closed || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
  if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = typeof e.composedPath === 'function' ? e.composedPath()[0] : e.target;
  const cur = rowIndexOf(s, /** @type {Node} */ (t));
  if (cur < 0 || s.rows[cur].rec) return;
  if (ownsArrows(t, s.rows[cur].row)) return;
  e.preventDefault();
  e.stopPropagation();
  const down = e.key === 'ArrowDown';
  focusRow(s, cur + (down ? 1 : -1), down ? 1 : -1, !down);
}

/**
 * v0.53.0 QĐ 4 (RL Q5): Tab / Shift+Tab in a panel walk every focus stop — each plain item, then every stop of each
 * custom row (tabSequence), in order — and moved explicitly (native Tab skips the tabindex=-1 items, unchecked radios
 * and leaves a <body>-end popup). Past either edge: the v0.52 D4 behaviour (close, the trigger is where the native
 * Tab continues).
 */
function onPanelTab(s, e) {
  const stops = [];
  for (const r of s.rows) {
    if (r.rec) stops.push(r.rec.node);
    else stops.push(...rowStops(r));
  }
  const back = e.shiftKey;
  const a = deepActiveElement();
  let i = stops.indexOf(/** @type {HTMLElement} */ (a));
  if (i < 0 && a) i = stops.findIndex((st) => st.contains(a) || composedContains(st, a));
  if (i < 0 && a instanceof HTMLInputElement && a.type === 'radio' && a.name) {
    i = stops.findIndex((st) => st instanceof HTMLInputElement && st.type === 'radio' && st.name === a.name
      && st.getRootNode() === a.getRootNode() && st.form === a.form);
  }
  let next;
  if (i >= 0) next = i + (back ? -1 : 1);
  else {
    // not on a stop (the panel, a caption, inside a nested widget): continue from the row holding focus
    const r = rowIndexOf(s, a);
    if (r < 0) next = back ? stops.length - 1 : 0;
    else {
      const before = s.rows.slice(0, r).reduce((k, row) => k + (row.rec ? 1 : rowStops(row).length), 0);
      const own = s.rows[r].rec ? 1 : rowStops(s.rows[r]).length;
      next = back ? before - 1 : before + own;
    }
  }
  if (next < 0 || next >= stops.length) {
    closeSession(s, 'tab');
    return 'pass';
  }
  e.preventDefault();
  focusDeep(stops[next]);
  return 'handled';
}

/**
 * v0.53.0 QĐ 5b (Codex plan-review r1 #1): after a click inside a custom row, if focus did not land in that row
 * (WebKit / Safari iOS do not focus a clicked radio / button), focus the clicked control — the nearest focus stop on
 * the click path (a <label> → its control) — else the panel. Controls that took focus themselves are never touched.
 */
function onPanelClick(s, e) {
  if (s.closed || e.defaultPrevented) return;
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  const r = s.rows.find((row) => !row.rec && path.includes(row.row));
  if (!r) return;
  const a = deepActiveElement();
  if (a && (composedContains(r.row, a) || floatingContains(s.menu, a))) return;
  const stops = rowStops(r);
  let target = null;
  for (const n of path) {
    if (n === r.row) break;
    if (!(n instanceof HTMLElement)) continue;
    const c = n.localName === 'label' && /** @type {HTMLLabelElement} */ (n).control ? /** @type {HTMLLabelElement} */ (n).control : n;
    if (stops.includes(/** @type {HTMLElement} */ (c))) { target = c; break; }
  }
  if (!target || !focusDeep(/** @type {HTMLElement} */ (target))) focusEl(s.menu);
}

/** v0.53.0 QĐ 7: call a custom row's render(ctx); the Element or null (row dropped, its signal aborted). */
function renderCustom(e, ctx, close) {
  e.ac = new AbortController();
  let node;
  try {
    node = e.render({ ...ctx, item: e.src, close, signal: e.ac.signal });
  } catch (err) {
    console.warn('TdMenu: custom item render() threw — row omitted'); // fixed string only (Codex security r1 #6)
    return null;
  }
  if (node == null) return null;
  if (typeof node === 'string') {
    console.warn('TdMenu: custom item render() must return an Element — strings are not rendered (no HTML)');
    return null;
  }
  if (!(typeof Element !== 'undefined' && node instanceof Element)) {
    console.warn('TdMenu: custom item render() must return an Element');
    return null;
  }
  if (node.isConnected) {
    console.warn('TdMenu: custom item render() must return a detached Element');
    return null;
  }
  return node;
}

function abortRow(e) {
  if (!e.ac || e.ac.signal.aborted) return;
  try { e.ac.abort(); } catch { console.error('TdMenu: custom item abort failed'); } // fixed string only
}

/** Separators collapsed again after dropped custom rows (no leading / trailing / double). */
function collapse(entries) {
  const out = [];
  for (const e of entries) {
    if (e.separator && (!out.length || out[out.length - 1].separator)) continue;
    out.push(e);
  }
  while (out.length && out[out.length - 1].separator) out.pop();
  return out;
}

function onMenuClick(s, e) {
  if (s.closed) return;
  const i = indexOfNode(s, /** @type {Node} */ (e.target));
  if (i < 0) return;
  const rec = s.items[i];
  if (rec.entry.disabled) { e.preventDefault(); return; }
  if (rec.node.localName === 'a') {
    // Native navigation proceeds (an <a> navigates even once detached); close right after the activation.
    const { entry } = rec;
    const ctx = { ...s.ctx, item: entry.src, anchor: s.anchor, checked: false }; // the session is released on close
    setTimeout(() => {
      closeSession(s, 'select');
      safeCall(entry.onSelect, ctx);
    }, 0);
    return;
  }
  activate(s, i);
}

function ensureId(anchor) {
  if (!anchor.id) anchor.id = `td-menu-trigger-${++triggerSeq}`;
  return anchor.id;
}

/** Attributes bind() / bindAll() may change on a trigger (restored when the last owner lets go). */
const TRIGGER_SNAP = ['id', 'aria-haspopup', 'aria-expanded', 'aria-controls'];
/**
 * Per-trigger ownership: ONE snapshot of the original attributes + the live owners (bind() calls, bindAll() roots).
 * Overlapping owners never restore stale ARIA under each other; the originals return when the last owner releases.
 * @type {WeakMap<HTMLElement, { snap: Array<[string, string|null]>, owners: Set<object> }>}
 */
const TRIGGER_OWNERS = new WeakMap();
/** v0.53.0: anchors whose aria-haspopup open() itself added (it follows the menu / panel mode afterwards) */
const HASPOPUP_BY_OPEN = new WeakSet();

function acquireTrigger(t, owner) {
  let rec = TRIGGER_OWNERS.get(t);
  if (!rec) {
    rec = { snap: TRIGGER_SNAP.map((a) => [a, t.getAttribute(a)]), owners: new Set() };
    TRIGGER_OWNERS.set(t, rec);
  }
  rec.owners.add(owner);
}

function releaseTrigger(t, owner) {
  const rec = TRIGGER_OWNERS.get(t);
  if (!rec || !rec.owners.delete(owner) || rec.owners.size) return;
  TRIGGER_OWNERS.delete(t);
  for (const [a, v] of rec.snap) {
    if (v === null) t.removeAttribute(a);
    else t.setAttribute(a, v);
  }
}

export class TdMenu {
  /** Default labels (Vietnamese); override per site: `TdMenu.labels.trigger = 'Options'`. */
  static labels = { trigger: 'Tùy chọn' };

  /**
   * Open a menu at `anchor`. Toggles: the same anchor already open → closes it and returns null. Opening closes any
   * other open menu (one at a time).
   * @param {HTMLElement} anchor any element (a button you own, a lightbox toolbar button, an SSR button)
   * @param {string|Array<object>|((ctx: object) => Array<object>)} items a registered menu name (G9), an item list or
   *   a lazy builder (called at open with ctx)
   * @param {{ align?: 'start'|'center'|'end', side?: 'bottom'|'top', label?: string, focus?: 'first'|'last',
   *           onClose?: (reason: string) => void, ctx?: object, isAllowedUrl?: (url: string) => boolean,
   *           themeRoot?: Element }} [opts]
   *   `ctx`: extra context data (see header); `isAllowedUrl`: replaces the default href filter (E5a); `themeRoot`
   *   (v0.42.0, ADR 0020): follow that element's theme scope instead of the anchor's
   * @returns {{ element: HTMLElement, close(): void, readonly isOpen: boolean }|null}
   */
  static open(anchor, items, opts = {}) {
    if (typeof document === 'undefined' || !(anchor instanceof HTMLElement)) return null;
    const o = opts || {};
    if (current && current.anchor === anchor) {
      closeSession(current, 'api');
      return null;
    }
    if (!anchor.isConnected) return null;
    const named = typeof items === 'string';
    if (named && !TdMenu.has(items)) {
      console.warn(`TdMenu: unknown menu "${items}"`);
      return null;
    }
    if (current) closeSession(current, 'api'); // a new anchor always closes the old menu, even if its items are empty
    const ctx = buildCtx(anchor, named ? items : '', o.ctx);
    let list = items;
    if (named) {
      list = resolveNamed(items, ctx);
    } else if (isFn(list)) {
      list = callItems(list, ctx);
      if (list == null) return null;
    }
    let entries = normalise(Array.isArray(list) ? list.filter((it) => visible(it, ctx)) : list, o.isAllowedUrl);
    if (!entries.some((e) => !e.separator)) return null;

    // v0.53.0 QĐ 7 / QĐ 8: custom rows render now (fresh Element each open); dropped rows abort their signal at once
    /** @type {object|null} */
    let sRef = null;
    const closeFromRow = () => { if (sRef && !sRef.closed) closeSession(sRef, 'select'); };
    const customs = [];
    if (entries.some((e) => e.custom)) {
      entries = collapse(entries.filter((e) => {
        if (!e.custom) return true;
        e.node = renderCustom(e, ctx, closeFromRow);
        if (!e.node) { abortRow(e); return false; }
        customs.push(e);
        return true;
      }));
      if (!entries.some((e) => !e.separator)) return null;
    }

    const menuId = `td-menu-${++menuSeq}`;
    const { menu, items: recs, rows, panel } = build(entries, menuId);
    const align = ALIGNS.includes(o.align) ? o.align : 'end';
    menu.setAttribute('data-align', align);
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (label) menu.setAttribute('aria-label', label);
    else menu.setAttribute('aria-labelledby', ensureId(anchor));

    const s = {
      anchor,
      menu,
      items: recs,
      rows, // v0.53.0: items + custom rows in DOM order (menu without custom rows: one row per item)
      panel,
      customs,
      ro: null,
      align,
      side: o.side === 'top' ? 'top' : 'bottom',
      onClose: o.onClose,
      ctx,
      closed: false,
      typeBuffer: '',
      // v0.36.0 INTERNAL (not documented as API): 'swallow' → a MOUSE press outside only dismisses (used by td-lightbox)
      dismiss: o.dismiss === 'swallow' ? 'swallow' : 'pass',
      typeTimer: 0,
      raf: 0,
      layer: null,
    };
    sRef = s;
    s.onPointerDown = (e) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
      if (path.includes(menu) || path.includes(anchor)) return; // the trigger's own click toggles
      // v0.53.0 QĐ 9: a press in a popup opened from a custom row (td-dropdown list…) is inside the panel
      if (panel && floatingContains(menu, /** @type {Node} */ (path[0]))) return;
      // default (D5): close, the press continues. 'swallow' (internal): a MOUSE press that is not on another popup trigger
      // only dismisses — the pointerdown / pointerup / click never reach the page, focus returns to the trigger.
      // Touch / pen stay pass-through (scrolling, gestures); another trigger opens its popup in the same press.
      const otherTrigger = path.some((n) => n instanceof Element && n.hasAttribute('aria-haspopup') && n !== anchor);
      const swallow = s.dismiss === 'swallow' && e.pointerType === 'mouse' && !otherTrigger;
      if (swallow) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        swallowPointerPress(e.pointerId);
      }
      closeSession(s, 'outside');
      if (swallow && usableAnchor(anchor)) focusEl(anchor);
    };
    s.onScroll = (e) => {
      if (e.target instanceof Node && menu.contains(e.target)) return; // scrolling a long menu never closes it
      if (s.raf) return;
      s.raf = requestAnimationFrame(() => { s.raf = 0; reposition(s); });
    };
    s.onResize = () => reposition(s);
    menu.addEventListener('keydown', (e) => onMenuKeydown(s, e));
    menu.addEventListener('click', (e) => onMenuClick(s, e));
    if (panel) {
      menu.addEventListener('keydown', (e) => onPanelKeyCapture(s, e), true);
      menu.addEventListener('click', (e) => onPanelClick(s, e));
    }

    // v0.42.0 (ADR 0020): the menu renders in the theme scope of `opts.themeRoot`, else of the anchor
    s.unbridge = bridgeTheme(menu, (typeof Element !== 'undefined' && o.themeRoot instanceof Element) ? o.themeRoot : anchor);
    document.body.appendChild(menu);
    current = s;
    // v0.53.0 (QĐ 1, codex r1 #3): "dialog" only once a custom row was really built; kit-owned triggers follow the mode
    if (!anchor.hasAttribute('aria-haspopup') || TRIGGER_OWNERS.has(anchor) || HASPOPUP_BY_OPEN.has(anchor)) {
      if (!anchor.hasAttribute('aria-haspopup')) HASPOPUP_BY_OPEN.add(anchor);
      anchor.setAttribute('aria-haspopup', panel ? 'dialog' : 'menu');
    }
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', menuId);
    place(s);
    s.layer = registerLayer({
      layer: LAYERS.popover,
      element: menu,
      keyboard: 'boundary',
      onEscape: () => { closeSession(s, 'escape'); return true; },
      // D4: close; the trigger (re-focused) is where the native Tab / a lower focus trap continues from.
      // v0.53.0 panel: Tab walks the stops, D4 only past the edges (onPanelTab)
      onTab: (e) => {
        if (panel) return onPanelTab(s, e);
        closeSession(s, 'tab');
        return 'pass';
      },
      anchor, // v0.21.1: covered by a newer modal / lightbox, or by the closing dialog / hovercard it lives in
      onCovered: () => closeSession(s, 'covered'),
    });
    s.unwatch = watchReference(anchor, () => reposition(s)); // hidden without a scroll, removed, entry transition
    document.addEventListener('pointerdown', s.onPointerDown, true);
    window.addEventListener('scroll', s.onScroll, true);
    window.addEventListener('resize', s.onResize);

    if (panel && typeof ResizeObserver !== 'undefined') {
      // v0.53.0 QĐ 11: content that grows / shrinks (td-tabs switching panels) re-places the panel (one rAF)
      s.ro = new ResizeObserver(() => {
        if (s.closed || s.raf) return;
        s.raf = requestAnimationFrame(() => { s.raf = 0; reposition(s); });
      });
      for (const r of rows) if (!r.rec) s.ro.observe(r.row);
    }

    if (!panel) {
      const enabled = recs.filter((r) => !r.entry.disabled);
      const pool = enabled.length ? enabled : recs;
      focusEl((o.focus === 'last' ? pool[pool.length - 1] : pool[0]).node);
    } else {
      // QĐ 5: enabled items and custom rows with a focus stop first; else disabled items; else the panel itself
      const last = o.focus === 'last';
      const order = last ? [...rows].reverse() : rows;
      const ok = order.find((r) => (r.rec ? !r.rec.entry.disabled : rowStops(r).length > 0))
        || order.find((r) => r.rec);
      if (!ok) focusEl(menu);
      else if (ok.rec) focusEl(ok.rec.node);
      else {
        const st = rowStops(ok);
        focusDeep(last ? st[st.length - 1] : st[0]);
      }
    }

    const handle = {
      element: menu,
      close: () => closeSession(s, 'api'),
      get isOpen() { return !s.closed; },
    };
    // test hook, not API (td-v053-menu-custom.browser-test.js: the session is released on close)
    Object.defineProperty(handle, Symbol.for('td.menu.session'), { value: s });
    return handle;
  }

  /** Close the open menu (no-op when none). */
  static close() {
    if (current) closeSession(current, 'api');
  }

  /**
   * @param {HTMLElement} [anchor] only this anchor's menu
   * @returns {boolean}
   */
  static isOpen(anchor) {
    return !!current && (anchor === undefined || current.anchor === anchor);
  }

  /**
   * Wire a trigger you own: aria-haspopup="menu", aria-expanded, click toggles (focus → first item), ArrowDown /
   * ArrowUp open with focus on the first / last item. Binding the same trigger again replaces the previous binding.
   * @param {HTMLElement} trigger
   * @param {string|Array<object>|((ctx: object) => Array<object>)} items a registered name, a list or a builder
   * @param {object} [opts] same as open()
   * @returns {() => void} unbind (closes its menu when open)
   */
  static bind(trigger, items, opts = {}) {
    if (!(trigger instanceof HTMLElement)) return () => {};
    bound.get(trigger)?.();
    const owner = {};
    acquireTrigger(trigger, owner); // one original snapshot shared with bindAll() (impl-review v0.14.0 ISSUE-5)
    ensureId(trigger);
    trigger.setAttribute('aria-haspopup', 'menu');
    if (!TdMenu.isOpen(trigger)) trigger.setAttribute('aria-expanded', 'false');
    const o = opts || {};
    const onClick = (e) => {
      e.preventDefault(); // a trigger inside a link card must not navigate
      TdMenu.open(trigger, items, { ...o, focus: 'first' });
    };
    const onKeydown = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (TdMenu.isOpen(trigger)) return;
      TdMenu.open(trigger, items, { ...o, focus: e.key === 'ArrowUp' ? 'last' : 'first' });
    };
    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKeydown);
    const unbind = () => {
      if (bound.get(trigger) !== unbind) return;
      bound.delete(trigger);
      trigger.removeEventListener('click', onClick);
      trigger.removeEventListener('keydown', onKeydown);
      if (TdMenu.isOpen(trigger)) closeSession(current, 'api');
      releaseTrigger(trigger, owner);
    };
    bound.set(trigger, unbind);
    return unbind;
  }

  /**
   * Register (or replace) the base option list of a named menu (G9).
   * @param {string} name
   * @param {Array<object>|((ctx: object) => Array<object>)} items items may carry `order` and `when(ctx)`
   * @returns {() => void} undefine — removes this base list (no-op once it has been replaced)
   */
  static define(name, items) {
    if (!validName(name) || !(Array.isArray(items) || isFn(items))) {
      console.warn('TdMenu.define: expected (name: string, items: Array | (ctx) => Array)');
      return () => {};
    }
    let rec = registry.get(name);
    if (!rec) registry.set(name, (rec = { base: null, adds: [] }));
    const base = { items: Array.isArray(items) ? items.slice() : items };
    rec.base = base;
    return () => {
      const r = registry.get(name);
      if (!r || r.base !== base) return;
      r.base = null;
      if (!r.adds.length) registry.delete(name);
    };
  }

  /**
   * Add options to a named menu (plugin hook) — before or after define().
   * @param {string} name
   * @param {object|Array<object>} items
   * @param {{ order?: number, group?: string }} [opts] default `order` for these items (1000 → appended); `group`
   *   separates them from the items of other groups
   * @returns {() => void} unregister
   */
  static register(name, items, opts = {}) {
    const list = Array.isArray(items) ? items.slice() : items && typeof items === 'object' ? [items] : null;
    if (!validName(name) || !list) {
      console.warn('TdMenu.register: expected (name: string, item | item[], { order?, group? })');
      return () => {};
    }
    const o = opts || {};
    let rec = registry.get(name);
    if (!rec) registry.set(name, (rec = { base: null, adds: [] }));
    const add = {
      items: list,
      order: finiteOr(o.order, DEFAULT_ADD_ORDER),
      group: o.group == null || o.group === '' ? null : String(o.group),
    };
    rec.adds.push(add);
    return () => {
      const r = registry.get(name);
      if (!r) return;
      const i = r.adds.indexOf(add);
      if (i < 0) return;
      r.adds.splice(i, 1);
      if (!r.base && !r.adds.length) registry.delete(name);
    };
  }

  /**
   * @param {string} name
   * @returns {boolean} true when the name has a base list or registered options
   */
  static has(name) {
    const r = typeof name === 'string' ? registry.get(name) : undefined;
    return !!r && (!!r.base || r.adds.length > 0);
  }

  /**
   * Declarative triggers: `[data-td-menu="name"]` inside `root` open that registered menu (click; ArrowDown/ArrowUp
   * like bind()). Event delegation, so triggers added later work too. ARIA (aria-haspopup="menu",
   * aria-expanded="false") is set on the triggers present now and lazily on later ones (focus / hover / use).
   * Idempotent per root (the same unbind is returned); nothing runs on import. Triggers wired with bind() are
   * skipped; disabled triggers do not open.
   * @param {Document|Element|DocumentFragment} [root=document]
   * @returns {() => void} unbind — removes the listeners, closes a menu opened from its triggers and restores ARIA
   */
  static bindAll(root = typeof document !== 'undefined' ? document : null) {
    if (!root || !isFn(root.addEventListener) || !isFn(root.querySelectorAll)) return () => {};
    const existing = boundRoots.get(root);
    if (existing) return existing;
    /** @type {Set<HTMLElement>} triggers this root owns (originals live in the shared TRIGGER_OWNERS record) */
    const touched = new Set();
    const owner = {};
    const triggerOf = (t) => {
      const n = t instanceof Element ? t.closest('[data-td-menu]') : null;
      if (!(n instanceof HTMLElement) || !root.contains(n) || bound.has(n)) return null;
      return validName(n.getAttribute('data-td-menu')) ? n : null;
    };
    const prime = (n) => {
      if (touched.has(n)) return;
      touched.add(n);
      acquireTrigger(n, owner);
      if (!n.hasAttribute('aria-haspopup')) n.setAttribute('aria-haspopup', 'menu');
      if (!TdMenu.isOpen(n)) n.setAttribute('aria-expanded', 'false');
    };
    const inert = (n) => n.matches(':disabled') || n.getAttribute('aria-disabled') === 'true';
    const openFrom = (n, focus) => TdMenu.open(n, n.getAttribute('data-td-menu').trim(), { focus });
    const onClick = (e) => {
      if (handledEvents.has(e)) return;
      const n = triggerOf(e.target);
      if (!n) return;
      handledEvents.add(e);
      e.preventDefault(); // a trigger inside a link card must not navigate
      prime(n);
      if (!inert(n)) openFrom(n, 'first');
    };
    const onKeydown = (e) => {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || handledEvents.has(e)) return;
      const n = triggerOf(e.target);
      if (!n || n !== e.target) return;
      handledEvents.add(e);
      e.preventDefault();
      prime(n);
      if (inert(n) || TdMenu.isOpen(n)) return;
      openFrom(n, e.key === 'ArrowUp' ? 'last' : 'first');
    };
    const onPrime = (e) => {
      const n = triggerOf(e.target);
      if (n) prime(n);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('focusin', onPrime);
    root.addEventListener('mouseover', onPrime);
    for (const n of root.querySelectorAll('[data-td-menu]')) {
      // bind()-owned triggers are acquired too (shared ownership, review ISSUE-9); only EVENT handling skips them
      if (n instanceof HTMLElement && validName(n.getAttribute('data-td-menu'))) prime(n);
    }
    const unbind = () => {
      if (boundRoots.get(root) !== unbind) return;
      boundRoots.delete(root);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('focusin', onPrime);
      root.removeEventListener('mouseover', onPrime);
      if (current && touched.has(current.anchor) && !bound.has(current.anchor)) closeSession(current, 'api');
      for (const n of touched) releaseTrigger(n, owner);
      touched.clear();
    };
    boundRoots.set(root, unbind);
    return unbind;
  }

  /**
   * Create a bound `.td-menu-btn` trigger (port of dwp createMenuButton).
   * @param {{ icon?: string, label?: string, ariaLabel?: string, items?: Array<object>|(() => Array<object>),
   *           getItems?: () => Array<object> } & object} [opts] plus open() options
   * @returns {HTMLButtonElement}
   */
  static button(opts = {}) {
    const o = opts || {};
    const btn = /** @type {HTMLButtonElement} */ (el('button', 'td-menu-btn'));
    btn.type = 'button';
    const iconName = typeof o.icon === 'string' && o.icon ? o.icon : 'more';
    if (hasIcon(iconName)) {
      const ic = el('span', 'td-menu-btn__icon');
      ic.setAttribute('data-td-icon', iconName);
      ic.setAttribute('aria-hidden', 'true');
      btn.appendChild(ic);
    }
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (label) {
      const l = el('span', 'td-menu-btn__label');
      l.textContent = label;
      btn.appendChild(l);
    }
    const aria = typeof o.ariaLabel === 'string' && o.ariaLabel.trim() ? o.ariaLabel.trim() : '';
    if (aria) btn.setAttribute('aria-label', aria);
    else if (!label) btn.setAttribute('aria-label', TdMenu.labels.trigger || 'Tùy chọn');
    fillIconSlots(btn);
    const { icon, label: _l, ariaLabel, items, getItems, ...rest } = o;
    TdMenu.bind(btn, items !== undefined ? items : getItems, rest);
    return btn;
  }
}
