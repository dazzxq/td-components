/**
 * trackFormDirty(form) — "unsaved changes" for a <form> (v0.44.0, plan v0.44.0-confirm-dirty §C, QĐ 18-24). Re-exported
 * by ./form-validation.js (subpath `./form-validation`) and index.js. No element, no CSS; the discard dialog
 * (`confirmDiscard`) loads TdModal lazily.
 *
 * Semantics:
 * - Snapshot = the ORDERED `[name, value]` list of `new FormData(form)` — native controls AND every td form-associated
 *   control (ElementInternals.setFormValue, multi-entry FormData included). Strings compare verbatim, `File`s by
 *   identity. `opts.ignore` (names or a predicate) drops fields.
 * - `dirty = manual || (interacted && snapshot ≠ baseline)`: values that change WITHOUT a user event (custom element
 *   upgrade, SSR hydrate, a remote dropdown resolving, `el.value = …` from code) never make the form dirty —
 *   `markDirty()` / `check()` for those. `interacted` = one user event of `trackFormDirty.events` from a control of the
 *   form (also `form="id"` controls outside it).
 * - `beforeunload` (default on) is armed SYNCHRONOUSLY by the first user event / markDirty() and disarmed once the form
 *   is clean again (keeps the bfcache); its handler always recomputes before blocking. A native submit of the form
 *   (not prevented) is never blocked.
 * - `dirty-change` ({ dirty }, bubbles) on the form whenever the computed state flips (user events are batched per
 *   animation frame).
 */

/**
 * The ordered snapshot of form entries.
 * @param {Iterable<[string, unknown]>|null|undefined} entries e.g. a FormData
 * @param {string[]|((name: string) => boolean)|null} [ignore]
 * @returns {Array<[string, unknown]>}
 */
export function snapshotOf(entries, ignore = null) {
  const out = [];
  if (!entries || typeof entries[Symbol.iterator] !== 'function') return out;
  const skip = ignoreTest(ignore);
  for (const entry of entries) {
    if (!entry) continue;
    const name = String(entry[0]);
    if (skip(name)) continue;
    out.push([name, isEmptyFile(entry[1]) ? EMPTY_FILE : entry[1]]);
  }
  return out;
}

/** A file input with no file submits a NEW empty File on every FormData: all of them are the same "no file". */
const EMPTY_FILE = Object.freeze({ emptyFile: true });
const isEmptyFile = (v) => !!v && typeof v === 'object' && v.name === '' && v.size === 0 && typeof v.type === 'string'
  && typeof v.lastModified === 'number';

/**
 * @param {string[]|((name: string) => boolean)|null|undefined} ignore
 * @returns {(name: string) => boolean}
 */
function ignoreTest(ignore) {
  if (Array.isArray(ignore)) {
    const set = new Set(ignore.map(String));
    return (n) => set.has(n);
  }
  if (typeof ignore === 'function') {
    return (n) => {
      try { return ignore(n) === true; } catch (err) { console.error('trackFormDirty: ignore() threw', err); return false; }
    };
  }
  return () => false;
}

/**
 * Same entries in the same order; strings by value, anything else (File) by identity.
 * @param {Array<[string, unknown]>|null} a
 * @param {Array<[string, unknown]>|null} b
 * @returns {boolean}
 */
