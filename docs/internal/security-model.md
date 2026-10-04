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

## 5. Bí mật của td-masked-value (v0.31.0)

Hợp đồng (plan [v0.31.0](plans/v0.31.0-sortable-masked.md) quyết định 15–21; trang người dùng
[masked-value.md](../components/masked-value.md#bảo-mật)):

- **Kit không bao giờ thấy giá trị thật ngoài kết quả `reveal()`.** Chuỗi che do server tính; kit không có hàm che (che
  phía trình duyệt = giá trị thật đã ở trình duyệt). PHP `td_masked_value(string $masked, array $o)` không có tham số giá
  trị thật → helper không thể in nó vào HTML (mã nguồn trang, cache, bfcache, extension, log).
- Khi đang hiện, giá trị nằm trong **một** text node (`.td-masked__text`) và **một** field private. **Không bao giờ** vào
  attribute, `aria-*`, `title` / `data-tooltip`, live region (thông báo trung tính, không đọc PII), `detail` của event,
  `console` (kể cả cảnh báo — không log phần tử, vì DOM sống có thể đang chứa giá trị).
- Che lại (hết giờ, bấm lại, `visibilitychange` hidden, `pagehide`, `mask()`, đổi `masked`, `disabled`, disconnect) = ghi
  lại chuỗi che vào text node, xoá field, **gỡ hẳn** `<td-copy>` con (kèm ô copy tay của nó), xoá timer / listener trang.
- Lỗi của hook: `reveal-error` mang `detail` **do kit sinh** (`{ kind: 'rejected' | 'invalid' }`); đối tượng lỗi của app
  không được chuyển tiếp, không được đọc ngoài `name` (để nhận `AbortError`, bọc try), không được log.
- Kết quả về muộn bị bỏ: `AbortController` (signal truyền cho hook) + bộ đếm thế hệ (đúng cả khi app phớt lờ `signal`).
  Khoá in-flight: một lần bấm = một lời gọi (mỗi lời gọi là một lần audit ở app).
- **Không bảo đảm:** xoá bộ nhớ JS (chuỗi bất biến, GC), clipboard sau khi copy, ảnh chụp / quay màn hình, extension đọc
  DOM trong lúc đang hiện. Quyền / 2FA / audit là việc của endpoint.
- Test: `src/display/td-v031-masked-value.engines.browser-test.js` (lỗi có `message` / field chứa giá trị → không lọt vào
  DOM / attribute / live region / event JSON + key đệ quy / console stub), `test/php/td-ssr-masked-value.test.js` (chữ ký
  bằng reflection).

## 6. Media picker / media field

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
  ≤ 20 facet, ≤ 200 option, ≤ 50 field descriptor; phần thừa bỏ + một cảnh báo chỉ có số lượng. Xử lý cũng có giới
  hạn: mỗi danh sách chỉ duyệt tối đa 4 × giới hạn. `metadata` chỉ giữ key của `assetFields`; giá trị vượt
  `VALUE_LIMITS` (text 10 000, textarea 100 000, url 2 048, multiselect 200 mục) → trường bị khoá, không gán, không gửi.
  `readonly` (và mọi control trừ `multiselect`) chỉ nhận scalar (chuỗi ≤ 10 000, số hữu hạn, boolean, null); object /
  mảng → khoá, không bao giờ `JSON.stringify` / duyệt giá trị adapter.
- **Preview lười của field**: đổi adapter / context → huỷ `get` đang chờ trước khi lấy lại; kết quả kiểm thế hệ request +
  thế hệ nguồn + adapter + context (chống TOCTOU khi adapter cũ phớt lờ signal).
- **Referrer**: mọi `<img>` có `referrerpolicy="no-referrer"` cố định — URL ký và đường dẫn trang quản trị không lộ qua
  `Referer` tới CDN / bucket. Hệ quả cho site: CDN chống hotlink phải chấp nhận referer rỗng; CSP `img-src` phải cho
  origin ảnh của adapter (`blob:` chỉ khi muốn thumbnail xem trước của dropzone).
- **Request**: mọi lời gọi adapter nhận `AbortSignal`; kết quả của request cũ bị bỏ kể cả khi adapter phớt lờ signal
  (không có trạng thái "kết quả cũ thắng" hiện dữ liệu sai ngữ cảnh). Trang list không bao giờ lấy từ cache; chỉ
  facet + asset theo id được giữ trong một lần mở (xoá khi đóng), không
  localStorage (không lưu dữ liệu media của người dùng trước cho người dùng sau trên máy chung).
- **Không toàn cục**: không biến trên `window`; `configureDefaults` là registry cấp module.

**Bổ sung v0.33** ([ADR 0013 › Bổ sung v0.33](decisions/0013-media-picker-boundary.md#bổ-sung-v033), plan
[v0.33.0](plans/v0.33.0-media-picker-dcms-parity.md) quyết định 22-27, 31):

- **Tải từ URL (`uploadFromUrl`)**: kiểm URL ở client (`validateRemoteUrl`: trim, ≤ 2048 ký tự, `new URL()` hợp lệ,
  chỉ `http:` / `https:`, không `username` / `password`, có hostname) **chỉ là UX, không phải bảo mật**; giá trị gửi đi là
  `href` đã chuẩn hoá. Client **cố ý không** chặn host nội bộ / IP riêng (DNS rebinding, redirect vượt qua được) và
  **không** xem trước URL người dùng nhập (trình duyệt không request tới host đó; "xem trước" là asset do server trả về,
  qua `safeMediaUrl`). **SSRF là việc của server**: resolve DNS một lần và kết nối đúng IP đã kiểm; chặn loopback / mạng
  riêng / link-local / `169.254.169.254` / IPv6 ULA và mapped / `0.0.0.0`; kiểm lại mỗi redirect (≤ 3); chỉ cổng 80 / 443;
  timeout + trần kích thước khi đọc luồng (không tin `Content-Length`); magic byte + re-encode + cùng giới hạn như upload;
  quyền, CSRF, rate limit, audit; không dội body / lỗi của host từ xa. Lỗi chỉ hiện `userMessage` / nhãn, abort im lặng.
- **Xoá (`delete`)**: **server quyết định**, kit không bao giờ tự kiểm usage — `delete` không kiểm usage + quyền ở server
  là không an toàn. Hộp xác nhận dùng `message` dạng text (không `messageHtml`): tên `<b>x</b>` hiện nguyên văn. Kết quả
  `blocked` được chuẩn hoá (`usageCount` nguyên ≥ 0, `usages` ≤ 50 mục, hiện ≤ 20, `label` ≤ 200, mảng có `__proto__` /
  không phải mảng → lỗi hợp đồng) và render **text-only**; `href` của usage chỉ thành `<a target="_blank"
  rel="noopener noreferrer">` khi qua `safeLinkUrl` (`https:`, `http:` khi trang là `http:`, đường dẫn tương đối), còn lại
  (ví dụ `javascript:`) là chữ thường. Đóng picker khi đang xoá → abort.
- **Tải về (`download`)**: nhánh `{ url }` qua `safeMediaUrl` và **từ chối** `blob:` / `data:` / `javascript:` (không an
  toàn → lỗi `server`); tải bằng `<a download rel="noopener noreferrer">` tạm, URL khác origin thêm `target="_blank"`,
  không bao giờ điều hướng trang hiện tại; `expiresAt` đã qua → lỗi. Nhánh `{ blob }` bắt buộc `instanceof Blob`,
  `URL.createObjectURL` → `<a download>` cùng origin → `revokeObjectURL` ở macrotask kế tiếp, thu hồi luôn URL còn sót khi
  đóng picker; **blob chỉ được tải về, không bao giờ mở trong tab / `window.open`** (blob `text/html` mở ra sẽ chạy dưới
  origin của site). `filename` làm sạch: ≤ 200 ký tự, bỏ `/ \ :` và ký tự điều khiển, rỗng → `asset.name`.
- **Copy link (`copyLink`, mặc định `false`)**: giá trị là `urls.preview` sau `safeMediaUrl`, dạng tuyệt đối; URL không
  an toàn → không có nút. Đây là link **hiển thị, không phải danh tính** (danh tính vẫn là `assetId`); site dùng URL ký có
  hạn thì đừng bật.
- **Latest-wins + abort** thêm slot: trang, `delete` theo asset, `download`, `uploadFromUrl`; đóng picker hoặc dialog lồng
  thì abort tất cả. `td-media-grid` đặt kích thước ảnh / biến justified bằng CSSOM `style.setProperty` (không `style="…"`),
  khôi phục giá trị inline gốc của site khi item rời grid.

Test: phần XSS / an toàn của `td-media-picker.engines.browser-test.js` (chuỗi `<img src=x onerror=…>` ở mọi trường chỉ là
text, URL `javascript:` / `data:` / `file:` không thành `src`, không thuộc tính `style` / `on*`), `media-url.test.js`,
`media-picker-core.test.js` (`normalizeError`; từ v0.33 `validateRemoteUrl`, `normalizeDeleteResult`,
`normalizeDownloadResult`, `safeFilename`, `safeLinkUrl`), test SSR PHP (`preview_src` độc → không `img`, `attrs` allowlist).

**Bổ sung v0.35 — `td-cropper` + cắt ảnh trong picker / field** ([ADR 0015](decisions/0015-td-cropper.md),
[ADR 0013 › Bổ sung v0.35](decisions/0013-media-picker-boundary.md#bổ-sung-v035), plan
[v0.35.0](plans/v0.35.0-cropper.md) quyết định 2, 26, 28a, 29, 33):

- **Không bao giờ tạo pixel** (QĐ 2): `src/form/td-cropper.js`, `src/feedback/crop-dialog.js`, `src/utils/crop-geometry.js`
  không dùng `<canvas>`, `toBlob`, `toDataURL`, `getImageData`, `fetch(`, `createObjectURL` (guard test tĩnh trong
  `crop-geometry.test.js`); không upload, không thuộc tính `crossorigin`. Ảnh chỉ hiển thị bằng `<img>` ⇒ không đọc
  pixel, không cần CORS, không có bề mặt "tainted canvas" / rò rỉ ảnh khác origin. Kết quả **chỉ là số**.
- **URL ảnh**: `src` của cropper / hộp cắt chỉ qua `safeMediaUrl` (cùng cổng picker / field), **không** `blob:` / `data:`
  (`allowBlob` không bật), `referrerpolicy="no-referrer"`. URL sai → `image-error { kind: 'src' }`, không có `<img src>`.
  CSP chỉ cần `img-src` cho origin ảnh.
- **Parse chặt mọi số từ thuộc tính**: `natural-*` regex số nguyên 1–100 000; `aspect-ratio` / `crop-ratio` qua
  `parseAspectRatio`; `crop` qua `parseCrop` (≤ 512 ký tự, khoá đúng `v,x,y,width,height`); `focal` qua `parseFocal`
  (≤ 128 ký tự, khoá đúng `v,x,y`, 0..1); `Number.isFinite` + kẹp ở mọi đầu vào hình học. PHP `td_media_field` parse
  `focal` cùng luật (bảng parity `FOCAL_CASES`, sai → `null` + một `E_USER_WARNING`, cảnh báo không in giá trị thô).
- **Text-only**: `alt`, nhãn, câu live region gán bằng `textContent` / `setAttribute`; không hatch HTML mới (§2 không
  đổi). Vị trí khung / ảnh / điểm đặt bằng CSSOM custom property `--_tdc-*` (`--_td-mf-crop-*` cho xem trước của field),
  gỡ khi disconnect — không `style="…"`, không `<style>`.
- **Fail closed với ảnh đã cắt sẵn** (QĐ 5, 26, 28a): biết kích thước gốc mà ảnh tải về lệch tỉ lệ > 1 % → trạng thái
  `error` `ratio`, nút xác nhận khoá — không bao giờ ra toạ độ tính trên ảnh đã cắt. Field có adapter lấy nguồn từ
  `adapter.get()` (`urls.preview` + `width/height`), không âm thầm dùng `preview-src`; lỗi chỉ hiện `userMessage` / nhãn.
- **FormData** (QĐ 29): `name[crop]` không đổi (tên, JSON v1, byte gốc khi không sửa); `name[focal]` = mục thứ tư **opt-in**
  (`focal-point`), `{"v":1,"x","y"}` hoặc `null`. State khôi phục thêm khoá `focal` (đã validate) — vẫn không URL, không
  nhãn server.
- **Toạ độ chỉ là UX** (QĐ 33): server **phải** validate lại crop + focal (`v`, đúng khoá, số hữu hạn 0..1,
  `x + width ≤ 1`, `y + height ≤ 1`, độ dài), không coi crop là quyền, lưu theo chỗ dùng. Tham số biến đổi ảnh của URL
  công khai **chỉ** do server sinh + ký từ giá trị đã lưu (preset đầu ra do server quyết) — không bao giờ nhận crop tuỳ ý
  từ query string (CDN thành máy cắt ảnh miễn phí, cache poisoning / DoS). Trần chất lượng (OG ≥ 1200 × 630) kiểm `pixels`
  ở server; `MIN_PX` của kit chỉ là hằng tương tác.
- **EXIF** (QĐ 6): server chuẩn hoá hướng ảnh khi re-encode upload (đã bắt buộc ở trên); kit không đọc EXIF ở client.

Test: guard tĩnh QĐ 2 (`crop-geometry.test.js`), fuzz 10 000 ca `toOutput` → luôn qua `parseCrop`, `FOCAL_CASES` parity
JS = PHP, engines a11y (`alt` = `<img src=x onerror=…>` chỉ là text; `src` `javascript:` / `data:` / `blob:` → `image-error
src`; không thuộc tính `style` ngoài `--_tdc-*` trên host), CSP gate state `td-cropper` + bước cắt picker.
