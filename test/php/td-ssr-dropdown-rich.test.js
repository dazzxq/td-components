// v0.84.0 (plan v0.84.0-dropdown-rich, Decisions 11) — PHP side: td_dropdown prints <optgroup> and the rich
// per-option data-* (icon, icon-tone, description, status, status-tone, meta, keywords), each only when valid, escaped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HAS_PHP, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.84.0';

function one(args) {
  const [r] = runPhp([{ fn: 'td_dropdown', args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `td_dropdown: ${r.message}`);
  return r.out;
}
const sel = (html) => html.slice(html.indexOf('<select'), html.indexOf('</select>') + 9);

describe('td_dropdown rich rows + groups (PHP)', opts, () => {
  test('optgroup: order, group disabled, ungrouped leaf stays in place', () => {
    const html = sel(one(['f', [
      { value: 'x', label: 'Loose' },
      { label: 'Cloud', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }] },
      { label: 'Local', disabled: true, options: { c: 'C' } },
    ], '']));
    const iLoose = html.indexOf('value="x"'), iCloud = html.indexOf('<optgroup label="Cloud">'),
      iLocal = html.indexOf('<optgroup label="Local" disabled>');
    assert.ok(iLoose > 0 && iLoose < iCloud && iCloud < iLocal, html);
    assert.match(html, /<optgroup label="Cloud"><option value="a">A<\/option><option value="b" disabled>B<\/option><\/optgroup>/);
    assert.match(html, /<optgroup label="Local" disabled><option value="c">C<\/option><\/optgroup>/);
  });

  test('placeholder stays first, outside any group', () => {
    const html = sel(one(['f', [{ label: 'G', options: [{ value: 'a', label: 'A' }] }], '', { placeholder: 'Pick' }]));
    assert.match(html, /^<select[^>]*><option value="">Pick<\/option><optgroup label="G">/);
  });

  test('selected leaf inside a group', () => {
    const html = one(['f', [{ label: 'G', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }], 'b']);
    assert.match(html, /<option value="b" selected>B<\/option>/);
    assert.ok(!/value="a" selected/.test(html));
  });

  test('each data-* printed when valid', () => {
    const html = one(['f', [{
      value: 'r', label: 'Repo', icon: 'folder', icon_tone: 'accent', description: 'Main repo',
      status: { text: 'Live', tone: 'success' }, meta: '12 GB', keywords: ['git', 'code', 7],
    }, { value: 'k', label: 'K', icon: 'check', iconTone: 'info', keywords: 'one two' }], '']);
    assert.match(html, /<option value="r" data-icon="folder" data-icon-tone="accent" data-description="Main repo" data-status="Live" data-status-tone="success" data-meta="12 GB" data-keywords="git code 7">Repo<\/option>/);
    assert.match(html, /<option value="k" data-icon="check" data-icon-tone="info" data-keywords="one two">K<\/option>/);
  });

  test('invalid icon name / tone dropped; empty status has no tone', () => {
    const html = one(['f', [
      { value: 'a', label: 'A', icon: 'Bad Name', icon_tone: 'accent' },
      { value: 'b', label: 'B', icon: 'folder', icon_tone: 'purple', status: { text: 'S', tone: 'rainbow' } },
      { value: 'c', label: 'C', status: { tone: 'success' }, description: '  ', meta: '', keywords: [] },
      { value: 'd', label: 'D', icon: '"><script>' },
    ], '']);
    assert.match(html, /<option value="a">A<\/option>/);
    assert.match(html, /<option value="b" data-icon="folder" data-status="S">B<\/option>/);
    assert.match(html, /<option value="c">C<\/option>/);
    assert.match(html, /<option value="d">D<\/option>/);
    assert.ok(!html.includes('data-icon-tone'));
  });

  test('escapes label, description, status, meta, keywords and group label', () => {
    const x = '<script>"\'&';
    const html = one(['f', [{ label: x, options: [{
      value: 'v', label: x, description: x, status: { text: x, tone: 'info' }, meta: x, keywords: [x],
    }] }], '']);
    assert.ok(!html.includes('<script>'), html);
    assert.match(html, /<optgroup label="&lt;script&gt;/);
    for (const a of ['data-description', 'data-status', 'data-meta', 'data-keywords']) {
      assert.match(html, new RegExp(`${a}="&lt;script&gt;`));
    }
  });

  test('plain call unchanged: no data-*, no optgroup', () => {
    const html = one(['f', { a: 'A', b: 'B' }, 'a']);
    assert.ok(!/data-(icon|description|status|meta|keywords)|optgroup/.test(html));
    assert.match(html, /<option value="a" selected>A<\/option><option value="b">B<\/option>/);
  });
});
