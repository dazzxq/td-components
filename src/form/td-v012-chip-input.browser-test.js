import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdChipInput, parseChipItems } from './td-chip-input.js';
import { LAYERS, register, hasActiveAbove, trapTab } from '../utils/layers.js';

// v0.12.0 — td-chip-input (plan docs/internal/plans/v0.12.0-new-components.md step 3: D8–D14; inventory §2, §7.2, §8.2).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;

const LANGS = [
  { value: 'php', label: 'PHP' },
  { value: 'js', label: 'JavaScript' },
  { value: 'py', label: 'Python' },
  { value: 'vi', label: 'Tiếng Việt' },
];
function ci(attrs = '', parent = host, options = LANGS) {
  const el = mount(`<td-chip-input ${attrs}></td-chip-input>`, parent);
  if (options) el.options = options.map((o) => ({ ...o }));
  return el;
}
const inp = (el) => el.querySelector('.td-chip-input__input');
const chips = (el) => [...el.querySelectorAll('.td-chip-input__chip')];
const removes = (el) => [...el.querySelectorAll('.td-chip-input__remove')];
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const activeOpt = (el) => el._menuElement.querySelector('[aria-selected="true"]');
const statusEl = (el) => el.querySelector('[role="status"]');
const statusText = (el) => statusEl(el).textContent.replace(/ $/, '');
const vals = (el) => el.getValue().map((i) => String(i.value));
const isOpen = (el) => !el._menuElement.hidden;
const center = (node) => {
  const r = node.getBoundingClientRect();
  return [Math.round(r.left + Math.min(12, r.width / 2)), Math.round(r.top + r.height / 2)];
};
function deferred() {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
/** provider whose calls are recorded and resolved by the test */
function fakeProvider() {
  const calls = [];
  const fn = (query, ctx) => {
    const d = deferred();
    calls.push({ query, signal: ctx.signal, ...d });
    return d.promise;
  };
  return { fn, calls };
}
function spyEvents(el, name) {
  const list = [];
  el.addEventListener(name, (e) => { if (e instanceof CustomEvent) list.push(e.detail); });
  return list;
}

let cleanup = [];
afterEach(async () => {
  cleanup.forEach((f) => f());
  cleanup = [];
  host.innerHTML = '';
  document.querySelectorAll('body > .test-modal, body > .test-outside').forEach((m) => m.remove());
  await resetMouse();
});

const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-td-icon-size', 'data-icon', 'tabindex',
  'aria-selected', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-errormessage', 'aria-invalid',
  'aria-required', 'aria-label', 'aria-expanded', 'aria-autocomplete', 'aria-activedescendant', 'autocomplete',
  'spellcheck', 'maxlength', 'placeholder', 'data-state', 'data-placement', 'data-index', 'data-kind', 'data-full',
  'data-empty', 'for', 'id'];
function shape(el) {
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
  const cls = [...el.classList].sort().join('.');
  const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
  return { tag: el.localName, cls, attrs, kids };
}

describe('v0.12 td-chip-input — structure', () => {
  it('v0.20.0: chips are opaque (alpha 1) in light and dark', async () => {
    for (const theme of [null, 'dark']) {
      if (theme) document.documentElement.setAttribute('data-td-theme', theme);
      const el = ci('value=\'["a"]\'');
      await new Promise((r) => requestAnimationFrame(r));
      const bg = getComputedStyle(chips(el)[0]).backgroundColor;
      const m = bg.match(/-?[\d.]+/g).map(Number);
      expect(m.length > 3 ? m[3] : 1, `${theme || 'light'} ${bg}`).to.equal(1);
      expect(bg).to.equal(theme ? 'rgb(60, 60, 62)' : 'rgb(235, 235, 235)');
      el.remove();
      document.documentElement.removeAttribute('data-td-theme');
    }
  });

  it('matches the golden contract (host tree + open portal popup)', async () => {
    const html = await (await fetch('/test/contracts/chip-input.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(2);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      new Function('el', t.getAttribute('data-setup'))(el);
      const got = t.hasAttribute('data-portal') ? el._menuElement : el.firstElementChild;
      expect(JSON.stringify(shape(got))).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      host.innerHTML = '';
    }
  });

  it('portal is a body child, persistent while connected, re-created after a DOM move', async () => {
    const el = ci('label="Ngôn ngữ"');
    const menu = el._menuElement;
    expect(same(menu.parentNode, document.body)).to.equal(true);
    el.open();
    expect(isOpen(el)).to.equal(true);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(true);
    const other = mount('<div></div>');
    other.appendChild(el); // disconnect + reconnect
    expect(menu.isConnected).to.equal(false);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false); // layer released on disconnect
    expect(el._menuElement && !same(el._menuElement, menu)).to.equal(true);
    expect(same(el._menuElement.parentNode, document.body)).to.equal(true);
    expect(el._menuElement.id).to.equal(`${el.id}-menu`);
    el.open();
    expect(opts(el).length).to.equal(4);
    el.remove();
    expect(document.getElementById(`${el.id}-menu`)).to.equal(null);
    expect(hasActiveAbove(LAYERS.modal)).to.equal(false);
  });

  it('one persistent role=status region (same node across a label re-render)', async () => {
    const el = ci('label="A"');
    const s = statusEl(el);
    expect(s.classList.contains('td-sr-only')).to.equal(true);
    el.setAttribute('label', 'B');
    expect(same(statusEl(el), s)).to.equal(true);
    expect(el.querySelectorAll('[role="status"]').length).to.equal(1);
  });

  it('parseChipItems: arrays only', () => {
    expect(parseChipItems('["a",{"value":"b"}]')).to.deep.equal(['a', { value: 'b' }]);
    expect(parseChipItems('')).to.deep.equal([]);
    expect(parseChipItems('{"a":1}')).to.equal(null);
    expect(parseChipItems('not json')).to.equal(null);
  });
});

