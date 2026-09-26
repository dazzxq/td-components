import { expect } from '@esm-bundle/chai';
import './td-checkbox.js';
import './td-toggle.js';
import './td-button.js';
import './td-input-field.js';
import { TdButton } from './td-button.js';
import { TdLoading, TdLoadingSpinner } from '../feedback/td-loading.js';
import { TdToast } from '../feedback/td-toast.js';
import { isScrollLocked } from '../utils/scroll-lock.js';
import { sendKeys } from '@web/test-runner-commands';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(() => { host.innerHTML = ''; document.documentElement.removeAttribute('data-td-theme'); TdLoading.hide(); });

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const lum = (c) => TdButton._luminance(c);
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const bgOf = (el) => getComputedStyle(el).backgroundColor;

describe('batch 1 — td-checkbox', () => {
  it('renders the BEM contract with a registry check icon', () => {
    const el = mount('<td-checkbox label="Đồng ý"></td-checkbox>');
    expect(el.querySelector('label.td-checkbox.td-checkbox--md') !== null).to.equal(true);
    expect(el.querySelector('.td-checkbox__input[type="checkbox"]') !== null).to.equal(true);
    expect(el.querySelector('.td-checkbox__mark svg[data-icon="check"]') !== null).to.equal(true);
    expect(el.querySelector('.td-checkbox__label').textContent).to.equal('Đồng ý');
    expect(el.querySelector('[class*="checkmark"]')).to.equal(null); // legacy classes gone
  });

  it('keeps keyboard focus and emits exactly one change per toggle', () => {
    const el = mount('<td-checkbox label="x"></td-checkbox>');
    const input = el.querySelector('.td-checkbox__input');
    const got = [];
    host.addEventListener('change', (e) => got.push(e instanceof CustomEvent ? e.detail : 'native'));
    input.focus();
    input.click();
    expect(got).to.deep.equal([{ checked: true }]);
    expect(document.activeElement === input).to.equal(true);
    expect(el.querySelector('.td-checkbox__input') === input).to.equal(true);
    input.click();
    expect(got).to.deep.equal([{ checked: true }, { checked: false }]);
  });

  it('accessible name: label → host aria-label → external <label for>', () => {
    const a = mount('<td-checkbox label="Nhãn trong"></td-checkbox>');
    expect(a.querySelector('input').hasAttribute('aria-label')).to.equal(false);
    const b = mount('<td-checkbox aria-label="Nhãn aria"></td-checkbox>');
    expect(b.querySelector('input').getAttribute('aria-label')).to.equal('Nhãn aria');
    const wrap = mount('<div><label for="cb-ext">Nhãn ngoài</label><td-checkbox id="cb-ext"></td-checkbox></div>');
    const input = wrap.querySelector('input');
    const ids = input.getAttribute('aria-labelledby');
    expect(!!ids).to.equal(true);
    expect(document.getElementById(ids).textContent).to.equal('Nhãn ngoài');
  });

  it('error contract: setError / error-text / clearError / reset', () => {
    const form = mount('<form><td-checkbox name="c" label="x"></td-checkbox></form>');
    const el = form.querySelector('td-checkbox');
    const input = el.querySelector('input');
    el.setError('Bạn phải đồng ý');
    const note = el.querySelector('.td-field-error');
    expect(note.textContent).to.equal('Bạn phải đồng ý');
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(input.getAttribute('aria-errormessage')).to.equal(note.id);
    el.clearError();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(input.hasAttribute('aria-invalid')).to.equal(false);
    el.setAttribute('error-text', 'Từ server');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
    el.setAttribute('size', 'lg'); // re-render keeps the error
    expect(el.querySelector('.td-field-error').textContent).to.equal('Từ server');
    expect(el.querySelector('input').getAttribute('aria-invalid')).to.equal('true');
    form.reset();
    expect(el.querySelector('.td-field-error')).to.equal(null);
  });

  it('hit target ≥ 24×24 for an unlabeled sm checkbox', () => {
    const el = mount('<td-checkbox size="sm" aria-label="x"></td-checkbox>');
    const r = el.querySelector('label').getBoundingClientRect();
    expect(r.width).to.be.at.least(24);
    expect(r.height).to.be.at.least(24);
  });

  it('unchecked border meets 3:1 non-text contrast', () => {
    const el = mount('<td-checkbox aria-label="x"></td-checkbox>');
    const mark = el.querySelector('.td-checkbox__mark');
    expect(ratio(getComputedStyle(mark).borderTopColor, 'rgb(255, 255, 255)')).to.be.at.least(3);
  });
});

