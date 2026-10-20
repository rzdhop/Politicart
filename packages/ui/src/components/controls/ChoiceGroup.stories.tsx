import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ChoiceGroup } from './ChoiceGroup';

const WHEELS = [
  { value: 'classic', label: 'Classiques' },
  { value: 'chrome', label: 'Chromées' },
  { value: 'offroad', label: 'Tout-terrain' },
  { value: 'gold', label: 'Dorées' },
] as const;

type Wheel = (typeof WHEELS)[number]['value'];

const meta = {
  title: 'Controls/ChoiceGroup',
  component: ChoiceGroup<Wheel>,
  parameters: {
    docs: {
      description: {
        component:
          'One row of mutually exclusive chips under a gold caption. The picked chip fills gold; every chip keeps its size, so picking never reflows the row. Use it for a setting with a few named values, never for the action that moves the player forward — that is a primary Button.',
      },
    },
  },
  args: { label: 'Roues', options: WHEELS, value: 'classic', onChange: () => {} },
} satisfies Meta<typeof ChoiceGroup<Wheel>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AnotherPicked: Story = { args: { value: 'gold' } };

/** Two values read as a yes/no toggle. */
export const YesNo: Story = {
  render: () => (
    <ChoiceGroup label="Pontons latéraux" value="on" onChange={() => {}} options={[{ value: 'on', label: 'Oui' }, { value: 'off', label: 'Non' }]} />
  ),
};

/** Interactive: the chips wrap onto a second line when the column is narrow. */
export const Interactive: Story = {
  render: function Render() {
    const [value, setValue] = useState('none');
    return (
      <div style={{ width: 300 }}>
        <ChoiceGroup
          label="Autocollant"
          value={value}
          onChange={setValue}
          options={[
            { value: 'none', label: 'Aucun' },
            { value: 'tricolore', label: 'Tricolore' },
            { value: 'rosette', label: 'Cocarde' },
            { value: 'etoile', label: 'Étoile' },
            { value: 'marianne', label: 'Marianne' },
          ]}
        />
      </div>
    );
  },
};
