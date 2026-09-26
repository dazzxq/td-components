import './td-icon-element.js';
import { listIcons } from './td-icon.js';

export default {
  title: 'Foundations/Icons',
  argTypes: { size: { control: 'inline-radio', options: ['s', 'm', 'l', '32'] } },
  args: { size: 'm' },
};

/** Every registered icon. Add icons in src/icons/icons.json (core) or registerIcons() (site). */
export const Gallery = {
  render: ({ size }) => `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px;font:13px var(--td-font-sans);color:var(--td-color-text)">
      ${listIcons().map((n) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px;border:1px solid var(--td-color-border);border-radius:12px">
          <td-icon name="${n}" size="${size}"></td-icon><code>${n}</code>
        </div>`).join('')}
    </div>`,
};
