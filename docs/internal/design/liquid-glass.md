# Minimal surfaces — thay Liquid Glass v2 (0.20.0)

> **Bắt buộc cho mọi UI mới.** Thay toàn bộ bộ luật Liquid Glass v1 (0.5.0) / v2 (0.14.0) — xem
> [ADR 0011](../decisions/0011-minimal-surfaces.md). Bản cũ còn trong lịch sử git (file này trước commit v0.20.0).
> Giữ đường dẫn `liquid-glass.md` để link cũ (CLAUDE.md, comment trong CSS) không gãy.
>
> **Vì sao đổi:** kính "fake" bằng CSS (sheen gradient, rim inset hai tông, hairline ngoài, film/tint trong suốt
> trên nút, glow khi hover, scale khi bấm) không đẹp trên trang thật và tốn công giữ tương phản. Owner chốt: bỏ hẳn
> hiệu ứng kính, chỉ giữ **shadow + blur nhẹ**, tham khảo dcms2 (`dcms-glass.css`, `dcms-btn.css`).
>
> **Ràng buộc kit (không đổi):** không Shadow DOM · CSP strict (không `style="…"`, không chèn `<style>`; chỉ `td.css`
> + CSSOM) · không dependency mới · markup, class công khai và API JS giữ nguyên.

## Công thức duy nhất

Mỗi bề mặt nổi = **nền + một viền mảnh + một shadow mềm** (+ `blur(12px)` **chỉ** cho popup nhỏ). Hết.

| Lớp | Selector (class JS phát ra, không đổi) | Công thức |
|---|---|---|
| Đặc | `.td-modal__dialog`, `.td-loading__card`, `.td-scroll-top` | `--td-glass-solid`, không blur; viền `--td-glass-border` + `--td-glass-shadow` (modal: `--td-glass-shadow-lg`) |
| Tooltip (0.21.0) | `.td-tooltip` | **Đen** `--td-tooltip-bg` `#18181b` + chữ `#fff` (dark 0.41.0: chip xám nổi `#3a3a3e` + viền `rgb(255 255 255 / 16%)`), đặc, không blur, `--td-glass-shadow`; tương phản cao / forced colours vẫn thắng (`--_td-glass-fill-a11y`) |
| Popup nhỏ | `.td-menu`, `.td-dropdown__menu`, `.td-chip-input__menu`, `.td-hovercard` | `--td-glass-bg-strong` (94 %) + `--td-glass-blur` (12px) + viền + `--td-glass-shadow` |
| Toast (0.21.0) | `.td-toast--{type}` | Viên kiểu dcms, **đặc** pastel theo loại (`--td-pastel-{type}-*`) + viền cùng tông + `--td-glass-shadow`; không blur, không icon hiển thị (tiền tố loại cho trình đọc màn hình) |
| Lightbox bar | `.td-lightbox__toolbar`, `.td-lightbox__counter` (`--clear`) | Tối `--td-glass-clear-bg` (88 %) + blur 12px + viền + shadow; không dim cục bộ, không glyph shadow. Panel / sheet: đặc `--td-glass-clear-solid`. Caption gradient (để đọc chữ trên ảnh) giữ |
| Nút có nền | `.td-btn--{primary,secondary,success,danger,info,warning}`, `.td-btn--custom` | **Màu đặc** `--td-btn-{v}-bg` + viền `-border` + **một** shadow `--td-btn-lift`; hover = nền đặc `--td-btn-{v}-hover`; focus ring giữ. 0.21.0: primary **đen** `#18181b` / chữ trắng / hover `#3f3f46` (dark đảo: `#f4f4f5` / `#18181b` / `#d4d4d8`); 0.36.0: success / danger / warning / info **đặc ngữ nghĩa** `--td-solid-*` (bảng dưới; warning chữ tối; 0.21–0.35 pastel) |
| Nút ghost / disabled | `.td-btn--ghost`, `:disabled` | Không shadow |
| Nút thao tác (0.36.0) | `.td-btn--action` (`<td-action-button>`) | Vuông chỉ icon, **trong suốt**, không shadow; icon theo tone (standard `--td-gray-700`, warning `#b45309`, danger `#b91c1c`, ≥ 4.7:1 trên trắng và trên nền hover); hover = nền nhạt theo tone; focus ring kit |
| Badge (0.36.0) | `.td-badge--{v}` | Đặc (ngữ nghĩa = `--td-solid-*`) + **viền 1px** `--td-badge-{v}-border` (nền trộn 30 % đen, hex tính sẵn) + bóng `--td-badge-shadow`; outline / stamp trong suốt, mực `--td-badge-{v}-ink`, không bóng |
| Alert (0.36.0) | `.td-alert--{v}` | Thân nền nhạt (đọc chữ / liên kết / nút con); nhận diện đặc: vạch `border-inline-start` 4px `--td-alert-{v}-accent`, icon màu đặc, viền ~300 |
| Control nội dung | switch, slider, checkbox, chip, field, bảng, tab | Đặc; thumb / nút một shadow nhẹ |

