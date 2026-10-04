/**
 * TdLightbox — image/video viewer (token-native, ADR 0009). Plan: docs/internal/plans/v0.6.0-lightbox.md.
 *
 *   const lb = TdLightbox.open(items, options);       // → handle | null
 *   const unbind = TdLightbox.bind(root, options);    // opt-in click delegation
 *
 * Small core; every site-specific concern is a hook (`download`, `downloads`, `video`, `history`, `panel`, `toolbar`,
 * `isAllowedUrl`, `isForeignLayerOpen`, `labels`). No side effects on import, no window globals, no
 * inline `style=""`/injected `<style>` (CSSOM only for continuous values) — styles live in td.css
 * (`src/styles/components/lightbox.css`).
 *
 * @typedef {{ type?: 'image'|'video', src: string, poster?: string, thumb?: string, caption?: string, alt?: string,
 *             provider?: string, data?: * }} TdLightboxItem
 *
 * v0.24.0 (docs/internal/plans/v0.24.0-lightbox-nav.md): side navigation (the SAME prev / next buttons move between the
 * toolbar and a nav mount in the column — `data-nav="side|side-compact|toolbar"`), adjacent preload, an error state with
 * Retry / Next, an optional filmstrip (`filmstrip: false|true|'auto'`, `item.thumb`) and a direction-aware slide.
 */

import { lockScroll } from '../utils/scroll-lock.js';
import {
  LAYERS, register as registerLayer, hasActiveAbove, trapTab, setFocusHandoff, clearFocusHandoff, restoreFocus, followFocusHandoff,
  floatingContains, coverFloatingIn,
} from '../utils/layers.js';
import { TdMenu, sanitizeDownloadName } from './td-menu.js';

const LIGHTBOX_LAYER = LAYERS.lightbox; // --td-z-lightbox
import { tdIcon } from '../icons/td-icon.js';

const DEFAULT_LABELS = {
  dialog: 'Trình xem ảnh',
  prev: 'Ảnh trước',
  next: 'Ảnh sau',
  close: 'Đóng',
  back: 'Quay lại',
  fullscreen: 'Toàn màn hình',
  download: 'Tải xuống',
  info: 'Thông tin ảnh',
  more: 'Thêm',
  counter: (i, n) => `${i} / ${n}`,
  loadError: 'Không tải được ảnh',
  retry: 'Thử lại',
  thumb: (n) => `Ảnh ${n}`,
};
/** Labels that are functions (the rest are strings). */
const FN_LABELS = new Set(['counter', 'thumb']);

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
const SWIPE_NAV = 50;      // px, horizontal → navigate
const SWIPE_CLOSE = 90;    // px, down → close (dearer than navigating: it loses context)
const SWIPE_SHEET = 60;    // px, up → open the info sheet (undoable → cheaper)
const DOUBLE_TAP_MS = 300;
const MOVE_SLOP = 8;
const MAX_ZOOM = 4;
const CLOSE_DOWN_MS = 190; // fixed timer, not transitionend (never fires under reduced motion / hidden tab)
const NAV_DISC = 48;       // px, side-nav disc (video / zoomed)
const NAV_DISC_GAP = 16;   // px, disc inset from the column edge
const FILMSTRIP_AUTO = 8;  // `filmstrip: 'auto'` → shown from this many items
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/* ------------------------------------------------------------------ helpers */

/** Chrome icon from the shared registry (src/icons) — one geometry source for every button. */
function icon(name) {
  return tdIcon(name, { class: 'td-lightbox__icon' });
}

/**
 * @param {string} tag
 * @param {Record<string, string|boolean>} [attrs]
 * @param {Node[]} [children]
 */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const c of children) el.appendChild(c);
  return el;
}

/**
 * Default URL policy (fail-closed): `https:` always; `http:` only when the page itself is `http:`
 * (no cleartext downgrade from an HTTPS page). Other schemes (data:, blob:, file:, app schemes)
 * must be opted into by the site via `isAllowedUrl`.
 */
export function defaultIsAllowedUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  let u;
  try {
    u = new URL(url, baseUrl()); // v0.24.0 SEC-02: resolved like the browser resolves it (honours <base href>)
  } catch {
    return false;
  }
  return u.protocol === 'https:' || (u.protocol === 'http:' && location.protocol === 'http:');
}

/** The base the browser resolves relative URLs against (`<base href>` aware). */
function baseUrl() {
  return typeof document !== 'undefined' && document.baseURI ? document.baseURI : location.href;
}

/**
 * v0.24.0 SEC-02: canonicalise ONCE (`new URL(raw, document.baseURI).href`), run the policy on that canonical URL and
 * return it — so the URL the policy approved is exactly the URL the browser loads (no `<base href>` disagreement).
 */
function allowed(url, item, isAllowedUrl) {
  if (typeof url !== 'string' || !url.trim()) return '';
  let canonical;
  try {
    canonical = new URL(url, baseUrl()).href;
  } catch {
    return '';
  }
  try {
    return isAllowedUrl(canonical, item) ? canonical : '';
  } catch {
    return '';
  }
}

/**
 * Normalize one input item. Returns a sanitized copy or null when nothing viewable remains.
 * @param {*} raw
 * @param {Function} isAllowedUrl
 * @returns {TdLightboxItem|null}
 */
function normalizeItem(raw, isAllowedUrl) {
  const input = typeof raw === 'string' ? { src: raw } : raw;
  if (!input || typeof input !== 'object') return null;
  const type = input.type === 'video' ? 'video' : 'image';
  const item = {
    type,
    src: '',
    poster: '',
    caption: typeof input.caption === 'string' ? input.caption : '',
    alt: typeof input.alt === 'string' ? input.alt : '',
    provider: typeof input.provider === 'string' && input.provider ? input.provider : 'html5',
    data: input.data,
  };
  item.src = allowed(input.src, input, isAllowedUrl);
  item.poster = allowed(input.poster, input, isAllowedUrl);
  item.thumb = allowed(input.thumb, input, isAllowedUrl); // v0.24.0 filmstrip thumbnail (same policy as src)
  if (!item.src) return null; // every item needs an allowed src (video poster is only a fallback)
  return item;
}

function mergeLabels(labels) {
  const out = { ...DEFAULT_LABELS };
  if (labels && typeof labels === 'object') {
    for (const k of Object.keys(DEFAULT_LABELS)) {
      if (FN_LABELS.has(k)) {
        if (typeof labels[k] === 'function') out[k] = labels[k];
      } else if (typeof labels[k] === 'string') {
        out[k] = labels[k];
      }
    }
  }
  return out;
}

function sameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function fileNameOf(url) {
  try {
    const name = new URL(url, location.href).pathname.split('/').pop();
    return name ? decodeURIComponent(name) : 'image';
  } catch {
    return 'image';
  }
}

/** Default video hook: native <video> for html5 sources; other providers decline (→ poster). */
function defaultVideo(item, mount) {
  if (item.provider !== 'html5' || !item.src) return null;
  const video = h('video', { class: 'td-lightbox__video-el', controls: true, playsinline: true, preload: 'metadata' });
  video.src = item.src;
  if (item.poster) video.poster = item.poster;
  mount.appendChild(video);
  return {
    destroy() {
      try { video.pause(); } catch { /* ignore */ }
      video.removeAttribute('src');
      try { video.load(); } catch { /* ignore */ }
      video.remove();
    },
  };
}

function safeDestroy(player) {
  if (player && typeof player.destroy === 'function') {
    try { player.destroy(); } catch { /* a throwing destroy never blocks teardown */ }
  }
}

/* ------------------------------------------------------------------ history */

/** `history: true` — the built-in adapter (same code path as custom adapters). */
const builtinHistory = {
  push(token) {
    const prev = history.state && typeof history.state === 'object' ? history.state : {};
    history.pushState({ ...prev, tdLightbox: token }, '');
  },
  back() {
    history.back();
  },
  onPop(cb) {
    const listener = () => cb();
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  },
};

function resolveHistoryAdapter(opt) {
  if (opt === true) return builtinHistory;
  if (opt && typeof opt.push === 'function' && typeof opt.back === 'function' && typeof opt.onPop === 'function') {
    return opt;
  }
  return null;
}

// Module-level: history operations can outlive the viewer that started them.
const hist = { pendingPush: 0, pendingBack: 0, unsub: null, adapter: null };

