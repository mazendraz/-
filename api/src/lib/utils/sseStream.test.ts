// The SSE connection cap — and specifically the bug the Business App mobile
// phase found live: every admin subscribes to the SAME `admins` channel, so
// capping by channel alone splits one shared budget across every admin
// account on the platform (docs/architecture/business-app/
// phase-4-realtime-push.md, B3). These tests pin the fix: `capKey` scopes the
// cap to whichever caller passed it, decoupled from the channel used for
// actual event delivery.
import { afterEach, describe, expect, it } from "vitest";
import { publish, subscriberCount } from "@/lib/services/realtime.service";
import { sseConnectionCount, sseResponse } from "@/lib/utils/sseStream";

// Every open() call needs its own AbortController so the test can close it
// deterministically rather than waiting for GC.
function open(channels: Parameters<typeof sseResponse>[1]) {
  const controller = new AbortController();
  const request = new Request("http://localhost/stream", { signal: controller.signal });
  const response = sseResponse(request, channels);
  return { response, close: () => controller.abort() };
}

/** sseResponse's cleanup runs on the request's abort EVENT, which fires
 *  asynchronously — a microtask tick is enough for the listener to run. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const openConnections: { close: () => void }[] = [];
afterEach(async () => {
  openConnections.splice(0).forEach((c) => c.close());
  await settle();
  // The hub is module state shared across every test file in this run —
  // same discipline realtime.service.test.ts already follows.
  expect(subscriberCount()).toBe(0);
});

function openTracked(channels: Parameters<typeof sseResponse>[1]) {
  const conn = open(channels);
  openConnections.push(conn);
  return conn;
}

describe("the cap, keyed by channel (unchanged default behavior)", () => {
  it("allows up to the limit on one channel", () => {
    for (let i = 0; i < 8; i++) {
      expect(() => openTracked(["room-a"])).not.toThrow();
    }
  });

  it("refuses the connection past the limit", () => {
    for (let i = 0; i < 8; i++) openTracked(["room-b"]);
    expect(() => openTracked(["room-b"])).toThrow(/too many open connections/i);
  });

  it("frees a slot when a connection closes", async () => {
    const conns = Array.from({ length: 8 }, () => openTracked(["room-c"]));
    expect(() => openTracked(["room-c"])).toThrow();

    conns[0]!.close();
    await settle();

    expect(() => openTracked(["room-c"])).not.toThrow();
  });
});

describe("capKey — the fix", () => {
  it("gives each capKey its own budget on the SAME channel", () => {
    // Two admins, same channel ("admins"), different capKey — exactly
    // provider/stream/route.ts's shape for an ADMIN caller.
    for (let i = 0; i < 8; i++) {
      openTracked([{ channel: "admins", capKey: "admins:admin-1" }]);
    }
    for (let i = 0; i < 8; i++) {
      openTracked([{ channel: "admins", capKey: "admins:admin-2" }]);
    }
    // Both budgets are full on their own terms — neither borrowed from the
    // other's headroom, and neither ran out early because of the other.
    expect(sseConnectionCount("admins:admin-1")).toBe(8);
    expect(sseConnectionCount("admins:admin-2")).toBe(8);
    expect(() => openTracked([{ channel: "admins", capKey: "admins:admin-1" }])).toThrow();
    expect(() => openTracked([{ channel: "admins", capKey: "admins:admin-2" }])).toThrow();
  });

  it("still delivers to every subscriber of the real channel, capKey aside", () => {
    const a = openTracked([{ channel: "admins", capKey: "admins:admin-1" }]);
    const b = openTracked([{ channel: "admins", capKey: "admins:admin-2" }]);

    publish("admins", { type: "lead", leadId: "l1", companyId: "c1" });

    // Both streams are real ReadableStreams; reading a chunk from each proves
    // the event reached both, regardless of which capKey they opened under.
    return Promise.all([readOneEvent(a.response), readOneEvent(b.response)]).then(([e1, e2]) => {
      expect(e1).toContain("l1");
      expect(e2).toContain("l1");
    });
  });

  it("a plain string channel still caps by the channel itself (default capKey)", () => {
    // No capKey given — company:/customer: channels never pass one, and
    // this is the behavior every existing caller still gets.
    for (let i = 0; i < 8; i++) openTracked(["company:acme"]);
    expect(sseConnectionCount("company:acme")).toBe(8);
    expect(() => openTracked(["company:acme"])).toThrow();
  });
});

/** Reads past the initial ": connected" comment to the first real event
 *  frame's raw text. */
async function readOneEvent(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // The connection-opened comment is always written synchronously before
  // this function's caller can have published anything, so the first read
  // is reliably that comment — skip it and read once more for the event.
  for (let i = 0; i < 5; i++) {
    const { value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array());
    if (buffer.includes("data:")) break;
  }
  reader.releaseLock();
  return buffer;
}
