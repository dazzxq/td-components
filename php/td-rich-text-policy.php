<?php
/**
 * td-components — server side of <td-rich-text> (plan v0.88.0-rich-text, lane B; per-link rel / target since v0.91.0).
 * PHP >= 8.0 (CI job `php80` lints it), NO composer dependency: the Symfony classes are only touched when sanitize() or
 * symfonyConfig() is called, and a site that calls them has already required symfony/html-sanitizer ^8.1.
 *
 * The browser editor and the server share ONE allowlist: src/form/rich-text/rich-text-policy.js is the source,
 * src/form/rich-text/rich-text-policy.json is generated from it (npm run build:rich-text-policy). The server never
 * trusts the client: IT picks the features / allowHttp of its own field and sanitizes the submitted HTML again.
 *
 *   require_once '/path/to/vendor/td-components/0.91.0/php/td-rich-text-policy.php';
 *   $policy = TdComponents\RichTextPolicy::load('/path/to/vendor/td-components/0.91.0/src/form/rich-text/rich-text-policy.json');
 *   $clean  = TdComponents\RichTextPolicy::sanitize($_POST['comment'] ?? '', $policy, ['bold', 'italic', 'underline', 'strike', 'link']);
 *
 * sanitize() contract (the per-link contract of the editor, same output as the client for the shared fixtures):
 *   - p and br always; strong / em / u / s / a per enabled feature; every other element is blocked (its text is kept),
 *     except script / template / iframe / object / svg / math (dropped with their content, like the browser). Known
 *     difference: Symfony's body context never drops <style> (a head element), so the CSS text of a pasted <style> survives
 *     as ESCAPED visible text — no element, no attribute, inert;
 *   - a keeps `href`, `rel` and `target` only: `target` survives only when exactly `_blank`; `rel` is always written as
 *     `nofollow noopener`, plus ` noreferrer` when the incoming rel has that token (ASCII case-insensitive); every other
 *     rel token is dropped. Attribute order: href, rel, target;
 *   - href schemes: https, mailto, tel (+ http when $allowHttp); relative links allowed. Symfony's own URL sanitizer
 *     refuses javascript: / data: / vbscript: and any other scheme.
 * symfonyConfig() is the LEGACY entry point (v0.88.0): a keeps only `href`, `rel="nofollow noopener"` is forced and
 * `target` is forced from $linkTarget — incoming rel / target never survive (no per-link choice). A site that wants the
 * per-link "new tab" / "noreferrer" of the editor must call sanitize().
 * Differences from the browser sanitizer (b / i / strike / del are not rewritten, stray text is not wrapped in <p>)
 * are listed in test/fixtures/rich-text (`serverExpected` + `note`). Symfony truncates input at 20 000 characters by
 * default (HtmlSanitizerConfig::withMaxInputLength) — size the field's limit accordingly.
 */

namespace TdComponents;

use InvalidArgumentException;
use JsonException;
use LogicException;
use RuntimeException;

final class RichTextPolicy
{
    /** Elements removed together with their content (everything else unlisted keeps its text). `style` is listed for
     * head contexts; in the body context Symfony ignores it (see the class docblock). */
    private const DROPPED = ['script', 'style', 'template', 'iframe', 'object', 'svg', 'math'];

    /** $linkTarget values of the legacy symfonyConfig(). */
    private const TARGETS = ['none', '_self', '_blank'];

    /** The only attributes sanitize() lets a link keep, in output order. */
    private const LINK_ATTRS = ['href', 'rel', 'target'];

    private function __construct()
    {
    }

    /**
     * Read and validate rich-text-policy.json.
     *
     * @return array<string, mixed>
     * @throws InvalidArgumentException unreadable file, bad JSON, wrong shape or version !== 1
     */
    public static function load(string $jsonPath): array
    {
        $raw = is_file($jsonPath) ? @file_get_contents($jsonPath) : false;
        if (!is_string($raw)) {
            throw new InvalidArgumentException("rich-text policy: cannot read {$jsonPath}");
        }
        try {
            $policy = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new InvalidArgumentException('rich-text policy: invalid JSON (' . $e->getMessage() . ')', 0, $e);
        }
        if (!is_array($policy) || ($policy['version'] ?? null) !== 1) {
            throw new InvalidArgumentException('rich-text policy: unsupported version (expected 1)');
        }
        foreach (['blocks', 'features', 'link'] as $key) {
            if (!isset($policy[$key]) || !is_array($policy[$key])) {
                throw new InvalidArgumentException("rich-text policy: missing \"{$key}\"");
            }
        }
        return $policy;
    }

