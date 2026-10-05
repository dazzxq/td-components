import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import {
  CAROUSEL_LABELS, pageTargets, slideTargets, nearestIndex, nextTarget, prevTarget, firstVisible, visibleRange,
  targetForSlide, controlsLayout, fill as fillTemplate, EPS,
} from '../utils/carousel-model.js';
import { readPos, toScrollLeft, slideEdges, maxPosOf, contentBox, scrollMode, negativeRtlScroll } from '../utils/carousel-scroll.js';

const SSR_NAME = 'carousel';
const SSR_SCHEMA = 1;
const SETTLE_MS = 120; // scroll-idle fallback where `scrollend` is missing (Safari < 26)
const FOCUSABLE = 'a[href], area[href], button, input, select, textarea, iframe, audio[controls], video[controls], summary, [contenteditable]:not([contenteditable="false"]), [tabindex]';

/** @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs] */
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** Escape a string for a RegExp. */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Horizontal strip of slides with native scrolling + CSS scroll-snap — v0.50.0 (plan v0.50.0-rating-carousel C1–C21,
 * ADR 0024). Token-native: td.css (`components/carousel.css`). Light DOM. NO autoplay, NO loop, NO mouse drag, NO custom
 * gestures: the strip is a native scroller; the controls only call `scrollTo()`.
 *
 * Slides are the site's own children (light DOM). Hand-written `<td-carousel label="…"><div>…</div>…</td-carousel>` is
 * wrapped ONCE (viewport > track around the same nodes — moved, never cloned / re-rendered); PHP `td_carousel()` prints
 * the frame (contract `carousel@1`) and it is adopted in place. Slide CONTENT is never touched; the kit only sets
 * `class="td-carousel__slide"` + `role="group"` + `aria-roledescription` + `aria-label` "n / total" (a site's own
 * aria-label / aria-labelledby is kept). A direct child with `hidden` is not a slide.
 *
 * Frame: `div.td-carousel__viewport` (the scroller) > `div.td-carousel__track` > slides; `div.td-carousel__controls`
 * (prev button, counter "k / P", page dots, next button — order per layout, C21); `p.td-sr-only[role=status]` (live region,
 * only after a button / dot / API move). Host: `role="region"`, `aria-roledescription`, `aria-label` = `label`.
 * Pages are computed from the MEASURED geometry (ResizeObserver / MutationObserver); per-view comes from CSS (attribute
 * or `--td-carousel-per-view[-sm|-md|-lg|-xl]` tokens, container queries).
 *
 * @element td-carousel
 * @attr {string} label - name of the region ("Sản phẩm nổi bật"); missing → `TdCarousel.labels.carousel` + one warning
 * @attr {number} per-view - slides per view at every width, integer 1–6 (default 1; responsive: tokens)
 * @attr {'auto'|'on'|'off'} dots - page dots: auto (≤ 2 rows, else the counter only), on, off
 * @attr {'page'|'slide'} step - prev / next move one page (default) or one slide
 * @fires slide-change - `{ index, page, pageCount, reason: 'button'|'dot'|'scroll'|'api' }` when a scroll settles on a
 *   new first slide (never while upgrading)
 */
export class TdCarousel extends TdBaseElement {
  /** Site-wide texts (assign before the elements upgrade; R13). */
  static labels = { ...CAROUSEL_LABELS };

  static hydratable = true;

  static get observedAttributes() { return ['label', 'per-view', 'dots', 'step']; }

  constructor() {
    super();
    this._ssr = false;
    this._warned = new Set();
    /** @type {number[]} */
    this._pages = [0];
    /** @type {number[]} */
    this._steps = [0];
    /** @type {Array<{start: number, end: number}>} */
    this._edges = [];
    this._geo = null;
    this._index = 0;
    this._emitted = 0;
    this._anchor = 0;
    /** @type {null|'button'|'dot'|'api'} */
    this._reason = null;
    this._raf = 0;
    this._settleTimer = 0;
    this._ro = null;
    this._mo = null;
    this._ownTabindex = false;
    this._kitLabels = new WeakSet();
  }

