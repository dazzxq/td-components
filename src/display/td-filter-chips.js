import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { normalizeItems, cleanHref, fill } from '../utils/filter-chips-model.js';

const SSR_NAME = 'filter-chips';
const SSR_SCHEMA = 1;
/** Default texts — PHP Td::FILTER_CHIPS_LABELS prints these (the SSR gate also accepts them after a site override). */
const DEFAULTS = Object.freeze({
  group: 'Bộ lọc đang áp dụng',
  clearAll: 'Xoá tất cả',
  remove: 'Bỏ lọc {label}: {value}',
  removed: 'Đã bỏ lọc {label}: {value}',
  cleared: 'Đã xoá tất cả bộ lọc',
});
const CLEAR_CLASS = 'td-btn td-btn--ghost td-btn--sm td-filter-chips__clear';

/** @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs] */
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** The attribute names of `n` equal `want` (an object name → value; `null` value = any value, read by the caller). */
function attrsAre(n, want) {
  const names = n.getAttributeNames();
  if (names.length !== Object.keys(want).length) return false;
  return names.every((a) => Object.hasOwn(want, a) && (want[a] === null || n.getAttribute(a) === want[a]));
}

/** Element children of `n`; null when a non-element child is anything but whitespace text. */
function elementKids(n) {
  for (const c of n.childNodes) {
    if (c.nodeType === 1) continue;
    if (c.nodeType === 3 && !/\S/.test(c.data)) continue;
    return null;
  }
  return [...n.children];
}

/** Text of a leaf span: only text children allowed (else null). */
function leafText(n) {
  for (const c of n.childNodes) if (c.nodeType !== 3) return null;
  return n.textContent;
}

/**
 * Active filter chips — v0.39.0 (plan v0.39.0-filters-range QĐ 11–16). Token-native: td.css
 * (`components/filter-chips.css`). Light DOM, built with DOM APIs (every chip string is TEXT — no innerHTML).
 *
 * Markup (= PHP `td_filter_chips()`, SSR contract `filter-chips@1`, hydrated IN PLACE):
 * `div.td-filter-chips[role=group][aria-label]` > `ul.td-filter-chips__list[role=list]` > per item
 * `li.td-filter-chips__item[data-id][data-key][data-removable]` > `span.td-filter-chips__label` +
 * `span.td-filter-chips__sep[aria-hidden]` (": ") + `span.td-filter-chips__value` (+ `title` = the value, set by JS) +
 * the × `a.td-filter-chips__remove[href][aria-label]` (item `href`) | `button.td-filter-chips__remove[type=button]
 * [data-td-js-only][aria-label]` (none when `removable: false`) holding `span.td-filter-chips__icon[data-td-icon=close]`;
 * then "Xoá tất cả" (≥ 2 removable chips) `a|button.td-btn.td-btn--ghost.td-btn--sm.td-filter-chips__clear`; then
 * `p.td-sr-only[role=status]`. No items → the host is `hidden` (unless it holds focus).
 *
 * Uncontrolled by default (ADR 0004): × → `filter-remove` (CANCELABLE) → not prevented: the chip is removed (an `<a>`
 * × navigates instead — the server computed the URL without that filter); "Xoá tất cả" → `filter-clear` (cancelable)
 * → every removable chip removed (or navigates to `clear-href`). Assigning `items` is silent. The app listens, updates
 * its form and calls `table.setFilters()`.
 * Focus after a removal: the next chip's × → the previous one → "Xoá tất cả" → `#{empty-focus}` → the host
 * (tabindex -1). Announcements in the live region ("Đã bỏ lọc {label}: {value}" / "Đã xoá tất cả bộ lọc").
 * Narrow (container < 480px): one scrolling row, "Xoá tất cả" pinned after it (CSS; `data-scroll-start/end` on the
 * list mark the clipped edges).
 *
 * @element td-filter-chips
 * @attr {string} label - Name of the group (default `TdFilterChips.labels.group` = "Bộ lọc đang áp dụng")
 * @attr {string} clear-href - "Xoá tất cả" is a link to this URL (safe link policy; else a button)
 * @attr {string} empty-focus - id of the element focused when the last removable chip is removed (e.g. the search box)
 * @property {Array<{id?, key, label?, value, removable?, href?}>} items - key / value (/ label / id) strings or numbers;
 *   `id` defaults to `key` (a multi-value filter = several items with the same key); `href`: the URL without this
 *   filter (https, http on an http page, relative — anything else is ignored). Read back normalised (copies).
 * @fires filter-remove - `{ item, items }` (items = the list after the removal), cancelable
 * @fires filter-clear - `{ items, removed }` (items = what stays: the non-removable chips), cancelable
 */
