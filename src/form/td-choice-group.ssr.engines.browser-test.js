import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-choice-group> is defined LATE (dynamic import below), after the no-JS checks.

// v0.49.0 (ADR 0012 + 0022, plan docs/internal/plans/v0.49.0-choice-stepper.md M4) — td_choice_group() / <td-choice-group>
// hydrate in place, contract `choice-group@1`, in Chromium, Firefox AND WebKit. The markup is EXACTLY what php/td.php prints
// for every case of test/ssr/choice.fixtures.json: test/ssr/fixtures/choice.html (`node test/ssr/build-choice-fixture.mjs`,
// kept fresh by test/php/td-ssr-choice.test.js). The test server is http: → the `{ page http, allowHttpLinks, img http: }`
// row of test/ssr/media-url.cases.json (kept); the https rows are covered by the node / php tables.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/choice.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/choice.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const formOf = (id) => document.querySelector(`form[data-case="${id}"]`);
const hostOf = (id) => formOf(id).querySelector('td-choice-group');
const radiosOf = (id) => [...hostOf(id).querySelectorAll('input[type="radio"]')];
const hostHtml = (id) => TPL.content.querySelector(`form[data-case="${id}"] > td-choice-group`).outerHTML;
const entries = (id) => [...new FormData(formOf(id)).entries()].map(([k, v]) => `${k}=${v}`);

// Hand-written mismatches (must render safely, never adopt) — the checked value and the focus must survive.
const cap = hostHtml('c-cap'); // host id c-cap-h
const MM = {
  'mm-schema': cap.replace('choice-group@1', 'choice-group@2'),
  'mm-onclick': cap.replace('<input ', '<input onclick="window.__pwned = 1" '),
  'mm-style': cap.replace('<span class="td-choice__face">', '<span class="td-choice__face" style="color: red">'),
  'mm-extra': cap.replace('<div class="td-choice__options"', '<b>thừa</b><div class="td-choice__options"'),
  'mm-hidden': cap.replace('<span class="td-choice__face">', '<input type="hidden" name="cap" value="9"><span class="td-choice__face">'),
  'mm-name': cap.replace(' name="cap" value="128" label', ' name="other" value="128" label'),
  'mm-img': hostHtml('c-color').replace('src="/test/fixtures/1.svg"', 'src="javascript:window.__pwned=1"').replaceAll('c-color-h', 'mm-img-h'),
  'mm-fill': hostHtml('c-color').replace('fill="#3b3b3d"', 'fill="url(#x)"').replaceAll('c-color-h', 'mm-fill-h'),
  'mm-focus': cap.replace('<span class="td-choice__face">', '<span class="td-choice__face" data-td-x="1">'),
};
const mmForm = document.createElement('div');
mmForm.innerHTML = Object.entries(MM).map(([id, html]) => `<form data-case="${id}">${html.replaceAll('c-cap-h', `${id}-h`)}</form>`).join('');
document.body.appendChild(mmForm);

// --- before define: the no-JS form ---
const rect = (id) => hostOf(id).getBoundingClientRect();
const boxes0 = Object.fromEntries(SPEC.cases.map((c) => [c.id, rect(c.id)]));
const nodes0 = Object.fromEntries(SPEC.cases.map((c) => [c.id, radiosOf(c.id)]));
const noJs = {
  cap: entries('c-cap'),
  allDisabledValid: formOf('c-alldisabled').checkValidity(),
  reqOneValid: formOf('c-reqone').checkValidity(),
  allDisabledEntries: entries('c-alldisabled'),
  defined: !!customElements.get('td-choice-group'),
};
// a user changes the choice with the keyboard before the module loads (native arrows)
radiosOf('c-typed')[0].focus();
await sendKeys({ press: 'ArrowRight' });
await sendKeys({ press: 'ArrowRight' });
noJs.typed = radiosOf('c-typed').find((r) => r.checked)?.value;
// the mismatched one with focus, and the adopted one with focus (last: it keeps it)
const mmFocusRadio = [...hostOf('mm-focus').querySelectorAll('input')].find((r) => r.value === '1tb');
mmFocusRadio.click(); // the live choice of refused markup (the focus is tested on the adopted c-focus: one focus per page)
const focusRadio = radiosOf('c-focus')[1];
focusRadio.focus();

window.__pwned = 0;
const { TdChoiceGroup } = await import('./td-choice-group.js');
await new Promise((r) => setTimeout(r, 30));

describe('td-choice-group SSR — no JS (choice-group@1)', () => {
  it('native radios submit name=value; required parity (all disabled = valid, one enabled unselected = invalid)', () => {
    expect(noJs.defined).to.equal(false);
    expect(noJs.cap).to.deep.equal(['cap=128']);
    expect(noJs.allDisabledValid).to.equal(true);
    expect(noJs.allDisabledEntries).to.deep.equal([]);
    expect(noJs.reqOneValid).to.equal(false);
    expect(noJs.typed).to.equal('c'); // native arrows before define
  });
});