describe('v0.12 td-chip-input — naming (never the placeholder)', () => {
  it('visible label names input, listbox and chip list', () => {
    const el = ci('id="n1" label="Từ khóa" placeholder="Gõ…"');
    const label = el.querySelector('label.td-field__label');
    expect(label.getAttribute('for')).to.equal('n1-input');
    expect(inp(el).hasAttribute('aria-label')).to.equal(false);
    expect(el._menuElement.querySelector('[role="listbox"]').getAttribute('aria-labelledby')).to.equal('n1-label');
    expect(el.querySelector('.td-chip-input__chips').getAttribute('aria-labelledby')).to.equal('n1-label');
  });

  it('host aria-label is copied; chip list falls back to "Đã chọn"', () => {
    const el = ci('aria-label="Thẻ" placeholder="Gõ…"');
    expect(inp(el).getAttribute('aria-label')).to.equal('Thẻ');
    expect(el._menuElement.querySelector('[role="listbox"]').getAttribute('aria-label')).to.equal('Thẻ');
    expect(el.querySelector('.td-chip-input__chips').getAttribute('aria-label')).to.equal('Đã chọn');
    el.setAttribute('aria-label', 'Nhãn');
    expect(inp(el).getAttribute('aria-label')).to.equal('Nhãn');
  });

  it('external <label for=host> → aria-labelledby; placeholder alone gives no name attribute', () => {
    const wrap = mount('<div><label for="ext-ci">Tác giả</label><td-chip-input id="ext-ci"></td-chip-input></div>');
    const el = wrap.querySelector('td-chip-input');
    const lbl = wrap.querySelector('label');
    expect(inp(el).getAttribute('aria-labelledby')).to.equal(lbl.id);
    const bare = ci('placeholder="Chỉ placeholder"');
    expect(inp(bare).hasAttribute('aria-label')).to.equal(false);
    expect(inp(bare).hasAttribute('aria-labelledby')).to.equal(false);
  });

  it('chip remove buttons say which item they remove', () => {
    const el = ci();
    el.value = [{ value: 'php', label: 'PHP' }];
    expect(removes(el)[0].getAttribute('aria-label')).to.equal('Xóa PHP');
  });
});

