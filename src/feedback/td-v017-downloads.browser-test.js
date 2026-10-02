import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdMenu, sanitizeDownloadName } from './td-menu.js';
import { TdLightbox, defaultIsAllowedUrl } from './td-lightbox.js';

// v0.17.0 E5a (TdMenu download items + caller URL policy) and E6 (lightbox `downloads` variants).
// Plan: docs/internal/plans/v0.17.0-135-feedback.md.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

// Never let a test actually download / navigate: cancel the default action of any <a> click (capture phase —
// component click handlers still run).
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault();
}, true);

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
});
const ok = (cond, msg) => expect(!!cond, msg).to.equal(true);
const menuEl = () => document.querySelector('body > .td-menu');
const menuItems = () => [...(menuEl()?.querySelectorAll('.td-menu__item') || [])];
const lb = () => document.querySelector('.td-lightbox');
const dlLink = () => lb().querySelector('[data-action="download"]');
const dlMenuBtn = () => lb().querySelector('[data-action="downloads"]');
const IMG = (n) => `/test/fixtures/${n}.svg`;
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};

function btn(label = 'Mở') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  host.appendChild(b);
  return b;
}

const warn = console.warn;
beforeEach(() => { console.warn = () => {}; });
afterEach(async () => {
  console.warn = warn;
  TdMenu.close();
  TdLightbox.close();
  host.replaceChildren();
  document.querySelectorAll('body > .td-menu').forEach((m) => m.remove());
  await resetMouse();
  await wait(20);
});

describe('v0.17 E5a — sanitizeDownloadName', () => {
  it('drops reserved / control characters, trims dots and spaces, caps the length', () => {
    expect(sanitizeDownloadName('a/b\\c:d*e?f"g<h>i|j.jpg')).to.equal('abcdefghij.jpg');
    expect(sanitizeDownloadName('bad\u0000\u001f\u007fname.png')).to.equal('badname.png');
    expect(sanitizeDownloadName('  ..hidden.  ')).to.equal('hidden');
    expect(sanitizeDownloadName('../../etc/passwd')).to.equal('etcpasswd');
    expect(sanitizeDownloadName('ảnh gốc.jpg')).to.equal('ảnh gốc.jpg');
    expect(sanitizeDownloadName('x'.repeat(500))).to.have.length(200);
    expect(sanitizeDownloadName('///')).to.equal('');
    expect(sanitizeDownloadName(42)).to.equal('');
  });
});

