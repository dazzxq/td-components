import '../src/styles/tailwind.css';
// Token kit (reset-free; legacy Tailwind stories are unaffected — see test:csp:combined).
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
