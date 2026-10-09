import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-datetime-picker> is defined LATE (dynamic import below), after the no-JS checks.

// v0.56.0 (ADR 0012 / 0025, plan docs/internal/plans/v0.56.0-repeater-icons-date.md D1–D7, M1 / M5) — td_datetime_picker()
// / td_date() / <td-datetime-picker> hydrate, in Chromium, Firefox AND WebKit. Native values are edited through `.value`
// (dirty, like typing).
//
// v0.60.0 (plan docs/internal/plans/v0.60.0-calendar-picker.md B3 / B5 / B6, M1a) — TWO contracts, both adopted in place:
//   datetime-picker@2  what php/td.php prints NOW for every case of test/ssr/datetime-picker.fixtures.json:
//                      test/ssr/fixtures/datetime-picker.html (`node test/ssr/build-datetime-picker-fixture.mjs`, kept
//                      fresh by test/php/td-v056-php.test.js). No implicit 2000–2099 window: the native input has no
//                      implicit `min`, and `max="9999-12-31[T23:59]"` when the site sets no max (the limit of what the
//                      kit can represent — M0: Chromium takes a 6-digit year in a date input without `max`).
//   datetime-picker@1  what php/td.php v0.59.0 printed: test/ssr/fixtures/datetime-picker.v1.html — FROZEN, never
//                      regenerated (a page rendered by an old td.php during a rolling upgrade). Its case / element ids
//                      are renamed `p-*` → `o-*` here so both sets live in one document.
// Every case of BOTH sets must take the ADOPTION path — proven by node identity (host box, label, trigger, clear button,
// error note are the very nodes PHP printed), by the mutation record (the only node removed is the native input) and by
// the return value of canHydrate() on late-inserted copies — a safe re-render would also end with a working picker.
// The schema is part of the gate: @2 markup carrying the @1 implicit domain (and the reverse) is REFUSED.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/datetime-picker.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/datetime-picker.html')).text();
const FIXTURE_V1 = (await (await fetch('/test/ssr/fixtures/datetime-picker.v1.html')).text()).replaceAll('"p-', '"o-');
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE + FIXTURE_V1;

const root = document.createElement('div');
root.innerHTML = FIXTURE + FIXTURE_V1;
document.body.appendChild(root);

