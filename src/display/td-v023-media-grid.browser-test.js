import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdMediaGrid } from './td-media-grid.js';
import { TdLightbox } from '../feedback/td-lightbox.js';
import { TdMenu } from '../feedback/td-menu.js';
import { TdModal } from '../feedback/td-modal.js';
import '../form/td-dropdown.js';

// v0.23.0 — <td-media-grid>: selectable media grid that ENHANCES site markup (plan docs/internal/plans/v0.23.0-media-grid.md).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** One item in the plan's markup contract (button opener + a site ⋯ control + a badge). */
function item(id, { open = 'button', label = true, siteTick = false, src = '/test/fixtures/1.svg' } = {}) {
  const name = label ? ` aria-label="Khung ${id}"` : '';
  const opener = open === 'a'
    ? `<a href="#photo-${id}" data-td-media-open${name}><img src="${src}" alt="Ảnh ${id}"></a>`
    : `<button type="button" data-td-media-open${name}><img src="${src}" alt=""></button>`;
  const site = siteTick ? `<button type="button" data-td-media-tick aria-label="Tick riêng ${id}">✓</button>` : '';
  return `<div data-td-media-item data-id="${id}">${opener}${site}`
    + `<button type="button" class="site-more" aria-label="Thao tác ${id}">⋯</button><span class="site-badge">mới</span></div>`;
}

function mount(n = 6, attrs = 'label="Khung hình cuộn 12"', opts) {
  const ids = Array.from({ length: n }, (_, i) => `f${i + 1}`);
  root.innerHTML = `<td-media-grid ${attrs}>${ids.map((id) => item(id, opts)).join('')}</td-media-grid>`;
  return root.querySelector('td-media-grid');
}

const itemOf = (grid, id) => grid.querySelector(`[data-td-media-item][data-id="${id}"]`);
const openOf = (grid, id) => itemOf(grid, id).querySelector('[data-td-media-open]');
const tickOf = (grid, id) => itemOf(grid, id).querySelector('.td-media-grid__tick');
const record = (grid, name) => {
  const events = [];
  grid.addEventListener(name, (e) => events.push(e));
  return events;
};
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
};

afterEach(async () => {
  TdMenu.close();
  TdModal.closeAll?.();
  TdLightbox.close();
  await resetMouse();
  root.innerHTML = '';
  await wait(30);
});

