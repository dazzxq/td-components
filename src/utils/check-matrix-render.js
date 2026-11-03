/**
 * Markup of <td-check-matrix> (v0.47.0, plan QĐ 15–17, 28) — a pure string function shared by the component render,
 * its SSR hydrate gate (expected server markup) and the PHP parity test. Internal (no package subpath).
 *
 * `renderMatrix(o)` prints the JS markup; with `o.ssr = { name }` it prints EXACTLY what php/td.php td_check_matrix()
 * prints inside the host (no-JS form: column markers first, checkbox `name` / `value`, a hidden input after each
 * locked-ticked checkbox, sentinel last; bulk inputs / colpick / group buttons `disabled` — a group button stays visible:
 * without JS it is the group's label). Ids come
 * from the host id + indexes (never from data); keys only ever reach `name` / `value` in SSR mode.
 *
 * Escaping = PHP htmlspecialchars(ENT_QUOTES) byte for byte (`'` → `&#039;`), so the strings compare equal.
 */
import { isLocked, isNa, OVERRIDE_STATES } from './check-matrix-model.js';

/** @param {unknown} s */
export const escMatrix = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** `{key}` placeholders → values (function replacer: `$&` in data stays literal text, ADR 0018 precedent). */
export const fillMatrixLabel = (tpl, vars) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));

/** Default texts (Vietnamese) — TdCheckMatrix.labels and php Td::CHECK_MATRIX_LABELS (same values). */
export const MATRIX_LABELS = Object.freeze({
  grid: 'Ma trận chọn',
  rows: 'Mục',
  all: 'Chọn tất cả',
  row: 'Chọn cả hàng {row}',
  column: 'Chọn cả cột {col}',
  group: 'Chọn cả nhóm {group}',
  groupColumn: 'Chọn cả nhóm {group}, cột {col}',
  columnPick: 'Đang sửa cột',
  na: 'Không áp dụng',
  broken: 'Không đọc được dữ liệu ma trận',
  changed: 'Đã đổi {n} ô',
  // v0.95.0 mode="override" (plan docs/internal/plans/v0.95.0-check-matrix.md §9)
  inherit: 'Kế thừa',
  inheritOn: 'Kế thừa (có quyền)',
  inheritOff: 'Kế thừa (không có quyền)',
  grant: 'Cấp quyền',
  deny: 'Từ chối',
  mixed: 'Lẫn lộn',
  cycleAll: 'Đổi tất cả',
  cycleRow: 'Đổi cả hàng {row}',
  cycleColumn: 'Đổi cả cột {col}',
  cycleGroup: 'Đổi cả nhóm {group}',
  cycleGroupColumn: 'Đổi cả nhóm {group}, cột {col}',
  resetAll: 'Đặt lại về kế thừa',
  resetColumn: 'Đặt lại cột {col}',
  keys: 'Space: đổi trạng thái. +: cấp, −: từ chối, Delete: về kế thừa',
});

/**
 * v0.95.0: the text of a data cell's state (override mode) — inherit says what it inherits when the app told
 * (`cells…inherited`: 1 yes, 2 no, 0 unknown).
 * @param {Record<string, string>} labels
 * @param {number} s state code
 * @param {number} inh
 */
export function overrideStateText(labels, s, inh) {
  if (s === 1) return labels.grant;
  if (s === 2) return labels.deny;
  return inh === 1 ? labels.inheritOn : inh === 2 ? labels.inheritOff : labels.inherit;
}

/** v0.95.0: the text of a bulk state (`inherit` / `grant` / `deny` / `mixed`). */
export const overrideBulkText = (labels, state) => labels[state] ?? labels.mixed;

export const MATRIX_LAYOUTS = Object.freeze(['auto', 'grid', 'column']);

/** The shared tick mark, drawn by CSS (M0: no SVG per cell — ADR 0017 amendment). */
const MARK = '<span class="td-check td-check--md td-check--drawn" aria-hidden="true"></span>';

