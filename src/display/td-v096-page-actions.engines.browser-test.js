import { expect } from '@esm-bundle/chai';
import { TdPageActions } from './td-page-actions.js';
import { TdMenu } from '../feedback/td-menu.js';
import '../form/td-button.js';

// v0.96.0 (plan docs/internal/plans/v0.96.0-action-fold.md §6 / §10.2) — <td-page-actions>: count fold, narrow by the
// PARENT row (+ hysteresis), step-2 width fold, "…" menu → original.click(), data-td-menu anchors + ctx (original,
// proxy, folded item), mirror proxies (safeClone allowlist, click → original, disabled at click, middle click on a link
// proxy, focus out of the aria-hidden mirror), > 1 primary, disconnect. Strict style-src-attr: no violation.
// Chromium + Firefox + WebKit. Synthetic clicks (not in POINTER_FILES); waits on rAF-polled conditions.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const violations = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
const csp = document.createElement('meta');
csp.httpEquiv = 'Content-Security-Policy';
csp.content = "style-src-attr 'none'";
document.head.appendChild(csp);

const root = document.createElement('div');
document.body.appendChild(root);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await Promise.resolve(); await raf(); await raf(); await raf(); };
async function waitFor(cond, timeout = 3000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));

const seen = [];
TdMenu.define('pa-ctx', (ctx) => { seen.push(ctx); return [{ label: 'Một', onSelect: () => {} }]; });
TdMenu.define('pa-other', (ctx) => { seen.push({ ...ctx, other: true }); return [{ label: 'Khác', onSelect: () => {} }]; });

const ACTIONS = `
  <a class="td-btn td-btn--secondary" href="#import" data-pa="import">Nhập</a>
  <button class="td-btn td-btn--secondary" type="button" data-pa="sort">Sắp xếp</button>
  <button class="td-btn td-btn--secondary" type="button" data-pa="csv" data-td-in-menu>Xuất CSV</button>
  <button class="td-btn td-btn--danger" type="button" data-pa="del" data-td-tone="danger">Xoá album</button>
  <td-button variant="primary" label="Tải ảnh lên" data-pa="up"></td-button>`;

/** [h1 | td-page-actions] in a flex row of `width` (the 480 threshold is measured on this row) */
async function mount(actions = ACTIONS, { width = '900px', attrs = '', after = '' } = {}) {
  root.innerHTML = `<div data-row><h1 data-h1>Ảnh</h1><td-page-actions ${attrs}>${actions}</td-page-actions></div>${after}`;
  const row = root.querySelector('[data-row]');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '16px';
  row.style.inlineSize = width;
  const h1 = root.querySelector('[data-h1]');
  h1.style.margin = '0';
  h1.style.flex = 'none';
  const host = root.querySelector('td-page-actions');
  await customElements.whenDefined('td-button');
  await settle();
  return { row, host };
}
const kids = (host) => [...host.children];
const more = (host) => host.querySelector(':scope > .td-page-actions__more');
const pa = (host, name) => host.querySelector(`[data-pa="${name}"]`);
const shown = (host) => kids(host).filter((el) => !el.hidden && !el.hasAttribute('data-td-overflow'))
  .map((el) => el.getAttribute('data-pa') || (el === more(host) ? '…' : el.tagName));
const menuItems = () => [...document.querySelectorAll('.td-menu [role="menuitem"]')];
const resize = async (row, w) => { row.style.inlineSize = w; await settle(); await settle(); };
const closeMenus = async () => { TdMenu.close(); document.querySelectorAll('.td-menu').forEach((m) => m.remove()); await settle(); };

afterEach(async () => {
  await closeMenus();
  root.innerHTML = '';
  seen.length = 0;
  await settle();
  expect(violations, 'no style-src-attr violation').to.deep.equal([]);
});

