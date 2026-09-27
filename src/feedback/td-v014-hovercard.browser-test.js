import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdHovercard, hovercardUrl } from './td-hovercard.js';
import { TdModal } from './td-modal.js';
import { LAYERS, hasActiveAbove } from '../utils/layers.js';

// v0.14.0 G10 — TdHovercard (plan docs/internal/plans/v0.14.0-liquid-glass.md). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const active = () => document.activeElement;
const cardEl = () => document.getElementById('td-hovercard');
const isOpen = () => !!cardEl() && !cardEl().hidden;
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await wait(0); };

function add(html) {
  host.insertAdjacentHTML('beforeend', html);
  return /** @type {HTMLElement} */ (host.lastElementChild);
}
/** interactive card content (two links) */
function richCard(prefix = 'c') {
  const d = document.createElement('div');
  d.innerHTML = `<strong>Nguyễn Lan</strong><p>Biên tập viên</p>
    <a href="#${prefix}1" id="${prefix}-1">Hồ sơ</a> <a href="#${prefix}2" id="${prefix}-2">Nhắn tin</a>`;
  return d;
}

const unbinds = [];
const bind = (t, o) => { const u = TdHovercard.bind(t, o); unbinds.push(u); return u; };
const bindAll = (r) => { const u = TdHovercard.bindAll(r); unbinds.push(u); return u; };

const realFetch = window.fetch;
function stubFetch(handler) {
  const calls = [];
  window.fetch = (url, init) => {
    calls.push({ url: String(url), init });
    return Promise.resolve().then(() => handler(String(url), init));
  };
  return calls;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
const htmlRes = (s) => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });

afterEach(async () => {
  TdHovercard.close();
  TdHovercard.sanitize = null;
  TdHovercard.clearCache();
  while (unbinds.length) unbinds.pop()();
  TdModal.closeAll?.();
  window.fetch = realFetch;
  host.innerHTML = '';
  await resetMouse();
  // back to keyboard modality: programmatic focus() in the next test is :focus-visible again (a previous test's
  // mouse click would otherwise route it through the hover intent — review ISSUE-3)
  await sendKeys({ press: 'Shift' });
  await wait(0);
});

describe('v0.14 TdHovercard — import has no side effects', () => {
  it('a declarative trigger does nothing before bindAll(); no card exists', async () => {
    const t = add('<button type="button" data-td-hovercard-template="nope">Lan</button>');
    t.focus();
    await wait(400);
    expect(cardEl()).to.equal(null);
    expect(t.hasAttribute('aria-haspopup')).to.equal(false);
  });
});

describe('v0.14 TdHovercard — structure, ARIA, glass', () => {
  it('bind sets trigger ARIA; focus opens a strong-glass role=dialog portaled card; close/unbind restore', async () => {
    const t = add('<button type="button" aria-haspopup="true">Nguyễn Lan</button>');
    const unbind = bind(t, { content: () => richCard() });
    expect(t.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    expect(t.hasAttribute('aria-controls')).to.equal(false);
    t.focus();
    const c = cardEl();
    expect(isOpen()).to.equal(true);
    expect(c.parentElement === document.body).to.equal(true);
    expect([...c.classList]).to.include.members(['td-hovercard', 'td-glass-surface', 'td-glass-surface--strong']);
    expect(c.getAttribute('role')).to.equal('dialog');
    expect(c.hasAttribute('aria-modal')).to.equal(false);
    expect(c.getAttribute('data-state')).to.equal('open');
    expect(['bottom', 'top']).to.include(c.getAttribute('data-placement'));
    expect(t.getAttribute('aria-expanded')).to.equal('true');
    expect(t.getAttribute('aria-controls')).to.equal(c.id);
    expect(c.querySelector('#c-1')).to.not.equal(null);
    expect(getComputedStyle(c).position).to.equal('fixed');
    expect(getComputedStyle(c).zIndex).to.equal(String(LAYERS.popover));
    TdHovercard.close();
    expect(isOpen()).to.equal(false);
    expect(c.getAttribute('data-state')).to.equal('closed');
    expect(c.childNodes.length).to.equal(0);
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    expect(t.hasAttribute('aria-controls')).to.equal(false);
    unbind();
    expect(t.getAttribute('aria-haspopup')).to.equal('true'); // the trigger's own value is restored
    expect(t.hasAttribute('aria-expanded')).to.equal(false);
  });

  it('a tabindex="-1" trigger is made Tab-reachable while bound; its -1 comes back on unbind (review ISSUE-4)', () => {
    const b = add('<button type="button" tabindex="-1">Lan</button>');
    const unbind = bind(b, { content: () => 'x' });
    expect(b.getAttribute('tabindex')).to.equal('0');
    unbind();
    expect(b.getAttribute('tabindex')).to.equal('-1');
  });

  it('a non-focusable trigger gets tabindex=0 while bound (restored on unbind)', () => {
    const s = add('<span>Lan</span>');
    const unbind = bind(s, { content: () => 'x' });
    expect(s.getAttribute('tabindex')).to.equal('0');
    unbind();
    expect(s.hasAttribute('tabindex')).to.equal(false);
  });

  it('placement: below the trigger, start-aligned, clamped into the viewport', async () => {
    const t = add('<button type="button">Góc phải</button>');
    t.classList.add('td-btn');
    // push the trigger to the right edge (CSSOM, no style="")
    t.style.setProperty('position', 'fixed');
    t.style.setProperty('right', '0px');
    t.style.setProperty('top', '40px');
    const wide = document.createElement('div');
    wide.textContent = 'Một đoạn nội dung khá dài để thẻ rộng gần bằng chiều rộng tối đa cho phép của hovercard.';
    bind(t, { content: () => wide });
    t.focus();
    const r = cardEl().getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    expect(cardEl().getAttribute('data-placement')).to.equal('bottom');
    expect(r.top >= tr.bottom).to.equal(true);
    expect(r.right <= window.innerWidth - 8 + 0.5).to.equal(true);
    expect(r.left >= 8 - 0.5).to.equal(true);
  });

  it('frontmost glass: stays glass over an open TdModal; solid with data-td-glass="off"', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<button type="button" id="gm-t">Lan</button>';
    const t = body.firstElementChild;
    bind(t, { content: () => 'Nội dung' });
    TdModal.show({ title: 'Hộp thoại', body, showFooter: false }); // initial focus lands on the trigger → opens
    await frames(3);
    if (!isOpen()) { t.blur(); t.focus(); }
    expect(isOpen()).to.equal(true);
    await frames(2);
    const cs = getComputedStyle(cardEl());
    const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    if (CSS.supports('backdrop-filter', 'blur(1px)')) expect(bf).to.not.equal('none');
    expect(cardEl().hasAttribute('inert')).to.equal(false);
    document.documentElement.setAttribute('data-td-glass', 'off');
    try {
      await frames(1);
      expect(getComputedStyle(cardEl()).backdropFilter || 'none').to.equal('none');
    } finally {
      document.documentElement.removeAttribute('data-td-glass');
    }
  });

  it('loading/error text meets 4.5:1 on the solid fallback in light and dark', async () => {
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      document.documentElement.setAttribute('data-td-glass', 'off');
      try {
        const t = add(`<button type="button">${theme}</button>`);
        const d = deferred();
        bind(t, { content: () => d.promise });
        t.focus();
        await frames(2);
        const bg = getComputedStyle(cardEl()).backgroundColor;
        const st = cardEl().querySelector('.td-hovercard__status');
        expect(ratio(getComputedStyle(st).color, bg), `${theme} loading`).to.be.at.least(4.5);
        d.reject(new Error('x'));
        const warn = console.warn;
        console.warn = () => {};
        try { await flush(); } finally { console.warn = warn; }
        expect(cardEl().getAttribute('data-state')).to.equal('error');
        const er = cardEl().querySelector('.td-hovercard__status');
        expect(ratio(getComputedStyle(er).color, bg), `${theme} error`).to.be.at.least(4.5);
        TdHovercard.close();
      } finally {
        document.documentElement.removeAttribute('data-td-theme');
        document.documentElement.removeAttribute('data-td-glass');
      }
    }
  });
});

