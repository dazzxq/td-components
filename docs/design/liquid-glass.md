# Liquid Glass: bộ luật cho td-components (v1)

> **Bắt buộc cho mọi UI mới.** Component token-native (từ v0.5) phải theo bộ luật này.
>
> **Phạm vi:** mọi component `td-*` và mọi site dùng kit (135, dwp, …). Tài liệu này thay cho
> `dwp/docs/design/LIQUID-GLASS.md` và phần chú thích đầu `135/.../td-glass.css`.
> **Token:** [glass-tokens.css](glass-tokens.css) (bản nháp tham chiếu, chưa nối vào `src/`).
>
> **Cơ chế token private đã chốt ở [ADR 0008](../decisions/0008-drop-tailwind-token-css.md), thay cho
> phần tương ứng trong bản nháp:** không khai báo `--_td-glass-*` trên `:root`. Component đọc
> `var(--_td-glass-X, var(--td-glass-X))`; các query fallback (`@supports not (backdrop-filter)`,
> `prefers-reduced-transparency`, `prefers-contrast: more`, `html[data-td-glass="off"]`, cuối cùng là
> `forced-colors` với cặp màu hệ thống) gán `--_td-glass-*` kèm `!important` trên marker chung
> `.td-glass-surface`. Chỗ nào bên dưới nói "private token trên `:root`" thì hiểu theo cơ chế này.
> **Ràng buộc kit:** không Shadow DOM · CSP strict (không có `style="…"`, không chèn `<style>`; chỉ dùng
> file `td.css` đi kèm hoặc CSSOM `el.style.setProperty`) · không kéo dependency nặng.

## 0. Nguồn và cách trích dẫn

| Mã | Tệp (trong [`sources/apple/`](sources/apple/README.md)) | Nội dung |
|---|---|---|
| **HIG-M** | `design_human-interface-guidelines_materials.json` | HIG: Materials (cập nhật 9/9/2025) |
| **HIG-C** | `color.json` | HIG: Color, mục "Liquid Glass color" |
| **ADOPT** | `documentation_technologyoverviews_adopting-liquid-glass.json` | Adopting Liquid Glass |
| **OVR** | `documentation_TechnologyOverviews_liquid-glass.json` | Liquid Glass overview |
| **W219** | `w219.txt` | WWDC25 "Meet Liquid Glass" |
| **W356** | `w356.txt` | WWDC25 "Get to know the new design system" |

Trích dẫn giữ nguyên tiếng Anh. Luật nào **không** có nguồn Apple mà là luật kỹ thuật web thì được ghi rõ là
**[WEB]**.

---

## 1. Các nguyên tắc

### R1. Kính chỉ dành cho tầng điều khiển nổi, không bao giờ cho tầng nội dung

> "Liquid Glass forms a distinct functional layer for controls and navigation elements — like tab bars and
> sidebars — that floats above the content layer" (HIG-M)
>
> "Don't use Liquid Glass in the content layer. … including it in the content layer can result in unnecessary
> complexity and a confusing visual hierarchy." (HIG-M)
>
> "Consider this tableview: making it Liquid Glass would make it compete with other elements and muddy the
> hierarchy." (W219)

Để biết một thứ có được làm kính hay không, hỏi đúng một câu: **nó có nổi lên trên nội dung đang cuộn/đứng
yên không?** (thanh công cụ, menu, popover, sheet, toast, modal). Nếu nó nằm *trong* dòng nội dung (bảng, thẻ,
form, phân trang, empty state, nút submit) thì không dùng kính. Chỗ đó dùng fill đặc hoặc "standard material"
(nền mờ nhẹ, không có highlight/rim).

**Ngoại lệ:** núm của toggle và slider được phép *tạm thời* thành kính trong lúc người dùng tương tác:
> "An exception to this is for controls in the content layer with a transient interactive element like sliders
> and toggles; in these cases, the element takes on a Liquid Glass appearance to emphasize its interactivity
> when a person activates it." (HIG-M)

### R2. Dùng tiết kiệm

> "Use Liquid Glass effects sparingly. … Limit these effects to the most important functional elements in your
> app." (HIG-M, ADOPT)

**[WEB]** Mỗi `backdrop-filter` là một lớp compositing riêng, nên chi phí tăng theo diện tích × bán kính blur.
Mục tiêu là màn hình lúc nghỉ có **≤ 3 bề mặt kính cùng lúc**.

### R3. Không đặt kính lên kính

> "always avoid glass on glass … When placing elements on top of Liquid Glass, avoid applying the material to
> both layers. Instead, use fills, transparency, and vibrancy for the top elements to make them feel like a thin
> overlay that is part of the material." (W219)
>
> "avoid overcrowding or layering Liquid Glass elements on top of each other." (ADOPT)
>
> "make sure to apply the material directly to the control, not its inner views." (W356)

