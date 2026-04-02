/** @type {import('@storybook/web-components-vite').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.js'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
  ],
  framework: '@storybook/web-components-vite',
};

export default config;
