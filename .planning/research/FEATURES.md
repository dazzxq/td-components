# Features Research

**Domain:** Shared Web Components UI Library
**Researched:** 2026-03-31
**Confidence:** HIGH

## Table Stakes (phải có)

### Base Architecture
- **Base class (TdBaseElement)** — shared lifecycle, attribute observation, cleanup tracking. Mọi component kế thừa. Complexity: MEDIUM
- **Auto-registration** — `customElements.define('td-xxx', TdXxx)` tự động khi import. Complexity: LOW
- **Event system chuẩn** — dispatch CustomEvent với `bubbles: true`, `detail` chứa data. Complexity: LOW
- **Lifecycle cleanup** — `disconnectedCallback` remove tất cả event listeners, observers, timers. Complexity: MEDIUM

### Component Coverage (migrate từ DCMS)
- **Form controls:** toggle, button, checkbox, input-field, slider, dropdown. Complexity: MEDIUM-HIGH
- **Feedback:** toast, tooltip, modal (+ stack), notification, loading. Complexity: HIGH
- **Display:** table, tabs, pagination, empty-state. Complexity: MEDIUM
- **Utility:** datetime formatter, action-buttons, post-card, media-picker. Complexity: MEDIUM

### Developer Experience
- **Storybook stories cho mỗi component** — visual catalog, props controls. Complexity: MEDIUM
- **Consistent API** — attribute-based config, event-based output. Complexity: LOW
- **Import granular** — `import 'td-components/toggle'` chỉ load toggle. Complexity: LOW

## Differentiators (nice to have, không bắt buộc v1)

- **Theming qua CSS custom properties** — `--td-primary-color`, `--td-radius`. Complexity: MEDIUM
- **Dark mode support** — respect `prefers-color-scheme` hoặc `.dark` class. Complexity: LOW
- **Animation system** — shared transitions, configurable duration. Complexity: MEDIUM
- **A11y audit** — Storybook a11y addon + keyboard nav cho tất cả components. Complexity: MEDIUM

## Anti-features (KHÔNG build)

| Feature | Reason |
|---------|--------|
| Shadow DOM | Chặn Tailwind, tăng complexity, không cần CSS isolation cho solo dev |
| State management global | Components là stateless UI, state do consumer quản lý |
| Framework wrappers (React/Vue) | Solo dev dùng Blade, không cần |
| Server-side rendering | Web Components chạy client-side, SSR phức tạp không cần thiết |
| i18n built-in | Consumer tự translate, component chỉ render text được truyền vào |
| Form validation library | Component chỉ hiển thị error state, validation logic ở consumer |

## Dependencies Between Features

```
TdBaseElement ← tất cả components phụ thuộc
  ├── Simple components (toggle, button, checkbox) ← không phụ thuộc nhau
  ├── Dropdown ← phụ thuộc positioning utils
  ├── Modal ← phụ thuộc ModalStack manager
  ├── Table ← có thể dùng Pagination component
  ├── Toast ← phụ thuộc ModalStack (z-index)
  └── Tooltip ← phụ thuộc positioning utils
```

Storybook setup độc lập, không ảnh hưởng library code.