/**
 * The name element (QĐ 16: the grid name ALWAYS exists): visible `label` → p.td-field__label; else a sr-only span with
 * the host aria-label or the fallback text.
 */
function nameEl(o) {
  const id = escMatrix(`${o.id}-label`);
  if (o.label) return `<p class="td-field__label" id="${id}">${escMatrix(o.label)}</p>`;
  return `<span class="td-sr-only" id="${id}">${escMatrix(o.ariaLabel || o.labels.grid)}</span>`;
}

/**
 * Broken (fail closed, QĐ 13) or empty (no data yet) markup.
 * @param {{ id: string, label?: string, ariaLabel?: string, labels: Record<string, string> }} o
 * @param {'broken'|'empty'} state
 */
export function renderMatrixState(o, state) {
  return `<div class="td-check-matrix" data-state="${state}">${nameEl(o)}`
    + (state === 'broken' ? `<p class="td-check-matrix__broken">${escMatrix(o.labels.broken)}</p>` : '') + '</div>';
}

/**
 * @param {{
 *   model: import('./check-matrix-model.js').MatrixModel, def: Uint8Array, collapsed: boolean[], id: string,
 *   label?: string, ariaLabel?: string, labels: Record<string, string>, layout: string, disabled: boolean,
 *   bulkDisabled?: (kind: string, a?: number, b?: number) => boolean, ssr?: { name: string } | null
 * }} o
 * @returns {string}
 */
