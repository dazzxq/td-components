// Loaded by contrast.spec.mjs: buttons + toasts rendered over a backdrop (v0.20.0 solid buttons; v0.21.0 pastel toasts).
import '/src/form/td-button.js';
import { TdToast } from '/src/feedback/td-toast.js';
import '/src/feedback/td-alert.js';
import '/src/display/td-media-grid.js';
import { TdLightbox } from '/src/feedback/td-lightbox.js';
import { fillIconSlots, tdIcon } from '/src/icons/td-icon.js';
import '/src/form/td-otp-input.js';
import '/src/display/td-copy.js';
import '/src/form/td-tree.js';
import '/src/form/td-tree-select.js';
import '/src/form/td-repeater.js';
import '/src/form/td-number-input.js';
import '/src/display/td-sortable.js';
import '/src/display/td-masked-value.js';
import '/src/display/td-table.js';
import '/src/form/td-media-field.js';
import { TdMediaPicker } from '/src/feedback/td-media-picker.js';
import { createMockAdapter } from '/test/fixtures/media-adapter.js';

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
// v0.32.0: td-media-field (content layer → page only): prompt + ratio text ≥ 4.7 on the empty frame fill, the empty-frame
// icon + dashed border ≥ 3.2 (border vs the page and vs the frame fill), the "Video" badge text ≥ 4.7 on its fill, the
// field error text ≥ 4.7 on the page; td-media-picker (inside the solid dialog): tile name, detail meta label and tray
// count ≥ 4.7 on the dialog surface, the selected tile border ≥ 3.2 vs the dialog surface — computed colours (`pairs`).
for (const state of ['empty', 'video', 'error']) CASES.push({ kind: 'media-field', v: 'frame', state, pageOnly: true });
// v0.33.0 (dcms2 parity): the picker card state borders (hover / viewing / checked tokens) ≥ 3:1 vs the card surface and
// the list background (WCAG 1.4.11), card name + meta text, the `.td-media-picker__label` muted label, the cursor page info,
// the footer count, the `td-pagination` "Hiển thị…" text ('pages' mode) and the upload dialog dropzone texts + badges ≥ 4.7.
for (const v of ['cards', 'pages', 'upload']) CASES.push({ kind: 'media-picker', v, state: 'rest', pageOnly: true });

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
    const check = document.createElement('span');
    check.className = 'td-chip-input__check';
    check.setAttribute('data-td-icon', 'check');
    check.setAttribute('data-td-icon-size', 's');
    const label = document.createElement('span');
    label.className = 'td-chip-input__option-label';
    label.textContent = 'Nguyễn Văn An';
    el.append(check, label);
    listbox.appendChild(el);
    menu.appendChild(listbox);
    stage.appendChild(menu);
    fillIconSlots(el);
    parts = c.v === 'selected' ? { label, icon: check } : { label };
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
      const ring = (/(rgba?\([^)]*\)|color\([^)]*\))/.exec(shadow) || [])[1];
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
      const glyph = getComputedStyle(target.querySelector(c.state === 'mixed' ? '.td-tree__check-mixed svg' : '.td-tree__check-on svg')).color;
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
    const tick = grid.querySelector(`[data-id="${c.v === 'on' ? 'a' : 'b'}"] .td-media-grid__tick`);
    const tcs = getComputedStyle(tick);
    if (tcs.opacity !== '1') throw new Error(`media tick ${c.v}: opacity ${tcs.opacity} (must be shown to be measured)`);
    const ring = (tcs.boxShadow.match(/rgba?\([^)]*\)|color\([^)]*\)/) || [])[0] || 'rgba(0, 0, 0, 0)';
    const pairs = [c.state === 'dark-image'
      ? { what: 'tick border vs dark image', fg: tcs.borderTopColor, bg: image }
      : { what: 'tick ring vs light image', fg: ring, bg: image }];
    if (c.v === 'on') pairs.push({ what: 'tick glyph vs on fill', fg: tcs.color, bg: tcs.backgroundColor, min: 3.2 });
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
    const rgba = (str) => { const n = (String(str).match(/-?[\d.]+/g) || []).map(Number); return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1]; };
    const over = (fg, bg) => { const f = rgba(fg); const b = rgba(bg); return `rgb(${[0, 1, 2].map((i) => Math.round(f[i] * f[3] + b[i] * (1 - f[3]))).join(', ')})`; };
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
      const count = root.querySelector('.td-media-picker__selcount');
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
  } else if (c.kind === 'table-card') {
    const host = document.createElement('td-table');
    host.setAttribute('layout', 'cards');
    stage.appendChild(host);
    host.columns = [{ key: 'code', label: 'Mã đơn', sortable: true }, { key: 'customer', label: 'Khách hàng' }];
    host.data = [{ code: 'DH1', customer: 'Nguyễn Văn An' }];
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
    else target = host.querySelector('.td-table__sort');
    if (!target) throw new Error(`table-card: no ${c.state} target`);
    const ink = getComputedStyle(target).color;
    const b = target.getBoundingClientRect();
    return {
      rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      ink: {},
      opacity: 1,
      hover: false,
      name: `table-card:${c.v}:${c.state}`,
      pairs: [{ what: `${c.state} text vs its fill`, fg: ink, bg: fill(target), min: 4.7 }],
    };
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
    const nums = (str) => String(str).match(/-?[\d.]+/g).map(Number);
    /** an rgba fill composited on an opaque background → rgb() */
    const over = (fill, bg) => {
      const [r, g, b, a = 1] = nums(fill);
      const base = nums(bg);
      return `rgb(${[r, g, b].map((v, i) => Math.round(v * a + base[i] * (1 - a))).join(', ')})`;
    };
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
      stage.appendChild(host);
      host.value = '123';
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
