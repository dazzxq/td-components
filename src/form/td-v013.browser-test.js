import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-button.js';
import './td-toggle.js';
import './td-input-field.js';

// v0.13.0 backlog: TdButton.run(), td-toggle commit() + pending, td-input-field autoresize. td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
const host = document.createElement('div');
host.style.setProperty('width', '420px');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html); return host.lastElementChild; };
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { host.innerHTML = ''; });

describe('TdButton.run()', () => {
  it('busy while running, cleared after resolve; result returned', async () => {
    const b = mount('<td-button>Lưu</td-button>');
    const d = deferred();
    const p = b.run(() => d.promise);
    expect(b.hasAttribute('loading')).to.equal(true);
    expect(b.querySelector('button').getAttribute('aria-busy')).to.equal('true');
    d.resolve(42);
    expect(await p).to.equal(42);
    expect(b.hasAttribute('loading')).to.equal(false);
  });

  it('cleared after reject; error rethrown', async () => {
    const b = mount('<td-button>Lưu</td-button>');
    let caught = null;
    try { await b.run(async () => { throw new Error('boom'); }); } catch (e) { caught = e; }
    expect(caught && caught.message).to.equal('boom');
    expect(b.hasAttribute('loading')).to.equal(false);
  });

  it('re-entrant call returns the same in-flight promise (fn runs once)', async () => {
    const b = mount('<td-button>Lưu</td-button>');
    const d = deferred();
    let calls = 0;
    const fn = () => { calls++; return d.promise; };
    const p1 = b.run(fn);
    const p2 = b.run(fn);
    expect(p1 === p2).to.equal(true);
    d.resolve('ok');
    await p1;
    expect(calls).to.equal(1);
  });

  it('a pre-existing loading state is kept; non-function rejects with TypeError', async () => {
    const b = mount('<td-button loading>Lưu</td-button>');
    await b.run(async () => 1);
    expect(b.hasAttribute('loading')).to.equal(true);
    let err = null;
    try { await b.run(null); } catch (e) { err = e; }
    expect(err instanceof TypeError).to.equal(true);
  });

  it('a button removed while running still clears', async () => {
    const b = mount('<td-button>Lưu</td-button>');
    const d = deferred();
    const p = b.run(() => d.promise);
    b.remove();
    d.resolve();
    await p;
    expect(b.hasAttribute('loading')).to.equal(false);
  });
});

describe('td-toggle commit()', () => {
  it('optimistic + pending, keeps the new state on success, one change per user action', async () => {
    const t = mount('<td-toggle controlled label="Công khai" name="pub"></td-toggle>');
    const form = document.createElement('form');
    host.appendChild(form);
    form.appendChild(t);
    const d = deferred();
    let changes = 0;
    let saved = null;
    t.addEventListener('change', (e) => { changes++; t.commit((v) => { saved = v; return d.promise; }, e.detail.checked); });
    t.querySelector('input').focus();
    await sendKeys({ press: 'Space' });
    expect(t.hasAttribute('checked')).to.equal(true);
    expect(saved).to.equal(true);
    expect(t.querySelector('input').getAttribute('aria-busy')).to.equal('true');
    expect(t.querySelector('.td-switch').hasAttribute('data-pending')).to.equal(true);
    await sendKeys({ press: 'Space' }); // ignored while pending
    await tick();
    expect(changes).to.equal(1);
    expect(t.hasAttribute('checked')).to.equal(true);
    d.resolve(true);
    await tick(); await tick();
    expect(t.hasAttribute('checked')).to.equal(true);
    expect(t.querySelector('input').hasAttribute('aria-busy')).to.equal(false);
    expect(t.querySelector('.td-switch').hasAttribute('data-pending')).to.equal(false);
    expect(new FormData(form).get('pub')).to.equal('on');
  });

  it('resolved false and rejection revert + commit-error', async () => {
    const t = mount('<td-toggle label="x" checked></td-toggle>');
    const errors = [];
    t.addEventListener('commit-error', (e) => errors.push(e.detail));
    expect(await t.commit(async () => false)).to.equal(true);
    expect(t.hasAttribute('checked')).to.equal(true);
    expect(await t.commit(async () => { throw new Error('mạng lỗi'); }, false)).to.equal(true);
    expect(t.hasAttribute('checked')).to.equal(true);
    expect(errors.length).to.equal(2);
    expect(errors[0].checked).to.equal(true);
    expect(errors[1].error.message).to.equal('mạng lỗi');
    expect(await t.commit(async () => undefined)).to.equal(false); // success → keeps the new (off) state
    expect(t.hasAttribute('checked')).to.equal(false);
  });
});

describe('td-input-field autoresize', () => {
  const h = (el) => el.querySelector('.td-field__control').getBoundingClientRect().height;
  it('empty: same height as the fixed textarea with the same rows (default 4 and rows=2)', () => {
    for (const rows of [null, '2']) {
      const r = rows ? ` rows="${rows}"` : '';
      const fixed = mount(`<td-input-field type="textarea" aria-label="a"${r}></td-input-field>`);
      const auto = mount(`<td-input-field type="textarea" aria-label="b" autoresize${r}></td-input-field>`);
      expect(Math.abs(h(auto) - h(fixed)) < 1, `rows=${rows} ${h(auto)} vs ${h(fixed)}`).to.equal(true);
    }
  });

  it('grows with content and stops at the max (then scrolls)', () => {
    const el = mount('<td-input-field type="textarea" aria-label="c" autoresize rows="2"></td-input-field>');
    const ta = el.querySelector('textarea');
    const h0 = h(el);
    if (!CSS.supports('field-sizing', 'content')) return; // progressive enhancement: fixed height elsewhere
    ta.value = Array.from({ length: 6 }, (_, i) => `dòng ${i}`).join('\n');
    const h6 = h(el);
    expect(h6 > h0).to.equal(true);
    ta.value = Array.from({ length: 60 }, (_, i) => `dòng ${i}`).join('\n');
    const h60 = h(el);
    expect(h60 > h6).to.equal(true);
    expect(ta.scrollHeight > ta.clientHeight).to.equal(true); // capped → scrolls
  });
});
