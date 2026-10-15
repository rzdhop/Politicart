import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NoteBanner } from './NoteBanner';

describe('NoteBanner', () => {
  it('renders the note class', () => {
    const { container } = render(<NoteBanner>Jeu au clavier.</NoteBanner>);
    expect(container.firstElementChild?.className).toBe('note');
    expect(container.firstElementChild?.textContent).toBe('Jeu au clavier.');
  });
});
