import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Length in CODE POINTS (an emoji counts once — matches PHP `mb_strlen`). */
const charLength = (s) => Array.from(s).length;

/** Checklist rules, in display order. ASCII classes on purpose: they mirror the usual server policies (dwp, 135). */
const RULES = {
  length: (s, min) => charLength(s) >= min,
  lower: (s) => /[a-z]/.test(s),
  upper: (s) => /[A-Z]/.test(s),
  number: (s) => /[0-9]/.test(s),
  symbol: (s) => /[^A-Za-z0-9]/.test(s),
};
const RULE_KEYS = Object.keys(RULES);

/**
 * Small embedded list of the most common passwords (global top list + Vietnamese favourites). Matching is local:
 * nothing is sent anywhere. Compared lower-cased, after undoing simple leet substitutions and trailing digits/symbols.
 */
const COMMON = new Set([
  'password', 'passw0rd', 'pass', 'pass123', 'admin', 'administrator', 'root', 'toor', 'user', 'guest', 'login',
  'welcome', 'letmein', 'changeme', 'secret', 'default', 'test', 'demo', 'qwerty', 'qwertyuiop', 'asdfgh',
  'asdfghjkl', 'zxcvbnm', 'qazwsx', 'qwe', 'abc', 'abcd', 'abcdef', 'iloveyou', 'monkey', 'dragon', 'master',
  'football', 'baseball', 'soccer', 'sunshine', 'princess', 'shadow', 'superman', 'batman', 'trustno', 'hello',
  'freedom', 'whatever', 'starwars', 'pokemon', 'michael', 'jennifer', 'computer', 'internet', 'google', 'facebook',
  'matkhau', 'anhyeuem', 'emyeuanh', 'yeuem', 'iloveu', 'vietnam', 'hanoi', 'saigon', 'hochiminh', 'conmeo',
  '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321', '666666',
  '888888', '987654321', '121212', '112233', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'abc123', 'abcd1234', 'a1b2c3',
]);
const LEET = { '@': 'a', 4: 'a', 0: 'o', 1: 'i', '!': 'i', 3: 'e', $: 's', 5: 's', 7: 't', '+': 't', 8: 'b', 9: 'g' };
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

/** @returns {0|1|2} 2 = the password IS a common one, 1 = a common one + trailing digits/symbols, 0 = neither. */
function commonness(value) {
  const lower = value.toLowerCase();
  const unleet = lower.replace(/[@4013!$578+9]/g, (c) => LEET[c] ?? c);
  const unleetL = lower.replace(/[@4013!$578+9]/g, (c) => (c === '1' ? 'l' : LEET[c] ?? c));
  if (COMMON.has(lower) || COMMON.has(unleet) || COMMON.has(unleetL)) return 2;
  for (const v of [lower, unleet]) {
    const base = v.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
    if (base.length >= 3 && base !== v && COMMON.has(base)) return 1;
  }
  return 0;
}

/** Three or more consecutive steps of an alphabet/digit run (abc, 321) or four keys of a keyboard row (qwer). */
function hasSequence(value) {
  const s = value.toLowerCase();
  for (let i = 0; i + 2 < s.length; i++) {
    const a = s.charCodeAt(i); const b = s.charCodeAt(i + 1); const c = s.charCodeAt(i + 2);
    const d = b - a;
    if ((d === 1 || d === -1) && c - b === d && /[a-z0-9]/.test(s[i]) && /[a-z0-9]/.test(s[i + 2])) return true;
  }
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const part = row.slice(i, i + 4);
      if (s.includes(part) || s.includes([...part].reverse().join(''))) return true;
    }
  }
  return false;
}

let seq = 0;

