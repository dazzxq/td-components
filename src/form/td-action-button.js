import { TdButton } from './td-button.js';
import { hasIcon } from '../icons/td-icon.js';
import { tdTooltip } from '../feedback/td-tooltip.js'; // self-initialising: the label is shown as a tooltip
import { sameControlStructure, contentNodes, safeDownloadName, PART_ATTRS } from './button-structure.js';

const TONES = ['standard', 'warning', 'danger'];
const SIZES = ['sm', 'md', 'lg'];
const TYPES = ['submit', 'reset', 'button'];
const TARGETS = ['_blank', '_self', '_parent', '_top'];
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPINNER = '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
  + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
/** Children of the icon-only control: icon slot + spinner — NO label span (a server `td-btn__label` is refused). */
const ACTION_PARTS = { 'td-btn__icon': PART_ATTRS['td-btn__icon'], 'td-btn__spinner': PART_ATTRS['td-btn__spinner'] };
/** Host attributes of TdButton that mean nothing on an icon-only, always-ghost square control. */
const IGNORED = new Set(['variant', 'color', 'text-color', 'icon-position', 'full-width']);
/** Action names already warned about (unresolvable: no preset and no icon + label override) — once per name. */
const _warned = new Set();

/**
 * The 23 dcms2 `ActionButtonConfigs` presets (resources/js/components/dcms-action-buttons.js) — the ONE inventory of
 * plan v0.36.0 QĐ 11, mirrored by Td::ACTION_PRESETS in php/td.php (parity: test/php/td-action-button.test.js).
 * Name = dcms2 key camelCase → kebab; label = dcms2 `title`; tone = dcms2 `type`. Per-preset colours of dcms2 are dropped
 * (three tones, minimal surfaces).
 */
const DCMS_PRESETS = [
  ['edit', 'pencil', 'Chỉnh sửa', 'standard'],
  ['view', 'eye', 'Xem chi tiết', 'standard'],
  ['review', 'send', 'Gửi bài', 'standard'],
  ['remove', 'arrow-down-to-line', 'Gỡ bài viết', 'warning'],
  ['unpublish', 'arrow-down-to-line', 'Gỡ xuống', 'danger'],
  ['withdraw', 'rewind', 'Rút bài', 'warning'],
  ['return', 'undo-2', 'Trả lại', 'warning'],
  ['log', 'history', 'Xem log', 'standard'],
  ['versions', 'layers', 'Lịch sử phiên bản', 'standard'],
  ['password', 'rotate-cw', 'Reset mật khẩu', 'warning'],
  ['reset', 'key-round', 'Reset mật khẩu', 'warning'],
  ['open', 'external', 'Mở trong tab mới', 'standard'],
  ['copy', 'copy', 'Sao chép', 'standard'],
  ['delete', 'trash', 'Xoá', 'danger'],
  ['download', 'download', 'Tải về', 'standard'],
  ['moveup', 'arrow-up', 'Di chuyển lên', 'standard'],
  ['movedown', 'arrow-down', 'Di chuyển xuống', 'standard'],
  ['publish', 'success', 'Xuất bản', 'standard'],
  ['send-to-publish', 'send', 'Gửi chờ xuất bản', 'standard'],
  ['submit', 'send', 'Gửi bài', 'standard'],
  ['claim', 'hand', 'Nhận bài', 'standard'],
  ['release', 'reply', 'Nhả bài', 'warning'],
  ['force-release', 'user-x', 'Nhả bài cho người khác', 'danger'],
];

/**
 * v0.56.0 (plan v0.56.0-repeater-icons-date A2): presets of the KIT, after the dcms2 table (same shape, same PHP mirror
 * Td::ACTION_PRESETS). Reversible status changes are `warning` (`danger` stays for data loss — `delete`); `restore` (out
 * of the archive) is not `return` (`undo-2`, "Trả lại" — the review flow).
 */
const KIT_PRESETS = [
  ['archive', 'archive', 'Lưu trữ', 'warning'],
  ['restore', 'restore', 'Khôi phục', 'standard'],
  ['discontinue', 'ban', 'Ngừng kinh doanh', 'warning'],
];

/**
 * Canonical preset key: dcms2 camelCase → kebab-case (`sendToPublish` → `send-to-publish`), lower-cased; only
 * `[a-z0-9-]` keys are valid (anything else → null, never looked up).
 * @param {string|null|undefined} action
 * @returns {string|null}
 */
