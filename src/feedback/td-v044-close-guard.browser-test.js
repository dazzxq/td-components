// v0.44.0 (plan v0.44.0-confirm-dirty §B, QĐ 12-17) — async close guards: TdModal.show({ beforeClose }) +
// TdModal.requestClose(), <td-drawer>.beforeClose + requestClose() + TdDrawer.open({ beforeClose }).
// DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};
const deferred = () => { let resolve; let reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const isOpen = (id) => !!document.getElementById(id) && document.getElementById(id).getAttribute('data-state') !== 'closing';
const quiet = async (method, fn) => {
  const orig = console[method];
  const calls = [];
  console[method] = (...a) => calls.push(a);
  try { await fn(); } finally { console[method] = orig; }
  return calls;
};

async function showModal(opts = {}) {
  const calls = [];
  let closes = [];
  const id = TdModal.show({
    title: 'Sửa',
    body: '<input name="a">',
    actions: [{ label: 'Hủy', value: 'cancel' }, { label: 'Lưu', variant: 'primary', value: 'save' }],
    onClose: (v) => closes.push(v),
    ...opts,
    beforeClose: opts.beforeClose === undefined ? undefined : (ctx) => { calls.push(ctx); return opts.beforeClose(ctx); },
  });
  const root = document.getElementById(id);
  await until(() => root.getAttribute('data-state') === 'open');
  const [cancel, save] = root.querySelectorAll('.td-modal__footer button');
  return { id, root, calls, closes: () => closes, x: root.querySelector('.td-modal__close'), cancel, save };
}

afterEach(async () => {
  TdModal.closeAll();
  for (const d of document.querySelectorAll('td-drawer')) { if (d.open) d._releaseNow?.(); d.remove(); }
  await frames(2);
});

describe('TdModal beforeClose / requestClose (v0.44.0 QĐ 12-15)', () => {
  it('reason / value for X, action, escape (escapeCloses) and requestClose; false keeps it open', async () => {
    const m = await showModal({ beforeClose: () => false, escapeCloses: true });
    m.x.click();
    m.cancel.click();
    m.save.click();
    m.root.querySelector('input').focus();
    await sendKeys({ press: 'Escape' });
    const r = await TdModal.requestClose(m.id, 42);
    expect(r).to.equal(false);
    expect(m.calls.map((c) => [c.reason, c.value])).to.deep.equal([
      ['button', undefined], ['action', 'cancel'], ['action', 'save'], ['escape', undefined], ['request', 42]]);
    expect(isOpen(m.id)).to.equal(true);
    expect(m.closes()).to.deep.equal([]);
  });

  it('Promise false / throw / reject keep it open (+ console.error); true / undefined close, onClose once with the value', async () => {
    let m = await showModal({ beforeClose: () => Promise.resolve(false) });
    expect(await TdModal.requestClose(m.id)).to.equal(false);
    expect(isOpen(m.id)).to.equal(true);
    let errors = await quiet('error', async () => {
      m = await showModal({ beforeClose: () => { throw new Error('boom'); } });
      expect(await TdModal.requestClose(m.id)).to.equal(false);
    });
    expect(errors.length).to.equal(1);
    expect(isOpen(m.id)).to.equal(true);
    errors = await quiet('error', async () => {
      m = await showModal({ beforeClose: () => Promise.reject(new Error('no')) });
      expect(await TdModal.requestClose(m.id)).to.equal(false);
    });
    expect(errors.length).to.equal(1);
    expect(isOpen(m.id)).to.equal(true);
    TdModal.closeAll();

    m = await showModal({ beforeClose: () => Promise.resolve(true) });
    m.save.click();
    await until(() => !isOpen(m.id));
    expect(m.closes()).to.deep.equal(['save']);
    m = await showModal({ beforeClose: () => undefined });
    m.x.click(); // sync undefined → closes at once
    expect(isOpen(m.id)).to.equal(false);
    expect(m.closes()).to.deep.equal([undefined]);
    m = await showModal({ beforeClose: () => true });
    expect(await TdModal.requestClose(m.id, 'v')).to.equal(true);
    expect(m.closes()).to.deep.equal(['v']);
  });

  it('closeById / closeAll / close() bypass the guard', async () => {
    let m = await showModal({ beforeClose: () => false });
    TdModal.closeById(m.id);
    expect(isOpen(m.id)).to.equal(false);
    m = await showModal({ beforeClose: () => false });
    TdModal.close();
    expect(isOpen(m.id)).to.equal(false);
    m = await showModal({ beforeClose: () => false });
    TdModal.closeAll();
    expect(isOpen(m.id)).to.equal(false);
    expect(m.calls.length).to.equal(0);
    expect(await TdModal.requestClose('td-modal-nope')).to.equal(false);
  });

  it('while the guard is pending: more X clicks / requests share it (guard called once), actions do not run', async () => {
    const d = deferred();
    let ran = 0;
    const m = await showModal({
      beforeClose: () => d.p,
      actions: [{ label: 'Lưu', value: 'save', onClick: () => { ran++; } }],
    });
    m.x.click();
    m.x.click();
    m.x.click();
    const p1 = TdModal.requestClose(m.id);
    m.root.querySelector('.td-modal__footer button').click();
    expect(m.calls.length).to.equal(1);
    expect(ran).to.equal(0);
    expect(m.root.querySelector('.td-modal__footer button').getAttribute('aria-busy')).to.equal(null); // no spinner
    d.resolve(true);
    expect(await p1).to.equal(true);
    expect(isOpen(m.id)).to.equal(false);
    expect(m.closes().length).to.equal(1);
  });

  it('closeAll() while the guard is pending: the late result does nothing, no error', async () => {
    const d = deferred();
    const m = await showModal({ beforeClose: () => d.p });
    const p = TdModal.requestClose(m.id);
    TdModal.closeAll();
    const errors = await quiet('error', async () => {
      d.resolve(false);
      await p;
      await frames(2);
    });
    expect(errors.length).to.equal(0);
    expect(isOpen(m.id)).to.equal(false);
    expect(m.closes().length).to.equal(1);
  });

  it('nested: the guard opens TdModal.confirm on top; Escape is swallowed by it; Cancel → focus back to the lower dialog', async () => {
    const m = await showModal({ beforeClose: () => TdModal.confirm({ title: 'Bỏ thay đổi?', confirmVariant: 'danger' }) });
    m.x.click();
    const confirmRoot = () => [...document.querySelectorAll('body > .td-modal:not([data-state="closing"])')].pop();
    await until(() => confirmRoot() !== m.root && confirmRoot().getAttribute('data-state') === 'open');
    const top = confirmRoot();
    await until(() => top.contains(document.activeElement));
    await sendKeys({ press: 'Escape' });
    await frames(2);
    expect(isOpen(top.id)).to.equal(true);
    expect(isOpen(m.id)).to.equal(true);
    top.querySelector('.td-modal__footer button').click(); // Hủy
    await until(() => m.root.contains(document.activeElement));
    expect(isOpen(m.id)).to.equal(true);
    await frames(1); // the refused guard's Promise chain settles (microtasks) — a real user cannot click sooner
    // second attempt, confirm "discard" → closes
    m.x.click();
    await until(() => confirmRoot() !== m.root);
    const top2 = confirmRoot();
    [...top2.querySelectorAll('.td-modal__footer button')].pop().click();
    await until(() => !isOpen(m.id));
    expect(m.closes()).to.deep.equal([undefined]);
  });

  it('r2 E: a guard result whose `then` getter throws → stays open, requestClose false, only the fixed log', async () => {
    const evil = { get then() { throw new Error('SECRET'); } };
    let m;
    const errors = await quiet('error', async () => {
      m = await showModal({ beforeClose: () => evil });
      expect(await TdModal.requestClose(m.id)).to.equal(false);
      m.x.click();
      await frames(2);
    });
    expect(isOpen(m.id)).to.equal(true);
    expect(errors.length).to.equal(2);
    expect(errors.every((a) => a.length === 1 && typeof a[0] === 'string' && !a[0].includes('SECRET'))).to.equal(true);
  });

  it('r3 E: `then` is read exactly once; the captured function decides (false keeps it open); a getter fn-then-undefined never closes', async () => {
    let reads = 0;
    const once = { get then() { reads++; return (res) => res(false); } };
    let m = await showModal({ beforeClose: () => once });
    expect(await TdModal.requestClose(m.id)).to.equal(false);
    expect(reads).to.equal(1);
    expect(isOpen(m.id)).to.equal(true);
    TdModal.closeAll();
    let n = 0;
    const flip = { get then() { n++; return n === 1 ? (res) => res(false) : undefined; } };
    m = await showModal({ beforeClose: () => flip });
    expect(await TdModal.requestClose(m.id)).to.equal(false);
    expect(isOpen(m.id)).to.equal(true);
    expect(m.closes()).to.deep.equal([]);
    TdModal.closeAll();
    // a captured `then` that throws → refusal + fixed log
    const errors = await quiet('error', async () => {
      m = await showModal({ beforeClose: () => ({ then() { throw new Error('SECRET'); } }) });
      expect(await TdModal.requestClose(m.id)).to.equal(false);
    });
    expect(isOpen(m.id)).to.equal(true);
    expect(errors.every((a) => a.length === 1 && !String(a[0]).includes('SECRET'))).to.equal(true);
  });

  it('r4 E2: a synchronous thenable whose then() re-enters requestClose → guard once, same pending Promise, no recursion', async () => {
    let calls = 0;
    let inner = null;
    let outer = null;
    let id = '';
    const m = await showModal({
      beforeClose: () => {
        calls++;
        return { then(res) { if (!inner) inner = TdModal.requestClose(id); res(false); } };
      },
    });
    id = m.id;
    outer = TdModal.requestClose(id);
    expect(await outer).to.equal(false);
    expect(await inner).to.equal(false);
    expect(inner === outer).to.equal(true);
    expect(calls).to.equal(1);
    expect(isOpen(m.id)).to.equal(true);
    expect(m.closes()).to.deep.equal([]);
  });

  it('a Promise dialog ignores beforeClose (not an option of confirm)', async () => {
    let called = 0;
    const p = TdModal.confirm({ beforeClose: () => { called++; return false; } });
    const root = [...document.querySelectorAll('body > .td-modal')].pop();
    root.querySelector('.td-modal__close').click();
    expect(await p).to.equal(false);
    expect(called).to.equal(0);
  });
});

function mountDrawer(attrs = '') {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<td-drawer label="Sửa" ${attrs}><input name="a"></td-drawer>`;
  document.body.appendChild(wrap);
  return /** @type {any} */ (wrap.querySelector('td-drawer'));
}
const drawerRoot = () => [...document.querySelectorAll('body > .td-drawer-root:not([data-state="closing"])')].pop();

describe('<td-drawer> beforeClose / requestClose (v0.44.0 QĐ 16)', () => {
  it('hook runs for escape / backdrop / × / requestClose BEFORE the event; a refusal → no before-close event', async () => {
    const host = mountDrawer();
    const log = [];
    host.beforeClose = ({ reason }) => { log.push(['hook', reason]); return false; };
    host.addEventListener('before-close', (e) => log.push(['event', e.detail.reason]));
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    await sendKeys({ press: 'Escape' });
    drawerRoot().querySelector('.td-drawer__backdrop').click();
    drawerRoot().querySelector('.td-drawer__close').click();
    expect(await host.requestClose()).to.equal(null);
    expect(log).to.deep.equal([['hook', 'escape'], ['hook', 'backdrop'], ['hook', 'button'], ['hook', 'request']]);
    expect(host.open).to.equal(true);
    expect(host.hasAttribute('open')).to.equal(true);
  });

  it('hook agrees → the cancelable event still runs (and can still cancel); then it closes', async () => {
    const host = mountDrawer();
    const log = [];
    let cancel = true;
    host.beforeClose = ({ reason }) => { log.push(['hook', reason]); return Promise.resolve(true); };
    host.addEventListener('before-close', (e) => { log.push(['event', e.detail.reason]); if (cancel) e.preventDefault(); });
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    expect(await host.requestClose()).to.equal(null);
    expect(host.open).to.equal(true);
    cancel = false;
    drawerRoot().querySelector('.td-drawer__close').click();
    await until(() => !host.open && !drawerRoot());
    expect(log).to.deep.equal([['hook', 'request'], ['event', 'request'], ['hook', 'button'], ['event', 'button']]);
  });

  it('close() / open=false / removing [open] skip the hook but still fire before-close (v0.27 contract)', async () => {
    const host = mountDrawer();
    let hook = 0;
    const events = [];
    host.beforeClose = () => { hook++; return false; };
    host.addEventListener('before-close', (e) => events.push(e.detail.reason));
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    expect(await host.close()).to.equal('programmatic');
    host.show();
    host.open = false;
    await until(() => !drawerRoot());
    host.show();
    host.removeAttribute('open');
    await until(() => !drawerRoot());
    expect(hook).to.equal(0);
    expect(events).to.deep.equal(['programmatic', 'programmatic', 'programmatic']);
  });

  it('pending hook: more requests share one Promise (hook once); throw / reject keep it open + console.error', async () => {
    const host = mountDrawer();
    const d = deferred();
    let hook = 0;
    host.beforeClose = () => { hook++; return d.p; };
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    const p1 = host.requestClose();
    const p2 = host.requestClose();
    drawerRoot().querySelector('.td-drawer__close').click();
    expect(p1 === p2).to.equal(true);
    expect(hook).to.equal(1);
    d.resolve(true);
    expect(await p1).to.equal('request');
    host.beforeClose = () => { throw new Error('x'); };
    host.show();
    let errors = await quiet('error', async () => { expect(await host.requestClose()).to.equal(null); });
    expect(errors.length).to.equal(1);
    host.beforeClose = () => Promise.reject(new Error('y'));
    errors = await quiet('error', async () => { expect(await host.requestClose()).to.equal(null); });
    expect(errors.length).to.equal(1);
    expect(host.open).to.equal(true);
  });

  it('r2 E: a hook result whose `then` getter throws → stays open, requestClose null, only the fixed log', async () => {
    const host = mountDrawer();
    host.beforeClose = () => ({ get then() { throw new Error('SECRET'); } });
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    const errors = await quiet('error', async () => {
      expect(await host.requestClose()).to.equal(null);
      drawerRoot().querySelector('.td-drawer__close').click();
      await frames(2);
    });
    expect(host.open).to.equal(true);
    expect(errors.length).to.equal(2);
    expect(errors.every((a) => a.length === 1 && typeof a[0] === 'string' && !a[0].includes('SECRET'))).to.equal(true);
  });

  it('r3 E: `then` read exactly once; captured false keeps it open; a getter fn-then-undefined never closes', async () => {
    const host = mountDrawer();
    let reads = 0;
    host.beforeClose = () => ({ get then() { reads++; return (res) => res(false); } });
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    expect(await host.requestClose()).to.equal(null);
    expect(reads).to.equal(1);
    let n = 0;
    host.beforeClose = () => ({ get then() { n++; return n === 1 ? (res) => res(false) : undefined; } });
    expect(await host.requestClose()).to.equal(null);
    expect(host.open).to.equal(true);
    const errors = await quiet('error', async () => {
      host.beforeClose = () => ({ then() { throw new Error('SECRET'); } });
      expect(await host.requestClose()).to.equal(null);
    });
    expect(host.open).to.equal(true);
    expect(errors.every((a) => a.length === 1 && !String(a[0]).includes('SECRET'))).to.equal(true);
  });

  it('r4 E2: a synchronous thenable whose then() re-enters requestClose → hook once, same pending Promise, no recursion', async () => {
    const host = mountDrawer();
    let calls = 0;
    let inner = null;
    let events = 0;
    host.addEventListener('before-close', () => { events++; });
    host.beforeClose = () => {
      calls++;
      return { then(res) { if (!inner) inner = host.requestClose(); res(true); } };
    };
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    const outer = host.requestClose();
    expect(await outer).to.equal('request');
    expect(await inner).to.equal('request');
    expect(inner === outer).to.equal(true);
    expect(calls).to.equal(1);
    expect(events).to.equal(1); // one close, no duplicate before-close
  });

  it('drawer removed from the DOM while the hook waits: no error, TdDrawer.open().closed settles', async () => {
    const d = deferred();
    const h = TdDrawer.open({ title: 'Sửa', body: 'x', beforeClose: () => d.p });
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    const p = h.element.requestClose();
    h.element.remove();
    expect(await h.closed).to.equal('programmatic');
    const errors = await quiet('error', async () => { d.resolve(true); expect(await p).to.equal(null); });
    expect(errors.length).to.equal(0);
  });

  it('dismissible="false": Escape / backdrop never call the hook; × does', async () => {
    const host = mountDrawer('dismissible="false"');
    const seen = [];
    host.beforeClose = ({ reason }) => { seen.push(reason); return false; };
    host.show();
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    await sendKeys({ press: 'Escape' });
    drawerRoot().querySelector('.td-drawer__backdrop').click();
    drawerRoot().querySelector('.td-drawer__close').click();
    expect(seen).to.deep.equal(['button']);
  });

  it('a beforeClose set before the element upgrades is kept; non-functions → null; TdDrawer.open({ beforeClose })', async () => {
    const tpl = document.createElement('template');
    tpl.innerHTML = '<td-drawer label="A"></td-drawer>';
    const d = /** @type {any} */ (tpl.content.firstElementChild);
    expect(d instanceof TdDrawer).to.equal(false); // inert template content: not upgraded yet
    const fn = () => false;
    d.beforeClose = fn;
    const wrap = document.createElement('div');
    wrap.appendChild(tpl.content);
    document.body.appendChild(wrap);
    const up = /** @type {any} */ (wrap.firstElementChild);
    expect(up instanceof TdDrawer).to.equal(true);
    expect(up.beforeClose === fn).to.equal(true);
    up.beforeClose = 'nope';
    expect(up.beforeClose).to.equal(null);
    wrap.remove();
    const seen = [];
    const h = TdDrawer.open({ title: 'B', body: 'x', beforeClose: ({ reason }) => { seen.push(reason); return false; } });
    await until(() => drawerRoot()?.getAttribute('data-state') === 'open');
    await sendKeys({ press: 'Escape' });
    expect(seen).to.deep.equal(['escape']);
    expect(await h.requestClose()).to.equal(null);
    h.close();
  });
});
