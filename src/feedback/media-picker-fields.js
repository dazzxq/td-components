/**
 * v0.32.0 (plan docs/internal/plans/v0.32.0-media-picker.md, decisions 18, 21, 22) — INTERNAL module of
 * <td-media-picker> (not exported from index.js): descriptor → control factory, facet controls and the metadata /
 * upload-fields form model.
 *
 * - Controls are kit components (td-input-field / td-dropdown / td-chip-input / td-datetime-picker / td-toggle) with NO
 *   `name`: the form is virtual, never part of the page `<form>`.
 * - Every text from a descriptor / facet / adapter (labels, help, option labels, readonly values, error messages) is
 *   TEXT ONLY (attributes the components escape, or `textContent`) — never HTML.
 * - Scalar option values (`string | number | boolean | null`) go through positional tokens (`o0`, `o1`…, ScalarTokens)
 *   because the string-based controls compare values as strings (`1` and `"1"` would collide); `get()` maps back
 *   exactly (Object.is), `set(v)` finds the token by Object.is.
 * - `onChange` callbacks fire on USER edits only — `set()` / `setValues()` are silent.
 * - Ctrl/Cmd+Enter inside a field never reaches the control (a dropdown / date trigger would open, a textarea could
 *   insert a line): it is stopped on the field wrapper (capture) and RE-DISPATCHED from the wrapper as a fresh, bubbling,
 *   cancelable `keydown` (same key / modifiers) — the picker listens on `form.el` in the BUBBLE phase.
 * - Ids come from a module counter + `idPrefix` (never Math.random()).
 *
 * @module feedback/media-picker-fields
 */
import { ScalarTokens, normalizeError, normalizeOptions, VALUE_LIMITS } from '../utils/media-picker-core.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';
import '../form/td-chip-input.js';
import '../form/td-datetime-picker.js';
import '../form/td-toggle.js';

/** @typedef {import('../utils/media-picker-core.js').Scalar} Scalar */
/** @typedef {import('../utils/media-picker-core.js').FieldDescriptor} FieldDescriptor */
/** @typedef {import('../utils/media-picker-core.js').FacetDescriptor} FacetDescriptor */
/** @typedef {import('../utils/media-picker-core.js').FacetOption} FacetOption */
/** @typedef {import('../utils/media-picker-core.js').MediaAsset} MediaAsset */

/** Texts of this module (Vietnamese); the picker may override them per site. */
export const FIELD_LABELS = {
  /** facet `single`: placeholder when nothing is picked (= no filter) */
  all: 'Tất cả',
  /** accessible name of the general errors list of a form */
  generalErrors: 'Lỗi',
  /** `create-label` of a select with `createOption` (the row reads 'Thêm “{query}”' once text is typed) */
  create: 'Thêm mới',
  /** review SEC-3 r2: a metadata value over VALUE_LIMITS — the field is locked (never truncated, never saved) */
  tooLarge: 'Giá trị quá lớn để sửa ở đây — trường này được giữ nguyên.',
  /** createOption rejected without a `userMessage` */
  createError: 'Không thêm được lựa chọn.',
};

/** Year range of the date control (the datetime picker defaults to 2000–2099). */
const DATE_MIN = '1900-01-01';
const DATE_MAX = '2199-12-31';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

let idSeq = 0;
/** @param {string|undefined} prefix */
const nextId = (prefix) => `${prefix || 'td-mpf'}-${++idSeq}`;

let warnedDate = false;
let warnedVisible = false;
/** Test hook: re-arm the once-per-module warnings. */
export function _resetFieldWarnings() { warnedDate = false; warnedVisible = false; }

const isScalar = (v) => v === null || typeof v === 'string' || typeof v === 'boolean'
  || (typeof v === 'number' && Number.isFinite(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Raw options (descriptor / loadOptions / createOption results) → `{ value, label, count?, disabled }` (invalid dropped).
 * @param {unknown} list
 * @returns {FacetOption[]}
 */
function cleanOptions(list) {
  return normalizeOptions(list); // review SEC-3: ≤ LIMITS.options, labels capped
}

/** Review SEC-3 r3: a displayable scalar — string ≤ VALUE_LIMITS.text, finite number, boolean, null. */
const okScalar = (x) => x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x))
  || (typeof x === 'string' && x.length <= VALUE_LIMITS.text);

