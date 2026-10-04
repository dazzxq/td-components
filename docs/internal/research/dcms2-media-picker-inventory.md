# dcms2 media picker — kiểm kê UI + so sánh với `td-media-picker` v0.32.0

Đầu vào của plan [v0.33.0-media-picker-dcms-parity](../plans/v0.33.0-media-picker-dcms-parity.md). Viết 2026-10-04.

**Nguồn:**

- dcms2 (chỉ đọc, không sửa) `resources/js/modules/dcms-media/*.js`, `resources/js/components/dcms-modal.js`, `dcms-modal-stack.js`,
  `dcms-pagination.js`, `resources/css/dcms-media-responsive.css`. Đường dẫn bên dưới tính từ
  `dcms2/resources/js/modules/dcms-media/`, trừ khi ghi khác.
- **Render thật**: bản build `dcms2/public/build` (manifest 2026-10-03) chạy trong một harness tĩnh có `fetch` giả
  ([dcms2-media-picker/harness.html](dcms2-media-picker/harness.html) + [shoot.mjs](dcms2-media-picker/shoot.mjs)).
  Dữ liệu giả gồm 60 ảnh 1200×800 dùng lại `test/fixtures/{1..4}.svg`, nên hai bên so được cùng dữ liệu.
- Ảnh chụp ở 1440×900 và 390×844 (Chromium). Ảnh **không commit** vì là file nhị phân ~3 MB; muốn tạo lại thì chạy
  harness. Khi viết tài liệu này, ảnh nằm trong scratchpad của phiên `…/scratchpad/shots/`:

| Tên file | Nội dung |
|---|---|
| `dcms-desktop-open.png` | Mở picker, desktop |
| `dcms-desktop-selected.png` | Đã chọn một ảnh, desktop |
| `dcms-desktop-hover.png` | Hover một card, desktop |
| `dcms-desktop-multi.png` | Chế độ chọn nhiều, desktop |
| `dcms-desktop-upload.png` | Hộp tải lên, desktop |
| `dcms-desktop-url.png` | Tab tải từ URL, desktop |
| `dcms-desktop-empty.png` | Danh sách rỗng, desktop |
| `dcms-desktop-loading.png` | Đang tải, desktop |
| `dcms-mobile-*.png` | Các trạng thái tương ứng trên mobile |
| `td-desktop-{open,selected,hover}.png` | td-media-picker hiện tại, desktop |
| `td-mobile-{open,selected}.png` | td-media-picker hiện tại, mobile |
| `td-demo-media-grid.png` | Lỗi ô của lưới demo |

## A. Kiểm kê UI dcms2

### A1. Vỏ / kích thước

- **Luôn tràn toàn viewport, ở mọi kích thước màn hình.** `modal.js:117-131` gọi `DCMS.Modal.show({ fullViewport: true })`. Nhánh
  `dcms-modal.js:421-462` đặt nội dung `100vw × 100vh`, `border-radius: 0`, bỏ `max-w-*`; header và footer `flex-shrink: 0`,
  body là `flex column`, `overflow: hidden`, padding 0.
  - Không xử lý `safe-area-inset-*`.
  - Dùng `100vh` chứ không phải `dvh`, nên trên iOS footer bị thanh địa chỉ che.
- **Header** (`dcms-modal.js:101-102`): `px-6 py-4`, có `border-b`.
  - Tiêu đề `text-xl font-bold`. Nội dung theo `type`: "Chọn ảnh" / "Chọn video" / "Chọn tài liệu" (`modal.js:112-114`).
  - Bên phải có nút ×.
- **Footer** (`dcms-modal.js:114`): `px-6 py-4`, có `border-t`, nút căn phải, `gap-2`.
  - "Đóng" (secondary) và "Chèn" (primary, nền tối). Tạo ở `layout.js:585-651`.
  - "Chèn" bị disabled cho tới khi có lựa chọn. Ở chế độ nhiều, nhãn là "Chèn (n)" (`selection.js:289`).
