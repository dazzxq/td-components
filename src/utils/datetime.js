/**
 * DateTime utility for formatting dates.
 * Ported from DCMS FormatTime — pure utility, no DOM dependency.
 *
 * Features:
 * - Absolute time formatting with custom tokens (DD/MM/YYYY/HH/mm/ss/A/a/hh/YY)
 * - Relative time in Vietnamese ("Vừa xong", "X phút trước", "Hơn X giờ trước"; future: "Sắp tới", "Trong X phút")
 * - ISO conversion from formatted date strings
 *
 * @example
 * TdDateTime.toAbsolute('2025-08-12T04:36:00Z', 'DD/MM/YYYY - HH:mm')
 * TdDateTime.toRelative('2025-08-12T04:36:00Z') // "3 tháng trước"
 * TdDateTime.toISO('12/08/2025 - 11:36', 'DD/MM/YYYY - HH:mm')
 */
// Longest first so `YYYY` wins over `YY`.
const DATE_TOKENS = ['YYYY', 'YY', 'MM', 'DD', 'HH', 'hh', 'mm', 'ss', 'A', 'a'];

export class TdDateTime {
  /**
   * Parse input date (ISO string, Unix timestamp, or Date object) to Date object.
   * @param {string|number|Date} input - Date input
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  static _parseDate(input) {
    // 0 is a valid timestamp (1970-01-01); only "no value" inputs are rejected.
    if (input === null || input === undefined || input === '') return null;

    // Already a Date object
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    // Unix timestamp (number in seconds or milliseconds)
    if (typeof input === 'number') {
      const timestamp = input < 1e12 ? input * 1000 : input;
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    }

    // String input
    if (typeof input === 'string') {
      // Try ISO string first
      const isoDate = new Date(input);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }

      // Try Unix timestamp string
      const numInput = Number(input);
      if (!isNaN(numInput)) {
        const timestamp = numInput < 1e12 ? numInput * 1000 : numInput;
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    return null;
  }

  /**
   * Pad number with leading zeros.
   * @param {number} num - Number to pad
   * @param {number} length - Target length (default 2)
   * @returns {string} Padded string
   */
  static _pad(num, length = 2) {
    return String(num).padStart(length, '0');
  }

