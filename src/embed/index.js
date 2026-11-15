/**
 * td embed entry (ADR 0045, plan v0.116.0). Bundled into dist/embed/td-embed.js by scripts/build-embed.mjs and shipped
 * as `@dazzxq/td-components/embed` — never import this source file in an app: it must not share module instances
 * with the light-DOM entries.
 *
 * Import order matters: `./suppress.js` FIRST turns auto-define off for this module instance, so the component modules
 * evaluated after it define nothing on the page's global registry (QĐ1). ESM evaluates depth-first in import order and
 * esbuild keeps that order.
 */
import './suppress.js';
import '../form/td-button.js';
import '../form/td-input-field.js';
import '../feedback/td-alert.js';

export { mountTdEmbed, TdEmbedError } from './mount.js';
export { TD_EMBED_BUILD } from './build.js';
export { registerIcons } from '../icons/td-icon.js';
