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

## 6b. Chọn dòng `td-table` (v0.37.0)

[ADR 0018](decisions/0018-table-row-selection.md). Mô hình đe doạ: dữ liệu dòng (tên hiển thị, khoá) do người dùng khác
tạo; `rowKey` / `rowSelectable` / `onSelectChange` là callback của dev; lựa chọn là **trạng thái phía client**.

- **Khoá → form**: `name` → `setFormValue(FormData)` một mục mỗi khoá (`String(key)`). Kẻ tấn công gửi lên được **mọi
  chuỗi** (sửa DOM / gọi API / tự POST) → server **luôn** ép kiểu + kiểm quyền từng id (docs có ví dụ PHP). Khoá hợp lệ chỉ
  là chuỗi khác rỗng / số hữu hạn / `bigint` (`keyId`); object, `NaN`, rỗng bị loại. Khoá trùng (sau `String(key)`) →
  dòng sau không chọn được: client so trên toàn `data` (review SEC-2: không để `selectedRows` trả dòng khác dòng người
  dùng chọn), server so trong trang (docs: khoá phải duy nhất toàn cục, khoá ghép `tenant:id`). Docs PHP: CSRF token,
  mảng ≤ 500 chuỗi số thập phân, bỏ trùng, quyền + xoá trong một câu có điều kiện tenant / owner (không TOCTOU).
- **Đọc `row-key`** (review SEC-1): chỉ thuộc tính riêng của dòng hoặc getter trên chuỗi prototype của chính nó — dừng ở
  `Object.prototype` (prototype pollution `Object.prototype.id` không thành khoá); getter / proxy ném → dòng không chọn
  được, render không gãy.
- **Khoá không vào DOM**: dòng ↔ khoá qua `data-row-idx` → mảng trong JS; không escape, không lộ kiểu.
- **Tên ô tick** = chữ của ô `primary` sau render (`textContent`, bỏ nhãn card, ≤ 80 ký tự) đặt bằng `setAttribute`;
  thông báo `role=status` bằng `textContent`; mẫu nhãn thay `{label}` / `{n}` / `{max}` bằng **hàm** (chuỗi dữ liệu có
  `$&` / `$1` giữ nguyên chữ). Test: `<img src=x onerror=…>$&$1` trong ô primary → `aria-label` / status là chữ, không thực thi.
- **Callback fail closed**: `rowKey` ném → dòng không chọn được (cảnh báo một lần); `rowSelectable` ném → khoá;
  `onSelectChange` ném → `console.error`, event vẫn phát.
- **Không `style`**: cột chọn / màu dòng chọn chỉ từ `td.css` (CSP gate `td-table.selection*`).

## 6c. Bộ lọc ngoài, ẩn cột, `td-filter-chips` (v0.39.0)

Plan [v0.39.0-filters-range](plans/v0.39.0-filters-range.md) QĐ 1–16. Mô hình đe doạ: giá trị bộ lọc đến từ **URL / form
của người dùng** (sửa được, chia sẻ được qua link) → không tin cậy ở mọi nơi kit chạm tới.

- **`td-table` không đọc / ghi `location` / `history`** và không render `filters` ở đâu cả: chỉ sao nông + đóng băng
  object app đưa (`__proto__` bỏ qua), trả lại qua `request-change` / `getState()`. App parse URL bằng `URLSearchParams`,
  server whitelist cột sort / kiểm từng tham số. `setState({ sort })` chỉ nhận `key` của cột `sortable` đã khai báo (khác →
  bỏ sort). **Race**: `requestId` tăng dần + `setState` bỏ phản hồi có `requestId` cũ — phản hồi về muộn không bao giờ ghi
  đè dữ liệu của yêu cầu mới hơn (kể cả khi app quên `AbortController`).
- **Ẩn cột** chỉ là trình bày (`hidden`), **không phải phân quyền**: dữ liệu của cột ẩn vẫn nằm trong `data` / DOM (ô có
  `hidden`). Cột người dùng không được xem → server đừng gửi. Nhãn cột trong menu "Cột" là `textContent`.
