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
function matchesNative(nat, ours) {
  if (!WEBKIT) return expect(nat).to.deep.equal(ours);
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
});
