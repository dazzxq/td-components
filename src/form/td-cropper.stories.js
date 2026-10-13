import { escapeHtml } from '../utils/escape.js';
import './td-cropper.js';
import '../styles/story-layout.css';
import './td-cropper.stories.css';

// v0.35.0 (plan v0.35.0-cropper M2) — <td-cropper>: coordinates only (no pixels are ever created). The image is the
// local fixture .storybook/public/cropper/crop-16x9.svg (1600 × 900).
export default {
  title: 'Form/Cropper',
  tags: ['autodocs'],
  argTypes: {
    alt: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

const IMG = '/cropper/crop-16x9.svg';
const esc = (v) => escapeHtml(String(v ?? ''));

/** Prints every crop / focal / image event into the story's <pre> (textContent only). */
const showEvents = (canvasElement) => {
  const out = canvasElement.querySelector('.sb-rep-pre');
  for (const type of ['crop-change', 'focal-change', 'image-ready', 'image-error']) {
    canvasElement.addEventListener(type, (e) => { out.textContent = `${type}: ${JSON.stringify(e.detail, null, 2)}`; });
  }
};

const story = (attrs, { narrow = false, img = IMG } = {}) => ({
  render: (args) => `<div class="sb-stack">
    <td-cropper class="sb-cropper${narrow ? ' sb-cropper--narrow' : ''}" src="${img}" alt="${esc(args.alt)}"${attrs}${args.disabled ? ' disabled' : ''}></td-cropper>
    <pre class="sb-rep-pre">(chưa có sự kiện)</pre></div>`,
  args: { alt: 'Ảnh minh hoạ', disabled: false },
  play: ({ canvasElement }) => showEvents(canvasElement),
});

/** Free box + the ratio presets (Tự do, 1:1, 4:3, 3:2, 16:9, 1.91:1); pixels known (natural-width / -height). */
export const FreeWithPresets = { name: 'Tự do + preset', ...story(' natural-width="1600" natural-height="900"') };

/** Locked 1.91:1 (Open Graph): no ratio group, 4 corner handles; starts at the largest 1.91:1 box. */
export const LockedOg = { name: 'Khoá 1.91:1 (OG)', ...story(' natural-width="1600" natural-height="900" aspect-ratio="1.91"') };

/** The focal-point tool: toggle it, click the image (or the box) to place it, drag it, arrows move it. */
export const FocalPoint = {
  name: 'Điểm trọng tâm',
  ...story(' natural-width="1600" natural-height="900" focal-point focal=\'{"v":1,"x":0.35,"y":0.6}\''),
};

/** No natural-*: the downloaded image is trusted, the result has NO `pixels` (percentages only). */
export const UnknownSize = { name: 'Không biết kích thước gốc', ...story(' crop=\'{"v":1,"x":0.1,"y":0.1,"width":0.5,"height":0.5}\'') };

/** natural-* say 1:1 but the preview is 16:9 (a pre-cropped preview) ⇒ error `ratio`, fail closed. */
export const RatioError = { name: 'Lỗi tỉ lệ', ...story(' natural-width="1000" natural-height="1000"') };

/** A 320px column: the toolbar goes to two rows (ratios scroll sideways), − / + icon only. */
export const NarrowColumn = { name: 'Cột hẹp 320px', ...story(' natural-width="1600" natural-height="900"', { narrow: true }) };

// v0.73.0 — mode="pan": the frame stands still in the middle of the stage, the image moves and zooms under it (the
// habit of avatar pickers). Same output as box mode; a zoom slider sits between the − and + buttons.

/** Pan, locked 1:1 (avatar): drag the image, wheel / pinch / slider / − + to zoom. */
export const PanSquare = { name: 'Avatar: khung cố định 1:1', ...story(' natural-width="1600" natural-height="900" mode="pan" aspect-ratio="1:1"') };

/** Pan + shape="circle": the frame is DRAWN round (display only — the output is still the bounding square). */
export const PanCircle = {
  name: 'Avatar tròn',
  ...story(' natural-width="1600" natural-height="900" mode="pan" aspect-ratio="1:1" shape="circle"'),
};

/** Pan without a lock: the ratio presets (no "Tự do" entry, 1:1 by default) change the shape of the frame. */
export const PanPresets = { name: 'Pan + preset tỉ lệ', ...story(' natural-width="1600" natural-height="900" mode="pan"') };

/** Pan on a 4000 × 3000 raster (manual check of a large image: drag and zoom stay smooth; the small face can fill the frame). */
export const PanLarge = {
  name: 'Pan: ảnh lớn 4000 × 3000',
  ...story(' natural-width="4000" natural-height="3000" mode="pan" aspect-ratio="1:1" shape="circle"', { img: '/cropper/crop-large.png' }),
};
