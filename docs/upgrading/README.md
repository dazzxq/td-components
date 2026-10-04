[Tài liệu](../README.md) › Nâng cấp › Tổng quan

# Nâng cấp td-components

Trang này trả lời bốn câu hỏi: kit đánh số phiên bản thế nào, nâng cấp từng bước ra sao, lùi lại (rollback) thế nào
khi có sự cố, và cần kiểm tra gì sau khi nâng cấp. Chi tiết "bản nào đổi gì, site phải sửa gì" nằm ở
[breaking-changes.md](breaking-changes.md); bảng đổi tên class cũ → class mới nằm ở [class-map.md](class-map.md).

Phiên bản hiện tại: **0.33.0** (`package.json` → `"version": "0.33.0"`, tag git `v0.33.0`).

## Chính sách phiên bản

td-components dùng số phiên bản `MAJOR.MINOR.PATCH`, nhưng vì kit **đang ở 0.x** nên quy ước khác semver 1.x ở
một điểm quan trọng: bản **minor** được phép phá vỡ.

| Loại bản | Ví dụ | Có thể chứa gì | Bạn cần làm gì |
|---|---|---|---|
| Minor `0.X.0` | 0.9.0, 0.14.0 | Tính năng mới, **đổi hành vi**, **đổi tên class nội bộ**, **đổi giao diện lớn**, gỡ dependency | Luôn đọc mục của bản đó trong [breaking-changes.md](breaking-changes.md) trước khi nâng |
| Patch `0.x.Y` | 0.14.1, 0.14.4 | Sửa lỗi, **tinh chỉnh giao diện** (viền, màu, độ sáng), đôi khi một API nhỏ bổ sung | Đọc CHANGELOG; kiểm tra bằng mắt những trang có form / nút |
| Major `1.0.0` | chưa có | Khi phát hành 1.0, kit chuyển sang semver chuẩn (chỉ major mới được phá vỡ) | — |

Những điều cần nhớ:

- **Patch vẫn có thể đổi giao diện.** Ví dụ 0.14.1 → 0.14.3 đổi viền control, nút secondary, màu nút disabled —
  không đổi API nhưng site nhìn khác. "Patch = an toàn tuyệt đối" là giả định sai với kit này.
- **Mỗi bản phát hành là một tag git `vX.Y.Z`** trên nhánh `main` (ví dụ `v0.17.0`). Kit không publish lên npm
  registry; site cài trực tiếp từ GitHub theo tag.
- **[CHANGELOG.md](../../CHANGELOG.md) là nguồn sự thật.** Mỗi bản có mục `## x.y.z` chia thành `Breaking`,
  `Behaviour changes`, `Changed (visual)`, `Added`, `Fixed`, `Security`. Tài liệu upgrading chỉ diễn giải lại và
  thêm ví dụ trước/sau; nếu hai nơi mâu thuẫn, tin CHANGELOG và source.
- Kit **không ship alias cho class cũ** ([ADR 0008](../internal/decisions/0008-drop-tailwind-token-css.md)).
  Khi class nội bộ đổi tên, CSS của site nhắm vào class cũ sẽ im lặng không còn tác dụng — không có cảnh báo.
- Tag, attribute, property, method, event công khai được giữ ổn định hơn class nội bộ. Nếu site chỉ dùng API công
  khai + token `--td-*`, phần lớn các bản nâng cấp không cần sửa code.

## Xem mình đang dùng bản nào

```bash
# Dòng khai báo trong package.json của site
grep td-components package.json
# "@dazzxq/td-components": "github:dazzxq/td-components#v0.16.0"

# Phiên bản thực sự đang nằm trong node_modules
# (đọc thẳng file — chạy được với mọi bản; từ 0.16.0 cũng có thể require('@dazzxq/td-components/package.json'))
node -p "JSON.parse(require('fs').readFileSync('node_modules/@dazzxq/td-components/package.json','utf8')).version"
```

