import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdMaskedValue } from './td-masked-value.js';

// v0.31.0 (plan docs/internal/plans/v0.31.0-sortable-masked.md M5) — <td-masked-value>: shows the server-masked string,
// the app's async `reveal()` hook returns the real value, re-masked after N seconds. The secret must never reach an
// attribute, an event detail, the live region or the console, and is gone from the DOM after re-masking.
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans (`a === b`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SECRET = '0912345123';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => {
  extra.splice(0).reverse().forEach((f) => f());
  TdMaskedValue.reveal = null;
});

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap.firstElementChild;
}
const mk = (attrs = '') => mount(`<td-masked-value label="SĐT khách" masked="09xx xxx 123"${attrs}></td-masked-value>`);
const btn = (el) => el.querySelector('button.td-masked__toggle');
const text = (el) => el.querySelector('.td-masked__text');
const live = (el) => el.querySelector(':scope > [role="status"]');
/** a reveal hook under the test's control */
function deferredHook() {
  const calls = [];
  const fn = (ctx) => new Promise((resolve, reject) => { calls.push({ ctx, resolve, reject }); });
  return { fn, calls };
}
/** every event the host (and its subtree) fires, as JSON */
function recordAll(el) {
  const rec = [];
  for (const type of ['revealed', 'remasked', 'reveal-error', 'copy-success', 'copy-error']) {
    el.addEventListener(type, (e) => rec.push({ type, detail: e.detail }));
  }
  return rec;
}
/** console stub: every call of every level, stringified */
function captureConsole() {
  const out = [];
  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  const orig = Object.fromEntries(levels.map((l) => [l, console[l]]));
  for (const l of levels) {
    console[l] = (...a) => out.push(a.map((x) => {
      try { return typeof x === 'string' ? x : `${String(x)} ${JSON.stringify(x)} ${x && x.message} ${x && x.stack}`; } catch { return String(x); }
    }).join(' '));
  }
  extra.push(() => { for (const l of levels) console[l] = orig[l]; });
  return out;
}
/** recursive keys / values of a detail */
function deepStrings(v, out = [], seen = new Set()) {
  if (v && typeof v === 'object') {
    if (seen.has(v)) return out;
    seen.add(v);
    for (const k of Object.keys(v)) { out.push(k); deepStrings(v[k], out, seen); }
  } else out.push(String(v));
  return out;
}
/** the secret is nowhere in the host: markup, every attribute of every node, the live region */
function noSecret(el, rec = []) {
  expect(el.outerHTML.includes(SECRET), 'outerHTML').to.equal(false);
  for (const n of [el, ...el.querySelectorAll('*')]) {
    for (const a of n.attributes) expect(a.value.includes(SECRET), `${n.localName}[${a.name}]`).to.equal(false);
    if ('value' in n && typeof n.value === 'string') expect(n.value.includes(SECRET), `${n.localName}.value`).to.equal(false);
  }
  expect(live(el).textContent.includes(SECRET)).to.equal(false);
  for (const r of rec) {
    expect(JSON.stringify(r.detail ?? null).includes(SECRET), `${r.type} detail`).to.equal(false);
    expect(deepStrings(r.detail).some((s) => s.includes(SECRET)), `${r.type} keys`).to.equal(false);
  }
}

describe('td-masked-value — initial', () => {
  it('only the masked string; toggle aria-pressed false, constant name + tooltip, translate=no, empty live region', () => {
    const el = mk();
    expect(el.classList.contains('td-masked')).to.equal(true);
    expect(text(el).textContent).to.equal('09xx xxx 123');
    expect(text(el).getAttribute('translate')).to.equal('no');
    expect(btn(el).type).to.equal('button');
    expect(btn(el).getAttribute('aria-pressed')).to.equal('false');
    expect(btn(el).getAttribute('aria-label')).to.equal('Hiện SĐT khách');
    expect(btn(el).getAttribute('data-tooltip')).to.equal('Hiện SĐT khách');
    expect(btn(el).querySelector('.td-masked__icon').getAttribute('data-td-icon')).to.equal('eye');
    expect(!!btn(el).querySelector('svg')).to.equal(true);
    expect(live(el).textContent).to.equal('');
    expect(!!el.querySelector('td-copy')).to.equal(false);
    expect(el.revealed).to.equal(false);
  });

  it('default label "giá trị"; XSS in label / masked stays text', () => {
    const el = mount('<td-masked-value></td-masked-value>');
    expect(btn(el).getAttribute('aria-label')).to.equal('Hiện giá trị');
    const bad = '<img src=x onerror="window.__pwned=1">';
    const x = document.createElement('td-masked-value');
    x.setAttribute('label', bad);
    x.setAttribute('masked', bad);
    document.body.appendChild(x);
    extra.push(() => x.remove());
    expect(text(x).textContent).to.equal(bad);
    expect(btn(x).getAttribute('aria-label')).to.equal(`Hiện ${bad}`);
    expect(!!x.querySelector('img')).to.equal(false);
    expect(window.__pwned).to.equal(undefined);
  });
});

