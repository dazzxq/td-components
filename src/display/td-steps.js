import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots, tdIcon } from '../icons/td-icon.js';
import {
  normalizeSteps, deriveStates, isClickable, summaryText, normalizeNavigation, STEPS_LABELS, MAX_STEPS,
} from '../utils/steps-model.js';
import { cleanHref } from '../utils/filter-chips-model.js';
import { sameChildren } from '../utils/ssr-tree.js';

const SSR_NAME = 'steps';
const SSR_SCHEMA = 1;

/** @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs] */
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** Text of a leaf (text children only), else null. */
function leafText(n) {
  for (const c of n.childNodes) if (c.nodeType !== 3) return null;
  return n.textContent;
}

/** Element children; null when another child is anything but whitespace text. */
function elementKids(n) {
  for (const c of n.childNodes) {
    if (c.nodeType === 1 || (c.nodeType === 3 && !/\S/.test(c.data))) continue;
    return null;
  }
  return [...n.children];
}

/**
 * Multi-step progress — v0.45.0 (plan v0.45.0-steps-timeline QĐ G1–G4, S1–S7, C1–C3). Token-native: td.css
 * (`components/steps.css`). Light DOM, built with DOM APIs (every step string is TEXT — no innerHTML). Display only:
 * no panels, no validation, never changes the step by itself (ADR 0004 — the app decides).
 *
 * Markup (= PHP `td_steps()`, SSR contract `steps@1`, hydrated IN PLACE):
 * `div.td-steps[role=group][aria-label]` (navigation="none") | `nav.td-steps[aria-label]` > `ol.td-steps__list[role=list]`
 * > `li.td-steps__item[data-key][data-state][data-disabled?]` > the step `span|a[href]|button[type=button].td-steps__step`
 * (`aria-current="step"` on the anchor only) > `span.td-steps__marker[aria-hidden]` (number, or the `check` / `error`
 * icon slot `span.td-steps__icon[data-td-icon]`) + `span.td-steps__label` + `span.td-sr-only` (", đã xong" / ", có lỗi" /
 * ", chưa tới"; empty on the current step) + `span.td-steps__desc` (when given); then `p.td-steps__summary[aria-hidden]`
 * (the compact line, shown < 480px of container width). No steps → the host is `hidden`.
 * PHP prints a clickable step without `href` as `span.td-steps__step[data-td-js-step]` (no dead control without JS);
 * the hydrate swaps exactly that node for the button.
 *
 * @element td-steps
 * @attr {string} current - key of the current step (default keys "1", "2"… = positions)
 * @attr {boolean} complete - every step done (no current step)
 * @attr {string} orientation - horizontal (default) | vertical
 * @attr {string} narrow - compact (default: markers + one summary line under 480px) | vertical
 * @attr {string} navigation - none (default) | back (done / error steps before the current one) | all
 * @attr {string} label - accessible name of the group (default "Tiến trình")
 * @property {Array<{key?, label, description?, state?, href?, disabled?}>} steps - read back normalised (copies)
 * @fires step-select - `{ key, index, step }` when a step BUTTON is activated (the app sets `current`; links navigate)
 */
export class TdSteps extends TdBaseElement {
  /** Site-overridable texts ({n} / {total} / {label} placeholders). */
  static labels = { ...STEPS_LABELS };

  static hydratable = true;

  static get observedAttributes() { return ['current', 'complete', 'orientation', 'narrow', 'navigation', 'label']; }
  static get booleanAttributes() { return ['complete']; }

  constructor() {
    super();
    /** @type {ReturnType<typeof normalizeSteps>['steps']} */
    this._steps = [];
    this._earlySteps = false;
    this._autoHidden = false;
    this._warned = new Set();
    this.addEventListener('click', (e) => this._onClick(e));
  }

