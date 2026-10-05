<?php
/**
 * td-components — official PHP SSR adapter (plan v0.17.0 E5). PHP >= 8.0 (CI job `php80`), no framework, no composer
 * dependency.
 * Docs: docs/guides/php-adapter.md.
 *
 *   require_once '/path/to/vendor/td-components/0.48.0/php/td.php';
 *   TdComponents\Td::configure('/assets/vendor/td-components/0.48.0', __DIR__ . '/public/assets/vendor/td-components/0.48.0');
 *   echo td_stylesheet_tag($nonce), td_import_map_tag(['app' => '/assets/app.js'], $nonce);
 *   echo td_field('email', $email, ['label' => 'Email', 'type' => 'email', 'autocomplete' => 'email', 'required' => true]);
 *   echo td_button('Lưu', ['type' => 'submit', 'variant' => 'primary']);
 *
 * Markup contract (the only promise of this file):
 *   - td_button / td_link / td_field / td_checkbox / td_toggle print STANDALONE NATIVE controls carrying the DOM
 *     contract (BEM classes) of the matching component: td.css styles them, submit + validation are native, no JS,
 *     no upgrade. Use the <td-*> custom elements when you need JS behaviour (loading/run, counter, live errors…).
 *   - v0.25.0 ELEMENT mode (opt-in: option `element => true`, or Td::configure(..., ['ssr_elements' => true])):
 *     td_button / td_link (not bare) print `<td-button data-td-ssr="button@1" …>` + the exact control the component
 *     renders — native without JS, hydrated IN PLACE by `@dazzxq/td-components/button` (no flash, ADR 0012).
 *     v0.26.0: td_field / td_toggle / td_checkbox the same way (`<td-input-field data-td-ssr="input-field@1">`,
 *     `<td-toggle data-td-ssr="toggle@1">`, `<td-checkbox data-td-ssr="checkbox@1">`): the native control keeps
 *     name / value / checked / constraints / autocomplete / id (submit + validation + password managers without JS);
 *     the component adopts it in place and takes over form participation.
 *   - td_dropdown prints a <td-dropdown> host wrapping a native <select>: works without JS, upgrades when
 *     `@dazzxq/td-components/dropdown` is imported (with td_multiselect element mode, the only helpers that UPGRADE a select). v0.26.0 element mode: the same
 *     markup + `data-td-ssr="dropdown@1"` + `select.td-dropdown__native` styled to the trigger box (no layout shift).
 *   - v0.28.0 td_multiselect prints a native `<select multiple>` (div.td-multiselect; every selected value submitted
 *     under the name, verbatim — `roles[]`); element mode: `<td-chip-input data-td-ssr="chip-input@1" selection-only>`
 *     + the same select (`select.td-chip-input__native`), upgraded by `@dazzxq/td-components/chip-input`.
 *   - v0.29.0 td_tree_select prints `<td-tree-select>` + a native preorder `<select>` (NBSP indent, data-level, locks via
 *     data-locked + hidden inputs), upgraded by `@dazzxq/td-components/tree-select`; element mode adds
 *     `data-td-ssr="tree-select@1"` (the select styled to the trigger box — no layout shift, single and multiple).
 *   - v0.26.0 td_empty prints `<td-empty-state data-td-ssr="empty-state@1">` + the full styled tree (always element),
 *     hydrated in place by `@dazzxq/td-components/empty-state`.
 *   - v0.32.0 td_media_field prints `<td-media-field data-td-ssr="media-field@1">` + the full tree (always element) +
 *     the no-JS hidden inputs (assetId / crop) and the alt input name, adopted in place by `@dazzxq/td-components/media-field`.
 *   - v0.47.0 td_check_matrix prints `<td-check-matrix data-td-ssr="check-matrix@1" data="{JSON}">` + the full no-JS form
 *     (column markers `name[col]=""`, one checkbox `name[col][]=row` per applicable cell, a hidden twin after each
 *     locked-ticked one, the `name[_v]=1` sentinel last) — byte-identical FormData to the JS component, which adopts it
 *     in place after a node-by-node check against `data`. Invalid data / name → the fail-closed state (no input at all).
 *   - td_icon prints `svg.td-icon` with the full geometry of src/icons/icons.json (+ Td::registerIcons()).
 *   - td_badge prints a CSS-only `span.td-badge…` (no JS, no custom element).
 *   - td_alert prints a `<td-alert>` host that ALREADY contains the full styled markup `div.td-alert` (icon, heading,
 *     message): td.css styles it without JS; `@dazzxq/td-components/alert` upgrades it IN PLACE (text kept) and adds
 *     the close button when `dismissible` (no close button without JS — no dead control).
 * Names and options are compatible with the 135 reference adapter (src/Ui/markup.php), plus a real `ghost` variant
 * and `href` → <a> buttons.
 *
 * Safety: every value goes through htmlspecialchars(ENT_QUOTES|ENT_SUBSTITUTE, UTF-8) inside double quotes;
 * attribute NAMES are allowlisted (no on*, style, href/src/action/formaction/srcdoc…); URLs go through an allowlist
 * (http(s), relative, #, mailto:, tel:); class options accept valid class tokens only; JSON uses the HEX flags.
 * Global names: only the `td_*` functions below and the class TdComponents\Td.
 */

declare(strict_types=1);

namespace TdComponents {

    use InvalidArgumentException;
    use LogicException;
    use RuntimeException;

    final class Td
    {
        public const PACKAGE = '@dazzxq/td-components';

        /** JSON flags for anything printed inside HTML (script blocks or attributes). */
        public const JSON_FLAGS = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES
            | JSON_THROW_ON_ERROR;

        public const VARIANTS = ['primary', 'secondary', 'success', 'danger', 'info', 'warning', 'ghost'];
        public const SIZES = ['sm', 'md', 'lg'];
        public const TARGETS = ['_blank', '_self', '_parent', '_top'];

        /**
         * Old sprite names (135 kit) → registry names; applied only when the name itself is unknown. The shared source
         * is the `aliases` object of src/icons/icons.json (v0.18.0 F6, read by td-icon.js too); this constant is the
         * FALLBACK for a vendored icons.json that predates it.
         */
        private const ALIASES = [
            'x' => 'close', 'chevron-left' => 'prev', 'chevron-right' => 'next', 'chevron-up' => 'up',
            'chevron-down' => 'down', 'ellipsis' => 'more', 'external-link' => 'external', 'expand' => 'fullscreen',
            'pen' => 'pencil',
        ];

        /**
         * POSITIVE allowlist for caller `attrs` / `input_attrs` (security review v0.17.0): `aria-*`, `data-*` and these
         * native attributes. Anything else — event handlers, style, URL-bearing names, and form-owner / submitter
         * overrides (`form`, `formmethod`, `formenctype`, `formtarget`, `formnovalidate`, `formaction`, `dirname`,
         * `popovertarget`, `commandfor`…) — is dropped.
         */
        private const ALLOWED_ATTRS = [
            'id', 'title', 'lang', 'dir', 'role', 'tabindex', 'hidden', 'translate', 'accesskey', 'autofocus',
            'autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'placeholder', 'readonly',
            'required', 'disabled', 'maxlength', 'minlength', 'min', 'max', 'step', 'pattern', 'size', 'rows', 'cols',
        ];

        /** Icon geometry allowlist (same rules as src/icons/td-icon.js). */
        private const ICON_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'];
        private const ICON_NUMBER = '/^-?(\d+\.?\d*|\.\d+)$/';
        private const ICON_ATTRS = [
            'd' => '/^[0-9MmLlHhVvCcSsQqTtAaZzEe.,+\-\s]*$/',
            'points' => '/^[0-9.,+\-eE\s]*$/',
            'cx' => self::ICON_NUMBER, 'cy' => self::ICON_NUMBER, 'r' => self::ICON_NUMBER, 'rx' => self::ICON_NUMBER,
            'ry' => self::ICON_NUMBER, 'x' => self::ICON_NUMBER, 'y' => self::ICON_NUMBER, 'x1' => self::ICON_NUMBER,
            'y1' => self::ICON_NUMBER, 'x2' => self::ICON_NUMBER, 'y2' => self::ICON_NUMBER,
            'width' => self::ICON_NUMBER, 'height' => self::ICON_NUMBER,
            'fill-rule' => '/^(nonzero|evenodd)$/', 'clip-rule' => '/^(nonzero|evenodd)$/',
            'opacity' => '/^(0(\.\d+)?|1(\.0+)?)$/', 'fill-opacity' => '/^(0(\.\d+)?|1(\.0+)?)$/',
            'stroke-opacity' => '/^(0(\.\d+)?|1(\.0+)?)$/',
        ];
        private const ICON_VIEWBOX = '/^-?\d+(\.\d+)?( -?\d+(\.\d+)?){3}$/';
        private const ICON_NAME = '/^[a-z][a-z0-9-]{0,63}$/';

        private static ?string $baseUrl = null;
        private static ?string $kitDir = null;
        private static ?array $pkg = null;
        private static ?array $kitIcons = null;
        /** @var array<string,string>|null `aliases` of icons.json (null = the file has none → ALIASES) */
        private static ?array $kitAliases = null;
        /** @var array<string,array> */
        private static array $siteIcons = [];
        private static bool $allowHttp = false;

        /**
         * Allow absolute `http:` URLs in td_button/td_link (default: off — an HTTPS site never links down to HTTP).
         * Only for sites that must link to legacy HTTP-only hosts.
         */
        public static function allowHttpLinks(bool $allow = true): void
        {
            self::$allowHttp = $allow;
        }
        private static int $uid = 0;
        /**
         * v0.25.0: element mode by default for helpers with an SSR contract (td_button / td_link, not bare; v0.26.0 +
         * td_field / td_toggle / td_checkbox).
         */
        private static bool $ssrElements = false;

        /** SSR contract markers (ADR 0012): `data-td-ssr` value printed by element-mode helpers. */
        public const SSR_BUTTON = 'button@1';
        /** v0.26.0: td_field / td_toggle / td_checkbox element mode. */
        public const SSR_FIELD = 'input-field@1';
        public const SSR_TOGGLE = 'toggle@1';
        public const SSR_CHECKBOX = 'checkbox@1';
        /** v0.26.0 part 2: td_dropdown element mode (the native select shell) and td_empty (always). */
        public const SSR_DROPDOWN = 'dropdown@1';
        public const SSR_EMPTY = 'empty-state@1';
        /** v0.27.0: td_otp_input element mode and td_copy (always). */
        public const SSR_OTP = 'otp-input@1';
        public const SSR_COPY = 'copy@1';
        /** v0.28.0: td_multiselect element mode (<td-chip-input> + the native <select multiple>, upgraded via M3). */
        public const SSR_CHIP_INPUT = 'chip-input@1';
        /** v0.29.0: td_tree_select element mode (<td-tree-select> + the native <select>, styled to the trigger box). */
        public const SSR_TREE_SELECT = 'tree-select@1';
        /** v0.30.0: td_number_input element mode (<td-number-input> + the native type=number control). */
        public const SSR_NUMBER = 'number-input@1';
        /** v0.31.0: td_masked_value (always — the masked string only, never the real value). */
        public const SSR_MASKED_VALUE = 'masked-value@1';
        /** v0.32.0: td_media_field (always the element <td-media-field> + the no-JS hidden inputs). */
        public const SSR_MEDIA_FIELD = 'media-field@1';
        /** v0.36.0: td_action_button element mode (<td-action-button> + the icon-only control). */
        public const SSR_ACTION_BUTTON = 'action-button@1';
        /** v0.38.0: td_scan_input (single: element mode opt-in; multiple: always the element + textarea + hidden inputs). */
        public const SSR_SCAN_INPUT = 'scan-input@1';
        /** v0.40.0: td_datetime_range (always the element <td-datetime-range> + two native date / datetime-local inputs). */
        public const SSR_DATETIME_RANGE = 'datetime-range@1';
        /** v0.40.0: texts of td_datetime_range = TdDatetimeRange.labels (a site overriding the JS labels gets a safe re-render). */
        public const RANGE_LABELS = ['start' => 'Từ', 'end' => 'Đến', 'fromPrefix' => 'Từ', 'toPrefix' => 'Đến',
            'placeholder' => 'dd/mm/yyyy – dd/mm/yyyy', 'placeholderDatetime' => 'dd/mm/yyyy hh:mm – dd/mm/yyyy hh:mm'];
        /** v0.38.0: texts of td_scan_input = TdScanInput.labels (a site overriding the JS labels gets a safe re-render). */
        public const SCAN_LABELS = ['input' => 'Mã quét', 'list' => 'Mã đã quét', 'fallback' => 'Nhập tay, mỗi dòng một mã'];
        /** v0.39.0: td_filter_chips (always the element <td-filter-chips> + the chips; × links work without JS). */
        public const SSR_FILTER_CHIPS = 'filter-chips@1';
        /** v0.39.0: default texts of td_filter_chips = TdFilterChips.labels (`remove`: {label} / {value}). */
        public const FILTER_CHIPS_LABELS = [
            'group' => 'Bộ lọc đang áp dụng',
            'clearAll' => 'Xoá tất cả',
            'remove' => 'Bỏ lọc {label}: {value}',
        ];
        /** v0.45.0: td_steps / td_timeline (always the element + the full tree, hydrated in place). */
        public const SSR_STEPS = 'steps@1';
        public const SSR_TIMELINE = 'timeline@1';
        /** v0.45.0: texts of td_steps = TdSteps.labels (src/utils/steps-model.js STEPS_LABELS). */
        public const STEPS_LABELS = [
            'group' => 'Tiến trình',
            'done' => ', đã xong',
            'error' => ', có lỗi',
            'upcoming' => ', chưa tới',
            'summary' => 'Bước {n}/{total}: {label}',
            'summaryComplete' => 'Đã hoàn tất {total}/{total} bước',
            'summaryNone' => '{total} bước',
        ];
        /** v0.45.0: texts of td_timeline = TdTimeline.labels (src/utils/timeline-model.js TIMELINE_LABELS). */
        public const TIMELINE_LABELS = [
            'empty' => 'Chưa có hoạt động nào',
            'today' => 'Hôm nay',
            'yesterday' => 'Hôm qua',
            'day' => '{weekday}, {dd}/{mm}/{yyyy}',
            'weekdays' => ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
            'unknownDay' => 'Không rõ thời gian',
            'details' => 'Chi tiết',
            'detailsLoading' => 'Đang tải…',
            'detailsError' => 'Không tải được chi tiết.',
            'retry' => 'Thử lại',
            'more' => 'Xem thêm',
            'moreError' => 'Không tải được, thử lại',
            'loaded' => 'Đã tải thêm {n} mục',
        ];
        /** v0.47.0: td_check_matrix (always the element <td-check-matrix> + the full no-JS form: markers, checkboxes, sentinel). */
        public const SSR_CHECK_MATRIX = 'check-matrix@1';
        /** v0.47.0: default texts of td_check_matrix = TdCheckMatrix.labels (src/utils/check-matrix-render.js MATRIX_LABELS). */
        public const CHECK_MATRIX_LABELS = [
            'grid' => 'Ma trận chọn',
            'rows' => 'Mục',
            'all' => 'Chọn tất cả',
            'row' => 'Chọn cả hàng {row}',
            'column' => 'Chọn cả cột {col}',
            'group' => 'Chọn cả nhóm {group}',
            'groupColumn' => 'Chọn cả nhóm {group}, cột {col}',
            'columnPick' => 'Đang sửa cột',
            'na' => 'Không áp dụng',
            'broken' => 'Không đọc được dữ liệu ma trận',
            'changed' => 'Đã đổi {n} ô',
        ];
        /** v0.48.0: td_color_picker (native by default; element mode <td-color-picker data-td-ssr="color-picker@1">). */
        public const SSR_COLOR = 'color-picker@1';
        /** v0.48.0: texts of td_color_picker = TdColorPicker.labels (input / placeholder) + the no-JS hint. */
        public const COLOR_LABELS = ['input' => 'Mã màu', 'placeholder' => '#000000', 'hint' => 'Dạng #RRGGBB, ví dụ #1d4ed8'];
        /** v0.48.0: the no-JS pattern — ONLY #RRGGBB without JS (the server normalises with td_color_value()). */
        public const COLOR_PATTERN = '#[0-9a-fA-F]{6}';
        /** v0.48.0 SEC-01 (= src/utils/color-picker-model.js): longest value / preset looked at, presets inspected, preset string bytes. */
        public const COLOR_MAX_INPUT = 64;
        public const COLOR_PRESET_CANDIDATES = 192;
        public const COLOR_PRESET_STRING = 192 * 64;
        /** v0.36.0: tones / sizes of td_action_button (= TdActionButton). */
        public const ACTION_TONES = ['standard', 'warning', 'danger'];
        public const ACTION_SIZES = ['sm', 'md', 'lg'];
        /**
         * v0.36.0: the 23 dcms2 action presets — name => [icon, label, tone]. MUST equal TdActionButton.presets
         * (src/form/td-action-button.js; parity: test/php/td-action-button.test.js). Plan v0.36.0 QĐ 11.
         */
        public const ACTION_PRESETS = [
            'edit' => ['pencil', 'Chỉnh sửa', 'standard'],
            'view' => ['eye', 'Xem chi tiết', 'standard'],
            'review' => ['send', 'Gửi bài', 'standard'],
            'remove' => ['arrow-down-to-line', 'Gỡ bài viết', 'warning'],
            'unpublish' => ['arrow-down-to-line', 'Gỡ xuống', 'danger'],
            'withdraw' => ['rewind', 'Rút bài', 'warning'],
            'return' => ['undo-2', 'Trả lại', 'warning'],
            'log' => ['history', 'Xem log', 'standard'],
            'versions' => ['layers', 'Lịch sử phiên bản', 'standard'],
            'password' => ['rotate-cw', 'Reset mật khẩu', 'warning'],
            'reset' => ['key-round', 'Reset mật khẩu', 'warning'],
            'open' => ['external', 'Mở trong tab mới', 'standard'],
            'copy' => ['copy', 'Sao chép', 'standard'],
            'delete' => ['trash', 'Xoá', 'danger'],
            'download' => ['download', 'Tải về', 'standard'],
            'moveup' => ['arrow-up', 'Di chuyển lên', 'standard'],
            'movedown' => ['arrow-down', 'Di chuyển xuống', 'standard'],
            'publish' => ['success', 'Xuất bản', 'standard'],
            'send-to-publish' => ['send', 'Gửi chờ xuất bản', 'standard'],
            'submit' => ['send', 'Gửi bài', 'standard'],
            'claim' => ['hand', 'Nhận bài', 'standard'],
            'release' => ['reply', 'Nhả bài', 'warning'],
            'force-release' => ['user-x', 'Nhả bài cho người khác', 'danger'],
        ];
        /** @internal JS `\s` (String.prototype.trim / RegExp \s) as a PCRE /u class body — parity with media-field-model.js. */
        public const JS_WS = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
        /** v0.32.0: default texts of td_media_field = TdMediaField.labels (Vietnamese; a site overriding the JS labels gets a safe re-render). */
        public const MEDIA_FIELD_LABELS = [
            'prompt' => ['image' => 'Chọn ảnh', 'video' => 'Chọn video', 'file' => 'Chọn file'],
            'replace' => ['image' => 'Đổi ảnh', 'video' => 'Đổi video', 'file' => 'Đổi file'],
            'remove' => 'Gỡ',
            'alt' => 'Mô tả ảnh (alt)',
            'empty' => 'Chưa chọn',
            'selected' => 'Đã chọn: {name}',
            'noPreview' => 'Đã chọn (không có ảnh xem trước)',
            'video' => 'Video',
            /** v0.35 */
            'crop' => 'Cắt ảnh',
        ];
        /** v0.43.0: td_media_gallery (always the element <td-media-gallery> + the no-JS inputs, ADR 0021). */
        public const SSR_MEDIA_GALLERY = 'media-gallery@1';
        /** v0.43.0 (decision 6, owner O2): hard ceiling of a gallery = the default max (TdMediaGallery.MAX_ITEMS). */
        public const MEDIA_GALLERY_MAX_ITEMS = 100;
        /** v0.43.0: default texts of td_media_gallery = TdMediaGallery.labels (a site overriding the JS labels gets a safe re-render). */
        public const MEDIA_GALLERY_LABELS = [
            'prompt' => ['image' => 'Chọn ảnh', 'video' => 'Chọn video', 'file' => 'Chọn file'],
            'add' => ['image' => 'Thêm ảnh', 'video' => 'Thêm video', 'file' => 'Thêm file'],
            'kinds' => ['image' => 'ảnh', 'video' => 'video', 'file' => 'file'],
            'countMax' => '{count}/{max} {kind}',
            'full' => 'Đã đủ {max} {kind}',
            'over' => 'Vượt giới hạn: {count}/{max} {kind}',
            'item' => 'Ảnh {n} trên {count}: {name}',
            'coverSuffix' => ', ảnh bìa',
            'cover' => 'Ảnh bìa',
            'handle' => 'Sắp xếp {name}',
            'remove' => 'Gỡ {name}',
            'crop' => 'Cắt {name}',
            'alt' => 'Mô tả ảnh {n} (alt)',
            'altPlaceholder' => 'Mô tả (alt)',
            'noPreview' => 'Không có ảnh xem trước',
            'video' => 'Video',
            'broken' => 'Không đọc được danh sách ảnh',
            'sortHelp' => 'Nhấn Space hoặc Enter để nhấc, phím mũi tên để di chuyển, Space hoặc Enter để thả, Escape để huỷ.',
        ];
        /** v0.46.0: td_diff / td_diff_snapshots (always the element <td-diff data-td-ssr="diff@1"> + the full markup). */
        public const SSR_DIFF = 'diff@1';
        /** v0.46.0: default texts of td_diff = TdDiff.labels (src/utils/diff-model.js DEFAULT_LABELS; `{n}` = a number). */
        public const DIFF_LABELS = [
            'table' => 'So sánh thay đổi',
            'field' => 'Trường',
            'before' => 'Trước',
            'after' => 'Sau',
            'added' => 'Thêm',
            'removed' => 'Xoá',
            'changed' => 'Đổi',
            'masked' => '[ĐÃ ẨN]',
            'maskedBadge' => 'Đã che',
            'empty' => 'trống',
            'yes' => 'Có',
            'no' => 'Không',
            'showFull' => 'Xem đầy đủ ({n} ký tự)',
            'unchanged' => '{n} trường không đổi',
            'json' => 'Xem JSON',
            'jsonBefore' => 'JSON trước',
            'jsonAfter' => 'JSON sau',
            'more' => 'Còn {n} trường không hiện.',
            'tooLarge' => 'Dữ liệu quá lớn, chỉ hiện một phần.',
            'textBudget' => 'Dữ liệu dài: các giá trị sau chỉ hiện bản xem trước.',
            'truncated' => '… đã cắt',
            'none' => 'Không có thay đổi.',
            'unsupported' => '[không hỗ trợ]',
            'unreadable' => '[không đọc được]',
            'cycle' => '[vòng lặp]',
            'unsafeNumber' => '[số quá lớn]',
            'uncertain' => 'không so sánh được',
            'unsafeNote' => 'Có số vượt độ chính xác — server nên gửi dạng chuỗi.',
            'invalidJson' => 'JSON không hợp lệ.',
            'listAdded' => 'thêm',
            'listRemoved' => 'bỏ',
            'listMore' => '+{n} phần tử',
            'arraySummary' => 'Mảng {n} phần tử',
            'objectSummary' => 'Object {n} khoá',
            'root' => 'Giá trị',
        ];
        /** @internal v0.46.0: json_encode flags of the td-diff model (= JSON.stringify of the same strings). */
        public const DIFF_JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;

        /** v0.49.0: td_choice_group (always the element <td-choice-group> + native radios — works without JS). */
        public const SSR_CHOICE = 'choice-group@1';
        /** v0.49.0: default texts of td_choice_group = TdChoiceGroup.messages (state: the component re-applies its own). */
        public const CHOICE_LABELS = ['unavailable' => 'Hết hàng'];
        /**
         * v0.49.0 review S1: bounded work of td_choice_group = src/utils/choice-options.js CHOICE_LIMITS (entries read, options
         * accepted, code points per field: text cut, value / swatch / image refused when longer).
         */
        public const CHOICE_LIMITS = ['candidates' => 400, 'options' => 100, 'value' => 200, 'label' => 200, 'hint' => 200,
            'note' => 100, 'swatch' => 128, 'image' => 8192];

        /**
         * @param string $baseUrl URL of the VERSIONED vendor directory (e.g. '/assets/vendor/td-components/0.48.0') —
         *                        the version lives in the path, never in `?v=` (module identity).
         * @param string $kitDir  Filesystem path of the same directory (reads package.json + src/icons/icons.json).
         * @param array{ssr_elements?: bool} $options v0.25.0. `ssr_elements` (default false): td_button / td_link
         *                        print the `<td-button>` host + its full SSR markup (hydrated in place by the JS
         *                        module) instead of a native control; a per-call `element` option overrides it.
         *                        v0.26.0: also td_field / td_toggle / td_checkbox (`<td-input-field>` / `<td-toggle>`
         *                        / `<td-checkbox>`).
         *                        Unknown keys throw (typos never pass silently).
         */
        public static function configure(string $baseUrl, string $kitDir, array $options = []): void
        {
            foreach ($options as $k => $v) {
                if ($k !== 'ssr_elements') {
                    throw new InvalidArgumentException("Td::configure: unknown option \"$k\"");
                }
                if (!is_bool($v)) {
                    throw new InvalidArgumentException('Td::configure: ssr_elements must be a bool');
                }
            }
            // asset base: http(s) or relative — independent of the LINK policy (allowHttpLinks only gates td_button/td_link)
            $url = self::safeUrl($baseUrl, true);
            if ($url === '' || $url[0] === '#' || preg_match('/^(mailto|tel):/i', $url)) {
                throw new InvalidArgumentException('Td::configure: baseUrl must be an http(s) or relative URL');
            }
            if (!is_dir($kitDir)) {
                throw new InvalidArgumentException('Td::configure: kitDir is not a directory');
            }
            self::$baseUrl = rtrim($url, '/');
            self::$kitDir = rtrim($kitDir, '/\\');
            self::$pkg = null;
            self::$kitIcons = null;
            self::$kitAliases = null;
            self::$ssrElements = $options['ssr_elements'] ?? false;
        }

        /** v0.25.0: whether element mode is the default (Td::configure(..., ['ssr_elements' => true])). */
        public static function ssrElements(): bool
        {
            return self::$ssrElements;
        }

        public static function baseUrl(): string
        {
            if (self::$baseUrl === null) {
                throw new LogicException('Td::configure($baseUrl, $kitDir) has not been called');
            }
            return self::$baseUrl;
        }

        /** Kit directory: the configured one, else the package this file ships in (php/..). */
        public static function kitDir(): string
        {
            return self::$kitDir ?? dirname(__DIR__);
        }

        /** @return array<string,mixed> the vendored package.json */
        private static function package(): array
        {
            if (self::$pkg === null) {
                $file = self::kitDir() . '/package.json';
                $raw = is_file($file) ? file_get_contents($file) : false;
                if ($raw === false) {
                    throw new RuntimeException('td-components: package.json not found in the kit directory');
                }
                self::$pkg = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
            }
            return self::$pkg;
        }

        // --- Import map + stylesheet -------------------------------------------------------------------------------

        /**
         * Import map entries: every `.js` entry of the vendored package.json `exports` (kit first) + $extra (the
         * site's own entries — a page has ONE import map). An $extra key equal to a kit specifier throws.
         * @param array<string,string> $extra specifier => URL
         * @return array<string,string>
         */
        public static function importMap(array $extra = []): array
        {
            $pkg = self::package();
            $name = is_string($pkg['name'] ?? null) ? $pkg['name'] : self::PACKAGE;
            $base = self::baseUrl();
            $map = [];
            foreach (($pkg['exports'] ?? []) as $sub => $target) {
                if (!is_string($target) || !str_ends_with($target, '.js') || !str_starts_with($target, './')) {
                    continue; // ./td.css, ./icons.json, ./package.json, conditional exports
                }
                $sub = (string) $sub;
                $spec = $sub === '.' ? $name : $name . '/' . substr($sub, 2);
                $map[$spec] = $base . '/' . substr($target, 2);
            }
            foreach ($extra as $spec => $url) {
                if (!is_string($spec) || $spec === '' || !is_string($url) || $url === '') {
                    throw new InvalidArgumentException('Td::importMap: $extra must map non-empty specifiers to URL strings');
                }
                if (array_key_exists($spec, $map)) {
                    throw new InvalidArgumentException("Td::importMap: \"$spec\" is a kit specifier and cannot be overridden");
                }
                $map[$spec] = $url;
            }
            return $map;
        }

        /** `<script type="importmap">` with {"imports": importMap($extra)} (HEX-escaped JSON) + optional nonce. */
        public static function importMapTag(array $extra = [], ?string $nonce = null): string
        {
            $json = json_encode(['imports' => self::importMap($extra)], self::JSON_FLAGS);
            return '<script type="importmap"' . self::nonceAttr($nonce) . '>' . $json . '</script>';
        }

        /**
         * v0.25.0: `<link rel="modulepreload" href="…">` for the kit modules used on the page — an OPTIMISATION (the
         * modules start downloading with the HTML), never a replacement for SSR markup. Names: the export short name
         * (`'button'`) or the full specifier (`'@dazzxq/td-components/button'`); resolved through importMap() (same
         * configured version), de-duplicated in order. A name that is not a kit JS export throws
         * InvalidArgumentException. Print after the import map, before the entry module:
         * stylesheetTag() → importMapTag() → modulePreloads([...]) → `<script type="module" src="app.js">`.
         * @param array<int,string> $names
         */
        public static function modulePreloads(array $names, ?string $nonce = null): string
        {
            $map = self::importMap();
            $pkg = self::package();
            $prefix = (is_string($pkg['name'] ?? null) ? $pkg['name'] : self::PACKAGE);
            $urls = [];
            foreach ($names as $name) {
                if (!is_string($name) || $name === '') {
                    throw new InvalidArgumentException('Td::modulePreloads: names must be non-empty strings');
                }
                $spec = isset($map[$name]) ? $name : $prefix . '/' . $name;
                if (!isset($map[$spec])) {
                    throw new InvalidArgumentException("Td::modulePreloads: \"$name\" is not a JS module of the kit");
                }
                $urls[$map[$spec]] = true;
            }
            $out = '';
            foreach (array_keys($urls) as $url) {
                $out .= '<link rel="modulepreload" href="' . self::e((string) $url) . '"' . self::nonceAttr($nonce) . '>';
            }
            return $out;
        }

        /** `<link rel="stylesheet" href="{base}/td.css">` + optional nonce. */
        public static function stylesheetTag(?string $nonce = null): string
        {
            return '<link rel="stylesheet" href="' . self::e(self::baseUrl() . '/td.css') . '"' . self::nonceAttr($nonce) . '>';
        }

        private static function nonceAttr(?string $nonce): string
        {
            return $nonce === null || $nonce === '' ? '' : ' nonce="' . self::e($nonce) . '"';
        }

        // --- Escaping / attributes / URLs --------------------------------------------------------------------------

        /** HTML escape for text nodes and double-quoted attribute values. */
        public static function e(string|int|float|null $value): string
        {
            return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }

        /** Attribute names allowed from `attrs` options: `aria-*`, `data-*` or ALLOWED_ATTRS (positive allowlist). */
        public static function safeAttrName(string $name): bool
        {
            $l = strtolower($name);
            if (preg_match('/^(aria|data)-[a-z0-9][a-z0-9._-]*$/', $l)) {
                return true;
            }
            return in_array($l, self::ALLOWED_ATTRS, true);
        }

        /**
         * Render attributes: null/false are skipped, true = bare boolean attribute, the rest is escaped.
         * Names are checked with safeAttrName(); names in $taken (lowercase => true) are skipped and added to it —
         * so `attrs` can never duplicate an attribute the helper already printed.
         * @param array<string,string|int|float|bool|null> $attrs
         * @param array<string,bool> $taken
         */
        public static function attrs(array $attrs, array &$taken = []): string
        {
            return self::renderAttrs($attrs, $taken, false);
        }

        /**
         * @internal The helpers' OWN attributes (values already validated, e.g. href through safeUrl()): same as
         * attrs() without the name blocklist. Never pass caller-supplied attribute names here.
         */
        public static function ownAttrs(array $attrs, array &$taken = []): string
        {
            return self::renderAttrs($attrs, $taken, true);
        }

        private static function renderAttrs(array $attrs, array &$taken, bool $own): string
        {
            $out = '';
            foreach ($attrs as $k => $v) {
                $k = (string) $k;
                $l = strtolower($k);
                if ($v === null || $v === false || isset($taken[$l])) {
                    continue;
                }
                if ($own ? !preg_match('/^[a-z][a-z0-9:._-]*$/', $l) : !self::safeAttrName($k)) {
                    continue;
                }
                if (!is_scalar($v)) {
                    continue;
                }
                $taken[$l] = true;
                $out .= $v === true ? ' ' . $l : ' ' . $l . '="' . self::e((string) $v) . '"';
            }
            return $out;
        }

        /**
         * URL allowlist (same policy as <td-button href>): http:, https:, mailto:, tel:, relative paths and `#…`.
         * Tab/CR/LF and edge whitespace are stripped first (`java\tscript:`). Anything else → ''.
         */
        public static function safeUrl(string $url, bool $allowHttp = false): string
        {
            // Like the browser URL parser: tab/CR/LF removed anywhere, C0 controls + space trimmed at both ends.
            $url = trim((string) preg_replace('/[\t\r\n]+/', '', $url), "\x00..\x20\x7f");
            if ($url === '') {
                return '';
            }
            if (preg_match('/^([A-Za-z][A-Za-z0-9+.\-]*):/', $url, $m)) {
                $scheme = strtolower($m[1]);
                // http: only when the site opts in (Td::allowHttpLinks) — no HTTPS→HTTP downgrade by default
                $ok = in_array($scheme, ['https', 'mailto', 'tel'], true) || ($scheme === 'http' && ($allowHttp || self::$allowHttp));
                return $ok ? $url : '';
            }
            // No scheme: relative, root-relative, protocol-relative, query or fragment. A ':' before any '/', '?'
            // or '#' would be read as a scheme by the browser — refuse it.
            $firstSep = strcspn($url, '/?#');
            return strpos(substr($url, 0, $firstSep), ':') !== false ? '' : $url;
        }

        /**
         * v0.49.0 — port of src/utils/css-safe.js safeColor() (shared cases test/ssr/safe-color.cases.json): a string,
         * trimmed of JS whitespace, at most 64 characters, that is `#rgb[a]` / `#rrggbb[aa]`, an rgb() / rgba() / hsl() /
         * hsla() with numeric arguments only, or a letter-only name (≤ 24). Anything else (url(, var(, calc(, `;`, `"`,
         * non-strings…) → ''. For SVG presentation attributes (`fill`), never an inline style.
         */
        public static function safeColor(mixed $v): string
        {
            if (!is_string($v)) {
                return '';
            }
            $s = (string) preg_replace('/^[' . self::JS_WS . ']+|[' . self::JS_WS . ']+$/u', '', $v);
            if ($s === '' || (int) preg_match_all('/./su', $s) > 64) {
                return '';
            }
            if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iD', $s)
                || preg_match('/^(rgb|rgba|hsl|hsla)\([0-9.,%\/deg' . self::JS_WS . ']+\)$/iuD', $s)
                || (preg_match('/^[a-z]+$/iD', $s) && strlen($s) <= 24)) {
                return $s;
            }
            return '';
        }

        /** Class option → ' tok1 tok2' (valid class tokens only, like the JS CLASS_TOKEN). */
        public static function classTokens(string|array|null $class): string
        {
            $list = is_array($class) ? $class : preg_split('/\s+/', trim((string) $class));
            $ok = [];
            foreach ($list ?: [] as $c) {
                if (is_string($c) && preg_match('/^[A-Za-z_][A-Za-z0-9_-]*$/', $c)) {
                    $ok[] = $c;
                }
            }
            return $ok ? ' ' . implode(' ', array_unique($ok)) : '';
        }

        /** Unique id per request: {prefix}-{n} (prefix reduced to [A-Za-z0-9_-]). */
        public static function uid(string $prefix): string
        {
            $prefix = (string) preg_replace('/[^A-Za-z0-9_-]/', '', $prefix);
            return ($prefix !== '' ? $prefix : 'td') . '-' . (++self::$uid);
        }

        /** Download file name: path separators, reserved and control characters removed, max 200 chars. */
        public static function safeFilename(string $name): string
        {
            $name = (string) preg_replace('/[\/\\\\:*?"<>|\x00-\x1f\x7f]+/u', '', $name);
            $name = trim($name, " .");
            return preg_match('/^.{0,200}/us', $name, $m) ? $m[0] : '';
        }

        // --- Icons -------------------------------------------------------------------------------------------------

        /** @return array<string,array> core definitions from src/icons/icons.json */
        private static function kitIcons(): array
        {
            if (self::$kitIcons === null) {
                $file = self::kitDir() . '/src/icons/icons.json';
                $raw = is_file($file) ? file_get_contents($file) : false;
                if ($raw === false) {
                    throw new RuntimeException('td-components: src/icons/icons.json not found in the kit directory');
                }
                $json = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
                self::$kitIcons = is_array($json['icons'] ?? null) ? $json['icons'] : [];
                self::$kitAliases = null;
                if (is_array($json['aliases'] ?? null)) {
                    self::$kitAliases = [];
                    foreach ($json['aliases'] as $from => $to) {
                        if (is_string($to) && preg_match(self::ICON_NAME, (string) $from) && preg_match(self::ICON_NAME, $to)) {
                            self::$kitAliases[(string) $from] = $to;
                        }
                    }
                }
            }
            return self::$kitIcons;
        }

        /** @return array<string,string> alias => registry name (icons.json `aliases`, else the ALIASES fallback) */
        public static function iconAliases(): array
        {
            self::kitIcons();
            return self::$kitAliases ?? self::ALIASES;
        }

        /**
         * Register site icons (data only, validated like registerIcons() in JS). A name that already exists (core or
         * site) throws — prefix site icons (`site-camera`). Print them for the browser with
         * `json_encode(Td::siteIcons(), Td::JSON_FLAGS)` and call registerIcons() in a module when JS needs them too.
         * @param array<string,array{viewBox?:string,paint?:string,nodes:array}> $defs
         */
        public static function registerIcons(array $defs): void
        {
            $clean = [];
            foreach ($defs as $name => $def) {
                $name = (string) $name;
                if (!preg_match(self::ICON_NAME, $name)) {
                    throw new InvalidArgumentException("Td::registerIcons: invalid icon name \"$name\"");
                }
                if (isset(self::kitIcons()[$name]) || isset(self::$siteIcons[$name]) || isset($clean[$name])) {
                    throw new InvalidArgumentException("Td::registerIcons: icon \"$name\" already exists");
                }
                $clean[$name] = self::validateIcon($name, $def);
            }
            self::$siteIcons += $clean;
        }

        /** @return array<string,array> the icons registered with registerIcons() */
        public static function siteIcons(): array
        {
            return self::$siteIcons;
        }

        public static function hasIcon(string $name): bool
        {
            return self::iconDef($name) !== null;
        }

        private static function validateIcon(string $name, mixed $def): array
        {
            if (!is_array($def)) {
                throw new InvalidArgumentException("icon \"$name\": definition must be an array");
            }
            $viewBox = (string) ($def['viewBox'] ?? '0 0 24 24');
            if (!preg_match(self::ICON_VIEWBOX, $viewBox)) {
                throw new InvalidArgumentException("icon \"$name\": invalid viewBox");
            }
            $paint = $def['paint'] ?? 'stroke';
            if ($paint !== 'stroke' && $paint !== 'fill') {
                throw new InvalidArgumentException("icon \"$name\": paint must be \"stroke\" or \"fill\"");
            }
            $nodes = $def['nodes'] ?? null;
            if (!is_array($nodes) || $nodes === [] || count($nodes) > 64) {
                throw new InvalidArgumentException("icon \"$name\": nodes must be a non-empty array (max 64)");
            }
            $out = [];
            foreach (array_values($nodes) as $i => $node) {
                if (!is_array($node) || count($node) !== 2 || !isset($node[0], $node[1]) || !is_array($node[1])) {
                    throw new InvalidArgumentException("icon \"$name\": node $i must be [tag, attrs]");
                }
                [$tag, $attrs] = $node;
                if (!in_array($tag, self::ICON_TAGS, true)) {
                    throw new InvalidArgumentException("icon \"$name\": tag not allowed");
                }
                $ca = [];
                foreach ($attrs as $k => $v) {
                    $rule = self::ICON_ATTRS[(string) $k] ?? null;
                    $v = is_scalar($v) ? (string) $v : '';
                    if ($rule === null || strlen($v) > 8000 || !preg_match($rule, $v)) {
                        throw new InvalidArgumentException("icon \"$name\": attribute \"$k\" not allowed or invalid");
                    }
                    $ca[(string) $k] = $v;
                }
                $out[] = [$tag, $ca];
            }
            return ['viewBox' => $viewBox, 'paint' => $paint, 'nodes' => $out];
        }

        private static function iconDef(string $name): ?array
        {
            $all = self::kitIcons();
            $aliases = self::iconAliases();
            if (!isset($all[$name]) && !isset(self::$siteIcons[$name]) && isset($aliases[$name])) {
                $name = $aliases[$name];
            }
            $def = $all[$name] ?? self::$siteIcons[$name] ?? null;
            return is_array($def) ? $def + ['_name' => $name] : null;
        }

        /**
         * `svg.td-icon.td-icon--{s|m|l}[data-icon]` — same markup as tdIcon() in JS. Decorative (aria-hidden) unless
         * $label is given (role="img" + aria-label + <title>). Unknown name → ''.
         * v0.26.0: $size may also be an integer 8–128 (px) → `svg.td-icon` + width / height, like tdIcon(name, { size: n })
         * (td_empty's icon slot); any other integer → 'm'.
         */
        public static function icon(string $name, string|int $size = 'm', string $label = '', string $class = ''): string
        {
            $def = self::iconDef($name);
            if ($def === null) {
                return '';
            }
            $px = is_int($size) && $size >= 8 && $size <= 128 ? $size : null;
            $size = in_array($size, ['s', 'm', 'l'], true) ? $size : 'm';
            $label = trim($label);
            $out = '<svg class="td-icon' . ($px === null ? ' td-icon--' . $size : '') . self::e(self::classTokens($class)) . '" data-icon="'
                . self::e($def['_name']) . '" viewBox="' . self::e((string) ($def['viewBox'] ?? '0 0 24 24')) . '"'
                . ($px === null ? '' : ' width="' . $px . '" height="' . $px . '"');
            $out .= ($def['paint'] ?? 'stroke') === 'fill'
                ? ' fill="currentColor"'
                : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
            $out .= $label !== '' ? ' role="img" aria-label="' . self::e($label) . '"' : ' aria-hidden="true"';
            $out .= ' focusable="false">';
            if ($label !== '') {
                $out .= '<title>' . self::e($label) . '</title>';
            }
            foreach (($def['nodes'] ?? []) as $node) {
                if (!is_array($node) || !in_array($node[0] ?? null, self::ICON_TAGS, true) || !is_array($node[1] ?? null)) {
                    continue;
                }
                $out .= '<' . $node[0];
                foreach ($node[1] as $k => $v) {
                    if (isset(self::ICON_ATTRS[(string) $k]) && is_scalar($v)) {
                        $out .= ' ' . $k . '="' . self::e((string) $v) . '"';
                    }
                }
                $out .= '/>';
            }
            return $out . '</svg>';
        }

        // --- Shared option helpers ---------------------------------------------------------------------------------

        /** @internal Normalised E1 native attributes (whitelisted values) from options; invalid values dropped. */
        public static function inputHints(array $o): array
        {
            $out = [];
            if (isset($o['autocomplete']) && is_scalar($o['autocomplete'])) {
                $v = strtolower(trim(preg_replace('/\s+/', ' ', (string) $o['autocomplete'])));
                if ($v !== '' && preg_match('/^[a-z0-9 -]+$/', $v)) {
                    $out['autocomplete'] = $v;
                }
            }
            $enums = [
                'inputmode' => ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
                'enterkeyhint' => ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'],
                'autocapitalize' => ['off', 'none', 'on', 'sentences', 'words', 'characters'],
            ];
            foreach ($enums as $k => $allowed) {
                if (isset($o[$k]) && is_scalar($o[$k]) && in_array(strtolower((string) $o[$k]), $allowed, true)) {
                    $out[$k] = strtolower((string) $o[$k]);
                }
            }
            if (array_key_exists('spellcheck', $o) && $o['spellcheck'] !== null) {
                $s = $o['spellcheck'];
                if ($s === true || $s === 'true') {
                    $out['spellcheck'] = 'true';
                } elseif ($s === false || $s === 'false') {
                    $out['spellcheck'] = 'false';
                }
            }
            if (!empty($o['autofocus'])) {
                $out['autofocus'] = true;
            }
            return $out;
        }

        /** @internal Integer option as a string ('' / invalid → null). */
        public static function intOpt(mixed $v, int $min = 0): ?string
        {
            if ($v === null || $v === '' || !is_numeric($v)) {
                return null;
            }
            $n = (int) $v;
            return $n >= $min ? (string) $n : null;
        }

        /**
         * v0.46.0: the td-diff model (= normalize() of src/utils/diff-model.js) — for tests / apps that need the counts.
         * $input: ['items' => [...]] or ['before' => json|stdClass|array|null, 'after' => …, 'fields' => [...]] (snapshot
         * JSON strings are decoded like td_diff_snapshots()). $o: labels, json (bool).
         * @return array{rows: array, counts: array, notes: array, json: ?array}
         */
        public static function diffModel(array $input, array $o = []): array
        {
            $L = td__diff_labels($o['labels'] ?? null);
            if (!array_key_exists('items', $input)) {
                $input['decode'] = true;
            }
            return td__diff_model($input, $L, !empty($o['json']), 'Td::diffModel');
        }
    }
}

namespace {

    use TdComponents\Td;

    /** @return array<string,string> kit import map entries (+ $extra). See Td::importMap(). */
    function td_import_map(array $extra = []): array
    {
        return Td::importMap($extra);
    }

    function td_import_map_tag(array $extra = [], ?string $nonce = null): string
    {
        return Td::importMapTag($extra, $nonce);
    }

    function td_stylesheet_tag(?string $nonce = null): string
    {
        return Td::stylesheetTag($nonce);
    }

    function td_icon(string $name, string $size = 'm', string $label = ''): string
    {
        return Td::icon($name, $size, $label);
    }

    /**
     * Standalone native button (`button.td-btn…`), or `a.td-btn…` when `href` is given (E3 link contract).
     * Options: variant primary|secondary|success|danger|info|warning|ghost (default secondary — 135 compatible),
     * size sm|md|lg (xs → sm), icon, icon_position left|right, type button|submit|reset, name, value, disabled,
     * loading, full_width, aria_label, tooltip, id, class, attrs; link only: href, target, download.
     * v0.25.0 `element` (bool, default Td::configure ssr_elements = false): print the `<td-button
     * data-td-ssr="button@1">` host + the exact control <td-button> renders (works without JS; hydrated in place by
     * `@dazzxq/td-components/button` — no flash). id / class then go on the host; see the projection table in
     * docs/guides/php-adapter.md.
     */
    function td_button(string $label, array $o = []): string
    {
        return td__button($label, $o, false);
    }

    /**
     * @internal td_button / td_link. $bare (td_link `bare => true` only, v0.18.0 F7): a plain `<a>` — no `td-btn…`
     * classes and no button children (icon / label span / spinner), only the site's `class`; same URL allowlist,
     * target, rel, download, disabled (→ no href) as the button link. variant/size/full_width/icon/loading are ignored.
     */
    function td__button(string $label, array $o, bool $bare): string
    {
        $variant = in_array($o['variant'] ?? null, Td::VARIANTS, true) ? $o['variant'] : 'secondary';
        $size = ($o['size'] ?? 'md') === 'xs' ? 'sm' : (in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md');
        $isLink = array_key_exists('href', $o) && $o['href'] !== null;
        $bare = $bare && $isLink;
        $loading = !$bare && !empty($o['loading']);
        $disabled = !empty($o['disabled']);
        $class = $bare
            ? (ltrim(Td::classTokens($o['class'] ?? null)) ?: null)
            : 'td-btn td-btn--' . $variant . ' td-btn--' . $size . (!empty($o['full_width']) ? ' td-btn--full' : '')
                . Td::classTokens($o['class'] ?? null);
        $tooltip = isset($o['tooltip']) && is_scalar($o['tooltip']) && (string) $o['tooltip'] !== '' ? (string) $o['tooltip'] : null;
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;

        if ($isLink) {
            $href = Td::safeUrl((string) $o['href']);
            $target = in_array($o['target'] ?? null, Td::TARGETS, true) ? $o['target'] : null;
            $download = null;
            if (($o['download'] ?? null) === true) {
                $download = true;
            } elseif (isset($o['download']) && is_string($o['download'])) {
                $download = Td::safeFilename($o['download']);
                $download = $download === '' ? true : $download;
            }
            // E3: disabled/loading links have no href; a REJECTED href makes the link disabled too (like <td-button href>)
            $rejected = $href === '';
            $inert = $disabled || $loading || $rejected;
            $attrs = [
                'class' => $class,
                'href' => !$inert && $href !== '' ? $href : null,
                'target' => $target,
                'rel' => $target === '_blank' ? 'noopener noreferrer' : null,
                'download' => $download,
                'id' => $o['id'] ?? null,
                'role' => $inert ? 'link' : null, // an <a> without href has no link role of its own
                'aria-disabled' => $inert ? 'true' : null,
                'aria-busy' => $loading ? 'true' : null,
                'tabindex' => ($disabled || $rejected) ? '-1' : ($loading ? '0' : null),
                'aria-label' => $aria,
                'data-tooltip' => $tooltip,
            ];
            $tag = 'a';
        } else {
            $type = in_array($o['type'] ?? null, ['button', 'submit', 'reset'], true) ? $o['type'] : 'button';
            $attrs = [
                'class' => $class,
                'type' => $type,
                'id' => $o['id'] ?? null,
                'name' => isset($o['name']) && is_scalar($o['name']) && (string) $o['name'] !== '' ? (string) $o['name'] : null,
                'value' => isset($o['value']) && is_scalar($o['value']) ? (string) $o['value'] : null,
                // Loading keeps the component contract (aria-busy + aria-disabled) AND is natively disabled: without
                // JS nothing else would stop a second submit.
                'disabled' => $disabled || $loading,
                'aria-busy' => $loading ? 'true' : null,
                'aria-disabled' => $loading ? 'true' : null,
                'aria-label' => $aria,
                'data-tooltip' => $tooltip,
            ];
            $tag = 'button';
        }
        // v0.25.0 element mode (ADR 0012): per call `element` (true/false) overrides Td::configure ssr_elements.
        // Never for a bare link (no component contract).
        $element = !$bare && (array_key_exists('element', $o) && $o['element'] !== null ? (bool) $o['element'] : Td::ssrElements());
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = [];
        $lift = [];
        if ($element) {
            // The control carries only kit classes; id / site class belong to the host (component API).
            $attrs['id'] = null;
            $attrs['class'] = 'td-btn td-btn--' . $variant . ' td-btn--' . $size . (!empty($o['full_width']) ? ' td-btn--full' : '');
            // aria-label / ARIA state from `attrs` is lifted to the host (the component forwards it to the control);
            // forwarded ARIA goes through the component's own whitelist so the control is the same before / after.
            $lift = td__button_lift($extra);
            $attrs['aria-label'] = $aria ?? ($lift['aria-label'] ?? null);
            foreach ($extra as $k => $v) {
                $l = strtolower((string) $k);
                if (in_array($l, ['aria-label', 'aria-pressed', 'aria-expanded', 'aria-haspopup', 'aria-controls'], true)) {
                    unset($extra[$k]);
                }
            }
            foreach (['aria-pressed', 'aria-expanded', 'aria-haspopup', 'aria-controls'] as $a) {
                if (isset($lift[$a])) {
                    $extra[$a] = $lift[$a];
                }
            }
            // Review round 1 (IMPL-1): EVERY name the component owns is reserved, even when its value is false / null —
            // an `attrs` entry can never put state (disabled, aria-busy…) on the control that hydrate would then undo.
            // Exception: tabindex / role on a link that is not inert stay genuine pass-through (restored by the
            // component when its state clears).
        }
        $html = '<' . $tag . Td::ownAttrs($attrs, $taken);
        if ($element) {
            // Review round 2: `data-td-*` is the kit's internal namespace (icon slots…) — never passed to the control.
            // Names are case-insensitive in HTML and Td::attrs() keys $taken in lower case → normalise first
            // (review round 3: `DATA-TD-ICON` must not slip through).
            foreach (array_keys($extra) as $k) {
                $l = strtolower((string) $k);
                if (strncmp($l, 'data-td-', 8) === 0) {
                    $taken[$l] = true;
                }
            }
            foreach (array_keys($attrs) as $k) {
                $l = strtolower((string) $k);
                if ($isLink && in_array($l, ['tabindex', 'role'], true) && $attrs[$k] === null) {
                    continue;
                }
                $taken[$l] = true;
            }
        }
        $html .= Td::attrs($extra, $taken) . '>';
        if ($bare) {
            return $html . Td::e($label) . '</a>';
        }
        $icon = '';
        $iconName = null;
        if (!empty($o['icon']) && is_string($o['icon'])) {
            $svg = Td::icon($o['icon'], 's');
            if ($svg !== '') {
                $iconName = $o['icon'];
                // element mode: the exact slot <td-button> renders (data-td-icon + size), already filled
                $icon = $element
                    ? '<span class="td-btn__icon" data-td-icon="' . Td::e($iconName) . '" data-td-icon-size="s" aria-hidden="true">' . $svg . '</span>'
                    : '<span class="td-btn__icon" aria-hidden="true">' . $svg . '</span>';
            }
        }
        $right = ($o['icon_position'] ?? 'left') === 'right';
        $text = $label !== '' ? '<span class="td-btn__label">' . Td::e($label) . '</span>' : '';
        $html .= $right ? $text . $icon : $icon . $text;
        $html .= '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true"' . ($loading ? '' : ' hidden') . '>'
            . '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
            . '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
            . '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
        $html .= '</' . $tag . '>';
        if (!$element) {
            return $html;
        }
        // Host attributes (projection table, docs/guides/php-adapter.md): explicit values (PHP default variant
        // `secondary` ≠ JS default `primary`), state the JS component reads on hydrate.
        $hostAttrs = [
            'id' => $o['id'] ?? null,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'data-td-ssr' => Td::SSR_BUTTON,
            'variant' => $variant,
            'size' => $size,
            'full-width' => !empty($o['full_width']),
            'icon' => $iconName,
            'icon-position' => $iconName !== null && $right ? 'right' : null,
            'label' => $label !== '' ? $label : null,
        ];
        if ($isLink) {
            // a rejected URL keeps link mode with an empty href (the component renders it inert, like the control)
            $hostAttrs += ['href' => $href, 'target' => $target, 'download' => $download];
        } else {
            $hostAttrs += ['type' => $attrs['type'], 'name' => $attrs['name'], 'value' => $attrs['value']];
        }
        $hostAttrs += [
            'disabled' => $disabled,
            'loading' => $loading,
            'aria-label' => $attrs['aria-label'],
            'aria-pressed' => $lift['aria-pressed'] ?? null,
            'aria-expanded' => $lift['aria-expanded'] ?? null,
            'aria-haspopup' => $lift['aria-haspopup'] ?? null,
            'aria-controls' => $lift['aria-controls'] ?? null,
        ];
        $hostTaken = [];
        return '<td-button' . Td::ownAttrs($hostAttrs, $hostTaken) . '>' . $html . '</td-button>';
    }

    /**
     * @internal Element mode: aria-label / forwarded ARIA from `attrs` (first spelling wins, case-insensitive), with the
     * whitelist of <td-button> (FORWARDED_ARIA in src/form/td-button.js): enumerated values trimmed + lower-cased, an
     * IDREF list kept verbatim unless blank; anything else dropped.
     * @return array<string,string>
     */
    function td__button_lift(array $extra): array
    {
        $enums = [
            'aria-pressed' => ['true', 'false', 'mixed'],
            'aria-expanded' => ['true', 'false'],
            'aria-haspopup' => ['true', 'false', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
        ];
        $out = [];
        foreach ($extra as $k => $v) {
            $l = strtolower((string) $k);
            if (isset($out[$l]) || !is_scalar($v) || is_bool($v)) {
                continue;
            }
            $v = (string) $v;
            if ($l === 'aria-label' && $v !== '') {
                $out[$l] = $v;
            } elseif ($l === 'aria-controls' && trim($v) !== '') {
                $out[$l] = $v;
            } elseif (isset($enums[$l]) && in_array(strtolower(trim($v)), $enums[$l], true)) {
                $out[$l] = strtolower(trim($v));
            }
        }
        return $out;
    }

    /**
     * Link styled as a button: td_button() with `href` (variant default ghost). Options as td_button + target,
     * download. 135 compatible signature. `bare => true` (v0.18.0 F7): a plain `<a>` with only the site's `class`
     * (no `td-btn…` classes, no button children) — same URL allowlist / target / rel / download / disabled.
     */
    function td_link(string $label, string $href, array $o = []): string
    {
        $o['href'] = $href;
        $o['variant'] = in_array($o['variant'] ?? null, Td::VARIANTS, true) ? $o['variant'] : 'ghost';
        return td__button($label, $o, !empty($o['bare']));
    }

    /**
     * v0.36.0 — icon-only action button with a preset (dcms2 `ActionButtons`): `button.td-btn.td-btn--action…` with
     * `aria-label` + `data-tooltip` = the name, or `a.td-btn…` with `href`. $action = preset key (Td::ACTION_PRESETS;
     * dcms camelCase accepted: `sendToPublish`). Options: label (overrides the preset label), icon (registry name),
     * tone standard|warning|danger, size sm|md|lg, disabled, href, target, aria_label (name: aria_label > label >
     * preset), id, class, attrs (Td::ALLOWED_ATTRS + aria-* / data-*; owned names and data-td-* dropped), element
     * (default Td::configure ssr_elements): the `<td-action-button data-td-ssr="action-button@1">` host + the exact
     * control <td-action-button> renders (hydrated in place). An action that is neither a preset nor given icon + label
     * → '' + one E_USER_WARNING. A site preset registered only in JS must pass icon + label here.
     */
    function td_action_button(string $action, array $o = []): string
    {
        $trim = static fn (string $s): string => (string) preg_replace('/^[' . Td::JS_WS . ']+|[' . Td::JS_WS . ']+$/u', '', $s);
        $action = $trim($action);
        $key = strtolower((string) preg_replace('/([a-z0-9])([A-Z])/', '$1-$2', $action));
        $preset = preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $key) && isset(Td::ACTION_PRESETS[$key]) ? Td::ACTION_PRESETS[$key] : null;
        $ownIcon = isset($o['icon']) && is_string($o['icon']) ? $trim($o['icon']) : '';
        $ownIcon = $ownIcon !== '' && Td::hasIcon($ownIcon) ? $ownIcon : '';
        $icon = $ownIcon !== '' ? $ownIcon : ($preset !== null && Td::hasIcon($preset[0]) ? $preset[0] : '');
        $ownLabel = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) ? $trim((string) $o['label']) : '';
        $label = $ownLabel !== '' ? $ownLabel : ($preset[1] ?? '');
        if ($icon === '' || $label === '') {
            // SEC-02 / ISSUE-9 (v0.36.0 review): never log the raw value — a printable-ASCII allowlist (0x20–0x7E; every
            // other byte, incl. U+2028 / U+2029 and all non-ASCII, dropped), `\` and `"` escaped, at most 64 characters,
            // plus the original byte length → always one line, nothing the log can mistake for structure
            $shown = substr((string) preg_replace('/[^\x20-\x7E]/', '', $action), 0, 64);
            $shown = addcslashes($shown, '\\"');
            trigger_error('td_action_button: unknown action "' . $shown . '" (' . strlen($action) . ' bytes; no preset; give icon + label)', E_USER_WARNING);
            return '';
        }
        $ownTone = in_array($o['tone'] ?? null, Td::ACTION_TONES, true) ? $o['tone'] : null;
        $tone = $ownTone ?? (in_array($preset[2] ?? null, Td::ACTION_TONES, true) ? $preset[2] : 'standard');
        $ownSize = in_array($o['size'] ?? null, Td::ACTION_SIZES, true) ? $o['size'] : null;
        $size = $ownSize ?? 'md';
        $element = td__element($o);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $lift = td__button_lift($extra);
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && !is_bool($o['aria_label']) ? $trim((string) $o['aria_label']) : '';
        $aria = $aria !== '' ? $aria : $trim($lift['aria-label'] ?? '');
        $name = $aria !== '' ? $aria : $label;
        $disabled = !empty($o['disabled']);
        $isLink = array_key_exists('href', $o) && $o['href'] !== null;
        $class = 'td-btn td-btn--action td-btn--action-' . $tone . ' td-btn--action-' . $size;
        $site = $element ? ['id' => null, 'class' => ''] : ['id' => td__str($o['id'] ?? null), 'class' => Td::classTokens($o['class'] ?? null)];
        if ($isLink) {
            $href = Td::safeUrl((string) $o['href']);
            $target = in_array($o['target'] ?? null, Td::TARGETS, true) ? $o['target'] : null;
            $inert = $disabled || $href === '';
            $attrs = [
                'class' => $class . $site['class'],
                'href' => $inert ? null : $href,
                'target' => $target,
                'rel' => $target === '_blank' ? 'noopener noreferrer' : null,
                'id' => $site['id'],
                'role' => $inert ? 'link' : null,
                'aria-disabled' => $inert ? 'true' : null,
                'tabindex' => $inert ? '-1' : null,
            ];
            $tag = 'a';
        } else {
            $attrs = ['class' => $class . $site['class'], 'type' => 'button', 'id' => $site['id'], 'disabled' => $disabled];
            $tag = 'button';
        }
        $attrs += ['aria-label' => $name, 'data-tooltip' => $name];
        $forwarded = ['aria-pressed', 'aria-expanded', 'aria-haspopup', 'aria-controls'];
        $owned = ['class', 'type', 'id', 'name', 'value', 'disabled', 'aria-busy', 'aria-disabled', 'aria-label', 'data-tooltip',
            'href', 'target', 'rel', 'download', 'role', 'tabindex'];
        if ($element) {
            // forwarded ARIA goes through the component whitelist (host + control identical before / after hydrate)
            foreach ($extra as $k => $v) {
                if (in_array(strtolower((string) $k), $forwarded, true)) {
                    unset($extra[$k]);
                }
            }
            foreach ($forwarded as $a) {
                if (isset($lift[$a])) {
                    $attrs[$a] = $lift[$a];
                }
            }
        }
        $taken = [];
        $html = '<' . $tag . Td::ownAttrs($attrs, $taken);
        $taken = td__reserve($owned, $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '>';
        $svg = Td::icon($icon, 's');
        $html .= $element
            ? '<span class="td-btn__icon" data-td-icon="' . Td::e($icon) . '" data-td-icon-size="s" aria-hidden="true">' . $svg . '</span>'
            : '<span class="td-btn__icon" aria-hidden="true">' . $svg . '</span>';
        $html .= '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>'
            . '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
            . '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
            . '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
        $html .= '</' . $tag . '>';
        if (!$element) {
            return $html;
        }
        $hostAttrs = [
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'data-td-ssr' => Td::SSR_ACTION_BUTTON,
            'action' => $action !== '' ? $action : null,
            'label' => $ownLabel !== '' ? $ownLabel : null,
            'icon' => $ownIcon !== '' ? $ownIcon : null,
            'tone' => $ownTone,
            'size' => $ownSize,
        ];
        if ($isLink) {
            $hostAttrs += ['href' => $href, 'target' => $target];
        }
        $hostAttrs += ['disabled' => $disabled, 'aria-label' => $aria !== '' ? $aria : null];
        foreach ($forwarded as $a) {
            $hostAttrs[$a] = $lift[$a] ?? null;
        }
        $hostTaken = [];
        return '<td-action-button' . Td::ownAttrs($hostAttrs, $hostTaken) . '>' . $html . '</td-action-button>';
    }

    /**
     * Standalone native field `.td-field` + `input|textarea.td-field__control` (native validation, no JS).
     * Options: label, type (text|password|email|number|date|month|datetime-local|time|search|url|tel|textarea),
     * size sm|md|lg, placeholder, hint (helper text), error, required, disabled, readonly, max_length, minlength,
     * pattern, min, max, step, rows, autocomplete, inputmode, enterkeyhint, autocapitalize, spellcheck, autofocus,
     * id (wrapper id; control = {id}-control), class (wrapper), attrs (control).
     * v0.26.0 `element` (bool, default Td::configure ssr_elements = false): print the `<td-input-field
     * data-td-ssr="input-field@1">` host + the exact markup <td-input-field> renders, with the native control keeping
     * name / value / constraints / autocomplete (works without JS; hydrated in place — no flash). `id` is then the
     * CONTROL id (`field-id`; host = {id}-host), class goes on the host; see docs/guides/php-adapter.md.
     */
    function td_field(string $name, string $value = '', array $o = []): string
    {
        if (td__element($o)) {
            return td__field_element($name, $value, $o);
        }
        $types = ['text', 'password', 'email', 'number', 'date', 'month', 'datetime-local', 'time', 'search', 'url', 'tel', 'textarea'];
        $type = in_array($o['type'] ?? null, $types, true) ? $o['type'] : 'text';
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $id = isset($o['id']) && is_scalar($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : Td::uid('f-' . $name);
        $hint = (string) ($o['hint'] ?? '');
        $error = (string) ($o['error'] ?? '');
        $required = !empty($o['required']);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        // E1 native hints passed through `attrs` (135 style) are whitelisted like the options; options win.
        $hintKeys = ['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'autofocus'];
        $hintSrc = $o;
        foreach ($extra as $k => $v) {
            $l = strtolower((string) $k);
            if (in_array($l, $hintKeys, true)) {
                if (!array_key_exists($l, $hintSrc)) {
                    $hintSrc[$l] = $l === 'autofocus' ? ($v !== false && $v !== null) : $v;
                }
                unset($extra[$k]);
            }
        }
        $hints = Td::inputHints($hintSrc);
        $desc = trim(($hint !== '' ? "$id-note " : '') . ($error !== '' ? "$id-error" : ''));
        $ctl = [
            'class' => 'td-field__control',
            'id' => "$id-control",
            'name' => $name !== '' ? $name : null,
            'placeholder' => isset($o['placeholder']) && (string) $o['placeholder'] !== '' ? (string) $o['placeholder'] : null,
            'required' => $required,
            'aria-required' => $required ? 'true' : null,
            'disabled' => !empty($o['disabled']),
            'readonly' => !empty($o['readonly']),
            'maxlength' => Td::intOpt($o['max_length'] ?? $o['maxlength'] ?? null, 1),
            'minlength' => Td::intOpt($o['minlength'] ?? null, 1),
            'pattern' => isset($o['pattern']) && (string) $o['pattern'] !== '' ? (string) $o['pattern'] : null,
            'min' => isset($o['min']) && (string) $o['min'] !== '' ? (string) $o['min'] : null,
            'max' => isset($o['max']) && (string) $o['max'] !== '' ? (string) $o['max'] : null,
            'step' => isset($o['step']) && (string) $o['step'] !== '' ? (string) $o['step'] : null,
        ] + $hints + [
            'aria-describedby' => $desc !== '' ? $desc : null,
            'aria-invalid' => $error !== '' ? 'true' : null,
            'aria-errormessage' => $error !== '' ? "$id-error" : null,
        ];
        $taken = [];
        if ($type === 'textarea') {
            $ctl['rows'] = Td::intOpt($o['rows'] ?? null, 1) ?? '3';
            $control = '<textarea' . Td::ownAttrs($ctl, $taken) . Td::attrs($extra, $taken) . '>'
                . "\n" . Td::e($value) . '</textarea>'; // the parser drops ONE leading newline: keep the value's own
        } else {
            $control = '<input' . Td::ownAttrs(['type' => $type] + $ctl + ['value' => $value], $taken) . Td::attrs($extra, $taken) . '>';
        }
        $label = isset($o['label']) && (string) $o['label'] !== ''
            ? '<label class="td-field__label" id="' . Td::e($id) . '-label" for="' . Td::e($id) . '-control">' . Td::e((string) $o['label'])
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>'
            : '';
        $footer = '';
        if ($error !== '') {
            $footer .= '<span class="td-field-error" id="' . Td::e($id) . '-error" data-for="' . Td::e($id) . '">' . Td::e($error) . '</span>';
        }
        // The note is always present (hidden when empty) — same footer tree as <td-input-field>.
        $footer .= '<div class="td-field__note" id="' . Td::e($id) . '-note"' . ($hint === '' ? ' hidden' : '') . '>' . Td::e($hint) . '</div>';
        return '<div class="td-field td-field--' . $size . ($type === 'textarea' ? ' td-field--textarea' : '')
            . Td::e(Td::classTokens($o['class'] ?? null)) . '" id="' . Td::e($id) . '">'
            . $label . $control . '<div class="td-field__footer"' . ($hint === '' && $error === '' ? ' hidden' : '') . '>' . $footer . '</div></div>';
    }

    /**
     * `<td-dropdown>` host wrapping a native `<select>` (works without JS; upgraded by the dropdown module — E2).
     * $options: value => label, or a list of ['value' => …, 'label' => …, 'disabled' => bool].
     * Options: label, placeholder (⇒ an empty first option + the component's clear option), searchable
     * (absent / null = auto when > 8 options; false, 0 and the strings 'false' / '0' / 'off' / 'no' / '' — trimmed,
     * any case — turn it off; anything else keeps PHP truthiness: true, 1, '1', 'true', 'yes', 'on'… → on), required, disabled, aria_label, id (host; select = {id}-select), class,
     * create_label (v0.22.0 → `create-label`: the "add new" action row, only with JS), attrs (host).
     * v0.26.0 `element` (bool, default Td::configure ssr_elements = false): the same markup + `data-td-ssr="dropdown@1"`
     * on the host + `class="td-dropdown__native"` on the select — td.css styles the select to the exact trigger box (native
     * arrow kept), so the upgrade to the trigger moves nothing (no layout shift); a select focused when the module loads
     * is upgraded on its blur. `attrs` then never sets a name the component reads from the host (required, disabled,
     * name, value, label, placeholder…; use the options) nor `data-td-*`; an `attrs` aria-label names the select.
     */
    function td_dropdown(string $name, array $options, string|int|null $value = '', array $o = []): string
    {
        $list = [];
        foreach ($options as $k => $v) {
            if (is_array($v)) {
                if (!isset($v['value']) || !is_scalar($v['value'])) {
                    continue;
                }
                $list[] = ['value' => (string) $v['value'], 'label' => (string) ($v['label'] ?? $v['value']), 'disabled' => !empty($v['disabled'])];
            } elseif (is_scalar($v)) {
                $list[] = ['value' => (string) $k, 'label' => (string) $v, 'disabled' => false];
            }
        }
        $id = isset($o['id']) && is_scalar($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : Td::uid('dd-' . $name);
        $placeholder = isset($o['placeholder']) && (string) $o['placeholder'] !== '' ? (string) $o['placeholder'] : null;
        $searchable = td__searchable($o['searchable'] ?? null, count($list));
        $label = isset($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $required = !empty($o['required']);
        $host = [
            'id' => $id,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'label' => $label,
            'placeholder' => $placeholder,
            'searchable' => $searchable ? null : 'false',
            // A placeholder means "may be left empty" → the component's clear option.
            'allow-clear' => $placeholder !== null ? null : 'false',
            // v0.22.0: fixed "add new" action row at the bottom of the menu (fires `create` { query }).
            'create-label' => isset($o['create_label']) && is_scalar($o['create_label']) && (string) $o['create_label'] !== ''
                ? (string) $o['create_label'] : null,
        ];
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $aria = isset($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;
        // v0.26.0 element mode (contract dropdown@1): the SAME markup + the marker on the host + the shell class on the
        // select (styled to the trigger box — no layout shift on upgrade). Names the component reads from the host are
        // reserved in `attrs` (any case) with the kit's data-td-* namespace; an `attrs` aria-label names the select.
        $element = td__element($o);
        $taken = [];
        if ($element) {
            $host = ['data-td-ssr' => Td::SSR_DROPDOWN] + $host;
        }
        $html = '<td-dropdown' . Td::ownAttrs($host, $taken);
        if ($element) {
            foreach ($extra as $k => $v) {
                if (strtolower((string) $k) === 'aria-label') {
                    $aria ??= td__str($v);
                }
            }
            $taken = td__reserve(['id', 'class', 'label', 'placeholder', 'searchable', 'allow-clear', 'create-label', 'name',
                'value', 'required', 'disabled', 'aria-label', 'aria-labelledby', 'value-key', 'label-key', 'max-height',
                'error-text'], $extra, $taken);
        }
        $html .= Td::attrs($extra, $taken) . '>';
        // Visible label for the no-JS select; the upgrade re-renders the host (its own label from `label`).
        if ($label !== null) {
            $html .= '<label class="td-field__label" for="' . Td::e($id) . '-select">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>';
        }
        $html .= '<select' . Td::ownAttrs([
            'class' => $element ? 'td-dropdown__native' : null,
            'id' => "$id-select",
            'name' => $name !== '' ? $name : null,
            'required' => $required,
            'disabled' => !empty($o['disabled']),
            'aria-label' => $aria,
        ]) . '>';
        $current = $value === null ? '' : (string) $value;
        if ($placeholder !== null) {
            $html .= '<option value="">' . Td::e($placeholder) . '</option>';
        }
        foreach ($list as $opt) {
            $html .= '<option value="' . Td::e($opt['value']) . '"'
                . ($current !== '' && $opt['value'] === $current ? ' selected' : '')
                . ($opt['disabled'] ? ' disabled' : '') . '>' . Td::e($opt['label']) . '</option>';
        }
        return $html . '</select></td-dropdown>';
    }

    /**
     * v0.28.0 multi-select. Default: a NATIVE `<select multiple>` that works without JS — `div.td-multiselect` >
     * [`label.td-field__label`] + `select.td-multiselect__native` (name verbatim: use `roles[]` for a PHP array; every
     * selected, enabled option is submitted). `element` (bool, default Td::configure ssr_elements = false):
     * `<td-chip-input data-td-ssr="chip-input@1" selection-only …>` + [label] + the same select with
     * `class="td-chip-input__native"` (styled to at least the chip box height), upgraded by <td-chip-input> (options,
     * groups, live selection, name / required / disabled / aria-label taken from the select; focused → upgraded on blur).
     * $options: value => label, or a list of ['value' => …, 'label' => …, 'disabled' => bool, 'description' => …];
     * a group is ['label' => …, 'disabled' => bool, 'options' => [same leaf shapes]] → `<optgroup>` (one level).
     * $selected: the selected values (compared as strings). Options: label, id (host / wrapper; select = {id}-select),
     * class, required, disabled, aria_label (names the select), size (rows of the native list, default 4); element mode
     * only: placeholder, select_all (bool), max_items (int), close_on_select (bool). attrs → the host / wrapper
     * (allowlisted; element mode: names the component reads and data-td-* are reserved).
     */
    function td_multiselect(string $name, array $options, array $selected = [], array $o = []): string
    {
        $sel = [];
        foreach ($selected as $v) {
            if (is_scalar($v) && !is_bool($v)) {
                $sel[(string) $v] = true;
            }
        }
        $element = td__element($o);
        $id = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $label = td__str($o['label'] ?? null);
        $required = !empty($o['required']);
        $aria = td__str($o['aria_label'] ?? null);
        $taken = [];
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        if ($element) {
            $html = '<td-chip-input' . Td::ownAttrs([
                'data-td-ssr' => Td::SSR_CHIP_INPUT,
                'id' => $id,
                'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
                'label' => $label,
                'placeholder' => td__str($o['placeholder'] ?? null),
                'selection-only' => true,
                'select-all' => !empty($o['select_all']),
                'max-items' => Td::intOpt($o['max_items'] ?? null, 1),
                'close-on-select' => !empty($o['close_on_select']),
            ], $taken);
            $taken = td__reserve(['id', 'class', 'label', 'placeholder', 'selection-only', 'select-all', 'max-items',
                'close-on-select', 'name', 'value', 'required', 'disabled', 'aria-label', 'aria-labelledby', 'value-key',
                'label-key', 'min-chars', 'search-delay', 'allow-create', 'show-on-focus', 'max-length', 'error-text'],
                $extra, $taken);
        } else {
            $html = '<div' . Td::ownAttrs(['class' => 'td-multiselect' . Td::classTokens($o['class'] ?? null), 'id' => $id], $taken);
        }
        $html .= Td::attrs($extra, $taken) . '>';
        if ($label !== null) {
            $html .= '<label class="td-field__label" for="' . Td::e($id) . '-select">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>';
        }
        $html .= '<select' . Td::ownAttrs([
            'class' => $element ? 'td-chip-input__native' : 'td-multiselect__native',
            'id' => "$id-select",
            'name' => $name !== '' ? $name : null,
            'multiple' => true,
            'size' => Td::intOpt($o['size'] ?? null, 1) ?? '4',
            'required' => $required,
            'disabled' => !empty($o['disabled']),
            'aria-label' => $aria,
        ]) . '>';
        foreach ($options as $k => $v) {
            if (is_array($v) && !isset($v['value']) && isset($v['options']) && is_array($v['options'])) {
                $inner = '';
                foreach ($v['options'] as $ik => $iv) {
                    $inner .= td__ms_option($ik, $iv, $sel);
                }
                $html .= '<optgroup' . Td::ownAttrs([
                    'label' => td__str($v['label'] ?? null) ?? '',
                    'disabled' => !empty($v['disabled']),
                ]) . '>' . $inner . '</optgroup>';
            } else {
                $html .= td__ms_option($k, $v, $sel);
            }
        }
        return $html . '</select>' . ($element ? '</td-chip-input>' : '</div>');
    }

    /**
     * @internal One td_multiselect leaf → `<option>` ('' for anything that is not a leaf: a nested group, no value).
     * @param array<string,bool> $sel selected values
     */
    function td__ms_option(int|string $k, mixed $v, array $sel): string
    {
        if (is_array($v)) {
            if (!isset($v['value']) || !is_scalar($v['value']) || is_bool($v['value'])) {
                return '';
            }
            $value = (string) $v['value'];
            $label = isset($v['label']) && is_scalar($v['label']) ? (string) $v['label'] : $value;
            $disabled = !empty($v['disabled']);
            $desc = td__str($v['description'] ?? null);
        } elseif (is_scalar($v) && !is_bool($v)) {
            $value = (string) $k;
            $label = (string) $v;
            $disabled = false;
            $desc = null;
        } else {
            return '';
        }
        return '<option' . Td::ownAttrs([
            'value' => $value,
            'selected' => isset($sel[$value]),
            'disabled' => $disabled,
            'data-description' => $desc,
        ]) . '>' . Td::e($label) . '</option>';
    }

    /**
     * v0.29.0 tree select (plan v0.29.0-tree M8). A native `<select>` that works without JS, inside `<td-tree-select>`
     * (upgraded by `@dazzxq/td-components/tree-select`): options in PREORDER, the indent is NBSP at the start of the
     * text (2 per level — never a dash in the label) + `data-level` + `data-label` (clean label) + `data-description`.
     * $tree: nodes ['value' => string|int|float, 'label' => …, 'children' => [...], 'disabled' => bool, 'description' => …];
     * walked iteratively, depth ≤ 16; a value that is '' / null / an array / a bool (or a node that is not an array)
     * drops the node WITH its branch; a duplicate value drops the later node (one E_USER_WARNING per call for all of
     * it). $selected: a value or a list of values (same rules; single keeps the first; cascade keeps leaves).
     * Options: multiple, cascade (multiple only: parent options are `disabled data-native-only` — without JS only leaves
     * are chosen), placeholder (single: a first value="" option + `allow-clear`, not with a locked selection; multiple:
     * the empty trigger text only), label, required, disabled, disable_subtree (values → the node and its whole branch
     * locked: the "choose a parent" anti-cycle rule), display ('path'), size (native multiple rows, default 8), id (host;
     * select = {id}-select), class, aria_label (names the select), attrs (host; the names the component reads and
     * data-td-* are reserved; an `attrs` aria-label names the select), element.
     * Locks (M3: a locked selected value is still submitted, exactly once): every locked option carries `data-locked`;
     * single with a locked selection → that option `selected` and ENABLED, every other option `disabled
     * data-native-only`, no empty option; multiple → locked selected options are `disabled selected` + ONE
     * `<input type="hidden" class="td-tree-select__locked">` per value, and the select loses `required` (the host keeps
     * it); a `disabled` control disables those inputs too. The server must still enforce its own permissions.
     * `element` (bool, default Td::configure ssr_elements = false): `data-td-ssr="tree-select@1"` on the host, no `size`
     * (td.css gives the select the exact trigger box, single AND multiple — no layout shift on upgrade) and
     * `value-label` / `value-labels` (labels of the selected values, shown until a lazy branch resolves them).
     */
    function td_tree_select(string $name, array $tree, string|int|array|null $selected = null, array $o = []): string
    {
        $multiple = !empty($o['multiple']);
        $cascade = $multiple && !empty($o['cascade']);
        $subtree = [];
        foreach (is_array($o['disable_subtree'] ?? null) ? $o['disable_subtree'] : [] as $v) {
            $sv = td__tree_value($v);
            if ($sv !== null) {
                $subtree[$sv] = true;
            }
        }
        // Flatten (preorder, iterative): [value, label, level, locked, description]
        $rows = [];
        $seen = [];
        $bad = 0;
        // review round 1 (S-01): each frame holds its items as a LIST (array_values once, on push) + an index — no
        // per-node array_keys() (that made a wide level quadratic)
        $stack = [[array_values($tree), 0, 0, false]];
        while ($stack) {
            $top = count($stack) - 1;
            $i = $stack[$top][1];
            if ($i >= count($stack[$top][0])) {
                array_pop($stack);
                continue;
            }
            $stack[$top][1] = $i + 1;
            $item = $stack[$top][0][$i];
            $level = $stack[$top][2];
            $plocked = $stack[$top][3];
            $value = is_array($item) ? td__tree_value($item['value'] ?? null) : null;
            if ($value === null || $level >= 16 || isset($seen[$value])) {
                $bad++;
                continue;
            }
            $seen[$value] = true;
            $label = isset($item['label']) && is_scalar($item['label']) && !is_bool($item['label']) && (string) $item['label'] !== ''
                ? (string) $item['label'] : $value;
            $locked = $plocked || !empty($item['disabled']) || isset($subtree[$value]);
            $rows[] = ['value' => $value, 'label' => $label, 'level' => $level, 'locked' => $locked,
                'desc' => td__str($item['description'] ?? null)];
            if (isset($item['children']) && is_array($item['children']) && $item['children']) {
                $stack[] = [array_values($item['children']), 0, $level + 1, $locked];
            }
        }
        if ($bad) {
            trigger_error("td_tree_select: $bad node(s) dropped (value must be a non-empty string or a number, unique; depth ≤ 16)", E_USER_WARNING);
        }
        $n = count($rows);
        $index = [];
        foreach ($rows as $k => $r) {
            $rows[$k]['leaf'] = $k + 1 >= $n || $rows[$k + 1]['level'] <= $r['level'];
            $index[$r['value']] = $k;
        }
        // Selection: same value rules, only values of the tree; single = the first; cascade = leaves only.
        $sel = [];
        foreach (is_array($selected) ? $selected : [$selected] as $v) {
            $sv = td__tree_value($v);
            if ($sv === null || !isset($index[$sv]) || ($cascade && !$rows[$index[$sv]]['leaf'])) {
                continue;
            }
            $sel[$sv] = true;
            if (!$multiple) {
                break;
            }
        }
        $lockedSel = [];
        foreach ($rows as $r) {
            if ($r['locked'] && isset($sel[$r['value']])) {
                $lockedSel[] = $r['value'];
            }
        }
        $singleLocked = !$multiple && $lockedSel;
        $element = td__element($o);
        $id = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $label = td__str($o['label'] ?? null);
        $placeholder = td__str($o['placeholder'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $aria = td__str($o['aria_label'] ?? null);
        foreach ($extra as $k => $v) {
            if (strtolower((string) $k) === 'aria-label') {
                $aria ??= td__str($v);
            }
        }
        $valueLabel = null;
        $valueLabels = null;
        if ($element && $sel) {
            if ($multiple) {
                $map = [];
                foreach ($rows as $r) {
                    if (isset($sel[$r['value']])) {
                        $map[$r['value']] = $r['label'];
                    }
                }
                $valueLabels = (string) json_encode($map, JSON_FORCE_OBJECT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                    | JSON_INVALID_UTF8_SUBSTITUTE);
            } else {
                $valueLabel = $rows[$index[array_key_first($sel)]]['label'];
            }
        }
        $taken = [];
        $html = '<td-tree-select' . Td::ownAttrs([
            'data-td-ssr' => $element ? Td::SSR_TREE_SELECT : null,
            'id' => $id,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'label' => $label,
            'placeholder' => $placeholder,
            'multiple' => $multiple,
            'cascade' => $cascade,
            'allow-clear' => !$multiple && $placeholder !== null && !$singleLocked,
            'display' => ($o['display'] ?? null) === 'path' ? 'path' : null,
            'value-label' => $valueLabel,
            'value-labels' => $valueLabels,
            'required' => $required,
        ], $taken);
        $taken = td__reserve(['id', 'class', 'label', 'placeholder', 'multiple', 'cascade', 'searchable', 'allow-clear',
            'display', 'name', 'value', 'value-label', 'value-labels', 'required', 'disabled', 'aria-label',
            'aria-labelledby', 'error-text'], $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '>';
        if ($label !== null) {
            $html .= '<label class="td-field__label" for="' . Td::e($id) . '-select">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>';
        }
        $html .= '<select' . Td::ownAttrs([
            'class' => 'td-tree-select__native',
            'id' => "$id-select",
            'name' => $name !== '' ? $name : null,
            'multiple' => $multiple,
            'size' => $multiple && !$element ? (Td::intOpt($o['size'] ?? null, 1) ?? '8') : null,
            // a locked selected value (hidden input) already makes a multiple field non-empty: no false valueMissing
            'required' => $required && !($multiple && $lockedSel),
            'disabled' => $disabled,
            'aria-label' => $aria,
        ]) . '>';
        if (!$multiple && $placeholder !== null && !$singleLocked) {
            $html .= '<option value="">' . Td::e($placeholder) . '</option>';
        }
        foreach ($rows as $r) {
            $isSel = isset($sel[$r['value']]);
            if ($singleLocked) {
                $off = !$isSel;               // the locked selection is the only enabled option
                $nativeOnly = $off && !$r['locked'];
            } else {
                $parent = $cascade && !$r['leaf'];
                $off = $r['locked'] || $parent;
                $nativeOnly = $parent && !$r['locked'];
            }
            $html .= '<option' . Td::ownAttrs([
                'value' => $r['value'],
                'data-level' => (string) $r['level'],
                'data-label' => $r['label'],
                'data-description' => $r['desc'],
                'data-locked' => $r['locked'],
                'selected' => $isSel,
                'disabled' => $off,
                'data-native-only' => $nativeOnly,
            ]) . '>' . str_repeat("\u{00A0}", 2 * $r['level']) . Td::e($r['label']) . '</option>';
        }
        $html .= '</select>';
        if ($multiple && $name !== '') {
            foreach ($lockedSel as $v) {
                $html .= '<input type="hidden" class="td-tree-select__locked"' . Td::ownAttrs([
                    'name' => $name,
                    'value' => $v,
                    'disabled' => $disabled,
                ]) . '>';
            }
        }
        return $html . '</td-tree-select>';
    }

    /** @internal td_tree_select value rule (= the JS tree model): non-empty string, int or finite float → string; else null. */
    function td__tree_value(mixed $v): ?string
    {
        if (is_string($v)) {
            return $v !== '' ? $v : null;
        }
        if (is_int($v) || (is_float($v) && is_finite($v))) {
            return (string) $v;
        }
        return null;
    }

    /**
     * Standalone native switch `label.td-switch` + `input[role=switch].td-switch__input`.
     * Options: size sm|md|lg, value (default: none → native "on"), required, disabled, id (input), aria_label,
     * class (label), attrs (label), input_attrs (input).
     * v0.26.0 `element` (bool, default Td::configure ssr_elements): `<td-toggle data-td-ssr="toggle@1">` host + the
     * markup <td-toggle> renders (the input keeps name / value / checked / required / id); class + attrs → host.
     */
    function td_toggle(string $name, bool $checked = false, string $label = '', array $o = []): string
    {
        if (td__element($o)) {
            return td__check_element(true, $name, $checked, $label, $o);
        }
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $input = td__check_input('td-switch__input', $name, $checked, $o, true);
        $taken = [];
        return '<label' . Td::ownAttrs(['class' => 'td-switch td-switch--' . $size . Td::classTokens($o['class'] ?? null)], $taken)
            . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>' . $input
            . '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
            . '<span class="td-switch__icon td-switch__icon--off">' . Td::icon('close') . '</span>'
            . '<span class="td-switch__icon td-switch__icon--on">' . Td::icon('check') . '</span>'
            . '</span></span>' . ($label !== '' ? '<span class="td-switch__label">' . Td::e($label) . '</span>' : '') . '</label>';
    }

    /**
     * Standalone native checkbox `label.td-checkbox` + `input.td-checkbox__input`.
     * Options: size sm|md|lg, value (default: none → native "on"), required, disabled, id (input), aria_label,
     * class (label), attrs (label), input_attrs (input).
     * v0.26.0 `element` (bool, default Td::configure ssr_elements): `<td-checkbox data-td-ssr="checkbox@1">` host + the
     * markup <td-checkbox> renders (the input keeps name / value / checked / required / id); class + attrs → host.
     */
    function td_checkbox(string $name, bool $checked = false, string $label = '', array $o = []): string
    {
        if (td__element($o)) {
            return td__check_element(false, $name, $checked, $label, $o);
        }
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $input = td__check_input('td-checkbox__input', $name, $checked, $o, false);
        $taken = [];
        return '<label' . Td::ownAttrs(['class' => 'td-checkbox td-checkbox--' . $size . Td::classTokens($o['class'] ?? null)], $taken)
            . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>' . $input
            . '<span class="td-checkbox__mark" aria-hidden="true"><span class="td-checkbox__icon">'
            . Td::icon('check', 'm', '', 'td-checkbox__svg') . '</span></span>'
            . ($label !== '' ? '<span class="td-checkbox__label">' . Td::e($label) . '</span>' : '') . '</label>';
    }

    /**
     * @internal td_dropdown `searchable` (v0.18.0 F8). Absent / null → auto (> 8 options). false, 0 and the strings
     * 'false' / '0' / 'off' / 'no' / '' (trimmed, case-insensitive) → off. Anything else keeps PHP truthiness.
     */
    function td__searchable(mixed $v, int $count): bool
    {
        if ($v === null) {
            return $count > 8;
        }
        if (is_string($v) && in_array(strtolower(trim($v)), ['false', '0', 'off', 'no', ''], true)) {
            return false;
        }
        return (bool) $v;
    }

    /**
     * CSS-only badge `span.td-badge.td-badge--{variant}` (v0.18.0 F5; no JS, no custom element).
     * Options: variant neutral|accent|success|warning|danger|info (default neutral), outline (bool), stamp (bool — the
     * uppercase double-border rubber stamp), icon (v0.25.0: registry name → `span.td-badge__icon` + `span.td-badge__label`;
     * unknown → no icon), id, class, attrs (span).
     */
    function td_badge(string $text, array $o = []): string
    {
        $variants = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
        $variant = in_array($o['variant'] ?? null, $variants, true) ? $o['variant'] : 'neutral';
        $class = 'td-badge td-badge--' . $variant . (!empty($o['outline']) ? ' td-badge--outline' : '')
            . (!empty($o['stamp']) ? ' td-badge--stamp' : '') . Td::classTokens($o['class'] ?? null);
        // v0.25.0 `icon`: decorative registry icon (core, alias or registerIcons() site-*) before the label; an unknown
        // name prints no icon (no empty span) — the badge is then exactly the icon-less markup.
        $svg = isset($o['icon']) && is_string($o['icon']) && $o['icon'] !== '' ? Td::icon($o['icon'], 's') : '';
        $body = $svg !== ''
            ? '<span class="td-badge__icon" aria-hidden="true">' . $svg . '</span><span class="td-badge__label">' . Td::e($text) . '</span>'
            : Td::e($text);
        $taken = [];
        return '<span' . Td::ownAttrs([
            'class' => $class,
            'id' => isset($o['id']) && is_scalar($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : null,
        ], $taken) . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>' . $body . '</span>';
    }

    /**
     * Static alert (v0.18.0 F5) — the ONE SSR contract: a `<td-alert variant … [dismissible] [heading]>` host that
     * already contains the full styled markup `div.td-alert.td-alert--{variant}[role]` (icon, heading, message), so
     * td.css shows it without JS (flash messages). With `@dazzxq/td-components/alert` loaded, <td-alert> upgrades IN
     * PLACE (text kept) and adds the close button when `dismissible`; without JS there is no close button.
     * $message is TEXT (escaped). Options: variant info|success|warning|danger (default info; danger → role="alert",
     * else role="status"), heading, dismissible (bool), id, class, attrs (host).
     */
    function td_alert(string $message, array $o = []): string
    {
        $icons = ['info' => 'info', 'success' => 'success', 'warning' => 'warning', 'danger' => 'error'];
        $variant = is_string($o['variant'] ?? null) && isset($icons[$o['variant']]) ? $o['variant'] : 'info';
        $heading = isset($o['heading']) && is_scalar($o['heading']) && trim((string) $o['heading']) !== '' ? (string) $o['heading'] : null;
        $taken = [];
        $html = '<td-alert' . Td::ownAttrs([
            'id' => isset($o['id']) && is_scalar($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : null,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'variant' => $variant,
            'dismissible' => !empty($o['dismissible']),
            'heading' => $heading,
        ], $taken) . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>';
        $html .= '<div class="td-alert td-alert--' . $variant . '" role="' . ($variant === 'danger' ? 'alert' : 'status') . '">'
            . '<span class="td-alert__icon" aria-hidden="true">' . Td::icon($icons[$variant]) . '</span>'
            . '<div class="td-alert__body">'
            . ($heading !== null ? '<p class="td-alert__heading">' . Td::e($heading) . '</p>' : '')
            . '<div class="td-alert__message">' . Td::e($message) . '</div></div></div>';
        return $html . '</td-alert>';
    }

    /**
     * v0.26.0 empty state (contract empty-state@1, ADR 0012) — ALWAYS the element: `<td-empty-state
     * data-td-ssr="empty-state@1" …>` + the exact tree <td-empty-state> renders (icon slot filled from the PHP registry,
     * heading, message, actions), styled by td.css without JS and hydrated IN PLACE by `@dazzxq/td-components/empty-state`
     * (no flash, no layout shift). $title / $message are TEXT (escaped); '' → the component's default texts.
     * Options: icon (registry name / alias / registerIcons() site-*; absent or unknown → `inbox`, no `icon` attribute),
     * size sm|md|lg (default md), compact (bool), heading (2–6 → `heading-level`; else the component's h3), actions (list
     * of ['label' =>, 'href' =>, 'variant' => primary|secondary|danger (default secondary)] → td_link element mode, size
     * sm; an action without a safe href is skipped — no dead control; label '' → 'Thực hiện'), id, class, attrs (host:
     * allowlisted; owned names and data-td-* reserved). The server actions stay until the site sets the JS `actions`.
     */
    function td_empty(string $title, string $message = '', array $o = []): string
    {
        $sizes = ['sm' => 28, 'md' => 40, 'lg' => 56];
        $size = is_string($o['size'] ?? null) && isset($sizes[$o['size']]) ? $o['size'] : 'md';
        $px = $sizes[$size];
        $compact = !empty($o['compact']);
        $level = isset($o['heading']) && is_scalar($o['heading']) && preg_match('/^[2-6]$/', trim((string) $o['heading']))
            ? (int) trim((string) $o['heading']) : null;
        $iconName = isset($o['icon']) && is_string($o['icon']) && $o['icon'] !== '' && Td::hasIcon($o['icon']) ? $o['icon'] : null;
        $svg = Td::icon($iconName ?? 'inbox', $px);
        $actions = '';
        foreach (is_array($o['actions'] ?? null) ? $o['actions'] : [] as $a) {
            if (!is_array($a) || !isset($a['href']) || !is_string($a['href']) || Td::safeUrl($a['href']) === '') {
                continue;
            }
            $label = isset($a['label']) && is_scalar($a['label']) && (string) $a['label'] !== '' ? (string) $a['label'] : 'Thực hiện';
            $variant = in_array($a['variant'] ?? null, ['primary', 'secondary', 'danger'], true) ? $a['variant'] : 'secondary';
            $actions .= td_link($label, $a['href'], ['variant' => $variant, 'size' => 'sm', 'element' => true]);
        }
        $taken = [];
        $html = '<td-empty-state' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_EMPTY,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'title' => $title !== '' ? $title : null,
            'message' => $message !== '' ? $message : null,
            'size' => $size,
            'compact' => $compact,
            'heading-level' => $level !== null ? (string) $level : null,
            'icon' => $iconName,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'title', 'message', 'size', 'compact', 'heading-level', 'icon'], $extra, $taken);
        $h = 'h' . ($level ?? 3);
        return $html . Td::attrs($extra, $taken) . '>'
            . '<div class="td-empty-state td-empty-state--' . $size . ($compact ? ' td-empty-state--compact' : '') . '">'
            . '<div class="td-empty-state__icon" aria-hidden="true"><span data-td-icon="' . Td::e($iconName ?? 'inbox')
            . '" data-td-icon-size="' . $px . '">' . $svg . '</span></div>'
            . '<' . $h . ' class="td-empty-state__title">' . Td::e($title !== '' ? $title : 'Không có dữ liệu') . '</' . $h . '>'
            . '<p class="td-empty-state__message">' . Td::e($message !== '' ? $message : 'Chưa có mục nào được tạo.') . '</p>'
            . '<div class="td-empty-state__actions"' . ($actions === '' ? ' hidden' : '') . '>' . $actions . '</div>'
            . '</div></td-empty-state>';
    }

    /**
     * v0.27.0 one-time code field (contract otp-input@1; v0.36.0 additive: length / charset / case). Default: a NATIVE
     * field that works without JS — `div.td-otp[data-length=N when N ≠ 6]` > [label] + `div.td-otp__box` >
     * `input.td-otp__input` (type text, inputmode numeric|text, autocomplete one-time-code, letter charsets: autocapitalize
     * / autocorrect / spellcheck, maxlength N, pattern [0-9]{N} | [A-Za-z0-9]{N} | [A-Za-z]{N}, name / value / required…)
     * [+ the error note]. `element` (bool, default Td::configure ssr_elements = false): `<td-otp-input
     * data-td-ssr="otp-input@1">` host (+ `length` / `charset` / `case` when not the default) + the same field + the N
     * decorative cells, adopted IN PLACE by `@dazzxq/td-components/otp-input` (no flash). $name: form field name.
     * Options: length (int 1–10, default 6; anything else → 6 + one E_USER_WARNING), charset (numeric | alphanumeric |
     * alpha; invalid → numeric + warning), case (upper | lower | preserve, letters only; invalid → upper + warning), label,
     * value (normalised like the component: td__otp_value()), required, disabled, readonly, autofocus, error (text),
     * aria_label (when there is no label; default "Mã xác thực"), id (the INPUT id — `<label for>`; element mode: host =
     * {id}-host), class (wrapper / host), attrs (the input: allowlisted; owned names and data-td-* reserved). The native
     * `pattern` accepts lower case too: the server normalises the case. Never submits the form by itself.
     */
    function td_otp_input(string $name, array $o = []): string
    {
        $element = td__element($o);
        $callerId = td__str($o['id'] ?? null);
        $hostId = $element ? ($callerId !== null ? $callerId . '-host' : td__host_uid($name)) : null;
        $cid = $callerId ?? ($element ? $hostId . '-input' : td__host_uid($name) . '-input');
        $label = isset($o['label']) && is_scalar($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;
        $error = td__str($o['error'] ?? null);
        [$len, $charset, $case] = td__otp_config($o);
        $text = $charset !== 'numeric';
        $value = isset($o['value']) && is_scalar($o['value']) ? td__otp_value((string) $o['value'], $len, $charset, $case) : '';
        $pattern = ['numeric' => '[0-9]', 'alphanumeric' => '[A-Za-z0-9]', 'alpha' => '[A-Za-z]'][$charset] . '{' . $len . '}';
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $readonly = !empty($o['readonly']);
        $errId = ($element ? $hostId : $cid) . '-error';
        $taken = [];
        $input = '<input' . Td::ownAttrs([
            'type' => 'text',
            'class' => 'td-otp__input',
            'id' => $cid,
            'inputmode' => $text ? 'text' : 'numeric',
            'autocomplete' => 'one-time-code',
            'autocapitalize' => $text ? ($case === 'upper' ? 'characters' : 'none') : null,
            'autocorrect' => $text ? 'off' : null,
            'spellcheck' => $text ? 'false' : null,
            'name' => $name !== '' ? $name : null,
            'maxlength' => (string) $len,
            'pattern' => $pattern,
            'value' => $value !== '' ? $value : null,
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'autofocus' => !empty($o['autofocus']),
            'aria-label' => $label === null ? ($aria ?? 'Mã xác thực') : null,
            'aria-invalid' => $error !== null ? 'true' : null,
            'aria-errormessage' => $error !== null ? $errId : null,
            'aria-describedby' => $error !== null ? $errId : null,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['type', 'class', 'id', 'inputmode', 'autocomplete', 'autocapitalize', 'autocorrect', 'spellcheck',
            'name', 'maxlength', 'minlength', 'pattern', 'value', 'required', 'disabled', 'readonly', 'autofocus', 'aria-label',
            'aria-labelledby', 'aria-invalid', 'aria-errormessage', 'aria-describedby'], $extra, $taken);
        $input .= Td::attrs($extra, $taken) . '>';
        $labelHtml = $label !== null ? '<label class="td-otp__label" for="' . Td::e($cid) . '">' . Td::e($label) . '</label>' : '';
        $note = $error !== null
            ? '<span class="td-field-error" id="' . Td::e($errId) . '" data-for="' . Td::e($element ? $hostId : $cid) . '">' . Td::e($error) . '</span>'
            : '';
        $dataLength = $len !== 6 ? ' data-length="' . $len . '"' : '';
        if (!$element) {
            return '<div class="td-otp' . Td::e(Td::classTokens($o['class'] ?? null)) . '"' . $dataLength . '>' . $labelHtml
                . '<div class="td-otp__box">' . $input . '</div>' . $note . '</div>';
        }
        $cells = '<span class="td-otp__cells" aria-hidden="true">' . str_repeat('<span class="td-otp__cell"></span>', $len) . '</span>';
        $hostTaken = [];
        return '<td-otp-input' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_OTP,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'value' => $value !== '' ? $value : null,
            'length' => $len !== 6 ? (string) $len : null,
            'charset' => $text ? $charset : null,
            'case' => $text && $case !== 'upper' ? $case : null,
            'label' => $label,
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'error-text' => $error,
            'aria-label' => $aria,
        ], $hostTaken) . '><div class="td-otp"' . $dataLength . '>' . $labelHtml . '<div class="td-otp__box">' . $input . $cells . '</div></div>'
            . $note . '</td-otp-input>';
    }

    /**
     * @internal v0.27.0 numeric OTP value, at most 6 digits — kept as a wrapper of td__otp_value().
     */
    function td__otp_digits(string $v): string
    {
        return td__otp_value($v, 6, 'numeric', 'upper');
    }

    /**
     * @internal v0.36.0 `length` / `charset` / `case` options of td_otp_input(), with one E_USER_WARNING per invalid
     * option (→ the default). Same rules as src/utils/otp.js otpLength / otpCharset / otpCase.
     * @return array{0: int, 1: string, 2: string}
     */
    function td__otp_config(array $o): array
    {
        $len = 6;
        if (array_key_exists('length', $o) && $o['length'] !== null) {
            $l = $o['length'];
            $ok = is_int($l) ? $l : (is_string($l) && preg_match('/^\s*[0-9]+\s*$/', $l) ? (int) trim($l) : null);
            if ($ok !== null && $ok >= 1 && $ok <= 10) {
                $len = $ok;
            } else {
                trigger_error('td_otp_input: invalid length (expected an integer 1–10); using 6', E_USER_WARNING);
            }
        }
        $charset = 'numeric';
        if (array_key_exists('charset', $o) && $o['charset'] !== null) {
            if (in_array($o['charset'], ['numeric', 'alphanumeric', 'alpha'], true)) {
                $charset = $o['charset'];
            } else {
                trigger_error('td_otp_input: invalid charset (expected numeric | alphanumeric | alpha); using numeric', E_USER_WARNING);
            }
        }
        $case = 'upper';
        if (array_key_exists('case', $o) && $o['case'] !== null) {
            if (in_array($o['case'], ['upper', 'lower', 'preserve'], true)) {
                $case = $o['case'];
            } else {
                trigger_error('td_otp_input: invalid case (expected upper | lower | preserve); using upper', E_USER_WARNING);
            }
        }
        return [$len, $charset, $case];
    }

    /**
     * @internal v0.36.0 OTP value as <td-otp-input> keeps it (src/utils/otp.js otpNormalize, parity OTP_CASES): digits
     * (ASCII, full-width U+FF10…, Arabic-Indic U+0660…, extended Arabic-Indic U+06F0…) → ASCII when the charset takes
     * digits; a letter: NFKC of that one character (intl Normalizer; without intl only full-width letters fold) must be
     * one [A-Za-z], then the case; everything else dropped; at most $len characters.
     */
    function td__otp_value(string $v, int $len = 6, string $charset = 'numeric', string $case = 'upper'): string
    {
        static $digits = null;
        static $wide = null;
        if ($digits === null) {
            $digits = [];
            foreach ([0xFF10, 0x0660, 0x06F0] as $base) {
                for ($i = 0; $i < 10; $i++) {
                    $digits[(string) json_decode(sprintf('"\\u%04X"', $base + $i))] = (string) $i;
                }
            }
            $wide = [];
            for ($i = 0; $i < 26; $i++) {
                $wide[(string) json_decode(sprintf('"\\u%04X"', 0xFF21 + $i))] = chr(65 + $i);
                $wide[(string) json_decode(sprintf('"\\u%04X"', 0xFF41 + $i))] = chr(97 + $i);
            }
        }
        // SEC-01 (v0.36.0 review): an OTP is ≤ 10 characters — input over TD_OTP_MAX_BYTES bytes is rejected outright (same
        // policy as otpNormalize() in src/utils/otp.js), then code points are read one by one (no whole-string split) and
        // the loop stops after $len accepted characters.
        if (strlen($v) > 256 || ($v !== '' && !preg_match('//u', $v))) {
            return '';
        }
        $out = '';
        $n = 0;
        $bytes = strlen($v);
        for ($i = 0; $i < $bytes && $n < $len;) {
            $b = ord($v[$i]);
            $w = $b < 0x80 ? 1 : ($b >= 0xF0 ? 4 : ($b >= 0xE0 ? 3 : 2));
            $ch = substr($v, $i, $w);
            $i += $w;
            $d = preg_match('/^[0-9]$/', $ch) ? $ch : ($digits[$ch] ?? null);
            if ($d !== null) {
                if ($charset !== 'alpha') {
                    $out .= $d;
                    $n++;
                }
                continue;
            }
            if ($charset === 'numeric') {
                continue;
            }
            $k = class_exists('Normalizer') ? (string) \Normalizer::normalize($ch, \Normalizer::FORM_KC) : ($wide[$ch] ?? $ch);
            if (!preg_match('/^[A-Za-z]$/', $k)) {
                continue;
            }
            $out .= $case === 'lower' ? strtolower($k) : ($case === 'preserve' ? $k : strtoupper($k));
            $n++;
        }
        return $out;
    }

    /**
     * v0.30.0 number / money field (contract number-input@1, plan v0.30.0 M3). Default: a NATIVE field that works
     * without JS — `div.td-field.td-number` > [label] + `div.td-number__box` > [prefix] `input.td-number__control`
     * (type number: the browser checks range / step / characters and submits the clean number; no thousands grouping
     * without JS) [suffix] [hidden unit text] + footer (error / hint) + status region. `element` (bool, default
     * Td::configure ssr_elements = false): `<td-number-input data-td-ssr="number-input@1">` host + the same tree with the
     * CANONICAL value (never pre-formatted: a no-JS submit of "12.990.000" would be read as 12), adopted IN PLACE by
     * `@dazzxq/td-components/number-input`.
     * $value / min / max / step go through td__number_canonical() (same gate as the component: canonical form, ≤ 30
     * digits, no more fraction digits than `decimals` — never rounded / cut; invalid → dropped + one E_USER_WARNING);
     * `step` must be > 0. Only string and int values are accepted (float / INF / NAN / bool / array → rejected, never
     * coerced: `12.5` would otherwise become 12); warnings name the option + PHP type + length, never the raw value. Native: `min` = min ?? 0 (no negatives unless min < 0), `step` = step ?? 10^-decimals.
     * Options: label, hint, error, placeholder, required, disabled, readonly, min, max, step, decimals (0–10),
     * group_separator ('.' | ',' | ' ' | ''), decimal_separator (',' | '.'), prefix, suffix, unit_label, clamp, size
     * (sm|md|lg), aria_label (when there is no label), id (the CONTROL id — `<label for>`; element mode: host =
     * {id}-host), class (wrapper / host), attrs (the control: allowlisted; owned names and data-td-* reserved), element.
     * v0.49.0 `stepper` (element mode only — native mode keeps the browser's own spin buttons): the box also holds the − / +
     * buttons of <td-number-input stepper> (`type=button`, `tabindex=-1`, icon slots; hidden by td.css until the module
     * defines the element — the place is kept, no dead control; their names are set by the component).
     */
    function td_number_input(string $name, mixed $value = null, array $o = []): string
    {
        $element = td__element($o);
        $decimals = isset($o['decimals']) && is_numeric($o['decimals']) && (int) $o['decimals'] == $o['decimals']
            && (int) $o['decimals'] >= 0 && (int) $o['decimals'] <= 10 ? (int) $o['decimals'] : 0;
        $group = isset($o['group_separator']) && is_string($o['group_separator']) && in_array($o['group_separator'], ['.', ',', ' ', ''], true)
            ? $o['group_separator'] : null;
        $groupEff = $group ?? '.';
        $decFallback = $groupEff === ',' ? '.' : ',';
        $decimal = isset($o['decimal_separator']) && in_array($o['decimal_separator'], [',', '.'], true) && $o['decimal_separator'] !== $groupEff
            ? $o['decimal_separator'] : null;
        // Security review: ONLY string / int are accepted (a float 12.5 / INF / NAN, bool, array… is rejected, never
        // coerced); the warning names the option, the PHP type and a bounded length — never the raw value (logs).
        $canon = static function (string $what, mixed $v) use ($decimals): ?string {
            if ($v === null || $v === '') {
                return null;
            }
            $c = is_int($v) || is_string($v) ? td__number_canonical((string) $v, $decimals) : null;
            if ($c === null) {
                $type = get_debug_type($v);
                $len = is_string($v) ? ', ' . min(strlen($v), 9999) . (strlen($v) > 9999 ? '+' : '') . ' chars' : '';
                trigger_error("td_number_input: $what ($type$len) is not a canonical number (string or int, at most $decimals decimals / 30 digits) — ignored", E_USER_WARNING);
            }
            return $c;
        };
        $val = $canon('value', $value) ?? '';
        $min = $canon('min', $o['min'] ?? null);
        $max = $canon('max', $o['max'] ?? null);
        $step = $canon('step', $o['step'] ?? null);
        if ($step !== null && ($step[0] === '-' || !preg_match('/[1-9]/', $step))) { // must be > 0
            trigger_error('td_number_input: step must be > 0 — ignored', E_USER_WARNING);
            $step = null;
        }
        $minEff = $min ?? '0';
        $negative = $minEff[0] === '-';
        $stepEff = $step ?? ($decimals > 0 ? '0.' . str_repeat('0', $decimals - 1) . '1' : '1');
        $inputmode = $negative ? 'text' : ($decimals > 0 ? 'decimal' : 'numeric');
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $callerId = td__str($o['id'] ?? null);
        $base = $element ? ($callerId !== null ? $callerId . '-host' : td__host_uid($name)) : ($callerId ?? td__host_uid($name));
        $cid = $callerId ?? $base . '-control';
        $str = static fn (string $k): ?string => isset($o[$k]) && is_scalar($o[$k]) && !is_bool($o[$k]) && (string) $o[$k] !== '' ? (string) $o[$k] : null;
        $label = $str('label');
        $hint = $str('hint');
        $error = $str('error');
        $placeholder = $str('placeholder');
        $prefix = $str('prefix');
        $suffix = $str('suffix');
        $unitLabel = $str('unit_label');
        $aria = $str('aria_label');
        $unit = $unitLabel ?? $suffix ?? $prefix;
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $readonly = !empty($o['readonly']);
        $desc = trim(($unit !== null ? "$base-unit " : '') . ($hint !== null ? "$base-note " : '') . ($error !== null ? "$base-error" : ''));
        $taken = [];
        $control = '<input' . Td::ownAttrs([
            'type' => 'number',
            'class' => 'td-number__control',
            'id' => $cid,
            'inputmode' => $inputmode,
            'autocomplete' => 'off',
            'spellcheck' => 'false',
            'name' => $name !== '' ? $name : null,
            'value' => $val !== '' ? $val : null,
            'min' => $minEff,
            'max' => $max,
            'step' => $stepEff,
            'placeholder' => $placeholder,
            'required' => $required,
            'aria-required' => $required ? 'true' : null,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'aria-label' => $label === null ? $aria : null,
            'aria-describedby' => $desc !== '' ? $desc : null,
            'aria-invalid' => $error !== null ? 'true' : null,
            'aria-errormessage' => $error !== null ? "$base-error" : null,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['type', 'class', 'id', 'inputmode', 'autocomplete', 'spellcheck', 'name', 'value', 'min', 'max',
            'step', 'placeholder', 'required', 'aria-required', 'disabled', 'readonly', 'aria-label', 'aria-labelledby',
            'aria-describedby', 'aria-invalid', 'aria-errormessage', 'pattern', 'maxlength', 'minlength', 'list'], $extra, $taken);
        $control .= Td::attrs($extra, $taken) . '>';
        $b = Td::e($base);
        $labelHtml = $label !== null
            ? '<label class="td-field__label" id="' . $b . '-label" for="' . Td::e($cid) . '">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>'
            : '';
        $stepper = $element && !empty($o['stepper']);
        $stepBtn = static fn (string $dir, string $icon): string => '<button type="button" class="td-number__step td-number__step--' . $dir
            . '" tabindex="-1" aria-controls="' . Td::e($cid) . '"><span class="td-number__step-icon" data-td-icon="' . $icon
            . '" data-td-icon-class="td-number__step-svg">' . Td::icon($icon, 'm', '', 'td-number__step-svg') . '</span></button>';
        $box = '<div class="td-number__box">'
            . ($stepper ? $stepBtn('down', 'minus') : '')
            . ($prefix !== null ? '<span class="td-number__affix td-number__affix--prefix" aria-hidden="true">' . Td::e($prefix) . '</span>' : '')
            . $control
            . ($suffix !== null ? '<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">' . Td::e($suffix) . '</span>' : '')
            . ($unit !== null ? '<span id="' . $b . '-unit" hidden>' . Td::e($unit) . '</span>' : '')
            . ($stepper ? $stepBtn('up', 'plus') : '')
            . '</div>';
        $footer = $error !== null ? '<span class="td-field-error" id="' . $b . '-error" data-for="' . $b . '">' . Td::e($error) . '</span>' : '';
        $footer .= '<div class="td-field__note" id="' . $b . '-note"' . ($hint === null ? ' hidden' : '') . '>' . Td::e($hint ?? '') . '</div>';
        $inner = '<div class="td-field td-field--' . $size . ' td-number' . ($stepper ? ' td-number--stepper' : '') . ($element ? '' : Td::e(Td::classTokens($o['class'] ?? null))) . '">'
            . $labelHtml . $box
            . '<div class="td-field__footer"' . ($hint === null && $error === null ? ' hidden' : '') . '>' . $footer . '</div>'
            . '<span class="td-sr-only" id="' . $b . '-status" role="status"></span></div>';
        if (!$element) {
            return $inner;
        }
        $hostTaken = [];
        return '<td-number-input' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_NUMBER,
            'id' => $base,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'value' => $val !== '' ? $val : null,
            'label' => $label,
            'placeholder' => $placeholder,
            'helper-text' => $hint,
            'error-text' => $error,
            'size' => $size !== 'md' ? $size : null,
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'min' => $min,
            'max' => $max,
            'step' => $step,
            'decimals' => $decimals > 0 ? (string) $decimals : null,
            'group-separator' => $group,
            'decimal-separator' => $decimal,
            'prefix' => $prefix,
            'suffix' => $suffix,
            'unit-label' => $unitLabel,
            'clamp' => !empty($o['clamp']),
            'aria-label' => $aria,
            'stepper' => $stepper,
        ], $hostTaken) . '>' . $inner . '</td-number-input>';
    }

    /**
     * @internal v0.30.0 — the number gate shared with the component (src/utils/number-format.js parseCanonical):
     * `-?(0|[1-9][0-9]*)(\.[0-9]+)?`, at most 30 digits, at most $decimals fraction digits (never rounded / cut); `-0`
     * → `0`. Anything else → null.
     */
    function td__number_canonical(string $v, int $decimals): ?string
    {
        if (!preg_match('/^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/D', $v, $m)) {
            return null;
        }
        $frac = isset($m[2]) ? strlen($m[2]) : 0;
        if ($frac > max(0, min($decimals, 10)) || strlen($m[1]) + $frac > 30) {
            return null;
        }
        return preg_match('/^-0(\.0+)?$/D', $v) ? substr($v, 1) : $v;
    }

    /**
     * v0.27.0 copy button (contract copy@1) — ALWAYS the element: `<td-copy data-td-ssr="copy@1" …>` + the
     * server-authored source `<code class="td-copy__source">{value}</code>` (shown while the element is undefined: no-JS
     * users select it by hand; hidden once defined) + the icon button `button.td-copy` (hidden while undefined, no dead
     * control) + the status live region, exactly as <td-copy> renders them — hydrated IN PLACE by
     * `@dazzxq/td-components/copy`. $value is TEXT (escaped). Options: label (button name + tooltip; default "Copy"),
     * size sm|md (default md), sensitive (bool: copy events carry no value), duration (ms of the "copied" feedback),
     * id, class, attrs (host: allowlisted; owned names and data-td-* reserved).
     */
    function td_copy(string $value, array $o = []): string
    {
        $size = in_array($o['size'] ?? null, ['sm', 'md'], true) ? $o['size'] : 'md';
        $label = isset($o['label']) && is_scalar($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $name = $label ?? 'Copy';
        $taken = [];
        $html = '<td-copy' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_COPY,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'label' => $label,
            'size' => $size,
            'sensitive' => !empty($o['sensitive']),
            'duration' => Td::intOpt($o['duration'] ?? null, 0),
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'label', 'size', 'sensitive', 'duration', 'value', 'for'], $extra, $taken);
        return $html . Td::attrs($extra, $taken) . '>'
            . '<code class="td-copy__source">' . Td::e($value) . '</code>'
            . '<button type="button" class="td-copy td-copy--' . $size . '" aria-label="' . Td::e($name) . '" data-tooltip="' . Td::e($name) . '">'
            . '<span class="td-copy__icon" data-td-icon="copy" aria-hidden="true">' . Td::icon('copy') . '</span></button>'
            . '<span class="td-copy__status" role="status"></span></td-copy>';
    }

    /**
     * v0.32.0 media field (contract media-field@1, plan v0.32.0-media-picker decisions 24-25, 29) — ALWAYS the element:
     * `<td-media-field data-td-ssr="media-field@1" …>` + the exact tree <td-media-field> renders (label, frame with the
     * SVG ratio sizer + the open button showing the empty prompt / preview image / file name, Đổi / Gỡ buttons, the alt
     * input in `usage` mode, helper + error notes) + the NO-JS form parts: a hidden `input.td-media-field__value`
     * (`name` = assetId, or `name[id]` with `usage`), the alt input's `name[alt]` and a hidden `input.td-media-field__crop`
     * (`name[crop]` = the JSON v1 crop or `null`) — exactly the FormData of the component (decision 24). The open / Đổi /
     * Gỡ buttons are hidden by td.css until the module `@dazzxq/td-components/media-field` defines the element (no dead
     * control); it adopts the markup IN PLACE. $assetId is the opaque id (identity + form value); the preview URL is
     * display only. `required` cannot be checked by the browser without JS (hidden input): validate on the server.
     * Options: label, helper_text, error_text, required, disabled, aspect_ratio (`W/H`, `W:H` or one number; invalid →
     * dropped + one E_USER_WARNING), preview_fit (cover|contain), preview_src (Td::safeUrl, then only https: / allowed
     * http: / relative — mailto: / tel: / data: refused → no image), preview_alt (file name / description shown), kind
     * (image|video|file of $assetId), accept_kind (string list or array; default image), usage (bool), alt (max 500),
     * crop (array x / y / width / height in 0..1, or the JSON v1 string → printed / submitted as JSON v1; invalid → null +
     * one E_USER_WARNING), prompt, id (host id; inner ids derive from it), class, attrs (host: allowlisted; owned names
     * and data-td-* reserved). `usage` + a name ending in `[]` → nothing is named (not submitted) + one E_USER_WARNING.
     * v0.35 (plan v0.35.0-cropper decisions 27-31; `usage` only — without it: dropped + ONE E_USER_WARNING): croppable
     * (bool: prints the "Cắt ảnh" button, hidden by td.css until the element is defined like Đổi / Gỡ, and `hidden`
     * unless the field holds an image with a preview_src; then preview_src MUST be the whole, un-cropped image — any
     * size), crop_ratio (`W/H`, `W:H`, one number or `free`; invalid → dropped + one E_USER_WARNING), focal_point (bool:
     * prints the hidden `input.td-media-field__focal` `name[focal]` after `name[crop]`), focal (array x / y in 0..1 or
     * the JSON v1 string `{"v":1,"x","y"}` → printed / submitted as JSON v1; invalid → null + one E_USER_WARNING). The
     * crop printing is unchanged (byte-identical to v0.34 without these options).
     * Never prints adapter endpoints, permissions or serialized assets.
     */
    function td_media_field(string $name, mixed $assetId = null, array $o = []): string
    {
        $L = Td::MEDIA_FIELD_LABELS;
        // impl review #5 (the v0.30 rule): ONLY string / int; anything else is rejected (never coerced) with a warning that
        // names the PHP type only — never the value
        if ($assetId === null || is_string($assetId) || is_int($assetId)) {
            $id = $assetId === null ? '' : (string) $assetId;
        } else {
            trigger_error('td_media_field: $assetId (' . get_debug_type($assetId) . ') must be a string or an int — ignored', E_USER_WARNING);
            $id = '';
        }
        $hostId = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $label = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) ? (string) $o['label'] : '';
        $help = td__str($o['helper_text'] ?? null);
        $error = td__str($o['error_text'] ?? null);
        $prompt = td__str($o['prompt'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $usage = !empty($o['usage']);
        $kinds = td__media_kinds($o['accept_kind'] ?? null);
        $ratioRaw = isset($o['aspect_ratio']) && is_scalar($o['aspect_ratio']) && !is_bool($o['aspect_ratio']) ? (string) $o['aspect_ratio'] : null;
        $ratio = $ratioRaw !== null && $ratioRaw !== '' ? td__media_ratio($ratioRaw) : null;
        if ($ratio === null && $ratioRaw !== null && $ratioRaw !== '') {
            trigger_error('td_media_field: aspect_ratio is not W/H, W:H or a positive number (≤ 10000, ≤ 4 decimals) — ignored', E_USER_WARNING);
        }
        $fit = in_array($o['preview_fit'] ?? null, ['cover', 'contain'], true) ? $o['preview_fit'] : null;
        $kindOpt = in_array($o['kind'] ?? null, ['image', 'video', 'file'], true) ? $o['kind'] : null;
        $src = td__media_url($o['preview_src'] ?? null);
        $pAlt = isset($o['preview_alt']) && is_scalar($o['preview_alt']) && !is_bool($o['preview_alt']) ? (string) $o['preview_alt'] : '';
        $alt = isset($o['alt']) && is_scalar($o['alt']) && !is_bool($o['alt']) ? td__utf8_prefix((string) $o['alt'], 500) : '';
        $crop = td__media_crop($o['crop'] ?? null);
        // v0.35: croppable / crop_ratio / focal_point / focal — usage mode only (fail closed: the reference shape has no crop)
        $croppable = false;
        $focalOn = false;
        $cropRatio = null;
        $focal = null;
        $given = static fn (string $key): bool => ($o[$key] ?? null) !== null && $o[$key] !== '' && $o[$key] !== 'null';
        $v35 = !empty($o['croppable']) || !empty($o['focal_point']) || $given('crop_ratio') || $given('focal');
        if ($v35 && !$usage) {
            trigger_error('td_media_field: croppable / crop_ratio / focal_point / focal need usage — ignored', E_USER_WARNING);
        } elseif ($v35) {
            $croppable = !empty($o['croppable']);
            $focalOn = !empty($o['focal_point']);
            $crRaw = isset($o['crop_ratio']) && is_scalar($o['crop_ratio']) && !is_bool($o['crop_ratio']) ? (string) $o['crop_ratio'] : null;
            if ($crRaw !== null && $crRaw !== '' && td__media_crop_ratio($crRaw)) {
                $cropRatio = $crRaw;
            } elseif ($given('crop_ratio')) {
                trigger_error('td_media_field: crop_ratio must be free or W/H, W:H, a number with a ratio in [0.01, 100] — ignored', E_USER_WARNING);
            }
            $focal = td__media_focal($o['focal'] ?? null);
        }
        $filled = $id !== '';
        $k = $filled ? ($kindOpt ?? 'image') : $kinds[0];
        $hid = Td::e($hostId);
        $dis = $disabled ? ' disabled' : '';

        // FormData of the component (decision 24): reference `name`, usage `name[id]` / `name[alt]` / `name[crop]`
        $named = $name !== '';
        if ($named && $usage && str_ends_with($name, '[]')) {
            trigger_error('td_media_field: usage + a name ending in [] would mis-group name[id] / name[alt] / name[crop] — not submitted', E_USER_WARNING);
            $named = false;
        }
        $hidden = static fn (string $class, string $n, string $v): string => '<input type="hidden" class="' . $class . '" name="'
            . Td::e($n) . '" value="' . Td::e($v) . '"' . $dis . '>';
        $valueInput = $named ? $hidden('td-media-field__value', $usage ? $name . '[id]' : $name, $id) : '';
        $cropInput = $named && $usage ? $hidden('td-media-field__crop', $name . '[crop]', $crop ?? 'null') : '';
        $focalInput = $named && $focalOn ? $hidden('td-media-field__focal', $name . '[focal]', $focal ?? 'null') : '';

        if (!$filled) {
            $inner = '<span class="td-media-field__empty"><span class="td-media-field__icon" data-td-icon="' . $k . '" aria-hidden="true">'
                . Td::icon($k) . '</span><span class="td-media-field__prompt">' . Td::e($prompt ?? $L['prompt'][$k]) . '</span>'
                . ($ratio !== null ? '<span class="td-media-field__ratio">' . Td::e($ratio['text']) . '</span>' : '') . '</span>';
        } elseif ($src !== null && $k !== 'file') {
            $inner = '<img class="td-media-field__img" src="' . Td::e($src) . '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
                . ($k === 'video' ? '<span class="td-media-field__badge">' . Td::e($L['video']) . '</span>' : '');
        } else {
            $inner = '<span class="td-media-field__file"><span class="td-media-field__icon" data-td-icon="' . $k . '" aria-hidden="true">'
                . Td::icon($k) . '</span><span class="td-media-field__name">' . Td::e($pAlt !== '' ? $pAlt : $L['noPreview']) . '</span></span>';
        }
        $shown = $pAlt !== '' ? $pAlt : ($src !== null ? $id : '');
        $state = !$filled ? $L['empty'] : ($shown !== '' ? str_replace('{name}', $shown, $L['selected']) : $L['noPreview']);
        $described = implode(' ', array_filter([$help !== null ? $hostId . '-help' : '', $error !== null ? $hostId . '-error' : '']));

        $taken = [];
        $html = '<td-media-field' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_MEDIA_FIELD,
            'id' => $hostId,
            'class' => 'td-media-field' . Td::classTokens($o['class'] ?? null),
            'name' => $name !== '' ? $name : null,
            'label' => $label !== '' ? $label : null,
            'aspect-ratio' => $ratio !== null ? $ratioRaw : null,
            'preview-fit' => $fit,
            'accept-kind' => array_key_exists('accept_kind', $o) && $o['accept_kind'] !== null ? implode(' ', $kinds) : null,
            'usage' => $usage,
            'required' => $required,
            'disabled' => $disabled,
            'value' => $filled ? $id : null,
            'preview-src' => $src,
            'preview-alt' => $pAlt !== '' ? $pAlt : null,
            'kind' => $kindOpt,
            'alt' => $alt !== '' ? $alt : null,
            'crop' => $crop,
            'croppable' => $croppable,
            'crop-ratio' => $cropRatio,
            'focal-point' => $focalOn,
            'focal' => $focal,
            'prompt' => $prompt,
            'helper-text' => $help,
            'error-text' => $error,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'name', 'label', 'aspect-ratio', 'preview-fit', 'accept-kind', 'usage', 'required',
            'disabled', 'value', 'preview-src', 'preview-alt', 'kind', 'alt', 'crop', 'prompt', 'helper-text', 'error-text',
            'croppable', 'crop-ratio', 'focal-point', 'focal'], $extra, $taken);
        return $html . Td::attrs($extra, $taken) . '>'
            . '<span class="td-media-field__label" id="' . $hid . '-label">' . Td::e($label)
            . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</span>'
            . '<div class="td-media-field__frame" data-state="' . ($filled ? 'filled' : 'empty') . '" data-kind="' . $k . '">'
            . ($ratio !== null ? '<svg class="td-media-field__sizer" viewBox="0 0 ' . $ratio['w'] . ' ' . $ratio['h'] . '" aria-hidden="true" focusable="false"></svg>' : '')
            . '<button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="' . $hid . '-label ' . $hid . '-state"'
            . ($described !== '' ? ' aria-describedby="' . Td::e($described) . '"' : '')
            . ($error !== null ? ' aria-invalid="true" aria-errormessage="' . $hid . '-error"' : '') . $dis . '>'
            . $inner . '<span class="td-sr-only" id="' . $hid . '-state">' . Td::e($state) . '</span></button></div>'
            . '<div class="td-media-field__actions"' . ($filled ? '' : ' hidden') . '>'
            . '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog"' . $dis . '>'
            . Td::e($L['replace'][$k]) . '</button>'
            . ($croppable
                ? '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__crop-btn" aria-haspopup="dialog"'
                    . ($filled && $k === 'image' && $src !== null ? '' : ' hidden') . $dis . '>' . Td::e($L['crop']) . '</button>'
                : '')
            . '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove"' . $dis . '>' . Td::e($L['remove']) . '</button></div>'
            . ($croppable ? '<span class="td-media-field__status" role="status"></span>' : '')
            . $valueInput
            . ($usage
                ? '<div class="td-field td-media-field__usage"><label class="td-field__label" for="' . $hid . '-alt">' . Td::e($L['alt']) . '</label>'
                    . '<input type="text" class="td-field__control td-media-field__alt" id="' . $hid . '-alt" maxlength="500"'
                    . ($named ? ' name="' . Td::e($name . '[alt]') . '"' : '') . ($alt !== '' ? ' value="' . Td::e($alt) . '"' : '') . $dis . '></div>'
                : '')
            . $cropInput
            . $focalInput
            . ($help !== null ? '<span class="td-media-field__help" id="' . $hid . '-help">' . Td::e($help) . '</span>' : '')
            . ($error !== null ? '<span class="td-field-error" id="' . $hid . '-error" data-for="' . $hid . '">' . Td::e($error) . '</span>' : '')
            . '</td-media-field>';
    }

    /**
     * @internal `aspect-ratio` → ['w', 'h', 'text'] (numbers as JS prints them: 4.50 → 4.5) or null; same rules as
     * parseAspectRatio() of src/utils/media-field-model.js (ASPECT_CASES parity): W/H, W:H or one number, each > 0 and
     * ≤ 10000, at most 5 integer + 4 decimal digits, no sign / exponent.
     * @return array{w: string, h: string, text: string}|null
     */
    function td__media_ratio(string $v): ?array
    {
        $ws = Td::JS_WS;
        $s = preg_replace('/^[' . $ws . ']+|[' . $ws . ']+$/uD', '', $v);
        if (!is_string($s)) {
            return null;
        }
        $num = '(\d{1,5}(?:\.\d{1,4})?)';
        if (preg_match('/^' . $num . '[' . $ws . ']*[\/:][' . $ws . ']*' . $num . '$/uD', $s, $m)) {
            [$w, $h] = [$m[1], $m[2]];
        } elseif (preg_match('/^' . $num . '$/uD', $s, $m)) {
            [$w, $h] = [$m[1], '1'];
        } else {
            return null;
        }
        $wf = (float) $w;
        $hf = (float) $h;
        if (!($wf > 0 && $hf > 0 && $wf <= 10000 && $hf <= 10000)) {
            return null;
        }
        $norm = static function (string $n): string {
            $parts = explode('.', $n, 2);
            $i = ltrim($parts[0], '0');
            $f = rtrim($parts[1] ?? '', '0');
            return ($i === '' ? '0' : $i) . ($f === '' ? '' : '.' . $f);
        };
        $w = $norm($w);
        $h = $norm($h);
        return ['w' => $w, 'h' => $h, 'text' => $w . ':' . $h];
    }

    /**
     * @internal `accept_kind` (string list split on whitespace / commas, or an array) → valid unique kinds in order;
     * none → ['image'] (parseKinds() parity).
     * @return list<string>
     */
    function td__media_kinds(mixed $v): array
    {
        $ws = Td::JS_WS;
        $list = is_array($v) ? $v : (is_string($v) ? (preg_split('/[' . $ws . ',]+/u', $v) ?: []) : []);
        $out = [];
        foreach ($list as $k) {
            $l = is_string($k) ? strtolower((string) preg_replace('/^[' . $ws . ']+|[' . $ws . ']+$/uD', '', $k)) : '';
            if (in_array($l, ['image', 'video', 'file'], true) && !in_array($l, $out, true)) {
                $out[] = $l;
            }
        }
        return $out ?: ['image'];
    }

    /**
     * @internal Preview URL (display only): Td::safeUrl() (tab / CR / LF stripped, http: only when allowed), then only
     * https: / http: or a scheme-less URL — mailto: / tel: refused; ≤ 8192 characters. null when refused.
     */
    function td__media_url(mixed $v): ?string
    {
        // v0.43.0 review round 1 SEC-1: bounded before any scan, and valid UTF-8 only (else a JSON encode of it throws)
        if (!is_string($v) || strlen($v) > 8192 || preg_match('//u', $v) !== 1) {
            return null;
        }
        $u = Td::safeUrl($v);
        if ($u === '' || strlen($u) > 8192) {
            return null;
        }
        if (preg_match('/^([A-Za-z][A-Za-z0-9+.\-]*):/', $u, $m) && !in_array(strtolower($m[1]), ['https', 'http'], true)) {
            return null;
        }
        return $u;
    }

    /**
     * @internal The `crop` option → the JSON v1 string printed + submitted as is (parseCrop() parity, CROP_CASES), or
     * null. An array x / y / width / height (numbers) is encoded first; null / '' / 'null' → null silently; anything
     * invalid → null + ONE E_USER_WARNING.
     */
    function td__media_crop(mixed $v, bool $warn = true): ?string
    {
        if ($v === null || $v === '' || $v === 'null') {
            return null;
        }
        $json = null;
        if (is_string($v)) {
            $json = $v;
        } elseif (is_array($v)) {
            $keys = array_keys($v);
            sort($keys);
            $nums = true;
            foreach (['x', 'y', 'width', 'height'] as $key) {
                $n = $v[$key] ?? null;
                $nums = $nums && (is_int($n) || is_float($n)) && is_finite((float) $n);
            }
            if ($keys === ['height', 'width', 'x', 'y'] && $nums) {
                $json = '{"v":1';
                foreach (['x', 'y', 'width', 'height'] as $key) {
                    $json .= ',"' . $key . '":' . json_encode($v[$key], JSON_THROW_ON_ERROR);
                }
                $json .= '}';
            }
        }
        $ok = $json !== null ? td__media_crop_parse($json) : null;
        if ($ok === null && $warn) {
            trigger_error('td_media_field: crop must be x / y / width / height in 0..1 (x + width ≤ 1, y + height ≤ 1) — submitted as null', E_USER_WARNING);
        }
        return $ok;
    }

    /** @internal v0.35 parseCropRatio() of src/utils/media-field-model.js: `free` (any case, JS-trimmed) or a valid ratio. */
    function td__media_crop_ratio(string $v): bool
    {
        $ws = Td::JS_WS;
        $t = preg_replace('/^[' . $ws . ']+|[' . $ws . ']+$/uD', '', $v);
        if (is_string($t) && strtolower($t) === 'free') {
            return true;
        }
        $r = td__media_ratio($v);
        if ($r === null) {
            return false;
        }
        // v0.35 review R1 #5: public crop ratio range [0.01, 100] (CROP_RATIO_CASES parity)
        $q = (float) $r['w'] / (float) $r['h'];
        return $q >= 0.01 && $q <= 100;
    }

    /**
     * @internal v0.35 The `focal` option → the JSON v1 string printed + submitted as is (parseFocal() parity,
     * FOCAL_CASES), or null. An array x / y (numbers) is encoded first; null / '' / 'null' → null silently; anything
     * invalid → null + ONE E_USER_WARNING.
     */
    function td__media_focal(mixed $v, bool $warn = true): ?string
    {
        if ($v === null || $v === '' || $v === 'null') {
            return null;
        }
        $json = null;
        if (is_string($v)) {
            $json = $v;
        } elseif (is_array($v)) {
            $keys = array_keys($v);
            sort($keys);
            $nums = true;
            foreach (['x', 'y'] as $key) {
                $n = $v[$key] ?? null;
                $nums = $nums && (is_int($n) || is_float($n)) && is_finite((float) $n);
            }
            if ($keys === ['x', 'y'] && $nums) {
                $json = '{"v":1,"x":' . json_encode($v['x'], JSON_THROW_ON_ERROR) . ',"y":' . json_encode($v['y'], JSON_THROW_ON_ERROR) . '}';
            }
        }
        $ok = $json !== null ? td__media_focal_parse($json) : null;
        if ($ok === null && $warn) {
            trigger_error('td_media_field: focal must be x / y in 0..1 (JSON v1 {"v":1,"x","y"}) — submitted as null', E_USER_WARNING);
        }
        return $ok;
    }

    /** @internal v0.35 parseFocal() of src/utils/media-field-model.js: exactly {"v":1,"x","y"}, finite, in 0..1, ≤ 128 characters. */
    function td__media_focal_parse(string $s): ?string
    {
        if ($s === '' || strlen($s) > 128) {
            return null;
        }
        try {
            $o = json_decode($s, false, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (!$o instanceof \stdClass) {
            return null;
        }
        $a = get_object_vars($o);
        $keys = array_map('strval', array_keys($a));
        sort($keys, SORT_STRING);
        if ($keys !== ['v', 'x', 'y']) {
            return null;
        }
        $isNum = static fn (mixed $n): bool => (is_int($n) || is_float($n)) && is_finite((float) $n);
        if (!$isNum($a['v']) || (float) $a['v'] !== 1.0) {
            return null;
        }
        foreach (['x', 'y'] as $key) {
            if (!$isNum($a[$key]) || (float) $a[$key] < 0 || (float) $a[$key] > 1) {
                return null;
            }
        }
        return $s;
    }

    /** @internal parseCrop() of src/utils/media-field-model.js: exactly {"v":1,"x","y","width","height"}, finite, in 0..1 (± 1e-6). */
    function td__media_crop_parse(string $s): ?string
    {
        if ($s === '' || strlen($s) > 512) {
            return null;
        }
        try {
            $o = json_decode($s, false, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (!$o instanceof \stdClass) {
            return null;
        }
        $a = get_object_vars($o);
        $keys = array_map('strval', array_keys($a));
        sort($keys, SORT_STRING);
        if ($keys !== ['height', 'v', 'width', 'x', 'y']) {
            return null;
        }
        $isNum = static fn (mixed $n): bool => (is_int($n) || is_float($n)) && is_finite((float) $n);
        if (!$isNum($a['v']) || (float) $a['v'] !== 1.0) {
            return null;
        }
        foreach (['x', 'y', 'width', 'height'] as $key) {
            if (!$isNum($a[$key])) {
                return null;
            }
        }
        [$x, $y, $w, $h] = [(float) $a['x'], (float) $a['y'], (float) $a['width'], (float) $a['height']];
        if ($x < 0 || $y < 0 || $w <= 0 || $h <= 0 || $x + $w > 1 + 1e-6 || $y + $h > 1 + 1e-6) {
            return null;
        }
        return $s;
    }

    /**
     * v0.43.0 media gallery (contract media-gallery@1, plan v0.43.0-media-gallery decisions 8, 14-15b, 19; ADR 0021) —
     * ALWAYS the element `<td-media-gallery data-td-ssr="media-gallery@1" …>` + the exact tree <td-media-gallery>
     * renders (head with label + count, `ul.td-media-gallery__list` with one `li` per item — sizer, preview, handle,
     * Cắt / Gỡ buttons, the alt input in `usage` mode —, the Add button, the live regions, the sort help, helper + error
     * notes) + the NO-JS form parts, i.e. exactly the FormData of the component (decision 14): reference → a hidden
     * `input.td-media-gallery__value` `name[]` per item; usage → hidden `name[i][id]`, the alt input `name[i][alt]`,
     * hidden `name[i][crop]` (+ `name[i][focal]` with focal_point); empty → ONE hidden `name=` after the list. The
     * handle / Cắt / Gỡ / Add buttons are hidden by td.css until `@dazzxq/td-components/media-gallery` defines the
     * element (no dead control); it adopts the markup IN PLACE. Without JS the order is the printed one and the alt is
     * editable (a real named input).
     * $items: a LIST of ['id' => string|int, 'src', 'name' (display name), 'kind' (image|video|file), 'alt' (≤ 500),
     * 'crop' (array x / y / width / height in 0..1 or the JSON v1 string), 'focal' (array x / y or JSON v1)]. An int id
     * is turned into its decimal string FIRST (0 → "0"); then td__media_gallery_items() = validateItems() of
     * src/utils/media-field-model.js (GALLERY_CASES parity). src through td__media_url (refused → no image, item kept);
     * an invalid crop / focal → null; unknown keys ignored.
     * Options: label, helper_text, error_text, required, disabled, min, max (integer 1..100, default and ceiling 100),
     * usage, croppable / crop_ratio / focal_point (usage only — else dropped + ONE E_USER_WARNING), cover, aspect_ratio
     * (`W/H`, `W:H` or one number; the tile ratio, default 1:1), preview_fit (cover|contain), accept_kind, prompt, id,
     * class, attrs (host: allowlisted; owned names and data-td-* reserved).
     * Fail closed (decision 15) — items not a list / > 100 / an item without a valid unique id / an id of another type /
     * the `items` JSON over 256 KiB, or a `name` ending in `[]`: the broken tree, NO input at all + ONE E_USER_WARNING
     * naming the reason and the count only (never a value); the `items` attribute is `[null]` so the element fails closed
     * too. Overflow (decision 8) — more items than `max`: every item printed, NO control carries a `name` (nothing is
     * submitted: the server keeps its data) + ONE E_USER_WARNING with the counts.
     * Never prints adapter endpoints, permissions or serialized assets. The server must still validate (ADR 0021).
     */
    function td_media_gallery(string $name, array $items = [], array $o = []): string
    {
        $L = Td::MEDIA_GALLERY_LABELS;
        $f = static function (string $t, array $p): string {
            $map = [];
            foreach ($p as $k => $v) {
                $map['{' . $k . '}'] = (string) $v;
            }
            return strtr($t, $map); // one pass, like the JS template fill: a value is never re-expanded
        };
        $hostId = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $hid = Td::e($hostId);
        $label = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) ? (string) $o['label'] : '';
        $help = td__str($o['helper_text'] ?? null);
        $error = td__str($o['error_text'] ?? null);
        $prompt = td__str($o['prompt'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $usage = !empty($o['usage']);
        $cover = !empty($o['cover']);
        $kinds = td__media_kinds($o['accept_kind'] ?? null);
        $maxOpt = Td::intOpt($o['max'] ?? null, 1);
        $max = $maxOpt !== null ? min((int) $maxOpt, Td::MEDIA_GALLERY_MAX_ITEMS) : null;
        $limit = $max ?? Td::MEDIA_GALLERY_MAX_ITEMS;
        $minOpt = Td::intOpt($o['min'] ?? null, 0);
        $min = $minOpt !== null ? min((int) $minOpt, $limit) : null;
        $ratioRaw = isset($o['aspect_ratio']) && is_scalar($o['aspect_ratio']) && !is_bool($o['aspect_ratio']) ? (string) $o['aspect_ratio'] : null;
        $ratio = $ratioRaw !== null && $ratioRaw !== '' ? td__media_ratio($ratioRaw) : null;
        if ($ratio === null && $ratioRaw !== null && $ratioRaw !== '') {
            trigger_error('td_media_gallery: aspect_ratio is not W/H, W:H or a positive number (≤ 10000, ≤ 4 decimals) — ignored', E_USER_WARNING);
        }
        $fit = in_array($o['preview_fit'] ?? null, ['cover', 'contain'], true) ? $o['preview_fit'] : null;
        // croppable / crop_ratio / focal_point: usage mode only (fail closed: the reference shape has no crop entry)
        $croppable = false;
        $focalOn = false;
        $cropRatio = null;
        $crRaw = isset($o['crop_ratio']) && is_scalar($o['crop_ratio']) && !is_bool($o['crop_ratio']) ? (string) $o['crop_ratio'] : null;
        $v35 = !empty($o['croppable']) || !empty($o['focal_point']) || ($crRaw !== null && $crRaw !== '');
        if ($v35 && !$usage) {
            trigger_error('td_media_gallery: croppable / crop_ratio / focal_point need usage — ignored', E_USER_WARNING);
        } elseif ($v35) {
            $croppable = !empty($o['croppable']);
            $focalOn = !empty($o['focal_point']);
            if ($crRaw !== null && $crRaw !== '' && td__media_crop_ratio($crRaw)) {
                $cropRatio = $crRaw;
            } elseif ($crRaw !== null && $crRaw !== '') {
                trigger_error('td_media_gallery: crop_ratio must be free or W/H, W:H, a number with a ratio in [0.01, 100] — ignored', E_USER_WARNING);
            }
        }

        // decision 15b / 19: one validation path (ints → strings first), then the items attribute (≤ 256 KiB)
        $v = td__media_gallery_items($items, $limit);
        $broken = $v['items'] === null;
        $reason = (string) $v['reason'];
        $list = $broken ? [] : $v['items'];
        $json = null;
        if (!$broken && $list) {
            $rows = [];
            foreach ($list as $it) {
                $row = ['id' => $it['id']];
                foreach (['src' => '', 'name' => '', 'kind' => 'image', 'alt' => '', 'crop' => null, 'focal' => null] as $k => $none) {
                    if ($it[$k] !== $none) {
                        $row[$k] = $it[$k];
                    }
                }
                $rows[] = $row;
            }
            // every string is bounded + valid UTF-8 by now (id ≤ 2048 B, src ≤ 8192 B, name 512 / alt 500 code points, crop 512,
            // focal 128 → ≤ ~1.5 MB for 100 items); an encoding failure still fails closed, never a 500
            try {
                $json = json_encode($rows, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $json = '';
                $broken = true;
                $reason = 'json';
            }
            if (!$broken && td__utf16_length($json) > 262144) {
                $broken = true;
                $reason = 'size';
            }
        }
        if ($broken) {
            trigger_error('td_media_gallery: items rejected (' . $reason . ', ' . count($items) . ' item(s)) — the gallery fails closed, nothing is submitted', E_USER_WARNING);
            $list = [];
            $json = '[null]';
        } elseif ($name !== '' && str_ends_with($name, '[]')) {
            trigger_error('td_media_gallery: a name ending in [] (the gallery appends [] / [i] itself) — the gallery fails closed, nothing is submitted', E_USER_WARNING);
            $broken = true;
            $list = [];
        }
        $count = count($list);
        $overflow = !$broken && $count > $limit;
        if ($overflow) {
            trigger_error('td_media_gallery: ' . $count . ' items exceed max ' . $limit . ' — printed without names (nothing is submitted)', E_USER_WARNING);
        }
        $named = $name !== '' && !$broken && !$overflow;
        $dis = $disabled ? ' disabled' : '';
        $kindWord = $L['kinds'][$kinds[0]];
        $ico = static fn (string $n): string => '<span class="td-media-gallery__icon" data-td-icon="' . $n . '" aria-hidden="true">' . Td::icon($n) . '</span>';
        $hidden = static fn (string $class, string $n, string $val): string => '<input type="hidden" class="' . $class . '" name="'
            . Td::e($n) . '" value="' . Td::e($val) . '"' . $dis . '>';

        $taken = [];
        $html = '<td-media-gallery' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_MEDIA_GALLERY,
            'id' => $hostId,
            'class' => 'td-media-gallery' . Td::classTokens($o['class'] ?? null),
            'name' => $name !== '' ? $name : null,
            'label' => $label !== '' ? $label : null,
            'items' => $json,
            'usage' => $usage,
            'croppable' => $croppable,
            'crop-ratio' => $cropRatio,
            'focal-point' => $focalOn,
            'cover' => $cover,
            'aspect-ratio' => $ratio !== null ? $ratioRaw : null,
            'preview-fit' => $fit,
            'accept-kind' => array_key_exists('accept_kind', $o) && $o['accept_kind'] !== null ? implode(' ', $kinds) : null,
            'min' => $min !== null ? (string) $min : null,
            'max' => $max !== null ? (string) $max : null,
            'required' => $required,
            'disabled' => $disabled,
            'prompt' => $prompt,
            'helper-text' => $help,
            'error-text' => $error,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'name', 'label', 'items', 'usage', 'croppable', 'crop-ratio', 'focal-point', 'cover',
            'aspect-ratio', 'preview-fit', 'accept-kind', 'min', 'max', 'required', 'disabled', 'prompt', 'helper-text',
            'error-text', 'value'], $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '>'
            . '<div class="td-media-gallery__head"><span class="td-media-gallery__label" id="' . $hid . '-label">' . Td::e($label)
            . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</span>';
        $described = implode(' ', array_filter([$help !== null ? $hostId . '-help' : '', $error !== null ? $hostId . '-error' : '']));
        $notes = ($help !== null ? '<span class="td-media-gallery__help" id="' . $hid . '-help">' . Td::e($help) . '</span>' : '')
            . ($error !== null ? '<span class="td-field-error" id="' . $hid . '-error" data-for="' . $hid . '">' . Td::e($error) . '</span>' : '');
        if ($broken) {
            return $html . '</div><span class="td-media-gallery__broken">' . Td::e($L['broken']) . '</span>' . $notes . '</td-media-gallery>';
        }
        // ISSUE-7: the effective max (100 without the option), like the element
        $countText = $f($overflow ? $L['over'] : ($count === $limit ? $L['full'] : $L['countMax']), ['count' => $count, 'max' => $limit, 'kind' => $kindWord]);
        $html .= '<span class="td-media-gallery__count" id="' . $hid . '-count"' . ($overflow ? ' data-state="over"' : '') . '>' . Td::e($countText) . '</span></div>'
            . '<ul class="td-media-gallery__list" role="list" aria-labelledby="' . $hid . '-label" aria-describedby="' . $hid . '-count">';
        $vb = $ratio !== null ? $ratio['w'] . ' ' . $ratio['h'] : '1 1';
        foreach ($list as $i => $it) {
            $base = $it['name'] !== '' ? $it['name'] : ($it['alt'] !== '' ? $it['alt'] : $it['id']);
            $full = $f($L['item'], ['n' => $i + 1, 'count' => $count, 'name' => $base]) . ($cover && $i === 0 ? $L['coverSuffix'] : '');
            $k = $it['kind'];
            $img = $it['src'] !== '' && $k !== 'file';
            $html .= '<li class="td-media-gallery__item" data-kind="' . $k . '"><div class="td-media-gallery__media">'
                . '<svg class="td-media-gallery__sizer" viewBox="0 0 ' . $vb . '" aria-hidden="true" focusable="false"></svg>'
                . ($img
                    ? '<img class="td-media-gallery__img" src="' . Td::e($it['src']) . '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
                    : '<span class="td-media-gallery__file">' . $ico($k) . '<span class="td-media-gallery__name">'
                        . Td::e($it['name'] !== '' ? $it['name'] : $L['noPreview']) . '</span></span>')
                . ($img && $k === 'video' ? '<span class="td-media-gallery__badge">' . Td::e($L['video']) . '</span>' : '')
                . ($cover && $i === 0 ? '<span class="td-media-gallery__cover">' . Td::e($L['cover']) . '</span>' : '')
                . '<button type="button" class="td-sortable__handle td-media-gallery__handle" aria-label="' . Td::e($f($L['handle'], ['name' => $full]))
                . '" aria-describedby="' . $hid . '-sort-help"' . $dis . '>' . $ico('grip') . '</button></div>'
                . '<div class="td-media-gallery__bar">'
                . ($croppable
                    ? '<button type="button" class="td-media-gallery__btn td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="'
                        . Td::e($f($L['crop'], ['name' => $full])) . '"' . ($k === 'image' && $it['src'] !== '' ? '' : ' hidden') . $dis . '>' . $ico('crop') . '</button>'
                    : '')
                . '<button type="button" class="td-media-gallery__btn td-media-gallery__remove" aria-label="' . Td::e($f($L['remove'], ['name' => $full])) . '"'
                . $dis . '>' . $ico('trash') . '</button></div>'
                . ($named ? $hidden('td-media-gallery__value', $usage ? $name . '[' . $i . '][id]' : $name . '[]', $it['id']) : '')
                . ($usage
                    ? '<label class="td-media-gallery__alt-field"><span class="td-sr-only">' . Td::e($f($L['alt'], ['n' => $i + 1])) . '</span>'
                        . '<input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="' . Td::e($L['altPlaceholder']) . '"'
                        . ($named ? ' name="' . Td::e($name . '[' . $i . '][alt]') . '"' : '') . ($it['alt'] !== '' ? ' value="' . Td::e($it['alt']) . '"' : '') . $dis . '></label>'
                    : '')
                . ($named && $usage ? $hidden('td-media-gallery__crop', $name . '[' . $i . '][crop]', $it['crop'] ?? 'null') : '')
                . ($named && $usage && $focalOn ? $hidden('td-media-gallery__focal', $name . '[' . $i . '][focal]', $it['focal'] ?? 'null') : '')
                . '</li>';
        }
        $html .= '</ul>' . ($named && $count === 0 ? $hidden('td-media-gallery__value', $name, '') : '');
        $empty = $count === 0;
        $html .= '<button type="button" class="td-media-gallery__add" data-state="' . ($empty ? 'empty' : 'filled') . '" aria-haspopup="dialog"'
            . ($described !== '' ? ' aria-describedby="' . Td::e($described) . '"' : '')
            . ($error !== null ? ' aria-invalid="true" aria-errormessage="' . $hid . '-error"' : '')
            . ($count >= $limit ? ' hidden' : '') . $dis . '>'
            . ($empty
                ? $ico($kinds[0]) . '<span class="td-media-gallery__prompt">' . Td::e($prompt ?? $L['prompt'][$kinds[0]]) . '</span>'
                    . ($ratio !== null ? '<span class="td-media-gallery__ratio">' . Td::e($ratio['text']) . '</span>' : '')
                : $ico('plus') . '<span class="td-media-gallery__prompt">' . Td::e($L['add'][$kinds[0]]) . '</span>')
            . '</button>'
            . '<span class="td-sr-only td-media-gallery__status" role="status"></span>'
            . '<span class="td-sr-only td-media-gallery__sort-status" role="status"></span>'
            . '<span class="td-media-gallery__sort-help" id="' . $hid . '-sort-help" hidden>' . Td::e($L['sortHelp']) . '</span>';
        return $html . $notes . '</td-media-gallery>';
    }

    /**
     * @internal v0.43.0 decision 15b: validateItems() of src/utils/media-field-model.js (GALLERY_CASES parity), after the
     * PHP-only step of decision 19 (an int id → its decimal string; every other non-string id → `id`). Returns
     * ['ok' => bool, 'reason' => null|'type'|'ceiling'|'item'|'id'|'duplicate'|'max', 'items' => list|null] with items
     * ['id', 'src' (''), 'name' (''), 'kind', 'alt' (≤ 500 code points), 'crop' (?JSON v1), 'focal' (?JSON v1)].
     * Structural errors → items null; more than $max → reason `max` WITH the items.
     */
    function td__media_gallery_items(mixed $items, int $max = 100): array
    {
        $fail = static fn (string $r): array => ['ok' => false, 'reason' => $r, 'items' => null];
        $isList = static fn (array $a): bool => $a === [] || array_keys($a) === range(0, count($a) - 1);
        if (!is_array($items) || !$isList($items)) {
            return $fail('type');
        }
        if (count($items) > Td::MEDIA_GALLERY_MAX_ITEMS) {
            return $fail('ceiling');
        }
        foreach ($items as $x) {
            // a JSON object is a PHP array with string keys; a JSON list (or a scalar / null) is not an item
            if (!is_array($x) || ($x !== [] && $isList($x))) {
                return $fail('item');
            }
        }
        $seen = [];
        $ids = [];
        foreach ($items as $x) {
            $id = $x['id'] ?? null;
            if (is_int($id)) {
                $id = (string) $id; // decision 19 (plan review r2 #4): 0 → "0", -1 → "-1"
            }
            // review round 1 SEC-1: bytes bounded BEFORE any scan (512 UTF-16 units ≤ 2048 UTF-8 bytes), valid UTF-8 only
            if (!is_string($id) || $id === '' || strlen($id) > 2048 || preg_match('//u', $id) !== 1 || td__utf16_length($id) > 512) {
                return $fail('id');
            }
            if (isset($seen[$id])) {
                return $fail('duplicate');
            }
            $seen[$id] = true;
            $ids[] = $id;
        }
        $out = [];
        foreach ($items as $i => $x) {
            $out[] = [
                'id' => $ids[$i],
                'src' => td__media_url($x['src'] ?? null) ?? '',
                // review round 1 ISSUE-3 / SEC-1: valid UTF-8, capped like the JS normaliser (512 code points; invalid → '')
                'name' => isset($x['name']) && is_string($x['name']) ? td__utf8_prefix($x['name'], 512) : '',
                'kind' => in_array($x['kind'] ?? null, ['image', 'video', 'file'], true) ? $x['kind'] : 'image',
                'alt' => isset($x['alt']) && is_string($x['alt']) ? td__utf8_prefix($x['alt'], 500) : '',
                'crop' => td__media_crop($x['crop'] ?? null, false),
                'focal' => td__media_focal($x['focal'] ?? null, false),
            ];
        }
        return count($out) > max(0, min($max, Td::MEDIA_GALLERY_MAX_ITEMS))
            ? ['ok' => false, 'reason' => 'max', 'items' => $out]
            : ['ok' => true, 'reason' => null, 'items' => $out];
    }

    /** @internal v0.43.0: length of a UTF-8 string in UTF-16 code units (JS `String#length`); invalid UTF-8 → PHP_INT_MAX. */
    function td__utf16_length(string $s): int
    {
        $points = preg_match_all('/./su', $s);
        if ($points === false) {
            return PHP_INT_MAX;
        }
        return $points + (int) preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $s);
    }

    /**
     * v0.31.0 masked value (contract masked-value@1, plan v0.31.0-sortable-masked M6): ALWAYS the element
     * `<td-masked-value data-td-ssr="masked-value@1" class="td-masked">` + `span.td-masked__text` (the masked string) + the
     * toggle (hidden while the element is undefined — no dead button) + the live region, exactly as <td-masked-value>
     * renders them; hydrated IN PLACE by `@dazzxq/td-components/masked-value`.
     * The signature has NO parameter for the real value, on purpose: the real value must come from the app's endpoint
     * (permission + 2FA + audit) through the element's `reveal()` hook — printing it in the page (even `hidden` /
     * `data-*`) leaks it through the page source, caches, bfcache, extensions and logs. Masking is app logic (no masking
     * helper here): pass the string the server already masked. $masked: text.
     * Options: label (what the value is — the toggle reads "Hiện {label}"; default "giá trị"), duration (seconds, cast to
     * int and clamped to [2, 600] like the component; invalid → absent = 30), copyable, disabled, id, class (host, after
     * `td-masked`), attrs (host: allowlisted + aria-* / data-* — e.g. `data-id` for the hook; owned names and data-td-*
     * reserved).
     */
    function td_masked_value(string $masked, array $o = []): string
    {
        $label = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $name = 'Hiện ' . ($label ?? 'giá trị');
        $d = Td::intOpt($o['duration'] ?? null, PHP_INT_MIN);
        $duration = $d === null || is_bool($o['duration'] ?? null) ? null : (string) max(2, min(600, (int) $d));
        $disabled = !empty($o['disabled']);
        $taken = [];
        $html = '<td-masked-value' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_MASKED_VALUE,
            'id' => td__str($o['id'] ?? null),
            'class' => 'td-masked' . Td::classTokens($o['class'] ?? null),
            'masked' => $masked,
            'label' => $label,
            'duration' => $duration,
            'copyable' => !empty($o['copyable']),
            'disabled' => $disabled,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'masked', 'label', 'duration', 'copyable', 'disabled', 'aria-busy'], $extra, $taken);
        return $html . Td::attrs($extra, $taken) . '>'
            . '<span class="td-masked__text" translate="no">' . Td::e($masked) . '</span>'
            . '<button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="' . Td::e($name)
            . '" data-tooltip="' . Td::e($name) . '"' . ($disabled ? ' aria-disabled="true"' : '') . '>'
            . '<span class="td-masked__icon" data-td-icon="eye" aria-hidden="true">' . Td::icon('eye') . '</span></button>'
            . '<span class="td-sr-only" role="status"></span></td-masked-value>';
    }

    /**
     * v0.38.0 scan input for keyboard-wedge barcode scanners (contract scan-input@1, plan v0.38.0-scan-input QĐ 19).
     * SINGLE (default): a NATIVE text field that works without JS (Enter submits the form — accepted without JS) —
     * `div.td-scan` > [label] + `div.td-scan__box` > `input.td-scan__input` (autocomplete / autocapitalize / autocorrect off,
     * spellcheck false, enterkeyhint done, name / value / required…) [+ the error note]; `element` (bool, default
     * Td::configure ssr_elements): the same field inside `<td-scan-input data-td-ssr="scan-input@1">`, adopted IN PLACE by
     * `@dazzxq/td-components/scan-input`. MULTIPLE (`multiple => true`, always the element): host > `div.td-scan
     * [data-mode=multiple]` > [label] + box > input (no name) + `textarea.td-scan__fallback[name]` (typed by hand without
     * JS, one code per line — the SERVER must split that entry on line breaks) + `ul.td-scan__list` > one
     * `li.td-scan__item[data-value] > span.td-scan__value` per value; then one `input[type=hidden].td-scan__hidden[name]
     * [value]` per value (same order), the error note last. Values print as the server's VALID state (never re-validated
     * by the kit) and are the form-reset default. Options: label, value (single), values (multiple: list of strings),
     * multiple, placeholder, required, disabled, min_length (1–64), max (multiple, ≥ 1), inputmode (none | text | numeric |
     * decimal | tel | search | email | url), beep, error (text), aria_label (when there is no label; default "Mã quét"),
     * id (the INPUT id; element mode: host = {id}-host), class (wrapper / host), attrs (the input: allowlisted; owned
     * names and data-td-* reserved). Values are normalised like the component (td__scan_value(): C0 / C1 controls
     * stripped, trimmed, ≤ 128 code points); at most 1000 values, empty / duplicate dropped.
     */
    function td_scan_input(string $name, array $o = []): string
    {
        $multiple = !empty($o['multiple']);
        $element = $multiple || td__element($o);
        $callerId = td__str($o['id'] ?? null);
        $hostId = $element ? ($callerId !== null ? $callerId . '-host' : td__host_uid($name)) : null;
        $cid = $callerId ?? ($element ? $hostId . '-input' : td__host_uid($name) . '-input');
        $label = isset($o['label']) && is_scalar($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;
        $placeholder = td__str($o['placeholder'] ?? null);
        $modes = ['none', 'text', 'numeric', 'decimal', 'tel', 'search', 'email', 'url'];
        $inputmode = isset($o['inputmode']) && in_array($o['inputmode'], $modes, true) ? $o['inputmode'] : null;
        $int = static function (mixed $v, int $min, int $max): ?int {
            $n = is_int($v) ? $v : (is_string($v) && preg_match('/^\s*[0-9]{1,9}\s*$/', $v) ? (int) trim($v) : null);
            return $n !== null && $n >= $min && $n <= $max ? $n : null;
        };
        $minLength = $int($o['min_length'] ?? null, 1, 64);
        $max = $multiple ? $int($o['max'] ?? null, 1, 100000) : null;
        $error = td__str($o['error'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $nameAttr = $name !== '' ? $name : null;
        $value = !$multiple && isset($o['value']) && is_scalar($o['value']) ? td__scan_value((string) $o['value']) : '';
        $values = $multiple ? td__scan_values($o['values'] ?? []) : [];
        $errId = ($element ? $hostId : $cid) . '-error';
        $taken = [];
        $input = '<input' . Td::ownAttrs([
            'type' => 'text',
            'class' => 'td-scan__input',
            'id' => $cid,
            'autocomplete' => 'off',
            'autocapitalize' => 'none',
            'autocorrect' => 'off',
            'spellcheck' => 'false',
            'enterkeyhint' => 'done',
            'inputmode' => $inputmode,
            'placeholder' => $placeholder,
            'name' => $multiple ? null : $nameAttr,
            'value' => $value !== '' ? $value : null,
            'required' => !$multiple && $required,
            'disabled' => $disabled,
            'autofocus' => !empty($o['autofocus']),
            'aria-label' => $label === null ? ($aria ?? Td::SCAN_LABELS['input']) : null,
            'aria-invalid' => $error !== null && !$multiple ? 'true' : null,
            'aria-errormessage' => $error !== null && !$multiple ? $errId : null,
            'aria-describedby' => $error !== null && !$multiple ? $errId : null,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['type', 'class', 'id', 'autocomplete', 'autocapitalize', 'autocorrect', 'spellcheck', 'enterkeyhint',
            'inputmode', 'placeholder', 'name', 'value', 'required', 'disabled', 'readonly', 'autofocus', 'maxlength', 'minlength',
            'pattern', 'aria-label', 'aria-labelledby', 'aria-invalid', 'aria-errormessage', 'aria-describedby'], $extra, $taken);
        $input .= Td::attrs($extra, $taken) . '>';
        $labelHtml = $label !== null ? '<label class="td-scan__label" for="' . Td::e($cid) . '">' . Td::e($label) . '</label>' : '';
        $note = $error !== null
            ? '<span class="td-field-error" id="' . Td::e($errId) . '" data-for="' . Td::e($element ? $hostId : $cid) . '">' . Td::e($error) . '</span>'
            : '';
        $box = '<div class="td-scan__box">' . $input . '</div>';
        if (!$element) {
            return '<div class="td-scan' . Td::e(Td::classTokens($o['class'] ?? null)) . '">' . $labelHtml . $box . $note . '</div>';
        }
        $hostTaken = [];
        $host = '<td-scan-input' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_SCAN_INPUT,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $nameAttr,
            'value' => $value !== '' ? $value : null,
            'label' => $label,
            'placeholder' => $placeholder,
            'inputmode' => $inputmode,
            'min-length' => $minLength !== null ? (string) $minLength : null,
            'max' => $max !== null ? (string) $max : null,
            'multiple' => $multiple,
            'beep' => !empty($o['beep']),
            'required' => $required,
            'disabled' => $disabled,
            'error-text' => $error,
            'aria-label' => $aria,
        ], $hostTaken) . '>';
        if (!$multiple) {
            return $host . '<div class="td-scan">' . $labelHtml . $box . '</div>' . $note . '</td-scan-input>';
        }
        $items = '';
        $hidden = '';
        foreach ($values as $v) {
            $items .= '<li class="td-scan__item" data-value="' . Td::e($v) . '"><span class="td-scan__value">' . Td::e($v) . '</span></li>';
            $hidden .= '<input type="hidden" class="td-scan__hidden"' . ($nameAttr !== null ? ' name="' . Td::e($nameAttr) . '"' : '')
                . ' value="' . Td::e($v) . '"' . ($disabled ? ' disabled' : '') . '>';
        }
        $textarea = '<textarea class="td-scan__fallback"' . ($nameAttr !== null ? ' name="' . Td::e($nameAttr) . '"' : '')
            . ' rows="3" aria-label="' . Td::e(Td::SCAN_LABELS['fallback']) . '"' . ($disabled ? ' disabled' : '') . '></textarea>';
        return $host . '<div class="td-scan" data-mode="multiple">' . $labelHtml . $box . $textarea
            . '<ul class="td-scan__list" aria-label="' . Td::e(Td::SCAN_LABELS['list']) . '">' . $items . '</ul></div>'
            . $hidden . $note . '</td-scan-input>';
    }

    /**
     * v0.40.0 (plan v0.39.0-filters-range QĐ 26): a date (or date-time) RANGE — always the element
     * `<td-datetime-range data-td-ssr="datetime-range@1">`. Without JS it is two native `<input type="date|datetime-local">`
     * named `{name}[start]` / `{name}[end]` (or `start_name` / `end_name`) with min / max and the per-side `required`
     * (true / 'both' → both, 'start' / 'end' → that input only); with JS the element adopts the markup in place (its own
     * gate), takes the LIVE native values and removes the native block (FormData keeps one pair — the host's).
     * Values: `dd/mm/yyyy[ - hh:mm]`, `yyyy-mm-dd`, `yyyy-mm-ddThh:mm[:ss]` or the DB `yyyy-mm-dd hh:mm[:ss]`; an invalid
     * value / bound is dropped. Options: label, mode (date | datetime), min, max, required, disabled, max_days,
     * minute_step, form_value_format (iso | display | db), start_name, end_name, placeholder, error, attrs (host),
     * class, id.
     */
    function td_datetime_range(string $name, ?string $start = null, ?string $end = null, array $o = []): string
    {
        $L = Td::RANGE_LABELS;
        $mode = ($o['mode'] ?? null) === 'datetime' ? 'datetime' : 'date';
        $id = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $hid = Td::e($id);
        $label = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) ? (string) $o['label'] : '';
        $placeholder = td__str($o['placeholder'] ?? null);
        $error = td__str($o['error'] ?? null);
        $disabled = !empty($o['disabled']);
        $req = td__dtr_required($o['required'] ?? null);
        $s = $start !== null ? td__dtr_parts($start, $mode, 'start') : null;
        $e = $end !== null ? td__dtr_parts($end, $mode, 'end') : null;
        $min = isset($o['min']) && is_string($o['min']) ? td__dtr_parts($o['min'], $mode, 'start') : null;
        $max = isset($o['max']) && is_string($o['max']) ? td__dtr_parts($o['max'], $mode, 'end') : null;
        $int = static function (mixed $v, int $lo, int $hi): ?int {
            $n = is_int($v) ? $v : (is_string($v) && preg_match('/^\s*[0-9]{1,9}\s*$/', $v) ? (int) trim($v) : null);
            return $n !== null && $n >= $lo && $n <= $hi ? $n : null;
        };
        $maxDays = $int($o['max_days'] ?? null, 1, 100000);
        $step = $int($o['minute_step'] ?? null, 1, 30);
        if ($step !== null && 60 % $step !== 0) {
            $step = null;
        }
        $fmt = in_array($o['form_value_format'] ?? null, ['iso', 'display', 'db'], true) ? $o['form_value_format'] : null;
        $startName = td__str($o['start_name'] ?? null);
        $endName = td__str($o['end_name'] ?? null);
        $names = [
            'start' => $startName ?? ($name !== '' ? $name . '[start]' : null),
            'end' => $endName ?? ($name !== '' ? $name . '[end]' : null),
        ];
        $display = static fn (?array $p): ?string => $p === null ? null
            : sprintf('%02d/%02d/%04d', $p[2], $p[1], $p[0]) . ($mode === 'datetime' ? sprintf(' - %02d:%02d', $p[3], $p[4]) : '');
        $native = static fn (?array $p): ?string => $p === null ? null
            : sprintf('%04d-%02d-%02d', $p[0], $p[1], $p[2]) . ($mode === 'datetime' ? sprintf('T%02d:%02d', $p[3], $p[4]) : '');
        $a = $display($s);
        $b = $display($e);
        if ($a === null && $b === null) {
            $text = $placeholder ?? ($mode === 'datetime' ? $L['placeholderDatetime'] : $L['placeholder']);
        } elseif ($a !== null && $b !== null) {
            $text = $a . ' – ' . $b;
        } else {
            $text = $a !== null ? $L['fromPrefix'] . ' ' . $a : $L['toPrefix'] . ' ' . $b;
        }
        $required = $req['parts'] !== [];

        $taken = [];
        $html = '<td-datetime-range' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_DATETIME_RANGE,
            'id' => $id,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'mode' => $mode,
            'start' => $a,
            'end' => $b,
            'start-name' => $startName,
            'end-name' => $endName,
            'label' => $label !== '' ? $label : null,
            'placeholder' => $placeholder,
            'min' => $native($min),
            'max' => $native($max),
            'max-days' => $maxDays !== null ? (string) $maxDays : null,
            'minute-step' => $step !== null ? (string) $step : null,
            'form-value-format' => $fmt,
            'required' => $req['attr'],
            'disabled' => $disabled,
            'error-text' => $error,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'name', 'mode', 'start', 'end', 'start-name', 'end-name', 'label', 'placeholder', 'min',
            'max', 'max-days', 'minute-step', 'form-value-format', 'open-at', 'required', 'disabled', 'error-text', 'value'], $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '>';

        $natives = '';
        foreach (['start' => $s, 'end' => $e] as $k => $p) {
            $natives .= '<label class="td-dtr__native-label" for="' . $hid . '-' . $k . '">' . Td::e($L[$k]) . '</label>'
                . '<input class="td-dtr__native" type="' . ($mode === 'datetime' ? 'datetime-local' : 'date') . '" id="' . $hid . '-' . $k
                . '" data-part="' . $k . '"'
                . ($names[$k] !== null ? ' name="' . Td::e($names[$k]) . '"' : '')
                . ($p !== null ? ' value="' . Td::e($native($p)) . '"' : '')
                . ($min !== null ? ' min="' . Td::e($native($min)) . '"' : '')
                . ($max !== null ? ' max="' . Td::e($native($max)) . '"' : '')
                . (in_array($k, $req['parts'], true) ? ' required' : '')
                . ($disabled ? ' disabled' : '')
                . ($error !== null ? ' aria-invalid="true" aria-describedby="' . $hid . '-error"' : '') . '>';
        }
        return $html . '<div class="td-dtr" data-state="closed">'
            . ($label !== '' ? '<span class="td-field__label td-dtr__label" id="' . $hid . '-label">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</span>' : '')
            . '<div class="td-dtr__natives" role="group"' . ($label !== '' ? ' aria-labelledby="' . $hid . '-label"' : '') . '>' . $natives . '</div>'
            . '<button type="button" class="td-dtr__trigger" id="' . $hid . '-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false"'
            . ($label !== '' ? ' aria-labelledby="' . $hid . '-label"' : '') . ($required ? ' aria-required="true"' : '') . ($disabled ? ' disabled' : '') . '>'
            . '<span class="td-dtr__value"' . ($a === null && $b === null ? ' data-placeholder' : '') . '>' . Td::e($text) . '</span>'
            . '<span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>'
            . ($error !== null ? '<span class="td-field-error" id="' . $hid . '-error" data-for="' . $hid . '">' . Td::e($error) . '</span>' : '')
            . '</td-datetime-range>';
    }

    /**
     * @internal v0.40.0 the `required` table of <td-datetime-range> (src/utils/date-presets.js requiredParts, parity
     * REQUIRED_CASES): null / false → none; true → both (bare); a string trimmed + lower-cased: '' / required / true /
     * both → both; start / end → that side; anything else → both (the safer reading).
     * @return array{attr: string|bool|null, parts: array<int,string>}
     */
    function td__dtr_required(mixed $v): array
    {
        if ($v === null || $v === false) {
            return ['attr' => null, 'parts' => []];
        }
        $s = is_string($v) ? strtolower(trim($v)) : '';
        if ($s === 'start' || $s === 'end') {
            return ['attr' => $s, 'parts' => [$s]];
        }
        return ['attr' => true, 'parts' => ['start', 'end']];
    }

    /**
     * @internal v0.40.0 a range value / bound → [y, m, d, h, i] or null: `dd/mm/yyyy[ - hh:mm]`, `yyyy-mm-dd`,
     * `yyyy-mm-dd[T| ]hh:mm[:ss]`. A real calendar date (years 1–9999), hour 0–23, minute 0–59. Date mode drops the time;
     * datetime mode gives a date-only start (or min) 00:00 and a date-only end (or max) 23:59 (like parseBound).
     * @return array{0:int,1:int,2:int,3:int,4:int}|null
     */
    function td__dtr_parts(string $v, string $mode, string $side): ?array
    {
        $v = trim($v);
        if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-\s*(\d{1,2}):(\d{1,2}))?$/', $v, $m)) {
            [$y, $mo, $d] = [(int) $m[3], (int) $m[2], (int) $m[1]];
            $t = isset($m[4]) && $m[4] !== '' ? [(int) $m[4], (int) $m[5]] : null;
        } elseif (preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::([0-5]\d))?)?$/', $v, $m)) {
            [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
            $t = isset($m[4]) && $m[4] !== '' ? [(int) $m[4], (int) $m[5]] : null;
        } else {
            return null;
        }
        if ($y < 1 || $y > 9999 || !checkdate($mo, $d, $y)) {
            return null;
        }
        if ($t !== null && ($t[0] > 23 || $t[1] > 59)) {
            return null;
        }
        if ($mode !== 'datetime') {
            return [$y, $mo, $d, 0, 0];
        }
        return [$y, $mo, $d, ...($t ?? ($side === 'end' ? [23, 59] : [0, 0]))];
    }

    /**
     * @internal v0.38.0 a scanned value as <td-scan-input> keeps it (src/utils/scan-burst.js normalizeScan, parity
     * SCAN_NORMALIZE_CASES): C0 / C1 controls stripped (the GS1 \x1D too), JS-whitespace trimmed, at most $max code
     * points (then trimmed at the end again). Invalid UTF-8 → ''.
     */
    function td__scan_value(string $v, int $max = 128): string
    {
        if (!preg_match('//u', $v)) {
            return '';
        }
        $ws = '[' . Td::JS_WS . ']';
        $s = (string) preg_replace('/[\x{0}-\x{1F}\x{7F}-\x{9F}]/u', '', $v);
        $s = (string) preg_replace('/^' . $ws . '+|' . $ws . '+$/u', '', $s);
        $cut = td__utf8_prefix($s, $max);
        return $cut === $s ? $s : (string) preg_replace('/' . $ws . '+$/u', '', $cut);
    }

    /**
     * @internal v0.38.0 `values` of td_scan_input (= normalizeValues): strings / integers normalised, empty and duplicate
     * values dropped (first kept), at most 1000. Anything else → [].
     * @return array<int,string>
     */
    function td__scan_values(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        $seen = [];
        foreach (array_slice(array_values($list), 0, 4000) as $raw) {
            if (!is_string($raw) && !is_int($raw)) {
                continue;
            }
            $v = td__scan_value((string) $raw);
            if ($v === '' || isset($seen[$v])) {
                continue;
            }
            $seen[$v] = true;
            $out[] = $v;
            if (count($out) >= 1000) {
                break;
            }
        }
        return $out;
    }

    /**
     * v0.39.0 active filter chips (contract filter-chips@1, plan v0.39.0-filters-range QĐ 11–16) — ALWAYS the element
     * `<td-filter-chips data-td-ssr="filter-chips@1">` + the exact tree <td-filter-chips> builds, hydrated IN PLACE by
     * `@dazzxq/td-components/filter-chips`: `div.td-filter-chips[role=group][aria-label]` > `ul.td-filter-chips__list`
     * > one `li.td-filter-chips__item[data-id][data-key][data-removable]` per item = `span.td-filter-chips__label` +
     * `span.td-filter-chips__sep` (": ", aria-hidden) + `span.td-filter-chips__value` + the × (`aria-label` "Bỏ lọc
     * {label}: {value}"): `a.td-filter-chips__remove[href]` when the item has a safe `href` (the URL WITHOUT that filter,
     * computed by the server — works without JS), else `button[data-td-js-only]` (hidden until the module loads, no dead
     * control); no × when `removable` is false. "Xoá tất cả" (≥ 2 removable chips): `a[href=clear_href]` or a JS-only
     * button. Then the live region. No items → the host is `hidden`.
     * $items: list of ['key' => …, 'value' => …, 'label'?, 'id'?, 'removable'?, 'href'?] — key / value / label / id are
     * strings or numbers (cast; anything else, e.g. an ARRAY value → the item is dropped + one E_USER_WARNING: one item per
     * value, same key, different id), control characters removed, cut to 200 / 500 / 200 / 200 code points (key / value /
     * label / id); label and id default to the key; a duplicate id gets `-2`, `-3`… (= src/utils/filter-chips-model.js).
     * `href` / `clear_href`: Td::safeUrl(), then http(s) or relative only (mailto: / tel: refused) — refused → no link.
     * Options: label (group name; default "Bộ lọc đang áp dụng"), clear_href, empty_focus (id of the element that gets
     * focus when the last chip is removed, e.g. the search box), id, class, attrs (host: allowlisted + aria-* / data-*;
     * owned names and data-td-* reserved).
     */
    function td_filter_chips(array $items, array $o = []): string
    {
        $L = Td::FILTER_CHIPS_LABELS;
        $list = td__filter_items($items);
        $label = td__str($o['label'] ?? null);
        $clear = td__filter_href($o['clear_href'] ?? null);
        $taken = [];
        $html = '<td-filter-chips' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_FILTER_CHIPS,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'label' => $label,
            'clear-href' => $clear,
            'empty-focus' => td__str($o['empty_focus'] ?? null),
            'hidden' => !$list,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'label', 'clear-href', 'empty-focus', 'hidden'], $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '>'
            . '<div class="td-filter-chips" role="group" aria-label="' . Td::e($label ?? $L['group']) . '">'
            . '<ul class="td-filter-chips__list" role="list">';
        $icon = '<span class="td-filter-chips__icon" data-td-icon="close" data-td-icon-size="14" aria-hidden="true">'
            . Td::icon('close', 14) . '</span>';
        $removable = 0;
        foreach ($list as $it) {
            $html .= '<li class="td-filter-chips__item" data-id="' . Td::e($it['id']) . '" data-key="' . Td::e($it['key'])
                . '" data-removable="' . ($it['removable'] ? 'true' : 'false') . '">'
                . '<span class="td-filter-chips__label">' . Td::e($it['label']) . '</span>'
                . '<span class="td-filter-chips__sep" aria-hidden="true">: </span>'
                . '<span class="td-filter-chips__value">' . Td::e($it['value']) . '</span>';
            if ($it['removable']) {
                $removable++;
                $name = Td::e(strtr($L['remove'], ['{label}' => $it['label'], '{value}' => $it['value']]));
                $html .= $it['href'] !== null
                    ? '<a class="td-filter-chips__remove" href="' . Td::e($it['href']) . '" aria-label="' . $name . '">' . $icon . '</a>'
                    : '<button type="button" class="td-filter-chips__remove" data-td-js-only aria-label="' . $name . '">' . $icon . '</button>';
            }
            $html .= '</li>';
        }
        $html .= '</ul>';
        if ($removable >= 2) {
            $html .= $clear !== null
                ? '<a class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" href="' . Td::e($clear) . '">' . Td::e($L['clearAll']) . '</a>'
                : '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" data-td-js-only>' . Td::e($L['clearAll']) . '</button>';
        }
        return $html . '</div><p class="td-sr-only" role="status"></p></td-filter-chips>';
    }

    /**
     * @internal td_filter_chips items → [['id','key','label','value','removable','href'(?string)]] (= normalizeItems() of
     * src/utils/filter-chips-model.js). Bounded (review SEC-1): at most 200 chips and 800 inspected entries (the rest
     * never looked at + ONE E_USER_WARNING), dropped items → ONE E_USER_WARNING per call, a per-base suffix counter for duplicate ids.
     */
    function td__filter_items(array $items): array
    {
        $out = [];
        $used = [];
        $next = [];
        $dropped = 0;
        $capped = false;
        $seen = 0;
        foreach ($items as $raw) {
            // review SEC-1 round 2: at most 800 entries are INSPECTED (valid or not), at most 200 chips kept
            if (count($out) >= 200 || $seen >= 800) {
                $capped = true;
                break;
            }
            $seen++;
            if (!is_array($raw)) {
                $dropped++;
                continue;
            }
            $key = td__filter_text($raw['key'] ?? null, 200);
            $value = td__filter_text($raw['value'] ?? null, 500);
            $label = ($raw['label'] ?? null) === null ? $key : td__filter_text($raw['label'], 200);
            $id0 = ($raw['id'] ?? null) === null ? $key : td__filter_text($raw['id'], 200);
            if ($key === null || $key === '' || $value === null || $label === null || $id0 === null) {
                $dropped++;
                continue;
            }
            $base = $id0 !== '' ? $id0 : $key;
            $id = $base;
            if (isset($used['k' . $id])) {
                $n = $next['k' . $base] ?? 2;
                while (isset($used['k' . $base . '-' . $n])) {
                    $n++;
                }
                $id = $base . '-' . $n;
                $next['k' . $base] = $n + 1;
            }
            $used['k' . $id] = true;
            $removable = ($raw['removable'] ?? true) !== false;
            $href = $removable && isset($raw['href']) ? td__filter_href($raw['href']) : null;
            $out[] = ['id' => $id, 'key' => $key, 'label' => $label !== '' ? $label : $key, 'value' => $value,
                'removable' => $removable, 'href' => $href];
        }
        if ($dropped) {
            trigger_error("td_filter_chips: $dropped item(s) dropped — key / value / label / id must be strings or numbers (one item per value)", E_USER_WARNING);
        }
        if ($capped) {
            trigger_error('td_filter_chips: too many items — at most 200 chips (800 entries inspected) are printed', E_USER_WARNING);
        }
        return $out;
    }

    /**
     * @internal A chip link (review SEC-2): Td::safeUrl(), then RELATIVE only — no scheme, no protocol-relative `//`, no
     * backslash (PHP cannot know the page origin; the JS side keeps same-origin URLs). ≤ 8192 bytes. Else null.
     */
    function td__filter_href(mixed $v): ?string
    {
        if (!is_string($v) || strlen($v) > 32768) {
            return null;
        }
        $u = Td::safeUrl($v);
        if ($u === '' || strlen($u) > 8192 || str_contains($u, '\\') || str_starts_with($u, '//')
            || preg_match('/^[A-Za-z][A-Za-z0-9+.\-]*:/', $u)) {
            return null;
        }
        return $u;
    }

    /**
     * @internal A chip field: string or finite number (cast like JavaScript String(n) — td__js_number) → bounded to 4 ×
     * $max bytes (a cut UTF-8 sequence trimmed), control characters removed, first $max code points; else null.
     */
    function td__filter_text(mixed $v, int $max): ?string
    {
        if (is_int($v)) {
            $v = (string) $v;
        } elseif (is_float($v) && is_finite($v)) {
            $v = td__js_number($v);
        } elseif (!is_string($v)) {
            return null;
        }
        if (strlen($v) > $max * 4) {
            $v = substr($v, 0, $max * 4);
            for ($i = 0; $i < 3 && preg_match('//u', $v) !== 1; $i++) {
                $v = substr($v, 0, -1); // a multi-byte character cut by the bound
            }
        }
        $clean = preg_replace('/[\x{0}-\x{1F}\x{7F}-\x{9F}]/u', '', $v);
        return $clean === null ? null : td__utf8_prefix($clean, $max);
    }

    /**
     * @internal ECMAScript Number::toString(x) for a finite float (review ISSUE-2): -0 → "0", shortest round-trip digits
     * (serialize_precision -1), plain notation for 1e-7 < |x| < 1e21, else "de+n" / "d.ddde-n".
     */
    function td__js_number(float $f): string
    {
        if ($f == 0.0) {
            return '0';
        }
        $old = ini_set('serialize_precision', '-1');
        $r = var_export(abs($f), true);
        if ($old !== false) {
            ini_set('serialize_precision', $old);
        }
        if (!preg_match('/^(\d+)(?:\.(\d+))?(?:E([+-]\d+))?$/i', $r, $m)) {
            return (string) $f;
        }
        $digits = $m[1] . ($m[2] ?? '');
        $n = strlen($m[1]) + (int) ($m[3] ?? 0);
        $trimmed = ltrim($digits, '0');
        $n -= strlen($digits) - strlen($trimmed);
        $digits = rtrim($trimmed, '0');
        $k = strlen($digits);
        if ($k <= $n && $n <= 21) {
            $s = $digits . str_repeat('0', $n - $k);
        } elseif (0 < $n && $n <= 21) {
            $s = substr($digits, 0, $n) . '.' . substr($digits, $n);
        } elseif (-6 < $n && $n <= 0) {
            $s = '0.' . str_repeat('0', -$n) . $digits;
        } else {
            $e = $n - 1;
            $s = $digits[0] . ($k > 1 ? '.' . substr($digits, 1) : '') . 'e' . ($e < 0 ? '-' : '+') . abs($e);
        }
        return ($f < 0 ? '-' : '') . $s;
    }

    /**
     * @internal First $max code points of a UTF-8 string with PCRE (no mbstring: plain PHP ≥ 8.0); invalid UTF-8 → ''.
     */
    function td__utf8_prefix(string $s, int $max): string
    {
        return preg_match('/^.{0,' . $max . '}/su', $s, $m) === 1 ? $m[0] : '';
    }

    // --- v0.45.0 td_steps / td_timeline (plan v0.45.0-steps-timeline) ------------------------------------------------

    /**
     * v0.45.0 multi-step progress (contract steps@1, plan v0.45.0-steps-timeline QĐ S1–S6, G3) — ALWAYS the element
     * `<td-steps data-td-ssr="steps@1">` + the exact tree <td-steps> builds, hydrated IN PLACE by
     * `@dazzxq/td-components/steps`: `div.td-steps[role=group][aria-label]` (navigation none) | `nav.td-steps[aria-label]`
     * > `ol.td-steps__list[role=list]` > `li.td-steps__item[data-key][data-state][data-disabled?]` > the step
     * (`span` | `a[href]` | `span[data-td-js-step]` = a clickable step without href, made a button by the hydrate — no dead
     * control without JS; `aria-current="step"` on the current step) > marker (number or ✓ / ! icon), label, state text
     * for screen readers, description; then `p.td-steps__summary[aria-hidden]` (compact line). No steps → host `hidden`.
     * $steps: list of ['label' => …, 'key'?, 'description'?, 'state'? (done|current|error|upcoming), 'href'?, 'disabled'?]
     * — same normalisation as src/utils/steps-model.js (label ≤ 120 / description ≤ 300 / key ≤ 100 code points, control
     * characters removed, key default = position from 1, duplicate key → -2, at most 20 steps; a step without a label is
     * dropped + one E_USER_WARNING). States: ONE precedence rule (QĐ S2, = deriveStates()); conflicts → one
     * E_USER_WARNING listing the codes (current-unmatched, extra-current, anchor-state, complete-current).
     * Options: current (key), complete (bool), orientation (vertical), narrow (vertical), navigation (back | all), label,
     * id, class, attrs (host: allowlisted + aria-* / data-*; owned names and data-td-* reserved).
     */
    function td_steps(array $steps, array $o = []): string
    {
        $L = Td::STEPS_LABELS;
        $list = td__steps_items($steps);
        $current = td__str($o['current'] ?? null);
        $complete = !empty($o['complete']);
        $nav = in_array($o['navigation'] ?? null, ['back', 'all'], true) ? (string) $o['navigation'] : 'none';
        $label = td__str($o['label'] ?? null);
        $d = td__steps_states($list, $current, $complete);
        if ($d['warnings']) {
            trigger_error('td_steps: ' . implode(', ', $d['warnings']) . ' — see docs/components/steps.md (state precedence)', E_USER_WARNING);
        }
        $taken = [];
        $html = '<td-steps' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_STEPS,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'current' => $current,
            'complete' => $complete,
            'orientation' => ($o['orientation'] ?? null) === 'vertical' ? 'vertical' : null,
            'narrow' => ($o['narrow'] ?? null) === 'vertical' ? 'vertical' : null,
            'navigation' => $nav !== 'none' ? $nav : null,
            'label' => $label,
            'hidden' => !$list,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'current', 'complete', 'orientation', 'narrow', 'navigation', 'label', 'hidden'], $extra, $taken);
        $aria = td__js_trim($label ?? '');
        $aria = $aria !== '' ? $aria : $L['group'];
        $html .= Td::attrs($extra, $taken) . '>'
            . ($nav === 'none' ? '<div class="td-steps" role="group" aria-label="' . Td::e($aria) . '">' : '<nav class="td-steps" aria-label="' . Td::e($aria) . '">')
            . '<ol class="td-steps__list" role="list">';
        foreach ($list as $i => $s) {
            $state = $d['states'][$i];
            $click = td__steps_clickable($state, $i, $d['anchor'], $complete, $nav, $s['disabled']);
            $cur = $i === $d['anchor'] ? ' aria-current="step"' : '';
            if ($click && $s['href'] !== null) {
                $open = '<a class="td-steps__step" href="' . Td::e($s['href']) . '"' . $cur . '>';
                $close = '</a>';
            } else {
                $open = '<span class="td-steps__step"' . ($click ? ' data-td-js-step' : '') . $cur . '>';
                $close = '</span>';
            }
            $marker = $state === 'done' || $state === 'error'
                ? '<span class="td-steps__icon" data-td-icon="' . ($state === 'done' ? 'check' : 'error') . '">' . Td::icon($state === 'done' ? 'check' : 'error') . '</span>'
                : (string) ($i + 1);
            $html .= '<li class="td-steps__item" data-key="' . Td::e($s['key']) . '" data-state="' . $state . '"' . ($s['disabled'] ? ' data-disabled' : '') . '>'
                . $open . '<span class="td-steps__marker" aria-hidden="true">' . $marker . '</span>'
                . '<span class="td-steps__label">' . Td::e($s['label']) . '</span>'
                . '<span class="td-sr-only">' . ($state === 'current' ? '' : Td::e($L[$state])) . '</span>'
                . ($s['description'] !== '' ? '<span class="td-steps__desc">' . Td::e($s['description']) . '</span>' : '')
                . $close . '</li>';
        }
        $html .= '</ol>';
        if ($list) {
            $html .= '<p class="td-steps__summary" aria-hidden="true">'
                . Td::e(td__steps_summary($d['anchor'], count($list), $complete, $L, $d['anchor'] >= 0 ? $list[$d['anchor']]['label'] : '')) . '</p>';
        }
        return $html . ($nav === 'none' ? '</div>' : '</nav>') . '</td-steps>';
    }

    /**
     * @internal td_steps steps → [['key','label','description','state'(?string),'href'(?string),'disabled']] (=
     * normalizeSteps() of src/utils/steps-model.js): ≤ 20 steps, ≤ 80 entries inspected, one E_USER_WARNING per kind.
     */
    function td__steps_items(array $steps): array
    {
        $out = [];
        $used = [];
        $next = [];
        $dropped = 0;
        $renamed = 0;
        $capped = false;
        $seen = 0;
        foreach ($steps as $raw) {
            if (count($out) >= 20 || $seen >= 80) {
                $capped = true;
                break;
            }
            $seen++;
            if (!is_array($raw)) {
                $dropped++;
                continue;
            }
            $label = td__filter_text($raw['label'] ?? null, 120);
            if ($label === null || td__js_trim($label) === '') {
                $dropped++;
                continue;
            }
            $desc = ($raw['description'] ?? null) === null ? '' : (td__filter_text($raw['description'], 300) ?? '');
            $k = ($raw['key'] ?? null) === null ? null : td__filter_text($raw['key'], 100);
            $base = $k !== null && $k !== '' ? $k : (string) (count($out) + 1);
            $key = $base;
            if (isset($used['k' . $key])) {
                $n = $next['k' . $base] ?? 2;
                while (isset($used['k' . $base . '-' . $n])) {
                    $n++;
                }
                $key = $base . '-' . $n;
                $next['k' . $base] = $n + 1;
                $renamed++;
            }
            $used['k' . $key] = true;
            $state = $raw['state'] ?? null;
            $out[] = ['key' => $key, 'label' => $label, 'description' => $desc,
                'state' => in_array($state, ['done', 'current', 'error', 'upcoming'], true) ? $state : null,
                'href' => isset($raw['href']) ? td__filter_href($raw['href']) : null,
                'disabled' => ($raw['disabled'] ?? null) === true];
        }
        if ($dropped) {
            trigger_error("td_steps: $dropped step(s) dropped — every step needs a non-empty text label", E_USER_WARNING);
        }
        if ($capped) {
            trigger_error('td_steps: too many steps — at most 20 are printed', E_USER_WARNING);
        }
        if ($renamed) {
            trigger_error('td_steps: duplicate step key — renamed with a -2, -3 … suffix', E_USER_WARNING);
        }
        return $out;
    }

    /**
     * @internal QĐ S2 — the single precedence rule (= deriveStates() of src/utils/steps-model.js; parity STATE_CASES):
     * ['anchor' => int (-1 none), 'states' => string[], 'warnings' => string[]].
     */
    function td__steps_states(array $list, ?string $current, bool $complete): array
    {
        if (!$list) {
            return ['anchor' => -1, 'states' => [], 'warnings' => []];
        }
        $warn = [];
        $explicit = [];
        foreach ($list as $i => $s) {
            if ($s['state'] === 'current') {
                $explicit[] = $i;
            }
        }
        $anchor = -1;
        $has = $current !== null && $current !== '';
        if ($complete) {
            if ($has || $explicit) {
                $warn['complete-current'] = true;
            }
        } else {
            if ($has) {
                foreach ($list as $i => $s) {
                    if ($s['key'] === $current) {
                        $anchor = $i;
                        break;
                    }
                }
                if ($anchor < 0) {
                    $warn['current-unmatched'] = true;
                }
            }
            if ($anchor < 0 && $explicit) {
                $anchor = $explicit[0];
            }
            foreach ($explicit as $i) {
                if ($i !== $anchor) {
                    $warn['extra-current'] = true;
                }
            }
            if ($anchor >= 0 && in_array($list[$anchor]['state'], ['done', 'upcoming'], true)) {
                $warn['anchor-state'] = true;
            }
        }
        $states = [];
        foreach ($list as $i => $s) {
            if ($i === $anchor) {
                $states[] = $s['state'] === 'error' ? 'error' : 'current';
            } elseif (in_array($s['state'], ['done', 'error', 'upcoming'], true)) {
                $states[] = $s['state'];
            } elseif ($anchor >= 0) {
                $states[] = $i < $anchor ? 'done' : 'upcoming';
            } else {
                $states[] = $complete ? 'done' : 'upcoming';
            }
        }
        $codes = array_values(array_filter(['current-unmatched', 'extra-current', 'anchor-state', 'complete-current'], fn ($c) => isset($warn[$c])));
        return ['anchor' => $anchor, 'states' => $states, 'warnings' => $codes];
    }

    /** @internal QĐ S4 (= isClickable() of src/utils/steps-model.js). */
    function td__steps_clickable(string $state, int $i, int $anchor, bool $complete, string $nav, bool $disabled): bool
    {
        if ($disabled || $nav === 'none') {
            return false;
        }
        if ($nav === 'all') {
            return $i !== $anchor;
        }
        if ($state !== 'done' && $state !== 'error') {
            return false;
        }
        return $anchor >= 0 ? $i < $anchor : $complete;
    }

    /** @internal QĐ S3 / review R2-5 (= summaryText() of src/utils/steps-model.js; parity SUMMARY_CASES). */
    function td__steps_summary(int $anchor, int $total, bool $complete, array $L, string $label): string
    {
        if ($total === 0) {
            return '';
        }
        if ($anchor >= 0) {
            return strtr($L['summary'], ['{n}' => (string) ($anchor + 1), '{total}' => (string) $total, '{label}' => $label]);
        }
        return strtr($complete ? $L['summaryComplete'] : $L['summaryNone'], ['{total}' => (string) $total]);
    }

    /** @internal JavaScript String.prototype.trim(): Unicode white space + line terminators at both ends. */
    function td__js_trim(string $s): string
    {
        return (string) preg_replace('/^[\s\p{Zs}\x{FEFF}\x{2028}\x{2029}]+|[\s\p{Zs}\x{FEFF}\x{2028}\x{2029}]+$/u', '', $s);
    }

    /**
     * v0.45.0 event timeline (contract timeline@1, plan v0.45.0-steps-timeline QĐ T1–T10, G3) — ALWAYS the element
     * `<td-timeline data-td-ssr="timeline@1" time-zone="…">` + the exact tree <td-timeline> builds, hydrated IN PLACE by
     * `@dazzxq/td-components/timeline`: `div.td-timeline` > day groups `div.td-timeline__day[data-day]` (heading
     * `h{n}.td-timeline__day-title` > `time.td-timeline__day-label[datetime]`; group "none": one `data-day="all"` group
     * without heading) + at most one LAST group `data-day="unknown"` ("Không rõ thời gian", `span` label, items without
     * `<time>`) > `ol.td-timeline__list` > `li.td-timeline__item[data-id][data-tone]` (marker + icon, title, actor, time,
     * meta, `<details>` with the text details — opens without JS); then "Xem thêm" (`a[href=more_href]`, only with
     * has_more) and the live region.
     * $items: list of ['time' => DateTimeInterface | int / float epoch (< 1e12 = seconds) | ISO 8601 string WITH `Z` /
     * offset (1–9 fraction digits, truncated to ms), 'title' => …, 'href'?, 'actor'? (string | ['name', 'href'?]), 'meta'?,
     * 'icon'? (registry name; a site icon unknown here → an empty slot JS fills), 'tone'? (neutral | success | warning |
     * danger | info), 'details'? (text, line breaks kept), 'expanded'?, 'id'?] — same normalisation as
     * src/utils/timeline-model.js. A time that is not an instant (zone-less `2026-10-05 14:00`) is never guessed: the item
     * goes to "Không rõ thời gian" + one E_USER_WARNING. `details: true` (lazy) is JS only — ignored here.
     * Options: time_zone (IANA name of DateTimeZone::listIdentifiers() or UTC; invalid → one E_USER_WARNING; default and
     * fallback date_default_timezone_get() — always printed, so server and browser group the same days), now (test),
     * order (asc), group (none), heading_level (2–6, default 3), has_more, more_href (relative URL), empty_text, id, class,
     * attrs.
     */
    function td_timeline(array $items, array $o = []): string
    {
        $L = Td::TIMELINE_LABELS;
        $tz = td__timeline_tz($o);
        $now = array_key_exists('now', $o) ? td__timeline_instant($o['now']) : null;
        $now ??= (int) floor(microtime(true) * 1000);
        $order = ($o['order'] ?? null) === 'asc' ? 'asc' : 'desc';
        $group = ($o['group'] ?? null) === 'none' ? 'none' : 'day';
        $level = Td::intOpt($o['heading_level'] ?? null, 2);
        $level = $level !== null && (int) $level <= 6 ? (int) $level : 3;
        $list = td__timeline_sort(td__timeline_items($items), $order);
        $more = td__filter_href($o['more_href'] ?? null);
        $hasMore = !empty($o['has_more']);
        $empty = td__str($o['empty_text'] ?? null);
        $taken = [];
        $html = '<td-timeline' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_TIMELINE,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'time-zone' => $tz,
            'order' => $order === 'asc' ? 'asc' : null,
            'group' => $group === 'none' ? 'none' : null,
            'heading-level' => $level !== 3 ? (string) $level : null,
            'has-more' => $hasMore,
            'more-href' => $more,
            'empty-text' => $empty,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'time-zone', 'order', 'group', 'heading-level', 'has-more', 'more-href', 'empty-text',
            'loading', 'aria-busy'], $extra, $taken);
        $html .= Td::attrs($extra, $taken) . '><div class="td-timeline">';
        if (!$list) {
            $e = td__js_trim($empty ?? '');
            $html .= '<p class="td-timeline__empty">' . Td::e($e !== '' ? $e : $L['empty']) . '</p>';
        }
        $zone = new DateTimeZone($tz);
        foreach (td__timeline_groups($list, $group, $zone) as [$key, $its]) {
            $html .= '<div class="td-timeline__day" data-day="' . $key . '">';
            if ($key === 'unknown') {
                $html .= "<h$level class=\"td-timeline__day-title\"><span class=\"td-timeline__day-label\">" . Td::e($L['unknownDay']) . "</span></h$level>";
            } elseif ($key !== 'all') {
                $html .= "<h$level class=\"td-timeline__day-title\"><time class=\"td-timeline__day-label\" datetime=\"$key\">"
                    . Td::e(td__timeline_day_label($key, $zone, $now, $L)) . "</time></h$level>";
            }
            $html .= '<ol class="td-timeline__list" role="list">';
            foreach ($its as $it) {
                $html .= td__timeline_item($it, $group, $zone, $L);
            }
            $html .= '</ol></div>';
        }
        $html .= '</div>';
        if ($hasMore && $more !== null) {
            $html .= '<div class="td-timeline__footer"><a class="td-btn td-btn--secondary td-timeline__more" href="' . Td::e($more) . '">'
                . '<span class="td-btn__label">' . Td::e($L['more']) . '</span>'
                . '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden><svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
                . '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle><circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span></a></div>';
        }
        return $html . '<p class="td-sr-only" role="status"></p></td-timeline>';
    }

    /** @internal One timeline `li` (= TdTimeline#_itemEl). */
    function td__timeline_item(array $it, string $group, DateTimeZone $zone, array $L): string
    {
        $marker = '';
        if ($it['icon'] !== null) {
            $marker = '<span class="td-timeline__icon" data-td-icon="' . Td::e($it['icon']) . '">' . Td::icon($it['icon'], 's') . '</span>';
        }
        $head = $it['href'] !== null
            ? '<a class="td-timeline__title" href="' . Td::e($it['href']) . '">' . Td::e($it['title']) . '</a>'
            : '<span class="td-timeline__title">' . Td::e($it['title']) . '</span>';
        if ($it['actor'] !== null) {
            $a = $it['actor'];
            $head .= $a['href'] !== null
                ? '<a class="td-timeline__actor" href="' . Td::e($a['href']) . '">' . Td::e($a['name']) . '</a>'
                : '<span class="td-timeline__actor">' . Td::e($a['name']) . '</span>';
        }
        if ($it['time'] !== null) {
            $head .= '<time class="td-timeline__time" datetime="' . td__timeline_iso($it['time']) . '">'
                . td__timeline_time_text($it['time'], $zone, $group) . '</time>';
        }
        $html = '<li class="td-timeline__item" data-id="' . Td::e($it['id']) . '" data-tone="' . $it['tone'] . '">'
            . '<span class="td-timeline__marker" aria-hidden="true">' . $marker . '</span>'
            . '<div class="td-timeline__body"><p class="td-timeline__head">' . $head . '</p>';
        if ($it['meta'] !== null) {
            $html .= '<p class="td-timeline__meta">' . Td::e($it['meta']) . '</p>';
        }
        if ($it['details'] !== null) {
            $html .= '<details class="td-timeline__details"' . ($it['expanded'] ? ' open' : '') . '><summary class="td-timeline__summary">'
                . '<span class="td-timeline__summary-inner"><span class="td-timeline__summary-text">' . Td::e($L['details']) . '</span>'
                . '<span class="td-timeline__chevron" data-td-icon="down" aria-hidden="true">' . Td::icon('down', 's') . '</span></span></summary>'
                . '<div class="td-timeline__detail">' . Td::e($it['details']) . '</div></details>';
        }
        return $html . '</div></li>';
    }

    /**
     * @internal QĐ T4 — the effective zone: option `time_zone` when it is an IANA name of
     * DateTimeZone::listIdentifiers() (or UTC); absent → date_default_timezone_get(); anything else (offset, abbreviation,
     * '', non-string) → one E_USER_WARNING + date_default_timezone_get().
     */
    function td__timeline_tz(array $o): string
    {
        $fallback = date_default_timezone_get();
        if (!array_key_exists('time_zone', $o) || $o['time_zone'] === null) {
            return $fallback;
        }
        $v = $o['time_zone'];
        if (is_string($v) && ($v === 'UTC' || in_array($v, DateTimeZone::listIdentifiers(), true))) {
            return $v;
        }
        trigger_error('td_timeline: time_zone must be an IANA zone name (Asia/Ho_Chi_Minh) — ' . $fallback . ' is used', E_USER_WARNING);
        return $fallback;
    }

    /**
     * @internal QĐ T3 (= parseInstant() of src/utils/timeline-model.js; parity INSTANT_CASES): epoch ms or null.
     * DateTimeInterface; int / finite float (< 1e12 = seconds, truncated); ISO 8601 WITH `Z` / ±hh[[:]mm] (1–9 fraction
     * digits truncated to ms). Range: 1000-01-02 … 9999-12-30 UTC.
     */
    function td__timeline_instant(mixed $v): ?int
    {
        $min = -30610137600000; // Date.UTC(1000, 0, 2)
        $max = 253402214399999; // Date.UTC(9999, 11, 30, 23, 59, 59, 999)
        $ms = null;
        if ($v instanceof DateTimeInterface) {
            $ms = $v->getTimestamp() * 1000 + (int) $v->format('v');
        } elseif (is_int($v) || (is_float($v) && is_finite($v))) {
            $x = $v < 1e12 ? $v * 1000 : $v;
            $x = $x < 0 ? ceil($x) : floor($x);
            if ($x < $min || $x > $max) {
                return null;
            }
            $ms = (int) $x;
        } elseif (is_string($v) && strlen($v) <= 40
            && preg_match('/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/D', $v, $m)) {
            [$y, $mo, $d, $h, $mi] = [(int) $m[1], (int) $m[2], (int) $m[3], (int) $m[4], (int) $m[5]];
            $s = isset($m[6]) && $m[6] !== '' ? (int) $m[6] : 0;
            $frac = isset($m[7]) && $m[7] !== '' ? (int) substr($m[7] . '00', 0, 3) : 0;
            $dim = $mo === 2 ? (($y % 4 === 0 && $y % 100 !== 0) || $y % 400 === 0 ? 29 : 28) : (in_array($mo, [4, 6, 9, 11], true) ? 30 : 31);
            if ($mo < 1 || $mo > 12 || $d < 1 || $d > $dim || $h > 23 || $mi > 59 || $s > 59) {
                return null;
            }
            $off = 0;
            if ($m[8] !== 'Z') {
                preg_match('/^([+-])(\d{2}):?(\d{2})?$/', $m[8], $om);
                $oh = (int) $om[2];
                $omin = isset($om[3]) && $om[3] !== '' ? (int) $om[3] : 0;
                if ($oh > 23 || $omin > 59) {
                    return null;
                }
                $off = ($om[1] === '-' ? -1 : 1) * ($oh * 60 + $omin);
            }
            $t = new DateTimeImmutable(sprintf('%04d-%02d-%02dT%02d:%02d:%02d', $y, $mo, $d, $h, $mi, $s), new DateTimeZone('UTC'));
            $ms = $t->getTimestamp() * 1000 + $frac - $off * 60000;
        }
        return $ms !== null && $ms >= $min && $ms <= $max ? $ms : null;
    }

    /** @internal Canonical ISO of an instant (UTC, ms) = new Date(ms).toISOString(). */
    function td__timeline_iso(int $ms): string
    {
        $s = intdiv($ms, 1000);
        $f = $ms % 1000;
        if ($f < 0) {
            $s--;
            $f += 1000;
        }
        return (new DateTimeImmutable('@' . $s))->format('Y-m-d\TH:i:s') . sprintf('.%03dZ', $f);
    }

    /** @internal Wall clock of an instant in a zone. */
    function td__timeline_local(int $ms, DateTimeZone $zone): DateTimeImmutable
    {
        $s = intdiv($ms, 1000);
        if ($ms % 1000 < 0) {
            $s--;
        }
        return (new DateTimeImmutable('@' . $s))->setTimezone($zone);
    }

    /** @internal QĐ T5: `HH:mm` (day groups) / `dd/mm/yyyy HH:mm` (group none) (= timeText()). */
    function td__timeline_time_text(int $ms, DateTimeZone $zone, string $group): string
    {
        return td__timeline_local($ms, $zone)->format($group === 'none' ? 'd/m/Y H:i' : 'H:i');
    }

    /** @internal QĐ T5: "Hôm nay" / "Hôm qua" / "{Thứ}, dd/mm/yyyy" (= dayLabel(); parity DAY_CASES). */
    function td__timeline_day_label(string $key, DateTimeZone $zone, int $now, array $L): string
    {
        $today = td__timeline_local($now, $zone)->format('Y-m-d');
        if ($key === $today) {
            return $L['today'];
        }
        $utc = new DateTimeZone('UTC');
        if ($key === (new DateTimeImmutable($today, $utc))->modify('-1 day')->format('Y-m-d')) {
            return $L['yesterday'];
        }
        [$y, $m, $d] = explode('-', $key);
        $wd = (int) (new DateTimeImmutable($key, $utc))->format('w');
        return strtr($L['day'], ['{weekday}' => $L['weekdays'][$wd], '{dd}' => $d, '{mm}' => $m, '{yyyy}' => $y]);
    }

    /** @internal Stable sort (= sortItems()): timed by time (asc / desc, ties in given order), then unknown-time items. */
    function td__timeline_sort(array $list, string $order): array
    {
        $timed = [];
        $untimed = [];
        foreach ($list as $i => $it) {
            if ($it['time'] === null) {
                $untimed[] = $it;
            } else {
                $timed[] = [$it, $i];
            }
        }
        $dir = $order === 'asc' ? 1 : -1;
        usort($timed, fn ($a, $b) => (($a[0]['time'] <=> $b[0]['time']) * $dir) ?: ($a[1] <=> $b[1]));
        return array_merge(array_map(fn ($x) => $x[0], $timed), $untimed);
    }

    /** @internal Groups of a sorted list (= groupItems()): [[key, items]] — day keys / 'all', then 'unknown' last. */
    function td__timeline_groups(array $sorted, string $group, DateTimeZone $zone): array
    {
        $out = [];
        $unknown = [];
        foreach ($sorted as $it) {
            if ($it['time'] === null) {
                $unknown[] = $it;
                continue;
            }
            $key = $group === 'none' ? 'all' : td__timeline_local($it['time'], $zone)->format('Y-m-d');
            $n = count($out);
            if ($n && $out[$n - 1][0] === $key) {
                $out[$n - 1][1][] = $it;
            } else {
                $out[] = [$key, [$it]];
            }
        }
        if ($unknown) {
            $out[] = ['unknown', $unknown];
        }
        return $out;
    }

    /**
     * @internal td_timeline items (= normalizeItems() of src/utils/timeline-model.js): ≤ 1000 items, ≤ 4000 entries
     * inspected; title ≤ 300, actor ≤ 120, meta ≤ 200, details ≤ 5000 (line breaks kept), id ≤ 200 code points;
     * one E_USER_WARNING per kind (dropped, capped, renamed, unknown time).
     */
    function td__timeline_items(array $items): array
    {
        $out = [];
        $used = [];
        $next = [];
        $dropped = 0;
        $renamed = 0;
        $untimed = 0;
        $capped = false;
        $seen = 0;
        foreach ($items as $raw) {
            if (count($out) >= 1000 || $seen >= 4000) {
                $capped = true;
                break;
            }
            $seen++;
            if (!is_array($raw)) {
                $dropped++;
                continue;
            }
            $title = td__filter_text($raw['title'] ?? null, 300);
            if ($title === null || td__js_trim($title) === '') {
                $dropped++;
                continue;
            }
            $id0 = ($raw['id'] ?? null) === null ? null : td__filter_text($raw['id'], 200);
            $base = $id0 !== null && $id0 !== '' ? $id0 : (string) (count($out) + 1);
            $id = $base;
            if (isset($used['k' . $id])) {
                $n = $next['k' . $base] ?? 2;
                while (isset($used['k' . $base . '-' . $n])) {
                    $n++;
                }
                $id = $base . '-' . $n;
                $next['k' . $base] = $n + 1;
                $renamed++;
            }
            $used['k' . $id] = true;
            $time = td__timeline_instant($raw['time'] ?? null);
            if ($time === null) {
                $untimed++;
            }
            $actor = null;
            $a = $raw['actor'] ?? null;
            if ($a !== null) {
                $name = td__filter_text(is_array($a) ? ($a['name'] ?? null) : $a, 120);
                if ($name !== null && td__js_trim($name) !== '') {
                    $actor = ['name' => $name, 'href' => is_array($a) && isset($a['href']) ? td__filter_href($a['href']) : null];
                }
            }
            $meta = ($raw['meta'] ?? null) === null ? null : td__filter_text($raw['meta'], 200);
            $details = ($raw['details'] ?? null) === null || ($raw['details'] ?? null) === true ? null : td__timeline_multiline($raw['details'], 5000);
            $icon = $raw['icon'] ?? null;
            $tone = $raw['tone'] ?? null;
            $out[] = [
                'id' => $id, 'time' => $time, 'title' => $title,
                'tone' => in_array($tone, ['neutral', 'success', 'warning', 'danger', 'info'], true) ? $tone : 'neutral',
                'expanded' => ($raw['expanded'] ?? null) === true,
                'href' => isset($raw['href']) ? td__filter_href($raw['href']) : null,
                'actor' => $actor,
                'meta' => $meta !== null && td__js_trim($meta) !== '' ? $meta : null,
                'icon' => is_string($icon) && preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $icon) ? $icon : null,
                'details' => $details !== null && td__js_trim($details) !== '' ? $details : null,
            ];
        }
        if ($dropped) {
            trigger_error("td_timeline: $dropped item(s) dropped — every item needs a non-empty text title", E_USER_WARNING);
        }
        if ($capped) {
            trigger_error('td_timeline: too many items — at most 1000 are printed', E_USER_WARNING);
        }
        if ($renamed) {
            trigger_error('td_timeline: duplicate item id — renamed with a -2, -3 … suffix', E_USER_WARNING);
        }
        if ($untimed) {
            trigger_error("td_timeline: $untimed item(s) without a valid instant — shown under \"Không rõ thời gian\" (an ISO time needs Z or an offset)", E_USER_WARNING);
        }
        return $out;
    }

    /** @internal Text keeping its line breaks (= cleanMultiline()): CR LF / CR → LF, controls but TAB / LF removed. */
    function td__timeline_multiline(mixed $v, int $max): ?string
    {
        if (is_int($v)) {
            $v = (string) $v;
        } elseif (is_float($v) && is_finite($v)) {
            $v = td__js_number($v);
        } elseif (!is_string($v)) {
            return null;
        }
        if (strlen($v) > $max * 4) {
            $v = substr($v, 0, $max * 4);
            for ($i = 0; $i < 3 && preg_match('//u', $v) !== 1; $i++) {
                $v = substr($v, 0, -1);
            }
        }
        $v = (string) preg_replace('/\r\n?/', "\n", $v);
        $clean = preg_replace('/[\x{0}-\x{8}\x{B}-\x{1F}\x{7F}-\x{9F}]/u', '', $v);
        return $clean === null ? null : td__utf8_prefix($clean, $max);
    }

    /** @internal v0.26.0: element mode of a form helper — per call `element` (true/false) overrides Td::configure. */
    function td__element(array $o): bool
    {
        return array_key_exists('element', $o) && $o['element'] !== null ? (bool) $o['element'] : Td::ssrElements();
    }

    /** @internal Element mode host id without a caller id: `td-{name reduced to [A-Za-z0-9_-]}-{n}` (`td-{n}` for none). */
    function td__host_uid(string $name): string
    {
        $clean = (string) preg_replace('/[^A-Za-z0-9_-]/', '', $name);
        return Td::uid($clean !== '' ? 'td-' . $clean : 'td');
    }

    /** @internal Non-empty scalar option as a string, else null. */
    function td__str(mixed $v): ?string
    {
        return is_scalar($v) && !is_bool($v) && (string) $v !== '' ? (string) $v : null;
    }

    /**
     * @internal Element mode: mark the names a component owns (any case) + the kit's `data-td-*` namespace as taken, so
     * a caller `attrs` entry can never print them (review v0.25 IMPL-1 / round 2 / round 3 rules).
     * @param array<int,string> $owned lower-case names
     * @return array<string,bool>
     */
    function td__reserve(array $owned, array $extra, array $taken): array
    {
        foreach ($owned as $l) {
            $taken[$l] = true;
        }
        foreach (array_keys($extra) as $k) {
            $l = strtolower((string) $k);
            if (strncmp($l, 'data-td-', 8) === 0) {
                $taken[$l] = true;
            }
        }
        return $taken;
    }

    /**
     * @internal Length of $value as <td-input-field> counts it (UTF-16 code units of the control's value: a textarea
     * normalises CR LF / CR to LF, an <input> drops line breaks) — the counter text printed in element mode.
     */
    function td__js_length(string $value, bool $textarea): int
    {
        $v = (string) ($textarea ? preg_replace('/\r\n?/', "\n", $value) : preg_replace('/[\r\n]/', '', $value));
        $points = preg_match_all('/./su', $v);
        $astral = preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $v);
        return (int) $points + (int) $astral;
    }

    /**
     * @internal td_field element mode (v0.26.0, contract input-field@1). Host `<td-input-field>` with the component
     * attributes + the exact tree render() produces (wrapper, label + required star, control, footer with error note /
     * helper note / counter). The control keeps the no-JS attributes (name, required, pattern, minlength, min / max /
     * step, native type email / url / number, autofocus) that hydrate removes or normalises. Ids: caller `id` = control
     * id (`field-id`), host = {id}-host; else host = td-{name}-{n}, control = {host}-control (render's default).
     */
    function td__field_element(string $name, string $value, array $o): string
    {
        $types = ['text', 'password', 'email', 'number', 'date', 'month', 'datetime-local', 'time', 'search', 'url', 'tel', 'textarea'];
        $type = in_array($o['type'] ?? null, $types, true) ? $o['type'] : 'text';
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $textarea = $type === 'textarea';
        $callerId = td__str($o['id'] ?? null);
        $hostId = $callerId !== null ? $callerId . '-host' : td__host_uid($name);
        $cid = $callerId ?? $hostId . '-control';
        $label = isset($o['label']) && is_scalar($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $hint = td__str($o['hint'] ?? null);
        $error = td__str($o['error'] ?? null);
        $required = !empty($o['required']);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        // E1 hints passed through `attrs` (135 style) are whitelisted like the options; options win (as native mode).
        $hintKeys = ['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'autofocus'];
        $hintSrc = $o;
        $ariaLabel = null;
        foreach ($extra as $k => $v) {
            $l = strtolower((string) $k);
            if (in_array($l, $hintKeys, true)) {
                if (!array_key_exists($l, $hintSrc)) {
                    $hintSrc[$l] = $l === 'autofocus' ? ($v !== false && $v !== null) : $v;
                }
                unset($extra[$k]);
            } elseif ($l === 'aria-label') {
                // lifted to the host: the component names the control from it (when there is no visible label)
                $ariaLabel ??= td__str($v);
                unset($extra[$k]);
            }
        }
        $hints = Td::inputHints($hintSrc);
        $max = Td::intOpt($o['max_length'] ?? $o['maxlength'] ?? null, 1);
        $minlength = Td::intOpt($o['minlength'] ?? null, 1);
        $placeholder = isset($o['placeholder']) && is_scalar($o['placeholder']) && (string) $o['placeholder'] !== '' ? (string) $o['placeholder'] : null;
        $range = [];
        foreach (['pattern', 'min', 'max', 'step'] as $k) {
            $range[$k] = isset($o[$k]) && is_scalar($o[$k]) && (string) $o[$k] !== '' ? (string) $o[$k] : null;
        }
        $rows = $textarea ? (Td::intOpt($o['rows'] ?? null, 1) ?? '3') : null;
        // component-owned description ids, in the component's order: helper note, counter, error
        $desc = trim(($hint !== null ? "$hostId-note " : '') . ($max !== null ? "$hostId-counter " : '') . ($error !== null ? "$hostId-error" : ''));
        $ctl = [
            'type' => $textarea ? null : $type,
            'class' => 'td-field__control',
            'id' => $cid,
            'name' => $name !== '' ? $name : null,
            'placeholder' => $placeholder,
            'required' => $required,
            'aria-required' => $required ? 'true' : null,
            'disabled' => !empty($o['disabled']),
            'readonly' => !empty($o['readonly']),
            'maxlength' => $max,
            'minlength' => $minlength,
        ] + $range + $hints + [
            'aria-describedby' => $desc !== '' ? $desc : null,
            'aria-invalid' => $error !== null ? 'true' : null,
            'aria-errormessage' => $error !== null ? "$hostId-error" : null,
            'aria-label' => $label === null ? $ariaLabel : null,
            'rows' => $rows,
            'value' => $textarea ? null : $value,
        ];
        $taken = [];
        $own = Td::ownAttrs($ctl, $taken);
        $taken = td__reserve(['class', 'type', 'id', 'name', 'value', 'placeholder', 'required', 'aria-required', 'disabled',
            'readonly', 'maxlength', 'minlength', 'pattern', 'min', 'max', 'step', 'rows', 'aria-describedby', 'aria-invalid',
            'aria-errormessage', 'aria-label', 'aria-labelledby', 'autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize',
            'spellcheck', 'autofocus'], $extra, $taken);
        $control = $textarea
            ? '<textarea' . $own . Td::attrs($extra, $taken) . '>' . "\n" . Td::e($value) . '</textarea>'
            : '<input' . $own . Td::attrs($extra, $taken) . '>';
        $hid = Td::e($hostId);
        $labelHtml = $label !== null
            ? '<label class="td-field__label" id="' . $hid . '-label" for="' . Td::e($cid) . '">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>'
            : '';
        $footer = $error !== null ? '<span class="td-field-error" id="' . $hid . '-error" data-for="' . $hid . '">' . Td::e($error) . '</span>' : '';
        $footer .= '<div class="td-field__note" id="' . $hid . '-note"' . ($hint === null ? ' hidden' : '') . '>' . Td::e($hint ?? '') . '</div>';
        if ($max !== null) {
            $count = td__js_length($value, $textarea);
            // same text as the component's counter (TdInputField.messages.unitChar = 'ký tự'); data-state at the limit
            $footer .= '<div class="td-field__counter" id="' . $hid . '-counter"' . ($count >= (int) $max ? ' data-state="limit"' : '')
                . '>' . $count . '/' . $max . ' ký tự</div>';
        }
        $inner = '<div class="td-field td-field--' . $size . ($textarea ? ' td-field--textarea' : '') . '">' . $labelHtml . $control
            . '<div class="td-field__footer"' . ($hint === null && $error === null && $max === null ? ' hidden' : '') . '>' . $footer . '</div></div>';
        $host = [
            'data-td-ssr' => Td::SSR_FIELD,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'type' => $type,
            'size' => $size,
            'name' => $name !== '' ? $name : null,
            'value' => $value !== '' ? $value : null,
            'label' => $label,
            'placeholder' => $placeholder,
            'helper-text' => $hint,
            'error-text' => $error,
            'required' => $required,
            'disabled' => !empty($o['disabled']),
            'readonly' => !empty($o['readonly']),
            'max-length' => $max,
            'minlength' => $minlength,
        ] + $range + [
            'rows' => $rows,
            'field-id' => $callerId,
        ] + $hints + ['aria-label' => $ariaLabel];
        $hostTaken = [];
        return '<td-input-field' . Td::ownAttrs($host, $hostTaken) . '>' . $inner . '</td-input-field>';
    }

    /**
     * @internal td_toggle / td_checkbox element mode (v0.26.0, contracts toggle@1 / checkbox@1). Host with the component
     * attributes (+ the site's `class` / allowlisted `attrs`) around the exact tree render() produces; the input keeps
     * name / value / checked / required / the caller `id` (no-JS submit + `<label for>`). `input_attrs` → the input.
     */
    function td__check_element(bool $toggle, string $name, bool $checked, string $label, array $o): string
    {
        $block = $toggle ? 'td-switch' : 'td-checkbox';
        $size = in_array($o['size'] ?? null, Td::SIZES, true) ? $o['size'] : 'md';
        $callerId = td__str($o['id'] ?? null);
        $hostId = $callerId !== null ? $callerId . '-host' : td__host_uid($name);
        $value = isset($o['value']) && is_scalar($o['value']) ? (string) $o['value'] : null;
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $inputExtra = is_array($o['input_attrs'] ?? null) ? $o['input_attrs'] : [];
        $taken = [];
        $input = '<input' . Td::ownAttrs([
            'type' => 'checkbox',
            'role' => $toggle ? 'switch' : null,
            'class' => $block . '__input',
            'id' => $callerId,
            'name' => $name !== '' ? $name : null,
            'value' => $value,
            'checked' => $checked,
            'required' => $required,
            'disabled' => $disabled,
            // a visible label names the input (the component removes aria-label then); else the host aria-label
            'aria-label' => $label === '' ? $aria : null,
        ], $taken);
        $taken = td__reserve(['type', 'role', 'class', 'id', 'name', 'value', 'checked', 'required', 'disabled', 'aria-label',
            'aria-labelledby', 'aria-invalid', 'aria-errormessage', 'aria-busy'], $inputExtra, $taken);
        $input .= Td::attrs($inputExtra, $taken) . '>';
        $parts = $toggle
            ? '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
                . '<span class="td-switch__icon td-switch__icon--off" data-td-icon="close">' . Td::icon('close') . '</span>'
                . '<span class="td-switch__icon td-switch__icon--on" data-td-icon="check">' . Td::icon('check') . '</span>'
                . '</span></span>'
            : '<span class="td-checkbox__mark" aria-hidden="true">'
                . '<span class="td-checkbox__icon" data-td-icon="check" data-td-icon-class="td-checkbox__svg">'
                . Td::icon('check', 'm', '', 'td-checkbox__svg') . '</span></span>';
        $inner = '<label class="' . $block . ' ' . $block . '--' . $size . '">' . $input . $parts
            . ($label !== '' ? '<span class="' . $block . '__label">' . Td::e($label) . '</span>' : '') . '</label>';
        $host = [
            'data-td-ssr' => $toggle ? Td::SSR_TOGGLE : Td::SSR_CHECKBOX,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'value' => $value,
            'checked' => $checked,
            'required' => $required,
            'disabled' => $disabled,
            'label' => $label !== '' ? $label : null,
            'size' => $size,
            'aria-label' => $aria,
        ];
        $hostExtra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $hostTaken = [];
        $html = '<' . ($toggle ? 'td-toggle' : 'td-checkbox') . Td::ownAttrs($host, $hostTaken);
        $hostTaken = td__reserve(['id', 'class', 'name', 'value', 'checked', 'required', 'disabled', 'label', 'size', 'aria-label',
            'color', 'controlled', 'error-text'], $hostExtra, $hostTaken);
        return $html . Td::attrs($hostExtra, $hostTaken) . '>' . $inner . '</' . ($toggle ? 'td-toggle' : 'td-checkbox') . '>';
    }

    /** @internal Shared `<input type=checkbox>` of td_toggle / td_checkbox. */
    function td__check_input(string $class, string $name, bool $checked, array $o, bool $switch): string
    {
        $taken = [];
        return '<input' . Td::ownAttrs([
            'type' => 'checkbox',
            'role' => $switch ? 'switch' : null,
            'class' => $class,
            'id' => isset($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : null,
            'name' => $name !== '' ? $name : null,
            'value' => isset($o['value']) && is_scalar($o['value']) ? (string) $o['value'] : null,
            'checked' => $checked,
            'required' => !empty($o['required']),
            'disabled' => !empty($o['disabled']),
            'aria-label' => isset($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null,
        ], $taken) . Td::attrs(is_array($o['input_attrs'] ?? null) ? $o['input_attrs'] : [], $taken) . '>';
    }

    // --- v0.46.0 td-diff (plan docs/internal/plans/v0.46.0-diff.md): the SAME model as src/utils/diff-model.js (parity
    // test/ssr/diff.fixtures.json, byte for byte) + the markup of src/display/td-diff.js diffMarkup() (contract diff@1). ---

    /**
     * v0.46.0: `<td-diff>` from flat rows (dsuite policies `fields` / `keys`) — the full markup (works without JS:
     * unchanged rows / JSON view / long values are native <details>), adopted in place by `@dazzxq/td-components/diff`.
     * Item: ['key' => string|int, 'label'?, 'before'?, 'after'?, 'kind'? (added|removed|changed|unchanged), 'masked'? (true:
     * a STRING before / after is shown as is — already masked by the server — anything else as "[ĐÃ ẨN]"), 'type'?,
     * 'options'?, 'decimals'?, 'unit'?]. Values: scalars, lists, stdClass = object, a PHP array = list when
     * array_is_list(), else object. Options: view (auto|table|inline), unchanged (collapse|show|hide), json (bool), label,
     * labels (overrides of Td::DIFF_LABELS), id, class, attrs (allowlisted; owned names + data-td-* reserved).
     * The kit masks NOTHING: remove / mask secrets on the server before calling.
     */
    function td_diff(array $items, array $o = []): string
    {
        $L = td__diff_labels($o['labels'] ?? null);
        $m = td__diff_model(['items' => $items], $L, !empty($o['json']), 'td_diff');
        return td__diff_host($m, $L, $o);
    }

    /**
     * v0.46.0: `<td-diff>` from two snapshots (dsuite policy `snapshot`), flattened by the kit. Each side: a JSON string
     * (recommended: objects stay objects, `{"0": …}` included; > 2 MB or invalid → a note, no rows), a stdClass, an array
     * (array_is_list() → list, else object — narrow rule) or null (empty). Options: as td_diff() + `fields`
     * ([['path' => ['lines', 0, 'qty'] | 'status', 'label'?, 'type'?, 'options'?, 'decimals'?, 'unit'?, 'masked'?]]).
     */
    function td_diff_snapshots(string|\stdClass|array|null $before, string|\stdClass|array|null $after, array $o = []): string
    {
        $L = td__diff_labels($o['labels'] ?? null);
        $m = td__diff_model(['before' => $before, 'after' => $after, 'fields' => $o['fields'] ?? null, 'decode' => true], $L,
            !empty($o['json']), 'td_diff_snapshots');
        return td__diff_host($m, $L, $o);
    }

    /** @internal Labels: Td::DIFF_LABELS + string overrides. */
    function td__diff_labels(mixed $over): array
    {
        $L = Td::DIFF_LABELS;
        if (is_array($over)) {
            foreach ($L as $k => $_) {
                if (isset($over[$k]) && is_string($over[$k])) {
                    $L[$k] = $over[$k];
                }
            }
        }
        return $L;
    }

    /** @internal The host + markup. */
    function td__diff_host(array $m, array $L, array $o): string
    {
        $view = in_array($o['view'] ?? null, ['auto', 'table', 'inline'], true) ? $o['view'] : null;
        $unchanged = in_array($o['unchanged'] ?? null, ['collapse', 'show', 'hide'], true) ? $o['unchanged'] : null;
        $label = td__str($o['label'] ?? null);
        $taken = [];
        $html = '<td-diff' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_DIFF,
            'id' => td__str($o['id'] ?? null),
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'view' => $view,
            'unchanged' => $unchanged,
            'json' => !empty($o['json']),
            'label' => $label,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['id', 'class', 'view', 'unchanged', 'json', 'label'], $extra, $taken);
        return $html . Td::attrs($extra, $taken) . '>' . td__diff_markup($m, $L, $label, $unchanged ?? 'collapse', !empty($o['json']))
            . '</td-diff>';
    }

    // --- strings (bounded: every raw string is cut BEFORE any regex / validation / key building — Codex round 1 I4) ---

    /** @internal Code points of a valid UTF-8 string. */
    function td__diff_cplen(string $s): int
    {
        $n = preg_match_all('/./su', $s);
        return $n === false ? strlen($s) : $n;
    }

    /** @internal UTF-16 code units (the JS string length). */
    function td__diff_u16(string $s): int
    {
        if (!preg_match('/[\x80-\xFF]/', $s)) {
            return strlen($s);
        }
        return (int) preg_match_all('/./su', $s) + (int) preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $s);
    }

    /** @internal First $max code points (PCRE quantifiers stop at 65535: chunked). */
    function td__diff_cpslice(string $s, int $max): string
    {
        if (strlen($s) <= $max) {
            return $s;
        }
        $out = '';
        $rest = $s;
        while ($max > 0 && $rest !== '') {
            $n = min($max, 60000);
            if (preg_match('/^.{0,' . $n . '}/su', $rest, $m) !== 1) {
                break;
            }
            $out .= $m[0];
            $rest = (string) substr($rest, strlen($m[0]));
            $max -= $n;
        }
        return $out;
    }

    /** @internal Valid UTF-8 (a broken sequence from a PHP array → U+FFFD bytes). Callers pass bounded strings only. */
    function td__diff_utf8(string $s): string
    {
        return preg_match('//u', $s) === 1 ? $s : (string) preg_replace('/[\x80-\xFF]/', "\xEF\xBF\xBD", $s);
    }

    /** @internal The first $bytes bytes of $s without a cut multi-byte sequence at the end. */
    function td__diff_bytes(string $s, int $bytes): string
    {
        if (strlen($s) <= $bytes) {
            return $s;
        }
        $h = substr($s, 0, $bytes);
        for ($i = 0; $i < 3 && preg_match('//u', $h) !== 1; $i++) {
            $h = substr($h, 0, -1);
        }
        return $h;
    }

    /** @internal = cpOver(): more than $max code points? Never looks at more than 4 × $max bytes. */
    function td__diff_cpover(string $s, int $max): bool
    {
        if (strlen($s) <= $max) {
            return false;
        }
        if (strlen($s) > $max * 4) {
            return true;
        }
        return td__diff_cplen(td__diff_utf8($s)) > $max;
    }

    /**
     * @internal = headOf(): [first 4 × $max code points (valid UTF-8, for DISPLAY), longer?, equality key]. The key is the
     * same head for valid UTF-8 (= JS); for invalid bytes (PHP native input — round 2 A) the bounded RAW bytes, so two
     * different invalid strings never compare equal after U+FFFD replacement.
     */
    function td__diff_head(string $raw, int $max): array
    {
        if (strlen($raw) <= $max * 4) {
            return preg_match('//u', $raw) === 1 ? [$raw, false, $raw] : [td__diff_utf8($raw), false, $raw];
        }
        $b = substr($raw, 0, $max * 16);
        $valid = preg_match('//u', td__diff_bytes($raw, $max * 16)) === 1;
        $h = td__diff_utf8(td__diff_bytes($raw, $max * 16));
        $long = strlen($raw) > $max * 16 || td__diff_cplen($h) > $max * 4;
        $head = td__diff_cpslice($h, $max * 4);
        return [$head, $long, $valid ? $head : $b];
    }

    /** @internal = cleanText(): ['s', 'cut', 'empty', 'head', 'long']. */
    function td__diff_clean(string $raw, int $max): array
    {
        [$head, $long, $key] = td__diff_head($raw, $max);
        $s = (string) preg_replace('/[\x{0}-\x{8}\x{B}-\x{1F}\x{7F}-\x{9F}]/u', '', $head);
        $t = td__diff_cpslice($s, $max);
        return ['s' => $t, 'cut' => $long || strlen($t) < strlen($s),
            'empty' => !$long && preg_match('/^[' . Td::JS_WS . ']*$/u', $s) === 1, 'head' => $key, 'long' => $long];
    }

    /** @internal = cleanLabel(). */
    function td__diff_label(string $raw, int $max = 200): string
    {
        $r = td__diff_clean($raw, $max);
        return $r['cut'] ? $r['s'] . '…' : $r['s'];
    }

    /** @internal = keyId(): the raw key up to 1000 code points; a longer one → a unique segment (never merged, too large). */
    function td__diff_keyid(string $k, array &$ctx, string $side): string
    {
        if (!td__diff_cpover($k, 1000)) {
            if (preg_match('//u', $k) === 1) {
                return $k;
            }
            // round 2 A: invalid UTF-8 (PHP native input) — never merged: the display prefix, padded past the 1000-code-point
            // cap with C0 controls (removed from labels), then a per-call counter encoded in C0 controls too
            $ctx['overKeys']++;
            $p = td__diff_cpslice(td__diff_utf8($k), 200);
            $n = strtr((string) $ctx['overKeys'], '0123456789', "\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C");
            $id = $p . str_repeat("\x01", 1001 - td__diff_cplen($p)) . "\x0E" . ['a' => "\x0F", 'b' => "\x10", 'i' => "\x11"][$side] . $n;
            $ctx['disp'][$id] = $k; // round 3 #13: the identity matches rows only; labels / paths / JSON keys show the raw key
            return $id;
        }
        $ctx['tooLarge'] = true;
        $ctx['overKeys']++;
        return td__diff_cpslice(td__diff_utf8(td__diff_bytes($k, 4000)), 1000) . '#' . $side . $ctx['overKeys'];
    }

    /** @internal = keyText(): a key as printed in the JSON view (200 code points + `…`). */
    function td__diff_keytext(string $k): string
    {
        return td__diff_cpover($k, 200) ? td__diff_cpslice(td__diff_utf8(td__diff_bytes($k, 800)), 200) . '…' : td__diff_utf8($k);
    }

    /** @internal `{n}` placeholders (strtr: data stays literal). */
    function td__diff_fill(string $t, array $vars): string
    {
        $map = [];
        foreach ($vars as $k => $v) {
            $map['{' . $k . '}'] = (string) $v;
        }
        return strtr($t, $map);
    }

    // --- numbers (QĐ 7a) ---

    /** @internal = canonicalNumber(): ['t' => 'n', 's'] | ['t' => 'u'] (unsafe integer) | ['t' => 'x'] (non-finite). */
    function td__diff_number(int|float $x): array
    {
        $max = 9007199254740991;
        if (is_int($x)) {
            return $x > $max || $x < -$max ? ['t' => 'u'] : ['t' => 'n', 's' => (string) $x];
        }
        if (!is_finite($x)) {
            return ['t' => 'x'];
        }
        if (floor($x) === $x) {
            return abs($x) > $max ? ['t' => 'u'] : ['t' => 'n', 's' => (string) (int) $x];
        }
        return ['t' => 'n', 's' => td__js_number($x)];
    }

    /** @internal = roundDecimal(): half-up on the decimal string. */
    function td__diff_round(string $canon, int $d): string
    {
        $neg = str_starts_with($canon, '-');
        $body = $neg ? substr($canon, 1) : $canon;
        $dot = strpos($body, '.');
        if ($dot === false || strlen($body) - $dot - 1 <= $d) {
            return $canon;
        }
        $int = substr($body, 0, $dot);
        $frac = substr($body, $dot + 1);
        $digits = $int . substr($frac, 0, $d);
        if (ord($frac[$d]) >= 53) {
            $i = strlen($digits) - 1;
            while ($i >= 0) {
                if ($digits[$i] === '9') {
                    $digits[$i] = '0';
                    $i--;
                } else {
                    $digits[$i] = chr(ord($digits[$i]) + 1);
                    break;
                }
            }
            if ($i < 0) {
                $digits = '1' . $digits;
            }
        }
        $il = strlen($digits) - $d;
        $out = (string) preg_replace('/^0+(?=[0-9])/', '', substr($digits, 0, $il));
        $f = rtrim((string) substr($digits, $il), '0');
        if ($out === '') {
            $out = '0';
        }
        $r = $out . ($f !== '' ? '.' . $f : '');
        return $neg && $r !== '0' ? '-' . $r : $r;
    }

    /** @internal = formatNumber(). */
    function td__diff_format_number(string $canon, ?int $decimals, string $unit): string
    {
        $s = $canon;
        if (!preg_match('/[eE]/', $s)) {
            if ($decimals !== null) {
                $s = td__diff_round($s, $decimals);
            }
            $neg = str_starts_with($s, '-');
            $parts = explode('.', $neg ? substr($s, 1) : $s, 2);
            $int = $parts[0];
            $g = $int;
            if (strlen($int) > 3) {
                $head = strlen($int) % 3 ?: 3;
                $g = substr($int, 0, $head);
                for ($i = $head; $i < strlen($int); $i += 3) {
                    $g .= '.' . substr($int, $i, 3);
                }
            }
            $s = ($neg ? '-' : '') . $g . (isset($parts[1]) ? ',' . $parts[1] : '');
        }
        return $unit !== '' ? $s . ' ' . $unit : $s;
    }

    /** @internal = formatDate(). */
    function td__diff_date(string $s): ?string
    {
        if (!preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/', $s, $m)) {
            return null;
        }
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        $leap = ($y % 4 === 0 && $y % 100 !== 0) || $y % 400 === 0;
        $dim = [31, $leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if ($mo < 1 || $mo > 12 || $d < 1 || $d > $dim[$mo - 1]) {
            return null;
        }
        return $m[3] . '/' . $m[2] . '/' . $m[1];
    }

    // --- key order (QĐ 3a) ---

    /** @internal An array-index key exactly as JS defines it (0 … 4294967294, canonical decimal). */
    function td__diff_is_index(string $k): bool
    {
        if (!preg_match('/^(0|[1-9][0-9]{0,9})$/', $k)) {
            return false;
        }
        return strlen($k) < 10 || strcmp($k, '4294967294') <= 0;
    }

    /**
     * @internal JS own-property order of [key, value] entries: index keys ascending (length, then strcmp), then the others in
     * insertion order.
     */
    function td__diff_order(array $entries): array
    {
        $idx = [];
        $rest = [];
        foreach ($entries as $e) {
            if (td__diff_is_index($e[0])) {
                $idx[] = $e;
            } else {
                $rest[] = $e;
            }
        }
        usort($idx, static fn ($a, $b) => strlen($a[0]) <=> strlen($b[0]) ?: strcmp($a[0], $b[0]));
        return array_merge($idx, $rest);
    }

    // --- values ---

    /** @internal PHP array as a list (array_is_list() of PHP 8.1, here for 8.0). */
    function td__diff_is_list(array $a): bool
    {
        $i = 0;
        foreach ($a as $k => $_) {
            if ($k !== $i++) {
                return false;
            }
        }
        return true;
    }

    /** @internal 'scalar' | 'array' (list) | 'object' (stdClass / associative array) | 'other'. */
    function td__diff_shape(mixed $v): string
    {
        if ($v === null || is_string($v) || is_int($v) || is_float($v) || is_bool($v)) {
            return 'scalar';
        }
        if (is_array($v)) {
            return td__diff_is_list($v) ? 'array' : 'object';
        }
        return $v instanceof \stdClass ? 'object' : 'other';
    }

    /** @internal [key (string), value] entries of an object in JS order (keys always strings). */
    function td__diff_entries(array|\stdClass $o): array
    {
        $out = [];
        foreach ($o as $k => $v) {
            $out[] = [(string) $k, $v];
        }
        return td__diff_order($out);
    }

    /** @internal Number of entries of an object / list. */
    function td__diff_count(array|\stdClass $v): int
    {
        if (is_array($v)) {
            return count($v);
        }
        $n = 0;
        foreach ($v as $_) {
            $n++;
        }
        return $n;
    }

    /** @internal Shared per-diff work budget (round 1 S2): false once spent. */
    function td__diff_canwork(array &$ctx, int $cost): bool
    {
        if ($ctx['work'] >= $cost) {
            return true;
        }
        $ctx['tooLarge'] = true;
        return false;
    }

    /** @internal = strEqual(): bounded string equality 1 / 0 / 2. */
    function td__diff_str_equal(string $a, string $b): int
    {
        [, $xl, $x] = td__diff_head($a, 10000);
        [, $yl, $y] = td__diff_head($b, 10000);
        if ($xl || $yl) {
            return $xl && $yl && $x === $y ? 2 : 0;
        }
        return $x === $y ? 1 : 0;
    }

    /** @internal = deepEqual(): 1 / 0 / 2 (cannot tell). */
    function td__diff_equal(mixed $a, mixed $b, array &$budget, int $depth = 0): int
    {
        if (--$budget['left'] < 0 || $depth > 64) {
            return 2;
        }
        $sa = td__diff_shape($a);
        $sb = td__diff_shape($b);
        if ($sa === 'scalar' && $sb === 'scalar') {
            if ($a === null || $b === null) {
                return $a === null && $b === null ? 1 : 0;
            }
            $na = is_int($a) || is_float($a);
            $nb = is_int($b) || is_float($b);
            if ($na || $nb) {
                if (!$na || !$nb) {
                    return 0;
                }
                $ca = td__diff_number($a);
                $cb = td__diff_number($b);
                if ($ca['t'] !== 'n' || $cb['t'] !== 'n') {
                    return 2;
                }
                return $ca['s'] === $cb['s'] ? 1 : 0;
            }
            if (is_string($a) && is_string($b)) {
                return td__diff_str_equal($a, $b);
            }
            return $a === $b ? 1 : 0;
        }
        if ($sa !== $sb) {
            if ($sa === 'scalar' || $sb === 'scalar') {
                return 0;
            }
            return $sa === 'other' || $sb === 'other' ? 2 : 0;
        }
        if ($sa === 'other') {
            return 2;
        }
        if ($sa === 'array') {
            if (count($a) > 1000 || count($b) > 1000) {
                return 2; // round 2 C: never walk an over-cap container
            }
            if (count($a) !== count($b)) {
                return 0;
            }
            $unsure = false;
            foreach ($a as $i => $x) {
                $r = td__diff_equal($x, $b[$i], $budget, $depth + 1);
                if ($r === 0) {
                    return 0;
                }
                if ($r === 2) {
                    $unsure = true;
                    if ($budget['left'] < 0) {
                        return 2;
                    }
                }
            }
            return $unsure ? 2 : 1;
        }
        if (td__diff_count($a) > 1000 || td__diff_count($b) > 1000) {
            return 2; // round 2 C
        }
        $ea = td__diff_entries($a);
        $eb = td__diff_entries($b);
        if (count($ea) !== count($eb)) {
            return 0;
        }
        $budget['left'] -= count($ea);
        if ($budget['left'] < 0) {
            return 2;
        }
        foreach ([$ea, $eb] as $list) {
            foreach ($list as $e) {
                if (td__diff_cpover($e[0], 1000)) {
                    return 2;
                }
            }
        }
        $mb = [];
        foreach ($eb as $e) {
            $mb['k' . $e[0]] = $e;
        }
        foreach ($ea as $e) {
            if (!isset($mb['k' . $e[0]])) {
                return 0;
            }
        }
        $unsure = false;
        foreach ($ea as $e) {
            $r = td__diff_equal($e[1], $mb['k' . $e[0]][1], $budget, $depth + 1);
            if ($r === 0) {
                return 0;
            }
            if ($r === 2) {
                $unsure = true;
                if ($budget['left'] < 0) {
                    return 2;
                }
            }
        }
        return $unsure ? 2 : 1;
    }

    // --- JSON writer (= JsonWriter of diff-model.js) ---

    /** @internal JSON string literal with the kit escapes (C0, DEL, C1 as \u00xx). */
    function td__diff_json_string(string $s): string
    {
        return '"' . preg_replace_callback('/["\\\\\x{0}-\x{1F}\x{7F}-\x{9F}]/u', static function (array $m): string {
            $c = $m[0];
            $map = ['"' => '\\"', '\\' => '\\\\', "\n" => '\\n', "\r" => '\\r', "\t" => '\\t', "\x08" => '\\b', "\x0C" => '\\f'];
            if (isset($map[$c])) {
                return $map[$c];
            }
            $cp = strlen($c) === 1 ? ord($c) : ((ord($c[0]) & 0x1F) << 6) | (ord($c[1]) & 0x3F);
            return sprintf('\\u%04x', $cp);
        }, $s) . '"';
    }

    /** @internal Budgeted writer state: ['pretty', 'left', 'lines', 'cur', 'cut', 'L', 'masks', 'unsafe']. */
    function td__diff_put(array &$w, string $t): bool
    {
        if ($w['cut']) {
            return false;
        }
        $n = td__diff_u16($t);
        if ($n > $w['left']) {
            $w['cut'] = true;
            return false;
        }
        $w['left'] -= $n;
        $w['cur'] .= $t;
        return true;
    }

    function td__diff_nl(array &$w, int $indent): bool
    {
        if (!$w['pretty'] || $w['cut']) {
            return !$w['cut'];
        }
        if (1 + $indent > $w['left']) {
            $w['cut'] = true;
            return false;
        }
        $w['left'] -= 1 + $indent;
        $w['lines'][] = $w['cur'];
        $w['cur'] = str_repeat(' ', $indent);
        return true;
    }

    function td__diff_wscalar(array &$w, mixed $v): string
    {
        if ($v === null) {
            return 'null';
        }
        if (is_string($v)) {
            $r = td__diff_clean($v, 10000);
            return td__diff_json_string($r['cut'] ? $r['s'] . '…' : $r['s']);
        }
        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }
        $c = td__diff_number($v);
        if ($c['t'] === 'n') {
            return $c['s'];
        }
        $w['unsafe'] = true;
        return td__diff_json_string($c['t'] === 'u' ? $w['L']['unsafeNumber'] : $w['L']['unsupported']);
    }

    function td__diff_wvalue(array &$w, mixed $v, array $path, int $indent, array $anc): void
    {
        if ($w['cut']) {
            return;
        }
        $shape = td__diff_shape($v);
        if ($shape === 'scalar') {
            td__diff_put($w, td__diff_wscalar($w, $v));
            return;
        }
        if ($shape === 'other') {
            td__diff_put($w, td__diff_json_string($w['L']['unsupported']));
            return;
        }
        if (is_object($v) && in_array($v, $anc, true)) {
            td__diff_put($w, td__diff_json_string($w['L']['cycle']));
            return;
        }
        if (count($anc) >= 32) {
            td__diff_put($w, td__diff_json_string('…'));
            return;
        }
        $arr = $shape === 'array';
        $entries = $arr ? null : td__diff_entries($v);
        $len = $arr ? count($v) : count($entries);
        if ($len === 0) {
            td__diff_put($w, $arr ? '[]' : '{}');
            return;
        }
        if ($arr && td__diff_maskbelow($w['masks'], $path) && td__diff_masked_list($v, $len, $path, $w['masks'])) {
            td__diff_put($w, td__diff_json_string($w['L']['masked']));
            return;
        }
        if (!td__diff_put($w, $arr ? '[' : '{')) {
            return;
        }
        $anc[] = $v;
        for ($i = 0; $i < $len && !$w['cut']; $i++) {
            if ($i > 0 && !td__diff_put($w, ',')) {
                break;
            }
            if ($w['pretty']) {
                if (!td__diff_nl($w, $indent + 2)) {
                    break;
                }
            } elseif ($i > 0 && !td__diff_put($w, ' ')) {
                break;
            }
            $seg = $arr ? $i : (td__diff_cpover($entries[$i][0], 1000) || preg_match('//u', $entries[$i][0]) !== 1 ? null : $entries[$i][0]);
            if (!$arr && !td__diff_put($w, td__diff_json_string(td__diff_keytext($entries[$i][0])) . ': ')) {
                break;
            }
            $p = array_merge($path, [$seg]);
            if ($seg !== null && td__diff_masked($w['masks'], $p)) {
                td__diff_put($w, td__diff_json_string($w['L']['masked']));
                continue;
            }
            td__diff_wvalue($w, $arr ? $v[$i] : $entries[$i][1], $p, $indent + 2, $anc);
        }
        if ($w['cut']) {
            return;
        }
        if ($w['pretty'] && !td__diff_nl($w, $indent)) {
            return;
        }
        td__diff_put($w, $arr ? ']' : '}');
    }

    function td__diff_writer(array $L, bool $pretty, int $budget, array $masks): array
    {
        return ['pretty' => $pretty, 'left' => $budget, 'lines' => [], 'cur' => '', 'cut' => false, 'L' => $L, 'masks' => $masks,
            'unsafe' => false];
    }

    function td__diff_wtext(array $w): string
    {
        return $w['pretty'] ? implode("\n", array_merge($w['lines'], [$w['cur']])) : $w['cur'];
    }

    // --- masks / FieldDefs ---

    function td__diff_prefix(array $pre, array $path): bool
    {
        if (count($pre) > count($path)) {
            return false;
        }
        foreach ($pre as $i => $s) {
            if ($s !== $path[$i]) {
                return false;
            }
        }
        return true;
    }

    function td__diff_masked(array $masks, array $path): bool
    {
        foreach ($masks as $m) {
            if (td__diff_prefix($m, $path)) {
                return true;
            }
        }
        return false;
    }

    /** @internal A masked FieldDef lies strictly below $path. */
    function td__diff_maskbelow(array $masks, array $path): bool
    {
        foreach ($masks as $m) {
            if (count($m) > count($path) && td__diff_prefix($path, $m)) {
                return true;
            }
        }
        return false;
    }

    /** @internal = maskedList(): the inspected, unmasked elements are all scalars. */
    function td__diff_masked_list(array $v, int $len, array $path, array $masks): bool
    {
        $n = min($len, 200);
        for ($i = 0; $i < $n; $i++) {
            if (td__diff_masked($masks, array_merge($path, [$i]))) {
                continue;
            }
            if (td__diff_shape($v[$i]) !== 'scalar') {
                return false;
            }
        }
        return true;
    }

    /** @internal A FieldDef / item property (array or stdClass); $has = whether it exists. */
    function td__diff_get(array|\stdClass $o, string $k, ?bool &$has = null): mixed
    {
        if (is_array($o)) {
            $has = array_key_exists($k, $o);
            return $has ? $o[$k] : null;
        }
        $has = property_exists($o, $k);
        return $has ? $o->{$k} : null;
    }

    /** @internal label / type / options / decimals / unit / masked (= readOpts()). */
    function td__diff_opts(array|\stdClass $o): array
    {
        $label = td__diff_get($o, 'label');
        $label = is_string($label) ? td__diff_label($label) : '';
        $type = td__diff_get($o, 'type');
        $options = td__diff_get($o, 'options');
        $dec = td__diff_get($o, 'decimals');
        $unit = td__diff_get($o, 'unit');
        return [
            'label' => $label !== '' ? $label : null,
            'type' => in_array($type, ['text', 'number', 'money', 'boolean', 'date', 'enum', 'list', 'json'], true) ? $type : null,
            'options' => is_array($options) || $options instanceof \stdClass ? $options : null,
            'decimals' => is_int($dec) || (is_float($dec) && is_finite($dec)) ? (int) min(6, max(0, $dec < 0 ? ceil($dec) : floor($dec))) : null,
            'unit' => is_string($unit) ? td__diff_label($unit, 20) : null,
            'masked' => td__diff_get($o, 'masked') === true,
        ];
    }

    /** @internal Valid FieldDefs (= readFields()); invalid ones → warning codes `field:i`. Segments stay RAW. */
    function td__diff_fields(mixed $fields, array &$warn): array
    {
        $out = [];
        if ($fields === null) {
            return $out;
        }
        if (!is_array($fields) || !td__diff_is_list($fields)) {
            $warn[] = 'fields';
            return $out;
        }
        if (count($fields) > 200) {
            $warn[] = 'fields';
        }
        foreach (array_slice($fields, 0, 200) as $i => $f) {
            $path = null;
            if (is_array($f) || $f instanceof \stdClass) {
                $p = td__diff_get($f, 'path');
                if (is_string($p)) {
                    $p = [$p];
                }
                if (is_array($p) && td__diff_is_list($p) && count($p) >= 1 && count($p) <= 7) {
                    $path = [];
                    foreach ($p as $s) {
                        if (is_string($s) && !td__diff_cpover($s, 200) && preg_match('//u', $s) === 1) {
                            $path[] = $s;
                        } elseif (is_int($s) && $s >= 0 && $s <= 9007199254740991) {
                            $path[] = $s;
                        } else {
                            $path = null;
                            break;
                        }
                    }
                }
            }
            if ($path === null) {
                $warn[] = 'field:' . $i;
                continue;
            }
            $out[] = ['path' => $path] + td__diff_opts($f);
        }
        return $out;
    }

    function td__diff_option(mixed $options, string $code): ?string
    {
        if ($options === null) {
            return null;
        }
        $v = td__diff_get($options, $code, $has);
        return $has && is_string($v) ? td__diff_label($v) : null;
    }

    // --- descriptors (= diff-model.js) ---

    function td__diff_scalar(mixed $v, array &$ctx, int $max = 10000): array
    {
        if ($v === null) {
            return ['t' => 'e'];
        }
        if (is_string($v)) {
            $r = td__diff_clean($v, $max);
            return $r['empty'] ? ['t' => 'e'] : ['t' => 's', 'key' => $r['head'], 'long' => $r['long'], 's' => $r['s'], 'cut' => $r['cut']];
        }
        if (is_bool($v)) {
            return ['t' => 'b', 'v' => $v];
        }
        $c = td__diff_number($v);
        if ($c['t'] !== 'n') {
            $ctx['unsafe'] = true;
        }
        return $c;
    }

    /** @internal = listOf(): ['k' => 'list', 'vals'] | ['k' => 'masked'] | ['k' => 'no'] | ['k' => 'skip']. */
    function td__diff_list_of(array $v, int $len, array $path, array &$ctx): array
    {
        $n = min($len, 200);
        $masked = td__diff_maskbelow($ctx['masks'], $path);
        // round 3 #14: a descendant mask is checked FIRST — without budget the array is conservatively one masked leaf
        if (!td__diff_canwork($ctx, $n)) {
            return $masked ? ['k' => 'masked'] : ['k' => 'skip'];
        }
        $ctx['work'] -= $n;
        $vals = [];
        for ($i = 0; $i < $n; $i++) {
            if (td__diff_masked($ctx['masks'], array_merge($path, [$i]))) {
                $masked = true;
                continue;
            }
            if (td__diff_shape($v[$i]) !== 'scalar') {
                return ['k' => 'no'];
            }
            $vals[] = $v[$i];
        }
        return $masked ? ['k' => 'masked'] : ['k' => 'list', 'vals' => $vals];
    }

    /** @internal = jsonDesc(): a value through the bounded one-line JSON writer. */
    function td__diff_json_desc(mixed $v, array $path, array &$ctx): array
    {
        $w = td__diff_writer($ctx['L'], false, 10000, $ctx['masks']);
        td__diff_wvalue($w, $v, $path, 0, []);
        if ($w['unsafe']) {
            $ctx['unsafe'] = true;
        }
        return ['t' => 'j', 's' => td__diff_wtext($w), 'cut' => $w['cut'], 'ref' => $v];
    }

    /** @internal = scalarLeaf(). */
    function td__diff_scalar_leaf(mixed $v, ?string $type, array $path, array &$ctx): array
    {
        $d = td__diff_scalar($v, $ctx);
        return $d['t'] === 'e' || $type !== 'json' ? $d : td__diff_json_desc($v, $path, $ctx);
    }

    function td__diff_list_desc(array $vals, int $len, array &$ctx): array
    {
        $items = [];
        foreach ($vals as $x) {
            $items[] = td__diff_scalar($x, $ctx, 200);
        }
        return ['t' => 'l', 'items' => $items, 'len' => $len];
    }

    /** @internal = containerLeaf(). */
    function td__diff_container_leaf(mixed $v, string $shape, array $path, array &$ctx, ?string $type): array
    {
        if ($shape === 'other') {
            return ['t' => 'note', 's' => $ctx['L']['unsupported']];
        }
        $arr = $shape === 'array';
        $len = td__diff_count($v);
        if ($len === 0) {
            return ['t' => 'e'];
        }
        if ($len > 1000) {
            $ctx['tooLarge'] = true;
            return ['t' => 'note', 's' => td__diff_fill($arr ? $ctx['L']['arraySummary'] : $ctx['L']['objectSummary'], ['n' => $len])];
        }
        if ($arr) {
            $l = td__diff_list_of($v, $len, $path, $ctx);
            if ($l['k'] === 'masked') {
                return ['t' => 'm'];
            }
            if ($l['k'] === 'skip') {
                return ['t' => 'note', 's' => td__diff_fill($ctx['L']['arraySummary'], ['n' => $len])];
            }
            if ($l['k'] === 'list') {
                return $type === 'json' ? td__diff_json_desc($v, $path, $ctx) : td__diff_list_desc($l['vals'], $len, $ctx);
            }
        }
        return td__diff_json_desc($v, $path, $ctx);
    }

    function td__diff_unique(array $d): bool
    {
        return $d['t'] === 'u' || $d['t'] === 'x' || ($d['t'] === 's' && $d['long']);
    }

    function td__diff_elem_key(array $d, int $i, string $side): string
    {
        if (td__diff_unique($d)) {
            return '!' . $side . $i;
        }
        switch ($d['t']) {
            case 's':
                return 's' . $d['key'];
            case 'n':
                return 'n' . $d['s'];
            case 'b':
                return $d['v'] ? 'b1' : 'b0';
        }
        return 'e';
    }

    /** @internal = setEqual() (round 2 B: an absence is certain only against a fully inspected opposite side). */
    function td__diff_set_equal(array $a, array $b, array &$ctx): int
    {
        $cost = count($a['items']) + count($b['items']);
        if (!td__diff_canwork($ctx, $cost)) {
            return 2;
        }
        $ctx['work'] -= $cost;
        $ka = [];
        $kb = [];
        $ua = 0;
        $ub = 0;
        foreach ($a['items'] as $i => $x) {
            if (td__diff_unique($x)) {
                $ua++;
            } else {
                $ka['k' . td__diff_elem_key($x, $i, 'a')] = true;
            }
        }
        foreach ($b['items'] as $i => $x) {
            if (td__diff_unique($x)) {
                $ub++;
            } else {
                $kb['k' . td__diff_elem_key($x, $i, 'b')] = true;
            }
        }
        $aOnly = false;
        $bOnly = false;
        foreach ($ka as $k => $_) {
            if (!isset($kb[$k])) {
                $aOnly = true;
                break;
            }
        }
        foreach ($kb as $k => $_) {
            if (!isset($ka[$k])) {
                $bOnly = true;
                break;
            }
        }
        $ca = $a['len'] === count($a['items']);
        $cb = $b['len'] === count($b['items']);
        if (($aOnly && $cb) || ($bOnly && $ca) || ($ua > 0 && $ub === 0 && $cb) || ($ub > 0 && $ua === 0 && $ca)) {
            return 0;
        }
        return $aOnly || $bOnly || $ua > 0 || $ub > 0 || !$ca || !$cb ? 2 : 1;
    }

    function td__diff_desc_equal(array $a, array $b, array &$ctx): int
    {
        if (in_array($a['t'], ['u', 'x'], true) || in_array($b['t'], ['u', 'x'], true)) {
            return 2;
        }
        if ($a['t'] === 'note' && !array_key_exists('ref', $a)) {
            return 2;
        }
        if ($b['t'] === 'note' && !array_key_exists('ref', $b)) {
            return 2;
        }
        $ra = $a['t'] === 'j' || $a['t'] === 'note';
        $rb = $b['t'] === 'j' || $b['t'] === 'note';
        if ($ra || $rb) {
            if (!($ra && $rb)) {
                return 0;
            }
            if (!td__diff_canwork($ctx, 10000)) {
                return 2;
            }
            $budget = ['left' => 10000];
            $start = $budget['left'];
            $r = td__diff_equal($a['ref'], $b['ref'], $budget);
            $ctx['work'] -= $start - max($budget['left'], 0);
            return $r;
        }
        if ($a['t'] !== $b['t']) {
            return 0;
        }
        switch ($a['t']) {
            case 's':
                if ($a['long'] || $b['long']) {
                    return $a['long'] && $b['long'] && $a['key'] === $b['key'] ? 2 : 0;
                }
                return $a['key'] === $b['key'] ? 1 : 0;
            case 'n':
                return $a['s'] === $b['s'] ? 1 : 0;
            case 'b':
                return $a['v'] === $b['v'] ? 1 : 0;
            case 'l':
                return td__diff_set_equal($a, $b, $ctx);
        }
        return 0;
    }

    function td__diff_kind(array $b, array $a, array &$ctx): array
    {
        $eb = $b['t'] === 'e';
        $ea = $a['t'] === 'e';
        if ($eb && $ea) {
            return ['unchanged', false];
        }
        if ($eb) {
            return ['added', false];
        }
        if ($ea) {
            return ['removed', false];
        }
        $r = td__diff_desc_equal($b, $a, $ctx);
        return $r === 1 ? ['unchanged', false] : ['changed', $r === 2];
    }

    /** @internal = scalarText(): ['s', 'note', 'cut']. */
    function td__diff_scalar_text(array $d, ?string $type, array $def, array $L, bool $inList): array
    {
        $unit = static fn (): string => $def['unit'] !== null ? $def['unit'] : ($type === 'money' ? '₫' : '');
        switch ($d['t']) {
            case 'e':
                return ['s' => '—', 'note' => true, 'cut' => false];
            case 'u':
                return ['s' => $L['unsafeNumber'], 'note' => true, 'cut' => false];
            case 'x':
                return ['s' => $L['unsupported'], 'note' => true, 'cut' => false];
            case 'b':
                $o = $type === 'enum' ? td__diff_option($def['options'], $d['v'] ? 'true' : 'false') : null;
                return ['s' => $o ?? ($d['v'] ? $L['yes'] : $L['no']), 'note' => false, 'cut' => false];
            case 'n':
                if ($type === 'enum') {
                    return ['s' => td__diff_option($def['options'], $d['s']) ?? $d['s'], 'note' => false, 'cut' => false];
                }
                if ($type === 'text') {
                    return ['s' => $d['s'], 'note' => false, 'cut' => false];
                }
                return ['s' => td__diff_format_number($d['s'], $def['decimals'], $unit()), 'note' => false, 'cut' => false];
        }
        if ($type === 'enum') {
            $o = $d['long'] ? null : td__diff_option($def['options'], $d['key']);
            if ($o !== null) {
                return ['s' => $o, 'note' => false, 'cut' => false];
            }
        } elseif ($type === 'date') {
            $f = td__diff_date($d['s']);
            if ($f !== null) {
                return ['s' => $f, 'note' => false, 'cut' => false];
            }
        } elseif (($type === 'number' || $type === 'money') && !$d['cut'] && preg_match('/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/', $d['s'])) {
            return ['s' => td__diff_format_number($d['s'] === '-0' ? '0' : $d['s'], $def['decimals'], $unit()), 'note' => false, 'cut' => false];
        }
        return $inList ? ['s' => $d['cut'] ? $d['s'] . '…' : $d['s'], 'note' => false, 'cut' => false] : ['s' => $d['s'], 'note' => false, 'cut' => $d['cut']];
    }

    /** @internal = cellOf(). */
    function td__diff_cell(array $d, string $type, array $def, array $L, array $other, string $marks): ?array
    {
        switch ($d['t']) {
            case 'e':
                return null;
            case 'm':
                return ['k' => 'masked'];
            case 'u':
                return ['k' => 'note', 's' => $L['unsafeNumber']];
            case 'x':
                return ['k' => 'note', 's' => $L['unsupported']];
            case 'note':
                return ['k' => 'note', 's' => $d['s']];
            case 'j':
                return ['k' => 'json', 's' => $d['s'], 'cut' => $d['cut']];
            case 'l':
                $set = null;
                if ($marks !== '' && $other['t'] === 'l' && $other['len'] === count($other['items'])) {
                    $set = [];
                    foreach ($other['items'] as $i => $x) {
                        $set['k' . td__diff_elem_key($x, $i, 'o')] = true;
                    }
                }
                $items = [];
                foreach ($d['items'] as $i => $x) {
                    $c = td__diff_scalar_text($x, $type === 'enum' ? 'enum' : null, $def, $L, true);
                    $items[] = ['s' => $c['s'], 'note' => $c['note'],
                        'm' => $set !== null ? (isset($set['k' . td__diff_elem_key($x, $i, 's')]) ? '' : $marks) : ''];
                }
                return ['k' => 'list', 'items' => $items, 'more' => $d['len'] - count($d['items'])];
        }
        $c = td__diff_scalar_text($d, $type, $def, $L, false);
        return $c['note'] ? ['k' => 'note', 's' => $c['s']] : ['k' => 'text', 's' => $c['s'], 'cut' => $c['cut']];
    }

    function td__diff_infer(array $a, array $b): string
    {
        $d = $a['t'] !== 'e' && $a['t'] !== 'm' ? $a : $b;
        switch ($d['t']) {
            case 'n':
            case 'u':
            case 'x':
                return 'number';
            case 'b':
                return 'boolean';
            case 'l':
                return 'list';
            case 'j':
                return 'json';
        }
        return 'text';
    }

    // --- flattening (= flatten()) ---

    function td__diff_type_at(array $fields, array $path): ?string
    {
        foreach ($fields as $f) {
            if (count($f['path']) === count($path) && td__diff_prefix($f['path'], $path)) {
                return $f['type'];
            }
        }
        return null;
    }

    function td__diff_flatten(mixed $root, array &$ctx, string $side): array
    {
        $map = [];
        $st = ['left' => 10000, 'stop' => false];
        $tick = static function (int $n) use (&$st, &$ctx): bool {
            if ($st['stop']) {
                return false;
            }
            if ($st['left'] < $n) {
                $st['stop'] = true;
                $st['left'] = 0;
                $ctx['tooLarge'] = true;
                return false;
            }
            $st['left'] -= $n;
            return true;
        };
        $emit = static function (array $path, array $desc) use (&$map): void {
            $id = json_encode($path, Td::DIFF_JSON);
            if (!isset($map['k' . $id])) {
                $map['k' . $id] = ['id' => $id, 'path' => $path, 'desc' => $desc];
            }
        };
        $walk = static function (mixed $v, array $path, array $anc) use (&$walk, &$ctx, &$st, $tick, $emit, $side): void {
            if (!$tick(1)) {
                return;
            }
            $shape = td__diff_shape($v);
            $M = ['t' => 'm'];
            $masks = $ctx['masks'];
            if ($shape === 'scalar') {
                if ($path && td__diff_maskbelow($masks, $path)) {
                    $emit($path, $M);
                } elseif ($path || $v !== null) {
                    $emit($path, td__diff_scalar_leaf($v, td__diff_type_at($ctx['fields'], $path), $path, $ctx));
                }
                return;
            }
            if (is_object($v) && in_array($v, $anc, true)) {
                $emit($path, ['t' => 'note', 's' => $ctx['L']['cycle']]);
                return;
            }
            $below = td__diff_maskbelow($masks, $path);
            if ($shape === 'other') {
                $emit($path, $below ? $M : td__diff_container_leaf($v, $shape, $path, $ctx, null));
                return;
            }
            $arr = $shape === 'array';
            $len = td__diff_count($v);
            if ($len === 0) {
                if ($path) {
                    $emit($path, $below ? $M : ['t' => 'e']);
                }
                return;
            }
            if ($len > 1000 || count($path) >= 6) {
                $emit($path, $below ? $M : td__diff_container_leaf($v, $shape, $path, $ctx, td__diff_type_at($ctx['fields'], $path)));
                return;
            }
            if ($arr) {
                $l = td__diff_list_of($v, $len, $path, $ctx);
                if ($l['k'] === 'masked') {
                    $emit($path, $M);
                    return;
                }
                if ($l['k'] === 'skip') {
                    $emit($path, ['t' => 'note', 's' => td__diff_fill($ctx['L']['arraySummary'], ['n' => $len])]);
                    return;
                }
                if ($l['k'] === 'list') {
                    $emit($path, td__diff_type_at($ctx['fields'], $path) === 'json' ? td__diff_json_desc($v, $path, $ctx)
                        : td__diff_list_desc($l['vals'], $len, $ctx));
                    return;
                }
                $anc[] = $v;
                foreach ($v as $i => $x) {
                    if ($st['stop']) {
                        break;
                    }
                    $p = array_merge($path, [$i]);
                    if (td__diff_masked($masks, $p)) {
                        if ($tick(1)) {
                            $emit($p, $M);
                        }
                        continue;
                    }
                    $walk($x, $p, $anc);
                }
                return;
            }
            $anc[] = $v;
            foreach (td__diff_entries($v) as $e) {
                if ($st['stop']) {
                    break;
                }
                $p = array_merge($path, [td__diff_keyid($e[0], $ctx, $side)]);
                if (td__diff_masked($masks, $p)) {
                    if ($tick(1)) {
                        $emit($p, $M);
                    }
                    continue;
                }
                $walk($e[1], $p, $anc);
            }
        };
        $walk($root, [], []);
        return $map;
    }

    function td__diff_seg_text(string|int $seg, array $disp = []): string
    {
        return is_int($seg) ? '#' . ($seg + 1) : td__diff_label($disp[$seg] ?? $seg);
    }

    /** @internal round 3 #13: a path as shown (an invalid-UTF-8 key → its U+FFFD text, never its internal identity). */
    function td__diff_disp_path(array $path, array $disp): array
    {
        foreach ($path as $i => $seg) {
            if (is_string($seg) && isset($disp[$seg])) {
                $path[$i] = td__diff_utf8($disp[$seg]);
            }
        }
        return $path;
    }

    function td__diff_row_label(array $path, array $fields, array $L, array $disp = []): string
    {
        if (!$path) {
            return $L['root'];
        }
        foreach ($fields as $f) {
            if ($f['label'] !== null && count($f['path']) === count($path) && td__diff_prefix($f['path'], $path)) {
                return $f['label'];
            }
        }
        $best = null;
        foreach ($fields as $f) {
            if ($f['label'] !== null && count($f['path']) < count($path) && td__diff_prefix($f['path'], $path)
                && ($best === null || count($f['path']) > count($best['path']))) {
                $best = $f;
            }
        }
        $parts = [];
        if ($best) {
            $parts[] = $best['label'];
        }
        for ($i = $best ? count($best['path']) : 0; $i < count($path); $i++) {
            $parts[] = td__diff_seg_text($path[$i], $disp);
        }
        $s = implode(' › ', $parts);
        return td__diff_cplen($s) > 200 ? td__diff_cpslice($s, 200) . '…' : $s;
    }

    /**
     * @internal Pretty JSON of one side (QĐ 13): [text, cut]. `$entries` (items mode) = ordered [key, view] where view =
     * ['masked' => true, 'text'] | ['masked' => false, 'value'].
     */
    function td__diff_pretty(mixed $v, array &$ctx, ?array $entries): array
    {
        $w = td__diff_writer($ctx['L'], true, 100000, $ctx['masks']);
        if ($entries !== null) {
            $list = td__diff_order($entries);
            if (!$list) {
                td__diff_put($w, '{}');
            } elseif (td__diff_put($w, '{')) {
                foreach ($list as $i => $e) {
                    if ($w['cut']) {
                        break;
                    }
                    if ($i > 0 && !td__diff_put($w, ',')) {
                        break;
                    }
                    if (!td__diff_nl($w, 2)) {
                        break;
                    }
                    if (!td__diff_put($w, td__diff_json_string(td__diff_keytext($ctx['disp'][$e[0]] ?? $e[0])) . ': ')) {
                        break;
                    }
                    if ($e[1]['masked']) {
                        td__diff_put($w, td__diff_wscalar($w, $e[1]['text']));
                    } else {
                        td__diff_wvalue($w, $e[1]['value'], [$e[0]], 2, []);
                    }
                }
                if (!$w['cut'] && td__diff_nl($w, 0)) {
                    td__diff_put($w, '}');
                }
            }
        } else {
            td__diff_wvalue($w, $v, [], 0, []);
        }
        if ($w['unsafe']) {
            $ctx['unsafe'] = true; // round 1 I6
        }
        return [$w['cut'] ? implode("\n", $w['lines']) : td__diff_wtext($w), $w['cut']];
    }

    /** @internal A snapshot side (QĐ 19): JSON string → decoded (objects stay stdClass); [value, note|null]. */
    function td__diff_side(mixed $v): array
    {
        if (!is_string($v)) {
            return [$v, null];
        }
        if (strlen($v) > 2 * 1024 * 1024) {
            return [null, 'tooLarge'];
        }
        try {
            return [json_decode($v, false, 64, JSON_THROW_ON_ERROR), null];
        } catch (\JsonException $e) {
            return [null, 'invalidJson'];
        }
    }

    /**
     * @internal = normalize() of src/utils/diff-model.js (without the JS-only cases). Input: ['items' => …] or
     * ['before', 'after', 'fields', 'decode' (JSON strings)]. Warnings → ONE E_USER_WARNING per call (codes only).
     */
    function td__diff_model(array $input, array $L, bool $json, string $fn): array
    {
        $warn = [];
        $ctx = ['L' => $L, 'tooLarge' => false, 'unsafe' => false, 'work' => 100000, 'overKeys' => 0, 'masks' => [], 'fields' => [], 'disp' => []];
        $rows = [];
        $sides = null;
        $notes0 = [];
        $mk = static fn (): array => ['label' => null, 'type' => null, 'options' => null, 'decimals' => null, 'unit' => null, 'masked' => false];
        if (array_key_exists('items', $input) && $input['items'] !== null) {
            $list = $input['items'];
            if (!is_array($list) || !td__diff_is_list($list)) {
                $warn[] = 'items';
                $list = [];
            }
            if (count($list) > 1000) {
                $ctx['tooLarge'] = true;
            }
            $eb = $json ? [] : null;
            $ea = $json ? [] : null;
            $end = min(count($list), 1000);
            for ($ii = 0; $ii < $end; $ii++) {
                if (!td__diff_canwork($ctx, 1)) {
                    break; // round 3 #15: no further item is read once the budget is spent
                }
                $ctx['work'] -= 1;
                $raw = $list[$ii];
                if (!(is_array($raw) && !td__diff_is_list($raw)) && !($raw instanceof \stdClass)) {
                    $warn[] = 'item';
                    continue;
                }
                $key = td__diff_get($raw, 'key');
                if (is_int($key) || is_float($key)) {
                    $c = td__diff_number($key);
                    $key = $c['t'] === 'n' ? $c['s'] : null;
                }
                if (!is_string($key) || $key === '') {
                    $warn[] = 'item';
                    continue;
                }
                $seg = td__diff_keyid($key, $ctx, 'i');
                $o = td__diff_opts($raw);
                $kindIn = td__diff_get($raw, 'kind', $hasKind);
                $kind = in_array($kindIn, ['added', 'removed', 'changed', 'unchanged'], true) ? $kindIn : null;
                if ($hasKind && $kind === null) {
                    $warn[] = 'kind';
                }
                $bView = null;
                $aView = null;
                if ($o['masked']) {
                    $sideOf = static function (string $k) use ($raw, $L, &$ctx): array {
                        $v = td__diff_get($raw, $k);
                        if (!is_string($v)) {
                            return [['t' => 'm'], ['masked' => true, 'text' => $L['masked']]];
                        }
                        return [td__diff_scalar($v, $ctx), ['masked' => true, 'text' => $v]];
                    };
                    [$b, $bView] = $sideOf('before');
                    [$a, $aView] = $sideOf('after');
                    if ($kind === null) {
                        $kind = $b['t'] !== 'm' && $a['t'] !== 'm' ? td__diff_kind($b, $a, $ctx)[0] : 'changed';
                    }
                } else {
                    $leaf = static function (string $k) use ($raw, $seg, $o, &$ctx): array {
                        $v = td__diff_get($raw, $k, $has);
                        $shape = td__diff_shape($v);
                        $d = $shape === 'scalar' ? td__diff_scalar_leaf($v, $o['type'], [$seg], $ctx)
                            : td__diff_container_leaf($v, $shape, [$seg], $ctx, $o['type']);
                        return [$d, $has ? ['masked' => false, 'value' => $v] : null];
                    };
                    [$b, $bView] = $leaf('before');
                    [$a, $aView] = $leaf('after');
                }
                $uncertain = false;
                if ($kind === null) {
                    [$kind, $uncertain] = td__diff_kind($b, $a, $ctx);
                }
                $rows[] = ['path' => [$seg], 'label' => $o['label'] ?? td__diff_label($key), 'kind' => $kind, 'uncertain' => $uncertain,
                    'masked' => $o['masked'], 'type' => $o['type'] ?? td__diff_infer($a, $b), 'b' => $b, 'a' => $a, 'def' => $o];
                if ($json) {
                    foreach ([[&$eb, $bView], [&$ea, $aView]] as [&$m, $view]) {
                        if ($view === null) {
                            continue;
                        }
                        $found = false;
                        foreach ($m as $j => $e) {
                            if ($e[0] === $seg) {
                                $m[$j][1] = $view;
                                $found = true;
                                break;
                            }
                        }
                        if (!$found) {
                            $m[] = [$seg, $view];
                        }
                    }
                    unset($m);
                }
            }
            if ($json) {
                $sides = [td__diff_pretty(null, $ctx, $eb), td__diff_pretty(null, $ctx, $ea)];
            }
        } else {
            $fields = td__diff_fields($input['fields'] ?? null, $warn);
            $ctx['fields'] = $fields;
            foreach ($fields as $f) {
                if ($f['masked']) {
                    $ctx['masks'][] = $f['path'];
                }
            }
            $before = $input['before'] ?? null;
            $after = $input['after'] ?? null;
            if (!empty($input['decode'])) {
                [$before, $nb] = td__diff_side($before);
                [$after, $na] = td__diff_side($after);
                foreach ([$nb, $na] as $n) {
                    if ($n !== null && !in_array($n, $notes0, true)) {
                        $notes0[] = $n;
                    }
                }
                if ($notes0) {
                    $before = null;
                    $after = null;
                    $json = false;
                }
            }
            $fa = td__diff_flatten($after, $ctx, 'a');
            $fb = td__diff_flatten($before, $ctx, 'b');
            $ids = array_keys($fa);
            foreach (array_keys($fb) as $k) {
                if (!isset($fa[$k])) {
                    $ids[] = $k;
                }
            }
            $tmp = [];
            foreach ($ids as $i => $k) {
                $e = $fa[$k] ?? $fb[$k];
                $r = PHP_INT_MAX;
                foreach ($fields as $fi => $f) {
                    if (td__diff_prefix($f['path'], $e['path'])) {
                        $r = $fi;
                        break;
                    }
                }
                $tmp[] = ['k' => $k, 'path' => $e['path'], 'i' => $i, 'r' => $r];
            }
            usort($tmp, static fn ($x, $y) => $x['r'] <=> $y['r'] ?: $x['i'] <=> $y['i']);
            foreach ($tmp as $t) {
                $b = isset($fb[$t['k']]) ? $fb[$t['k']]['desc'] : ['t' => 'e'];
                $a = isset($fa[$t['k']]) ? $fa[$t['k']]['desc'] : ['t' => 'e'];
                $def = null;
                foreach ($fields as $f) {
                    if (count($f['path']) === count($t['path']) && td__diff_prefix($f['path'], $t['path'])) {
                        $def = $f;
                        break;
                    }
                }
                $def ??= $mk();
                $masked = $b['t'] === 'm' || $a['t'] === 'm';
                $uncertain = false;
                if ($masked) {
                    $kind = 'changed';
                } else {
                    [$kind, $uncertain] = td__diff_kind($b, $a, $ctx);
                }
                $M = ['t' => 'm'];
                $rows[] = ['path' => $t['path'], 'label' => td__diff_row_label($t['path'], $fields, $L, $ctx['disp']), 'kind' => $kind,
                    'uncertain' => $uncertain, 'masked' => $masked, 'type' => $def['type'] ?? td__diff_infer($a, $b),
                    'b' => $masked ? $M : $b, 'a' => $masked ? $M : $a, 'def' => $def];
            }
            if ($json) {
                $sides = [td__diff_pretty($before, $ctx, null), td__diff_pretty($after, $ctx, null)];
            }
        }

        $counts = ['added' => 0, 'removed' => 0, 'changed' => 0, 'unchanged' => 0, 'hidden' => 0, 'truncated' => false];
        foreach ($rows as $r) {
            $counts[$r['kind']]++;
        }
        $keepChanged = min(count($rows) - $counts['unchanged'], 500);
        $keepUnchanged = min($counts['unchanged'], 500 - $keepChanged);
        $keptChanged = 0;
        $kept = [];
        foreach ($rows as $r) {
            if ($r['kind'] === 'unchanged') {
                if ($keepUnchanged > 0) {
                    $keepUnchanged--;
                    $kept[] = $r;
                }
            } elseif ($keptChanged < $keepChanged) {
                $keptChanged++;
                $kept[] = $r;
            }
        }
        $counts['hidden'] = count($rows) - count($kept);
        $used = 0;
        $over = false;
        $budget = static function (?array $c) use (&$used, &$over): ?array {
            if ($c === null) {
                return $c;
            }
            if ($c['k'] === 'list') {
                $keep = [];
                $cell = 0;
                foreach ($c['items'] as $it) {
                    $n = td__diff_cplen($it['s']);
                    if (!$over && $used + $n <= 300000) {
                        $used += $n;
                        $keep[] = $it;
                        continue;
                    }
                    $over = true;
                    if ($cell + $n > 300) {
                        break;
                    }
                    $cell += $n;
                    $keep[] = $it;
                }
                return count($keep) === count($c['items']) ? $c : ['k' => 'list', 'items' => $keep, 'more' => $c['more'] + count($c['items']) - count($keep)];
            }
            if ($c['k'] !== 'text' && $c['k'] !== 'json') {
                return $c;
            }
            $n = td__diff_cplen($c['s']);
            if (!$over && $used + $n <= 300000) {
                $used += $n;
                return $c;
            }
            $over = true;
            if ($n <= 300) {
                return $c;
            }
            return ['k' => $c['k'], 's' => td__diff_cpslice($c['s'], 300), 'cut' => true];
        };
        $out = [];
        foreach ($kept as $r) {
            $marks = $r['kind'] === 'changed' && $r['b']['t'] === 'l' && $r['a']['t'] === 'l';
            $before = $budget(td__diff_cell($r['b'], $r['type'], $r['def'], $L, $r['a'], $marks ? '-' : ''));
            $after = $budget(td__diff_cell($r['a'], $r['type'], $r['def'], $L, $r['b'], $marks ? '+' : ''));
            $out[] = ['id' => json_encode($r['path'], Td::DIFF_JSON), 'path' => td__diff_disp_path($r['path'], $ctx['disp']), 'label' => $r['label'], 'kind' => $r['kind'],
                'uncertain' => $r['uncertain'], 'masked' => $r['masked'], 'type' => $r['type'], 'before' => $before, 'after' => $after];
        }
        $counts['truncated'] = $ctx['tooLarge'] || $counts['hidden'] > 0 || $over || in_array('tooLarge', $notes0, true);
        $notes = [];
        if ($ctx['tooLarge'] || in_array('tooLarge', $notes0, true)) {
            $notes[] = 'tooLarge';
        }
        if ($over) {
            $notes[] = 'textBudget';
        }
        if ($ctx['unsafe']) {
            $notes[] = 'unsafe';
        }
        if (in_array('invalidJson', $notes0, true)) {
            $notes[] = 'invalidJson';
        }
        $warn = array_values(array_unique($warn));
        if ($warn) {
            trigger_error($fn . ': ' . implode(', ', $warn) . ' — see docs/components/diff.md (codes only, no values)', E_USER_WARNING);
        }
        return ['rows' => $out, 'counts' => $counts, 'notes' => $notes,
            'json' => $sides ? ['before' => $sides[0][0], 'beforeCut' => $sides[0][1], 'after' => $sides[1][0], 'afterCut' => $sides[1][1]] : null];
    }

    // --- markup (= diffMarkup() of src/display/td-diff.js) ---

    /**
     * @internal Escaped text with bidi controls / Default_Ignorable_Code_Point as `⟨U+XXXX⟩` spans (= splitInvisible();
     * round 1 S3 — not the variation selectors U+FE00–FE0F).
     */
    function td__diff_vis(string $s): string
    {
        $parts = preg_split('/([\x{AD}\x{34F}\x{61C}\x{115F}\x{1160}\x{17B4}\x{17B5}\x{180B}-\x{180F}\x{200B}-\x{200F}\x{202A}-\x{202E}'
            . '\x{2060}-\x{206F}\x{3164}\x{FEFF}\x{FFA0}\x{FFF0}-\x{FFF8}\x{1BCA0}-\x{1BCA3}\x{1D173}-\x{1D17A}\x{E0000}-\x{E0FFF}])/u',
            $s, -1, PREG_SPLIT_DELIM_CAPTURE);
        $out = '';
        foreach ($parts ?: [] as $i => $p) {
            if ($i % 2 === 0) {
                $out .= Td::e($p);
                continue;
            }
            $b = array_map('ord', str_split($p));
            $cp = match (count($b)) {
                2 => (($b[0] & 0x1F) << 6) | ($b[1] & 0x3F),
                3 => (($b[0] & 0x0F) << 12) | (($b[1] & 0x3F) << 6) | ($b[2] & 0x3F),
                default => (($b[0] & 0x07) << 18) | (($b[1] & 0x3F) << 12) | (($b[2] & 0x3F) << 6) | ($b[3] & 0x3F),
            };
            $out .= '<span class="td-diff__ctl">' . sprintf('⟨U+%04X⟩', $cp) . '</span>';
        }
        return $out;
    }

    function td__diff_value(?array $c, array $L): string
    {
        if ($c === null) {
            return '<span class="td-diff__value td-diff__value--empty"><span aria-hidden="true">—</span><span class="td-sr-only">'
                . Td::e($L['empty']) . '</span></span>';
        }
        if ($c['k'] === 'masked') {
            return '<span class="td-diff__value td-diff__value--masked">' . Td::e($L['masked']) . '</span>';
        }
        if ($c['k'] === 'note') {
            return '<span class="td-diff__value td-diff__value--note" dir="auto">' . td__diff_vis($c['s']) . '</span>';
        }
        if ($c['k'] === 'list') {
            $li = '';
            foreach ($c['items'] as $it) {
                $mark = $it['m'] === '+' ? 'add' : ($it['m'] === '-' ? 'del' : '');
                $li .= '<li class="td-diff__item"' . ($mark !== '' ? ' data-mark="' . $mark . '"' : '') . '>'
                    . ($mark !== '' ? '<span class="td-diff__mark" aria-hidden="true">' . ($mark === 'add' ? '+' : '−') . '</span><span class="td-sr-only">'
                        . Td::e($mark === 'add' ? $L['listAdded'] : $L['listRemoved']) . ' </span>' : '')
                    . '<span class="td-diff__item-value' . ($it['note'] ? ' td-diff__value--note' : '') . '" dir="auto">' . td__diff_vis($it['s']) . '</span></li>';
            }
            if ($c['more'] > 0) {
                $li .= '<li class="td-diff__item td-diff__item--more">' . Td::e(td__diff_fill($L['listMore'], ['n' => $c['more']])) . '</li>';
            }
            return '<ul class="td-diff__list" role="list">' . $li . '</ul>';
        }
        $isJson = $c['k'] === 'json';
        $cls = 'td-diff__value' . ($isJson ? ' td-diff__value--json' : '');
        $dir = $isJson ? 'ltr' : 'auto';
        $cut = $c['cut'] ? '<span class="td-diff__cut">' . Td::e($L['truncated']) . '</span>' : '';
        $n = td__diff_cplen($c['s']);
        if ($n <= 300) {
            return '<span class="' . $cls . '" dir="' . $dir . '">' . td__diff_vis($c['s']) . '</span>' . $cut;
        }
        return '<span class="' . $cls . '" dir="' . $dir . '">' . td__diff_vis(td__diff_cpslice($c['s'], 300)) . '…</span>'
            . '<details class="td-diff__more"><summary class="td-diff__summary">' . Td::e(td__diff_fill($L['showFull'], ['n' => $n])) . '</summary>'
            . '<span class="' . $cls . ' td-diff__value--full" dir="' . $dir . '">' . td__diff_vis($c['s']) . '</span>' . $cut . '</details>';
    }

    function td__diff_table(array $rows, string $label, array $L): string
    {
        $th = static fn (string $t): string => '<th class="td-diff__th" role="columnheader" scope="col">' . Td::e($t) . '</th>';
        $html = '<div class="td-diff__scroll"><table class="td-diff__table" role="table" aria-label="' . Td::e($label) . '">'
            . '<thead class="td-diff__head" role="rowgroup"><tr role="row">' . $th($L['field']) . $th($L['before']) . $th($L['after']) . '</tr></thead>'
            . '<tbody role="rowgroup">';
        foreach ($rows as $r) {
            $field = '<span class="td-diff__label">' . td__diff_vis($r['label']) . '</span>';
            if ($r['kind'] !== 'unchanged') {
                $field .= ' <span class="td-diff__kind" data-kind="' . $r['kind'] . '">' . Td::e($L[$r['kind']]) . '</span>';
            }
            if ($r['uncertain']) {
                $field .= ' <span class="td-diff__uncertain">' . Td::e($L['uncertain']) . '</span>';
            }
            if ($r['masked']) {
                $field .= ' <span class="td-diff__badge">' . Td::e($L['maskedBadge']) . '</span>';
            }
            $html .= '<tr class="td-diff__row" role="row" data-kind="' . $r['kind'] . '" data-type="' . $r['type'] . '"' . ($r['masked'] ? ' data-masked=""' : '') . '>'
                . '<th class="td-diff__field" role="rowheader" scope="row">' . $field . '</th>'
                . '<td class="td-diff__cell td-diff__cell--before" role="cell"><span class="td-diff__side" aria-hidden="true">' . Td::e($L['before']) . '</span>'
                . td__diff_value($r['before'], $L) . '</td>'
                . '<td class="td-diff__cell td-diff__cell--after" role="cell"><span class="td-diff__arrow" aria-hidden="true">→</span>'
                . '<span class="td-diff__side" aria-hidden="true">' . Td::e($L['after']) . '</span>' . td__diff_value($r['after'], $L) . '</td></tr>';
        }
        return $html . '</tbody></table></div>';
    }

    function td__diff_pre(string $text, bool $cut, string $aria, array $L): string
    {
        return '<pre class="td-diff__pre" tabindex="0" aria-label="' . Td::e($aria) . '">' . td__diff_vis($text)
            . ($cut ? "\n" . '<span class="td-diff__cut">' . Td::e($L['truncated']) . '</span>' : '') . '</pre>';
    }

    /** @internal = diffMarkup(). */
    function td__diff_markup(array $m, array $L, ?string $label, string $unchanged, bool $json): string
    {
        $main = [];
        $same = [];
        foreach ($m['rows'] as $r) {
            if ($unchanged === 'show' || $r['kind'] !== 'unchanged') {
                $main[] = $r;
            } elseif ($unchanged === 'collapse') {
                $same[] = $r;
            }
        }
        $html = $main ? td__diff_table($main, $label ?? $L['table'], $L) : '<p class="td-diff__empty">' . Td::e($L['none']) . '</p>';
        $note = static fn (string $t): string => '<p class="td-diff__note">' . Td::e($t) . '</p>';
        if ($m['counts']['hidden'] > 0) {
            $html .= $note(td__diff_fill($L['more'], ['n' => $m['counts']['hidden']]));
        }
        foreach ($m['notes'] as $n) {
            $html .= $note($n === 'unsafe' ? $L['unsafeNote'] : $L[$n]);
        }
        if ($same) {
            $t = td__diff_fill($L['unchanged'], ['n' => count($same)]);
            $html .= '<details class="td-diff__unchanged"><summary class="td-diff__summary">' . Td::e($t) . '</summary>' . td__diff_table($same, $t, $L) . '</details>';
        }
        if ($json && $m['json'] !== null) {
            $j = $m['json'];
            $html .= '<details class="td-diff__json"><summary class="td-diff__summary">' . Td::e($L['json']) . '</summary>'
                . '<figure class="td-diff__figure"><figcaption class="td-diff__caption">' . Td::e($L['before']) . '</figcaption>'
                . td__diff_pre($j['before'], $j['beforeCut'], $L['jsonBefore'], $L) . '</figure>'
                . '<figure class="td-diff__figure"><figcaption class="td-diff__caption">' . Td::e($L['after']) . '</figcaption>'
                . td__diff_pre($j['after'], $j['afterCut'], $L['jsonAfter'], $L) . '</figure></details>';
        }
        return $html;
    }

    // --- v0.47.0 td_check_matrix (plan docs/internal/plans/v0.47.0-check-matrix.md QĐ 4–6, 10–13, 27–30) -------------

    /**
     * @internal Text rule of src/utils/check-matrix-model.js normalizeMatrixText() (byte parity): tab / CR / LF / FF /
     * VT → space, other C0 / C1 controls + DEL removed, runs of U+0020 collapsed, trimmed, cut to $max code points,
     * trimmed again. Invalid UTF-8 → null (the caller fails closed).
     */
    function td__check_matrix_text(string $s, int $max): ?string
    {
        $t = preg_replace('/[\x{0000}-\x{001F}\x{007F}-\x{009F}]/u', '', (string) preg_replace('/[\t\n\x0B\f\r]/', ' ', $s));
        if ($t === null) {
            return null;
        }
        $t = trim((string) preg_replace('/ {2,}/', ' ', $t), ' ');
        if (preg_match('/^.{0,' . $max . '}/su', $t, $m) === 1 && strlen($m[0]) < strlen($t)) {
            $t = rtrim($m[0], ' ');
        }
        return $t;
    }

    /** @internal A key (QĐ 4) as given → its string form, or null (int ≥ 0 up to 2^53 − 1, or the key regex). */
    function td__check_matrix_key(mixed $k): ?string
    {
        if (is_int($k)) {
            return $k >= 0 && $k <= 9007199254740991 ? (string) $k : null;
        }
        return is_string($k) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $k) === 1 ? $k : null;
    }

    /** @internal PHP 8.0 array_is_list(). */
    function td__check_matrix_list(array $a): bool
    {
        $i = 0;
        foreach ($a as $k => $_) {
            if ($k !== $i++) {
                return false;
            }
        }
        return true;
    }

    /**
     * @internal The ONE validation path of td_check_matrix — same rules, same order and same `reason` as validateMatrix()
     * in src/utils/check-matrix-model.js (parity table MATRIX_CASES). A structural error fails CLOSED as a whole.
     * @return array{ok: bool, reason: ?string, model: ?array}
     */
    function td__check_matrix_data(mixed $columns, mixed $rows, mixed $cells = null, mixed $value = null): array
    {
        $fail = static fn (string $r): array => ['ok' => false, 'reason' => $r, 'model' => null];
        // a row / column / group definition: a map (JSON object), never a non-empty list
        $isMap = static fn (mixed $d): bool => is_array($d) && ($d === [] || !td__check_matrix_list($d));
        $flag = static fn (mixed $v): ?bool => $v === null ? false : (is_bool($v) ? $v : null);
        $text = static fn (mixed $v, int $max): ?string => $v === null ? '' : (is_string($v) ? td__check_matrix_text($v, $max) : null);
        $header = static function (mixed $def, string $kind, array &$keys) use ($isMap, $flag, $text): array|string {
            if (!$isMap($def)) {
                return $kind === 'column' ? 'columns-shape' : 'rows-shape';
            }
            $key = td__check_matrix_key($def['key'] ?? null);
            if ($key === null) {
                return $kind . '-key';
            }
            if (isset($keys[$key])) {
                return 'duplicate-' . $kind;
            }
            $keys[$key] = true;
            $label = $text($def['label'] ?? null, 200);
            $desc = $kind === 'group' ? '' : $text($def['description'] ?? null, 300);
            if ($label === null || $desc === null) {
                return 'label';
            }
            $locked = $flag($def['locked'] ?? null);
            if ($locked === null) {
                return 'flag';
            }
            return ['key' => $key, 'label' => $label !== '' ? $label : $key, 'description' => $desc, 'locked' => $locked];
        };
        if (!is_array($columns) || $columns === [] || !td__check_matrix_list($columns)) {
            return $fail('columns-shape');
        }
        if (!is_array($rows) || $rows === [] || !td__check_matrix_list($rows)) {
            return $fail('rows-shape');
        }
        if (count($columns) > 32) {
            return $fail('too-many-columns');
        }
        $colKeys = [];
        $cols = [];
        foreach ($columns as $c) {
            $h = $header($c, 'column', $colKeys);
            if (is_string($h)) {
                return $fail($h);
            }
            $cols[] = $h;
        }
        $rowKeys = [];
        $groupKeys = [];
        $leaves = [];
        $groups = [];
        $segments = [];
        foreach ($rows as $def) {
            if ($isMap($def) && array_key_exists('rows', $def)) {
                if (!is_array($def['rows']) || !td__check_matrix_list($def['rows'])) {
                    return $fail('rows-shape');
                }
                $h = $header($def, 'group', $groupKeys);
                if (is_string($h)) {
                    return $fail($h);
                }
                $collapsed = $flag($def['collapsed'] ?? null);
                if ($collapsed === null) {
                    return $fail('flag');
                }
                $g = count($groups);
                if ($g >= 64) {
                    return $fail('too-many-groups');
                }
                $start = count($leaves);
                foreach ($def['rows'] as $child) {
                    if ($isMap($child) && array_key_exists('rows', $child)) {
                        return $fail('nested-group');
                    }
                    $r = $header($child, 'row', $rowKeys);
                    if (is_string($r)) {
                        return $fail($r);
                    }
                    $leaves[] = ['locked' => $r['locked'] || $h['locked'], 'group' => $g] + $r;
                    if (count($leaves) > 500) {
                        return $fail('too-many-rows');
                    }
                }
                $groups[] = ['key' => $h['key'], 'label' => $h['label'], 'collapsed' => $collapsed, 'locked' => $h['locked'],
                    'start' => $start, 'end' => count($leaves)];
                $segments[] = ['group' => $g, 'start' => $start, 'end' => count($leaves)];
            } else {
                $n = count($segments);
                if ($n > 0 && $segments[$n - 1]['group'] < 0) {
                    $segments[$n - 1]['end']++;
                } else {
                    $segments[] = ['group' => -1, 'start' => count($leaves), 'end' => count($leaves) + 1];
                }
                $r = $header($def, 'row', $rowKeys);
                if (is_string($r)) {
                    return $fail($r);
                }
                $leaves[] = ['group' => -1] + $r;
                if (count($leaves) > 500) {
                    return $fail('too-many-rows');
                }
            }
        }
        if ($leaves === []) {
            return $fail('rows-shape');
        }
        $R = count($leaves);
        $C = count($cols);
        if ($R * $C > 10000) {
            return $fail('too-many-cells');
        }
        $rowIndex = [];
        foreach ($leaves as $i => $r) {
            $rowIndex[$r['key']] = $i;
        }
        $colIndex = [];
        foreach ($cols as $j => $c) {
            $colIndex[$c['key']] = $j;
        }
        $lock = [];  // cell index => own lock
        $na = [];
        $notes = [];
        if ($cells !== null && $cells !== []) {
            if (!is_array($cells)) {
                return $fail('cells-shape');
            }
            foreach ($cells as $rk => $row) {
                $r = $rowIndex[(string) $rk] ?? null;
                if ($r === null) {
                    return $fail('cells-unknown-row');
                }
                if (!is_array($row)) {
                    return $fail('cells-shape');
                }
                foreach ($row as $ck => $cell) {
                    $c = $colIndex[(string) $ck] ?? null;
                    if ($c === null) {
                        return $fail('cells-unknown-column');
                    }
                    if (!is_array($cell)) {
                        return $fail('cells-shape');
                    }
                    $l = $flag($cell['locked'] ?? null);
                    $n = $flag($cell['na'] ?? null);
                    if ($l === null || $n === null) {
                        return $fail('cells-flag');
                    }
                    $note = $text($cell['note'] ?? null, 300);
                    if ($note === null) {
                        return $fail('cells-note');
                    }
                    $i = $r * $C + $c;
                    unset($lock[$i], $na[$i], $notes[$i]);
                    if ($l) {
                        $lock[$i] = true;
                    }
                    if ($n) {
                        $na[$i] = true;
                    }
                    if ($note !== '') {
                        $notes[$i] = $note;
                    }
                }
            }
        }
        $on = [];
        if ($value !== null && $value !== []) {
            if (!is_array($value)) {
                return $fail('value-shape');
            }
            foreach ($value as $ck => $list) {
                $c = $colIndex[(string) $ck] ?? null;
                if ($c === null) {
                    return $fail('value-unknown-column');
                }
                if (!is_array($list) || !td__check_matrix_list($list)) {
                    return $fail('value-shape');
                }
                foreach ($list as $item) {
                    $rk = td__check_matrix_key($item);
                    if ($rk === null) {
                        return $fail('value-shape');
                    }
                    $r = $rowIndex[$rk] ?? null;
                    if ($r === null) {
                        return $fail('value-unknown-row');
                    }
                    if (isset($na[$r * $C + $c])) {
                        return $fail('value-na');
                    }
                    $on[$r * $C + $c] = true;
                }
            }
        }
        return ['ok' => true, 'reason' => null, 'model' => ['columns' => $cols, 'rows' => $leaves, 'groups' => $groups,
            'segments' => $segments, 'lock' => $lock, 'na' => $na, 'notes' => $notes, 'on' => $on]];
    }

    /** @internal Cell $i of a validated model: 'na' | 'locked' | 'free'. */
    function td__check_matrix_cell(array $m, int $r, int $c): string
    {
        $i = $r * count($m['columns']) + $c;
        if (isset($m['na'][$i])) {
            return 'na';
        }
        return isset($m['lock'][$i]) || $m['rows'][$r]['locked'] || $m['columns'][$c]['locked'] ? 'locked' : 'free';
    }

    /**
     * @internal Canonical data of a validated model (= canonicalMatrix() in JS): printed in the host `data` attribute,
     * the ONE source of the hydrate gate and of form reset. Every keyed map is a JSON object (`(object)`): a column key
     * `0` must never turn a map into a list.
     */
    function td__check_matrix_canonical(array $m): array
    {
        $C = count($m['columns']);
        $head = static function (array $h): array {
            $o = ['key' => $h['key'], 'label' => $h['label']];
            if (($h['description'] ?? '') !== '') {
                $o['description'] = $h['description'];
            }
            return $o;
        };
        $columns = array_map(static fn (array $c): array => $head($c) + ($c['locked'] ? ['locked' => true] : []), $m['columns']);
        $rowOut = static function (int $r) use ($m, $head): array {
            $row = $m['rows'][$r];
            $gLocked = $row['group'] >= 0 && $m['groups'][$row['group']]['locked'];
            return $head($row) + ($row['locked'] && !$gLocked ? ['locked' => true] : []);
        };
        $rows = [];
        foreach ($m['segments'] as $s) {
            if ($s['group'] < 0) {
                for ($r = $s['start']; $r < $s['end']; $r++) {
                    $rows[] = $rowOut($r);
                }
                continue;
            }
            $g = $m['groups'][$s['group']];
            $o = ['key' => $g['key'], 'label' => $g['label']];
            if ($g['collapsed']) {
                $o['collapsed'] = true;
            }
            if ($g['locked']) {
                $o['locked'] = true;
            }
            $o['rows'] = [];
            for ($r = $s['start']; $r < $s['end']; $r++) {
                $o['rows'][] = $rowOut($r);
            }
            $rows[] = $o;
        }
        $cells = [];
        foreach ($m['rows'] as $r => $row) {
            foreach ($m['columns'] as $c => $col) {
                $i = $r * $C + $c;
                $cell = [];
                if (isset($m['lock'][$i])) {
                    $cell['locked'] = true;
                }
                if (isset($m['na'][$i])) {
                    $cell['na'] = true;
                }
                if (isset($m['notes'][$i])) {
                    $cell['note'] = $m['notes'][$i];
                }
                if ($cell !== []) {
                    $cells[$row['key']][$col['key']] = (object) $cell;
                }
            }
        }
        $value = [];
        foreach ($m['columns'] as $c => $col) {
            $list = [];
            foreach ($m['rows'] as $r => $row) {
                if (isset($m['on'][$r * $C + $c])) {
                    $list[] = $row['key'];
                }
            }
            $value[$col['key']] = $list;
        }
        return ['columns' => $columns, 'rows' => $rows,
            'cells' => (object) array_map(static fn (array $x): object => (object) $x, $cells), 'value' => (object) $value];
    }

    /**
     * Permission-style checkbox grid rows × columns (v0.47.0) — `<td-check-matrix data-td-ssr="check-matrix@1">` + the FULL
     * no-JS form (plan QĐ 27–30): one hidden marker `name[col]=""` per column first, a checkbox `name[col][]=row` per
     * applicable cell (a locked-ticked cell: disabled checkbox + a hidden input right after it), the sentinel
     * `name[_v]=1` last. PHP reads `['col' => ['row', …], 'empty-col' => '', '_v' => '1']`. The server MUST reject a post
     * without `_v` (max_input_vars cut it) and enforce locks itself.
     *
     *   echo td_check_matrix('perms', $roles, $perms, $current, ['label' => 'Quyền theo vai trò', 'cells' => $special]);
     *
     * $columns: [['key', 'label', 'description'?, 'locked'?], …] (≤ 32); $rows: rows or groups ['key', 'label',
     * 'collapsed'?, 'locked'?, 'rows' => [...]] (one level, ≤ 500 rows, ≤ 64 groups, ≤ 10 000 cells); $value:
     * ['col' => ['row', …]]. Keys: `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$` or int ≥ 0. $o: cells (['row' => ['col' =>
     * ['locked'?, 'na'?, 'note'?]]]), label, max_height (`none` | number + px/rem/em/vh/svh/dvh/lvh/%), layout
     * (auto|grid|column), disabled, id, class, attrs (host, allowlisted; `aria-label` names the grid without `label`),
     * labels (TdCheckMatrix.labels keys). Invalid data / name (empty or ending in `[]`) / a `data` JSON over 512 KiB of
     * UTF-8 (the JS limit) → the fail-closed state: NO
     * input at all (the server sees no key → keeps everything) + one E_USER_WARNING naming the reason only.
     */
    function td_check_matrix(string $name, array $columns, array $rows, array $value = [], array $o = []): string
    {
        $L = Td::CHECK_MATRIX_LABELS;
        if (is_array($o['labels'] ?? null)) {
            foreach ($o['labels'] as $k => $v) {
                if (isset($L[$k]) && is_string($v)) {
                    $L[$k] = $v;
                }
            }
        }
        $fill = static fn (string $tpl, array $vars): string => (string) preg_replace_callback('/\{(\w+)\}/',
            static fn (array $m): string => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $tpl);
        $h = td__str($o['id'] ?? null) ?? Td::uid('td-cm');
        $hid = Td::e($h);
        $label = isset($o['label']) && is_string($o['label']) ? $o['label'] : '';
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $aria = '';
        foreach ($extra as $k => $v) {
            if (strtolower((string) $k) === 'aria-label' && is_scalar($v) && !is_bool($v)) {
                $aria = (string) $v;
            }
        }
        $layout = in_array($o['layout'] ?? null, ['auto', 'grid', 'column'], true) ? $o['layout'] : null;
        $maxH = isset($o['max_height']) && is_string($o['max_height'])
            && preg_match('/^(none|\d{1,4}(\.\d{1,2})?(px|rem|em|vh|svh|dvh|lvh|%))$/D', $o['max_height']) === 1 ? $o['max_height'] : null;
        $disabled = !empty($o['disabled']);
        $res = $name === '' || str_ends_with($name, '[]') ? ['ok' => false, 'reason' => 'name', 'model' => null]
            : td__check_matrix_data($columns, $rows, $o['cells'] ?? null, $value);
        // review r1 #2: the `data` attribute obeys the JS limit — 512 KiB of UTF-8 (strlen of the JSON printed; the
        // attribute escaping is undone by the HTML parser, so the component measures this very string)
        $json = null;
        if ($res['ok']) {
            $json = json_encode(['v' => 1] + td__check_matrix_canonical($res['model']), Td::JSON_FLAGS | JSON_UNESCAPED_UNICODE);
            if (strlen($json) > 524288) {
                $res = ['ok' => false, 'reason' => 'data-size', 'model' => null];
                $json = null;
            }
        }
        $taken = [];
        $host = '<td-check-matrix' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_CHECK_MATRIX,
            'id' => $h,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'label' => $label !== '' ? $label : null,
            'layout' => $layout,
            'max-height' => $maxH,
            'disabled' => $disabled,
            'data' => $json,
        ], $taken);
        $taken = td__reserve(['id', 'class', 'name', 'label', 'layout', 'max-height', 'disabled', 'data', 'value'], $extra, $taken);
        $host .= Td::attrs($extra, $taken) . '>';
        $nameEl = $label !== '' ? '<p class="td-field__label" id="' . $hid . '-label">' . Td::e($label) . '</p>'
            : '<span class="td-sr-only" id="' . $hid . '-label">' . Td::e($aria !== '' ? $aria : $L['grid']) . '</span>';
        if (!$res['ok']) {
            trigger_error('td_check_matrix: invalid ' . ($res['reason'] === 'name' ? 'name (empty or ending in [])' : 'data (' . $res['reason'] . ')')
                . ' — nothing is submitted', E_USER_WARNING);
            return $host . '<div class="td-check-matrix" data-state="broken">' . $nameEl
                . '<p class="td-check-matrix__broken">' . Td::e($L['broken']) . '</p></div></td-check-matrix>';
        }
        $m = $res['model'];
        $C = count($m['columns']);
        $dis = $disabled ? ' disabled' : '';
        $mark = '<span class="td-check td-check--md td-check--drawn" aria-hidden="true"></span>';
        $lbl = static fn (string $key, array $vars): string => Td::e($fill($L[$key], $vars));
        $bulkInput = static fn (string $aria, string $desc, bool $roving = true): string => '<input type="checkbox" class="td-check-matrix__input"'
            . ($roving ? ' tabindex="-1"' : '') . ' aria-label="'
            . $aria . '"' . ($desc !== '' ? ' aria-describedby="' . $desc . '"' : '') . ' disabled>' . $mark;
        $bulk = static fn (string $kind, string $aria, string $desc, string $more = ''): string => '<td class="td-check-matrix__bulk" data-kind="'
            . $kind . '"' . $more . ' tabindex="-1">' . $bulkInput($aria, $desc) . '</td>';

        $out = '';
        foreach ($m['columns'] as $col) {
            $out .= '<input type="hidden" name="' . Td::e($name . '[' . $col['key'] . ']') . '" value=""' . $dis . '>';
        }
        $out .= '<div class="td-check-matrix" data-state="ready" data-layout="' . ($layout ?? 'auto') . '">' . $nameEl
            . '<div class="td-check-matrix__bar"><label class="td-check-matrix__colpick-label" for="' . $hid . '-colpick">' . Td::e($L['columnPick'])
            . '</label><select class="td-check-matrix__colpick" id="' . $hid . '-colpick" disabled>';
        foreach ($m['columns'] as $j => $col) {
            $out .= '<option value="' . $j . '">' . Td::e($col['label']) . '</option>';
        }
        $out .= '</select><span class="td-check-matrix__bulk" data-kind="column-active">' . $bulkInput($lbl('column', ['col' => $m['columns'][0]['label']]), '', false)
            . '</span></div>';
        $out .= '<div class="td-check-matrix__scroll"><table class="td-check-matrix__grid" role="grid" aria-labelledby="' . $hid . '-label"><thead>'
            . '<tr class="td-check-matrix__head"><td class="td-check-matrix__corner" tabindex="-1"></td>'
            . '<th scope="col" class="td-check-matrix__rowtitle" tabindex="-1">' . Td::e($L['rows']) . '</th>';
        foreach ($m['columns'] as $j => $col) {
            $out .= '<th scope="col" class="td-check-matrix__colhead" id="' . $hid . '-c' . $j . '" data-c="' . $j . '" tabindex="-1">'
                . '<span class="td-check-matrix__label">' . Td::e($col['label']) . '</span>'
                . ($col['description'] !== '' ? '<span class="td-check-matrix__desc" id="' . $hid . '-c' . $j . 'd" aria-hidden="true">' . Td::e($col['description']) . '</span>' : '')
                . '</th>';
        }
        $out .= '</tr><tr class="td-check-matrix__bulkrow">' . $bulk('all', $lbl('all', []), '')
            . '<td class="td-check-matrix__gap" tabindex="-1"></td>';
        foreach ($m['columns'] as $j => $col) {
            $out .= $bulk('column', $lbl('column', ['col' => $col['label']]), $col['description'] !== '' ? $hid . '-c' . $j . 'd' : '', ' data-c="' . $j . '"');
        }
        $out .= '</tr></thead>';
        $note = 0;
        $row = static function (int $r) use ($m, $C, $hid, $name, $dis, $mark, $lbl, $bulk, $L, &$note): string {
            $rw = $m['rows'][$r];
            $s = '<tr class="td-check-matrix__row" data-r="' . $r . '">'
                . $bulk('row', $lbl('row', ['row' => $rw['label']]), $rw['description'] !== '' ? $hid . '-r' . $r . 'd' : '')
                . '<th scope="row" class="td-check-matrix__rowhead" id="' . $hid . '-r' . $r . '" tabindex="-1"><span class="td-check-matrix__label">'
                . Td::e($rw['label']) . '</span>'
                . ($rw['description'] !== '' ? '<span class="td-check-matrix__desc" id="' . $hid . '-r' . $r . 'd" aria-hidden="true">' . Td::e($rw['description']) . '</span>' : '')
                . '</th>';
            for ($c = 0; $c < $C; $c++) {
                $i = $r * $C + $c;
                $text = $m['notes'][$i] ?? null;
                $nid = $text !== null ? $hid . '-n' . ($note++) : '';
                $noteEl = $text !== null ? '<span class="td-sr-only" id="' . $nid . '">' . Td::e($text) . '</span>' : '';
                $noteAttr = $text !== null ? ' data-note' : '';
                $kind = td__check_matrix_cell($m, $r, $c);
                if ($kind === 'na') {
                    $s .= '<td class="td-check-matrix__cell" data-c="' . $c . '" data-na' . $noteAttr . ' tabindex="-1">'
                        . '<span class="td-check-matrix__na" aria-hidden="true">–</span><span class="td-sr-only">' . Td::e($L['na']) . '</span>' . $noteEl . '</td>';
                    continue;
                }
                $locked = $kind === 'locked';
                $on = isset($m['on'][$i]);
                $field = Td::e($name . '[' . $m['columns'][$c]['key'] . '][]');
                $s .= '<td class="td-check-matrix__cell" data-c="' . $c . '"' . ($locked ? ' data-locked' : '') . $noteAttr . ' tabindex="-1">'
                    . '<input type="checkbox" class="td-check-matrix__input" tabindex="-1" aria-labelledby="' . $hid . '-r' . $r . ' ' . $hid . '-c' . $c . '"'
                    . ($nid !== '' ? ' aria-describedby="' . $nid . '"' : '')
                    . (!$locked ? ' name="' . $field . '" value="' . Td::e($rw['key']) . '"' : '')
                    . ($on ? ' checked' : '') . ($locked ? ' disabled' : $dis) . '>'
                    . ($locked && $on ? '<input type="hidden" name="' . $field . '" value="' . Td::e($rw['key']) . '"' . $dis . '>' : '')
                    . $mark . $noteEl . '</td>';
            }
            return $s . '</tr>';
        };
        foreach ($m['segments'] as $seg) {
            if ($seg['group'] < 0) {
                $out .= '<tbody class="td-check-matrix__body">';
                for ($r = $seg['start']; $r < $seg['end']; $r++) {
                    $out .= $row($r);
                }
                $out .= '</tbody>';
                continue;
            }
            $g = $seg['group'];
            $grp = $m['groups'][$g];
            $shut = $grp['collapsed'];
            $out .= '<tbody class="td-check-matrix__group" id="' . $hid . '-g' . $g . '" data-g="' . $g . '"' . ($shut ? ' data-collapsed' : '') . '>'
                . '<tr class="td-check-matrix__grouprow">' . $bulk('group', $lbl('group', ['group' => $grp['label']]), '')
                . '<th scope="row" class="td-check-matrix__grouphead"><button type="button" class="td-check-matrix__group-toggle" tabindex="-1" aria-expanded="'
                . ($shut ? 'false' : 'true') . '" aria-controls="' . $hid . '-g' . $g . '" disabled>'
                . '<span class="td-check-matrix__chevron" data-td-icon="next" data-td-icon-size="s" aria-hidden="true">' . Td::icon('next', 's') . '</span>'
                . '<span class="td-check-matrix__label">' . Td::e($grp['label']) . '</span> <span class="td-check-matrix__count">(' . ($grp['end'] - $grp['start'])
                . ')</span></button></th>';
            foreach ($m['columns'] as $j => $col) {
                $out .= $bulk('group-column', $lbl('groupColumn', ['group' => $grp['label'], 'col' => $col['label']]), '', ' data-c="' . $j . '"');
            }
            $out .= '</tr>';
            for ($r = $seg['start']; $r < $seg['end']; $r++) {
                $out .= $row($r);
            }
            $out .= '</tbody>';
        }
        $out .= '</table></div><p class="td-check-matrix__note" aria-hidden="true"></p><p class="td-sr-only" role="status"></p></div>'
            . '<input type="hidden" name="' . Td::e($name . '[_v]') . '" value="1"' . $dis . '>';
        return $host . $out . '</td-check-matrix>';
    }

    /**
     * v0.48.0 (plan v0.48.0-color-picker QĐ 1, 19b): THE server normalisation of a colour setting — call it on every POSTed
     * value BEFORE validating / storing. `#rgb` / `#rrggbb` (the `#` optional, case-insensitive, surrounding white space
     * ignored) → `#rrggbb` lowercase; `''` / null / white space → `''` (no colour); anything else (another type, longer
     * than 64, rgb(), names, alpha) → null — answer 422. Contract: the stored value is the RESULT of this function, which
     * matches `^#[0-9a-f]{6}$` or is empty.
     *
     *   $v = td_color_value($request->input('brand_color'));
     *   if ($v === null) abort(422);
     */
    function td_color_value(mixed $v): ?string
    {
        if ($v === null) {
            return '';
        }
        if (!is_string($v) || strlen($v) > 64) {
            return null;
        }
        $s = trim($v, " \t\n\r\f\v");
        if ($s === '') {
            return '';
        }
        if (preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/D', $s, $m) !== 1) {
            return null;
        }
        $h = strtolower($m[1]);
        if (strlen($h) === 3) {
            $h = $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
        }
        return '#' . $h;
    }

    /**
     * v0.48.0 (plan v0.48.0-color-picker QĐ 19): a colour field. NATIVE by default (works without JS): `div.td-color` >
     * [label] + `div.td-color__box` > grey swatch + `input.td-color__input[type=text]` with name / value / `pattern`
     * `#[0-9a-fA-F]{6}` (only #RRGGBB without JS — never type=color, which cannot be empty). ELEMENT mode (`element => true`
     * or Td::configure ssr_elements) wraps the same field in `<td-color-picker data-td-ssr="color-picker@1">`, adopted IN
     * PLACE by `@dazzxq/td-components/color-picker`. `value` / `presets` go through td_color_value(): an unparsable value
     * is kept as is (escaped; the element reports badInput) + one E_USER_WARNING, a bad preset is dropped + one warning.
     * Options: label, aria_label, value, presets (list or a string of codes), required, disabled, readonly, custom
     * (false = presets only), contrast, eyedropper (false = no button), placeholder, error, attrs (the input: allowlisted;
     * owned names + data-td-* reserved), class (wrapper / host), id (the INPUT id; element mode: host = {id}-host),
     * element. ALWAYS normalise the POSTed value with td_color_value().
     */
    function td_color_picker(string $name, array $o = []): string
    {
        $element = td__element($o);
        $callerId = td__str($o['id'] ?? null);
        $hostId = $element ? ($callerId !== null ? $callerId . '-host' : td__host_uid($name)) : null;
        $cid = $callerId ?? ($element ? $hostId . '-input' : td__host_uid($name) . '-input');
        $label = isset($o['label']) && is_scalar($o['label']) && !is_bool($o['label']) && (string) $o['label'] !== '' ? (string) $o['label'] : null;
        $aria = isset($o['aria_label']) && is_scalar($o['aria_label']) && !is_bool($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null;
        $placeholder = td__str($o['placeholder'] ?? null);
        $error = td__str($o['error'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $readonly = !empty($o['readonly']);
        $nameAttr = $name !== '' ? $name : null;
        $value = '';
        if (array_key_exists('value', $o) && $o['value'] !== null && $o['value'] !== '') {
            $norm = td_color_value($o['value']);
            if ($norm !== null) {
                $value = $norm;
            } elseif (is_string($o['value']) && strlen($o['value']) <= Td::COLOR_MAX_INPUT) {
                // a short unparsable value is kept (escaped): the element reports badInput, no server data is lost
                trigger_error('td_color_picker: value is not a #rgb / #rrggbb colour; printed as is (the element reports it)', E_USER_WARNING);
                $value = $o['value'];
            } else {
                // SEC-01: never reflect an oversized / non-string value — omitted (the field shows empty)
                trigger_error('td_color_picker: value is not a #rgb / #rrggbb colour and too long to print; omitted', E_USER_WARNING);
            }
        }
        $presets = null;
        if (array_key_exists('presets', $o) && $o['presets'] !== null) {
            // SEC-01 bounded work (= src/utils/color-picker-model.js parsePresets): a string over COLOR_PRESET_STRING
            // bytes is rejected before the split; at most COLOR_PRESET_CANDIDATES entries are ever inspected
            $presets = [];
            $bad = 0;
            $capped = false;
            $list = [];
            if (is_string($o['presets'])) {
                if (strlen($o['presets']) > Td::COLOR_PRESET_STRING) {
                    $capped = true;
                } else {
                    $list = preg_split('/[\s,]+/', $o['presets'], Td::COLOR_PRESET_CANDIDATES + 2, PREG_SPLIT_NO_EMPTY) ?: [];
                }
            } elseif (is_array($o['presets'])) {
                $list = $o['presets'];
            } else {
                $bad = 1;
            }
            $seen = 0;
            foreach ($list as $p) {
                if ($seen >= Td::COLOR_PRESET_CANDIDATES) {
                    $capped = true;
                    break;
                }
                $seen++;
                $h = is_string($p) ? td_color_value($p) : null;
                if ($h === null || $h === '') {
                    $bad++;
                } elseif (!in_array($h, $presets, true) && count($presets) < 48) {
                    $presets[] = $h;
                }
            }
            if ($bad > 0 || $capped) {
                trigger_error('td_color_picker: some presets were dropped (not a #rgb / #rrggbb colour, or over the input limit)', E_USER_WARNING);
            }
        }
        $flag = static fn (string $k): bool => array_key_exists($k, $o) && $o[$k] !== null && !$o[$k];
        $errId = ($element ? $hostId : $cid) . '-error';
        $taken = [];
        $input = '<input' . Td::ownAttrs([
            'type' => 'text',
            'class' => 'td-color__input',
            'id' => $cid,
            'inputmode' => 'text',
            'autocomplete' => 'off',
            'autocapitalize' => 'none',
            'autocorrect' => 'off',
            'spellcheck' => 'false',
            'maxlength' => '64',
            'placeholder' => $placeholder ?? Td::COLOR_LABELS['placeholder'],
            'name' => $nameAttr,
            'value' => $value !== '' ? $value : null,
            'pattern' => Td::COLOR_PATTERN,
            'title' => Td::COLOR_LABELS['hint'],
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'autofocus' => !empty($o['autofocus']),
            'aria-label' => $label === null ? ($aria ?? Td::COLOR_LABELS['input']) : null,
            'aria-invalid' => $error !== null ? 'true' : null,
            'aria-errormessage' => $error !== null ? $errId : null,
            'aria-describedby' => $error !== null ? $errId : null,
        ], $taken);
        $extra = is_array($o['attrs'] ?? null) ? $o['attrs'] : [];
        $taken = td__reserve(['type', 'class', 'id', 'inputmode', 'autocomplete', 'autocapitalize', 'autocorrect', 'spellcheck',
            'maxlength', 'minlength', 'placeholder', 'name', 'value', 'pattern', 'title', 'required', 'disabled', 'readonly',
            'autofocus', 'aria-label', 'aria-labelledby', 'aria-invalid', 'aria-errormessage', 'aria-describedby'], $extra, $taken);
        $input .= Td::attrs($extra, $taken) . '>';
        $labelHtml = $label !== null ? '<label class="td-color__label" for="' . Td::e($cid) . '">' . Td::e($label) . '</label>' : '';
        $note = $error !== null
            ? '<span class="td-field-error" id="' . Td::e($errId) . '" data-for="' . Td::e($element ? $hostId : $cid) . '">' . Td::e($error) . '</span>'
            : '';
        $box = '<div class="td-color__box"><span class="td-color__swatch" aria-hidden="true"></span>' . $input . '</div>';
        if (!$element) {
            return '<div class="td-color' . Td::e(Td::classTokens($o['class'] ?? null)) . '">' . $labelHtml . $box . $note . '</div>';
        }
        $hostTaken = [];
        return '<td-color-picker' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_COLOR,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $nameAttr,
            'value' => $value !== '' ? $value : null,
            'label' => $label,
            'placeholder' => $placeholder,
            'presets' => $presets !== null ? implode(' ', $presets) : null,
            'custom' => $flag('custom') ? 'false' : null,
            'contrast' => !empty($o['contrast']),
            'eyedropper' => $flag('eyedropper') ? 'false' : null,
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'error-text' => $error,
            'aria-label' => $aria,
        ], $hostTaken) . '><div class="td-color">' . $labelHtml . $box . '</div>' . $note . '</td-color-picker>';
    }

    /**
     * v0.49.0 choice group (contract choice-group@1, plan v0.49.0-choice-stepper QĐ 22, ADR 0022) — ALWAYS the element
     * `<td-choice-group data-td-ssr="choice-group@1">` + the exact tree <td-choice-group> renders, with NATIVE radios that
     * carry the real `name` (+ `required` on every radio, `checked` on the selected one): the form submits `name=value`,
     * arrows / Space / Tab work, no JS. `@dazzxq/td-components/choice-group` adopts it IN PLACE (same radio nodes: checked +
     * focus kept; the radios move to a private group without a form owner and the HOST submits).
     * $options: list of ['value' => string|int, 'label' => string, 'hint'?, 'swatch'? (colour → SVG `fill` through
     * Td::safeColor()), 'image'? (td__media_url(): https: / scheme-less; http: only with Td::allowHttpLinks(true)),
     * 'disabled'? (combination that does not exist), 'unavailable'? (selectable, struck through + note), 'unavailable_label'?].
     * Bounded by Td::CHOICE_LIMITS (= the JS CHOICE_LIMITS): at most 400 entries read, 100 options printed; label / hint cut
     * to 200 code points, note to 100; value over 200, swatch over 128, image over 8192 refused. A wrong option (not an
     * array, value not canonical — td__choice_value: valid UTF-8, no control characters, 1–200 code points — label not a
     * non-empty string, duplicate value) is dropped; a wrong / refused / cut field is ignored (the option stays). At most
     * ONE E_USER_WARNING per call with the counts only ("{n} option(s) dropped, {m} field(s) ignored or shortened" + a note
     * when $value is not one of the options) — never a value. $value: the selected option (absent → nothing checked).
     * Options: label, variant ('button' | 'swatch'), required, disabled, helper_text, error_text, id (the HOST id), aria_label,
     * class.
     */
    function td_choice_group(string $name, array $options, string|int|null $value = null, array $o = []): string
    {
        $L = Td::CHOICE_LIMITS;
        $list = [];
        $seen = [];
        $dropped = 0;
        $ignored = 0;
        // review S1: bounded — at most `candidates` entries are read, at most `options` accepted
        $n = 0;
        foreach ($options as $opt) {
            if ($n === $L['candidates'] || count($list) === $L['options']) {
                break;
            }
            $n++;
            if (!is_array($opt)) {
                $dropped++;
                continue;
            }
            $v = td__choice_value($opt['value'] ?? null);
            $label = $opt['label'] ?? null;
            if ($v === null || !is_string($label) || isset($seen[$v])) {
                $dropped++;
                continue;
            }
            $short = td__choice_text($label, $L['label']);
            if ($short === null || trim($short) === '') {
                $dropped++;
                continue;
            }
            if ($short !== $label) {
                $ignored++;
            }
            $seen[$v] = true;
            $text = static function (string $k, int $cap) use ($opt, &$ignored): string {
                $t = $opt[$k] ?? null;
                if ($t === null || $t === '') {
                    return '';
                }
                $cut = is_string($t) ? td__choice_text($t, $cap) : null;
                if ($cut !== $t) {
                    $ignored++;
                }
                return $cut ?? '';
            };
            $gated = static function (mixed $t, int $cap, callable $gate) use (&$ignored): string {
                if ($t === null || $t === '') {
                    return '';
                }
                $out = is_string($t) && !td__choice_over($t, $cap) ? (string) ($gate($t) ?? '') : '';
                if ($out === '') {
                    $ignored++;
                }
                return $out;
            };
            $list[] = [
                'value' => $v, 'label' => $short, 'hint' => $text('hint', $L['hint']),
                'swatch' => $gated($opt['swatch'] ?? null, $L['swatch'], static fn (string $c): string => Td::safeColor($c)),
                'image' => $gated($opt['image'] ?? null, $L['image'], static fn (string $u): ?string => td__media_url($u)),
                'disabled' => ($opt['disabled'] ?? false) === true, 'unavailable' => ($opt['unavailable'] ?? false) === true,
                'note' => $text('unavailable_label', $L['note']),
            ];
        }
        $dropped += count($options) - $n;
        $variant = ($o['variant'] ?? null) === 'swatch' ? 'swatch' : 'button';
        $swatchMode = $variant === 'swatch';
        $sel = $value === null ? '' : (string) $value;
        $current = null;
        foreach ($list as $it) {
            if ($it['value'] === $sel) {
                $current = $it;
            }
        }
        $missing = $sel !== '' && $current === null;
        if ($missing) {
            $sel = '';
        }
        if ($dropped || $ignored || $missing) { // review S1: ONE aggregate warning, counts only — never a value
            trigger_error("td_choice_group: $dropped option(s) dropped, $ignored field(s) ignored or shortened (invalid, duplicate or over the limits: {$L['candidates']} inspected, {$L['options']} options)"
                . ($missing ? '; the selected value is not one of the options — nothing selected' : ''), E_USER_WARNING);
        }
        $host = td__str($o['id'] ?? null) ?? td__host_uid($name);
        $h = Td::e($host);
        $label = td__str($o['label'] ?? null);
        $aria = td__str($o['aria_label'] ?? null);
        $hint = td__str($o['helper_text'] ?? null);
        $error = td__str($o['error_text'] ?? null);
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $enabled = false;
        foreach ($list as $it) {
            $enabled = $enabled || !$it['disabled'];
        }
        $L = Td::CHOICE_LABELS;
        $noteOf = static fn (array $it): string => $it['note'] !== '' ? $it['note'] : $L['unavailable'];
        // a nameless group still needs ONE name for the native keyboard group — private + no form owner (never submitted)
        $radioName = $name !== '' ? $name : $host . '-group';
        $html = '<div class="td-field td-choice td-choice--' . $variant . '">';
        if ($label !== null) {
            $html .= '<div class="td-field__label td-choice__label" id="' . $h . '-label">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '')
                . ($swatchMode ? '<span class="td-choice__current" aria-hidden="true">'
                    . ($current !== null ? Td::e(': ' . $current['label'] . ($current['unavailable'] ? ' — ' . $noteOf($current) : '')) : '')
                    . '</span>' : '')
                . '</div>';
        }
        $desc = trim(($hint !== null ? "$host-note " : '') . ($error !== null ? "$host-error" : ''));
        $taken = [];
        $html .= '<div' . Td::ownAttrs([
            'class' => 'td-choice__options',
            'role' => 'radiogroup',
            'aria-labelledby' => $label !== null ? "$host-label" : null,
            'aria-label' => $label === null ? $aria : null,
            'aria-required' => $required && $enabled ? 'true' : null,
            'aria-invalid' => $error !== null ? 'true' : null,
            'aria-errormessage' => $error !== null ? "$host-error" : null,
            'aria-describedby' => $desc !== '' ? $desc : null,
        ], $taken) . '>';
        foreach ($list as $n => $it) {
            $oid = "$host-o$n";
            $e = Td::e($oid);
            $d = trim(($it['hint'] !== '' ? "$oid-h " : '') . ($it['unavailable'] ? "$oid-n" : ''));
            $sr = $swatchMode ? ' td-sr-only' : '';
            $visual = '';
            if ($it['image'] !== '') {
                $visual = '<img class="td-choice__image" src="' . Td::e($it['image']) . '" alt="" width="32" height="32" loading="lazy" decoding="async">';
            } elseif ($it['swatch'] !== '' || $swatchMode) {
                $visual = '<svg class="td-choice__swatch' . ($it['swatch'] !== '' ? '' : ' td-choice__swatch--none') . '" viewBox="0 0 32 32" aria-hidden="true">'
                    . '<circle cx="16" cy="16" r="16"' . ($it['swatch'] !== '' ? ' fill="' . Td::e($it['swatch']) . '"' : '') . '></circle></svg>';
            }
            $texts = '<span class="td-choice__text' . $sr . '" id="' . $e . '-l">' . Td::e($it['label']) . '</span>'
                . ($it['hint'] !== '' ? '<span class="td-choice__hint' . $sr . '" id="' . $e . '-h">' . Td::e($it['hint']) . '</span>' : '')
                . ($it['unavailable'] ? '<span class="td-choice__note' . $sr . '" id="' . $e . '-n"' . ($it['note'] !== '' ? ' data-td-custom' : '')
                    . '>' . Td::e($noteOf($it)) . '</span>' : '');
            $rt = [];
            $html .= '<label class="td-choice__option" data-td-value="' . Td::e($it['value']) . '"'
                . ($it['unavailable'] ? ' data-unavailable' : '') . ($it['disabled'] ? ' data-disabled' : '') . '>'
                . '<input' . Td::ownAttrs([
                    'type' => 'radio',
                    'class' => 'td-choice__input',
                    'id' => $oid,
                    'value' => $it['value'],
                    'name' => $radioName,
                    'form' => $name === '' ? '' : null,
                    'aria-labelledby' => "$oid-l",
                    'aria-describedby' => $d !== '' ? $d : null,
                    'checked' => $it['value'] === $sel,
                    'required' => $required,
                    'disabled' => $disabled || $it['disabled'],
                ], $rt) . '>'
                . '<span class="td-choice__face">' . $visual . ($swatchMode ? $texts : '<span class="td-choice__body">' . $texts . '</span>') . '</span>'
                . '</label>';
        }
        $html .= '</div>';
        $footer = $error !== null ? '<span class="td-field-error" id="' . $h . '-error" data-for="' . $h . '">' . Td::e($error) . '</span>' : '';
        $footer .= '<div class="td-field__note" id="' . $h . '-note"' . ($hint === null ? ' hidden' : '') . '>' . Td::e($hint ?? '') . '</div>';
        $html .= '<div class="td-field__footer"' . ($hint === null && $error === null ? ' hidden' : '') . '>' . $footer . '</div></div>';
        $ht = [];
        return '<td-choice-group' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_CHOICE,
            'id' => $host,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'value' => $sel !== '' ? $sel : null,
            'label' => $label,
            'variant' => $swatchMode ? 'swatch' : null,
            'required' => $required,
            'disabled' => $disabled,
            'helper-text' => $hint,
            'error-text' => $error,
            'aria-label' => $aria,
        ], $ht) . '>' . $html . '</td-choice-group>';
    }

    /** @internal v0.49.0 review S1: is $s longer than $n code points? (byte length answers first; bounded) */
    function td__choice_over(string $s, int $n): bool
    {
        if (strlen($s) <= $n) {
            return false;
        }
        if (strlen($s) > 4 * $n) {
            return true;
        }
        return (int) preg_match_all('/./su', $s) > $n;
    }

    /**
     * @internal v0.49.0 review S1: the first $n code points of a text field (cut BEFORE any trim / regex on the whole
     * string); null when the kept part is not valid UTF-8.
     */
    function td__choice_text(string $s, int $n): ?string
    {
        if (strlen($s) <= $n) {
            return preg_match('//u', $s) ? $s : null;
        }
        $head = substr($s, 0, 4 * $n);
        for ($k = 0; $k < 3 && !preg_match('//u', $head); $k++) {
            $head = substr($head, 0, -1); // a code point cut at the byte limit
        }
        if (!preg_match('//u', $head)) {
            return null;
        }
        return preg_match('/^.{0,' . $n . '}/su', $head, $m) === 1 ? $m[0] : null;
    }

    /**
     * @internal v0.49.0 review S2 — the canonical option value (= src/utils/choice-options.js canonicalValue, shared cases
     * test/ssr/choice-value.cases.json): int / finite float → its JS String(); a string must be valid UTF-8, 1–200 code
     * points, without C0 / DEL / C1 controls (\r \n \t refused — values are identifiers); never trimmed. Else null.
     */
    function td__choice_value(mixed $v): ?string
    {
        if (is_int($v)) {
            return (string) $v;
        }
        if (is_float($v)) {
            return is_finite($v) ? td__js_number($v) : null;
        }
        if (!is_string($v) || $v === '' || td__choice_over($v, Td::CHOICE_LIMITS['value']) || !preg_match('//u', $v)
            || preg_match('/[\x{0}-\x{1F}\x{7F}-\x{9F}]/u', $v)) {
            return null;
        }
        return $v;
    }
}
