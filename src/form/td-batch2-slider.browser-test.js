import { expect } from '@esm-bundle/chai';
import './td-slider.js';
import { TdButton } from './td-button.js';
import { sendKeys, sendMouse, resetMouse, emulateMedia } from '@web/test-runner-commands';

// Batch 2 — td-slider (plan docs/plans/v0.8.0-batch2.md step 3: D11/D12/D14/D16). td.css only, no Tailwind.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(async () => {
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const lum = (c) => TdButton._luminance(c);
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function pageBg() {
  const probe = document.createElement('div');
  probe.style.background = 'var(--td-color-bg)';
  host.appendChild(probe);
  const c = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return c;
}
const scaleOf = (el) => {
  const t = getComputedStyle(el).transform;
  if (t === 'none') return 1;
  const [a, b] = /matrix\(([^)]+)\)/.exec(t)[1].split(',').map(Number);
  return Math.hypot(a, b);
};

/* Contract shape with the a11y attributes of plan step 7 (ISSUE-10). */
const KEEP = ['type', 'role', 'aria-selected', 'aria-current', 'aria-disabled', 'aria-controls', 'aria-labelledby',
  'aria-describedby', 'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-live', 'aria-hidden', 'aria-label',
  'data-state', 'for', 'id', 'tabindex', 'hidden', 'data-td-icon', 'data-icon'];
function shape(el) {
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
  const cls = [...el.classList].sort().join('.');
  return { tag: el.localName, cls, attrs, kids: [...el.children].map(shape) };
}