export class TdFilterChips extends TdBaseElement {
  /** Site-overridable texts (`{label}` / `{value}` placeholders). */
  static labels = { ...DEFAULTS };

  static hydratable = true;

  static get observedAttributes() { return ['label', 'clear-href', 'empty-focus']; }

  constructor() {
    super();
    /** @type {Array<{id: string, key: string, label: string, value: string, removable: boolean, href?: string}>} */
    this._items = [];
    this._earlyItems = false;
    this._warned = new Set();
    this._ro = null;
    this._autoHidden = false;
    /** A removal is moving focus: the empty state waits for it (a hidden host cannot take focus). */
    this._holdEmpty = false;
    // Delegated listeners for the element's lifetime (survive re-renders and reconnects).
    this.addEventListener('click', (e) => this._onClick(e));
    this.addEventListener('focusout', (e) => this._onFocusOut(e));
    this.addEventListener('scroll', () => this._syncEdges(), { capture: true, passive: true });
  }

  connectedCallback() {
    // `items` assigned before the element was defined lives in an own data property: replay it through the setter
    if (Object.hasOwn(this, 'items')) {
      const v = this.items;
      delete this.items;
      this.items = v;
    }
    super.connectedCallback();
    if (typeof ResizeObserver !== 'undefined' && !this._ro) {
      this._ro = new ResizeObserver(() => this._syncEdges());
      if (this._list) this._ro.observe(this._list);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
  }

  // --- items ---

  get items() { return this._items.map((i) => ({ ...i })); }
  set items(v) {
    const r = normalizeItems(v);
    if (r.dropped) this._warnOnce('td-filter-chips: an item was dropped — key / value (/ label / id) must be strings or numbers; one item per value of a multi-value filter.');
    if (r.renamed) this._warnOnce('td-filter-chips: duplicate item id — renamed with a -2, -3 … suffix (give every item its own id).');
    this._items = r.items;
    if (!this._initialized) {
      this._earlyItems = true;
      return;
    }
    if (this._list) this._renderList();
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  // --- attributes ---

  _groupLabel() { return (this.getAttribute('label') || '').trim() || TdFilterChips.labels.group || DEFAULTS.group; }
  _clearHref() { return cleanHref(this.getAttribute('clear-href')); }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._root) return;
    if (name === 'label') this._root.setAttribute('aria-label', this._groupLabel());
    else if (name === 'clear-href') this._syncClear();
  }

  // --- render (DOM APIs only) ---

  _doRender() {
    if (this._suppressRender) return;
    const group = el('div', 'td-filter-chips', { role: 'group', 'aria-label': this._groupLabel() });
    group.appendChild(el('ul', 'td-filter-chips__list', { role: 'list' }));
    this.replaceChildren(group, el('p', 'td-sr-only', { role: 'status' }));
    this._refs();
    this._renderList();
    this._bindStep();
  }

  /** @private */
  _refs() {
    this._root = this.querySelector(':scope > .td-filter-chips');
    this._list = this._root.querySelector(':scope > .td-filter-chips__list');
    this._status = this.querySelector(':scope > [role="status"]');
    if (this._ro) {
      this._ro.disconnect();
      this._ro.observe(this._list);
    }
  }

  /** @private The aria-label of an item's ×. */
  _removeName(it, template = TdFilterChips.labels.remove) {
    return fill(template, { label: it.label, value: it.value });
  }