describe('v0.14 TdHovercard — hover intent', () => {
  it('pointer hover capability query matches in the test browser', () => {
    expect(matchMedia('(hover: hover) and (pointer: fine)').matches).to.equal(true);
  });

  it('shows after 350 ms, not before; hides after a 250 ms grace', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    await sendMouse({ type: 'move', position: center(t) });
    await wait(200);
    expect(isOpen()).to.equal(false);
    await wait(250);
    expect(isOpen()).to.equal(true);
    await sendMouse({ type: 'move', position: [2, window.innerHeight - 2] });
    await wait(100);
    expect(isOpen(), 'still within the grace').to.equal(true);
    await wait(300);
    expect(isOpen()).to.equal(false);
  });

  it('a pass-over shorter than the delay never opens', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    await sendMouse({ type: 'move', position: center(t) });
    await wait(150);
    await sendMouse({ type: 'move', position: [2, window.innerHeight - 2] });
    await wait(400);
    expect(isOpen()).to.equal(false);
  });

  it('moving from the trigger onto the card keeps it open; leaving the card closes it', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => richCard() });
    await sendMouse({ type: 'move', position: center(t) });
    await wait(420);
    expect(isOpen()).to.equal(true);
    await sendMouse({ type: 'move', position: center(cardEl()) });
    await wait(450);
    expect(isOpen()).to.equal(true);
    await sendMouse({ type: 'move', position: [2, window.innerHeight - 2] });
    await wait(400);
    expect(isOpen()).to.equal(false);
  });

  it('focus on the trigger keeps the card open after the pointer leaves', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    t.focus();
    expect(isOpen()).to.equal(true);
    await sendMouse({ type: 'move', position: center(t) });
    await sendMouse({ type: 'move', position: [2, window.innerHeight - 2] });
    await wait(400);
    expect(isOpen()).to.equal(true);
  });

  it('a mouse click focuses without bypassing the 350 ms hover intent (review ISSUE-3)', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    await sendMouse({ type: 'click', position: center(t) });
    expect(same(active(), t)).to.equal(true);
    expect(isOpen(), 'no instant open on pointer focus').to.equal(false);
    await wait(420);
    expect(isOpen(), 'the hover path still opens it').to.equal(true);
  });

  it('outside pointerdown closes', async () => {
    const t = add('<button type="button">Lan</button>');
    const other = add('<button type="button">Khác</button>');
    bind(t, { content: () => 'Thẻ' });
    t.focus();
    await sendMouse({ type: 'click', position: center(other) });
    expect(isOpen()).to.equal(false);
  });
});

