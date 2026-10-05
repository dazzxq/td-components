/**
 * TdHovercard — rich, non-modal popover shown on hover-intent or keyboard focus (plan v0.14.0 G10; port of dwp
 * engine/dwp-core/assets/ui/hovercard.js + the 135 kit variant). Static helper, no custom element. Token-native:
 * needs td.css (src/styles/components/hovercard.css + the .td-glass-surface recipe). No side effects on import.
 *
 *   import { TdHovercard } from '@dazzxq/td-components/hovercard';
 *   const unbind = TdHovercard.bind(trigger, { content: (t) => node, label: 'Hồ sơ Lan' }); // JS hook
 *   TdHovercard.bind(trigger, { template: 'hc-user-7' });           // <template id="hc-user-7"> (cloned)
 *   TdHovercard.bind(trigger, { url: '/api/users/7/card' });        // same-origin fragment
 *   const unbindAll = TdHovercard.bindAll(root = document);          // declarative triggers (delegation, idempotent)
 *   TdHovercard.close();
 *   TdHovercard.labels.loading = 'Loading…';                         // site override (Vietnamese defaults)
 *
 * Declarative triggers (bindAll — nothing runs until you call it):
 *   <a href="/u/7" data-td-hovercard="/api/users/7/card">Lan</a>          fetch a same-origin fragment
 *   <a href="/u/7" data-td-hovercard-template="hc-user-7">Lan</a>         clone <template id="hc-user-7">
 *   [data-td-hovercard-label="Hồ sơ Lan"]                                  accessible name of the card
 * Prefer a real link or button as the trigger; a non-focusable trigger gets tabindex="0" while bound.
 *
 * Content sources (first match wins: bind() options content → template → url, then the trigger's
 * data-td-hovercard-template, then data-td-hovercard):
 *   (a) `content(trigger)` → Node | string | Promise<Node | string>. A Node (or DocumentFragment) is MOVED into the
 *       card — return a fresh node / a clone. null or '' → nothing to show (the card closes).
 *   (b) `template`: an HTMLTemplateElement or its id (a leading "#" is accepted); its content is CLONED — no string
 *       parsing. A missing id / a non-<template> element → console.warn, nothing opens.
 *   (c) `url` / data-td-hovercard: fetched with credentials 'same-origin' and mode 'same-origin' ONLY. Anything that
 *       does not resolve to an http(s) URL of this page's origin → console.warn, nothing opens. Response: JSON
 *       `{ "html": "…" }` (application/json) or a text/html fragment; any other type / a non-2xx status → error state.
 *       Successful fragments are cached per absolute URL without #fragment (LRU, 50 entries; failures are not cached,
 *       so the next hover retries); bodies over 256 KB, requests over 10 s → error; one request at a time, aborted when
 *       the card closes or switches. Responses with `Cache-Control: no-store` are never cached; `cache: false` /
 *       data-td-hovercard-cache="false" disables the cache per trigger. `TdHovercard.clearCache()` empties it and
 *       closes the card — call it on logout / login / tenant or permission changes.
 *
 * TRUSTED-HTML HATCH (security.md): a STRING from content() and every URL fragment is rendered with innerHTML. Only
 * developer markup or same-origin, server-escaped fragments belong there — NEVER raw user input. Node / <template>
 * sources are preferred. Under a strict CSP, `style=""` in that markup is blocked — use classes. Fragments that may
 * carry user-generated markup: set `TdHovercard.sanitize` (DOMPurify / Sanitizer API / Trusted Types policy); a
 * TrustedHTML value is accepted as is. Under Trusted Types enforcement a plain string fails closed (error state):
 * return TrustedHTML from sanitize, e.g. `DOMPurify.sanitize(h, { RETURN_TRUSTED_TYPE: true })`.
 *
 * DOM contract (one singleton card, a <body> child, created on first open, kept hidden while closed):
 *   <div class="td-hovercard td-glass-surface td-glass-surface--strong" id="td-hovercard" role="dialog"
 *        tabindex="-1" aria-label="{name}" data-state="loading|open|error|closed" data-placement="bottom|top" [hidden]>
 *     … content …                                                         (data-state="open")
 *     <p class="td-hovercard__status" role="status">                      (data-state="loading" | "error")
 *       [<span class="td-hovercard__spinner td-spinner td-spinner--sm" aria-hidden="true"><svg…></span>] (loading)
 *       <span class="td-hovercard__text">{labels.loading | labels.error}</span>
 *     </p>
 *   </div>
 *   Trigger (while bound): aria-haspopup="dialog", aria-expanded="true|false", aria-controls="td-hovercard" while
 *   open; unbind restores aria-haspopup / aria-expanded / aria-controls / tabindex to their previous values.
 *
 * Behaviour:
 * - Pointer: hover-intent — shows after 350 ms on the trigger, hides after a 250 ms grace; it stays open while the
 *   pointer OR focus is on the trigger or the card. Pointer hover only on `(hover: hover) and (pointer: fine)`
 *   (checked per event; touch pointers are ignored — a tap follows the trigger's own href/click).
 * - Keyboard (works on every device): KEYBOARD focus (:focus-visible) on the trigger opens the card at once; a mouse
 *   click's focus waits for the 350 ms hover intent and a touch press's focus does not open it. The card is a floating keyboard boundary at LAYERS.popover (utils/layers.js): Tab on the trigger →
 *   the first focusable in the card ('handled'), or 'pass' when it has none (e.g. still loading); Shift+Tab from the
 *   first card focusable → the trigger; Tab from the last → close, focus the trigger and 'pass' (the native order —
 *   or a TdModal's focus trap — continues after the trigger); Escape → close, and focus goes back to the trigger when
 *   it was on the trigger or in the card (a pointer-only card never steals focus).
 * - One render token governs every asynchronous source (content() Promises and fetches). It is bumped on open,
 *   trigger switch, close and unbind; a resolution OR rejection carrying an old token never touches the card.
 * - Dismiss: outside pointerdown; the trigger scrolled out of view / removed; scroll + resize reposition
 *   (placeFloating: bottom preferred, flips, start-aligned, viewport-clamped, height capped to the room).
 * - Over an open modal the card keeps its small-popup surface (94 % + blur, v0.20.0 minimal surfaces).
 */