  /** @private One chip (text only). */
  _chip(it) {
    const li = el('li', 'td-filter-chips__item', { 'data-id': it.id, 'data-key': it.key, 'data-removable': String(it.removable) });
    const label = el('span', 'td-filter-chips__label');
    label.textContent = it.label;
    const sep = el('span', 'td-filter-chips__sep', { 'aria-hidden': 'true' });
    sep.textContent = ': ';
    const value = el('span', 'td-filter-chips__value');
    value.textContent = it.value;
    li.append(label, sep, value);
    if (it.removable) {
      const x = it.href
        ? el('a', 'td-filter-chips__remove', { href: it.href })
        : el('button', 'td-filter-chips__remove', { type: 'button', 'data-td-js-only': '' });
      x.setAttribute('aria-label', this._removeName(it));
      x.appendChild(el('span', 'td-filter-chips__icon', { 'data-td-icon': 'close', 'data-td-icon-size': '14', 'aria-hidden': 'true' }));
      li.appendChild(x);
    }
    return li;
  }

  /** @private Rebuild the chips + "Xoá tất cả" (the group, list and live region are kept). */
  _renderList() {
    this._list.replaceChildren(...this._items.map((it) => this._chip(it)));
    this._syncClear();
    this.afterRender();
  }

  /** @private "Xoá tất cả" present iff ≥ 2 removable chips; a link when `clear-href` is safe. */
  _syncClear() {
    const want = this._items.filter((i) => i.removable).length >= 2;
    const href = this._clearHref();
    let btn = this._root.querySelector(':scope > .td-filter-chips__clear');
    const kind = href ? 'a' : 'button';
    if (btn && (!want || btn.localName !== kind || (href && btn.getAttribute('href') !== href))) {
      btn.remove();
      btn = null;
    }
    if (!want || btn) return;
    btn = href ? el('a', CLEAR_CLASS, { href }) : el('button', CLEAR_CLASS, { type: 'button', 'data-td-js-only': '' });
    btn.textContent = TdFilterChips.labels.clearAll || DEFAULTS.clearAll;
    this._root.appendChild(btn);
  }

  /** Icons, value titles, scroll edges, empty state — idempotent (render, hydrate, re-bind). */
  afterRender() {
    if (!this._list) return;
    fillIconSlots(this._list, '.td-filter-chips__icon[data-td-icon]');
    for (const v of this._list.querySelectorAll(':scope > li > .td-filter-chips__value')) {
      if (v.getAttribute('title') !== v.textContent) v.setAttribute('title', v.textContent);
    }
    this._syncEmpty();
    this._syncEdges();
  }

  /** @private No items → host `hidden` (only the `hidden` this component set is ever removed), unless it holds focus. */
  _syncEmpty() {
    if (this._holdEmpty) return;
    if (!this._items.length) {
      if (this.contains(document.activeElement)) return;
      if (!this.hidden) {
        this.hidden = true;
        this._autoHidden = true;
      }
      this.removeAttribute('tabindex');
    } else if (this._autoHidden) {
      this.hidden = false;
      this._autoHidden = false;
    }
  }

  /** @private `data-scroll-start` / `data-scroll-end` on the list: content clipped before / after (edge fade). */
  _syncEdges() {
    const list = this._list;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    const pos = Math.abs(list.scrollLeft);
    const start = max > 1 && pos > 1;
    const end = max > 1 && pos < max - 1;
    if (list.hasAttribute('data-scroll-start') !== start) list.toggleAttribute('data-scroll-start', start);
    if (list.hasAttribute('data-scroll-end') !== end) list.toggleAttribute('data-scroll-end', end);
  }

  _onFocusOut(e) {
    if (this._items.length) return;
    const to = e.relatedTarget;
    if (to instanceof Node && this.contains(to)) return;
    queueMicrotask(() => { if (!this.contains(document.activeElement)) this._syncEmpty(); });
  }

  // --- removing ---