export function renderMatrix(o) {
  if (o.model.mode === 'override') return renderOverride(o);
  const { model, def, labels, disabled } = o;
  const ssr = o.ssr || null;
  const h = escMatrix(o.id);
  const C = model.columns.length;
  const L = (key, vars) => escMatrix(fillMatrixLabel(labels[key], vars));
  const dis = disabled ? ' disabled' : '';
  const bulkInput = (aria, desc, kind, a, b, roving = true) => {
    const off = disabled || ssr || (o.bulkDisabled && o.bulkDisabled(kind, a, b));
    return `<input type="checkbox" class="td-check-matrix__input"${roving ? ' tabindex="-1"' : ''} aria-label="${aria}"`
      + (desc ? ` aria-describedby="${desc}"` : '') + (off ? ' disabled' : '') + `>${MARK}`;
  };
  const bulk = (kind, a, b, aria, desc, extra = '') => `<td class="td-check-matrix__bulk" data-kind="${kind}"${extra} tabindex="-1">`
    + `${bulkInput(aria, desc, kind, a, b)}</td>`;

  let out = `<div class="td-check-matrix" data-state="ready" data-layout="${escMatrix(o.layout)}">${nameEl(o)}`;
  // narrow-mode bar (QĐ 26): column picker + "select the whole column" of the picked column
  out += '<div class="td-check-matrix__bar">'
    + `<label class="td-check-matrix__colpick-label" for="${h}-colpick">${escMatrix(labels.columnPick)}</label>`
    + `<select class="td-check-matrix__colpick" id="${h}-colpick"${ssr || disabled ? ' disabled' : ''}>`
    + model.columns.map((c, j) => `<option value="${j}">${escMatrix(c.label)}</option>`).join('') + '</select>'
    + `<span class="td-check-matrix__bulk" data-kind="column-active">${bulkInput(L('column', { col: model.columns[0].label }), '', 'column', 0, 0, false)}</span>`
    + '</div>';
  out += `<div class="td-check-matrix__scroll"><table class="td-check-matrix__grid" role="grid" aria-labelledby="${h}-label"><thead>`;
  // header row 1: titles
  out += '<tr class="td-check-matrix__head"><td class="td-check-matrix__corner" tabindex="-1"></td>'
    + `<th scope="col" class="td-check-matrix__rowtitle" tabindex="-1">${escMatrix(labels.rows)}</th>`;
  model.columns.forEach((c, j) => {
    out += `<th scope="col" class="td-check-matrix__colhead" id="${h}-c${j}" data-c="${j}" tabindex="-1">`
      + `<span class="td-check-matrix__label">${escMatrix(c.label)}</span>`
      + (c.description ? `<span class="td-check-matrix__desc" id="${h}-c${j}d" aria-hidden="true">${escMatrix(c.description)}</span>` : '')
      + '</th>';
  });
  out += '</tr>';
  // header row 2: bulk cells (QĐ 16 — a header stays pure text)
  out += '<tr class="td-check-matrix__bulkrow">' + bulk('all', 0, 0, L('all', {}), '')
    + '<td class="td-check-matrix__gap" tabindex="-1"></td>';
  model.columns.forEach((c, j) => {
    out += bulk('column', j, 0, L('column', { col: c.label }), c.description ? `${h}-c${j}d` : '', ` data-c="${j}"`);
  });
  out += '</tr></thead>';

  let note = 0;
  const row = (r) => {
    const rw = model.rows[r];
    let s = `<tr class="td-check-matrix__row" data-r="${r}">`
      + bulk('row', r, 0, L('row', { row: rw.label }), rw.description ? `${h}-r${r}d` : '')
      + `<th scope="row" class="td-check-matrix__rowhead" id="${h}-r${r}" tabindex="-1"><span class="td-check-matrix__label">${escMatrix(rw.label)}</span>`
      + (rw.description ? `<span class="td-check-matrix__desc" id="${h}-r${r}d" aria-hidden="true">${escMatrix(rw.description)}</span>` : '')
      + '</th>';
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const text = model.notes.get(i);
      const nid = text ? `${h}-n${note++}` : '';
      const noteEl = text ? `<span class="td-sr-only" id="${nid}">${escMatrix(text)}</span>` : '';
      const noteAttr = text ? ' data-note' : '';
      if (isNa(model, i)) {
        s += `<td class="td-check-matrix__cell" data-c="${c}" data-na${noteAttr} tabindex="-1">`
          + `<span class="td-check-matrix__na" aria-hidden="true">–</span><span class="td-sr-only">${escMatrix(labels.na)}</span>${noteEl}</td>`;
        continue;
      }
      const locked = isLocked(model, i);
      const on = def[i] === 1;
      const col = model.columns[c];
      s += `<td class="td-check-matrix__cell" data-c="${c}"${locked ? ' data-locked' : ''}${noteAttr} tabindex="-1">`
        + `<input type="checkbox" class="td-check-matrix__input" tabindex="-1" aria-labelledby="${h}-r${r} ${h}-c${c}"`
        + (nid ? ` aria-describedby="${nid}"` : '')
        + (ssr && !locked ? ` name="${escMatrix(`${ssr.name}[${col.key}][]`)}" value="${escMatrix(rw.key)}"` : '')
        + (on ? ' checked' : '') + (locked ? ' disabled' : dis) + '>'
        + (ssr && locked && on ? `<input type="hidden" name="${escMatrix(`${ssr.name}[${col.key}][]`)}" value="${escMatrix(rw.key)}"${dis}>` : '')
        + MARK + noteEl + '</td>';
    }
    return `${s}</tr>`;
  };
  for (const seg of model.segments) {
    if (seg.group < 0) {
      out += '<tbody class="td-check-matrix__body">';
      for (let r = seg.start; r < seg.end; r++) out += row(r);
      out += '</tbody>';
      continue;
    }
    const g = seg.group;
    const grp = model.groups[g];
    const shut = !!o.collapsed[g];
    out += `<tbody class="td-check-matrix__group" id="${h}-g${g}" data-g="${g}"${shut ? ' data-collapsed' : ''}>`
      + '<tr class="td-check-matrix__grouprow">' + bulk('group', g, 0, L('group', { group: grp.label }), '')
      + '<th scope="row" class="td-check-matrix__grouphead">'
      + `<button type="button" class="td-check-matrix__group-toggle" tabindex="-1" aria-expanded="${shut ? 'false' : 'true'}" aria-controls="${h}-g${g}"`
      + (ssr ? ' disabled' : '') + '>'
      + '<span class="td-check-matrix__chevron" data-td-icon="next" data-td-icon-size="s" aria-hidden="true"></span>'
      + `<span class="td-check-matrix__label">${escMatrix(grp.label)}</span> <span class="td-check-matrix__count">(${grp.end - grp.start})</span></button></th>`;
    model.columns.forEach((c, j) => {
      out += bulk('group-column', g, j, L('groupColumn', { group: grp.label, col: c.label }), '', ` data-c="${j}"`);
    });
    out += '</tr>';
    for (let r = seg.start; r < seg.end; r++) out += row(r);
    out += '</tbody>';
  }
  out += '</table></div><p class="td-check-matrix__note" aria-hidden="true"></p><p class="td-sr-only" role="status"></p></div>';
  if (!ssr) return out;
  const markers = model.columns.map((c) => `<input type="hidden" name="${escMatrix(`${ssr.name}[${c.key}]`)}" value=""${dis}>`).join('');
  return `${markers}${out}<input type="hidden" name="${escMatrix(`${ssr.name}[_v]`)}" value="1"${dis}>`;
}

