# Security

## 1. XSS: sanitize theo ngữ cảnh

Component render bằng `innerHTML`, nên mỗi giá trị phải đi qua sanitizer đúng với **ngữ cảnh** nó rơi vào.

| Ngữ cảnh | Ở đâu | Helper / luật |
|---|---|---|
| **Text HTML** | label, message, title, label option, giá trị ô bảng | `escapeHtml()` |
| **Attribute HTML** (có ngoặc kép) | `value=""`, `placeholder=""`, `data-*`, class icon, `field-id` | `escapeHtml()` (escape `& < > " '`, đủ cho attribute có ngoặc) |
| **Giá trị CSS** | `color` / `track-color` / `active-color` / `text-color` | `safeColor()`: chỉ nhận hex / tên màu / `rgb()` / `hsl()`, còn lại về mặc định. Chặn `color="red;}…"` và thoát khỏi attribute |
| **Kích thước CSS** | `width/minWidth/maxWidth` của cột bảng | `safeCssDimension()`: số + đơn vị |
| **Class name** | size / type / variant / `align` | whitelist |
| **Số** | `rows`, `max-length`, `min/max/step`, số trang | `Number()` / `clampNumber()`, không dùng chuỗi thô |

Sanitizer: `src/utils/escape.js`, `src/utils/css-safe.js`. `TdBaseElement` có `this.escapeHtml()` và `this.safeColor()`.
CSSOM (`el.style.setProperty(prop, value)`) parse `value` như **một** giá trị CSS, nên `;`/`}` không thể chèn thêm
khai báo. Đây là lớp phòng thủ thứ hai, không thay cho `safeColor`.

Mặc định mọi chuỗi đều được escape; raw HTML chỉ có khi opt-in tường minh.

## 2. Raw-HTML hatch (trusted, trách nhiệm của dev)

Không bao giờ đưa input của người dùng cuối qua các đường này:

- `TdModal.show({ body })`: `body` dạng chuỗi là HTML thô (ưu tiên truyền Node). `confirm/success/error/info`: `message` là text; `messageHtml` là HTML tin cậy (0.9.0).
- `td-table` column `render(row, rowIdxInPage)`: trả về **Node** (khuyên dùng) hoặc chuỗi HTML thô (trusted, chỉ markup của dev — không bao giờ nhúng dữ liệu hàng chưa escape). Ô không có `render` hiển thị giá trị dạng text.
- `td-empty-state` `icon`: ~~chuỗi `<svg` chèn nguyên văn~~ — **đã đóng (0.8.0)**: chuỗi SVG (deprecated) chỉ được render sau khi qua allowlist hình học dùng chung (`svgStringToDefinition`, parse `image/svg+xml`, dựng lại bằng `createElementNS`; `script`/`foreignObject`/`use`/`on*`/`style`/`url()` → từ chối, về `inbox`). Hatch được hỗ trợ: property `iconNode` (SVGElement tin cậy).

- `TdMenu` item `iconNode`: Node tin cậy (được clone). Nhãn/hint của menu, chip, gợi ý và thông báo của
  `TdFormValidation` luôn là text; `renderOption`/`renderChip` chỉ nhận Node hoặc text (0.12.0 — không có hatch HTML mới).

Dưới CSP strict, nội dung đi qua các hatch này cũng phải "sạch CSP" (không `style="…"`, không `<style>`), vì lib
không bảo đảm được phần đó.

Component mới phải tránh thêm hatch. Nếu cần (vd. `panel(ctx)` của lightbox), nhận **Element** chứ không nhận chuỗi
HTML ([ADR 0009](decisions/0009-td-lightbox-hooks.md)).

## 3. CSP

**Cam kết (từ v0.3.0):** output do lib tự sinh chạy dưới `Content-Security-Policy: default-src 'self'` **không** có
`style-src 'unsafe-inline'`: không `style="…"` khai báo, không chèn `<style>`.

Kết quả đo thực nghiệm (Playwright + header CSP thật, 2026-06-10):

| Cách style | Dưới CSP strict |
|---|---|
| `style="…"` khai báo (kể cả qua `innerHTML`) | **Bị chặn** |
| Chèn `<style>` bằng JS | **Bị chặn** (`.sheet === null`) |
| CSSOM: `el.style.x = …`, `setProperty`, `cssText` | Cho phép |
| `new CSSStyleSheet()` + `adoptedStyleSheets` (kể cả `@keyframes`) | Cho phép |

Đo thêm ở dwp (commit `34d3fa9a`): `style-src-attr 'none'` chặn attribute `style` nhưng **vẫn cho phép** ghi CSSOM `el.style`.

**Kiểm chứng:** `npm run test:csp` chạy mọi component × mọi state dưới header strict: 0 violation, parity computed
style với baseline, animation của spinner thực sự chạy. Danh mục construct đã gỡ: [test/csp/INVENTORY.md](../test/csp/INVENTORY.md).

**Giới hạn hiện tại:**
- Không còn phụ thuộc `adoptedStyleSheets`: mọi style nằm trong `td.css` (file ship kèm), giá trị per-instance đi qua
  CSSOM (`el.style.setProperty`). `adopt-styles.js` đã xoá ở 0.10.0. (Lịch sử: 0.3–0.9 component legacy dùng
  constructable sheet; bảng §3 giữ kết quả đo.)
- **CSP nonce-only (v0.5.0, đo 2026-09-27)** — `default-src 'self'; style-src 'nonce-…'; style-src-attr 'none'`:
  `td.css` qua `<link nonce>` chạy với 0 violation trên Chromium, Firefox 151 và WebKit (Safari 26.4); ghi CSSOM
  `el.style.setProperty` được áp dụng trên cả ba engine. Gate: `npm run test:tokens` (probe `adoptedStyleSheets` vẫn chạy
  nhưng chỉ để ghi nhận, không component nào cần nó).

## 4. Checklist khi viết component

- [ ] Mọi giá trị vào template đã qua helper đúng ngữ cảnh (bảng §1).
- [ ] Không `style="…"`, không `<style>`, không `@keyframes` chèn bằng JS.
- [ ] Style per-instance qua CSSOM; màu từ attribute qua `safeColor`.
- [ ] Selector id/attribute ghép từ dữ liệu phải qua `CSS.escape()`.
- [ ] Icon là SVG tĩnh trong source hoặc tạo bằng DOM API, không `innerHTML` từ dữ liệu ngoài.
- [ ] URL từ dữ liệu ngoài qua whitelist scheme (mặc định `http:`/`https:`).
- [ ] Có test XSS trong `*.browser-test.js` và state mới trong CSP matrix.