describe('td-masked-value — reveal', () => {
  it('click → reveal() once with { element, signal }; clicks while pending ignored; loading state', async () => {
    const el = mk();
    const h = deferredHook();
    el.reveal = h.fn;
    btn(el).click();
    btn(el).click();
    btn(el).click();
    expect(h.calls.length).to.equal(1);
    expect(h.calls[0].ctx.element === el).to.equal(true);
    expect(h.calls[0].ctx.signal instanceof AbortSignal).to.equal(true);
    expect(Object.keys(h.calls[0].ctx).sort()).to.deep.equal(['element', 'signal']);
    expect(btn(el).getAttribute('aria-disabled')).to.equal('true');
    expect(btn(el).getAttribute('data-state')).to.equal('loading');
    expect(el.getAttribute('aria-busy')).to.equal('true');
    expect(!!btn(el).querySelector('.td-spinner.td-spinner--sm')).to.equal(true);
    expect(live(el).textContent).to.equal('Đang tải SĐT khách…');
    h.calls[0].resolve(SECRET);
    await wait();
    expect(el.hasAttribute('aria-busy')).to.equal(false);
    expect(!!btn(el).querySelector('.td-spinner')).to.equal(false);
    el.mask();
  });

  it('resolved → the value as text, aria-pressed true, eye-off; the announcement and the event never carry it', async () => {
    const el = mk();
    const rec = recordAll(el);
    const h = deferredHook();
    el.reveal = h.fn;
    btn(el).click();
    h.calls[0].resolve(SECRET);
    await wait();
    expect(text(el).textContent).to.equal(SECRET);
    expect(text(el).getAttribute('data-state')).to.equal('revealed');
    expect(btn(el).getAttribute('aria-pressed')).to.equal('true');
    expect(btn(el).hasAttribute('aria-disabled')).to.equal(false);
    expect(btn(el).querySelector('.td-masked__icon').getAttribute('data-td-icon')).to.equal('eye-off');
    expect(btn(el).getAttribute('aria-label')).to.equal('Hiện SĐT khách', 'name constant');
    expect(live(el).textContent).to.equal('Đã hiện SĐT khách. Tự che lại sau 30 giây.');
    expect(el.revealed).to.equal(true);
    expect(rec).to.deep.equal([{ type: 'revealed', detail: { duration: 30 } }]);
    // the value lives in ONE text node only (no attribute)
    for (const n of [el, ...el.querySelectorAll('*')]) for (const a of n.attributes) expect(a.value.includes(SECRET)).to.equal(false);
    // click while revealed → masked now (reason user)
    btn(el).click();
    expect(text(el).textContent).to.equal('09xx xxx 123');
    expect(rec[1]).to.deep.equal({ type: 'remasked', detail: { reason: 'user' } });
    noSecret(el, rec);
  });

  it('duration="2" → re-masked by itself ("timeout" announced); afterwards no trace of the value anywhere', async () => {
    const el = mk(' duration="2" copyable');
    const rec = recordAll(el);
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    expect(text(el).textContent).to.equal(SECRET);
    expect(!!el.querySelector('td-copy')).to.equal(true);
    expect(rec[0].detail).to.deep.equal({ duration: 2 });
    await wait(2200);
    expect(text(el).textContent).to.equal('09xx xxx 123');
    expect(!!el.querySelector('td-copy')).to.equal(false);
    expect(live(el).textContent).to.equal('Đã che SĐT khách.');
    expect(rec[rec.length - 1]).to.deep.equal({ type: 'remasked', detail: { reason: 'timeout' } });
    noSecret(el, rec);
  });

  it('duration is an integer clamped to [2, 600] (default 30)', async () => {
    const cases = [['1', 2], ['9999', 600], ['abc', 30], ['12.7', 12], ['', 30]];
    for (const [attr, want] of cases) {
      const el = mk(` duration="${attr}"`);
      const rec = recordAll(el);
      el.reveal = () => Promise.resolve(SECRET);
      btn(el).click();
      await wait();
      expect(rec[0].detail.duration, attr).to.equal(want);
      el.mask();
    }
  });

  it('Enter / Space on the toggle reveal and mask', async () => {
    const el = mk();
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).focus();
    await sendKeys({ press: 'Enter' });
    await wait();
    expect(el.revealed).to.equal(true);
    await sendKeys({ press: 'Space' });
    await wait();
    expect(el.revealed).to.equal(false);
    noSecret(el);
  });
});

