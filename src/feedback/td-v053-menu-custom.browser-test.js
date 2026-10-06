import { expect } from '@esm-bundle/chai';
import { TdMenu } from './td-menu.js';
import { TdModal } from './td-modal.js';
import { MENU_SNAPSHOT_LISTS, normaliseMenuHtml } from '../../test/fixtures/menu-v052-lists.js';

// v0.53.0 M2 (plan docs/internal/plans/v0.53.0-menu-custom-item.md QĐ 1, 6–10, 12): TdMenu `type: 'custom'` — DOM of the
// menu panel, render(ctx) lifecycle, rejection paths, signals. Keyboard / focus / pointer: the .engines. file.

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const SNAP = await (await fetch('/test/fixtures/menu-v052-dom.json')).json();

const host = document.createElement('div');
document.body.appendChild(host);
const panel = () => document.querySelector('body > .td-menu');
const same = (a, b) => a === b;

function btn(label = 'Tài khoản') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  host.appendChild(b);
  return b;
}

/** console.warn spy */
function spyWarn() {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => { calls.push(a); };
  return { calls, restore: () => { console.warn = orig; } };
}

const box = (text = 'Nội dung') => {
  const d = document.createElement('div');
  d.className = 'site-box';
  d.textContent = text;
  return d;
};

afterEach(() => {
  TdMenu.close();
  TdModal.closeAll?.();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
});

describe('v0.53 TdMenu custom — menus without a custom item are byte-identical to v0.52', () => {
  for (const [k, make] of Object.entries(MENU_SNAPSHOT_LISTS)) {
    it(`${k}: menu + trigger markup unchanged`, () => {
      let undo = [];
      if (make.define) undo = [TdMenu.define(make.name, make.define), TdMenu.register(make.name, ...make.register)];
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'T';
      host.appendChild(b);
      TdMenu.open(b, make.items(), make.opts || {});
      expect(normaliseMenuHtml(panel().outerHTML)).to.equal(SNAP[k].menu);
      expect(normaliseMenuHtml(b.outerHTML)).to.equal(SNAP[k].trigger);
      TdMenu.close();
      undo.forEach((f) => f());
    });
  }
});

