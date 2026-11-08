// v0.18.0 F6: icon aliases — one table (src/icons/icons.json "aliases") for JS (registry.js → td-icon.js) and PHP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aliases as generated } from './registry.js';
import { hasIcon, listIcons, resolveIconName } from './td-icon.js';
import { HAS_PHP, ROOT, runPhp } from '../../test/php/php.mjs';

const json = JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8'));

// The table 135 relies on (plan F6) — same names PHP accepted since v0.17.0.
const EXPECTED = {
  x: 'close',
  'chevron-left': 'prev',
  'chevron-right': 'next',
  'chevron-up': 'up',
  'chevron-down': 'down',
  ellipsis: 'more',
  'external-link': 'external',
  expand: 'fullscreen',
  pen: 'pencil',
  // v0.56.0 (plan A1): Lucide names of the new core icons + `trademark` (Lucide has no trademark glyph)
  'archive-restore': 'restore',
  'folder-tree': 'category',
  tag: 'brand',
  trademark: 'brand',
  package: 'product',
  // v0.59.0 (plan QĐ D3): the Lucide name of the new core icon `price`
  banknote: 'price',
  // v0.101.0 (dcms2): Lucide names of the modifier-key icons (Lucide `chevron-up` is already `up`)
  command: 'key-command',
  option: 'key-option',
  'arrow-big-up': 'key-shift',
};

// v0.56.0 (plan A1): core icons for archive / restore / category tree / brand / product / ban (Lucide 1.52.0 geometry)
const V056 = { archive: 'archive', restore: 'archive-restore', category: 'folder-tree', brand: 'tag', product: 'package', ban: 'ban' };

test('v0.56.0: the 6 new core icons exist with their Lucide source name', () => {
  for (const [name, lucide] of Object.entries(V056)) {
    assert.ok(Object.hasOwn(json.icons, name), name);
    assert.equal(json.icons[name].lucide, lucide, name);
    assert.equal(json.icons[name].paint, 'stroke', name);
    assert.equal(hasIcon(name), true, name);
    assert.ok(listIcons().includes(name), name);
  }
  // v0.56.0 refused `box` as an ALIAS of `product` (Lucide box is a cube, not a parcel). v0.94.0 adds `box` as a core
  // icon with exactly that Lucide cube shape — the concept it names — so it now exists (and is still not an alias).
  assert.equal(hasIcon('box'), true);
  assert.equal(resolveIconName('box'), 'box');
  assert.ok(!Object.hasOwn(json.aliases, 'box'));
  // v0.59.0: + price; v0.88.0: + bold, italic, underline, strikethrough (td-rich-text toolbar); v0.94.0: + 113
  assert.equal(Object.keys(json.icons).length, 222);
  assert.equal(listIcons().length, 222);
});

test('icons.json aliases: the F6 table, every target a core icon, no alias shadows a core name', () => {
  assert.deepEqual(json.aliases, EXPECTED);
  for (const [alias, target] of Object.entries(json.aliases)) {
    assert.ok(Object.hasOwn(json.icons, target), `${alias} → ${target}`);
    assert.ok(!Object.hasOwn(json.icons, alias), `${alias} shadows a core icon`);
  }
});

test('registry.js exports the same aliases (generated, not hand-edited)', () => {
  assert.deepEqual({ ...generated }, json.aliases);
});

test('td-icon.js resolves aliases (hasIcon / resolveIconName), listIcons stays canonical', () => {
  for (const [alias, target] of Object.entries(EXPECTED)) {
    assert.equal(hasIcon(alias), true, alias);
    assert.equal(resolveIconName(alias), target, alias);
  }
  assert.equal(resolveIconName('close'), 'close');
  assert.equal(resolveIconName('no-such-icon'), null);
  assert.equal(hasIcon('no-such-icon'), false);
  // prototype keys are never aliases
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(hasIcon(k), false, k);
  const names = listIcons();
  for (const alias of Object.keys(EXPECTED)) assert.ok(!names.includes(alias), alias);
});

test('PHP: every alias renders the same SVG as its target', { skip: !HAS_PHP && 'php >= 8.0 CLI not found' }, () => {
  const entries = Object.entries(json.aliases);
  const res = runPhp(entries.flatMap(([alias, target]) => [
    { fn: 'td_icon', args: [alias] },
    { fn: 'td_icon', args: [target] },
  ]));
  entries.forEach(([alias, target], i) => {
    const a = res[2 * i].out;
    assert.ok(a.startsWith(`<svg class="td-icon td-icon--m" data-icon="${target}"`), alias);
    assert.equal(a, res[2 * i + 1].out, alias);
  });
});

