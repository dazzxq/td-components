import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { tabSequence, deepActiveElement, composedContains, composedClosest } from './layers.js';
import '../../test/fixtures/shadow-controls.js';

// v0.53.0 M1 (plan docs/internal/plans/v0.53.0-menu-custom-item.md QĐ 3, Codex plan-review r1 #2): the focus stops of a
// TdMenu custom row — radio groups collapsed, open shadow roots / slots / delegatesFocus walked, closed roots = the
// host — checked against NATIVE Tab in Chromium, Firefox and WebKit.

const host = document.createElement('div');
document.body.appendChild(host);
const name = (el) => (el ? el.dataset?.k || el.id || el.localName : '∅');
const seq = (root) => tabSequence(root).map(name);
// WebKit's native Tab (Safari default, "Press Tab to highlight each item" off) skips buttons / radios / links: there
// the native walk must be an in-order SUBSEQUENCE of tabSequence (the menu moves Tab itself, so every stop is reached
// in every engine); Chromium / Firefox must match exactly.
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
/** ids of every radio under `root`, including open shadow roots. */
function radioIds(root = document.body, out = new Set()) {
  for (const el of root.querySelectorAll('*')) {
    if (el.localName === 'input' && el.type === 'radio' && el.id) out.add(el.id);
    if (el.shadowRoot) radioIds(el.shadowRoot, out);
  }
  return out;
}

function matchesNative(nat, ours) {
  if (!WEBKIT) return expect(nat).to.deep.equal(ours);
  // WebKit: native Tab skips buttons / radios by default (macOS) and enters an unchecked radio group at a platform-dependent
  // member (Linux CI enters at the last one) — compare the order of the non-radio stops only; the kit's own radio choice is
  // asserted exactly by the radio-group tests below
  const radios = radioIds();
  nat = nat.filter((k) => !radios.has(k));
  ours = ours.filter((k) => !radios.has(k));
  let i = 0;
  for (const k of ours) if (nat[i] === k) i += 1;
  expect(i, `${JSON.stringify(nat)} ⊄ ${JSON.stringify(ours)}`).to.equal(nat.length);
  return expect(nat.length).to.be.greaterThan(0);
}

/** Mount `html` between two sentinels; returns the box. */
function mount(html) {
  host.innerHTML = `<input id="before" aria-label="trước"><div id="box">${html}</div><input id="after" aria-label="sau">`;
  return host.querySelector('#box');
}

/** Native Tab walk from #before to #after (or Shift+Tab backwards), deep active element names. */
async function nativeWalk(backward = false) {
  document.getElementById(backward ? 'after' : 'before').focus();
  const out = [];
  for (let i = 0; i < 40; i++) {
    await sendKeys({ press: backward ? 'Shift+Tab' : 'Tab' });
    const a = deepActiveElement();
    if (!a || a.id === (backward ? 'before' : 'after') || a === document.body) break;
    out.push(name(a));
  }
  return backward ? out.reverse() : out;
}

afterEach(() => { host.innerHTML = ''; });

describe('v0.53 tabSequence — light DOM', () => {
  it('collapses a named radio group to its checked radio; unnamed radios are their own stops', () => {
    const box = mount(`<button type="button" id="a">A</button>
      <input type="radio" name="g" id="g1"><input type="radio" name="g" id="g2" checked><input type="radio" name="g" id="g3">
      <input type="radio" id="u1"><input type="radio" id="u2"><button type="button" id="b">B</button>`);
    expect(seq(box)).to.deep.equal(['a', 'g2', 'u1', 'u2', 'b']);
    expect(seq(box)).to.deep.equal(['a', 'g2', 'u1', 'u2', 'b']);
  });

  it('no checked radio → the first enabled radio (both directions, as native); disabled ones never count', () => {
    const box = mount(`<input type="radio" name="g" id="g1" disabled><input type="radio" name="g" id="g2">
      <input type="radio" name="g" id="g3"><input type="radio" name="g" id="g4" disabled>
      <input type="radio" name="x" id="x1" disabled><input type="radio" name="x" id="x2" disabled>`);
    expect(seq(box)).to.deep.equal(['g2']);
  });

  it('drops tabindex=-1, disabled, [hidden] / [inert] subtrees, display:none and visibility:hidden', () => {
    const box = mount(`<button type="button" id="a">A</button><button type="button" id="neg" tabindex="-1">N</button>
      <button type="button" id="dis" disabled>D</button><div hidden><button type="button" id="h">H</button></div>
      <div inert><button type="button" id="i">I</button></div><button type="button" id="vh" class="td-sr-only">V</button>
      <span tabindex="0" id="span">S</span><textarea id="ta" aria-label="t"></textarea>`);
    box.querySelector('#vh').hidden = true;
    expect(seq(box)).to.deep.equal(['a', 'span', 'ta']);
  });

  it('matches native Tab (both directions) on a light-DOM row', async () => {
    mount(`<button type="button" id="a">A</button>
      <input type="radio" name="g" id="g1"><input type="radio" name="g" id="g2"><input type="radio" name="g" id="g3">
      <input id="t" aria-label="t"><select id="s" aria-label="s"><option>1</option></select><button type="button" id="b">B</button>`);
    const box = host.querySelector('#box');
    matchesNative(await nativeWalk(), seq(box));
    matchesNative(await nativeWalk(true), seq(box));
    box.querySelector('#g2').checked = true;
    matchesNative(await nativeWalk(), seq(box));
  });
});

