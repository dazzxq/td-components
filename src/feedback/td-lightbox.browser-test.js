import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import { TdLightbox, defaultIsAllowedUrl } from './td-lightbox.js';
import { TdModal } from './td-modal.js';
import { isScrollLocked } from '../utils/scroll-lock.js';

// Load the kit stylesheet so layout-dependent behaviour (hidden parts, stage sizing) is real.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const IMG = (n) => `/test/fixtures/${n}.svg`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const overlay = () => document.querySelector('.td-lightbox');
const $ = (sel) => overlay().querySelector(sel);
const key = (k, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
/** Element assertions without chai inspecting DOM nodes (which can hang the runner). */
function same(a, b, msg = '') {
  const d = (x) => (x instanceof Element ? `<${x.tagName.toLowerCase()} class="${x.className}">` : String(x));
  expect(a === b, `${msg} expected ${d(b)} got ${d(a)}`).to.equal(true);
}
const events = [];
for (const n of ['td-lightbox-open', 'td-lightbox-change', 'td-lightbox-close']) {
  document.addEventListener(n, (e) => events.push({ n, d: e.detail }));
}

const host = document.createElement('div');
document.body.appendChild(host);

afterEach(async () => {
  TdLightbox.close();
  TdModal.closeAll();
  host.innerHTML = '';
  events.length = 0;
  await wait(20);
});

describe('td-lightbox — import & open/close', () => {
  it('has no side effects on import (no overlay until open)', () => {
    // This suite imports the module at top level; the first test runs before any open().
    same(document.querySelector('.td-lightbox'), null);
  });

  it('returns null and mounts nothing when no item is viewable', () => {
    expect(TdLightbox.open([{ src: 'javascript:alert(1)' }, { src: 'data:image/png;base64,AAAA' }])).to.equal(null);
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('opens a dialog, restores focus and is idempotent on close', async () => {
    const opener = document.createElement('button');
    host.appendChild(opener);
    opener.focus();
    const lb = TdLightbox.open([IMG(1), IMG(2)], { index: 1 });
    await frames();
    expect(overlay().getAttribute('role')).to.equal('dialog');
    expect(overlay().getAttribute('aria-modal')).to.equal('true');
    expect(overlay().getAttribute('aria-label')).to.equal('Trình xem ảnh');
    expect(overlay().getAttribute('data-state')).to.equal('open');
    expect(lb.index).to.equal(1);
    expect($('.td-lightbox__counter').textContent).to.equal('2 / 2');
    lb.close();
    lb.close();
    TdLightbox.close();
    expect(TdLightbox.isOpen).to.equal(false);
    same(document.activeElement, opener);
    expect(events.filter((e) => e.n === 'td-lightbox-close').length).to.equal(1);
  });

  it('hides prev/next/counter for a single item', () => {
    TdLightbox.open([IMG(1)]);
    expect($('[data-action="prev"]').hidden).to.equal(true);
    expect($('[data-action="next"]').hidden).to.equal(true);
    expect($('.td-lightbox__counter').hidden).to.equal(true);
  });
});

describe('td-lightbox — background inert + scroll lock', () => {
  it('restores only the inert it set (pre-existing inert survives)', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    b.setAttribute('inert', '');
    document.body.append(a, b);
    TdLightbox.open([IMG(1)]);
    expect(a.hasAttribute('inert')).to.equal(true);
    TdLightbox.close();
    expect(a.hasAttribute('inert')).to.equal(false);
    expect(b.hasAttribute('inert')).to.equal(true);
    a.remove(); b.remove();
  });

  it('shares the scroll lease with the modal stack', () => {
    TdLightbox.open([IMG(1)]);
    const id = TdModal.show({ title: 'x' });
    TdLightbox.close();
    expect(isScrollLocked()).to.equal(true); // modal still holds its lease
    TdModal.closeById(id);
    expect(isScrollLocked()).to.equal(false);
  });
});

describe('td-lightbox — keyboard', () => {
  it('arrows navigate with wrap, Esc closes', () => {
    const lb = TdLightbox.open([IMG(1), IMG(2), IMG(3)]);
    key('ArrowLeft');
    expect(lb.index).to.equal(2);
    key('ArrowRight');
    expect(lb.index).to.equal(0);
    key('Escape');
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('defers every key while a foreign layer (td-modal) is open', () => {
    const lb = TdLightbox.open([IMG(1), IMG(2)]);
    TdModal.show({ title: 'on top' });
    key('ArrowRight');
    key('Escape');
    expect(lb.isOpen).to.equal(true);
    expect(lb.index).to.equal(0);
  });

  it('Tab stays inside the dialog even when focus is in the video mount', async () => {
    TdLightbox.open([{ type: 'video', src: '/test/fixtures/clip.mp4', poster: IMG(4) }]);
    await frames();
    const video = $('.td-lightbox__video video');
    expect(!!video).to.equal(true);
    video.focus();
    // The video is the FIRST focusable (back button hidden) → Shift+Tab must wrap to the last control.
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    video.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    same(document.activeElement, $('.td-lightbox__close'));
    expect(overlay().contains(document.activeElement)).to.equal(true);
    // Media keys are left to the player.
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    video.dispatchEvent(esc);
    expect(TdLightbox.isOpen).to.equal(true);
  });
});

describe('td-lightbox — security', () => {
  it('drops unsafe URLs and keeps the rest (index follows the filtered list)', () => {
    const lb = TdLightbox.open([{ src: 'javascript:alert(1)' }, IMG(1), { src: 'vbscript:x' }, IMG(2)], { index: 1 });
    expect(lb.count).to.equal(2);
    expect(lb.index).to.equal(1);
  });

  it('renders caption and labels as text, never HTML', () => {
    TdLightbox.open([{ src: IMG(1), caption: '<img src=x onerror=alert(1)>' }], {
      labels: { close: '<b>x</b>' }, panel: true,
    });
    expect($('.td-lightbox__caption').textContent).to.equal('<img src=x onerror=alert(1)>');
    same(overlay().querySelector('.td-lightbox__caption img'), null);
    expect($('.td-lightbox__panel-caption').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect($('.td-lightbox__close').getAttribute('aria-label')).to.equal('<b>x</b>');
    same($('.td-lightbox__close b'), null);
  });

  it('default URL policy: https always, http only on an http page, no other schemes', () => {
    expect(defaultIsAllowedUrl('https://cdn.example/a.jpg')).to.equal(true);
    // The test page is served over http:// → same-scheme http is allowed here, never an upgrade path.
    expect(defaultIsAllowedUrl('http://cdn.example/a.jpg')).to.equal(location.protocol === 'http:');
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AA', 'blob:https://x/1', 'file:///etc/passwd', 'vbscript:x', '']) {
      expect(defaultIsAllowedUrl(bad), bad).to.equal(false);
    }
  });

  it('custom isAllowedUrl is honoured (fail-closed when it throws)', () => {
    expect(TdLightbox.open([IMG(1)], { isAllowedUrl: () => { throw new Error('x'); } })).to.equal(null);
    const lb = TdLightbox.open([IMG(1), 'https://evil.example/a.jpg'], {
      isAllowedUrl: (u) => new URL(u, location.href).origin === location.origin,
    });
    expect(lb.count).to.equal(1);
  });
});

describe('td-lightbox — download hook', () => {
  it('same-origin image → download link by default; hook null hides it', () => {
    TdLightbox.open([IMG(1)]);
    const dl = $('[data-action="download"]');
    expect(dl.hidden).to.equal(false);
    expect(dl.getAttribute('download')).to.equal('1.svg');
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { download: () => null });
    expect($('[data-action="download"]').hidden).to.equal(true);
  });

  it('hook URL passes through isAllowedUrl', () => {
    TdLightbox.open([IMG(1)], { download: () => 'javascript:alert(1)' });
    expect($('[data-action="download"]').hidden).to.equal(true);
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { download: (item) => `/dl?src=${encodeURIComponent(item.src)}` });
    expect($('[data-action="download"]').getAttribute('href')).to.contain('/dl?src=');
  });
});

describe('td-lightbox — toolbar + panel hooks', () => {
  it('adds custom buttons safely (odd ids), passes ctx + button, honours visible()', () => {
    const calls = [];
    const lb = TdLightbox.open([{ src: IMG(1), data: { id: 'a' } }, { src: IMG(2), data: { id: 'b' } }], {
      toolbar: [{
        id: 'star"]; [x',
        label: 'Đặt ảnh bìa',
        icon: 'star',
        onClick: (ctx, btn) => calls.push([ctx.item.data.id, btn.tagName]),
        visible: (ctx) => ctx.index === 0,
      }],
    });
    const btn = overlay().querySelector('.td-lightbox__toolbar [aria-label="Đặt ảnh bìa"]');
    expect(!!btn).to.equal(true);
    expect(btn.querySelector('svg[data-icon="star"]') !== null).to.equal(true);
    same(btn.nextElementSibling, $('.td-lightbox__close')); // close stays last
    btn.click();
    expect(calls).to.deep.equal([['a', 'BUTTON']]);
    lb.next();
    expect(btn.hidden).to.equal(true);
  });

  it('toolbar buttons from a previous open do not leak into the next', () => {
    TdLightbox.open([IMG(1)], { toolbar: [{ id: 'x', label: 'X', onClick() {} }] });
    TdLightbox.close();
    TdLightbox.open([IMG(1)]);
    expect(overlay().querySelectorAll('[data-extra]').length).to.equal(0);
  });

  it('panel renderer returning null or throwing keeps the plain layout', () => {
    TdLightbox.open([IMG(1)], { panel: () => null });
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
    expect($('.td-lightbox__panel').hidden).to.equal(true);
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { panel: () => { throw new Error('boom'); } });
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { panel: () => '<b>string</b>' });
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
  });

  it('panel renderer element enables panel mode + back button', () => {
    TdLightbox.open([IMG(1)], { panel: (ctx) => { const p = document.createElement('p'); p.textContent = `#${ctx.index}`; return p; } });
    expect(overlay().hasAttribute('data-panel')).to.equal(true);
    expect($('.td-lightbox__panel-body').textContent).to.equal('#0');
    expect($('.td-lightbox__back').hidden).to.equal(false);
  });

  it('back button is a solid control (alpha 1, element opacity 1) with glass on and off (v0.20.0)', () => {
    const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[ ,/]+/).filter(Boolean) : []; return p.length > 3 ? Number(p[3]) : 1; };
    TdLightbox.open([IMG(1)], { panel: () => document.createElement('p') });
    const back = $('.td-lightbox__back');
    for (const off of [false, true]) {
      if (off) document.documentElement.setAttribute('data-td-glass', 'off');
      const cs = getComputedStyle(back);
      expect(alpha(cs.backgroundColor), `bg ${cs.backgroundColor} glass-off=${off}`).to.equal(1);
      expect(cs.opacity).to.equal('1');
    }
    document.documentElement.removeAttribute('data-td-glass');
  });
});

