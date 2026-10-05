[Tài liệu](../README.md) › [Components](README.md) › Steps

# Tiến trình nhiều bước — `<td-steps>`

Thanh "**① Tải tệp — ② Kiểm tra — ③ Xem trước — …**" cho một quy trình nhiều bước (wizard nhập kho, import dữ liệu):
bước đã xong (✓), bước hiện tại, bước lỗi (!), bước chưa tới; ngang hoặc dọc; tự gọn khi cột hẹp; tuỳ chọn bấm để quay lại
bước trước. **Chỉ hiển thị**: kit không chứa nội dung từng bước, không tự chuyển bước, không validate — wizard (form, nút
Tiếp / Quay lại, đổi panel) là việc của app.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/steps'` (class: `import { TdSteps } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_steps(array $steps, array $o = [])` — markup đầy đủ lúc tải, bước có link chạy không cần JS |
| Từ phiên bản | 0.45.0 (cần `td.css`) |

**Khi nào dùng gì:** số bước rời rạc có tên → `td-steps`. Một giá trị phần trăm liên tục (đang tải lên 40 %) →
[`td-progress`](progress.md).

## Ví dụ nhanh

```html
<td-steps id="wizard" current="2"></td-steps>

<script type="module">
  import '@dazzxq/td-components/steps';

  document.querySelector('#wizard').steps = [
    { label: 'Tải tệp', description: 'nhap-kho-10-2026.xlsx' },
    { label: 'Kiểm tra dữ liệu' },
    { label: 'Xem trước' },
    { label: 'Nhập kho' },
  ];
</script>
```

Key mặc định của bước = **vị trí tính từ 1** (`"1"`, `"2"`…), nên `current="2"` là bước thứ hai.

## Cách dùng

### 1. Dữ liệu (`steps`)

| Khoá | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string \| number | — (bắt buộc) | Tên bước (≤ 120 ký tự). Thiếu / rỗng → bước bị bỏ + một cảnh báo. |
| `description` | string \| number | — | Dòng phụ (≤ 300): "Đã nhập 1.250 dòng", thông báo lỗi. |
| `key` | string \| number | vị trí từ 1 | Danh tính bước (≤ 100) — giá trị của `current`. Trùng → hậu tố `-2`, `-3`… + một cảnh báo. |
| `state` | `done` \| `current` \| `error` \| `upcoming` | suy ra | Trạng thái tường minh (xem §2). |
| `href` | string | — | Bước bấm được là **link** (chạy không JS). Chỉ cùng origin (đường dẫn tương đối, `?query`, `#hash`, URL tuyệt đối cùng origin); `javascript:`, origin khác… → bỏ qua. |
| `disabled` | boolean | `false` | Không bao giờ bấm được (chữ nhạt). |

- Mọi chuỗi là **chữ** (`textContent`, không HTML); ký tự điều khiển bị bỏ. Tối đa **20 bước** (phần thừa bỏ + cảnh báo —
  wizard hơn 20 bước là vấn đề thiết kế).
- Đọc lại `el.steps` → bản đã chuẩn hoá (bản sao): `{ key, label, description, disabled, state?, href? }`.
- Gán `steps` trước khi phần tử được define vẫn được (thắng markup SSR).

### 2. Trạng thái — một luật ưu tiên duy nhất

1. **Bước hiện tại (mốc)**: có `complete` → **không có mốc**; ngược lại bước có `key` = thuộc tính `current`; không khớp
   → bước **đầu tiên** có `state: 'current'`; không có → không mốc.
2. Mốc mang `aria-current="step"` (luôn **tối đa một** phần tử). Hình của mốc: **lỗi** nếu bước đó ghi `state: 'error'`
   (import lỗi ở bước 2 — vẫn là bước hiện tại), còn lại hình "hiện tại".
3. Bước khác: `done` / `error` / `upcoming` tường minh giữ nguyên; không ghi → trước mốc là **xong**, sau mốc là **chưa
   tới** (không mốc: tất cả xong nếu `complete`, ngược lại tất cả chưa tới). `state: 'current'` ở bước không phải mốc bị
   hạ về trạng thái theo vị trí.
