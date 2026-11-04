[Tài liệu](../README.md) › [Components](README.md) › Selection bar

# Thanh thao tác hàng loạt — `<td-selection-bar>`

Thanh dính đáy hiện ra khi người dùng đã chọn ảnh trong một hoặc **nhiều** [`<td-media-grid>`](media-grid.md): nút ×
(bỏ chọn tất cả), số **tổng** đã chọn ("Đã chọn 12") và các nút thao tác của site (Tải về, Gắn thẻ, Thêm vào album,
Xoá…). Bấm một thao tác → thanh phát `selection-action` với danh sách id, rồi **tự bỏ chọn** (site giữ lại bằng
`preventDefault()`). Dùng cho thư viện ảnh theo ngày (mỗi ngày một lưới), contact sheet, màn chọn nhiều ảnh.

Kit không tự làm thao tác nào: thanh chỉ gom lựa chọn, hiện nút và báo cho site. Site gọi API, hỏi xác nhận, cập nhật
DOM.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/selection-bar'` (class: `import { TdSelectionBar } from '@dazzxq/td-components'`) |
| Loại | Custom element (nâng cấp markup có sẵn) |
| Form-associated | không |
| Từ phiên bản | 0.95.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<h3>Thứ Hai, 3 tháng 11</h3>
<td-media-grid selection-group="lib" label="Thứ Hai, 3 tháng 11">
  <div data-td-media-item data-id="p1">
    <button type="button" data-td-media-open aria-label="Ảnh 1"><img src="/img/p1.jpg" alt=""></button>
  </div>
  …
</td-media-grid>

<h3>Chủ Nhật, 2 tháng 11</h3>
<td-media-grid selection-group="lib" label="Chủ Nhật, 2 tháng 11">…</td-media-grid>

<td-selection-bar group="lib">
  <button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>
</td-selection-bar>
```

```js
import '@dazzxq/td-components/media-grid';
import '@dazzxq/td-components/selection-bar';

