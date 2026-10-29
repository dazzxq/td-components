<?php
/**
 * td-components — server side of <td-rich-text> (plan v0.88.0-rich-text, lane B). PHP >= 8.0 (CI job `php80` lints it),
 * NO composer dependency: the Symfony classes are only touched when symfonyConfig() is called, and a site that calls it
 * has already required symfony/html-sanitizer ^8.1.
 *
 * The browser editor and the server share ONE allowlist: src/form/rich-text/rich-text-policy.js is the source,
 * src/form/rich-text/rich-text-policy.json is generated from it (npm run build:rich-text-policy). The server never
 * trusts the client: IT picks the features / allowHttp / linkTarget of its own field and sanitizes the submitted HTML
 * again.
 *
 *   require_once '/path/to/vendor/td-components/0.88.0/php/td-rich-text-policy.php';
 *   use Symfony\Component\HtmlSanitizer\HtmlSanitizer;
 *   $policy = TdComponents\RichTextPolicy::load('/path/to/vendor/td-components/0.88.0/src/form/rich-text/rich-text-policy.json');
 *   $config = TdComponents\RichTextPolicy::symfonyConfig($policy, ['bold', 'italic', 'underline', 'strike', 'link'], false, '_blank');
 *   $clean  = (new HtmlSanitizer($config))->sanitizeFor('body', $_POST['comment'] ?? '');
 *
 * Config contract (matches policyFor() in rich-text-policy.js):
 *   - p and br always; strong / em / u / s / a per enabled feature; every other element is blocked (its text is kept),
 *     except script / template / iframe / object / svg / math (dropped with their content, like the browser). Known
 *     difference: Symfony's body context never drops <style> (a head element), so the CSS text of a pasted <style> survives
 *     as ESCAPED visible text — no element, no attribute, inert;
 *   - a keeps ONLY `href` from the input; `rel="nofollow noopener"` is always forced, `target` is forced when
 *     $linkTarget is `_self` or `_blank`; incoming rel / target never survive;
 *   - href schemes: https, mailto, tel (+ http when $allowHttp); relative links allowed. Symfony's own URL sanitizer
 *     refuses javascript: / data: / vbscript: and any other scheme.
 * Differences from the browser sanitizer (b / i / strike / del are not rewritten, stray text is not wrapped in <p>)
 * are listed in test/fixtures/rich-text (`serverExpected` + `note`). Symfony truncates input at 20 000 characters by
 * default (HtmlSanitizerConfig::withMaxInputLength) — size the field's limit accordingly.
 */

namespace TdComponents;

use InvalidArgumentException;
use JsonException;
use LogicException;

final class RichTextPolicy
{
    /** Elements removed together with their content (everything else unlisted keeps its text). `style` is listed for
     * head contexts; in the body context Symfony ignores it (see the class docblock). */
    private const DROPPED = ['script', 'style', 'template', 'iframe', 'object', 'svg', 'math'];

    private const TARGETS = ['none', '_self', '_blank'];

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
     * Build the Symfony sanitizer config for one field.
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
            throw new LogicException('TdComponents\\RichTextPolicy::symfonyConfig() needs symfony/html-sanitizer ^8.1 (composer require symfony/html-sanitizer)');
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
                $config = $config->allowElement((string) $tag, array_values(array_map('strval', (array) ($attrs[$tag] ?? []))));
                if ($tag === 'a') {
                    $hasLink = true;
                }
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
                ->allowRelativeLinks(($link['relative'] ?? true) === true)
                ->forceAttribute('a', 'rel', (string) ($link['rel'] ?? 'nofollow noopener'));
            if ($linkTarget !== 'none') {
                $config = $config->forceAttribute('a', 'target', $linkTarget);
            }
        }
        return $config;
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
