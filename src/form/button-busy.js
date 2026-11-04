/**
 * Busy helper for `.td-btn` buttons (plan docs/internal/plans/v0.96.0-busy-button.md, ADR 0043).
 *
 *   import { setButtonBusy, runWithButton } from '@dazzxq/td-components/button-busy';
 *   setButtonBusy(btn, true);                       // button.td-btn | a.td-btn | <td-button> (host or its control)
 *   await runWithButton(btn, () => fetch(…));       // busy for the duration, one in-flight promise per button
 *
 * ONE source of truth for the busy state: `syncButtonState()` (internal) is used by both functions AND by td-button
 * (`setLoading` / `run` / `_syncState`). Busy contract, the same on every path:
 *   - `aria-busy="true"` + `aria-disabled="true"`, NEVER the native `disabled` (focus is kept, a submit button keeps its
 *     `name=value` in `new FormData(form, submitter)`);
 *   - link (`a.td-btn`): `tabindex` set BEFORE `href` is removed, `role="link"`; on release `href` is restored BEFORE
 *     `tabindex` is removed (a focused link is never unfocusable for an instant);
 *   - activation swallowed by ONE capture `click` listener per document (installed lazily, never removed): mouse, touch,
 *     Enter / Space and implicit form submission all arrive as a `click`;
 *   - the shared spinner `.td-btn__spinner` is shown (built once with createElement when hand-written markup has none).
 *
 * No side effects on import. No `instanceof` (elements of another document / iframe work), no `Function.name`, no
 * `innerHTML`, no `style` attribute (CSP `style-src-attr 'none'`).
 * The lightbox toolbar mirrors this contract on `.td-lightbox__btn` without the spinner (td-lightbox.js `setExtraBusy`).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Hosts whose busy state is their `loading` attribute (td-action-button extends td-button). */
const HOSTS = new Set(['td-button', 'td-action-button']);
/** Documents that already have the click guard. */
const guarded = new WeakSet();
/** Plain control → attributes it had before the helper made it busy (restored verbatim). */
const saved = new WeakMap();
/** Plain control / un-upgraded host → its in-flight runWithButton() promise. */
const running = new WeakMap();

/** @param {Element} el @param {string} name @param {string|null|undefined} value null / undefined = remove */
function setOrRemove(el, name, value) {
  if (value === null || value === undefined) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== String(value)) {
    el.setAttribute(name, value);
  }
}

/** @param {Element} el @param {string} cls @returns {Element|null} the first element child carrying `cls` */
function childWithClass(el, cls) {
  for (const c of el.children) if (c.classList && c.classList.contains(cls)) return c;
  return null;
}

/** A busy `.td-btn` control (button or link). */
function isBusyControl(n) {
  return !!n && n.nodeType === 1 && !!n.classList && n.classList.contains('td-btn') && n.getAttribute('aria-busy') === 'true';
}

/** Capture listener: a click on (or inside) a busy `.td-btn` never reaches the page. */
function onGuardClick(e) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
  let hit = false;
  if (path && path.length) {
    hit = path.some(isBusyControl);
  } else {
    for (let n = e.target; n; n = n.parentNode) if (isBusyControl(n)) { hit = true; break; }
  }
  if (!hit) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

/**
 * @internal Install the busy click guard on `doc` once (capture, never removed).
 * @param {Document|null|undefined} doc
 * @returns {boolean} true when it was installed now
 */
export function ensureGuard(doc) {
  if (!doc || typeof doc.addEventListener !== 'function' || guarded.has(doc)) return false;
  guarded.add(doc);
  doc.addEventListener('click', onGuardClick, true);
  return true;
}

/**
 * Hand-written markup with bare text (`<button class="td-btn">Lưu</button>`): wrap the non-blank text nodes once in a
 * `.td-btn__label` so the busy rule can fade it under the spinner. Markup that has a label already is left alone.
 * @param {Element} control
 */
function wrapBareText(control) {
  if (childWithClass(control, 'td-btn__label')) return;
  const texts = [...control.childNodes].filter((n) => n.nodeType === 3 && n.data.trim());
  if (!texts.length) return;
  const label = control.ownerDocument.createElement('span');
  label.setAttribute('class', 'td-btn__label');
  control.insertBefore(label, texts[0]);
  for (const t of texts) label.appendChild(t);
}

/**
 * @internal The control's spinner, built once (same shape PHP td_button() / td-button print) when it has none.
 * @param {Element} control
 * @returns {Element}
 */
export function ensureSpinner(control) {
  wrapBareText(control);
  const have = childWithClass(control, 'td-btn__spinner');
  if (have) return have;
  const doc = control.ownerDocument;
  const span = doc.createElement('span');
  span.setAttribute('class', 'td-btn__spinner td-spinner td-spinner--sm');
  span.setAttribute('aria-hidden', 'true');
  span.hidden = true;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'td-spinner__svg');
  svg.setAttribute('viewBox', '0 0 50 50');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const cls of ['td-spinner__track', 'td-spinner__arc']) {
    const c = doc.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '25');
    c.setAttribute('cy', '25');
    c.setAttribute('r', '20');
    svg.appendChild(c);
  }
  span.appendChild(svg);
  control.appendChild(span);
  return span;
}

/**
 * @internal The ONE writer of the busy state of a `.td-btn` control (td-button and the public helpers).
 * @param {Element} control `button.td-btn` or `a.td-btn`
 * @param {{ busy: boolean, inert?: boolean,
 *   restore?: { href?: string|null, tabindex?: string|null, role?: string|null, ariaDisabled?: string|null } }} state
 *   `inert` (link only): the link is unusable regardless of busy (disabled / no safe href) → `tabindex="-1"`.
 *   `restore`: the values applied VERBATIM when neither busy nor inert (null = remove the attribute).
 */
