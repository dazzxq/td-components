// v0.36.0 (plan docs/internal/plans/v0.36.0-polish.md QĐ 28–40, ADR 0016) — TdToast six logical placements in
// Chromium, Firefox AND WebKit: geometry of each stack (offset tokens; env() is 0 here), newest nearest the edge,
// per-placement enter direction (+ RTL, reduced motion), precedence call > configure > legacy tokens > top-end,
// snapshot at show(), ONE global MAX_VISIBLE / FIFO / clear / pause / layer, < 480 lanes, short viewport = 2 newest.
// Real signals only (MutationObserver on data-state, animations finished, rAF) — no fixed sleeps before geometry.
import { expect } from '@esm-bundle/chai';
import { setViewport, emulateMedia, sendMouse, sendKeys } from '@web/test-runner-commands';
import { TdToast } from './td-toast.js';
import { LAYERS, register, trapContainers, trapTab } from '../utils/layers.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const root = document.documentElement;
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;

/** resolve once `pred()` is truthy (checked on every DOM mutation) */
function until(pred) {
  return new Promise((resolve) => {
    const v = pred();
    if (v) { resolve(v); return; }
    const mo = new MutationObserver(() => {
      const r = pred();
      if (r) { mo.disconnect(); resolve(r); }
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  });
}

async function settle() {
  await raf();
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  await raf();
}

/** show via the public API and resolve with the toast once it is open + settled */
async function showOpen(msg, type = 'info', opts = 0) {
  const before = new Set(document.querySelectorAll('.td-toast'));
  TdToast.show(msg, type, opts);
  const t = await until(() => [...document.querySelectorAll('.td-toast[data-state="open"]')].find((n) => !before.has(n)));
  await settle();
  return t;
}

async function clearAll() {
  TdToast.clear();
  await until(() => !document.querySelector('.td-toast'));
}

const LEGACY_TOKENS = ['--td-toast-top', '--td-toast-bottom', '--td-toast-inline-start', '--td-toast-inline-end',
  '--td-toast-shift', '--td-toast-align'];
let warn;
let warnings = [];
beforeEach(async () => {
  await emulateMedia({ reducedMotion: 'reduce' });
  warnings = [];
  warn = console.warn;
  console.warn = (...a) => { warnings.push(a.join(' ')); };
});
afterEach(async () => {
  console.warn = warn;
  await clearAll();
  TdToast.configure({ placement: null });
  for (const t of LEGACY_TOKENS) root.style.removeProperty(t);
  root.removeAttribute('dir');
  await emulateMedia({ reducedMotion: 'no-preference' });
});
after(async () => { await setViewport({ width: 800, height: 600 }); });

describe('v0.36.0 TdToast placement — DOM', () => {
  it('one portal root (id kept) > two lanes > lazy stacks; TdToast.PLACEMENTS frozen', async () => {
    expect(TdToast.PLACEMENTS).to.deep.equal(['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']);
    expect(Object.isFrozen(TdToast.PLACEMENTS)).to.equal(true);
    await setViewport({ width: 1280, height: 800 });
    const t = await showOpen('Một', 'info', { placement: 'bottom-start' });
    const c = TdToast.container;
    expect(c.id).to.equal('td-toast-container');
    expect(c.className).to.equal('td-toast-root');
    expect(document.querySelectorAll('#td-toast-container').length).to.equal(1);
    const lanes = [...c.children].map((n) => `${n.className}:${n.getAttribute('data-edge')}`);
    expect(lanes).to.deep.equal(['td-toast-lane:top', 'td-toast-lane:bottom']);
    expect(c.querySelectorAll('.td-toasts').length, 'stacks are lazy').to.equal(1);
    expect(t.parentElement.matches('.td-toast-lane[data-edge="bottom"] > .td-toasts[data-placement="bottom-start"]')).to.equal(true);
    // the only inline property is the CSSOM sequence
    const styled = [...c.querySelectorAll('[style]')];
    expect(styled.every((n) => n.style.length === 1 && n.style[0] === '--_td-toast-seq')).to.equal(true);
    expect(getComputedStyle(c).position).to.equal('fixed');
    expect(getComputedStyle(c).pointerEvents).to.equal('none');
  });
});

describe('v0.36.0 TdToast placement — six positions (1280×800)', () => {
  const W = 1280;
  const H = 800;
  const cases = {
    'top-start': (r) => near(r.top, 80) && near(r.left, 16),
    'top-center': (r) => near(r.top, 80) && near((r.left + r.right) / 2, W / 2, 1),
    'top-end': (r) => near(r.top, 80) && near(r.right, W - 16),
    'bottom-start': (r) => near(r.bottom, H - 16) && near(r.left, 16),
    'bottom-center': (r) => near(r.bottom, H - 16) && near((r.left + r.right) / 2, W / 2, 1),
    'bottom-end': (r) => near(r.bottom, H - 16) && near(r.right, W - 16),
  };
  for (const [p, ok] of Object.entries(cases)) {
    it(`${p}: the toast sits at its edge ± the offset tokens`, async () => {
      await setViewport({ width: W, height: H });
      const t = await showOpen(`Vị trí ${p}`, 'success', { placement: p });
      const r = t.getBoundingClientRect();
      expect(ok(r), `${p}: ${r.left},${r.top}–${r.right},${r.bottom}`).to.equal(true);
    });
  }

  it('the offset tokens move the named stacks; the safe-area floor is in the rule (env() = 0 here)', async () => {
    await setViewport({ width: W, height: H });
    root.style.setProperty('--td-toast-offset-top', '0px');
    root.style.setProperty('--td-toast-offset-inline', '40px');
    try {
      const t = await showOpen('Offset', 'info', { placement: 'top-start' });
      const r = t.getBoundingClientRect();
      expect(near(r.top, 8), `top ${r.top} (8px floor)`).to.equal(true);
      expect(near(r.left, 40), `left ${r.left}`).to.equal(true);
    } finally {
      root.style.removeProperty('--td-toast-offset-top');
      root.style.removeProperty('--td-toast-offset-inline');
    }
  });

  it('RTL: *-start anchors to the physical right, *-end to the physical left', async () => {
    await setViewport({ width: W, height: H });
    root.setAttribute('dir', 'rtl');
    const s = await showOpen('Bắt đầu', 'info', { placement: 'top-start' });
    const e = await showOpen('Kết thúc', 'info', { placement: 'bottom-end' });
    const vw = document.documentElement.clientWidth;
    expect(near(vw - s.getBoundingClientRect().right, 16), 'start → right').to.equal(true);
    expect(near(e.getBoundingClientRect().left, 16), 'end → left').to.equal(true);
  });
});

describe('v0.36.0 TdToast placement — order + motion', () => {
  it('newest nearest the edge: top stacks prepend, bottom stacks append', async () => {
    await setViewport({ width: 1280, height: 800 });
    const a = await showOpen('A', 'info', { placement: 'top-end' });
    const b = await showOpen('B', 'info', { placement: 'top-end' });
    expect(b.getBoundingClientRect().top < a.getBoundingClientRect().top, 'top: B above A').to.equal(true);
    const c = await showOpen('C', 'info', { placement: 'bottom-center' });
    const d = await showOpen('D', 'info', { placement: 'bottom-center' });
    expect(d.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom, 'bottom: D below C').to.equal(true);
  });

  /** translate (x, y) of a toast's computed transform in the entering state */
  const translate = (t) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform === 'none' ? undefined : getComputedStyle(t).transform);
    return [m.m41, m.m42];
  };

  it('enter direction per placement (read in the entering state), mirrored in RTL', async () => {
    await emulateMedia({ reducedMotion: 'no-preference' });
    await setViewport({ width: 1280, height: 800 });
    const dir = {};
    for (const p of TdToast.PLACEMENTS) dir[p] = translate(TdToast._showSingle(p, 'info', 0, p));
    expect(dir['top-end'][0] > 0 && dir['bottom-end'][0] > 0, `end from the right ${dir['top-end']}`).to.equal(true);
    expect(dir['top-start'][0] < 0 && dir['bottom-start'][0] < 0, `start from the left ${dir['top-start']}`).to.equal(true);
    expect(dir['top-center'][0] === 0 && dir['top-center'][1] < 0, `top-center from above ${dir['top-center']}`).to.equal(true);
    expect(dir['bottom-center'][0] === 0 && dir['bottom-center'][1] > 0, `bottom-center from below ${dir['bottom-center']}`).to.equal(true);
    await clearAll();
    root.setAttribute('dir', 'rtl');
    const s = translate(TdToast._showSingle('s', 'info', 0, 'top-start'));
    const e = translate(TdToast._showSingle('e', 'info', 0, 'top-end'));
    expect(s[0] > 0 && e[0] < 0, `rtl start ${s} end ${e}`).to.equal(true);
  });

  it('closing (evicted / dismissed) leaves toward the same edge', async () => {
    await emulateMedia({ reducedMotion: 'no-preference' });
    await setViewport({ width: 1280, height: 800 });
    const t = TdToast._showSingle('x', 'info', 0, 'bottom-start');
    await until(() => t.getAttribute('data-state') === 'open');
    t._removeToast();
    await raf();
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform);
    // the transition is running toward translateX(-shift): sample the end state from the computed value of `transform`
    // at the transition's end via getAnimations (CSS transitions expose their keyframes)
    const anim = t.getAnimations().find((a) => a.transitionProperty === 'transform');
    const to = anim ? anim.effect.getKeyframes().at(-1).transform : getComputedStyle(t).transform;
    const end = new DOMMatrixReadOnly(to === 'none' ? undefined : to);
    expect(end.m41 < 0 || m.m41 < 0, `exit toward inline start: ${to}`).to.equal(true);
  });

  it('reduced motion: no transform in any state (fade only)', async () => {
    await setViewport({ width: 1280, height: 800 });
    for (const p of ['top-start', 'bottom-center']) {
      const t = TdToast._showSingle(p, 'info', 0, p);
      expect(getComputedStyle(t).transform, p).to.equal('none');
    }
  });
});

