import { expect } from '@esm-bundle/chai';
import { tdAvatar, avatarInitial } from './avatar.js';
import { AVATAR_INITIAL_CASES } from './avatar-cases.fixture.js';

// v0.105.0 (plan docs/internal/plans/v0.105.0-avatar.md §Test 2 + 4): the CSS-only `.td-avatar` in Chromium, Firefox AND
// WebKit + the JS helper tdAvatar(). Real signals only (rAF); DOM nodes compared as booleans (a failing chai assertion
// carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
const stage = document.createElement('div');
document.body.appendChild(stage);
const PHOTO = '/test/fixtures/photo.svg';
let extra = null;

/** An UNLAYERED site sheet (CSSOM, CSP-safe): beats every layered kit rule that is not !important. */
function siteCss(text) {
  extra = new CSSStyleSheet();
  extra.replaceSync(text);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, extra];
}

afterEach(() => {
  stage.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  if (extra) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== extra);
  extra = null;
});

async function mount(html) {
  stage.innerHTML = html;
  const imgs = [...stage.querySelectorAll('img')];
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
  await raf();
  await raf();
  return stage.firstElementChild;
}
const box = (el) => el.getBoundingClientRect();

describe('.td-avatar (v0.105.0)', () => {
  it('sizes xs 22 / sm 32 / base 40 / lg 96: square circles, image and empty alike', async () => {
    for (const [mod, px] of [['td-avatar--xs', 22], ['td-avatar--sm', 32], ['', 40], ['td-avatar--lg', 96]]) {
      await mount(`<div><img class="td-avatar ${mod}" src="${PHOTO}" alt="" width="${px}" height="${px}"> <span class="td-avatar ${mod} td-avatar--empty" aria-hidden="true">A</span></div>`);
      for (const el of stage.querySelectorAll('.td-avatar')) {
        const r = box(el);
        expect(Math.round(r.width), `${mod} ${el.tagName} width`).to.equal(px);
        expect(Math.round(r.height), `${mod} ${el.tagName} height`).to.equal(px);
        expect(getComputedStyle(el).borderTopLeftRadius).to.equal('50%');
      }
    }
  });

  it('an unlayered site img { max-width: 100% } does not squash it in a narrow flex row / table cell', async () => {
    siteCss('img { max-width: 100%; height: auto; }'); // the common site reset
    await mount(`<div><div class="row"><img class="td-avatar" src="${PHOTO}" alt="" width="40" height="40"><span>Một cái tên rất dài để ép hàng flex hẹp lại</span></div>
      <table><tr><td class="cell"><img class="td-avatar td-avatar--sm" src="${PHOTO}" alt="" width="32" height="32"></td><td>Một cột chữ rất dài chiếm hết chỗ của bảng hẹp</td></tr></table></div>`);
    const row = stage.querySelector('.row');
    row.style.setProperty('display', 'flex');
    row.style.setProperty('inline-size', '60px');
    stage.querySelector('table').style.setProperty('inline-size', '80px');
    await raf();
    const [a, b] = stage.querySelectorAll('img.td-avatar');
    expect(Math.round(box(a).width)).to.equal(40);
    expect(Math.round(box(a).height)).to.equal(40);
    expect(Math.round(box(b).width)).to.equal(32);
    expect(Math.round(box(b).height)).to.equal(32);
  });

  it('the empty initial sits in the centre', async () => {
    const el = await mount('<span class="td-avatar td-avatar--lg td-avatar--empty" aria-hidden="true">M</span>');
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    const r = box(el);
    expect(Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2)).to.be.below(1.5);
    expect(Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2)).to.be.below(2.5);
    expect(getComputedStyle(el).fontWeight).to.equal('800');
  });

  it('ring: two box-shadow layers (2 + 1 px; xs gap 1.5 px); --td-avatar-ring: none drops it at every size', async () => {
    await mount('<div><span class="td-avatar td-avatar--empty">A</span><span class="td-avatar td-avatar--xs td-avatar--empty">A</span></div>');
    const [m, xs] = stage.querySelectorAll('.td-avatar');
    const sm = getComputedStyle(m).boxShadow;
    expect(sm.match(/\d+(\.\d+)?px/g)).to.deep.equal(['0px', '0px', '0px', '2px', '0px', '0px', '0px', '3px']);
    expect(getComputedStyle(xs).boxShadow).to.include('1.5px').and.include('2.5px');
    siteCss(':root { --td-avatar-ring: none; }');
    await raf();
    expect(getComputedStyle(m).boxShadow).to.equal('none');
    expect(getComputedStyle(xs).boxShadow).to.equal('none');
  });

  it('a site size override wins: .x .td-avatar { --td-avatar-size: 34px }', async () => {
    siteCss('.x .td-avatar { --td-avatar-size: 34px; }');
    const el = await mount('<div class="x"><span class="td-avatar td-avatar--sm td-avatar--empty">A</span></div>');
    expect(Math.round(box(el.firstElementChild).width)).to.equal(34);
  });

  it('the dark theme re-resolves the empty colours', async () => {
    const el = await mount('<span class="td-avatar td-avatar--empty">A</span>');
    const light = getComputedStyle(el).backgroundColor;
    document.documentElement.setAttribute('data-td-theme', 'dark');
    await raf();
    expect(getComputedStyle(el).backgroundColor).to.not.equal(light);
  });
});

describe('tdAvatar() (v0.105.0)', () => {
  it('image when the src is usable: classes, size, alt, lazy', () => {
    const img = tdAvatar(`${location.origin}${PHOTO}`, 'An', 'sm');
    expect(img.tagName).to.equal('IMG');
    expect(img.className).to.equal('td-avatar td-avatar--sm');
    expect([img.width, img.height, img.alt, img.loading, img.decoding]).to.deep.equal([32, 32, '', 'lazy', 'async']);
    expect(tdAvatar(PHOTO, 'An').className).to.equal('td-avatar');
    expect(tdAvatar(PHOTO, 'An', 'huge').width).to.equal(40);
  });

  it('refused / empty src → the initial span (text, never markup)', () => {
    for (const src of [null, undefined, '', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'mailto:a@b.c']) {
      const el = tdAvatar(src, 'đức', 'lg');
      expect(el.tagName, String(src)).to.equal('SPAN');
      expect(el.className).to.equal('td-avatar td-avatar--lg td-avatar--empty');
      expect(el.getAttribute('aria-hidden')).to.equal('true');
      expect(el.textContent).to.equal('Đ');
    }
    const esc = tdAvatar(null, '<b>x</b>');
    expect(esc.childElementCount).to.equal(0);
    expect(esc.textContent).to.equal('<');
  });

  it('avatarInitial(): the cases shared with PHP Td::avatarInitial()', () => {
    for (const [name, want] of AVATAR_INITIAL_CASES) expect(avatarInitial(name), JSON.stringify(name)).to.equal(want);
  });
});
