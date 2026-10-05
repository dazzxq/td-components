## Project

**td-components**

UI kit duy nhất (single source of truth) cho mọi site: dwp (WordPress), 135 (PHP thuần) và site sau này.
Web Components (Custom Elements v1) không Shadow DOM, CSP-strict, vanilla JS. Triết lý: **lõi nhỏ + hook/param**,
site tuỳ biến qua token `--td-*`, hook và attribute/property, không sửa lõi. dcms2 đứng độc lập (không sync).

**Core Value:** Drop vào bất kỳ project nào, import component cần dùng, chạy ngay — không cần config, không cần copy code, không global namespace pollution.

**Docs hub: [docs/README.md](docs/README.md)** (tài liệu người dùng hub-spoke: cài đặt, component, tuỳ biến, hook,
nâng cấp). Tài liệu nội bộ (vision, roadmap, architecture, conventions, ADR, plan, luật minimal surfaces):
[docs/internal/](docs/internal/README.md). Đổi API/hành vi → cập nhật trang `docs/components/*.md` liên quan.

### Constraints

- **No Shadow DOM**: CSS của host (token CSS `--td-*`) phải chạm được component
- **CSP strict**: không `style="…"`, không chèn `<style>`; chỉ file CSS ship kèm + CSSOM
- **No build step phía consumer**: Vite import source; PHP dùng `<link>` tới `td.css`
- **Backward compatible concept**: cover cùng functionality như DCMS gốc
- **Solo dev**: Không over-engineer, giữ simple

## Technology Stack

| Layer | Choice | Ghi chú |
|-------|--------|---------|
| Components | Web Components (Custom Elements v1) + ElementInternals | Browser native |
| Styling | CSS token `--td-*` + `@layer td.tokens, td.component, td.utilities`, một file `td.css`; CSSOM cho giá trị per-instance | [ADR 0008](docs/internal/decisions/0008-drop-tailwind-token-css.md) |
| Module system | ES Modules, ship source | Không bundle |
| Dev | Vite, Storybook 8.6 (`@storybook/web-components-vite`, story bằng chuỗi HTML thường) | |
| Test | `node --test` + DOM shim, `@web/test-runner` + Playwright, CSP gate Playwright | |

**Không dùng:** Lit, Shadow DOM, SASS/LESS, TypeScript, bundle output.

## Conventions & Architecture

- [docs/internal/conventions.md](docs/internal/conventions.md): cấu trúc file, đặt tên, escaping, test, release
- [docs/internal/architecture.md](docs/internal/architecture.md): base class, mô hình style, kiến trúc style mục tiêu
- [docs/internal/design/liquid-glass.md](docs/internal/design/liquid-glass.md): **Minimal surfaces — UI mới bắt buộc theo bộ luật này** (ADR 0011, thay Liquid Glass)
- [docs/internal/design/touch.md](docs/internal/design/touch.md): **Chuẩn cảm ứng — UI mới bắt buộc** (hover gate, hình nhấn, `touch-action`, bàn phím ảo; ADR 0019)
- [docs/internal/security-model.md](docs/internal/security-model.md): XSS theo ngữ cảnh, CSP

## Workflow

Roadmap: [docs/internal/roadmap.md](docs/internal/roadmap.md) — update status + CHANGELOG with every change. Không dùng GSD.
Quyết định kiến trúc mới → thêm ADR trong `docs/internal/decisions/`.