describe('v0.36.0 TdToast placement — precedence + snapshot', () => {
  const stackOf = (t) => t.parentElement.getAttribute('data-placement') || 'legacy';

  it('default (no tokens changed): no placement and a top-end call share ONE stack', async () => {
    await setViewport({ width: 1280, height: 800 });
    const a = await showOpen('Không vị trí', 'info');
    const b = await showOpen('top-end', 'info', { placement: 'top-end' });
    expect(a.parentElement === b.parentElement).to.equal(true);
    expect(stackOf(a)).to.equal('top-end');
    expect([...document.querySelectorAll('.td-toasts')].filter((s) => s.querySelector('.td-toast')).length).to.equal(1);
  });

  it('customised legacy tokens: no placement → legacy stack (token-positioned, append); a placement → named stack', async () => {
    await setViewport({ width: 1280, height: 800 });
    root.style.setProperty('--td-toast-top', 'auto');
    root.style.setProperty('--td-toast-bottom', '1.5rem');
    const l1 = await showOpen('legacy 1', 'info');
    const l2 = await showOpen('legacy 2', 'info');
    expect(stackOf(l1)).to.equal('legacy');
    expect(l1.parentElement.parentElement === TdToast.container, 'legacy stack is a child of the root').to.equal(true);
    expect(l1.nextElementSibling === l2, 'legacy appends').to.equal(true);
    expect(near(l2.getBoundingClientRect().bottom, 800 - 24), `legacy bottom ${l2.getBoundingClientRect().bottom}`).to.equal(true);
    const n = await showOpen('named', 'info', { placement: 'top-start' });
    expect(stackOf(n)).to.equal('top-start');
    TdToast.configure({ placement: 'bottom-center' });
    const c = await showOpen('configured', 'info');
    expect(stackOf(c)).to.equal('bottom-center');
    const call = await showOpen('call wins', 'info', { placement: 'top-end' });
    expect(stackOf(call)).to.equal('top-end');
  });

  it('configure() after show() never moves the queued toast (snapshot); configure(null) drops it', async () => {
    await setViewport({ width: 1280, height: 800 });
    TdToast.show('chờ', 'info', 0); // queued (50 ms) with the placement resolved now: top-end
    TdToast.configure({ placement: 'bottom-start' });
    const t = await until(() => document.querySelector('.td-toast[data-state="open"]'));
    expect(stackOf(t)).to.equal('top-end');
    const u = await showOpen('sau', 'info');
    expect(stackOf(u)).to.equal('bottom-start');
    TdToast.configure({ placement: null });
    const v = await showOpen('bỏ', 'info');
    expect(stackOf(v)).to.equal('top-end');
  });

  it('invalid values warn once per value and fall to the next level', async () => {
    await setViewport({ width: 1280, height: 800 });
    TdToast.configure({ placement: 'bottom-right' });
    TdToast.configure({ placement: 'bottom-right' });
    const a = await showOpen('a', 'info', { placement: 'left' });
    const b = await showOpen('b', 'info', { placement: 'left' });
    expect(stackOf(a)).to.equal('top-end');
    expect(stackOf(b)).to.equal('top-end');
    expect(warnings.filter((w) => w.includes('"bottom-right"')).length).to.equal(1);
    expect(warnings.filter((w) => w.includes('"left"')).length).to.equal(1);
  });

  it('third argument: number as before; { placement } keeps the function default duration', async () => {
    await setViewport({ width: 1280, height: 800 });
    const h = TdToast.error('lỗi', { placement: 'bottom-end' });
    const t = await until(() => document.querySelector('.td-toast--error[data-state="open"]'));
    expect(stackOf(t)).to.equal('bottom-end');
    h.close();
    const short = await showOpen('ngắn', 'info', 200); // a number is still the duration
    await until(() => !short.isConnected);
  });
});

