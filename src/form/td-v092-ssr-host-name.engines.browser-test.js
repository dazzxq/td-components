import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the components: they are defined LATE (dynamic imports below), after the pre-upgrade checks.

// v0.92.0 (plan docs/internal/plans/v0.92.0-tabs-fit-layout.md, phần 2) — php/td.php prints `name` on the <td-*> host,
// not only on the native control inside, so a DETACHED / cloned form (template content before a modal attaches it)
// finds `td-dropdown[name="x"]` before the upgrade (the JS copies the same value at upgrade, only when connected).
// The markup is EXACTLY what php/td.php prints: test/ssr/fixtures/{dropdown,tree-select,multiselect}.html (generated, kept
// fresh by the php tests). Per case: (1) detached clone → the host is found by [name]; (2) attached + upgraded → still
// found, FormData has the same entries as the native select had, exactly once each (no duplicate from host + select).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const FIXTURES = {
  dropdown: await (await fetch('/test/ssr/fixtures/dropdown.html')).text(),
  'tree-select': await (await fetch('/test/ssr/fixtures/tree-select.html')).text(),
  multiselect: await (await fetch('/test/ssr/fixtures/multiselect.html')).text(),
};
const CASES = [
  { fixture: 'dropdown', id: 'd-basic', tag: 'td-dropdown', name: 'city' },
  { fixture: 'tree-select', id: 's-basic', tag: 'td-tree-select', name: 'parent' },
  { fixture: 'multiselect', id: 'm-basic', tag: 'td-chip-input', name: 'roles[]' },
];

/** The case form's children cloned into a DETACHED <form> (what a template-driven modal does before it attaches). */
function detachedForm(c) {
  const tpl = document.createElement('template');
  tpl.innerHTML = FIXTURES[c.fixture];
  const src = tpl.content.querySelector(`form[data-case="${c.id}"]`);
  const form = document.createElement('form');
  for (const child of src.children) form.append(child.cloneNode(true));
  return form;
}
const selectedValues = (form) => [...form.querySelectorAll('select option')].filter((o) => o.selected && !o.disabled).map((o) => o.value);
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 80));
};

describe('v0.92.0 — php helper host name on a detached form, then upgrade', () => {
  for (const c of CASES) {
    it(`${c.tag}: found by [name] on a detached clone before the upgrade, exactly one FormData entry set after`, async () => {
      const form = detachedForm(c);
      expect(form.isConnected).to.equal(false);
      expect(form.querySelector(`${c.tag}[name="${c.name}"]`) !== null).to.equal(true);
      const expected = selectedValues(form);
      expect(expected.length).to.be.greaterThan(0);

      document.body.appendChild(form);
      await import(`./${c.tag}.js`);
      await customElements.whenDefined(c.tag);
      await settle();

      const host = form.querySelector(`${c.tag}[name="${c.name}"]`);
      expect(host !== null).to.equal(true);
      expect(host.getAttribute('name')).to.equal(c.name);
      expect(form.querySelectorAll(`${c.tag}[name="${c.name}"]`).length).to.equal(1);
      expect(new FormData(form).getAll(c.name).sort()).to.deep.equal([...expected].sort());
      form.remove();
    });
  }
});
