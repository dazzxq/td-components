[Tài liệu nội bộ](README.md) › Workflow của agent

# Workflow đặt tên của repo

Script ở `.claude/workflows/` (tool `Workflow` của Claude Code, xem tiến độ bằng `/workflows`). Gọi bằng tên: "chạy
workflow lanes cho …" / "chạy workflow docs-drift cho …"; gọi đích danh là owner đã đồng ý, phần cụ thể đi qua `args`.
Mang sang từ dwp / dsuite / dcms2 (2026-10-14), chỉnh theo cổng test và luật của kit này.
`.claude/settings.json` đặt `worktree.baseRef: "head"` để worktree của agent đi từ HEAD đang checkout.

Workflow **không làm từng agent rẻ hơn** (mỗi agent vẫn là một request riêng). Lợi ích: gom cả đợt, phiên chính chỉ bị
đánh thức một lần và context sạch.

| Tên | Làm gì | Agent | Không làm (phiên chính làm sau) |
|---|---|---|---|
| `lanes` | 1-3 việc độc lập của một lô: mỗi việc một agent trong worktree riêng (nhánh = tên việc, `npm ci`, test node lọc + cổng tĩnh, commit), rồi một agent soát diff với brief | 2 / việc | push, CI, cổng trình duyệt nặng, Codex, bump version / CHANGELOG / roadmap / `dist/`, gộp main, tag |
| `docs-drift` | Docs lệch code + lệch hub-spoke theo vùng: một agent tìm + một agent phản biện; `fix: true` thêm một agent sửa docs | 2 / vùng (+1 chọn khi dùng `since`, +1 sửa) | commit, sửa code, chạy trình duyệt |

## `lanes`

```js
{ base: 'main', lanes: [{
  name: 'tabs-overflow',                        // chữ thường / số / gạch ngang = tên nhánh
  goal: '…',                                    // brief đủ ý: mục tiêu + lý do + quyết định đã chốt (agent không thấy hội thoại)
  files: ['src/display/td-tabs.js', '…'],       // phạm vi; hai việc trùng file hoặc cha / con thư mục → workflow từ chối
  tests: 'src/display/td-tabs.test.js',         // đối số của node --test (bắt buộc với kind 'code')
  browser: 'src/display/td-tabs.browser-test.js', // tuỳ chọn: chạy MỘT lần, chỉ Chromium
  notes: '…', model: 'sonnet' | 'opus', kind: 'code' | 'plan',
}] }
```

- **Cổng trình duyệt nặng không chạy trong lane** (`test:browser` đủ 3 engine, `test:csp*`, `test:engines`,
  `test:responsive`, `test:touch`, `test:theme`, contrast): hai bộ Playwright chạy cùng lúc trên một máy cho đỏ giả.
  Lane ghi cổng còn thiếu vào trường `gates`; phiên chính chạy chúng **tuần tự** sau khi gộp, hoặc đẩy nhánh lên CI
  (`gh workflow run test.yml --ref <nhánh>`, xem [conventions › Test](conventions.md#test)).
- **File của bản phát hành không thuộc lane**: `version`, `CHANGELOG.md`, `roadmap.md`, `breaking-changes.md`, các chỗ
  ghim version, `dist/`, `module-graph.json`, baseline CSP. Lane commit với message không có số version.
- File dùng chung kiểu "nối thêm" mà lane đã sửa (`td.css` sinh lại, `test/tokens/golden.json`, fixture, `PRESS_TARGETS`,
  `index.js`, exports) nằm trong trường `shared`. Sau khi gộp: `npm run build`, rồi `npm run test:ci:static`,
  `test:csp` + `test:csp:combined`, responsive 360 trước khi merge vào main.
- Nhánh của lane đi từ đúng SHA mà `base` trỏ tới lúc kiểm (`git rev-parse`), không phải từ HEAD của worktree; tên việc trùng nhau hoặc nhánh đã tồn tại thì dừng.
- Đối số được chép vào lệnh shell của agent nên bị kiểm ngữ pháp: `base` / `since` là tên ref đơn; `tests` là các đường
  dẫn / glob cách nhau một dấu cách; `browser` là các đường dẫn cách nhau dấu phẩy; `files` là đường dẫn tương đối
  (không `..`, không tuyệt đối). Chạy từ hai việc code trở lên thì **mỗi việc phải khai `files`**.
- `kind: 'plan'`: agent chỉ viết `docs/internal/plans/<name>.md` (phiên chính đổi tên thành `vX.Y.Z-…`, chạy
  `/codex-plan-review`). Lựa chọn UX người dùng nhìn thấy phải nằm ở mục "Câu hỏi mở".
- Kết quả: mỗi việc `{lane, work: {branch, sha, files, checks, gates, shared, deviations, blocked}, review: {ok, problems, rerun}}`.
  Phiên chính vẫn tự đọc `git diff` và chạy lại cổng quan trọng trước khi tin.

## `docs-drift`

```js
{ targets: ['tabs', 'media-picker', 'theming'], fix: false }   // tối đa 3 vùng, phần dư được log ra
{ since: 'v0.70.0', fix: true }                                // tự chọn vùng có code đổi từ ref đó
```

- Vùng = tên trang `docs/components/<tên>.md` (đối chiếu với `src/**/td-<tên>*.js` + `src/styles/components/<tên>.css`),
  hoặc vùng dựng sẵn: `theming`, `hooks`, `php`, `install`, `concepts`, `internal`, `hub`; hoặc object
  `{name, docs: [...], code: [...]}`.
- Kiểm những khẳng định đọc code là kiểm được: attribute + mặc định, property / method, event, hook, token `--td-*`,
  class BEM, subpath export, helper PHP, lệnh npm, đường dẫn, con số. Mức: `sai` / `thiếu` / `cũ` / `lặp` / `link`.
- Luật hub-spoke: mỗi sự thật ghi đầy đủ ở một chỗ (trang component / trang chuyên đề), chỗ khác một câu tóm + link;
  hub ([docs/README.md](../README.md), [components/README.md](../components/README.md), [README.md](README.md)) là mục
  lục; [hooks.md](../customization/hooks.md) là danh mục (một dòng / hook + link).
- Không soát và không sửa nhật ký theo thời điểm: `CHANGELOG.md`, `breaking-changes.md`, `plans/`, `decisions/`,
  `history/`, `research/`, `roadmap.md`.
- `fix: true` chỉ sửa `.md` trong `docs/`, không commit; phát hiện ở `README.md` gốc, `php/README.md`, `CLAUDE.md` chỉ được liệt kê lại.
- `since` tính cả file code đã xoá / đổi tên (docs còn nhắc tới chúng là `cũ`). Docs đúng ý định mà **code** sai thì agent không sửa docs cho khớp lỗi: nó báo
  lại để phiên chính xử lý.

## Khi nào không dùng

- Việc nối tiếp nhau hoặc cùng sửa một component: làm trong phiên chính.
- Phát hành (đánh version, cổng trình duyệt, CI, tag): tuần tự, không song song.
- Không dựng hội đồng review trùng cổng Codex.