describe('v0.14 TdHovercard — keyboard', () => {
  it('focus opens at once; blur elsewhere closes after the grace; focus inside the card keeps it', async () => {
    const t = add('<button type="button">Lan</button>');
    const other = add('<button type="button">Khác</button>');
    bind(t, { content: () => richCard() });
    t.focus();
    expect(isOpen()).to.equal(true);
    document.getElementById('c-1').focus();
    await wait(400);
    expect(isOpen()).to.equal(true);
    other.focus();
    await wait(100);
    expect(isOpen()).to.equal(true);
    await wait(250);
    expect(isOpen()).to.equal(false);
  });

  it('page: Tab trigger → card first → last → closes and continues after the trigger; Shift+Tab back', async () => {
    const before = add('<button type="button" id="k-before">Trước</button>');
    const t = add('<button type="button" id="k-t">Lan</button>');
    add('<button type="button" id="k-after">Sau</button>');
    bind(t, { content: () => richCard('k') });
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(same(active(), t)).to.equal(true);
    expect(isOpen()).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('k-1');
    await sendKeys({ press: 'Shift+Tab' });
    expect(same(active(), t)).to.equal(true);
    expect(isOpen(), 'Shift+Tab back to the trigger keeps it open').to.equal(true);
    await sendKeys({ press: 'Tab' });
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('k-2');
    await sendKeys({ press: 'Tab' });
    expect(isOpen()).to.equal(false);
    expect(active().id).to.equal('k-after');
    expect(t.getAttribute('aria-expanded')).to.equal('false');
  });

  it('Tab on the trigger passes when the card has no focusables (loading); Shift+Tab from the trigger passes', async () => {
    const before = add('<button type="button" id="p-before">Trước</button>');
    const t = add('<button type="button">Lan</button>');
    add('<button type="button" id="p-after">Sau</button>');
    const d = deferred();
    bind(t, { content: () => d.promise });
    t.focus();
    expect(cardEl().getAttribute('data-state')).to.equal('loading');
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('p-after');
    t.focus();
    await sendKeys({ press: 'Shift+Tab' });
    expect(same(active(), before)).to.equal(true);
    d.resolve('x');
  });

  it('Escape closes and returns focus to the trigger without reopening it', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => richCard() });
    t.focus();
    document.getElementById('c-2').focus();
    await sendKeys({ press: 'Escape' });
    expect(isOpen()).to.equal(false);
    expect(same(active(), t)).to.equal(true);
    await wait(50);
    expect(isOpen()).to.equal(false);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
  });

  it('Escape on a hover-only card closes it without stealing focus', async () => {
    const field = add('<input id="esc-field">');
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    field.focus();
    await sendMouse({ type: 'move', position: center(t) });
    await wait(420);
    expect(isOpen()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(isOpen()).to.equal(false);
    expect(same(active(), field)).to.equal(true);
    // WCAG 1.4.13: moving within the trigger does not bring it back; leaving and re-entering does
    const [x, y] = center(t);
    await sendMouse({ type: 'move', position: [x + 2, y] });
    await wait(420);
    expect(isOpen()).to.equal(false);
    await sendMouse({ type: 'move', position: [2, window.innerHeight - 2] });
    await sendMouse({ type: 'move', position: [x, y] });
    await wait(420);
    expect(isOpen()).to.equal(true);
  });

  it('inside an open TdModal: Tab into the card and out after the trigger; Escape closes only the card', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<input id="mm-a"><button type="button" id="mm-t">Lan</button><input id="mm-b">';
    TdModal.show({ title: 'Hộp thoại', body, showFooter: false });
    await frames(3);
    const t = document.getElementById('mm-t');
    const dialog = t.closest('.td-modal__dialog');
    bind(t, { content: () => richCard('m') });
    document.getElementById('mm-a').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(active(), t)).to.equal(true);
    expect(isOpen()).to.equal(true);
    expect(cardEl().hasAttribute('inert')).to.equal(false);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('m-1');
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('m-2');
    await sendKeys({ press: 'Tab' });
    expect(isOpen()).to.equal(false);
    expect(active().id).to.equal('mm-b');
    // Shift+Tab from the first card focusable → the trigger
    t.focus();
    await sendKeys({ press: 'Tab' });
    expect(active().id).to.equal('m-1');
    await sendKeys({ press: 'Shift+Tab' });
    expect(same(active(), t)).to.equal(true);
    await sendKeys({ press: 'Shift+Tab' });
    expect(active().id).to.equal('mm-a');
    // Escape from inside the card: closes only the card
    t.focus();
    await sendKeys({ press: 'Tab' });
    await sendKeys({ press: 'Escape' });
    expect(isOpen()).to.equal(false);
    expect(document.querySelector('.td-modal')).to.not.equal(null);
    expect(same(active(), t)).to.equal(true);
    expect(dialog.contains(active())).to.equal(true);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
  });
});