describe('td-page-actions — fold', () => {
  it('upgrade: role=group + label, 2 secondaries, "…" before the primary (last), in-menu + 3rd in "…"', async () => {
    const { host } = await mount(undefined, { attrs: 'label="Thao tác ảnh"' });
    expect(host.classList.contains('td-page-actions')).to.equal(true);
    expect(host.getAttribute('role')).to.equal('group');
    expect(host.getAttribute('aria-label')).to.equal('Thao tác ảnh');
    await waitFor(() => shown(host).join() === 'import,sort,…,up', 2000, `plan, got ${shown(host)}`);
    expect(host.lastElementChild).to.equal(pa(host, 'up'));
    expect(pa(host, 'up').previousElementSibling).to.equal(more(host));
    expect(getComputedStyle(pa(host, 'csv')).display).to.equal('none');
    expect(more(host).getAttribute('aria-label')).to.equal(TdPageActions.labels.more);
    expect(getComputedStyle(host).flexWrap).to.equal('nowrap');
  });

  it('"…" menu: folded actions in DOM order, danger flag, select → original.click()', async () => {
    const { host } = await mount();
    await waitFor(() => !more(host).hidden, 2000, '"…"');
    let clicks = 0;
    pa(host, 'del').addEventListener('click', () => clicks++);
    click(more(host));
    await waitFor(() => menuItems().length === 2, 2000, 'menu');
    expect(menuItems().map((el) => el.textContent.trim())).to.deep.equal(['Xuất CSV', 'Xoá album']);
    click(menuItems()[1]);
    await waitFor(() => clicks === 1, 2000, 'original clicked');
  });

  it('narrow by the PARENT row: < 472 → primary + "…"; band keeps it; ≥ 488 → back', async () => {
    const { row, host } = await mount();
    await waitFor(() => shown(host).join() === 'import,sort,…,up', 2000, 'wide');
    await resize(row, '400px');
    await waitFor(() => shown(host).join() === '…,up', 2000, `narrow, got ${shown(host)}`);
    await resize(row, '484px');
    expect(shown(host).join()).to.equal('…,up');
    await resize(row, '900px');
    await waitFor(() => shown(host).join() === 'import,sort,…,up', 2000, 'wide again');
  });

  it('step 2: 560px row, long title + labels → secondaries fold into "…", primary stays, no wrap / overflow; wider (≥ 480, no threshold crossing) → shown', async () => {
    const acts = `<button class="td-btn td-btn--secondary" type="button" data-pa="a">Nhập ảnh từ thư mục máy tính</button>
      <button class="td-btn td-btn--secondary" type="button" data-pa="b">Sắp xếp theo ngày chụp ảnh</button>
      <td-button variant="primary" label="Tải ảnh lên" data-pa="up"></td-button>`;
    const { row, host } = await mount(acts, { width: '1200px' });
    root.querySelector('[data-h1]').textContent = 'Thư viện ảnh gia đình';
    await settle();
    await waitFor(() => shown(host).join() === 'a,b,up', 2000, `wide, got ${shown(host)}`);
    const w0 = host.getBoundingClientRect().width;
    await resize(row, '560px');
    await waitFor(() => !shown(host).includes('b'), 2000, `b folded, got ${shown(host)}`);
    expect(shown(host)).to.include('up');
    expect(shown(host)).to.include('…');
    expect(host.scrollWidth).to.be.at.most(host.clientWidth + 1);
    expect(row.scrollWidth).to.be.at.most(row.clientWidth + 1);
    const tops = kids(host).filter((el) => getComputedStyle(el).display !== 'none').map((el) => Math.round(el.getBoundingClientRect().top));
    expect(new Set(tops).size).to.equal(1);
    await resize(row, '1200px');
    await waitFor(() => shown(host).join() === 'a,b,up', 2000, `shown again, got ${shown(host)}`);
    expect(host.getBoundingClientRect().width).to.be.closeTo(w0, 1);
  });

  it('adding / removing an action never changes the host width (no oscillation)', async () => {
    const { host } = await mount();
    await settle();
    const w0 = host.getBoundingClientRect().width;
    const b = document.createElement('button');
    b.className = 'td-btn td-btn--secondary';
    b.type = 'button';
    b.textContent = 'Thêm';
    host.prepend(b);
    await settle();
    expect(host.getBoundingClientRect().width).to.be.closeTo(w0, 0.5);
    b.remove();
    await settle();
    expect(host.getBoundingClientRect().width).to.be.closeTo(w0, 0.5);
  });

  it('> 1 primary: one warning; the first winner keeps the place after a rebuild', async () => {
    const warn = console.warn;
    const msgs = [];
    console.warn = (...a) => msgs.push(a.join(' '));
    try {
      const acts = `<button class="td-btn td-btn--primary" type="button" data-pa="p1">P1</button>
        <button class="td-btn td-btn--secondary" type="button" data-pa="s">S</button>
        <button class="td-btn td-btn--secondary" type="button" data-pa="p2" data-td-tone="primary">P2</button>`;
      const { host } = await mount(acts);
      await waitFor(() => host.lastElementChild === pa(host, 'p1'), 2000, 'p1 last');
      pa(host, 's').textContent = 'S2';
      await settle();
      pa(host, 'p2').setAttribute('title', 'x');
      pa(host, 's').setAttribute('aria-label', 'S2');
      await settle();
      expect(host.lastElementChild).to.equal(pa(host, 'p1'));
      expect(msgs.filter((m) => m.includes('td-page-actions')).length).to.equal(1);
    } finally {
      console.warn = warn;
    }
  });

  it('disconnect: "…" removed, overflow marks cleared, binds released, mirror emptied', async () => {
    const acts = ACTIONS.replace('data-pa="sort"', 'data-pa="sort" data-td-menu="pa-ctx"');
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length > 0, 2000, 'mirror');
    host.remove();
    expect(host.querySelector('.td-page-actions__more')).to.equal(null);
    expect(host.querySelectorAll('[data-td-overflow]').length).to.equal(0);
    expect(m.children.length).to.equal(0);
    expect(m.hasAttribute('aria-hidden')).to.equal(false);
    root.appendChild(host);
    click(pa(host, 'sort'));
    await settle();
    expect(seen.length).to.equal(1); // bound again on re-connect, once
  });
});

