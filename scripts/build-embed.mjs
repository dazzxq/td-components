#!/usr/bin/env node
/**
 * v0.116.0 (ADR 0045, plan v0.116.0-td-embed QĐ4): the td embed artifact, one self-contained ES module for a page the
 * kit does not own (an IMS4 userscript). It carries the embed CSS text, the icon subset, the component classes, the
 * mount helper and the build id.
 *   node scripts/build-embed.mjs          → write dist/embed/td-embed.js + dist/embed/td-embed.css (inspection only:
 *                                            the exact CSS text the module adopts, never loaded at runtime)
 *   node scripts/build-embed.mjs --check  → rebuild in memory, exit 1 when either file is missing / stale or
 *                                            dist/embed/ holds anything else
 *
 * CSS: the reviewed file list of scripts/embed-manifest.json through the td.css transforms (build-css.mjs
 * `buildStyles`), then, in order:
 *   1. `:root` → `.td-embed-root` in every selector (compounds too: `:root[data-td-theme="dark"]`);
 *   2. `Nrem` in declaration values → `calc(N * var(--td-embed-rem, 16px))` (`@media` / `@container` / `@supports`
 *      preludes untouched: a condition's rem is the UA default, never the page's);
 *   3. custom-property quarantine: every referenced `var(--x)` that is not declared unconditionally on `.td-embed-root`
 *      gets `--x: initial` on `.td-embed-root` (first in `@layer td.tokens`, so any real declaration wins), so a
 *      value the CMS sets on an ancestor never inherits into the elements; `--td-embed-rem` is the one exemption;
 *   4. head block: `:host { all: initial !important; display: block !important }` + the root typography.
 * Then esbuild minifies it (same target as build-dist) and the static checks run on the final text: no `:root`, no
 * rem outside conditions, every var() resolves, every animation has its @keyframes, every @container name has its
 * container-name.
 *
 * JS: esbuild bundle of src/embed/index.js (esm, minify, build-dist's target). `src/embed/css.js` resolves to the CSS
 * text and td-icon.js's `./registry.js` to the generated icon subset. Build id without a self-referencing hash: build
 * with the literal "__TD_EMBED_BUILD__", hash = sha256(cssText + jsWithPlaceholder).slice(0, 10), then replace the
 * placeholder with `${version}+${hash}`. Deterministic: pinned esbuild, no timestamps, LF.
 */
import { readFileSync, realpathSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { buildStyles } from './build-css.mjs';
import { buildIconOutputs } from './build-icons.mjs';
import { readGenerated, writeGenerated } from './safe-file.mjs';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
/** build-dist.mjs TARGET (docs/getting-started/requirements.md): the minifier never emits newer syntax. */
export const TARGET = ['chrome102', 'firefox112', 'safari16.4'];
export const PLACEHOLDER = '__TD_EMBED_BUILD__';
export const ROOT_CLASS = 'td-embed-root';
/** The embed's one inherited configuration property: never quarantined. */
export const REM_VAR = '--td-embed-rem';
const OUT_JS = 'dist/embed/td-embed.js';
const OUT_CSS = 'dist/embed/td-embed.css';

// ---------------------------------------------------------------------------------------------------------------------
// CSS walker: a small structural tokenizer (comments, strings, url(), blocks) adequate for selector / value rewrites.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * `mask(text)`: the same text with every comment, string and unquoted url() body replaced by U+0001 (same length, so
 * offsets map 1:1). A regex run on the mask can never match inside them.
 */
