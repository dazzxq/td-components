// In-page probe of the full-page theme gate (test/tokens/page-contrast.spec.mjs, v0.41.0 plan M5). Imported by the
// spec with a dynamic import() inside page.evaluate. Reads computed colours only (no screenshots): every text, every
// control boundary, every opaque neutral fill, inside `roots`.
import { parseColor, composite, contrast, luminance, over } from '/test/tokens/color-parse.js';

const TEXT_MIN = 4.7; // QĐ9: content text (4.5 + margin)
const LARGE_MIN = 3.0; // large text (≥ 24px, or ≥ 18.66px bold)
const DISABLED_MIN = 2.2; // greyed-out on purpose (WCAG 1.4.3 exempts inactive controls)

/** Form-control boundaries (a field, a trigger, a check box, a switch, an OTP cell): QĐ7. Buttons are identified by
 *  their label and are not in this list. */
export const CONTROL_SEL = [
  '.td-field__control', '.td-chip-input__box', '.td-dropdown__trigger', '.td-dropdown__search', '.td-dtp__trigger',
  '.td-dtp-panel__input', '.td-dtr__trigger', '.td-number__box', '.td-otp__cell', '.td-scan__input',
  '.td-tree-select__control', '.td-tree-select__search', '.td-tree__search', '.td-switch__track', '.td-check',
  '.td-checkbox__mark',
].join(', ');

/** Neutral fills that are lighter than their backdrop BY DESIGN (inverted primary button, thumbs, popups, media). */
export const RAISED_ALLOW = [
  '.td-btn', '.td-glass-tint', '.td-cropper__ratio', '.td-badge', '.td-toast', '.td-tooltip', '.td-menu', '.td-dropdown__menu',
  '.td-chip-input__menu', '.td-hovercard', '.td-modal', '.td-drawer', '.td-loading', '.td-lightbox', '.td-scroll-top',
  '.td-switch__thumb', '.td-slider__thumb', '.td-slider__input', '.td-media-grid', '.td-media-field__preview',
  '.td-cropper', 'img', 'video', 'canvas', 'svg', '.demo-glass-stage', '.demo-fill', '.demo-lb-gallery',
].join(', ');

const isDisabled = (el) => !!el.closest(':disabled, [aria-disabled="true"], [data-disabled], [disabled], .td-field--disabled, [inert]');

