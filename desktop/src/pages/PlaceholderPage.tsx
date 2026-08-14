// Every nav item routes to a real page — even ones whose module hasn't been
// built yet get a real (not 404) screen saying so, per the shell requirement
// that every real screen render loading/empty/error states instead of a
// blank page. This is that placeholder — swapped for the real screen stage
// by stage per the implementation order in the brief.
import { PageHeader } from "@/components/shell/AppShell";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant text-center">
        <span className="material-symbols-outlined text-on-surface-variant text-[28px]">construction</span>
        <p className="font-body-md text-body-md text-on-surface">This module hasn&apos;t been built yet</p>
        <p className="max-w-sm font-body-sm text-body-sm text-on-surface-variant">
          {title} is on the implementation roadmap — it isn&apos;t live in the Business Control Center yet.
        </p>
      </div>
    </>
  );
}
