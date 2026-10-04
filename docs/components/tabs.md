[Tài liệu](../README.md) › [Components](README.md) › Tabs

# Thẻ (tabs) — `<td-tabs>`

Thanh chuyển thẻ dạng segmented control, đúng mẫu WAI-ARIA APG "Tabs": `role="tablist"` / `role="tab"`,
`aria-selected`, roving tabindex, mặc định **kích hoạt thủ công** (mũi tên chỉ di chuyển focus, Enter/Space mới chọn).
Tuỳ chọn quản lý luôn panel nội dung (`role="tabpanel"`, `hidden`…). Dùng để chuyển giữa các vùng nội dung ngang hàng
trên cùng một trang; **không** dùng làm menu điều hướng giữa các trang (dùng `<nav>` + link) và không dùng cho lựa
chọn giá trị trong form (dùng [dropdown](dropdown.md) hoặc radio).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/tabs'` (class: `import { TdTabs } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.8.0: cần `td.css`) |

## Ví dụ nhanh

```html
<td-tabs id="account-tabs" aria-label="Cài đặt tài khoản"></td-tabs>

<section id="panel-profile">Hồ sơ…</section>
<section id="panel-billing">Thanh toán…</section>

<script type="module">
  import '@dazzxq/td-components/tabs';

  const tabs = document.getElementById('account-tabs');
  tabs.tabs = [
    { id: 'profile', label: 'Hồ sơ', panel: 'panel-profile' },
    { id: 'billing', label: 'Thanh toán', icon: 'link', panel: 'panel-billing' },
  ];
  tabs.addEventListener('tab-change', (e) => console.log('Đang ở thẻ', e.detail.tabId));
</script>
```

Với `panel`, td-tabs tự ẩn/hiện `#panel-profile` / `#panel-billing` và gắn ARIA; bạn không cần viết JS chuyển nội dung.

## Cách dùng

### 1. Tự quản lý nội dung (không dùng `panel`)

```js
const tabs = document.querySelector('td-tabs');
tabs.tabs = [
  { id: 'all', label: 'Tất cả' },
  { id: 'draft', label: 'Nháp' },
  { id: 'published', label: 'Đã đăng' },
];
tabs.onChange = (tabId) => loadPosts({ status: tabId });
```

Không có `panel` thì td-tabs chỉ là thanh chọn; bạn tự đổi nội dung trong `onChange` hoặc listener `tab-change`.

### 2. Chọn thẻ ban đầu

```html
<td-tabs active-tab="billing"></td-tabs>
```

Thẻ đang chọn được xác định theo thứ tự: thẻ hiện tại (nếu còn tồn tại) → attribute `active-tab` (nếu khớp một `id`)
→ thẻ đầu tiên.

### 3. Đổi thẻ bằng code

```js
tabs.setActiveTab('billing');           // phát tab-change + gọi onChange (nếu thẻ thực sự đổi)
tabs.setAttribute('active-tab', 'profile'); // đổi IM LẶNG: không event, không onChange
tabs.getActiveTab();                    // 'profile'
```

Dùng `setActiveTab` khi muốn đoạn code nghe `tab-change` chạy theo (ví dụ đồng bộ URL); dùng attribute `active-tab`
khi chỉ muốn đồng bộ giao diện (ví dụ khôi phục từ `location.hash`) mà không kích hoạt lại logic.

### 4. Kích hoạt tự động khi di chuyển bằng mũi tên

```html
<td-tabs activation="auto"></td-tabs>
```

`activation="auto"`: mũi tên / Home / End vừa di focus vừa chọn luôn (mỗi lần di chuyển phát một `tab-change`). Chỉ nên
dùng khi đổi thẻ rẻ (nội dung đã có sẵn); nếu mỗi lần đổi thẻ phải tải dữ liệu, giữ mặc định `manual`.

### 5. Kích thước nhỏ

```html
<td-tabs size="sm"></td-tabs>
```

### 6. Icon trong thẻ

```js
tabs.tabs = [
  { id: 'upload', label: 'Tải lên', icon: 'upload' },
  { id: 'link', label: 'Liên kết', icon: 'link' },
];
```

