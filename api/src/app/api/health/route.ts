import { NextResponse } from "next/server";

// Liveness probe — no DB access, always dynamic.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}
