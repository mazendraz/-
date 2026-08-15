// Ported from stitch_al_asima_command_center/financial_command_center*/code.html
// (transactions table + filter bar + drawer). One real screen, reused for
// four nav destinations (Income / Expenses / Transactions / Outstanding) —
// same pattern as OperationsScreen — that differ only in which type/status
// the table opens locked to, and whether "Add Expense" is offered.
//
// Sorting: the backend orders the ledger by occurredAt desc only (see
// finance.service.ts's listTransactions) — there's no column-sort param yet.
// Rather than build a column-sort control that only re-sorts the current
// page (misleading on a paginated, server-driven list), this screen keeps
// the backend's date-desc order and flags the gap here instead of faking it.
//
// "Payment method" (from the Expenses field list) maps to the linked
// FinancialAccount's `type` (CASH/BANK/PROVIDER_PAYABLE) — shown as a badge
// next to the account name in the drawer — since Transaction itself has no
// separate payment-method column. "Reference" maps to the transaction's own
// id (what a bookkeeper would actually use to look this row up), since there
// is no separate reference-number field. Attachment UPLOAD isn't wired up
// (no admin-facing upload endpoint exists yet) — existing attachment URLs on
// a row still render as links; the create form has no file picker.
import { useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePeriod } from "@/lib/dateRange";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type {
  ApiFinancialAccount,
  ApiPage,
  ApiTransaction,
  ApiTransactionCategory,
  ApiTransactionStatus,
  ApiTransactionType,
} from "@/lib/apiTypes";

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<ApiTransactionType, string> = {
  COMMISSION_INCOME: "Commission Income",
  EXPENSE: "Expense",
  ADJUSTMENT: "Adjustment",
};

const STATUS_META: Record<ApiTransactionStatus, { label: string; dot: string; classes: string }> = {
  PENDING: { label: "Pending", dot: "bg-secondary", classes: "bg-secondary-container/30 text-on-secondary-container border-secondary-container" },
  DISPUTED: { label: "Disputed", dot: "bg-error", classes: "bg-error-container/30 text-on-error-container border-error-container" },
  COLLECTED: { label: "Collected", dot: "bg-primary", classes: "bg-primary/5 text-primary border-primary/20" },
  VOID: { label: "Void", dot: "bg-outline", classes: "bg-surface-container text-on-surface-variant border-outline-variant opacity-70" },
};

const ACCOUNT_TYPE_LABEL: Record<ApiFinancialAccount["type"], string> = {
  CASH: "Cash",
  BANK: "Bank",
  PROVIDER_PAYABLE: "Provider Payable",
};

// Which status transitions are offered from each current status — mirrors
// what actually makes business sense (see finance.service.ts's
// updateTransactionStatus doc comment): PENDING -> COLLECTED or VOID;
// DISPUTED -> PENDING/COLLECTED (once resolved) or VOID; terminal states
// offer nothing.
const STATUS_ACTIONS: Record<ApiTransactionStatus, ApiTransactionStatus[]> = {
  PENDING: ["COLLECTED", "VOID"],
  DISPUTED: ["PENDING", "COLLECTED", "VOID"],
  COLLECTED: ["VOID"],
  VOID: [],
};

