# ADR 0039 — Icon owner tự vẽ trong registry core (`"source": "td"`, `paint: "fill"`), bổ sung ADR 0010

Trạng thái: **chấp nhận** — 2026-11-03 (v0.94.0). Plan [v0.94.0-icons-picker](../plans/v0.94.0-icons-picker.md) (Codex plan APPROVE r3); owner chốt 2026-11-03: "cứ cho vào" (chín glyph bố cục của dcms2, lấy nguyên hình).
Liên quan: [ADR 0010](0010-icon-registry.md) (registry, dữ liệu Lucide), [ADR 0007](0007-td-canonical-over-dcms.md) (dcms2 độc lập, kit là nguồn chuẩn).

## Bối cảnh

ADR 0010 viết "hình học Lucide" cho mọi icon core: mỗi mục `icons.json` ghi tên gốc ở `lucide`. dcms2 có 9 glyph bố cục
do owner tự vẽ trong editor (`align-none`, `align-wide`, `align-full`, `float-left`, `float-right`, `float-wide-left`,
`float-wide-right`, `photostory-left`, `photostory-right`) mà Lucide không có hình tương đương. Owner muốn mọi site dùng
kit có sẵn các hình này, dcms2 bỏ `registerIcons` riêng sau phát hành. Hình tô đặc (`fill`) trong khung 24, không phải
nét 2px.

## Quyết định

1. **Registry core nhận icon "td"**: mục `icons.json` ghi `"source": "td"` thay cho trường `lucide`. Mỗi icon có **đúng
   một** trong hai (`lucide` xor `source: "td"`); `npm run build:icons` / `check:icons` báo lỗi nếu thiếu hoặc có cả hai.
2. **Vẫn qua đúng allowlist của registry**: khung `0 0 24 24`, tag `path/circle/rect/line/polyline/polygon/ellipse` +
   thuộc tính hình học, tối đa 64 node, tên ngữ nghĩa theo quy tắc td. Không thêm cơ chế render mới.
3. **`"paint": "fill"`** cho chín hình này (registry hỗ trợ sẵn từ 0.6.0; SSR in `fill="currentColor"`). Token
   `--td-icon-stroke` **không tác dụng** với chúng: thanh 1,5–2px của hình tô đặc nặng gần bằng nét 2px của Lucide.
4. **Chép nguyên văn** phần tử SVG của dcms2, không nắn lại. Ghi nhận hai điểm lệch quy ước: tô đặc thay vì nét, và
   `photostory-left/right` chạm x = 1 và x = 23 (Lucide giữ vùng 2–22).
5. **Chỉ owner (hoặc người owner duyệt) thêm loại này.** Tác giả khác không tự đặt `source: "td"`.
6. **Phần còn lại của ADR 0010 đứng nguyên**: Lucide là nguồn mặc định; **không** Font Awesome; **không** icon thương hiệu
   trong lõi (site tự `registerIcons`).
7. **Giấy phép:** icon `source: "td"` là hình gốc của td, **không** thuộc ISC của Lucide; cùng giấy phép với package.
   `THIRD_PARTY_NOTICES.md` ghi rõ.

## Hệ quả

- `THIRD_PARTY_NOTICES.md`: đoạn Lucide 0.94.0 (đối chiếu lucide-static 1.66.0, ba tên canonical đổi, bỏ `fill` ở chấm
  của `tags` / `images`) + câu về icon owner tự vẽ.
- ADR 0010 thêm dòng "Amended by 0039". Docs [icons.md](../../components/icons.md) có mục "Icon owner tự vẽ".
- Registry cùng đợt tăng 75 → 188 icon (một registry, ADR 0010 + quyết định D6 của plan: tách core / mở rộng phá SSR
  parity). Tên icon mới có thể trùng `registerIcons()` của site không tiền tố → ném lúc khởi động; docs khuyên `site-*`.

## Phương án đã bác

- **Giữ chín hình ở `registerIcons()` của dcms2.** Mỗi site dùng bộ bố cục này phải sao chép; owner muốn kit là nguồn
  duy nhất.
- **Vẽ lại bằng nét 2px kiểu Lucide.** Đổi hình owner đã quen; owner chọn "lấy nguyên hình".
- **Nắn photostory vào vùng 2–22.** Tự ý sửa hình; để owner quyết khi cần.
- **Mở cửa cho bất kỳ nguồn nào (`source: "fa"`, `"brand"`…).** Phá ràng buộc giấy phép + phong cách của ADR 0010.
