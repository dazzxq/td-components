import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the components: they are defined LATE (dynamic imports below), after the pre-upgrade checks.

// v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 7, 8, 11, 13, M1 / M4) — td_field with prefix / suffix /
// icons / unit_label and td_number_input with icons / locale are adopted IN PLACE (same control node, `_hydrated`) in
// Chromium, Firefox AND WebKit: the box does not move on upgrade (≤ 1 px), the icon slots are re-drawn with the same box,
// the description keeps the unit first, numbers are shown with the separators PHP resolved from `locale`. The markup is
// EXACTLY what php/td.php prints for test/ssr/affix.fixtures.json: test/ssr/fixtures/affix.html
// (`node test/ssr/build-affix-fixture.mjs`).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const SPEC = await (await fetch('/test/ssr/affix.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/affix.html')).text();
const root = document.createElement('div');
root.style.width = '480px';
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const caseEl = (id) => document.querySelector(`.ssr-case[data-case="${id}"]`);
const tokens = (el) => (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const boxOf = (c) => caseEl(c.id).querySelector(c.fn === 'td_field' ? '.td-field__box' : '.td-number__box');
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
const close = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= 1);

// ------------------------------------------------------------------ BEFORE define --------------------------------------
expect(customElements.get('td-input-field')).to.equal(undefined);
expect(customElements.get('td-number-input')).to.equal(undefined);
const B = {};
for (const c of SPEC.cases) {
  const control = document.getElementById(c.control);
  const box = boxOf(c);
  B[c.id] = { control, box: box && rect(box), controlRect: control && rect(control), desc: tokens(control),
    icons: [...(box?.querySelectorAll('[data-td-icon] > svg') || [])].map(rect) };
}

// ------------------------------------------------------------------ upgrade --------------------------------------------
await Promise.all([import('./td-input-field.js'), import('./td-number-input.js')]);
await new Promise((r) => setTimeout(r, 50));

describe('v0.55.0 SSR — affix / icons / locale adopted in place', () => {
  for (const c of SPEC.cases) {
    it(`${c.id} (${c.tag || 'native'})`, () => {
      const control = document.getElementById(c.control);
      expect(!!control, 'control').to.equal(true);
      expect(!!B[c.id].box, 'the box printed by PHP').to.equal(true);
      if (c.tag) {
        const el = document.getElementById(c.host);
        expect(!!el && el.matches(':defined'), 'upgraded').to.equal(true);
        expect(el._hydrated === true, `${c.id}: adopted in place (no safe render)`).to.equal(true);
        expect(control === B[c.id].control, 'same control node').to.equal(true);
        expect(tokens(control)).to.deep.equal(c.desc);
        if (c.display != null) expect(control.value).to.equal(c.display);
      } else {
        expect(tokens(control), 'native: as printed').to.deep.equal(c.desc);
      }
      const unit = c.unit != null ? document.getElementById(`${c.host}-unit`) : null;
      if (c.unit != null) expect(!!unit && unit.hidden && unit.textContent === c.unit, 'unit').to.equal(true);
      // ADR 0025: the box and the control do not move on upgrade (same run)
      expect(close(rect(boxOf(c)), B[c.id].box), `${c.id}: box ${JSON.stringify(rect(boxOf(c)))} vs ${JSON.stringify(B[c.id].box)}`).to.equal(true);
      expect(close(rect(control), B[c.id].controlRect), `${c.id}: control`).to.equal(true);
      const icons = [...boxOf(c).querySelectorAll('[data-td-icon] > svg')].map(rect);
      expect(icons.length).to.equal(B[c.id].icons.length);
      icons.forEach((r, i) => expect(close(r, B[c.id].icons[i]), `${c.id}: icon ${i}`).to.equal(true));
    });
  }

  it('the upgraded number keeps submitting the canonical value (locale only changes the display)', () => {
    const form = caseEl('n-locale');
    expect(new FormData(form).get('amount')).to.equal('1234567.5');
    expect(new FormData(caseEl('n-locale-fr')).get('prix')).to.equal('1234567.25');
  });
});