Áp dụng vào kit:
- Nút, ô tìm kiếm, item bên trong modal/menu/popover dùng **fill** (`--td-color-hover`, `--td-dd-option-*`),
  không dùng kính. Trong modal, nút primary là **fill đặc màu accent**, không phải "tinted glass".
- Menu, dropdown, tooltip hoặc toast mở **đè lên** modal thì chuyển sang `--td-glass-solid`. Hiện 135 mới xử lý
  cho `.td-menu` và `.td-dropdown__menu`, còn **thiếu tooltip, toast, hovercard**.
- Khi modal chồng modal, chỉ dialog trên cùng giữ kính. Dialog bị che chuyển sang solid (đằng nào nó cũng đã bị
  scrim làm tối).
- **[WEB]** Kính lồng kính còn hỏng về mặt kỹ thuật. Khi phần tử cha có `backdrop-filter`, `filter` hoặc
  `opacity<1`, nó trở thành *Backdrop Root*, nên `backdrop-filter` của phần tử con chỉ lấy mẫu được bên trong
  cha, không thấy trang phía sau. Cha có `backdrop-filter` cũng trở thành containing block của các con
  `position:fixed`.

### R4. Regular hay Clear: không trộn, và Clear chỉ dùng khi đủ cả 3 điều kiện

> "They should never be mixed, as they each have their own characteristics and specific use cases." (W219)
>
> "whereas the Regular variant can work anywhere, Clear should only be used when these 3 conditions are met.
> First, the element you're applying it to is over media-rich content. Second, your content layer won't be
> negatively affected by introducing a dimming layer. And lastly, the content sitting above it is bold and
> bright." (W219)
>
> "Use the regular variant when background content might create legibility issues, or when components have a
> significant amount of text, such as alerts, sidebars, or popovers." (HIG-M)

- Mặc định là **Regular**. Clear chỉ dùng trong **lightbox/media viewer**, cho toolbar icon trắng đậm và counter.
- "Không trộn" nghĩa là trong cùng một view media, chrome đã là Clear thì panel hoặc sheet thông tin **không**
  làm Regular glass mà làm **solid tối** (tương đương "thick material").

### R5. Clear luôn cần lớp làm tối (dim)

> "If the underlying content is bright, consider adding a dark dimming layer of 35% opacity." (HIG-M)
>
> "To provide enough legibility for symbols or labels, it needs a dimming layer to darken the underlying
> content. Without it, legibility gets noticeably worse. If Liquid Glass elements in your app have a smaller
> footprint, you can use localized dimming" (W219)

**Số đo kiểm chứng [WEB]:** chữ trắng trên Clear 8% cộng dim 35%, đặt trên ảnh **trắng**, chỉ đạt **2.25:1**.
Con số này trượt cả ngưỡng 3:1 cho icon. Trên iOS kính tự thích ứng nên bù được, còn web thì không. Vì vậy:
- Icon: dim 35% (`--td-glass-dim`) **cộng** `--td-glass-clear-glyph-shadow`, nét icon ≥ 2px, cỡ ≥ 20px.
- Chữ (counter "3 / 12", caption): dùng `--td-glass-dim-text` 60%, đạt 4.79:1 trong trường hợp xấu nhất.
- Dim đặt **cục bộ** qua `::before` của chính control, không phủ toàn màn hình (đúng với ý "localized dimming"
  trong câu trích ở trên).

### R6. Ba lớp quang học: highlight, shadow, interaction glow

> "the highlights layer … Light sources inside of this environment shine on the material producing highlights
> that respond to geometry" · "Shadows also play an important role in helping elements feel grounded" · "When
> you interact with Liquid Glass, the material illuminates from within as a form of feedback. Starting right
> under your fingertips, the glow spreads throughout the element" (W219)
>
> "When glass flexes and morphs to larger sizes … It casts deeper, richer shadows" (W219)

Web làm được **cả ba** (dwp và 135 đang cho rằng không làm được interaction glow, điều này sai):
1. **Highlight:** dùng `inset 0 1.5px 0 var(--td-glass-edge)` cho mép trên và `inset 0 -1px 0 var(--td-glass-bottom)` cho mép dưới.
2. **Shadow:** `--td-glass-shadow` cho bề mặt nhỏ, `--td-glass-shadow-lg` cho modal, menu, popover. Apple nói
   kính lớn hơn thì dày hơn và bóng sâu hơn. Việc tăng bóng khi nằm trên chữ thì web không cảm nhận được, nên
   dùng một mức trung bình cố định.
3. **Interaction glow:** tạo bằng `::after` với `radial-gradient` tại `--td-glow-x/y`. JS gán hai biến này qua
   `el.style.setProperty`, cách này hợp lệ với CSP. Glow chỉ hiện khi `:active` hoặc `[data-pressed]`.