- **`td-filter-chips`**: dựng bằng DOM API — `label` / `value` / `key` / `id` là `textContent` / `setAttribute`, không
  có hatch HTML; ký tự điều khiển bị bỏ, độ dài bị cắt (`src/utils/filter-chips-model.js`, PHP `td__filter_items` cùng
  luật — test parity; review SEC-1: trần 200 chip **và** 800 mục được xét (`MAX_CANDIDATES`, hợp lệ hay không; JS duyệt theo
  chỉ số tới `min(length, 800)` — không bao giờ `for…of` trên mảng thưa dài), chuỗi thô cắt ở 4 × giới hạn **trước** regex / tách code point,
  bộ đếm hậu tố id theo base — O(n), một cảnh báo mỗi lần gọi). `href` / `clear-href` (review SEC-2, chống điều hướng
  mở): JS `cleanHref` giải theo `document.baseURI`, chỉ http(s) **cùng origin** (`url.origin === location.origin`),
  từ chối `//host`, `\`, scheme không kèm `//`; PHP `td__filter_href` chỉ nhận URL **tương đối** (không scheme, không
  `//`, không `\`) vì không biết origin. Bảng `HREF_CASES` (`src/utils/filter-chips-model.js`) là parity JS ↔ PHP.
  Không có opt-in cross-origin. Event `filter-remove` / `filter-clear`
  huỷ được (dispatch tay `cancelable: true`); không huỷ + link → trình duyệt điều hướng (không `target`, cùng tab).
- **Cổng SSR `filter-chips@1`** (bề mặt chèn markup): nhận tại chỗ chỉ khi **toàn bộ** cây khớp hợp đồng — tag, tập thuộc
  tính **chính xác** từng nút (thuộc tính lạ như `onclick` / `style` → từ chối), chữ cố định (`": "`, "Xoá tất cả"), lá
  chỉ có text, `aria-label` của × bằng chuỗi tính lại từ nhãn / giá trị, `href` qua lại `cleanHref` không đổi, "Xoá tất cả"
  có mặt ⇔ ≥ 2 chip bỏ được, và item đọc được đã ở dạng chuẩn hoá (không trùng id, đúng độ dài). Lệch bất kỳ → không lấy
  item nào từ markup, render rỗng + một cảnh báo; `items` gán sớm luôn thắng. Nội dung ô icon bị thay bằng icon registry.
- Test: `src/display/td-filter-chips.ssr.engines.browser-test.js` (markup bị sửa: `aria-label`, `data-removable`,
  `href="javascript:"`, `onclick`, phần tử thừa, dấu phân cách, phần tử trong giá trị, thiếu "Xoá tất cả"),
  `src/display/td-v039-filter-chips.engines.browser-test.js` (XSS label / value, `javascript:` href),
  `src/utils/filter-chips-model.test.js`, `test/php/td-ssr-filter-chips.test.js`.

## 6d. Palette `td-theme` (CLI, builder) và cầu portal theme (v0.42.0)

Bề mặt input mới: chuỗi màu và tên theme do **người dùng của CLI / builder** nhập (dev hoặc admin của site), thành CSS.

| Bề mặt | Luật | Ở đâu |
|---|---|---|
| Seed màu | Chỉ `#rgb` / `#rrggbb` / `rgb()` (`rgba()` không alpha < 1) — regex neo đầu-cuối, số có giới hạn chữ số, ≤ 64 ký tự, số không hữu hạn (`1e999`) bị từ chối; không `eval`, không `new Function`, không parse bằng DOM. Sai → `ThemeInputError` (CLI thoát 2, không in CSS) | `src/theme/palette.js` `parseSeed`, `src/theme/color.js` `parseColor` |
| Tên theme (`--name`) | Whitelist `^[a-z][a-z0-9-]{0,31}$`, không `light` / `dark` / `auto` → không thể thoát khỏi chuỗi selector `[data-td-theme="…"]` | `checkThemeName`, `selectors.js` `variantSelector` (ném lỗi nếu lọt) |
| CSS sinh ra | **Không bao giờ chép chuỗi input thô**, kể cả trong comment: seed được đọc thành số rồi in lại dạng hex; token là output của `toCss()` (hex / `rgb(R G B / P%)`) hoặc chuỗi cố định (bóng, vòng focus). Dòng cảnh báo AA chỉ chứa mã + tên token. Test: seed chứa `*/`, `<`, `;`, `}` bị từ chối trước khi tới serializer; mỗi dòng có tối đa một `*/` | `src/theme/serialize.js`, `serialize.test.js` |
| CLI | `node:util.parseArgs` strict (không tham số lạ / vị trí / lặp), mọi giá trị ≤ 64 ký tự; **không đọc / ghi file** (stdout / stderr); thông báo lỗi chỉ nêu tên cờ, không lặp lại input (chặn escape sequence của terminal); tính xong mọi thứ rồi mới ghi (lỗi nội bộ → thoát 3, stdout rỗng) | `bin/td-theme.mjs`, `bin/td-theme.test.mjs` (input độc hại) |
| Builder | Không inline script / style; xem trước bằng **constructable stylesheet** (`adoptedStyleSheets`, được phép dưới CSP strict — §3); CSS / JSON / chẩn đoán / bảng cặp viết bằng `textContent`; tải về qua Blob URL; chỉ import tương đối trong package. Không mở bằng `file://` | `src/theme/builder/*`, `test/theme/theme.spec.mjs` (CSP `'self'` + `style-src-attr 'none'`: 0 violation, input độc hại bị chặn tại chỗ) |
| Cầu portal (`bridgeTheme`) | Chỉ chép **allowlist** `THEME_TOKENS` (có version) + `color-scheme` + attribute `data-td-theme`, giá trị lấy từ `getComputedStyle` của vùng (đã là giá trị CSS hợp lệ), ghi bằng CSSOM `style.setProperty` (một giá trị, không chèn được khai báo); không đụng tên đã có inline; gỡ đúng những gì đã đặt | `src/utils/layers.js`, `td-v042-theme-scope.engines.browser-test.js`, CSP state `td-theme-scope.*` |

Ngoài phạm vi: một file CSS sinh ra do **site** sửa tay rồi phục vụ — là CSS của site (tin cậy như mọi CSS của site).

## 6e. Gallery ảnh `td-media-gallery` (v0.43.0)

Ranh giới ở [ADR 0021](decisions/0021-media-gallery-form-shape.md); mọi luật của §6 (URL một cổng, chỉ text, console không
in giá trị / lỗi gốc của adapter) áp dụng nguyên. Thêm:

- **Fail closed không bao giờ thành "xoá hết":** `items` hỏng (JSON sai, > 256 KiB, > 100, id thiếu / trùng / không phải
  chuỗi / > 512) hoặc `name` kết thúc `[]` → không có mục FormData **và** không có state khôi phục (một state rỗng khôi
  phục lại sẽ gửi `name=` = xoá). PHP no-JS: không có input nào, `items="[null]"` để JS cũng fail closed.
