[Tài liệu](../README.md) › [Components](README.md) › Page actions

# Nút thao tác của trang — `<td-page-actions>`

Nhóm nút cạnh tiêu đề trang (h1): "Tải ảnh lên", "Nhập", "Sắp xếp", "Xuất CSV", "Xoá album"… Kit gấp chúng theo **một
chính sách chung** (cùng với [`<td-selection-bar fold="count">`](selection-bar.md)): nút chính
(`primary`) luôn hiện ở **cuối**, tối đa **2** nút phụ hiện trước nó, phần còn lại vào menu "…". Hàng tiêu đề hẹp dưới
480px → chỉ còn nút chính + "…". Tuỳ chọn `mirror` chép các nút đang hiện sang header dính của site.

Kit không tự làm thao tác nào: nút là nút / link của site, click vẫn là click của nút gốc (listener, `href`, form của
site chạy như cũ).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/page-actions'` (class: `import { TdPageActions } from '@dazzxq/td-components'`) |
| Loại | Custom element (nâng cấp markup có sẵn) |
| Form-associated | không |
| Từ phiên bản | 0.96.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<div class="page-head">          <!-- hàng tiêu đề: flex, ngưỡng 480px đo trên CHÍNH hàng này -->
  <h1>Ảnh</h1>
  <td-page-actions label="Thao tác trang">
    <a class="td-btn td-btn--secondary" href="/photos/import">Nhập</a>
    <button class="td-btn td-btn--secondary" type="button" data-td-menu="photos-sort">Sắp xếp</button>
    <button class="td-btn td-btn--secondary" type="button" data-td-in-menu>Xuất CSV</button>
    <button class="td-btn td-btn--danger" type="button" data-td-tone="danger">Xoá album</button>
    <td-button variant="primary" icon="upload" label="Tải ảnh lên"></td-button>
  </td-page-actions>
</div>
```

```css
.page-head { display: flex; align-items: center; gap: 1rem; }
```

```js
import '@dazzxq/td-components/button';
import '@dazzxq/td-components/page-actions';
```

Kết quả (rộng): `Nhập` · `Sắp xếp` · "…" (Xuất CSV, Xoá album) · `Tải ảnh lên`.

## Cách dùng

### 1. Hợp đồng markup

- Con trực tiếp là **nút**: `<button>`, `<a href>` / `<a class="td-btn">`, [`<td-button>`](button.md),
  [`<td-action-button>`](action-button.md). Con khác bị bỏ qua (giữ nguyên chỗ).
- In nút chính **cuối cùng**: không có JS (hoặc trước khi nâng cấp) mọi nút hiện, hàng tự xuống dòng, thứ tự đã đúng.
- Host chiếm phần còn lại của hàng cha (`flex: 1 1 0%`), nút căn phải (`--td-page-actions-justify`). Bề rộng host
  **không** phụ thuộc số nút đang hiện → không gấp / mở qua lại.

| Attribute trên nút | Tác dụng |
|---|---|
| `data-td-tone="primary"` | Nút chính. `<td-button variant="primary">` / class `td-btn--primary` cũng được tính. Chỉ một; có nhiều thì nút đầu (DOM) thắng, các nút sau thành nút phụ (cảnh báo một lần). |
| `data-td-tone="danger"` | Đánh dấu nút nguy hiểm (chỉ là thông tin; kiểu dáng do class nút của site). |
| `data-td-in-menu` | Luôn nằm trong "…". |
| `data-td-menu="tên"` | Nút mở [menu](menu.md) `TdMenu.define('tên', …)` neo vào **nút được bấm** (nút gốc, bản sao mirror, hay mục trong "…"). `ctx` gồm `data-td-menu-*` của nút gốc. |
| `hidden` | Không hiện, không vào "…". |
| `disabled` / `aria-disabled="true"` | Mục trong "…" cũng bị khoá. |

### 2. Luật gấp

1. Nút chính = nút không `hidden` đầu tiên có tông primary và không `data-td-in-menu`. Kit dời nó về **cuối** host (và
   giữ nó qua các lần xếp lại).
2. Hiện **2** nút phụ đầu tiên (thứ tự DOM), rồi "…", rồi nút chính.
3. Phần còn lại + mọi `data-td-in-menu` vào "…" — "…" vẫn hiện khi chỉ có 1 mục.
4. Hàng cha hẹp dưới **480px** (có độ trễ quanh ngưỡng) → chỉ nút chính + "…".
5. 2 nút phụ đang hiện mà không vừa → gấp tiếp **từ cuối** vào "…" (nới rộng thì trở lại). **Nút chính không bao giờ
   gấp.**

Nút gấp nhận `data-td-overflow` (`display: none`). Chọn một mục trong "…" = `click()` nút gốc (nút `data-td-menu` thì mở
menu đó neo vào "…").

Kit tự xếp lại khi: thêm / bớt / đổi thứ tự nút, đổi `hidden`, `disabled`, `data-td-tone`, `data-td-in-menu`,
`data-td-menu*`, nhãn; hàng cha hoặc host đổi bề rộng. Đổi DOM theo cách observer không thấy → `el.refresh()`.

### 3. Header dính — `mirror`

```html
<header class="sticky-head">
  <strong>Ảnh</strong>
  <div id="sticky-actions"></div>        <!-- kit điền bản sao vào đây -->
