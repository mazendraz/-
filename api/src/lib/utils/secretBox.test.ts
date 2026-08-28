// AES-256-GCM sealing for the one secret that cannot be hashed.
//
// The roundtrip is the boring half. What is actually worth pinning down is the
// set of failures, because every one of them is silent by nature — a value that
// does not decrypt looks exactly like a value that was never stored, and the
// only place the difference shows up is months later when an account deletion
// fails to reach Apple:
//
//   • a short/garbage key ACCEPTED, producing ciphertext that protects nothing
//   • a tampered column decrypting to plausible garbage instead of refusing
//   • a rotated key throwing, which would block account deletion outright
//   • ciphertext that leaks its plaintext to anyone reading the column
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSecretBoxConfigured, open, seal } from "@/lib/utils/secretBox";

// Two distinct, valid 32-byte keys. Fixed rather than random so a failure is
// reproducible from the file alone.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const SECRET = "r2.AAAA-fake-apple-refresh-token-shape";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("roundtrip", () => {
  it("returns exactly what was sealed", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    expect(open(seal(SECRET))).toBe(SECRET);
  });

  it("survives unicode, which an Arabic-first product will eventually store", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const value = "مستخدم Apple — 😀";
    expect(open(seal(value))).toBe(value);
  });

  it("never emits the plaintext into the stored value", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const sealed = seal(SECRET)!;
    expect(sealed).not.toContain(SECRET);
    // The point of the column: a database read yields nothing usable.
    expect(sealed).not.toContain("apple-refresh-token");
  });

  it("produces a different ciphertext each time — the IV is not reused", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    // A fixed IV under a fixed key is the classic GCM catastrophe. Equal
    // ciphertexts for equal plaintexts would be the visible symptom.
    expect(seal(SECRET)).not.toBe(seal(SECRET));
  });

  it("stamps a version so a future algorithm change is a migration, not a guess", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    expect(seal(SECRET)!.startsWith("v1.")).toBe(true);
  });
});

describe("no key configured", () => {
  it("seals to null rather than storing plaintext", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "");
    // The whole point: the caller stores nothing. A fallback to plaintext here
    // would defeat the reason the column is encrypted at all.
    expect(seal(SECRET)).toBeNull();
    expect(isSecretBoxConfigured()).toBe(false);
  });

  it("opens to null rather than throwing", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const sealed = seal(SECRET)!;
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "");
    expect(open(sealed)).toBeNull();
  });
});

describe("a key that is the wrong size is a configuration error, not a weak key", () => {
  it("throws instead of padding or stretching a short value", () => {
    // Silently accepting this would produce ciphertext that looks fine in the
    // column and protects nothing — the exact failure this check exists for.
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", Buffer.from("hunter2").toString("base64"));
    expect(() => seal(SECRET)).toThrow(/32 base64-encoded bytes/i);
  });

  it("names the fix in the message", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", "aGk=");
    expect(() => seal(SECRET)).toThrow(/openssl rand -base64 32/);
  });
});

describe("open() refuses rather than guesses", () => {
  it("returns null for a value sealed under a DIFFERENT key", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const sealed = seal(SECRET)!;

    // Key rotation. Must not throw: account deletion reads this column, and a
    // throw here would block a customer's deletion over an unreadable token.
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_B);
    expect(open(sealed)).toBeNull();
  });

  it("returns null when the ciphertext has been tampered with", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const [v, iv, ct, tag] = seal(SECRET)!.split(".");
    // Flip one character of the ciphertext. GCM's auth tag is what turns this
    // into a refusal instead of plausible garbage handed to Apple.
    const flipped = (ct![0] === "A" ? "B" : "A") + ct!.slice(1);
    expect(open([v, iv, flipped, tag].join("."))).toBeNull();
  });

  it("returns null when the auth tag has been swapped out", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const [v, iv, ct] = seal(SECRET)!.split(".");
    const forged = Buffer.alloc(16, 9).toString("base64url");
    expect(open([v, iv, ct, forged].join("."))).toBeNull();
  });

  it("returns null for an unknown version prefix", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    const sealed = seal(SECRET)!;
    expect(open(`v2.${sealed.split(".").slice(1).join(".")}`)).toBeNull();
  });

  it("returns null for malformed, empty and absent values alike", () => {
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", KEY_A);
    // Every one of these means the same thing to a caller: nothing to revoke.
    expect(open(null)).toBeNull();
    expect(open(undefined)).toBeNull();
    expect(open("")).toBeNull();
    expect(open("not-sealed-at-all")).toBeNull();
    expect(open("v1.only.three")).toBeNull();
  });
});