describe('td-page-actions — data-td-menu', () => {
  it('original bound: ctx.anchor = the clicked control; td-button host keys (data-td-menu-id) reach ctx from original, proxy and "…"', async () => {
    const acts = `<td-button label="Sắp xếp" data-pa="tb" data-td-menu="pa-ctx" data-td-menu-id="7"></td-button>
      <button class="td-btn td-btn--secondary" type="button" data-pa="a">A</button>
      <button class="td-btn td-btn--secondary" type="button" data-pa="b">B</button>
      <td-button variant="primary" label="Tải" data-pa="up"></td-button>`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const tb = pa(host, 'tb');
    const control = tb.querySelector(':scope > .td-btn');
    await waitFor(() => shown(host).join() === 'tb,a,…,up', 2000, `plan, got ${shown(host)}`);
    click(control);
    await waitFor(() => seen.length === 1, 2000, 'original menu');
    expect(seen[0].anchor).to.equal(control);
    expect(seen[0].id).to.equal('7');
    await closeMenus();
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 4, 2000, `mirror, got ${m.children.length}`);
    const proxy = m.children[0];
    click(proxy);
    await waitFor(() => seen.length === 2, 2000, 'proxy menu');
    expect(seen[1].anchor).to.equal(proxy);
    expect(seen[1].id).to.equal('7');
    await closeMenus();
    tb.setAttribute('data-td-in-menu', ''); // → "…"
    await waitFor(() => tb.hasAttribute('data-td-overflow'), 2000, 'tb folded');
    click(more(host));
    await waitFor(() => menuItems().length === 1, 2000, '"…" menu');
    click(menuItems().find((el) => el.textContent.includes('Sắp xếp')));
    await waitFor(() => seen.length === 3, 2000, 'folded item menu');
    expect(seen[2].anchor).to.equal(more(host));
    expect(seen[2].id).to.equal('7');
  });

  it('removing / renaming data-td-menu at runtime: the old bind is released', async () => {
    const acts = `<button class="td-btn td-btn--secondary" type="button" data-pa="m" data-td-menu="pa-ctx">M</button>
      <td-button variant="primary" label="Tải" data-pa="up"></td-button>`;
    const { host } = await mount(acts);
    const m = pa(host, 'm');
    m.setAttribute('data-td-menu', 'pa-other');
    await settle();
    click(m);
    await waitFor(() => seen.length === 1, 2000, 'renamed');
    expect(seen[0].other).to.equal(true);
    await closeMenus();
    m.removeAttribute('data-td-menu');
    await settle();
    click(m);
    await settle();
    expect(seen.length).to.equal(1);
    expect(document.querySelector('.td-menu')).to.equal(null);
  });
});

