/** Base skeleton block — use `className` to size it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-xl ${className}`} aria-hidden="true" />;
}

/** Matches the shape of a company card on the Companies / ServiceCategory pages. */
export function CompanyCardSkeleton() {
  return (
    <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
      <Skeleton className="h-44 rounded-none" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </div>
  );
}

/** Matches the hero header area of a list page (Services / Companies). */
export function PageHeaderSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}