- **Escape không đóng được** picker: `dcms-modal-stack.js:23` ghi "modals can only be closed via buttons".
- **Bố cục thân** (`layout.js:101-134`): toolbar `shrink-0` ở trên. Bên dưới là `content` (`flex`, `gap-4` khi ≥ 768):
  - danh sách bên trái `flex-1`, là vùng **duy nhất** cuộn được;
  - panel chi tiết bên phải rộng `400px` (`layout.js:493`, `dcms-media-responsive.css:53-59`).

### A2. Toolbar (`layout.js:140-458`)

Một hàng, `p-4 px-6`, `gap-4`, thứ tự từ trái sang phải:

1. **Upload**: `DCMS.Button` primary md, icon `fa-upload` (`layout.js:150-158`). Bấm vào mở hộp "Upload Media" (A7).
2. **Tìm kiếm**: `DCMS.InputField` text md, rộng `flex-1 min-w-[200px] max-w-[600px]`, placeholder "Tìm kiếm media..."
   (`layout.js:178-194`).
   - Gọi `_loadMediaList()` **ở mọi lần gõ phím**, không debounce.
   - `data-loader.js:14`: `if (this.isLoading) return;` nên lần gõ đến khi đang tải **bị bỏ**: kết quả của chữ cũ thắng.
3. **Sắp xếp**: `DCMS.Dropdown` `min-w-[150px]`, không tìm kiếm, không xoá. Các mục "Tất cả" (= Mới nhất), "Mới nhất", "Cũ nhất"
   (`layout.js:225-302`).
   - Chế độ file thêm "Chỉ PDF / DOCX / XLSX".
   - Menu bị ép `z-index: 100000` bằng `style` (`layout.js:286-302`).
4. **Trạng thái** (chỉ chế độ file): "Đang hoạt động" / "Trong thùng rác" (`layout.js:388-425`).
   **Phân loại** (chỉ chế độ file) nạp bất đồng bộ (`layout.js:427-441`, `653-724`).
5. **"Của tôi"**: `DCMS.Toggle` sm, màu xanh lá. Chỉ hiện khi user có quyền `view_all_media`. Không có quyền thì luôn bị khoá vào
   media của chính mình (`layout.js:356-386`).
6. **Phân trang** nằm ở cuối hàng, `flex-1 justify-end` (`layout.js:351-354`, `pagination.js:14-79`).
   - Dùng `PaginationSimple`: "Hiển thị 1-30 / 60 media", ‹, các số trang có "…", › (`dcms-pagination.js:77`).
   - Trang hiện tại màu đỏ `#ef4444`.
   - Ẩn khi `total ≤ perPage`. `perPage = 30` (`media-picker-state.js:24`).
   - Mỗi trang **thay** lưới, không nối thêm.

### A3. Lưới card (`grid.js`)

- **Vùng danh sách** (`layout.js:464-485`): `p-4`, nền `rgba(0,0,0,.04)`, CSS grid
  `repeat(auto-fill, minmax(200px, 1fr))`, `gap-4`.
  - Cột tối thiểu 150px khi < 768, 200px khi ≥ 768, 220px khi ≥ 1280 (`dcms-media-responsive.css:37-39`, `65-67`, `79-81`).
- **Card** (`grid.js:122-388`): `role="button"`, `tabindex=0`, `aria-label="Select {tên} - {cỡ}"`.
  - Nền trắng 72%, viền 2px trong suốt, bo `12px`, đổ bóng nhẹ (`layout.js:44-56`).
- **Thumb** khung **3:2**, `object-contain` (ảnh không bị cắt, có thể có viền thừa) trên nền `rgba(0,0,0,.04)`, `loading=lazy`.
  - Ảnh lấy `resize_urls[400]` (`grid.js:313-342`).
  - Video dùng `thumbnail_url`. File hiện icon loại file cỡ `text-5xl`.
