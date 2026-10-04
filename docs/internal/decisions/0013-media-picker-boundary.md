# ADR 0013 — Media picker: ranh giới kit / app, hợp đồng adapter, hình dạng form của media field

Trạng thái: chấp nhận (2026-10-04). Nguồn: đồng thuận Claude × Codex 2026-10-04 (think-about, gpt-5.6-sol high, 2 vòng,
CONSENSUS) + hợp đồng dsuite `dsuite/docs/research/17-codex-media-picker-r2.md` §1-3; plan
[v0.32.0-media-picker](../plans/v0.32.0-media-picker.md) quyết định 1-4, 6, 24.

## Bối cảnh

dsuite (dienthoaihay), 135 và dwp đều cần chọn ảnh / video / file từ thư viện media của chính site: hộp thoại có tìm
kiếm, bộ lọc, lưới, xem chi tiết, chọn một / nhiều, tải lên, sửa thông tin ảnh — và một ô form "ảnh đại diện" đặt vào
trang sửa bài / sản phẩm. Mỗi site có backend khác hẳn nhau: endpoint, envelope JSON, CSRF / 2FA, quyền, album / brand /
tag, lưu trữ R2 / S3 / đĩa, URL ký, dedup SHA-256, bảng `media_usages`.

dcms2 có `window.DCMS.MediaPicker` (13 mixin) + `MediaPickerPlaceholder`, nhưng gắn chặt vào backend dcms: dò 4 kiểu
envelope, URL làm giá trị form, `innerHTML` có nội suy, `<style>` chèn lúc chạy, Enter toàn cục = Chèn, kết quả request
cũ thắng, tự chọn mục đầu. Roadmap ghi "Không làm — dcms: … media-picker …" và ADR 0007 ghi "Không port phần CMS-riêng
(… media-picker …)". Hai dòng đó nói về việc **port module dcms2** — chúng không trả lời câu hỏi "kit có nên có một
picker viết sạch theo hợp đồng adapter hay không".

Nếu mỗi site tự viết picker, phần khó và giống nhau (vòng đời dialog / bottom sheet, latest-wins + abort, bàn phím /
focus, chọn nhiều giữ qua trang, hàng đợi upload có huỷ, form metadata, render text an toàn, CSP) bị viết lại ba lần,
mỗi lần một bộ lỗi.

## Quyết định

1. **Kit sở hữu vỏ tương tác tái dùng; app sở hữu mọi thứ về dữ liệu, quyền và lưu trữ.**

   | Kit (`td-media-picker`, `td-media-field`) | App (adapter + server của site) |
   |---|---|
   | Vòng đời dialog / bottom sheet, focus, Escape, khoá cuộn | Endpoint, envelope, map DTO → `MediaAsset` |
   | Tìm kiếm (debounce), facet, phân trang cursor | Auth, CSRF, 2FA / xác thực lại, quyền, audit |
   | Trạng thái tải / rỗng / lỗi / thử lại; latest-wins + abort | Chuẩn hoá lỗi thành `MediaAdapterError` (`code`, `userMessage`, `fieldErrors`) |
   | Lưới + chi tiết, chọn đơn / nhiều + `maxItems` | Album / brand / tag / quyền ảnh (đưa vào qua facet + descriptor) |
   | Hàng đợi upload (tiến độ, huỷ) | Xử lý upload an toàn: magic byte, re-encode, giới hạn kích thước, SHA-256 dedup |
   | Form metadata dựng từ descriptor; hiện lỗi field | Lưu trữ, URL ký, CDN, `media_usages`, chèn vào nội dung |
   | Bàn phím, trợ năng, responsive, nhãn i18n, render text an toàn | Validate lại mọi thứ ở server (giá trị form, quyền, upload) |

   **Adapter là object callback** (`list`, `get` bắt buộc; `facets`, `upload`, `update`, `delete`, `download` tuỳ chọn),
   **không bao giờ** là chuỗi endpoint. Kit không diễn giải HTTP status, không nối URL, không dò envelope.

2. **Capability chỉ là gợi ý trình bày, không phải quyền.** Một action hiện ra khi **có method + cờ capability
   top-level bật + cờ per-asset không thu hẹp** (per-asset chỉ được tắt, không được bật). Mọi lời gọi adapter vẫn phải
   được server kiểm quyền. Lọc file phía trình duyệt (`accept`, kích thước) chỉ là UX.

3. **Danh tính = `assetId`** (chuỗi opaque do app cấp). URL (`urls.thumbnail` / `urls.preview`, `preview-src` của
   field) chỉ để hiển thị, không bao giờ là giá trị form hay danh tính, và luôn qua cổng URL `safeMediaUrl`. Picker
   **không bao giờ** sửa nội dung host hay tạo usage — chỉ trả `SelectedMedia[]`; app quyết định làm gì với nó.

