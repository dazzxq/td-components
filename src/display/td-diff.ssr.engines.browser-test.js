import { expect } from '@esm-bundle/chai';
import { normalize, resolveLabels } from '../utils/diff-model.js';
import { diffMarkup } from '../utils/diff-markup.js';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-diff> is defined LATE (dynamic import below), after the no-JS checks.

// v0.46.0 (ADR 0012, plan docs/internal/plans/v0.46.0-diff.md QĐ 20–21, M4) — td_diff() / td_diff_snapshots() /
// <td-diff> adopt in place, contract `diff@1`. Chromium, Firefox AND WebKit (group `engines`). The markup is EXACTLY what
// php/td.php prints for every case of test/ssr/diff.fixtures.json: test/ssr/fixtures/diff.html
// (`node test/ssr/build-diff-fixture.mjs`, kept fresh by test/php/td-ssr-diff.test.js). PARITY: the PHP DOM equals the DOM
// of diffMarkup() for the same data; the host box is the same before and after define (no flash). The kit never reads
// data back from the DOM. Fallback (r1-3): any other marker → ONE warning + render from the properties.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const SPEC = JSON.parse(await (await fetch('/test/ssr/diff.fixtures.json')).text());
const FIXTURE = await (await fetch('/test/ssr/fixtures/diff.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const hostHtml = (id) => TPL.content.querySelector(`section[data-case="${id}"] > td-diff`).outerHTML;

const root = document.createElement('div');
root.style.width = '900px';
root.innerHTML = FIXTURE;
document.body.appendChild(root);
const hostOf = (id) => root.querySelector(`section[data-case="${id}"] > td-diff`);

/** JS markup of a case (same data, same options) parsed by this browser. */
function jsDom(c) {
  const parse = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
  const input = c.mode === 'items' ? { items: c.items } : { before: parse(c.before), after: parse(c.after), fields: c.fields };
  const t = document.createElement('template');
  t.innerHTML = diffMarkup(normalize(input, { json: !!c.opts.json, labels: c.opts.labels }),
    { labels: resolveLabels(c.opts.labels), label: c.opts.label, unchanged: c.opts.unchanged, json: !!c.opts.json });
  return t.innerHTML;
}

// Fallback hosts (r1-3): other markers, no marker, early data, foreign child
const basic = hostHtml('i-basic');
const MM = {
  'mm-schema': basic.replace('diff@1', 'diff@2'),
  'mm-name': basic.replace('data-td-ssr="diff@1"', 'data-td-ssr="diff"'),
  'mm-zero': basic.replace('diff@1', 'diff@01'),
  'mm-other': basic.replace('diff@1', 'filter-chips@1'),
  'mm-empty': basic.replace('data-td-ssr="diff@1"', 'data-td-ssr=""'),
  'mm-none': basic.replace(' data-td-ssr="diff@1"', ''),
  'mm-foreign': basic.replace(/<td-diff([^>]*)>[\s\S]*<\/td-diff>/, '<td-diff$1><div class="x">lạ</div></td-diff>'),
  'mm-early': basic,
};
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => html.replace('<td-diff', `<td-diff id="${id}"`)).join('');
document.body.appendChild(mismatch);
document.getElementById('mm-early').items = [{ key: 'z', label: 'Sớm', after: 'thắng' }];

const before = {};
const records = [];
const mo = new MutationObserver((r) => records.push(...r.filter((x) => x.type === 'childList' && x.target.localName === 'td-diff')));
for (const c of SPEC.cases) {
  const host = hostOf(c.id);
  before[c.id] = { first: host.firstElementChild, rows: [...host.querySelectorAll('tr')], box: host.getBoundingClientRect().toJSON() };
  mo.observe(host, { childList: true });
}

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
await import('./td-diff.js');
console.warn = origWarn;
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
mo.disconnect();

describe('td-diff SSR (diff@1) — no JS', () => {
  it('the PHP markup is the full table already (native <details>, no JS-only control)', () => {
    const h = TPL.content.querySelector('section[data-case="i-basic"] > td-diff');
    expect(h.querySelectorAll('tbody tr').length > 0).to.equal(true);
    expect(!!h.querySelector('details.td-diff__unchanged > summary')).to.equal(true);
    expect(h.querySelector('button, [data-td-js-only]')).to.equal(null);
  });
});

describe('td-diff SSR (diff@1) — adopted in place', () => {
  it('every case: no child replaced, marker removed, no warning; same nodes; same box (no flash)', () => {
    expect(records.length).to.equal(0);
    for (const c of SPEC.cases) {
      const host = hostOf(c.id);
      expect(host.hasAttribute('data-td-ssr'), c.id).to.equal(false);
      expect(host.firstElementChild === before[c.id].first, c.id).to.equal(true);
      const rows = [...host.querySelectorAll('tr')];
      expect(rows.length === before[c.id].rows.length && rows.every((r, i) => r === before[c.id].rows[i]), c.id).to.equal(true);
      const b = host.getBoundingClientRect();
      expect([Math.round(b.width), Math.round(b.height)], c.id).to.deep.equal([Math.round(before[c.id].box.width), Math.round(before[c.id].box.height)]);
    }
  });

  it('PARITY: the PHP DOM = the DOM of diffMarkup() for the same data, every shared case', () => {
    for (const c of SPEC.cases.filter((x) => !x.phpOnly)) {
      expect(hostOf(c.id).innerHTML, c.id).to.equal(jsDom(c));
    }
  });

  it('counts stay null (nothing read back); data assigned later re-renders; view changes never do', async () => {
    const host = hostOf('i-basic');
    expect(host.counts).to.equal(null);
    const table = host.querySelector('table');
    host.setAttribute('view', 'inline');
    expect(host.querySelector('table') === table).to.equal(true);
    host.setAttribute('label', 'Mới');
    expect(table.getAttribute('aria-label')).to.equal('Mới');
    const w0 = warns.length;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    host.toggleAttribute('json', true); // no data to re-render from: markup kept, one warning
    console.warn = origWarn;
    expect(host.querySelector('table') === table).to.equal(true);
    expect(warns.length - w0).to.equal(1);
    host.items = [{ key: 'x', label: 'X', before: 1, after: 2 }];
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelectorAll(':scope > .td-diff__scroll tbody tr').length).to.equal(1);
    expect(host.counts.changed).to.equal(1);
    expect(!!host.querySelector(':scope > details.td-diff__json')).to.equal(true);
  });

  it('moving an adopted host keeps its nodes (canRebind: the contract shape is still there)', () => {
    const host = hostOf('s-labels');
    const first = host.firstElementChild;
    const sec = host.parentElement;
    document.body.appendChild(host);
    sec.appendChild(host);
    expect(host.firstElementChild === first).to.equal(true);
  });
});

