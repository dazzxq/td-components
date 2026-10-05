// Loaded by contrast.spec.mjs: buttons + toasts rendered over a backdrop (v0.20.0 solid buttons; v0.21.0 pastel toasts).
import '/src/form/td-button.js';
import { TdToast } from '/src/feedback/td-toast.js';
import '/src/feedback/td-alert.js';
import '/src/display/td-media-grid.js';
import { TdLightbox } from '/src/feedback/td-lightbox.js';
import { fillIconSlots, tdIcon } from '/src/icons/td-icon.js';
import '/src/form/td-otp-input.js';
import '/src/display/td-copy.js';
import '/src/form/td-dropzone.js';
import '/src/form/td-tree.js';
import '/src/form/td-tree-select.js';
import { createCheckMark } from '/src/utils/check-mark.js';
import '/src/form/td-repeater.js';
import '/src/form/td-number-input.js';
import '/src/display/td-sortable.js';
import '/src/display/td-masked-value.js';
import '/src/display/td-table.js';
import '/src/form/td-media-field.js';
import '/src/form/td-media-gallery.js';
import '/src/form/td-cropper.js';
import '/src/form/td-scan-input.js';
import '/src/display/td-filter-chips.js';
import '/src/form/td-datetime-range.js';
import '/src/display/td-steps.js';
import '/src/display/td-timeline.js';
import { TdModal } from '/src/feedback/td-modal.js';
import { TdMediaPicker } from '/src/feedback/td-media-picker.js';
import { createMockAdapter } from '/test/fixtures/media-adapter.js';
// v0.41.0 (M0): ONE colour parser for every pair below — understands color(srgb …) (0..1 channels) next to rgb()/rgba()
import { over as overRgb } from '/test/tokens/color-parse.js';

const VARIANTS = ['primary', 'secondary', 'success', 'danger', 'info', 'warning'];
const TOASTS = ['success', 'error', 'warning', 'info'];
export const CASES = [];
for (const v of VARIANTS) for (const state of ['rest', 'disabled', 'loading']) CASES.push({ kind: 'button', v, state });
// icon + label buttons (v0.14.3 review): the icon ink is gated too — rest ≥ 3.2:1, disabled greyed out ≥ 2.2:1
for (const v of ['primary', 'secondary']) for (const state of ['icon', 'disabled-icon']) CASES.push({ kind: 'button', v, state });
for (const t of TOASTS) CASES.push({ kind: 'toast', v: t, state: 'rest' });
// v0.20.0 review: the REAL hover (darker solid fill, color-mix 92 % with #000) — the spec moves the mouse onto the
// button before the screenshot, so the sample is the computed hover output, not a model of it.
for (const v of VARIANTS) CASES.push({ kind: 'button', v, state: 'hover' });
// .td-btn--custom (color / text-color): a dark colour (auto white text) and a light one (auto dark text), rest + hover.
for (const color of ['#1e3a8a', '#fde047']) {
  for (const state of ['rest', 'hover']) CASES.push({ kind: 'button', v: 'custom', color, state });
}
// v0.17.0 ghost buttons sit on the PAGE background, never on a photo: measured only over the theme's page colour
// (white in light, black in dark) — `pageOnly` (contrast.spec.mjs skips the other backdrops).
for (const state of ['rest', 'disabled', 'loading', 'icon']) CASES.push({ kind: 'button', v: 'ghost', state, pageOnly: true });
// v0.18.0 F5: alerts and badges live in the content layer (solid fills on the page) → page colour only, like ghost.
// Alert: message + heading text ≥ 4.7, icon + close ≥ 3.2 on the variant fill. Badge: text ≥ 4.7 on its soft fill,
// and on the page for --outline / --stamp (transparent).
for (const v of ['info', 'success', 'warning', 'danger']) CASES.push({ kind: 'alert', v, state: 'rest', pageOnly: true });
for (const v of ['neutral', 'accent', 'success', 'warning', 'danger', 'info']) {
  for (const state of ['soft', 'outline', 'stamp']) CASES.push({ kind: 'badge', v, state, pageOnly: true });
  // v0.25.0: PHP td_badge `icon` — the decorative icon (currentColor) ≥ 3.2:1 on the soft fill, label ≥ 4.7 as before
  CASES.push({ kind: 'badge', v, state: 'icon', pageOnly: true });
}
// v0.21.0: the black tooltip chip (default + start-aligned text) over every backdrop.
for (const state of ['rest', 'start']) CASES.push({ kind: 'tooltip', v: 'default', state });
// v0.21.0 P8: the lighter field focus border must stay ≥ 3:1 (WCAG 1.4.11) against the field fill and the page —
// measured from computed colours (no screenshot): `pairs` in the returned info.
for (const v of ['input-field', 'dropdown']) CASES.push({ kind: 'focus', v, state: 'focus', pageOnly: true });
// v0.22.0: the dropdown create row (accent label + plus icon) on the translucent menu surface, over every backdrop —
// at rest and active (keyboard / hover fill).
for (const state of ['rest', 'active']) CASES.push({ kind: 'dropdown-create', v: 'create', state });
// …and the static fallback used where color-mix() is unsupported (forced onto the row through CSSOM).
for (const state of ['rest', 'active']) CASES.push({ kind: 'dropdown-create', v: 'create-fallback', state });
// v0.23.0: the td-media-grid tick, off (shown while selecting) and on (selected), over the worst-case images (pure white
// and pure black): its edge (white border over a dark image, thin dark ring over a light one) ≥ 3:1, and the glyph of the
// solid "on" tick ≥ 3.2:1 on its fill — computed colours (`pairs`), light + dark theme.
for (const v of ['off', 'on']) for (const state of ['light-image', 'dark-image']) CASES.push({ kind: 'media-tick', v, state, pageOnly: true });
// v0.24.0: the lightbox side-nav disc over the worst-case photos (pure white / pure black): the disc stands out from a
// white photo (fill ≥ 3:1), its light edge from a black one (≥ 3:1), the chevron ≥ 3.2:1 on the disc over either; and the
// current filmstrip thumb's ring ≥ 3:1 against the strip (the viewer backdrop over a white page — the lighter case).
for (const state of ['light-image', 'dark-image']) CASES.push({ kind: 'lb-disc', v: 'next', state, pageOnly: true });
CASES.push({ kind: 'lb-thumb', v: 'current', state: 'ring', pageOnly: true });
// v0.27.0: td-otp-input cells (digit ≥ 4.7 on the cell; the cell edge ≥ 3:1 at rest, active and in error — WCAG 1.4.11),
// the td-copy icon button (icon ≥ 3.2:1 on the page at rest, copied and in error) and the skeleton block (no text: it
// only has to stay visible on the page / a surface, ≥ 1.05:1) — computed colours (`pairs`), light + dark.
for (const state of ['rest', 'active', 'error']) CASES.push({ kind: 'otp', v: 'cell', state, pageOnly: true });
for (const state of ['rest', 'copied', 'error']) CASES.push({ kind: 'copy', v: 'button', state, pageOnly: true });
// v0.36.0 toast/OTP: solid toast colours (plan QĐ 18 / 20) from computed colours — ink ≥ 4.7 on the fill, the ink on the
// close button's hover wash (composited over the fill) ≥ 3.2; + OTP letters (charset alphanumeric) ≥ 4.7 on the cell.
for (const t of TOASTS) CASES.push({ kind: 'toast-pairs', v: t, state: 'solid', pageOnly: true });
CASES.push({ kind: 'otp', v: 'cell', state: 'alpha', pageOnly: true });
CASES.push({ kind: 'skeleton', v: 'block', state: 'rest', pageOnly: true });
// v0.28.0: td-chip-input multi-select rows on the translucent menu surface, over every backdrop: a SELECTED row (label
// ≥ 4.7, the ✓ ≥ 3.2) at rest and active (keyboard highlight fill), and a LOCKED row (aria-disabled: greyed out on
// purpose, label ≥ 2.2 like a disabled button).
for (const state of ['rest', 'active']) CASES.push({ kind: 'chip-multi', v: 'selected', state });
CASES.push({ kind: 'chip-multi', v: 'locked', state: 'disabled' });
// v0.29.0: td-tree rows (content layer → page only): the SELECTED row label ≥ 4.7 on its fill, a LOCKED row ≥ 2.2 (greyed
// on purpose, like a disabled control); the td-tree-select popup rows on the translucent menu over every backdrop (the
// ACTIVE row and a SELECTED one, label ≥ 4.7); the multiple check box (MIXED / checked: glyph ≥ 3.2 on its fill, fill
// ≥ 3:1 vs the page) and the treeitem focus ring (≥ 3:1 vs the page) — computed colours (`pairs`), light + dark.
CASES.push({ kind: 'tree', v: 'selected', state: 'rest', pageOnly: true });
CASES.push({ kind: 'tree', v: 'locked', state: 'disabled', pageOnly: true });
for (const v of ['active', 'selected']) CASES.push({ kind: 'tree-popup', v, state: 'rest' });
for (const state of ['mixed', 'checked', 'focus']) CASES.push({ kind: 'tree-pairs', v: 'tree', state, pageOnly: true });
// v0.30.0: td-repeater action buttons (ghost icons, content layer → page only): an enabled ↑ / ↓ / × icon ≥ 3.2 on the
// page, an aria-disabled one (boundary) ≥ 2.2 like a disabled control, the aria-disabled add button label ≥ 2.2 on its
// fill — computed colours (`pairs`), light + dark.
for (const state of ['rest', 'disabled', 'add-disabled']) CASES.push({ kind: 'repeater', v: 'buttons', state, pageOnly: true });
// v0.30.0: td-number-input (content layer → page only): the prefix / suffix text ≥ 4.7 on the box fill, the focus border of
// the box (`:focus-within`) ≥ 3:1 vs the box fill and the page — computed colours (`pairs`), light + dark.
for (const state of ['affix', 'focus']) CASES.push({ kind: 'number', v: 'box', state, pageOnly: true });
// v0.31.0: td-sortable / td-repeater[sortable] drag handle (ghost icon, content layer → page only): icon ≥ 3.2 at rest and
// hover (hover fill composited on the page), aria-disabled ≥ 2.2 like a disabled control, on its solid chip in the gallery
// recipe; the placeholder border and the lifted outline ≥ 3:1 vs the page, --td-color-bg and --td-color-surface;
// td-masked-value text ≥ 4.7 masked and revealed, toggle icon ≥ 3.2 — computed colours (`pairs`), light + dark.
for (const state of ['rest', 'hover', 'disabled', 'gallery', 'placeholder', 'lifted']) CASES.push({ kind: 'sortable', v: 'handle', state, pageOnly: true });
for (const state of ['masked', 'revealed', 'toggle']) CASES.push({ kind: 'masked', v: 'value', state, pageOnly: true });
// v0.34.0 td-table card mode: cell label (muted) + value on the card fill, sort chip label on its fill — ≥ 4.7, light + dark.
for (const state of ['label', 'value', 'sort-chip']) CASES.push({ kind: 'table-card', v: 'card', state, pageOnly: true });
// v0.36.1: the `lead` (muted id before the primary, xs mouse / sm coarse — same colour) ≥ 4.7 on the card, and an icon-only
// card action: icon ≥ 3:1 on the button fill — light + dark.
for (const state of ['lead', 'action-icon']) CASES.push({ kind: 'table-card', v: 'card', state, pageOnly: true });
// v0.37.0 td-table row selection: cell text on the selected-row tint (and with the hover wash on top) ≥ 4.7 over the
// table fill; the selected card's accent border ≥ 3 vs the page — computed colours (`pairs`), light + dark.
for (const state of ['row', 'card']) CASES.push({ kind: 'table-select', v: 'selected', state, pageOnly: true });
// v0.37.0 review ISSUE-5: pressed selection controls (data-td-pressed = the real pressed rule) — the card chip label ≥ 4.7
// and the ticked mark fill ≥ 3 on the pressed fill, the pressed fill differs from rest — light + dark.
for (const state of ['row-pressed', 'chip-pressed']) CASES.push({ kind: 'table-select', v: 'selected', state, pageOnly: true });
// v0.39.0 (plan v0.39.0-filters-range M4): td-filter-chips — chip label (bold) + value ≥ 4.7 on the chip fill, × icon ≥ 3.2
// on the chip fill and on its hover / pressed fills, chip edge vs page; the td-table "Cột" ghost button label ≥ 4.7 vs the
// page, rest + pressed — computed colours (`pairs`), light + dark.
for (const state of ['chip', 'remove-hover', 'remove-pressed', 'columns-btn']) CASES.push({ kind: 'v039', v: 'filters', state, pageOnly: true });
// v0.45.0 (plan v0.45.0-steps-timeline M5): td-steps — number ≥ 4.7 on the current / upcoming discs, ✓ / ! icons ≥ 3.2 on
// the done / error discs, the current ring and the upcoming disc edge ≥ 3 vs the page (WCAG 1.4.11), label / description /
// error description / summary ≥ 4.7 and the disabled label ≥ 2.2 on the page, a clickable step label ≥ 4.7 on its pressed
// fill; td-timeline — day heading, title, link, actor, time, meta, detail text, summary ≥ 4.7 on the page (summary also on
// its pressed fill), the neutral + four tone icons ≥ 3.2 on their discs — computed colours (`pairs`), light + dark.
for (const state of ['markers', 'text', 'pressed']) CASES.push({ kind: 'v045', v: 'steps', state, pageOnly: true });
for (const state of ['text', 'tones', 'summary']) CASES.push({ kind: 'v045', v: 'timeline', state, pageOnly: true });
// v0.36.0 colours/action-button (plan QĐ 12, 18–26): computed-colour pairs (page only, light + dark). Solid semantic
// tokens: label vs fill and vs hover ≥ 4.7 (buttons / badges read them); badge -ink (outline / stamp) vs the page ≥ 4.7;
// badge edge vs its own fill / white / #f4f4f5 ≥ 1.6 (light theme); alert icon vs the alert fill ≥ 3.2 and the
// inline-start bar vs the fill ≥ 3; td-action-button icon (3 tones) vs the page and vs its hover fill (composited on the
// page) ≥ 4.7.
for (const v of ['success', 'danger', 'warning', 'info']) CASES.push({ kind: 'v036', v, state: 'solid', pageOnly: true });
for (const v of ['neutral', 'accent', 'success', 'danger', 'warning', 'info']) CASES.push({ kind: 'v036', v, state: 'badge', pageOnly: true });
for (const v of ['info', 'success', 'warning', 'danger']) CASES.push({ kind: 'v036', v, state: 'alert', pageOnly: true });
for (const v of ['standard', 'warning', 'danger']) CASES.push({ kind: 'v036', v, state: 'action-button', pageOnly: true });
// v0.36.0 popup option rows (dcms2): the keyboard-active row's inline-start bar ≥ 3:1 vs the popup surface, the label ≥ 4.7
// on the active / selected fills (composited on the surface)
for (const v of ['active', 'selected']) CASES.push({ kind: 'v036', v, state: 'option-row' });
// v0.36.2 pressed states (ADR 0019, plan M2): the REAL pressed rule (a control carrying data-td-pressed, the attribute
// ensurePressStates() sets for touch / pen) — computed colours: every td-button variant + ghost label ≥ 4.7 on its
// pressed fill (composited on the page), td-action-button icon (3 tones) ≥ 4.7 on its pressed fill, a popup option
// row label ≥ 4.7 on the pressed fill (composited on the popup surface) — light + dark.
for (const v of ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'ghost']) CASES.push({ kind: 'v0362', v, state: 'btn-pressed', pageOnly: true });
for (const v of ['standard', 'warning', 'danger']) CASES.push({ kind: 'v0362', v, state: 'action-pressed', pageOnly: true });
CASES.push({ kind: 'v0362', v: 'option', state: 'option-pressed', pageOnly: true });
// v0.36.2 review ISSUE-1: the toast surface (tap = dismiss) and the dropzone zone (tap = file picker) are pressed too —
// toast text ≥ 4.7 and close glyph ≥ 3.2 on the pressed fill per type; dropzone title / sub-line ≥ 4.7 on its pressed fill.
for (const t of TOASTS) CASES.push({ kind: 'v0362', v: t, state: 'toast-pressed', pageOnly: true });
CASES.push({ kind: 'v0362', v: 'dropzone', state: 'dropzone-pressed', pageOnly: true });
// v0.38.0 td-scan-input (content layer → page only): the indicator text "Sẵn sàng quét" (focused, success colour) and
// "Bấm vào đây để quét" (idle) ≥ 4.7 on the page, also on its pressed fill; a list row's error message, the "Đã quét: n"
// count and a valid row's state ≥ 4.7 on the list surface; the field edge ≥ 3:1 — computed colours, light + dark.
for (const state of ['ready', 'idle', 'pressed', 'ready-pressed', 'row-error', 'row-valid', 'count']) CASES.push({ kind: 'scan', v: 'scan-input', state, pageOnly: true });
// v0.40.0 td-datetime-range (dialog surface → page only): a preset chip text ≥ 4.7 on its fill, the pressed preset
// (aria-pressed) text ≥ 4.7 on the primary fill, also on its touch-pressed fill; the switch tab label / value ≥ 4.7 on the
// switch track (off) and on the white "on" tab; the pair error line ≥ 4.7 on the dialog surface — computed colours.
for (const state of ['preset', 'preset-on', 'preset-on-pressed', 'tab-off', 'tab-on', 'pair-error']) CASES.push({ kind: 'dtr', v: 'datetime-range', state, pageOnly: true });
// v0.32.0: td-media-field (content layer → page only): prompt + ratio text ≥ 4.7 on the empty frame fill, the empty-frame
// icon + dashed border ≥ 3.2 (border vs the page and vs the frame fill), the "Video" badge text ≥ 4.7 on its fill, the
// field error text ≥ 4.7 on the page; td-media-picker (inside the solid dialog): tile name, detail meta label and tray
// count ≥ 4.7 on the dialog surface, the selected tile border ≥ 3.2 vs the dialog surface — computed colours (`pairs`).
for (const state of ['empty', 'video', 'error']) CASES.push({ kind: 'media-field', v: 'frame', state, pageOnly: true });
// v0.43.0: td-media-gallery (content layer → page only): the empty Add prompt / ratio ≥ 4.7 and its icon ≥ 3.2 on the
// muted fill, the dashed edge ≥ 3.2 vs the page and the fill; the count line ≥ 4.7 on the page; tile buttons / handle
// icon ≥ 3.2 on their surface; the cover badge ≥ 4.7; the alt placeholder ≥ 4.5 (plan QĐ 11) on the input; the broken
// note ≥ 4.7 — computed colours (`pairs`), light + dark.
for (const state of ['empty', 'filled', 'broken']) CASES.push({ kind: 'media-gallery', v: 'gallery', state, pageOnly: true });
// v0.33.0 (dcms2 parity): the picker card state borders (hover / viewing / checked tokens) ≥ 3:1 vs the card surface and
// the list background (WCAG 1.4.11), card name + meta text, the `.td-media-picker__label` muted label, the cursor page info,
// the footer count, the `td-pagination` "Hiển thị…" text ('pages' mode) and the upload dialog dropzone texts + badges ≥ 4.7.
for (const v of ['cards', 'pages', 'upload']) CASES.push({ kind: 'media-picker', v, state: 'rest', pageOnly: true });
// v0.35.0: td-cropper over the worst-case images (flat white / flat black): the frame line and the handle fill vs the
// DIMMED image right outside the box, the handle edge (fill or dark border, whichever faces the image) and the focal ring
// (white ring or its dark contrast line) vs the image, the keyboard focus outline vs the dimmed image — ≥ 3:1 (WCAG
// 1.4.11); the focus ring is two-tone (light ring on the dim; corners: light ring over a dark halo) — computed colours
// (`pairs`) composited in the page, light + dark.
for (const state of ['light-image', 'dark-image']) CASES.push({ kind: 'cropper', v: 'frame', state, pageOnly: true });
// v0.44.0: TdModal.confirm({ typeToConfirm }) — the label, the phrase (<strong>), the typed text and the mismatch error
// vs the dialog surface, ≥ 4.7 (computed colours composited, light + dark).
for (const state of ['label', 'mismatch']) CASES.push({ kind: 'type-confirm', v: 'modal', state, pageOnly: true });

