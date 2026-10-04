import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse, sendKeys } from '@web/test-runner-commands';
import { TdActionButton } from './td-action-button.js';

// v0.36.0 (plan QĐ 8–14, M3) — <td-action-button> in Chromium, Firefox AND WebKit: presets, tooltip name, tones / sizes,
// inherited disabled / loading / href, registerPreset, name precedence surviving every _syncState(), in-place label,
// forwarded ARIA. Real signals only (rAF, the tooltip's own state) — no fixed sleeps; real mouse / keyboard input.
// DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
const host = document.createElement('div');
document.body.appendChild(host);
const warns = [];
const origWarn = console.warn;
beforeEach(() => { console.warn = (...a) => { warns.push(a.join(' ')); }; });
afterEach(async () => {
  console.warn = origWarn;
  warns.length = 0;
  host.innerHTML = '';
  await resetMouse();
});

function mount(html) {
  host.insertAdjacentHTML('beforeend', html);
  return host.lastElementChild;
}
const ctl = (el) => el.querySelector(':scope > .td-btn');
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
async function until(fn, label, max = 120) {
  for (let i = 0; i < max; i++) { if (fn()) return; await raf(); }
  throw new Error(`timeout: ${label}`);
}

describe('v0.36.0 td-action-button — presets + name', () => {
  it('preset edit → pencil icon, aria-label = data-tooltip = "Chỉnh sửa", no visible text, no label span', () => {
    const el = mount('<td-action-button action="edit"></td-action-button>');
    const c = ctl(el);
    expect(c.localName).to.equal('button');
    expect(c.getAttribute('type')).to.equal('button');
    expect(c.querySelector('svg.td-icon').getAttribute('data-icon')).to.equal('pencil');
    expect(c.getAttribute('aria-label')).to.equal('Chỉnh sửa');
    expect(c.getAttribute('data-tooltip')).to.equal('Chỉnh sửa');
    expect(c.querySelector('.td-btn__label')).to.equal(null);
    expect(c.textContent.trim()).to.equal('');
    expect(c.className).to.equal('td-btn td-btn--action td-btn--action-standard td-btn--action-md');
  });

  it('dcms camelCase alias + every preset renders its registry icon', () => {
    const el = mount('<td-action-button action="sendToPublish"></td-action-button>');
    expect(ctl(el).getAttribute('aria-label')).to.equal('Gửi chờ xuất bản');
    for (const [name, p] of Object.entries(TdActionButton.presets)) {
      const b = mount(`<td-action-button action="${name}"></td-action-button>`);
      expect(ctl(b).querySelector('svg').getAttribute('data-icon'), name).to.equal(p.icon);
      expect(ctl(b).classList.contains(`td-btn--action-${p.tone}`), name).to.equal(true);
    }
  });

  it('real hover → #td-tooltip shows the label; the name is not repeated as a description', async () => {
    const el = mount('<td-action-button action="delete"></td-action-button>');
    const c = ctl(el);
    const r = c.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
    const tip = () => document.getElementById('td-tooltip');
    await until(() => tip() && !tip().hidden, 'tooltip shown');
    expect(tip().textContent.trim()).to.equal('Xoá');
    expect((c.getAttribute('aria-describedby') || '').includes('td-tooltip')).to.equal(false);
    expect(c.getAttribute('aria-label')).to.equal('Xoá');
  });

  it('name precedence host aria-label > label > preset — and in place (same node, focus kept)', async () => {
    const el = mount('<td-action-button action="edit"></td-action-button>');
    const c = ctl(el);
    c.focus();
    el.setAttribute('label', 'Sửa bài');
    expect(ctl(el) === c).to.equal(true);
    expect(document.activeElement === c).to.equal(true);
    expect(c.getAttribute('aria-label')).to.equal('Sửa bài');
    el.setAttribute('aria-label', 'Sửa bài số 7');
    expect(c.getAttribute('aria-label')).to.equal('Sửa bài số 7');
    expect(c.getAttribute('data-tooltip')).to.equal('Sửa bài số 7');
    el.removeAttribute('aria-label');
    expect(c.getAttribute('aria-label')).to.equal('Sửa bài');
    el.label = null; // property reflects the attribute
    expect(el.hasAttribute('label')).to.equal(false);
    expect(c.getAttribute('aria-label')).to.equal('Chỉnh sửa');
    expect(c.getAttribute('data-tooltip')).to.equal('Chỉnh sửa');
    expect(ctl(el) === c && document.activeElement === c).to.equal(true);
  });

  it('every _syncState() keeps the name: disabled / loading / href change / host aria-label removed', () => {
    const el = mount('<td-action-button action="view" href="/a" aria-label="Xem bài 1"></td-action-button>');
    const name = () => ctl(el).getAttribute('aria-label');
    el.setAttribute('disabled', '');
    expect(name()).to.equal('Xem bài 1');
    el.removeAttribute('disabled');
    el.setAttribute('loading', '');
    expect(name()).to.equal('Xem bài 1');
    el.removeAttribute('loading');
    el.setAttribute('href', '/b');
    expect(ctl(el).getAttribute('href')).to.equal('/b');
    expect(name()).to.equal('Xem bài 1');
    el.removeAttribute('aria-label');
    expect(name()).to.equal('Xem chi tiết');
    expect(ctl(el).getAttribute('data-tooltip')).to.equal('Xem chi tiết');
  });
});