describe('batch 1 — td-toggle (.td-switch)', () => {
  it('renders the switch contract; label names the switch', () => {
    const el = mount('<td-toggle label="Thông báo"></td-toggle>');
    const input = el.querySelector('input.td-switch__input[role="switch"]');
    expect(input !== null).to.equal(true);
    expect(input.closest('label').textContent).to.contain('Thông báo');
    expect(el.querySelector('.td-switch__icon--on svg[data-icon="check"]') !== null).to.equal(true);
    expect(el.querySelector('.td-switch__icon--off svg[data-icon="close"]') !== null).to.equal(true);
  });

  it('controlled: one change with the requested state, native toggle cancelled', () => {
    const el = mount('<td-toggle controlled aria-label="x"></td-toggle>');
    const got = [];
    host.addEventListener('change', (e) => got.push(e instanceof CustomEvent ? e.detail : 'native'));
    el.querySelector('input').click();
    expect(got).to.deep.equal([{ checked: true }]);
    expect(el.querySelector('input').checked).to.equal(false);
    expect(el.hasAttribute('checked')).to.equal(false);
  });

  it('error contract on the switch', () => {
    const el = mount('<td-toggle aria-label="x"></td-toggle>');
    el.setError('Bật để tiếp tục');
    expect(el.querySelector('input').getAttribute('aria-invalid')).to.equal('true');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Bật để tiếp tục');
  });

  it('hit target ≥ 24×24 for an unlabeled sm switch', () => {
    const el = mount('<td-toggle size="sm" aria-label="x"></td-toggle>');
    const r = el.querySelector('label').getBoundingClientRect();
    expect(r.width).to.be.at.least(24);
    expect(r.height).to.be.at.least(24);
  });

  for (const theme of ['light', 'dark']) {
    it(`WCAG 1.4.11 contrasts hold in ${theme} theme`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const page = getComputedStyle(document.documentElement).getPropertyValue('--td-color-bg').trim() || '#fbfbfa';
      const probe = document.createElement('div');
      probe.style.setProperty('background-color', page);
      host.appendChild(probe);
      const pageBg = bgOf(probe);
      const off = mount('<td-toggle aria-label="off"></td-toggle>');
      const on = mount('<td-toggle checked aria-label="on"></td-toggle>');
      await wait(260);
      const offTrack = off.querySelector('.td-switch__track');
      const offThumb = off.querySelector('.td-switch__thumb');
      const onTrack = on.querySelector('.td-switch__track');
      const onThumb = on.querySelector('.td-switch__thumb');
      expect(ratio(getComputedStyle(offTrack).borderTopColor, pageBg), 'off edge vs page').to.be.at.least(3);
      expect(ratio(bgOf(onTrack), pageBg), 'on track vs page').to.be.at.least(3);
      expect(ratio(bgOf(onThumb), bgOf(onTrack)), 'thumb vs on track').to.be.at.least(3);
      expect(ratio(getComputedStyle(offThumb).borderTopColor, bgOf(offTrack)), 'off thumb edge vs track').to.be.at.least(3);
    });
  }
});

