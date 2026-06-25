import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { loginSchema } from "@/lib/validation/auth";
import { signToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ApiAuthResponse } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// Throttle login attempts to slow brute-force (per IP).
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// POST /api/auth/login → { token, user }. Token is returned in the body.
export const POST = withErrors(async (request: NextRequest) => {
  const rl = await rateLimit(`login:${clientIp(request)}`, LOGIN_RATE_LIMIT);
  if (!rl.ok) {
    const seconds = Math.ceil(rl.retryAfterMs / 1000);
    throw new RateLimitError(`Too many attempts. Try again in ${seconds}s.`);
  }

  const { email, password } = loginSchema.parse(await request.json());

  const user = await prisma.user.findUnique({ where: { email } });
  // Generic message — never reveal whether the email exists.
  const invalid = new UnauthorizedError("Invalid email or password");
  if (!user || !user.isActive) throw invalid;
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

  const token = await signToken({
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
  });

  const body: ApiAuthResponse = {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
  };
  return ok(body);
});
