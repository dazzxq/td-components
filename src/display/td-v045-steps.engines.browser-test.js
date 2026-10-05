import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-steps.js';

// v0.45.0 (plan docs/internal/plans/v0.45.0-steps-timeline.md QĐ S1–S7, M2) — <td-steps>: one aria-current (state
// precedence, review R1-1), state text + markers, light updates (li identity, focus kept / handed over), navigation
// back / all → step-select (the kit never changes `current`), safe links, text-only data, compact summary under 480px
// of container width (review R2-5). Chromium, Firefox and WebKit.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  root.innerHTML = '';
});

const FIVE = () => [
  { label: 'Tải tệp' }, { label: 'Kiểm tra dữ liệu', description: 'Đã nhập 1.250 dòng' }, { label: 'Xem trước' },
  { label: 'Nhập' }, { label: 'Xong' },
];

async function mk(steps = FIVE(), attrs = '', width = 900) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-steps ${attrs}></td-steps>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-steps');
  el.steps = steps;
  await raf();
  return el;
}
const lis = (el) => [...el.querySelectorAll('li.td-steps__item')];
const stepOf = (el, i) => lis(el)[i].firstElementChild;
const states = (el) => lis(el).map((li) => li.dataset.state);

describe('td-steps — structure + ARIA (QĐ S2, S6)', () => {
  it('ol[role=list] in div[role=group][aria-label] (navigation none); exactly one aria-current; state texts; markers', async () => {
    const el = await mk(FIVE(), 'current="3"');
    const wrap = el.querySelector(':scope > .td-steps');
    expect(wrap.localName).to.equal('div');
    expect(wrap.getAttribute('role')).to.equal('group');
    expect(wrap.getAttribute('aria-label')).to.equal('Tiến trình');
    expect(el.querySelector('ol.td-steps__list').getAttribute('role')).to.equal('list');
    expect(states(el)).to.deep.equal(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(el.querySelectorAll('[aria-current]').length).to.equal(1);
    expect(stepOf(el, 2).getAttribute('aria-current')).to.equal('step');
    expect(lis(el).map((li) => li.querySelector('.td-sr-only').textContent)).to.deep.equal([', đã xong', ', đã xong', '', ', chưa tới', ', chưa tới']);
    expect(stepOf(el, 0).querySelector('.td-steps__marker svg[data-icon="check"]')).to.not.equal(null);
    expect(stepOf(el, 2).querySelector('.td-steps__marker').textContent).to.equal('3');
    expect(stepOf(el, 1).querySelector('.td-steps__desc').textContent).to.equal('Đã nhập 1.250 dòng');
    expect([...el.querySelectorAll('.td-steps__marker')].every((m) => m.getAttribute('aria-hidden') === 'true')).to.equal(true);
    expect(el.querySelectorAll('button, a').length).to.equal(0);
    expect(warns).to.deep.equal([]);
  });

  it('error on the anchor: error shape + "! " icon + aria-current; error elsewhere kept', async () => {
    const steps = FIVE();
    steps[1].state = 'error';
    steps[1].description = 'Dòng 12 thiếu IMEI';
    const el = await mk(steps, 'current="2"');
    expect(states(el)).to.deep.equal(['done', 'error', 'upcoming', 'upcoming', 'upcoming']);
    expect(stepOf(el, 1).getAttribute('aria-current')).to.equal('step');
    expect(stepOf(el, 1).querySelector('svg[data-icon="error"]')).to.not.equal(null);
    expect(stepOf(el, 1).querySelector('.td-sr-only').textContent).to.equal(', có lỗi');
  });

  it('R1-1: valid current + state "current" elsewhere → anchor by `current`, the other demoted, ONE warning', async () => {
    const steps = FIVE();
    steps[3].state = 'current';
    const el = await mk(steps, 'current="2"');
    expect(el.querySelectorAll('[aria-current]').length).to.equal(1);
    expect(stepOf(el, 1).getAttribute('aria-current')).to.equal('step');
    expect(states(el)).to.deep.equal(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(warns.length).to.equal(1);
    expect(warns[0]).to.contain('extra-current');
  });

  it('complete: every step done, no aria-current; navigation → nav[aria-label] (landmark only when navigating)', async () => {
    const el = await mk(FIVE(), 'complete navigation="back" label="Nhập kho"');
    expect(states(el).every((s) => s === 'done')).to.equal(true);
    expect(el.querySelectorAll('[aria-current]').length).to.equal(0);
    const wrap = el.querySelector(':scope > .td-steps');
    expect(wrap.localName).to.equal('nav');
    expect(wrap.hasAttribute('role')).to.equal(false);
    expect(wrap.getAttribute('aria-label')).to.equal('Nhập kho');
    el.setAttribute('label', 'Khác');
    expect(wrap.getAttribute('aria-label')).to.equal('Khác');
  });

  it('no steps → host hidden; steps again → shown', async () => {
    const el = await mk([]);
    expect(el.hidden).to.equal(true);
    el.steps = FIVE();
    expect(el.hidden).to.equal(false);
  });
});

describe('td-steps — light updates (QĐ S7)', () => {
  it('changing current keeps every li (identity) and updates states / aria-current / markers / summary', async () => {
    const el = await mk(FIVE(), 'current="1"');
    const before = lis(el);
    el.setAttribute('current', '4');
    expect(lis(el).every((li, i) => li === before[i])).to.equal(true);
    expect(states(el)).to.deep.equal(['done', 'done', 'done', 'current', 'upcoming']);
    expect(el.querySelectorAll('[aria-current]').length).to.equal(1);
    expect(stepOf(el, 0).querySelector('svg[data-icon="check"]')).to.not.equal(null);
    expect(el.querySelector('.td-steps__summary').textContent).to.equal('Bước 4/5: Nhập');
    el.complete = true;
    expect(states(el).every((s) => s === 'done')).to.equal(true);
    expect(el.querySelector('.td-steps__summary').textContent).to.equal('Đã hoàn tất 5/5 bước');
    expect(warns.length).to.equal(1); // complete + current → complete-current
    expect(warns[0]).to.contain('complete-current');
  });

  it('focus stays on a step button that is still clickable; a focused button that stops being clickable hands focus to its replacement', async () => {
    const el = await mk(FIVE(), 'current="4" navigation="back"');
    const b1 = stepOf(el, 1);
    expect(b1.localName).to.equal('button');
    b1.focus();
    el.setAttribute('current', '5');
    expect(document.activeElement === b1).to.equal(true);
    el.setAttribute('current', '2'); // step 2 is now the anchor → not clickable
    const now = stepOf(el, 1);
    expect(now.localName).to.equal('span');
    expect(document.activeElement === now).to.equal(true);
    expect(document.activeElement === document.body).to.equal(false);
    expect(now.getAttribute('aria-current')).to.equal('step');
  });
});

describe('td-steps — navigation + step-select (QĐ S4, S5)', () => {
  it('back: only done / error steps before the anchor are buttons; click / Enter / Space → step-select; current unchanged', async () => {
    const steps = FIVE();
    steps[0].disabled = true;
    const el = await mk(steps, 'current="4" navigation="back"');
    expect(lis(el).map((li) => li.firstElementChild.localName)).to.deep.equal(['span', 'button', 'button', 'span', 'span']);
    const got = [];
    el.addEventListener('step-select', (e) => got.push(e.detail));
    stepOf(el, 1).click();
    stepOf(el, 2).focus();
    await sendKeys({ press: 'Enter' });
    stepOf(el, 1).focus();
    await sendKeys({ press: 'Space' });
    expect(got.map((d) => [d.key, d.index])).to.deep.equal([['2', 1], ['3', 2], ['2', 1]]);
    expect(got[0].step).to.deep.equal({ key: '2', label: 'Kiểm tra dữ liệu', description: 'Đã nhập 1.250 dòng', disabled: false });
    expect(el.getAttribute('current')).to.equal('4');
    expect(stepOf(el, 3).getAttribute('aria-current')).to.equal('step');
    stepOf(el, 0).click(); // disabled span: nothing
    stepOf(el, 3).click(); // the anchor: nothing
    expect(got.length).to.equal(3);
  });

  it('all: every step but the anchor; a safe href → <a> (no event); javascript: / other origin → no link', async () => {
    const steps = FIVE();
    steps[0].href = '#buoc-1';
    steps[2].href = 'javascript:alert(1)';
    steps[3].href = 'https://evil.example/x';
    const el = await mk(steps, 'current="2" navigation="all"');
    expect(lis(el).map((li) => li.firstElementChild.localName)).to.deep.equal(['a', 'span', 'button', 'button', 'button']);
    expect(stepOf(el, 0).getAttribute('href')).to.equal('#buoc-1');
    expect(el.querySelectorAll('a').length).to.equal(1);
    let fired = 0;
    let native = null;
    el.addEventListener('step-select', () => { fired++; });
    el.addEventListener('click', (e) => { native = !e.defaultPrevented; e.preventDefault(); });
    stepOf(el, 0).click();
    expect(fired).to.equal(0);
    expect(native).to.equal(true); // the link is left to the browser
    el.setAttribute('navigation', 'none');
    expect(el.querySelector(':scope > .td-steps').localName).to.equal('div');
    expect(el.querySelectorAll('a, button').length).to.equal(0);
  });
});

describe('td-steps — text only (QĐ G2)', () => {
  it('label / description / key holding markup stay text; no style attribute anywhere', async () => {
    const el = await mk([{ key: '"><img src=x onerror=window.__pwned=1>', label: '<img src=x onerror=window.__pwned=1>', description: '<svg onload=alert(1)>' }, { label: 'B' }], 'current="B"');
    await raf();
    expect(window.__pwned).to.equal(undefined);
    expect(el.querySelector('img, svg[onload]')).to.equal(null);
    expect(el.querySelector('.td-steps__label').textContent).to.equal('<img src=x onerror=window.__pwned=1>');
    expect(lis(el)[0].dataset.key).to.equal('"><img src=x onerror=window.__pwned=1>');
    expect(el.querySelectorAll('[style]').length).to.equal(0);
    expect(el.hasAttribute('style')).to.equal(false);
  });
});

describe('td-steps — narrow (QĐ S3, review R2-5)', () => {
  it('320px column → compact: labels visually hidden but in the tree, summary shown; three summary branches; vertical / narrow="vertical"', async () => {
    const el = await mk(FIVE(), 'current="2"', 320);
    const label = stepOf(el, 0).querySelector('.td-steps__label');
    expect(getComputedStyle(label).position).to.equal('absolute');
    expect(label.getBoundingClientRect().width).to.be.at.most(1);
    expect(label.textContent).to.equal('Tải tệp');
    const sum = el.querySelector('.td-steps__summary');
    expect(sum.getAttribute('aria-hidden')).to.equal('true');
    expect(getComputedStyle(sum).display).to.equal('block');
    expect(sum.textContent).to.equal('Bước 2/5: Kiểm tra dữ liệu');
    el.removeAttribute('current');
    expect(sum.textContent).to.equal('5 bước');
    el.complete = true;
    expect(sum.textContent).to.equal('Đã hoàn tất 5/5 bước');
    const markers = [...el.querySelectorAll('.td-steps__marker')].map((m) => m.getBoundingClientRect());
    expect(markers.every((r, i) => i === 0 || r.left > markers[i - 1].right)).to.equal(true); // one row
    expect(el.scrollWidth).to.be.at.most(el.clientWidth + 1);

    el.setAttribute('narrow', 'vertical');
    await raf();
    expect(getComputedStyle(sum).display).to.equal('none');
    expect(getComputedStyle(label).position).to.equal('static');
    const m0 = stepOf(el, 0).querySelector('.td-steps__marker').getBoundingClientRect();
    const m1 = stepOf(el, 1).querySelector('.td-steps__marker').getBoundingClientRect();
    expect(m1.top).to.be.above(m0.bottom); // stacked
    expect(label.getBoundingClientRect().left).to.be.at.least(m0.right); // label beside its marker
  });

  it('wide: horizontal labels under the markers, no summary; orientation="vertical" at any width', async () => {
    const el = await mk(FIVE(), 'current="2"', 900);
    const sum = el.querySelector('.td-steps__summary');
    expect(getComputedStyle(sum).display).to.equal('none');
    const m = stepOf(el, 1).querySelector('.td-steps__marker').getBoundingClientRect();
    const l = stepOf(el, 1).querySelector('.td-steps__label').getBoundingClientRect();
    expect(l.top).to.be.at.least(m.bottom);
    el.setAttribute('orientation', 'vertical');
    await raf();
    const m2 = stepOf(el, 1).querySelector('.td-steps__marker').getBoundingClientRect();
    const l2 = stepOf(el, 1).querySelector('.td-steps__label').getBoundingClientRect();
    expect(l2.left).to.be.at.least(m2.right);
  });
});
