// Tracking-token helpers: a high-entropy per-lead secret that gates public status
// tracking and the one-time review (replacing the low-entropy phone number).
import { randomBytes, timingSafeEqual } from "node:crypto";

/** 24-char URL-safe token (~144 bits) — unguessable, safe in a query string. */
export function generateTrackingToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Constant-time string compare. False on any length/charset mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
