import { TdBaseElement } from '../base/td-base-element.js';
import { escapeHtml } from '../utils/escape.js';
import { normalize, resolveLabels, splitInvisible, cpLength, cpSlice, fill, LIMITS, DEFAULT_LABELS } from '../utils/diff-model.js';

const SSR_NAME = 'diff';
const SSR_SCHEMA = 1;
/** Data properties: assigned silently, ONE render per task (microtask). */
const DATA_PROPS = ['items', 'before', 'after', 'fields'];
const UNCHANGED = ['collapse', 'show', 'hide'];
const WARN = {
  items: 'td-diff: `items` must be an array — ignored.',
  item: 'td-diff: an item was dropped — it must be an object with a non-empty `key` (string or number).',
  kind: 'td-diff: an item has an invalid `kind` (added | removed | changed | unchanged) — computed instead.',
  fields: 'td-diff: `fields` must be an array of at most 200 FieldDefs — the rest is ignored.',
  both: 'td-diff: `items` is set — `before` / `after` are ignored.',
};

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

/**
 * Before / after comparison by field — v0.46.0 (plan docs/internal/plans/v0.46.0-diff.md). Display only: no event, no
 * form. Token-native: td.css (`components/diff.css`). Light DOM; every string is TEXT (escaped template).
 *
 * Data (JS properties, assigned silently; one render per task):
 * - `items`: `Array<{ key, label?, before?, after?, kind?, masked?, type?, options?, decimals?, unit? }>` — flat rows
 *   (dsuite policies `fields` / `keys`). Wins over `before` / `after` (one warning).
 * - `before` + `after` (+ `fields`: `Array<{ path, label?, type?, options?, decimals?, unit?, masked? }>`) — snapshots,
 *   flattened by the kit (typed paths: `['lines', 0, 'qty']`; a string path is ONE root key).
 * - `masked` is DISPLAY only: the server must remove / mask secrets before sending. A masked item shows its before /
 *   after only when they are strings (already masked by the server), else `TdDiff.labels.masked` ("[ĐÃ ẨN]").
 *
 * DOM contract (`diff@1`, = PHP `td_diff()` / `td_diff_snapshots()`, adopted in place — the kit never reads data back
 * from the DOM): `div.td-diff__scroll > table.td-diff__table[role=table][aria-label]` (thead / tbody with explicit
 * roles; `tr.td-diff__row[data-kind][data-type]` > `th.td-diff__field[role=rowheader]` + two
 * `td.td-diff__cell[role=cell]`) | `p.td-diff__empty`; then `p.td-diff__note`*, `details.td-diff__unchanged`,
 * `details.td-diff__json`.
 *
 * @element td-diff
 * @attr {string} view - `auto` (default: table when the host is ≥ 480px wide, else inline) | `table` | `inline` (CSS only)
 * @attr {string} unchanged - `collapse` (default: a `<details>` after the table) | `show` | `hide`
 * @attr {boolean} json - adds a collapsed JSON view (normalised data, masked branches as "[ĐÃ ẨN]")
 * @attr {string} label - accessible name of the table (default `TdDiff.labels.table` "So sánh thay đổi")
 * @property {Array<object>} items
 * @property {unknown} before
 * @property {unknown} after
 * @property {Array<object>} fields
 * @property {{ added: number, removed: number, changed: number, unchanged: number, hidden: number, truncated: boolean } | null} counts - read only (null until rendered from data)
 */
export class TdDiff extends TdBaseElement {
  /** Site-overridable texts (Vietnamese defaults = PHP Td::DIFF_LABELS). */
  static labels = { ...DEFAULT_LABELS };

  static hydratable = true;

  static get observedAttributes() { return ['view', 'unchanged', 'json', 'label']; }

  constructor() {
    super();
    this._data = {};
    this._early = false;
    this._pending = false;
    this._counts = null;
    this._warned = new Set();
  }

  connectedCallback() {
    // data assigned before the element was defined lives in own data properties: replay them through the accessors
    if (!this._initialized) {
      for (const k of DATA_PROPS) {
        if (Object.hasOwn(this, k)) {
          const v = this[k];
          delete this[k];
          this._data[k] = v;
          if (k !== 'fields') this._early = true;
        }
      }
    }
    super.connectedCallback();
  }

  get counts() { return this._counts ? { ...this._counts } : null; }

  _hasData() {
    const d = this._data;
    return (d.items !== undefined && d.items !== null) || d.before !== undefined || d.after !== undefined;
  }

  _set(k, v) {
    this._data[k] = v;
    if (!this._initialized) {
      if (k !== 'fields') this._early = true;
      return;
    }
    if (this._pending) return;
    this._pending = true;
    queueMicrotask(() => {
      this._pending = false;
      this._doRender();
    });
  }

  _warnOnce(key) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(WARN[key] ?? `td-diff: fields[${key.slice(6)}] has an invalid path — ignored.`);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'view') return; // CSS only: the same nodes switch layout
    if (this._hydrated && !this._hasData()) {
      // adopted server markup without data: nothing to re-render from
      if (name === 'label') {
        const t = this.querySelector(':scope > .td-diff__scroll > .td-diff__table');
        if (t) t.setAttribute('aria-label', newVal || resolveLabels(TdDiff.labels).table);
      } else this._warnOnce('ssr');
      return;
    }
    this._doRender();
  }

  render() {
    const L = resolveLabels(TdDiff.labels);
    const json = this.hasAttribute('json');
    const d = this._data;
    if (!this._hasData()) {
      this._counts = null;
      return diffMarkup(normalize({}, { labels: L }), { labels: L, label: this.getAttribute('label'), unchanged: this.getAttribute('unchanged'), json });
    }
    const m = normalize(d, { labels: L, json });
    if (d.items !== undefined && d.items !== null && (d.before !== undefined || d.after !== undefined)) this._warnOnce('both');
    for (const w of m.warnings) this._warnOnce(w);
    this._counts = m.counts;
    this._hydrated = false;
    return diffMarkup(m, { labels: L, label: this.getAttribute('label'), unchanged: this.getAttribute('unchanged'), json });
  }

  // --- SSR (ADR 0012, contract diff@1, plan QĐ 20) ---

  /** Marker exactly `diff@1`, no data assigned early, and the minimal shape → keep the server markup as it is. */
  canHydrate() {
    if (!this.hasAttribute('data-td-ssr')) return false;
    if (!this._ssrMatches(SSR_NAME, SSR_SCHEMA)) {
      this._warnOnce('marker');
      return false;
    }
    return !this._early && this._shapeOk();
  }

  canRebind() { return this._shapeOk(); }

  /** @private The first element child is the main block of the contract (no data is ever read back). */
  _shapeOk() {
    const f = this.firstElementChild;
    return !!f && (f.matches('div.td-diff__scroll') || f.matches('p.td-diff__empty'));
  }
}

WARN.marker = 'td-diff: the server markup is not diff@1 — rendered from the properties instead.';
WARN.ssr = 'td-diff: server markup without data — assign items / before / after to re-render.';

for (const k of DATA_PROPS) {
  Object.defineProperty(TdDiff.prototype, k, {
    get() { return this._data[k]; },
    set(v) { this._set(k, v); },
    configurable: true,
  });
}

if (!customElements.get('td-diff')) {
  customElements.define('td-diff', TdDiff);
}