import {
  LAYERS, register as registerLayer, focusablesIn, childFloatingIn, coverFloatingIn, bridgeTheme,
} from '../utils/layers.js';
import { placeFloating, isReferenceHidden, watchReference } from '../utils/floating.js';

const SHOW_DELAY = 350;
const HIDE_DELAY = 250;
const TOUCH_FOCUS_MS = 1000; // a focus this soon after a touch/pen press on the trigger is the tap's, not keyboard's
const GAP = 6;
const HEIGHT_MAX = 480; // px: the card scrolls beyond this (or beyond the room on the chosen side)
const LABEL_MAX = 80;
const CARD_ID = 'td-hovercard';
const DECL = '[data-td-hovercard], [data-td-hovercard-template]';
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const NATIVE_FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, '
  + 'iframe, [tabindex], [contenteditable]:not([contenteditable="false"])';
const SNAP = ['aria-haspopup', 'aria-expanded', 'aria-controls', 'tabindex'];
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The spinner built with DOM APIs (no innerHTML → works under Trusted Types enforcement). */
function spinnerSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'td-spinner__svg');
  svg.setAttribute('viewBox', '0 0 50 50');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const cls of ['td-spinner__track', 'td-spinner__arc']) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '25');
    c.setAttribute('cy', '25');
    c.setAttribute('r', '20');
    svg.appendChild(c);
  }
  return svg;
}

/** @type {Map<string, Promise<string>>} absolute URL (no #fragment) → fragment; LRU, successful fetches only */
const cache = new Map();
/** Limits (security review v0.14.0): cache entries, response bytes, request time. */
const CACHE_MAX = 50;
const MAX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 10000;
/** @type {{ href: string, ctrl: AbortController, done: boolean }|null} the one request in flight */
let inflight = null;
/** @type {WeakMap<HTMLElement, object>} trigger → explicit bind() record */
const explicit = new WeakMap();
/** @type {WeakMap<EventTarget, object>} root → bindAll() record */
const roots = new WeakMap();

/** @type {HTMLElement|null} */
let card = null;
/** @type {{ trigger: HTMLElement, binding: object, layer: any, raf: number }|null} the open (or loading) session */
let cur = null;
let token = 0;
let showTimer = 0;
let hideTimer = 0;
/** @type {HTMLElement|null} trigger waiting for its show delay */
let pending = null;
/** @type {HTMLElement|null} trigger under a hovering pointer */
let hoverTrigger = null;
/** @type {HTMLElement|null} trigger whose card was dismissed with Escape while hovered: no reopen until it is left */
let dismissedHover = null;
/** The binding that recorded pending / hoverTrigger / dismissedHover: teardown clears only its own state (ISSUE-10). */
let pendingBinding = null;
let hoverBinding = null;
let dismissedBinding = null;
/** Events already handled by an (inner) delegated root: nested bindAll() roots never both claim one event (ISSUE-11). */
const handledEvents = new WeakSet();
let overCard = false;
let suppressFocus = false;
/** trigger → time of its last touch / pen press. Weak: never keeps a removed trigger alive (review ISSUE-13). */
const lastTouch = new WeakMap();