- **Phần chữ** `p-3`, có `border-top` (`grid.js:344-359`):
  - tên: `text-sm font-medium` một dòng, cắt `…`, `title` = tên đầy đủ;
  - meta: `text-xs` xám, "123.38 KB • 03/09/2026 15:30" (`_formatDate` dạng `DD/MM/YYYY HH:mm`, `utils.js:25-32`).
  - Chế độ file có thêm chip phân loại (`grid.js:361-382`).
- **Trạng thái của card** (viền 2px):

  | Trạng thái | Viền | Nguồn |
  |---|---|---|
  | Hover | xanh dương `#3b82f6` | `grid.js:196-223` |
  | Đang xem | xanh dương | |
  | Đã chọn (nhiều) | xanh lá `#10b981` | |

  Ở chế độ nhiều, thumb của mục đã chọn bị mờ 0.7 **chỉ lúc render**. Selector cập nhật khi đổi lựa chọn
  (`selection.js:142` `div[style*="aspect-ratio"]`) không khớp class `aspect-[3/2]`, nên độ mờ không bao giờ được cập nhật.
  Đây là bug.
- **Checkbox** chỉ có ở chế độ nhiều: góc **trên-phải** cách 8px, `DCMS.Checkbox` sm (`grid.js:225-311`).
- **Click** (`grid.js:161-190`):
  - chế độ đơn: click = xem + chọn;
  - chế độ nhiều: click thường = **chỉ xem**; Ctrl/Cmd+click hoặc bấm checkbox = bật/tắt chọn;
  - Enter / Space trên card = như click, tức **không có cách chọn bằng bàn phím** ở chế độ nhiều.
- **Skeleton** (`grid.js:14-63`): 30 card, mỗi card có thumb 3:2 và 2 vạch chữ, hiệu ứng shimmer.
- **Rỗng**: chỉ một dòng chữ xám "Không có media nào" (`grid.js:72-78`).
- **Lỗi**: lưới trống + toast "Không thể tải danh sách media" (`data-loader.js:137-143`). Không có nút thử lại.

### A4. Panel chi tiết (`layout.js:491-579`, `preview.js:83-889`)

- **Rỗng**: icon ảnh, "Chọn một ảnh để xem chi tiết", "Click vào ảnh trong danh sách bên trái" (`layout.js:501-509`).
  Trên thực tế gần như không bao giờ thấy, vì picker tự chọn mục đầu (A9).
- **Đang tải**: skeleton gồm ảnh 3:2, tên, ô alt, ô caption, info (`layout.js:529-579`).
- **Nội dung**, theo thứ tự trên xuống:
  1. **Khung xem trước vuông 1:1** (`padding-bottom: 100%`), `object-fit: contain` trên nền xám nhạt (`preview.js:120-130`).
     - Ảnh dùng `resize_urls[1200→800→400→original]`. Lỗi tải thì thử URL gốc, vẫn lỗi thì hiện "Không thể tải ảnh"
       (`preview.js:133-170`).
     - Video dùng `<video controls>`. PDF dùng iframe `/files/{id}/preview` (`preview.js:182-247`).
  2. "TÊN FILE": nhãn `text-xs font-semibold uppercase` xám, rồi giá trị `text-sm` (`preview.js:251-258`).
  3. "ALT TEXT": `InputField` sm. **Enter = Lưu** (`preview.js:260-298`).
  4. "CAPTION": textarea 3 dòng. **Ctrl/Cmd+Enter = Lưu** (`preview.js:300-337`).
  5. Đường kẻ, rồi các dòng info `text-xs` dạng "Nhãn: giá trị" (`preview.js:340-388`, dựng bằng `textContent`):
     - "Kích thước", "Độ phân giải W × Hpx";
     - riêng video: "Thời lượng", "Video Codec", "Audio Codec", "MIME Type";
     - "Upload" (ngày), "Bởi".
  6. Đường kẻ, rồi hàng nút **căn phải**, theo thứ tự:
     - "Copy" (secondary sm, `fa-copy`): copy link bản gốc / CDN (`preview.js:1469-1530`);
     - "Xóa" (danger sm, `fa-trash`): chỉ hiện khi `canDeleteMedia()` (`preview.js:418-445`);
     - "Lưu" (success sm, `fa-save`): **luôn bật**, kể cả khi chưa sửa gì (`preview.js:447-466`).
