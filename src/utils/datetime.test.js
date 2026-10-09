import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const { TdDateTime } = await import('./datetime.js');

// --- _parseDate tests ---
describe('TdDateTime._parseDate', () => {
  it('parses ISO string', () => {
    const result = TdDateTime._parseDate('2025-08-12T04:36:00Z');
    assert.ok(result instanceof Date);
    assert.equal(result.toISOString(), '2025-08-12T04:36:00.000Z');
  });

  it('parses Unix timestamp in seconds', () => {
    const ts = 1723437360; // 2024-08-12T04:36:00Z
    const result = TdDateTime._parseDate(ts);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), ts * 1000);
  });

  it('parses Unix timestamp in milliseconds', () => {
    const tsMs = 1723437360000;
    const result = TdDateTime._parseDate(tsMs);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), tsMs);
  });

  it('parses Date object', () => {
    const d = new Date('2025-01-15T10:00:00Z');
    const result = TdDateTime._parseDate(d);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), d.getTime());
  });

  it('returns null for invalid Date object', () => {
    assert.equal(TdDateTime._parseDate(new Date('invalid')), null);
  });

  it('returns null for null/undefined/empty', () => {
    assert.equal(TdDateTime._parseDate(null), null);
    assert.equal(TdDateTime._parseDate(undefined), null);
    assert.equal(TdDateTime._parseDate(''), null);
  });

  it('accepts timestamp 0 as 1970-01-01 (v0.16.0 D1)', () => {
    const result = TdDateTime._parseDate(0);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), 0);
    assert.equal(TdDateTime.toAbsolute(0, 'YYYY'), String(new Date(0).getFullYear()));
  });

  it('returns null for invalid string', () => {
    assert.equal(TdDateTime._parseDate('not-a-date'), null);
  });

  it('parses numeric string as Unix timestamp', () => {
    const ts = '1723437360';
    const result = TdDateTime._parseDate(ts);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), 1723437360000);
  });
});

// --- toAbsolute tests ---
describe('TdDateTime.toAbsolute', () => {
  it('formats with default DD/MM/YYYY - HH:mm', () => {
    // Use a fixed UTC date and check local formatting
    const date = new Date('2025-08-12T04:36:00Z');
    const result = TdDateTime.toAbsolute(date, 'DD/MM/YYYY - HH:mm');
    // The local time depends on TZ, so just verify format structure
    assert.match(result, /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/);
  });

  it('formats with hh:mm A for 12-hour time', () => {
    const date = new Date(2025, 7, 12, 15, 30, 0); // 3:30 PM local
    const result = TdDateTime.toAbsolute(date, 'hh:mm A');
    assert.equal(result, '03:30 PM');
  });

  it('formats with hh:mm a for lowercase am/pm', () => {
    const date = new Date(2025, 7, 12, 9, 5, 0); // 9:05 AM local
    const result = TdDateTime.toAbsolute(date, 'hh:mm a');
    assert.equal(result, '09:05 am');
  });

  it('formats YY token correctly', () => {
    const date = new Date(2025, 0, 1, 0, 0, 0);
    const result = TdDateTime.toAbsolute(date, 'YY');
    assert.equal(result, '25');
  });

  it('formats ss token correctly', () => {
    const date = new Date(2025, 0, 1, 10, 20, 5);
    const result = TdDateTime.toAbsolute(date, 'HH:mm:ss');
    assert.equal(result, '10:20:05');
  });

  it('formats with Unix timestamp (seconds)', () => {
    const ts = Math.floor(new Date(2025, 7, 12, 15, 30, 0).getTime() / 1000);
    const result = TdDateTime.toAbsolute(ts, 'hh:mm A');
    assert.equal(result, '03:30 PM');
  });

  it('returns empty string for invalid input', () => {
    assert.equal(TdDateTime.toAbsolute(null), '');
    assert.equal(TdDateTime.toAbsolute('invalid'), '');
    assert.equal(TdDateTime.toAbsolute(undefined), '');
  });

  it('leaves ordinary words alone (v0.16.0 D1)', () => {
    const date = new Date(2025, 7, 12, 15, 30, 0);
    assert.equal(TdDateTime.toAbsolute(date, 'Ngay DD thang MM'), 'Ngay 12 thang 08');
    assert.equal(TdDateTime.toAbsolute(date, 'Ngày DD tháng MM năm YYYY'), 'Ngày 12 tháng 08 năm 2025');
    assert.equal(TdDateTime.toAbsolute(date, 'Class mass DD'), 'Class mass 12');
  });

  it('replaces runs made only of tokens (v0.16.0 D1)', () => {
    const date = new Date(2025, 7, 12, 15, 30, 5);
    assert.equal(TdDateTime.toAbsolute(date, 'YYYYMMDD'), '20250812');
    assert.equal(TdDateTime.toAbsolute(date, 'HHmmss'), '153005');
    assert.equal(TdDateTime.toAbsolute(date, 'DD/MM/YYYY HH:mm'), '12/08/2025 15:30');
  });

  it('emits [bracketed] text verbatim (v0.16.0 D1)', () => {
    const date = new Date(2025, 7, 12, 15, 30, 0);
    assert.equal(TdDateTime.toAbsolute(date, '[Ngày] DD [lúc] HH:mm [DD]'), 'Ngày 12 lúc 15:30 DD');
    assert.equal(TdDateTime.toAbsolute(date, '[a] a'), 'a pm');
  });

  it('does not re-scan substituted values', () => {
    const date = new Date(2025, 7, 12, 9, 0, 0);
    assert.equal(TdDateTime.toAbsolute(date, 'A a'), 'AM am');
  });

  it('handles midnight (00:00) correctly for 12-hour format', () => {
    const date = new Date(2025, 0, 1, 0, 0, 0); // midnight
    const result = TdDateTime.toAbsolute(date, 'hh:mm A');
    assert.equal(result, '12:00 AM');
  });

  it('handles noon (12:00) correctly for 12-hour format', () => {
    const date = new Date(2025, 0, 1, 12, 0, 0); // noon
    const result = TdDateTime.toAbsolute(date, 'hh:mm A');
    assert.equal(result, '12:00 PM');
  });
});

