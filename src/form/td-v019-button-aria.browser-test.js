import { expect } from '@esm-bundle/chai';
import './td-button.js';

// v0.19.0 G1 — <td-button> forwards aria-pressed / aria-expanded / aria-controls / aria-haspopup to the inner control.
// Plan: docs/internal/plans/v0.19.0-135-feedback-3.md.
const container = document.createElement('div');
document.body.appendChild(container);
function mount(html) {
  container.insertAdjacentHTML('beforeend', html.trim());
  return container.lastElementChild;
}
afterEach(() => { container.innerHTML = ''; });

/** Capture console.warn calls while `fn` runs. */
function captureWarn(fn) {
  const calls = [];
  const orig = console.warn;
  console.warn = (...a) => calls.push(a);
  try { fn(); } finally { console.warn = orig; }
  return calls;
}
const ctl = (el) => el.querySelector(':scope > .td-btn');

describe('v0.19.0 G1 — td-button ARIA state forwarding', () => {
  it('toggle button: aria-pressed forwarded and updated in place (same control, focus kept)', () => {
    const el = mount('<td-button variant="secondary" aria-pressed="false">Đậm</td-button>');
    const btn = ctl(el);
    expect(btn.localName).to.equal('button');
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    btn.focus();
    el.setAttribute('aria-pressed', 'true');
    expect(ctl(el)).to.equal(btn); // not re-rendered
    expect(document.activeElement).to.equal(btn);
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    el.setAttribute('aria-pressed', 'mixed');
    expect(btn.getAttribute('aria-pressed')).to.equal('mixed');
    el.removeAttribute('aria-pressed');
    expect(btn.hasAttribute('aria-pressed')).to.equal(false);
    expect(ctl(el)).to.equal(btn);
    expect(el.getAttribute('aria-pressed')).to.equal(null);
  });

  it('menu button: aria-haspopup="menu" + aria-expanded + aria-controls', () => {
    const el = mount('<td-button aria-haspopup="menu" aria-expanded="false" aria-controls="m1">Menu</td-button>');
    const btn = ctl(el);
    expect(btn.getAttribute('aria-haspopup')).to.equal('menu');
    expect(btn.getAttribute('aria-expanded')).to.equal('false');
    expect(btn.getAttribute('aria-controls')).to.equal('m1');
    el.setAttribute('aria-expanded', 'true');
    expect(btn.getAttribute('aria-expanded')).to.equal('true');
    // the host keeps the site's attributes
    expect(el.getAttribute('aria-expanded')).to.equal('true');
    expect(el.getAttribute('aria-haspopup')).to.equal('menu');
    for (const v of ['true', 'false', 'listbox', 'tree', 'grid', 'dialog']) {
      el.setAttribute('aria-haspopup', v);
      expect(btn.getAttribute('aria-haspopup'), v).to.equal(v);
    }
    el.removeAttribute('aria-controls');
    el.removeAttribute('aria-expanded');
    el.removeAttribute('aria-haspopup');
    expect(btn.hasAttribute('aria-controls')).to.equal(false);
    expect(btn.hasAttribute('aria-expanded')).to.equal(false);
    expect(btn.hasAttribute('aria-haspopup')).to.equal(false);
    expect(ctl(el)).to.equal(btn);
  });

  it('aria-controls is copied verbatim (IDREF list, odd characters as plain attribute text); empty / whitespace dropped', () => {
    const el = mount('<td-button aria-controls="panel-a panel-b">X</td-button>');
    const btn = ctl(el);
    expect(btn.getAttribute('aria-controls')).to.equal('panel-a panel-b');
    const odd = 'a"b <img src=x onerror=alert(1)> 1:2';
    el.setAttribute('aria-controls', odd);
    expect(btn.getAttribute('aria-controls')).to.equal(odd);
    expect(el.querySelector('img')).to.equal(null);
    el.setAttribute('aria-controls', '   ');
    expect(btn.hasAttribute('aria-controls')).to.equal(false);
    el.setAttribute('aria-controls', '');
    expect(btn.hasAttribute('aria-controls')).to.equal(false);
  });

  it('values outside the whitelist are not forwarded (warned once per attribute+value)', () => {
    let el;
    const warns = captureWarn(() => {
      el = mount('<td-button aria-pressed="yes" aria-expanded="mixed" aria-haspopup="popover">X</td-button>');
    });
    const btn = ctl(el);
    expect(btn.hasAttribute('aria-pressed')).to.equal(false);
    expect(btn.hasAttribute('aria-expanded')).to.equal(false);
    expect(btn.hasAttribute('aria-haspopup')).to.equal(false);
    const attrs = warns.map((w) => String(w[0]));
    expect(attrs.some((m) => m.includes('aria-pressed'))).to.equal(true);
    expect(attrs.some((m) => m.includes('aria-expanded'))).to.equal(true);
    expect(attrs.some((m) => m.includes('aria-haspopup'))).to.equal(true);
    // a valid value → forwarded; a bad one afterwards removes the forwarded value
    el.setAttribute('aria-pressed', 'true');
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    const again = captureWarn(() => {
      el.setAttribute('aria-pressed', 'yes');
      el.setAttribute('loading', ''); // another sync: no second warning for the same pair
    });
    expect(btn.hasAttribute('aria-pressed')).to.equal(false);
    expect(again.length).to.equal(0);
  });

  it('a link button (href) receives the forwarded ARIA too, also across disabled / loading', () => {
    const el = mount('<td-button href="/x" aria-expanded="false" aria-controls="nav" aria-pressed="true">Nav</td-button>');
    const a = ctl(el);
    expect(a.localName).to.equal('a');
    expect(a.getAttribute('aria-expanded')).to.equal('false');
    expect(a.getAttribute('aria-controls')).to.equal('nav');
    expect(a.getAttribute('aria-pressed')).to.equal('true');
    el.setAttribute('aria-expanded', 'true');
    expect(a.getAttribute('aria-expanded')).to.equal('true');
    el.setAttribute('disabled', '');
    expect(a.getAttribute('aria-expanded')).to.equal('true');
    el.removeAttribute('disabled');
    el.removeAttribute('aria-expanded');
    expect(a.hasAttribute('aria-expanded')).to.equal(false);
  });

  it('survives a structural re-render (variant change) and a button ↔ link switch', () => {
    const el = mount('<td-button aria-pressed="true" aria-haspopup="dialog">X</td-button>');
    el.setAttribute('variant', 'danger');
    expect(ctl(el).getAttribute('aria-pressed')).to.equal('true');
    el.setAttribute('href', '/y');
    expect(ctl(el).localName).to.equal('a');
    expect(ctl(el).getAttribute('aria-pressed')).to.equal('true');
    expect(ctl(el).getAttribute('aria-haspopup')).to.equal('dialog');
  });
});
