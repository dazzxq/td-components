import { expect } from '@esm-bundle/chai';
import { sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-input-field.js';
import { safeButtonHref } from './td-button.js';

// v0.17.0 (135 feedback): E1 td-input-field native attribute passthrough, E3 td-button ghost variant + link button.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => {
  container.innerHTML = '';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
});

/** Capture console.warn calls while `fn` runs. */
function captureWarn(fn) {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => calls.push(a);
  try { fn(); } finally { console.warn = orig; }
  return calls;
}

describe('E1 td-input-field: native attributes on the control', () => {
  it('password manager contract: autocomplete="current-password" lands on the <input type=password>', () => {
    const el = mount('<td-input-field id="pw" type="password" name="password" autocomplete="current-password"></td-input-field>');
    const input = el.querySelector('input.td-field__control');
    expect(input.type).to.equal('password');
    expect(input.getAttribute('autocomplete')).to.equal('current-password');
    expect(input.autocomplete).to.equal('current-password');
  });

  it('all whitelisted attributes are forwarded (input + textarea)', () => {
    const el = mount('<td-input-field autocomplete="section-a shipping email" inputmode="numeric" enterkeyhint="next"'
      + ' autocapitalize="off" spellcheck="false"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    expect(c.getAttribute('autocomplete')).to.equal('section-a shipping email');
    expect(c.getAttribute('inputmode')).to.equal('numeric');
    expect(c.getAttribute('enterkeyhint')).to.equal('next');
    expect(c.getAttribute('autocapitalize')).to.equal('off');
    expect(c.getAttribute('spellcheck')).to.equal('false');
    expect(c.spellcheck).to.equal(false);
    const ta = mount('<td-input-field type="textarea" autocomplete="off" enterkeyhint="send"></td-input-field>');
    const t = ta.querySelector('textarea');
    expect(t.getAttribute('autocomplete')).to.equal('off');
    expect(t.getAttribute('enterkeyhint')).to.equal('send');
  });

  it('values outside the whitelist are dropped (never forwarded)', () => {
    const el = mount('<td-input-field autocomplete="x&quot; onfocus=&quot;alert(1)" inputmode="evil" enterkeyhint="launch"'
      + ' autocapitalize="shout" spellcheck="maybe"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    for (const a of ['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck']) {
      expect(c.hasAttribute(a), a).to.equal(false);
    }
    expect(c.hasAttribute('onfocus')).to.equal(false);
  });

  it('dynamic change updates in place (same control, focus kept); invalid → removed; valid again → back', () => {
    const el = mount('<td-input-field autocomplete="email"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    c.focus();
    el.setAttribute('autocomplete', 'username');
    el.setAttribute('enterkeyhint', 'go');
    expect(el.querySelector('.td-field__control') === c, 'same element').to.equal(true);
    expect(document.activeElement === c, 'same element').to.equal(true);
    expect(c.getAttribute('autocomplete')).to.equal('username');
    expect(c.getAttribute('enterkeyhint')).to.equal('go');
    el.setAttribute('autocomplete', 'bad value!');
    expect(c.hasAttribute('autocomplete')).to.equal(false);
    el.removeAttribute('enterkeyhint');
    expect(c.hasAttribute('enterkeyhint')).to.equal(false);
    el.setAttribute('autocomplete', 'OFF');
    expect(c.getAttribute('autocomplete')).to.equal('off');
  });

  it('inputmode: an explicit value overrides the hint derived from type; removing it restores the hint', () => {
    const el = mount('<td-input-field type="number"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    expect(c.getAttribute('inputmode')).to.equal('decimal');
    el.setAttribute('inputmode', 'numeric');
    expect(c.getAttribute('inputmode')).to.equal('numeric');
    el.removeAttribute('inputmode');
    expect(c.getAttribute('inputmode')).to.equal('decimal');
    el.setAttribute('inputmode', 'nope');
    expect(c.getAttribute('inputmode')).to.equal('decimal');
  });

  it('forwarded attributes survive a structural re-render', () => {
    const el = mount('<td-input-field autocomplete="email" label="A"></td-input-field>');
    el.setAttribute('label', 'B'); // structural → re-render
    expect(el.querySelector('.td-field__control').getAttribute('autocomplete')).to.equal('email');
  });

  it('contenteditable: global attributes forwarded, autocomplete is not', () => {
    const el = mount('<td-input-field type="contenteditable" autocomplete="email" spellcheck="false" autocapitalize="words"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    expect(c.hasAttribute('autocomplete')).to.equal(false);
    expect(c.getAttribute('spellcheck')).to.equal('false');
    expect(c.getAttribute('autocapitalize')).to.equal('words');
  });

  it('autofocus focuses the control once on attach', () => {
    const el = mount('<td-input-field autofocus label="Tên"></td-input-field>');
    const c = el.querySelector('.td-field__control');
    expect(document.activeElement === c, 'same element').to.equal(true);
    c.blur();
    el.setAttribute('label', 'Tên mới'); // re-render: no second focus
    expect(document.activeElement !== el.querySelector('.td-field__control'), 'not focused').to.equal(true);
  });

  it('autofocus never steals focus from another focused element', () => {
    const other = mount('<button type="button">khác</button>');
    other.focus();
    const el = mount('<td-input-field autofocus></td-input-field>');
    expect(document.activeElement === other, 'same element').to.equal(true);
    expect(document.activeElement !== el.querySelector('.td-field__control'), 'not focused').to.equal(true);
  });

  it('autofocus skips a disabled field', () => {
    const el = mount('<td-input-field autofocus disabled></td-input-field>');
    expect(document.activeElement !== el.querySelector('.td-field__control'), 'not focused').to.equal(true);
  });
});

describe('E3 td-button: link button (href)', () => {
  it('renders <a class="td-btn …" href> with the button structure, no type', () => {
    const el = mount('<td-button href="/tai-khoan" variant="secondary" size="sm" icon="download">Tài khoản</td-button>');
    const a = el.querySelector(':scope > a.td-btn');
    expect(a).to.exist;
    expect(el.querySelector('button')).to.equal(null);
    expect(a.className).to.equal('td-btn td-btn--secondary td-btn--sm');
    expect(a.getAttribute('href')).to.equal('/tai-khoan');
    expect(a.hasAttribute('type')).to.equal(false);
    expect(a.hasAttribute('tabindex')).to.equal(false);
    expect(a.hasAttribute('role')).to.equal(false);
    expect(a.querySelector('.td-btn__label').textContent).to.equal('Tài khoản');
    expect(a.querySelector('.td-btn__icon')).to.exist;
    expect(a.querySelector('.td-btn__spinner').hidden).to.equal(true);
    expect(getComputedStyle(a).textDecorationLine).to.equal('none');
  });

  it('allowed hrefs: http(s), relative, #, ?, mailto:, tel:', () => {
    for (const h of ['https://example.com/a', 'http://example.com', '/p', 'p/q', '../x', '#top', '?q=1', 'mailto:a@b.vn', 'tel:+84123', 'HTTPS://X.VN']) {
      expect(safeButtonHref(h), h).to.equal(h);
    }
    for (const h of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', '\u0001javascript:x', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '', '   ', null]) {
      expect(safeButtonHref(h), String(h)).to.equal(null);
    }
  });

  it('a bad URL (javascript:) is dropped with a console warning; the link is inert', () => {
    let el;
    const warns = captureWarn(() => { el = mount('<td-button href="javascript:alert(1)">X</td-button>'); });
    const a = el.querySelector('a.td-btn');
    expect(a.hasAttribute('href')).to.equal(false);
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    expect(a.getAttribute('tabindex')).to.equal('-1');
    expect(warns.length).to.equal(1);
    expect(el.innerHTML).to.not.include('javascript');
  });

  it('target whitelist; _blank adds rel="noopener noreferrer"; download name sanitised', () => {
    const a = mount('<td-button href="https://x.vn" target="_blank" download="../../etc/bao-cao:2026.pdf">T</td-button>').querySelector('a');
    expect(a.getAttribute('target')).to.equal('_blank');
    expect(a.getAttribute('rel')).to.equal('noopener noreferrer');
    expect(a.getAttribute('download')).to.equal('etcbao-cao2026.pdf');
    const b = mount('<td-button href="/x" target="evil" download>T</td-button>').querySelector('a');
    expect(b.hasAttribute('target')).to.equal(false);
    expect(b.hasAttribute('rel')).to.equal(false);
    expect(b.getAttribute('download')).to.equal('');
    const c = mount('<td-button href="/x" target="_self">T</td-button>').querySelector('a');
    expect(c.getAttribute('target')).to.equal('_self');
    expect(c.hasAttribute('rel')).to.equal(false);
  });

  it('disabled: href removed + restored, tabindex -1, aria-disabled, disabled styles, click does not navigate', () => {
    const el = mount('<td-button href="#dich" variant="primary">Đi</td-button>');
    const a = el.querySelector('a');
    a.style.setProperty('transition', 'none'); // compare settled colours (CSSOM — CSP-safe)
    const rest = getComputedStyle(a).backgroundColor;
    el.setAttribute('disabled', '');
    expect(el.querySelector('a') === a, 'same element').to.equal(true); // in place
    expect(a.hasAttribute('href')).to.equal(false);
    expect(a.getAttribute('tabindex')).to.equal('-1');
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    expect(a.getAttribute('role')).to.equal('link');
    const cs = getComputedStyle(a);
    const probe = mount('<td-button disabled>P</td-button>').querySelector('button');
    expect(cs.backgroundColor).to.equal(getComputedStyle(probe).backgroundColor);
    expect(cs.color).to.equal(getComputedStyle(probe).color);
    expect(cs.cursor).to.equal('not-allowed');
    expect(cs.backgroundColor).to.not.equal(rest);
    let hostClicks = 0;
    el.addEventListener('click', () => { hostClicks++; });
    const before = location.hash;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    expect(hostClicks).to.equal(0);
    expect(location.hash).to.equal(before);
    el.removeAttribute('disabled');
    expect(a.getAttribute('href')).to.equal('#dich');
    expect(a.hasAttribute('tabindex')).to.equal(false);
    expect(a.hasAttribute('aria-disabled')).to.equal(false);
    expect(a.hasAttribute('role')).to.equal(false);
  });

  it('loading on/off: href removed then restored, focus kept (tabindex 0), aria-busy, spinner, clicks swallowed', () => {
    const el = mount('<td-button href="https://example.com/x" target="_blank">Tải</td-button>');
    const a = el.querySelector('a');
    a.focus();
    expect(document.activeElement === a, 'same element').to.equal(true);
    el.setAttribute('loading', '');
    expect(el.querySelector('a') === a, 'same element').to.equal(true);
    expect(a.hasAttribute('href')).to.equal(false);
    expect(a.getAttribute('tabindex')).to.equal('0');
    expect(a.getAttribute('aria-busy')).to.equal('true');
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    expect(a.querySelector('.td-btn__spinner').hidden).to.equal(false);
    expect(document.activeElement === a, 'same element').to.equal(true);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    // busy is NOT the disabled look (the tint stays, spinner over it)
    expect(getComputedStyle(a).cursor).to.equal('progress');
    el.removeAttribute('loading');
    expect(a.getAttribute('href')).to.equal('https://example.com/x');
    expect(a.hasAttribute('tabindex')).to.equal(false);
    expect(a.hasAttribute('aria-busy')).to.equal(false);
    expect(a.querySelector('.td-btn__spinner').hidden).to.equal(true);
    expect(document.activeElement === a, 'same element').to.equal(true);
  });

  it('run() on a link button uses the loading state', async () => {
    const el = mount('<td-button href="/x">Chạy</td-button>');
    const a = el.querySelector('a');
    let seen;
    await el.run(() => { seen = a.hasAttribute('href'); });
    expect(seen).to.equal(false);
    expect(a.getAttribute('href')).to.equal('/x');
  });

  it('disabled + loading: disabled wins (tabindex -1, disabled look)', () => {
    const el = mount('<td-button href="/x" disabled loading>X</td-button>');
    const a = el.querySelector('a');
    expect(a.getAttribute('tabindex')).to.equal('-1');
    expect(getComputedStyle(a).cursor).to.equal('not-allowed');
  });

  it('href value change updates in place; removing href switches back to <button>', () => {
    const el = mount('<td-button href="/a">X</td-button>');
    const a = el.querySelector('a');
    el.setAttribute('href', '/b');
    expect(el.querySelector('a') === a, 'same element').to.equal(true);
    expect(a.getAttribute('href')).to.equal('/b');
    el.removeAttribute('href');
    expect(el.querySelector('a')).to.equal(null);
    expect(el.querySelector('button.td-btn').type).to.equal('button');
    el.setAttribute('href', '/c');
    expect(el.querySelector('a.td-btn').getAttribute('href')).to.equal('/c');
  });

  it('a plain <button> keeps its behaviour (no href, loading keeps native semantics)', () => {
    const el = mount('<td-button type="submit" loading>Lưu</td-button>');
    const b = el.querySelector('button');
    expect(b.type).to.equal('submit');
    expect(b.getAttribute('aria-busy')).to.equal('true');
    expect(b.hasAttribute('tabindex')).to.equal(false);
  });
});

describe('E3 ghost hover keeps AA contrast (integration fix)', () => {
  const rgb = (c) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (top, base) => top.slice(0, 3).map((v, i) => v * top[3] + base[i] * (1 - top[3]));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const theme of ['light', 'dark']) {
    it(`${theme}: hovered ghost label vs hover fill on the page background ≥ 4.5`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      try {
        const page = rgb(getComputedStyle(document.documentElement).getPropertyValue('--td-color-bg').trim());
        const el = mount('<td-button variant="ghost">Huỷ bỏ</td-button>');
        const b = el.querySelector('.td-btn');
        const r = b.getBoundingClientRect();
        await sendMouse({ type: 'move', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
        await new Promise((res) => setTimeout(res, 200));
        const cs = getComputedStyle(b);
        const bg = over(rgb(cs.backgroundColor), page);
        const fg = over(rgb(cs.color), bg);
        expect(ratio(fg, bg)).to.be.at.least(4.5);
      } finally {
        await resetMouse();
        document.documentElement.removeAttribute('data-td-theme');
      }
    });
  }
});

describe('E3 td-button: ghost variant', () => {
  it('class + computed styles: transparent, no border/glass/shadow, accent label', () => {
    const el = mount('<td-button variant="ghost">Huỷ</td-button>');
    const b = el.querySelector('button');
    expect(b.className).to.include('td-btn--ghost');
    const cs = getComputedStyle(b);
    expect(cs.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    expect(cs.backgroundImage).to.equal('none');
    expect(cs.boxShadow).to.equal('none');
    expect(cs.borderTopColor).to.equal('rgba(0, 0, 0, 0)');
    expect(cs.backdropFilter === undefined || cs.backdropFilter === 'none').to.equal(true);
    // label = the accent (#2563eb light)
    expect(cs.color).to.equal('rgb(37, 99, 235)');
  });

  it('tokens: --td-btn-ghost-fg / --td-btn-ghost-hover-bg are themable per instance', () => {
    const el = mount('<td-button variant="ghost">Huỷ</td-button>');
    el.style.setProperty('--td-btn-ghost-fg', 'rgb(1, 2, 3)');
    expect(getComputedStyle(el.querySelector('button')).color).to.equal('rgb(1, 2, 3)');
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--td-btn-ghost-hover-bg').trim()).to.not.equal('');
  });

  it('dark theme: label follows the dark accent', () => {
    document.documentElement.setAttribute('data-td-theme', 'dark');
    try {
      const b = mount('<td-button variant="ghost">Huỷ</td-button>').querySelector('button');
      expect(getComputedStyle(b).color).to.equal('rgb(59, 130, 246)');
    } finally {
      document.documentElement.removeAttribute('data-td-theme');
    }
  });

  it('disabled ghost: stays transparent, greyed label (disabled token)', () => {
    const b = mount('<td-button variant="ghost" disabled>Huỷ</td-button>').querySelector('button');
    const cs = getComputedStyle(b);
    expect(cs.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    expect(cs.color).to.equal('rgb(161, 161, 170)'); // --td-btn-disabled-fg #a1a1aa
  });

  it('ghost link button', () => {
    const el = mount('<td-button variant="ghost" href="/x">Xem</td-button>');
    const a = el.querySelector('a.td-btn--ghost');
    expect(a).to.exist;
    expect(getComputedStyle(a).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
  });
});