function histUnsettled() {
  return hist.pendingPush > 0 || hist.pendingBack > 0;
}

function histEnsureSub(adapter) {
  if (hist.unsub) return;
  hist.adapter = adapter;
  let u = null;
  try {
    u = adapter.onPop(onHistoryPop);
  } catch {
    u = null;
  }
  hist.unsub = typeof u === 'function' ? u : () => {};
}

function histMaybeUnsub() {
  const live = viewer && !viewer.closed && viewer.hist.state === 'pushed';
  if (!live && !histUnsettled() && hist.unsub) {
    try { hist.unsub(); } catch { /* ignore */ }
    hist.unsub = null;
    hist.adapter = null;
  }
}

/** Programmatic back; its pop is consumed by `onHistoryPop`. Failure un-counts it. */
function histBack(adapter) {
  hist.pendingBack += 1;
  histEnsureSub(adapter);
  let settled = false;
  const undo = () => {
    if (settled) return;
    settled = true;
    hist.pendingBack = Math.max(0, hist.pendingBack - 1);
    histMaybeUnsub();
  };
  let r;
  try {
    r = adapter.back();
  } catch {
    undo();
    return;
  }
  if (r && typeof r.then === 'function') {
    r.then(() => { settled = true; }, undo);
  }
}

/** @param {{state: string, closed: boolean}} rec per-viewer history record */
function histPush(rec, adapter, token) {
  if (!adapter || histUnsettled()) return; // earlier op unsettled → this viewer runs history-less
  rec.state = 'pushing';
  hist.pendingPush += 1;
  const ok = () => {
    hist.pendingPush = Math.max(0, hist.pendingPush - 1);
    if (rec.closed) {
      rec.state = 'none';
      histBack(adapter); // closed while pushing → unwind our own entry
    } else {
      rec.state = 'pushed';
      histEnsureSub(adapter);
    }
    histMaybeUnsub();
  };
  const fail = () => {
    hist.pendingPush = Math.max(0, hist.pendingPush - 1);
    rec.state = 'none';
    histMaybeUnsub();
  };
  let r;
  try {
    r = adapter.push(token);
  } catch {
    fail();
    return;
  }
  if (r && typeof r.then === 'function') r.then(ok, fail);
  else ok();
}

function onHistoryPop() {
  if (hist.pendingBack > 0) {
    hist.pendingBack -= 1; // the pop our own back() produced
    histMaybeUnsub();
    return;
  }
  if (viewer && !viewer.closed && viewer.hist.state === 'pushed') {
    viewer.hist.state = 'none'; // the entry is already gone — close without calling back()
    closeViewer();
  }
  histMaybeUnsub();
}

/* ------------------------------------------------------------------ state */

/** @type {null|Record<string, HTMLElement>} */
let ui = null;
/** Open lifetime (focus, scroll, inert, history). */
let viewer = null;
/** Current gallery session (replaced by a re-entrant open). */
let session = null;
let lifecycle = 'closed'; // 'closed' | 'open'
let tokenSeq = 0;
/** Timers of transient UI states (cleared on navigate/close so they never touch another session). */
const timers = { zoom: 0, closeDown: 0 };
/** Set by bindPanelSwipe(): forgets an in-flight sheet swipe. */
let resetPanelSwipe = () => {};
/** Toolbar buttons added by the current open (removed on the next open and on close). */
let extras = new Map();
let renderToken = 0;
let zoom = { scale: 1, x: 0, y: 0 };

/**
 * A keyboard boundary above the viewer — a modal / popup / loading opened over it. v0.21.1: a modal BELOW (the viewer
 * was opened from it and promoted above it) no longer counts. Decided by the registry order (layer, then opening
 * order), so a modal opened later at the same capped band layer still counts as above.
 */
function isForeignLayerOpenDefault() {
  return viewer && viewer.layer ? !viewer.layer.isTop() : hasActiveAbove(LIGHTBOX_LAYER);
}

function ctxOf() {
  if (!session) return null;
  return {
    index: session.index,
    count: session.items.length,
    item: session.items[session.index] || null,
    token: session.token,
    handle: session.handle,
    itemEl: itemElOf(session.items[session.index]),
    groupEl: session.groupEl,
  };
}

/** The item's source element (bind() stores it in item.data), else null. */
function itemElOf(item) {
  return item && typeof Element !== 'undefined' && item.data instanceof Element ? item.data : null;
}