describe('v0.36.0 td-action-button — tones, sizes, look', () => {
  it('sizes 32 / 36 / 40 px square (mouse), icon 16 / 18 / 20 px', async () => {
    const want = { sm: [32, 16], md: [36, 18], lg: [40, 20] };
    for (const [size, [box, icon]] of Object.entries(want)) {
      const el = mount(`<td-action-button action="edit" size="${size}"></td-action-button>`);
      await raf();
      const r = ctl(el).getBoundingClientRect();
      expect(Math.abs(r.width - box), `${size} width ${r.width}`).to.be.below(0.5);
      expect(Math.abs(r.height - box), `${size} height ${r.height}`).to.be.below(0.5);
      const i = ctl(el).querySelector('svg').getBoundingClientRect();
      expect(Math.abs(i.width - icon), `${size} icon ${i.width}`).to.be.below(0.5);
    }
  });

  it('tones: transparent fill, no shadow, icon colour per tone; tone attr overrides the preset', () => {
    const cases = [['edit', '', '#45454b'], ['remove', '', '#b45309'], ['delete', '', '#b91c1c'], ['delete', 'standard', '#45454b'], ['edit', 'danger', '#b91c1c'], ['edit', 'bogus', '#45454b']];
    for (const [action, tone, color] of cases) {
      const el = mount(`<td-action-button action="${action}"${tone ? ` tone="${tone}"` : ''}></td-action-button>`);
      const cs = getComputedStyle(ctl(el));
      expect(cs.color, `${action}/${tone}`).to.equal(rgb(color));
      expect(cs.backgroundColor, `${action}/${tone}`).to.equal('rgba(0, 0, 0, 0)');
      expect(cs.boxShadow, `${action}/${tone}`).to.equal('none');
    }
  });

  it('variant / color / full-width are ignored (no td-btn--primary, no inline style, no custom class)', () => {
    const el = mount('<td-action-button action="edit" variant="primary" color="#ff0000" full-width></td-action-button>');
    expect(ctl(el).className).to.equal('td-btn td-btn--action td-btn--action-standard td-btn--action-md');
    expect(el.hasAttribute('style')).to.equal(false);
    expect(ctl(el).hasAttribute('style')).to.equal(false);
  });

  it('keyboard focus shows the kit focus ring (box-shadow ≠ none)', async () => {
    mount('<button id="before">x</button>');
    const el = mount('<td-action-button action="edit"></td-action-button>');
    document.getElementById('before').focus();
    await sendKeys({ press: 'Tab' });
    // WebKit (macOS default): Tab skips buttons — a keyboard-initiated programmatic focus is focus-visible there too
    if (document.activeElement !== ctl(el)) ctl(el).focus();
    expect(document.activeElement === ctl(el)).to.equal(true);
    expect(ctl(el).matches(':focus-visible')).to.equal(true);
    expect(getComputedStyle(ctl(el)).boxShadow).to.not.equal('none');
  });
});

