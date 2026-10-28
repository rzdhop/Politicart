import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook for @politikar/ui.
 *
 * Two audiences: a person browsing the system, and the design-sync converter,
 * which screenshots these stories to verify the preview cards it uploads. That
 * second audience is why every story shows its component in a realistic
 * context rather than in isolation -- several components in this system are
 * styled by descendant rules and look broken on their own.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  // Storybook reports anonymous usage telemetry by default. Off here: this is
  // a private repo and nothing about building a component library needs to
  // leave the machine.
  core: { disableTelemetry: true },
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The library's own Vite config is a library build; Storybook needs an app
  // build, so it uses its defaults rather than inheriting that.
  viteFinal: (viteConfig) => {
    // Drop the library entry: Storybook supplies its own.
    delete viteConfig.build?.lib;
    return viteConfig;
  },
};

export default config;