document.querySelector('td-selection-bar').addEventListener('selection-action', (e) => {
  const { action, ids } = e.detail;          // 'download', ['p1', 'p7', …] — thứ tự DOM qua mọi lưới
  if (action === 'download') downloadZip(ids);
  // không preventDefault() → thanh tự bỏ chọn sau listener này
});
```

## Cách dùng

### 1. Nhóm lưới: `group` hoặc `for`

- **`group="lib"`** — mọi `<td-media-grid selection-group="lib">` trong cùng document (hoặc shadow root) là một nhóm.
  Lưới thêm sau (tải thêm một ngày) tự vào nhóm, kể cả khi đang chọn. Cách nên dùng.
- **`for="grid-a grid-b"`** — danh sách id lưới (cách nhau bằng khoảng trắng), không cần sửa lưới. Một lưới chỉ thuộc
  thanh `for` **đăng ký trước**; thanh sau báo `console.warn` một lần và nhận lưới khi thanh trước rời trang.
- Có cả hai → `group` thắng, `for` bị bỏ qua (cảnh báo một lần).

Trong một nhóm, các lưới hành xử như **một danh sách**: Shift + bấm chọn dải xuyên lưới theo thứ tự DOM, khi một lưới
đang chọn thì mọi lưới đều hiện tick và bấm ảnh là lật chọn, Esc bỏ chọn cả nhóm. Chi tiết: [Media grid › Nhóm nhiều
lưới](media-grid.md#11-nhóm-nhiều-lưới--selection-group-0950).

### 2. Nút thao tác

Con trực tiếp của thanh là `<button data-td-action="…">` (giá trị không rỗng). Kit chuyển chúng vào khay, thêm class
nút ghost, bọc chữ trong `.td-selection-bar__label` và (nếu site chưa đặt) `aria-label` = chữ của nút.

| Attribute trên nút | Tác dụng |
|---|---|
| `data-td-action="tag"` | Bắt buộc. Tên thao tác, nhận lại ở `e.detail.action`. |
| `data-td-action-icon="tag"` | Icon trong [bộ icon](icons.md) (tên lạ → không icon). Khi thanh hẹp chỉ còn icon. |
| `data-td-tone="danger"` | Nút ghost đỏ (Xoá). Kit **không** tự hỏi xác nhận — xem §3. |
| `data-td-tone="primary"` | (0.96.0) Nút chính: nền accent đặc (`.td-btn--primary`), không bao giờ vào "…", giữ chữ khi thanh hẹp; `fold="count"` dời nó ra **cuối** (sau "…"). Dùng một nút; có nhiều thì chỉ nút đầu được giữ, các nút sau gấp như nút thường (`fold="count"` cảnh báo một lần). |
| `data-td-in-menu` | (0.96.0) Luôn nằm trong "…" (cả `fold="width"`). |
| `hidden` | Không hiện, không vào menu "…". |
| `disabled` / `aria-disabled="true"` | Nút không chạy: không `selection-action`, không bỏ chọn; mục trong "…" cũng bị khoá. |

Con khác của thanh (một link, một badge) cũng được đặt vào khay, sau các nút thao tác. Thứ tự nút = thứ tự DOM; đặt
thao tác quan trọng lên đầu (nút tràn vào "…" từ cuối).

### 3. Sau thao tác thanh tự bỏ chọn

Thứ tự khi bấm một nút thao tác (trên khay hoặc trong menu "…"):

1. Listener `click` của site trên nút chạy (lựa chọn còn nguyên).
2. Thanh phát `selection-action` (cancelable) — `detail: { action, ids, count, button }`.
3. Nếu **không** ai gọi `preventDefault()` trên `selection-action`: mọi lưới của nhóm (trừ lưới `disabled`) bị bỏ chọn
   (`select-change` từng lưới, `selection-change { count: 0 }` một lần, đọc "Đã bỏ chọn tất cả"), thanh ẩn và focus về ô
   vừa chọn trong lưới (không kẹt ở `body`).

`detail.ids` là bản chụp lúc bấm — vẫn đủ sau khi bỏ chọn. `preventDefault()` trên **click** không ngăn việc bỏ chọn;
chỉ `preventDefault()` trên `selection-action` mới giữ.

Thao tác cần chờ (hỏi xác nhận, gọi API rồi mới quyết định) thì giữ lựa chọn rồi tự bỏ khi xong:

```js
bar.addEventListener('selection-action', async (e) => {
  if (e.detail.action !== 'delete') return;
  e.preventDefault();                                   // gọi TRƯỚC await
  const ok = await TdModal.confirm({ title: `Xoá ${e.detail.count} ảnh?`, confirmVariant: 'danger' });
  if (!ok) return;                                      // giữ nguyên lựa chọn
  await api.deletePhotos(e.detail.ids);                 // server kiểm quyền từng id
  for (const id of e.detail.ids) document.querySelector(`[data-td-media-item][data-id="${CSS.escape(id)}"]`)?.remove();
  bar.clear({ emit: true });                            // ô đã gỡ tự rời lựa chọn; bỏ phần còn lại (nếu có)
});
```

Nút "Chọn tất cả" tự làm: `data-td-action="select-all"`, trong listener gọi `e.preventDefault()` (để không bị bỏ chọn
ngay) rồi `grid.selectAll({ emit: true })` cho từng lưới (`bar.grids`).

### 4. Hẹp: chỉ icon + "…"

Khi **thanh** rộng dưới 36rem, nút có icon chỉ còn icon (chữ vẫn là tên đọc được). Nút không vừa khay chuyển vào menu
"…" (từ cuối DOM); nới rộng lại thì trở về khay. Không nhấp nháy khi kéo cửa sổ qua lại quanh ngưỡng.

**Gấp theo số nút — `fold="count"` (0.96.0, opt-in).** Mặc định `fold="width"` giữ y hệt 0.95.0. Với `count`, thanh
theo chính sách gấp dùng chung với [`<td-page-actions>`](page-actions.md):

- hiện **2** nút thường đầu tiên (thứ tự DOM, bỏ `hidden` / `data-td-in-menu`), rồi "…", rồi nút `primary` ở cuối;
- phần còn lại + mọi `data-td-in-menu` vào "…" (kể cả khi chỉ còn 1 mục);
- thanh hẹp dưới **480px** → chỉ còn primary + "…" (ngưỡng cố định, có độ trễ chống nhấp nháy);
- 2 nút đã hiện mà vẫn không vừa → gấp tiếp từ cuối vào "…"; **primary không bao giờ gấp**;
- không có primary → chỉ 2 nút + "…".

```html
<td-selection-bar group="lib" fold="count">
  <button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="link" data-td-action-icon="link" data-td-in-menu>Sao chép liên kết</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>
  <button type="button" data-td-action="share" data-td-action-icon="upload" data-td-tone="primary">Chia sẻ</button>