**Viền ngoài và highlight là HAI token khác nhau.** `--td-glass-border` là viền ngoài, `--td-glass-edge` là
highlight inset. Nếu dùng edge (gần trắng) làm viền ngoài thì viền sẽ tàng hình trên nền sáng. Hiện
`td-modal.js` trong repo components đang mắc đúng lỗi này (`border-white/50`).

### R7. Màu (tint): chỉ cho hành động chính, và tô vào nền

> "Apply color sparingly … To emphasize primary actions, apply color to the background rather than to symbols or
> text. … Refrain from adding color to the background of multiple controls." (HIG-C)
>
> "Avoid tinting all your elements. When every element is tinted, nothing stands out … If you want to imbue
> color into your app, do it in the content layer instead." (W219)
>
> "Here is a button that is using a solid fill instead of the built-in tinting. As you can tell, it is
> completely opaque and breaks the visual character of Liquid Glass." (W219)

- **Tinted glass** (`--_td-glass-tint-fill`, tức accent pha 90% trong suốt, có blur): dùng cho **một** hành động
  chính trên **một thanh nổi**, ví dụ nút "Tải xuống" trên toolbar lightbox hoặc nút "Lưu" trên action bar cố
  định ở đáy.
- Nút primary nằm trong tầng nội dung (form, trang) hoặc bên trong modal là **fill đặc accent**, không phải kính.
  Lý do là R1 và R3.
- **Số đo [WEB]:** tint 82% trên nền trắng chỉ đạt 3.76 đến 3.98:1, trượt AA. Tint 90% đạt ≥ 4.6:1, nên
  `--td-glass-tint-alpha: 90%`.
- Màu custom phải có biến thể light, dark và increased-contrast:
  > "define a custom color with light and dark variants, and an increased contrast option for each variant"
  > (ADOPT) · "Even if your app ships in a single appearance mode, provide both light and dark colors to support
  > Liquid Glass adaptivity" (HIG-C)

### R8. Bo góc đồng tâm (concentric), kèm bán kính dự phòng

> "fixed shapes have a constant corner radius. Capsules use a radius that's half the height of the container.
> And concentric shapes calculate their radius by subtracting padding from the parent's." · "use a concentric
> shape with a fallback radius. The concentric value adapts when nested, and the fallback kicks in when the
> component stands alone." · "keep an eye out for corners that feel too pinched— or flared." (W356)

Công thức: `--td-glass-radius-inner: max(var(--td-glass-radius-min), calc(var(--td-glass-radius) - var(--td-glass-pad)))`.
Ví dụ: menu 20px với padding 6px thì item bo 14px. Cha là capsule thì con cũng là capsule.

### R9. Capsule cho điều khiển cảm ứng

> "Capsules bring focus and clarity to touch-friendly layouts, but in dense desktop environments, they're best
> used for standout actions." · "For phone layouts, use a capsule with extra margin to create space near the
> screen edge." (W356)

Thanh công cụ nổi, cụm nút trên kính, scroll-top và toast dùng dạng **capsule**. Bảng dữ liệu và form dày đặc
trên desktop giữ bo góc vừa phải. **[WEB/HIG chung, không có trong tệp nguồn]:** vùng chạm tối thiểu 44px
(`--td-touch-min`). Toolbar lightbox của 135 đang dùng nút **36px**, nhỏ hơn mức này.

### R10. Scroll edge effect: mỗi view một cái, soft là mặc định, hard dành cho header ghim

> "scroll edge effects are not decorative. They don't block or darken like overlays. They simply clarify where UI
> and content meet, and shouldn't be used where there aren't any floating UI elements." · "You should avoid mixing
> or stacking them" · "Soft is the default … Hard … ideal for interactive text, controls without backgrounds, or
> pinned table headers" · "Apply one scroll edge effect per view." (W356)

- **Soft:** vùng cuộn nằm dưới một thanh nổi dùng `mask-image: linear-gradient(...)` ở mép, cao `--td-scroll-edge-size`.
- **Hard:** header bảng dạng sticky dùng nền `--td-scroll-edge-hard-bg` (đặc hơn), không có fade.
- Không có UI nổi thì không làm scroll edge.

### R11. Chuyển động: nở ra từ nguồn, co giãn như gel, và tôn trọng reduced motion

> "When showing a menu, the bubble simply pops open to reveal the content contained within. … keeps everything
> right where you just tapped." · "Instead of fading, Liquid Glass objects materialize in and out by gradually
> modulating the light bending and lensing" (W219)

**[WEB]** Dùng `transform-origin` đặt tại trigger, `scale(var(--_td-glass-enter)) → 1` kết hợp opacity. **Không
animate `backdrop-filter`** vì rất đắt và giật trên Safari.