/**
 * Review SEC-3 r2 / r3: is `v` NOT acceptable for its control (→ the field is locked)? Every control except
 * `multiselect` takes ONLY a scalar (string within its VALUE_LIMITS length, finite number, boolean, null): any object /
 * array / NaN is refused without being walked or serialised. `multiselect`: an array of ≤ VALUE_LIMITS.multiselect
 * scalars (each string ≤ VALUE_LIMITS.text). O(1) per control (O(items ≤ 200) for multiselect).
 * @param {string} control @param {unknown} v @returns {boolean}
 */
export function oversizedValue(control, v) {
  if (v === undefined || v === null) return false;
  if (control === 'multiselect') {
    if (!Array.isArray(v)) return !okScalar(v);
    if (v.length > VALUE_LIMITS.multiselect) return true;
    for (let i = 0; i < v.length; i++) if (!okScalar(v[i])) return true;
    return false;
  }
  if (typeof v === 'string') return v.length > (VALUE_LIMITS[control] ?? VALUE_LIMITS.text);
  return !okScalar(v);
}

/**
 * Text of a value (readonly fields, provisional option labels) — review SEC-3 r3: scalars only (string ≤ 10 000, finite
 * number, boolean); anything else (object, array, null, oversized) → '' — never serialised.
 * @param {unknown} v
 */
function displayText(v) {
  if (v == null || !okScalar(v)) return '';
  return String(v);
}

/** Same typed value (arrays by content, Object.is per item). */
function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  }
  return Object.is(a, b);
}

/** Copy a typed value (arrays are copied). */
const copyValue = (v) => (Array.isArray(v) ? [...v] : v);

/**
 * An AbortController aborted when any of `signals` aborts. `release()` detaches the listeners.
 * @param {...(AbortSignal|null|undefined)} signals
 */
function linked(...signals) {
  const ctrl = new AbortController();
  const offs = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) { ctrl.abort(); break; }
    const on = () => ctrl.abort();
    s.addEventListener('abort', on, { once: true });
    offs.push(() => s.removeEventListener('abort', on));
  }
  return { ctrl, signal: ctrl.signal, release: () => offs.forEach((f) => f()) };
}

/**
 * Typed options ↔ tokens + their labels, in display order. Tokens are stable for the life of the set (a scalar keeps
 * its token across reloads), so the control's selection survives `options` re-assignment.
 */
class OptionSet {
  constructor() {
    this.tokens = new ScalarTokens();
    /** @type {Map<string, { label: string, count?: number, disabled: boolean }>} */
    this.meta = new Map();
    /** @type {string[]} tokens listed in the control, in order */
    this.order = [];
  }

  /** Register an option (label / count updated), not listed. @param {FacetOption} o @returns {string} */
  register(o) {
    const t = this.tokens.add(o.value);
    this.meta.set(t, { label: o.label, count: o.count, disabled: o.disabled === true });
    return t;
  }

  /** Replace the listed options. @param {FacetOption[]} list */
  reset(list) {
    this.order = [];
    this.append(list);
  }

  /** Add / update listed options. @param {FacetOption[]} list */
  append(list) {
    for (const o of list) {
      const t = this.register(o);
      if (!this.order.includes(t)) this.order.push(t);
    }
  }

  /** Token of a value; an unknown value gets one labelled as itself. @param {Scalar} v @param {boolean} list */
  ensure(v, list) {
    let t = this.tokens.tokenOf(v);
    if (t === null) {
      t = this.tokens.add(v);
      this.meta.set(t, { label: displayText(v), disabled: false });
    }
    if (list && !this.order.includes(t)) this.order.push(t);
    return t;
  }

  /** @param {string} t @param {boolean} [withCount] */
  label(t, withCount = false) {
    const m = this.meta.get(t);
    if (!m) return '';
    return withCount && m.count !== undefined ? `${m.label} (${m.count})` : m.label;
  }

  /** Control items `{ value: token, label, disabled }`. @param {boolean} [withCount] */
  items(withCount = false) {
    return this.order.map((t) => ({ value: t, label: this.label(t, withCount), disabled: this.meta.get(t)?.disabled === true }));
  }

  /** Typed value of a control token (undefined = unknown). @param {unknown} t */
  value(t) {
    return t == null ? undefined : this.tokens.valueOf(String(t));
  }
}

