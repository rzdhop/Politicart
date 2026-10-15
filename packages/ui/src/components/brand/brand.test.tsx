import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tricolore } from './Tricolore';

describe('Tricolore', () => {
  it('renders exactly three stripes', () => {
    const { container } = render(<Tricolore />);
    const bar = container.firstElementChild;
    expect(bar?.className).toBe('tricolore');
    expect(bar?.querySelectorAll('i')).toHaveLength(3);
  });

  it('is hidden from assistive technology, being purely decorative', () => {
    const { container } = render(<Tricolore />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
