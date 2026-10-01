// Loaded by contrast.spec.mjs: buttons + toasts rendered over a backdrop (v0.20.0 solid buttons; v0.21.0 pastel toasts).
import '/src/form/td-button.js';
import { TdToast } from '/src/feedback/td-toast.js';
import '/src/feedback/td-alert.js';

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
}

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
    el.className = `td-badge td-badge--${c.v}${c.state === 'soft' ? '' : ` td-badge--${c.state}`}`;
    el.textContent = 'Đã duyệt';
    stage.appendChild(el);
    parts = { label: el };
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
