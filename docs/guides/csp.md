[Tài liệu](../README.md) › Hướng dẫn › CSP

# Content Security Policy (CSP)

td-components được thiết kế để chạy dưới CSP **strict**: không cần `'unsafe-inline'` cho style, không cần
`'unsafe-eval'`, không cần CDN. Trang này nói kit đã được test dưới header nào, header nào nên dùng cho site, cách gắn
nonce cho `<link>`/`<script>`, những gì kit **không bao giờ** làm, và cách xử lý khi trình duyệt báo vi phạm.

Nếu bạn mới nghe CSP: đó là header HTTP `Content-Security-Policy` nói cho trình duyệt biết trang được phép nạp script,
style, ảnh… từ đâu. Nó là lớp phòng thủ thứ hai chống XSS: kể cả khi kẻ tấn công chèn được `<script>` hay
`style="…"`, trình duyệt sẽ không chạy/không áp dụng.

## Mục lục

- [Kit được test dưới CSP nào](#kit-được-test-dưới-csp-nào)
- [Header khuyên dùng cho site](#header-khuyên-dùng-cho-site)
- [Gắn nonce cho link, import map và script](#gắn-nonce-cho-link-import-map-và-script)
- [Nguồn ảnh, video và fetch](#nguồn-ảnh-video-và-fetch)
- [Những gì kit không bao giờ làm](#những-gì-kit-không-bao-giờ-làm)
- [Trusted Types](#trusted-types)
- [Xử lý sự cố](#xử-lý-sự-cố)

## Kit được test dưới CSP nào

| Gate | Lệnh | Trình duyệt | Header | Kiểm tra |
|---|---|---|---|---|
| CSP parity | `npm run test:csp` (và `test:csp:combined`) | Chromium | `default-src 'self'; style-src 'self'; script-src 'self'` | mọi component × mọi trạng thái trong ma trận: **0 vi phạm**, computed style khớp baseline, spinner thực sự chạy (và **không** chạy khi reduced motion) |
| Token gate, profile `self` | `npm run test:tokens` | Chromium, Firefox, WebKit | `default-src 'self'; style-src 'self'; script-src 'self'` | 0 vi phạm, token/glass/fallback đúng |
| Token gate, profile `nonce` | `npm run test:tokens` | Chromium, Firefox, WebKit | `default-src 'self'; style-src 'nonce-td'; style-src-attr 'none'; script-src 'self'` (mọi `<link>`/`<script>` mang `nonce="td"`) | 0 vi phạm; ghi CSSOM `el.style.setProperty` vẫn áp dụng |
| Trusted Types (chỉ hovercard) | `npm run test:browser` | engine có Trusted Types | `require-trusted-types-for 'script'` | xem [Trusted Types](#trusted-types) |

Kết quả đo quan trọng nhất (Playwright + header thật):

| Cách style | Dưới CSP strict |
|---|---|
| `style="…"` trong HTML (kể cả chèn qua `innerHTML`) | **bị chặn** |
| Chèn `<style>` bằng JS | **bị chặn** |
| CSSOM: `el.style.setProperty(…)`, `el.style.x = …` | được phép |
| `<link rel="stylesheet">` cùng origin (hoặc có nonce) | được phép |

`style-src-attr 'none'` chặn việc **ghi attribute** `style` nhưng **không** chặn CSSOM `el.style` — đã đo trên cả ba
engine và thực tế ở dwp.

## Header khuyên dùng cho site

### Mẫu A: chỉ file tĩnh cùng origin (đơn giản nhất)

Dùng khi bạn không in script/style inline nào (không import map inline, không `<script>` bootstrap inline):

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self';
  style-src-attr 'none';
  img-src 'self';
  media-src 'self';
  connect-src 'self';
  font-src 'self';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'self'
```

(Header thật nằm trên **một dòng**, các chỉ thị cách nhau bằng `; `.)

### Mẫu B: có nonce (khuyên dùng khi có import map / bootstrap inline)

Import map (`<script type="importmap">`) và `<script type="module">import …</script>` là **script inline** — cần nonce
(hoặc hash). Sinh nonce ngẫu nhiên **mỗi request**:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}';
  script-src-attr 'none';
  style-src 'self' 'nonce-{NONCE}';
  style-src-attr 'none';
  img-src 'self' https://cdn.example.com;
  media-src 'self' https://cdn.example.com;
  connect-src 'self';
  font-src 'self';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'self'
```

Đây cũng là hình dạng CSP mà 135 đang dùng (`src/Core/Csp.php`).

Những thứ **không** cần và **không nên** thêm vì kit:

- `'unsafe-inline'` trong `style-src` — kit không có style inline nào.
- `'unsafe-eval'` — kit không dùng `eval`/`new Function`.
- Host CDN cho script/style — kit ship source, bạn tự host.
- `data:` / `blob:` trong `img-src` — td.css không có `url()`, icon là SVG dựng bằng DOM. (Site có thể cần vì lý do
  khác, ví dụ icon CSS riêng dùng `mask-image: url("data:…")` — `img-src` **có** chi phối `mask-image`.)

Vì sao giữ `'self'` cạnh nonce trong `script-src`: một số chỗ in `<link rel="modulepreload">` **không có nonce** (ví dụ
WordPress in modulepreload cho dependency của script module). `'self'` cho phép các file cùng origin đó.

## Gắn nonce cho link, import map và script

```php
<?php $nonce = csp_nonce(); // chuỗi ngẫu nhiên >= 128 bit, base64, sinh MỘT lần mỗi request ?>
<link rel="stylesheet" href="/vendor/td-components/0.41.0/td.css" nonce="<?= h($nonce) ?>">
<script type="importmap" nonce="<?= h($nonce) ?>">
<?= json_encode(['imports' => [
    '@dazzxq/td-components/button' => '/vendor/td-components/0.41.0/src/form/td-button.js',
    '@dazzxq/td-components/toast'  => '/vendor/td-components/0.41.0/src/feedback/td-toast.js',
]], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>
</script>
<script type="module" nonce="<?= h($nonce) ?>">
  import '@dazzxq/td-components/button';
  import { TdToast } from '@dazzxq/td-components/toast';
</script>
```

Lưu ý:

- Nonce phải **giống nhau** giữa header và thẻ trong cùng một response. Sinh một lần, lưu vào biến tĩnh.
- `<link rel="stylesheet" nonce>` hoạt động với `style-src 'nonce-…'` trên Chromium, Firefox và WebKit (gate `nonce`
  ở trên). Với Mẫu A/B có `'self'`, `<link>` cùng origin không cần nonce.
- **Import map phải đứng trước mọi `<script type="module">`**. Import map in sau module đầu tiên bị bỏ qua hoàn toàn,
  triệu chứng là "Failed to resolve module specifier".
- Giá trị trong import map phải là URL tuyệt đối hoặc bắt đầu bằng `/`, `./`, `../` (`vendor/x.js` bị từ chối).
- Nonce **không** được truyền cho markup chèn bằng `innerHTML` sau này: một `<style nonce>` hay `<script nonce>` lấy
  từ response AJAX sẽ bị chặn (nonce của response khác nonce của trang). Kit không bao giờ làm vậy; code site cũng đừng.
- Đừng cache toàn trang (full-page cache) với nonce cố định — cache làm nonce thành hằng số, mất tác dụng. Nếu dùng
  page cache, dùng Mẫu A (không inline) hoặc hash.

Tên trong import map nên trùng subpath `exports` của `package.json` (`@dazzxq/td-components/button` →
`src/form/td-button.js`) để code chạy giống hệt khi build bằng Vite. Tên subpath **không** theo cấu trúc thư mục, nên
không map được bằng một prefix duy nhất — liệt kê từng mục bạn dùng. Xem [Cài đặt](../getting-started/installation.md)
và [WordPress & PHP](wordpress-php.md#import-map-cho-php-thuần).

## Nguồn ảnh, video và fetch

Kit tự nó chỉ cần `'self'`. Các chỉ thị dưới đây phụ thuộc vào **nội dung** bạn đưa vào:

| Tính năng | Chỉ thị | Ghi chú |
|---|---|---|
| `TdLightbox` ảnh | `img-src` | thêm host CDN ảnh; nên khớp với `isAllowedUrl` (xem [Bảo mật](security.md#lightbox-thu-hẹp-về-allowlist-host-của-bạn)) |
| `TdLightbox` video `<video>` mặc định | `media-src` | host của file video/poster (`poster` thuộc `img-src`) |
| `TdLightbox` hook `video` nhúng YouTube/Vimeo | `frame-src` | ví dụ `https://www.youtube-nocookie.com`; script của player (Plyr…) cần `script-src` tương ứng — tự host thì chỉ cần `'self'` |
| `TdLightbox` nút toàn màn hình | — | Fullscreen API không chịu CSP |
| `TdHovercard` `url` / `data-td-hovercard` | `connect-src 'self'` | hovercard chỉ fetch cùng origin |
| `td-cropper` / bước cắt của media picker / "Cắt ảnh" của media field (0.35) | `img-src` | origin của ảnh cần cắt; **không** cần `connect-src`, `blob:` / `data:` hay CORS — cropper chỉ hiển thị `<img>`, không đọc pixel |
| `td-chip-input` `search()` | `connect-src` | tuỳ endpoint mà provider của bạn gọi |
| Form AJAX | `connect-src`, `form-action` | `form-action 'self'` cho submit native |

## Những gì kit không bao giờ làm

Đây là cam kết từ v0.3.0 (đã chuyển hẳn sang CSS file ở v0.10.0, [ADR 0008](../internal/decisions/0008-drop-tailwind-token-css.md)):

- **Không có attribute `style="…"`** trong markup render ra (kể cả trên SVG — dùng presentation attribute).
- **Không chèn `<style>`**, không `@keyframes` chèn bằng JS, không `adoptedStyleSheets` (đã bỏ từ 0.10.0).
- **Không `setAttribute('style', …)`**. Giá trị per-instance (màu tuỳ chỉnh, vị trí popup, % slider, kích thước modal…)
  đi qua **CSSOM** `el.style.setProperty('--td-…', value)` sau khi lọc (`safeColor`, `safeCssDimension`,
  `CSS.supports`).
- **Không inline event handler** (`onclick="…"`); mọi listener gắn bằng `addEventListener`.
- **Không `eval`, `new Function`, `setTimeout(string)`**.
- **Không nạp gì từ bên ngoài**: không CDN, không font, không ảnh; `td.css` không có `url()`. Mạng chỉ được dùng khi
  **bạn** yêu cầu (hovercard `url`, lightbox `src`, `search()` của chip-input).
- **Không window global**, không side effect khi import (ngoại trừ `customElements.define` của element và tooltip tự
  khởi tạo khi DOM sẵn sàng).

Cái kit **không** bảo đảm: markup bạn đưa qua các cửa HTML thô (`TdModal body` chuỗi, `messageHtml`, `td-table render()`
chuỗi, fragment hovercard). Nếu markup đó có `style="…"` hay `<style>`, trình duyệt sẽ chặn phần đó — dùng class.
Xem [Bảo mật](security.md#các-cửa-html-thô-raw-html-hatch).

## Trusted Types

`require-trusted-types-for 'script'` chặn mọi phép gán chuỗi vào `innerHTML`.

- Kit **chưa hỗ trợ** chế độ enforce cho toàn bộ: element render template bằng `innerHTML` (chuỗi đã escape).
- `TdHovercard` được test riêng dưới Trusted Types: nhận `TrustedHTML` (ví dụ từ
  `DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true })`), chuỗi thường thất bại an toàn (card hiện lỗi).
- Muốn thử nghiệm: dùng `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; report-to …` để
  thu báo cáo mà không làm vỡ trang.

## Xử lý sự cố

Mở DevTools › Console: trình duyệt ghi rõ `Refused to …` kèm chỉ thị bị vi phạm. Để gom vi phạm trong lúc dev:

```js
document.addEventListener('securitypolicyviolation', (e) => {
  console.warn('[CSP]', e.effectiveDirective, e.blockedURI, e.sample);
});
```

| Triệu chứng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| Component hiện ra "trần", không có style | `td.css` bị chặn: `style-src` chỉ có nonce mà `<link>` thiếu `nonce`; hoặc sai đường dẫn (404) | thêm `nonce` cho `<link>` hoặc `'self'` vào `style-src`; kiểm tra tab Network |
| `Refused to apply inline style … style-src-attr` | markup của **site** (hoặc markup qua hatch) có `style="…"`; plugin bên thứ ba | chuyển sang class; với giá trị động dùng `el.style.setProperty` |
| `Refused to execute inline script` | import map / module inline thiếu nonce | thêm `nonce` (Mẫu B) |
| `Failed to resolve module specifier "@dazzxq/…"` | import map thiếu mục, in **sau** module đầu tiên, hoặc bị chặn vì thiếu nonce | in import map sớm trong `<head>`, có nonce, đủ mục |
| `Refused to load the script … modulepreload` | `<link rel="modulepreload">` không nonce, `script-src` không có `'self'` | thêm `'self'` vào `script-src` |
| Lightbox mở rồi không hiện ảnh / không mở | `img-src` chặn host ảnh, hoặc `isAllowedUrl` từ chối (item không hợp lệ bị bỏ; không còn item nào → không mở) | thêm host vào `img-src` và allowlist |
| Hovercard luôn "Không tải được nội dung." | URL khác origin (có `console.warn`), `connect-src` chặn, server trả `Content-Type` sai, > 256 KB / > 10 s | dùng URL cùng origin; trả `text/html` hoặc JSON `{ "html": … }` |
| Video YouTube trắng | thiếu `frame-src` | thêm host player vào `frame-src` |
| Mọi thứ đúng trên dev, vỡ trên production | nonce bị page cache "đóng băng" | tắt page cache cho trang có nonce, hoặc bỏ inline (Mẫu A) |

Triển khai CSP mới cho site đang chạy: bật `Content-Security-Policy-Report-Only` trước vài ngày, xem báo cáo, rồi mới
chuyển sang `Content-Security-Policy`.

## Xem thêm

- [Bảo mật](security.md) — escaping, hatch, URL allowlist
- [WordPress & PHP](wordpress-php.md) — nonce và enqueue trong WordPress, include partial trong PHP thuần
- [Yêu cầu hệ thống](../getting-started/requirements.md) · [Cài đặt](../getting-started/installation.md)
- [Cách hoạt động](../concepts/how-it-works.md) — mô hình CSP của kit
- Tài liệu nội bộ: [ADR 0005](../internal/decisions/0005-csp-strict-cssom-adopted-sheets.md),
  [security-model §3](../internal/security-model.md)
