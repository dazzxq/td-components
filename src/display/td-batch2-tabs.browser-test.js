import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import './td-tabs.js';
import { TdButton } from '../form/td-button.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
afterEach(async () => {
  host.innerHTML = '';
  host.removeAttribute('dir');
  document.documentElement.removeAttribute('data-td-theme');
  await emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
});

const THREE = [{ id: 'a', label: 'Một' }, { id: 'b', label: 'Hai' }, { id: 'c', label: 'Ba' }];
function tabsEl(attrs = '', tabs = THREE) {
  const el = mount(`<td-tabs ${attrs}></td-tabs>`);
  el.tabs = tabs;
  return el;
}
const btns = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const selected = (el) => btns(el).map((b) => b.getAttribute('aria-selected'));
const tabindexes = (el) => btns(el).map((b) => b.getAttribute('tabindex'));
function record(el) {
  const got = { events: [], calls: [] };
  el.addEventListener('tab-change', (e) => got.events.push(e.detail.tabId));
  el.onChange = (id) => got.calls.push(id);
  return got;
}

/* WCAG contrast from computed colours (alpha composited) */
function rgba(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const ratio = (a, b) => {
  const [x, y] = [TdButton._luminance(a), TdButton._luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function pageBg() {
  const probe = document.createElement('div');
  probe.style.setProperty('background-color', 'var(--td-color-bg)');
  host.appendChild(probe);
  const c = rgba(getComputedStyle(probe).backgroundColor);
  probe.remove();
  return c;
}

describe('batch 2 — td-tabs roles + roving tabindex', () => {
  it('renders the tablist / tab contract with aria-selected + roving tabindex', () => {
    const el = tabsEl('id="t1"');
    const list = el.querySelector(':scope > .td-tabs.td-tabs--md');
    expect(list.getAttribute('role')).to.equal('tablist');
    expect(btns(el).every((b) => b.getAttribute('role') === 'tab' && b.type === 'button')).to.equal(true);
    expect(btns(el).map((b) => b.id)).to.deep.equal(['t1-tab-0', 't1-tab-1', 't1-tab-2']);
    expect(selected(el)).to.deep.equal(['true', 'false', 'false']);
    expect(tabindexes(el)).to.deep.equal(['0', '-1', '-1']);
    expect(el.querySelector('.td-tabs__indicator').getAttribute('aria-hidden')).to.equal('true');
    expect(el.querySelector('[class*="td-tab-btn"], .td-tabs-container')).to.equal(null); // legacy gone
    expect(el.getActiveTab()).to.equal('a');
  });

  it('empty tabs: no tablist role, data-state="empty"', () => {
    const el = tabsEl('', []);
    const list = el.querySelector('.td-tabs');
    expect(list.getAttribute('data-state')).to.equal('empty');
    expect(list.hasAttribute('role')).to.equal(false);
    expect(el.getActiveTab()).to.equal(null);
  });

  it('D19: default tablist name "Các thẻ"; host aria-label / aria-labelledby override (in place)', () => {
    const el = tabsEl();
    const list = el.querySelector('.td-tabs');
    expect(list.getAttribute('aria-label')).to.equal('Các thẻ');
    el.setAttribute('aria-label', 'Chế độ xem');
    expect(el.querySelector('.td-tabs') === list).to.equal(true); // no re-render
    expect(list.getAttribute('aria-label')).to.equal('Chế độ xem');
    mount('<h2 id="tabs-heading">Nguồn ảnh</h2>');
    el.setAttribute('aria-labelledby', 'tabs-heading');
    expect(list.getAttribute('aria-labelledby')).to.equal('tabs-heading');
    expect(list.hasAttribute('aria-label')).to.equal(false);
    el.removeAttribute('aria-labelledby');
    el.removeAttribute('aria-label');
    expect(list.getAttribute('aria-label')).to.equal('Các thẻ');
  });

  it('two id-less tab sets get unique host + tab ids', () => {
    const a = tabsEl();
    const b = tabsEl();
    expect(!!a.id && !!b.id && a.id !== b.id).to.equal(true);
    const ids = [...btns(a), ...btns(b)].map((x) => x.id);
    expect(new Set(ids).size).to.equal(6);
    expect(ids.every((id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1)).to.equal(true);
  });
});

describe('batch 2 — td-tabs keyboard (trusted keys)', () => {
  it('manual (default): Arrow/Home/End move focus with wrap, without selecting or firing', async () => {
    const el = tabsEl();
    const got = record(el);
    const [a, b, c] = btns(el);
    a.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === b).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === c).to.equal(true);
    await sendKeys({ press: 'ArrowRight' }); // wrap
    expect(document.activeElement === a).to.equal(true);
    await sendKeys({ press: 'ArrowLeft' }); // wrap back
    expect(document.activeElement === c).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(document.activeElement === a).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(document.activeElement === c).to.equal(true);
    expect(selected(el)).to.deep.equal(['true', 'false', 'false']);
    expect(tabindexes(el)).to.deep.equal(['0', '-1', '-1']);
    expect(got.events).to.deep.equal([]);
    expect(got.calls).to.deep.equal([]);
  });

  it('manual: Enter selects and fires tab-change + onChange exactly once; Space too', async () => {
    const el = tabsEl();
    const got = record(el);
    btns(el)[0].focus();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Enter' });
    expect(selected(el)).to.deep.equal(['false', 'true', 'false']);
    expect(tabindexes(el)).to.deep.equal(['-1', '0', '-1']);
    expect(got.events).to.deep.equal(['b']);
    expect(got.calls).to.deep.equal(['b']);
    await sendKeys({ press: 'Enter' }); // already selected → nothing
    expect(got.events).to.deep.equal(['b']);
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Space' });
    expect(el.getActiveTab()).to.equal('c');
    expect(got.events).to.deep.equal(['b', 'c']);
    expect(document.activeElement === btns(el)[2]).to.equal(true);
  });

  it('activation="auto": arrows select + fire once per move', async () => {
    const el = tabsEl('activation="auto"');
    const got = record(el);
    btns(el)[0].focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(selected(el)).to.deep.equal(['false', 'true', 'false']);
    expect(document.activeElement === btns(el)[1]).to.equal(true);
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'ArrowRight' });
    expect(el.getActiveTab()).to.equal('a');
    expect(got.events).to.deep.equal(['b', 'c', 'a']);
    expect(got.calls).to.deep.equal(['b', 'c', 'a']);
  });

  it('RTL: ArrowLeft moves to the next tab', async () => {
    host.setAttribute('dir', 'rtl');
    const el = tabsEl();
    btns(el)[0].focus();
    await sendKeys({ press: 'ArrowLeft' });
    expect(document.activeElement === btns(el)[1]).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === btns(el)[2]).to.equal(true); // wrapped
  });
});