describe('td-lightbox — video hook', () => {
  it('aborts on navigate and destroys a late resolution', async () => {
    let signal;
    let destroyed = 0;
    let resolveLate;
    const lb = TdLightbox.open([{ type: 'video', src: '/v.mp4', poster: IMG(4) }, IMG(1)], {
      video: (item, mount, ctx) => { signal = ctx.signal; return new Promise((r) => { resolveLate = r; }); },
    });
    lb.next();
    expect(signal.aborted).to.equal(true);
    resolveLate({ destroy() { destroyed += 1; } });
    await wait(0);
    expect(destroyed).to.equal(1);
  });

  it('rejected init falls back to the poster image', async () => {
    TdLightbox.open([{ type: 'video', src: '/v.mp4', poster: IMG(4) }], { video: () => Promise.reject(new Error('no player')) });
    await wait(50);
    expect($('.td-lightbox__video').hidden).to.equal(true);
    expect($('.td-lightbox__img').hidden).to.equal(false);
    expect($('.td-lightbox__img').getAttribute('src')).to.contain('4.svg');
  });

  it('a throwing destroy() does not block close', () => {
    TdLightbox.open([{ type: 'video', src: '/v.mp4' }], { video: () => ({ destroy() { throw new Error('x'); } }) });
    TdLightbox.close();
    expect(TdLightbox.isOpen).to.equal(false);
  });
});