/**
 * `<td-password-meter>` — local password-strength meter: a 4-segment bar, a spoken strength label and an optional
 * checklist (length, lower/upper case, digit, symbol). Nothing leaves the page: no request, no event carries the
 * password, the live region only ever says the LEVEL. Styles: td.css (`components/password-meter.css`).
 *
 *   <td-input-field id="pw" type="password" name="password" autocomplete="new-password" label="Mật khẩu"></td-input-field>
 *   <td-password-meter for="pw" checklist></td-password-meter>
 *
 *   <td-password-meter checklist="length upper number"><input type="password" name="password"></td-password-meter>
 *
 * Source: the element whose id is `for` (a native `<input>`/`<textarea>` or a `<td-input-field>`), else the first
 * `td-input-field, input, textarea` INSIDE the meter (wrapped markup is kept; the meter box is appended after it).
 * Updates on the source's `input`/`change` (delegated on `document`, so the source may be added later), on form
 * reset, and on `refresh()` (call it after setting the value from JS — that fires no event).
 *
 * Markup (appended to the host):
 *   <div class="td-password-meter" data-level="empty|weak|fair|strong" data-score="0-4|" data-lit="0-4">
 *     <div class="td-password-meter__bar" aria-hidden="true"><span class="td-password-meter__seg"></span>×4</div>
 *     <p class="td-password-meter__status" id="td-password-meter-N-status" aria-live="polite">Độ mạnh mật khẩu: Yếu</p>
 *     <ul class="td-password-meter__checklist" [hidden]>
 *       <li class="td-password-meter__rule" data-rule="length" data-met="true|false">
 *         <span class="td-password-meter__mark" aria-hidden="true"><svg class="td-icon …" data-icon="check"></span>
 *         <span class="td-password-meter__text">Tối thiểu 8 ký tự</span><span class="td-sr-only">: đạt</span></li>…
 *   </div>
 * The status id is added to the control's `aria-describedby` (removed again on disconnect).
 *
 * @element td-password-meter
 * @attr {string} for - id of the password control (`<input>`, `<textarea>` or `<td-input-field>`)
 * @attr {number} min-length - Minimum length for the checklist and the built-in score (default: the control's
 *   `minlength`, else 8; clamped 1–128)
 * @attr {string} checklist - Show the checklist: empty / `all` = every rule, or a token list of
 *   `length lower upper number symbol`
 * @fires strength-change - When the level changes: detail `{ score: 0-4, label }` (never the password)
 *
 * Property `score` (hook): `(value, { minLength, estimate }) => 0..4` (or a Promise of it) replaces the built-in
 * estimate (e.g. a site's zxcvbn). Throws / non-numbers → the built-in estimate + console.warn. `strength` (read-only)
 * = `{ score, label }`. Texts: `TdPasswordMeter.labels` (Vietnamese; apply on the next refresh).
 */
export class TdPasswordMeter extends TdBaseElement {
  /** Default texts; override per site: `TdPasswordMeter.labels.levels = ['Very weak', …]`. */
  static labels = {
    levels: ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'],
    status: 'Độ mạnh mật khẩu: {label}',
    length: 'Tối thiểu {n} ký tự',
    lower: 'Chữ thường (a–z)',
    upper: 'Chữ hoa (A–Z)',
    number: 'Chữ số (0–9)',
    symbol: 'Ký tự đặc biệt',
    met: 'đạt',
    unmet: 'chưa đạt',
  };

  static get observedAttributes() { return ['for', 'min-length', 'checklist']; }

  /**
   * The built-in estimate (0 = very weak … 4 = very strong): length steps (min-length, 12, 16, 20), character
   * variety (3 classes +1, 4 classes +1), minus runs of a repeated character / a sequence (abc, 321, qwer); capped
   * at 1 when shorter than `minLength`, with ≤ 3 distinct characters, or a common password + suffix; a common
   * password itself is 0; below 12 characters never 4.
   * @param {string} value
   * @param {{ minLength?: number }} [opts]
   * @returns {0|1|2|3|4}
   */
  static estimate(value, { minLength = 8 } = {}) {
    const s = String(value ?? '');
    if (!s) return 0;
    const common = commonness(s);
    if (common === 2) return 0;
    const len = charLength(s);
    const min = Math.max(1, Number(minLength) || 8);
    let score = len >= 20 ? 4 : len >= 16 ? 3 : len >= 12 ? 2 : len >= min ? 1 : 0;
    const variety = [RULES.lower, RULES.upper, RULES.number, RULES.symbol].filter((t) => t(s)).length;
    if (variety >= 3) score++;
    if (variety === 4) score++;
    if (/(.)\1\1/u.test(s)) score--;
    if (hasSequence(s)) score--;
    score = Math.max(0, Math.min(4, score));
    if (len < min || new Set(Array.from(s)).size <= 3 || common === 1) score = Math.min(score, 1);
    if (len < 12) score = Math.min(score, 3);
    return /** @type {0|1|2|3|4} */ (score);
  }

  constructor() {
    super();
    this._uid = ++seq;
    /** @private score hook */
    this._scoreHook = null;
    /** @private refresh generation (drops stale async hook results) */
    this._gen = 0;
    /** @private last applied strength */
    this._strength = { score: 0, label: '' };
  }

  /** @type {((value: string, ctx: { minLength: number, estimate: Function }) => number|Promise<number>)|null} */
  get score() { return this._scoreHook; }
  set score(fn) {
    this._scoreHook = typeof fn === 'function' ? fn : null;
    if (this._initialized && this.isConnected) this.refresh();
  }

  /** @type {{ score: number, label: string }} the current level (never the password) */
  get strength() { return { ...this._strength }; }