describe('td-diff SSR — fallback (r1-3)', () => {
  it('another marker → ONE warning per host (no content in it) + rendered from the properties (empty state)', () => {
    for (const id of ['mm-schema', 'mm-name', 'mm-zero', 'mm-other', 'mm-empty']) {
      const h = document.getElementById(id);
      expect(h.hasAttribute('data-td-ssr'), id).to.equal(false);
      expect(h.firstElementChild.matches('p.td-diff__empty'), id).to.equal(true);
      expect(h.textContent, id).to.equal('Không có thay đổi.');
    }
    const marker = warns.filter((w) => w.includes('not diff@1'));
    expect(marker.length).to.equal(5);
    expect(warns.some((w) => w.includes('Giá bán') || w.includes('12.990.000'))).to.equal(false);
  });

  it('no marker → rendered, no warning; foreign child with the marker → rendered; early items win over the markup', () => {
    expect(document.getElementById('mm-none').textContent).to.equal('Không có thay đổi.');
    expect(document.getElementById('mm-foreign').querySelector('.x')).to.equal(null);
    expect(document.getElementById('mm-foreign').textContent).to.equal('Không có thay đổi.');
    const early = document.getElementById('mm-early');
    expect([...early.querySelectorAll('tbody tr')].map((r) => r.querySelector('.td-diff__label').textContent)).to.deep.equal(['Sớm']);
    expect(early.hasAttribute('data-td-ssr')).to.equal(false);
  });
});
