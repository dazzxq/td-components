// v0.118.0 (plan docs/internal/plans/v0.118.0-media-picker-card-meta.md QĐ1 / QĐ2 / QĐ2b) — pure core of the media picker's
// `cardMeta` and `nameLines` options. No DOM.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOptions, shortFileSize, relativeTime, normalizeCardMeta, normalizeNameLines, _resetCoreWarnings,
} from './media-picker-core.js';
import { formatFileSize } from './dom-utils.js';

const adapter = () => ({ list: async () => ({ items: [], nextCursor: null }), get: async () => null });
beforeEach(() => _resetCoreWarnings());

describe('shortFileSize (QĐ1)', () => {
  it('units B / KB / MB / GB / TB with at most 3 significant digits', () => {
    assert.equal(shortFileSize(12), '12 B');
    assert.equal(shortFileSize(1023), '1023 B');
    assert.equal(shortFileSize(1024), '1 KB');
    assert.equal(shortFileSize(174.32 * 1024), '174 KB');
    assert.equal(shortFileSize(12.3 * 1024), '12.3 KB');
    assert.equal(shortFileSize(12 * 1024), '12 KB', '.0 dropped');
    assert.equal(shortFileSize(9.99 * 1024), '9.99 KB');
    assert.equal(shortFileSize(1.2 * 1024 * 1024), '1.2 MB');
    assert.equal(shortFileSize(3 * 1024 ** 3), '3 GB');
    assert.equal(shortFileSize(5 * 1024 ** 4), '5 TB');
    assert.equal(shortFileSize(2048 * 1024 ** 4), '2048 TB', 'no unit above TB');
  });

  it('rounding up to 1024 carries to the next unit', () => {
    assert.equal(shortFileSize(1023.9 * 1024), '1 MB');
    assert.equal(shortFileSize(1048575), '1 MB');
  });

  it('absent / 0 / invalid → empty', () => {
    for (const v of [undefined, null, 0, -5, NaN, Infinity, 'x', {}]) assert.equal(shortFileSize(v), '', String(v));
  });

  it('formatFileSize (the absolute text) is unchanged', () => {
    assert.equal(formatFileSize(1536), '1.5 KB');
    assert.equal(formatFileSize(0), '0 Bytes');
  });
});

describe('relativeTime (QĐ1)', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  const ago = (sec) => new Date(now - sec * 1000).toISOString();
  const D = 86400;

  it('each unit and its boundaries (floor)', () => {
    const cases = [[0, '0s trước'], [59, '59s trước'], [60, '1m trước'], [3599, '59m trước'], [3600, '1h trước'],
      [D - 1, '23h trước'], [D, '1d trước'], [7 * D - 1, '6d trước'], [7 * D, '1w trước'], [30 * D - 1, '4w trước'],
      [30 * D, '1mo trước'], [365 * D - 1, '12mo trước'], [365 * D, '1y trước'], [800 * D, '2y trước']];
    for (const [sec, want] of cases) assert.equal(relativeTime(ago(sec), now), want, `${sec}s`);
  });

  it('a future date → 0s; missing / invalid → empty', () => {
    assert.equal(relativeTime(ago(-3600), now), '0s trước');
    for (const v of [undefined, null, '', 'nope', NaN, {}, true]) assert.equal(relativeTime(v, now), '', String(v));
  });

  it('accepts a Date and epoch ms; custom template and units', () => {
    assert.equal(relativeTime(new Date(now - 300000), now), '5m trước');
    assert.equal(relativeTime(now - 300000, now), '5m trước');
    assert.equal(relativeTime(ago(300), now, { template: '{n} {unit} ago', units: { m: 'min' } }), '5 min ago');
    assert.equal(relativeTime(ago(300), now, { template: '', units: { m: '' } }), '5m trước', 'empty labels → defaults');
  });
});

describe('option validation (QĐ1 / QĐ2 / QĐ2b)', () => {
  const calls = [];
  const warn = (...a) => calls.push(a);
  beforeEach(() => { calls.length = 0; });
  const resolve = (o) => resolveOptions(null, { adapter: adapter(), ...o }, { warn });

  it('absent → absolute + 1 line', () => {
    const o = resolve({});
    assert.equal(o.cardMeta, 'absolute');
    assert.equal(o.nameLines, 1);
    assert.equal(calls.length, 0);
  });

  it('cardMeta: absolute / relative / function pass; null = absent', () => {
    assert.equal(resolve({ cardMeta: 'absolute' }).cardMeta, 'absolute');
    assert.equal(resolve({ cardMeta: 'relative' }).cardMeta, 'relative');
    const fn = () => 'x';
    assert.equal(resolve({ cardMeta: fn }).cardMeta, fn);
    assert.equal(resolve({ cardMeta: null }).cardMeta, 'absolute');
    assert.equal(calls.length, 0);
  });

  it('cardMeta bad values → absolute and ONE warning across resolves', () => {
    for (const v of ['rel', 5, true, {}, '']) assert.equal(resolve({ cardMeta: v }).cardMeta, 'absolute');
    assert.equal(calls.length, 1);
    _resetCoreWarnings();
    normalizeCardMeta('x', warn);
    assert.equal(calls.length, 2);
  });

  it('nameLines 1-3 pass; bad values → 1 and ONE warning', () => {
    for (const n of [1, 2, 3]) assert.equal(resolve({ nameLines: n }).nameLines, n);
    assert.equal(calls.length, 0);
    for (const v of [0, 4, 1.5, '2', NaN, true]) assert.equal(resolve({ nameLines: v }).nameLines, 1);
    assert.equal(calls.length, 1);
    _resetCoreWarnings();
    assert.equal(normalizeNameLines(9, warn), 1);
    assert.equal(calls.length, 2);
  });

  it('configureDefaults layer + open layer merge (open wins)', () => {
    const o = resolveOptions({ adapter: adapter(), cardMeta: 'relative', nameLines: 2 }, { nameLines: 3 }, { warn });
    assert.equal(o.cardMeta, 'relative');
    assert.equal(o.nameLines, 3);
  });
});