/**
 * Ctrl/Cmd+Enter inside `wrapper`: kept away from the control and re-dispatched from the wrapper (see module doc).
 * @param {HTMLElement} wrapper
 */
function guardSubmitShortcut(wrapper) {
  wrapper.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.target === wrapper || e.isComposing) return;
    e.stopPropagation();
    e.preventDefault();
    wrapper.dispatchEvent(new KeyboardEvent('keydown', {
      key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
      bubbles: true, cancelable: true, composed: true,
    }));
  }, true);
}

/**
 * Wire a help paragraph to the focused control of a non-input-field component: on first focus inside the wrapper the
 * help id is added to the focused element's `aria-describedby` (the components keep foreign ids there).
 * @param {HTMLElement} wrapper
 * @param {string} helpId
 */
function describeOnFocus(wrapper, helpId) {
  wrapper.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t === wrapper) return;
    const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(helpId)) t.setAttribute('aria-describedby', [...ids, helpId].join(' '));
  });
}

/**
 * @typedef {object} FieldControl
 * @property {string} key
 * @property {FieldDescriptor} descriptor
 * @property {HTMLElement} el wrapper `div.td-media-picker__field[data-key][data-control]`
 * @property {HTMLElement|null} control the td-* control (null for `readonly`)
 * @property {() => unknown} get typed value
 * @property {(v: unknown) => void} set silent
 * @property {(msg: string) => void} setError '' clears
 * @property {() => void} focus
 * @property {(on: boolean) => void} setDisabled
 * @property {(on: boolean) => void} setVisible
 * @property {boolean} visible
 * @property {() => void} destroy aborts loadOptions / createOption in flight
 */

/**
 * One descriptor → one control (decision 22).
 * @param {FieldDescriptor} descriptor already normalised (normalizeFields)
 * @param {object} [o]
 * @param {string} [o.idPrefix]
 * @param {AbortSignal} [o.signal] aborting it = destroy() for the async work
 * @param {(...a: unknown[]) => void} [o.warn]
 * @param {(change: { key: string, value: unknown }) => void} [o.onChange] user edits only
 * @returns {FieldControl}
 */
