// v0.49.0 (plan docs/internal/plans/v0.49.0-choice-stepper.md M1) — normalizeOptions(): the one gate for the options of
// <td-choice-group>, used for the `options` property AND for data read back from server markup on hydrate. Plus the
// shared safeColor / swatch image URL case tables (the PHP side runs the same files).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOptions, sameValueList, canonicalValue, CHOICE_LIMITS } from './choice-options.js';
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
    assert.equal(r.dropped, 13);
    assert.equal(r.warnings.length, 1); // ONE aggregate warning (review S1), counts only
    for (const w of r.warnings) assert.doesNotMatch(w, /ZZ\d|QQ\d/);
  });

  it('a duplicate value → the later one is dropped + warning', () => {
    const r = norm([{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }, { value: 1, label: 'one' }, { value: '1', label: 'uno' }]);
    assert.deepEqual(r.options.map((o) => o.label), ['A', 'one']);
    assert.equal(r.dropped, 2);
    assert.equal(r.warnings.length, 1);
  });

  it('wrong-type hint / unavailableLabel → ignored (option kept) + warning', () => {
    const r = norm([{ value: 'a', label: 'A', hint: 5, unavailableLabel: {} }]);
    assert.equal(r.options[0].hint, '');
    assert.equal(r.options[0].unavailableLabel, '');
    assert.equal(r.ignored, 2);
    assert.equal(r.warnings.length, 1);
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
    assert.equal(r.ignored, 3);
    assert.equal(r.warnings.length, 1);
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
    assert.equal(r.ignored, 3);
    assert.equal(r.warnings.length, 1);
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

describe('review S1 — bounded work: candidate / option / field limits, one aggregate warning', () => {
  it('limits are the shared table (php Td::CHOICE_LIMITS is checked against it in test/php/td-ssr-choice.test.js)', () => {
    assert.deepEqual({ ...CHOICE_LIMITS }, { candidates: 400, options: 100, value: 200, label: 200, hint: 200, note: 100, swatch: 128, image: 8192 });
    assert.ok(Object.isFrozen(CHOICE_LIMITS));
  });

  it('100 000 candidates: at most 400 inspected, 100 accepted, ONE warning with the counts, bounded time', () => {
    const big = Array.from({ length: 100000 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    const t0 = performance.now();
    const r = norm(big);
    const ms = performance.now() - t0;
    assert.equal(r.options.length, 100);
    assert.equal(r.dropped, 100000 - 100);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /99900 option\(s\) dropped/);
    assert.ok(ms < 1000 * (process.env.TD_PERF_STRICT ? 1 : 20), `${ms} ms`);
    // getters past the inspected window are never read
    let touched = 0;
    const trap = Array.from({ length: 1000 }, (_, i) => (i < 400 ? { value: `x${i}`, label: 'X' } : { get value() { touched += 1; return 'y'; }, label: 'Y' }));
    norm(trap);
    assert.equal(touched, 0);
  });

  it('many invalid entries → one warning; the inspected window counts invalid ones too', () => {
    const r = norm([...Array.from({ length: 450 }, () => ({ value: '', label: 'bad' })), { value: 'late', label: 'Late' }]);
    assert.equal(r.options.length, 0); // the valid one is past the 400 inspected
    assert.equal(r.dropped, 451);
    assert.equal(r.warnings.length, 1);
  });

  it('huge strings: text fields cut to their code-point caps (counted), value / swatch / image over the cap refused, bounded', () => {
    const huge = 'á'.repeat(5_000_000);
    const t0 = performance.now();
    const r = norm([
      { value: 'a', label: `${'😀'.repeat(300)}`, hint: huge, unavailable: true, unavailableLabel: huge },
      { value: 'x'.repeat(5_000_000), label: 'V' },
      { value: 'b', label: 'B', swatch: `#fff${' '.repeat(5_000_000)}`, image: `https://cdn.test/${'a'.repeat(5_000_000)}` },
    ]);
    const ms = performance.now() - t0;
    assert.ok(ms < 500 * (process.env.TD_PERF_STRICT ? 1 : 20), `${ms} ms`);
    assert.deepEqual(r.options.map((o) => o.value), ['a', 'b']);
    assert.equal([...r.options[0].label].length, 200);
    assert.equal([...r.options[0].hint].length, 200);
    assert.equal([...r.options[0].unavailableLabel].length, 100);
    assert.equal(r.options[1].swatch, '');
    assert.equal(r.options[1].image, '');
    assert.equal(r.dropped, 1);
    assert.equal(r.ignored, 5); // label + hint + note shortened, swatch + image refused
    assert.equal(r.warnings.length, 1);
    assert.ok(r.warnings[0].length < 200);
  });
});

describe('review S2 — canonical values (test/ssr/choice-value.cases.json, parity with php td__choice_value)', () => {
  const T = JSON.parse(readFileSync(new URL('../../test/ssr/choice-value.cases.json', import.meta.url), 'utf8'));
  it('shared + JS-only cases', () => {
    for (const c of [...T.cases, ...T.jsOnly]) assert.equal(canonicalValue(c.in), c.out, JSON.stringify(c.in)?.slice(0, 40));
  });
  it('rejected values count as dropped options; duplicates compare the canonical value', () => {
    const r = norm([{ value: 'a\r\nb', label: 'CRLF' }, { value: 'a\nb', label: 'LF' }, { value: 5, label: 'five' }, { value: '5', label: 'dup' }, { value: 'x\ud800', label: 'lone' }]);
    assert.deepEqual(r.options.map((o) => o.value), ['5']);
    assert.equal(r.dropped, 4);
    assert.equal(r.warnings.length, 1);
  });
});

describe('review r3 — label emptiness = ECMAScript trim (test/ssr/choice-label.cases.json, parity with php Td::JS_WS)', () => {
  it('whitespace-only labels drop the option; U+180E / U+200B / U+0085 are text', () => {
    const { cases } = JSON.parse(readFileSync(new URL('../../test/ssr/choice-label.cases.json', import.meta.url), 'utf8'));
    for (const c of cases) assert.equal(norm([{ value: 'a', label: c.label }]).options.length === 1, c.ok, JSON.stringify(c.label));
  });
});
