import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdToggle } from './td-toggle.js';
import { trackFormDirty } from '../utils/form-dirty.js';

// v0.52.0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md M3, Codex plan-review r1 #1) — <td-toggle locked> in
// Chromium, Firefox AND WebKit with real keys / mouse. The lock description (messages.locked + ": " + reason) is the
// state carrier — checked exactly in every engine; aria-readonly is kept on the input.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const cleanup = [];
afterEach(async () => {
  cleanup.splice(0).forEach((f) => f());
  await resetMouse();
});

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap;
}
const input = (el) => el.querySelector('input.td-switch__input');
const describedText = (el) => (input(el).getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
  .map((id) => document.getElementById(id)?.textContent || `#${id}?`).join(' ');
function changes(el) {
  const rec = [];
  el.addEventListener('change', (e) => rec.push(e.detail));
  return rec;
}
async function clickOn(node) {
  const r = node.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
  await wait(20);
}

describe('td-toggle locked (v0.52 M3)', () => {
  it('description = "Không thể thay đổi: {reason}" / prefix only; aria-readonly; lock icon; spans outside the label', async () => {
    const w = mount('<td-toggle id="l1" label="Bắt buộc 2FA" checked locked locked-reason="Chính sách công ty"></td-toggle>'
      + '<td-toggle id="l2" label="Bắt buộc 2FA" checked locked></td-toggle>'
      + '<td-toggle id="l3" label="Bắt buộc 2FA" checked locked tone="warning" status-text="Đang chờ quét QR" locked-reason="R"></td-toggle>');
    await wait();
    const [a, b, c] = w.querySelectorAll('td-toggle');
    expect(describedText(a)).to.equal('Không thể thay đổi: Chính sách công ty');
    expect(describedText(b)).to.equal('Không thể thay đổi');
    expect(describedText(c)).to.equal('Đang chờ quét QR Không thể thay đổi: R');
    for (const el of [a, b, c]) {
      expect(input(el).getAttribute('aria-readonly')).to.equal('true');
      expect(input(el).disabled).to.equal(false);
      const lock = el.querySelector('.td-switch__thumb > .td-switch__icon--lock');
      expect(lock?.getAttribute('data-td-icon')).to.equal('lock');
      expect(lock?.querySelector('svg')?.getAttribute('data-icon')).to.equal('lock');
      expect(getComputedStyle(lock).opacity).to.equal('1');
      expect(getComputedStyle(el.querySelector('.td-switch__icon--on')).opacity).to.equal('0');
      const span = el.querySelector('.td-switch__lock-reason');
      expect(span.parentElement === el && span.classList.contains('td-sr-only')).to.equal(true);
      expect([...input(el).labels].some((l) => l.contains(span))).to.equal(false);
      expect(getComputedStyle(el.querySelector('.td-switch')).cursor).to.equal('not-allowed');
      expect(getComputedStyle(el.querySelector('.td-switch')).opacity).to.equal('1');
    }
  });

  it('messages.locked is the localised prefix; changes of the reason / messages re-apply in place', async () => {
    const orig = TdToggle.messages.locked;
    cleanup.push(() => { TdToggle.messages.locked = orig; });
    TdToggle.messages.locked = 'Locked';
    const w = mount('<td-toggle id="l4" label="X" checked locked locked-reason="policy"></td-toggle>');
    await wait();
    const el = w.querySelector('td-toggle');
    expect(describedText(el)).to.equal('Locked: policy');
    const i = input(el);
    i.focus();
    el.lockedReason = '<b>x</b>';
    await wait();
    expect(describedText(el)).to.equal('Locked: <b>x</b>');
    expect(el.querySelector('.td-switch__lock-reason').children.length).to.equal(0);
    el.removeAttribute('locked-reason');
    await wait();
    expect(describedText(el)).to.equal('Locked');
    expect(input(el) === i && document.activeElement === i).to.equal(true);
  });

  for (const on of [true, false]) {
    it(`locked ${on ? 'ON' : 'OFF'}: mouse, wrapping label, external <label for>, Space → no flip, no change (also controlled)`, async () => {
      const w = mount(`<input id="before" aria-label="trước"><td-toggle id="lk" label="Khoá" ${on ? 'checked' : ''} locked></td-toggle>`
        + `<td-toggle id="lc" label="Khoá controlled" controlled ${on ? 'checked' : ''} locked></td-toggle><label for="lk" id="ext">Ngoài</label>`);
      await wait();
      const [el, ctl] = w.querySelectorAll('td-toggle');
      const rec = changes(el);
      const recC = changes(ctl);
      await clickOn(el.querySelector('.td-switch__track'));
      await clickOn(el.querySelector('.td-switch__label'));
      await clickOn(w.querySelector('#ext'));
      await clickOn(ctl.querySelector('.td-switch__track'));
      w.querySelector('#before').focus();
      await sendKeys({ press: TAB });
      expect(document.activeElement === input(el)).to.equal(true);
      await sendKeys({ press: 'Space' });
      await wait(20);
      expect(el.checked).to.equal(on);
      expect(input(el).checked).to.equal(on);
      expect(ctl.checked).to.equal(on);
      expect(input(ctl).checked).to.equal(on);
      expect(rec.length + recC.length).to.equal(0);
    });
  }

  it('FormData: locked ON submits name=value, locked OFF nothing; required + locked OFF stays invalid; validity normal', async () => {
    const w = mount('<form><td-toggle name="a" value="1" checked locked></td-toggle><td-toggle name="b" locked></td-toggle>'
      + '<td-toggle name="c" required locked></td-toggle></form>');
    await wait();
    const form = w.querySelector('form');
    const fd = new FormData(form);
    expect(fd.getAll('a')).to.deep.equal(['1']);
    expect(fd.has('b')).to.equal(false);
    expect(form.checkValidity()).to.equal(false);
    expect(w.querySelectorAll('td-toggle')[2].validity.valueMissing).to.equal(true);
  });

  it('commit() while locked: resolves the current state, fn never runs, no event; code + reset still work', async () => {
    const w = mount('<form><td-toggle id="lm" name="m" label="X" locked></td-toggle></form>');
    await wait();
    const el = w.querySelector('td-toggle');
    const rec = changes(el);
    const errs = [];
    el.addEventListener('commit-error', (e) => errs.push(e.detail));
    let ran = false;
    expect(await el.commit(() => { ran = true; }, true)).to.equal(false);
    expect(ran).to.equal(false);
    expect(el.checked).to.equal(false);
    let typeErr = null;
    try { await el.commit('x'); } catch (e) { typeErr = e; }
    expect(typeErr instanceof TypeError).to.equal(true);
    el.checked = true; // code still drives it
    await wait();
    expect(input(el).checked).to.equal(true);
    expect(new FormData(w.querySelector('form')).getAll('m')).to.deep.equal(['on']);
    w.querySelector('form').reset();
    await wait();
    expect(el.checked).to.equal(false);
    expect(rec.length + errs.length).to.equal(0);
  });

  it('disabled wins over locked; locked set while a commit is pending lets that commit finish (incl. revert)', async () => {
    const w = mount('<form><td-toggle id="ld" name="d" checked locked disabled></td-toggle><td-toggle id="lp" label="P" controlled></td-toggle></form>');
    await wait();
    const [dis, p] = w.querySelectorAll('td-toggle');
    expect(input(dis).disabled).to.equal(true);
    expect(new FormData(w.querySelector('form')).has('d')).to.equal(false);
    let release;
    const pr = p.commit(() => new Promise((r) => { release = r; }), true);
    p.locked = true;
    await wait();
    release(false);
    expect(await pr).to.equal(false);
    expect(p.checked).to.equal(false);
    expect(input(p).getAttribute('aria-readonly')).to.equal('true');
  });

  it('locked on / off at runtime: in place (same input, focus kept); unlocked → toggles again', async () => {
    const w = mount('<td-toggle id="lr" label="R" checked></td-toggle>');
    await wait();
    const el = w.querySelector('td-toggle');
    const i = input(el);
    i.focus();
    el.locked = true;
    await wait();
    expect(input(el) === i && document.activeElement === i).to.equal(true);
    expect(i.getAttribute('aria-readonly')).to.equal('true');
    await sendKeys({ press: 'Space' });
    await wait(20);
    expect(el.checked).to.equal(true);
    el.locked = false;
    await wait();
    expect(i.hasAttribute('aria-readonly')).to.equal(false);
    expect(el.querySelector('.td-switch__icon--lock')).to.equal(null);
    expect(el.querySelector('.td-switch__lock-reason')).to.equal(null);
    expect(i.hasAttribute('aria-describedby')).to.equal(false);
    await sendKeys({ press: 'Space' });
    await wait(20);
    expect(el.checked).to.equal(false);
  });

  it('hover / pressed styles do not apply to a locked switch', async () => {
    const w = mount('<td-toggle id="lh" label="H" locked></td-toggle>');
    await wait();
    const el = w.querySelector('td-toggle');
    const t = el.querySelector('.td-switch__track');
    const before = getComputedStyle(t).borderColor;
    el.querySelector('.td-switch').setAttribute('data-td-pressed', '');
    expect(getComputedStyle(t).backgroundImage).to.equal('none');
    el.querySelector('.td-switch').removeAttribute('data-td-pressed');
    const r = t.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    await wait(50);
    expect(getComputedStyle(t).borderColor).to.equal(before);
  });

  it('form dirty tracker: a locked toggle is a normal tracked control (in FormData; the user cannot dirty it)', async () => {
    const w = mount('<form id="fd"><td-toggle id="ldt" name="tfa" checked locked></td-toggle></form>');
    await wait();
    const form = w.querySelector('form');
    const tracker = trackFormDirty(form, { beforeUnload: false });
    cleanup.push(() => tracker.destroy());
    expect(new FormData(form).getAll('tfa')).to.deep.equal(['on']);
    expect(tracker.check()).to.equal(false);
    await clickOn(w.querySelector('.td-switch__track'));
    expect(tracker.check()).to.equal(false);
    // no user event reached the form (a locked toggle emits none) → a code change does not dirty it either (v0.44 contract)
    w.querySelector('td-toggle').checked = false;
    expect(tracker.check()).to.equal(false);
    expect(new FormData(form).has('tfa')).to.equal(false);
  });
});