export function createFieldControl(descriptor, { idPrefix, signal, warn = console.warn, onChange } = {}) {
  const d = descriptor;
  const id = nextId(idPrefix);
  const life = linked(signal);
  let destroyed = false;
  let visible = true;

  const el = document.createElement('div');
  el.className = 'td-media-picker__field';
  el.setAttribute('data-key', d.key);
  el.setAttribute('data-control', d.control);

  /** @type {any} */
  let control = null;
  /** @type {() => unknown} */
  let get;
  /** @type {(v: unknown) => void} */
  let set;
  let readonlyNote = null;

  /** @type {FieldControl} */
  const api = {
    key: d.key,
    descriptor: d,
    el,
    control: null,
    get: () => get(),
    set: (v) => set(v),
    setError(msg) {
      const text = msg ? String(msg) : '';
      if (control && typeof control.setError === 'function') control.setError(text);
      else if (readonlyNote) {
        readonlyNote.textContent = text;
        readonlyNote.hidden = !text;
      }
    },
    focus() { if (control) control.focus(); },
    setDisabled(on) { if (control) control.toggleAttribute('disabled', !!on); },
    setVisible(on) {
      visible = !!on;
      el.hidden = !visible;
    },
    get visible() { return visible; },
    destroy() {
      destroyed = true;
      life.ctrl.abort();
      life.release();
    },
  };
  const userChange = () => {
    if (destroyed || typeof onChange !== 'function') return;
    onChange({ key: d.key, value: get() });
  };

  /** createOption(query) → a clean option, or null (aborted / invalid / rejected — the error shows on the control). */
  let createRun = null;
  const runCreate = async (query) => {
    if (createRun) createRun.ctrl.abort();
    const run = linked(life.signal);
    createRun = run;
    try {
      const raw = await d.createOption(query, { signal: run.signal });
      if (run.signal.aborted || destroyed) return null;
      const [opt] = cleanOptions([raw]);
      if (!opt) {
        warn(`td-media-picker: createOption of field "${d.key}" returned an invalid option (ignored).`);
        return null;
      }
      api.setError('');
      return opt;
    } catch (err) {
      const n = normalizeError(err, run.signal, { warn, operation: 'createOption' });
      if (n && !destroyed) api.setError(n.userMessage || FIELD_LABELS.createError);
      return null;
    } finally {
      run.release();
      if (createRun === run) createRun = null;
    }
  };

  const common = (tag) => {
    const c = document.createElement(tag);
    c.id = id;
    c.setAttribute('label', d.label);
    if (d.required) c.setAttribute('required', '');
    return c;
  };

  switch (d.control) {
    case 'text':
    case 'url':
    case 'textarea': {
      control = common('td-input-field');
      control.setAttribute('type', d.control);
      if (d.control === 'textarea') control.setAttribute('autoresize', '');
      if (d.helpText) control.setAttribute('helper-text', d.helpText);
      control.addEventListener('input', userChange);
      get = () => String(control.getValue() ?? '');
      set = (v) => control.setValue(v == null || typeof v === 'object' ? '' : String(v));
      break;
    }
    case 'select': {
      const opts = new OptionSet();
      opts.reset(cleanOptions(d.options));
      control = common('td-dropdown');
      if (d.required) control.setAttribute('allow-clear', 'false');
      const sync = () => { control.options = opts.items(); };
      sync();
      control.addEventListener('change', userChange);
      get = () => {
        const v = opts.value(control.getValue());
        return v === undefined || v === '' ? null : v;
      };
      set = (v) => {
        if (v === undefined || !isScalar(v) || ((v === null || v === '') && opts.tokens.tokenOf(v) === null)) {
          control.setValue(null);
          return;
        }
        const listed = opts.order.length;
        const t = opts.ensure(/** @type {Scalar} */ (v), true);
        if (opts.order.length !== listed) sync();
        control.setValue(t);
      };
      if (d.loadOptions) {
        try {
          Promise.resolve(d.loadOptions('', { signal: life.signal })).then((list) => {
            if (destroyed || life.signal.aborted) return;
            opts.append(cleanOptions(list));
            sync();
          }, (err) => { normalizeError(err, life.signal, { warn, operation: 'loadOptions' }); });
        } catch (err) {
          normalizeError(err, life.signal, { warn, operation: 'loadOptions' });
        }
      }
      if (d.createOption) {
        control.setAttribute('create-label', FIELD_LABELS.create);
        control.addEventListener('create', async (e) => {
          const query = String(e.detail?.query ?? '').trim();
          if (!query) return;
          const opt = await runCreate(query);
          if (!opt) return;
          opts.append([opt]);
          sync();
          control.setValue(opts.tokens.tokenOf(opt.value));
          userChange();
        });
      }
      break;
    }
    case 'multiselect': {
      const opts = new OptionSet();
      opts.reset(cleanOptions(d.options));
      control = common('td-chip-input');
      control.setAttribute(d.createOption ? 'allow-create' : 'selection-only', '');
      control.options = opts.items();
      if (d.loadOptions) {
        control.search = (query, ctx) => {
          const run = linked(life.signal, ctx && ctx.signal);
          return Promise.resolve()
            .then(() => d.loadOptions(query, { signal: run.signal }))
            .then((list) => cleanOptions(list).map((o) => ({ value: opts.register(o), label: o.label, disabled: o.disabled })))
            .finally(run.release);
        };
      }
      if (d.createOption) {
        control.create = async (text) => {
          const opt = await runCreate(text);
          return opt ? { value: opts.register(opt), label: opt.label } : null;
        };
      }
      control.addEventListener('change', userChange);
      get = () => {
        const out = [];
        for (const item of control.getValue()) {
          const v = opts.value(item && item.value);
          if (v !== undefined) out.push(v);
        }
        return out;
      };
      set = (v) => {
        const list = Array.isArray(v) ? v : (v === undefined ? [] : [v]);
        control.setValue(list.filter(isScalar).map((x) => {
          const t = opts.ensure(x, false);
          return { value: t, label: opts.label(t) };
        }));
      };
      break;
    }
    case 'date': {
      control = common('td-datetime-picker');
      control.setAttribute('mode', 'date');
      control.setAttribute('min', DATE_MIN);
      control.setAttribute('max', DATE_MAX);
      control.addEventListener('change', userChange);
      get = () => control.getDBValue() || null;
      set = (v) => {
        if (v == null || v === '') { control.setValue(null); return; }
        if (typeof v === 'string' && ISO_DATE.test(v)) {
          control.setDBValue(v);
          if (control.getDBValue() === v) return;
        }
        control.setValue(null);
        if (!warnedDate) {
          warnedDate = true;
          warn(`td-media-picker: field "${d.key}" expects a date "YYYY-MM-DD" — a malformed value was dropped.`);
        }
      };
      break;
    }
    default: { // readonly
      const dl = document.createElement('dl');
      dl.className = 'td-media-picker__readonly';
      const dt = document.createElement('dt');
      dt.className = 'td-media-picker__readonly-label';
      dt.textContent = d.label;
      const dd = document.createElement('dd');
      dd.className = 'td-media-picker__readonly-value';
      dd.id = id;
      dl.append(dt, dd);
      el.appendChild(dl);
      readonlyNote = document.createElement('p');
      readonlyNote.className = 'td-field-error';
      readonlyNote.hidden = true;
      let current = null;
      get = () => copyValue(current);
      set = (v) => {
        const ok = v !== undefined && okScalar(v); // review SEC-3 r3: scalars only, never copied / serialised
        current = ok ? v : null;
        dd.textContent = ok ? displayText(v) : '';
      };
    }
  }

  if (control) {
    api.control = control;
    el.appendChild(control);
    guardSubmitShortcut(el);
  }
  if (d.helpText && (!control || control.localName !== 'td-input-field')) {
    const help = document.createElement('p');
    help.className = 'td-field__note td-media-picker__help';
    help.id = `${id}-help`;
    help.textContent = d.helpText;
    el.appendChild(help);
    if (control) describeOnFocus(el, help.id);
  }
  if (readonlyNote) el.appendChild(readonlyNote);
  if (life.signal.aborted) api.destroy();
  else life.signal.addEventListener('abort', () => { destroyed = true; }, { once: true });
  return api;
}