describe('batch 2 — td-tabs API', () => {
  it('click fires once; active click is silent; setActiveTab fires; active-tab attr is silent', () => {
    const el = tabsEl();
    const got = record(el);
    btns(el)[1].click();
    btns(el)[1].click();
    expect(got.events).to.deep.equal(['b']);
    el.setActiveTab('c');
    el.setActiveTab('nope');
    expect(got.events).to.deep.equal(['b', 'c']);
    el.setAttribute('active-tab', 'a');
    expect(el.getActiveTab()).to.equal('a');
    expect(selected(el)).to.deep.equal(['true', 'false', 'false']);
    expect(got.events).to.deep.equal(['b', 'c']);
  });

  it('active-tab attribute picks the initial tab; size updates in place', () => {
    const el = tabsEl('active-tab="c" size="sm"');
    expect(el.getActiveTab()).to.equal('c');
    const list = el.querySelector('.td-tabs.td-tabs--sm');
    el.setAttribute('size', 'md');
    expect(el.querySelector('.td-tabs') === list).to.equal(true);
    expect(list.className).to.equal('td-tabs td-tabs--md');
  });

  it('tabs setter re-validates the active id: kept → active-tab attr → first', () => {
    const el = tabsEl('active-tab="b"');
    el.setActiveTab('c');
    el.tabs = [{ id: 'c', label: 'C' }, { id: 'd', label: 'D' }];
    expect(el.getActiveTab()).to.equal('c'); // still exists
    el.tabs = [{ id: 'x', label: 'X' }, { id: 'b', label: 'B' }];
    expect(el.getActiveTab()).to.equal('b'); // active-tab attribute
    el.removeAttribute('active-tab');
    el.tabs = [{ id: 'y', label: 'Y' }, { id: 'z', label: 'Z' }];
    expect(el.getActiveTab()).to.equal('y'); // first
    expect(selected(el)).to.deep.equal(['true', 'false']);
    el.tabs = [];
    expect(el.getActiveTab()).to.equal(null);
  });

  it('D18 icons: registry name → svg slot; other value → validated legacy class list', () => {
    const el = tabsEl('', [
      { id: 'u', label: 'Tải lên', icon: 'upload' },
      { id: 'l', label: 'Cũ', icon: 'fas fa-link' },
      { id: 'e', label: 'Emoji', icon: '💳' },
    ]);
    const [u, l, e] = btns(el);
    expect(u.querySelector('.td-tabs__icon[aria-hidden="true"] svg[data-icon="upload"]') !== null).to.equal(true);
    expect(l.querySelector('.td-tabs__icon i').getAttribute('class')).to.equal('fas fa-link');
    expect(l.querySelector('.td-tabs__icon i').getAttribute('aria-hidden')).to.equal('true');
    expect(e.querySelector('.td-tabs__icon')).to.equal(null);
  });
});

