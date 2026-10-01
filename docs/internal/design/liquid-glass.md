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
| Đặc | `.td-modal__dialog`, `.td-loading__card`, `.td-tooltip`, `.td-scroll-top` | `--td-glass-solid`, không blur; viền `--td-glass-border` + `--td-glass-shadow` (modal: `--td-glass-shadow-lg`) |
| Popup nhỏ | `.td-menu`, `.td-dropdown__menu`, `.td-chip-input__menu`, `.td-hovercard`, `.td-toast` | `--td-glass-bg-strong` (94 %) + `--td-glass-blur` (12px) + viền + `--td-glass-shadow` |
| Toast | `.td-toast--{type}` | Nền trung tính như popup nhỏ; **chỉ icon** mang màu trạng thái; không wash, không viền màu |
| Lightbox bar | `.td-lightbox__toolbar`, `.td-lightbox__counter` (`--clear`) | Tối `--td-glass-clear-bg` (88 %) + blur 12px + viền + shadow; không dim cục bộ, không glyph shadow. Panel / sheet: đặc `--td-glass-clear-solid`. Caption gradient (để đọc chữ trên ảnh) giữ |
| Nút có nền | `.td-btn--{primary,secondary,success,danger,info,warning}`, `.td-btn--custom` | **Màu đặc** `--td-btn-{v}-bg` + **một** shadow `--td-btn-lift`; hover = nền đậm hơn (đặc); focus ring giữ |
| Nút ghost / disabled | `.td-btn--ghost`, `:disabled` | Không shadow |
| Control nội dung | switch, slider, checkbox, chip, field, bảng, tab | Đặc; thumb / nút một shadow nhẹ |

Cài đặt: [`src/styles/glass.css`](../../../src/styles/glass.css) (recipe + fallback), token trong
[`tokens.css`](../../../src/styles/tokens.css) / [`theme-dark.css`](../../../src/styles/theme-dark.css), nút trong
[`button.css`](../../../src/styles/components/button.css). Tên class / token vẫn chứa chữ `glass` (API công khai).

## Luật

1. **Control luôn đặc.** Nút, switch, slider, chip, field: không `backdrop-filter`, không nền trong suốt.
2. **Blur chỉ cho popup nhỏ** (menu, dropdown, gợi ý chip-input, hovercard, toast) và thanh lightbox — `blur(12px)`
   thuần, không `saturate()` / `brightness()`. Bề mặt lớn hoặc nhiều chữ (modal, loading, tooltip) và nút nổi
   (scroll-top) là **đặc**.
3. **Không trang trí giả kính:** không gradient sheen, không rim inset, không hairline ngoài thứ hai, không film /
   tint trong suốt, không status wash, không glow khi hover, không glyph shadow.
4. **Không scale trang trí** (press / lift / pop / enter). Popup và modal chỉ **fade**. Giữ transform **chức năng**:
   vị trí thumb slider, trượt thumb switch, zoom / kéo lightbox, xoay mũi tên dropdown, sheet modal trượt lên trên
   điện thoại, slide nhẹ của toast / scroll-top.
5. **Một shadow.** Mỗi bề mặt một `box-shadow` mềm (nút: `--td-btn-lift` hai lớp mảnh vẫn tính là một token).
6. **Hover = nền đậm hơn, đặc.** Secondary dùng `--td-btn-secondary-hover`; các variant khác (và `--custom`)
   `color-mix(in srgb, <nền> 92%, #000)`; trình duyệt không có `color-mix()` giữ nền cũ.
7. **Màu nút theo token.** Primary = `--td-accent-fill` (theo accent của site). Alias một chu kỳ:
   `--td-btn-{primary,success,danger,info,warning}-tint` site còn đặt vẫn thành nền nút.
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
`-radius-inner`, `-capsule`, `-dur`, `-ease`, `-ease-flex`), `--td-btn-*-bg/-fg/-border/-hover`, `--td-btn-lift`.

**Deprecated v0.20.0** (vẫn khai báo, không tác dụng; xoá ở bản lớn sau): `--td-glass-edge`, `-side-edge`,
`-bottom`, `-outline`, `-sheen`, `-dim`, `-dim-text`, `-clear-edge`, `-clear-glyph-shadow`, `-tint`, `-tint-alpha`,
`-tint-fg`, `-tint-edge`, `-glow`, `-glow-size`, `-press-scale`, `-lift-scale`, `-enter-scale`,
`--td-btn-*-alpha`, `--td-btn-*-film`, `--td-btn-sheen`, `--td-btn-secondary-glass` (→ `-secondary-bg`),
`--td-btn-secondary-edge` (→ `-secondary-border`), toast `--td-toast-*-wash`, `--td-toast-error-border`.
Class `.td-glass-dim(--text)` giữ tên nhưng không còn vẽ gì; `.td-glass-tint` = nút capsule đặc.

Giá trị mặc định: xem [ADR 0011](../decisions/0011-minimal-surfaces.md) và trang
[theming](../../customization/theming.md). `glass-tokens.css` cùng thư mục là bản nháp nghiên cứu v0.5.0 (lịch sử).
