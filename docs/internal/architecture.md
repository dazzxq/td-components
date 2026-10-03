# Architecture

Trạng thái mô tả: **v0.11.0** — mọi component token-native (`td.css` + CSSOM), không còn Tailwind (ADR 0008).

## Cấu trúc

```
index.js                 re-export mọi thứ (import '@dazzxq/td-components')
src/base/                TdBaseElement, TdFormElement, sample/
src/form/                button, checkbox, toggle, input-field, slider, dropdown, datetime-picker
src/feedback/            modal, modal-stack, toast, tooltip, loading   (API imperative, không phải tag)
src/display/             table, tabs, pagination, empty-state
src/utils/               escape, css-safe, datetime, dom-utils, layers, inert-lock, scroll-lock, floating
src/styles/              tokens + component CSS → build td.css (manifest.json)
src/icons/               icon registry (Lucide)
test/csp/                CSP parity gate (Playwright)
```

Mỗi subpath trong `package.json#exports` trỏ thẳng vào một file source (không bundle).

## Base classes

**`TdBaseElement extends HTMLElement`** (`src/base/td-base-element.js`)

- `connectedCallback` render lần đầu (`_initialized`); khi element bị gỡ rồi gắn lại (di chuyển trong DOM),
  `disconnectedCallback` đã chạy hết cleanup nên nó **render lại** (`_needsRebind`) để gắn lại listener/timer —
  trừ component `static hydratable = true` (xem dưới).
- `disconnectedCallback` chạy hết `_cleanups`.
- Attribute ↔ property tự sinh từ `observedAttributes`; `booleanAttributes` dùng `hasAttribute`.
- `attributeChangedCallback` → `_doRender()`: `innerHTML = render()` → bước gắn chung `_bindStep()` =
  `afterRender()` → `_applyStyles?.()`.

**Vòng đời hydrate SSR (0.25.0, [ADR 0012](decisions/0012-ssr-hydration.md))**

```text
connectedCallback (lần đầu)
  _setupProperties()            accessor + replay property gán sớm (render bị chặn); tên đã replay → _earlyProps (0.26)
  _initialized = true
  canHydrate()                  hook, mặc định false — đọc host SAU replay; không được sửa DOM
  hydratable → gỡ data-td-ssr   dấu đã dùng (nhận hay không), lần render sau không đọc nhầm
  ├─ true  → _hydrated = true; hydrateExisting() (hook, không đụng innerHTML); _bindStep()
  └─ false → _doRender()        innerHTML = render(); _bindStep()   ← như cũ (form: rồi khôi phục state, xem dưới)
connectedCallback (gắn lại sau disconnect)
  chạy + xoá _cleanups          listener gắn TRONG LÚC tách (render khi attribute đổi) không bị nhân đôi
  hydratable && canRebind() → _bindStep()   giữ node + focus, listener gắn đúng một lần
  còn lại (kể cả canRebind() false: markup bị sửa lúc tách) → _doRender()
```

**Bổ sung 0.26.0 (F0 — plan v0.26.0):**

- **Nguồn gốc property sớm:** `_setupProperties()` ghi tên property đã replay (camelCase) vào `this._earlyProps`
  (`Set`, chỉ đọc sau khởi tạo; luôn có, rỗng khi không có gì gán sớm). Hydrate form dùng nó cho thứ tự ưu tiên ADR
  mục 3: tên có trong `_earlyProps` → **giá trị host thắng** state native; ngược lại state **sống** của control native
  thắng attribute host. Giá trị reset luôn là mặc định native (`defaultValue` / `defaultChecked`), không từ property
  sớm. (`TdInputField.setValue()` gọi trong lúc replay còn nhớ giá trị gốc ở `_earlyValue` — control `type=number`
  native sẽ làm sạch mất chuỗi không phải số trước khi hydrate đổi nó sang `text`.)