export function canonAction(action) {
  if (typeof action !== 'string') return null;
  const key = action.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return KEY.test(key) ? key : null;
}

/**
 * Action button — an icon-only square button with a preset (icon + Vietnamese label + tone), like dcms2
 * `ActionButtons.generate()`. A thin subclass of TdButton (v0.36.0, plan QĐ 8–15): `<button>` / link (`href`),
 * `disabled`, `loading`, `type`, forwarded `aria-pressed|expanded|controls|haspopup`, SSR hydrate are inherited.
 * Styles: src/styles/components/action-button.css.
 *
 * DOM contract:
 *   <button class="td-btn td-btn--action td-btn--action-{tone} td-btn--action-{size}" type="…" aria-label="{name}"
 *           data-tooltip="{name}">
 *     <span class="td-btn__icon" data-td-icon="{icon}" data-td-icon-size="s" aria-hidden="true">svg</span>
 *     <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span>
 *   </button>
 *   (link: the same in `<a class="…" href [target] [rel] [download]>`, state as td-button). No visible text: the name
 *   is `aria-label` + `data-tooltip` (td-tooltip skips a description equal to the name — read once).
 * Name precedence (one function, _name()): host `aria-label` > `label` > preset label. `aria-labelledby` is not
 * forwarded. Unresolvable (unknown action without `icon` + `label`) → nothing rendered + one console warning per name.
 * SSR: `data-td-ssr="action-button@1"` (PHP td_action_button element mode) adopted in place when the control has
 * exactly render()'s structure AND its aria-label / data-tooltip equal _name(); else a normal render.
 *
 * @element td-action-button
 * @attr {string} action - Preset key (kebab-case; dcms camelCase alias accepted: `sendToPublish`, `forceRelease`)
 * @attr {string} label - Overrides the preset label (accessible name + tooltip; never visible text)
 * @attr {string} icon - Overrides the preset icon (icon registry name / alias)
 * @attr {string} tone - standard | warning | danger (overrides the preset tone; other values → preset / standard)
 * @attr {string} size - sm | md | lg = 32 / 36 / 40 px square (default md; 44 × 44 under `pointer: coarse`)
 * @attr {boolean} disabled
 * @attr {boolean} loading
 * @attr {string} href - Link mode (same URL allowlist as td-button)
 * @attr {string} target - _blank | _self | _parent | _top
 */
export class TdActionButton extends TdButton {
  /** SSR markup contract `data-td-ssr="action-button@1"` (independent of `button@1`). */
  static SSR_SCHEMA = 1;

  /** Preset registry (site-editable object): name → { icon, label, tone }. The dcms2 presets, then the kit's (v0.56.0). */
  static presets = Object.fromEntries([...DCMS_PRESETS, ...KIT_PRESETS].map(([name, icon, label, tone]) => [name, { icon, label, tone }]));

  static get observedAttributes() {
    return [...super.observedAttributes.filter((a) => !IGNORED.has(a)), 'action', 'tone'];
  }

  static get booleanAttributes() { return ['loading', 'disabled']; }

  /**
   * Register (or replace) a preset. Hosts already rendered keep their markup until their `action` changes — register
   * before defining / printing hosts.
   * @param {string} name kebab-case key
   * @param {{ icon: string, label: string, tone?: 'standard'|'warning'|'danger' }} def
   */
  static registerPreset(name, def) {
    if (typeof name !== 'string' || !KEY.test(name)) throw new TypeError(`TdActionButton.registerPreset: invalid name "${name}" (kebab-case)`);
    const { icon, label, tone = 'standard' } = def || {};
    if (typeof label !== 'string' || !label.trim()) throw new TypeError(`TdActionButton.registerPreset("${name}"): label must be a non-empty string`);
    if (!TONES.includes(tone)) throw new TypeError(`TdActionButton.registerPreset("${name}"): tone must be ${TONES.join(' | ')}`);
    if (typeof icon !== 'string' || !hasIcon(icon)) throw new TypeError(`TdActionButton.registerPreset("${name}"): unknown icon "${icon}"`);
    TdActionButton.presets[name] = { icon, label: label.trim(), tone };
  }

