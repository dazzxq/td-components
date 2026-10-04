import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import '../form/td-repeater.js';
import './td-empty-state.js';
import '../feedback/td-alert.js';
import '../form/td-dropzone.js';
import '../form/td-media-field.js';
import './td-pagination.js';

// v0.34.0 (plan docs/internal/plans/v0.34.0-responsive.md QĐ 12, ADR 0014) — narrow-container layouts in Chromium,
// Firefox AND WebKit. Every rule is a container query on the component host (+ the build-generated viewport fallback):
//   td-repeater  < 480: the per-row tool cluster (drag / ↑ / ↓ / ×) is its own row, aligned to the end, under the fields
//   td-empty-state / td-alert < 480: action buttons stacked, each full width
//   td-dropzone  < 360: "Kéo thả file vào đây hoặc" visually hidden (kept in the DOM), the browse button full width
//   td-media-field < 360: Đổi / Gỡ stacked, each full width
// Each is asserted in a 280px wrapper (the promised arrangement) and a 600px wrapper (the old arrangement, unchanged).
// DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { host.innerHTML = ''; });

/** fixed-width wrapper (left margin so anything sticking out LEFT stays measurable) */
function mount(width, html) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  wrap.style.setProperty('margin-left', '40px');
  host.appendChild(wrap);
  wrap.insertAdjacentHTML('beforeend', html);
  return { wrap, el: wrap.firstElementChild };
}

const visible = (node) => node.getClientRects().length > 0 && node.getBoundingClientRect().width > 1;
const rect = (n) => n.getBoundingClientRect();
const mid = (n) => { const r = rect(n); return (r.top + r.bottom) / 2; };
/** the content box (inside padding / border) */
function contentBox(n) {
  const r = rect(n);
  const cs = getComputedStyle(n);
  const px = (p) => parseFloat(cs[p]) || 0;
  return {
    left: r.left + px('borderLeftWidth') + px('paddingLeft'),
    right: r.right - px('borderRightWidth') - px('paddingRight'),
  };
}

function expectInside(wrap, el, ctx) {
  const wr = rect(wrap);
  expect(wrap.scrollWidth, `${ctx}: wrapper scrollWidth`).to.be.at.most(wrap.clientWidth);
  for (const node of [el, ...el.querySelectorAll('*')]) {
    if (!visible(node)) continue;
    const r = rect(node);
    const name = `${ctx}: ${node.localName}.${node.className.baseVal ?? node.className}`;
    expect(r.left, `${name} left`).to.be.at.least(wr.left - 0.5);
    expect(r.right, `${name} right`).to.be.at.most(wr.right + 0.5);
  }
}

/** buttons stacked (each top ≥ previous bottom) and each as wide as the container's content box (±2) */
function expectStackedFull(container, buttons, ctx) {
  expect(buttons.length, `${ctx}: buttons`).to.be.at.least(2);
  const box = contentBox(container);
  for (let i = 0; i < buttons.length; i++) {
    const r = rect(buttons[i]);
    expect(Math.abs(r.left - box.left), `${ctx}: button ${i} left`).to.be.below(2);
    expect(Math.abs(r.right - box.right), `${ctx}: button ${i} right`).to.be.below(2);
    if (i) expect(r.top, `${ctx}: button ${i} below button ${i - 1}`).to.be.at.least(rect(buttons[i - 1]).bottom - 0.5);
  }
}

/** buttons on one row, side by side, none full width */
function expectSideBySide(container, buttons, ctx) {
  const box = contentBox(container);
  for (let i = 1; i < buttons.length; i++) {
    expect(Math.abs(mid(buttons[i]) - mid(buttons[0])), `${ctx}: button ${i} same row`).to.be.below(2);
    expect(rect(buttons[i]).left, `${ctx}: button ${i} after ${i - 1}`).to.be.at.least(rect(buttons[i - 1]).right - 0.5);
  }
  for (const b of buttons) expect(rect(b).width, `${ctx}: not full width`).to.be.below(box.right - box.left - 20);
}

// --- td-repeater -------------------------------------------------------------------------------------------------

