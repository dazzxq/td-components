import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-button.js';
import './td-action-button.js';
import { setButtonBusy, runWithButton } from './button-busy.js';
import { fillIconSlots } from '../icons/td-icon.js';

// v0.96.0 (plan docs/internal/plans/v0.96.0-busy-button.md §7, ADR 0043) — setButtonBusy / runWithButton on plain `.td-btn`
// markup (PHP td_button() / td_link() / hand-written) and on <td-button> hosts, in Chromium, Firefox AND WebKit. Busy contract:
// aria-busy + aria-disabled, never native disabled (focus kept, submitter name=value kept), clicks swallowed by ONE capture
// listener per document, spinner shown, label / icon faded with opacity 0 (still the accessible name, size unchanged).
// No real mouse (synthetic clicks / keyboard only) → not a POINTER_FILES entry. DOM nodes are compared as booleans (a failing
// chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const stage = document.createElement('div');
document.body.appendChild(stage);

afterEach(() => { stage.innerHTML = ''; });

async function until(fn, label, max = 120) {
  for (let i = 0; i < max; i++) { if (fn()) return; await raf(); }
  throw new Error(`timeout: ${label}`);
}

const SPINNER = '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
  + '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false"><circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
const ICON = '<span class="td-btn__icon" data-td-icon="save" data-td-icon-size="s" aria-hidden="true"></span>';
/** PHP td_button() markup (label + icon + hidden spinner). */
const PHP_BUTTON = `<button type="button" class="td-btn td-btn--primary td-btn--md">${ICON}<span class="td-btn__label">Lưu</span>${SPINNER}</button>`;

function mount(markup) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  stage.appendChild(wrap);
  fillIconSlots(wrap, '.td-btn__icon[data-td-icon]');
  return wrap;
}
const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
/** Counts site clicks on `el` (a listener registered AFTER the helper's guard exists or not: both must be swallowed). */
function countClicks(el) {
  const c = { n: 0 };
  el.addEventListener('click', () => { c.n += 1; });
  return c;
}

describe('v0.96.0 setButtonBusy — plain button.td-btn (PHP markup)', () => {
  it('busy: aria-busy + aria-disabled, not disabled, focus kept, spinner shown, label / icon faded (opacity 0, visible), clicks swallowed', async () => {
    const b = mount(PHP_BUTTON).querySelector('button');
    await raf();
    const idle = box(b);
    const clicks = countClicks(b);
    b.focus();
    setButtonBusy(b, true);
    expect(b.getAttribute('aria-busy')).to.equal('true');
    expect(b.getAttribute('aria-disabled')).to.equal('true');
    expect(b.disabled).to.equal(false);
    expect(document.activeElement === b, 'focus kept').to.equal(true);
    const spinner = b.querySelector('.td-btn__spinner');
    expect(spinner.hidden).to.equal(false);
    expect(getComputedStyle(spinner).display).to.not.equal('none');
    const label = b.querySelector('.td-btn__label');
    expect(getComputedStyle(label).opacity).to.equal('0');
    expect(getComputedStyle(label).visibility, 'label stays in the a11y tree').to.equal('visible');
    expect(getComputedStyle(label).display).to.not.equal('none');
    expect(getComputedStyle(b.querySelector('.td-btn__icon')).opacity).to.equal('0');
    expect(getComputedStyle(spinner).opacity).to.equal('1');
    expect(box(b), 'size unchanged').to.deep.equal(idle);
    b.click();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    expect(clicks.n).to.equal(0);
    setButtonBusy(b, false);
    for (const a of ['aria-busy', 'aria-disabled']) expect(b.hasAttribute(a), a).to.equal(false);
    expect(spinner.hidden).to.equal(true);
    expect(getComputedStyle(label).opacity).to.equal('1');
    b.click();
    expect(clicks.n).to.equal(1);
  });

  it('Enter / Space on a focused busy button never reach the page', async () => {
    const b = mount(PHP_BUTTON).querySelector('button');
    const clicks = countClicks(b);
    b.focus();
    setButtonBusy(b, true);
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    expect(clicks.n).to.equal(0);
    expect(document.activeElement === b).to.equal(true);
    setButtonBusy(b, false);
    await sendKeys({ press: 'Enter' });
    expect(clicks.n).to.equal(1);
  });
});