- **Không hoãn (review round 3, ADR 0012 mục 5):** bản đầu 0.26 cho `canHydrate()` trả `'defer'` (chờ `blur` khi
  control lệch đang focus, kèm `deferHydration` / `_deferred` / `_ssrMirror`); ba vòng review liên tiếp tìm lỗi ở
  đường đó nên đã **gỡ hẳn**. `canHydrate()` chỉ trả boolean; mọi lệch markup của control có state → render an toàn
  ngay + khôi phục.
- **Khung hydrate form** (`TdFormElement`): `canHydrate()` của component (dấu đúng tên — schema khác 1 vẫn đi đường
  giữ state, IMPL-1) tìm control → ghi `_ssrDefaults` (mặc định native) → `_ssrDecide(control, khớp, live)`. Nhận tại
  chỗ chỉ khi **cả** bốn cổng qua: so cấu trúc chặt với `render()` (`_markupMatches(true)`: dấu `*` ⇔ `required`, ghi
  chú lỗi ⇔ đang có lỗi — IMPL-4), thuộc tính form không-JS của control khớp host (`_ssrFormAttrsAgree`: field
  `name` `required` `disabled` `readonly` `pattern` `minlength` `min` `max` `step`; checkable `name` `required`
  `disabled`), quét cây `_ssrUnsafe()` (loại node, thẻ HTML / SVG, `type` input, allowlist attribute, **đúng một** phần
  tử form-associated là `_ssrControl`) và bộ khung `_ssrSkeletonOk()` (đúng phần / số lượng). Không qua →
  `_ssrRestore` (+ `refocus` nếu control đang focus) → render ngay → `connectedCallback` của `TdFormElement` gọi
  `_restoreSsrState` (value / selection / checked / indeterminate / id + focus, không event). Gắn lại phần tử đã
  hydrate: `_ssrRevalidate(control)` dùng cùng cổng (strict); không qua → chụp state sống → render + khôi phục
  (IMPL-2). `_ssrControl` / `_ssrState` xoá sau khi nhận / khôi phục (IMPL-3). Hook con: `_ssrCapture(control, live)`,
  `_restoreSsrState`, `_markupMatches(first)`, `_ssrSkeletonOk()`. `_ssrRetargetLabels(control)`: chỉ `<label
  for="{id control}">` **ngoài** host chuyển `for` sang host. Helper so markup dùng chung (export):
  `ssrClassKey`, `ssrContentNodes`, `ssrSameAttrs`, `ssrSamePart` (phần trang trí / text giống hệt `render()`; ô icon so
  attribute, nội dung do `fillIconSlots` vẽ lại), `ssrIsErrorNote`, `SSR_CONTROL_ATTRS` (allowlist control = tên PHP in
  + `Td::ALLOWED_ATTRS`) + `SSR_ARIA_DATA` (`aria-*`, `data-*` trừ `data-td-*`).
- `TdInputField`, `TdCheckableElement` (`TdToggle` / `TdCheckbox`) có `static hydratable = true` nhưng `canRebind()`
  chỉ `true` cho phần tử **đã hydrate** (và markup còn khớp, kiểm chặt: không còn `name` / ràng buộc của bản không-JS)
  → phần tử tạo bằng JS / viết tay vẫn render lại khi gắn lại như trước 0.26.

- `canRebind()` (mặc định `true`): component hydratable kiểm lại markup khi gắn lại; `TdButton` dùng cùng phép so
  cấu trúc + **allowlist attribute** như `canHydrate()` (review round 1 SEC-1).
- `static hydratable` (mặc định `false`): chỉ component **khai báo** mới đổi vòng đời gắn lại — v0.25 chỉ
  `TdButton`; v0.26 thêm `TdInputField`, `TdToggle`, `TdCheckbox` (gắn lại tại chỗ chỉ khi đã hydrate, xem trên). `afterRender()` của component hydratable phải **idempotent** trên DOM sẵn có (đồng bộ state tại chỗ,
  `listen()` lại), vì nó chạy sau render, sau hydrate và mỗi lần gắn lại.
