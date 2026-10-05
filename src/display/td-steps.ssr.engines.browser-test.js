import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-steps> is defined LATE (dynamic import below), after the no-JS checks.

// v0.45.0 (ADR 0012, plan docs/internal/plans/v0.45.0-steps-timeline.md QĐ G3 / S1–S6, M4) — td_steps() / <td-steps>
// hydrate in place, contract `steps@1`. Chromium, Firefox AND WebKit (group `engines`). The markup is EXACTLY what
// php/td.php prints for every case of test/ssr/steps.fixtures.json: test/ssr/fixtures/steps.html
// (`node test/ssr/build-steps-timeline-fixture.mjs`, kept fresh by test/php/td-ssr-steps-timeline.test.js).
// Before the import the page is the no-JS page: steps, states and step links are there; nothing dead.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = await (await fetch('/test/ssr/steps.fixtures.json')).json();
const FIXTURE = await (await fetch('/test/ssr/fixtures/steps.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;

const root = document.createElement('div');
root.style.width = '900px';
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-steps`);
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-steps`).outerHTML;

// Tampered markup → not adopted: rendered EMPTY + one warning each (nothing taken from it).
const basic = hostHtml('s-basic');
const links = hostHtml('s-links');
const back = hostHtml('s-error');
const MM = {
  'mm-state': basic.replace('data-key="3" data-state="upcoming"', 'data-key="3" data-state="done"'),
  'mm-current2': basic.replace('<li class="td-steps__item" data-key="3" data-state="upcoming"><span class="td-steps__step">', '<li class="td-steps__item" data-key="3" data-state="upcoming"><span class="td-steps__step" aria-current="step">'),
  'mm-onclick': basic.replace('<span class="td-steps__label">Xem trước', '<span onclick="window.__pwned=1" class="td-steps__label">Xem trước'),
  'mm-style': basic.replace('<ol class="td-steps__list" role="list">', '<ol class="td-steps__list" role="list" style="color:red">'),
  'mm-extra': basic.replace('<span class="td-steps__label">Nhập', '<b>thừa</b><span class="td-steps__label">Nhập'),
  'mm-href': links.replace('href="?step=1"', 'href="javascript:alert(1)"'),
  'mm-summary': basic.replace('Bước 2/5: Kiểm tra dữ liệu', 'Bước 3/5: Xem trước'),
  'mm-jsstep': basic.replace('<li class="td-steps__item" data-key="4" data-state="upcoming"><span class="td-steps__step">', '<li class="td-steps__item" data-key="4" data-state="upcoming"><span class="td-steps__step" data-td-js-step>'),
  'mm-jsstep-missing': back.replace('<span class="td-steps__step" data-td-js-step="">', '<span class="td-steps__step">'),
  'mm-sr': basic.replace('<span class="td-sr-only">, chưa tới</span>', '<span class="td-sr-only">, xong rồi</span>'),
  // ISSUE-1: icon slot content must be exactly the registry SVG
  'mm-icon-path': basic.replace(/(data-icon="check"[^>]*>)<path d="[^"]*"/, '$1<path d="M0 0h24"'),
  'mm-icon-attr': basic.replace('data-icon="check"', 'data-icon="check" onload="window.__pwned=1"'),
  'mm-schema': basic.replace('steps@1', 'steps@2'),
};
for (const [id, h] of Object.entries(MM)) if ([basic, links, back].includes(h)) throw new Error(`${id}: the tamper did not apply`);
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => html.replace('<td-steps ', `<td-steps id="${id}" `)).join('');
document.body.appendChild(mismatch);

// Early steps (property set before the element is defined) win over the markup.
const early = document.createElement('div');
early.innerHTML = basic.replace('<td-steps ', '<td-steps id="early" ');
document.body.appendChild(early);
document.getElementById('early').steps = [{ label: 'Sớm' }, { label: 'thắng' }];

const before = {};
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  before[c.id] = {
    lis: [...host.querySelectorAll('li')],
    labels: [...host.querySelectorAll('.td-steps__label')],
    wrap: host.querySelector('.td-steps'),
    box: host.getBoundingClientRect().toJSON(),
    links: [...host.querySelectorAll('a.td-steps__step')].map((a) => [a.getAttribute('href'), getComputedStyle(a).display]),
    markers: [...host.querySelectorAll('.td-steps__marker')].map((m) => m.getBoundingClientRect().width),
  };
}

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const { TdSteps } = await import('./td-steps.js');
console.warn = origWarn;

