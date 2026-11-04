import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon, SVG_TAGS, SVG_ATTRS, SVG_VIEWBOX } from '../icons/td-icon.js';
import { TdMenu } from '../feedback/td-menu.js';
import { safeButtonHref } from '../form/td-button.js';
// pure helpers only (plan v0.96.0-action-fold §4 / §4.5)
import { fitSecondaries } from '../utils/media-selection-group.js';
import { planActions, narrowState } from '../utils/action-fold.js';

/**
 * `<td-page-actions>` (v0.96.0, plan docs/internal/plans/v0.96.0-action-fold.md §6) — the page's action buttons next to
 * its title, folded by the shared policy (src/utils/action-fold.js). Upgrades the site's markup in place (no innerHTML,
 * no Shadow DOM, CSP-strict; the site's buttons keep their node + listeners):
 *
 *   <div data-site-title-row>
 *     <h1>Ảnh</h1>
 *     <td-page-actions label="Thao tác trang" mirror="sticky-actions">
 *       <a class="td-btn td-btn--secondary" href="/photos/import">Nhập</a>
 *       <button class="td-btn td-btn--secondary" type="button" data-td-menu="photos-sort">Sắp xếp</button>
 *       <button class="td-btn td-btn--secondary" type="button" data-td-in-menu>Xuất CSV</button>
 *       <td-button variant="primary" label="Tải ảnh lên"></td-button>
 *     </td-page-actions>
 *   </div>
 *
 * - Actions = direct children `button`, `a[href]` / `a.td-btn`, `td-button`, `td-action-button` (markers `data-td-tone`,
 *   `data-td-in-menu`, `data-td-menu`, `data-td-menu-*` read on that direct child). Other children stay, uncounted.
 * - At most ONE primary (`data-td-tone="primary"` / `.td-btn--primary` / `td-button[variant=primary]`), moved last; the
 *   first 2 secondaries shown; the rest + every `data-td-in-menu` action in a kit "…" menu (TdMenu) placed before the
 *   primary. Parent row < 480px → primary + "…" only. Shown secondaries that do not fit the host width also go into
 *   "…" (from the end) — the primary never folds.
 * - `data-td-menu="name"` → `TdMenu.bind(control, name, { ctx })` on the original (anchor = the clicked element).
 * - `mirror="id"` / `.mirror = Element` → the kit fills that container (e.g. a sticky header) with SAFE proxies of the
 *   shown actions (allowlist rebuild, never cloneNode; `aria-hidden`, `tabindex=-1`); a click on a proxy clicks the
 *   original.
 * - No JS: every button shows and the row wraps (page-actions.css).
 *
 * @attr {string} label - Name of the group (`role="group"`); default `TdPageActions.labels.region`.
 * @attr {string} mirror - Id (same root node) of the container that receives the proxies.
 * @property {Element|null} mirror - The container itself (wins over the attribute).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TONE = 'data-td-tone';
const IN_MENU = 'data-td-in-menu';
const MENU = 'data-td-menu';
const OVERFLOW = 'data-td-overflow';
const MEASURING = 'data-td-measuring';
/** = td-menu.js RESERVED_CTX: keys TdMenu itself owns in a menu ctx */
const RESERVED_CTX = new Set(['__proto__', 'constructor', 'prototype', 'anchor', 'name', 'item', 'checked']);
const HOSTS = new Set(['TD-BUTTON', 'TD-ACTION-BUTTON']);
/** HTML attributes a proxy keeps (plan §6.5); href / target / rel / download only on a link proxy */
const KEEP_ATTRS = ['class', 'aria-label', 'aria-disabled', 'aria-hidden', 'title'];
const LINK_ATTRS = ['target', 'rel', 'download'];
/** never rebuilt, never flattened to text (their text is code, not a label) */
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'TEXTAREA',
  'SELECT', 'INPUT', 'VIDEO', 'AUDIO', 'CANVAS']);