</header>
…
<td-page-actions label="Thao tác trang" mirror="sticky-actions">…</td-page-actions>
```

Kit điền vào phần tử `mirror` (id trong cùng document / shadow root; hoặc property `.mirror = element`) **bản sao an
toàn** của các nút đang hiện + một "…" riêng:

- container được đặt `aria-hidden="true"` (kit gỡ khi thôi mirror nếu chính kit đặt), bản sao `tabindex="-1"` → trình
  đọc màn hình và Tab chỉ thấy bộ nút gốc;
- bấm bản sao = `click()` nút gốc (nút gốc bị khoá → không gì xảy ra; link bấm kèm Ctrl / Cmd / Shift / chuột giữa để
  trình duyệt tự mở);
- menu mở từ bản sao đóng lại → focus về nút gốc (hoặc "…" gốc), không kẹt trong vùng `aria-hidden`.

Phần tử mirror không hợp lệ (chính host, nằm trong host, chứa host, không phải element) → bỏ qua, cảnh báo một lần.
Mirror là việc **trang trí**: site lo ẩn / hiện header dính.

### 4. PHP — `td_page_actions()`

```php
echo td_page_actions([
  ['label' => 'Nhập', 'href' => '/photos/import'],
  ['label' => 'Sắp xếp', 'menu' => 'photos-sort'],
  ['label' => 'Xuất CSV', 'in_menu' => true, 'attrs' => ['data-export' => 'csv']],
  ['label' => 'Xoá album', 'tone' => 'danger'],
  $canUpload ? ['label' => 'Tải ảnh lên', 'primary' => true, 'icon' => 'upload'] : null,
], ['label' => 'Thao tác trang', 'mirror' => 'sticky-actions']);
```

In host `data-td-ssr="page-actions@1"` (`Td::SSR_PAGE_ACTIONS`) + nút chính ở cuối. Bảng khoá đầy đủ:
[PHP adapter › `td_page_actions`](../guides/php-adapter.md#td_page_actions-0960).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | `TdPageActions.labels.region` | Tên nhóm (`role="group"` + `aria-label` trên host). |
| `mirror` | id | — | Phần tử nhận bản sao (§3). Đổi tại chỗ. |

## Property & method

| Tên | Kiểu | Mô tả |
|---|---|---|
| `label` | string | Phản chiếu attribute. |
| `mirror` | `Element \| null` | Ghi đè attribute `mirror`; `null` → về attribute. |
| `refresh()` | `() => void` | Xếp lại ngay. |
| `TdPageActions.labels` | `{ more, region, multiPrimary }` | `'Thao tác khác'`, `'Thao tác trang'`, cảnh báo nhiều primary. Dịch trước khi nâng cấp. |

Không có event riêng: click là click của nút gốc.

## Tuỳ biến giao diện

| Token | Mặc định | Ghi chú |
|---|---|---|
| `--td-page-actions-gap` | `--td-space-xs` | Khoảng cách giữa các nút |
| `--td-page-actions-justify` | `flex-end` | Căn nút trong host (`flex-start` để dồn trái) |

Nút dùng token của [nút](button.md). Host không có nền riêng (minimal surfaces).

## Cấu trúc DOM & class

```html
<td-page-actions class="td-page-actions" label="Thao tác trang" role="group" aria-label="Thao tác trang">
  <a class="td-btn td-btn--secondary" href="…">Nhập</a>
  <button class="td-btn td-btn--secondary" data-td-menu="photos-sort">Sắp xếp</button>
  <button class="td-btn td-btn--secondary" data-td-in-menu data-td-overflow>Xuất CSV</button>   <!-- gấp -->
  <button class="td-btn td-btn--secondary td-page-actions__more" aria-haspopup="menu" aria-label="Thao tác khác" [hidden]>…</button>
  <td-button variant="primary" …></td-button>                                                     <!-- luôn cuối -->
