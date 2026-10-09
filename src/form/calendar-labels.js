/**
 * INTERNAL (not exported from the package): the calendar label keys shared by `<td-datetime-picker>` and
 * `<td-datetime-range>` (plan v0.61.0 F6). Every call returns FRESH weekday arrays — a site that mutates one component's
 * `labels.weekdaysShort` must never change the other's (nor the defaults); `normalizeCalendarLabels()` copies the arrays too.
 */

/** @returns {{ weekdaysShort: string[], weekdaysLong: string[] }} new arrays on every call */
export function freshWeekdays() {
  return {
    weekdaysShort: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
    weekdaysLong: ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'],
  };
}

/** The calendar keys of a `static labels` table (Vietnamese defaults; the two weekday arrays are new each call). */
export function freshCalendarLabels() {
  return {
    prevMonth: 'Tháng trước', nextMonth: 'Tháng sau', prevYear: 'Năm trước', nextYear: 'Năm sau',
    prevYears: '12 năm trước', nextYears: '12 năm sau', pickMonth: 'chọn tháng', pickYear: 'chọn năm',
    ...freshWeekdays(),
    monthName: 'Tháng {n}', heading: 'Tháng {month} năm {year}', headingMonths: 'Năm {year}', headingYears: '{from} – {to}',
    dayLabel: '{weekday}, {day} tháng {month} năm {year}', yearLabel: 'Năm {year}', todaySuffix: 'hôm nay',
  };
}

/**
 * A COPY of `labels` whose two weekday arrays are validated (7 strings, else fresh defaults + `onBad(key)`) and copied.
 * @param {Record<string, any>} labels
 * @param {(key: string) => void} [onBad]
 */
export function normalizeCalendarLabels(labels, onBad) {
  const out = { ...labels };
  const D = freshWeekdays();
  for (const k of ['weekdaysShort', 'weekdaysLong']) {
    const v = labels[k];
    if (Array.isArray(v) && v.length === 7 && v.every((x) => typeof x === 'string')) out[k] = v.slice();
    else {
      if (onBad) onBad(k);
      out[k] = D[k];
    }
  }
  return out;
}
