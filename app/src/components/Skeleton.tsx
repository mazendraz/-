/** Base skeleton block — use `className` to size it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-xl ${className}`} aria-hidden="true" />;
}

/**
 * Matches the real `CompanyCard` layout (Companies.tsx, and the same shape at
 * a smaller size on Home.tsx): cover with an overlapping logo badge, title +
 * category, a star/rating row, a 2-line tagline, and a footer row — not the
 * generic "image + text lines + 2 buttons" shape this used to have, which
 * doesn't match anything on the real card (there are no buttons on it at all).
 */
export function CompanyCardSkeleton() {
  return (
    <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom flex flex-col h-full">
      <div className="relative h-44 flex-shrink-0">
        <Skeleton className="absolute inset-0 h-full rounded-none" />
        {/* Overlapping logo badge — same position/size as CompanyCard's real one */}
        <div className="absolute top-5 left-5 rtl:left-auto rtl:right-5 w-14 h-14 rounded-xl border-2 border-white shadow-md overflow-hidden">
          <Skeleton className="w-full h-full rounded-none" />
        </div>
      </div>
      <div className="pt-9 px-5 pb-5 flex-grow flex flex-col">
        <Skeleton className="h-5 w-2/3 mb-2" />
        <Skeleton className="h-3 w-1/3 mb-3" />
        {/* Star / rating row */}
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-full mb-1.5" />
        <Skeleton className="h-3 w-2/3 flex-grow-0" />
        <div className="mt-4 pt-4 border-t border-outline-variant/20 flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
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