/** Event detail (td-lightbox-open|change|close): index, count, token, item + itemEl / groupEl (v0.15.0). */
function detailOf() {
  const item = session.items[session.index];
  return { index: session.index, count: session.items.length, token: session.token, item, itemEl: itemElOf(item), groupEl: session.groupEl };
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ------------------------------------------------------------------ DOM */

function build() {
  if (ui) return ui;
  const btn = (cls, iconName, extra = {}) => {
    const b = h('button', { type: 'button', class: `td-lightbox__btn ${cls}`.trim(), ...extra });
    b.appendChild(icon(iconName));
    return b;
  };

  const backdrop = h('div', { class: 'td-lightbox__backdrop' });
  const backBtn = btn('td-lightbox__back', 'back', { hidden: true });
  // v0.24.0: a polite live region → "2 / 5" is read on every slide change without moving focus.
  const counter = h('div', {
    class: 'td-lightbox__counter td-glass-surface td-glass-surface--clear', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  const lead = h('div', { class: 'td-lightbox__lead' }, [backBtn, counter]);
  const spinner = h('div', { class: 'td-lightbox__spinner', hidden: true });
  const img = h('img', { class: 'td-lightbox__img', alt: '', draggable: 'false' });
  const videoMount = h('div', { class: 'td-lightbox__video', hidden: true });
  // v0.24.0 N3: image error state (text via textContent; Retry reloads the same src under a new token).
  const errorText = h('p', { class: 'td-lightbox__error-text' });
  const retryBtn = h('button', { type: 'button', class: 'td-lightbox__error-btn', 'data-action': 'retry' });
  const errorNextBtn = h('button', { type: 'button', class: 'td-lightbox__error-btn', 'data-action': 'error-next' });
  const errorIcon = icon('image');
  const error = h('div', { class: 'td-lightbox__error', role: 'alert', hidden: true }, [
    errorIcon, errorText, h('div', { class: 'td-lightbox__error-actions' }, [retryBtn, errorNextBtn]),
  ]);
  const stage = h('div', { class: 'td-lightbox__stage' }, [spinner, img, videoMount, error]);
  // v0.24.0 N1: the nav mount (side strips) — prev / next are MOVED here on a fine pointer (never cloned).
  const nav = h('div', { class: 'td-lightbox__nav' });
  // v0.24.0 N4: optional filmstrip (second row of the column).
  const filmstrip = h('div', { class: 'td-lightbox__filmstrip', hidden: true });
  const col = h('div', { class: 'td-lightbox__col' }, [stage, nav, filmstrip]);
  const caption = h('div', { class: 'td-lightbox__caption', hidden: true });
  const grab = h('button', { type: 'button', class: 'td-lightbox__grab', 'aria-expanded': 'false' }, [
    h('span', { class: 'td-lightbox__grab-bar', 'aria-hidden': 'true' }),
  ]);
  const panelBody = h('div', { class: 'td-lightbox__panel-body' });
  const panel = h('aside', { class: 'td-lightbox__panel', hidden: true }, [grab, panelBody]);
  const prevBtn = btn('', 'prev', { 'data-action': 'prev' });
  const nextBtn = btn('', 'next', { 'data-action': 'next' });
  // v0.36.0 (plan QĐ 59): `data-overflow` → moved into the "Thêm" menu below 480 px (CSS); never shown there itself.
  const fsBtn = btn('', 'fullscreen', { 'data-action': 'fullscreen', 'data-overflow': true });
  const dlBtn = h('a', { class: 'td-lightbox__btn', 'data-action': 'download', hidden: true });
  dlBtn.appendChild(icon('download'));
  // ≥ 2 download variants (E6): the same icon, but a menu button opening a TdMenu of `<a download>` items.
  const dlMenuBtn = btn('', 'download', { 'data-action': 'downloads', hidden: true });
  // v0.36.0 (plan QĐ 59): overflow menu button, shown only below 480 px (CSS) AND while something overflows (JS).
  const moreBtn = btn('td-lightbox__more', 'more', { 'data-action': 'more', hidden: true });
  const closeBtn = btn('td-lightbox__close', 'close', { 'data-action': 'close' });
  const toolbar = h('div', { class: 'td-lightbox__toolbar td-glass-surface td-glass-surface--clear' }, [
    prevBtn, nextBtn, fsBtn, dlBtn, dlMenuBtn, moreBtn, closeBtn,
  ]);
  const overlay = h('div', { class: 'td-lightbox', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, [
    backdrop, lead, col, caption, panel, toolbar,
  ]);

  document.body.appendChild(overlay);
  ui = { overlay, backdrop, lead, backBtn, counter, col, stage, spinner, img, videoMount, caption, panel, grab,
    panelBody, toolbar, prevBtn, nextBtn, fsBtn, dlBtn, dlMenuBtn, moreBtn, closeBtn, nav, filmstrip, error, errorText, retryBtn,
    errorNextBtn };

  backdrop.addEventListener('click', onBackdropClick);
  closeBtn.addEventListener('click', () => closeViewer());
  backBtn.addEventListener('click', () => closeViewer());
  prevBtn.addEventListener('click', (e) => onNavClick(e, -1));
  nextBtn.addEventListener('click', (e) => onNavClick(e, 1));
  retryBtn.addEventListener('click', retryImage);
  errorNextBtn.addEventListener('click', () => navigate(1));
  filmstrip.addEventListener('click', onThumbClick);
  fsBtn.addEventListener('click', toggleFullscreen);
  // Lazy items (the current slide's variants) + the lightbox's own URL policy with the item being viewed (the menu
  // closes on every slide change, so the item at open time is the one on screen).
  TdMenu.bind(dlMenuBtn, downloadMenuItems, { align: 'end', isAllowedUrl: downloadMenuPolicy });
  TdMenu.bind(moreBtn, overflowMenuItems, { align: 'end' });
  grab.addEventListener('click', (e) => { e.stopPropagation(); setSheet(ui.panel.getAttribute('data-sheet') !== 'open'); });
  bindPanelSwipe(panel);
  bindPointer(col);
  // Video players resize (async hooks, metadata) → re-decide the nav mode (v0.24.0 N1; observed while open).
  if (typeof ResizeObserver === 'function') navResize = new ResizeObserver(scheduleNavSync);
  return ui;
}

function applyLabels(labels) {
  ui.overlay.setAttribute('aria-label', labels.dialog);
  const set = (el, text) => { el.setAttribute('aria-label', text); el.title = text; };
  set(ui.backBtn, labels.back);
  set(ui.prevBtn, labels.prev);
  set(ui.nextBtn, labels.next);
  set(ui.fsBtn, labels.fullscreen);
  set(ui.dlBtn, labels.download);
  set(ui.dlMenuBtn, labels.download);
  set(ui.moreBtn, labels.more);
  set(ui.closeBtn, labels.close);
  ui.grab.setAttribute('aria-label', labels.info);
}

/* ------------------------------------------------------------------ toolbar extras */

function unmountToolbar() {
  for (const { button } of extras.values()) button.remove();
  extras = new Map();
}

function mountToolbar(specs) {
  unmountToolbar();
  if (!Array.isArray(specs)) return;
  for (const spec of specs) {
    if (spec && extras.has(spec.id)) continue; // first wins inside one options.toolbar list
    addExtra(spec);
  }
}

/** Build one extra toolbar button (spec validated); returns its button or null. Replaces nothing. */
function addExtra(spec) {
  if (!spec || typeof spec.id !== 'string' || !spec.id || typeof spec.onClick !== 'function') return null;
  const label = typeof spec.label === 'string' && spec.label ? spec.label : spec.id;
  const b = h('button', { type: 'button', class: 'td-lightbox__btn', 'data-extra': spec.id, 'aria-label': label });
  b.title = label;
  // `icon`: a registry name (core or registerIcons()). `iconNode`: a TRUSTED SVGElement the site
  // built itself (cloned). Never markup strings. No icon → the label is shown as text.
  const named = typeof spec.icon === 'string' ? icon(spec.icon) : null;
  if (named) {
    b.appendChild(named);
  } else if (typeof SVGElement !== 'undefined' && spec.iconNode instanceof SVGElement) {
    const svg = spec.iconNode.cloneNode(true);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    b.appendChild(svg);
  } else {
    b.textContent = label;
    b.setAttribute('data-text', '');
  }
  const token = session.token;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!session || session.token !== token) return;
    try { spec.onClick(ctxOf(), b); } catch (err) { console.error('td-lightbox toolbar onClick', err); }
  });
  ui.toolbar.insertBefore(b, ui.moreBtn); // "Thêm" + close stay last
  extras.set(spec.id, { spec, button: b });
  return b;
}

/** Remove one extra button by id (only `button` when given — a stale remover never drops a replacement). */
function removeExtra(id, button) {
  const e = extras.get(id);
  if (!e || (button && e.button !== button)) return;
  e.button.remove();
  extras.delete(id);
  syncOverflow();
}

function syncExtras(ctx) {
  for (const { spec, button } of extras.values()) {
    let visible = true;
    if (typeof spec.visible === 'function') {
      try { visible = spec.visible(ctx) !== false; } catch { visible = false; }
    }
    button.hidden = !visible;
  }
  syncOverflow();
}

/* ------------------------------------------------------------------ v0.36.0 QĐ 59: "Thêm" overflow (< 480 px) */

/**
 * Below 480 px (CSS `@media (max-width: 479.98px)`) the toolbar keeps only download, close, the first visible
 * `pinned: true` extra (e.g. a panel toggle) and the "Thêm" button; prev / next are dropped (swipe + arrow keys
 * still navigate) and every `[data-overflow]` control (fullscreen, the other extras) is listed in the menu instead.
 * JS only marks the controls and decides whether "Thêm" has anything to offer — no width threshold in JS.
 */
function syncOverflow() {
  if (!ui) return;
  let pinnedKept = false;
  let any = !ui.fsBtn.hidden;
  for (const { spec, button } of extras.values()) {
    const keep = !pinnedKept && spec.pinned === true && !button.hidden;
    if (keep) pinnedKept = true;
    button.toggleAttribute('data-overflow', !keep);
    if (!keep && !button.hidden) any = true;
  }
  ui.moreBtn.hidden = !any;
  if (!any && TdMenu.isOpen(ui.moreBtn)) TdMenu.close();
}

/** TdMenu items of "Thêm" (lazy: read at open) — the overflowed controls, in toolbar order; selecting one clicks it. */
function overflowMenuItems() {
  if (!session || lifecycle !== 'open') return null;
  const items = [];
  for (const b of ui.toolbar.querySelectorAll(':scope > [data-overflow]')) {
    if (b.hidden) continue;
    const ex = b.hasAttribute('data-extra') ? extras.get(b.getAttribute('data-extra')) : null;
    const label = b.getAttribute('aria-label') || '';
    const iconName = b === ui.fsBtn ? 'fullscreen' : ex && typeof ex.spec.icon === 'string' ? ex.spec.icon : '';
    items.push({ label, icon: iconName || undefined, onSelect: () => b.click() });
  }
  return items.length ? items : null;
}

/* ------------------------------------------------------------------ panel / sheet */

function setSheet(open) {
  if (!ui) return;
  if (open) ui.panel.setAttribute('data-sheet', 'open');
  else ui.panel.removeAttribute('data-sheet');
  ui.grab.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function syncPanel(ctx) {
  const p = session.opts.panel;
  let node = null;
  if (typeof p === 'function') {
    try {
      const r = p(ctx);
      node = r instanceof Element ? r : null; // nodes only — strings are ignored (no HTML injection path)
    } catch {
      node = null;
    }
  } else if (p === true) {
    const cap = ctx.item && ctx.item.caption ? ctx.item.caption.trim() : '';
    if (cap) {
      node = h('p', { class: 'td-lightbox__panel-caption' });
      node.textContent = cap;
    }
  }
  const on = !!node;
  if (!on) { // no panel → the mobile sheet is closed and any swipe in progress is dropped (v0.15.0)
    setSheet(false);
    resetPanelSwipe();
  }
  ui.overlay.toggleAttribute('data-panel', on);
  ui.panel.hidden = !on;
  ui.backBtn.hidden = !on;
  ui.panelBody.replaceChildren(...(node ? [node] : []));
  ui.panel.scrollTop = 0;
  syncNavMode(); // the column width changed
}

function bindPanelSwipe(panel) {
  // Touch events (as in dwp), not Pointer Events: the panel scrolls (overflow-y:auto, default touch-action), so the
  // browser claims the gesture and fires pointercancel — a pointer-based swipe would die silently (v0.15.0).
  let y0 = null;
  let atTop = true;
  resetPanelSwipe = () => { y0 = null; atTop = true; };
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { y0 = null; return; }
    y0 = e.touches[0].clientY;
    atTop = panel.scrollTop <= 0;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (y0 === null) return;
    const t = e.changedTouches[0];
    const dy = t ? t.clientY - y0 : 0;
    y0 = null;
    if (dy < -32) setSheet(true);
    else if (dy > 32 && atTop) setSheet(false);
  }, { passive: true });
  panel.addEventListener('touchcancel', () => { y0 = null; }, { passive: true });
}

