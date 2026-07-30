import { describe, expect, it } from "vitest";
import { overlaps, isWindowActive } from "@/lib/services/busyWindows.service";
import {
  isEffectivelyBusy, nextAvailableAt, upcomingBusyFrom, busyReason,
} from "@/lib/utils/serialize";

const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const win = (startOffset: number, endOffset: number | null, note: string | null = null) => ({
  startsAt: at(startOffset),
  endsAt: endOffset === null ? null : at(endOffset),
  note,
});

describe("overlaps", () => {
  it("detects two periods sharing time", () => {
    expect(overlaps(at(0), at(2 * DAY), at(DAY), at(3 * DAY))).toBe(true);
  });

  it("allows periods that merely touch at the boundary", () => {
    // Half-open on purpose: one ending at 17:00 and the next starting at 17:00
    // are consecutive, not conflicting. Treating them as a clash would block the
    // normal way of describing two back-to-back commitments.
    expect(overlaps(at(0), at(DAY), at(DAY), at(2 * DAY))).toBe(false);
  });

  it("allows periods that are fully apart", () => {
    expect(overlaps(at(0), at(DAY), at(3 * DAY), at(4 * DAY))).toBe(false);
  });

  // An open-ended period runs to infinity, so anything starting after it clashes.
  it("treats an open-ended period as running forever", () => {
    expect(overlaps(at(0), null, at(365 * DAY), at(366 * DAY))).toBe(true);
  });

  it("detects a clash when the NEW period is open-ended", () => {
    expect(overlaps(at(10 * DAY), null, at(20 * DAY), at(21 * DAY))).toBe(true);
  });

  it("does not clash when an open-ended period starts after the other ends", () => {
    expect(overlaps(at(5 * DAY), null, at(0), at(DAY))).toBe(false);
  });
});

describe("isWindowActive", () => {
  it("is active once started and not yet finished", () => {
    expect(isWindowActive(win(-HOUR, HOUR))).toBe(true);
  });
  it("is not active before it starts", () => {
    expect(isWindowActive(win(HOUR, 2 * HOUR))).toBe(false);
  });
  it("is not active after it ends", () => {
    expect(isWindowActive(win(-2 * HOUR, -HOUR))).toBe(false);
  });
  it("stays active with no end date", () => {
    expect(isWindowActive(win(-HOUR, null))).toBe(true);
  });
});

const free = { busy: false, busyUntil: null, busyNote: null };

describe("isEffectivelyBusy", () => {
  it("is false with no manual flag and no windows", () => {
    expect(isEffectivelyBusy(free, [])).toBe(false);
  });

  it("respects the existing manual switch", () => {
    expect(isEffectivelyBusy({ busy: true, busyUntil: null }, [])).toBe(true);
  });

  // The behaviour that already existed and must not regress.
  it("auto-reopens when busyUntil has passed — no job involved", () => {
    expect(isEffectivelyBusy({ busy: true, busyUntil: at(-HOUR) }, [])).toBe(false);
  });

  it("is busy while a scheduled window is running", () => {
    expect(isEffectivelyBusy(free, [win(-HOUR, HOUR)])).toBe(true);
  });

  it("is NOT busy for a window that hasn't started", () => {
    expect(isEffectivelyBusy(free, [win(DAY, 2 * DAY)])).toBe(false);
  });

  // The core promise of the design: a period expires on its own.
  it("auto-reopens the moment a window's end passes", () => {
    expect(isEffectivelyBusy(free, [win(-2 * DAY, -HOUR)])).toBe(false);
  });

  it("stays busy for an open-ended window", () => {
    expect(isEffectivelyBusy(free, [win(-DAY, null)])).toBe(true);
  });

  it("is busy if EITHER the manual switch or a window says so", () => {
    expect(isEffectivelyBusy({ busy: true, busyUntil: null }, [win(-2 * DAY, -DAY)])).toBe(true);
    expect(isEffectivelyBusy(free, [win(-HOUR, HOUR), win(2 * DAY, 3 * DAY)])).toBe(true);
  });
});

describe("nextAvailableAt", () => {
  it("is null when the company is free", () => {
    expect(nextAvailableAt(free, [])).toBeNull();
  });

  it("reports the end of a running window", () => {
    const w = win(-HOUR, HOUR);
    expect(nextAvailableAt(free, [w])).toBe(w.endsAt!.getTime());
  });

  it("is null for open-ended unavailability — there is no date to show", () => {
    expect(nextAvailableAt(free, [win(-HOUR, null)])).toBeNull();
    expect(nextAvailableAt({ busy: true, busyUntil: null }, [])).toBeNull();
  });

  // Overlapping periods mean busy until the FURTHEST end, not the nearest —
  // showing the nearest would promise a return date that isn't real.
  it("takes the furthest end when periods overlap", () => {
    const near = win(-HOUR, HOUR);
    const far = win(-HOUR, 5 * HOUR);
    expect(nextAvailableAt(free, [near, far])).toBe(far.endsAt!.getTime());
  });

  it("ignores windows that haven't started", () => {
    expect(nextAvailableAt(free, [win(DAY, 2 * DAY)])).toBeNull();
  });
});

describe("upcomingBusyFrom", () => {
  it("is null with nothing scheduled ahead", () => {
    expect(upcomingBusyFrom([win(-HOUR, HOUR)])).toBeNull();
  });

  it("reports the soonest future start", () => {
    const soon = win(2 * DAY, 3 * DAY);
    expect(upcomingBusyFrom([win(10 * DAY, 11 * DAY), soon])).toBe(soon.startsAt.getTime());
  });
});

describe("busyReason", () => {
  it("prefers the manual note when the manual switch is on", () => {
    expect(busyReason({ busy: true, busyUntil: null, busyNote: "On holiday" }, [])).toBe("On holiday");
  });

  it("falls back to the running window's note", () => {
    expect(busyReason(free, [win(-HOUR, HOUR, "Large project")])).toBe("Large project");
  });

  it("ignores notes on windows that aren't running", () => {
    expect(busyReason(free, [win(DAY, 2 * DAY, "Later")])).toBeNull();
  });
});
