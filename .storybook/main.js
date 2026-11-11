/** @type {import('@storybook/web-components-vite').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.js'],
  // Storybook 10: controls / actions / viewport / backgrounds are built into core (no addon-essentials).
  addons: ['@storybook/addon-a11y'],
  framework: '@storybook/web-components-vite',
  staticDirs: ['./public'],
};

export default config;
