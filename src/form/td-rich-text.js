import * as PM from '../vendor/td-rich-text-engine.js';
import { TdFormElement } from '../base/td-form-element.js';
import { hasIcon, tdIcon } from '../icons/td-icon.js';
import { isSafeUrl, normalizeLinkTarget, resolveFeatures } from './rich-text/rich-text-policy.js';
import { buildSchema, markOf } from './rich-text/rich-text-schema.js';
import { RICH_TEXT_MAX_HTML, isEmptyDoc, parseHtml, serializeHtml, stripUnsafe, visibleText, warnOversize } from './rich-text/rich-text-html.js';

/** feature → registry icon name + fallback glyph (shown only while the registry has no such icon). */
const TOOLS = {
  bold: { icon: 'bold', glyph: 'B' },
  italic: { icon: 'italic', glyph: 'I' },
  underline: { icon: 'underline', glyph: 'U' },
  strike: { icon: 'strikethrough', glyph: 'S' },
  link: { icon: 'link', glyph: '' },
};

/** feature → static `labels` key */
const LABEL_KEY = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', link: 'link' };

/**
 * `<td-rich-text>` — v0.88.0 (plan docs/internal/plans/v0.88.0-rich-text.md, lane C). A small rich text field (preset
 * `comment`: bold, italic, underline, strike, link) on a vendored ProseMirror engine. Form-associated: submits ONE
 * canonical HTML string (`<p>`, `<br>` and the enabled marks only; links keep a safe `href` and get a forced `rel` /
 * `target`). The server must sanitize again (php/td-rich-text-policy.php) — the client is never trusted.
 *
 * Markup (light DOM, built once with DOM APIs — never innerHTML from site data):
 *   <div class="td-rich-text td-field">
 *     <label class="td-field__label" id="{id}-label">…[<span class="td-field__required" aria-hidden="true"> *</span>]</label>
 *     <div class="td-rich-text__toolbar" role="toolbar" aria-label="Định dạng">
 *       <button type="button" class="td-btn td-btn--action td-btn--action-sm td-rich-text__tool" data-feature aria-pressed>…
 *     </div>
 *     <div class="td-rich-text__editor" role="textbox" aria-multiline="true" contenteditable> … </div> (+ the view's own class)
 *     [helper note] [error note]
 *   </div>
 *
 * Link dialog (v0.91.0, plan v0.91.0-link-modal-gutter § C): a `TdModal` (imported on first use, so the `/rich-text` subpath
 * stays light) holding `div.td-rich-text-link` = URL + display text fields and two native `.td-checkbox` ticks (new tab,
 * noreferrer); actions Gỡ liên kết (editing only) / Huỷ / Áp dụng. Moving focus into it is not a blur of the field.
 *
 * Lifecycle (plan "Vòng đời"): the shell and the editor node are built ONCE; every later render only syncs in place
 * (label, aria, editable, toolbar). A change of preset / features / allow-http rebuilds the schema and the
 * state from the current HTML (history cleared, toolbar rebuilt). Disconnect destroys the view and keeps the state;
 * reconnect mounts a new view on the same node.
 *
 * @element td-rich-text
 * @attr {string} preset - feature preset (`comment`, default)
 * @attr {string} features - feature tokens (space / comma separated), override `preset`
 * @attr {'none'|'_self'|'_blank'} link-target - default of a NEW link: `_blank` opens it in a new tab; `none` / `_self` =
 *   no `target`. Each link keeps its own target / noreferrer (v0.91.0); a change never rebuilds the schema
 * @attr {boolean} allow-http - accept `http:` links (https / mailto / tel / relative / #fragment always)
 * @attr {string} name
 * @attr {string} value - initial HTML (also the reset value)
 * @attr {string} label
 * @attr {string} placeholder
 * @attr {boolean} required
 * @attr {number} maxlength - limit of the visible text, in code points (paragraph break / line break = 1)
 * @attr {boolean} disabled
 * @attr {boolean} readonly
 * @attr {string} helper-text
 * @attr {string} error-text
 * @fires input - each change of the document by the user (`detail.value`)
 * @fires change - on blur, when the value differs from the value at focus (`detail.value`)
 */
