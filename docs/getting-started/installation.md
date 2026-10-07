[Tài liệu](../README.md) › Bắt đầu › Cài đặt

# Cài đặt

Kit gồm hai phần, lúc nào cũng phải nạp **cả hai**:

1. **`td.css`**: một file CSS duy nhất chứa token `--td-*` và style của mọi component. Nạp một lần cho cả trang.
2. **File JS của component**: mỗi component là một ES module riêng. Import component nào thì thẻ/lớp đó được đăng ký.

Thiếu `td.css` thì component vẫn chạy nhưng không có giao diện (chữ trần, không khung). Thiếu JS thì thẻ `<td-button>`
chỉ là một thẻ lạ, trình duyệt hiển thị nội dung text bên trong.

Mục lục:

- [1. Tải kit về máy (npm từ GitHub)](#1-tải-kit-về-máy-npm-từ-github)
- [2. Dùng với Vite / bundler](#2-dùng-với-vite--bundler)
- [3. PHP thuần / HTML (không bundler)](#3-php-thuần--html-không-bundler) (kèm [MIME của module JS](#mime-của-module-js))
- [4. WordPress](#4-wordpress)
- [5. Kiểm tra đã cài đúng chưa](#5-kiểm-tra-đã-cài-đúng-chưa)
- [Danh sách subpath được export](#danh-sách-subpath-được-export)

Trước khi cài, xem [Yêu cầu hệ thống](requirements.md).

## 1. Tải kit về máy (npm từ GitHub)

Kit **không** publish lên npm registry. Bạn cài thẳng từ repo GitHub `dazzxq/td-components`, tên package là
`@dazzxq/td-components`.

```bash
# Bản mới nhất trên nhánh mặc định (không khuyên dùng cho production: mỗi lần cài lại có thể ra bản khác)
npm install github:dazzxq/td-components

# Khuyên dùng: ghim theo tag phiên bản
npm install github:dazzxq/td-components#v0.57.0
```

Sau lệnh trên, `package.json` của site có dòng dạng:

```json
{
  "dependencies": {
    "@dazzxq/td-components": "github:dazzxq/td-components#v0.57.0"
  }
}
```

Ghi chú:

- **Luôn ghim tag** (`#v0.57.0`). Kit đang ở giai đoạn `0.x`: bản minor mới (0.16 → 0.17) có thể đổi hành vi. Nâng cấp
  là việc có chủ đích, xem [Nâng cấp](../upgrading/README.md).
- Tag chỉ dùng được khi nó đã được **push lên GitHub**. Nếu `npm install …#v0.57.0` báo không tìm thấy ref, kiểm tra
  `git ls-remote --tags https://github.com/dazzxq/td-components.git`.
- Package **không có dependency runtime** nào. `package.json#files` giới hạn phần nội dung được tải: `src/` (từ
  0.16.0 **không** còn file test `*.test.js` / `*.browser-test.js` và file story `*.stories.*`), `index.js`, `td.css`,
  `php/` (adapter PHP `php/td.php`, từ 0.17.0), `bin/` (CLI `td-theme`, từ 0.42.0, không kèm `bin/*.test.mjs`), `THIRD_PARTY_NOTICES.md`; ngoài ra npm luôn tự kèm file metadata như `package.json`, `README.md` (và `LICENSE` nếu
  có). `package.json` khai báo `engines.node >= 20` và export cả `@dazzxq/td-components/package.json` (công cụ đọc
  phiên bản kit dùng được).
- Nâng cấp sau này: đổi tag rồi chạy lại `npm install github:dazzxq/td-components#v<bản-mới>`.

Sau khi cài, kit nằm ở `node_modules/@dazzxq/td-components/`:

```
node_modules/@dazzxq/td-components/
├── td.css            ← stylesheet duy nhất (đã build sẵn, không cần build lại)
├── index.js          ← barrel: re-export mọi class + hàm icon + hàm dom-utils công khai
├── php/td.php        ← adapter PHP chính thức (import map, <link> td.css, markup SSR)
├── src/
│   ├── base/         TdBaseElement, TdFormElement, td-sample
│   ├── form/         button, checkbox, toggle, input-field, slider, dropdown, chip-input, password-meter, datetime-picker
│   ├── feedback/     modal, modal-stack, toast, tooltip, loading, menu, hovercard, lightbox, scroll-top
│   ├── display/      table, tabs, pagination, empty-state
│   ├── icons/        registry icon + <td-icon>
│   ├── utils/        dom-utils, datetime, form-validation, layers, …
│   └── styles/       CSS nguồn (đã gộp vào td.css, không cần nạp riêng)
├── THIRD_PARTY_NOTICES.md
├── package.json      ← npm luôn kèm (metadata, exports)
└── README.md         ← npm luôn kèm
```

## 2. Dùng với Vite / bundler

Vite (và bundler hiểu `package.json#exports`) cho phép import bằng tên package. Không cần cấu hình gì thêm.

### Nạp CSS một lần

Trong file JS gốc của site (ví dụ `src/main.js`):

```js
import '@dazzxq/td-components/td.css';
```

Hoặc, nếu muốn CSS nằm ngoài JS (dễ kiểm soát thứ tự với CSS của site), import trong file CSS của bạn:

```css
/* src/app.css */
@import '@dazzxq/td-components/td.css';

/* CSS của site, KHÔNG bọc trong @layer → luôn thắng style của kit */
:root { --td-accent: #b3261e; }
```

### Import từng component (khuyên dùng)

```js
// Custom element: import để ĐĂNG KÝ thẻ, không cần lấy biến nào
import '@dazzxq/td-components/button';        // <td-button>
import '@dazzxq/td-components/input-field';   // <td-input-field>
import '@dazzxq/td-components/dropdown';      // <td-dropdown>

// API tĩnh (không phải thẻ): lấy class ra dùng
import { TdToast } from '@dazzxq/td-components/toast';
import { TdModal } from '@dazzxq/td-components/modal';

TdToast.success('Đã lưu');
```

Chỉ import qua các **subpath có trong bảng export** (xem [cuối trang](#danh-sách-subpath-được-export)). Đường dẫn sâu
như `@dazzxq/td-components/src/utils/layers.js` bị `exports` chặn trong bundler: đó là file nội bộ, có thể đổi bất kỳ
lúc nào.

### Import tất cả qua barrel

```js
import '@dazzxq/td-components';                         // đăng ký mọi custom element
import { TdToast, TdModal } from '@dazzxq/td-components'; // hoặc lấy class từ barrel
```

Tree-shaking: từ 0.16.0 `package.json#sideEffects` liệt kê đúng các module có side effect khi import — mọi file đăng
ký custom element (`customElements.define(...)`), `td-tooltip.js` (tự khởi tạo singleton lắng nghe `data-tooltip` toàn
trang) và mọi file `*.css`. Module còn lại (`TdToast`, `TdModal`, `TdMenu`, tiện ích…) bundler được phép bỏ nếu không
dùng. Tuy vậy import từ barrel vẫn **đăng ký mọi thẻ** (các file đăng ký luôn được giữ); nếu quan tâm dung lượng, import
theo subpath.

Barrel export thêm `TdIconElement` từ 0.16.0 (nên import barrel cũng đăng ký `<td-icon>`). Từ 0.17.0 barrel re-export
thêm các hàm icon `tdIcon`, `registerIcons`, `hasIcon`, `listIcons`, `fillIconSlots` và các hàm của dom-utils (`slugify`,
`formatFileSize`, `formatNumber`, `debounce`, `throttle`, `parseColorToRgb`, `relativeLuminance`, `contrastRatio`,
`getAccessibleTextColor`) — xem [Tiện ích](../components/utilities.md#import-từ-barrel). `<td-sample>` không có trong
barrel: import riêng `@dazzxq/td-components/sample`.

### Lưu ý khi dùng Vite

- **Dev server chèn CSS bằng thẻ `<style>`.** Nếu trang dev có CSP strict, CSS import từ JS sẽ bị chặn. Bản build
  (`vite build`) xuất CSS thành file `<link>` nên không bị. Muốn thử CSP, dùng `vite build && vite preview`.
- Vite có thể pre-bundle dependency ở chế độ dev. Mọi subpath được gộp trong một lần nên các singleton dùng chung
  (registry lớp nổi, stack modal) vẫn là một bản. Nếu thấy hiện tượng lạ sau khi đổi phiên bản (ví dụ Escape không đóng
  menu trong modal), xoá cache `node_modules/.vite` rồi chạy lại.

## 3. PHP thuần / HTML (không bundler)

Đây là cách dùng cho site PHP như 135: không có build step, trình duyệt tự nạp source ES module.

### Bước 1: copy kit vào thư mục public

Tải kit bằng npm trên máy dev (mục 1), rồi copy vào thư mục web server phục vụ được. **Nên đặt số phiên bản vào tên
thư mục** (lý do ở bước 4):

```bash
# từ thư mục gốc project
DEST=public/vendor/td-components-0.57.0
mkdir -p "$DEST"
cp node_modules/@dazzxq/td-components/td.css node_modules/@dazzxq/td-components/index.js "$DEST"/
rsync -a --exclude='*.test.js' --exclude='*.browser-test.js' --exclude='*.stories.js' \
  node_modules/@dazzxq/td-components/src "$DEST"/
# Dùng adapter PHP (import map + markup SSR)? copy thêm php/ và package.json (adapter đọc exports từ đó)
cp -R node_modules/@dazzxq/td-components/php node_modules/@dazzxq/td-components/package.json "$DEST"/
# Dùng CLI td-theme (0.42.0+)? copy bin/ trừ file test
rsync -a --exclude='*.test.mjs' node_modules/@dazzxq/td-components/bin "$DEST"/
```

**Từ 0.42.0 gói có thêm `bin/`** (CLI `td-theme` sinh palette): site copy file bằng tay theo `package.json#files` phải
copy cả `bin/` và **bỏ** `bin/*.test.mjs` (`npm pack` đã tự loại). CLI chạy thẳng từ thư mục vendor, không cần npx /
`node_modules`: `node <vendor>/bin/td-theme.mjs …`. CSS theme đã sinh phải **sinh lại sau khi nâng cấp kit** nếu
`ALGORITHM_VERSION` của bộ sinh đổi (0.42.1 → `2`); nên có một gate so từng byte file theme đã commit với output của CLI
thuộc **đúng bản kit đang ghim** (phản hồi của 135 sau khi lên 0.42.0).

Từ 0.16.0 package không còn file test/story nên `rsync --exclude` không bắt buộc (giữ cũng không sao, và vẫn có ích nếu
bạn copy từ một bản clone repo thay vì từ `node_modules`); copy nguyên `src/` cũng chạy được.
Giữ nguyên cấu trúc thư mục `src/…`: các file import nhau bằng đường dẫn tương đối (`../base/td-base-element.js`),
đổi cấu trúc là hỏng.

### Bước 2: nạp CSS

```html
<link rel="stylesheet" href="/vendor/td-components-0.57.0/td.css">
```

Đặt `<link>` này **trước** CSS của site, để CSS site (không `@layer`) override token dễ dàng. Thực ra thứ tự không quá
quan trọng: style của kit nằm trong `@layer td.*`, CSS không layer của site luôn thắng dù đứng trước hay sau.

### Bước 3: nạp JS

**Cách A: trỏ thẳng đường dẫn file** (đơn giản nhất, không cần import map)

```html
<script type="module" src="/vendor/td-components-0.57.0/src/form/td-button.js"></script>
<script type="module" src="/vendor/td-components-0.57.0/src/form/td-input-field.js"></script>
<script type="module" src="/assets/js/app.js"></script>
```

```js
// /assets/js/app.js — import theo đường dẫn URL
import { TdToast } from '/vendor/td-components-0.57.0/src/feedback/td-toast.js';

document.querySelector('#save').addEventListener('click', () => TdToast.success('Đã lưu'));
```

**Cách B: import map** (để code của site viết `@dazzxq/td-components/...` giống hệt khi dùng Vite)

Import map cho trình duyệt biết tên package trỏ tới URL nào. Trình duyệt **không đọc** `package.json#exports`, nên một
dòng kiểu `"@dazzxq/td-components/": "/vendor/td-components-0.57.0/"` **không đủ**: tên `@dazzxq/td-components/button`
sẽ bị dịch thành `/vendor/td-components-0.57.0/button` (không tồn tại). Phải liệt kê từng subpath. Map đầy đủ (đúng
`package.json#exports` của bản đang ghim; site PHP không phải gõ tay — hàm `td_import_map()` /
`td_import_map_tag()` của [adapter PHP](../guides/php-adapter.md#css-và-import-map) sinh map này từ `package.json`):

```html
<script type="importmap">
{
  "imports": {
    "@dazzxq/td-components": "/vendor/td-components-0.57.0/index.js",
    "@dazzxq/td-components/icons": "/vendor/td-components-0.57.0/src/icons/td-icon.js",
    "@dazzxq/td-components/icon-element": "/vendor/td-components-0.57.0/src/icons/td-icon-element.js",
    "@dazzxq/td-components/base": "/vendor/td-components-0.57.0/src/base/td-base-element.js",
    "@dazzxq/td-components/form-element": "/vendor/td-components-0.57.0/src/base/td-form-element.js",
    "@dazzxq/td-components/sample": "/vendor/td-components-0.57.0/src/base/sample/td-sample.js",
    "@dazzxq/td-components/toggle": "/vendor/td-components-0.57.0/src/form/td-toggle.js",
    "@dazzxq/td-components/checkbox": "/vendor/td-components-0.57.0/src/form/td-checkbox.js",
    "@dazzxq/td-components/button": "/vendor/td-components-0.57.0/src/form/td-button.js",
    "@dazzxq/td-components/input-field": "/vendor/td-components-0.57.0/src/form/td-input-field.js",
    "@dazzxq/td-components/hint": "/vendor/td-components-0.57.0/src/form/td-hint.js",
    "@dazzxq/td-components/slider": "/vendor/td-components-0.57.0/src/form/td-slider.js",
    "@dazzxq/td-components/dropdown": "/vendor/td-components-0.57.0/src/form/td-dropdown.js",
    "@dazzxq/td-components/chip-input": "/vendor/td-components-0.57.0/src/form/td-chip-input.js",
    "@dazzxq/td-components/password-meter": "/vendor/td-components-0.57.0/src/form/td-password-meter.js",
    "@dazzxq/td-components/datetime": "/vendor/td-components-0.57.0/src/utils/datetime.js",
    "@dazzxq/td-components/datetime-picker": "/vendor/td-components-0.57.0/src/form/td-datetime-picker.js",
    "@dazzxq/td-components/datetime-range": "/vendor/td-components-0.57.0/src/form/td-datetime-range.js",
    "@dazzxq/td-components/color-picker": "/vendor/td-components-0.57.0/src/form/td-color-picker.js",
    "@dazzxq/td-components/choice-group": "/vendor/td-components-0.57.0/src/form/td-choice-group.js",
    "@dazzxq/td-components/modal": "/vendor/td-components-0.57.0/src/feedback/td-modal.js",
    "@dazzxq/td-components/modal-stack": "/vendor/td-components-0.57.0/src/feedback/td-modal-stack.js",
    "@dazzxq/td-components/lightbox": "/vendor/td-components-0.57.0/src/feedback/td-lightbox.js",
    "@dazzxq/td-components/toast": "/vendor/td-components-0.57.0/src/feedback/td-toast.js",
    "@dazzxq/td-components/tooltip": "/vendor/td-components-0.57.0/src/feedback/td-tooltip.js",
    "@dazzxq/td-components/loading": "/vendor/td-components-0.57.0/src/feedback/td-loading.js",
    "@dazzxq/td-components/menu": "/vendor/td-components-0.57.0/src/feedback/td-menu.js",
    "@dazzxq/td-components/hovercard": "/vendor/td-components-0.57.0/src/feedback/td-hovercard.js",
    "@dazzxq/td-components/scroll-top": "/vendor/td-components-0.57.0/src/feedback/td-scroll-top.js",
    "@dazzxq/td-components/table": "/vendor/td-components-0.57.0/src/display/td-table.js",
    "@dazzxq/td-components/tabs": "/vendor/td-components-0.57.0/src/display/td-tabs.js",
    "@dazzxq/td-components/dropzone": "/vendor/td-components-0.57.0/src/form/td-dropzone.js",
    "@dazzxq/td-components/progress": "/vendor/td-components-0.57.0/src/feedback/td-progress.js",
    "@dazzxq/td-components/alert": "/vendor/td-components-0.57.0/src/feedback/td-alert.js",
    "@dazzxq/td-components/otp-input": "/vendor/td-components-0.57.0/src/form/td-otp-input.js",
    "@dazzxq/td-components/scan-input": "/vendor/td-components-0.57.0/src/form/td-scan-input.js",
    "@dazzxq/td-components/tree": "/vendor/td-components-0.57.0/src/form/td-tree.js",
    "@dazzxq/td-components/tree-select": "/vendor/td-components-0.57.0/src/form/td-tree-select.js",
    "@dazzxq/td-components/number-input": "/vendor/td-components-0.57.0/src/form/td-number-input.js",
    "@dazzxq/td-components/repeater": "/vendor/td-components-0.57.0/src/form/td-repeater.js",
    "@dazzxq/td-components/media-field": "/vendor/td-components-0.57.0/src/form/td-media-field.js",
    "@dazzxq/td-components/media-gallery": "/vendor/td-components-0.57.0/src/form/td-media-gallery.js",
    "@dazzxq/td-components/drawer": "/vendor/td-components-0.57.0/src/feedback/td-drawer.js",
    "@dazzxq/td-components/media-picker": "/vendor/td-components-0.57.0/src/feedback/td-media-picker.js",
    "@dazzxq/td-components/copy": "/vendor/td-components-0.57.0/src/display/td-copy.js",
    "@dazzxq/td-components/masked-value": "/vendor/td-components-0.57.0/src/display/td-masked-value.js",
    "@dazzxq/td-components/filter-chips": "/vendor/td-components-0.57.0/src/display/td-filter-chips.js",
    "@dazzxq/td-components/steps": "/vendor/td-components-0.57.0/src/display/td-steps.js",
    "@dazzxq/td-components/timeline": "/vendor/td-components-0.57.0/src/display/td-timeline.js",
    "@dazzxq/td-components/diff": "/vendor/td-components-0.57.0/src/display/td-diff.js",
    "@dazzxq/td-components/check-matrix": "/vendor/td-components-0.57.0/src/form/td-check-matrix.js",
    "@dazzxq/td-components/rating": "/vendor/td-components-0.57.0/src/display/td-rating.js",
    "@dazzxq/td-components/carousel": "/vendor/td-components-0.57.0/src/display/td-carousel.js",
    "@dazzxq/td-components/media-grid": "/vendor/td-components-0.57.0/src/display/td-media-grid.js",
    "@dazzxq/td-components/sortable": "/vendor/td-components-0.57.0/src/display/td-sortable.js",
    "@dazzxq/td-components/pagination": "/vendor/td-components-0.57.0/src/display/td-pagination.js",
    "@dazzxq/td-components/empty-state": "/vendor/td-components-0.57.0/src/display/td-empty-state.js",
    "@dazzxq/td-components/dom-utils": "/vendor/td-components-0.57.0/src/utils/dom-utils.js",
    "@dazzxq/td-components/form-validation": "/vendor/td-components-0.57.0/src/utils/form-validation.js",
    "@dazzxq/td-components/breakpoints": "/vendor/td-components-0.57.0/src/utils/breakpoints.js"
  }
}
</script>
<script type="module" src="/assets/js/app.js"></script>
```

```js
// /assets/js/app.js — viết y như bản Vite
import '@dazzxq/td-components/button';
import { TdToast } from '@dazzxq/td-components/toast';
```

Quy tắc import map:

- Thẻ `<script type="importmap">` phải đứng **trước** mọi `<script type="module">` dùng tên package.
- Mỗi trang chỉ nên có một import map (trình duyệt cũ không gộp nhiều map).
- Chỉ cần giữ những dòng bạn thực sự import; để đủ cũng không sao (import map không tự tải file).

Trong PHP, bạn có thể sinh map từ một mảng để chỉ phải đổi số phiên bản ở một chỗ:

```php
<?php
$tdBase = '/vendor/td-components-0.57.0';
$tdMap = [
    '@dazzxq/td-components'             => "$tdBase/index.js",
    '@dazzxq/td-components/button'      => "$tdBase/src/form/td-button.js",
    '@dazzxq/td-components/input-field' => "$tdBase/src/form/td-input-field.js",
    '@dazzxq/td-components/dropdown'    => "$tdBase/src/form/td-dropdown.js",
    '@dazzxq/td-components/toast'       => "$tdBase/src/feedback/td-toast.js",
    '@dazzxq/td-components/modal'       => "$tdBase/src/feedback/td-modal.js",
    // … thêm subpath khác khi cần (xem bảng cuối trang)
];
?>
<link rel="stylesheet" href="<?= htmlspecialchars("$tdBase/td.css") ?>">
<script type="importmap"><?= json_encode(['imports' => $tdMap], JSON_UNESCAPED_SLASHES) ?></script>
<script type="module" src="/assets/js/app.js"></script>
```

### Bước 4: cache và nâng cấp

Trình duyệt tự tải các file import tương đối **mà không mang query string** của file gốc. Nếu bạn chỉ thêm `?v=0.57.0`
vào file đầu tiên, các file bên trong vẫn có thể lấy từ cache cũ, và trang chạy lẫn hai phiên bản. Vì vậy:

- Đặt kit trong thư mục **có số phiên bản** (`/vendor/td-components-0.57.0/`). Nâng cấp = copy bản mới sang thư mục mới
  (ví dụ `td-components-0.57.0/`) và đổi đường dẫn gốc (một biến `$tdBase`). Có thể cho cache rất lâu vì URL đổi theo bản.
- Mọi chỗ trong trang phải nạp kit qua **cùng một URL**. Hai URL khác nhau (ví dụ một chỗ `/vendor/td-components-0.57.0/…`
  và một chỗ còn sót `/vendor/td-components-0.16.0/…`) tạo ra hai bản module: hai registry lớp nổi, hai stack modal, và thẻ chỉ
  được đăng ký bởi bản nạp trước. Kết quả là bàn phím/focus giữa các lớp nổi chạy sai.

### MIME của module JS

Trình duyệt chỉ chạy ES module khi server trả MIME JavaScript. Mọi file module — `.js` của kit, và `.mjs` nếu site (hoặc
thư viện thứ ba) dùng đuôi này — phải có `Content-Type: text/javascript`. nginx/Apache hiện đại map sẵn `.js`, nhưng
`mime.types` của **nginx cũ không có `.mjs`** → file trả `application/octet-stream`; nếu site gửi
`X-Content-Type-Options: nosniff` thì module bị chặn hẳn (Console: `Failed to load module script … MIME type`).

```nginx
# nginx: trong http { }, ngay sau `include mime.types;`
types { text/javascript mjs; }
```

```apache
# Apache: .htaccess hoặc vhost
AddType text/javascript .js .mjs
```

Với nginx, đừng đặt khối `types { text/javascript mjs; }` một mình trong `server`/`location`: ở cấp dưới nó **thay hẳn**
bảng MIME kế thừa. Kiểm tra nhanh: `curl -sI https://site/vendor/td-components-0.57.0/src/form/td-button.js` → dòng
`content-type` phải là `text/javascript` (hoặc `application/javascript`). Chi tiết cho WordPress/PHP:
[WordPress & PHP](../guides/wordpress-php.md#mime-của-module-js).

### CSP với nonce

Nếu site dùng CSP theo nonce (`style-src 'nonce-…'`), gắn cùng một nonce cho `<link>`, import map và script inline:

```php
<?php $nonce = base64_encode(random_bytes(16)); ?>
<?php header("Content-Security-Policy: default-src 'self'; style-src 'nonce-$nonce'; style-src-attr 'none'; script-src 'self' 'nonce-$nonce'"); ?>
<link rel="stylesheet" href="/vendor/td-components-0.57.0/td.css" nonce="<?= $nonce ?>">
<script type="importmap" nonce="<?= $nonce ?>"><?= json_encode(['imports' => $tdMap], JSON_UNESCAPED_SLASHES) ?></script>
<script type="module" src="/assets/js/app.js" nonce="<?= $nonce ?>"></script>
```

- `td.css` không cần `'unsafe-inline'`; kit chỉ ghi style qua CSSOM, CSP cho phép.
- File module ngoài cùng origin chạy với `script-src 'self'`; nonce trên thẻ `<script src>` chỉ cần nếu `script-src` của
  bạn không có `'self'`. Import map (luôn là inline) thì **luôn** cần nonce hoặc hash.
- Chi tiết: [Hướng dẫn CSP](../guides/csp.md).

## 4. WordPress

Nguyên tắc giống PHP thuần: copy kit vào theme/plugin, enqueue `td.css` và nạp JS dạng module. Ví dụ dưới đặt kit ở
`wp-content/themes/<theme>/assets/vendor/td-components-0.57.0/`.

### CSS

```php
// functions.php
add_action('wp_enqueue_scripts', function () {
    $ver  = '0.57.0';
    $base = get_theme_file_uri("assets/vendor/td-components-$ver");
    wp_enqueue_style('td-components', "$base/td.css", [], $ver);
});
```

### JS: WordPress 6.5+ (Script Modules API, khuyên dùng)

WordPress 6.5 có `wp_register_script_module` / `wp_enqueue_script_module`. WordPress tự in import map cho các module
được khai báo làm dependency, nên code của theme viết được `import '@dazzxq/td-components/button'`.

```php
add_action('wp_enqueue_scripts', function () {
    $ver  = '0.57.0';
    $base = get_theme_file_uri("assets/vendor/td-components-$ver");

    // Đăng ký các subpath của kit dưới đúng tên package (id = tên trong import map).
    $td = [
        '@dazzxq/td-components/button'      => 'src/form/td-button.js',
        '@dazzxq/td-components/input-field' => 'src/form/td-input-field.js',
        '@dazzxq/td-components/dropdown'    => 'src/form/td-dropdown.js',
        '@dazzxq/td-components/toast'       => 'src/feedback/td-toast.js',
        '@dazzxq/td-components/modal'       => 'src/feedback/td-modal.js',
    ];
    foreach ($td as $id => $path) {
        // version null: KHÔNG thêm ?ver= (thư mục đã có số phiên bản, xem "cache và nâng cấp" ở trên)
        wp_register_script_module($id, "$base/$path", [], null);
    }

    // Module của theme, phụ thuộc các module trên → WP in import map + modulepreload.
    wp_enqueue_script_module(
        'theme-app',
        get_theme_file_uri('assets/js/app.js'),
        array_keys($td),
        wp_get_theme()->get('Version')
    );
});
```

```js
// assets/js/app.js
import '@dazzxq/td-components/button';
import { TdToast } from '@dazzxq/td-components/toast';
```

### JS: WordPress cũ hơn 6.5 (`wp_enqueue_script` + `type="module"`)

`wp_enqueue_script` in `<script>` thường; đổi thành module bằng filter `script_loader_tag`. Cách này không có import map,
nên `app.js` import theo đường dẫn URL (Cách A ở phần PHP) hoặc bạn tự in import map.

```php
add_action('wp_enqueue_scripts', function () {
    $ver  = '0.57.0';
    $base = get_theme_file_uri("assets/vendor/td-components-$ver");
    wp_enqueue_script('td-button', "$base/src/form/td-button.js", [], null, true);
    wp_enqueue_script('theme-app', get_theme_file_uri('assets/js/app.js'), ['td-button'], null, true);
});

add_filter('script_loader_tag', function ($tag, $handle) {
    if (in_array($handle, ['td-button', 'theme-app'], true)) {
        $tag = str_replace('<script ', '<script type="module" ', $tag);
    }
    return $tag;
}, 10, 2);
```

### Nonce trên WordPress

Nếu site in CSP với nonce, thêm nonce cho thẻ do WordPress sinh bằng các filter `wp_script_attributes` (thẻ
`<script src>`), `wp_inline_script_attributes` (import map và script inline) và `style_loader_tag` (thẻ `<link>`).

Tích hợp sâu hơn (cả 135 lẫn dwp): [Hướng dẫn WordPress & PHP](../guides/wordpress-php.md). Markup render phía server
(nút, ô nhập, dropdown, switch, checkbox, icon) và import map: [Adapter PHP](../guides/php-adapter.md) (`php/td.php`).

## 5. Kiểm tra đã cài đúng chưa

Mở trang qua `http(s)://` (không phải `file://`), mở DevTools Console và chạy:

```js
// 1. Thẻ đã được đăng ký? (tên thẻ của component bạn đã import)
customElements.get('td-button');          // → class TdButton, không phải undefined

// 2. td.css đã nạp? Token phải có giá trị.
getComputedStyle(document.documentElement).getPropertyValue('--td-accent');   // → "#2563eb"

// 3. Thử một API tĩnh (chỉ khi trang đã import toast)
const { TdToast } = await import('@dazzxq/td-components/toast'); // cần import map; hoặc dùng URL đầy đủ
TdToast.success('Cài đặt thành công');
```

Dấu hiệu lỗi thường gặp:

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Trang trắng, Console báo CORS / `origin 'null'` | Mở bằng `file://` | Chạy qua web server (`npx vite`, `php -S localhost:8000`) |
| Thẻ hiện chữ trần, không có khung | Thiếu `td.css` hoặc đường dẫn sai (404) | Kiểm tra tab Network, dòng `td.css` |
| Có khung nhưng không bấm/không mở được | Chưa import JS của component đó | `customElements.get('td-…')` trả `undefined` → thêm import |
| `Failed to resolve module specifier "@dazzxq/td-components/…"` | Trình duyệt không có import map (hoặc map thiếu dòng đó) | Thêm import map (mục 3, Cách B) hoặc import bằng URL |
| `Failed to load module script … MIME type "text/html"` | URL sai, server trả trang 404 HTML | Sửa đường dẫn; giữ nguyên cấu trúc `src/` khi copy |
| `Failed to load module script … MIME type "application/octet-stream"` (hoặc `""`) | Server không map đuôi file sang JavaScript — hay gặp với `.mjs` trên nginx cũ; header `X-Content-Type-Options: nosniff` khiến trình duyệt chặn hẳn | Trả `.js` và `.mjs` với `Content-Type: text/javascript` (xem [MIME của module JS](#mime-của-module-js)) |
| Console báo `Refused to apply style … Content Security Policy` | CSP chặn `<link>` (thiếu nonce) hoặc Vite dev chèn `<style>` | Thêm nonce cho `<link>`; thử CSP trên bản build |
| Escape/Tab trong modal chạy sai, menu mở dưới modal bị khoá | Nạp kit từ hai URL khác nhau (hai bản module) | Mọi import dùng cùng một đường dẫn gốc |

Muốn xem mọi component chạy thử: trong thư mục repo kit, `npm run demo` mở `demo.html` qua Vite.

## Danh sách subpath được export

Nguồn: `package.json#exports`.

| Import | File | Cung cấp |
|---|---|---|
| `@dazzxq/td-components` | `index.js` | Barrel: mọi class dưới đây, kể cả `TdIconElement` (0.16.0); hàm icon `tdIcon` `registerIcons` `hasIcon` `listIcons` `fillIconSlots` và hàm dom-utils công khai (0.17.0). Không có `td-sample`, `parseChipItems`, `svgStringToDefinition`, `renderIconDefinition` |
| `@dazzxq/td-components/td.css` | `td.css` | Stylesheet |
| `@dazzxq/td-components/button` | `src/form/td-button.js` | `<td-button>`, `TdButton` |
| `@dazzxq/td-components/input-field` | `src/form/td-input-field.js` | `<td-input-field>`, `TdInputField` |
| `@dazzxq/td-components/hint` | `src/form/td-hint.js` | `<td-hint>`, `TdHint` (0.54.0; dùng độc lập với `for`, hoặc làm con của một control để chèn hint có link / `<code>`) |
| `@dazzxq/td-components/checkbox` | `src/form/td-checkbox.js` | `<td-checkbox>`, `TdCheckbox` |
| `@dazzxq/td-components/toggle` | `src/form/td-toggle.js` | `<td-toggle>`, `TdToggle` |
| `@dazzxq/td-components/slider` | `src/form/td-slider.js` | `<td-slider>`, `TdSlider` |
| `@dazzxq/td-components/dropdown` | `src/form/td-dropdown.js` | `<td-dropdown>`, `TdDropdown` |
| `@dazzxq/td-components/chip-input` | `src/form/td-chip-input.js` | `<td-chip-input>`, `TdChipInput`, `parseChipItems` |
| `@dazzxq/td-components/password-meter` | `src/form/td-password-meter.js` | `<td-password-meter>`, `TdPasswordMeter` |
| `@dazzxq/td-components/datetime-picker` | `src/form/td-datetime-picker.js` | `<td-datetime-picker>`, `TdDatetimePicker` |
| `@dazzxq/td-components/datetime-range` | `src/form/td-datetime-range.js` | `<td-datetime-range>`, `TdDatetimeRange` (0.40.0) |
| `@dazzxq/td-components/color-picker` | `src/form/td-color-picker.js` | `<td-color-picker>`, `TdColorPicker` (0.48.0) |
| `@dazzxq/td-components/choice-group` | `src/form/td-choice-group.js` | `<td-choice-group>`, `TdChoiceGroup` (0.49.0) |
| `@dazzxq/td-components/datetime` | `src/utils/datetime.js` | `TdDateTime` (tiện ích ngày giờ) |
| `@dazzxq/td-components/form-validation` | `src/utils/form-validation.js` | `TdFormValidation`, `trackFormDirty` (0.44.0) |
| `@dazzxq/td-components/breakpoints` | `src/utils/breakpoints.js` | Breakpoint kit (0.34.0, [ADR 0014](../internal/decisions/0014-breakpoints-container-queries.md)): `BREAKPOINTS`, `SHORT_MAX`, `mqBelow`, `matchesBelow`, `isCoarsePointer`, `isShort` — xem [responsive](../concepts/responsive.md) |
| `@dazzxq/td-components/modal` | `src/feedback/td-modal.js` | `TdModal` (API tĩnh) |
| `@dazzxq/td-components/modal-stack` | `src/feedback/td-modal-stack.js` | `TdModalStackManager` |
| `@dazzxq/td-components/toast` | `src/feedback/td-toast.js` | `TdToast` (API tĩnh) |
| `@dazzxq/td-components/tooltip` | `src/feedback/td-tooltip.js` | `TdTooltip`, `tdTooltip` (tự khởi tạo khi import) |
| `@dazzxq/td-components/loading` | `src/feedback/td-loading.js` | `TdLoading`, `TdLoadingSpinner` |
| `@dazzxq/td-components/menu` | `src/feedback/td-menu.js` | `TdMenu` |
| `@dazzxq/td-components/hovercard` | `src/feedback/td-hovercard.js` | `TdHovercard` |
| `@dazzxq/td-components/scroll-top` | `src/feedback/td-scroll-top.js` | `<td-scroll-top>`, `TdScrollTop` |
| `@dazzxq/td-components/lightbox` | `src/feedback/td-lightbox.js` | `TdLightbox` |
| `@dazzxq/td-components/table` | `src/display/td-table.js` | `<td-table>`, `TdTable` |
| `@dazzxq/td-components/tabs` | `src/display/td-tabs.js` | `<td-tabs>`, `TdTabs` |
| `@dazzxq/td-components/dropzone` | `src/form/td-dropzone.js` | `<td-dropzone>`, `TdDropzone` |
| `@dazzxq/td-components/progress` | `src/feedback/td-progress.js` | `<td-progress>`, `TdProgress` |
| `@dazzxq/td-components/alert` | `src/feedback/td-alert.js` | `<td-alert>`, `TdAlert` |
| `@dazzxq/td-components/otp-input` | `src/form/td-otp-input.js` | `<td-otp-input>`, `TdOtpInput` |
| `@dazzxq/td-components/scan-input` | `src/form/td-scan-input.js` | `<td-scan-input>`, `TdScanInput` (0.38.0) |
| `@dazzxq/td-components/tree` | `src/form/td-tree.js` | `<td-tree>`, `TdTree` |
| `@dazzxq/td-components/tree-select` | `src/form/td-tree-select.js` | `<td-tree-select>`, `TdTreeSelect` (nạp kèm `td-tree`) |
| `@dazzxq/td-components/number-input` | `src/form/td-number-input.js` | `<td-number-input>`, `TdNumberInput` |
| `@dazzxq/td-components/repeater` | `src/form/td-repeater.js` | `<td-repeater>`, `TdRepeater` |
| `@dazzxq/td-components/drawer` | `src/feedback/td-drawer.js` | `<td-drawer>`, `TdDrawer` |
| `@dazzxq/td-components/media-picker` | `src/feedback/td-media-picker.js` | `<td-media-picker>`, `TdMediaPicker` (0.32.0) |
| `@dazzxq/td-components/media-field` | `src/form/td-media-field.js` | `<td-media-field>`, `TdMediaField` (0.32.0; nạp kèm `media-picker`) |
| `@dazzxq/td-components/media-gallery` | `src/form/td-media-gallery.js` | `<td-media-gallery>`, `TdMediaGallery` (0.43.0; nạp kèm `media-picker`) |
| `@dazzxq/td-components/copy` | `src/display/td-copy.js` | `<td-copy>`, `TdCopy` |
| `@dazzxq/td-components/masked-value` | `src/display/td-masked-value.js` | `<td-masked-value>`, `TdMaskedValue` (nạp kèm `td-copy`) |
| `@dazzxq/td-components/filter-chips` | `src/display/td-filter-chips.js` | `<td-filter-chips>`, `TdFilterChips` (0.39.0) |
| `@dazzxq/td-components/steps` | `src/display/td-steps.js` | `<td-steps>`, `TdSteps` (0.45.0) |
| `@dazzxq/td-components/timeline` | `src/display/td-timeline.js` | `<td-timeline>`, `TdTimeline` (0.45.0) |
| `@dazzxq/td-components/diff` | `src/display/td-diff.js` | `<td-diff>`, `TdDiff` (0.46.0) |
| `@dazzxq/td-components/check-matrix` | `src/form/td-check-matrix.js` | `<td-check-matrix>`, `TdCheckMatrix` (0.47.0) |
| `@dazzxq/td-components/rating` | `src/display/td-rating.js` | `<td-rating>`, `TdRating` (0.50.0) |
| `@dazzxq/td-components/carousel` | `src/display/td-carousel.js` | `<td-carousel>`, `TdCarousel` (0.50.0) |
| `@dazzxq/td-components/media-grid` | `src/display/td-media-grid.js` | `<td-media-grid>`, `TdMediaGrid` |
| `@dazzxq/td-components/sortable` | `src/display/td-sortable.js` | `<td-sortable>`, `TdSortable` |
| `@dazzxq/td-components/pagination` | `src/display/td-pagination.js` | `<td-pagination>`, `TdPagination` |
| `@dazzxq/td-components/empty-state` | `src/display/td-empty-state.js` | `<td-empty-state>`, `TdEmptyState` |
| `@dazzxq/td-components/icons` | `src/icons/td-icon.js` | Hàm icon (`tdIcon`, `registerIcons`, …) |
| `@dazzxq/td-components/icon-element` | `src/icons/td-icon-element.js` | `<td-icon>`, `TdIconElement` |
| `@dazzxq/td-components/icons.json` | `src/icons/icons.json` | Dữ liệu icon (JSON) |
| `@dazzxq/td-components/dom-utils` | `src/utils/dom-utils.js` | Tiện ích DOM |
| `@dazzxq/td-components/base` | `src/base/td-base-element.js` | `TdBaseElement` (tự viết component) |
| `@dazzxq/td-components/form-element` | `src/base/td-form-element.js` | `TdFormElement` |
| `@dazzxq/td-components/sample` | `src/base/sample/td-sample.js` | `<td-sample>` (component mẫu) |
| `@dazzxq/td-components/package.json` | `package.json` | Metadata (phiên bản…), từ 0.16.0 |

## Xem thêm

- [Trang đầu tiên trong 5 phút](quick-start.md)
- [Cách kit hoạt động](../concepts/how-it-works.md)
- [Danh mục component](../components/README.md)
- [Hướng dẫn CSP](../guides/csp.md) · [WordPress & PHP](../guides/wordpress-php.md)
- [Nâng cấp phiên bản](../upgrading/README.md)
