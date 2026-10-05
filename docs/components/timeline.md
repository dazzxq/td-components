[Tài liệu](../README.md) › [Components](README.md) › Timeline

# Dòng sự kiện theo thời gian — `<td-timeline>`

Lịch sử đơn hàng, lịch sử IMEI, audit theo từng đối tượng: các sự kiện **nhóm theo ngày** ("Hôm nay", "Hôm qua", "Thứ Hai,
05/10/2026"), mỗi sự kiện có icon, tông màu, người làm, giờ, dòng phụ và **nội dung mở rộng** (`<details>` native, có thể
tải lười). Danh sách dài → "**Xem thêm**" (callback, hoặc link khi không JS). Mọi trường là **chữ**.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/timeline'` (class: `import { TdTimeline } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| PHP | `td_timeline(array $items, array $o = [])` — markup đầy đủ, mở chi tiết + "Xem thêm" chạy không cần JS |
| Từ phiên bản | 0.45.0 (cần `td.css`) |

## Ví dụ nhanh

```html
<h2 id="lich-su">Lịch sử đơn hàng</h2>
<td-timeline id="history" time-zone="Asia/Ho_Chi_Minh" aria-labelledby="lich-su"></td-timeline>

<script type="module">
  import '@dazzxq/td-components/timeline';

  document.querySelector('#history').items = [
    { id: 61, time: '2026-10-05T07:15:00Z', title: 'Đổi trạng thái: Chờ giao → Đang giao', actor: 'Nguyễn An',
      icon: 'send', tone: 'info', meta: 'Kho Hà Nội · GHN #A123' },
    { id: 60, time: '2026-10-04T09:00:00.123456Z', title: 'Sửa địa chỉ giao hàng', actor: { name: 'Lê Chi', href: '/nhan-vien/7' },
      icon: 'pencil', details: 'Trước: 12 Hàng Bài\nSau: 45 Lý Thường Kiệt' },
    { id: 59, time: 1791160200, title: 'Tạo đơn hàng #DH-1024', href: '/don/1024', icon: 'plus' },
  ];
</script>
```

## Cách dùng

### 1. Dữ liệu (`items`)

| Khoá | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `time` | Date \| number \| string | — | **Thời điểm** (instant) — xem §2. |
| `title` | string \| number | — (bắt buộc) | Nội dung chính (≤ 300 ký tự): "Đổi trạng thái: Chờ giao → Đang giao". Thiếu → mục bị bỏ + một cảnh báo. |
| `href` | string | — | Tiêu đề thành link (chỉ cùng origin; `javascript:` / origin khác → chữ thường). |
| `actor` | string \| `{ name, href? }` | — | Người làm (≤ 120); `href` → link (cùng luật). |
| `meta` | string | — | Dòng phụ ngắn (≤ 200): "Kho Hà Nội · IP 1.2.3.4". |
| `icon` | string | chấm tròn | Tên icon trong registry (§4). |
| `tone` | `neutral` \| `success` \| `warning` \| `danger` \| `info` | `neutral` | Màu marker — **trang trí** (§4). |
| `details` | string \| `true` | — | Nội dung mở rộng: chữ (≤ 5 000, **giữ xuống dòng**) hoặc `true` = tải lười (§5). |
| `expanded` | boolean | `false` | Mở sẵn chi tiết. |
| `id` | string \| number | vị trí từ 1 | Danh tính (≤ 200): cache chi tiết lười, chống trùng khi "Xem thêm". Trùng → hậu tố `-2`. |

- Mọi chuỗi là **chữ** (`textContent`): không markdown, không `**bold**`, không tự nhận diện link. Nội dung giàu (bảng,
  diff) → `renderDetails` trả **Node** (§5).
- Kit **tự sắp xếp ổn định** theo thời điểm (`order`); cùng thời điểm giữ thứ tự app đưa. Đọc lại `el.items` → bản chuẩn
  hoá (bản sao, `time` là ISO UTC hoặc `null`). Gán `items` im lặng (không event).

### 2. Thời điểm phải có múi giờ

