[Tài liệu](../README.md) › [Components](README.md) › Dropzone

# Chọn / kéo thả file — `<td-dropzone>`

Vùng kéo-thả file kèm nút "Chọn file", lọc theo loại / kích thước / số lượng, danh sách file đã chọn (tên, kích
thước, nút xoá) và lý do file bị loại. **Form-associated**: file được gửi cùng `<form>` dưới `name` như một
`<input type="file">` thật. Tuỳ chọn: hook `upload` để tải lên ngay (thanh `<td-progress>` từng file, huỷ bằng nút
xoá), thumbnail cho ảnh và (0.90.0) tối ưu ảnh ngay trong trình duyệt trước khi upload (`imageResize`).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/dropzone'` (class: `import { TdDropzone } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | **có** (`name`, `required`, reset, `disabled`, `<fieldset disabled>`) |
| Từ phiên bản | 0.18.0 |

## Ví dụ nhanh

```html
<form method="post" action="/upload.php" enctype="multipart/form-data">
  <td-dropzone name="attachments[]" label="Tệp đính kèm" accept=".pdf,image/*"
    multiple max-size="5MB" max-files="3" required></td-dropzone>
  <td-button type="submit" variant="primary">Gửi</td-button>
</form>

<script type="module">
  import '@dazzxq/td-components/dropzone';
  import '@dazzxq/td-components/button';
</script>
```

PHP nhận như input file thường: `$_FILES['attachments']` (mảng, nhờ `[]` trong `name`).

## Cách dùng

### 1. Chọn file

- Bấm nút **Chọn file** (hoặc bất kỳ đâu trong vùng nét đứt), hoặc Tab tới nút rồi **Enter / Space** → hộp chọn file
  của hệ điều hành (từ một `<input type="file">` thật nằm bên trong, không có `name`, không nằm trong thứ tự Tab).
- **Kéo thả** file vào component (vùng chuyển viền liền khi đang kéo qua).
- Không có `multiple`: giữ **một** file, chọn file mới sẽ thay file cũ. Có `multiple`: cộng dồn tới `max-files`.

### 2. Lọc (chỉ là gợi ý — server phải kiểm lại)

| Điều kiện | Cách viết | Loại bị từ chối (`reason`) |
|---|---|---|
| `accept` | danh sách cách nhau bởi dấu phẩy: MIME `application/pdf`, nhóm `image/*`, đuôi `.pdf` (không phân biệt hoa thường) — như attribute gốc | `type` |
| `max-size` | byte (`5242880`) hoặc số + đơn vị `KB` / `MB` / `GB` (`500KB`, `5MB`, `1.5 GB`; 1 KB = 1024 byte) — **mỗi file** | `size` |
| `max-files` | số file tối đa (tính cả file đã có); không `multiple` = 1 | `count` |

File bị loại được liệt kê dưới vùng chọn (màu lỗi) cho tới lần chọn kế tiếp, và nằm trong `detail.rejected` của
`files-change`. Dòng gợi ý dưới nút tự sinh từ các điều kiện ("Định dạng: … · Tối đa 5 MB mỗi file · Tối đa 3 file").

**Nhãn định dạng (`accept-label`, 0.19.0).** Chuỗi `accept` thô (`.jpg,.jpeg,image/jpeg`) khó đọc với người dùng:

| `accept-label` | Phần "Định dạng" của dòng gợi ý |
|---|---|
| không đặt | như cũ: in danh sách `accept` (`Định dạng: .jpg, .jpeg, image/jpeg`) |
| chuỗi không rỗng, ví dụ `accept-label="Ảnh JPEG"` | thay `{accept}` trong `labels.hintAccept` → `Định dạng: Ảnh JPEG` |
| chuỗi rỗng `accept-label=""` (hoặc toàn khoảng trắng) | bỏ riêng phần định dạng; phần kích thước / số lượng vẫn hiện |

Chỉ đổi phần hiển thị — **lọc file vẫn theo `accept` thật**. Dòng gợi ý trống hẳn thì bị ẩn và không còn nằm trong
`aria-describedby` của nút. `accept-label` được in dạng text (không HTML).

