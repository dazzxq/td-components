// v0.100.0 (ADR 0012, plan v0.100.0-batch C) — PHP side of the SSR contract `dropzone@1`:
//   - td_dropzone(): NATIVE by default (div.td-field > label + input[type=file] + helper text — works and posts without JS),
//     ELEMENT mode opt-in per call `element` + Td::configure ssr_elements (<td-dropzone data-td-ssr="dropzone@1"> + exactly
//     the markup <td-dropzone> renders for an empty dropzone, the file input carrying the no-JS-only attributes);
//   - the hint text computed on the server (td__file_size / td__format_file_size / td__dropzone_hint_parts) is the same
//     as the component's (parseFileSize / formatFileSize of the JS utils);
//   - escaping.
// Shared fixtures: test/ssr/dropzone.fixtures.json (also consumed by src/form/td-dropzone.ssr.engines.browser-test.js
// through test/ssr/fixtures/dropzone.html — this test fails when it is stale: `node test/ssr/build-dropzone-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAS_PHP, runPhp } from './php.mjs';
import { DROPZONE_FIXTURES, DROPZONE_FIXTURE_FILE, renderDropzoneFixture } from '../ssr/ssr.mjs';
import { parseFileSize } from '../../src/utils/upload-queue.js';
import { formatFileSize } from '../../src/utils/dom-utils.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.100.0';

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}
const many = (fn, argLists) => runPhp(argLists.map((args) => ({ fn, args })), { baseUrl: BASE }).map((r) => {
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
});

const ZONE = (hint) => '<div class="td-dropzone__zone"><span class="td-dropzone__icon" data-td-icon="upload" aria-hidden="true"></span>'
  + `<p class="td-dropzone__prompt"><span class="td-dropzone__text">Kéo thả file vào đây hoặc</span> <button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm">Chọn file</button></p>${hint}</div>`;
const TAIL = '<ul class="td-dropzone__rejected" hidden></ul><ul class="td-dropzone__list" aria-label="File đã chọn" hidden></ul>'
  + '<span class="td-sr-only td-dropzone__live" aria-live="polite"></span>';

