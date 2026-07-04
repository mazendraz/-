// Bounded JSON body reader for public (unauthenticated) submit endpoints.
//
// Public POSTs call request.json() BEFORE validation, so without a cap a bot can
// force full parsing of a multi-megabyte body on every request — cheap for the
// attacker, costly for us. This reads the body with two guards:
//   1. A fast Content-Length pre-check — reject before buffering anything.
//   2. An authoritative byte-length check on the actual text — Content-Length is
//      absent on chunked requests and can be understated, so the real bytes win.
//
// The reverse proxy should ALSO cap body size (see deploy/Caddyfile) as the outer
// layer; this is defense-in-depth so the app stays protected even without it.
import type { NextRequest } from "next/server";
import { PayloadTooLargeError, ValidationError } from "@/lib/utils/errors";

// Public submit payloads are small (longest field is a 2000-char description).
// 64 KB is comfortably above any legitimate body and well below a memory concern.
export const MAX_PUBLIC_BODY_BYTES = 64 * 1024;

/**
 * Read and JSON-parse a request body, rejecting anything over `maxBytes` (413) and
 * anything that isn't a JSON object (400). Returns the parsed object.
 */
export async function readJsonObject(
  request: NextRequest,
  maxBytes: number = MAX_PUBLIC_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new PayloadTooLargeError();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be a JSON object");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return raw as Record<string, unknown>;
}
