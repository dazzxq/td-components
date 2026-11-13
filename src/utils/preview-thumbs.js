/**
 * Preview images of td-media-field / td-media-gallery through the thumbnail loader (v0.112.0, plan
 * v0.112.0-media-field-gallery-thumb-loader). The markup stays render()'s / PHP's (`src` + `loading="lazy"`): the images
 * are ADOPTED (`data-td-managed-img` + a `data-td-thumb-cell` cell, set by JS after the SSR gate), so the loader paces
 * them with the page-wide broker of their host, retries a failure and never leaves a broken-image icon.
 *
 * `teardown()` (disconnect, `thumbLoader = false`): destroy the loader FIRST (it cancels in-flight loads by dropping
 * `src`), then put every preview back to render()'s markup as the LAST step, so a re-connect re-binds in place.
 */
import { createThumbLoader, configureThumbBudget, CLS, ATTR, ROOT_CLASS } from './thumb-loader.js';

const CELL = 'data-td-thumb-cell';

export class PreviewThumbs {
  /**
   * @param {HTMLElement} host the component (scan root; gets the loader's root class)
   * @param {{ images: () => HTMLImageElement[], cellOf: (img: HTMLImageElement) => Element|null,
   *   config: () => any }} o images = the current preview images; config = the `thumbLoader` property
   */
  constructor(host, o) {
    this.host = host;
    this.o = o;
    /** @type {any} */
    this.loader = null;
    /** @type {Map<HTMLImageElement, Element>} images this instance marked → their cell (released once they leave) */
    this.adopted = new Map();
  }

  /** Create the loader if needed (connected + not `false`), release images that left, adopt the current ones. */
  sync() {
    const host = this.host;
    if (!host.isConnected) return;
    const cfg = this.o.config();
    if (cfg === false) return;
    if (!this.loader) {
      let budget;
      if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
        try { budget = configureThumbBudget(cfg) || undefined; } catch { budget = undefined; }
      }
      try { this.loader = createThumbLoader({ budget }); } catch { this.loader = null; }
      if (!this.loader) return;
    }
    for (const [img, cell] of this.adopted) {
      if (!host.contains(img)) {
        this.loader.release(img);
        this.adopted.delete(img);
        // release() keeps the terminal state on purpose; a reused cell must not show the old image's loaded / failed
        for (const c of Object.values(CLS)) cell.classList.remove(c);
      }
    }
    for (const img of this.o.images()) {
      const cell = this.o.cellOf(img);
      if (!cell) continue;
      if (!img.hasAttribute(ATTR.managed)) img.setAttribute(ATTR.managed, '');
      if (!cell.hasAttribute(CELL)) cell.setAttribute(CELL, '');
      this.adopted.set(img, cell);
    }
    this.loader.scan(host);
  }

  /** Loader off (destroy first), then the previews back to render()'s markup (last). */
  teardown() {
    if (this.loader) {
      this.loader.destroy();
      this.loader = null;
    }
    for (const [img, cell] of this.adopted) {
      if (this.host.contains(img)) restoreImg(img, cell);
    }
    this.adopted.clear();
    this.host.classList.remove(ROOT_CLASS);
  }

  /** `thumbLoader` changed: off → legacy markup; on / new config → a fresh loader over the current previews. */
  reconfigure() {
    this.teardown();
    this.sync();
  }
}

/**
 * @param {HTMLImageElement} img @param {Element|null} cell
 */
function restoreImg(img, cell) {
  for (const [real, data] of [['src', ATTR.src], ['srcset', ATTR.srcset], ['sizes', ATTR.sizes]]) {
    const v = img.getAttribute(data);
    if (null !== v && img.getAttribute(real) !== v) img.setAttribute(real, v);
    img.removeAttribute(data);
  }
  img.removeAttribute(ATTR.managed);
  if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy'); // render() always prints it
  if (cell) {
    cell.removeAttribute(CELL);
    for (const c of Object.values(CLS)) cell.classList.remove(c);
  }
}
