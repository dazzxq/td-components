import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdInputField } from './td-input-field.js';
import { trackFormDirty } from '../utils/form-dirty.js';

// v0.115.0 (plan docs/internal/plans/v0.115.0-password-reveal.md, Tests "Browser, engines" 1–9) — <td-input-field
// type="password" revealable> in Chromium / Firefox / WebKit. DOM nodes are compared as booleans (`a === b`): a failing
// chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

// WebKit skips buttons on Tab unless the OS "keyboard navigation" setting is on; Alt(Option)+Tab is its "all controls"
// Tab (same as src/form/td-v052-toggle-locked.engines.browser-test.js)
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);
const TAB = WEBKIT ? 'Alt+Tab' : 'Tab';
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(async () => { extra.splice(0).forEach((f) => f()); await resetMouse(); });

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const field = (attrs = '') => mount(`<form><td-input-field id="pw${Math.random().toString(36).slice(2, 8)}" name="password" label="Mật khẩu" type="password" revealable ${attrs}></td-input-field></form>`).querySelector('td-input-field');
const ctl = (el) => el.querySelector('input.td-field__control');
const btn = (el) => el.querySelector(':scope > .td-field > .td-field__box > button.td-field__reveal');
const icon = (el) => btn(el)?.querySelector('.td-field__reveal-icon > svg')?.getAttribute('data-icon') ?? null;
const state = (el) => ({ type: ctl(el).type, pressed: btn(el).getAttribute('aria-pressed'), label: btn(el).getAttribute('aria-label'), icon: icon(el), revealed: el.revealed });
const HIDDEN = { type: 'password', pressed: 'false', label: 'Hiện mật khẩu', icon: 'eye', revealed: false };
const SHOWN = { type: 'text', pressed: 'true', label: 'Ẩn mật khẩu', icon: 'eye-off', revealed: true };
async function clickOn(el) {
  const r = el.getBoundingClientRect();
  await sendMouse({ type: 'click', position: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] });
}

describe('v0.115.0 password reveal — pointer, keyboard, icons', () => {
  it('1. a real click toggles type / aria / icon; the input keeps focus and the caret', async () => {
    const el = field();
    await frame();
    const input = ctl(el);
    expect(state(el)).to.deep.equal(HIDDEN);
    expect(btn(el).getAttribute('aria-controls')).to.equal(input.id);
    expect(btn(el).type).to.equal('button');
    input.focus();
    await sendKeys({ type: 'abcd' });
    input.setSelectionRange(2, 2);
    await clickOn(btn(el));
    expect(state(el)).to.deep.equal(SHOWN);
    expect(document.activeElement === input, 'focus stays in the input').to.equal(true);
    expect([input.selectionStart, input.selectionEnd]).to.deep.equal([2, 2]);
    await sendKeys({ type: 'X' });
    expect(input.value).to.equal('abXcd');
    await clickOn(btn(el));
    expect(state(el)).to.deep.equal(HIDDEN);
    expect(document.activeElement === input).to.equal(true);
    await sendKeys({ type: 'Y' });
    expect(input.value).to.equal('abXYcd');
  });

  it('2. keyboard: Tab reaches the button, Space toggles (focus stays), Shift+Tab back to the input', async () => {
    const el = field();
    await frame();
    ctl(el).focus();
    await sendKeys({ press: TAB });
    expect(document.activeElement === btn(el), 'Tab → the button').to.equal(true);
    await sendKeys({ press: 'Space' });
    expect(state(el)).to.deep.equal(SHOWN);
    expect(document.activeElement === btn(el), 'focus stays on the button').to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(state(el)).to.deep.equal(HIDDEN);
    await sendKeys({ press: WEBKIT ? 'Alt+Shift+Tab' : 'Shift+Tab' });
    expect(document.activeElement === ctl(el), 'Shift+Tab → the input').to.equal(true);
  });

  it('2b. the icon slot holds eye / eye-off after bind and after each toggle; one svg', async () => {
    const el = field();
    await frame();
    expect(icon(el)).to.equal('eye');
    for (const want of ['eye-off', 'eye', 'eye-off']) {
      el.toggleReveal();
      expect(icon(el)).to.equal(want);
      expect(btn(el).querySelectorAll('svg').length).to.equal(1);
    }
  });

  it('2c. eligibility: removing `revealable` / changing type hides; adding back comes back hidden', async () => {
    const el = field();
    await frame();
    el.reveal();
    el.removeAttribute('revealable');
    await frame();
    expect(ctl(el).type).to.equal('password');
    expect(!!btn(el), 'no button').to.equal(false);
    expect(el.revealed).to.equal(false);
    el.setAttribute('revealable', '');
    await frame();
    expect(state(el)).to.deep.equal(HIDDEN);
    el.reveal();
    el.type = 'text';
    await frame();
    expect(!!btn(el)).to.equal(false);
    expect(el.revealed).to.equal(false);
    el.type = 'password';
    await frame();
    expect(state(el)).to.deep.equal(HIDDEN);
    // a structural re-render while shown keeps it shown
    el.reveal();
    el.setAttribute('label', 'Mật khẩu mới');
    await frame();
    expect(state(el)).to.deep.equal(SHOWN);
    // property mirror
    el.revealable = false;
    await frame();
    expect(el.hasAttribute('revealable')).to.equal(false);
    expect(ctl(el).type).to.equal('password');
  });
});

