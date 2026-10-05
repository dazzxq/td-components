import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-filter-chips> is defined LATE (dynamic import below), after the no-JS checks.

// v0.39.0 (ADR 0012, plan docs/internal/plans/v0.39.0-filters-range.md QĐ 16, M3) — td_filter_chips() /
// <td-filter-chips> hydrate in place, contract `filter-chips@1`. Chromium, Firefox AND WebKit (group `engines`). The
// markup is EXACTLY what php/td.php prints for every case of test/ssr/filter-chips.fixtures.json:
// test/ssr/fixtures/filter-chips.html (`node test/ssr/build-filter-chips-fixture.mjs`, kept fresh by
// test/php/td-ssr-filter-chips.test.js). PARITY (review R1-3): the items read back by the hydrate equal the fixture's
// expected items field by field (each field from its own node — never the shown "label: value" text split).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/filter-chips.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/filter-chips.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;

const root = document.createElement('div');
root.style.width = '900px';
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-filter-chips`);
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-filter-chips`).outerHTML;

// Tampered markup (not adopted → rendered empty + one warning; nothing taken from the tampered part).
const basic = hostHtml('f-basic');
const withHref = hostHtml('f-href');
const MM = {
  'mm-aria': basic.replace('aria-label="Bỏ lọc Tìm: iphone 15"', 'aria-label="Bỏ lọc Tìm: khác"'),
  'mm-removable': basic.replace('data-key="q" data-removable="true"', 'data-key="q" data-removable="false"'),
  'mm-href': withHref.replace('href="?q=iphone&amp;page=1"', 'href="javascript:alert(1)"'),
  'mm-onclick': basic.replace('<li class="td-filter-chips__item" data-id="q"', '<li onclick="window.__pwned=1" class="td-filter-chips__item" data-id="q"'),
  'mm-extra': basic.replace('<span class="td-filter-chips__sep"', '<b>thừa</b><span class="td-filter-chips__sep"'),
  'mm-sep': basic.replace('aria-hidden="true">: </span>', 'aria-hidden="true">:: </span>'),
  'mm-value-el': basic.replace('>iphone 15</span>', '><i>iphone 15</i></span>'),
  'mm-clear': basic.replace(/<button type="button" class="td-btn[^>]*>Xoá tất cả<\/button>/, ''),
  'mm-schema': basic.replace('filter-chips@1', 'filter-chips@2'),
};
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => html.replace('<td-filter-chips ', `<td-filter-chips id="${id}" `)).join('');
document.body.appendChild(mismatch);

// Early items (property set before the element is defined) win over the markup (ADR 0012 QĐ 3).
const early = document.createElement('div');
early.innerHTML = basic.replace('<td-filter-chips ', '<td-filter-chips id="early" ');
document.body.appendChild(early);
document.getElementById('early').items = [{ key: 'z', label: 'Sớm', value: 'thắng' }];
// ISSUE-1: early items on an EMPTY server host (printed `hidden`) — the host must show them
early.insertAdjacentHTML('beforeend', hostHtml('f-empty').replace('<td-filter-chips ', '<td-filter-chips id="early-empty" '));
document.getElementById('early-empty').items = [{ key: 'q', label: 'Tìm', value: 'a' }];

const before = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  before[c.id] = {
    lis: [...host.querySelectorAll('li')],
    group: host.querySelector('.td-filter-chips'),
    status: host.querySelector('[role="status"]'),
    jsOnly: [...host.querySelectorAll('[data-td-js-only]')].map((n) => getComputedStyle(n).visibility),
    links: [...host.querySelectorAll('a.td-filter-chips__remove')].map((n) => getComputedStyle(n).display),
    box: host.getBoundingClientRect().toJSON(),
  };
}

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
await import('./td-filter-chips.js');
console.warn = origWarn;

