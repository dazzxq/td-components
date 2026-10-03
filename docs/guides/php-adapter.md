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

## Cài đặt và cấu hình

File nằm trong thư mục kit đã vendor (có phiên bản trong đường dẫn):

```text
public/assets/vendor/td-components/0.26.0/
  td.css  index.js  package.json  src/  php/td.php  THIRD_PARTY_NOTICES.md
```

Nạp **một lần** trong bootstrap của site, rồi cấu hình:

```php
<?php
const TD_VERSION = '0.26.0';
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
  | `ssr_elements` | `bool` | `false` | `td_button` / `td_link` (không `bare`) — và từ 0.26.0 cả `td_field` / `td_toggle` / `td_checkbox` / `td_dropdown` — in [chế độ element](#chế-độ-element-ssr--hydrate-tại-chỗ-0250) cho **mọi** lần gọi; option `element` của từng lần gọi vẫn ghi đè |

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
([chi tiết](#td_dropdown-ở-chế-độ-element-vỏ-không-xô-lệch-0260)) cũng từ 0.26.0. `td_empty` thì **luôn** in element
(component không có dạng native; option `element` / `ssr_elements` không đổi gì).

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
| Ô nhập element mode vẫn render lại khi tải | script đổi `label` / `type` / `size`… trước khi module tải, hoặc markup bị sửa (cố ý render lại; chữ đã gõ được giữ) | đổi thuộc tính sau `customElements.whenDefined('td-input-field')` |

## Xem thêm

- [WordPress & PHP](wordpress-php.md) — vendor kit, phiên bản trong đường dẫn, WordPress Script Modules, CSP.
- [Button](../components/button.md) · [Input field](../components/input-field.md) ·
  [Dropdown](../components/dropdown.md) · [Checkbox](../components/checkbox.md) · [Toggle](../components/toggle.md) ·
  [Icons](../components/icons.md) · [Badge](../components/badge.md) · [Alert](../components/alert.md)
- [Bảo mật](security.md) · [CSP](csp.md) · [Form](forms.md)