4. Xung đột → **một** `console.warn` mỗi lần vẽ (PHP: một `E_USER_WARNING`) với mã: `current-unmatched` (`current` không
   khớp key nào), `extra-current` (có `state: 'current'` ở bước khác mốc), `anchor-state` (mốc ghi `done` / `upcoming` —
   mốc thắng), `complete-current` (`complete` cùng `current` / `state: 'current'` — `complete` thắng).

```html
<!-- Import lỗi ở bước 2: bước 2 vẫn là bước hiện tại, hình lỗi, mô tả là thông báo lỗi -->
<td-steps current="2"></td-steps>
<script type="module">
  document.querySelector('td-steps').steps = [
    { label: 'Tải tệp' },
    { label: 'Kiểm tra dữ liệu', state: 'error', description: 'Dòng 12: thiếu IMEI' },
    { label: 'Nhập kho' },
  ];
</script>
```

Trạng thái **không chỉ bằng màu**: ✓ cho bước xong, ! cho bước lỗi, số thứ tự cho bước hiện tại / chưa tới, nhãn in đậm
cho bước hiện tại, và chữ ẩn cho trình đọc màn hình (", đã xong" / ", có lỗi" / ", chưa tới").

### 3. Thuộc tính

| Thuộc tính | Giá trị | Mô tả |
|---|---|---|
| `current` | key | Bước hiện tại. Đổi → chỉ cập nhật các bước bị ảnh hưởng (không dựng lại danh sách, focus giữ nguyên). |
| `complete` | boolean | Mọi bước xong, không có bước hiện tại ("Đã hoàn tất N/N bước"). |
| `orientation` | `horizontal` (mặc định) \| `vertical` | Dọc: marker trái, nhãn + mô tả phải, mọi bề rộng. |
| `narrow` | `compact` (mặc định) \| `vertical` | Bố cục **ngang** khi bề rộng **của host** < 480px (§5). |
| `navigation` | `none` (mặc định) \| `back` \| `all` | Bước bấm được (§4). |
| `label` | string | Tên nhóm cho trình đọc màn hình (mặc định "Tiến trình"). |

### 4. Bấm để chuyển bước (`navigation`)

- `back`: bước **xong / lỗi đứng trước** bước hiện tại (không `disabled`) bấm được — quay lại sửa. Không có mốc mà có
  `complete` → mọi bước xong / lỗi bấm được.
- `all`: mọi bước trừ bước hiện tại (không `disabled`).
- Bước bấm được có `href` → `<a>` (điều hướng bình thường, không event); không có → `<button>` phát **`step-select`**
  `{ key, index, step }`. **Kit không tự đổi `current`**: app quyết (còn validate, lưu nháp…) rồi gán `current`.
- Bàn phím: Tab qua các bước bấm được, Enter / Space. Có điều hướng thì phần bọc là `<nav aria-label>` (landmark), không
  thì `<div role="group">`.

Ví dụ wizard 3 bước (panel + focus tiêu đề panel — mẫu WAI):

```html
<td-steps id="wz" current="1" navigation="back"></td-steps>
<section id="panel-1"><h2 tabindex="-1">Thông tin</h2>…<button id="next">Tiếp</button></section>
<section id="panel-2" hidden><h2 tabindex="-1">Địa chỉ</h2>…</section>
<section id="panel-3" hidden><h2 tabindex="-1">Xác nhận</h2>…</section>

<script type="module">
  import '@dazzxq/td-components/steps';
  const wz = document.querySelector('#wz');
  wz.steps = [{ label: 'Thông tin' }, { label: 'Địa chỉ' }, { label: 'Xác nhận' }];

  function go(key) {
    wz.setAttribute('current', key);
    for (const n of ['1', '2', '3']) document.querySelector(`#panel-${n}`).hidden = n !== key;
    document.querySelector(`#panel-${key} h2`).focus(); // aria-current không tự được đọc: đưa focus tới tiêu đề panel
  }
  wz.addEventListener('step-select', (e) => go(e.detail.key));
  document.querySelector('#next').addEventListener('click', () => { /* validate… */ go('2'); });
