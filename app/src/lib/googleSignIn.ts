/**
 * Google Identity Services (GIS) — loading the script and rendering the button.
 *
 * This module's entire job is to end up holding an ID token. It knows nothing
 * about our accounts; the token goes to customerAuth.ts, which posts it to the
 * backend where it is actually verified. Nothing decided on this side of the wire
 * is trusted — a token that survives the round trip is one Google signed.
 *
 * GIS has to be loaded from Google's own origin (they don't support bundling it),
 * so this is the one third-party script the site pulls in. The production CSP in
 * deploy/Caddyfile has matching allowances — script-src, frame-src, connect-src
 * and style-src for accounts.google.com. Change one and you must change the other,
 * or sign-in works locally (Vite serves no CSP) and dies on deploy.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

/** True when a Google client id is configured for this build. */
export function isGoogleSignInConfigured(): boolean {
  return Boolean(CLIENT_ID);
}

// ── Minimal typings for the bits of GIS we touch ────────────────────────────
// Hand-written rather than pulling @types/google.accounts in: this is the whole
// surface we use, and it stays readable next to the code that calls it.
interface CredentialResponse {
  /** The ID token (a JWT). The only field we care about. */
  credential?: string;
}

interface GsiButtonOptions {
  type: "standard";
  theme: "outline" | "filled_blue";
  size: "large";
  shape: "pill" | "rectangular";
  text: "signin_with" | "continue_with";
  locale: string;
  width?: number;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

// One in-flight load shared by every caller — the script tag must not be added
// twice, and two mounts racing would otherwise each append one.
let loadPromise: Promise<GoogleAccountsId> | null = null;

function loadGis(): Promise<GoogleAccountsId> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("Google sign-in loaded but is unavailable"));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      // Already on the page (a previous mount) — it may or may not have finished.
      if (window.google?.accounts?.id) ready();
      else {
        existing.addEventListener("load", ready, { once: true });
        existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => {
      // Let a later attempt retry from scratch instead of caching the failure
      // forever — this fails on a flaky network as often as a real block.
      loadPromise = null;
      reject(new Error("Google sign-in could not be loaded"));
    }, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Render Google's sign-in button into `container` and call `onToken` with the ID
 * token once the user completes the flow.
 *
 * Google's own button, not a lookalike: their branding terms require it, and it
 * is what carries the account chooser. It means the button's look is theirs, so
 * the surrounding page has to be designed to sit with it rather than restyle it.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  locale: string,
  onToken: (idToken: string) => void,
): Promise<void> {
  if (!CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID is not configured");

  const gis = await loadGis();

  gis.initialize({
    client_id: CLIENT_ID,
    callback: (response) => {
      if (response.credential) onToken(response.credential);
    },
    // No silent auto sign-in: landing on a page and being signed in without
    // having asked is a surprise, and it makes signing out feel broken because
    // the next navigation signs you straight back in.
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  gis.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    // Google localizes its own button copy; "ar" gives Arabic to match the site.
    locale,
  });
}

/**
 * Clear GIS's cached "this user is signed in" hint on sign-out.
 * Without it Google keeps offering the same account back, which reads as the
 * sign-out not having worked.
 */
export function clearGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
