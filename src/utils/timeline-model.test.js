// v0.45.0 (plan v0.45.0-steps-timeline QĐ T1–T5, T10, M1) — pure model of <td-timeline>. Deterministic: every case names
// its zone and its "now" (CI runs in UTC, dev machines in Asia/Ho_Chi_Minh). INSTANT_CASES / DAY_CASES are the parity
// tables PHP td_timeline is tested against (test/php/td-ssr-steps-timeline.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInstant, isoOf, normalizeItems, sortItems, groupItems, dayLabel, timeText, lastKnown, mergeAppend, shiftDay,
  cleanMultiline, Generation, INSTANT_CASES, DAY_CASES, TL_LIMITS, MAX_ITEMS, TIMELINE_LABELS,
} from './timeline-model.js';
import { dayKey } from './datetime.js';

const HTTPS = { baseURI: 'https://shop.example/orders/1', origin: 'https://shop.example' };
const VN = 'Asia/Ho_Chi_Minh';

describe('timeline-model — parseInstant (QĐ T3)', () => {
  for (const [input, want] of INSTANT_CASES) {
    test(`INSTANT_CASES ${JSON.stringify(input)} → ${want}`, () => assert.equal(parseInstant(input), want));
  }
  test('Date objects; invalid Date / NaN / Infinity / objects → null', () => {
    assert.equal(parseInstant(new Date(Date.UTC(2026, 0, 1))), Date.UTC(2026, 0, 1));
    for (const v of [new Date('x'), Number.NaN, Infinity, {}, [], undefined]) assert.equal(parseInstant(v), null);
  });
  test('isoOf: canonical UTC ms ISO', () => {
    assert.equal(isoOf(parseInstant('2026-10-06T10:15:22.987654+07:00')), '2026-10-06T03:15:22.987Z');
  });
});

describe('timeline-model — normalizeItems', () => {
  test('defaults, tone whitelist, actor two forms, href / actor.href policy, icon names, details text / lazy, expanded', () => {
    const r = normalizeItems([
      { time: '2026-10-05T07:00:00Z', title: 'Tạo đơn' },
      { id: 9, time: 1759651200, title: 'Giao', tone: 'success', actor: 'An', meta: 'Kho HN', icon: 'send', details: 'a\r\nb\u0000', expanded: true, href: '/o/1' },
      { title: 'X', tone: 'bogus', actor: { name: 'Bình', href: 'javascript:alert(1)' }, icon: 'Bad Name', details: true, href: 'https://evil.example/' },
      { title: 'Y', time: '2026-10-05 14:00', actor: { name: 'C', href: '?u=3' }, details: 42, expanded: 1 },
    ], HTTPS);
    assert.deepEqual(r.items, [
      { id: '1', time: Date.UTC(2026, 9, 5, 7), title: 'Tạo đơn', tone: 'neutral', expanded: false },
      { id: '9', time: 1759651200000, title: 'Giao', tone: 'success', expanded: true, href: '/o/1', actor: { name: 'An' }, meta: 'Kho HN', icon: 'send', details: 'a\nb' },
      { id: '3', time: null, title: 'X', tone: 'neutral', expanded: false, actor: { name: 'Bình' }, details: true },
      { id: '4', time: null, title: 'Y', tone: 'neutral', expanded: false, actor: { name: 'C', href: '?u=3' }, details: '42' },
    ]);
    assert.equal(r.untimed, 2);
    assert.equal(r.dropped, 0);
  });
  test('dropped: no / blank / non-text title, non-objects; blank actor / meta / details ignored', () => {
    const r = normalizeItems([null, 1, [], {}, { title: ' ' }, { title: {} }, { title: 'ok', actor: ' ', meta: '', details: '  \n' }]);
    assert.equal(r.dropped, 6);
    assert.deepEqual(r.items, [{ id: '1', time: null, title: 'ok', tone: 'neutral', expanded: false }]);
  });
  test('limits in code points; details keep LF and TAB; duplicate ids → suffix; start offsets default ids', () => {
    const e = '😀'.repeat(6000);
    const [it] = normalizeItems([{ title: e, actor: e, meta: e, details: `x\ty\n${e}`, id: e }]).items;
    assert.equal(Array.from(it.title).length, TL_LIMITS.title);
    assert.equal(Array.from(it.actor.name).length, TL_LIMITS.actor);
    assert.equal(Array.from(it.meta).length, TL_LIMITS.meta);
    assert.equal(Array.from(it.details).length, TL_LIMITS.details);
    assert.ok(it.details.startsWith('x\ty\n'));
    assert.equal(Array.from(it.id).length, TL_LIMITS.id);
    const d = normalizeItems([{ id: 'a', title: '1' }, { id: 'a', title: '2' }, { title: '3' }], { start: 50 });
    assert.deepEqual(d.items.map((i) => i.id), ['a', 'a-2', '53']);
    assert.equal(d.renamed, 1);
    assert.equal(cleanMultiline('a\rb\u0085c', 10), 'a\nbc');
  });
  test(`cap: ${MAX_ITEMS} items kept`, () => {
    const r = normalizeItems(Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({ title: `t${i}` })));
    assert.equal(r.items.length, MAX_ITEMS);
    assert.equal(r.capped, true);
  });
});