describe('v0.17 E5a — TdMenu download items', () => {
  it('download: true → bare download attr; a string → the sanitised file name', () => {
    const b = btn();
    TdMenu.open(b, [
      { label: 'Gốc', href: '/a/original.jpg', download: true },
      { label: 'Nhỏ', href: '/a/small.jpg', download: 'nho/../:*ảnh.jpg' },
      { label: 'Xem', href: '/a/view' },
      { label: 'Rỗng', href: '/a/empty.jpg', download: '///' },
    ]);
    const [a, c, v, e] = menuItems();
    expect(a.localName).to.equal('a');
    expect(a.getAttribute('download')).to.equal('');
    expect(c.getAttribute('download')).to.equal('nho..ảnh.jpg');
    expect(v.hasAttribute('download')).to.equal(false);
    expect(e.getAttribute('download')).to.equal(''); // nothing usable → the browser names the file
  });

  it('download is ignored on items without an href and on blocked hrefs', () => {
    const b = btn();
    TdMenu.open(b, [
      { label: 'Nút', onSelect() {}, download: 'x.jpg' },
      { label: 'Chặn', href: 'javascript:alert(1)', download: 'x.jpg' },
    ]);
    const [n, j] = menuItems();
    expect(n.localName).to.equal('button');
    expect(n.hasAttribute('download')).to.equal(false);
    expect(j.localName).to.equal('button');
    expect(j.getAttribute('aria-disabled')).to.equal('true');
    expect(j.hasAttribute('download')).to.equal(false);
  });

  it('default filter blocks blob:; a caller isAllowedUrl that allows it lets it through', () => {
    const blobUrl = URL.createObjectURL(new Blob(['x'], { type: 'text/plain' }));
    const b = btn();
    TdMenu.open(b, [{ label: 'Blob', href: blobUrl, download: 'x.txt' }]);
    expect(menuItems()[0].localName).to.equal('button');
    expect(menuItems()[0].getAttribute('aria-disabled')).to.equal('true');
    TdMenu.close();

    const seen = [];
    const policy = (url) => { seen.push(url); return url.startsWith('blob:') || defaultIsAllowedUrl(url); };
    TdMenu.open(b, [{ label: 'Blob', href: blobUrl, download: 'x.txt' }], { isAllowedUrl: policy });
    const a = menuItems()[0];
    expect(a.localName).to.equal('a');
    expect(a.getAttribute('href')).to.equal(blobUrl);
    expect(a.getAttribute('download')).to.equal('x.txt');
    expect(seen).to.deep.equal([blobUrl]);
    URL.revokeObjectURL(blobUrl);
  });

  it('the caller policy REPLACES the default: it can block https; a throw blocks; javascript: always blocked', () => {
    const b = btn();
    TdMenu.open(b, [
      { label: 'Https', href: 'https://example.com/a.jpg', download: true },
      { label: 'Ném', href: '/boom.jpg', download: true },
      { label: 'JS', href: ' JavaScript:alert(1)', download: true },
      { label: 'Ok', href: '/ok.jpg', download: true },
    ], {
      isAllowedUrl: (url) => {
        if (url.includes('boom')) throw new Error('policy');
        return !url.startsWith('https:');
      },
    });
    const [h, t, j, k] = menuItems();
    for (const n of [h, t, j]) {
      expect(n.localName).to.equal('button');
      expect(n.getAttribute('aria-disabled')).to.equal('true');
    }
    expect(k.localName).to.equal('a');
    expect(k.getAttribute('href')).to.equal('/ok.jpg');
  });

  it('bind() passes isAllowedUrl through; keyboard opens, moves between links and Escape closes', async () => {
    const b = btn('Tải');
    const blobUrl = URL.createObjectURL(new Blob(['y']));
    const unbind = TdMenu.bind(b, () => [
      { label: 'Một', href: blobUrl, download: 'mot.txt' },
      { label: 'Hai', href: '/hai.txt', download: true },
    ], { isAllowedUrl: (url) => url.startsWith('blob:') || defaultIsAllowedUrl(url) });
    b.focus();
    await sendKeys({ press: 'ArrowDown' });
    ok(TdMenu.isOpen(b), 'open');
    const [one, two] = menuItems();
    expect(one.localName).to.equal('a');
    expect(one.getAttribute('download')).to.equal('mot.txt');
    ok(document.activeElement === one, 'focus on first');
    await sendKeys({ press: 'ArrowDown' });
    ok(document.activeElement === two, 'focus on second');
    await sendKeys({ press: 'Escape' });
    ok(!TdMenu.isOpen(), 'closed');
    ok(document.activeElement === b, 'focus back on trigger');
    unbind();
    URL.revokeObjectURL(blobUrl);
  });

  it('activating a download link (Space) closes the menu with reason select', async () => {
    const b = btn('Tải');
    const reasons = [];
    TdMenu.open(b, [{ label: 'Một', href: '/mot.txt', download: true }], { onClose: (r) => reasons.push(r) });
    await sendKeys({ press: ' ' });
    await wait(10);
    ok(!TdMenu.isOpen(), 'closed');
    expect(reasons).to.deep.equal(['select']);
  });
});