describe('v0.115.0 password reveal — auto-hide, disabled, form', () => {
  it('3. the submit of the owning form conceals BEFORE the submit handler sees the form', async () => {
    const el = field();
    await frame();
    const form = el.closest('form');
    let seen = null;
    form.addEventListener('submit', (e) => { e.preventDefault(); seen = ctl(el).type; });
    el.reveal();
    form.requestSubmit();
    expect(seen).to.equal('password');
    expect(el.revealed).to.equal(false);
    // another form's submit leaves it alone
    const other = mount('<form><button>Go</button></form>').querySelector('form');
    el.reveal();
    other.requestSubmit();
    expect(el.revealed).to.equal(true);
  });

  it('4. form.reset() conceals; remove() conceals (and stays hidden when re-attached)', async () => {
    const el = field('value="abc"');
    await frame();
    el.reveal();
    el.closest('form').reset();
    expect(ctl(el).type).to.equal('password');
    expect(el.revealed).to.equal(false);
    el.reveal();
    const parent = el.parentNode;
    el.remove();
    expect(el.revealed).to.equal(false);
    parent.appendChild(el);
    await frame();
    expect(state(el)).to.deep.equal(HIDDEN);
  });

  it('5. disabled: button disabled, reveal() no-op; disabled while shown → hidden; a disabled fieldset too; readonly can reveal', async () => {
    const el = field('disabled');
    await frame();
    expect(btn(el).disabled).to.equal(true);
    el.reveal();
    expect(el.revealed).to.equal(false);
    expect(ctl(el).type).to.equal('password');
    el.disabled = false;
    await frame();
    expect(btn(el).disabled).to.equal(false);
    el.reveal();
    el.disabled = true;
    await frame();
    expect(el.revealed).to.equal(false);
    expect(ctl(el).type).to.equal('password');
    expect(btn(el).disabled).to.equal(true);

    const f = mount('<form><fieldset><td-input-field id="fs1" name="p" type="password" revealable></td-input-field></fieldset></form>');
    const inFs = f.querySelector('td-input-field');
    await frame();
    inFs.reveal();
    f.querySelector('fieldset').disabled = true;
    await frame();
    expect(inFs.revealed).to.equal(false);
    expect(btn(inFs).disabled).to.equal(true);
    inFs.reveal();
    expect(inFs.revealed).to.equal(false);
    f.querySelector('fieldset').disabled = false;
    await frame();
    expect(btn(inFs).disabled).to.equal(false);

    const ro = field('readonly value="x"');
    await frame();
    ro.reveal();
    expect(state(ro)).to.deep.equal(SHOWN);
  });

  it('6. autocomplete survives toggling; FormData value unchanged', async () => {
    const el = field('autocomplete="current-password" value="s3cret"');
    await frame();
    const form = el.closest('form');
    el.reveal();
    expect(ctl(el).getAttribute('autocomplete')).to.equal('current-password');
    expect(new FormData(form).get('password')).to.equal('s3cret');
    el.conceal();
    expect(ctl(el).getAttribute('autocomplete')).to.equal('current-password');
    expect(new FormData(form).get('password')).to.equal('s3cret');
    expect(el.value).to.equal('s3cret');
  });

  it('7. td-reveal fires once per change (not on no-op calls)', async () => {
    const el = field();
    await frame();
    const got = [];
    el.addEventListener('td-reveal', (e) => got.push(e.detail.revealed));
    el.reveal();
    el.reveal();
    el.conceal();
    el.conceal();
    el.toggleReveal();
    await clickOn(btn(el));
    el.closest('form').reset();
    expect(got).to.deep.equal([true, false, true, false]);
    el.reveal();
    el.removeAttribute('revealable');
    await frame();
    expect(got).to.deep.equal([true, false, true, false, true, false]);
  });

  it('9. form-dirty on the form: typing while shown does not conceal', async () => {
    const el = field();
    await frame();
    const t = trackFormDirty(el.closest('form'), { beforeUnload: false });
    extra.push(() => t.destroy?.());
    el.reveal();
    ctl(el).focus();
    await sendKeys({ type: 'abc' });
    await wait(50);
    expect(state(el)).to.deep.equal(SHOWN);
    expect(t.dirty ?? t.isDirty?.()).to.equal(true);
  });
});