// --- toRelative tests ---
describe('TdDateTime.toRelative', () => {
  it('returns "Vừa xong" for < 60 seconds ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    assert.equal(TdDateTime.toRelative(date), 'Vừa xong');
  });

  it('the clock-skew tolerance is strictly below 60 s (exactly 60 s ahead is future)', () => {
    const fixed = Date.UTC(2026, 0, 1, 12, 0, 0);
    mock.timers.enable({ apis: ['Date'], now: fixed });
    try {
      assert.equal(TdDateTime.toRelative(new Date(fixed + 59999)), 'Vừa xong');
      assert.equal(TdDateTime.toRelative(new Date(fixed + 60000)), 'Trong 1 phút');
    } finally {
      mock.timers.reset();
    }
  });

  it('describes future moments instead of "Vừa xong" (v0.16.0 D1)', () => {
    const now = Date.now();
    assert.equal(TdDateTime.toRelative(new Date(now + 20 * 1000)), 'Vừa xong', 'clock skew tolerance < 60 s');
    assert.equal(TdDateTime.toRelative(new Date(now + 90 * 1000)), 'Trong 1 phút');
    assert.equal(TdDateTime.toRelative(new Date(now + (5 * 60 + 30) * 1000)), 'Trong 5 phút');
    assert.equal(TdDateTime.toRelative(new Date(now + (3 * 60 + 10) * 60 * 1000)), 'Trong 3 giờ');
    assert.equal(TdDateTime.toRelative(new Date(now + (2 * 24 + 1) * 3600 * 1000)), 'Trong 2 ngày');
    assert.equal(TdDateTime.toRelative(new Date(now + 65 * 24 * 3600 * 1000)), 'Trong 2 tháng');
    assert.equal(TdDateTime.toRelative(new Date(now + 800 * 24 * 3600 * 1000)), 'Trong 2 năm');
  });

  it('returns "X phút trước" for minutes ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    assert.equal(TdDateTime.toRelative(date), '5 phút trước');
  });

  it('returns "X giờ trước" for hours ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    assert.equal(TdDateTime.toRelative(date), '2 giờ trước');
  });

  it('returns "Hơn X giờ trước" when >= 30 min remainder', () => {
    const now = new Date();
    const date = new Date(now.getTime() - (2 * 60 + 35) * 60 * 1000); // 2h 35m ago
    assert.equal(TdDateTime.toRelative(date), 'Hơn 2 giờ trước');
  });

  it('returns "X ngày trước" for days ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    assert.equal(TdDateTime.toRelative(date), '3 ngày trước');
  });

  it('returns "Hơn X ngày trước" when >= 12h remainder', () => {
    const now = new Date();
    const date = new Date(now.getTime() - (3 * 24 + 14) * 60 * 60 * 1000); // 3d 14h ago
    assert.equal(TdDateTime.toRelative(date), 'Hơn 3 ngày trước');
  });

  it('returns "X tháng trước" for months ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 2 * 30 * 24 * 60 * 60 * 1000); // ~2 months ago
    assert.equal(TdDateTime.toRelative(date), '2 tháng trước');
  });

  it('returns "Hơn X tháng trước" when >= 15d remainder', () => {
    const now = new Date();
    const date = new Date(now.getTime() - (2 * 30 + 17) * 24 * 60 * 60 * 1000); // 2 months 17 days
    assert.equal(TdDateTime.toRelative(date), 'Hơn 2 tháng trước');
  });

  it('returns "X năm trước" for years ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 1 * 365 * 24 * 60 * 60 * 1000); // ~1 year ago
    assert.equal(TdDateTime.toRelative(date), '1 năm trước');
  });

  it('returns "Hơn X năm trước" when >= 6mo remainder', () => {
    const now = new Date();
    const date = new Date(now.getTime() - (365 + 200) * 24 * 60 * 60 * 1000); // 1 year 200 days
    assert.equal(TdDateTime.toRelative(date), 'Hơn 1 năm trước');
  });

  it('returns empty string for invalid input', () => {
    assert.equal(TdDateTime.toRelative(null), '');
    assert.equal(TdDateTime.toRelative('invalid'), '');
  });
});

