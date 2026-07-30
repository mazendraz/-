import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { bundleRuleSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

// Package discounts. Defined here in Feature B; Feature C is what actually
// applies them to a multi-item request total.
export const GET = providerOnly(async (_req: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return ok(await offerings.listBundleRules(user.companyId));
});

// Created as a DRAFT, same publish rule as an offering — a discount is content
// that reaches customers, so it goes through review before it can apply.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const input = bundleRuleSchema.parse(await request.json());
  return ok(await offerings.createBundleRule(user.companyId, input), 201);
});
