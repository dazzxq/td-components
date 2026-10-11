import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, sendKeys, emulateMedia } from '@web/test-runner-commands';
import './td-button.js';
import './td-input-field.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { parseColor, contrast } from '../../test/tokens/color-parse.js';

// v0.69.0 (plan docs/internal/plans/v0.69.0-button-plain.md) — Button `variant="plain"` in Chromium, Firefox AND WebKit: a text
// action for the MIDDLE of a line of text (under a field's helper note). The look of ghost (transparent, no shadow, accent label)
// but NO horizontal padding and NO border, so the box IS its content and the icon / label start on the text column's edge.
// Feedback (hover / pressed) is the LABEL COLOUR only — the ghost hover tokens: no underline, no wash, no shadow.
//
// Real signals only (rAF; conditions, never fixed sleeps), real mouse for :hover / :active. This file runs in its OWN browser
// instances (web-test-runner.config.js POINTER_FILES, group pointer-n): headless Firefox only updates :hover for the focused page,
// so a real-hover file cannot share a browser with other files. DOM nodes are compared as booleans (a failing chai assertion
// carrying DOM nodes hangs the runner).
//
// Two media features cannot be emulated through web-test-runner: `(pointer: coarse)` (a window.matchMedia stub only reaches JS,
// never CSS; emulateMedia has no pointer feature) and `(prefers-contrast: more)` (Playwright's Firefox answers matchMedia but its
// style system does not re-evaluate the stylesheet: a secondary button keeps its 12 % edge and its shadow). For those the media
// rule of td.css that carries the `.td-btn…` selector is switched to `all` IN PLACE — the same cascade position, so a plain rule
// that came after it would still win — and put back afterwards. The real-device version of the coarse case is
// test/touch/touch.spec.mjs (hasTouch / isMobile). forced-colors IS emulated for real (emulateMedia works in all three engines).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
const stage = document.createElement('div');
document.body.appendChild(stage);

afterEach(async () => {
  stage.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  await resetMouse();
});

async function until(fn, label, max = 120) {
  for (let i = 0; i < max; i++) { if (fn()) return; await raf(); }
  throw new Error(`timeout: ${label}`);
}

const REM = parseFloat(getComputedStyle(document.documentElement).fontSize);
const SIZES = ['sm', 'md', 'lg'];
const SPINNER = '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
  + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false"><circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
const ICON = '<span class="td-btn__icon" data-td-icon="rotate-cw" data-td-icon-size="s" aria-hidden="true"></span>';
const LABEL_TEXT = 'Gợi ý lại theo tên';
const LABEL = `<span class="td-btn__label">${LABEL_TEXT}</span>`;

/** The three ways a site writes the button: the PHP / native markup, the element, the element as a link (<a>). */
const FORMS = {
  native: (v, s) => `<button type="button" class="td-btn td-btn--${v} td-btn--${s}">${ICON}${LABEL}${SPINNER}</button>`,
  element: (v, s) => `<td-button variant="${v}"${s === 'md' ? '' : ` size="${s}"`} icon="rotate-cw">${LABEL_TEXT}</td-button>`,
  link: (v, s) => `<td-button variant="${v}"${s === 'md' ? '' : ` size="${s}"`} icon="rotate-cw" href="#goi-y">${LABEL_TEXT}</td-button>`,
};

/** A 360px column: ONE line of text (the helper) and the markup right under it. Returns the column. */
function column(markup) {
  const col = document.createElement('div');
  col.style.setProperty('width', '360px');
  col.style.setProperty('margin-left', '40px');
  col.innerHTML = `<p>Địa chỉ bài viết trên trang web của bạn.</p>${markup}`;
  col.firstElementChild.style.setProperty('margin', '0');
  stage.appendChild(col);
  fillIconSlots(col, '.td-btn__icon[data-td-icon]');
  return col;
}
const line = (col) => col.firstElementChild;
const ctl = (col) => col.querySelector('.td-btn');
const left = (el) => el.getBoundingClientRect().left;
/** the first thing the eye meets in the button: the icon, else the label */
const firstInk = (b) => b.querySelector('.td-btn__icon') || b.querySelector('.td-btn__label');
const mount = (markup) => { const col = column(markup); return ctl(col); };

