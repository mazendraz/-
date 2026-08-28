// Talking back to Apple: the ES256 client secret, the authorization-code
// exchange, and the revocation call that guideline 5.1.1(v) requires.
//
// Two things are worth pinning down here, and they pull in opposite directions.
//
// The client secret must be EXACTLY right — Apple rejects it wholesale
// otherwise, and the failure surfaces only against the live endpoint, which no
// test can reach. So every claim is asserted against Apple's documented layout,
// and the signature is verified with the real public key rather than trusted.
//
// Everything around it must be exactly WRONG-tolerant. A slow Apple must not
// fail a sign-in, and — the one that actually matters — must not block an
// account deletion. So each failure mode is exercised for its non-throwing
// return rather than for an error.
//
// `fetch` is stubbed; nothing here reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from "jose";

// A real P-256 pair, which is what Apple issues for Sign in with Apple. ES256
// is not a choice here — it is the only algorithm the endpoint accepts.
const keys = await generateKeyPair("ES256", { extractable: true });
const PRIVATE_KEY_PEM = await exportPKCS8(keys.privateKey);

const TEAM_ID = "SS923F3FW8";
const KEY_ID = "ABCD123456";
const BUNDLE_ID = "com.alassema.client";
const SERVICES_ID = "com.alassema.web";

const {
  appleClientSecret,
  exchangeAppleAuthorizationCode,
  isAppleServerAuthConfigured,
  primaryAppleClientId,
  revokeAppleRefreshToken,
} = await import("@/lib/services/appleServerAuth.service");

/** Configure a fully working deploy. Individual tests take pieces away. */
function configure(): void {
  vi.stubEnv("APPLE_TEAM_ID", TEAM_ID);
  vi.stubEnv("APPLE_KEY_ID", KEY_ID);
  vi.stubEnv("APPLE_PRIVATE_KEY", PRIVATE_KEY_PEM);
  vi.stubEnv("APPLE_CLIENT_IDS", `${BUNDLE_ID}, ${SERVICES_ID}`);
}

function stubFetch(impl: (url: string, init: RequestInit) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => impl(url, init)),
  );
}

/** The form body a stubbed fetch received, as a plain object. */
function sentForm(): Record<string, string> {
  const call = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
    .mock.calls[0]!;
  return Object.fromEntries(new URLSearchParams(String(call[1].body)));
}

beforeEach(() => {
  configure();
  // Keeps the deliberate failure paths from printing warnings through the run.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("is configured only when all three key coordinates are present", () => {
    expect(isAppleServerAuthConfigured()).toBe(true);

    for (const missing of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]) {
      configure();
      vi.stubEnv(missing, "");
      expect(isAppleServerAuthConfigured()).toBe(false);
    }
  });

  it("is INDEPENDENT of APPLE_CLIENT_IDS, which sign-in uses", () => {
    // The two halves are separately configurable on purpose: a deploy can verify
    // Apple tokens (public keys, no secret) without being able to revoke them.
    // Conflating them would make a missing .p8 break sign-in itself.
    vi.stubEnv("APPLE_CLIENT_IDS", "");
    expect(isAppleServerAuthConfigured()).toBe(true);
  });
});

describe("the ES256 client secret", () => {
  it("carries exactly the claims Apple documents", async () => {
    const secret = await appleClientSecret(BUNDLE_ID);

    // Verified with the PUBLIC key — proves the private key actually signed it,
    // rather than trusting our own decode of our own output.
    const { payload } = await jwtVerify(secret, keys.publicKey, {
      issuer: TEAM_ID,
      audience: "https://appleid.apple.com",
    });

    // `sub` is the client_id. Apple rejects the exchange when it does not match
    // the client the code was issued to — the one claim people get wrong.
    expect(payload.sub).toBe(BUNDLE_ID);
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
  });

  it("puts the Key ID in the HEADER, where Apple looks for it", async () => {
    // `kid` in the payload would be silently ignored and every call would 400.
    const header = decodeProtectedHeader(await appleClientSecret(BUNDLE_ID));
    expect(header.kid).toBe(KEY_ID);
    expect(header.alg).toBe("ES256");
  });

  it("expires well inside Apple's six-month ceiling", async () => {
    const { payload } = await jwtVerify(await appleClientSecret(BUNDLE_ID), keys.publicKey);
    const lifetime = payload.exp! - payload.iat!;
    expect(lifetime).toBeGreaterThan(0);
    // Minted per request and discarded, so it only has to outlive one HTTP call.
    expect(lifetime).toBeLessThanOrEqual(15 * 60);
  });

  it("signs for whichever client it is given, never a hardcoded one", async () => {
    const { payload } = await jwtVerify(
      await appleClientSecret(SERVICES_ID),
      keys.publicKey,
    );
    expect(payload.sub).toBe(SERVICES_ID);
  });

  it("accepts a private key stored with escaped newlines, as a .env must hold it", async () => {
    // A .p8 is a multi-line PEM and a .env file is one line per value. The
    // un-escaping is the only reason an operator can paste it in at all.
    vi.stubEnv("APPLE_PRIVATE_KEY", PRIVATE_KEY_PEM.replace(/\n/g, "\\n"));
    await expect(appleClientSecret(BUNDLE_ID)).resolves.toBeTypeOf("string");
  });

  it("throws when unconfigured — reaching it without a key is a caller bug", async () => {
    vi.stubEnv("APPLE_PRIVATE_KEY", "");
    await expect(appleClientSecret(BUNDLE_ID)).rejects.toThrow(/unconfigured/i);
  });
});

