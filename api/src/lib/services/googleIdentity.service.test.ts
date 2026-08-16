// Verification of a Google ID token.
//
// The audience test below is the one that matters. A Google ID token issued to a
// DIFFERENT app is a real, correctly-signed, unexpired Google token — the
// operator of any Google-signed-in app can collect them from their own users by
// the thousand. Every other check here passes on such a token. Only the audience
// check refuses it, and if it ever regresses, nothing else in this file or the
// codebase would fail.
//
// Google's remote key set is swapped for a locally generated RS256 pair so tokens
// can be minted at will; everything else — jwtVerify, the issuer/audience/expiry
// enforcement — is the real implementation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";

const keys = await generateKeyPair("RS256");

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    // Stand in for Google's JWKS endpoint: always resolves to our test key.
    createRemoteJWKSet: () => async () => keys.publicKey,
  };
});

const { verifyGoogleIdToken, isGoogleSignInConfigured } = await import(
  "@/lib/services/googleIdentity.service"
);

const OUR_CLIENT = "111-ours.apps.googleusercontent.com";
const OUR_IOS_CLIENT = "222-ios.apps.googleusercontent.com";

interface TokenOpts {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  emailVerified?: unknown;
  name?: string;
  picture?: string;
  expiresIn?: string;
}

async function googleToken(opts: TokenOpts = {}): Promise<string> {
  const payload: Record<string, unknown> = {
    email: opts.email ?? "customer@example.com",
    email_verified: "emailVerified" in opts ? opts.emailVerified : true,
  };
  if (opts.name !== undefined) payload.name = opts.name;
  if (opts.picture !== undefined) payload.picture = opts.picture;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? OUR_CLIENT)
    .setSubject(opts.sub ?? "google-sub-123")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(keys.privateKey);
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_IDS", `${OUR_CLIENT}, ${OUR_IOS_CLIENT}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audience — the check that carries the whole gate", () => {
  it("REJECTS a valid Google token issued to another app", async () => {
    const token = await googleToken({ aud: "999-someone-else.apps.googleusercontent.com" });
    await expect(verifyGoogleIdToken(token)).rejects.toThrow(/google sign-in failed/i);
  });

  it("accepts any client id WE own — one per platform, all valid here", async () => {
    await expect(verifyGoogleIdToken(await googleToken({ aud: OUR_CLIENT }))).resolves
      .toBeDefined();
    await expect(verifyGoogleIdToken(await googleToken({ aud: OUR_IOS_CLIENT }))).resolves
      .toBeDefined();
  });

  it("refuses to run at all when no client id is configured", async () => {
    // Verifying against an empty audience list would accept a token from ANY app.
    // Failing loudly is the only safe response to the misconfiguration.
    vi.stubEnv("GOOGLE_CLIENT_IDS", "");
    await expect(verifyGoogleIdToken(await googleToken())).rejects.toThrow(
      /GOOGLE_CLIENT_IDS is not set/,
    );
  });
});

describe("issuer, signature and expiry", () => {
  it("accepts both issuer spellings Google uses", async () => {
    for (const iss of ["https://accounts.google.com", "accounts.google.com"]) {
      await expect(verifyGoogleIdToken(await googleToken({ iss }))).resolves.toBeDefined();
    }
  });

  it("rejects a token from another issuer", async () => {
    const token = await googleToken({ iss: "https://evil.example" });
    await expect(verifyGoogleIdToken(token)).rejects.toThrow(/google sign-in failed/i);
  });

  it("rejects an expired token", async () => {
    const token = await googleToken({ expiresIn: "-1m" });
    await expect(verifyGoogleIdToken(token)).rejects.toThrow(/google sign-in failed/i);
  });

  it("rejects a token signed with the wrong key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "customer@example.com", email_verified: true })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(OUR_CLIENT)
      .setSubject("google-sub-123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey);

    await expect(verifyGoogleIdToken(forged)).rejects.toThrow(/google sign-in failed/i);
  });

  it("reports every failure with the same message", async () => {
    // Which check failed is exactly what someone probing the gate wants to learn.
    const messages = await Promise.all(
      [
        googleToken({ aud: "999-other.apps.googleusercontent.com" }),
        googleToken({ iss: "https://evil.example" }),
        googleToken({ expiresIn: "-1m" }),
      ].map((t) => t.then((tok) => verifyGoogleIdToken(tok).catch((e: Error) => e.message))),
    );
    expect(new Set(messages).size).toBe(1);
  });
});

describe("the identity it returns", () => {
  it("takes every field from the token, normalizing the email", async () => {
    const token = await googleToken({
      sub: "sub-abc",
      email: "  Customer@Example.COM  ",
      name: "مازن",
      picture: "https://lh3.googleusercontent.com/a/x",
    });
    await expect(verifyGoogleIdToken(token)).resolves.toEqual({
      subject: "sub-abc",
      email: "customer@example.com",
      emailVerified: true,
      name: "مازن",
      avatarUrl: "https://lh3.googleusercontent.com/a/x",
    });
  });

  it("treats a non-boolean email_verified as UNVERIFIED", async () => {
    // A truthy string would otherwise widen account linking — the one decision
    // this flag gates.
    for (const value of ["true", 1, "1", {}]) {
      const identity = await verifyGoogleIdToken(await googleToken({ emailVerified: value }));
      expect(identity.emailVerified, `email_verified=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("falls back to the email's local part when Google sends no name", async () => {
    const identity = await verifyGoogleIdToken(await googleToken({ email: "mazen@example.com" }));
    expect(identity.name).toBe("mazen");
    expect(identity.avatarUrl).toBeNull();
  });

  it("rejects a verified token that carries no email", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(OUR_CLIENT)
      .setSubject("sub-abc")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);

    await expect(verifyGoogleIdToken(token)).rejects.toThrow(/google sign-in failed/i);
  });
});

describe("isGoogleSignInConfigured", () => {
  it("reflects whether any client id is set", () => {
    expect(isGoogleSignInConfigured()).toBe(true);
    vi.stubEnv("GOOGLE_CLIENT_IDS", "");
    expect(isGoogleSignInConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_IDS", "  ,  ");
    expect(isGoogleSignInConfigured()).toBe(false);
  });
});
