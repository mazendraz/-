/**
 * Turn a server-supplied image/media reference into something React Native can
 * actually load.
 *
 * ── Why this is needed at all ────────────────────────────────────────────────
 * The API stores media as EITHER an absolute URL (Supabase Storage — what every
 * admin upload produces) OR a site-root-relative path like "/img/seed-15.jpg"
 * (the seeded catalogue, and any legacy record). A browser resolves the second
 * form against the page's own origin for free, so the website never had to
 * think about it. React Native has no origin: `<Image source={{uri:"/img/x.jpg"}}>`
 * is not a resolvable URI, and RN fails it SILENTLY — no error, no warning,
 * just a permanently blank box. Every seeded company logo/cover in the app was
 * blank for exactly this reason.
 *
 * ── What it resolves against ────────────────────────────────────────────────
 * In production the deployment is single-origin (see deploy/Caddyfile): the
 * same host serves the SPA — and therefore /img/* out of app/dist — at "/" and
 * proxies the backend at "/api/*". So stripping the "/api/v1" suffix off
 * EXPO_PUBLIC_API_URL yields precisely the origin that serves these paths, and
 * no extra configuration is needed for a real build.
 *
 * Local development is the case that DOESN'T hold: there the API is a Next.js
 * server on :3000 (whose own public/ has no img/) while the images are served
 * by the Vite dev server on :5173. The two are split across ports, so the
 * derived origin is wrong. EXPO_PUBLIC_ASSET_URL exists for that case — point
 * it at the running website dev server and relative paths resolve again.
 */

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
const ASSET_OVERRIDE = (process.env.EXPO_PUBLIC_ASSET_URL ?? "").trim().replace(/\/$/, "");

/**
 * The origin that serves root-relative media. Explicit override wins; otherwise
 * derive it from the API URL by dropping a trailing "/api/…" segment, which is
 * what makes the same-origin production deploy work with zero config.
 */
function assetBase(): string {
  if (ASSET_OVERRIDE) return ASSET_OVERRIDE;
  if (!API_URL) return "";
  return API_URL.replace(/\/api(\/v\d+)?$/, "");
}

/**
 * Resolve one media reference for use as an `<Image source={{ uri }}>`.
 *
 * Returns `undefined` — never an unusable string — when there is nothing
 * loadable, so callers can branch on it and render a real placeholder instead
 * of handing RN a URI that will silently fail.
 */
export function assetUri(ref: string | null | undefined): string | undefined {
  const value = ref?.trim();
  if (!value) return undefined;

  // Already loadable as-is: remote URLs, inline data/blob URIs, and the
  // file:// paths an image picker hands back.
  if (/^(https?:|data:|blob:|file:)/i.test(value)) return value;

  // Root-relative ("/img/seed-15.jpg") — the case this module exists for.
  if (value.startsWith("/")) {
    const base = assetBase();
    return base ? `${base}${value}` : undefined;
  }

  // Anything else (a bare filename, a relative path) has no defined meaning
  // against any origin we know — treat it as absent rather than guessing.
  return undefined;
}

/** Convenience for the many `cover || logo` call sites: first ref that resolves. */
export function firstAssetUri(...refs: (string | null | undefined)[]): string | undefined {
  for (const ref of refs) {
    const uri = assetUri(ref);
    if (uri) return uri;
  }
  return undefined;
}

/**
 * Is this media reference a video rather than a photo?
 *
 * Mirrors the website's `isVideoUrl` (app/src/lib/image.ts) exactly: an
 * extension check with the query string ignored. Gallery videos are stored
 * as uploaded (there is no transcoding step anywhere in the repo), so the
 * upload's own extension is a reliable signal.
 *
 * The gallery is a single `string[]` of mixed photos and videos, and RN's
 * image components render a video URI as a permanently blank box — so every
 * place that maps over gallery items has to branch on this.
 */
export function isVideoUrl(ref: string | null | undefined): boolean {
  const path = (ref ?? "").split(/[?#]/)[0];
  return /\.(mp4|webm|mov)$/i.test(path);
}
