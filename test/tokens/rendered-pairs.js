/* v0.42.0 impl review round 2 (ISSUE-3…6 + systematic pass): every RENDERED (foreground, background) pair of the
 * scheme-dependent component tokens, read from the component CSS (not from the generator's constraint list) —
 * shared by the node fuzz (palette.test.js) and documented in the plan's implementation notes. Translucent layers are
 * composited right to left (`[top, …, base]`). Test-only (test/ is not shipped); the page gate imports it in the browser. */

const BASES = ['--td-color-bg', '--td-color-surface', '--td-color-surface-raised'];
const PAGE = ['--td-color-bg', '--td-color-surface'];
const POPUP = (s) => ['--td-glass-bg-strong', s];

/**
 * `gateLight` (v0.52.0 review r2): the pair is ALSO gated on the built-in light preset / kit light page (the other built-in
 * light pairs are only reported — owner keeps the built-in light values); new components must pass there.
 * @returns {Array<{ id: string, fg: string, layers: string[], min: number, gateLight?: boolean }>}
 */
export function renderedPairs() {
  const P = [];
  const add = (id, fg, layers, min = 4.7, o = {}) => P.push({ id, fg, layers, min, ...o });
  // ISSUE-3 form summary (form-validation.css: colour --td-form-summary-fg = --td-color-error; link pressed =
  // --td-form-summary-pressed-bg, v0.42.1 — = --td-color-pressed except the kit dark, where a white wash cannot keep 4.7)
  add('summary text', '--td-color-error', ['--td-form-summary-bg']);
  add('summary link pressed', '--td-color-error', ['--td-form-summary-pressed-bg', '--td-form-summary-bg']);
  add('summary border', '--td-form-summary-border', ['--td-form-summary-bg'], 3);
  add('summary border vs surface', '--td-form-summary-border', ['--td-color-surface'], 3);
  // ISSUE-4 table rows (table.css: zebra, hover = --td-color-hover, selected, selected + hover / focus wash)
  for (const fg of ['--td-color-text', '--td-color-text-muted']) {
    add(`zebra row ${fg}`, fg, ['--td-table-zebra', '--td-color-surface']);
    add(`selected row ${fg}`, fg, ['--td-table-row-selected', '--td-color-surface']);
    add(`selected + hover row ${fg}`, fg, ['--td-color-hover', '--td-table-row-selected', '--td-color-surface']);
  }
  // ISSUE-5 ghost button (button.css: hover fill --td-color-hover, pressed --td-color-pressed, same label)
  for (const b of BASES) {
    add(`ghost hover on ${b}`, '--td-btn-ghost-hover-fg', ['--td-color-hover', b]);
    add(`ghost pressed on ${b}`, '--td-btn-ghost-hover-fg', ['--td-color-pressed', b]);
  }
  // ISSUE-6 chip-input remove (chip-input.css: × = chip fg on the chip fill; hover wash; pressed = the wash twice)
  add('chip remove hover', '--td-color-text', ['--td-chip-remove-hover', '--td-color-fill-strong']);
  add('chip remove pressed', '--td-color-text', ['--td-chip-remove-hover', '--td-chip-remove-hover', '--td-color-fill-strong']);
  // ISSUE-6 filter chips (filter-chips.css: rest remove-fg on the chip fill; hover / pressed: chip fg on the wash)
  add('filter chip remove', '--td-filter-chip-remove-fg', ['--td-color-fill']);
  add('filter chip remove hover', '--td-color-text', ['--td-color-hover-strong', '--td-color-fill']);
  add('filter chip remove pressed', '--td-color-text', ['--td-color-pressed', '--td-color-fill']);
  // tabs (tabs.css: trough --td-tabs-bg = hover; label --td-tabs-fg = muted, hover / active / pressed = text; active pill;
  // pressed tab = --td-color-pressed over it)
  for (const s of PAGE) {
    add(`active tab on ${s}`, '--td-color-text', ['--td-tabs-pill', '--td-color-hover', s]);
    add(`active tab pressed on ${s}`, '--td-color-text', ['--td-color-pressed', '--td-tabs-pill', '--td-color-hover', s]);
    add(`tab on ${s}`, '--td-color-text-muted', ['--td-color-hover', s]);
    add(`tab hover on ${s}`, '--td-color-text', ['--td-color-hover', s]);
    add(`tab pressed on ${s}`, '--td-color-text', ['--td-color-pressed', '--td-color-hover', s]); // pressed label = fg-hover
  }
  // action buttons (action-button.css: icon on its hover / pressed fill, over any base)
  for (const b of BASES) {
    add(`action warning hover on ${b}`, '--td-action-btn-warning-fg', ['--td-action-btn-warning-hover-bg', b]);
    add(`action warning pressed on ${b}`, '--td-action-btn-warning-pressed-fg', ['--td-action-btn-warning-pressed-bg', b]);
    add(`action danger hover on ${b}`, '--td-action-btn-danger-fg', ['--td-action-btn-danger-hover-bg', b]);
    add(`action danger pressed on ${b}`, '--td-action-btn-danger-fg', ['--td-action-btn-danger-pressed-bg', b]);
  }
  // dropdown "create" row + hovercard (popups: --td-glass-bg-strong over the page; option hover / active / pressed)
  for (const s of PAGE) {
    add(`create option on ${s}`, '--td-dropdown-create-fg', POPUP(s));
    for (const o of ['--td-option-hover-bg', '--td-option-active-bg', '--td-option-pressed-bg']) {
      add(`create option ${o} on ${s}`, '--td-dropdown-create-fg', [o, ...POPUP(s)]);
    }
    add(`hovercard link on ${s}`, '--td-hovercard-link-fg', POPUP(s));
    add(`hovercard error on ${s}`, '--td-hovercard-error-fg', POPUP(s));
  }
  // dropzone (dropzone.css: hint / icon = muted on the dragover / pressed fill; accent edge)
  for (const z of ['--td-dropzone-bg-active', '--td-dropzone-bg-pressed']) {
    add(`dropzone hint on ${z}`, '--td-color-text-muted', [z]);
    add(`dropzone edge on ${z}`, '--td-accent', [z], 3);
  }
  add('accent badge', '--td-badge-accent-fg', ['--td-badge-accent-bg']);
  for (const s of PAGE) for (const v of ['success', 'warning', 'danger', 'info']) add(`badge ${v} ink on ${s}`, `--td-badge-${v}-ink`, [s]);
  add('disabled field text', '--td-color-text-muted', ['--td-field-bg-disabled'], 2.2);
  // v0.43.0 td-media-gallery (media-gallery.css): Add prompt muted on the muted fill, hover / pressed = text on the wash,
  // dashed edge ≥ 3 vs the fill and the page; tile buttons + handle chip (surface) hover / pressed = text on the wash;
  // cover / video badge = the tooltip chip; a file name / "no preview" on the muted media box
  add('gallery add prompt', '--td-color-text-muted', ['--td-color-surface-muted']);
  add('gallery add hover', '--td-color-text', ['--td-color-hover', '--td-color-surface-muted']);
  add('gallery add pressed', '--td-color-text', ['--td-color-pressed', '--td-color-surface-muted']);
  add('gallery add edge vs fill', '--td-color-text-muted', ['--td-color-surface-muted'], 3);
  for (const s of PAGE) add(`gallery add edge vs ${s}`, '--td-color-text-muted', [s], 3);
  add('gallery tile button hover', '--td-color-text', ['--td-color-hover-strong', '--td-color-surface']);
  add('gallery tile button pressed', '--td-color-text', ['--td-color-pressed', '--td-color-surface']);
  add('gallery badge', '--td-tooltip-fg', ['--td-tooltip-bg']); // cover / video badge = the tooltip chip
  add('gallery file name', '--td-color-text', ['--td-color-surface-muted']);
  // v0.51.0 (plan v0.51.0-gallery-caption QĐ 10, M6): the counter (note / limit / over) + the inline error sit on the tile
  // surface; the caption placeholder on the field control (field.css: --td-field-note / --td-field-placeholder =
  // --td-color-text-muted, --td-field-error = --td-color-error, --td-field-bg = --td-control-bg — the theme tokens)
  add('gallery counter', '--td-color-text-muted', ['--td-color-surface']);
  add('gallery counter limit / over + error', '--td-color-error', ['--td-color-surface']);
  add('gallery caption placeholder', '--td-color-text-muted', ['--td-control-bg']);
  for (const s of ['--td-control-bg', '--td-color-bg']) add(`field focus edge vs ${s}`, '--td-field-focus', [s], 3);
  // v0.46.0 td-diff (diff.css): values, side labels, muted notes / [ĐÃ ẨN] / — on the two cell tints (opaque); the kind
  // labels (Thêm / Xoá / Đổi) sit on the page
  for (const t of ['--td-diff-added-bg', '--td-diff-removed-bg']) {
    for (const fg of ['--td-color-text', '--td-color-text-label', '--td-color-text-muted']) add(`diff ${fg} on ${t}`, fg, [t]);
  }
  for (const s of PAGE) for (const c of ['success', 'error', 'warning']) add(`diff kind ${c} on ${s}`, `--td-color-${c}`, [s]);
  // v0.47.0 td-check-matrix (check-matrix.css: head / group fill = --td-color-surface-muted, crosshair = --td-color-hover over
  // the grid surface, changed triangle = --td-accent, note dot = --td-color-text-muted — all aliases of contract tokens)
  add('matrix head label', '--td-color-text-label', ['--td-color-surface-muted']);
  add('matrix head description', '--td-color-text-muted', ['--td-color-surface-muted']);
  add('matrix group count', '--td-color-text-muted', ['--td-color-surface-muted']);
  add('matrix crosshair label', '--td-color-text', ['--td-color-hover', '--td-color-surface']);
  add('matrix crosshair description', '--td-color-text-muted', ['--td-color-hover', '--td-color-surface']);
  for (const s of PAGE) add(`matrix note line on ${s}`, '--td-color-text-muted', [s]);
  add('matrix changed mark', '--td-accent', ['--td-color-surface'], 3);
  add('matrix changed mark on crosshair', '--td-accent', ['--td-color-hover', '--td-color-surface'], 3);
  add('matrix note dot', '--td-color-text-muted', ['--td-color-surface'], 3);
  // v0.50.0 td-rating (rating.css: filled star edge = --td-color-warning; count / none = muted) and td-carousel
  // (carousel.css: dots = subtle / text on the page; chevron = text on the secondary fill, its hover / pressed fills)
  for (const s of PAGE) {
    add(`rating star edge on ${s}`, '--td-color-warning', [s], 3.2);
    add(`rating count on ${s}`, '--td-color-text-muted', [s]);
    add(`carousel dot on ${s}`, '--td-color-text-subtle', [s], 3.2);
    add(`carousel current dot on ${s}`, '--td-color-text', [s]);
  }
  for (const f of ['--td-color-fill', '--td-btn-secondary-hover', '--td-btn-secondary-pressed']) add(`carousel chevron on ${f}`, '--td-color-text', [f], 3.2);
  // v0.52.0 td-choice-group segmented (choice-group.css: trough --td-choice-seg-bg = --td-color-hover over the page; idle
  // label / icon --td-choice-seg-fg = --td-color-text-label; selected pill --td-choice-seg-pill = --td-control-bg (opaque) with the label
  // --td-color-text and a 1px ring --td-choice-seg-ring = --td-color-text-muted; disabled segment
  // --td-btn-disabled-fg on the trough; pressed = --td-color-pressed over the trough, label = text) and td-toggle tone
  // (switch.css: track = status colour on the page, knob = --td-color-on-status on the track)
  for (const s of PAGE) {
    add(`segmented idle label on ${s}`, '--td-color-text-label', ['--td-color-hover', s], 4.7, { gateLight: true });
    add(`segmented hover label on ${s}`, '--td-color-text', ['--td-color-hover', s]);
    add(`segmented pressed label on ${s}`, '--td-color-text', ['--td-color-pressed', '--td-color-hover', s]);
    add(`segmented ring vs trough on ${s}`, '--td-color-text-muted', ['--td-color-hover', s], 3);
    add(`segmented disabled label on ${s}`, '--td-btn-disabled-fg', ['--td-color-hover', s], 2.2);
    for (const c of ['success', 'warning']) add(`toggle ${c} track on ${s}`, `--td-color-${c}`, [s], 3);
  }
  add('segmented selected label on the pill', '--td-color-text', ['--td-control-bg']);
  add('segmented ring vs the pill', '--td-color-text-muted', ['--td-control-bg'], 3);
  for (const c of ['success', 'warning']) add(`toggle ${c} knob on the track`, '--td-color-on-status', [`--td-color-${c}`], 3);
  // v0.54.0 helper text (field.css / hint.css: the note, the media help spans and <td-hint> — link included, inherited —
  // all read --td-field-note = --td-color-text-muted) and td-toggle on / off text (switch.css: --td-switch-state-fg =
  // --td-color-text-muted) on every base the controls sit on; table rows (zebra / selected) are the ISSUE-4 muted pairs
  for (const b of [...BASES, '--td-color-surface-muted']) {
    add(`helper note on ${b}`, '--td-color-text-muted', [b], 4.7, { gateLight: true });
    add(`toggle state text on ${b}`, '--td-color-text-muted', [b], 4.7, { gateLight: true });
  }
  // v0.55.0 prefix / suffix text + icon of td-input-field / td-number-input (field.css: --td-field-affix-fg =
  // --td-color-text-muted, the number alias --td-number-affix-fg) on every fill the field box takes, in theme-contract
  // tokens (the palette fuzz resolves only those): rest / focus = --td-field-bg(-focus) = --td-control-bg, read-only (and
  // dark disabled) = --td-color-surface-muted — text threshold (the unit is information); light disabled = --td-color-fill —
  // the disabled threshold (2.2, like the disabled value next to it)
  add('field affix on the field fill (rest / focus)', '--td-color-text-muted', ['--td-control-bg'], 4.7, { gateLight: true });
  add('field affix on the read-only fill', '--td-color-text-muted', ['--td-color-surface-muted'], 4.7, { gateLight: true });
  add('field affix on the disabled fill', '--td-color-text-muted', ['--td-color-fill'], 2.2, { gateLight: true });
  // v0.58.0 floating label of td-input-field (field.css: resting / raised = --td-field-float-label = --td-field-placeholder =
  // --td-color-text-muted; focused = --td-field-float-label-focus = --td-accent; disabled = --td-field-fg-disabled =
  // --td-color-text-muted) on every fill the field takes (rest / focus = --td-control-bg, read-only = --td-color-surface-muted,
  // disabled = --td-color-fill light / --td-color-surface-muted dark) — text threshold (the raised label is 12 px text)
  add('floating label on the field fill', '--td-color-text-muted', ['--td-control-bg'], 4.7, { gateLight: true });
  add('floating label on the read-only fill', '--td-color-text-muted', ['--td-color-surface-muted'], 4.7, { gateLight: true });
  add('floating label focused on the field fill', '--td-accent', ['--td-control-bg'], 4.7, { gateLight: true });
  add('floating label focused on the read-only fill', '--td-accent', ['--td-color-surface-muted'], 4.7, { gateLight: true });
  add('floating label on the disabled fill', '--td-color-text-muted', ['--td-color-fill'], 2.2, { gateLight: true });
  // v0.59.0 clear button of td-datetime-picker `clearable` (datetime-picker.css: × = --td-color-text-muted on the field
  // fill; hover / pressed = --td-field-fg (= --td-color-text) on the --td-color-hover / --td-color-pressed wash) — an icon
  // (non-text, ≥ 3:1). The "Không hạn" toggle of td-datetime-range is a preset chip (its pairs unchanged).
  add('date clear icon on the field fill', '--td-color-text-muted', ['--td-control-bg'], 3, { gateLight: true });
  add('date clear icon hover', '--td-color-text', ['--td-color-hover', '--td-control-bg'], 3, { gateLight: true });
  add('date clear icon pressed', '--td-color-text', ['--td-color-pressed', '--td-control-bg'], 3, { gateLight: true });
  // v0.60.0 calendar of td-datetime-picker (calendar.css; --td-cal-* are plain var() aliases of the theme tokens named below — no new theme token):
  // day ink on the popover (--td-glass-bg-strong over the page); outside-month / weekday / unavailable ink = muted; the today
  // ring (non-text, ≥ 3:1); the selected ink on the selected fill (--td-btn-primary-*; the fill vs the popup is not a pair the
  // generator guarantees — like every primary button; the selected day is also bold and aria-selected); hover (--td-color-hover) and pressed
  // (--td-option-pressed-bg) wash under the FULL text colour (a muted day takes --td-cal-fg while hovered / pressed).
  for (const s of PAGE) {
    add(`calendar day on ${s}`, '--td-color-text', POPUP(s));
    add(`calendar muted day on ${s}`, '--td-color-text-muted', POPUP(s), 4.7, { gateLight: true });
    add(`calendar today ring on ${s}`, '--td-color-text-muted', POPUP(s), 3, { gateLight: true });
    add(`calendar day hover on ${s}`, '--td-color-text', ['--td-color-hover', ...POPUP(s)]);
    add(`calendar day pressed on ${s}`, '--td-color-text', ['--td-color-pressed', ...POPUP(s)]);
  }
  add('calendar selected day ink', '--td-btn-primary-fg', ['--td-btn-primary-bg']);
  return P;
}

/** Option rows read the semantic option tokens (tokens.css): hover / active / pressed fills. */
export const OPTION_TOKENS = { '--td-option-hover-bg': '--td-color-hover', '--td-option-active-bg': '--td-color-hover-strong',
  '--td-option-pressed-bg': '--td-color-pressed' };