  get steps() { return this._steps.map((s) => ({ ...s })); }
  set steps(v) {
    const r = normalizeSteps(v);
    if (r.dropped) this._warnOnce('td-steps: a step was dropped — every step needs a non-empty text `label`.');
    if (r.capped) this._warnOnce(`td-steps: too many steps — at most ${MAX_STEPS} are shown.`);
    if (r.renamed) this._warnOnce('td-steps: duplicate step key — renamed with a -2, -3 … suffix.');
    this._steps = r.steps;
    if (!this._initialized) {
      this._earlySteps = true;
      return;
    }
    this._doRender();
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._root) return;
    if (name === 'current' || name === 'complete') this._update();
    else if (name === 'navigation') {
      if (normalizeNavigation(oldVal) !== normalizeNavigation(newVal)) this._doRender();
    } else if (name === 'label') this._root.setAttribute('aria-label', this._groupLabel(TdSteps.labels));
  }

  // --- model ---

  _groupLabel(L) { return (this.getAttribute('label') || '').trim() || L.group || STEPS_LABELS.group; }
  _current() { return this.getAttribute('current'); }
  _derive() { return deriveStates(this._steps, this._current(), this.hasAttribute('complete')); }

  // --- build (DOM APIs only) ---

  /**
   * @private The whole tree for the current model: [wrapper]. `ssr` = the PHP variant (a clickable step without href
   * is `span[data-td-js-step]`); `marks` collects the icon slots for the SSR comparison.
   */
  _tree(L, ssr = false, marks = null) {
    const nav = normalizeNavigation(this.getAttribute('navigation'));
    const wrap = nav === 'none'
      ? el('div', 'td-steps', { role: 'group', 'aria-label': this._groupLabel(L) })
      : el('nav', 'td-steps', { 'aria-label': this._groupLabel(L) });
    const list = el('ol', 'td-steps__list', { role: 'list' });
    const d = this._derive();
    this._steps.forEach((s, i) => list.appendChild(this._item(s, i, d, L, ssr, marks)));
    wrap.appendChild(list);
    if (this._steps.length) {
      const p = el('p', 'td-steps__summary', { 'aria-hidden': 'true' });
      p.textContent = summaryText(d.anchor, this._steps.length, this.hasAttribute('complete'), L, this._steps[d.anchor]?.label);
      wrap.appendChild(p);
    }
    return [wrap];
  }

  /** @private One `li`. */
  _item(s, i, d, L, ssr, marks) {
    const li = el('li', 'td-steps__item', { 'data-key': s.key, 'data-state': d.states[i] });
    if (s.disabled) li.setAttribute('data-disabled', '');
    li.appendChild(this._stepEl(s, i, d, L, ssr, marks));
    return li;
  }

  /** @private The step element (span / a / button) with its marker, label, state text and description. */
  _stepEl(s, i, d, L, ssr, marks) {
    const state = d.states[i];
    const click = isClickable(state, i, d.anchor, this.hasAttribute('complete'), this.getAttribute('navigation'), s.disabled);
    let step;
    if (click && s.href) step = el('a', 'td-steps__step', { href: s.href });
    else if (click && ssr) step = el('span', 'td-steps__step', { 'data-td-js-step': '' });
    else if (click) step = el('button', 'td-steps__step', { type: 'button' });
    else step = el('span', 'td-steps__step');
    if (i === d.anchor) step.setAttribute('aria-current', 'step');
    step.append(this._marker(state, i, marks));
    const label = el('span', 'td-steps__label');
    label.textContent = s.label;
    const sr = el('span', 'td-sr-only');
    sr.textContent = state === 'current' ? '' : (L[state] ?? STEPS_LABELS[state]);
    step.append(label, sr);
    if (s.description) {
      const desc = el('span', 'td-steps__desc');
      desc.textContent = s.description;
      step.appendChild(desc);
    }
    return step;
  }

  /** @private Marker: ✓ (done), ! (error) icon slot, else the 1-based number. */
  _marker(state, i, marks) {
    const m = el('span', 'td-steps__marker', { 'aria-hidden': 'true' });
    if (state === 'done' || state === 'error') {
      const name = state === 'done' ? 'check' : 'error';
      const slot = el('span', 'td-steps__icon', { 'data-td-icon': name });
      marks?.set(slot, tdIcon(name)); // review ISSUE-1: the exact SVG fillIconSlots / PHP Td::icon() print
      m.appendChild(slot);
    } else {
      m.textContent = String(i + 1);
    }
    return m;
  }

  _doRender() {
    if (this._suppressRender) return;
    this.replaceChildren(...this._tree(TdSteps.labels));
    this._refs();
    this._reportStates();
    this._bindStep();
  }

  _refs() {
    this._root = this.querySelector(':scope > .td-steps');
    this._list = this._root?.querySelector(':scope > .td-steps__list') || null;
  }

  /** @private QĐ S2: one console.warn per render / update listing the precedence conflicts. */
  _reportStates() {
    const { warnings } = this._derive();
    if (warnings.length) console.warn(`td-steps: ${warnings.join(', ')} — see docs/components/steps.md (state precedence).`);
  }

  afterRender() {
    if (!this._list) return;
    fillIconSlots(this._list, '.td-steps__icon[data-td-icon]');
    this._syncEmpty();
  }

  /** @private No steps → host `hidden` (only a `hidden` this component set is ever removed). */
  _syncEmpty() {
    if (!this._steps.length) {
      if (!this.hidden) {
        this.hidden = true;
        this._autoHidden = true;
      }
    } else if (this._autoHidden) {
      this.hidden = false;
      this._autoHidden = false;
    }
  }

  /**
   * @private QĐ S7 — `current` / `complete` changed: update only the affected items (state, aria-current, marker, state
   * text, step tag when its clickability changed) + the summary. A focused step that stops being clickable hands focus
   * to its replacement (tabindex -1), never to `body`.
   */
  _update() {
    if (!this._list) return;
    const L = TdSteps.labels;
    const d = this._derive();
    const lis = [...this._list.children];
    this._steps.forEach((s, i) => {
      const li = lis[i];
      if (!li) return;
      const old = li.firstElementChild;
      const fresh = this._stepEl(s, i, d, L, false, null);
      li.setAttribute('data-state', d.states[i]);
      if (old && old.localName === fresh.localName && old.getAttribute('href') === fresh.getAttribute('href')) {
        // same element: marker + state text only (label / description nodes kept)
        if (fresh.hasAttribute('aria-current')) old.setAttribute('aria-current', 'step');
        else old.removeAttribute('aria-current');
        old.querySelector(':scope > .td-steps__marker')?.replaceWith(fresh.querySelector(':scope > .td-steps__marker'));
        const sr = old.querySelector(':scope > .td-sr-only');
        const text = fresh.querySelector(':scope > .td-sr-only').textContent;
        if (sr && sr.textContent !== text) sr.textContent = text;
        return;
      }
      const hadFocus = old && old === document.activeElement;
      if (old) old.replaceWith(fresh);
      else li.appendChild(fresh);
      if (hadFocus) {
        if (fresh.localName === 'span') {
          fresh.setAttribute('tabindex', '-1');
          fresh.addEventListener('blur', () => fresh.removeAttribute('tabindex'), { once: true });
        }
        fresh.focus();
      }
    });
    const sum = this._root.querySelector(':scope > .td-steps__summary');
    if (sum) sum.textContent = summaryText(d.anchor, this._steps.length, this.hasAttribute('complete'), L, this._steps[d.anchor]?.label);
    this._reportStates();
    fillIconSlots(this._list, '.td-steps__icon[data-td-icon]');
  }

  _onClick(e) {
    const t = e.target instanceof Element ? e.target.closest('button.td-steps__step') : null;
    if (!t || !this._list || !this._list.contains(t)) return;
    const index = [...this._list.children].indexOf(t.closest('li'));
    const step = this._steps[index];
    if (!step) return;
    this.emit('step-select', { key: step.key, index, step: { ...step } });
  }

  // --- SSR (ADR 0012, contract steps@1, plan QĐ G3) ---

  /**
   * Marker `steps@1` + the markup EXACTLY as `td_steps()` prints it (for the host attributes it carries) → adopted in
   * place. Steps assigned early win. Any mismatch → not adopted: rendered from early steps, else EMPTY + one warning.
   */
  canHydrate() {
    if (!this._ssrMatches(SSR_NAME, SSR_SCHEMA)) return false;
    if (this.hasAttribute('hidden')) this._autoHidden = true;
    if (this._earlySteps) return false;
    const steps = this._readMarkup();
    if (steps) {
      this._steps = steps;
      for (const L of new Set([TdSteps.labels, STEPS_LABELS])) {
        const marks = new WeakMap();
        if (sameChildren(this.childNodes, this._tree(L, true, marks), { iconSlot: marks })) return true;
      }
    }
    this._steps = [];
    this._warnOnce('td-steps: server markup does not match steps@1 — not adopted (rendered empty).');
    return false;
  }

  hydrateExisting() {
    this._refs();
    // QĐ G3: the no-JS placeholder of a clickable step without href becomes the button (one node swapped, li kept)
    for (const span of this._list.querySelectorAll(':scope > li > span.td-steps__step[data-td-js-step]')) {
      const b = el('button', 'td-steps__step', { type: 'button' });
      if (span.hasAttribute('aria-current')) b.setAttribute('aria-current', 'step');
      b.append(...span.childNodes);
      span.replaceWith(b);
    }
  }

  /** Re-connect: render again from `steps` (nothing else is state). */
  canRebind() { return false; }

  /**
   * @private The steps of the server markup (to be checked by rebuilding), or null when it cannot be read. Explicit
   * states are inferred back: the anchor (aria-current) keeps `error` / gets `current` when `current` does not name it;
   * any other step whose data-state differs from its position gets it explicitly.
   */
  _readMarkup() {
    const kids = elementKids(this);
    if (!kids || kids.length !== 1) return null;
    const wrap = kids[0];
    const wk = elementKids(wrap);
    if (!wk || wk.length < 1) return null;
    const list = wk[0];
    if (list.localName !== 'ol') return null;
    const lis = elementKids(list);
    if (!lis || lis.length > MAX_STEPS) return null;
    const raw = [];
    let anchor = -1;
    for (const [i, li] of lis.entries()) {
      const step = li.firstElementChild;
      if (li.localName !== 'li' || !step) return null;
      const label = step.querySelector(':scope > .td-steps__label');
      const desc = step.querySelector(':scope > .td-steps__desc');
      if (!label || leafText(label) === null || (desc && leafText(desc) === null)) return null;
      const s = { key: li.getAttribute('data-key') ?? '', label: label.textContent, description: desc ? desc.textContent : '',
        disabled: li.hasAttribute('data-disabled') };
      if (step.localName === 'a') {
        const href = step.getAttribute('href') || '';
        if (cleanHref(href) !== href || !href) return null;
        s.href = href;
      }
      if (step.hasAttribute('aria-current')) {
        if (anchor >= 0) return null;
        anchor = i;
      }
      raw.push([s, li.getAttribute('data-state')]);
    }
    const complete = this.hasAttribute('complete');
    const current = this._current();
    const byAttr = !complete && current ? raw.findIndex(([s]) => s.key === current) : -1;
    const steps = raw.map(([s, ds], i) => {
      if (i === anchor) {
        if (byAttr !== anchor) return { ...s, state: 'current' };
        return ds === 'error' ? { ...s, state: 'error' } : s;
      }
      const pos = anchor >= 0 ? (i < anchor ? 'done' : 'upcoming') : (complete ? 'done' : 'upcoming');
      return ds && ds !== pos ? { ...s, state: ds } : s;
    });
    // the markup must already be normalised (keys, lengths, safe hrefs) — else it was not printed by PHP
    const norm = normalizeSteps(steps);
    if (norm.dropped || norm.renamed || norm.capped || norm.steps.length !== steps.length) return null;
    const same = norm.steps.every((n, i) => ['key', 'label', 'description', 'disabled', 'state', 'href'].every((k) => n[k] === steps[i][k]));
    return same ? norm.steps : null;
  }
}

if (!customElements.get('td-steps')) {
  customElements.define('td-steps', TdSteps);
}
