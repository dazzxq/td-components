import './td-steps.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Steps',
  tags: ['autodocs'],
};

const IMPORT = [
  { label: 'Tải tệp', description: 'nhap-kho-10-2026.xlsx' },
  { label: 'Kiểm tra dữ liệu', description: 'Đã đọc 1.250 dòng' },
  { label: 'Xem trước' },
  { label: 'Nhập' },
  { label: 'Hoàn tất' },
];

/** Horizontal, 5 steps, the 3rd is current (keys = positions "1"…"5"). */
export const Horizontal = {
  render: () => '<td-steps id="st-h" current="3"></td-steps>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#st-h').steps = IMPORT;
  },
};

/** Vertical with descriptions. */
export const Vertical = {
  render: () => '<td-steps id="st-v" orientation="vertical" current="2"></td-steps>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#st-v').steps = IMPORT;
  },
};

/** The import failed at step 2: error shape on the current step (still aria-current), message as description. */
export const ErrorAtStep2 = {
  render: () => '<td-steps id="st-err" current="2"></td-steps>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#st-err').steps = IMPORT.map((s, i) => (i === 1
      ? { ...s, state: 'error', description: 'Dòng 12: thiếu IMEI' } : s));
  },
};

/** navigation="back": earlier steps are buttons → `step-select`; the APP sets `current` (here: at once). */
export const ClickBack = {
  render: () => '<div><td-steps id="st-back" current="4" navigation="back"></td-steps><p class="sb-note" id="st-out"></p></div>',
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#st-back');
    const out = canvasElement.querySelector('#st-out');
    el.steps = IMPORT;
    el.addEventListener('step-select', (e) => {
      out.textContent = `step-select: ${e.detail.key}`;
      el.setAttribute('current', e.detail.key);
    });
  },
};

/* td-steps is an inline-size container: it takes its width from the parent (no shrink-to-fit wrapper). */

/** 320px column: compact (markers + "Bước n/N: nhãn"); the second one opts into the vertical layout. */
export const Narrow = {
  render: () => `<div><div class="sb-narrow"><td-steps id="st-n1" current="2"></td-steps></div>
    <div class="sb-narrow"><td-steps id="st-n2" current="2" narrow="vertical"></td-steps></div></div>`,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#st-n1').steps = IMPORT;
    canvasElement.querySelector('#st-n2').steps = IMPORT;
  },
};
