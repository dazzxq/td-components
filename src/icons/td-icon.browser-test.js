import { expect } from '@esm-bundle/chai';
import { tdIcon, registerIcons, hasIcon, listIcons } from './td-icon.js';
import './td-icon-element.js';
import * as iconsModule from './td-icon.js';

describe('tdIcon', () => {
  it('renders a decorative stroke icon with the markup contract', () => {
    const svg = tdIcon('close');
    expect(svg.namespaceURI).to.equal('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('class')).to.equal('td-icon td-icon--m');
    expect(svg.getAttribute('data-icon')).to.equal('close');
    expect(svg.getAttribute('viewBox')).to.equal('0 0 24 24');
    expect(svg.getAttribute('fill')).to.equal('none');
    expect(svg.getAttribute('stroke')).to.equal('currentColor');
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    expect(svg.getAttribute('focusable')).to.equal('false');
    expect(svg.querySelectorAll('path').length).to.equal(2);
  });

  it('sizes: named tokens, integer px, invalid → m', () => {
    expect(tdIcon('check', { size: 's' }).getAttribute('class')).to.contain('td-icon--s');
    const px = tdIcon('check', { size: 32 });
    expect(px.getAttribute('width')).to.equal('32');
    expect(px.getAttribute('class')).to.equal('td-icon');
    expect(tdIcon('check', { size: 999 }).getAttribute('class')).to.contain('td-icon--m');
    expect(tdIcon('check', { size: 'xxl' }).getAttribute('class')).to.contain('td-icon--m');
  });

  it('labelled icon → role=img + aria-label + <title> as text', () => {
    const svg = tdIcon('info', { label: '<b>Thông tin</b>' });
    expect(svg.getAttribute('role')).to.equal('img');
    expect(svg.getAttribute('aria-label')).to.equal('<b>Thông tin</b>');
    expect(svg.querySelector('title').textContent).to.equal('<b>Thông tin</b>');
    expect(svg.querySelector('b')).to.equal(null);
    expect(svg.hasAttribute('aria-hidden')).to.equal(false);
  });

  it('extra classes are sanitised', () => {
    const svg = tdIcon('check', { class: 'ok bad"x <y> also-ok' });
    expect(svg.getAttribute('class')).to.equal('td-icon td-icon--m ok also-ok');
  });

  it('unknown name → null', () => {
    expect(tdIcon('does-not-exist')).to.equal(null);
  });

  it('core set is present', () => {
    for (const n of ['close', 'prev', 'next', 'fullscreen', 'download', 'back', 'info', 'star']) {
      expect(hasIcon(n)).to.equal(true);
    }
    expect(listIcons().length).to.be.at.least(20);
  });

  it('0.17.0 CMS icons render (Lucide geometry, stroke paint)', () => {
    const expected = { trash: 5, pencil: 2, copy: 2, 'log-out': 3, menu: 3, 'rotate-cw': 2, 'zoom-out': 3 };
    for (const [n, count] of Object.entries(expected)) {
      expect(hasIcon(n), n).to.equal(true);
      const svg = tdIcon(n);
      expect(svg.getAttribute('data-icon')).to.equal(n);
      expect(svg.getAttribute('viewBox')).to.equal('0 0 24 24');
      expect(svg.getAttribute('stroke')).to.equal('currentColor');
      expect(svg.children.length, n).to.equal(count);
    }
    expect(tdIcon('copy').querySelector('rect').getAttribute('rx')).to.equal('2');
  });
});

describe('registerIcons', () => {
  it('registers a valid site icon (fill paint)', () => {
    registerIcons({ 'site-dot': { paint: 'fill', nodes: [['circle', { cx: 12, cy: 12, r: 4 }]] } });
    const svg = tdIcon('site-dot');
    expect(svg.getAttribute('fill')).to.equal('currentColor');
    expect(svg.querySelector('circle').getAttribute('r')).to.equal('4');
  });

  it('rejects collisions, bad names and anything outside the allowlist (all-or-nothing)', () => {
    const bad = [
      [{ close: { nodes: [['path', { d: 'M0 0' }]] } }, /already exists/],
      [{ 'Bad Name': { nodes: [['path', { d: 'M0 0' }]] } }, /invalid name/],
      [{ 'site-a': { nodes: [['script', {}]] } }, /not allowed/],
      [{ 'site-b': { nodes: [['use', { href: '#x' }]] } }, /not allowed/],
      [{ 'site-c': { nodes: [['path', { d: 'M0 0', onload: 'alert(1)' }]] } }, /not allowed/],
      [{ 'site-d': { nodes: [['path', { style: 'x' }]] } }, /not allowed/],
      [{ 'site-e': { nodes: [['path', { d: 'M0 0"/><script>' }]] } }, /invalid value/],
      [{ 'site-f': { nodes: [['rect', { x: 'url(#a)' }]] } }, /invalid value/],
      [{ 'site-g': '<svg><path d="M0 0"/></svg>' }, /must be an object/],
      [{ 'site-h': { viewBox: '0 0 24', nodes: [['path', { d: 'M0 0' }]] } }, /viewBox/],
      [{ 'site-ok': { nodes: [['path', { d: 'M1 1' }]] }, 'site-bad': { nodes: [] } }, /non-empty/],
    ];
    for (const [defs, re] of bad) expect(() => registerIcons(defs)).to.throw(re);
    expect(hasIcon('site-ok')).to.equal(false); // the batch with a bad entry registered nothing
  });

  it('definitions are copied + frozen (later mutation of the input has no effect)', () => {
    const def = { nodes: [['path', { d: 'M2 2h4' }]] };
    registerIcons({ 'site-frozen': def });
    def.nodes[0][1].d = 'M0 0"/><script>';
    expect(tdIcon('site-frozen').querySelector('path').getAttribute('d')).to.equal('M2 2h4');
  });
});

describe('<td-icon>', () => {
  it('renders from attributes and re-renders on change', () => {
    const el = document.createElement('td-icon');
    el.setAttribute('name', 'check');
    el.setAttribute('size', 'l');
    document.body.appendChild(el);
    expect(el.querySelector('svg').getAttribute('data-icon')).to.equal('check');
    expect(el.querySelector('svg').getAttribute('class')).to.contain('td-icon--l');
    el.setAttribute('name', 'close');
    expect(el.querySelector('svg').getAttribute('data-icon')).to.equal('close');
    el.remove();
  });

  it('keeps an SSR-rendered matching child (no duplicate)', () => {
    const wrap = document.createElement('div');
    const ssr = tdIcon('check');
    const el = document.createElement('td-icon');
    el.setAttribute('name', 'check');
    el.appendChild(ssr);
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    expect(el.querySelectorAll('svg').length).to.equal(1);
    expect(el.querySelector('svg')).to.equal(ssr);
    wrap.remove();
  });
});

describe('./icons public surface (v0.16.0 D4)', () => {
  it('no longer exports the internal _validateIconDefinition', () => {
    expect('_validateIconDefinition' in iconsModule).to.equal(false);
    expect(typeof iconsModule.registerIcons).to.equal('function');
  });
});

// v0.104.0: variant 'filled' → `<name>-filled` (one fill path), fallback to the outline; slots + <td-icon variant>.
describe('v0.104.0 icon variant filled', () => {
  const FILLED = ['chart-no-axes-column', 'eye', 'clock', 'circle-check', 'circle-pause', 'save', 'corner-right-down',
    'trash', 'home', 'flame', 'calendar-days', 'phone', 'phone-off', 'user-plus', 'user-minus'];

  it('tdIcon(name, { variant: "filled" }) draws the filled icon for all 15', () => {
    for (const n of FILLED) {
      const svg = tdIcon(n, { variant: 'filled' });
      expect(svg.getAttribute('data-icon'), n).to.equal(`${n}-filled`);
      expect(svg.getAttribute('fill'), n).to.equal('currentColor');
      expect(svg.hasAttribute('stroke'), n).to.equal(false);
      expect(svg.querySelectorAll('path').length, n).to.equal(1);
    }
  });

  it('alias + filled resolves through the alias; no filled version → outline without a warning', () => {
    expect(tdIcon('x', { variant: 'filled' }).getAttribute('data-icon')).to.equal('close'); // alias, no filled twin
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned += 1; };
    try {
      const svg = tdIcon('close', { variant: 'filled' });
      expect(svg.getAttribute('data-icon')).to.equal('close');
      expect(svg.getAttribute('stroke')).to.equal('currentColor');
    } finally {
      console.warn = warn;
    }
    expect(warned).to.equal(0);
  });

  it('default / outline / unknown variant → outline; a -filled name renders as is', () => {
    expect(tdIcon('eye').getAttribute('data-icon')).to.equal('eye');
    expect(tdIcon('eye', { variant: 'outline' }).getAttribute('data-icon')).to.equal('eye');
    expect(tdIcon('eye', { variant: 'solid' }).getAttribute('data-icon')).to.equal('eye');
    expect(tdIcon('eye-filled').getAttribute('data-icon')).to.equal('eye-filled');
    expect(hasIcon('eye-filled')).to.equal(true);
  });

  it('a site icon gets a filled variant by registering site-x-filled', () => {
    registerIcons({
      'site-v104': { viewBox: '0 0 24 24', paint: 'stroke', nodes: [['circle', { cx: '12', cy: '12', r: '5' }]] },
      'site-v104-filled': { viewBox: '0 0 24 24', paint: 'fill', nodes: [['circle', { cx: '12', cy: '12', r: '6' }]] },
    });
    expect(tdIcon('site-v104', { variant: 'filled' }).getAttribute('data-icon')).to.equal('site-v104-filled');
  });

  it('fillIconSlots reads data-td-icon-variant', async () => {
    const { fillIconSlots } = iconsModule;
    const root = document.createElement('div');
    root.innerHTML = '<span data-td-icon="trash" data-td-icon-variant="filled"></span><span data-td-icon="trash"></span>';
    fillIconSlots(root);
    const [a, b] = root.querySelectorAll('svg');
    expect(a.getAttribute('data-icon')).to.equal('trash-filled');
    expect(b.getAttribute('data-icon')).to.equal('trash');
  });

  it('<td-icon variant="filled"> renders the filled icon and re-renders on change', () => {
    const el = document.createElement('td-icon');
    el.setAttribute('name', 'clock');
    el.setAttribute('variant', 'filled');
    document.body.appendChild(el);
    expect(el.querySelector('svg').getAttribute('data-icon')).to.equal('clock-filled');
    el.setAttribute('variant', 'outline');
    expect(el.querySelector('svg').getAttribute('data-icon')).to.equal('clock');
    el.remove();
  });

  it('<td-icon variant="filled"> keeps an SSR clock-filled child, replaces an SSR outline child', () => {
    for (const [ssrName, kept] of [['clock-filled', true], ['clock', false]]) {
      const wrap = document.createElement('div');
      const el = document.createElement('td-icon');
      el.setAttribute('name', 'clock');
      el.setAttribute('variant', 'filled');
      const ssr = tdIcon(ssrName);
      el.appendChild(ssr);
      wrap.appendChild(el);
      document.body.appendChild(wrap);
      expect(el.querySelector('svg') === ssr, ssrName).to.equal(kept);
      expect(el.querySelector('svg').getAttribute('data-icon')).to.equal('clock-filled');
      wrap.remove();
    }
  });
});
