[Tài liệu](../README.md) › Hướng dẫn › Adapter PHP

# Adapter PHP chính thức (`php/td.php`)

`php/td.php` là **một file PHP thuần** ship kèm gói (thư mục `php/` trong `npm pack`). Nó làm ba việc cho site PHP
(135, dwp, site sau này):

1. In `<link>` tới `td.css` và **import map** sinh từ `exports` của `package.json` đã vendor.
2. In **markup phía server** (SSR) đúng hợp đồng DOM của component: nút, nút dạng link, ô nhập, dropdown, switch,
   checkbox, icon, badge, khối thông báo (alert).
3. Escape mọi giá trị và lọc tên attribute / URL / class — site không phải tự nhớ.

Yêu cầu: **PHP ≥ 8.0** (0.18.0; kiểm chứng trên PHP 8.0 thật bằng job CI `php80`), không framework, không composer. File chỉ khai báo class `TdComponents\Td` và các hàm toàn cục
có tiền tố `td_` — không biến toàn cục, không hàm `h()`, không autoload.

> Trang này là tài liệu tham chiếu của adapter. Cách đặt kit lên server, import map trong WordPress, CSP… xem
> [WordPress & PHP](wordpress-php.md) và [CSP](csp.md).

## Mục lục

- [Khi nào dùng helper, khi nào dùng `<td-*>`](#khi-nào-dùng-helper-khi-nào-dùng-td-)
- [Cài đặt và cấu hình](#cài-đặt-và-cấu-hình)
- [CSS và import map](#css-và-import-map)
- [Bảng hàm](#bảng-hàm)
- [td_button và td_link](#td_button-và-td_link)
- [td_field](#td_field)
- [td_dropdown](#td_dropdown)
- [td_toggle và td_checkbox](#td_toggle-và-td_checkbox)
- [td_icon và icon riêng của site](#td_icon-và-icon-riêng-của-site)
- [td_badge và td_alert](#td_badge-và-td_alert)
- [An toàn: escape và whitelist](#an-toàn-escape-và-whitelist)
- [Chuyển từ adapter riêng của 135](#chuyển-từ-adapter-riêng-của-135)
- [Lỗi thường gặp](#lỗi-thường-gặp)

## Khi nào dùng helper, khi nào dùng `<td-*>`

Đây là quyết định quan trọng nhất, nên nói rõ trước:

| Helper | In ra | Cần JS? | Upgrade? |
|---|---|---|---|
| `td_button`, `td_link` | `<button class="td-btn …">` / `<a class="td-btn …">` **native** | Không | Không |
| `td_field` | `div.td-field` + `input` / `textarea.td-field__control` **native** | Không | Không |
| `td_checkbox` | `label.td-checkbox` + `input.td-checkbox__input` **native** | Không | Không |
| `td_toggle` | `label.td-switch` + `input[role=switch]` **native** | Không | Không |
| `td_dropdown` | host `<td-dropdown>` bọc `<select>` **native** | Không (chạy như select) | **Có** — khi nạp module dropdown |
| `td_icon` | `svg.td-icon` đủ hình (có `viewBox`) | Không | — |
| `td_badge` | `span.td-badge…` (thuần CSS) | Không | — |
| `td_alert` | host `<td-alert>` chứa sẵn khối `div.td-alert` đầy đủ | Không (có dáng ngay) | **Có** — nạp module `alert`: nâng cấp tại chỗ + nút đóng |

- Bốn helper đầu in **control native đứng riêng** mang đúng class BEM của component. `td.css` tạo dáng giống hệt
  component (có test so computed style), còn submit, `required`, `pattern`, `min`/`max`, `type=month`,
  `type=datetime-local`, nút submit có `name`/`value`… là **của trình duyệt**. Không cần JS, không có bước upgrade.
- Cần hành vi JS (nút `loading`/`run()`, bộ đếm ký tự, lỗi validate cập nhật động, `setError()`, toggle
  `controlled`/`commit()`…) → viết thẳng custom element `<td-button>`, `<td-input-field>`, `<td-checkbox>`,
  `<td-toggle>` trong template (xem trang từng component). Helper **không** in custom element cho các control này.
- `td_dropdown` là helper **duy nhất** upgrade: không có JS thì `<select>` hoạt động bình thường; nạp
  `@dazzxq/td-components/dropdown` thì component đọc `<option>` rồi thay select (xem [td_dropdown](#td_dropdown)).

## Cài đặt và cấu hình

File nằm trong thư mục kit đã vendor (có phiên bản trong đường dẫn):

```text
public/assets/vendor/td-components/0.21.0/
  td.css  index.js  package.json  src/  php/td.php  THIRD_PARTY_NOTICES.md
```

Nạp **một lần** trong bootstrap của site, rồi cấu hình:

```php
<?php
const TD_VERSION = '0.21.0';
$tdDir = __DIR__ . '/public/assets/vendor/td-components/' . TD_VERSION;
require_once $tdDir . '/php/td.php';

TdComponents\Td::configure(
    '/assets/vendor/td-components/' . TD_VERSION, // URL gốc (có phiên bản) — dùng cho import map + td.css
    $tdDir                                         // đường dẫn file hệ thống — đọc package.json + src/icons/icons.json
);
```

- `baseUrl` phải là URL http(s) hoặc tương đối (`/…`); sai → `InvalidArgumentException`. Dấu `/` cuối bị bỏ.
- **Phiên bản nằm trong đường dẫn**, không dùng `?v=` cho module (hai URL = hai module, xem
  [WordPress & PHP](wordpress-php.md#đặt-phiên-bản-vào-đường-dẫn-không-dùng-ver-cho-module)).
- Không gọi `configure()` thì icon và markup vẫn chạy (kit mặc định là thư mục chứa `php/`), nhưng `td_import_map*`
  và `td_stylesheet_tag` ném `LogicException` (chúng cần URL).

## CSS và import map

```php
<head>
  <?= td_stylesheet_tag($nonce) ?>
  <link rel="stylesheet" href="/assets/app/tokens.css"> <!-- token riêng của site, SAU td.css -->
  <?= td_import_map_tag([
      'dompurify' => '/assets/vendor/dompurify/3.4.16/purify.es.js',
      'app/'      => '/assets/app/',
  ], $nonce) ?>
  <script type="module" src="/assets/app/boot.js" nonce="<?= htmlspecialchars($nonce) ?>"></script>
</head>
```

Một hợp đồng, hai cách gọi:

| Hàm | Trả về |
|---|---|
| `Td::importMap(array $extra = []): array` / `td_import_map(array $extra = [])` | mảng `specifier => URL`: mọi entry `.js` trong `exports` (kit trước, theo thứ tự `exports`), rồi `$extra` |
| `td_import_map_tag(array $extra = [], ?string $nonce = null): string` | `<script type="importmap" nonce="…">{"imports":…}</script>` |
| `td_stylesheet_tag(?string $nonce = null): string` | `<link rel="stylesheet" href="{baseUrl}/td.css" nonce="…">` |

Luật:

- Trang chỉ có **một** import map, in **trước mọi** `<script type="module">`. Entry riêng của site (DOMPurify, module
  app…) đưa qua `$extra` — đừng in import map thứ hai.
- Key trong `$extra` **trùng** specifier của kit (ví dụ `@dazzxq/td-components/button`) → `InvalidArgumentException`.
  Adapter không cho vô tình ghi đè module của kit; muốn thay hẳn thì tự dựng import map, không dùng helper.
- Key/URL rỗng hoặc không phải chuỗi → `InvalidArgumentException`.
- JSON in với `JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES`: chuỗi
  `</script>` trong dữ liệu không đóng được thẻ. Nonce được escape.
- `./td.css`, `./icons.json`, `./package.json` không vào import map (không phải module JS).
- WordPress: dùng mảng `td_import_map()` để `wp_register_script_module()` từng entry (WordPress tự in import map) —
  xem [WordPress & PHP](wordpress-php.md#đăng-ký-css-và-module).

Server phải trả `.js` (và `.mjs` nếu site dùng) với `Content-Type: text/javascript`; nginx cũ không map `.mjs`, kèm
`X-Content-Type-Options: nosniff` thì module bị chặn. Cấu hình nginx/Apache:
[WordPress & PHP › MIME của module JS](wordpress-php.md#mime-của-module-js).

## Bảng hàm

Tên và thứ tự tham số trùng adapter tham chiếu của 135 (`src/Ui/markup.php`):

```php
td_icon(string $name, string $size = 'm', string $label = ''): string
td_button(string $label, array $opts = []): string
td_link(string $label, string $href, array $opts = []): string
td_field(string $name, string $value = '', array $opts = []): string
td_dropdown(string $name, array $options, string|int|null $value = '', array $opts = []): string
td_toggle(string $name, bool $checked = false, string $label = '', array $opts = []): string
td_checkbox(string $name, bool $checked = false, string $label = '', array $opts = []): string
td_badge(string $text, array $opts = []): string          // 0.18.0
td_alert(string $message, array $opts = []): string       // 0.18.0
td_import_map(array $extra = []): array
td_import_map_tag(array $extra = [], ?string $nonce = null): string
td_stylesheet_tag(?string $nonce = null): string
```

Class `TdComponents\Td` (static): `configure`, `baseUrl`, `kitDir`, `importMap`, `importMapTag`, `stylesheetTag`,
`registerIcons`, `siteIcons`, `hasIcon`, `iconAliases()`, `icon($name, $size, $label, $class)`, và các tiện ích an toàn dùng lại được
trong template của site: `e()` (escape), `attrs()` (in attribute đã lọc), `safeUrl()`, `classTokens()`, `uid()`,
`safeFilename()`. Hằng `Td::JSON_FLAGS` cho JSON in vào HTML.

Mọi option không nhận ra bị **bỏ qua** (không lỗi); giá trị ngoài whitelist rơi về mặc định.

Option chung cho các control:

| Option | Ý nghĩa |
|---|---|
| `id` | id tường minh. Không có → id duy nhất trong request (`f-{name}-1`, `dd-{name}-2`…) |
| `class` | class thêm của site — chỉ nhận token hợp lệ `[A-Za-z_][A-Za-z0-9_-]*`, token khác bị bỏ |
| `attrs` | attribute thêm (mảng `tên => giá trị`; `true` = attribute rỗng, `null`/`false` = bỏ). Tên qua whitelist (xem [An toàn](#an-toàn-escape-và-whitelist)); tên helper đã in (ví dụ `class`, `type`) không bị ghi đè hay nhân đôi |

## td_button và td_link

```php
<?= td_button('Lưu', ['type' => 'submit', 'variant' => 'primary', 'icon' => 'check']) ?>
<?= td_button('Xoá bộ', ['type' => 'submit', 'name' => 'action', 'value' => 'delete', 'variant' => 'ghost', 'size' => 'sm', 'icon' => 'trash']) ?>
<?= td_button('', ['icon' => 'menu', 'aria_label' => 'Mở menu', 'attrs' => ['aria-controls' => 'side', 'aria-expanded' => 'false']]) ?>
<?= td_button('Tải báo cáo', ['href' => '/reports/9.pdf', 'download' => 'bao-cao.pdf', 'icon' => 'download']) ?>
<?= td_link('Xem trang', $url, ['icon' => 'external-link', 'target' => '_blank']) ?>
```

| Option | Giá trị | Mặc định |
|---|---|---|
| `variant` | `primary` `secondary` `success` `danger` `info` `warning` `ghost` | `secondary` (giữ như 135; `<td-button>` mặc định `primary`) |
| `size` | `sm` `md` `lg` (`xs` → `sm`) | `md` |
| `icon` | tên icon registry (hoặc icon site đã `registerIcons`) | — |
| `icon_position` | `left` `right` | `left` |
| `type` | `button` `submit` `reset` (chỉ `<button>`) | `button` |
| `name`, `value` | nút submit gửi `name=value` khi nó là submitter (native) | — |
| `disabled` | `true` → `disabled` native (link: xem dưới) | — |
| `loading` | spinner hiện + `aria-busy="true"` `aria-disabled="true"` **và** `disabled` native (không có JS nên phải chặn submit lần hai bằng native) | — |
| `full_width` | `td-btn--full` | — |
| `aria_label` | tên truy cập (bắt buộc với nút chỉ có icon) | — |
| `tooltip` | `data-tooltip` (tooltip tự khởi tạo khi site import `@dazzxq/td-components/tooltip`) | — |
| `href` | có key này → in `<a class="td-btn …">` thay `<button>` | — |
| `target` | `_blank` `_self` `_parent` `_top` (khác → bỏ). `_blank` tự thêm `rel="noopener noreferrer"` | — |
| `download` | `true` → `download`; chuỗi → tên file (bỏ `/ \ : * ? " < > \|` và ký tự điều khiển, tối đa 200 ký tự) | — |
| `bare` | **chỉ `td_link`** (0.18.0): `true` → `<a>` thường, không class `td-btn…`, không span con của nút | — |

Markup (cấu trúc con giống `<td-button>`):

```html
<button class="td-btn td-btn--primary td-btn--md" type="submit">
  <span class="td-btn__icon" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg></span>
  <span class="td-btn__label">Lưu</span>
  <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden><svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false"><circle class="td-spinner__track" cx="25" cy="25" r="20"></circle><circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>
</button>
```

**Nút dạng link** (`href`, cùng hợp đồng với `<td-button href>`):

- URL qua whitelist: `https:`, `mailto:`, `tel:`, đường dẫn tương đối, `#…`; `http:` **chỉ khi** site gọi
  `Td::allowHttpLinks(true)` (mặc định không cho hạ HTTPS → HTTP). Scheme khác (`javascript:`, `data:`, `vbscript:`,
  `blob:`, `file:`…) → **không in `href`**, link thành **disabled** (`role="link"`, `aria-disabled="true"`,
  `tabindex="-1"`).
- `disabled` → không có `href`, `aria-disabled="true"`, `tabindex="-1"` (ra khỏi thứ tự Tab); td.css tô như nút
  disabled.
- `loading` → không có `href`, `aria-busy="true"`, `aria-disabled="true"`, `tabindex="0"` (vẫn focus được), spinner hiện.
- `type`, `name`, `value` không áp cho link.

`td_link($label, $href, $opts)` = `td_button($label, $opts + href)` với `variant` mặc định **`ghost`** (link trông như
nút trong suốt chữ màu accent). Muốn link trông như nút đặc: `td_link('Cuộn mới', '/admin/rolls/new',
['variant' => 'primary', 'icon' => 'plus'])`.

**Link không mang kiểu nút** (`'bare' => true`, 0.18.0 — chỉ cho `td_link`): in `<a>` với **chỉ** class của site,
nội dung là nhãn đã escape, không `td-btn…`, không icon/spinner. Vẫn qua cùng whitelist URL, `target` (+ `rel`),
`download`, `disabled` (URL bị chặn / `disabled` → không `href`, `aria-disabled`); `variant`, `size`, `full_width`,
`icon`, `loading` bị bỏ qua.

```php
<?= td_link('Tài liệu', '/docs', ['bare' => true, 'class' => 'nav-link']) ?>
<!-- <a class="nav-link" href="/docs">Tài liệu</a> -->
```

## td_field

```php
<?= td_field('username', '', ['label' => 'Tên đăng nhập', 'autocomplete' => 'username', 'required' => true, 'autofocus' => true]) ?>
<?= td_field('password', '', ['label' => 'Mật khẩu', 'type' => 'password', 'autocomplete' => 'current-password', 'required' => true]) ?>
<?= td_field('story', $story, ['label' => 'Câu chuyện', 'type' => 'textarea', 'rows' => 8, 'max_length' => 20000, 'hint' => 'văn bản thuần']) ?>
<?= td_field('b_month', '', ['label' => 'Tháng', 'type' => 'month']) ?>
<?= td_field('email', $old['email'] ?? '', ['label' => 'Email', 'type' => 'email', 'error' => $errors['email'] ?? '']) ?>
```

| Option | Ý nghĩa |
|---|---|
| `label` | nhãn (`label.td-field__label[for]`); `required` thêm dấu `*` |
| `type` | `text` `password` `email` `number` `date` `month` `datetime-local` `time` `search` `url` `tel` `textarea` (khác → `text`). Là type **native** thật (email/url/number được trình duyệt validate) |
| `size` | `sm` `md` `lg` (mặc định `md`) |
| `placeholder`, `required`, `disabled`, `readonly` | như native (`required` thêm `aria-required="true"`) |
| `max_length` (hoặc `maxlength`), `minlength`, `pattern`, `min`, `max`, `step` | ràng buộc native |
| `rows` | số dòng textarea (mặc định 3) |
| `hint` | ghi chú dưới ô (`.td-field__note`, nối vào `aria-describedby`) |
| `error` | lỗi từ server: `span.td-field-error` + `aria-invalid="true"` + `aria-errormessage` + `aria-describedby` |
| `autocomplete` | token list `[a-z0-9 -]` (ví dụ `current-password`, `new-password`, `username`, `one-time-code`); khác → bỏ |
| `inputmode` | `none` `text` `decimal` `numeric` `tel` `search` `email` `url` |
| `enterkeyhint` | `enter` `done` `go` `next` `previous` `search` `send` |
| `autocapitalize` | `off` `none` `on` `sentences` `words` `characters` |
| `spellcheck` | `true` / `false` |
| `autofocus` | `true` → attribute `autofocus` |
| `id` | id của wrapper; control = `{id}-control`, nhãn `{id}-label`, ghi chú `{id}-note`, lỗi `{id}-error` |
| `class` | class thêm trên wrapper `.td-field` |
| `attrs` | attribute thêm trên **control** |

Sáu thuộc tính `autocomplete` … `autofocus` truyền qua `attrs` (kiểu 135: `'attrs' => ['inputmode' => 'numeric']`)
cũng đi qua cùng whitelist; option cùng tên thắng `attrs`.

Markup (khớp hợp đồng `<td-input-field>`, không có bộ đếm vì không có JS):

```html
<div class="td-field td-field--md" id="f-password-2">
  <label class="td-field__label" id="f-password-2-label" for="f-password-2-control">Mật khẩu<span class="td-field__required" aria-hidden="true"> *</span></label>
  <input type="password" class="td-field__control" id="f-password-2-control" name="password" required aria-required="true" autocomplete="current-password" value="">
  <div class="td-field__footer" hidden><div class="td-field__note" id="f-password-2-note" hidden></div></div>
</div>
```

Lỗi validate sau POST (không AJAX): render lại với `value` cũ và `error`. Muốn lỗi hiện/ẩn động phía client, dùng
`TdFormValidation` (nó xử lý cả control native — xem [Form validation](../components/form-validation.md)) hoặc
`<td-input-field>`.

Đừng echo lại mật khẩu vào `value` sau POST.

## td_dropdown

```php
<?= td_dropdown('film_id', $films, $roll['film_id'] ?? '', ['label' => 'Film', 'placeholder' => '— chưa chọn —']) ?>
<?= td_dropdown('role', ['user' => 'Người dùng', 'admin' => 'Quản trị'], 'user', ['label' => 'Vai trò', 'required' => true]) ?>
<?= td_dropdown('size', [
    ['value' => 's', 'label' => 'Nhỏ'],
    ['value' => 'xl', 'label' => 'Rất lớn (hết hàng)', 'disabled' => true],
], 's', ['label' => 'Cỡ']) ?>
```

`$options`: `value => label`, hoặc danh sách `['value' => …, 'label' => …, 'disabled' => bool]`. `$value` được so sánh
dạng chuỗi với value của option; khớp → `selected`.

| Option | Ý nghĩa |
|---|---|
| `label` | nhãn: in `<label for="{id}-select">` cho bản không JS **và** attribute `label` trên host (component tự vẽ nhãn khi upgrade) |
| `placeholder` | thêm `<option value="">placeholder</option>` đầu tiên (được phép để trống) + attribute `placeholder` trên host; không có placeholder → `allow-clear="false"` |
| `searchable` | không truyền / `null` → tự bật khi > 8 option. **Tắt**: `false`, `0` và chuỗi `'false'` `'0'` `'off'` `'no'` `''` (bỏ khoảng trắng, không phân biệt hoa thường — 0.18.0, tiện khi giá trị đến từ config/DB). Mọi giá trị khác theo truthiness của PHP (`true`, `1`, `'1'`, `'true'`, `'yes'`, `'on'`… → bật) |
| `required`, `disabled`, `aria_label` | đặt trên `<select>` (component lấy lại khi upgrade) |
| `id` | id host; select = `{id}-select` |
| `class`, `attrs` | trên host `<td-dropdown>` |

Markup:

```html
<td-dropdown id="dd-role-3" label="Vai trò" searchable="false" allow-clear="false">
  <label class="td-field__label" for="dd-role-3-select">Vai trò<span class="td-field__required" aria-hidden="true"> *</span></label>
  <select id="dd-role-3-select" name="role" required>
    <option value="user" selected>Người dùng</option><option value="admin">Quản trị</option>
  </select>
</td-dropdown>
```

- **Không JS**: `<td-dropdown>` chỉ là thẻ lạ `display: block`; select native chạy, submit `role=user`.
- **Nạp `@dazzxq/td-components/dropdown`**: component đọc `<option>` thành `options`, lấy lựa chọn **sống** của select
  (kể cả khi người dùng đã đổi trước khi JS tới), lấy `name`/`required`/`disabled` từ select, rồi gỡ select (component
  form-associated thay nó — không submit trùng). Giá trị khi reset form = option `selected` trong HTML. `name` và
  `required` nằm trên select, **không** trên host, nên không có gì trùng. Chi tiết: [Dropdown](../components/dropdown.md).
- Option `value=""` **đứng đầu** (placeholder của `td_dropdown`) **không** thành mục sau upgrade: nó thành
  `placeholder` của component và trạng thái "chưa chọn" (không gửi giá trị, `required` báo thiếu). Chỉ option
  `value=""` **không đứng đầu** mới là một mục chọn được (gửi `''`, thoả `required` — như `<select>` native). Nút
  "Không chọn" (`allow-clear`) xoá hẳn lựa chọn.
- Không cần khối JSON `options` + script gán `el.options` như cách cũ.

## td_toggle và td_checkbox

```php
<?= td_toggle('allow_dl_orig', !empty($roll['allow_dl_orig']), 'Cho tải bản gốc') ?>
<?= td_checkbox('agree', false, 'Tôi đồng ý điều khoản', ['required' => true]) ?>
<?= td_checkbox('', false, '', ['size' => 'sm', 'class' => 'td-frame-check', 'input_attrs' => ['aria-label' => 'Chọn khung 3', 'data-frame-check' => '1']]) ?>
```

| Option | Ý nghĩa |
|---|---|
| `size` | `sm` `md` `lg` (mặc định `md`; luôn in class `td-switch--{size}` / `td-checkbox--{size}` như component) |
| `value` | giá trị gửi khi bật. **Không truyền → không có attribute `value`, trình duyệt gửi `on`** (giống `<td-toggle>`/`<td-checkbox>`) |
| `required`, `disabled` | native trên input |
| `id` | id của **input** |
| `aria_label` | tên truy cập khi không có `$label` |
| `class`, `attrs` | trên `<label>` bao ngoài |
| `input_attrs` | attribute thêm trên `<input>` |

`$name = ''` → không có `name` (checkbox chỉ dùng cho JS, như ô chọn khung của 135).

Markup switch (`input` native ẩn thị giác, nhận focus/Space/label):

```html
<label class="td-switch td-switch--md">
  <input type="checkbox" role="switch" class="td-switch__input" name="wifi" checked>
  <span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">
    <span class="td-switch__icon td-switch__icon--off"><svg class="td-icon td-icon--m" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
    <span class="td-switch__icon td-switch__icon--on"><svg class="td-icon td-icon--m" data-icon="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg></span>
  </span></span>
  <span class="td-switch__label">Wifi</span>
</label>
```

## td_icon và icon riêng của site

```php
<?= td_icon('download') ?>                       <!-- trang trí: aria-hidden -->
<?= td_icon('info', 'l', 'Thông tin') ?>         <!-- có nghĩa: role="img" + aria-label + <title> -->
<?= TdComponents\Td::icon('check', 'm', '', 'my-class') ?>
```

- Kích thước `s` `m` `l` (khác → `m`). Tên lạ → chuỗi rỗng (không lỗi).
- Hình lấy **đầy đủ** từ `src/icons/icons.json` — cùng markup với `tdIcon()` của JS (không phải slot rỗng
  `data-td-icon`). Vì thế icon trong markup SSR **không** bị `fillIconSlots()` ghi đè.
- Tên cũ của kit 135 được map khi tên đó không tồn tại: `x`→`close`, `chevron-left/right/up/down`→`prev/next/up/down`,
  `ellipsis`→`more`, `external-link`→`external`, `expand`→`fullscreen`, `pen`→`pencil`. Bảng alias nằm trong object
  `aliases` của `src/icons/icons.json` (0.18.0 — JS `tdIcon()` đọc cùng bảng); icons.json cũ chưa có `aliases` thì
  adapter dùng bảng dự phòng trong `td.php`. `Td::iconAliases()` trả bảng đang dùng.

Icon riêng của site: đăng ký **dữ liệu** (không phải chuỗi SVG), cùng luật với `registerIcons()` của JS:

```php
TdComponents\Td::registerIcons(json_decode(file_get_contents(ROOT . '/data/icons-site.json'), true, 32, JSON_THROW_ON_ERROR)['icons']);
// { "site-film": { "viewBox": "0 0 24 24", "paint": "stroke", "nodes": [["rect", {"x": "3", "y": "3", "width": "18", "height": "18", "rx": "2"}]] } }
```

- Tên `[a-z][a-z0-9-]{0,63}`; trùng tên core hoặc đã đăng ký → `InvalidArgumentException` (đặt tiền tố `site-`).
- Chỉ các thẻ `path circle rect line polyline polygon ellipse` và attribute hình học (`d`, `points`, `cx`…) với giá trị
  đúng định dạng; còn lại → `InvalidArgumentException`. Tối đa 64 hình.
- JS cũng cần icon đó (ví dụ trong `TdMenu`)? In dữ liệu ra trang rồi đăng ký bên JS:

```php
<script type="application/json" id="site-icons"><?= json_encode(TdComponents\Td::siteIcons(), TdComponents\Td::JSON_FLAGS) ?></script>
```

```js
import { registerIcons } from '@dazzxq/td-components/icons';
registerIcons(JSON.parse(document.getElementById('site-icons').textContent));
```

## td_badge và td_alert

```php
<?= td_badge('Đã duyệt', ['variant' => 'success']) ?>
<?= td_badge('Nháp', ['variant' => 'warning', 'stamp' => true]) ?>
<?= td_alert($flash['message'], ['variant' => $flash['type'], 'heading' => $flash['title'] ?? null, 'dismissible' => true]) ?>
```

`td_badge($text, $opts)` — `span.td-badge` **thuần CSS** ([Badge](../components/badge.md)):

| Option | Ý nghĩa |
|---|---|
| `variant` | `neutral` `accent` `success` `warning` `danger` `info` (mặc định `neutral`) |
| `outline` | `true` → `td-badge--outline` |
| `stamp` | `true` → `td-badge--stamp` (con dấu: in hoa, viền đôi, nghiêng) |
| `id`, `class`, `attrs` | trên `<span>` |

`td_alert($message, $opts)` — **một hợp đồng SSR duy nhất** ([Alert](../components/alert.md)): luôn in host
`<td-alert>` chứa sẵn khối `div.td-alert` đầy đủ. `td.css` tạo dáng ngay (flash hiện được khi chưa có / không có JS);
nạp `@dazzxq/td-components/alert` thì phần tử **nâng cấp tại chỗ** (giữ nguyên chữ) và gắn nút đóng nếu `dismissible`.
Không JS thì không có nút đóng.

| Option | Ý nghĩa |
|---|---|
| `variant` | `info` `success` `warning` `danger` (mặc định `info`; `danger` → `role="alert"`, còn lại `role="status"`) |
| `heading` | tiêu đề (chữ; rỗng → không có) |
| `dismissible` | `true` → attribute `dismissible` (nút đóng khi có JS) |
| `id`, `class`, `attrs` | trên host `<td-alert>` |

`$message` là **chữ** (escape). Cần link trong thông báo thì viết `<td-alert>` bằng tay với markup của trang.

```html
<td-alert variant="success" dismissible heading="Thành công">
  <div class="td-alert td-alert--success" role="status">
    <span class="td-alert__icon" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="success" …>…</svg></span>
    <div class="td-alert__body"><p class="td-alert__heading">Thành công</p><div class="td-alert__message">Đã lưu thay đổi.</div></div>
  </div>
</td-alert>
```

## An toàn: escape và whitelist

- **Mọi giá trị** (nhãn, value, id, placeholder, tooltip, URL, nonce…) qua
  `htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')` và luôn nằm trong nháy kép. Truyền chuỗi **thô**, đừng
  escape trước (sẽ bị escape hai lần: `&amp;amp;`).
- **Tên attribute** trong `attrs` / `input_attrs` — **danh sách cho phép** (0.17.0): `aria-*`, `data-*`, và `id`,
  `title`, `lang`, `dir`, `role`, `tabindex`, `hidden`, `translate`, `accesskey`, `autofocus`, `autocomplete`,
  `inputmode`, `enterkeyhint`, `autocapitalize`, `spellcheck`, `placeholder`, `readonly`, `required`, `disabled`,
  `maxlength`, `minlength`, `min`, `max`, `step`, `pattern`, `size`, `rows`, `cols`. Mọi tên khác bị bỏ im lặng —
  gồm event handler `on*`, `style`, thuộc tính mang URL, và thuộc tính **đổi hành vi form** (`form`, `formmethod`,
  `formenctype`, `formtarget`, `formnovalidate`, `formaction`, `dirname`, `popovertarget`, `commandfor`) vì chúng có
  thể làm lộ mật khẩu qua URL (`formmethod="get"`) hay gắn nút vào form khác. Cần một thuộc tính ngoài danh sách thì
  in markup riêng. URL chỉ vào qua option có kiểm tra (`href` của `td_button`/`td_link`).
- **URL** (`href`): whitelist `https:` `mailto:` `tel:` + tương đối + `#` (`http:` chỉ với `Td::allowHttpLinks(true)`); tab/xuống dòng bị bỏ và khoảng trắng
  đầu/cuối bị cắt trước khi kiểm tra (như trình duyệt), nên `java\tscript:` hay ` javascript:` cũng bị chặn.
- **Class**: chỉ token `[A-Za-z_][A-Za-z0-9_-]*`.
- **JSON** (import map, icon cho JS): cờ `JSON_HEX_*`.
- Giá trị enum (variant, size, type, target, inputmode…) ngoài whitelist → mặc định, không bao giờ in nguyên văn.

Adapter **không** thay được kiểm tra phía server: `pattern`/`required`/`min` chỉ là UX, endpoint vẫn phải validate;
`disabled` không phải phân quyền. Xem [Bảo mật](security.md).

## Chuyển từ adapter riêng của 135

135 đang có `src/Ui/Td.php` + `src/Ui/markup.php` (adapter tham chiếu). Kit giờ ship adapter chính thức cùng tên hàm
và option, nên:

1. Vendor bản kit mới (có `php/td.php`) vào thư mục phiên bản mới.
2. **Xoá** `require` tới `src/Ui/markup.php` (khai báo lại `td_button`… sẽ gây lỗi fatal "Cannot redeclare").
   Thay bằng `require_once {kit}/php/td.php` + `TdComponents\Td::configure(...)` trong bootstrap.
3. Import map: thay `T135\Ui\Td::importMap()` bằng `td_import_map_tag(['dompurify' => …, /* module app */], $nonce)`
   (hoặc `td_import_map([...])` nếu 135 tự gộp vào `$importMap`).
4. Icon riêng của 135 (`data/icons-135.json`): `TdComponents\Td::registerIcons($json['icons'])` — icon nào đã có
   trong core (ví dụ các icon CMS mới của 0.17.0) phải **bỏ khỏi** file của 135, nếu không sẽ báo trùng tên.
5. `td_dropdown` không còn cần `td-boot.js` gán `options` từ khối JSON: bỏ đoạn đó, chỉ cần import
   `@dazzxq/td-components/dropdown`.

Khác biệt hành vi so với `markup.php` của 135 (cố ý):

| 135 | Adapter chính thức |
|---|---|
| `variant => 'ghost'` bị map sang `secondary` | `ghost` thật (`td-btn--ghost`) |
| `td_link` in `a.td-link-action` (class của 135) | `td_link` = nút link `a.td-btn` (mặc định ghost). Giữ giao diện cũ: `['bare' => true, 'class' => 'td-link-action']` (0.18.0) → `<a>` chỉ có class của 135, không kiểu nút |
| `td_button` không có `href` | `href` → `<a class="td-btn">` (whitelist URL, `target`, `download`, trạng thái disabled/loading) |
| `td_toggle` mặc định `value="1"` | không có `value` → gửi `on` như `<td-toggle>`. Server kiểm `!empty($_POST['x'])` vẫn đúng; code so `=== '1'` thì truyền `'value' => '1'` |
| `td_toggle` không có class `td-switch--md` | luôn có class kích thước như component |
| `td_dropdown` in host rỗng + JSON | host bọc `<select>` native, chạy cả khi không JS |
| loading: `disabled` + `aria-busy` | thêm `aria-disabled="true"` (hợp đồng component) |
| `class` chỉ nhận token `td-…` | nhận mọi token class hợp lệ |
| hàm `h()` toàn cục của site | adapter không dùng/khai báo `h()`; `TdComponents\Td::e()` nếu cần |
| footer `.td-field` rỗng khi không có ghi chú | luôn có `.td-field__note` (ẩn khi rỗng) — cùng cây DOM với component |
| `inputmode`… qua `attrs` in nguyên văn | đi qua whitelist E1 (giá trị lạ bị bỏ) |

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `Cannot redeclare td_button()` | còn nạp `markup.php` cũ (hoặc file kit bị `require` hai lần bằng `require`) | bỏ file cũ, dùng `require_once` |
| `LogicException: Td::configure…` | gọi `td_import_map*` / `td_stylesheet_tag` trước `configure()` | gọi `configure()` trong bootstrap |
| `InvalidArgumentException … kit specifier` | `$extra` có key trùng module của kit | đổi tên key của site, hoặc bỏ entry đó |
| `href` biến mất trên nút link | URL bị whitelist chặn (`javascript:`, `data:`, `blob:`…), hoặc nút `disabled`/`loading` | dùng URL http(s)/tương đối |
| attribute trong `attrs` không được in | tên không có trong danh sách cho phép (`on*`, `style`, `href`, `form*`…) hoặc trùng attribute helper đã in | dùng option tương ứng; event handler gắn trong module JS |
| Icon không hiện | tên sai / icon site chưa `registerIcons` | kiểm `TdComponents\Td::hasIcon('…')` |
| `Failed to load module script … MIME type "application/octet-stream"` (hoặc rỗng) | server không map đuôi `.mjs` (nginx cũ) / `.js` sang JavaScript; `X-Content-Type-Options: nosniff` khiến trình duyệt chặn | nginx: `types { text/javascript mjs; }` trong `http { }` ngay sau `include mime.types;` — Apache: `AddType text/javascript .js .mjs` ([chi tiết](wordpress-php.md#mime-của-module-js)) |
| Flash `td_alert` không có nút đóng | chưa nạp `@dazzxq/td-components/alert` (cố ý: không JS thì không có nút chết) | import module `alert` |
| Dropdown không đổi thành component | chưa import `@dazzxq/td-components/dropdown`, hoặc select có `multiple` (không upgrade) | import module; `multiple` giữ select native |

## Xem thêm

- [WordPress & PHP](wordpress-php.md) — vendor kit, phiên bản trong đường dẫn, WordPress Script Modules, CSP.
- [Button](../components/button.md) · [Input field](../components/input-field.md) ·
  [Dropdown](../components/dropdown.md) · [Checkbox](../components/checkbox.md) · [Toggle](../components/toggle.md) ·
  [Icons](../components/icons.md) · [Badge](../components/badge.md) · [Alert](../components/alert.md)
- [Bảo mật](security.md) · [CSP](csp.md) · [Form](forms.md)