/* ------------------------------------------------------------------ zoom */

function applyZoom() {
  ui.img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  ui.overlay.toggleAttribute('data-zoomed', zoom.scale > 1);
}

function resetZoom() {
  zoom = { scale: 1, x: 0, y: 0 };
  if (ui) {
    ui.img.style.transform = '';
    ui.img.style.willChange = '';
    ui.overlay.removeAttribute('data-zoomed');
  }
}

/**
 * The visible area is the CLIPPING column, not the stage that hugs the unzoomed image. With a filmstrip the stage is
 * the (clipping) first row of the column.
 */
function viewRect() {
  if (session && session.filmstrip) return ui.stage.getBoundingClientRect();
  return (ui.col.getBoundingClientRect().width ? ui.col : ui.stage).getBoundingClientRect();
}

function clampPan() {
  if (zoom.scale <= 1) { zoom.x = 0; zoom.y = 0; return; }
  const v = viewRect();
  const maxX = Math.max(0, (ui.img.offsetWidth * zoom.scale - v.width) / 2);
  const maxY = Math.max(0, (ui.img.offsetHeight * zoom.scale - v.height) / 2);
  zoom.x = Math.max(-maxX, Math.min(maxX, zoom.x));
  zoom.y = Math.max(-maxY, Math.min(maxY, zoom.y));
}

/** Animated zoom step: a named state (CSS owns the transition, so reduced motion disables it). */
function animateZoom() {
  const img = ui.img;
  img.setAttribute('data-zoom-anim', '');
  clearTimeout(timers.zoom);
  timers.zoom = setTimeout(() => {
    timers.zoom = 0;
    img.removeAttribute('data-zoom-anim');
    img.style.willChange = '';
  }, 350);
}

/** Toggle 2× at a viewport point (or reset). */
function toggleZoomAt(clientX, clientY) {
  animateZoom();
  if (zoom.scale > 1) {
    resetZoom();
    return;
  }
  const r = ui.img.getBoundingClientRect();
  zoom.scale = 2;
  zoom.x = 2 * (r.left + r.width / 2 - clientX);
  zoom.y = 2 * (r.top + r.height / 2 - clientY);
  clampPan();
  ui.img.style.willChange = 'transform';
  applyZoom();
}

/* ------------------------------------------------------------------ pointer gestures */

/** Set by bindPointer(): drops every in-flight pointer/gesture (called on navigate + close). */
let resetPointer = () => {};
/** Pointer type of the latest pointerdown in the column (v0.24.0: touch / pen never activate a side strip). */
let lastPointerType = '';
/** A mouse press on a side strip: activates on its click unless it moved > MOVE_SLOP or was cancelled. */
let navPress = null;
/** Target of the latest pointerdown in the column (a click closes only when it also STARTED on the background). */
let lastDownTarget = null;

const inSideNav = (t) => t instanceof Element && !!t.closest('.td-lightbox__nav') && !!t.closest('.td-lightbox__btn');
/** Filmstrip (native horizontal scroll) and the error block (plain buttons) never take part in gestures. */
const outsideGestures = (t) => t instanceof Element && !!t.closest('.td-lightbox__filmstrip, .td-lightbox__error');
const isBackground = (t) => !!ui && (t === ui.col || t === ui.stage || t === ui.nav);

/**
 * One pointer surface for the whole column (stage + side strips), v0.24.0. Classified at pointerdown:
 *  (a) mouse on a side strip → a navigation candidate (no pan / zoom; the button's click activates it);
 *  (b) touch / pen anywhere (strips included) → the swipe / pinch / double-tap path; a strip never activates;
 *  (c) mouse elsewhere → zoom / pan as before. Filmstrip / error events are left alone.
 */