const MAX_DEPTH = 8;
const MAX_ATTR = 8000;
/** root <svg> attributes td-icon.js sets itself (plan §6.5) → value check */
const SVG_ROOT = {
  class: /^[A-Za-z0-9_ -]{0,512}$/,
  viewBox: SVG_VIEWBOX,
  width: /^\d+(\.\d+)?(px|em|rem|%)?$/,
  height: /^\d+(\.\d+)?(px|em|rem|%)?$/,
  fill: /^(none|currentColor)$/,
  stroke: /^(none|currentColor)$/,
  'stroke-width': /^\d+(\.\d+)?$/,
  'stroke-linecap': /^(butt|round|square)$/,
  'stroke-linejoin': /^(miter|round|bevel|arcs|miter-clip)$/,
  focusable: /^(true|false)$/,
  'aria-hidden': /^(true|false)$/,
};
const TRACKED = ['hidden', 'disabled', 'aria-disabled', 'aria-label', 'href', 'label', TONE, IN_MENU, MENU, 'class',
  'variant'];

const isLocked = (c) => !!c && (c.disabled === true || c.getAttribute('aria-disabled') === 'true');
const isAction = (el) => el instanceof HTMLElement && (el.tagName === 'BUTTON' || HOSTS.has(el.tagName)
  || (el.tagName === 'A' && (el.hasAttribute('href') || el.classList.contains('td-btn')))); // a disabled td_link has no href

/** the clickable control of a direct child (`td-button` → its own `.td-btn`; not upgraded yet → the host) */
function controlOf(el) {
  if (!HOSTS.has(el.tagName)) return el;
  return el.querySelector(':scope > .td-btn') || el;
}

/** visible label: `.td-btn__label` → `label` attribute → text → aria-label (dwp actionLabel) */
function actionLabel(el, control) {
  const lab = control.querySelector?.('.td-btn__label');
  const t = (lab && lab.textContent.trim()) || (el.getAttribute('label') || '').trim()
    || (control.textContent || '').trim() || (control.getAttribute('aria-label') || '').trim()
    || (el.getAttribute('aria-label') || '').trim();
  return t.replace(/\s+/g, ' ');
}

/** `data-td-menu-*` keys of the direct child (the anchor's own keys are read by TdMenu too — same values) */
function dataCtx(el) {
  const ctx = {};
  const ds = el.dataset || {};
  for (const k of Object.keys(ds)) {
    if (!k.startsWith('tdMenu') || k.length <= 6) continue;
    const key = k.charAt(6).toLowerCase() + k.slice(7);
    if (!key || RESERVED_CTX.has(key)) continue;
    ctx[key] = String(ds[k]);
  }
  return ctx;
}

/** copy `--td-*` inline custom properties through CSSOM (never the `style` attribute — CSP style-src-attr) */
function copyTokens(from, to) {
  const s = from && from.style;
  if (!s) return;
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    if (p.startsWith('--td-')) to.style.setProperty(p, s.getPropertyValue(p), s.getPropertyPriority(p));
  }
}

function copyAttrs(from, to, names) {
  for (const n of names) {
    const v = from.getAttribute(n);
    if (v != null && v.length <= MAX_ATTR) to.setAttribute(n, v);
  }
}

function cloneSvg(svg) {
  const out = document.createElementNS(SVG_NS, 'svg');
  for (const [n, re] of Object.entries(SVG_ROOT)) {
    const v = svg.getAttribute(n);
    if (v != null && v.length <= MAX_ATTR && re.test(v)) out.setAttribute(n, v);
  }
  for (const c of svg.children) {
    if (c.namespaceURI !== SVG_NS || !SVG_TAGS.has(c.localName)) continue;
    const shape = document.createElementNS(SVG_NS, c.localName);
    for (const [n, re] of Object.entries(SVG_ATTRS)) {
      const v = c.getAttribute(n);
      if (v != null && v.length <= MAX_ATTR && re.test(v)) shape.setAttribute(n, v);
    }
    out.appendChild(shape);
  }
  return out;
}