describe('td-page-actions — mirror', () => {
  it('proxies of the shown actions + its own "…"; aria-hidden; tabindex -1; click → original; disabled at click → blocked', async () => {
    const { host } = await mount(undefined, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 4, 2000, `mirror, got ${m.children.length}`);
    expect(m.getAttribute('aria-hidden')).to.equal('true');
    const [imp, sort, dots, up] = m.children;
    expect(imp.tagName).to.equal('A');
    expect(imp.getAttribute('href')).to.equal('#import');
    expect(dots.classList.contains('td-page-actions__more')).to.equal(true);
    for (const c of m.children) expect(c.getAttribute('tabindex')).to.equal('-1');
    expect(up.classList.contains('td-btn--primary')).to.equal(true);
    expect(up.textContent).to.contain('Tải ảnh lên');
    let n = 0;
    pa(host, 'sort').addEventListener('click', () => n++);
    click(sort);
    expect(n).to.equal(1);
    pa(host, 'sort').disabled = true;
    click(sort);
    expect(n).to.equal(1);
    let nav = 0;
    pa(host, 'import').addEventListener('click', (e) => { nav++; e.preventDefault(); });
    imp.addEventListener('click', (e) => e.preventDefault()); // keep the test page
    click(imp, { button: 1 });
    expect(nav).to.equal(0); // middle click: left to the browser
  });

  it('focus never stays in the mirror: a menu opened from a proxy returns focus to the original', async () => {
    const acts = `<button class="td-btn td-btn--secondary" type="button" data-pa="m" data-td-menu="pa-ctx">M</button>
      <td-button variant="primary" label="Tải" data-pa="up"></td-button>`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 2, 2000, 'mirror');
    const y = window.scrollY;
    click(m.children[0]);
    await waitFor(() => menuItems().length === 1, 2000, 'menu');
    click(menuItems()[0]);
    await settle();
    expect(m.contains(document.activeElement)).to.equal(false);
    expect(document.activeElement).to.equal(pa(host, 'm'));
    expect(window.scrollY).to.equal(y);
  });

  it('safeClone: no id / data-* / style attribute / ARIA idref / on*; javascript: href → button; poison children dropped', async () => {
    window.__paPwned = 0;
    const acts = `<a class="td-btn td-btn--secondary" id="x1" data-tooltip="t" data-x="1" aria-describedby="x2" title="T"
          href="javascript:window.__paPwned++" onclick="window.__paPwned++">Bad<img src="/test/fixtures/1.svg" alt="" onerror="window.__paPwned++"><script>window.__paPwned++</script><style>.x{}</style></a>
        <button class="td-btn td-btn--secondary" type="button" data-pa="svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="5"></ellipse><circle cx="5" cy="5" r="2"></circle><rect x="1" y="1" width="3" height="3"></rect><line x1="0" y1="0" x2="24" y2="24"></line><use href="#evil"></use><foreignObject><div>fo</div></foreignObject></svg><a href="/n">nested</a>Icon</button>
        <td-button variant="primary" label="Tải" data-pa="up"></td-button>`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 3, 2000, 'mirror');
    const bad = m.children[0];
    expect(bad.tagName).to.equal('BUTTON');
    for (const a of ['id', 'data-tooltip', 'data-x', 'aria-describedby', 'onclick', 'style', 'href']) expect(bad.hasAttribute(a), a).to.equal(false);
    expect(bad.getAttribute('title')).to.equal('T');
    expect(bad.querySelector('img, script, style')).to.equal(null);
    expect(bad.textContent).to.equal('Bad');
    const svgProxy = m.children[1];
    const svg = svgProxy.querySelector('svg');
    expect(svg.getAttribute('viewBox')).to.equal('0 0 24 24');
    expect(svg.querySelector('ellipse').getAttribute('rx')).to.equal('9');
    expect(svg.querySelector('circle').getAttribute('r')).to.equal('2');
    expect(svg.querySelector('rect').getAttribute('width')).to.equal('3');
    expect(svg.querySelector('line').getAttribute('x2')).to.equal('24');
    expect(svg.querySelector('use, foreignObject')).to.equal(null);
    expect(svgProxy.querySelector('a')).to.equal(null);
    expect(svgProxy.textContent).to.contain('nested');
    await settle();
    expect(window.__paPwned).to.equal(0);
    void host;
  });

  it('td-button color="#…" → the proxy has the same background; legacy icon <i> kept in .td-btn__icon', async () => {
    const acts = `<td-button color="#7c3aed" label="Màu" data-pa="c"></td-button>
      <td-button icon="fas fa-edit" label="Sửa" data-pa="i"></td-button>
      <td-button variant="primary" label="Tải" data-pa="up"></td-button>`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 3, 2000, 'mirror');
    const control = pa(host, 'c').querySelector(':scope > .td-btn');
    expect(getComputedStyle(m.children[0]).backgroundColor).to.equal(getComputedStyle(control).backgroundColor);
    expect(m.children[0].hasAttribute('style')).to.equal(true); // CSSOM custom properties only
    for (const p of m.children[0].style) expect(p.startsWith('--td-'), p).to.equal(true);
    const i = m.children[1].querySelector('.td-btn__icon > i');
    expect(i).to.not.equal(null);
    expect(i.className).to.equal('fas fa-edit');
    expect(i.getAttribute('aria-hidden')).to.equal('true');
  });

  it('an invalid mirror (the host itself / inside it) → one warning, ignored', async () => {
    const warn = console.warn;
    const msgs = [];
    console.warn = (...a) => msgs.push(a.join(' '));
    try {
      const { host } = await mount();
      host.mirror = host;
      await settle();
      expect(msgs.filter((x) => x.includes('mirror')).length).to.equal(1);
      expect(host.querySelector('.td-page-actions__clone')).to.equal(null);
    } finally {
      console.warn = warn;
    }
  });
});

