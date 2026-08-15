// Business Control Center — Finance. THE ledger: one typed Transaction table,
// no separate income/expenses/balance-field trio (see the delivered
// architecture doc §3.3/§6 for the rationale). Every "balance"-shaped number
// (Outstanding, Collected, Cash Position) is SUM(amount) WHERE ... computed on
// read here — nothing is ever stored as a running total.
import { prisma } from "@/lib/prisma";
import { TransactionStatus, TransactionType } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import {
  serializeTransaction,
  serializeFinancialAccount,
  serializeTransactionCategory,
  type TransactionWithRelations,
} from "@/lib/utils/serialize";
import type {
  ApiCashFlow,
  ApiCashFlowQuery,
  ApiFinanceOverview,
  ApiFinancialAccount,
  ApiFinanceQuery,
  ApiPage,
  ApiTransaction,
  ApiTransactionCategory,
  ApiTransactionListQuery,
} from "@/lib/apiTypes";
import type {
  CreateTransactionInput,
  FinancialAccountInput,
  TransactionCategoryInput,
  TransactionStatusPatchInput,
} from "@/lib/validation/finance";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** A Prisma client OR an active $transaction callback client — every function
 *  here accepts either, so recognizeCommission can run inside the SAME db
 *  transaction as the verification claim (see leadCompletion.service.verify),
 *  while everything else just uses the module-level `prisma` singleton. */
type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_COMMISSION_SETTING_KEY = "default_commission_percent";
// Used ONLY if an admin never set the AppSetting row — an obvious, documented
// placeholder rather than silently recognizing 0 revenue on every job if this
// step of onboarding gets missed.
const FALLBACK_COMMISSION_PERCENT = 10;

/** Company override if set, else the platform default from AppSetting, else
 *  the hardcoded fallback above. See the architecture doc §6 "Commission rate
 *  scope — DECIDED: one platform-wide default for now". */
export async function resolveCommissionPercent(db: Db, companyId: string): Promise<number> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { commissionPercent: true },
  });
  if (company?.commissionPercent != null) return Number(company.commissionPercent);

  const setting = await db.appSetting.findUnique({
    where: { key: DEFAULT_COMMISSION_SETTING_KEY },
    select: { value: true },
  });
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) ? parsed : FALLBACK_COMMISSION_PERCENT;
}

/** Admin: read the current platform default, for the Settings screen. */
export async function getDefaultCommissionPercent(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: DEFAULT_COMMISSION_SETTING_KEY },
    select: { value: true },
  });
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) ? parsed : FALLBACK_COMMISSION_PERCENT;
}

/** Admin: set the platform default commission %. */
export async function setDefaultCommissionPercent(percent: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: DEFAULT_COMMISSION_SETTING_KEY },
    create: { key: DEFAULT_COMMISSION_SETTING_KEY, value: String(percent) },
    update: { value: String(percent) },
  });
}

export interface RecognizeCommissionInput {
  leadId: string;
  companyId: string;
  /** The client-confirmed (or, if disputed, client-reported) final amount, EGP. */
  clientAmount: number;
  disputed: boolean;
}

/**
 * Create the COMMISSION_INCOME transaction for a just-verified lead.
 *
 * MUST be called with the SAME `tx` (Prisma.TransactionClient) that just
 * claimed the LeadCompletion PENDING -> resolved transition, so the two
 * commit atomically — a crash between "verified" and "revenue recorded" must
 * never produce a silently missing/duplicated number. See
 * leadCompletion.service.verify for the call site.
 *
 * Recognition rule (decided — architecture doc §6/§9):
 *   - Triggers on client verification, confirmed OR disputed.
 *   - Computed on clientAmount in BOTH cases. A disputed row is created with
 *     status DISPUTED (not PENDING) so Finance can see it isn't settled; an
 *     admin moves it to PENDING/COLLECTED/VOID once the dispute resolves
 *     (updateStatus below — no separate "resolve" endpoint needed).
 */
export async function recognizeCommission(
  tx: Prisma.TransactionClient,
  input: RecognizeCommissionInput,
): Promise<void> {
  // Idempotency guard: a lead is verified exactly once (the PENDING -> resolved
  // transition is claimed atomically by leadCompletion.service), so this is
  // belt-and-braces, not the primary defense — but a re-run must never
  // double-book revenue for the same lead.
  const existing = await tx.transaction.findFirst({
    where: { leadId: input.leadId, type: TransactionType.COMMISSION_INCOME },
    select: { id: true },
  });
  if (existing) return;

  const percent = await resolveCommissionPercent(tx, input.companyId);
  const amount = Math.round((input.clientAmount * percent) / 100);

  await tx.transaction.create({
    data: {
      type: TransactionType.COMMISSION_INCOME,
      status: input.disputed ? TransactionStatus.DISPUTED : TransactionStatus.PENDING,
      amount,
      leadId: input.leadId,
      companyId: input.companyId,
      note: `Commission @ ${percent}% of EGP ${input.clientAmount.toLocaleString("en-US")}`,
      // No human actor — system-generated. See Transaction.createdById comment.
      createdById: null,
    },
  });
}

