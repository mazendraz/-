// Full numbered pagination — matches the operations_control_center_2 /
// financial_command_center mockups' pattern (as opposed to the simple
// prev/next in the _1 variants), reusable across every paginated table the
// desktop app builds (Operations, Clients, Providers, Finance, ...).
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Always show first, last, current ± 1, collapsing the rest into "…".
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);

  return (
    <div className="flex items-center justify-between border-t border-surface-container-high bg-surface-container-lowest p-4">
      <div className="font-body-sm text-body-sm text-on-surface-variant">
        Showing <span className="font-medium text-primary">{from}</span> to{" "}
        <span className="font-medium text-primary">{to}</span> of{" "}
        <span className="font-medium text-primary">{total}</span> entries
      </div>
      <div className="flex space-x-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-outline-variant px-2 py-1 text-outline transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined align-middle text-[18px]">chevron_left</span>
        </button>
        {sorted.map((p, i) => {
          const prev = sorted[i - 1];
          const gap = prev !== undefined && p - prev > 1;
          return (
            <span key={p} className="flex items-center">
              {gap && <span className="px-2 py-1 text-on-surface-variant">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                className={`rounded border px-3 py-1 font-body-sm text-body-sm transition-colors ${
                  p === page
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                }`}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-outline-variant px-2 py-1 text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined align-middle text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
}
