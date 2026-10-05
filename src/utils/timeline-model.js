/**
 * v0.45.0 (plan v0.45.0-steps-timeline QĐ T1–T5, T10) — pure model of `<td-timeline>`: instants (QĐ T3: a time is an
 * INSTANT — Date, epoch, or ISO 8601 WITH `Z` / offset; anything else is "unknown time", never guessed), item
 * normalisation, stable sort, day grouping in an explicit IANA zone (QĐ T4 / T5), "Xem thêm" merging (review R1-2).
 * Shared by the component, its SSR gate and the node / PHP parity tests (INSTANT_CASES, DAY_CASES).
 * Internal module (no package subpath). php/td.php `td__timeline_instant()` / `td__timeline_items()` /
 * `td__timeline_day_label()` implement the same rules.
 *
 * Item (normalised): `{ id, time, title, tone, expanded }` (+ `href`, `actor: { name, href? }`, `meta`, `icon`,
 * `details` (text | true = lazy) when present). `time` = epoch ms, or null (unknown time → the last group).
 * @module utils/timeline-model
 */
import { cleanText, cleanHref, fill } from './filter-chips-model.js';
import { dayKey, zonedParts, daysInMonth } from './datetime.js';

export const TL_LIMITS = Object.freeze({ id: 200, title: 300, actor: 120, meta: 200, details: 5000 });
/** Per assignment / append: at most MAX_ITEMS items kept, MAX_CANDIDATES entries inspected. */
export const MAX_ITEMS = 1000;
export const MAX_CANDIDATES = MAX_ITEMS * 4;
export const TONES = Object.freeze(['neutral', 'success', 'warning', 'danger', 'info']);
const ICON_NAME = /^[a-z][a-z0-9-]{0,63}$/;

/** Default texts (= PHP Td::TIMELINE_LABELS). `day`: {weekday} {dd} {mm} {yyyy}. */
export const TIMELINE_LABELS = Object.freeze({
  empty: 'Chưa có hoạt động nào',
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  day: '{weekday}, {dd}/{mm}/{yyyy}',
  weekdays: Object.freeze(['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']),
  unknownDay: 'Không rõ thời gian',
  details: 'Chi tiết',
  detailsLoading: 'Đang tải…',
  detailsError: 'Không tải được chi tiết.',
  retry: 'Thử lại',
  more: 'Xem thêm',
  moreError: 'Không tải được, thử lại',
  loaded: 'Đã tải thêm {n} mục',
});

/** Instants outside [1000-01-02, 9999-12-30] UTC are refused (every zone keeps a 4-digit year). */
export const MIN_MS = Date.UTC(1000, 0, 2);
export const MAX_MS = Date.UTC(9999, 11, 30, 23, 59, 59, 999);
/**
 * ISO 8601 instant: date `T` time, optional seconds and 1–9 fraction digits (kept to ms by TRUNCATION — JS and PHP
 * alike), then `Z` or an offset `±hh`, `±hhmm`, `±hh:mm`. Anchored: no free text, no zone-less string.
 */
export const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * QĐ T3 — an instant as epoch ms, or null. Date (valid); number (finite; `< 1e12` = seconds, like
 * TdDateTime._parseDate); ISO string WITH `Z` / offset (ISO_INSTANT). Zone-less strings, free text, numeric strings → null.
 * @param {unknown} v
 * @returns {number|null}
 */
export function parseInstant(v) {
  let ms = null;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === 'number') {
    if (Number.isFinite(v)) ms = Math.trunc(v < 1e12 ? v * 1000 : v);
  } else if (typeof v === 'string' && v.length <= 40) {
    const m = ISO_INSTANT.exec(v);
    if (!m) return null;
    const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
    const s = m[6] ? Number(m[6]) : 0;
    const frac = m[7] ? Number(`${m[7]}00`.slice(0, 3)) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    if (h > 23 || mi > 59 || s > 59) return null;
    let off = 0;
    if (m[8] !== 'Z') {
      const om = /^([+-])(\d{2}):?(\d{2})?$/.exec(m[8]);
      const oh = Number(om[2]);
      const omin = om[3] ? Number(om[3]) : 0;
      if (oh > 23 || omin > 59) return null;
      off = (om[1] === '-' ? -1 : 1) * (oh * 60 + omin);
    }
    const day = new Date(0);
    day.setUTCFullYear(y, mo - 1, d); // setUTCFullYear: years 0–99 are NOT shifted to 19xx (Date.UTC would)
    day.setUTCHours(h, mi, s, frac);
    ms = day.getTime() - off * 60000;
  }
  return ms !== null && ms >= MIN_MS && ms <= MAX_MS ? ms : null;
}