### R12. Modal: kính đi kèm dimming layer

> "When a task interrupts the main flow, pair Liquid Glass with a dimming layer to help center attention" ·
> "when a task happens in parallel, Liquid Glass creates a natural separation" (W356)

Scrim của modal chỉ làm **tối** (`--td-glass-scrim`), **không blur**. Nếu blur thì scrim trở thành một tầng kính
nằm dưới dialog kính. Popover, menu và toast (tác vụ song song) không có scrim.

### R13. Khả năng tiếp cận: bắt buộc, xử lý ở tầng token

> "Reduced Transparency, makes Liquid Glass frostier and obscures more of the content behind it. Increased
> contrast, makes elements predominantly black or white and highlights them with a contrasting border and Reduced
> Motion decreases the intensity of some effects and disables any elastic properties" (W219)
>
> "Test your interface with a variety of display and accessibility settings." (ADOPT)

| Điều kiện | Cơ chế trong `glass-tokens.css` |
|---|---|
| `@supports not (backdrop-filter)` | fill chuyển sang solid, dim tắt. Nếu thiếu bước này, trang sẽ hỏng mà không báo lỗi (chữ đè trực tiếp lên ảnh). |
| `prefers-reduced-transparency: reduce` | solid, filter none. ⚠ **Chỉ Chromium hỗ trợ.** Safari/iOS không có media query này, vì vậy có thêm `html[data-td-glass="off"]` để site hoặc người dùng tự tắt. |
| `prefers-contrast: more` | nền surface đặc, viền `currentcolor`, bỏ rim. Với Clear: nền đen, viền trắng. |
| `forced-colors: active` | Canvas, CanvasText, không bóng. |
| `prefers-reduced-motion: reduce` | scale về 1, không spring, glow giảm một nửa, chỉ crossfade ≤ 120ms. |

Mọi fallback **chỉ** ghi đè token private `--_td-glass-*`, vì vậy override unlayered của site (như 135) không
thể vô hiệu hoá chúng.

### R14. [WEB] Blur ≤ 20px và ưu tiên hiệu năng

Không có nguồn Apple nào cho con số này; đây là luật hiệu năng. `--td-glass-blur` là 18px, `-lg` là 20px, không
token nào vượt 20px. Hiện repo components đang có 4 giá trị khác nhau (modal 24px, dropdown 16px, tooltip 12px,
toast 10px), cần thống nhất về token.

### R15. [WEB] Khúc xạ (displacement/refraction) chỉ là progressive enhancement, và mặc định TẮT

> "Liquid Glass is a new digital meta-material that dynamically bends and shapes light" · "The primary way Liquid
> Glass visually defines itself is through something called Lensing." (W219)

Apple coi lensing là cốt lõi, nhưng trên web:
- `backdrop-filter: url(#svg-filter)` **chỉ chạy trên Chromium**. `filter: url()` áp lên *chính phần tử* thì
  trình duyệt nào cũng chạy, nhưng nó không bẻ được trang phía sau.
  (Ghi chú: 135 viết "feDisplacementMap is Chromium-only", câu này **chưa chính xác**; phần chỉ chạy trên
  Chromium là *backdrop* `url()`.)
- Không có cách feature-detect đáng tin cậy, vì `CSS.supports('backdrop-filter','url(#x)')` có thể trả về true
  dù trình duyệt không render.
- `feImage` cần displacement map dạng `data:` hoặc `blob:`, nên CSP phải có `img-src data:`/`blob:`.

Kết luận: v1 **không làm**. Nếu sau này làm thì chỉ là opt-in `data-td-refract` cho **một** control nhỏ, và chỉ
bật khi đủ các điều kiện: Chromium, không bật reduced-transparency, không bật reduced-motion, và không đang trong
fallback. Filter phải nằm trong file SVG tĩnh đi kèm kit, không sinh inline. Kỹ thuật tính profile khúc xạ có
thể học lại (clean-room) từ bài viết gốc của kube.io mà `@ozcanyldzhn/liquid-glass-js` đã port. Xem §4.

### R16. `backdrop-filter` cần có thứ gì đó phía sau

Kính đặt trên nền phẳng một màu trông chỉ như một hộp mờ. Trường hợp đó dùng `--td-glass-bg-strong` và đừng kỳ
vọng "chất kính". Điều này đúng với Apple: "Liquid Glass has no inherent color, and instead takes on colors from
the content directly behind it." (HIG-C)

### R17. Độ đục theo kích thước và theo lượng chữ

> "Liquid Glass appears more opaque in larger elements like sidebars to preserve legibility over complex
> backgrounds" (HIG-C) · "When a half sheet expands to full height, it transitions to a more opaque appearance"
> (ADOPT)