describe('v0.12 td-chip-input — combobox keyboard (APG editable, list autocomplete)', () => {
  it('ArrowDown opens on the first option, moves with wrap; Alt+ArrowDown opens without an active option', async () => {
    const el = ci();
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(isOpen(el)).to.equal(true);
    expect(inp(el).getAttribute('aria-expanded')).to.equal('true');
    expect(same(activeOpt(el), opts(el)[0])).to.equal(true);
    expect(inp(el).getAttribute('aria-activedescendant')).to.equal(opts(el)[0].id);
    await sendKeys({ press: 'ArrowUp' }); // wraps to the last
    expect(same(activeOpt(el), opts(el)[3])).to.equal(true);
    await sendKeys({ press: 'ArrowDown' });
    expect(same(activeOpt(el), opts(el)[0])).to.equal(true);
    expect(same(document.activeElement, inp(el))).to.equal(true); // options never take focus
    await sendKeys({ press: 'Escape' });
    expect(isOpen(el)).to.equal(false);
    expect(inp(el).hasAttribute('aria-activedescendant')).to.equal(false);
    await sendKeys({ press: 'Alt+ArrowDown' });
    expect(isOpen(el)).to.equal(true);
    expect(activeOpt(el)).to.equal(null);
  });

  it('typing filters locally (diacritic-insensitive), Enter picks the active option; focus stays in the input', async () => {
    const el = ci();
    const changes = spyEvents(el, 'change');
    inp(el).focus();
    await sendKeys({ type: 'viet' });
    expect(isOpen(el)).to.equal(true);
    expect(opts(el).map((o) => o.textContent)).to.deep.equal(['Tiếng Việt']);
    expect(activeOpt(el)).to.equal(null); // no automatic selection
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['vi']);
    expect(inp(el).value).to.equal('');
    expect(isOpen(el)).to.equal(false);
    expect(same(document.activeElement, inp(el))).to.equal(true);
    expect(changes.length).to.equal(1);
    expect(changes[0].added.value).to.equal('vi');
    expect(changes[0].value.map((i) => i.value)).to.deep.equal(['vi']);
    expect(changes[0].items.length).to.equal(1);
    expect(statusText(el)).to.equal('Đã thêm Tiếng Việt');
  });

  it('already-selected items are not suggested', async () => {
    const el = ci();
    el.value = ['php'];
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(opts(el).map((o) => o.textContent)).to.deep.equal(['JavaScript', 'Python', 'Tiếng Việt']);
  });

  it('Enter without an active option picks an exact match; otherwise creates only with allow-create', async () => {
    const el = ci();
    inp(el).focus();
    await sendKeys({ type: 'python' });
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['py']);
    await sendKeys({ type: 'Rust' });
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['py']); // no allow-create → nothing
    expect(inp(el).value).to.equal('Rust');
    el.setAttribute('allow-create', '');
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['py', 'Rust']);
    expect(el.getValue()[1]).to.deep.equal({ value: 'Rust', label: 'Rust' });
  });

  it('Escape closes the popup (text kept), a second Escape clears the text', async () => {
    const el = ci();
    inp(el).focus();
    await sendKeys({ type: 'p' });
    expect(isOpen(el)).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(isOpen(el)).to.equal(false);
    expect(inp(el).value).to.equal('p');
    await sendKeys({ press: 'Escape' });
    expect(inp(el).value).to.equal('');
  });

  it('IME composition Enter is ignored', () => {
    const el = ci();
    el.open();
    el._setActive(0);
    inp(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    expect(vals(el)).to.deep.equal([]);
  });

  it('Tab closes the popup and moves on (never selects)', async () => {
    const wrap = mount('<div></div>');
    const el = ci('', wrap);
    const after = mount('<button type="button">Sau</button>', wrap);
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Tab' });
    expect(isOpen(el)).to.equal(false);
    expect(vals(el)).to.deep.equal([]);
    expect(same(document.activeElement, after)).to.equal(true);
  });

  it('mouse pick keeps focus in the input (dcms bug 2.2.2)', async () => {
    const el = ci();
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendMouse({ type: 'click', position: center(opts(el)[1]) });
    expect(vals(el)).to.deep.equal(['js']);
    expect(same(document.activeElement, inp(el))).to.equal(true);
  });

  it('outside pointerdown closes; the inner native change never escapes as the host change', async () => {
    const el = ci();
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e));
    // ABOVE the field (the suggestions open below it and would cover a button placed after it — v0.20.0 dropped the
    // pop-in scale that used to leave the button's left edge uncovered during the first frames)
    const outside = mount('<button type="button" class="test-outside">ngoài</button>', document.body);
    document.body.prepend(outside);
    inp(el).focus();
    await sendKeys({ type: 'p' });
    expect(isOpen(el)).to.equal(true);
    await sendMouse({ type: 'click', position: center(outside) });
    expect(isOpen(el)).to.equal(false);
    expect(changes.length).to.equal(0); // blur after typing fired a native change on the inner input
  });
});

