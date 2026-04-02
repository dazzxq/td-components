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
    assert.equal(TdDateTime._parseDate(0), null);
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