const isTrustedHTML = (v) => typeof window !== 'undefined' && !!window.trustedTypes
  && typeof window.trustedTypes.isHTML === 'function' && window.trustedTypes.isHTML(v);
const isThenable = (v) => !!v && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';

function hoverCapable() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(HOVER_QUERY).matches;
}

/**
 * The absolute URL when `raw` resolves to http(s) on this page's origin, else null.
 * @param {string} raw
 * @returns {string|null}
 */
export function hovercardUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || typeof location === 'undefined') return null;
  let u;
  try { u = new URL(raw.trim(), location.href); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.origin === location.origin ? u.href : null;
}

/** Cancel an unread response body (refused responses never keep streaming in the background). */
function dropBody(res) {
  if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
}

/** Body text, refused beyond MAX_BYTES (streamed when possible, so a huge body is never buffered whole). */
async function readCapped(res) {
  const len = Number(res.headers.get('content-length'));
  const streamable = !!res.body && typeof res.body.getReader === 'function';
  if (len > MAX_BYTES || (!streamable && !(len >= 0 && res.headers.has('content-length')))) {
    // declared too big, or no stream to count bytes and no declared in-limit length: refuse WITHOUT reading it
    dropBody(res);
    throw new Error(`TdHovercard: response larger than ${MAX_BYTES} bytes (or of unknown size)`);
  }
  if (!streamable) return res.text(); // declared length ≤ MAX_BYTES
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      reader.cancel().catch(() => {});
      throw new Error(`TdHovercard: response larger than ${MAX_BYTES} bytes`);
    }
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

/** Abort the request in flight (card closed / switched): it is dropped from the cache at once. */
function abortInflight() {
  if (!inflight || inflight.done) return;
  inflight.ctrl.abort();
  if (cache.get(inflight.href) === inflight.p) cache.delete(inflight.href);
  inflight = null;
}

function fetchFragment(raw, useCache = true) {
  const u = new URL(raw);
  u.hash = ''; // "#1", "#2"… are one request — never separate cache entries
  const href = u.href;
  const hit = useCache ? cache.get(href) : null;
  if (hit) {
    cache.delete(href); // LRU: most recent last
    cache.set(href, hit);
    return hit;
  }
  abortInflight(); // at most one request at a time
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const rec = { href, ctrl, done: false, noStore: false, p: null };
  const p = fetch(href, {
    credentials: 'same-origin',
    mode: 'same-origin', // a cross-origin redirect fails too
    cache: 'no-store', // the component LRU is the ONLY cache: clearCache() / cache:false are never undone by the HTTP cache
    headers: { Accept: 'application/json, text/html;q=0.9' },
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) { dropBody(res); throw new Error(`TdHovercard: HTTP ${res.status}`); }
      // the server said "never store" (e.g. per-user data): honour it for this in-memory cache too
      if (/\bno-store\b/i.test(res.headers.get('cache-control') || '')) rec.noStore = true;
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (/[/+]json\b/.test(type)) {
        let data;
        try { data = JSON.parse(await readCapped(res)); } catch (e) { throw e instanceof SyntaxError ? new Error('TdHovercard: invalid JSON') : e; }
        if (!data || typeof data.html !== 'string') throw new Error('TdHovercard: JSON without a string "html"');
        return data.html;
      }
      if (type.startsWith('text/html')) return readCapped(res);
      dropBody(res);
      throw new Error(`TdHovercard: unsupported content-type "${type}"`);
    })
    .catch((err) => {
      if (cache.get(href) === p) cache.delete(href); // never cache a failure — the next hover retries
      throw err;
    })
    .finally(() => {
      clearTimeout(timer);
      rec.done = true;
      if (inflight === rec) inflight = null;
      if (rec.noStore && cache.get(href) === p) cache.delete(href);
    });
  rec.p = p;
  inflight = rec;
  if (!useCache) return p;
  cache.set(href, p);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}