</script>
```

Đổi `current` **không** phát thông báo live (`aria-current` không tự được đọc) — app chuyển focus tới tiêu đề panel mới như
ví dụ.

### 5. Cột hẹp

Host là container `td-steps / inline-size` (bề rộng lấy từ cha — đừng đặt trong flex `align-items: flex-start` mà không
cho bề rộng). Ngang + host < 480px:

- `narrow="compact"` (mặc định): một hàng marker + **một dòng tóm tắt**: "Bước {n}/{N}: {nhãn}" khi có bước hiện tại
  (kể cả bước lỗi), "Đã hoàn tất N/N bước" khi `complete`, "N bước" khi chưa có bước hiện tại. Nhãn các bước bị ẩn
  **trực quan** nhưng vẫn được trình đọc màn hình đọc; dòng tóm tắt là `aria-hidden`.
- `narrow="vertical"`: chuyển sang bố cục dọc (đủ nhãn).

Trình duyệt không có container query → fallback theo viewport (build CSS tự sinh).

### 6. Nhãn (site đổi được)

`TdSteps.labels` = `{ group, done, error, upcoming, summary, summaryComplete, summaryNone }` (placeholder `{n}`,
`{total}`, `{label}`). Đổi **trước** khi phần tử được define. PHP: `Td::STEPS_LABELS` (markup in nhãn mặc định; cổng
SSR nhận cả nhãn mặc định lẫn nhãn site đã đổi).

### 7. Token

`--td-steps-marker` (28px), `--td-steps-line` (2px), `--td-steps-gap`; màu (theo theme):
`--td-steps-{done,current,upcoming,error}-{bg,fg,border}`, `--td-steps-connector`, `--td-steps-connector-done` — mặc
định lấy từ hợp đồng theme (accent, surface, viền control, cặp màu lỗi của alert), nên dark / palette sinh / theme theo
vùng tự đúng. Xem [theming](../customization/theming.md).

## PHP — `td_steps()`

```php
echo td_steps([
    ['label' => 'Thông tin', 'href' => '?step=1'],
    ['label' => 'Địa chỉ', 'href' => '?step=2'],
    ['label' => 'Thanh toán'],
], ['current' => '3', 'navigation' => 'back']);
```

- **Luôn** in phần tử `<td-steps data-td-ssr="steps@1">` + đúng cây component: trang **không JS** hiện đủ trạng thái, bước
  có `href` là link chạy ngay. Bước bấm được mà không có `href` in thành `span[data-td-js-step]` (trông như bước thường,
  không có nút chết); nạp module → đúng phần tử đó thành `<button>`.
- Tuỳ chọn: `current`, `complete`, `orientation` (`vertical`), `narrow` (`vertical`), `navigation` (`back` | `all`),
  `label`, `id`, `class`, `attrs` (allowlist + `aria-*` / `data-*`; tên của component và `data-td-*` bị chặn).
- Cùng luật chuẩn hoá + luật trạng thái với JS (test parity). `href`: chỉ **tương đối** (PHP không biết origin).
- Nạp `@dazzxq/td-components/steps` → nhận markup **tại chỗ** (không nháy, không xê dịch). Markup bị sửa (thêm thuộc tính,
  `data-state` lệch luật, hai `aria-current`, link `javascript:`…) → không nhận: vẽ lại rỗng + một cảnh báo.

## Trợ năng

- `ol[role=list]` > `li`; bước hiện tại `aria-current="step"`; marker `aria-hidden`; chữ trạng thái ẩn cho trình đọc màn
  hình. Không dùng `role=progressbar` (đây là danh sách bước, không phải giá trị số).
- Cảm ứng: bước bấm được là một ô (marker + nhãn) ≥ 44 × 44 khi con trỏ thô; hình nhấn chỉ đổi màu (ADR 0019).