    /**
     * Sanitize the submitted HTML of one field with the per-link contract (see the class docblock): Symfony
     * HtmlSanitizer with a[href|rel|target] + the rel / target guard, then finishLinks() gives every <a> its rel and
     * the attribute order href, rel, target.
     *
     * @param array<string, mixed> $policy   from load()
     * @param string[]             $features enabled features, e.g. ['bold', 'link']
     * @throws InvalidArgumentException unknown feature or malformed policy
     * @throws LogicException           symfony/html-sanitizer is not installed
     * @throws RuntimeException         Symfony rendered an <a> tag finishLinks() cannot read (never left without rel)
     */
    public static function sanitize(string $html, array $policy, array $features, bool $allowHttp = false): string
    {
        $config = self::config($policy, $features, $allowHttp, true);
        $out = (new \Symfony\Component\HtmlSanitizer\HtmlSanitizer($config))->sanitizeFor('body', $html);
        return self::finishLinks($out, (string) ($policy['link']['rel'] ?? 'nofollow noopener'));
    }

    /**
     * LEGACY (v0.88.0) Symfony config for one field: a keeps only `href`; `rel="nofollow noopener"` is forced and
     * `target` is forced when $linkTarget is `_self` or `_blank` (incoming rel / target never survive). Kept unchanged
     * for existing callers; the per-link contract of the editor needs sanitize().
     *
     * @param array<string, mixed> $policy   from load()
     * @param string[]             $features enabled features, e.g. ['bold', 'link']
     * @param string               $linkTarget none | _self | _blank
     * @throws InvalidArgumentException unknown feature, bad linkTarget or malformed policy
     * @throws LogicException           symfony/html-sanitizer is not installed
     */
    public static function symfonyConfig(array $policy, array $features, bool $allowHttp = false, string $linkTarget = 'none'): \Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig
    {
        if (!in_array($linkTarget, self::TARGETS, true)) {
            throw new InvalidArgumentException('rich-text policy: linkTarget must be none, _self or _blank');
        }
        $config = self::config($policy, $features, $allowHttp, false);
        if (array_key_exists('a', $config->getAllowedElements())) {
            $config = $config->forceAttribute('a', 'rel', (string) ($policy['link']['rel'] ?? 'nofollow noopener'));
            if ($linkTarget !== 'none') {
                $config = $config->forceAttribute('a', 'target', $linkTarget);
            }
        }
        return $config;
    }

    /**
     * The shared part of both entry points. $perLink: a[href|rel|target] from the policy + linkGuard(); else the
     * legacy a[href] allowlist (the caller forces rel / target).
     *
     * @param array<string, mixed> $policy
     * @param mixed[]              $features
     */
    private static function config(array $policy, array $features, bool $allowHttp, bool $perLink): \Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig
    {
        $defs = $policy['features'] ?? null;
        $blockTags = $policy['blocks']['tags'] ?? null;
        $link = $policy['link'] ?? null;
        if (($policy['version'] ?? null) !== 1 || !is_array($defs) || !is_array($blockTags) || !is_array($link)) {
            throw new InvalidArgumentException('rich-text policy: malformed policy (use RichTextPolicy::load)');
        }
        foreach ($features as $f) {
            if (!is_string($f) || !array_key_exists($f, $defs)) {
                throw new InvalidArgumentException('rich-text policy: unknown feature ' . (is_string($f) ? "\"{$f}\"" : gettype($f)));
            }
        }
        if (!class_exists(\Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig::class)) {
            throw new LogicException('TdComponents\\RichTextPolicy::sanitize() / symfonyConfig() needs symfony/html-sanitizer ^8.1 (composer require symfony/html-sanitizer)');
        }

        // every with*() / allow*() returns a NEW instance: always reassign
        $config = (new \Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig())
            ->defaultAction(\Symfony\Component\HtmlSanitizer\HtmlSanitizerAction::Block);
        foreach (self::DROPPED as $tag) {
            $config = $config->dropElement($tag);
        }
        foreach ($blockTags as $tag) {
            $config = $config->allowElement((string) $tag);
        }
        $hasLink = false;
        foreach ($features as $f) {
            $attrs = is_array($defs[$f]['attrs'] ?? null) ? $defs[$f]['attrs'] : [];
            foreach ((array) ($defs[$f]['tags'] ?? []) as $tag) {
                $allowed = array_values(array_map('strval', (array) ($attrs[$tag] ?? [])));
                if ($tag === 'a') {
                    $hasLink = true;
                    // legacy: href only (v0.88.0 behaviour, whatever the JSON lists); per-link: never more than LINK_ATTRS
                    $allowed = $perLink ? array_values(array_intersect($allowed, self::LINK_ATTRS)) : ['href'];
                }
                $config = $config->allowElement((string) $tag, $allowed);
            }
        }
        if ($hasLink) {
            $schemes = array_map('strval', (array) ($link['schemes'] ?? []));
            if ($allowHttp) {
                $schemes = array_merge($schemes, array_map('strval', (array) ($link['optionalSchemes'] ?? [])));
            }
            $config = $config
                ->withAttributeSanitizer(self::hrefGuard())
                ->allowLinkSchemes(array_values(array_unique($schemes)))
                ->allowRelativeLinks(($link['relative'] ?? true) === true);
            if ($perLink) {
                $config = $config->withAttributeSanitizer(self::linkGuard(
                    (string) ($link['rel'] ?? 'nofollow noopener'),
                    array_values(array_map('strval', (array) ($link['relOptional'] ?? []))),
                    array_values(array_map('strval', (array) ($link['targets'] ?? [])))
                ));
            }
        }
        return $config;
    }