> **Bảo mật:** đổi đuôi file hay sửa `accept` bằng DevTools là qua được lọc phía client. Server phải kiểm lại loại
> (theo **nội dung**), kích thước, số lượng — xem [Bảo mật › td-dropzone](../guides/security.md#td-dropzone-upload-file).

### 3. Trong form

- Mỗi file là một mục `FormData` dưới `name` (`ElementInternals.setFormValue(FormData)`). Form cần
  `enctype="multipart/form-data"` khi gửi thường; `new FormData(form)` trong fetch cũng có file.
- `required` → form không submit được khi chưa có file (thông báo `TdDropzone.labels.required`).
- **Reset** form → xoá danh sách, xoá giá trị form, **huỷ** upload đang chạy (không phát `files-change`, giống input
  gốc).
- Đổi `name` → dựng lại `FormData` dưới tên mới (không dựng lại giao diện). Bỏ `name` → không gửi gì.
- **Vô hiệu hoá** (`disabled` hoặc nằm trong `<fieldset disabled>`): không mở hộp chọn, bỏ qua file thả vào, khoá nút
  xoá, và **không được gửi** cùng form — như control gốc. Bật lại → danh sách cũ vẫn còn và được gửi.

### 4. Upload ngay (hook `upload`)

```js
const dz = document.querySelector('td-dropzone');
dz.upload = (file, { onProgress, signal }) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('X-CSRF-Token', csrfToken);
  xhr.upload.onprogress = (e) => onProgress(e.loaded, e.total);
  xhr.onload = () => {
    if (xhr.status < 300) return resolve(JSON.parse(xhr.responseText));
    // Chỉ lấy trường server CỐ Ý soạn cho người dùng ({"userMessage": "File quá 5 MB"}) — KHÔNG lấy `message` /
    // body lỗi thô (có thể lộ SQL, đường dẫn, stack). Không có → Error rỗng → nhãn chung "Tải lên thất bại".
    let msg = '';
    try { msg = JSON.parse(xhr.responseText).userMessage; } catch { /* body không phải JSON */ }
    reject(new Error(typeof msg === 'string' ? msg : ''));
  };
  xhr.onerror = () => reject(new Error('Mất kết nối, thử lại sau'));
  signal.addEventListener('abort', () => xhr.abort());
  const body = new FormData();
  body.append('file', file);
  xhr.send(body);
});
```

- **Che lỗi ở cả API, không chỉ ở dòng hiện ra:** nếu site có endpoint trạng thái / polling cho upload (xử lý nền,
  worker), JSON trả về cũng chỉ được chứa câu chung hoặc câu đã soạn — không trả lỗi thô của worker (đường dẫn tạm,
  tên chương trình, lỗi dịch vụ lưu trữ). Xem [Bảo mật](../guides/security.md#td-dropzone-upload-file).
- Gọi một lần cho **mỗi file được thêm** (sau khi lọc). Không có hook → kit không upload gì.
- `onProgress(percent)` (**phần trăm** 0–100, một đối số) hoặc `onProgress(loaded, total)` → thanh `<td-progress
  size="sm">` của file đó.
- **Đang chờ (0.19.0):** file đã vào hàng nhưng hook **chưa gọi `onProgress` lần nào** → thanh chạy không xác định
  (indeterminate) + nhãn `labels.uploadWaiting` ("Đang chờ…"), dòng có `data-waiting`. Lần `onProgress` hợp lệ đầu
  tiên (kể cả `onProgress(0)`) chuyển sang thanh có số. Hợp với site tự giới hạn số upload song song: file đợi slot cứ
  giữ trạng thái chờ tới khi hook của nó bắt đầu báo tiến độ.
- Promise resolve → trạng thái "Đã tải lên" (thanh xanh); reject → thanh đỏ + **lý do**: nếu giá trị reject có
  `message` là chuỗi không rỗng (ví dụ `new Error('Máy chủ từ chối: quá lớn')`) thì dòng file hiện đúng chuỗi đó
  (gán bằng `textContent`, cắt còn 200 ký tự); không có (reject chuỗi trần, object không có `message`, `message` không
  phải chuỗi…) → nhãn chung `labels.uploadError` ("Tải lên thất bại"). Muốn hiện lý do thì reject bằng `Error`.
- Bấm xoá file đang upload, hoặc reset form → `signal` bị **abort** (hãy huỷ request trong hook); kết quả trễ bị bỏ qua,
  không hiện lỗi.
- Hook là code của site: endpoint phải có CSRF / kiểm tra phiên và **tự validate** file.
- File đã upload vẫn nằm trong `FormData` nếu có `name`. Luồng "upload trước, submit id sau" thì bỏ `name` và tự
  thêm id nhận từ server vào form.

### 5. Thumbnail ảnh (`preview`)

`preview` → ảnh (`image/*`) có thumbnail 40px từ `URL.createObjectURL(file)`. URL được thu hồi (`revokeObjectURL`)
khi xoá file, reset, bỏ `preview`, hoặc component rời trang (tạo lại khi quay lại). Không bật `preview` thì kit
không bao giờ tạo object URL; kit cũng không đọc nội dung file, trừ khi bật `imageResize` (xem mục 7 và phần Bảo mật bên dưới). CSP cần `img-src … blob:`.

### 6. Trình bày kiểu xếp chồng + badge (0.33.0)

Ba attribute **chỉ đổi cách trình bày** (lọc, form, upload không đổi). Không đặt chúng (hoặc để rỗng) → markup y hệt
0.32, từng byte.

```html
<td-dropzone name="media[]" multiple accept="image/jpeg,image/png" accept-label="JPG, PNG" max-size="20MB"
  prompt-title="Kéo thả file vào đây" prompt-text="hoặc bấm để chọn file" hint-style="badges"></td-dropzone>
```

- **`prompt-title` / `prompt-text`**: có ít nhất một chuỗi khác rỗng → vùng chọn **xếp chồng** (`.td-dropzone--stacked`):
  icon upload 64px → tiêu đề (`.td-dropzone__title`, 1.25rem / 600) → dòng phụ màu nhạt (`.td-dropzone__subtext`) → nút
  **Chọn file** (giữ lại cho bàn phím). Câu `labels.prompt` không hiện. Bấm bất kỳ đâu trong vùng vẫn mở hộp chọn file.
  Viền nét đứt 2px, bo góc lớn, đệm rộng (token `--td-dropzone-stacked-*`).
- **`hint-style="badges"`**: dòng gợi ý tách thành từng mục, mỗi mục là `<span class="td-badge td-dropzone__badge">`
  trong `<div class="td-dropzone__hint td-dropzone__hint--badges">` (vẫn là đích `aria-describedby` của nút):
  - định dạng: `accept-label` nếu có (rỗng → bỏ badge này), không thì suy từ `accept` (`.pdf` → `PDF`,
    `image/png` → `PNG`, `image/svg+xml` → `SVG`, `image/*` giữ nguyên), không có tiền tố "Định dạng:";
  - `labels.badgeSize` (`'Tối đa {size}'`) khi có `max-size`; `labels.badgeCount` (`'Tối đa {n} file'`) khi có
    `multiple` + `max-files`.
  - Giao diện badge là của [Badge](badge.md); `__badge` chỉ chỉnh khoảng cách (badge dài được xuống dòng).
- Mọi chuỗi chỉ là **text** (`textContent` / escape), không nhận HTML, không có slot markup.
- Hai kiểu độc lập: dùng riêng `hint-style="badges"` với prompt cũ, hoặc prompt xếp chồng với dòng gợi ý `<p>` cũ đều được.

### 7. Tối ưu ảnh trước khi upload — `imageResize` (0.90.0)

Opt-in. Đặt property `imageResize` (object **policy**) thì mỗi ảnh được nhận sẽ được **thu nhỏ / nén lại / lọc metadata
ngay trong trình duyệt** trước khi vào `files`, `FormData` và hook `upload`. Kit **không đặt trần nào**: trần là của
site. Không đặt (mặc định `null`) = hành vi y hệt 0.89 (kit không đọc file, không đổi file, markup và event không đổi).
Hướng dẫn thực hành (ví dụ policy, trần phía server, ranh giới tin cậy): [Giới hạn khi upload ảnh](../guides/image-upload-limits.md).

```js
const dz = document.querySelector('td-dropzone');
dz.imageResize = {
  maxPixels: 12_000_000,   // ảnh Sony a7C II 33 MP -> về trần 12 MP
  maxBytes: 5 * 1024 * 1024, // và <= 5 MiB mỗi file
  quality: 0.9,            // JPEG: thử 90 % trước, hạ dần nếu còn quá trần byte
  metadata: 'keep-no-gps', // giữ EXIF thường, bỏ vị trí GPS
};
dz.upload = (file, { onProgress, signal, optimization, originalFile }) => { /* file = bản đã tối ưu */ };
```

- Gán policy sai (kiểu / giá trị nằm ngoài khoảng) → `TypeError` ném **đồng bộ**, policy cũ giữ nguyên. Policy được
  chuẩn hoá rồi `Object.freeze` (đọc lại `dz.imageResize` ra object đã đóng băng, đủ mọi key). Key lạ bị bỏ qua và
  `console.warn` một lần. `null` = tắt.
- Policy chỉ áp cho file **thêm sau khi gán**; hàng đã có giữ nguyên trạng thái.
- Policy có thể không có trần đầu ra nào (chỉ `metadata: 'none'`, chẳng hạn) — khi đó kit chỉ lọc metadata.
- Không có property/attribute HTML tương ứng: đây là cấu hình JS.

#### Các key của policy

| Key | Mặc định | Ý nghĩa |
|---|---|---|
| `maxBytes` | `null` | Trần **byte** của file đầu ra (số nguyên; không nhận chuỗi `'5MB'` để khỏi lệch MB / MiB). Đã tính cả metadata chèn vào. |
| `maxPixels` | `null` | Trần tổng điểm ảnh đầu ra (rộng × cao). |
| `maxWidth` / `maxHeight` | `null` | Trần mỗi cạnh đầu ra, theo hướng **hiển thị** (sau khi xoay theo EXIF). |
| `quality` | `0.9` | Chất lượng JPEG của lần encode đầu (`0 < q ≤ 1`). Không ảnh hưởng PNG. |
| `minQuality` | `0.65` | Sàn chất lượng khi hạ dần để lọt `maxBytes` (`≤ quality`). |
| `maxEncodes` | `8` | Số lần encode tối đa cho một file (số nguyên 1–32). |
| `metadata` | `'keep'` | Cách xử lý metadata: `keep` \| `keep-no-gps` \| `copyright` \| `none` (bảng dưới). |
| `maxInputBytes` | `67108864` (64 MiB) | Chặn **đầu vào** (an toàn bộ nhớ, không phải trần của site). Không tắt được. |
| `maxInputPixels` | `64000000` | Chặn đầu vào quá nhiều điểm ảnh (bom giải nén); 64 MP đủ cho máy ảnh 61 MP. Không tắt được. |
| `maxInputSide` | `16384` | Cạnh đầu vào tối đa (giới hạn canvas). Không tắt được. |
| `maxHeaderBytes` | `1048576` (1 MiB) | Phần đầu file được đọc để lấy kích thước / EXIF. Không tắt được. |
| `processor` | `null` | Hook thay engine của kit: `(file, { policy, signal }) => File \| Blob \| null` (xem hướng dẫn). |

Bốn trần đầu ra (`maxBytes`, `maxPixels`, `maxWidth`, `maxHeight`) là `null` hoặc số nguyên > 0. Bốn trần đầu vào
(`maxInput*`, `maxHeaderBytes`) là số nguyên > 0 (`null` bị từ chối). Sai bất kỳ ràng buộc nào → `TypeError`.

#### Metadata

| `metadata` | EXIF | GPS | XMP | IPTC | Ghi chú |
|---|---|---|---|---|---|
| `keep` (mặc định) | giữ (vá Orientation / kích thước khi nén lại) | **giữ** | giữ nguyên nếu đủ điều kiện an toàn, không thì bỏ | giữ | Mặc định này **giữ vị trí GPS** của ảnh — ảnh từ điện thoại có thể lộ nơi ở. Site công khai nên chọn `keep-no-gps` trở lên. |
| `keep-no-gps` | giữ | xoá | bỏ | giữ, trừ trường địa điểm | EXIF thường (máy ảnh, ngày chụp) còn lại. |
| `copyright` | tối giản (Artist, Copyright; Orientation nếu cần) | xoá | bỏ | chỉ By-line và Copyright Notice | |
| `none` | không có (trừ Orientation tối giản khi ảnh cần để hiển thị đúng hướng) | xoá | bỏ | bỏ | |

Chế độ khác `keep` còn bỏ chú thích `COM` và các segment ứng dụng lạ. Kết quả từng họ metadata được báo trong
`optimization.metadata` (`exact`, `patched`, `verbatim`, `rebuilt`, `dropped`, `absent`, `partial`).
Ảnh nén lại đi qua canvas sRGB: **ảnh Display-P3 bị chuyển sang sRGB**; profile ICC gốc không được chép.

#### Quyết định cho từng file (nhận diện bằng nội dung, không tin `file.type` / đuôi)

1. Đọc những byte đầu để nhận diện. **Không phải ảnh** (PDF…): policy không áp, chỉ kiểm `max-size` trên file gốc rồi
   gửi nguyên.
2. File rỗng → lỗi `empty-file`. Vượt `maxInputBytes` → `input-too-large`. Kích thước đọc từ header vượt
   `maxInputPixels` / `maxInputSide` → `input-dimensions-too-large` (ảnh panorama quá trần bị **từ chối**, không thu nhỏ).
3. **Đã đạt mọi trần**: `metadata: 'keep'` → gửi **nguyên file** (cùng object `File`, không đọc lại); chế độ khác → JPEG /
   PNG được **viết lại không mất dữ liệu** (giữ nguyên điểm ảnh, chỉ lọc metadata). GIF / WebP / AVIF / SVG… không viết
   lại được: chế độ khác `keep` → `metadata-policy-unsupported`.
4. **Vượt trần**: JPEG thường → giải mã, thu nhỏ, encode lại JPEG (hạ `quality` dần tới `minQuality`, rồi thu nhỏ thêm, tối
   đa `maxEncodes` lần, giữ bản **nhỏ nhất** đạt trần); PNG 8-bit thường → thu nhỏ, giữ PNG và kênh alpha. Không bao
   giờ đổi định dạng (PNG không thành JPEG). Hết cách → `cannot-satisfy-limits` (hoặc `metadata-too-large` khi riêng
   metadata đã quá trần).
5. Không xử lý được, chỉ gửi nguyên: JPEG đặc biệt (nhiều ảnh MPF, gain map HDR, C2PA / Content Credentials, dữ liệu sau
   EOI), APNG, PNG 16-bit → `special-content-transform-required`; định dạng khác (GIF, WebP, AVIF, HEIC, BMP…) vượt
   trần → `format-not-transformable`. GIF và WebP được đọc kích thước để so trần; AVIF / HEIC / BMP… chỉ được gửi nguyên
   khi **không** có trần kích thước nào đang bật. SVG chỉ bị trần byte (vector, không có điểm ảnh).
6. Có `processor` → nó thay engine ở nhánh "vượt trần" và "viết lại" (không gọi khi file đã đạt trần với `keep`). Kit
   kiểm lại kết quả (cùng họ định dạng, đạt mọi trần và chế độ metadata) — sai → `processor-invalid-result`, ném lỗi →
   `processor-failed`.

Tối ưu chạy trên main thread, **một ảnh một lúc**: hàng đợi FIFO dùng chung toàn trang (mọi dropzone và hộp tải lên của
[media picker](media-picker.md) cùng một slot). Ảnh quá lớn có thể làm trình duyệt máy yếu chậm hoặc bị kill — server
vẫn là ranh giới tin cậy. Xoá một dòng đang chờ / đang tối ưu thì huỷ việc của nó (không upload, không báo lỗi).

#### Trạng thái dòng, dòng dung lượng, thử lại

`data-status` của dòng (`.td-dropzone__item`) có thêm hai giá trị:

| `data-status` | Khi nào | Chữ (`labels`) |
|---|---|---|
| `queued` | Đã nhận, chờ tới lượt tối ưu | `queued` ("Đang chờ tối ưu…") |
| `optimizing` | Đang tối ưu (thanh tiến độ không xác định) | `optimizing` ("Đang tối ưu ảnh…") |
| `uploading` → `done` \| `error` | Có hook `upload`: sau khi tối ưu xong thì upload như mục 4 | như mục 4 |
| `selected` | Không có hook: tối ưu xong, file đã vào `files` / `FormData` | — |
| `error` | Lỗi tối ưu (không vào `FormData`, form không hợp lệ cho tới khi xoá dòng) hoặc lỗi upload | thông báo lỗi |

- **Dòng dung lượng**: ảnh đổi dung lượng hiển thị `labels.sizeChange` (`'30 MB → 4,2 MB'`) thay vì chỉ dung lượng gốc.
  Khi ảnh nhỏ đi, live region đọc một lần `labels.optimized` ("Đã giảm {name} từ {from} xuống {to}").
- **Lỗi tối ưu** hiện thông điệp **gom nhóm** theo mã lỗi (`labels.optimizeError`, bảng dưới); mã không có trong bảng
  dùng `default`. Dòng lỗi này không có nút thử lại (tối ưu lại cũng ra lỗi cũ) — người dùng xoá dòng rồi chọn lại.
- **Thử lại**: dòng `error` do **upload** (hook reject), khi có policy **và** có hook, hiện nút
  `<button class="td-dropzone__retry td-btn td-btn--ghost td-btn--sm" aria-label="Thử lại {tên file}">Thử lại</button>`.
  Bấm → hook chạy lại với **chính file đã tối ưu** (không tối ưu lại, không encode lại), focus ở lại trong dòng. Không
  có policy thì không có nút này (như 0.89).
- **Hook `upload` nhận thêm trong tuỳ chọn thứ hai** (chỉ khi có policy): `optimization` (object tóm tắt, `null` với file
  không phải ảnh) và `originalFile` (`File` gốc người dùng chọn). **Không có policy: đúng `{ onProgress, signal }`** như
  trước. `file` truyền cho hook là bản đã tối ưu, **giữ tên file gốc**.

```js
// optimization (khi file là ảnh)
{
  changed: true,                       // file đầu ra khác file gốc
  reasons: ['pixels', 'bytes'],        // 'bytes' | 'pixels' | 'width' | 'height' | 'metadata'
  original: { name, type, size, width, height },
  output:   { type, size, width, height },   // width / height: null nếu định dạng không đọc được kích thước
  metadata: { mode, exif, xmp, iptc,         // 'exact' | 'patched' | 'verbatim' | 'rebuilt' | 'dropped' | 'absent' | 'partial'
              gpsPresent,                    // true | false | 'unknown'
              contentCredentials: false },
}
```

#### `files`, `uploading`, tính hợp lệ

- `files` (và `FormData`) chỉ chứa dòng **đã sẵn sàng** (tối ưu xong hoặc gửi nguyên); dòng đang chờ / đang tối ưu / lỗi
  tối ưu **chưa** nằm trong đó. Nội dung của `File` trong `files` là bản đã tối ưu.
- `uploading` là `true` cả khi còn dòng `queued` / `optimizing`.
- Còn dòng `queued` / `optimizing` → `validity.customError` với thông báo `labels.pendingInvalid`; sau đó, còn dòng lỗi
  tối ưu → `labels.failedInvalid` cho tới khi dòng đó bị xoá. Vì vậy form không submit được giữa chừng.
- Event `files-change` có thêm `detail.added` (xem mục Event).

#### `max-size` khi có policy

`max-size` không còn chặn đồng bộ lúc nhận file (`accept` và `max-files` vẫn chặn đồng bộ):

- **Ảnh kit xử lý**: `max-size` thành trần **đầu ra** (gộp vào `maxBytes` nếu nhỏ hơn). Đầu ra vẫn lớn hơn `max-size` →
  lỗi `cannot-satisfy-limits`. Vì thế một ảnh 30 MB vẫn được nhận khi `max-size="5MB"`; đầu vào bị chặn bởi `maxInputBytes`.
- Ảnh vượt `max-size` mà engine không nén lại được (GIF, WebP, SVG, nội dung đặc biệt) → dòng lỗi `cannot-satisfy-limits` ("Không giảm được xuống trần").
- **File không phải ảnh**: kiểm `max-size` trên file gốc sau khi nhận diện, quá thì dòng `error` với `labels.rejectSize`.
- Hệ quả: `addFiles()` / `files-change` coi các file này là `accepted` kể cả khi dòng sau đó lỗi; lý do `size` không còn
  xuất hiện trong `rejected` khi có policy. Nên đặt `maxBytes ≤ max-size` (hoặc chỉ dùng một trong hai).

#### Mã lỗi → thông điệp (`labels.optimizeError`)

| Mã lỗi | Thông điệp mặc định |
|---|---|
| `empty-file`, `invalid-image`, `header-limit`, `decode-failed`, `decode-unsupported` | Không đọc được ảnh |
| `input-too-large`, `input-dimensions-too-large`, `canvas-limit` | Ảnh quá lớn để xử lý |
| `format-not-transformable`, `special-content-transform-required`, `metadata-policy-unsupported`, `resize-unsupported` | Định dạng này không tối ưu được |
| `cannot-satisfy-limits`, `metadata-too-large` | Không giảm được xuống trần |
| `encode-failed`, `output-type-mismatch`, `processor-failed`, `processor-invalid-result`, `default` | Tối ưu thất bại |

## Responsive (0.34.0)

Host `<td-dropzone>` là **container** (`container: td-dropzone / inline-size`, thêm `min-inline-size: 0`). Khi dropzone
**hẹp hơn 360px** (cỡ `2xs` chỉ dành cho container): câu "Kéo thả file vào đây hoặc" được **ẩn khỏi mắt** (vẫn trong
DOM, trình đọc màn hình vẫn đọc), nút **Chọn file rộng 100%**; dòng gợi ý (định dạng / dung lượng / số file) vẫn hiện,
tên trợ năng của nút không đổi. Dạng `prompt-title` / `prompt-text` giữ tiêu đề + dòng phụ, nút rộng 100%. ≥ 360px: như
trước. Cần bề rộng từ cha (`display: block` — mặc định). Trình duyệt không hỗ trợ container query (Chrome / Edge trước 105) thì
không có bố cục hẹp này (không có dự phòng theo viewport); chức năng vẫn dùng được.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên trường trong form (mỗi file một mục). Dùng `files[]` cho mảng PHP. |
| `label` | string | — | Nhãn hiển thị phía trên (đặt tên cho nhóm). Có `required` → thêm dấu `*`. |
| `accept` | string | — (mọi loại) | Loại được nhận: `type/sub`, `type/*`, `.ext`, cách nhau bởi dấu phẩy. |
| `accept-label` | string | — | Chữ hiển thị cho phần định dạng của dòng gợi ý (mục 2): không đặt = in `accept`; rỗng = bỏ phần định dạng. Không ảnh hưởng lọc. |
| `multiple` | boolean | `false` | Cho chọn nhiều file (không có: file mới thay file cũ). |
| `max-size` | string | — | Kích thước tối đa mỗi file: byte hoặc `KB`/`MB`/`GB`. Có `imageResize` (0.90.0): với ảnh là trần **đầu ra**, xem mục 7. |
| `max-files` | number | — | Số file tối đa (khi có `multiple`). |
| `preview` | boolean | `false` | Thumbnail cho ảnh (object URL). |
| `required` | boolean | `false` | Bắt buộc có ít nhất một file. |
| `disabled` | boolean | `false` | Vô hiệu hoá (xem mục 3). |
| `error-text` | string | — | Thông báo lỗi hiển thị dưới component (như các field khác). |
| `prompt-title` | string | — | 0.33.0 — tiêu đề vùng chọn kiểu xếp chồng (mục 6). Text. |
| `prompt-text` | string | — | 0.33.0 — dòng phụ dưới tiêu đề (mục 6). Text. |
| `hint-style` | `badges` | — | 0.33.0 — `badges`: gợi ý thành các `td-badge` (mục 6); giá trị khác = dòng `<p>` như cũ. |
| `helper-text` | string | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

Đổi `label`, `accept`, `accept-label`, `multiple`, `max-size`, `max-files`, `preview`, `required`, `disabled`,
`prompt-title`, `prompt-text`, `hint-style` → dựng lại giao diện
(danh sách file được giữ).

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `files` | `File[]` (chỉ đọc, bản sao) | File đang chọn. `getValue()` trả cùng giá trị. 0.90.0 (có `imageResize`): chỉ gồm dòng đã sẵn sàng (bản đã tối ưu). |
| `upload` | `(file, { onProgress, signal }) => Promise` \| `null` | Hook upload (mục 4). Gán trước khi gắn vào trang cũng được. Có `imageResize`: tuỳ chọn thứ hai có thêm `optimization`, `originalFile` (mục 7). |
| `imageResize` | object policy \| `null` | 0.90.0 — tối ưu ảnh trước khi upload (mục 7). Mặc định `null` = tắt. Chuẩn hoá + đóng băng khi gán; sai → `TypeError` đồng bộ, giữ policy cũ. Áp cho file thêm sau đó. |
| `uploading` | boolean (chỉ đọc) | Còn file đang upload (0.90.0: hoặc còn dòng chờ / đang tối ưu). |
| `addFiles(files)` | → `{ accepted, rejected }` | Thêm file bằng JS (có lọc + hook), **không** phát event. |
| `setValue(files)` | → `{ accepted, rejected }` | Thay toàn bộ danh sách (có lọc), không phát event. |
| `removeFile(indexOrFile)` | method | Xoá một file (huỷ upload của nó), không phát event. 0.90.0: nhận `File` gốc hoặc bản đã tối ưu. |
| `clear()` | method | Xoá hết (huỷ upload), không phát event. |
| `openPicker()` | method | Mở hộp chọn file (không làm gì khi bị vô hiệu hoá; trình duyệt chỉ cho mở trong thao tác của người dùng). |
| `form`, `validity`, `validationMessage`, `checkValidity()`, `reportValidity()`, `setCustomValidity()` | | Như control gốc. |
| `setError(msg)` / `clearError()` | method | Hợp đồng lỗi chung của field. |
| `TdDropzone.labels` | static object | Nhãn (xem dưới). |
| `parseFileSize(str)` | hàm export từ `/dropzone` | `'5MB'` → `5242880`; không hợp lệ → `null`. |

### Nhãn (`TdDropzone.labels`)

| Khoá | Mặc định |
|---|---|
| `prompt` / `browse` | `'Kéo thả file vào đây hoặc'` / `'Chọn file'` |
| `list` | `'File đã chọn'` (tên danh sách cho trình đọc màn hình) |
| `hintAccept` / `hintSize` / `hintCount` | `'Định dạng: {accept}'` / `'Tối đa {size} mỗi file'` / `'Tối đa {n} file'` |
| `rejectType` / `rejectSize` / `rejectCount` | `'{name}: định dạng không được chấp nhận'` / `'{name}: lớn hơn {max}'` / `'{name}: vượt quá số file cho phép ({n})'` |
| `remove` | `'Xoá {name}'` (nhãn nút xoá) |
| `added` / `removed` | `'Đã thêm {n} file'` / `'Đã xoá {name}'` (thông báo cho trình đọc màn hình) |
| `uploadWaiting` / `uploading` / `uploaded` / `uploadError` | `'Đang chờ…'` / `'Đang tải lên…'` / `'Đã tải lên'` / `'Tải lên thất bại'` (`uploadError` chỉ dùng khi lỗi không có `message` chuỗi) |
| `progress` | `'Tải lên {name}'` (tên thanh tiến độ) |
| `required` | `'Vui lòng chọn file.'` |
| `badgeAccept` / `badgeSize` / `badgeCount` | `'{accept}'` / `'Tối đa {size}'` / `'Tối đa {n} file'` (0.33.0, chỉ `hint-style="badges"`) |
| `queued` / `optimizing` | `'Đang chờ tối ưu…'` / `'Đang tối ưu ảnh…'` (0.90.0, chỉ khi có `imageResize`) |
| `sizeChange` / `optimized` | `'{from} → {to}'` / `'Đã giảm {name} từ {from} xuống {to}'` (0.90.0) |
| `retry` / `retryLabel` | `'Thử lại'` / `'Thử lại {name}'` (0.90.0) |
| `pendingInvalid` / `failedInvalid` | `'Đang tối ưu ảnh, vui lòng chờ'` / `'Có tệp không xử lý được, hãy gỡ ra'` (0.90.0, thông báo validity) |
| `optimizeError` | object theo mã lỗi → 5 thông điệp gom nhóm + `default` (0.90.0, bảng ở mục 7) |

```js
import { TdDropzone } from '@dazzxq/td-components';
Object.assign(TdDropzone.labels, { prompt: 'Drop files here or', browse: 'Browse', remove: 'Remove {name}' });
```

Nhãn mới có hiệu lực ở lần dựng lại kế tiếp (đổi attribute, thêm/xoá file).

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `files-change` | `{ files: File[], rejected: { file, reason: 'type'\|'size'\|'count', message }[], added: File[] }` | Người dùng chọn / thả / xoá file (cả khi mọi file đều bị loại). API JS và reset form **không** phát. 0.90.0: `added` = các `File` **gốc** được nhận ở lần thêm này, phát đồng bộ **trước** khi tối ưu bắt đầu (`[]` khi xoá); `files` giữ nghĩa cũ (chỉ dòng sẵn sàng, nên có policy thì chưa có file vừa thêm). |

`change` / `input` của `<input type="file">` bên trong không lọt ra ngoài component.

```js
dz.addEventListener('files-change', (e) => {
  submitBtn.disabled = e.detail.files.length === 0;
});
```

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-dropzone-bg` | `var(--td-field-bg)` | Nền vùng chọn |
| `--td-dropzone-bg-active` | 6 % `--td-accent` trên nền field | Nền khi đang kéo file qua |
| `--td-dropzone-bg-pressed` | `#f4f4f5` (sáng) / `#2c2c30` (tối) | 0.36.2 — nền vùng chọn khi đang nhấn (cảm ứng, trừ `disabled` / đang kéo) |
| `--td-dropzone-bg-disabled` | `var(--td-field-bg-disabled)` | Nền khi vô hiệu hoá |
| `--td-dropzone-border` | `var(--td-control-border-strong)` | Viền nét đứt (≥ 3:1) |
| `--td-dropzone-border-active` | `var(--td-accent)` | Viền khi rê / kéo qua |
| `--td-dropzone-radius` | `var(--td-radius-lg)` | Bo góc vùng chọn |
| `--td-dropzone-pad` | `var(--td-space-lg) var(--td-space-md)` | Đệm vùng chọn |
| `--td-dropzone-icon` / `--td-dropzone-hint` | `var(--td-color-text-muted)` | Màu icon / chữ gợi ý, kích thước |
| `--td-dropzone-item-bg` / `--td-dropzone-item-radius` | `var(--td-color-surface-muted)` / `var(--td-radius-md)` | Dòng file |
| `--td-dropzone-thumb` | `40px` | Cỡ thumbnail |
| `--td-dropzone-reject` | `var(--td-color-error)` | Màu dòng file bị loại |
| `--td-dropzone-stacked-pad` | `4rem 2rem` (`--td-space-md` × 4 / × 2) | 0.33.0 — đệm vùng xếp chồng |
| `--td-dropzone-stacked-radius` | `var(--td-radius-xl)` | 0.33.0 — bo góc vùng xếp chồng |
| `--td-dropzone-stacked-border-width` | `2px` | 0.33.0 — độ dày viền nét đứt khi xếp chồng |
| `--td-dropzone-stacked-icon` | `64px` | 0.33.0 — cỡ icon upload khi xếp chồng |
| `--td-dropzone-title-size` / `--td-dropzone-title-weight` | `var(--td-text-lg)` / `var(--td-fw-semibold)` | 0.33.0 — chữ tiêu đề |

Vùng chọn là field (lớp nội dung) → nền đặc, không kính; nút "Chọn file" là nút `secondary` của kit (nền đặc
xám nhạt + viền mảnh, như `<td-button variant="secondary">`). Thanh tiến độ: token của [Progress](progress.md).

## Cấu trúc DOM & class

```html
<td-dropzone name="f" label="Tệp" multiple>
  <div class="td-dropzone" role="group" aria-labelledby="{id}-label" data-state="idle|dragover" [data-disabled]>
    <span class="td-dropzone__label" id="{id}-label">Tệp[<span class="td-field__required" aria-hidden="true"> *</span>]</span>
    <input type="file" class="td-dropzone__input" tabindex="-1" aria-hidden="true" [accept] [multiple] [disabled]>
    <div class="td-dropzone__zone">
      <span class="td-dropzone__icon" aria-hidden="true"><svg class="td-icon" data-icon="upload">…</svg></span>
      <p class="td-dropzone__prompt"><span class="td-dropzone__text">Kéo thả file vào đây hoặc</span>
        <button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm">Chọn file</button></p>
      <p class="td-dropzone__hint" id="{id}-hint" [hidden]>… (phần định dạng theo accept / accept-label)</p>
    </div>
    <ul class="td-dropzone__rejected" [hidden]><li class="td-dropzone__reject" data-reason="type|size|count">…</li></ul>
    <ul class="td-dropzone__list" aria-label="File đã chọn" [hidden]>
      <li class="td-dropzone__item" data-id="1" data-status="selected|queued|optimizing|uploading|done|error" [data-waiting]>
        [<img class="td-dropzone__thumb" alt="" src="blob:…">]
        <span class="td-dropzone__meta"><span class="td-dropzone__name">bao-cao.pdf</span>
          <span class="td-dropzone__size">1.5 KB</span><span class="td-dropzone__status" [hidden]>… (nhãn trạng thái / lý do lỗi)</span></span>
        <td-progress class="td-dropzone__progress" size="sm" label="Tải lên bao-cao.pdf" [value] [hidden]></td-progress>
        [<button type="button" class="td-dropzone__retry td-btn td-btn--ghost td-btn--sm" aria-label="Thử lại bao-cao.pdf">Thử lại</button>]  <!-- 0.90.0: lỗi upload + có imageResize -->
        <button type="button" class="td-dropzone__remove" aria-label="Xoá bao-cao.pdf"><svg data-icon="close">…</svg></button>
      </li>
    </ul>
    <span class="td-sr-only td-dropzone__live" aria-live="polite"></span>
  </div>
</td-dropzone>
```

Kiểu xếp chồng (0.33.0, `prompt-title` / `prompt-text`) và badge (`hint-style="badges"`) chỉ đổi phần trong `__zone`:

```html
<div class="td-dropzone td-dropzone--stacked" …>
  …
  <div class="td-dropzone__zone">
    <span class="td-dropzone__icon" aria-hidden="true"><svg class="td-icon" width="64" height="64" data-icon="upload">…</svg></span>
    [<p class="td-dropzone__title">Kéo thả file vào đây</p>]
    [<p class="td-dropzone__subtext">hoặc bấm để chọn file</p>]
    <p class="td-dropzone__prompt"><button type="button" class="td-dropzone__browse td-btn td-btn--secondary td-btn--sm">Chọn file</button></p>
    <div class="td-dropzone__hint td-dropzone__hint--badges" id="{id}-hint" [hidden]>
      <span class="td-badge td-dropzone__badge">JPG, PNG</span> <span class="td-badge td-dropzone__badge">Tối đa 20 MB</span>
    </div>
  </div>
  …
</div>
```

Danh sách được dựng bằng DOM API (`textContent`, `setAttribute`) — không `innerHTML` với tên file.

## Bàn phím & trợ năng

- Tab dừng ở nút **Chọn file** (rồi các nút xoá). Enter / Space trên nút mở hộp chọn. `<label for="id-của-dropzone">`
  bên ngoài → focus nút.
- Khối là `role="group"` mang tên từ `label` (hoặc `aria-label` / `<label for>` của host). Dòng gợi ý được nối vào
  `aria-describedby` của nút; lỗi (`error-text`, `setError`) → `aria-invalid` + `aria-errormessage` trên nút.
- Thêm / xoá / file bị loại được đọc qua vùng `aria-live="polite"`. Xoá một file → focus sang nút xoá kế tiếp (hoặc về
  nút Chọn file khi danh sách trống).
- Tiến độ upload: mỗi file một `role="progressbar"` có tên "Tải lên {tên file}"; khi đang chờ (chưa có tiến độ) thanh
  không có `aria-valuenow` và mang `aria-busy="true"`.
- Kéo thả chỉ dùng được với chuột/cảm ứng; bàn phím luôn có nút Chọn file. `prefers-reduced-motion`: tắt transition.
  Forced colors: viền dùng màu hệ thống.

## Bảo mật

- Tên file (do người dùng đặt, ví dụ `<img src=x onerror=…>.png`) chỉ hiện dưới dạng **text** — kể cả ở dòng bị loại
  và `aria-label` nút xoá.
- Lý do lỗi upload (`message` của giá trị reject) cũng chỉ hiện dạng **text**, tối đa 200 ký tự; chỉ nhận chuỗi, mọi
  kiểu khác → nhãn chung. Người dùng thấy nguyên văn chuỗi đó, nên **chỉ chuyển thông báo đã soạn cho người dùng** từ
  server (không stack trace, đường dẫn, câu SQL, mã nội bộ).
- **Lọc phía client là gợi ý.** Server phải kiểm lại loại file theo nội dung, kích thước, số lượng, quyền; lưu với
  tên do server sinh, ngoài web root. Chi tiết: [Bảo mật › td-dropzone](../guides/security.md#td-dropzone-upload-file).
- Kit không đọc nội dung file; object URL chỉ khi bật `preview` (ảnh), luôn được thu hồi. Ngoại lệ: khi bật `imageResize` (0.90.0) kit đọc byte của ảnh để tối ưu — cục bộ trong trình duyệt, không gửi đi đâu, không cần `img-src blob:`, không `<img>` / `Worker`. Tối ưu phía client **không thay** kiểm tra phía server (server thấy file đã bị người dùng sửa được).

## Cảm ứng

- Chạm vùng thả để mở hộp chọn file: vùng có hình nhấn (`--td-dropzone-bg-pressed` + viền accent), trừ khi `disabled` hoặc đang kéo file vào (`data-state="dragover"`). Nút "Chọn file" và nút xoá tệp có hình nhấn riêng; hover chỉ trên con trỏ mịn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Server không nhận được file**: form thiếu `enctype="multipart/form-data"`, hoặc dropzone thiếu `name`, hoặc đang
  `disabled` / trong `<fieldset disabled>`.
- **PHP chỉ nhận một file**: đặt `name="files[]"`.
- **`openPicker()` từ `setTimeout` không mở gì**: trình duyệt chỉ mở hộp chọn file trong một thao tác người dùng.
- **Thumbnail trắng**: CSP thiếu `img-src blob:`.
- **Reset không phát `files-change`**: đúng thiết kế (như input gốc); nghe `reset` của form nếu cần.
- Helper PHP: xem mục [PHP](#php-0100) bên dưới.

## PHP (0.100.0)

`td_dropzone($name, $options)` in field chọn file chạy được khi **chưa có JS**; module nâng cấp tại chỗ (ADR 0012, contract
`dropzone@1`), không dựng lại input.

```php
<form method="post" enctype="multipart/form-data">
  <?= td_dropzone('docs[]', [
    'label' => 'Tệp đính kèm', 'accept' => ['.pdf', 'image/*'], 'multiple' => true,
    'max_size' => '5MB', 'max_files' => 3, 'required' => true, 'hint' => 'Kéo thả hoặc bấm chọn.',
    'element' => true,
  ]) ?>
</form>
```

- **Option**: `label`, `hint` (= `helper_text`, map sang attribute `helper-text`), `accept` (chuỗi hoặc mảng), `accept_label`,
  `multiple`, `max_size`, `max_files`, `prompt_title`, `prompt_text`, `hint_style`, `preview`, `required`, `disabled`,
  `aria_label`, `id`, `class`, `element`. Dòng gợi ý (định dạng / dung lượng / số file) được PHP tính sẵn, cùng kết quả với JS.
- **Native (mặc định)**: `div.td-field` + `label` + `input[type=file]` thuần; chỉ giữ `name`, `accept`, `multiple`, `required`,
  `disabled`. `max_size`, `max_files`, `accept_label`, `prompt_*`, `hint_style`, `preview` bị bỏ (cần JS). **Element**:
  `['element' => true]` từng lần gọi hoặc `Td::configure(..., ['ssr_elements' => true])`; in `<td-dropzone
  data-td-ssr="dropzone@1">` chứa đúng cây JS dựng.
- **Trước khi JS nạp**: input native hiện ra (CSS `td-dropzone:not(:defined)`), nút "Chọn file" ẩn, input có `name`,
  `required`, nhãn và `aria-describedby`, không `tabindex=-1` / `aria-hidden`; server nhận file như form thường.
- **Bàn giao khi nâng cấp**: nhận chính input đó, đưa `FileList` đã chọn vào hàng đợi (im lặng, không `input`/`change`/
  `files-change`), gỡ `name` / `required`, `ElementInternals` giữ giá trị và validity (đúng một mục FormData mỗi file),
  input thành `tabindex=-1` + `aria-hidden`; focus ở input chuyển sang nút "Chọn file".
- **Markup lệch** (hoặc site ghi đè `TdDropzone.labels`, hoặc có `error-text`): render an toàn, file đã chọn giữ nguyên.
- Giới hạn: `max_size` PHP chặn ở dưới 4e16 byte.

## Xem thêm

- [Progress](progress.md) · [Hướng dẫn Form](../guides/forms.md) · [Form validation](form-validation.md) ·
  [Giới hạn khi upload ảnh](../guides/image-upload-limits.md) · [Media picker](media-picker.md) ·
  [Bảo mật](../guides/security.md#td-dropzone-upload-file) · [CSP](../guides/csp.md)
