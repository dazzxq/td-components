import { expect } from '@esm-bundle/chai';
import './td-otp-input.js';
import { TdModal } from '../feedback/td-modal.js';

// v0.109.0 (dsuite request): a full code typed / pasted / autofilled SUBMITS — the form (requestSubmit), else inside a
// TdModal the footer's [data-td-default] button or its only .td-btn--primary; opt-out `no-auto-submit`, a cancelled
// `complete`, disabled / readonly; a programmatic value never submits. DOM nodes are compared as booleans.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(async () => {
  extra.splice(0).forEach((f) => f());
  TdModal.closeAll();
  await wait(20);
});
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const inputOf = (el) => el.querySelector('input.td-otp__input');
function fill(el, raw, inputType = 'insertFromPaste') {
  const input = inputOf(el);
  input.value = raw;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
}
function formWith(attrs = '') {
  const wrap = mount(`<form><td-otp-input name="code" ${attrs}></td-otp-input><button type="submit">Gửi</button></form>`);
  const form = wrap.querySelector('form');
  const rec = [];
  form.addEventListener('submit', (e) => { e.preventDefault(); rec.push(new FormData(form).get('code')); });
  return { el: wrap.querySelector('td-otp-input'), form, rec };
}
/** a hand-built modal footer around an otp input; returns the otp + click counters per button */
function inModal(buttons) {
  const otp = document.createElement('td-otp-input');
  const clicks = [];
  const footer = buttons.map((b, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `td-btn td-btn--${b.variant || 'secondary'}`;
    btn.textContent = `b${i}`;
    if (b.default) btn.setAttribute('data-td-default', '');
    if (b.disabled) btn.disabled = true;
    if (b.busy) btn.setAttribute('aria-busy', 'true');
    btn.addEventListener('click', () => clicks.push(i));
    return btn;
  });
  TdModal.show({ title: 'Xác thực', body: otp, footer });
  return { otp, clicks };
}

describe('v0.109 td-otp-input auto-submit — form', () => {
  it('paste of a full code submits the form once with the value', async () => {
    const { el, rec } = formWith();
    fill(el, '123456');
    await wait(20);
    expect(rec).to.deep.equal(['123456']);
  });

  it('typing the last digit submits; more input does not submit again; deleting + retyping submits again', async () => {
    const { el, rec } = formWith();
    fill(el, '12345', 'insertText');
    expect(rec.length).to.equal(0);
    fill(el, '123456', 'insertText');
    fill(el, '1234567', 'insertText');
    fill(el, '12345', 'deleteContentBackward');
    fill(el, '123450', 'insertText');
    await wait(20);
    expect(rec).to.deep.equal(['123456', '123450']);
  });

  it('`complete` is cancelable: preventDefault() skips that submit', async () => {
    const { el, rec } = formWith();
    let cancelable = null;
    el.addEventListener('complete', (e) => { cancelable = e.cancelable; e.preventDefault(); });
    fill(el, '123456');
    await wait(20);
    expect(cancelable).to.equal(true);
    expect(rec.length).to.equal(0);
  });

  it('no-auto-submit attribute and noAutoSubmit property (reflected) turn it off', async () => {
    const a = formWith('no-auto-submit');
    expect(a.el.noAutoSubmit).to.equal(true);
    fill(a.el, '123456');
    const b = formWith();
    b.el.noAutoSubmit = true;
    expect(b.el.hasAttribute('no-auto-submit')).to.equal(true);
    fill(b.el, '123456');
    await wait(20);
    expect(a.rec.length + b.rec.length).to.equal(0);
    b.el.noAutoSubmit = false;
    expect(b.el.hasAttribute('no-auto-submit')).to.equal(false);
  });

  it('a programmatic value never submits; reset() re-arms', async () => {
    const { el, rec } = formWith();
    el.value = '111111';
    await wait(20);
    expect(rec.length).to.equal(0);
    el.reset();
    fill(el, '111111');
    await wait(20);
    expect(rec).to.deep.equal(['111111']);
  });

  it('readonly / disabled never submit', async () => {
    const a = formWith('readonly');
    fill(a.el, '123456');
    const b = formWith('disabled');
    fill(b.el, '123456');
    await wait(20);
    expect(a.rec.length + b.rec.length).to.equal(0);
  });

  it('requestSubmit runs constraint validation of the other fields (invalid form → no submit)', async () => {
    const wrap = mount('<form><input name="x" required><td-otp-input name="code"></td-otp-input></form>');
    let submits = 0;
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); submits++; });
    fill(wrap.querySelector('td-otp-input'), '123456');
    await wait(20);
    expect(submits).to.equal(0);
  });
});

