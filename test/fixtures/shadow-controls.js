/**
 * v0.53.0 test fixture (plan v0.53.0-menu-custom-item M1, Codex plan-review r1 #2): tiny SITE-style custom elements
 * with shadow roots, to prove `tabSequence()` (src/utils/layers.js) walks the composed / flat tree like native Tab.
 * Test-only (never shipped, no styles: nothing here needs any). Every control carries `data-k` (its name in asserts).
 *
 *   <td-test-shadow-open>        open root: [button s1] <slot> [button s2]  (slotted light children land at the slot)
 *   <td-test-shadow-delegates>   open root, delegatesFocus: [input d1]      (the host is not a stop of its own)
 *   <td-test-shadow-plain>       open root: [button p1]                     (host tabindex is up to the test)
 *   <td-test-shadow-closed>      CLOSED root: [button c1]                   (unreachable; host tabindex = one stop)
 *   <td-test-shadow-radios>      open root: radios name="r" (r1, r2)        (one group per shadow root)
 *   <td-test-shadow-noslot>      open root without a slot: [button n1]      (light children are not rendered)
 *   <td-test-shadow-keys>        open root: <div data-td-menu-keys="content"><slot>  (slotted light children are inside the
 *                                marker in the COMPOSED tree only — Codex impl r1 #3)
 *   <td-test-shadow-inert>       open root: <div inert><slot></div> [button i1]       (slotted children are inert)
 */
const define = (name, { mode = 'open', delegatesFocus = false, html }) => {
  if (customElements.get(name)) return;
  customElements.define(name, class extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode, delegatesFocus });
      const tpl = document.createElement('template');
      tpl.innerHTML = html; // static fixture markup (test-only)
      root.appendChild(tpl.content.cloneNode(true));
    }
  });
};

define('td-test-shadow-open', { html: '<button type="button" data-k="s1">S1</button><slot></slot><button type="button" data-k="s2">S2</button>' });
define('td-test-shadow-delegates', { delegatesFocus: true, html: '<input aria-label="D1" data-k="d1">' });
define('td-test-shadow-plain', { html: '<button type="button" data-k="p1">P1</button>' });
define('td-test-shadow-closed', { mode: 'closed', html: '<button type="button" data-k="c1">C1</button>' });
define('td-test-shadow-radios', {
  html: '<label><input type="radio" name="r" value="1" data-k="r1">R1</label><label><input type="radio" name="r" value="2" data-k="r2">R2</label>',
});
define('td-test-shadow-noslot', { html: '<button type="button" data-k="n1">N1</button>' });
define('td-test-shadow-keys', { html: '<div data-td-menu-keys="content"><slot></slot></div>' });
define('td-test-shadow-inert', { html: '<div inert><slot></slot></div><button type="button" data-k="i1">I1</button>' });