  connectedCallback() {
    // A hook assigned before the element upgraded lives in an own data property that shadows the accessor.
    if (Object.prototype.hasOwnProperty.call(this, 'score')) {
      const fn = this.score;
      delete this.score;
      this._scoreHook = typeof fn === 'function' ? fn : null;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._bound = false;
    this._unlinkControl();
  }

  /** @private No innerHTML: wrapped markup (the password input) must survive. Builds/binds once per connection. */
  _doRender() {
    if (this._suppressRender) return;
    this._build();
    if (!this._bound) {
      this._bound = true;
      const onEdit = (e) => { if (this._fromSource(e.target)) this.refresh(); };
      this.listen(document, 'input', onEdit);
      this.listen(document, 'change', onEdit);
      // Form reset changes the value without an input event; the new value exists after the reset task.
      this.listen(document, 'reset', (e) => {
        const src = this._source();
        if (src && e.target instanceof Element && e.target.contains(src)) this.setTimeout(() => this.refresh(), 0);
      });
      if (document.readyState === 'loading') {
        // Wrapped markup still parsing (or a `for` target further down): place the box + read the value again.
        this.listen(document, 'DOMContentLoaded', () => this.refresh());
      }
    }
    this.refresh();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this.isConnected) return;
    if (name === 'for') this._unlinkControl();
    this.refresh();
  }

  /** Recompute from the source's current value (call after setting the value from JS). */
  refresh() {
    if (!this._box) return;
    this._build();
    const value = this._readValue();
    const min = this._minLength();
    for (const li of this._list.children) {
      const rule = li.getAttribute('data-rule');
      const met = !!value && RULES[rule](value, min);
      if (li.getAttribute('data-met') !== String(met)) {
        li.setAttribute('data-met', String(met));
        const sr = li.querySelector('.td-sr-only');
        if (sr) sr.textContent = `: ${met ? TdPasswordMeter.labels.met : TdPasswordMeter.labels.unmet}`;
      }
    }
    this._linkControl();
    const gen = ++this._gen;
    if (!value) { this._apply(null); return; }
    const builtin = () => TdPasswordMeter.estimate(value, { minLength: min });
    const hook = this._scoreHook;
    if (!hook) { this._apply(builtin()); return; }
    let out;
    try {
      out = hook(value, { minLength: min, estimate: TdPasswordMeter.estimate });
    } catch {
      console.warn('td-password-meter: score() threw — using the built-in estimate');
      this._apply(builtin());
      return;
    }
    if (out && typeof out.then === 'function') {
      Promise.resolve(out).then(
        (s) => { if (gen === this._gen) this._apply(this._normalise(s) ?? builtin()); },
        () => { if (gen === this._gen) { console.warn('td-password-meter: score() rejected — using the built-in estimate'); this._apply(builtin()); } },
      );
      return;
    }
    const n = this._normalise(out);
    if (n == null) console.warn('td-password-meter: score() must return 0..4 — using the built-in estimate');
    this._apply(n ?? builtin());
  }

  // --- private ---

