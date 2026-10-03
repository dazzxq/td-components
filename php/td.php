<?php
/**
 * td-components — official PHP SSR adapter (plan v0.17.0 E5). PHP >= 8.0 (CI job `php80`), no framework, no composer
 * dependency.
 * Docs: docs/guides/php-adapter.md.
 *
 *   require_once '/path/to/vendor/td-components/0.26.1/php/td.php';
 *   TdComponents\Td::configure('/assets/vendor/td-components/0.26.1', __DIR__ . '/public/assets/vendor/td-components/0.26.1');
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
 *     `@dazzxq/td-components/dropdown` is imported (the ONLY helper that upgrades). v0.26.0 element mode: the same
 *     markup + `data-td-ssr="dropdown@1"` + `select.td-dropdown__native` styled to the trigger box (no layout shift).
 *   - v0.26.0 td_empty prints `<td-empty-state data-td-ssr="empty-state@1">` + the full styled tree (always element),
 *     hydrated in place by `@dazzxq/td-components/empty-state`.
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

        /**
         * @param string $baseUrl URL of the VERSIONED vendor directory (e.g. '/assets/vendor/td-components/0.26.1') —
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
     * v0.27.0 one-time code field (6 digits, contract otp-input@1). Default: a NATIVE field that works without JS —
     * `div.td-otp` > [label] + `div.td-otp__box` > `input.td-otp__input` (type text, inputmode numeric, autocomplete
     * one-time-code, maxlength 6, pattern [0-9]{6}, name / value / required…) [+ the error note]. `element` (bool, default
     * Td::configure ssr_elements = false): `<td-otp-input data-td-ssr="otp-input@1">` host + the same field + the 6
     * decorative cells, adopted IN PLACE by `@dazzxq/td-components/otp-input` (no flash). $name: form field name.
     * Options: label, value (digits kept: full-width / Arabic-Indic digits → ASCII, other characters dropped, max 6),
     * required, disabled, readonly, autofocus, error (text), aria_label (when there is no label; default "Mã xác thực"),
     * id (the INPUT id — `<label for>`; element mode: host = {id}-host), class (wrapper / host), attrs (the input:
     * allowlisted; owned names and data-td-* reserved). Never submits the form by itself (no JS in this markup).
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
        $value = isset($o['value']) && is_scalar($o['value']) ? td__otp_digits((string) $o['value']) : '';
        $required = !empty($o['required']);
        $disabled = !empty($o['disabled']);
        $readonly = !empty($o['readonly']);
        $errId = ($element ? $hostId : $cid) . '-error';
        $taken = [];
        $input = '<input' . Td::ownAttrs([
            'type' => 'text',
            'class' => 'td-otp__input',
            'id' => $cid,
            'inputmode' => 'numeric',
            'autocomplete' => 'one-time-code',
            'name' => $name !== '' ? $name : null,
            'maxlength' => '6',
            'pattern' => '[0-9]{6}',
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
        $taken = td__reserve(['type', 'class', 'id', 'inputmode', 'autocomplete', 'name', 'maxlength', 'minlength', 'pattern',
            'value', 'required', 'disabled', 'readonly', 'autofocus', 'aria-label', 'aria-labelledby', 'aria-invalid',
            'aria-errormessage', 'aria-describedby'], $extra, $taken);
        $input .= Td::attrs($extra, $taken) . '>';
        $labelHtml = $label !== null ? '<label class="td-otp__label" for="' . Td::e($cid) . '">' . Td::e($label) . '</label>' : '';
        $note = $error !== null
            ? '<span class="td-field-error" id="' . Td::e($errId) . '" data-for="' . Td::e($element ? $hostId : $cid) . '">' . Td::e($error) . '</span>'
            : '';
        if (!$element) {
            return '<div class="td-otp' . Td::e(Td::classTokens($o['class'] ?? null)) . '">' . $labelHtml
                . '<div class="td-otp__box">' . $input . '</div>' . $note . '</div>';
        }
        $cells = '<span class="td-otp__cells" aria-hidden="true">' . str_repeat('<span class="td-otp__cell"></span>', 6) . '</span>';
        $hostTaken = [];
        return '<td-otp-input' . Td::ownAttrs([
            'data-td-ssr' => Td::SSR_OTP,
            'id' => $hostId,
            'class' => ltrim(Td::classTokens($o['class'] ?? null)) ?: null,
            'name' => $name !== '' ? $name : null,
            'value' => $value !== '' ? $value : null,
            'label' => $label,
            'required' => $required,
            'disabled' => $disabled,
            'readonly' => $readonly,
            'error-text' => $error,
            'aria-label' => $aria,
        ], $hostTaken) . '><div class="td-otp">' . $labelHtml . '<div class="td-otp__box">' . $input . $cells . '</div></div>'
            . $note . '</td-otp-input>';
    }

    /**
     * @internal OTP value as <td-otp-input> keeps it: full-width (U+FF10…), Arabic-Indic (U+0660…) and extended
     * Arabic-Indic (U+06F0…) digits → ASCII, every other character dropped, at most 6 digits.
     */
    function td__otp_digits(string $v): string
    {
        static $map = null;
        if ($map === null) {
            $map = [];
            foreach ([0xFF10, 0x0660, 0x06F0] as $base) {
                for ($i = 0; $i < 10; $i++) {
                    $map[(string) json_decode(sprintf('"\\u%04X"', $base + $i))] = (string) $i;
                }
            }
        }
        return substr((string) preg_replace('/[^0-9]/', '', strtr($v, $map)), 0, 6);
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
