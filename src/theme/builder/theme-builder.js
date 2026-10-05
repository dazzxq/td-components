/**
 * td-theme builder page (v0.42.0, plan N4) — the same generator + serializer as the CLI (`../index.js`), in the
 * browser, no Node. Relative imports only: works from any static server that serves the package folder.
 *
 * CSP-strict: the preview theme is a CONSTRUCTABLE stylesheet (adoptedStyleSheets, `@layer td.tokens`); every output
 * (CSS, JSON, diagnostics, pair table) is written with textContent; downloads use a Blob URL. Never `style=""`, never
 * innerHTML with input. User input only ever reaches generatePalette() (strict seed parser: hex / rgb, ≤ 64 chars);
 * the emitted CSS never contains it (seeds re-serialised as hex, the name whitelisted).
 *
 * Export rule (plan N4): with a mandatory AA failure the Download / Copy buttons stay disabled until "Xuất dù trượt AA"
 * is ticked; the exported file then starts with the same warning comment as `td-theme --allow-aa-failure`.
 */
import { generatePalette, toCss, toJson, formatDiagnostics, hasAaFailure, contrast, ThemeInputError } from '../index.js';
import '../../../index.js';
import { TdMenu } from '../../feedback/td-menu.js';
import { composite, parseColor } from '../color.js';

const SEEDS = ['bg', 'accent', 'surface', 'raisedSurface', 'controlSurface', 'success', 'warning', 'danger', 'info'];
const PREVIEW_NAME = 'tb-preview';
const HEX6 = /^#[0-9a-f]{6}$/i;

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const sheet = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

/** @type {ReturnType<typeof generatePalette>|null} */
let current = null;
let timer = 0;

function readForm() {
  const seeds = {};
  for (const k of SEEDS) {
    const v = /** @type {HTMLInputElement} */ ($(`tb-${k}`)).value.trim();
    if (v) seeds[k] = v;
  }
  const mode = /** @type {HTMLSelectElement} */ ($('tb-mode')).value === 'dark' ? 'dark' : 'light';
  const name = /** @type {HTMLInputElement} */ ($('tb-name')).value.trim();
  return { seeds, options: name ? { mode, name } : { mode } };
}

function setError(field, message) {
  for (const k of [...SEEDS, 'name']) {
    const input = $(`tb-${k}`);
    const err = $(`tb-${k}-err`);
    const on = k === field;
    input.setAttribute('aria-invalid', on ? 'true' : 'false');
    err.hidden = !on;
    err.textContent = on ? message : '';
  }
}

/** Pairs table: every mandatory pair, its worst background, ratio vs required (same maths as the generator). */
function renderPairs(result) {
  const body = $('tb-pairs');
  body.replaceChildren();
  const colour = (name) => {
    if (!name.includes(' over ')) return parseColor(result.tokens.get(name));
    const [top, base] = name.split(' over ');
    return composite(parseColor(result.tokens.get(top)), parseColor(result.tokens.get(base)));
  };
  for (const c of result.constraints) {
    const fg = parseColor(result.tokens.get(c.token));
    let worst = '';
    let ratio = Infinity;
    for (const n of c.against) {
      const r = contrast(fg, colour(n));
      if (r < ratio) { ratio = r; worst = n; }
    }
    const tr = document.createElement('tr');
    for (const [text, fail] of [[c.token, false], [worst, false], [ratio.toFixed(2), ratio < c.min], [String(c.min), false]]) {
      const td = document.createElement('td');
      td.textContent = text;
      if (fail) td.setAttribute('data-fail', '');
      tr.append(td);
    }
    body.append(tr);
  }
}

function render() {
  const { seeds, options } = readForm();
  let result;
  try {
    result = generatePalette(seeds, options);
  } catch (err) {
    if (err instanceof ThemeInputError) {
      setError(err.field, err.message);
      $('tb-summary').textContent = 'Dữ liệu chưa hợp lệ — sửa ô được đánh dấu.';
      $('tb-summary').setAttribute('data-state', 'fail');
      setExport(false);
      current = null;
      return;
    }
    throw err;
  }
  setError(null, '');
  current = result;
  // preview: the same palette under the preview scope's name (the scope is a theme scope like any site section)
  sheet.replaceSync(toCss({ ...result, name: PREVIEW_NAME }));
  const failing = hasAaFailure(result);
  const accept = /** @type {HTMLInputElement} */ ($('tb-accept'));
  $('tb-accept-row').hidden = !failing;
  if (!failing) accept.checked = false;
  $('tb-css').textContent = toCss(result, { acceptAaFailure: failing && accept.checked });
  $('tb-json').textContent = JSON.stringify(toJson(result), null, 1);
  const lines = formatDiagnostics(result);
  const list = $('tb-diags');
  list.replaceChildren(...result.diagnostics.map((d, i) => {
    const li = document.createElement('li');
    li.setAttribute('data-severity', d.severity);
    li.setAttribute('data-code', d.code);
    li.textContent = lines[i];
    return li;
  }));
  const errors = result.diagnostics.filter((d) => d.severity === 'error-AA').length;
  const summary = $('tb-summary');
  summary.textContent = errors
    ? `${errors} cặp bắt buộc trượt AA (dải chết: nền được giữ, chữ dùng cực đen / trắng tốt nhất). Scheme ${result.scheme}.`
    : `Mọi cặp bắt buộc đạt AA. Scheme ${result.scheme}.`;
  summary.setAttribute('data-state', errors ? 'fail' : 'ok');
  renderPairs(result);
  setExport(!failing || accept.checked);
  syncPickers();
}