Nhận: `Date` hợp lệ; số epoch (ms; `< 1e12` hiểu là **giây**); chuỗi ISO 8601 **có `Z` hoặc offset**
(`2026-10-05T07:15:00Z`, `2026-10-05T14:15:00+07:00`, `…+0700`, `…+07`). Phần lẻ giây **1–9 chữ số** được nhận và **cắt**
(không làm tròn) về mili giây ở cả JS lẫn PHP — `2026-10-06T03:15:22.123456Z` (MySQL `DATETIME(6)`, dsuite) =
`…22.123Z`; nhóm ngày / giờ hiển thị / parity hai phía giống hệt nhau.

**Không nhận** chuỗi không múi giờ (`2026-10-05 14:00`, `2026-10-05`, `2026-10-05T14:00`) và chữ tự do: kit **không đoán**
(đoán = lệch 7 giờ giữa server UTC và trình duyệt VN). Mục đó vào nhóm cuối "**Không rõ thời gian**" (không giờ) + **một**
cảnh báo cho cả lần gán.

Lỗi cũ của dcms2 (đừng lặp lại): nhóm theo `timeIso.split('T')[0]` = nhóm theo ngày **UTC** — sự kiện 00:30 giờ VN
(17:30Z hôm trước) rơi vào ngày hôm trước. Kit tính ngày theo `time-zone`.

| Nguồn | Cách đưa thời điểm |
|---|---|
| Laravel | `$model->created_at->toIso8601String()` (`…+07:00`) hoặc JSON mặc định (`…000000Z`) |
| PHP thuần | `$dt->format(DATE_ATOM)` hoặc truyền thẳng `DateTimeInterface` cho `td_timeline` |
| JS | `new Date(…)`, `Date.now()`, `date.toISOString()` |

### 3. Múi giờ, nhóm, nhãn ngày

| Thuộc tính | Giá trị | Mô tả |
|---|---|---|
| `time-zone` | tên IANA | `Asia/Ho_Chi_Minh`, `UTC`… — ngày của nhóm và giờ hiển thị. Vắng → múi giờ trình duyệt; tên trình duyệt không biết → múi giờ trình duyệt + một cảnh báo. Offset (`+07:00`) không phải tên IANA. |
| `order` | `desc` (mặc định) \| `asc` | Mới nhất trên cùng (lịch sử / audit) hoặc ngược lại. |
| `group` | `day` (mặc định) \| `none` | `none`: một danh sách phẳng, mỗi mục hiện `dd/mm/yyyy HH:mm`. |
| `heading-level` | 2–6 (mặc định 3) | Cấp tiêu đề ngày (`h3`). |
| `empty-text` | string | Chữ khi không có mục (mặc định "Chưa có hoạt động nào"). |
| `loading` | boolean | Chưa có mục: 3 dòng skeleton; host `aria-busy="true"`. |

- Nhãn ngày: cùng ngày với "bây giờ" → "Hôm nay", ngày trước → "Hôm qua", còn lại "{Thứ}, dd/mm/yyyy" (không "Ngày mai").
  Mỗi mục hiện **giờ tuyệt đối** `HH:mm` trong `<time datetime="…">` (không có "5 phút trước", không tự cập nhật).
- Nhóm "Không rõ thời gian" **luôn là nhóm cuối** (cả `asc`, cả `group="none"`), giữ thứ tự app đưa.
- Property `now` (Date) ghi đè "bây giờ" (test, parity SSR). Trang cache qua nửa đêm: nạp module tính lại nhãn ngày
  ("Hôm nay" → "Hôm qua").

### 4. Icon, tông màu

- `icon` = tên trong registry: icon core (`pencil`, `trash`, `plus`, `upload`, `send`, `history`, `user-x`, `success`,
  `warning`, `info`, `error`…) hoặc icon site đăng ký bằng [`registerIcons()`](icons.md) (**trước** khi gán `items`). Tên
  lạ → chấm tròn + một cảnh báo mỗi tên (chữ cảnh báo cố định, không lặp lại tên).