describe('v0.12 td-chip-input — chips keyboard (D11: one tab stop, roving remove buttons)', () => {
  function three() {
    const el = ci();
    el.value = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
    return el;
  }

  it('remove buttons are not tab stops; Tab passes through the one input', async () => {
    const wrap = mount('<div><button type="button" id="before">Trước</button></div>');
    const el = ci('', wrap);
    el.value = ['a', 'b'];
    const after = mount('<button type="button">Sau</button>', wrap);
    expect(removes(el).every((b) => b.tabIndex === -1)).to.equal(true);
    wrap.querySelector('#before').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, inp(el))).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, after)).to.equal(true);
  });

  it('Backspace at caret 0 focuses the last chip (never deletes); arrows/Home/End rove; ArrowRight past the end → input', async () => {
    const el = three();
    inp(el).focus();
    await sendKeys({ press: 'Backspace' });
    expect(vals(el)).to.deep.equal(['a', 'b', 'c']);
    expect(same(document.activeElement, removes(el)[2])).to.equal(true);
    await sendKeys({ press: 'ArrowLeft' });
    expect(same(document.activeElement, removes(el)[1])).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(same(document.activeElement, removes(el)[0])).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(same(document.activeElement, removes(el)[2])).to.equal(true);
    await sendKeys({ press: 'ArrowRight' });
    expect(same(document.activeElement, inp(el))).to.equal(true);
    await sendKeys({ press: 'ArrowLeft' }); // caret 0 → last chip
    expect(same(document.activeElement, removes(el)[2])).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(same(document.activeElement, inp(el))).to.equal(true);
  });

  it('Backspace with text before the caret edits the text', async () => {
    const el = three();
    inp(el).focus();
    await sendKeys({ type: 'xy' });
    await sendKeys({ press: 'Backspace' });
    expect(inp(el).value).to.equal('x');
    expect(same(document.activeElement, inp(el))).to.equal(true);
  });

  it('Delete removes and focus moves next → previous → input; only the affected li changes', async () => {
    const el = three();
    const changes = spyEvents(el, 'change');
    const liC = chips(el)[2];
    removes(el)[1].focus();
    await sendKeys({ press: 'Delete' });
    expect(vals(el)).to.deep.equal(['a', 'c']);
    expect(same(chips(el)[1], liC)).to.equal(true); // kept, re-numbered
    expect(liC.getAttribute('data-index')).to.equal('1');
    expect(same(document.activeElement, removes(el)[1])).to.equal(true); // next (C)
    expect(changes[0].removed.value).to.equal('b');
    expect(statusText(el)).to.equal('Đã xóa B');
    await sendKeys({ press: 'Backspace' }); // removes C (last) → previous
    expect(vals(el)).to.deep.equal(['a']);
    expect(same(document.activeElement, removes(el)[0])).to.equal(true);
    await sendKeys({ press: 'Enter' }); // native activation removes too
    expect(vals(el)).to.deep.equal([]);
    expect(same(document.activeElement, inp(el))).to.equal(true); // never lost to <body>
    expect(changes.length).to.equal(3);
    expect(el.querySelector('.td-chip-input__chips').hidden).to.equal(true);
  });

  it('mouse click on × removes and focus stays in the component', async () => {
    const el = three();
    inp(el).focus();
    await sendMouse({ type: 'click', position: center(removes(el)[0]) });
    expect(vals(el)).to.deep.equal(['b', 'c']);
    expect(el.contains(document.activeElement)).to.equal(true);
  });
});