  /** @private integer 0..4, or null */
  _normalise(s) {
    const n = typeof s === 'number' ? s : (typeof s === 'string' && s.trim() !== '' ? Number(s) : NaN);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(4, Math.round(n)));
  }

  /** @private The password source element (or null). */
  _source() {
    const id = this.getAttribute('for');
    if (id) {
      const root = this.getRootNode();
      const el = (root && typeof root.getElementById === 'function' ? root.getElementById(id) : null) || document.getElementById(id);
      // `for` may name the CONTROL id of a <td-input-field> (its `field-id`, e.g. PHP element mode, v0.26.0): the
      // field re-emits `input` from its host, so the host is the source (events + value).
      const host = el && typeof el.closest === 'function' ? el.closest('td-input-field') : null;
      return host || el;
    }
    return this.querySelector('td-input-field, input, textarea');
  }

  /** @private The focusable control of the source (inner `.td-field__control` of a td-input-field). */
  _control() {
    const src = this._source();
    if (!src) return null;
    if (src.matches('input, textarea')) return src;
    return src.querySelector('.td-field__control, input, textarea');
  }

  /** @private */
  _fromSource(target) {
    const src = this._source();
    return !!src && target instanceof Node && (target === src || src.contains(target));
  }

  /** @private */
  _readValue() {
    const src = this._source();
    if (!src) return '';
    const v = 'value' in src ? src.value : (this._control()?.value ?? '');
    return v == null ? '' : String(v);
  }

  /** @private attr → control `minlength` → 8, clamped 1..128 */
  _minLength() {
    let n = parseInt(this.getAttribute('min-length') ?? '', 10);
    if (!Number.isFinite(n) || n < 1) {
      const src = this._source();
      n = parseInt(src?.getAttribute('minlength') ?? src?.getAttribute('min-length') ?? '', 10);
    }
    if (!Number.isFinite(n) || n < 1) n = 8;
    return Math.min(128, n);
  }

  /** @private Rule keys to show (checklist attribute). */
  _rules() {
    if (!this.hasAttribute('checklist')) return [];
    const raw = (this.getAttribute('checklist') || '').trim().toLowerCase();
    if (raw === '' || raw === 'all' || raw === 'true') return RULE_KEYS;
    const want = new Set(raw.split(/[\s,]+/));
    return RULE_KEYS.filter((k) => want.has(k));
  }

  /** @private Create the box once; rebuild the checklist when its rules / min length / texts change. */
  _build() {
    if (!this._box) {
      const box = document.createElement('div');
      box.className = 'td-password-meter';
      box.setAttribute('data-level', 'empty');
      box.setAttribute('data-score', '');
      box.setAttribute('data-lit', '0');
      const bar = document.createElement('div');
      bar.className = 'td-password-meter__bar';
      bar.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 4; i++) {
        const seg = document.createElement('span');
        seg.className = 'td-password-meter__seg';
        bar.appendChild(seg);
      }
      const status = document.createElement('p');
      status.className = 'td-password-meter__status';
      status.id = `td-password-meter-${this._uid}-status`;
      status.setAttribute('aria-live', 'polite');
      const list = document.createElement('ul');
      list.className = 'td-password-meter__checklist';
      box.append(bar, status, list);
      this._box = box;
      this._status = status;
      this._list = list;
      this._listKey = null;
    }
    // Keep the box LAST (wrapped markup parsed after connect lands before it).
    if (this._box.parentNode !== this || this.lastElementChild !== this._box) this.appendChild(this._box);

    const L = TdPasswordMeter.labels;
    const rules = this._rules();
    const min = this._minLength();
    const texts = rules.map((k) => (k === 'length' ? format(L.length, { n: min }) : String(L[k] ?? '')));
    const key = JSON.stringify([rules, texts, L.met, L.unmet]);
    if (key === this._listKey) return;
    this._listKey = key;
    this._list.replaceChildren(...rules.map((k, i) => {
      const li = document.createElement('li');
      li.className = 'td-password-meter__rule';
      li.setAttribute('data-rule', k);
      li.setAttribute('data-met', 'false');
      const mark = document.createElement('span');
      mark.className = 'td-password-meter__mark';
      mark.setAttribute('aria-hidden', 'true');
      const icon = tdIcon('check', { size: 's' });
      if (icon) mark.appendChild(icon);
      const text = document.createElement('span');
      text.className = 'td-password-meter__text';
      text.textContent = texts[i];
      const sr = document.createElement('span');
      sr.className = 'td-sr-only';
      sr.textContent = `: ${L.unmet}`;
      li.append(mark, text, sr);
      return li;
    }));
    this._list.hidden = rules.length === 0;
  }

  /** @private Paint a level (null = empty value) and emit strength-change when it changed. */
  _apply(score) {
    const box = this._box;
    if (!box) return;
    const L = TdPasswordMeter.labels;
    const empty = score == null;
    const s = empty ? 0 : score;
    const label = empty ? '' : String((Array.isArray(L.levels) ? L.levels[s] : '') ?? '');
    const level = empty ? 'empty' : s <= 1 ? 'weak' : s === 2 ? 'fair' : 'strong';
    box.setAttribute('data-level', level);
    box.setAttribute('data-score', empty ? '' : String(s));
    box.setAttribute('data-lit', String(empty ? 0 : Math.max(1, s)));
    const text = empty ? '' : format(L.status, { label });
    if (this._status.textContent !== text) this._status.textContent = text;
    const prev = this._strength;
    if (prev.score !== s || prev.label !== label) {
      this._strength = { score: s, label };
      this.emit('strength-change', { score: s, label });
    }
  }

  /** @private Add the status id to the control's aria-describedby (re-checked on every refresh: controls re-render). */
  _linkControl() {
    const control = this._control();
    if (this._linked && this._linked !== control) this._unlinkControl();
    if (!control || !this._status) return;
    const id = this._status.id;
    const ids = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(id)) control.setAttribute('aria-describedby', [...ids, id].join(' '));
    this._linked = control;
  }

  /** @private */
  _unlinkControl() {
    const control = this._linked;
    this._linked = null;
    if (!control || !this._status) return;
    const ids = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== this._status.id);
    if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
    else control.removeAttribute('aria-describedby');
  }
}

if (!customElements.get('td-password-meter')) {
  customElements.define('td-password-meter', TdPasswordMeter);
}