### Bảng màu (0.21.0; màu ngữ nghĩa đặc 0.36.0)

| Nhóm | Light | Dark |
|---|---|---|
| Primary (nền / chữ / hover) | `#18181b` / `#fff` / `#3f3f46` | `#f4f4f5` / `#18181b` / `#d4d4d8` |
| Tooltip (nền / chữ / viền) | `#18181b` / `#fff` / trong suốt | `#3a3a3e` / `#fff` / `rgb(255 255 255 / 16%)` (0.41.0; trước `#18181b` 1.06:1 trên trang tối) |
| Đặc success (nền / chữ / hover = viền) | `#15803d` / `#fff` / `#166534` (5.02 · 7.1) | như light |
| Đặc danger | `#dc2626` / `#fff` / `#b91c1c` (4.83 · 6.47) | như light |
| Đặc warning | `#f59e0b` / `#18181b` / `#d97706` (8.25 · 5.56) — **chữ tối** | như light |
| Đặc info | `#2563eb` / `#fff` / `#1d4ed8` (5.17 · 6.70) | như light |
| Badge viền (neutral · accent · success · danger · warning · info) | `#ababac` · `#99a4b2` · `#0f5a2b` · `#9a1b1b` · `#ac6f08` · `#1a45a5` | như light |
| Badge mực outline / stamp (success · warning · danger · info) | `#15803d` · `#b45309` · `#b91c1c` · `#2563eb` | `#86efac` · `#fcd34d` · `#fca5a5` · `#93c5fd` |
| Pastel (deprecated 0.36.0) success / danger / warning / info (nền / viền / chữ) | `#dcfce7`/`#bbf7d0`/`#14532d` · `#fee2e2`/`#fecaca`/`#7f1d1d` · `#fef3c7`/`#fde68a`/`#78350f` · `#dbeafe`/`#bfdbfe`/`#1e3a8a` | `#143121`/`#16472a`/`#bbf7d0` · `#391a1c`/`#542022`/`#fecaca` · `#3a2a12`/`#553b11`/`#fde68a` · `#19253c`/`#1e3357`/`#bfdbfe` |
| Shadow `--td-glass-shadow` | `0 2px 6px /6%, 0 8px 24px /12%` | 24 % / 40 % (0.41.0; trước 12 / 24) |
| Shadow `--td-glass-shadow-lg` | `0 4px 12px /8%, 0 20px 48px /18%` | 32 % / 56 % (0.41.0; trước 16 / 36) |
| Viền bề mặt nổi `--td-glass-border` | `rgb(0 0 0 / 7%)` | `rgb(255 255 255 / 14%)` (0.41.0: trên nền tối viền sáng mảnh là thứ tách lớp, bóng gần như không thấy) |
| Shadow `--td-btn-lift` | `0 1px 3px /10%, 0 4px 10px -2px /12%` | 20 % / 24 % |
| Nhấn (0.36.2, [touch.md](touch.md)) chung / option / ghost | `rgb(0 0 0 / 12%)` (`--td-color-pressed`, `--td-option-pressed-bg`, `--td-btn-ghost-pressed`) | `rgb(255 255 255 / 14%)` |
| Nhấn nút primary / secondary | `#52525b` / `#d4d4d8` (gray-300) | `#a1a1aa` / `#45454b` |
| Nhấn nút success / danger / info / warning | `#14532d` / `#991b1b` / `#1e40af` / `#cc6d05` (chữ tối 4.86) | như light |
| Nhấn nút thao tác standard / warning (nền · icon) / danger | `--td-color-pressed` / `#fef3c7` · `#92400e` / `#fdd5d5` | — / `rgb(245 158 11 / 26%)` / `rgb(220 38 38 / 30%)` |
| Focus ô nhập (viền / quầng) | `color-mix(accent 85%, #fff)` / `0 0 0 3px` accent 12 % | cùng công thức / quầng 22 % |