- `--td-glass-bg` (72%): control chỉ có icon hoặc nhãn ngắn (thanh, pill, scroll-top).
- `--td-glass-bg-strong` (86%): bề mặt có chữ hoặc bề mặt lớn (modal, menu, popover, toast, tooltip, picker).
- Sheet mở full-height: solid.

---

## 2. Bảng áp dụng cho từng component

| Component | Glass | Vì sao | Ghi chú triển khai |
|---|---|---|---|
| **td-modal** (dialog) | **Regular, strong** + shadow-lg | Nổi lên, ngắt luồng làm việc, nhiều chữ (HIG-M: "alerts … popovers") | Bỏ `bg-white/[0.9] border-white/50` và blur 24px. Nút trong footer là fill, primary là accent đặc (R3). Radius 20px, capsule/bo 12px cho nút ở góc (R8). |
| **td-modal-stack backdrop** | **None**, chỉ scrim tối | R12: scrim không phải kính, không blur | Chuyển opacity 0.5 và bước +0.05 từ JS sang token `--td-glass-scrim`. Dialog bị che thì chuyển solid (R3). |
| **td-toast** | **Regular, strong**, capsule | Nổi lên, song song, có chữ | Solid khi `html.td-modal-open` và toast đè lên dialog (R3). Hiện blur 10px, cần đổi sang token. |
| **td-tooltip** | **Regular, strong** | Popover nhỏ có chữ | Không có mũi tên (hình vuông xoay lấy mẫu backdrop khác). Solid khi nằm trong modal. Không set `style.backdropFilter` từ JS (dòng 275), để CSS lo. |
| **td-dropdown** (panel) | **Regular, strong**, pad 6px, radius 20px | Popover/menu (ADOPT: "Menus … adopt Liquid Glass") | Option dùng fill + `radius-inner`. Ô search bên trong dùng fill, không dùng kính. Trigger là field (content layer): **none**. |
| **td-menu** (135) | **Regular, strong** | Như trên | Nở ra từ nút "···" (R11). Solid khi nằm trên modal (đã có). |
| **td-datetime-picker** popover | **Regular, strong** | Popover nhiều chữ | Ô ngày là fill, ngày được chọn dùng accent fill đặc (nằm trong kính, R3). Picker inline (không phải popover): **none**. |
| **td-tabs** (tabs trong nội dung) | **None**, dùng fill segmented | Tầng nội dung | Container dùng `--td-color-hover`, indicator là fill sáng. Chỉ khi là **app tab bar/nav nổi** mới dùng **Regular capsule**. |
| **td-button** primary | **None** (fill accent) trong nội dung và trong modal. **Tinted glass** chỉ khi nằm trên thanh nổi. | R1, R3, R7 | ⚠ Hiện cả 6 variant đều là kính `blur(8px)`, vi phạm R1 và R7 ("Refrain from adding color to the background of multiple controls"). |
| **td-button** secondary/ghost | **None** (fill/viền). Trên thanh nổi thì là **item trong nhóm kính của thanh**, không có kính riêng. | R3: kính áp lên container, không áp lên từng view con | W356: "items grouped … share a background". |
| **td-toggle** thumb | **None** lúc nghỉ, chỉ thành **Clear-ish lens** khi đang kéo | HIG-M ngoại lệ cho toggle | `[data-dragging]` thì scale theo `--_td-glass-lift-knob`, nền `--td-glass-clear-bg`, blur(2px) + rim. Reduced motion: không scale. |
| **td-slider** thumb | Như toggle | HIG-M, ADOPT: "the knob transforms into Liquid Glass during interaction" | Track là fill. Hiện dùng box-shadow màu `${color}40` cho glow, đổi sang token. |
| **td-checkbox** | **None** | Không có núm nào chuyển trạng thái tạm thời | Fill accent khi checked. |
| **td-input-field** | **None** | Tầng nội dung | `--td-field-*`. Nếu nằm trong kính thì là fill, không làm kính thứ hai. |
| **chip-input** | **None** | Tầng nội dung, chip là fill | Popover gợi ý (nếu có) dùng Regular strong. |
| **td-table** | **None**. Header sticky dùng **scroll edge hard** | W356: "pinned table headers" | Không bao giờ làm kính cho hàng hoặc ô (W219 ví dụ tableview). |
| **td-pagination** | **None** | Tầng nội dung | Nếu làm thành thanh nổi ở đáy: Regular capsule, trang hiện tại là fill (không tint). |
| **td-empty-state** | **None** | Nội dung | Có thể dùng một CTA primary đặc. |
| **td-loading** fullscreen | **Scrim** + thẻ **Regular strong** (nếu có chữ) | Ngắt luồng làm việc (R12) | Spinner inline: none. `forced-colors`/reduced-motion: dừng quay và giữ nhãn. |
| **Lightbox toolbar/counter** (135) | **Clear** + dim cục bộ | Đủ 3 điều kiện: trên ảnh, dim được, icon trắng đậm | Icon cần glyph-shadow. Counter là chữ nên dùng `--td-glass-dim-text` 60%. Nút phải ≥ 44px. |
| **Lightbox panel** (desktop) | **None**, solid tối | Nhiều chữ, không trộn với chrome Clear (R4) | Đã đúng trong 135. |
| **Lightbox bottom sheet** (mobile) | **None**, solid tối. Tay nắm (grab bar) là fill. | R4 (không trộn), ADOPT: sheet full-height thì "more opaque" | Caption gradient là scrim, không phải kính. |
| **scroll-top / hovercard** (135) | Regular (bg) / Regular strong | Nổi lên | Capsule. |