describe('td-steps SSR (steps@1) — no JS', () => {
  it('markers are styled discs, step links are real links, no button exists', () => {
    for (const c of SPEC.cases) {
      expect(before[c.id].markers.every((w) => Math.abs(w - 28) < 1), c.id).to.equal(true);
      expect(TPL.content.querySelectorAll(`section[data-case="${c.id}"] button`).length, c.id).to.equal(0);
    }
    expect(before['s-links'].links).to.deep.equal([['?step=1', 'flex']]);
  });
});

describe('td-steps SSR (steps@1) — adopted in place + PHP ↔ JS parity', () => {
  for (const c of SPEC.cases) {
    it(`${c.id}: same nodes, marker consumed, states / anchor / summary / step tags = expected, no layout shift`, () => {
      const host = hostOf(c.id);
      expect(host.hasAttribute('data-td-ssr')).to.equal(false);
      expect(host.querySelector('.td-steps') === before[c.id].wrap, 'wrapper kept').to.equal(true);
      const lis = [...host.querySelectorAll('li')];
      expect(lis.length).to.equal(before[c.id].lis.length);
      expect(lis.every((li, i) => li === before[c.id].lis[i]), 'li kept').to.equal(true);
      expect([...host.querySelectorAll('.td-steps__label')].every((n, i) => n === before[c.id].labels[i]), 'labels kept').to.equal(true);
      expect(lis.map((li) => li.dataset.state)).to.deep.equal(c.expect.states);
      expect(lis.findIndex((li) => li.firstElementChild.hasAttribute('aria-current'))).to.equal(c.expect.anchor);
      expect(lis.map((li) => li.firstElementChild.localName)).to.deep.equal(c.expect.tags);
      expect(host.querySelector('[data-td-js-step]')).to.equal(null);
      expect(host.querySelector('.td-steps__summary')?.textContent ?? null).to.equal(c.expect.summary);
      expect(host.hidden).to.equal(!!c.expect.hidden);
      expect(host.steps.length).to.equal(c.expect.states.length);
      for (const bad of c.dropOnHost || []) expect(host.hasAttribute(bad), bad).to.equal(false);
      if (!c.expect.hidden) expect(Math.abs(host.getBoundingClientRect().height - before[c.id].box.height), 'no layout shift').to.be.at.most(1);
      for (const s of host.querySelectorAll('.td-steps__icon')) expect(s.querySelector('svg'), c.id).to.not.equal(null);
    });
  }

  it('read back: the conflict case re-derives the same states from the markup; clicking the hydrated button → step-select', () => {
    const host = hostOf('s-conflict');
    const got = [];
    host.addEventListener('step-select', (e) => got.push(e.detail.key));
    host.querySelector('button.td-steps__step').click();
    expect(got).to.deep.equal(['1']);
    host.setAttribute('current', '3');
    expect([...host.querySelectorAll('li')].map((li) => li.dataset.state)).to.deep.equal(['done', 'done', 'current', 'upcoming']);
  });

  it('tampered markup → not adopted: rendered empty, one warning each, no handler / style kept', () => {
    for (const id of Object.keys(MM)) {
      const host = document.getElementById(id);
      expect(host.steps, id).to.deep.equal([]);
      expect(host.querySelectorAll('li').length, id).to.equal(0);
      expect(host.querySelector('[onclick], [style], b, a'), id).to.equal(null);
      expect(host.hidden, id).to.equal(true);
    }
    expect(window.__pwned).to.equal(undefined);
    expect(warns.filter((w) => w.includes('does not match steps@1')).length).to.equal(Object.keys(MM).length - 1);
  });

  it('early steps win over the markup', () => {
    const host = document.getElementById('early');
    expect([...host.querySelectorAll('.td-steps__label')].map((n) => n.textContent)).to.deep.equal(['Sớm', 'thắng']);
  });

  it('a site that changed TdSteps.labels: its own markup AND the default markup are both adopted', async () => {
    const saved = { ...TdSteps.labels };
    TdSteps.labels.group = 'Tiến độ';
    TdSteps.labels.upcoming = ', sắp tới';
    try {
      const wrap = document.createElement('div');
      wrap.innerHTML = basic.replace('aria-label="Tiến trình"', 'aria-label="Tiến độ"').replaceAll(', chưa tới', ', sắp tới').replace('<td-steps ', '<td-steps id="site" ')
        + basic.replace('<td-steps ', '<td-steps id="site-default" ');
      const lis = [...wrap.querySelectorAll('li')];
      document.body.appendChild(wrap);
      const a = document.getElementById('site');
      const b = document.getElementById('site-default');
      expect(a.querySelectorAll('li').length).to.equal(5);
      expect([...wrap.querySelectorAll('li')].every((li, i) => li === lis[i])).to.equal(true);
      expect(b.querySelectorAll('li').length).to.equal(5);
      wrap.remove();
    } finally {
      Object.assign(TdSteps.labels, saved);
    }
  });
});
