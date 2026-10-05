[Tài liệu](../README.md) › Hướng dẫn › Adapter PHP

# Adapter PHP chính thức (`php/td.php`)

`php/td.php` là **một file PHP thuần** ship kèm gói (thư mục `php/` trong `npm pack`). Nó làm ba việc cho site PHP
(135, dwp, site sau này):

1. In `<link>` tới `td.css` và **import map** sinh từ `exports` của `package.json` đã vendor.
2. In **markup phía server** (SSR) đúng hợp đồng DOM của component: nút, nút dạng link, ô nhập, dropdown, switch,
   checkbox, icon, badge, khối thông báo (alert), empty state, ô mã OTP, nút copy, ô chọn ảnh (media field, 0.32.0).
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
  - [Chế độ element: SSR + hydrate tại chỗ (0.25.0)](#chế-độ-element-ssr--hydrate-tại-chỗ-0250)
- [td_field](#td_field)
  - [td_field ở chế độ element (0.26.0)](#td_field-ở-chế-độ-element-0260)
- [td_dropdown](#td_dropdown)
  - [td_dropdown ở chế độ element: vỏ không xô lệch (0.26.0)](#td_dropdown-ở-chế-độ-element-vỏ-không-xô-lệch-0260)
- [td_toggle và td_checkbox](#td_toggle-và-td_checkbox)
  - [td_toggle / td_checkbox ở chế độ element (0.26.0)](#td_toggle--td_checkbox-ở-chế-độ-element-0260)
- [td_icon và icon riêng của site](#td_icon-và-icon-riêng-của-site)
- [td_badge và td_alert](#td_badge-và-td_alert)
- [td_empty (0.26.0)](#td_empty-0260)
- [td_otp_input (0.27.0)](#td_otp_input-0270)
- [td_copy (0.27.0)](#td_copy-0270)
- [td_multiselect (0.28.0)](#td_multiselect-0280)
- [td_tree_select (0.29.0)](#td_tree_select-0290)
- [td_number_input (0.30.0)](#td_number_input-0300)
- [td_masked_value (0.31.0)](#td_masked_value-0310)
- [td_media_field (0.32.0)](#td_media_field-0320)
- [td_scan_input (0.38.0)](#td_scan_input-0380)
- [td_filter_chips (0.39.0)](#td_filter_chips-0390)
- [td_datetime_range (0.40.0)](#td_datetime_range-0400)
- [An toàn: escape và whitelist](#an-toàn-escape-và-whitelist)
- [Chuyển từ adapter riêng của 135](#chuyển-từ-adapter-riêng-của-135)
- [Lỗi thường gặp](#lỗi-thường-gặp)

## Khi nào dùng helper, khi nào dùng `<td-*>`

Đây là quyết định quan trọng nhất, nên nói rõ trước:

| Helper | In ra | Cần JS? | Upgrade? |
|---|---|---|---|
| `td_button`, `td_link` | `<button class="td-btn …">` / `<a class="td-btn …">` **native** (mặc định) | Không | Không |
| `td_button`, `td_link` — **chế độ element** (0.25.0, tự bật) | host `<td-button data-td-ssr="button@1">` chứa sẵn đúng control trên | Không (control native chạy ngay) | **Có** — nạp module `button`: nhận markup **tại chỗ**, không nháy |
| `td_field` | `div.td-field` + `input` / `textarea.td-field__control` **native** | Không | Không |
| `td_field` — **chế độ element** (0.26.0, tự bật) | host `<td-input-field data-td-ssr="input-field@1">` chứa sẵn đúng cây `.td-field` của component, control native giữ `name` / ràng buộc | Không (form native chạy ngay) | **Có** — nạp module `input-field`: nhận markup **tại chỗ**, giữ chữ đang gõ |
| `td_checkbox` | `label.td-checkbox` + `input.td-checkbox__input` **native** | Không | Không |
| `td_toggle` | `label.td-switch` + `input[role=switch]` **native** | Không | Không |
| `td_toggle`, `td_checkbox` — **chế độ element** (0.26.0, tự bật) | host `<td-toggle data-td-ssr="toggle@1">` / `<td-checkbox data-td-ssr="checkbox@1">` chứa sẵn đúng markup component | Không | **Có** — nạp module `toggle` / `checkbox`: nhận tại chỗ, giữ trạng thái tích |
| `td_dropdown` | host `<td-dropdown>` bọc `<select>` **native** | Không (chạy như select) | **Có** — khi nạp module dropdown |
| `td_dropdown` — **chế độ element** (0.26.0, tự bật) | như trên + dấu `data-td-ssr="dropdown@1"` + `select.td-dropdown__native` đã tạo dáng **đúng hộp trigger** | Không | **Có** — nâng cấp select → trigger **không xô lệch**; select đang focus thì đợi blur |
| `td_empty` (0.26.0) | **luôn** host `<td-empty-state data-td-ssr="empty-state@1">` chứa sẵn đúng cây component (icon, tiêu đề, lời nhắn, nút hành động) | Không (link hành động bấm được) | **Có** — nạp module `empty-state`: nhận **tại chỗ**, không nháy |
| `td_otp_input` (0.27.0) | `div.td-otp` + `input.td-otp__input` **native** (`maxlength="6"`, `pattern="[0-9]{6}"`, `autocomplete="one-time-code"`) | Không | Không |
| `td_otp_input` — **chế độ element** (0.27.0, tự bật) | host `<td-otp-input data-td-ssr="otp-input@1">` chứa sẵn cùng input + 6 ô trang trí | Không (input native chạy ngay) | **Có** — nạp module `otp-input`: nhận **tại chỗ**, giữ mã đang gõ |
| `td_number_input` (0.30.0) | `div.td-field.td-number` + `input.td-number__control` **native** `type=number` (giá trị chuẩn, `min` ngầm `0`, `step` theo `decimals`) | Không | Không |
| `td_number_input` — **chế độ element** (0.30.0, tự bật) | host `<td-number-input data-td-ssr="number-input@1">` chứa sẵn cùng cây | Không (input native chạy ngay, gửi số sạch) | **Có** — nạp module `number-input`: nhận **tại chỗ**, hiện `12.990.000` |
| `td_masked_value` (0.31.0) | **luôn** host `<td-masked-value data-td-ssr="masked-value@1">` chứa chuỗi che + nút toggle + live region — **không bao giờ** giá trị thật | Không (chưa có JS: chỉ thấy chuỗi che, nút ẩn) | **Có** — nạp module `masked-value`: nhận **tại chỗ** |
| `td_media_field` (0.32.0) | **luôn** host `<td-media-field data-td-ssr="media-field@1">` chứa sẵn khung (tỉ lệ bằng SVG sizer), ảnh xem trước, nút mở / Đổi / Gỡ + **hidden input** gửi `assetId` (và ô alt / crop ở chế độ usage) | Không (form gửi đúng hình dạng; chưa có JS thì nút ẩn, giữ chỗ) | **Có** — nạp module `media-field`: nhận **tại chỗ**, gỡ hidden input |
| `td_media_gallery` (0.43.0) | **luôn** host `<td-media-gallery data-td-ssr="media-gallery@1">` chứa sẵn lưới ô (tỉ lệ bằng SVG sizer), ảnh, tay nắm / Cắt / Gỡ, nút Thêm + **hidden input** gửi danh sách (`name[]` / `name[i][…]`, ô alt có `name`) | Không (form gửi đúng hình dạng theo thứ tự server in; chưa có JS thì nút ẩn, giữ chỗ) | **Có** — nạp module `media-gallery`: nhận **tại chỗ**, gỡ hidden input |
| `td_scan_input` (0.38.0) | `div.td-scan` + `input.td-scan__input` **native** (`autocomplete="off"`, `enterkeyhint="done"`…) | Không (Enter submit form) | Không |
| `td_scan_input` — **chế độ element** (0.38.0, tự bật) / **`multiple`** (luôn element) | host `<td-scan-input data-td-ssr="scan-input@1">` + cùng input; `multiple`: + `textarea` nhập tay + danh sách + một **hidden input** mỗi mã | Không (form gửi mã in sẵn + dòng textarea) | **Có** — nạp module `scan-input`: nhận **tại chỗ**, gỡ hidden / textarea, dòng textarea qua `validate` |
| `td_filter_chips` (0.39.0) | **luôn** host `<td-filter-chips data-td-ssr="filter-chips@1">` chứa sẵn đúng cây component (nhóm, mỗi chip một `li` với nhãn / giá trị / ×, "Xoá tất cả", live region) | Không (× có `href` là **link** chạy ngay; × không link thì vô hình, giữ chỗ) | **Có** — nạp module `filter-chips`: nhận **tại chỗ** |
| `td_steps` (0.45.0) | **luôn** host `<td-steps data-td-ssr="steps@1">` chứa sẵn đúng cây component (mỗi bước một `li` với marker / nhãn / chữ trạng thái / mô tả, dòng tóm tắt) | Không (bước có `href` là **link**; bước bấm được không link in như bước thường) | **Có** — nạp module `steps`: nhận **tại chỗ** |
| `td_timeline` (0.45.0) | **luôn** host `<td-timeline data-td-ssr="timeline@1" time-zone="…">` chứa sẵn nhóm ngày, mục, `<details>` chi tiết, "Xem thêm" (link) | Không (chi tiết mở bằng `<details>`, "Xem thêm" là link `more_href`) | **Có** — nạp module `timeline`: nhận **tại chỗ** (tính lại chữ nhãn ngày) |
| `td_datetime_range` (0.40.0) | **luôn** host `<td-datetime-range data-td-ssr="datetime-range@1">` + hai `<input type="date\|datetime-local">` **native** (`{name}[start]` / `{name}[end]`, `min` / `max`, `required` theo mốc) + trigger ẩn | Không (hai ô ngày native chạy ngay) | **Có** — nạp module `datetime-range`: nhận **tại chỗ**, giữ giá trị đã sửa, gỡ ô native |
| `td_diff` / `td_diff_snapshots` (0.46.0) | **luôn** host `<td-diff data-td-ssr="diff@1">` chứa sẵn bảng so sánh đầy đủ (hàng không đổi / JSON / giá trị dài là `<details>` native) | Không (đọc được ngay, `<details>` mở được không cần JS) | **Có** — nạp module `diff`: nhận **tại chỗ** (không đọc dữ liệu ngược từ DOM) |
| `td_copy` (0.27.0) | **luôn** host `<td-copy data-td-ssr="copy@1">` chứa nguồn `<code>` + nút icon + live region | Không (chưa có JS: hiện mã để bôi đen, ẩn nút) | **Có** — nạp module `copy`: nhận **tại chỗ** |
| `td_icon` | `svg.td-icon` đủ hình (có `viewBox`) | Không | — |
| `td_badge` | `span.td-badge…` (thuần CSS) | Không | — |
| `td_alert` | host `<td-alert>` chứa sẵn khối `div.td-alert` đầy đủ | Không (có dáng ngay) | **Có** — nạp module `alert`: nâng cấp tại chỗ + nút đóng |

- Bốn helper đầu in **control native đứng riêng** mang đúng class BEM của component. `td.css` tạo dáng giống hệt
  component (có test so computed style), còn submit, `required`, `pattern`, `min`/`max`, `type=month`,
  `type=datetime-local`, nút submit có `name`/`value`… là **của trình duyệt**. Không cần JS, không có bước upgrade.
- Cần hành vi JS (nút `loading`/`run()`, bộ đếm ký tự, lỗi validate cập nhật động, `setError()`, toggle
  `controlled`/`commit()`…) → viết thẳng custom element `<td-button>`, `<td-input-field>`, `<td-checkbox>`,
  `<td-toggle>` trong template (xem trang từng component). Helper **không** in custom element cho các control này —
  **trừ** ở [chế độ element](#chế-độ-element-ssr--hydrate-tại-chỗ-0250): `td_button` / `td_link` (0.25.0) và
  `td_field` / `td_toggle` / `td_checkbox` (0.26.0). Khi bật, helper in host `<td-*>` kèm markup đầy đủ, nên vừa có
  control native khi chưa có JS (submit, validate, trình quản lý mật khẩu), vừa có hành vi component khi module đã
  nạp — không còn "nháy" như khi viết tay `<td-button>Nhãn</td-button>` / `<td-input-field>` rỗng.
- `td_dropdown` luôn upgrade (cả native mode): không có JS thì `<select>` hoạt động bình thường; nạp
  `@dazzxq/td-components/dropdown` thì component đọc `<option>` rồi thay select (xem [td_dropdown](#td_dropdown)).
  Chế độ element (0.26.0) tạo dáng select đúng hộp trigger nên lúc thay **không xô lệch**.
- `td_empty` (0.26.0) luôn in `<td-empty-state>` kèm markup đầy đủ (xem [td_empty](#td_empty-0260)).
- `td_otp_input` (0.27.0) mặc định in ô nhập native; chế độ element in `<td-otp-input>` (xem
  [td_otp_input](#td_otp_input-0270)). `td_copy` (0.27.0) luôn in `<td-copy>` (xem [td_copy](#td_copy-0270)).
- `td_media_field` (0.32.0) luôn in `<td-media-field>` — không có control native tương đương (xem
  [td_media_field](#td_media_field-0320)); `ssr_elements` / `element` không áp dụng.
- `td_media_gallery` (0.43.0) luôn in `<td-media-gallery>` (xem [td_media_gallery](#td_media_gallery-0430)).

## Cài đặt và cấu hình

File nằm trong thư mục kit đã vendor (có phiên bản trong đường dẫn):

```text
public/assets/vendor/td-components/0.45.0/
  td.css  index.js  package.json  src/  php/td.php  THIRD_PARTY_NOTICES.md
```

Nạp **một lần** trong bootstrap của site, rồi cấu hình:

```php
<?php
const TD_VERSION = '0.45.0';
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
- Không gọi `configure()` thì icon và markup vẫn chạy (kit mặc định là thư mục chứa `php/`), nhưng `td_import_map*`,
  `td_stylesheet_tag` và `Td::modulePreloads` ném `LogicException` (chúng cần URL).
- Tham số thứ ba (0.25.0, tuỳ chọn) — mảng option toàn cục:

  ```php
  TdComponents\Td::configure($baseUrl, $tdDir, ['ssr_elements' => true]);
  ```

  | Option | Kiểu | Mặc định | Ý nghĩa |
  |---|---|---|---|
  | `ssr_elements` | `bool` | `false` | `td_button` / `td_link` (không `bare`) — từ 0.26.0 cả `td_field` / `td_toggle` / `td_checkbox` / `td_dropdown`, từ 0.27.0 cả `td_otp_input`, từ 0.30.0 cả `td_number_input`, từ 0.38.0 cả `td_scan_input` (đơn) — in [chế độ element](#chế-độ-element-ssr--hydrate-tại-chỗ-0250) cho **mọi** lần gọi; option `element` của từng lần gọi vẫn ghi đè |

  > **Nâng từ 0.25 lên 0.26 mà đã bật `ssr_elements`:** từ 0.26.0 cờ này áp thêm cho `td_field` / `td_toggle` /
  > `td_checkbox` (đúng hợp đồng ADR 0012: cờ toàn cục áp cho mọi helper **đã có** hợp đồng trong bản đó). Markup đổi
  > theo (host `<td-input-field>`…, `id` thành id của **control**, `class` lên host) — đọc
  > [td_field ở chế độ element](#td_field-ở-chế-độ-element-0260) trước khi nâng; muốn giữ native cho từng lần gọi thì
  > truyền `'element' => false`.

  Key lạ (gõ nhầm `ssr_element`…) hoặc giá trị không phải `bool` → `InvalidArgumentException` (không im lặng bỏ qua).
  Mỗi lần gọi lại `configure()` đặt lại option theo tham số mới (không truyền → `false`). `Td::ssrElements()` trả giá
  trị hiện tại.

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
| `Td::modulePreloads(array $names, ?string $nonce = null): string` (0.25.0) | `<link rel="modulepreload" href="…">` cho từng module kit trong `$names` |

### Thứ tự nạp và `Td::modulePreloads` (0.25.0)

Thứ tự khuyến nghị trong `<head>` — **stylesheet → import map → modulepreload → entry module của site**:

```php
<head>
  <?= td_stylesheet_tag($nonce) ?>                                  <!-- 1. CSS: control SSR có dáng ngay -->
  <?= td_import_map_tag(['app/' => '/assets/app/'], $nonce) ?>      <!-- 2. một import map, trước mọi module -->
  <?= TdComponents\Td::modulePreloads(['button', 'alert', 'dropdown'], $nonce) ?> <!-- 3. tải sớm module có trên trang -->
  <script type="module" src="/assets/app/boot.js" nonce="<?= htmlspecialchars($nonce) ?>"></script> <!-- 4. entry -->
</head>
```

- `$names`: tên export ngắn (`'button'`, `'icons'`, `'form-element'`…) **hoặc** specifier đầy đủ
  (`'@dazzxq/td-components/button'`). Mỗi tên được phân giải qua **cùng** bản đồ của `Td::importMap()` (đúng phiên bản
  đã `configure`), nên URL preload luôn trùng URL module thật (không tải hai lần).
- Trùng tên → in một lần (giữ thứ tự gặp đầu). Mảng rỗng → chuỗi rỗng.
- Tên không phải module JS của kit (`'td.css'`, `'app'`, gõ nhầm…), tên rỗng hoặc không phải chuỗi →
  `InvalidArgumentException`.
- `href` và nonce được escape. Với CSP nonce, truyền cùng `$nonce` như các thẻ khác.
- Đây chỉ là **tối ưu** (module bắt đầu tải song song với HTML), **không** thay SSR: nút vẫn cần
  [chế độ element](#chế-độ-element-ssr--hydrate-tại-chỗ-0250) để không nháy khi module về muộn. Chỉ preload module
  thật sự có trên trang — preload thừa tốn băng thông. Module phụ thuộc (`base`, `icons`…) trình duyệt tự phát hiện
  khi tải entry; preload thêm chúng là tuỳ chọn.

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
td_empty(string $title, string $message = '', array $opts = []): string   // 0.26.0 (luôn element)
td_otp_input(string $name, array $opts = []): string      // 0.27.0
td_copy(string $value, array $opts = []): string          // 0.27.0 (luôn element)
td_multiselect(string $name, array $options, array $selected = [], array $opts = []): string   // 0.28.0
td_tree_select(string $name, array $tree, string|int|array|null $selected = null, array $opts = []): string   // 0.29.0
td_number_input(string $name, mixed $value = null, array $opts = []): string   // 0.30.0
td_masked_value(string $masked, array $opts = []): string   // 0.31.0 (luôn element, không có tham số giá trị thật)
td_media_field(string $name, mixed $assetId = null, array $o = []): string    // 0.32.0 (luôn element; $assetId chỉ string | int)
td_scan_input(string $name, array $o = []): string   // 0.38.0 (multiple: luôn element)
td_filter_chips(array $items, array $o = []): string        // 0.39.0 (luôn element)
td_datetime_range(string $name, ?string $start = null, ?string $end = null, array $o = []): string   // 0.40.0 (luôn element)
td_import_map(array $extra = []): array
td_import_map_tag(array $extra = [], ?string $nonce = null): string
td_stylesheet_tag(?string $nonce = null): string
```

Class `TdComponents\Td` (static): `configure` (+ option `ssr_elements`, 0.25.0), `ssrElements()`, `baseUrl`, `kitDir`,
`importMap`, `importMapTag`, `stylesheetTag`, `modulePreloads` (0.25.0),
`registerIcons`, `siteIcons`, `hasIcon`, `iconAliases()`, `icon($name, $size, $label, $class)` (0.26.0: `$size` nhận cả số
nguyên 8–128 = px → `width` / `height`, như `tdIcon(name, { size: n })`), và các tiện ích an toàn dùng lại được
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

### Chế độ element: SSR + hydrate tại chỗ (0.25.0)

**Vấn đề nó giải quyết.** Viết tay `<td-button>Lưu</td-button>` thì trước khi module JS tải xong trình duyệt chỉ thấy
chữ "Lưu" trần, rồi đột ngột nhảy thành nút (nháy + xô layout). Chế độ element in **sẵn** cả host lẫn nút đã có dáng;
khi module `@dazzxq/td-components/button` nạp, component **nhận markup tại chỗ** (không thay node con) — không nháy,
không xô layout, nút đang focus vẫn focus. Quyết định kiến trúc: [ADR 0012](../internal/decisions/0012-ssr-hydration.md).

**Bật thế nào — tự chọn (opt-in), mặc định vẫn native như cũ:**

| Toàn cục `ssr_elements` (`Td::configure`) | Option `element` của lần gọi | Kết quả |
|---|---|---|
| `false` (mặc định) | không truyền | native (như trước 0.25.0, từng byte) |
| `false` | `false` | native |
| `false` | `true` | **element** |
| `true` | không truyền | **element** |
| `true` | `false` | native |
| `true` | `true` | **element** |

`td_link(…, ['bare' => true])` **không bao giờ** in element (không có hợp đồng component). Bảng trên áp y hệt cho
`td_field` ([chi tiết](#td_field-ở-chế-độ-element-0260)), `td_toggle` và `td_checkbox`
([chi tiết](#td_toggle--td_checkbox-ở-chế-độ-element-0260)) từ 0.26.0, và `td_dropdown`
([chi tiết](#td_dropdown-ở-chế-độ-element-vỏ-không-xô-lệch-0260)) cũng từ 0.26.0, và `td_otp_input`
([chi tiết](#td_otp_input-0270)) từ 0.27.0. `td_empty` và `td_copy` (0.27.0) thì **luôn** in element (component không
có dạng native; option `element` / `ssr_elements` không đổi gì).

```php
<?= td_button('Lưu', ['type' => 'submit', 'name' => 'action', 'value' => 'save', 'variant' => 'primary', 'icon' => 'check', 'element' => true]) ?>
```

```html
<td-button data-td-ssr="button@1" variant="primary" size="md" icon="check" label="Lưu" type="submit" name="action" value="save">
  <button class="td-btn td-btn--primary td-btn--md" type="submit" name="action" value="save">
    <span class="td-btn__icon" data-td-icon="check" data-td-icon-size="s" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="check" …>…</svg></span>
    <span class="td-btn__label">Lưu</span>
    <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span>
  </button>
</td-button>
```

(Thực tế in liền một dòng, không khoảng trắng giữa thẻ.) Control bên trong **đúng từng thuộc tính** với cái
`<td-button>` tự render — có test fixture chung PHP ↔ JS chạy trên Chromium, Firefox và WebKit.

**Bảng chiếu option → host ↔ control:**

| Option PHP | Host `<td-button>` | Control `<button>` / `<a>` (chạy khi chưa có JS) |
|---|---|---|
| `$label` | `label` (chỉ khi khác rỗng) | text của `.td-btn__label` |
| `variant` / `size` / `full_width` | `variant` / `size` / `full-width` — **luôn in** `variant` và `size` (mặc định PHP `secondary` ≠ JS `primary`) | class `td-btn--{variant}` `td-btn--{size}` `td-btn--full` |
| `icon` / `icon_position` | `icon` (chỉ khi icon có trong registry) / `icon-position="right"` | `span.td-btn__icon[data-td-icon][data-td-icon-size="s"]` có sẵn SVG |
| `type` (nút) | `type` (luôn in) | `type` |
| `name` / `value` (nút) | `name` / `value` | `name` / `value` (submitter) |
| `disabled` | `disabled` | nút: `disabled` native · link: không `href` + `tabindex="-1"` + `role="link"` + `aria-disabled` |
| `loading` | `loading` | như native: nút `disabled` + `aria-busy` + `aria-disabled`, link không `href`; spinner hiện |
| `aria_label` | `aria-label` | `aria-label` |
| `tooltip` | — | `data-tooltip` |
| `href` / `target` / `download` (link) | `href` (đã lọc; URL bị chặn → `href=""`, link trơ) / `target` / `download` | `href` (đã lọc) / `target` + `rel` / `download` |
| `id` | `id` (API của component) | — |
| `class` | `class` (của site) | — (control chỉ mang class kit) |
| `attrs` | — | lên control (cùng allowlist). **Element mode giữ chỗ mọi tên component sở hữu** kể cả khi option tương ứng tắt: `class`, `type`, `id`, `name`, `value`, `disabled`, `aria-busy`, `aria-disabled`, `aria-label`, `data-tooltip`, `href`, `target`, `rel`, `download` (+ `role` / `tabindex` khi link đang trơ) → bị bỏ khỏi `attrs`, để trạng thái trước và sau hydrate luôn như nhau (ví dụ `attrs['disabled' => true]` không còn khoá nút). `tabindex` / `role` trên link đang bật là pass-through thật: giữ khi hydrate và được khôi phục khi `loading` / `disabled` tắt. Native mode không đổi |
| `attrs` có `aria-label` / `aria-pressed` / `aria-expanded` / `aria-haspopup` / `aria-controls` | **nâng lên host** (component chuyển xuống control khi có JS) | vẫn in trên control (cho lúc chưa có JS) |
| — | `data-td-ssr="button@1"` (dấu hợp đồng; component gỡ sau khi nhận) | — |

**Hành vi khi chưa có JS** (module chưa tải / bị chặn): control native chạy đầy đủ — nút submit gửi `name=value`,
link điều hướng, nút `loading` bị `disabled` native (không submit lần hai). **Sau khi hydrate**, nút `loading`
chuyển sang hợp đồng JS hiện có: `aria-busy` + `aria-disabled`, vẫn focus được, click bị chặn, **không** còn
`disabled` native — giống hệt `<td-button loading>` viết tay.

**Khi nào component từ chối nhận markup (và render lại như cũ):** dấu sai (`button@2`, tên khác), cấu trúc lạ (thiếu
spinner, thêm con, chữ thừa), hoặc **thuộc tính cấu trúc** trên host không khớp control: loại control (`<a>` ⇔ host
có `href`), class variant / size / full-width, icon + vị trí, nhãn, `type`, `target` / `download`, hoặc host có
`color` / `text-color` (PHP không in). Ví dụ script của site đổi `variant` trước khi module tải → nút render lại đúng
`variant` mới. Thuộc tính **trạng thái** (`loading`, `disabled`, `name`, `value`, `aria-*`, giá trị `href`) thì được
áp tại chỗ, không render lại. Hai trường hợp biên đã biết render lại: nhãn rỗng mà không có icon + `aria_label`
(JS hiện chữ mặc định "Button"), và icon không có trong registry kèm nhãn rỗng.

**Hydrate chỉ tin markup do helper của kit sinh ra.** Component chỉ nhận control khi **mọi** node được giữ lại
(control, nhãn, ô icon, spinner) chỉ mang attribute nằm trong allowlist khớp đúng những gì `td_button` / `td_link`
và `render()` có thể in: tên component sở hữu, allowlist `attrs` (`aria-*`, `data-*`, `id`, `title`, `lang`,
`tabindex`, `role`, `accesskey`…) và `data-tooltip`. Có bất kỳ attribute nào khác — `on*`, `style`, `form`,
`formaction`, `formmethod`, `formenctype`, `formtarget`, `formnovalidate`, `srcdoc`, `popovertarget`, `commandfor`… —
thì **không nhận**, render lại sạch từ attribute của host. Spinner (và icon class cũ) phải khớp `render()` từng byte;
SVG của icon registry luôn được vẽ lại. Khi phần tử bị gỡ ra rồi gắn lại, markup được **kiểm lại**: bị sửa trong lúc
tách khỏi trang (cấu trúc hoặc attribute ngoài allowlist) → render lại thay vì gắn listener lại. Đừng tự dựng markup
`data-td-ssr` bằng tay hay từ dữ liệu người dùng — dùng helper.

**Lưu ý khi chuyển sang element mode:**

- `id` và `class` nằm trên **host** chứ không trên `<button>` — CSS / JS của site đang nhắm `#id` / `.class` vào
  thẳng nút cần đổi sang `#id > .td-btn` hoặc dùng API component (`document.getElementById('save').run(…)`).
- `Td::allowHttpLinks(true)` cho phép `http:` ở PHP, nhưng component trên trang HTTPS vẫn bỏ `href` `http:` khi hydrate
  (link thành trơ) — như `<td-button href>` viết tay.
- Nạp `@dazzxq/td-components/button` (qua import map) mới có hydrate; nên thêm
  [`Td::modulePreloads(['button'])`](#thứ-tự-nạp-và-tdmodulepreloads-0250).

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

### td_field ở chế độ element (0.26.0)

Bật như [chế độ element của nút](#chế-độ-element-ssr--hydrate-tại-chỗ-0250): `'element' => true` từng lần gọi, hoặc
`Td::configure(…, ['ssr_elements' => true])` (lần gọi truyền `'element' => false` thì vẫn native). Mặc định **không
đổi**: native từng byte như 0.25. Helper in host `<td-input-field data-td-ssr="input-field@1">` chứa **đúng cây
`.td-field` mà `<td-input-field>` tự render** (nhãn + dấu `*`, control, footer có ghi chú / lỗi / **bộ đếm** nếu có
`max_length`) — không còn ô trống rồi nhảy khi module `@dazzxq/td-components/input-field` tải muộn (trang đăng nhập
của 135). Không có JS: control native vẫn submit, validate (`required`, `pattern`, `type=email`…), trình quản lý mật
khẩu thấy `autocomplete`.

```php
<?= td_field('email', '', ['label' => 'Email', 'type' => 'email', 'autocomplete' => 'email', 'required' => true, 'id' => 'login-email', 'hint' => 'Email công ty', 'element' => true]) ?>
```

```html
<td-input-field data-td-ssr="input-field@1" id="login-email-host" type="email" size="md" name="email" label="Email" helper-text="Email công ty" required field-id="login-email" autocomplete="email">
  <div class="td-field td-field--md">
    <label class="td-field__label" id="login-email-host-label" for="login-email">Email<span class="td-field__required" aria-hidden="true"> *</span></label>
    <input type="email" class="td-field__control" id="login-email" name="email" required aria-required="true" autocomplete="email" aria-describedby="login-email-host-note" value="">
    <div class="td-field__footer"><div class="td-field__note" id="login-email-host-note">Email công ty</div></div>
  </div>
</td-input-field>
```

**Id (hợp đồng trợ năng, ADR 0012 mục 9):**

| Trường hợp | Control (`input` / `textarea`) | Host `<td-input-field>` | Nhãn / ghi chú / bộ đếm / lỗi |
|---|---|---|---|
| Có `id` (`'id' => 'login-email'`) | `id="login-email"` (= thuộc tính `field-id` của host) — `<label for="login-email">` của site trỏ đúng **trước và sau** JS | `id="login-email-host"` | `login-email-host-label` / `-note` / `-counter` / `-error` |
| Không `id` | `{host}-control` (mặc định của component) | `td-{name đã làm sạch}-{n}` (bộ đếm trong request, ví dụ `td-email-3`) | `{host}-label` … |

Khác native mode: ở native `id` là id **wrapper** và control là `{id}-control`; ở element mode `id` là id **control**.
Không có id trùng trong trang (có test).

**Bảng chiếu option → host ↔ control:**

| Option PHP | Host | Control (chạy khi chưa có JS) | Sau hydrate |
|---|---|---|---|
| `$name` / `$value` | `name` / `value` (khi khác rỗng) | `name` / `value` | control **mất `name`** (host gửi qua ElementInternals → FormData đúng **một** mục, cả tên `x[]`) |
| `type` | `type` (luôn in) | type **native** (`email` / `url` / `number` thật — bàn phím + validate khi chưa JS) | `email` / `url` / `number` → `type="text"` + `inputmode` (`email` / `url` / `decimal`) **trên cùng node**, như component render; type khác giữ nguyên |
| `size` | `size` (luôn in) | class `td-field--{size}` | — |
| `label` | `label` | `label.td-field__label` (+ `span.td-field__required` khi `required`) | giữ nguyên |
| `placeholder`, `disabled`, `readonly` | cùng tên | cùng tên | component tự đặt lại như bình thường |
| `required` | `required` | `required` + `aria-required` | `required` gỡ (host báo `valueMissing`), `aria-required` giữ |
| `max_length` / `maxlength` | `max-length` | `maxlength` + **bộ đếm** `.td-field__counter` (`n/max ký tự`, `data-state="limit"` khi đủ) | giữ (component cũng in) |
| `minlength`, `pattern` | cùng tên | cùng tên (validate native) | gỡ (host tự kiểm `tooShort` / `patternMismatch`) |
| `min` / `max` / `step` | cùng tên | cùng tên | giữ đúng tập component vẫn đặt: `date` → `min` `max`; `month` / `datetime-local` / `time` → `min` `max` `step`; type khác → gỡ (host tự kiểm range / step) |
| `rows` (textarea) | `rows` (luôn in, mặc định `3` của PHP) | `rows` | giữ |
| `hint` | `helper-text` | `.td-field__note` + `aria-describedby` | giữ |
| `error` | `error-text` | `span.td-field-error` + `aria-invalid` + `aria-errormessage` | component nhận đúng nút lỗi đó (không tạo thêm) |
| `autocomplete`, `inputmode`, `enterkeyhint`, `autocapitalize`, `spellcheck` | cùng tên | cùng tên | giữ (component chuyển tiếp từ host) |
| `autofocus` | `autofocus` | `autofocus` | gỡ (component tự focus một lần nếu chưa có gì focus) |
| `id` | `{id}-host` + `field-id="{id}"` | `id` | giữ |
| `class` | `class` | — | — |
| `attrs` | `aria-label` trong `attrs` **nâng lên host** | các attribute còn lại (cùng allowlist). **Giữ chỗ** mọi tên component sở hữu, không phân biệt hoa thường: `class` `type` `id` `name` `value` `placeholder` `required` `aria-required` `disabled` `readonly` `maxlength` `minlength` `pattern` `min` `max` `step` `rows` `aria-describedby` `aria-invalid` `aria-errormessage` `aria-label` `aria-labelledby` + 6 thuộc tính gợi ý nhập (đi qua option) + mọi `data-td-*` → bị bỏ | pass-through giữ nguyên |
| — | `data-td-ssr="input-field@1"` (component gỡ sau khi nhận) | — | — |

`type => 'contenteditable'` không có ở helper (không có control native tương ứng) — không có chế độ element.

**Hydrate làm gì (theo thứ tự, ADR 0012 mục 3–4):** (1) chụp state sống của control: chữ người dùng đã gõ **trước**
khi module tải, vùng chọn nếu đang focus; `el.value = …` gán từ script **trước** define thắng chữ đã gõ; (2) đổi
`type` trên cùng node nếu cần, chỉ ghi lại `value` khi bắt buộc (rồi trả lại vùng chọn); (3) khởi tạo
ElementInternals (giá trị + validity) **trước**; (4) rồi mới gỡ `name` + ràng buộc nằm ngoài tập trên; (5) `<label
for="{id control}">` **nằm ngoài** host chuyển `for` sang host (bấm vẫn focus đúng control); nhãn nội bộ giữ nguyên.
Không phát `input` / `change`. `form.reset()` về **giá trị mặc định native** (`value` PHP in ra), không về chữ lúc
nâng cấp.

**Khi markup không khớp** (script đổi `label` / `type` / `size`… trước khi module tải, markup bị sửa, attribute ngoài
allowlist như `onclick`, `style`, `form`, `formaction`, control thừa, dấu sai schema, hoặc `name` / ràng buộc /
`disabled` của control khác host): component **render an toàn ngay** và trả lại chữ đã gõ, vùng chọn và — nếu người
dùng đang ở trong ô — focus vào control mới (toggle / checkbox: giữ `checked` / `indeterminate`). Không phát event,
không có giai đoạn "hoãn tới blur" (đã bỏ sau review v0.26, ADR 0012 mục 5).

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
| `create_label` | (0.22.0) chuỗi → attribute `create-label` trên host (escape như mọi attribute): dòng "Thêm mới" cố định ở đáy menu, phát event `create` với `{ query }`. Chỉ có khi JS đã nạp. Rỗng / không truyền / không phải chuỗi-số → không in. Không đặt được qua `attrs` (không nằm trong allowlist) |
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
- **Thêm mục mới ngay trong dropdown** (0.22.0): `create_label` in `create-label` lên host; JS của trang nghe event
  `create` (mở modal thêm mới, lưu, rồi `dd.options = [...]` + `dd.setValue(id)` — `setValue` không phát `change`).
  Bỏ cách tạm option giả `__new__` + nghe `change`: dòng tạo không bao giờ là giá trị nên không lẫn vào submit /
  `required`. Ví dụ đầy đủ: [Dropdown — mục 10](../components/dropdown.md#10-dòng--thêm-mới-ở-cuối-menu-create-label-0220).

```php
<?= td_dropdown('film_id', $films, $roll['film_id'] ?? '', ['label' => 'Film', 'create_label' => 'Thêm film mới']) ?>
```

### td_dropdown ở chế độ element: vỏ không xô lệch (0.26.0)

Native mode: khung hình đầu là `<select>` mặc định của trình duyệt (cao / viền / font khác), JS tải xong thì nhảy sang
trigger → trang xô lệch. Element mode (bật như [nút](#chế-độ-element-ssr--hydrate-tại-chỗ-0250): `'element' => true`
từng lần gọi hoặc `Td::configure(…, ['ssr_elements' => true])`; `'element' => false` giữ native) in **đúng markup
native** cộng hai thứ:

```html
<td-dropdown data-td-ssr="dropdown@1" id="dd-role-3" label="Vai trò" searchable="false" allow-clear="false">
  <label class="td-field__label" for="dd-role-3-select">Vai trò<span class="td-field__required" aria-hidden="true"> *</span></label>
  <select class="td-dropdown__native" id="dd-role-3-select" name="role" required>…</select>
</td-dropdown>
```

- `td.css` tạo dáng `select.td-dropdown__native` **đúng hộp của trigger**: cao `--td-field-h-md`, padding, viền
  `--td-field-border`, bo `--td-field-radius-md`, font / màu theo token field, rộng 100 %; host mang kiểu chữ của
  `.td-dropdown` (nhãn cùng cao). **Giữ mũi tên native** của trình duyệt (không `appearance: none`, không ảnh `data:` —
  CSP `img-src 'self'`): mũi tên có thể khác hình chevron của trigger (khác **pixel**), nhưng **hộp** trùng — nạp
  module thì select → trigger không dịch một pixel nào (test đo bounding box ở Chromium / Firefox / WebKit).
- **Không JS**: y như native (chọn, submit, `required` chặn submit, nhãn ngoài `<label for="{id}-select">`).
- **Nạp module dropdown**: đường nâng cấp 0.17 như cũ (đọc option, lựa chọn sống, `name` / `required` / `disabled`, nhãn
  ngoài chuyển sang host, gỡ select), rồi gỡ dấu `data-td-ssr`. **Select đang focus** (người dùng đang chọn đúng lúc
  module tới): component **không đụng gì** — không gỡ select, không render — cho tới khi select blur; khi đó nâng cấp
  **đúng một lần** với lựa chọn tại thời điểm blur, focus ở nguyên chỗ người dùng vừa chuyển tới.
- Dấu lệch (`dropdown@2`…) hoặc không có dấu → hành vi 0.17 (nâng cấp ngay).
- **`attrs` ở element mode**: không đặt được tên component đọc từ host (`required`, `disabled`, `name`, `value`,
  `label`, `placeholder`, `searchable`, `allow-clear`, `create-label`, `aria-label`, `value-key`, `label-key`,
  `max-height`, `error-text`, `id`, `class` — không phân biệt hoa thường) và `data-td-*` — dùng option tương ứng.
  `attrs['aria-label']` (khi không có option `aria_label`) đặt lên **select** (component chuyển lên host khi nâng cấp).
  Native mode giữ nguyên như cũ.
- Id không đổi so với native: host = `id` (hoặc `dd-{name}-{n}`), select = `{id}-select`.

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

### td_toggle / td_checkbox ở chế độ element (0.26.0)

Bật / tắt như [td_field](#td_field-ở-chế-độ-element-0260) (`'element' => true` hoặc `ssr_elements`). Helper in host
`<td-toggle data-td-ssr="toggle@1">` / `<td-checkbox data-td-ssr="checkbox@1">` chứa **đúng markup component tự
render** (ô icon có sẵn SVG + `data-td-icon`); input native giữ `name` / `value` / `checked` / `required` để form chạy
khi chưa có JS.

```php
<?= td_checkbox('remember', false, 'Ghi nhớ', ['id' => 'remember', 'element' => true]) ?>
```

```html
<td-checkbox data-td-ssr="checkbox@1" id="remember-host" name="remember" label="Ghi nhớ" size="md">
  <label class="td-checkbox td-checkbox--md">
    <input type="checkbox" class="td-checkbox__input" id="remember" name="remember">
    <span class="td-checkbox__mark" aria-hidden="true"><span class="td-checkbox__icon" data-td-icon="check" data-td-icon-class="td-checkbox__svg"><svg …>…</svg></span></span>
    <span class="td-checkbox__label">Ghi nhớ</span>
  </label>
</td-checkbox>
```

| Option PHP | Host | Input (chạy khi chưa có JS) | Sau hydrate |
|---|---|---|---|
| `$name` | `name` | `name` | input mất `name` (host gửi — đúng một mục, cả `x[]`) |
| `$checked` | `checked` | `checked` | trạng thái **sống** (người dùng bỏ / tích trước khi JS tới) chép lên host; input mất attribute `checked` (giữ trạng thái) |
| `$label` | `label` | `span.td-switch__label` / `.td-checkbox__label` | giữ |
| `value` | `value` | `value` | input mất `value`; host gửi `value` (không có → `on`) |
| `required` | `required` | `required` | gỡ khỏi input (host báo `valueMissing`) |
| `disabled` | `disabled` | `disabled` | component đặt lại như bình thường |
| `size` | `size` (luôn in) | class `td-switch--{size}` / `td-checkbox--{size}` | — |
| `aria_label` | `aria-label` | `aria-label` **chỉ khi không có `$label`** (có nhãn thấy được thì nhãn đặt tên, như component) | như component |
| `id` | `{id}-host` | `id` (= id caller — `<label for>` của site trỏ đúng trước + sau JS) | **giữ trên input**, kể cả khi phải render lại |
| không `id` | `td-{name}-{n}` | không có id (như component render) | — |
| `class`, `attrs` | **lên host** (native mode: lên `<label>` bao ngoài). `attrs` giữ chỗ: `id` `class` `name` `value` `checked` `required` `disabled` `label` `size` `aria-label` `color` `controlled` `error-text` + `data-td-*` | — | — |
| `input_attrs` | — | lên input (allowlist). Giữ chỗ: `type` `role` `class` `id` `name` `value` `checked` `required` `disabled` `aria-label` `aria-labelledby` `aria-invalid` `aria-errormessage` `aria-busy` + `data-td-*` (không nâng lên host — dùng option `aria_label`) | pass-through giữ nguyên (cả `aria-describedby` của site) |

Thứ tự ưu tiên trạng thái khi hydrate: `el.checked` / `el.value` gán từ script **trước** define > trạng thái sống của
input (người dùng đã tích / bỏ tích, script đổi `input.value`) > attribute do PHP in. `form.reset()` về **mặc định
native** (`checked` / `value` PHP in ra). `indeterminate` của input được giữ. Markup không khớp → render an toàn
**ngay**, giữ `checked` / `value` / `indeterminate` / `id` và focus (nếu input đang focus); không phát `change`.

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
| `icon` (0.25.0) | tên icon registry (core, alias như `x`, hoặc icon site `site-*` đã `registerIcons`) → icon trang trí cỡ `s` trước nhãn. Tên lạ → **bỏ icon, giữ nhãn** (không span rỗng; markup y như không có `icon`) |
| `id`, `class`, `attrs` | trên `<span>` |

```php
<?= td_badge('Đã duyệt', ['variant' => 'success', 'icon' => 'check']) ?>
<!-- <span class="td-badge td-badge--success"><span class="td-badge__icon" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="check" …>…</svg></span><span class="td-badge__label">Đã duyệt</span></span> -->
```

Icon `aria-hidden` (chỉ trang trí — nghĩa nằm ở nhãn), cao `1em` theo cỡ chữ badge, màu theo chữ (`currentColor`;
gate tương phản đo icon ≥ 3.2:1 trên nền mọi variant).

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

## td_empty (0.26.0)

```php
<?= td_empty('Chưa có đơn hàng', 'Đơn hàng mới sẽ hiện ở đây.', [
    'icon' => 'inbox',
    'actions' => [
        ['label' => 'Tạo đơn', 'href' => '/orders/new', 'variant' => 'primary'],
        ['label' => 'Xem hướng dẫn', 'href' => '/help'],
    ],
]) ?>
```

`td_empty($title, $message = '', $opts)` **luôn** in phần tử `<td-empty-state data-td-ssr="empty-state@1">` chứa sẵn
**đúng cây** `render()` của [Empty state](../components/empty-state.md) — `td.css` tạo dáng ngay khi chưa có JS; nạp
`@dazzxq/td-components/empty-state` thì nhận markup **tại chỗ** (không nháy, không xô lệch). `$title` / `$message` là
**chữ** (escape); rỗng → chữ mặc định của component (`Không có dữ liệu` / `Chưa có mục nào được tạo.`).

| Option | Ý nghĩa |
|---|---|
| `icon` | tên icon registry (core, alias như `x`, icon site `site-*` đã `registerIcons`). **Không có / tên lạ → `inbox`** (không in attribute `icon`, như component fallback) |
| `size` | `sm` `md` `lg` (mặc định `md`; icon 28 / 40 / 56 px) |
| `compact` | `true` → padding gọn |
| `heading` | 2–6 (số hoặc chuỗi số) → `heading-level` + thẻ `h2`…`h6`; giá trị khác → `h3` của component |
| `actions` | danh sách `['label' => …, 'href' => …, 'variant' => 'primary'\|'secondary'\|'danger']` (mặc định `secondary`) → mỗi mục in bằng `td_link(…, ['size' => 'sm', 'element' => true])` trong `.td-empty-state__actions` (bỏ `hidden`). Mục **không có `href` an toàn** (thiếu, `javascript:`…) bị **bỏ** (không in nút chết); `label` rỗng → `Thực hiện` |
| `id`, `class` | trên host |
| `attrs` | trên host, qua allowlist; không đặt được `id`, `class`, `title`, `message`, `size`, `compact`, `heading-level`, `icon` (không phân biệt hoa thường) và `data-td-*` |

Markup (rút gọn):

```html
<td-empty-state data-td-ssr="empty-state@1" title="Chưa có đơn hàng" message="Đơn hàng mới sẽ hiện ở đây." size="md" icon="inbox">
  <div class="td-empty-state td-empty-state--md">
    <div class="td-empty-state__icon" aria-hidden="true"><span data-td-icon="inbox" data-td-icon-size="40"><svg class="td-icon" data-icon="inbox" … width="40" height="40">…</svg></span></div>
    <h3 class="td-empty-state__title">Chưa có đơn hàng</h3>
    <p class="td-empty-state__message">Đơn hàng mới sẽ hiện ở đây.</p>
    <div class="td-empty-state__actions">
      <td-button data-td-ssr="button@1" variant="primary" size="sm" label="Tạo đơn" href="/orders/new"><a class="td-btn td-btn--primary td-btn--sm" href="/orders/new">…</a></td-button>
      …
    </div>
  </div>
</td-empty-state>
```

- **Không JS**: thẻ hiện đủ dáng, link hành động bấm được (link thường).
- **Nạp module**: `td-empty-state` nhận markup tại chỗ (icon tạo lại từ registry JS, cùng hộp); **nút hành động của
  server giữ nguyên** (cùng node) tới khi trang gán property JS `actions` — lúc đó thay bằng nút JS như cũ. Đổi thuộc tính
  cấu trúc sau đó (`size`, `title`…) render lại nhưng vẫn giữ nút server.
- Nạp **gốc package** (`@dazzxq/td-components`): `td-button` được định nghĩa trước → nút hydrate trước, empty state nhận
  nút đã hydrate. Chỉ nạp `empty-state`: nút vẫn là `<td-button data-td-ssr="button@1">` chưa định nghĩa — vẫn hợp lệ,
  link vẫn bấm được; nạp `button` sau thì nút hydrate tại chỗ.
- Markup bị sửa (thuộc tính lạ `on*` / `style` / `data-td-*`, phần tử thừa, chữ khác thuộc tính…) → component render
  lại như cũ (không có state; nút server bị bỏ).

## td_otp_input (0.27.0)

```php
<?= td_otp_input('code', ['label' => 'Mã xác thực', 'required' => true, 'autofocus' => true]) ?>
<?= td_otp_input('code', ['label' => 'Mã từ ứng dụng xác thực', 'required' => true, 'id' => 'otp', 'element' => true]) ?>
<?= td_otp_input('code', ['aria_label' => 'Mã gồm 6 số', 'error' => $errors['code'] ?? '']) ?>
```

`td_otp_input($name, $opts)` in ô nhập mã một lần 6 chữ số của [OTP input](../components/otp-input.md) (hợp đồng
`otp-input@1`). Helper **không bao giờ** tự submit form (markup không có JS); `complete` / gọi API là việc của JS trang.

- **Mặc định (native)**: `div.td-otp` > [nhãn] + `div.td-otp__box` > `input.td-otp__input` (`type="text"`,
  `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`, `pattern="[0-9]{6}"`, `name`, `value`,
  `required`…) [+ dòng lỗi]. Chạy đủ khi không có JS: bàn phím số, tự điền SMS, validate native. `td.css` vẽ nó đúng
  hộp của bản có JS.
- **Chế độ element** (`'element' => true` hoặc `Td::configure(…, ['ssr_elements' => true])`; `'element' => false` giữ
  native): host `<td-otp-input data-td-ssr="otp-input@1">` + cùng input + `span.td-otp__cells` (6 ô `aria-hidden`).
  Chưa có JS: ô ẩn, input là ô nhìn thấy; nạp `@dazzxq/td-components/otp-input` thì component nhận **tại chỗ** (giữ
  node input, mã đã gõ, vùng chọn, focus), dựng ElementInternals rồi gỡ `name` / `value` / `required` / `maxlength` /
  `pattern` khỏi input (FormData đúng một mục). Markup bị sửa → render an toàn ngay, trả lại mã + focus.

| Option | Ý nghĩa |
|---|---|
| `$name` | tên field (rỗng → không có `name`) |
| `label` | nhãn `label.td-otp__label[for={id input}]` (element: thêm attribute `label` trên host) |
| `value` | giá trị mặc định, **chuẩn hoá như component**: chữ số full-width (`１２３`) và Ả Rập – Ấn (`١٢٣`, `۱۲۳`) → ASCII, ký tự khác bị bỏ, tối đa 6 số (`'12-34 56'` → `123456`). Rỗng sau chuẩn hoá → không in |
| `required`, `disabled`, `readonly` | native trên input (element: cả trên host) |
| `autofocus` | `true` → `autofocus` trên input |
| `error` | lỗi từ server: `span.td-field-error` + `aria-invalid` + `aria-errormessage` + `aria-describedby` trên input (element: thêm `error-text` trên host) |
| `aria_label` | tên truy cập khi **không** có `label`; mặc định `Mã xác thực` (element: in `aria-label` lên host chỉ khi truyền) |
| `id` | id của **input** (`<label for>` của site trỏ đúng trước và sau JS) — xem bảng id dưới |
| `class` | class thêm: native → wrapper `div.td-otp`; element → host |
| `attrs` | attribute thêm trên **input** (allowlist). Giữ chỗ — bị bỏ khỏi `attrs`, không phân biệt hoa thường: `type` `class` `id` `inputmode` `autocomplete` `name` `maxlength` `minlength` `pattern` `value` `required` `disabled` `readonly` `autofocus` `aria-label` `aria-labelledby` `aria-invalid` `aria-errormessage` `aria-describedby` + mọi `data-td-*` |

**Id:**

| Trường hợp | Input | Host `<td-otp-input>` | Dòng lỗi |
|---|---|---|---|
| Native, có `id` | `id` | — | `{id}-error` |
| Native, không `id` | `td-{name đã làm sạch}-{n}-input` (ví dụ `td-code-3-input`) | — | `{input}-error` |
| Element, có `id` | `id` | `{id}-host` | `{id}-host-error` |
| Element, không `id` | `{host}-input` | `td-{name đã làm sạch}-{n}` (bộ đếm trong request) | `{host}-error` |

Giống `td_field` element mode: `id` luôn là id **control**, không phải wrapper / host.

```html
<!-- td_otp_input('code', ['label' => 'Mã xác thực', 'required' => true, 'id' => 'otp', 'element' => true]) -->
<td-otp-input data-td-ssr="otp-input@1" id="otp-host" name="code" label="Mã xác thực" required>
  <div class="td-otp">
    <label class="td-otp__label" for="otp">Mã xác thực</label>
    <div class="td-otp__box">
      <input type="text" class="td-otp__input" id="otp" inputmode="numeric" autocomplete="one-time-code" name="code" maxlength="6" pattern="[0-9]{6}" required>
      <span class="td-otp__cells" aria-hidden="true"><span class="td-otp__cell"></span>…(6 ô)</span>
    </div>
  </div>
</td-otp-input>
```

Native mode in đúng khối `div.td-otp` trên (không có `span.td-otp__cells`; dòng lỗi nằm **trong** `div.td-otp`).

## td_copy (0.27.0)

```php
<?= td_copy($requestId, ['label' => 'Copy request ID', 'size' => 'sm']) ?>
<?= td_copy($auditEventId, ['label' => 'Copy audit ID']) ?>
<?= td_copy(implode("\n", $recoveryCodes), ['label' => 'Copy mã khôi phục', 'sensitive' => true, 'duration' => 3000]) ?>
```

`td_copy($value, $opts)` **luôn** in phần tử [Copy](../components/copy.md) đầy đủ (hợp đồng `copy@1`; option `element`
/ `ssr_elements` không đổi gì): host `<td-copy data-td-ssr="copy@1">` + nguồn `<code class="td-copy__source">{value}</code>`
+ nút icon `button.td-copy` (SVG `copy` có sẵn) + live region `span.td-copy__status`. `$value` là **chữ** (escape).

- **Không JS**: `<code>` hiện (người dùng tự bôi đen, `user-select: all`), nút và live region ẩn — không có nút chết.
- **Nạp `@dazzxq/td-components/copy`**: `<code>` ẩn, nút hiện; component nhận markup **tại chỗ** (cùng node nút). Markup
  không khớp → render lại, mã trong `<code>` (đã chụp lúc gắn) vẫn được copy.

| Option | Ý nghĩa |
|---|---|
| `label` | tên nút + tooltip (`aria-label` + `data-tooltip` trên nút; attribute `label` trên host). Rỗng / không truyền → `Copy` (không in `label` lên host) |
| `size` | `sm` `md` (mặc định `md`; luôn in) |
| `sensitive` | `true` → event `copy-success` / `copy-error` không mang `value` |
| `duration` | số ms giữ icon "đã copy" / lỗi — số nguyên ≥ 0; giá trị khác → không in (component dùng 2000) |
| `id`, `class` | trên host |
| `attrs` | trên **host** (allowlist). Giữ chỗ — bị bỏ, không phân biệt hoa thường: `id` `class` `label` `size` `sensitive` `duration` `value` `for` + mọi `data-td-*` (nguồn duy nhất là `$value`) |

```html
<!-- td_copy('req_01HZX9K2', ['label' => 'Copy request ID', 'size' => 'sm']) -->
<td-copy data-td-ssr="copy@1" label="Copy request ID" size="sm">
  <code class="td-copy__source">req_01HZX9K2</code>
  <button type="button" class="td-copy td-copy--sm" aria-label="Copy request ID" data-tooltip="Copy request ID">
    <span class="td-copy__icon" data-td-icon="copy" aria-hidden="true"><svg class="td-icon …" data-icon="copy" …>…</svg></span>
  </button>
  <span class="td-copy__status" role="status"></span>
</td-copy>
```

(Thực tế in liền một dòng.) Không truyền `label` mà site đã đổi `TdCopy.labels.copy` (ví dụ `'Sao chép'`) → tên nút PHP
(`Copy`) khác tên component render → component render lại (vẫn đúng, chỉ mất lợi ích "tại chỗ"). Site đã dịch nhãn thì
truyền `label` tường minh.

## td_multiselect (0.28.0)

```php
<?= td_multiselect('roles[]', ['admin' => 'Quản trị', 'editor' => 'Biên tập', 'viewer' => 'Người xem'],
    $user->roles, ['label' => 'Vai trò', 'required' => true]) ?>

<?= td_multiselect('cities[]', [
        ['label' => 'Miền Bắc', 'options' => ['hn' => 'Hà Nội', 'hp' => 'Hải Phòng']],
        ['label' => 'Miền Nam', 'disabled' => true, 'options' => [['value' => 'hcm', 'label' => 'TP Hồ Chí Minh']]],
        ['value' => 'hue', 'label' => 'Huế', 'description' => 'Cố đô'],
    ], ['hn'], ['label' => 'Thành phố', 'element' => true, 'select_all' => true, 'max_items' => 3]) ?>
```

`td_multiselect($name, $options, $selected = [], $opts = [])` — chọn nhiều giá trị (bản chọn nhiều của
[chip input](../components/chip-input.md#11-chọn-nhiều-từ-danh-sách--multi-select-0280); `td_dropdown` vẫn chỉ chọn
một).

- **Mặc định (native)**: `div.td-multiselect` > [`label.td-field__label`] + `select.td-multiselect__native` có
  `multiple` (`size` mặc định 4). Chạy đủ khi **không có JS**: mỗi option đã chọn (không `disabled`) gửi một entry dưới
  `name` **nguyên văn** — đặt `name="roles[]"` để PHP / Laravel nhận mảng (helper không tự thêm `[]`).
- **Chế độ element** (`'element' => true` hoặc `Td::configure(…, ['ssr_elements' => true])`; `'element' => false` giữ
  native): `<td-chip-input data-td-ssr="chip-input@1" selection-only …>` + [nhãn] + cùng select nhưng class
  `td-chip-input__native`. Chưa có JS: select multiple gốc (được tạo kiểu như khung chip, `min-height` bằng chiều cao tối
  thiểu của khung). Nạp `@dazzxq/td-components/chip-input` → component **nâng cấp** select (không phải hydrate tại chỗ):
  đọc option / nhóm / lựa chọn đang sống, lấy `name` / `required` / `disabled` / `aria-label` của select, gỡ select, vẽ
  chip. Select **đang focus** lúc module nạp → chờ nó blur rồi mới nâng cấp. **Xô lệch**: chiều cao sau nâng cấp do số
  chip quyết định (thường thấp hơn danh sách `size=4`), nên không triệt tiêu được hẳn — `min-height` chỉ giảm bớt; muốn
  sát hơn thì truyền `size` nhỏ (ví dụ 2).

**`$options`** — cùng hình dạng `td_dropdown`, thêm nhóm:

| Hình dạng | Ví dụ | Kết quả |
|---|---|---|
| `value => label` | `['admin' => 'Quản trị']` | `<option value="admin">Quản trị</option>` (key số → chuỗi) |
| mục lá | `['value' => 'x', 'label' => 'X', 'disabled' => true, 'description' => 'phụ']` | `<option value="x" disabled data-description="phụ">X</option>` (`label` thiếu → dùng `value`; không có `value` → bỏ) |
| nhóm | `['label' => 'Nhóm', 'disabled' => true, 'options' => [lá…]]` | `<optgroup label="Nhóm" disabled>…</optgroup>` — **một cấp** (nhóm lồng bị bỏ); lá trong nhóm `disabled` bị khoá theo |

**`$selected`**: mảng value đã chọn (so sánh dạng chuỗi: `[2]` khớp key `2`). Thứ tự gửi khi không JS = thứ tự option;
sau khi nâng cấp = thứ tự **chọn** của người dùng.

| Option | Ý nghĩa |
|---|---|
| `label` | nhãn `label.td-field__label[for={id}-select]` (+ dấu `*` khi `required`); element: thêm attribute `label` trên host |
| `id` | id của wrapper / host; select = `{id}-select`. Không có → `td-{name đã làm sạch}-{n}` (ví dụ `roles[]` → `td-roles-1`) |
| `class` | class thêm trên wrapper / host |
| `required`, `disabled` | native trên select (component lấy lên host khi nâng cấp) |
| `aria_label` | `aria-label` của select (tên khi không có `label`) |
| `size` | số dòng của danh sách native (mặc định 4) |
| `placeholder` | element: placeholder ô lọc |
| `select_all` | element: `true` → dòng "Chọn tất cả (N)" |
| `max_items` | element: số mục tối đa (≥ 1) → `max-items` (chế độ native không giới hạn được — server tự kiểm) |
| `close_on_select` | element: đóng popup sau mỗi lần chọn |
| `attrs` | attribute thêm trên **wrapper / host** (allowlist). Element: giữ chỗ (bỏ khỏi `attrs`, không phân biệt hoa thường) `id` `class` `label` `placeholder` `selection-only` `select-all` `max-items` `close-on-select` `name` `value` `required` `disabled` `aria-label` `aria-labelledby` `value-key` `label-key` `min-chars` `search-delay` `allow-create` `show-on-focus` `max-length` `error-text` + mọi `data-td-*` |

Kết quả (element, thực tế in liền một dòng):

```html
<td-chip-input data-td-ssr="chip-input@1" id="roles" label="Vai trò" selection-only>
  <label class="td-field__label" for="roles-select">Vai trò</label>
  <select class="td-chip-input__native" id="roles-select" name="roles[]" multiple size="4">
    <option value="admin">Quản trị</option><option value="editor" selected>Biên tập</option>
  </select>
</td-chip-input>
```

## td_tree_select (0.29.0)

```php
<?= td_tree_select('parent_id', $categoryTree, $category->parent_id, [
    'label' => 'Danh mục cha', 'placeholder' => '— Không có (gốc) —', 'display' => 'path',
    'disable_subtree' => [$category->id],
    'element' => true,
]) ?>

<?= td_tree_select('categories[]', $categoryTree, $post->categoryIds, [
    'label' => 'Chuyên mục', 'multiple' => true, 'required' => true,
]) ?>
```

`td_tree_select($name, array $tree, string|int|array|null $selected = null, array $opts = [])` — chọn một / nhiều nút
của một cây ([`<td-tree-select>`](../components/tree-select.md)). Một lời gọi cho ra `<select>` **dùng được khi không
JS** (thay cho danh sách cha phẳng tự viết) và, ở chế độ element, nâng cấp **không xô lệch** (ADR 0012).

**`$tree`** — mảng nút `['value' => …, 'label' => …, 'children' => [...], 'disabled' => bool, 'description' => …]`:

- duyệt **lặp** (không đệ quy), sâu tối đa **16** cấp;
- `value` chỉ nhận chuỗi khác rỗng / số; `''` / `null` / mảng / bool (hoặc nút không phải mảng) → **bỏ cả nhánh**;
  value trùng → bỏ nút sau; mọi thứ bị bỏ trong một lần gọi → **một** `E_USER_WARNING`;
- `disabled` khoá nút **và cả nhánh** (như `td-tree`).

**`$selected`**: một value hoặc mảng value (cùng luật, bỏ `''`; một → giá trị đầu tiên hợp lệ; `cascade` → chỉ lá; value
không có trong cây bị bỏ).

**Select native** (`select.td-tree-select__native`, option theo **preorder**):

```html
<option value="apple" data-level="1" data-label="Apple">&nbsp;&nbsp;Apple</option>
```

Thụt lề = **NBSP ở đầu chữ** (2 mỗi cấp; popup native của Safari / iOS bỏ khoảng trắng thường) + `data-level` + `data-label`
(nhãn sạch cho bộ nâng cấp). **Không** dùng ký tự "—" trong nhãn (bẩn ô tìm, trình đọc màn hình đọc "gạch gạch").

| Option | Ý nghĩa |
|---|---|
| `multiple` | chọn nhiều (`<select multiple>`; native: `size` hàng) |
| `cascade` | chỉ với `multiple`: option **cha** in `disabled data-native-only` (không JS chỉ chọn được lá — khớp luật cascade) |
| `placeholder` | một: option `value=""` đầu tiên + `allow-clear` trên host (không in khi lựa chọn đang khoá); nhiều: chỉ là chữ khi trống |
| `label` | `label.td-field__label[for={id}-select]` (+ `*` khi `required`) + attribute `label` trên host |
| `required` | trên host **và** select (trừ trường hợp khoá ở dưới) |
| `disabled` | select `disabled` (+ mọi input khoá) |
| `disable_subtree` | mảng value → nút đó **và cả nhánh** bị khoá: công thức "chọn danh mục cha" chống vòng (truyền id của chính danh mục đang sửa) |
| `display` | `'path'` → `display="path"` |
| `size` | số hàng của `multiple` ở chế độ native (mặc định 8); element mode không in `size` |
| `id` | id của host; select = `{id}-select`. Không có → `td-{name đã làm sạch}-{n}` |
| `class` | class thêm trên host |
| `aria_label` | `aria-label` của select (tên khi không có `label`); `attrs['aria-label']` cũng vậy |
| `attrs` | attribute thêm trên host (allowlist). Giữ chỗ (không phân biệt hoa thường): `id` `class` `label` `placeholder` `multiple` `cascade` `searchable` `allow-clear` `display` `name` `value` `value-label` `value-labels` `required` `disabled` `aria-label` `aria-labelledby` `error-text` + mọi `data-td-*` |
| `element` | `true` / `false` ghi đè `Td::configure(…, ['ssr_elements' => …])` |

**Khoá đang chọn — gửi đúng một lần, `required` vẫn đúng:**

- mọi option của nút khoá có **`data-locked`** (marker khoá cho bộ nâng cấp, độc lập với `disabled`);
- **một** có lựa chọn khoá: option đó `selected data-locked` (**không** `disabled` → chính select gửi nó), **mọi option
  khác** `disabled data-native-only`, không option rỗng → không đổi / xoá được, `required` thoả;
- **nhiều**: option khoá đã chọn `disabled selected` (không gửi, không bỏ chọn được) + **một**
  `<input type="hidden" class="td-tree-select__locked" name value>` mỗi giá trị. Có ≥ 1 giá trị khoá → select **không**
  có `required` (trường đã khác rỗng — tránh `valueMissing` giả); host vẫn có `required`. **Thứ tự khi không JS:**
  các option đã chọn không khoá gửi **trước** (thứ tự cây), các mục khoá (input ẩn) gửi **sau** — cùng **tập** giá trị
  với bản đã nâng cấp (vốn gửi đúng thứ tự cây), chỉ khác thứ tự; server đừng dựa vào thứ tự;
- control `disabled` → input khoá cũng `disabled`: không gửi gì, như control native bị tắt.

> Server vẫn phải tự kiểm quyền / khoá — HTML gửi lên có thể bị sửa.

**Hai chế độ:**

- **Native** (mặc định): `<td-tree-select …>` (không dấu) + [nhãn] + select (+ input khoá). Không JS: select thường
  (kiểu field; `multiple` cao theo `size`). Nạp `@dazzxq/td-components/tree-select` → nâng cấp (có thể xô lệch chiều cao
  với `multiple`).
- **Element** (`'element' => true` / `ssr_elements`): thêm `data-td-ssr="tree-select@1"` + `value-label` (một) /
  `value-labels` (nhiều, JSON) = nhãn của giá trị đã chọn; **không** `size`. `td.css` tạo dáng select **đúng hộp ô chọn**
  (kích thước, padding, viền, bo góc, chữ) cho **cả một lẫn nhiều** (nhiều: cao một ô, cuộn được — vẫn dùng được khi
  không JS) → nâng cấp không xô lệch. Select đang focus lúc module nạp → chờ blur.

Kết quả (element, thực tế in liền một dòng):

```html
<td-tree-select data-td-ssr="tree-select@1" id="parent" label="Danh mục cha" placeholder="— Gốc —" allow-clear value-label="Apple">
  <label class="td-field__label" for="parent-select">Danh mục cha</label>
  <select class="td-tree-select__native" id="parent-select" name="parent_id">
    <option value="">— Gốc —</option>
    <option value="phone" data-level="0" data-label="Điện thoại">Điện thoại</option>
    <option value="apple" data-level="1" data-label="Apple" selected>&nbsp;&nbsp;Apple</option>
    <option value="samsung" data-level="1" data-label="Samsung" data-locked disabled>&nbsp;&nbsp;Samsung</option>
  </select>
</td-tree-select>
```

Không có helper cho `<td-tree>` dạng cây luôn hiện (cây quyền là trang admin có JS).

## td_number_input (0.30.0)

```php
<?= td_number_input('price', $product->price, ['label' => 'Giá bán', 'suffix' => '₫', 'unit_label' => 'đồng', 'required' => true, 'min' => '1000']) ?>
<?= td_number_input('rate', '12.5', ['label' => 'Tỉ lệ', 'suffix' => '%', 'decimals' => 2, 'max' => '100', 'element' => true]) ?>
<?= td_number_input('adjust', null, ['label' => 'Điều chỉnh', 'min' => '-1000000', 'error' => $errors['adjust'] ?? '']) ?>
```

`td_number_input($name, string|int|null $value = null, $opts)` in ô nhập số / tiền của
[Number input](../components/number-input.md) (hợp đồng `number-input@1`). Giá trị **luôn ở dạng chuẩn** (`12990000`,
`12.5`) — form gửi số sạch cả khi không có JS.

- **Mặc định (native)**: `div.td-field.td-number` > [nhãn] + `div.td-number__box` > [tiền tố] `input.td-number__control`
  `type="number"` (`name`, `value` chuẩn, `min` = `min` hoặc **`0`** khi vắng — không nhận số âm, `max`, `step` = `step`
  hoặc `10^-decimals` — `1`, `0.01`…, `required`, `inputmode`) [hậu tố] [chữ đơn vị ẩn] + footer (lỗi / ghi chú) + live
  region. Trình duyệt tự kiểm khoảng / bước / ký tự và gửi số sạch. **Không có dấu phân cách hàng nghìn khi chưa có
  JS** (giới hạn của `type=number`); `td.css` ẩn nút xoay để hộp giống hệt bản có JS.
- **Chế độ element** (`'element' => true` hoặc `Td::configure(…, ['ssr_elements' => true])`; `'element' => false` giữ
  native): host `<td-number-input data-td-ssr="number-input@1">` (+ attribute của component) + đúng cây trên với giá trị
  **chuẩn** (không in sẵn `12.990.000`: không-JS submit chuỗi đó thì `(int) "12.990.000"` = 12). Nạp
  `@dazzxq/td-components/number-input` thì component nhận **tại chỗ**: cùng node input (giá trị người dùng đã gõ, focus),
  đổi `type` → `text`, dựng ElementInternals rồi gỡ `name` / `value` / `min` / `max` / `step` / `required`, định dạng hiển
  thị (`12.990.000`). Con trỏ không được khôi phục (có thể về cuối ô — ca hiếm: đang gõ đúng lúc module tải). Markup bị
  sửa → render an toàn ngay, giữ giá trị + focus.

| Option | Ý nghĩa |
|---|---|
| `$name` | tên field (rỗng → không có `name`) |
| `$value` | **chỉ `string` hoặc `int`** — `float` (`12.5`, `INF`, `NAN`), `bool`, mảng… bị **từ chối** + cảnh báo (không ép kiểu: `12.5` không lặng lẽ thành `12`; muốn số lẻ thì truyền chuỗi `'12.5'`). Giá trị mặc định, **dạng chuẩn**: `-?(0\|[1-9][0-9]*)(\.[0-9]+)?`, ≤ 30 chữ số, không nhiều chữ số lẻ hơn `decimals`; `int` được nhận. Sai (`'12.990.000'`, `'1,5'`, `'1e5'`, `'1.234'` với `decimals=2`…) → **bỏ** + một `E_USER_WARNING` (không làm tròn, không cắt). `'-0'` → `0` |
| `min`, `max`, `step` | cùng cổng kiểm và cùng luật kiểu (`string` / `int`) như `$value` (sai → bỏ + cảnh báo). `step` phải **> 0** (`0` / âm → bỏ + cảnh báo, in bước mặc định) |
| `decimals` | số chữ số lẻ tối đa, `0`–`10` (mặc định `0`) |
| `group_separator` | `'.'` (mặc định) \| `','` \| `' '` \| `''` (không nhóm) — chỉ có tác dụng khi có JS |
| `decimal_separator` | `','` (mặc định; `'.'` khi nhóm là `','`) \| `'.'`; trùng dấu nhóm → bỏ |
| `prefix`, `suffix` | đơn vị trang trí trong hộp (`$`, `₫`, `%`), `aria-hidden` |
| `unit_label` | chữ đọc cho đơn vị (ví dụ `đồng`); mặc định = `suffix` / `prefix`. In trong `span#{base}-unit[hidden]`, nối vào `aria-describedby` |
| `label`, `hint`, `error`, `placeholder` | như `td_field` (nhãn có `*` khi `required`; `error` → `span.td-field-error` + `aria-invalid`) |
| `required`, `disabled`, `readonly` | native trên input (element: cả trên host) |
| `clamp` | element: attribute `clamp` trên host (kẹp vào khoảng khi rời ô — chỉ có JS) |
| `size` | `sm` \| `md` (mặc định) \| `lg` |
| `aria_label` | tên truy cập khi **không** có `label` |
| `id` | id của **input** (`<label for>` của site). Element: host = `{id}-host`; native: ghi chú / lỗi / đơn vị = `{id}-note`… |
| `class` | native → wrapper `div.td-field`; element → host |
| `attrs` | attribute thêm trên **input** (allowlist). Giữ chỗ (bị bỏ, không phân biệt hoa thường): `type` `class` `id` `inputmode` `autocomplete` `spellcheck` `name` `value` `min` `max` `step` `placeholder` `required` `aria-required` `disabled` `readonly` `aria-label` `aria-labelledby` `aria-describedby` `aria-invalid` `aria-errormessage` `pattern` `maxlength` `minlength` `list` + mọi `data-td-*` |

```html
<!-- td_number_input('price', '12990000', ['label' => 'Giá bán', 'suffix' => '₫', 'required' => true, 'element' => true]) -->
<td-number-input data-td-ssr="number-input@1" id="td-price-1" name="price" value="12990000" label="Giá bán" required suffix="₫">
  <div class="td-field td-field--md td-number">
    <label class="td-field__label" id="td-price-1-label" for="td-price-1-control">Giá bán<span class="td-field__required" aria-hidden="true"> *</span></label>
    <div class="td-number__box">
      <input type="number" class="td-number__control" id="td-price-1-control" inputmode="numeric" autocomplete="off" spellcheck="false"
             name="price" value="12990000" min="0" step="1" required aria-required="true" aria-describedby="td-price-1-unit">
      <span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span><span id="td-price-1-unit" hidden>₫</span>
    </div>
    <div class="td-field__footer" hidden><div class="td-field__note" id="td-price-1-note" hidden></div></div>
    <span class="td-sr-only" id="td-price-1-status" role="status"></span>
  </div>
</td-number-input>
```

Cảnh báo (`E_USER_WARNING`) chỉ ghi tên option, kiểu PHP và độ dài (`value (string, 19 chars)`) — **không bao giờ** in giá trị
thô vào log.

Server **vẫn phải kiểm** giá trị nhận được (khoảng, bước, số lẻ) và lưu bằng `BIGINT` / `DECIMAL` — đừng ép qua `float`.
Laravel: `ConvertEmptyStringsToNull` biến ô trống (`''`) thành `null` — rỗng **không bao giờ** thành `0`.

**Repeater:** không có helper PHP — nội dung dòng là markup của app. Mẫu Blade / PHP ở
[Repeater › Lưu ý](../components/repeater.md#lưu-ý--lỗi-thường-gặp).

## td_masked_value (0.31.0)

```php
<?php
// che theo loại dữ liệu là logic của app (server): SĐT giữ 2 số đầu + 3 số cuối
$masked = mb_substr($phone, 0, 2) . str_repeat('x', max(0, mb_strlen($phone) - 5)) . mb_substr($phone, -3);
?>
<?= td_masked_value($masked, ['label' => 'SĐT khách', 'attrs' => ['data-id' => (string) $customer->id]]) ?>
<?= td_masked_value('***', ['label' => 'Giá vốn', 'duration' => 15, 'copyable' => true]) ?>
```

`td_masked_value($masked, $opts)` **luôn** in phần tử [Masked value](../components/masked-value.md) đầy đủ (hợp đồng
`masked-value@1`; option `element` / `ssr_elements` không đổi gì): host `<td-masked-value data-td-ssr="masked-value@1"
class="td-masked">` + `span.td-masked__text` (chuỗi che) + nút `button.td-masked__toggle` (SVG `eye` có sẵn) + live
region. `$masked` là **chữ** (escape).

**Chữ ký không có tham số giá trị thật — cố ý.** Giá trị thật phải đi qua endpoint có quyền + 2FA + audit, lấy bằng hook
`reveal()` của phần tử. In nó vào HTML (kể cả `hidden` / `data-*` / JSON nhúng) là lộ qua mã nguồn trang, cache,
bfcache, extension, log — và vô hiệu audit. Helper cũng không có hàm che: che theo loại dữ liệu là logic của app.

- **Không JS**: chỉ thấy chuỗi che; nút giữ chỗ nhưng ẩn (`visibility: hidden`) — không có nút chết, không xô lệch.
- **Nạp `@dazzxq/td-components/masked-value`**: nhận markup **tại chỗ** (cùng node). Trang PHP gán hook **một lần**:

```js
import { TdMaskedValue } from '@dazzxq/td-components/masked-value';
TdMaskedValue.reveal = async ({ element, signal }) => {
  const res = await fetch(`/admin/customers/${element.dataset.id}/phone`, { method: 'POST', signal, headers: { 'X-CSRF-Token': csrf } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).phone;
};
```

| Option | Ý nghĩa |
|---|---|
| `label` | đây là gì — nút đọc "Hiện {label}" (attribute `label` trên host). Rỗng / không truyền → "giá trị" (không in `label`) |
| `duration` | giây trước khi tự che: ép số nguyên, kẹp [2, 600] như component; không phải số → không in (component dùng 30) |
| `copyable` | `true` → nút copy (td-copy `sensitive`) khi đang hiện |
| `disabled` | `true` → nút `aria-disabled` |
| `id`, `class` | trên host (`class` sau `td-masked`) |
| `attrs` | trên **host** (allowlist + `aria-*` / `data-*`, vd. `data-id` cho hook). Giữ chỗ — bị bỏ, không phân biệt hoa thường: `id` `class` `masked` `label` `duration` `copyable` `disabled` `aria-busy` + mọi `data-td-*` |

```html
<!-- td_masked_value('09xx xxx 123', ['label' => 'SĐT khách', 'attrs' => ['data-id' => 'c-1']]) -->
<td-masked-value data-td-ssr="masked-value@1" class="td-masked" masked="09xx xxx 123" label="SĐT khách" data-id="c-1">
  <span class="td-masked__text" translate="no">09xx xxx 123</span>
  <button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="Hiện SĐT khách" data-tooltip="Hiện SĐT khách">
    <span class="td-masked__icon" data-td-icon="eye" aria-hidden="true"><svg class="td-icon …" data-icon="eye" …>…</svg></span>
  </button>
  <span class="td-sr-only" role="status"></span>
</td-masked-value>
```

(Thực tế in liền một dòng.) Site đã đổi `TdMaskedValue.labels.value` / `.show` mà không truyền `label` → tên nút PHP khác
tên component render → component render lại (vẫn đúng, chỉ mất lợi ích "tại chỗ").

**Sortable:** không có helper PHP — mục là markup của app, tay nắm chỉ có nghĩa khi có JS. Mẫu ở
[Sortable › Hợp đồng markup](../components/sortable.md#1-hợp-đồng-markup).

## td_media_field (0.32.0)

```php
<?= td_media_field('hero', $post->hero_media_id, [
    'label'        => 'Ảnh đại diện',
    'aspect_ratio' => '3/2',
    'required'     => true,
    'preview_src'  => $hero?->thumb_url,     // URL hiển thị, KHÔNG phải giá trị form
    'preview_alt'  => $hero?->original_name,
    'error_text'   => $errors['hero'] ?? '',
]) ?>

<?= td_media_field('og', $seo->og_media_id, [
    'label' => 'Ảnh chia sẻ (OG)', 'aspect_ratio' => '1.91', 'usage' => true,
    'alt'   => $seo->og_alt, 'crop' => $seo->og_crop,   // ['x' => 0.1, 'y' => 0, 'width' => 0.8, 'height' => 1] | null
    'preview_src' => $og?->thumb_url, 'preview_alt' => $og?->original_name,
]) ?>
```

`td_media_field($name, string|int|null $assetId = null, $o)` in ô chọn ảnh của [Media field](../components/media-field.md)
(hợp đồng `media-field@1`). **Luôn element mode** — không có control native nào chọn được ảnh từ thư viện, nên không có
option `element` và `ssr_elements` không ảnh hưởng. Helper **không** in endpoint, quyền, envelope hay `MediaAsset`
serialize: adapter là JS của site ([Media picker](../components/media-picker.md#cấu-hình-mặc-định--configuredefaults)).

- **Không có JS:** host + khung + ảnh xem trước có dáng ngay; nút mở / Đổi / Gỡ `visibility: hidden` (giữ chỗ, không có
  nút chết). Form vẫn gửi **đúng** hình dạng của component nhờ hidden input:
  - reference: `<input type="hidden" class="td-media-field__value" name="hero" value="{assetId}">` (rỗng → `hero=`);
  - usage: hidden `name="og[id]"`, ô alt thật `name="og[alt]"`, hidden `.td-media-field__crop` `name="og[crop]"`
    (`null` hoặc JSON v1); 0.35 + `focal_point`: hidden `.td-media-field__focal` `name="og[focal]"` (`null` hoặc JSON v1).
- **Có JS:** nạp `@dazzxq/td-components/media-field` → nhận markup **tại chỗ** (cùng node nút / ảnh, không xô lệch),
  đặt giá trị vào ElementInternals **trước**, rồi gỡ hidden input + bỏ `name` của ô alt → FormData giống từng byte, đúng
  một bộ mục. Markup bị sửa / thuộc tính lạ → render an toàn, giữ value / alt đang gõ / focus.
- `required` khi chưa có JS **không** được trình duyệt kiểm (hidden input không validate) → server luôn validate.

| Option | Ý nghĩa |
|---|---|
| `$name` | tên field (rỗng → không in `name`, không gửi). `usage` + tên kết thúc `[]` → không in `name` nào (không hidden input, ô alt không `name`) + một `E_USER_WARNING` — giống JS |
| `$assetId` | `assetId` hiện tại (`string` / `int`; `null` / `''` = rỗng → hidden `value=""`) |
| `label`, `helper_text`, `error_text`, `prompt` | nhãn (có `*` khi `required`), ghi chú (`span.td-media-field__help`), lỗi (`span.td-field-error` + `aria-invalid` trên nút mở), chữ khung rỗng (mặc định theo loại đầu của `accept_kind`) — đều là text |
| `required` | thuộc tính trên host (chỉ có tác dụng khi có JS — không-JS: server validate) |
| `disabled` | host + nút mở / Đổi / Gỡ + ô alt **và các hidden input** đều `disabled` → không gửi gì (như control native) |
| `aspect_ratio` | `'3/2'` \| `'3:2'` \| `'1.91'` — cùng luật với JS (`W/H`, `W:H` hoặc một số; mỗi phần > 0, ≤ 10000, ≤ 4 chữ số thập phân, không dấu / `e`). Sai → bỏ + một `E_USER_WARNING` |
| `preview_fit` | `'cover'` (mặc định, không in) \| `'contain'` |
| `preview_src` | URL ảnh xem trước (chỉ hiển thị). **Với `croppable` (0.35.0) phải là ảnh nguyên, không cắt sẵn** (bất kỳ cỡ) — trang không có adapter JS dùng chính ảnh này cho hộp cắt. Qua `Td::safeUrl()` (bỏ tab / xuống dòng, cắt khoảng trắng; **`http:` chỉ khi site bật `Td::allowHttpLinks(true)`**), rồi chỉ giữ `https:` / `http:` hoặc URL **không scheme** (tương đối, `/…`, `//cdn…`); `mailto:` / `tel:` / `data:` / `javascript:`… và chuỗi > 8192 ký tự → không in `<img>` (khung hiện icon + `preview_alt`, hoặc "Đã chọn (không có ảnh xem trước)") |
| `preview_alt` | tên đọc của asset đang chọn ("Đã chọn: {preview_alt}"; vắng mà có ảnh → "Đã chọn: {assetId}"); tên file khi `kind = 'file'` |
| `kind` | `'image'` (mặc định) \| `'video'` (poster + nhãn "Video") \| `'file'` (icon + tên, không `<img>`) |
| `accept_kind` | chuỗi `'image, video'` (cách bằng dấu phẩy / khoảng trắng) hoặc mảng; giá trị lạ bị bỏ, rỗng → `image`. In ra host dạng `accept-kind="image video"` |
| `usage` | `true` → ô alt + hidden `name[id]` / `name[crop]` + `name[alt]` trên ô alt |
| `alt` | alt mặc định (usage), cắt 500 ký tự |
| `crop` | mảng `['x' => …, 'y' => …, 'width' => …, 'height' => …]` (số, chuẩn hoá 0..1) **hoặc** chuỗi JSON v1 (`{"v":1,…}` — nên in lại được nguyên `$_POST['og']['crop']` sau lỗi validate). `null` / `''` / `'null'` → `null` im lặng; sai (thiếu / thừa key, ngoài 0..1, `x + width > 1`…) → `null` + một `E_USER_WARNING` |
| `croppable` (0.35.0) | `true` → in nút "Cắt ảnh" `.td-media-field__crop-btn` (ẩn tới khi JS chạy, như Đổi / Gỡ) + `span.td-media-field__status` (`role="status"`, báo lỗi nguồn ảnh). Bốn option 0.35 cần `usage`: thiếu → bỏ cả bốn + một `E_USER_WARNING` (fail closed) |
| `crop_ratio` (0.35.0) | `'1.91'` \| `'16/9'` \| `'16:9'` \| `'free'` → thuộc tính `crop-ratio`. Vắng → JS theo `aspect_ratio`, rồi tự do. Sai hoặc tỉ lệ ngoài **[0.01, 100]** → bỏ + một `E_USER_WARNING` (bảng `CROP_RATIO_CASES` JS = PHP) |
| `focal_point` (0.35.0) | `true` (+ `usage`) → in hidden `input.td-media-field__focal` `name="og[focal]"` (mục thứ tư, sau `og[crop]`) |
| `focal` (0.35.0) | mảng `['x' => …, 'y' => …]` (0..1) **hoặc** chuỗi JSON v1 `{"v":1,"x","y"}` (in lại được nguyên `$_POST['og']['focal']`). `null` / `''` / `'null'` → `null` im lặng; sai → `null` + một `E_USER_WARNING` |
| `id` | id của **host**; id con suy ra: `{id}-label`, `{id}-state`, `{id}-alt`, `{id}-help`, `{id}-error`. Không có → id duy nhất trong request (`td-{name}-{n}`) |
| `class` | class thêm trên host (sau `td-media-field`) |
| `attrs` | attribute thêm trên host (allowlist chung + `data-*`). Tên component tự đọc (`id` `class` `name` `label` `aspect-ratio` `preview-fit` `accept-kind` `usage` `required` `disabled` `value` `preview-src` `preview-alt` `kind` `alt` `crop` `prompt` `helper-text` `error-text`; 0.35: `croppable` `crop-ratio` `focal-point` `focal`) và mọi `data-td-*` bị bỏ |

Nhãn in sẵn là **tiếng Việt mặc định** (`Td::MEDIA_FIELD_LABELS`, giống `TdMediaField.labels`). Site đổi
`TdMediaField.labels` trong JS → chữ in sẵn không khớp `render()` → lúc nâng cấp field **render lại an toàn** (không nhận
tại chỗ; giá trị, alt đang gõ, focus vẫn giữ — chỉ mất lợi ích "không nháy").

**`http:` ở PHP và JS khác điều kiện:** PHP nhận `http:` khi site bật `Td::allowHttpLinks(true)`; JS (`safeMediaUrl`)
nhận `http:` chỉ khi **trang** là `http:`. Trang `https:` có ảnh xem trước `http:` → PHP in `<img>` nhưng JS từ chối URL đó
→ render lại không có ảnh. Dùng URL `https:` hoặc tương đối.

```html
<!-- td_media_field('og', 'm2', ['label' => 'Ảnh OG', 'aspect_ratio' => '1.91', 'usage' => true, 'alt' => 'Mô tả có sẵn',
     'crop' => ['x' => 0.1, 'y' => 0, 'width' => 0.5, 'height' => 1], 'preview_src' => '/test/fixtures/2.svg',
     'preview_alt' => 'og.jpg'])  — nguyên văn từ fixture test/ssr/fixtures/media-field.html (case usage-full),
     chỉ thêm xuống dòng giữa các phần -->
<td-media-field data-td-ssr="media-field@1" id="td-og-4" class="td-media-field" name="og" label="Ảnh OG" aspect-ratio="1.91" usage value="m2" preview-src="/test/fixtures/2.svg" preview-alt="og.jpg" alt="Mô tả có sẵn" crop="{&quot;v&quot;:1,&quot;x&quot;:0.1,&quot;y&quot;:0,&quot;width&quot;:0.5,&quot;height&quot;:1}">
<span class="td-media-field__label" id="td-og-4-label">Ảnh OG</span>
<div class="td-media-field__frame" data-state="filled" data-kind="image"><svg class="td-media-field__sizer" viewBox="0 0 1.91 1" aria-hidden="true" focusable="false"></svg><button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="td-og-4-label td-og-4-state"><img class="td-media-field__img" src="/test/fixtures/2.svg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="td-sr-only" id="td-og-4-state">Đã chọn: og.jpg</span></button></div>
<div class="td-media-field__actions"><button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog">Đổi ảnh</button><button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button></div>
<input type="hidden" class="td-media-field__value" name="og[id]" value="m2">
<div class="td-field td-media-field__usage"><label class="td-field__label" for="td-og-4-alt">Mô tả ảnh (alt)</label><input type="text" class="td-field__control td-media-field__alt" id="td-og-4-alt" maxlength="500" name="og[alt]" value="Mô tả có sẵn"></div>
<input type="hidden" class="td-media-field__crop" name="og[crop]" value="{&quot;v&quot;:1,&quot;x&quot;:0.1,&quot;y&quot;:0,&quot;width&quot;:0.5,&quot;height&quot;:1}">
</td-media-field>
```

Nguồn chuẩn của markup là fixture `test/ssr/fixtures/media-field.html` (sinh từ PHP bằng
`test/ssr/build-media-field-fixture.mjs`, test so với `render()` của JS — đủ các case: rỗng, có ảnh, usage, contain,
video, file, disabled, lỗi, URL độc, `name[]`, `attrs`, XSS).
Đọc giá trị ở server (Laravel / PHP thuần, `crop = 'null'`): [Media field › Hai dạng gửi form](../components/media-field.md#1-hai-dạng-gửi-form-api-công-khai-chốt-từ-032).
Cảnh báo (`E_USER_WARNING`) chỉ ghi tên option và kiểu, không in giá trị thô.

## td_media_gallery (0.43.0)

```php
<?= td_media_gallery('gallery', array_map(fn ($u) => [
        'id'   => $u->asset_id,                    // string | int (int → chuỗi thập phân, 0 → "0")
        'src'  => $u->thumb_url,                   // chỉ để hiển thị; td__media_url (https: / tương đối)
        'name' => $u->original_name,
        'alt'  => $u->alt_text,                    // ≤ 500
        'crop' => $u->crop,                        // ['x' =>…, 'y' =>…, 'width' =>…, 'height' =>…] | '{"v":1,…}' | null
        'focal' => $u->focal,                      // ['x' =>…, 'y' =>…] | '{"v":1,…}' | null
    ], $product->galleryUsages), [
    'label' => 'Ảnh sản phẩm', 'usage' => true, 'croppable' => true, 'focal_point' => true, 'cover' => true,
    'max' => 10, 'aspect_ratio' => '1/1', 'helper_text' => 'Ảnh đầu là ảnh bìa',
]) ?>
```

`td_media_gallery(string $name, array $items = [], array $o = [])` in [Media gallery](../components/media-gallery.md)
(hợp đồng `media-gallery@1`, [ADR 0021](../internal/decisions/0021-media-gallery-form-shape.md)). **Luôn element mode.**
Không in endpoint, quyền hay asset serialize.

- **Không có JS:** lưới ô có dáng ngay; tay nắm / Cắt / Gỡ / Thêm `visibility: hidden` (giữ chỗ). Form gửi **đúng** hình
  dạng của component, theo thứ tự server in, alt sửa được (ô nhập thật có `name`):
  - reference: mỗi ô `<input type="hidden" class="td-media-gallery__value" name="gallery[]" value="{id}">`;
  - usage: hidden `name="gallery[i][id]"`, ô alt `name="gallery[i][alt]"`, hidden `.td-media-gallery__crop`
    `name="gallery[i][crop]"` (+ `.td-media-gallery__focal` `name="gallery[i][focal]"` với `focal_point`);
  - rỗng: **một** hidden `name="gallery" value=""` ngay sau lưới.
- **Có JS:** nạp `@dazzxq/td-components/media-gallery` → nhận markup **tại chỗ** (cùng node ô / ảnh / ô alt, chữ đang gõ
  giữ nguyên), ElementInternals nhận FormData **trước**, rồi gỡ hidden input + `name` / `value` của ô alt. Markup lệch
  (sửa tay, nhãn site đổi, URL độc, crop hỏng…) → render lại an toàn, giữ alt đang gõ + focus.
- `$items` đi qua `td__media_gallery_items()` = `validateItems()` của JS (bảng `GALLERY_CASES` chung).

| Option | Ý nghĩa |
|---|---|
| `label`, `helper_text`, `error_text`, `prompt` | nhãn (có `*` khi `required`), ghi chú, lỗi (`aria-invalid` trên nút Thêm), chữ khung rỗng — đều là text |
| `required`, `min`, `max` | `max` 1…100 (lớn hơn → 100, sai → bỏ; vắng = 100); `min` kẹp ≤ `max`. Không JS thì trình duyệt không kiểm được (hidden input): **kiểm ở server** |
| `disabled` | mọi nút, ô alt và hidden input `disabled` (không gửi gì) |
| `usage` | dạng `name[i][id\|alt\|crop]` + ô alt |
| `croppable`, `crop_ratio`, `focal_point` | cần `usage` (thiếu → bỏ + một `E_USER_WARNING`); `crop_ratio` như field (`free`, `W/H`… trong [0.01, 100]) |
| `cover` | badge "Ảnh bìa" trên ô đầu |
| `aspect_ratio`, `preview_fit`, `accept_kind` | tỉ lệ ô (mặc định 1:1), `cover`/`contain`, loại nhận (chữ "ảnh" / "video" / "file") |
| `id`, `class`, `attrs` | host id (id con suy ra từ nó), class thêm, `attrs` theo allowlist (tên của component + `data-td-*` bị chặn) |

**Fail closed / vượt `max`** (không bao giờ thành "xoá hết"):

- `$items` không phải list, > 100 item, item không phải mảng, id thiếu / rỗng / không phải string-int / dài quá 512 /
  trùng (sau khi đổi int → chuỗi), JSON `items` > 256 KiB, hoặc `name` kết thúc `[]` → in trạng thái lỗi "Không đọc được
  danh sách ảnh", **không có input nào**, attribute `items="[null]"` (JS cũng fail closed) + **một** `E_USER_WARNING`
  chỉ nêu lý do và số lượng — không bao giờ in giá trị.
- Nhiều item hơn `max` (≤ 100) → in đủ ô nhưng **không control nào có `name`** + một `E_USER_WARNING` với hai con số. Server
  thấy "không có key" → giữ nguyên.
- Trường lẻ hỏng thì cắt / bỏ im lặng: alt > 500 / `name` > 512 (cắt theo code point), crop / focal sai → `null`, `src`
  không an toàn / UTF-8 hỏng / > 8192 byte → không có ảnh (item giữ), `name` / `alt` UTF-8 hỏng → rỗng, `kind` lạ → `image`.
  Mọi chuỗi bị giới hạn **trước** khi mã hoá JSON; không bao giờ ném `JsonException`.

Ví dụ rút gọn (icon SVG lược bớt; nguyên văn ở `test/ssr/fixtures/media-gallery.html`, case `usage`):

```html
<td-media-gallery data-td-ssr="media-gallery@1" id="td-g-3" class="td-media-gallery" name="g" label="Gallery" items="[{&quot;id&quot;:&quot;m1&quot;,…}]" usage croppable crop-ratio="1:1" focal-point cover aspect-ratio="1/1" min="1" max="4">
<div class="td-media-gallery__head"><span class="td-media-gallery__label" id="td-g-3-label">Gallery</span><span class="td-media-gallery__count" id="td-g-3-count">2/4 ảnh</span></div>
<ul class="td-media-gallery__list" role="list" aria-labelledby="td-g-3-label" aria-describedby="td-g-3-count">
<li class="td-media-gallery__item" data-kind="image"><div class="td-media-gallery__media"><svg class="td-media-gallery__sizer" viewBox="0 0 1 1" aria-hidden="true" focusable="false"></svg><img class="td-media-gallery__img" src="/test/fixtures/1.svg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="td-media-gallery__cover">Ảnh bìa</span><button type="button" class="td-sortable__handle td-media-gallery__handle" aria-label="Sắp xếp Ảnh 1 trên 2: Ảnh 1, ảnh bìa" aria-describedby="td-g-3-sort-help">…</button></div>
<div class="td-media-gallery__bar"><button type="button" class="td-media-gallery__btn td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="Cắt Ảnh 1 trên 2: Ảnh 1, ảnh bìa">…</button><button type="button" class="td-media-gallery__btn td-media-gallery__remove" aria-label="Gỡ Ảnh 1 trên 2: Ảnh 1, ảnh bìa">…</button></div>
<input type="hidden" class="td-media-gallery__value" name="g[0][id]" value="m1">
<label class="td-media-gallery__alt-field"><span class="td-sr-only">Mô tả ảnh 1 (alt)</span><input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="Mô tả (alt)" name="g[0][alt]" value="Áo thun trắng"></label>
<input type="hidden" class="td-media-gallery__crop" name="g[0][crop]" value="{&quot;v&quot;:1,…}"><input type="hidden" class="td-media-gallery__focal" name="g[0][focal]" value="{&quot;v&quot;:1,…}"></li>
…
</ul>
<button type="button" class="td-media-gallery__add" data-state="filled" aria-haspopup="dialog">…<span class="td-media-gallery__prompt">Thêm ảnh</span></button>
<span class="td-sr-only td-media-gallery__status" role="status"></span><span class="td-sr-only td-media-gallery__sort-status" role="status"></span><span class="td-media-gallery__sort-help" id="td-g-3-sort-help" hidden>…</span>
</td-media-gallery>
```

Nguồn chuẩn của markup là fixture `test/ssr/fixtures/media-gallery.html` (sinh bằng
`test/ssr/build-media-gallery-fixture.mjs`; test so với `render()` của JS trên ba engine — rỗng, reference, usage, kinds,
đủ, disabled, vượt `max`, id trùng, `name[]`, id số, lỗi, không tên, `attrs`, XSS). Đọc giá trị ở server (Laravel / PHP
thuần, ba trạng thái): [Media gallery › Hai dạng gửi form](../components/media-gallery.md#1-hai-dạng-gửi-form-api-công-khai-adr-0021).

## td_scan_input (0.38.0)

```php
<?= td_scan_input('order', ['label' => 'Mã đơn hàng', 'required' => true, 'placeholder' => 'Quét mã vạch trên phiếu']) ?>
<?= td_scan_input('order', ['label' => 'Mã đơn hàng', 'element' => true, 'value' => $order->code, 'beep' => true]) ?>
<?= td_scan_input('imei[]', ['multiple' => true, 'label' => 'IMEI nhập kho', 'values' => $receipt->imeis, 'max' => 50, 'inputmode' => 'numeric']) ?>
```

`td_scan_input($name, $opts)` in ô của [Scan input](../components/scan-input.md) (hợp đồng `scan-input@1`).

- **Đơn, mặc định (native)**: `div.td-scan` > [nhãn] + `div.td-scan__box` > `input.td-scan__input` (`type="text"`,
  `autocomplete` / `autocapitalize` / `autocorrect="off"`, `spellcheck="false"`, `enterkeyhint="done"`, `name`, `value`,
  `required`…) [+ dòng lỗi]. Không JS: Enter của máy quét **submit form** (chấp nhận khi không có JS).
- **Đơn, chế độ element** (`'element' => true` hoặc `ssr_elements`): host `<td-scan-input data-td-ssr="scan-input@1">` +
  cùng ô; module nhận **tại chỗ** qua cổng chung của form (giữ node input, chữ đang gõ, focus), rồi gỡ `name` / `value` /
  `required` khỏi input (FormData đúng một mục).
- **`multiple`** (luôn element, `element => false` không đổi gì): host `[multiple]` > `div.td-scan[data-mode="multiple"]` >
  [nhãn] + box > input (**không** `name`) + `textarea.td-scan__fallback[name]` (nhập tay khi không có JS, mỗi dòng một mã)
  + `ul.td-scan__list` > `li.td-scan__item[data-value]` > `span.td-scan__value` mỗi mã; rồi một
  `input[type=hidden].td-scan__hidden[name][value]` mỗi mã (cùng thứ tự), dòng lỗi cuối. `values` = **trạng thái hợp lệ
  đã có** (kit không gọi lại `validate`, cũng là mặc định `form.reset()`). Không JS: **server phải tách dòng** mục textarea
  (một mục `imei[]` có thể chứa nhiều dòng) — xem ví dụ ở [trang component](../components/scan-input.md#php-ssr).

| Option | Ý nghĩa |
|---|---|
| `$name` | tên field (`multiple`: nên kết thúc `[]`) |
| `label` / `aria_label` | nhãn `label.td-scan__label[for]` / tên truy cập khi không có nhãn (mặc định `Mã quét`) |
| `value` (đơn) / `values` (`multiple`) | chuẩn hoá như component: bỏ ký tự điều khiển C0 / C1, trim, ≤ 128 code point; `values` bỏ rỗng / trùng, tối đa 1000 |
| `placeholder`, `inputmode` | truyền vào input (`inputmode` ngoài `none` / `text` / `numeric` / `decimal` / `tel` / `search` / `email` / `url` → bỏ) |
| `min_length` (1–64), `max` (`multiple`, ≥ 1), `beep` | attribute của host (`min-length`, `max`, `beep`); giá trị sai → bỏ |
| `required`, `disabled` | đơn: native trên input; `multiple`: `disabled` trên input / textarea / hidden; cả trên host |
| `error` | dòng lỗi `span.td-field-error` (+ `aria-invalid` trên input ở chế độ đơn); element: `error-text` trên host |
| `id` | id của **input**; element: host = `{id}-host` (giống `td_otp_input`) |
| `class` | native → wrapper `div.td-scan`; element → host |
| `attrs` | attribute thêm trên **input** (allowlist). Giữ chỗ: `type` `class` `id` `autocomplete` `autocapitalize` `autocorrect` `spellcheck` `enterkeyhint` `inputmode` `placeholder` `name` `value` `required` `disabled` `readonly` `autofocus` `maxlength` `minlength` `pattern` `aria-label` `aria-labelledby` `aria-invalid` `aria-errormessage` `aria-describedby` + mọi `data-td-*` |

Markup `multiple` bị sửa (hidden lệch danh sách, hidden thừa, `formaction`…) → component render an toàn, danh sách
**rỗng** + một cảnh báo console (không lấy giá trị từ markup đáng ngờ); server vẫn là nguồn sự thật khi lưu.

## td_filter_chips (0.39.0)

```php
<?php
// URL "không còn bộ lọc này" do server tính (bỏ luôn page — về trang 1)
$without = static function (string $key, ?string $value = null): string {
    $q = $_GET;
    if ($value !== null && is_array($q[$key] ?? null)) {
        $q[$key] = array_values(array_diff($q[$key], [$value]));
    } else {
        unset($q[$key]);
    }
    unset($q['page']);
    return '?' . http_build_query($q);
};
$items = [['key' => 'shop', 'label' => 'Kho', 'value' => 'Hà Nội', 'removable' => false]];
if (($_GET['status'] ?? '') !== '') {
    $items[] = ['key' => 'status', 'label' => 'Trạng thái', 'value' => $statusLabel[$_GET['status']] ?? '?', 'href' => $without('status')];
}
foreach ((array) ($_GET['tag'] ?? []) as $t) {               // nhiều giá trị: một item mỗi giá trị, cùng key, khác id
    $items[] = ['id' => 'tag-' . $t, 'key' => 'tag', 'label' => 'Nhãn', 'value' => (string) $t, 'href' => $without('tag', (string) $t)];
}
?>
<?= td_filter_chips($items, ['clear_href' => '?', 'empty_focus' => 'search-q']) ?>
```

`td_filter_chips($items, $opts)` **luôn** in phần tử [Filter chips](../components/filter-chips.md) đầy đủ (hợp đồng
`filter-chips@1`; `element` / `ssr_elements` không đổi gì). Không có item → host `hidden`.

- **Không JS**: chip hiện ngay (không nháy). Item có `href` an toàn → × là `<a href>` — bấm là sang trang không còn bộ lọc
  đó (server tính lại danh sách). Không `href` / `href` bị từ chối → × là nút chỉ chạy khi có JS (vô hình, giữ chỗ — không có
  nút chết). Tương tự "Xoá tất cả" với `clear_href`.
- **Nạp `@dazzxq/td-components/filter-chips`**: nhận markup **tại chỗ** (cùng node); × là link vẫn phát `filter-remove`
  (huỷ được) rồi để trình duyệt mở link.
- **Item**: `key`, `value` (bắt buộc), `label` (mặc định `key`), `id` (mặc định `key`; trùng → hậu tố `-2`, `-3`…),
  `removable` (mặc định `true`), `href`. `key` / `value` / `label` / `id` là chuỗi hoặc số; **mảng `value` bị từ chối** (một
  item mỗi giá trị) — item sai kiểu bị bỏ (một `E_USER_WARNING` cho cả lần gọi). Số kiểu float in như `String(n)` của JS. Ký tự điều khiển bị bỏ; cắt 200 / 500 / 200 / 200 ký tự
  (`key` / `value` / `label` / `id`) — **giống hệt** component (test parity PHP ↔ JS).
- **Chính sách URL** (`href`, `clear_href`): `Td::safeUrl()` rồi **chỉ URL tương đối** (`?…`, `#…`, `/đường-dẫn`,
  `đường-dẫn`) — không scheme (kể cả `https:`), không `//host`, không `\`: link "bỏ lọc" không bao giờ rời site (PHP không
  biết origin của trang; JS nhận thêm URL tuyệt đối **cùng origin**). Bị từ chối → × là nút chỉ-JS.
- Tối đa **200** item và **800** mục được xét (phần thừa bỏ + **một** `E_USER_WARNING`); item sai kiểu cũng chỉ **một** cảnh báo mỗi lần gọi.

| Option | Ý nghĩa |
|---|---|
| `label` | tên nhóm (mặc định "Bộ lọc đang áp dụng") — attribute `label` trên host |
| `clear_href` | "Xoá tất cả" là link (cùng chính sách URL); bị từ chối → nút chỉ-JS, không in |
| `empty_focus` | id phần tử nhận focus khi chip cuối bị bỏ (attribute `empty-focus`) |
| `id`, `class` | trên host |
| `attrs` | trên **host** (allowlist + `aria-*` / `data-*`). Giữ chỗ — bị bỏ: `id` `class` `label` `clear-href` `empty-focus` `hidden` + mọi `data-td-*` |

```html
<!-- td_filter_chips([['key' => 'status', 'label' => 'Trạng thái', 'value' => 'Đang bán', 'href' => '?q=ip']]) -->
<td-filter-chips data-td-ssr="filter-chips@1">
  <div class="td-filter-chips" role="group" aria-label="Bộ lọc đang áp dụng">
    <ul class="td-filter-chips__list" role="list">
      <li class="td-filter-chips__item" data-id="status" data-key="status" data-removable="true">
        <span class="td-filter-chips__label">Trạng thái</span><span class="td-filter-chips__sep" aria-hidden="true">: </span><span class="td-filter-chips__value">Đang bán</span>
        <a class="td-filter-chips__remove" href="?q=ip" aria-label="Bỏ lọc Trạng thái: Đang bán">
          <span class="td-filter-chips__icon" data-td-icon="close" data-td-icon-size="14" aria-hidden="true"><svg class="td-icon …" data-icon="close" …>…</svg></span></a>
      </li>
    </ul>
  </div>
  <p class="td-sr-only" role="status"></p>
</td-filter-chips>
```

(Thực tế in liền một dòng.) Markup bị sửa (thuộc tính lạ, `aria-label` không khớp, `href` không an toàn…) → component
**không nhận**: render rỗng + một cảnh báo; app gán `items` từ JS thì `items` thắng.

## td_datetime_range (0.40.0)

```php
<?= td_datetime_range('range', $_GET['range']['start'] ?? null, $_GET['range']['end'] ?? null, ['label' => 'Thời gian', 'max_days' => 92]) ?>
<?= td_datetime_range('promo', $promo->starts_at, $promo->ends_at, ['mode' => 'datetime', 'minute_step' => 15, 'required' => true]) ?>
<?= td_datetime_range('filter', $from, $to, ['start_name' => 'date_from', 'end_name' => 'date_to', 'required' => 'start']) ?>
```

`td_datetime_range($name, $start, $end, $opts)` in khoảng ngày của [Datetime range](../components/datetime-range.md)
(hợp đồng `datetime-range@1`, **luôn element**):

```
<td-datetime-range data-td-ssr="datetime-range@1" id name mode [start end start-name end-name label placeholder min max
                   max-days minute-step form-value-format required disabled error-text] [attrs…]>
  <div class="td-dtr" data-state="closed">
    [<span class="td-field__label td-dtr__label" id="{id}-label">nhãn[ *]</span>]
    <div class="td-dtr__natives" role="group" [aria-labelledby]>
      <label class="td-dtr__native-label" for="{id}-start">Từ</label>
      <input class="td-dtr__native" type="date|datetime-local" id="{id}-start" data-part="start" name value min max required disabled>
      <label class="td-dtr__native-label" for="{id}-end">Đến</label>
      <input class="td-dtr__native" … data-part="end" …>
    </div>
    <button type="button" class="td-dtr__trigger" …>…</button>   ← anh em của khối native, ẩn khi chưa có JS
  </div>
  [<span class="td-field-error" id="{id}-error" data-for="{id}">lỗi</span>]
</td-datetime-range>
```

- **Không JS**: hai ô ngày native gửi `{name}[start]` / `{name}[end]` (mốc trống = chuỗi rỗng); trình duyệt kiểm `min` /
  `max` / `required` đúng từng mốc.
- **Có JS** (nạp module `datetime-range`): component nhận markup **tại chỗ** qua cổng **riêng** (cổng chung của form chỉ
  cho một control). Thứ tự: giá trị (property gán sớm > **giá trị đang có trong ô native** > thuộc tính) → FormData của host
  → gỡ `name` / `value` / `required` / `min` / `max` rồi xoá khối native (FormData còn **đúng một** cặp) → ô native đang
  focus thì focus chuyển sang trigger. `form.reset()` về giá trị server in ra.
- Markup lệch (input / button thừa, `formaction`, hai ô cùng `data-part`, `type` / `name` / `required` lệch host, trigger
  nằm trong khối native, thuộc tính lạ, ô icon có nội dung…) → render an toàn; giá trị sống chỉ lấy khi mỗi mốc có
  **đúng một** ô.

| Option | Ý nghĩa |
|---|---|
| `$name` | tên form → `{name}[start]` / `{name}[end]` (`''` → không `name`, cần `start_name` + `end_name`) |
| `$start`, `$end` | `dd/mm/yyyy[ - hh:mm]`, `yyyy-mm-dd`, `yyyy-mm-ddThh:mm[:ss]` hoặc DB `yyyy-mm-dd hh:mm[:ss]`; ngày không có / sai → **bỏ** (mốc trống). `datetime` + chỉ ngày: Từ 00:00, Đến 23:59 |
| `mode` | `date` (mặc định) \| `datetime` |
| `label`, `placeholder` | nhãn / chữ khi trống |
| `min`, `max` | cùng định dạng; in ra dạng native (`yyyy-mm-dd` / `yyyy-mm-ddThh:mm`; `max` chỉ ngày = 23:59) trên host **và** hai ô; sai → bỏ |
| `required` | `true` / `'both'` → cả hai (`required` trần); `'start'` / `'end'` → một mốc (`required="start"`); `false` / không có → không |
| `disabled`, `max_days` (≥ 1), `minute_step` (1–30, chia hết 60), `form_value_format` (`iso` / `display` / `db`) | attribute của host; giá trị sai → bỏ |
| `start_name`, `end_name` | ghi đè tên hai mục (dcms2: `date_from` / `date_to`) |
| `error` | `error-text` trên host + dòng lỗi + `aria-invalid` / `aria-describedby` trên hai ô native |
| `id`, `class` | id / class của **host** (ô native: `{id}-start` / `{id}-end`, trigger `{id}-trigger`) |
| `attrs` | attribute thêm trên **host** (allowlist). Giữ chỗ: `id` `class` `name` `mode` `start` `end` `start-name` `end-name` `label` `placeholder` `min` `max` `max-days` `minute-step` `form-value-format` `open-at` `required` `disabled` `error-text` `value` + mọi `data-td-*` |

Chữ "Từ" / "Đến" / placeholder = `Td::RANGE_LABELS` (= `TdDatetimeRange.labels`); site đổi chữ phía JS thì markup PHP bị
coi là lệch → render an toàn (vẫn đúng giá trị).

## td_steps (0.45.0)

```php
<?= td_steps([
    ['label' => 'Tải tệp', 'description' => $file->name, 'href' => '?step=1'],
    ['label' => 'Kiểm tra dữ liệu', 'state' => $errors ? 'error' : null, 'description' => $errors ? "Dòng {$errors[0]}: thiếu IMEI" : null],
    ['label' => 'Nhập kho'],
], ['current' => '2', 'navigation' => 'back']) ?>
```

`td_steps($steps, $opts)` **luôn** in phần tử [Steps](../components/steps.md) đầy đủ (hợp đồng `steps@1`). Không có bước →
host `hidden`.

- **Bước**: `label` (bắt buộc), `description`, `key` (mặc định vị trí từ 1), `state` (`done` | `current` | `error` |
  `upcoming`), `href`, `disabled`. Cùng chuẩn hoá với component (120 / 300 / 100 ký tự, ký tự điều khiển bị bỏ, key trùng
  → `-2`, tối đa 20 bước) và **cùng luật trạng thái** (bảng `STATE_CASES`, test parity); xung đột (`current` không khớp,
  `state: 'current'` thừa…) → **một** `E_USER_WARNING` liệt kê mã.
- **Không JS**: đủ trạng thái (✓ / ! / số, chữ ẩn cho trình đọc màn hình); bước bấm được có `href` (chỉ URL **tương đối**)
  là link; không `href` → in như bước thường (`data-td-js-step`), nạp module thì thành nút phát `step-select`.

| Option | Ý nghĩa |
|---|---|
| `current`, `complete` | bước hiện tại (key) / mọi bước xong |
| `orientation`, `narrow` | `vertical` |
| `navigation` | `back` \| `all` (mặc định không bấm được) |
| `label` | tên nhóm (mặc định "Tiến trình") |
| `id`, `class`, `attrs` | trên host; `attrs`: allowlist + `aria-*` / `data-*`, tên của component và `data-td-*` bị bỏ |

## td_timeline (0.45.0)

```php
<?= td_timeline(array_map(fn ($a) => [
    'id' => $a->id,
    'time' => $a->created_at,                 // DateTimeInterface — hoặc ISO có Z / offset, hoặc epoch
    'title' => $a->description,
    'actor' => ['name' => $a->user->name, 'href' => '/nhan-vien/' . $a->user->id],
    'icon' => $a->icon, 'tone' => $a->tone,
    'details' => $a->changes_text,
], $activities), ['time_zone' => 'Asia/Ho_Chi_Minh', 'has_more' => $hasMore, 'more_href' => '?page=' . ($page + 1)]) ?>
```

`td_timeline($items, $opts)` **luôn** in phần tử [Timeline](../components/timeline.md) đầy đủ (hợp đồng `timeline@1`).

- **Thời điểm**: `DateTimeInterface`, số epoch (`< 1e12` = giây), chuỗi ISO 8601 **có** `Z` / offset (1–9 chữ số lẻ giây,
  cắt về ms — giống JS). Chuỗi không múi giờ → nhóm cuối "Không rõ thời gian" + một `E_USER_WARNING`. Không cần `intl`.
- **`time_zone`**: tên IANA (`DateTimeZone::listIdentifiers()` hoặc `UTC`); sai → một `E_USER_WARNING` + múi giờ mặc định
  của PHP. Markup **luôn in** `time-zone` hiệu lực → trình duyệt nhóm đúng cùng ngày.
- **Không JS**: nhóm ngày + giờ đã tính sẵn, chi tiết mở bằng `<details>`, "Xem thêm" là link `more_href` (chỉ in khi có
  `has_more` **và** `more_href` hợp lệ). `details: true` (tải lười) chỉ có ở JS.
- Option khác: `order` (`asc`), `group` (`none`), `heading_level` (2–6), `empty_text`, `now` (test), `id`, `class`, `attrs`.

## td_diff / td_diff_snapshots (0.46.0)

```php
<?php
// dsuite audit: cột `changes JSON` — policy fields / keys = danh sách hàng, policy snapshot = { before, after }
$changes = json_decode($event['changes'], true);
?>
<?= td_diff($changes, ['label' => 'Thay đổi đơn ' . $order['code']]) ?>

<?= td_diff_snapshots($event['before_json'], $event['after_json'], [
    'fields' => [
        ['path' => 'status', 'label' => 'Trạng thái', 'type' => 'enum', 'options' => ['new' => 'Chờ xác nhận', 'ship' => 'Đang giao']],
        ['path' => 'lines', 'label' => 'Dòng hàng'],
        ['path' => ['lines', 0, 'qty'], 'label' => 'SL dòng 1'],   // đường dẫn có kiểu: 0 là chỉ số mảng
        ['path' => 'card', 'masked' => true],                       // cả nhánh → [ĐÃ ẨN], không bao giờ in
    ],
    'json' => true,
]) ?>
```

`td_diff($items, $opts)` / `td_diff_snapshots($before, $after, $opts)` **luôn** in phần tử [Diff](../components/diff.md) với
markup **cuối cùng** — giống hệt `render()` của component cho cùng dữ liệu (test parity model + markup, hợp đồng `diff@1`).

- **Không JS**: bảng hiện ngay; "n trường không đổi", "Xem đầy đủ", "Xem JSON" là `<details>` native. **Nạp
  `@dazzxq/td-components/diff`**: nhận tại chỗ (không render lại, không đọc dữ liệu ngược từ DOM — `counts` là `null` tới khi
  JS gán dữ liệu); gán `items` / `before` / `after` sau đó → render lại.
- **Item** (`td_diff`): mảng hoặc `stdClass` với `key` (chuỗi / số, bắt buộc), `label`, `before`, `after`, `kind`, `masked`,
  `type`, `options`, `decimals`, `unit` — cùng nghĩa với JS ([diff.md § 2](../components/diff.md#2-item-items)). `masked =>
  true`: `before` / `after` là **chuỗi** (server đã che: `***678`) → in nguyên văn; khác → `[ĐÃ ẨN]`.
- **Snapshot** (`td_diff_snapshots`), mỗi bên:

  | Đầu vào | Hiểu là |
  |---|---|
  | `string` (**khuyên dùng**) | JSON, giải mã giữ object là object (`{"0": …}`, `{}`). Lớn hơn 2 MB / JSON sai / sâu hơn 64 cấp → ghi chú, **không** hàng, không ném lỗi, không in chuỗi gốc |
  | `stdClass` | object (khoá luôn là chuỗi, thứ tự khoá như JavaScript) |
  | `array` | quy tắc **hẹp**: `array_is_list()` → mảng, còn lại → object (khoá số thành chuỗi). Mảng kết hợp có khoá đúng `0..n-1` bị hiểu là mảng; `[]` không phân biệt `{}` (cả hai rỗng). Cần chính xác → truyền chuỗi JSON / `stdClass` |
  | `null` | rỗng (sự kiện tạo / xoá) |
  | object khác (`DateTime`, model…) | không nhận ở mức gốc (`TypeError` qua kiểu tham số); lồng bên trong → `[không hỗ trợ]` — tự `json_encode` trước |

- **Số**: cùng luật với JS — số nguyên vượt ±(2⁵³ − 1) → `[số quá lớn]`, `1e309` → `[không hỗ trợ]`, số thực in như
  `String(n)` của JavaScript, không phụ thuộc `precision` / `serialize_precision`. ID / tiền có thể vượt 2⁵³ − 1 → gửi chuỗi.
- **Không che gì**: server bỏ / che bí mật trước khi gọi. Lỗi dữ liệu (item không có `key`, `kind` lạ, `fields` sai) → **một**
  `E_USER_WARNING` mỗi lần gọi (chỉ mã lỗi, không giá trị).
- `Td::diffModel($input, ['json' => …, 'labels' => …])` trả model (hàng, `counts`, ghi chú) — ví dụ để in "3 trường đổi"
  trong danh sách sự kiện.

| Option | Ý nghĩa |
|---|---|
| `fields` | (`td_diff_snapshots`) `FieldDef`: `['path' => 'status' \| ['lines', 0, 'qty'], 'label', 'type', 'options', 'decimals', 'unit', 'masked']` |
| `view` | `auto` / `table` / `inline` (giá trị khác: bỏ qua) |
| `unchanged` | `collapse` / `show` / `hide` |
| `json` | `true` → khối "Xem JSON" |
| `label` | tên trợ năng của bảng |
| `labels` | ghi đè chữ (`Td::DIFF_LABELS`, cùng khoá `TdDiff.labels`) — site đổi chữ JS thì đổi cả ở đây để markup khớp |
| `id`, `class` | trên host |
| `attrs` | trên **host** (allowlist + `aria-*` / `data-*`). Giữ chỗ — bị bỏ: `id` `class` `view` `unchanged` `json` `label` + mọi `data-td-*` |

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
| `InvalidArgumentException … unknown option` / `ssr_elements must be a bool` | option thứ ba của `configure()` gõ nhầm key, hoặc truyền `'1'` / `1` | chỉ `['ssr_elements' => true\|false]` |
| `InvalidArgumentException … is not a JS module of the kit` | tên trong `Td::modulePreloads()` không phải export JS (`'td.css'`, gõ nhầm, module của site) | dùng tên export (`'button'`) — module của site tự in `<link rel="modulepreload">` |
| Nút element mode vẫn nháy / render lại | chưa nạp module `button`; hoặc script đổi `variant` / `label` / `icon`… trước khi module tải (cố ý render lại cho đúng) | import module; đổi thuộc tính sau khi `customElements.whenDefined('td-button')` |
| CSS / JS của site nhắm `#id` của nút không còn ăn | element mode đặt `id` / `class` trên host `<td-button>` | đổi selector sang `#id > .td-btn`, hoặc dùng API component |
| `td_field` element mode: `#id-control` / `#id` (wrapper) của site không còn ăn | element mode: `id` = id **control**, host = `{id}-host` (native: wrapper = `id`, control = `{id}-control`) | nhắm `#id` (control) / `#id-host` (host), hoặc dùng API component |
| Dropdown element mode vẫn là select native sau khi module tải | select đang được focus đúng lúc module tới (cố ý đợi blur) | bình thường: rời select thì nâng cấp; đừng `focus()` select bằng script trước khi module tải |
| `td_otp_input`: `#id` của site trỏ vào wrapper không còn ăn | `id` là id **input** (cả native lẫn element); element: host = `{id}-host` | nhắm `#id` (input) / `.td-otp` (wrapper) / `#id-host` (host) |
| `td_number_input` không JS không có dấu chấm hàng nghìn | giới hạn của `type=number` native (cố ý: giá trị gửi đi phải là số sạch) | nạp module `number-input` (element mode) |
| `td_number_input`: giá trị / `min` / `step` biến mất + `Warning` | không ở dạng chuẩn (`12.990.000`, `1,5`, nhiều số lẻ hơn `decimals`, `step` ≤ 0) | truyền số chuẩn (`12990000`, `1.5`), đặt `decimals` |
| `td_media_field` không JS không thấy nút Đổi / Gỡ | cố ý: nút `visibility: hidden` tới khi module tải (không nút chết); hidden input vẫn gửi `assetId` | import module `media-field` (và cấu hình adapter: `TdMediaPicker.configureDefaults`) |
| `td_media_field`: ảnh xem trước không in ra | `preview_src` bị từ chối (`javascript:`, `data:`, `mailto:`, `http:` khi chưa `allowHttpLinks`) | URL `https:` hoặc tương đối |
| `td_media_field` usage không gửi gì + `Warning` | `name` kết thúc `[]` | bỏ `[]` (`og`, không phải `og[]`) |
| `td_media_gallery` không gửi gì + `Warning` | `$items` hỏng (id trùng / id không phải string-int / > 100 / không phải list) hoặc `name` kết thúc `[]` → fail closed; hoặc nhiều ảnh hơn `max` → in đủ ô nhưng không `name` | sửa dữ liệu; `name` không có `[]`; `max` ≥ số ảnh thật (server vẫn tự kiểm) |
| `td_copy` không JS chỉ thấy mã, không có nút | cố ý: nút ẩn khi chưa có JS (không có nút chết), mã bôi đen được | import module `copy` |
| Ô nhập element mode vẫn render lại khi tải | script đổi `label` / `type` / `size`… trước khi module tải, hoặc markup bị sửa (cố ý render lại; chữ đã gõ được giữ) | đổi thuộc tính sau `customElements.whenDefined('td-input-field')` |

## Xem thêm

- [WordPress & PHP](wordpress-php.md) — vendor kit, phiên bản trong đường dẫn, WordPress Script Modules, CSP.
- [Button](../components/button.md) · [Input field](../components/input-field.md) ·
  [Dropdown](../components/dropdown.md) · [Checkbox](../components/checkbox.md) · [Toggle](../components/toggle.md) ·
  [Icons](../components/icons.md) · [Badge](../components/badge.md) · [Alert](../components/alert.md) ·
  [Empty state](../components/empty-state.md) · [OTP input](../components/otp-input.md) · [Copy](../components/copy.md) ·
  [Number input](../components/number-input.md) · [Repeater](../components/repeater.md) ·
  [Media field](../components/media-field.md) · [Media gallery](../components/media-gallery.md) · [Media picker](../components/media-picker.md)
- [Bảo mật](security.md) · [CSP](csp.md) · [Form](forms.md)
