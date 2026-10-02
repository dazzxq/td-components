[Tài liệu](../README.md) › Hướng dẫn › WordPress & PHP

# Tích hợp với WordPress (dwp) và PHP thuần (135)

Trang này là hướng dẫn **cụ thể** cho hai site của owner:

- **dwp** — nền tảng WordPress (WordPress 7.0.2, classic PHP theme, plugin engine `dwp-core`, `dwp-members`…).
- **135** — PHP thuần (layout `templates/layout.php`, partial `templates/partials/head.php`, CSP trong
  `src/Core/Csp.php`).

Phần [chung cho mọi site PHP](#chung-cho-mọi-site-php) áp dụng cho cả hai; đọc nó trước. Cài đặt tổng quát (npm,
Vite, không bundler) nằm ở [Cài đặt](../getting-started/installation.md). Hàm PHP của kit (import map, `td.css`,
markup SSR của nút/ô/dropdown/switch/checkbox/icon) nằm trong **adapter chính thức** `php/td.php` — tham chiếu đầy đủ ở
[Adapter PHP](php-adapter.md).

> Trạng thái hiện tại: cả dwp lẫn 135 **chưa** nạp td-components; mỗi site đang có bộ UI riêng (dwp: `@dwp/ui-*`,
> 135: bộ `td-` cũ với specifier `@td/*`). Trang này mô tả cách tích hợp; việc chuyển đổi làm dần từng component.

## Mục lục

