import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdMenu } from './td-menu.js';

// v0.14.0 G9 — TdMenu option registry (define / register / when / order / group / named open / bindAll). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const menuEl = () => document.querySelector('body > .td-menu');
const labels = () => [...(menuEl()?.children || [])].map((n) => (
  n.classList.contains('td-menu__separator') ? '—' : n.querySelector('.td-menu__label')?.textContent
));
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};

function btn(label = 'Mở', attrs = '') {
  host.insertAdjacentHTML('beforeend', `<button type="button" ${attrs}>${label}</button>`);
  return /** @type {HTMLButtonElement} */ (host.lastElementChild);
}

let seq = 0;
const uniq = () => `t${++seq}-${Math.random().toString(36).slice(2, 7)}`;
const cleanups = [];
const track = (fn) => { cleanups.push(fn); return fn; };

afterEach(async () => {
  TdMenu.close();
  while (cleanups.length) cleanups.pop()();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
  await resetMouse();
  await wait(0);
});

async function withConsole(kind, fn) {
  const calls = [];
  const orig = console[kind];
  console[kind] = (...a) => calls.push(a);
  try { await fn(); } finally { console[kind] = orig; }
  return calls;
}

describe('v0.14 TdMenu registry — define / register / order', () => {
  it('define + register: base keeps index×10 order, registered default appends, explicit order inserts', () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    track(TdMenu.register(n, { label: 'Cuối' }));
    track(TdMenu.register(n, { label: 'Giữa A-B', order: 5 }));
    track(TdMenu.register(n, [{ label: 'Đầu', order: -1 }, { label: 'Sau B' }], { order: 15 }));
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['Đầu', 'A', 'Giữa A-B', 'B', 'Sau B', 'C', 'Cuối']);
  });

  it('register BEFORE define works; redefine replaces the base list; ties keep registration order', () => {
    const n = uniq();
    track(TdMenu.register(n, { label: 'P1' }));
    track(TdMenu.register(n, { label: 'P2' }));
    expect(TdMenu.has(n)).to.equal(true);
    track(TdMenu.define(n, [{ label: 'Cũ' }]));
    track(TdMenu.define(n, [{ label: 'Mới 1' }, { label: 'Mới 2' }]));
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['Mới 1', 'Mới 2', 'P1', 'P2']);
  });

  it('unregister / undefine remove exactly their own contribution; empty name becomes unknown', async () => {
    const n = uniq();
    const undef = TdMenu.define(n, [{ label: 'Gốc' }]);
    const unreg = TdMenu.register(n, { label: 'Thêm' });
    const b = btn();
    TdMenu.open(b, n);
    expect(labels()).to.deep.equal(['Gốc', 'Thêm']);
    TdMenu.close();
    unreg();
    unreg(); // idempotent
    TdMenu.open(b, n);
    expect(labels()).to.deep.equal(['Gốc']);
    TdMenu.close();
    undef();
    expect(TdMenu.has(n)).to.equal(false);
    const warns = await withConsole('warn', () => { expect(TdMenu.open(b, n)).to.equal(null); });
    expect(warns.length).to.equal(1);
    expect(menuEl()).to.equal(null);
  });

  it('a stale undefine does not remove a newer definition', () => {
    const n = uniq();
    const oldUndef = TdMenu.define(n, [{ label: 'Cũ' }]);
    track(TdMenu.define(n, [{ label: 'Mới' }]));
    oldUndef();
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['Mới']);
  });

  it('caller arrays are copied at define/register time (later mutation of the array does not leak in)', () => {
    const n = uniq();
    const base = [{ label: 'X' }];
    track(TdMenu.define(n, base));
    base.push({ label: 'Lén' });
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['X']);
  });

  it('unknown name → console.warn + null, and an already open menu stays open', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'X' }]));
    const a = btn('a');
    TdMenu.open(a, n);
    const warns = await withConsole('warn', () => { expect(TdMenu.open(btn('b'), 'khong-ton-tai-' + uniq())).to.equal(null); });
    expect(warns.length).to.equal(1);
    expect(TdMenu.isOpen(a)).to.equal(true);
  });

  it('invalid define/register arguments warn and return a no-op', async () => {
    const warns = await withConsole('warn', () => {
      expect(typeof TdMenu.define('', [])).to.equal('function');
      expect(typeof TdMenu.define(uniq(), 'x')).to.equal('function');
      expect(typeof TdMenu.register(uniq(), null)).to.equal('function');
    });
    expect(warns.length).to.equal(3);
  });
});

