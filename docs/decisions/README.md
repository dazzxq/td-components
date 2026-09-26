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
| [0008](0008-drop-tailwind-token-css.md) | Bỏ Tailwind → CSS token phân lớp `td.css` | Accepted 2026-09-27 |
| [0009](0009-td-lightbox-hooks.md) | td-lightbox: port clean-room + hook | Accepted 2026-09-27 |
