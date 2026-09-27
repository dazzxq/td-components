// The kit: td.css only (no Tailwind since 0.11.0).
import '../td.css';

/** @type {import('@storybook/web-components').Preview} */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
