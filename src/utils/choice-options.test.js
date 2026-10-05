// v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md M1) — normalizeOptions(): the one gate for the options of
// <td-choice-group>, used for the `options` property AND for data read back from server markup on hydrate. Plus the
// shared safeColor / swatch image URL case tables (the PHP side runs the same files).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOptions, sameValueList } from './choice-options.js';
import { safeColor } from './css-safe.js';
import { safeMediaUrl } from './media-url.js';

const HTTPS = { baseURI: 'https://shop.test/p/iphone', protocol: 'https:' };
const gates = { safeColor, safeMediaUrl: (u) => safeMediaUrl(u, HTTPS) };
const norm = (raw) => normalizeOptions(raw, gates);

describe('normalizeOptions — shape', () => {
  it('copies the known keys, fills defaults, numbers the index', () => {
    const { options, warnings } = norm([
      { value: '128', label: '128GB', hint: '21.990.000₫' },
      { value: '256', label: '256GB', unavailable: true, unavailableLabel: 'Sắp về' },
      { value: '1tb', label: '1TB', disabled: true },
    ]);
    assert.deepEqual(warnings, []);
    assert.deepEqual(options.map((o) => ({ ...o })), [
      { value: '128', label: '128GB', hint: '21.990.000₫', swatch: '', image: '', disabled: false, unavailable: false, unavailableLabel: '', index: 0 },
      { value: '256', label: '256GB', hint: '', swatch: '', image: '', disabled: false, unavailable: true, unavailableLabel: 'Sắp về', index: 1 },
      { value: '1tb', label: '1TB', hint: '', swatch: '', image: '', disabled: true, unavailable: false, unavailableLabel: '', index: 2 },
    ]);
  });

  it('frozen copies, never the caller objects', () => {
    const src = { value: 'a', label: 'A', extra: { x: 1 } };
    const { options } = norm([src]);
    assert.ok(Object.isFrozen(options));
    assert.ok(Object.isFrozen(options[0]));
    assert.notEqual(options[0], src);
    assert.equal('extra' in options[0], false);
    src.label = 'changed';
    assert.equal(options[0].label, 'A');
  });

  it('a finite number value → String(); booleans only by === true', () => {
    const { options, warnings } = norm([{ value: 128, label: '128' }, { value: 1.5, label: 'x', disabled: 'true', unavailable: 1 }]);
    assert.deepEqual(options.map((o) => o.value), ['128', '1.5']);
    assert.equal(options[1].disabled, false);
    assert.equal(options[1].unavailable, false);
    assert.equal(warnings.length, 0);
  });
});

describe('normalizeOptions — refused entries (one warning each, never the raw value)', () => {
  it('not an array → [] + one warning', () => {
    for (const raw of [null, undefined, 'a,b', { 0: { value: 'a', label: 'A' } }, 5]) {
      const r = norm(raw);
      assert.deepEqual(r.options, []);
      assert.equal(r.warnings.length, raw == null ? 0 : 1, String(raw));
    }
  });

  it('missing / empty / wrong-type value or label → the option is dropped', () => {
    const r = norm([
      { label: 'ZZ1' }, { value: '', label: 'ZZ2' }, { value: NaN, label: 'ZZ3' }, { value: Infinity, label: 'ZZ4' },
      { value: true, label: 'ZZ5' }, { value: {}, label: 'ZZ6' }, { value: 'QQ1' }, { value: 'QQ2', label: '' },
      { value: 'c', label: 7 }, { value: 'd', label: '   ' }, null, 'x', ['e', 'E'], { value: 'ok', label: 'OK' },
    ]);
    assert.deepEqual(r.options.map((o) => o.value), ['ok']);
    assert.equal(r.options[0].index, 0);
    assert.equal(r.warnings.length, 13);
    for (const w of r.warnings) assert.doesNotMatch(w, /ZZ\d|QQ\d/);
  });

  it('a duplicate value → the later one is dropped + warning', () => {
    const r = norm([{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }, { value: 1, label: 'one' }, { value: '1', label: 'uno' }]);
    assert.deepEqual(r.options.map((o) => o.label), ['A', 'one']);
    assert.equal(r.warnings.length, 2);
  });

  it('wrong-type hint / unavailableLabel → ignored (option kept) + warning', () => {
    const r = norm([{ value: 'a', label: 'A', hint: 5, unavailableLabel: {} }]);
    assert.equal(r.options[0].hint, '');
    assert.equal(r.options[0].unavailableLabel, '');
    assert.equal(r.warnings.length, 2);
  });
});

describe('normalizeOptions — swatch colour / image through the gates', () => {
  it('a valid colour kept, anything else → no colour + warning', () => {
    const r = norm([
      { value: 'a', label: 'A', swatch: '#3b3b3d' },
      { value: 'b', label: 'B', swatch: 'red;} body{display:none}' },
      { value: 'c', label: 'C', swatch: 'url(javascript:alert(1))' },
      { value: 'd', label: 'D', swatch: 42 },
    ]);
    assert.deepEqual(r.options.map((o) => o.swatch), ['#3b3b3d', '', '', '']);
    assert.equal(r.warnings.length, 3);
  });

  it('image: normalised href through safeMediaUrl; refused → \'\' + warning (swatch kept as the fallback)', () => {
    const r = norm([
      { value: 'a', label: 'A', image: '/sw/a.webp', swatch: '#111' },
      { value: 'b', label: 'B', image: 'javascript:alert(1)', swatch: '#222' },
      { value: 'c', label: 'C', image: 'data:image/png;base64,AAAA' },
      { value: 'd', label: 'D', image: 'http://cdn.test/x.png' },
    ]);
    assert.deepEqual(r.options.map((o) => [o.image, o.swatch]), [
      ['https://shop.test/sw/a.webp', '#111'], ['', '#222'], ['', ''], ['', ''],
    ]);
    assert.equal(r.warnings.length, 3);
  });

  it('gates are required (no implicit pass-through)', () => {
    assert.throws(() => normalizeOptions([{ value: 'a', label: 'A', swatch: '#fff' }], {}), TypeError);
  });
});

describe('sameValueList', () => {
  it('same values in the same order', () => {
    const a = norm([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]).options;
    const b = norm([{ value: 'a', label: 'x', disabled: true }, { value: 'b', label: 'y' }]).options;
    const c = norm([{ value: 'b', label: 'B' }, { value: 'a', label: 'A' }]).options;
    assert.equal(sameValueList(a, b), true);
    assert.equal(sameValueList(a, c), false);
    assert.equal(sameValueList(a, a.slice(0, 1)), false);
  });
});

describe('shared case tables (parity with php)', () => {
  it('safeColor — test/ssr/safe-color.cases.json', () => {
    const { cases } = JSON.parse(readFileSync(new URL('../../test/ssr/safe-color.cases.json', import.meta.url), 'utf8'));
    assert.ok(cases.length > 30);
    for (const c of cases) assert.equal(safeColor(c.in, ''), c.out, JSON.stringify(c.in));
  });

  it('safeMediaUrl — test/ssr/media-url.cases.json (js column, page scheme injected)', () => {
    const { cases } = JSON.parse(readFileSync(new URL('../../test/ssr/media-url.cases.json', import.meta.url), 'utf8'));
    for (const c of cases) {
      const got = safeMediaUrl(c.url, { baseURI: `${c.page}://shop.test/p/x`, protocol: `${c.page}:` });
      assert.equal(got ? 'keep' : 'refuse', c.js, `${c.url.slice(0, 60)} on ${c.page}`);
    }
  });
});