- **Chế độ file** (`preview.js:481-870`): các ô Tiêu đề / Mô tả / Công khai / Cho phép xem trước / Phân loại.
  Hàng nút gồm "Tải về" (primary, `window.open(media.url)`), "Lưu" (chỉ bật khi có thay đổi), "Xóa", hoặc chỉ
  "Khôi phục" nếu file đang ở thùng rác.
- Chọn mục khác khi đang sửa dở: **mất im lặng** (`selection.js:32-36` xoá `pendingChanges`).

### A5. Xoá / tải về

- **Xoá ảnh / video** (`preview.js:1535-1622`):
  1. `Modal.confirm`: "Xác nhận xóa". Nội dung `messageHtml` có tên file đã escape, ví dụ "…xóa ảnh "**tên**"? … xóa khỏi
     database và cả trên S3, không thể hoàn tác.", nút "Xóa" (danger) / "Hủy".
  2. `Modal.loading('Đang xóa media...')`.
  3. Gọi `DELETE /media/{id}` qua `fetchWith2FA`.
  4. Toast "Đã xóa {loại} thành công". Bỏ mục khỏi selection, nạp lại trang hiện tại. Panel chi tiết về trạng thái rỗng.
  - **Không kiểm tra usage**: xoá cứng.
- **Xoá file** (`preview.js:896-950`): xoá mềm ("có thể khôi phục trong 30 ngày"). Sau khi xoá, **tự chọn
  `mediaList[0]`**.
- **Tải về**: chỉ có ở chế độ file, `window.open(media.url, '_blank', 'noopener,noreferrer')` (`preview.js:836-845`).

### A6. Lưu metadata

`_saveMediaFields` (`preview.js:1348-1460`):

- Nút chuyển sang "Đang lưu..." trong lúc lưu.
- Toast "Đã lưu thay đổi" khi xong, toast lỗi `error.message` khi hỏng.
- Không có token / version, nên lưu chồng được lên bản người khác vừa sửa.

### A7. Hộp "Upload Media" (`upload.js:33-536`)

- Là **modal md lồng** trên picker, tiêu đề "Upload Media", footer chỉ có "Đóng" (`upload.js:520-535`).
- **Hai tab** `DCMS.Tabs` dạng segmented, nền xám, tab đang chọn nền trắng (`upload.js:75-162`):
  - "Upload file" (`fa-upload`);
  - "Upload từ URL" (`fa-link`). Tab này **bị ẩn ở chế độ file**.
- **Tab file** (`upload.js:169-411`): dropzone viền đứt 2px, bo `rounded-2xl`, `py-16 px-8`. Bên trong:
  - icon SVG upload 64px, "Kéo thả file vào đây" (`1.25rem/600`), "hoặc click để chọn file";
  - 2 badge: định dạng ("JPG, JPEG, PNG, GIF, WEBP") và "Tối đa 20MB";
  - `multiple`. Chế độ file thêm toggle "Công khai" và dropdown phân loại.
- **Khi chọn file** (`upload.js:640-810`):
  1. Lọc loại + kích thước ở client.
  2. **Đóng hộp upload**, mở modal "Uploading files..." **không đóng được, không có nút huỷ** (`upload.js:1099-1193`). Mỗi file
     có tên, cỡ, trạng thái "Waiting / x% / Completed / Failed" và thanh tiến độ 3px.
  3. Tải theo lô 5 file song song.
  4. Toast "Đã upload thành công n/m file", nạp lại danh sách, **chọn file vừa tải lên cuối cùng** (`upload.js:786-798`).
     Lỗi gom thành một toast.
