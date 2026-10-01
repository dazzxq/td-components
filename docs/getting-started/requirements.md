[Tài liệu](../README.md) › Bắt đầu › Yêu cầu hệ thống

# Yêu cầu hệ thống

Trang này trả lời ba câu hỏi trước khi cài: trình duyệt nào chạy được, máy bạn cần công cụ gì, và site của bạn **không**
cần gì. Đọc xong trang này rồi sang [Cài đặt](installation.md).

Tóm tắt nhanh:

- Trình duyệt: bản hiện hành của Chrome/Edge, Firefox, Safari (desktop và iOS). Tối thiểu để chạy đúng chức năng:
  **Chrome/Edge 102+, Firefox 112+, Safari 16.4+** (chi tiết ở dưới).
- Node.js + npm: chỉ cần để **tải** kit (`npm install`) và để phát triển; trang web chạy thật không cần Node.
- Không cần framework, không cần Tailwind, không cần build step phía site PHP.
- **Bắt buộc** phục vụ file qua `http://` hoặc `https://`. Mở file HTML bằng `file://` sẽ không chạy.
- Chạy được dưới CSP nghiêm ngặt (không cần `'unsafe-inline'` cho style).

## Trình duyệt được hỗ trợ

td-components là Web Components thuần (Custom Elements v1, không Shadow DOM) cộng một file CSS (`td.css`). Kit không
có polyfill và không có bản build cho trình duyệt cũ: nó dựa trực tiếp vào tính năng có sẵn của trình duyệt. Vì vậy
"hỗ trợ trình duyệt nào" được suy ra từ tính năng mà code đang dùng.

### Được kiểm thử tự động

Kit **chỉ được kiểm thử trên bản engine hiện hành** (Playwright `playwright-core` 1.60, xem `package.json`):

| Bộ kiểm thử | Engine | Kiểm gì |
|---|---|---|
| `npm run test:browser` | Chromium | Hành vi từng component trong trình duyệt thật |
| `npm run test:csp` / `test:csp:combined` | Chromium | Mọi component × mọi trạng thái dưới CSP strict: 0 vi phạm, style khớp baseline |
| `npm run test:tokens` | Chromium, Firefox, WebKit | `td.css` dưới hai hồ sơ CSP (`'self'` và nonce-only), glass fallback, dark theme, reduced motion, forced colors |
| `npm run test:contrast` | Chromium, Firefox, WebKit | Tương phản thật (đo pixel) của button và toast trên nền đen, trắng, caro, ảnh |
| `npm run test:engines` | Chromium, Firefox, WebKit | Tab / Shift+Tab của `TdMenu` (hành vi phụ thuộc engine) |

Nghĩa là: bản mới nhất của Chrome/Edge, Firefox và Safari là mục tiêu chính. Các phiên bản cũ hơn trong bảng dưới
đây là **suy ra từ tính năng**, không phải đã chạy thử từng bản.

### Tính năng bắt buộc (thiếu là hỏng chức năng)

| Tính năng | Dùng để | Chrome/Edge | Firefox | Safari / iOS |
|---|---|---|---|---|
| ES modules (`<script type="module">`) | Nạp source của kit | 61 | 60 | 11 |
| Custom Elements v1 | Mọi thẻ `td-*` | 67 | 63 | 10.1 |
| `ElementInternals` + form-associated custom elements | Control nằm trong `<form>`, `FormData`, `required`, reset | 77 | 98 | **16.4** |
| `@layer` | Toàn bộ `td.css` nằm trong `@layer td.*`; trình duyệt không hiểu `@layer` sẽ bỏ qua hết style | 99 | 97 | 15.4 |
| Thuộc tính `inert` | Modal / lightbox / loading khoá phần trang bên dưới | **102** | **112** | 15.5 |
| Class fields tĩnh, `Object.hasOwn`, optional chaining | Cú pháp JS trong source (không transpile) | 93 | 92 | 15.4 |

Từ bảng trên, mức tối thiểu thực tế là **Chrome/Edge 102, Firefox 112, Safari 16.4 (iOS 16.4)**. Internet Explorer và
Edge Legacy (trước Chromium) không chạy.

> Nếu phải chạy trên Safari < 16.4, phần form-associated sẽ thiếu. README cũ gợi ý nạp polyfill
> `element-internals-polyfill` trước khi import component; cách này **không** nằm trong bộ kiểm thử của kit, hãy tự thử
> kỹ trước khi dựa vào nó.