function bindPointer(col) {
  const pointers = new Map();
  let g = null;           // current gesture
  let lastTap = { t: 0, x: 0, y: 0 };
  let raf = 0;

  resetPointer = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    for (const id of pointers.keys()) {
      try { col.releasePointerCapture(id); } catch { /* not captured */ }
    }
    pointers.clear();
    g = null;
    navPress = null;
    lastTap = { t: 0, x: 0, y: 0 };
    if (ui) {
      ui.overlay.removeAttribute('data-dragging');
      ui.overlay.style.removeProperty('--td-lb-drag');
    }
  };

  const dist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const schedule = (fn) => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; fn(); });
  };
  const clearDrag = () => {
    ui.overlay.removeAttribute('data-dragging');
    ui.overlay.style.removeProperty('--td-lb-drag');
  };

  // A click on the background closes — only when the press also started there (pointer capture retargets the click
  // of a press on the image to the column, which must not close).
  col.addEventListener('click', (e) => {
    const down = lastDownTarget;
    lastDownTarget = null;
    if (!isBackground(e.target)) return;
    if (down && !isBackground(down)) return;
    onBackdropClick();
  });

  col.addEventListener('pointerdown', (e) => {
    if (!session) return;
    lastDownTarget = e.target;
    if (outsideGestures(e.target)) return;
    lastPointerType = e.pointerType || '';
    if (inSideNav(e.target) && e.pointerType === 'mouse') {
      navPress = e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null;
      return; // (a) never starts a pan / zoom
    }
    if (isVideoSlide()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { col.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    if (pointers.size === 2) {
      g = { type: 'pinch', startDist: dist() || 1, startScale: zoom.scale };
      ui.img.style.willChange = 'transform';
      clearDrag();
    } else if (pointers.size === 1) {
      g = { type: 'single', kind: e.pointerType, x0: e.clientX, y0: e.clientY, zx: zoom.x, zy: zoom.y,
        moved: false, onImg: e.target === ui.img, pinched: false };
    }
  });

  col.addEventListener('pointermove', (e) => {
    if (!session) return;
    if (navPress && e.pointerId === navPress.id
      && Math.hypot(e.clientX - navPress.x, e.clientY - navPress.y) > MOVE_SLOP) navPress.moved = true;
    if (isVideoSlide()) return;
    if (!pointers.has(e.pointerId) && outsideGestures(e.target)) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Mouse hover-pan while zoomed (no button held).
    if (e.pointerType === 'mouse' && !pointers.size && zoom.scale > 1) {
      const r = viewRect();
      const rx = (e.clientX - r.left) / r.width - 0.5;
      const ry = (e.clientY - r.top) / r.height - 0.5;
      const maxX = Math.max(0, (ui.img.offsetWidth * zoom.scale - r.width) / 2);
      const maxY = Math.max(0, (ui.img.offsetHeight * zoom.scale - r.height) / 2);
      zoom.x = -rx * maxX * 2;
      zoom.y = -ry * maxY * 2;
      clampPan();
      applyZoom();
      return;
    }
    if (!g) return;

    if (g.type === 'pinch' && pointers.size >= 2) {
      const d = dist();
      schedule(() => {
        zoom.scale = Math.max(1, Math.min(MAX_ZOOM, g ? g.startScale * (d / g.startDist) : zoom.scale));
        clampPan();
        applyZoom();
      });
      return;
    }
    if (g.type !== 'single') return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.moved && Math.abs(dx) < MOVE_SLOP && Math.abs(dy) < MOVE_SLOP) return;
    g.moved = true;

    if (zoom.scale > 1) {
      if (e.pointerType === 'mouse') return; // mouse pans by hover, not drag
      schedule(() => {
        if (!g) return;
        zoom.x = g.zx + dx;
        zoom.y = g.zy + dy;
        clampPan();
        applyZoom();
      });
      return;
    }
    if (e.pointerType === 'mouse') return; // swipes are touch/pen gestures
    // Swipe-down feedback: the stage follows the finger (CSS reads --td-lb-drag; zoom owns img transform).
    if (dy > MOVE_SLOP && dy > Math.abs(dx)) {
      ui.overlay.setAttribute('data-dragging', '');
      ui.overlay.style.setProperty('--td-lb-drag', `${dy}px`);
    } else if (dy <= 0) {
      clearDrag();
    }
  });

  const end = (e) => {
    if (navPress && e.pointerId === navPress.id && e.type === 'pointercancel') navPress.moved = true;
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!g || !session) { g = null; return; }

    if (g.type === 'pinch') {
      if (pointers.size < 2) {
        if (zoom.scale <= 1.05) { animateZoom(); resetZoom(); } else { ui.img.style.willChange = ''; }
        // A pinch never turns into a swipe/tap: keep a dead single gesture until all fingers lift.
        g = pointers.size ? { type: 'dead' } : null;
      }
      return;
    }
    if (g.type === 'dead') { if (!pointers.size) g = null; return; }

    const gesture = g;
    g = null;
    clearDrag();
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;

    if (!gesture.moved) {
      if (gesture.kind === 'mouse') {
        if (gesture.onImg) toggleZoomAt(e.clientX, e.clientY);
        return;
      }
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24;
      if (now - lastTap.t < DOUBLE_TAP_MS && near) {
        lastTap = { t: 0, x: 0, y: 0 };
        toggleZoomAt(e.clientX, e.clientY);
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (zoom.scale > 1 || gesture.kind === 'mouse') return; // that was a pan
    if (dy < -SWIPE_SHEET && Math.abs(dy) > Math.abs(dx) && !ui.panel.hidden
      && ui.panel.getAttribute('data-sheet') !== 'open') {
      setSheet(true);
      return;
    }
    if (dy > SWIPE_CLOSE && dy > Math.abs(dx)) {
      closeDown();
      return;
    }
    if (Math.abs(dx) > SWIPE_NAV && Math.abs(dx) > Math.abs(dy)) navigate(dx < 0 ? 1 : -1);
  };
  col.addEventListener('pointerup', end);
  col.addEventListener('pointercancel', end);
}

/**
 * prev / next click. In the side strips (v0.24.0) a pointer click activates only for a mouse press that did not move
 * > MOVE_SLOP; a click produced by touch / pen is ignored (those use swipes). Keyboard clicks (detail 0) always work.
 */
function onNavClick(e, dir) {
  const press = navPress;
  navPress = null;
  if (ui && e.currentTarget instanceof Element && e.currentTarget.parentElement === ui.nav && e.detail > 0) {
    const type = typeof e.pointerType === 'string' && e.pointerType ? e.pointerType : lastPointerType;
    if (type && type !== 'mouse') return;
    if (press && press.moved) return;
  }
  navigate(dir);
}

function closeDown() {
  const token = session && session.token;
  ui.overlay.setAttribute('data-closing-down', '');
  clearTimeout(timers.closeDown);
  timers.closeDown = setTimeout(() => {
    timers.closeDown = 0;
    if (session && session.token === token) closeViewer(); // closeViewer clears the state
  }, CLOSE_DOWN_MS);
}

/** Drop every transient interaction state (pointer, sheet swipe, zoom animation, swipe-close). */
function resetTransient() {
  resetPointer();
  resetPanelSwipe();
  clearTimeout(timers.zoom);
  clearTimeout(timers.closeDown);
  timers.zoom = 0;
  timers.closeDown = 0;
  if (ui) {
    ui.img.removeAttribute('data-zoom-anim');
    ui.overlay.removeAttribute('data-closing-down');
  }
}

/* ------------------------------------------------------------------ keyboard / focus */

function isForeign() {
  try { return !!session.opts.isForeignLayerOpen(); } catch { return false; }
}

/** Escape (via the layer dispatcher: only while the lightbox is the top keyboard boundary). */
function onLayerEscape(e) {
  if (lifecycle !== 'open' || !session || isForeign()) return false; // the layer on top owns the keyboard
  if (e.defaultPrevented) return false;
  if (e.target instanceof Node && ui.videoMount.contains(e.target)) return false; // media keys belong to the player
  closeViewer();
  return true;
}

/** Tab ALWAYS stays in the dialog (plus toasts), unless a site-declared foreign layer is on top. */
function onLayerTab(e) {
  if (lifecycle !== 'open' || !session || isForeign()) return 'pass';
  return trapTab(e, ui.overlay, LIGHTBOX_LAYER);
}

function onKeydown(e) {
  if (lifecycle !== 'open' || !session) return;
  if (isForeign()) return; // the layer on top owns the keyboard
  if (e.key === 'Tab' || e.key === 'Escape') return; // routed by the layer dispatcher (onLayerTab/onLayerEscape)
  if (e.defaultPrevented) return;
  if (e.target instanceof Node && ui.videoMount.contains(e.target)) return; // media keys belong to the player
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // RTL (v0.24.0): <- is "next" (the arrows follow the reading direction, like the side strips).
  const rtl = getComputedStyle(ui.overlay).direction === 'rtl';
  if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(rtl ? 1 : -1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(rtl ? -1 : 1); }
  else if (e.key === 'f' || e.key === 'F') {
    if (!ui.fsBtn.hidden) { e.preventDefault(); toggleFullscreen(); }
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (ui.overlay.requestFullscreen) ui.overlay.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function onBackdropClick() {
  if (session && session.opts.closeOnBackdrop !== false) closeViewer();
}

/* ------------------------------------------------------------------ slides */

function isVideoSlide() {
  return !!(session && session.isVideo);
}

function destroyPlayer() {
  if (!session) return;
  if (session.videoAbort) { session.videoAbort.abort(); session.videoAbort = null; }
  if (session.player) { safeDestroy(session.player); session.player = null; }
  if (ui) { ui.videoMount.replaceChildren(); ui.videoMount.hidden = true; }
}

function showImage(src, item, token) {
  const { img, spinner } = ui;
  hideError();
  img.hidden = false;
  img.setAttribute('data-loading', '');
  spinner.hidden = true;
  const spinTimer = setTimeout(() => { if (token === renderToken) spinner.hidden = false; }, 1000);
  const pre = new Image();
  pre.onload = () => {
    clearTimeout(spinTimer);
    if (token !== renderToken) return; // slide changed meanwhile
    img.src = src;
    img.alt = item.alt || '';
    spinner.hidden = true;
    img.removeAttribute('data-loading');
    startSlide(token);       // N5: the new image is displayable now
    preloadAdjacent(token);  // N2
  };
  pre.onerror = () => {
    clearTimeout(spinTimer);
    if (token !== renderToken) return;
    spinner.hidden = true;
    img.removeAttribute('data-loading');
    img.removeAttribute('src');
    img.hidden = true;
    showError();             // N3 (was: an empty frame)
    startSlide(token);
  };
  pre.src = src;
}

/* ------------------------------------------------------------------ v0.24.0 N3: error state */

function showError() {
  const { error, errorText, retryBtn, errorNextBtn } = ui;
  const labels = session.labels;
  error.hidden = false;
  errorText.textContent = labels.loadError; // set after un-hiding → announced by the alert region
  retryBtn.textContent = labels.retry;
  errorNextBtn.textContent = labels.next;
  errorNextBtn.hidden = session.items.length < 2;
  const a = document.activeElement;
  if (!a || a === document.body || a === ui.overlay || ui.stage.contains(a)) retryBtn.focus({ preventScroll: true });
}

function hideError() {
  if (!ui || ui.error.hidden) return;
  const hadFocus = ui.error.contains(document.activeElement);
  ui.error.hidden = true;
  if (hadFocus && lifecycle === 'open') ui.overlay.focus({ preventScroll: true });
}

/** Retry: the same src under a new render token (no slide). */
function retryImage() {
  if (!session || lifecycle !== 'open') return;
  const item = session.items[session.index];
  const src = item.type === 'video' ? item.poster : item.src;
  if (!src) return;
  session.slideDir = 0;
  showImage(src, item, ++renderToken);
}

/* ------------------------------------------------------------------ v0.24.0 N2: adjacent preload */

/** Drop every speculative preload of the session (only on close / session replacement). */
function cancelPreloads() {
  if (!session || !session.preloads) return;
  for (const { image } of session.preloads.values()) {
    image.onload = null;
    image.onerror = null;
    image.src = '';
  }
  session.preloads.clear();
}

/** `preload` option (v0.24.0 SEC-01): false | 'same-origin' (default) | 'all'. */
function preloadMode(opt) {
  if (opt === false) return false;
  return opt === 'all' ? 'all' : 'same-origin';
}

/**
 * After the current image loaded: fetch the previous + next IMAGE (wrapping) so the next step is instant. Records are
 * keyed by the stable (canonical) source string and kept for the whole session — each neighbour is requested at most
 * once. Speculative requests carry no Referer; cross-origin ones only with `preload: 'all'`.
 */
function preloadAdjacent(token) {
  if (!session || token !== renderToken) return;
  const mode = preloadMode(session.opts.preload);
  if (!mode) return;
  let saveData = false;
  try { saveData = !!(navigator.connection && navigator.connection.saveData); } catch { saveData = false; }
  const n = session.items.length;
  if (saveData || n < 2) return;
  for (const d of [-1, 1]) {
    const i = (session.index + d + n) % n;
    const it = session.items[i];
    if (i === session.index || !it || it.type !== 'image' || !it.src) continue;
    const src = it.src;
    if (session.preloads.has(src)) continue;
    if (mode === 'same-origin' && !sameOrigin(src)) continue;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.src = src;
    session.preloads.set(src, { src, image });
  }
}

/* ------------------------------------------------------------------ v0.24.0 N5: slide */

let slideRaf = 0;

function clearSlide() {
  if (slideRaf) { cancelAnimationFrame(slideRaf); slideRaf = 0; }
  if (ui) ui.stage.removeAttribute('data-slide');
}

function reducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Start the slide for the CURRENT token only (old tokens never animate; a new start drops the pending one). */
function startSlide(token) {
  clearSlide();
  if (!session || token !== renderToken || !session.slideDir || reducedMotion()) return;
  ui.stage.setAttribute('data-slide', session.slideDir > 0 ? 'next' : 'prev');
  slideRaf = requestAnimationFrame(() => {
    slideRaf = requestAnimationFrame(() => { slideRaf = 0; ui.stage.removeAttribute('data-slide'); });
  });
}

/** Sign of the shortest step from `from` to `to` in a wrapping gallery of n (0 = same). */
function shortestDir(from, to, n) {
  let d = to - from;
  if (!d) return 0;
  if (Math.abs(d) > n / 2) d -= Math.sign(d) * n;
  return Math.sign(d);
}

/* ------------------------------------------------------------------ v0.24.0 N1: nav mode */

let navResize = null;
let navMq = null;
let navRaf = 0;

function scheduleNavSync() {
  if (navRaf) return;
  navRaf = requestAnimationFrame(() => { navRaf = 0; syncNavMode(); });
}

function fineMq() {
  if (!navMq && typeof matchMedia === 'function') navMq = matchMedia(FINE_POINTER);
  return navMq;
}

function navModeFor() {
  const mq = fineMq();
  if (!session || session.items.length < 2 || !mq || !mq.matches) return 'toolbar';
  if (!isVideoSlide()) return 'side';
  const colW = ui.nav.getBoundingClientRect().width || ui.col.getBoundingClientRect().width;
  const playerW = ui.videoMount.getBoundingClientRect().width;
  return colW - playerW >= 2 * (NAV_DISC + NAV_DISC_GAP) ? 'side-compact' : 'toolbar';
}

/** side / side-compact → prev / next live in the nav mount; toolbar → back in the toolbar (before fullscreen). */
function syncNavMode() {
  if (!ui || !session || lifecycle !== 'open') return;
  const mode = navModeFor();
  if (ui.overlay.getAttribute('data-nav') !== mode) ui.overlay.setAttribute('data-nav', mode);
  const inToolbar = ui.prevBtn.parentElement === ui.toolbar;
  if ((mode === 'toolbar') === inToolbar) return;
  const active = document.activeElement;
  if (mode === 'toolbar') {
    ui.toolbar.insertBefore(ui.prevBtn, ui.fsBtn);
    ui.toolbar.insertBefore(ui.nextBtn, ui.fsBtn);
  } else {
    ui.nav.append(ui.prevBtn, ui.nextBtn);
  }
  if (active === ui.prevBtn || active === ui.nextBtn) active.focus({ preventScroll: true }); // a move drops focus
}

function startNavWatch() {
  window.addEventListener('resize', scheduleNavSync);
  const mq = fineMq();
  if (mq && mq.addEventListener) mq.addEventListener('change', scheduleNavSync);
  if (navResize) navResize.observe(ui.videoMount);
}

function stopNavWatch() {
  window.removeEventListener('resize', scheduleNavSync);
  if (navMq && navMq.removeEventListener) navMq.removeEventListener('change', scheduleNavSync);
  if (navResize) navResize.disconnect();
  if (navRaf) { cancelAnimationFrame(navRaf); navRaf = 0; }
}

/* ------------------------------------------------------------------ v0.24.0 N4: filmstrip */

function wantsFilmstrip(opt, n) {
  if (n < 2) return false;
  if (opt === true) return true;
  if (opt === 'auto') return n >= FILMSTRIP_AUTO;
  return false;
}

function thumbLabel(i) {
  let s = '';
  try { s = session.labels.thumb(i + 1); } catch { s = ''; }
  return typeof s === 'string' && s ? s : DEFAULT_LABELS.thumb(i + 1);
}

/** Build the strip for this session (or hide it). The caption becomes its own row of the column while it is shown. */
function mountFilmstrip() {
  const { filmstrip, overlay, caption, col, panel } = ui;
  const on = session.filmstrip;
  const thumbs = [];
  if (on) {
    session.items.forEach((item, i) => {
      const b = h('button', { type: 'button', class: 'td-lightbox__thumb', 'data-index': String(i), 'aria-label': thumbLabel(i) });
      const url = item.thumb || (item.type === 'video' ? item.poster : item.src);
      const play = () => h('span', { class: 'td-lightbox__thumb-play', 'aria-hidden': 'true' });
      if (url) {
        const im = h('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
        im.src = url;
        b.appendChild(im);
        if (item.type === 'video') b.appendChild(play());
      } else {
        b.appendChild(h('span', { class: 'td-lightbox__thumb-ph' }, [play()]));
      }
      if (item.type === 'video') b.setAttribute('data-video', '');
      thumbs.push(b);
    });
  }
  filmstrip.replaceChildren(...thumbs);
  filmstrip.hidden = !on;
  overlay.toggleAttribute('data-filmstrip', on);
  if (on) col.insertBefore(caption, filmstrip);
  else if (caption.parentElement !== overlay) overlay.insertBefore(caption, panel);
}

function syncFilmstrip() {
  if (!session.filmstrip) return;
  let cur = null;
  for (const b of ui.filmstrip.children) {
    const on = Number(b.getAttribute('data-index')) === session.index;
    if (on) { b.setAttribute('aria-current', 'true'); cur = b; } else b.removeAttribute('aria-current');
  }
  if (cur) {
    try {
      cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch { /* old engines */ }
  }
}

function onThumbClick(e) {
  const b = e.target instanceof Element ? e.target.closest('.td-lightbox__thumb') : null;
  if (!b || !session || lifecycle !== 'open') return;
  goToIndex(Number(b.getAttribute('data-index')));
}

/** goTo / thumbnail: direction = the shortest wrapped path. */
function goToIndex(i) {
  if (!session || lifecycle !== 'open' || !Number.isFinite(i)) return;
  const n = session.items.length;
  const to = Math.max(0, Math.min(n - 1, Math.floor(i)));
  show(to, shortestDir(session.index, to, n));
}

function showVideo(item, token) {
  const { videoMount, img, spinner } = ui;
  img.hidden = true;
  img.removeAttribute('src');
  spinner.hidden = true;
  videoMount.hidden = false;
  const abort = new AbortController();
  session.videoAbort = abort;
  const hook = typeof session.opts.video === 'function' ? session.opts.video : defaultVideo;

  const fallback = () => {
    if (token !== renderToken) return;
    videoMount.replaceChildren();
    videoMount.hidden = true;
    session.isVideo = false;
    syncNavMode();
    if (item.poster) showImage(item.poster, item, token);
  };
  const accept = (player) => {
    if (token !== renderToken || abort.signal.aborted) { safeDestroy(player); return; }
    if (!player || typeof player.destroy !== 'function') { safeDestroy(player); fallback(); return; }
    session.player = player;
    syncNavMode(); // N1: the player's real width decides side-compact vs toolbar
    startSlide(token); // N5: mounted
  };
  let res;
  try {
    res = hook({ ...item }, videoMount, { signal: abort.signal });
  } catch (err) {
    console.error('td-lightbox video hook', err);
    fallback();
    return;
  }
  if (res && typeof res.then === 'function') {
    res.then(accept, (err) => { console.error('td-lightbox video hook', err); fallback(); });
  } else {
    accept(res);
  }
}

function show(idx, dir = 0) {
  const n = session.items.length;
  session.index = ((idx % n) + n) % n;
  session.slideDir = dir;
  const item = session.items[session.index];
  closeDownloadMenu(); // its items/policy belong to the previous slide
  resetTransient();
  destroyPlayer();
  resetZoom();
  clearSlide();
  hideError();
  const token = ++renderToken;

  ui.counter.textContent = n > 1 ? session.labels.counter(session.index + 1, n) : '';
  ui.caption.textContent = item.caption || '';
  ui.caption.hidden = !item.caption;

  session.isVideo = item.type === 'video' && !!item.src;
  if (session.isVideo) {
    showVideo(item, token);
  } else {
    ui.videoMount.hidden = true;
    const src = item.type === 'video' ? item.poster : item.src;
    if (src) showImage(src, item, token);
    else { ui.img.hidden = true; ui.img.removeAttribute('src'); }
  }

  const ctx = ctxOf();
  syncDownloads(item, ctx);
  syncPanel(ctx);
  syncExtras(ctx);
  syncFilmstrip();
  syncNavMode();
  emit('td-lightbox-change', detailOf());
}

/** Hide both download controls and forget the variants. */
function hideDownloads() {
  ui.dlBtn.removeAttribute('href');
  ui.dlBtn.removeAttribute('download');
  ui.dlBtn.hidden = true;
  ui.dlMenuBtn.hidden = true;
  session.downloads = [];
}

/** One plain download link. `name` ('' → from the URL) is sanitised. */
function showDownloadLink(url, name) {
  ui.dlBtn.href = url;
  ui.dlBtn.setAttribute('download', sanitizeDownloadName(name) || sanitizeDownloadName(fileNameOf(url)) || 'image');
  ui.dlBtn.hidden = false;
}

/**
 * Validate the `downloads(item, ctx)` result (E6): a throwing hook / non-array → []; entries need a string `url` that
 * passes the lightbox policy with the item being viewed. Returns [{ label, url, filename }] (filename '' = none).
 */
function downloadVariants(item, ctx) {
  let raw;
  try { raw = session.opts.downloads({ ...item }, ctx); } catch { raw = null; }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const url = allowed(v.url, item, session.isAllowedUrl);
    if (!url) continue;
    const filename = typeof v.filename === 'string' ? sanitizeDownloadName(v.filename) : '';
    const label = typeof v.label === 'string' && v.label.trim() ? v.label : filename || fileNameOf(url);
    out.push({ label, url, filename });
  }
  return out;
}

/**
 * Download controls for the current slide: `downloads` (wins) → 0 hidden / 1 link / ≥ 2 menu; else `download` (one
 * URL) or the same-origin image default.
 */
function syncDownloads(item, ctx) {
  hideDownloads();
  if (typeof session.opts.downloads === 'function') {
    const list = downloadVariants(item, ctx);
    if (list.length === 1) showDownloadLink(list[0].url, list[0].filename);
    else if (list.length > 1) {
      session.downloads = list;
      ui.dlMenuBtn.hidden = false;
    }
    return;
  }
  let dl = '';
  if (typeof session.opts.download === 'function') {
    try { dl = session.opts.download({ ...item }, ctx) || ''; } catch { dl = ''; }
  } else if (item.type === 'image' && sameOrigin(item.src)) {
    dl = item.src;
  }
  dl = allowed(dl, item, session.isAllowedUrl);
  if (dl) {
    ui.dlBtn.href = dl;
    ui.dlBtn.setAttribute('download', fileNameOf(dl));
    ui.dlBtn.hidden = false;
  }
}

/** TdMenu items for the download menu button (lazy: read at open). */
function downloadMenuItems() {
  if (!session || lifecycle !== 'open' || !session.downloads.length) return null;
  return session.downloads.map((d) => ({ label: d.label, href: d.url, download: d.filename || true }));
}

/** The menu's URL policy = the lightbox's `isAllowedUrl(url, item)` with the item being viewed. */
function downloadMenuPolicy(url) {
  if (!session || lifecycle !== 'open') return false;
  return !!allowed(url, session.items[session.index], session.isAllowedUrl);
}

/** Close the download / "Thêm" menu when it is open (slide change / lightbox close). */
function closeDownloadMenu() {
  if (ui && (TdMenu.isOpen(ui.dlMenuBtn) || TdMenu.isOpen(ui.moreBtn))) TdMenu.close();
}

function navigate(dir) {
  if (!session || lifecycle !== 'open' || session.items.length < 2) return;
  show(session.index + dir, Math.sign(dir));
}

/* ------------------------------------------------------------------ open / close */

function makeHandle(token) {
  const alive = () => !!session && session.token === token && lifecycle === 'open';
  return {
    token,
    get isOpen() { return alive(); },
    get index() { return alive() ? session.index : -1; },
    get count() { return alive() ? session.items.length : 0; },
    next() { if (alive()) navigate(1); },
    prev() { if (alive()) navigate(-1); },
    goTo(i) {
      if (alive() && Number.isFinite(i)) goToIndex(i);
    },
    close() { if (alive()) closeViewer(); },
    /** Switch the panel while open (dwp setViewerMode + setSidePanel): false | true | (ctx) => Element|null. */
    setPanel(panel) {
      if (!alive()) return;
      const wasOn = !ui.panel.hidden;
      session.opts = { ...session.opts, panel };
      syncPanel(ctxOf());
      if (!wasOn) setSheet(false); // re-enabled → starts closed
    },
    /** Re-run the current panel renderer (its data changed). */
    refreshPanel() { if (alive()) syncPanel(ctxOf()); },
    /** Add a toolbar button while open (same id → replaces it). Returns remove(). */
    addToolbarButton(spec) {
      if (!alive() || !spec || typeof spec.id !== 'string' || !spec.id) return () => {};
      removeExtra(spec.id);
      const b = addExtra(spec);
      if (!b) return () => {};
      syncExtras(ctxOf());
      const id = spec.id;
      return () => { if (alive()) removeExtra(id, b); };
    },
    removeToolbarButton(id) { if (alive() && typeof id === 'string') removeExtra(id); },
  };
}

/**
 * Open the viewer.
 * @param {Array<TdLightboxItem|string>} items
 * @param {object} [options] see docs/components/lightbox.md
 * @returns {ReturnType<typeof makeHandle>|null}
 */
function openViewer(items, options = {}) {
  if (typeof document === 'undefined') return null;
  const opts = options && typeof options === 'object' ? options : {};
  const isAllowedUrl = typeof opts.isAllowedUrl === 'function' ? opts.isAllowedUrl : defaultIsAllowedUrl;
  const list = (Array.isArray(items) ? items : [items])
    .map((raw) => normalizeItem(raw, isAllowedUrl))
    .filter(Boolean);
  if (!list.length) return null;

  build();
  if (session) { destroyPlayer(); cancelPreloads(); }
  const token = ++tokenSeq;
  const idx = Number.isFinite(opts.index) ? Math.max(0, Math.min(list.length - 1, Math.floor(opts.index))) : 0;
  session = {
    token,
    items: list,
    index: idx,
    opts: {
      ...opts,
      isForeignLayerOpen: typeof opts.isForeignLayerOpen === 'function' ? opts.isForeignLayerOpen : isForeignLayerOpenDefault,
    },
    isAllowedUrl,
    downloads: [],
    labels: mergeLabels(opts.labels),
    player: null,
    videoAbort: null,
    isVideo: false,
    slideDir: 0,
    preloads: new Map(), // src → { src, image } (v0.24.0: stable records for the whole session)
    filmstrip: wantsFilmstrip(opts.filmstrip, list.length),
    handle: null,
    groupEl: typeof Element !== 'undefined' && opts.groupEl instanceof Element ? opts.groupEl : null,
  };
  session.handle = makeHandle(token);
  applyLabels(session.labels);
  mountToolbar(opts.toolbar);
  setSheet(false);

  const many = list.length > 1;
  ui.prevBtn.hidden = !many;
  ui.nextBtn.hidden = !many;
  ui.counter.hidden = !many;
  ui.fsBtn.hidden = !document.fullscreenEnabled;
  syncOverflow();
  mountFilmstrip();

  if (lifecycle !== 'open') {
    // The singleton <img> still holds the previous session's image (kept on close so the fade-out shows it). A fresh
    // open must not paint it while the new one loads (the old frame used to fade out over the new open) → drop it now.
    ui.img.removeAttribute('src');
    ui.img.alt = '';
    clearFocusHandoff(ui.overlay);
    viewer = {
      savedFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      releaseScroll: lockScroll(),
      layer: registerLayer({ // blocking inert lease + keyboard boundary (shared with other overlays)
        layer: LIGHTBOX_LAYER, element: ui.overlay, blocking: true, onEscape: onLayerEscape, onTab: onLayerTab,
      }),
      hist: { state: 'none', closed: false },
      closed: false,
    };
    lifecycle = 'open';
    document.addEventListener('keydown', onKeydown);
    startNavWatch();
    histPush(viewer.hist, resolveHistoryAdapter(opts.history), token);
  }

  show(session.index);
  const openToken = token;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (lifecycle !== 'open' || !session || session.token !== openToken) return;
    ui.overlay.setAttribute('data-state', 'open');
    // An image error before the viewer was visible could not focus Retry yet (v0.24.0 N3) → it takes focus now.
    if (!ui.overlay.contains(document.activeElement)) (ui.error.hidden ? ui.overlay : ui.retryBtn).focus({ preventScroll: true });
  }));
  emit('td-lightbox-open', detailOf());
  return session.handle;
}

function closeViewer() {
  if (!ui || lifecycle !== 'open' || !session || !viewer) return; // idempotent
  closeDownloadMenu(); // first: focus held by the menu returns to its button (inside the dialog) → restored below
  lifecycle = 'closed';
  const v = viewer;
  v.closed = true;
  v.hist.closed = true;
  const focused = document.activeElement;
  const focusWasHere = !focused || focused === document.body || ui.overlay.contains(focused)
    || floatingContains(ui.overlay, focused); // v0.21.1 F2b: focus in a popup opened from the viewer (panel dropdown)
  coverFloatingIn(ui.overlay); // …those popups close now, with the viewer
  // Where focus goes back to, recorded for a higher layer that holds focus now (loading / a modal) — D10 hand-off.
  setFocusHandoff(ui.overlay, followFocusHandoff(v.savedFocus));

  ui.overlay.removeAttribute('data-state');
  ui.overlay.removeAttribute('data-dragging');
  ui.overlay.removeAttribute('data-closing-down');
  ui.overlay.style.removeProperty('--td-lb-drag');
  setSheet(false);
  resetTransient();
  destroyPlayer();
  unmountToolbar();
  renderToken += 1; // invalidate pending preloads / video resolutions
  resetZoom();
  clearSlide();
  hideError();
  cancelPreloads();
  stopNavWatch();
  lastPointerType = '';
  lastDownTarget = null;
  document.removeEventListener('keydown', onKeydown);

  v.releaseScroll();
  v.layer.release();
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});

  if (v.hist.state === 'pushed') {
    v.hist.state = 'none';
    histBack(hist.adapter);
  }
  histMaybeUnsub();

  const detail = detailOf();
  if (focusWasHere) restoreFocus(v.savedFocus); // never steal focus from a higher layer
  viewer = null;
  session = null;
  emit('td-lightbox-close', detail);
}