- **Tab URL** (`upload.js:413-505`, `538-634`):
  - **Mô tả**: "Nhập URL ảnh để upload trực tiếp. Hỗ trợ: {định dạng}".
  - **Ô nhập**: `InputField` text md, placeholder `https://example.com/image.jpg`.
  - **Kiểm tra khi gõ**: `new URL()` và chỉ nhận `http:` / `https:` (`upload.js:541-548`). Sai thì hiện chữ đỏ "URL không hợp
    lệ" dưới ô; nút "Upload" bị disabled cho tới khi hợp lệ.
  - **Gửi**: bấm nút hoặc **Enter trong ô**.
  - **Video**: chặn ở client, báo "Upload video từ URL chưa được hỗ trợ…" (`upload.js:557-565`).
  - **Request**: `POST /media/upload` với `{ url, type }` (`upload.js:584-587`). Nút ở trạng thái loading trong lúc chờ.
    **Không xem trước** URL, **không có nút huỷ**.
  - **Thành công**:
    1. Đóng hộp upload.
    2. Toast "Upload từ URL thành công!".
    3. Nạp lại danh sách.
    4. Sau 500 ms, chọn asset mới (`upload.js:597-617`).
  - **Lỗi**: hiện `error.raw.error.message || error.message` vừa ở dòng đỏ dưới ô vừa trong toast (`upload.js:619-633`). Đây
    có thể là chuỗi thô của server.
  - **SSRF**: client không làm gì. Toàn bộ là việc của server (`MediaController`), nằm ngoài phạm vi kiểm kê này.

### A8. Mobile (< 768px, `responsive.js`, `dcms-media-responsive.css`)

- Vẫn full viewport.
- **Toolbar** đổi sang `flex-direction: column`, nhưng hàng con bên trong vẫn là `flex` ngang. Ở 390px, ô tìm kiếm và dropdown
  **tràn ngang bị cắt** (ảnh `dcms-mobile-selected.png`: "Tấ…").
- **Lưới**: 2 cột (tối thiểu 150px).
- **Panel chi tiết** là `position: fixed`, `width: 100%`, `max-width: 400px`, trượt vào từ phải (`translateX`), `z-index: 100`.
  Khi chọn một mục thì nó tự mở (`selection.js:82-85`). Vấn đề:
  - **Không có nút đóng hoặc quay lại**. Panel cũng che luôn header (nút ×) và lưới (ảnh `dcms-mobile-open.png`).
    Vì picker tự chọn mục đầu ngay khi mở (A9), trên điện thoại người dùng **mở picker ra là kẹt ở panel chi tiết**.
  - Footer "Đóng / Chèn" vẫn nằm bên dưới panel.
  - Chỉ việc resize lên ≥ 768 mới gỡ được panel.

### A9. Bàn phím + hành vi chung

- **Enter toàn cục = Chèn** (`keyboard.js:15-41`): listener ở capture phase trên `document`, bỏ qua khi focus đang ở
  input / textarea.
- **Tự chọn mục đầu** sau **mỗi** lần nạp danh sách (`data-loader.js:115-127`). Hệ quả: nút "Chèn" bật sẵn, và trên mobile panel
  chi tiết che kín lưới.
- **Tỉ lệ ảnh**: theo `context`, ví dụ `post-avatar-thumb` = 3:2 (`modal.js:42-67`).
  - `validateRatio`: chọn sai tỉ lệ thì bị từ chối kèm toast (`selection.js:15-30`).
  - `allowCrop`: khi bấm "Chèn" thì mở CropperJS (`crop.js`), **tạo ra file mới** theo context.
- **Thông báo**: dùng toast cho mọi việc (lưu, xoá, upload, copy, lỗi). Không có live region riêng.

## B. So sánh với `td-media-picker` hiện tại (v0.32.0)

Ảnh: `td-desktop-*.png`, `td-mobile-*.png`. Code `src/feedback/td-media-picker.js`, CSS `src/styles/components/media-picker.css`.

