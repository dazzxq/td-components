# ADR 0014 — Breakpoint chung + quy ước `@container` / `@media` (responsive toàn kit)

Trạng thái: chấp nhận (2026-10-04) — plan [v0.34.0-responsive](../plans/v0.34.0-responsive.md) APPROVED qua
`/codex-plan-review` (3 vòng). Nguồn: audit đo thật 2026-10-04 (Chromium + WebKit + Firefox, 10 độ rộng + 2 khổ ngang, chuột / cảm
ứng; số liệu trong plan), yêu cầu breakpoint của dsuite (`dienthoaihay/docs/06-TD-COMPONENTS-REQUESTS.md`: < 480,
480–767, 768–1023, 1024–1279, ≥ 1280; máy gập mở ~840–884, iPad mini / iPad dọc 744–834; ô chạm ≥ 44px khi
`pointer: coarse`; ưu tiên container query trong component).

## Bối cảnh

Kit hiện có 5 ngưỡng viết tay không thống nhất: `640px` (modal sheet, drawer full màn hình, media picker CSS **và**
`matchMedia` JS), `767px` / `900px` (lightbox), `window.innerWidth >= 768` (dropdown / tree-select tự focus ô tìm), docs
table gợi ý `max-width: 640px`. Không component nội dung nào dùng `@container`: bảng, phân trang, tab chỉ biết co lại theo
viewport nên **đặt trong cột hẹp của trang desktop vẫn vỡ** như trên điện thoại. Không có ngưỡng theo **chiều cao** →
điện thoại xoay ngang (844 × 390) mất lưới media picker. CSS custom property **không dùng được** trong điều kiện
`@media` / `@container`, nên "token breakpoint" phải là hằng số có kiểm tra tự động, không phải `--td-*`.

## Quyết định

1. **Bộ kích thước có tên (một bộ số cho cả viewport lẫn container)**

   | Tên | Khoảng (px CSS) | Thiết bị điển hình |
   |---|---|---|
   | `xs` | < 480 | điện thoại dọc 360–430 |
   | `sm` | 480 – 719 | điện thoại lớn / máy gập trong khi gập ~600–690 |
   | `md` | 720 – 1023 | iPad mini dọc 744, iPad dọc 810–834, máy gập mở 840–884 |
   | `lg` | 1024 – 1279 | iPad ngang, laptop nhỏ |
   | `xl` | ≥ 1280 | desktop |
   | `short` (chiều cao) | ≤ 500 | điện thoại xoay ngang (390–430 cao) |

   **Lệch có chủ đích so với dsuite:** ranh giới `sm/md` là **720**, không phải 768 — dsuite xếp iPad mini dọc (744) vào
   nhóm 768–1023, điều đó không thể với ngưỡng 768. 720 giữ đúng ý dsuite (744 là "tablet dọc") và vẫn tách máy gập khi gập
   (≤ ~690) ra khỏi tablet. Các ngưỡng còn lại trùng dsuite (480, 1024, 1280).

2. **Viết điều kiện**
   - `@media`: dạng cổ điển `(max-width: 719.98px)` / `(min-width: 720px)` (kit hỗ trợ Chrome 102 — range syntax của
     `@media` cần 104). Chiều cao: `(max-height: 500px)`.
   - `@container`: range syntax `(width < 720px)` (mọi trình duyệt có container query đều có range syntax).
   - Chỉ được dùng các số **480 / 720 / 1024 / 1280** (và `-0.02px`) cho chiều rộng, **500** cho chiều cao. Ngoại lệ phải
     có comment `/* bp-exception: lý do */`. Gate `npm run check:css` (mở rộng `scripts/build-css.mjs --check`) quét
     `src/styles/**/*.css`; node test quét `src/**/*.js` cấm `innerWidth` / `matchMedia('(…width…)')` ngoài
     `src/utils/breakpoints.js`.
   - JS dùng `src/utils/breakpoints.js` (`BREAKPOINTS = { sm: 480, md: 720, lg: 1024, xl: 1280 }`, `SHORT = 500`,
     `mqBelow(name)`, `isCoarsePointer()` = `(hover: none) and (pointer: coarse)`), không viết số tay.

