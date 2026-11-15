# ADR 0045 — td embed: kit chạy trong shadow root của một trang lạ (userscript)

Trạng thái: **chấp nhận** — 2026-11-15 (v0.116.0). Codex (sol/high) đồng thuận sau 2 vòng, consumer review xong, owner consumer chốt mức sàn (BTV dùng trình duyệt tự cập nhật).
Plan: [v0.116.0-td-embed](../plans/v0.116.0-td-embed.md).
Liên quan: [ADR 0008](0008-drop-tailwind-token-css.md), [theme](../../customization/theming.md) (`data-td-theme`,
0.41.0), [security-model](../security-model.md).

## Bối cảnh

Panel editor IMS4 (afamily / GenK) là một userscript Tampermonkey chèn vào trang CMS của bên thứ ba. Owner bên đó chốt:
**kit là nguồn duy nhất**, panel dùng element thật của kit, theme sáng / tối tự đổi.

Yêu cầu: cô lập style hai chiều, footprint nhỏ, đồng bộ giao diện với kit.

**Hiện trạng phía consumer:**
- kit 0.72.0;
- nhúng nguyên `td.css`, đổi `:root` thành `:host`, đặt trong `<style>` của shadow root closed;
- chỉ `td-button` là element thật;
- đổi nhãn bằng `.textContent`;
- chạy ở sandbox mặc định của Tampermonkey (`@grant GM_*`, không có `@sandbox`). DOM và `customElements` của trang
  truy cập được, biến JS global của trang thì không.

**Kit (light DOM) vỡ khi chạy trong shadow root ở những chỗ đã soát:**
- Token khai trên `:root`, mà `:root` không khớp bên trong shadow root.
- `rem` luôn tính theo `<html>` của trang. CMS hay đặt `html { font-size: 62.5% }`.
- `ownerDocument.activeElement` trả về host chứ không phải ô đang focus.
- `press.js` đọc `e.target` đã bị retarget về host.
- Module component tự define `td-*` vào registry của trang lúc load.
- Icon registry nặng 111 KB.
- Biến `--td-*` hoặc `--_td-*` mà trang đặt thì kế thừa xuyên qua shadow root.

## Quyết định

**Q1. Một artifact tự chứa.** `npm run build:embed` sinh `dist/embed/td-embed.js`.
- Đây là một module ES đã minify, chứa chuỗi CSS, icon subset, class, hàm mount và metadata build.
- Mount không fetch gì: userscript bị sandbox và `connect-src` của CMS chặn.
- File `.css` sinh kèm chỉ để soát.
- Consumer ghim đúng version.

**Q2. `mountTdEmbed(host, opts)` mở shadow root open với scoped registry.**
- Gọi `attachShadow({ mode: 'open', customElementRegistry })`. CSS nạp qua `CSSStyleSheet.replaceSync` rồi
  `adoptedStyleSheets`, không dùng `<style>`.
- Bên trong là wrapper nội bộ `.td-embed-root[data-td-theme]`.
- Handle trả về: `{ root, shadowRoot, registry, create(tag), setTheme(mode), unmount() }`.
- **Kiểm tra trước:** mọi bước (tính năng, registry, sheet) chạy trước `attachShadow`. Hỏng thì throw
  `TdEmbedError` có `code`, host còn nguyên, consumer rơi về integration cũ.
- **Unmount:** `unmount()` idempotent. Mount lại trên cùng host chỉ được khi cùng module instance.
- Open hay closed thì ranh giới CSS như nhau. Closed không phải ranh giới bảo mật.

**Q3. Cô lập style** (cô lập khỏi CSS tác giả của CMS, không phải sandbox bảo mật):
- Token và nền typography (`font`, `line-height`, `color`, `direction: ltr`, `unicode-bidi: isolate`, `color-scheme`)
  đặt trên `.td-embed-root`. Lúc build, `:root` được viết lại thành `.td-embed-root`.
- `:host { all: initial !important; display: block !important }`. Không dùng `contain`, vì nó đổi containing block và
  stacking context. Consumer tự bọc một shell ngoài host để định vị.
- `Nrem` đổi thành `calc(N * var(--td-embed-rem, 16px))`. Riêng điều kiện `@media` / `@container` giữ nguyên.
- **Cách ly custom property:** mọi `var(--x)` được tham chiếu mà không khai trong CSS embed thì được đặt
  `--x: initial` trên `.td-embed-root`.
- Chiều ra: CSS nằm trong shadow root nên không rò ra trang.

