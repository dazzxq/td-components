// v0.95.0 (plan v0.95.0-card §7, §9, §11.1) — PHP td_card(): the CSS-only `a.td-card` / static `div.td-card` tree.
// Markup order and whitespace (the link name reads "title badge meta"), href policy (mailto: / tel: refused → static
// card), image / srcset fail-closed, attrs reserved names, escaping. No snapshot file: the expectations are inline.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HAS_PHP, php1 } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const card = (title, o) => php1('td_card', title, o ?? {});
const root = (html) => /^<(a|div)\b([^>]*)>/.exec(html);
const attrOf = (html, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(root(html)[2])?.[1];

describe('php/td.php — td_card (v0.95.0)', opts, () => {
  test('minimal: static div card, placeholder icon image, only the title', () => {
    const h = card('Tết 2026');
    assert.match(h, /^<div class="td-card"><span class="td-card__media"><span class="td-card__placeholder" aria-hidden="true"><svg class="td-icon td-icon--l" data-icon="image"/);
    assert.ok(h.endsWith('</svg></span></span> <span class="td-card__body"><span class="td-card__title">Tết 2026</span></span></div>'));
    assert.doesNotMatch(h, /td-card__badges|td-card__meta|href/);
  });

  test('full link card: order, single spaces between children, attribute order', () => {
    const h = card('Tết 2026', {
      href: '/album/tet-2026',
      image: { src: '/media/tet-640.jpg', srcset: '/media/tet-640.jpg 640w, /media/tet-1280.jpg 1280w', sizes: '(min-width: 60em) 25vw, 50vw', alt: 'Bìa', width: 640, height: '480' },
      badges: [['Live', { variant: 'danger' }]],
      meta: ['42 ảnh', { text: '12/02/2026', datetime: '2026-02-12' }],
      heading: 3,
      ratio: '16x9',
      surface: true,
    });
    assert.equal(h,
      '<a class="td-card td-card--surface td-card--ratio-16x9" href="/album/tet-2026">'
      + '<span class="td-card__media"><img src="/media/tet-640.jpg" srcset="/media/tet-640.jpg 640w, /media/tet-1280.jpg 1280w" sizes="(min-width: 60em) 25vw, 50vw" alt="Bìa" loading="lazy" decoding="async" width="640" height="480"></span> '
      + '<span class="td-card__body"><h3 class="td-card__title">Tết 2026</h3> '
      + '<span class="td-card__badges"><span class="td-badge td-badge--danger">Live</span></span> '
      + '<span class="td-card__meta"><span>42 ảnh</span> <span class="td-card__sep" aria-hidden="true">·</span> <time datetime="2026-02-12">12/02/2026</time></span></span></a>');
  });

  test('every ratio is accepted, anything else is ignored', () => {
    for (const r of ['1x1', '4x3', '3x2', '16x9', '3x4']) assert.match(attrOf(card('A', { ratio: r }), 'class'), new RegExp(`td-card--ratio-${r}$`));
    for (const r of ['1x1;x', '2x1', '', 5, null, ['1x1']]) assert.equal(attrOf(card('A', { ratio: r }), 'class'), 'td-card');
  });

  test('href policy: javascript / data / mailto / tel / empty → static div; relative, https, //host kept', () => {
    for (const href of ['javascript:alert(1)', 'java\tscript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'mailto:a@b.c', 'tel:+84', ' MAILTO:a@b.c', '', 'a:b', null, 5]) {
      const h = card('A', { href });
      assert.match(h, /^<div class="td-card">/, String(href));
      assert.doesNotMatch(h, /href=/);
    }
    for (const href of ['/x', 'https://a.vn/x?y=1&z=2', '//evil.example/x', '#top', '?p=2']) assert.match(card('A', { href }), /^<a class="td-card" href="/, href);
    assert.match(card('A', { href: 'https://a.vn/x?y=1&z=2' }), /href="https:\/\/a\.vn\/x\?y=1&amp;z=2"/);
    assert.match(card('A', { href: 'http://a.vn/' }), /^<div/); // http needs Td::allowHttpLinks()
  });

  test('target: only with a link; _blank adds rel; unknown ignored', () => {
    assert.match(card('A', { href: '/x', target: '_blank' }), /^<a class="td-card" href="\/x" target="_blank" rel="noopener noreferrer">/);
    assert.match(card('A', { href: '/x', target: '_self' }), /^<a class="td-card" href="\/x" target="_self">/);
    assert.doesNotMatch(card('A', { href: '/x', target: 'evil' }), /target=/);
    assert.doesNotMatch(card('A', { target: '_blank' }), /target=|rel=/);
  });

  test('image: src policy, eager, alt default, no usable src → placeholder (placeholder_icon / unknown icon)', () => {
    for (const src of ['javascript:x', 'data:image/png;base64,AA', 'mailto:a@b.c', 'tel:1', '', 'x:y', 5, null, 'a'.repeat(8193)]) {
      const h = card('A', { image: src });
      assert.match(h, /td-card__placeholder/, String(src).slice(0, 20));
      assert.doesNotMatch(h, /<img/);
    }
    assert.match(card('A', { image: '/a.jpg' }), /<img src="\/a\.jpg" alt="" loading="lazy" decoding="async">/);
    assert.match(card('A', { image: { src: '/a.jpg' }, eager: true }), /<img src="\/a\.jpg" alt="" decoding="async">/);
    assert.match(card('A', { placeholder_icon: 'trash' }), /data-icon="trash"/);
    assert.match(card('A', { placeholder_icon: 'no-such-icon' }), /data-icon="image"/);
  });

  test('srcset: one bad candidate drops the whole srcset (and sizes); descriptors validated', () => {
    const base = (srcset) => card('A', { image: { src: '/a.jpg', srcset, sizes: '100vw' } });
    for (const s of ['/a.jpg 1x, javascript:x 2x', '/a.jpg 1x, data:x 2x', '/a.jpg', '/a.jpg 1y', '/a.jpg 640w extra', '/a.jpg 1x,, /b.jpg 2x', '/a.jpg 1x 2x', '/a.jpg -1x', 5]) {
      assert.doesNotMatch(base(s), /srcset=|sizes=/, String(s));
    }
    assert.match(base('/a.jpg 1x, /b.jpg 1.5x'), /srcset="\/a\.jpg 1x, \/b\.jpg 1\.5x" sizes="100vw"/);
  });

  test('width / height: integers 1–10000 only; sizes escaped and bounded', () => {
    const h = (width, height) => card('A', { image: { src: '/a.jpg', width, height } });
    assert.match(h(1, 10000), /width="1" height="10000"/);
    for (const v of [0, -5, 10001, 1e9, 1.5, 'abc', '12px', '0', '00000', true, null, []]) assert.doesNotMatch(h(v, v), /width=|height=/, JSON.stringify(v));
    const s = card('A', { image: { src: '/a.jpg', srcset: '/a.jpg 1x', sizes: '"><script>x</script>' } });
    assert.match(s, /sizes="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/);
    assert.doesNotMatch(card('A', { image: { src: '/a.jpg', srcset: '/a.jpg 1x', sizes: 'x'.repeat(513) } }), /sizes=/);
  });

  test('XSS: title / meta / badge / alt text is escaped', () => {
    const p = '<script>alert(1)</script>"\'&';
    const h = card(p, { image: { src: '/a.jpg', alt: p }, meta: [p, { text: p, datetime: '2026-02-12' }], badges: [p, [p, { variant: 'info' }]] });
    assert.doesNotMatch(h, /<script/);
    assert.equal(h.match(/&lt;script&gt;/g).length, 6);
    assert.match(h, /alt="&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&#039;&amp;"/);
  });

  test('meta: empty items dropped, no meta when none, datetime validated, non-strings skipped', () => {
    assert.doesNotMatch(card('A', { meta: ['', '  ', null, 5, []] }), /td-card__meta/);
    assert.match(card('A', { meta: '42 ảnh' }), /<span class="td-card__meta"><span>42 ảnh<\/span><\/span>/);
    for (const dt of ['2026"><x', '12/02/2026', 'now', '2026-02-12T25', '', null, 5]) {
      assert.match(card('A', { meta: [{ text: 'd', datetime: dt }] }), /<span class="td-card__meta"><span>d<\/span><\/span>/, String(dt));
    }
    for (const dt of ['2026-02-12', '2026-02-12T10:30', '2026-02-12T10:30:00Z', '2026-02-12 10:30:00+07:00']) {
      assert.match(card('A', { meta: [{ text: 'd', datetime: dt }] }), new RegExp(`<time datetime="${dt.replace('+', '\\+')}">d</time>`), dt);
    }
  });

  test('badges: empty / non-string skipped, td_badge options passed, none → no wrapper', () => {
    assert.doesNotMatch(card('A', { badges: ['', null, 5, [[]], [''], []] }), /td-card__badges/);
    const h = card('A', { badges: ['Mới', ['Live', { variant: 'danger', glass: true, attrs: { onclick: 'x' } }]] });
    assert.match(h, /<span class="td-card__badges"><span class="td-badge td-badge--neutral">Mới<\/span> <span class="td-badge td-badge--danger td-badge--glass">Live<\/span><\/span>/);
  });

  test('heading: 2–6 → hN, anything else → span', () => {
    for (const n of [2, 3, 4, 5, 6, '3']) assert.match(card('A', { heading: n }), new RegExp(`<h${n} class="td-card__title">A</h${n}>`));
    for (const n of [1, 7, 9, 0, 'x', '3;', null, true]) assert.match(card('A', { heading: n }), /<span class="td-card__title">A<\/span>/, String(n));
  });

  test('id / class / attrs: tokens, blocked names, reserved names, aria-describedby and data-* pass', () => {
    const h = card('A', {
      href: '/x',
      id: 'c1',
      class: 'my extra',
      attrs: {
        onclick: 'x()', style: 'color:red', href: 'javascript:x', src: 'x', class: 'evil', id: 'evil', target: '_blank', rel: 'x',
        role: 'button', tabindex: '-1', 'aria-label': 'Y', 'aria-labelledby': 'z', 'data-td-ssr': 'x', 'DATA-TD-Foo': 'x',
        'aria-describedby': 'd', 'data-id': '7', 'aria-current': 'page',
      },
    });
    assert.equal(root(h)[2], ' class="td-card my extra" id="c1" href="/x" aria-describedby="d" data-id="7" aria-current="page"');
    assert.doesNotMatch(card('A', { attrs: { 'aria-label': 'Y', role: 'link', tabindex: '0' } }), /aria-label|role=|tabindex/);
    assert.equal(attrOf(card('A', { class: ['a', 'b'] }), 'class'), 'td-card a b');
  });

  test('surface false / absent adds no modifier', () => {
    assert.equal(attrOf(card('A', { surface: false }), 'class'), 'td-card');
    assert.equal(attrOf(card('A', { surface: true }), 'class'), 'td-card td-card--surface');
  });
});
