import { expect } from '@esm-bundle/chai';
import './td-button.js';
import './td-input-field.js';
import './td-checkbox.js';
import './td-toggle.js';
// NOT './td-dropdown.js' here: part (a) proves the PHP markup works with no JS; (b) imports it dynamically.

// v0.17.0 E5 — PHP SSR adapter (php/td.php). The HTML comes from test/php/fixtures/ssr.html, rendered by
// test/php/fixture.php (kept up to date by test/php/td-php.test.js; regenerate: `node test/php/build-fixture.mjs`).
//   (a) no JS: native FormData of the SSR form (text, password + autocomplete, month, datetime-local, checkbox,
//       toggle, <select> inside <td-dropdown>, named submit button as submitter);
//   (b) after the dropdown module loads: the upgraded <td-dropdown> submits the same FormData (needs E2);
//   (c) style parity: SSR button / field / checkbox / toggle vs the markup the components render.
// Cases marked PENDING-MERGE depend on features built in parallel (E2 select adoption, E3 ghost + href link): they
// skip with a console warning while the feature is absent and run once the groups are merged.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const fixture = await (await fetch('/test/php/fixtures/ssr.html')).text();
const root = document.createElement('div');
root.innerHTML = fixture;
document.body.appendChild(root);
const form = root.querySelector('#ssr-form');

/** Skip (with a visible warning) a case whose feature is being merged from another group. */
function pendingMerge(ctx, available, what) {
  if (available) return;
  console.warn(`[PENDING-MERGE] ${what} — skipped until the feature lands`);
  ctx.skip();
}

/** FormData of a real requestSubmit(submitter) (the native submit path, submitter included). */
function submitData(submitter) {
  let entries = null;
  const onSubmit = (e) => {
    e.preventDefault();
    entries = [...new FormData(form, e.submitter)];
  };
  form.addEventListener('submit', onSubmit);
  try {
    form.requestSubmit(submitter);
  } finally {
    form.removeEventListener('submit', onSubmit);
  }
  return entries;
}

const EXPECTED = [
  ['full_name', 'Nguyễn An'],
  ['password', 'bí-mật-1'],
  ['month', '2026-09'],
  ['taken_at', '2026-09-28T10:30'],
  ['agree', 'yes'],
  ['wifi', 'on'],
  ['city', 'sg'],
  ['action', 'save'],
];