/** @returns {HTMLTemplateElement|null} */
function findTemplate(ref, trigger) {
  if (typeof HTMLTemplateElement !== 'undefined' && ref instanceof HTMLTemplateElement) return ref;
  if (typeof ref !== 'string') return null;
  const id = ref.trim().replace(/^#/, '');
  if (!id) return null;
  const scope = trigger.getRootNode && typeof trigger.getRootNode().getElementById === 'function'
    ? trigger.getRootNode() : document;
  const tpl = scope.getElementById(id) || document.getElementById(id);
  return tpl instanceof HTMLTemplateElement ? tpl : null;
}

/** The trigger's content source (see the header), or null. */
function sourceOf(trigger, opts) {
  const o = opts || {};
  if (typeof o.content === 'function') return { kind: 'content', fn: o.content };
  if (o.template != null && o.template !== '') return { kind: 'template', ref: o.template };
  if (o.url != null && o.url !== '') return { kind: 'url', url: String(o.url), cache: o.cache !== false };
  const t = trigger.getAttribute('data-td-hovercard-template');
  if (t && t.trim()) return { kind: 'template', ref: t };
  const u = trigger.getAttribute('data-td-hovercard');
  if (u && u.trim()) return { kind: 'url', url: u, cache: trigger.getAttribute('data-td-hovercard-cache') !== 'false' };
  return null;
}

/** Accessible name: label option → data-td-hovercard-label → aria-label → trigger text (capped) → labels.dialog. */
function nameFor(trigger, opts) {
  const pick = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  let name = pick(opts && opts.label) || pick(trigger.getAttribute('data-td-hovercard-label'))
    || pick(trigger.getAttribute('aria-label'));
  if (!name) {
    name = pick(trigger.textContent || '');
    if (name.length > LABEL_MAX) name = `${name.slice(0, LABEL_MAX - 1).trimEnd()}…`;
  }
  return name || TdHovercard.labels.dialog || 'Thông tin thêm';
}

function ensureCard() {
  if (!card) {
    card = document.createElement('div');
    card.className = 'td-hovercard td-glass-surface td-glass-surface--strong';
    card.id = CARD_ID;
    card.setAttribute('role', 'dialog');
    card.setAttribute('tabindex', '-1'); // a click on card text keeps focus inside the card
    card.setAttribute('data-state', 'closed');
    card.hidden = true;
    // pointerenter/leave do not bubble: bound on the card itself
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      overCard = true;
      clearTimeout(hideTimer);
    });
    card.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      overCard = false;
      if (cur) scheduleHide();
    });
    card.addEventListener('focusin', () => clearTimeout(hideTimer));
    card.addEventListener('focusout', onFocusOut);
  }
  if (!card.isConnected) document.body.appendChild(card);
  return card;
}

function focusTrigger(t) {
  if (!(t instanceof HTMLElement) || !t.isConnected) return;
  suppressFocus = true; // focus() fires focusin synchronously: the flag covers exactly this call
  try { t.focus({ preventScroll: true }); } catch { /* ignore */ } finally { suppressFocus = false; }
}

function clearTimers() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  pending = null;
  pendingBinding = null;
}

function place() {
  if (!cur || !card || card.hidden) return;
  const listMax = Math.max(0, Math.min(window.innerHeight - 16, HEIGHT_MAX));
  const { side } = placeFloating(cur.trigger, card, {
    side: 'bottom', width: 'auto', align: 'start', gap: GAP, list: card, listMax,
  });
  card.setAttribute('data-placement', side);
}

function show(state) {
  card.setAttribute('data-state', state);
  card.hidden = false;
  place();
}

function status(text, busy) {
  const p = document.createElement('p');
  p.className = 'td-hovercard__status';
  p.setAttribute('role', 'status');
  if (busy) {
    const sp = document.createElement('span');
    sp.className = 'td-hovercard__spinner td-spinner td-spinner--sm';
    sp.setAttribute('aria-hidden', 'true');
    sp.appendChild(spinnerSvg());
    p.appendChild(sp);
  }
  const t = document.createElement('span');
  t.className = 'td-hovercard__text';
  t.textContent = text;
  p.appendChild(t);
  return p;
}

function renderLoading(my) {
  if (my !== token || !cur) return;
  card.replaceChildren(status(TdHovercard.labels.loading || 'Đang tải…', true));
  show('loading');
}

function renderError(my, err) {
  if (my !== token || !cur) return; // stale rejection: never touches the card
  if (err) console.warn('TdHovercard: content failed', err);
  card.replaceChildren(status(TdHovercard.labels.error || 'Không tải được nội dung.', false));
  show('error');
}