describe('td-lightbox — history', () => {
  function fakeAdapter({ pushResult } = {}) {
    const log = [];
    let cb = null;
    return {
      log,
      pop: () => cb && cb(),
      get subscribed() { return !!cb; },
      push() { log.push('push'); return pushResult ? pushResult() : undefined; },
      back() { log.push('back'); setTimeout(() => cb && cb(), 0); },
      onPop(fn) { cb = fn; log.push('sub'); return () => { cb = null; log.push('unsub'); }; },
    };
  }

  it('history:true — open pushes, Back closes, close pops', async () => {
    const len = history.length;
    const lb = TdLightbox.open([IMG(1)], { history: true });
    expect(history.length).to.equal(len + 1);
    expect(history.state.tdLightbox).to.equal(lb.token);
    history.back();
    await wait(80);
    expect(TdLightbox.isOpen).to.equal(false);
    const lb2 = TdLightbox.open([IMG(1)], { history: true });
    TdLightbox.close();
    await wait(80);
    expect(history.state && history.state.tdLightbox).to.not.equal(lb2.token);
  });

  it('adapter: user pop closes; programmatic close backs once and consumes its pop; unsubscribes', async () => {
    const a = fakeAdapter();
    TdLightbox.open([IMG(1)], { history: a });
    expect(a.log).to.deep.equal(['push', 'sub']);
    a.pop(); // user Back
    expect(TdLightbox.isOpen).to.equal(false);
    expect(a.log).to.deep.equal(['push', 'sub', 'unsub']);

    const b = fakeAdapter();
    TdLightbox.open([IMG(1)], { history: b });
    TdLightbox.close();
    expect(b.log).to.deep.equal(['push', 'sub', 'back']);
    TdLightbox.open([IMG(2)], { history: b }); // fast close → open while back pending → history-less
    await wait(20);
    expect(TdLightbox.isOpen).to.equal(true); // the consumed pop did not close the new viewer
    expect(b.log.filter((x) => x === 'push').length).to.equal(1);
    TdLightbox.close();
    expect(b.subscribed).to.equal(false);
  });

  it('history:true — close → immediate open: the new viewer survives the old pop', async () => {
    TdLightbox.open([IMG(1)], { history: true });
    TdLightbox.close(); // history.back() pending
    const lb2 = TdLightbox.open([IMG(2)], { history: true }); // history-less while the back is unsettled
    await wait(120);
    expect(lb2.isOpen).to.equal(true);
    lb2.close();
    await wait(50);
  });

  it('adapter back() throwing or rejecting un-counts it (next real pop still closes) and unsubscribes', async () => {
    for (const mode of ['throw', 'reject']) {
      let cb = null;
      const log = [];
      const a = {
        push() { log.push('push'); },
        back() { log.push('back'); if (mode === 'throw') throw new Error('x'); return Promise.reject(new Error('x')); },
        onPop(fn) { cb = fn; log.push('sub'); return () => { cb = null; log.push('unsub'); }; },
      };
      TdLightbox.open([IMG(1)], { history: a });
      TdLightbox.close();
      await wait(10);
      expect(log).to.deep.equal(['push', 'sub', 'back', 'unsub']);
      // A new session pushes again (nothing unsettled) and a real pop closes it (not swallowed).
      TdLightbox.open([IMG(2)], { history: a });
      expect(log.filter((x) => x === 'push').length).to.equal(2);
      cb();
      expect(TdLightbox.isOpen).to.equal(false);
    }
  });

  it('adapter push failure → no back on close', () => {
    const a = fakeAdapter({ pushResult: () => { throw new Error('denied'); } });
    TdLightbox.open([IMG(1)], { history: a });
    TdLightbox.close();
    expect(a.log).to.deep.equal(['push']);
  });

  it('close before async push fulfils → one unwinding back, pop consumed', async () => {
    let resolvePush;
    const a = fakeAdapter({ pushResult: () => new Promise((r) => { resolvePush = r; }) });
    TdLightbox.open([IMG(1)], { history: a });
    TdLightbox.close();
    expect(a.log).to.deep.equal(['push']);
    resolvePush();
    await wait(20);
    expect(a.log).to.deep.equal(['push', 'sub', 'back', 'unsub']);
  });

  it('close before async push rejects → no back', async () => {
    let rejectPush;
    const a = fakeAdapter({ pushResult: () => new Promise((_, j) => { rejectPush = j; }) });
    TdLightbox.open([IMG(1)], { history: a });
    TdLightbox.close();
    rejectPush(new Error('x'));
    await wait(20);
    expect(a.log).to.deep.equal(['push']);
  });

  it('close → open while the first push is pending: second viewer is history-less and survives the unwind', async () => {
    let resolvePush;
    const a = fakeAdapter({ pushResult: () => new Promise((r) => { resolvePush = r; }) });
    TdLightbox.open([IMG(1)], { history: a });
    TdLightbox.close();
    TdLightbox.open([IMG(2)], { history: a });
    resolvePush();
    await wait(20);
    expect(TdLightbox.isOpen).to.equal(true);
    expect(a.log.filter((x) => x === 'push').length).to.equal(1);
  });
});

