# php/td.php — official PHP SSR adapter

One plain PHP file (PHP ≥ 8.0 — CI job `php80` runs the suite on PHP 8.0; no framework, no composer). Declares only `TdComponents\Td` and `td_*` functions.

```php
require_once $kitDir . '/php/td.php';
TdComponents\Td::configure('/assets/vendor/td-components/0.36.2', $kitDir); // versioned URL + filesystem path

echo td_stylesheet_tag($nonce);
echo td_import_map_tag(['dompurify' => '/assets/vendor/dompurify/purify.es.js'], $nonce); // ONE import map per page
echo td_field('email', '', ['label' => 'Email', 'type' => 'email', 'autocomplete' => 'email', 'required' => true]);
echo td_dropdown('role', ['user' => 'Người dùng', 'admin' => 'Quản trị'], 'user', ['label' => 'Vai trò']);
echo td_button('Lưu', ['type' => 'submit', 'variant' => 'primary']);
```

- `td_button` / `td_link` / `td_field` / `td_checkbox` / `td_toggle` print **standalone native controls** with the
  component's DOM contract (td.css styles them; native submit + validation; no JS, no upgrade).
- `td_dropdown` prints `<td-dropdown>` wrapping a native `<select>` — upgraded when the dropdown module loads.
- `td_icon` prints the full `svg.td-icon` geometry; site icons via `Td::registerIcons()`; aliases from the
  `aliases` object of `src/icons/icons.json`.
- `td_badge` prints a CSS-only `span.td-badge`; `td_alert` prints a `<td-alert>` host already containing the full
  styled `div.td-alert` (no JS needed; the alert module upgrades it in place and adds the close button).
- `td_link(…, ['bare' => true])` prints a plain `<a>` (site class only, no button look).
- v0.30.0 `td_number_input` prints a native `type=number` field (canonical value, implicit min 0) in the
  `.td-number` box; element mode `<td-number-input data-td-ssr="number-input@1">` is adopted in place (grouped display).
- Everything is escaped; attribute names, URLs and class tokens are allowlisted.

Full reference (Vietnamese): [docs/guides/php-adapter.md](../docs/guides/php-adapter.md).
Tests: `node --test "test/php/*.test.js"` (needs the php CLI) + `src/form/td-v017-ssr.browser-test.js`.