function setExport(on) {
  for (const id of ['tb-download', 'tb-copy']) {
    const b = /** @type {HTMLButtonElement} */ ($(id));
    b.disabled = !on;
  }
}

/** Seed field → the token it resolves to (an empty field shows the generated value, never a black swatch). */
const RESOLVED = {
  bg: '--td-color-bg', accent: '--td-accent', surface: '--td-color-surface', raisedSurface: '--td-color-surface-raised',
  controlSurface: '--td-control-bg', success: '--td-color-success', warning: '--td-color-warning', danger: '--td-color-error',
  info: '--td-color-info',
};

function syncPickers() {
  for (const k of SEEDS) {
    const text = /** @type {HTMLInputElement} */ ($(`tb-${k}`));
    const pick = /** @type {HTMLInputElement} */ ($(`tb-${k}-pick`));
    const v = text.value.trim();
    const auto = current ? current.tokens.get(RESOLVED[k]) : null;
    const hex = HEX6.test(v) ? v.toLowerCase() : auto && HEX6.test(auto) ? auto : null;
    if (hex && pick.value !== hex) pick.value = hex;
    if (k !== 'bg' && k !== 'accent') text.placeholder = auto && HEX6.test(auto) ? `tự tính: ${auto}` : 'tự tính';
  }
}

function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(render, 120);
}

function exportCss() {
  if (!current) return null;
  const failing = hasAaFailure(current);
  const accept = /** @type {HTMLInputElement} */ ($('tb-accept')).checked;
  if (failing && !accept) return null; // never silently export a failing palette
  return toCss(current, { acceptAaFailure: failing && accept });
}

function status(text) {
  $('tb-status').textContent = text;
}

function bind() {
  const form = $('tb-form');
  form.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.type === 'color') {
      const k = t.id.replace(/^tb-|-pick$/g, '');
      const text = /** @type {HTMLInputElement} */ ($(`tb-${k}`));
      text.value = t.value;
    }
    schedule();
  });
  form.addEventListener('change', schedule);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('tb-accept').addEventListener('change', render);
  $('tb-download').addEventListener('click', () => {
    const css = exportCss();
    if (css === null) return;
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current && current.name ? `td-theme-${current.name}.css` : 'td-theme.css';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Đã tải về.');
  });
  $('tb-copy').addEventListener('click', async () => {
    const css = exportCss();
    if (css === null) return;
    try {
      await navigator.clipboard.writeText(css);
      status('Đã copy.');
    } catch {
      status('Trình duyệt không cho copy — chọn khung CSS bên dưới rồi copy tay.');
    }
  });
  // preview content that needs JS data
  const dd = /** @type {any} */ ($('tb-demo-dropdown'));
  dd.options = [{ value: 'a', label: 'Tin tức' }, { value: 'b', label: 'Sự kiện' }, { value: 'c', label: 'Thông báo' }];
  const table = /** @type {any} */ ($('tb-demo-table'));
  table.columns = [{ key: 'name', label: 'Tên' }, { key: 'state', label: 'Trạng thái' }, { key: 'date', label: 'Ngày' }];
  table.data = [
    { name: 'Bài viết A', state: 'Đã đăng', date: '05/10/2026' },
    { name: 'Bài viết B', state: 'Nháp', date: '04/10/2026' },
  ];
  const menuBtn = $('tb-demo-menu');
  menuBtn.addEventListener('click', () => {
    TdMenu.open(menuBtn, [{ label: 'Sửa', value: 'edit' }, { label: 'Nhân bản', value: 'dup' }, { label: 'Xoá', value: 'del', danger: true }]);
  });
}

bind();
render();
$('tb-boot').hidden = true;
document.documentElement.setAttribute('data-tb-ready', '');
