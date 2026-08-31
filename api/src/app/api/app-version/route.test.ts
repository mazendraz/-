// GET /api/v1/app-version — two independent kill switches, one per app.
// Pins the exact bug this exists to avoid: sharing one threshold between the
// client and Business App would let a release of one block the other, since
// the two ship unrelated version numbers.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const ENV_KEYS = [
  "APP_MIN_VERSION",
  "APP_LATEST_VERSION",
  "APP_IOS_URL",
  "APP_ANDROID_URL",
  "APP_UPDATE_MESSAGE",
  "APP_MIN_VERSION_BUSINESS",
  "APP_LATEST_VERSION_BUSINESS",
  "APP_IOS_URL_BUSINESS",
  "APP_ANDROID_URL_BUSINESS",
  "APP_UPDATE_MESSAGE_BUSINESS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/app-version${query}`);
}

describe("no ?app= — the client's own call, unchanged", () => {
  it("reads the plain env vars", async () => {
    process.env.APP_MIN_VERSION = "1.2.0";
    process.env.APP_LATEST_VERSION = "1.5.0";
    process.env.APP_IOS_URL = "https://apps.apple.com/client";

    const res = await GET(req());
    const body = await res.json();

    expect(body).toMatchObject({
      minimum: "1.2.0",
      latest: "1.5.0",
      iosUrl: "https://apps.apple.com/client",
    });
  });

  it("defaults to 0.0.0 / null when unset — never locks anyone out by accident", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body).toEqual({
      minimum: "0.0.0",
      latest: "0.0.0",
      iosUrl: null,
      androidUrl: null,
      message: null,
    });
  });

  it("ignores the _BUSINESS vars entirely", async () => {
    process.env.APP_MIN_VERSION_BUSINESS = "9.9.9";

    const res = await GET(req());
    const body = await res.json();

    expect(body.minimum).toBe("0.0.0");
  });
});

describe("?app=business — a fully separate set, not a fallback", () => {
  it("reads the _BUSINESS env vars", async () => {
    process.env.APP_MIN_VERSION_BUSINESS = "2.0.0";
    process.env.APP_LATEST_VERSION_BUSINESS = "2.1.0";
    process.env.APP_ANDROID_URL_BUSINESS = "https://play.google.com/business";

    const res = await GET(req("?app=business"));
    const body = await res.json();

    expect(body).toMatchObject({
      minimum: "2.0.0",
      latest: "2.1.0",
      androidUrl: "https://play.google.com/business",
    });
  });

  it("does NOT fall back to the client's plain vars when unset — the whole point of B5", async () => {
    // The client has a real, high threshold; the business app has shipped
    // nothing yet. If this fell back, a business build would be blocked (or
    // a stale one waved through) by a number that describes a different app.
    process.env.APP_MIN_VERSION = "5.0.0";

    const res = await GET(req("?app=business"));
    const body = await res.json();

    expect(body.minimum).toBe("0.0.0");
  });

  it("defaults to 0.0.0 / null when the business vars are unset too", async () => {
    const res = await GET(req("?app=business"));
    const body = await res.json();

    expect(body).toEqual({
      minimum: "0.0.0",
      latest: "0.0.0",
      iosUrl: null,
      androidUrl: null,
      message: null,
    });
  });
});

describe("an unrecognized ?app= value", () => {
  it("falls through to the client's own (default) vars", async () => {
    process.env.APP_MIN_VERSION = "1.0.0";

    const res = await GET(req("?app=something-else"));
    const body = await res.json();

    expect(body.minimum).toBe("1.0.0");
  });
});