describe('v0.36.0 TdToast placement — global queue, pause, layer', () => {
  it('MAX_VISIBLE is global across stacks; FIFO follows the call order; clear() empties every stack', async () => {
    await setViewport({ width: 1280, height: 800 });
    const ps = ['top-start', 'bottom-end', 'top-center', 'top-start', 'bottom-end', 'top-center', 'bottom-start'];
    const made = ps.map((p, i) => TdToast._showSingle(`t${i}`, 'info', 0, p));
    expect(TdToast._activeToasts.length).to.equal(TdToast.MAX_VISIBLE);
    expect(made[0].getAttribute('data-state')).to.equal('closing');
    expect(made[1].getAttribute('data-state')).to.equal('closing');
    expect(made.slice(2).every((t) => t.getAttribute('data-state') !== 'closing')).to.equal(true);
    expect(TdToast._activeToasts).to.deep.equal(made.slice(2));
    expect(trapContainers(LAYERS.modal).filter((c) => c === TdToast.container).length, 'one layer registration').to.equal(1);
    expect(trapContainers(LAYERS.modal).length).to.equal(1);
    TdToast.clear();
    await until(() => !document.querySelector('.td-toast'));
    expect(trapContainers(LAYERS.modal).length).to.equal(0);
  });

  it('hover over a toast of stack A pauses the toasts of stack B', async () => {
    await setViewport({ width: 1280, height: 800 });
    const a = await showOpen('A', 'info', { placement: 'top-start', duration: 4000 });
    const b = await showOpen('B', 'info', { placement: 'bottom-end', duration: 4000 });
    const r = a.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await until(() => b.hasAttribute('data-paused'));
    expect(a.hasAttribute('data-paused')).to.equal(true);
    await sendMouse({ type: 'move', position: [640, 400] });
    await until(() => !b.hasAttribute('data-paused'));
  });

  it('under a blocking modal the root is not inert and Tab reaches a toast close button', async () => {
    await setViewport({ width: 1280, height: 800 });
    const dialog = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = 'Trong hộp thoại';
    dialog.append(btn);
    document.body.appendChild(dialog);
    const m = register({ layer: LAYERS.modal, element: dialog, blocking: true, onTab: (e) => trapTab(e, dialog, LAYERS.modal) });
    try {
      const t = await showOpen('trên modal', 'info', { placement: 'bottom-center' });
      expect(TdToast.container.closest('[inert]')).to.equal(null);
      expect(trapContainers(LAYERS.modal).includes(TdToast.container)).to.equal(true);
      btn.focus();
      await sendKeys({ press: 'Tab' });
      expect(document.activeElement === t.querySelector('.td-toast__close'), document.activeElement?.className).to.equal(true);
    } finally {
      m.release();
      dialog.remove();
    }
  });
});