**Q4. Theme.** `data-td-theme="light|dark|auto"` (0.41.0) đặt trên `.td-embed-root`, mặc định `auto`.
`setTheme()` kiểm tra giá trị hợp lệ. Lịch đổi theo mặt trời là việc của consumer.

**Q5. Scoped custom element registry, giữ nguyên tên `td-*`.**
- Mỗi module instance có một registry riêng cho mỗi Document. Registry được tạo **từ realm của trang**
  (`host.ownerDocument.defaultView.CustomElementRegistry`) và gắn vào shadow root. Không đụng registry của trang. Bản
  inject lại hay nhiều version cùng lúc đều không xung đột.
- **Chặn define toàn cục:** module component đăng ký qua `defineElement()`. Bundle embed import `suppress.js` (leaf,
  side-effect, nằm trong `sideEffects`) trước tiên, nên không define gì toàn cục.
- **Tạo element:** consumer tạo bằng `handle.create(tag)` hoặc parse trong root. `document.createElement('td-…')` dùng
  registry của trang, nằm ngoài contract.
- **Mức sàn trình duyệt của embed:** Chrome/Edge 146, Safari 26.4, Firefox 159 (scoped registry Baseline 10/2026).
  Trình duyệt thiếu thì mount throw `'unsupported'`. Mức sàn light DOM của kit không đổi.
- **Thay cho phương án trước** (tên `td-embed-*`, viết lại selector, kiểm buildId): phương án đó giòn. JS có chỗ phụ
  thuộc tên tag (`button-busy.js` `HOSTS`) và CSS chọn theo tag ở nhiều nơi.

**Q6. Sửa lõi**, light DOM giữ hành vi:
- Focus đọc qua `getRootNode().activeElement` bằng helper `activeIn()`.
- `press.js` giữ listener ở document, tìm target qua `composedPath()`.
- Busy guard đã dùng `composedPath()`, không đổi.
- `submit` nghe trên root node.
- Event đã `composed: true`. Chỉ thêm test hồi quy.

**Q7. Bộ được bảo đảm, đợt 1.**
- **Element:** `td-button` (variant, disabled, `label`, run/busy), `td-input-field` (text, textarea), `td-alert`
  (inline).
- **Select:** `select.td-native-select` mới, công khai, có CSS tách riêng `native-select.css` dùng chung với
  dropdown. Chỉ bảo đảm control lúc đóng; danh sách option do OS vẽ.
- **Đổi nhãn nút:** chỉ qua `label`.
- **Không có trong đợt 1:**
  - form hoặc `<label for>` ngoài shadow root;
  - SSR;
  - affix, password reveal;
  - toast, overlay, dropdown;
  - Trusted Types.

**Q8. Gate.**
- File CSS liệt kê tường minh, có review.
- Kiểm tĩnh: không còn `:root` hay `rem`, mọi `var()` resolve được, keyframes và container khớp.
- Token gate = token CSS embed dùng ∪ `test/embed/consumer-tokens.json`, kiểm ở sáng và tối.
- So một tập thuộc tính đã chọn với light DOM trên trang thù địch, ở cả 3 engine.
- Gate define toàn cục: 4 gate ở plan QĐ1.
- Probe parse lồng nhau trong scoped registry.
- Icon subset; budget kích thước đo trên artifact thật.

**Q9. Đợt 2.** Dropdown cần thoát clip của tổ tiên và định vị theo anchor. Hướng khả thi là Popover + CSS anchor
positioning. Chi tiết chốt khi bắt đầu đợt 2.

## Hệ quả

- Kit có thêm một đích build, một helper mount, một bộ test cô lập và một lõi biết mình đang ở root nào. Kit vẫn
  không có "Shadow DOM mode".
- Consumer nâng lên 0.116, chuyển ô nhập / alert / select sang kit, đổi nhãn qua `label`, tạo element qua handle, tự
  bọc shell định vị và tự viết scheduler theme. Integration cũ giữ làm đường rollback.

## Phương án đã loại

- **Shadow DOM mode cho cả kit:** ngược kiến trúc gốc.
- **Recipe cho consumer tự ghép:** drift, và không sửa được lỗi lõi.
- **Chỉ class CSS:** mất trạng thái nhấn / busy / validation.
- **Tên riêng `td-embed-*` không dùng scoped registry:** giòn, xem Q5.
- **Hai file JS + CSS lúc runtime:** userscript không fetch được.
- **Shadow root closed:** không thêm cô lập, chỉ làm khó test.
- **Listener press / busy theo từng root:** `composedPath()` ở document là đủ.