### Tính năng nâng cao (thiếu thì xuống cấp nhẹ, không hỏng)

Những tính năng dưới đây chỉ làm đẹp hoặc tinh chỉnh. Trình duyệt không hỗ trợ sẽ bỏ qua rule đó, component vẫn dùng
được.

| Tính năng | Dùng ở đâu | Khi trình duyệt không hỗ trợ |
|---|---|---|
| `backdrop-filter` (có kèm `-webkit-backdrop-filter`) | Blur 12px của popup nhỏ (menu, dropdown, hovercard, toast) và thanh lightbox | Khối `@supports not (backdrop-filter…)` tự chuyển sang nền đặc `--td-glass-solid` |
| `:has()` (Firefox từ 121) | Vài trạng thái phụ: checkbox/switch/slider bị disabled, focus của chip-input, button `full-width` | Mất một số hiệu ứng trạng thái; control bên trong vẫn disabled/focus đúng |
| `color-mix()` | Sắc độ pha màu: nền hover của nút (đậm 8 %), chữ hover của nút ghost, nền primary ở dark (bọc trong `@supports` → giữ nền / màu dự phòng); **không** bọc: nền/viền khung tóm tắt lỗi của TdFormValidation | Chỗ có `@supports`: nền / màu dự phòng (hover nút không đổi nền). Chỗ không bọc: token thành giá trị không hợp lệ → thuộc tính dùng nó rơi về giá trị mặc định của CSS, nên khung tóm tắt lỗi mất màu tô dự kiến (chữ + icon vẫn hiện) |
| `@starting-style` (Chrome 117, Firefox 129, Safari 17.5) | Hiệu ứng fade khi xuất hiện của menu dropdown, `TdMenu`, gợi ý chip-input, hovercard | Phần tử hiện ra ngay, không có animation vào |
| Đơn vị `dvh` | Chiều cao tối đa modal, lightbox, bottom sheet trên mobile | Kích thước có thể lệch khi thanh địa chỉ mobile co giãn |
| Đơn vị `lh` | Chiều cao `td-input-field type="textarea" autoresize` | Chiều cao tối thiểu/tối đa tính sai |
| `field-sizing: content` (Chromium 123+) | `autoresize` của textarea | Textarea giữ cố định theo `rows` và cuộn bên trong (vẫn kéo tay được) |
| `prefers-reduced-transparency` (hiện chỉ Chromium) | Tự bỏ blur (nền đặc) khi người dùng bật "giảm trong suốt" | Safari/Firefox không báo được, site tự tắt bằng `<html data-td-glass="off">` |
| `prefers-contrast: more`, `forced-colors: active` | Bề mặt chuyển nền đặc, viền rõ, bỏ bóng; màu hệ thống ở chế độ tương phản cao | Không áp dụng |
| `prefers-reduced-motion` | Tắt/giảm animation | Không áp dụng |

Kính khúc xạ (refraction) không được ship, nên không có tính năng Chromium-only nào là bắt buộc.

## Công cụ trên máy

| Công cụ | Khi nào cần | Ghi chú |
|---|---|---|
| Node.js + npm | Tải kit: `npm install github:dazzxq/td-components` | `package.json#engines`: Node **≥ 20** (từ 0.16.0). CI của repo chạy Node 22 |
| Git | npm cần git để cài từ GitHub | Cài từ `github:` là npm tự `git clone` |
| Vite (hoặc bundler khác hiểu `package.json#exports`) | Chỉ khi site của bạn dùng bundler | Kit không bắt buộc bundler |
| Một web server bất kỳ | Luôn luôn | Apache/nginx của site PHP, `php -S`, `npx vite`… |

