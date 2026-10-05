<?php
/**
 * v0.46.0 — runner of test/php/td-ssr-diff.test.js: every case of test/ssr/diff.fixtures.json (read HERE, so raw number
 * literals reach json_decode exactly) + the generated cases on stdin (test/ssr/diff-cases.mjs). Per case: the model
 * (Td::diffModel, json_encode'd with Td::DIFF_JSON), the markup (td_diff / td_diff_snapshots) and the count of
 * E_USER_WARNING calls. Any other warning / notice is fatal (the harness forbids stderr).
 */
declare(strict_types=1);

require __DIR__ . '/../../php/td.php';

use TdComponents\Td;

Td::configure('/', dirname(__DIR__, 2));
$spec = json_decode((string) file_get_contents(__DIR__ . '/diff.fixtures.json'), false, 512, JSON_THROW_ON_ERROR);
$gen = json_decode((string) file_get_contents('php://stdin'), false, 512, JSON_THROW_ON_ERROR);
$out = [];
foreach (array_merge($spec->cases, $gen) as $c) {
    $opts = json_decode(json_encode($c->opts, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    $w = 0;
    set_error_handler(static function (int $no, string $msg) use (&$w): bool {
        if ($no === E_USER_WARNING && preg_match('/^(td_diff|td_diff_snapshots|Td::diffModel): /', $msg)) {
            $w++;
            return true;
        }
        return false;
    });
    if ($c->mode === 'items') {
        $input = ['items' => $c->items];
        $html = td_diff($c->items, $opts);
    } else {
        $opts['fields'] = $c->fields ?? null;
        $input = ['before' => $c->before, 'after' => $c->after, 'fields' => $c->fields ?? null];
        $html = td_diff_snapshots($c->before, $c->after, $opts);
    }
    $model = Td::diffModel($input, ['json' => !empty($opts['json']), 'labels' => $opts['labels'] ?? null]);
    restore_error_handler();
    $out[] = ['id' => $c->id, 'model' => json_encode($model, Td::DIFF_JSON), 'html' => $html, 'warns' => $w / 2,
        'error' => error_get_last()];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
