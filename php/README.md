# php/td.php — official PHP SSR adapter

One plain PHP file (PHP ≥ 8.0 — CI job `php80` runs the suite on PHP 8.0; no framework, no composer). Declares only `TdComponents\Td` and `td_*` functions.

`php/` also ships `td-rich-text-policy.php` (class `RichTextPolicy`, loads the rich-text allowlist for server-side sanitising; needs `symfony/html-sanitizer`): `RichTextPolicy::sanitize($html, $policy, $features, $allowHttp)` is the recommended entry point (per-link `target="_blank"` / `noreferrer`, same output as the editor); `symfonyConfig()` is the legacy v0.88.0 config (forces rel + one `target` on every link). See [docs/components/rich-text.md](../docs/components/rich-text.md#bảo-mật).

```php
require_once $kitDir . '/php/td.php';
TdComponents\Td::configure('/assets/vendor/td-components/0.99.0', $kitDir); // versioned URL + filesystem path

echo td_stylesheet_tag($nonce);
echo td_import_map_tag(['dompurify' => '/assets/vendor/dompurify/purify.es.js'], $nonce); // ONE import map per page
echo td_field('email', '', ['label' => 'Email', 'type' => 'email', 'autocomplete' => 'email', 'required' => true]);
echo td_dropdown('role', ['user' => 'Người dùng', 'admin' => 'Quản trị'], 'user', ['label' => 'Vai trò']);
echo td_button('Lưu', ['type' => 'submit', 'variant' => 'primary']);
```

- `td_button` / `td_link` / `td_field` / `td_checkbox` / `td_toggle` print **standalone native controls** with the
  component's DOM contract (td.css styles them; native submit + validation; no JS, no upgrade).
- `td_dropdown` prints `<td-dropdown>` wrapping a native `<select>` — upgraded when the dropdown module loads.
  v0.92.0: `td_dropdown`, `td_tree_select` and `td_multiselect` (element mode) print `name` on the `<td-*>` host too, so a
  detached / cloned form finds `td-dropdown[name="x"]` before the upgrade (the JS copies the same value anyway).
- `td_icon` prints the full `svg.td-icon` geometry; site icons via `Td::registerIcons()`; aliases from the
  `aliases` object of `src/icons/icons.json`.
- v0.94.0 `td_icon_picker` always prints `<td-icon-picker data-td-ssr="icon-picker@1">` (the tree the component builds +
  a hidden input carrying name / value until the upgrade; trigger text = the CANONICAL icon name, search metadata is
  never read); options `label`, `aria_label`, `value`, `placeholder`, `suggestions` (max 24), `icons`, `required`,
  `disabled`, `readonly`, `allow_clear`, `helper_text`, `error`, `class`, `id`. **`td_icon_value($_POST[…])` normalises
  the POSTed value** (registered name or alias → canonical, `''` → `''`, anything else → `null`, answer 422) — always
  call it. `Td::iconName()`, `Td::iconSearchData()` (kit + site search metadata, read lazily, only when you call it) and
  `Td::registerIconSearchData()` are the explicit server API. Site icon names: prefix `site-` (the kit now has 188
  core names).
- v0.95.0 `td_check_matrix(…, ['mode' => 'override'])` prints `<td-check-matrix mode="override"
  data-td-ssr="check-matrix@2">` (constant `Td::SSR_CHECK_MATRIX_OVERRIDE`): value `['col' => ['row' => 'grant' | 'deny' |
  'inherit']]`, one native `<select name="name[col][row]">` per applicable cell (locked: disabled select + hidden input),
  marker `name[col]=''` first, `name[_v]=2` last. Not adopted in place: the module reads the selects changed before it
  loaded, then renders once. Server: require `_v === '2'` (422 otherwise), cast row keys `(string)`. Default mode
  (`check`, `check-matrix@1`) is byte-identical; an unknown mode → `check` + one `E_USER_WARNING`.
- v0.95.0 `td_card` prints a CSS-only `a.td-card` (the whole card is one link) or, without a safe href, a static
  `div.td-card` (cover image fail-closed through `td__media_url`, placeholder icon, badges, meta). See docs/components/card.md.
- `td_badge` prints a CSS-only `span.td-badge`; `td_alert` prints a `<td-alert>` host already containing the full
  styled `div.td-alert` (no JS needed; the alert module upgrades it in place and adds the close button).
- `td_link(…, ['bare' => true])` prints a plain `<a>` (site class only, no button look).
- v0.30.0 `td_number_input` prints a native `type=number` field (canonical value, implicit min 0) in the
  `.td-number` box; element mode `<td-number-input data-td-ssr="number-input@1">` is adopted in place (grouped display).
- v0.49.0 `td_choice_group` always prints `<td-choice-group data-td-ssr="choice-group@1">` with NATIVE radios (real name,
  `required` on every radio) — the form works without JS; the module adopts it in place. `Td::safeColor()` gates swatch
  colours (SVG `fill`). `td_number_input(…, ['element' => true, 'stepper' => true])` adds the − / + buttons.
- Everything is escaped; attribute names, URLs and class tokens are allowlisted.

Full reference (Vietnamese): [docs/guides/php-adapter.md](../docs/guides/php-adapter.md).
Tests: `node --test "test/php/*.test.js"` (needs the php CLI) + `src/form/td-v017-ssr.browser-test.js`.
