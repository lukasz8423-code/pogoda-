/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** @deprecated Dead configuration - retained for external env compatibility */
  readonly VITE_OPENMETEO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
