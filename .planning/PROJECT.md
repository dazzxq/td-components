# td-components

## What This Is

Shared UI Web Components library dùng chung cho nhiều project. Migrate từ 22 DCMS components (window.DCMS global, JS thuần render HTML + Tailwind) sang Web Components chuẩn với lifecycle management, không Shadow DOM, giữ nguyên Tailwind CSS. Storybook để dev/test components trong isolation.

## Core Value

Drop vào bất kỳ project nào, import component cần dùng, chạy ngay — không cần config, không cần copy code, không global namespace pollution.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Kiến trúc Web Components cơ bản (base class, conventions, project structure)
- [ ] Migrate core components từ DCMS: toggle, button, modal, dropdown, toast
- [ ] Migrate form components: input-field, checkbox, slider, datetime
- [ ] Migrate display components: table, tabs, pagination, empty-state, loading
- [ ] Migrate feedback components: tooltip, notification, media-picker, action-buttons, post-card
- [ ] Storybook setup để dev/test components
- [ ] Lifecycle management đúng chuẩn (connectedCallback/disconnectedCallback, cleanup event listeners)
- [ ] BEM prefix `td-` cho custom CSS class (animations, keyframes)
- [ ] Tailwind CSS là peerDependency
- [ ] Package publishable qua GitHub (`npm install github:dazzxq/td-components`)

### Out of Scope

- Shadow DOM — vì cần dùng Tailwind classes từ host page
- Vanilla CSS thay Tailwind — components hiện tại đã dùng Tailwind, convert lại là rewrite vô ích
- npm registry publish — sau này nếu cần, hiện tại GitHub install là đủ
- Framework-specific bindings (React wrapper, Vue wrapper) — overkill cho solo dev
- Full Atomic Design hierarchy (atoms/molecules/organisms) — flat hoặc nhóm nhẹ là đủ

## Context

- Source gốc: `/Users/theduyet/Documents/Code/dcms2/resources/js/components/` — 22 component files
- Stack hiện tại: JS thuần, static classes với factory methods, expose qua `window.DCMS`, Tailwind CSS
- Vấn đề chính: global namespace pollution, memory leak (event listeners không cleanup), khó debug, không reusable across projects
- Developer profile: solo dev, project nhỏ tới trung bình, project lớn nhất là CMS cho báo chí
- Target: Web Components (Custom Elements) không Shadow DOM, giữ Tailwind, vanilla JS
- GitHub repo: `dazzxq/td-components`

## Constraints

- **No Shadow DOM**: Components phải dùng được Tailwind classes từ host page
- **No build step bắt buộc**: Project import vào chỉ cần có Vite (hoặc bundler tương đương) và Tailwind v4+
- **Backward compatible concept**: Các component mới phải cover cùng functionality như DCMS components gốc
- **Solo dev**: Không over-engineer, giữ simple

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web Components thay vì ES Module + Class | Browser native lifecycle, dùng như HTML tag trong Blade, không cần gọi JS | — Pending |
| Không Shadow DOM | Cần Tailwind classes từ host page, Shadow DOM chặn external CSS | — Pending |
| Giữ Tailwind, không convert vanilla CSS | Components đã dùng Tailwind, convert là rewrite không cần thiết | — Pending |
| Storybook thay vì demo.html | Test behaviors phức tạp (components lồng nhau), controls panel, a11y check | — Pending |
| GitHub install thay vì npm publish | Solo dev, 1 máy hoặc vài máy, không cần registry | — Pending |
| BEM prefix `td-` cho custom classes | Tránh conflict với CSS khác, chỉ cho class custom ngoài Tailwind | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 after Phase 5 (Tailwind v4 migration) completion*
