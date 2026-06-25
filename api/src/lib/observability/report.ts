// Error reporting. Always logs locally; additionally ships the event to Sentry
// when SENTRY_DSN is set — over the plain HTTP envelope API, so there is no SDK
// dependency (matches the no-SDK approach in notifications.service). Designed to
// NEVER throw: a reporting failure must not break the request that triggered it.
import { randomUUID } from "node:crypto";

const DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV ?? "development";

export interface ParsedDsn {
  publicKey: string;
  projectId: string;
  envelopeUrl: string;
}

/** Parse a Sentry DSN (https://<key>@<host>/<projectId>) → ingest coordinates. */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      projectId,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

export interface ErrorContext {
  /** Where the error happened, e.g. the request path. */
  route?: string;
  [key: string]: unknown;
}

/**
 * Build a Sentry envelope (newline-delimited: envelope header, item header, then
 * the event). Pure function of its inputs — unit-testable without sending.
 */
export function buildEnvelope(
  err: unknown,
  ctx: ErrorContext,
  eventId: string,
  now: Date,
): string {
  const error = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: ENVIRONMENT,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack ? { frames: [{ function: error.stack.split("\n")[1]?.trim() }] } : undefined,
        },
      ],
    },
    extra: ctx,
  };
  const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: now.toISOString() });
  const itemHeader = JSON.stringify({ type: "event" });
  return `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;
}

/** Log an error and (when configured) report it to Sentry. Never throws. */
export async function captureException(
  err: unknown,
  ctx: ErrorContext = {},
): Promise<void> {
  console.error(`[error]${ctx.route ? ` ${ctx.route}` : ""}`, err);

  if (!DSN) return;
  const dsn = parseDsn(DSN);
  if (!dsn) return;

  try {
    const eventId = randomUUID().replace(/-/g, "");
    const body = buildEnvelope(err, ctx, eventId, new Date());
    await fetch(dsn.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=al-assema/1.0`,
      },
      body,
    });
  } catch (reportErr) {
    console.error("[sentry] failed to report error:", reportErr);
  }
}
