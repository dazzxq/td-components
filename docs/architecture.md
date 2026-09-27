# Architecture

Trạng thái mô tả: **v0.4.0** (Tailwind + CSSOM). Phần cuối mô tả kiến trúc style mục tiêu đang chuyển sang.

## Cấu trúc

```
index.js                 re-export mọi thứ (import '@dazzxq/td-components')
src/base/                TdBaseElement, TdFormElement, sample/
src/form/                button, checkbox, toggle, input-field, slider, dropdown, datetime-picker
src/feedback/            modal, modal-stack, toast, tooltip, loading   (API imperative, không phải tag)
src/display/             table, tabs, pagination, empty-state
src/utils/               escape, css-safe, adopt-styles, datetime, dom-utils
src/styles/tailwind.css  chỉ cho Storybook
test/csp/                CSP parity gate (Playwright)
```

Mỗi subpath trong `package.json#exports` trỏ thẳng vào một file source (không bundle).

## Base classes

**`TdBaseElement extends HTMLElement`** (`src/base/td-base-element.js`)

- `connectedCallback` render **một lần** (`_initialized` chặn render lại khi element bị di chuyển trong DOM).
- `disconnectedCallback` chạy hết `_cleanups`.
- Attribute ↔ property tự sinh từ `observedAttributes`; `booleanAttributes` dùng `hasAttribute`.
- `attributeChangedCallback` → `_doRender()`: `innerHTML = render()` → `afterRender()` → `_applyStyles?.()`.
- Helper có cleanup tự động: `listen()`, `setTimeout()`, `setInterval()`. `emit(name, detail)` phát
  `CustomEvent` với `bubbles + composed`. `escapeHtml()`, `safeColor()`.

**`TdFormElement extends TdBaseElement`** (`src/base/td-form-element.js`), xem [ADR 0003](decisions/0003-elementinternals-form-association.md)

- `static formAssociated = true` + `attachInternals()`: submit qua `FormData`, `required`, constraint validation.
- `_setFormValue(value, state)`, `_setValidity(...)`, `checkValidity()`/`reportValidity()`.
- `formResetCallback` → `_restoreDefaults()` (giá trị mặc định chụp lúc connect, tách khỏi state sống).
- `formStateRestoreCallback` → `_restoreState()` (override ở input-field, dropdown, datetime-picker).
- `formDisabledCallback`: `_effectiveDisabled` = attr `disabled` OR `<fieldset disabled>` tổ tiên, không phản chiếu ra attribute.
- `<label for>` ngoài trỏ vào host; click label focus control bên trong.

Dùng `TdFormElement`: checkbox, toggle, input-field, slider, dropdown, datetime-picker.
`td-button` chỉ là `TdBaseElement` (không form-associated); `type=submit|reset` hoạt động nhờ `<button>` light-DOM bên trong.

**Feedback** (modal, toast, loading, tooltip) là class tĩnh, không phải custom element: container singleton
gắn vào `document.body` khi cần. Tooltip tự khởi tạo singleton khi import.

## Mô hình style hiện tại (CSP, v0.3+)

Xem [ADR 0005](decisions/0005-csp-strict-cssom-adopted-sheets.md).

| Loại style | Cách áp |
|---|---|
| Layout/màu thường | class Tailwind (host compile qua `@source`) |
| Giá trị per-instance (màu, %, px) | CSSOM trong `_applyStyles()`: `applyStyles(el, map)` / `el.style.setProperty` |
| Selector, pseudo-class, `::before`, `@keyframes`, `@media` | một constructable sheet mỗi component, `adoptStyles(css, key)`: lazy, idempotent, feature-detect, không throw ở node/SSR |
| SVG | presentation attribute (`fill`, `opacity`…) |

Giá trị động bên trong selector rule đi qua CSS custom property set bằng CSSOM.
Không có `style="…"` và không chèn `<style>` trong output của lib.

## Render & cleanup

- Render bằng `innerHTML` chuỗi template; mọi giá trị đi qua sanitizer theo ngữ cảnh ([security.md](security.md)).
- Bind event trong `afterRender()` bằng `this.listen()` để tự gỡ khi disconnect.
- Component có animation state (toggle, tabs) cập nhật DOM nhẹ thay vì render lại toàn bộ để transition chạy.
- Phần tử portal ra `body` (menu dropdown, toast, tooltip, modal) phải tự dọn khi disconnect/đóng.

## Lớp nổi (v0.9.0) — `utils/layers.js`

Mọi overlay đăng ký `register({ layer, element, blocking, keyboard, onEscape, onTab, includeInTrap })` khi mở và
`release()` khi đóng. Số layer = token z (`LAYERS`: dropdown 100, overlay 300, lightbox 350, modal 400, popover 450,
loading 480, toast 500, tooltip 510 — giữ đồng bộ với `tokens.css`).

- **Inert** (`inert-lock.js`): `blocking` (modal, lightbox, loading) làm `inert` mọi con của `body` bên dưới, trừ phần
  tử đăng ký ở layer cao hơn; đăng ký floating (menu, tooltip, toast) không inert gì, chỉ được miễn khỏi lease thấp hơn.
- **Bàn phím**: một listener `keydown` capture duy nhất. Escape → boundary cao nhất (luôn bị nuốt trừ khi `onEscape`
  trả `false`); Tab → boundary cao nhất có `onTab`, `'pass'` chuyển xuống dưới. Toast đăng ký `keyboard:'none'` +
  `includeInTrap` nên nút đóng của nó nằm trong vòng Tab của modal. Component KHÔNG tự bắt Escape/Tab trên document.
- `trapTab(e, container, layer)` là trap dùng chung; `utils/floating.js` (`placeFloating`, `isReferenceHidden`) định
  vị menu/tooltip.