/** The canonical ISO of an instant (UTC, ms): what `<time datetime>` carries and `items` reads back. */
export function isoOf(ms) {
  return new Date(ms).toISOString();
}

/**
 * Text that keeps its line breaks (`details`): CR LF / CR → LF, control characters other than TAB / LF removed, cut
 * to `max` code points (4 × max UTF-16 units inspected first).
 * @returns {string|null}
 */
export function cleanMultiline(v, max) {
  let s;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' && Number.isFinite(v)) s = String(v);
  else return null;
  if (s.length > max * 4) s = s.slice(0, max * 4);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
  return Array.from(s).slice(0, max).join('');
}

/**
 * @param {unknown} list
 * @param {{ baseURI?: string, origin?: string, start?: number }} [opts] cleanHref options (tests); `start` = how many
 *   items already exist (default ids of an appended page continue the count)
 * @returns {{ items: object[], dropped: number, renamed: number, capped: boolean, untimed: number }}
 */
export function normalizeItems(list, opts = {}) {
  const items = [];
  let dropped = 0;
  let renamed = 0;
  let untimed = 0;
  let capped = false;
  const used = new Set();
  const next = new Map();
  const start = Number.isInteger(opts.start) && opts.start > 0 ? opts.start : 0;
  const arr = Array.isArray(list) ? list : [];
  const end = Math.min(arr.length, MAX_CANDIDATES);
  if (arr.length > end) capped = true;
  for (let i = 0; i < end; i++) {
    if (items.length >= MAX_ITEMS) { capped = true; break; }
    const raw = arr[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
    const title = cleanText(raw.title, TL_LIMITS.title);
    if (title === null || !title.trim()) { dropped++; continue; }
    const id0 = raw.id == null ? null : cleanText(raw.id, TL_LIMITS.id);
    const base = id0 || String(start + items.length + 1);
    let id = base;
    if (used.has(id)) {
      let n = next.get(base) || 2;
      while (used.has(`${base}-${n}`)) n++;
      id = `${base}-${n}`;
      next.set(base, n + 1);
      renamed++;
    }
    used.add(id);
    const time = parseInstant(raw.time);
    if (time === null) untimed++;
    const it = { id, time, title, tone: TONES.includes(raw.tone) ? raw.tone : 'neutral', expanded: raw.expanded === true };
    if (raw.href != null) {
      const href = cleanHref(raw.href, opts);
      if (href) it.href = href;
    }
    const a = raw.actor;
    if (a != null) {
      const obj = typeof a === 'object' && !Array.isArray(a);
      const name = cleanText(obj ? a.name : a, TL_LIMITS.actor);
      if (name && name.trim()) {
        it.actor = { name };
        if (obj && a.href != null) {
          const href = cleanHref(a.href, opts);
          if (href) it.actor.href = href;
        }
      }
    }
    if (raw.meta != null) {
      const meta = cleanText(raw.meta, TL_LIMITS.meta);
      if (meta && meta.trim()) it.meta = meta;
    }
    if (typeof raw.icon === 'string' && ICON_NAME.test(raw.icon)) it.icon = raw.icon;
    if (raw.details === true) it.details = true;
    else if (raw.details != null) {
      const d = cleanMultiline(raw.details, TL_LIMITS.details);
      if (d && d.trim()) it.details = d;
    }
    items.push(it);
  }
  return { items, dropped, renamed, capped, untimed };
}

/**
 * QĐ T2 / T3 — stable sort: timed items by time (`desc` newest first, ties keep the given order), then every
 * unknown-time item in the given order (always last, whatever the order).
 */
export function sortItems(items, order = 'desc') {
  const dir = order === 'asc' ? 1 : -1;
  const timed = [];
  const untimed = [];
  items.forEach((it, i) => (it.time === null ? untimed : timed).push([it, i]));
  timed.sort((a, b) => (a[0].time - b[0].time) * dir || a[1] - b[1]);
  return [...timed.map((x) => x[0]), ...untimed.map((x) => x[0])];
}

/**
 * QĐ T5 / T9 — groups of a SORTED list: `day` → one group per calendar day in `timeZone` (`key` yyyy-mm-dd), `none`
 * → one group `all`; then at most one `unknown` group (the unknown-time items), always last.
 * @returns {Array<{ key: string, items: object[] }>}
 */
export function groupItems(sorted, group, timeZone) {
  const out = [];
  let cur = null;
  const unknown = [];
  for (const it of sorted) {
    if (it.time === null) { unknown.push(it); continue; }
    const key = group === 'none' ? 'all' : dayKey(it.time, timeZone);
    if (!cur || cur.key !== key) {
      cur = { key, items: [] };
      out.push(cur);
    }
    cur.items.push(it);
  }
  if (unknown.length) out.push({ key: 'unknown', items: unknown });
  return out;
}

/** yyyy-mm-dd ± n calendar days (pure calendar arithmetic — no 24 h assumption, DST-safe). */
export function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d + n);
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * QĐ T5 — the label of a day group: "Hôm nay" / "Hôm qua" relative to `now` in `timeZone`, else "{Thứ}, dd/mm/yyyy".
 * No "tomorrow" (history).
 * @param {string} key yyyy-mm-dd
 * @param {string} timeZone
 * @param {number} now epoch ms
 * @param {Record<string, any>} [labels]
 */