describe('td-media-grid — upgrade in place', () => {
  it('upgrades site markup: list roles, classes, one tick per item inserted as a sibling of the opener', () => {
    const grid = mount(3);
    expect(customElements.get('td-media-grid')).to.equal(TdMediaGrid);
    expect(grid.classList.contains('td-media-grid')).to.equal(true);
    expect(grid.getAttribute('role')).to.equal('list');
    expect(grid.getAttribute('aria-label')).to.equal('Khung hình cuộn 12');
    for (const id of ['f1', 'f2', 'f3']) {
      const it = itemOf(grid, id);
      expect(it.getAttribute('role')).to.equal('listitem');
      expect(it.classList.contains('td-media-grid__item')).to.equal(true);
      const open = openOf(grid, id);
      expect(open.classList.contains('td-media-grid__open')).to.equal(true);
      const ticks = it.querySelectorAll('.td-media-grid__tick');
      expect(ticks.length).to.equal(1);
      const t = ticks[0];
      expect(t.localName).to.equal('button');
      expect(t.type).to.equal('button');
      expect(t.getAttribute('tabindex')).to.equal('-1');
      expect(t.getAttribute('aria-pressed')).to.equal('false');
      expect(t.getAttribute('aria-label')).to.equal(`Chọn Khung ${id}`);
      expect(t.querySelector('svg[data-icon="check"]')).to.not.equal(null);
      expect(t.previousElementSibling).to.equal(open, 'tick right after the opener');
      expect(open.contains(t)).to.equal(false);
    }
    const live = grid.querySelector('.td-sr-only[aria-live="polite"]');
    expect(live).to.not.equal(null);
  });

  it('never nests the tick in an <a> opener; name falls back to img alt, then data-id', () => {
    root.innerHTML = `<td-media-grid>${item('a1', { open: 'a', label: false })}`
      + '<div data-td-media-item data-id="b2"><button type="button" data-td-media-open><img src="/test/fixtures/2.svg" alt=""></button></div>'
      + '</td-media-grid>';
    const grid = root.querySelector('td-media-grid');
    const a = openOf(grid, 'a1');
    expect(a.localName).to.equal('a');
    expect(a.querySelector('button')).to.equal(null);
    expect(tickOf(grid, 'a1').parentElement).to.equal(itemOf(grid, 'a1'));
    expect(tickOf(grid, 'a1').getAttribute('aria-label')).to.equal('Chọn Ảnh a1');
    expect(tickOf(grid, 'b2').getAttribute('aria-label')).to.equal('Chọn b2');
  });

  it('keeps a site-provided [data-td-media-tick] (no extra tick) and manages its aria-pressed', () => {
    const grid = mount(2, '', { siteTick: true });
    const it = itemOf(grid, 'f1');
    expect(it.querySelectorAll('button[data-td-media-tick]').length).to.equal(1);
    expect(it.querySelectorAll('.td-media-grid__tick').length).to.equal(1);
    const t = it.querySelector('[data-td-media-tick]');
    expect(t.classList.contains('td-media-grid__tick')).to.equal(true);
    expect(t.getAttribute('aria-label')).to.equal('Tick riêng f1');
    click(t);
    expect(t.getAttribute('aria-pressed')).to.equal('true');
    expect(grid.selectedIds).to.deep.equal(['f1']);
  });

  it('keeps site children (⋯, badge) and node identity across label / max / disabled changes and a reconnect', async () => {
    const grid = mount(3);
    const before = [...grid.querySelectorAll('*')];
    const more = grid.querySelector('.site-more');
    grid.setAttribute('label', 'Cuộn khác');
    grid.setAttribute('max', '2');
    grid.setAttribute('disabled', '');
    grid.removeAttribute('disabled');
    expect(grid.getAttribute('aria-label')).to.equal('Cuộn khác');
    expect([...grid.querySelectorAll('*')]).to.deep.equal(before);
    expect(grid.contains(more)).to.equal(true);
    const parent = grid.parentNode;
    grid.remove();
    parent.appendChild(grid);
    await tick();
    expect([...grid.querySelectorAll('*')]).to.deep.equal(before, 'no re-render, no duplicate tick');
    const changes = record(grid, 'select-change');
    click(tickOf(grid, 'f1'));
    expect(grid.selectedIds).to.deep.equal(['f1'], 'one listener (a doubled one would flip back)');
    expect(changes.length).to.equal(1);
  });
});

describe('td-media-grid — dynamic items', () => {
  it('upgrades items appended later and drops removed items from the selection', async () => {
    const grid = mount(2);
    const tpl = document.createElement('template');
    tpl.innerHTML = item('f9');
    grid.appendChild(tpl.content);
    await tick();
    expect(tickOf(grid, 'f9')).to.not.equal(null);
    expect(itemOf(grid, 'f9').getAttribute('role')).to.equal('listitem');
    expect(grid.items.length).to.equal(3);

    click(tickOf(grid, 'f1'));
    click(tickOf(grid, 'f9'));
    const changes = record(grid, 'select-change');
    itemOf(grid, 'f9').remove();
    await tick();
    expect(grid.selectedIds).to.deep.equal(['f1']);
    expect(changes.length).to.equal(1);
    expect(changes[0].detail).to.deep.include({ ids: ['f1'], added: [], removed: ['f9'] });
    itemOf(grid, 'f2').remove(); // not selected → no event
    await tick();
    expect(changes.length).to.equal(1);
  });
});

