import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every component must have a story.
 *
 * Stories are not decoration here: the design-sync converter screenshots them
 * to verify the preview cards it uploads, so a component without one ships to
 * Claude Design with no verified preview. This suite fails the moment a new
 * component lands without a story beside it, which is cheaper than noticing
 * during a sync hours later.
 */

const componentsDir = join(import.meta.dirname, '..', 'components');

/** Every `<Name>.tsx` under components/, excluding tests, stories and helpers. */
function componentFiles(): Array<{ group: string; name: string; dir: string }> {
  const out: Array<{ group: string; name: string; dir: string }> = [];
  for (const group of readdirSync(componentsDir)) {
    const dir = join(componentsDir, group);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.tsx')) continue;
      if (file.endsWith('.test.tsx') || file.endsWith('.stories.tsx')) continue;
      out.push({ group, name: file.replace(/\.tsx$/, ''), dir });
    }
  }
  return out;
}

const components = componentFiles();

describe('story coverage', () => {
  it('finds the component tree at all', () => {
    // Guards the glob: a wrong path would make every assertion below vacuous.
    expect(components.length).toBeGreaterThan(40);
  });

  it.each(components.map((c) => [`${c.group}/${c.name}`, c] as const))(
    '%s has a story file',
    (_label, component) => {
      const stories = join(component.dir, `${component.name}.stories.tsx`);
      expect(
        readdirSync(component.dir).includes(`${component.name}.stories.tsx`),
        `missing ${stories}`,
      ).toBe(true);
    },
  );

  it.each(components.map((c) => [`${c.group}/${c.name}`, c] as const))(
    '%s story declares the component and at least one export',
    (_label, component) => {
      const source = readFileSync(
        join(component.dir, `${component.name}.stories.tsx`),
        'utf8',
      );
      // `component:` is what ties a story to its component for the converter.
      expect(source).toContain(`component: ${component.name}`);
      expect(source).toMatch(/export const \w+: Story/);
    },
  );

  it('has a test file for every component group', () => {
    const groups = new Set(components.map((c) => c.group));
    for (const group of groups) {
      const files = readdirSync(join(componentsDir, group));
      expect(
        files.some((f) => f.endsWith('.test.tsx')),
        `no test file in components/${group}`,
      ).toBe(true);
    }
  });
});