describe('v0.53 TdMenu custom — panel DOM (QĐ 1 / QĐ 2)', () => {
  it('role=dialog panel, unnamed role=menu sections, separators next to a custom row at panel level', () => {
    const b = btn();
    const content = box();
    const h = TdMenu.open(b, [
      { label: 'Hồ sơ', id: 'profile' }, { separator: true }, { label: 'Cài đặt', icon: 'link' }, { separator: true },
      { type: 'custom', id: 'theme', label: 'Giao diện', render: () => content },
      { separator: true }, { label: 'Đăng xuất', danger: true },
    ]);
    const p = panel();
    expect(same(h.element, p)).to.equal(true);
    expect([...p.classList]).to.include.members(['td-menu', 'td-menu--panel', 'td-glass-surface', 'td-glass-surface--strong']);
    expect(p.getAttribute('role')).to.equal('dialog');
    expect(p.getAttribute('tabindex')).to.equal('-1');
    expect(p.hasAttribute('aria-modal')).to.equal(false);
    expect(p.getAttribute('aria-labelledby')).to.equal(b.id);
    const kids = [...p.children].map((c) => c.className.split(' ')[0] + (c.getAttribute('role') ? `:${c.getAttribute('role')}` : ''));
    expect(kids).to.deep.equal(['td-menu__section:menu', 'td-menu__separator:separator', 'td-menu__custom:group',
      'td-menu__separator:separator', 'td-menu__section:menu']);
    const [s1, , row, , s2] = p.children;
    expect(s1.hasAttribute('aria-label') || s1.hasAttribute('aria-labelledby')).to.equal(false);
    expect([...s1.children].map((c) => c.getAttribute('role'))).to.deep.equal(['menuitem', 'separator', 'menuitem']);
    expect(s1.querySelector('[data-item="profile"]').getAttribute('tabindex')).to.equal('-1');
    expect(s1.querySelector('.td-menu__icon svg[data-icon="link"]')).to.not.equal(null);
    expect(s2.querySelector('.td-menu__item--danger')).to.not.equal(null);
    expect(row.getAttribute('data-item')).to.equal('theme');
    const cap = row.querySelector('.td-menu__custom-label');
    expect(cap.textContent).to.equal('Giao diện');
    expect(row.getAttribute('aria-labelledby')).to.equal(cap.id);
    expect(cap.id).to.match(new RegExp(`^${p.id}-c\\d+-label$`));
    expect(same(row.lastElementChild, content)).to.equal(true);
    expect(b.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(b.getAttribute('aria-controls')).to.equal(p.id);
  });

  it('no label → a plain div row (no role, no caption); label is TEXT', () => {
    const b = btn();
    TdMenu.open(b, [{ label: 'A' }, { type: 'custom', render: () => box() },
      { type: 'custom', label: '<img src=x onerror=alert(1)>', render: () => box() }]);
    const rows = panel().querySelectorAll('.td-menu__custom');
    expect(rows[0].hasAttribute('role')).to.equal(false);
    expect(rows[0].querySelector('.td-menu__custom-label')).to.equal(null);
    expect(rows[1].querySelector('.td-menu__custom-label').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(panel().querySelector('img')).to.equal(null);
  });

  it('opts.label names the panel; the caller element is not cloned nor changed (no attribute / class / style added)', () => {
    const b = btn();
    const content = box();
    content.setAttribute('data-x', '1');
    const before = content.outerHTML;
    TdMenu.open(b, [{ type: 'custom', render: () => content }], { label: 'Tài khoản' });
    expect(panel().getAttribute('aria-label')).to.equal('Tài khoản');
    expect(content.outerHTML).to.equal(before);
    expect(same(panel().querySelector('.site-box'), content)).to.equal(true);
  });

  it('icon slots inside the caller content are never filled by the menu', () => {
    const b = btn();
    const content = box();
    const slot = document.createElement('span');
    slot.setAttribute('data-td-icon', 'link');
    content.appendChild(slot);
    TdMenu.open(b, [{ label: 'A', icon: 'link' }, { type: 'custom', render: () => content }]);
    expect(slot.childElementCount).to.equal(0);
    expect(panel().querySelector('.td-menu__item svg')).to.not.equal(null);
  });

  it('a menu holding only a static custom row focuses the panel', () => {
    const b = btn();
    TdMenu.open(b, [{ type: 'custom', render: () => box('Lan · lan@example.com') }]);
    expect(same(document.activeElement, panel())).to.equal(true);
  });
});

describe('v0.53 TdMenu custom — aria-haspopup (codex r1 #3)', () => {
  it('bind() advertises "menu" even for a static array with a custom item; "dialog" after an open built one', () => {
    const b = btn();
    const unbind = TdMenu.bind(b, [{ label: 'A' }, { type: 'custom', render: () => box() }]);
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    b.click();
    expect(b.getAttribute('aria-haspopup')).to.equal('dialog');
    TdMenu.close();
    expect(b.getAttribute('aria-haspopup')).to.equal('dialog');
    unbind();
    expect(b.hasAttribute('aria-haspopup')).to.equal(false);
  });

  it('a custom row hidden by when() / render → null / rejected keeps "menu"; a later plain open returns to "menu"', () => {
    const b = btn();
    let mode = 'hidden';
    const w = spyWarn();
    TdMenu.bind(b, () => [{ label: 'A' }, {
      type: 'custom', when: () => mode !== 'hidden',
      render: () => (mode === 'null' ? null : mode === 'string' ? '<b>x</b>' : box()),
    }]);
    for (const m of ['hidden', 'null', 'string']) {
      mode = m;
      b.click();
      expect(b.getAttribute('aria-haspopup'), m).to.equal('menu');
      expect(panel().getAttribute('role'), m).to.equal('menu');
      TdMenu.close();
    }
    mode = 'el';
    b.click();
    expect(b.getAttribute('aria-haspopup')).to.equal('dialog');
    TdMenu.close();
    mode = 'hidden';
    b.click();
    expect(b.getAttribute('aria-haspopup')).to.equal('menu');
    w.restore();
  });

  it('open() on an anchor with an author aria-haspopup leaves it alone', () => {
    const b = btn();
    b.setAttribute('aria-haspopup', 'true');
    TdMenu.open(b, [{ type: 'custom', render: () => box() }]);
    expect(b.getAttribute('aria-haspopup')).to.equal('true');
  });
});

describe('v0.53 TdMenu custom — render(ctx) (QĐ 6 / QĐ 8)', () => {
  it('called exactly once per open with a fresh ctx; close / signal win over opts.ctx keys; other hooks never see them', () => {
    const b = btn();
    b.dataset.tdMenuPostId = '7';
    const seen = [];
    const whenCtx = [];
    const item = { type: 'custom', render: (ctx) => { seen.push(ctx); return box(); } };
    const list = () => [{ label: 'A', when: (c) => { whenCtx.push(c); return true; } }, item];
    TdMenu.open(b, list, { ctx: { userId: 3, close: 'mine', signal: 'mine' } });
    TdMenu.close();
    TdMenu.open(b, list, { ctx: { userId: 3 } });
    expect(seen.length).to.equal(2);
    const c = seen[0];
    expect(same(c.anchor, b)).to.equal(true);
    expect(c.name).to.equal('');
    expect(same(c.item, item)).to.equal(true);
    expect(c.userId).to.equal(3);
    expect(c.postId).to.equal('7');
    expect(typeof c.close).to.equal('function');
    expect(c.signal instanceof AbortSignal).to.equal(true);
    expect(same(seen[0].signal, seen[1].signal)).to.equal(false);
    expect('menu' in c).to.equal(false);
    expect(whenCtx.every((x) => x.close === 'mine' || !('close' in x))).to.equal(true);
    expect(whenCtx.every((x) => !(x.signal instanceof AbortSignal))).to.equal(true);
  });

  it('works through the registry (define / register / order / when / group)', () => {
    const undo = [
      TdMenu.define('v053-acc', [{ label: 'Hồ sơ' }, { label: 'Đăng xuất', order: 2000 }]),
      TdMenu.register('v053-acc', { type: 'custom', id: 'theme', render: () => box() }, { group: 'ui', order: 500 }),
      TdMenu.register('v053-acc', { type: 'custom', id: 'never', when: () => false, render: () => box() }),
    ];
    const b = btn();
    TdMenu.open(b, 'v053-acc');
    const kids = [...panel().children].map((c) => c.getAttribute('data-item') || c.className.split(' ')[0]);
    expect(kids).to.deep.equal(['td-menu__section', 'td-menu__separator', 'theme', 'td-menu__separator', 'td-menu__section']);
    TdMenu.close();
    undo.forEach((f) => f());
  });

  it('caller items are never mutated (frozen item works)', () => {
    const b = btn();
    const item = Object.freeze({ type: 'custom', label: 'X', render: () => box() });
    expect(TdMenu.open(b, [item])).to.not.equal(null);
  });

  it('type "segmented" does not exist: an unknown type without label is dropped like any label-less item', () => {
    const b = btn();
    expect(TdMenu.open(b, [{ type: 'segmented', options: [] }])).to.equal(null);
  });
});

describe('v0.53 TdMenu custom — rejection paths (QĐ 7)', () => {
  const cases = [
    ['string', () => '<img src=x onerror="window.__xss=1">', 'TdMenu: custom item render() must return an Element — strings are not rendered (no HTML)'],
    ['number', () => 42, 'TdMenu: custom item render() must return an Element'],
    ['fragment', () => document.createRange().createContextualFragment('<b>x</b>'), 'TdMenu: custom item render() must return an Element'],
    ['text node', () => document.createTextNode('x'), 'TdMenu: custom item render() must return an Element'],
    ['promise', () => Promise.resolve(box()), 'TdMenu: custom item render() must return an Element'],
    ['connected element', () => host, 'TdMenu: custom item render() must return a detached Element'],
  ];
  for (const [name, render, msg] of cases) {
    it(`${name} → row dropped, fixed warning, signal aborted`, async () => {
      const b = btn();
      let sig = null;
      const w = spyWarn();
      const h = TdMenu.open(b, [{ label: 'A' }, { type: 'custom', render: (ctx) => { sig = ctx.signal; return render(); } }]);
      w.restore();
      expect(!!h).to.equal(true);
      expect(panel().getAttribute('role')).to.equal('menu');
      expect(panel().querySelector('.td-menu__custom')).to.equal(null);
      expect(w.calls.length).to.equal(1);
      expect(w.calls[0][0]).to.equal(msg);
      expect(sig.aborted).to.equal(true);
      expect(panel().querySelector('img')).to.equal(null);
      await new Promise((r) => setTimeout(r, 0));
      expect(window.__xss).to.equal(undefined);
      if (name === 'connected element') expect(same(host.parentElement, document.body)).to.equal(true);
    });
  }

  it('render throws → row dropped, fixed warning (+ the error), listeners added before the throw are cleaned', () => {
    const b = btn();
    const w = spyWarn();
    let fired = 0;
    const target = new EventTarget();
    TdMenu.open(b, [{ label: 'A' }, { type: 'custom', render: ({ signal }) => {
      target.addEventListener('ping', () => { fired += 1; }, { signal });
      throw new Error('boom');
    } }]);
    w.restore();
    expect(w.calls[0][0]).to.equal('TdMenu: custom item render() threw — row omitted');
    expect(w.calls[0][1] instanceof Error).to.equal(true);
    target.dispatchEvent(new Event('ping'));
    expect(fired).to.equal(0);
  });

  it('null → row dropped silently; a menu left with nothing → open() null, every signal aborted', () => {
    const b = btn();
    const w = spyWarn();
    const sigs = [];
    const h = TdMenu.open(b, [{ separator: true }, { type: 'custom', render: (c) => { sigs.push(c.signal); return null; } },
      { separator: true }, { type: 'custom', render: (c) => { sigs.push(c.signal); return 'x'; } }]);
    w.restore();
    expect(h).to.equal(null);
    expect(panel()).to.equal(null);
    expect(w.calls.length).to.equal(1); // the string only — null is silent
    expect(sigs.every((s) => s.aborted)).to.equal(true);
  });

  it('render without a function → row dropped with a fixed warning; separators collapse around dropped rows', () => {
    const b = btn();
    const w = spyWarn();
    TdMenu.open(b, [{ label: 'A' }, { separator: true }, { type: 'custom', render: '<b>' }, { separator: true },
      { type: 'custom', render: () => null }, { separator: true }, { label: 'B' }]);
    w.restore();
    expect(w.calls.map((c) => c[0])).to.deep.equal(['TdMenu: custom item needs a render(ctx) function — row omitted']);
    expect([...panel().children].map((c) => c.getAttribute('role'))).to.deep.equal(['menuitem', 'separator', 'menuitem']);
  });

  it('a detached element reused across opens (caller cache) works', () => {
    const b = btn();
    const content = box();
    TdMenu.open(b, [{ type: 'custom', render: () => content }]);
    TdMenu.close();
    expect(content.isConnected).to.equal(false);
    TdMenu.open(b, [{ type: 'custom', render: () => content }]);
    expect(same(panel().querySelector('.site-box'), content)).to.equal(true);
  });

  it('<template> recipe: importNode(tpl.content).firstElementChild', () => {
    host.insertAdjacentHTML('beforeend', '<template id="tpl-note"><form class="note"><input name="n" aria-label="Ghi chú"><button type="submit">Lưu</button></form></template>');
    const b = btn();
    TdMenu.open(b, [{ type: 'custom', render: () => document.importNode(document.getElementById('tpl-note').content, true).firstElementChild }]);
    expect(panel().querySelector('form.note input[name="n"]')).to.not.equal(null);
    expect(document.querySelectorAll('form.note').length).to.equal(1);
  });
});

describe('v0.53 TdMenu custom — lifecycle (QĐ 10)', () => {
  const reasons = {
    select: (ctxs) => ctxs[0].close(),
    escape: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    outside: () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })),
    api: () => TdMenu.close(),
    covered: () => TdModal.show({ title: 'Đè', body: document.createElement('p'), showFooter: false }),
  };
  for (const [reason, run] of Object.entries(reasons)) {
    it(`signal aborts on '${reason}' while the element is still in the DOM, before onClose`, () => {
      const b = btn();
      const ctxs = [];
      const log = [];
      let el = null;
      TdMenu.open(b, [{ label: 'A' }, { type: 'custom', render: (c) => {
        ctxs.push(c);
        el = box();
        c.signal.addEventListener('abort', () => log.push(`abort:${el.isConnected}`));
        return el;
      } }], { onClose: (r) => log.push(`close:${r}`) });
      run(ctxs);
      expect(log).to.deep.equal(['abort:true', `close:${reason}`]);
      expect(el.isConnected).to.equal(false);
    });
  }

  it("'hidden' (anchor removed) and a new menu on another anchor abort too", async () => {
    const b1 = btn('1');
    const b2 = btn('2');
    const sigs = [];
    const list = [{ type: 'custom', render: (c) => { sigs.push(c.signal); return box(); } }];
    TdMenu.open(b1, list);
    TdMenu.open(b2, list);
    expect(sigs[0].aborted).to.equal(true);
    b2.remove();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(sigs[1].aborted).to.equal(true);
    expect(TdMenu.isOpen()).to.equal(false);
  });

  it('ctx.close(): reason select, focus back on the trigger; a second call / a call after closing is a no-op', () => {
    const b = btn();
    let ctx;
    const reasons = [];
    TdMenu.open(b, [{ type: 'custom', render: (c) => { ctx = c; const x = document.createElement('button'); x.textContent = 'x'; return x; } }],
      { onClose: (r) => reasons.push(r) });
    ctx.close();
    ctx.close();
    expect(reasons).to.deep.equal(['select']);
    expect(same(document.activeElement, b)).to.equal(true);
    TdMenu.open(b, [{ label: 'A' }]);
    ctx.close(); // stale ctx must not close the newer menu
    expect(TdMenu.isOpen(b)).to.equal(true);
  });

  it('close() called inside render (before the menu exists) is a no-op', () => {
    const b = btn();
    const h = TdMenu.open(b, [{ type: 'custom', render: (c) => { c.close(); return box(); } }]);
    expect(h.isOpen).to.equal(true);
  });

  it('50 open / close cycles: listeners registered with { signal } never fire after their menu closed', () => {
    const b = btn();
    const bus = new EventTarget();
    let fired = 0;
    for (let i = 0; i < 50; i++) {
      TdMenu.open(b, [{ type: 'custom', render: ({ signal }) => {
        bus.addEventListener('theme', () => { fired += 1; }, { signal });
        return box();
      } }]);
      TdMenu.close();
    }
    bus.dispatchEvent(new Event('theme'));
    expect(fired).to.equal(0);
    TdMenu.open(b, [{ type: 'custom', render: ({ signal }) => {
      bus.addEventListener('theme', () => { fired += 1; }, { signal });
      return box();
    } }]);
    bus.dispatchEvent(new Event('theme'));
    expect(fired).to.equal(1);
  });
});
