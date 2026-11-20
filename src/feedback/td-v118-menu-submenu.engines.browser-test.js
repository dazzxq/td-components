import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport } from '@web/test-runner-commands';
import { TdMenu } from './td-menu.js';
import { TdModal } from './td-modal.js';

// v0.118.0 (plan docs/internal/plans/v0.118.0-menu-submenu.md, ADR 0046): nested submenu, exactly one level — API,
// flyout geometry, hover intent + safe triangle, keyboard, closing, layers, reposition, drill-down (QĐ 1–9, R1–R4, D1).
// Chromium, Firefox, WebKit with real keys and a real mouse. `(hover: none)` cannot be emulated here, so drill-down is
// reached through the narrow rule (< 480px).

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, max = 90) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await frames(1);
  }
  return fn();
}
const root = () => document.querySelector('body > .td-menu:not(.td-menu--sub)');
const sub = () => document.querySelector('body > .td-menu--sub');
const rowIn = (m, text) => [...m.querySelectorAll('.td-menu__item')]
  .find((n) => n.querySelector('.td-menu__label')?.textContent === text);
const row = (text) => rowIn(root(), text);
const subRow = (text) => rowIn(sub(), text);
const activeText = () => {
  const a = document.activeElement;
  if (!a || a === document.body) return '∅';
  return a.querySelector?.('.td-menu__label')?.textContent || a.id || a.localName;
};
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const move = (x, y) => sendMouse({ type: 'move', position: [Math.round(x), Math.round(y)] });
const moveTo = (n) => sendMouse({ type: 'move', position: center(n) });
const click = (n) => sendMouse({ type: 'click', position: center(n) });
const press = (key) => sendKeys({ press: key });
const rect = (n) => n.getBoundingClientRect();
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

function mountTrigger(left = 40, top = 40) {
  host.innerHTML = '<input id="before" aria-label="trước"><button type="button" id="trig">Thao tác</button>'
    + '<input id="after" aria-label="sau">';
  const t = host.querySelector('#trig');
  t.style.setProperty('position', 'fixed');
  t.style.setProperty('left', `${left}px`);
  t.style.setProperty('top', `${top}px`);
  return t;
}

const ALBUMS = ['Album A', 'Album B', 'Album C'];
function tree(log = [], extra = {}) {
  return [
    { label: 'Sửa', onSelect: () => log.push('edit') },
    {
      label: 'Chuyển sang', id: 'move', icon: 'link', items: [
        { label: 'Album A', id: 'a', onSelect: (ctx) => log.push(['A', ctx]) },
        { label: 'Album B', hint: '12 ảnh', onSelect: () => log.push('B') },
        { label: 'Album C', danger: true, onSelect: () => log.push('C') },
        ...(extra.children || []),
      ],
    },
    { label: 'Sao chép', onSelect: () => log.push('copy') },
    { label: 'Khoá', disabled: true, items: [{ label: 'Không' }] },
    { label: 'Chia sẻ', items: [{ label: 'Liên kết', onSelect: () => log.push('link') }, { label: 'Email' }] },
    { label: 'Xoá', danger: true, onSelect: () => log.push('del') },
  ];
}

function openTree(opts = {}, log = [], extra = {}) {
  const t = mountTrigger(opts.left ?? 40, opts.top ?? 40);
  t.focus();
  const reasons = [];
  const { left, top, ...rest } = opts;
  const h = TdMenu.open(t, extra.items || tree(log, extra), { align: 'start', onClose: (r) => reasons.push(r), ...rest });
  return { t, h, reasons, log };
}

/** Hover-open "Chuyển sang" and wait for the child. */
async function hoverOpen(text = 'Chuyển sang') {
  await moveTo(row(text));
  await until(() => !!sub() && row(text).getAttribute('aria-expanded') === 'true');
}

let warns = [];
const origWarn = console.warn;
beforeEach(async () => {
  await setViewport({ width: 1000, height: 700 });
  warns = [];
  console.warn = (...a) => { warns.push(String(a[0])); };
});

afterEach(async () => {
  console.warn = origWarn;
  TdMenu.close();
  TdModal.closeAll?.();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
  await resetMouse();
  await frames(1);
});

after(async () => {
  await setViewport({ width: 800, height: 600 });
});