export function mask(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += '\u0001'.repeat(stop - i);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const stop = Math.min(n, j + 1);
      out += c + '\u0001'.repeat(Math.max(0, stop - i - 2)) + (stop - i >= 2 ? text[stop - 1] : '');
      i = stop;
    } else if ((c === 'u' || c === 'U') && /^url\($/i.test(text.slice(i, i + 4)) && !/[\w-]/.test(text[i - 1] || '')) {
      // unquoted url( … ): body masked up to the closing paren (a quoted body is handled as a string)
      let j = i + 4;
      while (j < n && /\s/.test(text[j])) j += 1;
      if (text[j] === '"' || text[j] === "'") { out += text.slice(i, j); i = j; continue; }
      while (j < n && text[j] !== ')') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, i + 4) + '\u0001'.repeat(Math.max(0, j - i - 4));
      i = j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const RULE_LISTS = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style', 'document']);

/**
 * Walk a stylesheet and rebuild it from rewritten pieces. Callbacks get (raw, masked, ctx) and return the new raw text
 * (or undefined to keep it):
 *   selector(prelude)           a style rule's prelude
 *   atRule(prelude, name)       an at-rule prelude (block or statement), `name` lower-case without '@'
 *   declaration(text)           one declaration inside a style / keyframe / descriptor block (no trailing ';')
 * ctx = { conditions: string[] } — the masked preludes of the enclosing at-rules (outermost first) and `rule` (the
 * enclosing style rule's masked prelude, '' outside one).
 * @returns {string}
 */
export function walkCss(css, { selector, atRule, declaration } = {}) {
  const m = mask(css);
  /** @type {Array<{ kind: 'rules'|'style'|'keyframes'|'decls', prelude: string, at: string|null }>} */
  const stack = [{ kind: 'rules', prelude: '', at: null }];
  let out = '';
  let start = 0;
  const ctx = () => ({
    conditions: stack.filter((s) => s.at).map((s) => s.prelude),
    rule: [...stack].reverse().find((s) => s.kind === 'style')?.prelude ?? '',
    keyframes: stack.some((s) => s.kind === 'keyframes'),
  });
  const top = () => stack[stack.length - 1];
  /** Emit the segment [start, end) as a declaration (inside a block that holds declarations) or verbatim. */
  const flushDecl = (end) => {
    const raw = css.slice(start, end);
    const masked = m.slice(start, end);
    if (masked.trim() && declaration && (top().kind === 'style' || top().kind === 'decls')) {
      const lead = masked.match(/^[\s\u0001]*/)[0].length;
      const r = declaration(raw.slice(lead), masked.slice(lead), ctx());
      out += raw.slice(0, lead) + (r ?? raw.slice(lead));
    } else {
      out += raw;
    }
  };
  for (let i = 0; i < css.length; i += 1) {
    const c = m[i];
    if (c === '{') {
      const raw = css.slice(start, i);
      const masked = m.slice(start, i);
      const lead = masked.match(/^[\s\u0001]*/)[0].length; // leading whitespace / comments stay as they are
      const head = raw.slice(0, lead);
      const pRaw = raw.slice(lead);
      const pMasked = masked.slice(lead);
      const parent = top();
      let kind;
      let at = null;
      let next = pRaw;
      if (pMasked.startsWith('@')) {
        at = /^@([\w-]+)/.exec(pMasked)?.[1]?.toLowerCase() ?? '';
        const name = at.replace(/^-\w+-/, '');
        kind = name === 'keyframes' ? 'keyframes' : RULE_LISTS.has(name) ? (parent.kind === 'style' ? 'style' : 'rules') : 'decls';
        if (atRule) next = atRule(pRaw, pMasked, at, ctx()) ?? pRaw;
      } else if (parent.kind === 'keyframes') {
        kind = 'decls'; // `from` / `50%` / `to`
      } else {
        kind = 'style';
        if (selector) next = selector(pRaw, pMasked, ctx()) ?? pRaw;
      }
      out += head + next + '{';
      stack.push({ kind, prelude: at ? pMasked : (kind === 'style' ? pMasked : ''), at });
      start = i + 1;
    } else if (c === ';') {
      const t = top();
      if (t.kind === 'style' || t.kind === 'decls') {
        flushDecl(i);
        out += ';';
      } else {
        const raw = css.slice(start, i);
        const masked = m.slice(start, i);
        const lead = masked.match(/^[\s\u0001]*/)[0].length;
        const pMasked = masked.slice(lead);
        const at = /^@([\w-]+)/.exec(pMasked)?.[1]?.toLowerCase();
        out += raw.slice(0, lead) + (at && atRule ? (atRule(raw.slice(lead), pMasked, at, ctx()) ?? raw.slice(lead)) : raw.slice(lead)) + ';';
      }
      start = i + 1;
    } else if (c === '}') {
      flushDecl(i);
      out += '}';
      if (stack.length > 1) stack.pop();
      start = i + 1;
    }
  }
  out += css.slice(start);
  return out;
}

/** Apply regex replacements found on `masked` to `raw` (same offsets). */
function replaceOnMask(raw, masked, re, fn) {
  let out = '';
  let last = 0;
  for (const match of masked.matchAll(re)) {
    out += raw.slice(last, match.index) + fn(match);
    last = match.index + match[0].length;
  }
  return out + raw.slice(last);
}

const ROOT_RE = /:root(?![\w-])/gi;
/** `:root` → `.td-embed-root` in one selector prelude (same specificity: one pseudo-class → one class). */
export function rewriteRootSelector(raw, masked = mask(raw)) {
  return replaceOnMask(raw, masked, ROOT_RE, () => `.${ROOT_CLASS}`);
}

const REM_RE = /(?<![\w.\\-])([+-]?)(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)rem(?![\w-])/gi;
/** `Nrem` → `calc(N * var(--td-embed-rem, 16px))` in one declaration value. */
export function rewriteRemValue(raw, masked = mask(raw)) {
  return replaceOnMask(raw, masked, REM_RE, (mt) => `calc(${mt[1]}${mt[2]} * var(${REM_VAR}, 16px))`);
}

/** Split a declaration at its first top-level ':' → { name, value } (masked offsets) or null. */
function splitDecl(masked) {
  const k = masked.indexOf(':');
  if (k < 0) return null;
  return { name: masked.slice(0, k).trim(), colon: k };
}

/** Rewrites 1–2 on a whole stylesheet. */
export function rewriteEmbedCss(css) {
  return walkCss(css, {
    selector: (raw, masked) => rewriteRootSelector(raw, masked),
    declaration: (raw, masked) => {
      const d = splitDecl(masked);
      if (!d) return raw;
      return raw.slice(0, d.colon + 1) + rewriteRemValue(raw.slice(d.colon + 1), masked.slice(d.colon + 1));
    },
  });
}

/** Selector list items of a masked prelude (top-level commas only). */
function selectorItems(masked) {
  const items = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) { items.push(masked.slice(from, i).trim()); from = i + 1; }
  }
  items.push(masked.slice(from).trim());
  return items.filter(Boolean);
}