describe('batch 1 — td-button', () => {
  it('solid variants (no backdrop-filter) with AA text contrast', () => {
    for (const v of ['primary', 'success', 'danger', 'warning', 'info']) {
      const el = mount(`<td-button variant="${v}">Lưu</td-button>`);
      const b = el.querySelector('button');
      const cs = getComputedStyle(b);
      expect(b.classList.contains(`td-btn--${v}`)).to.equal(true);
      expect(cs.backdropFilter === 'none' || cs.backdropFilter === '').to.equal(true);
      expect(ratio(cs.color, cs.backgroundColor), v).to.be.at.least(4.5);
    }
  });

  it('loading: aria-busy + aria-disabled, focus kept, clicks swallowed, no re-render', () => {
    const el = mount('<td-button>Gửi</td-button>');
    const b = el.querySelector('button');
    let clicks = 0;
    b.addEventListener('click', () => { clicks += 1; });
    b.focus();
    el.setAttribute('loading', '');
    expect(el.querySelector('button') === b).to.equal(true);
    expect(document.activeElement === b).to.equal(true);
    expect(b.getAttribute('aria-busy')).to.equal('true');
    expect(b.getAttribute('aria-disabled')).to.equal('true');
    expect(el.querySelector('.td-btn__spinner').hidden).to.equal(false);
    b.click();
    expect(clicks).to.equal(0);
    el.removeAttribute('loading');
    b.click();
    expect(clicks).to.equal(1);
    expect(b.hasAttribute('aria-busy')).to.equal(false);
  });

  it('icon: registry name, legacy class list (deprecated), garbage', () => {
    const a = mount('<td-button icon="download">A</td-button>');
    expect(a.querySelector('.td-btn__icon svg[data-icon="download"]') !== null).to.equal(true);
    const b = mount('<td-button icon="fas fa-edit">B</td-button>');
    expect(b.querySelector('.td-btn__icon i').className).to.equal('fas fa-edit');
    const c = mount('<td-button icon="bi-star">C</td-button>');
    expect(c.querySelector('.td-btn__icon i').className).to.equal('bi-star');
    const d = mount('<td-button icon=\'"><img src=x>\'>D</td-button>');
    expect(d.querySelector('img')).to.equal(null);
  });

  it('custom colour: host CSSOM + contrast by WCAG across syntaxes', () => {
    const cases = [['#ff0', '#000000'], ['#000080', '#ffffff'], ['#ffffff80', '#000000'], ['rgb(20 20 20)', '#ffffff'],
      ['hsl(60 100% 50%)', '#000000'], ['navy', '#ffffff'], ['rgba(0, 0, 0, 0.1)', '#000000']];
    for (const [c, want] of cases) expect(TdButton._getContrastColor(c), c).to.equal(want);
    const el = mount('<td-button color="#ff0">Vàng</td-button>');
    expect(el.style.getPropertyValue('--td-btn-bg')).to.equal('rgb(255, 255, 0)');
    expect(el.style.getPropertyValue('--td-btn-fg')).to.equal('#000000');
    expect(el.querySelector('button').classList.contains('td-btn--custom')).to.equal(true);
  });

  it('forwards aria-label to the inner button', () => {
    const el = mount('<td-button icon="close" aria-label="Đóng"></td-button>');
    expect(el.querySelector('button').getAttribute('aria-label')).to.equal('Đóng');
  });
});

describe('batch 1 — TdLoading', () => {
  it('shows a status overlay, holds focus, inerts the page except toasts, restores everything once', async () => {
    const btn = mount('<button>trước</button>');
    btn.focus();
    TdToast._showSingle('toast', 'info', 0);
    TdLoading.show('Đang lưu');
    const el = TdLoading.element;
    expect(el.hidden).to.equal(false);
    expect(el.getAttribute('role')).to.equal('status');
    expect(el.querySelector('#td-loading-message').textContent).to.equal('Đang lưu');
    expect(document.activeElement === el.querySelector('.td-loading__card')).to.equal(true);
    expect(host.hasAttribute('inert')).to.equal(true);
    expect(document.getElementById('td-toast-container').hasAttribute('inert')).to.equal(false);
    expect(isScrollLocked()).to.equal(true);
    TdLoading.hide();
    TdLoading.hide(); // idempotent
    expect(el.hidden).to.equal(true);
    expect(host.hasAttribute('inert')).to.equal(false);
    expect(isScrollLocked()).to.equal(false);
    expect(document.activeElement === btn).to.equal(true);
    TdToast._activeToasts.slice().forEach((t) => t._removeToast());
  });

  it('wrap() is ref-counted and releases on rejection', async () => {
    let r1; let r2;
    const p1 = TdLoading.wrap(() => new Promise((r) => { r1 = r; }));
    const p2 = TdLoading.wrap(() => new Promise((_, j) => { r2 = j; }));
    r1('ok');
    await p1;
    expect(TdLoading.element.hidden).to.equal(false); // second still running
    r2(new Error('fail'));
    await p2.catch(() => {});
    expect(TdLoading.element.hidden).to.equal(true);
    expect(isScrollLocked()).to.equal(false);
  });

  it('max-duration auto-hide releases the page', async () => {
    TdLoading.show({ message: 'x', maxDuration: 30 });
    await wait(60);
    expect(TdLoading.element.hidden).to.equal(true);
    expect(host.hasAttribute('inert')).to.equal(false);
  });

  it('TdLoadingSpinner.create: classes, CSSOM colours via safeColor, label → status', () => {
    const s = TdLoadingSpinner.create({ size: 'lg', color: '#e11d48', trackColor: 'x;}body{', label: 'Đang tải' });
    expect(s.className).to.equal('td-spinner td-spinner--lg');
    expect(s.style.getPropertyValue('--td-spinner-color')).to.equal('#e11d48');
    expect(s.style.getPropertyValue('--td-spinner-track')).to.equal('');
    expect(s.getAttribute('role')).to.equal('status');
    expect(TdLoadingSpinner.create().getAttribute('aria-hidden')).to.equal('true');
  });
});

