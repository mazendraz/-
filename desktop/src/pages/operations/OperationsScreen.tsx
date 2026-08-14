// Ported from stitch_al_asima_command_center/operations_control_center_2/code.html
// — chrome, KPI-card grid, filter bar and full numbered pagination match that
// mockup; the _1 variant's literal off-palette status hex (#4CAF50/#FFB300/…)
// is replaced with DESIGN.md's actual desaturated tokens (secondary/error/
// on-surface-variant — the palette has no dedicated "success green", so a
// positive/confirmed state reads as `secondary`, same convention
// OverviewPage's <Trend> already uses).
//
// One real screen, reused for three nav destinations (Requests / Active Work
// / Pending Actions) that differ only in which status the table opens
// filtered to — see the mockup's own filter bar, which is exactly this. Price
// Verification / Price Discrepancies (a later stage) are the same table again,
// filtered by verification status instead of lead status.
import { useMemo, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "@/components/states/States";
import { Pagination } from "@/components/shared/Pagination";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ApiLead, ApiLeadStatus, ApiOperationsSummary, ApiPage, ApiVerificationStatus } from "@/lib/apiTypes";

const PAGE_SIZE = 20;

const LEAD_STATUSES: readonly ApiLeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];

const VERIFICATION_LABEL: Record<ApiVerificationStatus, string> = {
  PENDING: "Awaiting Verification",
  CONFIRMED: "Confirmed",
  DISCREPANCY: "Discrepancy",
};

type KpiKey = keyof ApiOperationsSummary;

const KPI_META: Record<KpiKey, { label: string; icon: string; tone: "neutral" | "warning" | "critical" }> = {
  pendingRequests: { label: "Pending Requests", icon: "pending_actions", tone: "neutral" },
  activeServices: { label: "Active Services", icon: "autorenew", tone: "neutral" },
  awaitingVerification: { label: "Awaiting Verification", icon: "verified_user", tone: "warning" },
  discrepancies: { label: "Discrepancies", icon: "error", tone: "critical" },
  overdueFollowUps: { label: "Overdue Follow-ups", icon: "schedule", tone: "warning" },
};

