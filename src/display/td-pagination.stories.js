import './td-pagination.js';

export default {
  title: 'Display/Pagination',
  tags: ['autodocs'],
  argTypes: {
    'total-items': { control: 'number' },
    'items-per-page': { control: 'number' },
    'current-page': { control: 'number' },
    'active-color': { control: 'color' },
    'item-label': { control: 'text' },
    'max-pages': { control: 'number' },
  },
};

export const Default = {
  render: (args) => `
    <td-pagination
      total-items="${args['total-items'] || 100}"
      items-per-page="${args['items-per-page'] || 10}"
      current-page="${args['current-page'] || 1}"
      ${args['active-color'] ? `active-color="${args['active-color']}"` : ''}
      ${args['item-label'] ? `item-label="${args['item-label']}"` : ''}
      ${args['max-pages'] ? `max-pages="${args['max-pages']}"` : ''}
    ></td-pagination>
  `,
  args: {
    'total-items': 100,
    'items-per-page': 10,
    'current-page': 1,
  },
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-pagination');
    if (el) {
      el.addEventListener('page-change', (e) => {
        console.log('page-change:', e.detail);
      });
    }
  },
};

export const ManyPages = {
  render: () => `
    <td-pagination
      total-items="500"
      items-per-page="10"
      current-page="25"
    ></td-pagination>
  `,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-pagination');
    if (el) {
      el.addEventListener('page-change', (e) => {
        console.log('page-change:', e.detail);
      });
    }
  },
};

export const FewPages = {
  render: () => `
    <td-pagination
      total-items="30"
      items-per-page="10"
      current-page="2"
    ></td-pagination>
  `,
};

export const CustomColor = {
  render: () => `
    <td-pagination
      total-items="200"
      items-per-page="10"
      current-page="5"
      active-color="#8b5cf6"
    ></td-pagination>
  `,
};

export const CustomLabel = {
  render: () => `
    <td-pagination
      total-items="150"
      items-per-page="20"
      current-page="3"
      item-label="bai viet"
    ></td-pagination>
  `,
};