export function syncButtonState(control, { busy, inert = false, restore = {} }) {
  if (control.localName === 'a') {
    if (inert || busy) {
      // Order matters: tabindex BEFORE href goes (a focused link must stay focusable).
      setOrRemove(control, 'tabindex', inert ? '-1' : '0');
      setOrRemove(control, 'href', null);
      setOrRemove(control, 'role', 'link'); // an <a> without href is no longer a link for AT
      setOrRemove(control, 'aria-disabled', 'true');
    } else {
      // …and href BEFORE tabindex is removed.
      setOrRemove(control, 'href', restore.href ?? null);
      setOrRemove(control, 'tabindex', restore.tabindex ?? null);
      setOrRemove(control, 'role', restore.role ?? null);
      setOrRemove(control, 'aria-disabled', restore.ariaDisabled ?? null);
    }
    setOrRemove(control, 'aria-busy', busy ? 'true' : null);
  } else if (busy) {
    setOrRemove(control, 'aria-busy', 'true');
    setOrRemove(control, 'aria-disabled', 'true');
  } else {
    setOrRemove(control, 'aria-busy', null);
    setOrRemove(control, 'aria-disabled', restore.ariaDisabled ?? null);
  }
  const spinner = busy ? ensureSpinner(control) : childWithClass(control, 'td-btn__spinner');
  if (spinner) spinner.hidden = !busy;
  if (busy) ensureGuard(control.ownerDocument);
}

/**
 * @param {*} target
 * @param {string} fnName
 * @returns {{ host: Element } | { control: Element }}
 */
function resolveTarget(target, fnName) {
  if (target && target.nodeType === 1) {
    const ln = target.localName;
    if (HOSTS.has(ln)) return { host: target };
    if ((ln === 'button' || ln === 'a') && target.classList && target.classList.contains('td-btn')) {
      const p = target.parentElement;
      return p && HOSTS.has(p.localName) ? { host: p } : { control: target };
    }
  }
  throw new TypeError(`${fnName}: expected button.td-btn, a.td-btn or <td-button>`);
}

/** @param {Element} host @param {boolean} busy */
function setHostBusy(host, busy) {
  if (typeof host.setLoading === 'function') host.setLoading(busy);
  else if (busy) host.setAttribute('loading', '');
  else host.removeAttribute('loading');
}

/** @param {Element} control @param {boolean} busy */
function setControlBusy(control, busy) {
  const snap = saved.get(control);
  if (busy) {
    if (snap) return; // already busy through the helper: never snapshot the busy state itself
    const s = {
      href: control.getAttribute('href'),
      tabindex: control.getAttribute('tabindex'),
      role: control.getAttribute('role'),
      ariaDisabled: control.getAttribute('aria-disabled'),
    };
    // busy printed by the server (aria-busy="true"): its aria-disabled on a <button> is a busy mark, not the author's
    if (control.localName !== 'a' && control.getAttribute('aria-busy') === 'true') s.ariaDisabled = null;
    // a link that was unusable before (no href, or the author's aria-disabled) keeps tabindex="-1" while busy
    s.inert = control.localName === 'a' && (s.href === null || s.ariaDisabled === 'true');
    saved.set(control, s);
    syncButtonState(control, { busy: true, inert: s.inert, restore: s });
  } else if (snap) {
    saved.delete(control);
    syncButtonState(control, { busy: false, inert: false, restore: snap });
  } else if (control.hasAttribute('aria-busy')) {
    // busy printed by the server, never through the helper: drop only the busy marks (author aria-* stay)
    control.removeAttribute('aria-busy');
    if (control.localName !== 'a') control.removeAttribute('aria-disabled');
    const spinner = childWithClass(control, 'td-btn__spinner');
    if (spinner) spinner.hidden = true;
  }
}

/**
 * Put a `.td-btn` button in / out of the busy state (no markup change needed).
 * @param {HTMLButtonElement|HTMLAnchorElement|HTMLElement} target `button.td-btn`, `a.td-btn`, or a `<td-button>` /
 *   `<td-action-button>` host (its inner control resolves to the host)
 * @param {boolean} busy
 * @throws {TypeError} any other target
 */
export function setButtonBusy(target, busy) {
  const t = resolveTarget(target, 'setButtonBusy');
  if ('host' in t) setHostBusy(t.host, !!busy);
  else setControlBusy(t.control, !!busy);
}

/**
 * Run an async action with the button busy: busy BEFORE `fn` starts (a microtask later), always released in `finally`;
 * the result is returned / the error rethrown. A call while one is running returns the SAME in-flight promise. A
 * `<td-button>` host delegates to its own `run()` (one shared promise with `btn.run()`).
 * @template T
 * @param {HTMLButtonElement|HTMLAnchorElement|HTMLElement} target see setButtonBusy
 * @param {() => (T|Promise<T>)} fn
 * @returns {Promise<T>}
 * @throws {TypeError} synchronously for a wrong target (a wrong `fn` → rejected promise)
 */
export function runWithButton(target, fn) {
  const t = resolveTarget(target, 'runWithButton');
  if (typeof fn !== 'function') return Promise.reject(new TypeError('runWithButton: a function is required'));
  const el = 'host' in t ? t.host : t.control;
  if ('host' in t && typeof el.run === 'function') return el.run(fn);
  if (running.has(el)) return running.get(el);
  setButtonBusy(el, true);
  // The guard exists BEFORE fn runs (a synchronous nested call gets the same promise); fn starts a microtask later.
  const p = Promise.resolve().then(() => fn()).finally(() => {
    running.delete(el);
    setButtonBusy(el, false);
  });
  running.set(el, p);
  return p;
}
