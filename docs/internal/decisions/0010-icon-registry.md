# 0010. Icon registry: render icon theo tên, dữ liệu Lucide, không hardcode SVG

- **Status:** Accepted
- **Date:** 2026-09-27 (user đề xuất; debate Claude ↔ Codex `/codex-think-about`, đồng thuận vòng 1)

## Context

SVG bị hardcode ở ~13 module (chuỗi `<svg>` trong template `innerHTML`), lightbox có bản `makeIcon` riêng, story
còn dùng ký tự (`✕`, `⤢`). Mỗi nơi một cỡ, một nét, một cách a11y. dwp có `Icon.php` (sprite Lucide + mask CSS),
dcms2 có `dcms-icon` (JSON + sanitizer allowlist nhưng render bằng `innerHTML`).

## Decision

- **Một registry, render theo tên.** Nguồn soạn: `src/icons/icons.json` (tên ngữ nghĩa của td → hình học
  Lucide, ghi tên gốc ở `lucide`). `npm run build:icons` sinh `src/icons/registry.js` (ESM thuần); PHP đọc thẳng
  JSON (export `./icons.json`) → SSR ra cùng markup.
- **Lucide** (ISC; phần từ Feather: MIT) — nét 24/2px đồng nhất, hợp Liquid Glass, trùng dwp. **Không** Font
  Awesome (CC BY 4.0 buộc ghi công + phong cách đặc lệch tông). Brand icon **không** vào core: site tự đăng ký
  sau khi xét quyền (vd Simple Icons).
- **Tập nhỏ có chọn lọc** (chỉ icon td dùng), không vendor cả bộ. Registry theo tên không tree-shake từng icon
  → kiểm soát dung lượng bằng tập nhỏ, không bằng lời hứa tree-shaking.
- **API:** `tdIcon(name, { size: 's'|'m'|'l'|8–128, label, class })` → `SVGElement` dựng bằng `createElementNS`
  (không `innerHTML`); `registerIcons(defs)` (dữ liệu thôi: allowlist tag `path/circle/rect/line/polyline/
  polygon/ellipse` + thuộc tính hình học; từ chối chuỗi markup, `style`, `href`, event, URL; trùng tên → lỗi;
  cả lô hoặc không gì); `hasIcon`, `listIcons`. `<td-icon>` là façade tuỳ chọn ở module riêng
  (`./icon-element`), giữ nguyên SVG do SSR render sẵn.
- **Cỡ:** token `--td-icon-s/m/l` (1 / 1.25 / 1.5rem) qua class `.td-icon--s|m|l`; số nguyên → thuộc tính
  `width/height` (không inline style). Nét: `--td-icon-stroke`. Không bật `non-scaling-stroke`.
- **A11y:** mặc định trang trí (`aria-hidden`, `focusable="false"`); có `label` → `role="img"` + `aria-label` +
  `<title>` (textContent). Icon trong nút đã có nhãn thì để trang trí.
- **Sprite/mask:** không dùng cho core (sprite cần vòng đời symbol + đánh dấu icon đã dùng như dwp; mask mất
  ngữ nghĩa và khó tuỳ cỡ).

## Consequences

- td-lightbox dùng registry ngay (v0.6.0); toolbar mở rộng nhận `icon: 'tên'` hoặc `iconNode` (SVGElement tin cậy).
- Component legacy chuyển icon theo từng batch migrate (roadmap), không sửa hàng loạt ngay. Spinner/biểu đồ/
  minh hoạ không bắt buộc vào registry.
- Thêm icon core: sửa `icons.json` → `npm run build:icons` → `check:icons` trong `npm test` giữ registry khớp.