export class TdRichText extends TdFormElement {
  /** UI texts (Vietnamese); override per site: `TdRichText.labels.bold = 'Bold'`. */
  static labels = {
    bold: 'Đậm',
    italic: 'Nghiêng',
    underline: 'Gạch chân',
    strike: 'Gạch ngang',
    link: 'Liên kết',
    linkUrl: 'Địa chỉ liên kết',
    apply: 'Áp dụng',
    remove: 'Gỡ liên kết',
    cancel: 'Huỷ',
    invalidUrl: 'Địa chỉ không hợp lệ',
    toolbar: 'Định dạng',
    linkTitle: 'Chèn liên kết',
    linkEditTitle: 'Sửa liên kết',
    linkText: 'Văn bản hiển thị',
    newTab: 'Mở trong tab mới',
    noReferrer: 'Không gửi thông tin trang nguồn (noreferrer)',
  };

  /** Validation texts (Vietnamese); override per site. */
  static messages = {
    valueMissing: 'Trường này là bắt buộc',
    tooLong: 'Vượt quá giới hạn {maxLength} ký tự',
  };

  static get observedAttributes() {
    return [
      ...super.observedAttributes, 'error-text', 'value', 'label', 'placeholder', 'maxlength', 'readonly',
      'preset', 'features', 'link-target', 'allow-http',
    ];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'readonly', 'allow-http'];
  }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @private @type {object|null} EditorState (lives across view destroy / re-create) */
    this._state = null;
    /** @private @type {object|null} EditorView (only while connected) */
    this._view = null;
    /** @private @type {object|null} */
    this._schema = null;
    /** @private config key of the current schema */
    this._key = '';
    /** @private canonical HTML of `_state.doc` */
    this._html = '';
    /** @private value assigned before the first render (parsed then, with the final config) */
    this._rawHtml = null;
    /** @private @type {string|null} value at the start of the focus session */
    this._valueAtFocus = null;
    /** @private roving tabindex position in the toolbar */
    this._toolIndex = 0;
    /** @private @type {Set<string>} unknown feature tokens already warned about */
    this._warned = new Set();
    /** @private @type {{from: number, to: number, sel: object, doc: object, marks: object[]|null, gen: number}|null}
     * selection saved when the link dialog opened */
    this._linkRange = null;
    /** @private @type {null|'loading'|'open'} link dialog state: idle → loading (td-modal import) → open → idle */
    this._linkDialog = null;
    /** @private generation of the link dialog: bumped on every open and every cancel; stale continuations do nothing */
    this._linkGen = 0;
    /** @private @type {string|null} id of the open TdModal */
    this._linkModalId = null;
    /** @private @type {any} the TdModal class once loaded */
    this._linkModal = null;
    this._bound = false;
    this._root = null;
  }

  // --- Public API ---

  /** @returns {string} canonical HTML ('' when empty) */
  get value() {
    if (this._state) return this._html;
    const schema = this._buildSchema(false);
    return serializeHtml(PM, schema, parseHtml(PM, schema, this._rawHtml ?? this.getAttribute('value') ?? ''));
  }

  /** Set the HTML (parsed + sanitized; no event). @param {string} v */
  set value(v) {
    const html = v == null ? '' : String(v);
    if (!this._state) {
      this._rawHtml = html;
      return;
    }
    this._replaceDoc(html);
  }

  /** @returns {string[]} the enabled features (resolved from `features` / `preset`) */
  get features() {
    return this._resolve().features;
  }

  /** @param {string|string[]|null} v - tokens; null / '' removes the attribute (back to `preset`) */
  set features(v) {
    const s = Array.isArray(v) ? v.join(' ') : (v == null ? '' : String(v));
    if (s) this.setAttribute('features', s);
    else this.removeAttribute('features');
  }

  // --- Attributes ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return;
    if (name === 'value') {
      // the attribute is the initial / reset value; a change while running sets the live value too (like input-field)
      if (oldVal !== newVal && this._state) this._replaceDoc(newVal ?? '');
      return;
    }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  // --- Render (persistent) ---

  /** @private First call builds the shell + view; later calls sync in place and never touch the editor node. */
  _doRender() {
    if (this._suppressRender) return;
    if (!this._root) this._buildShell();
    if (!this._state) {
      this._rebuild(this._rawHtml ?? this.getAttribute('value') ?? '');
      this._rawHtml = null;
    } else if (this._key !== this._configKey()) {
      this._rebuild(this._html);
    }
    if (this.isConnected && !this._view) this._mountView();
    this._sync();
    if (this.isConnected && !this._bound) {
      this._bound = true;
      this._bindStep();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._bound = false;
    this._cancelLinkDialog();
    this._valueAtFocus = null;
    if (this._view) {
      this._state = this._view.state;
      this._view.destroy();
      this._view = null;
    }
  }

  /** @private */
  _buildShell() {
    for (const x of this._extraHints || []) {
      if (x.parentNode === this) { x.remove(); this._extrasAside?.add(x); }
    }
    const el = (tag, cls) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      return n;
    };
    const root = el('div', 'td-rich-text td-field');
    const label = el('label', 'td-field__label');
    label.id = `${this.id}-label`;
    const labelText = el('span', 'td-rich-text__label-text');
    label.appendChild(labelText);
    const toolbar = el('div', 'td-rich-text__toolbar');
    toolbar.setAttribute('role', 'toolbar');

    const editor = el('div', 'td-rich-text__editor');
    editor.id = `${this.id}-editor`;
    root.append(label, toolbar, editor);
    this.replaceChildren(root);
    this._root = root;
    this._label = label;
    this._labelText = labelText;
    this._toolbar = toolbar;
    this._editor = editor;
  }

  /** @private */
  _resolve() {
    return resolveFeatures({ preset: this.getAttribute('preset'), features: this.getAttribute('features') });
  }

  /** @private @returns {string} */
  _configKey() {
    // v0.91.0: link-target is only the default of a new link, so it is NOT part of the schema key (no rebuild / undo loss)
    return [this._resolve().features.join(','), this.hasAttribute('allow-http') ? 'h' : ''].join('|');
  }

  /** @private */
  _linkTarget() {
    return normalizeLinkTarget(this.getAttribute('link-target'));
  }

  /** @private @param {boolean} warn */
  _buildSchema(warn) {
    const { features, unknown } = this._resolve();
    if (warn) {
      for (const t of unknown) {
        if (this._warned.has(t)) continue;
        this._warned.add(t);
        console.warn(`<td-rich-text>: unknown feature "${t}" — ignored`);
      }
    }
    return buildSchema(PM, features, { allowHttp: this.hasAttribute('allow-http') });
  }

  /** @private New schema + state from `html` (history cleared); the view (if any) keeps its node. */
  _rebuild(html) {
    this._cancelLinkDialog();
    this._schema = this._buildSchema(true);
    this._key = this._configKey();
    this._setState(this._newState(parseHtml(PM, this._schema, html)));
    this._buildToolbar();
  }

  /** @private */
  _newState(doc) {
    return PM.EditorState.create({
      schema: this._schema,
      doc,
      plugins: [PM.history(), PM.keymap(this._keys()), PM.keymap(PM.baseKeymap)],
    });
  }

  /** @private */
  _setState(state) {
    this._state = state;
    this._html = serializeHtml(PM, this._schema, state.doc);
    if (this._view) this._view.updateState(state);
  }

  /** @private Programmatic value: parse + sanitize, new history, no event. */
  _replaceDoc(html) {
    this._cancelLinkDialog();
    this._setState(this._newState(parseHtml(PM, this._schema, html)));
    if (this._valueAtFocus != null) this._valueAtFocus = this._html;
    if (this._initialized) {
      this._syncForm();
      this._syncToolbar();
    }
  }

  /** @private */
  _keys() {
    const schema = this._schema;
    const keys = {};
    const mark = (feature, key) => {
      const type = schema.marks[markOf(feature)];
      if (type) keys[key] = PM.toggleMark(type);
    };
    mark('bold', 'Mod-b');
    mark('italic', 'Mod-i');
    mark('underline', 'Mod-u');
    mark('strike', 'Mod-Shift-x');
    if (schema.marks.link) keys['Mod-k'] = () => this._openLink();
    const br = schema.nodes.hard_break;
    keys['Shift-Enter'] = PM.chainCommands(PM.exitCode, (state, dispatch) => {
      if (dispatch) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
      return true;
    });
    keys['Mod-z'] = PM.undo;
    keys['Mod-y'] = PM.redo;
    keys['Shift-Mod-z'] = PM.redo;
    return keys;
  }

  /** @private */
  _mountView() {
    this._view = new PM.EditorView({ mount: this._editor }, {
      state: this._state,
      editable: () => this._canEdit(),
      attributes: (state) => (isEmptyDoc(state.doc) ? { 'data-empty': '' } : {}),
      dispatchTransaction: (tr) => this._dispatch(tr),
      // an oversized paste / drop is ignored before the engine parses it (same bound as `value`)
      transformPastedHTML: (html) => (html.length > RICH_TEXT_MAX_HTML ? warnOversize() : html),
      transformPastedText: (text) => (text.length > RICH_TEXT_MAX_HTML ? warnOversize() : text),
      clipboardParser: {
        // pasted / dropped HTML: active content out first, then the schema keeps the allowed tags only
        parseSlice: (dom, opts) => {
          stripUnsafe(dom);
          return PM.PMDOMParser.fromSchema(this._schema).parseSlice(dom, opts);
        },
      },
    });
    this._editable = this._canEdit();
  }

  /** @private */
  _canEdit() {
    return !this._effectiveDisabled && !this.hasAttribute('readonly');
  }

  /** @private */
  _dispatch(tr) {
    if (!this._view) return;
    const state = this._view.state.apply(tr);
    this._view.updateState(state);
    this._state = state;
    if (tr.docChanged) {
      this._html = serializeHtml(PM, this._schema, state.doc);
      this._syncForm();
      this.emit('input', { value: this._html });
    }
    this._syncToolbar();
  }

  // --- In-place sync ---

  /** @private */
  _sync() {
    const label = this.getAttribute('label') || '';
    if (this._labelText.textContent !== label) this._labelText.textContent = label;
    this._label.hidden = !label;
    this._applyRequired();

    const ed = this._editor;
    const set = (n, v) => {
      if (v == null) ed.removeAttribute(n);
      else if (ed.getAttribute(n) !== v) ed.setAttribute(n, v);
    };
    set('role', 'textbox');
    set('aria-multiline', 'true');
    this._applyAccessibleName(ed, !!label);
    if (label) set('aria-labelledby', this._label.id);
    set('aria-required', this.hasAttribute('required') ? 'true' : null);
    const readonly = this.hasAttribute('readonly');
    set('aria-readonly', readonly ? 'true' : null);
    set('aria-disabled', this._effectiveDisabled ? 'true' : null);
    set('tabindex', readonly && !this._effectiveDisabled ? '0' : null);
    const ph = this.getAttribute('placeholder') || '';
    set('data-placeholder', ph || null);
    set('aria-placeholder', ph || null);

    const editable = this._canEdit();
    if (this._view && editable !== this._editable) {
      this._editable = editable;
      this._view.setProps({ editable: () => this._canEdit() });
    }
    if (!editable) this._cancelLinkDialog();

    const labels = this.constructor.labels;
    this._toolbar.setAttribute('aria-label', labels.toolbar);
    this._toolbar.setAttribute('aria-controls', ed.id);
    this._syncToolbar();
    if (this._initialized) {
      this._syncForm();
      this._applyErrorState();
    }
  }

  /** @private Required star after the label text (input-field markup). */
  _applyRequired() {
    let star = this._label.querySelector('.td-field__required');
    if (this.hasAttribute('required')) {
      if (!star) {
        star = document.createElement('span');
        star.className = 'td-field__required';
        star.setAttribute('aria-hidden', 'true');
        star.textContent = ' *';
        this._label.appendChild(star);
      }
    } else if (star) {
      star.remove();
    }
  }

  /** @private Toolbar buttons for the enabled features (rebuilt when the config changes). */
  _buildToolbar() {
    if (!this._toolbar) return;
    const features = this._resolve().features;
    const labels = this.constructor.labels;
    const buttons = features.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-btn td-btn--action td-btn--action-sm td-rich-text__tool';
      b.dataset.feature = f;
      b.setAttribute('aria-pressed', 'false');
      const text = labels[LABEL_KEY[f]];
      b.setAttribute('aria-label', text);
      b.setAttribute('data-tooltip', text);
      if (f === 'link') {
        b.setAttribute('aria-haspopup', 'dialog');
        b.setAttribute('aria-expanded', this._linkDialog === 'open' ? 'true' : 'false');
      }
      const icon = document.createElement('span');
      icon.className = 'td-btn__icon';
      const tool = TOOLS[f];
      if (hasIcon(tool.icon)) {
        const svg = tdIcon(tool.icon);
        if (svg) icon.appendChild(svg);
      } else {
        // the core registry has no such icon yet: a letter (aria-hidden; the button is named by aria-label)
        const glyph = document.createElement('span');
        glyph.className = `td-rich-text__glyph td-rich-text__glyph--${f}`;
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = tool.glyph;
        icon.appendChild(glyph);
      }
      b.appendChild(icon);
      return b;
    });
    this._toolbar.replaceChildren(...buttons);
    this._toolbar.hidden = !buttons.length;
    this._toolIndex = Math.min(this._toolIndex, Math.max(0, buttons.length - 1));
    this._syncToolbar();
  }

  /** @private @returns {HTMLButtonElement[]} */
  _tools() {
    return this._toolbar ? [...this._toolbar.querySelectorAll(':scope > .td-rich-text__tool')] : [];
  }

  /** @private aria-pressed from the selection, disabled from the state, roving tabindex. */
  _syncToolbar() {
    const state = this._state;
    const off = !this._canEdit();
    this._tools().forEach((b, i) => {
      const type = state && this._schema.marks[markOf(b.dataset.feature)];
      const on = !!type && this._markActive(state, type);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = off;
      b.tabIndex = i === this._toolIndex ? 0 : -1;
    });
  }

  /** @private */
  _markActive(state, type) {
    const { from, to, empty, $from } = state.selection;
    if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
    return state.doc.rangeHasMark(from, to, type);
  }

  /** @private */
  _syncForm() {
    const html = this._html;
    this._setFormValue(html, html);
    const text = this._state ? visibleText(this._state.doc) : '';
    const max = this._maxLength();
    if (this.hasAttribute('required') && !text.trim()) {
      this._setValidity({ valueMissing: true }, this._msg('valueMissing'), this._editor);
    } else if (max && [...text].length > max) {
      this._setValidity({ tooLong: true }, this._msg('tooLong', { maxLength: max }), this._editor);
    } else {
      this._setValidity({});
    }
  }

  /** @private @returns {number} positive int, 0 = none */
  _maxLength() {
    const n = Number.parseInt(this.getAttribute('maxlength'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // --- Bind ---

  afterRender() {
    this.listen(this, 'focusin', (e) => this._onFocusIn(e));
    this.listen(this, 'focusout', (e) => this._onFocusOut(e));
    // the editor is a native editable: its own input never reaches the page (one host event)
    this.listen(this._editor, 'input', (e) => e.stopPropagation());
    // disabled: a link inside is not activated (mouse or Enter — both arrive as click); readonly keeps links working.
    // Capture phase, so a handler on the link that stops propagation cannot skip it.
    this.listen(this._editor, 'click', (e) => {
      if (this._effectiveDisabled && /** @type {Element} */ (e.target).closest?.('a[href]')) e.preventDefault();
    }, { capture: true });
    this.listen(this._label, 'click', (e) => {
      e.preventDefault();
      if (this._view && !this._effectiveDisabled) this._view.focus();
    });
    this.listen(this._toolbar, 'mousedown', (e) => {
      if (e.target.closest('.td-rich-text__tool')) e.preventDefault(); // keep the editor focus + selection
    });
    this.listen(this._toolbar, 'click', (e) => this._onToolClick(e));
    this.listen(this._toolbar, 'keydown', (e) => this._onToolKey(e));
  }

  /** @private */
  _onFocusIn(e) {
    if (this._valueAtFocus == null) this._valueAtFocus = this._html;
    const i = this._tools().indexOf(e.target);
    if (i >= 0 && i !== this._toolIndex) {
      this._toolIndex = i;
      this._syncToolbar();
    }
  }

  /**
   * @private Focus session: moving between editor and toolbar is not a blur, nor is moving into this field's own link
   * dialog (a TdModal portaled to <body>; `_linkDialog` is 'open' BEFORE TdModal.show() takes the focus). A real blur
   * while td-modal is still loading cancels the dialog.
   */
  _onFocusOut(e) {
    if (this._linkDialog === 'open') return;
    const to = e.relatedTarget;
    if (to && this.contains(to)) return;
    this._cancelLinkDialog();
    this._endFocusSession();
  }

  /** @private End of the focus session: one `change` when the value differs from the value at focus. */
  _endFocusSession() {
    const start = this._valueAtFocus;
    this._valueAtFocus = null;
    if (start != null && this._html !== start) this.emit('change', { value: this._html });
  }

  /** @private */
  _onToolClick(e) {
    const b = e.target.closest('.td-rich-text__tool');
    if (!b || b.disabled || !this._view || !this._canEdit()) return;
    const f = b.dataset.feature;
    const pointer = e.detail > 0;
    if (f === 'link') {
      this._openLink();
      return;
    }
    const type = this._schema.marks[markOf(f)];
    if (!type) return;
    PM.toggleMark(type)(this._view.state, (tr) => this._dispatch(tr));
    if (pointer) this._view.focus();
  }

  /** @private Roving tabindex: ←/→/Home/End. */
  _onToolKey(e) {
    const tools = this._tools();
    const i = tools.indexOf(e.target);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tools.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tools.length) % tools.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tools.length - 1;
    if (next < 0) return;
    e.preventDefault();
    this._toolIndex = next;
    this._syncToolbar();
    tools[next].focus();
  }

  // --- Link dialog ---

  /** @private The link run (same mark) around `pos` in its textblock. @returns {{from:number,to:number,mark:object}|null} */
  _linkSpanAt(doc, pos, mark) {
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    if (!parent.isTextblock) return null;
    const start = $pos.start();
    let span = null;
    let runFrom = -1;
    let runTo = -1;
    parent.forEach((child, offset) => {
      const a = start + offset;
      const b = a + child.nodeSize;
      if (mark.isInSet(child.marks)) {
        if (runFrom < 0 || runTo !== a) runFrom = a;
        runTo = b;
        if (runFrom <= pos && pos <= runTo) span = { from: runFrom, to: runTo, mark };
      }
    });
    return span;
  }

  /** @private The link the saved selection is in (empty: mark at the cursor; range: the first link in it). */
  _currentLink() {
    const state = this._state;
    const type = this._schema.marks.link;
    if (!type || !this._linkRange) return null;
    const { from, to } = this._linkRange;
    const doc = state.doc;
    let mark = null;
    if (from === to) {
      const $from = doc.resolve(from);
      mark = type.isInSet($from.marks()) || type.isInSet($from.nodeAfter?.marks || []);
      if (!mark) return null;
      return this._linkSpanAt(doc, from, mark);
    }
    let first = -1;
    doc.nodesBetween(from, to, (node, pos) => {
      if (mark || !node.isText) return !mark;
      const m = type.isInSet(node.marks);
      if (m) { mark = m; first = Math.max(pos, from); }
      return false;
    });
    return mark ? this._linkSpanAt(doc, first, mark) : null;
  }

  /**
   * @private Toolbar button / Mod-k. Saves the selection, then loads td-modal (dynamic import) and opens the dialog.
   * A press while loading / open is ignored. @returns {boolean} (keymap command result)
   */
  _openLink() {
    if (!this._view || !this._canEdit() || !this._schema.marks.link) return false;
    if (this._linkDialog) return true;
    const state = this._view.state;
    const sel = state.selection;
    const gen = ++this._linkGen;
    this._linkRange = { from: sel.from, to: sel.to, sel, doc: state.doc, marks: state.storedMarks, gen };
    this._linkDialog = 'loading';
    // a toolbar click never focuses the field (mousedown is prevented): the focus session starts here, so the
    // `change` at the real blur after the dialog compares with the value before it
    if (this._valueAtFocus == null) this._valueAtFocus = this._html;
    this._loadLinkDialog(gen);
    return true;
  }

  /** @private @param {number} gen */
  async _loadLinkDialog(gen) {
    let TdModal;
    try {
      ({ TdModal } = await import('../feedback/td-modal.js'));
    } catch {
      if (gen === this._linkGen) this._cancelLinkDialog();
      console.warn('<td-rich-text>: the link dialog could not be loaded');
      return;
    }
    if (gen !== this._linkGen || this._linkDialog !== 'loading') return; // cancelled meanwhile
    const range = this._linkRange;
    if (!this.isConnected || !this._view || !this._canEdit() || !range || this._view.state.doc !== range.doc) {
      this._cancelLinkDialog();
      return;
    }
    this._showLinkDialog(TdModal, gen);
  }

  /** @private @param {any} TdModal @param {number} gen */
  _showLinkDialog(TdModal, gen) {
    const L = this.constructor.labels;
    const range = this._linkRange;
    // overlap rule: a selection that touches a link edits that link's whole contiguous span; else a new link
    const span = this._currentLink();
    let { from, to } = span || range;
    if (!span) { // a new link: the range inside text (an all-selection starts / ends outside the paragraphs)
      const t = PM.TextSelection.between(range.doc.resolve(from), range.doc.resolve(to));
      ({ from, to } = t);
    }
    const ui = this._buildLinkBody(L);
    ui.url.value = span ? span.mark.attrs.href : '';
    ui.text.value = range.doc.textBetween(from, to, ' ', ' ');
    ui.newTab.checked = span ? span.mark.attrs.target === '_blank' : this._linkTarget() === '_blank';
    ui.noReferrer.checked = span ? !!span.mark.attrs.noreferrer : false;
    // what the field shows (a text input drops line breaks): "text unchanged" compares with this
    const ctx = { gen, span, from, to, text0: ui.text.value, ui, applied: false };
    ui.url.addEventListener('input', () => this._setLinkError(ui, false));
    ui.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || (e.target !== ui.url && e.target !== ui.text)) return;
      e.preventDefault(); // Enter = Áp dụng; never submits a form
      if (this._applyLink(ctx) && this._linkModalId) TdModal.closeById(this._linkModalId);
    });
    const actions = [];
    if (span) actions.push({ label: L.remove, variant: 'secondary', onClick: () => this._removeLink(ctx) });
    actions.push({ label: L.cancel, variant: 'secondary', value: false });
    actions.push({ label: L.apply, variant: 'primary', onClick: () => this._applyLink(ctx) });
    this._linkDialog = 'open'; // BEFORE show(): the focus moves into the modal synchronously (not a blur)
    const id = TdModal.show({
      themeRoot: this, // ADR 0020: the dialog follows the field's theme scope
      title: span ? L.linkEditTitle : L.linkTitle,
      body: ui.root,
      size: 'sm',
      escapeCloses: true, // closing loses nothing (the document is untouched until Áp dụng)
      focusTarget: ui.url,
      actions,
      onShow: () => { if (document.activeElement === ui.url) ui.url.select(); },
      onClose: () => this._onLinkDialogClosed(ctx),
    });
    if (gen !== this._linkGen) { // cancelled while show() ran
      TdModal.closeById(id);
      return;
    }
    this._linkModalId = id;
    this._linkModal = TdModal;
    this._linkButton()?.setAttribute('aria-expanded', 'true');
  }

  /**
   * @private Modal body (DOM APIs only; labels are text): URL + display text (`.td-field` markup) and two native
   * `label.td-checkbox` ticks (the kit's CSS-only checkbox markup). No `name`: the modal lives outside any form.
   */
  _buildLinkBody(L) {
    const el = (tag, cls) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      return n;
    };
    const root = el('div', 'td-rich-text-link');
    const field = (key, labelText, cls) => {
      const box = el('div', 'td-field');
      const label = el('label', 'td-field__label');
      const input = el('input', `td-field__control ${cls}`);
      input.type = 'text';
      input.id = `${this.id}-link-${key}`;
      input.setAttribute('autocomplete', 'off');
      label.htmlFor = input.id;
      label.textContent = labelText;
      box.append(label, input);
      root.appendChild(box);
      return { box, input };
    };
    const url = field('url', L.linkUrl, 'td-rich-text-link__url');
    url.input.setAttribute('inputmode', 'url');
    url.input.setAttribute('spellcheck', 'false');
    const error = el('span', 'td-field-error');
    error.id = `${this.id}-link-error`;
    error.hidden = true;
    url.box.appendChild(error);
    const text = field('text', L.linkText, 'td-rich-text-link__text');
    const check = (labelText) => {
      const label = el('label', 'td-checkbox td-checkbox--md td-rich-text-link__check');
      const input = el('input', 'td-checkbox__input');
      input.type = 'checkbox';
      const mark = el('span', 'td-checkbox__mark');
      mark.setAttribute('aria-hidden', 'true');
      const icon = el('span', 'td-checkbox__icon');
      const svg = tdIcon('check', { class: 'td-checkbox__svg' });
      if (svg) icon.appendChild(svg);
      mark.appendChild(icon);
      const name = el('span', 'td-checkbox__label');
      name.textContent = labelText;
      label.append(input, mark, name);
      root.appendChild(label);
      return input;
    };
    const newTab = check(L.newTab);
    const noReferrer = check(L.noReferrer);
    return { root, url: url.input, error, text: text.input, newTab, noReferrer };
  }

  /** @private */
  _linkButton() {
    return this._tools().find((b) => b.dataset.feature === 'link') || null;
  }

  /** @private */
  _setLinkError(ui, on) {
    ui.error.textContent = on ? this.constructor.labels.invalidUrl : '';
    ui.error.hidden = !on;
    if (on) {
      ui.url.setAttribute('aria-invalid', 'true');
      ui.url.setAttribute('aria-describedby', ui.error.id);
    } else {
      ui.url.removeAttribute('aria-invalid');
      ui.url.removeAttribute('aria-describedby');
    }
  }

  /**
   * @private Áp dụng (plan C 15), ONE transaction. Text unchanged → only the new link mark on the range; text changed or
   * an insertion → the range replaced by the text (the non-link marks at its start + the link), caret after it; empty
   * text → the URL. @returns {boolean} false = invalid URL, the dialog stays open
   */
  _applyLink(ctx) {
    const range = this._linkRange;
    if (ctx.gen !== this._linkGen || !this._view || !range) return true;
    const { ui } = ctx;
    const href = isSafeUrl(ui.url.value, { allowHttp: this.hasAttribute('allow-http') });
    if (!href) {
      this._setLinkError(ui, true);
      ui.url.focus();
      return false;
    }
    const state = this._view.state;
    if (state.doc !== range.doc) return true; // cannot happen while open (a value change cancels); never apply stale
    const type = this._schema.marks.link;
    const mark = type.create({ href, target: ui.newTab.checked ? '_blank' : null, noreferrer: ui.noReferrer.checked });
    const { from, to } = ctx;
    const tr = state.tr;
    let sel;
    if (from !== to && ui.text.value === ctx.text0) {
      tr.removeMark(from, to, type).addMark(from, to, mark);
      sel = PM.TextSelection.between(tr.doc.resolve(range.from), tr.doc.resolve(range.to));
    } else {
      const text = ui.text.value.trim() ? ui.text.value : href;
      const $from = state.doc.resolve(from);
      const first = $from.nodeAfter;
      const base = from === to ? (range.marks || $from.marks()) : (first && first.isText ? first.marks : $from.marks());
      tr.replaceWith(from, to, this._schema.text(text, mark.addToSet(type.removeFromSet(base))));
      sel = PM.TextSelection.create(tr.doc, from + text.length);
    }
    tr.setSelection(sel);
    this._dispatch(tr);
    ctx.applied = true;
    return true;
  }

  /** @private The link run touching `pos` on either side (cursor right before / inside / right after a link). */
  _linkAround(doc, pos) {
    const type = this._schema.marks.link;
    const $p = doc.resolve(pos);
    const mark = type.isInSet($p.marks()) || type.isInSet($p.nodeAfter?.marks || []) || type.isInSet($p.nodeBefore?.marks || []);
    return mark ? this._linkSpanAt(doc, pos, mark) : null;
  }

  /**
   * @private Gỡ liên kết: the link mark off the link being edited — only its own span (ctx.span), never other links the
   * saved selection also touches (impl review r1). The button exists only in edit mode. @returns {boolean}
   */
  _removeLink(ctx) {
    const range = this._linkRange;
    if (ctx.gen !== this._linkGen || !this._view || !range || !ctx.span) return true;
    const state = this._view.state;
    if (state.doc !== range.doc) return true;
    const { from, to } = ctx.span;
    if (from !== to) this._dispatch(state.tr.removeMark(from, to, this._schema.marks.link));
    return true;
  }

  /**
   * @private onClose of the dialog (every user close path; the modal already gave the focus back to its opener): the
   * saved selection back (Áp dụng set its own), then the editor focused. A stale generation does nothing.
   */
  _onLinkDialogClosed(ctx) {
    if (ctx.gen !== this._linkGen || this._linkDialog !== 'open') return;
    const range = this._linkRange;
    this._linkDialog = null;
    this._linkModalId = null;
    this._linkRange = null;
    this._linkButton()?.setAttribute('aria-expanded', 'false');
    if (!this._view) return;
    if (!ctx.applied && range) {
      const doc = this._view.state.doc;
      const size = doc.content.size;
      const clamp = (n) => Math.max(0, Math.min(n, size));
      // same document → the exact saved selection (also an all-selection); else the same range, mapped to valid text
      const sel = doc === range.doc ? range.sel : PM.TextSelection.between(doc.resolve(clamp(range.from)), doc.resolve(clamp(range.to)));
      if (!sel.eq(this._view.state.selection)) this._dispatch(this._view.state.tr.setSelection(sel));
    }
    this._view.focus();
  }

  /**
   * @private Cancel (rebuild, value set by code, disabled / readonly, disconnect, a real blur while loading): the
   * generation is bumped (a pending import or the old modal's onClose does nothing), an open modal is closed, nothing
   * applied. The modal gives the focus back to its opener; if that left the field, the focus session ends here.
   */
  _cancelLinkDialog() {
    if (!this._linkDialog) return;
    const id = this._linkModalId;
    this._linkGen += 1;
    this._linkDialog = null;
    this._linkModalId = null;
    this._linkRange = null;
    this._linkButton()?.setAttribute('aria-expanded', 'false');
    if (id && this._linkModal) {
      this._linkModal.closeById(id);
      if (this._valueAtFocus != null && this.isConnected && !this.contains(document.activeElement)) this._endFocusSession();
    }
  }

  // --- Form ---

  /** @protected */
  _focusTarget() {
    return this._editor || null;
  }

  /** @protected */
  _errorHost() {
    return this._root || this;
  }

  /** @protected */
  _restoreDefaults() {
    this._replaceDoc(this._defaultValue);
  }

  /** @protected */
  _restoreState(state) {
    if (typeof state === 'string') this.value = state;
  }
}

if (!customElements.get('td-rich-text')) customElements.define('td-rich-text', TdRichText);
