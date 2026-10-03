// v0.28.0 (plan v0.28.0-multiselect M5) — PHP side of td_multiselect():
//   - NATIVE by default: `div.td-multiselect` + [label] + `select.td-multiselect__native` multiple (works without JS:
//     every selected value is submitted under the caller name, verbatim — `roles[]`);
//   - ELEMENT mode opt-in per call `element` + global Td::configure(..., ['ssr_elements' => true]):
//     `<td-chip-input data-td-ssr="chip-input@1" selection-only …>` + the same select (class td-chip-input__native),
//     upgraded by <td-chip-input> (M3);
//   - option shapes like td_dropdown (value => label map, or a list of ['value', 'label', 'disabled', 'description']) +
//     groups (['label' => …, 'disabled' => bool, 'options' => […]]) → <optgroup>; escaping; owned names reserved in attrs.
// Shared fixtures: test/ssr/multiselect.fixtures.json (also consumed by the engines browser test through
// test/ssr/fixtures/multiselect.html — this test fails when it is stale: `node test/ssr/build-multiselect-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP, runPhp } from './php.mjs';
import { MULTISELECT_FIXTURES, MULTISELECT_FIXTURE_FILE, renderMultiselectFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.28.0';

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}
const ROLES = { admin: 'Quản trị', editor: 'Biên tập', viewer: 'Xem' };
const ROLE_OPTS = (sel) => Object.entries(ROLES).map(([v, l]) => `<option value="${v}"${sel.includes(v) ? ' selected' : ''}>${l}</option>`).join('');

