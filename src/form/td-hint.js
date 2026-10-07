import { TdBaseElement } from '../base/td-base-element.js';

let _hintIdCounter = 0;

/**
 * v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 5): one MutationObserver per tree root (the document or an open
 * shadow root), alive while that root holds at least one connected `<td-hint for>` — waiting OR linked (Codex
 * plan-review r1 #2). Every batch of records re-validates every hint of the root (microtask-batched).
 * @type {Map<Node, { observer: MutationObserver, hints: Set<TdHint>, queued: boolean }>}
 */
const ROOTS = new Map();

function watch(hint, root) {
  let entry = ROOTS.get(root);
  if (!entry) {
    entry = { observer: null, hints: new Set(), queued: false };
    entry.observer = new MutationObserver(() => {
      if (entry.queued) return;
      entry.queued = true;
      queueMicrotask(() => {
        entry.queued = false;
        for (const h of [...entry.hints]) h._revalidate();
      });
    });
    entry.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
    ROOTS.set(root, entry);
  }
  entry.hints.add(hint);
}

function unwatch(hint, root) {
  const entry = ROOTS.get(root);
  if (!entry) return;
  entry.hints.delete(hint);
  if (!entry.hints.size) {
    entry.observer.disconnect();
    ROOTS.delete(root);
  }
}

const tokens = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);

/**
 * `<td-hint>` — a helper text with rich content (links, `<code>`): the PAGE's own nodes, never an HTML string
 * (security-model §2). Styles: src/styles/components/hint.css (by tag: looks the same before the module loads).
 *
 * Two placements (plan QĐ 4):
 * - **Direct child of a kit form control** (no `for`): `<td-input-field …><td-hint>Xem <a href="…">quy định</a></td-hint>`
 *   — the control takes it out before its first render and mounts it where its helper note goes (it wins over
 *   `helper-text`, takes the note id, follows the error rule). This element then does nothing itself.
 * - **Standalone** `<td-hint for="control-id">`: links itself into the description of the element with that id in the
 *   same tree scope — a kit control through its helper contract (survives re-renders, hidden while the control shows an
 *   error), any other element through `aria-describedby` (appended, page ids kept, exactly its own token removed when it
 *   leaves). It follows the target (appears later, renamed, removed, replaced) and its own `id` / `for` / `hidden`.
 *
 * Without JS the site writes `aria-describedby="{hint id}"` on its control itself (PHP `td_hint()` prints the id
 * `{for}-hint`); the upgrade never duplicates it. Never renders: its children are the page's content.
 *
 * @element td-hint
 * @attr {string} for - id of the described element (property `htmlFor`)
 */
export class TdHint extends TdBaseElement {
  /** The children are always the page's content: adopted as they are, never rendered. */
  static hydratable = true;

  static get observedAttributes() { return ['for', 'id', 'hidden']; }

  /** @internal test hook: number of tree roots currently observed */
  static _observedRoots() { return ROOTS.size; }

  constructor() {
    super();
    /** @private { target, token, kit } — the element linked and the id written into its description (Codex r2 #10) */
    this._link = null;
    /** @private the tree root this hint is registered with */
    this._root = null;
    this._warnedScope = false;
  }

  canHydrate() { return true; }

  canRebind() { return true; }

  /** @returns {string} the `for` attribute */
  get htmlFor() { return this.getAttribute('for') ?? ''; }

  set htmlFor(v) {
    if (v == null) this.removeAttribute('for');
    else this.setAttribute('for', String(v));
  }

  /** @returns {Element|null} the element this hint currently describes (standalone mode) */
  get control() { return this._link?.target ?? null; }

  connectedCallback() {
    super.connectedCallback();
    if (this._tdOwner) return; // child of a kit control: the control drives it
    if (!this.hasAttribute('for')) return;
    if (!this.id) this.id = `td-hint-${++_hintIdCounter}`;
    this._root = this.getRootNode();
    watch(this, this._root);
    this._revalidate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const owner = this._tdOwner;
    if (owner) {
      // a child hint the page removed → the control's text note comes back (a move by the control re-connects first)
      queueMicrotask(() => { if (this._tdOwner === owner && !owner.contains(this)) owner._releaseHint?.(this); });
      return;
    }
    this._unlink();
    if (this._root) unwatch(this, this._root);
    this._root = null;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (this._tdOwner) {
      if (name === 'hidden' || name === 'id') this._tdOwner._applyHelperState?.();
      return;
    }
    if (!this.isConnected) return;
    if (name === 'for' && newVal !== null && !this._root) {
      if (!this.id) this.id = `td-hint-${++_hintIdCounter}`;
      this._root = this.getRootNode();
      watch(this, this._root);
    }
    this._revalidate();
  }

  /**
   * @private Bring the link in line with `for` / own id / hidden: when the wanted target OR the token changed, the stored
   * token leaves the old target FIRST, then the current id joins the new one (Codex r2 #10).
   */
  _revalidate() {
    const root = this._root;
    const f = this.getAttribute('for');
    let want = null;
    if (this.isConnected && root && f && !this.hidden && typeof root.getElementById === 'function') {
      want = root.getElementById(f);
      if (!want && !this._warnedScope && root !== this.ownerDocument && this.ownerDocument.getElementById(f)) {
        this._warnedScope = true;
        console.warn('<td-hint>: the `for` target must be in the same tree scope (document / shadow root) as the hint');
      }
    }
    if (want === this) want = null;
    const token = this.id;
    if (this._link && this._link.target === want && this._link.token === token) return;
    this._unlink();
    if (!want || !token) return;
    const tag = want.localName;
    if (tag.includes('-') && !customElements.get(tag) && tag.startsWith('td-')) {
      // a kit control not upgraded yet: link through its contract once it is defined
      customElements.whenDefined(tag).then(() => this._revalidate());
      return;
    }
    if (typeof want._linkHint === 'function') {
      this._link = { target: want, token, kit: true };
      want._linkHint(this, token);
      return;
    }
    const list = tokens(want);
    if (!list.includes(token)) want.setAttribute('aria-describedby', [...list, token].join(' '));
    this._link = { target: want, token, kit: false };
  }

  /** @private remove exactly the stored token from the stored target */
  _unlink() {
    const link = this._link;
    if (!link) return;
    this._link = null;
    if (link.kit) {
      link.target._unlinkHint?.(this);
      return;
    }
    const rest = tokens(link.target).filter((t) => t !== link.token);
    if (rest.length) link.target.setAttribute('aria-describedby', rest.join(' '));
    else link.target.removeAttribute('aria-describedby');
  }
}

if (!customElements.get('td-hint')) {
  customElements.define('td-hint', TdHint);
}