describe('v0.17.0 E5 — PHP SSR markup', () => {
  describe('(a) without JS', () => {
    it('nothing is upgraded: native controls + a plain <select> inside the undefined <td-dropdown>', () => {
      expect(customElements.get('td-dropdown')).to.equal(undefined);
      const dd = form.querySelector('td-dropdown');
      expect(dd.querySelector(':scope > select[name="city"]')).to.not.equal(null);
      expect(form.querySelector('input.td-field__control[type="month"]')).to.not.equal(null);
      expect(form.querySelector('input.td-field__control[type="datetime-local"]')).to.not.equal(null);
      expect(form.querySelector('label.td-switch input[role="switch"].td-switch__input')).to.not.equal(null);
      expect(form.querySelector('label.td-checkbox input.td-checkbox__input')).to.not.equal(null);
    });

    it('password manager contract: autocomplete on the native password input', () => {
      const pw = form.querySelector('input[type="password"]');
      expect(pw.getAttribute('autocomplete')).to.equal('current-password');
      expect(pw.name).to.equal('password');
      expect(pw.labels[0].textContent).to.contain('Mật khẩu');
    });

    it('FormData: every field + the named submit button as submitter', () => {
      expect(form.checkValidity()).to.equal(true);
      expect(submitData(form.querySelector('#btn-save'))).to.deep.equal(EXPECTED);
      const del = submitData(form.querySelector('#btn-delete'));
      expect(del.at(-1)).to.deep.equal(['action', 'delete']);
    });

    it('native constraint validation (required text + required select)', () => {
      const name = form.querySelector('[name="full_name"]');
      name.value = '';
      expect(form.checkValidity()).to.equal(false);
      expect(name.validity.valueMissing).to.equal(true);
      name.value = 'Nguyễn An';
      expect(form.checkValidity()).to.equal(true);
    });

    it('labels are associated (label[for] → control)', () => {
      for (const id of ['f-name-control', 'f-pw-control', 'f-month-control', 'f-dt-control', 'dd-city-select']) {
        const el = document.getElementById(id);
        expect(el.labels.length, id).to.be.greaterThan(0);
      }
    });
  });

  describe('(b) after loading the dropdown module', () => {
    it('PENDING-MERGE(E2): upgraded <td-dropdown> submits the same FormData as (a)', async function () {
      await import('./td-dropdown.js');
      const dd = form.querySelector('td-dropdown');
      await new Promise((r) => requestAnimationFrame(r));
      // Without E2 the host renders empty (no options read from the select); with E2 it adopts the 3 options.
      pendingMerge(this, Array.isArray(dd.options) && dd.options.length === 3, 'E2 <select> adoption in td-dropdown');
      expect(form.querySelector('select')).to.equal(null, 'no duplicate submission');
      expect(dd.value).to.equal('sg');
      expect(submitData(form.querySelector('#btn-save'))).to.deep.equal(EXPECTED);
    });
  });

  describe('(c) style parity with the components', () => {
    const COMPONENT = {
      'btn-primary': '<td-button variant="primary" icon="download">Lưu</td-button>',
      'btn-secondary-sm': '<td-button variant="secondary" size="sm">Huỷ</td-button>',
      'btn-danger-lg': '<td-button variant="danger" size="lg" icon="close" icon-position="right">Xoá</td-button>',
      'btn-disabled': '<td-button variant="primary" disabled>Khoá</td-button>',
      'btn-ghost': '<td-button variant="ghost">Bỏ qua</td-button>',
      'btn-link': '<td-button variant="primary" href="/docs" target="_blank">Mở</td-button>',
      'field-text': '<td-input-field id="cf-text" name="full_name" label="Họ tên" helper-text="Tên đầy đủ" value="An"></td-input-field>',
      'field-lg': '<td-input-field id="cf-lg" name="email" size="lg" label="Email" value="a@b.vn"></td-input-field>',
      'field-area': '<td-input-field id="cf-area" name="bio" type="textarea" rows="3" label="Mô tả" value="Xin chào"></td-input-field>',
      'check-on': '<td-checkbox name="c1" label="Đồng ý" checked></td-checkbox>',
      'check-sm': '<td-checkbox name="c2" label="Nhỏ" size="sm"></td-checkbox>',
      'toggle-on': '<td-toggle name="t1" label="Wifi" checked></td-toggle>',
      'toggle-lg': '<td-toggle name="t2" label="Lớn" size="lg"></td-toggle>',
    };
    const PARTS = {
      btn: ['.td-btn', '.td-btn__label', '.td-btn__icon', '.td-btn__icon svg', '.td-btn__spinner'],
      field: ['.td-field', '.td-field__label', '.td-field__control', '.td-field__footer', '.td-field__note'],
      check: ['.td-checkbox', '.td-checkbox__input', '.td-checkbox__mark', '.td-checkbox__svg', '.td-checkbox__label'],
      toggle: ['.td-switch', '.td-switch__input', '.td-switch__track', '.td-switch__thumb', '.td-switch__icon--on', '.td-switch__label'],
    };
    const PROPS = ['display', 'color', 'background-color', 'background-image', 'border-top-width', 'border-top-style',
      'border-top-color', 'border-bottom-color', 'border-left-width', 'border-top-left-radius', 'border-bottom-right-radius',
      'width', 'height', 'padding-top', 'padding-left', 'padding-right', 'margin-top', 'font-family', 'font-size',
      'font-weight', 'line-height', 'text-decoration-line', 'box-shadow', 'backdrop-filter', 'opacity', 'transform',
      'cursor'];
    // Structural shape (tags + classes + a few contract attributes; ids, names, icon slots ignored).
    const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-icon'];
    const shape = (el) => ({
      tag: el.localName,
      cls: [...el.classList].sort().join('.'),
      attrs: KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`),
      kids: el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape),
    });

    const stage = document.createElement('div');
    document.body.appendChild(stage);
    const box = () => {
      const d = document.createElement('div');
      d.style.width = '320px'; // CSSOM (test page)
      stage.appendChild(d);
      return d;
    };
    after(() => stage.remove());

    function styles(el) {
      const cs = getComputedStyle(el);
      return Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)]));
    }

    async function compare(key, kind) {
      const ssrBox = box();
      ssrBox.appendChild(root.querySelector(`[data-p="${key}"]`).firstElementChild.cloneNode(true));
      const cBox = box();
      cBox.innerHTML = COMPONENT[key];
      const host = cBox.firstElementChild;
      await customElements.whenDefined(host.localName);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const a of document.getAnimations()) a.finish(); // a checked component flips input.checked after render
      const ssr = ssrBox.firstElementChild;
      const comp = host.firstElementChild;
      expect(shape(ssr), `${key}: DOM shape`).to.deep.equal(shape(comp));
      for (const sel of PARTS[kind]) {
        const a = ssr.matches(sel) ? ssr : ssr.querySelector(sel);
        const b = comp.matches(sel) ? comp : comp.querySelector(sel);
        expect(!!a, `${key} ${sel} in SSR`).to.equal(!!b);
        if (a) expect(styles(a), `${key} ${sel}`).to.deep.equal(styles(b));
      }
      return { ssr, comp };
    }

    it('parity is not vacuous: td.css styles the SSR primary button', async () => {
      const { ssr } = await compare('btn-primary', 'btn');
      const cs = getComputedStyle(ssr);
      expect(cs.display).to.equal('inline-flex');
      expect(parseFloat(cs.borderTopLeftRadius)).to.be.greaterThan(0);
      expect(parseFloat(cs.height)).to.be.greaterThan(20);
    });

    for (const key of ['btn-secondary-sm', 'btn-danger-lg', 'btn-disabled']) {
      it(`button ${key}`, async () => { await compare(key, 'btn'); });
    }

    it('PENDING-MERGE(E3): ghost button', async function () {
      const probe = document.createElement('td-button');
      probe.setAttribute('variant', 'ghost');
      stage.appendChild(probe);
      const ok = !!probe.querySelector('.td-btn--ghost');
      probe.remove();
      pendingMerge(this, ok, 'E3 td-button variant="ghost"');
      const { ssr } = await compare('btn-ghost', 'btn');
      expect(getComputedStyle(ssr).backdropFilter).to.equal('none');
    });

    it('PENDING-MERGE(E3): href link button (<a class="td-btn">)', async function () {
      const probe = document.createElement('td-button');
      probe.setAttribute('href', '/x');
      stage.appendChild(probe);
      const ok = !!probe.querySelector('a.td-btn');
      probe.remove();
      pendingMerge(this, ok, 'E3 td-button href → <a>');
      const { ssr, comp } = await compare('btn-link', 'btn');
      expect(ssr.getAttribute('href')).to.equal(comp.getAttribute('href'));
      expect(ssr.getAttribute('rel')).to.equal(comp.getAttribute('rel'));
    });

    for (const key of ['field-text', 'field-lg', 'field-area']) {
      it(`field ${key}`, async () => { await compare(key, 'field'); });
    }
    for (const key of ['check-on', 'check-sm']) {
      it(`checkbox ${key}`, async () => { await compare(key, 'check'); });
    }
    for (const key of ['toggle-on', 'toggle-lg']) {
      it(`toggle ${key}`, async () => { await compare(key, 'toggle'); });
    }
  });
});