/** flexible fields (flex: 1 1 3rem) that fit beside the tools at 280px without the container rule */
function repeaterHtml(rowStyle = '') {
  const row = (i) => `<div data-td-row class="t-row"${rowStyle}><input class="t-f" aria-label="Tên ${i}" name="r[${i}][a]" data-name="r[{i}][a]">`
    + `<input class="t-f" aria-label="SL ${i}" name="r[${i}][b]" data-name="r[{i}][b]"></div>`;
  return `<td-repeater label="Hộp gồm" sortable><template>${row('x').replace(/ name="[^"]*"/g, '')}</template>${row(0)}${row(1)}</td-repeater>`;
}
function styleRepeaterFields(el, grid) {
  for (const f of el.querySelectorAll('.t-f')) {
    f.style.setProperty('flex', '1 1 3rem');
    f.style.setProperty('min-width', '0');
    f.style.setProperty('box-sizing', 'border-box');
  }
  // an app's own row layout (unlayered CSS always wins): a grid row with the tools in the last track
  if (grid) {
    for (const r of el.querySelectorAll('[data-td-row]')) {
      r.style.setProperty('display', 'grid');
      r.style.setProperty('grid-template-columns', 'minmax(0, 1fr) 4rem auto');
    }
  }
}

describe('v0.34.0 narrow containers (QĐ 12): td-repeater', () => {
  for (const grid of [false, true]) {
    const kind = grid ? 'app grid row' : 'default flex row';
    it(`280px (${kind}): grid → the tool cluster is its own row; flex → it shares the last line when the basis allows (v0.36); aligned to the end`, async () => {
      const { wrap, el } = mount(280, repeaterHtml());
      styleRepeaterFields(el, grid);
      await frame();
      for (const row of el.querySelectorAll('[data-td-row]')) {
        const tools = row.querySelector('.td-repeater__actions');
        expect(!!tools, 'tools').to.equal(true);
        expect(tools.querySelectorAll('.td-repeater__btn').length, 'drag / ↑ / ↓ / ×').to.equal(4);
        const fieldsBottom = Math.max(...[...row.querySelectorAll('.t-f')].map((f) => rect(f).bottom));
        if (grid) {
          expect(rect(tools).top, `${kind}: tools below the fields`).to.be.at.least(fieldsBottom - 0.5);
        } else {
          // v0.36.0 (plan QĐ 63): in a flex row the cluster joins the last line when the fields' flex-basis leaves room
          // (here 2 × 3rem) — the fields never go below their basis
          for (const f of row.querySelectorAll('.t-f')) expect(rect(f).width, `${kind}: field ≥ its basis`).to.be.at.least(47.5);
        }
        const btns = [...tools.querySelectorAll('.td-repeater__btn')];
        const box = contentBox(row);
        expect(Math.abs(rect(btns.at(-1)).right - box.right), `${kind}: aligned to the end`).to.be.below(2);
        for (const b of btns.slice(1)) expect(Math.abs(mid(b) - mid(btns[0])), `${kind}: one row of tools`).to.be.below(2);
        // the fields keep the row above
        const fields = [...row.querySelectorAll('.t-f')];
        expect(Math.abs(mid(fields[0]) - mid(fields[1])), `${kind}: fields side by side`).to.be.below(2);
      }
      expectInside(wrap, el, `repeater 280 ${kind}`);
    });

    it(`600px (${kind}): unchanged — tools beside the fields`, async () => {
      const { wrap, el } = mount(600, repeaterHtml());
      styleRepeaterFields(el, grid);
      await frame();
      for (const row of el.querySelectorAll('[data-td-row]')) {
        const tools = row.querySelector('.td-repeater__actions');
        const f = row.querySelector('.t-f');
        expect(Math.abs(mid(tools) - mid(f)), `${kind}: same row`).to.be.below(2);
        expect(rect(tools).left, `${kind}: after the fields`).to.be.at.least(Math.max(...[...row.querySelectorAll('.t-f')].map((x) => rect(x).right)) - 0.5);
      }
      expectInside(wrap, el, `repeater 600 ${kind}`);
    });
  }
});

// --- td-empty-state / td-alert -------------------------------------------------------------------------------------

async function emptyState(width) {
  const m = mount(width, '<td-empty-state title="Chưa có đơn hàng nào" message="Đơn hàng mới sẽ xuất hiện ở đây."></td-empty-state>');
  m.el.actions = [{ label: 'Tạo đơn', variant: 'primary' }, { label: 'Nhập Excel', variant: 'secondary' }];
  await frame();
  return m;
}

const ALERT = '<td-alert variant="warning" heading="Chưa lưu" dismissible>Bài viết còn thay đổi chưa lưu.'
  + '<div class="td-alert__actions"><button type="button" class="td-btn td-btn--primary td-btn--sm">Lưu</button>'
  + '<button type="button" class="td-btn td-btn--secondary td-btn--sm">Bỏ</button></div></td-alert>';