/**
 * @typedef {object} FacetControl
 * @property {string} key
 * @property {HTMLElement} el `div.td-media-picker__facet[data-key][data-type]`
 * @property {() => (Scalar|Scalar[]|undefined)} get undefined = no filter
 * @property {(v: unknown) => void} set silent
 * @property {(facet: FacetDescriptor) => void} setDescriptor reload options, keep the value while still listed
 * @property {() => void} destroy
 */

/**
 * Facet → control (decision 18): `single` → td-dropdown (allow-clear, placeholder "Tất cả"); `multiple` → td-chip-input
 * selection-only; `toggle` → td-toggle (on = `options[0].value ?? true`, off = undefined). `count` → "Album A (12)".
 * A facet whose `type` changes needs a new control (setDescriptor keeps the type).
 * @param {FacetDescriptor} facet already normalised (normalizeFacets)
 * @param {object} [o]
 * @param {string} [o.idPrefix]
 * @param {(change: { key: string, value: unknown }) => void} [o.onChange] user changes only
 * @returns {FacetControl}
 */
export function createFacetControl(facet, { idPrefix, onChange } = {}) {
  let f = facet;
  const type = f.type;
  const id = nextId(idPrefix);
  let destroyed = false;
  const el = document.createElement('div');
  el.className = 'td-media-picker__facet';
  el.setAttribute('data-key', f.key);
  el.setAttribute('data-type', type);
  const opts = new OptionSet();
  opts.reset(cleanOptions(f.options));
  /** @type {any} */
  let control;
  const changed = () => {
    if (!destroyed && typeof onChange === 'function') onChange({ key: f.key, value: api.get() });
  };

  if (type === 'single') {
    control = document.createElement('td-dropdown');
    control.setAttribute('placeholder', FIELD_LABELS.all);
    control.options = opts.items(true);
  } else if (type === 'multiple') {
    control = document.createElement('td-chip-input');
    control.setAttribute('selection-only', '');
    control.options = opts.items(true);
  } else {
    control = document.createElement('td-toggle');
  }
  control.id = id;
  control.setAttribute('label', f.label);
  control.addEventListener('change', changed);
  el.appendChild(control);

  const onValue = () => {
    const o = f.options && f.options[0];
    return o ? (o.value ?? true) : true;
  };

  /** @type {FacetControl} */
  const api = {
    key: f.key,
    el,
    get() {
      if (type === 'single') return opts.value(control.getValue());
      if (type === 'multiple') {
        const out = [];
        for (const item of control.getValue()) {
          const v = opts.value(item && item.value);
          if (v !== undefined) out.push(v);
        }
        return out.length ? out : undefined;
      }
      return control.hasAttribute('checked') ? onValue() : undefined;
    },
    set(v) {
      if (type === 'single') {
        if (v === undefined || !isScalar(v)) { control.setValue(null); return; }
        const listed = opts.order.length;
        const t = opts.ensure(/** @type {Scalar} */ (v), true);
        if (opts.order.length !== listed) control.options = opts.items(true);
        control.setValue(t);
      } else if (type === 'multiple') {
        const list = Array.isArray(v) ? v : (v === undefined ? [] : [v]);
        control.setValue(list.filter(isScalar).map((x) => {
          const t = opts.ensure(x, false);
          return { value: t, label: opts.label(t, true) };
        }));
      } else {
        control.toggleAttribute('checked', v !== undefined && Object.is(v, onValue()));
      }
    },
    setDescriptor(next) {
      if (!next || next.type !== type) return;
      f = next;
      control.setAttribute('label', f.label);
      if (type === 'toggle') return;
      const current = api.get();
      opts.reset(cleanOptions(f.options));
      control.options = opts.items(true); // dropdown: a token no longer listed is dropped
      if (type === 'multiple' && current) {
        api.set(current.filter((v) => opts.order.includes(opts.tokens.tokenOf(v))));
      }
    },
    destroy() { destroyed = true; },
  };
  return api;
}

