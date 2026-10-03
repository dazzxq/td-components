# Security

## 1. XSS: sanitize theo ngữ cảnh

Component render bằng `innerHTML`, nên mỗi giá trị phải đi qua sanitizer đúng với **ngữ cảnh** nó rơi vào.

| Ngữ cảnh | Ở đâu | Helper / luật |
|---|---|---|
| **Text HTML** | label, message, title, label option, giá trị ô bảng | `escapeHtml()` |
| **Attribute HTML** (có ngoặc kép) | `value=""`, `placeholder=""`, `data-*`, class icon, `field-id` | `escapeHtml()` (escape `& < > " '`, đủ cho attribute có ngoặc) |
| **Giá trị CSS** | `color` / `track-color` / `active-color` / `text-color` | `safeColor()`: chỉ nhận hex / tên màu / `rgb()` / `hsl()`, còn lại về mặc định. Chặn `color="red;}…"` và thoát khỏi attribute |
| **Kích thước CSS** | `width/minWidth/maxWidth` của cột bảng | `safeCssDimension()`: số + đơn vị |
| **Class name** | size / type / variant / `align` | whitelist |
| **Số** | `rows`, `max-length`, `min/max/step`, số trang | `Number()` / `clampNumber()`, không dùng chuỗi thô |

Sanitizer: `src/utils/escape.js`, `src/utils/css-safe.js`. `TdBaseElement` có `this.escapeHtml()` và `this.safeColor()`.
CSSOM (`el.style.setProperty(prop, value)`) parse `value` như **một** giá trị CSS, nên `;`/`}` không thể chèn thêm
khai báo. Đây là lớp phòng thủ thứ hai, không thay cho `safeColor`.

Mặc định mọi chuỗi đều được escape; raw HTML chỉ có khi opt-in tường minh.

## 2. Raw-HTML hatch (trusted, trách nhiệm của dev)

Không bao giờ đưa input của người dùng cuối qua các đường này:

- `TdModal.show({ body })`: `body` dạng chuỗi là HTML thô (ưu tiên truyền Node). `confirm/success/error/info`: `message` là text; `messageHtml` là HTML tin cậy (0.9.0).
- `td-table` column `render(row, rowIdxInPage)`: trả về **Node** (khuyên dùng) hoặc chuỗi HTML thô (trusted, chỉ markup của dev — không bao giờ nhúng dữ liệu hàng chưa escape). Ô không có `render` hiển thị giá trị dạng text.
- `td-empty-state` `icon`: ~~chuỗi `<svg` chèn nguyên văn~~ — **đã đóng (0.8.0)**: chuỗi SVG (deprecated) chỉ được render sau khi qua allowlist hình học dùng chung (`svgStringToDefinition`, parse `image/svg+xml`, dựng lại bằng `createElementNS`; `script`/`foreignObject`/`use`/`on*`/`style`/`url()` → từ chối, về `inbox`). Hatch được hỗ trợ: property `iconNode` (SVGElement tin cậy).

- `TdMenu` item `iconNode`: `SVGElement` tin cậy (được clone); `href`: https, http chỉ khi trang là http (không hạ cấp từ HTTPS), link tương đối xét theo protocol sau resolve. `TdFormValidation`: rule tự viết mà throw → field không hợp lệ (fail closed). Nhãn/hint của menu, chip, gợi ý và thông báo của
  `TdFormValidation` luôn là text; `renderOption`/`renderChip` chỉ nhận Node hoặc text (0.12.0 — không có hatch HTML mới).

- `TdHovercard` (0.14.0): chuỗi trả về từ `content()` và mọi fragment tải từ URL được render bằng `innerHTML` — CHỈ markup của
  dev hoặc fragment cùng origin do server đã escape, không bao giờ input thô của người dùng. Ưu tiên Node hoặc `<template>`
  (được clone). URL phải là http(s) cùng origin với trang (khác → từ chối + warn); fetch dùng `mode:'same-origin'`,
  `credentials:'same-origin'`; chỉ nhận JSON `{html}` hoặc `text/html`; chỉ cache kết quả thành công (LRU 50 mục, bỏ
  `#fragment` khỏi khoá cache, body > 256 KB hoặc > 10 s → lỗi, một request một lúc, huỷ khi card đóng/đổi;
  `TdHovercard.clearCache()`). Nếu fragment có thể chứa nội dung do người dùng tạo (profile, bio…), site PHẢI gắn
  `TdHovercard.sanitize = (html) => DOMPurify.sanitize(html)` (hoặc Sanitizer API / policy Trusted Types); hook nhận
  mọi chuỗi trước khi vào `innerHTML`, giá trị `TrustedHTML` được nhận nguyên.
  Site bật Trusted Types (`require-trusted-types-for 'script'`): chuỗi thường sẽ thất bại an toàn (hiện trạng thái lỗi) —
  hãy trả `TrustedHTML` từ hook, vd. `DOMPurify.sanitize(h, { RETURN_TRUSTED_TYPE: true })`; spinner dựng bằng DOM API.
  Cache fragment có kèm cookie: fetch dùng `cache:'no-store'` (bỏ qua HTTP cache của trình duyệt — LRU của component là
  lớp cache duy nhất); response `Cache-Control: no-store` không bao giờ được cache; tắt cache theo trigger bằng
  `cache: false` / `data-td-hovercard-cache="false"`; **bắt buộc** gọi `TdHovercard.clearCache()` (đồng thời đóng card)
  khi logout / login / đổi tenant hoặc quyền trong SPA — nếu không, user sau có thể thấy fragment của user trước. Nhãn, tên truy cập,
  trạng thái luôn là text.

