// Verification of an Apple identity token.
//
// The audience test is the same load-bearing check as in the Google suite, and
// for the same reason — read that file's header. What is tested BEYOND it here
// is the set of things Apple does differently from Google, each of which is a
// silent, plausible-looking bug rather than a crash:
//
//   • `email_verified` arriving as the STRING "true". Read with `=== true` it
//     reports every Apple user as unverified, which is not an error anywhere —
//     it just quietly makes account linking impossible and downgrades security
//     decisions that depend on the flag.
//   • A missing name on the second sign-in overwriting a real one. Nothing
//     fails; the customer's name simply turns into random hex one day.
//   • The nonce binding, which has no effect at all if it regresses — until
//     someone replays a captured token.
//
// Apple's remote key set is swapped for a locally generated RS256 pair so tokens
// can be minted at will; everything else — jwtVerify, the issuer/audience/expiry
// enforcement — is the real implementation.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";

const keys = await generateKeyPair("RS256");

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    // Stand in for Apple's JWKS endpoint: always resolves to our test key.
    createRemoteJWKSet: () => async () => keys.publicKey,
  };
});

const { verifyAppleIdToken, isAppleSignInConfigured, appleCreationName } = await import(
  "@/lib/services/appleIdentity.service"
);

// The two identifier kinds Apple actually issues: the iOS bundle id for the
// native sheet, and a Services ID for the website. Both are legitimate `aud`
// values for the same backend.
const OUR_BUNDLE_ID = "com.alassema.client";
const OUR_SERVICES_ID = "com.alassema.web";

const RELAY_EMAIL = "k9x2m4h8t1@privaterelay.appleid.com";

interface TokenOpts {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: unknown;
  emailVerified?: unknown;
  isPrivateEmail?: unknown;
  nonce?: string;
  expiresIn?: string;
}

