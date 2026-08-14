import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

/** The persistent frame every authenticated screen renders inside: fixed
 *  Sidebar + Header (see the mockups' `ml-64 pt-24` main content offset),
 *  scrollable content below. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main className="ml-64 min-h-screen pt-16">
        <div className="mx-auto max-w-canvas px-container-margin pb-section-gap pt-8">{children}</div>
      </main>
    </div>
  );
}

/** Standard page heading — title + optional description/actions, matching
 *  the mockup's "Good morning, Mazen" header block treatment scaled down for
 *  interior pages. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
        {description && <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