describe("authorization code exchange", () => {
  it("returns the refresh token and sends a correctly-formed request", async () => {
    stubFetch(() => Response.json({ refresh_token: "r2.apple-refresh" }));

    await expect(exchangeAppleAuthorizationCode("code-123", BUNDLE_ID)).resolves.toBe(
      "r2.apple-refresh",
    );

    const form = sentForm();
    expect(form.grant_type).toBe("authorization_code");
    expect(form.code).toBe("code-123");
    expect(form.client_id).toBe(BUNDLE_ID);
    expect(form.client_secret).toBeTruthy();
  });

  it("signs the client secret for the SAME client the code belongs to", async () => {
    stubFetch(() => Response.json({ refresh_token: "r2.x" }));
    await exchangeAppleAuthorizationCode("code-123", SERVICES_ID);

    // A mismatch between client_id and the secret's `sub` is rejected by Apple
    // and by nothing else — it would pass every local check and fail in prod.
    const { payload } = await jwtVerify(sentForm().client_secret!, keys.publicKey);
    expect(payload.sub).toBe(SERVICES_ID);
  });

  it("returns null — never throws — when Apple rejects the code", async () => {
    // An expired or reused code is routine. The customer is already signed in on
    // the strength of the identity token by the time this runs.
    stubFetch(() => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(exchangeAppleAuthorizationCode("stale", BUNDLE_ID)).resolves.toBeNull();
  });

  it("returns null when the network fails outright", async () => {
    stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    await expect(exchangeAppleAuthorizationCode("code-123", BUNDLE_ID)).resolves.toBeNull();
  });

  it("returns null when Apple answers 200 with no refresh_token", async () => {
    // Happens when the code was already redeemed. The shape is valid JSON, so
    // only an explicit check catches it.
    stubFetch(() => Response.json({ access_token: "a", id_token: "b" }));
    await expect(exchangeAppleAuthorizationCode("code-123", BUNDLE_ID)).resolves.toBeNull();
  });

  it("does not call Apple at all when the deploy has no key", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "");
    stubFetch(() => Response.json({ refresh_token: "r2.x" }));

    await expect(exchangeAppleAuthorizationCode("code-123", BUNDLE_ID)).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("revocation", () => {
  it("posts the token with the right hint and reports success", async () => {
    // Apple answers 200 with an EMPTY body — not JSON. Parsing it would throw.
    stubFetch(() => new Response(null, { status: 200 }));

    await expect(revokeAppleRefreshToken("r2.token", BUNDLE_ID)).resolves.toBe(true);

    const form = sentForm();
    expect(form.token).toBe("r2.token");
    expect(form.token_type_hint).toBe("refresh_token");
    expect(form.client_id).toBe(BUNDLE_ID);
    expect(form.client_secret).toBeTruthy();
  });

  it("returns false rather than throwing when Apple rejects the token", async () => {
    // An already-revoked token 400s. Nothing to retry, and the account is being
    // deleted either way — so this must never propagate.
    stubFetch(() => Response.json({ error: "invalid_request" }, { status: 400 }));
    await expect(revokeAppleRefreshToken("r2.stale", BUNDLE_ID)).resolves.toBe(false);
  });

  it("returns false rather than throwing when Apple is unreachable", async () => {
    // THE case this whole fail-soft design exists for: a customer pressing
    // "delete my account" must not be told it failed because Apple is down.
    stubFetch(() => {
      throw new Error("ETIMEDOUT");
    });
    await expect(revokeAppleRefreshToken("r2.token", BUNDLE_ID)).resolves.toBe(false);
  });

  it("returns false without calling Apple when unconfigured", async () => {
    vi.stubEnv("APPLE_KEY_ID", "");
    stubFetch(() => new Response(null, { status: 200 }));

    await expect(revokeAppleRefreshToken("r2.token", BUNDLE_ID)).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("primaryAppleClientId", () => {
  it("is the FIRST entry — the convention .env.example documents", () => {
    // Deletion happens long after the identity token that carried the real `aud`
    // is gone, so the native bundle id leading the list is load-bearing, not
    // cosmetic: it is the only client that produces a revocable token.
    expect(primaryAppleClientId()).toBe(BUNDLE_ID);
  });

  it("tolerates the whitespace an operator will inevitably leave in", () => {
    vi.stubEnv("APPLE_CLIENT_IDS", `  ,  ${SERVICES_ID} , ${BUNDLE_ID}`);
    expect(primaryAppleClientId()).toBe(SERVICES_ID);
  });

  it("is null when nothing is configured", () => {
    vi.stubEnv("APPLE_CLIENT_IDS", "");
    expect(primaryAppleClientId()).toBeNull();
  });
});