- Dấu SSR `data-td-ssr="<tên>@<schema>"`: `ssrMarker(el)` (export của `td-base-element.js`) → `{ name, schema }` hoặc
  `null`; `_ssrMatches(name, schema)` so khớp chính xác. `schema` là phiên bản **cấu trúc markup** của component
  (`TdButton.SSR_SCHEMA = 1`), chỉ tăng khi giả định hydrate đổi.
- `canHydrate()` của component quyết định theo **chính sách từng thuộc tính**: thuộc tính *cấu trúc* lệch → từ chối
  (render lại), thuộc tính *trạng thái* → áp tại chỗ trong `afterRender()`. `TdButton` so cấu trúc control với
  `render()` dựng vào `<template>` (không chạm DOM sống): thẻ, class, `type` / `target` / `rel` / `download`, icon,
  nhãn, spinner. Constructor không đọc con (đúng spec custom element).
- Lưới an toàn CSS cho host viết tay chưa define: `<tag>:not(:defined):not([data-td-ssr])` → `display` + chiều cao
  giữ chỗ (button 2.5 / 2 / 3rem, input-field + dropdown 2.5rem, toggle + checkbox 1.5rem) — không giả style.
- Test: fixture dùng chung `test/ssr/button.fixtures.json` → PHP sinh `test/ssr/fixtures/button.html`
  (`node test/ssr/build-button-fixture.mjs`; `test/php/td-ssr.test.js` báo khi file cũ) → nhóm web-test-runner `ssr`
  (`*.ssr.browser-test.js`, Chromium + Firefox + WebKit) define muộn và so DOM / hộp / focus / FormData. v0.26:
  `test/ssr/form.fixtures.json` → `test/ssr/fixtures/form.html` (`node test/ssr/build-form-fixture.mjs`;
  `test/php/td-ssr-form.test.js` báo khi cũ; `test/ssr/form.native.json` = output native của 0.25 để chứng minh native
  mode giữ nguyên từng byte) → `src/form/td-form.ssr.browser-test.js` (kịch bản cần control đang focus lúc define chạy
  trong iframe, mỗi iframe một registry).
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

## Mô hình style (CSP strict, td.css + CSSOM)

Xem [ADR 0008](decisions/0008-drop-tailwind-token-css.md) (CSSOM per-instance từ [ADR 0005](decisions/0005-csp-strict-cssom-adopted-sheets.md)).

| Loại style | Cách áp |
|---|---|
| Layout/màu thường | class BEM trong `src/styles/components/*.css` (build vào `td.css`) |
| Giá trị per-instance (màu, %, px) | CSSOM trong `_applyStyles()`: `applyStyles(el, map)` / `el.style.setProperty` |
| Selector, pseudo-class, `::before`, `@keyframes`, `@media` | cũng trong file CSS của component (`td.css`); không CSS-in-JS, không constructable sheet (`adopt-styles.js` đã xoá ở 0.10.0) |
| SVG | presentation attribute (`fill`, `opacity`…) |

Giá trị động bên trong selector rule đi qua CSS custom property set bằng CSSOM.
Không có `style="…"` và không chèn `<style>` trong output của lib.

## Render & cleanup