describe('v0.34.0 narrow containers (QĐ 12): td-empty-state, td-alert', () => {
  it('td-empty-state 280px: actions stacked, each full width', async () => {
    const { wrap, el } = await emptyState(280);
    const box = el.querySelector('.td-empty-state__actions');
    expectStackedFull(box, [...box.children], 'empty-state 280');
    expectInside(wrap, el, 'empty-state 280');
  });

  it('td-empty-state 600px: unchanged — actions side by side', async () => {
    const { wrap, el } = await emptyState(600);
    const box = el.querySelector('.td-empty-state__actions');
    expectSideBySide(box, [...box.children], 'empty-state 600');
    expectInside(wrap, el, 'empty-state 600');
  });

  it('td-empty-state 280px with server-rendered <td-button> actions: the inner .td-btn is full width', async () => {
    const { wrap, el } = mount(280, '<td-empty-state title="Trống"></td-empty-state>');
    await frame();
    const box = el.querySelector('.td-empty-state__actions');
    box.hidden = false;
    box.insertAdjacentHTML('beforeend', '<td-button variant="primary" size="sm">Tạo</td-button><td-button variant="secondary" size="sm">Nhập</td-button>');
    await customElements.whenDefined('td-button').catch(() => {});
    await frame();
    const btns = [...box.querySelectorAll('td-button')].map((h) => h.querySelector('.td-btn') || h);
    expectStackedFull(box, btns, 'empty-state td-button 280');
    expectInside(wrap, el, 'empty-state td-button 280');
  });

  it('td-alert 280px: .td-alert__actions stacked, each full width', async () => {
    const { wrap, el } = mount(280, ALERT);
    await frame();
    const box = el.querySelector('.td-alert__actions');
    expect(!!box, 'actions kept inside the message').to.equal(true);
    expectStackedFull(box, [...box.children], 'alert 280');
    expectInside(wrap, el, 'alert 280');
  });

  it('td-alert 600px: unchanged — actions side by side, below the message', async () => {
    const { wrap, el } = mount(600, ALERT);
    await frame();
    const box = el.querySelector('.td-alert__actions');
    expectSideBySide(box, [...box.children], 'alert 600');
    expectInside(wrap, el, 'alert 600');
  });
});

// --- td-dropzone ---------------------------------------------------------------------------------------------------

describe('v0.34.0 narrow containers (QĐ 12): td-dropzone', () => {
  it('280px: the drag instruction is visually hidden (kept in the DOM), browse full width, hint shown', async () => {
    const { wrap, el } = mount(280, '<td-dropzone label="Tệp đính kèm" accept=".pdf" max-size="5MB" multiple></td-dropzone>');
    await frame();
    const text = el.querySelector('.td-dropzone__text');
    expect(!!text && text.textContent.length > 0, 'instruction kept').to.equal(true);
    const r = rect(text);
    expect(r.width <= 1 && r.height <= 1, `instruction visually hidden (${r.width}x${r.height})`).to.equal(true);
    expect(getComputedStyle(text).display).to.not.equal('none');
    const browse = el.querySelector('.td-dropzone__browse');
    expect(browse.textContent.trim(), 'accessible name unchanged').to.equal('Chọn file');
    const zone = el.querySelector('.td-dropzone__zone');
    const box = contentBox(zone);
    expect(Math.abs(rect(browse).left - box.left), 'browse left').to.be.below(2);
    expect(Math.abs(rect(browse).right - box.right), 'browse right').to.be.below(2);
    const hint = el.querySelector('.td-dropzone__hint');
    expect(visible(hint), 'hint still shown').to.equal(true);
    expectInside(wrap, el, 'dropzone 280');
  });

  it('280px stacked (prompt-title): browse full width, nothing overflows', async () => {
    const { wrap, el } = mount(280, '<td-dropzone label="Ảnh" prompt-title="Tải ảnh lên" prompt-text="Kéo thả hoặc chọn từ máy" hint-style="badges" accept="image/*" max-size="5MB"></td-dropzone>');
    await frame();
    const browse = el.querySelector('.td-dropzone__browse');
    const box = contentBox(el.querySelector('.td-dropzone__zone'));
    expect(Math.abs(rect(browse).left - box.left), 'browse left').to.be.below(2);
    expect(Math.abs(rect(browse).right - box.right), 'browse right').to.be.below(2);
    expect(visible(el.querySelector('.td-dropzone__title')), 'title shown').to.equal(true);
    expectInside(wrap, el, 'dropzone stacked 280');
  });

  it('600px: unchanged — instruction and browse button on one line', async () => {
    const { wrap, el } = mount(600, '<td-dropzone label="Tệp đính kèm" accept=".pdf" max-size="5MB" multiple></td-dropzone>');
    await frame();
    const text = el.querySelector('.td-dropzone__text');
    const browse = el.querySelector('.td-dropzone__browse');
    expect(visible(text), 'instruction shown').to.equal(true);
    expect(Math.abs(mid(text) - mid(browse)), 'same line').to.be.below(3);
    expect(rect(browse).left, 'browse after the text').to.be.at.least(rect(text).right - 0.5);
    expect(rect(browse).width, 'browse not full width').to.be.below(200);
    expectInside(wrap, el, 'dropzone 600');
  });
});

