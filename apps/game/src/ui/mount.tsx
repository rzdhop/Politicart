import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

/** Mount the React screens into the shell's `#ui` element. Called once by game.js. */
export function mountUi(container: HTMLElement) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