describe('batch 2 — td-tabs panels (D7)', () => {
  it('aria-controls + managed tabpanel: role, aria-labelledby, hidden, conditional tabindex', () => {
    const wrap = mount(`<div>
      <td-tabs id="tp"></td-tabs>
      <div id="tp-p1">Chỉ có chữ</div>
      <div id="tp-p2"><button type="button">Nút</button></div>
    </div>`);
    const el = wrap.querySelector('td-tabs');
    el.tabs = [{ id: 'a', label: 'A', panel: 'tp-p1' }, { id: 'b', label: 'B', panel: 'tp-p2' }, { id: 'c', label: 'C' }];
    const p1 = wrap.querySelector('#tp-p1');
    const p2 = wrap.querySelector('#tp-p2');
    const [a, b, c] = btns(el);
    expect(a.getAttribute('aria-controls')).to.equal('tp-p1');
    expect(b.getAttribute('aria-controls')).to.equal('tp-p2');
    expect(c.hasAttribute('aria-controls')).to.equal(false);
    expect(p1.getAttribute('role')).to.equal('tabpanel');
    expect(p1.getAttribute('aria-labelledby')).to.equal('tp-tab-0');
    expect(p2.getAttribute('aria-labelledby')).to.equal('tp-tab-1');
    expect(p1.hidden).to.equal(false);
    expect(p2.hidden).to.equal(true);
    expect(p1.getAttribute('tabindex')).to.equal('0'); // no focusable content
    expect(p2.hasAttribute('tabindex')).to.equal(false); // has a button
    b.click();
    expect(p1.hidden).to.equal(true);
    expect(p2.hidden).to.equal(false);
    c.click();
    expect(p1.hidden && p2.hidden).to.equal(true);
  });

  it('reassigning tabs without a panel restores every attribute it set', () => {
    const wrap = mount(`<div>
      <td-tabs></td-tabs>
      <section id="rp1" role="region" aria-labelledby="orig" tabindex="-1" hidden>x</section>
      <div id="rp2">y</div>
    </div>`);
    const el = wrap.querySelector('td-tabs');
    const p1 = wrap.querySelector('#rp1');
    const p2 = wrap.querySelector('#rp2');
    el.tabs = [{ id: 'a', label: 'A', panel: 'rp1' }, { id: 'b', label: 'B', panel: 'rp2' }];
    expect(p1.getAttribute('role')).to.equal('tabpanel');
    expect(p1.hidden).to.equal(false);
    el.tabs = [{ id: 'b', label: 'B', panel: 'rp2' }];
    expect(p1.getAttribute('role')).to.equal('region');
    expect(p1.getAttribute('aria-labelledby')).to.equal('orig');
    expect(p1.getAttribute('tabindex')).to.equal('-1');
    expect(p1.hidden).to.equal(true);
    expect(p2.getAttribute('role')).to.equal('tabpanel');
    expect(p2.getAttribute('aria-labelledby')).to.equal(`${el.id}-tab-0`);
    el.tabs = [{ id: 'b', label: 'B' }];
    for (const a of ['role', 'aria-labelledby', 'hidden', 'tabindex']) expect(p2.hasAttribute(a), a).to.equal(false);
  });

  it('disconnecting td-tabs restores panels; reconnecting manages them again', () => {
    const wrap = mount(`<div>
      <td-tabs id="dp"></td-tabs>
      <div id="dp-p1" class="x">x</div>
      <div id="dp-p2" tabindex="3">y</div>
    </div>`);
    const el = wrap.querySelector('td-tabs');
    el.tabs = [{ id: 'a', label: 'A', panel: 'dp-p1' }, { id: 'b', label: 'B', panel: 'dp-p2' }];
    const p1 = wrap.querySelector('#dp-p1');
    const p2 = wrap.querySelector('#dp-p2');
    expect(p2.hidden).to.equal(true);
    expect(p2.getAttribute('tabindex')).to.equal('0');
    el.remove();
    for (const a of ['role', 'aria-labelledby', 'hidden', 'tabindex']) expect(p1.hasAttribute(a), a).to.equal(false);
    expect(p2.getAttribute('tabindex')).to.equal('3');
    expect(p2.hasAttribute('hidden')).to.equal(false);
    expect(p2.hasAttribute('role')).to.equal(false);
    wrap.prepend(el);
    expect(p1.getAttribute('role')).to.equal('tabpanel');
    expect(p2.hidden).to.equal(true);
    btns(el)[1].click(); // listeners re-attached after reconnect
    expect(p2.hidden).to.equal(false);
    expect(el.getActiveTab()).to.equal('b');
  });
});