describe('td-masked-value — failures never leak', () => {
  it('a rejection whose message / fields hold the value → reveal-error { kind: "rejected" } only; nothing in DOM / live / console', async () => {
    const out = captureConsole();
    const el = mk();
    const rec = recordAll(el);
    el.reveal = () => {
      const err = new Error(`lookup failed for ${SECRET}`);
      err.value = SECRET;
      err.data = { phone: SECRET };
      return Promise.reject(err);
    };
    btn(el).click();
    await wait(10);
    expect(rec).to.deep.equal([{ type: 'reveal-error', detail: { kind: 'rejected' } }]);
    expect(live(el).textContent).to.equal('Không hiện được SĐT khách.');
    expect(el.revealed).to.equal(false);
    expect(text(el).textContent).to.equal('09xx xxx 123');
    expect(btn(el).hasAttribute('aria-disabled')).to.equal(false);
    noSecret(el, rec);
    expect(out.some((s) => s.includes(SECRET))).to.equal(false);
  });

  it('a synchronous throw is a rejection too', async () => {
    const el = mk();
    const rec = recordAll(el);
    el.reveal = () => { throw new Error(SECRET); };
    btn(el).click();
    await wait(10);
    expect(rec).to.deep.equal([{ type: 'reveal-error', detail: { kind: 'rejected' } }]);
    noSecret(el, rec);
  });

  it('null / undefined → silently masked; "" / a number → reveal-error invalid; AbortError → silent', async () => {
    for (const [ret, kind] of [[null, null], [undefined, null], ['', 'invalid'], [42, 'invalid'], [{ v: SECRET }, 'invalid']]) {
      const el = mk();
      const rec = recordAll(el);
      el.reveal = () => Promise.resolve(ret);
      btn(el).click();
      await wait(10);
      expect(el.revealed).to.equal(false);
      expect(text(el).textContent).to.equal('09xx xxx 123');
      if (kind) expect(rec).to.deep.equal([{ type: 'reveal-error', detail: { kind } }]);
      else {
        expect(rec).to.deep.equal([]);
        expect(live(el).textContent).to.not.include('Không');
      }
      noSecret(el, rec);
    }
    const el = mk();
    const rec = recordAll(el);
    el.reveal = () => Promise.reject(new DOMException('stop', 'AbortError'));
    btn(el).click();
    await wait(10);
    expect(rec).to.deep.equal([]);
    expect(el.revealed).to.equal(false);
  });

  it('no hook → one warning, nothing happens', () => {
    const out = captureConsole();
    const el = mk();
    btn(el).click();
    btn(el).click();
    expect(out.filter((s) => s.includes('td-masked-value')).length).to.equal(1);
    expect(btn(el).getAttribute('aria-pressed')).to.equal('false');
    expect(btn(el).hasAttribute('data-state')).to.equal(false);
  });
});