describe('td-lightbox — bind() + markup contract', () => {
  async function mountContract() {
    const html = await (await fetch('/test/contracts/lightbox.html')).text();
    host.innerHTML = html;
  }

  it('opens the gallery at the clicked ELEMENT, skipping an invalid item before it', async () => {
    await mountContract();
    const unbind = TdLightbox.bind(host);
    const third = host.querySelectorAll('[data-td-lightbox-item]')[2];
    third.querySelector('img').click();
    expect(TdLightbox.isOpen).to.equal(true);
    const open = events.find((e) => e.n === 'td-lightbox-open');
    expect(open.d.count).to.equal(3); // invalid javascript: item dropped
    expect(open.d.index).to.equal(1);
    expect(open.d.item.caption).to.equal('Chú thích ba');
    same(open.d.item.data, third);
    TdLightbox.close();
    unbind();
    third.querySelector('img').click();
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('single trigger reads caption; clicking the invalid item opens nothing; modified clicks ignored', async () => {
    await mountContract();
    const unbind = TdLightbox.bind(host);
    const invalid = host.querySelectorAll('[data-td-lightbox-item]')[1];
    invalid.click();
    expect(TdLightbox.isOpen).to.equal(false);
    const single = host.querySelector('figure[data-td-lightbox] img');
    single.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(TdLightbox.isOpen).to.equal(false);
    single.click();
    expect(TdLightbox.isOpen).to.equal(true);
    expect($('.td-lightbox__caption').textContent).to.equal('Ảnh đơn');
    unbind();
  });
});

describe('td-lightbox — pointer gestures', () => {
  const pe = (type, x, y, extra = {}) => new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, ...extra,
  });

  it('horizontal swipe navigates; vertical swipe-down closes', async () => {
    const lb = TdLightbox.open([IMG(1), IMG(2)]);
    await frames();
    const stage = $('.td-lightbox__stage');
    stage.dispatchEvent(pe('pointerdown', 300, 300));
    stage.dispatchEvent(pe('pointermove', 200, 305));
    stage.dispatchEvent(pe('pointerup', 150, 305));
    expect(lb.index).to.equal(1);
    stage.dispatchEvent(pe('pointerdown', 300, 200));
    stage.dispatchEvent(pe('pointermove', 302, 260));
    expect(overlay().hasAttribute('data-dragging')).to.equal(true);
    stage.dispatchEvent(pe('pointerup', 302, 330));
    expect(overlay().hasAttribute('data-dragging')).to.equal(false);
    await wait(260);
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('mouse click on the image toggles zoom', async () => {
    TdLightbox.open([IMG(1)]);
    await wait(80);
    const img = $('.td-lightbox__img');
    const r = img.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    img.dispatchEvent(pe('pointerdown', x, y, { pointerType: 'mouse', button: 0 }));
    img.dispatchEvent(pe('pointerup', x, y, { pointerType: 'mouse', button: 0 }));
    expect(overlay().hasAttribute('data-zoomed')).to.equal(true);
    img.dispatchEvent(pe('pointerdown', x, y, { pointerType: 'mouse', button: 0 }));
    img.dispatchEvent(pe('pointerup', x, y, { pointerType: 'mouse', button: 0 }));
    expect(overlay().hasAttribute('data-zoomed')).to.equal(false);
  });

  it('backdrop click closes (default) and can be disabled', () => {
    TdLightbox.open([IMG(1)]);
    $('.td-lightbox__backdrop').click();
    expect(TdLightbox.isOpen).to.equal(false);
    TdLightbox.open([IMG(1)], { closeOnBackdrop: false });
    $('.td-lightbox__backdrop').click();
    expect(TdLightbox.isOpen).to.equal(true);
  });
});

describe('td-lightbox — review regressions', () => {
  const pe = (type, x, y, id = 9) => new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: true,
  });

  it('a pointer held across close/reopen does not act on the new session', async () => {
    TdLightbox.open([IMG(1), IMG(2)]);
    await frames();
    $('.td-lightbox__stage').dispatchEvent(pe('pointerdown', 300, 300));
    TdLightbox.close();
    const lb = TdLightbox.open([IMG(3), IMG(4)]);
    await frames();
    const stage = $('.td-lightbox__stage');
    stage.dispatchEvent(pe('pointermove', 150, 302));
    stage.dispatchEvent(pe('pointerup', 100, 302)); // would have been a swipe → navigate
    expect(lb.index).to.equal(0);
  });

  it('swipe-close timer and zoom animation never touch a reopened viewer', async () => {
    TdLightbox.open([IMG(1)]);
    await frames();
    const stage = $('.td-lightbox__stage');
    stage.dispatchEvent(pe('pointerdown', 300, 200, 11));
    stage.dispatchEvent(pe('pointermove', 302, 260, 11));
    stage.dispatchEvent(pe('pointerup', 302, 330, 11)); // swipe-down → close scheduled (190 ms)
    TdLightbox.close();
    const lb = TdLightbox.open([IMG(2)]);
    expect(overlay().hasAttribute('data-closing-down')).to.equal(false);
    await wait(260);
    expect(lb.isOpen).to.equal(true); // the old timer did not close the new viewer
    expect($('.td-lightbox__img').hasAttribute('data-zoom-anim')).to.equal(false);
  });

  it('a sheet swipe started before close is forgotten', async () => {
    TdLightbox.open([IMG(1)], { panel: true, index: 0 });
    const panel = $('.td-lightbox__panel');
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 500, pointerType: 'touch', pointerId: 12 }));
    TdLightbox.close();
    TdLightbox.open([{ src: IMG(2), caption: 'x' }], { panel: true });
    const p2 = $('.td-lightbox__panel');
    p2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 300, pointerType: 'touch', pointerId: 12 }));
    expect(p2.getAttribute('data-sheet')).to.equal(null);
  });

  it('clamps the initial index', () => {
    expect(TdLightbox.open([IMG(1), IMG(2)], { index: -5 }).index).to.equal(0);
    TdLightbox.close();
    expect(TdLightbox.open([IMG(1), IMG(2)], { index: 99 }).index).to.equal(1);
  });

  it('zoom animation is a CSS state (no inline transition), so reduced motion can disable it', async () => {
    TdLightbox.open([IMG(1)]);
    await wait(80);
    const img = $('.td-lightbox__img');
    const r = img.getBoundingClientRect();
    const m = (t) => new PointerEvent(t, { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 3, pointerType: 'mouse', button: 0 });
    img.dispatchEvent(m('pointerdown'));
    img.dispatchEvent(m('pointerup'));
    expect(img.hasAttribute('data-zoom-anim')).to.equal(true);
    expect(img.style.transition).to.equal('');
  });

  it('drops items without an allowed src (poster-only video) and keeps an explicit empty alt', async () => {
    expect(TdLightbox.open([{ type: 'video', poster: IMG(4) }])).to.equal(null);
    TdLightbox.open([{ src: IMG(1), alt: '', caption: 'Chú thích' }]);
    await wait(80);
    expect($('.td-lightbox__img').getAttribute('alt')).to.equal('');
  });
});

