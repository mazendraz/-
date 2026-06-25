import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withAuth } from "@/lib/middleware/withAuth";
import { toApiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/auth/me → current user (resolved from the Bearer token). 401 if absent.
export const GET = withErrors(
  withAuth(async (_request, _context, user) => ok(toApiUser(user))),
);