- `tone` tô marker (cặp màu của [alert](alert.md)). Marker là `aria-hidden`: icon / tông là **trang trí bổ sung** — thông
  tin (lỗi, huỷ, thành công) phải nằm trong `title`.

### 5. Nội dung mở rộng

`<details>` / `<summary>` native ("Chi tiết"): mở / đóng được cả khi không JS, bàn phím + trạng thái mở do trình duyệt lo,
tìm trong trang tự mở. Event **`item-toggle`** `{ id, open }` khi người dùng mở / đóng.

**Tải lười:** `details: true` + property `renderDetails(item, { signal })` → `Node` | chuỗi (chữ) | `Promise` của chúng.
Gọi ở lần mở đầu tiên ("Đang tải…"), kết quả cache theo `id`; lỗi → "Không tải được chi tiết." + nút "Thử lại"; đóng khi
đang tải / gán `items` mới / gỡ phần tử → `signal` bị abort, kết quả cũ bị bỏ. Không có `renderDetails` → mục không có
"Chi tiết" + một cảnh báo. Đây là chỗ app gắn diff, bảng… (Node do app dựng — app chịu trách nhiệm nội dung đó).
Đổi `renderDetails` (gán hàm khác) → mọi yêu cầu đang chờ của hàm cũ bị abort và bỏ, cache bị xoá, chi tiết đang **mở** tải
lại bằng hàm mới, chi tiết đang đóng tải lại khi mở — không có nội dung nào của hàm cũ còn hiện. Vẽ lại cấu trúc (đổi
`time-zone`, `group`, `order`, `heading-level`) khi đang tải → yêu cầu cũ bị abort, chi tiết mở trên node mới tải lại.

```js
history.renderDetails = async (item, { signal }) => {
  const res = await fetch(`/api/audit/${item.id}`, { signal });
  const data = await res.json();
  const dl = document.createElement('dl');
  for (const [k, v] of Object.entries(data.changes)) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = `${v.old} → ${v.new}`;
    dl.append(dt, dd);
  }
  return dl;
};
```

### 6. "Xem thêm" (danh sách dài)

Không virtualisation — tải theo trang (khuyến nghị **50 mục / trang**).

```js
history.setAttribute('has-more', '');
history.loadMore = async ({ signal, last }) => {
  // last = mục CÓ thời điểm hợp lệ cuối cùng đang hiển thị (null nếu chưa có) — dùng làm cursor
  const res = await fetch(`/api/orders/12/history?before=${encodeURIComponent(last?.time ?? '')}&before_id=${last?.id ?? ''}`, { signal });
  const page = await res.json();
  return { items: page.items, hasMore: page.has_more };
};
```

- Nút "Xem thêm" (`td-btn` secondary) cuối danh sách: một yêu cầu một lúc (nút `aria-busy` + spinner); xong → **chèn
  thêm** (node cũ giữ nguyên), mục có `id` đã hiển thị bị bỏ (trang chồng nhau), mục được xếp đúng vị trí thời gian (nhập
  nhóm ngày đã có), mục không rõ thời gian nối vào cuối nhóm "Không rõ thời gian". Thông báo "Đã tải thêm {n} mục".
- `hasMore: false` → nút biến mất, focus sang mục mới đầu tiên. Lỗi → chữ nút "Không tải được, thử lại" + thông báo +
  event `load-more-error` `{ kind: 'rejected' }` — **không** kèm lỗi gốc (có thể chứa URL / token / dữ liệu nội bộ).
  App cần lỗi gốc thì tự bắt trong hàm `loadMore` của mình (`try { … } catch (e) { log(e); throw e; }`).
- Đổi `loadMore` khi đang tải → yêu cầu cũ bị abort, kết quả của nó không bao giờ được chèn; nút hết bận.
- **Trần tổng: 5 000 mục** (`MAX_TOTAL`, gồm danh sách đầu + mọi lần `append` / "Xem thêm"). Vượt → giữ các mục đang hiện
  + các mục mới đứng trước theo thứ tự hiển thị cho tới 5 000, bỏ phần còn lại, **một** cảnh báo, và "Xem thêm" tắt (như
  `has-more` = false). Gán `items` mới thì đếm lại.
