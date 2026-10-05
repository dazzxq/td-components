/**
 * v0.45.0 (plan v0.45.0-steps-timeline QĐ S1–S5) — pure model of `<td-steps>`: step normalisation, the ONE state
 * derivation rule (QĐ S2), clickability (QĐ S4) and the compact summary text (QĐ S3). Shared by the component, its SSR
 * gate and the node / PHP parity tests (STATE_CASES, SUMMARY_CASES). Internal module (no package subpath).
 * php/td.php `td__steps_items()` / `td__steps_states()` implement the same rules.
 *
 * Step (normalised): `{ key, label, description, disabled }` + `state` (only when given and valid) + `href` (only when
 * it passes cleanHref — same origin http(s)).
 * - `label` (required, ≤ 120 code points), `description` (≤ 300; '' when absent), `key` (≤ 100; default = the step's
 *   position counted from 1 — "1", "2"…): strings or finite numbers (cast like String(n)); control characters removed.
 *   A step without a valid non-blank label is dropped (`dropped`). An invalid key / description type is ignored.
 * - Duplicate key → suffix `-2`, `-3`… (`renamed`). At most MAX_STEPS steps (`capped`; MAX_STEPS × 4 entries inspected).
 * @module utils/steps-model
 */
import { cleanText, cleanHref, fill } from './filter-chips-model.js';

export const STEP_LIMITS = Object.freeze({ key: 100, label: 120, description: 300 });
export const MAX_STEPS = 20;
export const STEP_STATES = Object.freeze(['done', 'current', 'error', 'upcoming']);
export const NAVIGATIONS = Object.freeze(['none', 'back', 'all']);
/** Warning codes, in the order they are reported (JS console.warn = PHP E_USER_WARNING). */
export const WARNING_CODES = Object.freeze(['current-unmatched', 'extra-current', 'anchor-state', 'complete-current']);

/** Default texts (= PHP Td::STEPS_LABELS). */
export const STEPS_LABELS = Object.freeze({
  group: 'Tiến trình',
  done: ', đã xong',
  error: ', có lỗi',
  upcoming: ', chưa tới',
  summary: 'Bước {n}/{total}: {label}',
  summaryComplete: 'Đã hoàn tất {total}/{total} bước',
  summaryNone: '{total} bước',
});

/**
 * @param {unknown} list
 * @param {{ baseURI?: string, origin?: string }} [opts] for cleanHref (tests)
 * @returns {{ steps: Array<{key: string, label: string, description: string, disabled: boolean, state?: string,
 *   href?: string}>, dropped: number, renamed: number, capped: boolean }}
 */
