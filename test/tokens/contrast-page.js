// Loaded by contrast.spec.mjs: buttons + toasts rendered over a backdrop (v0.20.0 solid buttons; v0.21.0 pastel toasts).
import '/src/form/td-button.js';
import { TdToast } from '/src/feedback/td-toast.js';
import '/src/feedback/td-alert.js';
import '/src/display/td-media-grid.js';
import { TdLightbox } from '/src/feedback/td-lightbox.js';
import { fillIconSlots, tdIcon } from '/src/icons/td-icon.js';
import '/src/form/td-otp-input.js';
import '/src/display/td-copy.js';

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