Dưới CSP strict, nội dung đi qua các hatch này cũng phải "sạch CSP" (không `style="…"`, không `<style>`), vì lib
không bảo đảm được phần đó.

Component mới phải tránh thêm hatch. Nếu cần (vd. `panel(ctx)` của lightbox), nhận **Element** chứ không nhận chuỗi
HTML ([ADR 0009](decisions/0009-td-lightbox-hooks.md)).

## 3. CSP

**Cam kết (từ v0.3.0):** output do lib tự sinh chạy dưới `Content-Security-Policy: default-src 'self'` **không** có
`style-src 'unsafe-inline'`: không `style="…"` khai báo, không chèn `<style>`.

Kết quả đo thực nghiệm (Playwright + header CSP thật, 2026-06-10):

| Cách style | Dưới CSP strict |
|---|---|
| `style="…"` khai báo (kể cả qua `innerHTML`) | **Bị chặn** |
| Chèn `<style>` bằng JS | **Bị chặn** (`.sheet === null`) |
| CSSOM: `el.style.x = …`, `setProperty`, `cssText` | Cho phép |
| `new CSSStyleSheet()` + `adoptedStyleSheets` (kể cả `@keyframes`) | Cho phép |

Đo thêm ở dwp (commit `34d3fa9a`): `style-src-attr 'none'` chặn attribute `style` nhưng **vẫn cho phép** ghi CSSOM `el.style`.

**Kiểm chứng:** `npm run test:csp` chạy mọi component × mọi state dưới header strict: 0 violation, parity computed
style với baseline, animation của spinner thực sự chạy. Danh mục construct đã gỡ: [test/csp/INVENTORY.md](../../test/csp/INVENTORY.md).

**Giới hạn hiện tại:**
- Không còn phụ thuộc `adoptedStyleSheets`: mọi style nằm trong `td.css` (file ship kèm), giá trị per-instance đi qua
  CSSOM (`el.style.setProperty`). `adopt-styles.js` đã xoá ở 0.10.0. (Lịch sử: 0.3–0.9 component legacy dùng
  constructable sheet; bảng §3 giữ kết quả đo.)
- **CSP nonce-only (v0.5.0, đo 2026-09-27)** — `default-src 'self'; style-src 'nonce-…'; style-src-attr 'none'`:
  `td.css` qua `<link nonce>` chạy với 0 violation trên Chromium, Firefox 151 và WebKit (Safari 26.4); ghi CSSOM
  `el.style.setProperty` được áp dụng trên cả ba engine. Gate: `npm run test:tokens` (probe `adoptedStyleSheets` vẫn chạy
  nhưng chỉ để ghi nhận, không component nào cần nó).

## 4. Checklist khi viết component

- [ ] Mọi giá trị vào template đã qua helper đúng ngữ cảnh (bảng §1).
- [ ] Không `style="…"`, không `<style>`, không `@keyframes` chèn bằng JS.
- [ ] Style per-instance qua CSSOM; màu từ attribute qua `safeColor`.
- [ ] Selector id/attribute ghép từ dữ liệu phải qua `CSS.escape()`.
- [ ] Icon là SVG tĩnh trong source hoặc tạo bằng DOM API, không `innerHTML` từ dữ liệu ngoài.
- [ ] URL từ dữ liệu ngoài qua whitelist scheme (menu/lightbox mặc định: `https:`; `http:` chỉ khi chính trang là
  `http:`; hovercard: chỉ http(s) cùng origin).
- [ ] Có test XSS trong `*.browser-test.js` và state mới trong CSP matrix.

## 5. Media picker / media field

v0.32.0, ranh giới ở [ADR 0013](decisions/0013-media-picker-boundary.md). Mô hình đe doạ: dữ liệu adapter (tên file,
metadata, nhãn facet / descriptor, chữ lỗi) do **người dùng khác** tạo ra (tên file upload, alt, tag) → coi là không
tin cậy; adapter và descriptor do dev của site viết nhưng chạy trong trình duyệt → không phải lớp phân quyền.

- **URL — một cổng duy nhất `safeMediaUrl`** (`src/utils/media-url.js`): mọi `src` của picker và field (thumbnail,
  preview, poster, `preview-src`) resolve theo `document.baseURI` rồi chỉ nhận `https:`, `http:`
  khi chính trang là `http:` (không hạ cấp), `blob:` chỉ khi gọi với `allowBlob` (preview cục bộ); từ chối
  `javascript:`, `data:`, `file:`, `mailto:`, mọi scheme khác, chuỗi > 8 KiB → không có `<img>`. PHP `td_media_field()`:
  `Td::safeUrl()` rồi loại thêm `mailto:` / `tel:`. URL **không bao giờ** là danh tính hay giá trị form (danh tính =
  `assetId`).
