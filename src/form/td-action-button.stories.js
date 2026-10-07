import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-action-button.js';

/** The 23 dcms2 presets + the 3 kit presets of v0.56.0 (TdActionButton.presets) — listed so the story renders without a DOM. */
const PRESETS = ['edit', 'view', 'review', 'remove', 'unpublish', 'withdraw', 'return', 'log', 'versions', 'password', 'reset',
  'open', 'copy', 'delete', 'download', 'moveup', 'movedown', 'publish', 'send-to-publish', 'submit', 'claim', 'release',
  'force-release', 'archive', 'restore', 'discontinue'];
const pick = (v, list, def) => (list.includes(v) ? v : def);

export default {
  title: 'Form/ActionButton',
  tags: ['autodocs'],
  argTypes: {
    action: { control: 'select', options: PRESETS },
    tone: { control: 'select', options: ['', 'standard', 'warning', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    label: { control: 'text' },
    icon: { control: 'text' },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `
    <td-action-button
      action="${escapeHtml(String(args.action || 'edit'))}"
      size="${escapeHtml(pick(args.size, ['sm', 'md', 'lg'], 'md'))}"
      ${args.tone ? `tone="${escapeHtml(String(args.tone))}"` : ''}
      ${args.label ? `label="${escapeHtml(String(args.label))}"` : ''}
      ${args.icon ? `icon="${escapeHtml(String(args.icon))}"` : ''}
      ${args.disabled ? 'disabled' : ''}
      ${args.loading ? 'loading' : ''}
    ></td-action-button>
  `,
  args: { action: 'edit', size: 'md', tone: '', label: '', icon: '', disabled: false, loading: false },
};

/** Every preset (hover / focus → tooltip = the label). */
export const AllPresets = {
  render: () => `<div class="td-action-group">${PRESETS.map((a) => `<td-action-button action="${a}"></td-action-button>`).join('')}</div>`,
};

/** Three tones × three sizes (32 / 36 / 40 px; 44 × 44 on touch). */
export const TonesAndSizes = {
  render: () => ['sm', 'md', 'lg'].map((size) => `<div class="td-action-group">${['standard', 'warning', 'danger']
    .map((tone) => `<td-action-button action="edit" tone="${tone}" size="${size}"></td-action-button>`).join('')}</div>`).join(''),
};

/** A table row toolbar like dcms2 `ActionButtons.generate([...])`: link, disabled, custom preset (icon + label). */
export const RowActions = {
  render: () => `
    <div class="td-action-group">
      <td-action-button action="view" href="#bai-viet-1"></td-action-button>
      <td-action-button action="edit"></td-action-button>
      <td-action-button action="versions"></td-action-button>
      <td-action-button action="pin-top" icon="star" label="Ghim lên đầu"></td-action-button>
      <td-action-button action="delete" disabled></td-action-button>
    </div>
  `,
};

/** v0.56.0: product / inventory row — archive, restore (out of the archive), discontinue (reversible → warning). */
export const InventoryActions = {
  render: () => `
    <div class="td-action-group">
      <td-action-button action="edit"></td-action-button>
      <td-action-button action="archive"></td-action-button>
      <td-action-button action="restore"></td-action-button>
      <td-action-button action="discontinue"></td-action-button>
      <td-action-button action="discontinue" label="Ngừng bán"></td-action-button>
    </div>
  `,
};
