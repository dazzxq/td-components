<?php
/**
 * Runs test/fixtures/rich-text/*.json through symfony/html-sanitizer using TdComponents\RichTextPolicy::symfonyConfig.
 *   php run-fixtures.php <fixture.json>...   → stdout: JSON { "<file basename>": [ { "name": …, "output": … }, … ] }
 * Used by test/php/td-rich-text-policy.test.js (needs `composer install` in this directory; PHP >= 8.4.1).
 */
declare(strict_types=1);

use Symfony\Component\HtmlSanitizer\HtmlSanitizer;

$root = dirname(__DIR__, 3);
require __DIR__ . '/vendor/autoload.php';
require $root . '/php/td-rich-text-policy.php';

$policy = TdComponents\RichTextPolicy::load($root . '/src/form/rich-text/rich-text-policy.json');
$all = ['bold', 'italic', 'underline', 'strike', 'link'];

$result = [];
foreach (array_slice($argv, 1) as $file) {
    $cases = json_decode((string) file_get_contents($file), true, 32, JSON_THROW_ON_ERROR);
    $rows = [];
    foreach ($cases as $case) {
        $config = TdComponents\RichTextPolicy::symfonyConfig(
            $policy,
            $case['features'] ?? $all,
            (bool) ($case['allowHttp'] ?? false),
            (string) ($case['linkTarget'] ?? 'none')
        );
        $rows[] = ['name' => $case['name'], 'output' => (new HtmlSanitizer($config))->sanitizeFor('body', (string) $case['input'])];
    }
    $result[basename($file)] = $rows;
}
echo json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