- **Vượt `max` không gửi gì** (JS `setFormValue(null)`, PHP: không control nào có `name`) — validity có thể bị bỏ qua
  (`novalidate`, `form.submit()`), nên hợp đồng an toàn ở tầng dữ liệu.
- **Một đường validate** (`validateItems` = `td__media_gallery_items`, bảng `GALLERY_CASES`): API (`value =`,
  `setSelection`) không hợp lệ bị từ chối, không đổi state; picker bỏ id sai / trùng.
- **Trần cứng:** 100 ảnh, attribute 256 KiB, id 512, alt 500 (code point), crop 512, focal 128, 4 `adapter.get` song song.
- **Luồng cắt theo thế hệ + identity** (QĐ 12b): kết quả `adapter.get` / hộp cắt chỉ áp khi chưa abort, cùng thế hệ nguồn,
  cùng `li` còn trong lưới và cùng id — adapter phớt lờ `AbortSignal` cũng không ghi được gì; áp vào đúng ảnh, không theo
  index. Lazy get cùng luật (thế hệ + adapter + context + item + id).
- **Cổng hydrate riêng:** dấu `media-gallery@1`, allowlist attribute host, từng phần so với `render()` (attribute chính
  xác, text chính xác), hidden input đúng lớp / tên / giá trị / vị trí / `disabled`, ô alt chỉ thêm được `name` / `value`
  của bản no-JS. Lệch → render an toàn (không lấy node nào của markup lạ), chỉ giữ alt đang gõ + focus (theo id item).
- **Server phải:** `count ≤ max` **của server**, `distinct`, mọi id tồn tại / đúng loại / có quyền (**một** `whereIn`,
  so số lượng), cắt alt, kiểm crop / focal như field, ghi theo vị trí trong transaction; "không có key" = giữ nguyên.
## 6f. Xác nhận bằng cách gõ + theo dõi thay đổi chưa lưu (v0.44.0)

| Bề mặt | Luật | Ở đâu |
|---|---|---|
| `typeToConfirm` (phrase) + chữ người dùng gõ | Chỉ là **text**: phrase vào `<strong>` bằng `textContent`, template nhãn (`TdModal.labels.typeToConfirm*`) tách ở `{phrase}` thành text node — không `innerHTML`, không `style`. So khớp sau chuẩn hoá (NFC, trim, gộp khoảng trắng), `===`; dài ≤ 100 code point. **Fail closed** (review r1 SEC-1): option có mặt mà sai (không phải chuỗi, rỗng / trắng, > 100) → `confirm()` reject `TypeError` thông điệp cố định, không mở dialog, không gọi `onConfirm` — không bao giờ rơi về confirm thường. Option được đọc **đúng một lần** (getter / Proxy ném → cùng lỗi; review r2 A). Phrase **không phải bí mật** (hiện trên màn hình) — cho dán. Kiểm tra là UX chống bấm nhầm, **không phải** kiểm soát quyền: server vẫn phải xác thực / phân quyền thao tác xoá | `src/utils/confirm-phrase.js`, `td-modal.js` `_typeToConfirm`, test XSS trong `td-v044-type-confirm.engines.browser-test.js`, CSP state `td-modal.type-confirm*` |
| Guard đóng (`beforeClose`) | Throw / reject → **ở lại** (fail safe cho dữ liệu) + `console.error` **chuỗi cố định**, không bao giờ in object lỗi của caller (review r1 SEC-3, cũng áp dụng cho `ignore()` và hộp `confirmDiscard` của tracker; `.then` của kết quả guard được đọc trong vùng bảo vệ — getter ném = từ chối, review r2 E); đang chờ: không chạy lại guard, không chạy action; đóng bằng code luôn thắng (không treo đăng xuất) | `td-modal.js` `_requestClose`, `td-drawer.js` `requestClose`, `td-v044-close-guard.browser-test.js` |
| `trackFormDirty` | Chỉ đọc `FormData` (không gửi đi đâu, không lưu storage); tên field `ignore` so bằng `===` / hàm của app; `beforeunload` chỉ `preventDefault()` + `returnValue = ''` (không thông điệp tuỳ biến); submit native chỉ được miễn **một lần**, chỉ khi `isTrusted` và điều hướng chính cửa sổ này (không `method=dialog`, target rỗng / `_self` theo attribute có mặt trước `<base target>`), xét `defaultPrevented` cuối cùng, hết hạn sau 1 s hoặc lần nhấn / chạm kế tiếp (review r1 SEC-2, r2 B-D); listener `window` chỉ có khi form bẩn | `src/utils/form-dirty.js`, `td-v044-form-dirty.engines.browser-test.js`, `test/engines/form-dirty.spec.mjs` |

## 6g. `td-steps`, `td-timeline` (v0.45.0)

Plan [v0.45.0-steps-timeline](plans/v0.45.0-steps-timeline.md). Dữ liệu (nhãn bước, tiêu đề / người làm / chi tiết sự
kiện, `href`) đến từ app — thường từ dữ liệu người dùng nhập (ghi chú đơn, tên khách) → không tin cậy.

- **Text, không HTML**: cả hai dựng bằng DOM API (`textContent` / `setAttribute`); không markdown, không `**bold**`, không
  tự nhận diện link (lỗi 3 của dcms2). Ký tự điều khiển bị bỏ, độ dài bị cắt, trần số phần tử (20 bước; 1 000 mục mỗi lần
  gán, 4 000 mục được xét, **5 000 mục tổng** qua `append` / "Xem thêm" — review SEC-02: vượt → bỏ phần thừa, một cảnh báo,
  tắt "Xem thêm") — `src/utils/steps-model.js`, `timeline-model.js`; PHP `td__steps_items` /
  `td__timeline_items` cùng luật (test parity).