</td-selection-bar>
```

Đổi `fold` tại chỗ được (thanh xếp lại ngay).

### 5. Dính đáy + `--td-selection-bar-offset`

Thanh là `position: sticky; bottom: 0` trong **khối chứa** của nó: đặt thanh **sau** các lưới, trong cùng khối cuộn.
Lưới thêm sau phải chèn **trước** thanh (`bar.before(grid)`), nếu không thanh nằm giữa trang. Muốn cố định theo
viewport: `--td-selection-bar-position: fixed` (site tự đặt bề rộng / vị trí).

Khi có thanh hiện, kit ghi `--td-selection-bar-offset` (chiều cao thanh, `0px` khi ẩn) lên `<html>` qua CSSOM (CSP
an toàn; gỡ khi thanh cuối cùng rời trang). Kit **không** tự nâng `td-scroll-top` / toast; site tự cộng:

```css
td-scroll-top { --td-scroll-top-bottom: calc(1rem + var(--td-selection-bar-offset, 0px)); }
```

### 5b. Nền kính — `surface="glass"` (0.96.0, opt-in)

Mặc định thanh là bề mặt **đặc** ([minimal surfaces](../internal/design/liquid-glass.md)). `surface="glass"` là ngoại
lệ opt-in ([ADR 0044](../internal/decisions/0044-glass-selection-bar.md)): panel nổi nền kính (94 %, blur), bo
`--td-selection-bar-glass-radius` (20px), cách đáy một khoảng **trong suốt** `--td-selection-bar-glass-gap` (12px; từ
720px: 16px; tối thiểu bằng safe area). Khoảng hở là đệm của host với `pointer-events: none` → nội dung bên dưới vẫn
bấm được; `--td-selection-bar-offset` đã gồm khoảng hở. Panel rộng đúng khối chứa (không inset ngang).

- Thiết bị không hỗ trợ `backdrop-filter`, giảm trong suốt, `data-td-glass="off"`, tương phản cao, forced colours →
  tự về nền đặc.
- Chỉ đảm bảo với `--td-selection-bar-position: sticky` (mặc định). Dùng `fixed` thì site tự đặt `inset-inline` /
  `inline-size` cho host.
- Đổi `surface` tại chỗ được; giá trị lạ → `solid`.

### 6. Khoá

`disabled` trên thanh, hoặc **mọi** lưới của nhóm đều `disabled` → thanh khoá: các nút có `aria-disabled="true"`
(vẫn focus được, không chạy). Một phần lưới `disabled` → thanh vẫn chạy, × / Esc / thao tác bỏ qua lưới đó. Mở khoá chỉ
gỡ `aria-disabled` do kit đặt; nút site tự đặt `aria-disabled="true"` giữ nguyên.

### 7. Công thức PHP

Không có helper riêng: in markup (escape chữ và `data-td-action` như mọi attribute).

```php
<?php foreach ($days as $day): ?>
  <h3><?= htmlspecialchars($day['title'], ENT_QUOTES) ?></h3>
  <td-media-grid selection-group="lib" label="<?= htmlspecialchars($day['title'], ENT_QUOTES) ?>">
    <?php foreach ($day['photos'] as $p): ?>
      <div data-td-media-item data-id="<?= htmlspecialchars((string) $p['id'], ENT_QUOTES) ?>">
        <button type="button" data-td-media-open aria-label="<?= htmlspecialchars($p['name'], ENT_QUOTES) ?>">
          <img src="<?= htmlspecialchars($p['thumb'], ENT_QUOTES) ?>" alt="">
        </button>
      </div>
    <?php endforeach; ?>
  </td-media-grid>
<?php endforeach; ?>
<td-selection-bar group="lib">
  <button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>
  <?php if ($canShare): ?>
    <button type="button" data-td-action="share" data-td-action-icon="upload" data-td-tone="primary">Chia sẻ</button>
  <?php endif; ?>
