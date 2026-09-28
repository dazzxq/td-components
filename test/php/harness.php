<?php
/**
 * Test harness for php/td.php (driven by test/php/php.mjs). Reads JSON from stdin:
 *   { "baseUrl"?: string, "kitDir"?: string, "calls": [{ "fn": "td_button" | "Td::importMap" | …, "args": [...] }] }
 * runs every call in ONE process (ids from Td::uid() are deterministic) and prints a JSON array of
 *   { "out": mixed } | { "error": "ExceptionClass", "message": string }.
 */
declare(strict_types=1);

require __DIR__ . '/../../php/td.php';

use TdComponents\Td;

$in = json_decode((string) stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
if (isset($in['baseUrl'])) {
    Td::configure($in['baseUrl'], $in['kitDir'] ?? dirname(__DIR__, 2));
}
$results = [];
foreach ($in['calls'] as $call) {
    $fn = (string) $call['fn'];
    $args = $call['args'] ?? [];
    try {
        if (str_starts_with($fn, 'Td::')) {
            $method = substr($fn, 4);
            if (!method_exists(Td::class, $method)) {
                throw new LogicException("harness: unknown method $fn");
            }
            $out = Td::$method(...$args);
        } elseif (preg_match('/^td_[a-z_]+$/', $fn) && function_exists($fn)) {
            $out = $fn(...$args);
        } else {
            throw new LogicException("harness: unknown function $fn");
        }
        $results[] = ['out' => $out];
    } catch (Throwable $e) {
        $results[] = ['error' => get_class($e), 'message' => $e->getMessage()];
    }
}
echo json_encode($results, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
