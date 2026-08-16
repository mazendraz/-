import { z } from "zod";

/**
 * Registration payload for a NATIVE push device.
 *
 * The token is checked for Expo's shape rather than accepted as any string.
 * That is not security — a token is not a secret — it is a guard against
 * storing a Web Push endpoint, an FCM token, or a placeholder from a
 * half-finished client in a table whose only consumer posts it to Expo, where
 * it would fail once per notification forever.
 */
export const pushDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(
      /^Expo(nent)?PushToken\[[^\]]+\]$/,
      "Not an Expo push token.",
    ),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().trim().max(80).optional(),
});

export const pushDeviceUnregisterSchema = z.object({
  token: z.string().trim().min(1).max(256),
});