    /**
     * Post-pass of sanitize() over Symfony's OUTPUT (never over the raw input): every <a> opening tag gets
     * `rel="nofollow noopener"` when linkGuard() had no rel to normalise, and its attributes are written in the order
     * href, rel, target (Symfony keeps the input order). Safe on that output only: Symfony renders each element as
     * `<name` + ` attr="value"`… + `>`, with lowercase attribute names and every value / text node passed through
     * htmlspecialchars(ENT_QUOTES) (+ `=`, `+`, `@` and the backtick as numeric entities) — so no `<`, `>` or `"` occurs inside a
     * value or a text node, and every literal `<a ` / `<a>` is a real link tag (`<abbr>` etc. never match: `a` must be
     * followed by a space or `>`). An <a> tag the pattern cannot read is an error, never left without rel.
     */
    private static function finishLinks(string $html, string $rel): string
    {
        $expected = preg_match_all('~<a[ >]~', $html);
        $seen = 0;
        $out = preg_replace_callback('~<a((?: [a-z][a-z0-9-]*(?:="[^"<>]*")?)*)>~', static function (array $m) use ($rel, &$seen): string {
            $seen++;
            preg_match_all('~ ([a-z][a-z0-9-]*)(?:="[^"<>]*")?~', $m[1], $attrs, PREG_SET_ORDER);
            $raw = [];
            foreach ($attrs as $a) {
                $raw[$a[1]] ??= $a[0]; // ` name="value"` exactly as Symfony escaped it; first declaration wins
            }
            $raw['rel'] ??= ' rel="' . htmlspecialchars($rel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"';
            $tag = '<a';
            foreach (self::LINK_ATTRS as $name) {
                $tag .= $raw[$name] ?? '';
            }
            return $tag . '>';
        }, $html);
        if (!is_string($out) || $seen !== $expected) {
            throw new RuntimeException('rich-text policy: unexpected <a> markup in the sanitizer output');
        }
        return $out;
    }

    /**
     * Per-link rel / target of sanitize() (same rules as linkAttrsFrom() in rich-text-policy.js): `target` survives only
     * when it is exactly one of $targets (`_blank`); `rel` becomes $rel plus each $optional token present in the
     * incoming value (split on ASCII whitespace, ASCII case-insensitive). Returning null drops the attribute.
     *
     * @param string[] $optional
     * @param string[] $targets
     */
    private static function linkGuard(string $rel, array $optional, array $targets): \Symfony\Component\HtmlSanitizer\Visitor\AttributeSanitizer\AttributeSanitizerInterface
    {
        return new class ($rel, $optional, $targets) implements \Symfony\Component\HtmlSanitizer\Visitor\AttributeSanitizer\AttributeSanitizerInterface {
            /** @param string[] $optional @param string[] $targets */
            public function __construct(private string $rel, private array $optional, private array $targets)
            {
            }

            public function getSupportedElements(): ?array
            {
                return ['a'];
            }

            public function getSupportedAttributes(): ?array
            {
                return ['rel', 'target'];
            }

            public function sanitizeAttribute(string $element, string $attribute, string $value, \Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig $config): ?string
            {
                if ($attribute === 'target') {
                    return in_array($value, $this->targets, true) ? $value : null;
                }
                // strtr, not strtolower: ASCII-only on every PHP version
                $tokens = preg_split('~[\t\n\f\r ]+~', strtr($value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), -1, PREG_SPLIT_NO_EMPTY);
                $out = $this->rel;
                foreach ($this->optional as $token) {
                    if (in_array($token, is_array($tokens) ? $tokens : [], true)) {
                        $out .= ' ' . $token;
                    }
                }
                return $out;
            }
        };
    }

    /**
     * Same extra href rules as isSafeUrl() in rich-text-policy.js that Symfony's URL sanitizer does not apply: a
     * network-path reference (`//host`) would leave the site, and `https:foo` / `https:/foo` name no host. Runs after
     * Symfony's own UrlAttributeSanitizer (scheme allowlist, javascript: / data: / vbscript: refusal). Returning null
     * drops the attribute.
     */
    private static function hrefGuard(): \Symfony\Component\HtmlSanitizer\Visitor\AttributeSanitizer\AttributeSanitizerInterface
    {
        return new class () implements \Symfony\Component\HtmlSanitizer\Visitor\AttributeSanitizer\AttributeSanitizerInterface {
            public function getSupportedElements(): ?array
            {
                return ['a'];
            }

            public function getSupportedAttributes(): ?array
            {
                return ['href'];
            }

            public function sanitizeAttribute(string $element, string $attribute, string $value, \Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig $config): ?string
            {
                if (preg_match('~^[/\\\\]{2}~', $value) === 1) {
                    return null;
                }
                if (preg_match('~^https?:~i', $value) === 1 && preg_match('~^[A-Za-z]+://[^/\\\\?#\s]~', $value) !== 1) {
                    return null;
                }
                return $value;
            }
        };
    }
}