- **Link** (`href` của bước, của tiêu đề, `actor.href`, `more-href`): cùng chính sách `cleanHref` (JS: http(s) cùng origin)
  / `td__filter_href` (PHP: chỉ tương đối) với `td-filter-chips` — bảng `HREF_CASES`.
- **Hook lười `renderDetails`** trả **Node** (app dựng — trách nhiệm của app, như mọi hook trả Node) hoặc chuỗi (luôn là
  chữ). Kết quả cũ bị bỏ theo thế hệ + `AbortSignal` (đóng chi tiết, gán `items`, gỡ phần tử, vẽ lại nhóm); tương tự
  `loadMore`. Review SEC-01: **đổi hook** (`renderDetails` / `loadMore` gán hàm khác) cũng abort mọi yêu cầu của hook cũ,
  xoá cache chi tiết, và mỗi kết quả chỉ được áp khi hook lúc gọi vẫn là hook hiện tại (so identity) — kết quả muộn của
  hook cũ không bao giờ hiện. Review SEC-04: tối đa **6** `renderDetails` chưa kết thúc cùng lúc (`DETAIL_CONCURRENCY`;
  lời gọi đã abort vẫn giữ chỗ tới khi promise kết thúc — fail closed), phần còn lại xếp hàng theo thứ tự hiển thị (bỏ khỏi hàng khi đóng trước lượt); hàng đợi bị xả + abort khi gán `items`, gỡ
  phần tử, vẽ lại nhóm, đổi hook — nhiều mục `expanded: true` hay đổi hook không bắn ra hàng trăm request cùng lúc.
- **Không lộ lỗi / dữ liệu của app** (review SEC-03): `load-more-error` chỉ mang `{ kind: 'rejected' }`, không kèm lỗi gốc;
  mọi `console.warn` của hai component là chuỗi cố định (mã cảnh báo, hằng số, số đếm) — không bao giờ lặp lại giá trị /
  lỗi của caller (kể cả tên icon lạ).
- **Cổng SSR `steps@1` / `timeline@1`** (bề mặt chèn markup): đọc model từ markup (mỗi trường từ nút riêng, lá chỉ có text,
  `href` qua lại bộ lọc không đổi, đã chuẩn hoá) rồi **dựng lại cây từ model và so từng nút** với markup
  (`src/utils/ssr-tree.js`: tag, namespace, tập thuộc tính chính xác, text) — thuộc tính lạ (`onclick`, `style`), phần tử
  thừa, `data-state` lệch luật trạng thái, hai `aria-current`, `<time>` lệch nhóm / múi giờ, cấu trúc nhóm "Không rõ thời
  gian" sai → không nhận, vẽ rỗng + một cảnh báo. Hai ngoại lệ có chủ ý: chữ nhãn ngày (tính lại ngay) và ô icon — review
  ISSUE-1: ô **rỗng** hoặc chứa **đúng** SVG registry của tên đó (cùng cây, thuộc tính, namespace như `tdIcon()` / PHP
  `Td::icon()` in ra); SVG khác bất kỳ (thêm thuộc tính, thêm phần tử, `path` khác) → không nhận. `time-zone` trình duyệt không biết → vẽ lại từ model đã
  đọc (đã qua kiểm) theo múi giờ trình duyệt.
- Test: `src/display/td-{steps,timeline}.ssr.engines.browser-test.js` (markup bị sửa), `td-v045-*.engines.browser-test.js`
  (XSS mọi trường, `javascript:` href), `src/utils/{steps,timeline}-model.test.js`, `test/php/td-ssr-steps-timeline.test.js`.

## 6h. `td-diff` (v0.46.0)

Bề mặt input: **dữ liệu audit không tin cậy** — giá trị do người dùng khác nhập, khoá JSON tuỳ ý, cấu trúc lớn / sâu /
vòng lặp — đi vào DOM (JS) và HTML (PHP `td_diff` / `td_diff_snapshots`). Plan: `docs/internal/plans/v0.46.0-diff.md`.