describe('td-lightbox — events + handles', () => {
  it('emits open/change/close with a session token; stale handles are inert', () => {
    const first = TdLightbox.open([IMG(1), IMG(2)]);
    const second = TdLightbox.open([IMG(3), IMG(4)]); // re-entrant open replaces the gallery
    expect(second.token).to.not.equal(first.token);
    first.next();
    expect(second.index).to.equal(0);
    second.next();
    const change = events.filter((e) => e.n === 'td-lightbox-change').pop();
    expect(change.d.token).to.equal(second.token);
    expect(change.d.index).to.equal(1);
    second.close();
    const close = events.find((e) => e.n === 'td-lightbox-close');
    expect(close.d.token).to.equal(second.token);
  });
});

describe('td-lightbox — focus on open', () => {
  it('moves focus into the dialog once it is shown', async () => {
    const opener = document.createElement('button');
    host.appendChild(opener);
    opener.focus();
    TdLightbox.open([IMG(1)]);
    await frames();
    await frames();
    expect(overlay().contains(document.activeElement)).to.equal(true);
  });
});

describe('td-lightbox — v0.15.0 dwp parity', () => {
  const pnode = (t) => { const p = document.createElement('p'); p.className = 'pp'; p.textContent = t; return p; };
  const touch = (el, type, y) => {
    const t = new Touch({ identifier: 1, target: el, clientX: 10, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
  };
  const swipe = (el, from, to) => { touch(el, 'touchstart', from); touch(el, 'touchend', to); };

  it('L1: setPanel switches false ↔ renderer ↔ caption while open; refreshPanel re-renders; strings ignored', () => {
    let n = 0;
    const lb = TdLightbox.open([{ src: IMG(1), caption: 'Chú thích' }]);
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
    lb.setPanel(() => pnode(`r${++n}`));
    expect(overlay().hasAttribute('data-panel')).to.equal(true);
    expect($('.td-lightbox__panel-body').textContent).to.equal('r1');
    expect($('.td-lightbox__back').hidden).to.equal(false);
    lb.refreshPanel();
    expect($('.td-lightbox__panel-body').textContent).to.equal('r2');
    lb.setPanel(true);
    expect($('.td-lightbox__panel-body').textContent).to.equal('Chú thích');
    lb.setPanel(() => '<b>x</b>');
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
    lb.setPanel(false);
    expect($('.td-lightbox__panel').hidden).to.equal(true);
    expect($('.td-lightbox__back').hidden).to.equal(true);
  });

  it('L1: a dead handle is a no-op', () => {
    const a = TdLightbox.open([IMG(1)]);
    TdLightbox.close();
    TdLightbox.open([IMG(2)]);
    a.setPanel(() => pnode('stale'));
    a.refreshPanel();
    expect(a.addToolbarButton({ id: 'z', label: 'Z', onClick() {} })).to.be.a('function');
    expect(overlay().hasAttribute('data-panel')).to.equal(false);
    expect(overlay().querySelectorAll('[data-extra]').length).to.equal(0);
  });

  it('L1+L4 (mobile): sheet swipes open/close with touch; panel off → sheet closed, grab aria-expanded=false', async () => {
    await setViewport({ width: 600, height: 800 });
    try {
      const lb = TdLightbox.open([IMG(1)], { panel: () => pnode('info') });
      const panel = $('.td-lightbox__panel');
      const grab = $('.td-lightbox__grab');
      swipe(panel, 400, 360);
      expect(panel.getAttribute('data-sheet')).to.equal('open');
      expect(grab.getAttribute('aria-expanded')).to.equal('true');
      swipe(panel, 360, 400);
      expect(panel.hasAttribute('data-sheet')).to.equal(false);
      swipe(panel, 400, 360); // open again, then a swipe starts…
      touch(panel, 'touchstart', 300);
      lb.setPanel(false); // …and the panel goes away mid-swipe
      expect(panel.hasAttribute('data-sheet')).to.equal(false);
      expect(grab.getAttribute('aria-expanded')).to.equal('false');
      lb.setPanel(() => pnode('back'));
      expect(panel.hasAttribute('data-sheet'), 're-enabled panel starts closed').to.equal(false);
      touch(panel, 'touchend', 200); // the dropped swipe must not open it
      expect(panel.hasAttribute('data-sheet')).to.equal(false);
    } finally {
      await setViewport({ width: 800, height: 600 });
    }
  });

  it('L4: a swipe down on a scrolled panel does not close the sheet', async () => {
    await setViewport({ width: 600, height: 800 });
    try {
      TdLightbox.open([IMG(1)], { panel: () => { const d = pnode(''); d.textContent = 'dòng chữ dài '.repeat(1500); return d; } });
      const panel = $('.td-lightbox__panel');
      swipe(panel, 400, 360);
      expect(panel.getAttribute('data-sheet')).to.equal('open');
      await frames();
      panel.scrollTop = 50;
      expect(panel.scrollTop > 0, 'panel scrolls').to.equal(true);
      swipe(panel, 300, 360);
      expect(panel.getAttribute('data-sheet'), 'scrolled: swipe down scrolls, sheet stays').to.equal('open');
    } finally {
      await setViewport({ width: 800, height: 600 });
    }
  });

  it('L2: itemEl / groupEl in ctx (panel, toolbar) and in all three events; open({ groupEl })', () => {
    host.innerHTML = `<div data-td-lightbox-group id="g"><a data-td-lightbox-item id="i1" href="${IMG(1)}"><img src="${IMG(1)}" alt="1"></a>
      <a data-td-lightbox-item id="i2" href="${IMG(2)}"><img src="${IMG(2)}" alt="2"></a></div>`;
    const seen = [];
    const un = TdLightbox.bind(host, {
      panel: (ctx) => { seen.push(['panel', ctx.itemEl && ctx.itemEl.id, ctx.groupEl && ctx.groupEl.id]); return null; },
      toolbar: [{ id: 't', label: 'T', onClick: (ctx) => seen.push(['tool', ctx.itemEl.id, ctx.groupEl.id]) }],
    });
    try {
      document.getElementById('i2').click();
      overlay().querySelector('[data-extra="t"]').click();
      TdLightbox.close();
    } finally { un(); }
    expect(seen).to.deep.equal([['panel', 'i2', 'g'], ['tool', 'i2', 'g']]);
    const names = events.map((e) => `${e.n}:${e.d.itemEl && e.d.itemEl.id}:${e.d.groupEl && e.d.groupEl.id}`);
    expect(names).to.include('td-lightbox-open:i2:g');
    expect(names).to.include('td-lightbox-close:i2:g');
    events.length = 0;
    const g = document.getElementById('g');
    const lb = TdLightbox.open([IMG(1), IMG(2)], { groupEl: g });
    lb.next();
    expect(events.length).to.equal(3); // change (first show) + open + change (next)
    expect(events.every((e) => e.d.groupEl === g)).to.equal(true);
    TdLightbox.close();
    TdLightbox.open([IMG(1)], { groupEl: '#g' });
    expect(events.at(-1).d.groupEl).to.equal(null);
  });

  it('L3: attrPrefix "dwp" reads data-dwp-lightbox-* markup; a bad prefix warns and falls back to td', () => {
    host.innerHTML = `<div data-dwp-lightbox-group><span data-dwp-lightbox-item data-dwp-lightbox-src="${IMG(3)}" data-dwp-lightbox-caption="Dwp">x</span></div>
      <span id="tdone" data-td-lightbox="${IMG(1)}">td</span>`;
    const un = TdLightbox.bind(host, { attrPrefix: 'dwp' });
    host.querySelector('[data-dwp-lightbox-item]').click();
    expect(TdLightbox.isOpen).to.equal(true);
    expect($('.td-lightbox__caption').textContent).to.equal('Dwp');
    TdLightbox.close();
    document.getElementById('tdone').click();
    expect(TdLightbox.isOpen, 'td markup is not read with the dwp prefix').to.equal(false);
    un();
    const warns = [];
    const w = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    let un2;
    try { un2 = TdLightbox.bind(host, { attrPrefix: 'x] , *' }); } finally { console.warn = w; }
    expect(warns.some((m) => m.includes('attrPrefix'))).to.equal(true);
    document.getElementById('tdone').click();
    expect(TdLightbox.isOpen).to.equal(true);
    un2();
  });

  it('L3: filter false leaves the click alone (no preventDefault); a throwing filter never opens', () => {
    host.innerHTML = `<a id="f1" href="#keep" data-td-lightbox="${IMG(1)}">a</a>`;
    const a = document.getElementById('f1');
    let prevented = null;
    const probe = (e) => { prevented = e.defaultPrevented; e.preventDefault(); };
    const un = TdLightbox.bind(host, { filter: (el) => el.id !== 'f1' });
    document.addEventListener('click', probe);
    try {
      a.click();
      expect(TdLightbox.isOpen).to.equal(false);
      expect(prevented).to.equal(false);
    } finally { un(); }
    const w = console.warn;
    console.warn = () => {};
    const un2 = TdLightbox.bind(host, { filter: () => { throw new Error('x'); } });
    try { a.click(); } finally { un2(); console.warn = w; document.removeEventListener('click', probe); }
    expect(TdLightbox.isOpen).to.equal(false);
  });

  it('L5: addToolbarButton while open (before close; same id replaces; remove()); removeToolbarButton', () => {
    const lb = TdLightbox.open([IMG(1), IMG(2)]);
    const r1 = lb.addToolbarButton({ id: 'info', label: 'Thông tin', icon: 'info', onClick() {}, visible: (c) => c.index === 1 });
    let b = overlay().querySelector('[data-extra="info"]');
    same(b.nextElementSibling, $('.td-lightbox__close'));
    expect(b.hidden, 'visible() applied at once').to.equal(true);
    lb.next();
    expect(b.hidden).to.equal(false);
    const r2 = lb.addToolbarButton({ id: 'info', label: 'Thông tin 2', onClick() {} });
    expect(overlay().querySelectorAll('[data-extra="info"]').length).to.equal(1);
    b = overlay().querySelector('[data-extra="info"]');
    expect(b.getAttribute('aria-label')).to.equal('Thông tin 2');
    r1(); // stale remover must not drop the replacement
    expect(overlay().querySelectorAll('[data-extra="info"]').length).to.equal(1);
    r2();
    expect(overlay().querySelectorAll('[data-extra="info"]').length).to.equal(0);
    lb.addToolbarButton({ id: 'x', label: 'X', onClick() {} });
    lb.removeToolbarButton('x');
    expect(overlay().querySelectorAll('[data-extra]').length).to.equal(0);
    expect(lb.addToolbarButton({ id: 'bad' })).to.be.a('function'); // invalid spec → no button
    expect(overlay().querySelectorAll('[data-extra]').length).to.equal(0);
  });

  it('L6: trigger cursors for td and dwp prefixes', () => {
    host.innerHTML = `<span id="c1" data-td-lightbox="${IMG(1)}">a</span><span id="c2" data-dwp-lightbox-item>b</span>
      <span id="c3" data-td-lightbox-item data-td-lightbox-type="video">c</span><span id="c4" data-dwp-lightbox data-dwp-lightbox-type="video">d</span>
      <div data-td-lightbox-group><span id="c5" data-td-lightbox-item>e</span><span id="c6" data-td-lightbox-item data-td-lightbox-type="video">f</span></div>
      <span id="c7" data-td-lightbox="${IMG(2)}" data-td-lightbox-type="video">g</span>
      <div data-dwp-lightbox-group><span id="c8" data-dwp-lightbox-item data-dwp-lightbox-type="video">h</span></div>`;
    const cur = (id) => getComputedStyle(document.getElementById(id)).cursor;
    // grouped + single video triggers too (a later/more specific legacy rule used to force zoom-in on td triggers)
    expect(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].map(cur)).to.deep.equal(
      ['zoom-in', 'zoom-in', 'pointer', 'pointer', 'zoom-in', 'pointer', 'pointer', 'pointer']);
  });
});
