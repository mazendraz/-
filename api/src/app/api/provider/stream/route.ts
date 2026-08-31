import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withAuth } from "@/lib/middleware/withAuth";
import { ADMIN_CHANNEL, channelForCompany } from "@/lib/services/realtime.service";
import { sseResponse, type SseChannel } from "@/lib/utils/sseStream";

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
    const channels: SseChannel[] = [];
    if (user.companyId) channels.push({ channel: channelForCompany(user.companyId) });
    if (user.role === "ADMIN") {
      // Every admin subscribes to the SAME channel, so capping by channel
      // alone would split one shared budget of 8 connections across every
      // admin account on the platform — the Business App mobile phase found
      // this live (docs/architecture/business-app/phase-4-realtime-push.md,
      // B3): a few web dashboards left open already ate most of the budget,
      // and an admin's phone was refused with "close a tab" — advice that
      // makes no sense on a phone. capKey scopes the cap to THIS admin
      // while every admin still receives every event published to the real
      // `admins` channel — see sseStream.ts's SseChannel for the mechanism.
      channels.push({ channel: ADMIN_CHANNEL, capKey: `admins:${user.id}` });
    }
    return sseResponse(request, channels);
  }),
);