/** Put resolved content into the card (token-guarded). */
function renderContent(my, value) {
  if (my !== token || !cur) return; // stale resolution: never touches the card
  if (typeof value === 'string' && typeof TdHovercard.sanitize === 'function') {
    // site hook (security review v0.14.0): e.g. DOMPurify / Sanitizer API / a Trusted Types policy
    try { value = TdHovercard.sanitize(value); } catch (err) { renderError(my, err); return; }
  }
  const trusted = isTrustedHTML(value);
  if (trusted || typeof value === 'string') {
    if (!String(value).trim()) { closeSession('empty'); return; } // empty string / empty TrustedHTML → nothing opens
    // TrustedHTML: the site's policy vouched for it. String: the TRUSTED hatch (developer / same-origin
    // server-escaped markup) — see header. Under Trusted Types enforcement a plain string throws → error state.
    try { card.innerHTML = value; } catch (err) { renderError(my, err); return; }
  } else if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value.nodeType === 11 && !value.childNodes.length) { closeSession('empty'); return; }
    card.replaceChildren(value);
  } else if (value == null) {
    closeSession('empty');
    return;
  } else {
    renderError(my, new TypeError('TdHovercard: content must be a Node or a string'));
    return;
  }
  show('open');
}

/** Whether `node` is in a popup opened from inside the card (a TdMenu anchored on a card button — v0.21.1 F3). */
function inChildPopup(node) {
  return !!card && node instanceof Node && childFloatingIn(card).some((r) => r.element.contains(node));
}

function keepOpen() {
  if (!cur) return false;
  const t = cur.trigger;
  if (!t.isConnected) return false;
  if (card && childFloatingIn(card).length) return true; // a child popup is open: its anchor must stay
  const a = document.activeElement;
  const focusHere = a instanceof Node && a !== document.body && (t.contains(a) || card.contains(a) || inChildPopup(a));
  return hoverTrigger === t || overCard || focusHere;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (cur && !keepOpen()) closeSession('leave');
  }, HIDE_DELAY);
}

function onFocusOut(e) {
  if (!cur) return;
  const next = e.relatedTarget;
  if (next instanceof Node && (cur.trigger.contains(next) || card.contains(next) || inChildPopup(next))) return;
  scheduleHide();
}

function onDocPointerDown(e) {
  if (!cur) return;
  const t = e.target;
  if (t instanceof Node && (card.contains(t) || cur.trigger.contains(t) || inChildPopup(t))) return;
  closeSession('outside');
}

function reposition() {
  if (!cur) return;
  if (!cur.trigger.isConnected || isReferenceHidden(cur.trigger.getBoundingClientRect(), cur.trigger)) {
    closeSession('hidden');
    return;
  }
  place();
}

function onScroll(e) {
  if (!cur) return;
  if (e.target instanceof Node && card.contains(e.target)) return; // scrolling a long card never moves it
  if (cur.raf) return;
  cur.raf = requestAnimationFrame(() => {
    if (!cur) return;
    cur.raf = 0;
    reposition();
  });
}

function onResize() { reposition(); }

function onEscape() {
  if (!cur) return false;
  const a = document.activeElement;
  const back = a instanceof Node && (cur.trigger.contains(a) || card.contains(a));
  if (hoverTrigger === cur.trigger) { dismissedHover = cur.trigger; dismissedBinding = hoverBinding; } // WCAG 1.4.13
  closeSession(back ? 'escape' : 'dismiss');
  return true;
}

/** Keyboard contract (G10 / review ISSUE-2) — called by the layers.js capture dispatcher. */
function onTab(e) {
  if (!cur) return 'pass';
  const t = cur.trigger;
  const a = document.activeElement;
  if (a === t) {
    if (e.shiftKey) return 'pass';
    const items = focusablesIn(card);
    if (!items.length) return 'pass';
    e.preventDefault();
    items[0].focus({ preventScroll: true });
    return 'handled';
  }
  if (!(a instanceof Node) || !card.contains(a)) return 'pass';
  const items = focusablesIn(card);
  const i = items.indexOf(/** @type {HTMLElement} */ (a));
  if (e.shiftKey && i <= 0) { // first focusable (or the card itself) → back to the trigger
    e.preventDefault();
    focusTrigger(t);
    return 'handled';
  }
  if (!e.shiftKey && (i === items.length - 1 || (i < 0 && !items.length))) {
    closeSession('tab'); // focuses the trigger; the native Tab / a modal trap moves on from there
    return 'pass';
  }
  if (!e.shiftKey && i < 0) { // the card itself focused (a click on text): into its first focusable
    e.preventDefault();
    items[0].focus({ preventScroll: true });
    return 'handled';
  }
  return 'handled'; // interior move: native
}

/**
 * Close the session. Focus returns to the trigger for 'escape' / 'tab', and for 'api' / 'hidden' / 'leave' /
 * 'unbind' when it was inside the card (never stranded on <body>); 'outside' leaves focus to the press.
 * @param {string} reason
 */