describe('td-filter-chips SSR (filter-chips@1) — no JS', () => {
  it('JS-only buttons are invisible (no dead control, box kept); × links are shown', () => {
    for (const c of SPEC.cases) {
      expect(before[c.id].jsOnly.every((d) => d === 'hidden'), c.id).to.equal(true);
      expect(before[c.id].links.every((d) => d !== 'none'), c.id).to.equal(true);
    }
    expect(before['f-href'].links.length).to.equal(3);
  });
});

describe('td-filter-chips SSR (filter-chips@1) — adopted in place + PHP ↔ JS parity', () => {
  for (const c of SPEC.cases) {
    it(`${c.id}: same nodes, marker consumed, items = expected (field by field)`, () => {
      const host = hostOf(c.id);
      expect(host.hasAttribute('data-td-ssr')).to.equal(false);
      expect(host.querySelector('.td-filter-chips') === before[c.id].group, 'group kept').to.equal(true);
      expect(host.querySelector('[role="status"]') === before[c.id].status, 'live region kept').to.equal(true);
      const lis = [...host.querySelectorAll('li')];
      expect(lis.length).to.equal(before[c.id].lis.length);
      expect(lis.every((li, i) => li === before[c.id].lis[i]), 'li nodes kept').to.equal(true);
      expect(host.items).to.deep.equal(c.expect.items);
      expect(host.hidden).to.equal(!!c.expect.hidden);
      for (const n of host.querySelectorAll('[data-td-js-only]')) expect(getComputedStyle(n).visibility, c.id).to.equal('visible');
      for (const n of host.querySelectorAll('[data-td-icon] ')) expect(n.querySelector('svg'), c.id).to.not.equal(null);
      for (const bad of c.dropOnHost || []) expect(host.hasAttribute(bad), bad).to.equal(false);
      const box = host.getBoundingClientRect();
      if (!c.expect.hidden) expect(Math.abs(box.height - before[c.id].box.height), `${c.id} no layout shift`).to.be.at.most(1);
    });
  }

  it('the long value gets its title after the hydrate', () => {
    const v = hostOf('f-special').querySelector('.td-filter-chips__value');
    expect(v.getAttribute('title')).to.equal(SPEC.cases.find((c) => c.id === 'f-special').expect.items[0].value);
  });

  it('tampered markup → not adopted: rendered empty, one warning each, nothing taken from it, no handler kept', () => {
    for (const id of Object.keys(MM)) {
      const host = document.getElementById(id);
      if (id === 'mm-schema') {
        // a foreign schema is not this contract: rendered from `items` (none) — same result
        expect(host.items, id).to.deep.equal([]);
        continue;
      }
      expect(host.items, id).to.deep.equal([]);
      expect(host.querySelectorAll('li').length, id).to.equal(0);
      expect(host.querySelector('[onclick], b, i, a'), id).to.equal(null);
      expect(host.hidden, id).to.equal(true);
    }
    expect(window.__pwned).to.equal(undefined);
    expect(warns.filter((w) => /filter-chips@1/.test(w)).length).to.equal(Object.keys(MM).length - 1);
  });

  it('items assigned before define win over the markup', () => {
    const host = document.getElementById('early');
    expect(host.items).to.deep.equal([{ id: 'z', key: 'z', label: 'Sớm', value: 'thắng', removable: true }]);
    expect(host.querySelectorAll('li').length).to.equal(1);
    expect(host.querySelector('li').textContent).to.equal('Sớm: thắng');
  });

  it('ISSUE-1: early items on an empty (hidden) server host → shown', () => {
    const host = document.getElementById('early-empty');
    expect(host.items.length).to.equal(1);
    expect(host.hidden).to.equal(false);
    expect(host.getClientRects().length).to.be.greaterThan(0);
  });

  it('an adopted chip works: × → filter-remove + removed', () => {
    const host = hostOf('f-multi');
    const ev = [];
    host.addEventListener('filter-remove', (e) => ev.push(e.detail.item.id));
    host.querySelector('li[data-id="tag-used"] .td-filter-chips__remove').click();
    expect(ev).to.deep.equal(['tag-used']);
    expect(host.items.map((i) => i.id)).to.deep.equal(['tag-new', 'tag-99']);
  });
});