describe('v0.118 submenu — API and markup (QĐ 1, QĐ 2)', () => {
  it('parent row: menuitem + aria-haspopup / aria-expanded, chevron after the icon, label id; aria-controls while open', async () => {
    openTree();
    const m = root();
    const p = row('Chuyển sang');
    expect(p.localName).to.equal('button');
    expect(p.getAttribute('role')).to.equal('menuitem');
    expect(p.classList.contains('td-menu__item--parent')).to.equal(true);
    expect(p.getAttribute('aria-haspopup')).to.equal('menu');
    expect(p.getAttribute('aria-expanded')).to.equal('false');
    expect(p.hasAttribute('aria-controls')).to.equal(false);
    expect([...p.children].map((c) => c.className)).to.deep.equal(['td-menu__label', 'td-menu__icon', 'td-menu__chevron']);
    const chev = p.querySelector('.td-menu__chevron');
    expect(chev.getAttribute('data-td-icon')).to.equal('next');
    expect(chev.getAttribute('aria-hidden')).to.equal('true');
    expect(!!chev.querySelector('svg')).to.equal(true);
    expect(p.querySelector('.td-menu__label').id).to.equal(`${m.id}-label-1`);
    // plain rows unchanged
    expect(row('Sửa').hasAttribute('aria-haspopup')).to.equal(false);
    expect(row('Sửa').querySelector('.td-menu__label').id).to.equal('');
    await click(p);
    const s = sub();
    expect(s.id).to.equal(`${m.id}-sub`);
    expect(s.getAttribute('role')).to.equal('menu');
    expect(s.classList.contains('td-glass-surface--strong')).to.equal(true);
    expect(s.getAttribute('aria-labelledby')).to.equal(`${m.id}-label-1`);
    expect(p.getAttribute('aria-expanded')).to.equal('true');
    expect(p.getAttribute('aria-controls')).to.equal(s.id);
    const b = subRow('Album B');
    expect(b.querySelector('.td-menu__label').id).to.equal(`${m.id}-sub-label-1`);
    expect(b.getAttribute('aria-describedby')).to.equal(`${m.id}-sub-hint-1`);
    expect(subRow('Album C').classList.contains('td-menu__item--danger')).to.equal(true);
    expect(s.parentElement).to.equal(document.body);
  });

  it('a parent ignores onSelect / href / type / checked with ONE warning and never acts', async () => {
    const log = [];
    const t = mountTrigger();
    TdMenu.open(t, [{
      label: 'Cha', onSelect: () => log.push('parent'), href: 'https://example.com/', type: 'checkbox', checked: true,
      items: [{ label: 'Con' }],
    }]);
    expect(warns.filter((w) => w.includes('submenu parent')).length).to.equal(1);
    const p = row('Cha');
    expect(p.localName).to.equal('button');
    expect(p.getAttribute('role')).to.equal('menuitem');
    expect(p.hasAttribute('aria-checked')).to.equal(false);
    await click(p);
    expect(log).to.deep.equal([]);
    expect(TdMenu.isOpen()).to.equal(true);
    expect(!!sub()).to.equal(true);
  });

  it('empty / all-hidden children omit the parent; separators around it collapse', () => {
    const t = mountTrigger();
    TdMenu.open(t, [
      { label: 'A' }, { separator: true }, { label: 'Rỗng', items: [] }, { separator: true },
      { label: 'Ẩn', items: [{ label: 'x', when: () => false }, { label: '' }] }, { separator: true }, { label: 'B' },
    ]);
    const m = root();
    expect(m.querySelectorAll('.td-menu__item').length).to.equal(2);
    expect(m.querySelectorAll('.td-menu__separator').length).to.equal(1);
    expect(!!m.querySelector('.td-menu__item--parent')).to.equal(false);
  });

  it('children are filtered by when(ctx) with the menu ctx', async () => {
    const t = mountTrigger();
    TdMenu.open(t, [{ label: 'Cha', items: [{ label: 'Có', when: (c) => c.role === 'admin' }, { label: 'Không', when: (c) => c.role !== 'admin' }] }],
      { ctx: { role: 'admin' } });
    await click(row('Cha'));
    expect([...sub().querySelectorAll('.td-menu__label')].map((n) => n.textContent)).to.deep.equal(['Có']);
  });

  it('depth 2: a child with items warns once and stays a normal item', async () => {
    const t = mountTrigger();
    const log = [];
    TdMenu.open(t, [{ label: 'Cha', items: [{ label: 'Cháu', items: [{ label: 'Sâu' }], onSelect: () => log.push('x') }] }]);
    expect(warns.filter((w) => w.includes('only one submenu level')).length).to.equal(1);
    await click(row('Cha'));
    const c = subRow('Cháu');
    expect(c.hasAttribute('aria-haspopup')).to.equal(false);
    expect(!!c.querySelector('.td-menu__chevron')).to.equal(false);
    await click(c);
    expect(log).to.deep.equal(['x']);
    expect(TdMenu.isOpen()).to.equal(false);
  });

  it('a custom child is dropped with a warning; the child is a plain role="menu"', async () => {
    const t = mountTrigger();
    TdMenu.open(t, [{ label: 'Cha', items: [{ type: 'custom', render: () => document.createElement('div') }, { label: 'Con' }] }]);
    expect(warns.some((w) => w.includes('not supported in a submenu'))).to.equal(true);
    await click(row('Cha'));
    expect(sub().getAttribute('role')).to.equal('menu');
    expect(sub().querySelectorAll('.td-menu__item').length).to.equal(1);
    expect(!!sub().querySelector('.td-menu__custom')).to.equal(false);
  });

  it('custom + items stays a custom row (warned, no parent markup)', () => {
    const t = mountTrigger();
    TdMenu.open(t, [{ label: 'Một' }, { type: 'custom', id: 'c', items: [{ label: 'x' }], render: () => { const d = document.createElement('div'); d.textContent = 'tĩnh'; return d; } }]);
    expect(warns.some((w) => w.includes('custom item cannot open a submenu'))).to.equal(true);
    expect(!!root().querySelector('.td-menu__custom[data-item="c"]')).to.equal(true);
    expect(!!root().querySelector('.td-menu__item--parent')).to.equal(false);
  });

  it('registry: a registered item may be a parent', async () => {
    const off = TdMenu.define('v118-album', [{ label: 'Sửa' }]);
    const off2 = TdMenu.register('v118-album', { label: 'Chuyển sang', items: [{ label: 'Album A' }] }, { group: 'move' });
    try {
      const t = mountTrigger();
      TdMenu.open(t, 'v118-album');
      expect(root().querySelectorAll('.td-menu__separator').length).to.equal(1);
      await click(row('Chuyển sang'));
      expect(!!subRow('Album A')).to.equal(true);
    } finally { off2(); off(); }
  });

  it('a menu without parents: markup, ids, focus and listeners as in 0.117.0 (snapshot)', () => {
    const t = mountTrigger();
    t.focus();
    TdMenu.open(t, [{ label: 'Sửa', icon: 'plus', hint: 'E' }, { separator: true }, { label: 'Ghim', type: 'checkbox' },
      { label: 'Xoá', danger: true, disabled: true }]);
    const m = root();
    const id = m.id;
    const html = m.outerHTML.replace(new RegExp(id, 'g'), 'M').replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>')
      .replace(/ style="[^"]*"/g, '');
    expect(html).to.equal(V117_SNAPSHOT);
    expect(document.activeElement).to.equal(row('Sửa'));
    expect(m.hasAttribute('data-sub')).to.equal(false);
    expect(document.querySelectorAll('body > .td-menu').length).to.equal(1);
  });
});

