/** In-flight state — visually distinct from EmptyState (CMP-02): a spinner,
 * never the "no results" icon, so a still-loading list can't be read as
 * "nothing found" while data is on the way. */
export function Loading({ msg }: { msg: string }) {
  return (
    <div className="text-center py-14 px-6">
      <span className="spinner spinner-primary mx-auto mb-3 block" />
      <p className="text-body text-outline max-w-sm mx-auto">{msg}</p>
    </div>
  );
}