/**
 * The metadata / upload-fields form (decisions 21-22): `div.td-media-picker__form` = general errors list
 * (`ul.td-media-picker__form-errors[role=alert][hidden]`) + one wrapper per field, in descriptor order.
 * `readonly` fields are display only: never in `values()`, `dirty` or `missingRequired()`.
 */
export class FieldForm {
  /**
   * @param {FieldDescriptor[]} descriptors already normalised
   * @param {object} [o]
   * @param {MediaAsset} [o.asset] second argument of `visibleWhen`
   * @param {Record<string, unknown>} [o.values] initial values (asset.metadata or {})
   * @param {string} [o.idPrefix]
   * @param {AbortSignal} [o.signal]
   * @param {(...a: unknown[]) => void} [o.warn]
   * @param {(change: { key: string, value: unknown, form: FieldForm }) => void} [o.onChange] user edits only
   */
  constructor(descriptors, { asset, values = {}, idPrefix, signal, warn = console.warn, onChange } = {}) {
    this._asset = asset;
    this._warn = warn;
    this._onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'td-media-picker__form';
    this._errors = document.createElement('ul');
    this._errors.className = 'td-media-picker__form-errors';
    this._errors.setAttribute('role', 'alert');
    this._errors.setAttribute('aria-label', FIELD_LABELS.generalErrors);
    this._errors.hidden = true;
    this.el.appendChild(this._errors);
    /** @type {Map<string, FieldControl>} */
    this.controls = new Map();
    for (const d of Array.isArray(descriptors) ? descriptors : []) {
      if (this.controls.has(d.key)) continue;
      const c = createFieldControl(d, {
        idPrefix, signal, warn,
        onChange: ({ key, value }) => {
          this.refreshVisibility();
          if (typeof this._onChange === 'function') this._onChange({ key, value, form: this });
        },
      });
      this.controls.set(d.key, c);
      this.el.appendChild(c.el);
    }
    this._applyValues(values);
    this.refreshVisibility();
    this.snapshot();
  }

  /**
   * @private silent set of every field from `obj` (missing key → empty). Review SEC-3 r2: a value over VALUE_LIMITS is
   * never assigned — the field is LOCKED (disabled + kit message) and left out of values() / dirty / missingRequired().
   */
  _applyValues(obj) {
    const src = isObj(obj) ? obj : {};
    if (!this._locked) this._locked = new Set();
    for (const [key, c] of this.controls) {
      const v = Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
      const wasLocked = this._locked.has(key);
      if (oversizedValue(c.descriptor.control, v)) {
        this._locked.add(key);
        c.set(undefined);
        c.setDisabled(true);
        c.setError(FIELD_LABELS.tooLarge);
        continue;
      }
      if (wasLocked) {
        this._locked.delete(key);
        c.setDisabled(!!this._formDisabled);
        c.setError('');
      }
      c.set(v);
    }
  }