Site PHP thuần (135) và WordPress (dwp) **không cần Node trên server production**: bạn chỉ cần copy thư mục kit (đã
tải bằng npm trên máy dev) vào thư mục public. Xem [Cài đặt](installation.md#3-php-thuần--html-không-bundler).

Muốn chạy bộ test của chính kit (người bảo trì) thì cần thêm devDependencies và trình duyệt Playwright
(`npx playwright-core install chromium firefox webkit`); site dùng kit không cần những thứ này.

## Những gì bạn KHÔNG cần

- **Không cần framework.** Không React, Vue, Lit. Component là thẻ HTML chuẩn, dùng được trong HTML tĩnh, PHP,
  WordPress, hoặc bên trong framework bất kỳ.
- **Không cần Tailwind** (từ 0.11.0). Mọi component chỉ cần `td.css`. Site nào đang dùng Tailwind vẫn giữ được: `td.css`
  nằm trong `@layer td.*`, không reset CSS toàn cục, và mỗi component tự đặt font, line-height, box-sizing, border, nên
  preflight của Tailwind không làm hỏng nó (được kiểm bằng hồ sơ `legacy+td` của `npm run test:csp:combined`).
- **Không cần build step ở phía site PHP.** Kit ship **source** ES module, không có file bundle. Site PHP chỉ cần
  `<link rel="stylesheet">` tới `td.css` và `<script type="module">` tới file JS.
- **Không cần cấu hình.** Không có file config, không có hàm `init()` toàn cục. Import component nào thì component đó
  tự đăng ký thẻ của nó.
- **Không có biến global.** Kit không gắn gì vào `window` (khác DCMS cũ). Bạn import class khi cần, ví dụ
  `import { TdToast } from '@dazzxq/td-components/toast'`.
- **Không cần font hay ảnh riêng.** `td.css` không có `url()` nào; font dùng font hệ thống (`--td-font-sans`), icon là
  SVG dựng sẵn trong JS.
- **Không cần Shadow DOM polyfill.** Kit không dùng Shadow DOM.

## Bắt buộc: phục vụ qua HTTP(S), không phải `file://`

Trình duyệt chặn ES module khi trang được mở trực tiếp từ ổ đĩa (`file:///.../index.html`): origin là `null` nên
request module bị chặn theo CORS. Hậu quả là trang trắng, không có component nào hiện, và Console báo lỗi CORS.

Cách chạy thử nhanh trên máy:

```bash
npx vite            # trong thư mục chứa index.html, rồi mở http://localhost:5173/
# hoặc
php -S localhost:8000
```

Server phải trả file `.js` với MIME JavaScript (`text/javascript`). Apache, nginx, Vite, `php -S` đều làm đúng mặc
định.

## Tương thích CSP

Kit được thiết kế cho **Content-Security-Policy nghiêm ngặt**. Output của kit không bao giờ có `style="…"` và không
chèn thẻ `<style>`; giá trị riêng từng phần tử (màu tuỳ biến, vị trí menu…) được ghi qua CSSOM
(`el.style.setProperty`), là cách CSP cho phép.

Hai hồ sơ CSP được kiểm thử tự động trên cả Chromium, Firefox và WebKit (`npm run test:tokens`):

| Hồ sơ | Header | Điều kiện phía site |
|---|---|---|
| `'self'` | `default-src 'self'; style-src 'self'; script-src 'self'` | `td.css` và file JS phục vụ cùng origin |
| nonce-only | `default-src 'self'; style-src 'nonce-…'; style-src-attr 'none'; script-src 'self'` | Thẻ `<link rel="stylesheet">` của `td.css` mang `nonce="…"` |

Điểm cần nhớ:

- **Không cần** `style-src 'unsafe-inline'`.
- `style-src-attr 'none'` vẫn chạy: CSP này chặn attribute `style="…"` nhưng không chặn ghi CSSOM.
- Script module là file ngoài cùng origin nên `script-src 'self'` là đủ. Nếu bạn dùng `<script type="module">` **inline**
  hoặc `<script type="importmap">` (luôn là inline), thẻ đó cần `nonce` hoặc hash trong `script-src`.
- Nội dung **bạn** đưa vào qua các "cửa HTML tin cậy" (ví dụ `body` dạng chuỗi của `TdModal.show`) cũng phải sạch CSP,
  vì kit không kiểm soát được phần đó.
- Chế độ dev của Vite chèn CSS bằng thẻ `<style>`; muốn thử CSP thật, hãy thử trên bản build (`vite build` +
  `vite preview`) hoặc nạp `td.css` bằng `<link>`.

Chi tiết cấu hình: [Hướng dẫn CSP](../guides/csp.md).

## Xem thêm

- [Cài đặt](installation.md): npm/GitHub, Vite, PHP thuần, WordPress.
- [Trang đầu tiên trong 5 phút](quick-start.md).
- [Cách kit hoạt động](../concepts/how-it-works.md).
- [Nâng cấp phiên bản](../upgrading/README.md).