  /**
   * @private The resolved preset + host overrides, or null (no icon or no label → render nothing, warn once per name).
   * @returns {{ icon: string, label: string, tone: string, size: string } | null}
   */
  _resolved() {
    const action = this.getAttribute('action');
    const key = canonAction(action);
    const presets = TdActionButton.presets;
    const preset = key !== null && Object.hasOwn(presets, key) ? presets[key] : null;
    const ownIcon = (this.getAttribute('icon') || '').trim();
    const icon = ownIcon && hasIcon(ownIcon) ? ownIcon : (preset?.icon && hasIcon(preset.icon) ? preset.icon : '');
    const label = (this.getAttribute('label') || '').trim() || (typeof preset?.label === 'string' ? preset.label.trim() : '');
    if (!icon || !label) {
      const name = String(action ?? '');
      if (!_warned.has(name)) {
        if (_warned.size > 200) _warned.clear();
        _warned.add(name);
        console.warn(`td-action-button: unknown action "${name}" (no preset; give icon + label)`);
      }
      return null;
    }
    const ownTone = this.getAttribute('tone');
    const tone = TONES.includes(ownTone) ? ownTone : (TONES.includes(preset?.tone) ? preset.tone : 'standard');
    const size = SIZES.includes(this.getAttribute('size')) ? this.getAttribute('size') : 'md';
    return { icon, label, tone, size };
  }

  /** @private Accessible name = tooltip text: host aria-label > label > preset label. */
  _name(r = this._resolved()) {
    return (this.getAttribute('aria-label') || '').trim() || r?.label || '';
  }

  /** Custom colours do not apply (always the tone's ghost look). */
  _customColor() { return ''; }

  render() {
    const r = this._resolved();
    if (!r) return '';
    const name = this.escapeHtml(this._name(r));
    const cls = `td-btn td-btn--action td-btn--action-${r.tone} td-btn--action-${r.size}`;
    const inner = `<span class="td-btn__icon" data-td-icon="${this.escapeHtml(r.icon)}" data-td-icon-size="s" aria-hidden="true"></span>`
      + SPINNER;
    const named = ` aria-label="${name}" data-tooltip="${name}"`;
    if (this._isLink()) {
      let attrs = '';
      const target = this.getAttribute('target');
      if (TARGETS.includes(target)) {
        attrs += ` target="${target}"`;
        if (target === '_blank') attrs += ' rel="noopener noreferrer"';
      }
      if (this.hasAttribute('download')) {
        const file = safeDownloadName(this.getAttribute('download'));
        attrs += file ? ` download="${this.escapeHtml(file)}"` : ' download';
      }
      return `<a class="${cls}"${attrs}${named}>${inner}</a>`;
    }
    const rawType = this.getAttribute('type');
    const type = TYPES.includes(rawType) ? rawType : 'button';
    return `<button class="${cls}" type="${type}"${named}>${inner}</button>`;
  }

  /** `action-button@1` only (never `button@1`); same structure check as td-button + the name agreement. */
  canHydrate() {
    if (!this._ssrMatches('action-button', TdActionButton.SSR_SCHEMA)) return false;
    return this._markupMatches();
  }

  canRebind() {
    return this._markupMatches();
  }

  /** @private The single `.td-btn` child = render()'s structure, allowlisted attributes, aria-label = data-tooltip = _name(). */
  _markupMatches() {
    const r = this._resolved();
    if (!r) return false;
    const kids = contentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1 || !kids[0].classList.contains('td-btn')) return false;
    const live = kids[0];
    const name = this._name(r);
    if (live.getAttribute('aria-label') !== name || live.getAttribute('data-tooltip') !== name) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    return sameControlStructure(live, tpl.content.firstElementChild, { partAttrs: ACTION_PARTS });
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'label' || name === 'aria-label') {
      // In place (same node, focus kept) while the control exists and still resolves; else a render.
      const ctl = this._control();
      if (ctl && this._resolved()) {
        if (tdTooltip.currentElement === ctl && tdTooltip.isVisible) tdTooltip.hide();
        this._syncState();
      } else this._doRender();
      return;
    }
    if (name === 'action' || name === 'tone' || name === 'size' || name === 'icon') { this._doRender(); return; }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  /** TdButton's in-place state, then the name: TdButton removes the control's aria-label when the host has none. */
  _syncState() {
    super._syncState();
    const btn = this._control();
    if (!btn) return;
    const name = this._name();
    if (!name) return;
    btn.setAttribute('aria-label', name);
    btn.setAttribute('data-tooltip', name);
  }
}

if (!customElements.get('td-action-button')) {
  customElements.define('td-action-button', TdActionButton);
}
