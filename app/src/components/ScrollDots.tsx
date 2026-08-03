/** Small dot row showing scroll position within a `.mobile-scroll` sibling —
 *  decorative only (aria-hidden), mobile-only by convention (md:hidden at the
 *  call site), see hooks/useScrollDots.ts. */
export default function ScrollDots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 mt-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-[width,background-color] duration-base ${
            i === active ? "w-5 bg-primary" : "w-1.5 bg-outline-variant"
          }`}
        />
      ))}
    </div>
  );
}