describe('v0.12 td-chip-input — async search (D9)', () => {
  it('race: out-of-order responses — only the latest renders, the first signal is aborted', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="0"', host, null);
    el.search = p.fn;
    inp(el).focus();
    await sendKeys({ type: 'a' });
    await wait(20);
    await sendKeys({ type: 'b' });
    await wait(20);
    expect(p.calls.map((c) => c.query)).to.deep.equal(['a', 'ab']);
    expect(p.calls[0].signal.aborted).to.equal(true);
    expect(p.calls[1].signal.aborted).to.equal(false);
    p.calls[1].resolve([{ value: 2, label: 'AB mới' }]);
    await wait(0);
    p.calls[0].resolve([{ value: 1, label: 'A cũ' }]); // provider ignored the signal → still dropped
    await wait(10);
    expect(opts(el).map((o) => o.textContent)).to.deep.equal(['AB mới']);
    expect(el.lastResults.map((i) => i.value)).to.deep.equal([2]);
  });

  it('a response arriving after a pick / blur never reopens the popup', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="0"', host, null);
    el.search = p.fn;
    inp(el).focus();
    await sendKeys({ type: 'p' });
    await wait(20);
    p.calls[0].resolve([{ value: 'php', label: 'PHP' }]);
    await wait(10);
    await sendKeys({ type: 'h' }); // new request pending, old list still shown
    await wait(20);
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['php']);
    expect(p.calls[1].signal.aborted).to.equal(true);
    p.calls[1].resolve([{ value: 'x', label: 'Muộn' }]);
    await wait(10);
    expect(isOpen(el)).to.equal(false);
    // blur case
    await sendKeys({ type: 'z' });
    await wait(20);
    const outside = mount('<button type="button" class="test-outside">x</button>', document.body);
    outside.focus();
    p.calls[2].resolve([{ value: 'z', label: 'Z' }]);
    await wait(10);
    expect(isOpen(el)).to.equal(false);
    expect(p.calls[2].signal.aborted).to.equal(true);
  });

  it('debounce: fast typing makes ONE request after search-delay', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="120"', host, null);
    el.search = p.fn;
    inp(el).focus();
    await sendKeys({ type: 'abc' });
    expect(p.calls.length).to.equal(0);
    await wait(250);
    expect(p.calls.map((c) => c.query)).to.deep.equal(['abc']);
  });

  it('min-chars: shorter typed text never searches (and closes)', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="0" min-chars="2"', host, null);
    el.search = p.fn;
    inp(el).focus();
    await sendKeys({ type: 'a' });
    await wait(30);
    expect(p.calls.length).to.equal(0);
    await sendKeys({ type: 'b' });
    await wait(30);
    expect(p.calls.map((c) => c.query)).to.deep.equal(['ab']);
  });

  it('show-on-focus runs an EMPTY-query search on focus even when min-chars > 0; typed searches honour min-chars', async () => {
    const p = fakeProvider();
    const wrap = mount('<div><button type="button" id="sof-before">Trước</button></div>');
    const el = ci('search-delay="0" min-chars="3" show-on-focus', wrap, null);
    el.search = p.fn;
    wrap.querySelector('#sof-before').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, inp(el))).to.equal(true);
    await wait(10);
    expect(p.calls.map((c) => c.query)).to.deep.equal(['']);
    p.calls[0].resolve([{ value: 'hot', label: 'Phổ biến' }]);
    await wait(10);
    expect(isOpen(el)).to.equal(true);
    expect(opts(el).map((o) => o.textContent)).to.deep.equal(['Phổ biến']);
    await sendKeys({ type: 'ab' }); // < 3 chars: no typed search, popup closes
    await wait(30);
    expect(p.calls.length).to.equal(1);
    expect(isOpen(el)).to.equal(false);
    await sendKeys({ type: 'c' });
    await wait(30);
    expect(p.calls.map((c) => c.query)).to.deep.equal(['', 'abc']);
  });

  it('show-on-focus with local options lists them all on focus', async () => {
    const el = ci('show-on-focus min-chars="2"');
    inp(el).focus();
    expect(isOpen(el)).to.equal(true);
    expect(opts(el).length).to.equal(4);
  });

  it('loading state (after 400 ms) and results/none announcements', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="0"', host, null);
    el.search = p.fn;
    const status = statusEl(el);
    inp(el).focus();
    await sendKeys({ type: 'q' });
    await wait(80);
    expect(isOpen(el)).to.equal(false); // fast responses never flash "Đang tìm…"
    await wait(400);
    const empty = el._menuElement.querySelector('.td-chip-input__empty');
    expect(isOpen(el)).to.equal(true);
    expect(empty.getAttribute('data-kind')).to.equal('loading');
    expect(empty.textContent).to.equal('Đang tìm…');
    expect(statusText(el)).to.equal('Đang tìm…');
    p.calls[0].resolve([{ value: 1, label: 'Một' }, { value: 2, label: 'Hai' }]);
    await wait(10);
    expect(empty.hasAttribute('data-kind')).to.equal(false);
    expect(empty.textContent).to.equal('');
    await wait(600);
    expect(statusText(el)).to.equal('2 gợi ý');
    await sendKeys({ type: 'z' });
    await wait(20);
    p.calls[1].resolve([]);
    await wait(10);
    expect(empty.getAttribute('data-kind')).to.equal('none');
    expect(empty.textContent).to.equal('Không có gợi ý');
    await wait(600);
    expect(statusText(el)).to.equal('Không có gợi ý');
    expect(same(statusEl(el), status)).to.equal(true);
  });

  it('rejection → visible error row + status + search-error event (dcms bug 2.2.6)', async () => {
    const p = fakeProvider();
    const el = ci('search-delay="0"', host, null);
    el.search = p.fn;
    const errors = spyEvents(el, 'search-error');
    inp(el).focus();
    await sendKeys({ type: 'x' });
    await wait(20);
    const boom = new Error('500');
    p.calls[0].reject(boom);
    await wait(10);
    const empty = el._menuElement.querySelector('.td-chip-input__empty');
    expect(isOpen(el)).to.equal(true);
    expect(empty.getAttribute('data-kind')).to.equal('error');
    expect(empty.textContent).to.equal('Không tải được gợi ý');
    expect(statusText(el)).to.equal('Không tải được gợi ý');
    expect(errors.length).to.equal(1);
    expect(errors[0].query).to.equal('x');
    expect(same(errors[0].error, boom)).to.equal(true);
  });

  it('an AbortError from a cancelled request is not reported', async () => {
    const el = ci('search-delay="0"', host, null);
    const errors = spyEvents(el, 'search-error');
    el.search = (q, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    inp(el).focus();
    await sendKeys({ type: 'ab' });
    await wait(30);
    el.close();
    await wait(10);
    expect(errors.length).to.equal(0);
  });
});