describe('batch 2 — td-tabs indicator', () => {
  it('positioned by CSSOM custom props (transform/width), re-measured after resize', async () => {
    const box = mount('<div></div>');
    box.style.setProperty('width', '420px');
    const el = document.createElement('td-tabs');
    box.appendChild(el);
    el.tabs = THREE;
    const list = el.querySelector('.td-tabs');
    const ind = el.querySelector('.td-tabs__indicator');
    expect(list.getAttribute('data-state')).to.equal('ready');
    expect(list.hasAttribute('style') && !/left|opacity/.test(list.getAttribute('style'))).to.equal(true);
    expect(ind.hasAttribute('style')).to.equal(false);
    const w1 = parseFloat(list.style.getPropertyValue('--td-tabs-ind-w'));
    expect(Math.abs(w1 - btns(el)[0].getBoundingClientRect().width)).to.be.below(1);
    btns(el)[2].click();
    const x = parseFloat(list.style.getPropertyValue('--td-tabs-ind-x'));
    const expected = btns(el)[2].getBoundingClientRect().left - list.getBoundingClientRect().left;
    expect(Math.abs(x - expected)).to.be.below(1);
    box.style.setProperty('width', '210px');
    await frames();
    await wait(50);
    await frames();
    const w2 = parseFloat(list.style.getPropertyValue('--td-tabs-ind-w'));
    expect(w2).to.be.below(w1);
    expect(Math.abs(w2 - btns(el)[2].getBoundingClientRect().width)).to.be.below(1);
    await wait(400); // transition done
    const r = ind.getBoundingClientRect();
    expect(Math.abs(r.left - btns(el)[2].getBoundingClientRect().left)).to.be.below(1);
  });

  it('disconnect stops the ResizeObserver and cancels the pending frame', async () => {
    const el = tabsEl();
    el._scheduleIndicator();
    expect(el._raf).to.not.equal(0);
    el.remove();
    expect(el._raf).to.equal(0);
    expect(el._ro).to.equal(null);
  });

  it('reduced motion: no indicator transition; forced colours: selected tab Highlight border', async () => {
    const el = tabsEl();
    const ind = el.querySelector('.td-tabs__indicator');
    expect(getComputedStyle(ind).transitionDuration).to.not.match(/^0s(, 0s)*$/);
    await emulateMedia({ reducedMotion: 'reduce' });
    expect(getComputedStyle(ind).transitionDuration).to.match(/^0s(, 0s)*$/);
    await emulateMedia({ forcedColors: 'active' });
    const [sel, other] = btns(el);
    expect(getComputedStyle(sel).borderTopWidth).to.equal('2px');
    expect(getComputedStyle(sel).borderTopColor).to.not.equal(getComputedStyle(other).borderTopColor);
  });
});

