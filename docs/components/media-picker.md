[Tài liệu](../README.md) › [Components](README.md) › Media picker

# Thư viện media — `TdMediaPicker.open()` / `<td-media-picker>`

Hộp thoại chọn ảnh / video / file từ **thư viện media của chính site**: tìm kiếm, bộ lọc (facet), lưới có "Tải thêm",
xem chi tiết, chọn **một** hoặc **nhiều** (giữ lựa chọn qua các lần tìm), tải lên (tiến độ, huỷ, nhận biết "file đã có"),
sửa thông tin ảnh theo form do site mô tả. Trên điện thoại (≤ 640px) là **bottom sheet**. Kết quả trả về là danh sách
`assetId` + ảnh chụp nhanh của asset — picker **không** tự chèn gì vào trang.

Kit **không biết** backend của bạn. Site đưa vào một **adapter** — object gồm vài hàm `async` (`list`, `get`, tuỳ chọn
`facets`, `upload`, `update`) tự gọi API của mình và trả dữ liệu theo đúng hình dạng ở mục
[Hợp đồng adapter](#hợp-đồng-adapter). Endpoint, envelope JSON, CSRF, quyền, lưu trữ đều là việc của site
([ADR 0013](../internal/decisions/0013-media-picker-boundary.md)).

Cần **một ô form** "ảnh đại diện" (khung có tỉ lệ, xem trước, Đổi / Gỡ, gửi `assetId` theo form) → dùng
[`<td-media-field>`](media-field.md); field tự mở picker này. Chỉ cần **hiện** một lưới ảnh có sẵn trong trang và cho
chọn → [`<td-media-grid>`](media-grid.md) là đủ.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/media-picker'` (class: `import { TdMediaPicker } from '@dazzxq/td-components'`) |
| Loại | API JS tĩnh (`TdMediaPicker.open()`) + custom element khai báo `<td-media-picker>` |
| Form-associated | không (ô form là [`<td-media-field>`](media-field.md)) |
| Từ phiên bản | 0.32.0 (cần `td.css`) |

## Ví dụ nhanh

```js
import { TdMediaPicker } from '@dazzxq/td-components/media-picker';
import { mediaAdapter } from '/assets/app/media-adapter.js'; // code của site — xem "Ví dụ adapter fetch"

// Một lần trong bootstrap của site:
TdMediaPicker.configureDefaults({ adapter: mediaAdapter });

// Mỗi lần cần chọn:
document.querySelector('#insert-image').addEventListener('click', async () => {
  const outcome = await TdMediaPicker.open({
    selection: { mode: 'multiple', maxItems: 5, kinds: ['image'] },
    title: 'Chèn ảnh vào bài',
  });
  if (outcome.status !== 'selected') return;            // huỷ: resolve, không reject
  for (const { assetId, asset, usage } of outcome.selection) {
    editor.insertImage({ id: assetId, src: asset.urls.preview, alt: usage.altText }); // app tự chèn
  }
});
```

## Ranh giới kit / app

| Kit lo | App (adapter + server của site) lo |
|---|---|
| Dialog / bottom sheet, focus, Escape, khoá cuộn, hộp xác nhận "bỏ thay đổi" | Endpoint, envelope JSON, map DTO → `MediaAsset` |
| Ô tìm (debounce 250ms), facet, "Tải thêm" theo cursor | Auth, CSRF, 2FA / xác thực lại, **quyền**, audit |
| Trạng thái đang tải / rỗng / lỗi / "Thử lại"; request cũ không bao giờ thắng | Chuẩn hoá lỗi thành `MediaAdapterError` (chữ an toàn cho người dùng) |
| Lưới + chi tiết, chọn đơn / nhiều + `maxItems`, khay đã chọn | Album, brand, tag, bản quyền… (đưa vào qua facet + descriptor) |
| Hàng đợi upload: tiến độ, huỷ, thông báo "dùng lại ảnh cũ" | Kiểm file upload thật (magic byte, re-encode, dung lượng), dedup SHA-256 |
| Form metadata dựng từ descriptor, hiện lỗi field | Lưu trữ, URL ký, CDN, bảng `media_usages`, chèn vào nội dung |
| Bàn phím, trợ năng, nhãn tiếng Việt, render text an toàn, CSP strict | Validate lại **mọi thứ** ở server |

Adapter là **object callback**, không bao giờ là chuỗi URL endpoint. Kit không đọc HTTP status, không nối URL, không
đoán envelope.

## Hợp đồng adapter

Typedef JSDoc nằm trong `src/utils/media-picker-core.js` (đúng tên / trường của hợp đồng dsuite). Interface này **chốt
từ 0.32.0**: các bản sau chỉ thêm *nơi dùng* cho `delete` / `download` đã có sẵn, không đổi chữ ký.

```ts
type Scalar = string | number | boolean | null;
type FilterValue = Scalar | Scalar[];

interface MediaListRequest {
  query: string;                          // đã trim
  filters: Record<string, FilterValue>;   // bản sao — adapter sửa cũng không ảnh hưởng picker
  cursor: string | null;                  // opaque với kit (null = trang đầu)
  limit: number;                          // = pageSize (mặc định 40)
  sort?: { key: string; direction: 'asc' | 'desc' };   // 0.32 không bao giờ đặt (muốn sắp xếp: facet key `sort`)
  context?: unknown;                      // chuyển nguyên từ options.context, kit không đọc
  kinds: ('image' | 'video' | 'file')[] | null;        // 0.32: từ selection.kinds — adapter NÊN lọc
  signal: AbortSignal;
}

interface MediaAsset {
  id: string;                             // danh tính (opaque, ≤ 512 ký tự)
  version?: string | number;              // gửi lại trong update() để phát hiện xung đột
  kind: 'image' | 'video' | 'file';
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'archived';  // chỉ 'ready' chọn được
  name: string;
  mimeType: string;
  byteSize: number;
  width?: number; height?: number;
  createdAt?: string;                     // ISO, hiển thị theo locale
  uploadedByLabel?: string;
  urls: { thumbnail: string; preview: string };   // CHỈ để hiển thị; video: poster
  defaultAltText?: string;
  metadata: Record<string, unknown>;      // giá trị đầu của form assetFields (theo key)
  badges?: { key: string; label: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }[];
  capabilities?: Partial<MediaCapabilities>;      // chỉ được THU HẸP cờ top-level
}

interface MediaPage {
  items: MediaAsset[];
  nextCursor: string | null;              // null = hết
  previousCursor?: string | null;         // 0.32 không dùng
  total?: number;                         // có → "Hiển thị {n} / {total}"
}

interface FacetOption { value: Scalar; label: string; count?: number; disabled?: boolean }
interface FacetDescriptor { key: string; label: string; type: 'single' | 'multiple' | 'toggle'; options: FacetOption[] }

interface FieldDescriptor {
  key: string;
  label: string;
  scope?: 'upload' | 'asset';
  control: 'text' | 'textarea' | 'url' | 'select' | 'multiselect' | 'date' | 'readonly';
  required?: boolean;                     // gợi ý giao diện — server quyết
  helpText?: string;
  options?: FacetOption[];
  loadOptions?(query: string, o: { signal: AbortSignal }): Promise<FacetOption[]>;
  createOption?(label: string, o: { signal: AbortSignal }): Promise<FacetOption>;
  visibleWhen?(values: Record<string, unknown>, asset?: MediaAsset): boolean;
}

interface MediaCapabilities {
  search: boolean; upload: boolean; editMetadata: boolean;
  delete: boolean; downloadOriginal: boolean;      // 0.32 bỏ qua hai cờ này
}

interface UploadProgress { loaded: number; total?: number; percent?: number }
interface UploadResult {
  asset: MediaAsset;
  deduplication: { outcome: 'created' } | { outcome: 'exact-reused'; matchedAssetId: string };
}

interface MediaAdapterError extends Error {
  code: 'validation' | 'unauthorized' | 'forbidden' | 'conflict' | 'not-found' | 'rate-limited' | 'network' | 'server';
  userMessage?: string;                   // chữ DUY NHẤT người dùng thấy
  fieldErrors?: Record<string, string[]>; // key = FieldDescriptor.key
  retryable?: boolean;
}

interface MediaPickerAdapter {
  list(request: MediaListRequest): Promise<MediaPage>;                          // bắt buộc
  get(id: string, o: { context?: unknown; signal: AbortSignal }): Promise<MediaAsset>;   // bắt buộc
  facets?(request: { query: string; filters: Record<string, FilterValue>; context?: unknown; signal: AbortSignal })
    : Promise<FacetDescriptor[]>;
  upload?(file: File, o: { fields: Record<string, unknown>; context?: unknown; signal: AbortSignal;
    onProgress(p: UploadProgress): void }): Promise<UploadResult>;
  update?(id: string, patch: { fields: Record<string, unknown>; version?: string | number },
    o: { context?: unknown; signal: AbortSignal }): Promise<MediaAsset>;
  delete?(id: string, o: { context?: unknown; signal: AbortSignal }): Promise<DeleteResult>;     // 0.32.1 mới gọi
  download?(id: string, o: { rendition: 'original'; context?: unknown; signal: AbortSignal })
    : Promise<DownloadResult>;                                                                   // 0.32.1 mới gọi
}
```

`DeleteResult` (`{ status: 'deleted', id }` | `{ status: 'blocked', reason: 'in-use', usageCount, usages, truncated? }`),
`DownloadResult`, `UsageSummary`, `UsageDraft` cũng có typedef trong cùng file; 0.32 không gọi `delete` / `download`.

**Kit làm gì với dữ liệu adapter trả về** (an toàn khi adapter sai, không vỡ trang):

- Asset thiếu `id` chuỗi, `kind` / `status` ngoài danh sách, không phải object → bị bỏ (một cảnh báo console). Id trùng
  trong một trang → giữ cái đầu. `list()` trả thứ không phải `{ items: [] }` → coi như lỗi `server`.
- `urls.*` qua cổng URL (`https:`; `http:` chỉ khi trang là `http:`; tương đối) — sai → coi như không có ảnh.
- Mục sai `kinds` (khi có `selection.kinds`) bị **ẩn** dù adapter không lọc; mục `status ≠ 'ready'` hiện nhưng **không
  chọn được** (thông báo `labels.notReady`).
- Facet / descriptor sai kiểu hoặc trùng `key` → bỏ (cái đầu thắng) + cảnh báo.
- Giá trị option là `Scalar` và **giữ đúng kiểu**: `1` khác `"1"`, `null`, `false` đều đến adapter nguyên kiểu (trong
  `filters` và trong `update().fields`).

### Kit gọi adapter khi nào, với signal nào

Mỗi "khe" (`list`, `facets`, `get` chi tiết, `update`) chỉ có **một** request còn hiệu lực: gọi mới → abort `signal` cũ;
kết quả về muộn bị **bỏ** kể cả khi adapter phớt lờ `signal` (latest-wins). Đóng picker → abort **mọi** request đang
chạy, kể cả upload.

**Không cache trang list**: mỗi lần đổi query / filter, quay lại query cũ hay "Thử lại" đều là một lời gọi `list` mới.
Chỉ **facet** (theo query + filter) và **asset theo id** được giữ trong một lần mở (để vẽ khay / chi tiết ngay); upload /
update thành công xoá cache facet; đóng picker xoá hết. Không localStorage, không cache liên phiên.

| Hàm | Kit gọi khi | Signal bị abort khi |
|---|---|---|
| `list` | Mở picker (`initialQuery` / `initialFilters`); gõ ô tìm (**debounce 250ms**; Enter trong ô tìm = gọi ngay); đổi facet; "Thử lại"; sau upload / update thành công (làm mới trang đầu, cùng query / filter) | Có `list` mới (đổi query / filter); đóng picker |
| `list` + `cursor` | Bấm "Tải thêm" (`cursor = nextCursor`) — nối vào lưới | Đổi query / filter; đóng picker |
| `facets` | Mở picker; cùng nhịp với mỗi lần `list` tải lại do đổi query / filter (cùng query + filter đã tải trong lần mở này → dùng lại, không gọi); sau upload / update thành công | Như `list` |
| `get` (initial) | Mở picker có `selection.initialIds`: song song từng id, chung một signal, tối đa `maxItems`, bỏ id trùng | Người dùng đổi lựa chọn trước khi xong (huỷ ngay, đồng bộ); đóng picker |
| `get` (chi tiết) | Mở chi tiết một mục (lấy bản mới; trong lúc chờ hiện bản từ lưới); bấm "Tải lại" sau lỗi `conflict` | Mở chi tiết mục khác; đóng picker |
| `upload` | Mỗi file thả / chọn vào khu "Tải lên" (sau khi qua lọc `accept` / `maxSize`) | Người dùng bấm xoá dòng file; đóng picker |
| `update` | Bấm "Lưu" (hoặc Ctrl/⌘+Enter trong form sửa) — không bao giờ tự lưu | Đóng picker (sau khi đồng ý bỏ thay đổi) |

`initialIds` áp **một lần**, theo thứ tự gốc, khi lời gọi cuối cùng xong; id nào lỗi bị bỏ (cảnh báo). Trong lúc chờ,
khay hiện "Đang tải lựa chọn…" nhưng vẫn chọn / xác nhận được; xác nhận trước khi xong → kết quả theo lựa chọn hiện tại.

## Cấu hình mặc định — `configureDefaults`

```js
TdMediaPicker.configureDefaults({
  adapter,                        // bắt buộc phải có list() + get(), không thì TypeError (giữ mặc định cũ)
  capabilities: { upload: true }, // thiếu → suy từ method (xem "Capability ≠ quyền")
  assetFields: [/* FieldDescriptor — form "Sửa thông tin" */],
  uploadFields: [/* FieldDescriptor — các ô phía trên khu tải lên */],
  messages: { title: 'Kho ảnh' }, // ghi đè nhãn cho mọi lần mở
  context: { siteId: 3 },         // chuyển nguyên vào mọi lời gọi adapter
  upload: { accept: 'image/*', maxSize: '10MB' },
  pageSize: 48,
});
TdMediaPicker.defaults;           // bản sao nông của object đã cấu hình
```

- Registry cấp **module** (không biến `window`). Mỗi lần gọi **thay thế toàn bộ** object (không merge) — gọi một lần
  trong bootstrap. Không có nhiều backend trên một trang.
- Thứ tự resolve **mỗi lần mở** (merge nông theo key, giá trị `undefined` không ghi đè):
  **tham số `open()`** > **`field.pickerOptions`** > **`field.adapter`** > **defaults**.
- `selection` **không bao giờ** lấy từ defaults: luôn do người gọi `open()` hoặc [media field](media-field.md) quyết.
- Không resolve được adapter hợp lệ → `open()` ném `TypeError` đồng bộ (lỗi lập trình).

## Mở picker — `TdMediaPicker.open(options)`

```js
const outcome = await TdMediaPicker.open({
  selection: { mode: 'single', initialIds: ['a_9f2c'], kinds: ['image'] },
  initialQuery: '', initialFilters: { album: 2 },
  title: 'Chọn ảnh đại diện',
});
```

`OpenMediaPickerOptions` (mọi key ngoài `selection` đều có thể đến từ defaults):

| Key | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `adapter` | `MediaPickerAdapter` | defaults | Bắt buộc có `list` + `get` |
| `capabilities` | `Partial<MediaCapabilities>` | suy từ adapter | Xem dưới |
| `assetFields` / `uploadFields` | `FieldDescriptor[]` | `[]` | Form sửa / ô trên khu tải lên |
| `selection.mode` | `'single'` \| `'multiple'` | `'single'` | |
| `selection.maxItems` | số ≥ 1 | không giới hạn (đơn = 1) | Đếm **toàn cục**, kể cả mục đã chọn ở trang / lần tìm khác |
| `selection.initialIds` | `string[]` | `[]` | Đã chọn sẵn khi mở (gọi `get`) |
| `selection.kinds` | `('image'\|'video'\|'file')[]` | mọi loại | 0.32: chuyển vào `MediaListRequest.kinds`; kit ẩn mục sai loại |
| `initialQuery` / `initialFilters` | `string` / `Record<string, FilterValue>` | `''` / `{}` | |
| `context` | `unknown` | — | Chuyển nguyên vào mọi lời gọi adapter |
| `locale` | `string` | ngôn ngữ trang | Định dạng ngày (`Intl`) |
| `messages` | `Record<string, string \| (params) => string>` | `{}` | Ghi đè nhãn **cho lần mở này** |
| `title` | `string` | `labels.title` ("Thư viện media") | 0.32 |
| `pageSize` | số 1–100 | `40` | 0.32 → `limit` |
| `upload` | `{ accept?, maxSize?, multiple? = true }` | — | 0.32: chuyển cho `td-dropzone` (định dạng như [dropzone](dropzone.md): `accept=".jpg,image/*"`, `maxSize="5MB"`) |
| `crop` | `{ enabled, aspectRatio?, allowFocalPoint? }` | — | **0.33**. Ở 0.32 `enabled: true` chỉ cảnh báo một lần, `usage.crop = null` |

- **Một picker một lúc**: gọi `open()` khi đã có picker mở → resolve ngay `{ status: 'cancelled', reason:
  'programmatic' }` + cảnh báo một lần (không chồng picker).
- `TdMediaPicker.open()` tạo host tạm trên `<body>` và gỡ sau khi đóng.
- Mở picker **không** tự chọn mục nào (trừ `initialIds`).

### Kết quả — `PickerOutcome`

```ts
type PickerOutcome =
  | { status: 'selected'; selection: SelectedMedia[] }
  | { status: 'cancelled'; reason: 'close' | 'escape' | 'programmatic'; selection: [] };

interface SelectedMedia {
  assetId: string;
  asset: MediaAsset;            // ảnh chụp nhanh để render ngay — không phải nguồn sự thật
  usage: { altText: string; crop: null; focalPoint: null };   // 0.32: altText = asset.defaultAltText ?? ''
}
```

- Huỷ **resolve**, không bao giờ reject: `close` = nút × hoặc "Huỷ", `escape` = phím Escape, `programmatic` =
  `close()` bằng code / host bị gỡ khỏi DOM / mở chồng.
- `selection` theo **thứ tự người dùng chọn** (mục `initialIds` trước).
- App lưu `assetId`; `asset` chỉ để hiện ngay. Server kiểm lại `assetId` (tồn tại, được phép dùng) khi nhận form.

### Thẻ khai báo `<td-media-picker>`

Khi muốn nghe event trên một element cố định (thay vì `await`):

```html
<td-media-picker id="lib"></td-media-picker>
<script type="module">
  import '@dazzxq/td-components/media-picker';
  const lib = document.getElementById('lib');
  lib.options = { selection: { mode: 'multiple', maxItems: 10 } };   // adapter lấy từ defaults
  lib.addEventListener('asset-change', (e) => console.log(e.detail.operation, e.detail.asset.id));
  document.querySelector('#open-lib').addEventListener('click', async () => {
    const outcome = await lib.open();
  });
</script>
```

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `options` | `OpenMediaPickerOptions` (property) | Option cho lần `open()` kế tiếp (resolve với defaults như trên) |
| `open()` | `() => Promise<PickerOutcome>` | Mở; `TypeError` đồng bộ khi không có adapter hợp lệ; thẻ chưa gắn vào trang → resolve ngay `cancelled / programmatic` |
| `close(reason = 'programmatic')` | `('close' \| 'escape' \| 'programmatic') => void` | Đóng **ngay** bằng code, **không** hỏi "bỏ thay đổi" (app đã quyết): abort mọi việc đang chạy, resolve `cancelled` với `reason` |
| `isOpen` | `boolean` (chỉ đọc) | |
| `TdMediaPicker.labels` | static | Nhãn (bảng dưới) |
| `TdMediaPicker.configureDefaults()` / `.defaults` | static | Xem trên |

Bản thân thẻ không hiển thị gì (`display: none`); dialog được dựng trên `<body>` khi mở. Gỡ thẻ khỏi DOM trong lúc
đang mở → mọi request bị abort, dialog gỡ ngay (không chờ hiệu ứng), Promise resolve **đúng một lần**
`cancelled / programmatic` + event `cancel`.

## Event

Phát trên host (`<td-media-picker>`, hoặc host tạm của `open()`), `bubbles` + `composed`.

| Event | detail | Khi nào |
|---|---|---|
| `selection-change` | `{ selection: SelectedMedia[], addedIds: string[], removedIds: string[] }` | Người dùng đổi lựa chọn (không phát khi áp `initialIds`) |
| `asset-change` | `{ operation: 'upload' \| 'update', asset, deduplication? }` | Upload xong (`deduplication` = của `UploadResult`) hoặc lưu thông tin thành công |
| `confirm` | `{ selection }` | Bấm "Chọn (n)" và picker kết thúc với `selected` |
| `cancel` | `{ reason }` | Picker kết thúc với `cancelled` |
| `operation-error` | `{ operation: 'list' \| 'facets' \| 'get' \| 'upload' \| 'update', code, retryable }` | Lời gọi adapter lỗi (không phát khi abort). **Không** có chữ lỗi — dùng để log / đo |

## Capability ≠ quyền

Capability chỉ quyết định nút nào **hiện ra**. Một action hiện khi **có method trong adapter + cờ top-level bật + cờ
per-asset không tắt**:

| Cờ | Thiếu thì suy ra | Cần method | Điều khiển |
|---|---|---|---|
| `search` | `true` | — | Ô tìm |
| `upload` | `!!adapter.upload` | `upload` | Nút / khu "Tải lên" |
| `editMetadata` | `!!adapter.update` | `update` | Nút "Sửa thông tin" (per-asset `capabilities.editMetadata: false` ẩn riêng mục đó) |
| `delete` / `downloadOriginal` | `false` | `delete` / `download` | 0.32.1 |

`asset.capabilities` chỉ **thu hẹp** (đặt `true` không mở được thứ top-level đã tắt). Ẩn nút **không phải** phân quyền:
mọi endpoint mà adapter gọi phải tự kiểm quyền ở server. Lọc file phía trình duyệt (`accept`, `maxSize`) chỉ là UX.

## Lỗi: chỉ `userMessage` được hiện

Adapter reject bằng `MediaAdapterError` (hoặc bất cứ thứ gì — kit chuẩn hoá):

- Abort (`AbortError`, hoặc signal đã abort) → im lặng.
- `code` ngoài danh sách → `'server'`. `retryable` mặc định `true` cho `network`, `rate-limited`, `server`.
- Chữ hiện cho người dùng **chỉ** là `userMessage` (trim, cắt 200 ký tự) hoặc nhãn mặc định `labels.error.{code}`.
  **Không bao giờ** hiện `err.message` — đó thường là exception thô, câu SQL, đường dẫn lưu trữ.
- `fieldErrors`: chỉ key là own property chuỗi (bỏ `__proto__` / `constructor` / `prototype`), giá trị phải là mảng
  chuỗi (mỗi chuỗi cắt 200, tối đa 5 / key). Key trùng `FieldDescriptor.key` → lỗi hiện **dưới đúng control**; key khác →
  danh sách lỗi chung đầu form. Control lỗi đầu tiên được focus.
- Console chỉ nhận **một chuỗi** dạng `td-media-picker: <thao tác> failed (<code>)` — **không bao giờ** đối tượng lỗi gốc,
  `message`, body response hay URL (có thể mang token / dữ liệu server). Muốn log chi tiết → app tự log trong adapter.
- Lỗi `list` → khối lỗi `role="alert"` + "Thử lại". Lỗi thao tác (upload, lưu) → hiện tại chỗ.

## Giới hạn dữ liệu từ adapter

Trước khi vào DOM, dữ liệu adapter bị chặn trên (`LIMITS` trong `src/utils/media-picker-core.js`); phần thừa bị **bỏ**
kèm **một** `console.warn` chỉ có số lượng (không có dữ liệu thô):

| Dữ liệu | Giới hạn |
|---|---|
| Mục mỗi trang `list()` | `min(limit của request, 100)` (`pageSize` tối đa 100) |
| Chuỗi hiển thị của asset: `name`, `mimeType`, `uploadedByLabel`, `defaultAltText`, nhãn badge | 500 code point (cắt) |
| `badges` mỗi asset | 10 |
| Facet (`facets()`) | 20 |
| Option mỗi facet / mỗi field (kể cả kết quả `loadOptions`) | 200; nhãn option 500 code point |
| Field descriptor (`assetFields`, `uploadFields`) | 50; `label` / `helpText` 500 code point |

Mảng lớn được **xử lý có giới hạn**: mỗi danh sách (badge, option, facet, field descriptor) chỉ được **duyệt** tối đa
4 × giới hạn ở trên rồi dừng, dù đã nhận được bao nhiêu mục hợp lệ — mảng 1 triệu phần tử tốn như mảng nhỏ.

`metadata`: asset chỉ giữ **các key trùng `assetFields`** (không sao chép cả object). Giá trị không bao giờ bị cắt (cắt sẽ
làm hỏng dữ liệu khi lưu); thay vào đó, giá trị vượt giới hạn theo loại control khiến **trường đó bị khoá** trong form
sửa (disabled + chữ `TdMediaPicker.fieldLabels.tooLarge`), không gán vào control và **không bao giờ gửi** trong `update()`:

| Control | Giới hạn giá trị |
|---|---|
| `text` / `select` | 10 000 ký tự |
| `readonly` | **chỉ scalar**: chuỗi ≤ 10 000 ký tự, số hữu hạn, boolean, `null` — object / mảng → khoá, không bao giờ serialize |
| `textarea` | 100 000 ký tự |
| `url` | 2 048 ký tự |
| `date` | 64 ký tự |
| `multiselect` | mảng ≤ 200 scalar (mỗi chuỗi ≤ 10 000) |

Mọi control trừ `multiselect` chỉ nhận **scalar** (object / mảng / `NaN` → khoá). Kit không bao giờ `JSON.stringify` /
duyệt sâu giá trị metadata của adapter.

## Facet (bộ lọc)

| `type` | Control | Giá trị trong `filters[key]` |
|---|---|---|
| `single` | [`td-dropdown`](dropdown.md), placeholder "Tất cả" khi chưa chọn (dòng bỏ chọn dùng `TdDropdown.labels.none`) | `Scalar` (giữ kiểu); chưa chọn → không có key |
| `multiple` | [`td-chip-input`](chip-input.md) `selection-only` | `Scalar[]`; rỗng → không có key |
| `toggle` | [`td-toggle`](toggle.md) | bật = `options[0].value` (không có → `true`); tắt → không có key |

`count` hiện trong nhãn option ("Album A (12)"). Giá trị đang chọn giữ **nguyên kiểu** khi descriptor tải lại — kể cả khi danh sách mới không còn option đó (giữ nhãn cũ). Facet đổi `type` khi tải lại → control mới; filter được áp lại nếu control mới nhận được (vd. `single` 2 → `multiple` [2]), không thì xoá khỏi filter. Facet biến mất khỏi lần tải lại → filter của nó bị bỏ. Mỗi khi đối chiếu làm đổi filter, kit tải lại **cả** facet (không lấy từ cache) **và** list. Toggle đang bật giữ nguyên giá trị đã bật qua các lần tải lại; giá trị `options[0]` mới chỉ được dùng sau khi người dùng tắt rồi bật lại.
Đổi facet → tải lại list + facet **ngay** (không debounce). ≤ 640px facet gom sau nút "Bộ lọc ({n})".
Chữ của control facet / descriptor nằm ở `TdMediaPicker.fieldLabels` (đổi theo site, đọc lúc dùng): `all` "Tất cả"
(placeholder facet `single`), `create` "Thêm mới" (`create-label` khi có `createOption`), `generalErrors` "Lỗi" (tên danh
sách lỗi chung của form), `createError` "Không thêm được lựa chọn." (`createOption` lỗi mà không có `userMessage`),
`tooLarge` (trường bị khoá vì giá trị metadata vượt giới hạn).

```js
Object.assign(TdMediaPicker.fieldLabels, { all: 'All', create: 'Add new', generalErrors: 'Errors', createError: 'Could not add.' });
```

## Upload

- Khu "Tải lên" (nút trên thanh công cụ, `aria-expanded`; ≤ 640px là một view riêng) chứa các ô `uploadFields` phía
  trên một [`td-dropzone`](dropzone.md). Descriptor `required` chưa có giá trị → dropzone `disabled` + gợi ý
  (`labels.uploadNeedsFields`).
- Giá trị `uploadFields` được **chụp lúc file bắt đầu tải** — sửa ô sau đó không ảnh hưởng file đang tải.
- Kit gọi `adapter.upload(file, { fields, context, signal, onProgress })`. Gọi `onProgress({ percent })` hoặc
  `onProgress({ loaded, total })` → thanh tiến độ của dòng file. Chưa gọi lần nào → dòng ở trạng thái "Đang chờ…".
- **Huỷ** = nút xoá của dòng file → `signal` bị abort (không báo lỗi). Đóng picker cũng abort mọi upload.
- Kit **không** giới hạn số file tải song song — muốn xếp hàng (ví dụ 2 file một lúc) thì adapter tự làm.
- Kết quả:
  - `created` → mục mới chèn **đầu** lưới + thông báo `labels.uploaded`.
  - `exact-reused` (server nhận ra file đã có) → **không** thêm mục trùng; mục `matchedAssetId` được chèn / cập nhật +
    dòng chú thích "{name} đã có trong thư viện — dùng lại ảnh cũ".
  - Mục được **chọn luôn** nếu chọn được (`status: 'ready'`, đúng `kinds`): chế độ đơn → thay lựa chọn hiện có + mở chi
    tiết (nhiều file xong cùng lúc → file xong sau cùng thắng); chế độ nhiều → thêm nếu còn chỗ, đầy thì chỉ chèn +
    thông báo `labels.limit`. Chưa `ready` → chỉ chèn + `labels.notReady`.
  - Phát `asset-change { operation: 'upload', asset, deduplication }`; list + facet tải lại (đếm đổi).
- Reject → dòng file đỏ với `userMessage` (không có thì `labels.error.{code}`, cuối cùng `labels.uploadError`);
  `fieldErrors` → lỗi trên ô `uploadFields`.

## Sửa thông tin (metadata) — luôn tường minh

- Nút "Sửa thông tin" trong chi tiết (khi capability cho phép) → form dựng từ `assetFields`, giá trị đầu từ
  `asset.metadata[key]`. "Lưu" / "Huỷ"; Ctrl/⌘+Enter **trong form** = Lưu. Không autosave, xem mục khác không bao giờ
  gọi `update`.
- Gửi `update(id, { fields: <mọi field đang hiện, trừ `readonly`>, version: asset.version }, { context, signal })`.
  Field bị `visibleWhen` ẩn: không gửi, không validate. Field `readonly` **không bao giờ** được gửi.
- `visibleWhen(values, asset)` chạy lại sau mỗi thay đổi; `values` có **mọi** field (kể cả field đang ẩn), đúng kiểu.
  Hàm ném lỗi → field hiện + một cảnh báo console.
- Thành công → asset mới thay ở lưới / chi tiết / khay, `asset-change { operation: 'update', asset }`, thông báo "Đã lưu".
- `validation` → map `fieldErrors` như trên. `conflict` (ai đó đã sửa trước) → thông báo + nút **"Tải lại"**: gọi `get`
  rồi ghi đè form **sau khi người dùng bấm** (không tự xoá chữ đang gõ).
- Form đang sửa dở mà chuyển sang mục khác / đóng chi tiết → hỏi "Bỏ thay đổi?".

Descriptor → control:

| `control` | Control | Giá trị |
|---|---|---|
| `text` / `url` | [`td-input-field`](input-field.md) `type=text` / `url` | chuỗi |
| `textarea` | `td-input-field type=textarea autoresize` | chuỗi |
| `select` | [`td-dropdown`](dropdown.md) (`options`; `loadOptions('')` gọi một lần khi mở form; `createOption` → dòng "Thêm mới" / "Thêm “{query}”", bỏ qua khi ô tìm rỗng) | `Scalar` giữ kiểu |
| `multiselect` | [`td-chip-input`](chip-input.md) (không `createOption` → `selection-only`; tìm bằng `loadOptions`; có `createOption` → `allow-create`) | `Scalar[]` |
| `date` | [`td-datetime-picker`](datetime-picker.md) `mode=date`, năm 1900–2199 | `'YYYY-MM-DD'` hoặc `null` (giá trị `metadata` hỏng / ngoài khoảng → rỗng + một cảnh báo) |
| `readonly` | chữ trong `<dl>` | chỉ hiển thị — không bao giờ có trong `update().fields` |

`helpText` → `helper-text` của `td-input-field`; với control khác là một đoạn `p.td-field__note` dưới control.
`createOption` reject → lỗi trên control (`userMessage`, không có thì "Không thêm được lựa chọn.").
`label`, `helpText`, nhãn option đều là **text** — descriptor không nhận HTML. Không control nào có `name` (form ảo,
không lọt vào `<form>` của trang).

## Đóng khi còn việc dở

Mọi đường kết thúc **của người dùng** (×, "Huỷ", Escape, "Chọn (n)") đi qua **một cổng**: nếu form sửa đang có thay đổi chưa
lưu hoặc còn upload / lưu đang chạy → hộp xác nhận của picker ("Bỏ thay đổi" / "Tiếp tục sửa"). Đồng ý → abort mọi thứ
rồi kết thúc **đúng loại đã yêu cầu** (từ "Chọn" vẫn resolve `selected` với lựa chọn lúc đồng ý — asset chưa lưu giữ
bản cũ, file đang tải không vào lựa chọn). Không → picker giữ nguyên. Lựa chọn chưa xác nhận **không** tính là việc dở.
`close()` bằng code và việc gỡ host khỏi DOM **không** qua cổng này: đóng ngay, mọi thay đổi chưa lưu / upload dở bị huỷ.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab / Shift+Tab | Bị giữ trong dialog; mở picker → focus ô tìm (hoặc mục đầu lưới / dialog) |
| Gõ trong ô tìm | Tìm sau 250ms; **Enter = tìm ngay**, không xác nhận picker |
| Escape trong ô tìm có chữ | Xoá chữ, picker còn mở |
| Escape | Đóng picker (`cancelled / escape`) — qua cổng xác nhận nếu có việc dở |
| Space | (lưới) Chọn / bỏ chọn mục. Shift+Space: chọn dải (chế độ nhiều) |
| Enter | (lưới) Mở chi tiết mục — **không** xác nhận |
| Click mục khi chưa chọn gì | Chọn mục đó + mở chi tiết |
| Ctrl/⌘+Enter | (trong form sửa) Lưu |

- **Không có Enter toàn cục**: chỉ nút **"Chọn (n)"** ở footer xác nhận. Khi chưa chọn gì nút `aria-disabled` (vẫn focus
  được; bấm → thông báo `labels.selectFirst`).
- Chế độ đơn: chọn mục khác **thay** mục đang chọn (click, Space, Shift đều chỉ cho đúng một mục).
- Chế độ nhiều: lựa chọn giữ qua các lần tìm / lọc / "Tải thêm"; khay ở footer: "Đã chọn {n}/{max}", thumb 40px (nút
  "Bỏ chọn {name}"), "Bỏ chọn tất cả". Vượt `maxItems` → bị chặn + thông báo "Tối đa {max} mục".
- Thông báo (live region của picker): số kết quả sau tìm, "Đã tải thêm {n}", upload xong / dùng lại, đã lưu. `aria-busy`
  trên vùng kết quả khi đang tải. Đóng → focus về phần tử đã mở picker.

### Điện thoại (≤ 640px)

Bottom sheet (dùng lại CSS của [modal](modal.md)): chi tiết / tải lên / form sửa là **view thay lưới** với nút
"← Quay lại" (quay lại → focus về mục vừa xem); facet gom sau nút "Bộ lọc ({n})" (`aria-expanded`); khay chỉ còn số đếm
+ "Bỏ chọn tất cả"; footer dính đáy. Reduced motion → không trượt; forced colors → viền vẫn thấy.

## Nhãn — `TdMediaPicker.labels`

Đổi toàn trang bằng `Object.assign(TdMediaPicker.labels, {...})`; đổi **theo lần mở** bằng `options.messages` (giá trị
chuỗi hoặc hàm `(params) => string`; hàm ném lỗi / trả không phải chuỗi → dùng nhãn mặc định). Placeholder `{n}`,
`{max}`, `{total}`, `{name}` được điền sẵn. Kết quả **luôn** gán bằng `textContent` — không nhận HTML.

| Key | Mặc định |
|---|---|
| `title` | "Thư viện media" (option `title` thắng) |
| `close` · `cancel` · `confirm` | "Đóng" · "Huỷ" · "Chọn ({n})" |
| `search` · `searchPlaceholder` | "Tìm media" (nhãn ẩn của ô tìm) · "Tìm theo tên…" |
| `filters` · `filtersCount` | "Bộ lọc" · "Bộ lọc ({n})" |
| `upload` · `results` · `grid` | "Tải lên" · "Kết quả" · "Media" (tên vùng / lưới) |
| `count` · `resultsCount` | "Hiển thị {n} / {total}" · "{n} kết quả" (thông báo sau tìm) |
| `loadMore` · `loadedMore` | "Tải thêm" · "Đã tải thêm {n}" |
| `empty` · `emptyFiltered` · `emptyHint` | "Chưa có media nào" · "Không có kết quả phù hợp" · "Thử từ khoá hoặc bộ lọc khác, hoặc tải lên file mới." |
| `retry` · `back` | "Thử lại" · "Quay lại" |
| `detail` · `detailEmpty` | "Chi tiết" · "Chọn một mục để xem chi tiết." |
| `edit` · `save` · `saved` · `cancelEdit` | "Sửa thông tin" · "Lưu" · "Đã lưu" · "Huỷ" |
| `discardTitle` · `discardMessage` | "Bỏ thay đổi?" · "Các thay đổi chưa lưu hoặc file đang tải lên sẽ bị huỷ." |
| `discard` · `keepEditing` | "Bỏ thay đổi" · "Tiếp tục sửa" |
| `limit` · `loadingInitial` | "Tối đa {max} mục" · "Đang tải lựa chọn…" |
| `selected` · `selectedMax` | "Đã chọn {n}" · "Đã chọn {n}/{max}" (khay) |
| `clearSelection` · `deselect` | "Bỏ chọn tất cả" · "Bỏ chọn {name}" |
| `selectFirst` · `notReady` | "Hãy chọn ít nhất một mục." · "Mục này chưa sẵn sàng để chọn." |
| `uploaded` · `reused` | "Đã tải lên {name}" · "{name} đã có trong thư viện — dùng lại ảnh cũ" |
| `uploadError` · `uploadNeedsFields` | "Tải lên thất bại" · "Điền các trường bắt buộc trước khi tải lên." |
| `conflict` · `reload` | "Media đã bị thay đổi ở nơi khác." · "Tải lại" |
| `video` | "Video" (nhãn trên poster) |
| `kind.{image\|video\|file}` | "Ảnh" · "Video" · "File" |
| `status.{pending\|processing\|failed\|archived}` | "Đang chờ" · "Đang xử lý" · "Lỗi" · "Đã lưu trữ" |
| `meta.{kind\|size\|dimensions\|date\|uploadedBy}` | "Loại" · "Dung lượng" · "Kích thước" · "Ngày tải" · "Người tải" (chi tiết) |
| `error.network` | "Không kết nối được. Kiểm tra mạng rồi thử lại." |
| `error.unauthorized` | "Phiên đăng nhập đã hết. Hãy đăng nhập lại." |
| `error.forbidden` | "Bạn không có quyền thực hiện thao tác này." |
| `error.not-found` · `error.conflict` | "Không tìm thấy media." · "Media đã bị thay đổi ở nơi khác." |
| `error.rate-limited` | "Thao tác quá nhanh. Thử lại sau giây lát." |
| `error.validation` · `error.server` | "Dữ liệu chưa hợp lệ." · "Có lỗi xảy ra. Thử lại sau." |

`error.*` chỉ dùng khi adapter không có `userMessage`. Key lồng nhau (`error`, `kind`, `status`, `meta`) đè bằng
`messages: { 'error.network': '…' }` theo lần mở, hoặc thay cả object con trên `TdMediaPicker.labels`.

```js
Object.assign(TdMediaPicker.labels, { title: 'Media library', confirm: 'Select ({n})' });
TdMediaPicker.labels.error = { ...TdMediaPicker.labels.error, network: 'Connection lost.' };
TdMediaPicker.open({ selection: { mode: 'single' }, messages: { limit: ({ max }) => `Chỉ chọn ${max} ảnh` } });
```

## CSP, ảnh và referrer

- Kit không dùng `style="…"`, không chèn `<style>`, không handler inline — chạy dưới CSP strict như mọi component.
- **`img-src` của CSP phải cho phép origin ảnh mà adapter trả về** (CDN, bucket R2 / S3, domain ảnh ký). Ví dụ
  `img-src 'self' https://cdn.example.com`. Thiếu → thumbnail trống, console báo vi phạm CSP.
- `blob:` trong `img-src` chỉ cần nếu muốn dropzone hiện thumbnail xem trước của file **đang chọn để tải** (preview cục
  bộ); thiếu thì dòng file không có thumbnail, upload vẫn chạy.
- Mọi `<img>` của picker / field có `referrerpolicy="no-referrer"` cố định (URL ký và đường dẫn trang quản trị không lộ
  qua header `Referer`), `loading="lazy"`, `decoding="async"`. **CDN có chống hotlink phải chấp nhận referer rỗng**,
  không thì ảnh trong picker bị chặn.
- URL ảnh chỉ nhận `https:` (`http:` khi trang là `http:`) hoặc đường dẫn tương đối; `javascript:`, `data:`, `file:`…
  → coi như không có ảnh.

## Ví dụ adapter `fetch` (code của app, không phải API kit)

Đây là **một ví dụ** cho backend trả envelope `{ data, meta }` và lỗi `{ message, code, errors }` (kiểu Laravel). Site
khác envelope thì sửa hàm map — kit không bao giờ đoán envelope. Giữ adapter trong code của site (ví dụ
`/assets/app/media-adapter.js`).

```js
// /assets/app/media-adapter.js — CODE CỦA SITE
const CSRF = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
const CODES = { 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 422: 'validation', 429: 'rate-limited' };

async function call(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, signal, credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': CSRF, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body instanceof FormData ? body : body && JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;                   // abort → để kit im lặng
    throw Object.assign(new Error(String(e)), { code: 'network', userMessage: 'Mất kết nối, thử lại sau.' });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), {
      code: CODES[res.status] ?? 'server',
      userMessage: res.status < 500 && typeof json.message === 'string' ? json.message : undefined, // server đã viết chữ an toàn
      fieldErrors: res.status === 422 ? json.errors : undefined,  // { license: ['…'] } — key = FieldDescriptor.key
    });
  }
  return json;
}

const toAsset = (d) => ({
  id: String(d.id), version: d.updated_at, kind: d.kind, status: d.status,
  name: d.original_name, mimeType: d.mime, byteSize: d.size, width: d.width, height: d.height,
  createdAt: d.created_at, uploadedByLabel: d.uploader?.name,
  urls: { thumbnail: d.thumb_url, preview: d.preview_url },
  defaultAltText: d.alt ?? '', metadata: d.meta ?? {},
  capabilities: { editMetadata: d.can_edit },
});

export const mediaAdapter = {
  async list({ query, filters, cursor, limit, kinds, signal }) {
    const qs = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    for (const k of kinds ?? []) qs.append('kind[]', k);
    for (const [key, v] of Object.entries(filters)) for (const x of [].concat(v)) qs.append(`f[${key}][]`, String(x));
    const { data, meta } = await call(`/admin/api/media?${qs}`, { signal });
    return { items: data.map(toAsset), nextCursor: meta.next_cursor ?? null, total: meta.total };
  },
  async get(id, { signal }) {
    return toAsset((await call(`/admin/api/media/${encodeURIComponent(id)}`, { signal })).data);
  },
  async facets({ signal }) {
    return (await call('/admin/api/media/facets', { signal })).data;   // server trả sẵn FacetDescriptor[]
  },
  async upload(file, { fields, signal, onProgress }) {
    const body = new FormData();
    body.append('file', file);
    for (const [k, v] of Object.entries(fields)) body.append(k, v == null ? '' : String(v));
    onProgress({ percent: 0 });                 // fetch không có tiến độ upload; cần % thật thì dùng XMLHttpRequest
    const { data, dedup } = await call('/admin/api/media', { method: 'POST', body, signal });
    onProgress({ percent: 100 });
    return {
      asset: toAsset(data),
      deduplication: dedup?.reused ? { outcome: 'exact-reused', matchedAssetId: String(data.id) } : { outcome: 'created' },
    };
  },
  async update(id, { fields, version }, { signal }) {
    const { data } = await call(`/admin/api/media/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { ...fields, version }, signal });
    return toAsset(data);
  },
};
```

Ghi nhớ khi viết adapter:

- Luôn truyền `signal` vào `fetch` (và rethrow `AbortError` nguyên dạng).
- `userMessage` phải là chữ **đã duyệt** cho người dùng; đừng gán `error.message` của server 500 vào đó.
- Server vẫn kiểm quyền cho từng request — adapter chạy trong trình duyệt, ai cũng sửa được.
- `capabilities` per-asset chỉ để ẩn nút; `PATCH` vẫn phải trả 403 nếu không có quyền.

## Cấu trúc DOM & class

```html
<div class="td-modal td-modal--5xl td-media-picker" data-state="open" data-view="grid|detail|upload|edit" data-mode="single|multiple">
  <div class="td-modal__backdrop" aria-hidden="true"></div>
  <div class="td-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="…-title" tabindex="-1">
    <div class="td-modal__header"><h2 class="td-modal__title">Thư viện media</h2><button class="td-modal__close">…</button></div>
    <div class="td-modal__body td-media-picker__body">
      <div class="td-media-picker__toolbar">ô tìm .td-media-picker__search · .td-media-picker__filters-toggle ·
        .td-media-picker__facets · .td-media-picker__upload-toggle</div>
      <section class="td-media-picker__upload" hidden>uploadFields + td-dropzone</section>
      <div class="td-media-picker__main">
        <section class="td-media-picker__results" aria-label="Kết quả">
          <td-media-grid class="td-media-picker__grid">…</td-media-grid>
          .td-media-picker__skeleton | td-empty-state | .td-media-picker__error[role=alert]
          <p class="td-media-picker__count">…</p> <button class="td-media-picker__more">Tải thêm</button>
        </section>
        <aside class="td-media-picker__detail" aria-label="Chi tiết">…</aside>
      </div>
    </div>
    <div class="td-modal__footer td-media-picker__footer">[.td-media-picker__tray] Huỷ · Chọn (n)</div>
  </div>
