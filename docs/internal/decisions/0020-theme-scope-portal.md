# ADR 0020 — Theme theo vùng + cầu portal

- Trạng thái: Accepted 2026-10-05 (v0.42.0, plan [v0.41.0-theming.md](../plans/v0.41.0-theming.md) R2 — N5 / N6, QĐ15–QĐ17)
- Liên quan: [ADR 0008](0008-drop-tailwind-token-css.md) (token + layer), [ADR 0011](0011-minimal-surfaces.md) (bề mặt),
  [ADR 0005](0005-csp-strict-cssom-adopted-sheets.md) (CSSOM dưới CSP strict)

## Bối cảnh

Đến 0.41.0 mọi token được khai báo trên `:root`, nên `var()` của token dẫn xuất (`--td-checkbox-color: var(--td-accent)`)
được giải **tại `:root`** rồi mới kế thừa xuống: `<section data-td-theme="dark">` không làm gì (nghiên cứu §1.4). Thêm vào
đó 13 module đưa popup ra `<body>` (dropdown, chip-input, tree-select, menu, hovercard, tooltip, toast, modal, drawer,
loading, media picker…), nên kể cả khi sửa selector, popup mở từ vùng tối vẫn ra theme của `<html>`.

## Quyết định

### 1. Selector: hai bậc specificity (`src/theme/selectors.js`, một nguồn cho kit và file sinh)

| Khe | Selector | Specificity |
|---|---|---|
| base (giá trị light; mỗi vùng giải lại) | `:root, [data-td-theme]` | 0,1,0 |
| light / auto tường minh (chỉ `color-scheme: light`) | `[data-td-theme="light"], [data-td-theme="auto"]` | 0,1,0 |
| biến thể `x` (`dark`, theme có tên của site) | `:root[data-td-theme="x"], [data-td-theme][data-td-theme="x"]` | 0,2,0 |
| `auto` dưới OS tối | biến thể `auto`, trong `@media (prefers-color-scheme: dark)` (build sinh) | 0,2,0 |

Lặp attribute (`[data-td-theme][data-td-theme="dark"]`) để biến thể **luôn** thắng khe base bất kể thứ tự file. Không lặp
thì một file sinh **light** của site (khe base, nạp sau `td.css`, cùng 0,1,0) sẽ sơn sáng lại mọi vùng
`[data-td-theme="dark"]`. (Lệch so với bảng selector của plan — plan ghi `[data-td-theme="dark"]` đơn; test
`td-v042-theme-scope.engines.browser-test.js` khoá hành vi.)

### 2. Chỉ token màu / bóng khai báo lại trên vùng (QĐ15)

Build (`scripts/css-theme.mjs` `checkThemeScope`) phân loại từng token: **màu** = có literal màu, tham chiếu token màu,
hoặc được rule dark đặt. Token màu nằm trong khối `:root, [data-td-theme]`; token hình học (độ rộng, chữ, spacing, bo
góc, z-index, motion) và thang xám `--td-gray-*` ở lại `:root` — nên `:root { --td-radius-lg: 10px }` của site vẫn tới
được trong vùng. Lint chặn cả hai chiều. Không themed có chủ đích: `--td-lb-*`, `--td-glass-clear-*` (lightbox luôn tối,
QĐ18), `--_td-*`. (Plan cho phép scope cả khối của file component; làm tách hết vì script làm được rẻ và giữ đúng hợp
đồng "override hình học trên `:root` luôn tới".)

### 3. Cầu portal (`bridgeTheme` trong `src/utils/layers.js`, QĐ16)

`bridgeTheme(portalRoot, anchor, { themeRoot })` → `unbridge()`:

1. `scope = (anchor ?? themeRoot).closest('[data-td-theme]')`. Không có, hoặc là `<html>` → **không làm gì** (con của
   `<body>` đã kế thừa theme trang; không thêm inline có thể cũ / đổi precedence).
2. Ngược lại, **trước khi popup hiện**: chép `data-td-theme` của scope lên `portalRoot`; snapshot
   `getComputedStyle(scope)` của **scope đã đánh dấu** (không phải anchor) cho mỗi tên trong allowlist `THEME_TOKENS`
   (`THEME_TOKENS_VERSION`) + `color-scheme`, ghi bằng CSSOM `style.setProperty` (CSP-safe). Token component tự giải
   lại trên portal root (nó là một vùng theme).