describe('td-media-grid — pointer', () => {
  it('tick click selects: data-selected, aria-pressed, host data-selecting, select-change detail', () => {
    const grid = mount(3);
    const changes = record(grid, 'select-change');
    click(tickOf(grid, 'f2'));
    expect(itemOf(grid, 'f2').hasAttribute('data-selected')).to.equal(true);
    expect(tickOf(grid, 'f2').getAttribute('aria-pressed')).to.equal('true');
    expect(grid.hasAttribute('data-selecting')).to.equal(true);
    expect(changes.length).to.equal(1);
    expect(changes[0].bubbles).to.equal(true);
    expect(changes[0].composed).to.equal(true);
    expect(changes[0].detail).to.deep.equal({ ids: ['f2'], added: ['f2'], removed: [] });
    click(tickOf(grid, 'f2'));
    expect(grid.hasAttribute('data-selecting')).to.equal(false);
    expect(changes[1].detail).to.deep.equal({ ids: [], added: [], removed: ['f2'] });
  });

  it('nothing selected: opener click fires a cancelable activate; preventDefault blocks the <a>', () => {
    root.innerHTML = `<td-media-grid>${item('a1', { open: 'a' })}${item('a2', { open: 'a' })}</td-media-grid>`;
    const grid = root.querySelector('td-media-grid');
    const acts = record(grid, 'activate');
    let seen = null;
    const onDoc = (e) => { seen = e; };
    document.addEventListener('click', onDoc);
    try {
      const a = openOf(grid, 'a1');
      click(a.querySelector('img'));
      expect(acts.length).to.equal(1);
      expect(acts[0].cancelable).to.equal(true);
      expect(acts[0].detail.id).to.equal('a1');
      expect(acts[0].detail.item).to.equal(itemOf(grid, 'a1'));
      expect(acts[0].detail.event).to.equal(seen);
      expect(seen.defaultPrevented).to.equal(false, 'activate not prevented → the link default runs');
      seen.preventDefault(); // (keep the test page from navigating to #photo-a1)
      grid.addEventListener('activate', (e) => e.preventDefault(), { once: true });
      click(a);
      expect(acts.length).to.equal(2);
      expect(seen.defaultPrevented).to.equal(true, 'activate prevented → link blocked');
      expect(grid.selectedIds).to.deep.equal([]);
    } finally {
      document.removeEventListener('click', onDoc);
    }
  });

  it('selecting: opener click toggles, no activate, TdLightbox.bind() does not open', async () => {
    const grid = mount(3, 'data-td-lightbox-group');
    for (const it of grid.querySelectorAll('[data-td-media-open]')) it.setAttribute('data-td-lightbox-item', '');
    const unbind = TdLightbox.bind(document);
    try {
      // sanity: with nothing selected the lightbox opens
      click(openOf(grid, 'f1'));
      await frame();
      expect(TdLightbox.isOpen).to.equal(true);
      TdLightbox.close();
      await wait(400);
      expect(TdLightbox.isOpen).to.equal(false);

      const acts = record(grid, 'activate');
      click(tickOf(grid, 'f1'));
      click(openOf(grid, 'f2'));
      await frame();
      expect(grid.selectedIds).to.deep.equal(['f1', 'f2']);
      expect(acts.length).to.equal(0);
      expect(TdLightbox.isOpen).to.equal(false);
      click(openOf(grid, 'f1').querySelector('img'));
      expect(grid.selectedIds).to.deep.equal(['f2']);
    } finally {
      unbind();
    }
  });

  it('Shift range: adds in DOM order from the anchor, anchor kept; no anchor → single flip', () => {
    const grid = mount(6);
    click(tickOf(grid, 'f2'));
    click(openOf(grid, 'f5'), { shiftKey: true });
    expect(grid.selectedIds).to.deep.equal(['f2', 'f3', 'f4', 'f5']);
    click(tickOf(grid, 'f1'), { shiftKey: true }); // anchor still f2 → backwards
    expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3', 'f4', 'f5']);
    click(tickOf(grid, 'f3')); // plain flip off, anchor = f3
    click(openOf(grid, 'f6'), { shiftKey: true }); // only adds
    expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
    grid.clear();
    const acts = record(grid, 'activate');
    click(openOf(grid, 'f4'), { shiftKey: true }); // nothing selected, no anchor → single flip, no activate
    expect(grid.selectedIds).to.deep.equal(['f4']);
    expect(acts.length).to.equal(0);
  });

  it('live region announces once per user action (range = one update)', async () => {
    const grid = mount(6);
    const live = grid.querySelector('.td-sr-only[aria-live="polite"]');
    click(tickOf(grid, 'f1'));
    await wait(50);
    let updates = 0;
    const mo = new MutationObserver((recs) => { updates += recs.length ? 1 : 0; });
    mo.observe(live, { childList: true, characterData: true, subtree: true });
    click(openOf(grid, 'f4'), { shiftKey: true });
    await wait(50);
    mo.disconnect();
    expect(updates).to.equal(1);
    expect(live.textContent).to.equal('Đã chọn 4');
  });

  it('max: no add past the cap, select-limit + announcement; a range fills up to the cap', async () => {
    const grid = mount(6, 'max="3"');
    const limits = record(grid, 'select-limit');
    click(tickOf(grid, 'f1'));
    click(openOf(grid, 'f6'), { shiftKey: true });
    expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3']);
    expect(limits.length).to.equal(1);
    expect(limits[0].detail).to.deep.equal({ max: 3 });
    click(openOf(grid, 'f5'));
    expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3']);
    expect(limits.length).to.equal(2);
    await wait(50);
    expect(grid.querySelector('.td-sr-only[aria-live="polite"]').textContent).to.equal('Tối đa 3 mục');
  });

  it('disabled: no select / flip; activate still runs; selection kept', () => {
    const grid = mount(3);
    grid.select(['f1']);
    grid.setAttribute('disabled', '');
    const acts = record(grid, 'activate');
    const changes = record(grid, 'select-change');
    click(tickOf(grid, 'f2'));
    click(openOf(grid, 'f3'));
    expect(grid.selectedIds).to.deep.equal(['f1']);
    expect(changes.length).to.equal(0);
    expect(acts.length).to.equal(1);
    expect(acts[0].detail.id).to.equal('f3');
  });
});