const stage = document.getElementById('stage');
const bd = document.getElementById('backdrop');

/** Backdrop: black | white | checker | photo (CSSOM only — the page runs under a strict CSP). Resolves once the photo
 *  is decoded (a missing / undecodable photo throws, so the gate can never sample an empty backdrop). */
async function setBackdrop(kind) {
  bd.style.removeProperty('background');
  bd.replaceChildren();
  if (kind === 'black') bd.style.setProperty('background', '#000');
  else if (kind === 'white') bd.style.setProperty('background', '#fff');
  else if (kind === 'checker') bd.style.setProperty('background', 'repeating-conic-gradient(#000 0 25%, #fff 0 50%) 0 0 / 8px 8px');
  else if (kind === 'theme-bg') bd.style.setProperty('background', 'var(--td-color-bg)'); // v0.41.0
  else if (kind === 'theme-surface') bd.style.setProperty('background', 'var(--td-color-surface)');
  else {
    const img = document.createElement('img');
    img.src = '/test/fixtures/photo.svg';
    img.alt = '';
    img.className = 'photo';
    bd.appendChild(img);
    await img.decode();
  }
}

/** Build case i; `hideInk` makes text/icons transparent (for the background sample). Returns geometry + colours. */
window.__contrastSetup = async (i, theme, backdrop, hideInk) => {
  const c = CASES[i];
  document.documentElement.toggleAttribute('data-td-theme', false);
  if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
  await setBackdrop(backdrop);
  stage.replaceChildren();
  for (const h of document.querySelectorAll('td-media-picker')) { if (h.isOpen) h.close(); h.remove(); }
  document.querySelectorAll('body > .td-media-picker, body > .td-media-picker-upload').forEach((n) => n.remove());
  document.querySelectorAll('#td-toast-container').forEach((n) => n.remove());
  TdToast._activeToasts = [];
  let el;
  let parts = {};
  if (c.kind === 'button') {
    const host = document.createElement('td-button');
    if (c.color) host.setAttribute('color', c.color);
    else host.setAttribute('variant', c.v);
    host.textContent = 'Lưu thay đổi';
    if (c.state === 'disabled' || c.state === 'disabled-icon') host.setAttribute('disabled', '');
    if (c.state.endsWith('icon')) host.setAttribute('icon', 'download');
    if (c.state === 'loading') host.setAttribute('loading', '');
    stage.appendChild(host);
    el = host.querySelector('button');
    parts = { label: el.querySelector('.td-btn__label'), spinner: el.querySelector('.td-btn__spinner'), icon: el.querySelector('.td-btn__icon') };
  } else if (c.kind === 'alert') {
    const host = document.createElement('td-alert');
    host.setAttribute('variant', c.v);
    host.setAttribute('heading', 'Tiêu đề thông báo');
    host.setAttribute('dismissible', '');
    host.textContent = 'Đã lưu thay đổi của bạn';
    stage.appendChild(host);
    el = host.querySelector('.td-alert');
    parts = { label: el.querySelector('.td-alert__message'), heading: el.querySelector('.td-alert__heading'), icon: el.querySelector('.td-alert__icon'), close: el.querySelector('.td-alert__close') };
  } else if (c.kind === 'badge') {
    el = document.createElement('span');
    el.className = `td-badge td-badge--${c.v}${c.state === 'soft' || c.state === 'icon' ? '' : ` td-badge--${c.state}`}`;
    if (c.state === 'icon') {
      // the exact td_badge('Đã duyệt', ['icon' => 'check']) markup
      const icon = document.createElement('span');
      icon.className = 'td-badge__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(tdIcon('check', { size: 's' }));
      const label = document.createElement('span');
      label.className = 'td-badge__label';
      label.textContent = 'Đã duyệt';
      el.append(icon, label);
      stage.appendChild(el);
      parts = { label, icon };
    } else {
      el.textContent = 'Đã duyệt';
      stage.appendChild(el);
      parts = { label: el };
    }
  } else if (c.kind === 'tooltip') {
    el = document.createElement('div');
    el.className = 'td-tooltip td-glass-surface td-glass-surface--strong';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('data-state', 'open');
    el.setAttribute('data-placement', 'top');
    if (c.state === 'start') el.setAttribute('data-align', 'start');
    const content = document.createElement('span');
    content.className = 'td-tooltip__content';
    content.textContent = 'Lưu thay đổi của bạn vào hồ sơ';
    el.appendChild(content);
    el.style.setProperty('top', '96px');
    el.style.setProperty('left', '48px');
    stage.appendChild(el);
    parts = { label: content };
  } else if (c.kind === 'dropdown-create') {
    const menu = document.createElement('div');
    menu.className = 'td-dropdown__menu td-glass-surface td-glass-surface--strong';
    menu.setAttribute('data-state', 'open');
    menu.style.setProperty('top', '96px');
    menu.style.setProperty('left', '48px');
    menu.style.setProperty('width', '280px');
    const listbox = document.createElement('div');
    listbox.className = 'td-dropdown__options';
    listbox.setAttribute('role', 'listbox');
    const scroller = document.createElement('div');
    scroller.className = 'td-dropdown__scroller';
    const opt = document.createElement('div');
    opt.className = 'td-dropdown__option';
    opt.textContent = 'Kodak Gold';
    scroller.appendChild(opt);
    el = document.createElement('div');
    el.className = 'td-dropdown__option td-dropdown__option--create';
    el.setAttribute('role', 'option');
    if (c.state === 'active') el.setAttribute('data-active', '');
    if (c.v === 'create-fallback') menu.style.setProperty('--td-dropdown-create-fg', 'var(--td-dropdown-create-fg-fallback)');
    const icon = document.createElement('span');
    icon.className = 'td-dropdown__create-icon';
    icon.setAttribute('data-td-icon', 'plus');
    const label = document.createElement('span');
    label.className = 'td-dropdown__option-label';
    label.textContent = 'Thêm film mới';
    el.append(icon, label);
    listbox.append(scroller, el);
    menu.appendChild(listbox);
    stage.appendChild(menu);
    fillIconSlots(el);
    parts = { label, icon };
  } else if (c.kind === 'chip-multi') {
    // the real rendered shape of a td-chip-input selection-only row (_renderSelRows), state set as the component does
    const menu = document.createElement('div');
    menu.className = 'td-chip-input__menu td-glass-surface td-glass-surface--strong';
    menu.setAttribute('data-state', 'open');
    menu.style.setProperty('top', '96px');
    menu.style.setProperty('left', '48px');
    menu.style.setProperty('width', '280px');
    const listbox = document.createElement('div');
    listbox.className = 'td-chip-input__options';
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-multiselectable', 'true');
    el = document.createElement('div');
    el.className = 'td-chip-input__option';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', c.v === 'selected' ? 'true' : 'false');
    if (c.v === 'locked') el.setAttribute('aria-disabled', 'true');
    if (c.state === 'active') el.setAttribute('data-active', '');
    // v0.36.0 (ADR 0017): the shared td-checkbox mark — its own pairs are gated by the tree-pairs cases (same CSS)
    const check = createCheckMark('sm');
    check.classList.add('td-chip-input__check');
    const label = document.createElement('span');
    label.className = 'td-chip-input__option-label';
    label.textContent = 'Nguyễn Văn An';
    el.append(check, label);
    listbox.appendChild(el);
    menu.appendChild(listbox);
    stage.appendChild(menu);
    fillIconSlots(el);
    parts = { label };
  } else if (c.kind === 'tree') {
    const t = document.createElement('td-tree');
    t.setAttribute('aria-label', 'Danh mục');
    t.setAttribute('selection', 'single');
    stage.appendChild(t);
    t.data = [{ value: 'a', label: 'Điện thoại di động' }, { value: 'b', label: 'Phụ kiện đã khoá', disabled: true }];
    t.value = 'a';
    const li = t.querySelector(c.v === 'selected' ? '[aria-selected="true"]' : '[aria-disabled="true"]');
    if (!li) throw new Error(`tree ${c.v}: row not found`);
    el = li.querySelector('.td-tree__row');
    parts = { label: el.querySelector('.td-tree__label') };
  } else if (c.kind === 'tree-popup') {
    const s = document.createElement('td-tree-select');
    s.setAttribute('aria-label', 'Danh mục');
    s.setAttribute('searchable', 'false');
    stage.appendChild(s);
    s.data = [{ value: 'a', label: 'Điện thoại di động' }, { value: 'b', label: 'Máy tính bảng' }];
    if (c.v === 'selected') s.value = 'b';
    s.open();
    const combo = s.querySelector('[role="combobox"]');
    combo.focus();
    // selected: move the keyboard highlight away so the row only carries the selected fill
    if (c.v === 'selected') combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    const li = s._menuElement.querySelector(c.v === 'active' ? '[role="treeitem"][data-active]' : '[role="treeitem"][aria-selected="true"]');
    if (!li || (c.v === 'selected' && li.hasAttribute('data-active'))) throw new Error(`tree-popup ${c.v}: row not found`);
    el = li.querySelector('.td-tree__row');
    parts = { label: el.querySelector('.td-tree__label') };
  } else if (c.kind === 'tree-pairs') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--td-color-bg)');
    stage.appendChild(probe);
    const themeBg = getComputedStyle(probe).color;
    probe.remove();
    const t = document.createElement('td-tree');
    t.setAttribute('aria-label', 'Quyền');
    let pairs;
    let target;
    if (c.state === 'focus') {
      t.setAttribute('selection', 'single');
      stage.appendChild(t);
      t.data = [{ value: 'a', label: 'Bài viết' }, { value: 'b', label: 'Người dùng' }];
      const li = t.querySelector('[role="treeitem"][tabindex="0"]');
      li.focus();
      await new Promise((r) => setTimeout(r, 50));
      target = li.querySelector('.td-tree__row');
      const shadow = getComputedStyle(target).boxShadow;
      // v0.41.0: the ring is two layers (1px surface gap + solid ring) — the OUTERMOST (last) colour is the indicator
      const ring = (String(shadow).match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).pop();
      if (!ring || !li.matches(':focus-visible')) throw new Error(`tree focus: no visible ring (${shadow})`);
      pairs = [
        { what: 'focus ring vs page', fg: ring, bg: page },
        { what: 'focus ring vs --td-color-bg', fg: ring, bg: themeBg },
      ];
    } else {
      t.setAttribute('selection', 'multiple');
      t.setAttribute('cascade', '');
      stage.appendChild(t);
      t.data = [{ value: 'p', label: 'Bài viết', expanded: true, children: [{ value: 'r', label: 'Xem' }, { value: 'w', label: 'Sửa' }] }];
      t.value = c.state === 'mixed' ? ['r'] : ['r', 'w'];
      const li = t.querySelector(`[role="treeitem"][aria-checked="${c.state === 'mixed' ? 'mixed' : 'true'}"]`);
      if (!li) throw new Error(`tree ${c.state}: row not found`);
      target = li.querySelector('.td-tree__check');
      const cs = getComputedStyle(target);
      // v0.36.0: the shared mark — ✓ = its svg (on), the indeterminate bar = its ::after (mixed)
      const glyph = c.state === 'mixed' ? getComputedStyle(target, '::after').backgroundColor : getComputedStyle(target.querySelector('svg')).color;
      pairs = [
        { what: 'check glyph vs fill', fg: glyph, bg: cs.backgroundColor, min: 3.2 },
        { what: 'check fill vs page', fg: cs.backgroundColor, bg: page },
        { what: 'check fill vs --td-color-bg', fg: cs.backgroundColor, bg: themeBg },
      ];
    }
    const b = target.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `tree-pairs:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'media-tick') {
    const image = c.state === 'light-image' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
    const grid = document.createElement('td-media-grid');
    for (const id of ['a', 'b']) {
      const item = document.createElement('div');
      item.setAttribute('data-td-media-item', '');
      item.setAttribute('data-id', id);
      const open = document.createElement('button');
      open.type = 'button';
      open.setAttribute('data-td-media-open', '');
      open.setAttribute('aria-label', `Khung ${id}`);
      const pic = document.createElement('span');
      pic.style.setProperty('display', 'block');
      pic.style.setProperty('width', '160px');
      pic.style.setProperty('height', '120px');
      pic.style.setProperty('background', image);
      open.appendChild(pic);
      item.appendChild(open);
      grid.appendChild(item);
    }
    stage.appendChild(grid);
    grid.select(['a']); // host [data-selecting]: every tick shown; 'a' = on, 'b' = off
    await new Promise((r) => setTimeout(r, 400)); // opacity / fill transitions
    const tickBtn = grid.querySelector(`[data-id="${c.v === 'on' ? 'a' : 'b'}"] .td-media-grid__tick`);
    if (getComputedStyle(tickBtn).opacity !== '1') throw new Error(`media tick ${c.v}: opacity ${getComputedStyle(tickBtn).opacity} (must be shown to be measured)`);
    // v0.36.0 (ADR 0017): the visible tick is the shared mark (.td-check--on-media) inside the transparent button
    const tick = tickBtn.querySelector('.td-check');
    const tcs = getComputedStyle(tick);
    const ring = (tcs.boxShadow.match(/rgba?\([^)]*\)|color\([^)]*\)/) || [])[0] || 'rgba(0, 0, 0, 0)';
    const over = overRgb;
    const fill = c.v === 'on' ? tcs.backgroundColor : tcs.backgroundColor; // off = the white box
    const pairs = [c.state === 'dark-image'
      ? { what: 'tick box vs dark image', fg: fill, bg: image }
      : { what: 'tick hairline vs light image', fg: over(ring, image), bg: image }];
    if (c.v === 'on') pairs.push({ what: 'tick glyph vs on fill', fg: getComputedStyle(tick.querySelector('svg')).color, bg: tcs.backgroundColor, min: 3.2 });
    const r0 = tick.getBoundingClientRect();
    return {
      rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `media-tick:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'lb-disc' || c.kind === 'lb-thumb') {
    const over = overRgb;
    const IMGS = ['/test/fixtures/1.svg', '/test/fixtures/2.svg', '/test/fixtures/3.svg'];
    TdLightbox.open(IMGS, { filmstrip: c.kind === 'lb-thumb' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 300)); // opacity / colour transitions
    const ov = document.querySelector('.td-lightbox');
    let pairs;
    let box;
    if (c.kind === 'lb-disc') {
      const btn = ov.querySelector('.td-lightbox__nav > [data-action="next"]');
      if (!btn) throw new Error('lightbox next button is not in the side nav (fine pointer expected)');
      const disc = getComputedStyle(btn, '::before');
      const chevron = getComputedStyle(btn.querySelector('.td-lightbox__icon')).color;
      const image = c.state === 'light-image' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
      const onImage = over(disc.backgroundColor, image);
      pairs = [
        c.state === 'light-image'
          ? { what: 'disc fill vs white photo', fg: disc.backgroundColor, bg: image }
          : { what: 'disc edge vs black photo', fg: disc.borderTopColor, bg: image },
        { what: 'chevron vs disc', fg: chevron, bg: onImage, min: 3.2 },
      ];
      box = btn.getBoundingClientRect();
    } else {
      const thumb = ov.querySelector('.td-lightbox__thumb[aria-current="true"]');
      const strip = ov.querySelector('.td-lightbox__filmstrip');
      const backdrop = getComputedStyle(ov.querySelector('.td-lightbox__backdrop')).backgroundColor;
      const stripBg = over(getComputedStyle(strip).backgroundColor, over(backdrop, 'rgb(255, 255, 255)'));
      const tcs = getComputedStyle(thumb);
      if (tcs.opacity !== '1') throw new Error(`current thumb opacity ${tcs.opacity}`);
      pairs = [{ what: 'current thumb ring vs strip', fg: tcs.borderTopColor, bg: stripBg }];
      box = thumb.getBoundingClientRect();
    }
    TdLightbox.close();
    return {
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `${c.kind}:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'number') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--td-color-bg)');
    stage.appendChild(probe);
    const themeBg = getComputedStyle(probe).color;
    probe.remove();
    const host = document.createElement('td-number-input');
    host.setAttribute('aria-label', 'Giá');
    host.setAttribute('prefix', '$');
    host.setAttribute('suffix', '₫');
    host.setAttribute('value', '12990000');
    stage.appendChild(host);
    const box = host.querySelector('.td-number__box');
    const input = host.querySelector('input');
    let pairs;
    if (c.state === 'focus') {
      input.focus();
      await new Promise((r) => setTimeout(r, 300)); // border transition
      const cs = getComputedStyle(box);
      if (!box.matches(':focus-within')) throw new Error('number: box not focused');
      pairs = [
        { what: 'focus border vs box fill', fg: cs.borderTopColor, bg: cs.backgroundColor },
        { what: 'focus border vs page', fg: cs.borderTopColor, bg: page },
        { what: 'focus border vs --td-color-bg', fg: cs.borderTopColor, bg: themeBg },
      ];
      input.blur();
    } else {
      await new Promise((r) => setTimeout(r, 300));
      const fill = getComputedStyle(box).backgroundColor;
      pairs = ['prefix', 'suffix'].map((k) => ({
        what: `${k} text vs box fill`, fg: getComputedStyle(host.querySelector(`.td-number__affix--${k}`)).color, bg: fill, min: 4.7,
      }));
      pairs.push({ what: 'value text vs box fill', fg: getComputedStyle(input).color, bg: fill, min: 4.7 });
    }
    const b = box.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `number:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'media-field') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const host = document.createElement('td-media-field');
    host.setAttribute('name', 'hero');
    host.setAttribute('label', 'Ảnh đại diện');
    host.setAttribute('aspect-ratio', '3/2');
    if (c.state === 'video') {
      host.setAttribute('accept-kind', 'video');
      host.setAttribute('kind', 'video');
      host.setAttribute('value', 'm4');
      host.setAttribute('preview-src', '/test/fixtures/4.svg');
      host.setAttribute('preview-alt', 'video-4.mp4');
    }
    if (c.state === 'error') {
      host.setAttribute('required', '');
      host.setAttribute('error-text', 'Vui lòng chọn ảnh.');
    }
    stage.appendChild(host);
    await new Promise((r) => setTimeout(r, 300));
    const open = host.querySelector('.td-media-field__open');
    const frame = host.querySelector('.td-media-field__frame');
    const fill = getComputedStyle(open).backgroundColor !== 'rgba(0, 0, 0, 0)' ? getComputedStyle(open).backgroundColor : getComputedStyle(frame).backgroundColor;
    let pairs;
    if (c.state === 'video') {
      const b = getComputedStyle(host.querySelector('.td-media-field__badge'));
      pairs = [{ what: 'Video badge text vs its fill', fg: b.color, bg: b.backgroundColor, min: 4.7 }];
    } else if (c.state === 'error') {
      pairs = [{ what: 'error text vs page', fg: getComputedStyle(host.querySelector('.td-field-error')).color, bg: page, min: 4.7 }];
    } else {
      const bc = getComputedStyle(frame).borderTopColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(frame).borderTopStyle !== 'none'
        ? getComputedStyle(frame).borderTopColor : getComputedStyle(open).borderTopColor;
      pairs = [
        { what: 'prompt text vs empty fill', fg: getComputedStyle(host.querySelector('.td-media-field__prompt')).color, bg: fill, min: 4.7 },
        { what: 'ratio text vs empty fill', fg: getComputedStyle(host.querySelector('.td-media-field__ratio')).color, bg: fill, min: 4.7 },
        { what: 'empty icon vs empty fill', fg: getComputedStyle(host.querySelector('.td-media-field__icon')).color, bg: fill, min: 3.2 },
        { what: 'dashed border vs page', fg: bc, bg: page, min: 3.2 },
        { what: 'dashed border vs empty fill', fg: bc, bg: fill, min: 3.2 },
      ];
    }
    const b = frame.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `media-field:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'media-gallery') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const host = document.createElement('td-media-gallery');
    host.setAttribute('name', 'g');
    host.setAttribute('label', 'Ảnh sản phẩm');
    host.setAttribute('aspect-ratio', '4/3');
    host.setAttribute('max', '10');
    if (c.state === 'filled') {
      for (const a of ['usage', 'croppable', 'cover']) host.setAttribute(a, '');
      host.setAttribute('items', JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }, { id: 'm11', kind: 'file', name: 'a.pdf' }]));
    }
    if (c.state === 'broken') host.setAttribute('items', '[');
    const wrap = document.createElement('div');
    wrap.style.setProperty('width', '480px');
    wrap.appendChild(host);
    stage.appendChild(wrap);
    await new Promise((r) => setTimeout(r, 300));
    const cs = (sel) => getComputedStyle(host.querySelector(sel));
    let pairs;
    let box;
    if (c.state === 'empty') {
      const add = host.querySelector('.td-media-gallery__add');
      const fill = getComputedStyle(add).backgroundColor;
      box = add;
      pairs = [
        { what: 'Add prompt vs its fill', fg: cs('.td-media-gallery__prompt').color, bg: fill, min: 4.7 },
        { what: 'Add ratio vs its fill', fg: cs('.td-media-gallery__ratio').color, bg: fill, min: 4.7 },
        { what: 'Add icon vs its fill', fg: cs('.td-media-gallery__add .td-media-gallery__icon').color, bg: fill, min: 3.2 },
        { what: 'Add dashed edge vs page', fg: getComputedStyle(add).borderTopColor, bg: page, min: 3.2 },
        { what: 'Add dashed edge vs its fill', fg: getComputedStyle(add).borderTopColor, bg: fill, min: 3.2 },
        { what: 'count vs page', fg: cs('.td-media-gallery__count').color, bg: page, min: 4.7 },
      ];
    } else if (c.state === 'filled') {
      const li = host.querySelector('.td-media-gallery__item');
      const tile = getComputedStyle(li).backgroundColor;
      const alt = host.querySelector('.td-media-gallery__alt');
      const handle = host.querySelector('.td-media-gallery__handle');
      const media = getComputedStyle(host.querySelectorAll('.td-media-gallery__media')[1]).backgroundColor;
      box = li;
      pairs = [
        { what: 'Gỡ icon vs tile', fg: cs('.td-media-gallery__remove').color, bg: tile, min: 3.2 },
        { what: 'Cắt icon vs tile', fg: cs('.td-media-gallery__crop-btn').color, bg: tile, min: 3.2 },
        { what: 'handle icon vs its chip', fg: getComputedStyle(handle).color, bg: getComputedStyle(handle).backgroundColor, min: 3.2 },
        { what: 'cover badge text vs its fill', fg: cs('.td-media-gallery__cover').color, bg: cs('.td-media-gallery__cover').backgroundColor, min: 4.7 },
        { what: 'alt placeholder vs the input', fg: getComputedStyle(alt).getPropertyValue('--td-field-placeholder').trim(), bg: getComputedStyle(alt).backgroundColor, min: 4.5 },
        { what: 'file name vs the media box', fg: cs('.td-media-gallery__name').color, bg: media, min: 4.7 },
        { what: 'Add (filled) text vs its fill', fg: cs('.td-media-gallery__add').color, bg: cs('.td-media-gallery__add').backgroundColor, min: 4.7 },
      ];
    } else {
      const note = host.querySelector('.td-media-gallery__broken');
      box = note;
      pairs = [{ what: 'broken note vs its fill', fg: getComputedStyle(note).color, bg: getComputedStyle(note).backgroundColor, min: 4.7 }];
    }
    const b = box.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `media-gallery:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'cropper') {
    const over = overRgb;
    const colors = (shadow) => String(shadow).match(/rgba?\([^)]*\)|color\([^)]*\)/g) || [];
    const light = c.state === 'light-image';
    const image = light ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
    const host = document.createElement('td-cropper');
    host.setAttribute('src', `/test/fixtures/flat-${light ? 'white' : 'black'}.svg`);
    host.setAttribute('natural-width', '800');
    host.setAttribute('natural-height', '600');
    host.setAttribute('alt', 'Ảnh phẳng');
    host.setAttribute('focal-point', '');
    host.setAttribute('focal', '{"v":1,"x":0.5,"y":0.5}');
    host.setAttribute('crop', '{"v":1,"x":0.2,"y":0.2,"width":0.6,"height":0.6}');
    const wrap = document.createElement('div');
    wrap.style.setProperty('width', '480px');
    wrap.appendChild(host);
    stage.appendChild(wrap);
    if (host.getAttribute('data-state') !== 'ready') {
      await new Promise((resolve, reject) => {
        host.addEventListener('image-ready', resolve, { once: true });
        host.addEventListener('image-error', (e) => reject(new Error(`cropper image-error ${e.detail && e.detail.kind}`)), { once: true });
      });
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const box = host.querySelector('.td-cropper__box');
    const bcs = getComputedStyle(box);
    const [contrastLine, dim] = colors(bcs.boxShadow);
    if (!dim) throw new Error(`cropper: no dim in box-shadow "${bcs.boxShadow}"`);
    const dimmed = over(dim, image);
    const handle = getComputedStyle(host.querySelector('.td-cropper__handle--corner'));
    const focal = host.querySelector('.td-cropper__focal');
    if (focal.hidden) throw new Error('cropper: focal point hidden (focal-point + focal set)');
    const fcs = getComputedStyle(focal);
    const [focalShadow] = colors(fcs.boxShadow);
    box.focus();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const focus = getComputedStyle(box);
    if (focus.outlineStyle === 'none') throw new Error('cropper: no focus outline on the box after focus()');
    const focusColor = focus.outlineColor;
    const corner = host.querySelector('.td-cropper__handle--corner');
    corner.focus();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ccs = getComputedStyle(corner);
    const [halo] = colors(ccs.boxShadow);
    if (ccs.outlineStyle === 'none' || !halo) throw new Error(`cropper: corner focus ring "${ccs.outlineStyle}" / halo "${ccs.boxShadow}"`);
    const pairs = [
      { what: 'frame line vs dimmed image', fg: bcs.borderTopColor, bg: dimmed },
      { what: 'handle fill vs dimmed image', fg: handle.backgroundColor, bg: dimmed },
      light
        ? { what: 'handle border vs image', fg: over(handle.borderTopColor, handle.backgroundColor), bg: image }
        : { what: 'handle fill vs image', fg: handle.backgroundColor, bg: image },
      light
        ? { what: 'focal contrast line vs image', fg: focalShadow || 'rgba(0, 0, 0, 0)', bg: image }
        : { what: 'focal ring vs image', fg: fcs.borderTopColor, bg: image },
      { what: 'box focus ring vs dimmed image', fg: focusColor, bg: dimmed },
      // two-tone corner ring: the light ring vs its dark halo over the image (one of the two contrasts with any image)
      { what: 'corner focus ring vs its halo on the image', fg: ccs.outlineColor, bg: over(halo, image) },
      light
        ? { what: 'corner focus halo vs image', fg: halo, bg: image }
        : { what: 'corner focus ring vs image', fg: ccs.outlineColor, bg: image },
    ];
    if (contrastLine && light) pairs.push({ what: 'frame contrast line vs image', fg: contrastLine, bg: image });
    const r0 = box.getBoundingClientRect();
    return {
      rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `cropper:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'media-picker') {
    const pages = c.v === 'pages';
    const ad = createMockAdapter({ count: 40, pagination: pages ? 'pages' : 'cursor' });
    TdMediaPicker.open({
      adapter: ad, pagination: pages ? 'pages' : 'cursor', selection: { mode: 'multiple', maxItems: 5 },
      upload: { accept: 'image/*', maxSize: '5MB' },
    });
    const R = () => document.querySelector('body > .td-media-picker');
    const wait = async (fn, what) => {
      for (let n = 0; n < 150; n++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); }
      throw new Error(`media-picker ${c.v}: ${what} never appeared`);
    };
    await wait(() => R()?.querySelector('[data-id="m38"] .td-media-grid__tick'), 'cards');
    /** the first opaque background up the tree (the page colour at the top) */
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && b !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(b)) return b;
      }
      return theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    };
    const root = R();
    let pairs;
    let box;
    if (c.v === 'cards') {
      for (const id of ['m40', 'm39']) root.querySelector(`[data-id="${id}"] .td-media-grid__tick`).click();
      root.querySelector('[data-id="m38"] [data-td-media-open]').click(); // multiple mode: view only
      await new Promise((r) => setTimeout(r, 500)); // dialog entrance + border transitions
      const checked = root.querySelector('.td-media-picker__card[data-selected]');
      const viewing = root.querySelector('.td-media-picker__card[data-viewing]:not([data-selected])');
      const rest = root.querySelector('.td-media-picker__card:not([data-viewing]):not([data-selected])');
      if (!checked || !viewing || !rest) throw new Error('media-picker cards: checked / viewing / rest card missing');
      // hover = the token's resolved colour (the gate cannot hover inside a pairs case): a probe card-less element
      const probe = document.createElement('span');
      probe.style.setProperty('color', 'var(--td-media-picker-card-hover)');
      root.querySelector('.td-media-picker__grid').appendChild(probe);
      const hover = getComputedStyle(probe).color;
      probe.remove();
      const cardBg = getComputedStyle(rest).backgroundColor;
      const listBg = bgOf(root.querySelector('.td-media-picker__results'));
      const label = root.querySelector('.td-media-picker__label');
      const info = root.querySelector('.td-media-picker__page-info');
      if (!label || !info || info.closest('[hidden]')) throw new Error('media-picker cards: label / page info not shown');
      const count = root.querySelector('.td-media-picker__clear .td-btn__label');
      pairs = [
        { what: 'checked border (--td-media-picker-card-checked) vs card', fg: getComputedStyle(checked).borderTopColor, bg: cardBg, min: 3 },
        { what: 'checked border vs list bg', fg: getComputedStyle(checked).borderTopColor, bg: listBg, min: 3 },
        { what: 'viewing border (--td-media-picker-card-viewing) vs card', fg: getComputedStyle(viewing).borderTopColor, bg: cardBg, min: 3 },
        { what: 'viewing border vs list bg', fg: getComputedStyle(viewing).borderTopColor, bg: listBg, min: 3 },
        { what: 'hover border (--td-media-picker-card-hover) vs card', fg: hover, bg: cardBg, min: 3 },
        { what: 'hover border vs list bg', fg: hover, bg: listBg, min: 3 },
        { what: 'card name vs card', fg: getComputedStyle(rest.querySelector('.td-media-picker__name')).color, bg: cardBg, min: 4.7 },
        { what: 'card meta vs card', fg: getComputedStyle(rest.querySelector('.td-media-picker__meta')).color, bg: cardBg, min: 4.7 },
        { what: '__label (muted) vs detail', fg: getComputedStyle(label).color, bg: bgOf(label), min: 4.7 },
        { what: 'page info "Hiển thị…" (cursor) vs toolbar', fg: getComputedStyle(info).color, bg: bgOf(info), min: 4.7 },
        { what: 'footer count vs footer', fg: getComputedStyle(count).color, bg: bgOf(count), min: 4.7 },
      ];
      box = root.querySelector('.td-media-picker__dialog').getBoundingClientRect();
    } else if (c.v === 'pages') {
      await wait(() => root.querySelector('.td-media-picker__pager .td-pagination__info'), 'td-pagination');
      await new Promise((r) => setTimeout(r, 450));
      const info = root.querySelector('.td-media-picker__pager .td-pagination__info');
      if (info.closest('[hidden]') || !/Hiển thị/.test(info.textContent)) throw new Error('media-picker pages: "Hiển thị…" not shown');
      pairs = [{ what: 'td-pagination "Hiển thị…" vs toolbar', fg: getComputedStyle(info).color, bg: bgOf(info), min: 4.7 }];
      box = info.getBoundingClientRect();
    } else {
      root.querySelector('.td-media-picker__upload-btn button').click();
      const U = () => document.querySelector('body > .td-media-picker-upload');
      await wait(() => U()?.querySelector('.td-dropzone__badge'), 'upload dialog badges');
      await new Promise((r) => setTimeout(r, 450));
      const up = U();
      const zone = up.querySelector('.td-dropzone__zone');
      const zoneBg = bgOf(zone);
      pairs = [
        { what: 'dropzone title vs zone', fg: getComputedStyle(up.querySelector('.td-dropzone__title')).color, bg: zoneBg, min: 4.7 },
        { what: 'dropzone sub-line vs zone', fg: getComputedStyle(up.querySelector('.td-dropzone__subtext')).color, bg: zoneBg, min: 4.7 },
        { what: 'dropzone icon vs zone', fg: getComputedStyle(up.querySelector('.td-dropzone__icon')).color, bg: zoneBg, min: 3.2 },
      ];
      for (const [i, b] of [...up.querySelectorAll('.td-dropzone__badge')].entries()) {
        pairs.push({ what: `dropzone badge ${i + 1} text vs its fill`, fg: getComputedStyle(b).color, bg: bgOf(b), min: 4.7 });
      }
      box = zone.getBoundingClientRect();
    }
    return {
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `media-picker:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'repeater') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--td-color-bg)');
    stage.appendChild(probe);
    const themeBg = getComputedStyle(probe).color;
    probe.remove();
    const rep = document.createElement('td-repeater');
    rep.setAttribute('max-rows', '2');
    rep.innerHTML = '<template><div data-td-row><span>Dòng</span></div></template><div data-td-row><span>Sạc</span></div><div data-td-row><span>Cáp</span></div>';
    stage.appendChild(rep);
    await new Promise((r) => setTimeout(r, 300)); // colour transitions
    let target;
    let pairs;
    if (c.state === 'add-disabled') {
      target = rep.querySelector('.td-repeater__add');
      if (target.getAttribute('aria-disabled') !== 'true') throw new Error('repeater: add not aria-disabled');
      const cs = getComputedStyle(target);
      pairs = [{ what: 'add label (aria-disabled) vs its fill', fg: cs.color, bg: cs.backgroundColor, min: 2.2 }];
    } else {
      const first = rep.querySelector('[data-td-row]');
      target = first.querySelector(c.state === 'rest' ? '.td-repeater__btn--down' : '.td-repeater__btn--up');
      if ((target.getAttribute('aria-disabled') === 'true') !== (c.state === 'disabled')) throw new Error(`repeater ${c.state}: wrong button`);
      const ink = getComputedStyle(target.querySelector('svg')).color;
      const min = c.state === 'rest' ? 3.2 : 2.2;
      pairs = [
        { what: 'icon vs page', fg: ink, bg: page, min },
        { what: 'icon vs --td-color-bg', fg: ink, bg: themeBg, min },
      ];
    }
    const b = target.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `repeater:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'dtr') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const over = overRgb;
    TdModal.closeAll();
    const C = customElements.get('td-datetime-range');
    C.now = () => new Date(2026, 9, 5, 9, 30);
    const host = document.createElement('td-datetime-range');
    host.setAttribute('name', 'r');
    host.setAttribute('start', c.state === 'pair-error' ? '10/10/2026' : '29/09/2026');
    host.setAttribute('end', '05/10/2026');
    stage.appendChild(host);
    host.querySelector('.td-dtr__trigger').click();
    await new Promise((r) => setTimeout(r, 450));
    const panel = document.querySelector('.td-modal[data-state="open"] .td-dtr-panel') || document.querySelector('.td-dtr-panel');
    const dialog = panel.closest('.td-modal__dialog');
    const surface = over(getComputedStyle(dialog).backgroundColor, page);
    let target; let pairs;
    if (c.state.startsWith('preset')) {
      target = panel.querySelector(c.state === 'preset' ? '.td-dtr-panel__preset[data-id="today"]' : '.td-dtr-panel__preset[data-id="last7"]');
      if (c.state === 'preset-on-pressed') target.setAttribute('data-td-pressed', '');
      const cs = getComputedStyle(target);
      const img = cs.backgroundImage.includes('rgb') ? cs.backgroundImage.match(/rgba?\([^)]*\)/)[0] : null;
      const fill = over(cs.backgroundColor, surface);
      pairs = [{ what: `${c.state} text vs fill`, fg: cs.color, bg: img ? over(img, fill) : fill, min: 4.7 }];
    } else if (c.state.startsWith('tab')) {
      const sw = panel.querySelector('.td-dtr-panel__switch');
      const track = over(getComputedStyle(sw).backgroundColor, surface);
      target = panel.querySelector(`.td-dtr-panel__tab[aria-pressed="${c.state === 'tab-on' ? 'true' : 'false'}"]`);
      const fill = over(getComputedStyle(target).backgroundColor, track);
      pairs = [
        { what: `${c.state} label vs fill`, fg: getComputedStyle(target.querySelector('.td-dtr-panel__tab-label')).color, bg: fill, min: 4.7 },
        { what: `${c.state} value vs fill`, fg: getComputedStyle(target.querySelector('.td-dtr-panel__tab-value')).color, bg: fill, min: 4.7 },
      ];
    } else {
      target = panel.querySelector('.td-dtr-panel__error');
      pairs = [{ what: 'pair error vs dialog', fg: getComputedStyle(target).color, bg: surface, min: 4.7 }];
    }
    const b = target.getBoundingClientRect();
    TdModal.closeAll();
    return { rect: { x: b.x, y: b.y, width: b.width || 1, height: b.height || 1 }, ink: {}, opacity: 1, hover: false, name: `dtr:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'scan') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const over = overRgb;
    const host = document.createElement('td-scan-input');
    host.setAttribute('label', 'IMEI');
    const multiple = c.state.startsWith('row') || c.state === 'count';
    if (multiple) {
      host.setAttribute('multiple', '');
      host.setAttribute('name', 'imei[]');
      host.validate = (v) => (v === 'BAD00001' ? 'Mã không hợp lệ' : true);
    }
    stage.appendChild(host);
    const input = host.querySelector('input');
    if (multiple) {
      host.values = ['356938035643809'];
      input.value = 'BAD00001';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    if (c.state.startsWith('ready')) input.focus();
    await new Promise((r) => setTimeout(r, 200));
    let target; let pairs;
    if (multiple) {
      const list = host.querySelector('.td-scan__list');
      const surface = over(getComputedStyle(list).backgroundColor, page);
      target = c.state === 'count' ? host.querySelector('.td-scan__count')
        : host.querySelector(`.td-scan__item[data-state="${c.state === 'row-error' ? 'invalid' : 'valid'}"] .td-scan__state`);
      if (!target) throw new Error(`scan ${c.state}: target not found`);
      const bg = c.state === 'count' ? page : surface;
      pairs = [{ what: `${c.state} text`, fg: getComputedStyle(target).color, bg, min: 4.7 }];
      if (c.state === 'row-error') pairs.push({ what: 'invalid value text', fg: getComputedStyle(host.querySelector('.td-scan__item[data-state="invalid"] .td-scan__value')).color, bg, min: 4.7 });
    } else {
      target = host.querySelector('.td-scan__status');
      if (c.state.endsWith('pressed')) target.setAttribute('data-td-pressed', '');
      const fill = over(getComputedStyle(target).backgroundImage.includes('rgb') ? getComputedStyle(target).backgroundImage.match(/rgba?\([^)]*\)/)[0] : 'rgba(0, 0, 0, 0)', page);
      pairs = [{ what: `indicator ${c.state} text vs ${c.state.endsWith('pressed') ? 'pressed fill' : 'page'}`, fg: getComputedStyle(target).color, bg: fill, min: 4.7 },
        { what: 'field edge vs page', fg: getComputedStyle(input).borderTopColor, bg: page, min: c.state.startsWith('ready') ? 3 : 1.2 }];
      input.blur();
    }
    const b = target.getBoundingClientRect();
    return { rect: { x: b.x, y: b.y, width: b.width || 1, height: b.height || 1 }, ink: {}, opacity: 1, hover: false, name: `scan:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'v0362') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const over = overRgb;
    let target; let pairs;
    if (c.state === 'toast-pressed') {
      target = TdToast._showSingle('Đã lưu thay đổi của bạn', c.v, 0, 'top-end');
      target.setAttribute('data-td-pressed', '');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cs = getComputedStyle(target);
      const rest = document.createElement('div');
      rest.className = `td-toast td-toast--${c.v}`;
      stage.appendChild(rest);
      const restBg = getComputedStyle(rest).backgroundColor;
      rest.remove();
      pairs = [{ what: 'toast text vs pressed fill', fg: cs.color, bg: cs.backgroundColor, min: 4.7 },
        { what: 'toast close glyph vs pressed fill', fg: cs.color, bg: cs.backgroundColor, min: 3.2 },
        { what: 'pressed fill differs from rest', fg: cs.backgroundColor, bg: restBg, min: 1.05 }];
    } else if (c.state === 'dropzone-pressed') {
      const host = document.createElement('td-dropzone');
      host.setAttribute('label', 'Tệp đính kèm');
      host.setAttribute('prompt-title', 'Kéo thả tệp vào đây');
      host.setAttribute('prompt-text', 'PDF hoặc ảnh, tối đa 5MB');
      stage.appendChild(host);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      target = host.querySelector('.td-dropzone__zone');
      const rest = over(getComputedStyle(target).backgroundColor, page);
      target.setAttribute('data-td-pressed', '');
      const fill = over(getComputedStyle(target).backgroundColor, page);
      pairs = [{ what: 'dropzone title vs pressed fill', fg: getComputedStyle(host.querySelector('.td-dropzone__title')).color, bg: fill, min: 4.7 },
        { what: 'dropzone icon vs pressed fill', fg: getComputedStyle(host.querySelector('.td-dropzone__icon')).color, bg: fill, min: 3.2 },
        { what: 'dropzone sub-line vs pressed fill', fg: getComputedStyle(host.querySelector('.td-dropzone__subtext')).color, bg: fill, min: 4.7 },
        { what: 'pressed fill differs from rest', fg: fill, bg: rest, min: 1.05 }];
    } else if (c.state === 'option-pressed') {
      const menu = document.createElement('div');
      menu.className = 'td-dropdown__menu td-glass-surface td-glass-surface--strong';
      menu.setAttribute('data-state', 'open');
      menu.style.setProperty('top', '96px');
      menu.style.setProperty('left', '48px');
      menu.style.setProperty('width', '260px');
      target = document.createElement('div');
      target.className = 'td-dropdown__option';
      target.setAttribute('role', 'option');
      target.setAttribute('data-td-pressed', '');
      const label = document.createElement('span');
      label.className = 'td-dropdown__option-label';
      label.textContent = 'TP. Hồ Chí Minh';
      target.appendChild(label);
      menu.appendChild(target);
      stage.appendChild(menu);
      const surface = over(getComputedStyle(menu).backgroundColor, page);
      const fill = over(getComputedStyle(target).backgroundColor, surface);
      pairs = [{ what: 'option label vs pressed fill', fg: getComputedStyle(label).color, bg: fill, min: 4.7 },
        { what: 'pressed fill differs from rest', fg: fill, bg: surface, min: 1.05 }];
    } else {
      target = document.createElement('button');
      target.type = 'button';
      target.className = c.state === 'action-pressed' ? `td-btn td-btn--action td-btn--action-${c.v}` : `td-btn td-btn--${c.v}`;
      target.textContent = c.state === 'action-pressed' ? '' : 'Lưu';
      target.setAttribute('data-td-pressed', '');
      stage.appendChild(target);
      const cs = getComputedStyle(target);
      const fill = over(cs.backgroundColor, page);
      pairs = [{ what: `${c.state === 'action-pressed' ? 'icon' : 'label'} vs pressed fill`, fg: cs.color, bg: fill, min: 4.7 }];
      if (c.v !== 'ghost' && c.state === 'btn-pressed') {
        const rest = document.createElement('button');
        rest.className = `td-btn td-btn--${c.v}`;
        stage.appendChild(rest);
        pairs.push({ what: 'pressed fill differs from rest', fg: fill, bg: over(getComputedStyle(rest).backgroundColor, page), min: 1.05 });
      }
    }
    const b = target.getBoundingClientRect();
    return { rect: { x: b.x, y: b.y, width: b.width || 1, height: b.height || 1 }, ink: {}, opacity: 1, hover: false, name: `v0362:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'v036') {
    // v0.36.0 colours/action-button — computed colours only (no screenshot)
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    stage.appendChild(probe);
    const tok = (name) => { probe.style.setProperty('color', `var(${name})`); return getComputedStyle(probe).color; };
    /** translucent colour composited on an opaque one (rgb() strings) */
    const over = overRgb;
    let pairs = [];
    let target = probe;
    if (c.state === 'solid') {
      const bg = tok(`--td-solid-${c.v}-bg`); const fg = tok(`--td-solid-${c.v}-fg`); const hv = tok(`--td-solid-${c.v}-hover`);
      pairs = [{ what: 'solid label vs fill', fg, bg, min: 4.7 }, { what: 'solid label vs hover', fg, bg: hv, min: 4.7 }];
    } else if (c.state === 'badge') {
      target = document.createElement('span');
      target.className = `td-badge td-badge--${c.v}`;
      target.textContent = 'Đã duyệt';
      stage.appendChild(target);
      const cs = getComputedStyle(target);
      pairs = [{ what: 'badge label vs fill', fg: cs.color, bg: cs.backgroundColor, min: 4.7 }];
      if (theme !== 'dark') {
        pairs.push({ what: 'badge edge vs its fill', fg: cs.borderTopColor, bg: cs.backgroundColor, min: 1.6 },
          { what: 'badge edge vs white', fg: cs.borderTopColor, bg: 'rgb(255, 255, 255)', min: 1.6 },
          { what: 'badge edge vs #f4f4f5', fg: cs.borderTopColor, bg: 'rgb(244, 244, 245)', min: 1.6 });
      }
      if (!['neutral', 'accent'].includes(c.v)) {
        const ink = document.createElement('span');
        ink.className = `td-badge td-badge--${c.v} td-badge--outline`;
        ink.textContent = 'Đã duyệt';
        stage.appendChild(ink);
        pairs.push({ what: 'badge -ink (outline) vs page', fg: getComputedStyle(ink).color, bg: page, min: 4.7 });
      }
    } else if (c.state === 'alert') {
      const host = document.createElement('td-alert');
      host.setAttribute('variant', c.v);
      host.textContent = 'Đã lưu';
      stage.appendChild(host);
      target = host.querySelector('.td-alert');
      const cs = getComputedStyle(target);
      pairs = [{ what: 'alert icon vs fill', fg: getComputedStyle(target.querySelector('.td-alert__icon')).color, bg: cs.backgroundColor, min: 3.2 },
        { what: 'alert bar vs fill', fg: cs.borderInlineStartColor || cs.borderLeftColor, bg: cs.backgroundColor, min: 3 }];
    } else if (c.state === 'option-row') {
      const menu = document.createElement('div');
      menu.className = 'td-dropdown__menu td-glass-surface td-glass-surface--strong';
      menu.setAttribute('data-state', 'open');
      menu.style.setProperty('top', '96px');
      menu.style.setProperty('left', '48px');
      menu.style.setProperty('width', '260px');
      const opt = document.createElement('div');
      opt.className = 'td-dropdown__option';
      opt.setAttribute('role', 'option');
      if (c.v === 'active') opt.setAttribute('data-active', '');
      else opt.setAttribute('aria-selected', 'true');
      const label = document.createElement('span');
      label.className = 'td-dropdown__option-label';
      label.textContent = 'TP. Hồ Chí Minh';
      opt.appendChild(label);
      menu.appendChild(opt);
      stage.appendChild(menu);
      target = opt;
      const surface = over(getComputedStyle(menu).backgroundColor, page);
      const fill = over(getComputedStyle(opt).backgroundColor, surface);
      pairs = [{ what: 'option label vs row fill', fg: getComputedStyle(label).color, bg: fill, min: 4.7 }];
      if (c.v === 'active') {
        const bar = (getComputedStyle(opt).boxShadow.match(/rgba?\([^)]*\)/) || [])[0] || 'rgba(0, 0, 0, 0)';
        pairs.push({ what: 'active bar vs popup surface', fg: over(bar, surface), bg: surface, min: 3 });
      }
    } else {
      const fg = tok(`--td-action-btn-${c.v}-fg`);
      const hv = over(tok(`--td-action-btn-${c.v}-hover-bg`), page);
      pairs = [{ what: 'action-button icon vs page', fg, bg: page, min: 4.7 }, { what: 'action-button icon vs hover fill', fg, bg: hv, min: 4.7 }];
    }
    const b = target.getBoundingClientRect();
    return { rect: { x: b.x, y: b.y, width: b.width || 1, height: b.height || 1 }, ink: {}, opacity: 1, hover: false, name: `v036:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'table-card') {
    const host = document.createElement('td-table');
    host.setAttribute('layout', 'cards');
    stage.appendChild(host);
    host.columns = [{ key: 'id', label: 'ID' }, { key: 'code', label: 'Mã đơn', sortable: true, card: 'primary' },
      { key: 'customer', label: 'Khách hàng' }, { key: 'act', label: 'Thao tác', actions: [{ id: 'e', label: 'Sửa', icon: 'pencil' }] }];
    host.data = [{ id: 7, code: 'DH1', customer: 'Nguyễn Văn An' }];
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    /** first opaque background colour from `el` up */
    const fill = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg;
      }
      return theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    };
    const cell = host.querySelector('tbody td[data-col-key="customer"]');
    let target;
    if (c.state === 'label') target = cell.querySelector('.td-table__cell-label');
    else if (c.state === 'value') target = cell;
    else if (c.state === 'lead') target = host.querySelector('tbody td[data-card="lead"]');
    else if (c.state === 'action-icon') target = host.querySelector('tbody .td-table__action--icon');
    else target = host.querySelector('.td-table__sort');
    if (!target) throw new Error(`table-card: no ${c.state} target`);
    const ink = getComputedStyle(c.state === 'action-icon' ? target.querySelector('svg') : target).color;
    const b = target.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `table-card:${c.v}:${c.state}`,
      pairs: [{ what: `${c.state} ${c.state === 'action-icon' ? 'icon' : 'text'} vs its fill`, fg: ink, bg: fill(target), min: c.state === 'action-icon' ? 3 : 4.7 }],
    };
  } else if (c.kind === 'table-select') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const host = document.createElement('td-table');
    host.setAttribute('selectable', '');
    host.setAttribute('row-key', 'id');
    host.setAttribute('layout', c.state === 'card' || c.state === 'chip-pressed' ? 'cards' : 'table');
    host.setAttribute('zebra', 'false');
    stage.appendChild(host);
    host.columns = [{ key: 'name', label: 'Tên' }, { key: 'role', label: 'Vai trò' }];
    host.data = [{ id: 1, name: 'Nguyễn Văn An', role: 'Quản trị' }, { id: 2, name: 'Bình', role: 'Biên tập' }];
    host.selectedKeys = [1];
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const probe = document.createElement('span');
    host.appendChild(probe);
    const tok = (name) => { probe.style.setProperty('color', `var(${name})`); return getComputedStyle(probe).color; };
    /** a translucent colour (rgb()/rgba()/color(srgb …)) composited on an opaque rgb() */
    const over = overRgb;
    const tr = host.querySelector('tbody tr[data-selected]');
    const tableBg = over(tok('--td-table-bg'), page);
    const sel = over(tok('--td-table-row-selected'), tableBg);
    const text = getComputedStyle(tr.querySelector('[data-col="0"]')).color;
    if (c.state === 'row-pressed' || c.state === 'chip-pressed') {
      const btn = c.state === 'chip-pressed' ? host.querySelector('.td-table__select-all') : tr.querySelector('.td-table__select');
      const restBg = over(getComputedStyle(btn).backgroundColor, c.state === 'chip-pressed' ? tableBg : sel);
      btn.setAttribute('data-td-pressed', '');
      const fill = over(getComputedStyle(btn).backgroundColor, c.state === 'chip-pressed' ? tableBg : sel);
      // the mark fades its fill in over --td-dur-fast: wait for the settled colour (bounded, real signal)
      const want = tok('--td-checkbox-color');
      for (let i = 0; i < 60 && getComputedStyle(btn.querySelector('.td-check')).backgroundColor !== want; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const markBg = getComputedStyle(btn.querySelector('.td-check')).backgroundColor;
      const pp = c.state === 'chip-pressed'
        ? [{ what: 'select-all chip label vs pressed fill', fg: getComputedStyle(host.querySelector('.td-table__select-all-label')).color, bg: fill, min: 4.7 }]
        // the state is carried by the ✓ on the mark fill (v0.36 tick rule ≥ 3.2, re-measured here while pressed); the
        // pressed fill is a transient (< 1 s) backdrop: the mark only has to stay clearly apart from it (≥ 2 — dark:
        // the shared --td-color-pressed vs the dark accent measures 2.70)
        : [{ what: 'tick glyph vs mark fill (pressed)', fg: getComputedStyle(btn.querySelector('.td-check svg')).color, bg: markBg, min: 3.2 },
          { what: 'ticked mark fill vs pressed fill', fg: markBg, bg: fill, min: 2 }];
      pp.push({ what: 'pressed fill differs from rest', fg: fill, bg: restBg, min: 1.05 });
      const r0 = btn.getBoundingClientRect();
      return { rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height }, ink: {}, opacity: 1, hover: false, name: `table-select:${c.v}:${c.state}`, pairs: pp };
    }
    const pairs = c.state === 'card'
      ? [{ what: 'selected card border vs page', fg: getComputedStyle(tr).borderTopColor, bg: page, min: 3 },
        { what: 'selected card border vs table fill', fg: getComputedStyle(tr).borderTopColor, bg: tableBg, min: 3 },
        { what: 'card text on the selected tint', fg: text, bg: sel, min: 4.7 }]
      : [{ what: 'cell text on the selected tint', fg: text, bg: sel, min: 4.7 },
        { what: 'cell text on the selected tint + hover wash', fg: text, bg: over(tok('--td-table-row-hover'), sel), min: 4.7 }];
    const b = tr.getBoundingClientRect();
    return { rect: { x: b.x, y: b.y, width: b.width, height: b.height }, ink: {}, opacity: 1, hover: false, name: `table-select:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'v039') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const over = overRgb;
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (c.state === 'columns-btn') {
      const host = document.createElement('td-table');
      host.setAttribute('column-menu', '');
      stage.appendChild(host);
      host.columns = [{ key: 'name', label: 'Tên' }, { key: 'role', label: 'Vai trò' }];
      host.data = [{ name: 'An', role: 'Admin' }];
      await raf2();
      const b = host.querySelector('.td-table__columns');
      const tableBg = over(getComputedStyle(host.querySelector('.td-table')).backgroundColor, page);
      const pairs = [{ what: '"Cột" label vs table fill', fg: getComputedStyle(b).color, bg: over(getComputedStyle(b).backgroundColor, tableBg), min: 4.7 },
        { what: '"Cột" icon vs table fill', fg: getComputedStyle(b.querySelector('svg')).color, bg: over(getComputedStyle(b).backgroundColor, tableBg), min: 3.2 }];
      b.setAttribute('data-td-pressed', '');
      await raf2();
      pairs.push({ what: '"Cột" label vs pressed fill', fg: getComputedStyle(b).color, bg: over(getComputedStyle(b).backgroundColor, tableBg), min: 4.7 });
      const r0 = b.getBoundingClientRect();
      return { rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height }, ink: {}, opacity: 1, hover: false, name: `v039:${c.v}:${c.state}`, pairs };
    }
    const host = document.createElement('td-filter-chips');
    host.style.setProperty('width', '600px');
    stage.appendChild(host);
    host.items = [{ key: 'status', label: 'Trạng thái', value: 'Đang bán' }, { key: 'kho', label: 'Kho', value: 'HN', removable: false }];
    await raf2();
    const li = host.querySelector('.td-filter-chips__item');
    const x = li.querySelector('.td-filter-chips__remove');
    const chipBg = over(getComputedStyle(li).backgroundColor, page);
    let pairs;
    if (c.state === 'chip') {
      pairs = [{ what: 'chip label vs chip fill', fg: getComputedStyle(li.querySelector('.td-filter-chips__label')).color, bg: chipBg, min: 4.7 },
        { what: 'chip value vs chip fill', fg: getComputedStyle(li.querySelector('.td-filter-chips__value')).color, bg: chipBg, min: 4.7 },
        { what: 'chip × icon vs chip fill', fg: getComputedStyle(x.querySelector('svg')).color, bg: over(getComputedStyle(x).backgroundColor, chipBg), min: 3.2 },
        { what: 'chip × icon as text-sized ink (≥ 4.7, it names the action)', fg: getComputedStyle(x).color, bg: chipBg, min: 4.7 }];
    } else {
      // hover / pressed: the REAL fills of the rules (hover token / data-td-pressed), composited on the chip
      const fill = c.state === 'remove-hover'
        ? over((() => { const p = document.createElement('span'); host.appendChild(p); p.style.setProperty('color', 'var(--td-filter-chip-remove-hover)'); const v = getComputedStyle(p).color; p.remove(); return v; })(), chipBg)
        : (x.setAttribute('data-td-pressed', ''), await raf2(), over(getComputedStyle(x).backgroundColor, chipBg));
      const ink = c.state === 'remove-hover'
        ? getComputedStyle(li.querySelector('.td-filter-chips__label')).color
        : getComputedStyle(x).color;
      pairs = [{ what: `× icon vs ${c.state} fill`, fg: ink, bg: fill, min: 4.7 }, { what: `${c.state} fill differs from the chip`, fg: fill, bg: chipBg, min: 1.05 }];
    }
    const r0 = li.getBoundingClientRect();
    return { rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height }, ink: {}, opacity: 1, hover: false, name: `v039:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'sortable' || c.kind === 'masked') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    stage.appendChild(probe);
    const tok = (name) => { probe.style.setProperty('color', `var(${name})`); return getComputedStyle(probe).color; };
    const themeBg = tok('--td-color-bg');
    const surface = tok('--td-color-surface');
    const textInk = tok('--td-color-text');
    const hoverFill = tok('--td-color-hover-strong');
    probe.remove();
    const over = overRgb;
    let target;
    let pairs;
    if (c.kind === 'sortable') {
      const host = document.createElement('td-sortable');
      host.setAttribute('label', 'Section');
      host.innerHTML = '<div data-td-sort-item data-id="a">A</div><div data-td-sort-item data-id="b">B</div>';
      if (c.state === 'disabled') host.setAttribute('disabled', '');
      let grid = null;
      if (c.state === 'gallery') {
        grid = document.createElement('td-media-grid');
        host.setAttribute('role', 'none');
        for (const it of host.children) it.setAttribute('data-td-media-item', '');
        grid.appendChild(host);
        stage.appendChild(grid);
      } else {
        stage.appendChild(host);
      }
      const h = host.querySelector('.td-sortable__handle');
      await new Promise((r) => setTimeout(r, 300)); // colour transitions
      const ink = getComputedStyle(h.querySelector('svg')).color;
      const pageAndBg = (fg, min, what) => [
        { what: `${what} vs page`, fg, bg: page, min },
        { what: `${what} vs --td-color-bg`, fg, bg: themeBg, min },
        { what: `${what} vs --td-color-surface`, fg, bg: surface, min },
      ];
      if (c.state === 'rest') pairs = pageAndBg(ink, 3.2, 'icon');
      else if (c.state === 'hover') {
        pairs = [
          { what: 'hover icon vs hover fill on the page', fg: textInk, bg: over(hoverFill, page), min: 3.2 },
          { what: 'hover icon vs hover fill on --td-color-bg', fg: textInk, bg: over(hoverFill, themeBg), min: 3.2 },
        ];
      } else if (c.state === 'disabled') {
        if (h.getAttribute('aria-disabled') !== 'true') throw new Error('sortable: handle not aria-disabled');
        pairs = pageAndBg(ink, 2.2, 'aria-disabled icon');
      } else if (c.state === 'gallery') {
        pairs = [{ what: 'icon vs its chip', fg: ink, bg: getComputedStyle(h).backgroundColor, min: 3.2 }];
      } else if (c.state === 'placeholder') {
        const ph = document.createElement('div');
        ph.className = 'td-sortable__placeholder';
        host.appendChild(ph);
        pairs = pageAndBg(getComputedStyle(ph).borderTopColor, 3, 'placeholder border');
      } else {
        h.click();
        const it = host.querySelector('[data-td-sort-state="lifted"]');
        if (!it) throw new Error('sortable: not lifted');
        pairs = pageAndBg(getComputedStyle(it).outlineColor, 3, 'lifted outline');
        h.click();
      }
      target = h;
    } else {
      const host = document.createElement('td-masked-value');
      host.setAttribute('label', 'SĐT');
      host.setAttribute('masked', '09xx xxx 123');
      host.reveal = () => Promise.resolve('0912 345 123');
      stage.appendChild(host);
      if (c.state === 'revealed') {
        host.querySelector('button').click();
        await new Promise((r) => setTimeout(r, 20));
        if (!host.revealed) throw new Error('masked: not revealed');
      }
      await new Promise((r) => setTimeout(r, 300));
      const t = host.querySelector('.td-masked__text');
      if (c.state === 'toggle') {
        target = host.querySelector('button');
        const ink = getComputedStyle(target.querySelector('svg')).color;
        pairs = [
          { what: 'icon vs page', fg: ink, bg: page, min: 3.2 },
          { what: 'icon vs --td-color-bg', fg: ink, bg: themeBg, min: 3.2 },
        ];
      } else {
        target = t;
        const ink = getComputedStyle(t).color;
        pairs = [
          { what: `${c.state} text vs page`, fg: ink, bg: page, min: 4.7 },
          { what: `${c.state} text vs --td-color-bg`, fg: ink, bg: themeBg, min: 4.7 },
          { what: `${c.state} text vs --td-color-surface`, fg: ink, bg: surface, min: 4.7 },
        ];
      }
    }
    const b = target.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `${c.kind}:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'otp' || c.kind === 'copy' || c.kind === 'skeleton') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--td-color-bg)');
    stage.appendChild(probe);
    const themeBg = getComputedStyle(probe).color;
    probe.style.setProperty('color', 'var(--td-color-surface)');
    const surface = getComputedStyle(probe).color;
    probe.remove();
    let box;
    let pairs;
    if (c.kind === 'otp') {
      const host = document.createElement('td-otp-input');
      host.setAttribute('label', 'Mã');
      if (c.state === 'error') host.setAttribute('error-text', 'Sai mã');
      if (c.state === 'alpha') host.setAttribute('charset', 'alphanumeric'); // v0.36.0 toast/OTP: letters
      stage.appendChild(host);
      host.value = c.state === 'alpha' ? 'WMX' : '123';
      const input = host.querySelector('input');
      if (c.state === 'active') { input.focus(); input.setSelectionRange(3, 3); }
      await new Promise((r) => setTimeout(r, 300)); // border transition
      const cell = c.state === 'active' ? host.querySelector('.td-otp__cell[data-active]') : host.querySelector('.td-otp__cell');
      if (!cell) throw new Error(`otp ${c.state}: cell not found`);
      const cs = getComputedStyle(cell);
      pairs = [
        { what: 'cell edge vs cell fill', fg: cs.borderTopColor, bg: cs.backgroundColor },
        { what: 'cell edge vs page', fg: cs.borderTopColor, bg: page },
        { what: 'cell edge vs --td-color-bg', fg: cs.borderTopColor, bg: themeBg },
      ];
      if (c.state === 'rest') pairs.push({ what: 'digit vs cell fill', fg: cs.color, bg: cs.backgroundColor, min: 4.7 });
      if (c.state === 'alpha') pairs.push({ what: 'letter vs cell fill', fg: cs.color, bg: cs.backgroundColor, min: 4.7 });
      box = cell.getBoundingClientRect();
      input.blur();
    } else if (c.kind === 'copy') {
      const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => (c.state === 'error' ? Promise.reject(new Error('denied')) : Promise.resolve()) } });
      const host = document.createElement('td-copy');
      host.setAttribute('value', 'ABC-123');
      host.setAttribute('duration', '60000');
      stage.appendChild(host);
      const btn = host.querySelector('button');
      if (c.state !== 'rest') btn.click();
      await new Promise((r) => setTimeout(r, 300));
      if (own) Object.defineProperty(navigator, 'clipboard', own); else delete navigator.clipboard;
      if (c.state !== 'rest' && btn.getAttribute('data-state') !== c.state) throw new Error(`copy: state ${btn.getAttribute('data-state')} ≠ ${c.state}`);
      const ink = getComputedStyle(btn.querySelector('svg')).color;
      pairs = [
        { what: 'icon vs page', fg: ink, bg: page, min: 3.2 },
        { what: 'icon vs --td-color-bg', fg: ink, bg: themeBg, min: 3.2 },
      ];
      box = btn.getBoundingClientRect();
    } else {
      const sk = document.createElement('span');
      sk.className = 'td-skeleton';
      sk.setAttribute('aria-hidden', 'true');
      sk.style.setProperty('width', '200px');
      stage.appendChild(sk);
      const bg = getComputedStyle(sk).backgroundColor;
      pairs = [
        { what: 'block vs page', fg: bg, bg: page, min: 1.05 },
        { what: 'block vs --td-color-bg', fg: bg, bg: themeBg, min: 1.05 },
        { what: 'block vs --td-color-surface', fg: bg, bg: surface, min: 1.05 },
      ];
      box = sk.getBoundingClientRect();
    }
    return {
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `${c.kind}:${c.v}:${c.state}`,
      pairs,
    };
  } else if (c.kind === 'toast-pairs') { // v0.36.0 toast/OTP
    const t = TdToast._showSingle('Đã lưu thay đổi của bạn', c.v, 0, 'top-end');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cs = getComputedStyle(t);
    const probe = document.createElement('span');
    probe.style.setProperty('color', `var(--td-toast-${c.v}-close-hover)`);
    stage.appendChild(probe);
    const wash = getComputedStyle(probe).color;
    probe.remove();
    const hoverBg = overRgb(wash, cs.backgroundColor);
    const r0 = t.getBoundingClientRect();
    return {
      rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `toast-pairs:${c.v}:${c.state}`,
      pairs: [
        { what: 'ink vs solid fill', fg: cs.color, bg: cs.backgroundColor, min: 4.7 },
        { what: 'close glyph vs hover wash', fg: cs.color, bg: hoverBg, min: 3.2 },
      ],
    };
  } else if (c.kind === 'v045') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const over = overRgb;
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const col = (n) => getComputedStyle(n).color;
    const bgOf = (n, under = page) => over(getComputedStyle(n).backgroundColor, under);
    let target;
    let pairs;
    if (c.v === 'steps') {
      const host = document.createElement('td-steps');
      host.style.setProperty('width', '720px');
      host.setAttribute('current', '3');
      if (c.state === 'pressed') host.setAttribute('navigation', 'back');
      stage.appendChild(host);
      host.steps = [{ label: 'Tải tệp' }, { label: 'Kiểm tra', state: 'error', description: 'Dòng 12: thiếu IMEI' },
        { label: 'Xem trước', description: 'Đã đọc 1.250 dòng' }, { label: 'Nhập' }, { label: 'Xong', disabled: true }];
      await raf2();
      target = host;
      const li = (st) => host.querySelector(`.td-steps__item[data-state="${st}"]`);
      const mk = (st) => li(st).querySelector('.td-steps__marker');
      if (c.state === 'markers') {
        pairs = [{ what: 'done ✓ vs done disc', fg: col(mk('done').querySelector('svg')), bg: bgOf(mk('done')), min: 3.2 },
          { what: 'error ! vs error disc', fg: col(mk('error').querySelector('svg')), bg: bgOf(mk('error')), min: 3.2 },
          { what: 'current number vs current disc', fg: col(mk('current')), bg: bgOf(mk('current')), min: 4.7 },
          { what: 'upcoming number vs upcoming disc', fg: col(mk('upcoming')), bg: bgOf(mk('upcoming')), min: 4.7 },
          { what: 'current ring vs page', fg: getComputedStyle(mk('current')).outlineColor, bg: page, min: 3 },
          { what: 'upcoming disc edge vs page', fg: getComputedStyle(mk('upcoming')).borderTopColor, bg: page, min: 3 }];
      } else if (c.state === 'text') {
        host.setAttribute('current', '4');
        await raf2();
        const label = (st) => li(st).querySelector('.td-steps__label');
        pairs = [{ what: 'done label vs page', fg: col(label('done')), bg: page, min: 4.7 },
          { what: 'current label vs page', fg: col(label('current')), bg: page, min: 4.7 },
          { what: 'description vs page', fg: col(host.querySelector('.td-steps__item[data-key="3"] .td-steps__desc')), bg: page, min: 4.7 },
          { what: 'error description vs page', fg: col(li('error').querySelector('.td-steps__desc')), bg: page, min: 4.7 },
          { what: 'disabled label vs page', fg: col(host.querySelector('.td-steps__item[data-disabled] .td-steps__label')), bg: page, min: 2.2 }];
        host.style.setProperty('width', '320px');
        await raf2();
        pairs.push({ what: 'compact summary vs page', fg: col(host.querySelector('.td-steps__summary')), bg: page, min: 4.7 });
      } else {
        const b = host.querySelector('button.td-steps__step');
        b.setAttribute('data-td-pressed', '');
        await raf2();
        const fill = bgOf(b);
        pairs = [{ what: 'clickable step label vs pressed fill', fg: col(b.querySelector('.td-steps__label')), bg: fill, min: 4.7 },
          { what: 'pressed fill differs from the page', fg: fill, bg: page, min: 1.05 }];
      }
    } else {
      const host = document.createElement('td-timeline');
      host.style.setProperty('width', '720px');
      host.setAttribute('time-zone', 'Asia/Ho_Chi_Minh');
      host.now = new Date('2026-10-05T03:00:00Z');
      stage.appendChild(host);
      host.items = [{ id: 'n', time: '2026-10-05T02:00:00Z', title: 'Tạo đơn', actor: 'An', meta: 'Kho HN', icon: 'plus', details: 'Chi tiết\nthay đổi', expanded: true },
        { id: 'l', time: '2026-10-05T01:00:00Z', title: 'Đơn #12', href: '#don', actor: { name: 'Bình', href: '#u' } },
        ...['success', 'warning', 'danger', 'info'].map((tone, i) => ({ id: tone, time: `2026-10-04T0${i + 1}:00:00Z`, title: tone, tone, icon: 'info' }))];
      await raf2();
      target = host;
      const q = (sel) => host.querySelector(sel);
      if (c.state === 'text') {
        pairs = [{ what: 'day heading vs page', fg: col(q('.td-timeline__day-title')), bg: page, min: 4.7 },
          { what: 'title vs page', fg: col(q('span.td-timeline__title')), bg: page, min: 4.7 },
          { what: 'title link vs page', fg: col(q('a.td-timeline__title')), bg: page, min: 4.7 },
          { what: 'actor vs page', fg: col(q('span.td-timeline__actor')), bg: page, min: 4.7 },
          { what: 'actor link vs page', fg: col(q('a.td-timeline__actor')), bg: page, min: 4.7 },
          { what: 'time vs page', fg: col(q('.td-timeline__time')), bg: page, min: 4.7 },
          { what: 'meta vs page', fg: col(q('.td-timeline__meta')), bg: page, min: 4.7 },
          { what: 'detail text vs page', fg: col(q('.td-timeline__detail')), bg: page, min: 4.7 }];
      } else if (c.state === 'tones') {
        const m = (id) => q(`li[data-id="${id}"] .td-timeline__marker`);
        pairs = ['n', 'success', 'warning', 'danger', 'info'].map((id) => ({ what: `${id === 'n' ? 'neutral' : id} icon vs its disc`,
          fg: col(m(id).querySelector('svg')), bg: bgOf(m(id)), min: 3.2 }));
      } else {
        const sum = q('.td-timeline__summary');
        pairs = [{ what: 'summary vs page', fg: col(sum), bg: page, min: 4.7 }];
        sum.setAttribute('data-td-pressed', '');
        await raf2();
        const fill = bgOf(sum);
        pairs.push({ what: 'summary vs its pressed fill', fg: col(sum), bg: fill, min: 4.7 }, { what: 'pressed fill differs from the page', fg: fill, bg: page, min: 1.05 });
      }
    }
    const r0 = target.getBoundingClientRect();
    return { rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height }, ink: {}, opacity: 1, hover: false, name: `v045:${c.v}:${c.state}`, pairs };
  } else if (c.kind === 'focus') {
    let control;
    if (c.v === 'dropdown') {
      control = document.createElement('button');
      control.type = 'button';
      control.className = 'td-dropdown__trigger';
      control.setAttribute('aria-expanded', 'true'); // open trigger = focus border
      control.textContent = 'Chọn';
    } else {
      control = document.createElement('input');
      control.className = 'td-field__control';
      control.value = 'Nội dung';
    }
    const wrap = document.createElement('div');
    wrap.className = c.v === 'dropdown' ? 'td-dropdown' : 'td-field td-field--md';
    wrap.appendChild(control);
    stage.appendChild(wrap);
    control.focus();
    await new Promise((r) => setTimeout(r, 300)); // border transition
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--td-color-bg)');
    stage.appendChild(probe);
    const themeBg = getComputedStyle(probe).color;
    probe.remove();
    const ccs = getComputedStyle(control);
    const r0 = control.getBoundingClientRect();
    return {
      rect: { x: r0.x, y: r0.y, width: r0.width, height: r0.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `focus:${c.v}`,
      pairs: [
        { what: 'border vs field fill', fg: ccs.borderTopColor, bg: ccs.backgroundColor },
        { what: 'border vs page backdrop', fg: ccs.borderTopColor, bg: page },
        { what: 'border vs --td-color-bg', fg: ccs.borderTopColor, bg: themeBg },
      ],
    };
  } else if (c.kind === 'type-confirm') {
    const page = theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    TdModal.closeAll();
    TdModal.confirm({ title: 'Xoá vĩnh viễn?', message: 'Không thể hoàn tác.', confirmVariant: 'danger', typeToConfirm: 'XOA' });
    await new Promise((r) => setTimeout(r, 450));
    const dialog = document.querySelector('.td-modal[data-state="open"] .td-modal__dialog');
    const field = dialog.querySelector('.td-modal__confirm-field');
    const input = field.querySelector('input');
    const surface = overRgb(getComputedStyle(dialog).backgroundColor, page);
    const fieldBg = overRgb(getComputedStyle(input).backgroundColor, surface);
    let pairs;
    let target;
    if (c.state === 'label') {
      target = field.querySelector('label');
      pairs = [
        { what: 'label vs dialog', fg: getComputedStyle(target).color, bg: surface, min: 4.7 },
        { what: 'phrase vs dialog', fg: getComputedStyle(field.querySelector('.td-modal__phrase')).color, bg: surface, min: 4.7 },
      ];
    } else {
      input.value = 'xo';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      dialog.querySelector('.td-modal__footer .td-btn--danger').click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      target = field.querySelector('.td-field-error');
      pairs = [
        { what: 'mismatch error vs dialog', fg: getComputedStyle(target).color, bg: surface, min: 4.7 },
        { what: 'typed text vs field', fg: getComputedStyle(input).color, bg: fieldBg, min: 4.7 },
      ];
    }
    const b = target.getBoundingClientRect();
    TdModal.closeAll();
    return { rect: { x: b.x, y: b.y, width: b.width || 1, height: b.height || 1 }, ink: {}, opacity: 1, hover: false, name: `type-confirm:${c.v}:${c.state}`, pairs };
  } else {
    TdToast._showSingle('Đã lưu thay đổi của bạn', c.v, 0);
    await new Promise((r) => setTimeout(r, 450));
    el = document.querySelector('#td-toast-container .td-toast');
    // pin the toast over the stage area so it sits on the backdrop
    // v0.21.0: no icon; the close glyph is only shown on keyboard focus but is measured anyway (same ink, same fill)
    parts = { label: el.querySelector('.td-toast__message'), close: el.querySelector('.td-toast__close') };
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 250)); // transitions settle
  const cs = (n) => (n ? getComputedStyle(n) : null);
  const ink = {
    label: cs(parts.label)?.color || cs(el).color,
    heading: parts.heading ? cs(parts.heading).color : null,
    icon: parts.icon ? cs(parts.icon).color : null,
    close: parts.close ? cs(parts.close).color : null,
    spinner: parts.spinner && !parts.spinner.hidden ? cs(parts.spinner).color : null,
  };
  let op = 1;
  for (let n = el; n; n = n.parentElement) op = Math.min(op, Number(getComputedStyle(n).opacity));
  if (hideInk) el.classList.add('td-contrast-probe-noink');
  else el.classList.remove('td-contrast-probe-noink');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = el.getBoundingClientRect();
  return {
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    ink,
    opacity: op,
    hover: c.state === 'hover',
    name: `${c.kind}:${c.v}${c.color ? `(${c.color})` : ''}:${c.state}`,
  };
};
window.__contrastCount = CASES.length;
window.__contrastPageOnly = CASES.map((c) => !!c.pageOnly);
// v0.41.0 (theming M5): the page-only cases measured from a screenshot (ghost buttons, alerts, badges) are also measured
// over the theme's REAL page and surface colours (--td-color-bg / --td-color-surface), not only flat white / black
window.__contrastRealPage = CASES.map((c) => !!c.pageOnly && ['button', 'alert', 'badge'].includes(c.kind));
