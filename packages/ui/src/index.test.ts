import { describe, expect, it } from 'vitest';

import * as ui from './index';

// Stage 1 is scaffold only, so this suite guards the scaffold itself: that the
// package entry point resolves, that it is importable under the build's module
// settings, and that the version it advertises matches package.json. Later
// stages add one suite per component group alongside the components.
describe('@kart-republique/ui entry point', () => {
  it('resolves and exports a version', () => {
    expect(ui.version).toBe('0.1.0');
  });

  it('exports the version as a string, not a number', () => {
    // Guards against a careless edit turning "0.1.0" into 0.1, which would
    // silently change the public contract.
    expect(typeof ui.version).toBe('string');
  });
});
