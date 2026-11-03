import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, sendKeys } from '@web/test-runner-commands';

// v0.95.0 (plan docs/internal/plans/v0.95.0-card.md §11.2) — the CSS-only `.td-card` in Chromium, Firefox AND WebKit.
// Markup by hand = the PHP td_card() tree. This file is in POINTER_FILES (web-test-runner.config.js): headless Firefox only
// updates :hover for the focused page, so a real-hover file cannot share a browser with other files. Real signals only
// (rAF; conditions, never fixed sleeps). DOM nodes are compared as booleans (a failing chai assertion carrying DOM
// nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
// macOS WebKit: Tab skips links unless the "tab to links" option — Option+Tab moves through them (same as the other suites)
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
const stage = document.createElement('div');
document.body.appendChild(stage);

afterEach(async () => {
  stage.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  document.activeElement?.blur?.();
  await resetMouse();
});

async function until(fn, label, max = 120) {
  for (let i = 0; i < max; i++) { if (fn()) return; await raf(); }
  throw new Error(`timeout: ${label}`);
}

const PHOTO = '/test/fixtures/photo.svg';
const ICON = '<svg class="td-icon td-icon--l" data-icon="image" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
const RATIOS = { '': 4 / 3, '1x1': 1, '4x3': 4 / 3, '3x2': 3 / 2, '16x9': 16 / 9, '3x4': 3 / 4 };

/** The tree of plan §5, whitespace between the children like the PHP helper prints it. */
function html({ tag = 'a', cls = '', title = 'Tết 2026', img = 'photo', badges = [], meta = ['42 ảnh', '12/02/2026'], href = '#tet' } = {}) {
  const media = img === 'photo' ? `<img src="${PHOTO}" alt="" loading="lazy" decoding="async" width="640" height="480">`
    : img === 'picture' ? `<picture><source type="image/svg+xml" srcset="${PHOTO}"><img src="${PHOTO}" alt=""></picture>`
      : img === 'broken' ? '<img src="/test/fixtures/does-not-exist.jpg" alt="">'
        : `<span class="td-card__placeholder" aria-hidden="true">${ICON}</span>`;
  const b = badges.length ? ` <span class="td-card__badges">${badges.map((x) => `<span class="td-badge td-badge--danger">${x}</span>`).join(' ')}</span>` : '';
  const m = meta.length ? ` <span class="td-card__meta">${meta.map((x) => `<span>${x}</span>`).join(' <span class="td-card__sep" aria-hidden="true">·</span> ')}</span>` : '';
  const h = tag === 'a' ? ` href="${href}"` : '';
  return `<${tag} class="td-card${cls ? ` ${cls}` : ''}"${h}><span class="td-card__media">${media}</span> <span class="td-card__body"><span class="td-card__title">${title}</span>${b}${m}</span></${tag}>`;
}
const mount = (inner, width = 280) => {
  stage.innerHTML = `<div id="host" class="card-host">${inner}</div>`;
  const host = stage.querySelector('#host');
  host.style.width = `${width}px`; // test harness only (the strict-CSP gate runs elsewhere)
  return host;
};
const cs = (el, p) => getComputedStyle(el)[p];
const imgLoaded = (host) => [...host.querySelectorAll('img')].every((i) => i.complete);

