import { expect } from '@esm-bundle/chai';
import { TdToggle } from './td-toggle.js';

// v0.52.0 (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md M2) — <td-toggle tone> + status-text in Chromium,
// Firefox AND WebKit. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const cleanup = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  document.documentElement.removeAttribute('data-td-theme');
});

function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap.querySelector('td-toggle');
}
const input = (el) => el.querySelector('input.td-switch__input');
/** settle the switch transitions (computed colours are then the end values) */
const settle = (el) => {
  for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSTransition) a.finish(); // not the pending pulse
};
const track = (el) => el.querySelector('.td-switch__track');
const thumb = (el) => el.querySelector('.td-switch__thumb');
const onIcon = (el) => el.querySelector('.td-switch__icon--on');
const describedText = (el) => (input(el).getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
  .map((id) => document.getElementById(id)?.textContent || `#${id}?`).join(' | ');
/** a probe element resolving a token to its computed colour */
function tokenColor(name, scope = document.body) {
  const p = document.createElement('span');
  p.style.color = `var(${name})`; // test-only probe (CSSOM, not markup)
  scope.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
}
/** the markup render() produces for the current attributes (the in-place patches must equal it) */
function rendered(el) {
  const tpl = document.createElement('template');
  tpl.innerHTML = el.render();
  return [...tpl.content.children].map((n) => n.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '')).join('');
}
function live(el) {
  return [...el.children].filter((n) => !n.classList.contains('td-field-error'))
    .map((n) => {
      const c = n.cloneNode(true);
      for (const s of c.querySelectorAll('[data-td-icon]')) s.replaceChildren();
      const i = c.querySelector?.('input');
      if (i) for (const a of [...i.attributes]) if (a.name.startsWith('aria-')) i.removeAttribute(a.name);
      if (c.classList.contains('td-sr-only')) c.textContent = '';
      return c.outerHTML;
    }).join('');
}