  /** @private A cancelable event (emit() is not cancelable); true when NOT prevented. */
  _dispatch(name, detail) {
    return this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, cancelable: true, detail }));
  }

  _onClick(e) {
    const t = e.target instanceof Element ? e.target.closest('.td-filter-chips__remove, .td-filter-chips__clear') : null;
    if (!t || !this._root || !this._root.contains(t)) return;
    const hadFocus = this.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement;
    const before = this._items;
    // the empty state waits until focus has moved (a listener may assign `items` — a hidden host cannot take focus)
    this._holdEmpty = true;
    try {
      if (t.classList.contains('td-filter-chips__clear')) {
        const removed = before.filter((i) => i.removable);
        const stay = before.filter((i) => !i.removable);
        if (!this._dispatch('filter-clear', { items: stay.map((i) => ({ ...i })), removed: removed.map((i) => ({ ...i })) })) {
          e.preventDefault();
          return;
        }
        if (t.localName === 'a') return; // the browser follows clear-href
        if (this._items === before) { // a listener that assigned `items` itself wins
          this._items = stay;
          this._renderList();
        }
        this._announce(TdFilterChips.labels.cleared || DEFAULTS.cleared);
        if (hadFocus) this._focusAfter(null);
        return;
      }
      const li = t.closest('li');
      const idx = [...this._list.children].indexOf(li);
      const item = before[idx];
      if (!item) return;
      const after = before.filter((_, i) => i !== idx);
      if (!this._dispatch('filter-remove', { item: { ...item }, items: after.map((i) => ({ ...i })) })) {
        e.preventDefault();
        return;
      }
      if (t.localName === 'a') return; // the browser follows the link (the server computed the URL without this filter)
      const ri = before.slice(0, idx).filter((i) => i.removable).length; // removable index of the removed chip
      if (this._items === before) {
        this._items = after;
        li.remove();
        this._syncClear();
        this.afterRender();
      }
      this._announce(fill(TdFilterChips.labels.removed || DEFAULTS.removed, { label: item.label, value: item.value }));
      if (hadFocus) this._focusAfter(ri);
    } finally {
      this._holdEmpty = false;
      this._syncEmpty();
    }
  }

  /**
   * @private QĐ 14: the × of the next removable chip (`ri` = the removed one's index among the removable chips), else
   * the previous one, else "Xoá tất cả", else `#{empty-focus}`, else the host (tabindex -1).
   */
  _focusAfter(ri) {
    const xs = [...this._list.querySelectorAll(':scope > li > .td-filter-chips__remove')];
    const target = (ri !== null && (xs[ri] || xs[ri - 1])) || this._root.querySelector(':scope > .td-filter-chips__clear')
      || this._emptyFocus();
    if (target) {
      target.focus();
      if (document.activeElement === target) return;
    }
    this.setAttribute('tabindex', '-1');
    this.focus();
  }

  /** @private The `empty-focus` element (by id), when focusable and outside this element. */
  _emptyFocus() {
    const id = (this.getAttribute('empty-focus') || '').trim();
    const n = id ? this.ownerDocument.getElementById(id) : null;
    return n instanceof HTMLElement && !this.contains(n) ? n : null;
  }

  /** @private One live-region update; the same text again is re-announced (cleared first). */
  _announce(text) {
    const s = this._status;
    if (!s) return;
    if (s.textContent === text) s.textContent = '';
    queueMicrotask(() => { s.textContent = text; });
  }

  // --- SSR (ADR 0012, contract filter-chips@1, plan QĐ 16) ---

  /**
   * Marker `filter-chips@1` + the markup EXACTLY as `td_filter_chips()` prints it → adopt in place (items read back
   * field by field). Items assigned early win (render from them). Any mismatch → not adopted: render from early items,
   * else EMPTY + one warning (safer than guessing).
   */
  canHydrate() {
    if (!this._ssrMatches(SSR_NAME, SSR_SCHEMA)) return false;
    if (this._earlyItems) return false;
    const items = this._readMarkup();
    if (!items) {
      this._warnOnce('td-filter-chips: server markup does not match filter-chips@1 — not adopted (rendered empty).');
      this._items = [];
      return false;
    }
    this._items = items;
    return true;
  }

  hydrateExisting() {
    this._refs();
    if (!this._items.length && this.hidden) this._autoHidden = true;
  }

  /** Re-connect: render again from `items` (nothing else is state). */
  canRebind() { return false; }

  /** @private The items of the server markup, or null when it is not exactly the contract. */
  _readMarkup() {
    const L = TdFilterChips.labels;
    const groups = new Set([this._groupLabel(), (this.getAttribute('label') || '').trim() || DEFAULTS.group]);
    const kids = elementKids(this);
    if (!kids || kids.length !== 2) return null;
    const [group, status] = kids;
    if (status.localName !== 'p' || !attrsAre(status, { class: 'td-sr-only', role: 'status' }) || status.childNodes.length) return null;
    if (group.localName !== 'div' || !attrsAre(group, { class: 'td-filter-chips', role: 'group', 'aria-label': null })
      || !groups.has(group.getAttribute('aria-label'))) return null;
    const gk = elementKids(group);
    if (!gk || gk.length < 1 || gk.length > 2) return null;
    const [list, clear] = gk;
    if (list.localName !== 'ul' || !attrsAre(list, { class: 'td-filter-chips__list', role: 'list' })) return null;
    const lis = elementKids(list);
    if (!lis) return null;
    const raw = [];
    for (const li of lis) {
      const it = this._readChip(li, L);
      if (!it) return null;
      raw.push(it);
    }
    // the clear control: present iff ≥ 2 removable; a link to the (safe) clear-href, else the JS-only button
    const removable = raw.filter((i) => i.removable).length;
    if ((removable >= 2) !== !!clear) return null;
    if (clear) {
      const href = this._clearHref();
      const texts = new Set([L.clearAll, DEFAULTS.clearAll]);
      if (leafText(clear) === null || !texts.has(clear.textContent)) return null;
      if (href) {
        if (clear.localName !== 'a' || !attrsAre(clear, { class: CLEAR_CLASS, href })) return null;
      } else if (clear.localName !== 'button' || !attrsAre(clear, { class: CLEAR_CLASS, type: 'button', 'data-td-js-only': '' })) {
        return null;
      }
    }
    // the markup must already be normalised (types, lengths, unique ids, safe hrefs) — else it was not printed by PHP
    const norm = normalizeItems(raw);
    if (norm.dropped || norm.renamed || norm.items.length !== raw.length) return null;
    const same = norm.items.every((n, i) => ['id', 'key', 'label', 'value', 'removable', 'href'].every((k) => n[k] === raw[i][k]));
    return same ? norm.items : null;
  }

  /** @private One server `li`, or null. */
  _readChip(li, L) {
    if (li.localName !== 'li' || !attrsAre(li, { class: 'td-filter-chips__item', 'data-id': null, 'data-key': null, 'data-removable': null })) return null;
    const rem = li.getAttribute('data-removable');
    if (rem !== 'true' && rem !== 'false') return null;
    const removable = rem === 'true';
    const kids = elementKids(li);
    if (!kids || kids.length !== (removable ? 4 : 3)) return null;
    const [label, sep, value, x] = kids;
    if (label.localName !== 'span' || !attrsAre(label, { class: 'td-filter-chips__label' }) || leafText(label) === null) return null;
    if (sep.localName !== 'span' || !attrsAre(sep, { class: 'td-filter-chips__sep', 'aria-hidden': 'true' }) || leafText(sep) !== ': ') return null;
    if (value.localName !== 'span' || !attrsAre(value, { class: 'td-filter-chips__value' }) || leafText(value) === null) return null;
    const it = { id: li.getAttribute('data-id'), key: li.getAttribute('data-key'), label: label.textContent, value: value.textContent, removable };
    if (!removable) return it;
    const names = new Set([this._removeName(it), this._removeName(it, DEFAULTS.remove)]);
    if (x.localName === 'a') {
      if (!attrsAre(x, { class: 'td-filter-chips__remove', href: null, 'aria-label': null })) return null;
      const href = x.getAttribute('href');
      if (!href || cleanHref(href) !== href) return null;
      it.href = href;
    } else if (x.localName !== 'button' || !attrsAre(x, { class: 'td-filter-chips__remove', type: 'button', 'data-td-js-only': '', 'aria-label': null })) {
      return null;
    }
    if (!names.has(x.getAttribute('aria-label'))) return null;
    const ik = elementKids(x);
    if (!ik || ik.length !== 1) return null;
    const icon = ik[0];
    if (icon.localName !== 'span' || !attrsAre(icon, { class: 'td-filter-chips__icon', 'data-td-icon': 'close', 'data-td-icon-size': '14', 'aria-hidden': 'true' })) return null;
    for (const c of icon.children) if (c.localName !== 'svg') return null; // replaced by the registry icon anyway
    return it;
  }
}

if (!customElements.get('td-filter-chips')) {
  customElements.define('td-filter-chips', TdFilterChips);
}