describe('td-masked-value — late results are dropped', () => {
  it('disconnect while pending → signal aborted; a late resolve writes nothing, fires nothing', async () => {
    const el = mk();
    const rec = recordAll(el);
    const h = deferredHook();
    el.reveal = h.fn;
    btn(el).click();
    const parent = el.parentNode;
    el.remove();
    expect(h.calls[0].ctx.signal.aborted).to.equal(true);
    h.calls[0].resolve(SECRET);
    await wait(10);
    noSecret(el, rec);
    expect(rec).to.deep.equal([]);
    parent.appendChild(el);
    await wait();
    expect(btn(el).getAttribute('aria-pressed')).to.equal('false');
    expect(btn(el).hasAttribute('aria-disabled')).to.equal(false);
  });

  it('disconnect while revealed → masked again (no remasked event)', async () => {
    const el = mk();
    const rec = recordAll(el);
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    const parent = el.parentNode;
    el.remove();
    expect(text(el).textContent).to.equal('09xx xxx 123');
    noSecret(el, rec);
    expect(rec.map((r) => r.type)).to.deep.equal(['revealed']);
    parent.appendChild(el);
    await wait();
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    expect(el.revealed).to.equal(true, 'works again after re-connect');
    el.mask();
  });

  it('page hidden (visibilitychange) and pagehide → masked (reason hidden); listeners only while active', async () => {
    const el = mk();
    const rec = recordAll(el);
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    expect(el.revealed).to.equal(false);
    expect(rec[rec.length - 1]).to.deep.equal({ type: 'remasked', detail: { reason: 'hidden' } });
    btn(el).click();
    await wait();
    window.dispatchEvent(new Event('pagehide'));
    expect(el.revealed).to.equal(false);
    noSecret(el, rec);
    // a pending reveal is aborted by pagehide too
    const h = deferredHook();
    el.reveal = h.fn;
    btn(el).click();
    window.dispatchEvent(new Event('pagehide'));
    expect(h.calls[0].ctx.signal.aborted).to.equal(true);
    h.calls[0].resolve(SECRET);
    await wait(10);
    noSecret(el, rec);
  });

  it('masked changed while pending → result dropped, the new masked string shows; while revealed → masked (api)', async () => {
    const el = mk();
    const rec = recordAll(el);
    const h = deferredHook();
    el.reveal = h.fn;
    btn(el).click();
    el.setAttribute('masked', '08xx xxx 999');
    expect(h.calls[0].ctx.signal.aborted).to.equal(true);
    h.calls[0].resolve(SECRET);
    await wait(10);
    expect(text(el).textContent).to.equal('08xx xxx 999');
    noSecret(el, rec);
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    el.setAttribute('masked', '07xx');
    expect(text(el).textContent).to.equal('07xx');
    expect(rec[rec.length - 1]).to.deep.equal({ type: 'remasked', detail: { reason: 'api' } });
    noSecret(el, rec);
  });

  it('mask() and disabled → masked (api); disabled: toggle aria-disabled, clicks do nothing', async () => {
    const el = mk();
    const rec = recordAll(el);
    let n = 0;
    el.reveal = () => { n += 1; return Promise.resolve(SECRET); };
    btn(el).click();
    await wait();
    el.mask();
    expect(el.revealed).to.equal(false);
    btn(el).click();
    await wait();
    el.disabled = true;
    expect(el.revealed).to.equal(false);
    expect(btn(el).getAttribute('aria-disabled')).to.equal('true');
    btn(el).click();
    await wait();
    expect(n).to.equal(2);
    expect(rec.filter((r) => r.type === 'remasked').map((r) => r.detail.reason)).to.deep.equal(['api', 'api']);
    el.disabled = false;
    expect(btn(el).hasAttribute('aria-disabled')).to.equal(false);
    noSecret(el, rec);
  });
});

describe('td-masked-value — hooks', () => {
  it('the static TdMaskedValue.reveal is used when the element has no property; the property wins', async () => {
    const el = mk(' data-id="c-7"');
    const seen = [];
    TdMaskedValue.reveal = ({ element }) => { seen.push(element.dataset.id); return Promise.resolve(SECRET); };
    btn(el).click();
    await wait();
    expect(seen).to.deep.equal(['c-7']);
    el.mask();
    el.reveal = () => Promise.resolve('own');
    btn(el).click();
    await wait();
    expect(text(el).textContent).to.equal('own');
    expect(seen.length).to.equal(1);
    el.mask();
  });

  it('the setter only takes a function: anything else → null + one warning; there is no value getter', () => {
    const out = captureConsole();
    const el = mk();
    el.reveal = 'nope';
    expect(el.reveal).to.equal(null);
    el.reveal = 42;
    expect(out.filter((s) => s.includes('td-masked-value')).length).to.equal(1);
    expect('value' in el).to.equal(false);
  });

  it('el.reveal assigned BEFORE customElements.define (late module, iframe) → used after define, own property gone', async () => {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/td.css"></head><body>'
      + '<td-masked-value label="IMEI" masked="35xxxxxxxxx1234"></td-masked-value></body></html>';
    document.body.appendChild(iframe);
    extra.push(() => iframe.remove());
    await new Promise((r) => { iframe.onload = r; });
    const doc = iframe.contentDocument;
    const el = doc.querySelector('td-masked-value');
    let called = 0;
    el.reveal = () => { called += 1; return Promise.resolve(SECRET); };
    const script = doc.createElement('script');
    script.type = 'module';
    script.textContent = "import '/src/display/td-masked-value.js';";
    doc.head.appendChild(script);
    for (let i = 0; i < 100 && !iframe.contentWindow.customElements.get('td-masked-value'); i += 1) await wait(20);
    await wait(20);
    expect(Object.prototype.hasOwnProperty.call(el, 'reveal')).to.equal(false);
    expect(typeof el.reveal).to.equal('function');
    el.querySelector('button.td-masked__toggle').click();
    await wait(10);
    expect(called).to.equal(1);
    expect(el.querySelector('.td-masked__text').textContent).to.equal(SECRET);
    el.mask();
  });
});