describe('v0.14 TdHovercard — content sources', () => {
  it('template (id, "#id", element): cloned, the template itself untouched', async () => {
    host.insertAdjacentHTML('beforeend', '<template id="hc-tpl"><p class="x">Mẫu <a href="#a">A</a></p></template>');
    const tpl = document.getElementById('hc-tpl');
    for (const ref of ['hc-tpl', '#hc-tpl', tpl]) {
      const t = add('<button type="button">Lan</button>');
      bind(t, { template: ref });
      t.focus();
      expect(isOpen()).to.equal(true);
      expect(cardEl().querySelector('p.x a')).to.not.equal(null);
      expect(tpl.content.querySelector('p.x')).to.not.equal(null);
      TdHovercard.close();
    }
  });

  it('missing / non-template id → warns, nothing opens', async () => {
    add('<div id="not-tpl"></div>');
    const warns = [];
    const warn = console.warn;
    console.warn = (m) => warns.push(String(m));
    try {
      for (const ref of ['nope', 'not-tpl']) {
        const t = add('<button type="button">Lan</button>');
        bind(t, { template: ref });
        t.focus();
        expect(isOpen()).to.equal(false);
      }
    } finally { console.warn = warn; }
    expect(warns.length).to.equal(2);
  });

  it('content(): Node, trusted string, Promise (loading → open), sync throw → error; receives the trigger', async () => {
    const t = add('<button type="button">Lan</button>');
    let got = null;
    bind(t, { content: (tr) => { got = tr; return '<em class="trusted">Chuỗi HTML tin cậy</em>'; } });
    t.focus();
    expect(same(got, t)).to.equal(true);
    expect(cardEl().querySelector('em.trusted')).to.not.equal(null);
    TdHovercard.close();

    const t2 = add('<button type="button">Lan 2</button>');
    const d = deferred();
    bind(t2, { content: () => d.promise });
    t2.focus();
    expect(cardEl().getAttribute('data-state')).to.equal('loading');
    expect(cardEl().querySelector('.td-hovercard__spinner')).to.not.equal(null);
    expect(cardEl().querySelector('.td-hovercard__text').textContent).to.equal(TdHovercard.labels.loading);
    d.resolve(richCard('p'));
    await flush();
    expect(cardEl().getAttribute('data-state')).to.equal('open');
    expect(cardEl().querySelector('#p-1')).to.not.equal(null);
    TdHovercard.close();

    const t3 = add('<button type="button">Lan 3</button>');
    bind(t3, { content: () => { throw new Error('boom'); } });
    const warn = console.warn;
    console.warn = () => {};
    try { t3.focus(); } finally { console.warn = warn; }
    expect(cardEl().getAttribute('data-state')).to.equal('error');
    expect(cardEl().querySelector('.td-hovercard__text').textContent).to.equal(TdHovercard.labels.error);
    expect(cardEl().querySelector('.td-hovercard__spinner')).to.equal(null);
  });

  it('empty content (null, "", empty fragment) opens nothing', async () => {
    for (const v of [null, '', '   ', document.createDocumentFragment()]) {
      const t = add('<button type="button">Lan</button>');
      bind(t, { content: () => v });
      t.focus();
      expect(isOpen()).to.equal(false);
      expect(t.getAttribute('aria-expanded')).to.equal('false');
    }
  });

  it('url: JSON {html} and text/html fragments, same-origin credentials + mode; non-2xx / other types → error', async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith('/j')) return json({ html: '<b class="frag">JSON</b>' });
      if (url.endsWith('/h')) return htmlRes('<i class="frag">HTML</i>');
      if (url.endsWith('/t')) return new Response('<b>x</b>', { headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/bad')) return json({ nohtml: 1 });
      return json({ error: 1 }, 500);
    });
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/j' });
    t.focus();
    expect(cardEl().getAttribute('data-state')).to.equal('loading');
    await flush();
    expect(cardEl().querySelector('b.frag').textContent).to.equal('JSON');
    expect(calls[0].url).to.equal(new URL('/__hc/j', location.href).href);
    expect(calls[0].init.credentials).to.equal('same-origin');
    expect(calls[0].init.mode).to.equal('same-origin');
    TdHovercard.close();

    const t2 = add('<button type="button" data-td-hovercard="/__hc/h">Lan</button>');
    bind(t2); // no option → the declarative attribute
    t2.focus();
    await flush();
    expect(cardEl().querySelector('i.frag').textContent).to.equal('HTML');
    TdHovercard.close();

    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const u of ['/__hc/500', '/__hc/t', '/__hc/bad']) {
        const t3 = add('<button type="button">Lan</button>');
        bind(t3, { url: u });
        t3.focus();
        await flush();
        expect(cardEl().getAttribute('data-state'), u).to.equal('error');
        expect(cardEl().querySelector('b')).to.equal(null);
        TdHovercard.close();
      }
    } finally { console.warn = warn; }
  });

  it('url: cross-origin / non-http(s) refused with a warning, never fetched', async () => {
    const calls = stubFetch(() => json({ html: '<b>x</b>' }));
    const warns = [];
    const warn = console.warn;
    console.warn = (m) => warns.push(String(m));
    const bad = ['https://evil.example/card', '//evil.example/card', 'javascript:alert(1)',
      'data:text/html,<b>x</b>', 'blob:' + location.origin + '/x', ' '];
    try {
      for (const u of bad) {
        const t = add('<button type="button">Lan</button>');
        bind(t, { url: u });
        t.focus();
        expect(isOpen(), u).to.equal(false);
      }
    } finally { console.warn = warn; }
    expect(calls.length).to.equal(0);
    expect(warns.length).to.equal(6);
    expect(hovercardUrl('/a?b=1')).to.equal(new URL('/a?b=1', location.href).href);
    expect(hovercardUrl('https://evil.example/')).to.equal(null);
  });

  it('url cache: a fragment is fetched once; a failure is not cached', async () => {
    let fail = true;
    const calls = stubFetch((url) => {
      if (url.endsWith('/flaky')) {
        if (fail) { fail = false; return json({}, 503); }
        return json({ html: '<b>ok</b>' });
      }
      return json({ html: '<b>c</b>' });
    });
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/c' });
    t.focus();
    await flush();
    TdHovercard.close();
    t.blur();
    t.focus();
    await flush();
    expect(cardEl().querySelector('b').textContent).to.equal('c');
    expect(calls.filter((c) => c.url.endsWith('/c')).length).to.equal(1);
    TdHovercard.close();

    const f = add('<button type="button">Lỗi</button>');
    bind(f, { url: '/__hc/flaky' });
    const warn = console.warn;
    console.warn = () => {};
    try {
      f.focus();
      await flush();
      expect(cardEl().getAttribute('data-state')).to.equal('error');
    } finally { console.warn = warn; }
    TdHovercard.close();
    f.blur();
    f.focus();
    await flush();
    expect(cardEl().getAttribute('data-state')).to.equal('open');
    expect(calls.filter((c) => c.url.endsWith('/flaky')).length).to.equal(2);
  });
});

