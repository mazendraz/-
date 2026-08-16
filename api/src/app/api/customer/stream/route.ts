import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { channelForCustomer } from "@/lib/services/realtime.service";
import { sseResponse } from "@/lib/utils/sseStream";

export const dynamic = "force-dynamic";
// Node runtime, not Edge: the hub is in-process module state, and an Edge
// invocation would neither see it nor be the same instance twice.
export const runtime = "nodejs";

// GET /api/v1/customer/stream — live events for the signed-in customer.
//
// Replaces the 8-second chat poll for anyone with an account. Events say only
// "something changed"; the client refetches through the normal endpoints, which
// already enforce who may read what. Nothing sensitive travels on this channel,
// so a subscription bug can leak a notification but never a message.
//
// The legacy anonymous path (reference number + tracking token) keeps polling.
// EventSource cannot send the X-Lead-Token header that gate requires, and moving
// the token into the query string would undo a deliberate decision to keep it
// out of access logs.
export const GET = withErrors(
  withCustomerAuth(async (request: NextRequest, _context, customer) =>
    sseResponse(request, [channelForCustomer(customer.id)]),
  ),
);
