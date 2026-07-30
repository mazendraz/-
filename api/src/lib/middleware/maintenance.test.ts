import { beforeEach, describe, expect, it, vi } from "vitest";

const isMaintenanceEnabled = vi.fn();
const getAuthUser = vi.fn();

vi.mock("@/lib/services/settings.service", () => ({
  isMaintenanceEnabled: () => isMaintenanceEnabled(),
}));
vi.mock("@/lib/auth", () => ({
  getAuthUser: (req: unknown) => getAuthUser(req),
}));

const { withMaintenance } = await import("@/lib/middleware/maintenance");
const { MaintenanceError } = await import("@/lib/utils/errors");

const req = {} as Parameters<ReturnType<typeof withMaintenance>>[0];
const handler = vi.fn(async () => new Response("ok"));
const gated = withMaintenance(handler);

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUser.mockRejectedValue(new Error("no token"));
});

describe("withMaintenance", () => {
  it("passes through when maintenance is off", async () => {
    isMaintenanceEnabled.mockResolvedValue(false);
    await expect(gated(req)).resolves.toBeInstanceOf(Response);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not pay for an auth lookup when maintenance is off", async () => {
    isMaintenanceEnabled.mockResolvedValue(false);
    await gated(req);
    expect(getAuthUser).not.toHaveBeenCalled();
  });

  it("throws 503 MAINTENANCE for an anonymous caller when enabled", async () => {
    isMaintenanceEnabled.mockResolvedValue(true);
    await expect(gated(req)).rejects.toBeInstanceOf(MaintenanceError);
    expect(handler).not.toHaveBeenCalled();
    const err = await gated(req).catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("MAINTENANCE");
  });

  it("lets an ADMIN through so they can verify before going live", async () => {
    isMaintenanceEnabled.mockResolvedValue(true);
    getAuthUser.mockResolvedValue({ role: "ADMIN" });
    await expect(gated(req)).resolves.toBeInstanceOf(Response);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("still blocks a signed-in PROVIDER on public endpoints", async () => {
    isMaintenanceEnabled.mockResolvedValue(true);
    getAuthUser.mockResolvedValue({ role: "PROVIDER" });
    await expect(gated(req)).rejects.toBeInstanceOf(MaintenanceError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats an auth lookup failure as 'not an admin', not a crash", async () => {
    isMaintenanceEnabled.mockResolvedValue(true);
    getAuthUser.mockRejectedValue(new Error("expired token"));
    await expect(gated(req)).rejects.toBeInstanceOf(MaintenanceError);
  });
});
