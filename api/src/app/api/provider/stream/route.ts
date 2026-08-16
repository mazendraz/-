import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withAuth } from "@/lib/middleware/withAuth";
import { ADMIN_CHANNEL, channelForCompany } from "@/lib/services/realtime.service";
import { sseResponse } from "@/lib/utils/sseStream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/provider/stream — live events for a staff member.
//
// A provider subscribes to their own company; an admin to the platform-wide
// channel. This is the half of the mobile plan that earns its keep: a lead
// landing on the phone in a provider's pocket while they are on site.
//
// The channel list is derived from the authenticated user, never from anything
// the caller sends — a query parameter here would be a way to subscribe to
// another company's activity.
export const GET = withErrors(
  withAuth(async (request: NextRequest, _context, user) => {
    const channels: string[] = [];
    if (user.companyId) channels.push(channelForCompany(user.companyId));
    if (user.role === "ADMIN") channels.push(ADMIN_CHANNEL);
    return sseResponse(request, channels);
  }),
);