describe('td-media-grid — keyboard', () => {
  it('Space flips (page scroll prevented), Shift+Space adds a range, Enter always activates', async () => {
    const grid = mount(4);
    const acts = record(grid, 'activate');
    let spaceDown = null;
    const onKey = (e) => { if (e.key === ' ') spaceDown = e; };
    document.addEventListener('keydown', onKey);
    try {
      openOf(grid, 'f1').focus();
      await sendKeys({ press: 'Space' });
      expect(grid.selectedIds).to.deep.equal(['f1']);
      expect(spaceDown.defaultPrevented).to.equal(true);
      openOf(grid, 'f3').focus();
      await sendKeys({ press: 'Shift+Space' });
      expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3']);
      expect(acts.length).to.equal(0);
      // Enter while selecting → activate, selection unchanged
      await sendKeys({ press: 'Enter' });
      expect(acts.length).to.equal(1);
      expect(acts[0].detail.id).to.equal('f3');
      expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3']);
      expect(document.activeElement).to.equal(openOf(grid, 'f3'));
    } finally {
      document.removeEventListener('keydown', onKey);
    }
  });

  it('Enter with nothing selected activates once and runs the opener default (site click handler)', async () => {
    const grid = mount(2);
    const acts = record(grid, 'activate');
    let clicks = 0;
    openOf(grid, 'f2').addEventListener('click', () => { clicks++; });
    openOf(grid, 'f2').focus();
    await sendKeys({ press: 'Enter' });
    expect(acts.length).to.equal(1);
    expect(clicks).to.equal(1);
    expect(grid.selectedIds).to.deep.equal([]);
    grid.addEventListener('activate', (e) => e.preventDefault(), { once: true });
    await sendKeys({ press: 'Enter' });
    expect(acts.length).to.equal(2);
    expect(clicks).to.equal(1, 'prevented activate → no click');
  });

  it('Space / Enter on a site ⋯ TdMenu button while selecting: the menu handles it, selection unchanged', async () => {
    const grid = mount(3);
    const more = itemOf(grid, 'f2').querySelector('.site-more');
    TdMenu.bind(more, [{ label: 'Đặt làm bìa', onClick: () => {} }]);
    click(tickOf(grid, 'f1'));
    more.focus();
    await sendKeys({ press: 'Enter' });
    await frame();
    expect(TdMenu.isOpen(more)).to.equal(true);
    expect(grid.selectedIds).to.deep.equal(['f1']);
    TdMenu.close();
    await wait(50);
    more.focus();
    await sendKeys({ press: 'Space' });
    await frame();
    expect(TdMenu.isOpen(more)).to.equal(true);
    expect(grid.selectedIds).to.deep.equal(['f1']);
    // Escape closes the menu, not the selection
    await sendKeys({ press: 'Escape' });
    await frame();
    expect(TdMenu.isOpen(more)).to.equal(false);
    expect(grid.selectedIds).to.deep.equal(['f1']);
  });

  it('Esc clears the selection and keeps focus', async () => {
    const grid = mount(3);
    const changes = record(grid, 'select-change');
    openOf(grid, 'f2').focus();
    await sendKeys({ press: 'Space' });
    await sendKeys({ press: 'Escape' });
    expect(grid.selectedIds).to.deep.equal([]);
    expect(grid.hasAttribute('data-selecting')).to.equal(false);
    expect(changes.at(-1).detail).to.deep.equal({ ids: [], added: [], removed: ['f2'] });
    expect(document.activeElement).to.equal(openOf(grid, 'f2'));
  });

  it('Esc does not clear while a modal is open, nor during IME composition', async () => {
    const grid = mount(3);
    grid.select(['f1']);
    TdModal.show({ title: 'Sửa khung', content: '<p>x</p>' });
    await wait(350);
    await sendKeys({ press: 'Escape' });
    expect(grid.selectedIds).to.deep.equal(['f1']);
    TdModal.closeAll();
    await wait(350);
    openOf(grid, 'f1').focus();
    openOf(grid, 'f1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }));
    expect(grid.selectedIds).to.deep.equal(['f1']);
  });

  it('Esc does not clear while a td-dropdown menu is open', async () => {
    const grid = mount(2);
    grid.select(['f1']);
    const dd = document.createElement('td-dropdown');
    root.appendChild(dd);
    dd.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    await frame();
    dd.open();
    await frame();
    expect(dd._isOpen).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(dd._isOpen).to.equal(false, 'Escape closed the dropdown');
    expect(grid.selectedIds).to.deep.equal(['f1']);
    await sendKeys({ press: 'Escape' });
    expect(grid.selectedIds).to.deep.equal([], 'next Escape (nothing open) clears');
  });
});

describe('td-media-grid — API', () => {
  it('programmatic methods do not emit unless { emit: true }; selectedIds in DOM order', () => {
    const grid = mount(5);
    const changes = record(grid, 'select-change');
    grid.select(['f3', 'f1', 'nope']);
    expect(grid.selectedIds).to.deep.equal(['f1', 'f3']);
    expect(itemOf(grid, 'f3').hasAttribute('data-selected')).to.equal(true);
    grid.deselect(['f1']);
    grid.toggle('f5');
    expect(grid.selectedIds).to.deep.equal(['f3', 'f5']);
    grid.selectAll();
    expect(grid.selectedIds).to.deep.equal(['f1', 'f2', 'f3', 'f4', 'f5']);
    grid.clear();
    expect(grid.selectedIds).to.deep.equal([]);
    expect(changes.length).to.equal(0);
    grid.select(['f2'], { emit: true });
    expect(changes.length).to.equal(1);
    expect(changes[0].detail).to.deep.equal({ ids: ['f2'], added: ['f2'], removed: [] });
    grid.clear({ emit: true });
    expect(changes[1].detail).to.deep.equal({ ids: [], added: [], removed: ['f2'] });
    expect(grid.items.map((n) => n.dataset.id)).to.deep.equal(['f1', 'f2', 'f3', 'f4', 'f5']);
  });

  it('onSelectChange hook runs before select-change; labels are translatable', () => {
    const order = [];
    const old = { ...TdMediaGrid.labels };
    TdMediaGrid.labels.select = 'Select {name}';
    try {
      const grid = mount(2);
      expect(tickOf(grid, 'f1').getAttribute('aria-label')).to.equal('Select Khung f1');
      grid.onSelectChange = (ids) => order.push(['hook', ids]);
      grid.addEventListener('select-change', () => order.push(['event']));
      click(tickOf(grid, 'f1'));
      expect(order).to.deep.equal([['hook', ['f1']], ['event']]);
    } finally {
      Object.assign(TdMediaGrid.labels, old);
    }
  });

  it('site text in the accessible name stays text (no markup injection)', () => {
    root.innerHTML = '<td-media-grid><div data-td-media-item data-id="x"><button type="button" data-td-media-open aria-label="&lt;img src=x onerror=alert(1)&gt;"></button></div></td-media-grid>';
    const grid = root.querySelector('td-media-grid');
    expect(tickOf(grid, 'x').getAttribute('aria-label')).to.equal('Chọn <img src=x onerror=alert(1)>');
    expect(grid.querySelector('img')).to.equal(null);
  });
});

describe('td-media-grid — tick visibility (td.css)', () => {
  it('hidden at rest; shown on mouse hover (pointer fine) and when selecting', async () => {
    const grid = mount(3);
    await frame();
    expect(matchMedia('(hover: hover) and (pointer: fine)').matches).to.equal(true);
    const t = tickOf(grid, 'f2');
    expect(getComputedStyle(t).opacity).to.equal('0');
    const [x, y] = center(openOf(grid, 'f2'));
    await sendMouse({ type: 'move', position: [x, y] });
    await wait(400);
    expect(getComputedStyle(t).opacity).to.equal('1');
    await resetMouse();
    await wait(400);
    expect(getComputedStyle(t).opacity).to.equal('0');
    grid.select(['f1']);
    await wait(400);
    expect(getComputedStyle(t).opacity).to.equal('1', 'host [data-selecting] shows every tick');
  });

  it('shown on :focus-within (Tab onto the opener); the tick is not a Tab stop', async () => {
    const before = document.createElement('button');
    before.textContent = 'trước';
    root.appendChild(before);
    const grid = document.createElement('div');
    grid.innerHTML = `<td-media-grid>${item('f1')}${item('f2')}</td-media-grid>`;
    root.appendChild(grid);
    const g = root.querySelector('td-media-grid');
    before.focus();
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement).to.equal(openOf(g, 'f1'));
    await wait(400);
    expect(getComputedStyle(tickOf(g, 'f1')).opacity).to.equal('1');
    expect(getComputedStyle(tickOf(g, 'f2')).opacity).to.equal('0');
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement.classList.contains('site-more')).to.equal(true, 'tick skipped (tabindex -1)');
  });

  it('selected item: surface fill, opener scaled, solid tick', async () => {
    const grid = mount(2);
    grid.select(['f1']);
    await wait(400);
    const t = getComputedStyle(tickOf(grid, 'f1'));
    expect(t.opacity).to.equal('1');
    expect(t.backgroundColor).to.not.equal(getComputedStyle(tickOf(grid, 'f2')).backgroundColor);
    expect(getComputedStyle(openOf(grid, 'f1')).transform).to.not.equal('none');
    expect(getComputedStyle(openOf(grid, 'f2')).transform).to.equal('none');
  });
});

describe('td-media-grid — markup contract (test/contracts/media-grid.html)', () => {
  it('upgraded item shape equals the contract', async () => {
    const html = await (await fetch('/test/contracts/media-grid.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const t = doc.querySelector('template');
    root.innerHTML = t.getAttribute('data-markup');
    const grid = root.firstElementChild;
    const shape = (el) => ({
      tag: el.localName,
      cls: [...el.classList].sort().join('.'),
      attrs: ['type', 'role', 'aria-label', 'aria-pressed', 'aria-live', 'tabindex', 'data-id', 'data-icon',
        'data-td-media-item', 'data-td-media-open'].filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`),
      kids: el.localName === 'svg' ? [] : [...el.children].map(shape),
    });
    expect(shape(grid)).to.deep.equal(shape(t.content.firstElementChild));
  });
});
