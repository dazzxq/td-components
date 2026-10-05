/* v0.42.0 impl review round 2 (ISSUE-3…6 + systematic pass): every RENDERED (foreground, background) pair of the
 * scheme-dependent component tokens, read from the component CSS (not from the generator's constraint list) —
 * shared by the node fuzz (palette.test.js) and documented in the plan's implementation notes. Translucent layers are
 * composited right to left (`[top, …, base]`). Test-only (test/ is not shipped); the page gate imports it in the browser. */

const BASES = ['--td-color-bg', '--td-color-surface', '--td-color-surface-raised'];
const PAGE = ['--td-color-bg', '--td-color-surface'];
const POPUP = (s) => ['--td-glass-bg-strong', s];

/** @returns {Array<{ id: string, fg: string, layers: string[], min: number }>} */
export function renderedPairs() {
  const P = [];
  const add = (id, fg, layers, min = 4.7) => P.push({ id, fg, layers, min });
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
  return P;
}

/** Option rows read the semantic option tokens (tokens.css): hover / active / pressed fills. */
export const OPTION_TOKENS = { '--td-option-hover-bg': '--td-color-hover', '--td-option-active-bg': '--td-color-hover-strong',
  '--td-option-pressed-bg': '--td-color-pressed' };