describe('v0.14 TdMenu registry — when() / groups / separators', () => {
  it('when(ctx) hides items; a throwing when hides + warns; ctx carries opts.ctx', async () => {
    const n = uniq();
    const seen = [];
    track(TdMenu.define(n, [
      { label: 'Sửa', when: (c) => { seen.push(c); return c.canEdit === true; } },
      { label: 'Xem' },
      { label: 'Lỗi', when: () => { throw new Error('boom'); } },
    ]));
    track(TdMenu.register(n, { label: 'Ghim', when: (c) => c.canEdit === false }));
    const b = btn();
    const warns = await withConsole('warn', () => { TdMenu.open(b, n, { ctx: { canEdit: true } }); });
    expect(labels()).to.deep.equal(['Sửa', 'Xem']);
    expect(warns.length).to.equal(1);
    expect(same(seen[0].anchor, b) && seen[0].name === n).to.equal(true);
  });

  it('when() is honoured for plain item lists too', () => {
    TdMenu.open(btn(), [{ label: 'Hiện' }, { label: 'Ẩn', when: () => false }]);
    expect(labels()).to.deep.equal(['Hiện']);
  });

  it('all items hidden → open returns null', () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'Ẩn', when: () => false }]));
    expect(TdMenu.open(btn(), n)).to.equal(null);
  });

  it('a registered group is separated from other groups; base separators kept; doubles/edges collapsed', () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'Sửa' }, { separator: true }, { label: 'Xoá', danger: true }, { separator: true }]));
    track(TdMenu.register(n, [{ label: 'Chia sẻ Zalo' }, { label: 'Chia sẻ FB' }], { group: 'share' }));
    track(TdMenu.register(n, { label: 'Không nhóm', order: 5 }));
    track(TdMenu.register(n, { label: 'Ẩn', when: () => false }, { group: 'hidden', order: -5 }));
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['Sửa', 'Không nhóm', '—', 'Xoá', '—', 'Chia sẻ Zalo', 'Chia sẻ FB']);
  });

  it('two registered groups interleaved by order get a separator at each group change', () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }]));
    track(TdMenu.register(n, { label: 'G1' }, { group: 'g1', order: 100 }));
    track(TdMenu.register(n, { label: 'G2' }, { group: 'g2', order: 200 }));
    TdMenu.open(btn(), n);
    expect(labels()).to.deep.equal(['A', '—', 'G1', '—', 'G2']);
  });

  it('`group` option is NOT the radio group: radio items keep their own item.group', async () => {
    const n = uniq();
    track(TdMenu.define(n, []));
    track(TdMenu.register(n, [
      { label: 'Một', group: 'r', checked: true },
      { label: 'Hai', group: 'r', checked: false },
    ], { group: 'sort' }));
    TdMenu.open(btn(), n);
    const roles = [...menuEl().querySelectorAll('.td-menu__item')].map((x) => x.getAttribute('role'));
    expect(roles).to.deep.equal(['menuitemradio', 'menuitemradio']);
  });
});

describe('v0.14 TdMenu registry — ctx', () => {
  it('builder (ctx) => items and onSelect receive ctx from opts.ctx + data-td-menu-* (camelCased strings)', async () => {
    const n = uniq();
    let built = null;
    let selected = null;
    const item = { label: 'Chép', onSelect: (c) => { selected = c; } };
    track(TdMenu.define(n, (c) => { built = c; return [item]; }));
    const b = btn('x', `data-td-menu="${n}" data-td-menu-post-id="42" data-td-menu-owner="an" data-td-menu-name="gia-mao" data-td-menu-anchor="gia-mao"`);
    TdMenu.open(b, n, { ctx: { postId: 'bị ghi đè', extra: 7, anchor: 'x' } });
    expect(built.postId).to.equal('42');
    expect(built.owner).to.equal('an');
    expect(built.extra).to.equal(7);
    expect(built.name).to.equal(n);
    expect(same(built.anchor, b)).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(same(selected.item, item) && same(selected.anchor, b)).to.equal(true);
    expect(selected.postId).to.equal('42');
    expect(selected.name).to.equal(n);
    expect(selected.checked).to.equal(false);
  });

  it('plain lists keep the old onSelect ctx shape (item, anchor, checked) with name ""', async () => {
    const b = btn();
    let ctx = null;
    const item = { label: 'X', onSelect: (c) => { ctx = c; } };
    TdMenu.open(b, [item]);
    await sendKeys({ press: 'Enter' });
    expect(same(ctx.item, item) && same(ctx.anchor, b) && ctx.checked === false && ctx.name === '').to.equal(true);
  });
});