describe('v0.17 E6 — lightbox downloads', () => {
  const two = (item) => [
    { label: 'Ảnh gốc', url: `${item.src}?size=orig`, filename: 'goc.svg' },
    { label: 'Ảnh nhỏ', url: `${item.src}?size=small`, filename: 'nho.svg' },
  ];

  it('0 after filtering → no download control', () => {
    TdLightbox.open([IMG(1)], { downloads: () => [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'y', url: 'data:,x' }] });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'both hidden');
    ok(!dlLink().hasAttribute('href'), 'no href');
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { downloads: () => [] });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'empty → hidden');
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { downloads: () => { throw new Error('hook'); } });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'throw → hidden');
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { downloads: () => 'nope' });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'non-array → hidden');
  });

  it('1 after filtering → plain download link with the (sanitised) filename, or the URL name', () => {
    TdLightbox.open([IMG(1)], {
      downloads: (item) => [{ label: 'Chặn', url: 'javascript:x' }, { label: 'Gốc', url: `${item.src}?o=1`, filename: 'a/b:gốc.svg' }],
    });
    ok(!dlLink().hidden && dlMenuBtn().hidden, 'link shown, menu button hidden');
    expect(dlLink().getAttribute('href')).to.equal(new URL(`${IMG(1)}?o=1`, document.baseURI).href); // v0.24.0: canonical URL
    expect(dlLink().getAttribute('download')).to.equal('abgốc.svg');
    TdLightbox.close();
    TdLightbox.open([IMG(2)], { downloads: () => [{ label: 'Gốc', url: '/files/orig-2.svg' }] });
    expect(dlLink().getAttribute('download')).to.equal('orig-2.svg');
  });

  it('≥ 2 → menu button; the menu has <a download> items with filename (or bare download without one)', async () => {
    TdLightbox.open([IMG(1)], {
      downloads: (item) => [
        { label: 'Gốc', url: `${item.src}?o`, filename: 'goc.svg' },
        { label: 'Không tên', url: '/files/a.svg' },
        { url: '/files/b.svg' },
        { label: 'Chặn', url: 'javascript:alert(1)' },
      ],
    });
    await frames();
    ok(dlLink().hidden && !dlMenuBtn().hidden, 'menu button shown');
    expect(dlMenuBtn().getAttribute('aria-haspopup')).to.equal('menu');
    expect(dlMenuBtn().getAttribute('aria-label')).to.equal('Tải xuống');
    dlMenuBtn().click();
    ok(TdMenu.isOpen(dlMenuBtn()), 'menu open');
    const its = menuItems();
    expect(its.length).to.equal(3);
    ok(its.every((n) => n.localName === 'a' && n.hasAttribute('download')), 'all download links');
    expect(its[0].getAttribute('download')).to.equal('goc.svg');
    expect(its[1].getAttribute('download')).to.equal('');
    expect(its[2].getAttribute('download')).to.equal('');
    expect(its[2].querySelector('.td-menu__label').textContent).to.equal('b.svg'); // no label → name from the URL
  });

  it('downloads wins over download', () => {
    TdLightbox.open([IMG(1)], { download: () => '/single.svg', downloads: two });
    ok(dlLink().hidden && !dlMenuBtn().hidden, 'menu (downloads) wins');
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { download: () => '/single.svg', downloads: () => [] });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'empty downloads still wins (no fallback to download)');
  });

  it('blob: variants work when the site policy allows them (menu uses the lightbox policy)', async () => {
    const b1 = URL.createObjectURL(new Blob(['1']));
    const b2 = URL.createObjectURL(new Blob(['2']));
    const isAllowedUrl = (url) => url.startsWith('blob:') || defaultIsAllowedUrl(url);
    TdLightbox.open([IMG(1)], {
      isAllowedUrl,
      downloads: () => [{ label: 'A', url: b1, filename: 'a.bin' }, { label: 'B', url: b2 }],
    });
    await frames();
    dlMenuBtn().click();
    const its = menuItems();
    expect(its.map((n) => n.getAttribute('href'))).to.deep.equal([b1, b2]);
    expect(its.map((n) => n.getAttribute('download'))).to.deep.equal(['a.bin', '']);
    TdMenu.close();
    TdLightbox.close();
    // Default lightbox policy → blob: filtered out before branching → nothing left.
    TdLightbox.open([IMG(1)], { downloads: () => [{ label: 'A', url: b1 }, { label: 'B', url: b2 }] });
    ok(dlLink().hidden && dlMenuBtn().hidden, 'blocked by the default policy');
    URL.revokeObjectURL(b1);
    URL.revokeObjectURL(b2);
  });

  it('item-dependent policy isAllowedUrl(url, item) is called with the item being viewed (hook filter + menu)', async () => {
    const calls = [];
    const isAllowedUrl = (url, item) => {
      if (url.includes('/private/')) calls.push({ url, priv: item && item.data && item.data.private });
      if (url.includes('/private/') && item && item.data && item.data.private) return false;
      return defaultIsAllowedUrl(url);
    };
    const downloads = () => [
      { label: 'Công khai', url: '/public/a.svg', filename: 'a.svg' },
      { label: 'Riêng', url: '/private/b.svg', filename: 'b.svg' },
      { label: 'Riêng 2', url: '/private/c.svg', filename: 'c.svg' },
    ];
    const h = TdLightbox.open([
      { src: IMG(1), data: { private: true } },
      { src: IMG(2), data: { private: false } },
    ], { isAllowedUrl, downloads });
    await frames();
    // Private item: both /private/ variants blocked → 1 left → plain link.
    ok(!dlLink().hidden && dlMenuBtn().hidden, 'private item → one link');
    expect(dlLink().getAttribute('download')).to.equal('a.svg');
    ok(calls.length === 2 && calls.every((c) => c.priv === true), 'hook filter called with the private item');
    calls.length = 0;
    h.next();
    ok(dlLink().hidden && !dlMenuBtn().hidden, 'public item → menu');
    ok(calls.length === 2 && calls.every((c) => c.priv === false), 'filter called with the public item');
    calls.length = 0;
    dlMenuBtn().click();
    expect(menuItems().length).to.equal(3);
    ok(calls.length === 2 && calls.every((c) => c.priv === false), 'menu policy called with the viewed item');
  });

  it('keyboard: ArrowDown opens + focuses the first variant, arrows move, Escape closes the menu only', async () => {
    TdLightbox.open([IMG(1)], { downloads: two });
    await frames();
    dlMenuBtn().focus();
    await sendKeys({ press: 'ArrowDown' });
    ok(TdMenu.isOpen(dlMenuBtn()), 'open');
    const [a, b] = menuItems();
    ok(document.activeElement === a, 'first focused');
    await sendKeys({ press: 'ArrowDown' });
    ok(document.activeElement === b, 'second focused');
    // ArrowLeft/Right belong to the menu while it is open (the lightbox yields: it is a layer above).
    await sendKeys({ press: 'ArrowRight' });
    expect(TdLightbox.isOpen).to.equal(true);
    await sendKeys({ press: 'Escape' });
    ok(!TdMenu.isOpen(), 'menu closed');
    expect(TdLightbox.isOpen).to.equal(true);
    ok(document.activeElement === dlMenuBtn(), 'focus back on the download button');
    // Enter opens, Enter on a link activates it (default cancelled by the test) and closes the menu.
    await sendKeys({ press: 'Enter' });
    ok(TdMenu.isOpen(dlMenuBtn()), 'reopened');
    await sendKeys({ press: 'Enter' });
    await wait(10);
    ok(!TdMenu.isOpen(), 'closed after choosing');
    expect(TdLightbox.isOpen).to.equal(true);
  });

  it('pointer: clicking the button opens, clicking a variant closes the menu', async () => {
    TdLightbox.open([IMG(1)], { downloads: two });
    await frames();
    await sendMouse({ type: 'click', position: center(dlMenuBtn()) });
    ok(TdMenu.isOpen(dlMenuBtn()), 'open');
    await sendMouse({ type: 'click', position: center(menuItems()[1]) });
    await wait(10);
    ok(!TdMenu.isOpen(), 'closed');
    expect(TdLightbox.isOpen).to.equal(true);
  });

  it('slide change closes the menu; the next slide gets its own variants', async () => {
    const h = TdLightbox.open([IMG(1), IMG(2)], { downloads: two });
    await frames();
    dlMenuBtn().click();
    ok(TdMenu.isOpen(dlMenuBtn()), 'open');
    h.next();
    ok(!TdMenu.isOpen(), 'closed on slide change');
    dlMenuBtn().click();
    expect(menuItems()[0].getAttribute('href')).to.equal(new URL(`${IMG(2)}?size=orig`, document.baseURI).href); // v0.24.0: canonical
  });

  it('closing the lightbox closes the menu (focus restored to the opener)', async () => {
    const opener = btn('Mở ảnh');
    opener.focus();
    TdLightbox.open([IMG(1)], { downloads: two });
    await frames();
    dlMenuBtn().focus();
    await sendKeys({ press: 'ArrowDown' });
    ok(TdMenu.isOpen(dlMenuBtn()), 'open');
    TdLightbox.close();
    ok(!TdMenu.isOpen(), 'menu closed');
    ok(!menuEl(), 'menu removed');
    ok(document.activeElement === opener, 'focus back on the opener');
  });

  it('legacy single `download` hook still works (and the menu button stays hidden)', () => {
    TdLightbox.open([IMG(1)], { download: () => '/dl/one.svg' });
    ok(!dlLink().hidden && dlMenuBtn().hidden, 'link');
    expect(dlLink().getAttribute('download')).to.equal('one.svg');
  });
});