| Bề mặt | Luật | Ở đâu |
|---|---|---|
| Chữ (khoá, nhãn, giá trị, option enum, `labels`, JSON view) | **Text only**: template đã `escapeHtml` (JS) / `Td::e` (PHP), không có hatch HTML, không link hoá, không markdown. C0 (trừ `\t` `\n`) / C1 bị bỏ; điều khiển hướng + Default_Ignorable_Code_Point (U+00AD, 034F, 061C, 115F–1160, 17B4–17B5, 180B–180F, 200B–200F, 202A–202E, 2060–206F, 3164, FEFF, FFA0, FFF0–FFF8, 1BCA0–1BCA3, 1D173–1D17A, TAG E0000–E0FFF; trừ bộ chọn biến thể FE00–FE0F) **hiện ra** `⟨U+…⟩` (span muted) — trang audit cho thấy đúng thứ đã lưu (Trojan Source, ASCII smuggling); mỗi giá trị và nhãn trong phần tử `unicode-bidi: isolate` (giá trị + `dir="auto"`) — Codex round 1 S3 |
| Định danh hàng (khoá) | **Khoá nguyên văn** (không chuẩn hoá, surrogate lẻ giữ nguyên) tới 1 000 ký tự; nhãn hiển thị cắt 200 nhưng hai khoá khác nhau luôn là hai hàng (không giấu thay đổi do cắt). Khoá > 1 000 ký tự: định danh riêng mỗi bên (không bao giờ ghép) + ghi chú quá lớn. Đoạn đường dẫn của `FieldDef` so nguyên văn — round 1 S1. PHP input gốc có UTF-8 hỏng: U+FFFD chỉ để hiển thị; khoá hỏng có định danh riêng (không ghép), giá trị so bằng byte gốc có trần, `FieldDef` có đoạn hỏng bị bỏ — round 2 A | `keyId` / `td__diff_keyid`, fixture `r1-prefix-collide`, `r1-nfc-nfd`, `r1-overcap-key` | `src/utils/diff-markup.js`, `td__diff_markup` (`php/td.php`) |
| Che (`masked`) | **Trình bày, không phải bảo mật**: server phải bỏ / che trước khi gửi. Item che: chỉ **chuỗi** được in (đã che ở server); giá trị khác không bao giờ được `String()` / duyệt / đưa vào JSON view (`"[ĐÃ ẨN]"`). Nhánh snapshot che theo `FieldDef` (khớp **tiền tố theo đoạn có kiểu**): không đọc (kể cả getter); mảng giá trị đơn có phần tử / đường dẫn che bên dưới = **một** lá che ở chính mảng (không hàng theo chỉ số, phần tử che không đọc, JSON view in cả mảng là `"[ĐÃ ẨN]"`) — round 1 I3 | `src/utils/diff-model.js`, test spy getter |
| Duyệt object (JS) | Chỉ plain object (`Object.prototype` / `null`) + mảng; khoá riêng (`Object.keys` trong `try`); getter ném / Proxy ném → `[không đọc được]`; class instance / Map / function → `[không hỗ trợ]` (không gọi `toString`); vòng lặp (theo tổ tiên) → `[vòng lặp]`; `__proto__` từ `JSON.parse` là một hàng thường | `diff-model.js` (`shapeOf`, `keysOf`, `flatten`) |
| DoS | Mọi trần chạy **trước** việc tốn kém: 10 000 nút / bên, 1 000 khoá / mảng / item, 500 hàng, độ sâu 6, 10 000 ký tự / giá trị, 300 000 / diff (**gồm chữ phần tử mảng**), mảng giá trị đơn đọc / giữ ≤ 200 phần tử mỗi bên (độ dài gốc giữ cho "+{n}"), **ngân sách việc chung 100 000** (phần tử được đọc, bước so sánh, phần tử tập, item — **giữ trước** chi phí của từng thao tác; không đủ → bỏ qua, mảng sau thành tóm tắt, so sánh "không so sánh được", ghi chú — round 2 D), container vượt trần không bao giờ được so sâu (tóm tắt không so được; so sâu gặp container > 1 000 phần tử / khoá → "không so sánh được" trước khi đọc giá trị — round 2 C), tập cắt ở 200 phần tử: khác biệt chỉ trong phần đã đọc → "không so sánh được" trừ khi bên kia đọc hết (round 2 B), JSON view 100 000 đơn vị (serializer riêng có ngân sách — không `JSON.stringify` trên input), so sánh sâu ≤ 10 000 bước. Chuỗi thô (giá trị, khoá, đoạn `FieldDef`) cắt **trước** mọi regex / kiểm UTF-8 / so sánh / khoá tập: JS ≤ 8 × trần đơn vị, PHP `substr` ≤ 16 × trần byte; chuỗi dài hơn 4 × trần so bằng tiền tố (giống → "không so sánh được"). Mảng thưa duyệt theo chỉ số tới trần. PHP: chuỗi JSON > 2 MB không decode, độ sâu 64 — round 1 S2 / I2 / I4 | `LIMITS` (`diff-model.js`) = hằng trong `td__diff_*`; test biên ± 1 + fuzz |
| Số | Số không an toàn / không hữu hạn không bao giờ hiện chữ số (sai) — `[số quá lớn]` / `[không hỗ trợ]`, luôn "Đổi" + "không so sánh được" (không giấu thay đổi thật); `json_encode(INF)` không bao giờ được gọi | `canonicalNumber` / `td__diff_number` |
| SSR `diff@1` | Nhận markup chỉ khi đúng dấu + hình tối thiểu; **không đọc dữ liệu ngược từ DOM** (không có state / event nào lấy từ markup — markup là HTML của chính site); dấu khác → một cảnh báo (không nội dung) + render từ property | `td-diff.js`, `td-diff.ssr.engines.browser-test.js` |
| PHP host | `attrs` allowlist (`on*`, `style`, `data-td-*`, tên của component bị chặn); `view` / `unchanged` theo whitelist; cảnh báo chỉ chứa mã lỗi | `td__diff_host`, `test/php/td-ssr-diff.test.js` |

## 6i. `td-check-matrix` (v0.47.0)