describe('php/td.php — td_multiselect (v0.28.0)', opts, () => {
  test('native (default): <select multiple> + label, selected values, size 4, name verbatim', () => {
    assert.equal(one('td_multiselect', ['roles[]', ROLES, ['admin', 'viewer'], { label: 'Vai trò', id: 'roles' }]),
      '<div class="td-multiselect" id="roles"><label class="td-field__label" for="roles-select">Vai trò</label>'
      + `<select class="td-multiselect__native" id="roles-select" name="roles[]" multiple size="4">${ROLE_OPTS(['admin', 'viewer'])}</select></div>`);
    // no id → generated from the name (reduced to [A-Za-z0-9_-]); no label → no <label>; size / required / disabled / aria_label
    assert.equal(one('td_multiselect', ['roles[]', ROLES, [], { size: 6, required: true, disabled: true, aria_label: 'Vai trò', class: 'x y' }]),
      '<div class="td-multiselect x y" id="td-roles-1">'
      + `<select class="td-multiselect__native" id="td-roles-1-select" name="roles[]" multiple size="6" required disabled aria-label="Vai trò">${ROLE_OPTS([])}</select></div>`);
    // required → the label star
    assert.ok(one('td_multiselect', ['r[]', ROLES, [], { label: 'L', id: 'r', required: true }])
      .includes('<label class="td-field__label" for="r-select">L<span class="td-field__required" aria-hidden="true"> *</span></label>'));
  });

  test('option shapes: map, list (value / label / disabled / description), groups → <optgroup> (disabled kept)', () => {
    const out = one('td_multiselect', ['c[]', [
      { label: 'Miền Bắc', options: { hn: 'Hà Nội', hp: 'Hải Phòng' } },
      { label: 'Miền Nam', disabled: true, options: [{ value: 'hcm', label: 'TP HCM' }] },
      { value: 'dn', label: 'Đà Nẵng', disabled: true },
      { value: 'hue', label: 'Huế', description: 'Cố đô' },
      { value: 7 },
      { label: 'không có value' },
      { label: 'Nhóm lồng', options: [{ label: 'nested', options: { z: 'Z' } }, { value: 'ok', label: 'OK' }] },
    ], ['hp', 7, 'ok'], { id: 'c' }]);
    assert.equal(out, '<div class="td-multiselect" id="c"><select class="td-multiselect__native" id="c-select" name="c[]" multiple size="4">'
      + '<optgroup label="Miền Bắc"><option value="hn">Hà Nội</option><option value="hp" selected>Hải Phòng</option></optgroup>'
      + '<optgroup label="Miền Nam" disabled><option value="hcm">TP HCM</option></optgroup>'
      + '<option value="dn" disabled>Đà Nẵng</option>'
      + '<option value="hue" data-description="Cố đô">Huế</option>'
      + '<option value="7" selected>7</option>'
      + '<optgroup label="Nhóm lồng"><option value="ok" selected>OK</option></optgroup>'
      + '</select></div>');
    // a map whose keys are ints: values compared as strings
    assert.ok(one('td_multiselect', ['n[]', { 1: 'Một', 2: 'Hai' }, [2], { id: 'n' }]).includes('<option value="2" selected>Hai</option>'));
  });

  test('element mode: <td-chip-input data-td-ssr="chip-input@1" selection-only> + label + select.td-chip-input__native', () => {
    assert.equal(one('td_multiselect', ['roles[]', ROLES, ['editor'], { element: true, label: 'Vai trò', id: 'roles' }]),
      '<td-chip-input data-td-ssr="chip-input@1" id="roles" label="Vai trò" selection-only>'
      + '<label class="td-field__label" for="roles-select">Vai trò</label>'
      + `<select class="td-chip-input__native" id="roles-select" name="roles[]" multiple size="4">${ROLE_OPTS(['editor'])}</select></td-chip-input>`);
    assert.equal(one('td_multiselect', ['t[]', { a: 'A' }, [], { element: true, id: 't', class: 'k', placeholder: 'Tìm…', select_all: true,
      max_items: 3, close_on_select: true, required: true, disabled: true, aria_label: 'Thẻ', size: 2 }]),
    '<td-chip-input data-td-ssr="chip-input@1" id="t" class="k" placeholder="Tìm…" selection-only select-all max-items="3" close-on-select>'
      + '<select class="td-chip-input__native" id="t-select" name="t[]" multiple size="2" required disabled aria-label="Thẻ">'
      + '<option value="a">A</option></select></td-chip-input>');
    // generated host id
    assert.ok(one('td_multiselect', ['roles[]', ROLES, [], { element: true }])
      .startsWith('<td-chip-input data-td-ssr="chip-input@1" id="td-roles-1" selection-only><select class="td-chip-input__native" id="td-roles-1-select"'));
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mode of MULTISELECT_FIXTURES.modes) {
      const args = mode.call === 'absent' ? ['c[]', { a: 'A' }, [], {}] : ['c[]', { a: 'A' }, [], { element: mode.call }];
      const out = one('td_multiselect', args, mode.global ? { ssr_elements: true } : undefined);
      assert.equal(out.startsWith('<td-chip-input data-td-ssr="chip-input@1"'), mode.element, `${JSON.stringify(mode)}: ${out.slice(0, 60)}`);
      if (!mode.element) assert.ok(out.startsWith('<div class="td-multiselect"'), out);
    }
  });

  test('reservation: owned names in attrs never print (case-insensitive), data-td-* blocked, unsafe names dropped', () => {
    const c = MULTISELECT_FIXTURES.cases.find((x) => x.id === 'm-attrs');
    const out = one('td_multiselect', [...c.args.slice(0, 3), { ...c.args[3], element: true }]);
    const host = /<td-chip-input[^>]*>/.exec(out)[0];
    assert.equal(host, '<td-chip-input data-td-ssr="chip-input@1" id="m-attrs" class="a b" selection-only data-x="1" title="Gợi ý">');
    for (const bad of c.dropped) assert.ok(!out.includes(bad), bad);
    assert.equal((out.match(/\sname=/g) || []).length, 1);
    assert.ok(!/\svalue="\[/.test(out), out);
    // native mode: attrs on the wrapper, id / class owned
    const nat = one('td_multiselect', ['p[]', { a: 'A' }, [], { id: 'p', attrs: { id: 'evil', 'data-y': '2', onclick: 'x()' } }]);
    assert.ok(nat.startsWith('<div class="td-multiselect" id="p" data-y="2"><select'), nat);
    assert.ok(!nat.includes('evil') && !nat.includes('onclick'), nat);
  });

  test('escaping: name, ids, labels, values, group labels, descriptions', () => {
    const c = MULTISELECT_FIXTURES.cases.find((x) => x.id === 'm-xss');
    const out = one('td_multiselect', [...c.args.slice(0, 3), { ...c.args[3], element: true }]);
    assert.ok(out.includes(`name="${esc('x"y[]')}"`), out);
    assert.ok(out.includes(`label="${esc('<i>nhãn</i>')}"`), out);
    assert.ok(out.includes(`>${esc('<i>nhãn</i>')}</label>`), out);
    assert.ok(out.includes(`<option value="${esc('<b>v</b>')}">${esc('<img src=x onerror=alert(1)>')}</option>`), out);
    assert.ok(out.includes(`<optgroup label="${esc('<script>g</script>')}"><option value="${esc('q"')}" selected>${esc('"q"')}</option></optgroup>`), out);
    assert.ok(!/<img|<script|<b>|<i>/i.test(out), out);
    const d = one('td_multiselect', ['d[]', [{ value: 'a', label: 'A', description: '"><x>' }], [], { id: 'd' }]);
    assert.ok(d.includes(`data-description="${esc('"><x>')}"`), d);
  });

  test('test/ssr/fixtures/multiselect.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(MULTISELECT_FIXTURE_FILE, 'utf8'), renderMultiselectFixture(), 'stale fixture: run `node test/ssr/build-multiselect-fixture.mjs`');
  });
});