describe('php/td.php — td_dropzone (v0.100.0, contract dropzone@1)', opts, () => {
  test('element mode: the host + exactly the component markup, the input carries the no-JS-only attributes', () => {
    const out = one('td_dropzone', ['files', { element: true }]);
    assert.equal(out, '<td-dropzone data-td-ssr="dropzone@1" id="td-files-1" name="files"><div class="td-dropzone" role="group" data-state="idle">'
      + '<input type="file" class="td-dropzone__input" name="files" aria-label="Chọn file">'
      + ZONE('<p class="td-dropzone__hint" id="td-files-1-hint" hidden></p>') + TAIL + '</div></td-dropzone>');
    assert.ok(!/<input[^>]*(tabindex|aria-hidden)/.test(out), 'no tabindex / aria-hidden on the input before the upgrade');
  });

  test('element mode: every option reaches the host attribute the component reads', () => {
    const out = one('td_dropzone', ['docs[]', {
      element: true, id: 'dz', class: 'a b', label: 'Tài liệu', accept: ['.pdf', 'image/*'], accept_label: '', multiple: true, max_size: '5MB', max_files: 3,
      prompt_title: 'T', prompt_text: 'S', hint_style: 'badges', preview: true, required: true, disabled: true, hint: 'Gợi ý', aria_label: 'AL',
    }]);
    const host = /^<td-dropzone([^>]*)>/.exec(out)[1];
    assert.equal(host, ' data-td-ssr="dropzone@1" id="dz" class="a b" name="docs[]" label="Tài liệu" accept=".pdf,image/*" accept-label="" multiple'
      + ' max-size="5MB" max-files="3" prompt-title="T" prompt-text="S" hint-style="badges" preview required disabled helper-text="Gợi ý" aria-label="AL"');
    assert.ok(out.includes('<div class="td-dropzone td-dropzone--stacked" role="group" aria-labelledby="dz-label" data-state="idle" data-disabled="">'), out);
    assert.ok(out.includes('<span class="td-dropzone__label" id="dz-label">Tài liệu<span class="td-field__required" aria-hidden="true"> *</span></span>'), out);
    assert.ok(out.includes('<input type="file" class="td-dropzone__input" name="docs[]" accept=".pdf,image/*" multiple required disabled aria-labelledby="dz-label" aria-describedby="dz-hint dz-note">'), out);
    assert.ok(out.includes('<div class="td-dropzone__hint td-dropzone__hint--badges" id="dz-hint"><span class="td-badge td-dropzone__badge">Tối đa 5 MB</span> <span class="td-badge td-dropzone__badge">Tối đa 3 file</span></div>'), out);
    assert.ok(out.endsWith('<div class="td-field__note" id="dz-note">Gợi ý</div></div></td-dropzone>'), out);
    assert.ok(out.includes('<button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm" disabled>'), out);
  });

  test('native (default): label + file input + helper text; options that need the element are dropped', () => {
    assert.equal(one('td_dropzone', ['files', {}]), '<div class="td-field td-field--md" id="td-files-1"><input type="file" class="td-field__control" id="td-files-1-control" name="files" aria-label="Chọn file"></div>');
    const full = one('td_dropzone', ['docs[]', { id: 'd', label: 'Tài liệu', accept: '.pdf', multiple: true, required: true, hint: 'PDF', class: 'x', max_size: '5MB', hint_style: 'badges' }]);
    assert.equal(full, '<div class="td-field td-field--md x" id="d"><label class="td-field__label" id="d-label" for="d-control">Tài liệu<span class="td-field__required" aria-hidden="true"> *</span></label>'
      + '<input type="file" class="td-field__control" id="d-control" name="docs[]" accept=".pdf" multiple required aria-describedby="d-note">'
      + '<div class="td-field__footer"><div class="td-field__note" id="d-note">PDF</div></div></div>');
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mode of DROPZONE_FIXTURES.modes) {
      const args = mode.call === 'absent' ? ['f', {}] : ['f', { element: mode.call }];
      const out = one('td_dropzone', args, mode.global ? { ssr_elements: true } : undefined);
      assert.equal(out.startsWith('<td-dropzone data-td-ssr="dropzone@1"'), mode.element, `${JSON.stringify(mode)}: ${out.slice(0, 60)}`);
    }
  });

  test('escaping: label, hint, accept, ids, class — no markup injection', () => {
    const bad = '"><script>alert(1)</script>';
    for (const element of [true, false]) {
      const out = one('td_dropzone', ['a"b', { element, id: bad, label: bad, hint: bad, accept: bad, aria_label: bad, class: `ok ${bad}`, accept_label: bad, prompt_title: bad, max_size: bad }]);
      assert.ok(!out.includes('<script>'), out);
      assert.ok(!/ onerror|="" alert/.test(out));
    }
  });

  test('hint text: size parsing / formatting is the component\'s (UNITS, 1024, 2 decimals half up)', () => {
    const sizes = ['5MB', '5 mb', '500KB', '1.5 GB', '1024', '0', '0.5', '1e3', 'abc', '', ' 12 K ', '10m', '1.999MB', '1.125KB', '1gb', '2TB', '1.13KB', '3.14159 MB'];
    const out = many('td__file_size', sizes.map((s) => [s]));
    sizes.forEach((s, i) => assert.equal(out[i], parseFileSize(s), JSON.stringify(s)));
    // formatted: powers of 1024 ±1, the tie 1152 → 1.13, random sizes up to 2^45
    const nums = [1, 2, 1023, 1024, 1025, 1152, 1536, 1048575, 1048576, 1048577, 1073741823, 1073741824, 1073741825, 1099511627775, 1099511627776, 1125899906842623, 1125899906842624, 5368709120, 20971520];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    for (let i = 0; i < 400; i++) nums.push(Math.floor((rnd() / 2147483648) * 2 ** (1 + (rnd() % 45))) + 1);
    const fm = many('td__format_file_size', nums.map((n) => [n]));
    nums.forEach((n, i) => assert.equal(fm[i], formatFileSize(n), String(n)));
  });

  test('hint text: parts follow the component (accept / accept-label / size / count, badges derive the formats)', () => {
    const hint = (o) => {
      const out = one('td_dropzone', ['f', { element: true, ...o }]);
      return /<(?:p|div) class="td-dropzone__hint[^"]*" id="[^"]*"(?: hidden)?>(.*?)<\/(?:p|div)>/.exec(out)[1].replace(/<[^>]+>/g, '|').replace(/\|\s*\|/g, '|').replace(/^\||\|$/g, '');
    };
    assert.equal(hint({}), '');
    assert.equal(hint({ accept: '.pdf, image/*' }), 'Định dạng: .pdf, image/*');
    assert.equal(hint({ accept: '.pdf', accept_label: ' PDF ' }), 'Định dạng: PDF');
    assert.equal(hint({ accept: '.pdf', accept_label: '  ' }), '');
    assert.equal(hint({ max_files: 3 }), '', 'max-files needs multiple');
    assert.equal(hint({ multiple: true, max_files: 1 }), '', 'a count of 1 is not shown');
    assert.equal(hint({ multiple: true, max_files: '3abc' }), '');
    assert.equal(hint({ multiple: true, max_files: 4, max_size: 1048576 }), 'Tối đa 1 MB mỗi file · Tối đa 4 file');
    assert.equal(hint({ accept: '.pdf,application/vnd.ms-excel,image/svg+xml,image/*,.PDF', hint_style: 'badges' }), 'PDF, VND.MS-EXCEL, SVG, image/*');
    assert.equal(hint({ accept: '.pdf', hint_style: ' Badges ', max_size: '2MB', multiple: true, max_files: 5 }), 'PDF|Tối đa 2 MB|Tối đa 5 file');
  });

  test('test/ssr/fixtures/dropzone.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(DROPZONE_FIXTURE_FILE, 'utf8'), renderDropzoneFixture(),
      'stale fixture: run `node test/ssr/build-dropzone-fixture.mjs`');
  });
});