// v0.94.0 (plan v0.94.0-icons-picker §4.1): 113 new core icons → `lucide` canonical name of lucide-static 1.66.0, or
// 'td' = owner-drawn (`"source": "td"`, ADR 0039, painted with fill).
const V094 = {
  'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right', swap: 'arrow-left-right',
  unpublish: 'arrow-down-from-line', refresh: 'refresh-cw', shield: 'shield-half', user: 'user', users: 'users',
  'user-plus': 'user-plus', 'user-minus': 'user-minus', 'user-check': 'user-check', 'user-pen': 'user-pen',
  bell: 'bell', folder: 'folder', 'folder-open': 'folder-open', 'folder-plus': 'folder-plus',
  'folder-minus': 'folder-minus', 'file-text': 'file-text', 'file-image': 'file-image',
  'file-spreadsheet': 'file-spreadsheet', newspaper: 'newspaper', tags: 'tags', play: 'play', stop: 'square',
  'circle-pause': 'circle-pause', list: 'list', 'list-ordered': 'list-ordered', 'list-checks': 'list-checks',
  keyboard: 'keyboard', globe: 'globe', settings: 'settings', help: 'circle-question-mark', bug: 'bug',
  circle: 'circle', 'circle-plus': 'circle-plus', 'circle-x': 'circle-x', 'log-in': 'log-in', unlock: 'lock-open',
  laptop: 'laptop', tablet: 'tablet', smartphone: 'smartphone', phone: 'phone', mouse: 'mouse',
  hourglass: 'hourglass', home: 'house', type: 'type', box: 'box', 'package-open': 'package-open', cloud: 'cloud',
  database: 'database', network: 'network', code: 'code', clipboard: 'clipboard', 'check-check': 'check-check',
  eraser: 'eraser', feather: 'feather', paintbrush: 'paintbrush', paperclip: 'paperclip', music: 'eighth-notes',
  mic: 'mic', headphones: 'headphones', lightbulb: 'lightbulb', 'flask-conical': 'flask-conical', coffee: 'coffee',
  flame: 'flame', puzzle: 'puzzle', fingerprint: 'fingerprint-pattern', 'door-open': 'door-open',
  'door-closed': 'door-closed', wrench: 'wrench', quote: 'quote', pilcrow: 'pilcrow', heading: 'letter-h',
  mail: 'mail', 'at-sign': 'at-sign', 'message-circle': 'message-circle', book: 'book', 'book-open': 'book-open',
  table: 'table', grid: 'grid-3x3', 'sticky-note': 'sticky-note', camera: 'camera', images: 'images', gauge: 'gauge',
  pointer: 'pointer', unlink: 'unlink', chart: 'chart-column', save: 'save', edit: 'square-pen',
  activity: 'activity', megaphone: 'megaphone', 'align-left': 'text-align-start',
  'align-center': 'text-align-center', 'align-right': 'text-align-end', 'align-justify': 'text-align-justify',
  'indent-increase': 'list-indent-increase', 'indent-decrease': 'list-indent-decrease',
  'paint-bucket': 'paint-bucket', 'wrap-text': 'text-wrap', 'square-terminal': 'square-terminal', shapes: 'shapes',
  minimize: 'minimize', 'move-horizontal': 'move-horizontal', 'pencil-line': 'pencil-line', 'align-none': 'td',
  'align-wide': 'td', 'align-full': 'td', 'float-left': 'td', 'float-right': 'td', 'float-wide-left': 'td',
  'float-wide-right': 'td', 'photostory-left': 'td', 'photostory-right': 'td',
};

test('v0.94.0: the 113 new icons — Lucide canonical name or source "td" (+ paint fill), registered', () => {
  assert.equal(Object.keys(V094).length, 113);
  for (const [name, origin] of Object.entries(V094)) {
    const def = json.icons[name];
    assert.ok(def, name);
    if (origin === 'td') {
      assert.equal(def.source, 'td', name);
      assert.ok(!Object.hasOwn(def, 'lucide'), name);
      assert.equal(def.paint, 'fill', name);
    } else {
      assert.equal(def.lucide, origin, name);
      assert.ok(!Object.hasOwn(def, 'source'), name);
      assert.equal(def.paint, 'stroke', name);
    }
    assert.equal(def.viewBox, '0 0 24 24', name);
    assert.equal(hasIcon(name), true, name);
    assert.ok(!Object.hasOwn(json.aliases, name), `${name} is also an alias`);
  }
  // names renamed upstream in Lucide 1.x: the CANONICAL name is recorded (the old file is an alias with the same shape)
  assert.equal(json.icons.music.lucide, 'eighth-notes');
  assert.equal(json.icons.fingerprint.lucide, 'fingerprint-pattern');
  assert.equal(json.icons.heading.lucide, 'letter-h');
  // `tags` / `images`: the dot's per-node fill="currentColor" is dropped (no `fill` per node; drawn by the stroke)
  for (const name of ['tags', 'images']) {
    for (const [, attrs] of json.icons[name].nodes) assert.ok(!Object.hasOwn(attrs, 'fill'), name);
  }
});

test('every icon has exactly one origin: `lucide` (upstream name) xor `"source": "td"`', () => {
  for (const [name, def] of Object.entries(json.icons)) {
    const lucide = typeof def.lucide === 'string' && def.lucide !== '';
    assert.notEqual(lucide, def.source === 'td', name);
    if (Object.hasOwn(def, 'source')) assert.equal(def.source, 'td', name);
  }
});
