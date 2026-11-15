import { expect } from '@esm-bundle/chai';
import { emulateMedia } from '@web/test-runner-commands';

// v0.116.0 (ADR 0045, plan v0.116.0-td-embed "Tests", cases 1–15): the BUILT bundle dist/embed/td-embed.js on a hostile
// page, in Chromium, Firefox and WebKit. An engine without scoped custom element registries (embed floor: Chrome/Edge
// 146, Safari 26.4, Firefox 159) must make mount throw TdEmbedError('unsupported') with the host untouched — asserted,
// never skipped. Which engines support it is asserted from the user agent, so a supported engine can never pass as
// "unsupported".

// --- the hostile page (before the bundle loads) -------------------------------------------------------------------
const HOSTILE = `
html { font-size: 10px; direction: rtl; color-scheme: dark; }
* { font: 20px serif !important; color: red !important; box-sizing: content-box !important; }
button, input, select, textarea { all: revert !important; border: 3px solid lime !important; }
:root, .hostile { --td-accent: rgb(255, 0, 255); --td-space-md: 50px; --_td-btn-bg: rgb(0, 255, 0); --td-btn-bg-v: rgb(0, 255, 0); --_td-field-h: 99px; }
.rem20 { --td-embed-rem: 20px; }
.box { width: 600px; }
`;
const style = document.createElement('style');
style.textContent = HOSTILE;
document.head.append(style);
class PageFakeButton extends HTMLElement {}
customElements.define('td-button', PageFakeButton);

const EMBED = '/dist/embed/td-embed.js';
const { mountTdEmbed, TdEmbedError, TD_EMBED_BUILD } = await import(EMBED);

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Does this engine reach the embed floor (from the user agent)? */
function expectedSupport() {
  const ua = navigator.userAgent;
  const ff = /Firefox\/(\d+)/.exec(ua);
  if (ff) return Number(ff[1]) >= 159;
  const chrome = /Chrom(?:e|ium)\/(\d+)/.exec(ua);
  if (chrome) return Number(chrome[1]) >= 146;
  const safari = /Version\/(\d+)\.(\d+)/.exec(ua);
  // The floor is Safari's (Apple platforms). Playwright's Linux WebKit (CI) is a GTK/WPE build with its own feature
  // flags and a spoofed Mac user agent, so the real OS comes from navigator.platform: no expectation off Apple, the
  // suite runs whichever path the engine takes (supported or 'unsupported').
  if (safari && !/^(Mac|iPhone|iPad)/.test(navigator.platform || '')) return null;
  if (safari) return Number(safari[1]) > 26 || (Number(safari[1]) === 26 && Number(safari[2]) >= 4);
  return false;
}
/** Feature probe independent of the kit. */
function hasScopedRegistry() {
  try {
    const reg = new CustomElementRegistry();
    const d = document.createElement('div');
    return d.attachShadow({ mode: 'open', customElementRegistry: reg }).customElementRegistry === reg;
  } catch { return false; }
}
const SUPPORTED = hasScopedRegistry();

const hosts = [];
function newHost(cls = 'hostile') {
  const box = document.createElement('div');
  box.className = 'box';
  const host = document.createElement('div');
  host.className = cls;
  box.append(host);
  document.body.append(box);
  hosts.push(box);
  return host;
}
afterEach(() => { hosts.splice(0).forEach((b) => b.remove()); });