Đặc (`--td-solid-{v}-bg/-fg/-hover/-border`, 0.36.0) dùng chung cho nút ngữ nghĩa và badge (toast: token riêng cùng
tinh thần); dark giữ cùng giá trị. **Warning luôn chữ tối** trên mọi bề mặt đặc (vàng + chữ trắng không bao giờ đạt).
Pastel (`--td-pastel-*`) deprecated, vẫn khai báo để site khôi phục (breaking-changes § 0.36.0). Badge có nền thêm viền
1px (≥ 1.6:1 với nền của chính nó / trắng / `#f4f4f5` — badge không tương tác, chữ mang thông tin) + bóng nhẹ, để nằm
trên nền **trùng màu** vẫn thấy mép; `prefers-contrast: more` → viền `currentColor`, bỏ bóng. Mọi cặp chữ / nền nằm trong contrast gate (luật 9); viền focus
ô nhập ≥ 3:1 với nền ô và nền trang (gate đo từ màu computed). `--td-accent` (checkbox, ghost, slider…) không đổi.

Cài đặt: [`src/styles/glass.css`](../../../src/styles/glass.css) (recipe + fallback), token trong
[`tokens.css`](../../../src/styles/tokens.css) / [`theme-dark.css`](../../../src/styles/theme-dark.css), nút trong
[`button.css`](../../../src/styles/components/button.css). Tên class / token vẫn chứa chữ `glass` (API công khai).

## Luật

1. **Control luôn đặc.** Nút, switch, slider, chip, field: không `backdrop-filter`, không nền trong suốt.
2. **Blur chỉ cho popup nhỏ** (menu, dropdown, gợi ý chip-input, hovercard) và thanh lightbox — `blur(12px)`
   thuần, không `saturate()` / `brightness()`. Bề mặt lớn hoặc nhiều chữ (modal, loading, tooltip) và nút nổi
   (scroll-top) và toast là **đặc**.
3. **Không trang trí giả kính:** không gradient sheen, không rim inset, không hairline ngoài thứ hai, không film /
   tint trong suốt, không status wash, không glow khi hover, không glyph shadow.
   *Ngoại lệ chức năng (0.48.0):* điểm chọn của vùng 2 chiều và thanh sắc độ trong `td-color-picker` có **vòng kép**
   trắng 2px + đen 1px — để thấy được trên **mọi** màu (≥ 3:1 với một trong hai vòng, gate đo trên `#fff` / `#000` /
   `#808080` / `#f00`), không phải rim trang trí.
4. **Không scale trang trí** (press / lift / pop / enter). Popup chỉ **fade**. **Ngoại lệ duy nhất (0.21.0, owner
   yêu cầu):** modal vào `scale(0.95) → none` 300ms đường cong lò xo
   `cubic-bezier(0.34, 1.56, 0.64, 1)` (vượt nhẹ) + fade 200ms, ra `scale(0.95)` 200ms / fade 150ms
   `cubic-bezier(0.4, 0, 0.2, 1)` (0.22.1, mang từ dcms-modal; token `--td-modal-*`; reduced motion → chỉ fade). Wheel datetime cuộn mượt tới giá trị khi bấm phím là chuyển động chức năng (hiệu ứng cuộn từ 00 **khi mở** đã gỡ: picker căn giữa ngay từ 0.60.0, range từ 0.61.0 — bánh xe luôn căn giữa ở mỗi lần vào màn giờ). Giữ transform **chức năng**:
   vị trí thumb slider, trượt thumb switch, zoom / kéo lightbox, xoay mũi tên dropdown, sheet modal trượt lên trên
   điện thoại, slide nhẹ của toast / scroll-top, **nhãn nổi của `td-input-field` thu nhỏ + dịch lên khi focus / có giá trị
   (0.58.0, `--td-field-float-scale`, [ADR 0031](../decisions/0031-floating-label-variant.md))** — vị trí + cỡ là trạng thái
   "đã có giá trị", không phải trang trí; reduced motion → nhảy thẳng tới trạng thái cuối.
5. **Một shadow.** Mỗi bề mặt một token `box-shadow` (0.21.0: hai lớp — tiếp xúc + toả — vẫn tính là một token; nút:
   `--td-btn-lift`).
6. **Hover = nền đặc khác** (0.36.2: chỉ trong `@media (hover: hover) and (pointer: fine)`; **nhấn** = nền đặc thêm một bậc `--td-btn-{v}-pressed`, chỉ đổi màu — [touch.md](touch.md)). Mỗi variant có nền đọc `--td-btn-{v}-hover` (0.21.0; primary đen thì hover sáng lên);
   `--custom` và alias `-tint` dùng `color-mix(in srgb, <nền> 92%, #000)`; trình duyệt không có `color-mix()` giữ nền cũ.