export function dayLabel(key, timeZone, now, labels = {}) {
  const L = { ...TIMELINE_LABELS, ...labels };
  const today = dayKey(now, timeZone);
  if (key === today) return L.today;
  if (key === shiftDay(today, -1)) return L.yesterday;
  const [y, m, d] = key.split('-');
  const t = new Date(0);
  t.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
  const wd = Array.isArray(L.weekdays) && L.weekdays.length === 7 ? L.weekdays : TIMELINE_LABELS.weekdays;
  return fill(L.day, { weekday: wd[t.getUTCDay()], dd: d, mm: m, yyyy: y });
}

/** QĐ T5 — the time shown on an item: `HH:mm` (grouped by day), `dd/mm/yyyy HH:mm` (group="none"). */
export function timeText(ms, timeZone, group) {
  const p = zonedParts(ms, timeZone);
  const hm = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  if (group !== 'none') return hm;
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${String(p.year).padStart(4, '0')} ${hm}`;
}

/** Review R1-2 — the "Xem thêm" cursor: the LAST item with a valid time in display order (null: none yet). */
export function lastKnown(sorted) {
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i].time !== null) return sorted[i];
  return null;
}

/**
 * Review R1-2 — merge a loaded page into the displayed (sorted) list: items whose id is already shown are dropped
 * (overlapping pages); the rest are placed by time among the known items (ties after the shown ones), unknown-time
 * items appended to the end of the unknown group. Returns the new sorted list and the items actually added.
 */
export function mergeAppend(sorted, page, order = 'desc') {
  const ids = new Set(sorted.map((i) => i.id));
  const added = [];
  for (const it of page) {
    if (ids.has(it.id)) continue;
    ids.add(it.id);
    added.push(it);
  }
  return { list: sortItems([...sorted, ...added], order), added };
}

/** Generation counter (lazy details, "Xem thêm"): a result is applied only while its generation is current. */
export class Generation {
  constructor() { this.value = 0; }
  next() { this.value += 1; return this.value; }
  isCurrent(n) { return n === this.value; }
}

/**
 * QĐ T3 parity table (JS parseInstant = PHP td__timeline_instant): `[input, epoch ms | null]`. dsuite sends ISO UTC with
 * 6 fraction digits (DATETIME(6)) — fractions of 1–9 digits are TRUNCATED to ms in both runtimes.
 */
export const INSTANT_CASES = Object.freeze([
  ['2026-10-06T03:15:22Z', Date.UTC(2026, 9, 6, 3, 15, 22)],
  ['2026-10-06T03:15:22.1Z', Date.UTC(2026, 9, 6, 3, 15, 22, 100)],
  ['2026-10-06T03:15:22.123Z', Date.UTC(2026, 9, 6, 3, 15, 22, 123)],
  ['2026-10-06T03:15:22.123456Z', Date.UTC(2026, 9, 6, 3, 15, 22, 123)],
  ['2026-10-06T03:15:22.123999Z', Date.UTC(2026, 9, 6, 3, 15, 22, 123)],
  ['2026-10-06T03:15:22.123456789Z', Date.UTC(2026, 9, 6, 3, 15, 22, 123)],
  ['2026-10-06T10:15:22.987654+07:00', Date.UTC(2026, 9, 6, 3, 15, 22, 987)],
  ['2026-10-06T10:15:22+07:00', Date.UTC(2026, 9, 6, 3, 15, 22)],
  ['2026-10-06T10:15:22+0700', Date.UTC(2026, 9, 6, 3, 15, 22)],
  ['2026-10-05T22:15-05', Date.UTC(2026, 9, 6, 3, 15)],
  ['2026-10-06T03:15Z', Date.UTC(2026, 9, 6, 3, 15)],
  ['2026-10-04T17:30:00Z', Date.UTC(2026, 9, 4, 17, 30)],
  ['2028-02-29T00:00:00+07:00', Date.UTC(2028, 1, 28, 17)],
  [1759720522, 1759720522000],
  [1759720522123, 1759720522123],
  [1759720522.5, 1759720522500],
  [0, 0],
  ['2026-10-05 14:00', null],
  ['2026-10-05 14:00:00Z', null],
  ['2026-10-05', null],
  ['2026-10-05T14:00', null],
  ['2026-10-05T14:00:00', null],
  ['2026-10-05T14:00:00.Z', null],
  ['2026-10-05T14:00:00.1234567890Z', null],
  ['2026-10-05T14:00:00z', null],
  [' 2026-10-05T14:00:00Z', null],
  ['Oct 5 2026 14:00 GMT', null],
  ['1759720522', null],
  ['2026-13-01T00:00Z', null],
  ['2026-02-29T00:00Z', null],
  ['2026-04-31T00:00Z', null],
  ['2026-10-05T24:00Z', null],
  ['2026-10-05T23:60Z', null],
  ['2026-10-05T23:59:60Z', null],
  ['2026-10-05T10:00+24:00', null],
  ['0999-12-31T00:00Z', null],
  ['', null],
  [1e17, null],
  [true, null],
  [null, null],
]);

/**
 * QĐ T5 parity table (JS dayKey / dayLabel = PHP): `[instant ISO, IANA zone, now ISO, group key, label]` — across
 * 00:00 Vietnam (17:00Z), year end, 29/02, a DST change.
 */
export const DAY_CASES = Object.freeze([
  ['2026-10-04T17:30:00Z', 'Asia/Ho_Chi_Minh', '2026-10-05T03:00:00Z', '2026-10-05', 'Hôm nay'],
  ['2026-10-04T16:59:00Z', 'Asia/Ho_Chi_Minh', '2026-10-05T03:00:00Z', '2026-10-04', 'Hôm qua'],
  ['2026-10-04T17:30:00Z', 'UTC', '2026-10-05T03:00:00Z', '2026-10-04', 'Hôm qua'],
  ['2026-10-03T10:00:00Z', 'Asia/Ho_Chi_Minh', '2026-10-05T03:00:00Z', '2026-10-03', 'Thứ Bảy, 03/10/2026'],
  ['2026-10-05T10:00:00Z', 'Asia/Ho_Chi_Minh', '2026-10-07T03:00:00Z', '2026-10-05', 'Thứ Hai, 05/10/2026'],
  ['2026-10-06T10:00:00Z', 'Asia/Ho_Chi_Minh', '2026-10-05T03:00:00Z', '2026-10-06', 'Thứ Ba, 06/10/2026'],
  ['2026-12-31T17:30:00Z', 'Asia/Ho_Chi_Minh', '2027-01-01T05:00:00Z', '2027-01-01', 'Hôm nay'],
  ['2026-12-31T16:00:00Z', 'Asia/Ho_Chi_Minh', '2027-01-01T05:00:00Z', '2026-12-31', 'Hôm qua'],
  ['2028-02-28T17:00:00Z', 'Asia/Ho_Chi_Minh', '2028-03-01T02:00:00Z', '2028-02-29', 'Hôm qua'],
  ['2028-02-28T16:59:00Z', 'Asia/Ho_Chi_Minh', '2028-03-01T02:00:00Z', '2028-02-28', 'Thứ Hai, 28/02/2028'],
  ['2026-03-28T23:30:00Z', 'Europe/Berlin', '2026-03-29T12:00:00Z', '2026-03-29', 'Hôm nay'],
  ['2026-03-28T22:59:00Z', 'Europe/Berlin', '2026-03-29T12:00:00Z', '2026-03-28', 'Hôm qua'],
  ['2026-03-28T22:59:00Z', 'Europe/Berlin', '2026-03-29T23:00:00Z', '2026-03-28', 'Thứ Bảy, 28/03/2026'],
]);