describe('td-toggle tone (v0.52 M2)', () => {
  it('no tone: markup is exactly the v0.51 render (no status span, ✓ icon, no describedby)', async () => {
    const el = mount('<td-toggle id="t0" label="Wifi" checked></td-toggle>');
    await wait();
    expect(el.children.length).to.equal(1);
    expect(onIcon(el).getAttribute('data-td-icon')).to.equal('check');
    expect(input(el).hasAttribute('aria-describedby')).to.equal(false);
    expect(el.querySelector('.td-switch__status')).to.equal(null);
    expect(el.render()).to.equal('<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input">'
      + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
      + '<span class="td-switch__icon td-switch__icon--off" data-td-icon="close"></span>'
      + '<span class="td-switch__icon td-switch__icon--on" data-td-icon="check"></span>'
      + '</span></span><span class="td-switch__label">Wifi</span></label>');
  });

  for (const [tone, token, icon, text] of [['success', '--td-color-success', 'check', 'Đã xác nhận'], ['warning', '--td-color-warning', 'clock', 'Đang chờ']]) {
    for (const scheme of ['light', 'dark']) {
      it(`tone="${tone}" (${scheme}): track = ${token}, knob = on-status, icon ${icon}, status text while ON`, async () => {
        if (scheme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
        const el = mount(`<td-toggle id="t-${tone}-${scheme}" label="2FA" tone="${tone}" checked></td-toggle>`);
        await wait();
        await frame();
        settle(el);
        expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor(token));
        expect(getComputedStyle(thumb(el)).backgroundColor).to.equal(tokenColor('--td-color-on-status'));
        expect(getComputedStyle(onIcon(el)).color).to.equal(tokenColor(token));
        expect(onIcon(el).getAttribute('data-td-icon')).to.equal(icon);
        expect(onIcon(el).querySelector('svg')?.getAttribute('data-icon')).to.equal(icon);
        expect(describedText(el)).to.equal(text);
        // OFF: neutral track, the knob of every switch, no status description
        el.checked = false;
        await frame();
        settle(el);
        expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-switch-off'));
        expect(getComputedStyle(thumb(el)).backgroundColor).to.equal(tokenColor('--td-switch-thumb'));
        expect(input(el).hasAttribute('aria-describedby')).to.equal(false);
      });
    }
  }

  it('unknown tone → the default switch (no status)', async () => {
    const el = mount('<td-toggle id="t-x" label="X" tone="danger" checked></td-toggle>');
    await wait();
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-switch-on'));
    expect(onIcon(el).getAttribute('data-td-icon')).to.equal('check');
    expect(el.querySelector('.td-switch__status')).to.equal(null);
  });

  it('color wins the colour (track + default knob); tone still gives the icon + status text', async () => {
    const el = mount('<td-toggle id="t-c" label="X" tone="warning" color="#6366f1" checked></td-toggle>');
    await wait();
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal('rgb(99, 102, 241)');
    expect(getComputedStyle(thumb(el)).backgroundColor).to.equal(tokenColor('--td-switch-thumb'));
    expect(onIcon(el).getAttribute('data-td-icon')).to.equal('clock');
    expect(describedText(el)).to.equal('Đang chờ');
  });

  it('status-text overrides the default; works without a tone; messages are site-translatable', async () => {
    const el = mount('<td-toggle id="t-s" label="2FA" tone="warning" status-text="Chờ người dùng quét mã QR khi đăng nhập" checked></td-toggle>');
    const plain = mount('<td-toggle id="t-p" label="Bật" status-text="Đang hoạt động" checked></td-toggle>');
    await wait();
    expect(describedText(el)).to.equal('Chờ người dùng quét mã QR khi đăng nhập');
    expect(describedText(plain)).to.equal('Đang hoạt động');
    settle(plain);
    expect(getComputedStyle(track(plain)).backgroundColor).to.equal(tokenColor('--td-switch-on'));
    const orig = TdToggle.messages.statusSuccess;
    TdToggle.messages.statusSuccess = 'Verified';
    cleanup.push(() => { TdToggle.messages.statusSuccess = orig; });
    const en = mount('<td-toggle id="t-en" label="2FA" tone="success" checked></td-toggle>');
    await wait();
    expect(describedText(en)).to.equal('Verified');
  });

  it('status text is a sibling of the label (never part of the name), text only', async () => {
    const el = mount('<td-toggle id="t-n" label="2FA" tone="success" status-text="<img src=x onerror=alert(1)>" checked></td-toggle>');
    await wait();
    const s = el.querySelector('.td-switch__status');
    expect(s.parentElement === el).to.equal(true);
    expect(s.classList.contains('td-sr-only')).to.equal(true);
    expect(s.children.length).to.equal(0);
    expect(s.textContent).to.equal('<img src=x onerror=alert(1)>');
    expect([...input(el).labels].some((l) => l.contains(s))).to.equal(false);
  });

  it('describedby keeps the page ids and merges with the error', async () => {
    const el = mount('<td-toggle id="t-d" label="2FA" tone="success" checked></td-toggle><span id="page-note">Ghi chú</span>');
    await wait();
    input(el).setAttribute('aria-describedby', `page-note ${input(el).getAttribute('aria-describedby')}`);
    el.setError('Lỗi');
    await wait();
    const ids = input(el).getAttribute('aria-describedby').split(' ');
    expect(ids).to.include('page-note');
    expect(ids).to.include('t-d-status');
    expect(ids).to.include('t-d-error');
    el.checked = false;
    await wait();
    const off = input(el).getAttribute('aria-describedby').split(' ');
    expect(off).to.include('page-note');
    expect(off).to.not.include('t-d-status');
  });

  it('changing tone / status-text while the input has focus patches IN PLACE (same node, focus kept, DOM = render())', async () => {
    const el = mount('<td-toggle id="t-f" label="2FA" checked></td-toggle>');
    await wait();
    const i = input(el);
    i.focus();
    for (const step of [
      () => el.setAttribute('tone', 'warning'),
      () => el.setAttribute('status-text', 'Chờ quét QR'),
      () => el.setAttribute('tone', 'success'),
      () => el.removeAttribute('status-text'),
      () => el.removeAttribute('tone'),
      () => { el.tone = 'warning'; el.statusText = 'A'; },
    ]) {
      step();
      await wait();
      expect(input(el) === i).to.equal(true);
      expect(document.activeElement === i).to.equal(true);
      expect(live(el)).to.equal(rendered(el));
    }
    expect(onIcon(el).querySelector('svg')?.getAttribute('data-icon')).to.equal('clock');
    expect(describedText(el)).to.equal('A');
  });

  it('commit() with the tone set first: the warning track from the very first frame (never green)', async () => {
    const el = mount('<td-toggle id="t-cm" label="2FA" controlled></td-toggle>');
    await wait();
    let release;
    el.tone = 'warning';
    const p = el.commit(() => new Promise((r) => { release = r; }), true);
    // same task: checked + tone are in place before the browser paints — the only transition runs off → warning
    const colours = new Set();
    for (const a of track(el).getAnimations()) {
      for (const k of a.effect?.getKeyframes?.() || []) if (k.backgroundColor) colours.add(k.backgroundColor);
    }
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-color-warning'));
    expect([...colours].includes(tokenColor('--td-switch-on'))).to.equal(false);
    await frame();
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-color-warning'));
    release(false);
    expect(await p).to.equal(false);
    expect(el.checked).to.equal(false);
    await frame();
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-switch-off'));
  });

  it('dark theme scope: a light section inside a dark page re-resolves the tone colours', async () => {
    document.documentElement.setAttribute('data-td-theme', 'dark');
    const wrap = document.createElement('section');
    wrap.setAttribute('data-td-theme', 'light');
    wrap.innerHTML = '<td-toggle id="t-sc" label="2FA" tone="warning" checked></td-toggle>';
    document.body.appendChild(wrap);
    cleanup.push(() => wrap.remove());
    await wait();
    const el = wrap.querySelector('td-toggle');
    settle(el);
    expect(getComputedStyle(track(el)).backgroundColor).to.equal(tokenColor('--td-color-warning', wrap));
    expect(getComputedStyle(track(el)).backgroundColor).to.not.equal(tokenColor('--td-color-warning'));
  });
});
