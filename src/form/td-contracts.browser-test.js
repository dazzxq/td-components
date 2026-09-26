import { expect } from '@esm-bundle/chai';
import './td-button.js';
import './td-checkbox.js';
import './td-toggle.js';
import { TdLoading, TdLoadingSpinner } from '../feedback/td-loading.js';

// Golden markup contracts (test/contracts/*.html): the element tree (tags, classes, contract attributes)
// a component renders must equal the fixture SSR adapters emit. Text/ids/geometry are not compared.
const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'tabindex', 'aria-live'];
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

for (const file of ['button.html', 'checkbox.html', 'switch.html']) {
  it(`contract ${file}`, async () => {
    for (const t of await templates(file)) {
      host.innerHTML = t.getAttribute('data-markup');
      const rendered = host.firstElementChild.firstElementChild;
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