/** A computed value resolved by the engine: the probe is given `value` through CSSOM (CSP-safe), then read back. */
function resolved(prop, value) {
  const p = document.createElement('span');
  p.style.setProperty(prop, value);
  stage.appendChild(p);
  const v = getComputedStyle(p).getPropertyValue(prop);
  p.remove();
  return v;
}
/** same colour (any serialisation: rgb(), color(srgb …)) within rounding */
const near = (a, b, tol = 1.5) => {
  const x = parseColor(a); const y = parseColor(b);
  return !!x && !!y && Math.abs(x.r - y.r) <= tol && Math.abs(x.g - y.g) <= tol && Math.abs(x.b - y.b) <= tol && Math.abs(x.a - y.a) <= 0.02;
};
const MIX = CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'); // button.css: the -fallback token without color-mix()
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const tokens = () => ({
  rest: resolved('color', 'var(--td-btn-ghost-fg)'),
  hover: resolved('color', MIX ? 'var(--td-btn-ghost-hover-fg)' : 'var(--td-btn-ghost-hover-fg-fallback)'),
  disabled: resolved('color', 'var(--td-btn-disabled-fg)'),
  ring: resolved('box-shadow', 'var(--td-focus-ring)'),
});

/** real mouse onto the element (two moves, edge then centre: a move onto the exact point the pointer rests on fires no mouseover in Firefox) */
async function hoverOver(el) {
  const r = el.getBoundingClientRect();
  await sendMouse({ type: 'move', position: [Math.round(r.x + 2), Math.round(r.y + 2)] });
  await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
  await until(() => el.matches(':hover'), 'pointer is over the button');
}
/** wait until the label colour has settled on `want` (the colour transition is 120ms), then two more frames */
async function settledOn(b, want, label) {
  await until(() => near(getComputedStyle(b).color, want), `${label}: ${getComputedStyle(b).color} vs ${want}`);
  await raf(); await raf();
}
const box = (b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100); };

/**
 * Switch every td.css media rule whose media text matches `mediaRe` and that carries a child rule accepted by `hasSelector` to
 * `all`, in place. Returns how many rules were found and a `restore()`.
 */
function switchMedia(mediaRe, hasSelector) {
  const sheet = [...document.styleSheets].find((x) => x.href && x.href.endsWith('/td.css'));
  const rules = [];
  const walk = (list) => {
    for (const r of list) {
      if (r.media && mediaRe.test(r.media.mediaText) && [...r.cssRules].some((x) => hasSelector(x.selectorText || ''))) rules.push(r);
      else if (r.cssRules) walk(r.cssRules);
    }
  };
  walk(sheet.cssRules);
  const orig = rules.map((r) => r.media.mediaText);
  rules.forEach((r) => { r.media.mediaText = 'all'; });
  return { count: rules.length, restore: () => rules.forEach((r, i) => { r.media.mediaText = orig[i]; }) };
}

/**
 * Real keyboard focus on `el`: Tab to a sentinel and Shift+Tab back (after any mouse press Firefox only treats script focus as
 * :focus-visible once the keyboard has navigated). Engines whose Tab skips buttons (WebKit's default) fall back to a key press +
 * script focus. Resolves when `el` is focused and matches :focus-visible.
 */
async function keyboardFocus(el) {
  stage.insertAdjacentHTML('beforeend', '<button type="button" id="sentinel">·</button>');
  el.focus();
  await sendKeys({ press: 'Tab' });
  await sendKeys({ press: 'Shift+Tab' });
  if (!(document.activeElement === el && el.matches(':focus-visible'))) {
    await sendKeys({ press: 'Escape' });
    el.focus();
  }
  await until(() => document.activeElement === el && el.matches(':focus-visible'), 'keyboard focus (:focus-visible)');
}

/** the plain look that must hold in EVERY state: no fill, no shadow, no border, no underline */
function expectBare(b, what) {
  const cs = getComputedStyle(b);
  expect(cs.backgroundColor, `${what}: background`).to.equal(TRANSPARENT);
  expect(cs.backgroundImage, `${what}: background-image`).to.equal('none');
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) expect(cs[`border${side}Width`], `${what}: border-${side}`).to.equal('0px');
  expect(cs.textDecorationLine, `${what}: underline`).to.equal('none');
  const label = b.querySelector('.td-btn__label');
  if (label) expect(getComputedStyle(label).textDecorationLine, `${what}: label underline`).to.equal('none');
}

