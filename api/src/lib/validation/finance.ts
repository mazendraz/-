// Zod schemas for the Business Control Center Finance endpoints. Deliberately
// does NOT include a "type: COMMISSION_INCOME" option anywhere here — see
// ApiTransactionCreatePayload's comment: commission rows are only ever
// created by the system (finance.service.recognizeCommission), never by hand.
import { z } from "zod";
import { sanitizedOptionalText } from "@/lib/utils/sanitize";

export const createTransactionSchema = z.object({
  type: z.enum(["EXPENSE", "ADJUSTMENT"]),
  amount: z.number().int().min(0),
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  note: sanitizedOptionalText(2000).optional(),
  attachments: z.array(z.string().trim().min(1).max(2000)).max(10).optional(),
  occurredAt: z.number().int().optional(), // epoch ms; defaults to now in the service
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const transactionStatusPatchSchema = z.object({
  status: z.enum(["PENDING", "DISPUTED", "COLLECTED", "VOID"]),
});
export type TransactionStatusPatchInput = z.infer<typeof transactionStatusPatchSchema>;

export const financialAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["CASH", "BANK", "PROVIDER_PAYABLE"]),
});
export type FinancialAccountInput = z.infer<typeof financialAccountSchema>;

export const transactionCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["COMMISSION_INCOME", "EXPENSE", "ADJUSTMENT"]),
});
export type TransactionCategoryInput = z.infer<typeof transactionCategorySchema>;

// Admin: set the platform-wide default commission % (AppSetting
// "default_commission_percent") — see finance.service.ts resolveCommissionPercent.
export const defaultCommissionSchema = z.object({
  percent: z.number().min(0).max(100),
});
export type DefaultCommissionInput = z.infer<typeof defaultCommissionSchema>;

// Admin: set (or clear, via null) ONE company's commission % override —
// PATCH /admin/companies/:id/commission. See companies.service.setCommissionPercent.
export const companyCommissionSchema = z.object({
  percent: z.number().min(0).max(100).nullable(),
});
export type CompanyCommissionInput = z.infer<typeof companyCommissionSchema>;
