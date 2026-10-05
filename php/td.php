<?php
/**
 * td-components — official PHP SSR adapter (plan v0.17.0 E5). PHP >= 8.0 (CI job `php80`), no framework, no composer
 * dependency.
 * Docs: docs/guides/php-adapter.md.
 *
 *   require_once '/path/to/vendor/td-components/0.43.0/php/td.php';
 *   TdComponents\Td::configure('/assets/vendor/td-components/0.43.0', __DIR__ . '/public/assets/vendor/td-components/0.43.0');
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
            'count' => '{count} {kind}',
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

        /**
         * @param string $baseUrl URL of the VERSIONED vendor directory (e.g. '/assets/vendor/td-components/0.43.0') —
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
        $box = '<div class="td-number__box">'
            . ($prefix !== null ? '<span class="td-number__affix td-number__affix--prefix" aria-hidden="true">' . Td::e($prefix) . '</span>' : '')
            . $control
            . ($suffix !== null ? '<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">' . Td::e($suffix) . '</span>' : '')
            . ($unit !== null ? '<span id="' . $b . '-unit" hidden>' . Td::e($unit) . '</span>' : '')
            . '</div>';
        $footer = $error !== null ? '<span class="td-field-error" id="' . $b . '-error" data-for="' . $b . '">' . Td::e($error) . '</span>' : '';
        $footer .= '<div class="td-field__note" id="' . $b . '-note"' . ($hint === null ? ' hidden' : '') . '>' . Td::e($hint ?? '') . '</div>';
        $inner = '<div class="td-field td-field--' . $size . ' td-number' . ($element ? '' : Td::e(Td::classTokens($o['class'] ?? null))) . '">'
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
        if (!is_string($v)) {
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
            $json = json_encode($rows, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if (td__utf16_length($json) > 262144) {
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
        $countText = $overflow ? $f($L['over'], ['count' => $count, 'max' => $limit, 'kind' => $kindWord]) : ($max !== null
            ? $f($count === $max ? $L['full'] : $L['countMax'], ['count' => $count, 'max' => $max, 'kind' => $kindWord])
            : $f($L['count'], ['count' => $count, 'kind' => $kindWord]));
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
            if (!is_string($id) || $id === '' || td__utf16_length($id) > 512) {
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
                'name' => isset($x['name']) && is_string($x['name']) ? $x['name'] : '',
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
}
