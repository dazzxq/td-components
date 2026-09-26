import { expect } from '@esm-bundle/chai';
import './td-empty-state.js';
import { TdButton } from '../form/td-button.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
afterEach(() => { host.innerHTML = ''; document.documentElement.removeAttribute('data-td-theme'); });

function withWarn(fn) {
  const orig = console.warn;
  const calls = [];
  console.warn = (...a) => { calls.push(a.join(' ')); };
  try { fn(); } finally { console.warn = orig; }
  return calls;
}

function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const ratio = (a, b) => {
  const [x, y] = [TdButton._luminance(rgb(a)), TdButton._luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const iconOf = (el) => el.querySelector('.td-empty-state__icon svg');

describe('batch 2 — td-empty-state', () => {
  it('renders the BEM contract with the inbox registry icon, h3 and hidden actions', () => {
    const el = mount('<td-empty-state></td-empty-state>');
    const card = el.querySelector('.td-empty-state.td-empty-state--md');
    expect(card !== null).to.equal(true);
    expect(el.querySelector('.td-empty-state__icon').getAttribute('aria-hidden')).to.equal('true');
    expect(iconOf(el).getAttribute('data-icon')).to.equal('inbox');
    expect(el.querySelector('h3.td-empty-state__title').textContent).to.equal('Không có dữ liệu');
    expect(el.querySelector('.td-empty-state__message').textContent).to.equal('Chưa có mục nào được tạo.');
    expect(el.querySelector('.td-empty-state__actions').hidden).to.equal(true);
    expect(getComputedStyle(el.querySelector('.td-empty-state__actions')).display).to.equal('none');
    expect(el.querySelector('[class*="td-empty-"]:not([class*="td-empty-state"])')).to.equal(null);
    expect(card.hasAttribute('style')).to.equal(false);
    const cs = getComputedStyle(card);
    expect(cs.borderTopStyle).to.equal('dashed');
    expect(cs.boxShadow).to.equal('none');
  });

  it('registry icon by name; unknown name → inbox + exactly one warn', () => {
    const a = mount('<td-empty-state icon="search"></td-empty-state>');
    expect(iconOf(a).getAttribute('data-icon')).to.equal('search');
    let el;
    const warns = withWarn(() => {
      el = mount('<td-empty-state icon="no-such-icon"></td-empty-state>');
      el.setAttribute('message', 'x'); // re-render must not warn again
    });
    expect(iconOf(el).getAttribute('data-icon')).to.equal('inbox');
    expect(warns.length).to.equal(1);
    expect(warns[0]).to.contain('no-such-icon');
  });

  it('sizes set the icon px size', () => {
    const sm = mount('<td-empty-state size="sm"></td-empty-state>');
    const lg = mount('<td-empty-state size="lg" compact></td-empty-state>');
    expect(iconOf(sm).getAttribute('width')).to.equal('28');
    expect(iconOf(lg).getAttribute('width')).to.equal('56');
    expect(lg.querySelector('.td-empty-state--lg.td-empty-state--compact') !== null).to.equal(true);
    expect(parseFloat(getComputedStyle(lg.firstElementChild).paddingTop)).to.equal(14);
  });

  it('deprecated raw <svg> string: valid geometry is rebuilt (deprecation warn)', () => {
    let el;
    const warns = withWarn(() => {
      el = mount(`<td-empty-state icon='<svg viewBox="0 0 64 64" fill="none" stroke="currentColor"><rect x="12" y="24" width="40" height="28" rx="3"/><path d="M12 32h14l4 6h4l4-6h14"/></svg>'></td-empty-state>`);
    });
    const svg = iconOf(el);
    expect(svg.getAttribute('data-icon')).to.equal('custom');
    expect(svg.getAttribute('viewBox')).to.equal('0 0 64 64');
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    expect([...svg.children].map((c) => c.localName)).to.deep.equal(['rect', 'path']);
    expect(warns.length).to.equal(1);
    expect(warns[0]).to.contain('deprecated');
  });

  const MALICIOUS = {
    onload: '<svg viewBox="0 0 24 24" onload="window.__esXss=1"><path d="M0 0h24"/></svg>',
    script: '<svg viewBox="0 0 24 24"><script>window.__esXss=1</script><path d="M0 0h24"/></svg>',
    foreignObject: '<svg viewBox="0 0 24 24"><foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="window.__esXss=1"/></foreignObject></svg>',
    useHref: '<svg viewBox="0 0 24 24" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#x"/><use xlink:href="#y"/></svg>',
    style: '<svg viewBox="0 0 24 24"><path d="M0 0h24" style="fill:red"/></svg>',
    url: '<svg viewBox="0 0 24 24"><path d="M0 0h24" fill="url(#g)"/></svg>',
    nonSvgRoot: '<div><path d="M0 0h24"/></div>',
    parserError: '<svg viewBox="0 0 24 24"><path d="M0 0h24"></svg>',
  };
  for (const [name, str] of Object.entries(MALICIOUS)) {
    it(`raw svg rejected → inbox + one warn: ${name}`, async () => {
      window.__esXss = 0;
      const el = document.createElement('td-empty-state');
      el.setAttribute('icon', str);
      let warns;
      warns = withWarn(() => { host.appendChild(el); });
      await new Promise((r) => setTimeout(r, 30));
      expect(iconOf(el).getAttribute('data-icon')).to.equal('inbox');
      expect(el.querySelectorAll('script, foreignObject, use, img, [style], [onload]').length).to.equal(0);
      expect(window.__esXss).to.equal(0);
      expect(warns.length).to.equal(1);
    });
  }

  it('iconNode: trusted SVGElement is cloned, decorative, and wins over icon', () => {
    const el = mount('<td-empty-state icon="search"></td-empty-state>');
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, 'svg');
    node.setAttribute('viewBox', '0 0 10 10');
    node.setAttribute('class', 'my-icon');
    node.appendChild(document.createElementNS(ns, 'circle'));
    el.iconNode = node;
    const svg = iconOf(el);
    expect(svg.classList.contains('my-icon')).to.equal(true);
    expect(svg === node).to.equal(false); // cloned
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    expect(svg.getAttribute('focusable')).to.equal('false');
    el.setAttribute('title', 'Khác'); // survives re-render
    expect(iconOf(el).classList.contains('my-icon')).to.equal(true);
    el.iconNode = '<svg onload=alert(1)>'; // strings are not accepted
    expect(el.iconNode).to.equal(null);
    expect(iconOf(el).getAttribute('data-icon')).to.equal('search');
  });

  it('heading-level 2–6 (default 3, invalid → 3)', () => {
    expect(mount('<td-empty-state heading-level="2"></td-empty-state>').querySelector('h2.td-empty-state__title') !== null).to.equal(true);
    expect(mount('<td-empty-state heading-level="6"></td-empty-state>').querySelector('h6.td-empty-state__title') !== null).to.equal(true);
    expect(mount('<td-empty-state heading-level="9"></td-empty-state>').querySelector('h3.td-empty-state__title') !== null).to.equal(true);
    expect(mount('<td-empty-state heading-level="1"></td-empty-state>').querySelector('h3.td-empty-state__title') !== null).to.equal(true);
  });

  it('title/message are escaped (XSS)', () => {
    window.__esXss = 0;
    const el = mount('<td-empty-state></td-empty-state>');
    el.setAttribute('title', '<img src=x onerror="window.__esXss=1">');
    el.setAttribute('message', '<b>m</b>');
    expect(el.querySelector('img, b')).to.equal(null);
    expect(el.querySelector('.td-empty-state__title').textContent).to.contain('<img');
  });

  it('actions: .td-btn markup, variant allowlist, [hidden] toggling', () => {
    const el = mount('<td-empty-state></td-empty-state>');
    el.actions = [
      { label: 'Tạo mới', variant: 'primary', onClick: () => {} },
      { label: 'Xoá', variant: 'danger' },
      { label: 'Khác', variant: 'evil" onclick="x' },
    ];
    const box = el.querySelector('.td-empty-state__actions');
    expect(box.hidden).to.equal(false);
    const btns = [...box.querySelectorAll('button')];
    expect(btns.map((b) => b.className)).to.deep.equal([
      'td-btn td-btn--primary td-btn--sm', 'td-btn td-btn--danger td-btn--sm', 'td-btn td-btn--secondary td-btn--sm',
    ]);
    expect(btns.every((b) => b.type === 'button')).to.equal(true);
    expect(getComputedStyle(btns[0]).backgroundColor).to.not.equal('rgba(0, 0, 0, 0)'); // styled by button.css
    el.actions = [];
    expect(box.hidden).to.equal(true);
    expect(box.children.length).to.equal(0);
  });

  it('reassigning actions does not duplicate listeners; old handlers are removed', () => {
    const el = mount('<td-empty-state></td-empty-state>');
    const calls = [];
    const first = () => calls.push('first');
    el.actions = [{ label: 'A', onClick: first }];
    const oldBtn = el.querySelector('.td-empty-state__actions button');
    el.actions = [{ label: 'A', onClick: () => calls.push('second') }];
    el.actions = [{ label: 'A', onClick: () => calls.push('third') }];
    oldBtn.click(); // detached old button: its listener was removed
    el.querySelector('.td-empty-state__actions button').click();
    expect(calls).to.deep.equal(['third']);
    el.setAttribute('message', 'rerender');
    el.querySelector('.td-empty-state__actions button').click();
    expect(calls).to.deep.equal(['third', 'third']);
    expect(el._actionCleanups.length).to.equal(1);
  });

  it('actions keep working after the element is moved (reconnect)', () => {
    const el = mount('<td-empty-state></td-empty-state>');
    let n = 0;
    el.actions = [{ label: 'A', onClick: () => { n++; } }];
    mount('<div></div>').appendChild(el);
    el.querySelector('.td-empty-state__actions button').click();
    expect(n).to.equal(1);
  });

  for (const theme of ['light', 'dark']) {
    it(`contrast: title and message ≥ 4.5:1 on the card (${theme})`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const el = mount('<td-empty-state></td-empty-state>');
      const bg = getComputedStyle(el.firstElementChild).backgroundColor;
      expect(ratio(getComputedStyle(el.querySelector('.td-empty-state__title')).color, bg)).to.be.at.least(4.5);
      expect(ratio(getComputedStyle(el.querySelector('.td-empty-state__message')).color, bg)).to.be.at.least(4.5);
    });
  }
});

describe('batch 2 — td-empty-state contract', () => {
  const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'tabindex', 'aria-live',
    'data-td-icon-size'];
  function shape(el) {
    const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
    const cls = [...el.classList].sort().join('.');
    const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
    return { tag: el.localName, cls, attrs, kids };
  }
  it('test/contracts/empty-state.html', async () => {
    const html = await (await fetch('/test/contracts/empty-state.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(2);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      expect(shape(host.firstElementChild.firstElementChild)).to.deep.equal(shape(t.content.firstElementChild));
    }
  });
});
