// v0.45.0 (ADR 0012, plan docs/internal/plans/v0.45.0-steps-timeline.md QĐ S1–S6, T1–T10, G3, M4) — PHP side of the
// SSR contracts `steps@1` / `timeline@1`: td_steps() / td_timeline() print the exact trees the components build, with
// the SAME rules as the JS models (parity tables STATE_CASES, SUMMARY_CASES, INSTANT_CASES, DAY_CASES, HREF_CASES,
// TZ_CASES), text escaped, links relative only, host attrs reserved. The browser fixtures
// (test/ssr/fixtures/{steps,timeline}.html) must be fresh: `node test/ssr/build-steps-timeline-fixture.mjs`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import {
  STEPS_FIXTURES, TIMELINE_FIXTURES, STEPS_FIXTURE_FILE, TIMELINE_FIXTURE_FILE, renderStepsTimelineFixture,
} from '../ssr/steps-timeline.mjs';
import { STATE_CASES, SUMMARY_CASES, STEPS_LABELS, normalizeSteps } from '../../src/utils/steps-model.js';
import {
  INSTANT_CASES, DAY_CASES, TIMELINE_LABELS, normalizeItems, parseInstant, isoOf,
} from '../../src/utils/timeline-model.js';
import { HREF_CASES } from '../../src/utils/filter-chips-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Calls of `fn` in ONE php process (default zone UTC), each with its td_* E_USER_WARNING messages collected (any other
 * warning / notice fails). `fn` = td_steps | td_timeline | an internal td__* helper.
 * @returns {Array<{ out: any, warns: string[] }>}
 */
function run(fn, calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; date_default_timezone_set('UTC'); TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $calls = json_decode((string) file_get_contents(\'php://stdin\'), true, 64, JSON_THROW_ON_ERROR); $out = [];'
    + ' foreach ($calls as $a) { $w = []; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && preg_match('/^td_(steps|timeline):/', $msg)) { $w[] = $msg; return true; } return false; });"
    + ` $r = ${fn}(...$a); restore_error_handler(); $out[] = ['out' => $r, 'warns' => $w]; }`
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', input: JSON.stringify(calls), maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}

/** Per li of a td_steps markup: key, state, tag of the step, aria-current, js-step marker, href. */
function stepsOf(html) {
  const out = [];
  const re = /<li class="td-steps__item" data-key="([^"]*)" data-state="([a-z]+)"( data-disabled)?><(span|a) class="td-steps__step"( href="[^"]*")?( data-td-js-step)?( aria-current="step")?>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({ key: unesc(m[1]), state: m[2], disabled: !!m[3], tag: m[4], href: m[5] ? unesc(m[5].slice(7, -1)) : null, js: !!m[6], current: !!m[7] });
  }
  return out;
}
const codesOf = (warns) => warns.filter((w) => /^td_steps: [a-z-]+(, [a-z-]+)* —/.test(w)).flatMap((w) => w.slice(10, w.indexOf(' —')).split(', '));