export function OperationsScreen({
  title,
  description,
  defaultStatus,
  defaultVerificationStatus,
  highlightKpi,
}: {
  title: string;
  description: string;
  /** Initial value of the status filter — the user can still change it. */
  defaultStatus?: ApiLeadStatus;
  /** Initial value of the verification filter (Price Verification / Price
   *  Discrepancies) — same table, same "still just a default" contract. */
  defaultVerificationStatus?: ApiVerificationStatus;
  /** Which KPI card(s) this nav destination is "about" — visually emphasized. */
  highlightKpi?: KpiKey[];
}) {
  const [status, setStatus] = useState<ApiLeadStatus | "">(defaultStatus ?? "");
  const [verificationStatus, setVerificationStatus] = useState<ApiVerificationStatus | "">(
    defaultVerificationStatus ?? "",
  );
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiLead | null>(null);
  const search = useDebouncedValue(searchInput, 350);

  const summary = useFetch<ApiOperationsSummary>(() => apiGet<ApiOperationsSummary>("/admin/desktop/leads/summary"), []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (verificationStatus) params.set("verificationStatus", verificationStatus);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [status, verificationStatus, search, page]);

  const list = useFetch<ApiPage<ApiLead>>(() => apiGet<ApiPage<ApiLead>>(`/admin/desktop/leads?${query}`), [query]);

  function resetToPage1<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }
  const handleStatusChange = resetToPage1(setStatus);
  const handleVerificationChange = resetToPage1(setVerificationStatus);
  const handleSearchChange = resetToPage1(setSearchInput);

  return (
    <>
      <PageHeader title={title} description={description} />

      <div className="mb-8 grid grid-cols-2 gap-base md:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(KPI_META) as KpiKey[]).map((key) => (
          <KpiCard
            key={key}
            meta={KPI_META[key]}
            value={summary.data?.[key]}
            loading={summary.loading}
            emphasized={highlightKpi?.includes(key) ?? false}
          />
        ))}
      </div>

      <div className="flex flex-col rounded border border-outline-variant bg-surface-container-lowest">
        <div className="flex flex-wrap items-center gap-4 border-b border-surface-container-high bg-surface-bright p-component-padding-x">
          <span className="flex items-center font-label-md text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined mr-1 align-middle text-[16px]">filter_list</span>
            Filters
          </span>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as ApiLeadStatus | "")}
              className="cursor-pointer appearance-none rounded border border-outline-variant bg-surface px-3 py-1.5 pr-8 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-outline">
              arrow_drop_down
            </span>
          </div>
          <div className="relative">
            <select
              value={verificationStatus}
              onChange={(e) => handleVerificationChange(e.target.value as ApiVerificationStatus | "")}
              className="cursor-pointer appearance-none rounded border border-outline-variant bg-surface px-3 py-1.5 pr-8 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Verification</option>
              {(Object.keys(VERIFICATION_LABEL) as ApiVerificationStatus[]).map((v) => (
                <option key={v} value={v}>
                  {VERIFICATION_LABEL[v]}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-outline">
              arrow_drop_down
            </span>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
              search
            </span>
            <input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search ref, client, phone, service…"
              className="w-72 rounded border border-outline-variant bg-surface py-1.5 pl-9 pr-3 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {list.loading && <LoadingState label="Loading requests…" />}
        {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.refetch} />}
        {!list.loading && !list.error && list.data && list.data.data.length === 0 && (
          <EmptyState icon="inbox" title="No requests match these filters" message="Try a different status or search term." />
        )}
        {!list.loading && !list.error && list.data && list.data.data.length > 0 && (
          <>
            <RequestsTable rows={list.data.data} onSelect={setSelected} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.meta.total} onPageChange={setPage} />
          </>
        )}
      </div>

      {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function KpiCard({
  meta,
  value,
  loading,
  emphasized,
}: {
  meta: { label: string; icon: string; tone: "neutral" | "warning" | "critical" };
  value: number | undefined;
  loading: boolean;
  emphasized: boolean;
}) {
  const toneText = meta.tone === "critical" ? "text-error" : meta.tone === "warning" ? "text-secondary" : "text-primary";
  const iconTone = meta.tone === "critical" ? "text-error" : "text-outline";
  return (
    <div
      className={`rounded border p-component-padding-x transition-shadow hover:shadow-lift ${
        emphasized ? "border-primary/30 bg-primary/5" : "border-outline-variant bg-surface-container-lowest"
      }`}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="font-label-md text-label-md uppercase text-on-surface-variant">{meta.label}</span>
        <span className={`material-symbols-outlined text-[18px] ${iconTone}`}>{meta.icon}</span>
      </div>
      <div className={`font-display-lg text-display-lg tabular-nums ${toneText}`}>
        {loading || value === undefined ? "—" : value}
      </div>
    </div>
  );
}

const STATUS_META: Record<ApiLeadStatus, { dot: string; classes: string }> = {
  New: { dot: "bg-outline", classes: "bg-surface-container text-on-surface-variant border-outline-variant" },
  Contacted: {
    dot: "bg-secondary",
    classes: "bg-secondary-container/30 text-on-secondary-container border-secondary-container",
  },
  "In Progress": { dot: "bg-primary", classes: "bg-primary/5 text-primary border-primary/20" },
  Completed: { dot: "bg-secondary", classes: "bg-secondary/10 text-secondary border-secondary/20" },
  Cancelled: {
    dot: "bg-outline",
    classes: "bg-surface-container text-on-surface-variant border-outline-variant opacity-70",
  },
};

function StatusBadge({ status }: { status: ApiLeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.classes}`}
    >
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {status}
    </span>
  );
}

/** Icon + tone for the Verification column — driven entirely by
 *  ApiLeadCompletion.verificationStatus (absent completion = not yet
 *  submitted). Neutral language only, per the product requirement: this is
 *  status iconography, never a "fraud" accusation. */
function VerificationIcon({ lead }: { lead: ApiLead }) {
  if (!lead.completion) {
    return (
      <span className="material-symbols-outlined text-[18px] text-outline" title="Not yet completed">
        hourglass_empty
      </span>
    );
  }
  const v = lead.completion.verificationStatus;
  if (v === "PENDING") {
    return (
      <span className="material-symbols-outlined text-[18px] text-secondary" title="Awaiting client verification">
        hourglass_top
      </span>
    );
  }
  if (v === "DISCREPANCY") {
    return (
      <span className="material-symbols-outlined text-[18px] text-error" title="Price discrepancy reported">
        cancel
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined text-[18px] text-secondary" title="Confirmed by client">
      check_circle
    </span>
  );
}

function estimatedPriceLabel(lead: ApiLead): string {
  if (lead.estimatedMin != null && lead.estimatedMax != null) {
    return lead.estimatedMin === lead.estimatedMax
      ? formatCurrency(lead.estimatedMin)
      : `${formatCurrency(lead.estimatedMin)} – ${formatCurrency(lead.estimatedMax)}`;
  }
  return lead.budget?.trim() ? lead.budget : "—";
}

function finalPriceLabel(lead: ApiLead): { text: string; isDiscrepancy: boolean } {
  const c = lead.completion;
  if (!c) return { text: "—", isDiscrepancy: false };
  if (c.verificationStatus === "PENDING") return { text: formatCurrency(c.finalTotal), isDiscrepancy: false };
  const amount = c.clientAmount ?? c.finalTotal;
  return { text: formatCurrency(amount), isDiscrepancy: c.verificationStatus === "DISCREPANCY" };
}

function RequestsTable({ rows, onSelect }: { rows: ApiLead[]; onSelect: (lead: ApiLead) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-surface-container-low font-label-md text-label-md uppercase text-on-surface-variant">
          <tr>
            <th className="w-24 border-b border-surface-container-high px-4 py-3 font-semibold">Req ID</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Client</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Provider</th>
            <th className="border-b border-surface-container-high px-4 py-3 font-semibold">Service</th>
            <th className="w-28 border-b border-surface-container-high px-4 py-3 font-semibold">Status</th>
            <th className="w-32 border-b border-surface-container-high px-4 py-3 text-right font-semibold">Est. Price</th>
            <th className="w-32 border-b border-surface-container-high px-4 py-3 text-right font-semibold">Final Price</th>
            <th className="w-28 border-b border-surface-container-high px-4 py-3 text-center font-semibold">Verification</th>
            <th className="w-36 border-b border-surface-container-high px-4 py-3 text-right font-semibold">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-high bg-surface-container-lowest font-body-sm text-body-sm text-on-surface">
          {rows.map((lead) => {
            const final = finalPriceLabel(lead);
            return (
              <tr
                key={lead.id}
                onClick={() => onSelect(lead)}
                className={`group cursor-pointer transition-colors hover:bg-surface-bright ${
                  final.isDiscrepancy ? "bg-error-container/10" : ""
                }`}
              >
                <td className="px-4 py-3 font-mono-data text-mono-data text-on-surface-variant group-hover:text-primary">
                  {lead.refNumber}
                </td>
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="px-4 py-3 text-on-surface-variant">{lead.companyName}</td>
                <td className="px-4 py-3">{lead.service}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{estimatedPriceLabel(lead)}</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    final.isDiscrepancy ? "font-medium text-error" : "text-on-surface-variant"
                  }`}
                >
                  {final.text}
                </td>
                <td className="px-4 py-3 text-center">
                  <VerificationIcon lead={lead} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-on-surface-variant">{formatDateTime(lead.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Row-click detail view. Renders entirely from the row's already-fetched
 *  ApiLead — no second network round-trip just to open a drawer. */
function LeadDrawer({ lead, onClose }: { lead: ApiLead; onClose: () => void }) {
  const final = finalPriceLabel(lead);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-on-background/40"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-6 shadow-lift">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-mono-data text-mono-data text-on-surface-variant">{lead.refNumber}</p>
            <h2 className="font-headline-sm text-headline-sm text-primary">{lead.service}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-6">
          <StatusBadge status={lead.status} />
        </div>

        <DetailSection title="Client">
          <DetailRow label="Name" value={lead.name} />
          <DetailRow label="Phone" value={lead.phone} />
          <DetailRow label="District" value={lead.district} />
        </DetailSection>

        <DetailSection title="Request">
          <DetailRow label="Provider" value={lead.companyName} />
          <DetailRow label="Estimated" value={estimatedPriceLabel(lead)} />
          <DetailRow label="Submitted" value={formatDateTime(lead.createdAt)} />
          {lead.description && (
            <p className="mt-2 rounded border border-outline-variant bg-surface p-3 font-body-sm text-body-sm text-on-surface-variant">
              {lead.description}
            </p>
          )}
        </DetailSection>

        {lead.items && lead.items.length > 0 && (
          <DetailSection title="Line Items">
            {lead.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-1 font-body-sm text-body-sm">
                <span className="text-on-surface">
                  {item.nameSnapshot} {item.tierLabel ? `(${item.tierLabel})` : ""} × {item.qty}
                </span>
                <span className="tabular-nums text-on-surface-variant">
                  {item.lineMin != null && item.lineMax != null
                    ? item.lineMin === item.lineMax
                      ? formatCurrency(item.lineMin)
                      : `${formatCurrency(item.lineMin)} – ${formatCurrency(item.lineMax)}`
                    : "On inspection"}
                </span>
              </div>
            ))}
          </DetailSection>
        )}

        {lead.completion && (
          <DetailSection title="Completion">
            <DetailRow label="Provider reported" value={formatCurrency(lead.completion.providerAmount)} />
            {lead.completion.additionalWorkAmount != null && (
              <DetailRow
                label={lead.completion.additionalWorkDescription ?? "Additional work"}
                value={formatCurrency(lead.completion.additionalWorkAmount)}
              />
            )}
            <DetailRow label="Total" value={formatCurrency(lead.completion.finalTotal)} />
            <DetailRow label="Submitted" value={formatDateTime(lead.completion.submittedAt)} />
          </DetailSection>
        )}

        {lead.completion && lead.completion.verificationStatus !== "PENDING" && (
          <DetailSection title="Price Verification">
            <div className="mb-2 flex items-center gap-2">
              <VerificationIcon lead={lead} />
              <span className={`font-body-sm text-body-sm font-medium ${final.isDiscrepancy ? "text-error" : "text-secondary"}`}>
                {final.isDiscrepancy ? "Price discrepancy — needs review" : "Confirmed by client"}
              </span>
            </div>
            {lead.completion.clientAmount != null && (
              <DetailRow label="Client-reported amount" value={formatCurrency(lead.completion.clientAmount)} />
            )}
            {lead.completion.discrepancyNote && (
              <p className="mt-2 rounded border border-error-container bg-error-container/10 p-3 font-body-sm text-body-sm text-on-surface">
                {lead.completion.discrepancyNote}
              </p>
            )}
            {lead.completion.verifiedAt != null && <DetailRow label="Verified" value={formatDateTime(lead.completion.verifiedAt)} />}
          </DetailSection>
        )}
      </div>
    </div>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="font-body-sm text-body-sm text-on-surface-variant">{label}</span>
      <span className="font-body-sm text-body-sm font-medium text-on-surface">{value}</span>
    </div>
  );
}