describe('v0.12 td-chip-input — create, duplicates, max-items (D10)', () => {
  it('create row "Thêm “…”" when no exact match; clicking it adds the default item', async () => {
    const el = ci('allow-create');
    inp(el).focus();
    await sendKeys({ type: 'Rust' });
    const row = el._menuElement.querySelector('.td-chip-input__option--create');
    expect(row.textContent).to.equal('Thêm “Rust”');
    await sendMouse({ type: 'click', position: center(row) });
    expect(el.getValue()).to.deep.equal([{ value: 'Rust', label: 'Rust' }]);
    expect(same(document.activeElement, inp(el))).to.equal(true);
    inp(el).value = '';
    await sendKeys({ type: 'php' }); // exact (folded) match with an option → no create row
    expect(el._menuElement.querySelector('.td-chip-input__option--create')).to.equal(null);
  });

  it('async create(text) hook: item added, null declines (text kept), whitespace collapsed', async () => {
    const el = ci('allow-create', host, null);
    const seen = [];
    let next = null;
    el.create = async (text) => { seen.push(text); await wait(20); return next; };
    const changes = spyEvents(el, 'change');
    inp(el).focus();
    await sendKeys({ type: '  Nguyễn   Văn A ' });
    await sendKeys({ press: 'Enter' });
    await wait(50);
    expect(seen).to.deep.equal(['Nguyễn Văn A']);
    expect(vals(el)).to.deep.equal([]);
    expect(inp(el).value).to.equal('  Nguyễn   Văn A ');
    next = { value: 'author-9', label: 'Nguyễn Văn A' };
    await sendKeys({ press: 'Enter' });
    await wait(50);
    expect(vals(el)).to.deep.equal(['author-9']);
    expect(changes.length).to.equal(1);
    expect(inp(el).value).to.equal('');
    expect(same(document.activeElement, inp(el))).to.equal(true);
  });

  it('duplicates are rejected by value (API, pick, create — folded) and announced', async () => {
    const el = ci('allow-create');
    el.value = [{ value: 'php', label: 'PHP' }];
    expect(el.addItem({ value: 'php', label: 'Khác' })).to.equal(false);
    expect(el.addItem('php')).to.equal(false);
    el.value = [{ value: 'php', label: 'PHP' }, { value: 'php', label: 'Lặp' }];
    expect(vals(el)).to.deep.equal(['php']);
    const changes = spyEvents(el, 'change');
    inp(el).focus();
    await sendKeys({ type: 'PHP' });
    await sendKeys({ press: 'Enter' }); // created text folds to an existing item
    expect(vals(el)).to.deep.equal(['php']);
    expect(statusText(el)).to.equal('Đã có PHP');
    expect(changes.length).to.equal(0);
    // a provider returning the selected value: filtered out of the list
    el.search = () => [{ value: 'php', label: 'PHP' }, { value: 'go', label: 'Go' }];
    inp(el).value = '';
    await sendKeys({ type: 'g' });
    await wait(300);
    expect(opts(el).map((o) => o.textContent)).to.deep.equal(['Go', 'Thêm “g”']);
  });

  it('max-items: blocks + announces, the input stays focused and visible (dcms bug 2.2.3)', async () => {
    const el = ci('max-items="2" allow-create');
    const root = el.querySelector('.td-chip-input');
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['php', 'js']);
    expect(root.hasAttribute('data-full')).to.equal(true);
    expect(statusText(el)).to.equal('Đã thêm JavaScript. Đã đạt tối đa 2 mục');
    expect(same(document.activeElement, inp(el))).to.equal(true);
    expect(inp(el).getClientRects().length > 0).to.equal(true);
    await sendKeys({ type: 'py' });
    expect(isOpen(el)).to.equal(false); // typing does not open suggestions
    await sendKeys({ press: 'Enter' });
    expect(vals(el)).to.deep.equal(['php', 'js']);
    expect(statusText(el)).to.equal('Đã đạt tối đa 2 mục');
    expect(el.addItem('go')).to.equal(false);
    el.removeItem('js');
    expect(root.hasAttribute('data-full')).to.equal(false);
  });

  it('max-length caps typed text (default 200)', () => {
    const el = ci();
    expect(inp(el).maxLength).to.equal(200);
    el.setAttribute('max-length', '5');
    expect(inp(el).maxLength).to.equal(5);
  });
});