- Render bằng `innerHTML` chuỗi template; mọi giá trị đi qua sanitizer theo ngữ cảnh ([security.md](security-model.md)).
  Ngoại lệ: markup SSR khớp hợp đồng được nhận tại chỗ (`canHydrate()` / `hydrateExisting()`, 0.25.0 — xem trên) và
  các component tự nâng cấp tại chỗ (`td-alert`).
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
- **Vòng đời theo "chủ" (v0.21.1)** — option nội bộ của `register()`, không đổi API công khai:
  - Đăng ký floating khai `anchor` (trigger) + `onCovered()`. Một đăng ký **blocking mới** có layer **thấp hơn** popup
    đang mở (modal 400 / lightbox 350 < popover 450) gọi `onCovered()` của các popup mở trước nó → popup đóng, không trả
    focus về trigger (đã inert). Loading (480) không phủ popup (giữ inert + khôi phục), trừ tooltip (`coverAlways`).
  - `coverFloatingIn(root)` / `floatingContains(root, node)`: modal / lightbox đang đóng đóng luôn các popup có anchor
    bên trong (ngay, không đợi transition thoát) và coi focus trong popup đó là "focus ở trong dialog".
    `childFloatingIn(container)`: hovercard giữ mở khi có popup con (TdMenu mở từ nút trong card), đóng con trước.
  - `watchReference(el, onChange)` (`floating.js`): ResizeObserver (trigger bị ẩn / đổi kích thước),
    MutationObserver (trigger rời DOM), `transitionend` / `animationend` của tổ tiên (modal chạy hiệu ứng vào) →
    reposition (đóng khi `isReferenceHidden`). Dùng cho dropdown, chip-input, TdMenu, hovercard, tooltip.
  - Escape: boundary cao nhất có `wantsEscape(e) !== false`. Tooltip chỉ nhận Escape khi là đăng ký boundary mới nhất
    (`isNewest()`) hoặc focus đang ở trigger của nó — tooltip hover không cướp Escape của dropdown / menu.
- **Dải modal / lightbox (v0.21.1)** `[LAYERS.lightbox, LAYERS.popover)`: blocking mở trên một blocking **cao hơn** trong
  dải (lightbox mở từ modal) được nâng: layer logic = `min(popover − 1, layer trên + 1)` (registry + inert lease), z-index
  thị giác = z-index **computed** của phần tử bên dưới + 1 (CSSOM, theo token site đã đổi). `restackBand()` tính lại
  khi đăng ký / gỡ và sau `TdModalStackManager._sync()` (khi bật `BASE_Z_INDEX`). Cùng layer (modal trên modal) không
  nâng — thứ tự đăng ký + thứ tự DOM đã đúng. Loading / toast / tooltip không bao giờ bị vượt. Lớp bên dưới đóng →
  bỏ tham chiếu `promotedOver`, z-index về giá trị thường; `release()` luôn gỡ z-index inline đã ghi. Modal được nâng
  đóng → focus về opener nằm trong lớp bên dưới (lightbox), không về modal trước (đang inert). Lightbox coi "lớp lạ" theo
  thứ tự registry (`!isTop()`), nên modal mở sau ở cùng layer trần (449) vẫn chặn phím của lightbox.

## Sơ đồ phụ thuộc

```
td-base-element ──► utils/escape, utils/css-safe
td-form-element ──► td-base-element
form/* (trừ button) ──► td-form-element ;  button ──► td-base-element
td-datetime-picker ──► feedback/td-modal ──► td-modal-stack
td-table ──► td-pagination, td-empty-state
modal, lightbox, loading, dropdown, tooltip, toast ──► utils/layers ──► utils/inert-lock
dropdown, chip-input, menu, hovercard, tooltip ──► utils/floating
td-datetime-picker ──► utils/datetime
dom-utils: độc lập, không component nào bắt buộc dùng
```

## Kiến trúc style (ADR 0008 — nền tảng từ v0.5.0, mọi component từ v0.10.0)

Chốt ở [ADR 0008](decisions/0008-drop-tailwind-token-css.md) (2026-09-27). Áp dụng cho **mọi component** (không còn
component legacy; peer Tailwind bỏ ở 0.11.0).

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
- **Bề mặt (minimal surfaces, 0.20.0 — ADR 0011)**: nền + một viền mảnh + một shadow mềm; blur 12px chỉ cho popup
  nhỏ; control đặc. Component đọc `var(--_td-glass-X, var(--td-glass-X))`. Không khai báo alias private trên `:root`.
  Fallback a11y gán biến private kèm `!important` trên marker `.td-glass-surface`.
  Chi tiết: [design/liquid-glass.md](design/liquid-glass.md).