describe('batch 1 — review follow-ups', () => {
  it('controlled switch stays in sync when the handler accepts the change synchronously', async () => {
    const el = mount('<td-toggle controlled aria-label="x"></td-toggle>');
    el.addEventListener('change', (e) => { el.checked = e.detail.checked; });
    el.querySelector('input').click();
    await wait(10);
    expect(el.hasAttribute('checked')).to.equal(true);
    expect(el.querySelector('input').checked).to.equal(true);
  });

  it('trusted Space on a focused switch toggles once and keeps focus', async () => {
    const el = mount('<td-toggle aria-label="x"></td-toggle>');
    const input = el.querySelector('input');
    const got = [];
    el.addEventListener('change', (e) => got.push(e.detail));
    input.focus();
    await sendKeys({ press: 'Space' });
    expect(got).to.deep.equal([{ checked: true }]);
    expect(input.checked).to.equal(true);
    expect(document.activeElement === input).to.equal(true);
  });

  it('keyboard focus shows the --td-focus-ring', async () => {
    mount('<button id="before">a</button>');
    const el = mount('<td-button>Lưu</td-button>');
    document.getElementById('before').focus();
    await sendKeys({ press: 'Tab' });
    const b = el.querySelector('button');
    expect(document.activeElement === b).to.equal(true);
    await wait(200); // box-shadow transitions in (--td-dur-fast)
    expect(getComputedStyle(b).boxShadow).to.contain('rgba(37, 99, 235');
  });

  it('a wrap from an older generation cannot release a newer loading session', async () => {
    let resolveOld;
    const old = TdLoading.wrap(() => new Promise((r) => { resolveOld = r; }));
    TdLoading.hide();                      // ends generation 1
    let resolveNew;
    const next = TdLoading.wrap(() => new Promise((r) => { resolveNew = r; }));
    resolveOld();
    await old;
    expect(TdLoading.element.hidden).to.equal(false); // new session still shown
    resolveNew();
    await next;
    expect(TdLoading.element.hidden).to.equal(true);
  });

  for (const theme of ['light', 'dark']) {
    it(`button text contrast ≥ 4.5 at rest and on hover (${theme})`, () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      for (const v of ['primary', 'success', 'danger', 'warning', 'info']) {
        const b = mount(`<td-button variant="${v}">x</td-button>`).querySelector('button');
        const cs = getComputedStyle(b);
        const bg = rgb(cs.backgroundColor);
        const fg = cs.color;
        expect(ratio(fg, cs.backgroundColor), `${v} rest`).to.be.at.least(4.5);
        // hover = rgb(0 0 0 / 12%) overlay composited over the fill
        const over = (c) => Math.round(c * 0.88);
        expect(ratio(fg, `rgb(${over(bg.r)}, ${over(bg.g)}, ${over(bg.b)})`), `${v} hover`).to.be.at.least(4.5);
      }
    });
  }

  it('custom colours: every syntax is engine-normalised; an unresolvable one falls back to the variant', () => {
    expect(TdButton._getContrastColor('rgb(100% 100% 0%)')).to.equal('#000000');
    expect(TdButton._getContrastColor('rgba(0 0 128 / 100%)')).to.equal('#ffffff');
    const el = mount('<td-button color="notacolour">x</td-button>');
    expect(el.querySelector('button').classList.contains('td-btn--custom')).to.equal(false);
    expect(el.style.getPropertyValue('--td-btn-bg')).to.equal('');
    const light = mount('<td-button color="#ff0">y</td-button>');
    expect(light.style.getPropertyValue('--td-btn-hover')).to.contain('255 255 255');
  });

  it('icon-only button renders no visible label', () => {
    const el = mount('<td-button icon="close" aria-label="Đóng"></td-button>');
    expect(el.querySelector('.td-btn__label')).to.equal(null);
    expect(mount('<td-button></td-button>').querySelector('.td-btn__label').textContent).to.equal('Button');
  });

  it('spinner className keeps every consumer class; show("") is verbatim', () => {
    const s = TdLoadingSpinner.create({ className: 'sm:mx-2 my-spin' });
    expect(s.classList.contains('sm:mx-2')).to.equal(true);
    expect(s.classList.contains('my-spin')).to.equal(true);
    TdLoading.show('');
    expect(TdLoading.element.querySelector('#td-loading-message').textContent).to.equal('');
    TdLoading.hide();
  });
});