describe('v0.96.0 setButtonBusy — a.td-btn link', () => {
  it('href dropped while busy (tabindex 0, role link, focus kept, no navigation), restored after', async () => {
    const a = mount(`<a class="td-btn td-btn--primary td-btn--md" href="#busy-link"><span class="td-btn__label">Tài liệu</span>${SPINNER}</a>`)
      .querySelector('a');
    const clicks = countClicks(a);
    const url = location.href;
    a.focus();
    setButtonBusy(a, true);
    expect(a.hasAttribute('href')).to.equal(false);
    expect(a.getAttribute('tabindex')).to.equal('0');
    expect(a.getAttribute('role')).to.equal('link');
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    expect(document.activeElement === a, 'focus kept').to.equal(true);
    a.click();
    expect(clicks.n).to.equal(0);
    expect(location.href).to.equal(url);
    setButtonBusy(a, false);
    expect(a.getAttribute('href')).to.equal('#busy-link');
    for (const n of ['tabindex', 'role', 'aria-disabled', 'aria-busy']) expect(a.hasAttribute(n), n).to.equal(false);
    expect(document.activeElement === a).to.equal(true);
  });

  it('a link with the author aria-disabled="true" stays tabindex -1 while busy and comes back verbatim', () => {
    const a = mount(`<a class="td-btn td-btn--primary td-btn--md" href="#x" aria-disabled="true"><span class="td-btn__label">X</span>${SPINNER}</a>`)
      .querySelector('a');
    setButtonBusy(a, true);
    expect(a.getAttribute('tabindex')).to.equal('-1');
    setButtonBusy(a, false);
    expect(a.getAttribute('href')).to.equal('#x');
    expect(a.getAttribute('aria-disabled')).to.equal('true');
    expect(a.hasAttribute('tabindex')).to.equal(false);
    expect(a.hasAttribute('role')).to.equal(false);
  });
});

describe('v0.96.0 setButtonBusy / runWithButton — <td-button> hosts', () => {
  it('host or its inner control → the loading attribute; the control follows the same contract', async () => {
    const host = mount('<td-button>Gửi</td-button>').querySelector('td-button');
    await until(() => host.querySelector('button'), 'rendered');
    const b = host.querySelector('button');
    setButtonBusy(host, true);
    expect(host.hasAttribute('loading')).to.equal(true);
    expect(b.getAttribute('aria-busy')).to.equal('true');
    expect(b.getAttribute('aria-disabled')).to.equal('true');
    expect(getComputedStyle(b.querySelector('.td-btn__label')).opacity).to.equal('0');
    setButtonBusy(b, false); // the control resolves to the host
    expect(host.hasAttribute('loading')).to.equal(false);
    expect(b.hasAttribute('aria-busy')).to.equal(false);
  });

  it('runWithButton(host) shares the in-flight promise with host.run(); <td-action-button> too', async () => {
    for (const markup of ['<td-button>Lưu</td-button>', '<td-action-button action="edit"></td-action-button>']) {
      const host = mount(markup).firstElementChild;
      await until(() => host.querySelector('.td-btn'), 'rendered');
      let release;
      let runs = 0;
      const p = runWithButton(host, () => { runs += 1; return new Promise((r) => { release = r; }); });
      expect(host.run(() => { runs += 10; }) === p, markup).to.equal(true);
      expect(runWithButton(host.querySelector('.td-btn'), () => { runs += 10; }) === p).to.equal(true);
      expect(host.querySelector('.td-btn').getAttribute('aria-busy')).to.equal('true');
      await until(() => release, 'fn started');
      release('ok');
      expect(await p).to.equal('ok');
      expect(runs).to.equal(1);
      expect(host.hasAttribute('loading')).to.equal(false);
    }
  });
});

describe('v0.96.0 guard', () => {
  it('a click on an SVG / icon / spinner inside a busy button is swallowed (composedPath)', async () => {
    const b = mount(PHP_BUTTON).querySelector('button');
    await until(() => b.querySelector('.td-btn__icon svg'), 'icon filled');
    const seen = { n: 0 };
    stage.addEventListener('click', () => { seen.n += 1; });
    setButtonBusy(b, true);
    for (const t of [b.querySelector('.td-btn__icon svg'), b.querySelector('.td-spinner__svg'), b.querySelector('.td-btn__label')]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
      t.dispatchEvent(ev);
      expect(ev.defaultPrevented).to.equal(true);
    }
    expect(seen.n).to.equal(0);
    setButtonBusy(b, false);
  });

  it('a button in a same-origin iframe gets the guard of ITS document; the parent document is unaffected', async () => {
    const frame = document.createElement('iframe');
    frame.srcdoc = `<!doctype html><body>${PHP_BUTTON}</body>`;
    stage.appendChild(frame);
    await until(() => frame.contentDocument?.querySelector('button.td-btn'), 'iframe loaded');
    const inner = frame.contentDocument.querySelector('button.td-btn');
    const outer = mount(PHP_BUTTON).querySelector('button');
    const innerClicks = countClicks(inner);
    const outerClicks = countClicks(outer);
    setButtonBusy(inner, true);
    expect(inner.getAttribute('aria-busy')).to.equal('true');
    expect(inner.querySelector('.td-btn__spinner').hidden).to.equal(false);
    inner.click();
    inner.click();
    outer.click();
    expect(innerClicks.n).to.equal(0);
    expect(outerClicks.n).to.equal(1);
    setButtonBusy(inner, false);
    inner.click();
    expect(innerClicks.n).to.equal(1);
  });
});