describe('v0.12 td-chip-input — form value (D8)', () => {
  it('one FormData entry per item under the host name, in order; user add updates it', async () => {
    const form = mount('<form><td-chip-input name="tags[]" value=\'["a",{"value":"b","label":"Bê"}]\'></td-chip-input></form>');
    const el = form.querySelector('td-chip-input');
    el.options = [{ value: 'c', label: 'Xê' }];
    expect(new FormData(form).getAll('tags[]')).to.deep.equal(['a', 'b']);
    expect(chips(el).map((c) => c.textContent)).to.deep.equal(['a', 'Bê']);
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(new FormData(form).getAll('tags[]')).to.deep.equal(['a', 'b', 'c']);
    el.setAttribute('name', 'k');
    expect(new FormData(form).getAll('k')).to.deep.equal(['a', 'b', 'c']);
    expect(new FormData(form).getAll('tags[]')).to.deep.equal([]);
  });

  it('no name → nothing submitted', () => {
    const form = mount('<form><td-chip-input value=\'["a"]\'></td-chip-input></form>');
    expect([...new FormData(form).keys()]).to.deep.equal([]);
  });

  it('required → valueMissing (Vietnamese) until one item', async () => {
    const form = mount('<form><td-chip-input name="t" required></td-chip-input></form>');
    const el = form.querySelector('td-chip-input');
    el.options = LANGS;
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal('Vui lòng thêm ít nhất một mục');
    expect(form.checkValidity()).to.equal(false);
    expect(inp(el).getAttribute('aria-required')).to.equal('true');
    el.addItem('php');
    expect(el.validity.valid).to.equal(true);
    el.clear();
    expect(el.validity.valueMissing).to.equal(true);
  });

  it('reset restores the value attribute items; state restore re-applies labels', async () => {
    const form = mount('<form><td-chip-input name="t" value=\'["a","b"]\'></td-chip-input></form>');
    const el = form.querySelector('td-chip-input');
    el.options = LANGS;
    removes(el)[0].focus();
    await sendKeys({ press: 'Delete' });
    inp(el).value = 'dang go';
    expect(vals(el)).to.deep.equal(['b']);
    form.reset();
    expect(vals(el)).to.deep.equal(['a', 'b']);
    expect(inp(el).value).to.equal('');
    el.formStateRestoreCallback(JSON.stringify([{ value: 'x', label: 'Ích' }]), 'restore');
    expect(el.getValue()).to.deep.equal([{ value: 'x', label: 'Ích' }]);
    expect(chips(el)[0].textContent).to.equal('Ích');
  });

  it('invalid value attribute → ignored with one warning; the value property accepts arrays and JSON', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    cleanup.push(() => { console.warn = orig; });
    const el = mount('<td-chip-input value="not json"></td-chip-input>');
    expect(vals(el)).to.deep.equal([]);
    expect(warns.length).to.equal(1);
    el.value = '["x","y"]';
    expect(vals(el)).to.deep.equal(['x', 'y']);
    el.value = [1, { value: 2, label: 'Hai' }, { label: 'không có value' }, null];
    expect(vals(el)).to.deep.equal(['1', '2']);
  });

  it('programmatic API is silent (no change event, no announcement)', () => {
    const el = ci();
    const changes = spyEvents(el, 'change');
    el.setValue(['a']);
    el.addItem('b');
    el.removeItem('a');
    el.clear();
    el.value = ['c'];
    expect(changes.length).to.equal(0);
    expect(statusText(el)).to.equal('');
  });

  it('property set before upgrade/connect is kept', () => {
    const el = document.createElement('td-chip-input');
    el.value = ['early'];
    host.appendChild(el);
    expect(vals(el)).to.deep.equal(['early']);
    expect(chips(el).length).to.equal(1);
  });
});

describe('v0.12 td-chip-input — error contract, disabled', () => {
  it('setError / clearError / error-text / reset', () => {
    const form = mount('<form><td-chip-input id="err-ci" name="t" label="Thẻ"></td-chip-input></form>');
    const el = form.querySelector('td-chip-input');
    el.setError('Chọn ít nhất 1 thẻ');
    const note = el.querySelector('.td-field-error');
    expect(note.textContent).to.equal('Chọn ít nhất 1 thẻ');
    expect(note.id).to.equal('err-ci-error');
    expect(inp(el).getAttribute('aria-invalid')).to.equal('true');
    expect(inp(el).getAttribute('aria-errormessage')).to.equal('err-ci-error');
    expect(inp(el).getAttribute('aria-describedby')).to.equal('err-ci-error');
    const box = el.querySelector('.td-chip-input__box');
    expect(getComputedStyle(box).borderTopColor).to.not.equal(getComputedStyle(mount('<td-chip-input></td-chip-input>').querySelector('.td-chip-input__box')).borderTopColor);
    el.clearError();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(inp(el).hasAttribute('aria-invalid')).to.equal(false);
    el.setAttribute('error-text', 'Lỗi thuộc tính');
    expect(el.errorMessage).to.equal('Lỗi thuộc tính');
    form.reset();
    expect(el.errorMessage).to.equal('');
  });

  it('disabled (attribute and <fieldset disabled>): input + remove buttons disabled, no popup, no removal', async () => {
    const el = ci('disabled');
    el.value = ['a'];
    expect(inp(el).disabled).to.equal(true);
    expect(removes(el)[0].disabled).to.equal(true);
    el.open();
    expect(isOpen(el)).to.equal(false);
    el.removeAttribute('disabled');
    expect(inp(el).disabled).to.equal(false);
    expect(removes(el)[0].disabled).to.equal(false);
    const fs = mount('<fieldset><td-chip-input name="f"></td-chip-input></fieldset>');
    const inner = fs.querySelector('td-chip-input');
    inner.options = LANGS;
    inner.open();
    expect(isOpen(inner)).to.equal(true);
    fs.disabled = true;
    await wait(0);
    expect(inp(inner).disabled).to.equal(true);
    expect(isOpen(inner)).to.equal(false);
    expect(inner.hasAttribute('disabled')).to.equal(false);
    fs.disabled = false;
    await wait(0);
    expect(inp(inner).disabled).to.equal(false);
  });
});

