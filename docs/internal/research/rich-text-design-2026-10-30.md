# td-rich-text — kết luận thiết kế (codex-think-about 2026-10-30, đồng thuận vòng 1)

Nguồn yêu cầu: dsuite (session dsuite-b1, owner yêu cầu 30/10/2026). Đây là kết luận think-about, CHƯA phải plan;
bước tiếp: viết plan `docs/internal/plans/v0.88.0-rich-text.md` → `/codex-plan-review` → chia lanes.

## Đồng thuận
- **Engine**: ProseMirror trực tiếp, schema tự viết (không `prosemirror-schema-basic`). Gói: model/state/view/transform/
  commands/keymap/history; `schema-list` + `inputrules` chỉ khi có list. Loại: Tiptap (lớp thừa), Lexical (HTML phải cấu
  hình thêm, không lợi gì), Quill (Delta-first, khó ra HTML đúng schema), contenteditable tự viết (IME/undo/clipboard).
- **Đóng gói**: một file ESM sinh ra `src/vendor/td-rich-text-engine.js` (esbuild bundle các gói PM + phụ thuộc bắc cầu,
  giữ license), PM là devDependency pin chính xác + lock; script build + check (deterministic). Component import bằng
  đường dẫn tương đối → Vite và import map PHP không thêm entry. Subpath opt-in `@dazzxq/td-components/rich-text`, KHÔNG
  vào root barrel. Ngân sách tạm ~100 KiB gzip cho engine — đo ở spike.
- **API v1**: `preset="comment|basic"` (mặc định comment = bold italic underline strike link; basic = + bullet-list
  ordered-list); `features="..."` ghi đè preset, token lạ cảnh báo một lần. Không object config JS. `link-target="none|
  _self|_blank"` (mặc định none). Form: name, value, required, maxlength, disabled, readonly. `value` = HTML chuẩn đã
  sanitize; attribute value ban đầu = giá trị reset.
- **Toolbar**: tự dựng theo features, thứ tự cố định, role=toolbar, roving tabindex (mũi tên/Home/End), aria-pressed.
  Hộp link: role=dialog light DOM, ô URL có nhãn, Áp dụng/Gỡ/Huỷ, Esc, kiểm URL, trả focus; giữ selection PM.
- **Sanitize**: chỉ serialize tag đã bật; không style/class/id/data-*/on*/img/embed. HTML vào parse trong document tách
  rời → `DOMParser.fromSchema` ngay, không bao giờ chèn DOM nguồn vào trang. URL validator chung cho parse + command:
  http, https, mailto, tel, tương đối, #fragment; javascript:/data:/scheme lạ → bỏ mark link, giữ chữ. Link ra luôn
  `rel="nofollow noopener"` + target theo instance; rel/target đầu vào bị bỏ. Rỗng → `""`.
- **Policy cho server**: export `RICH_TEXT_POLICY` (JS) + `rich-text-policy.json` (có version, map feature → tag/attr/
  scheme). Server tự chọn preset theo field của nó, không tin client. KHÔNG tự viết sanitizer PHP ở v1: ship PHP helper
  đọc policy, mapping `wp_kses`, fixture độc/chuẩn dùng chung; yêu cầu server sanitize lại khi ghi (và nên cả khi render).
- **Form**: kế thừa TdFormElement nhưng DOM editor bền (không rerender base). `setFormValue(html, html)` mỗi transaction;
  required = chữ hiển thị rỗng; maxlength = code point chữ hiển thị, ranh giới block/hard break = 1 newline; quá dài khi
  nạp → giữ nguyên + `tooLong`, không cắt. Reset về giá trị đầu; restore parse + sanitize lại. `input` mỗi transaction,
  `change` khi blur có đổi. Đổi features/preset → dựng lại view, sanitize lại, xoá undo history.
- **CSS**: toàn bộ trong td.css (`--td-*`, light/dark, forced-colors, disabled), chép rule thiết yếu của prosemirror.css;
  không decoration có style. Thêm vào CSP test (header thật) 3 engine.

## Phase (ước lượng của Codex, solo dev)
1. Spike đóng gói + bảo mật (1–2 ngày): build engine, đo gzip, source/dist/preload, CSP, schema + link độc.
2. Comment MVP (5–7 ngày): 5 mark, toolbar, hộp link, HTML chuẩn, form/reset/restore, validation, CSS, a11y test.
3. Preset basic (3–4 ngày): list, keymap/inputrules, paste, ma trận mobile/IME/undo.
4. Server (2–3 ngày): JSON policy có version, mapping WP, PHP loader, fixture parity, docs.
5. Sau (khi có nhu cầu thật): heading/code/quote (`full`), SSR textarea, sanitizer PHP chung.

## Câu hỏi mở (hỏi dsuite/owner)
- v1 có cần nâng cấp từ `<textarea>` render server (chạy không JS) không, hay chấp nhận cần JS?
- dsuite / 135 đã có sanitizer HTML phía server (HTML Purifier / symfony html-sanitizer / wp_kses) chưa?
- Cho phép link `http:` hay chỉ `https:`?
- `underline` có thật cần cho comment không?
- Owner có nhắc heading / quote cho "nơi khác" → đưa vào phase 5 hay kéo lên sớm?

## Trả lời của dsuite (2026-10-30) — chốt scope v0.88.0
1. Cần JS là được (modal admin, import map); KHÔNG làm nâng cấp `<textarea>`.
2. Server dùng `symfony/html-sanitizer ^8.1` → ship PHP helper map `rich-text-policy.json` sang `HtmlSanitizerConfig`
   (bỏ mapping wp_kses ở v1) + fixture độc/chuẩn dùng chung.
3. Mặc định `https` + `mailto` + `tel` + tương đối + `#`; `http` là opt-in qua attribute (vd `allow-http`) nếu rẻ.
4. Giữ `underline` trong preset comment (owner chốt B, U, I, S, link).
5. Heading/quote không cần sớm; chỉ preset comment là chặn. `basic` (list) để sau, chưa hẹn.
→ v0.88.0 = spike + comment MVP + policy JSON + PHP Symfony loader + fixture. Báo dsuite-b1 version + subpath khi phát hành
(họ nối modal trả lời lane F23/F24).
