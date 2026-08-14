/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute base URL of the Al Asima API, no trailing slash, including the
   *  /api suffix — e.g. "http://localhost:3000/api" in dev. Unlike app/, this
   *  MUST be absolute: a Tauri window is never same-origin with the API, so a
   *  bare "/api" path would resolve against tauri://localhost. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