// --- toISO tests ---
describe('TdDateTime.toISO', () => {
  it('parses DD/MM/YYYY - HH:mm format', () => {
    const result = TdDateTime.toISO('12/08/2025 - 11:36', 'DD/MM/YYYY - HH:mm');
    assert.ok(result.length > 0, 'Should return non-empty ISO string');
    const parsed = new Date(result);
    assert.equal(parsed.getDate(), 12);
    assert.equal(parsed.getMonth(), 7); // August = 7
    assert.equal(parsed.getFullYear(), 2025);
    assert.equal(parsed.getHours(), 11);
    assert.equal(parsed.getMinutes(), 36);
  });

  it('parses YYYY-MM-DD HH:mm format', () => {
    const result = TdDateTime.toISO('2025-08-12 11:36', 'YYYY-MM-DD HH:mm');
    assert.ok(result.length > 0);
    const parsed = new Date(result);
    assert.equal(parsed.getFullYear(), 2025);
    assert.equal(parsed.getMonth(), 7);
    assert.equal(parsed.getDate(), 12);
  });

  it('returns empty string for invalid formatted date', () => {
    assert.equal(TdDateTime.toISO('not-a-date', 'DD/MM/YYYY - HH:mm'), '');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(TdDateTime.toISO(null), '');
    assert.equal(TdDateTime.toISO(undefined), '');
    assert.equal(TdDateTime.toISO(''), '');
  });

  it('handles 12-hour format with AM/PM', () => {
    const result = TdDateTime.toISO('12/08/2025 02:30 PM', 'DD/MM/YYYY hh:mm A');
    assert.ok(result.length > 0);
    const parsed = new Date(result);
    assert.equal(parsed.getHours(), 14); // 2 PM = 14
    assert.equal(parsed.getMinutes(), 30);
  });

  it('rejects invalid date like Feb 30', () => {
    assert.equal(TdDateTime.toISO('30/02/2025 - 10:00', 'DD/MM/YYYY - HH:mm'), '');
  });
});

// --- convert tests ---
describe('TdDateTime.convert', () => {
  it('delegates to toRelative when mode is relative', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 30 * 1000);
    const result = TdDateTime.convert(date, { mode: 'relative' });
    assert.equal(result, 'Vừa xong');
  });

  it('delegates to toAbsolute when mode is absolute', () => {
    const date = new Date(2025, 7, 12, 15, 30, 0);
    const result = TdDateTime.convert(date, { mode: 'absolute', format: 'hh:mm A' });
    assert.equal(result, '03:30 PM');
  });

  it('defaults to absolute mode', () => {
    const date = new Date(2025, 7, 12, 15, 30, 0);
    const result = TdDateTime.convert(date, { format: 'hh:mm A' });
    assert.equal(result, '03:30 PM');
  });
});

// --- _pad tests ---
describe('TdDateTime._pad', () => {
  it('pads single digit with leading zero', () => {
    assert.equal(TdDateTime._pad(5), '05');
  });

  it('does not pad double digit', () => {
    assert.equal(TdDateTime._pad(12), '12');
  });

  it('pads with custom length', () => {
    assert.equal(TdDateTime._pad(5, 3), '005');
  });
});

// --- Pure parts helpers (plan v0.10.0-batch4 D6) ---
const dt = await import('./datetime.js');
const P = (day, month, year, hour, minute) => ({ day, month, year, hour, minute });