describe('v0.53 tabSequence — shadow DOM (codex r1 #2)', () => {
  it('(i) open root: slotted light children at the slot position', () => {
    const box = mount('<td-test-shadow-open><input id="L" aria-label="L"></td-test-shadow-open>');
    expect(seq(box)).to.deep.equal(['s1', 'L', 's2']);
  });

  it('(ii) delegatesFocus host is not a stop; its inner control is', () => {
    const box = mount('<td-test-shadow-delegates tabindex="0" id="dh"></td-test-shadow-delegates>');
    expect(seq(box)).to.deep.equal(['d1']);
  });

  it('(iii) focusable host with an open root → [host, inner]', () => {
    const box = mount('<td-test-shadow-plain tabindex="0" id="ph"></td-test-shadow-plain>');
    expect(seq(box)).to.deep.equal(['ph', 'p1']);
  });

  it('(iv) closed root: the host is one stop only when it has a tabindex (documented limit otherwise)', () => {
    let box = mount('<td-test-shadow-closed tabindex="0" id="ch"></td-test-shadow-closed>');
    expect(seq(box)).to.deep.equal(['ch']);
    box = mount('<td-test-shadow-closed id="ch"></td-test-shadow-closed>');
    expect(seq(box)).to.deep.equal([]);
  });

  it('(v) same-named radios in two shadow roots are two groups', () => {
    const box = mount('<td-test-shadow-radios id="ra"></td-test-shadow-radios><td-test-shadow-radios id="rb"></td-test-shadow-radios>');
    const s = tabSequence(box);
    expect(s.map(name)).to.deep.equal(['r1', 'r1']);
    expect(s[0].getRootNode() !== s[1].getRootNode()).to.equal(true);
  });

  it('(vi) light children without a slot are not rendered → skipped', () => {
    const box = mount('<td-test-shadow-noslot><button type="button" id="ghost">G</button></td-test-shadow-noslot>');
    expect(seq(box)).to.deep.equal(['n1']);
  });

  it('(vii) deep active element + composed containment / closest across shadow boundaries', () => {
    const box = mount('<div data-zone="z"><td-test-shadow-open id="so"></td-test-shadow-open></div>');
    const inner = box.querySelector('#so').shadowRoot.querySelector('[data-k="s2"]');
    inner.focus();
    expect(deepActiveElement() === inner).to.equal(true);
    expect(document.activeElement === box.querySelector('#so')).to.equal(true);
    expect(composedContains(box, inner)).to.equal(true);
    expect(composedContains(document.getElementById('after'), inner)).to.equal(false);
    expect(composedClosest(inner, '[data-zone]') === box.firstElementChild).to.equal(true);
    expect(composedClosest(inner, '[data-zone]', box.firstElementChild)).to.equal(null);
  });

  // Closed roots are left out: native Tab DOES walk into them (an extra, unreachable-for-us stop), the kit can only
  // reach the host — the documented limit of (iv).
  it('matches native Tab (both directions) across every open-shadow fixture', async () => {
    mount(`<button type="button" id="a">A</button>
      <td-test-shadow-open><input id="L" aria-label="L"></td-test-shadow-open>
      <td-test-shadow-delegates></td-test-shadow-delegates>
      <td-test-shadow-plain tabindex="0" id="ph"></td-test-shadow-plain>
      <td-test-shadow-radios></td-test-shadow-radios><td-test-shadow-radios></td-test-shadow-radios>
      <td-test-shadow-noslot><button type="button" id="ghost">G</button></td-test-shadow-noslot>
      <button type="button" id="b">B</button>`);
    const box = host.querySelector('#box');
    matchesNative(await nativeWalk(), seq(box));
    matchesNative(await nativeWalk(true), seq(box));
  });

  it('Codex impl r1 #3: composedClosest follows assignedSlot (slotted child inside a marker / an inert slot)', () => {
    const box = mount('<td-test-shadow-keys id="k"><button type="button" id="slotted">S</button></td-test-shadow-keys>'
      + '<td-test-shadow-inert id="in"><button type="button" id="dead">D</button></td-test-shadow-inert>');
    const slotted = box.querySelector('#slotted');
    const marker = box.querySelector('#k').shadowRoot.querySelector('[data-td-menu-keys]');
    expect(composedClosest(slotted, '[data-td-menu-keys="content"]') === marker).to.equal(true);
    expect(composedClosest(slotted, '[data-td-menu-keys="content"]', box) === marker).to.equal(true);
    expect(composedClosest(box.querySelector('#dead'), '[inert]') !== null).to.equal(true);
    expect(seq(box)).to.deep.equal(['slotted', 'i1']);
  });
});