function closeSession(reason) {
  clearTimers();
  token++; // invalidate every pending async source
  abortInflight(); // …and stop its network request
  const s = cur;
  if (!s) return;
  // v0.21.1 F3: popups opened from inside the card (a TdMenu on a card button) close first, before their anchor goes
  const a0 = document.activeElement;
  const childHadFocus = inChildPopup(a0);
  if (card) coverFloatingIn(card);
  cur = null;
  overCard = false;
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  if (s.raf) cancelAnimationFrame(s.raf);
  if (s.unwatch) s.unwatch();
  if (s.layer) s.layer.release();
  const t = s.trigger;
  const a = document.activeElement;
  const hadFocus = childHadFocus || (!!card && a instanceof Node && card.contains(a));
  if (t.hasAttribute('aria-expanded')) t.setAttribute('aria-expanded', 'false');
  if (t.getAttribute('aria-controls') === CARD_ID) t.removeAttribute('aria-controls');
  // 'covered' (a newer modal / lightbox, or the closing dialog the trigger lives in): focus belongs to that layer
  if (reason !== 'covered'
    && (reason === 'escape' || reason === 'tab' || (hadFocus && reason !== 'outside'))) focusTrigger(t);
  if (card) {
    card.hidden = true;
    card.setAttribute('data-state', 'closed');
    card.replaceChildren(); // fragments stay cached: a re-open is instant
  }
  if (s.unbridge) s.unbridge();
}

/** Open `trigger` now (no delay). */
function open(trigger, binding) {
  clearTimers();
  if (!(trigger instanceof HTMLElement) || !trigger.isConnected) return;
  if (cur && cur.trigger === trigger) return; // already open or loading
  const src = sourceOf(trigger, binding.opts);
  if (!src) return;
  let href = null;
  let tpl = null;
  if (src.kind === 'url') {
    href = hovercardUrl(src.url);
    if (!href) {
      console.warn(`TdHovercard: refused "${src.url}" — only http(s) URLs of this origin are fetched`);
      return;
    }
  } else if (src.kind === 'template') {
    tpl = findTemplate(src.ref, trigger);
    if (!tpl) {
      console.warn(`TdHovercard: no <template> "${typeof src.ref === 'string' ? src.ref : '?'}"`);
      return;
    }
  }
  if (cur) closeSession('switch');
  const my = ++token;
  const c = ensureCard();
  // v0.42.0 (ADR 0020): the card renders in the trigger's theme scope (the card element is reused: unbridged on close)
  cur = { trigger, binding, layer: null, raf: 0, unbridge: bridgeTheme(c, trigger) };
  c.setAttribute('aria-label', nameFor(trigger, binding.opts));
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', CARD_ID);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  cur.layer = registerLayer({
    layer: LAYERS.popover,
    element: c,
    keyboard: 'boundary',
    onEscape,
    onTab,
    anchor: trigger, // v0.21.1: covered by a newer modal / lightbox, or by the closing dialog the trigger lives in
    onCovered: () => closeSession('covered'),
  });
  cur.unwatch = watchReference(trigger, reposition); // hidden without a scroll, removed, entry transition

  if (src.kind === 'template') {
    renderContent(my, tpl.content.cloneNode(true));
    return;
  }
  if (src.kind === 'url') {
    renderLoading(my);
    fetchFragment(href, src.cache).then((html) => renderContent(my, html), (err) => renderError(my, err));
    return;
  }
  let r;
  try { r = src.fn(trigger); } catch (err) { renderError(my, err); return; }
  if (isThenable(r)) {
    renderLoading(my);
    Promise.resolve(r).then((v) => renderContent(my, v), (err) => renderError(my, err));
    return;
  }
  renderContent(my, r);
}

// ---- event handlers shared by bind() (on the trigger) and bindAll() (delegated on a root) ----

function onOver(e, trigger, binding) {
  if (e.pointerType === 'touch' || !hoverCapable()) return;
  hoverTrigger = trigger;
  hoverBinding = binding;
  if (cur && cur.trigger === trigger) { clearTimeout(hideTimer); return; }
  if (pending === trigger || dismissedHover === trigger) return;
  clearTimers();
  pending = trigger;
  pendingBinding = binding;
  showTimer = setTimeout(() => {
    pending = null;
    pendingBinding = null;
    if (hoverTrigger === trigger) open(trigger, binding);
  }, SHOW_DELAY);
}