  // --- public API ---

  /** Index of the first slide in view. */
  get index() { return this._index; }

  /** Current page (0-based). */
  get page() { return nearestIndex(this._pages, this._pos()); }

  /** Number of pages. */
  get pageCount() { return this._pages.length; }

  /** Next step (page or slide). */
  next() { this._go(nextTarget(this._steps, this._pos()), 'api'); }

  /** Previous step. */
  prev() { this._go(prevTarget(this._steps, this._pos()), 'api'); }

  /** Scroll so slide `index` (clamped) is at the start. */
  goTo(index) {
    if (!this._edges.length) this._measure();
    const n = this._edges.length;
    if (!n || !this._geo) return;
    const i = Math.min(n - 1, Math.max(0, Math.trunc(Number(index)) || 0));
    const t = Math.round(Math.min(this._geo.maxPos, Math.max(0, this._edges[i].start - this._geo.pad)));
    this._go(t, 'api');
  }

  /** Re-measure (normally automatic: ResizeObserver + MutationObserver). */
  refresh() {
    if (!this._viewport) return;
    this._syncSlides();
    this._measure();
  }

  // --- labels ---

  /** @private */
  _L() { return { ...CAROUSEL_LABELS, ...TdCarousel.labels }; }

  /** @private */
  _label() {
    const own = (this.getAttribute('label') || '').trim();
    if (own) return own;
    this._warnOnce('td-carousel: give the carousel a `label` (name of the region) — the default name is used.');
    return String(this._L().carousel);
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  // --- lifecycle ---

  /** The SSR marker is read here (before the base removes it); the frame is ALWAYS adopted / repaired, never re-rendered. */
  canHydrate() {
    this._ssr = this._ssrMatches(SSR_NAME, SSR_SCHEMA);
    return false;
  }

  /** Re-connect: the frame is ours whatever happened — re-bind (no re-render). */
  canRebind() { return true; }

  _doRender() {
    if (this._suppressRender) return;
    this._frame();
    this._bindStep();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._viewport) return;
    if (name === 'label') {
      this.setAttribute('aria-label', this._label());
      this._syncViewportFocus();
    } else {
      this._measure();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (typeof ResizeObserver !== 'undefined' && !this._ro && this._viewport) {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this._viewport);
      this._ro.observe(this._track);
    }
    if (typeof MutationObserver !== 'undefined' && !this._mo && this._track) {
      this._mo = new MutationObserver(() => this.refresh());
      this._mo.observe(this._track, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'tabindex', 'href', 'disabled'] });
      // children appended to the HOST later (frameworks, JS-built carousels) become slides
      this._hostMo = new MutationObserver(() => this._adoptStray());
      this._hostMo.observe(this, { childList: true });
      this._adoptStray();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
    this._mo?.disconnect();
    this._mo = null;
    this._hostMo?.disconnect();
    this._hostMo = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    clearTimeout(this._settleTimer);
    this._settleTimer = 0;
  }

  /** Listeners (render / re-bind) + first measure. */
  afterRender() {
    if (!this._viewport) return;
    this.listen(this._viewport, 'scroll', () => this._onScroll(), { passive: true });
    if ('onscrollend' in window) this.listen(this._viewport, 'scrollend', () => this._settle());
    this.listen(this._controls, 'click', (e) => this._onClick(e));
    this._measure();
    this._index = this._edges.length && this._geo ? firstVisible(this._edges, this._geo.pos, this._geo.pad) : 0;
    this._emitted = this._index;
    this._anchor = this._index;
  }

  // --- frame (C2 / C19) ---

  /** @private Build the frame around hand-written children, or adopt / repair the server frame. Never touches slide content. */
  _frame() {
    const L = this._L();
    let viewport = this.querySelector(':scope > .td-carousel__viewport');
    let track = viewport?.querySelector(':scope > .td-carousel__track') || null;
    if (!viewport || !track) {
      // hand-written (or broken) markup: every direct child that is not a frame part becomes content of the track
      const keep = (n) => n.nodeType === 1 && !n.matches('.td-carousel__viewport, .td-carousel__controls, p.td-sr-only[role="status"]');
      const kids = [...this.childNodes].filter((n) => keep(n) || (n.nodeType === 3 && /\S/.test(n.data)));
      if (viewport && !track) {
        track = el('div', 'td-carousel__track');
        track.append(...viewport.childNodes);
        viewport.appendChild(track);
      } else {
        viewport = el('div', 'td-carousel__viewport');
        track = el('div', 'td-carousel__track');
        viewport.appendChild(track);
      }
      track.append(...kids);
    }
    this._viewport = viewport;
    this._track = track;

    // controls: keep the server nodes that are exactly ours, replace the others (focus kept on a kept button)
    let controls = this.querySelector(':scope > .td-carousel__controls');
    if (!controls || controls.localName !== 'div') {
      controls?.remove();
      controls = el('div', 'td-carousel__controls', { 'data-td-js-only': '' });
    }
    const pick = (sel, ok, make) => {
      const n = controls.querySelector(`:scope > ${sel}`);
      if (n && ok(n)) return n;
      n?.remove();
      return make();
    };
    const btnOk = (n) => n.localName === 'button' && n.getAttribute('type') === 'button' && n.className === 'td-carousel__btn';
    const prevBtn = pick('[data-td-carousel="prev"]', btnOk, () => el('button', 'td-carousel__btn', { type: 'button', 'data-td-carousel': 'prev' }));
    const nextBtn = pick('[data-td-carousel="next"]', btnOk, () => el('button', 'td-carousel__btn', { type: 'button', 'data-td-carousel': 'next' }));
    const counter = pick('.td-carousel__counter', (n) => n.localName === 'span', () => el('span', 'td-carousel__counter'));
    const dots = pick('.td-carousel__dots', (n) => n.localName === 'div', () => el('div', 'td-carousel__dots'));
    for (const [b, name, icon] of [[prevBtn, L.prev, 'prev'], [nextBtn, L.next, 'next']]) {
      b.setAttribute('aria-label', String(name));
      const svg = tdIcon(icon, { size: 'm' });
      const cur = b.firstElementChild;
      if (!(b.childNodes.length === 1 && cur?.localName === 'svg' && cur.getAttribute('data-icon') === icon)) b.replaceChildren(...(svg ? [svg] : []));
    }
    counter.setAttribute('aria-hidden', 'true');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', String(L.dots));
    for (const n of [...dots.children]) if (!n.matches('button.td-carousel__dot')) n.remove();
    // anything else inside the controls is not ours
    for (const n of [...controls.childNodes]) if (![prevBtn, nextBtn, counter, dots].includes(n)) n.remove();
    this._placeParts(controls, prevBtn, counter, nextBtn, dots, false);
    this._controls = controls;
    this._prevBtn = prevBtn;
    this._nextBtn = nextBtn;
    this._counter = counter;
    this._dots = dots;

    let status = this.querySelector(':scope > p.td-sr-only[role="status"]');
    if (!status) status = el('p', 'td-sr-only', { role: 'status' });
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    this._status = status;

    // order: viewport, controls, status (only moved when out of place: moving a focused node blurs it)
    const order = [viewport, controls, status];
    order.forEach((n, i) => {
      const want = i === 0 ? this.firstElementChild : order[i - 1].nextElementSibling;
      if (n.parentNode !== this || want !== n) {
        if (i === 0) this.insertBefore(n, this.firstChild);
        else order[i - 1].after(n);
      }
    });

    this.setAttribute('role', 'region');
    this.setAttribute('aria-roledescription', String(L.roleCarousel));
    this.setAttribute('aria-label', this._label());
    this._syncSlides();
  }

  /**
   * @private DOM order = visual order (C21): rows → prev, counter, next, dots; inline → prev, dots, next, counter.
   * Moves only what is out of place, and gives focus back if the move blurred it.
   */
  _placeParts(controls, prevBtn, counter, nextBtn, dots, inline) {
    const want = inline ? [prevBtn, dots, nextBtn, counter] : [prevBtn, counter, nextBtn, dots];
    if (want.every((n, i) => controls.children[i] === n) && controls.children.length === 4) return;
    const active = this.ownerDocument.activeElement;
    controls.append(...want);
    if (active && active !== this.ownerDocument.activeElement && controls.contains(active)) active.focus({ preventScroll: true });
  }

  /** @private Slides = the track's element children without `hidden`; set the kit's slide attributes + "n / total". */
  _syncSlides() {
    if (!this._track) return;
    const L = this._L();
    const slides = [...this._track.children].filter((n) => !n.hidden);
    const total = String(slides.length);
    const tpl = String(L.slide);
    // an aria-label the kit printed (PHP / an earlier run: the template — or the default — with numbers) is ours to rewrite
    const shape = (t) => t.split(/\{n\}|\{total\}/).map(reEsc).join('\\d+');
    const kitRe = new RegExp(`^(?:${shape(tpl)}|${shape(CAROUSEL_LABELS.slide)})$`);
    slides.forEach((s, i) => {
      if (!s.classList.contains('td-carousel__slide')) s.classList.add('td-carousel__slide');
      if (s.getAttribute('role') !== 'group') s.setAttribute('role', 'group');
      if (s.getAttribute('aria-roledescription') !== String(L.roleSlide)) s.setAttribute('aria-roledescription', String(L.roleSlide));
      const own = s.hasAttribute('aria-labelledby') || (s.hasAttribute('aria-label') && !this._kitLabels.has(s) && !kitRe.test(s.getAttribute('aria-label')));
      if (own) return;
      const name = fillTemplate(tpl, { n: String(i + 1), total });
      if (s.getAttribute('aria-label') !== name) s.setAttribute('aria-label', name);
      this._kitLabels.add(s);
    });
    this._slides = slides;
    this._syncViewportFocus();
  }

  /** @private C10: no focusable content → the viewport is the Tab stop (arrow keys scroll natively). */
  _syncViewportFocus() {
    const vp = this._viewport;
    if (!vp || !this._slides) return;
    const focusable = this._slides.some((s) => s.matches(FOCUSABLE) || s.querySelector(FOCUSABLE));
    if (!focusable) {
      if (!vp.hasAttribute('tabindex')) {
        vp.setAttribute('tabindex', '0');
        this._ownTabindex = true;
      }
      if (this._ownTabindex) vp.setAttribute('aria-label', this.getAttribute('aria-label') || this._label());
    } else if (this._ownTabindex) {
      vp.removeAttribute('tabindex');
      vp.removeAttribute('aria-label');
      this._ownTabindex = false;
    }
  }

  // --- geometry (C5 / C5a / C21) ---

  /** @private */
  _mode() {
    const dir = getComputedStyle(this._viewport).direction;
    return scrollMode(dir, () => negativeRtlScroll(this.ownerDocument));
  }

  /** @private Current logical position (no measure). */
  _pos() {
    if (!this._viewport || !this._geo) return 0;
    return readPos(this._viewport, this._geo.mode);
  }

  /** @private Measure slides → targets → controls; nothing when the strip is not rendered (hidden panel, C20). */
  _measure() {
    const vp = this._viewport;
    if (!vp || !this._slides) return;
    if (!vp.clientWidth) {
      this._geo = null;
      return;
    }
    const mode = this._mode();
    const cs = getComputedStyle(vp);
    const pad = parseFloat(cs.scrollPaddingInlineStart) || 0;
    const padEnd = parseFloat(cs.scrollPaddingInlineEnd) || 0;
    const maxPos = maxPosOf(vp);
    const pos = readPos(vp, mode);
    const box = contentBox(vp, vp.getBoundingClientRect());
    this._edges = this._slides.map((s) => slideEdges(s.getBoundingClientRect(), box, pos, mode));
    const view = vp.clientWidth;
    this._geo = { mode, pad, padEnd, maxPos, view, pos };
    this._pages = pageTargets(this._edges, { view, maxPos, pad, padEnd });
    this._steps = this.getAttribute('step') === 'slide' ? slideTargets(this._edges, { maxPos, pad }) : this._pages;
    this._layout();
    this._update();
  }

  /** @private C21: host attributes for the CSS, dots, DOM order. */
  _layout() {
    const P = this._pages.length;
    const lay = controlsLayout(P, this.getAttribute('dots'));
    const set = (n, v) => { if (this.getAttribute(n) !== v) this.setAttribute(n, v); };
    set('data-td-pages', String(P));
    set('data-td-rows-narrow', String(lay.narrow));
    set('data-td-rows-wide', String(lay.wide));
    if (this._controls.hidden !== lay.hidden) {
      if (lay.hidden && this._controls.contains(this.ownerDocument.activeElement)) this._viewport.focus?.({ preventScroll: true });
      this._controls.hidden = lay.hidden;
    }
    // dots: one button per page (kept nodes; a removed focused dot hands focus to the last one / next)
    const L = this._L();
    const want = lay.narrow || lay.wide ? P : 0;
    const dots = [...this._dots.children];
    const active = this.ownerDocument.activeElement;
    let lostFocus = false;
    while (dots.length > want) {
      const d = dots.pop();
      if (d === active) lostFocus = true;
      d.remove();
    }
    while (dots.length < want) {
      const d = el('button', 'td-carousel__dot', { type: 'button' });
      this._dots.appendChild(d);
      dots.push(d);
    }
    dots.forEach((d, i) => {
      const name = fillTemplate(String(L.dot), { n: String(i + 1), total: String(P) });
      if (d.getAttribute('aria-label') !== name) d.setAttribute('aria-label', name);
    });
    if (lostFocus) (dots[dots.length - 1] || this._nextBtn).focus({ preventScroll: true });
    // inline layout = the dots between the buttons (only when the wide layout is the one shown)
    const wide = this._isWide();
    this._placeParts(this._controls, this._prevBtn, this._counter, this._nextBtn, this._dots, wide && lay.wide === 'inline');
  }

  /** @private The container is ≥ 480px (the container query of carousel.css; viewport width where unsupported). */
  _isWide() {
    const cq = typeof CSS !== 'undefined' && CSS.supports?.('container-type: inline-size');
    const w = cq ? this.clientWidth : window.innerWidth;
    return w >= 480;
  }

  /** @private Current page → dots, counter, disabled ends (cheap: during scroll). */
  _update() {
    if (!this._geo) return;
    const pos = this._pos();
    const page = nearestIndex(this._pages, pos);
    const P = this._pages.length;
    [...this._dots.children].forEach((d, i) => {
      if (i === page) {
        if (d.getAttribute('aria-current') !== 'true') d.setAttribute('aria-current', 'true');
      } else if (d.hasAttribute('aria-current')) d.removeAttribute('aria-current');
    });
    const text = `${page + 1} / ${P}`;
    if (this._counter.textContent !== text) this._counter.textContent = text;
    const atStart = pos <= EPS;
    const atEnd = pos >= this._geo.maxPos - EPS;
    for (const [b, off] of [[this._prevBtn, atStart], [this._nextBtn, atEnd]]) {
      if (off) {
        if (b.getAttribute('aria-disabled') !== 'true') b.setAttribute('aria-disabled', 'true');
      } else if (b.hasAttribute('aria-disabled')) b.removeAttribute('aria-disabled');
    }
  }

  // --- scrolling (C6) ---

  /** @private */
  _go(target, reason) {
    if (target == null || !this._viewport) return;
    if (!this._geo) this._measure();
    if (!this._geo) return;
    const pos = this._pos();
    if (Math.abs(target - pos) <= EPS) return;
    this._reason = reason;
    const smooth = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: no-preference)').matches;
    this._viewport.scrollTo({ left: toScrollLeft(target, this._geo.maxPos, this._geo.mode), behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) requestAnimationFrame(() => this._settle());
  }

  /** @private */
  _onScroll() {
    if (!this._raf) {
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._update();
      });
    }
    if (!('onscrollend' in window)) {
      clearTimeout(this._settleTimer);
      this._settleTimer = setTimeout(() => {
        this._settleTimer = 0;
        this._settle();
      }, SETTLE_MS);
    }
  }

  /** @private A scroll came to rest: current slide, `slide-change` (once per new index), live region after a move. */
  _settle() {
    if (!this._geo || !this._edges.length) return;
    this._update();
    const pos = this._pos();
    const index = firstVisible(this._edges, pos, this._geo.pad);
    this._index = index;
    this._anchor = index;
    const reason = this._reason || 'scroll';
    this._reason = null;
    if (reason !== 'scroll') this._announce(pos);
    if (index === this._emitted) return;
    this._emitted = index;
    this.emit('slide-change', { index, page: nearestIndex(this._pages, pos), pageCount: this._pages.length, reason });
  }

  /** @private C9: "Mục 3–4 / 8" (or "Mục 3 / 8"). */
  _announce(pos) {
    const L = this._L();
    const [a, b] = visibleRange(this._edges, pos, this._geo);
    const total = String(this._edges.length);
    const text = a === b
      ? fillTemplate(String(L.statusOne), { n: String(a + 1), total })
      : fillTemplate(String(L.status), { from: String(a + 1), to: String(b + 1), total });
    const s = this._status;
    if (s.textContent === text) s.textContent = '';
    queueMicrotask(() => { s.textContent = text; });
  }

  /** @private Direct element children that are not frame parts → moved into the track (they become slides). */
  _adoptStray() {
    if (!this._track) return;
    const stray = [...this.children].filter((n) => n !== this._viewport && n !== this._controls && n !== this._status);
    if (stray.length) this._track.append(...stray);
  }

  /** @private Resize / rotate: re-measure; when the WIDTH changed, keep the first slide in view (C5). */
  _onResize() {
    const anchor = this._anchor;
    const before = this._geo?.view;
    this._measure();
    if (!this._geo || !this._edges.length || before === this._geo.view) return;
    const t = targetForSlide(this._pages, this._edges, Math.min(anchor, this._edges.length - 1), this._geo.pad);
    if (Math.abs(this._pos() - t) > EPS) {
      this._viewport.scrollTo({ left: toScrollLeft(t, this._geo.maxPos, this._geo.mode), behavior: 'auto' });
      this._update();
    }
  }

  /** @private Buttons / dots (Enter / Space are native clicks). */
  _onClick(e) {
    const t = e.target instanceof Element ? e.target.closest('button') : null;
    if (!t || !this._controls.contains(t)) return;
    if (t.getAttribute('aria-disabled') === 'true') return;
    if (!this._geo) this._measure();
    if (t === this._prevBtn) this._go(prevTarget(this._steps, this._pos()), 'button');
    else if (t === this._nextBtn) this._go(nextTarget(this._steps, this._pos()), 'button');
    else if (t.classList.contains('td-carousel__dot')) {
      const i = [...this._dots.children].indexOf(t);
      if (i >= 0) this._go(this._pages[i], 'dot');
    }
  }
}

if (!customElements.get('td-carousel')) {
  customElements.define('td-carousel', TdCarousel);
}