describe('.td-card (v0.95.0, CSS only)', () => {
  it('1 the media box follows the ratio token (default + 5 modifiers); img and picture > img fill it', async () => {
    for (const [k, ratio] of Object.entries(RATIOS)) {
      for (const img of ['photo', 'picture']) {
        const host = mount(html({ cls: k ? `td-card--ratio-${k}` : '', img }));
        await until(() => imgLoaded(host), 'img');
        const media = host.querySelector('.td-card__media').getBoundingClientRect();
        expect(Math.abs(media.width / media.height - ratio), `${k || 'default'} ${img}`).to.be.below(0.03);
        const im = host.querySelector('img').getBoundingClientRect();
        expect(Math.abs(im.width - (media.width - 2)), `${k} ${img} w`).to.be.below(1.5);
        expect(Math.abs(im.height - (media.height - 2)), `${k} ${img} h`).to.be.below(1.5);
        expect(im.left >= media.left - 0.5 && im.right <= media.right + 0.5 && im.top >= media.top - 0.5 && im.bottom <= media.bottom + 0.5).to.equal(true);
      }
    }
  });

  it('2 no image: the placeholder fills the box, icon centred; a broken image keeps the box and the media background', async () => {
    let host = mount(html({ img: 'none' }));
    let media = host.querySelector('.td-card__media').getBoundingClientRect();
    expect(Math.abs(media.width / media.height - 4 / 3)).to.be.below(0.03);
    const ph = host.querySelector('.td-card__placeholder').getBoundingClientRect();
    const ic = host.querySelector('.td-card__placeholder svg').getBoundingClientRect();
    expect(Math.abs((ic.left + ic.right) / 2 - (ph.left + ph.right) / 2)).to.be.below(1.5);
    expect(Math.abs((ic.top + ic.bottom) / 2 - (ph.top + ph.bottom) / 2)).to.be.below(1.5);
    host = mount(html({ img: 'broken' }));
    const img = host.querySelector('img');
    await until(() => img.complete, 'broken img settles');
    media = host.querySelector('.td-card__media');
    expect(Math.abs(media.getBoundingClientRect().width / media.getBoundingClientRect().height - 4 / 3)).to.be.below(0.03);
    expect(cs(media, 'backgroundColor')).to.not.equal('rgba(0, 0, 0, 0)');
  });

  it('3 badges sit inside the media box; two badges wrap and stay inside the card', async () => {
    const host = mount(html({ badges: ['Live', 'Riêng tư', 'Một nhãn rất dài để buộc phải xuống dòng'] }), 200);
    await until(() => imgLoaded(host), 'img');
    const media = host.querySelector('.td-card__media').getBoundingClientRect();
    const card = host.querySelector('.td-card').getBoundingClientRect();
    for (const b of host.querySelectorAll('.td-badge')) {
      const r = b.getBoundingClientRect();
      expect(r.left >= media.left - 0.5 && r.right <= media.right + 0.5 && r.top >= media.top - 0.5, b.textContent).to.equal(true);
      expect(r.right <= card.right + 0.5 && r.left >= card.left - 0.5).to.equal(true);
    }
  });

  it('4 title clamps at the token line count; meta stays on one line; an unbroken string does not overflow', async () => {
    const host = mount(html({ title: 'Một tiêu đề album rất dài '.repeat(10), meta: ['một dòng meta rất dài rất dài rất dài rất dài rất dài', '12/02/2026'] }), 200);
    const title = host.querySelector('.td-card__title');
    const lh = parseFloat(cs(title, 'lineHeight'));
    expect(title.getBoundingClientRect().height).to.be.below(lh * 2 + 2);
    expect(title.getBoundingClientRect().height).to.be.above(lh * 1.5);
    const meta = host.querySelector('.td-card__meta');
    expect(meta.getBoundingClientRect().height).to.be.below(parseFloat(cs(meta, 'lineHeight')) + 2);
    expect(meta.scrollWidth).to.be.above(meta.clientWidth);
    const long = mount(html({ title: 'x'.repeat(200) }), 160);
    const card = long.querySelector('.td-card');
    expect(card.scrollWidth).to.be.at.most(card.clientWidth + 1);
    expect(long.querySelector('.td-card__title').getBoundingClientRect().right).to.be.at.most(card.getBoundingClientRect().right + 1);
  });

  it('5 focus by keyboard draws the ring around the card; a mouse press does not', async () => {
    const host = mount(html());
    const a = host.querySelector('a');
    await sendKeys({ press: TAB });
    await until(() => document.activeElement === a, 'tab focus');
    const ring = getComputedStyle(document.documentElement).getPropertyValue('--td-focus-ring').trim();
    expect(ring).to.not.equal('');
    expect(cs(a, 'boxShadow')).to.not.equal('none');
    expect(cs(a, 'outlineStyle')).to.equal('solid'); // transparent outline kept for forced colours
    a.blur();
    await until(() => document.activeElement !== a, 'blur');
    expect(cs(a, 'boxShadow')).to.equal('none');
    const r = host.querySelector('.td-card__media').getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + 20), Math.round(r.top + 20)] });
    await raf(); await raf();
    expect(cs(a, 'boxShadow')).to.equal('none'); // :focus-visible does not match a pointer focus
  });

  it('6 real hover: bare changes the image edge, surface a solid fill; never a transform; a static card ignores it', async () => {
    const host = mount(`${html({ title: 'Bare' })}${html({ title: 'Surface', cls: 'td-card--surface' })}${html({ tag: 'div', title: 'Static' })}`, 280);
    await until(() => imgLoaded(host), 'img');
    const [bare, surf, stat] = host.querySelectorAll('.td-card');
    const edge = (c) => cs(c.querySelector('.td-card__media'), 'borderTopColor');
    const bareRest = edge(bare);
    const surfRest = cs(surf, 'backgroundColor');
    const statRest = edge(stat);
    expect(cs(stat, 'cursor')).to.not.equal('pointer');
    expect(cs(bare, 'cursor')).to.equal('pointer');
    const at = (c) => { const r = c.querySelector('.td-card__media').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
    await sendMouse({ type: 'move', position: at(bare) });
    await until(() => edge(bare) !== bareRest, 'bare edge changes');
    expect(cs(bare, 'transform')).to.equal('none');
    expect(cs(bare.querySelector('.td-card__media'), 'transform')).to.equal('none');
    await sendMouse({ type: 'move', position: at(surf) });
    await until(() => cs(surf, 'backgroundColor') !== surfRest, 'surface fill changes');
    const hoverBg = getComputedStyle(surf).getPropertyValue('--td-card-hover-bg');
    expect(hoverBg).to.not.equal('');
    expect(cs(surf, 'transform')).to.equal('none');
    await sendMouse({ type: 'move', position: at(stat) });
    await raf(); await raf();
    expect(edge(stat)).to.equal(statRest);
    expect(cs(stat, 'transform')).to.equal('none');
  });

  it('7 inside a container-type grid at 160 / 280 / 720: the card never overflows its cell, the media follows the column', async () => {
    for (const w of [160, 280, 720]) {
      stage.innerHTML = '<div id="grid" class="card-grid"></div>';
      const grid = stage.querySelector('#grid');
      grid.style.cssText = `container-type:inline-size;width:${w}px;`;
      grid.innerHTML = `<div class="td-card-grid">${html()}${html({ cls: 'td-card--surface' })}</div>`;
      await until(() => imgLoaded(grid), 'img');
      for (const c of grid.querySelectorAll('.td-card')) {
        const r = c.getBoundingClientRect();
        expect(r.right <= grid.getBoundingClientRect().right + 0.5, `${w}`).to.equal(true);
        const m = c.querySelector('.td-card__media').getBoundingClientRect();
        expect(Math.abs(m.width - (r.width - (c.classList.contains('td-card--surface') ? 2 : 0))), `${w} media width`).to.be.below(1.5);
      }
    }
  });

  it('8 dark theme: title / meta / surface colours come from the dark tokens', async () => {
    const host = mount(html({ cls: 'td-card--surface' }));
    const card = host.querySelector('.td-card');
    const light = { bg: cs(card, 'backgroundColor'), title: cs(host.querySelector('.td-card__title'), 'color') };
    const probe = document.createElement('span');
    probe.style.color = 'var(--td-card-bg)';
    host.appendChild(probe);
    document.documentElement.setAttribute('data-td-theme', 'dark');
    // the surface fill has a background-color transition (--td-dur-fast): wait for its END = the dark --td-card-bg
    await until(() => cs(probe, 'color') !== light.bg && cs(card, 'backgroundColor') === cs(probe, 'color'), 'dark background');
    expect(cs(host.querySelector('.td-card__title'), 'color')).to.not.equal(light.title);
    expect(cs(probe, 'color')).to.equal(cs(card, 'backgroundColor'));
  });

  it('9 the link stays a native link: a click is not prevented, href unchanged, one tab stop', async () => {
    const host = mount(html({ href: '#card-target' }));
    const a = host.querySelector('a');
    let prevented = null;
    host.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault(); }, true);
    a.click();
    expect(prevented).to.equal(false);
    expect(a.getAttribute('href')).to.equal('#card-target');
    expect(host.querySelectorAll('a, button, [tabindex]').length).to.equal(1);
    expect(a.tabIndex).to.equal(0);
    expect(host.querySelector('.td-card__title').closest('a') === a).to.equal(true);
  });

  it('10 the link name reads title, badge, meta with the separator hidden', async () => {
    const host = mount(html({ badges: ['Live'] }));
    const a = host.querySelector('a');
    const name = a.textContent.replace(/\s+/g, ' ').trim();
    expect(name).to.equal('Tết 2026 Live 42 ảnh · 12/02/2026');
    expect(host.querySelector('.td-card__sep').getAttribute('aria-hidden')).to.equal('true');
  });
});