describe('v0.109 td-otp-input auto-submit — TdModal footer', () => {
  it('clicks the only primary button', async () => {
    const { otp, clicks } = inModal([{ variant: 'secondary' }, { variant: 'primary' }]);
    await wait(20);
    fill(otp, '123456');
    expect(clicks).to.deep.equal([1]);
  });

  it('actions API: the primary action runs (dsuite step-up shape)', async () => {
    const otp = document.createElement('td-otp-input');
    const ran = [];
    TdModal.show({ title: 'X', body: otp, actions: [
      { label: 'Huỷ', variant: 'secondary', value: false },
      { label: 'Xác nhận', variant: 'primary', value: true, close: false, onClick: () => { ran.push(otp.value); } },
    ] });
    await wait(20);
    fill(otp, '654321');
    expect(ran).to.deep.equal(['654321']);
  });

  it('[data-td-default] wins over the primary', async () => {
    const { otp, clicks } = inModal([{ variant: 'success', default: true }, { variant: 'primary' }]);
    await wait(20);
    fill(otp, '123456');
    expect(clicks).to.deep.equal([0]);
  });

  it('two primaries or none → nothing is clicked', async () => {
    const a = inModal([{ variant: 'primary' }, { variant: 'primary' }]);
    await wait(20);
    fill(a.otp, '123456');
    expect(a.clicks.length).to.equal(0);
    TdModal.closeAll();
    await wait(20);
    const b = inModal([{ variant: 'secondary' }, { variant: 'danger' }]);
    await wait(20);
    fill(b.otp, '123456');
    expect(b.clicks.length).to.equal(0);
  });

  it('a disabled or busy target is skipped', async () => {
    const a = inModal([{ variant: 'primary', disabled: true }]);
    await wait(20);
    fill(a.otp, '123456');
    TdModal.closeAll();
    await wait(20);
    const b = inModal([{ variant: 'primary', busy: true }]);
    await wait(20);
    fill(b.otp, '123456');
    expect(a.clicks.length + b.clicks.length).to.equal(0);
  });

  it('a form inside the modal wins over the footer button', async () => {
    const form = document.createElement('form');
    const otp = document.createElement('td-otp-input');
    otp.setAttribute('name', 'code');
    form.appendChild(otp);
    let submits = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submits++; });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-btn td-btn--primary';
    let clicks = 0;
    btn.addEventListener('click', () => { clicks++; });
    TdModal.show({ title: 'X', body: form, footer: [btn] });
    await wait(20);
    fill(otp, '123456');
    await wait(20);
    expect([submits, clicks]).to.deep.equal([1, 0]);
  });

  it('outside a form and a modal: nothing happens (only `complete`)', async () => {
    const wrap = mount('<td-otp-input></td-otp-input><button class="td-btn td-btn--primary" type="button">x</button>');
    let clicks = 0;
    wrap.querySelector('button').addEventListener('click', () => { clicks++; });
    const rec = [];
    const el = wrap.querySelector('td-otp-input');
    el.addEventListener('complete', (e) => rec.push(e.detail.value));
    fill(el, '123456');
    await wait(20);
    expect([rec, clicks]).to.deep.equal([['123456'], 0]);
  });
});