4. **Supersede dòng "Không làm … media-picker" của roadmap.** `td-media-picker` / `td-media-field` là **bản viết sạch**
   theo hợp đồng adapter, không phải port module dcms2 (chỉ lấy ý tưởng UX của `MediaPickerPlaceholder`, ghi nguồn trong
   plan). ADR 0007 **vẫn giữ nguyên**: dcms2 đứng độc lập, không sync hai chiều; nếu dcms2 muốn dùng kit thì **shim
   tương thích nằm ở dcms2**, kit không có code nào biết tới `window.DCMS`. Bullet "Không port phần CMS-riêng" của
   ADR 0007 tiếp tục đúng nghĩa đen (không port code dcms2); ADR này chỉ thu hẹp cách đọc nó cho media-picker.

5. **`TdMediaPicker.configureDefaults({ adapter, capabilities, assetFields, uploadFields, messages, context, upload,
   pageSize })`** — registry cấp module (tiền lệ icon registry ADR 0010), không biến `window`. Mỗi lần gọi **thay thế
   toàn bộ** object mặc định (một lần trong bootstrap của site; dễ đoán hơn merge). `adapter` thiếu `list` / `get` →
   `TypeError`, giữ mặc định cũ. `TdMediaPicker.defaults` = bản sao nông. Thứ tự resolve **lúc mở**: tham số `open()` >
   `field.pickerOptions` > `field.adapter` > defaults (merge nông theo key, `undefined` không ghi đè); `selection` luôn
   do người gọi / field quyết, không bao giờ lấy từ defaults. Không registry nhiều backend (YAGNI).

