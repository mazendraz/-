/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Al Assema REST API — no trailing slash. Leave blank for mock/localStorage mode. */
  readonly VITE_API_URL: string;
  /** Optional static API key sent as X-Api-Key header */
  readonly VITE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
