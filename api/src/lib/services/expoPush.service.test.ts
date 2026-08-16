// Native push via Expo.
//
// Two behaviours carry this file. Pruning: a token that Expo reports as
// DeviceNotRegistered has to be deleted, or the table fills with uninstalled
// apps and every future send wastes a slot on them. And fail-open: a lead is
// created because a customer asked for one — an Expo outage must never be able
// to turn that into a failed request.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface DeviceRow {
  token: string;
  platform: string;
  deviceName: string | null;
  userId: string | null;
  customerId: string | null;
}

let devices: DeviceRow[] = [];

const db = {
  pushDevice: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      devices.filter((d) => {
        if (typeof where.userId === "string" && d.userId !== where.userId) return false;
        if (typeof where.customerId === "string" && d.customerId !== where.customerId) return false;
        return true;
      }),
    // Prisma accepts a bare value OR an `{ in: [...] }` filter, and the service
    // uses both — pruning passes a list, unregister passes one token.
    deleteMany: async ({ where }: { where: { token: string | { in: string[] } } }) => {
      const tokens =
        typeof where.token === "string" ? [where.token] : where.token.in;
      const before = devices.length;
      devices = devices.filter((d) => !tokens.includes(d.token));
      return { count: before - devices.length };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { token: string };
      create: DeviceRow;
      update: Partial<DeviceRow>;
    }) => {
      const existing = devices.find((d) => d.token === where.token);
      if (existing) Object.assign(existing, update);
      else devices.push({ ...create });
      return {};
    },
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const svc = await import("@/lib/services/expoPush.service");

const PAYLOAD = { title: "New request", body: "AA-1234", url: "/provider/leads" };

/** Stand in for Expo, returning one ticket per message sent. */
function mockExpo(ticketsFor: (tokens: string[]) => unknown[]) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const messages = JSON.parse(init.body) as { to: string }[];
    return {
      ok: true,
      json: async () => ({ data: ticketsFor(messages.map((m) => m.to)) }),
    } as unknown as Response;
  });
}

beforeEach(() => {
  devices = [
    { token: "ExponentPushToken[aaa]", platform: "ios", deviceName: "iPhone", userId: "u1", customerId: null },
    { token: "ExponentPushToken[bbb]", platform: "android", deviceName: "Pixel", userId: "u1", customerId: null },
    { token: "ExponentPushToken[ccc]", platform: "ios", deviceName: "iPhone", userId: null, customerId: "c1" },
  ];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sending", () => {
  it("sends to every device a user has and counts what was accepted", async () => {
    const fetchMock = mockExpo((tokens) => tokens.map(() => ({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await svc.notifyUserDevices("u1", PAYLOAD)).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends only to the addressed owner", async () => {
    const fetchMock = mockExpo((tokens) => tokens.map(() => ({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);

    await svc.notifyCustomerDevices("c1", PAYLOAD);
    const sentTo = JSON.parse(fetchMock.mock.calls[0]![1]!.body).map((m: { to: string }) => m.to);
    expect(sentTo).toEqual(["ExponentPushToken[ccc]"]);
  });

  it("carries the deep-link url through as data the app reads on tap", async () => {
    const fetchMock = mockExpo((tokens) => tokens.map(() => ({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);

    await svc.notifyCustomerDevices("c1", PAYLOAD);
    const [message] = JSON.parse(fetchMock.mock.calls[0]![1]!.body);
    expect(message.data).toEqual({ url: "/provider/leads" });
  });

  it("does nothing, and calls nothing, when the owner has no devices", async () => {
    const fetchMock = mockExpo(() => []);
    vi.stubGlobal("fetch", fetchMock);

    expect(await svc.notifyUserDevices("nobody", PAYLOAD)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chunks past Expo's 100-message ceiling instead of truncating", async () => {
    devices = Array.from({ length: 250 }, (_, i) => ({
      token: `ExponentPushToken[t${i}]`,
      platform: "ios",
      deviceName: null,
      userId: "u1",
      customerId: null,
    }));
    const fetchMock = mockExpo((tokens) => tokens.map(() => ({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);

    // "We notified the first hundred providers" is not a behaviour anyone would
    // pick on purpose.
    expect(await svc.notifyUserDevices("u1", PAYLOAD)).toBe(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("pruning", () => {
  it("deletes tokens Expo reports as DeviceNotRegistered", async () => {
    vi.stubGlobal(
      "fetch",
      mockExpo((tokens) =>
        tokens.map((t) =>
          t === "ExponentPushToken[aaa]"
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok" },
        ),
      ),
    );

    expect(await svc.notifyUserDevices("u1", PAYLOAD)).toBe(1);
    expect(devices.map((d) => d.token)).not.toContain("ExponentPushToken[aaa]");
    expect(devices).toHaveLength(2);
  });

  it("keeps tokens that failed for any OTHER reason", async () => {
    // A transient Expo-side error is not evidence the app was uninstalled.
    // Deleting on it would silently unsubscribe people during an outage.
    vi.stubGlobal(
      "fetch",
      mockExpo((tokens) =>
        tokens.map(() => ({ status: "error", details: { error: "MessageRateExceeded" } })),
      ),
    );

    expect(await svc.notifyUserDevices("u1", PAYLOAD)).toBe(0);
    expect(devices).toHaveLength(3);
  });
});

describe("fail-open", () => {
  it("returns 0 instead of throwing when Expo is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(svc.notifyUserDevices("u1", PAYLOAD)).resolves.toBe(0);
  });

  it("returns 0 instead of throwing on a non-2xx from Expo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "unavailable",
    }) as unknown as Response));
    await expect(svc.notifyUserDevices("u1", PAYLOAD)).resolves.toBe(0);
    expect(devices).toHaveLength(3);
  });
});

describe("registration", () => {
  it("upserts, so a relaunch does not duplicate the device", async () => {
    await svc.registerDevice({
      token: "ExponentPushToken[aaa]",
      platform: "ios",
      deviceName: "iPhone 15",
      userId: "u1",
    });
    expect(devices).toHaveLength(3);
    expect(devices.find((d) => d.token === "ExponentPushToken[aaa]")!.deviceName).toBe("iPhone 15");
  });

  it("RE-POINTS a token when a different account signs in on the same phone", async () => {
    // A shared phone. Leaving the row pointed at the previous owner would send
    // their notifications to whoever is holding it now.
    await svc.registerDevice({
      token: "ExponentPushToken[aaa]",
      platform: "ios",
      customerId: "c9",
    });
    const row = devices.find((d) => d.token === "ExponentPushToken[aaa]")!;
    expect(row.customerId).toBe("c9");
    expect(row.userId).toBeNull();
  });

  it("unregisters idempotently", async () => {
    await svc.unregisterDevice("ExponentPushToken[aaa]");
    await svc.unregisterDevice("ExponentPushToken[aaa]");
    expect(devices).toHaveLength(2);
  });
});