6. **Hình dạng FormData của `<td-media-field>` là API công khai, chốt cuối từ v0.32.**
   - **Reference** (mặc định): `name=<assetId>`; rỗng → `name=` (server phân biệt "xoá").
   - **Usage** (thuộc tính `usage`): luôn đủ ba mục `name[id]`, `name[alt]`, `name[crop]`; `crop` = JSON
     `{"v":1,"x":…,"y":…,"width":…,"height":…}` chuẩn hoá 0..1, hoặc chuỗi `null`.
   - `name` kết thúc bằng `[]` ở chế độ usage → không gửi + cảnh báo (fail closed; JS và PHP giống nhau).
   - PHP `td_media_field()` in hidden input cho đúng hình dạng này khi chưa có JS; sau nâng cấp FormData giống từng
     byte.
   - v0.35 (`td-cropper`; ban đầu ghi v0.33, lùi theo [Bổ sung v0.33](#bổ-sung-v033)) **chỉ thêm UI sửa crop**; không
     đổi tên mục, không đổi định dạng JSON (`v` tăng chỉ khi có ADR mới).

   Hợp đồng adapter (typedef trong `src/utils/media-picker-core.js`, đúng tên / trường dsuite §2-3, cộng phần bổ sung
   additive của v0.32: `MediaListRequest.kinds`, `selection.kinds`, `title`, `pageSize`, `upload`) cũng **chốt cuối từ
   v0.32**: v0.32.1 chỉ thêm *consumer* cho `delete` / `download` đã có trong interface, không đổi chữ ký hay union.

## Hệ quả

- Site viết **một adapter** (vài chục dòng `fetch`) cho backend của mình; mọi phần tương tác dùng chung. Ví dụ adapter
  ở [docs/components/media-picker.md](../../components/media-picker.md) là code của app, không phải API kit.
- Bảo mật tách rõ: kit bảo đảm render text an toàn, URL qua allowlist scheme, không `style` / `<style>` / handler inline,
  chỉ hiện `userMessage`; server bảo đảm quyền, validate upload, validate giá trị form (`assetId` có tồn tại và được
  phép dùng không). Xem [security-model.md](../security-model.md) mục Media picker.
- Đổi hình dạng FormData hay chữ ký adapter về sau = breaking change → phải có ADR mới + ghi `docs/upgrading`.
- dcms2 không bị ảnh hưởng; không có nghĩa vụ đồng bộ.
- Không có cache liên phiên, không localStorage, không nhiều backend trên một trang; khi một site thật sự cần, mở ADR mới.

## Bổ sung v0.33

Ngày 2026-10-04. Nguồn: plan [v0.33.0-media-picker-dcms-parity](../plans/v0.33.0-media-picker-dcms-parity.md) quyết
định 1, 3, 13, 20-27, 40; kiểm kê [research/dcms2-media-picker-inventory](../research/dcms2-media-picker-inventory.md).

Mục này **chỉ thêm**, không thay quyết định nào ở trên, nên ghi ngay trong ADR này thay vì viết ADR mới. Mọi phần thêm
vào hợp đồng đều **tuỳ chọn** và **không đổi chữ ký** nào: adapter v0.32 chạy y nguyên, không phải sửa dòng nào.

### Hợp đồng: phần thêm

| Phần thêm | Kiểu | Mặc định / ghi chú |
|---|---|---|
| `adapter.uploadFromUrl?(url, o)` | `(url: string, o: { fields: Record<string, unknown>, context?: unknown, signal: AbortSignal, onProgress?(p: UploadProgress): void }) => Promise<UploadResult>` | Tuỳ chọn. Kết quả kiểm bằng **cùng** bộ kiểm với `upload` (`created`, hoặc `exact-reused` với `matchedAssetId === asset.id`). `url` là `href` đã chuẩn hoá |
| `capabilities.uploadFromUrl` | `boolean` | Suy ra bằng `!!adapter.uploadFromUrl`; site đặt `false` để ẩn tab "Tải từ URL" |
| `capabilities.copyLink` | `boolean` | **`false`**. Bật thì chi tiết có nút copy link hiển thị |
| `OpenMediaPickerOptions.pagination` | `'cursor' \| 'pages'` | `'cursor'` (hợp đồng dsuite). Đặt được qua `configureDefaults` |
| `MediaListRequest.page?` | số nguyên ≥ 1 | Chỉ gửi ở chế độ `'pages'`, kèm `cursor: null`. Chế độ này **bắt buộc** `MediaPage.total`; thiếu / sai → cảnh báo một lần, quay về giao diện cursor |
| `pageSize` | số | Mặc định đổi **40 → 30** (như dcms2). Chỉ là giá trị mặc định, không đổi chữ ký |
| `upload.acceptLabel?` | `string` | Chỉ là chữ hiển thị trên badge định dạng, **không** phải bộ lọc |

`delete` / `download` đã có trong interface từ v0.32 (`DeleteResult`, `DownloadResult` chốt từ v0.32); v0.33 thêm
*consumer* cho chúng (phần v0.32.1 gộp vào), không đổi chữ ký hay union. Typedef ở `src/utils/media-picker-core.js`
cập nhật tương ứng.

### Trách nhiệm (bổ sung bảng ở quyết định 1)

1. **Tải từ URL: server sở hữu việc tải từ xa và chống SSRF.** Kiểm URL ở client (`validateRemoteUrl`: độ dài ≤ 2048,
   `http:` / `https:`, không thông tin đăng nhập, có hostname) **chỉ là UX**. Kit cố ý **không** chặn host nội bộ / IP
   riêng ở client (DNS rebinding và redirect vượt qua được, chỉ tạo cảm giác an toàn giả) và **không** xem trước URL ở
   client (lộ IP người dùng tới host tuỳ ý; CSP `img-src` của site cũng chặn). Kit không bảo đảm điều nào dưới đây;
   server phải:
   - **chặn SSRF**: resolve DNS **một lần** và kết nối tới đúng IP đã kiểm; chặn loopback, mạng riêng, link-local,
     `169.254.169.254` / metadata, IPv6 ULA / mapped, `0.0.0.0`; kiểm lại ở **mỗi** redirect, tối đa 3 redirect;
   - chỉ nhận `http` / `https` và cổng 80 / 443, trừ khi site cho phép rõ ràng;
   - timeout kết nối và đọc; đọc theo luồng với trần kích thước (dừng khi vượt, không tin `Content-Length`);
   - kiểm magic byte, re-encode, áp cùng giới hạn loại / kích thước như upload file; dedup SHA-256 như upload;
   - kiểm quyền, CSRF, rate limit, audit;
   - không dội lại cho người dùng body hay chuỗi lỗi của host từ xa (chỉ `userMessage` đã soạn).

   Kit không có logic theo loại media cho URL: server muốn chặn (ví dụ video) thì trả lỗi `validation`.
2. **Xoá: kit không bao giờ tự kiểm usage.** Kit chỉ hỏi lại người dùng (`TdModal.confirm`, message dạng text) rồi gọi
   `adapter.delete`. Server của site quyết định có xoá hay không và trả `{ status: 'blocked', reason: 'in-use', … }` khi
   asset đang được dùng. **Không có `delete` an toàn nếu server không kiểm usage + quyền.** Usage chặn xoá render dạng
   text; `href` của usage chỉ thành link khi qua `safeLinkUrl`.
3. **Tải về: xử lý `DownloadResult`.** Nhánh `{ url }` qua `safeMediaUrl` (từ chối `blob:` / `data:` / `javascript:`),
   tải bằng `<a download>` tạm, khác origin thì `target="_blank"`, không bao giờ điều hướng trang hiện tại; `expiresAt`
   đã qua → lỗi. Nhánh `{ blob }` bắt buộc `instanceof Blob`, **chỉ tải về, không bao giờ mở** trong tab (blob
   `text/html` mở ra sẽ chạy dưới origin của site); object URL thu hồi ngay sau khi tải và khi đóng picker. `filename`
   được làm sạch (≤ 200 ký tự, bỏ `/ \ :` và ký tự điều khiển).
4. **Copy link** (`copyLink`) copy URL **hiển thị** (`urls.preview` sau `safeMediaUrl`, dạng tuyệt đối), không phải danh
   tính (quyết định 3 giữ nguyên). URL ký có hạn thì site đừng bật capability này.

### Đính chính

- Quyết định 6: dòng "v0.33 (`td-cropper`)" nay là **v0.35** (v0.34 dành cho bản responsive toàn kit). Nội dung cam kết
  giữ nguyên: chỉ thêm UI sửa crop, FormData `name[crop]` không đổi.
- Đồng thuận với dsuite (`17-codex-media-picker-r2.md`) từng **bỏ** tab tải từ URL. Từ v0.33, tải từ URL là **khả năng
  tuỳ chọn của adapter**: không có `uploadFromUrl` thì tab không bao giờ hiện, nên dsuite **vẫn được phép không làm** và
  không phải sửa gì.

## Bổ sung v0.35

Ngày 2026-10-04. Nguồn: plan [v0.35.0-cropper](../plans/v0.35.0-cropper.md) quyết định 23-31; cropper ở
[ADR 0015](0015-td-cropper.md).

Mục này **chỉ thêm**, không đổi mặc định nào: site không bật option mới thì FormData, kết quả picker và hành vi field giữ
nguyên từng byte như v0.34.

1. **`OpenMediaPickerOptions.crop` chạy thật, typedef không đổi** — `{ enabled, aspectRatio?, allowFocalPoint? }`, không
   thêm key (key lạ như `minWidth` bị bỏ qua). `enabled: true` + chế độ đơn + asset `kind === 'image'` ⇒ "Chèn" mở bước cắt
   (hộp thoại lồng, sau cổng "bỏ thay đổi"); "Quay lại" về picker giữ lựa chọn. `usage.crop` (`CropValue`, toàn ảnh →
   `null`) + `usage.focalPoint` (chỉ khi `allowFocalPoint`) — hình dạng `UsageDraft` không đổi. Chọn nhiều + crop → cảnh
   báo một lần, bỏ crop; `aspectRatio` ngoài `[0.01, 100]` (review R1 #5: khoảng công khai chung cho picker / field `crop-ratio` / PHP `crop_ratio` / `<td-cropper aspect-ratio>`) → từ chối + cảnh báo một lần, tự do. `buildOutcome(model, usageById?)`
   thêm tham số tuỳ chọn. QĐ 3 giữ nguyên: picker không sửa host, không tạo file.
2. **`urls.preview` phải là ảnh nguyên, không cắt sẵn khi bật crop** (bất kỳ cỡ) — bổ sung vào hợp đồng adapter. Có
   `width/height` thì kết quả có `pixels` và preview lệch tỉ lệ > 1 % ⇒ bước cắt lỗi, "Chèn" khoá (fail closed). Field có
   adapter lấy nguồn hộp cắt từ `adapter.get()` (`urls.preview`), không từ `preview-src`; không adapter thì `preview-src` /
   PHP `preview_src` phải là ảnh nguyên.
3. **`name[focal]` = mục thứ tư, opt-in** (thuộc tính `focal-point` / PHP `focal_point`, chỉ ở chế độ usage): JSON
   `{"v":1,"x":…,"y":…}` (0..1 theo toàn ảnh, khoá đúng `v,x,y`, ≤ 128 ký tự) hoặc chuỗi `null`; thứ tự mục id, alt, crop,
   focal. Không `focal-point` ⇒ đúng ba mục như QĐ 6. Không nhét focal vào crop JSON vì `parseCrop` (JS + PHP) từ chối khoá
   lạ — đổi sẽ là breaking với server đã validate theo docs; không chỉ trả qua JS vì site PHP thuần / không JS cũng phải
   gửi được. State khôi phục thêm khoá `focal` (additive, state cũ thiếu vẫn đọc được).
4. **`name[crop]` không đổi** (QĐ 6 giữ nguyên): tên, JSON v1, `null`, gửi lại đúng từng byte khi chưa sửa. Chỉ crop do UI
   cắt tạo ra đi qua `serializeCrop()` (6 chữ số); `setSelection()` / thuộc tính giữ ngữ nghĩa v0.34.
5. **Field `croppable`** (+ `crop-ratio`, `focal`): nút "Cắt ảnh"; field **luôn** đặt `crop` ở tham số `open()` (ưu tiên
   cao nhất) — không `croppable` ⇒ `{ enabled: false }`, nên `configureDefaults({ crop })` không bao giờ đổi hành vi field
   cũ. Getter `selection` trả `focalPoint` thật khi có `focal-point` (v0.34 luôn `null`).