describe('parseDisplay / parseDb / parseIsoLocal', () => {
  it('parses the display format (1–2 digit fields)', () => {
    assert.deepEqual(dt.parseDisplay('15/06/2026 - 10:30'), P(15, 6, 2026, 10, 30));
    assert.deepEqual(dt.parseDisplay('5/6/2026-9:05'), P(5, 6, 2026, 9, 5));
  });
  it('display is syntactic: out-of-range numbers parse, invalidReason catches them', () => {
    const p = dt.parseDisplay('15/06/2026 - 25:99');
    assert.deepEqual(p, P(15, 6, 2026, 25, 99));
    assert.equal(dt.invalidReason(p), 'hour');
    assert.equal(dt.isValidParts(p), false);
  });
  it('rejects malformed strings and non-strings', () => {
    for (const s of ['garbage', '', '15/06/26 - 10:30', '15/06/2026', ' 15/06/2026 - 10:30', '15/06/2026 - 10:30x', null, 42]) {
      assert.equal(dt.parseDisplay(s), null, String(s));
    }
  });
  it('parses the DB format (space, optional seconds) without Date', () => {
    assert.deepEqual(dt.parseDb('2026-06-15 10:30:00'), P(15, 6, 2026, 10, 30));
    assert.deepEqual(dt.parseDb('2026-06-15 10:30'), P(15, 6, 2026, 10, 30));
    assert.equal(dt.parseDb('2026-06-15T10:30:00'), null);
    assert.equal(dt.parseDb('2026-06-15 10:30:60'), null);
    assert.equal(dt.parseDb('garbage'), null);
    assert.equal(dt.parseDb(undefined), null);
  });
  it('parses ISO-local (T, optional seconds, no zone)', () => {
    assert.deepEqual(dt.parseIsoLocal('2026-06-15T10:30:00'), P(15, 6, 2026, 10, 30));
    assert.deepEqual(dt.parseIsoLocal('2026-06-15T10:30'), P(15, 6, 2026, 10, 30));
    assert.equal(dt.parseIsoLocal('2026-06-15T10:30:00Z'), null);
    assert.equal(dt.parseIsoLocal('2026-06-15 10:30'), null);
  });
});

describe('invalidReason / isValidParts', () => {
  it('accepts real dates incl. 29/02 in leap years', () => {
    assert.equal(dt.isValidParts(P(29, 2, 2024, 0, 0)), true);
    assert.equal(dt.isValidParts(P(29, 2, 2000, 23, 59)), true);
    assert.equal(dt.isValidParts(P(31, 12, 2099, 23, 59)), true);
  });
  it('names the failing part', () => {
    assert.equal(dt.invalidReason(P(29, 2, 2026, 0, 0)), 'date');
    assert.equal(dt.invalidReason(P(29, 2, 1900, 0, 0)), 'date');
    assert.equal(dt.invalidReason(P(31, 4, 2026, 0, 0)), 'date');
    assert.equal(dt.invalidReason(P(0, 1, 2026, 0, 0)), 'day');
    assert.equal(dt.invalidReason(P(32, 1, 2026, 0, 0)), 'day');
    assert.equal(dt.invalidReason(P(1, 13, 2026, 0, 0)), 'month');
    assert.equal(dt.invalidReason(P(1, 1, 0, 0, 0)), 'year');
    assert.equal(dt.invalidReason(P(1, 1, 2026, 24, 0)), 'hour');
    assert.equal(dt.invalidReason(P(1, 1, 2026, 0, 60)), 'minute');
    assert.equal(dt.invalidReason(P(NaN, 1, 2026, 0, 0)), 'incomplete');
    assert.equal(dt.invalidReason(null), 'incomplete');
  });
});

describe('formatDisplay / formatDb / formatIsoLocal', () => {
  const p = P(5, 6, 2026, 9, 5);
  it('pads every field', () => {
    assert.equal(dt.formatDisplay(p), '05/06/2026 - 09:05');
    assert.equal(dt.formatDb(p), '2026-06-05 09:05:00');
    assert.equal(dt.formatIsoLocal(p), '2026-06-05T09:05:00');
  });
  it('round-trips through the parsers', () => {
    assert.deepEqual(dt.parseDisplay(dt.formatDisplay(p)), p);
    assert.deepEqual(dt.parseDb(dt.formatDb(p)), p);
    assert.deepEqual(dt.parseIsoLocal(dt.formatIsoLocal(p)), p);
  });
});

describe('compareParts / parseBound (D5)', () => {
  it('orders parts', () => {
    assert.ok(dt.compareParts(P(1, 1, 2026, 0, 0), P(31, 12, 2025, 23, 59)) > 0);
    assert.ok(dt.compareParts(P(1, 1, 2026, 10, 0), P(1, 1, 2026, 10, 1)) < 0);
    assert.equal(dt.compareParts(P(1, 1, 2026, 10, 0), P(1, 1, 2026, 10, 0)), 0);
  });
  it('date-only bounds expand to 00:00 (min) and 23:59 (max)', () => {
    assert.deepEqual(dt.parseBound('2026-06-15', 'min'), P(15, 6, 2026, 0, 0));
    assert.deepEqual(dt.parseBound('2026-06-15', 'max'), P(15, 6, 2026, 23, 59));
    assert.deepEqual(dt.parseBound('15/06/2026', 'min'), P(15, 6, 2026, 0, 0));
    assert.deepEqual(dt.parseBound('15/06/2026', 'max'), P(15, 6, 2026, 23, 59));
  });
  it('explicit times are exact (display and ISO-local)', () => {
    assert.deepEqual(dt.parseBound('15/06/2026 - 10:30', 'max'), P(15, 6, 2026, 10, 30));
    assert.deepEqual(dt.parseBound('2026-06-15T10:30', 'min'), P(15, 6, 2026, 10, 30));
    assert.deepEqual(dt.parseBound(' 2026-06-15T10:30:00 ', 'max'), P(15, 6, 2026, 10, 30));
  });
  it('invalid bounds → null', () => {
    for (const s of ['2026-02-30', '31/04/2026', 'soon', '', '2026-06-15 25:00', null]) {
      assert.equal(dt.parseBound(s, 'min'), null, String(s));
    }
  });
});

