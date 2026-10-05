# Decisions (ADR)

Mỗi quyết định kiến trúc một file: Status / Date / Context / Decision / Consequences. Không sửa ADR đã Accepted;
muốn đổi thì viết ADR mới và đánh dấu cái cũ `Superseded by`.

| # | Quyết định | Status |
|---|---|---|
| [0001](0001-web-components-no-shadow-dom.md) | Web Components, không Shadow DOM | Accepted |
| [0002](0002-tailwind-v4-peer.md) | Tailwind v4 là peerDependency | Superseded by 0008 |
| [0003](0003-elementinternals-form-association.md) | Form association bằng ElementInternals | Accepted |
| [0004](0004-toggle-uncontrolled-default.md) | td-toggle mặc định uncontrolled | Accepted |
| [0005](0005-csp-strict-cssom-adopted-sheets.md) | CSP strict: CSSOM + constructable stylesheet | Accepted (thu hẹp bởi 0008) |
| [0006](0006-modal-no-backdrop-close.md) | td-modal không đóng khi click backdrop | Accepted |
| [0007](0007-td-canonical-over-dcms.md) | td là thư viện chuẩn; dcms2 độc lập | Accepted |
| [0008](0008-drop-tailwind-token-css.md) | Bỏ Tailwind → CSS token phân lớp `td.css` | Accepted 2026-09-27 — done 0.11.0 |
| [0009](0009-td-lightbox-hooks.md) | td-lightbox: port clean-room + hook | Accepted 2026-09-27 |
| [0010](0010-icon-registry.md) | Icon registry: render theo tên (Lucide), không hardcode SVG | Accepted 2026-09-27 |
| [0011](0011-minimal-surfaces.md) | Minimal surfaces thay Liquid Glass (nền + viền + một shadow, blur chỉ popup nhỏ) | Accepted 2026-10-02 |
| [0012](0012-ssr-hydration.md) | SSR contract + hydrate tại chỗ (PHP in markup đã style, JS nhận tại chỗ; hết flash lúc tải) | Accepted 2026-10-03 |
| [0013](0013-media-picker-boundary.md) | Media picker: kit sở hữu vỏ tương tác, app sở hữu adapter / quyền / lưu trữ; capability ≠ quyền; danh tính = `assetId`; FormData của media field là API công khai (supersede dòng "Không làm … media-picker", ADR 0007 giữ nguyên). [Bổ sung v0.33](0013-media-picker-boundary.md#bổ-sung-v033) (chỉ thêm): `uploadFromUrl` + SSRF thuộc server, `copyLink`, `pagination: 'pages'`, `pageSize` 30, kit không kiểm usage, blob chỉ tải về; crop → v0.35. [Bổ sung v0.35](0013-media-picker-boundary.md#bổ-sung-v035) (chỉ thêm): option `crop` chạy thật (typedef không đổi), `urls.preview` nguyên ảnh khi bật crop, `name[focal]` opt-in, field `croppable`. [Bổ sung v0.36](0013-media-picker-boundary.md#bổ-sung-v036) (chỉ thêm): tự chọn bị loại, tự xem trước asset đầu ≥ 720; sheet lọc < 1024; pager dưới lưới < 720 | Accepted 2026-10-04 (bổ sung v0.33, v0.35, v0.36) |
| [0014](0014-breakpoints-container-queries.md) | Breakpoint có tên (480 / 720 / 1024 / 1280, `short` ≤ 500) + `@container` cho component trong dòng nội dung, `@media` cho lớp phủ / thiết bị; gate số breakpoint + luật nền (không tràn, chạm ≥ 44 khi coarse) | Accepted 2026-10-04 |
| [0015](0015-td-cropper.md) | `td-cropper` tự viết (không CropperJS: inline style / Shadow DOM / canvas): chỉ xuất toạ độ (`normalized` + `pixels` khi biết kích thước gốc + focal), không bao giờ canvas / blob / fetch / upload; zoom = cỡ khung; `MIN_PX` nội bộ; toàn ảnh = `null` ở tầng tích hợp | Accepted 2026-10-04 |
| [0016](0016-toast-placement.md) | Toast 6 vị trí logic (`top/bottom-start/center/end`): `configure()` + tham số thứ ba `{ duration, placement }`, ưu tiên lần gọi > configure > token neo cũ (stack legacy) > `top-end`; một portal root > lane > stack lười; MAX_VISIBLE / FIFO / pause / layer toàn cục; < 480 lane rộng hết; `short` 2 toast mới nhất toàn cục | Accepted 2026-10-05 |
| [0017](0017-shared-check-mark.md) | Ô tick chung: một phần hình `.td-check` (= hình `td-checkbox`) cho mọi "tick để chọn" (media grid / picker, tree, multiselect, menu checkbox; chọn dòng bảng sau này); không bao giờ lồng `<td-checkbox>`; trạng thái đọc từ ARIA sẵn có, danh sách selector ở `check.css`; `td-checkbox` thêm `indeterminate` | Accepted 2026-10-05 |
| [0019](0019-touch-standard.md) | Chuẩn cảm ứng: `:hover` chỉ trong `(hover: hover) and (pointer: fine)`, hình nhấn `:is(:active, [data-td-pressed])` chỉ đổi màu (lint `check:css`, `press.js` không phụ thuộc quirk iOS), tooltip không bật khi chạm, ngưỡng kéo theo loại con trỏ, bảng `touch-action`, dialog né bàn phím ảo (`visualViewport`), lightbox vuốt theo ngón; lane `test:touch` | Accepted 2026-10-05 |