---

## 3. Công thức CSS

Mọi công thức chỉ đọc token **private** `--_td-glass-*` (theo ADR 0008: `var(--_td-glass-X, var(--td-glass-X))`,
bản dưới viết gọn). Class nằm trong `@layer td.component` hoặc `td.utilities`, ship trong `td.css`
(không dùng `adoptStyles()` cho CSS token-native, xem ADR 0008).

### 3.1 Regular

```css
.td-glass {
	isolation: isolate;
	color: var(--_td-glass-fg);
	background: var(--_td-glass-fill);
	-webkit-backdrop-filter: var(--_td-glass-filter);
	backdrop-filter: var(--_td-glass-filter);
	border: 1px solid var(--_td-glass-line);          /* outer line, NOT the edge token */
	border-radius: var(--td-glass-radius);
	box-shadow: var(--_td-glass-rim), var(--_td-glass-lift);
}
.td-glass--strong { background: var(--_td-glass-fill-strong); }
.td-glass--lg {                                        /* modal / menu / popover */
	background: var(--_td-glass-fill-strong);
	-webkit-backdrop-filter: var(--_td-glass-filter-lg);
	backdrop-filter: var(--_td-glass-filter-lg);
	box-shadow: var(--_td-glass-rim), var(--_td-glass-lift-lg);
}
.td-glass--capsule { border-radius: var(--td-glass-capsule); }
.td-glass__inner  { border-radius: var(--td-glass-radius-inner); }
.td-glass--capsule .td-glass__inner { border-radius: var(--td-glass-capsule); }
```

### 3.2 Clear + dim cục bộ

```css
.td-glass-clear {
	position: relative;
	isolation: isolate;                               /* required: ::before z-index:-1 must stay inside */
	color: var(--_td-glass-clear-fg);
	background: var(--_td-glass-clear-fill);
	-webkit-backdrop-filter: var(--_td-glass-clear-filter);
	backdrop-filter: var(--_td-glass-clear-filter);
	border: 1px solid var(--_td-glass-clear-line);
	border-radius: var(--td-glass-capsule);
	box-shadow: var(--_td-glass-clear-rim), var(--_td-glass-clear-lift);
}
.td-glass-clear::before {
	content: "";
	position: absolute;
	inset: 0;
	z-index: -1;
	border-radius: inherit;
	background: var(--_td-glass-dim);
	pointer-events: none;
}
.td-glass-clear--text::before { background: var(--td-glass-dim-text); }
.td-glass-clear svg { filter: var(--td-glass-clear-glyph-shadow); }
@media (prefers-contrast: more), (prefers-reduced-transparency: reduce), (forced-colors: active) {
	.td-glass-clear svg { filter: none; }
}
```

(Trong `td-glass.css` của 135, `.td-glass--clear` chỉ có `isolation` khi đi cùng `.td-glass`. Nếu dùng riêng thì
`::before` với z-index -1 sẽ lọt ra sau cha.)

### 3.3 Tinted primary, chỉ dùng trên thanh nổi

W356: "A primary action, like Done, stays separate and appears tinted". Nút này là **một capsule kính riêng**,
đặt cạnh nhóm nút của thanh chứ **không lồng vào trong** nhóm. Nếu lồng vào thì thành kính chồng kính, và vì cơ
chế Backdrop Root, `backdrop-filter` của nó chỉ làm mờ được chính cái thanh.

```html
<div class="td-toolbar">                      <!-- layout only, NO glass -->
  <div class="td-glass td-glass--capsule">…grouped icon buttons (fills)…</div>
  <button class="td-glass-tinted">Lưu</button>
</div>
```

```css
.td-glass-tinted {
	color: var(--td-glass-tint-fg);
	background: var(--_td-glass-tint-fill);
	-webkit-backdrop-filter: var(--_td-glass-filter);
	backdrop-filter: var(--_td-glass-filter);
	border: 0;
	border-radius: var(--td-glass-capsule);
	box-shadow: inset 0 1px 0 var(--td-glass-tint-edge), var(--_td-glass-lift);
	min-height: var(--td-touch-min);
	padding-inline: 1.25rem;
	font-weight: 600;
}
```

