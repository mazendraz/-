// Schedule background work to run AFTER the HTTP response is sent.
//
// Why this exists: notifications (email/web-push) must never block or fail the
// response, but plain `void promise` fire-and-forget is unsafe on serverless — the
// platform can freeze/kill the instance the moment the response returns, dropping
// the in-flight sends. Next's `after()` solves that: on serverless it keeps the
// function alive until the scheduled work settles; on a long-lived host it's the
// same non-blocking behavior we already had.
//
// The catch: `after()` THROWS when called outside a request scope (unit/integration
// tests that invoke services/handlers directly, or standalone scripts). So we guard
// it and fall back to detached fire-and-forget there. Either way, the work is fully
// isolated — it can never throw into, delay, or fail the caller.
import { after } from "next/server";

export function runAfterResponse(work: () => Promise<unknown>): void {
  const guarded = async (): Promise<void> => {
    try {
      await work();
    } catch (err) {
      console.error("[after] background work failed:", err);
    }
  };

  try {
    after(guarded);
  } catch {
    // No request scope (tests/scripts) — run detached, best-effort.
    void guarded();
  }
}