function onOut(e, trigger) {
  if (e.pointerType === 'touch') return;
  if (e.relatedTarget instanceof Node && trigger.contains(e.relatedTarget)) return; // moving within the trigger
  if (hoverTrigger === trigger) { hoverTrigger = null; hoverBinding = null; }
  if (dismissedHover === trigger) { dismissedHover = null; dismissedBinding = null; }
  if (pending === trigger) { clearTimeout(showTimer); pending = null; pendingBinding = null; }
  if (cur) scheduleHide();
}

function onFocusIn(trigger, binding) {
  if (suppressFocus) return;
  if (Date.now() - (lastTouch.get(trigger) ?? -Infinity) < TOUCH_FOCUS_MS) return; // a tap's focus
  // Only KEYBOARD-visible focus opens at once; a mouse click's focus goes through the 350 ms hover intent (ISSUE-3).
  let visible = true;
  try { visible = trigger.matches(':focus-visible'); } catch { /* engines without :focus-visible: keep opening */ }
  if (!visible) return;
  if (cur && cur.trigger === trigger) { clearTimeout(hideTimer); return; }
  open(trigger, binding);
}

function onPress(e, trigger) {
  if (e.pointerType && e.pointerType !== 'mouse') lastTouch.set(trigger, Date.now());
}

/**
 * Trigger attribute ownership (impl-review v0.14.0 ISSUE-5): ONE original snapshot per trigger and the set of bindings
 * that currently own it; the originals come back only when the LAST owner releases the trigger (overlapping bind() /
 * bindAll() / nested roots never restore stale ARIA under a live binding).
 * @type {WeakMap<HTMLElement, { snap: Array<[string, string|null]>, owners: Set<Map> }>}
 */
const OWNERS = new WeakMap();

/** Set the trigger's ARIA (+ tabindex when not sequentially focusable), registering `touched` as an owner. */
function prepTrigger(t, touched) {
  let rec = OWNERS.get(t);
  if (!rec) {
    rec = { snap: SNAP.map((a) => [a, t.getAttribute(a)]), owners: new Set() };
    OWNERS.set(t, rec);
  }
  rec.owners.add(touched);
  touched.set(t, true);
  t.setAttribute('aria-haspopup', 'dialog');
  if (!(cur && cur.trigger === t)) t.setAttribute('aria-expanded', 'false');
  if (t.tabIndex < 0) t.setAttribute('tabindex', '0'); // not reachable by Tab (incl. tabindex="-1", review ISSUE-4)
}

function restoreTriggers(touched) {
  for (const t of touched.keys()) {
    const rec = OWNERS.get(t);
    if (!rec) continue;
    rec.owners.delete(touched);
    if (rec.owners.size) continue; // another binding still owns this trigger
    OWNERS.delete(t);
    for (const [a, v] of rec.snap) {
      if (v === null) t.removeAttribute(a);
      else t.setAttribute(a, v);
    }
  }
  touched.clear();
}

function teardown(binding) {
  // only the state THIS binding recorded — an overlapping live binding keeps its hover intent (ISSUE-10)
  if (cur && cur.binding === binding) closeSession('unbind');
  else if (pending && pendingBinding === binding) clearTimers();
  if (hoverTrigger && hoverBinding === binding) { hoverTrigger = null; hoverBinding = null; }
  if (dismissedHover && dismissedBinding === binding) { dismissedHover = null; dismissedBinding = null; }
}

export class TdHovercard {
  /** Default labels (Vietnamese); override per site: `TdHovercard.labels.loading = 'Loading…'`. */
  static labels = { loading: 'Đang tải…', error: 'Không tải được nội dung.', dialog: 'Thông tin thêm' };

  /**
   * Optional site hook for every STRING source (content() strings and URL fragments) before it reaches innerHTML:
   * `(html) => string | Node | TrustedHTML`. null (default) = strings are trusted HTML (the documented hatch). Plug a
   * sanitizer here when fragments may carry user-generated markup, e.g. `TdHovercard.sanitize = (h) => DOMPurify.sanitize(h)`
   * or a Trusted Types policy's createHTML. A throw renders the error state.
   * @type {((html: string) => (string|Node|object))|null}
   */
  static sanitize = null;

  /**
   * Drop every cached URL fragment, abort the request in flight and close the open card (its content may belong to
   * the previous user). Call it on logout / login / tenant or permission changes (security.md).
   */
  static clearCache() {
    if (cur) closeSession('api');
    abortInflight();
    cache.clear();
  }