// v0.96.0 security review: a `javascript:` link (from the start, or an href changed AFTER render) is never activated by a
// mirror proxy or a "…" item — activateControl re-checks safeButtonHref at click time. Detected by a window flag that the
// javascript: URL would set, and by the original receiving no click at all.
describe('td-page-actions — unsafe link activation', () => {
  const JS = 'javascript:window.__paJs=(window.__paJs||0)+1';
  const PRIMARY = '<td-button variant="primary" label="Tải ảnh lên" data-pa="up"></td-button>';
  const clicksOn = (el) => { const c = { n: 0 }; el.addEventListener('click', () => { c.n += 1; }); return c; };
  beforeEach(() => { window.__paJs = 0; });
  afterEach(() => { delete window.__paJs; });

  it('control: a SAFE link proxy and a safe "…" item do click the original', async () => {
    const acts = `<a class="td-btn td-btn--secondary" href="#pa-safe-1" data-pa="s1">Một</a>
      <a class="td-btn td-btn--secondary" href="#pa-safe-2" data-pa="s2" data-td-in-menu>Hai</a>${PRIMARY}`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 3, 2000, 'mirror');
    const c1 = clicksOn(pa(host, 's1'));
    const c2 = clicksOn(pa(host, 's2'));
    click(m.children[0]);
    expect(c1.n).to.equal(1);
    click(more(host));
    await waitFor(() => menuItems().length === 1, 2000, 'menu');
    click(menuItems()[0]);
    await waitFor(() => c2.n === 1, 2000, 'safe item clicked the original');
    window.location.hash = '';
  });

  it('a javascript: href from the start: the proxy is a button, its click and the "…" item never run it', async () => {
    const acts = `<a class="td-btn td-btn--secondary" href="${JS}" data-pa="bad">Xấu</a>
      <a class="td-btn td-btn--secondary" href="${JS}" data-pa="badmenu" data-td-in-menu>Xấu trong menu</a>${PRIMARY}`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 3, 2000, 'mirror');
    expect(m.children[0].tagName).to.equal('BUTTON');
    expect(m.children[0].hasAttribute('href')).to.equal(false);
    const c1 = clicksOn(pa(host, 'bad'));
    const c2 = clicksOn(pa(host, 'badmenu'));
    click(m.children[0]);
    await settle();
    click(more(host));
    await waitFor(() => menuItems().length === 1, 2000, 'menu');
    click(menuItems()[0]);
    await settle();
    // the mirror's own "…" (same items)
    click(m.children[1]);
    await waitFor(() => menuItems().length === 1, 2000, 'mirror menu');
    click(menuItems()[0]);
    await settle();
    expect(window.__paJs, 'javascript: URL ran').to.equal(0);
    expect(c1.n, 'original (shown) clicked').to.equal(0);
    expect(c2.n, 'original (menu) clicked').to.equal(0);
  });

  it('a safe href changed to javascript: AFTER render: proxy click and "…" item re-check at click time', async () => {
    const acts = `<a class="td-btn td-btn--secondary" href="#pa-late-1" data-pa="late">Muộn</a>
      <a class="td-btn td-btn--secondary" href="#pa-late-2" data-pa="latemenu" data-td-in-menu>Muộn trong menu</a>${PRIMARY}`;
    const { host } = await mount(acts, { attrs: 'mirror="pa-m"', after: '<div id="pa-m"></div>' });
    const m = root.querySelector('#pa-m');
    await waitFor(() => m.children.length === 3, 2000, 'mirror');
    expect(m.children[0].tagName).to.equal('A'); // built while the href was safe
    expect(m.children[0].getAttribute('href')).to.equal('#pa-late-1');
    const c1 = clicksOn(pa(host, 'late'));
    const c2 = clicksOn(pa(host, 'latemenu'));
    pa(host, 'late').setAttribute('href', JS); // the site (or an attacker) changes it afterwards
    pa(host, 'latemenu').setAttribute('href', JS);
    // the proxy keeps its OLD safe href: not navigated to the javascript: URL either
    click(m.children[0]);
    await settle();
    click(more(host));
    await waitFor(() => menuItems().length === 1, 2000, 'menu');
    click(menuItems()[0]);
    await settle();
    expect(window.__paJs, 'javascript: URL ran').to.equal(0);
    expect(c1.n, 'original (shown) clicked').to.equal(0);
    expect(c2.n, 'original (menu) clicked').to.equal(0);
    expect(m.children[0].getAttribute('href') || '').to.not.match(/^\s*javascript:/i);
    window.location.hash = '';
  });
});