- [Chung cho mọi site PHP](#chung-cho-mọi-site-php)
- [Import map cho PHP thuần](#import-map-cho-php-thuần) (adapter `php/td.php`)
- [WordPress (dwp)](#wordpress-dwp)
- [PHP thuần (135)](#php-thuần-135)
- [Hợp đồng markup render phía server](#hợp-đồng-markup-render-phía-server)
- [Truyền dữ liệu từ PHP sang component](#truyền-dữ-liệu-từ-php-sang-component)
- [Form và lỗi server trong WordPress](#form-và-lỗi-server-trong-wordpress)
- [Nâng cấp phiên bản](#nâng-cấp-phiên-bản)
- [Lỗi thường gặp](#lỗi-thường-gặp)

## Chung cho mọi site PHP

### Kit là file tĩnh

td-components ship **source**: một file CSS và các ES module. Không build, không bundler. Một trang cần hai thứ:

1. `<link rel="stylesheet" href="…/td.css">` — toàn bộ style (token, glass, mọi component) trong một file.
2. `<script type="module">` nạp component cần dùng.

Mọi `import` **bên trong** kit là đường dẫn tương đối (`../base/td-base-element.js`), nên chỉ cần phục vụ nguyên thư mục
`src/` qua HTTP là các module tự tìm thấy nhau. Import map chỉ cần khi **code của bạn** muốn viết tên gói
(`@dazzxq/td-components/button`) thay vì URL.

Các file cần copy lên server (đúng mục `files` của `package.json`):

```text
td-components/0.21.1/
  td.css
  index.js
  package.json            (adapter PHP đọc danh sách exports từ đây)
  php/td.php              (adapter PHP chính thức — import map, td.css, markup SSR)
  src/                    (toàn bộ; adapter đọc src/icons/icons.json)
  THIRD_PARTY_NOTICES.md  (giấy phép icon Lucide)
```

Lấy từ tag git hoặc `npm pack`:

```bash
# trong repo td-components, đúng tag cần dùng
git checkout v0.21.1
npm pack                              # tạo dazzxq-td-components-0.21.1.tgz
tar -xzf dazzxq-td-components-0.21.1.tgz
mv package /đường/dẫn/site/assets/vendor/td-components/0.21.1
```

### Đặt phiên bản vào đường dẫn, không dùng `?ver=` cho module

**Luật quan trọng nhất của trang này.** Với ES module, trình duyệt coi mỗi URL là một module riêng:

- `td-menu.js?ver=1` và `td-menu.js` là **hai module khác nhau** → hai registry menu, hai tooltip, hai cache hovercard.
  Plugin A `register()` vào registry thứ nhất, `bindAll()` đọc registry thứ hai → mục menu "biến mất".
- `?ver=` chỉ gắn vào file entry; các import tương đối bên trong **không** mang theo `?ver=`, nên khi nâng cấp trình
  duyệt vẫn dùng file con cũ trong cache → trộn hai phiên bản.

Cách đúng: **mỗi phiên bản một thư mục** (`…/td-components/0.21.1/`), URL module không có query string, và cho thư mục
đó cache dài hạn. Nâng cấp = thư mục mới = URL mới cho mọi file.

```nginx
# nginx: file có version trong đường dẫn → cache 1 năm, immutable
location ^~ /assets/vendor/td-components/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    types { text/javascript js mjs; text/css css; application/json json; }
}
```

`td.css` không bị vấn đề nhận dạng module, nhưng để thống nhất cứ lấy nó từ cùng thư mục có version.

### MIME của module JS

Server phải trả mọi module JS — `.js`, và cả `.mjs` nếu site có dùng — với `Content-Type: text/javascript`. Trình
duyệt **từ chối** chạy `<script type="module">` / `import` khi MIME không phải JavaScript (lỗi `Failed to load module
script … MIME type "…"`). Kit chỉ ship `.js` (nginx/Apache map sẵn), nhưng file `mime.types` của **nginx cũ không có
`.mjs`**: file bị trả `application/octet-stream`, và nếu site gửi `X-Content-Type-Options: nosniff` thì trình duyệt chặn
luôn module đó (thường gặp với module riêng của site hoặc thư viện thứ ba như `purify.es.mjs`). Thêm map:

```nginx
# nginx: trong http { }, ngay SAU dòng `include mime.types;` (các khối types cùng cấp được cộng dồn)
types { text/javascript mjs; }
```

Đừng đặt khối `types { … }` này một mình trong `server { }` / `location { }`: ở cấp dưới, `types` **thay hẳn** bảng
kế thừa (mọi đuôi khác mất MIME). Khối `location` ở trên liệt kê đủ `js mjs css json` là vì lý do đó.

```apache
# Apache: .htaccess hoặc vhost
AddType text/javascript .js .mjs
```

Kiểm tra: `curl -sI https://site/…/td-button.js | grep -i content-type` → `text/javascript` (hoặc
`application/javascript`, cũng được chấp nhận).

### Hằng số phiên bản

Khai báo một chỗ duy nhất:

```php
<?php
// dwp: trong dwp-core; 135: trong config/bootstrap
const TD_VERSION = '0.21.1';
```

## Import map cho PHP thuần

Tên subpath của gói (`@dazzxq/td-components/button`) **không** trùng cấu trúc thư mục (nó trỏ tới
`src/form/td-button.js`), nên import map được sinh từ `exports` của `package.json` — không gõ tay. Kit ship sẵn hàm
này trong adapter chính thức `php/td.php` (không cần tự viết):

```php
<?php
require_once $tdDir . '/php/td.php';                 // $tdDir = thư mục kit đã vendor (có phiên bản)
TdComponents\Td::configure('/assets/vendor/td-components/' . TD_VERSION, $tdDir);

td_import_map();
// → ['@dazzxq/td-components' => '/assets/vendor/td-components/0.21.1/index.js',
//    '@dazzxq/td-components/button' => '/assets/vendor/td-components/0.21.1/src/form/td-button.js', …]

td_import_map(['dompurify' => '/assets/vendor/dompurify/3.4.16/purify.es.js']); // + entry riêng của site (sau kit)
echo td_import_map_tag(['app/' => '/assets/app/'], $nonce);                     // in luôn <script type="importmap">
echo td_stylesheet_tag($nonce);                                                   // <link rel="stylesheet" href="…/td.css">
```

- Mọi entry `.js` của `exports` (kit trước, theo thứ tự `exports`), rồi `$extra`. `td.css`/`icons.json`/`package.json`
  không vào import map.
- Key trong `$extra` trùng module của kit → `InvalidArgumentException` (không vô tình ghi đè module kit).
- `td_import_map_tag()` in JSON với `JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT |
  JSON_UNESCAPED_SLASHES` và escape nonce.

Chi tiết + markup helper: [Adapter PHP](php-adapter.md).

Luật import map (đã gặp thật ở dwp):

- **Một** import map mỗi trang, in trong `<head>`, **trước mọi `<script type="module">`**. Import map in sau module
  đầu tiên bị bỏ qua hoàn toàn.
- Giá trị là URL bắt đầu bằng `/`, `./`, `../` hoặc tuyệt đối `https://…`.
- Dưới CSP có nonce, import map cần `nonce` (nó là script inline). Xem [CSP](csp.md#gắn-nonce-cho-link-import-map-và-script).
- Mọi entry riêng của site (DOMPurify, module app) truyền qua `$extra` của `td_import_map_tag()` — đừng in import map
  thứ hai. Tự encode thì dùng `json_encode(…, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP)`.

## WordPress (dwp)

Yêu cầu: WordPress **6.5+** (Script Modules API: `wp_register_script_module`, `wp_enqueue_script_module`); phần truyền
dữ liệu `script_module_data_{$id}` cần **6.7+**. dwp đang chạy 7.0.2.

### Đặt kit ở đâu

Kit là hạ tầng dùng chung cho mọi site dwp → đặt trong plugin engine, **không** trong theme:

```text
engine/dwp-core/assets/vendor/td-components/0.21.1/   ← kit (không sửa file bên trong)
sites/aetv/aehh-theme/assets/css/td-overrides.css     ← skin: chỉ ghi đè token --td-* (unlayered)
```

- Engine (`dwp-core`) đăng ký `td.css` và các script module của kit.
- Theme/skin chỉ đổi **token** (`--td-accent`, `--td-glass-bg`…) trong CSS riêng nạp **sau** `td.css`. Không copy,
  không sửa CSS của kit. Xem [Theming](../customization/theming.md).
- Plugin khác (`dwp-members`, `dwp-ai`) **không** tự mang kit; chúng khai báo phụ thuộc vào module đã đăng ký.

### Đăng ký CSS và module

```php
<?php
// engine/dwp-core — đăng ký một lần cho front và admin
const TD_VERSION = '0.21.1';

function dwp_td_base_url(): string {
    return DWP_CORE_URL . 'assets/vendor/td-components/' . TD_VERSION . '/';
}

function dwp_td_base_path(): string {
    return DWP_CORE_PATH . 'assets/vendor/td-components/' . TD_VERSION;
}

require_once dwp_td_base_path() . '/php/td.php'; // adapter chính thức của kit
TdComponents\Td::configure(rtrim(dwp_td_base_url(), '/'), dwp_td_base_path());

add_action('init', function (): void {
    // CSS: ?ver= vô hại với stylesheet; dùng TD_VERSION cho gọn
    wp_register_style('td', dwp_td_base_url() . 'td.css', [], TD_VERSION);

    if (!function_exists('wp_register_script_module')) {
        return; // WP < 6.5
    }
    // Mỗi subpath của package.json thành một script module. version = null → KHÔNG thêm ?ver=
    // (phiên bản đã nằm trong đường dẫn; xem "Đặt phiên bản vào đường dẫn").
    foreach (td_import_map() as $id => $url) {
        wp_register_script_module($id, $url, [], null);
    }
});

add_action('wp_enqueue_scripts', function (): void {
    wp_enqueue_style('td');
    // Skin nạp SAU td.css để token của site thắng
    wp_enqueue_style('aehh-td-overrides', get_theme_file_uri('assets/css/td-overrides.css'), ['td'], wp_get_theme()->get('Version'));
});
```

`td_import_map()` là hàm của adapter `php/td.php` ([mục trên](#import-map-cho-php-thuần)). WordPress tự in import map
nên ở đây chỉ dùng mảng, không dùng `td_import_map_tag()`. Chỉ đăng ký thì chưa nạp gì — WordPress chỉ in những
module nằm trong đồ thị phụ thuộc của module **được enqueue**.

### Dùng trong module của site

Module của site khai báo kit là **dependency**, WordPress sẽ in import map và `modulepreload` tương ứng:

```php
<?php
wp_register_script_module(
    '@dwp/profile-form',
    DWP_CORE_URL . 'assets/ui/profile-form.js',
    [
        '@dazzxq/td-components/input-field',
        '@dazzxq/td-components/button',
        '@dazzxq/td-components/form-validation',
        '@dazzxq/td-components/toast',
        // import() động: có trong import map nhưng không preload
        ['id' => '@dazzxq/td-components/modal', 'import' => 'dynamic'],
    ],
    dwp_asset_ver(DWP_CORE_PATH . 'assets/ui/profile-form.js', DWP_CORE_VERSION)
);
// Trên trang cần form:
wp_enqueue_script_module('@dwp/profile-form');
```

```js
// engine/dwp-core/assets/ui/profile-form.js
import '@dazzxq/td-components/input-field';
import '@dazzxq/td-components/button';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';
import { TdToast } from '@dazzxq/td-components/toast';

const form = document.querySelector('form[data-dwp-profile]');
if (form) TdFormValidation.attach(form);
```

Module **của site** được phép có `?ver=` (nó là entry, không bị import từ chỗ khác bằng URL khác). Module **của kit**
thì không (xem trên). Mọi `import` tới kit phải qua **cùng một specifier** đã đăng ký — đừng vừa import
`@dazzxq/td-components/menu` vừa import `…/src/feedback/td-menu.js?x=1`.

### Nonce CSP trong WordPress

Chỉ cần khi trang gửi CSP dùng nonce (dwp hiện gửi CSP trên một số bề mặt như Photos/Auth). WordPress in import map
bằng `wp_print_inline_script_tag()` và thẻ module bằng `wp_print_script_tag()`, nên gắn nonce qua filter:

```php
<?php
// $nonce: nonce của response hiện tại (sinh một lần), cùng giá trị với header CSP
add_filter('wp_script_attributes', fn(array $a): array => $a + ['nonce' => dwp_csp_nonce()]);
add_filter('wp_inline_script_attributes', fn(array $a): array => $a + ['nonce' => dwp_csp_nonce()]);
add_filter('style_loader_tag', function (string $tag, string $handle): string {
    return str_replace('<link ', '<link nonce="' . esc_attr(dwp_csp_nonce()) . '" ', $tag);
}, 10, 2);
```

(`dwp_csp_nonce()` là hàm nonce của site bạn.) WordPress in `<link rel="modulepreload">` **không qua filter** — giữ
`'self'` trong `script-src` để chúng không bị chặn. Bề mặt tự in HTML (không qua `wp_head()`, như Photos) thì tự in
import map có nonce như 135.

### Lightbox với markup dwp sẵn có (`attrPrefix: 'dwp'`)

Nội dung dwp đã render `data-dwp-lightbox-*`. `TdLightbox.bind()` đọc được trực tiếp:

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';

const CDN = new Set([location.host, 'cdn.aetv.vn']);
TdLightbox.bind(document, {
  attrPrefix: 'dwp', // đọc data-dwp-lightbox, -item, -group, -src, -caption, -type, -poster, -provider
  isAllowedUrl: (url) => {
    try {
      const u = new URL(url, location.href);
      return u.protocol === 'https:' && CDN.has(u.host);
    } catch {
      return false;
    }
  },
  // Bỏ qua click mà module video của dwp tự xử lý (dwp đánh dấu nhóm bằng data-dwp-lightbox-video)
  filter: (el) => !el.closest('[data-dwp-lightbox-video]'),
  panel: true, // cột thông tin hiện caption
});
```

Lưu ý khi chuyển:

- td **không** đọc `data-dwp-lightbox-video` và `data-dwp-lightbox-extra` (hai cờ riêng của lightbox dwp). Loại video
  lấy từ `data-dwp-lightbox-type="video"`; phần "extra" chuyển sang hook `toolbar`/`panel`.
- **Đừng bật cùng lúc** `@dwp/lightbox` và `TdLightbox.bind({ attrPrefix: 'dwp' })` trên một trang: cả hai nghe cùng
  một click. td bỏ qua click đã bị `preventDefault()`, nhưng thứ tự listener quyết định ai mở — chuyển từng trang một.
- CSS con trỏ (zoom-in cho ảnh, pointer cho video) của td.css đã có cho cả prefix `td` và `dwp`.
- `filter()` chỉ là UX, không phải phân quyền (xem [Bảo mật](security.md#những-thứ-kit-tin-tưởng-trust-assumptions)).

Tooltip cũng nhận markup dwp nguyên trạng: `data-dwp-tooltip`, `data-tooltip-pos`, `data-dwp-tooltip-pos`.

### Menu registry cho plugin

Mục đích: core định nghĩa menu, plugin **thêm** mục mà không sửa core.

```js
// dwp-core: assets/ui/post-menu.js (module của core)
import { TdMenu } from '@dazzxq/td-components/menu';

TdMenu.define('post-actions', (ctx) => [
  { label: 'Sao chép liên kết', icon: 'link', onSelect: () => navigator.clipboard.writeText(ctx.url) },
  { label: 'Báo cáo', onSelect: () => dwpReport(ctx.postId) },
]);
TdMenu.bindAll(document); // một lần, event delegation: nút render sau vẫn hoạt động
```

```js
// dwp-members: assets/ui/member-post-menu.js (module của plugin)
import { TdMenu } from '@dazzxq/td-components/menu';

TdMenu.register('post-actions', [
  { label: 'Lưu bài', onSelect: (ctx) => savePost(ctx.postId) },
  { label: 'Xoá bài', danger: true, when: (ctx) => ctx.canDelete === '1', onSelect: (ctx) => deletePost(ctx.postId) },
], { order: 500, group: 'member' });
```

```php
<?php // template thẻ bài viết
printf(
    '<button type="button" class="td-menu-btn" aria-label="%s" data-td-menu="post-actions" data-td-menu-post-id="%d" data-td-menu-url="%s" data-td-menu-can-delete="%s"><span class="td-menu-btn__icon" data-td-icon="more" aria-hidden="true"></span></button>',
    esc_attr__('Tùy chọn bài viết', 'dwp'),
    (int) $post->ID,
    esc_url(get_permalink($post)),
    current_user_can('delete_post', $post->ID) ? '1' : '0'
);
```

- `register()` gọi trước hay sau `define()` đều được. Mục `order` mặc định: mục gốc = chỉ số × 10, mục đăng ký = 1000;
  `group` khác nhau có đường phân cách.
- `ctx` = `data-td-menu-*` (camelCase, **luôn là chuỗi**) + `anchor` + `name`. `ctx.canDelete` ở trên chỉ để **ẩn** mục;
  endpoint xoá vẫn phải `current_user_can()` (người dùng sửa được attribute).
- Plugin phải import **cùng specifier** `@dazzxq/td-components/menu` (khai báo dependency khi đăng ký module) — registry
  là biến cấp module, hai URL khác nhau = hai registry.
- Icon `data-td-icon` trong markup PHP được component lấp khi mở menu nút `TdMenu.button()`; với nút tự render như trên,
  gọi `fillIconSlots(root)` từ `@dazzxq/td-components/icons` sau khi DOM sẵn sàng (xem [Icons](../components/icons.md)).

### Hovercard với REST của WordPress

`TdHovercard` fetch cùng origin **kèm cookie** nhưng **không gửi header `X-WP-Nonce`**. REST API của WordPress với
cookie mà thiếu nonce sẽ coi request là **chưa đăng nhập** (user 0). Nên:

- Fragment công khai (hồ sơ công khai): REST route bình thường là được.
- Fragment phụ thuộc người đang xem: dùng route riêng của dwp (`/dwp/…`) hoặc `admin-ajax.php` (xác thực bằng cookie),
  hoặc dùng hook `content()` tự `fetch` kèm `X-WP-Nonce` rồi trả chuỗi/Node.
- Endpoint trả `Cache-Control: no-store` nếu nội dung theo người dùng, và SPA gọi `TdHovercard.clearCache()` khi
  đổi phiên (xem [Bảo mật](security.md#tdhovercard-sanitize-cache-và-đổi-phiên)).

### Escaping trong template WordPress

| Ngữ cảnh | Hàm |
|---|---|
| Text node | `esc_html()` |
| Attribute (`label`, `error-text`, `data-*`) | `esc_attr()` |
| `href`, `src`, `data-dwp-lightbox-src` | `esc_url()` |
| JSON trong attribute | `esc_attr(wp_json_encode($data))` |
| JSON trong `<script type="application/json">` | `wp_json_encode($data, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES)` |

## PHP thuần (135)

### Hiện trạng cần biết trước khi tích hợp

135 đang có bộ UI `td-` **riêng** (tiền thân của td-components): `public/assets/css/td-tokens.css`, `td-ui.css`,
`td-glass.css`…, module `@td/ui`, `@td/lightbox`… trong `Assets::MODULES`. Bộ này dùng **cùng tên layer**
(`td.tokens, td.component, td.utilities`) và **trùng khoảng 119 tên token `--td-*`** với `td.css`. Nạp cả hai trên một
trang thì token và rule gộp vào cùng layer, file nạp sau thắng — kết quả khó đoán. Chuyển đổi nên làm theo trang
(trang dùng td-components thì không nạp CSS `td-*` cũ), hoặc thay hẳn một lần và kiểm tra lại toàn bộ giao diện.

Specifier cũng tách biệt: kit mới dùng `@dazzxq/td-components/*`, không đụng `@td/*` của 135.

### Đặt kit và partial

```text
public/assets/vendor/td-components/0.21.1/   ← kit (có php/td.php)
```

Bootstrap (một lần cho mọi request):

```php
<?php
// config/bootstrap.php
$tdDir = T135_ROOT . '/public/assets/vendor/td-components/' . TD_VERSION;
require_once $tdDir . '/php/td.php';
TdComponents\Td::configure('/assets/vendor/td-components/' . TD_VERSION, $tdDir);
// Icon riêng của site (dữ liệu, không phải chuỗi SVG) — tên không được trùng icon core:
TdComponents\Td::registerIcons(json_decode(file_get_contents(T135_ROOT . '/data/icons-135.json'), true, 32, JSON_THROW_ON_ERROR)['icons']);
```

Trong `templates/partials/head.php`, thứ tự nên là:

```php
<?php // 1) td.css của kit  2) token/CSS riêng của site (ghi đè --td-*)  3) import map DUY NHẤT  4) module ?>
<?= td_stylesheet_tag() ?>
<link rel="stylesheet" href="<?= h(asset('app/tokens.css')) ?>">
<?= td_import_map_tag([
    'dompurify' => '/assets/vendor/dompurify/3.4.16/purify.es.js',
    // …các module riêng của 135 (thay cho $importMap tự dựng)
], $nonce) ?>
```

Markup form thì dùng helper của adapter thay vì viết tay (`td_field`, `td_button`, `td_dropdown`, `td_toggle`,
`td_checkbox`, `td_icon` — cùng tên/option với `src/Ui/markup.php` cũ của 135; bỏ file đó khi chuyển):

```php
<form method="post" action="/admin/login">
  <?= td_field('username', '', ['label' => 'Tên đăng nhập', 'autocomplete' => 'username', 'required' => true, 'autofocus' => true]) ?>
  <?= td_field('password', '', ['label' => 'Mật khẩu', 'type' => 'password', 'autocomplete' => 'current-password', 'required' => true]) ?>
  <?= td_button('Đăng nhập', ['type' => 'submit', 'variant' => 'primary', 'full_width' => true]) ?>
</form>
```

Các control này là control **native** mang class của kit — chạy không cần JS. Xem [Adapter PHP](php-adapter.md)
(bảng option, khác biệt so với adapter cũ của 135).

Và nạp component trên trang cần:

```php
<script type="module" nonce="<?= h(csp_nonce()) ?>">
  import '@dazzxq/td-components/input-field';
  import '@dazzxq/td-components/button';
  import { TdFormValidation } from '@dazzxq/td-components/form-validation';
  const form = document.getElementById('roll-form');
  if (form) TdFormValidation.attach(form);
</script>
```

Hoặc (gọn hơn, cache tốt hơn) đặt code vào file `public/assets/app/roll-form.js` và nạp
`<script type="module" src="<?= h(asset('app/roll-form.js')) ?>" nonce="…"></script>`.

- Hàm `asset()` của 135 thêm `?v=` — **đừng** dùng nó cho file trong `vendor/td-components/` (xem
  [phiên bản trong đường dẫn](#đặt-phiên-bản-vào-đường-dẫn-không-dùng-ver-cho-module)). File app của site thì được.
- CSP của 135 (`script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; style-src-attr 'none'; connect-src 'self' …`)
  đã tương thích với kit: `td.css` cùng origin không cần nonce, CSSOM không bị `style-src-attr` chặn, hovercard cần
  `connect-src 'self'` (đã có). Ảnh lightbox từ CDN cần host trong `img-src` (135 đã có `media_base_url`).

### Escaping trong template 135

135 đã có `h()` (`src/Core/helpers.php`) và `td_esc_url()` (`src/Ui/escape.php`):

```php
<td-input-field name="title" label="Tên cuộn" value="<?= h($roll['title'] ?? '') ?>"
  error-text="<?= h($errors['title'] ?? '') ?>" required max-length="120"></td-input-field>

<a href="<?= td_esc_url($photo['full_url']) ?>" data-td-lightbox-item
   data-td-lightbox-caption="<?= h($photo['caption']) ?>">
  <img src="<?= td_esc_url($photo['thumb_url']) ?>" alt="<?= h($photo['alt']) ?>">
</a>
```

`htmlspecialchars` với `ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5` đủ cho text và attribute có ngoặc kép. Kit đọc
attribute (trình duyệt đã decode) và tự escape lại khi render — không bị escape hai lần.

## Hợp đồng markup render phía server

Các attribute dưới đây là **API công khai** — server render sẵn, JS chỉ cần `bind`/`bindAll` một lần.

### Lightbox (`TdLightbox.bind(root, { attrPrefix })`, mặc định prefix `td`)

| Attribute | Đặt ở | Ý nghĩa |
|---|---|---|
| `data-td-lightbox` | trigger đơn | mở một ảnh; giá trị là URL (hoặc để trống / `true` / `1` để lấy URL từ chỗ khác) |
| `data-td-lightbox-group` | container | gom các item thành một gallery |
| `data-td-lightbox-item` | từng item trong group | |
| `data-td-lightbox-src` | trigger / item | URL ảnh lớn (ưu tiên cao nhất) |
| `data-td-lightbox-type="video"` | trigger / item | item là video |
| `data-td-lightbox-poster` | trigger / item | ảnh poster của video |
| `data-td-lightbox-provider` | trigger / item | mặc định `html5`; giá trị khác do hook `video` xử lý |
| `data-td-lightbox-caption` | trigger / item | chú thích (text) |

Thứ tự tìm `src`: `-src` → giá trị của `data-td-lightbox` → `href` của `<a>` gần nhất nếu trỏ tới file ảnh
(`.jpg .jpeg .png .webp .gif .avif .svg`) → `currentSrc`/`src` của `<img>`. Caption: `-caption` → `<figcaption>` của
`<figure>` gần nhất → `alt` của ảnh. `attrPrefix: 'dwp'` đổi mọi tên thành `data-dwp-lightbox-*`.

```html
<div data-td-lightbox-group>
  <figure>
    <a href="https://cdn.example.com/p/1-full.jpg" data-td-lightbox-item>
      <img src="https://cdn.example.com/p/1-thumb.jpg" alt="Hồ Gươm lúc bình minh">
    </a>
    <figcaption>Hồ Gươm, 6:10 sáng</figcaption>
  </figure>
  <a href="#" data-td-lightbox-item data-td-lightbox-type="video"
     data-td-lightbox-src="https://cdn.example.com/v/2.mp4" data-td-lightbox-poster="https://cdn.example.com/v/2.jpg">
    <img src="https://cdn.example.com/v/2-thumb.jpg" alt="Video phố cổ">
  </a>
</div>
```

### Menu (`TdMenu.bindAll(root)`)

| Attribute | Ý nghĩa |
|---|---|
| `data-td-menu="tên"` | trigger mở menu đã `define`/`register` với tên đó |
| `data-td-menu-*` | thêm vào `ctx` (camelCase, chuỗi): `data-td-menu-post-id="7"` → `ctx.postId === '7'` |
| `disabled` / `aria-disabled="true"` | trigger không mở |

Tên `anchor`, `name`, `item`, `checked`, `__proto__`, `constructor`, `prototype` bị bỏ qua trong ctx.

### Hovercard (`TdHovercard.bindAll(root)`)

| Attribute | Ý nghĩa |
|---|---|
| `data-td-hovercard="/url"` | tải fragment cùng origin (`text/html` hoặc JSON `{ "html": … }`) |
| `data-td-hovercard-template="id"` | clone `<template id="id">` (không parse chuỗi — an toàn nhất) |
| `data-td-hovercard-label="…"` | tên truy cập của card |
| `data-td-hovercard-cache="false"` | không cache fragment của trigger này |

```php
<a href="/u/<?= (int) $user['id'] ?>" data-td-hovercard-template="hc-user-<?= (int) $user['id'] ?>"
   data-td-hovercard-label="<?= h('Hồ sơ ' . $user['name']) ?>"><?= h($user['name']) ?></a>
<template id="hc-user-<?= (int) $user['id'] ?>">
  <strong><?= h($user['name']) ?></strong>
  <p><?= h($user['bio']) ?></p>
</template>
```

### Tooltip (tự khởi tạo khi import `@dazzxq/td-components/tooltip`)

| Attribute | Ý nghĩa |
|---|---|
| `data-tooltip="text"` (alias `data-dwp-tooltip`) | nội dung (text) |
| `data-tooltip-position="top|bottom|left|right"` (alias `data-tooltip-pos`, `data-dwp-tooltip-pos`) | vị trí, mặc định `top` |
| `data-tooltip-color`, `data-tooltip-text-color` | chip màu đặc (qua `safeColor`) |

### Control form

Cách nhanh nhất là helper của [adapter PHP](php-adapter.md): `td_button`/`td_link`/`td_field`/`td_checkbox`/`td_toggle`
in control native đúng hợp đồng DOM (không cần JS), `td_dropdown` in `<td-dropdown>` bọc `<select>` (upgrade khi nạp
module). Khi cần hành vi JS thì viết custom element:

Mọi attribute trong trang component (`value`, `label`, `required`, `error-text`, `min`, `max`…) render được từ server.
Đặc biệt:

- `td-chip-input value` là **JSON**: `value="<?= h(json_encode($tags, JSON_UNESCAPED_UNICODE)) ?>"` (mảng chuỗi hoặc
  `{ value, label }`). JSON sai → bị bỏ qua + `console.warn`.
- `td-datetime-picker value` theo dạng hiển thị `dd/mm/yyyy - hh:mm`; từ DB dùng `setDBValue()` trong JS, hoặc format ở
  PHP: `date('d/m/Y - H:i', strtotime($row['taken_at']))`.
- Lỗi validate sau POST (không AJAX): render lại form với `error-text="<?= h($errors['x'] ?? '') ?>"` và `value` cũ.

## Truyền dữ liệu từ PHP sang component

Một số dữ liệu chỉ nhận qua **property** JS (không có attribute): `td-dropdown.options`, `td-table.columns` /
`td-table.data`, `td-chip-input.options` / `search`. Dưới CSP, cách an toàn là một khối JSON (không phải script chạy
được) rồi đọc trong module:

```php
<script type="application/json" id="city-options"><?= json_encode(
    array_map(fn($c) => ['value' => $c['id'], 'label' => $c['name']], $cities),
    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
) ?></script>
<td-dropdown name="city_id" label="Thành phố" value="<?= h((string) $currentCityId) ?>" required></td-dropdown>
```

```js
import '@dazzxq/td-components/dropdown';

const dd = document.querySelector('td-dropdown[name="city_id"]');
dd.options = JSON.parse(document.getElementById('city-options').textContent);
```

`JSON_HEX_TAG` bắt buộc: không có nó, chuỗi `</script>` trong dữ liệu sẽ đóng thẻ sớm. Gán `options` **sau** khi import
module (element đã được define); `value="…"` có trước sẽ được chọn khi options tới.

Với dropdown, cách đơn giản hơn là `td_dropdown()` của [adapter PHP](php-adapter.md#td_dropdown): in `<select>` native
bên trong `<td-dropdown>`, component tự đọc `<option>` khi nạp — không cần khối JSON, và chạy cả khi JS chưa tải.

WordPress 6.7+ có sẵn cơ chế tương tự cho script module:

```php
<?php
add_filter('script_module_data_@dwp/profile-form', fn(array $data): array => $data + [
    'restNonce' => wp_create_nonce('wp_rest'),
    'cities' => dwp_city_options(),
]);
```

```js
const el = document.getElementById('wp-script-module-data-@dwp/profile-form');
const data = el ? JSON.parse(el.textContent) : {};
```

## Form và lỗi server trong WordPress

Mẫu AJAX tổng quát ở [Form › AJAX](forms.md#mẫu-ajax-submit-với-tdbuttonrun). Khác biệt với WordPress là **định dạng
lỗi** và **nonce**.

REST API (`register_rest_route` với `args` có `validate_callback`) trả lỗi tham số:

```json
{ "code": "rest_invalid_param", "message": "…", "data": { "status": 400, "params": { "email": "Email không hợp lệ" } } }
```

```js
submitBtn.run(async () => {
  const res = await fetch('/wp-json/dwp/v1/profile', {
    method: 'POST',
    body: new FormData(form),
    headers: { 'X-WP-Nonce': data.restNonce, Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fieldErrors = body.errors || (body.data && body.data.params) || null;
    if (fieldErrors) { TdFormValidation.apply(form, fieldErrors); return; }
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  TdToast.success('Đã lưu');
});
```

Endpoint tự viết có thể trả thẳng dạng Laravel mà `apply()` hiểu:

```php
<?php
return new WP_REST_Response(['errors' => ['email' => ['Email đã được dùng']]], 422);
// admin-ajax: wp_send_json(['errors' => $errors], 422);
```

Tên field dạng mảng PHP (`tags[]`, `meta[title]`) khớp với key dạng chấm (`tags.0`, `meta.title`) tự động.

## Nâng cấp phiên bản

1. Đọc [Nâng cấp](../upgrading/README.md) và [Breaking changes](../upgrading/breaking-changes.md) cho các bản ở giữa.
2. Copy bản mới vào thư mục **mới** (ví dụ `…/td-components/0.21.1/`); giữ thư mục cũ tới khi xong.
3. Đổi `TD_VERSION`. Mọi URL (CSS + module) đổi theo, cache cũ không còn được dùng.
4. Kiểm tra trên staging: form (submit, validation, lỗi server), modal, lightbox, menu, hovercard, trang có CSP (console
   không có `Refused to …`).
5. Xoá thư mục cũ sau khi production ổn định (trang cũ còn mở trong trình duyệt người dùng vẫn cần file cũ một lúc).

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Mục menu do plugin đăng ký không hiện | hai bản `td-menu.js` (URL khác nhau, ví dụ có/không `?ver=`) | đăng ký module kit với `version = null`, mọi nơi import cùng specifier |
| Sau nâng cấp, component chạy nửa cũ nửa mới | dùng `?ver=` thay vì thư mục theo phiên bản | đặt phiên bản vào đường dẫn |
| `Failed to resolve module specifier "@dazzxq/td-components/…"` (WordPress) | module của site không khai báo kit là dependency, nên WP không đưa vào import map | thêm id vào mảng `$deps` khi `wp_register_script_module` |
| Như trên (PHP thuần) | import map in sau module đầu tiên, thiếu nonce, hoặc thiếu mục | in import map sớm trong `<head>`, có nonce, sinh từ `package.json` |
| Module không chạy, console báo MIME type | server trả `.js`/`.mjs` sai `Content-Type` (nginx cũ không map `.mjs`; kèm `nosniff` là bị chặn) | map `text/javascript` cho `js`/`mjs` ([MIME của module JS](#mime-của-module-js)) |
| Click ảnh mở hai viewer / không mở | `@dwp/lightbox` và `TdLightbox.bind({ attrPrefix: 'dwp' })` cùng chạy | chỉ bật một |
| Hovercard trả nội dung của người chưa đăng nhập (WP) | REST với cookie nhưng không có `X-WP-Nonce` | route riêng / admin-ajax / hook `content()` tự gửi nonce |
| Giao diện 135 lệch sau khi nạp `td.css` | CSS `td-*` cũ của 135 cùng layer và token | không nạp cả hai trên cùng trang |
| `td-dropdown` rỗng | `options` là property, chưa gán | đọc JSON block rồi gán `el.options`, hoặc dùng `td_dropdown()` (select bên trong) |
| `Cannot redeclare td_button()` (135) | còn nạp `src/Ui/markup.php` cũ cùng `php/td.php` | bỏ file cũ, chỉ `require_once` adapter của kit |

## Xem thêm

- [Cài đặt](../getting-started/installation.md) · [Yêu cầu hệ thống](../getting-started/requirements.md)
- [Adapter PHP](php-adapter.md) — `php/td.php`: import map, `td.css`, markup SSR, icon
- [CSP](csp.md) · [Bảo mật](security.md) · [Form](forms.md)
- [Lightbox](../components/lightbox.md) · [Menu](../components/menu.md) · [Hovercard](../components/hovercard.md) ·
  [Tooltip](../components/tooltip.md)
- [Theming](../customization/theming.md) — ghi đè token từ theme/site
- [Nâng cấp](../upgrading/README.md)
