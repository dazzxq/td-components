/**
 * TdLightbox — image/video viewer (token-native, ADR 0009). Plan: docs/plans/v0.6.0-lightbox.md.
 *
 *   const lb = TdLightbox.open(items, options);       // → handle | null
 *   const unbind = TdLightbox.bind(root, options);    // opt-in click delegation
 *
 * Small core; every site-specific concern is a hook (`download`, `video`, `history`, `panel`, `toolbar`,
 * `isAllowedUrl`, `isForeignLayerOpen`, `labels`). No side effects on import, no window globals, no
 * inline `style=""`/injected `<style>` (CSSOM only for continuous values) — styles live in td.css
 * (`src/styles/components/lightbox.css`).
 *
 * @typedef {{ type?: 'image'|'video', src: string, poster?: string, caption?: string, alt?: string,
 *             provider?: string, data?: * }} TdLightboxItem
 */

import { lockScroll } from '../utils/scroll-lock.js';
import {
  LAYERS, register as registerLayer, hasActiveAbove, trapTab, setFocusHandoff, clearFocusHandoff, restoreFocus, followFocusHandoff,
} from '../utils/layers.js';
import { TdModalStackManager } from './td-modal-stack.js';

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
  counter: (i, n) => `${i} / ${n}`,
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
const SWIPE_NAV = 50;      // px, horizontal → navigate
const SWIPE_CLOSE = 90;    // px, down → close (dearer than navigating: it loses context)
const SWIPE_SHEET = 60;    // px, up → open the info sheet (undoable → cheaper)
const DOUBLE_TAP_MS = 300;
const MOVE_SLOP = 8;
const MAX_ZOOM = 4;
const CLOSE_DOWN_MS = 190; // fixed timer, not transitionend (never fires under reduced motion / hidden tab)

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
    u = new URL(url, location.href);
  } catch {
    return false;
  }
  return u.protocol === 'https:' || (u.protocol === 'http:' && location.protocol === 'http:');
}

function allowed(url, item, isAllowedUrl) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    return isAllowedUrl(url, item) ? url : '';
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
  if (!item.src) return null; // every item needs an allowed src (video poster is only a fallback)
  return item;
}

