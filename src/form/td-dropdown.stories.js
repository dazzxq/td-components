import './td-dropdown.js';

const sampleOptions = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' },
  { value: '4', label: 'Option 4' },
  { value: '5', label: 'Option 5' },
  { value: '6', label: 'Option 6' },
];

/**
 * Helper to set options on dropdown after render.
 * Options are complex data (arrays) and must be set via JS property per D-01.
 */
function setOptionsAfterRender(selector, options, extraSetup) {
  setTimeout(() => {
    const el = document.querySelector(selector);
    if (el) {
      el.options = options;
      if (extraSetup) extraSetup(el);
    }
  }, 0);
}

export default {
  title: 'Form/Dropdown',
  tags: ['autodocs'],
  argTypes: {
    placeholder: { control: 'text' },
    searchable: { control: 'boolean' },
    disabled: { control: 'boolean' },
    'allow-clear': { control: 'boolean' },
    'max-height': { control: 'number' },
  },
};

export const Default = {
  render: () => {
    setOptionsAfterRender('td-dropdown#dropdown-default', sampleOptions);
    return `
      <td-dropdown
        id="dropdown-default"
        placeholder="Select an option"
        searchable
        allow-clear
      ></td-dropdown>
    `;
  },
};

export const WithSearch = {
  render: () => {
    const manyOptions = Array.from({ length: 20 }, (_, i) => ({
      value: String(i + 1),
      label: `Item ${i + 1} - ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i % 5]}`,
    }));
    setOptionsAfterRender('td-dropdown#dropdown-search', manyOptions);
    return `
      <td-dropdown
        id="dropdown-search"
        placeholder="Search items..."
        searchable
        allow-clear
        max-height="6"
      ></td-dropdown>
    `;
  },
};

export const Disabled = {
  render: () => {
    setOptionsAfterRender('td-dropdown#dropdown-disabled', sampleOptions);
    return `
      <td-dropdown
        id="dropdown-disabled"
        placeholder="Cannot select"
        disabled
      ></td-dropdown>
    `;
  },
};

export const Preselected = {
  render: () => {
    setOptionsAfterRender('td-dropdown#dropdown-preselected', sampleOptions);
    return `
      <td-dropdown
        id="dropdown-preselected"
        placeholder="Select an option"
        value="3"
        searchable
        allow-clear
      ></td-dropdown>
    `;
  },
};

export const ClearButton = {
  render: () => {
    setOptionsAfterRender('td-dropdown#dropdown-clear', sampleOptions, (el) => {
      // Pre-select to show clear option
      el.setValue('2');
    });
    return `
      <td-dropdown
        id="dropdown-clear"
        placeholder="Select to see clear"
        allow-clear
        searchable
      ></td-dropdown>
    `;
  },
};
