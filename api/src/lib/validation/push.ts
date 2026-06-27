// Zod schemas for Web Push subscription endpoints. The shape mirrors the browser's
// PushSubscription.toJSON() (endpoint + keys.p256dh + keys.auth).
import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});
