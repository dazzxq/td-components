import { expect } from '@esm-bundle/chai';
import { TdHint } from './td-hint.js';
import './td-input-field.js';

// v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 5–7, Codex plan-review r1 #2 / #6, r2 #10) — standalone
// <td-hint for="id"> in Chromium, Firefox AND WebKit: links itself into the target's aria-describedby (native control →
// the attribute; kit control → the host contract), follows the target (appears later, renamed, removed, replaced) and its
// own id / for, one MutationObserver per root alive while any connected <td-hint for> is there, `hidden` of the site
// always wins. DOM nodes are compared as booleans.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); };
const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function box(html, root = document.body) {
  const d = document.createElement('div');
  d.innerHTML = html;
  root.appendChild(d);
  cleanup.push(() => d.remove());
  return d;
}
const desc = (el) => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const shown = (node) => getComputedStyle(node).display !== 'none';

describe('v0.54.0 <td-hint for> — native control', () => {
  it('appends its id (keeps the page ids, no duplicate) and removes exactly it on disconnect', async () => {
    const d = box('<input id="n1" aria-describedby="page-a"><td-hint for="n1" id="n1-hint">Gợi ý</td-hint>');
    await settle();
    const input = d.querySelector('#n1');
    const hint = d.querySelector('td-hint');
    expect(desc(input)).to.deep.equal(['page-a', 'n1-hint']);
    expect(hint.control === input, 'control getter').to.equal(true);
    expect(hint.htmlFor).to.equal('n1');
    hint.remove();
    await settle();
    expect(desc(input)).to.deep.equal(['page-a']);
  });

  it('server markup already wires the id (no-JS) → no duplicate after upgrade; empty attribute removed on unlink', async () => {
    const d = box('<input id="n2" aria-describedby="n2-hint"><td-hint for="n2" id="n2-hint">Gợi ý</td-hint>');
    await settle();
    const input = d.querySelector('#n2');
    expect(desc(input)).to.deep.equal(['n2-hint']);
    d.querySelector('td-hint').htmlFor = 'nothing-here';
    await settle();
    expect(input.hasAttribute('aria-describedby')).to.equal(false);
  });

  it('an auto id when the hint has none', async () => {
    const d = box('<input id="n3"><td-hint for="n3">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    expect(/^td-hint-\d+$/.test(hint.id)).to.equal(true);
    expect(desc(d.querySelector('#n3'))).to.deep.equal([hint.id]);
  });

  it('the target appears later', async () => {
    const d = box('<td-hint for="late" id="late-hint">Gợi ý</td-hint>');
    await settle();
    expect(d.querySelector('td-hint').control).to.equal(null);
    const input = document.createElement('input');
    input.id = 'late';
    d.appendChild(input);
    await settle();
    expect(desc(input)).to.deep.equal(['late-hint']);
  });

  it('nothing waiting: the linked target is renamed → unlinked; renamed back → linked again', async () => {
    const d = box('<input id="r1" aria-describedby="keep"><td-hint for="r1" id="r1-hint">Gợi ý</td-hint>');
    await settle();
    const input = d.querySelector('#r1');
    expect(desc(input)).to.deep.equal(['keep', 'r1-hint']);
    input.id = 'r1-renamed';
    await settle();
    expect(desc(input)).to.deep.equal(['keep']);
    expect(d.querySelector('td-hint').control).to.equal(null);
    input.id = 'r1';
    await settle();
    expect(desc(input)).to.deep.equal(['keep', 'r1-hint']);
  });

  it('the linked target is removed (token cleaned off the detached node) and re-inserted (linked again)', async () => {
    const d = box('<input id="m1"><td-hint for="m1" id="m1-hint">Gợi ý</td-hint>');
    await settle();
    const input = d.querySelector('#m1');
    input.remove();
    await settle();
    expect(input.hasAttribute('aria-describedby')).to.equal(false);
    d.appendChild(input);
    await settle();
    expect(desc(input)).to.deep.equal(['m1-hint']);
  });

  it('the linked target is replaced by another element with the same id → moves to it, the old one is clean', async () => {
    const d = box('<input id="x1"><td-hint for="x1" id="x1-hint">Gợi ý</td-hint>');
    await settle();
    const old = d.querySelector('#x1');
    const next = document.createElement('textarea');
    next.id = 'x1';
    old.replaceWith(next);
    await settle();
    expect(old.hasAttribute('aria-describedby')).to.equal(false);
    expect(desc(next)).to.deep.equal(['x1-hint']);
  });

  it('for changes → leaves the old target, joins the new one', async () => {
    const d = box('<input id="f1"><input id="f2"><td-hint for="f1" id="f-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    hint.setAttribute('for', 'f2');
    await settle();
    expect(d.querySelector('#f1').hasAttribute('aria-describedby')).to.equal(false);
    expect(desc(d.querySelector('#f2'))).to.deep.equal(['f-hint']);
  });

  it('its own id changes → the stored old token is removed before the new one is added (Codex r2 #10)', async () => {
    const d = box('<input id="i1" aria-describedby="page"><td-hint for="i1" id="old-id">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    hint.id = 'new-id';
    await settle();
    expect(desc(d.querySelector('#i1'))).to.deep.equal(['page', 'new-id']);
  });

  it('own id AND target change in the same tick', async () => {
    const d = box('<input id="j1"><input id="j2"><td-hint for="j1" id="j-old">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    hint.id = 'j-new';
    hint.htmlFor = 'j2';
    await settle();
    expect(d.querySelector('#j1').hasAttribute('aria-describedby')).to.equal(false);
    expect(desc(d.querySelector('#j2'))).to.deep.equal(['j-new']);
  });

  it('the site hides the hint → display none (hidden wins) and its id leaves the description; shown → back', async () => {
    const d = box('<input id="h1"><td-hint for="h1" id="h1-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    expect(shown(hint)).to.equal(true);
    hint.hidden = true;
    await settle();
    expect(shown(hint)).to.equal(false);
    expect(d.querySelector('#h1').hasAttribute('aria-describedby')).to.equal(false);
    hint.hidden = false;
    await settle();
    expect(desc(d.querySelector('#h1'))).to.deep.equal(['h1-hint']);
  });

  it('hidden × data-td-suppressed: the four combinations', async () => {
    const d = box('<td-hint for="none">Gợi ý</td-hint>');
    const hint = d.querySelector('td-hint');
    for (const [h, s, want] of [[false, false, true], [true, false, false], [false, true, false], [true, true, false]]) {
      hint.hidden = h;
      hint.toggleAttribute('data-td-suppressed', s);
      expect(shown(hint), `hidden=${h} suppressed=${s}`).to.equal(want);
    }
  });

  it('rich content: the page nodes are kept as they are (never re-rendered)', async () => {
    const d = box('<input id="rc"><td-hint for="rc" id="rc-hint">Xem <a href="#d">điều khoản</a>, mã <code>X-1</code></td-hint>');
    const a = d.querySelector('a');
    await settle();
    expect(d.querySelector('td-hint a') === a, 'same anchor node').to.equal(true);
    expect(d.querySelector('td-hint').textContent).to.equal('Xem điều khoản, mã X-1');
  });

  it('a different tree scope (target inside a shadow root, hint in the document) → no link', async () => {
    const host = box('<div></div>').firstElementChild;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<input id="sh1">';
    box('<td-hint for="sh1">Gợi ý</td-hint>');
    await settle();
    expect(sr.querySelector('input').hasAttribute('aria-describedby')).to.equal(false);
  });

  it('hint and target in the SAME open shadow root → linked', async () => {
    const host = box('<div></div>').firstElementChild;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<input id="sh2"><td-hint for="sh2" id="sh2-hint">Gợi ý</td-hint>';
    await settle();
    expect(desc(sr.querySelector('input'))).to.deep.equal(['sh2-hint']);
    const late = document.createElement('input');
    late.id = 'sh3';
    sr.querySelector('td-hint').htmlFor = 'sh3';
    sr.appendChild(late);
    await settle();
    expect(desc(late)).to.deep.equal(['sh2-hint']);
    expect(sr.querySelector('#sh2').hasAttribute('aria-describedby')).to.equal(false);
  });
});

describe('v0.54.0 <td-hint for> — one observer per root (Codex r1 #2)', () => {
  it('one observer for several hints (waiting and linked); disconnected with the last hint of the root', async () => {
    const before = TdHint._observedRoots();
    const d = box('<input id="o1"><td-hint for="o1">a</td-hint><td-hint for="o-wait">b</td-hint><td-hint for="o1">c</td-hint>');
    await settle();
    expect(TdHint._observedRoots()).to.equal(before + (before ? 0 : 1));
    d.remove();
    cleanup.length = 0;
    await settle();
    expect(TdHint._observedRoots()).to.equal(0);
  });
});

describe('v0.54.0 <td-hint for> — kit control target', () => {
  it('links through the host contract: in the inner control\'s description, survives a re-render', async () => {
    const d = box('<td-input-field id="k1" label="Mã số thuế"></td-input-field><td-hint for="k1" id="k1-ext">Xem <a href="#">hướng dẫn</a></td-hint>');
    await settle();
    const el = d.querySelector('td-input-field');
    const hint = d.querySelector('td-hint');
    expect(desc(el._ariaTarget())).to.include('k1-ext');
    expect(hint.control === el, 'control = the kit host').to.equal(true);
    el.setAttribute('type', 'email'); // structural re-render: new control node
    await settle();
    expect(desc(el._ariaTarget())).to.include('k1-ext');
    hint.remove();
    await settle();
    expect(desc(el._ariaTarget())).to.not.include('k1-ext');
  });

  it('a target defined later (td-* not upgraded yet) is linked after define', async () => {
    const d = box('<td-v054-late id="k2"></td-v054-late><td-hint for="k2" id="k2-ext">Gợi ý</td-hint>');
    await settle();
    const { TdInputField } = await import('./td-input-field.js');
    customElements.define('td-v054-late', class extends TdInputField {});
    await settle();
    const el = d.querySelector('#k2');
    expect(desc(el._ariaTarget())).to.include('k2-ext');
  });

  it('the kit error rule: suppressed while the host shows an error (data-td-suppressed, out of the description)', async () => {
    const d = box('<td-input-field id="k3" label="A"></td-input-field><td-hint for="k3" id="k3-ext">Gợi ý</td-hint>');
    await settle();
    const el = d.querySelector('td-input-field');
    const hint = d.querySelector('td-hint');
    el.setError('Sai');
    expect(hint.hasAttribute('data-td-suppressed')).to.equal(true);
    expect(desc(el._ariaTarget())).to.not.include('k3-ext');
    // renamed while suppressed: back with the NEW token once the error clears (Codex r2 #10)
    hint.id = 'k3-new';
    await settle();
    el.clearError();
    expect(hint.hasAttribute('data-td-suppressed')).to.equal(false);
    expect(desc(el._ariaTarget())).to.include('k3-new');
    expect(desc(el._ariaTarget())).to.not.include('k3-ext');
  });

  it('own id change on a kit target → old token gone, new token in', async () => {
    const d = box('<td-input-field id="k4" label="A"></td-input-field><td-hint for="k4" id="k4-a">Gợi ý</td-hint>');
    await settle();
    const el = d.querySelector('td-input-field');
    d.querySelector('td-hint').id = 'k4-b';
    await settle();
    expect(desc(el._ariaTarget())).to.include('k4-b');
    expect(desc(el._ariaTarget())).to.not.include('k4-a');
  });

  it('a native control with aria-invalid does NOT hide the hint (QĐ 7)', async () => {
    const d = box('<input id="k5" aria-invalid="true"><td-hint for="k5" id="k5-hint">Gợi ý</td-hint>');
    await settle();
    expect(desc(d.querySelector('#k5'))).to.deep.equal(['k5-hint']);
    expect(d.querySelector('td-hint').hasAttribute('data-td-suppressed')).to.equal(false);
  });
});

describe('v0.54.0 <td-hint> — Codex impl r1 #4 / #5 (lifecycle, one whenDefined wait)', () => {
  it('#4 removing `for` unlinks, stops watching the root, forgets it; setting it again links again', async () => {
    const before = TdHint._observedRoots();
    const d = box('<input id="lf1" aria-describedby="keep"><td-hint for="lf1" id="lf1-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    expect(TdHint._observedRoots()).to.equal(Math.max(before, 1));
    hint.removeAttribute('for');
    await settle();
    expect(desc(d.querySelector('#lf1'))).to.deep.equal(['keep']);
    expect(hint.control).to.equal(null);
    expect(hint._root).to.equal(null);
    expect(TdHint._observedRoots()).to.equal(before);
    hint.setAttribute('for', 'lf1');
    await settle();
    expect(desc(d.querySelector('#lf1'))).to.deep.equal(['keep', 'lf1-hint']);
  });

  it('#4 a connected standalone hint that loses its id gets a new automatic id; the old token leaves, the new joins', async () => {
    const d = box('<input id="lf2"><td-hint for="lf2" id="lf2-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    hint.removeAttribute('id');
    await settle();
    expect(/^td-hint-\d+$/.test(hint.id), `auto id ${hint.id}`).to.equal(true);
    expect(desc(d.querySelector('#lf2'))).to.deep.equal([hint.id]);
    hint.id = '';
    await settle();
    expect(/^td-hint-\d+$/.test(hint.id)).to.equal(true);
    expect(desc(d.querySelector('#lf2'))).to.deep.equal([hint.id]);
  });

  it('#5 thousands of unrelated mutations while the kit target is undefined → ONE whenDefined registration', async () => {
    const real = customElements.whenDefined.bind(customElements);
    let calls = 0;
    customElements.whenDefined = (t) => { if (t === 'td-v054-burst') calls += 1; return real(t); };
    cleanup.push(() => { customElements.whenDefined = real; });
    const d = box('<td-v054-burst id="bu1"></td-v054-burst><td-hint for="bu1" id="bu1-hint">Gợi ý</td-hint>');
    await settle();
    for (let i = 0; i < 2000; i++) {
      const s = document.createElement('span');
      s.id = `noise-${i}`;
      d.appendChild(s);
      if (i % 200 === 0) await tick();
    }
    await settle();
    expect(calls, 'whenDefined registrations').to.equal(1);
    const { TdInputField } = await import('./td-input-field.js');
    customElements.define('td-v054-burst', class extends TdInputField {});
    await settle();
    expect(desc(d.querySelector('#bu1')._ariaTarget())).to.include('bu1-hint');
  });

  it('#5 disconnected before the late definition → nothing linked, no error; the wait does not leak into a re-connect', async () => {
    const d = box('<td-v054-late2 id="lt2"></td-v054-late2><td-hint for="lt2" id="lt2-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    expect(hint._wait).to.equal('td-v054-late2');
    hint.remove();
    expect(hint._wait).to.equal(null);
    const { TdInputField } = await import('./td-input-field.js');
    customElements.define('td-v054-late2', class extends TdInputField {});
    await settle();
    expect(hint.control).to.equal(null);
    expect(desc(d.querySelector('#lt2')._ariaTarget())).to.not.include('lt2-hint');
    d.appendChild(hint); // back: links through the (now defined) contract
    await settle();
    expect(desc(d.querySelector('#lt2')._ariaTarget())).to.include('lt2-hint');
  });

  it('#5 the target changes to another element while waiting → the wait is dropped (generation), the new target linked', async () => {
    const d = box('<td-v054-late3 id="lt3"></td-v054-late3><input id="lt3b"><td-hint for="lt3" id="lt3-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    expect(hint._wait).to.equal('td-v054-late3');
    hint.htmlFor = 'lt3b';
    await settle();
    expect(hint._wait).to.equal(null);
    expect(desc(d.querySelector('#lt3b'))).to.deep.equal(['lt3-hint']);
    const { TdInputField } = await import('./td-input-field.js');
    customElements.define('td-v054-late3', class extends TdInputField {});
    await settle();
    expect(desc(d.querySelector('#lt3')._ariaTarget())).to.not.include('lt3-hint');
    expect(hint.control === d.querySelector('#lt3b')).to.equal(true);
  });
});

// Codex impl r2 (security): ONE customElements.whenDefined(tag) per tag for the module lifetime — a per-tag broker; hints
// subscribe / unsubscribe; re-arming never attaches another reaction to the pending promise.
describe('v0.54.0 <td-hint> — one whenDefined per tag (broker, Codex impl r2)', () => {
  const flush = async () => { for (let i = 0; i < 4; i++) await null; };
  function spy() {
    const real = customElements.whenDefined.bind(customElements);
    const calls = new Map();
    customElements.whenDefined = (t) => { calls.set(t, (calls.get(t) || 0) + 1); return real(t); };
    cleanup.push(() => { customElements.whenDefined = real; });
    return calls;
  }

  it('2 000× target removed / restored → exactly one whenDefined for the tag', async () => {
    const calls = spy();
    const d = box('<td-v054-b1 id="b1"></td-v054-b1><td-hint for="b1" id="b1-hint">Gợi ý</td-hint>');
    await settle();
    const target = d.querySelector('#b1');
    for (let i = 0; i < 2000; i++) {
      target.remove();
      await flush();
      d.prepend(target);
      await flush();
    }
    await settle();
    expect(calls.get('td-v054-b1')).to.equal(1);
  });

  it('2 000× hint disconnected / reconnected → exactly one whenDefined for the tag', async () => {
    const calls = spy();
    const d = box('<td-v054-b2 id="b2"></td-v054-b2><td-hint for="b2" id="b2-hint">Gợi ý</td-hint>');
    await settle();
    const hint = d.querySelector('td-hint');
    for (let i = 0; i < 2000; i++) {
      hint.remove();
      d.appendChild(hint);
    }
    await settle();
    expect(calls.get('td-v054-b2')).to.equal(1);
  });

  it('2 000× structural renders of a kit control holding an extra child <td-hint for> → exactly one whenDefined', async () => {
    const calls = spy();
    const d = box('<td-v054-b3 id="b3"></td-v054-b3><td-input-field id="host-b3" label="A"><td-hint>Của control</td-hint><td-hint for="b3" id="b3-hint">Ngoài</td-hint></td-input-field>');
    await settle();
    const el = d.querySelector('td-input-field');
    for (let i = 0; i < 2000; i++) el.setAttribute('type', i % 2 ? 'text' : 'email');
    await settle();
    expect(calls.get('td-v054-b3')).to.equal(1);
    expect(document.getElementById('b3-hint')?.parentElement === el, 'the extra hint is still the page\'s child').to.equal(true);
  });

  it('the late definition revalidates only live connected subscribers', async () => {
    const calls = spy();
    const d = box('<td-v054-b4 id="b4"></td-v054-b4><td-hint for="b4" id="b4-on">Một</td-hint><td-hint for="b4" id="b4-off">Hai</td-hint>');
    await settle();
    const off = d.querySelector('#b4-off');
    off.remove();
    const { TdInputField } = await import('./td-input-field.js');
    customElements.define('td-v054-b4', class extends TdInputField {});
    await settle();
    const t = desc(d.querySelector('#b4')._ariaTarget());
    expect(t).to.include('b4-on');
    expect(t).to.not.include('b4-off');
    expect(off.control).to.equal(null);
    expect(calls.get('td-v054-b4')).to.equal(1);
  });

  it('only kit tags (td-*) wait: a site custom element target links natively at once', async () => {
    const calls = spy();
    const d = box('<my-widget id="w1"></my-widget><td-hint for="w1" id="w1-hint">Gợi ý</td-hint>');
    await settle();
    expect(calls.get('my-widget')).to.equal(undefined);
    expect(desc(d.querySelector('#w1'))).to.deep.equal(['w1-hint']);
  });
});
