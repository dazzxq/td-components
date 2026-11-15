/**
 * `mountTdEmbed(host, opts?)` (ADR 0045 Q2, plan v0.116.0 QĐ5): an open shadow root on `host` with the embed's scoped
 * custom element registry, the embed CSS adopted as a constructed sheet (no `<style>`, CSP-strict), and inside it
 * `<div class="td-embed-root" data-td-theme="auto">` where the kit elements live.
 *
 * Everything is validated BEFORE `attachShadow`: a failure throws `TdEmbedError` with a `code` and leaves `host`
 * untouched, so the consumer can fall back to its previous integration.
 *   'bad-host'        not an element that can carry a shadow root
 *   'unsupported'     no scoped registry / constructable sheets in the page realm (browser floor: docs/guides/embed.md)
 *   'host-has-shadow' the host already has a shadow root this module instance did not create
 *   'already-mounted' mounted, and not unmounted yet
 *   'bad-theme'       opts.theme is not 'auto' | 'light' | 'dark'
 */
import { EMBED_CSS } from './css.js';
import { isDevBuild } from './build.js';
import { scopedRegistryFor } from './registry.js';

const THEMES = ['auto', 'light', 'dark'];
const HTML_NS = 'http://www.w3.org/1999/xhtml';
/** Elements that may carry a shadow root (DOM `attachShadow`), besides valid custom element names. */
const SHADOW_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'main', 'nav', 'p', 'section', 'span']);

export class TdEmbedError extends Error {
  /** @param {'bad-host'|'unsupported'|'host-has-shadow'|'already-mounted'|'bad-theme'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'TdEmbedError';
    this.code = code;
  }
}

/** @type {WeakMap<Document, CSSStyleSheet>} one constructed sheet per Document (page realm) */
const sheets = new WeakMap();
/** @type {WeakMap<Element, { shadowRoot: ShadowRoot, doc: Document, mounted: boolean }>} hosts this instance owns */
const owned = new WeakMap();

function sheetFor(view, doc) {
  let sheet = sheets.get(doc);
  if (!sheet) {
    sheet = new view.CSSStyleSheet();
    sheet.replaceSync(EMBED_CSS);
    sheets.set(doc, sheet);
  }
  return sheet;
}

/**
 * Dev builds only (running from source): warn once when a `td-*` element in the root is not one of this embed's
 * elements — typically `document.createElement('td-button')` (the PAGE registry), which is outside the contract.
 */
function watchDev(view, root, registry) {
  if (!isDevBuild() || typeof view.MutationObserver !== 'function') return null;
  let warned = false;
  const check = (el) => {
    if (warned || !el.localName?.startsWith('td-')) return;
    const cls = registry.get(el.localName);
    if (cls && el instanceof cls) return;
    warned = true;
    console.warn(`td embed: <${el.localName}> in the embed root is not an embed element. Create elements with `
      + 'handle.create(tag) or parse them inside handle.root; document.createElement() uses the page registry. '
      + `Embed elements: ${['td-button', 'td-input-field', 'td-alert'].join(', ')}.`);
  };
  const obs = new view.MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        check(n);
        for (const d of n.querySelectorAll('*')) check(d);
      }
    }
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}

/**
 * Mount the embed on `host`.
 * @param {HTMLElement} host an element of the page (div, span, section…, or an autonomous custom element)
 * @param {{ theme?: 'auto'|'light'|'dark' }} [opts]
 * @returns {{ root: HTMLDivElement, shadowRoot: ShadowRoot, registry: CustomElementRegistry,
 *   create: (tag: string) => HTMLElement, setTheme: (mode: 'auto'|'light'|'dark') => void, unmount: () => void }}
 */
export function mountTdEmbed(host, opts = {}) {
  const doc = host?.ownerDocument;
  const view = doc?.defaultView;
  if (!host || host.nodeType !== 1 || host.namespaceURI !== HTML_NS || typeof host.attachShadow !== 'function' || !view) {
    throw new TdEmbedError('bad-host', 'mountTdEmbed: host must be an HTML element in a document with a window');
  }
  const name = host.localName;
  if (!SHADOW_HOSTS.has(name) && !/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(name)) {
    throw new TdEmbedError('bad-host', `mountTdEmbed: <${name}> cannot carry a shadow root (use a <div>)`);
  }
  const theme = opts?.theme ?? 'auto';
  if (!THEMES.includes(theme)) {
    throw new TdEmbedError('bad-theme', `mountTdEmbed: theme must be one of ${THEMES.join(', ')} (got ${String(theme)})`);
  }
  const record = owned.get(host);
  if (record?.mounted) throw new TdEmbedError('already-mounted', 'mountTdEmbed: this host is already mounted (unmount first)');
  if (record ? record.shadowRoot !== host.shadowRoot || record.doc !== doc : host.shadowRoot) {
    throw new TdEmbedError('host-has-shadow', 'mountTdEmbed: the host already has a shadow root it did not get from this embed '
      + '(a re-injected script must use a new host)');
  }
  const registry = scopedRegistryFor(view, doc);
  if (!registry) {
    throw new TdEmbedError('unsupported', 'mountTdEmbed: this browser has no scoped custom element registry '
      + '(Chrome/Edge 146, Safari 26.4, Firefox 159 or newer)');
  }
  let sheet;
  try {
    sheet = sheetFor(view, doc);
  } catch (e) {
    throw new TdEmbedError('unsupported', `mountTdEmbed: the embed stylesheet could not be built (${e?.message ?? e})`);
  }

  let shadowRoot = record?.shadowRoot;
  if (!shadowRoot) {
    try {
      shadowRoot = host.attachShadow({ mode: 'open', customElementRegistry: registry });
    } catch (e) {
      // a closed shadow root (invisible from here) or a custom element that disables shadow: nothing was changed
      throw new TdEmbedError('host-has-shadow', `mountTdEmbed: attachShadow failed (${e?.message ?? e})`);
    }
  }
  shadowRoot.adoptedStyleSheets = [sheet];
  // The root carries the scoped registry itself: WebKit 26.4 keeps a plain createElement() node on the page registry
  // even inside the scoped shadow root (Chromium adopts it on insertion), so `root.innerHTML` would not upgrade there.
  const root = doc.createElement('div', { customElementRegistry: registry });
  root.className = 'td-embed-root';
  root.setAttribute('data-td-theme', theme);
  shadowRoot.append(root);
  const state = { shadowRoot, doc, mounted: true };
  owned.set(host, state);
  const devObserver = watchDev(view, root, registry);

  return {
    root,
    shadowRoot,
    registry,
    /**
     * An element bound to this embed's scoped registry: a kit element comes back upgraded, a container (`create('div')`)
     * upgrades what is later parsed into it with innerHTML. `document.createElement` uses the page registry (in WebKit
     * its innerHTML stays un-upgraded even inside the root).
     */
    create(tag) {
      return doc.createElement(tag, { customElementRegistry: registry });
    },
    setTheme(mode) {
      if (!THEMES.includes(mode)) throw new TypeError(`setTheme: mode must be one of ${THEMES.join(', ')} (got ${String(mode)})`);
      root.setAttribute('data-td-theme', mode);
    },
    /** Idempotent. Empties the shadow root (each element runs its disconnectedCallback); the host can be remounted. */
    unmount() {
      if (!state.mounted) return;
      state.mounted = false;
      devObserver?.disconnect();
      shadowRoot.replaceChildren();
      shadowRoot.adoptedStyleSheets = [];
    },
  };
}