- **Không JS**: thuộc tính `more-href` (URL trang sau, cùng origin) → "Xem thêm" là link; có `loadMore` thì JS chặn click
  và tải tại chỗ. `has-more` mà không có cả hai → không nút + một cảnh báo.
- `el.append(items)` — cùng luật, cho dữ liệu app tự nhận (realtime, WebSocket). Trả về số mục đã thêm.

### 7. Nhãn (site đổi được)

`TdTimeline.labels` = `{ empty, today, yesterday, day ('{weekday}, {dd}/{mm}/{yyyy}'), weekdays[7], unknownDay, details,
detailsLoading, detailsError, retry, more, moreError, loaded }`. Đổi trước khi phần tử được define. PHP:
`Td::TIMELINE_LABELS`.

### 8. Token

`--td-timeline-marker` (28px), `--td-timeline-line` (2px), `--td-timeline-gap`; màu (theo theme):
`--td-timeline-marker-{bg,fg,border}`, `--td-timeline-connector`, `--td-timeline-day-fg`. Tông dùng `--td-alert-*`.
Xem [theming](../customization/theming.md). Host là container `td-timeline / inline-size`: < 480px giờ xuống dưới tiêu đề.

## PHP — `td_timeline()`

```php
echo td_timeline($events, [
    'time_zone' => 'Asia/Ho_Chi_Minh',      // tên IANA; mặc định date_default_timezone_get()
    'has_more' => $page->hasMore(),
    'more_href' => '?page=' . ($page->number() + 1),
]);
```

- `time`: `DateTimeInterface`, số epoch, hoặc chuỗi ISO **có** múi giờ (cùng luật JS, kể cả 1–9 chữ số lẻ giây). Không
  phụ thuộc extension `intl`.
- `time_zone` phải là tên trong `DateTimeZone::listIdentifiers()` (hoặc `UTC`); sai (offset, viết tắt, rỗng…) → một
  `E_USER_WARNING` + múi giờ mặc định của PHP. Markup **luôn in** `time-zone` = múi giờ hiệu lực ⇒ server và trình duyệt
  nhóm cùng một ngày.
- Tuỳ chọn khác: `order`, `group`, `heading_level`, `empty_text`, `now` (test), `id`, `class`, `attrs`. `details: true`
  (lười) chỉ có ở JS — PHP bỏ qua.
- **Luôn** in phần tử `<td-timeline data-td-ssr="timeline@1">` + đúng cây component; nạp
  `@dazzxq/td-components/timeline` → nhận **tại chỗ** (chỉ tính lại chữ nhãn ngày). `<details>` người dùng đã mở trước khi
  JS tải vẫn mở. Markup bị sửa → vẽ lại an toàn + một cảnh báo; `time-zone` trình duyệt không biết → vẽ lại từ dữ liệu
  đọc được, theo múi giờ trình duyệt.

## Giới hạn

- Không virtualisation, không tự cập nhật "x phút trước", không lọc / tìm trong timeline (app lọc rồi gán `items`), không
  bố cục hai bên, không tiêu đề ngày dính, không chế độ bảng (dùng [`td-table`](table.md)).
- Tối đa 1 000 mục mỗi lần gán / mỗi trang, **5 000 mục tổng** (§6).

## Trợ năng

- Tên của cả timeline do app đặt (`aria-labelledby` trên host, hoặc tiêu đề trang); không `role=feed`.
- `div.td-timeline__day` > `h3` (nhãn ngày trong `<time datetime="yyyy-mm-dd">`) + `ol[role=list]`; giờ trong
  `<time datetime="ISO">`. Marker `aria-hidden`.
- Cảm ứng: "Chi tiết" cao ≥ 44px khi con trỏ thô; link trong dòng chữ (tiêu đề / người làm) có hình nhấn, miễn kích thước
  theo ngoại lệ "inline" của WCAG 2.5.8.
