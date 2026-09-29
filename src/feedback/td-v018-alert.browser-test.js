import { expect } from '@esm-bundle/chai';

// v0.18.0 F5 — <td-alert> + .td-badge (+ F7 td_link bare in the same SSR fixture).
//   (a) BEFORE the module loads: the PHP markup (test/php/fixtures/ssr.html, from test/php/fixture.php) is styled by
//       td.css alone and has no close button;
//   (b) AFTER `td-alert.js` loads: upgrade IN PLACE (same text nodes), close button only when dismissible,
//       `dismiss` event + removal, variant / heading / dismissible sync, labels, reconnect, escaping.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const fixture = await (await fetch('/test/php/fixtures/ssr.html')).text();
const root = document.createElement('div');
root.innerHTML = fixture;
document.body.appendChild(root);
const feedback = root.querySelector('#ssr-feedback');

const cs = (el) => getComputedStyle(el);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

let preMessage;
let preHeading;
let preText;

describe('SSR alert / badge before the module loads (no JS)', () => {
  it('the alert module is not loaded yet', () => {
    expect(customElements.get('td-alert')).to.equal(undefined);
  });

  it('td.css styles the PHP alert markup: tinted solid fill, flex row, no close button', () => {
    const host = feedback.querySelector('#al-success');
    expect(host.localName).to.equal('td-alert');
    expect(cs(host).display).to.equal('block');
    const box = host.querySelector(':scope > .td-alert.td-alert--success');
    expect(box.getAttribute('role')).to.equal('status');
    expect(cs(box).display).to.equal('flex');
    expect(cs(box).backgroundColor).to.equal('rgb(240, 253, 244)');
    expect(cs(box).borderTopWidth).to.equal('1px');
    expect(cs(box).backdropFilter === 'none' || cs(box).backdropFilter === '').to.equal(true, 'content layer: no glass');
    expect(cs(host.querySelector('.td-alert__heading')).fontWeight).to.equal('600');
    expect(host.querySelector('.td-alert__icon svg').getAttribute('data-icon')).to.equal('success');
    expect(host.querySelector('button')).to.equal(null, 'no dead close button without JS');
    // PHP escaped the message: it is text, not markup
    expect(host.querySelector('.td-alert__message').textContent).to.equal('Đã lưu <b>thay đổi</b>.');
    expect(host.querySelector('.td-alert__message b')).to.equal(null);
    const danger = feedback.querySelector('#al-danger .td-alert');
    expect(danger.getAttribute('role')).to.equal('alert');
    expect(cs(danger).backgroundColor).to.equal('rgb(254, 242, 242)');
    preMessage = host.querySelector('.td-alert__message');
    preHeading = host.querySelector('.td-alert__heading');
    preText = preMessage.firstChild;
  });

  it('badges are CSS-only: pill fill; stamp = uppercase double border, tilted', () => {
    const b = feedback.querySelector('#bd-new');
    expect(b.className).to.equal('td-badge td-badge--accent');
    expect(cs(b).display).to.equal('inline-flex');
    expect(cs(b).backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
    const s = feedback.querySelector('#bd-stamp');
    expect(cs(s).textTransform).to.equal('uppercase');
    expect(cs(s).borderTopStyle).to.equal('double');
    expect(cs(s).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    expect(cs(s).transform).to.not.equal('none');
  });

  it('F7: td_link bare prints a plain link (site class only, no td-btn look)', () => {
    const a = feedback.querySelector('#ln-bare');
    expect(a.className).to.equal('site-link');
    expect(a.getAttribute('href')).to.equal('/docs');
    expect(a.children.length).to.equal(0);
  });
});

describe('<td-alert> after the module loads', () => {
  let TdAlert;
  const box = document.createElement('div');
  before(async () => {
    ({ TdAlert } = await import('./td-alert.js'));
    document.body.appendChild(box);
  });
  afterEach(() => { box.replaceChildren(); TdAlert.labels.close = 'Đóng'; });

  it('upgrades the SSR markup IN PLACE (same nodes, same text) and adds the close button when dismissible', async () => {
    const host = feedback.querySelector('#al-success');
    await frame();
    expect(host.querySelector('.td-alert__message')).to.equal(preMessage, 'message node kept');
    expect(host.querySelector('.td-alert__heading')).to.equal(preHeading, 'heading node kept');
    expect(preMessage.firstChild).to.equal(preText, 'text node not re-rendered');
    expect(preMessage.textContent).to.equal('Đã lưu <b>thay đổi</b>.');
    expect(host.querySelectorAll('.td-alert').length).to.equal(1);
    expect(host.querySelectorAll('.td-alert__icon svg').length).to.equal(1);
    const btn = host.querySelector('.td-alert > button.td-alert__close');
    expect(btn).to.not.equal(null);
    expect(btn.type).to.equal('button');
    expect(btn.getAttribute('aria-label')).to.equal('Đóng');
    expect(btn.querySelector('svg[data-icon="close"]')).to.not.equal(null);
    expect(feedback.querySelector('#al-danger button')).to.equal(null, 'not dismissible → no button');
  });

  it('close button fires a cancelable `dismiss` and removes the alert unless prevented', async () => {
    const host = feedback.querySelector('#al-success');
    const btn = host.querySelector('.td-alert__close');
    let n = 0;
    const stop = (e) => { n++; e.preventDefault(); };
    host.addEventListener('dismiss', stop);
    btn.click();
    expect(n).to.equal(1);
    expect(host.isConnected).to.equal(true, 'prevented → kept');
    host.removeEventListener('dismiss', stop);
    let bubbled = 0;
    feedback.addEventListener('dismiss', () => bubbled++, { once: true });
    btn.click();
    expect(bubbled).to.equal(1);
    expect(host.isConnected).to.equal(false);
  });

  it('authored content: child nodes move into .td-alert__message (not re-parsed); default info + role status', () => {
    box.innerHTML = '<td-alert heading="Lưu ý">Nội dung <b>đậm</b></td-alert>';
    const el = box.firstElementChild;
    const alert = el.querySelector(':scope > .td-alert.td-alert--info');
    expect(alert.getAttribute('role')).to.equal('status');
    expect(el.querySelector('.td-alert__message').innerHTML).to.equal('Nội dung <b>đậm</b>');
    expect(el.querySelector('.td-alert__heading').textContent).to.equal('Lưu ý');
    expect(el.querySelector('.td-alert__icon').getAttribute('aria-hidden')).to.equal('true');
    expect(el.querySelector('.td-alert__icon svg').getAttribute('data-icon')).to.equal('info');
    expect(el.querySelector('button')).to.equal(null);
    expect(cs(alert).backgroundColor).to.equal('rgb(239, 246, 255)');
  });

  it('variant → class, role and icon in place (danger = role alert); invalid → info', () => {
    box.innerHTML = '<td-alert variant="success">Xong</td-alert>';
    const el = box.firstElementChild;
    const msg = el.querySelector('.td-alert__message');
    const text = msg.firstChild;
    const map = { info: ['status', 'info'], success: ['status', 'success'], warning: ['status', 'warning'], danger: ['alert', 'error'], bogus: ['status', 'info'] };
    for (const [v, [role, icon]] of Object.entries(map)) {
      el.setAttribute('variant', v);
      const a = el.querySelector('.td-alert');
      const want = v === 'bogus' ? 'info' : v;
      expect([...a.classList].filter((c) => c.startsWith('td-alert--'))).to.deep.equal([`td-alert--${want}`]);
      expect(a.getAttribute('role')).to.equal(role);
      expect(a.querySelector('.td-alert__icon svg').getAttribute('data-icon')).to.equal(icon);
      expect(a.querySelectorAll('.td-alert__icon svg').length).to.equal(1);
    }
    expect(el.querySelector('.td-alert__message')).to.equal(msg);
    expect(msg.firstChild).to.equal(text);
  });

  it('heading / dismissible attributes sync; the heading is text only', () => {
    box.innerHTML = '<td-alert>Nội dung</td-alert>';
    const el = box.firstElementChild;
    expect(el.querySelector('.td-alert__heading')).to.equal(null);
    el.setAttribute('heading', '<img src=x data-xss onerror="window.__alertXss=1">');
    const h = el.querySelector('.td-alert__heading');
    expect(h.textContent).to.equal('<img src=x data-xss onerror="window.__alertXss=1">');
    expect(el.querySelector('[data-xss]')).to.equal(null);
    el.heading = 'Mới';
    expect(el.querySelector('.td-alert__heading')).to.equal(h);
    expect(h.textContent).to.equal('Mới');
    el.removeAttribute('heading');
    expect(el.querySelector('.td-alert__heading')).to.equal(null);
    el.dismissible = true;
    expect(el.querySelectorAll('.td-alert__close').length).to.equal(1);
    el.dismissible = false;
    expect(el.querySelector('.td-alert__close')).to.equal(null);
  });

  it('SSR heading without the attribute is kept on upgrade (hand-written markup)', () => {
    box.innerHTML = '<td-alert variant="warning"><div class="td-alert td-alert--warning" role="status"><span class="td-alert__icon" aria-hidden="true"></span>'
      + '<div class="td-alert__body"><p class="td-alert__heading">Tay</p><div class="td-alert__message">Nội dung</div></div></div></td-alert>';
    const el = box.firstElementChild;
    expect(el.querySelector('.td-alert__heading').textContent).to.equal('Tay');
    expect(el.querySelector('.td-alert__icon svg').getAttribute('data-icon')).to.equal('warning', 'missing icon filled in');
    el.setAttribute('variant', 'danger');
    expect(el.querySelector('.td-alert__heading').textContent).to.equal('Tay', 'unrelated re-sync keeps it');
  });

  it('TdAlert.labels.close translates the close button; dismiss() API', () => {
    TdAlert.labels.close = 'Close';
    box.innerHTML = '<td-alert dismissible>x</td-alert>';
    const el = box.firstElementChild;
    expect(el.querySelector('.td-alert__close').getAttribute('aria-label')).to.equal('Close');
    expect(el.dismiss()).to.equal(true);
    expect(el.isConnected).to.equal(false);
  });

  it('moved in the DOM: the close button still works, one listener (one dismiss per click)', () => {
    box.innerHTML = '<td-alert dismissible>x</td-alert>';
    const el = box.firstElementChild;
    const other = document.createElement('div');
    box.appendChild(other);
    other.appendChild(el); // disconnect + reconnect
    let n = 0;
    el.addEventListener('dismiss', (e) => { n++; e.preventDefault(); });
    el.querySelector('.td-alert__close').click();
    expect(n).to.equal(1);
    expect(el.querySelectorAll('.td-alert__close').length).to.equal(1);
  });
});

describe('v0.18.0 review — toggling dismissible reuses one close button', () => {
  it('no extra buttons, listeners or cleanups after repeated toggles', async () => {
    await import('./td-alert.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = '<td-alert variant="info" dismissible>Tin nhắn</td-alert>';
    const el = host.firstElementChild;
    await frame();
    const cleanups0 = el._cleanups.length;
    for (let i = 0; i < 5; i++) {
      el.removeAttribute('dismissible');
      el.setAttribute('dismissible', '');
    }
    await frame();
    expect(el.querySelectorAll('.td-alert__close').length).to.equal(1);
    expect(el._cleanups.length).to.equal(cleanups0);
    let fired = 0;
    el.addEventListener('dismiss', (e) => { fired++; e.preventDefault(); });
    el.querySelector('.td-alert__close').click();
    expect(fired).to.equal(1);
    host.remove();
  });
});
