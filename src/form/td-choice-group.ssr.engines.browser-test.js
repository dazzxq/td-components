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

// review round 2 (item 1): markup over CHOICE_LIMITS — built BEFORE define in a DETACHED container (no upgrade yet), connected
// one by one after define so each adoption decision can be timed. Spies on the 101st option prove it is never read.
const optHtml = (h, i) => `<label class="td-choice__option" data-td-value="v${i}"><input type="radio" class="td-choice__input" id="${h}-o${i}" value="v${i}" name="lim"`
  + ` aria-labelledby="${h}-o${i}-l"><span class="td-choice__face"><span class="td-choice__body"><span class="td-choice__text" id="${h}-o${i}-l">V${i}</span></span></span></label>`;
const limHost = (h, opts) => `<td-choice-group data-td-ssr="choice-group@1" data-k="${h}" id="${h}" name="lim"><div class="td-field td-choice td-choice--button">`
  + `<div class="td-choice__options" role="radiogroup">${opts}</div>`
  + `<div class="td-field__footer" hidden><div class="td-field__note" id="${h}-note" hidden></div></div></div></td-choice-group>`;
const many = (h, n) => limHost(h, Array.from({ length: n }, (_, i) => optHtml(h, i)).join(''));
const BIG = 'á'.repeat(3_000_000);
const LIM = {
  'lim-100': many('lim-100', 100), // the limit itself: adopted
  'lim-101': many('lim-101', 101),
  'lim-text': limHost('lim-text', optHtml('lim-text', 0).replace('>V0<', `>${BIG}<`)),
  'lim-attr': limHost('lim-attr', optHtml('lim-attr', 0).replaceAll('v0', `v${BIG}`)),
  'lim-deep': limHost('lim-deep', optHtml('lim-deep', 0).replace('<span class="td-choice__body">',
    `<span class="td-choice__body">${'<span>'.repeat(60)}x${'</span>'.repeat(60)}`)),
  // review r3 item 1: real data equal to the old sentinel string → adopted normally
  'lim-over-literal': limHost('lim-over-literal', optHtml('lim-over-literal', 0).replaceAll('v0', 'over').replace('>V0<', '>over<')),
  // review r3 item 2: the preflight budget (nodes, depth, attributes per element, attribute length, siblings)
  'pf-comments': limHost('pf-comments', optHtml('pf-comments', 0).replace('<span class="td-choice__face">', `<span class="td-choice__face">${'<!--c-->'.repeat(100000)}`)),
  'pf-attrs': limHost('pf-attrs', optHtml('pf-attrs', 0)).replace('role="radiogroup"', `role="radiogroup" ${Array.from({ length: 1000 }, (_, i) => `data-a${i}="1"`).join(' ')}`),
  'pf-class': limHost('pf-class', optHtml('pf-class', 0)).replace('class="td-field td-choice td-choice--button"', `class="td-field td-choice td-choice--button ${'x'.repeat(3_000_000)}"`),
  'pf-id': limHost('pf-id', optHtml('pf-id', 0).replace('<span class="td-choice__face">', `<span class="td-choice__face" id="${'i'.repeat(3_000_000)}">`)),
  'pf-text': limHost('pf-text', optHtml('pf-text', 0)),
  // review r4 item 1: attribute names that exist on Object.prototype never escape the length cap
  'pf-ctor': limHost('pf-ctor', optHtml('pf-ctor', 0)).replace('role="radiogroup"', `role="radiogroup" constructor="${'x'.repeat(300)}"`),
  'pf-proto': limHost('pf-proto', optHtml('pf-proto', 0).replace('<span class="td-choice__face">', `<span class="td-choice__face" __proto__="${'x'.repeat(300)}">`)),
  'pf-tostring': limHost('pf-tostring', optHtml('pf-tostring', 0)).replace('role="radiogroup"', `role="radiogroup" tostring="${'x'.repeat(300)}"`),
  // review r4 item 2: the HOST's own attributes go through the same preflight
  'host-id': limHost('host-id', optHtml('host-id', 0)).replace('id="host-id" name', `id="${'h'.repeat(3_000_000)}" name`),
  'host-label': limHost('host-label', optHtml('host-label', 0)).replace(' name="lim">', ` name="lim" label="${'L'.repeat(3_000_000)}">`),
  'host-name': limHost('host-name', optHtml('host-name', 0)).replace(' name="lim">', ` name="${'n'.repeat(3_000_000)}">`),
  'host-data': limHost('host-data', optHtml('host-data', 0)).replace(' name="lim">', ` name="lim" data-x="${'d'.repeat(3_000_000)}">`),
  'host-many': limHost('host-many', optHtml('host-many', 0)).replace(' name="lim">', ` name="lim" ${Array.from({ length: 40 }, (_, i) => `data-h${i}="1"`).join(' ')}>`),
};
const ADOPTED = new Set(['lim-100', 'lim-over-literal']);
const late = document.createElement('div');
late.innerHTML = Object.values(LIM).join('');
const spy = { reads: 0 };
{
  // excessive text siblings in a non-leaf container (separate text nodes: only the DOM API makes them)
  const g = late.querySelector('#pf-text .td-choice__options');
  for (let i = 0; i < 5000; i++) g.appendChild(document.createTextNode(' '));
  // spies on the LAST sibling of the long runs: a budgeted walk stops long before it
  const lastText = g.lastChild;
  Object.defineProperty(lastText, 'nextSibling', { get() { spy.reads += 1; return null; } });
  const face = late.querySelector('#pf-comments .td-choice__face');
  let c = face.firstChild;
  while (c && c.nextSibling && c.nextSibling.nodeType === 8) c = c.nextSibling;
  Object.defineProperty(c, 'nextSibling', { get() { spy.reads += 1; return null; } });
}
{
  const last = late.querySelector('#lim-101 .td-choice__option:last-child');
  const r = last.querySelector('input');
  const t = last.querySelector('.td-choice__text');
  r.getAttribute = () => { spy.reads += 1; return 'v100'; };
  Object.defineProperty(t, 'textContent', { get() { spy.reads += 1; return 'V100'; } });
  Object.defineProperty(last, 'firstElementChild', { get() { spy.reads += 1; return r; } });
}

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