describe('v0.14 TdHovercard — security review (sanitize hook, bounded fetch)', () => {
  const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

  it('TdHovercard.sanitize receives every string (content() and URL fragments); Node sources bypass it; a throw → error', async () => {
    stubFetch(() => htmlRes('<img src=x onerror="window.__pwned=1"><b class="s">u</b>'));
    const seen = [];
    TdHovercard.sanitize = (h) => { seen.push(h); return h.replace(/<img[^>]*>/g, ''); };
    const a = add('<button type="button">A</button>');
    bind(a, { url: '/__hc/san' });
    a.focus();
    await flush();
    expect(cardEl().querySelector('img')).to.equal(null);
    expect(cardEl().querySelector('b.s')).to.not.equal(null);
    TdHovercard.close();
    const b = add('<button type="button">B</button>');
    bind(b, { content: () => '<i class="c">x</i>' });
    b.focus();
    expect(cardEl().querySelector('i.c')).to.not.equal(null);
    TdHovercard.close();
    const n = add('<button type="button">N</button>');
    bind(n, { content: () => richCard('n') });
    n.focus();
    expect(seen.length).to.equal(2);
    TdHovercard.close();
    TdHovercard.sanitize = () => { throw new Error('nope'); };
    const e = add('<button type="button">E</button>');
    bind(e, { content: () => '<b>x</b>' });
    await quiet(async () => { e.focus(); });
    expect(cardEl().getAttribute('data-state')).to.equal('error');
    expect(window.__pwned).to.equal(undefined);
  });

  it('#hash variants share one cache entry (one request); clearCache() forces a refetch', async () => {
    const calls = stubFetch(() => json({ html: '<b>h</b>' }));
    const a = add('<button type="button">A</button>');
    const b = add('<button type="button">B</button>');
    bind(a, { url: '/__hc/hash#1' });
    bind(b, { url: '/__hc/hash#2' });
    a.focus();
    await flush();
    b.focus();
    await flush();
    expect(cardEl().querySelector('b').textContent).to.equal('h');
    expect(calls.length).to.equal(1);
    expect(calls[0].url.includes('#')).to.equal(false);
    TdHovercard.close();
    TdHovercard.clearCache();
    a.blur();
    a.focus();
    await flush();
    expect(calls.length).to.equal(2);
  });

  it('a body over 256 KB is refused (error state, not cached)', async () => {
    const big = `<p>${'x'.repeat(300 * 1024)}</p>`;
    const calls = stubFetch(() => htmlRes(big));
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/big' });
    await quiet(async () => { t.focus(); await flush(); await wait(20); });
    expect(cardEl().getAttribute('data-state')).to.equal('error');
    TdHovercard.close();
    t.blur();
    await quiet(async () => { t.focus(); await flush(); await wait(20); });
    expect(calls.length).to.equal(2);
  });

  it('closing the card aborts its request; the aborted fetch is not cached', async () => {
    const signals = [];
    window.fetch = (url, init) => { signals.push(init.signal); return new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))); };
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/slow' });
    t.focus();
    await flush();
    expect(cardEl().getAttribute('data-state')).to.equal('loading');
    TdHovercard.close();
    expect(signals[0].aborted).to.equal(true);
    t.blur();
    t.focus();
    await flush();
    expect(signals.length, 'a new request, not the aborted cached promise').to.equal(2);
    expect(signals[1].aborted).to.equal(false);
  });
});

describe('v0.14 TdHovercard — security review round 2 (size cancel, auth-scoped cache, Trusted Types)', () => {
  const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

  it('a declared Content-Length over the cap is refused without reading; the body stream is cancelled', async () => {
    let cancelled = false;
    let pulls = 0;
    stubFetch(() => new Response(new ReadableStream({
      pull(c) { pulls++; c.enqueue(new Uint8Array(1024)); },
      cancel() { cancelled = true; },
    }), { headers: { 'content-type': 'text/html', 'content-length': String(8 * 1024 * 1024) } }));
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/declared-big' });
    await quiet(async () => { t.focus(); await flush(); await wait(20); });
    expect(cardEl().getAttribute('data-state')).to.equal('error');
    expect(cancelled).to.equal(true);
    expect(pulls <= 2, `pulled ${pulls} chunks`).to.equal(true);
  });

  it('non-2xx and unsupported content-type responses cancel their (streaming) bodies', async () => {
    const cancelled = [];
    stubFetch((url) => new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(64)); },
      cancel() { cancelled.push(url); },
    }), url.endsWith('/500') ? { status: 500, headers: { 'content-type': 'text/html' } } : { headers: { 'content-type': 'image/png' } }));
    for (const u of ['/__hc/500', '/__hc/png']) {
      const t = add('<button type="button">x</button>');
      bind(t, { url: u });
      await quiet(async () => { t.focus(); await flush(); await wait(20); });
      expect(cardEl().getAttribute('data-state'), u).to.equal('error');
      TdHovercard.close();
    }
    expect(cancelled.length).to.equal(2);
  });

  it('Cache-Control: no-store, cache:false and data-td-hovercard-cache="false" always refetch', async () => {
    const calls = stubFetch((url) => new Response('<b>p</b>', { headers: {
      'content-type': 'text/html', ...(url.endsWith('/nostore') ? { 'cache-control': 'private, no-store' } : {}),
    } }));
    const a = add('<button type="button">A</button>');
    const b = add('<button type="button">B</button>');
    const c = add('<button type="button" data-td-hovercard="/__hc/attr" data-td-hovercard-cache="false">C</button>');
    bind(a, { url: '/__hc/nostore' });
    bind(b, { url: '/__hc/opt', cache: false });
    bind(c);
    for (const t of [a, b, c, a, b, c]) {
      t.focus();
      await flush();
      expect(cardEl().querySelector('b').textContent).to.equal('p');
      TdHovercard.close();
      t.blur();
    }
    for (const u of ['/nostore', '/opt', '/attr']) expect(calls.filter((x) => x.url.endsWith(u)).length, u).to.equal(2);
    expect(calls.every((x) => x.init.cache === 'no-store'), 'the HTTP cache is bypassed too').to.equal(true);
  });

  it('clearCache() also closes the open card (it may show the previous user\'s data)', async () => {
    stubFetch(() => json({ html: '<b>me</b>' }));
    const t = add('<button type="button">Lan</button>');
    bind(t, { url: '/__hc/me' });
    t.focus();
    await flush();
    expect(isOpen()).to.equal(true);
    TdHovercard.clearCache();
    expect(isOpen()).to.equal(false);
    expect(cardEl().childNodes.length).to.equal(0);
  });

  it('under require-trusted-types-for: TrustedHTML renders (sync, async, URL via sanitize), a plain string fails closed', async () => {
    if (!window.trustedTypes) return; // engine without Trusted Types
    const frame = document.createElement('iframe');
    frame.src = '/test/fixtures/hovercard-tt.html';
    document.body.appendChild(frame);
    try {
      for (let i = 0; i < 100 && !frame.contentWindow.__ready; i++) await wait(20);
      const w = frame.contentWindow;
      const d = frame.contentDocument;
      expect(!!w.__ready, 'module loaded in the TT frame').to.equal(true);
      const policy = w.trustedTypes.createPolicy('td-test', { createHTML: (h) => h });
      const H = w.TdHovercard;
      const errors = [];
      w.addEventListener('error', (e) => errors.push(e.message));
      w.console.warn = () => {};
      w.fetch = () => Promise.resolve(new w.Response('<b class="u">url</b>', { headers: { 'content-type': 'text/html' } }));
      const mk = (label) => { const b = d.createElement('button'); b.type = 'button'; b.textContent = label; d.body.appendChild(b); return b; };
      const card = () => d.getElementById('td-hovercard');
      const cases = [
        ['sync', { content: () => policy.createHTML('<b class="sync">s</b>') }, '.sync', null],
        ['async', { content: () => new Promise((r) => setTimeout(() => r(policy.createHTML('<b class="async">a</b>')), 10)) }, '.async', null],
        ['url', { url: '/__hc/tt' }, '.u', (h) => policy.createHTML(h)],
        ['plain', { content: () => '<b class="plain">p</b>' }, null, null],
        ['empty-trusted', { content: () => policy.createHTML('  ') }, 'EMPTY', null],
      ];
      for (const [name, opts, sel, san] of cases) {
        H.sanitize = san;
        const t = mk(name);
        const un = H.bind(t, opts);
        t.focus();
        await flush();
        await wait(40);
        if (sel === 'EMPTY') {
          expect(card().hidden, name).to.equal(true); // nothing opens, like an empty string
        } else if (sel) {
          expect(card().getAttribute('data-state'), name).to.equal('open');
          expect(card().querySelector(sel), name).to.not.equal(null);
        } else {
          expect(card().getAttribute('data-state'), name).to.equal('error');
          expect(card().querySelector('.plain'), name).to.equal(null);
        }
        H.close();
        un();
      }
      expect(errors, 'no uncaught Trusted Types violation').to.deep.equal([]);
    } finally {
      frame.remove();
    }
  });
});

