/**
 * TdFormValidation — client + server validation errors onto form fields (static helper, no element, no Shadow DOM).
 * Token-native: the only styles it needs are `.td-field-error` (field.css) and `.td-form-summary`
 * (form-validation.css) in td.css. CSP-strict: no inline styles, no `<style>`, every message/label is TEXT.
 *
 * Rules (plan v0.12.0 D15–D20):
 * - **Native constraint attributes are the rules** (`required`, `min`/`max`, `minlength`/`maxlength`, `pattern`,
 *   `type`, td `max-length`/`min`/`max`…). `validate()` only READS `validity`. Optional JS `rules`
 *   (`{ [name]: (value, control, root) => message | '' }`) are pushed into the same API with
 *   `setCustomValidity()` — ONLY inside `validate()` and the live revalidation of `attach()`.
 * - **Server errors** (`apply()`, Laravel `{ field: msg | msg[] }`) never change constraint validity: they are
 *   shown through the error contract (`setError`) or, for native controls, `aria-invalid` + a note.
 * - Key → field resolution is scoped to the root: `fieldMap[key]` (Element or id) → `elements.namedItem` /
 *   `[name]` (also dotted → bracket names: `a.0.b` → `a[0][b]`, `tags` → `tags[]`) → `[data-field]`. A match is
 *   then normalised to the REAL control (an inner native of a td host → the host; a wrapper → its descendant td
 *   control or native control), used for dispatch, document order, summary links and focus. Unknown keys →
 *   `unmapped` (+ the summary when shown); never throws.
 * - Dispatch: `TdFormElement` with `errorContract` → `setError`; any other element with `setError()` → `setError`;
 *   native control → `aria-invalid="true"` + `aria-errormessage` + `aria-describedby` (merged; only our id is
 *   removed later) + `<span class="td-field-error" data-td-fv>` inserted after the control (or its wrapping
 *   `<label>`). Sites style native controls with their own `[aria-invalid="true"]` rule.
 * - Focus: the first invalid control in DOCUMENT order (`focus()` only — it scrolls; no smooth scroll).
 * - Summary (optional): `div.td-form-summary[role=alert]` with one `button.td-form-summary__link` per field
 *   (activating it focuses the field) + plain items for unmapped server errors. `summary: 'auto'` = shown for
 *   ≥ 2 errors or any unmapped error; mounted in `summaryTarget` (appended, never wipes) or prepended in the root.
 *
 * DOM written next to a native control:
 *   <input … aria-invalid="true" aria-errormessage="{id}-error" aria-describedby="… {id}-error">
 *   <span class="td-field-error" id="{id}-error" data-for="{id}" data-td-fv="">{message}</span>
 *
 * @example
 * const r = TdFormValidation.validate(form, { rules: { slug: (v) => /^[a-z0-9-]+$/.test(v) ? '' : 'Chỉ chữ thường' } });
 * TdFormValidation.apply(form, { 'meta.title': ['Tiêu đề đã tồn tại'] });
 * const detach = TdFormValidation.attach(form, { onValid: async (e, f) => save(new FormData(f)) });
 */

import { TdFormElement } from '../base/td-form-element.js';

/** Failing-flag order used to pick ONE message per control. */
const FLAGS = ['valueMissing', 'typeMismatch', 'badInput', 'patternMismatch', 'tooShort', 'tooLong',
  'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'customError'];
const SKIP_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image']);

/** root → per-root bookkeeping (only what this helper set is ever undone). */
const STATES = new WeakMap();
/** Non-configurable message used when a throwing rule has no usable `messages.ruleError` (fail closed). */
const RULE_ERROR_FALLBACK = 'Không thể kiểm tra giá trị này';
let _idCounter = 0;

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (node-tested)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Field-name candidates for a server error key, in lookup order: the key itself, dotted → bracket
 * (`items.0.name` → `items[0][name]`), the PHP array form (`tags` → `tags[]`; `tags.0` → `tags[]`).
 * @param {string} key
 * @returns {string[]}
 */
export function nameCandidates(key) {
  const k = String(key);
  const out = [k];
  const parts = k.split('.');
  if (parts.length > 1 && parts.every(Boolean)) {
    out.push(parts[0] + parts.slice(1).map((p) => `[${p}]`).join(''));
    if (/^\d+$/.test(parts[parts.length - 1])) {
      const head = parts.slice(0, -1);
      out.push(head[0] + head.slice(1).map((p) => `[${p}]`).join('') + '[]');
    }
  }
  if (!k.endsWith('[]')) out.push(`${k}[]`);
  return [...new Set(out)];
}

/**
 * Fill `{name}` placeholders from `values` (missing → empty string). Plain text in, plain text out.
 * @param {string} template
 * @param {Object<string, *>} values
 * @returns {string}
 */
export function formatMessage(template, values = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (values[k] == null ? '' : String(values[k])));
}