3. Tên đã có inline (do người khác đặt) không bị đụng; `unbridge()` gỡ đúng những gì lần gọi đó đặt (attribute trả lại
   khi vẫn là của nó) — portal root dùng lại không mang trạng thái cũ.
4. Gọi lại mỗi lần mở; không theo dõi live khi đang mở (đổi theme lúc popup mở: mở lại là đúng).

**Hợp đồng (chính xác):** đi qua portal chỉ có **token ngữ nghĩa trong allowlist `THEME_TOKENS`** (+ `color-scheme`) với
giá trị computed **trên scope đã đánh dấu** — nên override token ngữ nghĩa đặt trên chính phần tử có `data-td-theme` thì
theo. **Không** đi qua portal: (a) token riêng của component đặt trên scope (`.promo[data-td-theme] { --td-checkbox-color:
… }` — trên gốc popup token component tự giải lại từ token ngữ nghĩa đã chép); (b) **override cục bộ không đánh dấu**
(`.card { --td-accent: red }` bên trong vùng), kể cả token ngữ nghĩa. Ngoại lệ do thiết kế: rule chọn theo **giá trị**
attribute (`[data-td-theme="dark"] { … }`, theme có tên do `td-theme --name x` sinh) khớp luôn gốc popup vì attribute được
chép, nên mọi token trong rule đó — kể cả token component — có hiệu lực trong popup.

Gắn ở điểm mở của mọi portal: `openDialogLayer({ themeFrom })` (TdModal, td-drawer, media picker, crop dialog, sheet
upload / lọc), dropdown / chip-input / tree-select (host), TdMenu (`themeRoot` hoặc anchor), hovercard + tooltip
(trigger), TdToast / TdLoading (`themeRoot`). Popup lồng (menu trong modal đã bridge) tìm thấy root đã bridge làm scope →
tự đúng.

### 4. Overlay lập trình nhận `themeRoot`

`TdModal.show/confirm/success/error/info`, `TdToast.show/success/…` (`{ themeRoot }`), `TdLoading.show({ themeRoot })`,
`TdMenu.open(anchor, items, { themeRoot })`, `TdDrawer.open({ themeRoot })`, `TdMediaPicker.open({ themeRoot })`,
`TdCropper.openDialog({ themeRoot })`. Không có → theme tài liệu, không copy. Component của kit tự truyền host của nó
(datetime-picker / -range, scan-input, media-field).

### 5. Ngoại lệ

Lightbox **không** bridge (nền là ảnh, luôn tối — QĐ18).

## Hệ quả

- `<section data-td-theme="dark">` trong trang sáng (và ngược lại, lồng nhau) chạy bằng token gốc, popup mở từ trong theo
  vùng. Theme có tên do generator sinh (`td-theme --name x`) dùng cùng cơ chế.
- **Đổi hành vi (chỉ site dùng vùng):** override **màu** không layer trên `:root` không còn chảy vào trong vùng
  `[data-td-theme]` (vùng khai báo lại trong layer, thắng giá trị kế thừa). Ghi đè thêm trên `[data-td-theme="x"]`.
  Token hình học không đổi. Upgrade note: [breaking-changes § 0.42.0](../../upgrading/breaking-changes.md#0420).
- Allowlist = `THEME_TOKENS` (ngữ nghĩa). Không thêm token component (câu hỏi mở 1 của plan): token component tự giải lại
  trên portal root từ snapshot; site muốn chỉnh token component theo vùng thì đặt trên scope có `data-td-theme`.
- Thêm token vào hợp đồng = tăng `THEME_TOKENS_VERSION` (allowlist theo).

## Phương án bỏ

- Copy **mọi** custom property computed của anchor: kéo theo override cục bộ không chủ đích, hàng trăm tên, không có
  version.
- Live refresh (MutationObserver trên scope): chi phí cho một ca hiếm, non-goal của plan.
- `@scope` / container style query: không có trên sàn trình duyệt (Chrome 102 / Firefox 112 / Safari 16.4).