describe('v0.14 TdHovercard — stale async (one render token)', () => {
  it('A resolves after B: B wins (content and fetch alike)', async () => {
    const a = add('<button type="button">A</button>');
    const b = add('<button type="button">B</button>');
    const da = deferred();
    const db = deferred();
    bind(a, { content: () => da.promise });
    bind(b, { content: () => db.promise });
    a.focus();
    b.focus(); // trigger switch bumps the token
    db.resolve('<p class="b">B</p>');
    await flush();
    da.resolve('<p class="a">A</p>');
    await flush();
    expect(cardEl().querySelector('.b')).to.not.equal(null);
    expect(cardEl().querySelector('.a')).to.equal(null);
    expect(a.getAttribute('aria-expanded')).to.equal('false');
    expect(b.getAttribute('aria-expanded')).to.equal('true');
    TdHovercard.close();

    // a stale REJECTION while B is loading leaves B's loading state alone
    const dc = deferred();
    const dd = deferred();
    const c = add('<button type="button">C</button>');
    const d = add('<button type="button">D</button>');
    bind(c, { content: () => dc.promise });
    bind(d, { url: '/__hc/d' });
    stubFetch(() => dd.promise);
    c.focus();
    d.focus();
    dc.reject(new Error('late'));
    await flush();
    expect(cardEl().getAttribute('data-state')).to.equal('loading');
    dd.resolve(json({ html: '<p class="d">D</p>' }));
    await flush();
    expect(cardEl().querySelector('.d')).to.not.equal(null);
  });

  it('resolve and reject after close: the card stays closed and unchanged', async () => {
    const t = add('<button type="button">Lan</button>');
    const other = add('<button type="button">Khác</button>');
    const d1 = deferred();
    const d2 = deferred();
    let n = 0;
    bind(t, { content: () => (++n === 1 ? d1.promise : d2.promise) });
    t.focus();
    TdHovercard.close();
    d1.resolve('<p class="late">muộn</p>');
    await flush();
    expect(isOpen()).to.equal(false);
    expect(cardEl().childNodes.length).to.equal(0);
    expect(cardEl().getAttribute('data-state')).to.equal('closed');
    other.focus();
    t.focus();
    TdHovercard.close();
    const warns = [];
    const warn = console.warn;
    console.warn = (m) => warns.push(m);
    try {
      d2.reject(new Error('late'));
      await flush();
    } finally { console.warn = warn; }
    expect(isOpen()).to.equal(false);
    expect(cardEl().getAttribute('data-state')).to.equal('closed');
    expect(cardEl().childNodes.length).to.equal(0);
    expect(warns.length).to.equal(0);
  });

  it('unbind while loading: a later resolution does nothing', async () => {
    const t = add('<button type="button">Lan</button>');
    const d = deferred();
    const unbind = bind(t, { content: () => d.promise });
    t.focus();
    unbind();
    expect(isOpen()).to.equal(false);
    d.resolve('<p class="late">x</p>');
    await flush();
    expect(isOpen()).to.equal(false);
    expect(cardEl().querySelector('.late')).to.equal(null);
  });
});

