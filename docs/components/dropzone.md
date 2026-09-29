[Tài liệu](../README.md) › [Components](README.md) › Dropzone

# Chọn / kéo thả file — `<td-dropzone>`

Vùng kéo-thả file kèm nút "Chọn file", lọc theo loại / kích thước / số lượng, danh sách file đã chọn (tên, kích
thước, nút xoá) và lý do file bị loại. **Form-associated**: file được gửi cùng `<form>` dưới `name` như một
`<input type="file">` thật. Tuỳ chọn: hook `upload` để tải lên ngay (thanh `<td-progress>` từng file, huỷ bằng nút
xoá) và thumbnail cho ảnh.

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
    // Server trả {"message": "File quá 5 MB"} (chuỗi đã soạn cho người dùng) → hiện ở dòng file.
    // Không có message → Error rỗng → kit dùng nhãn chung "Tải lên thất bại".
    let msg = '';
    try { msg = JSON.parse(xhr.responseText).message; } catch { /* body không phải JSON */ }
    reject(new Error(typeof msg === 'string' ? msg : ''));
  };
  xhr.onerror = () => reject(new Error('Mất kết nối, thử lại sau'));
  signal.addEventListener('abort', () => xhr.abort());
  const body = new FormData();
  body.append('file', file);
  xhr.send(body);
});
```

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
không bao giờ tạo object URL và không đọc nội dung file. CSP cần `img-src … blob:`.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên trường trong form (mỗi file một mục). Dùng `files[]` cho mảng PHP. |
| `label` | string | — | Nhãn hiển thị phía trên (đặt tên cho nhóm). Có `required` → thêm dấu `*`. |
| `accept` | string | — (mọi loại) | Loại được nhận: `type/sub`, `type/*`, `.ext`, cách nhau bởi dấu phẩy. |
| `accept-label` | string | — | Chữ hiển thị cho phần định dạng của dòng gợi ý (mục 2): không đặt = in `accept`; rỗng = bỏ phần định dạng. Không ảnh hưởng lọc. |
| `multiple` | boolean | `false` | Cho chọn nhiều file (không có: file mới thay file cũ). |
| `max-size` | string | — | Kích thước tối đa mỗi file: byte hoặc `KB`/`MB`/`GB`. |
| `max-files` | number | — | Số file tối đa (khi có `multiple`). |
| `preview` | boolean | `false` | Thumbnail cho ảnh (object URL). |
| `required` | boolean | `false` | Bắt buộc có ít nhất một file. |
| `disabled` | boolean | `false` | Vô hiệu hoá (xem mục 3). |
| `error-text` | string | — | Thông báo lỗi hiển thị dưới component (như các field khác). |

Đổi `label`, `accept`, `accept-label`, `multiple`, `max-size`, `max-files`, `preview`, `required`, `disabled` → dựng lại giao diện
(danh sách file được giữ).

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `files` | `File[]` (chỉ đọc, bản sao) | File đang chọn. `getValue()` trả cùng giá trị. |
| `upload` | `(file, { onProgress, signal }) => Promise` \| `null` | Hook upload (mục 4). Gán trước khi gắn vào trang cũng được. |
| `uploading` | boolean (chỉ đọc) | Còn file đang upload. |
| `addFiles(files)` | → `{ accepted, rejected }` | Thêm file bằng JS (có lọc + hook), **không** phát event. |
| `setValue(files)` | → `{ accepted, rejected }` | Thay toàn bộ danh sách (có lọc), không phát event. |
| `removeFile(indexOrFile)` | method | Xoá một file (huỷ upload của nó), không phát event. |
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

```js
import { TdDropzone } from '@dazzxq/td-components';
Object.assign(TdDropzone.labels, { prompt: 'Drop files here or', browse: 'Browse', remove: 'Remove {name}' });
```

Nhãn mới có hiệu lực ở lần dựng lại kế tiếp (đổi attribute, thêm/xoá file).

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `files-change` | `{ files: File[], rejected: { file, reason: 'type'\|'size'\|'count', message }[] }` | Người dùng chọn / thả / xoá file (cả khi mọi file đều bị loại). API JS và reset form **không** phát. |

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
| `--td-dropzone-bg-disabled` | `var(--td-field-bg-disabled)` | Nền khi vô hiệu hoá |
| `--td-dropzone-border` | `var(--td-control-border-strong)` | Viền nét đứt (≥ 3:1) |
| `--td-dropzone-border-active` | `var(--td-accent)` | Viền khi rê / kéo qua |
| `--td-dropzone-radius` | `var(--td-radius-lg)` | Bo góc vùng chọn |
| `--td-dropzone-pad` | `var(--td-space-lg) var(--td-space-md)` | Đệm vùng chọn |
| `--td-dropzone-icon` / `--td-dropzone-hint` | `var(--td-color-text-muted)` | Màu icon / chữ gợi ý, kích thước |
| `--td-dropzone-item-bg` / `--td-dropzone-item-radius` | `var(--td-color-surface-muted)` / `var(--td-radius-md)` | Dòng file |
| `--td-dropzone-thumb` | `40px` | Cỡ thumbnail |
| `--td-dropzone-reject` | `var(--td-color-error)` | Màu dòng file bị loại |

Vùng chọn là field (lớp nội dung) → nền đặc, không kính; nút "Chọn file" là nút `secondary` của kit (kính trắng,
như `<td-button variant="secondary">`). Thanh tiến độ: token của [Progress](progress.md).

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
      <li class="td-dropzone__item" data-id="1" data-status="selected|uploading|done|error" [data-waiting]>
        [<img class="td-dropzone__thumb" alt="" src="blob:…">]
        <span class="td-dropzone__meta"><span class="td-dropzone__name">bao-cao.pdf</span>
          <span class="td-dropzone__size">1.5 KB</span><span class="td-dropzone__status" [hidden]>… (nhãn trạng thái / lý do lỗi)</span></span>
        <td-progress class="td-dropzone__progress" size="sm" label="Tải lên bao-cao.pdf" [value] [hidden]></td-progress>
        <button type="button" class="td-dropzone__remove" aria-label="Xoá bao-cao.pdf"><svg data-icon="close">…</svg></button>
      </li>
    </ul>
    <span class="td-sr-only td-dropzone__live" aria-live="polite"></span>
  </div>
</td-dropzone>
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
- Kit không đọc nội dung file; object URL chỉ khi bật `preview` (ảnh), luôn được thu hồi.

## Lưu ý & lỗi thường gặp

- **Server không nhận được file**: form thiếu `enctype="multipart/form-data"`, hoặc dropzone thiếu `name`, hoặc đang
  `disabled` / trong `<fieldset disabled>`.
- **PHP chỉ nhận một file**: đặt `name="files[]"`.
- **`openPicker()` từ `setTimeout` không mở gì**: trình duyệt chỉ mở hộp chọn file trong một thao tác người dùng.
- **Thumbnail trắng**: CSP thiếu `img-src blob:`.
- **Reset không phát `files-change`**: đúng thiết kế (như input gốc); nghe `reset` của form nếu cần.
- Không có helper PHP; markup SSR = thẻ `<td-dropzone …>` (nội dung do JS dựng). Cần chạy không JS thì in thêm
  `<input type="file" name="…">` gốc bên ngoài (hoặc trong `<noscript>`).

## Xem thêm

- [Progress](progress.md) · [Hướng dẫn Form](../guides/forms.md) · [Form validation](form-validation.md) ·
  [Bảo mật](../guides/security.md#td-dropzone-upload-file) · [CSP](../guides/csp.md)
