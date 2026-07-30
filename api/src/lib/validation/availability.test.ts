// The payload the CLIENT actually sends has to parse.
//
// These exist because it did not. `lib/availability.ts` normalises every
// availability write to `{ busy, busyUntil: … ?? null, busyNote: … ?? null }`,
// so a toggle with no note sends `busyNote: null`. The schema accepted
// `undefined` but not `null`, so every click on the admin list's availability
// button returned 400 and the row silently never changed — a button that looked
// like it did nothing, because it did nothing.
import { describe, expect, it } from "vitest";
import { availabilitySchema } from "@/lib/validation/availability";

/** Mirrors `body()` in app/src/lib/availability.ts — the real wire shape. */
function clientPayload(p: { busy: boolean; busyUntil?: number | null; busyNote?: string | null }) {
  return { busy: p.busy, busyUntil: p.busyUntil ?? null, busyNote: p.busyNote ?? null };
}

describe("availabilitySchema", () => {
  it("accepts the admin quick-toggle payload (no date, no note)", () => {
    const parsed = availabilitySchema.parse(clientPayload({ busy: true }));
    expect(parsed.busy).toBe(true);
    expect(parsed.busyUntil).toBeNull();
    expect(parsed.busyNote).toBeNull();
  });

  it("accepts going available again", () => {
    expect(availabilitySchema.parse(clientPayload({ busy: false })).busy).toBe(false);
  });

  it("accepts a note and a reopen date", () => {
    const parsed = availabilitySchema.parse(
      clientPayload({ busy: true, busyUntil: 1_800_000_000_000, busyNote: "On site until Sunday" }),
    );
    expect(parsed.busyUntil).toBe(1_800_000_000_000);
    expect(parsed.busyNote).toBe("On site until Sunday");
  });

  it("accepts an empty note (the provider control sends \"\" when not busy)", () => {
    expect(availabilitySchema.parse({ busy: false, busyNote: "" }).busyNote).toBe("");
  });

  it("still strips HTML from a note", () => {
    const parsed = availabilitySchema.parse(
      clientPayload({ busy: true, busyNote: "<b>closed</b>" }),
    );
    expect(parsed.busyNote).not.toContain("<b>");
  });

  it("still rejects a note over the length cap", () => {
    expect(() =>
      availabilitySchema.parse(clientPayload({ busy: true, busyNote: "x".repeat(201) })),
    ).toThrow();
  });

  it("still requires `busy`", () => {
    expect(() => availabilitySchema.parse({ busyNote: null })).toThrow();
  });
});
