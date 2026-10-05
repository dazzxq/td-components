import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-timeline> is defined LATE (dynamic import below), after the no-JS checks.

// v0.45.0 (ADR 0012, plan docs/internal/plans/v0.45.0-steps-timeline.md QĐ G3 / T3–T10, review R1-3 / R2-4, M4) —
// td_timeline() / <td-timeline> hydrate in place, contract `timeline@1`. Chromium, Firefox AND WebKit (group `engines`).
// The markup is EXACTLY what php/td.php prints for every case of test/ssr/timeline.fixtures.json:
// test/ssr/fixtures/timeline.html (`node test/ssr/build-steps-timeline-fixture.mjs`, kept fresh by
// test/php/td-ssr-steps-timeline.test.js). Before the import the page is the no-JS page (<details> open natively, the
// "Xem thêm" link works). Deterministic: every host gets the fixture's `now` early (day labels), zones are explicit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/timeline.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/timeline.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;

const root = document.createElement('div');
root.style.width = '720px';
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const caseOf = (id) => SPEC.cases.find((c) => c.id === id);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-timeline`);
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-timeline`).outerHTML;
for (const c of SPEC.cases) hostOf(c.id).now = new Date(c.expect.browserNow || c.args[1].now || '2026-10-05T03:00:00Z');

// Tampered markup (review R2-4 structures included) → not adopted: rendered EMPTY + one warning each.
const basic = hostHtml('t-basic');
const unknown = hostHtml('t-unknown-day');
const details = hostHtml('t-details');
const unknownGroup = /<div class="td-timeline__day" data-day="unknown">.*?<\/ol><\/div>/s.exec(unknown)[0];
const MM = {
  'mm-unknown-time': unknown.replace('<span class="td-timeline__day-label">Không rõ thời gian</span>', '<span class="td-timeline__day-label">Không rõ thời gian</span><time datetime="2026-10-05">x</time>'),
  'mm-unknown-as-time': unknown.replace('<span class="td-timeline__day-label">Không rõ thời gian</span>', '<time class="td-timeline__day-label">Không rõ thời gian</time>'),
  'mm-day-as-span': basic.replace('<time class="td-timeline__day-label" datetime="2026-10-04">Hôm qua</time>', '<span class="td-timeline__day-label">Hôm qua</span>'),
  'mm-unknown-first': unknown.replace(unknownGroup, '').replace('<div class="td-timeline">', `<div class="td-timeline">${unknownGroup}`),
  'mm-unknown-twice': unknown.replace(unknownGroup, unknownGroup + unknownGroup.replaceAll('data-id="u', 'data-id="v')),
  'mm-unknown-item-time': unknown.replace('<span class="td-timeline__title">Chỉ ngày</span>', '<span class="td-timeline__title">Chỉ ngày</span><time class="td-timeline__time" datetime="2026-10-05T01:00:00.000Z">08:00</time>'),
  'mm-day-mismatch': basic.replace('data-day="2026-10-04"', 'data-day="2026-10-03"'),
  'mm-time-group': basic.replace('datetime="2026-10-04T16:59:00.123Z"', 'datetime="2026-10-05T16:59:00.123Z"'),
  'mm-time-text': basic.replace('>23:59</time>', '>22:59</time>'),
  'mm-onclick': basic.replace('<span class="td-timeline__title">Liên hệ', '<span onclick="window.__pwned=1" class="td-timeline__title">Liên hệ'),
  'mm-style': basic.replace('<div class="td-timeline">', '<div class="td-timeline" style="color:red">'),
  'mm-extra': basic.replace('<span class="td-timeline__title">Liên hệ', '<b>thừa</b><span class="td-timeline__title">Liên hệ'),
  'mm-href': details.replace('href="/don/12"', 'href="javascript:alert(1)"'),
  'mm-icon': basic.replace(/<span class="td-timeline__icon" data-td-icon="plus">.*?<\/span>/s, '<span class="td-timeline__icon" data-td-icon="plus"><i>x</i></span>'),
  // ISSUE-1: an icon slot holds nothing or EXACTLY the registry SVG
  'mm-icon-attr': basic.replace('data-icon="plus"', 'data-icon="plus" data-x="1"'),
  'mm-icon-child': basic.replace(/(data-icon="plus"[^>]*>)/, '$1<circle cx="1" cy="1" r="1"></circle>'),
  'mm-icon-path': basic.replace(/(data-icon="plus"[^>]*>)<path d="[^"]*"/, '$1<path d="M0 0h24"'),
  'mm-zone': basic.replace('time-zone="Asia/Ho_Chi_Minh"', 'time-zone="Europe/Berlin"'),
  'mm-schema': basic.replace('timeline@1', 'timeline@2'),
};
for (const [id, h] of Object.entries(MM)) if ([basic, unknown, details].includes(h)) throw new Error(`${id}: the tamper did not apply`);
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => html.replace('<td-timeline ', `<td-timeline id="${id}" `)).join('');
document.body.appendChild(mismatch);
for (const id of Object.keys(MM)) document.getElementById(id).now = new Date('2026-10-05T03:00:00Z');