describe('td embed: engine support (v0.116.0)', () => {
  it('the bundle loads in every engine and exports the API', () => {
    expect(mountTdEmbed).to.be.a('function');
    expect(new TdEmbedError('bad-host', 'x')).to.be.instanceOf(Error);
    expect(TD_EMBED_BUILD).to.match(/^\d+\.\d+\.\d+\+[0-9a-f]{10}$/);
  });

  it(`scoped registry support matches the embed floor for this engine (${navigator.userAgent.match(/(Firefox|Chrome|Version)\/[\d.]+/)?.[0]})`, () => {
    const want = expectedSupport();
    if (want === null) return; // non-Apple WebKit: no floor to check
    expect(SUPPORTED, `scoped registry support (expected ${want})`).to.equal(want);
  });

  it('no global definition: the page fake td-button stays; td-input-field / td-alert are not defined globally', () => {
    expect(customElements.get('td-button')).to.equal(PageFakeButton);
    expect(customElements.get('td-input-field')).to.equal(undefined);
    expect(customElements.get('td-alert')).to.equal(undefined);
  });
});

if (!SUPPORTED) {
  describe('td embed: engine without scoped registries', () => {
    it("mount throws TdEmbedError('unsupported') and leaves the host untouched", () => {
      const host = newHost();
      let err;
      try { mountTdEmbed(host); } catch (e) { err = e; }
      expect(err).to.be.instanceOf(TdEmbedError);
      expect(err.code).to.equal('unsupported');
      expect(host.shadowRoot).to.equal(null);
      expect(host.childNodes.length).to.equal(0);
      expect(host.attributes.length).to.equal(1); // class only
      // still validated first: a bad theme / host is reported as such, not as unsupported
      expect(() => mountTdEmbed(host, { theme: 'sepia' })).to.throw(TdEmbedError).with.property('code', 'bad-theme');
      expect(() => mountTdEmbed(document.createElement('input'))).to.throw(TdEmbedError).with.property('code', 'bad-host');
    });
  });
} else {
  const MARKUP = `
    <td-button variant="primary" label="Lưu"></td-button>
    <td-button label="Huỷ"></td-button>
    <td-input-field label="Tên" name="name" value="abc"></td-input-field>
    <td-input-field label="Ghi chú" type="textarea" name="note"></td-input-field>
    <td-alert variant="info" heading="Chú ý">Nội dung thông báo</td-alert>
    <select class="td-native-select"><option>Một</option><option>Hai</option></select>`;
  const PARTS = ['td-button .td-btn', 'td-input-field .td-field', 'td-input-field .td-field__label', 'td-input-field input.td-field__control',
    'td-input-field textarea.td-field__control', 'td-alert .td-alert', 'select.td-native-select'];
  const PROPS = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'height', 'font-size', 'line-height',
    'border-top-left-radius', 'border-top-width', 'border-top-color', 'background-color', 'color', 'column-gap'];

  /** A clean light-DOM page: full td.css, 16px root, the embed root's base typography on <body>. */
  async function reference(theme) {
    const iframe = document.createElement('iframe');
    iframe.width = '640';
    iframe.height = '900';
    iframe.srcdoc = `<!doctype html><html data-td-theme="${theme}"><head><meta charset="utf-8">
      <link rel="stylesheet" href="/td.css">
      <style>body { margin: 0; font-family: var(--td-font-sans); font-size: 16px; line-height: var(--td-leading-normal);
        color: var(--td-color-text); } .box { width: 600px; }</style></head>
      <body><div class="box">${MARKUP}</div>
      <script type="module">import '/src/form/td-button.js'; import '/src/form/td-input-field.js';
        import '/src/feedback/td-alert.js'; window.__ready = true;</script></body></html>`;
    document.body.append(iframe);
    for (let i = 0; i < 200 && !(iframe.contentWindow?.__ready && iframe.contentDocument.styleSheets.length); i += 1) await wait(25);
    await wait(50);
    return iframe;
  }

  function snapshot(win, scope) {
    return PARTS.map((sel) => [...scope.querySelectorAll(sel)].map((el) => {
      const cs = win.getComputedStyle(el);
      return Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)]));
    }));
  }
  const px = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
  function compare(a, b, label) {
    expect(a.length).to.equal(b.length);
    a.forEach((list, i) => {
      expect(list.length, `${PARTS[i]} count`).to.equal(b[i].length);
      expect(list.length, `${PARTS[i]} rendered`).to.be.greaterThan(0);
      list.forEach((props, j) => {
        for (const p of PROPS) {
          const x = props[p];
          const y = b[i][j][p];
          const nx = px(x);
          const ny = px(y);
          const where = `${label} ${PARTS[i]}[${j}] ${p}: embed ${x} vs light DOM ${y}`;
          if (nx != null && ny != null) expect(Math.abs(nx - ny), where).to.be.at.most(0.5);
          else expect(x, where).to.equal(y);
        }
      });
    });
  }

  function mount(cls = 'hostile', opts) {
    const host = newHost(cls);
    const h = mountTdEmbed(host, opts);
    return { host, h };
  }

  describe('td embed: mount on a hostile page (v0.116.0)', () => {
    it('1 + gate 2: mounts; root elements are the kit classes from the scoped registry, never the page fake', async () => {
      const { host, h } = mount();
      expect(host.shadowRoot).to.equal(h.shadowRoot);
      expect(h.shadowRoot.mode).to.equal('open');
      expect(h.shadowRoot.customElementRegistry).to.equal(h.registry);
      expect(h.root.className).to.equal('td-embed-root');
      expect(h.root.getAttribute('data-td-theme')).to.equal('auto');
      expect(h.shadowRoot.adoptedStyleSheets.length).to.equal(1);
      h.root.innerHTML = MARKUP;
      await frame();
      const btn = h.root.querySelector('td-button');
      expect(btn instanceof PageFakeButton).to.equal(false);
      expect(btn).to.be.instanceOf(h.registry.get('td-button'));
      expect(btn.querySelector('.td-btn')).to.not.equal(null);
      for (const n of ['td-button', 'td-input-field', 'td-alert']) expect(h.registry.get(n), n).to.be.a('function');
      for (const n of ['td-hint', 'td-icon', 'td-dropdown', 'td-toast']) expect(h.registry.get(n), n).to.equal(undefined);
      expect(customElements.get('td-button')).to.equal(PageFakeButton);
      expect(customElements.get('td-input-field')).to.equal(undefined);
      expect(customElements.get('td-alert')).to.equal(undefined);
    });

    for (const theme of ['light', 'dark']) {
      it(`2: the reviewed properties match a clean light-DOM page (${theme})`, async () => {
        const ref = await reference(theme);
        try {
          const { h } = mount('hostile', { theme });
          h.root.innerHTML = MARKUP;
          await frame();
          await wait(50);
          compare(snapshot(window, h.root), snapshot(ref.contentWindow, ref.contentDocument.querySelector('.box')), theme);
        } finally {
          ref.remove();
        }
      });
    }

    it('3: no leak outwards — a page <button> and a page .td-btn keep the page style', async () => {
      const box = newHost('plain');
      box.innerHTML = '<button id="pb">page</button><div class="td-btn" id="pt">page</div>';
      const read = () => ['#pb', '#pt'].map((s) => {
        const cs = getComputedStyle(box.querySelector(s));
        return ['padding-top', 'border-top-width', 'border-top-color', 'background-color', 'font-size', 'border-top-left-radius', 'color']
          .map((p) => cs.getPropertyValue(p)).join('|');
      });
      const before = read();
      const { h } = mount();
      h.root.innerHTML = MARKUP;
      await frame();
      expect(read()).to.deep.equal(before);
      expect(getComputedStyle(box.querySelector('#pb')).borderTopColor).to.equal('rgb(0, 255, 0)'); // the page's lime
    });

    it('4: focus is read from the shadow root (a structural re-render keeps it; a programmatic value is not a user change)', async () => {
      const { h } = mount();
      h.root.innerHTML = '<td-input-field label="Tên" name="n"></td-input-field>';
      await frame();
      const field = h.root.querySelector('td-input-field');
      let input = field.querySelector('input');
      input.focus();
      expect(h.shadowRoot.activeElement).to.equal(input);
      expect(document.activeElement).to.equal(h.shadowRoot.host);
      field.setAttribute('label-mode', 'floating'); // structural: the box is re-rendered
      await frame();
      input = field.querySelector('input');
      expect(h.shadowRoot.activeElement, 'focus kept on the new control').to.equal(input);
      let changes = 0;
      field.addEventListener('change', () => { changes += 1; });
      field.value = 'xin chào';
      input.setSelectionRange(3, 3);
      expect(input.selectionStart).to.equal(3);
      expect(h.shadowRoot.activeElement).to.equal(input);
      input.blur();
      await frame();
      expect(changes, 'programmatic value while focused → no change on blur').to.equal(0);
    });

    it('5: press — a touch pointerdown sets [data-td-pressed], pointerup clears it', async () => {
      const { h } = mount();
      h.root.innerHTML = '<td-button label="Nhấn"></td-button>';
      await frame();
      const ctl = h.root.querySelector('.td-btn');
      const ev = (type) => new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, composed: true, clientX: 5, clientY: 5 });
      ctl.dispatchEvent(ev('pointerdown'));
      expect(ctl.hasAttribute('data-td-pressed')).to.equal(true);
      ctl.dispatchEvent(ev('pointerup'));
      expect(ctl.hasAttribute('data-td-pressed')).to.equal(false);
    });

    it('6: busy — run(async…) blocks a second click until it settles', async () => {
      const { host, h } = mount();
      h.root.innerHTML = '<td-button label="Gửi"></td-button>';
      await frame();
      const btn = h.root.querySelector('td-button');
      let clicks = 0;
      host.addEventListener('click', () => { clicks += 1; });
      let done;
      const p = btn.run(() => new Promise((r) => { done = r; }));
      expect(btn.run(() => 1)).to.equal(p, 'a second run joins the first');
      await frame();
      btn.querySelector('.td-btn').click();
      expect(clicks, 'blocked while busy').to.equal(0);
      done();
      await p;
      await frame();
      btn.querySelector('.td-btn').click();
      expect(clicks).to.equal(1);
    });

    it('7: relabel through `label` updates the text and the accessible name', async () => {
      const { h } = mount();
      h.root.innerHTML = '<td-button label="Cũ"></td-button>';
      await frame();
      const btn = h.root.querySelector('td-button');
      btn.setAttribute('label', 'Mới');
      await frame();
      const ctl = btn.querySelector('.td-btn');
      expect(ctl.textContent.trim()).to.equal('Mới');
      expect(ctl.hasAttribute('aria-label') ? ctl.getAttribute('aria-label') : ctl.textContent.trim()).to.equal('Mới');
    });

    it("8: setTheme('dark' | 'light' | 'auto'), auto following the OS preference; a bad mode throws", async () => {
      const { h } = mount();
      const text = () => getComputedStyle(h.root).color;
      await emulateMedia({ colorScheme: 'light' });
      const light = text();
      h.setTheme('dark');
      expect(h.root.getAttribute('data-td-theme')).to.equal('dark');
      const dark = text();
      expect(dark).to.not.equal(light);
      expect(getComputedStyle(h.root).colorScheme).to.equal('dark');
      h.setTheme('light');
      expect(text()).to.equal(light);
      h.setTheme('auto');
      expect(text()).to.equal(light);
      await emulateMedia({ colorScheme: 'dark' });
      await frame();
      expect(text()).to.equal(dark);
      await emulateMedia({ colorScheme: 'light' });
      expect(() => h.setTheme('sepia')).to.throw(TypeError);
      expect(h.root.getAttribute('data-td-theme')).to.equal('auto');
    });

    it('9: two module instances mount on separate hosts without conflict', async () => {
      const other = await import(`${EMBED}?instance=2`);
      expect(other.mountTdEmbed).to.not.equal(mountTdEmbed);
      const a = mount();
      const b = other.mountTdEmbed(newHost());
      expect(b.registry).to.not.equal(a.h.registry);
      a.h.root.innerHTML = '<td-button label="A"></td-button>';
      b.root.innerHTML = '<td-button label="B"></td-button>';
      await frame();
      const ca = a.h.registry.get('td-button');
      const cb = b.registry.get('td-button');
      expect(ca).to.not.equal(cb);
      expect(a.h.root.querySelector('td-button')).to.be.instanceOf(ca);
      expect(b.root.querySelector('td-button')).to.be.instanceOf(cb);
      expect(b.root.querySelector('.td-btn').textContent.trim()).to.equal('B');
      expect(customElements.get('td-button')).to.equal(PageFakeButton);
      // a re-injected instance cannot take over a host another instance owns (unmounted or not)
      a.h.unmount();
      expect(() => other.mountTdEmbed(a.host)).to.throw(other.TdEmbedError).with.property('code', 'host-has-shadow');
    });

    it('10: errors leave the host untouched (foreign open / closed root, bad theme, double mount, bad host)', async () => {
      const code = (fn) => { try { fn(); } catch (e) { expect(e).to.be.instanceOf(TdEmbedError); return e.code; } return null; };
      const open = newHost();
      const foreign = open.attachShadow({ mode: 'open' });
      foreign.innerHTML = '<p>page</p>';
      expect(code(() => mountTdEmbed(open))).to.equal('host-has-shadow');
      expect(foreign.innerHTML).to.equal('<p>page</p>');
      expect(foreign.adoptedStyleSheets.length).to.equal(0);
      const closed = newHost();
      closed.attachShadow({ mode: 'closed' });
      expect(code(() => mountTdEmbed(closed))).to.equal('host-has-shadow');
      const fresh = newHost();
      expect(code(() => mountTdEmbed(fresh, { theme: 'sepia' }))).to.equal('bad-theme');
      expect(fresh.shadowRoot).to.equal(null);
      expect(code(() => mountTdEmbed(document.createElement('input')))).to.equal('bad-host');
      expect(code(() => mountTdEmbed(document.createTextNode('x')))).to.equal('bad-host');
      expect(code(() => mountTdEmbed(document.createElementNS('http://www.w3.org/2000/svg', 'g')))).to.equal('bad-host');
      const { host, h } = mount();
      h.root.innerHTML = '<td-alert>x</td-alert>';
      expect(code(() => mountTdEmbed(host))).to.equal('already-mounted');
      expect(h.shadowRoot.childNodes.length).to.equal(1);
      expect(h.root.isConnected).to.equal(true);
      expect(h.shadowRoot.adoptedStyleSheets.length).to.equal(1);
    });

    it('11: unmount is idempotent, disconnects the elements, and the same instance can remount the host', async () => {
      const { host, h } = mount();
      h.root.innerHTML = '<td-button label="x"></td-button>';
      await frame();
      const btn = h.root.querySelector('td-button');
      h.unmount();
      expect(btn.isConnected).to.equal(false);
      expect(h.shadowRoot.childNodes.length).to.equal(0);
      expect(h.shadowRoot.adoptedStyleSheets.length).to.equal(0);
      h.unmount(); // no-op
      const again = mountTdEmbed(host, { theme: 'dark' });
      expect(again.shadowRoot).to.equal(h.shadowRoot);
      expect(again.root).to.not.equal(h.root);
      expect(again.root.getAttribute('data-td-theme')).to.equal('dark');
      expect(again.shadowRoot.adoptedStyleSheets.length).to.equal(1);
      h.unmount(); // the old handle stays a no-op
      expect(again.root.isConnected).to.equal(true);
      again.root.innerHTML = '<td-button label="y"></td-button>';
      expect(again.root.querySelector('td-button')).to.be.instanceOf(again.registry.get('td-button'));
    });

    it("12: create('td-alert') returns an upgraded kit alert", async () => {
      const { h } = mount();
      const alert = h.create('td-alert');
      expect(alert).to.be.instanceOf(h.registry.get('td-alert'));
      alert.setAttribute('variant', 'success');
      alert.textContent = 'Đã lưu';
      h.root.append(alert);
      await frame();
      const box = alert.querySelector('.td-alert');
      expect(box).to.not.equal(null);
      expect(box.classList.contains('td-alert--success')).to.equal(true);
      expect(box.querySelector('.td-alert__icon svg')).to.not.equal(null);
      // the page registry is outside the contract: document.createElement gives the page's own class
      expect(document.createElement('td-button')).to.be.instanceOf(PageFakeButton);
    });

    it('13: td-* events are observable from outside the host (composed)', async () => {
      const { host, h } = mount();
      h.root.innerHTML = '<td-input-field label="Tên" name="n"></td-input-field>';
      await frame();
      const field = h.root.querySelector('td-input-field');
      const seen = [];
      const on = (e) => { if (e instanceof CustomEvent) seen.push([e.type, e.target, e.detail?.value]); };
      document.addEventListener('input', on);
      try {
        const input = field.querySelector('input');
        input.value = 'abc';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
      } finally {
        document.removeEventListener('input', on);
      }
      expect(seen.length).to.equal(1);
      expect(seen[0][1]).to.equal(host, 'retargeted to the host');
      expect(seen[0][2]).to.equal('abc');
    });

    it('14: nested parse probe — a child defined only in the scoped registry upgrades through innerHTML on a scoped parent', async () => {
      const { h } = mount();
      class Child extends HTMLElement {}
      class Parent extends HTMLElement {
        connectedCallback() { this.innerHTML = '<td-probe-child></td-probe-child>'; }
      }
      h.registry.define('td-probe-child', Child);
      h.registry.define('td-probe-parent', Parent);
      h.root.innerHTML = '<td-probe-parent></td-probe-parent>';
      const child = h.root.querySelector('td-probe-child');
      expect(child).to.be.instanceOf(Child);
      expect(customElements.get('td-probe-child')).to.equal(undefined);
      // a container from handle.create() upgrades what is parsed into it later (the documented way to build sub-trees)
      const box = h.create('div');
      h.root.append(box);
      box.innerHTML = '<td-button label="z"></td-button>';
      expect(box.firstChild).to.be.instanceOf(h.registry.get('td-button'));
    });

    it('15: --td-embed-rem on the host scales the rem geometry; hostile --_td-* / --td-* on the host stay blocked', async () => {
      const a = mount('hostile');
      const b = mount('hostile rem20');
      const c = mount('plain');
      for (const m of [a.h, b.h, c.h]) m.root.innerHTML = '<td-button variant="primary" label="Lưu"></td-button><td-button label="Huỷ"></td-button>';
      await frame();
      const cs = (m, i = 0) => getComputedStyle(m.root.querySelectorAll('.td-btn')[i]);
      const h16 = parseFloat(cs(a.h).height);
      const h20 = parseFloat(cs(b.h).height);
      expect(h20 / h16).to.be.closeTo(1.25, 0.03);
      expect(parseFloat(cs(b.h).fontSize) / parseFloat(cs(a.h).fontSize)).to.be.closeTo(1.25, 0.03);
      expect(parseFloat(getComputedStyle(b.h.root).fontSize)).to.equal(20);
      // hostile values on :root and on the host never reach the elements: identical to a clean host
      for (const i of [0, 1]) {
        expect(cs(a.h, i).backgroundColor).to.equal(cs(c.h, i).backgroundColor);
        expect(cs(a.h, i).paddingLeft).to.equal(cs(c.h, i).paddingLeft);
      }
      expect(cs(a.h).backgroundColor).to.not.equal('rgb(255, 0, 255)');
      expect(cs(a.h, 1).backgroundColor).to.not.equal('rgb(0, 255, 0)');
    });
  });
}
