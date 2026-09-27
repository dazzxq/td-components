# Conventions

## File & đặt tên

- Một component một file: `src/<nhóm>/td-<tên>.js` (nhóm: `form` / `feedback` / `display`; base ở `src/base`, helper ở `src/utils`).
- Tag `td-<tên>`, class `Td<Tên>`. Subpath export trùng tên component (`./toggle` → `td-toggle`).
- Đăng ký có kiểm tra trùng: `if (!customElements.get('td-x')) customElements.define('td-x', TdX)`.
- Không side effect nặng lúc import. Việc cần DOM (adopt sheet, tạo container) làm lazy ở lần connect/show đầu.
  (Ngoại lệ đã biết: `td-tooltip` tự khởi tạo singleton; `td-toast` có top-level `await`, đang sửa ở B7.)
- Scalar qua **attribute** (kebab-case), dữ liệu mảng/object/callback qua **JS property**. Event là `CustomEvent`
  qua `this.emit()`, tên kebab-case (`tab-change`, `page-change`) hoặc tên native (`change`, `input`, `click`).
- Class CSS custom có tiền tố `td-`. Từ v0.5: BEM `td-x__el--mod`, state qua `aria-*` / `data-state` ([ADR 0008](decisions/0008-drop-tailwind-token-css.md)).
- Stories: `*.stories.js`, CSF với template là **chuỗi HTML thường** (không lit-html).
- JS + JSDoc, không TypeScript.

## Escaping theo ngữ cảnh

| Ngữ cảnh | Dùng |
|---|---|
| Text HTML | `escapeHtml()` |
| Attribute HTML (có ngoặc kép) | `escapeHtml()` |
| Giá trị màu CSS | `safeColor()` / `safeHexColor()` |
| Kích thước CSS | `safeCssDimension()` |
| Class name (size/variant/type) | whitelist |
| Số | `Number()` / `clampNumber()`, không dùng chuỗi thô |
| Style per-instance | CSSOM (`applyStyles`, `setProperty`), không bao giờ `style="…"` |

Chi tiết và danh sách raw-HTML hatch: [security.md](security.md).

## Test

| Lệnh | Tầng | File |
|---|---|---|
| `npm run test:node` | Node + DOM shim tối giản, logic thuần | `src/**/*.test.js` |
| `npm run test:browser` | Chromium thật qua `@web/test-runner` (form association, XSS, CSP fallback) | `src/**/*.browser-test.js` |
| `npm run test:csp` | Playwright + header CSP strict: 0 violation + parity computed style với baseline (70 state) + animation liveness | `test/csp/` |
| `npm test` | cả ba | |

- Đổi visual có chủ đích → chạy lại `npm run capture:baseline` và commit baseline mới kèm lý do.
- Fixture Tailwind cho CSP gate (profile `legacy+td` = host Tailwind + td.css): `npm run build:csp-fixture` (CLI Tailwind pin version, devDependency).
- Storybook: `npm run storybook` (dev), `npm run build-storybook` (hiện đang hỏng, xem B7 trong [roadmap](roadmap.md)).

## Release

1. Cập nhật [roadmap.md](roadmap.md) (đánh `done`) và `CHANGELOG.md` (mục `## x.y.z`: Fixed / Changed / Added / Breaking).
2. Bump `version` trong `package.json` (+ `package-lock.json`).
3. `npm test` xanh.
4. Review theo quy trình Codex (impl-review, + security-review nếu đụng input/CSP) trước commit.
5. Commit, merge vào `main`, tag `vX.Y.Z`.

Consumer cài bằng `npm install github:dazzxq/td-components#vX.Y.Z`.

## Quyết định bền vững (từ lịch sử phát triển)

- `emit()` luôn `bubbles: true, composed: true`.
- Test Node dùng `node --test` + DOM shim, không thêm dependency test.
- Storybook pin 8.6.x.
- Dữ liệu phức tạp (options, columns, tabs) set qua JS property, không qua attribute.
- API form thống nhất: `getValue()` / `setValue()` / `setError()` + `checkValidity()`.
- Menu dropdown portal ra `document.body` với `position: fixed`.
- Modal/empty-state dùng `<button>` HTML thường, không phụ thuộc `td-button`. Icon là SVG inline, không Font Awesome
  (ngoại lệ: attribute `icon` của `td-button` nhận class icon của host).
- Tabs đổi active bằng cập nhật DOM trực tiếp để indicator trượt mượt; toggle cập nhật DOM nhẹ để transition chạy.
- `TdModal.loading()` đã bỏ, dùng `TdLoading.show()/hide()`.
- `td-modal` không đóng khi click backdrop và không đóng bằng ESC ([ADR 0006](decisions/0006-modal-no-backdrop-close.md)).
- Flag mặc định-bật (`searchable`, `allow-clear`) chỉ tắt bằng giá trị falsy tường minh (`"false"`/`"0"`/`"off"`); setter JS ghi `="false"` chứ không `removeAttribute`.
- Không dùng class Tailwind trong markup component (guard test `src/styles/no-tailwind.test.js`); chỉ `td-*`.