describe('batch 2 — td-tabs XSS', () => {
  it('label / id / icon / panel are escaped (no element or handler injected)', () => {
    window.__tdTabsXss = 0;
    const evil = '"><img src=x onerror="window.__tdTabsXss=1">';
    const el = tabsEl('', [
      { id: evil, label: `<img src=x onerror="window.__tdTabsXss=1">`, icon: `x fa" onclick="window.__tdTabsXss=1"`, panel: evil },
      { id: 'ok', label: 'OK', icon: '<svg onload="window.__tdTabsXss=1"></svg>' },
    ]);
    expect(el.querySelector('img, svg[onload], [onclick], [onerror]')).to.equal(null);
    const [b] = btns(el);
    expect(b.dataset.tabId).to.equal(evil);
    expect(b.getAttribute('aria-controls')).to.equal(evil);
    expect(b.querySelector('.td-tabs__label').textContent).to.equal('<img src=x onerror="window.__tdTabsXss=1">');
    expect(b.querySelector('.td-tabs__icon i').getAttribute('class')).to.equal('x'); // only valid class tokens survive
    el.setActiveTab(evil);
    expect(window.__tdTabsXss).to.equal(0);
  });
});

describe('batch 2 — td-tabs contrast', () => {
  for (const theme of ['light', 'dark']) {
    it(`inactive + selected text ≥ 4.5:1 on trough / pill (${theme})`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const el = tabsEl();
      const page = pageBg();
      const list = el.querySelector('.td-tabs');
      const trough = over(rgba(getComputedStyle(list).backgroundColor), page);
      const pill = over(rgba(getComputedStyle(el.querySelector('.td-tabs__indicator')).backgroundColor), trough);
      const [sel, inactive] = btns(el);
      await wait(150); // colour transition
      expect(ratio(rgba(getComputedStyle(inactive).color), trough), 'inactive vs trough').to.be.at.least(4.5);
      expect(ratio(rgba(getComputedStyle(sel).color), pill), 'selected vs pill').to.be.at.least(4.5);
      expect(getComputedStyle(list).backdropFilter).to.equal('none'); // no glass
    });
  }
});

describe('batch 2 — td-tabs golden contract (test/contracts/tabs.html)', () => {
  // Expanded a11y shape (plan v0.8.0 step 7, review ISSUE-10). Mirrors the shared contract helper.
  const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'tabindex', 'aria-live',
    'aria-selected', 'aria-current', 'aria-disabled', 'aria-controls', 'aria-labelledby', 'aria-describedby',
    'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-label', 'data-state', 'for', 'id'];
  function shape(node) {
    const attrs = KEEP.filter((a) => node.hasAttribute(a)).map((a) => `${a}=${node.getAttribute(a)}`);
    const cls = [...node.classList].sort().join('.');
    const kids = node.localName === 'svg' && node.getAttribute('data-icon') ? [] : [...node.children].map(shape);
    return { tag: node.localName, cls, attrs, kids };
  }
  it('rendered markup equals the fixture (with data-setup)', async () => {
    const html = await (await fetch('/test/contracts/tabs.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const templates = [...doc.querySelectorAll('template[data-component="td-tabs"]')];
    expect(templates.length).to.equal(2);
    for (const t of templates) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      const setup = t.getAttribute('data-setup');
      if (setup) new Function('el', setup)(el); // eslint-disable-line no-new-func
      expect(shape(el.firstElementChild)).to.deep.equal(shape(t.content.firstElementChild));
    }
  });
});
