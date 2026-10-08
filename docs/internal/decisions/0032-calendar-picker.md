# ADR 0032 — Lịch dạng lưới cho `<td-datetime-picker>`, thay tại chỗ; bỏ cửa sổ năm 2000–2099

Trạng thái: **chấp nhận** — 2026-10-09 (v0.60.0). Plan [v0.60.0-calendar-picker](../plans/v0.60.0-calendar-picker.md); kết quả đo M0
ở mục "Kết quả M0" của plan.
Nguồn: owner duyệt 2026-10-09 sau `/codex-think-about` (Claude × Codex, đồng thuận vòng 1).
Liên quan: [ADR 0006](0006-modal-no-backdrop-close.md) (modal không đóng bằng nền),
[0011](0011-minimal-surfaces.md), [0012](0012-ssr-hydration.md), [0019](0019-touch-standard.md),
[0020](0020-theme-scope-portal.md), [0025](0025-pre-upgrade-parity.md).

## Bối cảnh

- Hộp thoại v0.10–v0.59: ba ô số gõ tay (ngày / tháng / năm) + bánh xe giờ phút. Người dùng phàn nàn phải gõ.
- Hợp đồng giá trị của element (4 mode, 3 định dạng, form association, validity, helper PHP, fallback native) tốt và các
  site đang dựa vào.
- Không `min` / `max` thì năm bị giới hạn ngầm 2000–2099 (di sản dcms): một hạn chế **xác thực** gây bất ngờ; dsuite phải
  lách bằng `min` 1970.
- `<td-datetime-range>` dùng chung trình soạn một-thời-điểm (`src/form/datetime-panel.js`).

## Quyết định

1. **Thay tại chỗ, không element mới, không công tắc.** Cùng tag, attribute, định dạng, sự kiện, method, helper PHP.
   - Vì sao không `<td-date-picker>` mới: nhân đôi hợp đồng SSR / PHP / form cho một người bảo trì.
   - Vì sao không `ui="calendar"`: nhân đôi hành vi + test, và để lại một lần lật mặc định về sau.
2. **Vỏ theo bề rộng lúc mở**: ≥ 720 px popover `role="dialog"` neo vào ô (hạ tầng nổi của kit: `placeFloating`, lớp
   `popover`, cầu theme — **không** ngữ nghĩa listbox); < 720 px bottom sheet của `TdModal`. Một thân dùng cho cả hai.
   - Popover không inert trang; bẫy Tab; bấm ngoài đóng. Sheet giữ luật ADR 0006.
   - **Popover không bao giờ tràn viewport**: một vùng cuộn (lưới + bánh xe), hàng nút ghim ngoài vùng cuộn; trần cao theo
     `visualViewport` trừ lề và vùng an toàn; lật trên / dưới và thu vùng cuộn theo phía có chỗ; khi cả hai phía đều chật
     thì kẹp vào viewport như color-picker (được che ô neo). Ngưỡng chuyển sang kẹp: vùng cuộn sau khi thu theo phía còn dưới `min(220 px, nội dung)` (đo M0; số liệu giống nhau ở 3 engine).
   - `aria-modal` trên popover: **không khai** (release lead Q4); kịch bản kiểm tay VoiceOver / NVDA giao owner (`docs/internal/roadmap.md`, mục kiểm tay còn nợ); mô hình ARIA được gate tự động bằng `locator.ariaSnapshot()`.
3. **Cam kết theo mode**: `date` / `month` / `year` chọn là ghi (một `change`, đóng, trả focus); `datetime` là nháp + "Chọn".
4. **Bàn phím lưới ngày = APG Date Picker Dialog**, không thêm không bớt. Lưới tháng / năm (APG không có mẫu): ← → ±1,
   ↑ ↓ ±3, Home / End theo hàng, PageUp / PageDown ±1 năm hoặc ±12 năm, Shift ±120 năm ở lưới năm.
   - **Chuyển khung** (bảng đầy đủ: plan D2): chọn tháng → lưới ngày; chọn năm → về khung đã mở lưới năm (ngày hoặc
     tháng); lựa chọn trung gian không phát `change`, không đóng — chỉ lựa chọn ở khung gốc của mode mới ghi.
   - **Esc luôn đóng cả dialog và huỷ, ở mọi khung** (APG; một luật). Quay lại mà không chọn = bấm lại nút tháng / năm
     đang bật trên đầu lịch (`aria-pressed`). Phương án bác: Esc lùi một khung — hai nghĩa cho một phím, lệch APG.
   - Mỗi lần đổi khung, focus vào ô hoạt động của khung mới; vùng live đọc tiêu đề khung một lần.
   - Lưới ngày là `<table role="grid">` (M0: `ariaSnapshot()` giống từng ký tự ở 3 engine; khác `div` ở chỗ `abbr` của `<th>` không vào tên trợ năng ⇒ `<th>` mang cả `abbr` lẫn `aria-label` = tên đủ của thứ). Lưới tháng / năm là `div[role=grid]` > `div[role=row]` > `div[role=gridcell]` (không dùng `button` mang `role=gridcell`).
5. **Tuần bắt đầu Thứ Hai**, cố định. Không cấu hình.
6. **Biên**: chỉ `min` / `max`. Không biên = năm 1–9999 (Gregory ngoại suy). Gỡ cửa sổ 2000–2099 ở picker, ở range
   _(theo Q1)_ và ở PHP. Không `isDateDisabled`, không biên tương đối, không preset trên picker đơn (để dành, có tên).
