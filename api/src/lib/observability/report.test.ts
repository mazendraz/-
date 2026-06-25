import { describe, expect, it } from "vitest";
import { parseDsn, buildEnvelope } from "@/lib/observability/report";

describe("parseDsn", () => {
  it("parses a standard Sentry DSN into ingest coordinates", () => {
    const dsn = parseDsn("https://abc123@o42.ingest.sentry.io/5678");
    expect(dsn).toEqual({
      publicKey: "abc123",
      projectId: "5678",
      envelopeUrl: "https://o42.ingest.sentry.io/api/5678/envelope/",
    });
  });

  it("returns null for a malformed DSN", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://o42.ingest.sentry.io/5678")).toBeNull(); // no public key
    expect(parseDsn("https://abc@host/")).toBeNull(); // no project id
  });
});

describe("buildEnvelope", () => {
  it("emits a 3-line newline-delimited envelope with the event id and error", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const out = buildEnvelope(new Error("boom"), { route: "/api/x" }, "deadbeef", now);
    const lines = out.trimEnd().split("\n");
    expect(lines).toHaveLength(3);

    const header = JSON.parse(lines[0]!);
    expect(header.event_id).toBe("deadbeef");
    expect(header.sent_at).toBe("2026-01-01T00:00:00.000Z");

    expect(JSON.parse(lines[1]!)).toEqual({ type: "event" });

    const event = JSON.parse(lines[2]!);
    expect(event.event_id).toBe("deadbeef");
    expect(event.level).toBe("error");
    expect(event.exception.values[0].type).toBe("Error");
    expect(event.exception.values[0].value).toBe("boom");
    expect(event.extra).toEqual({ route: "/api/x" });
  });

  it("coerces a non-Error thrown value", () => {
    const event = JSON.parse(
      buildEnvelope("plain string", {}, "id1", new Date()).trimEnd().split("\n")[2]!,
    );
    expect(event.exception.values[0].value).toBe("plain string");
  });
});
