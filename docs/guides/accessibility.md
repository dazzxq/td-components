[Tài liệu](../README.md) › Hướng dẫn › Trợ năng

# Trợ năng (accessibility)

td-components được viết theo mẫu **WAI-ARIA Authoring Practices (APG)** và được kiểm tra bằng test trình duyệt thật
(bàn phím, ARIA, focus) cùng một **gate đo tương phản trên ảnh render thật**. Nhưng kit chỉ lo phần *bên trong
component*. Nhãn, tiêu đề, alt ảnh, ngôn ngữ trang… vẫn là việc của site.

Trang này chia làm ba phần:

1. [Kit bảo đảm gì](#kit-bảo-đảm-gì) — bàn phím, ARIA, focus, media query trợ năng.
2. [Tương phản và các đánh đổi có chủ đích](#tương-phản-và-các-đánh-đổi-có-chủ-đích) — chỗ nào kit **cố ý** thấp hơn
   WCAG, và một dòng CSS để bật lại chuẩn nghiêm ngặt.
3. [Site vẫn phải làm gì](#site-vẫn-phải-làm-gì) — checklist.

## Kit bảo đảm gì

### Nguyên tắc chung

- **Light DOM, không Shadow DOM**: cây truy cập (accessibility tree) là DOM bình thường; công cụ kiểm tra (axe,
  Lighthouse) đọc được hết.
- **Control native bên trong** khi có thể: nút là `<button>`, checkbox/toggle là `<input type="checkbox">`, slider là
  `<input type="range">`, ô nhập là `<input>`/`<textarea>`. Bàn phím, focus, disabled hoạt động như native.
- **Một tab stop cho mỗi widget** (roving tabindex hoặc `aria-activedescendant`) cho các widget phức hợp: tabs,
  dropdown, chip-input, menu, wheel của datetime-picker.
- **Trạng thái nằm trong ARIA/attribute**, không chỉ trong màu: `aria-selected`, `aria-checked`, `aria-expanded`,
  `aria-invalid`, `aria-busy`, `aria-current`, `aria-sort`, `data-state`.
- **Nhãn mặc định tiếng Việt** ("Đóng", "Tùy chọn", "Đang tải…"), đổi được qua `labels` của từng component — xem
  [Mở rộng](../customization/extending.md).
- **Lỗi form** có `aria-invalid` + `aria-errormessage` + id lỗi trong `aria-describedby` (xem
  [Form](forms.md#hiển-thị-lỗi-error-contract)).

### Bàn phím theo nhóm component

**Control form đơn giản**

| Component | Phím | Ghi chú |
|---|---|---|
| `td-button` | Enter, Space | `<button>` native. Khi `loading`: vẫn focus được, `aria-busy="true"` + `aria-disabled="true"`, kích hoạt bị nuốt |
| `td-checkbox` | Space | `<input type="checkbox">` native |
| `td-toggle` | **Space** (Enter **không** bật/tắt — đúng APG switch) | `role="switch"`; khi `commit()` đang chạy: `aria-busy`, phím bị bỏ qua |
| `td-slider` | ←/↓ giảm, →/↑ tăng một `step`; PageUp/PageDown; Home/End | `<input type="range">` native, `aria-valuetext` = giá trị làm tròn theo số lẻ của `step` |
| `td-input-field` | như ô nhập native | `type="contenteditable"` → `role="textbox"` + `aria-multiline="true"` |

**Control dạng popup (combobox)**

| Component | Phím |
|---|---|
| `td-dropdown` (APG select-only combobox) | Trigger đóng: ↓/↑/Enter/Space mở, Home/End mở ở option đầu/cuối, gõ chữ = type-ahead. Đang mở: ↑/↓ (vòng), Home/End (chỉ trên trigger), PageUp/PageDown, Enter chọn (cả từ ô tìm), Alt+↑ chọn, Space trên trigger chọn/đóng, **Escape đóng + focus trigger**, Tab từ ô tìm về trigger, Tab trên trigger đóng và đi tiếp |
| `td-chip-input` (APG combobox, list autocomplete) | Một tab stop (ô nhập). ↓ mở + di chuyển, Alt+↓ mở không di chuyển, ↑ di chuyển, Enter chọn option / khớp chính xác / tạo mới (`allow-create`), Escape đóng popup (popup đã đóng: xoá chữ), Backspace hoặc ← ở đầu ô → nút xoá của chip cuối. Trên nút xoá chip: ←/→/Home/End di chuyển, Delete/Backspace/Enter/Space xoá, → qua chip cuối hoặc Escape về ô nhập |
| `td-datetime-picker` (APG date picker dialog) | Trigger: Enter/Space/↓/Alt+↓ mở (không bao giờ submit form). Trong dialog: focus bắt đầu ở ô ngày; mỗi wheel giờ/phút là một tab stop: ↑/↓ ±1, PageUp/PageDown ±6 giờ / ±15 phút, Home/End. "Chọn" xác nhận, **Escape / X / "Đóng" huỷ bản nháp**; focus về trigger |

Trong mọi popup trên, option **không bao giờ nhận focus thật**; control đang focus mang `aria-activedescendant`.

**Điều hướng, hiển thị dữ liệu**

| Component | Phím / hành vi |
|---|---|
| `td-tabs` (APG tabs) | ←/→ (vòng, đảo chiều khi RTL), Home/End di chuyển focus. Mặc định **kích hoạt thủ công**: Enter/Space chọn. `activation="auto"`: mũi tên chọn luôn |
| `td-pagination` | Các nút thường; trang hiện tại `aria-current="page"`; sau khi đổi trang focus về nút vừa bấm (hoặc trang hiện tại); dòng thông tin `aria-live="polite"` (tắt bằng `quiet`) |
| `td-table` | Cột sắp xếp được là `<button class="td-table__sort">` trong `th`, `th` có `aria-sort`; vùng cuộn thành `role="region"` focus được **chỉ khi tràn** (cuộn bằng bàn phím) |

**Lớp nổi (overlay)**

| Component | Focus & phím |
|---|---|
| `TdModal` | Focus vào dialog khi mở (field đầu tiên, hoặc `focusTarget`); mọi thứ bên dưới `inert`; **Tab bị giữ trong dialog**; **Escape bị nuốt và không đóng** (trừ khi `escapeCloses: true`); click backdrop **không** đóng ([ADR 0006](../internal/decisions/0006-modal-no-backdrop-close.md)); đóng thì focus về nút đã mở |
| `TdLoading` (overlay) | Chặn toàn trang (`inert`), Escape bị nuốt, Tab bị giữ; `role="status"` + `aria-live="polite"`; đóng thì trả focus |
| `TdLightbox` | `role="dialog"` + `aria-modal="true"`; ←/→ ảnh trước/sau; F toàn màn hình; **Escape đóng** (trừ khi focus đang ở trình phát video); Tab bị giữ; click nền đóng (tắt bằng `closeOnBackdrop: false`); đóng thì trả focus |
| `TdMenu` (APG menu button) | Trigger: click / ↓ / ↑ mở. Trong menu: ↑/↓ (vòng), Home/End, type-ahead không dấu, Enter/Space kích hoạt; item `aria-disabled` vẫn focus được nhưng không làm gì (đúng APG); **Escape đóng + focus trigger**; Tab/Shift+Tab đóng và đi tiếp từ trigger |
| `TdHovercard` | Focus bàn phím vào trigger mở ngay; Tab từ trigger vào phần tử focus được đầu tiên của card; Shift+Tab từ phần tử đầu về trigger; Tab từ phần tử cuối đóng card và đi tiếp; Escape đóng; card chỉ do chuột mở thì không cướp focus. Hover chỉ trên thiết bị `(hover: hover) and (pointer: fine)` |
| `TdTooltip` | Hiện khi hover **và khi focus**; di chuột lên được bong bóng (WCAG 1.4.13); Escape ẩn; không tự ẩn theo thời gian; nối vào trigger bằng `aria-describedby` |
| `TdToast` | `role="status"` (lỗi: `role="alert"`); hẹn giờ **tạm dừng** khi chuột ở trên, khi focus ở trong, khi tab ẩn (WCAG 2.2.1); mọi toast có nút đóng focus được; nút đóng tham gia vòng Tab của modal đang mở |

### Nhiều lớp chồng nhau

Mọi lớp nổi đăng ký với một bộ điều phối chung (`src/utils/layers.js`): **Escape đi tới lớp trên cùng**, lớp dưới không
nhận. Ví dụ dropdown mở trong modal: Escape đóng dropdown, modal vẫn mở. Tooltip trên modal: Escape chỉ ẩn tooltip.
Lớp chặn (modal, lightbox, loading) làm mọi thứ bên dưới `inert`; lớp trôi (dropdown, menu, tooltip, hovercard, toast)
không bao giờ làm gì `inert`.

### Tên truy cập của control

Control form: `label` (hiển thị) → `aria-label` trên host → `<label for="id-host">` bên ngoài. Chi tiết:
[Form › Label](forms.md#label-và-tên-truy-cập).

Tooltip có chính sách tên cố định (chỉ áp cho `<button>`, `<a href>`, `input[type=button|submit|reset|image]` và role
`button|link|tab|menuitem`):

- trigger đã có tên → bỏ `title` (tránh đọc hai lần), tooltip là **mô tả** khi đang hiện;
- chưa có tên nhưng có `title` → `title` chuyển thành `aria-label`;
- chưa có tên, không `title` → nội dung tooltip thành `aria-label` **kèm `console.warn`** (hãy đặt tên thật).

Nút chỉ có icon (`<td-button icon="…" aria-label="…">`, `TdMenu.button({ ariaLabel })`) **phải** có `aria-label`.
`TdMenu.button()` không nhãn sẽ dùng `TdMenu.labels.trigger` ("Tùy chọn").

### Media query trợ năng

| Tuỳ chọn người dùng | Kit làm gì |
|---|---|
| `prefers-reduced-motion: reduce` | Không co/giãn khi nhấn, không phóng to khi hiện, không nảy (overshoot); chuyển cảnh chỉ còn mờ dần ~120ms; knob toggle/slider không "nâng"; spinner overlay không quay; wheel datetime cuộn không animation. Mọi file CSS component có nhánh reduced-motion |
| `prefers-reduced-transparency: reduce` | Kính (glass) thành **nền đặc**, không blur, không sheen (hiện chỉ Chromium hỗ trợ query này) |
| `<html data-td-glass="off">` | Công tắc tay cho site/người dùng, cùng hiệu ứng như trên — dùng cho Safari/iOS (không có query reduced-transparency) |
| `prefers-contrast: more` | Bề mặt gần đen/trắng đặc, viền tương phản (`currentcolor`), không blur, không viền sáng, không gradient |
| `forced-colors: active` | Dùng màu hệ thống (`Canvas`, `CanvasText`, `ButtonText`…), bỏ bóng, bỏ filter, bỏ gradient |
| Trình duyệt không có `backdrop-filter` | Kính thành nền đặc (chữ không bao giờ nằm trên nền trong suốt không blur) |

Các nhánh fallback này dùng biến **private** `--_td-*` với `!important` trong layer đầu tiên, nên token site ghi đè
(ví dụ `--td-glass-bg`) **không thể** vô hiệu hoá chúng. Gate `npm run test:tokens` kiểm tra forced-colors,
prefers-contrast, reduced-motion trên Chromium/Firefox/WebKit.

Chế độ tối **không tự bật** theo `prefers-color-scheme`; site bật bằng `<html data-td-theme="dark">`. Xem
[Theming](../customization/theming.md).

## Tương phản và các đánh đổi có chủ đích

### Gate tương phản (`npm run test:contrast`)

Không đo trên giấy mà **chụp ảnh render thật**: mỗi biến thể nút × trạng thái (thường / disabled / loading) và mỗi loại
toast, sáng + tối, trên 4 nền (đen, trắng, bàn cờ, ảnh màu bão hoà), trên Chromium/Firefox/WebKit. Lấy tương phản
**nhỏ nhất** giữa chữ/icon và điểm ảnh nền thật (sau blur, sheen, tint…). Ngưỡng:

| Thành phần | Ngưỡng | So với WCAG |
|---|---|---|
| Chữ trên nút / toast | ≥ 4.7:1 | cao hơn 4.5:1 (1.4.3) để có biên an toàn |
| Icon, nút đóng, spinner | ≥ 3.2:1 | cao hơn 3:1 (1.4.11) |
| Chữ và icon của nút **disabled** | ≥ 2.2:1 | WCAG miễn trừ control không hoạt động — đây là lựa chọn "xám đi" có chủ đích |

Gate cũng kiểm tra `opacity: 1` trên phần tử và tổ tiên (không cho làm mờ cả khối để "giấu" lỗi).

### Đánh đổi 1: viền control mềm (dưới WCAG 1.4.11)

Theo yêu cầu của owner (v0.14.1, v0.14.2), viền **lúc nghỉ** và **lúc hover** của input-field, textarea, dropdown,
datetime-picker, chip-input, checkbox, toggle dùng tông xám nhạt kiểu Apple:

| Token | Giá trị sáng | Tương phản trên nền trắng | Dùng cho |
|---|---|---|---|
| `--td-control-border-soft` | `#d1d1d6` | ~1.5:1 | viền lúc nghỉ |
| `--td-control-border-hover` | `#aeaeb2` | ~2.2:1 | viền khi hover, viền option đang active |
| `--td-control-border-strong` | `var(--td-gray-500)` = `#8a8a93` | ~3.4:1 | mức đạt chuẩn |

WCAG 1.4.11 yêu cầu ranh giới của control ≥ 3:1 khi đó là thứ duy nhất nhận ra control. Kit bù bằng: vòng focus rõ
(`--td-focus-ring`), nhãn hiển thị, nền control. Nếu site của bạn cần chuẩn nghiêm ngặt (cơ quan nhà nước, hợp đồng
yêu cầu WCAG AA), thêm **một khối CSS unlayered**:

```css
/* Chuẩn WCAG 1.4.11: viền control ≥ 3:1 cả lúc nghỉ lẫn hover */
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

Nó áp cho cả chế độ tối (vì `--td-control-border-strong` tự đổi theo theme; bản tối `#8a8a93` trên nền `#111113`
≈ 5.5:1).

### Đánh đổi 2: nút disabled "xám đi" (≥ 2.2:1)

Từ v0.14.3, nút disabled dùng nền `#f4f4f5`, chữ `#a1a1aa` (≈ 2.3:1), viền `#e4e4e7`; tối: nền `#202024`, chữ `#6b6b73`
(≈ 3.1:1). WCAG 1.4.3 và 1.4.11 **miễn trừ** control không hoạt động, nên đây vẫn hợp lệ; mục đích là người dùng nhận ra
ngay nút không bấm được. Nếu site muốn chữ disabled vẫn đọc dễ:

```css
:root { --td-btn-disabled-fg: #6b6b73; }                       /* ≈ 4.8:1 trên #f4f4f5 */
:root[data-td-theme="dark"] { --td-btn-disabled-fg: #a1a1aa; } /* ≈ 6.3:1 trên #202024 */
```

Phải khai báo riêng cho tối: CSS unlayered của site thắng mọi layer của kit, nên một dòng `:root` duy nhất sẽ áp cả
cho chế độ tối.

Vì sao dùng CSS "unlayered": token của kit nằm trong `@layer td.tokens`; CSS của site không nằm trong layer nào luôn thắng,
không cần `!important`. Xem [Styling](../customization/styling.md) và [Theming](../customization/theming.md).

### Tuỳ biến màu an toàn

- `td-button` với `color="…"` tự chọn chữ đen/trắng theo tương phản WCAG (đổi bằng `text-color`); nền tuỳ chỉnh luôn
  được vẽ **đặc** (màu trong suốt được trộn với trắng trước).
- Khi đổi `--td-accent` hay màu biến thể, bạn tự chịu trách nhiệm tương phản — gate chỉ đo giá trị mặc định. Kiểm tra
  lại bằng công cụ đo (DevTools, axe) sau khi đổi.

## Site vẫn phải làm gì

Kit không thể đoán nội dung của bạn. Checklist cho mỗi trang:

**Ngôn ngữ và cấu trúc**

- [ ] `<html lang="vi">` (hoặc ngôn ngữ thật của trang). Nhãn mặc định của kit là tiếng Việt; site ngôn ngữ khác phải
      đổi `labels` của component (xem [Mở rộng](../customization/extending.md)) **và** đặt `lang` đúng.
- [ ] Một `<h1>` mỗi trang, heading theo thứ tự. `td-table` có `heading-level` (2–6, mặc định 3) cho tiêu đề bảng;
      `td-empty-state` có `heading-level` — chỉnh cho khớp cấu trúc trang.
- [ ] Landmark: `<header>`, `<nav aria-label>`, `<main>`, `<footer>`; link "Bỏ qua tới nội dung".
- [ ] `<title>` mô tả trang.

**Nhãn và nội dung**

- [ ] Mọi control form có tên: `label`, `aria-label`, hoặc `<label for>`. Placeholder **không** phải nhãn.
- [ ] Nút chỉ có icon có `aria-label`. Đừng dựa vào tooltip để đặt tên (kit sẽ `console.warn`).
- [ ] Modal có `title` có nghĩa (thành tên của dialog). Nếu `showHeader: false`, title vẫn thành `aria-label`.
- [ ] Ảnh có `alt` (ảnh trang trí: `alt=""`). Lightbox lấy `alt` từ `<img>` hoặc `item.alt`, caption từ
      `data-td-lightbox-caption` / `<figcaption>` / alt — nếu nguồn không có alt, lightbox cũng không có.
- [ ] Video có phụ đề/bản ghi (kit chỉ dựng trình phát, không có nội dung).
- [ ] Spinner inline `TdLoadingSpinner.create({ label: 'Đang tải danh sách' })`: truyền `label` nếu spinner mang ý
      nghĩa (không có `label` thì spinner là trang trí, `aria-hidden="true"`).
- [ ] Không dùng toast cho thông tin **bắt buộc phải đọc** hay cần hành động: toast tự biến mất. Dùng modal hoặc thông
      báo inline.
- [ ] Không truyền đạt thông tin chỉ bằng màu (ví dụ chỉ tô đỏ ô lỗi mà không có chữ).

**Tương tác**

- [ ] Phần tử tuỳ biến của site có `:focus-visible` rõ ràng (dùng `--td-focus-ring` cho đồng bộ).
- [ ] Trigger hovercard/menu nên là `<a href>` hoặc `<button>`; phần tử không focus được sẽ được gán `tabindex="0"`
      trong lúc bind, nhưng thẻ đúng ngữ nghĩa vẫn tốt hơn.
- [ ] Vùng chạm tối thiểu 44px cho control tự làm (`--td-touch-min`).
- [ ] Không chặn zoom (`user-scalable=no`).
- [ ] Nếu site có cài đặt "giảm trong suốt" cho người dùng, đặt `<html data-td-glass="off">` (bỏ blur, nền đặc).

**Kiểm tra**

- [ ] Duyệt trang chỉ bằng bàn phím (Tab, Shift+Tab, Enter, Space, Escape, mũi tên).
- [ ] Chạy axe / Lighthouse; thử VoiceOver (macOS/iOS) hoặc NVDA (Windows) cho form và modal quan trọng.
- [ ] Thử Windows High Contrast (forced colors) và "Increase contrast" của macOS.

## Xem thêm

- [Form](forms.md) — nhãn, lỗi, validation
- [Theming](../customization/theming.md) — token, dark theme, glass on/off, viền mềm
- [Styling](../customization/styling.md) — `@layer`, override CSS
- [Cách hoạt động](../concepts/how-it-works.md) — lớp nổi (layers)
- Tài liệu nội bộ: [Luật minimal surfaces](../internal/design/liquid-glass.md)