describe('php/td.php — td_steps (v0.45.0, contract steps@1)', opts, () => {
  test('fixtures fresh: test/ssr/fixtures/steps.html + timeline.html = what php/td.php prints now', () => {
    assert.equal(readFileSync(STEPS_FIXTURE_FILE, 'utf8'), renderStepsTimelineFixture('steps'), 'run: node test/ssr/build-steps-timeline-fixture.mjs');
    assert.equal(readFileSync(TIMELINE_FIXTURE_FILE, 'utf8'), renderStepsTimelineFixture('timeline'), 'run: node test/ssr/build-steps-timeline-fixture.mjs');
  });

  test('exact tree of a basic case (host, wrapper, li, marker, label, state text, description, summary)', () => {
    const [{ out, warns }] = run('td_steps', [[[{ label: 'A' }, { label: 'B', description: 'mô tả' }], { current: '2' }]]);
    assert.deepEqual(warns, []);
    const icon = run('TdComponents\\Td::icon', [['check']])[0].out;
    assert.equal(out, '<td-steps data-td-ssr="steps@1" current="2"><div class="td-steps" role="group" aria-label="Tiến trình"><ol class="td-steps__list" role="list">'
      + `<li class="td-steps__item" data-key="1" data-state="done"><span class="td-steps__step"><span class="td-steps__marker" aria-hidden="true"><span class="td-steps__icon" data-td-icon="check">${icon}</span></span>`
      + '<span class="td-steps__label">A</span><span class="td-sr-only">, đã xong</span></span></li>'
      + '<li class="td-steps__item" data-key="2" data-state="current"><span class="td-steps__step" aria-current="step"><span class="td-steps__marker" aria-hidden="true">2</span>'
      + '<span class="td-steps__label">B</span><span class="td-sr-only"></span><span class="td-steps__desc">mô tả</span></span></li>'
      + '</ol><p class="td-steps__summary" aria-hidden="true">Bước 2/2: B</p></div></td-steps>');
  });

  test('STATE_CASES parity (review R1-1): states, ONE aria-current, warning codes, clickable steps per navigation', () => {
    const calls = [];
    for (const c of STATE_CASES) {
      const steps = c.steps.map((s) => ({ ...s, label: `Bước ${s.key}` }));
      for (const navigation of ['none', 'back', 'all']) calls.push([steps, { current: c.current, complete: c.complete, navigation }]);
    }
    const outs = run('td_steps', calls);
    STATE_CASES.forEach((c, ci) => {
      ['none', 'back', 'all'].forEach((nav, ni) => {
        const { out, warns } = outs[ci * 3 + ni];
        const s = stepsOf(out);
        assert.deepEqual(s.map((x) => x.state), c.states, `${c.name} states`);
        assert.equal(s.filter((x) => x.current).length, c.anchor >= 0 ? 1 : 0, c.name);
        if (c.anchor >= 0) assert.equal(s[c.anchor].current, true, c.name);
        assert.deepEqual(codesOf(warns), c.warnings, `${c.name} warnings`);
        const clickable = s.map((x, i) => (x.js || x.tag === 'a' ? i : -1)).filter((i) => i >= 0);
        assert.deepEqual(clickable, nav === 'none' ? [] : c[nav], `${c.name} ${nav}`);
        assert.equal(out.includes('<nav class="td-steps"'), nav !== 'none' && c.steps.length >= 0, `${c.name} ${nav} wrapper`);
      });
    });
  });

  test('SUMMARY_CASES parity (review R2-5): compact summary text; 0 steps → host hidden, no summary', () => {
    const outs = run('td_steps', SUMMARY_CASES.map((c) => [c.labels.map((label, i) => (c.states[i] ? { label, state: c.states[i] } : { label })),
      { current: c.current, complete: c.complete }]));
    SUMMARY_CASES.forEach((c, i) => {
      const m = /<p class="td-steps__summary" aria-hidden="true">([^<]*)<\/p>/.exec(outs[i].out);
      assert.equal(m ? unesc(m[1]) : '', c.text, c.name);
      assert.equal(/^<td-steps[^>]* hidden>/.test(outs[i].out), c.labels.length === 0, c.name);
    });
  });

  test('every fixture case: states / anchor / summary / tags (PHP side) / warnings = expect', () => {
    const outs = run('td_steps', STEPS_FIXTURES.cases.map((c) => c.args));
    STEPS_FIXTURES.cases.forEach((c, i) => {
      const s = stepsOf(outs[i].out);
      assert.deepEqual(s.map((x) => x.state), c.expect.states, c.id);
      assert.equal(s.findIndex((x) => x.current), c.expect.anchor, c.id);
      assert.deepEqual(s.map((x) => (x.js ? 'button' : x.tag)), c.expect.tags, c.id);
      assert.deepEqual(codesOf(outs[i].warns), c.expect.warnings, c.id);
      const m = /<p class="td-steps__summary" aria-hidden="true">([^<]*)<\/p>/.exec(outs[i].out);
      assert.equal(m ? unesc(m[1]) : null, c.expect.summary, c.id);
    });
  });

  test('normalisation parity with normalizeSteps (types, control characters, lengths, keys, duplicates, cap, hrefs)', () => {
    const long = '😀'.repeat(400);
    const input = [{ label: `a\u0000b\u0085${long}`, key: long, description: long }, { label: 5, key: 'k' }, { label: 'x', key: 'k' },
      { label: '   ' }, { label: 'y', key: {} }, { label: 'z', state: 'nope', href: '/ok?a=1', disabled: 1 }, { label: 'w', href: '//evil.example' },
      ...Array.from({ length: 25 }, (_, i) => ({ label: `S${i}` }))];
    const [{ out, warns }] = run('td_steps', [[input, { navigation: 'all' }]]);
    const js = normalizeSteps(input, { baseURI: 'https://shop.example/', origin: 'https://shop.example' }).steps;
    const php = stepsOf(out);
    assert.equal(php.length, js.length);
    assert.deepEqual(php.map((p) => p.key), js.map((s) => s.key));
    const labels = [...out.matchAll(/<span class="td-steps__label">([^<]*)<\/span>/g)].map((m) => unesc(m[1]));
    assert.deepEqual(labels, js.map((s) => s.label));
    assert.deepEqual(php.map((p) => p.href), js.map((s) => s.href ?? null));
    assert.equal(warns.length, 3, 'dropped + capped + renamed');
  });

  test('HREF_CASES (PHP column): a step link is relative only', () => {
    const outs = run('td_steps', HREF_CASES.map(([href]) => [[{ label: 'A', href }, { label: 'B' }], { current: '2', navigation: 'back' }]));
    HREF_CASES.forEach(([href, , php], i) => assert.equal(stepsOf(outs[i].out)[0].href, php, JSON.stringify(href)));
  });

  test('escaping + host attrs: text escaped; label trimmed for aria-label; owned names / data-td-* / handlers dropped', () => {
    const c = STEPS_FIXTURES.cases.find((x) => x.id === 's-special');
    const [{ out }] = run('td_steps', [c.args]);
    assert.ok(out.includes(`<span class="td-steps__label">${esc(c.args[0][0].label)}</span>`));
    assert.ok(out.includes(`data-key="${esc(c.args[0][0].key)}"`));
    assert.ok(!/<img|<svg onload/.test(out));
    const v = STEPS_FIXTURES.cases.find((x) => x.id === 's-vertical');
    const host = /^<td-steps[^>]*>/.exec(run('td_steps', [v.args])[0].out)[0];
    assert.equal(host, '<td-steps data-td-ssr="steps@1" id="st-v" class="my-steps" current="check" orientation="vertical" narrow="vertical" data-scope="import">');
    const own = run('td_steps', [[[{ label: 'A' }], { label: '  Nhập kho  ', attrs: { current: '9', label: 'x', 'data-td-ssr': 'x@2', hidden: true } }]])[0].out;
    assert.match(own, /^<td-steps data-td-ssr="steps@1" label="  Nhập kho  "><div class="td-steps" role="group" aria-label="Nhập kho">/);
  });

  test('labels parity: Td::STEPS_LABELS = STEPS_LABELS, Td::TIMELINE_LABELS = TIMELINE_LABELS', () => {
    const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; echo json_encode([TdComponents\\Td::STEPS_LABELS, TdComponents\\Td::TIMELINE_LABELS], JSON_UNESCAPED_UNICODE);`], { encoding: 'utf8' });
    const [s, t] = JSON.parse(r.stdout);
    assert.deepEqual(s, { ...STEPS_LABELS });
    assert.deepEqual(t, { ...TIMELINE_LABELS, weekdays: [...TIMELINE_LABELS.weekdays] });
  });
});

/** Items of a td_timeline markup in DOM order: id, tone, time (datetime), time text, title, href, group key. */
function timelineOf(html) {
  const groups = [];
  const gre = /<div class="td-timeline__day" data-day="([^"]*)">(?:<h(\d) class="td-timeline__day-title"><(time|span) class="td-timeline__day-label"(?: datetime="([^"]*)")?>([^<]*)<\/(?:time|span)><\/h\d>)?<ol class="td-timeline__list" role="list">(.*?)<\/ol><\/div>/gs;
  let g;
  while ((g = gre.exec(html))) {
    const items = [...g[6].matchAll(/<li class="td-timeline__item" data-id="([^"]*)" data-tone="([a-z]+)">.*?<\/li>/gs)].map((m) => {
      const li = m[0];
      const t = /<time class="td-timeline__time" datetime="([^"]*)">([^<]*)<\/time>/.exec(li);
      return { id: unesc(m[1]), tone: m[2], time: t ? t[1] : null, text: t ? t[2] : null };
    });
    groups.push({ key: g[1], level: g[2] ? Number(g[2]) : null, labelTag: g[3] || null, datetime: g[4] ?? null, label: g[5] != null ? unesc(g[5]) : null, items });
  }
  return groups;
}

describe('php/td.php — td_timeline (v0.45.0, contract timeline@1)', opts, () => {
  test('INSTANT_CASES parity (QĐ T3; dsuite 6-digit fractions truncated to ms like JS)', () => {
    const outs = run('td__timeline_instant', INSTANT_CASES.map(([v]) => [v]));
    INSTANT_CASES.forEach(([v, want], i) => assert.equal(outs[i].out, want, JSON.stringify(v)));
    const iso = run('td__timeline_iso', [[Date.UTC(2026, 9, 6, 3, 15, 22, 123)], [Date.UTC(1969, 11, 31, 23, 59, 59, 1)], [0]]);
    assert.deepEqual(iso.map((o) => o.out), [isoOf(Date.UTC(2026, 9, 6, 3, 15, 22, 123)), isoOf(Date.UTC(1969, 11, 31, 23, 59, 59, 1)), isoOf(0)]);
  });

  test('DAY_CASES parity (QĐ T5): group key + label across 00:00 Vietnam, year end, 29/02, DST', () => {
    const outs = run('td_timeline', DAY_CASES.map(([iso, tz, now]) => [[{ id: 'x', time: iso, title: 'x' }], { time_zone: tz, now }]));
    DAY_CASES.forEach(([iso, tz, , key, label], i) => {
      const [g] = timelineOf(outs[i].out);
      assert.equal(g.key, key, `${iso} ${tz}`);
      assert.equal(g.datetime, key);
      assert.equal(g.label, label, `${iso} ${tz}`);
    });
  });

  test('every fixture case: printed zone, groups (key, label, ids), warnings; unknown group = span label, last, no <time>', () => {
    const outs = run('td_timeline', TIMELINE_FIXTURES.cases.map((c) => c.args));
    TIMELINE_FIXTURES.cases.forEach((c, i) => {
      const { out, warns } = outs[i];
      assert.match(out, new RegExp(`^<td-timeline data-td-ssr="timeline@1"[^>]* time-zone="${c.expect.tz}"`), c.id);
      const gs = timelineOf(out);
      assert.deepEqual(gs.map((g) => [g.key, g.label, g.items.map((it) => it.id)]), c.expect.groups, c.id);
      assert.equal(warns.length, c.expect.warns, `${c.id}: ${warns.join(' | ')}`);
      for (const g of gs) {
        if (g.key === 'unknown') {
          assert.equal(g.labelTag, 'span', c.id);
          assert.equal(g.items.every((it) => it.time === null), true, c.id);
          assert.equal(gs[gs.length - 1] === g, true, `${c.id}: unknown last`);
        } else if (g.key === 'all') assert.equal(g.labelTag, null, c.id);
        else assert.equal(g.labelTag, 'time', c.id);
      }
      if (c.expect.more) assert.ok(out.includes(`<a class="td-btn td-btn--secondary td-timeline__more" href="${esc(c.expect.more)}">`), c.id);
      else assert.ok(!out.includes('td-timeline__more'), `${c.id}: no "Xem thêm" without more_href`);
      if (c.expect.empty) assert.ok(out.includes(`<p class="td-timeline__empty">${esc(c.expect.empty)}</p>`), c.id);
    });
  });

  test('normalisation parity with normalizeItems (order, ids, times, tones, links, actor, meta, icon, details text, lazy ignored)', () => {
    const long = '😀'.repeat(6000);
    const input = [
      { id: 'a', time: '2026-10-05T01:00:00.987654Z', title: `t\u0000${long}`, actor: long, meta: long, details: `x\r\ny\u0085${long}`, icon: 'pencil', tone: 'success' },
      { id: 'a', time: 1791162000, title: 'dup', actor: { name: 'B', href: '?u=1' }, href: '/x', tone: 'nope', expanded: true, details: 'd' },
      { time: '2026-10-05 14:00', title: 'zone-less', icon: 'Bad', details: true },
      { title: '  ' }, 'junk', { time: 0, title: 0 },
    ];
    const [{ out, warns }] = run('td_timeline', [[input, { time_zone: 'UTC', now: '2026-10-05T03:00:00Z' }]]);
    assert.equal(warns.length, 3, warns.join(' | ')); // dropped, renamed, unknown time
    const js = normalizeItems(input, { baseURI: 'https://shop.example/', origin: 'https://shop.example' }).items;
    const php = timelineOf(out).flatMap((g) => g.items);
    const order = [...js].sort((x, y) => (x.time === null) - (y.time === null) || (y.time ?? 0) - (x.time ?? 0));
    assert.deepEqual(php.map((p) => p.id), order.map((j) => j.id));
    assert.deepEqual(php.map((p) => p.tone), order.map((j) => j.tone));
    assert.deepEqual(php.map((p) => p.time), order.map((j) => (j.time === null ? null : isoOf(j.time))));
    const titles = [...out.matchAll(/class="td-timeline__title"(?: href="[^"]*")?>([^<]*)</g)].map((m) => unesc(m[1]));
    assert.deepEqual(titles, order.map((j) => j.title));
    const details = [...out.matchAll(/<div class="td-timeline__detail">([^<]*)<\/div>/g)].map((m) => unesc(m[1]));
    assert.deepEqual(details, order.filter((j) => typeof j.details === 'string').map((j) => j.details));
    assert.ok(out.includes('<a class="td-timeline__actor" href="?u=1">B</a>'));
    assert.ok(out.includes(' open><summary'));
  });

  test('HREF_CASES (PHP column): title / actor / more links are relative only', () => {
    const outs = run('td_timeline', HREF_CASES.map(([href]) => [[{ id: 'x', time: 0, title: 'T', href, actor: { name: 'A', href } }], { time_zone: 'UTC', has_more: true, more_href: href }]));
    HREF_CASES.forEach(([href, , php], i) => {
      const out = outs[i].out;
      const t = /<a class="td-timeline__title" href="([^"]*)">/.exec(out);
      const a = /<a class="td-timeline__actor" href="([^"]*)">/.exec(out);
      const m = /<a class="td-btn td-btn--secondary td-timeline__more" href="([^"]*)">/.exec(out);
      for (const got of [t, a, m]) assert.equal(got ? unesc(got[1]) : null, php, JSON.stringify(href));
    });
  });

  test('TZ_CASES (review R1-3): IANA names printed as given; offsets / abbreviations / junk → default zone + ONE warning', () => {
    const TZ_CASES = [['Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh', 0], ['UTC', 'UTC', 0], ['Europe/Berlin', 'Europe/Berlin', 0],
      ['Mars/Base', 'UTC', 1], ['+07:00', 'UTC', 1], ['ICT', 'UTC', 1], ['', 'UTC', 1], [['UTC'], 'UTC', 1], [7, 'UTC', 1]];
    const outs = run('td_timeline', TZ_CASES.map(([tz]) => [[{ id: 'x', time: '2026-10-04T17:30:00Z', title: 'x' }], { time_zone: tz, now: '2026-10-05T03:00:00Z' }]));
    TZ_CASES.forEach(([tz, want, w], i) => {
      assert.match(outs[i].out, new RegExp(`time-zone="${want.replace('+', '\\+')}"`), JSON.stringify(tz));
      assert.equal(outs[i].warns.length, w, JSON.stringify(tz));
      const [g] = timelineOf(outs[i].out);
      assert.equal(g.key, want === 'Asia/Ho_Chi_Minh' ? '2026-10-05' : '2026-10-04', JSON.stringify(tz));
    });
    const def = run('td_timeline', [[[{ time: 0, title: 'x' }], {}]])[0];
    assert.match(def.out, /time-zone="UTC"/);
    assert.equal(def.warns.length, 0);
  });

  test('escaping + host attrs: every field escaped; heading level; owned names / data-td-* / handlers / loading dropped', () => {
    const x = '<img src=x onerror=alert(1)>"\'&';
    const [{ out }] = run('td_timeline', [[[{ id: x, time: 0, title: x, actor: x, meta: x, details: x }], { time_zone: 'UTC', heading_level: 5, empty_text: x }]]);
    assert.ok(!out.includes('<img'));
    for (const cls of ['td-timeline__title', 'td-timeline__actor', 'td-timeline__meta']) assert.ok(out.includes(`class="${cls}">${esc(x)}<`), cls);
    assert.ok(out.includes(`data-id="${esc(x)}"`));
    assert.ok(out.includes('<h5 class="td-timeline__day-title">'));
    assert.ok(out.includes(` heading-level="5" empty-text="${esc(x)}"`));
    const c = TIMELINE_FIXTURES.cases.find((k) => k.id === 't-more');
    const host = /^<td-timeline[^>]*>/.exec(run('td_timeline', [c.args])[0].out)[0];
    assert.equal(host, '<td-timeline data-td-ssr="timeline@1" id="tl-more" class="orders" time-zone="UTC" has-more more-href="?page=2" data-scope="orders">');
    assert.equal(parseInstant('2026-10-05T01:00:00Z'), Date.UTC(2026, 9, 5, 1));
  });
});
