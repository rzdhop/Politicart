// The build-time variables the game reads, declared by hand like three.d.ts:
// pulling in vite/client for one string would also type every asset import.
interface ImportMetaEnv {
  /** Origin of a remote game server, e.g. https://kr.onrender.com. Empty or unset: the page's own origin. */
  readonly VITE_POLITIKART_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