// outerHTML of the snapshot menu as rendered by 0.117.0 (id → M, svg bodies collapsed)
const V117_SNAPSHOT = '<div class="td-menu td-glass-surface td-glass-surface--strong" id="M" role="menu" data-state="open" data-align="end" aria-labelledby="trig" data-placement="bottom"><button class="td-menu__item" type="button" role="menuitem" tabindex="-1" aria-labelledby="M-label-0" aria-describedby="M-hint-0"><span class="td-menu__label" id="M-label-0">Sửa</span><span class="td-menu__icon" data-td-icon="plus" aria-hidden="true"><svg/></span><span class="td-menu__hint td-menu__hint--kbd" id="M-hint-0">E</span></button><div class="td-menu__separator" role="separator"></div><button class="td-menu__item" type="button" role="menuitemcheckbox" tabindex="-1" aria-checked="false"><span class="td-menu__label">Ghim</span><span class="td-check td-check--sm td-menu__check" aria-hidden="true"><svg/></span></button><button class="td-menu__item td-menu__item--danger" type="button" role="menuitem" tabindex="-1" aria-disabled="true"><span class="td-menu__label">Xoá</span></button></div>';

describe('v0.118 submenu — flyout geometry (QĐ 3)', () => {
  it('inline-end: abuts the root, first child row level with the parent row, data-placement="end"', async () => {
    openTree();
    await click(row('Chuyển sang'));
    await frames(2);
    const s = sub();
    expect(s.getAttribute('data-placement')).to.equal('end');
    expect(near(rect(s).left, rect(root()).right)).to.equal(true);
    expect(near(rect(subRow('Album A')).top, rect(row('Chuyển sang')).top)).to.equal(true);
  });

  it('flips to the start side near the right edge', async () => {
    openTree({ left: 760, align: 'start' });
    await click(row('Chuyển sang'));
    await frames(2);
    const s = sub();
    expect(s.getAttribute('data-placement')).to.equal('start');
    expect(near(rect(s).right, rect(root()).left)).to.equal(true);
  });

  it('neither side fits (narrow window above 480px): inside the viewport with the 8px margin', async () => {
    await setViewport({ width: 520, height: 700 });
    openTree({ left: 200, align: 'center' });
    await click(row('Chuyển sang'));
    await frames(2);
    const s = sub();
    expect(['end', 'start']).to.include(s.getAttribute('data-placement'));
    expect(rect(s).left).to.be.at.least(8 - 0.5);
    expect(rect(s).right).to.be.at.most(520 - 8 + 0.5);
  });

  it('bottom shift: a parent near the bottom edge shifts the child up to fit', async () => {
    await setViewport({ width: 1000, height: 420 });
    const many = Array.from({ length: 6 }, (_, i) => ({ label: `Con ${i + 1}` }));
    openTree({ top: 360 }, [], { items: [{ label: 'Một' }, { label: 'Hai' }, { label: 'Ba' }, { label: 'Cha', items: many }] });
    await click(row('Cha'));
    await frames(2);
    const s = sub();
    expect(rect(s).bottom).to.be.at.most(420 - 8 + 0.5);
    expect(rect(s).top).to.be.below(rect(row('Cha')).top - 2);
    expect(rect(s).top).to.be.at.least(8 - 0.5);
  });

  it('max-height = min(448, viewport − 16) and the child scrolls', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Album ${i + 1}` }));
    openTree({}, [], { items: [{ label: 'Cha', items: many }] });
    await click(row('Cha'));
    await frames(2);
    const s = sub();
    expect(s.style.getPropertyValue('max-height')).to.equal('448px');
    expect(s.scrollHeight).to.be.above(s.clientHeight);
    expect(rect(s).bottom).to.be.at.most(700 - 8 + 0.5);
  });
});

describe('v0.118 submenu — hover intent + safe triangle (QĐ 4)', () => {
  it('opens after ~120ms, not before 80ms; hover never moves focus', async () => {
    openTree();
    const before = document.activeElement;
    await moveTo(row('Chuyển sang'));
    const t0 = performance.now();
    await sleep(50);
    if (performance.now() - t0 < 80) expect(!!sub()).to.equal(false);
    await until(() => !!sub());
    expect(!!sub()).to.equal(true);
    expect(document.activeElement).to.equal(before);
  });

  it('passing over the parent row does not open it', async () => {
    openTree();
    await moveTo(row('Chuyển sang'));
    await moveTo(row('Sửa'));
    await sleep(300);
    expect(!!sub()).to.equal(false);
  });

  it('a diagonal move across a sibling inside the triangle keeps the child', async () => {
    openTree();
    await hoverOpen();
    const r = rect(root());
    const sib = rect(row('Sao chép'));
    await move(r.right - 30, sib.top + sib.height / 2);
    await move(r.right - 10, sib.top + sib.height / 2 + 2);
    await sleep(180); // longer than the 120ms intent: only the triangle's grace keeps the child
    expect(!!sub()).to.equal(true);
    expect(row('Chuyển sang').getAttribute('aria-expanded')).to.equal('true');
    await moveTo(subRow('Album B'));
    await sleep(500);
    expect(!!sub()).to.equal(true);
    expect(row('Chuyển sang').getAttribute('aria-expanded')).to.equal('true');
  });

  it('a straight move to a sibling closes the child after the grace + intent', async () => {
    openTree();
    await hoverOpen();
    await moveTo(row('Sao chép'));
    await sleep(150);
    expect(!!sub()).to.equal(true); // still in the grace
    await until(() => !sub(), 120);
    expect(!!sub()).to.equal(false);
    expect(row('Chuyển sang').getAttribute('aria-expanded')).to.equal('false');
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('leaving both panels to empty space keeps the child open', async () => {
    openTree();
    await hoverOpen();
    await move(900, 650);
    await sleep(600);
    expect(!!sub()).to.equal(true);
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('hovering another parent switches the child', async () => {
    openTree();
    await hoverOpen();
    await moveTo(row('Chia sẻ'));
    await until(() => row('Chia sẻ').getAttribute('aria-expanded') === 'true', 150);
    expect(row('Chuyển sang').getAttribute('aria-expanded')).to.equal('false');
    expect(!!subRow('Liên kết')).to.equal(true);
    expect(document.querySelectorAll('body > .td-menu--sub').length).to.equal(1);
  });

  it('a disabled parent never opens (hover, click, ArrowRight); greyed via aria-disabled', async () => {
    openTree();
    const k = row('Khoá');
    expect(k.getAttribute('aria-disabled')).to.equal('true');
    await moveTo(k);
    await sleep(300);
    expect(!!sub()).to.equal(false);
    await click(k);
    expect(!!sub()).to.equal(false);
    k.focus();
    await press('ArrowRight');
    expect(!!sub()).to.equal(false);
    expect(TdMenu.isOpen()).to.equal(true);
  });
});

describe('v0.118 submenu — click (QĐ 7)', () => {
  it('click on the parent opens at once, keeps the tree, focuses the first child; a click on an open parent keeps it', async () => {
    const { reasons } = openTree();
    await click(row('Chuyển sang'));
    expect(!!sub()).to.equal(true);
    expect(activeText()).to.equal('Album A');
    expect(TdMenu.isOpen()).to.equal(true);
    const s = sub();
    await click(row('Chuyển sang'));
    expect(sub()).to.equal(s);
    expect(reasons).to.deep.equal([]);
  });

  it('a hover-opened child: clicking the parent focuses its first child', async () => {
    openTree();
    await hoverOpen();
    await click(row('Chuyển sang'));
    expect(activeText()).to.equal('Album A');
  });
});

describe('v0.118 submenu — keyboard (QĐ 6)', () => {
  it('ArrowRight / Enter / Space open + focus the first child; ArrowLeft / Escape close + focus the parent', async () => {
    const { reasons } = openTree();
    await press('ArrowDown');
    expect(activeText()).to.equal('Chuyển sang');
    for (const key of ['ArrowRight', 'Enter', ' ']) {
      await press(key);
      expect(!!sub(), key).to.equal(true);
      expect(activeText(), key).to.equal('Album A');
      await press(key === 'Enter' ? 'Escape' : 'ArrowLeft');
      expect(!!sub(), key).to.equal(false);
      expect(activeText(), key).to.equal('Chuyển sang');
    }
    expect(TdMenu.isOpen()).to.equal(true);
    expect(reasons).to.deep.equal([]);
  });

  it('native parity: keyboard focus moving to another root row closes a hover-opened flyout', async () => {
    openTree();
    await press('ArrowDown'); // focus on "Chuyển sang"
    await hoverOpen();
    expect(!!sub()).to.equal(true);
    await press('ArrowDown'); // focus to the next root row
    await until(() => !sub());
    expect(!!sub()).to.equal(false);
    expect(row('Chuyển sang').getAttribute('aria-expanded')).to.equal('false');
    expect(TdMenu.isOpen()).to.equal(true);
    expect(activeText()).to.not.equal('Chuyển sang');
  });

  it('ctx.setDisabled on the open parent (a root checkbox clicked while the flyout is open) closes the child', async () => {
    const items = [
      { type: 'checkbox', label: 'Khoá di chuyển', checked: false, onSelect: (ctx) => ctx.setDisabled('move', true) },
      { label: 'Chuyển sang', id: 'move', items: [{ label: 'Album A', onSelect() {} }, { label: 'Album B', onSelect() {} }] },
    ];
    openTree({}, [], { items });
    await hoverOpen();
    expect(!!sub()).to.equal(true);
    await click(row('Khoá di chuyển'));
    await until(() => !sub());
    expect(!!sub()).to.equal(false);
    expect(row('Chuyển sang').getAttribute('aria-disabled')).to.equal('true');
  });

  it('Escape twice: the first closes the child, the second the whole menu + focuses the trigger', async () => {
    const { reasons } = openTree();
    await press('ArrowDown');
    await press('ArrowRight');
    await press('Escape');
    expect(TdMenu.isOpen()).to.equal(true);
    expect(activeText()).to.equal('Chuyển sang');
    await press('Escape');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['escape']);
    expect(document.activeElement.id).to.equal('trig');
    expect(!!sub()).to.equal(false);
  });

  it('in the child: ArrowDown / ArrowUp wrap, Home / End, type-ahead; ArrowRight does nothing', async () => {
    openTree();
    await press('ArrowDown');
    await press('ArrowRight');
    await press('ArrowUp');
    expect(activeText()).to.equal('Album C');
    await press('ArrowDown');
    expect(activeText()).to.equal('Album A');
    await press('End');
    expect(activeText()).to.equal('Album C');
    await press('Home');
    expect(activeText()).to.equal('Album A');
    await sleep(550);
    await press('a'); // the next "a…" after the current row, in the child list only
    expect(activeText()).to.equal('Album B');
    await sleep(550);
    await press('s'); // "Sửa" / "Sao chép" live in the root: not matched
    expect(activeText()).to.equal('Album B');
    await press('ArrowRight');
    expect(activeText()).to.equal('Album B');
    expect(!!sub()).to.equal(true);
  });

  it('ArrowLeft / ArrowRight on plain root rows do nothing', async () => {
    openTree();
    await press('ArrowLeft');
    await press('ArrowRight');
    expect(activeText()).to.equal('Sửa');
    expect(!!sub()).to.equal(false);
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('Tab from the child closes the whole tree; focus continues after the trigger (D4)', async () => {
    const { reasons } = openTree();
    await press('ArrowDown');
    await press('Enter');
    await press('Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['tab']);
    expect(document.activeElement.id).to.equal('after');
    expect(!!sub()).to.equal(false);
  });

  it('R3: root panel with a custom row + a parent: Tab from the child closes everything', async () => {
    const t = mountTrigger();
    t.focus();
    const reasons = [];
    TdMenu.open(t, [
      { label: 'Cha', items: [{ label: 'Con 1' }, { label: 'Con 2' }] },
      { type: 'custom', render: () => { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Nút'; return b; } },
    ], { onClose: (r) => reasons.push(r) });
    expect(root().getAttribute('role')).to.equal('dialog');
    expect(activeText()).to.equal('Cha');
    await press('ArrowRight');
    expect(activeText()).to.equal('Con 1');
    await press('Tab');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['tab']);
    expect(document.activeElement.id).to.equal('after');
  });

  it('R3: in the root panel Tab still walks to the custom row (v0.53 behaviour)', async () => {
    const t = mountTrigger();
    t.focus();
    TdMenu.open(t, [
      { label: 'Cha', items: [{ label: 'Con 1' }] },
      { type: 'custom', render: () => { const b = document.createElement('button'); b.type = 'button'; b.id = 'cbtn'; b.textContent = 'Nút'; return b; } },
    ]);
    await press('Tab');
    expect(document.activeElement.id).to.equal('cbtn');
    expect(TdMenu.isOpen()).to.equal(true);
  });
});

describe('v0.118 submenu — picking and closing (QĐ 7, QĐ 8, R1)', () => {
  it('click on a child: onClose("select"), the trigger focused, then onSelect with the root ctx shape (no parent field)', async () => {
    const order = [];
    const log = [];
    const t = mountTrigger();
    t.focus();
    TdMenu.open(t, tree(log), { ctx: { albumId: 7 }, onClose: (r) => order.push(`close:${r}`) });
    await click(row('Chuyển sang'));
    await click(subRow('Album A'));
    expect(order).to.deep.equal(['close:select']);
    expect(log.length).to.equal(1);
    const [name, ctx] = log[0];
    expect(name).to.equal('A');
    expect(ctx.item.id).to.equal('a');
    expect(ctx.anchor).to.equal(t);
    expect(ctx.albumId).to.equal(7);
    expect(ctx.checked).to.equal(false);
    expect('parent' in ctx).to.equal(false);
    expect(document.activeElement).to.equal(t);
    expect(!!sub()).to.equal(false);
    expect(!!root()).to.equal(false);
  });

  it('Enter on an ordinary child selects it', async () => {
    const { reasons, log } = openTree();
    await press('ArrowDown');
    await press('ArrowRight');
    await press('ArrowDown');
    await press('Enter');
    expect(log).to.deep.equal(['B']);
    expect(reasons).to.deep.equal(['select']);
  });

  it('a link child (href through the URL policy): click and Enter close with "select"', async () => {
    for (const how of ['click', 'Enter']) {
      const log = [];
      const { reasons } = openTree({}, log, { items: [{ label: 'Cha', items: [{ label: 'Mở', href: '#v118-link', onSelect: () => log.push('link') }, { label: 'Xấu', href: 'javascript:alert(1)' }] }] });
      await click(row('Cha'));
      const a = subRow('Mở');
      expect(a.localName).to.equal('a');
      expect(a.getAttribute('href')).to.equal('#v118-link');
      expect(subRow('Xấu').localName).to.equal('button');
      expect(subRow('Xấu').getAttribute('aria-disabled')).to.equal('true');
      if (how === 'click') await click(a);
      else await press('Enter');
      await until(() => reasons.length > 0);
      expect(reasons, how).to.deep.equal(['select']);
      expect(log, how).to.deep.equal(['link']);
      history.replaceState(null, '', location.pathname + location.search);
    }
  });

  it('a checkbox child toggles in place and keeps the tree open', async () => {
    const log = [];
    openTree({}, log, { items: [{ label: 'Cha', items: [{ label: 'Ghim', type: 'checkbox', onSelect: (c) => log.push(c.checked) }] }] });
    await click(row('Cha'));
    const c = subRow('Ghim');
    expect(c.getAttribute('role')).to.equal('menuitemcheckbox');
    await click(c);
    expect(c.getAttribute('aria-checked')).to.equal('true');
    expect(log).to.deep.equal([true]);
    expect(!!sub()).to.equal(true);
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('a radio group is scoped to the child list', async () => {
    const log = [];
    openTree({}, log, { items: [
      { label: 'Gốc', type: 'radio', group: 'g', checked: true },
      { label: 'Cha', items: [{ label: 'C1', type: 'radio', group: 'g' }, { label: 'C2', type: 'radio', group: 'g', checked: true }] },
    ] });
    const rootRadio = row('Gốc');
    await click(row('Cha'));
    const c1 = subRow('C1');
    const c2 = subRow('C2');
    await click(c1);
    expect(c1.getAttribute('aria-checked')).to.equal('true');
    expect(c2.getAttribute('aria-checked')).to.equal('false');
    expect(rootRadio.getAttribute('aria-checked')).to.equal('true');
  });

  it('R1: the child listeners are gone once it closes', async () => {
    const { log } = openTree();
    await click(row('Chuyển sang'));
    const s = sub();
    const a = subRow('Album A');
    await press('Escape');
    expect(s.isConnected).to.equal(false);
    document.body.appendChild(s); // re-attached by hand: a stale element must be inert
    a.click();
    a.focus();
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    s.remove();
    expect(log).to.deep.equal([]);
    expect(TdMenu.isOpen()).to.equal(true);
  });

  it('outside press closes all levels ("outside"); a press inside the child is inside', async () => {
    const { reasons } = openTree({}, [], { items: [{ label: 'Cha', items: [{ label: 'Khoá', disabled: true }, { label: 'Mở' }] }] });
    await click(row('Cha'));
    await click(subRow('Khoá'));
    expect(TdMenu.isOpen()).to.equal(true);
    expect(!!sub()).to.equal(true);
    await sendMouse({ type: 'click', position: [950, 650] });
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['outside']);
    expect(!!sub()).to.equal(false);
  });

  it('a click on a plain root sibling while a child is open activates it', async () => {
    const { reasons, log } = openTree();
    await click(row('Chuyển sang'));
    await click(row('Sao chép'));
    expect(log).to.deep.equal(['copy']);
    expect(reasons).to.deep.equal(['select']);
    expect(!!sub()).to.equal(false);
  });

  it('trigger re-click closes all levels ("api")', async () => {
    const t = mountTrigger();
    const reasons = [];
    const unbind = TdMenu.bind(t, tree(), { align: 'start', onClose: (r) => reasons.push(r) });
    try {
      await click(t);
      await click(row('Chuyển sang'));
      expect(!!sub()).to.equal(true);
      await click(t);
      expect(TdMenu.isOpen()).to.equal(false);
      expect(reasons).to.deep.equal(['api']);
      expect(!!sub()).to.equal(false);
    } finally { unbind(); }
  });

  it('trigger removed → "hidden", the child goes with the root', async () => {
    const { t, reasons } = openTree();
    await click(row('Chuyển sang'));
    t.remove();
    await until(() => !TdMenu.isOpen());
    expect(reasons).to.deep.equal(['hidden']);
    expect(!!sub()).to.equal(false);
    expect(!!root()).to.equal(false);
  });

  it('a covering modal → "covered", the child goes with the root', async () => {
    const { reasons } = openTree();
    await click(row('Chuyển sang'));
    TdModal.show({ title: 'Che', body: document.createElement('div'), showFooter: false });
    await until(() => !TdMenu.isOpen());
    expect(reasons).to.deep.equal(['covered']);
    expect(!!sub()).to.equal(false);
  });

  it('TdMenu.close() and the handle close the tree', async () => {
    const { h, reasons } = openTree();
    await click(row('Chuyển sang'));
    h.close();
    expect(reasons).to.deep.equal(['api']);
    expect(!!sub()).to.equal(false);
    expect(h.isOpen).to.equal(false);
  });
});

describe('v0.118 submenu — layers (QĐ 2)', () => {
  it('in a TdModal: the child is not inert, Escape closes one level at a time, focus never on <body>', async () => {
    const body = document.createElement('div');
    body.innerHTML = '<button type="button" id="mm-trig">Mở</button>';
    TdModal.show({ title: 'Hộp thoại', body, showFooter: false });
    await until(() => document.querySelector('.td-modal')?.getAttribute('data-state') === 'open');
    const t = document.getElementById('mm-trig');
    t.focus();
    const reasons = [];
    TdMenu.open(t, tree(), { onClose: (r) => reasons.push(r) });
    await press('ArrowDown');
    await press('ArrowRight');
    const s = sub();
    expect(s.inert).to.equal(false);
    expect(s.closest('[inert]')).to.equal(null);
    expect(activeText()).to.equal('Album A');
    await click(subRow('Album B')); // a real pointer press reaches the child
    expect(reasons).to.deep.equal(['select']);
    expect(document.activeElement).to.equal(t);
    TdMenu.open(t, tree(), { onClose: (r) => reasons.push(r) });
    await press('ArrowDown');
    await press('ArrowRight');
    await press('Escape');
    expect(document.activeElement).not.to.equal(document.body);
    expect(activeText()).to.equal('Chuyển sang');
    await press('Escape');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(document.activeElement).to.equal(t);
    expect(!!document.querySelector('.td-modal[data-state="open"]')).to.equal(true);
  });
});

describe('v0.118 submenu — reposition (QĐ 3)', () => {
  it('window resize repositions both panels', async () => {
    openTree({ left: 500 });
    await click(row('Chuyển sang'));
    await frames(2);
    expect(sub().getAttribute('data-placement')).to.equal('end');
    await setViewport({ width: 760, height: 700 });
    await until(() => sub()?.getAttribute('data-placement') === 'start');
    expect(near(rect(sub()).right, rect(root()).left)).to.equal(true);
    expect(near(rect(subRow('Album A')).top, rect(row('Chuyển sang')).top)).to.equal(true);
  });

  it('page scroll repositions the child with the root', async () => {
    host.style.setProperty('height', '2000px');
    try {
      const t = mountTrigger(40, 40);
      t.style.setProperty('position', 'absolute');
      t.style.setProperty('top', '300px');
      window.scrollTo(0, 0);
      TdMenu.open(t, tree(), { align: 'start' });
      await click(row('Chuyển sang'));
      await frames(2);
      window.scrollTo(0, 60);
      await frames(4);
      expect(near(rect(subRow('Album A')).top, rect(row('Chuyển sang')).top)).to.equal(true);
      expect(near(rect(sub()).left, rect(root()).right)).to.equal(true);
    } finally {
      window.scrollTo(0, 0);
      host.style.removeProperty('height');
    }
  });

  it('root inner scroll moves the child; the parent scrolled out closes the child only (focus to a visible root row)', async () => {
    await setViewport({ width: 1000, height: 400 });
    const items = [{ label: 'Đầu' }, { label: 'Cha', items: [{ label: 'Con 1' }, { label: 'Con 2' }] },
      ...Array.from({ length: 20 }, (_, i) => ({ label: `Mục ${i + 1}` }))];
    const { reasons } = openTree({ top: 10 }, [], { items });
    const m = root();
    expect(m.scrollHeight).to.be.above(m.clientHeight);
    await click(row('Cha'));
    await frames(2);
    m.scrollTop = 20;
    await frames(4);
    expect(!!sub()).to.equal(true);
    expect(near(rect(subRow('Con 1')).top, rect(row('Cha')).top)).to.equal(true);
    expect(activeText()).to.equal('Con 1');
    m.scrollTop = 200;
    await until(() => !sub());
    expect(!!sub()).to.equal(false);
    expect(TdMenu.isOpen()).to.equal(true);
    expect(reasons).to.deep.equal([]);
    const a = document.activeElement;
    expect(m.contains(a)).to.equal(true);
    const ar = rect(a);
    const mr = rect(m);
    expect(ar.top + ar.height / 2).to.be.within(mr.top, mr.bottom);
  });

  it('a scroll inside the child is ignored', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Album ${i + 1}` }));
    openTree({}, [], { items: [{ label: 'Cha', items: many }] });
    await click(row('Cha'));
    await frames(2);
    const top = rect(sub()).top;
    sub().scrollTop = 100;
    await frames(4);
    expect(!!sub()).to.equal(true);
    expect(rect(sub()).top).to.equal(top);
  });
});