Bề mặt input mới: dữ liệu quyền (khoá hàng / cột, nhãn, ghi chú) của **app** + markup SSR có thể bị sửa trước khi JS tải
+ FormData là hợp đồng công khai của **form phân quyền** ([ADR 0022](decisions/0022-check-matrix-grid-form-shape.md);
trang người dùng [check-matrix.md](../components/check-matrix.md#bảo-mật)).

| Bề mặt | Luật | Ở đâu |
|---|---|---|
| Dữ liệu (JS property / `setData` / attribute `data` / khôi phục form / PHP) | **Một** đường validate (`validateMatrix` = `td__check_matrix_data`, bảng `MATRIX_CASES` chạy chung). Lỗi cấu trúc → **fail closed toàn bộ**: không control, **không mục FormData nào** — không bao giờ bỏ riêng một hàng (hàng vắng = thu hồi ở mọi cột), không bao giờ gửi marker rỗng thay dữ liệu. Khoá: regex `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$` (không `[` `]`, không `_` đầu — `_v` dành cho sentinel) hoặc số nguyên ≥ 0; cờ boolean đúng kiểu; trần 500 / 32 / 10 000 / 64, attribute `data` ≤ 512 KiB **UTF-8** ở cả hai phía (JS `matrixJsonBytes`, PHP `strlen` của đúng JSON nó in; vượt → fail closed `data-size`, PHP không in input nào — review r1 #2, test biên ±1 với ma trận dày ghi chú dùng chung `test/fixtures/check-matrix-dense.js`), state ≤ 256 KiB. Cảnh báo chỉ nêu loại lỗi, **không in giá trị** (test với khoá "SECRET"). **Khoá trùng tên thành viên của Object** (`constructor`, `toString`, `assign`, `prototype`, `hasOwnProperty`… — hợp lệ theo regex) — review r1 #1: mọi map khoá theo dữ liệu app trong model / component là `Object.create(null)` + `Object.hasOwn`, giá trị công khai (`value`) dựng bằng `Object.fromEntries` (định nghĩa, không gán qua chuỗi prototype); trước đó `cells.constructor.assign = …` ghi đè `Object.assign` toàn cục. Test: serialize / FormData đúng, `Object` / `Object.prototype` không đổi. PHP: mảng + `(object)` (stdClass) không có chuỗi prototype — an toàn | `src/utils/check-matrix-model.js`, `php/td.php` |
| Escape | Nhãn / mô tả / ghi chú → chữ (`escMatrix` = `htmlspecialchars(ENT_QUOTES)` từng byte); khoá chỉ vào `name` / `value` của form không JS (đã qua regex, vẫn escape); id từ id host + chỉ số, **không bao giờ từ dữ liệu**; không selector ghép từ dữ liệu; mẫu nhãn thay bằng hàm (`$&` giữ nguyên chữ); không lối HTML | `src/utils/check-matrix-render.js`, `td-v047-check-matrix.engines.browser-test.js` (XSS) |
| Ô khoá | `disabled` native + không bao giờ đổi qua ô / hàng / cột / nhóm / tất cả / phím / chạm / chế độ hẹp (ô hàng loạt đang ẩn bị từ chối bằng kiểm tra hiển thị). **Chỉ là UI**: sửa DOM / tự POST gửi được mọi cặp → server tự cưỡng chế khoá, chống leo quyền, CSRF, `lock_version` | component + docs |
| FormData + `max_input_vars` | Đủ tập, ô khoá-tick gửi đúng một lần; sentinel `name[_v]=1` **cuối cùng** — PHP cắt im lặng mục vượt `max_input_vars` (mục cắt = quyền thu hồi); server bắt buộc 422 khi thiếu `_v` (test PHP chứng minh `_v` mất trước) | `test/php/td-ssr-check-matrix.test.js` |
| Hydrate SSR (`check-matrix@1`) | Cổng so **từng node** với `renderMatrix({ ssr })` của `data` (attribute đúng tập + giá trị, chữ, số marker / hidden / sentinel, `name` / `value` mỗi checkbox khớp ô, id / `aria-controls` nhóm, ô icon chỉ nhận một SVG allowlist). Lệch bất kỳ (thêm `formaction` / `onclick` / hidden input, đổi cột của checkbox, input nhét trong ô icon, `data` hỏng) → **không lấy giá trị nào từ markup**, render an toàn từ `data`. Gắn lại (review r1 #4): `canRebind()` so **từng node** với `render()` của model / state hiện tại — chỉ cho phép trạng thái sống đã liệt kê (`tabindex` -1→0, `data-changed` / `data-col-active` / `data-active` / `data-layout-js` / `data-td-pressed` không giá trị, `aria-labelledby` của table, `aria-label` / `disabled` của ô hàng loạt trên thanh, chữ của dòng ghi chú / live region, SVG allowlist trong ô icon); lệch chỉ số, kind, `disabled` của ô khoá, id, quan hệ ARIA, attribute / handler / node thừa → render lại an toàn | `td-check-matrix.ssr.engines.browser-test.js` |
| CSP | Không `style=""` (PHP và JS); CSSOM theo instance chỉ một scalar `--td-check-matrix-max-height` (regex chặt + `CSS.supports`, không `calc()` / `var()` / `url()` / `;`) | CSP states `td-check-matrix.*` (gồm `max-height` 24rem và `calc(1px)` bị từ chối) |

## 7. Trách nhiệm của site

Những thứ kit **cố ý không làm** và site phải làm, nếu không thì có lỗ hổng dù kit đúng. Trang người dùng tương ứng:
[guides/security.md](../guides/security.md), [guides/media-renditions.md](../guides/media-renditions.md).

- **Biến đổi ảnh** (v0.36.0, plan v0.36.0 M12): kit chỉ xuất toạ độ crop / focal ([ADR 0015](decisions/0015-td-cropper.md)),
  không bao giờ tạo pixel. Endpoint / CDN cắt ảnh của site là một máy xử lý ảnh công khai → bắt buộc theo
  [guide biến thể ảnh](../guides/media-renditions.md):
  - **Chữ ký**: URL ký HMAC-SHA256 trên chuỗi chuẩn hoá `asset id | crop (4 chữ số) | w | fmt | v [| exp]`, secret trong
    env, so sánh hằng thời gian (`hash_equals` / `crypto.subtle.verify`, không `==` / `strcmp`), sai → 403 **trước** khi
    đọc file / biến đổi; `kid` + hai khoá hợp lệ khi xoay.
  - **Giới hạn biến thể**: allowlist bề rộng + định dạng (webp / avif / jpeg), crop làm tròn trước khi ký, ảnh ra ≤ vùng
    cắt gốc và ≤ trần cứng (vd. 4096 px), từ chối ảnh gốc quá nhiều điểm ảnh; cache CDN + cache đĩa khoá = hash tham số
    đã ký.
  - **Rate limit**: WAF / rate limit trên cache miss theo IP; giới hạn tác vụ đồng thời + timeout / bộ nhớ ở server.
  - **Ảnh riêng tư**: URL ký không phải phân quyền — kiểm phiên + quyền mỗi request, `exp` ngắn, không cache công khai.
- Validate lại mọi giá trị form (`name[crop]`, `name[focal]`, `assetId`, OTP, checkbox) ở server — xem §6 và các ghi chú
  dưới.

**Ghi chú v0.36.0** (plan [v0.36.0-polish](plans/v0.36.0-polish.md)):

- **`td-otp-input` chuẩn hoá input** khi gõ, dán, kéo thả, autofill (`otpNormalize` trong `src/utils/otp.js`; PHP
  `td__otp_value` cùng luật, bảng parity): chữ số → ASCII (full-width, Ả Rập), chữ → NFKC từng ký tự rồi chỉ nhận
  `[A-Za-z]` (theo `charset` / `case`), mọi ký tự khác bị bỏ; không chuẩn hoá giữa composition IME. Đây là **UX**: server
  vẫn chuẩn hoá + so mã (hoa / thường theo quy ước của server — `pattern` native nhận cả chữ thường), giới hạn số lần
  thử, hết hạn mã.
- **`td-copy for=` đọc field của kit**: `for` trỏ tới phần tử `td-*` có property `value` kiểu chuỗi (`td-input-field`,
  `td-number-input`…) → copy `host.value`; copy thất bại → chọn chữ trong control native **bên trong chính host đó**. Như
  field native, `td-copy` copy bất kỳ giá trị nào nó trỏ tới (kể cả ô mật khẩu) — site đừng trỏ `for` vào field bí mật;
  giá trị không bao giờ vào attribute / live region / `detail` của event.
- **`td-action-button` nhãn là text**: nhãn preset / `label` / host `aria-label` chỉ vào `aria-label` + `data-tooltip`
  (escape ngữ cảnh thuộc tính); không có chữ hiển thị, không hatch HTML. PHP `td_action_button()` escape cùng luật, `attrs`
  qua allowlist (`on*`, `style`, `data-td-*` bị chặn); `href` qua `Td::safeUrl` như `td_button`. Quyền của hành động là
  việc của server (nút chỉ là UI).

**Ghi chú v0.38.0 — `td-scan-input`** (plan [v0.38.0-scan-input](plans/v0.38.0-scan-input.md) QĐ 7, 9, 18, 19; trang
người dùng [scan-input.md](../components/scan-input.md#bảo-mật)):

- **Giá trị quét là input người dùng** (máy quét = bàn phím; tem in có thể chứa bất cứ thứ gì, kể cả `<b>` / `"`): chuẩn
  hoá (bỏ C0 / C1, trim, ≤ `maxlength` 128 code point, cắt cứng cả khi đang gõ) rồi chỉ vào DOM qua `textContent` /
  `setAttribute` (`data-value`, `aria-label` "Bỏ {mã}") — không `innerHTML` từ dữ liệu, không selector ghép từ mã.
- **Thông báo từ `validate` là chữ** (`textContent`, cắt 300 code point); kết quả không đúng hình (`undefined`, số,
  `valid` không phải boolean) → **không hợp lệ** (fail closed). Lỗi throw / reject **không bao giờ** được log (review
  SEC-4): chỉ một `console.error` chữ cố định; UI hiện `messages.validateFailed`; app tự log chẩn đoán đã lược bỏ.
- Trần cứng 1000 mã hợp lệ + đang chờ ở chế độ `multiple` (SEC-2, cả khi không có `max`); timer timeout của từng lần
  chờ bị huỷ khi xong / huỷ / đổi thế hệ (SEC-3). Kết quả cũ không xoá lỗi của lần quét mới hơn (SEC-1). Không hatch HTML mới (§2 không đổi).
- **Kết quả muộn bị bỏ** bằng bộ đếm thế hệ (reset / form reset / restore / gán giá trị / disconnect) — đúng cả khi
  `validate` phớt lờ `AbortSignal`; tối đa 16 lần chờ (không hàng đợi vô hạn).
- **SSR `multiple`**: cổng riêng kiểm cấu trúc + allowlist thuộc tính từng node (hidden chỉ `type` / `class` / `name` /
  `value` / `disabled`, khớp từng cặp với `li[data-value]`); lệch (hidden thừa, `formaction`, giá trị lệch) → **không lấy
  giá trị nào** từ markup (danh sách rỗng + một cảnh báo), gỡ mọi hidden / textarea khỏi form. PHP `td_scan_input` escape
  mọi giá trị, `attrs` qua allowlist (owned names + `data-td-*` giữ chỗ).
- **Âm báo** dùng Web Audio (không file, không `media-src`); không lưu gì vào storage. `validate` chạy ở trình duyệt nên
  **không phải kiểm soát bảo mật**: server chuẩn hoá + kiểm lại mọi mã khi lưu (và tự tách dòng của mục textarea không JS).

**Ghi chú v0.40.0 — `td-datetime-range`** (plan [v0.39.0-filters-range](plans/v0.39.0-filters-range.md) QĐ 17–26; trang
người dùng [datetime-range.md](../components/datetime-range.md#bảo-mật)):

- **Không hatch HTML mới**: nhãn preset (`presets[].label`, có thể từ cấu hình site), thông báo, giá trị hiển thị đều qua
  `textContent` / `setAttribute`; `data-id` của preset qua `setAttribute`. Preset `resolve` là code của site — throw / trả
  sai → preset `aria-disabled` + một `console.error` (fail closed, không áp giá trị).
- **State khôi phục** (`formStateRestoreCallback`) chỉ nhận JSON `{"v":1,"start","end"}` ≤ 512 ký tự, mỗi mốc là chuỗi
  ≤ 64; khác → bỏ. Chuỗi khôi phục đi qua cùng parser / validity như giá trị gõ tay.
- **SSR `datetime-range@1`** (bề mặt chèn markup): cổng **riêng** (cổng chung `TdFormElement` không đổi, vẫn đúng một
  control) so khớp **từng node**: `div.td-dtr` + nhãn + trigger = `render()` (thuộc tính chính xác; ô icon phải **rỗng** —
  `ssrSamePart` bỏ qua nội dung ô icon nên phải kiểm riêng), khối native = đúng 4 con (label / input × 2) với thuộc tính
  tính lại từ host (`type` theo `mode`, tên phân giải, `min` / `max`, `required` **theo mốc**, `disabled`, `aria-*` lỗi) —
  chỉ `value` được tự do và phải là giá trị native hợp lệ; đúng **3** phần tử form-associated (2 input + trigger, theo đúng
  thứ tự); host chỉ một con thêm là ghi chú lỗi khớp `error-text`. Lệch bất kỳ → render an toàn, **không** lấy giá trị từ
  ứng viên mơ hồ (mỗi mốc phải đúng một `input[data-part]`, giá trị phải parse được như ngày native). Nhận markup: state
  → FormData của host → gỡ `name` / `value` / `required` / `min` / `max` → xoá khối native (FormData không bao giờ có hai
  bộ). PHP `td_datetime_range` chuẩn hoá ngày (checkdate, giờ / phút) — giá trị sai bị bỏ, không in nguyên văn; mọi chữ
  escape; `attrs` (trên host) qua allowlist, tên của component + `data-td-*` giữ chỗ.
- Kiểm tra thứ tự / `max-days` / `required` chạy ở trình duyệt → **không phải kiểm soát bảo mật**: server kiểm lại định
  dạng, thứ tự, độ dài khoảng (truy vấn dùng prepared statement — ví dụ trên trang component).

**Ghi chú v0.48.0 — `td-color-picker`** (plan [v0.48.0-color-picker](plans/v0.48.0-color-picker.md) QĐ 1–4, 14–15, 19,
21; trang người dùng [color-picker.md](../components/color-picker.md#bảo-mật)):

- **Input màu → CSS (bề mặt CSS injection):** chuỗi gõ / dán / `value` / preset / kết quả `EyeDropper` chỉ đi qua
  `parseColorInput()` (= `parseColor()` của lõi màu — regex neo, đã fuzz ở v0.42 — + hex trần) → `toHex()`. CSSOM
  (`style.setProperty`, không `style="…"`) chỉ nhận chuỗi khớp `^#[0-9a-f]{6}$` (kiểm lại ngay trước khi ghi — `setVar()`)
  hoặc số đã kẹp 0..1; chuỗi thô của người dùng **chỉ** nằm trong `input.value` và giá trị form (`badInput`). Gradient
  vùng 2 chiều / sắc độ / ô cờ là CSS tĩnh trong `td.css` (không `data:` URI).
- **Không hatch HTML mới:** popup dựng bằng DOM API; nhãn preset (`presets[].label`, có thể từ cấu hình site) qua
  `setAttribute('aria-label' | 'title')`, chữ tương phản qua `textContent`; `data-value` của preset là hex đã kiểm.
- **SSR `color-picker@1`:** cổng chung của form (đúng **một** phần tử form-associated — ô chữ; ô màu SSR là `<span>`),
  so khớp từng node với `render()` (ô màu đúng `span.td-color__swatch[aria-hidden]` rỗng, ô chữ `type=text` + thuộc tính
  cố định + allowlist; `pattern` lần đầu chỉ được là `#[0-9a-fA-F]{6}`). Lệch (thêm `formaction`, `type=color`, input ẩn
  thứ hai, `<button>` lạ…) → render an toàn, giữ chữ đang gõ. Nút mở popup / nút xoá chỉ được tạo **sau** cổng (bước
  bind). Nhận markup: FormData của host trước → gỡ `name` / `value` / `required` / `pattern` / `title`.
- **PHP:** `td_color_value()` là điểm chuẩn hoá phía server (không phải chuỗi / > 64 ký tự → `null`; regex neo `/D`);
  `td_color_picker()` escape mọi thuộc tính, `value` không hợp lệ được giữ nguyên **đã escape** + warning, preset lỗi bị
  bỏ, `attrs` qua allowlist (tên của component + `data-td-*` giữ chỗ). Kiểm định dạng ở trình duyệt **không phải** kiểm
  soát bảo mật: server luôn gọi `td_color_value()` rồi mới lưu.
