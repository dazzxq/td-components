<?php
/**
 * Runs test/fixtures/rich-text/*.json through symfony/html-sanitizer using TdComponents\RichTextPolicy::sanitize()
 * (the per-link contract, v0.91.0). The legacy symfonyConfig() has its own regression test (td-rich-text-policy.test.js).
 *   php run-fixtures.php <fixture.json>...   → stdout: JSON { "<file basename>": [ { "name": …, "output": … }, … ] }
 * Used by test/php/td-rich-text-policy.test.js (needs `composer install` in this directory; PHP >= 8.4.1).
 */
declare(strict_types=1);

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
        $output = TdComponents\RichTextPolicy::sanitize(
            (string) $case['input'],
            $policy,
            $case['features'] ?? $all,
            (bool) ($case['allowHttp'] ?? false)
        );
        $rows[] = ['name' => $case['name'], 'output' => $output];
    }
    $result[basename($file)] = $rows;
}
echo json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
