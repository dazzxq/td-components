import { expect } from '@esm-bundle/chai';

// v0.27.0 (plan v0.27.0-dsuite-p0a §D) — <td-copy> in Chromium, Firefox AND WebKit (group `engines`).
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

// No-JS contract: before the module is defined the server-authored <code> source shows, the button does not.
const pre = document.createElement('div');
pre.innerHTML = '<td-copy label="Copy mã"><code class="td-copy__source">ABCD-1234</code>'
  + '<button type="button" class="td-copy td-copy--md" aria-label="Copy mã" data-tooltip="Copy mã">'
  + '<span class="td-copy__icon" data-td-icon="copy" aria-hidden="true"></span></button>'
  + '<span class="td-copy__status" role="status"></span></td-copy>';
document.body.appendChild(pre);
const preState = {
  code: getComputedStyle(pre.querySelector('code')).display,
  button: getComputedStyle(pre.querySelector('button')).display,
};
pre.remove();

const { TdCopy } = await import('./td-copy.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}

/** Fake clipboard: `ok` → resolves, else rejects. Returns the written texts. */
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
const btnOf = (el) => el.querySelector('button.td-copy');
const iconName = (el) => btnOf(el).querySelector('.td-copy__icon').getAttribute('data-td-icon');

describe('td-copy — no JS (v0.27.0 §D)', () => {
  it('undefined: the <code> source shows, the icon button is hidden', () => {
    expect(preState.code).to.not.equal('none');
    expect(preState.button).to.equal('none');
  });
});

describe('td-copy — one icon button', () => {
  it('renders a button named by `label` (tooltip too), ONE registry icon, a status live region; source hidden', () => {
    const el = mount('<td-copy label="Copy mã khôi phục"><code class="td-copy__source">R-1</code></td-copy>').querySelector('td-copy');
    const btn = btnOf(el);
    expect(btn.type).to.equal('button');
    expect(btn.getAttribute('aria-label')).to.equal('Copy mã khôi phục');
    expect(btn.getAttribute('data-tooltip')).to.equal('Copy mã khôi phục');
    expect(btn.querySelectorAll('svg').length).to.equal(1);
    expect(iconName(el)).to.equal('copy');
    expect(btn.textContent.trim()).to.equal('');
    expect(el.querySelector('.td-copy__status').getAttribute('role')).to.equal('status');
    expect(getComputedStyle(el.querySelector('code.td-copy__source')).display).to.equal('none');
    expect(btn.classList.contains('td-copy--md')).to.equal(true);
  });

  it('size sm; default label from TdCopy.labels.copy', () => {
    const el = mount('<td-copy size="sm" value="x"></td-copy>').querySelector('td-copy');
    expect(btnOf(el).classList.contains('td-copy--sm')).to.equal(true);
    expect(btnOf(el).getAttribute('aria-label')).to.equal(TdCopy.labels.copy);
  });
});

describe('td-copy — copy', () => {
  it('success: writes the source, icon → check + success state + "Đã copy" announced, then back to the base state', async () => {
    const written = fakeClipboard(true);
    const el = mount('<td-copy label="Copy" duration="150"><code class="td-copy__source">ABC-123</code></td-copy>').querySelector('td-copy');
    const events = [];
    el.addEventListener('copy-success', (e) => events.push(e.detail));
    btnOf(el).click();
    await wait(20);
    expect(written).to.deep.equal(['ABC-123']);
    expect(events).to.deep.equal([{ value: 'ABC-123' }]);
    expect(iconName(el)).to.equal('check');
    expect(btnOf(el).getAttribute('data-state')).to.equal('copied');
    expect(btnOf(el).getAttribute('aria-label'), 'review round 1 IMPL-2: the name says copied').to.equal(TdCopy.labels.copied);
    expect(el.querySelector('.td-copy__status').textContent).to.equal(TdCopy.labels.copied);
    expect(btnOf(el).querySelectorAll('svg').length).to.equal(1);
    await wait(250);
    expect(iconName(el)).to.equal('copy');
    expect(btnOf(el).getAttribute('aria-label'), 'name restored from `label`').to.equal('Copy');
    expect(btnOf(el).hasAttribute('data-state')).to.equal(false);
    expect(el.querySelector('.td-copy__status').textContent).to.equal('');
  });

  it('three clicks in a row never stick on "copied" (state rebuilt from config, not a DOM snapshot)', async () => {
    fakeClipboard(true);
    const el = mount('<td-copy label="Copy mã" value="v" duration="120"></td-copy>').querySelector('td-copy');
    btnOf(el).click();
    await wait(10);
    expect(btnOf(el).getAttribute('aria-label')).to.equal(TdCopy.labels.copied);
    btnOf(el).click();
    await wait(10);
    btnOf(el).click();
    await wait(20);
    expect(iconName(el)).to.equal('check');
    expect(btnOf(el).getAttribute('aria-label')).to.equal(TdCopy.labels.copied);
    await wait(200);
    expect(iconName(el)).to.equal('copy');
    expect(btnOf(el).hasAttribute('data-state')).to.equal(false);
    expect(btnOf(el).getAttribute('aria-label'), 'never sticks on the copied name').to.equal('Copy mã');
  });

  it('`value` attribute / property win over the <code> source', async () => {
    const written = fakeClipboard(true);
    const el = mount('<td-copy value="from-attr"><code class="td-copy__source">from-code</code></td-copy>').querySelector('td-copy');
    btnOf(el).click();
    await wait(10);
    el.value = 'from-prop';
    btnOf(el).click();
    await wait(10);
    expect(written).to.deep.equal(['from-attr', 'from-prop']);
  });

  it('for="id": copies an input value or an element text', async () => {
    const written = fakeClipboard(true);
    const wrap = mount('<input id="cp-in" value="input-value"><span id="cp-span">span text</span>'
      + '<td-copy class="a" for="cp-in"></td-copy><td-copy class="b" for="cp-span"></td-copy>');
    btnOf(wrap.querySelector('.a')).click();
    await wait(10);
    btnOf(wrap.querySelector('.b')).click();
    await wait(10);
    expect(written).to.deep.equal(['input-value', 'span text']);
  });

  it('`sensitive`: events carry no value', async () => {
    fakeClipboard(true);
    const el = mount('<td-copy sensitive><code class="td-copy__source">SECRET</code></td-copy>').querySelector('td-copy');
    const details = [];
    el.addEventListener('copy-success', (e) => details.push(e.detail));
    btnOf(el).click();
    await wait(10);
    expect(details.length).to.equal(1);
    expect('value' in details[0]).to.equal(false);
    expect(JSON.stringify(details[0]).includes('SECRET')).to.equal(false);
  });

  it('clipboard refused: copy-error, error state, the manual hint, a selected read-only field with the value', async () => {
    fakeClipboard(false);
    const el = mount('<td-copy label="Copy" duration="5000"><code class="td-copy__source">MANUAL-1</code></td-copy>').querySelector('td-copy');
    const errors = [];
    el.addEventListener('copy-error', (e) => errors.push(e.detail));
    btnOf(el).click();
    await wait(30);
    expect(errors.length).to.equal(1);
    expect(errors[0].value).to.equal('MANUAL-1');
    expect(btnOf(el).getAttribute('data-state')).to.equal('error');
    expect(el.querySelector('.td-copy__status').textContent).to.equal(TdCopy.labels.manual);
    const manual = el.querySelector('input.td-copy__manual');
    expect(!!manual).to.equal(true);
    expect(manual.readOnly).to.equal(true);
    expect(manual.value).to.equal('MANUAL-1');
    expect(document.activeElement === manual).to.equal(true);
    expect(manual.selectionStart).to.equal(0);
    expect(manual.selectionEnd).to.equal('MANUAL-1'.length);
  });

  it('no clipboard API: for an input source, that input is focused + selected', async () => {
    const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    extra.push(() => { if (own) Object.defineProperty(navigator, 'clipboard', own); else delete navigator.clipboard; });
    const wrap = mount('<input id="cp-in2" value="pick me"><td-copy for="cp-in2"></td-copy>');
    let n = 0;
    wrap.querySelector('td-copy').addEventListener('copy-error', () => { n++; });
    btnOf(wrap.querySelector('td-copy')).click();
    await wait(30);
    const input = wrap.querySelector('#cp-in2');
    expect(n).to.equal(1);
    expect(document.activeElement === input).to.equal(true);
    expect(input.selectionStart).to.equal(0);
    expect(input.selectionEnd).to.equal(7);
  });

  it('no clipboard API, element source: its text is selected', async () => {
    const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    extra.push(() => { if (own) Object.defineProperty(navigator, 'clipboard', own); else delete navigator.clipboard; });
    const wrap = mount('<p id="cp-p">chọn đoạn này</p><td-copy for="cp-p"></td-copy>');
    btnOf(wrap.querySelector('td-copy')).click();
    await wait(30);
    expect(String(window.getSelection())).to.equal('chọn đoạn này');
  });
});

describe('td-copy — source captured as state', () => {
  it('exactly one direct <code class="td-copy__source"> child is the source; it is kept through a re-render', async () => {
    const written = fakeClipboard(true);
    const el = mount('<td-copy label="A"><code class="td-copy__source">KEEP-ME</code></td-copy>').querySelector('td-copy');
    el.setAttribute('label', 'B'); // re-render
    expect(el.querySelector('code.td-copy__source').textContent).to.equal('KEEP-ME');
    btnOf(el).click();
    await wait(10);
    expect(written).to.deep.equal(['KEEP-ME']);
  });

  it('two sources, or one nested in the wrong place → no source (nothing copied, copy-error)', async () => {
    const written = fakeClipboard(true);
    const wrap = mount('<td-copy class="two"><code class="td-copy__source">A</code><code class="td-copy__source">B</code></td-copy>'
      + '<td-copy class="nested"><span><code class="td-copy__source">C</code></span></td-copy>');
    let errs = 0;
    wrap.addEventListener('copy-error', () => { errs++; });
    btnOf(wrap.querySelector('.two')).click();
    btnOf(wrap.querySelector('.nested')).click();
    await wait(20);
    expect(written).to.deep.equal([]);
    expect(errs).to.equal(2);
  });
});
