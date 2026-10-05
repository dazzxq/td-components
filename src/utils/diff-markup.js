/**
 * v0.46.0 — markup of `<td-diff>` from a model (pure: no DOM, node-testable). php/td.php `td__diff_markup()` prints the
 * same tree (contract `diff@1`; parity: test/php/td-ssr-diff.test.js). Every string is escaped TEXT; bidi / invisible
 * characters become visible `⟨U+XXXX⟩` spans (QĐ 8).
 * @module utils/diff-markup
 */
import { escapeHtml } from './escape.js';
import { splitInvisible, cpLength, cpSlice, fill, LIMITS } from './diff-model.js';

export const UNCHANGED = Object.freeze(['collapse', 'show', 'hide']);

const e = escapeHtml;

/** Escaped text with bidi / invisible characters made visible (`⟨U+202E⟩`, muted — QĐ 8). */
function vis(s) {
  let out = '';
  for (const p of splitInvisible(s)) out += p.c ? `<span class="td-diff__ctl">${p.c}</span>` : e(p.t);
  return out;
}

/** One value cell body (model cell → markup). */
function valueHtml(c, L) {
  if (c === null) {
    return `<span class="td-diff__value td-diff__value--empty"><span aria-hidden="true">—</span><span class="td-sr-only">${e(L.empty)}</span></span>`;
  }
  if (c.k === 'masked') return `<span class="td-diff__value td-diff__value--masked">${e(L.masked)}</span>`;
  if (c.k === 'note') return `<span class="td-diff__value td-diff__value--note" dir="auto">${vis(c.s)}</span>`;
  if (c.k === 'list') {
    let li = '';
    for (const it of c.items) {
      const mark = it.m === '+' ? 'add' : it.m === '-' ? 'del' : '';
      li += `<li class="td-diff__item"${mark ? ` data-mark="${mark}"` : ''}>`
        + (mark ? `<span class="td-diff__mark" aria-hidden="true">${mark === 'add' ? '+' : '−'}</span><span class="td-sr-only">${e(mark === 'add' ? L.listAdded : L.listRemoved)} </span>` : '')
        + `<span class="td-diff__item-value${it.note ? ' td-diff__value--note' : ''}" dir="auto">${vis(it.s)}</span></li>`;
    }
    if (c.more > 0) li += `<li class="td-diff__item td-diff__item--more">${e(fill(L.listMore, { n: c.more }))}</li>`;
    return `<ul class="td-diff__list" role="list">${li}</ul>`;
  }
  const json = c.k === 'json';
  const cls = `td-diff__value${json ? ' td-diff__value--json' : ''}`;
  const dir = json ? 'ltr' : 'auto';
  const cut = c.cut ? `<span class="td-diff__cut">${e(L.truncated)}</span>` : '';
  const n = cpLength(c.s);
  if (n <= LIMITS.preview) return `<span class="${cls}" dir="${dir}">${vis(c.s)}</span>${cut}`;
  return `<span class="${cls}" dir="${dir}">${vis(cpSlice(c.s, LIMITS.preview))}…</span>`
    + `<details class="td-diff__more"><summary class="td-diff__summary">${e(fill(L.showFull, { n }))}</summary>`
    + `<span class="${cls} td-diff__value--full" dir="${dir}">${vis(c.s)}</span>${cut}</details>`;
}

function headHtml(L) {
  const th = (t) => `<th class="td-diff__th" role="columnheader" scope="col">${e(t)}</th>`;
  return `<thead class="td-diff__head" role="rowgroup"><tr role="row">${th(L.field)}${th(L.before)}${th(L.after)}</tr></thead>`;
}

function rowHtml(r, L) {
  let field = `<span class="td-diff__label">${vis(r.label)}</span>`;
  if (r.kind !== 'unchanged') field += ` <span class="td-diff__kind" data-kind="${r.kind}">${e(L[r.kind])}</span>`;
  if (r.uncertain) field += ` <span class="td-diff__uncertain">${e(L.uncertain)}</span>`;
  if (r.masked) field += ` <span class="td-diff__badge">${e(L.maskedBadge)}</span>`;
  return `<tr class="td-diff__row" role="row" data-kind="${r.kind}" data-type="${r.type}"${r.masked ? ' data-masked=""' : ''}>`
    + `<th class="td-diff__field" role="rowheader" scope="row">${field}</th>`
    + `<td class="td-diff__cell td-diff__cell--before" role="cell"><span class="td-diff__side" aria-hidden="true">${e(L.before)}</span>${valueHtml(r.before, L)}</td>`
    + `<td class="td-diff__cell td-diff__cell--after" role="cell"><span class="td-diff__arrow" aria-hidden="true">→</span>`
    + `<span class="td-diff__side" aria-hidden="true">${e(L.after)}</span>${valueHtml(r.after, L)}</td></tr>`;
}

function tableHtml(rows, label, L) {
  return `<div class="td-diff__scroll"><table class="td-diff__table" role="table" aria-label="${e(label)}">${headHtml(L)}`
    + `<tbody role="rowgroup">${rows.map((r) => rowHtml(r, L)).join('')}</tbody></table></div>`;
}

function preHtml(text, cut, aria, L) {
  return `<pre class="td-diff__pre" tabindex="0" aria-label="${e(aria)}">${vis(text)}${cut ? `\n<span class="td-diff__cut">${e(L.truncated)}</span>` : ''}</pre>`;
}

/**
 * The markup of a model (pure: no DOM) — php/td.php `td__diff_markup()` prints the same tree (contract `diff@1`).
 * @param {ReturnType<typeof normalize>} m
 * @param {{ labels: object, label?: string, unchanged?: string, json?: boolean }} o
 */
export function diffMarkup(m, o) {
  const L = o.labels;
  const mode = UNCHANGED.includes(o.unchanged) ? o.unchanged : 'collapse';
  const main = mode === 'show' ? m.rows : m.rows.filter((r) => r.kind !== 'unchanged');
  const same = mode === 'collapse' ? m.rows.filter((r) => r.kind === 'unchanged') : [];
  const label = o.label || L.table;
  let html = main.length ? tableHtml(main, label, L) : `<p class="td-diff__empty">${e(L.none)}</p>`;
  const note = (t) => `<p class="td-diff__note">${e(t)}</p>`;
  if (m.counts.hidden > 0) html += note(fill(L.more, { n: m.counts.hidden }));
  for (const n of m.notes) html += note(n === 'unsafe' ? L.unsafeNote : L[n]);
  if (same.length) {
    const t = fill(L.unchanged, { n: same.length });
    html += `<details class="td-diff__unchanged"><summary class="td-diff__summary">${e(t)}</summary>${tableHtml(same, t, L)}</details>`;
  }
  if (o.json && m.json) {
    html += `<details class="td-diff__json"><summary class="td-diff__summary">${e(L.json)}</summary>`
      + `<figure class="td-diff__figure"><figcaption class="td-diff__caption">${e(L.before)}</figcaption>${preHtml(m.json.before, m.json.beforeCut, L.jsonBefore, L)}</figure>`
      + `<figure class="td-diff__figure"><figcaption class="td-diff__caption">${e(L.after)}</figcaption>${preHtml(m.json.after, m.json.afterCut, L.jsonAfter, L)}</figure></details>`;
  }
  return html;
}