// review R1-3: a zone this browser does not know → rendered from the items READ from the markup, browser zone, one warning
const zoneWrap = document.createElement('div');
zoneWrap.innerHTML = basic.replace('time-zone="Asia/Ho_Chi_Minh"', 'time-zone="Mars/Base"').replace('<td-timeline ', '<td-timeline id="bad-zone" ');
document.body.appendChild(zoneWrap);

// Early items win; early loadMore on a server host with has-more and no more_href → the JS button appears after adoption
const early = document.createElement('div');
early.innerHTML = basic.replace('<td-timeline ', '<td-timeline id="early" ');
document.body.appendChild(early);
document.getElementById('early').items = [{ id: 'z', time: '2026-10-05T01:00:00Z', title: 'Sớm thắng' }];
hostOf('t-empty').loadMore = async () => ({ items: [] });

// No JS: a closed <details> opens natively (user action before the module loads) and stays open after the hydrate.
const userOpened = hostOf('t-details').querySelector('li[data-id="d2"] details');
const noJs = {
  detailsWasClosed: !userOpened.open,
  moreHref: hostOf('t-more').querySelector('a.td-timeline__more')?.getAttribute('href'),
  moreDisplay: getComputedStyle(hostOf('t-more').querySelector('a.td-timeline__more')).display,
  spinnerHidden: hostOf('t-more').querySelector('.td-btn__spinner').hidden,
  buttons: root.querySelectorAll('button').length,
};
userOpened.querySelector('summary').click();
await new Promise((r) => setTimeout(r, 0));
noJs.openedNatively = userOpened.open;

const before = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  before[c.id] = {
    lis: [...host.querySelectorAll('li')],
    box: host.querySelector('.td-timeline'),
    labels: [...host.querySelectorAll('.td-timeline__day-label')],
    height: host.getBoundingClientRect().height,
  };
}

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
await import('./td-timeline.js');
console.warn = origWarn;
const groupsOf = (host) => [...host.querySelectorAll('.td-timeline__day')].map((g) => [g.dataset.day,
  g.querySelector('.td-timeline__day-label')?.textContent ?? null, [...g.querySelectorAll('li')].map((li) => li.dataset.id)]);

describe('td-timeline SSR (timeline@1) — no JS', () => {
  it('details open natively, the "Xem thêm" link works (spinner hidden), no button anywhere', () => {
    expect(noJs.detailsWasClosed).to.equal(true);
    expect(noJs.openedNatively).to.equal(true);
    expect(noJs.moreHref).to.equal('?page=2');
    expect(noJs.moreDisplay).to.not.equal('none');
    expect(noJs.spinnerHidden).to.equal(true);
    expect(noJs.buttons).to.equal(0);
  });
});