### 3.4 Interaction glow + flex (CSP-safe)

```css
.td-glass-press { position: relative; overflow: hidden; transition: transform var(--_td-glass-dur) var(--_td-glass-ease-flex); }
.td-glass-press::after {
	content: "";
	position: absolute;
	inset: 0;
	border-radius: inherit;
	pointer-events: none;
	background: radial-gradient(circle var(--td-glass-glow-size) at var(--td-glow-x, 50%) var(--td-glow-y, 50%),
		var(--_td-glass-glow), transparent 70%);
	opacity: 0;
	transition: opacity var(--_td-glass-dur) var(--td-glass-ease);
}
.td-glass-press:active, .td-glass-press[data-pressed] { transform: scale(var(--_td-glass-press)); }
.td-glass-press:active::after, .td-glass-press[data-pressed]::after { opacity: 1; }
```

```js
// pointerdown handler — CSSOM custom properties are CSP-allowed (not a style attribute)
const r = el.getBoundingClientRect();
el.style.setProperty('--td-glow-x', `${e.clientX - r.left}px`);
el.style.setProperty('--td-glow-y', `${e.clientY - r.top}px`);
```

### 3.5 Núm toggle/slider "lift into glass"

```css
.td-knob { transition: transform var(--_td-glass-dur) var(--_td-glass-ease-flex), background-color var(--_td-glass-dur); }
.td-knob[data-dragging] {
	transform: scale(var(--_td-glass-lift-knob));
	background: var(--_td-glass-clear-fill);
	-webkit-backdrop-filter: blur(2px) saturate(160%);
	backdrop-filter: blur(2px) saturate(160%);
	box-shadow: var(--_td-glass-clear-rim), var(--_td-glass-lift);
}
```

### 3.6 Scroll edge

```css
/* Soft — the scroller under a floating top bar */
.td-scroll-edge-top {
	-webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 var(--td-scroll-edge-size));
	mask-image: linear-gradient(to bottom, transparent 0, #000 var(--td-scroll-edge-size));
}
/* Hard — pinned table header */
.td-table thead th {
	position: sticky;
	top: 0;
	background: var(--td-scroll-edge-hard-bg);
	-webkit-backdrop-filter: var(--_td-glass-filter);
	backdrop-filter: var(--_td-glass-filter);
}
```

