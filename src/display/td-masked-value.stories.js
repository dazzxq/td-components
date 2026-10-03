import { escapeHtml } from '../utils/escape.js';
import './td-masked-value.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Masked value',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    masked: { control: 'text' },
    duration: { control: 'number' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const int = (v) => (Number.isInteger(Number(v)) ? String(Number(v)) : '30');

/** A fake endpoint: the real app checks permission / 2FA / purpose code and audits, then returns the value. */
const fakeEndpoint = (value, ms = 600) => ({ signal }) => new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve(value), ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
});

/** Customer phone: "Hiện" → the hook → shown, re-masked after `duration` seconds (or on a second press). */
export const Phone = {
  render: (args) => `<div class="sb-row"><td-masked-value label="${esc(args.label)}" masked="${esc(args.masked)}" duration="${int(args.duration)}"></td-masked-value></div>`,
  args: { label: 'SĐT khách', masked: '09xx xxx 123', duration: 10 },
  play: ({ canvasElement }) => { canvasElement.querySelector('td-masked-value').reveal = fakeEndpoint('0912 345 123'); },
};

/** IMEI with a copy button while revealed (`copyable` → a sensitive td-copy, removed with the value). */
export const ImeiCopyable = {
  render: (args) => `<div class="sb-row"><td-masked-value label="${esc(args.label)}" masked="${esc(args.masked)}" copyable></td-masked-value></div>`,
  args: { label: 'IMEI', masked: '35xxxxxxxxx1234' },
  play: ({ canvasElement }) => { canvasElement.querySelector('td-masked-value').reveal = fakeEndpoint('356789012341234'); },
};

/** Cost price in a table cell; the page-wide hook reads `element.dataset.id` (PHP pages set it once). */
export const CostPriceStaticHook = {
  render: (args) => `<div class="sb-stack">
    <div class="sb-row">Giá vốn SP-1: <td-masked-value data-id="sp-1" label="${esc(args.label)}" masked="***"></td-masked-value></div>
    <div class="sb-row">Giá vốn SP-2: <td-masked-value data-id="sp-2" label="${esc(args.label)}" masked="***"></td-masked-value></div></div>`,
  args: { label: 'giá vốn' },
  play: () => {
    const prices = { 'sp-1': '12.500.000 ₫', 'sp-2': '8.900.000 ₫' };
    customElements.get('td-masked-value').reveal = ({ element, signal }) => fakeEndpoint(prices[element.dataset.id] ?? null)({ signal });
  },
};

/** The endpoint refuses (no permission): "Không hiện được …" announced, `reveal-error { kind: 'rejected' }`. */
export const RevealError = {
  render: (args) => `<div class="sb-stack"><td-masked-value label="${esc(args.label)}" masked="${esc(args.masked)}"></td-masked-value>
    <p class="sb-note" id="mv-err">(chưa có reveal-error)</p></div>`,
  args: { label: 'SĐT khách', masked: '09xx xxx 123' },
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-masked-value');
    el.reveal = () => Promise.reject(new Error('403'));
    el.addEventListener('reveal-error', (e) => { canvasElement.querySelector('#mv-err').textContent = `reveal-error ${JSON.stringify(e.detail)}`; });
  },
};

/** php/td.php `td_masked_value('09xx xxx 123', ['label' => 'SĐT khách'])` — adopted in place (masked-value@1). */
export const Ssr = {
  render: (args) => `<div class="sb-row"><td-masked-value data-td-ssr="masked-value@1" class="td-masked" masked="${esc(args.masked)}" label="${esc(args.label)}">`
    + `<span class="td-masked__text" translate="no">${esc(args.masked)}</span>`
    + `<button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="Hiện ${esc(args.label)}" data-tooltip="Hiện ${esc(args.label)}">`
    + '<span class="td-masked__icon" data-td-icon="eye" aria-hidden="true"></span></button>'
    + '<span class="td-sr-only" role="status"></span></td-masked-value></div>',
  args: { label: 'SĐT khách', masked: '09xx xxx 123' },
  play: ({ canvasElement }) => { canvasElement.querySelector('td-masked-value').reveal = fakeEndpoint('0912 345 123'); },
};