  /** @private typed values of every editable, unlocked field (visible or not) */
  _all() {
    const out = {};
    for (const [key, c] of this.controls) if (c.control && !this._locked?.has(key)) out[key] = c.get();
    return out;
  }

  /** @returns {Record<string, unknown>} the VISIBLE editable fields only (locked oversized ones never): `{ key: typed value }` */
  values() {
    const out = {};
    for (const [key, c] of this.controls) if (c.control && c.visible && !this._locked?.has(key)) out[key] = c.get();
    return out;
  }

  /** @returns {boolean} some field differs from the snapshot (typed, arrays by content) */
  get dirty() {
    const now = this._all();
    return Object.keys(now).some((k) => !sameValue(now[k], this._baseline[k]));
  }

  /** Re-capture the current values as the clean baseline (after a successful save). */
  snapshot() {
    const all = this._all();
    this._baseline = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, copyValue(v)]));
  }

  /**
   * Silent overwrite of every field (missing key → empty), e.g. "Tải lại" after a conflict; visibility re-run.
   * Call snapshot() afterwards when the new values are the clean baseline.
   * @param {Record<string, unknown>} obj
   * @param {MediaAsset} [asset] a newer asset for `visibleWhen`
   */
  setValues(obj, asset) {
    if (asset !== undefined) this._asset = asset;
    this._applyValues(obj);
    this.refreshVisibility();
  }

  /** Re-run `visibleWhen(values, asset)` for every field (values = every field, typed). A throw → visible + one warning. */
  refreshVisibility() {
    const all = {};
    for (const [key, c] of this.controls) all[key] = c.get();
    for (const c of this.controls.values()) {
      const fn = c.descriptor.visibleWhen;
      if (typeof fn !== 'function') continue;
      let show = true;
      try {
        show = !!fn({ ...all }, this._asset);
      } catch (err) {
        if (!warnedVisible) {
          warnedVisible = true;
          this._warn(`td-media-picker: visibleWhen of field "${c.key}" threw (field shown).`);
        }
      }
      c.setVisible(show);
    }
  }

  /**
   * Show a normalised adapter error (normalizeError result): `fieldErrors` of a VISIBLE editable field → on its control
   * (messages joined with ' '), the others → the general list (text). Focuses and returns the first errored field
   * (descriptor order), or null.
   * @param {{ fieldErrors?: Map<string, string[]> }|null} normalized
   * @returns {FieldControl|null}
   */
  applyErrors(normalized) {
    this.clearErrors();
    const fe = normalized && normalized.fieldErrors;
    const entries = fe instanceof Map ? [...fe] : (isObj(fe) ? Object.entries(fe) : []);
    const errored = new Set();
    for (const [key, msgs] of entries) {
      const text = (Array.isArray(msgs) ? msgs : [msgs]).filter((m) => typeof m === 'string' && m).join(' ');
      if (!text) continue;
      const c = this.controls.get(key);
      if (c && c.control && c.visible) {
        c.setError(text);
        errored.add(key);
      } else {
        const li = document.createElement('li');
        li.textContent = text;
        this._errors.appendChild(li);
      }
    }
    this._errors.hidden = this._errors.children.length === 0;
    for (const [key, c] of this.controls) {
      if (errored.has(key)) {
        c.focus();
        return c;
      }
    }
    return null;
  }

  /** Clear every field error and the general list. */
  clearErrors() {
    for (const c of this.controls.values()) c.setError(this._locked?.has(c.key) ? FIELD_LABELS.tooLarge : '');
    this._errors.replaceChildren();
    this._errors.hidden = true;
  }

  /** @returns {boolean} a visible required field has no value ('' / null / []) */
  missingRequired() {
    for (const c of this.controls.values()) {
      if (!c.control || !c.visible || !c.descriptor.required || this._locked?.has(c.key)) continue;
      const v = c.get();
      if (v === '' || v == null || (Array.isArray(v) && !v.length)) return true;
    }
    return false;
  }

  /** @param {boolean} on */
  setDisabled(on) {
    this._formDisabled = !!on;
    for (const c of this.controls.values()) c.setDisabled(on || !!this._locked?.has(c.key));
  }

  /** Abort the async work of every field (loadOptions / createOption). */
  destroy() {
    for (const c of this.controls.values()) c.destroy();
  }
}