export function sameSnapshot(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------------------------------------------

/** form → its tracker (one per form; trackFormDirty() again returns it). */
const TRACKERS = new WeakMap();

/**
 * @typedef {object} FormDirtyTracker
 * @property {() => boolean} isDirty fresh computation, no event
 * @property {() => boolean} check recompute now: `dirty-change` when it flipped, beforeunload (dis)armed
 * @property {() => void} markClean after a SUCCESSFUL save: baseline = now, clean
 * @property {() => void} markDirty dirty until markClean() (state outside FormData, values set from code)
 * @property {(opts?: object) => Promise<boolean>} confirmDiscard clean → true at once; dirty → asks (danger dialog)
 * @property {() => void} destroy remove every listener
 */

/**
 * Track unsaved changes of a <form> (see the module comment).
 * @param {HTMLFormElement} form
 * @param {object} [opts]
 * @param {string[]|((name: string) => boolean)} [opts.ignore] fields that never count (`_token`, a search box)
 * @param {string[]} [opts.events] extra user-change event types, added to `trackFormDirty.events`
 * @param {boolean} [opts.beforeUnload=true] warn when leaving the page while dirty
 * @returns {FormDirtyTracker}
 */
export function trackFormDirty(form, opts = {}) {
  if (typeof HTMLFormElement === 'undefined' || !(form instanceof HTMLFormElement)) {
    throw new TypeError('trackFormDirty: a <form> is required');
  }
  const existing = TRACKERS.get(form);
  if (existing) {
    if (opts && typeof opts === 'object' && Object.keys(opts).length) {
      console.warn('trackFormDirty: this form is already tracked — the existing tracker is returned, new options ignored');
    }
    return existing;
  }
  const o = opts || {};
  const ignore = Array.isArray(o.ignore) || typeof o.ignore === 'function' ? o.ignore : null;
  const events = [...new Set([...trackFormDirty.events, ...(Array.isArray(o.events) ? o.events : [])].map(String))];
  const beforeUnload = o.beforeUnload !== false;
  const take = () => snapshotOf(new FormData(form), ignore);

  let baseline = take();
  let interacted = false; // a user change event since the baseline
  let manual = false; // markDirty()
  let reported = false; // last state announced through dirty-change
  let armed = false; // beforeunload listener registered
  let submitting = false; // a native submit of this form is under way
  let destroyed = false;
  let frame = 0;
  let resetTimer = 0;

  const compute = () => manual || (interacted && !sameSnapshot(take(), baseline));
  const announce = (dirty) => {
    if (dirty === reported) return;
    reported = dirty;
    form.dispatchEvent(new CustomEvent('dirty-change', { bubbles: true, composed: true, detail: { dirty } }));
  };
  const onBeforeUnload = (e) => {
    // always fresh: a revert in the same task as the unload must not block it
    if (destroyed || submitting || !form.isConnected || !compute()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  const arm = () => {
    if (!beforeUnload || armed || destroyed) return;
    armed = true;
    window.addEventListener('beforeunload', onBeforeUnload);
  };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
  const sync = () => {
    if (destroyed) return false;
    const dirty = compute();
    if (dirty) arm();
    else disarm(); // clean again → no listener (bfcache); the next user event arms it synchronously
    announce(dirty);
    return dirty;
  };
  const cancelFrame = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  /** the event comes from a control of this form (inside it, or associated through `form="id"`) */
  const owns = (target) => {
    for (let n = target instanceof Element ? target : null; n; n = n.parentElement) {
      if (n === form) return true;
      if (n !== target && n instanceof HTMLFormElement) return false; // inside ANOTHER form
      try { if ('form' in n && n.form === form) return true; } catch { /* ignore */ }
    }
    return false;
  };
  const onUserChange = (e) => {
    if (destroyed || !owns(e.target)) return;
    const d = /** @type {CustomEvent} */ (e).detail;
    if (d && typeof d === 'object') {
      if (d.trigger === 'api' || d.source === 'api') return; // a value set from code (td convention)
      if (d.trigger === 'reset') { onReset(); return; }
    }
    interacted = true;
    submitting = false;
    arm(); // QĐ 23: synchronously — no gap before the batched recompute
    schedule();
  };
  // Before the user's first edit, re-take the baseline (values settled by upgrades / hydration / remote options after
  // trackFormDirty() never count): focus or a press inside the form comes before the edit itself.
  const onApproach = (e) => {
    if (destroyed || interacted || manual || !owns(e.target)) return;
    baseline = take();
  };
  function onReset(e) {
    if (destroyed || (e && e.target !== form)) return;
    interacted = true;
    arm();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { resetTimer = 0; sync(); }, 0); // `reset` fires before the values change
  }
  const onSubmit = (e) => {
    if (e.target === form && !e.defaultPrevented) submitting = true; // after the app's / attach()'s handlers
  };
  const onPageShow = () => { submitting = false; };

  for (const t of events) document.addEventListener(t, onUserChange, true);
  document.addEventListener('focusin', onApproach, true);
  document.addEventListener('pointerdown', onApproach, true);
  document.addEventListener('reset', onReset, true);
  window.addEventListener('submit', onSubmit);
  window.addEventListener('pageshow', onPageShow);

  /** @type {FormDirtyTracker} */
  const tracker = {
    isDirty: () => !destroyed && compute(),
    check: () => {
      cancelFrame();
      return sync();
    },
    markClean() {
      if (destroyed) return;
      cancelFrame();
      baseline = take();
      interacted = false;
      manual = false;
      submitting = false;
      disarm();
      announce(false);
    },
    markDirty() {
      if (destroyed) return;
      manual = true;
      arm();
      announce(true);
    },
    confirmDiscard(options = {}) {
      if (destroyed || !compute()) return Promise.resolve(true);
      const { confirm, ...rest } = options || {};
      const L = trackFormDirty.labels;
      const dialog = {
        title: L.discardTitle,
        message: L.discardMessage,
        confirmText: L.discardConfirm,
        cancelText: L.discardCancel,
        confirmVariant: 'danger',
        themeRoot: form,
        ...rest,
      };
      const ask = typeof confirm === 'function'
        ? () => confirm(dialog)
        : () => import('../feedback/td-modal.js').then(({ TdModal }) => TdModal.confirm(dialog));
      let pending;
      try { pending = Promise.resolve(ask()); } catch (err) { pending = Promise.reject(err); }
      return pending.then((v) => v === true, (err) => {
        console.error('trackFormDirty: confirmDiscard failed', err);
        return false; // keep the data
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelFrame();
      clearTimeout(resetTimer);
      disarm();
      for (const t of events) document.removeEventListener(t, onUserChange, true);
      document.removeEventListener('focusin', onApproach, true);
      document.removeEventListener('pointerdown', onApproach, true);
      document.removeEventListener('reset', onReset, true);
      window.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onPageShow);
      if (TRACKERS.get(form) === tracker) TRACKERS.delete(form);
    },
  };
  TRACKERS.set(form, tracker);
  return tracker;
}

/**
 * User-change events observed (plan QĐ 20a): native `input` / `change`, and the td events that change FormData without
 * a `change` (td-table `select-change`, td-dropzone `files-change`, td-repeater `rows-change`, td-sortable
 * `order-change`, td-cropper `crop-change` / `focal-change`). `detail.trigger === 'api'` / `detail.source === 'api'`
 * never count. Extend per form with `opts.events`, or here for the whole site.
 */
trackFormDirty.events = ['input', 'change', 'select-change', 'files-change', 'rows-change', 'order-change',
  'crop-change', 'focal-change'];

/** Texts of the default discard dialog (Vietnamese); override per site. */
trackFormDirty.labels = {
  discardTitle: 'Thay đổi chưa lưu',
  discardMessage: 'Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?',
  discardConfirm: 'Bỏ thay đổi',
  discardCancel: 'Ở lại',
};
