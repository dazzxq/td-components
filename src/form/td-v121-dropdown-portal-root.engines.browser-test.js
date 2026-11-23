import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';
import './td-dropdown.js';

// v0.121.0 (plan docs/internal/plans/v0.121.0-portal-root.md, tests 1–12) — td-dropdown `portal="local"` /
// `portalRoot`: the menu lives in the host's shadow root (OPEN and CLOSED roots; the closed root's reference is kept
// here), select / search / keyboard, order-safe outside presses (REAL pointerdown via sendMouse, also on the shadow
// host's own padding), property over attribute, moves, reconnect, theme, positioning under translate / scale
// ancestors, stacking over a modal-like dialog in the same root, invalid portalRoot. Without the attribute the menu is
// a <body> child as before. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the
// runner). Geometry is written via CSSOM only.
const CSS = '/td.css';
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = CSS;
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
const OPTIONS = [
  { value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }, { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Date' },
];

const cleanup = [];
let warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns = [];
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); origWarn(...a); };
});
afterEach(async () => {
  console.warn = origWarn;
  for (const f of cleanup.splice(0).reverse()) f();
  await resetMouse();
  await wait(10);
});

/** a light-DOM wrapper (`outer`) holding the shadow host (`shell`) with its open / closed root; td.css loaded inside */
async function makeRoot(mode, parent = document.body) {
  const outer = document.createElement('div');
  outer.className = 'pr-outer';
  parent.appendChild(outer);
  const shell = document.createElement('div');
  shell.className = 'pr-shell';
  outer.appendChild(shell);
  const root = shell.attachShadow({ mode });
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS;
  root.appendChild(l);
  await new Promise((r) => { l.onload = r; l.onerror = r; });
  const wrap = document.createElement('div');
  wrap.className = 'pr-wrap';
  root.appendChild(wrap);
  cleanup.push(() => outer.remove());
  return { outer, shell, root, wrap };
}
function dd(parent, attrs = 'portal="local"') {
  parent.insertAdjacentHTML('beforeend', `<td-dropdown aria-label="Trái cây" ${attrs}></td-dropdown>`);
  const el = parent.lastElementChild;
  el.options = OPTIONS.map((o) => ({ ...o }));
  cleanup.push(() => { if (el._isOpen) el.close(); });
  return el;
}
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const menu = (el) => el._menuElement;
const search = (el) => menu(el).querySelector('.td-dropdown__search');
const rows = (el) => [...menu(el).querySelectorAll('.td-dropdown__option[data-index]')];
const center = (node) => {
  const r = node.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const press = (node) => sendMouse({ type: 'click', position: center(node) });
const pressAt = (x, y) => sendMouse({ type: 'click', position: [Math.round(x), Math.round(y)] });
async function openByClick(el) {
  await press(trig(el));
  await settle();
  expect(el._isOpen, 'opened by a real click').to.equal(true);
}
const near = (a, b, label) => expect(Math.abs(a - b) <= 1, `${label}: ${a} vs ${b}`).to.equal(true);
function expectUnder(el, label) {
  const t = trig(el).getBoundingClientRect();
  const m = menu(el).getBoundingClientRect();
  near(m.left, t.left, `${label} left`);
  near(m.width, t.width, `${label} width`);
  near(m.top, t.bottom + 8, `${label} top`);
}

for (const mode of ['open', 'closed']) {
  describe(`v0.121.0 — td-dropdown portal root (${mode} shadow root)`, () => {
    it('1. portal="local": the menu is a child of the shadow root, none in document.body', async () => {
      const { root, wrap } = await makeRoot(mode);
      const before = document.body.querySelectorAll('.td-dropdown__menu').length;
      const el = dd(wrap);
      await settle();
      expect(menu(el).parentNode === root, 'menu in the root').to.equal(true);
      expect(document.body.querySelectorAll('.td-dropdown__menu').length).to.equal(before);
      expect(menu(el).id).to.equal(`${el.id}-menu`);
      expect(root.getElementById(menu(el).id) === menu(el), 'aria ids resolve in the same root').to.equal(true);
    });

    it('2a. select by a real click on an option; search by typing in the box', async () => {
      const { root, wrap } = await makeRoot(mode);
      const el = dd(wrap);
      let changed = null;
      el.addEventListener('change', (e) => { changed = e.detail?.value ?? el.getValue(); });
      await settle();
      await openByClick(el);
      await press(rows(el)[1]);
      await settle();
      expect(el._isOpen).to.equal(false);
      expect(el.getValue()).to.equal('b');
      expect(changed).to.equal('b');
      // search: open focuses the box after 100 ms (fine pointer), then real typing filters
      await openByClick(el);
      await wait(150);
      expect(root.activeElement === search(el), 'search box focused (root-aware)').to.equal(true);
      expect(search(el).hasAttribute('aria-activedescendant') && !trig(el).hasAttribute('aria-activedescendant'),
        'aria-activedescendant on the focused search box').to.equal(true);
      await sendKeys({ type: 'Ch' });
      await settle();
      expect(rows(el).map((r) => r.getAttribute('data-value'))).to.deep.equal(['c']);
      await sendKeys({ press: 'Enter' });
      await settle();
      expect(el.getValue()).to.equal('c');
      expect(el._isOpen).to.equal(false);
      expect(root.activeElement === trig(el), 'focus handed back from the hidden menu').to.equal(true);
    });

    it('2b. keyboard: arrows + Enter, Escape, Tab (layers registry) from the closed / open root', async () => {
      const { root, wrap } = await makeRoot(mode);
      const el = dd(wrap, 'portal="local" searchable="false"');
      await settle();
      trig(el).focus();
      expect(root.activeElement === trig(el)).to.equal(true);
      await sendKeys({ press: 'ArrowDown' });
      await settle();
      expect(el._isOpen, 'ArrowDown opens').to.equal(true);
      await sendKeys({ press: 'ArrowDown' });
      await sendKeys({ press: 'Enter' });
      await settle();
      expect(el._isOpen).to.equal(false);
      expect(el.getValue()).to.equal('b');
      await sendKeys({ press: 'ArrowDown' });
      await settle();
      expect(el._isOpen).to.equal(true);
      await sendKeys({ press: 'Escape' });
      await settle();
      expect(el._isOpen, 'Escape closes').to.equal(false);
      expect(root.activeElement === trig(el)).to.equal(true);
      // Tab with the search box focused: closes, focus back on the trigger (prevented)
      el.removeAttribute('searchable');
      await settle();
      await openByClick(el);
      await wait(150);
      expect(root.activeElement === search(el)).to.equal(true);
      await sendKeys({ press: 'Tab' });
      await settle();
      expect(el._isOpen, 'Tab closes').to.equal(false);
      expect(root.activeElement === trig(el), 'Tab from the menu returns to the trigger').to.equal(true);
    });

    it('3. a press inside the menu keeps it open; elsewhere in the root and in the page closes', async () => {
      const { wrap } = await makeRoot(mode);
      const el = dd(wrap);
      wrap.insertAdjacentHTML('afterbegin', '<button type="button" class="pr-other">Khác</button>'); // above: not under the menu
      const other = wrap.querySelector('.pr-other');
      const page = document.createElement('button');
      page.textContent = 'Trang';
      document.body.prepend(page); // above the shadow host: never under the open menu
      cleanup.push(() => page.remove());
      await settle();
      await openByClick(el);
      await press(search(el));
      await settle();
      expect(el._isOpen, 'search box press').to.equal(true);
      const m = menu(el).getBoundingClientRect();
      await pressAt(m.left + m.width / 2, m.top + 2); // the menu's own padding
      await settle();
      expect(el._isOpen, 'menu padding press').to.equal(true);
      await press(trig(el)); // the trigger toggles it closed (inside the host: not an outside press)
      await settle();
      expect(el._isOpen).to.equal(false);
      await openByClick(el);
      await press(other);
      await settle();
      expect(el._isOpen, 'press elsewhere in the root').to.equal(false);
      await openByClick(el);
      await press(page);
      await settle();
      expect(el._isOpen, 'press in the page').to.equal(false);
    });

    it('4. portalRoot wins over the attribute; changing it while open closes and moves the same node', async () => {
      const { root, wrap } = await makeRoot(mode);
      const lightBox = document.createElement('div');
      document.body.appendChild(lightBox);
      cleanup.push(() => lightBox.remove());
      const el = dd(wrap);
      await settle();
      const node = menu(el);
      expect(node.parentNode === root).to.equal(true);
      el.portalRoot = lightBox;
      expect(node.parentNode === lightBox, 'property wins (light-DOM element)').to.equal(true);
      expect(el.portalRoot === lightBox).to.equal(true);
      await openByClick(el);
      const inRoot = document.createElement('div');
      wrap.appendChild(inRoot);
      el.portalRoot = inRoot;
      expect(el._isOpen, 'closed by the move').to.equal(false);
      expect(menu(el) === node && node.parentNode === inRoot, 'same node, new parent').to.equal(true);
      // inside the root again: order-safe outside presses still work, the menu keeps its listeners
      await openByClick(el);
      await press(rows(el)[2]);
      await settle();
      expect(el.getValue()).to.equal('c');
      el.portalRoot = null;
      expect(node.parentNode === root, 'null → the attribute').to.equal(true);
      el.removeAttribute('portal');
      expect(node.parentNode === document.body, 'no attribute → body').to.equal(true);
      el.setAttribute('portal', 'local');
      expect(node.parentNode === root).to.equal(true);
    });

    it('5. reconnect (move the host to another root) recreates the menu there', async () => {
      const a = await makeRoot(mode);
      const b = await makeRoot(mode);
      const el = dd(a.wrap);
      await settle();
      const first = menu(el);
      await openByClick(el);
      b.wrap.appendChild(el);
      await settle();
      expect(el._isOpen).to.equal(false);
      expect(first.isConnected, 'old menu removed').to.equal(false);
      expect(!!menu(el) && menu(el).parentNode === b.root, 'new menu in the new root').to.equal(true);
      await openByClick(el);
      await press(rows(el)[3]);
      await settle();
      expect(el.getValue()).to.equal('d');
    });

    it('6. theme: dark on an ancestor of the shadow host and on an element inside the root', async () => {
      const token = (n) => getComputedStyle(n).getPropertyValue('--td-color-text').trim().toLowerCase();
      const light = await makeRoot(mode);
      const l = dd(light.wrap);
      await settle();
      await openByClick(l);
      const lightText = token(menu(l));
      l.close();
      const darkAround = document.createElement('div');
      darkAround.setAttribute('data-td-theme', 'dark');
      document.body.appendChild(darkAround);
      cleanup.push(() => darkAround.remove());
      const d1 = await makeRoot(mode, darkAround);
      const a = dd(d1.wrap);
      await settle();
      await openByClick(a);
      expect(token(menu(a))).to.equal('#f5f5f7');
      expect(token(menu(a)) !== lightText, 'light differs').to.equal(true);
      a.close();
      const d2 = await makeRoot(mode);
      d2.wrap.setAttribute('data-td-theme', 'dark');
      const b = dd(d2.wrap);
      await settle();
      await openByClick(b);
      expect(menu(b).getAttribute('data-td-theme')).to.equal('dark');
      expect(token(menu(b))).to.equal('#f5f5f7');
      b.close();
      expect(menu(b).hasAttribute('data-td-theme'), 'unbridged on close').to.equal(false);
    });

    it('7. positioning: transformed ancestor of the host, and a transformed dialog inside the root', async () => {
      const { outer, wrap } = await makeRoot(mode);
      outer.style.setProperty('margin-top', '40px');
      outer.style.setProperty('width', '400px'); // no viewport clamping (the body portal would clamp the same way)
      outer.style.setProperty('transform', 'translate(30px, 20px)');
      const el = dd(wrap);
      await settle();
      await openByClick(el);
      expectUnder(el, 'translated ancestor');
      el.close();
      const dialog = document.createElement('div');
      dialog.style.setProperty('transform', 'translate(12px, 18px)');
      dialog.style.setProperty('padding', '16px');
      wrap.appendChild(dialog);
      const inner = dd(dialog);
      await settle();
      await openByClick(inner);
      expectUnder(inner, 'transformed dialog in the root');
    });

    it('8. no attribute: the menu is a <body> child, as before', async () => {
      const { wrap } = await makeRoot(mode);
      const el = dd(wrap, '');
      await settle();
      expect(menu(el).parentNode === document.body).to.equal(true);
      await openByClick(el);
      expectUnder(el, 'body portal');
      await press(rows(el)[0]);
      await settle();
      expect(el.getValue()).to.equal('a');
    });

    it('9. stacking: the menu is above a modal-like dialog rendered in the same root', async () => {
      const { root, wrap } = await makeRoot(mode);
      const dialog = document.createElement('div');
      dialog.className = 'td-glass-surface';
      for (const [k, v] of [['position', 'fixed'], ['inset', '0'], ['z-index', 'var(--td-z-modal)'], ['padding', '40px'],
        ['transform', 'scale(1)']]) dialog.style.setProperty(k, v);
      wrap.appendChild(dialog);
      const el = dd(dialog);
      await settle();
      await openByClick(el);
      const [x, y] = center(rows(el)[1]);
      const hit = root.elementFromPoint(x, y);
      expect(!!hit && menu(el).contains(hit), 'hit test lands in the menu').to.equal(true);
    });

    it('10. positioning under scale(0.95) on an ancestor of the host (below and above the trigger)', async () => {
      const { outer, wrap } = await makeRoot(mode);
      outer.style.setProperty('margin', '60px 40px');
      outer.style.setProperty('width', '400px');
      outer.style.setProperty('transform', 'scale(0.95)');
      const el = dd(wrap);
      await settle();
      await openByClick(el);
      expectUnder(el, 'scaled');
      el.close();
      // near the bottom of the viewport → flips above; its bottom edge sits 8 px over the trigger
      outer.style.setProperty('position', 'fixed');
      outer.style.setProperty('inset', 'auto auto 10px 0');
      outer.style.setProperty('margin', '0 40px');
      await settle();
      await openByClick(el);
      const t = trig(el).getBoundingClientRect();
      const m = menu(el).getBoundingClientRect();
      expect(menu(el).getAttribute('data-placement')).to.equal('top');
      near(m.left, t.left, 'scaled top left');
      near(m.width, t.width, 'scaled top width');
      near(m.bottom, t.top - 8, 'scaled top bottom');
    });

    it('11. invalid portalRoot (Text node, disconnected element): one warning, falls back', async () => {
      const { root, wrap } = await makeRoot(mode);
      wrap.insertAdjacentHTML('beforeend', '<td-dropdown aria-label="Trái cây" portal="local"></td-dropdown>');
      const el = wrap.lastElementChild;
      el.remove();
      el.portalRoot = document.createTextNode('x');
      el.options = OPTIONS.map((o) => ({ ...o }));
      wrap.appendChild(el);
      cleanup.push(() => { if (el._isOpen) el.close(); });
      await settle();
      expect(menu(el).parentNode === root, 'falls back to the attribute').to.equal(true);
      el.portalRoot = el.portalRoot; // same value again: no second warning
      expect(warns.filter((w) => w.includes('portalRoot')).length).to.equal(1);
      const gone = document.createElement('div');
      el.removeAttribute('portal');
      el.portalRoot = gone;
      expect(menu(el).parentNode === document.body, 'disconnected element → body').to.equal(true);
      expect(warns.filter((w) => w.includes('portalRoot')).length).to.equal(2);
    });

    it('12. a real press on the shadow host\'s own padding closes the menu', async () => {
      const { shell, wrap } = await makeRoot(mode);
      shell.style.setProperty('display', 'block');
      shell.style.setProperty('padding', '24px');
      const el = dd(wrap);
      await settle();
      await openByClick(el);
      await wait(20); // the press that opened it is over: host-box presses are judged from now on
      const s = shell.getBoundingClientRect();
      await pressAt(s.left + 6, s.top + 6);
      await settle();
      expect(el._isOpen, 'host-box press closes').to.equal(false);
    });

    // --- review R1 ---
    for (const scale of [0.5, 1.5]) {
      it(`R1-1. scale(${scale}) on an ancestor, 320 px viewport: below capped inside the viewport, flips above near the bottom`, async () => {
        await setViewport({ width: 800, height: 320 });
        cleanup.push(() => { setViewport({ width: 800, height: 600 }); });
        const { outer, wrap } = await makeRoot(mode);
        for (const [k, v] of [['position', 'fixed'], ['top', '20px'], ['left', '20px'], ['width', '400px'],
          ['transform-origin', '0 0'], ['transform', `scale(${scale})`]]) outer.style.setProperty(k, v);
        const el = dd(wrap);
        el.options = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Mục ${i}` }));
        await settle();
        await openByClick(el);
        let t = trig(el).getBoundingClientRect();
        let m = menu(el).getBoundingClientRect();
        expect(menu(el).getAttribute('data-placement')).to.equal('bottom');
        near(m.left, t.left, 'below left');
        near(m.width, t.width, 'below width');
        near(m.top, t.bottom + 8, 'below top');
        expect(m.bottom <= window.innerHeight - 8 + 1, `below bottom ${m.bottom} inside ${window.innerHeight}`).to.equal(true);
        el.close();
        // move the trigger near the bottom of the viewport → the menu flips above and stays inside the top edge
        const delta = (window.innerHeight - 16) - t.bottom;
        outer.style.setProperty('top', `${20 + delta}px`);
        await settle();
        await openByClick(el);
        t = trig(el).getBoundingClientRect();
        m = menu(el).getBoundingClientRect();
        expect(menu(el).getAttribute('data-placement')).to.equal('top');
        near(m.left, t.left, 'above left');
        near(m.width, t.width, 'above width');
        near(m.bottom, t.top - 8, 'above bottom');
        expect(m.top >= 8 - 1, `above top ${m.top} inside the viewport`).to.equal(true);
      });
    }

    async function crossTreeChecks(el, outsideInHostRoot, label) {
      await openByClick(el);
      await press(trig(el)); // the trigger toggles it closed (not an outside press that the click then reopens)
      await settle();
      expect(el._isOpen, `${label}: trigger toggles closed`).to.equal(false);
      await openByClick(el);
      const m = menu(el).getBoundingClientRect();
      await pressAt(m.left + m.width / 2, m.top + 2); // the menu's own padding
      await settle();
      expect(el._isOpen, `${label}: press inside the menu keeps it open`).to.equal(true);
      await press(outsideInHostRoot);
      await settle();
      expect(el._isOpen, `${label}: press elsewhere in the host's root closes`).to.equal(false);
      await openByClick(el);
      await press(rows(el)[2]);
      await settle();
      expect(el.getValue(), `${label}: pick`).to.equal('c');
    }

    it('R1-2a. host in root A, portalRoot = another shadow root B', async () => {
      const page = document.createElement('div');
      document.body.prepend(page);
      cleanup.push(() => page.remove());
      const b = await makeRoot(mode, page); // B first: above A, never under A's menu
      const a = await makeRoot(mode);
      a.wrap.insertAdjacentHTML('afterbegin', '<button type="button" class="pr-other">Khác</button>');
      const el = dd(a.wrap, '');
      el.portalRoot = b.root;
      await settle();
      expect(menu(el).parentNode === b.root, 'menu in B').to.equal(true);
      await crossTreeChecks(el, a.wrap.querySelector('.pr-other'), 'A→B');
    });

    for (const target of ['light element', 'document.body']) {
      it(`R1-2b. host in root A, portalRoot = ${target}`, async () => {
        const a = await makeRoot(mode);
        a.wrap.insertAdjacentHTML('afterbegin', '<button type="button" class="pr-other">Khác</button>');
        let box = document.body;
        if (target === 'light element') {
          box = document.createElement('div');
          document.body.appendChild(box);
          cleanup.push(() => box.remove());
        }
        const el = dd(a.wrap, '');
        el.portalRoot = box;
        await settle();
        expect(menu(el).parentNode === box, 'menu in the light DOM').to.equal(true);
        await crossTreeChecks(el, a.wrap.querySelector('.pr-other'), `A→${target}`);
      });
    }

    it('R1-3. a transition inside the root (scale 0.95 → 1) re-places the open menu on transitionend', async () => {
      const { wrap } = await makeRoot(mode);
      const dialog = document.createElement('div');
      for (const [k, v] of [['width', '400px'], ['margin', '40px'], ['transform', 'scale(0.95)'],
        ['transition', 'transform 200ms linear']]) dialog.style.setProperty(k, v);
      wrap.appendChild(dialog);
      const el = dd(dialog);
      await settle();
      dialog.getBoundingClientRect(); // commit the start state
      const ended = new Promise((r) => { // the dialog's own transition (the trigger's arrow / border transitions bubble too)
        const on = (e) => { if (e.target === dialog) { dialog.removeEventListener('transitionend', on); r(); } };
        dialog.addEventListener('transitionend', on);
      });
      dialog.style.setProperty('transform', 'scale(1)');
      await raf();
      el.open();
      await ended;
      await settle();
      expectUnder(el, 'after transitionend');
    });
  });
}