| # | Hạng mục | dcms2 | td v0.32 | Hướng xử lý |
|---|---|---|---|---|
| 1 | Kích thước | Full viewport mọi cỡ | `td-modal--5xl`, cao `min(90dvh, 52rem)`; ≤ 640px là bottom sheet 90dvh, bo góc (`td-media-picker.js:376`, `media-picker.css:13, 460-462`) | Đổi sang full viewport; `.td-modal--viewport` đã có (`modal.css:266-285`) |
| 2 | Tiêu đề | "Chọn ảnh / video / tài liệu" theo loại | "Thư viện media" | Mặc định theo `selection.kinds` |
| 3 | Nút footer | "Đóng" + "Chèn" / "Chèn (n)", căn phải | Khay thumb 40px ở bên trái + "Huỷ" + "Chọn (n)" | Theo dcms2; khay thu gọn còn số đếm (xem plan) |
| 4 | Thứ tự toolbar | Upload · tìm · sắp xếp · facet · "Của tôi" · phân trang (bên phải), một hàng | Ô tìm full-width ở hàng 1; facet có nhãn ở trên ở hàng 2; "Tải lên" secondary sm ở hàng 3 | Theo dcms2 |
| 5 | Ô tìm kiếm | `InputField` md đã style | `<input type=search class="td-field__control">` **trần, gần như không có style** (ảnh `td-desktop-open.png`; class `__control` nằm ngoài `.td-field`) | Dùng `td-input-field`. Đây là **bug** v0.32 |
| 6 | Nút | `DCMS.Button` | `<button class="td-btn …">` viết tay ở 15 chỗ | Dùng `td-button` |
| 7 | Facet | Dropdown gọn **không nhãn** (placeholder), toggle inline | Nhãn ở trên control | Gọn, inline, có `aria-label` |
| 8 | Phân trang | Số trang + "Hiển thị a-b / total" | Nút "Tải thêm", nối vào lưới (cursor) | Có 2 chế độ (xem plan) |
| 9 | Card | Thumb 3:2 **contain** + phần chữ (tên, "cỡ • ngày"), viền 2px, bo 12px | Ô **vuông, cover**, chỉ có tên dưới ô, tick tròn **trên-trái** luôn hiện | Card theo dcms2 |
| 10 | Đánh dấu trạng thái | Hover / đang xem: xanh dương; đã chọn: xanh lá | Đã chọn: thu nhỏ 0.88 + nền; đang xem: không có dấu riêng | Viền theo token (A3) |
| 11 | Click ở chế độ nhiều | Click = xem; checkbox / Ctrl+click = chọn | Lưới rỗng thì click = chọn + xem; lưới đang chọn thì click = bật/tắt (`td-media-grid`) | Theo dcms2: cần `select-mode="tick"` ở `td-media-grid` |
| 12 | Cột lưới | 200 / 220 / 150px | `9rem` (144px); `6.5rem` khi ≤ 640 | Theo dcms2 |
| 13 | Panel chi tiết | Rộng 400px; xem trước 1:1 contain; luôn có form inline + Copy / Xoá / Lưu | Rộng 20rem; xem trước theo tỉ lệ ảnh; bảng info dạng `dl`; "Sửa thông tin" → mở form riêng | 25rem; form inline; hàng nút theo dcms2 |
| 14 | Upload | Modal lồng, 2 tab (file / URL) | Panel inline hiện bằng toggle trên lưới; `td-dropzone` mặc định; không có URL | Dialog lồng + `td-tabs` + URL (adapter tuỳ chọn) |
| 15 | Tiến độ upload | Modal riêng không huỷ được | Từng dòng trong `td-dropzone`, **huỷ được** | Giữ cái của kit (tốt hơn) trong dialog lồng |
| 16 | Xoá / tải về | Có (xoá cứng / mềm, `window.open`) | Chưa có UI (v0.32.1) | Gộp vào v0.33 |
| 17 | Copy link | Có | Không | Tuỳ chọn qua capability (xem plan) |
| 18 | Rỗng / lỗi | "Không có media nào"; lỗi = toast, lưới trống | `td-empty-state` + lỗi inline + "Thử lại" | Giữ phần tốt hơn của kit, làm gọn |
| 19 | Mobile | Toolbar tràn; panel chi tiết che kín, không lối ra | Bottom sheet + view chi tiết có "← Quay lại" | Full viewport + chi tiết trượt từ phải **có** Quay lại |
| 20 | Escape | Không đóng | Đóng (cổng kết thúc) | Giữ (ADR 0006 / 0013) |
| 21 | Thông báo | Toast | Live region + chữ inline | Thêm `TdToast` cho thành công tức thời; lỗi cần hành động vẫn inline |
| 22 | Breakpoint | 768px | 640px | 768px |