describe('td-choice-group SSR — adopted in place', () => {
  it('every fixture case: same radio nodes, private group without form owner, host owns FormData, expected state', () => {
    for (const c of SPEC.cases) {
      const el = hostOf(c.id);
      expect(el instanceof TdChoiceGroup, c.id).to.equal(true);
      expect(el.hasAttribute('data-td-ssr'), c.id).to.equal(false);
      const rs = radiosOf(c.id);
      expect(rs.length, c.id).to.equal(nodes0[c.id].length);
      expect(rs.every((r, i) => r === nodes0[c.id][i]), `${c.id} identity`).to.equal(true);
      expect(rs.every((r) => /^td-choice-\d+$/.test(r.name) && r.getAttribute('form') === '' && r.getAttribute('autocomplete') === 'off'
        && !r.hasAttribute('required')), `${c.id} private group`).to.equal(true);
      expect(el.value, c.id).to.equal(c.expect.value);
      expect(rs.map((r) => r.value), c.id).to.deep.equal(c.expect.values);
      expect(el.options.filter((o) => o.disabled).map((o) => o.value), c.id).to.deep.equal(c.expect.disabled);
      expect(el.options.filter((o) => o.unavailable).map((o) => o.value), c.id).to.deep.equal(c.expect.unavailable);
      const name = el.getAttribute('name');
      const want = c.expect.value && !el.hasAttribute('disabled') ? [`${name}=${c.expect.value}`] : [];
      expect(entries(c.id), c.id).to.deep.equal(want);
      if ('valid' in c.expect) expect(el.checkValidity(), c.id).to.equal(c.expect.valid);
      if (c.expect.error) {
        expect(el.errorMessage, c.id).to.equal(c.expect.error);
        expect(el.querySelector('[role="radiogroup"]').getAttribute('aria-invalid'), c.id).to.equal('true');
      }
    }
  });

  it('no layout shift: host boxes before / after define within 1px', () => {
    for (const c of SPEC.cases) {
      const a = boxes0[c.id];
      const b = rect(c.id);
      expect(Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1, `${c.id} ${a.width}x${a.height} → ${b.width}x${b.height}`).to.equal(true);
    }
  });

  it('focus kept on the same radio; a value changed before define is the live state; reset → the server default', () => {
    expect(document.activeElement === focusRadio).to.equal(true);
    expect(hostOf('c-focus').value).to.equal('b');
    expect(hostOf('c-typed').value).to.equal('c');
    formOf('c-typed').reset();
    expect(hostOf('c-typed').value).to.equal('a');
    expect(radiosOf('c-typed')[0].checked).to.equal(true);
  });

  it('swatch: fill + image kept, current choice line; http image kept on an http page (allowHttpLinks row)', () => {
    const el = hostOf('c-color');
    expect(el.querySelector('circle').getAttribute('fill')).to.equal('#3b3b3d');
    expect(el.querySelector('img.td-choice__image') !== null).to.equal(true);
    expect(el.querySelector('.td-choice__current').textContent).to.equal(': Titan đen');
    expect(el.querySelector('#c-color-h-o1-n').textContent).to.equal('Sắp về'); // custom note kept
    expect(hostOf('c-http').querySelector('img.td-choice__image') !== null).to.equal(true);
  });

  it('escaping survived; behaviour after adoption: arrows + events + host value', async () => {
    expect(window.__pwned).to.equal(0);
    expect(hostOf('c-escape').value).to.equal('"><b>v');
    const el = hostOf('c-cap');
    const log = [];
    el.addEventListener('change', (e) => log.push(e.detail.value));
    radiosOf('c-cap')[0].focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(el.value).to.equal('256');
    expect(log).to.deep.equal(['256']);
    expect(entries('c-cap')).to.deep.equal(['cap=256']);
    // default "Hết hàng" note = state: a site message override is applied on the next bind
    expect(el.querySelector('#c-cap-h-o1-n').textContent).to.equal(TdChoiceGroup.messages.unavailable);
  });
});

describe('td-choice-group SSR — refused markup renders safely', () => {
  it('every mismatch: rendered by the component (no foreign attribute / node), value kept, radios private', () => {
    for (const id of Object.keys(MM)) {
      const el = document.querySelector(`form[data-case="${id}"] > td-choice-group`);
      expect(el instanceof TdChoiceGroup, id).to.equal(true);
      expect(el.querySelector('[onclick], [style], b, input[type="hidden"], [data-td-x]'), id).to.equal(null);
      const rs = [...el.querySelectorAll('input')];
      // an unreadable skeleton (mm-hidden: a foreign control where the face belongs) → no option is trusted: clean render
      expect((id === 'mm-hidden' || rs.length > 0) && rs.every((r) => r.type === 'radio' && /^td-choice-\d+$/.test(r.name)), id).to.equal(true);
      const keys = [...new FormData(el.closest('form')).keys()];
      expect(keys.every((k) => k === el.getAttribute('name')), `${id} ${keys}`).to.equal(true);
    }
    expect(window.__pwned).to.equal(0);
    expect(document.querySelector('form[data-case="mm-schema"] > td-choice-group').value).to.equal('128');
    expect(document.querySelector('form[data-case="mm-hidden"] > td-choice-group').value).to.equal('128'); // host value, pending options
    // refused image / colour → no <img> / no fill on that option, value kept
    const img = document.querySelector('form[data-case="mm-img"] > td-choice-group');
    expect(img.querySelector('img')).to.equal(null);
    expect(img.value).to.equal('den');
    const fill = document.querySelector('form[data-case="mm-fill"] > td-choice-group');
    expect([...fill.querySelectorAll('circle')].some((c) => (c.getAttribute('fill') || '').includes('url'))).to.equal(false);
  });

  it('refused markup: the live choice (changed before define) moves to the new radio', () => {
    const el = document.querySelector('form[data-case="mm-focus"] > td-choice-group');
    expect(el.value).to.equal('1tb');
    const r = [...el.querySelectorAll('input')].find((x) => x.value === '1tb');
    expect(r.checked).to.equal(true);
    expect(r === mmFocusRadio).to.equal(false);
  });
});