// ---------------------------------------------------------------------------------------------------------------- alignment
describe('v0.69.0 plain — the box is its content: icon / label start on the text column edge', () => {
  for (const [form, make] of Object.entries(FORMS)) {
    for (const size of SIZES) {
      it(`${form} / ${size}: icon + box start on the column edge (±0.5px); ghost stays inset by its padding + 1px border`, () => {
        const plain = column(make('plain', size));
        const ghost = column(make('ghost', size));
        const edge = left(line(plain));
        expect(Math.abs(left(firstInk(ctl(plain))) - edge), `plain icon at ${left(firstInk(ctl(plain)))} vs column ${edge}`).to.be.at.most(0.5);
        expect(Math.abs(left(ctl(plain)) - edge), `plain box at ${left(ctl(plain))} vs column ${edge}`).to.be.at.most(0.5);
        // the contrast case: a ghost box keeps 0.85 / 1.25 / 1.6rem + the 1px (transparent) border
        const want = { sm: 0.85, md: 1.25, lg: 1.6 }[size] * REM + 1;
        const inset = left(firstInk(ctl(ghost))) - left(line(ghost));
        expect(inset, `ghost inset ${inset}`).to.be.above(13);
        expect(Math.abs(inset - want), `ghost inset ${inset} vs ${want}`).to.be.at.most(0.5);
        expect(inset - (left(firstInk(ctl(plain))) - edge), 'plain gains the whole inset').to.be.above(13);
      });
    }
  }

  it('label only (no icon): the label starts on the column edge — native and element', () => {
    for (const size of SIZES) {
      const native = column(`<button type="button" class="td-btn td-btn--plain td-btn--${size}">${LABEL}${SPINNER}</button>`);
      const element = column(`<td-button variant="plain" size="${size}">${LABEL_TEXT}</td-button>`);
      for (const col of [native, element]) {
        const got = left(ctl(col).querySelector('.td-btn__label'));
        expect(Math.abs(got - left(line(col))), `${size}: label ${got} vs column ${left(line(col))}`).to.be.at.most(0.5);
      }
    }
  });

  it('icon on the right: the label starts on the edge and the box ends with the icon', () => {
    const col = column(`<td-button variant="plain" size="sm" icon="rotate-cw" icon-position="right">${LABEL_TEXT}</td-button>`);
    const b = ctl(col);
    expect(Math.abs(left(b.querySelector('.td-btn__label')) - left(line(col)))).to.be.at.most(0.5);
    const ic = b.querySelector('.td-btn__icon').getBoundingClientRect();
    expect(Math.abs(ic.right - b.getBoundingClientRect().right)).to.be.at.most(0.5);
  });

  it('the dsuite case: under a td-input-field helper note the icon starts on the note edge; ghost is inset', async () => {
    const field = (v) => `<div><td-input-field label="Đường dẫn" helper-text="Địa chỉ bài viết trên trang web" value="ten-bai-viet"></td-input-field>`
      + `<td-button variant="${v}" size="sm" icon="rotate-cw">${LABEL_TEXT}</td-button></div>`;
    stage.insertAdjacentHTML('beforeend', field('plain') + field('ghost'));
    const [plain, ghost] = stage.children;
    await until(() => [plain, ghost].every((w) => { const n = w.querySelector('.td-field__note'); return n && !n.hidden && n.textContent.trim() !== ''; }), 'helper notes');
    await raf();
    for (const w of [plain, ghost]) w.style.setProperty('width', '360px');
    const pn = left(plain.querySelector('.td-field__note'));
    const pi = left(plain.querySelector('.td-btn__icon'));
    expect(Math.abs(pi - pn), `plain icon ${pi} vs note ${pn}`).to.be.at.most(0.5);
    const gi = left(ghost.querySelector('.td-btn__icon')) - left(ghost.querySelector('.td-field__note'));
    expect(gi, `ghost inset ${gi}`).to.be.above(13);
  });

  it('the plain box does not move with the size attribute changed at run time (re-render keeps it on the edge)', async () => {
    const col = column(`<td-button variant="plain" size="sm" icon="rotate-cw">${LABEL_TEXT}</td-button>`);
    const host = col.querySelector('td-button');
    for (const size of ['lg', 'md', 'sm']) {
      host.setAttribute('size', size);
      await until(() => ctl(col).classList.contains(`td-btn--${size}`), `size ${size}`);
      expect(Math.abs(left(firstInk(ctl(col))) - left(line(col))), size).to.be.at.most(0.5);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------- look
describe('v0.69.0 plain — computed look at rest', () => {
  for (const [form, make] of Object.entries(FORMS)) {
    it(`${form}: ghost look (transparent, no shadow, ghost-fg label), zero padding / border / margin, sizes keep their height`, () => {
      const t = tokens();
      const heights = { sm: 2, md: 2.5, lg: 3 };
      for (const size of SIZES) {
        const col = column(make('plain', size));
        const ghost = ctl(column(make('ghost', size)));
        const b = ctl(col);
        const cs = getComputedStyle(b);
        expectBare(b, `${form}/${size}`);
        expect(cs.borderTopColor, 'border colour').to.equal(TRANSPARENT);
        expect(cs.boxShadow, 'shadow').to.equal('none');
        expect(near(cs.color, t.rest), `label ${cs.color} vs --td-btn-ghost-fg ${t.rest}`).to.equal(true);
        expect(near(cs.color, getComputedStyle(ghost).color), 'same label colour as ghost').to.equal(true);
        expect(cs.paddingLeft + cs.paddingRight, 'padding-inline').to.equal('0px0px');
        expect(cs.marginLeft + cs.marginRight, 'margin-inline (no negative margin: it made the host wrap the label)').to.equal('0px0px');
        expect(cs.cursor).to.equal('pointer');
        expect(Math.abs(b.getBoundingClientRect().height - heights[size] * REM), `${size} height`).to.be.at.most(0.5);
        expect(cs.fontSize, `${size} font`).to.equal(getComputedStyle(ghost).fontSize);
        // the icon takes the label colour (currentColor)
        expect(near(getComputedStyle(b.querySelector('.td-btn__icon')).color, cs.color)).to.equal(true);
      }
    });
  }
});

describe('v0.69.0 plain — <td-button>: one line, host = button', () => {
  for (const size of SIZES) {
    for (const [what, attrs] of [['icon left', 'icon="rotate-cw"'], ['icon right', 'icon="rotate-cw" icon-position="right"'], ['no icon', ''],
      ['link', 'icon="rotate-cw" href="#goi-y"']]) {
      it(`${size} / ${what}: the label stays on ONE line and the host is exactly as wide as the inner button`, async () => {
        const col = column(`<td-button variant="plain" size="${size}" ${attrs}>${LABEL_TEXT}</td-button>`);
        const host = col.querySelector('td-button');
        await raf();
        const b = ctl(col);
        const label = b.querySelector('.td-btn__label');
        const range = document.createRange();
        range.selectNodeContents(label);
        expect(range.getClientRects().length, `label broke into ${range.getClientRects().length} lines`).to.equal(1);
        const lh = parseFloat(getComputedStyle(label).lineHeight);
        expect(label.getBoundingClientRect().height, `label ${label.getBoundingClientRect().height}px high vs one line ${lh}px`).to.be.at.most(lh + 0.5);
        const h = host.getBoundingClientRect(); const r = b.getBoundingClientRect();
        expect(Math.abs(h.width - r.width), `host ${h.width}px vs button ${r.width}px`).to.be.at.most(0.5);
        expect(r.left >= h.left - 0.5 && r.right <= h.right + 0.5, 'the button sits inside its host').to.equal(true);
        expect(Math.abs(h.height - r.height), `host ${h.height}px high vs button ${r.height}px`).to.be.at.most(0.5);
      });
    }
  }
});

// ------------------------------------------------------------------------------------------------------------- feedback
describe('v0.69.0 plain — feedback is the label colour only (real hover, pressed, focus)', () => {
  for (const form of ['native', 'element', 'link']) {
    it(`${form}: real hover → the ghost hover colour; no fill, no shadow, no underline, the box does not move; leaving restores`, async () => {
      const t = tokens();
      const b = mount(FORMS[form]('plain', 'sm'));
      await raf();
      const before = box(b);
      expect(near(getComputedStyle(b).color, t.rest)).to.equal(true);
      await hoverOver(b);
      await settledOn(b, t.hover, 'hover colour');
      const cs = getComputedStyle(b);
      expect(near(cs.color, t.rest, 3), 'the hover colour differs from the resting one').to.equal(false);
      expect(near(getComputedStyle(b.querySelector('.td-btn__icon')).color, cs.color), 'icon follows the label').to.equal(true);
      expect(near(getComputedStyle(b.querySelector('.td-btn__label')).color, cs.color), 'label inherits').to.equal(true);
      expectBare(b, `${form} hover`);
      expect(cs.boxShadow, 'no shadow on hover').to.equal('none');
      expect(box(b), 'the box does not move on hover').to.deep.equal(before);
      await resetMouse();
      await until(() => !b.matches(':hover'), 'pointer left');
      await settledOn(b, t.rest, 'back to rest');
      expectBare(b, `${form} after hover`);
    });

    it(`${form}: pressed ([data-td-pressed] and a real mouse press) → the label colour at once; no fill, no shadow, no underline`, async () => {
      const t = tokens();
      const b = mount(FORMS[form]('plain', 'sm'));
      await raf();
      const before = box(b);
      // touch: press.js sets the attribute; the pressed rule has transition-duration 0s, so the colour is the target immediately
      b.setAttribute('data-td-pressed', '');
      expect(near(getComputedStyle(b).color, t.hover), `pressed colour applied at once: ${getComputedStyle(b).color} vs ${t.hover}`).to.equal(true);
      await raf();
      expectBare(b, `${form} pressed`);
      expect(getComputedStyle(b).boxShadow).to.equal('none');
      expect(box(b)).to.deep.equal(before);
      b.removeAttribute('data-td-pressed');
      await settledOn(b, t.rest, 'pressed released');
      // mouse: native :active
      await hoverOver(b);
      await sendMouse({ type: 'down' });
      await until(() => b.matches(':active'), ':active');
      await settledOn(b, t.hover, 'active colour');
      expectBare(b, `${form} :active`);
      expect(getComputedStyle(b).boxShadow).to.equal('none');
      await sendMouse({ type: 'up' });
    });
  }

  for (const form of ['native', 'element', 'link']) {
    it(`${form}: keyboard focus draws the focus ring, and hover / pressed never take it away; still no underline`, async () => {
      const t = tokens();
      const b = mount(FORMS[form]('plain', 'sm'));
      await raf();
      await keyboardFocus(b);
      await until(() => getComputedStyle(b).boxShadow === t.ring, `focus ring ${getComputedStyle(b).boxShadow} vs ${t.ring}`);
      expect(t.ring, 'the focus ring token resolves to a real shadow').to.not.equal('none');
      expectBare(b, `${form} focused`);
      const rect = box(b);
      // + hover
      await hoverOver(b);
      await settledOn(b, t.hover, 'focused + hover colour');
      expect(getComputedStyle(b).boxShadow, 'hover must not remove the ring').to.equal(t.ring);
      expectBare(b, `${form} focused + hover`);
      // + pressed
      b.setAttribute('data-td-pressed', '');
      expect(getComputedStyle(b).boxShadow, 'pressed must not remove the ring').to.equal(t.ring);
      expect(near(getComputedStyle(b).color, t.hover)).to.equal(true);
      expectBare(b, `${form} focused + pressed`);
      expect(box(b), 'the ring is a shadow: the box does not move').to.deep.equal(rect);
    });
  }

  it('hover on the label (not the box centre): the same colour change', async () => {
    const t = tokens();
    const b = mount(FORMS.element('plain', 'sm'));
    await raf();
    const r = b.querySelector('.td-btn__label').getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.x + 1), Math.round(r.y + 1)] });
    await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
    await until(() => b.matches(':hover'), 'hover on the label');
    await settledOn(b, t.hover, 'hover via the label');
  });
});

// ----------------------------------------------------------------------------------------------------- disabled / busy
describe('v0.69.0 plain — disabled and busy, like every button', () => {
  const DISABLED = {
    native: () => `<button type="button" class="td-btn td-btn--plain td-btn--sm" disabled>${ICON}${LABEL}${SPINNER}</button>`,
    element: () => `<td-button variant="plain" size="sm" icon="rotate-cw" disabled>${LABEL_TEXT}</td-button>`,
    link: () => `<td-button variant="plain" size="sm" icon="rotate-cw" href="#goi-y" disabled>${LABEL_TEXT}</td-button>`,
  };
  for (const [form, make] of Object.entries(DISABLED)) {
    it(`${form}: disabled stays transparent with a grey label and not-allowed; hover changes nothing`, async () => {
      const t = tokens();
      const b = mount(make());
      await raf();
      const before = box(b);
      const cs = getComputedStyle(b);
      expect(cs.backgroundColor, 'no disabled fill: a disabled plain stays plain').to.equal(TRANSPARENT);
      expect(cs.backgroundImage).to.equal('none');
      expect(cs.borderTopColor).to.equal(TRANSPARENT);
      expect(cs.boxShadow).to.equal('none');
      expect(cs.cursor).to.equal('not-allowed');
      expect(near(cs.color, t.disabled), `disabled label ${cs.color} vs ${t.disabled}`).to.equal(true);
      expect(near(cs.color, t.rest, 3), 'greyed out, not the accent').to.equal(false);
      expectBare(b, `${form} disabled`);
      await hoverOver(b);
      await raf(); await raf();
      expect(near(getComputedStyle(b).color, t.disabled), 'hover must not recolour a disabled button').to.equal(true);
      expectBare(b, `${form} disabled + hover`);
      expect(box(b)).to.deep.equal(before);
    });
  }

  it('busy (element loading): the spinner shows, the label and icon are hidden but keep their room, the colour stays the accent', async () => {
    const t = tokens();
    const wrap = column(`<td-button variant="plain" size="sm" icon="rotate-cw">${LABEL_TEXT}</td-button>`);
    const host = wrap.querySelector('td-button');
    const b = ctl(wrap);
    await raf();
    const idle = box(b);
    host.setAttribute('loading', '');
    await until(() => b.getAttribute('aria-busy') === 'true', 'aria-busy');
    const spinner = b.querySelector('.td-btn__spinner');
    const cs = getComputedStyle(b);
    expect(spinner.hidden).to.equal(false);
    expect(getComputedStyle(spinner).display, 'spinner is shown').to.not.equal('none');
    expect(getComputedStyle(spinner).visibility).to.equal('visible');
    const sr = spinner.getBoundingClientRect(); const br = b.getBoundingClientRect();
    expect(sr.width > 0 && sr.left >= br.left - 0.5 && sr.right <= br.right + 0.5, 'spinner is inside the button').to.equal(true);
    expect(getComputedStyle(b.querySelector('.td-btn__label')).visibility, 'label hidden').to.equal('hidden');
    expect(getComputedStyle(b.querySelector('.td-btn__icon')).visibility, 'icon hidden').to.equal('hidden');
    expect(cs.cursor).to.equal('progress');
    expect(near(cs.color, t.rest), 'busy is not the disabled look').to.equal(true);
    expect(box(b), 'busy keeps the size').to.deep.equal(idle);
    expectBare(b, 'busy');
    await hoverOver(b);
    await raf(); await raf();
    expect(near(getComputedStyle(b).color, t.rest), 'hover must not recolour a busy button').to.equal(true);
    host.removeAttribute('loading');
    await until(() => !b.hasAttribute('aria-busy'), 'idle again');
    expect(getComputedStyle(b.querySelector('.td-btn__label')).visibility).to.equal('visible');
  });

  it('busy (native, the JS contract aria-busy + aria-disabled): spinner shown, label hidden, accent colour', async () => {
    const t = tokens();
    const b = mount(`<button type="button" class="td-btn td-btn--plain td-btn--sm" aria-busy="true" aria-disabled="true">${ICON}${LABEL}`
      + `${SPINNER.replace(' hidden', '')}</button>`);
    await raf();
    const cs = getComputedStyle(b);
    expect(getComputedStyle(b.querySelector('.td-btn__spinner')).display).to.not.equal('none');
    expect(getComputedStyle(b.querySelector('.td-btn__label')).visibility).to.equal('hidden');
    expect(cs.cursor).to.equal('progress');
    expect(near(cs.color, t.rest)).to.equal(true);
    expectBare(b, 'native busy');
  });
});

// ------------------------------------------------------------------------------------------------------------ coarse
describe('v0.69.0 plain — coarse pointer (touch)', () => {
  const coarseButtons = () => switchMedia(/pointer:\s*coarse/, (sel) => sel === '.td-btn'); // .td-btn { min-height: var(--td-touch-min) … }

  for (const form of ['native', 'element']) {
    for (const size of SIZES) {
      it(`${form} / ${size}: min-height is --td-touch-min (44px); the width still follows the content; still on the column edge`, async () => {
        const col = column(FORMS[form]('plain', size));
        const b = ctl(col);
        await raf();
        const restWidth = b.getBoundingClientRect().width;
        const touch = getComputedStyle(document.documentElement).getPropertyValue('--td-touch-min').trim();
        const sw = coarseButtons();
        try {
          expect(sw.count, 'the coarse rule of .td-btn was found in td.css').to.be.at.least(1);
          await raf();
          const cs = getComputedStyle(b);
          expect(touch).to.equal('44px');
          expect(cs.minHeight, 'min-height under (pointer: coarse)').to.equal(touch);
          expect(b.getBoundingClientRect().height, 'height').to.be.at.least(43.5);
          expect(cs.paddingLeft + cs.paddingRight + cs.borderLeftWidth + cs.borderRightWidth, 'still no padding / border').to.equal('0px0px0px0px');
          const gap = parseFloat(cs.columnGap);
          const parts = [...b.children].filter((c) => c.getBoundingClientRect().width > 0 && getComputedStyle(c).position !== 'absolute');
          const content = parts.reduce((s, c) => s + c.getBoundingClientRect().width, 0) + gap * (parts.length - 1);
          expect(Math.abs(b.getBoundingClientRect().width - content), `width ${b.getBoundingClientRect().width} vs content ${content}`).to.be.at.most(0.5);
          expect(Math.abs(left(firstInk(b)) - left(line(col))), 'column edge').to.be.at.most(0.5);
          expect(b.getBoundingClientRect().width, 'never narrower than at rest (sm grows with its 14px touch label)').to.be.at.least(restWidth - 0.5);
        } finally {
          sw.restore();
        }
        await raf();
        expect(getComputedStyle(b).minHeight, 'restored').to.not.equal('44px');
      });
    }
  }
});

// ------------------------------------------------------------------------------------------------------- color ignored
describe('v0.69.0 plain — `color` / `text-color` are ignored (it would become a filled box)', () => {
  it('plain + color + text-color: no td-btn--custom, no fill; the same attributes on ghost DO paint a box', async () => {
    const t = tokens();
    const wrap = column(`<td-button variant="plain" size="sm" color="#ff0000" text-color="#ffffff" icon="rotate-cw">${LABEL_TEXT}</td-button>`
      + `<td-button variant="ghost" size="sm" color="#ff0000" text-color="#ffffff">${LABEL_TEXT}</td-button>`);
    await raf();
    const [pb, gb] = [...wrap.querySelectorAll('.td-btn')];
    expect(gb.classList.contains('td-btn--custom'), 'the control: ghost + color is custom').to.equal(true);
    expect(near(getComputedStyle(gb).backgroundColor, 'rgb(255, 0, 0)'), 'the control paints the colour').to.equal(true);
    expect(pb.classList.contains('td-btn--custom'), 'plain is not custom').to.equal(false);
    expect(pb.classList.contains('td-btn--plain')).to.equal(true);
    const cs = getComputedStyle(pb);
    expect(cs.backgroundColor, 'no fill').to.equal(TRANSPARENT);
    expect(near(cs.color, t.rest), `label ${cs.color} is the ghost accent, not the text-color`).to.equal(true);
    expectBare(pb, 'plain + color');
    expect(Math.abs(left(firstInk(pb)) - left(line(wrap))), 'still on the column edge').to.be.at.most(0.5);
  });

  it('a colour set / changed at run time is ignored too (re-render keeps it plain); and leaving plain for ghost makes it custom', async () => {
    const t = tokens();
    const wrap = column(`<td-button variant="plain" size="sm">${LABEL_TEXT}</td-button>`);
    const host = wrap.querySelector('td-button');
    for (const color of ['#00ff00', '#1e3a8a', 'rgb(10, 20, 30)']) {
      host.setAttribute('color', color);
      await raf();
      const b = ctl(wrap);
      expect(b.classList.contains('td-btn--custom'), color).to.equal(false);
      expect(getComputedStyle(b).backgroundColor, color).to.equal(TRANSPARENT);
      expect(near(getComputedStyle(b).color, t.rest), color).to.equal(true);
    }
    host.setAttribute('variant', 'ghost');
    await until(() => ctl(wrap).classList.contains('td-btn--ghost'), 'ghost');
    expect(ctl(wrap).classList.contains('td-btn--custom'), 'the colour counts again once the variant is not plain').to.equal(true);
    host.setAttribute('variant', 'plain');
    await until(() => ctl(wrap).classList.contains('td-btn--plain'), 'plain again');
    expect(ctl(wrap).classList.contains('td-btn--custom')).to.equal(false);
    expect(getComputedStyle(ctl(wrap)).backgroundColor).to.equal(TRANSPARENT);
  });
});

describe('v0.69.0 plain — the variant attribute at run time', () => {
  it('primary → plain → ghost → plain re-renders into the right box (padding, border, edge)', async () => {
    const col = column(`<td-button variant="primary" size="sm" icon="rotate-cw">${LABEL_TEXT}</td-button>`);
    const host = col.querySelector('td-button');
    const inset = () => left(firstInk(ctl(col))) - left(line(col));
    expect(inset(), 'primary has its padding').to.be.above(13);
    for (const [variant, plain] of [['plain', true], ['ghost', false], ['plain', true]]) {
      host.setAttribute('variant', variant);
      await until(() => ctl(col).classList.contains(`td-btn--${variant}`), variant);
      await raf();
      expect(inset() < 0.5 && inset() > -0.5, `${variant}: inset ${inset()}`).to.equal(plain);
      expect(getComputedStyle(ctl(col)).paddingLeft === '0px', variant).to.equal(plain);
    }
  });

  it('an unknown variant is the primary button, never plain', async () => {
    const b = mount('<td-button variant="plains" size="sm">x</td-button>');
    expect(b.classList.contains('td-btn--primary')).to.equal(true);
    expect(b.classList.contains('td-btn--plain')).to.equal(false);
  });
});

// ------------------------------------------------------------------------------------------- contrast + forced colours
describe('v0.69.0 plain — increased contrast and forced colours add no border', () => {
  it('prefers-contrast: more — a secondary button gets its edge, plain stays borderless (transparent, 0 wide); ghost unchanged', async () => {
    const col = column(FORMS.native('plain', 'sm'));
    const secondary = ctl(column(FORMS.native('secondary', 'sm')));
    const ghost = ctl(column(FORMS.native('ghost', 'sm')));
    const plain = ctl(col);
    for (const b of [secondary, plain, ghost]) b.style.setProperty('transition', 'none'); // CSSOM: read the settled values at once
    expect(near(getComputedStyle(secondary).borderTopColor, getComputedStyle(secondary).color), 'before: the edge is the soft one').to.equal(false);
    // button.css `.td-btn:not(.td-btn--ghost, .td-btn--plain) { border-color: currentcolor }` + glass.css `.td-btn { --_td-btn-lift … }`
    const sw = switchMedia(/prefers-contrast:\s*more/, (sel) => sel === '.td-btn' || sel.startsWith('.td-btn:not('));
    try {
      expect(sw.count, 'the increased-contrast rules of .td-btn were found in td.css').to.be.at.least(1);
      await raf(); await raf();
      expect(near(getComputedStyle(secondary).borderTopColor, getComputedStyle(secondary).color), 'the rule is live: secondary edge = currentcolor').to.equal(true);
      expect(getComputedStyle(plain).borderTopWidth).to.equal('0px');
      expect(getComputedStyle(plain).borderTopColor, 'plain gets no edge colour either').to.equal(TRANSPARENT);
      expect(getComputedStyle(ghost).borderTopColor, 'ghost is unchanged').to.equal(TRANSPARENT);
      expectBare(plain, 'plain, increased contrast');
      expect(Math.abs(left(firstInk(plain)) - left(line(col))), 'still on the column edge').to.be.at.most(0.5);
    } finally {
      sw.restore();
    }
  });

  it('forced-colors (real emulation): the box stays borderless and on the column edge — a text action without a frame, like a link', async () => {
    const col = column(FORMS.element('plain', 'sm'));
    const b = ctl(col);
    await raf();
    const before = box(b);
    try {
      await emulateMedia({ forcedColors: 'active' });
      await until(() => matchMedia('(forced-colors: active)').matches, 'forced-colors');
      await raf(); await raf();
      expect(getComputedStyle(b).borderTopWidth + getComputedStyle(b).borderLeftWidth).to.equal('0px0px');
      expect(getComputedStyle(b).textDecorationLine).to.equal('none');
      expect(box(b), 'forced colours do not add a frame that would move the box').to.deep.equal(before);
      expect(Math.abs(left(firstInk(b)) - left(line(col)))).to.be.at.most(0.5);
    } finally {
      await emulateMedia({ forcedColors: null });
    }
  });
});

describe('v0.69.0 plain — the label is legible on the page (light and dark)', () => {
  for (const theme of ['light', 'dark']) {
    it(`${theme}: rest and real-hover label colour ≥ 4.7:1 on --td-color-bg and --td-color-surface`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const page = resolved('background-color', 'var(--td-color-bg)');
      const surface = resolved('background-color', 'var(--td-color-surface)');
      const t = tokens();
      const b = mount(FORMS.element('plain', 'sm'));
      await raf();
      await settledOn(b, t.rest, 'rest');
      const rest = getComputedStyle(b).color;
      await hoverOver(b);
      await settledOn(b, t.hover, 'hover');
      const hover = getComputedStyle(b).color;
      expect(near(rest, hover, 3), 'hover differs from rest').to.equal(false);
      for (const [name, bg] of [['--td-color-bg', page], ['--td-color-surface', surface]]) {
        expect(contrast(rest, bg), `${theme} rest ${rest} on ${name} ${bg}`).to.be.at.least(4.7);
        expect(contrast(hover, bg), `${theme} hover ${hover} on ${name} ${bg}`).to.be.at.least(4.7);
      }
      expectBare(b, `${theme} hover`); // a wash on hover would also change what the label sits on
    });
  }
});
