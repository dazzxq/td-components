# ADR 0034 — Bản minify `dist/` cạnh source, đồ thị preload, PHP chọn `assets`

Trạng thái: **chấp nhận** — 2026-10-10 (v0.64.0). Plan [v0.64.0-dist](../plans/v0.64.0-dist.md).
Liên quan: [ADR 0001](0001-web-components-no-shadow-dom.md) (ship source ES Modules — **bổ sung**, không thay),
[0008](0008-drop-tailwind-token-css.md) (`td.css` sinh ra và commit).

## Bối cảnh

dsuite (dienthoaihay) nạp kit bằng cách copy nguyên `src/` vào `public/vendor/td-components/<version>/` rồi dùng import map của
`php/td.php`. Như vậy là 141 file JS thô, còn nguyên comment. Đo trên 0.63.3 bằng gzip -9:

| | thô | gzip | minify, gzip |
|---|---|---|---|
| toàn bộ JS (142 file, gồm `index.js`) | 3,09 MB | 955 KB | 485 KB (−49 %, đã gồm `keepNames`) |
| `td.css` (mọi trang tải) | 761 KB | 148 KB | 63 KB (−57 %) |

Mỗi trang chỉ tải phần JS nó import. Nhưng import lồng nhiều tầng thành thác nước: trình duyệt tải xong module A mới biết cần B.
`Td::modulePreloads()` hiện chỉ preload các module gốc được nêu tên.

Owner duyệt làm cả gói ("all đê", 2026-10-10). Phương án đã được debate với Codex (think-about, sol/high, 2 vòng, đồng thuận).

## Quyết định

1. **Source vẫn là nguồn sự thật.** `exports` trong `package.json` vẫn trỏ `./src/**`, không thêm conditional export. Người dùng
   Vite / npm tự minify khi build của họ.
2. **`dist/` là bản sao minify của gốc package**: `dist/index.js`, `dist/src/**/*.js`, `dist/td.css`, mỗi file kèm `.map`.
   Import tương đối giữ nguyên, nên import map chỉ đổi gốc từ `{base}/` thành `{base}/dist/`. Không minify test, story, CSS
   nguồn hay tài liệu.
3. **Commit `dist/` trong mọi tag**, giống `td.css`. Lý do: cài qua git tag và copy thư mục đều không có bước build.
   - Không dùng `prepare`, `prepack` hay `postinstall`.
   - `.gitattributes` đánh dấu `linguist-generated` để GitHub thu gọn diff.
   - Gate `check:dist` trong CI so từng byte với bản dựng lại.
4. **esbuild là devDependency duy nhất được thêm**, ghim chính xác `0.25.12` (bản vite đang kéo về). Dùng Build API:
   - `bundle: false`: mỗi file nguồn ra đúng một file, danh tính module như source.
   - `minify`, `keepNames: true`: tên class export vẫn đọc được; tốn thêm ~4 % gzip.
   - `target: chrome102, firefox112, safari16.4`, đúng sàn trình duyệt của kit. Bộ minify không được sinh cú pháp mới hơn sàn.
     Nó cũng không polyfill: `@starting-style`, `@container`, `:has()` đi qua nguyên vẹn.
   - Source map `linked` với `sourcesContent: false`. Map trỏ về `src/` đi kèm trong package; trình duyệt chỉ tải map khi mở
     devtools.
   - Không mangle thuộc tính, không `define`, không hash tên file, không timestamp. Cùng phiên bản esbuild thì ra cùng byte.
5. **Đồ thị module `module-graph.json` ở gốc package**, dùng chung cho source và dist vì đường dẫn giống nhau.
   - Chỉ chứa cạnh import tĩnh trực tiếp (gồm re-export); không có `import()` động, để module lười vẫn lười.
   - Khoá và mảng được sắp xếp, đường dẫn POSIX tương đối.
   - PHP tự duyệt bao đóng (closure) khi in `modulepreload`.
6. **PHP: `Td::configure(..., ['assets' => 'source' | 'dist'])`, mặc định `source`.**
   - `source` cho ra URL y như 0.63; `dist` đổi gốc của import map, stylesheet và preload.
   - Không tự dò thư mục, không lặng lẽ quay về `source`. Chọn `dist` mà thiếu file thì người dùng thấy lỗi 404 rõ ràng.
   - Lật mặc định sang `dist` ở một bản minor sau, khi đã có site chạy thật.
7. **`Td::modulePreloads()` giữ nguyên chữ ký.** Có `module-graph.json` thì in cả bao đóng tĩnh: gốc theo thứ tự gọi, rồi phụ
   thuộc đã sắp xếp, bỏ trùng toàn cục, dùng gốc URL của chế độ `assets`. Không có file thì in như cũ (chỉ module gốc).
   File hỏng thì ném lỗi.
8. **Không gộp lõi (base element, icons, utils) vào ít file hơn.** Lý do:
   - Một trang dùng lõi gộp cạnh subpath lẻ sẽ có hai bản class: `instanceof` sai, `customElements.define` ném lỗi.
   - Trang phải tải cả code nó không dùng.
   - Đồ thị source và dist lệch nhau.

   HTTP/2/3 đã ghép nhiều request trên một kết nối, và preload bao đóng xoá thác nước. Chỉ xem lại bằng ADR riêng, có số đo trang
   thật.

## Hệ quả

- **Một trang chỉ dùng một bản.** Trộn URL `/src/**` với `/dist/src/**` cho ra hai danh tính module; tài liệu nói rõ quy tắc này.
- Mỗi bản phát hành sinh lại `dist/`. Vì output tất định, diff chỉ có file thật sự đổi; nâng esbuild là một thay đổi riêng, kiểm
  đủ gate.
- Kiểm tra tương đương:
  - `check:dist`: đúng byte, không file thừa hay thiếu, map trỏ được về file nguồn có thật, đồ thị hợp lệ, tập export của
    từng file giống source.
  - Bộ test trình duyệt Chromium chạy trên byte `dist/` đã commit, qua hook của test runner.
  - Gate CSP so computed style của `dist/td.css` với **cùng baseline** của source.
  - Hai bộ Firefox / WebKit vẫn chạy trên source.
- Preload cả barrel (`@dazzxq/td-components`) cho ra gần như toàn bộ kit. Tài liệu khuyên nêu đúng component trang dùng.
- Repo nặng thêm ~1,4 MB JS minify, cộng map và đồ thị.
