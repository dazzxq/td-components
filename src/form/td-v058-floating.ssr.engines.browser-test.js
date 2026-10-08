import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: it is defined LATE (dynamic import below), after the pre-upgrade checks.

// v0.58.0 (plan docs/internal/plans/v0.58.0-floating-label.md QĐ 11, 13, 14 + M0 F1, M1 / M3) — td_field with
// label_mode=floating is adopted IN PLACE (same control node, `_hydrated`) in Chromium, Firefox AND WebKit; the floated /
// resting state is pure CSS, identical before and after the upgrade (ADR 0025: field + label ≤ 1 px, same transform). The
// markup is EXACTLY what php/td.php prints for test/ssr/floating.fixtures.json: test/ssr/fixtures/floating.html
// (`node test/ssr/build-floating-fixture.mjs`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const SPEC = await (await fetch('/test/ssr/floating.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/floating.html')).text();
const root = document.createElement('div');
root.style.width = '420px';
root.style.setProperty('--td-dur-fast', '0s');
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const caseEl = (id) => document.querySelector(`.ssr-case[data-case="${id}"]`);
const tokens = (el) => (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const labelOf = (c) => caseEl(c.id).querySelector('.td-field > .td-field__label');
const fieldOf = (c) => caseEl(c.id).querySelector('.td-field > .td-field__box') || document.getElementById(c.control);
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
const close = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= 1);
const transform = (el) => getComputedStyle(el).transform;

// ------------------------------------------------------------------ BEFORE define --------------------------------------
expect(customElements.get('td-input-field')).to.equal(undefined);
const B = {};
for (const c of SPEC.cases) {
  const control = document.getElementById(c.control);
  B[c.id] = { control, field: rect(fieldOf(c)), label: rect(labelOf(c)), transform: transform(labelOf(c)),
    ph: control.getAttribute('placeholder') };
}

// ------------------------------------------------------------------ upgrade --------------------------------------------
await import('./td-input-field.js');
await new Promise((r) => setTimeout(r, 50));

describe('v0.58.0 SSR — floating label adopted in place, same geometry before / after', () => {
  for (const c of SPEC.cases) {
    it(`${c.id} (${c.tag || 'native'})`, () => {
      const control = document.getElementById(c.control);
      expect(!!control, 'control').to.equal(true);
      expect(B[c.id].ph).to.equal(c.ph);
      expect(B[c.id].transform !== 'none', `${c.id}: floated before the upgrade`).to.equal(c.floated);
      if (c.tag) {
        const el = document.getElementById(c.host);
        expect(!!el && el.matches(':defined'), 'upgraded').to.equal(true);
        expect(el._hydrated === true, `${c.id}: adopted in place (no safe render)`).to.equal(true);
        expect(control === B[c.id].control, 'same control node').to.equal(true);
        expect(tokens(control)).to.deep.equal(c.desc);
        expect(control.getAttribute('placeholder')).to.equal(c.ph);
        expect(el.querySelector('.td-field').classList.contains('td-field--floating')).to.equal(true);
      } else {
        expect(tokens(control), 'native: as printed').to.deep.equal(c.desc);
      }
      const l = labelOf(c);
      expect(l.localName === 'label' && l.getAttribute('for') === control.id, 'real <label for>').to.equal(true);
      expect(transform(l), `${c.id}: same label state`).to.equal(B[c.id].transform);
      expect(close(rect(fieldOf(c)), B[c.id].field), `${c.id}: field ${JSON.stringify(rect(fieldOf(c)))} vs ${JSON.stringify(B[c.id].field)}`).to.equal(true);
      expect(close(rect(l), B[c.id].label), `${c.id}: label ${JSON.stringify(rect(l))} vs ${JSON.stringify(B[c.id].label)}`).to.equal(true);
    });
  }

  it('a host switched to top before the upgrade does not adopt floating markup (safe render, value kept)', async () => {
    // fl-value markup, host attribute changed: render() differs → safe render + restore (ADR 0012 §5)
    const html = (await (await fetch('/test/ssr/fixtures/floating.html')).text()).split('\n').find((x) => x.includes('data-case="fl-value"'));
    const wrap = document.createElement('div');
    wrap.innerHTML = html.replace('label-mode="floating"', 'label-mode="top"').replaceAll('fl-v', 'fl-q');
    document.body.appendChild(wrap);
    await new Promise((r) => setTimeout(r, 20));
    const el = wrap.querySelector('td-input-field');
    expect(el.matches(':defined')).to.equal(true);
    expect(el._hydrated === true).to.equal(false);
    expect(el.querySelector('.td-field').classList.contains('td-field--floating')).to.equal(false);
    expect(el.querySelector('.td-field__control').value).to.equal('Nguyễn An');
    wrap.remove();
  });
});