</div>
```

Vỏ dùng lại nguyên class / CSS của [modal](modal.md) (kích thước, chuyển động, bottom sheet, reduced motion). Không có
token màu mới; lưới dùng `--td-media-grid-*` của [media grid](media-grid.md). Trạng thái qua `data-*` / `aria-*` — đè CSS
theo [Styling](../customization/styling.md).

## Bảo mật

- Mọi chuỗi từ adapter / descriptor / `messages` (tên file, nhãn, badge, facet, `helpText`, `userMessage`,
  `fieldErrors`) render bằng `textContent`. Không có đường nào nhận HTML.
- Mọi `src` qua `safeMediaUrl` (allowlist scheme). `assetId` là danh tính; URL không bao giờ là giá trị form.
- Capability không phải quyền; lọc `accept` / `maxSize` không phải kiểm file. Server phải kiểm magic byte, re-encode
  ảnh, giới hạn dung lượng, kiểm quyền mọi request.
- Không bao giờ hiện `err.message`. Chi tiết: [security-model › Media picker](../internal/security-model.md#5-media-picker--media-field).

## 0.32.1 / 0.33 sẽ thêm gì (interface không đổi)

| Bản | Thêm | Ảnh hưởng tới adapter / app |
|---|---|---|
| 0.32.1 | Nút **Xoá** (gọi `delete`, hiện danh sách nơi đang dùng khi `DeleteResult.status = 'blocked'`), **Tải bản gốc** (gọi `download`), ổn định picker | Chỉ cần cài `delete` / `download` theo typedef đã có + bật `capabilities.delete` / `downloadOriginal` |
| 0.33 | `td-cropper` + crop / focal point khi chọn (`crop.enabled`) → `usage.crop` có giá trị | Không đổi chữ ký; [media field](media-field.md) chỉ thêm UI sửa crop, FormData `name[crop]` giữ nguyên định dạng |
| 0.38+ | Field nhiều ảnh / gallery | — |

Không làm: tab "Upload từ URL", player video nhúng, UI sắp xếp (dùng facet `sort`), số trang / cuộn vô hạn, cache liên
phiên, sửa hàng loạt / quản lý album, nhiều backend trên một trang.

## Lưu ý & lỗi thường gặp

- **`TypeError: … adapter must implement list() and get()`** → chưa `configureDefaults({ adapter })`, hoặc adapter thiếu
  `list` / `get`.
- **Thumbnail trống, console báo CSP** → thêm origin ảnh vào `img-src`. Ảnh trống, không lỗi CSP → CDN chặn hotlink khi
  referer rỗng, hoặc URL không phải `https:`.
- **Lỗi chỉ hiện câu chung chung (`labels.error.{code}`)** → adapter không đặt `userMessage` (cố ý: kit không hiện
  `message`).
- **Nút "Tải lên" / "Sửa thông tin" không hiện** → thiếu method `upload` / `update`, hoặc `capabilities` tắt, hoặc
  per-asset `capabilities.editMetadata: false`.
- **Mục không chọn được** → `status` khác `'ready'`, hoặc sai `selection.kinds` (bị ẩn).
- **`open()` resolve ngay `cancelled / programmatic`** → đã có một picker đang mở.

## Xem thêm

- [Media field](media-field.md) · [Media grid](media-grid.md) · [Dropzone](dropzone.md) · [Modal](modal.md)
- [Hook › TdMediaPicker](../customization/hooks.md#tdmediapicker) · [CSP](../guides/csp.md) · [Bảo mật](../guides/security.md)
- [ADR 0013](../internal/decisions/0013-media-picker-boundary.md) · plan
  [v0.32.0-media-picker](../internal/plans/v0.32.0-media-picker.md)
