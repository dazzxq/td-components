# ADR 0026 — Menu có nội dung tuỳ biến là "menu panel" (`role="dialog"` + khúc `role="menu"`)

Trạng thái: chấp nhận (2026-10-07). Nguồn: plan [v0.53.0-menu-custom-item](../plans/v0.53.0-menu-custom-item.md) QĐ 1–5b +
spike M0 `test/engines/menu-panel-a11y.spec.mjs` (Chromium CDP accessibility tree, Firefox / WebKit DOM-level, axe-core khi
có — 58 kiểm tra, cả ba engine).

## Bối cảnh

dsuite cần công tắc theme (Tự động / Sáng / Tối — `<td-choice-group variant="segmented">`) **trong** menu tài khoản
(`TdMenu`). Owner bác item cứng `{ type: 'segmented' }`: kit phải cho menu chứa **nội dung bất kỳ** (segmented, `td-tabs`,
form nhỏ, khối thông tin). Kit thêm item chung `{ type: 'custom', render(ctx) → Element }`.

`TdMenu` (v0.12) là APG Menu Button + Menu: `role="menu"`, con chỉ được là `menuitem` / `menuitemcheckbox` /
`menuitemradio` / `group` (chứa menu item) / `separator`. Đặt radio / tab / ô nhập vào `role="menu"` là cây ARIA **không
hợp lệ**.

Hai phương án:

- (a) Giữ `role="menu"`, hàng custom là `role="group"` / `none` chứa widget. Rẻ, nhưng sai luật: axe báo
  `aria-required-children` ở cả ba engine; Chromium AX đặt radio **dưới** menu (spike M0, fixture `alt`); trình đọc màn
  hình có thể giữ chế độ menu, số "n mục" sai, vai trò popup nói dối.
- (b) Popup có nội dung tuỳ biến là **dialog không modal**; các dãy mục thường liền nhau nằm trong khúc `role="menu"`
  (markup mục giữ nguyên), hàng custom là `role="group"` có tên (caption) đứng ngoài mọi menu.

## Quyết định

**(b), chỉ khi có ít nhất một hàng custom được dựng thật** — menu không có hàng custom giống từng byte v0.52 (snapshot
`test/fixtures/menu-v052-dom.json`).

- Panel: `div.td-menu.td-menu--panel[role="dialog"][tabindex="-1"]`, tên = trigger (`aria-labelledby`) hoặc
  `opts.label`; không `aria-modal`. Khúc `div.td-menu__section[role="menu"]` **không tên** (ARIA 1.2: `menu` không bắt buộc
  tên; axe không báo; Chromium AX tên khúc = "") — tránh đọc lặp tên panel. Separator giáp hàng custom nằm ở cấp panel.
- Hàng custom: `div.td-menu__custom`, có `label` → `role="group"` + `aria-labelledby` caption; không `label` → `div`
  generic. Element của caller được append nguyên trạng (không clone, không đổi attribute).
- Trigger: `bind()` / `bindAll()` vẫn đặt `aria-haspopup="menu"`; `open()` chuyển sang `"dialog"` **sau** khi đã giải
  `when` + `render` và có hàng custom thật (về `"menu"` khi lần mở sau không còn) — không quảng bá trước điều chưa chắc
  (Codex plan-review r1 #3). Chấp nhận: trước lần mở đầu trigger báo `"menu"` (RL Q4, ghi docs).
- Bàn phím: ↑ ↓ đi qua hàng (hàng custom = một điểm dừng, vào ở điểm dừng Tab đầu / cuối; hàng không có điểm dừng bị bỏ);
  trong nội dung, ← → Home End Enter Space và gõ chữ thuộc về nội dung, ↑ ↓ thuộc menu (nghe ở **capture**) trừ control tự
  dùng ↑ ↓ (ô chữ, number, range, select, textarea, contenteditable, slider / listbox / combobox / grid…) hoặc
  `[data-td-menu-keys="content"]`; Escape luôn đóng (RL Q6); Tab / Shift+Tab đi qua **mọi** điểm dừng (mỗi mục thường +
  mọi điểm dừng của hàng custom — RL Q5), di chuyển thủ công, qua mép thì hành vi D4 cũ (đóng, Tab native đi tiếp từ
  trigger). Điểm dừng tìm theo cây phẳng (`tabSequence`: nhóm radio gộp, shadow root mở, slot, `delegatesFocus`; shadow
  root đóng = host nếu host có `tabindex`).
- Chuột / chạm: bấm trong nội dung không bao giờ đóng panel (trừ `ctx.close()`); sau cú bấm, nếu focus không vào hàng
  (WebKit / Safari không focus radio / nút khi bấm) → focus control gần nhất của cú bấm, không có thì panel (QĐ 5b).
  Popup mở từ nội dung (td-dropdown…) được coi là bên trong panel và đóng theo panel.

## Hệ quả

- Trình đọc màn hình: "Tài khoản, hộp thoại" → "Hồ sơ, mục menu, 1 trên 2" → "Giao diện, nhóm, Sáng, nút radio, đã
  chọn". Nút trigger báo "có hộp thoại" từ lần mở thứ nhất. Checklist VoiceOver / NVDA chạy tay trước merge (plan, Kết quả
  M0).
- Tab trong panel khác menu thường (menu thường: Tab đóng ngay — D4 giữ nguyên). WebKit: Tab của menu đi qua cả nút / radio
  dù Safari mặc định chỉ Tab qua ô chữ — menu tự di chuyển focus, nhất quán ba engine.
- Escape trong ô nhập của nội dung đóng panel (widget site mất "Escape xoá ô" khi nằm trong menu).
- Không cache: `render` gọi mỗi lần mở; `ctx.signal` abort khi đóng (mọi lý do) để dọn listener.
- Không hatch HTML: chuỗi bị từ chối (cảnh báo cố định) — security-model §2.
- Nội dung trong shadow root **đóng** không với tới được bằng phím của menu trừ khi host có `tabindex` (giới hạn ghi docs).