describe('v0.53 tabSequence — radio groups use their FULL native scope (Codex impl r1 #2)', () => {
  it('a group split across two rows: only the row holding the representative radio has the stop', () => {
    const box = mount(`<div id="r1"><input type="radio" name="g" id="a1"><input type="radio" name="g" id="a2"></div>
      <div id="r2"><input type="radio" name="g" id="b1"><input type="radio" name="g" id="b2"></div>`);
    const r1 = box.querySelector('#r1');
    const r2 = box.querySelector('#r2');
    expect(tabSequence(r1).map(name)).to.deep.equal(['a1']);
    expect(tabSequence(r2).map(name)).to.deep.equal([]);
    box.querySelector('#b2').checked = true;
    expect(tabSequence(r1).map(name)).to.deep.equal([]);
    expect(tabSequence(r2).map(name)).to.deep.equal(['b2']);
  });

  it('the checked member lives outside the queried row → the row has no stop for that group', () => {
    const box = mount(`<input type="radio" name="h" id="out" checked><div id="row"><input type="radio" name="h" id="in1">
      <input type="radio" name="h" id="in2"><button type="button" id="btn">B</button></div>`);
    expect(tabSequence(box.querySelector('#row')).map(name)).to.deep.equal(['btn']);
    expect(seq(box)).to.deep.equal(['out', 'btn']);
  });

  it('the first ELIGIBLE member decides (a disabled / hidden first member is skipped); other forms are other groups', () => {
    const box = mount(`<form id="f1"></form><input type="radio" name="g" id="d0" disabled><input type="radio" name="g" id="h0" hidden>
      <div id="row"><input type="radio" name="g" id="e1"><input type="radio" name="g" id="e2" form="f1"></div>`);
    expect(tabSequence(box.querySelector('#row')).map(name)).to.deep.equal(['e1', 'e2']);
  });
});

describe('v0.53 tabSequence — radio index cost (Codex r2 sec #3)', () => {
  const PERF_SLACK = 5; // ×5 under load
  /** count querySelectorAll calls (Document / ShadowRoot / Element) made while `fn` runs */
  function countQsa(fn) {
    const protos = [Document.prototype, ShadowRoot.prototype, Element.prototype, DocumentFragment.prototype];
    const orig = protos.map((p) => Object.getOwnPropertyDescriptor(p, 'querySelectorAll'));
    let n = 0;
    protos.forEach((p, i) => {
      if (!orig[i]) return;
      const f = orig[i].value;
      Object.defineProperty(p, 'querySelectorAll', { ...orig[i], value(...a) { n += 1; return f.apply(this, a); } });
    });
    try { fn(); } finally { protos.forEach((p, i) => { if (orig[i]) Object.defineProperty(p, 'querySelectorAll', orig[i]); }); }
    return n;
  }

  it('one index per scope: 60 named groups in the light DOM + 2 shadow scopes → ≤ 3 lookups', () => {
    let html = '';
    for (let i = 0; i < 60; i++) html += `<input type="radio" name="n${i}" id="x${i}">`;
    const box = mount(`${html}<td-test-shadow-radios></td-test-shadow-radios><td-test-shadow-radios></td-test-shadow-radios>`);
    let got;
    const calls = countQsa(() => { got = tabSequence(box); });
    expect(got.length).to.equal(62);
    expect(calls).to.be.at.most(3);
  });

  it('a shared index is reused across several rows of one navigation', () => {
    const box = mount('<div id="a"><input type="radio" name="p" id="p1"></div><div id="b"><input type="radio" name="q" id="q1"></div>');
    const index = new Map();
    const calls = countQsa(() => {
      tabSequence(box.querySelector('#a'), { index });
      tabSequence(box.querySelector('#b'), { index });
    });
    expect(calls).to.equal(1);
  });

  it('a form of 2 000 uniquely named radios stays fast', () => {
    let html = '<form id="big">';
    for (let i = 0; i < 2000; i++) html += `<input type="radio" name="r${i}" aria-label="r${i}">`;
    const box = mount(`${html}</form>`);
    const t0 = performance.now();
    const got = tabSequence(box);
    const ms = performance.now() - t0;
    expect(got.length).to.equal(2000);
    expect(ms < 150 * PERF_SLACK, `${ms.toFixed(1)} ms`).to.equal(true);
  });
});