## Sơ đồ phụ thuộc

```
td-base-element ──► utils/escape, utils/css-safe
td-form-element ──► td-base-element
form/* (trừ button) ──► td-form-element ;  button ──► td-base-element
td-datetime-picker ──► feedback/td-modal ──► td-modal-stack
td-table ──► td-pagination, td-empty-state
modal, lightbox, loading, dropdown, tooltip, toast ──► utils/layers ──► utils/inert-lock
dropdown, tooltip ──► utils/floating
adopt-styles ◄── datetime-picker, table (legacy, tới batch 4)
dom-utils: độc lập, không component nào bắt buộc dùng
```

## Kiến trúc style mục tiêu (đang chuyển; nền tảng ship ở v0.5.0)

Chốt ở [ADR 0008](decisions/0008-drop-tailwind-token-css.md) (2026-09-27). Áp dụng cho component token-native
từ v0.5; component legacy giữ mô hình trên cho tới khi migrate.

- **Token** `--td-*` + **layer** khai báo một lần, đứng đầu: `@layer td.tokens, td.component, td.utilities;`.
  Site override token bằng CSS **không layer** (thắng mọi layer), không sửa lõi.
- **Một file `td.css` duy nhất**, build bằng script node concat tất định từ `src/styles/*.css` theo manifest:
  prelude layer → tokens → foundations → components → utilities. File build được commit; CI build lại và diff.
  - Vite: `import '@dazzxq/td-components/td.css'`. PHP: `<link rel="stylesheet" nonce>`.
  - **Không** fallback `adoptedStyleSheets`, không CSS-in-JS từng component, không dò sentinel
    (race: component connect trước khi `<link>` tải xong → rule trùng lặp xếp sau đè lên).
- **Class**: BEM của kit 135 (`.td-x__el--mod`). State qua `aria-*` / `:checked` / `data-state`; JS không
  bật tắt class hiển thị. Một bộ từ vựng, có bảng mapping cũ → mới, không alias legacy.
- **SSR**: td sở hữu markup contract trung lập ngôn ngữ + golden HTML fixture. PHP helper (`td_ui_*` ở 135,
  `dwp_ui_*` ở dwp) nằm ở repo site, là adapter mỏng.
- **Glass**: component đọc `var(--_td-glass-X, var(--td-glass-X))`. Không khai báo alias private trên `:root`.
  Fallback a11y gán biến private kèm `!important` trên marker `.td-glass-surface`. Không lồng kính.
  Chi tiết: [design/liquid-glass.md](design/liquid-glass.md).
- **Giai đoạn trộn**: `td.css` không reset; mỗi export gắn nhãn token-native hoặc legacy (Tailwind); CSP harness
  chạy hai profile. Bỏ peer Tailwind khi component cuối cùng migrate xong.

### Nền tảng đã có (v0.5.0)

| File | Layer | Nội dung |
|---|---|---|
| `src/styles/layers.css` | — | Câu khai báo thứ tự layer duy nhất (phải đứng đầu manifest) |
| `src/styles/tokens.css` | `td.tokens` | Token public: type, spacing, gray, radius, shadow, z-index, motion, màu semantic, accent, control, glass (Regular/Clear/tint/interaction/geometry) |
| `src/styles/theme-dark.css` | `td.tokens` | `:root[data-td-theme="dark"]` — dark **chỉ bật khi site đặt attribute**, không tự theo OS |
| `src/styles/glass.css` | `td.component` + `td.tokens` | Recipe `.td-glass-surface(--strong/--lg/--clear)`, `.td-glass-dim(--text)`, `.td-glass-tint` + khối fallback |
| `src/styles/utilities.css` | `td.utilities` | `.td-sr-only` |
| `src/styles/manifest.json` | — | Thứ tự build |
| `td.css` (root) | — | File build (commit), `npm run build:css`; `npm run check:css` fail nếu cũ |

### Viết CSS cho component token-native

1. Tạo `src/styles/components/<tên>.css`, bọc trong `@layer td.component { … }`, thêm vào `manifest.json`
   (sau `glass.css`, trước `utilities.css`), chạy `npm run build:css`.
2. Chỉ đọc token (`var(--td-*)`); giá trị per-instance (vị trí, kích thước động) ghi bằng CSSOM
   `el.style.setProperty('--td-x', …)` — CSP cho phép.
3. Class BEM `.td-x__el--mod`; trạng thái qua `aria-*` / `[hidden]` / `data-state`, không bật tắt class hiển thị.
4. Bề mặt kính: thêm class recipe (`td-glass-surface …`) vào phần tử, **không** tự viết `backdrop-filter`.
   Mọi recipe mới có filter/tint phải nằm trong selector list của khối fallback trong `glass.css`.
5. Không reset/normalize toàn cục (component legacy dùng chung trang). `npm run test:csp:combined` bảo đảm điều này.

### Site tuỳ biến thế nào

```css
/* CSS của site — KHÔNG đặt trong @layer → luôn thắng td.tokens */
:root {
  --td-accent: #b3261e;
  --td-glass-bg: oklch(96% 0.014 80 / 0.72);
  --td-glass-solid: #f3efe6;          /* nền đặc khi fallback: nên khớp giấy của site */
}
:root[data-td-theme="dark"] { --td-glass-solid: #1a1714; }   /* tinh chỉnh dark riêng */
.sidebar { --td-glass-bg: rgb(0 0 0 / 40%); }                /* theme theo vùng: chạy được */
```

Không bao giờ ghi đè `--_td-*`. Tắt kính thủ công (Safari/iOS chưa có `prefers-reduced-transparency`):
`<html data-td-glass="off">`. Gate kiểm chứng: `npm run test:tokens` (Chromium/Firefox/WebKit × CSP `'self'` và nonce-only).