describe('v0.14 TdHovercard — accessible name + XSS', () => {
  it('name precedence: label → data-td-hovercard-label → aria-label → text (trimmed, capped) → labels.dialog', () => {
    const cases = [
      ['<button type="button" data-td-hovercard-label="Thuộc tính" aria-label="Aria">Chữ</button>', { label: '  Nhãn rõ ràng ' }, 'Nhãn rõ ràng'],
      ['<button type="button" data-td-hovercard-label="Thuộc tính" aria-label="Aria">Chữ</button>', {}, 'Thuộc tính'],
      ['<button type="button" aria-label="Hồ sơ Lan">Chữ</button>', {}, 'Hồ sơ Lan'],
      ['<button type="button">\n   Nguyễn   Văn\n Lan  </button>', {}, 'Nguyễn Văn Lan'],
      ['<button type="button"><svg aria-hidden="true"></svg></button>', {}, TdHovercard.labels.dialog],
    ];
    for (const [html, o, want] of cases) {
      const t = add(html);
      bind(t, { ...o, content: () => 'x' });
      t.focus();
      expect(cardEl().getAttribute('aria-label')).to.equal(want);
      TdHovercard.close();
    }
    const long = add(`<button type="button">${'Tên rất dài '.repeat(20)}</button>`);
    bind(long, { content: () => 'x' });
    long.focus();
    const name = cardEl().getAttribute('aria-label');
    expect(name.length <= 80).to.equal(true);
    expect(name.endsWith('…')).to.equal(true);
  });

  it('labels / attributes are text, never markup', async () => {
    const x = '"><img src=x onerror="window.__hcXss=1">';
    window.__hcXss = 0;
    const t = document.createElement('button');
    t.type = 'button';
    t.setAttribute('data-td-hovercard-label', x);
    t.setAttribute('data-td-hovercard-template', x);
    host.appendChild(t);
    const saved = { ...TdHovercard.labels };
    TdHovercard.labels.loading = x;
    TdHovercard.labels.error = x;
    const warn = console.warn;
    console.warn = () => {};
    try {
      bindAll(host);
      t.focus(); // template id not found → nothing
      expect(isOpen()).to.equal(false);
      const d = deferred();
      const t2 = add('<button type="button">b</button>');
      t2.setAttribute('data-td-hovercard-label', x);
      bind(t2, { content: () => d.promise });
      t2.focus();
      expect(cardEl().getAttribute('aria-label')).to.equal(x);
      expect(cardEl().querySelector('.td-hovercard__text').textContent).to.equal(x);
      expect(cardEl().querySelector('img')).to.equal(null);
      d.reject(new Error('x'));
      await flush();
      expect(cardEl().querySelector('.td-hovercard__text').textContent).to.equal(x);
      expect(cardEl().querySelector('img')).to.equal(null);
    } finally {
      console.warn = warn;
      Object.assign(TdHovercard.labels, saved);
    }
    await wait(20);
    expect(window.__hcXss).to.equal(0);
  });
});