</td-selection-bar>
```

Với `fold="count"`, in nút `data-td-tone="primary"` **cuối cùng** (đúng vị trí cả khi chưa có JS). Markup lưới theo [hợp đồng](media-grid.md#1-hợp-đồng-markup). Server nhận `ids` (POST) phải kiểm quyền từng id.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `group` | string | — | Tên nhóm (`selection-group` của các lưới). Thắng `for`. Đổi tại chỗ. |
| `for` | id cách nhau bằng khoảng trắng | — | Lưới theo id (nhóm ẩn danh). Đổi tại chỗ. |
| `label` | string | `TdSelectionBar.labels.region` | Tên của vùng thanh (`role="group"`). |
| `disabled` | boolean | — | Khoá thanh (§6). |
| `fold` | `width` \| `count` | `width` | (0.96.0) Cách gấp nút (§4). Giá trị lạ → `width`. Đổi tại chỗ. |
| `surface` | `solid` \| `glass` | `solid` | (0.96.0) Nền thanh (§5b). Giá trị lạ → `solid`. Đổi tại chỗ. |

## Property & method

| Tên | Kiểu | Mô tả |
|---|---|---|
| `count` | `number` (chỉ đọc) | Tổng số ô đã chọn của nhóm. |
| `selectedIds` | `string[]` (chỉ đọc) | Id đã chọn, thứ tự DOM qua mọi lưới. |
| `getSelected()` | `() => string[]` | = `selectedIds`. |
| `grids` | `HTMLElement[]` (chỉ đọc) | Các lưới của nhóm, thứ tự DOM. |
| `clear({ emit }?)` | `({ emit?: boolean }) => void` | Bỏ chọn mọi lưới không `disabled`. `{ emit: true }` → `select-change` từng lưới + `selection-change`. |
| `group` / `for` / `label` / `disabled` / `fold` / `surface` | property phản chiếu attribute | `fold` / `surface` 0.96.0 |
| `TdSelectionBar.labels` | `{ count, clear, more, region, cleared }` | `'Đã chọn {n}'`, `'Bỏ chọn tất cả'`, `'Thao tác khác'`, `'Thao tác với mục đã chọn'`, `'Đã bỏ chọn tất cả'`. Dịch trước khi thanh nâng cấp. |

## Event

| Event | `detail` | Khi nào | Bubble |
|---|---|---|---|
| `selection-change` | `{ count, ids }` | Lựa chọn của nhóm đổi (một lần cho mỗi đợt, kể cả Shift qua nhiều lưới). | có (composed) |
| `selection-action` | `{ action, ids, count, button }` | Bấm nút thao tác (khay hoặc "…"). **Cancelable**: `preventDefault()` giữ lựa chọn (§3). | có (composed) |

Lưới vẫn phát `select-change` của riêng nó.

## Tuỳ biến giao diện

| Token | Mặc định | Ghi chú |
|---|---|---|
| `--td-selection-bar-bg` / `-fg` / `-border` / `-shadow` | `--td-glass-solid` / `--td-color-text` / `--td-glass-border` / `--td-glass-shadow` | Bề mặt đặc, một viền + một shadow, không blur |
| `--td-selection-bar-radius` | `0` | Dải ngang; đặt bo góc nếu muốn dạng viên |
| `--td-selection-bar-pad-block` / `-pad-inline` / `-gap` | `--td-space-xs` / `--td-space-sm` / `--td-space-xs` | Đệm dưới cộng thêm safe area |
| `--td-selection-bar-position` | `sticky` | `fixed` để bám viewport |
| `--td-selection-bar-z` | `--td-z-sticky` | Dưới menu / modal / toast |
| `--td-selection-bar-enter` | `150ms` | Thời gian fade khi hiện (reduced motion: không) |
| `--td-selection-bar-danger-fg` / `-danger-hover-bg` / `-danger-pressed-bg` | `--td-color-error` / `--td-action-btn-danger-hover-bg` / `--td-action-btn-danger-pressed-bg` | Nút `data-td-tone="danger"` |
| `--td-selection-bar-glass-bg` | `--td-glass-bg-strong` | (0.96.0) Nền panel khi `surface="glass"` |
| `--td-selection-bar-glass-action-fg` | `--td-btn-ghost-hover-fg` | (0.96.0) Chữ nút thao tác thường khi `surface="glass"` (đậm hơn accent một bậc để giữ tương phản AA trên kính) |
| `--td-selection-bar-glass-radius` | `--td-glass-radius` (20px) | (0.96.0) Bo panel kính |
| `--td-selection-bar-glass-gap` | `12px` (≥ 720px: `16px`) | (0.96.0) Khoảng hở trong suốt dưới panel kính |
| `--td-selection-bar-offset` | (runtime, trên `<html>`) | Chiều cao thanh đang hiện (gồm khoảng hở kính) — chỉ đọc, kit ghi |

Nút `primary` dùng token của [nút primary](button.md) (`--td-btn-primary-*`).

## Cấu trúc DOM & class

```html
<td-selection-bar class="td-selection-bar [td-selection-bar--glass]" group="lib" [data-empty] [data-disabled] [data-compact]>
  <div class="td-selection-bar__panel [td-glass-surface td-glass-surface--strong td-glass-surface--lg]" role="group" aria-label="Thao tác với mục đã chọn">
    <button class="td-btn td-btn--ghost td-selection-bar__clear" aria-label="Bỏ chọn tất cả">×</button>
    <span class="td-selection-bar__count">Đã chọn 3</span>
    <div class="td-selection-bar__actions">
      <button class="td-btn td-btn--ghost td-selection-bar__action td-selection-bar__action--icon" data-td-action="tag" aria-label="Gắn thẻ" [data-td-overflow]>
        <span class="td-selection-bar__icon" aria-hidden="true"><svg…></span>
        <span class="td-selection-bar__label">Gắn thẻ</span>
      </button>
      … (nút danger thêm .td-selection-bar__action--danger; nút primary: .td-btn--primary .td-selection-bar__action--primary)
      <button class="td-btn td-btn--ghost td-selection-bar__more" aria-haspopup="menu" aria-label="Thao tác khác" [hidden]>…</button>
    </div>
  </div>
  <span class="td-sr-only" aria-live="polite"></span>