- **Đã xong (0.10.0/0.11.0)**: mọi component token-native, peer Tailwind đã bỏ. `td.css` vẫn không reset; CSP harness
  giữ profile `legacy+td` (Tailwind của host + td.css) làm kiểm tra "host không làm hỏng component".

### Nền tảng đã có (v0.5.0)

| File | Layer | Nội dung |
|---|---|---|
| `src/styles/layers.css` | — | Câu khai báo thứ tự layer duy nhất (phải đứng đầu manifest) |
| `src/styles/tokens.css` | `td.tokens` | Token public: type, spacing, gray, radius, shadow, z-index, motion, màu semantic, accent, control, button, bề mặt `--td-glass-*` (nền / viền / blur / shadow / lightbox / geometry; token deprecated 0.20.0) |
| `src/styles/theme-dark.css` | `td.tokens` | `:root[data-td-theme="dark"]` — dark **chỉ bật khi site đặt attribute**, không tự theo OS |
| `src/styles/glass.css` | `td.component` + `td.tokens` | Recipe `.td-glass-surface(--strong/--lg/--clear)`, nhóm bề mặt đặc (modal / loading / tooltip / scroll-top), `.td-glass-tint` + khối fallback (`.td-glass-dim` deprecated) |
| `src/styles/utilities.css` | `td.utilities` | `.td-sr-only` |
| `src/styles/manifest.json` | — | Thứ tự build |
| `td.css` (root) | — | File build (commit), `npm run build:css`; `npm run check:css` fail nếu cũ |

### Viết CSS cho component token-native

1. Tạo `src/styles/components/<tên>.css`, bọc trong `@layer td.component { … }`, thêm vào `manifest.json`
   (sau `glass.css`, trước `utilities.css`), chạy `npm run build:css`.
2. Chỉ đọc token (`var(--td-*)`); giá trị per-instance (vị trí, kích thước động) ghi bằng CSSOM
   `el.style.setProperty('--td-x', …)` — CSP cho phép.
3. Class BEM `.td-x__el--mod`; trạng thái qua `aria-*` / `[hidden]` / `data-state`, không bật tắt class hiển thị.
4. Bề mặt nổi: thêm class recipe (`td-glass-surface …`) vào phần tử, **không** tự viết `backdrop-filter`. Blur chỉ cho
   popup nhỏ; bề mặt lớn / nhiều chữ thì thêm selector vào nhóm đặc trong `glass.css`. Mọi recipe mới có filter phải
   nằm trong selector list của khối fallback trong `glass.css`. Control (nút…) luôn đặc.
5. Không reset/normalize toàn cục (td.css nằm cạnh CSS của site, kể cả site có Tailwind). `npm run test:csp:combined` bảo đảm điều này.

### Site tuỳ biến thế nào

```css
/* CSS của site — KHÔNG đặt trong @layer → luôn thắng td.tokens */
:root {
  --td-accent: #b3261e;
  --td-glass-bg-strong: oklch(98% 0.01 80 / 0.94);
  --td-glass-solid: #f7f3ea;          /* modal / tooltip + nền đặc khi fallback: nên khớp giấy của site */
}
:root[data-td-theme="dark"] { --td-glass-solid: #1a1714; }   /* tinh chỉnh dark riêng */
.sidebar { --td-glass-bg: rgb(0 0 0 / 40%); }                /* theme theo vùng: chạy được */
```

Không bao giờ ghi đè `--_td-*`. Bỏ blur thủ công (Safari/iOS chưa có `prefers-reduced-transparency`):
`<html data-td-glass="off">`. Gate kiểm chứng: `npm run test:tokens` (Chromium/Firefox/WebKit × CSP `'self'` và nonce-only).
