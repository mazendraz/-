import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Readiness probe — unlike /health (liveness only), this verifies the database is
// reachable. Returns 503 when the DB is down so a load balancer can drop the
// instance from rotation. Exempt from the API-key gate in proxy.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