// --- td-media-field ------------------------------------------------------------------------------------------------

const FIELD = '<td-media-field label="Ảnh đại diện" name="avatar" value="a1" preview-src="/test/fixtures/1.svg" preview-alt="Ảnh 1"></td-media-field>';

describe('v0.34.0 narrow containers (QĐ 12): td-media-field', () => {
  it('280px: Đổi / Gỡ stacked, each full width', async () => {
    const { wrap, el } = mount(280, FIELD);
    await frame();
    const box = el.querySelector('.td-media-field__actions');
    expect(box.hidden, 'filled → actions shown').to.equal(false);
    expectStackedFull(box, [el.querySelector('.td-media-field__replace'), el.querySelector('.td-media-field__remove')], 'media-field 280');
    expectInside(wrap, el, 'media-field 280');
  });

  it('600px: unchanged — Đổi / Gỡ side by side', async () => {
    const { wrap, el } = mount(600, FIELD);
    await frame();
    const box = el.querySelector('.td-media-field__actions');
    expectSideBySide(box, [el.querySelector('.td-media-field__replace'), el.querySelector('.td-media-field__remove')], 'media-field 600');
    expectInside(wrap, el, 'media-field 600');
  });
});

// --- generated viewport fallback (engines without container queries, Chrome/Edge 102–104) --------------------------

describe('v0.34.0 narrow containers: generated @supports-not viewport fallback', () => {
  /** td.css with the container queries disabled (no container of that name) and the fallbacks forced on */
  let fallbackLink;
  before(async () => {
    const css = await (await fetch('/td.css')).text();
    const forced = css
      .replace(/@container td-/g, '@container tdx-never-')
      .replace(/@supports not \(container-type: inline-size\)/g, '@supports (display: block)');
    link.disabled = true;
    fallbackLink = document.createElement('link');
    fallbackLink.rel = 'stylesheet';
    fallbackLink.href = URL.createObjectURL(new Blob([forced], { type: 'text/css' }));
    const loaded = new Promise((r) => { fallbackLink.onload = r; fallbackLink.onerror = r; });
    document.head.appendChild(fallbackLink);
    await loaded;
    await setViewport({ width: 340, height: 700 });
    await frame();
  });
  after(async () => {
    fallbackLink.remove();
    link.disabled = false;
    await setViewport({ width: 800, height: 600 });
    await frame();
  });

  it('viewport 340: pagination status form, stacked empty-state actions, full-width browse / Đổi / Gỡ', async () => {
    const { wrap, el } = mount(280, '<div><td-pagination total-items="2000" items-per-page="10" current-page="57"></td-pagination>'
      + '<td-empty-state title="Trống"></td-empty-state>'
      + '<td-dropzone label="Tệp" accept=".pdf"></td-dropzone>'
      + `${FIELD}</div>`);
    wrap.style.setProperty('margin-left', '20px');
    el.querySelector('td-empty-state').actions = [{ label: 'Tạo' }, { label: 'Nhập' }];
    await frame();
    const pag = el.querySelector('td-pagination');
    const shown = [...pag.querySelectorAll('.td-pagination__controls > *')].filter(visible).map((n) => n.getAttribute('data-nav') || n.classList[0]);
    expect(shown, 'pagination status form').to.deep.equal(['prev', 'td-pagination__status', 'next']);
    const acts = el.querySelector('.td-empty-state__actions');
    expectStackedFull(acts, [...acts.children], 'fallback empty-state');
    const browse = el.querySelector('.td-dropzone__browse');
    const zb = contentBox(el.querySelector('.td-dropzone__zone'));
    expect(Math.abs(rect(browse).right - zb.right) < 2 && Math.abs(rect(browse).left - zb.left) < 2, 'fallback browse full width').to.equal(true);
    const mf = el.querySelector('.td-media-field__actions');
    expectStackedFull(mf, [...mf.children], 'fallback media-field');
    expectInside(wrap, el, 'fallback 340');
  });
});