describe('td-choice-group SSR — review round 2: hydration honours CHOICE_LIMITS (bounded, before extraction)', () => {
  it('100 options + literal "over" data adopted; preflight breaches (100k comments, 1000 attributes, 3 MB class / id, 5000 text siblings, depth) and 101 / multi-MB text / multi-MB attribute / deep nesting → not adopted, bounded time, one fixed warning, 101st never read', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.map(String).join(' '));
    const times = {};
    try {
      for (const id of Object.keys(LIM)) {
        const host = late.querySelector(`[data-k="${id}"]`);
        const radios0 = [...host.querySelectorAll('input')];
        const t0 = performance.now();
        document.body.appendChild(host); // connect → canHydrate()
        times[id] = performance.now() - t0;
        const now = [...host.querySelectorAll('input')];
        const adopted = radios0.length > 0 && now.length === radios0.length && now.every((r, i) => r === radios0[i]);
        expect(adopted, id).to.equal(ADOPTED.has(id));
        host.remove();
      }
    } finally {
      console.warn = orig;
    }
    expect(spy.reads).to.equal(0);
    const slack = window.TD_PERF_STRICT ? 1 : 20;
    for (const [id, ms] of Object.entries(times)) expect(ms < 100 * slack, `${id} ${ms.toFixed(1)} ms`).to.equal(true);
    const over = warns.filter((w) => /server markup over the limits/.test(w));
    expect(over.length).to.equal(Object.keys(LIM).length - ADOPTED.size); // every over-limit case: one fixed warning each
    expect(new Set(over).size).to.equal(1); // fixed text, never a value
    expect(warns.every((w) => w.length < 300)).to.equal(true);
  });
});