const T = (iso, id) => ({ id, time: parseInstant(iso), title: id, tone: 'neutral', expanded: false });
const U = (id) => ({ id, time: null, title: id, tone: 'neutral', expanded: false });

describe('timeline-model — sort / group (QĐ T2, T3, T5, T9)', () => {
  test('stable sort desc / asc; same instant keeps the given order; unknown-time items last in given order', () => {
    const list = [U('u1'), T('2026-10-05T01:00:00Z', 'a'), T('2026-10-05T03:00:00Z', 'b'), U('u2'), T('2026-10-05T01:00:00Z', 'c')];
    assert.deepEqual(sortItems(list, 'desc').map((i) => i.id), ['b', 'a', 'c', 'u1', 'u2']);
    assert.deepEqual(sortItems(list, 'asc').map((i) => i.id), ['a', 'c', 'b', 'u1', 'u2']);
  });
  test('grouped by calendar day in the zone (17:30Z → next day in Vietnam); one unknown group, last; group none', () => {
    const list = sortItems([T('2026-10-04T17:30:00Z', 'vn-midnight'), T('2026-10-04T16:00:00Z', 'prev'), U('u')], 'desc');
    assert.deepEqual(groupItems(list, 'day', VN).map((g) => [g.key, g.items.map((i) => i.id)]),
      [['2026-10-05', ['vn-midnight']], ['2026-10-04', ['prev']], ['unknown', ['u']]]);
    assert.deepEqual(groupItems(list, 'day', 'UTC').map((g) => g.key), ['2026-10-04', 'unknown']);
    assert.deepEqual(groupItems(list, 'none', VN).map((g) => [g.key, g.items.length]), [['all', 2], ['unknown', 1]]);
    assert.deepEqual(groupItems([U('x')], 'none', VN).map((g) => g.key), ['unknown']);
    assert.deepEqual(groupItems([], 'day', VN), []);
  });
  for (const [iso, tz, now, key, label] of DAY_CASES) {
    test(`DAY_CASES ${iso} in ${tz} (now ${now}) → ${key} "${label}"`, () => {
      assert.equal(dayKey(parseInstant(iso), tz), key);
      assert.equal(dayLabel(key, tz, parseInstant(now)), label);
    });
  }
  test('timeText: HH:mm (day groups) / dd/mm/yyyy HH:mm (group none), in the zone', () => {
    const t = parseInstant('2026-10-04T17:30:00Z');
    assert.equal(timeText(t, VN, 'day'), '00:30');
    assert.equal(timeText(t, VN, 'none'), '05/10/2026 00:30');
    assert.equal(timeText(t, 'UTC', 'none'), '04/10/2026 17:30');
  });
  test('shiftDay: month / year / leap boundaries; site labels', () => {
    assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
    assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');
    assert.equal(dayLabel('2026-10-03', VN, parseInstant('2026-10-05T03:00:00Z'), { day: '{dd}.{mm}.{yyyy} ({weekday})', weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] }), '03.10.2026 (Sa)');
    assert.equal(TIMELINE_LABELS.weekdays.length, 7);
  });
});

describe('timeline-model — "Xem thêm" (QĐ T10, review R1-2)', () => {
  const page1 = () => sortItems([T('2026-10-05T05:00:00Z', 'a'), T('2026-10-05T03:00:00Z', 'b'), U('u1')], 'desc');
  test('lastKnown skips unknown-time items; null when only unknown', () => {
    assert.equal(lastKnown(page1()).id, 'b');
    assert.equal(lastKnown([U('x'), U('y')]), null);
    assert.equal(lastKnown([]), null);
  });
  for (const order of ['desc', 'asc']) {
    test(`${order}: known items before the unknown group (kept last, arrival order); overlap dropped; out-of-order placed by time`, () => {
      const start = sortItems([T('2026-10-05T05:00:00Z', 'a'), T('2026-10-05T03:00:00Z', 'b'), U('u1')], order);
      const page = [T('2026-10-04T23:00:00Z', 'c'), U('u2'), T('2026-10-05T03:00:00Z', 'b'), T('2026-10-05T09:00:00Z', 'late'), T('2026-10-05T03:00:00Z', 'tie')];
      const { list, added } = mergeAppend(start, page, order);
      assert.deepEqual(added.map((i) => i.id), ['c', 'u2', 'late', 'tie']);
      const ids = list.map((i) => i.id);
      assert.deepEqual(ids.slice(-2), ['u1', 'u2']);
      assert.deepEqual(ids.slice(0, -2), order === 'desc' ? ['late', 'a', 'b', 'tie', 'c'] : ['c', 'b', 'tie', 'a', 'late']);
      // same day merges into the existing group (no second heading)
      const keys = groupItems(list, 'day', VN).map((g) => g.key);
      assert.equal(new Set(keys).size, keys.length);
      // a page of only unknown items
      const only = mergeAppend(start, [U('u9')], order).list.map((i) => i.id);
      assert.deepEqual(only.slice(-2), ['u1', 'u9']);
    });
  }
  test('Generation: only the current generation applies', () => {
    const g = new Generation();
    const a = g.next();
    assert.equal(g.isCurrent(a), true);
    g.next();
    assert.equal(g.isCurrent(a), false);
  });
});