const SPEC = await (await fetch('/test/ssr/reveal.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/reveal.html')).text();

describe('v0.115.0 password reveal — SSR (php/td.php markup) adopted in place', () => {
  const load = () => {
    const root = mount('');
    root.innerHTML = FIXTURE; // custom elements upgrade on connect (the class is already defined)
    return root;
  };

  it('8. every case adopts without a re-render (_hydrated, the printed button kept), then toggles', async () => {
    // parsed inert (template), the printed nodes kept, then MOVED into the page → upgraded on connect
    const tpl = document.createElement('template');
    tpl.innerHTML = FIXTURE;
    const printed = Object.fromEntries(SPEC.cases.map((c) => [c.id, tpl.content.querySelector(`#${c.host} .td-field__reveal`)]));
    const root = mount('');
    root.appendChild(tpl.content);
    await frame();
    for (const c of SPEC.cases) {
      const el = document.getElementById(c.host);
      expect(el._hydrated === true, `${c.id}: adopted in place`).to.equal(true);
      expect(!!el._ssrFreshRender, `${c.id}: no safe render`).to.equal(false);
      expect(!!btn(el), `${c.id}: button`).to.equal(c.button);
      if (!c.button) continue;
      expect(btn(el) === printed[c.id], `${c.id}: the printed button node`).to.equal(true);
      expect(icon(el), `${c.id}: eye svg`).to.equal('eye');
      if (el.disabled) {
        expect(btn(el).disabled).to.equal(true);
        el.reveal();
        expect(el.revealed).to.equal(false);
        continue;
      }
      el.reveal();
      expect(state(el), c.id).to.deep.equal(SHOWN);
      el.conceal();
      expect(state(el), c.id).to.deep.equal(HIDDEN);
    }
    root.remove();
  });

  it('8b. messages.reveal overridden → the adopted button carries the override', async () => {
    const saved = { ...TdInputField.messages };
    extra.push(() => Object.assign(TdInputField.messages, saved));
    Object.assign(TdInputField.messages, { reveal: 'Show password', conceal: 'Hide password' });
    load();
    await frame();
    const el = document.getElementById('rv-b-host');
    expect(el._hydrated === true).to.equal(true);
    expect(btn(el).getAttribute('aria-label')).to.equal('Show password');
    el.reveal();
    expect(btn(el).getAttribute('aria-label')).to.equal('Hide password');
  });
});