</td-page-actions>

<div id="sticky-actions" aria-hidden="true">                                                      <!-- mirror -->
  <a class="td-btn td-btn--secondary td-page-actions__clone" href="…" tabindex="-1">Nhập</a>
  …
  <button class="td-btn td-btn--secondary td-page-actions__more td-page-actions__clone" tabindex="-1">…</button>
  <button class="td-btn td-btn--primary td-page-actions__clone" tabindex="-1">Tải ảnh lên</button>
</div>
```

Gỡ host khỏi trang: kit gỡ "…", `data-td-overflow`, bản sao mirror; nút chính **ở lại cuối** (đúng cả khi không JS).

## Bàn phím & trợ năng

- Host `role="group"` có tên. "…" có `aria-label` + `aria-haspopup="menu"` / `aria-expanded` (do [menu](menu.md)).
- Thứ tự Tab = thứ tự thị giác (nút chính đã ở cuối DOM). Nút gấp ra khỏi cây trợ năng, truy cập qua "…".
- Chọn mục trong "…" → focus về "…"; handler của site vẫn dời focus được.

## Bảo mật

- Bản sao mirror **không** dùng `cloneNode`: dựng lại theo allowlist (class, `aria-label`, `aria-disabled`, `title`;
  link thêm `target` / `rel` / `download`, `_blank` luôn có `noopener`; `href` qua bộ lọc URL của nút). Bỏ `id`,
  `data-*`, `style`, handler, `<script>` / `<img>` / form control…; SVG chỉ giữ thẻ / attribute của bộ icon. Mọi chữ là
  text.
- Không attribute `style`: chỉ CSSOM `setProperty` cho `--td-*` → chạy dưới CSP strict.
- PHP: chữ escape, `href` qua `Td::safeUrl` (hỏng → in `<button>` + warning), `data-td-*` trong `attrs` của site bị
  bỏ. Chi tiết: [mô hình bảo mật](../internal/security-model.md).

## Cảm ứng

Nút + "…" (cả bản sao mirror) ≥ 44px trên màn chạm; hình nhấn của [nút](button.md) theo
[chuẩn cảm ứng](../internal/design/touch.md).

## Lưu ý & lỗi thường gặp

- **Luôn chỉ thấy nút chính + "…"** — hàng cha (phần tử cha trực tiếp của host) hẹp dưới 480px, hoặc host không nằm
  trong hàng flex: đặt host cạnh h1 trong một hàng `display: flex`.
- **Nút không vào "…"** — nó không phải con trực tiếp, hoặc không phải nút (§1).
- **Mirror trống** — `mirror` trỏ id không tồn tại / không hợp lệ (xem cảnh báo console).

## Xem thêm

- [Selection bar](selection-bar.md) — cùng chính sách gấp (`fold="count"`)
- [Menu](menu.md) · [Button](button.md) · [PHP adapter](../guides/php-adapter.md)