describe('td-masked-value — copyable', () => {
  it('td-copy (sensitive, sm) only while revealed; the value by property; its manual-copy field goes away with it', async () => {
    const el = mk(' copyable');
    const rec = recordAll(el);
    el.reveal = () => Promise.resolve(SECRET);
    expect(!!el.querySelector('td-copy')).to.equal(false);
    btn(el).click();
    await wait();
    const copy = el.querySelector('td-copy');
    expect(!!copy).to.equal(true);
    expect(copy.hasAttribute('sensitive')).to.equal(true);
    expect(copy.getAttribute('size')).to.equal('sm');
    expect(copy.getAttribute('label')).to.equal('Copy SĐT khách');
    expect(copy.hasAttribute('value')).to.equal(false);
    expect(copy.value).to.equal(SECRET);
    // clipboard refused → td-copy shows its manual field holding the value
    const desc = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    extra.push(() => { if (desc) Object.defineProperty(navigator, 'clipboard', desc); else delete navigator.clipboard; });
    copy.querySelector('button').click();
    await wait(20);
    expect(!!el.querySelector('.td-copy__manual')).to.equal(true);
    btn(el).click();
    expect(!!el.querySelector('td-copy')).to.equal(false);
    expect(!!el.querySelector('.td-copy__manual')).to.equal(false);
    noSecret(el, rec);
    expect(rec.filter((r) => r.type === 'copy-error').length).to.equal(1);
  });

  it('copyable turned off while revealed removes the copy button', async () => {
    const el = mk(' copyable');
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    el.removeAttribute('copyable');
    expect(!!el.querySelector('td-copy')).to.equal(false);
    el.mask();
  });
});

describe('td-masked-value — review round 1 (security)', () => {
  it('SEC-1: re-mask clears the td-copy value; a clipboard rejection settling AFTER re-mask creates no manual-copy field (even on the detached node)', async () => {
    const el = mk(' copyable');
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    const copy = el.querySelector('td-copy');
    let reject;
    const desc = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((res, rej) => { reject = rej; }) } });
    extra.push(() => { if (desc) Object.defineProperty(navigator, 'clipboard', desc); else delete navigator.clipboard; });
    copy.querySelector('button').click();
    await wait();
    el.mask();
    expect(copy.isConnected).to.equal(false);
    expect(copy.value).to.equal('');
    reject(new Error('denied'));
    await wait(20);
    expect(copy.value).to.equal('');
    expect(!!copy.querySelector('.td-copy__manual')).to.equal(false, 'no manual field in the detached copy');
    expect(!!document.querySelector('.td-copy__manual')).to.equal(false);
    expect(copy.outerHTML.includes(SECRET)).to.equal(false);
    noSecret(el);
  });

  it('SEC-1: a manual-copy field already shown is blanked and removed on re-mask', async () => {
    const el = mk(' copyable');
    el.reveal = () => Promise.resolve(SECRET);
    btn(el).click();
    await wait();
    const copy = el.querySelector('td-copy');
    const desc = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    extra.push(() => { if (desc) Object.defineProperty(navigator, 'clipboard', desc); else delete navigator.clipboard; });
    copy.querySelector('button').click();
    await wait(20);
    const manual = copy.querySelector('.td-copy__manual');
    expect(!!manual).to.equal(true);
    el.mask();
    expect(manual.value).to.equal('');
    expect(manual.isConnected).to.equal(false);
    expect(!!copy.querySelector('.td-copy__manual')).to.equal(false);
    expect(copy.value).to.equal('');
  });
});