/* ------------------------------------------------------------------ delegation */

function readItem(el, p = 'td') {
  const a = (k) => el.getAttribute(`data-${p}-lightbox${k}`);
  const img = el.matches('img') ? el : el.querySelector('img');
  const type = a('-type') === 'video' ? 'video' : 'image';
  let src = a('-src') || '';
  const trig = a('');
  if (!src && trig && trig !== 'true' && trig !== '1') src = trig;
  if (!src) {
    const link = el.closest('a[href]') || (el.querySelector && el.querySelector('a[href]'));
    if (link) {
      try {
        if (IMAGE_EXT.test(new URL(link.href, location.href).pathname)) src = link.getAttribute('href');
      } catch { /* ignore */ }
    }
  }
  if (!src && img) src = img.currentSrc || img.getAttribute('src') || '';
  let caption = a('-caption') || '';
  if (!caption) {
    const fig = (img || el).closest('figure');
    const fc = fig && fig.querySelector('figcaption');
    caption = (fc && fc.textContent.trim()) || (img && img.getAttribute('alt')) || '';
  }
  return {
    type,
    src,
    poster: a('-poster') || '',
    provider: a('-provider') || 'html5',
    caption: caption.trim(),
    alt: (img && img.getAttribute('alt')) || '',
    data: el,
  };
}

