import './td-tabs.js';

export default {
  title: 'Display/Tabs',
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    'active-tab': { control: 'text' },
  },
};

export const Default = {
  render: (args) => `
    <td-tabs
      size="${args.size || 'md'}"
      ${args['active-tab'] ? `active-tab="${args['active-tab']}"` : ''}
    ></td-tabs>
  `,
  args: {
    size: 'md',
  },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
      { id: 'tab3', label: 'Tab 3' },
    ];
    el.onChange = (id) => console.log('Tab:', id);
  },
};

export const WithIcons = {
  render: (args) => `
    <td-tabs size="${args.size || 'md'}"></td-tabs>
  `,
  args: {
    size: 'md',
  },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'file', label: 'Upload file', icon: 'fas fa-upload' },
      { id: 'url', label: 'From URL', icon: 'fas fa-link' },
      { id: 'library', label: 'Library', icon: 'fas fa-photo-video' },
    ];
    el.onChange = (id) => console.log('Tab:', id);
  },
};

export const SmallSize = {
  render: () => `<td-tabs size="sm"></td-tabs>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
      { id: 'tab3', label: 'Tab 3' },
    ];
    el.onChange = (id) => console.log('Tab:', id);
  },
};

export const TwoTabs = {
  render: () => `<td-tabs size="md"></td-tabs>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'edit', label: 'Edit' },
      { id: 'preview', label: 'Preview' },
    ];
    el.onChange = (id) => console.log('Tab:', id);
  },
};