export function FinanceLedgerScreen({
  title,
  description,
  lockType,
  lockStatus,
  allowCreate,
  showAging,
  emptyIcon = "receipt_long",
}: {
  title: string;
  description: string;
  /** Fixes the type filter and hides the type selector — Income (COMMISSION_INCOME) / Expenses (EXPENSE). Undefined = Transactions (all types). */
  lockType?: ApiTransactionType;
  /** Fixes the status filter — Outstanding (PENDING). */
  lockStatus?: ApiTransactionStatus;
  /** Show the "Add Expense" action (Expenses only, and only for finance:write). */
  allowCreate?: boolean;
  /** Extra "Aging" column — days since occurredAt (Outstanding only). */
  showAging?: boolean;
  emptyIcon?: string;
}) {
  const { can } = useAuth();
  const { days } = usePeriod();
  // Date.now() only ever runs inside this lazy useState initializer (once,
  // on mount) — the react-hooks/purity rule flags a direct Date.now() call
  // in the render body (even inside useMemo), so "now" is captured once as
  // an anchor and `from` derives from it + `days`. The small drift between
  // mount and a later tab click is immaterial for a trailing-N-days window.
  const [anchor] = useState(() => Date.now());
  const from = useMemo(() => anchor - days * 86_400_000, [anchor, days]);

  const [type, setType] = useState<ApiTransactionType | "">(lockType ?? "");
  const [status, setStatus] = useState<ApiTransactionStatus | "">(lockStatus ?? "");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiTransaction | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const search = useDebouncedValue(searchInput, 350);

  // Switching the shared period tab (Today/This Week/This Month/Custom)
  // changes `from` the same way an in-page filter does — without resetting
  // `page`, staying on e.g. page 3 after narrowing the window can request a
  // page past the new, smaller result set and render a false "No
  // transactions match these filters" even though matching rows exist on
  // page 1. Adjusting state during render (React's documented pattern for
  // "reset state when a prop/value changes") rather than in a useEffect
  // avoids an extra cascading render pass.
  const [prevFrom, setPrevFrom] = useState(from);
  if (from !== prevFrom) {
    setPrevFrom(from);
    setPage(1);
  }

  const accounts = useFetch<ApiFinancialAccount[]>(() => apiGet<ApiFinancialAccount[]>("/admin/finance/accounts"), []);
  const categories = useFetch<ApiTransactionCategory[]>(() => apiGet<ApiTransactionCategory[]>("/admin/finance/categories"), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), from: String(from) });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (accountId) params.set("accountId", accountId);
    if (categoryId) params.set("categoryId", categoryId);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [type, status, accountId, categoryId, search, page, from]);

  const list = useFetch<ApiPage<ApiTransaction>>(() => apiGet<ApiPage<ApiTransaction>>(`/admin/finance/transactions?${query}`), [query]);

  const accountsById = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);

  function resetToPage1<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  const relevantCategories = (categories.data ?? []).filter((c) => !lockType || c.kind === lockType);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          allowCreate && can("finance:write") ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md font-medium text-on-primary transition-colors hover:bg-primary/90"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Expense
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col rounded border border-outline-variant bg-surface-container-lowest">
        <div className="flex flex-wrap items-center gap-4 border-b border-surface-container-high bg-surface-bright p-component-padding-x">
          <span className="flex items-center font-label-md text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined mr-1 align-middle text-[16px]">filter_list</span>
            Filters
          </span>
          {!lockType && (
            <FilterSelect
              value={type}
              onChange={(v) => resetToPage1(setType)(v as ApiTransactionType | "")}
              placeholder="All Types"
              options={(Object.keys(TYPE_LABEL) as ApiTransactionType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />
          )}
          {!lockStatus && (
            <FilterSelect
              value={status}
              onChange={(v) => resetToPage1(setStatus)(v as ApiTransactionStatus | "")}
              placeholder="All Statuses"
              options={(Object.keys(STATUS_META) as ApiTransactionStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))}
            />
          )}
          <FilterSelect
            value={accountId}
            onChange={resetToPage1(setAccountId)}
            placeholder="All Accounts"
            options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
          <FilterSelect
            value={categoryId}
            onChange={resetToPage1(setCategoryId)}
            placeholder="All Categories"
            options={relevantCategories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">search</span>
            <input
              value={searchInput}
              onChange={(e) => resetToPage1(setSearchInput)(e.target.value)}
              placeholder="Search reference, provider, note…"
              className="w-72 rounded border border-outline-variant bg-surface py-1.5 pl-9 pr-3 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {list.loading && <LoadingState label="Loading transactions…" />}
        {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.refetch} />}
        {!list.loading && !list.error && list.data && list.data.data.length === 0 && (
          <EmptyState icon={emptyIcon} title="No transactions match these filters" message="Try a different status, account or search term." />
        )}
        {!list.loading && !list.error && list.data && list.data.data.length > 0 && (
          <>
            <LedgerTable rows={list.data.data} onSelect={setSelected} showAging={Boolean(showAging)} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onPageChange={setPage} />
          </>
        )}
      </div>

      {selected && (
        <TransactionDrawer
          transaction={selected}
          account={selected.accountId ? accountsById.get(selected.accountId) : undefined}
          canWrite={can("finance:write")}
          onClose={() => setSelected(null)}
          onStatusChanged={(updated) => {
            setSelected(updated);
            list.refetch();
          }}
        />
      )}

      {createOpen && (
        <CreateExpenseModal
          accounts={accounts.data ?? []}
          categories={(categories.data ?? []).filter((c) => c.kind === "EXPENSE")}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            list.refetch();
          }}
        />
      )}
    </>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded border border-outline-variant bg-surface px-3 py-1.5 pr-8 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-outline">
        arrow_drop_down
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ApiTransactionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.classes}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function relatedLabel(t: ApiTransaction): string {
  if (t.leadRefNumber && t.companyName) return `${t.leadRefNumber} — ${t.companyName}`;
  if (t.companyName) return t.companyName;
  if (t.leadRefNumber) return t.leadRefNumber;
  return "—";
}