describe('v0.14 TdHovercard — bindAll, unbind, reconnect', () => {
  it('bindAll: delegation for existing and later triggers, ARIA up front, idempotent, explicit bind wins', async () => {
    host.insertAdjacentHTML('beforeend', '<template id="ba-tpl"><p class="ba">Mẫu</p></template>');
    const root = add('<div><a href="#u1" data-td-hovercard-template="ba-tpl">Lan</a><span data-td-hovercard-template="ba-tpl">Minh</span></div>');
    const [a, s] = root.children;
    const u1 = bindAll(root);
    const u2 = TdHovercard.bindAll(root);
    expect(u1 === u2).to.equal(true);
    expect(a.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(a.getAttribute('aria-expanded')).to.equal('false');
    expect(a.hasAttribute('tabindex')).to.equal(false);
    expect(s.getAttribute('tabindex')).to.equal('0');
    a.focus();
    expect(cardEl().querySelector('p.ba')).to.not.equal(null);
    expect(a.getAttribute('aria-expanded')).to.equal('true');
    TdHovercard.close();
    // added later
    root.insertAdjacentHTML('beforeend', '<button type="button" data-td-hovercard-template="ba-tpl">Sau</button>');
    const late = root.lastElementChild;
    late.focus();
    expect(isOpen()).to.equal(true);
    expect(late.getAttribute('aria-haspopup')).to.equal('dialog');
    TdHovercard.close();
    // explicit bind on a declarative trigger wins
    bind(a, { content: () => '<p class="explicit">JS</p>' });
    a.blur();
    a.focus();
    expect(cardEl().querySelector('.explicit')).to.not.equal(null);
    TdHovercard.close();
    // unbind restores and stops delegation
    u1();
    expect(s.hasAttribute('tabindex')).to.equal(false);
    expect(s.hasAttribute('aria-haspopup')).to.equal(false);
    expect(late.hasAttribute('aria-expanded')).to.equal(false);
    late.blur();
    late.focus();
    expect(isOpen()).to.equal(false);
  });

  it('overlapping owners (review ISSUE-5): explicit bind over bindAll, either teardown order, keeps live ARIA', () => {
    const root = add('<div><span data-td-hovercard-template="x" aria-haspopup="listbox">Lan</span></div>');
    const s0 = root.firstElementChild;
    // bindAll first, explicit bind later; bindAll released first → the explicit binding keeps its ARIA
    const ua = TdHovercard.bindAll(root);
    const ub = TdHovercard.bind(s0, { content: () => 'x' });
    ua();
    expect(s0.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(s0.getAttribute('tabindex')).to.equal('0');
    ub();
    expect(s0.getAttribute('aria-haspopup')).to.equal('listbox');
    expect(s0.hasAttribute('tabindex')).to.equal(false);
    expect(s0.hasAttribute('aria-expanded')).to.equal(false);
    // explicit bind released first → bindAll still owns it
    const ua2 = TdHovercard.bindAll(root);
    const ub2 = TdHovercard.bind(s0, { content: () => 'x' });
    ub2();
    expect(s0.getAttribute('aria-haspopup')).to.equal('dialog');
    ua2();
    expect(s0.getAttribute('aria-haspopup')).to.equal('listbox');
    expect(s0.hasAttribute('tabindex')).to.equal(false);
  });

  it('bind() BEFORE bindAll() on a non-focusable trigger: explicit unbind keeps delegated ARIA + tabindex (ISSUE-9)', () => {
    const root = add('<div><span data-td-hovercard-template="x">Lan</span></div>');
    const s0 = root.firstElementChild;
    const ub = TdHovercard.bind(s0, { content: () => 'x' });
    const ua = TdHovercard.bindAll(root);
    ub();
    expect(s0.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(s0.getAttribute('aria-expanded')).to.equal('false');
    expect(s0.getAttribute('tabindex')).to.equal('0');
    ua();
    expect(s0.hasAttribute('aria-haspopup')).to.equal(false);
    expect(s0.hasAttribute('tabindex')).to.equal(false);
  });

  it('unbinding an overlapping bindAll() keeps the explicit binding\'s pending hover intent (review ISSUE-10)', async () => {
    host.insertAdjacentHTML('beforeend', '<template id="ov-tpl"><p>Mẫu</p></template>');
    const root = add('<div><button type="button" data-td-hovercard-template="ov-tpl">Lan</button></div>');
    const t = root.firstElementChild;
    const ua = TdHovercard.bindAll(root);
    bind(t, { content: () => '<p class="ov-explicit">JS</p>' });
    await sendMouse({ type: 'move', position: center(t) });
    await wait(100);
    ua();
    await wait(350);
    expect(isOpen()).to.equal(true);
    expect(cardEl().querySelector('.ov-explicit')).to.not.equal(null);
  });

  it('nested bindAll roots: unbinding the outer root during the delay keeps the inner root\'s intent (ISSUE-11)', async () => {
    host.insertAdjacentHTML('beforeend', '<template id="nr-tpl"><p class="nr">Mẫu</p></template>');
    const outer = add('<div><div><button type="button" data-td-hovercard-template="nr-tpl">Lan</button></div></div>');
    const inner = outer.firstElementChild;
    const t = inner.firstElementChild;
    const uo = TdHovercard.bindAll(outer);
    bindAll(inner);
    await sendMouse({ type: 'move', position: center(t) });
    await wait(100);
    uo();
    await wait(350);
    expect(isOpen()).to.equal(true);
    expect(cardEl().querySelector('p.nr')).to.not.equal(null);
  });

  it('nested bindAll roots: releasing either root first never restores stale ARIA under the other', () => {
    const outer = add('<div><div><span data-td-hovercard-template="x">Lan</span></div></div>');
    const inner = outer.firstElementChild;
    const s0 = inner.firstElementChild;
    for (const order of ['inner-first', 'outer-first']) {
      const uo = TdHovercard.bindAll(outer);
      const ui = TdHovercard.bindAll(inner);
      const [first, second] = order === 'inner-first' ? [ui, uo] : [uo, ui];
      first();
      expect(s0.getAttribute('aria-haspopup'), order).to.equal('dialog');
      expect(s0.getAttribute('tabindex'), order).to.equal('0');
      second();
      expect(s0.hasAttribute('aria-haspopup'), order).to.equal(false);
      expect(s0.hasAttribute('tabindex'), order).to.equal(false);
    }
  });

  it('bindAll ignores triggers inside the card (no nested hovercards)', async () => {
    host.insertAdjacentHTML('beforeend', '<template id="nest-tpl"><button type="button" id="nested" data-td-hovercard-template="nest-tpl">Trong</button></template>');
    const t = add('<button type="button" data-td-hovercard-template="nest-tpl">Ngoài</button>');
    bindAll(document);
    t.focus();
    const inner = document.getElementById('nested');
    expect(inner).to.not.equal(null);
    expect(inner.hasAttribute('aria-haspopup')).to.equal(false);
    inner.focus();
    expect(isOpen()).to.equal(true);
    expect(same(cardEl().querySelector('#nested'), inner)).to.equal(true);
  });

  it('unbind while open closes the card, removes listeners and restores ARIA', async () => {
    const t = add('<button type="button">Lan</button>');
    const unbind = bind(t, { content: () => richCard() });
    t.focus();
    document.getElementById('c-1').focus();
    unbind();
    expect(isOpen()).to.equal(false);
    expect(same(active(), t), 'focus never stranded on <body>').to.equal(true);
    expect(t.hasAttribute('aria-haspopup')).to.equal(false);
    expect(t.hasAttribute('aria-expanded')).to.equal(false);
    expect(t.hasAttribute('aria-controls')).to.equal(false);
    t.blur();
    t.focus();
    await sendMouse({ type: 'move', position: center(t) });
    await wait(420);
    expect(isOpen()).to.equal(false);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
  });

  it('reconnect: a detached + re-attached trigger still works; a removed card is re-created in <body>', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    t.remove();
    host.appendChild(t);
    t.focus();
    expect(isOpen()).to.equal(true);
    TdHovercard.close();
    cardEl().remove();
    t.blur();
    t.focus();
    expect(isOpen()).to.equal(true);
    expect(cardEl().parentElement === document.body).to.equal(true);
  });

  it('the trigger removed while open → closes on the next scroll/resize', async () => {
    const t = add('<button type="button">Lan</button>');
    bind(t, { content: () => 'Thẻ' });
    t.focus();
    t.remove();
    window.dispatchEvent(new Event('resize'));
    expect(isOpen()).to.equal(false);
  });
});

describe('v0.14 TdHovercard — golden contract', () => {
  const KEEP = ['type', 'role', 'id', 'tabindex', 'hidden', 'aria-hidden', 'aria-label', 'aria-haspopup',
    'aria-expanded', 'aria-controls', 'aria-modal', 'data-state', 'data-placement', 'href',
    'data-td-hovercard', 'data-td-hovercard-template'];
  function shape(el) {
    const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    const cls = [...el.classList].sort().join('.');
    const kids = el.localName === 'svg' ? [] : [...el.children].map(shape);
    return { tag: el.localName, cls, attrs, kids };
  }

  it('matches test/contracts/hovercard.html (bound triggers + open / loading / error card)', async () => {
    const html = await (await fetch('/test/contracts/hovercard.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template[data-component]')];
    expect(ts.length).to.equal(5);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      const warn = console.warn;
      console.warn = () => {};
      try {
        new Function('el', 'TdHovercard', 'unbinds', t.getAttribute('data-setup'))(el, TdHovercard, unbinds);
        const pause = Number(t.getAttribute('data-await') || 0);
        if (pause) await wait(pause);
      } finally { console.warn = warn; }
      const got = t.hasAttribute('data-portal') ? cardEl() : el.firstElementChild;
      expect(JSON.stringify(shape(got))).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      TdHovercard.close();
      while (unbinds.length) unbinds.pop()();
    }
  });
});
