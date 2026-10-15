import type { Meta, StoryObj } from '@storybook/react-vite';

import { Disclaimer } from './Disclaimer';

const meta = {
  title: 'Typography/Disclaimer',
  component: Disclaimer,
  parameters: {
    docs: {
      description: {
        component:
          'Small muted print, capped at a 60-character measure: text that has to be present but must not compete with the controls.',
      },
    },
  },
} satisfies Meta<typeof Disclaimer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The game's standing fiction notice. */
export const Default: Story = {
  args: {
    children:
      'Toute ressemblance avec des personnalités existantes serait purement électorale. Personnages, partis et scandales sont fictifs. Trois tours, cinq adversaires, aucune cohabitation.',
  },
};

/** The workshop uses a wider measure for its explanatory copy. */
export const Wide: Story = {
  args: {
    style: { maxWidth: '70ch' },
    children:
      'Renommez les candidat·es, changez leurs couleurs, ajoutez une livrée et vos propres affiches de campagne. Les réglages sont gardés dans ce navigateur.',
  },
};