/**
 * First message of a Laravel error value (`'msg'` | `['msg', …]`); '' when there is none.
 * @param {*} value
 * @returns {string}
 */
export function firstMessage(value) {
  if (Array.isArray(value)) {
    for (const v of value) {
      const m = firstMessage(v);
      if (m) return m;
    }
    return '';
  }
  if (value == null || value === false) return '';
  return String(value).trim();
}

// ---------------------------------------------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------------------------------------------

/** A validation "host": a td form control, or any custom element exposing the error contract (setError). */
function isHost(el) {
  return el instanceof TdFormElement
    || (el instanceof HTMLElement && el.localName.includes('-') && typeof el.setError === 'function');
}

function isNativeControl(el) {
  if (el instanceof HTMLInputElement) return !SKIP_TYPES.has(el.type);
  return el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

/** Nearest host ancestor-or-self of `el`, not above `root` (root excluded unless it is `el`). */
function hostOf(el, root) {
  for (let n = el; n && n !== root; n = n.parentElement) {
    if (isHost(n)) return n;
  }
  return el === root && isHost(el) ? el : null;
}

/**
 * All radios of el's group (one helper for representative, rule values and ARIA targets — review ISSUE-10): same
 * `name` AND same form owner (`r.form === el.form`), drawn from `root.elements` when root is a form (so radios
 * associated with `form="…"` outside it count) or from root's descendants otherwise (independent forms inside a
 * non-form root never merge). Always contains el. No selector is built from names.
 * @param {HTMLInputElement} el
 * @param {Element} root
 * @returns {HTMLInputElement[]}
 */
function radioMembers(el, root) {
  const scope = root instanceof HTMLFormElement ? [...root.elements]
    : [...(root.contains(el) ? root : el.getRootNode()).querySelectorAll('input[type="radio"]')];
  const list = scope.filter((r) => r instanceof HTMLInputElement && r.type === 'radio' && r.name === el.name
    && r.form === el.form && !hostOf(r, root));
  if (!list.includes(el)) list.push(el);
  return sortByDocument(list);
}

const isGroupedRadio = (el) => el instanceof HTMLInputElement && el.type === 'radio' && !!el.name;

/**
 * Radio group representative: the first member that takes part in validation (`willValidate`: a disabled first
 * radio must not hide an invalid enabled group); falls back to the first member.
 */
function representative(el, root) {
  if (!isGroupedRadio(el)) return el;
  const members = radioMembers(el, root);
  return members.find((r) => r.willValidate) || members[0] || el;
}

/** Members that take part in validation (they get the error ARIA); all members if none does; never empty. */
function radioGroup(el, root) {
  if (!isGroupedRadio(el)) return [el];
  const members = radioMembers(el, root);
  const eligible = members.filter((r) => r.willValidate);
  return eligible.length ? eligible : members;
}

/**
 * Normalise any element to the control that owns validation (D17): an inner native of a td host → the host; a
 * native control → itself (radio → group representative); a wrapper → its first descendant host or native control.
 * @returns {HTMLElement|null}
 */
function normalise(el, root) {
  if (!(el instanceof HTMLElement)) return null;
  const host = hostOf(el, root);
  if (host) return host;
  if (isNativeControl(el)) return representative(el, root);
  for (const d of el.querySelectorAll('*')) {
    if (isHost(d)) return d;
    if (isNativeControl(d) && !hostOf(d, el)) return representative(d, root);
  }
  return null;
}

/** The control an event target belongs to (host of an inner native, or the native itself); never a wrapper. */
function ownerOf(target, root) {
  if (!(target instanceof HTMLElement) || !root.contains(target)) return null;
  const host = hostOf(target, root);
  if (host) return host;
  return isNativeControl(target) ? representative(target, root) : null;
}

/** Controls validate() looks at, in document order, deduplicated (radio groups once). */
function collectControls(root) {
  const candidates = root instanceof HTMLFormElement ? [...root.elements] : [...root.querySelectorAll('*')];
  const out = new Set();
  for (const el of candidates) {
    if (isHost(el)) {
      if (el.willValidate) out.add(el);
    } else if (isNativeControl(el) && !hostOf(el, root) && el.willValidate) {
      out.add(representative(el, root));
    }
  }
  return sortByDocument([...out]);
}

function sortByDocument(list, key = (x) => x) {
  return list.sort((a, b) => {
    const pos = key(a).compareDocumentPosition(key(b));
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function controlName(el) {
  return el.getAttribute('name') || (typeof el.name === 'string' ? el.name : '') || '';
}

/** The value a custom rule receives. */
function valueOf(el, root) {
  if (typeof el.getValue === 'function') return el.getValue();
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') {
      const on = radioGroup(el, root).find((r) => r.checked);
      return on ? on.value : '';
    }
  }
  if (el instanceof HTMLSelectElement && el.multiple) return [...el.selectedOptions].map((o) => o.value);
  if (!isNativeControl(el) && 'checked' in el) return !!el.checked;
  return el.value ?? '';
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Accessible-ish label text for the summary ('' when none resolvable). */
function labelOf(el) {
  if (isHost(el)) {
    const own = clean(el.getAttribute('label'));
    if (own) return own;
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const labels = el.labels ? [...el.labels] : [];
  if (labels.length) return clean(labels[0].textContent);
  const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  const doc = el.ownerDocument;
  const text = by.map((id) => doc.getElementById(id)).filter(Boolean).map((n) => n.textContent).join(' ');
  return clean(text);
}

function state(root) {
  let s = STATES.get(root);
  if (!s) {
    s = {
      shown: new Map(),   // control → { source: 'client'|'server', note?, errId?, targets? }
      custom: new Set(),  // controls whose custom validity WE set
      summary: null,      // { el, items: Map<control, li>, list }
    };
    STATES.set(root, s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------

export class TdFormValidation {
  /** Site-overridable UI strings (Vietnamese defaults, D23). */
  static labels = {
    summaryTitle: 'Vui lòng kiểm tra lại các trường sau:',
  };

  /**
   * Messages for NATIVE controls (their own `validationMessage` is in the browser's language). Placeholders:
   * `{min}`, `{max}`, `{minLength}`, `{maxLength}`, `{step}`. `patternMismatch` uses the control's `title` when set.
   * td controls keep their own (Vietnamese) `validationMessage` unless a per-call `messages` override applies.
   */
  static messages = {
    ruleError: 'Không thể kiểm tra giá trị này',
    valueMissing: 'Trường này là bắt buộc',
    typeMismatch: 'Giá trị không hợp lệ',
    typeMismatchEmail: 'Email không hợp lệ',
    typeMismatchUrl: 'URL không hợp lệ',
    badInput: 'Giá trị không hợp lệ',
    patternMismatch: 'Giá trị không đúng định dạng',
    tooShort: 'Tối thiểu {minLength} ký tự',
    tooLong: 'Tối đa {maxLength} ký tự',
    rangeUnderflow: 'Giá trị tối thiểu là {min}',
    rangeOverflow: 'Giá trị tối đa là {max}',
    stepMismatch: 'Giá trị không đúng bước nhảy',
  };

  /**
   * Client validation: run the custom `rules` (setCustomValidity), read constraint validity, show the errors.
   * Replaces whatever a previous validate()/apply() showed on this root.
   * @param {HTMLElement} root - a `<form>` or any container (e.g. a modal body)
   * @param {Object} [opts]
   * @param {Object<string, (value: *, control: HTMLElement, root: HTMLElement) => string>} [opts.rules]
   * @param {Object<string, string|Object<string,string>>} [opts.messages] - per field name: one message for every
   *   constraint failure, or `{ valueMissing: '…', … }`
   * @param {boolean|'auto'} [opts.summary='auto']
   * @param {HTMLElement|null} [opts.summaryTarget=null]
   * @param {boolean} [opts.focus=true]
   * @returns {{ valid: boolean, errors: Array<{ element: HTMLElement, name: string, message: string }>,
   *   invalid: Array<{ element: HTMLElement, name: string, message: string }> }} (`invalid` = alias of `errors`)
   */
  static validate(root, opts = {}) {
    const o = opts || {};
    if (!(root instanceof HTMLElement)) return { valid: true, errors: [], invalid: [] };
    const st = state(root);
    TdFormValidation._clearShown(root, st);
    TdFormValidation._resetCustom(st);
    const errors = [];
    for (const el of collectControls(root)) {
      TdFormValidation._runRule(el, root, o.rules, st);
      if (el.validity && !el.validity.valid) {
        errors.push({ element: el, name: controlName(el), message: TdFormValidation._messageFor(el, o.messages) });
      }
    }
    for (const e of errors) TdFormValidation._show(root, st, e.element, e.message, 'client');
    TdFormValidation._renderSummary(root, st, errors.map((e) => ({ element: e.element, message: e.message })), [], o);
    if (errors.length && o.focus !== false) TdFormValidation._focus(errors[0].element);
    return { valid: errors.length === 0, errors, invalid: errors };
  }

  /**
   * Server errors (Laravel map) → fields. Never changes constraint validity. Replaces what a previous
   * validate()/apply() showed on this root (field errors + summary).
   * @param {HTMLElement} root
   * @param {Object<string, string|string[]>} serverErrors
   * @param {Object} [opts]
   * @param {Object<string, string|HTMLElement>} [opts.fieldMap] - key → element id (resolved INSIDE root) or Element
   * @param {boolean|'auto'} [opts.summary='auto']
   * @param {HTMLElement|null} [opts.summaryTarget=null]
   * @param {boolean} [opts.focus=true]
   * @returns {{ applied: Array<{ field: string, element: HTMLElement, message: string }>,
   *   unmapped: Array<{ field: string, message: string }>, unmatched: Array<{ field: string, message: string }> }}
   */
  static apply(root, serverErrors, opts = {}) {
    const o = opts || {};
    const applied = [];
    const unmapped = [];
    if (!(root instanceof HTMLElement)) return { applied, unmapped, unmatched: unmapped };
    const st = state(root);
    TdFormValidation._clearShown(root, st);
    const seen = new Set();
    const map = serverErrors && typeof serverErrors === 'object' ? serverErrors : {};
    for (const field of Object.keys(map)) {
      const message = firstMessage(map[field]);
      if (!message) continue;
      let el = null;
      try {
        el = TdFormValidation._resolve(root, field, o.fieldMap);
      } catch {
        el = null; // a hostile key never throws out of apply()
      }
      if (!el) { unmapped.push({ field, message }); continue; }
      if (seen.has(el)) continue; // first message per control wins
      seen.add(el);
      applied.push({ field, element: el, message });
    }
    sortByDocument(applied, (a) => a.element);
    for (const a of applied) TdFormValidation._show(root, st, a.element, a.message, 'server');
    TdFormValidation._renderSummary(root, st, applied, unmapped, o);
    if (applied.length && o.focus !== false) TdFormValidation._focus(applied[0].element);
    return { applied, unmapped, unmatched: unmapped };
  }

  /**
   * Remove everything this helper set on the root: field errors, notes, the summary and the custom validity it
   * pushed for `rules`.
   * @param {HTMLElement} root
   */
  static clear(root) {
    const st = STATES.get(root);
    if (!st) return;
    TdFormValidation._clearShown(root, st);
    TdFormValidation._resetCustom(st);
  }

  /**
   * Wire a `<form>`: sets `novalidate` (td's inline messages are the single presentation), validates on submit
   * (invalid → `preventDefault`), and after the FIRST failed submit revalidates the edited control live
   * (`input` clears once valid / updates a shown message; `change`/`focusout` show the current error). A server
   * error on a control is dropped at the user's first edit of it. `onValid(event, form)` given → the submit is
   * always prevented and `onValid` is called (SPA/modal; a throwing `onValid` is caught and logged with
   * console.error); otherwise a valid form submits natively. A form `reset` clears everything shown (like clear())
   * and turns live revalidation off again until the next failed submit.
   * @param {HTMLFormElement} form
   * @param {Object} [opts] - validate() options + `live` (default true) + `onValid`
   * @returns {() => void} detach (restores `novalidate`; leaves shown errors in place — call clear() for those)
   */
  static attach(form, opts = {}) {
    if (!(form instanceof HTMLFormElement)) throw new TypeError('TdFormValidation.attach: a <form> is required');
    const o = opts || {};
    const hadNoValidate = form.hasAttribute('novalidate');
    form.noValidate = true;
    let failed = false;

    const onSubmit = (e) => {
      let r;
      try {
        r = TdFormValidation.validate(form, o);
      } catch (err) {
        e.preventDefault(); // fail closed: a validation crash never lets a `novalidate` form submit
        failed = true;
        console.error('TdFormValidation: validation failed', err);
        return;
      }
      if (!r.valid) {
        e.preventDefault();
        failed = true;
        return;
      }
      if (typeof o.onValid === 'function') {
        e.preventDefault();
        try {
          o.onValid(e, form);
        } catch (err) {
          console.error('TdFormValidation: onValid threw', err);
        }
      }
    };
    const onReset = () => {
      failed = false;
      TdFormValidation.clear(form);
    };
    const onEdit = (e) => {
      const el = ownerOf(e.target, form);
      if (!el) return;
      const st = state(form);
      const shown = st.shown.get(el);
      const isEdit = e.type === 'input' || e.type === 'change';
      if (shown && shown.source === 'server' && isEdit) TdFormValidation._hide(form, st, el);
      if (!failed || o.live === false || !el.validity) return;
      TdFormValidation._runRule(el, form, o.rules, st);
      const current = st.shown.get(el);
      if (el.validity.valid) {
        if (current && current.source === 'client') TdFormValidation._hide(form, st, el);
        return;
      }
      // "Reward early, punish late": typing never CREATES an error; it only updates one already shown.
      if (e.type === 'input' && !(current && current.source === 'client')) return;
      if (current && current.source === 'server') return;
      TdFormValidation._show(form, st, el, TdFormValidation._messageFor(el, o.messages), 'client');
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('focusout', onEdit);
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onEdit);
      form.removeEventListener('change', onEdit);
      form.removeEventListener('focusout', onEdit);
      form.removeEventListener('reset', onReset);
      form.noValidate = hadNoValidate;
    };
  }

  // --- internals ------------------------------------------------------------------------------------------

  /** @private Re-run one control's custom rule (reset first, so a fixed value clears the custom error). */
  static _runRule(el, root, rules, st) {
    const name = controlName(el);
    const rule = rules && name && Object.prototype.hasOwnProperty.call(rules, name) ? rules[name] : null;
    if (typeof rule !== 'function' || typeof el.setCustomValidity !== 'function') return;
    // Run the rule FIRST; custom validity only changes once it has a result. A throwing rule FAILS CLOSED (security
    // review v0.12.0: crafted input that makes a rule throw must not bypass it) with a generic message.
    let msg = '';
    let threw = false;
    try {
      msg = rule(valueOf(el, root), el, root);
    } catch (err) {
      threw = true;
      console.warn(`TdFormValidation: rule "${name}" threw — the field is treated as invalid`, err);
    }
    if (threw) {
      // The validity mechanism never depends on (mutable, site-overridable) presentation text: an empty / missing
      // `ruleError`, or `messages = null`, still leaves the field invalid.
      const m = TdFormValidation.messages;
      msg = String((m && typeof m === 'object' && m.ruleError) || RULE_ERROR_FALLBACK);
    }
    el.setCustomValidity(msg ? String(msg) : '');
    if (msg) st.custom.add(el);
    else st.custom.delete(el);
  }

  /** @private */
  static _resetCustom(st) {
    for (const el of st.custom) {
      if (typeof el.setCustomValidity === 'function') el.setCustomValidity('');
    }
    st.custom.clear();
  }

  /** @private One message for an invalid control. */
  static _messageFor(el, perCall) {
    const v = el.validity;
    const flag = FLAGS.find((f) => v[f]) || 'customError';
    const M = TdFormValidation.messages && typeof TdFormValidation.messages === 'object' ? TdFormValidation.messages : {};
    const generic = M.badInput || el.validationMessage || RULE_ERROR_FALLBACK;
    if (flag === 'customError') return el.validationMessage || generic;
    const name = controlName(el);
    const over = perCall && name && Object.prototype.hasOwnProperty.call(perCall, name) ? perCall[name] : null;
    if (typeof over === 'string' && over) return over;
    if (over && typeof over === 'object' && typeof over[flag] === 'string' && over[flag]) return over[flag];
    if (isHost(el)) return el.validationMessage || M[flag] || generic;
    let tpl = M[flag];
    if (flag === 'typeMismatch' && el.type === 'email' && M.typeMismatchEmail) tpl = M.typeMismatchEmail;
    if (flag === 'typeMismatch' && el.type === 'url' && M.typeMismatchUrl) tpl = M.typeMismatchUrl;
    if (flag === 'patternMismatch' && el.title) tpl = el.title;
    if (!tpl) return el.validationMessage || generic;
    return formatMessage(tpl, {
      min: el.getAttribute('min'), max: el.getAttribute('max'), step: el.getAttribute('step'),
      minLength: el.getAttribute('minlength'), maxLength: el.getAttribute('maxlength'),
    });
  }

  /** @private Server key → the real control inside root (D17 + normalisation), or null. */
  static _resolve(root, key, fieldMap) {
    let found = null;
    const mapped = fieldMap && Object.prototype.hasOwnProperty.call(fieldMap, key) ? fieldMap[key] : null;
    if (mapped instanceof Element) {
      if (root.contains(mapped)) found = mapped;
    } else if (typeof mapped === 'string' && mapped) {
      found = root.querySelector(`#${CSS.escape(mapped)}`);
    }
    if (!found) {
      for (const name of nameCandidates(key)) {
        if (root instanceof HTMLFormElement) {
          const item = root.elements.namedItem(name);
          const el = item instanceof RadioNodeList ? item[0] : item;
          if (el instanceof HTMLElement && root.contains(el)) { found = el; break; }
        }
        const el = root.querySelector(`[name="${CSS.escape(name)}"]`);
        if (el) { found = el; break; }
      }
    }
    if (!found) found = root.querySelector(`[data-field="${CSS.escape(String(key))}"]`);
    return found ? normalise(found, root) : null;
  }

  /** @private Show one error on one control (dispatch per D18). */
  static _show(root, st, el, message, source) {
    const prev = st.shown.get(el);
    if ((el instanceof TdFormElement && el.constructor.errorContract)
      || (!(el instanceof TdFormElement) && typeof el.setError === 'function')) {
      el.setError(message);
      st.shown.set(el, { source });
      TdFormValidation._syncSummary(root, st, el, message);
      return;
    }
    // Native fallback (also a TdFormElement without the error contract: note after the host, aria on the host).
    let rec = prev && prev.note ? prev : null;
    if (!rec) {
      if (!el.id) el.id = `td-fv-${++_idCounter}`;
      const errId = `${el.id}-error`;
      const note = document.createElement('span');
      note.className = 'td-field-error';
      note.id = errId;
      note.setAttribute('data-for', el.id);
      note.setAttribute('data-td-fv', '');
      const group = radioGroup(el, root);
      const last = group[group.length - 1];
      const label = last.parentElement && last.parentElement.closest('label');
      const anchor = label && label.contains(last) && !label.contains(root) ? label : last;
      anchor.after(note);
      // page-owned ARIA is restored on _hide() (review ISSUE-11); only our id is ever removed from describedby
      const saved = new Map(group.map((t) => [t, {
        invalid: t.getAttribute('aria-invalid'), errormessage: t.getAttribute('aria-errormessage'),
      }]));
      rec = { note, errId, targets: group, saved };
    }
    rec.source = source;
    rec.note.textContent = message;
    for (const t of rec.targets) {
      t.setAttribute('aria-invalid', 'true');
      t.setAttribute('aria-errormessage', rec.errId);
      const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(rec.errId)) ids.push(rec.errId);
      t.setAttribute('aria-describedby', ids.join(' '));
    }
    st.shown.set(el, rec);
    TdFormValidation._syncSummary(root, st, el, message);
  }

  /**
   * @private Keep an ACTIVE summary in step with a (re)shown field error (review ISSUE-7): update the entry's text, or
   * insert a reappearing field in document order (unmapped server messages stay last). No summary → nothing.
   */
  static _syncSummary(root, st, el, message) {
    const sum = st.summary;
    if (!sum) return;
    const existing = sum.items.get(el);
    if (existing) {
      const btn = existing.querySelector('.td-form-summary__link');
      if (btn) btn.textContent = TdFormValidation._summaryText(el, message);
      return;
    }
    const li = TdFormValidation._summaryItem(root.ownerDocument, el, message);
    let before = null;
    for (const [other, otherLi] of sum.items) {
      if (el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING
        && (!before || otherLi.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING)) before = otherLi;
    }
    if (!before) before = [...sum.list.children].find((c) => ![...sum.items.values()].includes(c)) || null;
    sum.list.insertBefore(li, before);
    sum.items.set(el, li);
  }

  /** @private */
  static _summaryText(el, message) {
    const label = labelOf(el);
    return label ? `${label}: ${message}` : message;
  }

  /** @private one summary entry: a button that focuses the field (text only) */
  static _summaryItem(doc, element, message) {
    const li = doc.createElement('li');
    li.className = 'td-form-summary__item';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'td-form-summary__link';
    btn.textContent = TdFormValidation._summaryText(element, message);
    btn.addEventListener('click', () => TdFormValidation._focus(element));
    li.appendChild(btn);
    return li;
  }

  /** @private Undo _show() for one control + drop its summary item. */
  static _hide(root, st, el) {
    const rec = st.shown.get(el);
    if (!rec) return;
    st.shown.delete(el);
    if (rec.note) {
      rec.note.remove();
      const restore = (t, attr, v) => { if (v == null) t.removeAttribute(attr); else t.setAttribute(attr, v); };
      for (const t of rec.targets) {
        const was = rec.saved && rec.saved.get(t);
        restore(t, 'aria-invalid', was ? was.invalid : null);
        if (t.getAttribute('aria-errormessage') === rec.errId) restore(t, 'aria-errormessage', was ? was.errormessage : null);
        const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== rec.errId);
        if (ids.length) t.setAttribute('aria-describedby', ids.join(' '));
        else t.removeAttribute('aria-describedby');
      }
    } else if (typeof el.clearError === 'function') {
      el.clearError();
    } else if (typeof el.setError === 'function') {
      el.setError('');
    }
    const sum = st.summary;
    if (sum && sum.items.has(el)) {
      sum.items.get(el).remove();
      sum.items.delete(el);
      if (!sum.list.children.length) TdFormValidation._removeSummary(st);
    }
  }

  /** @private */
  static _clearShown(root, st) {
    for (const el of [...st.shown.keys()]) TdFormValidation._hide(root, st, el);
    TdFormValidation._removeSummary(st);
  }

  /** @private */
  static _removeSummary(st) {
    if (st.summary) st.summary.el.remove();
    st.summary = null;
  }

  /** @private Build the summary region (text only; a fresh node each time so role=alert announces). */
  static _renderSummary(root, st, fieldErrors, unmapped, o) {
    TdFormValidation._removeSummary(st);
    const mode = o.summary === undefined ? 'auto' : o.summary;
    const total = fieldErrors.length + unmapped.length;
    if (!total || mode === false) return;
    if (mode !== true && total < 2 && !unmapped.length) return;
    const doc = root.ownerDocument;
    const box = doc.createElement('div');
    box.className = 'td-form-summary';
    box.setAttribute('role', 'alert');
    box.setAttribute('data-td-fv', '');
    const title = doc.createElement('p');
    title.className = 'td-form-summary__title';
    title.textContent = TdFormValidation.labels.summaryTitle || '';
    const list = doc.createElement('ul');
    list.className = 'td-form-summary__list';
    const items = new Map();
    for (const { element, message } of fieldErrors) {
      const li = TdFormValidation._summaryItem(doc, element, message);
      list.appendChild(li);
      items.set(element, li);
    }
    for (const { message } of unmapped) {
      const li = doc.createElement('li');
      li.className = 'td-form-summary__item';
      li.textContent = message;
      list.appendChild(li);
    }
    box.append(title, list);
    const target = o.summaryTarget instanceof HTMLElement ? o.summaryTarget : null;
    if (target) target.appendChild(box);
    else root.prepend(box);
    st.summary = { el: box, items, list };
  }

  /** @private focus() only: it scrolls the control into view without extra (smooth) motion. */
  static _focus(el) {
    if (el && typeof el.focus === 'function') el.focus();
  }
}