`icon` là **tên icon trong registry** (core hoặc do site `registerIcons()`), vẽ cỡ `s`, trang trí (`aria-hidden`). Xem
[Icons](icons.md). Giá trị không phải tên registry bị coi là danh sách class cũ (ví dụ `'fas fa-link'`) và render thành
`<i class="…" aria-hidden="true">`; cách này **đã deprecated**, chỉ giữ cho site cũ. Class không hợp lệ bị lọc bỏ.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `size` | `'sm'` \| `'md'` | `md` | Kích thước; giá trị khác → `md`. Đổi tại chỗ. |
| `active-tab` | string | — | `id` thẻ đang chọn. Đổi sau khi render → chọn im lặng (không event). |
| `activation` | `'manual'` \| `'auto'` | `manual` | Chỉ đúng chuỗi `auto` mới bật tự động. Đọc mỗi lần nhấn phím nên đổi lúc nào cũng có hiệu lực. |
| `aria-label` | string | `Các thẻ` | Tên của tablist. |
| `aria-labelledby` | id | — | Tên tablist theo phần tử khác; **ưu tiên hơn** `aria-label`. Được chuyển xuống tablist. |

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `tabs` | `Array<{ id, label, icon?, panel? }>` | Danh sách thẻ. Mục thiếu `id` (hoặc `id` rỗng) bị bỏ qua; `id` được ép sang chuỗi; `label` null → `''`. Gán lại → dựng lại thanh, nếu focus đang trong td-tabs thì focus về thẻ đang chọn. |
| `onChange` | `(tabId: string) => void` | Callback khi thẻ đổi do người dùng hoặc `setActiveTab`. Không phải function → `null`. |
| `setActiveTab(tabId)` | `(string) => void` | Chọn thẻ; nếu thật sự đổi thì gọi `onChange` rồi phát `tab-change`. `id` không tồn tại hoặc đang chọn → không làm gì. |
| `getActiveTab()` | `() => string \| null` | `id` thẻ đang chọn, `null` nếu không có thẻ. |

Khoá của một mục `tabs`:

