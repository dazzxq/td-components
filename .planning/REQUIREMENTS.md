# Requirements: td-components

**Defined:** 2026-03-31
**Core Value:** Drop vao bat ky project nao, import component can dung, chay ngay

## v1 Requirements

### Base Architecture

- [ ] **BASE-01**: TdBaseElement base class voi lifecycle management (connectedCallback, disconnectedCallback)
- [ ] **BASE-02**: Cleanup tracking tu dong — moi event listener, timer, observer duoc track va cleanup khi disconnect
- [ ] **BASE-03**: Attribute/property sync — getter/setter tu sinh cho observedAttributes
- [ ] **BASE-04**: HTML escape utility chong XSS
- [ ] **BASE-05**: Auto-registration voi collision check (`customElements.get` truoc khi define)
- [ ] **BASE-06**: Event emission helper — dispatch CustomEvent voi bubbles + detail

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

- [ ] **UTIL-01**: DateTime — format (custom tokens), relative time (tieng Viet), parse ISO/timestamp

### Developer Experience

- [ ] **DX-01**: Storybook setup voi @storybook/web-components-vite + Tailwind
- [ ] **DX-02**: Storybook stories cho moi component voi controls va composition examples
- [ ] **DX-03**: Granular import — `import 'td-components/toggle'` chi load toggle
- [ ] **DX-04**: README huong dan install, Tailwind config (content path), usage

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
| BASE-01 | Phase 1 | Pending |
| BASE-02 | Phase 1 | Pending |
| BASE-03 | Phase 1 | Pending |
| BASE-04 | Phase 1 | Pending |
| BASE-05 | Phase 1 | Pending |
| BASE-06 | Phase 1 | Pending |
| DX-01 | Phase 1 | Pending |
| DX-03 | Phase 1 | Pending |
| DX-04 | Phase 1 | Pending |
| FORM-01 | Phase 2 | Pending |
| FORM-02 | Phase 2 | Pending |
| FORM-03 | Phase 2 | Pending |
| FORM-04 | Phase 2 | Pending |
| FORM-05 | Phase 2 | Pending |
| FORM-06 | Phase 2 | Pending |
| UTIL-01 | Phase 2 | Pending |
| FEED-01 | Phase 3 | Pending |
| FEED-02 | Phase 3 | Pending |
| FEED-03 | Phase 3 | Pending |
| FEED-04 | Phase 3 | Pending |
| FEED-05 | Phase 3 | Pending |
| DISP-01 | Phase 4 | Pending |
| DISP-02 | Phase 4 | Pending |
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