export function normalizeSteps(list, opts = {}) {
  const steps = [];
  let dropped = 0;
  let renamed = 0;
  let capped = false;
  const used = new Set();
  const next = new Map();
  const arr = Array.isArray(list) ? list : [];
  const end = Math.min(arr.length, MAX_STEPS * 4);
  if (arr.length > end) capped = true;
  for (let i = 0; i < end; i++) {
    if (steps.length >= MAX_STEPS) { capped = true; break; }
    const raw = arr[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
    const label = cleanText(raw.label, STEP_LIMITS.label);
    if (label === null || !label.trim()) { dropped++; continue; }
    const description = (raw.description == null ? '' : cleanText(raw.description, STEP_LIMITS.description)) ?? '';
    const k = raw.key == null ? null : cleanText(raw.key, STEP_LIMITS.key);
    const base = k || String(steps.length + 1);
    let key = base;
    if (used.has(key)) {
      let n = next.get(base) || 2;
      while (used.has(`${base}-${n}`)) n++;
      key = `${base}-${n}`;
      next.set(base, n + 1);
      renamed++;
    }
    used.add(key);
    const step = { key, label, description, disabled: raw.disabled === true };
    if (STEP_STATES.includes(raw.state)) step.state = raw.state;
    if (raw.href != null) {
      const href = cleanHref(raw.href, opts);
      if (href) step.href = href;
    }
    steps.push(step);
  }
  return { steps, dropped, renamed, capped };
}

/**
 * QĐ S2 — the single precedence rule. The ANCHOR (semantic current step): none when `complete`; else the step whose
 * key = `current`; else the FIRST step with an explicit `state: 'current'`; else none. Its shape: `error` when it says
 * `state: 'error'`, else `current`. Other steps: explicit done / error / upcoming kept; an explicit `current` is
 * demoted; no state → `done` before the anchor, `upcoming` after it (no anchor: `done` when complete, else `upcoming`).
 * @param {Array<{key: string, state?: string}>} steps normalised
 * @param {string|null|undefined} current the `current` attribute ('' / null = absent)
 * @param {boolean} complete
 * @returns {{ anchor: number, states: string[], warnings: string[] }} anchor = index or -1
 */
export function deriveStates(steps, current, complete) {
  const warn = new Set();
  if (!steps.length) return { anchor: -1, states: [], warnings: [] }; // nothing to point at: no noise
  const hasCurrent = typeof current === 'string' && current !== '';
  const explicit = [];
  steps.forEach((s, i) => { if (s.state === 'current') explicit.push(i); });
  let anchor = -1;
  if (complete) {
    if (hasCurrent || explicit.length) warn.add('complete-current');
  } else {
    if (hasCurrent) {
      anchor = steps.findIndex((s) => s.key === current);
      if (anchor < 0) warn.add('current-unmatched');
    }
    if (anchor < 0 && explicit.length) anchor = explicit[0];
    if (explicit.some((i) => i !== anchor)) warn.add('extra-current');
    if (anchor >= 0 && (steps[anchor].state === 'done' || steps[anchor].state === 'upcoming')) warn.add('anchor-state');
  }
  const states = steps.map((s, i) => {
    if (i === anchor) return s.state === 'error' ? 'error' : 'current';
    if (s.state === 'done' || s.state === 'error' || s.state === 'upcoming') return s.state;
    if (anchor >= 0) return i < anchor ? 'done' : 'upcoming';
    return complete ? 'done' : 'upcoming';
  });
  return { anchor, states, warnings: WARNING_CODES.filter((c) => warn.has(c)) };
}

/** `navigation` attribute → none | back | all (anything else → none). */
export function normalizeNavigation(v) {
  return NAVIGATIONS.includes(v) ? v : 'none';
}

/**
 * QĐ S4 — can step `index` be clicked? `back`: a done / error step BEFORE the anchor (no anchor: every done / error
 * step when complete, else none); `all`: every step but the anchor; `none`: never. Disabled → never.
 */
export function isClickable(state, index, anchor, complete, navigation, disabled) {
  if (disabled) return false;
  const nav = normalizeNavigation(navigation);
  if (nav === 'all') return index !== anchor;
  if (nav !== 'back' || (state !== 'done' && state !== 'error')) return false;
  return anchor >= 0 ? index < anchor : !!complete;
}

/**
 * QĐ S3 (review R2-5) — the compact summary line: anchor → "Bước {n}/{total}: {label}"; no anchor + complete → "Đã
 * hoàn tất {total}/{total} bước"; otherwise "{total} bước" (never an invented current step); 0 steps → ''.
 * @param {number} anchor
 * @param {number} total
 * @param {boolean} complete
 * @param {Record<string, string>} labels
 * @param {string} [anchorLabel]
 */
export function summaryText(anchor, total, complete, labels, anchorLabel = '') {
  if (!total) return '';
  const L = { ...STEPS_LABELS, ...labels };
  if (anchor >= 0) return fill(L.summary, { n: anchor + 1, total, label: anchorLabel });
  return fill(complete ? L.summaryComplete : L.summaryNone, { total });
}

const S = (...states) => states.map((state, i) => (state ? { key: String(i + 1), state } : { key: String(i + 1) }));

/**
 * QĐ S2 / S4 parity table (JS model, PHP td_steps, SSR gate): steps (keys "1".."n", optional explicit state), the
 * `current` attribute, `complete` → anchor index, states, warning codes, clickable indexes per navigation.
 */
export const STATE_CASES = Object.freeze([
  { name: 'current in the middle', steps: S(0, 0, 0, 0), current: '2', complete: false, anchor: 1,
    states: ['done', 'current', 'upcoming', 'upcoming'], warnings: [], back: [0], all: [0, 2, 3] },
  { name: 'current first', steps: S(0, 0, 0), current: '1', complete: false, anchor: 0,
    states: ['current', 'upcoming', 'upcoming'], warnings: [], back: [], all: [1, 2] },
  { name: 'current last', steps: S(0, 0, 0), current: '3', complete: false, anchor: 2,
    states: ['done', 'done', 'current'], warnings: [], back: [0, 1], all: [0, 1] },
  { name: 'no current, no state: all upcoming', steps: S(0, 0, 0), current: null, complete: false, anchor: -1,
    states: ['upcoming', 'upcoming', 'upcoming'], warnings: [], back: [], all: [0, 1, 2] },
  { name: 'complete: all done', steps: S(0, 0, 0), current: null, complete: true, anchor: -1,
    states: ['done', 'done', 'done'], warnings: [], back: [0, 1, 2], all: [0, 1, 2] },
  { name: 'complete + error step kept', steps: S(0, 'error', 0), current: null, complete: true, anchor: -1,
    states: ['done', 'error', 'done'], warnings: [], back: [0, 1, 2], all: [0, 1, 2] },
  { name: 'unmatched current → first explicit current', steps: S(0, 'current', 0), current: 'x', complete: false, anchor: 1,
    states: ['done', 'current', 'upcoming'], warnings: ['current-unmatched'], back: [0], all: [0, 2] },
  { name: 'unmatched current, no explicit → no anchor', steps: S(0, 0), current: 'x', complete: false, anchor: -1,
    states: ['upcoming', 'upcoming'], warnings: ['current-unmatched'], back: [], all: [0, 1] },
  { name: 'valid current + explicit current elsewhere → demoted', steps: S(0, 0, 'current', 0), current: '2', complete: false,
    anchor: 1, states: ['done', 'current', 'upcoming', 'upcoming'], warnings: ['extra-current'], back: [0], all: [0, 2, 3] },
  { name: 'two explicit currents → the first is the anchor', steps: S(0, 'current', 'current'), current: null, complete: false,
    anchor: 1, states: ['done', 'current', 'upcoming'], warnings: ['extra-current'], back: [0], all: [0, 2] },
  { name: 'anchor says error → error shape, still current', steps: S(0, 'error', 0), current: '2', complete: false, anchor: 1,
    states: ['done', 'error', 'upcoming'], warnings: [], back: [0], all: [0, 2] },
  { name: 'anchor says done → current + anchor-state', steps: S(0, 'done', 0), current: '2', complete: false, anchor: 1,
    states: ['done', 'current', 'upcoming'], warnings: ['anchor-state'], back: [0], all: [0, 2] },
  { name: 'anchor says upcoming → current + anchor-state', steps: S('upcoming', 0), current: '1', complete: false, anchor: 0,
    states: ['current', 'upcoming'], warnings: ['anchor-state'], back: [], all: [1] },
  { name: 'complete + current → complete wins', steps: S(0, 0, 0), current: '2', complete: true, anchor: -1,
    states: ['done', 'done', 'done'], warnings: ['complete-current'], back: [0, 1, 2], all: [0, 1, 2] },
  { name: 'complete + explicit current → demoted to done', steps: S(0, 'current'), current: null, complete: true, anchor: -1,
    states: ['done', 'done'], warnings: ['complete-current'], back: [0, 1], all: [0, 1] },
  { name: 'explicit states before / after the anchor kept', steps: S('upcoming', 'error', 0, 'done'), current: '3', complete: false,
    anchor: 2, states: ['upcoming', 'error', 'current', 'done'], warnings: [], back: [1], all: [0, 1, 3] },
  { name: 'unmatched + extra together', steps: S('current', 'current'), current: 'zz', complete: false, anchor: 0,
    states: ['current', 'upcoming'], warnings: ['current-unmatched', 'extra-current'], back: [], all: [1] },
  { name: 'empty (no warning)', steps: [], current: '1', complete: false, anchor: -1, states: [], warnings: [], back: [], all: [] },
]);

/** QĐ S3 (review R2-5) summary parity table: labels of the steps, `current`, `complete` → text (default labels). */
export const SUMMARY_CASES = Object.freeze([
  { name: 'anchor', labels: ['Tải tệp', 'Kiểm tra dữ liệu', 'Xem trước', 'Nhập', 'Xong'], states: [], current: '2', complete: false,
    text: 'Bước 2/5: Kiểm tra dữ liệu' },
  { name: 'anchor in error', labels: ['Tải tệp', 'Kiểm tra dữ liệu', 'Xem trước', 'Nhập', 'Xong'], states: [0, 'error'], current: '2',
    complete: false, text: 'Bước 2/5: Kiểm tra dữ liệu' },
  { name: 'complete', labels: ['Tải tệp', 'Kiểm tra dữ liệu', 'Xem trước', 'Nhập', 'Xong'], states: [], current: null, complete: true,
    text: 'Đã hoàn tất 5/5 bước' },
  { name: 'no anchor', labels: ['Tải tệp', 'Kiểm tra dữ liệu', 'Xem trước', 'Nhập', 'Xong'], states: [], current: null, complete: false,
    text: '5 bước' },
  { name: 'unmatched current', labels: ['A', 'B'], states: [], current: 'x', complete: false, text: '2 bước' },
  { name: 'one step', labels: ['Duy nhất'], states: [], current: '1', complete: false, text: 'Bước 1/1: Duy nhất' },
  { name: 'zero steps', labels: [], states: [], current: null, complete: false, text: '' },
]);