/** rebuild the children of `from` into `to` (allowlist, plan §6.5) */
function cloneKids(from, to, depth) {
  for (const n of from.childNodes) {
    if (n.nodeType === 3) {
      to.appendChild(document.createTextNode(n.textContent));
      continue;
    }
    if (n.nodeType !== 1) continue; // comments, processing instructions
    if (n.namespaceURI === SVG_NS) {
      if (n.localName === 'svg') to.appendChild(cloneSvg(n));
      continue;
    }
    const tag = n.tagName;
    if (DROP_TAGS.has(tag)) continue;
    if (tag === 'SPAN' && depth < MAX_DEPTH) {
      if (n.hidden) continue; // the td-button spinner, a site's hidden part
      const s = document.createElement('span');
      copyAttrs(n, s, ['class', 'aria-hidden']);
      cloneKids(n, s, depth + 1);
      to.appendChild(s);
      continue;
    }
    if (tag === 'I' && from.classList?.contains('td-btn__icon')) { // legacy class icon of td-button (fas fa-edit)
      const i = document.createElement('i');
      copyAttrs(n, i, ['class', 'aria-hidden']);
      to.appendChild(i);
      continue;
    }
    const text = n.textContent || '';
    if (text.trim()) to.appendChild(document.createTextNode(text)); // anything else: flattened to its text
  }
}

/**
 * Activate the original control from a proxy / a "…" item (security review v0.96.0): a link is re-checked with
 * `safeButtonHref` AT CLICK TIME (also catches an href changed after render) — an unsafe href (`javascript:`…) is
 * never clicked. A link without href (no navigation) and a button are clicked as is.
 * @internal
 * @param {HTMLElement} control
 * @returns {boolean} whether the control was clicked
 */
export function activateControl(control) {
  if (control.tagName === 'A' && control.hasAttribute('href') && safeButtonHref(control.getAttribute('href')) === null) {
    return false;
  }
  control.click();
  return true;
}

/**
 * A proxy of `control` built with createElement / createElementNS + an attribute allowlist (plan §6.5): no id, no data-*,
 * no ARIA idref, no `style` attribute, no on*, no tabindex / name / form* / value.
 * @param {HTMLElement} control
 * @param {HTMLElement} host the direct child (a td-button host), or the control itself
 * @internal exported for tests only, not part of the public API
 */
export function safeClone(control, host) {
  const locked = isLocked(control);
  const href = control.tagName === 'A' && !locked ? safeButtonHref(control.getAttribute('href')) : null;
  const out = document.createElement(href ? 'a' : 'button');
  copyAttrs(control, out, KEEP_ATTRS);
  if (href) {
    out.setAttribute('href', href);
    copyAttrs(control, out, LINK_ATTRS);
    if (out.getAttribute('target') === '_blank' && !/\bnoopener\b/.test(out.getAttribute('rel') || '')) {
      out.setAttribute('rel', `${out.getAttribute('rel') || ''} noopener noreferrer`.trim());
    }
  } else {
    out.type = 'button';
    if (control.disabled === true) out.disabled = true;
  }
  out.classList.add('td-page-actions__clone');
  cloneKids(control, out, 1);
  if (host && host !== control) copyTokens(host, out);
  copyTokens(control, out);
  out.tabIndex = -1;
  return out;
}

