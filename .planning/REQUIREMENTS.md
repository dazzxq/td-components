# Requirements: td-components

**Defined:** 2026-03-31
**Core Value:** Drop vào bất kỳ project nào, import component cần dùng, chạy ngay

## v1 Requirements

### Base Architecture

- [ ] **BASE-01**: TdBaseElement base class với lifecycle management (connectedCallback, disconnectedCallback)
- [ ] **BASE-02**: Cleanup tracking tự động — mọi event listener, timer, observer được track và cleanup khi disconnect
- [ ] **BASE-03**: Attribute/property sync — getter/setter tự sinh cho observedAttributes
- [ ] **BASE-04**: HTML escape utility chống XSS
- [ ] **BASE-05**: Auto-registration với collision check (`customElements.get` trước khi define)
- [ ] **BASE-06**: Event emission helper — dispatch CustomEvent với bubbles + detail

### Form Controls

- [ ] **FORM-01**: Toggle — switch on/off, checked/disabled attributes, change event
- [ ] **FORM-02**: Button — 6 variants, loading state, icon support, custom color
- [ ] **FORM-03**: Checkbox — custom SVG checkmark, 3 sizes, custom color
- [ ] **FORM-04**: Input Field — text/password/email/textarea, character counter, validation, error/helper text
- [ ] **FORM-05**: Slider — range input, step marks, value label, touch support
- [ ] **FORM-06**: Dropdown — searchable, keyboard navigation, auto-positioning, clear button

### Feedback & Overlay

- [ ] **FEED-01**: Modal — stacked modals, focus trap, backdrop click, entrance/exit animation
- [ ] **FEED-02**: Modal Stack Manager — z-index management, body scroll lock, backdrop opacity
- [ ] **FEED-03**: Toast — 4 variants (success/error/warning/info), auto-dismiss, max 5 visible, FIFO
- [ ] **FEED-04**: Tooltip — auto-positioning, arrow, global singleton, custom color
- [ ] **FEED-05**: Loading — fullscreen overlay + inline spinner, auto-hide with maxDuration

### Display

- [ ] **DISP-01**: Table — sortable columns, pagination, zebra striping, loading skeleton
- [ ] **DISP-02**: Tabs — icon + label, 2 sizes, smooth transitions
- [ ] **DISP-03**: Pagination — page nav, ellipsis, info text, custom active color
- [ ] **DISP-04**: Empty State — icon, title, message, action buttons, 3 sizes

### Utility

- [ ] **UTIL-01**: DateTime — format (custom tokens), relative time (tiếng Việt), parse ISO/timestamp

### Developer Experience

- [ ] **DX-01**: Storybook setup với @storybook/web-components-vite + Tailwind
- [ ] **DX-02**: Storybook stories cho mỗi component với controls và composition examples
- [ ] **DX-03**: Granular import — `import 'td-components/toggle'` chỉ load toggle
- [ ] **DX-04**: README hướng dẫn install, Tailwind config (content path), usage

## v2 Requirements

### Theming

- **THEME-01**: CSS custom properties cho màu sắc chính (--td-primary, --td-danger...)
- **THEME-02**: Dark mode support (prefers-color-scheme hoặc .dark class)

### Additional Components

- **ADD-01**: Color Picker
- **ADD-02**: Date Picker
- **ADD-03**: Rich Text Editor wrapper

## Out of Scope

| Feature | Reason |
|---------|--------|
| Shadow DOM | Chặn Tailwind CSS từ host page |
| Post Card | CMS-specific, không generic |
| Media Picker | Gắn chặt với media library CMS |
| Notification dropdown | Polling/badge specific cho CMS |
| Action Buttons presets | Gắn với permission system CMS |
| Framework wrappers (React/Vue) | Solo dev dùng Blade, không cần |
| SSR support | Web Components chạy client-side |
| i18n built-in | Consumer tự translate |
| Form validation library | Component chỉ hiển thị error state |
| npm registry publish | GitHub install đủ cho solo dev |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BASE-01 | Phase 1 | Pending |
| BASE-02 | Phase 1 | Pending |
| BASE-03 | Phase 1 | Pending |
| BASE-04 | Phase 1 | Pending |
| BASE-05 | Phase 1 | Pending |
| BASE-06 | Phase 1 | Pending |
| DX-01 | Phase 1 | Pending |
| DX-03 | Phase 1 | Pending |
| DX-04 | Phase 1 | Pending |
| FORM-01 | Pending | Pending |
| FORM-02 | Pending | Pending |
| FORM-03 | Pending | Pending |
| FORM-04 | Pending | Pending |
| FORM-05 | Pending | Pending |
| FORM-06 | Pending | Pending |
| FEED-01 | Pending | Pending |
| FEED-02 | Pending | Pending |
| FEED-03 | Pending | Pending |
| FEED-04 | Pending | Pending |
| FEED-05 | Pending | Pending |
| DISP-01 | Pending | Pending |
| DISP-02 | Pending | Pending |
| DISP-03 | Pending | Pending |
| DISP-04 | Pending | Pending |
| UTIL-01 | Pending | Pending |
| DX-02 | Pending | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 9 (roadmap chưa tạo)
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after initial definition*