3. **`@container` hay `@media` — theo câu hỏi "bố cục phụ thuộc vào cái gì"**
   - **`@container`** — component nằm trong dòng nội dung, bố cục phụ thuộc **chỗ nó được đặt**: `td-table` (card),
     `td-pagination` (gọn), `td-tabs`, `td-repeater` (hàng), `td-dropzone`, `td-empty-state`, `td-alert`, `td-media-field`,
     `td-media-grid`, và **phần thân** media picker (`.td-modal__body` của picker là container).
   - **`@media` viewport** — lớp phủ định vị theo viewport: modal / sheet, drawer, toast, lightbox, loading, scroll-top,
     popup (dropdown, chip-input, tree-select, menu, tooltip, hovercard, datetime); và mọi điều kiện **thiết bị**:
     `pointer`, `hover`, `max-height` (`short`), `prefers-*`, `forced-colors`.
   - **Hợp đồng hỗ trợ giữ nguyên** (Chrome / Edge 102+, Firefox 112+, Safari 16.4+). Chrome 102–104 không có container
     query → mỗi khối `@container td-<x> (width < N)` có fallback chức năng `@supports not (container-type: inline-size)
     { @media (max-width: N−0.02px) { …cùng luật… } }` — bố cục theo **viewport** thay vì chỗ đặt (đúng cho trang một cột
     trên điện thoại). Fallback do `scripts/build-css.mjs` **sinh** lúc build `td.css` (không viết tay hai lần), `check:css`
     giữ đồng bộ; node test kiểm đủ cặp, engines test ép đường fallback bằng `td.css` biến đổi. Một bộ luật cần chạy dưới nhiều điều kiện container (card của `td-table` theo `card-below`) cũng chỉ viết **một lần** — khối `/* @td-variants … */ … /* @td-variants-end */` được `build-css` sinh lại cho từng điều kiện (bản sinh gọn, không comment); không chép tay. JS của component không
     được phụ thuộc vào việc container query có chạy.
   - `.td-modal--viewport` (media picker từ v0.33) là lớp phủ full viewport ở **mọi** kích thước: chỉ bố cục bên trong đổi
     theo `md` / `short`; luật sheet / hộp giữa chỉ áp cho modal thường. `td-media-grid` (kể cả Σ của `justified` v0.33)
     theo container.

4. **Quy tắc đặt container (tránh bẫy size containment)**
   - Tên: `container: td-<component> / inline-size`, đặt trên **host block-level có bề rộng từ cha** (`display: block`,
     `inline-size` auto). `inline-size` containment làm bề rộng không còn phụ thuộc nội dung → host co theo nội dung
     (flex item `flex: 0 1 auto`, `inline-block`, `float`) sẽ sụp về 0. Chỗ kit tự đặt component trong flex (phân trang
     trong header bảng) thì kit cho `flex: 1 1 auto; min-inline-size: 0`. Docs từng component ghi rõ "cần bề rộng từ cha".
   - Không lồng query theo tên của component khác; query không tên chỉ nhắm container gần nhất của chính nó.

5. **Luật nền cho mọi component (đo bằng gate, không chỉ review)**
   - Không bao giờ gây cuộn ngang trang ở 360px; không phần tử nào lọt ra ngoài mép trái (vùng **không cuộn tới được**).
   - Host form control co theo cha: `min-inline-size: 0`, chữ giá trị cắt `…` — dùng được tới 160px, không ép cột grid.
   - `pointer: coarse` → vùng chạm hiệu dụng ≥ 44 × 44 (đo bằng `elementFromPoint`, nên `::before` mở rộng phải không bị
     `overflow` của tổ tiên cắt). Chuột → ≥ 24 × 24 (WCAG 2.5.8).
   - Lớp phủ: nút đóng / hành động chính luôn nằm trong viewport (kể cả `short`); `env(safe-area-inset-*)` ở mọi cạnh lớp phủ
     chạm mép màn hình.
   - Chữ: không chồng lấn; cắt `…` chỉ khi có cách xem đủ (tooltip / `title` / mở rộng), nhãn tab không bao giờ cắt.

## Hệ quả

- Đổi ngưỡng nhìn thấy được: modal sheet `≤ 640` → `< 720`; bố cục trong media picker `< 768` (v0.33) → `< 720`; drawer full màn hình `≤ 640` → `< 480`
  (480–719: `min(size, 100vw − 3rem)`); lightbox `767 / 900` → `720 / 1024`. Ghi Changed trong CHANGELOG, trang upgrading.
- `td-table` mặc định `layout="auto"` chuyển sang card khi container `< 720px` — thay đổi hình ảnh trên mobile cho mọi site;
  lối thoát `layout="table"` (giữ cuộn ngang).
- Thêm một gate test responsive 3 engine (overflow, vùng chạm, lớp phủ trong viewport, chồng chữ, ARIA của card) — không so
  pixel; screenshot chỉ là artifact CI để người xem.
- Breakpoint của site dùng chung bộ số này (docs `concepts/responsive.md`); site muốn số khác chỉ đổi được bố cục **trang**,
  không đổi được ngưỡng bên trong component (không có biến trong query — chấp nhận, đổi lại là đoán được và test được).