7. **SSR `datetime-picker@2`**; JS nhận `@1` và `@2`. Hộp đóng không đổi cấu trúc. Ô native không-JS: không `min` ngầm;
   `max` ngầm `9999-12-31[T23:59]` khi site không đặt `max` (M0: Chromium cho gõ năm 6 chữ số trong `<input type=date>` không `max`, giá trị mà element không đọc được; đây là giới hạn biểu diễn của kit, không phải cửa sổ nghiệp vụ).
   - **Schema là tham số bắt buộc xuyên cổng**: `canHydrate()` → `_ssrGate(schema)` → `_ssrNativeOk(input, mode, schema)`
     → `_nativeTemplate(mode, schema)`. Markup chéo schema (`@2` mang min / max ngầm kiểu `@1`, và ngược lại) bị từ chối.
   - Test của mỗi schema khẳng định **đường nhận tại chỗ** (danh tính node), vì render an toàn cũng cho kết quả dùng được.
8. **Model lịch thuần không dùng `Date`** (`src/utils/calendar-model.js`, số học nguyên): tránh ánh xạ năm 0–99 → 19xx của
   `new Date(y, …)` / `Date.UTC`.
9. **Lưới là module nội bộ nhận model chọn từ ngoài** (`src/form/calendar-grid.js`, tham số `cellState`): v0.61 thêm chọn
   khoảng mà không sửa điều hướng.
10. **Range ở v0.60 giữ nguyên trình soạn cũ**: `datetime-panel.js` đóng băng, chỉ range import; xoá ở v0.61.
    - DOM dialog range giống v0.59 từng ký tự, **trừ đúng** `min` / `max` của ô số "Năm" mỗi mốc khi không biên
      (`2000` → `1`, `2099` → `9999`) — hệ quả của quyết định 6; baseline DOM dùng danh sách cho phép hai attribute đó.
    - Phương án bác: uỷ thác bánh xe sang module mới (refactor đường đang chạy); range dùng lịch đơn tạm thời (đổi UI hai
      lần).
11. **Hợp đồng selector cho test tự động**: `data-date`, `data-month`, `data-year`, `data-view`, `data-dir`, `data-pick`
    trong `.td-cal` là ổn định; phần còn lại của dialog là riêng tư.
12. **Mục tiêu chạm**: 44 px trên con trỏ thô; ở 320–335 px lề ngang của sheet co từ 24 px xuống tối thiểu 4 px (`clamp(4px, (100vw − 7·44px − 2px) / 2, 24px)`; M0: 6 px chỉ cho 43,7 px/ô vì dialog có viền 1 px) — không ngoại lệ về kích thước ô.

## Bỏ

Ba ô số gõ tay; dòng xem trước; hoạt ảnh bánh xe "cuộn từ 00" lúc mở (picker); chân Đóng / Chọn ở `date` / `month` /
`year`; cửa sổ ngầm 2000–2099.

## Hệ quả

- Người dùng không còn gõ ngày trong picker. Rủi ro trợ năng đã biết (USWDS / Shopify khuyên giữ đường gõ); bù bằng lưới
  năm + `open-at`. Ô gõ phân đoạn là việc để dành, cần ADR riêng.
- Giá trị ngoài 2000–2099 trở thành hợp lệ và được gửi đi: site dựa vào cửa sổ ngầm phải đặt biên tường minh.
- DOM dialog của picker đổi; test của site bám selector riêng phải sửa (dsuite, 135 — bảng trong plan).
- Một bản (0.60) tồn tại hai bản sao code bánh xe; hết ở 0.61.
- `@1` còn sống tới khi mọi site lên ≥ 0.60.
- Gate mới: model lịch (unit), mô hình ARIA của lịch ở 3 engine (`locator.ariaSnapshot()` + khẳng định trực tiếp vai trò /
  tên / trạng thái / focus — playwright-core 1.60 không có `page.accessibility.snapshot()`), ma trận chiều cao popover,
  ngân sách mở lịch (số node + 0 node mới khi đổi tháng).
- Token mới `--td-cal-*` trỏ tới token theme sẵn có; `ALGORITHM_VERSION` (4) không đổi — mọi màu của lịch là `var()` của token theme có sẵn, "không chọn được" khác "ngoài tháng" bằng gạch ngang chữ chứ không bằng màu; các cặp màu nằm trong `test/tokens/rendered-pairs.js` (fuzz 10 000 palette) và `contrast-page.js` (gate hiển thị).
- `design/liquid-glass.md` luật 4: câu về bánh xe cuộn khi mở chỉ còn đúng cho range tới 0.61.

## Đo ở thực hiện (không đổi quyết định)

- Sheet: chỉ-ngày ≈ 521 px (61–67 % ở ≥ 360×780); ngày-giờ ≈ 665 px (78–85 %, trần modal 90 %) — ngân sách 70 % của v0.36 chỉ giữ
  cho sheet chỉ-ngày; hàng nút dính đáy sheet (thân modal là vùng cuộn).
- Popover: ma trận 108 ca / engine (720–1280 × cao 400–600 × chuột + cảm ứng × date + datetime × ô neo đầu / giữa / cuối) luôn
  nằm trọn khung nhìn với hàng nút thấy được; mở ≈ 25–30 ms, 119 node (date).
- Chọn năm từ lưới ngày quay về lưới ngày, nên "đổi sang 15/03/1999" là: năm → ‹ › → năm → tháng → tháng → ngày (công thức trong docs).

## Việc để dành (không thuộc ADR này)

- v0.61.0: range dùng lịch (bấm 1 = Từ, bấm 2 = Đến, tô khoảng; ngày thứ hai sớm hơn → bắt đầu khoảng mới); xoá
  `datetime-panel.js` và `.td-dtp-panel*`.
- `isDateDisabled` (property), khi có site cần lịch nghỉ / ngày hết chỗ.
- Ô gõ phân đoạn.
- Gỡ nhánh `@1`.