describe('batch 1 — review round 3', () => {
  it('colour normalisation is cached (one probe per distinct colour) and render() does not touch the host', () => {
    let appended = 0;
    const orig = document.documentElement.appendChild.bind(document.documentElement);
    document.documentElement.appendChild = (n) => { appended += 1; return orig(n); };
    try {
      TdButton._parseColor('hsl(10 50% 40%)');
      TdButton._parseColor('hsl(10 50% 40%)');
      TdButton._parseColor('not-a-colour-xyz');
      TdButton._parseColor('not-a-colour-xyz');
    } finally {
      document.documentElement.appendChild = orig;
    }
    expect(appended).to.equal(1); // invalid colours never reach the DOM, valid ones once
    const el = document.createElement('td-button');
    el.setAttribute('color', '#6366f1');
    const before = el.getAttribute('style');
    el.render();
    expect(el.getAttribute('style')).to.equal(before);
  });
});

describe('batch 1 — review round 2', () => {
  it('custom colour is applied normalised (contextual values resolved once)', () => {
    const el = mount('<td-button color="currentColor">x</td-button>');
    const v = el.style.getPropertyValue('--td-btn-bg');
    expect(v === '' || /^rgba?\(/.test(v)).to.equal(true);
  });

  it('aria-label toggling re-renders the icon-only structure', () => {
    const el = mount('<td-button icon="close"></td-button>');
    expect(el.querySelector('.td-btn__label').textContent).to.equal('Button');
    el.setAttribute('aria-label', 'Đóng');
    expect(el.querySelector('.td-btn__label')).to.equal(null);
    el.removeAttribute('aria-label');
    expect(el.querySelector('.td-btn__label').textContent).to.equal('Button');
  });

  it('error note survives selector-hostile and changed host ids', () => {
    const el = mount('<td-checkbox id=\'a"b]c\' aria-label="x"></td-checkbox>');
    el.setError('Lỗi');
    const note = el.querySelector('.td-field-error');
    expect(note.id).to.equal('a"b]c-error');
    el.id = 'renamed';
    el.setError('Lỗi mới');
    expect(el.querySelectorAll('.td-field-error').length).to.equal(1);
    expect(el.querySelector('.td-field-error').id).to.equal('renamed-error');
    expect(el.querySelector('input').getAttribute('aria-errormessage')).to.equal('renamed-error');
  });
});

describe('base — external label + reconnect', () => {
  it('clicking an external <label for=host> focuses the inner control (and toggles checkables)', () => {
    const wrap = mount('<div><label for="ext-f">Họ tên</label><td-input-field id="ext-f"></td-input-field>'
      + '<label for="ext-c">Đồng ý</label><td-checkbox id="ext-c"></td-checkbox></div>');
    wrap.querySelector('label[for="ext-f"]').click();
    expect(document.activeElement === wrap.querySelector('#ext-f .td-field__control')).to.equal(true);
    const cb = wrap.querySelector('#ext-c');
    wrap.querySelector('label[for="ext-c"]').click();
    expect(cb.hasAttribute('checked')).to.equal(true);
    expect(document.activeElement === cb.querySelector('input')).to.equal(true);
  });

  it('a moved element keeps working (listeners re-bound on reconnect)', () => {
    const cb = mount('<td-checkbox label="x"></td-checkbox>');
    const other = mount('<div></div>');
    other.appendChild(cb);
    const got = [];
    cb.addEventListener('change', (e) => got.push(e.detail));
    cb.querySelector('input').click();
    expect(got).to.deep.equal([{ checked: true }]);
  });
});