</td-selection-bar>
```

## Bàn phím & trợ năng

- Thanh là `role="group"` có tên; × có tên "Bỏ chọn tất cả"; nút chỉ-icon giữ tên bằng `aria-label`.
- Số tổng được đọc một lần mỗi đợt ("Đã chọn 5", về 0: "Đã bỏ chọn tất cả") bởi **một** thanh của nhóm; lưới trong
  nhóm có thanh không tự đọc nữa.
- Esc (focus ở lưới hoặc thanh, không có menu / dialog mở) bỏ chọn cả nhóm.
- Khi thanh ẩn mà focus đang trong thanh, focus về ô vừa chọn (hoặc ô đầu của lưới còn lại), không rơi về `body`.
- "…" mở [menu](menu.md) của kit (mũi tên, Enter, Esc).

## Bảo mật

- Chữ nút, `label`, `data-td-action` và nhãn dịch luôn là **chữ** (không parse HTML).
- `detail.ids` đến từ DOM (người dùng sửa được bằng DevTools): **server phải kiểm quyền từng id** trước khi xoá / gắn thẻ.

## Cảm ứng

Nút ≥ 44px trên màn chạm, hình nhấn theo [chuẩn cảm ứng](../internal/design/touch.md) (nút danger có nền nhấn riêng);
chạm tick ở lưới khác mở rộng lựa chọn nhóm. Đệm dưới tính safe area (iPhone có thanh home).

## Lưu ý & lỗi thường gặp

- **Thanh không dính đáy** — lưới mới được append **sau** thanh: dùng `bar.before(grid)`.
- **Lưới không vào nhóm `for`** — `id` lưới đổi hoặc lưới đã thuộc một thanh `for` khác (xem cảnh báo console).
- **Lựa chọn mất sau thao tác** — đúng hành vi mặc định; gọi `e.preventDefault()` trên `selection-action` để giữ.
- **Lưới bị gỡ khỏi DOM** — lựa chọn của nó rời nhóm (lựa chọn = các ô đang có trên trang).

## Xem thêm

- [Media grid](media-grid.md) — lưới, `selection-group`, `item-remove`
- [Page actions](page-actions.md) — cùng chính sách gấp cho nút cạnh tiêu đề trang
- [Menu](menu.md) · [Modal](modal.md) (`TdModal.confirm`) · [Icons](icons.md)