async function appleToken(opts: TokenOpts = {}): Promise<string> {
  const payload: Record<string, unknown> = {
    email: "email" in opts ? opts.email : "customer@example.com",
    email_verified: "emailVerified" in opts ? opts.emailVerified : true,
  };
  if (opts.isPrivateEmail !== undefined) payload.is_private_email = opts.isPrivateEmail;
  if (opts.nonce !== undefined) payload.nonce = opts.nonce;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(opts.iss ?? "https://appleid.apple.com")
    .setAudience(opts.aud ?? OUR_BUNDLE_ID)
    .setSubject(opts.sub ?? "001234.abcdef.0000")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(keys.privateKey);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => {
  vi.stubEnv("APPLE_CLIENT_IDS", `${OUR_BUNDLE_ID}, ${OUR_SERVICES_ID}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audience — the check that carries the whole gate", () => {
  it("REJECTS a valid Apple token issued to another app", async () => {
    const token = await appleToken({ aud: "com.someone.else" });
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });

  it("accepts both identifier kinds we own — bundle id and Services ID", async () => {
    await expect(verifyAppleIdToken(await appleToken({ aud: OUR_BUNDLE_ID }))).resolves
      .toBeDefined();
    await expect(verifyAppleIdToken(await appleToken({ aud: OUR_SERVICES_ID }))).resolves
      .toBeDefined();
  });

  it("reports WHICH audience the token carried, not just that it was allowed", async () => {
    // The authorization-code exchange has to name the same client the code was
    // issued to, and Apple rejects it otherwise. Reading it back off the verified
    // token is the only way to know which of the two it was without guessing —
    // and it is trustworthy precisely because jwtVerify already refused the rest.
    const bundle = await verifyAppleIdToken(await appleToken({ aud: OUR_BUNDLE_ID }));
    expect(bundle.audience).toBe(OUR_BUNDLE_ID);

    const services = await verifyAppleIdToken(await appleToken({ aud: OUR_SERVICES_ID }));
    expect(services.audience).toBe(OUR_SERVICES_ID);
  });

  it("throws a CONFIGURATION error, not an auth error, when nothing is configured", async () => {
    // Verifying against an empty audience list would accept tokens issued to any
    // app at all, so this must fail loudly rather than look like a bad token.
    vi.stubEnv("APPLE_CLIENT_IDS", "");
    await expect(verifyAppleIdToken(await appleToken())).rejects.toThrow(/unconfigured/i);
  });
});

describe("signature, issuer and expiry", () => {
  it("rejects a token signed by someone other than Apple", async () => {
    const impostor = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "customer@example.com", email_verified: true })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://appleid.apple.com")
      .setAudience(OUR_BUNDLE_ID)
      .setSubject("001234.abcdef.0000")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(impostor.privateKey);

    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });

  it("rejects a correctly-signed token from the wrong issuer", async () => {
    // Apple, unlike Google, publishes exactly one issuer form.
    const token = await appleToken({ iss: "appleid.apple.com" });
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });

  it("rejects an expired token", async () => {
    const token = await appleToken({ expiresIn: "-1m" });
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });
});

describe("email_verified — Apple sends a string where Google sends a boolean", () => {
  it('treats the STRING "true" as verified', async () => {
    // The bug this guards: `payload.email_verified === true` is the correct read
    // for Google and silently wrong for Apple. It throws nothing — it just marks
    // every Apple customer unverified, which blocks account linking forever.
    const identity = await verifyAppleIdToken(await appleToken({ emailVerified: "true" }));
    expect(identity.emailVerified).toBe(true);
  });

  it("treats the boolean true as verified", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ emailVerified: true }));
    expect(identity.emailVerified).toBe(true);
  });

  it('treats the STRING "false" as NOT verified', async () => {
    // The mirror-image bug: `Boolean("false")` is `true`. Coercing instead of
    // comparing would report an unverified address as verified and open the
    // very account-takeover path the flag exists to gate.
    const identity = await verifyAppleIdToken(await appleToken({ emailVerified: "false" }));
    expect(identity.emailVerified).toBe(false);
  });

  it("treats a missing claim as NOT verified", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ emailVerified: undefined }));
    expect(identity.emailVerified).toBe(false);
  });
});

describe("required claims", () => {
  it("rejects a verified token that carries no email", async () => {
    const token = await appleToken({ email: undefined });
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });

  it("lowercases and trims the email, because it is the account key", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ email: "  Customer@Example.COM " }));
    expect(identity.email).toBe("customer@example.com");
  });
});

describe("Hide My Email", () => {
  it("flags a relay address even when Apple omits is_private_email", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ email: RELAY_EMAIL }));
    expect(identity.isPrivateEmail).toBe(true);
  });

  it('flags it from the STRING "true" too', async () => {
    const identity = await verifyAppleIdToken(
      await appleToken({ email: "customer@example.com", isPrivateEmail: "true" }),
    );
    expect(identity.isPrivateEmail).toBe(true);
  });

  it("leaves an ordinary address unflagged", async () => {
    const identity = await verifyAppleIdToken(await appleToken());
    expect(identity.isPrivateEmail).toBe(false);
  });
});

describe("nonce — binds the token to the request that carried it", () => {
  it("accepts the raw nonce whose hash Apple signed", async () => {
    const raw = "abc123-random";
    const token = await appleToken({ nonce: sha256(raw) });
    await expect(verifyAppleIdToken(token, raw)).resolves.toBeDefined();
  });

  it("REJECTS a token with a nonce when the caller cannot produce it", async () => {
    // This is the replay case: someone captured the token alone. Every other
    // check in this file passes on it.
    const token = await appleToken({ nonce: sha256("abc123-random") });
    await expect(verifyAppleIdToken(token)).rejects.toThrow(/apple sign-in failed/i);
  });

  it("rejects a nonce that does not match", async () => {
    const token = await appleToken({ nonce: sha256("abc123-random") });
    await expect(verifyAppleIdToken(token, "a-different-value")).rejects.toThrow(
      /apple sign-in failed/i,
    );
  });

  it("accepts an un-hashed nonce echoed verbatim", async () => {
    // A client that passed its nonce to Apple without hashing proves exactly the
    // same thing. The nonce is a freshness marker, not a secret.
    const raw = "abc123-random";
    await expect(verifyAppleIdToken(await appleToken({ nonce: raw }), raw)).resolves
      .toBeDefined();
  });

  it("does not require a nonce from a token that has none", async () => {
    await expect(verifyAppleIdToken(await appleToken())).resolves.toBeDefined();
  });
});

describe("appleCreationName — used ONLY when creating a row", () => {
  it("prefers the name the client got from Apple on first authorization", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ email: RELAY_EMAIL }));
    expect(appleCreationName(identity, "  أحمد محمود  ")).toBe("أحمد محمود");
  });

  it("does NOT put random relay hex in front of a company", async () => {
    // Google's fallback — the email's local part — reads fine as `ahmed`. For a
    // Hide-My-Email address it is meaningless hex, and this name is shown to the
    // provider the customer is messaging.
    const identity = await verifyAppleIdToken(await appleToken({ email: RELAY_EMAIL }));
    expect(appleCreationName(identity)).toBe("مستخدم Apple");
  });

  it("falls back to the local part for a real address", async () => {
    const identity = await verifyAppleIdToken(await appleToken({ email: "ahmed@example.com" }));
    expect(appleCreationName(identity)).toBe("ahmed");
  });

  it("truncates to the column width instead of failing", async () => {
    const identity = await verifyAppleIdToken(await appleToken());
    expect(appleCreationName(identity, "x".repeat(200))).toHaveLength(80);
  });
});

describe("isAppleSignInConfigured", () => {
  it("is false when unset, so the route can answer 400 instead of 500", async () => {
    vi.stubEnv("APPLE_CLIENT_IDS", "");
    expect(isAppleSignInConfigured()).toBe(false);
  });

  it("ignores whitespace-only entries", async () => {
    vi.stubEnv("APPLE_CLIENT_IDS", " , ,  ");
    expect(isAppleSignInConfigured()).toBe(false);
  });

  it("is true once an identifier is configured", async () => {
    expect(isAppleSignInConfigured()).toBe(true);
  });
});