Site PHP / WordPress không dùng npm: xem số phiên bản trong tên thư mục bạn đã copy kit vào (xem mục
[Site PHP và WordPress](#site-php-và-wordpress)), hoặc mở file `package.json` trong thư mục đó.

## Quy trình nâng cấp từng bước

Ví dụ dưới đây nâng từ `v0.16.0` lên `v0.17.0`. Nhảy nhiều bản một lúc (ví dụ 0.8.0 → 0.17.0) vẫn theo đúng các bước
này, chỉ là bước 1 phải đọc **mọi** bản nằm giữa.

### 1. Đọc trước khi đổi

1. Mở [CHANGELOG.md](../../CHANGELOG.md), đọc mọi mục từ bản ngay sau bản bạn đang dùng tới bản đích.
2. Mở [breaking-changes.md](breaking-changes.md), đọc mục "Cần làm gì" của từng bản đó và ghi ra danh sách việc.
3. Nếu site có CSS tự viết nhắm vào class bên trong component (ví dụ `.td-modal-header`, `.td-input`), tra
   [class-map.md](class-map.md).
4. Tuỳ chọn: xem diff giữa hai tag trên GitHub, ví dụ
   `https://github.com/dazzxq/td-components/compare/v0.16.0...v0.17.0`. Chú ý các thư mục `src/styles/` (giao
   diện), `php/` (adapter PHP chính thức — markup render phía server), `test/contracts/` (fixture test của repo: đổi ở
   đây nghĩa là markup component render ra đã đổi) và `td.css`.

### 2. Tạo nhánh riêng cho việc nâng cấp

```bash
git switch -c chore/td-components-0.17.0
```

Làm vậy để rollback chỉ là bỏ nhánh.

### 3. Đổi tag trong `package.json` và cài lại

Cách nhanh nhất là để npm tự sửa `package.json` và `package-lock.json`:

```bash
npm install github:dazzxq/td-components#v0.17.0
```

Hoặc sửa tay dòng dependency rồi chạy `npm install`:

```json
{
  "dependencies": {
    "@dazzxq/td-components": "github:dazzxq/td-components#v0.17.0"
  }
}
```

```bash
npm install
```

Sau đó kiểm tra lại bằng lệnh ở mục [Xem mình đang dùng bản nào](#xem-mình-đang-dùng-bản-nào). Với dependency
kiểu GitHub, `package-lock.json` ghi lại **mã commit** của tag; hãy commit cả `package-lock.json` để máy khác cài
đúng cùng bản.

Nếu `npm install` báo không tìm thấy tag: tag đó chưa có trên GitHub (chưa được push). Không có cách nào khác ngoài
chờ tag được đẩy lên, hoặc tạm thời trỏ vào mã commit cụ thể (`#<sha>`) nếu commit đó đã có trên GitHub.

### 4. Cập nhật đường dẫn `td.css` và module

- **Site dùng Vite / bundler:** không phải làm gì thêm. `import '@dazzxq/td-components/td.css'` và
  `import '@dazzxq/td-components/button'` tự trỏ vào bản mới. Khởi động lại dev server để Vite bỏ cache
  pre-bundle (`vite --force` nếu vẫn thấy code cũ).
- **Site PHP / WordPress / trang không bundler:** xem [Site PHP và WordPress](#site-php-và-wordpress) — bạn phải
  copy bản mới lên server, đổi đường dẫn và phá cache trình duyệt.

### 5. Làm các việc trong danh sách từ bước 1

Sửa selector CSS theo [class-map.md](class-map.md), sửa code theo mục "Cần làm gì" trong
[breaking-changes.md](breaking-changes.md).

### 6. Kiểm tra token tự override vẫn còn tác dụng

Site tuỳ biến giao diện bằng cách ghi đè token `--td-*` (xem [theming.md](../customization/theming.md)). Một token bị
đổi tên hoặc bị gỡ thì phần ghi đè của bạn **im lặng mất tác dụng**. Cách kiểm tra:

```bash
# 1. Liệt kê các token site đang ghi đè
grep -rhoE -e '--td-[a-zA-Z0-9-]+[[:space:]]*:' assets/ | tr -d ' :' | sort -u > /tmp/site-tokens.txt

# 2. Liệt kê các token td.css bản mới còn khai báo
grep -oE -e '--td-[a-zA-Z0-9-]+:' node_modules/@dazzxq/td-components/td.css | tr -d ':' | sort -u > /tmp/kit-tokens.txt

# 3. Token site ghi đè mà kit không còn khai báo
comm -23 /tmp/site-tokens.txt /tmp/kit-tokens.txt
```

(Đổi `assets/` thành thư mục CSS của site.) Dòng nào in ra ở bước 3 thì tra
[breaking-changes.md](breaking-changes.md). Tính tới 0.33.0, token duy nhất từng bị gỡ khỏi `td.css` là
`--td-glass-secondary-film` (0.14.3); ngoài ra custom property `--td-cb-color` của checkbox (không nằm trong
`td.css`) đã đổi tên thành `--td-checkbox-color` ở 0.7.0.

Ngoài chuyện tên, còn chuyện **ý nghĩa** của token đổi: ví dụ từ 0.14.1 viền lúc nghỉ của ô nhập dùng
`--td-control-border-soft` chứ không còn dùng `--td-control-border-strong`. Token vẫn tồn tại nhưng tác dụng khác.
Mỗi thay đổi kiểu này được ghi trong mục của bản tương ứng.

### 7. Chạy lại test của site

- Test tự động của site (unit, E2E, snapshot). Snapshot DOM gần như chắc chắn đổi ở các bản đổi class (0.7–0.10).
- Nếu site có test so sánh text của thông báo lỗi validation: từ 0.12.0 thông báo của td-checkbox, td-toggle,
  td-slider là tiếng Việt.
- Nếu site bật CSP chặt, mở trang với DevTools và xem tab Console có lỗi `Content-Security-Policy` không (xem
  [csp.md](../guides/csp.md)).

### 8. Kiểm tra bằng mắt

- Mở các trang thật của site: form, bảng, modal, toast, menu, trang có ảnh (lightbox).
- So với bản kit mới trong demo của chính kit: clone repo kit, `git checkout v0.17.0`, `npm install`, rồi
  `npm run demo` (trang `demo.html`) hoặc `npm run storybook`. Nếu site nhìn khác demo, nhiều khả năng CSS của site
  đang ghi đè — xem [Khi thấy giao diện khác lạ](#khi-thấy-giao-diện-khác-lạ).
- Thử cả chế độ tối nếu site bật `<html data-td-theme="dark">`, và chế độ tắt glass `<html data-td-glass="off">`
  nếu site dùng.

### 9. Commit và deploy

Commit `package.json`, `package-lock.json` và các sửa đổi. Ghi rõ bản cũ → bản mới trong commit message để sau này
rollback dễ.

## Site PHP và WordPress

Site PHP thuần (135) và WordPress (dwp) thường không chạy bundler; trình duyệt tải `td.css` bằng `<link>` và tải
module ES trực tiếp (xem [installation.md](../getting-started/installation.md) và
[wordpress-php.md](../guides/wordpress-php.md)). Khi nâng cấp cần làm thêm ba việc.

### Đặt kit trong thư mục có số phiên bản

Các file JS của kit import lẫn nhau bằng đường dẫn tương đối (ví dụ `../base/td-base-element.js`). Thêm `?v=…` vào
file đầu tiên **không** phá cache cho các file mà nó import. Cách chắc chắn nhất là để số phiên bản nằm trong đường
dẫn thư mục:

```bash
# Trong repo của site: lấy đúng tag và copy những gì kit publish (src, index.js, td.css, php/, package.json)
git clone --depth 1 --branch v0.17.0 https://github.com/dazzxq/td-components.git /tmp/td
mkdir -p public/vendor/td-components-0.17.0
cp -R /tmp/td/src /tmp/td/index.js /tmp/td/td.css /tmp/td/php /tmp/td/package.json public/vendor/td-components-0.17.0/
```

Giữ nguyên thư mục bản cũ (ví dụ `public/vendor/td-components-0.16.0/`) cho tới khi chắc chắn không cần rollback.

### Đổi đường dẫn `td.css` và import map ở một chỗ

```php
<?php
// config.php — một hằng số duy nhất, rollback = đổi lại dòng này
const TD_VERSION = '0.17.0';
const TD_BASE = '/vendor/td-components-' . TD_VERSION;
```

```php
<link rel="stylesheet" href="<?= htmlspecialchars(TD_BASE, ENT_QUOTES) ?>/td.css">

<script type="importmap">
{
  "imports": {
    "@dazzxq/td-components/button": "<?= TD_BASE ?>/src/form/td-button.js",
    "@dazzxq/td-components/toast": "<?= TD_BASE ?>/src/feedback/td-toast.js",
    "@dazzxq/td-components/lightbox": "<?= TD_BASE ?>/src/feedback/td-lightbox.js"
  }
}
</script>
```

Nếu site bật CSP với nonce, thẻ `<link>` và `<script type="importmap">` cần `nonce` như hướng dẫn trong
[csp.md](../guides/csp.md). Mỗi mục trong import map phải trỏ đúng file theo bảng `exports` trong `package.json` của
kit; khi bản mới thêm component mà site muốn dùng, thêm mục tương ứng.

Từ 0.17.0 không cần gõ tay: adapter `php/td.php` sinh `<link>` và import map từ `package.json` của thư mục đã vendor
(`td_stylesheet_tag($nonce)`, `td_import_map_tag($extra, $nonce)`) — đổi `TD_VERSION` là mọi URL đổi theo, component mới
tự có trong map. Xem [Adapter PHP](../guides/php-adapter.md#css-và-import-map).

### WordPress: truyền version khi enqueue

WordPress tự thêm `?ver=` vào URL. Với `td.css` như vậy là đủ (CSS không import file khác của kit); với module vẫn
nên dùng thư mục có số phiên bản như trên.

```php
<?php
$td_ver  = '0.17.0';
$td_base = get_stylesheet_directory_uri() . '/vendor/td-components-' . $td_ver;

wp_enqueue_style( 'td-components', $td_base . '/td.css', array(), $td_ver );
```

### Markup render phía server

Đường SSR chính thức từ 0.17.0 là **adapter PHP của kit** (`php/td.php`: `td_button`, `td_link`, `td_field`,
`td_dropdown`, `td_toggle`, `td_checkbox`, `td_icon` — xem [Adapter PHP](../guides/php-adapter.md)). Adapter nằm trong
chính thư mục kit đã vendor, nên nâng cấp kit là nâng cấp luôn markup — không phải tự đồng bộ. Nếu site còn adapter
riêng (ví dụ `src/Ui/markup.php` cũ của 135), chuyển sang adapter của kit theo
[Chuyển từ adapter riêng của 135](../guides/php-adapter.md#chuyển-từ-adapter-riêng-của-135).

Với component không có helper PHP (menu, table, tabs, pagination, empty-state, trigger lightbox, hovercard…), markup
chuẩn được ghi **ngay trong trang tài liệu** của component đó (mục markup / SSR); khi nâng cấp, so markup site in ra
với trang đó của bản mới và đọc [breaking-changes.md](breaking-changes.md). Các file `test/contracts/*.html` trong repo
kit chỉ là **fixture test** (không nằm trong gói npm, icon trong đó viết tắt) — xem diff của chúng giữa hai tag để biết
markup có đổi hay không, nhưng đừng copy nguyên văn.

## Ghim phiên bản và rollback

### Luôn ghim theo tag

```json
"@dazzxq/td-components": "github:dazzxq/td-components#v0.17.0"
```

Không dùng `github:dazzxq/td-components` trần (không có `#tag`): npm sẽ lấy commit mới nhất của nhánh mặc định lúc
cài, mỗi máy có thể ra một bản khác nhau, và bản đó có thể là code chưa phát hành.

### Rollback

Site dùng npm:

```bash
npm install github:dazzxq/td-components#v0.16.0
```

rồi hoàn tác các sửa đổi CSS/JS bạn đã làm cho bản mới (vì vậy nên nâng cấp trên nhánh riêng — rollback chỉ là
`git revert` commit nâng cấp hoặc bỏ nhánh).

Site PHP / WordPress: đổi lại hằng số phiên bản (`TD_VERSION = '0.16.0'`) — thư mục bản cũ vẫn còn trên server.

Lưu ý khi rollback qua bản có đổi class (0.7–0.10) hoặc đổi dependency (0.11): CSS và code của site đã sửa cho bản
mới sẽ không khớp bản cũ. Rollback phải đi cùng việc hoàn tác những sửa đổi đó.

## Checklist sau khi nâng cấp

- [ ] Đã đọc CHANGELOG và [breaking-changes.md](breaking-changes.md) cho mọi bản nằm giữa.
- [ ] `package.json` ghim đúng tag mới; `package-lock.json` đã cập nhật và được commit.
- [ ] Phiên bản trong `node_modules` (hoặc thư mục vendor) đúng bản mới.
- [ ] `td.css` được tải (từ 0.7.0 component không có `td.css` sẽ mất hết giao diện) và chỉ tải **một** lần.
- [ ] Site PHP / WordPress: đường dẫn `td.css` + import map trỏ vào thư mục bản mới; trình duyệt không còn dùng file
      cũ (kiểm tra tab Network, tắt cache khi thử).
- [ ] Selector CSS tự viết đã đổi theo [class-map.md](class-map.md); không còn selector tới class cũ.
- [ ] Token `--td-*` site ghi đè vẫn tồn tại trong `td.css` mới (lệnh `comm` ở bước 6).
- [ ] Test tự động của site xanh.
- [ ] Form: gửi thử, lỗi validation hiển thị, reset, `<fieldset disabled>` (xem [forms.md](../guides/forms.md)).
- [ ] Lớp nổi: mở modal, dropdown / menu bên trong modal, toast khi modal đang mở, tooltip, lightbox; Escape và Tab
      hoạt động đúng.
- [ ] Bàn phím: Tab qua form, mũi tên trong tabs / dropdown / menu.
- [ ] Console không có lỗi và không có vi phạm CSP.
- [ ] Nhìn bằng mắt các trang chính ở màn hình rộng và điện thoại; chế độ tối / tắt glass nếu site dùng.

## Khi thấy giao diện khác lạ

Phần lớn "sau khi nâng cấp nhìn lạ" rơi vào một trong các trường hợp dưới đây.

| Triệu chứng | Bản gây ra | Nguyên nhân | Cách xử lý |
|---|---|---|---|
| Component mất hết style, chỉ còn chữ trần | 0.7.0 – 0.10.0 | Component đã chuyển sang `td.css`, site chưa tải `td.css` | Tải `td.css` (xem [installation.md](../getting-started/installation.md)) |
| CSS tự viết cho phần bên trong component không còn tác dụng | 0.7.0 – 0.10.0 | Class nội bộ đổi tên sang BEM | Đổi selector theo [class-map.md](class-map.md) |
| Nút / modal / tooltip đặc, popup mờ nhẹ, hết hiệu ứng kính | 0.20.0 | Minimal surfaces thay Liquid Glass | Popup đặc hẳn: `--td-glass-bg-strong: var(--td-glass-solid)`; tắt blur toàn site: `<html data-td-glass="off">`; xem [theming.md](../customization/theming.md) |
| Checkbox tròn | 0.14.0 | `--td-checkbox-radius: 50%` mặc định | `:root { --td-checkbox-radius: 6px; }` |
| Toast nền pastel theo loại, không icon, không nút X hiển thị | 0.21.0 | Toast kiểu dcms (0.20.0 từng là nền trung tính + icon) | Chỉnh `--td-toast-{type}-bg` / `-fg` / `-border`; xem [toast.md](../components/toast.md) |
| Nút primary đen thay vì màu accent | 0.21.0 | Primary mặc định `#18181b` (dark: đảo sáng) | Map về accent: `--td-btn-primary-bg` / `-fg` / `-hover` (xem [breaking-changes.md](breaking-changes.md#0210)) |
| Tooltip hiện khi chạm trên điện thoại, có mũi tên, ẩn khi cuộn | 0.14.0 | Tooltip theo hành vi dwp | Hành vi có chủ đích; xem [tooltip.md](../components/tooltip.md) |
| Viền ô nhập, dropdown, checkbox, toggle nhạt hơn | 0.14.1, 0.14.2 | Viền lúc nghỉ và lúc hover dùng tông mềm | Cần tương phản 3:1 lúc nghỉ: xem mục 0.14.1 trong [breaking-changes.md](breaking-changes.md#0141) |
| Nút secondary trắng có viền (trước là xám đặc) | 0.14.3 | Sửa lỗi specificity + thiết kế mới | Muốn nền xám lại: `:root { --td-btn-secondary-glass: #f0f0f2; }` |
| Nút disabled xám nhạt hơn, chữ mờ | 0.14.3 | Disabled được thiết kế "trông như bị tắt" | Token `--td-btn-disabled-bg / -fg / -border` |
| Dải chọn giờ/phút trong datetime-picker có viền đủ 4 phía | 0.14.4 | Sửa viền bị cắt ở hai đầu | `--td-dtp-band-border` |
| Header cố định của site đè lên modal / toast | 0.9.0 | z-index lấy từ token (modal 400, toast 500) | Ghi đè cả bộ `--td-z-*`, xem mục 0.9.0 trong [breaking-changes.md](breaking-changes.md#090) |
| Con trỏ đổi thành kính lúp trên ảnh có lightbox | 0.15.0 | Con trỏ trigger giống dwp | Ghi đè `cursor` trong CSS của site (CSS không layer thắng `td.css`) |

Nếu vẫn chưa rõ:

1. Mở DevTools → Elements, chọn phần tử lạ, xem tab Styles: quy tắc nào thắng, đến từ `td.css` (trong
   `@layer td.*`) hay từ CSS của site. CSS không nằm trong layer của site luôn thắng `td.css`, nên một quy tắc cũ
   của site có thể đang phá giao diện mới (xem [styling.md](../customization/styling.md)).
2. Thử tạm `<html data-td-glass="off">`: nếu hết lạ thì vấn đề nằm ở lớp kính / nền phía sau.
3. So với `demo.html` / Storybook của đúng tag. Giống demo → đó là thiết kế mới, xem mục của bản đó trong
   [breaking-changes.md](breaking-changes.md). Khác demo → CSS của site đang can thiệp.
4. Ghi lại bản cũ → bản mới, trình duyệt, ảnh chụp, và phần tử bị lạ, rồi mở issue trên repo
   `dazzxq/td-components` (hoặc báo trực tiếp cho người bảo trì kit). Trong lúc chờ, rollback theo mục
   [Ghim phiên bản và rollback](#ghim-phiên-bản-và-rollback).

## Xem thêm

- [breaking-changes.md](breaking-changes.md) — từng bản 0.4 → 0.17: cái gì đổi, site phải sửa gì.
- [class-map.md](class-map.md) — class legacy → class BEM hiện tại.
- [CHANGELOG.md](../../CHANGELOG.md) — nguồn sự thật cho mọi thay đổi.
- [theming.md](../customization/theming.md) — token `--td-*`, glass, dark theme.
- [styling.md](../customization/styling.md) — `@layer`, cách override CSS an toàn.
- [installation.md](../getting-started/installation.md) — cài lần đầu cho Vite, PHP, WordPress.