describe('batch 2 — td-slider structure', () => {
  it('renders the BEM contract; legacy classes and redundant ARIA are gone', () => {
    const el = mount('<td-slider id="s1" label="Âm lượng" value="30" show-label show-step-labels></td-slider>');
    const input = el.querySelector('.td-slider.td-slider--md .td-slider__control input.td-slider__input[type="range"]');
    expect(input !== null).to.equal(true);
    expect(input.id).to.equal('s1-control');
    expect(input.hasAttribute('role')).to.equal(false);
    expect(['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].some((a) => input.hasAttribute(a))).to.equal(false);
    expect(el.querySelector('.td-slider__thumb[aria-hidden="true"]') !== null).to.equal(true);
    expect(el.querySelector('output.td-slider__value').textContent).to.equal('30');
    expect(el.querySelector('.td-slider__range').textContent).to.equal('0100');
    expect(el.querySelector('.td-slider-container, .td-slider-input, .td-slider-thumb, .td-slider-wrap') === null).to.equal(true);
    expect(el.querySelector('[style]') === null).to.equal(true); // no inline style markup (only host CSSOM)
    expect(el.style.getPropertyValue('--td-slider-pct')).to.equal('0.3');
  });

  it('matches the golden contract test/contracts/slider.html (incl. a11y attributes)', async () => {
    const html = await (await fetch('/test/contracts/slider.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tpls = [...doc.querySelectorAll('template')];
    expect(tpls.length).to.equal(3);
    for (const t of tpls) {
      host.innerHTML = t.getAttribute('data-markup');
      expect(shape(host.firstElementChild.firstElementChild)).to.deep.equal(shape(t.content.firstElementChild));
      host.innerHTML = '';
    }
  });

  it('width token: 200/300/400 px by size, --td-slider-w overrides, never wider than the container', () => {
    const w = (html) => mount(html).querySelector('.td-slider').getBoundingClientRect().width;
    expect(w('<td-slider size="sm"></td-slider>')).to.equal(200);
    expect(w('<td-slider></td-slider>')).to.equal(300);
    expect(w('<td-slider size="lg"></td-slider>')).to.equal(400);
    const narrow = mount('<div><td-slider size="lg"></td-slider></div>');
    narrow.style.width = '150px';
    expect(narrow.querySelector('.td-slider').getBoundingClientRect().width).to.equal(150);
    const custom = mount('<td-slider></td-slider>');
    custom.style.setProperty('--td-slider-w', '250px');
    expect(custom.querySelector('.td-slider').getBoundingClientRect().width).to.equal(250);
  });

  it('hit area ≥ 24 px for every size; the native range covers the whole control', () => {
    for (const size of ['sm', 'md', 'lg']) {
      const el = mount(`<td-slider size="${size}" aria-label="x"></td-slider>`);
      const c = el.querySelector('.td-slider__control').getBoundingClientRect();
      const i = el.querySelector('.td-slider__input').getBoundingClientRect();
      expect(c.height).to.be.at.least(24);
      expect([i.left, i.top, i.width, i.height]).to.deep.equal([c.left, c.top, c.width, c.height]);
    }
  });
});

describe('batch 2 — td-slider value, keyboard, events', () => {
  it('aria-valuetext + labels are formatted to the step decimals', () => {
    const el = mount('<td-slider aria-label="x" min="0" max="1" step="0.1" value="0.3" show-label></td-slider>');
    const input = el.querySelector('input');
    expect(input.getAttribute('aria-valuetext')).to.equal('0.3');
    el.setValue(0.1 + 0.2); // 0.30000000000000004
    expect(input.getAttribute('aria-valuetext')).to.equal('0.3');
    expect(el.querySelector('.td-slider__value').textContent).to.equal('0.3');
  });

  it('trusted ArrowRight / Home / End change the value with exactly one input + one change each', async () => {
    const el = mount('<td-slider aria-label="x" value="50" show-label></td-slider>');
    const input = el.querySelector('input');
    const got = [];
    for (const type of ['input', 'change']) {
      host.addEventListener(type, (e) => got.push(`${type}:${e instanceof CustomEvent ? e.detail.value : 'native'}`));
    }
    input.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(got).to.deep.equal(['input:51', 'change:51']);
    expect(el.getAttribute('value')).to.equal('51');
    expect(el.querySelector('.td-slider__value').textContent).to.equal('51');
    expect(input.getAttribute('aria-valuetext')).to.equal('51');
    got.length = 0;
    await sendKeys({ press: 'Home' });
    expect(got).to.deep.equal(['input:0', 'change:0']);
    expect(el.style.getPropertyValue('--td-slider-pct')).to.equal('0');
    got.length = 0;
    await sendKeys({ press: 'End' });
    expect(got).to.deep.equal(['input:100', 'change:100']);
    expect(el.getValue()).to.equal(100);
    // updates are in place: same input, focus kept
    expect(el.querySelector('input') === input).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
  });

  it('value attribute / setValue update in place (focus kept) and clamp', () => {
    const form = mount('<form><td-slider name="v" aria-label="x" value="10"></td-slider></form>');
    const el = form.querySelector('td-slider');
    const input = el.querySelector('input');
    input.focus();
    el.setAttribute('value', '40');
    expect(el.querySelector('input') === input).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
    expect(el.style.getPropertyValue('--td-slider-pct')).to.equal('0.4');
    el.setValue(500);
    expect(el.getAttribute('value')).to.equal('100');
    expect(new FormData(form).get('v')).to.equal('100');
  });

  it('pointer ↔ value mapping matches the decorative thumb (trusted mouse)', async () => {
    const el = mount('<td-slider aria-label="x" value="0"></td-slider>');
    const c = el.querySelector('.td-slider__control').getBoundingClientRect();
    const thumbW = el.querySelector('.td-slider__thumb').getBoundingClientRect().width;
    const y = Math.round(c.top + c.height / 2);
    // Point at the centre the decorative thumb has at 75 % → the native value must be 75.
    const x = c.left + thumbW / 2 + 0.75 * (c.width - thumbW);
    await sendMouse({ type: 'click', position: [Math.round(x), y] });
    expect(Math.abs(el.getValue() - 75)).to.be.at.most(1);
    const t = el.querySelector('.td-slider__thumb').getBoundingClientRect();
    expect(Math.abs(t.left + t.width / 2 - x)).to.be.at.most(2);
  });
});

describe('batch 2 — td-slider marks', () => {
  it('renders one mark per step up to 50, with step-formatted labels', () => {
    const el = mount('<td-slider aria-label="x" min="0" max="0.3" step="0.1" show-step-marks></td-slider>');
    const labels = [...el.querySelectorAll('.td-slider__mark-label')].map((n) => n.textContent);
    expect(labels).to.deep.equal(['0', '0.1', '0.2', '0.3']);
    const marks = [...el.querySelectorAll('.td-slider__mark')].map((m) => m.style.getPropertyValue('--td-slider-mark'));
    expect(marks[0]).to.equal('0');
    expect(marks[3]).to.equal('1');
    expect(el.querySelector('.td-slider__range') === null).to.equal(true);
  });

  it('caps marks: > 50 steps → no marks + one console.warn', () => {
    const warn = console.warn;
    const calls = [];
    console.warn = (...a) => calls.push(a.join(' '));
    try {
      const el = mount('<td-slider aria-label="x" min="0" max="10000" step="1" show-step-marks></td-slider>');
      expect(el.querySelectorAll('.td-slider__mark').length).to.equal(0);
      expect(calls.length).to.equal(1);
      const ok = mount('<td-slider aria-label="x" min="0" max="50" step="1" show-step-marks></td-slider>');
      expect(ok.querySelectorAll('.td-slider__mark').length).to.equal(51);
    } finally {
      console.warn = warn;
    }
  });
});

describe('batch 2 — td-slider focus, dragging, contrast', () => {
  it('focus ring visible on the thumb via trusted Tab (:focus-visible ~ thumb)', async () => {
    const wrap = mount('<div><button type="button">trước</button><td-slider aria-label="x" value="50"></td-slider></div>');
    wrap.querySelector('button').focus();
    await sendKeys({ press: 'Tab' });
    const input = wrap.querySelector('.td-slider__input');
    expect(document.activeElement === input).to.equal(true);
    expect(input.matches(':focus-visible')).to.equal(true);
    const thumb = wrap.querySelector('.td-slider__thumb');
    await wait(250); // box-shadow transition
    const shadow = getComputedStyle(thumb).boxShadow;
    expect(shadow).to.contain('3px'); // --td-focus-ring: 0 0 0 3px rgb(37 99 235 / 35%)
    expect(shadow).to.match(/rgba\(37, 99, 235/);
    input.blur();
    await wait(250);
    expect(getComputedStyle(thumb).boxShadow).to.not.match(/rgba\(37, 99, 235, 0\.35\) 0px 0px 0px 3px/);
  });

  it('[data-dragging] set on pointerdown, cleared on pointerup (even outside) and pointercancel', () => {
    const el = mount('<td-slider aria-label="x" value="50"></td-slider>');
    const root = el.querySelector('.td-slider');
    const input = el.querySelector('input');
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(root.hasAttribute('data-dragging')).to.equal(true);
    expect(el.isDragging).to.equal(true);
    document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(root.hasAttribute('data-dragging')).to.equal(false);
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    expect(root.hasAttribute('data-dragging')).to.equal(false);
    const dis = mount('<td-slider aria-label="x" disabled></td-slider>');
    dis.querySelector('input').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(dis.querySelector('.td-slider').hasAttribute('data-dragging')).to.equal(false);
  });

  it('trusted drag: knob lifts while pressed, one change on release', async () => {
    const el = mount('<td-slider aria-label="x" value="0"></td-slider>');
    const changes = [];
    host.addEventListener('change', (e) => changes.push(e.detail.value));
    const c = el.querySelector('.td-slider__control').getBoundingClientRect();
    const y = Math.round(c.top + c.height / 2);
    await sendMouse({ type: 'move', position: [Math.round(c.left + 5), y] });
    await sendMouse({ type: 'down' });
    const root = el.querySelector('.td-slider');
    expect(root.hasAttribute('data-dragging')).to.equal(true);
    await wait(350); // transition settles
    expect(scaleOf(el.querySelector('.td-slider__thumb'))).to.be.closeTo(1.15, 0.01);
    await sendMouse({ type: 'move', position: [Math.round(c.left + c.width / 2), y] });
    await sendMouse({ type: 'up' });
    expect(root.hasAttribute('data-dragging')).to.equal(false);
    expect(changes.length).to.equal(1);
    expect(Math.abs(changes[0] - 50)).to.be.at.most(2);
  });

  it('reduced motion: the dragged knob does not scale', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const el = mount('<td-slider aria-label="x" value="50"></td-slider>');
    el.querySelector('input').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(scaleOf(el.querySelector('.td-slider__thumb'))).to.equal(1);
    document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  for (const theme of ['light', 'dark']) {
    it(`thumb boundary ≥ 3:1 against the page (${theme})`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const el = mount('<td-slider aria-label="x" value="50"></td-slider>');
      const thumb = el.querySelector('.td-slider__thumb');
      const bg = pageBg();
      expect(ratio(getComputedStyle(thumb).borderTopColor, bg)).to.be.at.least(3);
      expect(ratio(getComputedStyle(el.querySelector('.td-slider__fill')).backgroundColor, bg)).to.be.at.least(3);
    });
  }

  it('color accepts any safe colour (host CSSOM) and track-color is applied', () => {
    const el = mount('<td-slider aria-label="x" color="rgb(22, 163, 74)" track-color="#fde68a"></td-slider>');
    expect(el.style.getPropertyValue('--td-slider-color')).to.equal('rgb(22, 163, 74)');
    expect(getComputedStyle(el.querySelector('.td-slider__fill')).backgroundColor).to.equal('rgb(22, 163, 74)');
    expect(getComputedStyle(el.querySelector('.td-slider__thumb')).borderTopColor).to.equal('rgb(22, 163, 74)');
    expect(getComputedStyle(el.querySelector('.td-slider__track')).backgroundColor).to.equal('rgb(253, 230, 138)');
    el.setAttribute('color', 'purple');
    expect(el.style.getPropertyValue('--td-slider-color')).to.equal('purple');
    el.removeAttribute('track-color');
    expect(el.style.getPropertyValue('--td-slider-track')).to.equal('');
  });

  it('xss: malicious color / track-color never reach CSSOM; label is escaped', () => {
    window.__xss = false;
    const payload = '"><img src=x onerror="window.__xss=true">';
    const el = mount(`<td-slider value="50" color='${payload}' track-color="red;}html{display:none" label='${payload}'></td-slider>`);
    expect(el.style.getPropertyValue('--td-slider-color')).to.equal('');
    expect(el.style.getPropertyValue('--td-slider-track')).to.equal('');
    expect(el.querySelector('img') === null).to.equal(true);
    expect(el.querySelector('.td-slider__label').textContent).to.equal(payload);
    expect(window.__xss).to.equal(false);
  });
});

describe('batch 2 — td-slider naming + error contract', () => {
  it('accessible name: label → aria-labelledby; host aria-label; external <label for>', () => {
    const a = mount('<td-slider id="nm-a" label="Âm lượng"></td-slider>');
    const ai = a.querySelector('input');
    expect(ai.getAttribute('aria-labelledby')).to.equal('nm-a-label');
    expect(document.getElementById('nm-a-label').textContent).to.equal('Âm lượng');
    expect(ai.hasAttribute('aria-label')).to.equal(false);

    const b = mount('<td-slider aria-label="Độ sáng"></td-slider>');
    const bi = b.querySelector('input');
    expect(bi.getAttribute('aria-label')).to.equal('Độ sáng');
    b.setAttribute('aria-label', 'Tương phản'); // in place
    expect(b.querySelector('input') === bi).to.equal(true);
    expect(bi.getAttribute('aria-label')).to.equal('Tương phản');

    const wrap = mount('<div><label for="nm-c">Nhãn ngoài</label><td-slider id="nm-c"></td-slider></div>');
    const ids = wrap.querySelector('input').getAttribute('aria-labelledby');
    expect(document.getElementById(ids).textContent).to.equal('Nhãn ngoài');
  });

  it('error contract: API, attribute, describedby merge, re-render survival, reset', () => {
    const form = mount('<form><td-slider id="er" name="v" value="20" label="Ngưỡng"></td-slider></form>');
    const el = form.querySelector('td-slider');
    const input = () => el.querySelector('input');
    input().setAttribute('aria-describedby', 'page-hint');
    el.setError('Giá trị không hợp lệ');
    const note = el.querySelector('.td-slider > .td-field-error');
    expect(note.textContent).to.equal('Giá trị không hợp lệ');
    expect(note.id).to.equal('er-error');
    expect(el.errorMessage).to.equal('Giá trị không hợp lệ');
    expect(input().getAttribute('aria-invalid')).to.equal('true');
    expect(input().getAttribute('aria-errormessage')).to.equal('er-error');
    expect(input().getAttribute('aria-describedby')).to.equal('page-hint er-error');
    el.clearError();
    expect(el.querySelector('.td-field-error') === null).to.equal(true);
    expect(input().hasAttribute('aria-invalid')).to.equal(false);
    expect(input().getAttribute('aria-describedby')).to.equal('page-hint');

    const kept = input();
    el.setAttribute('error-text', 'Từ server'); // no re-render
    expect(input() === kept).to.equal(true);
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
    el.setAttribute('size', 'lg'); // re-render keeps the error
    expect(el.querySelector('.td-slider--lg > .td-field-error').textContent).to.equal('Từ server');
    expect(input().getAttribute('aria-invalid')).to.equal('true');
    expect(input().getAttribute('aria-describedby')).to.equal('er-error');
    el.setDisabled(true); // disabled routes through the base (effective-disabled + re-render)
    expect(input().disabled).to.equal(true);
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
    el.setDisabled(false);
    el.setValue(80);
    form.reset();
    expect(el.querySelector('.td-field-error') === null).to.equal(true);
    expect(input().hasAttribute('aria-invalid')).to.equal(false);
    expect(el.getAttribute('value')).to.equal('20');
  });
});
