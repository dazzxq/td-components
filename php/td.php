<?php
/**
 * td-components — official PHP SSR adapter (plan v0.17.0 E5). PHP >= 8.0 (CI job `php80`), no framework, no composer
 * dependency.
 * Docs: docs/guides/php-adapter.md.
 *
 *   require_once '/path/to/vendor/td-components/0.17.0/php/td.php';
 *   TdComponents\Td::configure('/assets/vendor/td-components/0.17.0', __DIR__ . '/public/assets/vendor/td-components/0.17.0');
 *   echo td_stylesheet_tag($nonce), td_import_map_tag(['app' => '/assets/app.js'], $nonce);
 *   echo td_field('email', $email, ['label' => 'Email', 'type' => 'email', 'autocomplete' => 'email', 'required' => true]);
 *   echo td_button('Lưu', ['type' => 'submit', 'variant' => 'primary']);
 *
 * Markup contract (the only promise of this file):
 *   - td_button / td_link / td_field / td_checkbox / td_toggle print STANDALONE NATIVE controls carrying the DOM
 *     contract (BEM classes) of the matching component: td.css styles them, submit + validation are native, no JS,
 *     no upgrade. Use the <td-*> custom elements when you need JS behaviour (loading/run, counter, live errors…).
 *   - td_dropdown prints a <td-dropdown> host wrapping a native <select>: works without JS, upgrades when
 *     `@dazzxq/td-components/dropdown` is imported (the ONLY helper that upgrades).
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
         * @param string $baseUrl URL of the VERSIONED vendor directory (e.g. '/assets/vendor/td-components/0.17.0') —
         *                        the version lives in the path, never in `?v=` (module identity).
         * @param string $kitDir  Filesystem path of the same directory (reads package.json + src/icons/icons.json).
         */
        public static function configure(string $baseUrl, string $kitDir): void
        {
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
         */
        public static function icon(string $name, string $size = 'm', string $label = '', string $class = ''): string
        {
            $def = self::iconDef($name);
            if ($def === null) {
                return '';
            }
            $size = in_array($size, ['s', 'm', 'l'], true) ? $size : 'm';
            $label = trim($label);
            $out = '<svg class="td-icon td-icon--' . $size . self::e(self::classTokens($class)) . '" data-icon="'
                . self::e($def['_name']) . '" viewBox="' . self::e((string) ($def['viewBox'] ?? '0 0 24 24')) . '"';
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
        $taken = [];
        $html = '<' . $tag . Td::ownAttrs($attrs, $taken) . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>';
        if ($bare) {
            return $html . Td::e($label) . '</a>';
        }
        $icon = '';
        if (!empty($o['icon']) && is_string($o['icon'])) {
            $svg = Td::icon($o['icon'], 's');
            $icon = $svg !== '' ? '<span class="td-btn__icon" aria-hidden="true">' . $svg . '</span>' : '';
        }
        $text = $label !== '' ? '<span class="td-btn__label">' . Td::e($label) . '</span>' : '';
        $html .= ($o['icon_position'] ?? 'left') === 'right' ? $text . $icon : $icon . $text;
        $html .= '<span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true"' . ($loading ? '' : ' hidden') . '>'
            . '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
            . '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
            . '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>';
        return $html . '</' . $tag . '>';
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
     */
    function td_field(string $name, string $value = '', array $o = []): string
    {
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
     * attrs (host).
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
        ];
        $taken = [];
        $html = '<td-dropdown' . Td::ownAttrs($host, $taken) . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>';
        // Visible label for the no-JS select; the upgrade re-renders the host (its own label from `label`).
        if ($label !== null) {
            $html .= '<label class="td-field__label" for="' . Td::e($id) . '-select">' . Td::e($label)
                . ($required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') . '</label>';
        }
        $html .= '<select' . Td::ownAttrs([
            'id' => "$id-select",
            'name' => $name !== '' ? $name : null,
            'required' => $required,
            'disabled' => !empty($o['disabled']),
            'aria-label' => isset($o['aria_label']) && (string) $o['aria_label'] !== '' ? (string) $o['aria_label'] : null,
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
     */
    function td_toggle(string $name, bool $checked = false, string $label = '', array $o = []): string
    {
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
     */
    function td_checkbox(string $name, bool $checked = false, string $label = '', array $o = []): string
    {
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
     * uppercase double-border rubber stamp), id, class, attrs (span).
     */
    function td_badge(string $text, array $o = []): string
    {
        $variants = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
        $variant = in_array($o['variant'] ?? null, $variants, true) ? $o['variant'] : 'neutral';
        $class = 'td-badge td-badge--' . $variant . (!empty($o['outline']) ? ' td-badge--outline' : '')
            . (!empty($o['stamp']) ? ' td-badge--stamp' : '') . Td::classTokens($o['class'] ?? null);
        $taken = [];
        return '<span' . Td::ownAttrs([
            'class' => $class,
            'id' => isset($o['id']) && is_scalar($o['id']) && (string) $o['id'] !== '' ? (string) $o['id'] : null,
        ], $taken) . Td::attrs(is_array($o['attrs'] ?? null) ? $o['attrs'] : [], $taken) . '>' . Td::e($text) . '</span>';
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