describe('v0.36.0 td-action-button — inherited states', () => {
  it('disabled → native disabled, transparent; loading → aria-busy + spinner, click swallowed', () => {
    const el = mount('<td-action-button action="delete" disabled></td-action-button>');
    expect(ctl(el).disabled).to.equal(true);
    expect(getComputedStyle(ctl(el)).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    el.disabled = false;
    el.loading = true;
    expect(ctl(el).getAttribute('aria-busy')).to.equal('true');
    expect(el.querySelector('.td-btn__spinner').hidden).to.equal(false);
    let clicks = 0;
    el.addEventListener('click', () => clicks++);
    ctl(el).click();
    expect(clicks).to.equal(0);
  });

  it('href → <a> with target/_blank rel; disabled link inert; unsafe href dropped', () => {
    const el = mount('<td-action-button action="open" href="https://example.com/" target="_blank"></td-action-button>');
    const a = ctl(el);
    expect(a.localName).to.equal('a');
    expect(a.getAttribute('href')).to.equal('https://example.com/');
    expect(a.getAttribute('rel')).to.equal('noopener noreferrer');
    el.setAttribute('disabled', '');
    expect(a.hasAttribute('href')).to.equal(false);
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    const bad = mount('<td-action-button action="open" href="javascript:alert(1)"></td-action-button>');
    expect(ctl(bad).hasAttribute('href')).to.equal(false);
  });

  it('aria-pressed / aria-expanded forwarded; aria-labelledby not', () => {
    mount('<span id="lbl">Khác</span>');
    const el = mount('<td-action-button action="edit" aria-pressed="true" aria-expanded="false" aria-labelledby="lbl"></td-action-button>');
    expect(ctl(el).getAttribute('aria-pressed')).to.equal('true');
    expect(ctl(el).getAttribute('aria-expanded')).to.equal('false');
    expect(ctl(el).hasAttribute('aria-labelledby')).to.equal(false);
    expect(ctl(el).getAttribute('aria-label')).to.equal('Chỉnh sửa');
  });
});

describe('v0.36.0 td-action-button — registry + structural changes', () => {
  it('registerPreset validates (TypeError) and a new host uses the preset', () => {
    expect(() => TdActionButton.registerPreset('Bad Name', { icon: 'star', label: 'x' })).to.throw(TypeError);
    expect(() => TdActionButton.registerPreset('pin', { icon: 'star', label: '  ' })).to.throw(TypeError);
    expect(() => TdActionButton.registerPreset('pin', { icon: 'star', label: 'Ghim', tone: 'loud' })).to.throw(TypeError);
    expect(() => TdActionButton.registerPreset('pin', { icon: 'khong-co-icon', label: 'Ghim' })).to.throw(TypeError);
    TdActionButton.registerPreset('pin-v036', { icon: 'star', label: 'Ghim', tone: 'warning' });
    const el = mount('<td-action-button action="pin-v036"></td-action-button>');
    expect(ctl(el).getAttribute('aria-label')).to.equal('Ghim');
    expect(ctl(el).classList.contains('td-btn--action-warning')).to.equal(true);
  });

  it('unknown action → nothing rendered + ONE warning per name; icon + label make it render', () => {
    const a = mount('<td-action-button action="khong-ton-tai-v036"></td-action-button>');
    mount('<td-action-button action="khong-ton-tai-v036"></td-action-button>');
    expect(a.children.length).to.equal(0);
    expect(warns.filter((w) => w.includes('khong-ton-tai-v036')).length).to.equal(1);
    a.setAttribute('icon', 'star');
    expect(a.children.length).to.equal(0);
    a.setAttribute('label', 'Ghim');
    expect(ctl(a).getAttribute('aria-label')).to.equal('Ghim');
    const proto = mount('<td-action-button action="constructor"></td-action-button>'); // never walks the prototype
    expect(proto.children.length).to.equal(0);
  });

  it('action / tone / size / icon change → re-render with the right icon; registerPreset after render keeps old hosts', () => {
    TdActionButton.registerPreset('swap-v036', { icon: 'star', label: 'Một' });
    const el = mount('<td-action-button action="swap-v036"></td-action-button>');
    const before = ctl(el);
    TdActionButton.registerPreset('swap-v036', { icon: 'trash', label: 'Hai' });
    expect(ctl(el) === before).to.equal(true);
    expect(ctl(el).getAttribute('aria-label')).to.equal('Một');
    el.action = 'delete';
    expect(ctl(el) === before).to.equal(false);
    expect(ctl(el).querySelector('svg').getAttribute('data-icon')).to.equal('trash');
    expect(ctl(el).getAttribute('aria-label')).to.equal('Xoá');
    el.size = 'lg';
    expect(ctl(el).classList.contains('td-btn--action-lg')).to.equal(true);
    el.icon = 'star';
    expect(ctl(el).querySelector('svg').getAttribute('data-icon')).to.equal('star');
    el.action = 'swap-v036';
    expect(ctl(el).getAttribute('aria-label')).to.equal('Hai');
  });

  it('a control modified while detached is re-rendered on re-connect (canRebind)', () => {
    const el = mount('<td-action-button action="edit"></td-action-button>');
    const c = ctl(el);
    el.remove();
    c.setAttribute('onclick', 'window.__pwnedV036 = 1');
    host.appendChild(el);
    expect(ctl(el) === c).to.equal(false);
    expect(ctl(el).hasAttribute('onclick')).to.equal(false);
    const kept = ctl(el);
    el.remove();
    host.appendChild(el);
    expect(ctl(el) === kept).to.equal(true);
  });
});
