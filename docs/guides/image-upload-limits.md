[Tài liệu](../README.md) › Hướng dẫn › Giới hạn khi upload ảnh

# Giới hạn khi upload ảnh: thu nhỏ ngay trong trình duyệt (0.90.0)

> **Phía trình duyệt chỉ để tiết kiệm băng thông và đỡ làm phiền người dùng. Server vẫn là ranh giới tin cậy.**
> Người dùng (hoặc kẻ tấn công) bỏ qua JavaScript được, gửi thẳng file gốc 30 MB hoặc một file không phải ảnh. Mọi
> trần bạn đặt ở `imageResize` **phải có trần tương ứng, rộng hơn hoặc bằng, ở server**.

Trang này cho người viết site (dsuite, dwp, 135…): khi nào nên bật `imageResize`, các policy mẫu, trần phía server cần
đi kèm, giới hạn của trình duyệt và cách viết hook `processor`. Bảng key đầy đủ nằm ở
[Dropzone › mục 7](../components/dropzone.md#7-tối-ưu-ảnh-trước-khi-upload--imageresize-0900); riêng
[media picker](../components/media-picker.md#tối-ưu-ảnh-trước-khi-upload--uploadimageresize-0900) dùng key `upload.imageResize`.

## Mục lục

- [Vì sao thu nhỏ ở client](#vì-sao-thu-nhỏ-ở-client)
- [Bật nhanh](#bật-nhanh)
- [Policy mẫu](#policy-mẫu)
- [Chọn chế độ metadata](#chọn-chế-độ-metadata)
- [Trần phía server (đi kèm bắt buộc)](#trần-phía-server-đi-kèm-bắt-buộc)
- [Giới hạn của trình duyệt](#giới-hạn-của-trình-duyệt)
- [Hook `processor`](#hook-processor)
- [Checklist](#checklist)

## Vì sao thu nhỏ ở client

Ảnh từ máy ảnh / điện thoại đời mới dễ nặng 10–30 MB, 30–60 MP. Hệ quả nếu để nguyên: upload chậm và tốn data của người
dùng, vượt `upload_max_filesize` của PHP (người dùng thấy lỗi mơ hồ), server phải giải mã ảnh khổng lồ (RAM, CPU), kho
lưu trữ phình. Thu nhỏ trước khi gửi giải quyết cả bốn mà người dùng không phải tự mở phần mềm sửa ảnh.

Kit **không đặt số trần nào** (mỗi site một chính sách), và tính năng **tắt** theo mặc định: không đặt `imageResize` =
hành vi cũ, kit không đọc file.

## Bật nhanh

```js
// td-dropzone
dropzone.imageResize = { maxPixels: 3_000_000, maxBytes: 300 * 1024, metadata: 'keep-no-gps' };

// td-media-picker (mọi lần mở)
TdMediaPicker.configureDefaults({
  adapter,
  upload: { accept: 'image/*', imageResize: { maxPixels: 12_000_000, maxBytes: 5 * 1024 * 1024 } },
});
```

Policy sai (ví dụ `maxBytes: '5MB'` hoặc `minQuality` lớn hơn `quality`) → `TypeError` ngay lúc gán. `maxBytes` là **số
byte nguyên** — cố ý không nhận chuỗi `'5MB'` để khỏi lệch giữa MB (10⁶) và MiB (2²⁰).

## Policy mẫu

| Mục đích | Policy |
|---|---|
| Ảnh đại diện / ảnh bài viết nhẹ: **3 MP, 300 KB, bỏ GPS** | `{ maxPixels: 3_000_000, maxBytes: 300 * 1024, metadata: 'keep-no-gps' }` |
| Kho ảnh biên tập: máy ảnh 33 MP về **12 MP, 5 MiB** | `{ maxPixels: 12_000_000, maxBytes: 5 * 1024 * 1024, quality: 0.9, metadata: 'keep-no-gps' }` |
| Chỉ giới hạn cạnh dài (không quan tâm byte) | `{ maxWidth: 2560, maxHeight: 2560 }` |
| Chỉ xoá metadata, không nén lại điểm ảnh | `{ metadata: 'none' }` (JPEG / PNG đã nhỏ thì **viết lại không mất dữ liệu**) |
| Ảnh công khai, chỉ giữ thông tin bản quyền | `{ maxPixels: 8_000_000, metadata: 'copyright' }` |

Cách kit áp trần: tính cùng lúc mọi trần đang bật và chọn hệ số thu nhỏ nhỏ nhất (giữ tỉ lệ khung hình, không phóng
to). JPEG: encode ở `quality` (0,9), nếu còn quá `maxBytes` thì hạ dần tới `minQuality` (0,65), rồi mới thu nhỏ thêm; giữ
bản **nhỏ nhất** đạt trần. PNG giữ nguyên là PNG (giữ alpha) và chỉ có đường thu nhỏ kích thước. Không bao giờ tự đổi
PNG thành JPEG hay xuất WebP / AVIF.

Nếu cùng dùng `max-size` của dropzone (hoặc `upload.maxSize` của picker): với ảnh, nó thành **trần đầu ra** (gộp vào
`maxBytes`). Cứ đặt `maxBytes` ≤ `max-size`, hoặc chỉ dùng một trong hai cho khỏi nhầm.

## Chọn chế độ metadata

| Chế độ | Dùng khi |
|---|---|
| `keep` (**mặc định**) | Cần nguyên trạng EXIF / XMP / IPTC (kho ảnh nhiếp ảnh, quy trình hậu kỳ). **Giữ cả vị trí GPS.** |
| `keep-no-gps` | Lựa chọn hợp lý cho hầu hết site có người dùng đăng ảnh: giữ ngày chụp, máy ảnh; bỏ vị trí. |
| `copyright` | Chỉ giữ tác giả + bản quyền. |
| `none` | Ảnh người dùng công khai cần riêng tư tối đa. Giữ Orientation tối giản khi ảnh cần để hiển thị đúng hướng. |

Mặc định `keep` là chủ ý (đa số kho ảnh muốn giữ), nhưng nghĩa là ảnh chụp bằng điện thoại **mang theo toạ độ nhà người
đăng** nếu site không chọn chế độ khác. Nghĩ về điều này trước khi bật trên site cho người dùng công khai. (Lưu ý
khác biệt: mặc định của Cloudflare Images là `copyright`.) Ảnh nén lại luôn qua canvas sRGB — ảnh Display-P3 bị chuyển
sang sRGB và profile ICC gốc không được chép.

## Trần phía server (đi kèm bắt buộc)

Nguyên tắc: **cùng đơn vị (byte), trần server ≥ trần client** (client có thể lỗi hoặc bị bỏ qua), và server tự kiểm lại
loại file theo **nội dung**, kích thước, số điểm ảnh; lưu bằng tên do server sinh, ngoài web root. Xem thêm
[Bảo mật › td-dropzone](security.md#td-dropzone-upload-file).

| Lớp | Cấu hình | Ghi chú |
|---|---|---|
| PHP | `upload_max_filesize`, `post_max_size` (≥ `upload_max_filesize` × số file một request), `max_file_uploads`, `memory_limit` | Giải mã ảnh bằng GD / Imagick tốn RAM ≈ rộng × cao × 4 byte: ảnh 50 MP ≈ 200 MB. |
| nginx / Apache | `client_max_body_size` (nginx), `LimitRequestBody` (Apache) | Vượt thì lỗi 413 trước khi tới PHP. |
| Symfony | `new File(maxSize: '5M')`, `new Image(maxPixels: 12_000_000)` (+ `mimeTypes`) | Constraint kiểm nội dung, không tin `Content-Type` của client. |
| WordPress | filter `upload_size_limit` / `wp_max_upload_size`, `big_image_size_threshold` (WordPress tự tạo bản 2560 px) | `wp_handle_upload` kiểm MIME thật qua `wp_check_filetype_and_ext`. |

Những điều cần nhớ ở server:

- **Đừng tin `optimization`**: nếu adapter ghi lại kích thước gốc / kết quả từ `optimization`, đó là dữ liệu do client
  khai, chỉ dùng để thống kê, không dùng để cấp quyền hay tính phí.
- **Dedup theo hash chính xác có thể lệch**: nén lại / lọc metadata làm đổi hash, cùng một ảnh gốc ra hai hash khác nhau
  tuỳ có bật policy hay không (và tuỳ trình duyệt encode).
- Muốn xoá metadata thật sự thì server **tự strip**, đừng dựa vào client: client chỉ làm khi người dùng dùng đúng giao diện.
- URL upload (`uploadFromUrl` của picker) và crop **không** đi qua tối ưu phía client.

## Giới hạn của trình duyệt

- **Chất lượng thu nhỏ**: kit dùng `createImageBitmap(..., resizeQuality: 'high')`. Safari và Firefox có thể bỏ qua
  `resizeQuality`; khi bitmap ra sai kích thước đích kit tự thu nhỏ từng bước ≤ 2× trên canvas (`imageSmoothingQuality =
  'high'`), còn khi đúng kích thước nhưng chất lượng thấp hơn Chrome thì chấp nhận.
- **Bộ nhớ**: ảnh 64 MP giải mã ≈ 256 MB. Kit xử lý **một ảnh một lúc** (hàng đợi dùng chung cả trang) và chặn đầu vào quá
  trần (`maxInputBytes` 64 MiB, `maxInputPixels` 64 MP, `maxInputSide` 16384), nhưng trình duyệt trên máy yếu vẫn có
  thể bị kill tab. Ảnh panorama vượt trần đầu vào bị **từ chối**, không thu nhỏ.
- **Hướng xoay**: kit kiểm (probe) lần đầu xem trình duyệt có áp EXIF Orientation đúng khi giải mã JPEG / PNG không; sai
  thì ảnh cần xoay trả lỗi `resize-unsupported` thay vì xuất ảnh nằm ngang.
- **Không xử lý được**: JPEG nhiều ảnh (MPF) / gain map HDR / Content Credentials (C2PA) / dữ liệu sau EOI, APNG, PNG
  16-bit, và GIF / WebP / AVIF / HEIC… vượt trần đều **không** thu nhỏ được: dòng báo lỗi nhóm "Định dạng này không tối
  ưu được" (người dùng đổi ảnh khác). Nếu cần cho các định dạng này, viết `processor`.
- Không dùng Worker / OffscreenCanvas / `<img>` → không đòi `img-src blob:` hay `worker-src`; CSP chặt vẫn chạy.
- Tối ưu có thể mất vài trăm ms đến vài giây mỗi ảnh lớn; giao diện hiện "Đang chờ tối ưu…" / "Đang tối ưu ảnh…".

## Hook `processor`

`processor` thay engine của kit khi ảnh **vượt trần** hoặc cần **viết lại** (không gọi khi file đã đạt mọi trần mà
`metadata` là `keep`). Dùng khi bạn muốn engine riêng (WASM codec, thư viện encode) hoặc cần xử lý định dạng kit từ chối.

```js
dropzone.imageResize = {
  maxPixels: 12_000_000,
  metadata: 'none',
  processor: async (file, { policy, signal }) => {
    // trả về File | Blob cùng định dạng (JPEG → JPEG), hoặc null = dùng nguyên file gốc
    const out = await myEncoder.resize(file, { maxPixels: policy.maxPixels, signal });
    return out;
  },
};
```

Hợp đồng (kit **không tin** kết quả, kiểm lại hết):

- Trả `File` / `Blob` **cùng họ định dạng** với file gốc (nhận bằng magic bytes), không rỗng, không vượt `maxInputBytes`.
- Kết quả phải đạt mọi trần đang bật: `maxBytes`, và kích thước (kit đọc được từ header; không đọc được mà có trần kích
  thước thì coi là không hợp lệ), cùng các trần đầu vào `maxInputPixels` / `maxInputSide` / `maxHeaderBytes`.
- Kết quả phải đạt chế độ metadata (kit đọc lại: `none` / `copyright` không còn EXIF GPS hay XMP ngoài danh sách cho phép;
  `keep-no-gps` không còn GPS).
- Trả `null` = "dùng file gốc", chỉ hợp lệ khi file gốc **đã đạt toàn bộ policy** (trần và metadata).
- Sai bất kỳ điều nào → lỗi `processor-invalid-result`; hook ném lỗi → `processor-failed`. Cả hai hiện nhóm "Tối ưu thất bại".
- `signal` bị abort khi người dùng xoá dòng đang tối ưu: huỷ việc của bạn và đừng ném lỗi ồn ào.

## Checklist

- [ ] Đã chọn `metadata` có chủ ý (nhớ mặc định `keep` giữ GPS).
- [ ] Trần server (PHP / proxy / framework) ≥ trần client, cùng đơn vị byte; server tự kiểm loại theo nội dung và số điểm
      ảnh.
- [ ] Server không tin `optimization` / tên file / MIME do client gửi.
- [ ] Đã thử với ảnh thật lớn nhất của người dùng (30 MB, 33–61 MP) trên Chrome, Safari, Firefox và một máy yếu.
- [ ] Biết ảnh nào kit từ chối (MPF / HDR / APNG / 16-bit / GIF / WebP quá trần…) và có thông điệp / luồng thay thế.
- [ ] `max-size` / `upload.maxSize` và `maxBytes` không mâu thuẫn nhau.

## Xem thêm

- [Dropzone](../components/dropzone.md#7-tối-ưu-ảnh-trước-khi-upload--imageresize-0900) · [Media picker](../components/media-picker.md) ·
  [Bảo mật](security.md#td-dropzone-upload-file) · [CSP](csp.md) · [Biến thể ảnh đã cắt](media-renditions.md)
- Nội bộ: [ADR 0037](../internal/decisions/0037-client-image-resize.md) ·
  [plan v0.90.0](../internal/plans/v0.90.0-image-resize.md)