(Mask chỉ nên bật khi đã cuộn: đặt `[data-scrolled]` bằng IntersectionObserver với sentinel ở đầu danh sách.
Như vậy khi ở trạng thái nghỉ, nội dung không bị mờ. HIG-C: "make sure its default or resting state … maintains
clear legibility".)

### 3.7 Không kính chồng kính

```css
html.td-modal-open :is(.td-menu, .td-dropdown__menu, .td-tooltip, .td-toast, .td-hovercard),
.td-modal[data-covered] .td-modal__dialog {
	background: var(--td-glass-solid);
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
}
```

### 3.8 Nở ra từ nguồn

```css
.td-popover { transform-origin: var(--td-origin-x, 50%) var(--td-origin-y, 0); /* set via CSSOM */
	opacity: 0; transform: scale(var(--_td-glass-enter));
	transition: opacity var(--_td-glass-dur) var(--td-glass-ease), transform var(--_td-glass-dur) var(--_td-glass-ease-flex); }
.td-popover.is-open { opacity: 1; transform: none; }
```

---

## 4. Thư viện bên thứ ba

| | `@ozcanyldzhn/liquid-glass-js` 1.0.2 | `ybouane/liquidglass` (`@ybouane/liquidglass` 1.0.3) |
|---|---|---|
| Kỹ thuật | **Hai engine.** SVG: `feImage` (displacement map sinh bằng canvas, xuất `toDataURL()` → `data:`) + `feDisplacementMap` + specular, áp qua `backdrop-filter: blur() url(#id)`. WebGL: **three.js**, nhưng chỉ khúc xạ **một ảnh nền tĩnh** lấy từ `background-image` của phần tử tổ tiên hoặc `.app-wallpaper-layer`, không phải DOM thật. | **Chụp DOM:** dùng `html-to-image` (SVG `foreignObject` → canvas) chụp **các con trực tiếp của `root`**, sau đó dùng fragment shader WebGL1 để làm refraction, chromatic aberration, fresnel, rim, shadow. Kết quả vẽ lên `<canvas>` chèn vào từng phần tử kính. |
| Trình duyệt | SVG engine: chỉ đúng trên **Chromium** (`backdrop-filter:url()`). Safari bị **UA-sniff** và ép sang WebGL (chỉ đúng khi nền là một ảnh). Firefox chưa kiểm chứng. | Mọi trình duyệt có WebGL1 + foreignObject. Nhưng chỉ thấy **anh em trong cùng `root`**, không thấy trang phía sau, nên không dùng được cho modal/menu/toast đã portal ra `body`. |
| Chi phí | Mỗi lần resize/đổi thuộc tính: vòng lặp JS chạy trên **từng pixel** để dựng 2 map, rồi mã hoá PNG. Kèm three.js. | Rasterise DOM rất đắt. Mỗi instance tạo 1 WebGL context (giới hạn khoảng 16). `data-dynamic`/video phải chụp lại mỗi frame. Resize thì chụp lại toàn bộ. |
| Kích thước | `liquid-glass.js` 619 KB (≈139 KB gzip), bundle luôn three.js. Tarball unpacked 7.4 MB. | `dist/index.js` 104 KB (≈26 KB gzip), bundle luôn html-to-image. |
| License / deps | MIT. Dep `three`, peer `react` + `vue`. | MIT. html-to-image (MIT, có patch-package). |
| CSP | ✗ Shadow root dùng `innerHTML` có `<style>` (CSP áp lên cả `<style>` trong shadow root). ✗ `feImage` dùng `data:` nên cần `img-src data:`. Có `el.style.*` qua CSSOM (hợp lệ). | ✗ Chèn `<style>` vào `<head>` (chế độ button). ✗ html-to-image nạp SVG `data:` vào `Image`, nên cần `img-src data:`. `fetch()` CSS font nên cần `connect-src`, font phải có CORS. `<img>` khác origin phải có `crossorigin`. |
| Kiến trúc kit | ✗ Dùng **Shadow DOM**, trái ràng buộc của kit. Custom element `<liquid-glass>` bọc nội dung. | ✗ Kính phải là **con trực tiếp của root**. Đặt `user-select:none` lên root. Ghi đè `position/overflow` của phần tử. |
| A11y | Không xử lý reduced-motion/transparency/contrast. Có tính năng kéo thả. | Không `matchMedia` nào. Không có fallback. |
| Bảo trì | Tạo 19/8/2026, 3 bản trong 6 ngày, commit cuối 31/8, **5 sao**, 1 người duy trì. Bundle kèm cả app demo Vue 78 KB trong `src`. | Tạo 4/4/2026, commit cuối 6/9/2026, **508 sao**, 7 issue mở, 1 người duy trì. |
| **Kết luận** | **REJECT** làm dependency. **BORROW (clean-room)**: công thức refraction profile + displacement map (Snell, bề mặt squircle). Thuật toán bắt nguồn từ bài kube.io, nên học từ bài gốc và ghi công. Chỉ dùng cho R15 opt-in, filter đặt trong file SVG tĩnh. | **REJECT** làm dependency. **BORROW ý tưởng** (không cần code): tham số hoá fresnel/rim/specular là gợi ý tốt cho `--td-glass-edge`. Hướng snapshot DOM thì không phù hợp với web component. |

---

## 5. Những chỗ 135/dwp đang lệch Apple hoặc tự mâu thuẫn

1. **135 `app/tokens.css`**: chú thích ghi "đục hơn một chút" nhưng giá trị lại **trong hơn** (0.66 so với 0.72,
   0.82 so với 0.86).
2. **135 không override `--td-glass-solid`**, nên mọi fallback bị chuyển sang trắng lạnh `#fbfbfc` trên nền giấy ấm.
3. **Dim 34%** (135) so với **35%** (HIG-M). Hơn nữa, bản thân 35% trên web là không đủ cho chữ (R5).
4. **dwp/135 cho rằng interaction glow "không làm được"**. Thực tế làm được bằng CSS và CSSOM (R6 §3.4).
5. **"feDisplacementMap is Chromium-only"**: chưa chính xác (R15).
6. **dwp: "Apple tăng độ đục giữa các bản beta iOS 26"**: không có trong các nguồn đã tải về, cần ghi là
   *chưa kiểm chứng*.
7. **Chỉ light mode**: HIG-C yêu cầu vẫn phải có cả màu dark. Kit giữ cả hai. 135 cần ghim bằng `data-td-theme="light"`.
8. **Fallback đặt ở selector từng component** (td-ui.css phải liệt kê 7 class): dễ sót (tooltip hoặc toast trên
   modal). Nên chuyển về tầng token private.
9. **Repo components**: nút nào cũng là kính, modal dùng `border-white/50` và blur 24px, các giá trị blur rải rác.
   Tất cả phải dẫn về token.
10. **Toolbar lightbox dùng nút 36px**: dưới mức 44px.
11. **Clear shadow bị hard-code hai giá trị khác nhau**: `td-glass.css` dùng `0 6px 18px -6px /45%`, lightbox dùng
    `0 8px 24px -8px /50%`. Đã gom thành `--td-glass-clear-shadow`.
