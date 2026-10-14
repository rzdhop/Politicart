import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdPreview } from './AdPreview';
import { AdminCard } from './AdminCard';
import { AdminGrid } from './AdminGrid';
import { ColorSwatch } from './ColorSwatch';
import { ColorsRow } from './ColorsRow';
import { Field } from './Field';
import { FileInput } from './FileInput';
import { LiveryThumb } from './LiveryThumb';
import { TextInput } from './TextInput';

describe('AdminGrid and AdminCard', () => {
  it('render their classes', () => {
    const { container } = render(
      <AdminGrid>
        <AdminCard />
      </AdminGrid>,
    );
    expect(container.firstElementChild?.className).toBe('admin');
    expect(container.querySelector('.admin > .card')).not.toBeNull();
  });

  it('keeps the card a div, not a button', () => {
    // It holds form controls, so it must not look or behave clickable.
    render(
      <AdminGrid>
        <AdminCard>contenu</AdminCard>
      </AdminGrid>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Field', () => {
  it('wraps its control in a real label, so the caption focuses the input', () => {
    render(
      <AdminGrid>
        <Field label="Nom">
          <TextInput defaultValue="Victor" />
        </Field>
      </AdminGrid>,
    );
    // Found by its label text without any id/htmlFor wiring.
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveProperty('value', 'Victor');
  });

  it('nests inside the admin grid, which is what styles it', () => {
    const { container } = render(
      <AdminGrid>
        <Field label="Nom">
          <TextInput />
        </Field>
      </AdminGrid>,
    );
    expect(container.querySelector('.admin label')).not.toBeNull();
    expect(container.querySelector('.admin input[type=text]')).not.toBeNull();
  });
});

describe('inputs', () => {
  it('TextInput is fixed to type=text, which is what the style is bound to', () => {
    const { container } = render(<TextInput />);
    expect(container.querySelector('input')?.getAttribute('type')).toBe('text');
  });

  it('ColorSwatch is a native colour input', () => {
    const { container } = render(<ColorSwatch defaultValue="#1f3a93" />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('color');
    expect(input.value).toBe('#1f3a93');
  });

  it('FileInput is a native file input', () => {
    const { container } = render(<FileInput accept="image/*" multiple />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('file');
    expect(input.multiple).toBe(true);
  });

  it('ColorsRow carries the colors class', () => {
    const { container } = render(<ColorsRow />);
    expect(container.firstElementChild?.className).toBe('colors');
  });
});

describe('LiveryThumb', () => {
  it('renders an image with the livery class', () => {
    const { container } = render(<LiveryThumb src="data:image/png;base64,AA" alt="" />);
    expect(container.querySelector('img')?.className).toBe('livery');
  });

  it('defaults alt to empty rather than omitting it', () => {
    // A missing alt is an accessibility defect; an empty one is a decision.
    const { container } = render(<LiveryThumb src="x.png" />);
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('accepts a real description when it stands alone', () => {
    render(<LiveryThumb src="x.png" alt="Livrée de Victor" />);
    expect(screen.getByAltText('Livrée de Victor')).toBeDefined();
  });
});

describe('AdPreview', () => {
  it('renders the strip and leaves its children alone', () => {
    const { container } = render(
      <AdPreview>
        <img src="a.png" alt="" />
        <img src="b.png" alt="" />
      </AdPreview>,
    );
    expect(container.firstElementChild?.className).toBe('ad-preview');
    expect(container.querySelectorAll('.ad-preview img')).toHaveLength(2);
  });

  it('works outside the admin grid, unlike the rest of the workshop', () => {
    const { container } = render(<AdPreview />);
    expect(container.firstElementChild?.className).toBe('ad-preview');
  });
});