function mergeLabels(labels) {
  const out = { ...DEFAULT_LABELS };
  if (labels && typeof labels === 'object') {
    for (const k of Object.keys(DEFAULT_LABELS)) {
      if (k === 'counter') {
        if (typeof labels.counter === 'function') out.counter = labels.counter;
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

function isForeignLayerOpenDefault() {
  return hasActiveAbove(LIGHTBOX_LAYER) || TdModalStackManager.stack.length > 0;
}

function ctxOf() {
  if (!session) return null;
  return {
    index: session.index,
    count: session.items.length,
    item: session.items[session.index] || null,
    token: session.token,
    handle: session.handle,
  };
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
  const counter = h('div', { class: 'td-lightbox__counter td-glass-surface td-glass-surface--clear' });
  const lead = h('div', { class: 'td-lightbox__lead' }, [backBtn, counter]);
  const spinner = h('div', { class: 'td-lightbox__spinner', hidden: true });
  const img = h('img', { class: 'td-lightbox__img', alt: '', draggable: 'false' });
  const videoMount = h('div', { class: 'td-lightbox__video', hidden: true });
  const stage = h('div', { class: 'td-lightbox__stage' }, [spinner, img, videoMount]);
  const col = h('div', { class: 'td-lightbox__col' }, [stage]);
  const caption = h('div', { class: 'td-lightbox__caption', hidden: true });
  const grab = h('button', { type: 'button', class: 'td-lightbox__grab', 'aria-expanded': 'false' }, [
    h('span', { class: 'td-lightbox__grab-bar', 'aria-hidden': 'true' }),
  ]);
  const panelBody = h('div', { class: 'td-lightbox__panel-body' });
  const panel = h('aside', { class: 'td-lightbox__panel', hidden: true }, [grab, panelBody]);
  const prevBtn = btn('', 'prev', { 'data-action': 'prev' });
  const nextBtn = btn('', 'next', { 'data-action': 'next' });
  const fsBtn = btn('', 'fullscreen', { 'data-action': 'fullscreen' });
  const dlBtn = h('a', { class: 'td-lightbox__btn', 'data-action': 'download', hidden: true });
  dlBtn.appendChild(icon('download'));
  const closeBtn = btn('td-lightbox__close', 'close', { 'data-action': 'close' });
  const toolbar = h('div', { class: 'td-lightbox__toolbar td-glass-surface td-glass-surface--clear' }, [
    prevBtn, nextBtn, fsBtn, dlBtn, closeBtn,
  ]);
  const overlay = h('div', { class: 'td-lightbox', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, [
    backdrop, lead, col, caption, panel, toolbar,
  ]);

  document.body.appendChild(overlay);
  ui = { overlay, backdrop, lead, backBtn, counter, col, stage, spinner, img, videoMount, caption, panel, grab,
    panelBody, toolbar, prevBtn, nextBtn, fsBtn, dlBtn, closeBtn };

  backdrop.addEventListener('click', onBackdropClick);
  col.addEventListener('click', (e) => { if (e.target === col) onBackdropClick(); });
  closeBtn.addEventListener('click', () => closeViewer());
  backBtn.addEventListener('click', () => closeViewer());
  prevBtn.addEventListener('click', () => navigate(-1));
  nextBtn.addEventListener('click', () => navigate(1));
  fsBtn.addEventListener('click', toggleFullscreen);
  grab.addEventListener('click', (e) => { e.stopPropagation(); setSheet(ui.panel.getAttribute('data-sheet') !== 'open'); });
  bindPanelSwipe(panel);
  bindPointer(stage);
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
    if (!spec || typeof spec.id !== 'string' || !spec.id || typeof spec.onClick !== 'function') continue;
    if (extras.has(spec.id)) continue;
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
    ui.toolbar.insertBefore(b, ui.closeBtn); // close stays last
    extras.set(spec.id, { spec, button: b });
  }
}

function syncExtras(ctx) {
  for (const { spec, button } of extras.values()) {
    let visible = true;
    if (typeof spec.visible === 'function') {
      try { visible = spec.visible(ctx) !== false; } catch { visible = false; }
    }
    button.hidden = !visible;
  }
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
  ui.overlay.toggleAttribute('data-panel', on);
  ui.panel.hidden = !on;
  ui.backBtn.hidden = !on;
  ui.panelBody.replaceChildren(...(node ? [node] : []));
  ui.panel.scrollTop = 0;
}

function bindPanelSwipe(panel) {
  let y0 = null;
  let atTop = true;
  resetPanelSwipe = () => { y0 = null; atTop = true; };
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    y0 = e.clientY;
    atTop = panel.scrollTop <= 0;
  });
  panel.addEventListener('pointerup', (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (dy < -32) setSheet(true);
    else if (dy > 32 && atTop) setSheet(false);
  });
  panel.addEventListener('pointercancel', () => { y0 = null; });
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

/** The visible area is the CLIPPING column, not the stage that hugs the unzoomed image. */
function viewRect() {
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

function bindPointer(stage) {
  const pointers = new Map();
  let g = null;           // current gesture
  let lastTap = { t: 0, x: 0, y: 0 };
  let raf = 0;

  resetPointer = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    for (const id of pointers.keys()) {
      try { stage.releasePointerCapture(id); } catch { /* not captured */ }
    }
    pointers.clear();
    g = null;
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

  stage.addEventListener('pointerdown', (e) => {
    if (!session || isVideoSlide()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    if (pointers.size === 2) {
      g = { type: 'pinch', startDist: dist() || 1, startScale: zoom.scale };
      ui.img.style.willChange = 'transform';
      clearDrag();
    } else if (pointers.size === 1) {
      g = { type: 'single', kind: e.pointerType, x0: e.clientX, y0: e.clientY, zx: zoom.x, zy: zoom.y,
        moved: false, onImg: e.target === ui.img, pinched: false };
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!session || isVideoSlide()) return;
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
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
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
  if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
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
  img.hidden = false;
  img.setAttribute('data-loading', '');
  spinner.hidden = true;
  const spinTimer = setTimeout(() => { if (token === renderToken) spinner.hidden = false; }, 1000);
  const pre = new Image();
  const ready = () => {
    clearTimeout(spinTimer);
    if (token !== renderToken) return; // slide changed meanwhile
    img.src = src;
    img.alt = item.alt || '';
    spinner.hidden = true;
    img.removeAttribute('data-loading');
  };
  pre.onload = ready;
  pre.onerror = ready;
  pre.src = src;
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
    if (item.poster) showImage(item.poster, item, token);
  };
  const accept = (player) => {
    if (token !== renderToken || abort.signal.aborted) { safeDestroy(player); return; }
    if (!player || typeof player.destroy !== 'function') { safeDestroy(player); fallback(); return; }
    session.player = player;
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

function show(idx) {
  const n = session.items.length;
  session.index = ((idx % n) + n) % n;
  const item = session.items[session.index];
  resetTransient();
  destroyPlayer();
  resetZoom();
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
  } else {
    ui.dlBtn.removeAttribute('href');
    ui.dlBtn.hidden = true;
  }

  syncPanel(ctx);
  syncExtras(ctx);
  emit('td-lightbox-change', { index: session.index, count: n, token: session.token, item });
}

function navigate(dir) {
  if (!session || lifecycle !== 'open' || session.items.length < 2) return;
  show(session.index + dir);
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
      if (alive() && Number.isFinite(i)) show(Math.max(0, Math.min(session.items.length - 1, Math.floor(i))));
    },
    close() { if (alive()) closeViewer(); },
  };
}

/**
 * Open the viewer.
 * @param {Array<TdLightboxItem|string>} items
 * @param {object} [options] see docs/components.md#td-lightbox
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
  if (session) destroyPlayer();
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
    labels: mergeLabels(opts.labels),
    player: null,
    videoAbort: null,
    isVideo: false,
    handle: null,
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

  if (lifecycle !== 'open') {
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
    histPush(viewer.hist, resolveHistoryAdapter(opts.history), token);
  }

  show(session.index);
  const openToken = token;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (lifecycle !== 'open' || !session || session.token !== openToken) return;
    ui.overlay.setAttribute('data-state', 'open');
    if (!ui.overlay.contains(document.activeElement)) ui.overlay.focus({ preventScroll: true });
  }));
  emit('td-lightbox-open', { index: session.index, count: list.length, token, item: list[session.index] });
  return session.handle;
}

function closeViewer() {
  if (!ui || lifecycle !== 'open' || !session || !viewer) return; // idempotent
  lifecycle = 'closed';
  const v = viewer;
  v.closed = true;
  v.hist.closed = true;
  const focused = document.activeElement;
  const focusWasHere = !focused || focused === document.body || ui.overlay.contains(focused);
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
  document.removeEventListener('keydown', onKeydown);

  v.releaseScroll();
  v.layer.release();
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});

  if (v.hist.state === 'pushed') {
    v.hist.state = 'none';
    histBack(hist.adapter);
  }
  histMaybeUnsub();

  const detail = { index: session.index, count: session.items.length, token: session.token, item: session.items[session.index] };
  if (focusWasHere) restoreFocus(v.savedFocus); // never steal focus from a higher layer
  viewer = null;
  session = null;
  emit('td-lightbox-close', detail);
}

/* ------------------------------------------------------------------ delegation */

function readItem(el) {
  const img = el.matches('img') ? el : el.querySelector('img');
  const type = el.getAttribute('data-td-lightbox-type') === 'video' ? 'video' : 'image';
  let src = el.getAttribute('data-td-lightbox-src') || '';
  const trig = el.getAttribute('data-td-lightbox');
  if (!src && trig && trig !== 'true' && trig !== '1') src = trig;
  if (!src) {
    const a = el.closest('a[href]') || (el.querySelector && el.querySelector('a[href]'));
    if (a) {
      try {
        if (IMAGE_EXT.test(new URL(a.href, location.href).pathname)) src = a.getAttribute('href');
      } catch { /* ignore */ }
    }
  }
  if (!src && img) src = img.currentSrc || img.getAttribute('src') || '';
  let caption = el.getAttribute('data-td-lightbox-caption') || '';
  if (!caption) {
    const fig = (img || el).closest('figure');
    const fc = fig && fig.querySelector('figcaption');
    caption = (fc && fc.textContent.trim()) || (img && img.getAttribute('alt')) || '';
  }
  return {
    type,
    src,
    poster: el.getAttribute('data-td-lightbox-poster') || '',
    provider: el.getAttribute('data-td-lightbox-provider') || 'html5',
    caption: caption.trim(),
    alt: (img && img.getAttribute('alt')) || '',
    data: el,
  };
}

/**
 * Opt-in click delegation.
 * @param {Document|Element} [root=document]
 * @param {object} [options] open() options applied to every opened gallery
 * @returns {() => void} unbind
 */
function bind(root = document, options = {}) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};
  const isAllowedUrl = typeof options.isAllowedUrl === 'function' ? options.isAllowedUrl : defaultIsAllowedUrl;
  const handler = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const itemEl = target.closest('[data-td-lightbox-item]');
    const group = itemEl && itemEl.closest('[data-td-lightbox-group]');
    if (itemEl && group && (root === document || root.contains(group))) {
      const nodes = (group.matches('[data-td-lightbox-item]') ? [group] : [])
        .concat([...group.querySelectorAll('[data-td-lightbox-item]')]);
      const pairs = nodes
        .map((el) => ({ el, item: normalizeItem(readItem(el), isAllowedUrl) }))
        .filter((p) => p.item);
      const index = pairs.findIndex((p) => p.el === itemEl);
      if (index < 0) return; // the clicked item itself is not viewable
      e.preventDefault();
      openViewer(pairs.map((p) => p.item), { ...options, index });
      return;
    }

    const trigger = target.closest('[data-td-lightbox]');
    if (trigger && (root === document || root.contains(trigger))) {
      const item = normalizeItem(readItem(trigger), isAllowedUrl);
      if (!item) return;
      e.preventDefault();
      openViewer([item], { ...options, index: 0 });
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