describe('td-timeline SSR (timeline@1) — adopted in place + PHP ↔ JS parity', () => {
  for (const c of SPEC.cases) {
    it(`${c.id}: same nodes, marker consumed, zone, groups, items read back; no layout shift`, () => {
      const host = hostOf(c.id);
      expect(host.hasAttribute('data-td-ssr')).to.equal(false);
      expect(host.getAttribute('time-zone')).to.equal(c.expect.tz);
      expect(host.querySelector('.td-timeline') === before[c.id].box, 'box kept').to.equal(true);
      const lis = [...host.querySelectorAll('li')];
      expect(lis.length).to.equal(before[c.id].lis.length);
      expect(lis.every((li, i) => li === before[c.id].lis[i]), 'li kept').to.equal(true);
      expect([...host.querySelectorAll('.td-timeline__day-label')].every((n, i) => n === before[c.id].labels[i]), 'labels kept').to.equal(true);
      const want = c.expect.groups.map((g) => (c.expect.browserLabel && g[0] !== 'unknown' ? [g[0], c.expect.browserLabel, g[2]] : g));
      expect(groupsOf(host)).to.deep.equal(want);
      expect(host.items.map((i) => i.id)).to.deep.equal(c.expect.groups.flatMap((g) => g[2]));
      for (const t of host.querySelectorAll('li time.td-timeline__time')) {
        const it = host.items.find((i) => i.id === t.closest('li').dataset.id);
        expect(t.getAttribute('datetime')).to.equal(it.time);
      }
      for (const s of host.querySelectorAll('.td-timeline__chevron')) expect(s.querySelector('svg'), c.id).to.not.equal(null);
      for (const bad of c.dropOnHost || []) expect(host.hasAttribute(bad), bad).to.equal(false);
      expect(Math.abs(host.getBoundingClientRect().height - before[c.id].height), 'no layout shift').to.be.at.most(c.id === 't-empty' ? 60 : 1);
    });
  }

  it('the page cached over midnight: "Hôm nay" printed by the server becomes "Hôm qua" (text only, same <time> node)', () => {
    const host = hostOf('t-cache');
    const t = host.querySelector('time.td-timeline__day-label');
    expect(t === before['t-cache'].labels[0]).to.equal(true);
    expect(t.textContent).to.equal('Hôm qua');
  });

  it('a details panel the user opened before the module loaded stays open (read back as expanded)', () => {
    const host = hostOf('t-details');
    expect(host.querySelector('li[data-id="d2"] details').open).to.equal(true);
    expect(host.items.find((i) => i.id === 'd2').expanded).to.equal(true);
    expect(host.items.find((i) => i.id === 'd1').details).to.equal('Trước: 12 Hàng Bài\nSau: 45 Lý Thường Kiệt');
  });

  it('a site icon unknown to PHP stays an empty slot (a dot) + one warning; core icons refilled', () => {
    const host = hostOf('t-details');
    expect(host.querySelector('li[data-id="d2"] .td-timeline__icon').children.length).to.equal(0);
    expect(host.querySelector('li[data-id="d1"] .td-timeline__icon svg[data-icon="pencil"]')).to.not.equal(null);
    expect(warns.filter((w) => w.includes('unknown icon')).length).to.equal(1);
  });

  it('PHP fell back from an invalid time_zone: the printed default zone is adopted in place (review R1-3)', () => {
    const host = hostOf('t-bad-tz');
    expect(host.getAttribute('time-zone')).to.equal('UTC');
    expect(host.querySelectorAll('li')[0] === before['t-bad-tz'].lis[0]).to.equal(true);
  });

  it('early loadMore + has-more without more_href: the JS "Xem thêm" button is added after the adoption', () => {
    const host = hostOf('t-empty');
    expect(host.querySelector('button.td-timeline__more')).to.not.equal(null);
    expect(host.querySelector('.td-timeline__empty').textContent).to.equal('Đơn này chưa có lịch sử');
  });

  it('time-zone unknown to this browser → rendered from the items read from the markup, browser zone, ONE warning', () => {
    const host = document.getElementById('bad-zone');
    expect(host.items.map((i) => i.id)).to.deep.equal(['a', 'b', 'c']);
    expect(warns.filter((w) => w.includes('IANA zone name')).length).to.equal(1);
  });

  it('tampered markup (R2-4 structures, handlers, links, zone, icon slot) → not adopted: rendered empty, one warning each', () => {
    for (const id of Object.keys(MM)) {
      const host = document.getElementById(id);
      expect(host.items, id).to.deep.equal([]);
      expect(host.querySelectorAll('li').length, id).to.equal(0);
      expect(host.querySelector('[onclick], [style], b, a, i'), id).to.equal(null);
      expect(host.querySelector('.td-timeline__empty'), id).to.not.equal(null);
    }
    expect(window.__pwned).to.equal(undefined);
    expect(warns.filter((w) => w.includes('does not match timeline@1')).length).to.equal(Object.keys(MM).length - 1); // not mm-schema
  });

  it('early items win over the markup', () => {
    expect(document.getElementById('early').items.map((i) => i.title)).to.deep.equal(['Sớm thắng']);
  });
});