describe('v0.14 TdMenu.bindAll — declarative triggers', () => {
  it('sets ARIA on present triggers; click opens the named menu (toggle); unbind restores ARIA', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'Một' }, { label: 'Hai' }]));
    const b = btn('Tùy chọn', `data-td-menu="${n}" id="own-id"`);
    const unbind = TdMenu.bindAll(host);
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    await sendMouse({ type: 'click', position: center(b) });
    expect(TdMenu.isOpen(b)).to.equal(true);
    expect(b.getAttribute('aria-expanded')).to.equal('true');
    expect(same(document.activeElement, menuEl().querySelector('.td-menu__item'))).to.equal(true);
    expect(labels()).to.deep.equal(['Một', 'Hai']);
    await sendMouse({ type: 'click', position: center(b) });
    expect(TdMenu.isOpen(b)).to.equal(false);
    await sendMouse({ type: 'click', position: center(b) });
    expect(TdMenu.isOpen(b)).to.equal(true);
    unbind();
    expect(TdMenu.isOpen(b)).to.equal(false);
    expect(b.hasAttribute('aria-haspopup')).to.equal(false);
    expect(b.hasAttribute('aria-expanded')).to.equal(false);
    expect(b.hasAttribute('aria-controls')).to.equal(false);
    expect(b.id).to.equal('own-id');
    b.click();
    expect(TdMenu.isOpen(b)).to.equal(false);
  });

  it('delegation: a trigger added after bindAll works; ARIA is set lazily (focus) and restored on unbind', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    const unbind = track(TdMenu.bindAll(host));
    const b = btn('Mới', `data-td-menu="${n}"`);
    expect(b.hasAttribute('aria-haspopup')).to.equal(false);
    b.focus();
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    expect(b.getAttribute('aria-expanded')).to.equal('false');
    await sendKeys({ press: 'ArrowUp' });
    expect(TdMenu.isOpen(b)).to.equal(true);
    expect(document.activeElement?.textContent).to.equal('C');
    await sendKeys({ press: 'Escape' });
    expect(TdMenu.isOpen(b)).to.equal(false);
    expect(same(document.activeElement, b)).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(document.activeElement?.textContent).to.equal('A');
    unbind();
    expect(b.hasAttribute('aria-haspopup')).to.equal(false);
    expect(b.hasAttribute('aria-expanded')).to.equal(false);
    expect(b.hasAttribute('id')).to.equal(false);
  });

  it('idempotent per root; nested roots (document + host) never double-toggle one click', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }]));
    const u1 = TdMenu.bindAll(host);
    const u2 = TdMenu.bindAll(host);
    expect(u1 === u2).to.equal(true);
    track(u1);
    track(TdMenu.bindAll()); // document
    const b = btn('x', `data-td-menu="${n}"`);
    b.click();
    expect(TdMenu.isOpen(b)).to.equal(true);
  });

  it('pre-existing ARIA is kept and restored; triggers wired with bind() are left alone', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }]));
    const a = btn('a', `data-td-menu="${n}" aria-haspopup="true"`);
    const own = btn('own', `data-td-menu="${n}"`);
    const log = [];
    track(TdMenu.bind(own, [{ label: 'Riêng', onSelect: () => log.push('own') }]));
    const unbind = TdMenu.bindAll(host);
    expect(a.getAttribute('aria-haspopup')).to.equal('true');
    own.click();
    expect(labels()).to.deep.equal(['Riêng']); // only bind()'s list, opened once
    TdMenu.close();
    unbind();
    expect(a.getAttribute('aria-haspopup')).to.equal('true');
    expect(a.hasAttribute('aria-expanded')).to.equal(false);
    expect(own.getAttribute('aria-haspopup')).to.equal('menu'); // bind()'s ARIA untouched
  });

  it('disabled triggers and triggers outside root do not open; unknown name warns', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }]));
    const d = btn('d', `data-td-menu="${n}" disabled`);
    const ad = btn('ad', `data-td-menu="${n}" aria-disabled="true"`);
    const outside = document.createElement('button');
    outside.setAttribute('data-td-menu', n);
    document.body.appendChild(outside);
    try {
      track(TdMenu.bindAll(host));
      d.click();
      ad.click();
      outside.click();
      expect(TdMenu.isOpen()).to.equal(false);
      const u = btn('u', 'data-td-menu="khong-co-menu-nay"');
      const warns = await withConsole('warn', () => { u.click(); });
      expect(warns.length).to.equal(1);
      expect(TdMenu.isOpen()).to.equal(false);
    } finally {
      outside.remove();
    }
  });

  it('click on a descendant of the trigger (icon span) opens it; bindAll does not auto-run on import', async () => {
    const n = uniq();
    track(TdMenu.define(n, [{ label: 'A' }]));
    host.insertAdjacentHTML('beforeend', `<button type="button" data-td-menu="${n}"><span class="ic">•</span></button>`);
    const b = /** @type {HTMLElement} */ (host.lastElementChild);
    expect(b.hasAttribute('aria-haspopup')).to.equal(false); // no global binding exists before bindAll
    b.click();
    expect(TdMenu.isOpen()).to.equal(false);
    track(TdMenu.bindAll(host));
    /** @type {HTMLElement} */ (b.querySelector('.ic')).click();
    expect(TdMenu.isOpen(b)).to.equal(true);
  });
});

describe('v0.14 TdMenu registry — XSS', () => {
  it('registered labels / hints / data-td-menu-* values render as text only', async () => {
    const n = uniq();
    const evil = '<img src=x onerror="window.__tdMenuXss=1">';
    track(TdMenu.define(n, (c) => [{ label: c.title, hint: evil }]));
    track(TdMenu.register(n, { label: evil }, { group: 'plugin' }));
    const b = btn('x', `data-td-menu="${n}"`);
    b.setAttribute('data-td-menu-title', evil);
    track(TdMenu.bindAll(host));
    b.click();
    await wait(20);
    const m = menuEl();
    expect(m.querySelector('img')).to.equal(null);
    expect(labels()).to.deep.equal([evil, '—', evil]);
    expect(window.__tdMenuXss).to.equal(undefined);
  });
});
