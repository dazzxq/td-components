[Tài liệu](../README.md) › [Components](README.md) › Progress

# Thanh tiến độ — `<td-progress>`

Thanh ngang cho biết một việc đã xong bao nhiêu phần trăm (upload, import, xử lý nhiều bước). Có `value` → thanh
xác định (determinate); không có `value` → thanh "đang chạy" không biết trước tiến độ (indeterminate). Bốn màu
(`primary`, `success`, `danger`, `warning`), hai cỡ (`sm`, `md`). `<td-dropzone>` dùng nó cho tiến độ từng file.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/progress'` (class: `import { TdProgress } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.18.0 |

## Ví dụ nhanh

```html
<td-progress value="40" label="Đang tải lên"></td-progress>
<td-progress value="3" max="8" variant="success" size="sm" label="Bước 3/8"></td-progress>
<td-progress label="Đang xử lý"></td-progress> <!-- indeterminate -->

<script type="module">
  import '@dazzxq/td-components/progress';
</script>
```

## Cách dùng

### 1. Cập nhật tiến độ

```js
const bar = document.querySelector('td-progress');
bar.value = 75;                  // hoặc bar.setAttribute('value', '75')
bar.value = null;                // bỏ value → indeterminate
```

Đổi attribute → cập nhật tại chỗ (không dựng lại DOM), độ rộng chuyển mượt.

### 2. Xác định hay không xác định

- `value` là số → thanh dài `value / max`, kẹp vào `0..max`.
- Không có `value` (hoặc không phải số) → **indeterminate**: một đoạn chạy qua lại; host có `aria-busy="true"`,
  không có `aria-valuenow`. Người dùng bật `prefers-reduced-motion` → không chạy, hiện một thanh đầy nhạt màu.

### 3. Chữ hiển thị

Component **không** hiện chữ (chỉ có thanh). Cần dòng "40 %" / "3/8 file" thì đặt text của bạn cạnh nó; `label`
là tên cho trình đọc màn hình.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `value` | number | — (indeterminate) | Giá trị hiện tại, kẹp `0..max`. Vắng / không phải số → indeterminate. |
| `max` | number | `100` | Giá trị tối đa (≤ 0 hoặc không phải số → `100`). |
| `label` | string | — | Tên truy cập (thành `aria-label` của host). |
| `variant` | `primary` \| `success` \| `danger` \| `warning` | `primary` | Màu thanh. Giá trị khác → `primary`. |
| `size` | `sm` \| `md` | `md` | Độ dày: 4px / 8px. |

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `value`, `max`, `label`, `variant`, `size` | string | Phản chiếu attribute. |
| `indeterminate` | boolean (chỉ đọc) | `true` khi không có `value` hợp lệ. |
| `percent` | number \| null (chỉ đọc) | `0..100` đã làm tròn; `null` khi indeterminate. |
| `TdProgress.labels` | static object | `valueText: '{n}%'` — chữ `aria-valuetext` (dịch được). |

```js
TdProgress.labels.valueText = '{n} percent';
```

## Event

Không có event.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-progress-h-sm` / `--td-progress-h-md` | `4px` / `8px` | Độ dày theo `size` |
| `--td-progress-radius` | `var(--td-radius-full)` | Bo góc |
| `--td-progress-track` | `var(--td-color-border)` | Nền rãnh |
| `--td-progress-primary` | `var(--td-accent)` | Màu `primary` |
| `--td-progress-success` / `-danger` / `-warning` | `--td-color-success` / `-error` / `-warning` | Màu các biến thể |
| `--td-progress-indeterminate-w` | `40%` | Độ dài đoạn chạy (indeterminate) |
| `--td-progress-indeterminate-dur` | `1.4s` | Thời gian một lượt chạy |

Thanh thuộc lớp nội dung → nền và màu đặc, không kính (luật Liquid Glass).

## Cấu trúc DOM & class

```html
<td-progress value="40" label="Đang tải lên"
  role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-valuetext="40%" aria-label="Đang tải lên">
  <div class="td-progress td-progress--md td-progress--primary" data-state="determinate|indeterminate">
    <div class="td-progress__bar"></div> <!-- width đặt qua CSSOM -->
  </div>
</td-progress>
```

Độ rộng thanh được gán bằng `el.style.setProperty('width', …)` (CSSOM) — markup không có `style="…"` nên chạy được
dưới CSP chặt.

## Bàn phím & trợ năng

- **Host** là `role="progressbar"`: `aria-valuemin="0"`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` ("40%").
  Indeterminate: bỏ `aria-valuenow` / `aria-valuetext`, thêm `aria-busy="true"`.
- `label` → `aria-label`. Không có `label` thì bạn tự đặt `aria-label` / `aria-labelledby` lên thẻ (component không
  xoá chúng).
- Không nhận focus. `prefers-reduced-motion`: tắt animation và transition. Forced colors: thanh dùng `Highlight`.

## Bảo mật

- `label` là **text** (gán qua `setAttribute`). Không có HTML thô.

## Lưu ý & lỗi thường gặp

- **Thanh không hiện**: `<td-progress>` là `display: block`, rộng 100% khung chứa — trong flex container với
  `align-items: flex-start` nó co về 0; cho nó `width` hoặc `align-self: stretch`.
- **Muốn thấy phần trăm bằng chữ**: tự hiển thị (component chỉ đọc cho trình đọc màn hình).

## Xem thêm

- [Dropzone](dropzone.md) (tiến độ upload từng file) · [Loading](loading.md) (spinner / màn chờ toàn trang)
