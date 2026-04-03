# Requirements: td-components

**Defined:** 2026-03-31
**Core Value:** Drop vao bat ky project nao, import component can dung, chay ngay

## v1 Requirements

### Base Architecture

- [x] **BASE-01**: TdBaseElement base class voi lifecycle management (connectedCallback, disconnectedCallback)
- [x] **BASE-02**: Cleanup tracking tu dong — moi event listener, timer, observer duoc track va cleanup khi disconnect
- [x] **BASE-03**: Attribute/property sync — getter/setter tu sinh cho observedAttributes
- [x] **BASE-04**: HTML escape utility chong XSS
- [x] **BASE-05**: Auto-registration voi collision check (`customElements.get` truoc khi define)
- [x] **BASE-06**: Event emission helper — dispatch CustomEvent voi bubbles + detail

### Form Controls

- [x] **FORM-01**: Toggle — switch on/off, checked/disabled attributes, change event
- [x] **FORM-02**: Button — 6 variants, loading state, icon support, custom color
- [x] **FORM-03**: Checkbox — custom SVG checkmark, 3 sizes, custom color
- [x] **FORM-04**: Input Field — text/password/email/textarea, character counter, validation, error/helper text
- [x] **FORM-05**: Slider — range input, step marks, value label, touch support
- [x] **FORM-06**: Dropdown — searchable, keyboard navigation, auto-positioning, clear button

### Feedback & Overlay

- [x] **FEED-01**: Modal — stacked modals, focus trap, backdrop click, entrance/exit animation
- [x] **FEED-02**: Modal Stack Manager — z-index management, body scroll lock, backdrop opacity
- [x] **FEED-03**: Toast — 4 variants (success/error/warning/info), auto-dismiss, max 5 visible, FIFO
- [x] **FEED-04**: Tooltip — auto-positioning, arrow, global singleton, custom color
- [x] **FEED-05**: Loading — fullscreen overlay + inline spinner, auto-hide with maxDuration

### Display

- [ ] **DISP-01**: Table — sortable columns, pagination, zebra striping, loading skeleton
- [x] **DISP-02**: Tabs — icon + label, 2 sizes, smooth transitions
- [ ] **DISP-03**: Pagination — page nav, ellipsis, info text, custom active color
- [ ] **DISP-04**: Empty State — icon, title, message, action buttons, 3 sizes

### Utility

- [x] **UTIL-01**: DateTime — format (custom tokens), relative time (tieng Viet), parse ISO/timestamp

### Developer Experience

- [x] **DX-01**: Storybook setup voi @storybook/web-components-vite + Tailwind
- [ ] **DX-02**: Storybook stories cho moi component voi controls va composition examples
- [x] **DX-03**: Granular import — `import 'td-components/toggle'` chi load toggle
- [x] **DX-04**: README huong dan install, Tailwind config (content path), usage

## v2 Requirements

### Theming

- **THEME-01**: CSS custom properties cho mau sac chinh (--td-primary, --td-danger...)
- **THEME-02**: Dark mode support (prefers-color-scheme hoac .dark class)

### Additional Components

- **ADD-01**: Color Picker
- **ADD-02**: Date Picker
- **ADD-03**: Rich Text Editor wrapper

## Out of Scope

| Feature | Reason |
|---------|--------|
| Shadow DOM | Chan Tailwind CSS tu host page |
| Post Card | CMS-specific, khong generic |
| Media Picker | Gan chat voi media library CMS |
| Notification dropdown | Polling/badge specific cho CMS |
| Action Buttons presets | Gan voi permission system CMS |
| Framework wrappers (React/Vue) | Solo dev dung Blade, khong can |
| SSR support | Web Components chay client-side |
| i18n built-in | Consumer tu translate |
| Form validation library | Component chi hien thi error state |
| npm registry publish | GitHub install du cho solo dev |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BASE-01 | Phase 1 | Complete |
| BASE-02 | Phase 1 | Complete |
| BASE-03 | Phase 1 | Complete |
| BASE-04 | Phase 1 | Complete |
| BASE-05 | Phase 1 | Complete |
| BASE-06 | Phase 1 | Complete |
| DX-01 | Phase 1 | Complete |
| DX-03 | Phase 1 | Complete |
| DX-04 | Phase 1 | Complete |
| FORM-01 | Phase 2 | Complete |
| FORM-02 | Phase 2 | Complete |
| FORM-03 | Phase 2 | Complete |
| FORM-04 | Phase 2 | Complete |
| FORM-05 | Phase 2 | Complete |
| FORM-06 | Phase 2 | Complete |
| UTIL-01 | Phase 2 | Complete |
| FEED-01 | Phase 3 | Complete |
| FEED-02 | Phase 3 | Complete |
| FEED-03 | Phase 3 | Complete |
| FEED-04 | Phase 3 | Complete |
| FEED-05 | Phase 3 | Complete |
| DISP-01 | Phase 4 | Pending |
| DISP-02 | Phase 4 | Complete |
| DISP-03 | Phase 4 | Pending |
| DISP-04 | Phase 4 | Pending |
| DX-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26/26
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*