/**
 * Facts about a stylesheet: custom properties referenced / declared (and declared unconditionally on the root:
 * a top-level-or-@layer rule whose selector list has the bare `.td-embed-root` item), keyframes, container names
 * (declared / queried), animation names used, rem / :root leftovers.
 */
export function analyzeCss(css) {
  const facts = {
    referenced: new Set(), declared: new Set(), rootDeclared: new Set(), keyframes: new Set(), containerNames: new Set(),
    containerQueries: new Set(), animations: new Set(), remLeft: [], rootLeft: [],
  };
  const unconditional = (conditions) => conditions.every((p) => /^@layer\b/i.test(p));
  walkCss(css, {
    selector: (raw, masked) => {
      if (ROOT_RE.test(masked)) facts.rootLeft.push(raw.trim());
      ROOT_RE.lastIndex = 0;
    },
    atRule: (raw, masked, name) => {
      if (/keyframes$/.test(name)) {
        const k = /^@[\w-]+\s+([^\s{]+)/.exec(masked)?.[1];
        if (k) facts.keyframes.add(k.replace(/^["']|["']$/g, ''));
      }
      if (name === 'container') {
        const q = /^@container\s+([A-Za-z_-][\w-]*)/i.exec(masked)?.[1];
        if (q && !/^(not|style|scroll-state)$/i.test(q)) facts.containerQueries.add(q);
      }
      if (ROOT_RE.test(masked)) facts.rootLeft.push(raw.trim());
      ROOT_RE.lastIndex = 0;
    },
    declaration: (raw, masked, ctx) => {
      const d = splitDecl(masked);
      if (!d) return;
      const value = masked.slice(d.colon + 1);
      const name = d.name.toLowerCase();
      for (const mt of value.matchAll(/var\(\s*(--[\w-]+)/g)) facts.referenced.add(mt[1]);
      if (d.name.startsWith('--')) {
        facts.declared.add(d.name);
        if (!ctx.keyframes && unconditional(ctx.conditions) && selectorItems(ctx.rule).includes(`.${ROOT_CLASS}`)) {
          facts.rootDeclared.add(d.name);
        }
      }
      if (REM_RE.test(value)) facts.remLeft.push(raw.trim());
      REM_RE.lastIndex = 0;
      if (name === 'container-name' || name === 'container') {
        const names = (name === 'container' ? value.split('/')[0] : value).trim().split(/\s+/);
        for (const x of names) if (x && x !== 'none') facts.containerNames.add(x);
      }
      if (name === 'animation' || name === 'animation-name') {
        for (const item of value.split(',')) {
          if (/var\(/.test(item)) continue;
          for (const tok of item.replace(/[\w-]+\([^)]*\)/g, ' ').trim().split(/\s+/)) {
            if (/^[A-Za-z_-][\w-]*$/.test(tok) && !ANIMATION_KEYWORDS.has(tok.toLowerCase())) facts.animations.add(tok);
          }
        }
      }
    },
  });
  return facts;
}

/**
 * Every declaration of a stylesheet with where it sits (token gates of test/embed): name, value (raw, trimmed), the
 * selector list items of its style rule (quotes removed: `[data-td-theme=dark]`) and the masked preludes of the
 * enclosing at-rules.
 * @returns {Array<{ name: string, value: string, items: string[], conditions: string[] }>}
 */
export function declarations(css) {
  const out = [];
  walkCss(css, {
    declaration: (raw, masked, ctx) => {
      const d = splitDecl(masked);
      if (!d || ctx.keyframes) return;
      const items = selectorItems(ctx.rule).map((x) => x.replace(/\s+/g, ' ').replace(/=(["'])(.*?)\1/g, '=$2'));
      out.push({ name: d.name, value: raw.slice(d.colon + 1).trim(), items, conditions: ctx.conditions.map((c) => c.trim()) });
    },
  });
  return out;
}

const ANIMATION_KEYWORDS = new Set(['none', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start',
  'step-end', 'forwards', 'backwards', 'both', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'running', 'paused',
  'initial', 'inherit', 'unset', 'revert', 'revert-layer', 'auto', 'replace', 'add', 'accumulate']);

/** The quarantine list: referenced, not declared unconditionally on the root, never the rem property (sorted). */
export function quarantineList(facts) {
  return [...facts.referenced].filter((v) => v !== REM_VAR && !facts.rootDeclared.has(v)).sort();
}

/** The head block (rewrite 4) + the quarantine rule (rewrite 3), placed right after the layer-order statement. */
export function headBlock(quarantine) {
  const q = quarantine.length ? `\n\t.${ROOT_CLASS} {\n${quarantine.map((v) => `\t\t${v}: initial;`).join('\n')}\n\t}\n` : '';
  return `/* td embed (ADR 0045): the host resets every inherited page style; custom properties are not reset by \`all\`,
   so the quarantine below cuts each one the kit reads but does not declare on the root (the CMS cannot inject one). */
:host {
\tall: initial !important;
\tdisplay: block !important;
}
@layer td.tokens {${q}
\t/* root typography from the kit's base tokens (\`direction\` / \`unicode-bidi\` are not reset by \`all\`) */
\t.${ROOT_CLASS} {
\t\tfont-family: var(--td-font-sans);
\t\tfont-size: var(--td-text-base);
\t\tline-height: var(--td-leading-normal);
\t\tcolor: var(--td-color-text);
\t\tdirection: ltr;
\t\tunicode-bidi: isolate;
\t\tcolor-scheme: light;
\t}
}
`;
}

/** Static checks of QĐ4 on the final CSS text → error strings. */
export function checkEmbedCss(css) {
  const f = analyzeCss(css);
  const errors = [];
  for (const s of f.rootLeft) errors.push(`:root left in "${s.slice(0, 80)}"`);
  for (const s of f.remLeft) errors.push(`rem left in a declaration: "${s.slice(0, 80)}"`);
  const q = new Set(quarantineList(f));
  for (const v of f.referenced) {
    if (v !== REM_VAR && !f.declared.has(v) && !q.has(v)) errors.push(`var(${v}) resolves to nothing`);
  }
  for (const a of f.animations) if (!f.keyframes.has(a)) errors.push(`animation "${a}" has no @keyframes`);
  for (const c of f.containerQueries) if (!f.containerNames.has(c)) errors.push(`@container ${c} has no container-name`);
  if (!new RegExp(`:host\\{all:initial!important;display:block!important\\}`).test(css.replace(/\s+/g, ''))) {
    errors.push(':host head block missing');
  }
  if (/\bcontain\s*:/.test(mask(css))) errors.push('`contain` is not allowed in the embed CSS (QĐ3)');
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------------------------------

export function readEmbedManifest(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'scripts', 'embed-manifest.json'), 'utf8'));
  if (manifest.files?.[0] !== 'layers.css') throw new Error('embed-manifest: layers.css must be first');
  if (!Array.isArray(manifest.icons) || !manifest.icons.length) throw new Error('embed-manifest: "icons" must be a non-empty list');
  return manifest;
}

/** The embed CSS: source text after rewrites 1–4 (readable) and the minified runtime text. */
export async function buildEmbedCss(manifest = readEmbedManifest(), { minify = true } = {}) {
  const { parts } = await buildStyles(manifest.files, { lint: false }); // td.css lints the same sources (check:css)
  const [first, ...rest] = parts;
  const body = rewriteEmbedCss(rest.map(({ file, css }) => `\n/* ---- src/styles/${file} ---- */\n${css}\n`).join(''));
  const layers = rewriteEmbedCss(first.css);
  const facts = analyzeCss(layers + body);
  const quarantine = quarantineList(facts);
  const source = `${layers}\n${headBlock(quarantine)}${body}`;
  if (!minify) return { css: source, source, quarantine, facts };
  const min = await esbuild.transform(source, { loader: 'css', minify: true, target: TARGET, charset: 'utf8', logLevel: 'silent' });
  if (min.warnings.length) {
    const text = await esbuild.formatMessages(min.warnings, { kind: 'warning' });
    throw new Error(`build-embed: esbuild CSS warnings (treated as errors):\n${text.join('\n')}`);
  }
  const css = min.code.trimEnd();
  const errors = checkEmbedCss(css);
  if (errors.length) throw new Error(`build-embed: embed CSS static checks failed:\n  ${errors.join('\n  ')}`);
  return { css, source, quarantine, facts: analyzeCss(css) };
}

/** The icon subset module (td-icon.js `./registry.js` format): the listed icons + every alias that points at one. */
export function iconSubsetModule(names, root = ROOT) {
  const json = JSON.parse(readFileSync(join(root, 'src', 'icons', 'icons.json'), 'utf8'));
  const search = JSON.parse(readFileSync(join(root, 'src', 'icons', 'icons-search.json'), 'utf8'));
  const icons = {};
  for (const n of names) {
    if (!Object.hasOwn(json.icons, n)) throw new Error(`embed-manifest icons: "${n}" is not an icon of icons.json`);
    icons[n] = json.icons[n];
  }
  const aliases = Object.fromEntries(Object.entries(json.aliases ?? {}).filter(([, t]) => Object.hasOwn(icons, t)));
  const entries = Object.fromEntries(names.map((n) => [n, search.icons[n]]));
  const { registry } = buildIconOutputs({ icons, aliases }, { ...search, icons: entries });
  return { code: registry.replace('GENERATED by scripts/build-icons.mjs', 'GENERATED (embed icon subset) by scripts/build-embed.mjs'), icons: names, aliases };
}

/**
 * Build the artifact in memory. `minify: false` = the same bundle unminified (the size budget's "raw" figure only;
 * never written).
 */
export async function buildEmbed({ root = ROOT, minify = true } = {}) {
  const manifest = readEmbedManifest(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const { css, quarantine } = await buildEmbedCss(manifest, { minify });
  const icons = iconSubsetModule(manifest.icons, root);
  const tdIcon = join(root, 'src', 'icons', 'td-icon.js');
  const embedDir = join(root, 'src', 'embed');
  const plugin = {
    name: 'td-embed',
    setup(b) {
      b.onResolve({ filter: /^\.\/registry\.js$/ }, (a) => (a.importer === tdIcon ? { path: 'icons', namespace: 'td-embed' } : undefined));
      b.onResolve({ filter: /^\.\/css\.js$/ }, (a) => (dirname(a.importer) === embedDir ? { path: 'css', namespace: 'td-embed' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'td-embed' }, (a) => ({
        loader: 'js',
        resolveDir: embedDir,
        contents: a.path === 'icons' ? icons.code : `export const EMBED_CSS = ${JSON.stringify(css)};\n`,
      }));
    },
  };
  const res = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/embed/index.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify,
    target: TARGET,
    charset: 'utf8',
    legalComments: 'inline',
    banner: { js: `/*! td-embed — ${pkg.name} ${pkg.version} (MIT), GENERATED by scripts/build-embed.mjs. Icon geometry: Lucide (ISC), see THIRD_PARTY_NOTICES.md. */` },
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [plugin],
  });
  if (res.warnings.length) {
    const text = await esbuild.formatMessages(res.warnings, { kind: 'warning' });
    throw new Error(`build-embed: esbuild warnings (treated as errors):\n${text.join('\n')}`);
  }
  const inputs = Object.keys(res.metafile.inputs);
  const outside = inputs.filter((p) => !p.startsWith('td-embed:') && !p.startsWith('src/'));
  if (outside.length) throw new Error(`build-embed: bundle reads files outside src/: ${outside.join(', ')}`);
  if (inputs.includes('src/icons/registry.js')) throw new Error('build-embed: the full icon registry leaked into the bundle');
  const jsWithPlaceholder = res.outputFiles[0].text;
  if (!jsWithPlaceholder.includes(PLACEHOLDER)) throw new Error(`build-embed: placeholder ${PLACEHOLDER} not found in the bundle`);
  const hash = createHash('sha256').update(css + jsWithPlaceholder).digest('hex').slice(0, 10);
  const build = `${pkg.version}+${hash}`;
  let js = jsWithPlaceholder.split(PLACEHOLDER).join(build);
  if (!js.endsWith('\n')) js += '\n';
  return { js, css: `${css}\n`, build, quarantine, inputs, icons };
}

function distEmbedFiles(root) {
  const dir = join(root, 'dist', 'embed');
  if (!existsSync(dir)) return [];
  if (lstatSync(dir).isSymbolicLink()) throw new Error('dist/embed is a symbolic link — refusing to touch it');
  return readdirSync(dir).map((n) => `dist/embed/${n}`).sort();
}

const isMain = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  let out;
  try {
    out = await buildEmbed();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const files = [[OUT_JS, out.js], [OUT_CSS, out.css]];
  if (process.argv.includes('--check')) {
    const errors = [];
    for (const [rel, content] of files) {
      const cur = readGenerated(ROOT, join(ROOT, rel));
      if (!cur) errors.push(`${rel} is missing — run npm run build:embed`);
      else if (cur !== content) errors.push(`${rel} is stale — run npm run build:embed`);
    }
    for (const rel of distEmbedFiles(ROOT)) if (!files.some(([f]) => f === rel)) errors.push(`${rel} is not a build output — remove it`);
    if (errors.length) {
      console.error(`embed check failed:\n  ${errors.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`embed check OK: ${OUT_JS} (${out.build}), ${OUT_CSS}`);
  } else {
    for (const [rel, content] of files) writeGenerated(ROOT, join(ROOT, rel), content);
    console.log(`embed: ${OUT_JS} ${Buffer.byteLength(out.js)} bytes (gzip ${gzipSync(out.js, { level: 9 }).length}), ${OUT_CSS} ${Buffer.byteLength(out.css)} bytes; `
      + `build ${out.build}; ${out.quarantine.length} quarantined custom properties`);
  }
}