describe('v0.12 td-chip-input — layers (LAYERS.popover)', () => {
  it('inside a blocking modal: the popup stays usable, Escape closes only the popup', async () => {
    const modal = mount('<div class="test-modal"><button type="button" id="m-first">Đầu</button></div>', document.body);
    let modalEscape = 0;
    const el = ci('', modal);
    const reg = register({
      layer: LAYERS.modal, element: modal, blocking: true,
      onEscape: () => { modalEscape++; }, onTab: (e) => trapTab(e, modal, LAYERS.modal),
    });
    cleanup.push(() => reg.release());
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(el._menuElement.hasAttribute('inert')).to.equal(false);
    await sendMouse({ type: 'click', position: center(opts(el)[2]) });
    expect(vals(el)).to.deep.equal(['py']);
    await sendKeys({ press: 'ArrowDown' });
    expect(isOpen(el)).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(isOpen(el)).to.equal(false);
    expect(modalEscape).to.equal(0);
    await sendKeys({ press: 'Escape' }); // popup gone → the modal gets it
    expect(modalEscape).to.equal(1);
  });

  it('Tab inside a modal: popup closes and the trap still wraps', async () => {
    const modal = mount('<div class="test-modal"><button type="button" id="m-first">Đầu</button></div>', document.body);
    const el = ci('', modal);
    const first = modal.querySelector('#m-first');
    const reg = register({ layer: LAYERS.modal, element: modal, blocking: true, onTab: (e) => trapTab(e, modal, LAYERS.modal) });
    cleanup.push(() => reg.release());
    inp(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Tab' });
    expect(isOpen(el)).to.equal(false);
    expect(same(document.activeElement, first)).to.equal(true);
  });
});

describe('v0.12 td-chip-input — XSS (labels, results, typed text, hooks)', () => {
  const PAY = '"><img src=x onerror="window.__ciXss=1">';
  it('option labels/descriptions, chip labels, typed text and labels.* render as text', async () => {
    const el = ci('allow-create', host, [{ value: PAY, label: PAY, description: PAY }]);
    el.messages = { create: `${PAY} {text}` };
    el.open();
    expect(el._menuElement.querySelector('img')).to.equal(null);
    expect(opts(el)[0].querySelector('.td-chip-input__option-label').textContent).to.equal(PAY);
    expect(opts(el)[0].querySelector('.td-chip-input__option-desc').textContent).to.equal(PAY);
    inp(el).focus();
    await sendKeys({ type: '<b>x</b>' });
    const row = el._menuElement.querySelector('.td-chip-input__option--create');
    expect(row.textContent).to.equal(`${PAY} <b>x</b>`);
    expect(row.querySelector('b')).to.equal(null);
    el.value = [PAY, { value: '"]"><img src=x onerror=alert(1)>', label: PAY }];
    expect(el.querySelector('img')).to.equal(null);
    expect(chips(el)[0].textContent).to.equal(PAY);
    expect(removes(el)[0].getAttribute('aria-label')).to.equal(`Xóa ${PAY}`);
    const form = mount('<form></form>');
    form.appendChild(el);
    el.setAttribute('name', 'v');
    expect(new FormData(form).getAll('v')).to.deep.equal([PAY, '"]"><img src=x onerror=alert(1)>']);
    await wait(20);
    expect(window.__ciXss).to.equal(undefined);
  });

  it('render hooks: a Node is appended, a string is TEXT, a throwing hook falls back to the label', () => {
    const el = ci('', host, [{ value: 'a', label: 'Anh', avatar: 'x' }, { value: 'b', label: 'Bình' }]);
    el.renderOption = (item, { query }) => {
      if (item.value === 'a') {
        const s = document.createElement('strong');
        s.className = 'td-test-avatar';
        s.textContent = `${item.label}|${query}`;
        return s;
      }
      return '<img src=x onerror=alert(1)>';
    };
    el.renderChip = (item) => { if (item.value === 'b') throw new Error('hook'); return `<i>${item.label}</i>`; };
    const errs = [];
    const orig = console.error;
    console.error = (e) => errs.push(e);
    cleanup.push(() => { console.error = orig; });
    el.open();
    expect(opts(el)[0].querySelector('strong.td-test-avatar').textContent).to.equal('Anh|');
    expect(opts(el)[1].textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(el._menuElement.querySelector('img')).to.equal(null);
    el.value = ['a', 'b'];
    expect(chips(el)[0].textContent).to.equal('<i>a</i>');
    expect(chips(el)[0].querySelector('i')).to.equal(null);
    expect(chips(el)[1].textContent).to.equal('b'); // fallback label
    expect(errs.length).to.equal(1);
  });

  it('TdChipInput.labels are site-overridable', () => {
    const orig = TdChipInput.labels.remove;
    TdChipInput.labels.remove = 'Remove {label}';
    cleanup.push(() => { TdChipInput.labels.remove = orig; });
    const el = ci();
    el.value = ['x'];
    expect(removes(el)[0].getAttribute('aria-label')).to.equal('Remove x');
  });
});