/** Attribute prefixes are whitelisted: they end up inside CSS selectors (never an arbitrary string). */
const PREFIX_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Opt-in click delegation.
 * @param {Document|Element} [root=document]
 * @param {object} [options] open() options applied to every opened gallery, plus
 *   `attrPrefix` ('td' default; e.g. 'dwp' reads data-dwp-lightbox-*) and
 *   `filter(el, event) → boolean` (false → the click is left alone; a throw counts as false)
 * @returns {() => void} unbind
 */
function bind(root = document, options = {}) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};
  const opts = options && typeof options === 'object' ? options : {};
  const isAllowedUrl = typeof opts.isAllowedUrl === 'function' ? opts.isAllowedUrl : defaultIsAllowedUrl;
  let p = 'td';
  if (opts.attrPrefix != null) {
    if (typeof opts.attrPrefix === 'string' && PREFIX_RE.test(opts.attrPrefix)) p = opts.attrPrefix;
    else console.warn('td-lightbox: invalid attrPrefix, using "td"', opts.attrPrefix);
  }
  const ITEM = `[data-${p}-lightbox-item]`;
  const GROUP = `[data-${p}-lightbox-group]`;
  const SINGLE = `[data-${p}-lightbox]`;
  const filter = typeof opts.filter === 'function' ? opts.filter : null;
  const openOpts = { ...opts }; // bind-only options never reach open()
  delete openOpts.attrPrefix;
  delete openOpts.filter;
  const accepts = (el, e) => {
    if (!filter) return true;
    try { return filter(el, e) !== false; } catch (err) { console.warn('td-lightbox: filter threw — click ignored', err); return false; }
  };
  const handler = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const itemEl = target.closest(ITEM);
    const group = itemEl && itemEl.closest(GROUP);
    if (itemEl && group && (root === document || root.contains(group))) {
      if (!accepts(itemEl, e)) return;
      const nodes = (group.matches(ITEM) ? [group] : []).concat([...group.querySelectorAll(ITEM)]);
      const pairs = nodes
        .map((el) => ({ el, item: normalizeItem(readItem(el, p), isAllowedUrl) }))
        .filter((x) => x.item);
      const index = pairs.findIndex((x) => x.el === itemEl);
      if (index < 0) return; // the clicked item itself is not viewable
      e.preventDefault();
      openViewer(pairs.map((x) => x.item), { ...openOpts, index, groupEl: group });
      return;
    }

    const trigger = target.closest(SINGLE);
    if (trigger && (root === document || root.contains(trigger))) {
      if (!accepts(trigger, e)) return;
      const item = normalizeItem(readItem(trigger, p), isAllowedUrl);
      if (!item) return;
      e.preventDefault();
      openViewer([item], { ...openOpts, index: 0, groupEl: null });
    }
  };
  root.addEventListener('click', handler);
  return () => root.removeEventListener('click', handler);
}

export class TdLightbox {
  static open(items, options) { return openViewer(items, options); }
  static close() { closeViewer(); }
  static bind(root, options) { return bind(root, options); }
  static get isOpen() { return lifecycle === 'open'; }
}
