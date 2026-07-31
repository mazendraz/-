// The admin-only chat-notification mute switch (see ApiAdminNotificationSettings).
// Leads always notify — there is deliberately no toggle for those, so the only
// behavior worth locking down here is the chat one: default-on, persists a mute,
// and can be flipped back.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CHAT_NOTIFY_KEY,
  getAdminNotificationSettings,
  isAdminChatNotifyEnabled,
  setAdminChatNotifyEnabled,
} from "@/lib/services/settings.service";

afterEach(async () => {
  await prisma.appSetting.deleteMany({ where: { key: ADMIN_CHAT_NOTIFY_KEY } });
});

describe("admin chat notification preference", () => {
  it("defaults to enabled when nobody has ever touched it", async () => {
    expect(await isAdminChatNotifyEnabled()).toBe(true);
    expect(await getAdminNotificationSettings()).toEqual({ chatEnabled: true });
  });

  it("persists a mute, and can be flipped back on", async () => {
    await setAdminChatNotifyEnabled(false);
    expect(await isAdminChatNotifyEnabled()).toBe(false);
    expect(await getAdminNotificationSettings()).toEqual({ chatEnabled: false });

    await setAdminChatNotifyEnabled(true);
    expect(await isAdminChatNotifyEnabled()).toBe(true);
  });
});
