import { expect } from '@esm-bundle/chai';
import { TdPasswordMeter } from './td-password-meter.js';
import './td-input-field.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host; };
const labelsBackup = JSON.parse(JSON.stringify(TdPasswordMeter.labels));
afterEach(() => {
  host.innerHTML = '';
  Object.assign(TdPasswordMeter.labels, JSON.parse(JSON.stringify(labelsBackup)));
});

/** Type into a native control the way a user does (value + bubbling input event). */
function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const box = (m) => m.querySelector('.td-password-meter');

describe('v0.17.0 E7 — td-password-meter', () => {
  it('built-in estimate: common, short, sequences, variety and length', () => {
    const e = (v, o) => TdPasswordMeter.estimate(v, o);
    expect(e('')).to.equal(0);
    expect(e('password')).to.equal(0);
    expect(e('P@ssw0rd')).to.equal(0); // leet of a common password
    expect(e('matkhau')).to.equal(0);
    expect(e('123456789')).to.equal(0);
    expect(e('Password123!')).to.be.at.most(1); // common + suffix
    expect(e('aB3$')).to.be.at.most(1); // shorter than min-length
    expect(e('aaaaaaaaaaaaaaaaaaaaaaa')).to.be.at.most(1); // ≤ 3 distinct characters
    expect(e('abcdefgh')).to.equal(0); // sequence, one class
    expect(e('Tr0ub4dor&3')).to.equal(3); // 4 classes, < 12 chars → max 3
    expect(e('Xk9#mQ2$vL7!pZ')).to.equal(4);
    expect(e('correct horse battery staple')).to.equal(4); // long passphrase
    expect(e('Xk9#mQ2$vL7!pZ', { minLength: 16 })).to.be.at.most(1); // below a raised minimum
    for (const v of ['a', 'Zz9!', 'hunter2', 'Tr0ub4dor&3', 'x'.repeat(200)]) {
      const s = e(v);
      expect(Number.isInteger(s) && s >= 0 && s <= 4, v).to.equal(true);
    }
  });

  it('wraps an input: box appended after it, 4 segments, live status, aria-describedby', async () => {
    const m = mount('<td-password-meter><input type="password" id="w1" aria-describedby="hint"></td-password-meter>');
    const input = m.querySelector('input');
    const b = box(m);
    expect(b).to.not.equal(null);
    expect(input.nextElementSibling).to.equal(b);
    expect(b.querySelectorAll('.td-password-meter__bar[aria-hidden="true"] .td-password-meter__seg').length).to.equal(4);
    const status = b.querySelector('.td-password-meter__status');
    expect(status.getAttribute('aria-live')).to.equal('polite');
    expect(input.getAttribute('aria-describedby').split(' ')).to.deep.equal(['hint', status.id]);
    expect(b.getAttribute('data-level')).to.equal('empty');
    expect(status.textContent).to.equal('');

    type(input, 'abc');
    expect(b.getAttribute('data-level')).to.equal('weak');
    expect(b.getAttribute('data-lit')).to.equal('1');
    expect(status.textContent).to.equal('Độ mạnh mật khẩu: Rất yếu');

    type(input, 'Xk9#mQ2$vL7!pZ');
    expect(b.getAttribute('data-score')).to.equal('4');
    expect(b.getAttribute('data-lit')).to.equal('4');
    expect(b.getAttribute('data-level')).to.equal('strong');
    expect(status.textContent).to.equal('Độ mạnh mật khẩu: Rất mạnh');
    // Lit segments take the level colour, unlit ones keep the track.
    const segs = b.querySelectorAll('.td-password-meter__seg');
    const track = getComputedStyle(document.documentElement).getPropertyValue('--td-color-border').trim();
    expect(getComputedStyle(segs[3]).backgroundColor).to.not.equal(getComputedStyle(document.body).backgroundColor);
    type(input, 'Tr0ub4dor&3');
    expect(b.getAttribute('data-lit')).to.equal('3');
    await new Promise((r) => setTimeout(r, 400)); // past the segment colour transition
    expect(getComputedStyle(segs[3]).backgroundColor).to.not.equal(getComputedStyle(segs[0]).backgroundColor);
    expect(track).to.not.equal('');
  });

  it('never exposes the password: status text, event detail and host contain only the level', () => {
    const secret = 'S3cr3t!Value#42';
    const m = mount('<td-password-meter checklist><input type="password"></td-password-meter>');
    const meter = m.querySelector('td-password-meter');
    const events = [];
    meter.addEventListener('strength-change', (e) => events.push(e.detail));
    type(m.querySelector('input'), secret);
    expect(events.length).to.equal(1);
    expect(Object.keys(events[0]).sort()).to.deep.equal(['label', 'score']);
    expect(JSON.stringify(events[0])).to.not.include(secret);
    expect(box(m).textContent).to.not.include(secret);
    for (const a of box(m).getAttributeNames()) expect(box(m).getAttribute(a)).to.not.include(secret);
    expect(meter.strength).to.deep.equal(events[0]);
  });

  it('strength-change fires only when the level changes', () => {
    const m = mount('<td-password-meter><input type="password"></td-password-meter>');
    const events = [];
    m.querySelector('td-password-meter').addEventListener('strength-change', (e) => events.push(e.detail.score));
    const input = m.querySelector('input');
    type(input, 'a');
    type(input, 'ab');
    type(input, 'abx');
    type(input, 'Xk9#mQ2$vL7!pZ');
    type(input, '');
    expect(events).to.deep.equal([0, 4, 0]);
  });

  it('for="id" targets a td-input-field (inner control gets aria-describedby); checklist rules update', async () => {
    const m = mount(`
      <td-input-field id="pw1" type="password" label="Mật khẩu" autocomplete="new-password"></td-input-field>
      <td-password-meter for="pw1" checklist min-length="10"></td-password-meter>`);
    const field = m.querySelector('td-input-field');
    const control = field.querySelector('.td-field__control');
    const b = box(m);
    const status = b.querySelector('.td-password-meter__status');
    expect(control.getAttribute('aria-describedby') || '').to.include(status.id);
    const rules = [...b.querySelectorAll('.td-password-meter__rule')];
    expect(rules.map((r) => r.getAttribute('data-rule'))).to.deep.equal(['length', 'lower', 'upper', 'number', 'symbol']);
    expect(rules[0].querySelector('.td-password-meter__text').textContent).to.equal('Tối thiểu 10 ký tự');
    expect(rules.every((r) => r.getAttribute('data-met') === 'false')).to.equal(true);
    expect(rules[0].querySelector('.td-sr-only').textContent).to.equal(': chưa đạt');

    type(control, 'abcD5');
    const met = () => rules.map((r) => r.getAttribute('data-met'));
    expect(met()).to.deep.equal(['false', 'true', 'true', 'true', 'false']);
    expect(rules[1].querySelector('.td-sr-only').textContent).to.equal(': đạt');
    type(control, 'abcD5!xyzq');
    expect(met()).to.deep.equal(['true', 'true', 'true', 'true', 'true']);
    expect(getComputedStyle(rules[0]).color).to.not.equal(getComputedStyle(b).color);
  });

  it('checklist token list + no checklist → hidden list', () => {
    const m = mount(`
      <td-password-meter id="a" checklist="upper, length bogus"><input type="password"></td-password-meter>
      <td-password-meter id="b"><input type="password"></td-password-meter>`);
    const a = m.querySelector('#a .td-password-meter__checklist');
    expect([...a.children].map((li) => li.getAttribute('data-rule'))).to.deep.equal(['length', 'upper']);
    const b = m.querySelector('#b .td-password-meter__checklist');
    expect(b.hidden).to.equal(true);
    expect(getComputedStyle(b).display).to.equal('none');
    m.querySelector('#b').setAttribute('checklist', '');
    expect(b.hidden).to.equal(false);
    expect(b.children.length).to.equal(5);
  });

  it('min-length falls back to the control minlength, then 8', () => {
    const m = mount(`
      <td-password-meter id="a" checklist="length"><input type="password" minlength="12"></td-password-meter>
      <td-password-meter id="b" checklist="length"><input type="password"></td-password-meter>`);
    expect(m.querySelector('#a .td-password-meter__text').textContent).to.equal('Tối thiểu 12 ký tự');
    expect(m.querySelector('#b .td-password-meter__text').textContent).to.equal('Tối thiểu 8 ký tự');
  });

  it('score hook replaces the algorithm; bad results fall back to the built-in estimate', async () => {
    const m = mount('<td-password-meter><input type="password"></td-password-meter>');
    const meter = m.querySelector('td-password-meter');
    const input = m.querySelector('input');
    const seen = [];
    meter.score = (v, ctx) => { seen.push([v, ctx.minLength, typeof ctx.estimate]); return 2; };
    type(input, 'password');
    expect(box(m).getAttribute('data-score')).to.equal('2');
    expect(seen[seen.length - 1]).to.deep.equal(['password', 8, 'function']);

    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      meter.score = () => { throw new Error('boom'); };
      type(input, 'Xk9#mQ2$vL7!pZ');
      expect(box(m).getAttribute('data-score')).to.equal('4');
      meter.score = () => 'nope';
      type(input, 'password');
      expect(box(m).getAttribute('data-score')).to.equal('0');
      meter.score = () => 9.6;
      type(input, 'x');
      expect(box(m).getAttribute('data-score')).to.equal('4'); // clamped
    } finally { console.warn = orig; }
    expect(warns.length).to.be.at.least(2);
    expect(warns.join('\n')).to.not.include('Xk9#');

    // Async hook: only the latest result is applied.
    let release;
    meter.score = (v) => (v === 'slow' ? new Promise((r) => { release = () => r(1); }) : Promise.resolve(3));
    type(input, 'slow');
    type(input, 'fast');
    await Promise.resolve();
    await Promise.resolve();
    expect(box(m).getAttribute('data-score')).to.equal('3');
    release();
    await new Promise((r) => setTimeout(r));
    expect(box(m).getAttribute('data-score')).to.equal('3');
  });

  it('a hook assigned before connect is used on the first render; labels are translatable', () => {
    TdPasswordMeter.labels.levels = ['L0', 'L1', 'L2', 'L3', 'L4'];
    TdPasswordMeter.labels.status = 'Strength: {label}';
    const m = mount('<div id="x"></div>');
    const meter = document.createElement('td-password-meter');
    meter.score = () => 1;
    meter.innerHTML = '<input type="password" value="whatever">';
    m.querySelector('#x').appendChild(meter);
    expect(box(m).getAttribute('data-score')).to.equal('1');
    expect(box(m).querySelector('.td-password-meter__status').textContent).to.equal('Strength: L1');
  });

  it('refresh() after a programmatic value; form reset resets the meter; disconnect unlinks aria-describedby', async () => {
    const m = mount('<form><td-password-meter><input type="password" name="p"></td-password-meter></form>');
    const input = m.querySelector('input');
    const meter = m.querySelector('td-password-meter');
    input.value = 'Xk9#mQ2$vL7!pZ';
    expect(box(m).getAttribute('data-level')).to.equal('empty'); // no event
    meter.refresh();
    expect(box(m).getAttribute('data-level')).to.equal('strong');
    m.querySelector('form').reset();
    await new Promise((r) => setTimeout(r, 10));
    expect(box(m).getAttribute('data-level')).to.equal('empty');

    const id = box(m).querySelector('.td-password-meter__status').id;
    expect(input.getAttribute('aria-describedby')).to.equal(id);
    const outside = document.createElement('input');
    outside.id = 'pw-out';
    host.appendChild(outside);
    meter.setAttribute('for', 'pw-out');
    expect(input.hasAttribute('aria-describedby')).to.equal(false);
    expect(outside.getAttribute('aria-describedby')).to.equal(id);
    meter.remove();
    expect(outside.hasAttribute('aria-describedby')).to.equal(false);
    // Events after disconnect do nothing (listeners cleaned up).
    type(outside, 'Xk9#mQ2$vL7!pZ');
    expect(meter.querySelector('.td-password-meter').getAttribute('data-level')).to.equal('empty');
  });
});
