import { expect } from '@esm-bundle/chai';
import './td-button.js';
import './td-checkbox.js';
import './td-toggle.js';
import './td-input-field.js';
import './td-slider.js';
import '../display/td-pagination.js';
import '../display/td-tabs.js';
import '../display/td-empty-state.js';
import { TdLoading, TdLoadingSpinner } from '../feedback/td-loading.js';

// Golden markup contracts (test/contracts/*.html): the element tree (tags, classes, contract attributes)
// a component renders must equal the fixture SSR adapters emit. Text/ids/geometry are not compared.
const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'tabindex', 'aria-live',
  'aria-selected', 'aria-current', 'aria-disabled', 'aria-controls', 'aria-labelledby', 'aria-describedby',
  'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-label', 'data-state', 'for', 'id',
  'data-page', 'data-nav', 'data-td-icon-size'];
function shape(el) {
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
  const cls = [...el.classList].sort().join('.');
  const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
  return { tag: el.localName, cls, attrs, kids };
}
async function templates(file) {
  const html = await (await fetch(`/test/contracts/${file}`)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('template')];
}
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; TdLoading.hide(); });

// Contract templates: data-markup (host HTML) + optional data-setup (JS run with `el` = the host, e.g. setting
// `.tabs`) + optional data-await (ms to wait, e.g. for rAF-driven state).
for (const file of ['button.html', 'checkbox.html', 'switch.html', 'input-field.html', 'slider.html',
  'pagination.html', 'tabs.html', 'empty-state.html']) {
  it(`contract ${file}`, async () => {
    for (const t of await templates(file)) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      const setup = t.getAttribute('data-setup');
      if (setup) new Function('el', setup)(el);
      const pause = Number(t.getAttribute('data-await') || 0);
      if (pause) await new Promise((r) => setTimeout(r, pause));
      const rendered = el.firstElementChild;
      const expected = t.content.firstElementChild;
      expect(shape(rendered)).to.deep.equal(shape(expected));
    }
  });
}

it('contract loading.html (overlay + inline spinner)', async () => {
  const [overlayT, spinnerT] = await templates('loading.html');
  TdLoading.show();
  const got = shape(TdLoading.element);
  got.attrs = got.attrs.filter((a) => !a.startsWith('hidden'));
  expect(got).to.deep.equal(shape(overlayT.content.firstElementChild));
  expect(shape(TdLoadingSpinner.create())).to.deep.equal(shape(spinnerT.content.firstElementChild));
});