### B2. Lỗi riêng của `td-media-grid` (owner thấy trên demo)

Đo ở 1440px trên `#demo-media-grid` (ảnh `td-demo-media-grid.png`):

- **Ảnh không lấp đầy ô.** Ô rộng 188px nhưng ảnh chỉ rộng 160px, để thừa 28px bên phải.
  - Nguyên nhân: `.demo-mg-img { width: 160px }` (`demo.css:62`) không thuộc layer nào, nên thắng
    `.td-media-grid__open img { width: 100% }` vốn nằm trong `@layer td.component` (`media-grid.css:66-72`).
  - Nói cách khác, **kit không quản kích thước ảnh**, nên mọi CSS của site đều làm hỏng được ô.
- **Nền / vòng đã chọn rộng hơn ảnh.** `[data-selected]` tô nền cả ô; `__open` thu nhỏ còn 0.88 (`media-grid.css:45-47`, `79-81`).
- **Khe không đều.** Phép thu 0.88 và phần ảnh thiếu chiều ngang làm khe nhìn thấy giữa các ảnh lệch nhau.
- **Tiền lệ dwp** (chỉ đọc): `dwp/engine/dwp-members/src/Photos/PhotosSurface.php`.
  - **Xếp dòng** `pack_rows()` (L1735-1790): tham lam theo Σ tỉ lệ ≈ đích 5.5; tỉ lệ kẹp trong [0.2, 5]; **không giới hạn số
    ảnh / dòng** (GOTCHAS §17.1).
  - **Bề rộng** `rows_markup()` (L1792-1890): mỗi ô rộng `calc(P% − phần khe px)`, `aspect-ratio: P / (100/Σ)`. Phần làm tròn
    dư dồn vào ô cuối, nên mỗi dòng đúng 100%.
  - **Dòng cuối thiếu** thì giữ chiều cao đích và để trống bên phải.
  - **Tuân thủ CSP** bằng class sinh vào khối `<style>` có nonce. Kit không chèn `<style>` được, nên sẽ dùng CSSOM
    custom property thay thế.

## C. Những gì giữ nguyên lập trường từ chối (ADR 0013 / plan v0.32 "Tránh")

Owner muốn "giống hệt" dcms2, nhưng các điểm sau **không** sao chép. Plan v0.33 nói rõ lý do từng điểm:

- **Tự chọn mục đầu** (A9): làm nút Chèn bật sẵn và kẹt màn hình trên mobile.
- **Enter toàn cục = Chèn** (A9).
- **Lưu tự động khi xem trước**: dcms2 lưu bằng Enter trong ô alt; kit giữ Enter trong ô **một dòng** = Lưu nhưng chỉ trong
  phạm vi ô đó, không toàn cục. Không bao giờ tự lưu.
- **Xoá cứng không hỏi usage**: kit gọi `adapter.delete`, **server** quyết `blocked`.
- **URL làm giá trị form**: danh tính luôn là `assetId`.
- **Request đang tải bị bỏ / kết quả cũ thắng**, **không debounce**.
- **Chi tiết không có token**, **sửa dở mất im lặng**.
- **Hiện chuỗi lỗi thô** (`error.message`).
- **Modal tiến độ không huỷ được.**
- **Crop tạo file mới.**
- **`<style>` chèn lúc chạy**, **`style.cssText`**, **z-index 100000**, **`innerHTML` / `messageHtml` có nội suy**.
- **Không đóng được bằng Escape.**
- **Panel chi tiết trên mobile không có lối ra.**
