// Shared loading/error/empty states — every real screen uses one of these
// instead of an unstyled blank area. Kept in the DESIGN.md visual language
// (1px borders, tonal layering, no heavy shadows).
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-on-surface-variant">
      <span className="material-symbols-outlined animate-spin text-[28px]">progress_activity</span>
      <p className="font-body-sm text-body-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong loading this data.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-error-container bg-error-container/10 px-6 text-center">
      <span className="material-symbols-outlined text-error text-[28px]">error</span>
      <p className="font-body-sm text-body-sm text-on-surface">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-primary px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary hover:text-on-primary"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title = "Nothing here yet",
  message,
}: {
  icon?: string;
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant text-center">
      <span className="material-symbols-outlined text-on-surface-variant text-[28px]">{icon}</span>
      <p className="font-body-md text-body-md text-on-surface">{title}</p>
      {message && <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">{message}</p>}
    </div>
  );
}

/** No rows for the currently-selected period — distinct from EmptyState
 *  (which means "there is nothing at all") because the fix here is "widen
 *  the date range", not "go create some data". */
export function NoDataForPeriod({ onWiden }: { onWiden?: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-outline-variant text-center">
      <span className="material-symbols-outlined text-on-surface-variant text-[28px]">event_busy</span>
      <p className="font-body-md text-body-md text-on-surface">No data for the selected period</p>
      {onWiden && (
        <button
          type="button"
          onClick={onWiden}
          className="font-label-md text-label-md text-primary underline underline-offset-2"
        >
          Try a wider range
        </button>
      )}
    </div>
  );
}
