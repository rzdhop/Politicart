import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount anything a test rendered. Without this, a component left in the
// document can satisfy the next test's query and hide a real failure.
afterEach(() => {
  cleanup();
});
