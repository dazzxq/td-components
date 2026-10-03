// Node helpers for the SSR contracts (ADR 0012): button@1 (v0.25.0, test/ssr/button.fixtures.json) and input-field@1 /
// toggle@1 / checkbox@1 (v0.26.0, test/ssr/form.fixtures.json).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PHP_BIN } from '../php/php.mjs';

export const SSR_DIR = dirname(fileURLToPath(import.meta.url));
export const BUTTON_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'button.fixtures.json'), 'utf8'));
export const BUTTON_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'button.html');
export const FORM_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'form.fixtures.json'), 'utf8'));
export const FORM_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'form.html');

// v0.26.0 (part 2): dropdown@1 (td_dropdown element mode) and empty-state@1 (td_empty).
export const DROPDOWN_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'dropdown.fixtures.json'), 'utf8'));
export const DROPDOWN_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'dropdown.html');
export const EMPTY_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'empty.fixtures.json'), 'utf8'));
export const EMPTY_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'empty.html');

/** Run a fixture PHP script of this directory and return its stdout. */
function renderPhp(script) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', join(SSR_DIR, script)], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr) throw new Error(`${script} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Render test/ssr/button-fixture.php (the HTML loaded by the button SSR browser test). */
export function renderButtonFixture() {
  return renderPhp('button-fixture.php');
}

/** Render test/ssr/form-fixture.php (the HTML loaded by the form SSR browser test). */
export function renderFormFixture() {
  return renderPhp('form-fixture.php');
}

/** Render test/ssr/dropdown-fixture.php (the HTML loaded by the dropdown SSR browser test). */
export function renderDropdownFixture() {
  return renderPhp('dropdown-fixture.php');
}

/** Render test/ssr/empty-fixture.php (the HTML loaded by the empty-state SSR browser test). */
export function renderEmptyFixture() {
  return renderPhp('empty-fixture.php');
}

// v0.27.0: otp-input@1 (td_otp_input element mode) and copy@1 (td_copy).
export const OTP_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'otp.fixtures.json'), 'utf8'));
export const OTP_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'otp.html');
export const COPY_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'copy.fixtures.json'), 'utf8'));
export const COPY_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'copy.html');

/** Render test/ssr/otp-fixture.php (the HTML loaded by the OTP SSR browser test). */
export function renderOtpFixture() {
  return renderPhp('otp-fixture.php');
}

/** Render test/ssr/copy-fixture.php (the HTML loaded by the copy SSR browser test). */
export function renderCopyFixture() {
  return renderPhp('copy-fixture.php');
}

// v0.28.0: td_multiselect (native <select multiple> / element mode chip-input@1).
export const MULTISELECT_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'multiselect.fixtures.json'), 'utf8'));
export const MULTISELECT_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'multiselect.html');

/** Render test/ssr/multiselect-fixture.php (the HTML loaded by the multiselect engines browser test). */
export function renderMultiselectFixture() {
  return renderPhp('multiselect-fixture.php');
}

// v0.29.0: td_tree_select (native <select> inside <td-tree-select> / element mode tree-select@1).
export const TREE_SELECT_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'tree-select.fixtures.json'), 'utf8'));
export const TREE_SELECT_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'tree-select.html');

/** Render test/ssr/tree-select-fixture.php (the HTML loaded by the tree-select SSR browser test). */
export function renderTreeSelectFixture() {
  return renderPhp('tree-select-fixture.php');
}

// v0.30.0: td_number_input (native type=number field / element mode number-input@1).
export const NUMBER_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'number.fixtures.json'), 'utf8'));
export const NUMBER_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'number.html');

/** Render test/ssr/number-fixture.php (the HTML loaded by the number-input SSR browser test). */
export function renderNumberFixture() {
  return renderPhp('number-fixture.php');
}

// v0.31.0: td_masked_value (always element mode, masked-value@1).
export const MASKED_VALUE_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'masked-value.fixtures.json'), 'utf8'));
export const MASKED_VALUE_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'masked-value.html');

/** Render test/ssr/masked-value-fixture.php (the HTML loaded by the masked-value SSR browser test). */
export function renderMaskedValueFixture() {
  return renderPhp('masked-value-fixture.php');
}

// v0.32.0: td_media_field (always the element <td-media-field data-td-ssr="media-field@1"> + the no-JS hidden inputs).
export const MEDIA_FIELD_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'media-field.fixtures.json'), 'utf8'));
export const MEDIA_FIELD_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'media-field.html');

/** Render test/ssr/media-field-fixture.php (the HTML loaded by the media-field SSR browser test). */
export function renderMediaFieldFixture() {
  return renderPhp('media-field-fixture.php');
}