function agingDays(occurredAt: number): number {
  return Math.max(0, Math.floor((Date.now() - occurredAt) / 86_400_000));
}

function LedgerTable({
  rows,
  onSelect,
  showAging,
}: {
  rows: ApiTransaction[];
  onSelect: (t: ApiTransaction) => void;
  showAging: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-surface-container-low font-label-md text-label-md uppercase text-on-surface-variant">
          <tr>
            <th className="w-32 border-b border-surface-container-high px-4 py-3 font-semibold">Date</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Related</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Category</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Account</th>
            <th className="w-32 border-b border-surface-container-high px-4 py-3 text-right font-semibold">Amount</th>
            <th className="w-28 border-b border-surface-container-high px-4 py-3 font-semibold">Status</th>
            {showAging && <th className="w-24 border-b border-surface-container-high px-4 py-3 text-right font-semibold">Aging</th>}
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-high bg-surface-container-lowest font-body-sm text-body-sm text-on-surface">
          {rows.map((t) => (
            <tr key={t.id} onClick={() => onSelect(t)} className="group cursor-pointer transition-colors hover:bg-surface-bright">
              <td className="px-4 py-3 text-on-surface-variant">{formatDate(t.occurredAt)}</td>
              <td className="px-4 py-3 font-medium">{relatedLabel(t)}</td>
              <td className="px-4 py-3 text-on-surface-variant">{t.categoryName ?? "—"}</td>
              <td className="px-4 py-3 text-on-surface-variant">{t.accountName ?? "—"}</td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  t.type === "EXPENSE" ? "text-error" : "text-primary"
                }`}
              >
                {t.type === "EXPENSE" ? "− " : "+ "}
                {formatCurrency(t.amount)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              {showAging && (
                <td className={`px-4 py-3 text-right tabular-nums ${agingDays(t.occurredAt) > 14 ? "font-medium text-error" : "text-on-surface-variant"}`}>
                  {agingDays(t.occurredAt)}d
                </td>
              )}
              <td className="px-4 py-3 font-mono-data text-mono-data text-on-surface-variant group-hover:text-primary">
                {t.note ? t.note.slice(0, 40) : t.id.slice(0, 8)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionDrawer({
  transaction,
  account,
  canWrite,
  onClose,
  onStatusChanged,
}: {
  transaction: ApiTransaction;
  account: ApiFinancialAccount | undefined;
  canWrite: boolean;
  onClose: () => void;
  onStatusChanged: (updated: ApiTransaction) => void;
}) {
  const [pending, setPending] = useState<ApiTransactionStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function applyStatus(next: ApiTransactionStatus) {
    setPending(next);
    setActionError(null);
    try {
      const updated = await apiPatch<ApiTransaction>(`/admin/finance/transactions/${transaction.id}`, { status: next });
      onStatusChanged(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-background/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-6 shadow-lift">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-mono-data text-mono-data text-on-surface-variant">{transaction.id.slice(0, 8)}</p>
            <h2 className="font-headline-sm text-headline-sm text-primary">{TYPE_LABEL[transaction.type]}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <StatusBadge status={transaction.status} />
          <span
            className={`font-headline-sm text-headline-sm ${transaction.type === "EXPENSE" ? "text-error" : "text-primary"}`}
          >
            {transaction.type === "EXPENSE" ? "− " : "+ "}
            {formatCurrency(transaction.amount)}
          </span>
        </div>

        <DetailSection title="Details">
          <DetailRow label="Date" value={formatDateTime(transaction.occurredAt)} />
          <DetailRow label="Related" value={relatedLabel(transaction)} />
          <DetailRow label="Category" value={transaction.categoryName ?? "—"} />
          <DetailRow
            label="Account"
            value={account ? `${account.name} (${ACCOUNT_TYPE_LABEL[account.type]})` : transaction.accountName ?? "—"}
          />
          <DetailRow label="Reference" value={transaction.id} mono />
          <DetailRow label="Created by" value={transaction.createdById ? "Admin (manual entry)" : "System (automatic)"} />
          <DetailRow label="Recorded" value={formatDateTime(transaction.createdAt)} />
        </DetailSection>

        {transaction.note && (
          <DetailSection title="Description">
            <p className="rounded border border-outline-variant bg-surface p-3 font-body-sm text-body-sm text-on-surface-variant">{transaction.note}</p>
          </DetailSection>
        )}

        {transaction.attachments.length > 0 && (
          <DetailSection title="Attachments">
            <div className="space-y-1">
              {transaction.attachments.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-body-sm text-body-sm text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">attachment</span>
                  {url.split("/").pop()}
                </a>
              ))}
            </div>
          </DetailSection>
        )}

        {canWrite && STATUS_ACTIONS[transaction.status].length > 0 && (
          <DetailSection title="Change Status">
            {actionError && <p className="mb-2 font-body-sm text-body-sm text-error">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS[transaction.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => applyStatus(next)}
                  className="rounded border border-outline-variant px-3 py-1.5 font-label-md text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === next ? "Saving…" : `Mark ${STATUS_META[next].label}`}
                </button>
              ))}
            </div>
          </DetailSection>
        )}
      </div>
    </div>
  );
}

function CreateExpenseModal({
  accounts,
  categories,
  onClose,
  onCreated,
}: {
  accounts: ApiFinancialAccount[];
  categories: ApiTransactionCategory[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid = Number.isInteger(Number(amount)) && Number(amount) >= 0 && amount.trim() !== "";

  async function submit() {
    if (!amountValid) {
      setError("Enter a valid amount (whole EGP).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost("/admin/finance/transactions", {
        type: "EXPENSE",
        amount: Number(amount),
        accountId: accountId || null,
        categoryId: categoryId || null,
        note: note.trim() || undefined,
        occurredAt: new Date(occurredAt).getTime(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-lift">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-primary">Add Expense</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && <p className="mb-3 rounded border border-error-container bg-error-container/10 p-2 font-body-sm text-body-sm text-error">{error}</p>}

        <div className="space-y-4">
          <Field label="Amount (EGP)">
            <input
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACCOUNT_TYPE_LABEL[a.type]})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded border border-outline-variant bg-surface px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="rounded bg-primary px-4 py-2 font-label-md text-label-md font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-label-md text-label-md text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 border-t border-surface-container-high pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
      <span className={`font-body-sm text-body-sm font-medium text-on-surface ${mono ? "font-mono-data text-mono-data" : ""}`}>{value}</span>
    </div>
  );
}