  /**
   * Format date to absolute time string.
   * @param {string|number|Date} dateInput - Date input (ISO string, Unix timestamp, or Date object)
   * @param {string} format - Format string (default: 'DD/MM/YYYY - HH:mm')
   *   Supported tokens:
   *   - DD: Day (01-31)
   *   - MM: Month (01-12)
   *   - YYYY: Full year (2025)
   *   - YY: 2-digit year (25)
   *   - HH: 24-hour format (00-23)
   *   - hh: 12-hour format (01-12)
   *   - mm: Minutes (00-59)
   *   - ss: Seconds (00-59)
   *   - A: AM/PM (uppercase)
   *   - a: am/pm (lowercase)
   *   A letter run is replaced only when it consists entirely of tokens; wrap literal text in `[...]` to force it.
   * @returns {string} Formatted date string or empty string if invalid
   */
  static toAbsolute(dateInput, format = 'DD/MM/YYYY - HH:mm') {
    const date = TdDateTime._parseDate(dateInput);
    if (!date) return '';

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const hours24 = date.getHours();
    const hours12 = hours24 === 0 ? 12 : (hours24 > 12 ? hours24 - 12 : hours24);
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const ampmLower = ampm.toLowerCase();

    const values = {
      YYYY: String(year),
      YY: String(year).slice(-2),
      MM: TdDateTime._pad(month),
      DD: TdDateTime._pad(day),
      HH: TdDateTime._pad(hours24),
      hh: TdDateTime._pad(hours12),
      mm: TdDateTime._pad(minutes),
      ss: TdDateTime._pad(seconds),
      A: ampm,
      a: ampmLower,
    };

    // One pass: `[literal]` is emitted verbatim (brackets dropped); a run of letters is replaced only when it is made
    // ENTIRELY of tokens (`YYYY`, `HHmm`, `A`…), so ordinary words (`Ngay`, `thang`) are left untouched.
    return String(format).replace(/\[([^\]]*)\]|\p{L}+/gu, (match, literal) => {
      if (literal !== undefined) return literal;
      let out = '';
      for (let i = 0; i < match.length;) {
        const token = DATE_TOKENS.find((t) => match.startsWith(t, i));
        if (!token) return match;
        out += values[token];
        i += token.length;
      }
      return out;
    });
  }

  /**
   * Format date to relative time string (Vietnamese).
   * @param {string|number|Date} dateInput - Date input
   * @returns {string} Relative time string (e.g., "Vừa xong", "5 phút trước")
   */
  static toRelative(dateInput) {
    const date = TdDateTime._parseDate(dateInput);
    if (!date) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    // < 60 s in the future = client/server clock skew on a just-created item → "Vừa xong", not "Sắp tới"
    if (diffMs <= -60000) return TdDateTime._toRelativeFuture(-diffMs);
    if (diffMs < 0) return 'Vừa xong';
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    // Less than 1 minute
    if (diffSeconds < 60) {
      return 'Vừa xong';
    }

    // Minutes
    if (diffMinutes < 60) {
      return `${diffMinutes} phút trước`;
    }

    // Hours
    if (diffHours < 24) {
      const hours = Math.floor(diffHours);
      const minutesInCurrentHour = diffMinutes % 60;
      if (minutesInCurrentHour >= 30) {
        return `Hơn ${hours} giờ trước`;
      }
      return `${hours} giờ trước`;
    }

    // Days
    if (diffDays < 30) {
      const days = Math.floor(diffDays);
      const hoursInCurrentDay = diffHours % 24;
      if (hoursInCurrentDay >= 12) {
        return `Hơn ${days} ngày trước`;
      }
      return `${days} ngày trước`;
    }

    // Months
    if (diffMonths < 12) {
      const months = Math.floor(diffMonths);
      const daysInCurrentMonth = diffDays % 30;
      if (daysInCurrentMonth >= 15) {
        return `Hơn ${months} tháng trước`;
      }
      return `${months} tháng trước`;
    }

    // Years
    const years = Math.floor(diffYears);
    const monthsInCurrentYear = diffMonths % 12;
    if (monthsInCurrentYear >= 6) {
      return `Hơn ${years} năm trước`;
    }
    return `${years} năm trước`;
  }

  /**
   * Relative phrase for a moment `ms` milliseconds in the FUTURE ("Sắp tới", "Trong 5 phút"…).
   * @param {number} ms
   * @returns {string}
   */
  static _toRelativeFuture(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return 'Sắp tới';
    if (minutes < 60) return `Trong ${minutes} phút`;
    if (hours < 24) return `Trong ${hours} giờ`;
    if (days < 30) return `Trong ${days} ngày`;
    if (days < 365) return `Trong ${Math.floor(days / 30)} tháng`;
    return `Trong ${Math.floor(days / 365)} năm`;
  }

  /**
   * Convert date with mode option (wrapper method).
   * @param {string|number|Date} dateInput - Date input
   * @param {Object} options
   * @param {string} options.mode - 'absolute' or 'relative' (default: 'absolute')
   * @param {string} options.format - Format string for absolute mode
   * @returns {string} Formatted date string
   */
  static convert(dateInput, options = {}) {
    const { mode = 'absolute', format = 'DD/MM/YYYY - HH:mm' } = options;

    if (mode === 'relative') {
      return TdDateTime.toRelative(dateInput);
    }

    return TdDateTime.toAbsolute(dateInput, format);
  }

  /**
   * Convert formatted date string back to ISO 8601 format.
   * @param {string} formattedDate - Formatted date string (e.g., "12/08/2025 - 11:36")
   * @param {string} inputFormat - Format of input string (default: 'DD/MM/YYYY - HH:mm')
   * @returns {string} ISO 8601 string or empty string if invalid
   */
  static toISO(formattedDate, inputFormat = 'DD/MM/YYYY - HH:mm') {
    if (!formattedDate || typeof formattedDate !== 'string') return '';

    try {
      // Build regex pattern and track token order
      let regexPattern = '';
      const tokenOrder = [];
      let i = 0;

      while (i < inputFormat.length) {
        if (inputFormat.substr(i, 4) === 'YYYY') {
          regexPattern += '(\\d{4})';
          tokenOrder.push({ type: 'YYYY', index: tokenOrder.length + 1 });
          i += 4;
        } else if (inputFormat.substr(i, 2) === 'DD') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'DD', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'MM') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'MM', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'YY') {
          regexPattern += '(\\d{2})';
          tokenOrder.push({ type: 'YY', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'HH') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'HH', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'hh') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'hh', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'mm') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'mm', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'ss') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'ss', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat[i] === 'A' || inputFormat[i] === 'a') {
          regexPattern += '(AM|PM|am|pm)';
          tokenOrder.push({ type: inputFormat[i], index: tokenOrder.length + 1 });
          i += 1;
        } else {
          const char = inputFormat[i];
          regexPattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          i += 1;
        }
      }

      const match = formattedDate.match(new RegExp('^' + regexPattern + '$'));
      if (!match) return '';

      // Extract values based on token order
      let day = null, month = null, year = null, hours = null, minutes = null, seconds = 0, ampm = null;

      tokenOrder.forEach(token => {
        const value = match[token.index];
        if (!value) return;

        switch (token.type) {
          case 'DD':
            day = parseInt(value, 10);
            break;
          case 'MM':
            month = parseInt(value, 10);
            break;
          case 'YYYY':
            year = parseInt(value, 10);
            break;
          case 'YY': {
            const yy = parseInt(value, 10);
            year = yy < 50 ? 2000 + yy : 1900 + yy;
            break;
          }
          case 'HH':
            hours = parseInt(value, 10);
            break;
          case 'hh':
            hours = parseInt(value, 10);
            break;
          case 'mm':
            minutes = parseInt(value, 10);
            break;
          case 'ss':
            seconds = parseInt(value, 10);
            break;
          case 'A':
          case 'a':
            ampm = value.toUpperCase();
            break;
        }
      });

      // Validate required fields
      if (day === null || month === null || year === null || hours === null || minutes === null) {
        return '';
      }

      // Handle 12-hour format with AM/PM
      if (ampm) {
        if (ampm === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0;
        }
      }

      // Validate ranges
      if (day < 1 || day > 31 || month < 1 || month > 12 ||
          hours < 0 || hours > 23 || minutes < 0 || minutes > 59 ||
          seconds < 0 || seconds > 59) {
        return '';
      }

      // Create Date object in local timezone
      const localDate = new Date(year, month - 1, day, hours, minutes, seconds);

      // Validate date (e.g., Feb 30 is invalid)
      if (localDate.getFullYear() !== year ||
          localDate.getMonth() !== month - 1 ||
          localDate.getDate() !== day ||
          localDate.getHours() !== hours ||
          localDate.getMinutes() !== minutes) {
        return '';
      }

      return localDate.toISOString();
    } catch (error) {
      return '';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pure date-time PARTS helpers (plan v0.10.0-batch4 D6) — used by td-datetime-picker. No Date-string parsing (engine-
// dependent), no time zone: a "parts" object is a local wall-clock value `{ day, month, year, hour, minute }`.
// Parsers are SYNTACTIC (strict regexes, numbers only); range/calendar checks live in `invalidReason`/`isValidParts`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ day: number, month: number, year: number, hour: number, minute: number }} DateTimeParts
 */

const RE_DISPLAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{1,2})$/;
const RE_DISPLAY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RE_DB = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
const RE_ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const RE_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const toInt = (s) => parseInt(s, 10);
const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');
const mkParts = (year, month, day, hour, minute) => ({
  day: toInt(day), month: toInt(month), year: toInt(year), hour: toInt(hour), minute: toInt(minute),
});

/**
 * Parse the display format `dd/mm/yyyy - hh:mm` (1–2 digit day/month/hour/minute, 4-digit year). Syntactic only.
 * @param {unknown} str
 * @returns {DateTimeParts|null}
 */
export function parseDisplay(str) {
  const m = typeof str === 'string' ? RE_DISPLAY.exec(str) : null;
  return m ? mkParts(m[3], m[2], m[1], m[4], m[5]) : null;
}

/**
 * Parse the DB format `yyyy-mm-dd hh:mm[:ss]` (seconds accepted when 00–59, then dropped). Syntactic only.
 * @param {unknown} str
 * @returns {DateTimeParts|null}
 */
export function parseDb(str) {
  const m = typeof str === 'string' ? RE_DB.exec(str) : null;
  if (!m || (m[6] !== undefined && toInt(m[6]) > 59)) return null;
  return mkParts(m[1], m[2], m[3], m[4], m[5]);
}

/**
 * Parse a local ISO 8601 date-time without zone `yyyy-mm-ddThh:mm[:ss]` (what the picker submits). Syntactic only.
 * @param {unknown} str
 * @returns {DateTimeParts|null}
 */
export function parseIsoLocal(str) {
  const m = typeof str === 'string' ? RE_ISO_LOCAL.exec(str) : null;
  if (!m || (m[6] !== undefined && toInt(m[6]) > 59)) return null;
  return mkParts(m[1], m[2], m[3], m[4], m[5]);
}

/** Days in `month` (1–12) of `year` (proleptic Gregorian). */
export function daysInMonth(year, month) {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Why `p` is not a real wall-clock value, or null when it is valid.
 * @param {Partial<DateTimeParts>|null|undefined} p
 * @returns {null|'incomplete'|'day'|'month'|'year'|'hour'|'minute'|'date'}
 */
export function invalidReason(p) {
  if (!p) return 'incomplete';
  const { day, month, year, hour, minute } = p;
  if (![day, month, year, hour, minute].every(Number.isInteger)) return 'incomplete';
  if (day < 1 || day > 31) return 'day';
  if (month < 1 || month > 12) return 'month';
  if (year < 1 || year > 9999) return 'year';
  if (hour < 0 || hour > 23) return 'hour';
  if (minute < 0 || minute > 59) return 'minute';
  if (day > daysInMonth(year, month)) return 'date';
  return null;
}

/**
 * True when `p` is a real calendar date (leap years included) with hour 0–23 and minute 0–59.
 * @param {Partial<DateTimeParts>|null|undefined} p
 */
export function isValidParts(p) {
  return invalidReason(p) === null;
}

/** `dd/mm/yyyy - hh:mm` @param {DateTimeParts} p */
export function formatDisplay(p) {
  return `${pad2(p.day)}/${pad2(p.month)}/${pad4(p.year)} - ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** `yyyy-mm-dd hh:mm:00` @param {DateTimeParts} p */
export function formatDb(p) {
  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:00`;
}

/** `yyyy-mm-ddThh:mm:00` (local, no zone) @param {DateTimeParts} p */
export function formatIsoLocal(p) {
  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00`;
}

/**
 * Order two valid parts objects: negative when `a` is earlier, 0 when equal, positive when later.
 * @param {DateTimeParts} a
 * @param {DateTimeParts} b
 */
export function compareParts(a, b) {
  const key = (p) => (((p.year * 100 + p.month) * 100 + p.day) * 100 + p.hour) * 100 + p.minute;
  return key(a) - key(b);
}

/**
 * Parse a `min`/`max` bound: the display format or ISO-local, each with or without a time. A DATE-ONLY bound expands
 * to the whole day — `00:00` for `min`, `23:59` for `max` (D5); an explicit time is exact. Invalid → null.
 * @param {unknown} str
 * @param {'min'|'max'} kind
 * @returns {DateTimeParts|null}
 */
export function parseBound(str, kind) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  let p = parseDisplay(s) || parseIsoLocal(s);
  if (!p) {
    const d = RE_DISPLAY_DATE.exec(s);
    const i = d ? null : RE_ISO_DATE.exec(s);
    const ymd = d ? [d[3], d[2], d[1]] : i ? [i[1], i[2], i[3]] : null;
    if (ymd) p = kind === 'max' ? mkParts(...ymd, 23, 59) : mkParts(...ymd, 0, 0);
  }
  if (!p) { // v0.18.0: a month (`mm/yyyy` | `yyyy-mm`) or a year (`yyyy`) covers its whole period
    const m = RE_DISPLAY_MONTH.exec(s) || RE_ISO_MONTH.exec(s);
    const ym = m ? (m[0].includes('/') ? [m[2], m[1]] : [m[1], m[2]]) : null;
    const y = ym ? null : RE_YEAR.exec(s);
    const year = ym ? toInt(ym[0]) : y ? toInt(y[1]) : NaN;
    const month = ym ? toInt(ym[1]) : NaN;
    if (ym && month >= 1 && month <= 12 && year >= 1) {
      p = kind === 'max' ? mkParts(year, month, daysInMonth(year, month), 23, 59) : mkParts(year, month, 1, 0, 0);
    } else if (y) {
      p = kind === 'max' ? mkParts(year, 12, 31, 23, 59) : mkParts(year, 1, 1, 0, 0);
    }
  }
  return p && isValidParts(p) ? p : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Picker MODES (plan v0.18.0 F3): datetime (default) | date | month | year. A mode's value only carries its own
// components; the parts object stays complete — components outside the mode hold fixed defaults (month 1, day 1,
// 00:00) so validation / comparison work unchanged. `datetime` delegates to the functions above (v0.17.0 output).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const RE_DISPLAY_MONTH = /^(\d{1,2})\/(\d{4})$/;
const RE_ISO_MONTH = /^(\d{4})-(\d{2})$/;
const RE_YEAR = /^(\d{4})$/;

/** @typedef {'datetime'|'date'|'month'|'year'} PickerMode */

export const PICKER_MODES = ['datetime', 'date', 'month', 'year'];

/** Components each mode carries, coarsest last. */
export const MODE_PARTS = {
  datetime: ['day', 'month', 'year', 'hour', 'minute'],
  date: ['day', 'month', 'year'],
  month: ['month', 'year'],
  year: ['year'],
};

/** @param {unknown} v @returns {PickerMode} unknown / missing → 'datetime' */
export function normalizeMode(v) {
  return PICKER_MODES.includes(v) ? /** @type {PickerMode} */ (v) : 'datetime';
}

/**
 * Keep the components of `mode`; the others get the fixed defaults (day 1, month 1, 00:00).
 * @param {DateTimeParts} p
 * @param {unknown} mode
 * @returns {DateTimeParts}
 */
export function toModeParts(p, mode) {
  const keep = MODE_PARTS[normalizeMode(mode)];
  const def = { day: 1, month: 1, year: p.year, hour: 0, minute: 0 };
  const out = {};
  for (const k of ['day', 'month', 'year', 'hour', 'minute']) out[k] = keep.includes(k) ? p[k] : def[k];
  return /** @type {DateTimeParts} */ (out);
}

/**
 * Parse a value of `mode`: its display format or its ISO format (syntactic only).
 * datetime `dd/mm/yyyy - hh:mm` | `yyyy-mm-ddThh:mm[:ss]`; date `dd/mm/yyyy` | `yyyy-mm-dd`;
 * month `mm/yyyy` | `yyyy-mm`; year `yyyy`.
 * @param {unknown} str
 * @param {unknown} mode
 * @returns {DateTimeParts|null}
 */
export function parseModeValue(str, mode) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  switch (normalizeMode(mode)) {
    case 'date': {
      const d = RE_DISPLAY_DATE.exec(s);
      if (d) return mkParts(d[3], d[2], d[1], 0, 0);
      const i = RE_ISO_DATE.exec(s);
      return i ? mkParts(i[1], i[2], i[3], 0, 0) : null;
    }
    case 'month': {
      const d = RE_DISPLAY_MONTH.exec(s);
      if (d) return mkParts(d[2], d[1], 1, 0, 0);
      const i = RE_ISO_MONTH.exec(s);
      return i ? mkParts(i[1], i[2], 1, 0, 0) : null;
    }
    case 'year': {
      const y = RE_YEAR.exec(s);
      return y ? mkParts(y[1], 1, 1, 0, 0) : null;
    }
    default:
      return parseDisplay(s) || parseIsoLocal(s);
  }
}

/**
 * Parse a DB value of `mode` (`yyyy-mm-dd hh:mm[:ss]` | `yyyy-mm-dd` | `yyyy-mm` | `yyyy`); the mode's ISO is accepted too.
 * @param {unknown} str
 * @param {unknown} mode
 * @returns {DateTimeParts|null}
 */
export function parseModeDb(str, mode) {
  const m = normalizeMode(mode);
  if (m === 'datetime') return parseDb(str) || parseIsoLocal(str);
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (m === 'date') {
    const i = RE_ISO_DATE.exec(s);
    return i ? mkParts(i[1], i[2], i[3], 0, 0) : null;
  }
  if (m === 'month') {
    const i = RE_ISO_MONTH.exec(s);
    return i ? mkParts(i[1], i[2], 1, 0, 0) : null;
  }
  const y = RE_YEAR.exec(s);
  return y ? mkParts(y[1], 1, 1, 0, 0) : null;
}

/** Display format of `mode`: `dd/mm/yyyy - hh:mm` | `dd/mm/yyyy` | `mm/yyyy` | `yyyy`. */
export function formatModeDisplay(p, mode) {
  switch (normalizeMode(mode)) {
    case 'date': return `${pad2(p.day)}/${pad2(p.month)}/${pad4(p.year)}`;
    case 'month': return `${pad2(p.month)}/${pad4(p.year)}`;
    case 'year': return pad4(p.year);
    default: return formatDisplay(p);
  }
}

/** DB format of `mode`: `yyyy-mm-dd hh:mm:00` | `yyyy-mm-dd` | `yyyy-mm` | `yyyy`. */
export function formatModeDb(p, mode) {
  const m = normalizeMode(mode);
  return m === 'datetime' ? formatDb(p) : formatModeIso(p, m);
}

/** ISO format of `mode`: `yyyy-mm-ddThh:mm:00` (v0.17.0, unchanged) | `yyyy-mm-dd` | `yyyy-mm` | `yyyy`. */
export function formatModeIso(p, mode) {
  switch (normalizeMode(mode)) {
    case 'date': return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
    case 'month': return `${pad4(p.year)}-${pad2(p.month)}`;
    case 'year': return pad4(p.year);
    default: return formatIsoLocal(p);
  }
}

/**
 * Order two valid parts at the granularity of `mode` (finer components are ignored — `month`: a bound anywhere in
 * June allows June).
 */
export function compareModeParts(a, b, mode) {
  const m = normalizeMode(mode);
  return compareParts(toModeParts(a, m), toModeParts(b, m));
}

/**
 * Normalise a `minute-step` value: an integer 1–30 that divides 60, else 1.
 * @param {unknown} value
 */
export function normalizeMinuteStep(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim() || NaN); // '5.5' / '5junk' → 1
  return Number.isInteger(n) && n > 0 && n <= 30 && 60 % n === 0 ? n : 1;
}

/**
 * Snap a minute DOWN to the step (D7): never carries into the next hour (10:58, step 5 → 10:55).
 * @param {number} minute
 * @param {unknown} step
 */
export function snapMinuteDown(minute, step) {
  const s = normalizeMinuteStep(step);
  return Math.floor(minute / s) * s;
}

/**
 * Local wall-clock parts of a Date.
 * @param {Date} date
 * @returns {DateTimeParts}
 */
export function partsFromDate(date) {
  return {
    day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(),
    hour: date.getHours(), minute: date.getMinutes(),
  };
}

// --- v0.45.0 (plan v0.45.0-steps-timeline QĐ T4): calendar parts of an INSTANT in an IANA time zone ---

/** @type {Map<string, Intl.DateTimeFormat>} one formatter per zone ('' = the runtime's zone) */
const ZONED_FORMATS = new Map();
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** @param {string} tz '' = the runtime's zone */
function zonedFormat(tz) {
  let f = ZONED_FORMATS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      ...(tz ? { timeZone: tz } : {}),
      hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
    if (ZONED_FORMATS.size > 64) ZONED_FORMATS.clear(); // bounded (a hostile caller cycling names)
    ZONED_FORMATS.set(tz, f);
  }
  return f;
}

/**
 * Is `name` an IANA time zone name this runtime knows (`Asia/Ho_Chi_Minh`, `UTC`, `Europe/Berlin`)? Offsets (`+07:00`),
 * empty / non-strings and names the runtime's ICU rejects → false. (PHP accepts DateTimeZone::listIdentifiers() only —
 * plan QĐ T4.)
 * @param {unknown} name
 * @returns {boolean}
 */
export function isTimeZone(name) {
  if (typeof name !== 'string' || name.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(name)) return false;
  try {
    zonedFormat(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wall-clock parts of an instant in `timeZone` (IANA; '' / omitted = the runtime's zone) — Intl formatToParts, never
 * the machine's local time (partsFromDate) nor UTC (`toISOString().slice(0, 10)` — the dcms2 bug).
 * @param {number|Date} instant epoch ms or a Date
 * @param {string} [timeZone]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, weekday: number }} weekday 0 = Sunday
 */
export function zonedParts(instant, timeZone = '') {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, weekday: 0 };
  for (const p of zonedFormat(timeZone || '').formatToParts(ms)) {
    if (p.type === 'weekday') out.weekday = WEEKDAYS_EN.indexOf(p.value);
    else if (p.type in out) out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0; // engines without hourCycle support
  return out;
}

/**
 * Calendar day of an instant in `timeZone`: `yyyy-mm-dd`.
 * @param {number|Date} instant
 * @param {string} [timeZone]
 */
export function dayKey(instant, timeZone = '') {
  const p = zonedParts(instant, timeZone);
  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
}
