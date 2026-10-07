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

// v0.38.0: td_scan_input (single native / element mode, multiple always element — scan-input@1).
export const SCAN_INPUT_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'scan-input.fixtures.json'), 'utf8'));
export const SCAN_INPUT_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'scan-input.html');

/** Render test/ssr/scan-input-fixture.php (the HTML loaded by the scan-input SSR browser test). */
export function renderScanInputFixture() {
  return renderPhp('scan-input-fixture.php');
}

// v0.39.0: td_filter_chips (always the element <td-filter-chips data-td-ssr="filter-chips@1">).
export const FILTER_CHIPS_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'filter-chips.fixtures.json'), 'utf8'));
export const FILTER_CHIPS_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'filter-chips.html');

/** Render test/ssr/filter-chips-fixture.php (the HTML loaded by the filter-chips SSR browser test). */
export function renderFilterChipsFixture() {
  return renderPhp('filter-chips-fixture.php');
}

// v0.40.0: td_datetime_range (always the element <td-datetime-range data-td-ssr="datetime-range@1"> + two native inputs).
export const DATETIME_RANGE_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'datetime-range.fixtures.json'), 'utf8'));
export const DATETIME_RANGE_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'datetime-range.html');

/** Render test/ssr/datetime-range-fixture.php (the HTML loaded by the datetime-range SSR browser test). */
export function renderDatetimeRangeFixture() {
  return renderPhp('datetime-range-fixture.php');
}

// v0.43.0: td_media_gallery (always the element <td-media-gallery data-td-ssr="media-gallery@1"> + the no-JS inputs).
export const MEDIA_GALLERY_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'media-gallery.fixtures.json'), 'utf8'));
export const MEDIA_GALLERY_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'media-gallery.html');

/** Render test/ssr/media-gallery-fixture.php (the HTML loaded by the media-gallery SSR browser test). */
export function renderMediaGalleryFixture() {
  return renderPhp('media-gallery-fixture.php');
}

// v0.46.0: td_diff / td_diff_snapshots (always the element <td-diff data-td-ssr="diff@1">).
export const DIFF_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'diff.fixtures.json'), 'utf8'));
export const DIFF_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'diff.html');

/** Render test/ssr/diff-fixture.php (the HTML loaded by the td-diff SSR browser test). */
export function renderDiffFixture() {
  return renderPhp('diff-fixture.php');
}

// v0.47.0: td_check_matrix (always the element <td-check-matrix data-td-ssr="check-matrix@1"> + the full no-JS form).
export const CHECK_MATRIX_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'check-matrix.fixtures.json'), 'utf8'));
export const CHECK_MATRIX_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'check-matrix.html');

/** Render test/ssr/check-matrix-fixture.php (the HTML loaded by the check-matrix SSR browser test). */
export function renderCheckMatrixFixture() {
  return renderPhp('check-matrix-fixture.php');
}

// v0.48.0: td_color_picker (native by default, element mode opt-in — color-picker@1).
export const COLOR_PICKER_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'color-picker.fixtures.json'), 'utf8'));
export const COLOR_PICKER_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'color-picker.html');

/** Render test/ssr/color-picker-fixture.php (the HTML loaded by the color-picker SSR browser test). */
export function renderColorPickerFixture() {
  return renderPhp('color-picker-fixture.php');
}

// v0.49.0: td_choice_group (always element mode, choice-group@1).
export const CHOICE_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'choice.fixtures.json'), 'utf8'));
export const CHOICE_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'choice.html');

/** Render test/ssr/choice-fixture.php (the HTML loaded by the choice-group SSR browser test). */
export function renderChoiceFixture() {
  return renderPhp('choice-fixture.php');
}

// v0.50.0: td_rating (always the element <td-rating data-td-ssr="rating@1">).
export const RATING_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'rating.fixtures.json'), 'utf8'));
export const RATING_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'rating.html');

/** Render test/ssr/rating-fixture.php (the HTML loaded by the rating engines browser test). */
export function renderRatingFixture() {
  return renderPhp('rating-fixture.php');
}

// v0.50.0: td_carousel (always the element <td-carousel data-td-ssr="carousel@1"> + the frame around the slides).
export const CAROUSEL_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'carousel.fixtures.json'), 'utf8'));
export const CAROUSEL_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'carousel.html');

/** Render test/ssr/carousel-fixture.php (the HTML loaded by the carousel engines browser test and the gates). */
export function renderCarouselFixture() {
  return renderPhp('carousel-fixture.php');
}

// v0.51.1: pre-upgrade parity (FOUC) — every upgraded helper case, measured by test/engines/ssr-fouc.spec.mjs.
export const FOUC_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'fouc.fixtures.json'), 'utf8'));
export const FOUC_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'fouc.html');

/** Render test/ssr/fouc-fixture.php (the HTML loaded by the FOUC parity spec). */
export function renderFoucFixture() {
  return renderPhp('fouc-fixture.php');
}

// v0.52.0: td_toggle tone / status_text / locked / locked_reason (contract toggle@1, additive parts).
export const TOGGLE_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'toggle.fixtures.json'), 'utf8'));
export const TOGGLE_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'toggle.html');

/** Render test/ssr/toggle-fixture.php (the HTML loaded by the toggle SSR browser test). */
export function renderToggleFixture() {
  return renderPhp('toggle-fixture.php');
}

// v0.54.0: helper_text on every td_* form helper + td_toggle on_text / off_text + td_hint (contracts *@1, additive parts).
export const HINT_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'hint.fixtures.json'), 'utf8'));
export const HINT_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'hint.html');

/** Render test/ssr/hint-fixture.php (the HTML loaded by the v0.54.0 hint SSR browser test). */
export function renderHintFixture() {
  return renderPhp('hint-fixture.php');
}

// v0.55.0: prefix / suffix / icons / unit_label on td_field + icons / locale on td_number_input (contracts *@1, additive).
export const AFFIX_FIXTURES = JSON.parse(readFileSync(join(SSR_DIR, 'affix.fixtures.json'), 'utf8'));
export const AFFIX_FIXTURE_FILE = join(SSR_DIR, 'fixtures', 'affix.html');

/** Render test/ssr/affix-fixture.php (the HTML loaded by the v0.55.0 affix SSR browser test). */
export function renderAffixFixture() {
  return renderPhp('affix-fixture.php');
}
