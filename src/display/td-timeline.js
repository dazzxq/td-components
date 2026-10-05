import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon, resolveIconName } from '../icons/td-icon.js';
import {
  normalizeItems, sortItems, groupItems, dayLabel, timeText, lastKnown, mergeAppend, isoOf, Generation,
  TIMELINE_LABELS, MAX_ITEMS, MAX_TOTAL,
} from '../utils/timeline-model.js';
import { isTimeZone } from '../utils/datetime.js';
import { cleanHref, fill } from '../utils/filter-chips-model.js';
import { sameChildren } from '../utils/ssr-tree.js';

const SSR_NAME = 'timeline';
const SSR_SCHEMA = 1;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MORE_CLASS = 'td-btn td-btn--secondary td-timeline__more';
/** Review SEC-04: at most this many renderDetails calls run at once; the rest wait FIFO in display order. */
export const DETAIL_CONCURRENCY = 6;
const BAD_TZ = 'td-timeline: time-zone is not an IANA zone name this browser knows — the browser zone is used.';

/** @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs] */
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function text(tag, cls, value, attrs) {
  const n = el(tag, cls, attrs);
  n.textContent = value;
  return n;
}

/** Text of a leaf (text children only), else null. */
function leafText(n) {
  if (!n) return null;
  for (const c of n.childNodes) if (c.nodeType !== 3) return null;
  return n.textContent;
}

/** Element children; null when another child is anything but whitespace text. */
function elementKids(n) {
  for (const c of n.childNodes) {
    if (c.nodeType === 1 || (c.nodeType === 3 && !/\S/.test(c.data))) continue;
    return null;
  }
  return [...n.children];
}