/** The two contracts: case id prefix (`p-date` = @2 generated, `o-date` = @1 frozen). */
const SETS = [{ schema: 2, pre: 'p-' }, { schema: 1, pre: 'o-' }];
const idOf = (set, c) => set.pre + c.id.slice(2);
const formOf = (id, scope = root) => scope.querySelector(`form[data-case="${id}"]`);
const hostOf = (id, scope = root) => formOf(id, scope).querySelector('td-datetime-picker');
const hostHtml = (id) => TPL.content.querySelector(`form[data-case="${id}"] > td-datetime-picker`).outerHTML;
const nativeOf = (host) => host.querySelector('input.td-dtp__native');
const entries = (form) => [...new FormData(form).entries()].map(([k, v]) => `${k}=${v}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const display = (el) => getComputedStyle(el).display;

// Hand-written mismatches (must render safely, never adopt). Base: p-date (label + value).
const base = hostHtml('p-date');
const INPUT = /<input class="td-dtp__native"[^>]*>/.exec(base)[0];
const TRIGGER = /<button type="button" class="td-dtp__trigger"[\s\S]*?<\/button>/.exec(base)[0];
const LABEL = /<label class="td-field__label"[\s\S]*?<\/label>/.exec(base)[0];
const MM = {
  'mm-extra-input': base.replace(INPUT, `${INPUT}<input type="hidden" name="ngay" value="1999-01-01">`),
  'mm-formaction': base.replace(TRIGGER, TRIGGER.replace('<button ', '<button formaction="/evil" ')),
  'mm-type': base.replace(INPUT, INPUT.replace('type="date"', 'type="datetime-local"')),
  'mm-text': base.replace(INPUT, INPUT.replace('type="date"', 'type="text"')),
  'mm-label-for': base.replace(LABEL, LABEL.replace(/for="[^"]+"/, 'for="elsewhere"')),
  'mm-unknown-attr': base.replace(INPUT, INPUT.replace('<input ', '<input onclick="window.__dtpPwn = 1" ')),
  'mm-name': base.replace(INPUT, INPUT.replace('name="ngay"', 'name="other"')),
  'mm-min': base.replace(INPUT, INPUT.replace(' max="9999-12-31"', ' min="1990-01-01" max="9999-12-31"')),
  'mm-max': base.replace(INPUT, INPUT.replace(' max="9999-12-31"', ' max="2030-01-01"')),
  'mm-no-max': base.replace(INPUT, INPUT.replace(' max="9999-12-31"', '')),
  'mm-trigger-first': base.replace(TRIGGER, '').replace(LABEL, `${LABEL}${TRIGGER}`),
  'mm-no-native': base.replace(INPUT, ''),
  'mm-icon-content': base.replace('aria-hidden="true"></span></button>', 'aria-hidden="true"><img alt="" data-injected=""></span></button>'),
  'mm-schema': base.replace('datetime-picker@2', 'datetime-picker@3'),
  'mm-schema-0': base.replace('datetime-picker@2', 'datetime-picker@0'),
  // v0.60.0 B6 — the schema reaches the native-input template: each contract only adopts ITS OWN implicit domain
  'x-v2-with-v1-domain': hostHtml('o-date').replaceAll('o-date', 'p-date').replace('datetime-picker@1', 'datetime-picker@2'),
  'x-v1-with-v2-domain': base.replace('datetime-picker@2', 'datetime-picker@1'),
  'x-v2-datetime-with-v1-domain': hostHtml('o-datetime').replaceAll('o-datetime', 'p-date').replace('datetime-picker@1', 'datetime-picker@2'),
};
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => `<form data-case="${id}">${html.replaceAll('p-date', id)}</form>`).join('');
document.body.appendChild(mismatch);

// --- before the module loads (no JS) ---
const noJs = {};
const before = {};
const records = [];
const observer = new MutationObserver((list) => records.push(...list));
for (const set of SETS) {
  const P = set.pre;
  noJs[set.schema] = {
    fd: entries(formOf(`${P}date`)),
    dt: entries(formOf(`${P}datetime`)),
    trigger: display(hostOf(`${P}date`).querySelector('.td-dtp__trigger')),
    native: display(nativeOf(hostOf(`${P}date`))),
    type: nativeOf(hostOf(`${P}datetime`)).type,
    required: nativeOf(hostOf(`${P}empty`)).validity.valueMissing,
    disabled: nativeOf(hostOf(`${P}dis`)).disabled && entries(formOf(`${P}dis`)).length === 0,
    under: nativeOf(hostOf(`${P}under`)).validity.rangeUnderflow,
    domain: [nativeOf(hostOf(`${P}date`)).min, nativeOf(hostOf(`${P}date`)).max],
    domainDt: [nativeOf(hostOf(`${P}datetime`)).min, nativeOf(hostOf(`${P}datetime`)).max],
    domainMin: [nativeOf(hostOf(`${P}min`)).min, nativeOf(hostOf(`${P}min`)).max],
    old: nativeOf(hostOf(`${P}old`)).getAttribute('value'),
    labelFor: hostOf(`${P}date`).querySelector('label').control === nativeOf(hostOf(`${P}date`)),
  };
  for (const c of SPEC.cases) {
    const id = idOf(set, c);
    const h = hostOf(id);
    before[id] = {
      host: h, box: h.querySelector(':scope > .td-dtp'), trigger: h.querySelector('.td-dtp__trigger'), clear: h.querySelector('.td-dtp__clear'),
      label: h.querySelector('label.td-field__label'), value: h.querySelector('.td-dtp__value'), error: h.querySelector('.td-field-error'),
      note: h.querySelector('.td-field__note'), native: nativeOf(h),
    };
  }
  // the user edits natives before define (dirty values), one keeps the focus
  nativeOf(hostOf(`${P}date`)).value = '2026-06-20';
  nativeOf(hostOf(`${P}datetime`)).value = '2026-06-15T10:45';
  // a live value outside the OLD default window 2000–2099 — a valid date since v0.60.0 (both contracts)
  nativeOf(hostOf(`${P}help`)).value = '1990-01-01';
  // an early property wins over the live native value
  nativeOf(hostOf(`${P}nolabel`)).value = '2026-07-01';
  hostOf(`${P}nolabel`).value = '02/07/2026';
}
nativeOf(hostOf('p-datetime')).focus();
observer.observe(root, { childList: true, subtree: true });
// mismatches: live values typed
const mismatchBefore = {};
for (const id of Object.keys(MM)) {
  mismatchBefore[id] = hostOf(id, mismatch).querySelector('.td-dtp__trigger');
  const ins = hostOf(id, mismatch).querySelectorAll('input.td-dtp__native');
  if (ins.length === 1 && ins[0].type === 'date') ins[0].value = '2026-06-03';
}

const { TdDatetimePicker } = await import('./td-datetime-picker.js');
await wait(0);
records.push(...observer.takeRecords());
observer.disconnect();

// Late-inserted copies (the element is defined now): canHydrate()'s return value is observable — true = adoption path.
const verdicts = new Map();
const realCanHydrate = TdDatetimePicker.prototype.canHydrate;
TdDatetimePicker.prototype.canHydrate = function spy() {
  const r = realCanHydrate.call(this);
  verdicts.set(this.id, r);
  return r;
};
const late = document.createElement('div');
document.body.appendChild(late);
late.innerHTML = (FIXTURE + FIXTURE_V1).replaceAll('"p-', '"lp-').replaceAll('"o-', '"lo-')
  + Object.entries(MM).map(([id, html]) => `<form data-case="l${id}">${html.replaceAll('p-date', `l${id}`)}</form>`).join('');
await wait(0);
TdDatetimePicker.prototype.canHydrate = realCanHydrate;

for (const set of SETS) {
  describe(`datetime-picker@${set.schema} — no JS (php markup alone)`, () => {
    const n = noJs[set.schema];
    it('the native input submits name=yyyy-mm-dd (datetime: yyyy-mm-ddThh:mm); the trigger is hidden; label → native', () => {
      expect(n.fd).to.deep.equal(['ngay=2026-06-15']);
      expect(n.dt).to.deep.equal(['hen=2026-06-15T09:30']);
      expect(n.trigger).to.equal('none');
      expect(n.native).to.not.equal('none');
      expect(n.type).to.equal('datetime-local');
      expect(n.labelFor).to.equal(true);
    });
    it('required / disabled / min underflow by the browser', () => {
      expect(n.required).to.equal(true);
      expect(n.disabled).to.equal(true);
      expect(n.under).to.equal(true);
    });
    if (set.schema === 1) {
      it('@1 (frozen v0.59.0 markup): implicit 2000–2099 domain without bounds; a server value outside it was dropped by PHP', () => {
        expect(n.domain).to.deep.equal(['2000-01-01', '2099-12-31']);
        expect(n.domainDt).to.deep.equal(['2000-01-01T00:00', '2099-12-31T23:59']);
        expect(n.domainMin).to.deep.equal(['1900-01-01', '']);
        expect(n.old).to.equal(null);
      });
    } else {
      it('@2: no implicit min; max = 9999-12-31 (the representable limit) unless the site sets one; a 1990 server value is kept', () => {
        expect(n.domain).to.deep.equal(['', '9999-12-31']);
        expect(n.domainDt).to.deep.equal(['', '9999-12-31T23:59']);
        expect(n.domainMin).to.deep.equal(['1900-01-01', '9999-12-31']);
        expect(n.old).to.equal('1990-05-01');
      });
    }
  });
}

for (const set of SETS) describe(`datetime-picker@${set.schema} — adopted in place (the ADOPTION path, not a re-render)`, () => {
  const P = set.pre;
  for (const c0 of SPEC.cases) {
    const c = { ...c0, id: idOf(set, c0) };
    it(`${c.id}: node identity (box, label, trigger, value, clear, error note), native gone, state = expect`, () => {
      const h = hostOf(c.id);
      const b = before[c.id];
      expect(h === b.host).to.equal(true);
      expect(h.querySelector(':scope > .td-dtp') === b.box, 'box identity kept (adopted)').to.equal(true);
      expect(h.querySelector('.td-dtp__trigger') === b.trigger, 'trigger identity kept (adopted)').to.equal(true);
      expect(h.querySelector('.td-dtp__value') === b.value, 'value span identity kept').to.equal(true);
      expect(h.querySelector('label.td-field__label') === b.label, 'label identity kept').to.equal(true);
      expect(h.querySelector('.td-field-error') === b.error, 'error note identity kept').to.equal(true);
      expect(h.querySelector('.td-field__note') === b.note, 'helper note identity kept').to.equal(true);
      expect(b.native.isConnected, 'the native input left the document').to.equal(false);
      // the mutation record of this host: the ONLY element removed is the native input; nothing but icon drawings added
      const mine = records.filter((r) => h.contains(r.target) || r.target === h);
      const removed = mine.flatMap((r) => [...r.removedNodes]).filter((n) => n.nodeType === 1);
      expect(removed.length === 1 && removed[0] === b.native, `removed: ${removed.map((n) => n.localName + '.' + n.className).join(', ')}`).to.equal(true);
      const added = mine.flatMap((r) => [...r.addedNodes].map((n) => [r.target, n])).filter(([, n]) => n.nodeType === 1);
      expect(added.every(([t]) => t.closest('[data-td-icon]')), `added outside an icon slot: ${added.map(([, n]) => n.localName).join(', ')}`).to.equal(true);
      // a late-inserted copy of the same markup: canHydrate() === true
      expect(verdicts.get(`l${c.id}`), 'canHydrate() of a late copy').to.equal(true);
      expect(h.querySelectorAll('input').length).to.equal(0);
      expect(h.hasAttribute('data-td-ssr')).to.equal(false);
      let want = c.expect.value;
      let entry = c.expect.entry;
      if (c.id === `${P}date`) { want = '20/06/2026'; entry = 'ngay=2026-06-20'; }
      if (c.id === `${P}datetime`) { want = '15/06/2026 - 10:45'; entry = 'hen=2026-06-15T10:45:00'; }
      if (c.id === `${P}help`) { want = '01/01/1990'; entry = 'goiy=1990-01-01'; }
      if (c.id === `${P}nolabel`) { want = '02/07/2026'; entry = 'nl=2026-07-02'; }
      if (c.id === 'o-old') { want = ''; entry = 'old='; } // @1: php v0.59.0 dropped the 1990 value
      expect(h.getAttribute('value') || '').to.equal(want);
      expect(entries(formOf(c.id))).to.deep.equal(entry === null ? [] : (entry.endsWith('=') ? [] : [entry]));
      const label = h.querySelector('label.td-field__label');
      if (label) expect(label.getAttribute('for')).to.equal(`${h.id}-trigger`);
      if (c.expect.error) {
        expect(h.querySelector('.td-dtp__trigger').getAttribute('aria-invalid')).to.equal('true');
        expect(h.querySelector('.td-field-error').textContent).to.equal(c.expect.error);
      }
      if (c.expect.disabled) expect(h.querySelector('.td-dtp__trigger').disabled).to.equal(true);
      if (c.expect.required) expect(h.validity.valueMissing).to.equal(true);
      if (c.expect.underflow) expect(h.validity.rangeUnderflow).to.equal(true);
      // v0.59.0 `clearable`: the PHP clear button is adopted (same node), its `hidden` follows the live state
      if (c.expect.clear) {
        const btn = h.querySelector('.td-dtp__clear');
        expect(!!btn && btn === b.clear, 'clear button adopted').to.equal(true);
        expect(btn.hidden).to.equal(c.expect.clear === 'hidden');
        expect(btn.getAttribute('aria-label')).to.equal('Xoá ngày');
      } else expect(h.querySelector('.td-dtp__clear')).to.equal(null);
    });
  }

  it('the trigger text is the Vietnamese display; FormData holds exactly ONE entry (the native lost its name)', () => {
    expect(hostOf(`${P}date`).querySelector('.td-dtp__value').textContent).to.equal('20/06/2026');
    expect(new FormData(formOf(`${P}date`)).getAll('ngay')).to.deep.equal(['2026-06-20']);
    expect(hostOf(`${P}empty`).querySelector('.td-dtp__value').hasAttribute('data-placeholder')).to.equal(true);
  });

  if (set.schema === 2) {
    it('focus on the native at define → the trigger', () => {
      expect(document.activeElement === hostOf('p-datetime').querySelector('.td-dtp__trigger')).to.equal(true);
    });
  }

  it('v0.60.0: a live value outside the OLD 2000–2099 window is a valid date now (no badInput, formatted entry)', () => {
    expect(hostOf(`${P}help`).validity.valid).to.equal(true);
    expect(hostOf(`${P}help`).getDBValue()).to.equal('1990-01-01');
    expect(hostOf(`${P}min`).validity.valid).to.equal(true);
  });

  it(set.schema === 1 ? '@1: the 1990 server value was dropped by php v0.59.0 → empty (nothing to recover)'
    : '@2: the 1990 server value is printed, adopted and valid; form reset returns to it', () => {
    const h = hostOf(`${P}old`);
    if (set.schema === 1) {
      expect(h.getAttribute('value')).to.equal(null);
      return;
    }
    expect(h.getAttribute('value')).to.equal('01/05/1990');
    expect(h.validity.valid).to.equal(true);
    h.setValue('01/01/2026');
    formOf('p-old').reset();
    expect(h.getAttribute('value')).to.equal('01/05/1990');
  });

  it('helper note kept (hidden while an error shows); required star kept once', () => {
    expect(hostOf(`${P}help`).querySelector('.td-field__note').textContent).to.equal('Ngày theo giờ Việt Nam');
    expect(hostOf(`${P}err`).querySelector('.td-field__note').hidden).to.equal(true);
    expect(hostOf(`${P}empty`).querySelectorAll('.td-field__required').length).to.equal(1);
  });

  it('XSS: the label is text; dropped attrs never reach the host', () => {
    const h = hostOf(`${P}attrs`);
    expect(h.querySelector('label img')).to.equal(null);
    expect(h.hasAttribute('onclick') || h.hasAttribute('data-td-x')).to.equal(false);
    expect(window.__dtpPwn).to.equal(undefined);
  });

  it('form reset → the server value (not the live value typed before define)', () => {
    formOf(`${P}date`).reset();
    expect(hostOf(`${P}date`).getAttribute('value')).to.equal('15/06/2026');
    expect(entries(formOf(`${P}date`))).to.deep.equal(['ngay=2026-06-15']);
  });
});

describe('datetime-picker — refused markup (the REFUSAL path: safe render)', () => {
  it('every mismatch — unknown schema and CROSS-schema domains included — fails canHydrate()', () => {
    for (const id of Object.keys(MM)) expect(verdicts.get(`l${id}`), id).to.equal(false);
  });
  it('B6: @2 markup with the @1 implicit domain, and @1 markup with the @2 domain, are not adopted (the schema reaches the native template)', () => {
    for (const id of ['x-v2-with-v1-domain', 'x-v1-with-v2-domain', 'x-v2-datetime-with-v1-domain']) {
      const h = hostOf(id, mismatch);
      expect(h.querySelectorAll('input').length, id).to.equal(0);
      expect(h.querySelector('.td-dtp__trigger') === mismatchBefore[id], `${id}: the trigger was replaced (fresh render)`).to.equal(false);
    }
  });
  for (const id of Object.keys(MM)) {
    it(`${id}: rendered fresh, no stray form entry, no foreign attribute`, () => {
      const h = hostOf(id, mismatch);
      expect(h.querySelectorAll('input, textarea, select').length).to.equal(0);
      expect(h.querySelectorAll('button').length).to.equal(1);
      expect(h.querySelector('[onclick], [formaction], img')).to.equal(null);
      const keys = [...new FormData(formOf(id, mismatch)).keys()];
      expect(keys.length <= 1 && keys.every((k) => k === 'ngay' || k === 'hen'), keys.join(',')).to.equal(true);
    });
  }

  it('the live value of the one native candidate is kept', () => {
    expect(hostOf('mm-formaction', mismatch).getAttribute('value')).to.equal('03/06/2026');
    expect(hostOf('mm-unknown-attr', mismatch).getAttribute('value')).to.equal('03/06/2026');
    // two inputs: nothing taken from either — the host attribute stays
    expect(hostOf('mm-extra-input', mismatch).getAttribute('value')).to.equal('15/06/2026');
  });

  it('no injected script ran anywhere', () => {
    expect(window.__dtpPwn).to.equal(undefined);
  });
});