describe('picker modes (v0.18.0 F3)', () => {
  it('normalizeMode: unknown → datetime', () => {
    for (const m of ['datetime', 'date', 'month', 'year']) assert.equal(dt.normalizeMode(m), m);
    for (const m of [null, undefined, '', 'Date', 'week']) assert.equal(dt.normalizeMode(m), 'datetime');
  });
  it('parseBound: month and year bounds cover their whole period', () => {
    assert.deepEqual(dt.parseBound('2024-02', 'min'), P(1, 2, 2024, 0, 0));
    assert.deepEqual(dt.parseBound('02/2024', 'max'), P(29, 2, 2024, 23, 59));
    assert.deepEqual(dt.parseBound('1950', 'min'), P(1, 1, 1950, 0, 0));
    assert.deepEqual(dt.parseBound('1950', 'max'), P(31, 12, 1950, 23, 59));
    for (const s of ['2024-13', '13/2024', '0000', '195']) assert.equal(dt.parseBound(s, 'min'), null, s);
  });
  it('the value contract table (display / db / iso) per mode', () => {
    const p = P(15, 6, 1985, 10, 45);
    const want = {
      datetime: ['15/06/1985 - 10:45', '1985-06-15 10:45:00', '1985-06-15T10:45:00'],
      date: ['15/06/1985', '1985-06-15', '1985-06-15'],
      month: ['06/1985', '1985-06', '1985-06'],
      year: ['1985', '1985', '1985'],
    };
    for (const [mode, [display, db, iso]] of Object.entries(want)) {
      assert.equal(dt.formatModeDisplay(p, mode), display, mode);
      assert.equal(dt.formatModeDb(p, mode), db, mode);
      assert.equal(dt.formatModeIso(p, mode), iso, mode);
    }
    // datetime iso stays EXACTLY the v0.17.0 string
    assert.equal(dt.formatModeIso(p, 'datetime'), dt.formatIsoLocal(p));
  });
  it('parseModeValue: display or ISO of the mode; other shapes → null', () => {
    assert.deepEqual(dt.parseModeValue('15/06/1985 - 10:45', 'datetime'), P(15, 6, 1985, 10, 45));
    assert.deepEqual(dt.parseModeValue('1985-06-15T10:45', 'datetime'), P(15, 6, 1985, 10, 45));
    assert.deepEqual(dt.parseModeValue('15/06/1985', 'date'), P(15, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeValue('1985-06-15', 'date'), P(15, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeValue('06/1985', 'month'), P(1, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeValue('1985-06', 'month'), P(1, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeValue('1985', 'year'), P(1, 1, 1985, 0, 0));
    assert.equal(dt.parseModeValue('15/06/1985', 'datetime'), null);
    assert.equal(dt.parseModeValue('15/06/1985 - 10:45', 'date'), null);
    assert.equal(dt.parseModeValue('1985-06-15', 'month'), null);
    assert.equal(dt.parseModeValue('06/1985', 'year'), null);
    assert.equal(dt.parseModeValue(1985, 'year'), null);
  });
  it('parseModeDb: db (= iso) of the mode', () => {
    assert.deepEqual(dt.parseModeDb('1985-06-15 10:45:00', 'datetime'), P(15, 6, 1985, 10, 45));
    assert.deepEqual(dt.parseModeDb('1985-06-15', 'date'), P(15, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeDb('1985-06', 'month'), P(1, 6, 1985, 0, 0));
    assert.deepEqual(dt.parseModeDb('1985', 'year'), P(1, 1, 1985, 0, 0));
    assert.equal(dt.parseModeDb('15/06/1985', 'date'), null);
  });
  it('toModeParts: components outside the mode get month 1 / day 1 / 00:00', () => {
    const p = P(15, 6, 1985, 10, 45);
    assert.deepEqual(dt.toModeParts(p, 'datetime'), p);
    assert.deepEqual(dt.toModeParts(p, 'date'), P(15, 6, 1985, 0, 0));
    assert.deepEqual(dt.toModeParts(p, 'month'), P(1, 6, 1985, 0, 0));
    assert.deepEqual(dt.toModeParts(p, 'year'), P(1, 1, 1985, 0, 0));
  });
  it('compareModeParts ignores components finer than the mode', () => {
    assert.equal(dt.compareModeParts(P(1, 6, 2024, 0, 0), P(15, 6, 2024, 0, 0), 'month'), 0);
    assert.ok(dt.compareModeParts(P(1, 5, 2024, 0, 0), P(15, 6, 2024, 0, 0), 'month') < 0);
    assert.equal(dt.compareModeParts(P(15, 6, 2024, 0, 0), P(15, 6, 2024, 23, 59), 'date'), 0);
    assert.equal(dt.compareModeParts(P(1, 1, 2024, 0, 0), P(31, 12, 2024, 23, 59), 'year'), 0);
    assert.ok(dt.compareModeParts(P(15, 6, 2024, 0, 0), P(15, 6, 2024, 23, 59), 'datetime') < 0);
  });
});

describe('minute step (D7)', () => {
  it('normalises the step', () => {
    assert.equal(dt.normalizeMinuteStep('5'), 5);
    assert.equal(dt.normalizeMinuteStep(15), 15);
    assert.equal(dt.normalizeMinuteStep('7'), 1);
    assert.equal(dt.normalizeMinuteStep('45'), 1);
    assert.equal(dt.normalizeMinuteStep('0'), 1);
    assert.equal(dt.normalizeMinuteStep(null), 1);
  });
  it('snaps DOWN, never into the next hour', () => {
    assert.equal(dt.snapMinuteDown(58, 5), 55);
    assert.equal(dt.snapMinuteDown(2, 5), 0);
    assert.equal(dt.snapMinuteDown(59, 30), 30);
    assert.equal(dt.snapMinuteDown(7, 1), 7);
  });
  it('partsFromDate reads local wall-clock fields', () => {
    assert.deepEqual(dt.partsFromDate(new Date(2026, 5, 15, 10, 30)), P(15, 6, 2026, 10, 30));
  });
});

// v0.60.0 (plan v0.60.0-calendar-picker B2): without min / max every representable date is valid — years 1–9999. The
// parts helpers never needed the 2000–2099 window (it lived in the picker); these cases lock the whole domain down.
describe('years 1–9999 (v0.60.0 B2)', () => {
  const YEARS = [1, 4, 99, 100, 999, 1000, 1582, 1999, 2100, 9999];
  const y4 = (y) => String(y).padStart(4, '0');

  it('every mode round-trips display ⇄ parts ⇄ ISO / DB with a zero-padded 4-digit year', () => {
    for (const y of YEARS) {
      const Y = y4(y);
      const p = P(15, 3, y, 9, 30);
      assert.equal(dt.formatModeDisplay(p, 'datetime'), `15/03/${Y} - 09:30`);
      assert.equal(dt.formatModeIso(p, 'datetime'), `${Y}-03-15T09:30:00`);
      assert.equal(dt.formatModeDb(p, 'datetime'), `${Y}-03-15 09:30:00`);
      assert.deepEqual(dt.parseModeValue(`15/03/${Y} - 09:30`, 'datetime'), p);
      assert.deepEqual(dt.parseModeValue(`${Y}-03-15T09:30`, 'datetime'), p);
      assert.deepEqual(dt.parseModeDb(`${Y}-03-15 09:30:00`, 'datetime'), p);
      const d = P(15, 3, y, 0, 0);
      assert.equal(dt.formatModeDisplay(d, 'date'), `15/03/${Y}`);
      assert.equal(dt.formatModeIso(d, 'date'), `${Y}-03-15`);
      assert.deepEqual(dt.parseModeValue(`15/03/${Y}`, 'date'), d);
      assert.deepEqual(dt.parseModeValue(`${Y}-03-15`, 'date'), d);
      assert.deepEqual(dt.parseModeDb(`${Y}-03-15`, 'date'), d);
      const m = P(1, 3, y, 0, 0);
      assert.equal(dt.formatModeDisplay(m, 'month'), `03/${Y}`);
      assert.equal(dt.formatModeIso(m, 'month'), `${Y}-03`);
      assert.deepEqual(dt.parseModeValue(`03/${Y}`, 'month'), m);
      assert.deepEqual(dt.parseModeValue(`${Y}-03`, 'month'), m);
      const yr = P(1, 1, y, 0, 0);
      assert.equal(dt.formatModeDisplay(yr, 'year'), Y);
      assert.deepEqual(dt.parseModeValue(Y, 'year'), yr);
      for (const q of [p, d, m, yr]) assert.equal(dt.invalidReason(q), null, `${Y} valid`);
    }
  });

  it('native <input> values: 4-digit years only, zero-padded both ways', () => {
    for (const y of YEARS) {
      const Y = y4(y);
      assert.equal(dt.toNativeValue(P(15, 3, y, 9, 30), 'date'), `${Y}-03-15`);
      assert.equal(dt.toNativeValue(P(15, 3, y, 9, 30), 'datetime'), `${Y}-03-15T09:30`);
      assert.deepEqual(dt.fromNativeValue(`${Y}-03-15`, 'date'), P(15, 3, y, 0, 0));
      assert.deepEqual(dt.fromNativeValue(`${Y}-03-15T09:30`, 'datetime'), P(15, 3, y, 9, 30));
    }
    // what a native input WITHOUT `max` can hold in Chromium (M0): never taken
    for (const v of ['12026-03-15', '202600-03-15', '0000-03-15', '999-03-15']) assert.equal(dt.fromNativeValue(v, 'date'), null, v);
    assert.equal(dt.fromNativeValue('12026-03-15T09:30', 'datetime'), null);
  });

  it('year 0, 3-digit and 5-digit years are refused; the limits are 0001-01-01 and 9999-12-31', () => {
    assert.equal(dt.invalidReason(P(15, 3, 0, 0, 0)), 'year');
    assert.equal(dt.invalidReason(P(15, 3, 10000, 0, 0)), 'year');
    assert.deepEqual(dt.parseModeValue('15/03/0000', 'date'), P(15, 3, 0, 0, 0)); // syntactic; invalidReason flags it
    for (const s of ['15/3/999', '15/03/12026', '999-03-15', '12026-03-15']) assert.equal(dt.parseModeValue(s, 'date'), null, s);
    assert.equal(dt.parseModeValue('999', 'year'), null);
    assert.equal(dt.parseModeValue('10000', 'year'), null);
    assert.equal(dt.invalidReason(P(1, 1, 1, 0, 0)), null);
    assert.equal(dt.invalidReason(P(31, 12, 9999, 23, 59)), null);
  });

  it('leap years across the domain (proleptic Gregorian)', () => {
    for (const [y, days] of [[4, 29], [100, 28], [400, 29], [1900, 28], [2000, 29], [2024, 29], [2100, 28], [9996, 29], [9999, 28], [1, 28]]) {
      assert.equal(dt.daysInMonth(y, 2), days, `02/${y}`);
      assert.equal(dt.invalidReason(P(29, 2, y, 0, 0)), days === 29 ? null : 'date', `29/02/${y}`);
    }
  });

  it('bounds: min / max of any year, compared at the mode granularity; year 0 is no bound', () => {
    assert.deepEqual(dt.parseBound('0001-01-01', 'min'), P(1, 1, 1, 0, 0));
    assert.deepEqual(dt.parseBound('9999-12-31', 'max'), P(31, 12, 9999, 23, 59));
    assert.deepEqual(dt.parseBound('31/12/0999', 'max'), P(31, 12, 999, 23, 59));
    assert.deepEqual(dt.parseBound('0001', 'min'), P(1, 1, 1, 0, 0));
    assert.deepEqual(dt.parseBound('9999', 'max'), P(31, 12, 9999, 23, 59));
    assert.deepEqual(dt.parseBound('02/0004', 'max'), P(29, 2, 4, 23, 59));
    assert.equal(dt.parseBound('0000', 'min'), null);
    assert.equal(dt.parseBound('0000-01-01', 'min'), null);
    assert.ok(dt.compareParts(P(1, 1, 1, 0, 0), P(31, 12, 9999, 23, 59)) < 0);
    assert.ok(dt.compareModeParts(P(31, 12, 999, 23, 59), P(1, 1, 1000, 0, 0), 'date') < 0);
    assert.equal(dt.compareModeParts(P(31, 12, 9999, 23, 59), P(1, 1, 9999, 0, 0), 'year'), 0);
  });
});

describe('parseTypedValue (v0.63.0 § C — typed dates)', () => {
  const T = dt.parseTypedValue;
  it('date: separators / . - space, 8 digits, ISO — all read as the same day', () => {
    for (const s of ['15/3/1994', '15/03/1994', '15-3-1994', '15.3.1994', '15 3 1994', '15031994', '1994-03-15', '1994-3-15',
      '  15 / 03 / 1994  ', '15  3   1994', '15/3-1994']) {
      assert.deepEqual(T(s, 'date'), P(15, 3, 1994, 0, 0), s);
    }
  });
  it('date: a 2-digit year, a 5-digit year, garbage, a time, wrong digit counts → null (format error)', () => {
    for (const s of ['15/3/94', '15/03/94', '150394', '15/3/19945', '150319945', 'abc', '', '   ', '15/3', '1994', '1503199',
      '15/03/1994 09:05', '1994/03/15', '15//3/1994', '15/3/1994x', 'x15/3/1994', '١٥/٣/١٩٩٤']) {
      assert.equal(T(s, 'date'), null, s);
    }
    for (const v of [null, undefined, 15031994, {}]) assert.equal(T(v, 'date'), null);
  });
  it('date: impossible days are READ (invalidReason says why) — 29/02 leap / not leap, 00/.., month 13, year 0000', () => {
    assert.equal(dt.invalidReason(T('29/02/1996', 'date')), null);
    assert.equal(dt.invalidReason(T('29/02/2000', 'date')), null);
    assert.equal(dt.invalidReason(T('29/02/1994', 'date')), 'date');
    assert.equal(dt.invalidReason(T('29/02/1900', 'date')), 'date');
    assert.equal(dt.invalidReason(T('31/02/1994', 'date')), 'date');
    assert.equal(dt.invalidReason(T('00/03/1994', 'date')), 'day');
    assert.equal(dt.invalidReason(T('15/00/1994', 'date')), 'month');
    assert.equal(dt.invalidReason(T('15/13/1994', 'date')), 'month');
    assert.equal(dt.invalidReason(T('15/03/0000', 'date')), 'year');
    assert.equal(dt.invalidReason(T('32011994', 'date')), 'day');
  });
  it('datetime: the date + a space / " - " + h:mm | h.mm | hhmm | 9h05; 12 digits; ISO with T', () => {
    for (const s of ['15/3/1994 9:05', '15/03/1994 - 09:05', '15/03/1994 -09:05', '15/03/1994- 09:05', '15.3.1994 9.05',
      '15-3-1994 0905', '15 3 1994 9h05', '15031994 0905', '150319940905', '1994-03-15T09:05', '1994-03-15t09:05',
      '1994-03-15T09:05:30', '1994-03-15 09:05', '  15/03/1994   -   09:05 ']) {
      assert.deepEqual(T(s, 'datetime'), P(15, 3, 1994, 9, 5), s);
    }
  });
  it('datetime: no time → the date with NaN hour / minute (incomplete, never 00:00); a bad time / 2-digit year → null', () => {
    const p = T('15/03/1994', 'datetime');
    assert.equal(p.day, 15); assert.equal(p.month, 3); assert.equal(p.year, 1994);
    assert.ok(Number.isNaN(p.hour) && Number.isNaN(p.minute));
    assert.equal(dt.invalidReason(p), 'incomplete');
    assert.equal(dt.invalidReason(T('15031994', 'datetime')), 'incomplete');
    for (const s of ['15/3/94 9:05', '15/03/1994 9:5', '15/03/1994 905', '15/03/1994-0905', '15/03/1994 09:05:00', '15/03/1994 x',
      '1503199409051', '1994-03-15T09:05:60', '15/03/1994 09:05 PM', 'abc']) {
      assert.equal(T(s, 'datetime'), null, s);
    }
    assert.equal(dt.invalidReason(T('15/03/1994 25:00', 'datetime')), 'hour');
    assert.equal(dt.invalidReason(T('15/03/1994 23:60', 'datetime')), 'minute');
  });
  it('month: m SEP yyyy, 6 digits, ISO; year: 4 digits only', () => {
    for (const s of ['3/1994', '03/1994', '3-1994', '3.1994', '3 1994', '031994', '1994-03', '1994-3']) {
      assert.deepEqual(T(s, 'month'), P(1, 3, 1994, 0, 0), s);
    }
    for (const s of ['3/94', '0394', '15/03/1994', '1994', 'abc']) assert.equal(T(s, 'month'), null, s);
    assert.equal(dt.invalidReason(T('13/1994', 'month')), 'month');
    assert.deepEqual(T(' 1994 ', 'year'), P(1, 1, 1994, 0, 0));
    for (const s of ['94', '19945', '1994-03', 'abc']) assert.equal(T(s, 'year'), null, s);
    assert.equal(dt.invalidReason(T('0000', 'year')), 'year');
  });
  it('every value-attribute format (parseModeValue) is accepted when typed — a kept raw string is never readable by the element', () => {
    for (const [s, mode] of [['15/03/1994 - 9:5', 'datetime'], ['15/03/1994-09:05', 'datetime'], ['1994-03-15T09:05:00', 'datetime'],
      ['15/03/1994', 'date'], ['1994-03-15', 'date'], ['03/1994', 'month'], ['1994-03', 'month'], ['1994', 'year']]) {
      assert.deepEqual(T(s, mode), dt.parseModeValue(s, mode), `${mode} ${s}`);
    }
    for (const mode of ['datetime', 'date', 'month', 'year']) {
      for (const s of ['15/3/94', 'abc', '15/03/1994 9:5', '15031994x', '3/94']) {
        if (T(s, mode) === null) assert.equal(dt.parseModeValue(s, mode), null, `${mode} ${s}`);
      }
    }
  });
  it('the result of a valid typed value formats to the mode display (what the field shows after a commit)', () => {
    assert.equal(dt.formatModeDisplay(T('15031994', 'date'), 'date'), '15/03/1994');
    assert.equal(dt.formatModeDisplay(T('15/3/1994 9:05', 'datetime'), 'datetime'), '15/03/1994 - 09:05');
    assert.equal(dt.formatModeDisplay(T('3/1994', 'month'), 'month'), '03/1994');
    // an unknown mode is datetime
    assert.deepEqual(T('150319940905', 'week'), P(15, 3, 1994, 9, 5));
  });
});