// ── Transactions: list / create / status ──────────────────────────────────────

const transactionInclude = {
  account: { select: { name: true } },
  category: { select: { name: true } },
  lead: { select: { refNumber: true } },
  company: { select: { name: true } },
} satisfies Prisma.TransactionInclude;

function clampPaging(query: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function occurredAtWhere(from?: number, to?: number): Prisma.TransactionWhereInput {
  if (from == null && to == null) return {};
  return {
    occurredAt: {
      ...(from != null ? { gte: new Date(from) } : {}),
      ...(to != null ? { lte: new Date(to) } : {}),
    },
  };
}

/** Admin: paginated, filterable transaction ledger — backs the Transactions
 *  table and (filtered by status=DISPUTED) the "unresolved disputes" queue. */
export async function listTransactions(query: ApiTransactionListQuery): Promise<ApiPage<ApiTransaction>> {
  const search = query.search?.trim();
  const where: Prisma.TransactionWhereInput = {
    ...occurredAtWhere(query.from, query.to),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.accountId ? { accountId: query.accountId } : {}),
    // Matches note (free text), the provider's company name, or the related
    // lead's ref number — the three things a person actually recognizes a
    // transaction by. Server-side only, same as every other list screen.
    ...(search
      ? {
          OR: [
            { note: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            { lead: { refNumber: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { page, pageSize } = clampPaging(query);
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    data: rows.map((r) => serializeTransaction(r as TransactionWithRelations)),
    meta: { total, page, pageSize },
  };
}

/** Admin: manual EXPENSE or ADJUSTMENT entry. COMMISSION_INCOME is never
 *  created here — see ApiTransactionCreatePayload's doc comment. */
export async function createTransaction(
  input: CreateTransactionInput,
  actorId: string,
): Promise<ApiTransaction> {
  if (input.accountId) await assertAccountExists(input.accountId);
  if (input.categoryId) await assertCategoryExists(input.categoryId, input.type);
  if (input.companyId) await assertCompanyExists(input.companyId);

  const row = await prisma.transaction.create({
    data: {
      type: input.type,
      status: TransactionStatus.PENDING,
      amount: input.amount,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      companyId: input.companyId ?? null,
      note: input.note ?? null,
      attachments: input.attachments ?? [],
      occurredAt: input.occurredAt != null ? new Date(input.occurredAt) : new Date(),
      createdById: actorId,
    },
    include: transactionInclude,
  });
  return serializeTransaction(row as TransactionWithRelations);
}

/** Admin: status transition (e.g. mark a DISPUTED commission resolved and
 *  COLLECTED, mark an expense COLLECTED once paid, or VOID a mistake). Every
 *  call is audited by the route (see the finance/transactions/:id route) —
 *  this function only enforces that the target row exists. */
export async function updateTransactionStatus(
  id: string,
  input: TransactionStatusPatchInput,
): Promise<ApiTransaction> {
  const existing = await prisma.transaction.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Transaction");

  const row = await prisma.transaction.update({
    where: { id },
    data: { status: input.status },
    include: transactionInclude,
  });
  return serializeTransaction(row as TransactionWithRelations);
}

async function assertAccountExists(id: string): Promise<void> {
  const row = await prisma.financialAccount.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError("FinancialAccount");
}

async function assertCompanyExists(id: string): Promise<void> {
  const row = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError("Company");
}

async function assertCategoryExists(id: string, type: "EXPENSE" | "ADJUSTMENT"): Promise<void> {
  const row = await prisma.transactionCategory.findUnique({ where: { id }, select: { kind: true } });
  if (!row) throw new NotFoundError("TransactionCategory");
  if (row.kind !== type) {
    throw new ValidationError("Category kind does not match the transaction type", {
      categoryId: [`This category is for ${row.kind}, not ${type}`],
    });
  }
}

// ── Financial accounts (small, admin-managed list) ────────────────────────────

export async function listAccounts(): Promise<ApiFinancialAccount[]> {
  const rows = await prisma.financialAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeFinancialAccount);
}

export async function createAccount(input: FinancialAccountInput): Promise<ApiFinancialAccount> {
  const row = await prisma.financialAccount.create({ data: { name: input.name, type: input.type } });
  return serializeFinancialAccount(row);
}

// ── Transaction categories (small, admin-managed taxonomy) ───────────────────

export async function listCategories(): Promise<ApiTransactionCategory[]> {
  const rows = await prisma.transactionCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeTransactionCategory);
}

export async function createCategory(input: TransactionCategoryInput): Promise<ApiTransactionCategory> {
  const row = await prisma.transactionCategory.create({ data: { name: input.name, kind: input.kind } });
  return serializeTransactionCategory(row);
}

// ── Overview (the Finance Overview screen's KPI row) ──────────────────────────

async function sumTransactions(where: Prisma.TransactionWhereInput): Promise<number> {
  const result = await prisma.transaction.aggregate({ where, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}

/** SUM(LeadCompletion.clientAmount) for leads verified within the window —
 *  "Total Service Value Processed": gross, not Al Asima's cut. Uses
 *  verifiedAt (not the transaction's occurredAt) so this and the commission
 *  figures above are always describing the same underlying set of jobs. */
async function serviceValueProcessed(from?: number, to?: number): Promise<number> {
  const rows = await prisma.leadCompletion.aggregate({
    where: {
      verifiedAt: {
        not: null,
        ...(from != null ? { gte: new Date(from) } : {}),
        ...(to != null ? { lte: new Date(to) } : {}),
      },
    },
    _sum: { clientAmount: true },
  });
  return rows._sum.clientAmount ?? 0;
}

/** % change from `previous` to `current`. null (not 0 or Infinity) when
 *  `previous` is zero — "undefined" is the honest answer, not "+∞%" or a
 *  misleading "+100%" against a zero base. Small duplicated copy of
 *  desktopOverview.service.ts's percentChange — same reasoning as
 *  localBucketKey just below: two call sites, no third planned. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Sums the same 6 aggregates financeOverview() returns, for an arbitrary
 *  window — used for both the current window and (when `from` is given) the
 *  immediately-preceding one, so the two calls stay byte-for-byte the same
 *  shape of query. */
async function financeAggregates(
  from?: number,
  to?: number,
): Promise<{
  serviceValue: number;
  recognizedRevenue: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  disputedRevenue: number;
  totalExpenses: number;
  collectedExpenses: number;
}> {
  const range = occurredAtWhere(from, to);
  const income = (status?: TransactionStatus) =>
    sumTransactions({ ...range, type: TransactionType.COMMISSION_INCOME, ...(status ? { status } : { status: { not: TransactionStatus.VOID } } ) });
  const expense = (status?: TransactionStatus) =>
    sumTransactions({ ...range, type: TransactionType.EXPENSE, ...(status ? { status } : { status: { not: TransactionStatus.VOID } } ) });

  const [serviceValue, recognizedRevenue, collectedRevenue, outstandingRevenue, disputedRevenue, totalExpenses, collectedExpenses] =
    await Promise.all([
      serviceValueProcessed(from, to),
      income(),
      income(TransactionStatus.COLLECTED),
      income(TransactionStatus.PENDING),
      income(TransactionStatus.DISPUTED),
      expense(),
      expense(TransactionStatus.COLLECTED),
    ]);

  return { serviceValue, recognizedRevenue, collectedRevenue, outstandingRevenue, disputedRevenue, totalExpenses, collectedExpenses };
}

export async function financeOverview(query: ApiFinanceQuery): Promise<ApiFinanceOverview> {
  const current = await financeAggregates(query.from, query.to);
  const netIncome = current.recognizedRevenue - current.totalExpenses;
  const cashPosition = current.collectedRevenue - current.collectedExpenses;

  // Previous-period comparison ("+X% vs last month" on every KPI card, per
  // the financial_command_center_2 mockup) needs a defined window to compare
  // against — an unbounded "all time" query (query.from == null) has no
  // "period before this one" to diff against, so trend is null rather than
  // a meaningless comparison.
  let trend: ApiFinanceOverview["trend"] = null;
  if (query.from != null) {
    const windowMs = Math.max(0, (query.to ?? Date.now()) - query.from);
    // -1ms on the upper bound: financeAggregates/occurredAtWhere treats both
    // ends as inclusive (gte/lte), and the current window's lower bound is
    // exactly `query.from` — without this, a transaction occurring at that
    // exact instant (e.g. a date-only entry defaulting to midnight) would be
    // summed into BOTH the current and previous window, skewing every
    // trend.*Percent figure.
    const previous = await financeAggregates(query.from - windowMs, query.from - 1);
    const prevNetIncome = previous.recognizedRevenue - previous.totalExpenses;
    const prevCashPosition = previous.collectedRevenue - previous.collectedExpenses;
    trend = {
      serviceValueProcessedPercent: percentChange(current.serviceValue, previous.serviceValue),
      recognizedRevenuePercent: percentChange(current.recognizedRevenue, previous.recognizedRevenue),
      collectedRevenuePercent: percentChange(current.collectedRevenue, previous.collectedRevenue),
      outstandingRevenuePercent: percentChange(current.outstandingRevenue, previous.outstandingRevenue),
      disputedRevenuePercent: percentChange(current.disputedRevenue, previous.disputedRevenue),
      totalExpensesPercent: percentChange(current.totalExpenses, previous.totalExpenses),
      netIncomePercent: percentChange(netIncome, prevNetIncome),
      cashPositionPercent: percentChange(cashPosition, prevCashPosition),
    };
  }

  return {
    serviceValueProcessed: current.serviceValue,
    recognizedRevenue: current.recognizedRevenue,
    collectedRevenue: current.collectedRevenue,
    outstandingRevenue: current.outstandingRevenue,
    disputedRevenue: current.disputedRevenue,
    totalExpenses: current.totalExpenses,
    // Accrual-basis: what's been recognized minus what's been spent.
    netIncome,
    // Cash-basis: what has actually moved.
    cashPosition,
    commissionPipeline: { expected: current.recognizedRevenue, collected: current.collectedRevenue },
    trend,
  };
}

// ── Cash Flow (the Cash Flow screen's KPI row + trend chart) ─────────────────

function clampCashFlowDays(value: number | undefined): number {
  const n = Math.trunc(value ?? 1) || 1;
  return Math.min(365, Math.max(1, n));
}

/** Bucket key in the SERVER's local time zone — same convention as
 *  desktopOverview.service.ts's localBucketKey (kept as a separate, tiny
 *  copy rather than a shared import: two call sites, no third planned, and
 *  a shared utils/bucketing.ts would be more indirection than the ~8 lines
 *  it'd save). */
function localBucketKey(date: Date, hourly: boolean): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (!hourly) return `${y}-${m}-${d}`;
  const h = String(date.getHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

/**
 * Admin: the Cash Flow screen. moneyIn/moneyOut/netCashFlow/series are all
 * scoped to the selected window (Today/This Week/This Month/Custom — see
 * ApiCashFlowQuery's doc comment); cashBalance is deliberately NOT windowed —
 * see ApiCashFlow's doc comment for why a running balance and a windowed
 * "net movement this period" are two different, both-real numbers.
 *
 * "Money in"/"money out" reads COLLECTED transactions by `updatedAt` (the
 * moment status flips to COLLECTED), not `occurredAt` (when the transaction
 * was first recorded) — same proxy desktopOverview.service.ts's
 * recentActivity already uses for "commission collected" events, since there
 * is no separate collectedAt column on Transaction.
 */
export async function financeCashFlow(query: ApiCashFlowQuery): Promise<ApiCashFlow> {
  const days = clampCashFlowDays(query.days);
  const now = Date.now();
  const from = now - days * 86_400_000;

  const collectedWhere = (type: TransactionType, extraTimeFilter: Prisma.TransactionWhereInput) => ({
    type,
    status: TransactionStatus.COLLECTED,
    ...extraTimeFilter,
  });

  const [moneyIn, moneyOut, allTimeIn, allTimeOut, incomeRows, expenseRows] = await Promise.all([
    sumTransactions(collectedWhere(TransactionType.COMMISSION_INCOME, { updatedAt: { gte: new Date(from) } })),
    sumTransactions(collectedWhere(TransactionType.EXPENSE, { updatedAt: { gte: new Date(from) } })),
    sumTransactions(collectedWhere(TransactionType.COMMISSION_INCOME, {})),
    sumTransactions(collectedWhere(TransactionType.EXPENSE, {})),
    prisma.transaction.findMany({
      where: collectedWhere(TransactionType.COMMISSION_INCOME, { updatedAt: { gte: new Date(from) } }),
      select: { updatedAt: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: collectedWhere(TransactionType.EXPENSE, { updatedAt: { gte: new Date(from) } }),
      select: { updatedAt: true, amount: true },
    }),
  ]);

  const hourly = days === 1;
  const bucketCount = hourly ? 24 : days;
  const stepMs = hourly ? 3_600_000 : 86_400_000;
  const series: ApiCashFlow["series"] = [];
  const bucketIndex = new Map<string, number>();
  for (let i = bucketCount - 1; i >= 0; i--) {
    const key = localBucketKey(new Date(now - i * stepMs), hourly);
    bucketIndex.set(key, series.length);
    series.push({ date: key, moneyIn: 0, moneyOut: 0 });
  }
  for (const r of incomeRows) {
    const idx = bucketIndex.get(localBucketKey(r.updatedAt, hourly));
    if (idx != null) series[idx].moneyIn += r.amount;
  }
  for (const r of expenseRows) {
    const idx = bucketIndex.get(localBucketKey(r.updatedAt, hourly));
    if (idx != null) series[idx].moneyOut += r.amount;
  }

  return {
    moneyIn,
    moneyOut,
    netCashFlow: moneyIn - moneyOut,
    cashBalance: allTimeIn - allTimeOut,
    series,
  };
}