- **Chỉ render text**: mọi chuỗi từ adapter / descriptor / `messages` / nhãn (tên, badge, facet, option, `label`,
  `helpText`, `userMessage`, `fieldErrors`, `preview-alt`, `prompt`) gán bằng `textContent` / escape. Không descriptor,
  message hay hook nào nhận HTML — picker **không thêm hatch** nào vào §2. Không `style="…"`, không `<style>`, không
  handler inline; DOM dựng bằng DOM API. Hộp xác nhận "bỏ thay đổi" truyền Node (không chuỗi HTML) cho `TdModal.show`.
- **Capability không phải quyền**: cờ `capabilities` (top-level và per-asset, per-asset chỉ thu hẹp) chỉ ẩn / hiện nút.
  Server phải kiểm quyền cho **mọi** request mà adapter gửi (list theo scope, get, upload, update, delete, download).
- **Upload**: `accept` / `maxSize` của dropzone chỉ là UX. Server phải kiểm magic byte (không tin `Content-Type` /
  đuôi file), re-encode ảnh (bỏ metadata / payload lạ), giới hạn dung lượng và kích thước điểm ảnh, đặt tên lưu trữ do
  server sinh, dedup bằng hash; không phục vụ file upload từ cùng origin với quyền chạy script.
- **Lỗi**: UI chỉ hiện `userMessage` (cắt 200 code point) hoặc nhãn `labels.error.{code}`; **không bao giờ**
  `err.message` (exception thô, SQL, đường dẫn lưu trữ). `fieldErrors` chỉ nhận own key chuỗi (bỏ `__proto__` /
  `constructor` / `prototype`), giá trị mảng chuỗi (≤ 5 / key, mỗi chuỗi ≤ 200). Console chỉ nhận chuỗi `<thao tác> failed (<code>)` — không bao giờ lỗi gốc / response / URL (có thể mang token). Lỗi
  upload chuyển cho dropzone dưới dạng `new Error(userMessage || labels.uploadError)` để dropzone (vốn hiện
  `err.message`) không lộ chuỗi thô. Event `operation-error` không mang chữ lỗi.
- **FormData của field** (API công khai): `name=<assetId>` hoặc `name[id]` / `name[alt]` / `name[crop]` (crop JSON v1 đã
  validate: số hữu hạn, 0..1, `x + width ≤ 1`, `y + height ≤ 1`, ≤ 512 ký tự; sai → `null`). Usage + `name` kết thúc `[]`
  → không gửi (fail closed, JS = PHP). Server vẫn phải kiểm `assetId` (tồn tại, đúng loại, quyền dùng), cắt alt, validate
  lại crop. State khôi phục form chỉ gồm `{"v":1,"id","alt","crop"}` — không URL xem trước (URL ký), không nhãn server;
  khôi phục → ảnh lấy lại bằng `adapter.get(id)` theo phiên hiện tại.
- **Giới hạn payload adapter** (`LIMITS`): ≤ min(limit, 100) mục / trang, chuỗi hiển thị ≤ 500 code point, ≤ 10 badge,
  ≤ 20 facet, ≤ 200 option, ≤ 50 field descriptor; phần thừa bỏ + một cảnh báo chỉ có số lượng.
- **Referrer**: mọi `<img>` có `referrerpolicy="no-referrer"` cố định — URL ký và đường dẫn trang quản trị không lộ qua
  `Referer` tới CDN / bucket. Hệ quả cho site: CDN chống hotlink phải chấp nhận referer rỗng; CSP `img-src` phải cho
  origin ảnh của adapter (`blob:` chỉ khi muốn thumbnail xem trước của dropzone).
- **Request**: mọi lời gọi adapter nhận `AbortSignal`; kết quả của request cũ bị bỏ kể cả khi adapter phớt lờ signal
  (không có trạng thái "kết quả cũ thắng" hiện dữ liệu sai ngữ cảnh). Trang list không bao giờ lấy từ cache; chỉ
  facet + asset theo id được giữ trong một lần mở (xoá khi đóng), không
  localStorage (không lưu dữ liệu media của người dùng trước cho người dùng sau trên máy chung).
- **Không toàn cục**: không biến trên `window`; `configureDefaults` là registry cấp module.

Test: phần XSS / an toàn của `td-media-picker.engines.browser-test.js` (chuỗi `<img src=x onerror=…>` ở mọi trường chỉ là
text, URL `javascript:` / `data:` / `file:` không thành `src`, không thuộc tính `style` / `on*`), `media-url.test.js`,
`media-picker-core.test.js` (`normalizeError`), test SSR PHP (`preview_src` độc → không `img`, `attrs` allowlist).
