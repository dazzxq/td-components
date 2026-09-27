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
 *   rendered as a disabled button + console.warn (use onSelect for mail/phone actions). Checkable items are plain
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
 *     <a class="td-menu__item" role="menuitem" tabindex="-1" href="…" [target="_blank" rel="noopener noreferrer"]>…</a>
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
 *   checkbox → toggles in place, the menu stays open. Links navigate natively and close the menu.
 * - Dismiss: outside pointerdown closes (the press continues — D5); the trigger scrolled out of view / removed closes
 *   (isReferenceHidden); scroll/resize reposition (placeFloating, D7: width auto, align end, side bottom, flips).
 * - onClose(reason): 'select' | 'escape' | 'tab' | 'outside' | 'hidden' | 'api'.
 */
import { LAYERS, register as registerLayer } from '../utils/layers.js';
import { placeFloating, isReferenceHidden } from '../utils/floating.js';
import { nextTypeaheadIndex } from '../utils/typeahead.js';
import { fillIconSlots, hasIcon } from '../icons/td-icon.js';

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
function normalise(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    if (it.separator) {
      if (out.length && !out[out.length - 1].separator) out.push({ separator: true });
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
    };
    if (it.href != null && type === 'item') {
      const safe = safeMenuHref(it.href);
      if (safe == null) {
        console.warn(`TdMenu: unsafe or invalid href on "${label}" — item rendered disabled`);
        entry.disabled = true;
      } else {
        entry.href = safe;
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

/** Build the menu DOM (DOM APIs only: labels/hints are textContent). */
function build(entries, menuId) {
  const menu = el('div', 'td-menu td-glass-surface td-glass-surface--strong');
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('data-state', 'open');
  const items = [];
  entries.forEach((e, i) => {
    if (e.separator) {
      const sep = el('div', 'td-menu__separator');
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      return;
    }
    const link = !!e.href && !e.disabled;
    const node = el(link ? 'a' : 'button', `td-menu__item${e.danger ? ' td-menu__item--danger' : ''}`);
    if (link) {
      node.setAttribute('href', e.href);
      if (e.newTab) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
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
    if (e.type !== 'item') {
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
      node.appendChild(hint);
      node.setAttribute('aria-labelledby', label.id);
      node.setAttribute('aria-describedby', hint.id);
    }
    menu.appendChild(node);
    items.push({ node, entry: e });
  });
  fillIconSlots(menu);
  return { menu, items };
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
  const hadFocus = menu.contains(document.activeElement);
  clearTimeout(s.typeTimer);
  if (s.raf) cancelAnimationFrame(s.raf);
  document.removeEventListener('pointerdown', s.onPointerDown, true);
  window.removeEventListener('scroll', s.onScroll, true);
  window.removeEventListener('resize', s.onResize);
  s.layer.release();
  if (anchor instanceof HTMLElement) {
    anchor.setAttribute('aria-expanded', 'false');
    if (anchor.getAttribute('aria-controls') === menu.id) anchor.removeAttribute('aria-controls');
  }
  // Focus goes back to the trigger for select / escape (and api/hidden when the menu held focus so it is never
  // stranded on <body>); 'tab' (menu held focus) focuses it only as the starting point of the native Tab, which then
  // moves on (D4); 'outside' leaves focus to the press.
  if (reason === 'select' || reason === 'escape' || (reason === 'tab' && hadFocus)) focusEl(anchor);
  else if (hadFocus && (reason === 'api' || reason === 'hidden') && usableAnchor(anchor)) focusEl(anchor);
  menu.remove();
  if (isFn(s.onClose)) {
    try { s.onClose(reason); } catch (err) { console.error('TdMenu onClose', err); }
  }
}

function place(s) {
  const { anchor, menu } = s;
  const listMax = Math.max(0, Math.min(window.innerHeight - 16, LIST_MAX));
  const { side } = placeFloating(anchor, menu, { width: 'auto', align: s.align, side: s.side, list: menu, listMax });
  menu.setAttribute('data-placement', side);
}

function reposition(s) {
  if (s.closed) return;
  if (!s.anchor.isConnected || isReferenceHidden(s.anchor.getBoundingClientRect())) {
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

function indexOfNode(s, node) {
  return s.items.findIndex((r) => r.node === node || r.node.contains(node));
}

function onMenuKeydown(s, e) {
  if (s.closed || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
  const n = s.items.length;
  const cur = indexOfNode(s, document.activeElement);
  const go = (i) => { e.preventDefault(); focusEl(s.items[(i + n) % n].node); };
  switch (e.key) {
    case 'ArrowDown': go(cur < 0 ? 0 : cur + 1); return;
    case 'ArrowUp': go(cur < 0 ? n - 1 : cur - 1); return;
    case 'Home': case 'PageUp': go(0); return;
    case 'End': case 'PageDown': go(n - 1); return;
    case 'Enter':
    case ' ': {
      if (cur < 0) return;
      const rec = s.items[cur];
      if (rec.node.localName === 'a') {
        if (e.key === ' ') { e.preventDefault(); rec.node.click(); } // Enter follows the link natively
        return;
      }
      e.preventDefault(); // no synthetic click: activation happens once, here
      activate(s, cur);
      return;
    }
    default: break;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
    e.preventDefault();
    s.typeBuffer += e.key;
    clearTimeout(s.typeTimer);
    s.typeTimer = setTimeout(() => { s.typeBuffer = ''; }, TYPEAHEAD_MS);
    const i = nextTypeaheadIndex(s.items.map((r) => r.entry.label), cur, s.typeBuffer);
    if (i >= 0) focusEl(s.items[i].node);
  }
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
    setTimeout(() => {
      closeSession(s, 'select');
      safeCall(entry.onSelect, { ...s.ctx, item: entry.src, anchor: s.anchor, checked: false });
    }, 0);
    return;
  }
  activate(s, i);
}

function ensureId(anchor) {
  if (!anchor.id) anchor.id = `td-menu-trigger-${++triggerSeq}`;
  return anchor.id;
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
   *           onClose?: (reason: string) => void, ctx?: object }} [opts] `ctx`: extra context data (see header)
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
    const entries = normalise(Array.isArray(list) ? list.filter((it) => visible(it, ctx)) : list);
    if (!entries.some((e) => !e.separator)) return null;

    const menuId = `td-menu-${++menuSeq}`;
    const { menu, items: recs } = build(entries, menuId);
    const align = ALIGNS.includes(o.align) ? o.align : 'end';
    menu.setAttribute('data-align', align);
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (label) menu.setAttribute('aria-label', label);
    else menu.setAttribute('aria-labelledby', ensureId(anchor));

    const s = {
      anchor,
      menu,
      items: recs,
      align,
      side: o.side === 'top' ? 'top' : 'bottom',
      onClose: o.onClose,
      ctx,
      closed: false,
      typeBuffer: '',
      typeTimer: 0,
      raf: 0,
      layer: null,
    };
    s.onPointerDown = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (menu.contains(t) || anchor.contains(t)) return; // the trigger's own click toggles
      closeSession(s, 'outside');
    };
    s.onScroll = (e) => {
      if (e.target instanceof Node && menu.contains(e.target)) return; // scrolling a long menu never closes it
      if (s.raf) return;
      s.raf = requestAnimationFrame(() => { s.raf = 0; reposition(s); });
    };
    s.onResize = () => reposition(s);
    menu.addEventListener('keydown', (e) => onMenuKeydown(s, e));
    menu.addEventListener('click', (e) => onMenuClick(s, e));

    document.body.appendChild(menu);
    current = s;
    if (!anchor.hasAttribute('aria-haspopup')) anchor.setAttribute('aria-haspopup', 'menu');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', menuId);
    place(s);
    s.layer = registerLayer({
      layer: LAYERS.popover,
      element: menu,
      keyboard: 'boundary',
      onEscape: () => { closeSession(s, 'escape'); return true; },
      // D4: close; the trigger (re-focused) is where the native Tab / a lower focus trap continues from.
      onTab: () => { closeSession(s, 'tab'); return 'pass'; },
    });
    document.addEventListener('pointerdown', s.onPointerDown, true);
    window.addEventListener('scroll', s.onScroll, true);
    window.addEventListener('resize', s.onResize);

    const enabled = recs.filter((r) => !r.entry.disabled);
    const pool = enabled.length ? enabled : recs;
    focusEl((o.focus === 'last' ? pool[pool.length - 1] : pool[0]).node);

    return {
      element: menu,
      close: () => closeSession(s, 'api'),
      get isOpen() { return !s.closed; },
    };
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
    // snapshot what binding changes, so unbind() restores the trigger's own semantics
    const SNAP = ['id', 'aria-haspopup', 'aria-expanded', 'aria-controls'];
    const before = new Map(SNAP.map((a) => [a, trigger.getAttribute(a)]));
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
      for (const [a, v] of before) {
        if (v === null) trigger.removeAttribute(a);
        else trigger.setAttribute(a, v);
      }
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
    const SNAP = ['id', 'aria-haspopup', 'aria-expanded', 'aria-controls'];
    /** @type {Map<HTMLElement, Map<string, string|null>>} trigger → attributes before bindAll touched it */
    const touched = new Map();
    const triggerOf = (t) => {
      const n = t instanceof Element ? t.closest('[data-td-menu]') : null;
      if (!(n instanceof HTMLElement) || !root.contains(n) || bound.has(n)) return null;
      return validName(n.getAttribute('data-td-menu')) ? n : null;
    };
    const prime = (n) => {
      if (touched.has(n)) return;
      touched.set(n, new Map(SNAP.map((a) => [a, n.getAttribute(a)])));
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
      if (n instanceof HTMLElement && !bound.has(n) && validName(n.getAttribute('data-td-menu'))) prime(n);
    }
    const unbind = () => {
      if (boundRoots.get(root) !== unbind) return;
      boundRoots.delete(root);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
      root.removeEventListener('focusin', onPrime);
      root.removeEventListener('mouseover', onPrime);
      if (current && touched.has(current.anchor)) closeSession(current, 'api');
      for (const [n, before] of touched) {
        for (const [a, v] of before) {
          if (v === null) n.removeAttribute(a);
          else n.setAttribute(a, v);
        }
      }
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