| Khoá | Kiểu | Mô tả |
|---|---|---|
| `id` | string | Bắt buộc, định danh thẻ (trả về trong `tab-change`). |
| `label` | string | Chữ hiển thị (escape). **Không bao giờ bị cắt** (v0.34.0): không đủ chỗ thì hàng thẻ cuộn ngang — xem [Responsive](#responsive-v0340). |
| `icon` | string | Tên icon registry (hoặc class cũ, deprecated). |
| `panel` | string | `id` của phần tử panel **nằm ngoài** td-tabs (cùng document / shadow root với td-tabs). |

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `tab-change` | `{ tabId }` | Người dùng chọn thẻ **khác** thẻ hiện tại (click, Enter/Space, hoặc mũi tên khi `activation="auto"`), hoặc gọi `setActiveTab()`. Đúng một lần mỗi lần chọn. Click lại thẻ đang chọn và đổi attribute `active-tab` **không** phát. | có (composed) |

`onChange(tabId)` được gọi **trước** khi event phát. `onChange` ném lỗi → lỗi được ghi `console.error`, thẻ vẫn đổi và
`tab-change` vẫn phát (từ 0.16.0).

## Panel được quản lý (`panel`)

Khi một thẻ có `panel: 'some-id'` và phần tử `#some-id` tồn tại (ngoài td-tabs), td-tabs:

- đặt `aria-controls="some-id"` trên nút thẻ;
- đặt trên panel: `role="tabpanel"`, `aria-labelledby="{id-của-thẻ}"`, `hidden` khi thẻ không được chọn;
- đặt `tabindex="0"` trên panel **chỉ khi** panel không chứa phần tử focus được (để người dùng bàn phím Tab vào đọc
  được); nếu có phần tử focus được thì trả `tabindex` về giá trị gốc.

Giá trị gốc của cả 4 attribute (`role`, `aria-labelledby`, `hidden`, `tabindex`) được **ghi nhớ** và **trả lại** khi
panel không còn được quản lý (gán lại `tabs` không có panel đó) hoặc khi td-tabs bị gỡ khỏi DOM. Gắn lại td-tabs thì nó
quản lý lại.

```html
<td-tabs id="t"></td-tabs>
<div id="p-a">Nội dung A</div>
<div id="p-b" hidden>Nội dung B</div>
```

Panel phải tồn tại lúc td-tabs render hoặc lúc đổi thẻ; nếu bạn chèn panel muộn hơn, gán lại `tabs` để td-tabs nhận
panel đó. Nên để sẵn `hidden` trên panel không mặc định chọn trong HTML server để tránh nháy nội dung trước khi JS chạy.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-tabs-bg` | `var(--td-color-hover)` | Nền "rãnh" chứa các thẻ |
| `--td-tabs-pill` | `var(--td-color-surface)` (dark: `rgb(255 255 255 / 14%)`) | Nền viên thuốc của thẻ đang chọn |
| `--td-tabs-pill-shadow` | `var(--td-shadow-1)` (dark: `0 1px 2px rgb(0 0 0 / 40%)`) | Bóng viên thuốc |
| `--td-tabs-fg` | `var(--td-color-text-muted)` | Chữ thẻ chưa chọn |
| `--td-tabs-fg-hover` | `var(--td-color-text)` | Chữ khi hover |
| `--td-tabs-fg-active` | `var(--td-color-text)` | Chữ thẻ đang chọn |
| `--td-tabs-radius` | `12px` | Bo góc rãnh (bo góc viên thuốc tự tính đồng tâm) |
| `--td-tabs-pad` | `4px` | Khoảng đệm rãnh và khoảng cách giữa thẻ |

`--td-tabs-ind-x` / `--td-tabs-ind-w` do JS ghi (CSSOM) để đặt vị trí viên thuốc; không tự đặt.

```css
:root { --td-tabs-radius: 999px; }              /* rãnh dạng capsule */
.toolbar td-tabs { --td-tabs-bg: transparent; }  /* chỉ trong toolbar */
```

Các thẻ chia đều chiều rộng (`flex: 1 1 0`) khi đủ chỗ (xem [Responsive](#responsive-v0340)). td-tabs không có glass
(lớp nội dung).

## Responsive (v0.34.0)

td-tabs chọn bố cục theo **bề rộng thật của chính nó** (đo bằng `ResizeObserver`, không theo viewport), nên đặt trong
cột hẹp của trang desktop cũng đúng như trên điện thoại.

- **Đủ chỗ → ô bằng nhau** (segmented control như cũ). "Đủ chỗ" nghĩa là thẻ **rộng nhất** (đo ở kiểu đang chọn — chữ
  đậm, nên đổi thẻ không bao giờ làm nhãn bị cắt) vừa một ô: `ô = (bề rộng rãnh − khoảng cách × (n − 1)) / n`.
- **Không đủ → hàng thẻ cuộn ngang**: mỗi thẻ rộng theo nhãn, rãnh cuộn ngang (bắt dính nhẹ, ẩn thanh cuộn), mép bị
  che mờ dần (`data-scroll-start` / `data-scroll-end`), thẻ đang chọn tự cuộn vào tầm nhìn (chỉ cuộn rãnh, không cuộn
  trang), viên thuốc cuộn cùng thẻ. Một nhãn rất dài giữa các nhãn ngắn cũng chuyển sang chế độ này (ô bằng nhau không
  chứa nổi nó) thay vì cắt nó.
- **Chữ không xê dịch khi đổi thẻ (0.36.0).** Nhãn thẻ đang chọn in đậm; mỗi `.td-tabs__label` mang `data-label` và
  `::after { content: attr(data-label) }` (cao 0, `visibility: hidden`, đậm) giữ chỗ bề rộng **chữ đậm** ở mọi trạng
  thái — đổi thẻ không đổi bề rộng nhãn, không đẩy thẻ bên cạnh (cả ô bằng nhau lẫn hàng cuộn). Phần giữ chỗ không vào
  cây truy cập, không bị tìm / copy. Site markup tay (SSR) nên in `data-label` = nhãn (escape thuộc tính); thiếu thì chỉ
  mất phần giữ chỗ.
- **Nhãn không bao giờ bị cắt `…`** ở cả hai chế độ.
- Có **vùng trễ 4px** (vào chế độ cuộn khi thẻ rộng nhất > ô, ra khi ≤ ô − 4px) nên kéo cửa sổ qua lại quanh ngưỡng
  không làm bố cục nhảy. JS chỉ đo lại khi `tabs` / nhãn / icon / `size` đổi, khi web font tải xong
  (`document.fonts` `loadingdone`) hoặc khi cỡ chữ đổi — không đo lại mỗi lần resize.
- Trạng thái nằm trên `.td-tabs`: `[data-overflow]` (chế độ cuộn), `[data-scroll-start]` / `[data-scroll-end]` (còn
  nội dung bị che ở đầu / cuối). Chỉ để đọc / style; đừng tự đặt.
- **Cần bề rộng từ cha**: host là `display: block; min-inline-size: 0` — trong grid / flex nó không đẩy cột rộng ra
  mà cuộn. Đặt trong khung co theo nội dung (`inline-block`, `float`, flex item `flex: 0 1 auto` không có `width`) thì
  rãnh rộng theo tổng nhãn và không bao giờ cuộn — cho nó một bề rộng.
- Thiết bị cảm ứng (`pointer: coarse`): mỗi thẻ ≥ 44 × 44px (cả thẻ một chữ).
- Không phụ thuộc container query → chạy giống nhau trên mọi trình duyệt trong hợp đồng hỗ trợ.

## Cấu trúc DOM & class

```html
<td-tabs id="t">
  <div class="td-tabs td-tabs--md" role="tablist" aria-label="Các thẻ" data-state="ready"
       [data-overflow] [data-scroll-start] [data-scroll-end]>
    <span class="td-tabs__indicator" aria-hidden="true"></span>
    <button type="button" role="tab" class="td-tabs__tab" id="t-tab-0" data-tab-id="profile"
            aria-selected="true" tabindex="0" aria-controls="panel-profile">
      <span class="td-tabs__icon" data-td-icon="upload" data-td-icon-size="s" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg></span>
      <span class="td-tabs__label" data-label="Hồ sơ">Hồ sơ</span>
    </button>
    …
  </div>
</td-tabs>
```

- Không có thẻ nào: `<div class="td-tabs td-tabs--md" data-state="empty"></div>` (không có `role`).
- `data-state="ready"` được đặt sau khi đo xong vị trí viên thuốc; trước đó viên thuốc ẩn (không trượt từ x = 0).
- Id của nút thẻ: `{id host}-tab-{i}`; host không có id thì được gán `td-tabs-{n}`.
- Trạng thái chọn: `[aria-selected="true"]` trên `.td-tabs__tab`.
- Render phía server: in sẵn khối `.td-tabs` ở trên (td.css style được, viên thuốc ẩn tới khi JS đặt
  `data-state="ready"`; icon bằng `td_icon('upload', 's')` của [adapter PHP](../guides/php-adapter.md) hoặc slot
  `data-td-icon` — xem [Icons](icons.md#icon-trong-markup-render-sẵn)); khi JS chạy, td-tabs render lại từ `tabs`. Tabs
  không có helper PHP; fixture `test/contracts/tabs.html` trong repo kit chỉ dùng cho test (không nằm trong gói npm).

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab | Vào thẻ đang chọn (chỉ một điểm dừng Tab cho cả thanh — roving tabindex), Tab tiếp ra khỏi thanh / vào panel |
| ← / → | Di focus sang thẻ trước / sau, vòng quanh. Tự đảo chiều khi `direction: rtl`. |
| Home / End | Focus thẻ đầu / cuối |
| Enter / Space | Chọn thẻ đang focus (nút native) |

- Ở chế độ `manual`, roving tabindex **đi theo focus**: thẻ vừa được focus bằng mũi tên là thẻ Tab sẽ quay về, dù chưa
  được chọn.
- Phím kèm Alt / Ctrl / Meta bị bỏ qua (không chặn phím tắt trình duyệt).
- Vùng bấm ≥ 24 px, ≥ `--td-touch-min` trên thiết bị cảm ứng. Chữ thẻ chưa chọn và đã chọn đạt ≥ 4.5:1 (sáng + tối).
- `prefers-reduced-motion`: viên thuốc không trượt. Forced colors: thẻ chọn có viền `Highlight` 2px.

## Bảo mật

`label`, `id`, `icon`, `panel` đều được escape khi vào markup; class icon cũ qua whitelist ký tự. Không có cửa sau HTML.

## Lưu ý & lỗi thường gặp

- **Panel nằm trong td-tabs** sẽ không được quản lý (td-tabs render đè nội dung của chính nó). Đặt panel ở ngoài.
- **Đổi `active-tab` không phát event** — cố ý. Muốn event thì dùng `setActiveTab()`.
- **Thẻ nằm trong phần tử đang ẩn** (`display: none`, tab ẩn, modal chưa mở): viên thuốc và bề rộng thẻ chưa đo được;
  `ResizeObserver` đo lại khi phần tử hiện ra.
- **Đổi chữ nhãn trực tiếp trong DOM** (không qua `tabs`) không được đo lại — luôn gán lại `tabs`.
- Nếu gán `tabs` không chứa thẻ đang chọn, td-tabs chọn lại theo `active-tab` hoặc thẻ đầu **mà không phát event**.
- Host có id trùng giữa hai td-tabs sẽ làm id thẻ trùng; để td-tabs tự sinh id hoặc đặt id khác nhau.

## Xem thêm

- [Icons](icons.md) · [Theming](../customization/theming.md) · [Hooks](../customization/hooks.md)
- [Trợ năng](../guides/accessibility.md) · [Cách component hoạt động](../concepts/how-it-works.md)
