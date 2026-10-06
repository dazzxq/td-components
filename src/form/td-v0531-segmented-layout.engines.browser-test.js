import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdChoiceGroup } from './td-choice-group.js';
import { decideLayout } from '../utils/segmented-layout.js';

// v0.53.1 (plan docs/internal/plans/v0.53.1-segmented-layout.md M1) — <td-choice-group variant="segmented"> in narrow
// containers, Chromium / Firefox / WebKit, mouse pointer (the coarse-pointer cases run in test/engines/segmented-layout.spec.mjs).
// ONE layout for the whole rail (never mixed), `stretch`, overflow inside the rail (never the page), the re-measure
// triggers, focus / value reveal in an overflowing rail (LTR + RTL). No sleeps: layout state is awaited through
// MutationObserver / rAF signals. DOM nodes are compared as booleans (a failing chai assertion with nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await frame(); };
const cleanup = [];
afterEach(async () => {
  cleanup.splice(0).forEach((f) => f());
  await resetMouse();
});

const THEME = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];
const FIVE = [...THEME, { value: 'hc', label: 'Tương phản', icon: 'eye' }, { value: 'sys', label: 'Hệ thống', icon: 'columns' }];
const LONG = [{ value: 'os', label: 'Theo hệ điều hành', icon: 'monitor' }, { value: 'hc', label: 'Độ tương phản cao', icon: 'eye' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];
const WORD = [{ value: 'a', label: 'Supercalifragilistic', icon: 'monitor' }, { value: 'b', label: 'Chốngphảnchiếu', icon: 'sun' },
  { value: 'c', label: 'Tối', icon: 'moon' }];

/** a fixed-width container (test-only CSSOM) holding one segmented group */
async function mount(width, { options = THEME, size = 'sm', stretch = false, attrs = '', dir = '', value = '' } = {}) {
  const box = document.createElement('div');
  box.style.width = `${width}px`;
  if (dir) box.setAttribute('dir', dir);
  box.innerHTML = `<input class="before" aria-label="trước"><td-choice-group aria-label="Giao diện" variant="segmented" size="${size}"`
    + `${stretch ? ' stretch' : ''}${value ? ` value="${value}"` : ''} ${attrs}></td-choice-group>`;
  document.body.appendChild(box);
  cleanup.push(() => box.remove());
  const el = box.querySelector('td-choice-group');
  el.options = options;
  await settled(el);
  return { box, el };
}
const rail = (el) => el.querySelector('.td-choice__options');
const faces = (el) => [...el.querySelectorAll('.td-choice__face')];
/** the layout state is written: wait for `data-layout` (attribute signal) + two frames */
async function settled(el) {
  const r = rail(el);
  if (!r.hasAttribute('data-layout')) {
    await new Promise((res, rej) => {
      const mo = new MutationObserver(() => { if (r.hasAttribute('data-layout')) { mo.disconnect(); res(); } });
      mo.observe(r, { attributes: true, attributeFilter: ['data-layout'] });
      setTimeout(() => { mo.disconnect(); rej(new Error('no data-layout')); }, 3000);
    });
  }
  await frames(2);
}
/** the attribute changes (signal) or two frames pass */
async function change(el, attr, fn) {
  const r = rail(el);
  const before = r.getAttribute(attr);
  fn();
  for (let i = 0; i < 6 && r.getAttribute(attr) === before; i++) await frame();
}

/** 'inline' | 'stacked' for one face, from the real boxes of its icon and visible label */
function relation(face) {
  const icon = face.querySelector('.td-choice__icon');
  const text = face.querySelector('.td-choice__text:not(.td-sr-only)');
  if (!icon || !text) return 'single';
  const i = icon.getBoundingClientRect();
  const t = text.getBoundingClientRect();
  if (i.bottom <= t.top + 1) return 'stacked';
  const ic = (i.top + i.bottom) / 2;
  return ic > t.top && ic < t.bottom ? 'inline' : 'other';
}
/** the invariant: one relation for every face, matching data-layout; labels never cut; the page never overflows */
function checkRail(el, tag) {
  const r = rail(el);
  const layout = r.getAttribute('data-layout');
  expect(['equal', 'fit', 'stacked'].includes(layout), `${tag}: data-layout ${layout}`).to.equal(true);
  const rel = faces(el).map(relation).filter((x) => x !== 'single');
  expect(new Set(rel).size <= 1, `${tag}: mixed ${rel.join(',')}`).to.equal(true);
  if (rel.length) expect(rel[0], tag).to.equal(layout === 'stacked' ? 'stacked' : 'inline');
  for (const t of el.querySelectorAll('.td-choice__text:not(.td-sr-only)')) {
    expect(t.scrollWidth <= t.clientWidth + 1, `${tag}: label cut ${t.textContent}`).to.equal(true);
  }
  const over = r.hasAttribute('data-overflow');
  expect(over ? r.scrollWidth > r.clientWidth : r.scrollWidth <= r.clientWidth + 1, `${tag}: overflow ${over} ${r.scrollWidth}/${r.clientWidth}`).to.equal(true);
  expect(document.documentElement.scrollWidth <= window.innerWidth, `${tag}: page overflow`).to.equal(true);
  const box = el.parentElement.getBoundingClientRect();
  const rb = r.getBoundingClientRect();
  expect(rb.left >= box.left - 1 && rb.right <= box.right + 1, `${tag}: rail outside its container`).to.equal(true);
  return { layout, over, rel: rel[0] };
}
/** the face + its focus outline fully inside the rail's visible area (its padding box, the scrollport) */
function insideRail(el, face) {
  const r = rail(el);
  const rb = r.getBoundingClientRect();
  const visL = rb.left + r.clientLeft; // the scrollport = the padding box (the outline lives in the rail padding)
  const visR = visL + r.clientWidth;
  const m = parseFloat(getComputedStyle(face).outlineOffset) + 2;
  const f = face.getBoundingClientRect();
  return f.left - m >= visL - 1 && f.right + m <= visR + 1;
}

describe('segmented layout — the dsuite sidebar (216 px, sm, 3 options, icons)', () => {
  it('stretch: the rail fills 216 px, every segment icon + label inline, equal heights', async () => {
    const { el, box } = await mount(216, { stretch: true, value: 'light' });
    const s = checkRail(el, 'dsuite');
    expect(s.rel).to.equal('inline');
    expect(Math.abs(rail(el).getBoundingClientRect().width - box.getBoundingClientRect().width) <= 1).to.equal(true);
    const hs = faces(el).map((f) => Math.round(f.getBoundingClientRect().height));
    expect(Math.max(...hs) - Math.min(...hs) <= 1).to.equal(true);
  });
});

describe('segmented layout — never mixed (widths × options × labels × stretch × size)', () => {
  for (const size of ['sm', 'md']) {
    for (const [name, options] of [['3 short', THEME], ['5 short', FIVE], ['3 long', LONG]]) {
      it(`${size}, ${name}: one layout at 600 / 360 / 216 / 180 / 140 px, with and without stretch`, async () => {
        for (const stretch of [false, true]) {
          for (const w of [600, 360, 216, 180, 140]) {
            const { el, box } = await mount(w, { options, size, stretch, value: options[1].value });
            const s = checkRail(el, `${size} ${name} ${w} ${stretch ? 'stretch' : ''}`);
            if (stretch || s.layout !== 'equal') {
              expect(Math.abs(rail(el).getBoundingClientRect().width - box.getBoundingClientRect().width) <= 1, `${w} rail width`).to.equal(true);
            }
            if (s.layout === 'equal') {
              const ws = [...el.querySelectorAll('.td-choice__option')].map((o) => o.getBoundingClientRect().width);
              expect(Math.max(...ws) - Math.min(...ws) <= 1, `${w} equal widths ${ws}`).to.equal(true);
            }
            box.remove();
          }
        }
      });
    }
  }

  it('equal heights across levels (sm and md): inline and stacked segments are as tall (labels on one line)', async () => {
    for (const size of ['sm', 'md']) {
      const wide = await mount(600, { size, stretch: true });
      const m = wide.el._segMeasure;
      const fitNeed = m.inline.reduce((a, b) => a + b, 0) + 2 * m.gap + 2 * m.pad;
      const narrow = await mount(Math.ceil(fitNeed) - 2, { size, stretch: true }); // just below fit: stacked, one-line labels
      expect(rail(narrow.el).getAttribute('data-layout')).to.equal('stacked');
      const h = (el) => faces(el)[0].getBoundingClientRect().height;
      expect(Math.abs(h(wide.el) - h(narrow.el)) <= 1, `${size}: ${h(wide.el)} vs ${h(narrow.el)}`).to.equal(true);
    }
  });

  it('a selection change never changes the level (bold placeholder); ± 3 px around a threshold does not flip (hysteresis)', async () => {
    const { el, box } = await mount(216, { stretch: true });
    const m = el._segMeasure;
    expect(!!m).to.equal(true);
    const before = rail(el).getAttribute('data-layout');
    for (const o of THEME) { el.value = o.value; await frames(1); expect(rail(el).getAttribute('data-layout')).to.equal(before); }
    // the fit threshold of this rail, from the component's own measurements and the shared function
    const need = m.inline.reduce((a, b) => a + b, 0) + (m.inline.length - 1) * m.gap + 2 * m.pad;
    box.style.width = `${Math.ceil(need) - 1}px`;
    await change(el, 'data-layout', () => {});
    await frames(2);
    expect(rail(el).getAttribute('data-layout')).to.equal('stacked');
    box.style.width = `${Math.ceil(need) + 2}px`; // < need + hysteresis: stays stacked
    await frames(3);
    expect(rail(el).getAttribute('data-layout')).to.equal('stacked');
    box.style.width = `${Math.ceil(need) + 5}px`;
    await change(el, 'data-layout', () => {});
    expect(rail(el).getAttribute('data-layout')).to.equal('fit');
  });
});

describe('segmented layout — measured from the stacked level (Codex r1 #1) and the content-box room (Codex r1 #2)', () => {
  /** the fit / equal thresholds from measurements taken in the INLINE level (fresh mount, wide) */
  async function thresholds(opts) {
    const { el, box } = await mount(600, opts);
    const m = el._segMeasure;
    const frame = (m.inline.length - 1) * m.gap + 2 * m.pad;
    const out = { inline: [...m.inline], fit: m.inline.reduce((a, b) => a + b, 0) + frame, equal: m.inline.length * Math.max(...m.inline) + frame };
    box.remove();
    return out;
  }

  it('re-measured while stacked (relayout / fonts loadingdone / widening): the inline widths are the inline ones; switch exactly at the threshold, both ways, with hysteresis', async () => {
    const t = await thresholds({ stretch: true });
    for (const trigger of ['relayout', 'loadingdone', 'resize']) {
      const { el, box } = await mount(Math.floor(t.fit) - 20, { stretch: true });
      const L = () => rail(el).getAttribute('data-layout');
      expect(L(), trigger).to.equal('stacked');
      if (trigger === 'relayout') el.relayout();
      if (trigger === 'loadingdone') { document.fonts.dispatchEvent(new Event('loadingdone')); await frames(1); }
      // measured in the stacked level: still the inline widths
      expect(el._segMeasure.inline.every((w, i) => Math.abs(w - t.inline[i]) <= 0.5), `${trigger}: ${el._segMeasure.inline} vs ${t.inline}`).to.equal(true);
      // widening below the threshold + hysteresis keeps stacked; at it → fit (never equal before its own threshold)
      box.style.width = `${Math.ceil(t.fit) + 3}px`;
      await frames(3);
      expect(L(), `${trigger} +3`).to.equal('stacked');
      await change(el, 'data-layout', () => { box.style.width = `${Math.ceil(t.fit) + 4}px`; });
      expect(L(), `${trigger} +4`).to.equal('fit');
      // narrowing: stays fit down to the threshold, stacked one px below it
      box.style.width = `${Math.ceil(t.fit)}px`;
      await frames(3);
      expect(L(), `${trigger} at fit`).to.equal('fit');
      await change(el, 'data-layout', () => { box.style.width = `${Math.floor(t.fit) - 1}px`; });
      expect(L(), `${trigger} −1`).to.equal('stacked');
      box.remove();
    }
  });

  it('the room is the host CONTENT box (padding + border excluded)', async () => {
    const t = await thresholds({ stretch: true });
    // a host whose border-box is wide enough for fit but whose content box is not
    const { el, box } = await mount(Math.ceil(t.fit) + 30, { stretch: true, attrs: 'class="td-test-padded-host"' });
    const style = document.createElement('style');
    style.textContent = '.td-test-padded-host { box-sizing: border-box; padding: 0 12px; border: 4px solid; }';
    document.head.appendChild(style);
    cleanup.push(() => style.remove());
    el.relayout();
    const cs = getComputedStyle(el);
    const content = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    expect(Math.abs(el._segMeasure.avail - content) <= 0.5, `${el._segMeasure.avail} vs ${content}`).to.equal(true);
    expect(rail(el).getAttribute('data-layout')).to.equal(content >= t.fit ? 'fit' : 'stacked');
    expect(content < t.fit).to.equal(true); // the case is meaningful
    box.remove();
  });
});

describe('segmented layout — overflow: the rail scrolls itself, never the page (mouse)', () => {
  it('one long unbreakable word: data-overflow exactly when minRail > room (same function), labels whole', async () => {
    for (const w of [216, 180]) {
      const { el, box } = await mount(w, { options: WORD, stretch: true });
      const m = el._segMeasure;
      const want = decideLayout({ avail: m.avail, inline: m.inline, min: m.min, gap: m.gap, pad: m.pad });
      const s = checkRail(el, `word ${w}`);
      expect(s.over, `${w}`).to.equal(want.overflow);
      expect(s.layout).to.equal(want.layout);
      box.remove();
    }
  });
});

describe('segmented layout — re-measure triggers (QĐ 2)', () => {
  it('1. the host width (ResizeObserver)', async () => {
    const { el, box } = await mount(600, { stretch: true });
    expect(rail(el).getAttribute('data-layout')).to.equal('equal');
    await change(el, 'data-layout', () => { box.style.width = '150px'; });
    expect(rail(el).getAttribute('data-layout')).to.equal('stacked');
  });

  it('2. document.fonts loadingdone (a font change that keeps the font-size and the width)', async () => {
    const { el, box } = await mount(240, { stretch: true });
    const before = rail(el).getAttribute('data-layout');
    box.classList.add('td-test-wide-letters');
    const style = document.createElement('style'); // test-only (WTR page has no CSP)
    style.textContent = '.td-test-wide-letters .td-choice__text { letter-spacing: 0.4em; }';
    document.head.appendChild(style);
    cleanup.push(() => style.remove());
    await frames(3);
    expect(rail(el).getAttribute('data-layout')).to.equal(before); // not observed
    await change(el, 'data-layout', () => document.fonts.dispatchEvent(new Event('loadingdone')));
    expect(rail(el).getAttribute('data-layout') === before).to.equal(false);
  });

  it('3. size / stretch / icon-only / options (re-assigned and patched in place)', async () => {
    const { el } = await mount(200, { size: 'md' });
    const L = () => rail(el).getAttribute('data-layout');
    expect(L()).to.equal('stacked');
    el.setAttribute('size', 'sm');
    await settled(el);
    const sm = L();
    el.setAttribute('icon-only', '');
    await settled(el);
    expect(L()).to.equal('equal');
    el.removeAttribute('icon-only');
    await settled(el);
    expect(L()).to.equal(sm);
    el.options = THEME.map((o) => ({ ...o, label: o.value === 'auto' ? 'Tự động theo hệ thống' : o.label })); // same values: patched
    await change(el, 'data-layout', () => {});
    expect(L()).to.equal('stacked');
    el.options = [{ value: 'x', label: 'A', icon: 'sun' }, { value: 'y', label: 'B', icon: 'moon' }]; // re-rendered
    await settled(el);
    expect(L()).to.equal('equal');
    const { el: s } = await mount(600);
    expect(Math.abs(rail(s).getBoundingClientRect().width - s.getBoundingClientRect().width) <= 1).to.equal(false);
    s.setAttribute('stretch', '');
    await frames(2);
    expect(Math.abs(rail(s).getBoundingClientRect().width - s.getBoundingClientRect().width) <= 1).to.equal(true);
    expect(s.stretch).to.equal(true);
  });

  it('3b. the pointer media query change re-measures', async () => {
    const { el } = await mount(216, { stretch: true });
    let calls = 0;
    const orig = el._measureSegments.bind(el);
    el._measureSegments = () => { calls += 1; return orig(); };
    el._coarseMql?.dispatchEvent(new Event('change'));
    await frames(1);
    expect(calls >= 1).to.equal(true);
  });

  it('4 + 5. a raw token edit with an unchanged host width needs relayout()', async () => {
    const { el, box } = await mount(260, { stretch: true });
    expect(rail(el).getAttribute('data-layout')).to.equal('equal');
    const style = document.createElement('style');
    style.textContent = '.td-test-wide-px td-choice-group { --td-choice-seg-px: 2rem; } .td-test-wide-px .td-choice--sm { --td-choice-seg-px: 2rem; }';
    document.head.appendChild(style);
    cleanup.push(() => style.remove());
    box.classList.add('td-test-wide-px');
    await frames(3);
    expect(rail(el).getAttribute('data-layout')).to.equal('equal'); // not observed
    el.relayout();
    expect(rail(el).getAttribute('data-layout') === 'equal').to.equal(false);
  });

  it('hidden host: no decision while 0 wide; the right one when shown', async () => {
    const box = document.createElement('div');
    box.style.width = '216px';
    box.hidden = true;
    box.innerHTML = '<td-choice-group aria-label="G" variant="segmented" size="sm" stretch></td-choice-group>';
    document.body.appendChild(box);
    cleanup.push(() => box.remove());
    const el = box.querySelector('td-choice-group');
    el.options = THEME;
    await frames(2);
    box.hidden = false;
    await settled(el);
    expect(checkRail(el, 'shown').rel).to.equal('inline');
  });
});

describe('segmented layout — focus + value reveal in an overflowing rail (QĐ 5b)', () => {
  for (const dir of ['ltr', 'rtl']) {
    it(`${dir}: arrows through every option and back — face + outline inside the rail, page never scrolls, one input + change each`, async () => {
      const { el } = await mount(140, { options: FIVE, stretch: true, dir, value: 'auto' });
      expect(rail(el).hasAttribute('data-overflow')).to.equal(true);
      expect(insideRail(el, faces(el)[0])).to.equal(true); // first option visible on first paint (right edge in RTL)
      const log = [];
      el.addEventListener('input', (e) => log.push(`i:${e.detail.value}`));
      el.addEventListener('change', (e) => log.push(`c:${e.detail.value}`));
      const sx = window.scrollX;
      const sy = window.scrollY;
      el.parentElement.querySelector('.before').focus();
      await sendKeys({ press: TAB });
      // Down / Up = next / previous in both directions (the horizontal arrows of a native radio group follow the
      // engine's RTL mapping — not what this test is about)
      const fwd = 'ArrowDown';
      const back = 'ArrowUp';
      const vals = FIVE.map((o) => o.value);
      for (let i = 1; i < vals.length; i++) {
        await sendKeys({ press: fwd });
        await frames(2);
        expect(el.value, `→ ${i}`).to.equal(vals[i]);
        expect(insideRail(el, faces(el)[i]), `${dir} → ${vals[i]} inside`).to.equal(true);
        expect(window.scrollX === sx && window.scrollY === sy, 'page scrolled').to.equal(true);
      }
      for (let i = vals.length - 2; i >= 0; i--) {
        await sendKeys({ press: back });
        await frames(2);
        expect(insideRail(el, faces(el)[i]), `${dir} ← ${vals[i]} inside`).to.equal(true);
        expect(window.scrollX === sx && window.scrollY === sy, 'page scrolled').to.equal(true);
      }
      expect(log.length).to.equal(2 * 2 * (vals.length - 1));
    });

    it(`${dir}: value = an off-screen option (both ends) → that face fully inside the rail, page never scrolls`, async () => {
      const { el } = await mount(140, { options: FIVE, stretch: true, dir, value: 'auto' });
      const sx = window.scrollX;
      const sy = window.scrollY;
      el.value = 'sys';
      await frames(2);
      expect(insideRail(el, faces(el)[4])).to.equal(true);
      el.value = 'auto';
      await frames(2);
      expect(insideRail(el, faces(el)[0])).to.equal(true);
      expect(window.scrollX === sx && window.scrollY === sy).to.equal(true);
    });
  }

  it('overflowing rail: out of the Tab order itself (one Tab stop = the radios); a click focuses the clicked radio in every engine', async () => {
    const { el, box } = await mount(140, { options: FIVE, stretch: true, value: 'auto' });
    const r = rail(el);
    expect(r.hasAttribute('data-overflow') && r.getAttribute('tabindex') === '-1').to.equal(true);
    box.querySelector('.before').focus();
    await sendKeys({ press: TAB });
    expect(document.activeElement?.classList.contains('td-choice__input') && document.activeElement.value === 'auto').to.equal(true);
    const f = faces(el)[1].getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(f.left + f.width / 2), Math.round(f.top + f.height / 2)] });
    await frames(1);
    expect(el.value).to.equal('light');
    expect(document.activeElement === el.querySelectorAll('.td-choice__input')[1]).to.equal(true);
    const { el: wide } = await mount(600, { stretch: true });
    expect(rail(wide).hasAttribute('tabindex')).to.equal(false);
  });

  it('a click on the transparent radio selects its segment; button / swatch keep the 1 × 1 radio', async () => {
    const { el } = await mount(360, { stretch: true });
    const r = faces(el)[2].getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await frames(1);
    expect(el.value).to.equal('dark');
    const seg = el.querySelector('.td-choice__input').getBoundingClientRect();
    expect(seg.width > 10 && seg.height > 10).to.equal(true);
    const box = document.createElement('div');
    box.innerHTML = '<td-choice-group aria-label="B"></td-choice-group>';
    document.body.appendChild(box);
    cleanup.push(() => box.remove());
    const b = box.querySelector('td-choice-group');
    b.options = [{ value: '1', label: 'Một' }];
    await frames(1);
    const r1 = b.querySelector('.td-choice__input').getBoundingClientRect();
    expect(r1.width <= 1 && r1.height <= 1).to.equal(true);
    expect(b.querySelector('.td-choice__options').hasAttribute('data-layout')).to.equal(false);
    expect(el instanceof TdChoiceGroup).to.equal(true);
  });
});