/**
 * v0.95.0 markup of the override mode (plan docs/internal/plans/v0.95.0-check-matrix.md §8–9, §11): a data cell holds a
 * `<button class="td-check-matrix__tri">` named by `aria-labelledby="{row} {col} {state}"` (the state is real text —
 * never `aria-checked="mixed"`), described by the ONE shared keys line `{h}-keys`; a bulk cell holds the same kind of
 * button (label + state spans). The bar is always there (the reset button; + the column picker in the narrow mode).
 * `o.def` = the state codes to print (the live states in JS, the defaults for the SSR gate); `o.bulkState(kind, a, b)` →
 * `{ state, disabled }`; `o.resettable` = some free cell is not inherit. With `o.ssr = { name }` it prints EXACTLY what
 * php/td.php td_check_matrix() prints in its override mode: a native `<select>` per data cell (a locked cell: a disabled
 * select without a name + a hidden input carrying its state), markers first, `_v=2` last.
 * @param {Parameters<typeof renderMatrix>[0] & { bulkState?: Function, resettable?: boolean }} o
 * @returns {string}
 */
function renderOverride(o) {
  const { model, def, labels, disabled } = o;
  const ssr = o.ssr || null;
  const h = escMatrix(o.id);
  const C = model.columns.length;
  const L = (key, vars) => escMatrix(fillMatrixLabel(labels[key], vars));
  const dis = disabled ? ' disabled' : '';
  const GLYPH = '<span class="td-check td-check--md td-check--drawn td-check-matrix__glyph" aria-hidden="true"></span>';
  let k = 0;
  const bulkState = (kind, a, b) => (o.bulkState ? o.bulkState(kind, a, b) : { state: 'inherit', disabled: true });
  const bulkBtn = (aria, desc, kind, a, b, id, roving = true) => {
    const s = bulkState(kind, a, b);
    const off = disabled || ssr || s.disabled;
    return `<button type="button" class="td-check-matrix__tri"${roving ? ' tabindex="-1"' : ''} aria-labelledby="${id} ${id}s"`
      + (desc ? ` aria-describedby="${desc}"` : '') + (off ? ' disabled' : '') + `>${GLYPH}`
      + `<span class="td-sr-only" id="${id}">${aria}</span><span class="td-sr-only" id="${id}s">${escMatrix(overrideBulkText(labels, s.state))}</span></button>`;
  };
  const bulk = (kind, a, b, aria, desc, extra = '') => {
    const id = `${h}-k${k++}`;
    return `<td class="td-check-matrix__bulk" data-kind="${kind}" data-state="${bulkState(kind, a, b).state}"${extra} tabindex="-1">`
      + `${bulkBtn(aria, desc ? `${h}-keys ${desc}` : `${h}-keys`, kind, a, b, id)}</td>`;
  };

  let out = `<div class="td-check-matrix" data-state="ready" data-layout="${escMatrix(o.layout)}" data-mode="override">${nameEl(o)}`;
  // the bar: column picker + "change the whole column" (narrow mode) + the reset button (always)
  out += '<div class="td-check-matrix__bar">'
    + `<label class="td-check-matrix__colpick-label" for="${h}-colpick">${escMatrix(labels.columnPick)}</label>`
    + `<select class="td-check-matrix__colpick" id="${h}-colpick"${ssr || disabled ? ' disabled' : ''}>`
    + model.columns.map((c, j) => `<option value="${j}">${escMatrix(c.label)}</option>`).join('') + '</select>'
    + `<span class="td-check-matrix__bulk" data-kind="column-active" data-state="${bulkState('column', 0, 0).state}">`
    + `${bulkBtn(L('cycleColumn', { col: model.columns[0].label }), '', 'column', 0, 0, `${h}-kb`, false)}</span>`
    + `<button type="button" class="td-btn td-btn--ghost td-btn--sm td-check-matrix__reset"${ssr || disabled || !o.resettable ? ' disabled' : ''}>`
    + `${escMatrix(labels.resetAll)}</button></div>`;
  out += `<div class="td-check-matrix__scroll"><table class="td-check-matrix__grid" role="grid" aria-labelledby="${h}-label"><thead>`;
  out += '<tr class="td-check-matrix__head"><td class="td-check-matrix__corner" tabindex="-1"></td>'
    + `<th scope="col" class="td-check-matrix__rowtitle" tabindex="-1">${escMatrix(labels.rows)}</th>`;
  model.columns.forEach((c, j) => {
    out += `<th scope="col" class="td-check-matrix__colhead" id="${h}-c${j}" data-c="${j}" tabindex="-1">`
      + `<span class="td-check-matrix__label">${escMatrix(c.label)}</span>`
      + (c.description ? `<span class="td-check-matrix__desc" id="${h}-c${j}d" aria-hidden="true">${escMatrix(c.description)}</span>` : '')
      + '</th>';
  });
  out += '</tr>';
  out += '<tr class="td-check-matrix__bulkrow">' + bulk('all', 0, 0, L('cycleAll', {}), '')
    + '<td class="td-check-matrix__gap" tabindex="-1"></td>';
  model.columns.forEach((c, j) => {
    out += bulk('column', j, 0, L('cycleColumn', { col: c.label }), c.description ? `${h}-c${j}d` : '', ` data-c="${j}"`);
  });
  out += '</tr></thead>';

  let note = 0;
  const row = (r) => {
    const rw = model.rows[r];
    let s = `<tr class="td-check-matrix__row" data-r="${r}">`
      + bulk('row', r, 0, L('cycleRow', { row: rw.label }), rw.description ? `${h}-r${r}d` : '')
      + `<th scope="row" class="td-check-matrix__rowhead" id="${h}-r${r}" tabindex="-1"><span class="td-check-matrix__label">${escMatrix(rw.label)}</span>`
      + (rw.description ? `<span class="td-check-matrix__desc" id="${h}-r${r}d" aria-hidden="true">${escMatrix(rw.description)}</span>` : '')
      + '</th>';
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const text = model.notes.get(i);
      const nid = text ? `${h}-n${note++}` : '';
      const noteEl = text ? `<span class="td-sr-only" id="${nid}">${escMatrix(text)}</span>` : '';
      const noteAttr = text ? ' data-note' : '';
      if (isNa(model, i)) {
        s += `<td class="td-check-matrix__cell" data-c="${c}" data-na${noteAttr} tabindex="-1">`
          + `<span class="td-check-matrix__na" aria-hidden="true">–</span><span class="td-sr-only">${escMatrix(labels.na)}</span>${noteEl}</td>`;
        continue;
      }
      const locked = isLocked(model, i);
      const st = def[i] > 2 ? 0 : def[i];
      const inh = model.inh[i];
      const col = model.columns[c];
      s += `<td class="td-check-matrix__cell" data-c="${c}" data-state="${OVERRIDE_STATES[st]}"`
        + (inh ? ` data-inherited="${inh === 1 ? 'on' : 'off'}"` : '') + `${locked ? ' data-locked' : ''}${noteAttr} tabindex="-1">`;
      if (ssr) {
        const field = escMatrix(`${ssr.name}[${col.key}][${rw.key}]`);
        s += `<select class="td-check-matrix__select" aria-labelledby="${h}-r${r} ${h}-c${c}"` + (nid ? ` aria-describedby="${nid}"` : '')
          + (locked ? ' disabled' : ` name="${field}"${dis}`) + '>'
          + OVERRIDE_STATES.map((name, v) => `<option value="${name}"${v === st ? ' selected' : ''}>${escMatrix(overrideStateText(labels, v, inh))}</option>`).join('')
          + '</select>'
          + (locked ? `<input type="hidden" name="${field}" value="${OVERRIDE_STATES[st]}"${dis}>` : '')
          + noteEl + '</td>';
        continue;
      }
      s += `<button type="button" class="td-check-matrix__tri" tabindex="-1" aria-labelledby="${h}-r${r} ${h}-c${c} ${h}-s${i}"`
        + ` aria-describedby="${h}-keys${nid ? ` ${nid}` : ''}"` + (locked || disabled ? ' disabled' : '') + `>${GLYPH}`
        + `<span class="td-sr-only" id="${h}-s${i}">${escMatrix(overrideStateText(labels, st, inh))}</span></button>${noteEl}</td>`;
    }
    return `${s}</tr>`;
  };
  for (const seg of model.segments) {
    if (seg.group < 0) {
      out += '<tbody class="td-check-matrix__body">';
      for (let r = seg.start; r < seg.end; r++) out += row(r);
      out += '</tbody>';
      continue;
    }
    const g = seg.group;
    const grp = model.groups[g];
    const shut = !!(o.collapsed && o.collapsed[g]);
    out += `<tbody class="td-check-matrix__group" id="${h}-g${g}" data-g="${g}"${shut ? ' data-collapsed' : ''}>`
      + '<tr class="td-check-matrix__grouprow">' + bulk('group', g, 0, L('cycleGroup', { group: grp.label }), '')
      + '<th scope="row" class="td-check-matrix__grouphead">'
      + `<button type="button" class="td-check-matrix__group-toggle" tabindex="-1" aria-expanded="${shut ? 'false' : 'true'}" aria-controls="${h}-g${g}"`
      + (ssr ? ' disabled' : '') + '>'
      + '<span class="td-check-matrix__chevron" data-td-icon="next" data-td-icon-size="s" aria-hidden="true"></span>'
      + `<span class="td-check-matrix__label">${escMatrix(grp.label)}</span> <span class="td-check-matrix__count">(${grp.end - grp.start})</span></button></th>`;
    model.columns.forEach((c, j) => {
      out += bulk('group-column', g, j, L('cycleGroupColumn', { group: grp.label, col: c.label }), '', ` data-c="${j}"`);
    });
    out += '</tr>';
    for (let r = seg.start; r < seg.end; r++) out += row(r);
    out += '</tbody>';
  }
  out += '</table></div><p class="td-check-matrix__note" aria-hidden="true"></p><p class="td-sr-only" role="status"></p>'
    + `<span class="td-sr-only" id="${h}-keys">${escMatrix(labels.keys)}</span></div>`;
  if (!ssr) return out;
  const markers = model.columns.map((c) => `<input type="hidden" name="${escMatrix(`${ssr.name}[${c.key}]`)}" value=""${dis}>`).join('');
  return `${markers}${out}<input type="hidden" name="${escMatrix(`${ssr.name}[_v]`)}" value="2"${dis}>`;
}
