#!/usr/bin/env node
/**
 * td-theme (v0.42.0, plan N3 / QĐ12–QĐ13) — generate a static theme CSS file from seed colours.
 *
 *   npx td-theme --bg '#ece5d8' --accent '#b3261e' --surface '#fff' > td-theme.css
 *
 * CSS → stdout (nothing else), human diagnostics → stderr (`--diagnostics=json`: one JSON document on stderr).
 * Exit codes: 0 ok · 1 a mandatory WCAG AA pair fails (the CSS is still printed, with a warning first line) — 0 with
 * `--allow-aa-failure` · 2 bad input / usage (no CSS) · 3 internal error (no CSS).
 * Never reads or writes a file (redirect stdout yourself); never echoes raw input (messages name the flag only).
 */
import { parseArgs } from 'node:util';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generatePalette, presetPalette, hasAaFailure, ThemeInputError, ALGORITHM_VERSION,
} from '../src/theme/palette.js';
import { THEME_TOKENS_VERSION } from '../src/theme/tokens.js';
import { toCss, toJson, formatDiagnostics } from '../src/theme/serialize.js';

const MAX_ARG = 64;

export const USAGE = `td-theme — generate a td-components theme (static CSS, @layer td.tokens)

Usage:
  td-theme --bg <colour> --accent <colour> [options] > td-theme.css
  td-theme --preset light|dark [--mode light|dark] [--name <name>] > td-theme.css

Seeds (#rgb, #rrggbb or rgb(r g b); opaque; at most ${MAX_ARG} characters):
  --bg <colour>               page background (required; never changed)
  --accent <colour>           brand accent (required)
  --surface <colour>          cards, tables (default: one step lighter than --bg)
  --raised-surface <colour>   popups, modal (default: = surface)
  --control-surface <colour>  fields, triggers (default: = raised; '#fff' forces white)
  --success / --warning / --danger / --info <colour>

Output:
  --mode light|dark           light: the base slot ':root, [data-td-theme]' (default)
                              dark: data-td-theme="dark" + the OS-dark branch of "auto"
  --name <name>               a named theme: data-td-theme="<name>" (a-z 0-9 -, not light / dark / auto)
  --preset light|dark         the kit's own values (no generation)
  --diagnostics=json          diagnostics as one JSON document on stderr (default: text lines)
  --allow-aa-failure          exit 0 even when a mandatory WCAG AA pair fails (warning line in the file)
  --version, --help

Exit: 0 ok · 1 mandatory AA failure (CSS still printed) · 2 bad input (no CSS) · 3 internal error (no CSS).
Load order: td.css → the generated file → site CSS.
`;

const OPTIONS = {
  bg: { type: 'string' },
  accent: { type: 'string' },
  surface: { type: 'string' },
  'raised-surface': { type: 'string' },
  'control-surface': { type: 'string' },
  success: { type: 'string' },
  warning: { type: 'string' },
  danger: { type: 'string' },
  info: { type: 'string' },
  mode: { type: 'string' },
  name: { type: 'string' },
  preset: { type: 'string' },
  diagnostics: { type: 'string' },
  'allow-aa-failure': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
};
const SEED_FLAGS = {
  bg: 'bg', accent: 'accent', surface: 'surface', 'raised-surface': 'raisedSurface', 'control-surface': 'controlSurface',
  success: 'success', warning: 'warning', danger: 'danger', info: 'info',
};

class UsageError extends Error {}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

/** Parse argv strictly (no positionals, no unknown flags, no repeated flag, every value capped). */
function parse(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false, tokens: true });
  } catch {
    // parseArgs messages quote the raw argument — never echo it (terminal escape sequences)
    throw new UsageError('unknown, malformed or incomplete option (see --help)');
  }
  const seen = new Set();
  for (const t of parsed.tokens) {
    if (t.kind !== 'option') continue;
    if (seen.has(t.name)) throw new UsageError(`--${t.name} given twice`);
    seen.add(t.name);
  }
  for (const [k, v] of Object.entries(parsed.values)) {
    if (typeof v === 'string' && v.length > MAX_ARG) throw new UsageError(`--${k}: longer than ${MAX_ARG} characters`);
  }
  return parsed.values;
}

/**
 * Run the CLI. Returns the exit code; writes at most one CSS document to `io.stdout`.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): unknown }, stderr: { write(s: string): unknown } }} [io]
 * @param {{ generatePalette?: Function, presetPalette?: Function }} [deps] (tests inject failures here)
 */
export function run(argv, io = { stdout: process.stdout, stderr: process.stderr }, deps = {}) {
  const gen = deps.generatePalette || generatePalette;
  const pre = deps.presetPalette || presetPalette;
  let json = false;
  try {
    const v = parse(argv);
    if (v.diagnostics !== undefined && v.diagnostics !== 'json' && v.diagnostics !== 'text') {
      throw new UsageError('--diagnostics: json or text');
    }
    json = v.diagnostics === 'json';
    if (v.help) { io.stdout.write(USAGE); return 0; }
    if (v.version) {
      io.stdout.write(`td-theme ${packageVersion()} (palette algorithm ${ALGORITHM_VERSION}, THEME_TOKENS v${THEME_TOKENS_VERSION})\n`);
      return 0;
    }
    const options = {};
    if (v.mode !== undefined) options.mode = v.mode;
    if (v.name !== undefined) options.name = v.name;
    let result;
    if (v.preset !== undefined) {
      const seedFlags = Object.keys(SEED_FLAGS).filter((f) => v[f] !== undefined);
      if (seedFlags.length) throw new UsageError(`--preset cannot be combined with --${seedFlags[0]}`);
      result = pre(v.preset, options);
    } else {
      const seeds = {};
      for (const [flag, key] of Object.entries(SEED_FLAGS)) if (v[flag] !== undefined) seeds[key] = v[flag];
      result = gen(seeds, options);
    }
    const failing = hasAaFailure(result);
    const allow = !!v['allow-aa-failure'];
    const css = toCss(result, { acceptAaFailure: allow });
    const code = failing && !allow ? 1 : 0;
    // everything is computed before the first write: an internal error never leaves half an output behind
    let report;
    if (json) report = `${JSON.stringify({ ...toJson(result), exitCode: code })}\n`;
    else {
      report = formatDiagnostics(result).map((line) => `td-theme: ${line}\n`).join('');
      if (failing) {
        report += allow
          ? 'td-theme: mandatory WCAG AA failures ACCEPTED (--allow-aa-failure); the file starts with a warning comment\n'
          : 'td-theme: mandatory WCAG AA failures — exit 1 (the background is kept; see the diagnostics above)\n';
      }
    }
    io.stdout.write(css);
    io.stderr.write(report);
    return code;
  } catch (err) {
    if (err instanceof UsageError || err instanceof ThemeInputError) {
      const message = err.message;
      if (json) io.stderr.write(`${JSON.stringify({ error: { code: 'TD_THEME_INPUT', field: err.field || null, message } })}\n`);
      else io.stderr.write(`td-theme: ${message}\nRun td-theme --help for usage.\n`);
      return 2;
    }
    const name = err && typeof err.name === 'string' ? err.name : 'Error';
    if (json) io.stderr.write(`${JSON.stringify({ error: { code: 'TD_THEME_INTERNAL', message: name } })}\n`);
    else io.stderr.write(`td-theme: internal error (${name}) — please report it with the command line you used\n`);
    return 3;
  }
}

let isMain = false;
try {
  isMain = !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
} catch { /* not run directly */ }
if (isMain) process.exitCode = run(process.argv.slice(2));