  /**
   * Bind one trigger. Binding the same trigger again replaces the previous binding.
   * @param {HTMLElement} trigger preferably a link or a button
   * @param {{ content?: (trigger: HTMLElement) => (Node|string|null|Promise<Node|string|null>),
   *           template?: HTMLTemplateElement|string, url?: string, cache?: boolean, label?: string }} [opts]
   *        one source (content → template → url; none → the trigger's data attributes). A STRING result of
   *        `content` and URL fragments are TRUSTED HTML (innerHTML) — developer / same-origin server-escaped markup
   *        only, never raw user input; prefer a Node or a <template>. `label` = the card's accessible name.
   * @returns {() => void} unbind: removes the listeners, restores the trigger ARIA / tabindex, closes its card
   */
  static bind(trigger, opts = {}) {
    if (typeof HTMLElement === 'undefined' || !(trigger instanceof HTMLElement)) return () => {};
    explicit.get(trigger)?.unbind();
    const o = opts && typeof opts === 'object' ? opts : {};
    const touched = new Map();
    const binding = {
      opts: { content: o.content, template: o.template, url: o.url, cache: o.cache, label: o.label },
      unbind: null,
    };
    if (cur && cur.trigger === trigger) closeSession('switch'); // was opened by another binding
    prepTrigger(trigger, touched);
    const h = {
      pointerover: (e) => onOver(e, trigger, binding),
      pointerout: (e) => onOut(e, trigger),
      focusin: () => onFocusIn(trigger, binding),
      focusout: onFocusOut,
      pointerdown: (e) => onPress(e, trigger),
    };
    for (const [type, fn] of Object.entries(h)) trigger.addEventListener(type, fn);
    const unbind = () => {
      if (explicit.get(trigger) !== binding) return;
      explicit.delete(trigger);
      for (const [type, fn] of Object.entries(h)) trigger.removeEventListener(type, fn);
      teardown(binding);
      restoreTriggers(touched);
    };
    binding.unbind = unbind;
    explicit.set(trigger, binding);
    return unbind;
  }

  /**
   * Bind the declarative triggers (`data-td-hovercard="url"`, `data-td-hovercard-template="id"`) inside `root` by
   * event delegation — triggers added later work too (call bindAll again to give them their ARIA up front).
   * Idempotent per root: a second call refreshes the ARIA and returns the same unbind. Triggers with an explicit
   * bind() are left to it; triggers inside the card are ignored. Nothing runs on import.
   * @param {Document|Element} [root=document]
   * @returns {() => void} unbind
   */
  static bindAll(root = document) {
    if (!root || typeof root.addEventListener !== 'function' || typeof root.querySelectorAll !== 'function') {
      return () => {};
    }
    const prev = roots.get(root);
    if (prev) {
      prev.refresh();
      return prev.unbind;
    }
    const touched = new Map();
    const inRoot = (t) => root === document || root === t || root.contains(t);
    const binding = { opts: {} };
    const find = (e) => {
      const n = e.target;
      const t = n instanceof Element ? n.closest(DECL) : null;
      if (!(t instanceof HTMLElement) || explicit.has(t) || !inRoot(t)) return null;
      if (card && card.contains(t)) return null; // no nested hovercards inside the card
      if (!touched.has(t)) prepTrigger(t, touched);
      if (handledEvents.has(e)) return null; // an inner root already handled it (nested roots, ISSUE-11)
      handledEvents.add(e);
      return t;
    };
    const h = {
      pointerover: (e) => { const t = find(e); if (t) onOver(e, t, binding); },
      pointerout: (e) => { const t = find(e); if (t) onOut(e, t); },
      focusin: (e) => { const t = find(e); if (t) onFocusIn(t, binding); },
      focusout: (e) => { if (find(e)) onFocusOut(e); },
      pointerdown: (e) => { const t = find(e); if (t) onPress(e, t); },
    };
    const refresh = () => {
      const list = [...root.querySelectorAll(DECL)];
      if (root instanceof Element && root.matches(DECL)) list.unshift(root);
      for (const t of list) {
        // explicitly bound triggers are acquired too (shared ownership, review ISSUE-9); only EVENT handling skips them
        if (t instanceof HTMLElement && !(card && card.contains(t))) prepTrigger(t, touched);
      }
    };
    for (const [type, fn] of Object.entries(h)) root.addEventListener(type, fn);
    refresh();
    const unbind = () => {
      if (roots.get(root)?.unbind !== unbind) return;
      roots.delete(root);
      for (const [type, fn] of Object.entries(h)) root.removeEventListener(type, fn);
      teardown(binding);
      restoreTriggers(touched);
    };
    roots.set(root, { unbind, refresh });
    return unbind;
  }

  /** Close the open card (no-op when none). Focus returns to the trigger only when it was inside the card. */
  static close() {
    closeSession('api');
  }
}