function visible(el) {
  if (!el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    // visually hidden (.td-sr-only and friends): clipped to 1px
    if (cs.position === 'absolute' && (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)')) return false;
  }
  return true;
}

function opacityChain(el) {
  let o = 1;
  for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
  return o;
}

/** The colour actually behind `el`: its own and its ancestors' background colours composited down to the first opaque
 *  one. null when an image / gradient sits between (unknown). */
export function effectiveBg(el, self = true) {
  const layers = [];
  for (let n = self ? el : el.parentElement; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const c = parseColor(cs.backgroundColor);
    if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^linear-gradient\(rgba\(0, 0, 0, 0\)/.test(cs.backgroundImage)) {
      if (!c || c.a < 1) return null;
    }
    if (c && c.a > 0) layers.push(c);
    if (c && c.a === 1) break;
  }
  if (!layers.length || layers[layers.length - 1].a < 1) layers.push({ r: 255, g: 255, b: 255, a: 1 }); // canvas
  let base = layers.pop();
  while (layers.length) base = composite(layers.pop(), base);
  return base;
}

const hex = (c) => (c ? `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` : '?');

function describe(el) {
  const cls = (el.className && typeof el.className === 'string') ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  const sec = el.closest('.demo-section')?.querySelector('h2')?.firstChild?.textContent?.trim().slice(0, 24) || '';
  const txt = (el.value || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  return `${sec ? `[${sec}] ` : ''}${el.tagName.toLowerCase()}${cls}${txt ? ` "${txt}"` : ''}`;
}

const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const TEXT_INPUT = 'input:not([type=checkbox], [type=radio], [type=range], [type=hidden], [type=color], [type=file], [type=submit], [type=button]), textarea';

/**
 * @param {{ roots?: Element[], scheme: 'light'|'dark', themeSurfaces: string[] }} o
 */
export function measure(o) {
  const roots = o.roots || [document.body];
  const all = new Set();
  for (const r of roots) { all.add(r); for (const e of r.querySelectorAll('*')) all.add(e); }
  const texts = []; const controls = []; const islands = []; let skipped = 0; let measured = 0;
  const surfaces = o.themeSurfaces.map((s) => parseColor(s)).filter(Boolean);
  const isSurface = (c) => surfaces.some((s) => Math.abs(s.r - c.r) + Math.abs(s.g - c.g) + Math.abs(s.b - c.b) <= 3);

  for (const el of all) {
    if (!(el instanceof HTMLElement) || el.closest('#demo-file-warning, script, style, [aria-hidden="true"] .td-sr-only')) continue;
    const isInput = el.matches(TEXT_INPUT);
    if ((ownText(el) || isInput) && visible(el)) {
      const cs = getComputedStyle(el);
      const bg = effectiveBg(el);
      const fs = parseFloat(cs.fontSize); const fw = Number(cs.fontWeight) || 400;
      const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
      const min = isDisabled(el) ? DISABLED_MIN : large ? LARGE_MIN : TEXT_MIN;
      const inks = [];
      if (ownText(el) || (isInput && el.value)) inks.push(['text', cs.color]);
      if (isInput && !el.value && el.placeholder) inks.push(['placeholder', getComputedStyle(el, '::placeholder').color]);
      for (const [what, inkStr] of inks) {
        const ink = parseColor(inkStr);
        if (!bg || !ink) { skipped++; continue; }
        ink.a *= opacityChain(el);
        measured++;
        const r = contrast(ink, bg);
        if (r < min) texts.push({ el: describe(el), what, ratio: +r.toFixed(2), min, ink: hex(composite(ink, bg)), bg: hex(bg) });
      }
    }
    // a control painted with a per-instance colour of the page (e.g. <td-toggle color="green">) is the site's choice
    if (el.matches(CONTROL_SEL) && visible(el) && !isDisabled(el) && !el.closest('[color]')) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none') {
        const outer = effectiveBg(el, false);
        const fill = effectiveBg(el);
        const border = parseColor(cs.borderTopColor);
        if (outer && fill && border) {
          const min = o.scheme === 'dark' ? 3 : 1.3;
          const fillVsOuter = contrast(fill, outer);
          const bOut = contrast(border, outer); const bIn = contrast(border, fill);
          const ok = fillVsOuter >= min || (bOut >= min && bIn >= min);
          measured++;
          if (!ok) controls.push({ el: describe(el), border: hex(composite(border, outer)), outer: hex(outer), fill: hex(fill), vsOuter: +bOut.toFixed(2), vsFill: +bIn.toFixed(2), min });
        }
      }
    }
    // islands: an opaque NEUTRAL fill lighter than what is behind it that is not one of the theme's own surfaces
    const bgc = parseColor(getComputedStyle(el).backgroundColor);
    if (bgc && bgc.a === 1 && visible(el)) {
      const r = el.getBoundingClientRect();
      const neutral = Math.max(bgc.r, bgc.g, bgc.b) - Math.min(bgc.r, bgc.g, bgc.b) <= 24;
      if (r.width >= 24 && r.height >= 16 && neutral && !isSurface(bgc) && !el.closest(RAISED_ALLOW)) {
        const outer = effectiveBg(el, false);
        if (outer && luminance(bgc) > luminance(outer)) {
          const ratio = contrast(bgc, outer);
          const t = o.scheme === 'dark' ? 1.6 : 1.12;
          if (ratio > t) islands.push({ el: describe(el), fill: hex(bgc), outer: hex(outer), ratio: +ratio.toFixed(2) });
        }
      }
    }
  }
  return { texts, controls, islands, skipped, measured };
}

/** Resolve tokens on :root (computed colours / shadows). */
export function tokens(names) {
  const p = document.createElement('span');
  document.body.appendChild(p);
  const out = {};
  for (const n of names) { p.style.setProperty('color', `var(${n})`); out[n] = getComputedStyle(p).color; }
  p.remove();
  return out;
}

export { over, contrast };
