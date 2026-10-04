import { expect } from '@esm-bundle/chai';
import '../form/td-input-field.js';

// v0.36.0 (plan QĐ 53) — td-copy `for` pointing at a kit field host (<td-input-field readonly>): the copied text is the
// host's value; a refused copy selects the text of the host's inner native control. Chromium + Firefox + WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await import('./td-copy.js');

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
function fakeClipboard(ok = true) {
  const written = [];
  const clip = { writeText: (t) => { written.push(t); return ok ? Promise.resolve() : Promise.reject(new DOMException('denied', 'NotAllowedError')); } };
  const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
  extra.push(() => {
    if (own) Object.defineProperty(navigator, 'clipboard', own);
    else delete navigator.clipboard;
  });
  return written;
}
function mount() {
  const wrap = document.createElement('div');
  wrap.innerHTML = '<td-input-field id="key" label="Khoá API" readonly value="pk_live_51HdemoKey"></td-input-field>'
    + '<td-copy for="key" label="Copy khoá API"></td-copy>';
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}

describe('v0.36.0 td-copy for= a kit field host', () => {
  it('copies the td-input-field value (not the host text)', async () => {
    const written = fakeClipboard(true);
    const wrap = mount();
    const copy = wrap.querySelector('td-copy');
    await until(() => copy.querySelector('button.td-copy') && wrap.querySelector('td-input-field input'), 3000, 'render');
    const ok = [];
    copy.addEventListener('copy-success', (e) => ok.push(e.detail.value));
    copy.querySelector('button.td-copy').click();
    await until(() => ok.length === 1, 3000, 'copy-success');
    expect(written).to.deep.equal(['pk_live_51HdemoKey']);
    expect(ok).to.deep.equal(['pk_live_51HdemoKey']);
  });

  it('a refused copy selects the text of the host’s inner input (manual copy)', async () => {
    fakeClipboard(false);
    const wrap = mount();
    const copy = wrap.querySelector('td-copy');
    const input = await (async () => {
      await until(() => copy.querySelector('button.td-copy') && wrap.querySelector('td-input-field input'), 3000, 'render');
      return wrap.querySelector('td-input-field input');
    })();
    const errs = [];
    copy.addEventListener('copy-error', (e) => errs.push(e.detail));
    copy.querySelector('button.td-copy').click();
    await until(() => errs.length === 1, 3000, 'copy-error');
    expect(document.activeElement).to.equal(input);
    expect(input.selectionStart).to.equal(0);
    expect(input.selectionEnd).to.equal('pk_live_51HdemoKey'.length);
  });
});