7. **Màu nút theo token.** Primary = đen (0.21.0; site muốn theo accent: `--td-btn-primary-bg: var(--td-accent-fill)` +
   `--td-btn-primary-fg: var(--td-accent-contrast)` + `--td-btn-primary-hover`). Nút ngữ nghĩa = đặc `--td-solid-*`
   (0.36.0; 0.21–0.35 pastel). Alias một chu kỳ:
   `--td-btn-{primary,success,danger,info,warning}-tint` site còn đặt vẫn thành nền + viền nút.
8. **Scrim không blur** (modal, loading). **Bo góc đồng tâm** (inner = outer − padding, `--td-glass-radius-inner`)
   và **capsule ≥ 44px trên cảm ứng** giữ như cũ. Header bảng ghim: nền đặc.
9. **Tương phản đo thật:** gate `test/tokens/contrast.spec.mjs` (chữ ≥ 4.7:1, icon ≥ 3.2:1, disabled ≥ 2.2:1;
   3 engine × sáng/tối × 4 nền). Đổi token màu → chạy lại gate.

## Fallback (giữ, theo thứ tự)

Recipe đọc `var(--_td-glass-X, <token công khai>)`; fallback gán `--_td-glass-*` kèm `!important` trong layer
`td.tokens` (trên chính phần tử, không trên `:root`) nên token site đặt không phá được:

1. Không hỗ trợ `backdrop-filter` → nền đặc.
2. `prefers-reduced-transparency: reduce` → đặc, không filter.
3. `<html data-td-glass="off">` → đặc, không filter (Safari/iOS chưa có query reduced-transparency).
4. `prefers-contrast: more` → đặc (`--td-color-surface`), viền `currentcolor`, không filter, không shadow.
5. `forced-colors: active` (cuối cùng) → `Canvas` / `CanvasText` / `ButtonFace`, viền thật, không filter / shadow.

Nút luôn đặc nên chỉ còn contrast (viền rõ, bỏ shadow) và forced colours.

## Token

**Giữ (công khai):** `--td-glass-bg`, `-bg-strong`, `-solid`, `-fg`, `-border`, `-blur`, `-blur-lg`, `-shadow`,
`-shadow-lg`, `-scrim`, `-clear-bg/-solid/-fg/-border/-shadow`, token hình học / thời lượng (`-radius`, `-pad`,
`-radius-inner`, `-capsule`, `-dur`, `-ease`, `-ease-flex`), `--td-btn-*-bg/-fg/-border/-hover`, `--td-btn-lift`;
0.21.0: `--td-pastel-{success,danger,warning,info}-bg/-border/-fg` (deprecated 0.36.0, giữ), `--td-tooltip-bg/-fg/-border/-text-align`;
0.36.0: `--td-solid-{success,danger,warning,info}-bg/-fg/-hover/-border`, `--td-badge-{v}-border`, `--td-badge-{v}-ink`,
`--td-badge-shadow`, `--td-alert-{v}-accent`, `--td-alert-accent-width`, `--td-action-btn-*`; 0.36.2: `--td-color-pressed`, `--td-option-pressed-bg`,
`--td-btn-{v}-pressed`, `--td-btn-ghost-pressed`, `--td-action-btn-{tone}-pressed-bg`, `--td-action-btn-warning-pressed-fg`.

**Deprecated v0.20.0** (vẫn khai báo, không tác dụng; xoá ở bản lớn sau): `--td-glass-edge`, `-side-edge`,
`-bottom`, `-outline`, `-sheen`, `-dim`, `-dim-text`, `-clear-edge`, `-clear-glyph-shadow`, `-tint`, `-tint-alpha`,
`-tint-fg`, `-tint-edge`, `-glow`, `-glow-size`, `-press-scale`, `-lift-scale`, `-enter-scale`,
`--td-btn-*-alpha`, `--td-btn-*-film`, `--td-btn-sheen`, `--td-btn-secondary-glass` (→ `-secondary-bg`),
`--td-btn-secondary-edge` (→ `-secondary-border`), toast `--td-toast-*-wash`, `--td-toast-error-border` (có tác dụng
trở lại từ 0.21.0). **Deprecated v0.21.0:** toast `--td-toast-fg`, `-close-fg`, `-glass-bg`, `--td-toast-{type}-icon`.
Class `.td-glass-dim(--text)` giữ tên nhưng không còn vẽ gì; `.td-glass-tint` = nút capsule đặc.

Giá trị mặc định: xem [ADR 0011](../decisions/0011-minimal-surfaces.md) và trang
[theming](../../customization/theming.md). `glass-tokens.css` cùng thư mục là bản nháp nghiên cứu v0.5.0 (lịch sử).