export class TdPageActions extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdPageActions.labels.more = 'More actions'`. */
  static labels = {
    more: 'Thao tác khác',
    region: 'Thao tác trang',
    multiPrimary: 'td-page-actions: more than one primary action — only the first is kept as primary.',
  };

  static get observedAttributes() {
    return ['label', 'mirror'];
  }

  constructor() {
    super();
    this._more = null;
    this._mo = null;
    this._queued = false;
    this._raf = 0;
    this._dirty = true;
    this._narrow = false;
    /** @type {HTMLElement|null} the primary that won the previous build (keep, §4.2 rule 2) */
    this._winner = null;
    /** @type {Map<Element, number>} measured widths (cache, re-measured on any site mutation) */
    this._widths = new Map();
    this._moreWidth = 0;
    this._gap = 0;
    this._extra = 0;
    this._fit = null;
    /** @type {HTMLElement[]} the shown secondaries the last step 2 ran on (hysteresis only for the same set) */
    this._fitSet = [];
    /** @type {object[]} folded items, menu order */
    this._over = [];
    /** @type {Map<HTMLElement, { key: string, unbind: () => void }>} TdMenu.bind registry (§6.2) */
    this._binds = new Map();
    this._unbindMore = null;
    this._warnedPrimary = false;
    this._warnedMirror = false;
    /** @type {Element|null} property value (.mirror) */
    this._mirrorProp = null;
    /** @type {Element|null} the container the kit currently fills */
    this._mirrorCur = null;
    this._mirrorAria = false;
    this._mirrorDirty = true;
    /** @type {HTMLElement[]} originals shown in the mirror at its last fill */
    this._mirrorShown = [];
    this._mirrorMore = false;
    /** @type {Array<() => void>} */
    this._mirrorUnbinds = [];
    /** @type {WeakMap<Element, object>} proxy → item */
    this._cloneOf = new WeakMap();
  }

  /** @returns {Element|null} */
  get mirror() {
    return this._mirrorProp;
  }

  set mirror(v) {
    const el = v instanceof Element ? v : null;
    if (v != null && !el) console.warn('td-page-actions: .mirror must be an Element or null — ignored');
    if (el === this._mirrorProp) return;
    this._mirrorProp = el;
    this._mirrorDirty = true;
    this._queue();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._more) return;
    if (name === 'label') this._syncLabel();
    else if (name === 'mirror') {
      this._mirrorDirty = true;
      this._queue();
    }
  }

  /** Build again now (a change the observer cannot see, e.g. a `data-td-menu-*` context key). */
  refresh() {
    if (!this.isConnected || !this._more) return;
    this._dirty = true;
    this._mirrorDirty = true;
    this._build();
  }

  /** @private first connect and every re-connect (disconnect ran the cleanups) */
  _doRender() {
    if (this._suppressRender) return;
    this.classList.add('td-page-actions');
    if (!this._more) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'td-btn td-btn--secondary td-page-actions__more';
      const dots = tdIcon('more');
      if (dots) more.appendChild(dots);
      more.hidden = true;
      this._more = more;
    }
    this._more.setAttribute('aria-label', String(TdPageActions.labels.more ?? ''));
    this._unbindMore = TdMenu.bind(this._more, () => this._menuItems(this._more), {
      side: 'bottom', align: 'end', label: String(TdPageActions.labels.more ?? ''),
    });
    this._syncLabel();
    this._dirty = true;
    this._mirrorDirty = true;

    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver((records) => this._onMutations(records));
      this._mo.observe(this, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TRACKED,
      });
    }
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => this._queueFrame());
      ro.observe(this);
      if (this.parentElement) ro.observe(this.parentElement);
    }
    for (const tag of ['td-button', 'td-action-button']) {
      if (!customElements.get(tag)) {
        customElements.whenDefined(tag).then(() => { this._dirty = true; this._queue(); });
      }
    }
    this._cleanups.push(() => this._teardown(ro));
    this._build();
  }

  /** @private disconnect: observers, every TdMenu bind, the kit "…", overflow marks, the mirror (§6.6) */
  _teardown(ro) {
    this._mo?.disconnect();
    this._mo = null;
    ro?.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    for (const { unbind } of this._binds.values()) unbind();
    this._binds.clear();
    this._unbindMore?.();
    this._unbindMore = null;
    this._more?.remove();
    for (const el of this.children) el.removeAttribute(OVERFLOW);
    this._clearMirror();
    this._widths = new Map();
    this._fit = null;
    this._fitSet = [];
    this._over = [];
  }

  /** @private */
  _syncLabel() {
    const label = (this.getAttribute('label') || '').trim() || String(TdPageActions.labels.region ?? '');
    if (this.getAttribute('role') !== 'group') this.setAttribute('role', 'group');
    if (this.getAttribute('aria-label') !== label) this.setAttribute('aria-label', label);
  }

  /** @private */
  _queue() {
    if (this._queued || !this._more) return;
    this._queued = true;
    queueMicrotask(() => {
      this._queued = false;
      if (this.isConnected) this._build();
    });
  }

  /** @private resize: next frame (a write inside the observer callback could loop) */
  _queueFrame() {
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this.isConnected) this._build();
    });
  }

  /** @private node the kit owns (its "…") */
  _isOwn(node) {
    return !!this._more && (node === this._more || this._more.contains(node));
  }

  /** @private */
  _onMutations(records) {
    let site = false;
    for (const r of records) {
      if (r.type === 'attributes' && r.target === this) continue; // the host's own role / aria-label / class
      if (this._isOwn(r.target)) continue;
      if (r.type === 'childList' && r.target === this
        && [...r.addedNodes, ...r.removedNodes].every((n) => n === this._more)) continue;
      site = true;
      break;
    }
    if (!site) return;
    this._dirty = true;
    this._mirrorDirty = true;
    this._queue();
  }

  /** @private one direct child → fold item */
  _item(el) {
    const control = controlOf(el);
    const tone = (el.getAttribute(TONE) || '').trim();
    // explicit only (§6.1): a td-button host by its `variant` ATTRIBUTE (its JS default variant is primary), a bare
    // button / link by its class
    const host = HOSTS.has(el.tagName);
    const primary = tone === 'primary' || (host ? el.getAttribute('variant') === 'primary' : el.classList.contains('td-btn--primary'));
    const danger = tone === 'danger' || (host ? el.getAttribute('variant') === 'danger' : el.classList.contains('td-btn--danger'));
    const menu = (el.getAttribute(MENU) || '').trim();
    return {
      el, control, primary, danger, menu, ctx: dataCtx(el),
      inMenu: el.hasAttribute(IN_MENU), hidden: el.hidden, label: actionLabel(el, control),
    };
  }

  /** @private the fold build (§6.3): plan → order → measure → step 2 → marks → binds → mirror */
  _build() {
    const more = this._more;
    if (!more || !this.isConnected) return;
    const items = [...this.children].filter((el) => el !== more && isAction(el)).map((el) => this._item(el));

    const parent = this.parentElement;
    this._narrow = narrowState(parent ? parent.clientWidth : this.clientWidth, this._narrow);
    const keep = this._winner ? items.findIndex((it) => it.el === this._winner) : -1;
    const plan = planActions(items, { narrow: this._narrow, keep });
    if (plan.demoted.length && !this._warnedPrimary) {
      this._warnedPrimary = true;
      console.warn(String(TdPageActions.labels.multiPrimary ?? ''));
    }
    const winner = plan.primary >= 0 ? items[plan.primary] : null;
    this._winner = winner ? winner.el : null;

    // order: "…" right before the primary, the primary last (append keeps node + listeners + focus)
    const ae = document.activeElement;
    if (winner) {
      if (this.lastElementChild !== winner.el || winner.el.previousElementSibling !== more) this.append(more, winner.el);
    } else if (this.lastElementChild !== more) {
      this.append(more);
    }
    if (ae instanceof HTMLElement && ae !== document.activeElement && this.contains(ae)) ae.focus({ preventScroll: true });
    // moving a not-yet-upgraded <td-button> upgrades + renders it synchronously (CE reactions of append): its control
    // exists only now, and its mutation records are dropped by takeRecords() below → re-read + re-measure
    for (const it of items) {
      const c = controlOf(it.el);
      if (c === it.control) continue;
      it.control = c;
      it.label = actionLabel(it.el, c);
      this._dirty = true;
      this._mirrorDirty = true;
    }

    const shown = plan.shown.filter((i) => i !== plan.primary).map((i) => items[i]);
    const folded = plan.folded.map((i) => items[i]);
    const live = items.filter((it) => !it.hidden);
    if (this._dirty || live.some((it) => !this._widths.get(it.el))) this._measure(live);

    let k = shown.length;
    if (!this._narrow && shown.length) {
      const set = shown.map((it) => it.el);
      const same = set.length === this._fitSet.length && set.every((el, i) => el === this._fitSet[i]);
      const cs = getComputedStyle(this);
      const frame = this.clientWidth - (parseFloat(cs.paddingInlineStart) || 0) - (parseFloat(cs.paddingInlineEnd) || 0);
      const fixed = this._extra + (winner ? this._widths.get(winner.el) ?? 0 : 0);
      k = fitSecondaries(set.map((el) => this._widths.get(el) ?? 0), frame, fixed, this._moreWidth, this._gap,
        same ? this._fit : null, folded.length > 0, !!winner);
    }
    this._fit = k;
    this._fitSet = shown.map((it) => it.el);
    const over = [...shown.slice(k), ...folded];
    const overSet = new Set(over.map((it) => it.el));
    for (const it of items) it.el.toggleAttribute(OVERFLOW, !it.hidden && overSet.has(it.el));
    this._over = over;
    more.hidden = !over.length;

    this._syncBinds(items);
    this._syncMirror(shown.slice(0, k), winner, !more.hidden);
    this._mo?.takeRecords();
  }

  /** @private one measuring pass: every live action + "…" at natural width (CSS [data-td-measuring]) */
  _measure(live) {
    this._dirty = false;
    this.setAttribute(MEASURING, '');
    this._widths = new Map();
    for (const it of live) this._widths.set(it.el, it.el.getBoundingClientRect().width);
    this._moreWidth = this._more.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(this).columnGap) || 0;
    this._gap = gap;
    let extra = 0;
    for (const el of this.children) {
      if (el === this._more || isAction(el)) continue;
      const w = el.getBoundingClientRect().width;
      if (w > 0) extra += w + gap;
    }
    this._extra = extra;
    this.removeAttribute(MEASURING);
  }

  /** @private TdMenu.bind registry (§6.2): unbind stale controls, bind new / renamed / re-contexted ones */
  _syncBinds(items) {
    const want = new Map();
    for (const it of items) {
      if (!it.menu || (it.control === it.el && HOSTS.has(it.el.tagName))) continue; // td-button not upgraded yet
      want.set(it.control, { it, key: `${it.menu}\u0000${JSON.stringify(it.ctx)}` });
    }
    for (const [control, rec] of this._binds) {
      const w = want.get(control);
      if (w && w.key === rec.key && control.isConnected) continue;
      rec.unbind();
      this._binds.delete(control);
    }
    for (const [control, { it, key }] of want) {
      if (this._binds.has(control)) continue;
      const unbind = TdMenu.bind(control, it.menu, { ctx: it.ctx, side: 'bottom', align: 'end', label: it.label });
      this._binds.set(control, { key, unbind });
    }
  }

  /** @private the "…" menu (built at open): folded actions, DOM order of the plan */
  _menuItems(anchor) {
    const fromMirror = anchor !== this._more;
    return this._over.filter((it) => it.el.parentElement === this && !it.el.hidden).map((it) => ({
      label: it.label,
      danger: it.danger,
      disabled: isLocked(it.control),
      onSelect: () => {
        if (isLocked(it.control)) return;
        if (it.menu) {
          TdMenu.open(anchor, it.menu, {
            ctx: it.ctx, label: it.label, side: 'bottom', align: 'end', focus: 'first',
            ...(fromMirror ? { onClose: () => this._focusOut() } : {}),
          });
        } else {
          activateControl(it.control);
        }
      },
    }));
  }

  // --- mirror (§6.4) ---

  /** @private the container to fill, validated (§6.4: an Element, not the host, not inside it, not around it) */
  _mirrorTarget() {
    let m = this._mirrorProp;
    if (!m) {
      const id = (this.getAttribute('mirror') || '').trim();
      if (!id) return null;
      const root = this.getRootNode();
      m = typeof root.getElementById === 'function' ? root.getElementById(id) : null;
      if (!m) return null;
    }
    if (!(m instanceof Element) || m === this || this.contains(m) || m.contains(this)) {
      if (!this._warnedMirror) {
        this._warnedMirror = true;
        console.warn('td-page-actions: mirror must be an element outside this component — ignored');
      }
      return null;
    }
    return m;
  }

  /** @private */
  _clearMirror() {
    for (const fn of this._mirrorUnbinds) fn();
    this._mirrorUnbinds = [];
    const m = this._mirrorCur;
    if (m) {
      const focusIn = m.contains(document.activeElement);
      m.replaceChildren();
      if (this._mirrorAria) m.removeAttribute('aria-hidden');
      if (focusIn && this.isConnected) this._focusTarget(null)?.focus({ preventScroll: true });
    }
    this._mirrorCur = null;
    this._mirrorAria = false;
    this._mirrorShown = [];
    this._mirrorMore = false;
  }

  /** @private refill the mirror when what it shows changed: [secondaries…, "…", primary] like the host */
  _syncMirror(secondaries, winner, moreShown) {
    const m = this._mirrorTarget();
    if (m !== this._mirrorCur) {
      this._clearMirror();
      this._mirrorDirty = true;
    }
    if (!m) return;
    const els = [...secondaries, ...(winner ? [winner] : [])].map((it) => it.el);
    const same = !this._mirrorDirty && moreShown === this._mirrorMore && els.length === this._mirrorShown.length
      && els.every((el, i) => el === this._mirrorShown[i]);
    if (same) return;
    for (const fn of this._mirrorUnbinds) fn();
    this._mirrorUnbinds = [];
    const focusIn = m.contains(document.activeElement);
    const kids = [];
    for (const it of secondaries) kids.push(this._proxy(it));
    if (moreShown) kids.push(this._mirrorMoreButton());
    if (winner) kids.push(this._proxy(winner));
    m.replaceChildren(...kids);
    if (!m.hasAttribute('aria-hidden')) {
      m.setAttribute('aria-hidden', 'true');
      this._mirrorAria = true;
    }
    this._mirrorCur = m;
    this._mirrorShown = els;
    this._mirrorMore = moreShown;
    this._mirrorDirty = false;
    if (focusIn) this._focusTarget(null)?.focus({ preventScroll: true });
  }

  /** @private a proxy of one shown action */
  _proxy(it) {
    const c = safeClone(it.control, it.el);
    this._cloneOf.set(c, it);
    c.addEventListener('mousedown', (e) => e.preventDefault()); // never steals focus
    c.addEventListener('click', (e) => {
      const ctrl = it.control;
      if (!ctrl.isConnected || isLocked(ctrl)) {
        e.preventDefault();
        return;
      }
      // a link proxy + middle / modifier click → the browser opens the (filtered) href
      if (c.tagName === 'A' && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
      e.preventDefault();
      if (it.menu) {
        TdMenu.open(c, it.menu, {
          ctx: it.ctx, label: it.label, side: 'bottom', align: 'end', onClose: () => this._focusOut(),
        });
      } else {
        activateControl(ctrl);
      }
    });
    return c;
  }

  /** @private the mirror's own "…" (same items, anchored to itself) */
  _mirrorMoreButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-btn td-btn--secondary td-page-actions__more td-page-actions__clone';
    b.setAttribute('aria-label', String(TdPageActions.labels.more ?? ''));
    const dots = tdIcon('more');
    if (dots) b.appendChild(dots);
    b.tabIndex = -1;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    this._mirrorUnbinds.push(TdMenu.bind(b, () => this._menuItems(b), {
      side: 'bottom', align: 'end', label: String(TdPageActions.labels.more ?? ''), onClose: () => this._focusOut(),
    }));
    return b;
  }

  /** @private where focus goes out of the mirror: the original → the original "…" → the host (temporary tabindex) */
  _focusTarget(proxy) {
    const it = proxy ? this._cloneOf.get(proxy) : null;
    if (it) {
      const c = it.control;
      if (c.isConnected && it.el.parentElement === this && !it.el.hidden && !it.el.hasAttribute(OVERFLOW)
        && c.getClientRects().length) return c;
    }
    if (this._more && !this._more.hidden && this._more.isConnected) return this._more;
    if (!this.hasAttribute('tabindex')) {
      this.tabIndex = -1;
      this.addEventListener('blur', () => this.removeAttribute('tabindex'), { once: true });
    }
    return this;
  }

  /** @private TdMenu onClose for menus anchored in the mirror (§9.2): focus never stays in an aria-hidden region */
  _focusOut() {
    const m = this._mirrorCur;
    const ae = document.activeElement;
    if (!m || !(ae instanceof Element) || !m.contains(ae)) return;
    this._focusTarget(ae)?.focus({ preventScroll: true });
  }
}

if (!customElements.get('td-page-actions')) {
  customElements.define('td-page-actions', TdPageActions);
}
