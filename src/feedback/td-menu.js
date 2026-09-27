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
  const ctx = { item: entry.src, anchor: s.anchor, checked: entry.checked };
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
      safeCall(entry.onSelect, { item: entry.src, anchor: s.anchor, checked: false });
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
   * @param {Array<object>|(() => Array<object>)} items item list or a lazy builder (called at open)
   * @param {{ align?: 'start'|'center'|'end', side?: 'bottom'|'top', label?: string, focus?: 'first'|'last',
   *           onClose?: (reason: string) => void }} [opts]
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
    if (current) closeSession(current, 'api'); // a new anchor always closes the old menu, even if its items are empty
    let list = items;
    if (isFn(list)) {
      try { list = list(); } catch (err) { console.error('TdMenu items', err); return null; }
    }
    const entries = normalise(list);
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
   * @param {Array<object>|(() => Array<object>)} items
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