/** The shared td-btn spinner (hidden until busy) — same markup as <td-button>. */
function spinner() {
  const s = el('span', 'td-btn__spinner td-spinner td-spinner--sm', { 'aria-hidden': 'true', hidden: '' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of [['class', 'td-spinner__svg'], ['viewBox', '0 0 50 50'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(k, v);
  for (const cls of ['td-spinner__track', 'td-spinner__arc']) {
    const c = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of [['class', cls], ['cx', '25'], ['cy', '25'], ['r', '20']]) c.setAttribute(k, v);
    svg.appendChild(c);
  }
  s.appendChild(svg);
  return s;
}

/**
 * Event timeline — v0.45.0 (plan v0.45.0-steps-timeline QĐ G1–G4, T1–T11, C1–C3). Token-native: td.css
 * (`components/timeline.css`). Light DOM, built with DOM APIs (every field is TEXT; rich details only as a Node from
 * the `renderDetails` hook). Times must be INSTANTS (Date, epoch, ISO with Z / offset); zone-less strings go to the last
 * group "Không rõ thời gian" (+ one warning) — never guessed. Days are computed in `time-zone` (IANA).
 *
 * Markup (= PHP `td_timeline()`, SSR contract `timeline@1`, hydrated IN PLACE):
 * `div.td-timeline` > per group `div.td-timeline__day[data-day]` (`yyyy-mm-dd` | `all` (group="none", no heading) |
 * `unknown`, always last) > `h{n}.td-timeline__day-title` > `time.td-timeline__day-label[datetime]` (unknown:
 * `span.td-timeline__day-label`) + `ol.td-timeline__list[role=list]` > `li.td-timeline__item[data-id][data-tone]` >
 * `span.td-timeline__marker[aria-hidden]` (+ `span.td-timeline__icon[data-td-icon]`) + `div.td-timeline__body` >
 * `p.td-timeline__head` (`span|a.td-timeline__title` + `span|a.td-timeline__actor` + `time.td-timeline__time[datetime]`)
 * + `p.td-timeline__meta` + `details.td-timeline__details` (`summary.td-timeline__summary` + `div.td-timeline__detail`).
 * Empty: `p.td-timeline__empty`. Then `div.td-timeline__footer` > "Xem thêm" (`a[href=more-href]` | button) and the
 * live region `p.td-sr-only[role=status]`.
 *
 * @element td-timeline
 * @attr {string} order - desc (default, newest first) | asc
 * @attr {string} group - day (default) | none
 * @attr {string} time-zone - IANA zone of the day groups and times (default: the browser's)
 * @attr {number} heading-level - 2–6 (default 3)
 * @attr {boolean} has-more - a "Xem thêm" control (needs `loadMore` or `more-href`)
 * @attr {string} more-href - URL of the next page (works without JS; with `loadMore` the click loads in place)
 * @attr {boolean} loading - initial load: skeleton rows while there is no item, `aria-busy` on the host
 * @attr {string} empty-text - text when there is no item (default "Chưa có hoạt động nào")
 * @property {Array<object>} items - `{ id?, time, title, href?, actor?, meta?, icon?, tone?, details?, expanded? }`;
 *   read back normalised (copies, `time` as ISO UTC or null)
 * @property {(opts: {signal: AbortSignal, last: object|null}) => Promise<{items: object[], hasMore?: boolean}>} loadMore
 * @property {(item: object, opts: {signal: AbortSignal}) => Node|string|Promise<Node|string>} renderDetails - lazy
 *   details (`details: true`)
 * @property {Date|number} now - "today" for the day labels (tests / SSR parity; default: the clock at each render)
 * @fires item-toggle - `{ id, open }` (a details panel opened / closed by the user)
 * @fires load-more-error - `{ kind: 'rejected' }` (never the raw error — review SEC-03; wrap loadMore to keep it)
 */
export class TdTimeline extends TdBaseElement {
  /** Site-overridable texts. */
  static labels = { ...TIMELINE_LABELS, weekdays: [...TIMELINE_LABELS.weekdays] };

  static hydratable = true;

  static get observedAttributes() {
    return ['order', 'group', 'time-zone', 'heading-level', 'has-more', 'more-href', 'loading', 'empty-text'];
  }

  static get booleanAttributes() { return ['has-more', 'loading']; }

  constructor() {
    super();
    /** @type {object[]} normalised items in display order */
    this._items = [];
    this._earlyItems = false;
    this._warned = new Set();
    this._unknownIcons = new Set();
    this._gen = new Generation();
    this._now = null;
    this._loadMore = null;
    this._renderDetails = null;
    /** @type {AbortController|null} */
    this._moreCtl = null;
    /** @type {Map<string, AbortController>} */
    this._detailCtl = new Map();
    /** @type {Array<{ d: HTMLDetailsElement, id: string }>} lazy details waiting for a free slot (SEC-04) */
    this._detailQueue = [];
    /** SEC-04 (review round 3): renderDetails calls not settled yet — an aborted call keeps its slot until it settles */
    this._detailActive = 0;
    /** @type {Map<string, Node|string>} */
    this._detailCache = new Map();
    /** Review SEC-02: the MAX_TOTAL cap was reached — no more "Xem thêm". */
    this._full = false;
    /** @type {WeakMap<HTMLDetailsElement, boolean>} last known open state (the initial `open` fires no item-toggle) */
    this._openState = new WeakMap();
    this.addEventListener('click', (e) => this._onClick(e));
    this.addEventListener('toggle', (e) => this._onToggle(e), true); // toggle does not bubble
  }

  connectedCallback() {
    for (const p of ['items', 'loadMore', 'renderDetails', 'now']) {
      if (Object.hasOwn(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
    super.connectedCallback();
    this._checkMoreSoon();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._gen.next(); // pending lazy details / pages are dropped
    this._abortAll();
  }

  // --- properties ---

  get items() {
    return this._items.map((it) => {
      const o = { ...it, time: it.time === null ? null : isoOf(it.time) };
      if (it.actor) o.actor = { ...it.actor };
      return o;
    });
  }

  set items(v) {
    const r = normalizeItems(v);
    this._reportNormalise(r);
    this._items = sortItems(r.items, this._order());
    this._full = false;
    this._gen.next();
    this._abortAll();
    this._detailCache.clear();
    if (!this._initialized) {
      this._earlyItems = true;
      return;
    }
    this._doRender();
  }

  get loadMore() { return this._loadMore; }
  set loadMore(fn) {
    const next = typeof fn === 'function' ? fn : null;
    if (next === this._loadMore) return;
    this._loadMore = next;
    // review SEC-01: a page requested through the previous hook never lands
    if (this._moreCtl) {
      this._moreCtl.abort();
      this._moreCtl = null;
      const btn = this.querySelector(':scope > .td-timeline__footer > .td-timeline__more');
      btn?.removeAttribute('aria-busy');
      btn?.querySelector('.td-btn__spinner')?.setAttribute('hidden', '');
    }
    if (this._root) this._syncMore();
  }

  get renderDetails() { return this._renderDetails; }
  set renderDetails(fn) {
    const next = typeof fn === 'function' ? fn : null;
    if (next === this._renderDetails) return;
    const had = !!this._renderDetails;
    this._renderDetails = next;
    // review SEC-01: nothing produced by the previous renderer survives (pending results, cache, shown content)
    this._abortDetails();
    this._detailCache.clear();
    if (!this._root || !this._items.some((i) => i.details === true)) return;
    if (had !== !!next) {
      this._renderBox(); // the "Chi tiết" summaries appear / disappear
      return;
    }
    for (const d of this._box.querySelectorAll('details.td-timeline__details')) {
      const it = this._items.find((i) => i.id === d.closest('li.td-timeline__item')?.getAttribute('data-id'));
      if (it && it.details === true) d.querySelector(':scope > .td-timeline__detail')?.replaceChildren();
    }
    this._loadOpenLazy(this._box); // open ones reload with the new renderer; closed ones load on open
  }

  get now() { return this._now === null ? null : new Date(this._now); }
  set now(v) {
    const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : NaN;
    this._now = Number.isFinite(ms) ? ms : null;
    if (this._root) this._syncDayLabels();
  }

  /**
   * Add items (realtime, a page the app loaded itself): the same rules as "Xem thêm" — ids already shown are dropped,
   * the rest placed by time (unknown-time items at the end of their group), existing nodes kept.
   * @returns {number} how many items were added
   */
  append(items) {
    return this._appendItems(items).length;
  }

  // --- helpers ---

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  _reportNormalise(r) {
    if (r.dropped) this._warnOnce('td-timeline: an item was dropped — every item needs a non-empty text `title`.');
    if (r.capped) this._warnOnce(`td-timeline: too many items in one assignment — at most ${MAX_ITEMS} are kept.`);
    if (r.renamed) this._warnOnce('td-timeline: duplicate item id — renamed with a -2, -3 … suffix.');
    if (r.untimed) {
      console.warn(`td-timeline: ${r.untimed} item(s) without a valid instant — shown under "Không rõ thời gian". `
        + 'A time must be a Date, an epoch or an ISO 8601 string WITH Z / an offset (2026-10-05T07:00:00Z).');
    }
  }

  _order() { return this.getAttribute('order') === 'asc' ? 'asc' : 'desc'; }
  _group() { return this.getAttribute('group') === 'none' ? 'none' : 'day'; }
  _level() {
    const n = Number(this.getAttribute('heading-level'));
    return Number.isInteger(n) && n >= 2 && n <= 6 ? n : 3;
  }

  /** QĐ T4: the valid `time-zone`, else '' (the browser zone; an invalid name warns once). */
  _tz() {
    const tz = this.getAttribute('time-zone');
    if (tz === null) return '';
    if (isTimeZone(tz)) return tz;
    this._warnOnce(BAD_TZ);
    return '';
  }

  _nowMs() { return this._now ?? Date.now(); }
  _moreHref() { return cleanHref(this.getAttribute('more-href')); }

  _abortAll() {
    this._moreCtl?.abort();
    this._moreCtl = null;
    this._abortDetails();
  }

  /** @private Abort + forget every pending lazy detail (its node is about to be replaced or its renderer changed). */
  _abortDetails() {
    for (const c of this._detailCtl.values()) c.abort();
    this._detailCtl.clear();
    this._detailQueue.length = 0; // SEC-04: the queue goes with them
  }

  /** @private A copy of an item for the hooks (time as ISO). */
  _copy(it) {
    const o = { ...it, time: it.time === null ? null : isoOf(it.time) };
    if (it.actor) o.actor = { ...it.actor };
    return o;
  }

  // --- attributes ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._root) return;
    if (name === 'has-more' || name === 'more-href') {
      this._syncMore();
      this._checkMoreSoon();
    } else if (name === 'loading') {
      this._syncBusy();
      if (!this._items.length) this._renderBox();
    } else if (name === 'empty-text') {
      const p = this._box.querySelector(':scope > .td-timeline__empty');
      if (p) p.textContent = this._emptyText(TdTimeline.labels);
    } else {
      if (name === 'order') this._items = sortItems(this._items, this._order());
      this._renderBox();
    }
  }

  // --- build (DOM APIs only) ---

  _emptyText(L) { return (this.getAttribute('empty-text') || '').trim() || L.empty || TIMELINE_LABELS.empty; }

  /**
   * @private The host children for the current model: [div.td-timeline, footer?, live region]. `ssr` = the PHP variant
   * (no JS-only "Xem thêm" button, no lazy details); `marks` collects icon slots / recomputed texts for the gate.
   */
  _tree(L, ssr = false, marks = null) {
    const box = this._boxEl(L, ssr, marks);
    const out = [box];
    const more = this._moreEl(L, ssr);
    if (more) {
      const f = el('div', 'td-timeline__footer');
      f.appendChild(more);
      out.push(f);
    }
    out.push(el('p', 'td-sr-only', { role: 'status' }));
    return out;
  }

  _boxEl(L, ssr, marks) {
    const box = el('div', 'td-timeline');
    if (!this._items.length) {
      if (this.hasAttribute('loading') && !ssr) box.appendChild(this._skeleton());
      else box.appendChild(text('p', 'td-timeline__empty', this._emptyText(L)));
      return box;
    }
    const tz = this._tz();
    for (const g of groupItems(this._items, this._group(), tz)) box.appendChild(this._groupEl(g, L, ssr, marks, tz));
    return box;
  }

  _skeleton() {
    const s = el('div', 'td-timeline__skeleton', { 'aria-hidden': 'true' });
    for (let i = 0; i < 3; i++) {
      const row = el('div', 'td-timeline__skeleton-row');
      row.append(el('div', 'td-skeleton td-skeleton--circle'), el('div', 'td-skeleton td-skeleton--text td-skeleton--lines-2'));
      s.appendChild(row);
    }
    return s;
  }

  _groupEl(g, L, ssr, marks, tz) {
    const div = el('div', 'td-timeline__day', { 'data-day': g.key });
    if (g.key !== 'all') {
      const h = el(`h${this._level()}`, 'td-timeline__day-title');
      if (g.key === 'unknown') h.appendChild(text('span', 'td-timeline__day-label', L.unknownDay ?? TIMELINE_LABELS.unknownDay));
      else {
        const t = text('time', 'td-timeline__day-label', dayLabel(g.key, tz, this._nowMs(), L), { datetime: g.key });
        marks?.wild.add(t);
        h.appendChild(t);
      }
      div.appendChild(h);
    }
    const ol = el('ol', 'td-timeline__list', { role: 'list' });
    for (const it of g.items) ol.appendChild(this._itemEl(it, L, ssr, marks, tz));
    div.appendChild(ol);
    return div;
  }

  _itemEl(it, L, ssr, marks, tz) {
    const li = el('li', 'td-timeline__item', { 'data-id': it.id, 'data-tone': it.tone });
    const marker = el('span', 'td-timeline__marker', { 'aria-hidden': 'true' });
    if (it.icon) {
      const slot = el('span', 'td-timeline__icon', { 'data-td-icon': it.icon });
      marks?.icons.set(slot, resolveIconName(it.icon) === null ? null : tdIcon(it.icon, { size: 's' }));
      marker.appendChild(slot);
    }
    const body = el('div', 'td-timeline__body');
    const head = el('p', 'td-timeline__head');
    head.appendChild(it.href ? text('a', 'td-timeline__title', it.title, { href: it.href }) : text('span', 'td-timeline__title', it.title));
    if (it.actor) {
      head.appendChild(it.actor.href
        ? text('a', 'td-timeline__actor', it.actor.name, { href: it.actor.href })
        : text('span', 'td-timeline__actor', it.actor.name));
    }
    if (it.time !== null) head.appendChild(text('time', 'td-timeline__time', timeText(it.time, tz, this._group()), { datetime: isoOf(it.time) }));
    body.appendChild(head);
    if (it.meta) body.appendChild(text('p', 'td-timeline__meta', it.meta));
    const lazy = it.details === true;
    if (lazy && !this._renderDetails && !ssr) {
      this._warnOnce('td-timeline: `details: true` needs the `renderDetails` property — the details are not shown.');
    }
    if ((typeof it.details === 'string') || (lazy && this._renderDetails && !ssr)) {
      const d = el('details', 'td-timeline__details');
      if (it.expanded) d.setAttribute('open', '');
      const sum = el('summary', 'td-timeline__summary');
      const inner = el('span', 'td-timeline__summary-inner');
      const chev = el('span', 'td-timeline__chevron', { 'data-td-icon': 'down', 'aria-hidden': 'true' });
      marks?.icons.set(chev, tdIcon('down', { size: 's' }));
      inner.append(text('span', 'td-timeline__summary-text', L.details ?? TIMELINE_LABELS.details), chev);
      sum.appendChild(inner);
      const box = el('div', 'td-timeline__detail');
      if (!lazy) box.textContent = it.details;
      d.append(sum, box);
      this._openState.set(d, !!it.expanded);
      body.appendChild(d);
    }
    li.append(marker, body);
    return li;
  }

  /** @private "Xem thêm": a link to `more-href` (no JS needed) or, with `loadMore`, a button (not printed by PHP). */
  _moreEl(L, ssr) {
    if (!this.hasAttribute('has-more') || (this._full && !ssr) || (this.hasAttribute('loading') && !this._items.length && !ssr)) return null;
    const href = this._moreHref();
    let c;
    if (href) c = el('a', MORE_CLASS, { href });
    else if (this._loadMore && !ssr) c = el('button', MORE_CLASS, { type: 'button' });
    else return null;
    c.append(text('span', 'td-btn__label', L.more ?? TIMELINE_LABELS.more), spinner());
    return c;
  }

  _doRender() {
    if (this._suppressRender) return;
    this._abortDetails(); // review ISSUE-2: the old nodes go — their pending loads too
    const marks = { wild: new WeakSet(), icons: new WeakMap() };
    this.replaceChildren(...this._tree(TdTimeline.labels, false, marks));
    this._refs();
    this._bindStep();
  }

  /** @private Re-render the groups only (footer + live region kept). */
  _renderBox() {
    this._abortDetails(); // review ISSUE-2: a pending detail of a replaced node would block its fresh load
    const box = this._boxEl(TdTimeline.labels, false, null);
    this._box.replaceWith(box);
    this._box = box;
    this._root = box;
    this._fillIcons(box);
    this._syncMore();
    this._loadOpenLazy(box);
  }

  _refs() {
    this._root = this.querySelector(':scope > .td-timeline');
    this._box = this._root;
    this._status = this.querySelector(':scope > p.td-sr-only[role="status"]');
  }

  afterRender() {
    if (!this._root) return;
    this._fillIcons(this);
    this._syncDayLabels();
    this._syncBusy();
    this._syncMore();
    this._loadOpenLazy(this._box);
  }

  /** @private Lazy details rendered open (`expanded: true`) load at once (no toggle event will ask for them). */
  _loadOpenLazy(root) {
    if (!this._renderDetails) return;
    for (const d of root.querySelectorAll('details.td-timeline__details[open]')) {
      const id = d.closest('li.td-timeline__item')?.getAttribute('data-id');
      const it = this._items.find((i) => i.id === id);
      if (it && it.details === true) this._loadDetails(d, it);
    }
  }

  /** @private Registry icons into the slots under `root`; an unknown name leaves an empty slot (a dot) + one warning. */
  _fillIcons(root) {
    for (const slot of root.querySelectorAll('.td-timeline__icon[data-td-icon], .td-timeline__chevron[data-td-icon]')) {
      const name = slot.getAttribute('data-td-icon');
      if (resolveIconName(name) === null) {
        slot.replaceChildren();
        if (!this._unknownIcons.has(name)) { // once per name; the message never repeats caller data (review SEC-03)
          this._unknownIcons.add(name);
          console.warn('td-timeline: unknown icon — a plain dot is shown (register it with registerIcons()).');
        }
        continue;
      }
      slot.replaceChildren(tdIcon(name, { size: 's' }));
    }
  }

  /** @private QĐ T5: day labels recomputed from their `datetime` (a page cached over midnight: "Hôm nay" → "Hôm qua"). */
  _syncDayLabels() {
    const tz = this._tz();
    const now = this._nowMs();
    for (const t of this.querySelectorAll(':scope > .td-timeline > .td-timeline__day > .td-timeline__day-title > time.td-timeline__day-label')) {
      const want = dayLabel(t.getAttribute('datetime'), tz, now, TdTimeline.labels);
      if (t.textContent !== want) t.textContent = want;
    }
  }

  _syncBusy() {
    if (this.hasAttribute('loading')) this.setAttribute('aria-busy', 'true');
    else if (this.getAttribute('aria-busy') === 'true' && !this._moreCtl) this.removeAttribute('aria-busy');
  }

  /** @private The footer control matches has-more / more-href / loadMore (kept while it is busy). */
  _syncMore() {
    if (!this._root) return;
    let footer = this.querySelector(':scope > .td-timeline__footer');
    const cur = footer?.firstElementChild || null;
    const want = this._moreEl(TdTimeline.labels, false);
    if (cur && want && cur.localName === want.localName && cur.getAttribute('href') === want.getAttribute('href')) return;
    if (cur && this._moreCtl && want) return; // a load is in flight: keep its control
    if (!want) {
      if (footer) {
        const hadFocus = footer.contains(document.activeElement);
        footer.remove();
        if (hadFocus) this._focusItem(this._lastLi());
      }
      return;
    }
    if (!footer) {
      footer = el('div', 'td-timeline__footer');
      this._status.before(footer);
    }
    footer.replaceChildren(want);
  }

  /** @private Has-more without any way to load → one warning (checked after the app had a chance to set loadMore). */
  _checkMoreSoon() {
    setTimeout(() => {
      if (this.isConnected && this.hasAttribute('has-more') && !this._loadMore && !this._moreHref()) {
        this._warnOnce('td-timeline: has-more needs the `loadMore` property or a `more-href` — no "Xem thêm" is shown.');
      }
    }, 0);
  }

  _announce(msg) {
    const s = this._status;
    if (!s) return;
    if (s.textContent === msg) s.textContent = '';
    queueMicrotask(() => { s.textContent = msg; });
  }

  _lastLi() {
    const all = this._box.querySelectorAll('li.td-timeline__item');
    return all[all.length - 1] || null;
  }

  _focusItem(li) {
    if (!li) {
      this.setAttribute('tabindex', '-1');
      this.focus();
      return;
    }
    li.setAttribute('tabindex', '-1');
    li.addEventListener('blur', () => li.removeAttribute('tabindex'), { once: true });
    li.focus();
  }

  // --- appending (QĐ T10) ---

  /** @private Normalise + merge a page; insert only the new nodes (existing ones keep their identity). */
  _appendItems(raw) {
    const r = normalizeItems(raw, { start: this._items.length });
    this._reportNormalise(r);
    const wasEmpty = !this._items.length;
    let { list, added } = mergeAppend(this._items, r.items, this._order());
    if (list.length > MAX_TOTAL) {
      // review SEC-02: keep everything shown + the new items that come first in display order, drop the rest
      const keep = new Set(sortItems(added, this._order()).slice(0, Math.max(0, MAX_TOTAL - this._items.length)).map((i) => i.id));
      added = added.filter((i) => keep.has(i.id));
      const shown = new Set(this._items);
      list = list.filter((i) => shown.has(i) || keep.has(i.id));
      this._warnOnce(`td-timeline: at most ${MAX_TOTAL} items in all — the rest of the page was dropped and "Xem thêm" is off.`);
      this._full = true;
    }
    this._items = list;
    if (this._full && this._root) this._syncMore();
    if (!added.length || !this._root) return added;
    if (wasEmpty) {
      this._renderBox();
      this._syncDayLabels();
      return added;
    }
    const L = TdTimeline.labels;
    const tz = this._tz();
    const fresh = new Set(added.map((i) => i.id));
    const groupEls = new Map([...this._box.querySelectorAll(':scope > .td-timeline__day')].map((g) => [g.getAttribute('data-day'), g]));
    let prevGroup = null;
    for (const g of groupItems(this._items, this._group(), tz)) {
      let gEl = groupEls.get(g.key);
      if (!gEl) {
        gEl = this._groupEl({ key: g.key, items: [] }, L, false, null, tz);
        if (prevGroup) prevGroup.after(gEl);
        else this._box.prepend(gEl);
      }
      prevGroup = gEl;
      const ol = gEl.querySelector(':scope > .td-timeline__list');
      const byId = new Map([...ol.children].map((li) => [li.getAttribute('data-id'), li]));
      let prev = null;
      for (const it of g.items) {
        let li = byId.get(it.id);
        if (!li && fresh.has(it.id)) {
          li = this._itemEl(it, L, false, null, tz);
          if (prev) prev.after(li);
          else ol.prepend(li);
          this._fillIcons(li);
          this._loadOpenLazy(li);
        }
        if (li) prev = li;
      }
    }
    this._syncDayLabels();
    return added;
  }

  // --- events ---

  _onClick(e) {
    const t = e.target instanceof Element ? e.target.closest('.td-timeline__more, .td-timeline__retry') : null;
    if (!t || !this.contains(t)) return;
    if (t.classList.contains('td-timeline__retry')) {
      const li = t.closest('li.td-timeline__item');
      const d = li?.querySelector('.td-timeline__details');
      const it = this._items.find((i) => i.id === li?.getAttribute('data-id'));
      if (d && it) this._loadDetails(d, it);
      return;
    }
    if (!this._loadMore) return; // a more-href link without loadMore: the browser follows it
    e.preventDefault();
    this._runMore(t);
  }

  async _runMore(btn) {
    if (this._moreCtl) return; // one request at a time
    const ctl = new AbortController();
    this._moreCtl = ctl;
    const gen = this._gen.value;
    const L = TdTimeline.labels;
    btn.setAttribute('aria-busy', 'true');
    btn.querySelector('.td-btn__spinner')?.removeAttribute('hidden');
    const last = lastKnown(this._items);
    const done = () => {
      btn.removeAttribute('aria-busy');
      btn.querySelector('.td-btn__spinner')?.setAttribute('hidden', '');
    };
    const hook = this._loadMore;
    let res;
    try {
      res = await hook({ signal: ctl.signal, last: last ? this._copy(last) : null });
    } catch {
      if (ctl.signal.aborted || !this._gen.isCurrent(gen) || this._loadMore !== hook) return;
      this._moreCtl = null;
      done();
      const label = btn.querySelector('.td-btn__label');
      if (label) label.textContent = L.moreError ?? TIMELINE_LABELS.moreError;
      this._announce(L.moreError ?? TIMELINE_LABELS.moreError);
      this.emit('load-more-error', { kind: 'rejected' }); // review SEC-03: the raw error stays with the app
      return;
    }
    if (ctl.signal.aborted || !this._gen.isCurrent(gen) || !this.isConnected || this._loadMore !== hook) return;
    this._moreCtl = null;
    done();
    const label = btn.querySelector('.td-btn__label');
    if (label) label.textContent = L.more ?? TIMELINE_LABELS.more;
    const added = this._appendItems(res && Array.isArray(res.items) ? res.items : []);
    const hadFocus = btn === document.activeElement;
    if (res && res.hasMore === false) {
      this.removeAttribute('has-more'); // → _syncMore removes the control
      if (hadFocus || !document.activeElement || document.activeElement === document.body) {
        const ids = new Set(added.map((i) => i.id));
        const first = [...this._box.querySelectorAll('li.td-timeline__item')].find((li) => ids.has(li.getAttribute('data-id')));
        this._focusItem(first || this._lastLi());
      }
    }
    this._announce(fill(L.loaded ?? TIMELINE_LABELS.loaded, { n: added.length }));
  }

  _onToggle(e) {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('td-timeline__details') || !this.contains(d)) return;
    if (this._openState.get(d) === d.open) return; // no change (the initial `open`)
    this._openState.set(d, d.open);
    const li = d.closest('li.td-timeline__item');
    const id = li?.getAttribute('data-id');
    const it = this._items.find((i) => i.id === id);
    if (!it) return;
    if (it.details === true) {
      if (d.open) this._loadDetails(d, it);
      else {
        const q = this._detailQueue.findIndex((e) => e.d === d);
        if (q >= 0) { // SEC-04: closed before its turn — never requested
          this._detailQueue.splice(q, 1);
          d.querySelector('.td-timeline__detail')?.replaceChildren();
        }
        const c = this._detailCtl.get(id);
        if (c) {
          c.abort();
          this._detailCtl.delete(id);
          d.querySelector('.td-timeline__detail')?.replaceChildren();
          this._pumpDetails();
        }
      }
    }
    this.emit('item-toggle', { id, open: d.open });
  }

  /** @private QĐ T8 — lazy details: called on the first open, cached by id, aborted on close / new items / disconnect. */
  async _loadDetails(d, it) {
    const box = d.querySelector('.td-timeline__detail');
    if (!box || !this._renderDetails) return;
    const id = it.id;
    const L = TdTimeline.labels;
    if (this._detailCache.has(id)) {
      const v = this._detailCache.get(id);
      if (typeof v === 'string') box.textContent = v;
      else if (!box.contains(v)) box.replaceChildren(v);
      return;
    }
    if (this._detailCtl.has(id) || this._detailQueue.some((e) => e.d === d)) return;
    if (this._detailActive >= DETAIL_CONCURRENCY) { // SEC-04: wait for a free slot, in DISPLAY order
      box.replaceChildren(text('p', 'td-timeline__loading', L.detailsLoading ?? TIMELINE_LABELS.detailsLoading, { role: 'status' }));
      const at = this._detailQueue.findIndex((e) => !!(d.compareDocumentPosition(e.d) & Node.DOCUMENT_POSITION_FOLLOWING));
      this._detailQueue.splice(at < 0 ? this._detailQueue.length : at, 0, { d, id });
      return;
    }
    const ctl = new AbortController();
    this._detailCtl.set(id, ctl);
    const gen = this._gen.value;
    box.replaceChildren(text('p', 'td-timeline__loading', L.detailsLoading ?? TIMELINE_LABELS.detailsLoading, { role: 'status' }));
    const hook = this._renderDetails;
    let res;
    this._detailActive++;
    try {
      res = await hook(this._copy(it), { signal: ctl.signal });
    } catch {
      this._settleDetail();
      if (ctl.signal.aborted || !this._gen.isCurrent(gen) || this._renderDetails !== hook || this._detailCtl.get(id) !== ctl) return;
      this._detailCtl.delete(id);
      const err = text('p', 'td-timeline__detail-error', L.detailsError ?? TIMELINE_LABELS.detailsError, { role: 'status' });
      const retry = text('button', 'td-btn td-btn--ghost td-btn--sm td-timeline__retry', L.retry ?? TIMELINE_LABELS.retry, { type: 'button' });
      box.replaceChildren(err, retry);
      return;
    }
    this._settleDetail();
    if (ctl.signal.aborted || !this._gen.isCurrent(gen) || this._renderDetails !== hook || this._detailCtl.get(id) !== ctl) return;
    this._detailCtl.delete(id);
    const v = res instanceof Node ? res : typeof res === 'string' ? res : res == null ? '' : String(res);
    this._detailCache.set(id, v);
    if (typeof v === 'string') box.textContent = v;
    else box.replaceChildren(v);
  }

  /**
   * @private SEC-04 (review round 3): a renderDetails call settled (resolved / rejected — aborted or not): its slot frees
   * now, never earlier; a call that never settles keeps its slot (fail closed). Then the queue moves (next microtask, so
   * the settling call finishes applying its own result first).
   */
  _settleDetail() {
    this._detailActive--;
    queueMicrotask(() => this._pumpDetails());
  }

  /** @private SEC-04: start queued lazy details while a slot is free (skipping panels closed / removed meanwhile). */
  _pumpDetails() {
    while (this._detailActive < DETAIL_CONCURRENCY && this._detailQueue.length) {
      const { d, id } = this._detailQueue.shift();
      if (!d.isConnected || !d.open || !this.contains(d)) continue;
      const it = this._items.find((i) => i.id === id);
      if (it && it.details === true) this._loadDetails(d, it);
    }
  }

  // --- SSR (ADR 0012, contract timeline@1, plan QĐ G3 / T4 / T9) ---

  /**
   * Marker `timeline@1` + the markup EXACTLY as `td_timeline()` prints it → adopted in place (day labels recomputed).
   * Items assigned early win. A `time-zone` this browser does not know → rendered from the items read from the markup
   * with the browser zone (one warning). Any other mismatch → rendered from early items, else EMPTY + one warning.
   */
  canHydrate() {
    if (!this._ssrMatches(SSR_NAME, SSR_SCHEMA)) return false;
    if (this._earlyItems) return false;
    const parsed = this._readMarkup();
    if (parsed && !isTimeZone(this.getAttribute('time-zone'))) {
      this._items = sortItems(parsed, this._order());
      this._warnOnce(BAD_TZ);
      return false;
    }
    if (parsed) {
      this._items = sortItems(parsed, this._order());
      for (const L of new Set([TdTimeline.labels, TIMELINE_LABELS])) {
        const marks = { wild: new WeakSet(), icons: new WeakMap() };
        if (sameChildren(this.childNodes, this._tree(L, true, marks), { wildText: marks.wild, iconSlot: marks.icons })) return true;
      }
    }
    this._items = [];
    this._warnOnce('td-timeline: server markup does not match timeline@1 — not adopted (rendered empty).');
    return false;
  }

  hydrateExisting() {
    this._refs();
    for (const d of this.querySelectorAll('details.td-timeline__details')) this._openState.set(d, d.open);
  }

  /** Re-connect: render again from `items` (open details are not kept — display only). */
  canRebind() { return false; }

  /** @private Items read from the server markup (each field from its own node), or null when it cannot be read. */
  _readMarkup() {
    const kids = elementKids(this);
    if (!kids || kids.length < 2) return null;
    const box = kids[0];
    if (box.localName !== 'div') return null;
    const raw = [];
    const groups = elementKids(box);
    if (!groups) return null;
    for (const g of groups) {
      if (g.localName !== 'div' || !g.classList.contains('td-timeline__day')) continue; // the empty text: checked by the rebuild
      const ol = g.querySelector(':scope > ol.td-timeline__list');
      const lis = ol && elementKids(ol);
      if (!lis) return null;
      for (const li of lis) {
        const it = this._readItem(li);
        if (!it) return null;
        raw.push(it);
        if (raw.length > MAX_ITEMS) return null;
      }
    }
    const norm = normalizeItems(raw);
    if (norm.dropped || norm.renamed || norm.capped || norm.items.length !== raw.length) return null;
    const same = norm.items.every((n, i) => {
      const r = raw[i];
      return n.id === r.id && n.title === r.title && n.tone === r.tone && n.expanded === r.expanded && n.href === r.href
        && n.meta === r.meta && n.icon === r.icon && n.details === r.details
        && n.actor?.name === r.actor?.name && n.actor?.href === r.actor?.href
        && (r.time === null ? n.time === null : n.time !== null && isoOf(n.time) === r.time);
    });
    return same ? norm.items : null;
  }

  _readItem(li) {
    if (li.localName !== 'li') return null;
    const body = li.querySelector(':scope > .td-timeline__body');
    const head = body?.querySelector(':scope > .td-timeline__head');
    const title = head?.querySelector(':scope > .td-timeline__title');
    if (!title || leafText(title) === null) return null;
    const it = { id: li.getAttribute('data-id') ?? '', tone: li.getAttribute('data-tone') ?? '', title: title.textContent, time: null, expanded: false };
    const linkOf = (n) => {
      const h = n.getAttribute('href') || '';
      return h && cleanHref(h) === h ? h : null;
    };
    if (title.localName === 'a') {
      it.href = linkOf(title);
      if (!it.href) return null;
    }
    const actor = head.querySelector(':scope > .td-timeline__actor');
    if (actor) {
      if (leafText(actor) === null) return null;
      it.actor = { name: actor.textContent };
      if (actor.localName === 'a') {
        it.actor.href = linkOf(actor);
        if (!it.actor.href) return null;
      }
    }
    const time = head.querySelector(':scope > time.td-timeline__time');
    if (time) it.time = time.getAttribute('datetime') || '';
    const meta = body.querySelector(':scope > .td-timeline__meta');
    if (meta) {
      if (leafText(meta) === null) return null;
      it.meta = meta.textContent;
    }
    const slot = li.querySelector(':scope > .td-timeline__marker > .td-timeline__icon');
    if (slot) it.icon = slot.getAttribute('data-td-icon') ?? '';
    const d = body.querySelector(':scope > details.td-timeline__details');
    if (d) {
      const box = d.querySelector(':scope > .td-timeline__detail');
      if (leafText(box) === null) return null;
      it.details = box.textContent;
      it.expanded = d.hasAttribute('open');
    }
    return it;
  }
}

if (!customElements.get('td-timeline')) {
  customElements.define('td-timeline', TdTimeline);
}