describe('v0.96.0 hand-written markup without a spinner', () => {
  it('builds the spinner once (no style attribute), wraps the bare text in .td-btn__label, centred, size unchanged', async () => {
    const b = mount('<button type="button" class="td-btn td-btn--primary">Lưu</button>').querySelector('button');
    await raf();
    const idle = box(b);
    setButtonBusy(b, true);
    setButtonBusy(b, false);
    setButtonBusy(b, true);
    expect(b.querySelectorAll('.td-btn__spinner').length).to.equal(1);
    expect(b.querySelectorAll('[style]').length + (b.hasAttribute('style') ? 1 : 0)).to.equal(0);
    const label = b.querySelector('.td-btn__label');
    expect(!!label && label.textContent === 'Lưu').to.equal(true);
    expect(getComputedStyle(label).opacity).to.equal('0');
    await raf();
    expect(box(b)).to.deep.equal(idle);
    const sr = b.querySelector('.td-spinner__svg').getBoundingClientRect();
    const br = b.getBoundingClientRect();
    expect(Math.abs((sr.left + sr.width / 2) - (br.left + br.width / 2)) < 2, 'centred x').to.equal(true);
    expect(Math.abs((sr.top + sr.height / 2) - (br.top + br.height / 2)) < 2, 'centred y').to.equal(true);
    setButtonBusy(b, false);
    expect(b.querySelector('.td-btn__spinner').hidden).to.equal(true);
  });
});

describe('v0.96.0 runWithButton + forms', () => {
  it('re-entrant: same promise, fn once, nested call shares it; reject releases + reaches the caller', async () => {
    const b = mount(PHP_BUTTON).querySelector('button');
    let runs = 0;
    let nested = null;
    let release;
    const p = runWithButton(b, () => {
      runs += 1;
      nested = runWithButton(b, () => { runs += 10; });
      return new Promise((r) => { release = r; });
    });
    expect(runWithButton(b, () => { runs += 10; }) === p).to.equal(true);
    await until(() => release, 'fn started');
    expect(nested === p).to.equal(true);
    release();
    await p;
    expect(runs).to.equal(1);
    let err = null;
    await runWithButton(b, async () => { throw new Error('nope'); }).catch((e) => { err = e; });
    expect(err?.message).to.equal('nope');
    expect(b.hasAttribute('aria-busy')).to.equal(false);
  });

  it('AJAX pattern: the busy submitter still contributes name=value; submitter null (requestSubmit()) works too', async () => {
    const form = mount(`<form action="/never"><input name="q" value="a"><button type="submit" name="action" value="x" class="td-btn td-btn--primary">`
      + `<span class="td-btn__label">Gửi</span>${SPINNER}</button></form>`).querySelector('form');
    const sent = [];
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      runWithButton(submitter ?? form.querySelector('[type=submit]'), async () => {
        const body = submitter ? new FormData(form, submitter) : new FormData(form);
        sent.push([...body.entries()].map(([k, v]) => `${k}=${v}`).join('&'));
      });
    });
    const btn = form.querySelector('button');
    btn.click();
    await until(() => sent.length === 1, 'sent once');
    expect(sent[0]).to.equal('q=a&action=x');
    await until(() => !btn.hasAttribute('aria-busy'), 'released');
    form.requestSubmit();
    await until(() => sent.length === 2, 'sent without submitter');
    expect(sent[1]).to.equal('q=a');
  });

  it('a busy submitter keeps name=value in FormData(form, submitter) (not disabled)', () => {
    const form = mount(`<form><input name="q" value="b"><button type="submit" name="action" value="y" class="td-btn">Go</button></form>`)
      .querySelector('form');
    const btn = form.querySelector('button');
    setButtonBusy(btn, true);
    expect([...new FormData(form, btn).entries()].map(([k, v]) => `${k}=${v}`).join('&')).to.equal('q=b&action=y');
    setButtonBusy(btn, false);
  });

  it('implicit submission: Enter in a field while the default submit button is busy → no submit event', async () => {
    const form = mount(`<form><input name="q" value="c"><button type="submit" class="td-btn"><span class="td-btn__label">Gửi</span>${SPINNER}</button></form>`)
      .querySelector('form');
    let submits = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submits += 1; });
    const input = form.querySelector('input');
    setButtonBusy(form.querySelector('button'), true);
    input.focus();
    await sendKeys({ press: 'Enter' });
    await raf();
    expect(submits).to.equal(0);
    setButtonBusy(form.querySelector('button'), false);
    input.focus();
    await sendKeys({ press: 'Enter' });
    await until(() => submits === 1, 'submits when idle');
  });
});