describe('v0.36.0 TdToast placement — xs lanes + short viewport', () => {
  it('360px: the three top-* placements form ONE full-width column, newest on top', async () => {
    await setViewport({ width: 360, height: 780 });
    const a = await showOpen('Bắt đầu', 'info', { placement: 'top-start' });
    const b = await showOpen('Giữa', 'success', { placement: 'top-center' });
    const c = await showOpen('Cuối', 'warning', { placement: 'top-end' });
    const vw = document.documentElement.clientWidth;
    for (const t of [a, b, c]) {
      const r = t.getBoundingClientRect();
      expect(near(r.left, 16) && near(r.right, vw - 16), `${t.textContent}: ${r.left}–${r.right}`).to.equal(true);
    }
    const tops = [c, b, a].map((t) => t.getBoundingClientRect().top);
    expect(tops[0] < tops[1] && tops[1] < tops[2], `newest first ${tops}`).to.equal(true);
    expect(near(tops[0], 80)).to.equal(true);
    // bottom lane: newest at the bottom
    const d = await showOpen('Dưới 1', 'info', { placement: 'bottom-start' });
    const e = await showOpen('Dưới 2', 'info', { placement: 'bottom-end' });
    expect(e.getBoundingClientRect().top > d.getBoundingClientRect().top).to.equal(true);
    expect(near(e.getBoundingClientRect().bottom, 780 - 16)).to.equal(true);
  });

  it('360px: lanes enter vertically', async () => {
    await emulateMedia({ reducedMotion: 'no-preference' });
    await setViewport({ width: 360, height: 780 });
    const top = new DOMMatrixReadOnly(getComputedStyle(TdToast._showSingle('a', 'info', 0, 'top-end')).transform);
    const bot = new DOMMatrixReadOnly(getComputedStyle(TdToast._showSingle('b', 'info', 0, 'bottom-start')).transform);
    expect(top.m41 === 0 && top.m42 < 0, `top ${top}`).to.equal(true);
    expect(bot.m41 === 0 && bot.m42 > 0, `bottom ${bot}`).to.equal(true);
  });

  it('844×390: exactly the two newest toasts (globally) are displayed', async () => {
    await setViewport({ width: 844, height: 390 });
    const made = [];
    for (const [i, p] of ['bottom-end', 'top-start', 'top-start', 'bottom-center'].entries()) {
      made.push(TdToast._showSingle(`t${i}`, 'info', 0, p));
    }
    await raf();
    const shown = made.filter((t) => getComputedStyle(t).display !== 'none');
    expect(shown).to.deep.equal(made.slice(2));
    expect(made.slice(0, 2).every((t) => t.hasAttribute('data-td-toast-older'))).to.equal(true);
    made[3]._removeToast(); // the third newest comes back
    await raf();
    expect(made[1].hasAttribute('data-td-toast-older')).to.equal(false);
    expect(getComputedStyle(made[1]).display).to.not.equal('none');
  });
});
