import { expect } from '@esm-bundle/chai';
import { TdModal } from './td-modal.js';
import '../form/td-input-field.js';

// v0.57.1 (dsuite) — td-modal initial focus honours `[autofocus]` in the body / footer: focusTarget → the first usable
// [autofocus] → the old order (first body field → first focusable other than the X → the X → the dialog). Chromium /
// Firefox / WebKit. DOM nodes are compared as booleans: a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function until(fn, ms = 3000, what = 'condition') {
  const end = performance.now() + ms;
  while (!fn()) {
    if (performance.now() > end) throw new Error(`timeout waiting for ${what}`);
    await frame();
  }
}

/** Open a modal; resolves once onShow ran (= after the initial focus was chosen). */
async function open(opts) {
  let shown = false;
  const id = TdModal.show({ title: 'Sửa', onShow: () => { shown = true; }, ...opts });
  const root = document.getElementById(id);
  await until(() => shown, 3000, 'onShow');
  await frame();
  return root;
}
const active = () => document.activeElement;
const describeActive = () => {
  const a = active();
  return a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${a.className ? `.${String(a.className).split(' ')[0]}` : ''}` : 'null';
};

// a table whose first cell holds a switch: the first input of the body — the trap the recipe in modal.md describes
const TABLE = '<table><tbody><tr><td><input type="checkbox" role="switch" id="sw" aria-label="Bật"></td><td>Dòng 1</td></tr></tbody></table>';

afterEach(async () => {
  const roots = [...document.querySelectorAll('body > .td-modal')];
  TdModal.closeAll();
  await until(() => roots.every((r) => !r.isConnected), 3000, 'modals removed');
});

describe('v0.57.1 td-modal — [autofocus] wins the initial focus', () => {
  it('a field with autofocus AFTER a table with a switch is focused (not the switch)', async () => {
    const root = await open({ body: `${TABLE}<label for="nm">Tên</label><input id="nm" autofocus>` });
    expect(active() === root.querySelector('#nm'), describeActive()).to.equal(true);
  });

  it('autofocus on a visible element focusable only by script (tabindex="-1") is honoured (Codex impl r1)', async () => {
    const root = await open({ body: `${TABLE}<div id="sum" tabindex="-1" autofocus>Tóm tắt</div>` });
    expect(active() === root.querySelector('#sum'), describeActive()).to.equal(true);
  });

  it('a hidden tabindex="-1" autofocus is skipped (old order)', async () => {
    const root = await open({ body: `${TABLE}<div hidden><div id="sum" tabindex="-1" autofocus>x</div></div>` });
    expect(active() === root.querySelector('#sw'), describeActive()).to.equal(true);
  });

  it('autofocus on a body button', async () => {
    const root = await open({ body: `${TABLE}<button type="button" id="go" autofocus>Đi</button>` });
    expect(active() === root.querySelector('#go'), describeActive()).to.equal(true);
  });

  it('autofocus on a footer button (footer option)', async () => {
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.id = 'ok';
    ok.textContent = 'Lưu';
    ok.autofocus = true; // the property counts (it reflects the attribute)
    const root = await open({ body: `${TABLE}<input id="nm" aria-label="Tên">`, footer: ok });
    expect(active() === root.querySelector('#ok'), describeActive()).to.equal(true);
  });

  it('a disabled / hidden / display:none / [hidden]-ancestor autofocus is skipped for the next usable one', async () => {
    const root = await open({
      body: `${TABLE}<input id="d" autofocus disabled aria-label="d"><input id="h" autofocus hidden aria-label="h">`
        + '<div hidden><input id="ha" autofocus aria-label="ha"></div>'
        + '<fieldset disabled><input id="fd" autofocus aria-label="fd"></fieldset>'
        + '<input id="last" autofocus aria-label="last">',
    });
    expect(active() === root.querySelector('#last'), describeActive()).to.equal(true);
  });

  it('only unusable autofocus elements → the old order (the first field = the switch)', async () => {
    const root = await open({ body: `${TABLE}<input id="d" autofocus disabled aria-label="d"><input id="nm" aria-label="Tên">` });
    expect(active() === root.querySelector('#sw'), describeActive()).to.equal(true);
  });

  it('no autofocus → unchanged: the first body field (the switch)', async () => {
    const root = await open({ body: `${TABLE}<input id="nm" aria-label="Tên">` });
    expect(active() === root.querySelector('#sw'), describeActive()).to.equal(true);
  });

  it('focusTarget still wins over autofocus', async () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `${TABLE}<input id="nm" autofocus aria-label="Tên"><input id="t" aria-label="T">`;
    const target = wrap.querySelector('#t');
    const root = await open({ body: wrap, focusTarget: target });
    expect(active() === root.querySelector('#t'), describeActive()).to.equal(true);
  });

  it('autoFocus: false → the dialog itself, autofocus ignored', async () => {
    const root = await open({ body: `${TABLE}<input id="nm" autofocus aria-label="Tên">`, autoFocus: false });
    expect(active() === root.querySelector('.td-modal__dialog'), describeActive()).to.equal(true);
  });

  it('a td-input-field host with autofocus → its control', async () => {
    const root = await open({ body: `${TABLE}<td-input-field id="f" label="Tên" autofocus></td-input-field>` });
    const control = root.querySelector('#f .td-field__control');
    expect(control !== null && active() === control, describeActive()).to.equal(true);
  });

  it('a disabled td-input-field host with autofocus is skipped', async () => {
    const root = await open({
      body: `${TABLE}<td-input-field label="A" autofocus disabled></td-input-field><input id="nm" autofocus aria-label="Tên">`,
    });
    expect(active() === root.querySelector('#nm'), describeActive()).to.equal(true);
  });

  it('confirm() keeps the Cancel button', async () => {
    TdModal.confirm({ title: 'Xoá?', message: 'Chắc chứ?' });
    await until(() => document.querySelector('body > .td-modal[data-state="open"]'), 3000, 'open');
    await frame();
    await frame();
    const root = document.querySelector('body > .td-modal');
    const btns = [...root.querySelectorAll('.td-modal__footer button')];
    expect(btns.length > 0 && active() === btns[0], describeActive()).to.equal(true);
  });
});