describe('v0.118 submenu — drill-down below 480px (QĐ 5, R2, R4, D1)', () => {
  beforeEach(async () => {
    await setViewport({ width: 390, height: 844 });
  });

  it('root hidden, Back row first ("‹" + parent label, named "Quay lại: …"), focus on the first child, same geometry', async () => {
    openTree({ left: 16 });
    const m = root();
    await click(row('Chuyển sang'));
    await frames(2);
    const s = sub();
    expect(m.getAttribute('data-sub')).to.equal('drill');
    expect(getComputedStyle(m).visibility).to.equal('hidden');
    const first = s.firstElementChild;
    expect(first.classList.contains('td-menu__back')).to.equal(true);
    expect(first.hasAttribute('data-td-back')).to.equal(true);
    expect(first.getAttribute('role')).to.equal('menuitem');
    expect(first.querySelector('.td-menu__chevron').getAttribute('data-td-icon')).to.equal('prev');
    expect(first.querySelector('.td-menu__label').textContent).to.equal('Chuyển sang');
    expect(first.getAttribute('aria-label')).to.equal('Quay lại: Chuyển sang');
    expect(first.nextElementSibling.classList.contains('td-menu__separator')).to.equal(true);
    expect(activeText()).to.equal('Album A');
    expect(s.offsetWidth).to.equal(m.offsetWidth);
    expect(near(rect(s).left, rect(m).left)).to.equal(true);
    expect(near(rect(s).top, rect(m).top)).to.equal(true);
  });

  it('TdMenu.labels.back is the accessible-name prefix', async () => {
    const prev = TdMenu.labels.back;
    TdMenu.labels.back = 'Back';
    try {
      openTree();
      await click(row('Chuyển sang'));
      expect(sub().firstElementChild.getAttribute('aria-label')).to.equal('Back: Chuyển sang');
    } finally { TdMenu.labels.back = prev; }
  });

  it('ArrowUp / Home reach the Back row; Back (Enter, click), Escape and ArrowLeft go back to the parent', async () => {
    const { reasons } = openTree();
    await press('ArrowDown');
    await press('Enter');
    expect(activeText()).to.equal('Album A');
    await press('ArrowUp');
    expect(document.activeElement.hasAttribute('data-td-back')).to.equal(true);
    await press('Enter');
    expect(!!sub()).to.equal(false);
    expect(root().hasAttribute('data-sub')).to.equal(false);
    expect(activeText()).to.equal('Chuyển sang');
    await press('Enter');
    await press('Home');
    expect(document.activeElement.hasAttribute('data-td-back')).to.equal(true);
    await click(document.activeElement);
    expect(!!sub()).to.equal(false);
    expect(activeText()).to.equal('Chuyển sang');
    for (const key of ['Escape', 'ArrowLeft']) {
      await press('ArrowRight');
      expect(activeText(), key).to.equal('Album A');
      await press(key);
      expect(!!sub(), key).to.equal(false);
      expect(getComputedStyle(root()).visibility, key).to.equal('visible');
      expect(activeText(), key).to.equal('Chuyển sang');
    }
    await press('Enter');
    await press('Escape');
    await press('Escape');
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reasons).to.deep.equal(['escape']);
    expect(document.activeElement.id).to.equal('trig');
  });

  it('type-ahead in the child skips the Back row', async () => {
    openTree();
    await press('ArrowDown');
    await press('Enter');
    await press('c'); // "Chuyển sang" (the Back row label) is never matched
    expect(activeText()).to.equal('Album A');
    await sleep(550);
    await press('a');
    expect(activeText()).to.equal('Album B');
  });

  it('a child pick closes all', async () => {
    const { reasons, log } = openTree();
    await click(row('Chuyển sang'));
    await click(subRow('Album C'));
    expect(log).to.deep.equal(['C']);
    expect(reasons).to.deep.equal(['select']);
    expect(!!root()).to.equal(false);
    expect(!!sub()).to.equal(false);
  });

  it('no hover logic in drill-down mode', async () => {
    openTree();
    await moveTo(row('Chuyển sang'));
    await sleep(350);
    expect(!!sub()).to.equal(false);
  });

  it('R2: a root below the trigger with a taller child opens in place, capped, scrollable, never above the trigger', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Album ${i + 1}` }));
    const { t } = openTree({ top: 300 }, [], { items: [{ label: 'Một' }, { label: 'Cha', items: many }] });
    const m = root();
    expect(m.getAttribute('data-placement')).to.equal('bottom');
    await click(row('Cha'));
    await frames(2);
    const s = sub();
    expect(near(rect(s).top, rect(m).top)).to.equal(true);
    expect(rect(s).top).to.be.at.least(rect(t).bottom);
    expect(rect(s).bottom).to.be.at.most(844 - 8 + 0.5);
    expect(parseFloat(s.style.getPropertyValue('max-height'))).to.be.at.most(448);
    expect(s.scrollHeight).to.be.above(s.clientHeight);
    expect(s.offsetHeight).to.be.above(m.offsetHeight);
  });

  it('R4: root near the right edge, a child label wider than the root: the root width, inside the viewport', async () => {
    const long = 'Một album có cái tên rất là dài dài dài để thử xem nhãn có xuống dòng hay không nhé';
    openTree({ left: 330, align: 'end' }, [], { items: [{ label: 'Cha', items: [{ label: long }, { label: 'Ngắn' }] }] });
    const m = root();
    await click(row('Cha'));
    await frames(2);
    const s = sub();
    expect(s.offsetWidth).to.equal(m.offsetWidth);
    expect(rect(s).right).to.be.at.most(390 + 0.5);
    expect(rect(s).left).to.be.at.least(-0.5);
    expect(s.scrollWidth).to.be.at.most(s.clientWidth + 1);
  });
});
